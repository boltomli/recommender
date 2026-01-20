import { DatabaseManager } from './database';
import { STATIC_BANDS } from './staticBands';
import { Band } from './types';
import path from 'path';

/**
 * 根据分类填充乐队数据到数据库
 * 从 staticBands.ts 中读取所有分类的乐队数据，并导入到数据库中
 */
export class BandCategoryFiller {
  private db: DatabaseManager;

  constructor(dbPath: string) {
    this.db = new DatabaseManager(dbPath);
  }

  /**
   * 填充所有分类的乐队数据
   */
  fillAllCategories(): void {
    console.log('开始填充乐队数据...');

    let totalImported = 0;
    let totalSkipped = 0;
    let totalUpdated = 0;

    const categories = Object.keys(STATIC_BANDS);
    console.log(`发现 ${categories.length} 个分类: ${categories.join(', ')}`);

    for (const category of categories) {
      const result = this.fillCategory(category);
      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalUpdated += result.updated;
    }

    console.log('\n填充完成!');
    console.log(`总计: 导入 ${totalImported} 个, 更新 ${totalUpdated} 个, 跳过 ${totalSkipped} 个`);
    
    this.db.close();
  }

  /**
   * 填充指定分类的乐队数据
   */
  fillCategory(category: string): { imported: number; updated: number; skipped: number } {
    const bands = STATIC_BANDS[category];
    
    if (!bands || bands.length === 0) {
      console.log(`分类 "${category}" 没有乐队数据`);
      return { imported: 0, updated: 0, skipped: 0 };
    }

    console.log(`\n处理分类 "${category}": ${bands.length} 个乐队`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const band of bands) {
      try {
        const existingBand = this.db.getBand(band.id);
        
        if (existingBand) {
          // 检查是否需要更新
          if (this.needsUpdate(existingBand, band)) {
            this.db.createBand(band);
            updated++;
            console.log(`  ✓ 更新: ${band.name}`);
          } else {
            skipped++;
            console.log(`  - 跳过: ${band.name} (已存在且无需更新)`);
          }
        } else {
          this.db.createBand(band);
          imported++;
          console.log(`  + 导入: ${band.name}`);
        }
      } catch (error) {
        console.error(`  ✗ 错误: ${band.name} - ${error instanceof Error ? error.message : String(error)}`);
        skipped++;
      }
    }

    console.log(`分类 "${category}" 完成: 导入 ${imported} 个, 更新 ${updated} 个, 跳过 ${skipped} 个`);

    return { imported, updated, skipped };
  }

  /**
   * 检查乐队是否需要更新
   */
  private needsUpdate(existing: Band, newData: Band): boolean {
    // 比较关键字段
    if (existing.name !== newData.name) return true;
    if (JSON.stringify(existing.genre) !== JSON.stringify(newData.genre)) return true;
    if (existing.era !== newData.era) return true;
    if (JSON.stringify(existing.albums) !== JSON.stringify(newData.albums)) return true;
    if (existing.description !== newData.description) return true;
    if (existing.styleNotes !== newData.styleNotes) return true;
    if (existing.tier !== newData.tier) return true;
    
    return false;
  }

  /**
   * 清空指定分类的乐队数据
   */
  clearCategory(category: string): number {
    const bands = STATIC_BANDS[category];
    if (!bands) return 0;

    let deleted = 0;
    for (const band of bands) {
      try {
        const stmt = this.db['db'].prepare('DELETE FROM bands WHERE id = ?');
        const result = stmt.run(band.id);
        if (result.changes > 0) {
          deleted++;
          console.log(`  - 删除: ${band.name}`);
        }
      } catch (error) {
        console.error(`  ✗ 删除失败: ${band.name} - ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log(`分类 "${category}" 清空完成: 删除 ${deleted} 个乐队`);
    return deleted;
  }

  /**
   * 显示数据库统计信息
   */
  showStats(): void {
    const allBands = this.db.getAllBands();
    
    // 按分类统计
    const categoryStats: Record<string, number> = {};
    const tierStats: Record<string, number> = {};

    for (const band of allBands) {
      // 统计分类
      for (const genre of band.genre) {
        categoryStats[genre] = (categoryStats[genre] || 0) + 1;
      }
      
      // 统计等级
      if (band.tier) {
        tierStats[band.tier] = (tierStats[band.tier] || 0) + 1;
      }
    }

    console.log('\n=== 数据库统计 ===');
    console.log(`总乐队数: ${allBands.length}`);
    console.log('\n按分类统计:');
    for (const [category, count] of Object.entries(categoryStats).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${category}: ${count}`);
    }
    console.log('\n按等级统计:');
    for (const [tier, count] of Object.entries(tierStats)) {
      console.log(`  ${tier}: ${count}`);
    }
  }
}

// CLI 接口
if (require.main === module) {
  const { loadConfig } = require('./config');
  const config = loadConfig();
  
  const dbPath = path.join(process.cwd(), config.database.path || 'data/bands.db');
  const filler = new BandCategoryFiller(dbPath);

  const args = process.argv.slice(2);
  const command = args[0] || 'fill';

  switch (command) {
    case 'fill':
      // 填充所有分类
      filler.fillAllCategories();
      // 重新创建连接以显示统计
      const statsFiller = new BandCategoryFiller(dbPath);
      statsFiller.showStats();
      statsFiller['db'].close();
      break;
    
    case 'fill-category':
      // 填充指定分类
      const category = args[1];
      if (!category) {
        console.error('请指定分类名称');
        process.exit(1);
      }
      filler.fillCategory(category);
      // 重新创建连接以显示统计
      const statsFiller1 = new BandCategoryFiller(dbPath);
      statsFiller1.showStats();
      statsFiller1['db'].close();
      break;
    
    case 'clear':
      // 清空指定分类
      const clearCategory = args[1];
      if (!clearCategory) {
        console.error('请指定要清空的分类名称');
        process.exit(1);
      }
      filler.clearCategory(clearCategory);
      // 重新创建连接以显示统计
      const statsFiller2 = new BandCategoryFiller(dbPath);
      statsFiller2.showStats();
      statsFiller2['db'].close();
      break;
    
    case 'stats':
      // 显示统计信息
      filler.showStats();
      filler['db'].close();
      break;
    
    default:
      console.log('用法:');
      console.log('  npm run fill-bands              # 填充所有分类');
      console.log('  npm run fill-bands fill-category thrash  # 填充指定分类');
      console.log('  npm run fill-bands clear thrash  # 清空指定分类');
      console.log('  npm run fill-bands stats         # 显示统计信息');
      process.exit(1);
  }
}
