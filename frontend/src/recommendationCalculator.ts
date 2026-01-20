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

export interface Comparison {
  bandId1: string;
  bandId2: string;
  selectedBandId: string;
  timestamp: Date;
}

export interface Recommendation {
  band: Band;
  reason: string;
  confidence: number;
}

export class RecommendationCalculator {
  private preferenceWeights: Record<string, number>;

  constructor() {
    this.preferenceWeights = {};
  }

  updateWeights(comparison: Comparison, band1: Band, band2: Band): void {
    const selectedBandId = comparison.selectedBandId;
    const selectedBand = selectedBandId === band1.id ? band1 : band2;

    selectedBand.genre.forEach(g => {
      this.preferenceWeights[g] = (this.preferenceWeights[g] || 0) + 1;
    });
  }

  calculateRecommendations(
    bands: Band[],
    comparedBandIds: Set<string>,
    count: number = 5
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    const sortedBands = bands
      .filter(b => !comparedBandIds.has(b.id))
      .sort((a, b) => {
        const scoreA = this.calculateBandScore(a);
        const scoreB = this.calculateBandScore(b);
        return scoreB - scoreA;
      });

    const topBands = sortedBands.slice(0, count);

    topBands.forEach(band => {
      const score = this.calculateBandScore(band);

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

  calculateBandScore(band: Band): number {
    return band.genre.reduce((sum, g) => sum + (this.preferenceWeights[g] || 0), 0);
  }

  getPreferenceWeights(): Record<string, number> {
    return { ...this.preferenceWeights };
  }

  resetWeights(): void {
    this.preferenceWeights = {};
  }
}