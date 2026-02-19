/**
 * 数据库刷新脚本
 * 用修复后的静态数据刷新 SQLite 和 PostgreSQL 数据库
 */

import { Band } from './types';
import { STATIC_BANDS } from './staticBands';
import { DatabaseManager } from './db';
import { validateAndNormalizeBand } from './dataStandards';

interface RefreshResult {
  database: string;
  totalBands: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

/**
 * 从 STATIC_BANDS 提取所有乐队
 * 注意：STATIC_BANDS 的键是原始流派分类，但乐队数据中的 genre 已经被标准化
 */
function extractAllBands(): Band[] {
  const bands: Band[] = [];
  const seenBandIds = new Set<string>();

  for (const [category, genreBands] of Object.entries(STATIC_BANDS)) {
    console.log(`Extracting ${genreBands.length} bands from category: ${category}`);

    for (const band of genreBands) {
      // 跳过重复
      if (seenBandIds.has(band.id)) {
        continue;
      }

      // 使用乐队数据中的第一个流派作为 primary genre
      // 因为 genre 数组已经被修复为标准化流派
      const primaryGenre = band.genre && band.genre.length > 0
        ? band.genre[0]
        : category;

      // 验证和标准化数据
      const validation = validateAndNormalizeBand(band, primaryGenre);

      if (validation.valid && validation.band) {
        bands.push(validation.band);
        seenBandIds.add(band.id);
      } else {
        console.warn(`⚠️  Skipping invalid band "${band.name}": ${validation.errors.join(', ')}`);
      }
    }
  }

  return bands;
}

/**
 * 清空数据库
 */
async function clearDatabase(db: any, dbType: string): Promise<void> {
  console.log('🗑️  Clearing existing data...');

  try {
    // 获取所有现有乐队并删除
    const existingBands = await db.getAllBands();
    console.log(`   Found ${existingBands.length} existing bands to remove`);

    for (const band of existingBands) {
      try {
        await db.deleteBand(band.id);
      } catch (e) {
        // 忽略单个删除错误
      }
    }

    console.log('✅ Database cleared\n');
  } catch (error) {
    console.warn('⚠️  Could not clear all data:', error);
  }
}

/**
 * 刷新数据库
 */
async function refreshDatabase(): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];

  // 提取所有乐队数据
  console.log('\n📦 Extracting bands from static data...');
  const allBands = extractAllBands();
  console.log(`✅ Extracted ${allBands.length} valid bands\n`);

  // 初始化数据库连接
  const dbManager = new DatabaseManager();

  try {
    const db = await dbManager.initialize();
    const dbType = dbManager.getType();

    console.log(`🔄 Connected to ${dbType.toUpperCase()} database\n`);

    const result: RefreshResult = {
      database: dbType,
      totalBands: allBands.length,
      inserted: 0,
      skipped: 0,
      errors: []
    };

    // 清空现有数据
    await clearDatabase(db, dbType);

    // 插入新数据
    console.log('💾 Inserting new data...');
    const insertedIds = new Set<string>();
    const insertedNames = new Set<string>();

    for (const band of allBands) {
      try {
        // 检查是否已存在（避免重复）
        if (insertedIds.has(band.id) || insertedNames.has(band.name.toLowerCase())) {
          console.log(`   ⏭️  Skipping duplicate: ${band.name}`);
          result.skipped++;
          continue;
        }

        // 插入乐队
        await db.createBand(band);
        insertedIds.add(band.id);
        insertedNames.add(band.name.toLowerCase());
        result.inserted++;

        if (result.inserted % 50 === 0) {
          console.log(`   ✅ Inserted ${result.inserted} bands...`);
        }
      } catch (error) {
        const errorMsg = `Failed to insert "${band.name}": ${error}`;
        console.error(`   ❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    results.push(result);

    // 验证插入结果
    console.log('\n🔍 Verifying insertion...');
    const verifyBands = await db.getAllBands();
    console.log(`   Total bands in database: ${verifyBands.length}`);

    // 按流派统计
    const genreCounts: Record<string, number> = {};
    for (const band of verifyBands) {
      const primaryGenre = band.genre[0];
      genreCounts[primaryGenre] = (genreCounts[primaryGenre] || 0) + 1;
    }

    console.log('\n📊 Bands by genre:');
    for (const [genre, count] of Object.entries(genreCounts).sort()) {
      console.log(`   ${genre}: ${count}`);
    }

  } catch (error) {
    console.error('❌ Database error:', error);
    results.push({
      database: 'unknown',
      totalBands: allBands.length,
      inserted: 0,
      skipped: 0,
      errors: [`Database connection failed: ${error}`]
    });
  } finally {
    await dbManager.close();
  }

  return results;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 Database Refresh Tool');
  console.log('========================\n');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const sqliteOnly = args.includes('--sqlite') || args.includes('-s');

  // 如果指定了 --sqlite，临时禁用 PostgreSQL
  if (sqliteOnly) {
    console.log('📌 SQLite-only mode (ignoring PostgreSQL)\n');
    delete process.env.DATABASE_URL;
    delete process.env.NETLIFY_DATABASE_URL;
  }

  if (dryRun) {
    console.log('🏃 DRY RUN MODE - No changes will be made\n');

    // 仅验证数据
    console.log('📦 Extracting and validating bands...');
    const allBands = extractAllBands();
    console.log(`\n✅ Found ${allBands.length} valid bands ready for insertion`);

    // 显示流派分布
    const genreCounts: Record<string, number> = {};
    for (const band of allBands) {
      const primaryGenre = band.genre[0];
      genreCounts[primaryGenre] = (genreCounts[primaryGenre] || 0) + 1;
    }

    console.log('\n📊 Bands by genre:');
    for (const [genre, count] of Object.entries(genreCounts).sort()) {
      console.log(`   ${genre}: ${count}`);
    }

    process.exit(0);
  }

  // 确认提示
  console.log('⚠️  WARNING: This will DELETE all existing data and re-insert from staticBands.ts');
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    // 执行刷新（带超时）
    const timeoutPromise = new Promise<RefreshResult[]>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out after 60 seconds')), 60000);
    });

    const results = await Promise.race([
      refreshDatabase(),
      timeoutPromise
    ]);

    // 生成报告
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  REFRESH REPORT                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    for (const result of results) {
      console.log(`\n📊 ${result.database.toUpperCase()}`);
      console.log(`   Total bands: ${result.totalBands}`);
      console.log(`   Inserted: ${result.inserted}`);
      console.log(`   Skipped: ${result.skipped}`);
      console.log(`   Errors: ${result.errors.length}`);

      if (result.errors.length > 0) {
        console.log('\n   Errors:');
        for (const error of result.errors.slice(0, 5)) {
          console.log(`     ❌ ${error}`);
        }
        if (result.errors.length > 5) {
          console.log(`     ... and ${result.errors.length - 5} more`);
        }
      }
    }

    console.log('\n✨ Done!');

    // 退出码
    const hasErrors = results.some(r => r.errors.length > 0);
    process.exit(hasErrors ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.log('\n💡 Tip: Use --sqlite flag to force SQLite mode');
    process.exit(1);
  }
}

// 运行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
