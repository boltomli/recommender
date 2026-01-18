import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Band {
  id: string;
  name: string;
  genre: string[];
  era: string;
  albums: string[];
  description: string;
  styleNotes?: string;
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

export const apiService = {
  async getGenres(): Promise<string[]> {
    const response = await api.get('/api/genres');
    return response.data.genres;
  },

  async createSession(genre: string): Promise<string> {
    const response = await api.post('/api/session', { genre });
    return response.data.sessionId;
  },

  async getComparison(sessionId: string): Promise<ComparisonPair | { done: true }> {
    const response = await api.get('/api/comparison', {
      params: { sessionId },
    });
    return response.data;
  },

  async submitPreference(
    sessionId: string,
    bandId1: string,
    bandId2: string,
    selectedBandId: string
  ): Promise<void> {
    await api.post('/api/preference', {
      sessionId,
      bandId1,
      bandId2,
      selectedBandId,
    });
  },

  async skipComparison(
    sessionId: string,
    bandId1: string,
    bandId2: string
  ): Promise<void> {
    await api.post('/api/skip', {
      sessionId,
      bandId1,
      bandId2,
    });
  },

  async getSuggestions(sessionId: string, count: number = 3): Promise<Recommendation[]> {
    const response = await api.get('/api/suggestions', {
      params: { sessionId, count: count.toString() },
    });
    return response.data.suggestions;
  },

  async getRecommendations(sessionId: string): Promise<Recommendation[]> {
    const response = await api.get('/api/recommendations', {
      params: { sessionId },
    });
    return response.data.recommendations;
  },
};