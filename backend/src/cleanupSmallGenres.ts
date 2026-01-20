import { DatabaseManager } from './database';
import { AppConfig } from './types';
import config from '../config.json';
import path from 'path';
import fs from 'fs';

interface CleanupStats {
  totalBandsBefore: number;
  totalBandsAfter: number;
  totalGenresBefore: number;
  totalGenresAfter: number;
  smallGenresIdentified: string[];
  bandsDeleted: number;
  bandsModified: number;
  genresRemoved: string[];
}

interface BandOperation {
  band: any;
  operation: 'delete' | 'modify' | 'keep';
  reason: string;
}

class CleanupSmallGenres {
  private db: DatabaseManager;
  private config: AppConfig;
  private minBandsThreshold: number;

  constructor(config: AppConfig, minBandsThreshold: number = 10) {
    this.config = config;
    this.db = new DatabaseManager(config.database.path);
    this.minBandsThreshold = minBandsThreshold;
  }

  async cleanup(dryRun: boolean = false, backup: boolean = false): Promise<void> {
    console.log('='.repeat(60));
    console.log('Small Genres Cleanup');
    console.log('='.repeat(60));
    console.log(`Minimum bands per genre: ${this.minBandsThreshold}`);
    console.log(`Dry run: ${dryRun}`);
    console.log(`Backup: ${backup}`);
    console.log('='.repeat(60));

    if (backup && !dryRun) {
      await this.createBackup();
    }

    const stats = await this.performCleanup(dryRun);
    this.printSummary(stats);

    if (!dryRun) {
      console.log('\nSynchronizing cleaned data to all sources...');
      const { SyncBandData } = await import('./syncBandData');
      const syncer = new SyncBandData(config);
      await syncer.sync('db', false, false, true);
    }

    this.db.close();
  }

  private async performCleanup(dryRun: boolean): Promise<CleanupStats> {
    const bands = this.db.getAllBands();
    const genreCounts = this.calculateGenreCounts(bands);
    const smallGenres = this.identifySmallGenres(genreCounts);

    console.log('\n--- Genre Statistics ---');
    Object.entries(genreCounts)
      .sort(([, a], [, b]) => a - b)
      .forEach(([genre, count]) => {
        const isSmall = count < this.minBandsThreshold;
        console.log(`  ${genre.padEnd(20)}: ${count.toString().padStart(3)} bands ${isSmall ? '[SMALL]' : ''}`);
      });

    console.log(`\n--- Small Genres Identified (< ${this.minBandsThreshold} bands) ---`);
    smallGenres.forEach(genre => {
      console.log(`  - ${genre}: ${genreCounts[genre]} bands`);
    });

    const operations = this.planBandOperations(bands, smallGenres);

    console.log('\n--- Cleanup Operations ---');
    console.log(`  Bands to delete: ${operations.filter(op => op.operation === 'delete').length}`);
    console.log(`  Bands to modify: ${operations.filter(op => op.operation === 'modify').length}`);
    console.log(`  Bands to keep: ${operations.filter(op => op.operation === 'keep').length}`);

    if (dryRun) {
      console.log('\n--- Detailed Operations (Dry Run) ---');
      operations.forEach(op => {
        if (op.operation === 'delete') {
          console.log(`  [DELETE] ${op.band.name} - ${op.band.genre.join(', ')} (${op.reason})`);
        } else if (op.operation === 'modify') {
          console.log(`  [MODIFY] ${op.band.name} - ${op.band.genre.join(', ')} -> ${op.reason}`);
        }
      });
    }

    if (!dryRun) {
      await this.executeOperations(operations);
    }

    const bandsAfter = this.db.getAllBands();
    const genreCountsAfter = this.calculateGenreCounts(bandsAfter);
    const genresRemoved = smallGenres.filter(g => !genreCountsAfter[g]);

    return {
      totalBandsBefore: bands.length,
      totalBandsAfter: bandsAfter.length,
      totalGenresBefore: Object.keys(genreCounts).length,
      totalGenresAfter: Object.keys(genreCountsAfter).length,
      smallGenresIdentified: smallGenres,
      bandsDeleted: operations.filter(op => op.operation === 'delete').length,
      bandsModified: operations.filter(op => op.operation === 'modify').length,
      genresRemoved: genresRemoved
    };
  }

  private calculateGenreCounts(bands: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    bands.forEach(band => {
      const genres = Array.isArray(band.genre) ? band.genre : [band.genre];
      genres.forEach((g: string) => {
        counts[g] = (counts[g] || 0) + 1;
      });
    });
    return counts;
  }

  private identifySmallGenres(genreCounts: Record<string, number>): string[] {
    return Object.entries(genreCounts)
      .filter(([, count]) => count < this.minBandsThreshold)
      .map(([genre]) => genre);
  }

  private planBandOperations(bands: any[], smallGenres: string[]): BandOperation[] {
    const operations: BandOperation[] = [];

    bands.forEach(band => {
      const genres = Array.isArray(band.genre) ? band.genre : [band.genre];
      const smallGenreTags = genres.filter((g: string) => smallGenres.includes(g));
      const otherGenreTags = genres.filter((g: string) => !smallGenres.includes(g));

      if (smallGenreTags.length === 0) {
        operations.push({
          band,
          operation: 'keep',
          reason: 'No small genre tags'
        });
      } else if (otherGenreTags.length > 0) {
        operations.push({
          band,
          operation: 'modify',
          reason: otherGenreTags.join(', ')
        });
      } else {
        operations.push({
          band,
          operation: 'delete',
          reason: 'Only has small genre tags'
        });
      }
    });

    return operations;
  }

  private async executeOperations(operations: BandOperation[]): Promise<void> {
    const deleteOps = operations.filter(op => op.operation === 'delete');
    const modifyOps = operations.filter(op => op.operation === 'modify');

    console.log('\n--- Executing Operations ---');

    for (const op of deleteOps) {
      this.db.deleteBand(op.band.id);
      console.log(`  Deleted: ${op.band.name} (${op.band.genre.join(', ')})`);
    }

    for (const op of modifyOps) {
      const newGenres = op.reason.split(', ');
      this.db.updateBandGenres(op.band.id, newGenres);
      console.log(`  Modified: ${op.band.name} - ${op.band.genre.join(', ')} -> ${newGenres.join(', ')}`);
    }
  }

  private async createBackup(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), '..', 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filesToBackup = [
      path.join(__dirname, 'staticBands.ts'),
      path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'bands.json'),
      path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'genres.json'),
      path.join(process.cwd(), 'data', 'bands.db')
    ];

    filesToBackup.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        const fileName = path.basename(filePath);
        const backupPath = path.join(backupDir, `${fileName}.${timestamp}.bak`);
        fs.copyFileSync(filePath, backupPath);
        console.log(`Backed up: ${fileName} -> ${backupPath}`);
      }
    });
  }

  private printSummary(stats: CleanupStats): void {
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Total bands before: ${stats.totalBandsBefore}`);
    console.log(`Total bands after:  ${stats.totalBandsAfter}`);
    console.log(`Bands deleted:      ${stats.bandsDeleted}`);
    console.log(`Bands modified:     ${stats.bandsModified}`);
    console.log(`\nTotal genres before: ${stats.totalGenresBefore}`);
    console.log(`Total genres after:  ${stats.totalGenresAfter}`);
    console.log(`Genres removed:      ${stats.genresRemoved.length}`);
    if (stats.genresRemoved.length > 0) {
      stats.genresRemoved.forEach(g => console.log(`  - ${g}`));
    }
    console.log('='.repeat(60));
  }
}

async function main() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let backup = false;
  let minBandsThreshold = 10;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--backup':
        backup = true;
        break;
      case '--min-bands':
        minBandsThreshold = parseInt(args[++i]);
        if (isNaN(minBandsThreshold) || minBandsThreshold < 1) {
          console.error('Invalid min-bands value. Must be a positive integer.');
          process.exit(1);
        }
        break;
      case '--help':
        console.log('Usage: ts-node src/cleanupSmallGenres.ts [options]');
        console.log('Options:');
        console.log('  --dry-run              Simulate without making changes');
        console.log('  --backup               Create backup before cleanup');
        console.log('  --min-bands <number>   Minimum bands per genre (default: 10)');
        console.log('  --help                 Show this help message');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  const cleanup = new CleanupSmallGenres(config as AppConfig, minBandsThreshold);
  await cleanup.cleanup(dryRun, backup);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { CleanupSmallGenres };