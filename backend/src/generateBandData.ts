import { LLMClient } from './llmClient';
import { Band, BandTier } from './types';
import fs from 'fs';
import path from 'path';

interface BandGenerationConfig {
  genre: string;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
}

interface GeneratedBandData {
  name: string;
  genre: string[];
  era: string;
  albums: string[];
  description: string;
  styleNotes: string;
  tier: BandTier;
}

export class BandDataGenerator {
  private llmClient: LLMClient;
  private cachePath: string;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;

  constructor(llmClient: LLMClient, cachePath: string = './cache') {
    this.llmClient = llmClient;
    this.cachePath = cachePath;
    this.ensureCacheDirectory();
  }

  private ensureCacheDirectory(): void {
    if (!fs.existsSync(this.cachePath)) {
      fs.mkdirSync(this.cachePath, { recursive: true });
    }
  }

  private getCacheKey(genre: string, tier: BandTier, count: number): string {
    return `${genre}_${tier}_${count}.json`;
  }

  private getCachedData(genre: string, tier: BandTier, count: number): GeneratedBandData[] | null {
    const cacheKey = this.getCacheKey(genre, tier, count);
    const cacheFile = path.join(this.cachePath, cacheKey);

    if (fs.existsSync(cacheFile)) {
      try {
        const data = fs.readFileSync(cacheFile, 'utf-8');
        return JSON.parse(data);
      } catch (error) {
        console.error(`Error reading cache file ${cacheFile}:`, error);
      }
    }

    return null;
  }

  private setCachedData(genre: string, tier: BandTier, count: number, data: GeneratedBandData[]): void {
    const cacheKey = this.getCacheKey(genre, tier, count);
    const cacheFile = path.join(this.cachePath, cacheKey);

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error writing cache file ${cacheFile}:`, error);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async generateBandsForTier(
    genre: string,
    tier: BandTier,
    count: number,
    existingBands: string[] = []
  ): Promise<GeneratedBandData[]> {
    // Check cache first
    const cached = this.getCachedData(genre, tier, count);
    if (cached) {
      console.log(`Using cached data for ${genre} ${tier}`);
      return cached;
    }

    console.log(`Generating ${count} ${tier} bands for ${genre}...`);

    const bands: GeneratedBandData[] = [];
    let attempts = 0;
    const maxAttempts = count * 3;

    while (bands.length < count && attempts < maxAttempts) {
      attempts++;

      try {
        const result = await this.generateBandsWithRetry(genre, tier, count - bands.length, existingBands);

        for (const bandData of result.bands || []) {
          if (this.validateBand(bandData) && !existingBands.includes(bandData.name)) {
            bands.push({
              ...bandData,
              tier: tier
            });
            existingBands.push(bandData.name);
            console.log(`Added ${tier} band: ${bandData.name} (${bands.length}/${count})`);

            if (bands.length >= count) {
              break;
            }
          }
        }
      } catch (error) {
        console.error(`Error generating bands (attempt ${attempts}):`, error);
        await this.sleep(this.retryDelay * attempts);
      }
    }

    if (bands.length < count) {
      console.warn(`Warning: Only generated ${bands.length}/${count} ${tier} bands for ${genre}`);
    }

    // Cache the results
    this.setCachedData(genre, tier, count, bands);

    return bands;
  }

  private async generateBandsWithRetry(
    genre: string,
    tier: BandTier,
    count: number,
    existingBands: string[]
  ): Promise<any> {
    const tierCriteria = this.getTierCriteria(tier);
    const excludeList = existingBands.length > 0 ? existingBands.join(', ') : 'none';

    const prompt = `Generate ${count} metal bands in the ${genre} subgenre.

Tier criteria: ${tierCriteria}

IMPORTANT:
- Do NOT include any of these bands: ${excludeList}
- Generate NEW bands that are not in this list
- Each band must be unique
- Provide accurate information about real bands

Return valid JSON with this structure:
{
  "bands": [
    {
      "name": "Band Name",
      "genre": ["genre1", "genre2"],
      "era": "1980s|1990s|2000s|2010s|2020s",
      "albums": ["Album1", "Album2", "Album3"],
      "description": "50-200 character description",
      "styleNotes": "30-150 character style notes"
    }
  ]
}`;

    const messages = [
      {
        role: 'system' as const,
        content: 'You are a metal music expert with comprehensive knowledge of metal bands across all subgenres and eras. Provide accurate, detailed information about real metal bands. Always return valid JSON.'
      },
      {
        role: 'user' as const,
        content: prompt
      }
    ];

    let lastError: Error | null = null;

    for (let retry = 0; retry < this.maxRetries; retry++) {
      try {
        const response = await this.llmClient['callLLM'](messages);
        const content = response.choices[0]?.message?.content || '{}';
        const result = JSON.parse(content);

        if (result.bands && Array.isArray(result.bands)) {
          return result;
        } else {
          throw new Error('Invalid response format: missing bands array');
        }
      } catch (error) {
        lastError = error as Error;
        console.error(`Retry ${retry + 1}/${this.maxRetries}:`, error);

        if (retry < this.maxRetries - 1) {
          await this.sleep(this.retryDelay * Math.pow(2, retry));
        }
      }
    }

    throw lastError || new Error('Failed to generate bands after retries');
  }

  private getTierCriteria(tier: BandTier): string {
    switch (tier) {
      case 'well-known':
        return 'Top-tier bands with high commercial success (multi-platinum albums, 10M+ monthly listeners) and significant historical influence. Pioneers or legends of the genre.';
      case 'popular':
        return 'Well-regarded bands with moderate commercial success (gold albums, 1-10M monthly listeners) and recognition within the metal community.';
      case 'niche':
        return 'Specialized, underground, or newer bands with limited commercial success (<1M monthly listeners) or focused on specific subgenres.';
      default:
        return '';
    }
  }

  private validateBand(band: any): boolean {
    if (!band || typeof band !== 'object') {
      return false;
    }

    if (!band.name || typeof band.name !== 'string' || band.name.trim().length === 0) {
      return false;
    }

    if (!band.genre || !Array.isArray(band.genre) || band.genre.length === 0) {
      return false;
    }

    if (!band.era || typeof band.era !== 'string') {
      return false;
    }

    const validEras = ['1980s', '1990s', '2000s', '2010s', '2020s'];
    if (!validEras.includes(band.era)) {
      return false;
    }

    if (!band.albums || !Array.isArray(band.albums) || band.albums.length < 2 || band.albums.length > 5) {
      return false;
    }

    if (!band.description || typeof band.description !== 'string' || band.description.length < 50 || band.description.length > 200) {
      return false;
    }

    if (!band.styleNotes || typeof band.styleNotes !== 'string' || band.styleNotes.length < 30 || band.styleNotes.length > 150) {
      return false;
    }

    return true;
  }

  async generateGenreBands(config: BandGenerationConfig): Promise<Band[]> {
    console.log(`\nGenerating bands for ${config.genre}...`);
    console.log(`Target: ${config.tier1Count} Tier 1, ${config.tier2Count} Tier 2, ${config.tier3Count} Tier 3`);

    const allBands: Band[] = [];
    const existingBandNames: string[] = [];

    // Generate Tier 1 bands (well-known)
    const tier1Bands = await this.generateBandsForTier(
      config.genre,
      'well-known',
      config.tier1Count,
      existingBandNames
    );

    for (const bandData of tier1Bands) {
      allBands.push(this.convertToBand(bandData));
    }

    // Generate Tier 2 bands (popular)
    const tier2Bands = await this.generateBandsForTier(
      config.genre,
      'popular',
      config.tier2Count,
      existingBandNames
    );

    for (const bandData of tier2Bands) {
      allBands.push(this.convertToBand(bandData));
    }

    // Generate Tier 3 bands (niche)
    const tier3Bands = await this.generateBandsForTier(
      config.genre,
      'niche',
      config.tier3Count,
      existingBandNames
    );

    for (const bandData of tier3Bands) {
      allBands.push(this.convertToBand(bandData));
    }

    console.log(`\nGenerated ${allBands.length} total bands for ${config.genre}`);
    console.log(`Tier 1: ${tier1Bands.length}, Tier 2: ${tier2Bands.length}, Tier 3: ${tier3Bands.length}`);

    return allBands;
  }

  private convertToBand(data: GeneratedBandData): Band {
    return {
      id: `band_${data.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}_${Date.now()}`,
      name: data.name,
      genre: data.genre,
      era: data.era,
      albums: data.albums,
      description: data.description,
      styleNotes: data.styleNotes,
      tier: data.tier
    };
  }

  clearCache(): void {
    if (fs.existsSync(this.cachePath)) {
      const files = fs.readdirSync(this.cachePath);
      files.forEach(file => {
        const filePath = path.join(this.cachePath, file);
        fs.unlinkSync(filePath);
      });
      console.log('Cache cleared');
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run generate-bands <genre> [tier1-count] [tier2-count] [tier3-count]');
    console.log('Example: npm run generate-bands thrash 12 35 73');
    console.log('Example: npm run generate-bands death --clear-cache');
    process.exit(1);
  }

  const genre = args[0];
  const clearCache = args.includes('--clear-cache');

  const config: BandGenerationConfig = {
    genre: genre,
    tier1Count: parseInt(args[1]) || 12,
    tier2Count: parseInt(args[2]) || 35,
    tier3Count: parseInt(args[3]) || 73
  };

  console.log(`Generating bands for ${genre}...`);

  // Load config
  const configPath = path.join(__dirname, '../config.json');
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const llmClient = new LLMClient(configData.llm);
  const generator = new BandDataGenerator(llmClient, path.join(__dirname, '../cache/band-generation'));

  if (clearCache) {
    generator.clearCache();
  }

  try {
    const bands = await generator.generateGenreBands(config);

    // Save to file
    const outputPath = path.join(__dirname, `../data/generated_${config.genre}_bands.json`);
    fs.writeFileSync(outputPath, JSON.stringify(bands, null, 2));

    console.log(`\nBands saved to: ${outputPath}`);
  } catch (error) {
    console.error('Error generating bands:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { BandGenerationConfig, GeneratedBandData };