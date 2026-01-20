import { DatabaseManager } from './database';
import { LLMClient } from './llmClient';
import { AppConfig } from './types';
import config from '../config.json';
import readline from 'readline';

interface DuplicateGroup {
  name: string;
  bands: Array<{ id: string; name: string; genre: string; description: string }>;
}

interface DuplicateStats {
  duplicateGroups: number;
  totalBands: number;
  fixed: number;
  skipped: number;
  errors: Array<{ name: string; error: string }>;
}

class HandleDuplicateNames {
  private db: DatabaseManager;
  private llm: LLMClient;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.db = new DatabaseManager(config.database.path);
    this.llm = new LLMClient(config.llm);
  }

  async handleAll(genre?: string, dryRun: boolean = false, autoFix: boolean = false): Promise<void> {
    console.log('='.repeat(60));
    console.log('Duplicate Band Name Handler');
    console.log('='.repeat(60));
    console.log(`Genre: ${genre || 'All genres'}`);
    console.log(`Dry run: ${dryRun}`);
    console.log(`Auto fix: ${autoFix}`);
    console.log('='.repeat(60));

    const allBands = genre ? this.db.getBandsByGenre(genre) : this.db.getAllBands();
    const duplicateGroups = this.findDuplicates(allBands);

    if (duplicateGroups.length === 0) {
      console.log('\nNo duplicate band names found.');
      this.db.close();
      return;
    }

    console.log(`\nFound ${duplicateGroups.length} groups of duplicate names:\n`);

    const stats: DuplicateStats = {
      duplicateGroups: duplicateGroups.length,
      totalBands: 0,
      fixed: 0,
      skipped: 0,
      errors: []
    };

    for (const group of duplicateGroups) {
      stats.totalBands += group.bands.length;
      console.log(`Group: "${group.name}" (${group.bands.length} bands)`);
      group.bands.forEach(b => {
        console.log(`  - ${b.id} (${b.genre})`);
      });
    }

    console.log('\n' + '='.repeat(60));

    for (const group of duplicateGroups) {
      await this.handleDuplicateGroup(group, dryRun, autoFix, stats);
    }

    this.printSummary(stats);
    this.db.close();
  }

  private findDuplicates(bands: any[]): DuplicateGroup[] {
    const nameMap: Map<string, Array<{ id: string; name: string; genre: string; description: string }>> = new Map();

    bands.forEach(band => {
      const normalizedName = band.name.toLowerCase().trim();
      if (!nameMap.has(normalizedName)) {
        nameMap.set(normalizedName, []);
      }
      nameMap.get(normalizedName)!.push({
        id: band.id,
        name: band.name,
        genre: Array.isArray(band.genre) ? band.genre[0] : band.genre,
        description: band.description
      });
    });

    const duplicates: DuplicateGroup[] = [];
    nameMap.forEach((bands, name) => {
      if (bands.length > 1) {
        duplicates.push({ name, bands });
      }
    });

    return duplicates.sort((a, b) => b.bands.length - a.bands.length);
  }

  private async handleDuplicateGroup(group: DuplicateGroup, dryRun: boolean, autoFix: boolean, stats: DuplicateStats): Promise<void> {
    console.log(`\nProcessing: "${group.name}"`);

    if (!autoFix) {
      const confirm = await this.prompt(`Generate distinguishing information for ${group.bands.length} bands? (y/n): `);
      if (confirm.toLowerCase() !== 'y') {
        console.log('  Skipped.');
        stats.skipped += group.bands.length;
        return;
      }
    }

    try {
      const genres = group.bands.map(b => b.genre).join(', ');
      const distinguishingInfo = await this.llm.generateDistinguishingInfo(
        group.bands.map(b => b.name),
        genres
      );

      if (!distinguishingInfo || distinguishingInfo.length === 0) {
        console.log('  No distinguishing information generated');
        return;
      }

      console.log(`  Generated ${distinguishingInfo.length} distinguishing entries`);

      for (const info of distinguishingInfo) {
        const targetBand = group.bands.find(b => b.name.toLowerCase() === info.name.toLowerCase());
        if (!targetBand) {
          console.log(`  Warning: No matching band found for "${info.name}"`);
          continue;
        }

        const newDescription = this.appendDistinguishingInfo(targetBand.description, info.distinguishingInfo);

        if (dryRun) {
          console.log(`    [DRY-RUN] ${targetBand.id}: ${info.distinguishingInfo}`);
        } else {
          const stmt = this.db['db'].prepare('UPDATE bands SET description = ? WHERE id = ?');
          stmt.run(newDescription, targetBand.id);
          console.log(`    [UPDATED] ${targetBand.id}: ${info.distinguishingInfo}`);
        }

        stats.fixed++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  Error processing "${group.name}": ${errorMessage}`);
      stats.errors.push({ name: group.name, error: errorMessage });
    }
  }

  private appendDistinguishingInfo(description: string, distinguishingInfo: string): string {
    if (!distinguishingInfo.trim()) {
      return description;
    }

    const separator = description.endsWith('.') ? ' ' : '. ';
    return `${description}${separator}${distinguishingInfo}`;
  }

  private prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close();
        resolve(answer);
      });
    });
  }

  private printSummary(stats: DuplicateStats): void {
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Duplicate groups: ${stats.duplicateGroups}`);
    console.log(`Total bands affected: ${stats.totalBands}`);
    console.log(`Fixed: ${stats.fixed}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log('='.repeat(60));

    if (stats.errors.length > 0) {
      console.log('\nErrors:');
      stats.errors.forEach(err => {
        console.log(`  - ${err.name}: ${err.error}`);
      });
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let genre: string | undefined;
  let dryRun = false;
  let autoFix = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--genre':
        genre = args[++i];
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--auto-fix':
        autoFix = true;
        break;
      case '--help':
        console.log('Usage: ts-node src/handleDuplicateNames.ts [options]');
        console.log('Options:');
        console.log('  --genre <name>   Process only bands in this genre');
        console.log('  --dry-run        Simulate without making changes');
        console.log('  --auto-fix       Automatically fix without confirmation');
        console.log('  --help           Show this help message');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  const handler = new HandleDuplicateNames(config as AppConfig);
  await handler.handleAll(genre, dryRun, autoFix);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { HandleDuplicateNames };