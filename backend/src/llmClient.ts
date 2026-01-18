import { LLMConfig, LLMMessage, LLMResponse } from './types';

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async generateBandInfo(genre: string, knownBands: string[] = [], bandName?: string): Promise<any> {
    const prompt = bandName
      ? `Generate detailed information about the metal band "${bandName}" in the ${genre} subgenre.`
      : `Generate a list of 5 prominent metal bands in the ${genre} subgenre.`;

    let userPrompt = prompt;

    // If we have known bands, exclude them from the response
    if (knownBands.length > 0 && !bandName) {
      userPrompt = `Generate a list of 5 prominent metal bands in the ${genre} subgenre. IMPORTANT: Do NOT include any of these bands: ${knownBands.join(', ')}. Generate NEW bands that are not in this list.`;
    }

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
      const content = response.choices[0]?.message?.content || '{}';
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
      const content = response.choices[0]?.message?.content || '{}';
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
      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);
      return result.recommendations || [];
    } catch (error) {
      console.error('Error generating recommendations:', error);
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
      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);
      return result.suggestions || [];
    } catch (error) {
      console.error('Error generating real-time suggestions:', error);
      return [];
    }
  }

  private async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as LLMResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}