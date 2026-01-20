import { DatabaseManager } from './database';
import { LLMClient } from './llmClient';
import { CacheManager } from './cacheManager';
import { AppConfig } from './types';
import config from '../config.json';
import path from 'path';
import fs from 'fs';

interface ExpansionStats {
  genresProcessed: number;
  bandsGenerated: number;
  bandsImported: number;
  duplicatesFiltered: number;
  validationFailures: number;
  errors: Array<{ genre: string; error: string }>;
}

class ExpandGenreBands {
  private db: DatabaseManager;
  private llm: LLMClient;
  private cache: CacheManager;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.db = new DatabaseManager(config.database.path);
    this.llm = new LLMClient(config.llm);
    this.cache = new CacheManager(config.expandGenres.cachePath);
  }

  async expandAll(genre?: string, targetCount?: number, dryRun: boolean = false, force: boolean = false): Promise<void> {
    if (!this.config.expandGenres.enabled) {
      console.error('Genre expansion is disabled in config.json. Set expandGenres.enabled to true to enable.');
      process.exit(1);
    }

    console.log('='.repeat(60));
    console.log('Genre Band Expansion Script');
    console.log('='.repeat(60));
    console.log(`Genre: ${genre || 'All genres'}`);
    console.log(`Target count: ${targetCount || config.expandGenres.minBandsForGenre}`);
    console.log(`Dry run: ${dryRun}`);
    console.log(`Force: ${force}`);
    console.log('='.repeat(60));

    const stats: ExpansionStats = {
      genresProcessed: 0,
      bandsGenerated: 0,
      bandsImported: 0,
      duplicatesFiltered: 0,
      validationFailures: 0,
      errors: []
    };

    if (genre) {
      await this.expandGenre(genre, targetCount || config.expandGenres.minBandsForGenre, dryRun, force, stats);
    } else {
      const allBands = this.db.getAllBands();
      const genreCounts = this.getGenreCounts(allBands);
      const minCount = targetCount || config.expandGenres.minBandsForGenre;

      const genresToExpand = Object.entries(genreCounts)
        .filter(([_, count]) => count < minCount)
        .map(([genre, _]) => genre);

      if (genresToExpand.length === 0) {
        console.log('All genres meet the minimum band count requirement.');
        return;
      }

      console.log(`Found ${genresToExpand.length} genres needing expansion:\n`);
      genresToExpand.forEach(g => {
        console.log(`  - ${g}: ${genreCounts[g]} bands (need ${minCount - genreCounts[g]} more)`);
      });
      console.log();

      for (const g of genresToExpand) {
        await this.expandGenre(g, minCount, dryRun, force, stats);
      }
    }

    this.printSummary(stats);
    this.db.close();
  }

  private getGenreCounts(bands: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    bands.forEach(band => {
      const genres = Array.isArray(band.genre) ? band.genre : [band.genre];
      genres.forEach((g: string) => {
        counts[g] = (counts[g] || 0) + 1;
      });
    });
    return counts;
  }

  private async expandGenre(genre: string, targetCount: number, dryRun: boolean, force: boolean, stats: ExpansionStats): Promise<void> {
    console.log(`\nProcessing genre: ${genre}`);

    const existingBands = this.db.getBandsByGenre(genre);
    const existingNames = new Set(existingBands.map(b => b.name.toLowerCase().trim()));

    const needed = targetCount - existingBands.length;
    if (needed <= 0) {
      console.log(`  Genre already has ${existingBands.length} bands (target: ${targetCount}). Skipping.`);
      return;
    }

    console.log(`  Current bands: ${existingBands.length}`);
    console.log(`  Target: ${targetCount}`);
    console.log(`  Need to generate: ${needed}`);

    const cacheKey = { genre, targetCount, existingCount: existingBands.length };
    if (!force) {
      const cachedBands = this.cache.get<any[]>('expand', cacheKey);
      if (cachedBands) {
        console.log(`  Using cached expansion: ${cachedBands.length} bands`);
        // Import bands one by one from cache
        for (const bandData of cachedBands) {
          if (!this.validateBandData(bandData)) {
            console.log(`    [INVALID] ${bandData.name} - missing required fields`);
            stats.validationFailures++;
            continue;
          }

          const normalizedName = bandData.name.toLowerCase().trim();
          if (existingNames.has(normalizedName)) {
            console.log(`    [DUPLICATE] ${bandData.name} - already exists`);
            stats.duplicatesFiltered++;
            continue;
          }

          if (dryRun) {
            console.log(`    [DRY-RUN] Would import: ${bandData.name} (${bandData.tier})`);
          } else {
            const band = {
              id: `band_${bandData.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
              name: bandData.name,
              genre: Array.isArray(bandData.genre) ? bandData.genre : [bandData.genre],
              era: bandData.era || 'Unknown',
              albums: bandData.albums || [],
              description: bandData.description || '',
              styleNotes: '',
              tier: bandData.tier || 'niche'
            };

            this.db.createBand(band);
            console.log(`    [IMPORTED] ${band.name} (${band.tier})`);
          }

          stats.bandsImported++;
          stats.bandsGenerated++;
          existingNames.add(normalizedName);
        }
        stats.genresProcessed++;
        return;
      }
    }

    try {
      const generatedBands: any[] = [];
      const excludeList = Array.from(existingNames);
      let attempts = 0;
      const maxAttempts = needed * 3;
      let consecutiveFailures = 0;
      const maxConsecutiveFailures = 5;

      console.log(`  Starting generation loop (max ${maxAttempts} attempts, max ${maxConsecutiveFailures} consecutive failures)`);

      while (generatedBands.length < needed && attempts < maxAttempts) {
        attempts++;
        console.log(`  Generating band ${generatedBands.length + 1}/${needed} (attempt ${attempts}/${maxAttempts})...`);

        const band = await this.llm.generateBandsForExpansion(genre, excludeList);

        if (!band) {
          consecutiveFailures++;
          console.log(`    [FAILED] No valid band generated (consecutive failures: ${consecutiveFailures}/${maxConsecutiveFailures})`);
          
          if (consecutiveFailures >= maxConsecutiveFailures) {
            console.log(`    Too many consecutive failures, stopping generation for this genre`);
            break;
          }
          continue;
        }

        consecutiveFailures = 0;

        const normalizedName = band.name.toLowerCase().trim();
        if (existingNames.has(normalizedName) || generatedBands.some(b => b.name.toLowerCase().trim() === normalizedName)) {
          console.log(`    [DUPLICATE] ${band.name} - already in exclude list, retrying...`);
          continue;
        }

        if (!this.validateBandData(band)) {
          console.log(`    [INVALID] ${band.name} - missing required fields, retrying...`);
          continue;
        }

        console.log(`    [GENERATED] ${band.name} (${band.tier})`);
        generatedBands.push(band);
        excludeList.push(normalizedName);
      }

      if (generatedBands.length === 0) {
        console.log('  No bands generated by LLM after all attempts');
        return;
      }

      console.log(`  Generated ${generatedBands.length}/${needed} bands from LLM (${attempts} attempts)`);

      this.cache.set('expand', cacheKey, generatedBands);

      // Import bands one by one as they are generated
      for (const bandData of generatedBands) {
        if (!this.validateBandData(bandData)) {
          console.log(`    [INVALID] ${bandData.name} - missing required fields`);
          stats.validationFailures++;
          continue;
        }

        const normalizedName = bandData.name.toLowerCase().trim();
        if (existingNames.has(normalizedName)) {
          console.log(`    [DUPLICATE] ${bandData.name} - already exists`);
          stats.duplicatesFiltered++;
          continue;
        }

        if (dryRun) {
          console.log(`    [DRY-RUN] Would import: ${bandData.name} (${bandData.tier})`);
        } else {
          const band = {
            id: `band_${bandData.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
            name: bandData.name,
            genre: Array.isArray(bandData.genre) ? bandData.genre : [bandData.genre],
            era: bandData.era || 'Unknown',
            albums: bandData.albums || [],
            description: bandData.description || '',
            styleNotes: '',
            tier: bandData.tier || 'niche'
          };

          this.db.createBand(band);
          console.log(`    [IMPORTED] ${band.name} (${band.tier})`);
        }

        stats.bandsImported++;
        stats.bandsGenerated++;
        existingNames.add(normalizedName);
      }

      stats.genresProcessed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  Error expanding genre ${genre}: ${errorMessage}`);
      stats.errors.push({ genre, error: errorMessage });
    }
  }

  private validateBandData(band: any): boolean {
    return !!(
      band.name &&
      band.name.trim() &&
      band.genre &&
      (Array.isArray(band.genre) ? band.genre.length > 0 : band.genre.trim())
    );
  }

  private printSummary(stats: ExpansionStats): void {
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Genres processed: ${stats.genresProcessed}`);
    console.log(`Bands generated: ${stats.bandsGenerated}`);
    console.log(`Bands imported: ${stats.bandsImported}`);
    console.log(`Duplicates filtered: ${stats.duplicatesFiltered}`);
    console.log(`Validation failures: ${stats.validationFailures}`);
    console.log('='.repeat(60));

    if (stats.errors.length > 0) {
      console.log('\nErrors:');
      stats.errors.forEach(err => {
        console.log(`  - ${err.genre}: ${err.error}`);
      });
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let genre: string | undefined;
  let targetCount: number | undefined;
  let dryRun = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--genre':
        genre = args[++i];
        break;
      case '--target-count':
        targetCount = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--force':
        force = true;
        break;
      case '--help':
        console.log('Usage: ts-node src/expandGenreBands.ts [options]');
        console.log('Options:');
        console.log('  --genre <name>       Expand only this genre');
        console.log('  --target-count <n>   Target band count per genre (overrides config)');
        console.log('  --dry-run            Simulate without making changes');
        console.log('  --force              Ignore cache and force regeneration');
        console.log('  --help               Show this help message');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  const expander = new ExpandGenreBands(config as AppConfig);
  await expander.expandAll(genre, targetCount, dryRun, force);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { ExpandGenreBands };