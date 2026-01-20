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
  embedding?: Buffer;
}

export interface Session {
  id: string;
  genre: string;
  comparisonHistory: Comparison[];
  preferenceWeights: Record<string, number>;
  seenBands: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Comparison {
  bandId1: string;
  bandId2: string;
  selectedBandId: string;
  timestamp: Date;
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

export interface LLMConfig {
  endpoint: string;
  model: string;
  timeout: number;
}

export interface EmbeddingConfig {
  enabled: boolean;
  model: string | null;
}

export interface DatabaseConfig {
  path: string;
}

export interface TierUpdateConfig {
  enabled: boolean;
  cachePath: string;
}

export interface ExpandGenresConfig {
  enabled: boolean;
  minBandsForGenre: number;
  cachePath: string;
}

export interface CleanupConfig {
  enabled: boolean;
  minBandsThreshold: number;
}

export interface AppConfig {
  llm: LLMConfig;
  embedding: EmbeddingConfig;
  database: DatabaseConfig;
  app: {
    maxComparisons: number;
    maxRecommendations: number;
  };
  tierUpdate: TierUpdateConfig;
  expandGenres: ExpandGenresConfig;
  cleanup: CleanupConfig;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}