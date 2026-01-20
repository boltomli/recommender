import { DatabaseManager } from './database';
import { LLMClient } from './llmClient';
import { AppConfig } from './types';
import config from '../config.json';
import path from 'path';
import fs from 'fs';

interface StandardizeStats {
  totalBandsChecked: number;
  bandsUpdated: number;
  descriptionsUpdated: number;
  styleNotesUpdated: number;
  tiersUpdated: number;
  errors: Array<{ band: string; error: string }>;
}

class StandardizeBandInfo {
  private db: DatabaseManager;
  private llm: LLMClient;
  private config: AppConfig;
  private exampleBands: any[];

  constructor(config: AppConfig) {
    this.config = config;
    this.db = new DatabaseManager(config.database.path);
    this.llm = new LLMClient(config.llm);
    this.exampleBands = this.loadExampleBands();
  }

  private loadExampleBands(): any[] {
    // Get the earliest bands by ID (sorted by ID to get oldest first)
    const allBands = this.db.getAllBands();
    const sortedBands = allBands.sort((a, b) => a.id.localeCompare(b.id));
    
    // Take the first 5 as examples
    return sortedBands.slice(0, 5).map(band => ({
      name: band.name,
      genre: band.genre.join(', '),
      era: band.era,
      albums: band.albums.join(', '),
      description: band.description,
      styleNotes: band.styleNotes || ''
    }));
  }

  async standardize(dryRun: boolean = false, backup: boolean = false, batchSize: number = 5): Promise<void> {
    console.log('='.repeat(60));
    console.log('Band Information Standardization');
    console.log('='.repeat(60));
    console.log(`Dry run: ${dryRun}`);
    console.log(`Backup: ${backup}`);
    console.log(`Batch size: ${batchSize}`);
    console.log('='.repeat(60));

    console.log('\n--- Example Bands (for style reference) ---');
    this.exampleBands.forEach((band, index) => {
      console.log(`\n${index + 1}. ${band.name}`);
      console.log(`   Description: ${band.description}`);
      console.log(`   Style Notes: ${band.styleNotes}`);
    });

    const stats: StandardizeStats = {
      totalBandsChecked: 0,
      bandsUpdated: 0,
      descriptionsUpdated: 0,
      styleNotesUpdated: 0,
      tiersUpdated: 0,
      errors: []
    };

    if (backup && !dryRun) {
      await this.createBackup();
    }

    const bands = this.db.getAllBands();
    stats.totalBandsChecked = bands.length;

    console.log(`\nProcessing ${bands.length} bands in batches of ${batchSize}...\n`);

    // Process in batches to avoid overwhelming the LLM
    for (let i = 0; i < bands.length; i += batchSize) {
      const batch = bands.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(bands.length / batchSize);

      console.log(`\n--- Batch ${batchNumber}/${totalBatches} (bands ${i + 1}-${Math.min(i + batchSize, bands.length)}) ---`);

      for (const band of batch) {
        try {
          const result = await this.standardizeBand(band, dryRun);
          
          if (result.updated) {
            stats.bandsUpdated++;
            if (result.descriptionChanged) stats.descriptionsUpdated++;
            if (result.styleNotesChanged) stats.styleNotesUpdated++;
            if (result.tierChanged) stats.tiersUpdated++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`  [ERROR] ${band.name}: ${errorMessage}`);
          stats.errors.push({ band: band.name, error: errorMessage });
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < bands.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.printSummary(stats);

    if (!dryRun && stats.bandsUpdated > 0) {
      console.log('\nSynchronizing standardized data to all sources...');
      const { SyncBandData } = await import('./syncBandData');
      const syncer = new SyncBandData(config);
      await syncer.sync('db', false, false, true);
    }

    this.db.close();
  }

  private async standardizeBand(band: any, dryRun: boolean): Promise<{
    updated: boolean;
    descriptionChanged: boolean;
    styleNotesChanged: boolean;
    tierChanged: boolean;
  }> {
    console.log(`\nProcessing: ${band.name}`);
    console.log(`  Current tier: ${band.tier || '(none)'}`);
    console.log(`  Current description: ${band.description}`);
    console.log(`  Current style notes: ${band.styleNotes || '(none)'}`);

    // Use LLM to standardize description and style notes
    const standardizedInfo = await this.llm.standardizeBandInfo(
      band.name,
      band.genre.join(', '),
      band.era,
      band.description,
      band.styleNotes || '',
      this.exampleBands
    );

    const descriptionChanged = standardizedInfo.description !== band.description;
    const styleNotesChanged = standardizedInfo.styleNotes !== (band.styleNotes || '');

    // Check and update tier
    let tierChanged = false;
    let newTier = band.tier || 'niche';
    
    try {
      const tierEvaluation = await this.llm.updateBandTier(
        band.name,
        band.genre.join(', '),
        standardizedInfo.description
      );
      
      if (tierEvaluation.tier !== band.tier) {
        tierChanged = true;
        newTier = tierEvaluation.tier;
        console.log(`  Tier evaluation: ${tierEvaluation.reasoning}`);
      }
    } catch (error) {
      console.error(`  [WARNING] Failed to evaluate tier for ${band.name}:`, error);
    }

    if (!descriptionChanged && !styleNotesChanged && !tierChanged) {
      console.log('  [NO CHANGES] Band info already standardized');
      return {
        updated: false,
        descriptionChanged: false,
        styleNotesChanged: false,
        tierChanged: false
      };
    }

    console.log(`  [${dryRun ? 'DRY-RUN ' : ''}UPDATED]`);
    
    if (tierChanged) {
      console.log(`    Tier: ${band.tier || '(none)'} -> ${newTier}`);
    }
    
    if (descriptionChanged) {
      console.log(`    Description: ${band.description}`);
      console.log(`    -> ${standardizedInfo.description}`);
    }
    
    if (styleNotesChanged) {
      console.log(`    Style Notes: ${band.styleNotes || '(none)'}`);
      console.log(`    -> ${standardizedInfo.styleNotes}`);
    }

    if (!dryRun) {
      // Update in database immediately to avoid data loss
      const stmt = this.db['db'].prepare(`
        UPDATE bands 
        SET description = ?, style_notes = ?, tier = ?
        WHERE id = ?
      `);
      stmt.run(
        standardizedInfo.description,
        standardizedInfo.styleNotes,
        newTier,
        band.id
      );
      
      console.log('  [DB UPDATED] Changes saved to database');
    }

    return {
      updated: true,
      descriptionChanged,
      styleNotesChanged,
      tierChanged
    };
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

  private printSummary(stats: StandardizeStats): void {
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Total bands checked: ${stats.totalBandsChecked}`);
    console.log(`Bands updated:      ${stats.bandsUpdated}`);
    console.log(`Descriptions updated: ${stats.descriptionsUpdated}`);
    console.log(`Style notes updated: ${stats.styleNotesUpdated}`);
    console.log(`Tiers updated:      ${stats.tiersUpdated}`);
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
  let batchSize = 5;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--backup':
        backup = true;
        break;
      case '--batch-size':
        batchSize = parseInt(args[++i], 10);
        if (isNaN(batchSize) || batchSize < 1) {
          console.error('Invalid batch-size value. Must be a positive integer.');
          process.exit(1);
        }
        break;
      case '--help':
        console.log('Usage: ts-node src/standardizeBandInfo.ts [options]');
        console.log('Options:');
        console.log('  --dry-run              Simulate without making changes');
        console.log('  --backup               Create backup before standardization');
        console.log('  --batch-size <number>  Number of bands to process per batch (default: 5)');
        console.log('  --help                 Show this help message');
        console.log('\nThis script will:');
        console.log('  1. Standardize band descriptions using LLM');
        console.log('  2. Standardize style notes using LLM');
        console.log('  3. Check and update tier information using LLM');
        console.log('  4. Use earliest 5 bands as style examples');
        console.log('  5. Update database immediately after each band');
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

  const standardizer = new StandardizeBandInfo(config as AppConfig);
  await standardizer.standardize(dryRun, backup, batchSize);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { StandardizeBandInfo };