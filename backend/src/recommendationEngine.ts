import { LLMClient } from './llmClient';
import { DatabaseManager } from './database';
import { Band, Session, Comparison, Recommendation, ComparisonPair } from './types';
import { STATIC_BANDS } from './staticBands';
import { getConfig } from './config';

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

  async getGenres(): Promise<{ genres: string[]; counts: Record<string, number> }> {
    const config = getConfig();
    const minBandsPerGenre = config.expandGenres.minBandsForGenre || 30;

    const allBands = this.db.getAllBands();
    const genreCounts: Record<string, number> = {};

    allBands.forEach(band => {
      const genres = Array.isArray(band.genre) ? band.genre : [band.genre];
      genres.forEach((g: string) => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });

    const filteredGenres = Object.keys(genreCounts)
      .filter(genre => genreCounts[genre] >= minBandsPerGenre)
      .sort();

    return {
      genres: filteredGenres,
      counts: genreCounts
    };
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
      return this.selectTieredPair(session.genre, session.comparisonHistory);
    }

    // Use tiered selection that prioritizes well-known bands
    return this.selectTieredPair(session.genre, session.comparisonHistory);
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

    // Calculate preference scores for all bands
    const bandScores = allBands
      .filter(b => !comparedBandIds.has(b.id))
      .map(band => ({
        band,
        score: band.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0)
      }))
      .sort((a, b) => b.score - a.score);

    // Take top numSuggestions bands
    const selectedBands = bandScores.slice(0, numSuggestions);

    // Generate suggestions with tier-based confidence scores
    selectedBands.forEach(({ band, score }) => {
      // Base confidence from preference score
      let confidence = 0.5 + (score * 0.1);

      // Add tier bonus
      if (band.tier === 'well-known') {
        confidence += 0.05;
      } else if (band.tier === 'popular') {
        confidence += 0.02;
      }

      // Cap confidence at 0.9
      confidence = Math.min(0.9, confidence);

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

    // Calculate preference scores for all bands
    const bandScores = allBands
      .filter(b => !comparedBandIds.has(b.id))
      .map(band => ({
        band,
        score: band.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0)
      }))
      .sort((a, b) => b.score - a.score);

    // Separate bands by tier
    const tier1Bands = bandScores.filter(bs => bs.band.tier === 'well-known');
    const tier2Bands = bandScores.filter(bs => bs.band.tier === 'popular');
    const tier3Bands = bandScores.filter(bs => bs.band.tier === 'niche');

    // Ensure tier diversity in recommendations
    const selectedBands: Array<{ band: Band; score: number }> = [];
    const minTier1 = Math.min(2, tier1Bands.length);
    const minTier2 = Math.min(3, tier2Bands.length);

    // Add top Tier 1 bands
    for (let i = 0; i < minTier1 && i < tier1Bands.length; i++) {
      selectedBands.push(tier1Bands[i]);
    }

    // Add top Tier 2 bands
    for (let i = 0; i < minTier2 && i < tier2Bands.length; i++) {
      selectedBands.push(tier2Bands[i]);
    }

    // Fill remaining spots with highest-scoring bands from any tier
    const remainingNeeded = this.maxRecommendations - selectedBands.length;
    if (remainingNeeded > 0) {
      const allRemainingBands = bandScores.filter(bs =>
        !selectedBands.some(sb => sb.band.id === bs.band.id)
      );

      for (let i = 0; i < remainingNeeded && i < allRemainingBands.length; i++) {
        selectedBands.push(allRemainingBands[i]);
      }
    }

    // Generate recommendations with tier-based confidence scores
    selectedBands.forEach(({ band, score }) => {
      // Base confidence from preference score
      let confidence = 0.6 + (score * 0.15);

      // Add tier bonus
      if (band.tier === 'well-known') {
        confidence += 0.05;
      } else if (band.tier === 'popular') {
        confidence += 0.02;
      }

      // Cap confidence at 0.95
      confidence = Math.min(0.95, confidence);

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

  private selectTieredPair(genre: string, comparisonHistory: Comparison[] = []): ComparisonPair | null {
    const allBands = this.db.getBandsByGenre(genre);

    // Separate bands by tier
    const tier1Bands = allBands.filter(b => b.tier === 'well-known');
    const tier2Bands = allBands.filter(b => b.tier === 'popular');
    const tier3Bands = allBands.filter(b => b.tier === 'niche');

    // Log band counts
    console.log(`Tiered selection - Tier 1: ${tier1Bands.length}, Tier 2: ${tier2Bands.length}, Tier 3: ${tier3Bands.length}`);

    // Get all previous pairs
    const previousPairs = new Set(
      comparisonHistory.map((c: Comparison) => {
        const pair = [c.bandId1, c.bandId2].sort();
        return pair.join('|');
      })
    );

    // Phase 1: Try Tier 1 × Tier 1 comparisons
    const tier1Pair = this.findNewPair(tier1Bands, previousPairs);
    if (tier1Pair) {
      console.log('Selected Tier 1 × Tier 1 pair');
      return tier1Pair;
    }

    // Phase 2: Try Tier 1 × Tier 2 comparisons
    const tier1Tier2Pair = this.findMixedPair(tier1Bands, tier2Bands, previousPairs);
    if (tier1Tier2Pair) {
      console.log('Selected Tier 1 × Tier 2 pair');
      return tier1Tier2Pair;
    }

    // Phase 3: Try Tier 2 × Tier 2 comparisons
    const tier2Pair = this.findNewPair(tier2Bands, previousPairs);
    if (tier2Pair) {
      console.log('Selected Tier 2 × Tier 2 pair');
      return tier2Pair;
    }

    // No more comparisons available (Tier 3 bands are never used for comparisons)
    console.log('No more comparison pairs available');
    return null;
  }

  private findNewPair(bands: Band[], previousPairs: Set<string>): ComparisonPair | null {
    if (bands.length < 2) {
      return null;
    }

    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const shuffled = [...bands].sort(() => Math.random() - 0.5);
      const band1 = shuffled[0];
      const band2 = shuffled[1];

      if (band1.id !== band2.id) {
        const pairKey = [band1.id, band2.id].sort().join('|');

        if (!previousPairs.has(pairKey)) {
          return { band1, band2 };
        }
      }

      attempts++;
    }

    return null;
  }

  private findMixedPair(bands1: Band[], bands2: Band[], previousPairs: Set<string>): ComparisonPair | null {
    if (bands1.length === 0 || bands2.length === 0) {
      return null;
    }

    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const shuffled1 = [...bands1].sort(() => Math.random() - 0.5);
      const shuffled2 = [...bands2].sort(() => Math.random() - 0.5);
      const band1 = shuffled1[0];
      const band2 = shuffled2[0];

      if (band1.id !== band2.id) {
        const pairKey = [band1.id, band2.id].sort().join('|');

        if (!previousPairs.has(pairKey)) {
          return { band1, band2 };
        }
      }

      attempts++;
    }

    return null;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBandId(name: string): string {
    return `band_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  }
}