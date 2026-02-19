import { LLMClient } from './llmClient';
import { IDatabase } from './database';
import { Band, BandTier, Session, Comparison, Recommendation, ComparisonPair } from './types';
import { STATIC_BANDS } from './staticBands';
import { getConfig } from './config';
import {
  STANDARD_GENRES,
  normalizeGenres,
  normalizeEra,
  normalizeAlbums,
  normalizeDescription,
  normalizeStyleNotes,
  normalizeTier,
  isValidBandName,
  validateAndNormalizeBand,
  generateDataFormatReference
} from './dataStandards';

export class RecommendationEngine {
  private llmClient: LLMClient;
  private db: IDatabase;
  private maxComparisons: number;
  private maxRecommendations: number;

  constructor(llmClient: LLMClient, db: IDatabase, maxComparisons: number, maxRecommendations: number) {
    this.llmClient = llmClient;
    this.db = db;
    this.maxComparisons = maxComparisons;
    this.maxRecommendations = maxRecommendations;
  }

  /**
   * 获取session特定的LLM客户端
   * 如果session有用户提供的LLM配置（BYOK模式），则创建新的LLMClient
   * 否则使用默认的LLMClient
   */
  private getLLMClientForSession(session: Session): LLMClient {
    if (session.userLLMConfig?.endpoint) {
      // 使用用户提供的LLM配置（BYOK模式）
      return new LLMClient(session.userLLMConfig);
    }
    // 使用默认的LLMClient
    return this.llmClient;
  }

  async getGenres(): Promise<{ genres: string[]; counts: Record<string, number> }> {
    const config = getConfig();
    const minBandsPerGenre = config.expandGenres.minBandsForGenre || 30;

    const allBands = await this.db.getAllBands();
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

  async startSession(genre: string, userLLMConfig?: { endpoint: string; apiKey?: string; model?: string }): Promise<Session> {
    const sessionId = this.generateSessionId();

    // 首先确保该流派有足够的数据
    await this.ensureGenreBands(genre, userLLMConfig);

    // 读取并缓存按 tier 排序的前100个乐队
    const cachedBands = await this.getCachedBandsForGenre(genre);
    console.log(`Cached ${cachedBands.length} bands for genre ${genre}`);

    const session: Session = {
      id: sessionId,
      genre: genre,
      comparisonHistory: [],
      preferenceWeights: {},
      seenBands: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      cachedBands: cachedBands
    };

    // 如果用户提供了LLM配置，保存到session中（BYOK模式）并启用 Zen Mode
    if (userLLMConfig?.endpoint) {
      session.userLLMConfig = {
        endpoint: userLLMConfig.endpoint,
        apiKey: userLLMConfig.apiKey,
        model: userLLMConfig.model || getConfig().llm.model,
        timeout: getConfig().llm.timeout,
      };
      session.zenMode = true; // 启用 Zen Mode：持续提供乐队比较
      console.log(`Session ${sessionId} using user-provided LLM config: ${userLLMConfig.endpoint}, Zen Mode enabled`);
    }

    await this.db.createSession(session);

    return session;
  }

  /**
   * 确保流派有足够的数据（按需填充）
   */
  private async ensureGenreBands(genre: string, userLLMConfig?: { endpoint: string; apiKey?: string; model?: string }): Promise<void> {
    const config = getConfig();
    const minBandsForGenre = config.expandGenres.minBandsForGenre || 30;
    const existingBands = await this.db.getBandsByGenre(genre);

    if (existingBands.length >= minBandsForGenre) {
      return; // 数据充足，无需填充
    }

    console.log(`Genre ${genre} has ${existingBands.length} bands, need ${minBandsForGenre}. Populating...`);
    await this.populateGenreBands(genre, userLLMConfig);
  }

  /**
   * 获取按 tier 排序的前100个乐队用于缓存
   * 优先级：well-known > popular > niche
   */
  private async getCachedBandsForGenre(genre: string): Promise<Band[]> {
    const allBands = await this.db.getBandsByGenre(genre);

    // 按 tier 排序：well-known (3) > popular (2) > niche (1)
    const tierOrder = { 'well-known': 3, 'popular': 2, 'niche': 1 };

    const sortedBands = allBands.sort((a, b) => {
      const tierA = tierOrder[a.tier || 'niche'] || 0;
      const tierB = tierOrder[b.tier || 'niche'] || 0;
      return tierB - tierA; // 降序排列
    });

    // 取前100个
    return sortedBands.slice(0, 100);
  }

  async getComparisonPair(sessionId: string): Promise<ComparisonPair | null> {
    const session = await this.db.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const bands = await this.db.getBandsByGenre(session.genre);
    if (bands.length < 2) {
      await this.populateGenreBands(session.genre);
      const updatedBands = await this.db.getBandsByGenre(session.genre);
      if (updatedBands.length < 2) {
        throw new Error('Not enough bands available for comparison');
      }
      return this.selectTieredPair(session.genre, session.comparisonHistory);
    }

    // Use tiered selection that prioritizes well-known bands
    let pair = await this.selectTieredPair(session.genre, session.comparisonHistory);
    if (pair) {
      return pair;
    }

    // If no pair found from Tier 1/2, check minimum comparison requirement
    const MIN_COMPARISONS = 3;
    if (session.comparisonHistory.length < MIN_COMPARISONS) {
      console.log(`Only ${session.comparisonHistory.length} comparisons done, minimum ${MIN_COMPARISONS} required. Using Tier 3 bands.`);
      pair = await this.selectTieredPairWithFallback(session.genre, session.comparisonHistory);
      if (pair) {
        return pair;
      }
    }

    // Zen Mode: 如果启用了 Zen Mode 且没有更多可用对，清空历史以持续提供比较
    if (session.zenMode && session.comparisonHistory.length > 0) {
      console.log(`Zen Mode: Resetting comparison history after ${session.comparisonHistory.length} comparisons to continue providing pairs`);
      session.comparisonHistory = [];
      session.updatedAt = new Date();
      await this.db.updateSession(session);

      // 重新尝试获取乐队对
      pair = await this.selectTieredPair(session.genre, session.comparisonHistory);
      if (pair) {
        console.log('Zen Mode: Providing new pair after history reset');
        return pair;
      }

      // 如果 Tier 1/2 没有可用对，尝试使用 Tier 3
      pair = await this.selectTieredPairWithFallback(session.genre, session.comparisonHistory);
      if (pair) {
        console.log('Zen Mode: Providing fallback pair after history reset');
        return pair;
      }
    }

    return null;
  }

  async recordPreference(sessionId: string, bandId1: string, bandId2: string, selectedBandId: string): Promise<void> {
    const session = await this.db.getSession(sessionId);
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
    const selectedBand = await this.db.getBand(selectedBandId);
    const otherBandId = bandId1 === selectedBandId ? bandId2 : bandId1;
    const otherBand = await this.db.getBand(otherBandId);

    if (selectedBand && otherBand) {
      selectedBand.genre.forEach(g => {
        session.preferenceWeights[g] = (session.preferenceWeights[g] || 0) + 1;
      });
    }

    session.updatedAt = new Date();
    await this.db.updateSession(session);
  }

  async skipComparison(sessionId: string, bandId1: string, bandId2: string): Promise<void> {
    const session = await this.db.getSession(sessionId);
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
    await this.db.updateSession(session);
  }

  async getRealTimeSuggestions(sessionId: string, numSuggestions: number = 3): Promise<Recommendation[]> {
    const session = await this.db.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // 首先尝试使用 LLM 生成实时建议
    try {
      const llmSuggestions = await this.tryLLMSuggestions(session, numSuggestions);
      if (llmSuggestions.length > 0) {
        console.log(`LLM generated ${llmSuggestions.length} real-time suggestions, using LLM results`);
        return llmSuggestions;
      }
    } catch (error) {
      console.warn('LLM real-time suggestions failed, falling back to simple logic:', error);
    }

    // LLM 失败或返回空结果，回退到简单逻辑
    console.log('Using fallback suggestion logic');
    return this.getFallbackSuggestions(session, numSuggestions);
  }

  /**
   * 尝试使用 LLM 生成实时建议
   * 使用缓存的乐队数据
   */
  private async tryLLMSuggestions(session: Session, numSuggestions: number): Promise<Recommendation[]> {
    // 检查 LLM 是否已配置（使用session特定的配置或全局配置）
    const config = getConfig();
    const userConfig = session.userLLMConfig;
    const effectiveEndpoint = userConfig?.endpoint || process.env.LLM_ENDPOINT || config.llm.endpoint;
    const isLLMConfigured = effectiveEndpoint &&
                           effectiveEndpoint.trim() !== '' &&
                           !effectiveEndpoint.includes('localhost:1234');

    if (!isLLMConfigured) {
      console.log('LLM not configured, skipping LLM suggestions');
      return [];
    }

    // 获取session特定的LLM客户端（支持BYOK模式）
    const llmClient = this.getLLMClientForSession(session);

    // 使用缓存的乐队数据
    const cachedBands = session.cachedBands || [];
    if (cachedBands.length === 0) {
      console.log('No cached bands available for suggestions');
      return [];
    }

    // 获取已见过的乐队ID
    const seenBandIds = new Set<string>(session.seenBands);
    session.comparisonHistory.forEach(comp => {
      seenBandIds.add(comp.bandId1);
      seenBandIds.add(comp.bandId2);
    });

    // 从缓存中筛选未见过的乐队
    const unseenBands = cachedBands.filter(band => !seenBandIds.has(band.id));

    // 准备给 LLM 的候选乐队列表
    const candidateBandNames = unseenBands.slice(0, 30).map(b => b.name); // 取前30个作为候选

    // 获取已见乐队的名称列表
    const seenBandNames: string[] = [];
    for (const bandId of seenBandIds) {
      const band = cachedBands.find(b => b.id === bandId) || await this.db.getBand(bandId);
      if (band) {
        seenBandNames.push(band.name);
      }
    }

    // 调用 LLM 生成建议，传入候选乐队列表
    const llmResults = await llmClient.generateRealTimeSuggestionsWithCandidates(
      session.genre,
      session.comparisonHistory,
      numSuggestions,
      seenBandNames,
      candidateBandNames
    );

    if (!llmResults || llmResults.length === 0) {
      return [];
    }

    // 将 LLM 结果转换为 Recommendation 格式
    const suggestions: Recommendation[] = [];
    const usedBandIds = new Set<string>();

    for (const llmSuggestion of llmResults) {
      // 首先尝试在缓存中找到对应的乐队
      let band = cachedBands.find(b =>
        b.name.toLowerCase() === llmSuggestion.band.toLowerCase()
      );

      // 如果不在缓存中，尝试从数据库查找
      if (!band) {
        const allBands = await this.db.getBandsByGenre(session.genre);
        band = allBands.find(b =>
          b.name.toLowerCase() === llmSuggestion.band.toLowerCase()
        );
      }

      // 如果数据库中不存在，但LLM返回了完整信息，则创建新乐队
      if (!band && llmSuggestion.era && llmSuggestion.description) {
        console.log(`LLM suggested new band not in database: ${llmSuggestion.band}, creating...`);
        band = await this.createBandFromLLMResult(llmSuggestion, session.genre);
      }

      if (band && !seenBandIds.has(band.id) && !usedBandIds.has(band.id)) {
        suggestions.push({
          band,
          reason: llmSuggestion.reason || 'Suggested by AI',
          confidence: llmSuggestion.confidence || 0.7
        });
        usedBandIds.add(band.id);
      }
    }

    // 如果建议数量不足，按需补充新乐队
    const neededCount = numSuggestions - suggestions.length;
    if (neededCount > 0) {
      console.log(`Need ${neededCount} more bands for suggestions, generating...`);
      const additionalSuggestions = await this.generateAdditionalBands(
        session,
        seenBandNames,
        neededCount,
        usedBandIds
      );
      suggestions.push(...additionalSuggestions);
    }

    return suggestions;
  }

  /**
   * 回退建议逻辑（基于权重的简单建议）
   */
  private async getFallbackSuggestions(session: Session, numSuggestions: number): Promise<Recommendation[]> {
    const suggestions: Recommendation[] = [];
    const allBands = await this.db.getBandsByGenre(session.genre);

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
    const session = await this.db.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // 首先尝试使用 LLM 生成推荐
    try {
      const llmRecommendations = await this.tryLLMRecommendations(session);
      if (llmRecommendations.length > 0) {
        console.log(`LLM generated ${llmRecommendations.length} recommendations, using LLM results`);
        return llmRecommendations;
      }
    } catch (error) {
      console.warn('LLM recommendation failed, falling back to simple logic:', error);
    }

    // LLM 失败或返回空结果，回退到简单逻辑
    console.log('Using fallback recommendation logic');
    return this.getFallbackRecommendations(session);
  }

  /**
   * 尝试使用 LLM 生成推荐
   * 优先使用缓存中未见过的乐队，不足时按需补充
   */
  private async tryLLMRecommendations(session: Session): Promise<Recommendation[]> {
    // 检查 LLM 是否已配置（使用session特定的配置或全局配置）
    const config = getConfig();
    const userConfig = session.userLLMConfig;
    const effectiveEndpoint = userConfig?.endpoint || process.env.LLM_ENDPOINT || config.llm.endpoint;
    const isLLMConfigured = effectiveEndpoint &&
                           effectiveEndpoint.trim() !== '' &&
                           !effectiveEndpoint.includes('localhost:1234');

    if (!isLLMConfigured) {
      console.log('LLM not configured, skipping LLM recommendations');
      return [];
    }

    // 获取session特定的LLM客户端（支持BYOK模式）
    const llmClient = this.getLLMClientForSession(session);

    // 使用缓存的乐队数据
    const cachedBands = session.cachedBands || [];
    if (cachedBands.length === 0) {
      console.log('No cached bands available');
      return [];
    }

    // 获取已见过的乐队ID
    const seenBandIds = new Set<string>(session.seenBands);
    session.comparisonHistory.forEach(comp => {
      seenBandIds.add(comp.bandId1);
      seenBandIds.add(comp.bandId2);
    });

    // 从缓存中筛选未见过的乐队
    const unseenBands = cachedBands.filter(band => !seenBandIds.has(band.id));
    console.log(`Found ${unseenBands.length} unseen bands in cache (total cached: ${cachedBands.length})`);

    // 准备给 LLM 的候选乐队列表（优先推荐这些）
    const candidateBandNames = unseenBands.slice(0, 50).map(b => b.name); // 取前50个作为候选

    // 获取已见乐队的名称列表
    const seenBandNames: string[] = [];
    for (const bandId of seenBandIds) {
      const band = cachedBands.find(b => b.id === bandId) || await this.db.getBand(bandId);
      if (band) {
        seenBandNames.push(band.name);
      }
    }

    // 调用 LLM 生成推荐，传入候选乐队列表
    const llmResults = await llmClient.generateRecommendationsWithCandidates(
      session.genre,
      session.comparisonHistory,
      this.maxRecommendations,
      seenBandNames,
      candidateBandNames
    );

    if (!llmResults || llmResults.length === 0) {
      return [];
    }

    // 将 LLM 结果转换为 Recommendation 格式
    const recommendations: Recommendation[] = [];
    const usedBandIds = new Set<string>();

    for (const llmRec of llmResults) {
      // 首先尝试在缓存中找到对应的乐队
      let band = cachedBands.find(b =>
        b.name.toLowerCase() === llmRec.band.toLowerCase()
      );

      // 如果不在缓存中，尝试从数据库查找
      if (!band) {
        const allBands = await this.db.getBandsByGenre(session.genre);
        band = allBands.find(b =>
          b.name.toLowerCase() === llmRec.band.toLowerCase()
        );
      }

      // 如果数据库中不存在，但LLM返回了完整信息，则创建新乐队
      if (!band && llmRec.era && llmRec.description) {
        console.log(`LLM recommended new band not in database: ${llmRec.band}, creating...`);
        band = await this.createBandFromLLMResult(llmRec, session.genre);
      }

      if (band && !seenBandIds.has(band.id) && !usedBandIds.has(band.id)) {
        recommendations.push({
          band,
          reason: llmRec.reason || 'Recommended by AI',
          confidence: llmRec.confidence || 0.75
        });
        usedBandIds.add(band.id);
      }
    }

    // 如果推荐数量不足，按需补充新乐队
    const neededCount = this.maxRecommendations - recommendations.length;
    if (neededCount > 0) {
      console.log(`Need ${neededCount} more bands, generating additional bands...`);
      const additionalRecommendations = await this.generateAdditionalBands(
        session,
        seenBandNames,
        neededCount,
        usedBandIds
      );
      recommendations.push(...additionalRecommendations);
    }

    return recommendations;
  }

  /**
   * 根据 LLM 返回的结果创建新乐队并保存到数据库
   * 使用 dataStandards 进行数据验证和标准化
   */
  private async createBandFromLLMResult(llmRec: any, genre: string): Promise<Band | undefined> {
    try {
      // 使用统一的验证和标准化函数
      const validation = validateAndNormalizeBand({
        name: llmRec.band,
        genre: llmRec.genre,
        era: llmRec.era,
        albums: llmRec.albums,
        description: llmRec.description,
        styleNotes: llmRec.styleNotes,
        tier: llmRec.tier
      }, genre);

      if (!validation.valid || !validation.band) {
        console.error(`Band validation failed: ${validation.errors.join(', ')}`);
        return undefined;
      }

      const band = validation.band;

      // 检查是否已存在同名乐队
      const existingBands = await this.db.getBandsByGenre(genre);
      const exists = existingBands.some(b =>
        b.name.toLowerCase() === band.name.toLowerCase()
      );

      if (exists) {
        console.log(`Band ${band.name} already exists, skipping creation`);
        return undefined;
      }

      // 生成唯一ID
      band.id = this.generateBandId(band.name);

      // 保存到数据库
      await this.db.createBand(band);
      console.log(`Created and saved new band to database: ${band.name} (tier: ${band.tier}, genres: ${band.genre.join(', ')})`);

      return band;
    } catch (error) {
      console.error(`Error creating band from LLM result: ${llmRec?.band}`, error);
      return undefined;
    }
  }

  /**
   * 按需生成并补充新乐队到数据库
   * 使用 dataStandards 进行数据验证和标准化
   */
  private async generateAdditionalBands(
    session: Session,
    excludeBandNames: string[],
    count: number,
    usedBandIds: Set<string>
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // 获取参考乐队（用于指导生成质量）
      const referenceBands = (session.cachedBands || []).slice(0, 3);

      // 获取session特定的LLM客户端（支持BYOK模式）
      const llmClient = this.getLLMClientForSession(session);

      // 调用 LLM 生成新乐队
      const generatedBands = await llmClient.generateBandsForRecommendation(
        session.genre,
        excludeBandNames,
        referenceBands.length > 0 ? referenceBands : undefined,
        count
      );

      if (generatedBands.length === 0) {
        console.log('No new bands generated');
        return [];
      }

      // 将生成的乐队保存到数据库并创建推荐
      for (const generatedBand of generatedBands) {
        // 使用统一的验证和标准化函数
        const validation = validateAndNormalizeBand({
          name: generatedBand.name,
          genre: generatedBand.genre,
          era: generatedBand.era,
          albums: generatedBand.albums,
          description: generatedBand.description,
          styleNotes: generatedBand.styleNotes,
          tier: generatedBand.tier as BandTier
        }, session.genre);

        if (!validation.valid || !validation.band) {
          console.error(`Generated band validation failed: ${validation.errors.join(', ')}`);
          continue;
        }

        const band = validation.band;

        // 检查是否已存在
        const existingBands = await this.db.getBandsByGenre(session.genre);
        const exists = existingBands.some(b =>
          b.name.toLowerCase() === band.name.toLowerCase()
        );

        if (exists) {
          console.log(`Band ${band.name} already exists, skipping`);
          continue;
        }

        // 生成唯一ID
        band.id = this.generateBandId(band.name);

        // 保存到数据库
        await this.db.createBand(band);
        console.log(`Added new band to database: ${band.name} (tier: ${band.tier})`);

        if (!usedBandIds.has(band.id)) {
          recommendations.push({
            band,
            reason: 'Newly discovered band for you',
            confidence: 0.7
          });
          usedBandIds.add(band.id);
        }

        if (recommendations.length >= count) {
          break;
        }
      }
    } catch (error) {
      console.error('Error generating additional bands:', error);
    }

    return recommendations;
  }

  /**
   * 回退推荐逻辑（基于权重的简单推荐）
   */
  private async getFallbackRecommendations(session: Session): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const allBands = await this.db.getBandsByGenre(session.genre);

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

  private async populateGenreBands(genre: string, userLLMConfig?: { endpoint: string; apiKey?: string; model?: string }): Promise<void> {
    const config = getConfig();
    const minBandsForGenre = config.expandGenres.minBandsForGenre || 30;
    const existingBands = await this.db.getBandsByGenre(genre);

    // Detect environment: deployment (PostgreSQL) vs local development (SQLite)
    const isDeployment = !!(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
    const currentBandCount = existingBands.length;

    console.log(`Environment: ${isDeployment ? 'deployment (PostgreSQL)' : 'local development (SQLite)'}`);
    console.log(`Current band count for ${genre}: ${currentBandCount} (minimum required: ${minBandsForGenre})`);

    // Deployment environment: prioritize database data, only use LLM if needed
    if (isDeployment) {
      if (currentBandCount >= minBandsForGenre) {
        console.log(`Deployment mode: Using existing database bands for genre ${genre}`);
        return;
      }

      // In deployment, if database has some bands but not enough, try LLM generation
      // Skip static data in deployment - it's meant for local development seeding
      console.log(`Deployment mode: Database has ${currentBandCount} bands, need ${minBandsForGenre}. Will try LLM generation.`);
    }
    // Local development: use static data first, then LLM if needed
    else {
      // If we already have enough bands from previous runs, skip static data
      if (currentBandCount >= minBandsForGenre) {
        console.log(`Local dev mode: Sufficient bands available for genre ${genre}`);
        return;
      }

      // Try to populate from static data for local development
      if (STATIC_BANDS[genre] && currentBandCount < minBandsForGenre) {
        const staticBands = STATIC_BANDS[genre];
        const existingBandNames = new Set(existingBands.map(b => b.name));
        let bandsToAdd: Band[] = [];

        for (const staticBand of staticBands) {
          if (!existingBandNames.has(staticBand.name)) {
            bandsToAdd.push(staticBand);
          }
        }

        // Add bands to database
        for (const band of bandsToAdd) {
          await this.db.createBand(band);
        }

        console.log(`Local dev mode: Added ${bandsToAdd.length} static bands for genre ${genre}`);

        // Refresh count after adding static bands
        const updatedBands = await this.db.getBandsByGenre(genre);
        if (updatedBands.length >= minBandsForGenre) {
          console.log(`Local dev mode: Sufficient bands after adding static data for genre ${genre}`);
          return;
        }
      }
    }

    // Check if LLM is configured and enabled
    // Priority: User config (BYOK) > Environment variables > Config file
    const envEndpoint = process.env.LLM_ENDPOINT;
    const envModel = process.env.LLM_MODEL;
    const envAuthToken = process.env.LLM_AUTH_TOKEN;
    const configEndpoint = config.llm.endpoint;

    // Determine effective configuration (BYOK mode takes priority)
    const effectiveEndpoint = userLLMConfig?.endpoint || envEndpoint || configEndpoint;
    const effectiveModel = userLLMConfig?.model || envModel || config.llm.model;
    const effectiveApiKey = userLLMConfig?.apiKey || envAuthToken || config.llm.apiKey;
    let configSource: string;
    if (userLLMConfig?.endpoint) {
      configSource = 'user-provided (BYOK)';
    } else if (envEndpoint) {
      configSource = 'environment variable';
    } else {
      configSource = 'config file';
    }

    // Check if LLM is properly configured (not empty and not default localhost)
    const isLLMConfigured = effectiveEndpoint &&
                           effectiveEndpoint.trim() !== '' &&
                           !effectiveEndpoint.includes('localhost:1234');

    console.log(`LLM Configuration: endpoint=${effectiveEndpoint}, model=${effectiveModel}, auth=${effectiveApiKey ? 'configured' : 'none'}, source=${configSource}`);

    if (!isLLMConfigured) {
      console.log(`LLM not properly configured (empty or using default localhost:1234). Skipping band generation for ${genre}.`);
      console.log(`To enable LLM band generation, set LLM_ENDPOINT environment variable, update config.json, or provide user LLM config`);
      return;
    }

    // Create LLM client with effective configuration
    const llmClient = userLLMConfig?.endpoint
      ? new LLMClient({ endpoint: effectiveEndpoint, model: effectiveModel, timeout: config.llm.timeout, apiKey: effectiveApiKey })
      : this.llmClient;

    // Calculate how many bands we need to generate
    const bandsNeeded = minBandsForGenre - currentBandCount;
    const targetCount = Math.min(bandsNeeded, 10); // Generate up to 10 bands at a time

    console.log(`Generating ${targetCount} bands via LLM for genre ${genre}...`);

    try {
      const existingBandNames = existingBands.map(b => b.name);

      // Get reference bands for quality examples
      const referenceBands = existingBands.slice(0, 3);

      // Generate new bands using LLM
      const generatedBands = await llmClient.generateBandsForRecommendation(
        genre,
        existingBandNames,
        referenceBands.length > 0 ? referenceBands : undefined,
        targetCount
      );

      if (generatedBands.length === 0) {
        console.warn(`No bands generated for genre ${genre}`);
        return;
      }

      // Convert generated bands to Band type and insert into database
      let generatedCount = 0;
      for (const generatedBand of generatedBands) {
        const band: Band = {
          id: this.generateBandId(generatedBand.name),
          name: generatedBand.name,
          genre: generatedBand.genre,
          era: generatedBand.era,
          albums: generatedBand.albums,
          description: generatedBand.description,
          styleNotes: generatedBand.styleNotes,
          tier: generatedBand.tier as BandTier
        };

        await this.db.createBand(band);
        generatedCount++;
      }

      console.log(`Successfully added ${generatedCount} LLM-generated bands for genre ${genre}`);

    } catch (error) {
      console.error(`Error generating bands for genre ${genre}:`, error);
    }
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

  private async selectTieredPair(genre: string, comparisonHistory: Comparison[] = []): Promise<ComparisonPair | null> {
    const allBands = await this.db.getBandsByGenre(genre);

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

  private async selectTieredPairWithFallback(genre: string, comparisonHistory: Comparison[] = []): Promise<ComparisonPair | null> {
    const allBands = await this.db.getBandsByGenre(genre);

    // Separate bands by tier
    const tier1Bands = allBands.filter(b => b.tier === 'well-known');
    const tier2Bands = allBands.filter(b => b.tier === 'popular');
    const tier3Bands = allBands.filter(b => b.tier === 'niche');

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
      console.log('Selected Tier 1 × Tier 1 pair (fallback)');
      return tier1Pair;
    }

    // Phase 2: Try Tier 1 × Tier 2 comparisons
    const tier1Tier2Pair = this.findMixedPair(tier1Bands, tier2Bands, previousPairs);
    if (tier1Tier2Pair) {
      console.log('Selected Tier 1 × Tier 2 pair (fallback)');
      return tier1Tier2Pair;
    }

    // Phase 3: Try Tier 2 × Tier 2 comparisons
    const tier2Pair = this.findNewPair(tier2Bands, previousPairs);
    if (tier2Pair) {
      console.log('Selected Tier 2 × Tier 2 pair (fallback)');
      return tier2Pair;
    }

    // Phase 4: FALLBACK - Use Tier 3 bands
    // Try Tier 1 × Tier 3
    const tier1Tier3Pair = this.findMixedPair(tier1Bands, tier3Bands, previousPairs);
    if (tier1Tier3Pair) {
      console.log('Selected Tier 1 × Tier 3 pair (fallback)');
      return tier1Tier3Pair;
    }

    // Try Tier 2 × Tier 3
    const tier2Tier3Pair = this.findMixedPair(tier2Bands, tier3Bands, previousPairs);
    if (tier2Tier3Pair) {
      console.log('Selected Tier 2 × Tier 3 pair (fallback)');
      return tier2Tier3Pair;
    }

    // Try Tier 3 × Tier 3
    const tier3Pair = this.findNewPair(tier3Bands, previousPairs);
    if (tier3Pair) {
      console.log('Selected Tier 3 × Tier 3 pair (fallback)');
      return tier3Pair;
    }

    console.log('No more comparison pairs available even with Tier 3 fallback');
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
