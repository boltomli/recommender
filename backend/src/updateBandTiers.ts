import { DatabaseManager } from './database';
import { LLMClient } from './llmClient';
import { CacheManager } from './cacheManager';
import { AppConfig } from './types';
import config from '../config.json';
import path from 'path';
import fs from 'fs';

interface UpdateStats {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ bandId: string; bandName: string; error: string }>;
}

class UpdateBandTiers {
  private db: DatabaseManager;
  private llm: LLMClient;
  private cache: CacheManager;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.db = new DatabaseManager(config.database.path);
    this.llm = new LLMClient(config.llm);
    this.cache = new CacheManager(config.tierUpdate.cachePath);
  }

  async updateAll(genre?: string, dryRun: boolean = false, force: boolean = false, batchSize: number = 10): Promise<void> {
    if (!this.config.tierUpdate.enabled) {
      console.error('Tier update is disabled in config.json. Set tierUpdate.enabled to true to enable.');
      process.exit(1);
    }

    console.log('='.repeat(60));
    console.log('Band Tier Update Script');
    console.log('='.repeat(60));
    console.log(`Genre: ${genre || 'All genres'}`);
    console.log(`Dry run: ${dryRun}`);
    console.log(`Force update: ${force}`);
    console.log(`Batch size: ${batchSize}`);
    console.log('='.repeat(60));

    let bands = genre ? this.db.getBandsByGenre(genre) : this.db.getAllBands();

    if (bands.length === 0) {
      console.log('No bands found to update.');
      return;
    }

    console.log(`Found ${bands.length} bands to process.\n`);

    const stats: UpdateStats = {
      total: bands.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < bands.length; i += batchSize) {
      const batch = bands.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(bands.length / batchSize)}...`);

      await this.processBatch(batch, stats, dryRun, force);
    }

    this.printSummary(stats);

    this.db.close();
  }

  private async processBatch(bands: any[], stats: UpdateStats, dryRun: boolean, force: boolean): Promise<void> {
    for (const band of bands) {
      try {
        const genre = Array.isArray(band.genre) ? band.genre[0] : band.genre;
        const cacheKey = { bandName: band.name, genre };

        if (!force) {
          const cachedTier = this.cache.get<{ tier: string; reasoning: string }>('tier', cacheKey);
          if (cachedTier) {
            console.log(`  [SKIP] ${band.name} (${genre}) - using cached tier: ${cachedTier.tier}`);
            stats.skipped++;
            continue;
          }
        }

        console.log(`  [UPDATE] ${band.name} (${genre})...`);

        const result = await this.llm.updateBandTier(band.name, genre, band.description);

        if (dryRun) {
          console.log(`    Would update tier: ${band.tier} -> ${result.tier}`);
          console.log(`    Reasoning: ${result.reasoning}`);
        } else {
          const stmt = this.db['db'].prepare('UPDATE bands SET tier = ? WHERE id = ?');
          stmt.run(result.tier, band.id);

          this.cache.set('tier', cacheKey, result);

          console.log(`    Updated tier: ${band.tier} -> ${result.tier}`);
          console.log(`    Reasoning: ${result.reasoning}`);
        }

        stats.updated++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  [ERROR] ${band.name}: ${errorMessage}`);
        stats.failed++;
        stats.errors.push({
          bandId: band.id,
          bandName: band.name,
          error: errorMessage
        });
      }
    }
  }

  private printSummary(stats: UpdateStats): void {
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Total bands: ${stats.total}`);
    console.log(`Updated: ${stats.updated}`);
    console.log(`Skipped (cached): ${stats.skipped}`);
    console.log(`Failed: ${stats.failed}`);
    console.log('='.repeat(60));

    if (stats.errors.length > 0) {
      console.log('\nErrors:');
      stats.errors.forEach(err => {
        console.log(`  - ${err.bandName} (${err.bandId}): ${err.error}`);
      });
    }
  }

  async backupDatabase(): Promise<string> {
    const dbPath = this.config.database.path;
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `bands_${timestamp}.db`);

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    fs.copyFileSync(dbPath, backupPath);
    console.log(`Database backed up to: ${backupPath}`);
    return backupPath;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let genre: string | undefined;
  let dryRun = false;
  let force = false;
  let batchSize = 10;
  let backup = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--genre':
        genre = args[++i];
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--force':
        force = true;
        break;
      case '--batch-size':
        batchSize = parseInt(args[++i], 10);
        break;
      case '--backup':
        backup = true;
        break;
      case '--help':
        console.log('Usage: ts-node src/updateBandTiers.ts [options]');
        console.log('Options:');
        console.log('  --genre <name>     Update only bands in this genre');
        console.log('  --dry-run          Simulate without making changes');
        console.log('  --force            Ignore cache and force update');
        console.log('  --batch-size <n>   Number of bands to process in each batch (default: 10)');
        console.log('  --backup           Create database backup before updating');
        console.log('  --help             Show this help message');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  const updater = new UpdateBandTiers(config as AppConfig);

  if (backup && !dryRun) {
    await updater.backupDatabase();
  }

  await updater.updateAll(genre, dryRun, force, batchSize);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { UpdateBandTiers };