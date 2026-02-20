import axios from 'axios';
import {
  loadStaticData,
  getStaticGenres,
  getStaticBandsByGenre,
  createStaticSession,
  getStaticComparison,
  submitStaticPreference,
  skipStaticComparison,
  getStaticSuggestions,
  getStaticRecommendations,
  isStaticDataAvailable,
  getStaticDataStatus,
  initializeStaticLLM,
  isStaticLLMEnabled,
  testStaticLLMConnection,
  getLLMRecommendations,
  getLLMSuggestions,
  getLLMComparisonPair
} from './staticDataService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const MIN_BANDS_PER_GENRE = Number(import.meta.env.VITE_MIN_BANDS_PER_GENRE) || 30;

// Static mode configuration
// When enabled, all data comes from static JSON files instead of backend API
const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === 'true';

// Track if static data has been loaded
let staticDataLoaded = false;

// User-provided LLM Configuration (BYOK - Bring Your Own Key mode)
// This allows users to use their own LLM API keys
export type LLMApiType = 'openai' | 'anthropic';

export interface LLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  apiType?: LLMApiType; // 'openai' or 'anthropic'
}

// Default LLM configuration (empty - will use backend default)
const defaultLLMConfig: LLMConfig = {
  endpoint: '',
  apiKey: '',
  model: '',
  enabled: false,
  apiType: 'openai',
};

// Current LLM configuration (can be updated by user for BYOK mode)
let currentLLMConfig: LLMConfig = { ...defaultLLMConfig };

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

export const apiService = {
  async getGenres(): Promise<string[]> {
    if (STATIC_MODE) {
      // Initialize static data on first call
      if (!staticDataLoaded) {
        await loadStaticData();
        staticDataLoaded = true;
      }
      return getStaticGenres();
    }

    const response = await api.get('/api/genres');
    const genresData = response.data;
    const genres = genresData.genres || [];
    const counts = genresData.counts || {};

    // Filter genres with insufficient bands
    return genres.filter((genre: string) => {
      const count = counts[genre] || 0;
      return count >= MIN_BANDS_PER_GENRE;
    });
  },

  async createSession(genre: string, llmConfig?: LLMConfig, seedBand?: string): Promise<string> {
    if (STATIC_MODE) {
      if (!staticDataLoaded) {
        await loadStaticData();
        staticDataLoaded = true;
      }

      // 如果提供了 LLM 配置，在静态模式下初始化 LLM
      if (llmConfig?.enabled && llmConfig?.endpoint) {
        initializeStaticLLM(llmConfig);
      }

      return createStaticSession(genre, seedBand);
    }

    const payload: { genre: string; llmConfig?: LLMConfig; seedBand?: string } = { genre };
    if (llmConfig?.enabled && llmConfig?.endpoint) {
      payload.llmConfig = llmConfig;
    }
    if (seedBand) {
      payload.seedBand = seedBand;
    }
    const response = await api.post('/api/session', payload);
    return response.data.sessionId;
  },

  async getComparison(sessionId: string): Promise<ComparisonPair | { done: true }> {
    if (STATIC_MODE) {
      // 如果启用了 LLM，使用 LLM 选择对比对
      if (isStaticLLMEnabled()) {
        return getLLMComparisonPair(sessionId);
      }
      return getStaticComparison(sessionId);
    }

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
    if (STATIC_MODE) {
      return submitStaticPreference(sessionId, bandId1, bandId2, selectedBandId);
    }

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
    if (STATIC_MODE) {
      return skipStaticComparison(sessionId, bandId1, bandId2);
    }

    await api.post('/api/skip', {
      sessionId,
      bandId1,
      bandId2,
    });
  },

  async getSuggestions(sessionId: string, count: number = 3): Promise<Recommendation[]> {
    if (STATIC_MODE) {
      // 如果启用了 LLM，使用 LLM 生成建议
      if (isStaticLLMEnabled()) {
        return getLLMSuggestions(sessionId, count);
      }
      return getStaticSuggestions(sessionId, count);
    }

    const response = await api.get('/api/suggestions', {
      params: { sessionId, count: count.toString() },
    });
    return response.data.suggestions;
  },

  async getRecommendations(sessionId: string): Promise<Recommendation[]> {
    if (STATIC_MODE) {
      // 如果启用了 LLM，使用 LLM 生成推荐
      if (isStaticLLMEnabled()) {
        return getLLMRecommendations(sessionId);
      }
      return getStaticRecommendations(sessionId);
    }

    const response = await api.get('/api/recommendations', {
      params: { sessionId },
    });
    return response.data.recommendations;
  },

  async getBandsByGenre(genre: string): Promise<Band[]> {
    if (STATIC_MODE) {
      if (!staticDataLoaded) {
        await loadStaticData();
        staticDataLoaded = true;
      }
      return getStaticBandsByGenre(genre);
    }

    const response = await api.get(`/api/bands?genre=${genre}`);
    return response.data.bands;
  },

  isApiMode(): boolean {
    // Returns false when in static mode (no backend API needed)
    return !STATIC_MODE;
  },

  isStaticMode(): boolean {
    return STATIC_MODE;
  },

  isStaticLLMEnabled(): boolean {
    return STATIC_MODE && isStaticLLMEnabled();
  },

  async getStaticDataStatus() {
    if (!STATIC_MODE) {
      return { loaded: false, bandCount: 0, genreCount: 0, available: false };
    }
    if (!staticDataLoaded) {
      await loadStaticData();
      staticDataLoaded = true;
    }
    return {
      ...getStaticDataStatus(),
      available: isStaticDataAvailable()
    };
  },

  // LLM Configuration methods
  getLLMConfig(): LLMConfig {
    return { ...currentLLMConfig };
  },

  updateLLMConfig(config: Partial<LLMConfig>): void {
    currentLLMConfig = { ...currentLLMConfig, ...config };
  },

  isLLMEnabled(): boolean {
    return currentLLMConfig.enabled && !!currentLLMConfig.endpoint;
  },

  resetLLMConfig(): void {
    currentLLMConfig = { ...defaultLLMConfig };
  },

  // Test LLM connection by making an actual API call
  // In static mode, calls LLM directly; otherwise uses backend proxy
  async testLLMConnection(): Promise<{ success: boolean; message: string }> {
    if (!currentLLMConfig.enabled) {
      return { success: false, message: 'LLM is not enabled' };
    }

    if (!currentLLMConfig.endpoint) {
      return { success: false, message: 'Please provide an LLM endpoint URL' };
    }

    // 静态模式下直接测试连接
    if (STATIC_MODE) {
      // 更新静态 LLM 配置
      initializeStaticLLM(currentLLMConfig);
      return testStaticLLMConnection();
    }

    try {
      console.log('Testing LLM connection via backend proxy to:', currentLLMConfig.endpoint);
      console.log('Model:', currentLLMConfig.model || 'default');

      // Use backend proxy to avoid CORS issues
      const response = await api.post('/api/proxy/llm', {
        endpoint: currentLLMConfig.endpoint.replace(/\/$/, ''),
        apiKey: currentLLMConfig.apiKey || undefined,
        model: currentLLMConfig.model || 'default',
        apiType: currentLLMConfig.apiType || 'openai',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "Connection successful" and nothing else.' }
        ],
        temperature: 0,
        max_tokens: 20,
      });

      const data = response.data;
      const content = data.choices?.[0]?.message?.content || '';

      return {
        success: true,
        message: `Connection successful! LLM responded: "${content.trim()}"`,
      };
    } catch (error) {
      console.error('LLM connection error:', error);
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;
        
        if (status === 403) {
          return {
            success: false,
            message: `Access forbidden (403). The LLM server rejected the request.\n` +
                    `Possible causes:\n` +
                    `- API key is invalid or missing\n` +
                    `- The endpoint requires authentication\n` +
                    `- The model name is incorrect\n\n` +
                    `Details: ${errorData?.details || errorData?.error || 'No details provided'}`,
          };
        }
        
        if (status === 401) {
          return {
            success: false,
            message: `Authentication failed (401). Please check your API key.`,
          };
        }
        
        if (status === 404) {
          return {
            success: false,
            message: `LLM endpoint returned 404. The server at "${currentLLMConfig.endpoint}" is running but the API path was not found.\n\n` +
                    `Please check:\n` +
                    `- The URL is correct (you entered: ${currentLLMConfig.endpoint})\n` +
                    `- The LLM service supports OpenAI-compatible API (/v1/chat/completions)\n` +
                    `- If using Ollama, ensure it was started with proper API support`,
          };
        }
        
        if (status === 503) {
          return {
            success: false,
            message: errorData?.details || `Cannot connect to LLM server at "${currentLLMConfig.endpoint}".\n\n` +
                    `Please check:\n` +
                    `- The LLM server is running and accessible\n` +
                    `- The URL you entered is correct: ${currentLLMConfig.endpoint}\n` +
                    `- Network connectivity to the LLM server\n` +
                    `- If using a local LLM (LM Studio, Ollama), ensure it's started`,
          };
        }
        
        return {
          success: false,
          message: `Connection failed: ${errorData?.error || errorData?.details || error.message}`,
        };
      }
      
      if (error instanceof Error) {
        return { success: false, message: `Connection failed: ${error.message}` };
      }
      
      return { success: false, message: 'Connection failed: Unknown error' };
    }
  },
};