import type { Band, BandTier, ComparisonPair, Recommendation, LLMConfig } from './api';
import { LLMService, getLLMService } from './llmService';

// Static data loaded from JSON file or embedded fallback
let staticBands: Band[] = [];
let staticGenres: string[] = [];
let dataLoaded = false;

// LLM Service instance for static mode
let llmService: LLMService | null = null;

// Enable LLM for static mode
let staticModeLLMEnabled = false;

// Default genres list (fallback)
const DEFAULT_GENRES = [
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

// Static data configuration
const STATIC_DATA_URL = import.meta.env.VITE_STATIC_DATA_URL || '/data/bands.json';
const MIN_BANDS_PER_GENRE = Number(import.meta.env.VITE_MIN_BANDS_PER_GENRE) || 30;

export interface StaticData {
  timestamp: string;
  genres?: string[];
  bands?: Band[];
}

/**
 * Load static data from JSON file
 */
export async function loadStaticData(): Promise<StaticData> {
  if (dataLoaded) {
    return {
      timestamp: new Date().toISOString(),
      genres: staticGenres,
      bands: staticBands
    };
  }

  try {
    const response = await fetch(STATIC_DATA_URL);
    if (!response.ok) {
      throw new Error(`Failed to load static data: ${response.status}`);
    }

    const data: StaticData = await response.json();

    if (data.bands && Array.isArray(data.bands)) {
      staticBands = data.bands;
    }

    if (data.genres && Array.isArray(data.genres)) {
      staticGenres = data.genres;
    } else {
      // Derive genres from bands if not provided
      staticGenres = deriveGenresFromBands(staticBands);
    }

    dataLoaded = true;
    return data;
  } catch (error) {
    console.warn('Failed to load static data, using fallback:', error);
    // Use empty data as fallback
    staticBands = [];
    staticGenres = DEFAULT_GENRES;
    dataLoaded = true;
    return {
      timestamp: new Date().toISOString(),
      genres: staticGenres,
      bands: staticBands
    };
  }
}

/**
 * Derive unique genres from bands data
 */
function deriveGenresFromBands(bands: Band[]): string[] {
  const genreSet = new Set<string>();
  bands.forEach(band => {
    band.genre.forEach(g => genreSet.add(g));
  });
  return Array.from(genreSet).sort();
}

/**
 * Get all available genres with sufficient bands
 */
export async function getStaticGenres(): Promise<string[]> {
  await loadStaticData();

  // Count bands per genre
  const genreCounts: Record<string, number> = {};
  staticBands.forEach(band => {
    band.genre.forEach(g => {
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    });
  });

  // Filter genres with sufficient bands
  return staticGenres.filter(genre => {
    const count = genreCounts[genre] || 0;
    return count >= MIN_BANDS_PER_GENRE;
  });
}

/**
 * Get bands by genre
 */
export async function getStaticBandsByGenre(genre: string): Promise<Band[]> {
  await loadStaticData();
  return staticBands.filter(band => band.genre.includes(genre));
}

/**
 * Get all bands
 */
export async function getAllStaticBands(): Promise<Band[]> {
  await loadStaticData();
  return [...staticBands];
}

/**
 * Get a band by ID
 */
export async function getStaticBandById(id: string): Promise<Band | undefined> {
  await loadStaticData();
  return staticBands.find(b => b.id === id);
}

/**
 * Get bands by tier within a genre
 */
export async function getStaticBandsByTier(genre: string, tier: BandTier): Promise<Band[]> {
  const bands = await getStaticBandsByGenre(genre);
  return bands.filter(b => b.tier === tier);
}

// Session management for static mode
interface StaticSession {
  id: string;
  genre: string;
  comparisonHistory: Array<{
    bandId1: string;
    bandId2: string;
    selectedBandId: string;
    timestamp: Date;
  }>;
  preferenceWeights: Record<string, number>;
  seenBands: string[];
  createdAt: Date;
  updatedAt: Date;
  availableBands: Band[];
  currentPairIndex: number;
}

const sessions = new Map<string, StaticSession>();

/**
 * Create a new static session
 */
export async function createStaticSession(genre: string): Promise<string> {
  await loadStaticData();

  const bands = await getStaticBandsByGenre(genre);
  if (bands.length < 2) {
    throw new Error(`Not enough bands in genre: ${genre}`);
  }

  // Shuffle bands for variety
  const shuffledBands = [...bands].sort(() => Math.random() - 0.5);

  const session: StaticSession = {
    id: generateSessionId(),
    genre,
    comparisonHistory: [],
    preferenceWeights: {},
    seenBands: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    availableBands: shuffledBands,
    currentPairIndex: 0
  };

  sessions.set(session.id, session);
  return session.id;
}

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  return 'static_' + Math.random().toString(36).substring(2, 15);
}

/**
 * Get comparison pair for a session
 */
export async function getStaticComparison(sessionId: string): Promise<ComparisonPair | { done: true }> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Simple algorithm: pair adjacent bands
  const maxComparisons = Math.min(10, Math.floor(session.availableBands.length / 2));

  if (session.currentPairIndex >= maxComparisons) {
    return { done: true };
  }

  const idx1 = session.currentPairIndex * 2;
  const idx2 = idx1 + 1;

  if (idx2 >= session.availableBands.length) {
    return { done: true };
  }

  const band1 = session.availableBands[idx1];
  const band2 = session.availableBands[idx2];

  // Check if bands exist
  if (!band1 || !band2) {
    return { done: true };
  }

  // Mark bands as seen
  if (!session.seenBands.includes(band1.id)) session.seenBands.push(band1.id);
  if (!session.seenBands.includes(band2.id)) session.seenBands.push(band2.id);

  return { band1, band2 };
}

/**
 * Submit preference for a comparison
 */
export async function submitStaticPreference(
  sessionId: string,
  bandId1: string,
  bandId2: string,
  selectedBandId: string
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  session.comparisonHistory.push({
    bandId1,
    bandId2,
    selectedBandId,
    timestamp: new Date()
  });

  // Update preference weights
  session.preferenceWeights[selectedBandId] = (session.preferenceWeights[selectedBandId] || 0) + 1;

  // Move to next pair
  session.currentPairIndex++;
  session.updatedAt = new Date();
}

/**
 * Skip a comparison
 */
export async function skipStaticComparison(
  sessionId: string,
  bandId1: string,
  bandId2: string
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  session.comparisonHistory.push({
    bandId1,
    bandId2,
    selectedBandId: '', // Empty means skipped
    timestamp: new Date()
  });

  session.currentPairIndex++;
  session.updatedAt = new Date();
}

/**
 * Get recommendations based on preferences
 */
export async function getStaticRecommendations(sessionId: string): Promise<Recommendation[]> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Get preferred bands (those with positive weights)
  const preferredBandIds = Object.entries(session.preferenceWeights)
    .filter(([_, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  // If no preferences, return random bands from the genre
  if (preferredBandIds.length === 0) {
    const randomBands = session.availableBands
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);

    return randomBands.map(band => ({
      band,
      reason: 'A popular band in this genre',
      confidence: 0.5
    }));
  }

  // Build recommendations based on preferences
  const recommendations: Recommendation[] = [];
  const addedBandIds = new Set<string>();

  // First, add preferred bands
  for (const bandId of preferredBandIds.slice(0, 3)) {
    const band = session.availableBands.find(b => b.id === bandId);
    if (band && !addedBandIds.has(band.id)) {
      recommendations.push({
        band,
        reason: 'You showed preference for this band',
        confidence: 0.9
      });
      addedBandIds.add(band.id);
    }
  }

  // Then add similar bands (same tier, not seen)
  const preferredTiers = new Set<BandTier>();
  preferredBandIds.forEach(id => {
    const band = session.availableBands.find(b => b.id === id);
    if (band?.tier) preferredTiers.add(band.tier);
  });

  const similarBands = session.availableBands.filter(b =>
    b.tier && preferredTiers.has(b.tier) &&
    !addedBandIds.has(b.id) &&
    !session.seenBands.includes(b.id)
  );

  for (const band of similarBands.slice(0, 5 - recommendations.length)) {
    recommendations.push({
      band,
      reason: `Similar to your preferences (${band.tier} tier)`,
      confidence: 0.7
    });
    addedBandIds.add(band.id);
  }

  // Fill remaining slots with other bands from the genre
  if (recommendations.length < 5) {
    const otherBands = session.availableBands.filter(b =>
      !addedBandIds.has(b.id)
    );

    for (const band of otherBands.slice(0, 5 - recommendations.length)) {
      recommendations.push({
        band,
        reason: 'Popular in this genre',
        confidence: 0.5
      });
      addedBandIds.add(band.id);
    }
  }

  return recommendations;
}

/**
 * Get suggestions during comparison
 */
export async function getStaticSuggestions(sessionId: string, count: number = 3): Promise<Recommendation[]> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Return unseen bands as suggestions
  const unseenBands = session.availableBands.filter(b =>
    !session.seenBands.includes(b.id)
  );

  return unseenBands
    .slice(0, count)
    .map(band => ({
      band,
      reason: 'You might also like',
      confidence: 0.6
    }));
}

/**
 * Check if static data is available
 */
export function isStaticDataAvailable(): boolean {
  return dataLoaded && staticBands.length > 0;
}

/**
 * Get data loading status
 */
export function getStaticDataStatus(): { loaded: boolean; bandCount: number; genreCount: number } {
  return {
    loaded: dataLoaded,
    bandCount: staticBands.length,
    genreCount: staticGenres.length
  };
}

/**
 * Initialize LLM for static mode
 */
export function initializeStaticLLM(config: LLMConfig): void {
  if (config.enabled && config.endpoint) {
    llmService = getLLMService(config);
    staticModeLLMEnabled = true;
    console.log('✓ Static mode LLM initialized');
  } else {
    staticModeLLMEnabled = false;
    llmService = null;
  }
}

/**
 * Check if LLM is enabled for static mode
 */
export function isStaticLLMEnabled(): boolean {
  return staticModeLLMEnabled && llmService !== null && llmService.isEnabled();
}

/**
 * Update LLM configuration for static mode
 */
export function updateStaticLLMConfig(config: Partial<LLMConfig>): void {
  if (llmService) {
    llmService.updateConfig(config);
  }
}

/**
 * Test LLM connection in static mode
 */
export async function testStaticLLMConnection(): Promise<{ success: boolean; message: string }> {
  if (!llmService) {
    return { success: false, message: 'LLM 未初始化' };
  }
  return llmService.testConnection();
}

/**
 * Get LLM-enhanced recommendations
 */
export async function getLLMRecommendations(sessionId: string): Promise<Recommendation[]> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (!llmService || !llmService.isEnabled()) {
    // 回退到普通推荐
    return getStaticRecommendations(sessionId);
  }

  try {
    // 准备候选乐队（未看过的）
    const candidateBands = session.availableBands.filter(b => 
      !session.seenBands.includes(b.id)
    );

    // 调用 LLM 生成推荐
    const llmRecommendations = await llmService.generateRecommendations(
      session.genre,
      session.comparisonHistory,
      session.seenBands,
      candidateBands,
      5
    );

    // 将 LLM 推荐转换为 Recommendation 格式
    return llmRecommendations.map(rec => {
      // 查找对应的完整乐队数据
      const band = session.availableBands.find(b => 
        b.name.toLowerCase() === rec.band.toLowerCase()
      );

      if (band) {
        return {
          band,
          reason: rec.reason,
          confidence: rec.confidence
        };
      }

      // 如果找不到对应乐队，创建一个新乐队对象（来自 LLM 的完整信息）
      return {
        band: {
          id: 'llm_' + rec.band.toLowerCase().replace(/\s+/g, '_'),
          name: rec.band,
          genre: rec.genre || [session.genre],
          era: rec.era || 'Unknown',
          albums: rec.albums || [],
          description: rec.description || rec.reason,
          tier: (rec.tier as BandTier) || 'niche'
        },
        reason: rec.reason,
        confidence: rec.confidence
      };
    });
  } catch (error) {
    console.error('LLM 推荐失败，回退到普通推荐:', error);
    return getStaticRecommendations(sessionId);
  }
}

/**
 * Get LLM-enhanced suggestions
 */
export async function getLLMSuggestions(sessionId: string, count: number = 3): Promise<Recommendation[]> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (!llmService || !llmService.isEnabled()) {
    // 回退到普通建议
    return getStaticSuggestions(sessionId, count);
  }

  try {
    // 准备候选乐队（未看过的）
    const candidateBands = session.availableBands.filter(b => 
      !session.seenBands.includes(b.id)
    );

    // 调用 LLM 生成建议
    const llmSuggestions = await llmService.generateSuggestions(
      session.genre,
      session.comparisonHistory,
      session.seenBands,
      candidateBands,
      count
    );

    // 将 LLM 建议转换为 Recommendation 格式
    return llmSuggestions.map(rec => {
      const band = session.availableBands.find(b => 
        b.name.toLowerCase() === rec.band.toLowerCase()
      );

      if (band) {
        return {
          band,
          reason: rec.reason,
          confidence: rec.confidence
        };
      }

      return {
        band: {
          id: 'llm_' + rec.band.toLowerCase().replace(/\s+/g, '_'),
          name: rec.band,
          genre: rec.genre || [session.genre],
          era: rec.era || 'Unknown',
          albums: rec.albums || [],
          description: rec.description || rec.reason,
          tier: (rec.tier as BandTier) || 'niche'
        },
        reason: rec.reason,
        confidence: rec.confidence
      };
    });
  } catch (error) {
    console.error('LLM 建议失败，回退到普通建议:', error);
    return getStaticSuggestions(sessionId, count);
  }
}

/**
 * Get LLM-enhanced comparison pair
 */
export async function getLLMComparisonPair(sessionId: string): Promise<ComparisonPair | { done: true }> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // 检查是否已达到最大对比次数
  const maxComparisons = Math.min(10, Math.floor(session.availableBands.length / 2));
  if (session.currentPairIndex >= maxComparisons) {
    return { done: true };
  }

  if (!llmService || !llmService.isEnabled()) {
    // 回退到普通对比选择
    return getStaticComparison(sessionId);
  }

  try {
    // 获取可用乐队名称
    const availableBandNames = session.availableBands.map(b => b.name);

    // 调用 LLM 选择对比对
    const [band1Name, band2Name] = await llmService.selectComparisonPair(
      session.genre,
      session.comparisonHistory,
      availableBandNames
    );

    // 查找对应的乐队对象
    const band1 = session.availableBands.find(b => b.name === band1Name);
    const band2 = session.availableBands.find(b => b.name === band2Name);

    if (!band1 || !band2) {
      // 如果 LLM 返回的乐队不存在，回退到普通选择
      return getStaticComparison(sessionId);
    }

    // 标记乐队为已看过
    if (!session.seenBands.includes(band1.id)) session.seenBands.push(band1.id);
    if (!session.seenBands.includes(band2.id)) session.seenBands.push(band2.id);

    // 更新当前索引
    session.currentPairIndex++;
    session.updatedAt = new Date();

    return { band1, band2 };
  } catch (error) {
    console.error('LLM 对比选择失败，回退到普通选择:', error);
    return getStaticComparison(sessionId);
  }
}
