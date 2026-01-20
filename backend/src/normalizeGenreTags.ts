import { DatabaseManager } from './database';
import { AppConfig } from './types';
import config from '../config.json';
import path from 'path';
import fs from 'fs';

interface NormalizeStats {
  totalBandsChecked: number;
  bandsModified: number;
  bandsDeleted: number;
  genresNormalized: number;
  genresRemoved: number;
  genresAdded: number;
  errors: Array<{ band: string; error: string }>;
  changes: Array<{ band: string; oldGenres: string[]; newGenres: string[]; reason: string }>;
}

class NormalizeGenreTags {
  private db: DatabaseManager;
  private config: AppConfig;
  private validGenres: Set<string>;

  constructor(config: AppConfig) {
    this.config = config;
    this.db = new DatabaseManager(config.database.path);
    this.validGenres = this.loadValidGenres();
  }

  private loadValidGenres(): Set<string> {
    const genresJsonPath = path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'genres.json');
    try {
      const content = fs.readFileSync(genresJsonPath, 'utf-8');
      const data = JSON.parse(content);
      return new Set(data.genres);
    } catch (error) {
      console.error(`Failed to load genres.json: ${error}`);
      return new Set();
    }
  }

  async normalize(dryRun: boolean = false, backup: boolean = false): Promise<void> {
    console.log('='.repeat(60));
    console.log('Genre Tags Normalization');
    console.log('='.repeat(60));
    console.log(`Valid genres: ${this.validGenres.size}`);
    console.log(`  ${Array.from(this.validGenres).sort().join(', ')}`);
    console.log(`Dry run: ${dryRun}`);
    console.log(`Backup: ${backup}`);
    console.log('='.repeat(60));

    const stats: NormalizeStats = {
      totalBandsChecked: 0,
      bandsModified: 0,
      bandsDeleted: 0,
      genresNormalized: 0,
      genresRemoved: 0,
      genresAdded: 0,
      errors: [],
      changes: []
    };

    if (backup && !dryRun) {
      await this.createBackup();
    }

    const bands = this.db.getAllBands();
    stats.totalBandsChecked = bands.length;

    console.log(`\nProcessing ${bands.length} bands...\n`);

    for (const band of bands) {
      try {
        const result = this.normalizeBandGenres(band);
        
        if (result.action === 'delete') {
          stats.bandsDeleted++;
          stats.changes.push({
            band: band.name,
            oldGenres: band.genre,
            newGenres: [],
            reason: result.reason
          });
          
          if (!dryRun) {
            this.db.deleteBand(band.id);
            console.log(`  [DELETE] ${band.name} - ${band.genre.join(', ')} (${result.reason})`);
          } else {
            console.log(`  [DRY-RUN DELETE] ${band.name} - ${band.genre.join(', ')} (${result.reason})`);
          }
        } else if (result.action === 'modify') {
          stats.bandsModified++;
          stats.genresNormalized += result.normalized;
          stats.genresRemoved += result.removed;
          stats.genresAdded += result.added;
          
          stats.changes.push({
            band: band.name,
            oldGenres: band.genre,
            newGenres: result.newGenres,
            reason: result.reason
          });
          
          if (!dryRun) {
            this.db.updateBandGenres(band.id, result.newGenres);
            console.log(`  [MODIFY] ${band.name}`);
            console.log(`    From: ${band.genre.join(', ')}`);
            console.log(`    To:   ${result.newGenres.join(', ')}`);
            console.log(`    Reason: ${result.reason}`);
          } else {
            console.log(`  [DRY-RUN MODIFY] ${band.name}`);
            console.log(`    From: ${band.genre.join(', ')}`);
            console.log(`    To:   ${result.newGenres.join(', ')}`);
            console.log(`    Reason: ${result.reason}`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  [ERROR] ${band.name}: ${errorMessage}`);
        stats.errors.push({ band: band.name, error: errorMessage });
      }
    }

    this.printSummary(stats);

    if (!dryRun && (stats.bandsModified > 0 || stats.bandsDeleted > 0)) {
      console.log('\nSynchronizing normalized data to all sources...');
      const { SyncBandData } = await import('./syncBandData');
      const syncer = new SyncBandData(config);
      await syncer.sync('db', false, false, true);
    }

    this.db.close();
  }

  private normalizeBandGenres(band: any): {
    action: 'keep' | 'modify' | 'delete';
    newGenres: string[];
    reason: string;
    normalized: number;
    removed: number;
    added: number;
  } {
    const genres = Array.isArray(band.genre) ? band.genre : [band.genre];
    const normalizedGenres: string[] = [];
    let normalizedCount = 0;
    let removedCount = 0;
    let addedCount = 0;

    // Step 1: Normalize each genre (case, format, metal suffix)
    for (const genre of genres) {
      const normalized = this.normalizeGenreName(genre);
      if (normalized !== genre) {
        normalizedCount++;
      }
      normalizedGenres.push(normalized);
    }

    // Step 2: Remove duplicates after normalization
    const uniqueGenres = [...new Set(normalizedGenres)];

    // Step 3: Keep only valid genres
    const validGenres = uniqueGenres.filter(g => this.validGenres.has(g));
    const invalidGenres = uniqueGenres.filter(g => !this.validGenres.has(g));

    removedCount += uniqueGenres.length - validGenres.length;

    // Step 4: If all genres are invalid, try to find closest matches
    if (validGenres.length === 0 && invalidGenres.length > 0) {
      const suggestedGenres = this.suggestClosestGenres(invalidGenres);
      if (suggestedGenres.length > 0) {
        addedCount += suggestedGenres.length;
        return {
          action: 'modify',
          newGenres: suggestedGenres,
          reason: `Replaced invalid genres with closest matches: ${invalidGenres.join(', ')} -> ${suggestedGenres.join(', ')}`,
          normalized: normalizedCount,
          removed: removedCount,
          added: addedCount
        };
      }
    }

    // Step 5: If no valid genres remain, delete the band
    if (validGenres.length === 0) {
      return {
        action: 'delete',
        newGenres: [],
        reason: `No valid genres after normalization (original: ${genres.join(', ')})`,
        normalized: normalizedCount,
        removed: removedCount,
        added: addedCount
      };
    }

    // Step 6: Check if genres changed
    const originalNormalized = genres.map((g: string) => this.normalizeGenreName(g));
    const finalGenres = [...new Set(validGenres)].sort();
    
    if (JSON.stringify(originalNormalized.sort()) !== JSON.stringify(finalGenres)) {
      const changes: string[] = [];
      if (normalizedCount > 0) changes.push(`${normalizedCount} normalized`);
      if (removedCount > 0) changes.push(`${removedCount} removed`);
      if (addedCount > 0) changes.push(`${addedCount} added`);
      
      return {
        action: 'modify',
        newGenres: finalGenres,
        reason: changes.join(', '),
        normalized: normalizedCount,
        removed: removedCount,
        added: addedCount
      };
    }

    return {
      action: 'keep',
      newGenres: band.genre,
      reason: 'No changes needed',
      normalized: 0,
      removed: 0,
      added: 0
    };
  }

  private normalizeGenreName(genre: string): string {
    // Convert to lowercase
    let normalized = genre.toLowerCase().trim();

    // Remove "metal" suffix if it exists
    if (normalized.endsWith(' metal')) {
      normalized = normalized.slice(0, -7);
    }

    // Handle special cases - map subgenres to main genres
    const specialCases: Record<string, string> = {
      'atmospheric doom': 'doom',
      'melodic death': 'death',
      'pagan': 'folk',
      'pagan metal': 'folk',
      'melodic death metal': 'death',
      'atmospheric doom metal': 'doom'
    };

    if (specialCases[normalized]) {
      normalized = specialCases[normalized];
    }

    return normalized;
  }

  private suggestClosestGenres(invalidGenres: string[]): string[] {
    const suggestions: string[] = [];
    const validGenreArray = Array.from(this.validGenres);

    for (const invalidGenre of invalidGenres) {
      // Try to find a valid genre that contains the invalid genre as a substring
      const partialMatch = validGenreArray.find(valid => 
        valid.includes(invalidGenre) || invalidGenre.includes(valid)
      );

      if (partialMatch) {
        suggestions.push(partialMatch);
        continue;
      }

      // Simple heuristic: if it contains "doom", suggest "doom", etc.
      const keywords = ['black', 'death', 'doom', 'thrash', 'power', 'folk', 'heavy', 'progressive', 'speed', 'groove', 'sludge', 'viking', 'glam', 'hard rock'];
      for (const keyword of keywords) {
        if (invalidGenre.includes(keyword)) {
          suggestions.push(keyword);
          break;
        }
      }
    }

    return [...new Set(suggestions)];
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

  private printSummary(stats: NormalizeStats): void {
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Total bands checked: ${stats.totalBandsChecked}`);
    console.log(`Bands modified:      ${stats.bandsModified}`);
    console.log(`Bands deleted:       ${stats.bandsDeleted}`);
    console.log(`Genres normalized:   ${stats.genresNormalized}`);
    console.log(`Genres removed:      ${stats.genresRemoved}`);
    console.log(`Genres added:        ${stats.genresAdded}`);
    console.log('='.repeat(60));

    if (stats.errors.length > 0) {
      console.log('\nErrors:');
      stats.errors.forEach(err => {
        console.log(`  - ${err.band}: ${err.error}`);
      });
    }

    if (stats.changes.length > 0 && stats.changes.length <= 20) {
      console.log('\nDetailed changes:');
      stats.changes.forEach(change => {
        console.log(`  ${change.band}:`);
        console.log(`    ${change.oldGenres.join(', ')} -> ${change.newGenres.join(', ')}`);
        console.log(`    (${change.reason})`);
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
        console.log('Usage: ts-node src/normalizeGenreTags.ts [options]');
        console.log('Options:');
        console.log('  --dry-run              Simulate without making changes');
        console.log('  --backup               Create backup before normalization');
        console.log('  --help                 Show this help message');
        console.log('\nThis script will:');
        console.log('  1. Normalize genre names (lowercase, remove "metal" suffix)');
        console.log('  2. Remove invalid genres (not in genres.json)');
        console.log('  3. Try to suggest closest matches for invalid genres');
        console.log('  4. Delete bands with no valid genres');
        console.log('  5. Keep at least 1 valid genre per band');
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

  const normalizer = new NormalizeGenreTags(config as AppConfig);
  await normalizer.normalize(dryRun, backup);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { NormalizeGenreTags };