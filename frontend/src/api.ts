import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_MODE = import.meta.env.VITE_API_MODE === 'true';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export type BandTier = 'well-known' | 'popular' | 'niche';

export interface Band {
  id: string;
  name: string;
  genre: string[];
  era: string;
  albums: string[];
  description: string;
  styleNotes?: string;
  tier?: BandTier;
}

export interface ComparisonPair {
  band1: Band;
  band2: Band;
}

export interface Recommendation {
  band: Band;
  reason: string;
  confidence: number;
}

interface StaticData {
  genres: string[];
  bands: Band[];
  recommendations: Record<string, Band[]>;
}

interface SessionInfo {
  genre: string;
  createdAt: number;
  selectedBands: Set<string>;
  preferenceWeights: Record<string, number>;
  comparisonHistory: string[][];
}

let staticDataCache: StaticData | null = null;
let sessions: Record<string, SessionInfo> = {};

function findNewPair(bands: Band[], previousPairs: Set<string>): ComparisonPair | null {
  if (bands.length < 2) {
    return null;
  }

  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const shuffled = [...bands].sort(() => Math.random() - 0.5);
    const band1 = shuffled[0];
    const band2 = shuffled[1];

    if (band1 && band2 && band1.id !== band2.id) {
      const pairKey = [band1.id, band2.id].sort().join('|');

      if (!previousPairs.has(pairKey)) {
        return { band1, band2 };
      }
    }

    attempts++;
  }

  return null;
}

function findMixedPair(bands1: Band[], bands2: Band[], previousPairs: Set<string>): ComparisonPair | null {
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

    if (band1 && band2 && band1.id !== band2.id) {
      const pairKey = [band1.id, band2.id].sort().join('|');

      if (!previousPairs.has(pairKey)) {
        return { band1, band2 };
      }
    }

    attempts++;
  }

  return null;
}

function selectTieredPair(bands: Band[], comparisonHistory: string[][]): ComparisonPair | null {
  // Separate bands by tier
  const tier1Bands = bands.filter(b => b.tier === 'well-known');
  const tier2Bands = bands.filter(b => b.tier === 'popular');
  const tier3Bands = bands.filter(b => b.tier === 'niche');

  // Get all previous pairs
  const previousPairs = new Set(
    comparisonHistory.map((pair: string[]) => {
      return pair.sort().join('|');
    })
  );

  // Phase 1: Try Tier 1 × Tier 1 comparisons
  const tier1Pair = findNewPair(tier1Bands, previousPairs);
  if (tier1Pair) {
    return tier1Pair;
  }

  // Phase 2: Try Tier 1 × Tier 2 comparisons
  const tier1Tier2Pair = findMixedPair(tier1Bands, tier2Bands, previousPairs);
  if (tier1Tier2Pair) {
    return tier1Tier2Pair;
  }

  // Phase 3: Try Tier 2 × Tier 2 comparisons
  const tier2Pair = findNewPair(tier2Bands, previousPairs);
  if (tier2Pair) {
    return tier2Pair;
  }

  // Phase 4: Try Tier 1 × Tier 3 comparisons
  const tier1Tier3Pair = findMixedPair(tier1Bands, tier3Bands, previousPairs);
  if (tier1Tier3Pair) {
    return tier1Tier3Pair;
  }

  // Phase 5: Try Tier 2 × Tier 3 comparisons
  const tier2Tier3Pair = findMixedPair(tier2Bands, tier3Bands, previousPairs);
  if (tier2Tier3Pair) {
    return tier2Tier3Pair;
  }

  // Phase 6: Try Tier 3 × Tier 3 comparisons
  const tier3Pair = findNewPair(tier3Bands, previousPairs);
  if (tier3Pair) {
    return tier3Pair;
  }

  // No more comparisons available
  return null;
}

async function loadStaticData(): Promise<StaticData> {
  if (staticDataCache) {
    return staticDataCache;
  }

  try {
    const [genresResponse, bandsResponse, recommendationsResponse] = await Promise.all([
      fetch('/data/genres.json'),
      fetch('/data/bands.json'),
      fetch('/data/recommendations.json')
    ]);

    const genresData = await genresResponse.json();
    const bandsData = await bandsResponse.json();
    const recommendationsData = await recommendationsResponse.json();

    staticDataCache = {
      genres: genresData.genres,
      bands: bandsData.bands,
      recommendations: recommendationsData.recommendations
    };

    return staticDataCache;
  } catch (error) {
    console.error('Failed to load static data:', error);
    throw new Error('Failed to load static data. Please ensure the data files exist.');
  }
}

export const apiService = {
  async getGenres(): Promise<string[]> {
    if (API_MODE) {
      const response = await api.get('/api/genres');
      return response.data.genres;
    } else {
      const data = await loadStaticData();
      return data.genres;
    }
  },

  async createSession(genre: string): Promise<string> {
    if (API_MODE) {
      const response = await api.post('/api/session', { genre });
      return response.data.sessionId;
    } else {
      const sessionId = `static_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessions[sessionId] = {
        genre,
        createdAt: Date.now(),
        selectedBands: new Set<string>(),
        preferenceWeights: {},
        comparisonHistory: []
      };
      return sessionId;
    }
  },

  async getComparison(sessionId: string): Promise<ComparisonPair | { done: true }> {
    if (API_MODE) {
      const response = await api.get('/api/comparison', {
        params: { sessionId },
      });
      return response.data;
    } else {
      const session = sessions[sessionId];
      if (!session) {
        throw new Error('Session not found');
      }

      const data = await loadStaticData();
      const bands = data.bands.filter(band =>
        band.genre.some(g => g.toLowerCase().includes(session.genre.toLowerCase()))
      );

      // Filter out selected bands
      const availableBands = bands.filter(band => !session.selectedBands.has(band.id));

      if (availableBands.length < 2) {
        return { done: true };
      }

      // Use tiered selection
      const pair = selectTieredPair(availableBands, session.comparisonHistory);

      if (!pair) {
        return { done: true };
      }

      return pair;
    }
  },

  async submitPreference(
    sessionId: string,
    bandId1: string,
    bandId2: string,
    selectedBandId: string
  ): Promise<void> {
    if (API_MODE) {
      await api.post('/api/preference', {
        sessionId,
        bandId1,
        bandId2,
        selectedBandId,
      });
    } else {
      const session = sessions[sessionId];
      if (!session) {
        throw new Error('Session not found');
      }

      // Track comparison history
      session.comparisonHistory.push([bandId1, bandId2]);

      // Mark selected band
      session.selectedBands.add(selectedBandId);

      // Update preference weights based on selected band's genres
      const data = await loadStaticData();
      const selectedBand = data.bands.find(b => b.id === selectedBandId);

      if (selectedBand) {
        selectedBand.genre.forEach(g => {
          session.preferenceWeights[g] = (session.preferenceWeights[g] || 0) + 1;
        });
      }
    }
  },

  async skipComparison(
    sessionId: string,
    bandId1: string,
    bandId2: string
  ): Promise<void> {
    if (API_MODE) {
      await api.post('/api/skip', {
        sessionId,
        bandId1,
        bandId2,
      });
    } else {
      const session = sessions[sessionId];
      if (!session) {
        throw new Error('Session not found');
      }

      // Track comparison history even when skipping
      session.comparisonHistory.push([bandId1, bandId2]);
    }
  },

  async getSuggestions(sessionId: string, count: number = 3): Promise<Recommendation[]> {
    if (API_MODE) {
      const response = await api.get('/api/suggestions', {
        params: { sessionId, count: count.toString() },
      });
      return response.data.suggestions;
    } else {
      const session = sessions[sessionId];
      if (!session) {
        throw new Error('Session not found');
      }

      const data = await loadStaticData();

      // Filter bands by genre and exclude selected bands
      const bands = data.bands.filter(band =>
        band.genre.some(g => g.toLowerCase().includes(session.genre.toLowerCase())) &&
        !session.selectedBands.has(band.id)
      );

      // Calculate preference scores for all bands
      const scoredBands = bands.map(band => {
        const score = band.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
        return { band, score };
      });

      // Sort by score descending
      scoredBands.sort((a, b) => b.score - a.score);

      // Take top count bands
      const selectedBands = scoredBands.slice(0, count);

      // Generate suggestions with tier-based confidence scores
      return selectedBands.map(({ band, score }) => {
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

        const reason = score > 0
          ? `Matches your taste in ${band.genre.join(' and ')}`
          : 'Popular choice';

        return {
          band,
          reason,
          confidence
        };
      });
    }
  },

  async getRecommendations(sessionId: string): Promise<Recommendation[]> {
    if (API_MODE) {
      const response = await api.get('/api/recommendations', {
        params: { sessionId },
      });
      return response.data.recommendations;
    } else {
      const session = sessions[sessionId];
      if (!session) {
        throw new Error('Session not found');
      }

      const data = await loadStaticData();

      // Filter bands by genre and exclude selected bands
      const bands = data.bands.filter(band =>
        band.genre.some(g => g.toLowerCase().includes(session.genre.toLowerCase())) &&
        !session.selectedBands.has(band.id)
      );

      // Calculate preference scores for all bands
      const scoredBands = bands.map(band => {
        const score = band.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
        return { band, score };
      });

      // Sort by score descending
      scoredBands.sort((a, b) => b.score - a.score);

      // Separate bands by tier
      const tier1Bands = scoredBands.filter(bs => bs.band.tier === 'well-known');
      const tier2Bands = scoredBands.filter(bs => bs.band.tier === 'popular');

      // Ensure tier diversity in recommendations
      const selectedBands: Array<{ band: Band; score: number }> = [];
      const minTier1 = Math.min(2, tier1Bands.length);
      const minTier2 = Math.min(3, tier2Bands.length);
      const maxRecommendations = 10;

      // Add top Tier 1 bands
      for (let i = 0; i < minTier1 && i < tier1Bands.length; i++) {
        const band = tier1Bands[i];
        if (band) {
          selectedBands.push(band);
        }
      }

      // Add top Tier 2 bands
      for (let i = 0; i < minTier2 && i < tier2Bands.length; i++) {
        const band = tier2Bands[i];
        if (band) {
          selectedBands.push(band);
        }
      }

      // Fill remaining spots with highest-scoring bands from any tier
      const remainingNeeded = maxRecommendations - selectedBands.length;
      if (remainingNeeded > 0) {
        const allRemainingBands = scoredBands.filter(bs =>
          !selectedBands.some(sb => sb.band.id === bs.band.id)
        );

        for (let i = 0; i < remainingNeeded && i < allRemainingBands.length; i++) {
          const band = allRemainingBands[i];
          if (band) {
            selectedBands.push(band);
          }
        }
      }

      // Generate recommendations with tier-based confidence scores
      return selectedBands.map(({ band, score }) => {
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

        const reason = score > 0
          ? `Based on your preference for ${band.genre.join(' and ')}`
          : 'Popular band in this genre';

        return {
          band,
          reason,
          confidence
        };
      });
    }
  },

  async getBandsByGenre(genre: string): Promise<Band[]> {
    if (API_MODE) {
      const response = await api.get(`/api/bands?genre=${genre}`);
      return response.data.bands;
    } else {
      const data = await loadStaticData();
      return data.bands.filter(band =>
        band.genre.some(g => g.toLowerCase().includes(genre.toLowerCase()))
      );
    }
  },

  isApiMode(): boolean {
    return API_MODE;
  }
};