import { DatabaseManager } from './database';
import { AppConfig } from './types';
import config from '../config.json';
import path from 'path';
import fs from 'fs';

interface DuplicateGroup {
  name: string;
  bands: any[];
  normalizedGenre: string;
}

interface CleanupStats {
  totalBandsBefore: number;
  totalBandsAfter: number;
  duplicateGroupsFound: number;
  bandsDeleted: number;
  duplicates: Array<{ name: string; deletedId: string; keptId: string }>;
}

class CleanupDuplicateBands {
  private db: DatabaseManager;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.db = new DatabaseManager(config.database.path);
  }

  async cleanup(dryRun: boolean = false, backup: boolean = false): Promise<void> {
    console.log('='.repeat(60));
    console.log('Duplicate Bands Cleanup');
    console.log('='.repeat(60));
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
    const duplicateGroups = this.findDuplicateBands(bands);

    console.log('\n--- Duplicate Bands Found ---');
    duplicateGroups.forEach(group => {
      console.log(`  ${group.name}: ${group.bands.length} records`);
      group.bands.forEach((band, index) => {
        console.log(`    [${index + 1}] ID: ${band.id}, Genres: [${band.genre.join(', ')}]`);
      });
    });

    const duplicates: Array<{ name: string; deletedId: string; keptId: string }> = [];

    if (!dryRun) {
      console.log('\n--- Deleting Duplicates ---');
      for (const group of duplicateGroups) {
        // Keep the first record, delete the rest
        const keptBand = group.bands[0];
        for (let i = 1; i < group.bands.length; i++) {
          const bandToDelete = group.bands[i];
          this.db.deleteBand(bandToDelete.id);
          duplicates.push({
            name: group.name,
            deletedId: bandToDelete.id,
            keptId: keptBand.id
          });
          console.log(`  Deleted: ${group.name} (ID: ${bandToDelete.id})`);
        }
      }
    }

    const bandsAfter = this.db.getAllBands();

    return {
      totalBandsBefore: bands.length,
      totalBandsAfter: bandsAfter.length,
      duplicateGroupsFound: duplicateGroups.length,
      bandsDeleted: duplicates.length,
      duplicates: duplicates
    };
  }

  private findDuplicateBands(bands: any[]): DuplicateGroup[] {
    const nameMap = new Map<string, any[]>();

    // Group by name (case-insensitive)
    bands.forEach(band => {
      const normalizedName = band.name.toLowerCase().trim();
      if (!nameMap.has(normalizedName)) {
        nameMap.set(normalizedName, []);
      }
      nameMap.get(normalizedName)!.push(band);
    });

    const duplicateGroups: DuplicateGroup[] = [];

    // Find groups with multiple records
    nameMap.forEach((bandsInGroup, name) => {
      if (bandsInGroup.length > 1) {
        // Check if they are duplicates (same genres, possibly in different order)
        const firstBand = bandsInGroup[0];
        const normalizedGenre = this.normalizeGenres(firstBand.genre);

        const allSameGenres = bandsInGroup.every(band =>
          this.normalizeGenres(band.genre) === normalizedGenre
        );

        if (allSameGenres) {
          duplicateGroups.push({
            name: firstBand.name,
            bands: bandsInGroup,
            normalizedGenre: normalizedGenre
          });
        }
      }
    });

    return duplicateGroups;
  }

  private normalizeGenres(genres: string[]): string {
    // Sort genres alphabetically and join with comma for comparison
    return Array.isArray(genres) ? genres.sort().join(',') : genres;
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
    console.log(`Duplicate groups found: ${stats.duplicateGroupsFound}`);
    console.log(`Bands deleted:      ${stats.bandsDeleted}`);
    if (stats.duplicates.length > 0) {
      console.log('\nDeleted duplicates:');
      stats.duplicates.forEach(dup => {
        console.log(`  ${dup.name}: deleted ${dup.deletedId}, kept ${dup.keptId}`);
      });
    }
    console.log('='.repeat(60));
  }
}

async function main() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let backup = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--backup':
        backup = true;
        break;
      case '--help':
        console.log('Usage: ts-node src/cleanupDuplicateBands.ts [options]');
        console.log('Options:');
        console.log('  --dry-run              Simulate without making changes');
        console.log('  --backup               Create backup before cleanup');
        console.log('  --help                 Show this help message');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  const cleanup = new CleanupDuplicateBands(config as AppConfig);
  await cleanup.cleanup(dryRun, backup);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { CleanupDuplicateBands };