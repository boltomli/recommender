import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config';
import { LLMClient } from './llmClient';
import { DatabaseManager } from './database';
import { RecommendationEngine } from './recommendationEngine';
import { DataExporter } from './exportData';
import { DataImporter } from './importData';
import { BatchRecommendationGenerator } from './batchRecommendations';

const fastify = Fastify({
  logger: true
});

// Load configuration
const config = loadConfig();

// Register CORS
fastify.register(cors, {
  origin: true
});

// Initialize components
const llmClient = new LLMClient(config.llm);
const db = new DatabaseManager(config.database.path);
const engine = new RecommendationEngine(
  llmClient,
  db,
  config.app.maxComparisons,
  config.app.maxRecommendations
);
const exporter = new DataExporter(db);
const importer = new DataImporter(llmClient, db);
const batchGenerator = new BatchRecommendationGenerator(db);

// Health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Get available genres
fastify.get('/api/genres', async (request, reply) => {
  try {
    const genres = await engine.getGenres();
    return { genres };
  } catch (error) {
    reply.code(500).send({ error: 'Failed to get genres' });
  }
});

// Start a new session
fastify.post('/api/session', async (request, reply) => {
  try {
    const { genre } = request.body as { genre: string };
    if (!genre) {
      reply.code(400).send({ error: 'Genre is required' });
      return;
    }

    fastify.log.info(`Creating session for genre: ${genre}`);
    const session = await engine.startSession(genre);
    fastify.log.info(`Session created successfully: ${session.id}`);
    return { sessionId: session.id };
  } catch (error) {
    fastify.log.error({ error }, 'Failed to create session');
    reply.code(500).send({ error: 'Failed to create session', details: error instanceof Error ? error.message : String(error) });
  }
});

// Get comparison pair
fastify.get('/api/comparison', async (request, reply) => {
  try {
    const { sessionId } = request.query as { sessionId: string };
    if (!sessionId) {
      reply.code(400).send({ error: 'Session ID is required' });
      return;
    }

    const pair = await engine.getComparisonPair(sessionId);
    if (!pair) {
      return { done: true };
    }

    return {
      band1: {
        id: pair.band1.id,
        name: pair.band1.name,
        genre: pair.band1.genre,
        era: pair.band1.era,
        albums: pair.band1.albums,
        description: pair.band1.description,
        styleNotes: pair.band1.styleNotes
      },
      band2: {
        id: pair.band2.id,
        name: pair.band2.name,
        genre: pair.band2.genre,
        era: pair.band2.era,
        albums: pair.band2.albums,
        description: pair.band2.description,
        styleNotes: pair.band2.styleNotes
      }
    };
  } catch (error) {
    reply.code(500).send({ error: 'Failed to get comparison pair' });
  }
});

// Submit preference
fastify.post('/api/preference', async (request, reply) => {
  try {
    const { sessionId, bandId1, bandId2, selectedBandId } = request.body as {
      sessionId: string;
      bandId1: string;
      bandId2: string;
      selectedBandId: string;
    };

    if (!sessionId || !bandId1 || !bandId2 || !selectedBandId) {
      reply.code(400).send({ error: 'Missing required fields' });
      return;
    }

    await engine.recordPreference(sessionId, bandId1, bandId2, selectedBandId);
    return { success: true };
  } catch (error) {
    reply.code(500).send({ error: 'Failed to record preference' });
  }
});

// Skip comparison
fastify.post('/api/skip', async (request, reply) => {
  try {
    const { sessionId, bandId1, bandId2 } = request.body as {
      sessionId: string;
      bandId1: string;
      bandId2: string;
    };

    if (!sessionId || !bandId1 || !bandId2) {
      reply.code(400).send({ error: 'Missing required fields' });
      return;
    }

    await engine.skipComparison(sessionId, bandId1, bandId2);
    return { success: true };
  } catch (error) {
    reply.code(500).send({ error: 'Failed to skip comparison' });
  }
});

// Get real-time suggestions
fastify.get('/api/suggestions', async (request, reply) => {
  try {
    const { sessionId, count } = request.query as { sessionId: string; count?: string };
    if (!sessionId) {
      reply.code(400).send({ error: 'Session ID is required' });
      return;
    }

    const numSuggestions = count ? parseInt(count, 10) : 3;
    const suggestions = await engine.getRealTimeSuggestions(sessionId, numSuggestions);
    return {
      suggestions: suggestions.map(s => ({
        band: {
          id: s.band.id,
          name: s.band.name,
          genre: s.band.genre,
          era: s.band.era,
          albums: s.band.albums,
          description: s.band.description,
          styleNotes: s.band.styleNotes
        },
        reason: s.reason,
        confidence: s.confidence
      }))
    };
  } catch (error) {
    reply.code(500).send({ error: 'Failed to get suggestions' });
  }
});

// Get recommendations
fastify.get('/api/recommendations', async (request, reply) => {
  try {
    const { sessionId } = request.query as { sessionId: string };
    if (!sessionId) {
      reply.code(400).send({ error: 'Session ID is required' });
      return;
    }

    const recommendations = await engine.getRecommendations(sessionId);
    return {
      recommendations: recommendations.map(r => ({
        band: {
          id: r.band.id,
          name: r.band.name,
          genre: r.band.genre,
          era: r.band.era,
          albums: r.band.albums,
          description: r.band.description,
          styleNotes: r.band.styleNotes
        },
        reason: r.reason,
        confidence: r.confidence
      }))
    };
  } catch (error) {
    reply.code(500).send({ error: 'Failed to get recommendations' });
  }
});

// Export all data
fastify.get('/api/export', async (request, reply) => {
  try {
    const { includeRecommendations } = request.query as { includeRecommendations?: string };
    const data = await exporter.exportAll({
      includeRecommendations: includeRecommendations === 'true'
    });
    return data;
  } catch (error) {
    reply.code(500).send({ error: 'Failed to export data' });
  }
});

// Export genres only
fastify.get('/api/export/genres', async (request, reply) => {
  try {
    const genres = await exporter.exportGenres();
    return { genres };
  } catch (error) {
    reply.code(500).send({ error: 'Failed to export genres' });
  }
});

// Export bands only
fastify.get('/api/export/bands', async (request, reply) => {
  try {
    const bands = await exporter.exportBands();
    return { bands };
  } catch (error) {
    reply.code(500).send({ error: 'Failed to export bands' });
  }
});

// Export recommendations only
fastify.get('/api/export/recommendations', async (request, reply) => {
  try {
    const recommendations = await exporter.exportRecommendations();
    return { recommendations };
  } catch (error) {
    reply.code(500).send({ error: 'Failed to export recommendations' });
  }
});

// Import bands from LLM
fastify.post('/api/import/llm', async (request, reply) => {
  try {
    const { genre, count } = request.body as { genre?: string; count?: number };

    const result = await importer.importFromLLM({
      genre,
      count
    });

    if (result.success) {
      return result;
    } else {
      reply.code(500).send(result);
    }
  } catch (error) {
    reply.code(500).send({
      success: false,
      imported: 0,
      skipped: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    });
  }
});

// Generate batch recommendations
fastify.post('/api/recommendations/generate', async (request, reply) => {
  try {
    const { genre } = request.body as { genre?: string };

    let recommendations;
    if (genre) {
      recommendations = await batchGenerator.generateForGenre(genre);
      return { genre, recommendations };
    } else {
      recommendations = await batchGenerator.generateForAllGenres();
      return { recommendations };
    }
  } catch (error) {
    reply.code(500).send({ error: 'Failed to generate recommendations' });
  }
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3001;
    await fastify.listen({ port: port as number, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();