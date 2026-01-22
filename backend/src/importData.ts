import { LLMClient } from './llmClient';
import { DatabaseManager } from './database';
import { Band } from './types';

export interface ImportOptions {
  genre?: string;
  count?: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

export class DataImporter {
  private llmClient: LLMClient;
  private db: DatabaseManager;

  constructor(llmClient: LLMClient, db: DatabaseManager) {
    this.llmClient = llmClient;
    this.db = db;
  }

  async importFromLLM(options: ImportOptions = {}): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      errors: []
    };

    try {
      const genre = options.genre || 'thrash';
      const count = options.count || 5;

      const existingBands = this.db.getBandsByGenre(genre);
      const knownBandNames = existingBands.map(b => b.name);

      // Prepare reference examples (max 3 bands)
      const referenceBands = existingBands.slice(0, 3);

      const response = await this.llmClient.generateBandInfo(genre, knownBandNames, undefined, referenceBands);
      const bands = this.parseLLMResponse(response);

      for (const band of bands) {
        try {
          if (this.validateBand(band)) {
            this.db.createBand(band);
            result.imported++;
          } else {
            result.skipped++;
            result.errors.push(`Invalid band data: ${band.name}`);
          }
        } catch (error) {
          result.errors.push(`Failed to import ${band.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  private parseLLMResponse(response: any): Band[] {
    try {
      const bands = response.bands || [];

      return bands.map((b: any, index: number) => ({
        id: `band_${Date.now()}_${index}`,
        name: b.name,
        genre: Array.isArray(b.genre) ? b.genre : [b.genre],
        era: b.era,
        albums: Array.isArray(b.albums) ? b.albums : [b.albums],
        description: b.description,
        styleNotes: b.styleNotes,
        tier: b.tier || 'niche'
      }));
    } catch (error) {
      throw new Error(`Failed to parse LLM response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateBand(band: Band): boolean {
    return !!(
      band.name &&
      band.name.trim() &&
      band.genre &&
      band.genre.length > 0 &&
      band.era &&
      band.albums &&
      band.albums.length > 0 &&
      band.description
    );
  }
}