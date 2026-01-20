import { DatabaseManager } from './database';
import { AppConfig } from './types';
import config from '../config.json';
import path from 'path';
import fs from 'fs';

interface CleanStats {
  totalBandsChecked: number;
  bandsUpdated: number;
  albumsCleaned: number;
  errors: Array<{ band: string; error: string }>;
}

class CleanAlbumNames {
  private db: DatabaseManager;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.db = new DatabaseManager(config.database.path);
  }

  async clean(dryRun: boolean = false, backup: boolean = false): Promise<void> {
    console.log('='.repeat(60));
    console.log('Album Names Cleaning');
    console.log('='.repeat(60));
    console.log(`Dry run: ${dryRun}`);
    console.log(`Backup: ${backup}`);
    console.log('='.repeat(60));

    const stats: CleanStats = {
      totalBandsChecked: 0,
      bandsUpdated: 0,
      albumsCleaned: 0,
      errors: []
    };

    if (backup && !dryRun) {
      await this.createBackup();
    }

    const bands = this.db.getAllBands();
    stats.totalBandsChecked = bands.length;

    console.log(`\nProcessing ${bands.length} bands...\n`);

    for (const band of bands) {
      try {
        const cleanedAlbums = this.cleanAlbums(band.albums);
        
        // Check if albums need cleaning
        if (JSON.stringify(band.albums) === JSON.stringify(cleanedAlbums)) {
          continue; // No changes needed
        }

        stats.bandsUpdated++;
        stats.albumsCleaned += band.albums.length - cleanedAlbums.length;

        console.log(`[${dryRun ? 'DRY-RUN ' : ''}UPDATED] ${band.name}`);
        console.log(`  From: ${band.albums.join(', ')}`);
        console.log(`  To:   ${cleanedAlbums.join(', ')}`);

        if (!dryRun) {
          // Update in database immediately
          const stmt = this.db['db'].prepare(`
            UPDATE bands 
            SET albums = ?
            WHERE id = ?
          `);
          stmt.run(JSON.stringify(cleanedAlbums), band.id);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  [ERROR] ${band.name}: ${errorMessage}`);
        stats.errors.push({ band: band.name, error: errorMessage });
      }
    }

    this.printSummary(stats);

    if (!dryRun && stats.bandsUpdated > 0) {
      console.log('\nSynchronizing cleaned data to all sources...');
      const { SyncBandData } = await import('./syncBandData');
      const syncer = new SyncBandData(config);
      await syncer.sync('db', false, false, true);
    }

    this.db.close();
  }

  private cleanAlbums(albums: string[]): string[] {
    return albums.map(album => {
      // Remove years in parentheses like (1986) or [1986]
      let cleaned = album.replace(/\s*[\(\[]\d{4}[\)\]]\s*/g, '');
      
      // Remove any remaining parentheses and their content
      cleaned = cleaned.replace(/\s*[\(\[].*?[\)\]]\s*/g, '');
      
      // Trim whitespace
      cleaned = cleaned.trim();
      
      return cleaned;
    }).filter(album => album.length > 0);
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

  private printSummary(stats: CleanStats): void {
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Total bands checked: ${stats.totalBandsChecked}`);
    console.log(`Bands updated:      ${stats.bandsUpdated}`);
    console.log(`Albums cleaned:     ${stats.albumsCleaned}`);
    console.log('='.repeat(60));

    if (stats.errors.length > 0) {
      console.log('\nErrors:');
      stats.errors.forEach(err => {
        console.log(`  - ${err.band}: ${err.error}`);
      });
    }
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
        console.log('Usage: ts-node src/cleanAlbumNames.ts [options]');
        console.log('Options:');
        console.log('  --dry-run              Simulate without making changes');
        console.log('  --backup               Create backup before cleaning');
        console.log('  --help                 Show this help message');
        console.log('\nThis script will:');
        console.log('  1. Clean album names (remove years and parentheses)');
        console.log('  2. Update database immediately after each band');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!dryRun && !backup) {
    console.log('WARNING: This will modify the database!');
    console.log('Use --backup to create a backup before proceeding.');
    console.log('Use --dry-run to preview changes without modifying.');
    console.log('Run with --help for more information.');
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('Continue without backup? (yes/no): ', resolve);
    });
    rl.close();
    
    if (String(answer).toLowerCase() !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  const cleaner = new CleanAlbumNames(config as AppConfig);
  await cleaner.clean(dryRun, backup);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { CleanAlbumNames };