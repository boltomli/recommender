import { loadConfig } from './config';
import { LLMClient } from './llmClient';
import { dbManager, IDatabase } from './database';
import { DataExporter } from './exportData';
import { DataImporter } from './importData';
import { BatchRecommendationGenerator } from './batchRecommendations';
import path from 'path';

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'data');

let db: IDatabase;
let exporter: DataExporter;
let importer: DataImporter;
let batchGenerator: BatchRecommendationGenerator;

async function initialize() {
  // Initialize database with fallback (PostgreSQL -> SQLite)
  db = await dbManager.initialize();
  console.log(`数据库类型: ${dbManager.getType()}`);

  const config = loadConfig();
  const llmClient = new LLMClient(config.llm);
  exporter = new DataExporter(db);
  importer = new DataImporter(llmClient, db);
  batchGenerator = new BatchRecommendationGenerator(db);
}

async function exportData() {
  console.log('Exporting data...');

  await exporter.exportGenresToFile(path.join(OUTPUT_DIR, 'genres.json'));
  console.log('✓ Exported genres');

  await exporter.exportBandsToFile(path.join(OUTPUT_DIR, 'bands.json'));
  console.log('✓ Exported bands');

  await exporter.exportRecommendationsToFile(path.join(OUTPUT_DIR, 'recommendations.json'));
  console.log('✓ Exported recommendations');

  console.log('Data export complete!');
}

async function importData() {
  const genre = process.env.GENRE || 'thrash';
  const count = parseInt(process.env.COUNT || '5', 10);

  console.log(`Importing ${count} ${genre} bands from LLM...`);

  const result = await importer.importFromLLM({ genre, count });

  console.log(`Import complete!`);
  console.log(`  Imported: ${result.imported}`);
  console.log(`  Skipped: ${result.skipped}`);

  if (result.errors.length > 0) {
    console.log('Errors:');
    result.errors.forEach(err => console.log(`  - ${err}`));
  }
}

async function generateRecommendations() {
  console.log('Generating recommendations...');

  const recommendations = await batchGenerator.generateForAllGenres();

  for (const genre of Object.keys(recommendations)) {
    console.log(`✓ Generated ${recommendations[genre].length} recommendations for ${genre}`);
  }

  await exporter.exportRecommendationsToFile(path.join(OUTPUT_DIR, 'recommendations.json'));
  console.log('✓ Exported recommendations');
}

async function main() {
  const command = process.argv[2];

  try {
    await initialize();

    switch (command) {
      case 'export-data':
        await exportData();
        break;
      case 'import-data':
        await importData();
        break;
      case 'generate-recommendations':
        await generateRecommendations();
        break;
      default:
        console.log('Usage: ts-node cli.ts <command>');
        console.log('Commands:');
        console.log('  export-data              Export all data to frontend/public/data');
        console.log('  import-data              Import bands from LLM');
        console.log('  generate-recommendations Generate recommendations for all genres');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await dbManager.close();
  }
}

main();
