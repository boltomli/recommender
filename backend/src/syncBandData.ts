import { DatabaseManager } from './database';
import { AppConfig } from './types';
import config from '../config.json';
import path from 'path';
import fs from 'fs';

interface SyncStats {
  staticBandsUpdated: boolean;
  bandsJsonUpdated: boolean;
  genresJsonUpdated: boolean;
  backupCreated: boolean;
  inconsistencies: string[];
}

class SyncBandData {
  private db: DatabaseManager;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.db = new DatabaseManager(config.database.path);
  }

  async sync(source: 'db' | 'static' = 'db', dryRun: boolean = false, backup: boolean = false, verify: boolean = false): Promise<void> {
    console.log('='.repeat(60));
    console.log('Band Data Synchronization');
    console.log('='.repeat(60));
    console.log(`Source: ${source}`);
    console.log(`Dry run: ${dryRun}`);
    console.log(`Backup: ${backup}`);
    console.log(`Verify: ${verify}`);
    console.log('='.repeat(60));

    const stats: SyncStats = {
      staticBandsUpdated: false,
      bandsJsonUpdated: false,
      genresJsonUpdated: false,
      backupCreated: false,
      inconsistencies: []
    };

    if (backup && !dryRun) {
      await this.createBackup();
      stats.backupCreated = true;
    }

    const bands = this.db.getAllBands();
    console.log(`\nLoaded ${bands.length} bands from database.`);

    if (!dryRun) {
      await this.syncStaticBands(bands);
      stats.staticBandsUpdated = true;

      await this.syncBandsJson(bands);
      stats.bandsJsonUpdated = true;

      await this.syncGenresJson(bands);
      stats.genresJsonUpdated = true;
    } else {
      console.log('\n[DRY-RUN] Would update:');
      console.log('  - backend/src/staticBands.ts');
      console.log('  - frontend/public/data/bands.json');
      console.log('  - frontend/public/data/genres.json');
    }

    if (verify) {
      await this.verifyConsistency(bands, stats);
    }

    this.printSummary(stats);
    this.db.close();
  }

  private async syncStaticBands(bands: any[]): Promise<void> {
    const genreMap: Record<string, any[]> = {};

    bands.forEach(band => {
      const genres = Array.isArray(band.genre) ? band.genre : [band.genre];
      genres.forEach((g: string) => {
        if (!genreMap[g]) {
          genreMap[g] = [];
        }
        genreMap[g].push({
          id: band.id,
          name: band.name,
          genre: genres,
          era: band.era,
          albums: band.albums,
          description: band.description,
          styleNotes: band.styleNotes || '',
          tier: band.tier
        });
      });
    });

    const staticBandsContent = this.generateStaticBandsContent(genreMap);
    const staticBandsPath = path.join(__dirname, 'staticBands.ts');

    fs.writeFileSync(staticBandsPath, staticBandsContent, 'utf-8');
    console.log(`\nUpdated: ${staticBandsPath}`);
  }

  private generateStaticBandsContent(genreMap: Record<string, any[]>): string {
    const sortedGenres = Object.keys(genreMap).sort();

    let content = `import { Band } from './types';\n\n`;
    content += `export const STATIC_BANDS: Record<string, Band[]> = {\n`;

    sortedGenres.forEach(genre => {
      content += `  ${genre}: [\n`;
      genreMap[genre].forEach(band => {
        content += `    {\n`;
        content += `      id: '${band.id}',\n`;
        content += `      name: '${this.escapeString(band.name)}',\n`;
        content += `      genre: ${JSON.stringify(band.genre)},\n`;
        content += `      era: '${this.escapeString(band.era)}',\n`;
        content += `      albums: ${JSON.stringify(band.albums)},\n`;
        content += `      description: '${this.escapeString(band.description)}',\n`;
        content += `      styleNotes: '${this.escapeString(band.styleNotes)}',\n`;
        content += `      tier: '${band.tier}'\n`;
        content += `    },\n`;
      });
      content += `  ],\n`;
    });

    content += `};\n`;
    return content;
  }

  private escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }

  private async syncBandsJson(bands: any[]): Promise<void> {
    const bandsJsonPath = path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'bands.json');

    const bandsJsonData = bands.map(band => ({
      id: band.id,
      name: band.name,
      genre: band.genre,
      era: band.era,
      albums: band.albums,
      description: band.description,
      styleNotes: band.styleNotes,
      tier: band.tier
    }));

    fs.writeFileSync(bandsJsonPath, JSON.stringify(bandsJsonData, null, 2), 'utf-8');
    console.log(`Updated: ${bandsJsonPath}`);
  }

  private async syncGenresJson(bands: any[]): Promise<void> {
    const genresJsonPath = path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'genres.json');

    const genreCounts: Record<string, number> = {};
    bands.forEach(band => {
      const genres = Array.isArray(band.genre) ? band.genre : [band.genre];
      genres.forEach((g: string) => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });

    const genresJsonData = {
      genres: Object.keys(genreCounts).sort(),
      counts: genreCounts,
      total: bands.length,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(genresJsonPath, JSON.stringify(genresJsonData, null, 2), 'utf-8');
    console.log(`Updated: ${genresJsonPath}`);
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
      path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'genres.json')
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

  private async verifyConsistency(bands: any[], stats: SyncStats): Promise<void> {
    console.log('\nVerifying data consistency...');

    const staticBandsPath = path.join(__dirname, 'staticBands.ts');
    const bandsJsonPath = path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'bands.json');
    const genresJsonPath = path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'genres.json');

    let staticBandsCount = 0;
    let bandsJsonCount = 0;
    let genresJsonCount = 0;

    try {
      const staticBandsContent = fs.readFileSync(staticBandsPath, 'utf-8');
      const matches = staticBandsContent.match(/id:\s*'/g);
      staticBandsCount = matches ? matches.length : 0;
    } catch (error) {
      stats.inconsistencies.push(`Failed to read staticBands.ts: ${error}`);
    }

    try {
      const bandsJsonContent = fs.readFileSync(bandsJsonPath, 'utf-8');
      const bandsJsonData = JSON.parse(bandsJsonContent);
      bandsJsonCount = Array.isArray(bandsJsonData) ? bandsJsonData.length : bandsJsonData.bands?.length || 0;
    } catch (error) {
      stats.inconsistencies.push(`Failed to read bands.json: ${error}`);
    }

    try {
      const genresJsonContent = fs.readFileSync(genresJsonPath, 'utf-8');
      const genresJsonData = JSON.parse(genresJsonContent);
      genresJsonCount = genresJsonData.total || 0;
    } catch (error) {
      stats.inconsistencies.push(`Failed to read genres.json: ${error}`);
    }

    const dbCount = bands.length;

    console.log(`  Database: ${dbCount} bands`);
    console.log(`  staticBands.ts: ${staticBandsCount} bands`);
    console.log(`  bands.json: ${bandsJsonCount} bands`);
    console.log(`  genres.json: ${genresJsonCount} bands`);

    if (dbCount !== staticBandsCount) {
      stats.inconsistencies.push(`Database (${dbCount}) and staticBands.ts (${staticBandsCount}) count mismatch`);
    }

    if (dbCount !== bandsJsonCount) {
      stats.inconsistencies.push(`Database (${dbCount}) and bands.json (${bandsJsonCount}) count mismatch`);
    }

    if (dbCount !== genresJsonCount) {
      stats.inconsistencies.push(`Database (${dbCount}) and genres.json (${genresJsonCount}) count mismatch`);
    }

    if (stats.inconsistencies.length === 0) {
      console.log('  All data sources are consistent!');
    }
  }

  private printSummary(stats: SyncStats): void {
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`staticBands.ts updated: ${stats.staticBandsUpdated}`);
    console.log(`bands.json updated: ${stats.bandsJsonUpdated}`);
    console.log(`genres.json updated: ${stats.genresJsonUpdated}`);
    console.log(`Backup created: ${stats.backupCreated}`);
    console.log('='.repeat(60));

    if (stats.inconsistencies.length > 0) {
      console.log('\nInconsistencies found:');
      stats.inconsistencies.forEach(inc => {
        console.log(`  - ${inc}`);
      });
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let source: 'db' | 'static' = 'db';
  let dryRun = false;
  let backup = false;
  let verify = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source':
        source = args[++i] as 'db' | 'static';
        if (source !== 'db' && source !== 'static') {
          console.error('Invalid source. Use "db" or "static".');
          process.exit(1);
        }
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--backup':
        backup = true;
        break;
      case '--verify':
        verify = true;
        break;
      case '--help':
        console.log('Usage: ts-node src/syncBandData.ts [options]');
        console.log('Options:');
        console.log('  --source <db|static>  Data source (default: db)');
        console.log('  --dry-run              Simulate without making changes');
        console.log('  --backup               Create backup before syncing');
        console.log('  --verify               Verify data consistency after sync');
        console.log('  --help                 Show this help message');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  const syncer = new SyncBandData(config as AppConfig);
  await syncer.sync(source, dryRun, backup, verify);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { SyncBandData };