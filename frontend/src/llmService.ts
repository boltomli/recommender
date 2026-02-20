/**
 * 前端 LLM 服务
 * 
 * 在静态模式下直接调用 LLM API，无需后端中转
 * 支持 OpenAI 和 Anthropic API 格式
 */

import type { LLMConfig } from './api';

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

export interface LLMRecommendation {
  band: string;
  reason: string;
  confidence: number;
  genre?: string[];
  era?: string;
  albums?: string[];
  description?: string;
  tier?: string;
}

export class LLMService {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * 更新 LLM 配置
   */
  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 检查 LLM 是否已启用
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.config.endpoint;
  }

  /**
   * 测试 LLM 连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.isEnabled()) {
      return { success: false, message: 'LLM 未启用，请先配置 endpoint 和启用 LLM' };
    }

    try {
      const response = await this.callLLM([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Connection successful" and nothing else.' }
      ]);

      const content = response.choices[0]?.message?.content || '';
      return {
        success: true,
        message: `连接成功！LLM 响应: "${content.trim()}"`,
      };
    } catch (error) {
      console.error('LLM 连接错误:', error);
      
      if (error instanceof Error) {
        return { success: false, message: `连接失败: ${error.message}` };
      }
      
      return { success: false, message: '连接失败: 未知错误' };
    }
  }

  /**
   * 生成推荐
   * 
   * @param genre 流派
   * @param comparisonHistory 对比历史
   * @param seenBands 已看过的乐队
   * @param candidateBands 候选乐队列表
   * @param maxRecommendations 最大推荐数量
   */
  async generateRecommendations(
    genre: string,
    comparisonHistory: Array<{ bandId1: string; bandId2: string; selectedBandId: string }>,
    seenBands: string[],
    candidateBands: Array<{ id: string; name: string; genre: string[]; era: string; albums: string[]; description: string; tier?: string }>,
    maxRecommendations: number = 5
  ): Promise<LLMRecommendation[]> {
    if (!this.isEnabled()) {
      throw new Error('LLM 未启用');
    }

    const historySummary = comparisonHistory
      .map(c => `偏好 ${c.selectedBandId} 胜过 ${c.bandId1 === c.selectedBandId ? c.bandId2 : c.bandId1}`)
      .join('; ');

    const candidateNames = candidateBands.map(b => b.name).join(', ');

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `你是金属音乐推荐专家。根据用户偏好推荐乐队。

重要规则：
1. 优先从候选列表中选择乐队
2. 不要推荐用户已经看过的乐队
3. 说明为什么推荐每个乐队
4. 返回有效的 JSON 格式

JSON 格式：
{
  "recommendations": [
    {
      "band": "乐队名称",
      "reason": "推荐理由",
      "confidence": 0.85
    }
  ]
}`
      },
      {
        role: 'user',
        content: `流派: ${genre}
用户偏好历史: ${historySummary || '无'}
候选乐队: ${candidateNames}
已看过的乐队（不要推荐）: ${seenBands.join(', ')}
请推荐 ${maxRecommendations} 个乐队。`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      const result = JSON.parse(content);
      
      const recommendations: LLMRecommendation[] = (result.recommendations || []).map((rec: any) => ({
        band: rec.band,
        reason: rec.reason,
        confidence: rec.confidence || 0.7,
        genre: rec.genre,
        era: rec.era,
        albums: rec.albums,
        description: rec.description,
        tier: rec.tier
      }));

      // 将推荐结果与候选乐队数据合并
      return recommendations.map(rec => {
        const candidate = candidateBands.find(b => 
          b.name.toLowerCase() === rec.band.toLowerCase()
        );
        if (candidate) {
          return {
            ...rec,
            genre: candidate.genre,
            era: candidate.era,
            albums: candidate.albums,
            description: candidate.description,
            tier: candidate.tier
          };
        }
        return rec;
      });
    } catch (error) {
      console.error('生成推荐失败:', error);
      throw error;
    }
  }

  /**
   * 生成实时建议
   */
  async generateSuggestions(
    genre: string,
    comparisonHistory: Array<{ bandId1: string; bandId2: string; selectedBandId: string }>,
    seenBands: string[],
    candidateBands: Array<{ id: string; name: string; genre: string[]; era: string; albums: string[]; description: string; tier?: string }>,
    count: number = 3
  ): Promise<LLMRecommendation[]> {
    if (!this.isEnabled()) {
      throw new Error('LLM 未启用');
    }

    const historySummary = comparisonHistory
      .map(c => `偏好 ${c.selectedBandId} 胜过 ${c.bandId1 === c.selectedBandId ? c.bandId2 : c.bandId1}`)
      .join('; ');

    const candidateNames = candidateBands.map(b => b.name).join(', ');

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `你是金属音乐推荐专家。根据用户偏好提供实时建议。

重要规则：
1. 优先从候选列表中选择乐队
2. 不要推荐用户已经看过的乐队
3. 说明为什么推荐每个乐队
4. 返回有效的 JSON 格式

JSON 格式：
{
  "suggestions": [
    {
      "band": "乐队名称",
      "reason": "推荐理由",
      "confidence": 0.85
    }
  ]
}`
      },
      {
        role: 'user',
        content: `流派: ${genre}
用户偏好历史: ${historySummary || '无'}
候选乐队: ${candidateNames}
已看过的乐队（不要推荐）: ${seenBands.join(', ')}
请提供 ${count} 个建议。`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      const result = JSON.parse(content);
      
      const suggestions: LLMRecommendation[] = (result.suggestions || []).map((rec: any) => ({
        band: rec.band,
        reason: rec.reason,
        confidence: rec.confidence || 0.7,
        genre: rec.genre,
        era: rec.era,
        albums: rec.albums,
        description: rec.description,
        tier: rec.tier
      }));

      // 将建议结果与候选乐队数据合并
      return suggestions.map(rec => {
        const candidate = candidateBands.find(b => 
          b.name.toLowerCase() === rec.band.toLowerCase()
        );
        if (candidate) {
          return {
            ...rec,
            genre: candidate.genre,
            era: candidate.era,
            albums: candidate.albums,
            description: candidate.description,
            tier: candidate.tier
          };
        }
        return rec;
      });
    } catch (error) {
      console.error('生成建议失败:', error);
      throw error;
    }
  }

  /**
   * 选择对比乐队对
   *
   * 使用 LLM 智能选择下一对要对比的乐队
   */
  async selectComparisonPair(
    genre: string,
    comparisonHistory: Array<{ bandId1: string; bandId2: string; selectedBandId: string }>,
    availableBands: string[]
  ): Promise<[string, string]> {
    if (!this.isEnabled()) {
      // 如果 LLM 未启用，使用随机选择
      return this.getRandomPair(availableBands, comparisonHistory);
    }

    const historySummary = comparisonHistory
      .map(c => `偏好 ${c.selectedBandId} 胜过 ${c.bandId1 === c.selectedBandId ? c.bandId2 : c.bandId1}`)
      .join('; ');

    const previousPairs = comparisonHistory
      .map(c => [c.bandId1, c.bandId2].sort().join(' vs '))
      .join('; ');

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `你是金属音乐推荐引擎。根据用户偏好选择两个乐队进行对比。

重要规则：
1. 选择两个不同的乐队
2. 不要选择已经对比过的组合
3. 一个乐队可以出现在多次对比中，但组合必须是新的
4. 返回有效的 JSON 格式

JSON 格式：
{
  "band1": "乐队名称1",
  "band2": "乐队名称2"
}`
      },
      {
        role: 'user',
        content: `流派: ${genre}
可用乐队: ${availableBands.join(', ')}
用户偏好历史: ${historySummary || '无'}
已对比过的组合: ${previousPairs || '无'}
请选择两个不同的乐队进行对比。`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      const result = JSON.parse(content);

      const band1 = result.band1;
      const band2 = result.band2;

      // 验证返回的乐队是否有效
      if (availableBands.includes(band1) && availableBands.includes(band2) && band1 !== band2) {
        // 检查这对乐队是否已经对比过
        const pairKey = [band1, band2].sort().join('|');
        const previousPairsSet = new Set(
          comparisonHistory.map(c => [c.bandId1, c.bandId2].sort().join('|'))
        );

        if (!previousPairsSet.has(pairKey)) {
          return [band1, band2];
        }
      }

      // 如果 LLM 返回无效结果，回退到随机选择
      return this.getRandomPair(availableBands, comparisonHistory);
    } catch (error) {
      console.error('选择对比乐队对失败:', error);
      return this.getRandomPair(availableBands, comparisonHistory);
    }
  }

  /**
   * 选择与种子乐队对比的乐队
   *
   * 使用 LLM 智能选择一个与种子乐队形成有趣对比的乐队
   */
  async selectBandToCompare(
    genre: string,
    seedBand: string,
    availableBands: string[]
  ): Promise<string> {
    if (!this.isEnabled()) {
      // 如果 LLM 未启用，使用随机选择（排除种子乐队）
      const otherBands = availableBands.filter(b => b.toLowerCase() !== seedBand.toLowerCase());
      if (otherBands.length > 0) {
        return otherBands[Math.floor(Math.random() * otherBands.length)]!;
      }
      return availableBands[0] ?? '';
    }

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `你是金属音乐推荐引擎。根据种子乐队选择一个形成有趣对比的乐队。

重要规则：
1. 选择与种子乐队不同但相关的乐队
2. 可以是风格相似但有差异的乐队，也可以是风格对比鲜明的乐队
3. 返回的乐队必须在可用列表中
4. 返回有效的 JSON 格式

JSON 格式：
{
  "band": "乐队名称",
  "reason": "选择理由"
}`
      },
      {
        role: 'user',
        content: `流派: ${genre}
种子乐队: ${seedBand}
可用乐队: ${availableBands.join(', ')}
请选择一个与 "${seedBand}" 形成有趣对比的乐队。不要选择种子乐队本身。`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      const result = JSON.parse(content);

      const selectedBand = result.band;

      // 验证返回的乐队是否有效且不是种子乐队
      if (availableBands.includes(selectedBand) &&
          selectedBand.toLowerCase() !== seedBand.toLowerCase()) {
        return selectedBand;
      }

      // 如果 LLM 返回无效结果，回退到随机选择
      const otherBands = availableBands.filter(b => b.toLowerCase() !== seedBand.toLowerCase());
      if (otherBands.length > 0) {
        return otherBands[Math.floor(Math.random() * otherBands.length)]!;
      }
      return availableBands[0] ?? '';
    } catch (error) {
      console.error('选择对比乐队失败:', error);
      const otherBands = availableBands.filter(b => b.toLowerCase() !== seedBand.toLowerCase());
      if (otherBands.length > 0) {
        return otherBands[Math.floor(Math.random() * otherBands.length)]!;
      }
      return availableBands[0] ?? '';
    }
  }

  /**
   * 调用 LLM API
   * 
   * 根据配置决定使用代理还是直接调用
   */
  private async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const isAnthropic = this.config.apiType === 'anthropic';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    // 检测是否在开发环境
    const isDev = import.meta.env.DEV;
    
    // 检查是否强制使用代理
    const forceProxy = import.meta.env.VITE_USE_LLM_PROXY !== 'false';
    
    console.log('[LLMService] Environment check:', { 
      isDev, 
      forceProxy,
      isStaticMode: typeof window !== 'undefined' && window.location.hostname !== 'localhost',
      endpoint: this.config.endpoint 
    });
    
    try {
      let response;
      
      if (isDev && !forceProxy) {
        // 开发环境且不强制使用代理：尝试直接调用（需要 LLM 支持 CORS）
        console.warn('[LLMService] Warning: Direct LLM call may fail due to CORS. Set VITE_USE_LLM_PROXY=true to use proxy.');
        console.log('[LLMService] Attempting direct call (may fail with CORS)...');
        try {
          response = await this.callLLMDirectly(messages, isAnthropic, controller.signal);
        } catch (directError) {
          console.error('[LLMService] Direct call failed:', directError);
          console.log('[LLMService] Falling back to dev proxy...');
          // 直接调用失败，回退到代理
          response = await this.callLLMViaDevProxy(messages, isAnthropic, controller.signal);
        }
      } else if (isDev) {
        // 开发环境：选择代理方式
        const useNetlifyProxy = import.meta.env.VITE_USE_NETLIFY_PROXY === 'true';
        
        if (useNetlifyProxy) {
          // 使用 Netlify Function 代理（需要运行 netlify dev）
          console.log('[LLMService] Using Netlify Function proxy (dev mode)');
          try {
            response = await this.callLLMViaProxy(messages, isAnthropic, controller.signal);
          } catch (proxyError) {
            console.warn('[LLMService] Netlify proxy failed:', proxyError);
            throw new Error(
              'Netlify Function 代理调用失败。请确保已运行 netlify dev\n' +
              '或者设置 VITE_USE_NETLIFY_PROXY=false 使用后端代理'
            );
          }
        } else {
          // 使用 Vite 代理到后端
          console.log('[LLMService] Using dev proxy to backend');
          try {
            response = await this.callLLMViaDevProxy(messages, isAnthropic, controller.signal);
          } catch (proxyError) {
            console.warn('[LLMService] Dev proxy failed:', proxyError);
            throw new Error(
              'LLM 代理调用失败。请确保后端服务运行在 http://localhost:3001\n' +
              '或者设置 VITE_USE_NETLIFY_PROXY=true 使用 Netlify Function 代理\n' +
              '或者设置 VITE_USE_LLM_PROXY=false 直接调用 LLM API（需要 LLM 支持 CORS）'
            );
          }
        }
      } else {
        // 生产环境：通过 Netlify Function 代理
        console.log('[LLMService] Using Netlify Function proxy');
        try {
          response = await this.callLLMViaProxy(messages, isAnthropic, controller.signal);
        } catch (proxyError) {
          console.warn('[LLMService] Netlify proxy failed:', proxyError);
          throw new Error('LLM 代理调用失败，请检查 Netlify Function 是否正确部署');
        }
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API 错误: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as Record<string, unknown>;
      
      // 将 Anthropic 响应转换为 OpenAI 格式
      if (isAnthropic) {
        const content = (data.content as Array<{text?: string}>)?.[0]?.text 
          || (data.completion as string) 
          || '';
        return {
          choices: [{
            message: {
              content,
            },
          }],
        };
      }

      return data as unknown as LLMResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * 直接调用 LLM API（开发环境）
   */
  private async callLLMDirectly(
    messages: LLMMessage[],
    isAnthropic: boolean,
    signal: AbortSignal
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      if (isAnthropic) {
        headers['x-api-key'] = this.config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
    }

    if (isAnthropic) {
      const systemMessage = messages.find(m => m.role === 'system')?.content || '';
      const userMessages = messages.filter(m => m.role !== 'system');
      
      return fetch(`${this.config.endpoint.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model || 'claude-3-sonnet-20240229',
          max_tokens: 2048,
          temperature: 0.7,
          system: systemMessage,
          messages: userMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
        signal,
      });
    } else {
      return fetch(`${this.config.endpoint.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model || 'gpt-3.5-turbo',
          messages,
          temperature: 0.7,
        }),
        signal,
      });
    }
  }

  /**
   * 通过 Vite 代理调用 LLM（开发环境）
   */
  private async callLLMViaDevProxy(
    messages: LLMMessage[],
    isAnthropic: boolean,
    signal: AbortSignal
  ): Promise<Response> {
    // 开发环境使用 Vite 代理到后端
    const proxyUrl = '/api/llm-proxy';
    
    console.log('[LLMService] Calling dev proxy:', proxyUrl);
    console.log('[LLMService] Request body:', {
      endpoint: this.config.endpoint,
      model: this.config.model,
      apiType: isAnthropic ? 'anthropic' : 'openai',
      messageCount: messages.length,
    });
    
    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: this.config.endpoint,
          apiKey: this.config.apiKey,
          model: this.config.model,
          apiType: isAnthropic ? 'anthropic' : 'openai',
          messages,
          temperature: 0.7,
          max_tokens: 2048,
        }),
        signal,
      });
      
      console.log('[LLMService] Dev proxy response:', response.status, response.statusText);
      return response;
    } catch (error) {
      console.error('[LLMService] Dev proxy fetch error:', error);
      throw error;
    }
  }

  /**
   * 通过 Netlify Function 代理调用 LLM（生产环境）
   */
  private async callLLMViaProxy(
    messages: LLMMessage[],
    isAnthropic: boolean,
    signal: AbortSignal
  ): Promise<Response> {
    // 使用相对路径调用 Netlify Function
    const proxyUrl = '/.netlify/functions/llm-proxy';
    
    return fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: this.config.endpoint,
        apiKey: this.config.apiKey,
        model: this.config.model,
        apiType: isAnthropic ? 'anthropic' : 'openai',
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
      signal,
    });
  }

  /**
   * 清理 LLM 响应内容
   */
  private cleanLLMResponse(content: string): string {
    // 移除 thinking 标签及其内容
    let cleaned = content.replace(/[\s\S]*?<\/think>/gi, '');

    // 移除其他 XML 标签
    cleaned = cleaned.replace(/<[^>]+>/g, '');

    // 移除 markdown 代码块标记
    cleaned = cleaned.replace(/```(?:json|JSON)?\s*/g, '');
    cleaned = cleaned.replace(/```\s*$/g, '');

    // 修剪空白
    cleaned = cleaned.trim();

    // 尝试提取 JSON 对象（从第一个 { 到最后一个 }）
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    return cleaned;
  }

  /**
   * 随机选择一对乐队（回退方案）
   */
  private getRandomPair(
    availableBands: string[],
    comparisonHistory: Array<{ bandId1: string; bandId2: string }>
  ): [string, string] {
    // 获取所有已对比的组合
    const previousPairs = new Set(
      comparisonHistory.map(c => [c.bandId1, c.bandId2].sort().join('|'))
    );

    // 尝试找到新的组合
    for (let i = 0; i < 100; i++) {
      const shuffled = [...availableBands].sort(() => Math.random() - 0.5);
      const pair = [shuffled[0], shuffled[1]].sort();
      const pairKey = pair.join('|');

      if (!previousPairs.has(pairKey)) {
        return pair as [string, string];
      }
    }

    // 如果没有新组合，返回前两个
    return availableBands.slice(0, 2) as [string, string];
  }
}

// 导出单例实例
let llmServiceInstance: LLMService | null = null;

export function getLLMService(config?: LLMConfig): LLMService {
  if (!llmServiceInstance && config) {
    llmServiceInstance = new LLMService(config);
  } else if (llmServiceInstance && config) {
    llmServiceInstance.updateConfig(config);
  }
  
  if (!llmServiceInstance) {
    throw new Error('LLMService 尚未初始化，请提供配置');
  }
  
  return llmServiceInstance;
}

export function resetLLMService(): void {
  llmServiceInstance = null;
}
