/**
 * Netlify 构建脚本
 * 
 * 在 Netlify 构建时从 NETLIFY_DATABASE_URL 导出数据到静态 JSON 文件
 * 这样前端静态模式就能使用数据库中的数据
 */

import * as fs from 'fs';
import * as path from 'path';
import { dbManager } from './db';

// 前端数据目录
const FRONTEND_DATA_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'data');

interface ExportData {
  timestamp: string;
  genres: string[];
  bands: Array<{
    id: string;
    name: string;
    genre: string[];
    era: string;
    albums: string[];
    description: string;
    styleNotes?: string;
    tier?: string;
  }>;
}

async function exportForNetlify(): Promise<void> {
  console.log('🚀 Starting Netlify data export...');
  
  // 检查 NETLIFY_DATABASE_URL
  const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.warn('⚠️  NETLIFY_DATABASE_URL or DATABASE_URL not found');
    console.warn('   Using existing static data or fallback data');
    
    // 如果已经存在 bands.json，就不做任何事
    const bandsJsonPath = path.join(FRONTEND_DATA_DIR, 'bands.json');
    if (fs.existsSync(bandsJsonPath)) {
      console.log('✓ Existing bands.json found, skipping export');
      return;
    }
    
    // 创建空的静态数据文件
    const fallbackData: ExportData = {
      timestamp: new Date().toISOString(),
      genres: ['thrash', 'death', 'black', 'power', 'doom', 'progressive', 'heavy', 'speed', 'groove', 'folk'],
      bands: []
    };
    
    ensureDirectoryExists(FRONTEND_DATA_DIR);
    fs.writeFileSync(bandsJsonPath, JSON.stringify(fallbackData, null, 2));
    console.log('✓ Created fallback bands.json');
    return;
  }
  
  console.log('📡 Found database URL, connecting...');
  console.log(`   Database type: ${databaseUrl.startsWith('postgres') ? 'PostgreSQL' : 'Unknown'}`);
  
  try {
    // 初始化数据库连接
    const db = await dbManager.initialize();
    console.log(`✓ Connected to database (${dbManager.getType()})`);
    
    // 导出所有乐队数据
    console.log('📦 Exporting bands...');
    const bands = await db.getAllBands();
    console.log(`   Found ${bands.length} bands`);
    
    // 从乐队数据中提取所有流派
    const genreSet = new Set<string>();
    bands.forEach(band => {
      band.genre.forEach(g => genreSet.add(g));
    });
    const genres = Array.from(genreSet).sort();
    console.log(`   Found ${genres.length} genres: ${genres.join(', ')}`);
    
    // 构建导出数据
    const exportData: ExportData = {
      timestamp: new Date().toISOString(),
      genres,
      bands: bands.map(band => ({
        id: band.id,
        name: band.name,
        genre: band.genre,
        era: band.era,
        albums: band.albums,
        description: band.description,
        styleNotes: band.styleNotes,
        tier: band.tier
      }))
    };
    
    // 确保目录存在
    ensureDirectoryExists(FRONTEND_DATA_DIR);
    
    // 写入 bands.json
    const bandsJsonPath = path.join(FRONTEND_DATA_DIR, 'bands.json');
    fs.writeFileSync(bandsJsonPath, JSON.stringify(exportData, null, 2));
    console.log(`✓ Exported ${bands.length} bands to ${bandsJsonPath}`);
    
    // 同时导出单独的 genres.json（便于前端快速读取）
    const genresData = {
      timestamp: new Date().toISOString(),
      genres,
      counts: countBandsPerGenre(bands)
    };
    const genresJsonPath = path.join(FRONTEND_DATA_DIR, 'genres.json');
    fs.writeFileSync(genresJsonPath, JSON.stringify(genresData, null, 2));
    console.log(`✓ Exported ${genres.length} genres to ${genresJsonPath}`);
    
    // 关闭数据库连接
    await dbManager.close();
    console.log('✓ Database connection closed');
    
    console.log('\n🎉 Netlify data export completed successfully!');
    
  } catch (error) {
    console.error('❌ Export failed:', error instanceof Error ? error.message : error);
    
    // 如果导出失败，尝试使用现有数据或创建空数据
    const bandsJsonPath = path.join(FRONTEND_DATA_DIR, 'bands.json');
    if (fs.existsSync(bandsJsonPath)) {
      console.log('✓ Using existing bands.json as fallback');
    } else {
      console.warn('⚠️  No existing data found, creating empty fallback');
      const fallbackData: ExportData = {
        timestamp: new Date().toISOString(),
        genres: ['thrash', 'death', 'black', 'power', 'doom', 'progressive', 'heavy', 'speed', 'groove', 'folk'],
        bands: []
      };
      ensureDirectoryExists(FRONTEND_DATA_DIR);
      fs.writeFileSync(bandsJsonPath, JSON.stringify(fallbackData, null, 2));
    }
    
    // 不要抛出错误，让构建继续
    process.exitCode = 0;
  }
}

function ensureDirectoryExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`   Created directory: ${dir}`);
  }
}

function countBandsPerGenre(bands: Array<{ genre: string[] }>): Record<string, number> {
  const counts: Record<string, number> = {};
  bands.forEach(band => {
    band.genre.forEach(g => {
      counts[g] = (counts[g] || 0) + 1;
    });
  });
  return counts;
}

// 运行导出
exportForNetlify().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
