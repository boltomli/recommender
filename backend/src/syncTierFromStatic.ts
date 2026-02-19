import { dbManager, IDatabase } from './database';
import { STATIC_BANDS } from './staticBands';
import { AppConfig, Band } from './types';
import config from '../config.json';

interface SyncStats {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  notFound: number;
  errors: Array<{ bandName: string; error: string }>;
}

class SyncTierFromStatic {
  private db: IDatabase;
  private config: AppConfig;

  private constructor(db: IDatabase, config: AppConfig) {
    this.db = db;
    this.config = config;
  }

  static async initialize(config: AppConfig): Promise<SyncTierFromStatic> {
    const db = await dbManager.initialize();
    return new SyncTierFromStatic(db, config);
  }

  async syncAll(genre?: string, dryRun: boolean = false): Promise<void> {
    console.log('='.repeat(60));
    console.log('Sync Band Tier from Static Data');
    console.log('='.repeat(60));
    console.log(`Genre: ${genre || 'All genres'}`);
    console.log(`Dry run: ${dryRun}`);
    console.log('='.repeat(60));

    // 从静态数据收集所有乐队
    const staticBands = this.collectStaticBands(genre);

    if (staticBands.length === 0) {
      console.log('No bands found in static data.');
      return;
    }

    console.log(`Found ${staticBands.length} bands in static data.\n`);

    const stats: SyncStats = {
      total: staticBands.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      notFound: 0,
      errors: []
    };

    for (const staticBand of staticBands) {
      await this.processBand(staticBand, stats, dryRun);
    }

    this.printSummary(stats);

    await dbManager.close();
  }

  private collectStaticBands(genre?: string): Array<{ name: string; tier: string; genre: string }> {
    const bands: Array<{ name: string; tier: string; genre: string }> = [];

    const genresToProcess = genre
      ? [genre]
      : Object.keys(STATIC_BANDS);

    for (const g of genresToProcess) {
      const genreBands = STATIC_BANDS[g as keyof typeof STATIC_BANDS];
      if (genreBands) {
        for (const band of genreBands) {
          if (band.tier) {
            bands.push({
              name: band.name,
              tier: band.tier,
              genre: g
            });
          }
        }
      }
    }

    return bands;
  }

  private async processBand(
    staticBand: { name: string; tier: string; genre: string },
    stats: SyncStats,
    dryRun: boolean
  ): Promise<void> {
    try {
      // 从数据库查找乐队（按名称匹配）
      const dbBands = await this.db.getAllBands();
      const dbBand = dbBands.find(b => b.name === staticBand.name);

      if (!dbBand) {
        console.log(`  [NOT FOUND] ${staticBand.name} (${staticBand.genre}) - not in database`);
        stats.notFound++;
        return;
      }

      // 检查 tier 是否需要更新
      if (dbBand.tier === staticBand.tier) {
        console.log(`  [SKIP] ${staticBand.name} (${staticBand.genre}) - tier already '${staticBand.tier}'`);
        stats.skipped++;
        return;
      }

      console.log(`  [UPDATE] ${staticBand.name} (${staticBand.genre}): ${dbBand.tier || 'undefined'} -> ${staticBand.tier}`);

      if (dryRun) {
        console.log(`    (Dry run - no changes made)`);
      } else {
        const updatedBand: Band = {
          ...dbBand,
          tier: staticBand.tier as any
        };
        await this.db.updateBand(updatedBand);
      }

      stats.updated++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  [ERROR] ${staticBand.name}: ${errorMessage}`);
      stats.failed++;
      stats.errors.push({
        bandName: staticBand.name,
        error: errorMessage
      });
    }
  }

  private printSummary(stats: SyncStats): void {
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Total bands in static data: ${stats.total}`);
    console.log(`Updated: ${stats.updated}`);
    console.log(`Skipped (already correct): ${stats.skipped}`);
    console.log(`Not found in database: ${stats.notFound}`);
    console.log(`Failed: ${stats.failed}`);
    console.log('='.repeat(60));

    if (stats.errors.length > 0) {
      console.log('\nErrors:');
      stats.errors.forEach(err => {
        console.log(`  - ${err.bandName}: ${err.error}`);
      });
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let genre: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--genre':
        genre = args[++i];
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--help':
        console.log('Usage: ts-node src/syncTierFromStatic.ts [options]');
        console.log('Options:');
        console.log('  --genre <name>     Sync only bands in this genre');
        console.log('  --dry-run          Simulate without making changes');
        console.log('  --help             Show this help message');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  const syncer = await SyncTierFromStatic.initialize(config as AppConfig);
  await syncer.syncAll(genre, dryRun);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { SyncTierFromStatic };
