import { LLMClient } from './llmClient';
import { DatabaseManager } from './database';
import { Band, Session, Comparison, Recommendation, ComparisonPair } from './types';
import { STATIC_BANDS } from './staticBands';

export class RecommendationEngine {
  private llmClient: LLMClient;
  private db: DatabaseManager;
  private maxComparisons: number;
  private maxRecommendations: number;

  constructor(llmClient: LLMClient, db: DatabaseManager, maxComparisons: number, maxRecommendations: number) {
    this.llmClient = llmClient;
    this.db = db;
    this.maxComparisons = maxComparisons;
    this.maxRecommendations = maxRecommendations;
  }

  async getGenres(): Promise<string[]> {
    return [
      'thrash',
      'death',
      'black',
      'power',
      'doom',
      'progressive',
      'heavy',
      'speed',
      'groove',
      'folk'
    ];
  }

  async startSession(genre: string): Promise<Session> {
    const sessionId = this.generateSessionId();
    const session: Session = {
      id: sessionId,
      genre: genre,
      comparisonHistory: [],
      preferenceWeights: {},
      seenBands: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.db.createSession(session);

    // Populate genre bands from local static data (non-blocking)
    this.populateGenreBands(genre).catch(error => {
      console.error(`Error populating bands for genre ${genre}:`, error);
    });

    return session;
  }

  async getComparisonPair(sessionId: string): Promise<ComparisonPair | null> {
    const session = this.db.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const bands = this.db.getBandsByGenre(session.genre);
    if (bands.length < 2) {
      await this.populateGenreBands(session.genre);
      const updatedBands = this.db.getBandsByGenre(session.genre);
      if (updatedBands.length < 2) {
        throw new Error('Not enough bands available for comparison');
      }
      return this.selectRandomPair(updatedBands, session.comparisonHistory);
    }

    // Use random selection that avoids previous pairs
    return this.selectRandomPair(bands, session.comparisonHistory);
  }

  async recordPreference(sessionId: string, bandId1: string, bandId2: string, selectedBandId: string): Promise<void> {
    const session = this.db.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const comparison: Comparison = {
      bandId1,
      bandId2,
      selectedBandId,
      timestamp: new Date()
    };

    session.comparisonHistory.push(comparison);

    // Track seen bands
    if (!session.seenBands.includes(bandId1)) {
      session.seenBands.push(bandId1);
    }
    if (!session.seenBands.includes(bandId2)) {
      session.seenBands.push(bandId2);
    }

    // Update preference weights
    const selectedBand = this.db.getBand(selectedBandId);
    const otherBandId = bandId1 === selectedBandId ? bandId2 : bandId1;
    const otherBand = this.db.getBand(otherBandId);

    if (selectedBand && otherBand) {
      selectedBand.genre.forEach(g => {
        session.preferenceWeights[g] = (session.preferenceWeights[g] || 0) + 1;
      });
    }

    session.updatedAt = new Date();
    this.db.updateSession(session);
  }

  async skipComparison(sessionId: string, bandId1: string, bandId2: string): Promise<void> {
    const session = this.db.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Track seen bands even when skipping
    if (!session.seenBands.includes(bandId1)) {
      session.seenBands.push(bandId1);
    }
    if (!session.seenBands.includes(bandId2)) {
      session.seenBands.push(bandId2);
    }

    // Don't update preference weights when skipping
    session.updatedAt = new Date();
    this.db.updateSession(session);
  }

  async getRealTimeSuggestions(sessionId: string, numSuggestions: number = 3): Promise<Recommendation[]> {
    const session = this.db.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const suggestions: Recommendation[] = [];
    const allBands = this.db.getBandsByGenre(session.genre);

    // Get all band IDs that have been compared
    const comparedBandIds = new Set<string>();
    session.comparisonHistory.forEach(comp => {
      comparedBandIds.add(comp.bandId1);
      comparedBandIds.add(comp.bandId2);
    });

    // Sort bands by preference weights (higher weight first), excluding compared bands
    const sortedBands = allBands
      .filter(b => !comparedBandIds.has(b.id))
      .sort((a, b) => {
        const scoreA = a.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
        const scoreB = b.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
        return scoreB - scoreA;
      });

    // Get top suggestions
    const topBands = sortedBands.slice(0, numSuggestions);

    topBands.forEach(band => {
      const score = band.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
      const confidence = Math.min(0.9, 0.5 + (score * 0.1));

      suggestions.push({
        band,
        reason: score > 0 ? 'Based on your genre preferences' : 'Popular band in this genre',
        confidence
      });
    });

    return suggestions;
  }

  async getRecommendations(sessionId: string): Promise<Recommendation[]> {
    const session = this.db.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const recommendations: Recommendation[] = [];
    const allBands = this.db.getBandsByGenre(session.genre);

    // Get all band IDs that have been compared
    const comparedBandIds = new Set<string>();
    session.comparisonHistory.forEach(comp => {
      comparedBandIds.add(comp.bandId1);
      comparedBandIds.add(comp.bandId2);
    });

    // Sort bands by preference weights (higher weight first), excluding compared bands
    const sortedBands = allBands
      .filter(b => !comparedBandIds.has(b.id))
      .sort((a, b) => {
        const scoreA = a.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
        const scoreB = b.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
        return scoreB - scoreA;
      });

    // Get top recommendations
    const topBands = sortedBands.slice(0, this.maxRecommendations);

    topBands.forEach(band => {
      const score = band.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
      const confidence = Math.min(0.95, 0.6 + (score * 0.15));

      recommendations.push({
        band,
        reason: score > 0 ? 'Based on your comparison preferences' : 'Top rated band in this genre',
        confidence
      });
    });

    return recommendations;
  }

  private async populateGenreBands(genre: string): Promise<void> {
    const existingBands = this.db.getBandsByGenre(genre);

    // First, try to get static bands from local data
    if (STATIC_BANDS[genre]) {
      const staticBands = STATIC_BANDS[genre];
      const staticBandNames = new Set(existingBands.map(b => b.name));
      let bands: Band[] = [];

      for (const staticBand of staticBands) {
        if (!staticBandNames.has(staticBand.name)) {
          bands.push(staticBand);
        }
      }

      // Add bands to database
      for (const band of bands) {
        this.db.createBand(band);
      }

      console.log(`Added ${bands.length} local bands for genre ${genre} (total: ${existingBands.length + bands.length})`);
      return;
    }

    console.log(`No local static bands found for genre ${genre}`);
  }

  private selectRandomPair(bands: Band[], comparisonHistory: Comparison[] = []): ComparisonPair {
    // Get all previous pairs as Set for quick lookup
    const previousPairs = new Set(
      comparisonHistory.map((c: Comparison) => {
        const pair = [c.bandId1, c.bandId2].sort();
        return pair.join('|');
      })
    );

    // Try to find a new pair that hasn't been compared before
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const shuffled = [...bands].sort(() => Math.random() - 0.5);
      const band1 = shuffled[0];
      const band2 = shuffled[1];

      // Make sure we're comparing two different bands
      if (band1.id !== band2.id) {
        const pairKey = [band1.id, band2.id].sort().join('|');

        // Check if this pair has been compared before
        if (!previousPairs.has(pairKey)) {
          return { band1, band2 };
        }
      }

      attempts++;
    }

    // If we couldn't find a new pair after max attempts, return a random pair anyway
    // (this shouldn't happen with enough bands in the database)
    const shuffled = [...bands].sort(() => Math.random() - 0.5);
    return {
      band1: shuffled[0],
      band2: shuffled[1]
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBandId(name: string): string {
    return `band_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  }
}