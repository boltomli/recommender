import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_MODE = import.meta.env.VITE_API_MODE === 'true';

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
}

let staticDataCache: StaticData | null = null;
let sessions: Record<string, SessionInfo> = {};

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
        preferenceWeights: {}
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

      // 只过滤掉被选择过的乐队，跳过的可以保留
      const availableBands = bands.filter(band => !session.selectedBands.has(band.id));

      if (availableBands.length < 2) {
        return { done: true };
      }

      const shuffled = [...availableBands].sort(() => Math.random() - 0.5);
      const band1 = shuffled[0];
      const band2 = shuffled[1];

      if (!band1 || !band2) {
        return { done: true };
      }

      return {
        band1,
        band2
      };
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

      // 只标记被选中的乐队
      session.selectedBands.add(selectedBandId);

      // 获取被选中的乐队信息以更新偏好权重
      const data = await loadStaticData();
      const selectedBand = data.bands.find(b => b.id === selectedBandId);

      if (selectedBand) {
        // 根据乐队的流派更新偏好权重
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
    }
    // 静态模式下不记录跳过的乐队，它们可以再次出现
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

      // 筛选匹配流派的乐队，只排除被选择过的乐队
      const bands = data.bands.filter(band =>
        band.genre.some(g => g.toLowerCase().includes(session.genre.toLowerCase())) &&
        !session.selectedBands.has(band.id)
      );

      // 根据偏好权重对乐队进行评分和排序
      const scoredBands = bands.map(band => {
        const score = band.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
        return { band, score };
      });

      // 按分数降序排序
      scoredBands.sort((a, b) => b.score - a.score);

      // 取前N个建议
      const topBands = scoredBands.slice(0, count);

      return topBands.map(({ band, score }) => {
        const confidence = Math.min(0.9, 0.5 + (score * 0.1));
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

      // 筛选匹配流派的乐队，只排除被选择过的乐队
      const bands = data.bands.filter(band =>
        band.genre.some(g => g.toLowerCase().includes(session.genre.toLowerCase())) &&
        !session.selectedBands.has(band.id)
      );

      // 根据偏好权重对乐队进行评分和排序
      const scoredBands = bands.map(band => {
        const score = band.genre.reduce((sum, g) => sum + (session.preferenceWeights[g] || 0), 0);
        return { band, score };
      });

      // 按分数降序排序
      scoredBands.sort((a, b) => b.score - a.score);

      // 取前10个推荐
      const topBands = scoredBands.slice(0, 10);

      return topBands.map(({ band, score }) => {
        const confidence = Math.min(0.95, 0.6 + (score * 0.15));
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