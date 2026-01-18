import { loadConfig } from './config';
import { LLMClient } from './llmClient';
import { DatabaseManager } from './database';
import { DataExporter } from './exportData';
import { DataImporter } from './importData';
import { BatchRecommendationGenerator } from './batchRecommendations';
import path from 'path';

const config = loadConfig();
const llmClient = new LLMClient(config.llm);
const db = new DatabaseManager(config.database.path);
const exporter = new DataExporter(db);
const importer = new DataImporter(llmClient, db);
const batchGenerator = new BatchRecommendationGenerator(db);

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'data');

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
  console.log('✓ Exported recommendations to file');

  console.log('Recommendation generation complete!');
}

const command = process.argv[2];

switch (command) {
  case 'export-data':
    exportData().catch(console.error);
    break;
  case 'import-data':
    importData().catch(console.error);
    break;
  case 'generate-recommendations':
    generateRecommendations().catch(console.error);
    break;
  default:
    console.log('Usage: npm run <command>');
    console.log('Commands:');
    console.log('  export-data          Export all data to JSON files');
    console.log('  import-data          Import bands from LLM (set GENRE and COUNT env vars)');
    console.log('  generate-recommendations  Generate and export recommendations');
    process.exit(1);
}