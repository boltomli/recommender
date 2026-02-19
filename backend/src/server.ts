import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config';
import { LLMClient } from './llmClient';
import { dbManager, IDatabase } from './database';
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

// Initialize components (will be set up in start())
let db: IDatabase;
let engine: RecommendationEngine;
let exporter: DataExporter;
let importer: DataImporter;
let batchGenerator: BatchRecommendationGenerator;

// Health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString(), database: dbManager.getType() };
});

// Get available genres
fastify.get('/api/genres', async (request, reply) => {
  try {
    const result = await engine.getGenres();
    return result;
  } catch (error) {
    reply.code(500).send({ error: 'Failed to get genres' });
  }
});

// Start a new session
fastify.post('/api/session', async (request, reply) => {
  try {
    const { genre, llmConfig } = request.body as { genre: string; llmConfig?: { endpoint: string; apiKey?: string; model?: string } };
    if (!genre) {
      reply.code(400).send({ error: 'Genre is required' });
      return;
    }

    fastify.log.info(`Creating session for genre: ${genre}${llmConfig ? ' (with user LLM config)' : ''}`);
    const session = await engine.startSession(genre, llmConfig);
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

// Proxy LLM requests (for testing connection to local LLMs without CORS)
fastify.post('/api/proxy/llm', async (request, reply) => {
  try {
    const { endpoint, apiKey, model, messages, temperature, max_tokens, apiType } = request.body as {
      endpoint: string;
      apiKey?: string;
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
      max_tokens?: number;
      apiType?: 'openai' | 'anthropic';
    };

    if (!endpoint) {
      reply.code(400).send({ error: 'Endpoint is required' });
      return;
    }

    const isAnthropic = apiType === 'anthropic';

    // Build headers based on API type
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      if (isAnthropic) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    // Build target URL and request body based on API type
    let targetUrl: string;
    let requestBody: unknown;

    if (isAnthropic) {
      // Anthropic API format
      targetUrl = endpoint.endsWith('/v1/messages') 
        ? endpoint 
        : `${endpoint}/v1/messages`;
      
      // Convert OpenAI message format to Anthropic format
      const systemMessage = messages.find(m => m.role === 'system')?.content || '';
      const userMessages = messages.filter(m => m.role !== 'system');
      
      requestBody = {
        model: model || 'claude-3-sonnet-20240229',
        max_tokens: max_tokens ?? 1024,
        temperature: temperature ?? 0.7,
        system: systemMessage,
        messages: userMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      };
    } else {
      // OpenAI-compatible API format
      if (endpoint.endsWith('/chat/completions')) {
        targetUrl = endpoint;
      } else if (endpoint.endsWith('/v1')) {
        targetUrl = `${endpoint}/chat/completions`;
      } else {
        targetUrl = `${endpoint}/v1/chat/completions`;
      }
      
      requestBody = {
        model: model || 'default',
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 2048,
      };
    }
    
    fastify.log.info(`Proxying LLM request to: ${targetUrl} (type: ${apiType || 'openai'})`);

    // Forward request to LLM
    let response;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (fetchError) {
      // Handle connection errors (e.g., server not running)
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      fastify.log.error(`Failed to connect to LLM server at ${targetUrl}: ${errorMessage}`);
      
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
        reply.code(503).send({
          error: 'Cannot connect to LLM server',
          details: `Unable to connect to ${endpoint}. Please check:\n` +
                   `- The LLM server is running\n` +
                   `- The URL is correct\n` +
                   `- Network connectivity to the server`,
        });
        return;
      }
      
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      fastify.log.error(`LLM API error: ${response.status} ${response.statusText} - ${errorText}`);
      reply.code(response.status).send({
        error: `LLM API error: ${response.status} ${response.statusText}`,
        details: errorText,
      });
      return;
    }

    // Convert Anthropic response to OpenAI format for consistency
    const data = await response.json() as Record<string, unknown>;
    
    if (isAnthropic) {
      // Convert Anthropic response to OpenAI-compatible format
      const content = (data.content as Array<{text?: string}>)?.[0]?.text 
        || (data.completion as string) 
        || '';
      return {
        choices: [{
          message: {
            role: 'assistant',
            content,
          },
        }],
        model: data.model,
        usage: data.usage,
      };
    }

    return data;
  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      error: 'Failed to proxy LLM request',
      details: error instanceof Error ? error.message : String(error),
    });
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
    // Initialize database with fallback
    db = await dbManager.initialize();
    console.log(`数据库类型: ${dbManager.getType()}`);

    // Initialize components
    const llmClient = new LLMClient(config.llm);
    engine = new RecommendationEngine(
      llmClient,
      db,
      config.app.maxComparisons,
      config.app.maxRecommendations
    );
    exporter = new DataExporter(db);
    importer = new DataImporter(llmClient, db);
    batchGenerator = new BatchRecommendationGenerator(db);

    const port = process.env.PORT || 3001;
    await fastify.listen({ port: port as number, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
