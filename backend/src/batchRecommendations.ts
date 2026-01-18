import { DatabaseManager } from './database';
import { Band } from './types';

export interface RecommendationResult {
  genre: string;
  recommendations: Band[];
  count: number;
}

export class BatchRecommendationGenerator {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async generateForAllGenres(): Promise<Record<string, Band[]>> {
    const genres = await this.getGenres();
    const recommendations: Record<string, Band[]> = {};

    for (const genre of genres) {
      recommendations[genre] = await this.generateForGenre(genre);
    }

    return recommendations;
  }

  async generateForGenre(genre: string): Promise<Band[]> {
    const bands = this.db.getBandsByGenre(genre);

    if (bands.length === 0) {
      return [];
    }

    // Sort bands by a simple scoring mechanism
    const sortedBands = bands.sort((a, b) => {
      const scoreA = this.calculateBandScore(a);
      const scoreB = this.calculateBandScore(b);
      return scoreB - scoreA;
    });

    // Return top 10 recommendations
    return sortedBands.slice(0, 10);
  }

  private async getGenres(): Promise<string[]> {
    return [
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
  }

  private calculateBandScore(band: Band): number {
    let score = 0;

    // Score based on number of albums
    score += band.albums.length * 2;

    // Score based on era (prefer classic eras)
    if (band.era.includes('1980') || band.era.includes('1990')) {
      score += 5;
    }

    // Score based on description length (more detailed = more popular)
    score += Math.min(band.description.length / 50, 10);

    return score;
  }
}