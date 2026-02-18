import fs from 'fs';
import path from 'path';
import { IDatabase } from './database';
import { Band } from './types';

export interface ExportOptions {
  includeGenres?: boolean;
  includeBands?: boolean;
  includeRecommendations?: boolean;
  outputPath?: string;
}

export interface ExportedData {
  timestamp: string;
  genres?: string[];
  bands?: Band[];
  recommendations?: Record<string, Band[]>;
}

export class DataExporter {
  private db: IDatabase;

  constructor(db: IDatabase) {
    this.db = db;
  }

  async exportAll(options: ExportOptions = {}): Promise<ExportedData> {
    const data: ExportedData = {
      timestamp: new Date().toISOString()
    };

    if (options.includeGenres !== false) {
      data.genres = await this.getGenres();
    }

    if (options.includeBands !== false) {
      data.bands = await this.db.getAllBands();
    }

    if (options.includeRecommendations) {
      data.recommendations = await this.generateRecommendations();
    }

    return data;
  }

  async exportGenres(): Promise<string[]> {
    return this.getGenres();
  }

  async exportBands(): Promise<Band[]> {
    return await this.db.getAllBands();
  }

  async exportRecommendations(): Promise<Record<string, Band[]>> {
    return this.generateRecommendations();
  }

  async exportToFile(filePath: string, options: ExportOptions = {}): Promise<void> {
    const data = await this.exportAll(options);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  async exportGenresToFile(filePath: string): Promise<void> {
    const genres = await this.exportGenres();
    const data = {
      timestamp: new Date().toISOString(),
      genres
    };

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  async exportBandsToFile(filePath: string): Promise<void> {
    const bands = await this.exportBands();
    const data = {
      timestamp: new Date().toISOString(),
      bands
    };

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  async exportRecommendationsToFile(filePath: string): Promise<void> {
    const recommendations = await this.exportRecommendations();
    const data = {
      timestamp: new Date().toISOString(),
      recommendations
    };

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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

  private async generateRecommendations(): Promise<Record<string, Band[]>> {
    const genres = await this.getGenres();
    const recommendations: Record<string, Band[]> = {};

    for (const genre of genres) {
      const bands = await this.db.getBandsByGenre(genre);
      recommendations[genre] = bands.slice(0, 10);
    }

    return recommendations;
  }
}