import { LLMConfig, LLMMessage, LLMResponse } from './types';
import { STANDARD_GENRES, generateDataFormatReference } from './dataStandards';

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  private cleanLLMResponse(content: string): string {
    // Remove thinking tags and their content
    let cleaned = content.replace(/[\s\S]*?<\/think>/gi, '');
    
    // Remove any other XML-like tags that might be present
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    
    // Remove markdown code block markers (```json, ```JSON, ```)
    cleaned = cleaned.replace(/```(?:json|JSON)?\s*/g, '');
    cleaned = cleaned.replace(/```\s*$/g, '');
    
    // Trim whitespace
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  async generateBandInfo(genre: string, knownBands: string[] = [], bandName?: string, referenceBands?: any[]): Promise<any> {
    const standardGenres = ['thrash', 'death', 'black', 'power', 'doom', 'progressive', 'heavy', 'speed', 'groove', 'folk'];
    
    const prompt = bandName
      ? `Generate detailed information about the metal band "${bandName}" in the ${genre} subgenre.`
      : `Generate a list of 5 prominent metal bands in the ${genre} subgenre.`;

    let userPrompt = prompt;

    // If we have known bands, exclude them from the response
    if (knownBands.length > 0 && !bandName) {
      userPrompt = `Generate a list of 5 prominent metal bands in the ${genre} subgenre. IMPORTANT: Do NOT include any of these bands: ${knownBands.join(', ')}. Generate NEW bands that are not in this list.`;
    }

    // Add reference examples if available
    let referenceText = '';
    if (referenceBands && referenceBands.length > 0 && !bandName) {
      const examples = referenceBands.slice(0, 3).map(band => 
        `Example ${band.name}:\n` +
        `  Genre: ${Array.isArray(band.genre) ? band.genre.join(', ') : band.genre}\n` +
        `  Era: ${band.era}\n` +
        `  Albums: ${Array.isArray(band.albums) ? band.albums.slice(0, 3).join(', ') : band.albums}\n` +
        `  Description: ${band.description}`
      ).join('\n\n');
      referenceText = `\n\nREFERENCE EXAMPLES (existing bands in ${genre}):\n${examples}\n\nUse these as a reference for quality and format.`;
      userPrompt += referenceText;
    }

    // Add genre standardization
    userPrompt += `\n\nGENRE STANDARDIZATION: You MUST use only these standard genre names: ${standardGenres.join(', ')}. The primary genre MUST be "${genre}". Additional genres (if any) must also be from this standard list.`;

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a metal music expert. Provide accurate, detailed information about metal bands. Format your response as valid JSON with the following structure: For single band: {"name": "Band Name", "genre": ["genre1", "genre2"], "era": "1980s", "albums": ["Album1", "Album2"], "description": "Detailed description", "styleNotes": "Optional style evolution notes"}. For multiple bands: {"bands": [{"name": "...", ...}]}.'
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      return JSON.parse(content);
    } catch (error) {
      console.error('Error generating band info:', error);
      throw error;
    }
  }

  async selectComparisonPair(
    genre: string,
    comparisonHistory: any[],
    availableBands: string[]
  ): Promise<[string, string]> {
    const historySummary = comparisonHistory
      .map((c: any) => `Preferred ${c.selectedBandId} over ${c.bandId1 === c.selectedBandId ? c.bandId2 : c.bandId1}`)
      .join('; ');

    const previousPairs = comparisonHistory
      .map((c: any) => [c.bandId1, c.bandId2].sort().join(' vs '))
      .join('; ');

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a recommendation engine for metal music. Select two bands for comparison based on user preferences. Return valid JSON: {"band1": "Band Name 1", "band2": "Band Name 2"}. IMPORTANT: Always select two DIFFERENT bands that have NOT been compared together before. It is acceptable if one band has appeared in previous comparisons, but NEVER return the exact same pair of bands again.'
      },
      {
        role: 'user',
        content: `Genre: ${genre}. Available bands: ${availableBands.join(', ')}. User preference history: ${historySummary || 'None'}. Previous comparison pairs: ${previousPairs || 'None'}. Select two DIFFERENT bands that have NOT been compared together before. One band may have appeared before, but the pair must be new.`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      const result = JSON.parse(content);
      return [result.band1, result.band2];
    } catch (error) {
      console.error('Error selecting comparison pair:', error);
      // Fallback: select random pair avoiding previous comparisons
      return this.getRandomPair(availableBands, comparisonHistory);
    }
  }

  private getRandomPair(availableBands: string[], comparisonHistory: any[]): [string, string] {
    // Get all previous pairs
    const previousPairs = new Set(
      comparisonHistory.map((c: any) => [c.bandId1, c.bandId2].sort().join('|'))
    );

    // Try to find a new pair
    for (let i = 0; i < 100; i++) {
      const shuffled = [...availableBands].sort(() => Math.random() - 0.5);
      const pair = [shuffled[0], shuffled[1]].sort();
      const pairKey = pair.join('|');

      if (!previousPairs.has(pairKey)) {
        return pair as [string, string];
      }
    }

    // If no new pair found, return first two
    return availableBands.slice(0, 2) as [string, string];
  }

  async generateRecommendations(
    genre: string,
    comparisonHistory: any[],
    maxRecommendations: number,
    seenBands: string[] = []
  ): Promise<any[]> {
    const historySummary = comparisonHistory
      .map((c: any) => `Preferred ${c.selectedBandId} over ${c.bandId1 === c.selectedBandId ? c.bandId2 : c.bandId1}`)
      .join('; ');

    let userPrompt = `Genre: ${genre}. User preferences: ${historySummary || 'None'}. Generate ${maxRecommendations} recommendations.`;

    // Exclude seen bands from recommendations
    if (seenBands.length > 0) {
      userPrompt += ` IMPORTANT: Do NOT recommend any of these bands that the user has already seen: ${seenBands.join(', ')}. Recommend NEW bands only.`;
    }

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a metal music recommendation expert. Based on user preferences, recommend up to ${maxRecommendations} bands. Return valid JSON: {"recommendations": [{"band": "Band Name", "reason": "Why this band matches their taste", "confidence": 0.85}]}.`
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      const result = JSON.parse(content);
      return result.recommendations || [];
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [];
    }
  }

  /**
   * 基于候选乐队列表生成推荐
   * 优先从候选列表中选择，如果候选不足可以推荐其他合适的乐队
   */
  async generateRecommendationsWithCandidates(
    genre: string,
    comparisonHistory: any[],
    maxRecommendations: number,
    seenBands: string[] = [],
    candidateBands: string[] = []
  ): Promise<any[]> {
    const historySummary = comparisonHistory
      .map((c: any) => `Preferred ${c.selectedBandId} over ${c.bandId1 === c.selectedBandId ? c.bandId2 : c.bandId1}`)
      .join('; ');

    let userPrompt = `Genre: ${genre}. User preferences: ${historySummary || 'None'}. Generate ${maxRecommendations} recommendations.`;

    // 提供候选乐队列表，让LLM优先选择
    if (candidateBands.length > 0) {
      userPrompt += `\n\nPRIORITY CANDIDATES (strongly prefer selecting from these): ${candidateBands.join(', ')}.`;
    }

    // Exclude seen bands from recommendations
    if (seenBands.length > 0) {
      userPrompt += `\n\nEXCLUSIONS (do NOT recommend these): ${seenBands.join(', ')}.`;
    }

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a metal music recommendation expert. Based on user preferences, recommend up to ${maxRecommendations} bands.

INSTRUCTIONS:
1. PRIORITIZE selecting from the provided candidate bands list
2. Only recommend bands NOT in the exclusions list
3. Provide specific reasons why each band matches the user's taste
4. For bands NOT in the candidate list, you MUST provide complete band information
5. Return valid JSON with this structure:
{
  "recommendations": [
    {
      "band": "Band Name",
      "reason": "Why this band matches their taste",
      "confidence": 0.85,
      "genre": ["genre1", "genre2"],
      "era": "1980s-1990s",
      "albums": ["Album 1", "Album 2", "Album 3"],
      "description": "Brief description of the band's style and significance",
      "tier": "well-known|popular|niche"
    }
  ]
}

REQUIRED FIELDS for new bands (not in candidate list):
- genre: array of genres (use standard genres: thrash, death, black, power, doom, progressive, heavy, speed, groove, folk)
- era: active years or decade (e.g., "1980s-present", "1990s-2000s")
- albums: array of 2-5 notable albums
- description: 1-2 sentences describing the band
- tier: "well-known" (global fame), "popular" (metal community), or "niche" (underground)`
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      const result = JSON.parse(content);
      return result.recommendations || [];
    } catch (error) {
      console.error('Error generating recommendations with candidates:', error);
      return [];
    }
  }

  async generateRealTimeSuggestions(
    genre: string,
    comparisonHistory: any[],
    numSuggestions: number,
    seenBands: string[] = []
  ): Promise<any[]> {
    const historySummary = comparisonHistory
      .map((c: any) => `Preferred ${c.selectedBandId} over ${c.bandId1 === c.selectedBandId ? c.bandId2 : c.bandId1}`)
      .join('; ');

    let userPrompt = `Genre: ${genre}. User preferences: ${historySummary || 'None'}. Generate ${numSuggestions} real-time suggestions for the user based on their preferences.`;

    // Exclude seen bands from suggestions
    if (seenBands.length > 0) {
      userPrompt += ` IMPORTANT: Do NOT suggest any of these bands that the user has already seen: ${seenBands.join(', ')}. Suggest NEW bands only.`;
    }

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a metal music recommendation expert. Based on user preferences, suggest up to ${numSuggestions} bands as real-time recommendations. Return valid JSON: {"suggestions": [{"band": "Band Name", "reason": "Why this band matches their taste", "confidence": 0.85}]}.`
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      const result = JSON.parse(content);
      return result.suggestions || [];
    } catch (error) {
      console.error('Error generating real-time suggestions:', error);
      return [];
    }
  }

  /**
   * 基于候选乐队列表生成实时建议
   * 优先从候选列表中选择
   */
  async generateRealTimeSuggestionsWithCandidates(
    genre: string,
    comparisonHistory: any[],
    numSuggestions: number,
    seenBands: string[] = [],
    candidateBands: string[] = []
  ): Promise<any[]> {
    const historySummary = comparisonHistory
      .map((c: any) => `Preferred ${c.selectedBandId} over ${c.bandId1 === c.selectedBandId ? c.bandId2 : c.bandId1}`)
      .join('; ');

    let userPrompt = `Genre: ${genre}. User preferences: ${historySummary || 'None'}. Generate ${numSuggestions} real-time suggestions.`;

    // 提供候选乐队列表，让LLM优先选择
    if (candidateBands.length > 0) {
      userPrompt += `\n\nPRIORITY CANDIDATES (strongly prefer selecting from these): ${candidateBands.join(', ')}.`;
    }

    // Exclude seen bands from suggestions
    if (seenBands.length > 0) {
      userPrompt += `\n\nEXCLUSIONS (do NOT suggest these): ${seenBands.join(', ')}.`;
    }

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a metal music recommendation expert. Based on user preferences, suggest up to ${numSuggestions} bands as real-time recommendations.

INSTRUCTIONS:
1. PRIORITIZE selecting from the provided candidate bands list
2. Only suggest bands NOT in the exclusions list
3. Provide specific reasons why each band matches the user's taste
4. For bands NOT in the candidate list, you MUST provide complete band information
5. Return valid JSON with this structure:
{
  "suggestions": [
    {
      "band": "Band Name",
      "reason": "Why this band matches their taste",
      "confidence": 0.85,
      "genre": ["genre1", "genre2"],
      "era": "1980s-1990s",
      "albums": ["Album 1", "Album 2", "Album 3"],
      "description": "Brief description of the band's style and significance",
      "tier": "well-known|popular|niche"
    }
  ]
}

REQUIRED FIELDS for new bands (not in candidate list):
- genre: array of genres (use standard genres: thrash, death, black, power, doom, progressive, heavy, speed, groove, folk)
- era: active years or decade (e.g., "1980s-present", "1990s-2000s")
- albums: array of 2-5 notable albums
- description: 1-2 sentences describing the band
- tier: "well-known" (global fame), "popular" (metal community), or "niche" (underground)`
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      const result = JSON.parse(content);
      return result.suggestions || [];
    } catch (error) {
      console.error('Error generating real-time suggestions with candidates:', error);
      return [];
    }
  }

  async updateBandTier(bandName: string, genre: string, currentDescription: string, referenceBands?: any[]): Promise<{ tier: string; reasoning: string }> {
    // Add reference examples if available
    let referenceText = '';
    if (referenceBands && referenceBands.length > 0) {
      const examples = referenceBands.slice(0, 3).map(band => 
        `Example ${band.name} (${band.tier}):\n` +
        `  Genre: ${Array.isArray(band.genre) ? band.genre.join(', ') : band.genre}\n` +
        `  Description: ${band.description}`
      ).join('\n\n');
      referenceText = `\n\nREFERENCE EXAMPLES (bands with known tiers):\n${examples}\n\nUse these as a reference for tier classification.`;
    }

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a metal music expert specializing in band classification. Evaluate the popularity and influence of metal bands and assign them to one of three tiers: "well-known" (globally famous, mainstream recognition), "popular" (well-known within metal community, significant following), or "niche" (underground, limited recognition). Your response must be valid JSON ONLY, no other text or formatting. Format: {"tier": "well-known|popular|niche", "reasoning": "Brief explanation for the tier assignment"}'
      },
      {
        role: 'user',
        content: `Evaluate the tier for the metal band "${bandName}" in the ${genre} subgenre. Description: ${currentDescription}.${referenceText} Consider their mainstream recognition, influence on the genre, and fanbase size. Return ONLY valid JSON, no explanations or additional text.`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      
      try {
        const result = JSON.parse(content);
        return {
          tier: result.tier || 'niche',
          reasoning: result.reasoning || 'No reasoning provided'
        };
      } catch (parseError) {
        console.error(`Failed to parse tier evaluation for ${bandName} as JSON`);
        console.error('Response preview:', content.substring(0, 200));
        return {
          tier: 'niche',
          reasoning: 'Failed to parse LLM response, using default tier'
        };
      }
    } catch (error) {
      console.error(`Error updating band tier for ${bandName}:`, error);
      return {
        tier: 'niche',
        reasoning: `Error occurred: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async generateBandsForExpansion(
    genre: string,
    excludeBands: string[],
    referenceBands?: any[]
  ): Promise<{ name: string; genre: string[]; era: string; albums: string[]; description: string; tier: string; styleNotes: string } | null> {
    let referenceText = '';
    if (referenceBands && referenceBands.length > 0) {
      const examples = referenceBands.slice(0, 3).map(band =>
        `Example ${band.name}:\n` +
        `  Genre: ${Array.isArray(band.genre) ? band.genre.join(', ') : band.genre}\n` +
        `  Era: ${band.era}\n` +
        `  Albums: ${Array.isArray(band.albums) ? band.albums.slice(0, 3).join(', ') : band.albums}\n` +
        `  Description: ${band.description}\n` +
        `  Tier: ${band.tier}`
      ).join('\n\n');
      referenceText = `\n\nREFERENCE EXAMPLES (existing bands in ${genre}):\n${examples}\n\nUse these as a reference for quality and format.`;
    }

    const standardGenres = ['thrash', 'death', 'black', 'power', 'doom', 'progressive', 'heavy', 'speed', 'groove', 'folk'];

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a metal music expert. Generate detailed information about ONE metal band. Your response must be valid JSON ONLY, no other text or formatting. Format: {"name": "Band Name", "genre": ["genre1", "genre2"], "era": "1980s", "albums": ["Album1", "Album2"], "description": "Detailed description", "styleNotes": "Brief style evolution notes (30-150 characters)", "tier": "well-known|popular|niche"}'
      },
      {
        role: 'user',
        content: `Generate ONE prominent metal band in the ${genre} subgenre.${referenceText} IMPORTANT: Do NOT generate any of these bands: ${excludeBands.join(', ')}. Generate a NEW band that is not in this list.

GENRE STANDARDIZATION: You MUST use only these standard genre names: ${standardGenres.join(', ')}. The primary genre MUST be "${genre}". Additional genres (if any) must also be from this standard list.

Return ONLY valid JSON, no explanations or additional text.`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');

      try {
        const result = JSON.parse(content);
        return result || null;
      } catch (parseError) {
        console.error('Failed to parse LLM response as JSON');
        console.error('Response preview:', content.substring(0, 200));
        return null;
      }
    } catch (error) {
      console.error('Error generating band for expansion:', error);
      return null;
    }
  }

  /**
   * 为推荐系统生成不在数据库中的乐队列表
   * 当某个流派的乐队数据不足时，调用此方法生成补充乐队
   */
  async generateBandsForRecommendation(
    genre: string,
    excludeBands: string[],
    referenceBands?: any[],
    targetCount: number = 10
  ): Promise<Array<{ name: string; genre: string[]; era: string; albums: string[]; description: string; tier: string; styleNotes: string }>> {
    let referenceText = '';
    if (referenceBands && referenceBands.length > 0) {
      const examples = referenceBands.slice(0, 3).map(band =>
        `Example ${band.name}:\n` +
        `  Genre: ${Array.isArray(band.genre) ? band.genre.join(', ') : band.genre}\n` +
        `  Era: ${band.era}\n` +
        `  Albums: ${Array.isArray(band.albums) ? band.albums.slice(0, 3).join(', ') : band.albums}\n` +
        `  Description: ${band.description}\n` +
        `  Tier: ${band.tier}`
      ).join('\n\n');
      referenceText = `\n\nREFERENCE EXAMPLES (existing bands in ${genre}):\n${examples}\n\nUse these as a reference for quality and format.`;
    }

    const dataFormatRef = generateDataFormatReference();

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a metal music expert. Generate ${targetCount} prominent metal bands in the specified subgenre. Your response must be valid JSON ONLY, no other text or formatting.

${dataFormatRef}

JSON FORMAT:
{"bands": [{"name": "Band Name", "genre": ["genre1", "genre2"], "era": "1980s", "albums": ["Album1", "Album2", "Album3"], "description": "Detailed description (1-2 sentences)", "styleNotes": "Brief style evolution notes (30-150 characters)", "tier": "well-known|popular|niche"}]}

TIER GUIDELINES:
- "well-known": Globally famous, mainstream recognition (e.g., Metallica, Iron Maiden)
- "popular": Well-known within metal community, significant following (e.g., Testament, Exodus)
- "niche": Underground, limited recognition but influential (e.g., obscure demo bands)`
      },
      {
        role: 'user',
        content: `Generate ${targetCount} prominent metal bands in the ${genre} subgenre.${referenceText}

IMPORTANT CONSTRAINTS:
1. Do NOT include any of these existing bands: ${excludeBands.join(', ')}
2. Generate NEW bands that are NOT in the list above
3. Include a mix of tiers (well-known, popular, and niche) for variety
4. Focus on bands that are truly representative of ${genre} metal
5. ALL fields in the DATA FORMAT REFERENCE are REQUIRED

GENRE STANDARDIZATION (CRITICAL):
- You MUST use ONLY these standard genre names: ${STANDARD_GENRES.join(', ')}
- The primary genre MUST be "${genre}"
- Additional genres (if any) must also be from the standard list above
- DO NOT use sub-genres like "melodic death", "technical thrash", "symphonic black", etc.
- Use the main genre categories only

Return ONLY valid JSON, no explanations or additional text.`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');

      try {
        const result = JSON.parse(content);
        const bands = result.bands || [];

        // Basic validation - full validation will be done in recommendationEngine
        return bands.map((band: any) => ({
          name: band.name,
          genre: Array.isArray(band.genre) ? band.genre : [genre],
          era: band.era || 'Unknown',
          albums: Array.isArray(band.albums) ? band.albums : [],
          description: band.description || '',
          tier: ['well-known', 'popular', 'niche'].includes(band.tier) ? band.tier : 'niche',
          styleNotes: band.styleNotes || ''
        })).filter((band: any) => band.name && !excludeBands.includes(band.name));
      } catch (parseError) {
        console.error('Failed to parse LLM response as JSON');
        console.error('Response preview:', content.substring(0, 500));
        return [];
      }
    } catch (error) {
      console.error('Error generating bands for recommendation:', error);
      return [];
    }
  }

  async generateDistinguishingInfo(bandNames: string[], genre: string, referenceBands?: any[]): Promise<Array<{ name: string; distinguishingInfo: string }>> {
    const bandList = bandNames.map(name => `"${name}"`).join(', ');
    
    // Add reference examples if available
    let referenceText = '';
    if (referenceBands && referenceBands.length > 0) {
      const examples = referenceBands.slice(0, 3).map(band => 
        `Example ${band.name}:\n` +
        `  Genre: ${Array.isArray(band.genre) ? band.genre.join(', ') : band.genre}\n` +
        `  Description: ${band.description}`
      ).join('\n\n');
      referenceText = `\n\nREFERENCE EXAMPLES (bands in ${genre}):\n${examples}\n\nUse these as a reference for the type of distinguishing information to provide.`;
    }
    
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a metal music expert. Generate distinguishing information for bands with the same name. Your response must be valid JSON ONLY, no other text or formatting. Format: {"bands": [{"name": "Band Name", "distinguishingInfo": "Country of origin, active era, or other unique identifier"}]}'
      },
      {
        role: 'user',
        content: `Generate distinguishing information for these metal bands in the ${genre} subgenre that have the same name: ${bandList}.${referenceText} For each band, provide their country of origin, active era, or other unique information to help distinguish them. Return ONLY valid JSON, no explanations or additional text.`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      
      try {
        const result = JSON.parse(content);
        return result.bands || [];
      } catch (parseError) {
        console.error('Failed to parse distinguishing info as JSON');
        console.error('Response preview:', content.substring(0, 200));
        return [];
      }
    } catch (error) {
      console.error('Error generating distinguishing info:', error);
      return [];
    }
  }

  async standardizeBandInfo(
    bandName: string,
    genres: string,
    era: string,
    currentDescription: string,
    currentStyleNotes: string,
    exampleBands: any[]
  ): Promise<{ description: string; styleNotes: string }> {
    // Format example bands for the prompt
    const examplesText = exampleBands.map((band, index) => 
      `Example ${index + 1}:\n` +
      `  Name: ${band.name}\n` +
      `  Genre: ${band.genre}\n` +
      `  Era: ${band.era}\n` +
      `  Description: ${band.description}\n` +
      `  Style Notes: ${band.styleNotes}`
    ).join('\n\n');

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a metal music expert. Standardize band descriptions and style notes to follow a consistent format.

DESCRIPTION GUIDELINES:
- Keep descriptions concise (1-2 sentences)
- Focus on the band's defining characteristics
- Mention their primary genre and key influences
- Include their country of origin if notable
- Avoid overly flowery language
- Use present tense

STYLE NOTES GUIDELINES:
- Focus on musical evolution and stylistic changes
- Mention key albums or eras that marked style changes
- Note any unique techniques or approaches
- Keep it brief and informative
- If the band has maintained a consistent style, note that

EXAMPLES OF DESIRED FORMAT:
${examplesText}

Your response must be valid JSON ONLY, no other text or formatting.
Format: {"description": "Standardized description", "styleNotes": "Standardized style notes"}`
      },
      {
        role: 'user',
        content: `Standardize the description and style notes for the metal band "${bandName}".

Current information:
- Name: ${bandName}
- Genre: ${genres}
- Era: ${era}
- Current description: ${currentDescription}
- Current style notes: ${currentStyleNotes || '(none)'}

Follow the guidelines shown in the examples above. Return ONLY valid JSON, no explanations or additional text.`
      }
    ];

    try {
      const response = await this.callLLM(messages);
      const content = this.cleanLLMResponse(response.choices[0]?.message?.content || '{}');
      
      try {
        const result = JSON.parse(content);
        return {
          description: result.description || currentDescription,
          styleNotes: result.styleNotes || currentStyleNotes
        };
      } catch (parseError) {
        console.error(`Failed to parse standardized info for ${bandName} as JSON`);
        console.error('Response preview:', content.substring(0, 200));
        return {
          description: currentDescription,
          styleNotes: currentStyleNotes
        };
      }
    } catch (error) {
      console.error(`Error standardizing band info for ${bandName}:`, error);
      return {
        description: currentDescription,
        styleNotes: currentStyleNotes
      };
    }
  }

  private async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const isAnthropic = this.config.apiType === 'anthropic';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    // Build headers based on API type
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

    try {
      let response;
      
      if (isAnthropic) {
        // Anthropic API format
        const systemMessage = messages.find(m => m.role === 'system')?.content || '';
        const userMessages = messages.filter(m => m.role !== 'system');
        
        response = await fetch(`${this.config.endpoint}/v1/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.config.model,
            max_tokens: 2048,
            temperature: 0.7,
            system: systemMessage,
            messages: userMessages.map(m => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
            })),
          }),
          signal: controller.signal,
        });
      } else {
        // OpenAI-compatible API format
        response = await fetch(`${this.config.endpoint}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.config.model,
            messages: messages,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as Record<string, unknown>;
      
      // Convert Anthropic response to OpenAI format if needed
      if (isAnthropic) {
        const content = (data.content as Array<{text?: string}>)?.[0]?.text 
          || (data.completion as string) 
          || '';
        const anthropicResponse: LLMResponse = {
          choices: [{
            message: {
              content,
            },
          }],
        };
        return anthropicResponse;
      }

      return data as unknown as LLMResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}