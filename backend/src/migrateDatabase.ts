import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * 数据库迁移脚本
 * 用于更新数据库表结构以支持新的字段
 */
export function migrateDatabase(dbPath: string): void {
  console.log(`正在迁移数据库: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.log('数据库文件不存在，跳过迁移');
    return;
  }

  const db = new Database(dbPath);

  try {
    // 启用外键约束
    db.pragma('foreign_keys = ON');

    // 检查 bands 表是否存在
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bands'").get();
    
    if (!tableInfo) {
      console.log('bands 表不存在，将创建新表');
      createNewSchema(db);
    } else {
      // 获取现有列
      const columns = db.prepare("PRAGMA table_info(bands)").all() as any[];
      const columnNames = columns.map((c: any) => c.name);

      console.log('现有列:', columnNames.join(', '));

      // 检查是否需要添加 tier 列
      if (!columnNames.includes('tier')) {
        console.log('添加 tier 列...');
        db.exec('ALTER TABLE bands ADD COLUMN tier TEXT NOT NULL DEFAULT "niche"');
      }

      // 检查是否需要添加 style_notes 列
      if (!columnNames.includes('style_notes')) {
        console.log('添加 style_notes 列...');
        db.exec('ALTER TABLE bands ADD COLUMN style_notes TEXT');
      }

      // 检查是否需要添加 embedding 列
      if (!columnNames.includes('embedding')) {
        console.log('添加 embedding 列...');
        db.exec('ALTER TABLE bands ADD COLUMN embedding BLOB');
      }

      // 检查是否需要添加 created_at 列
      if (!columnNames.includes('created_at')) {
        console.log('添加 created_at 列...');
        db.exec('ALTER TABLE bands ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
      }

      // 检查索引
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='bands'").all() as any[];
      const indexNames = indexes.map((i: any) => i.name);

      if (!indexNames.includes('idx_bands_genre')) {
        console.log('创建 idx_bands_genre 索引...');
        db.exec('CREATE INDEX IF NOT EXISTS idx_bands_genre ON bands(genre)');
      }

      if (!indexNames.includes('idx_bands_tier')) {
        console.log('创建 idx_bands_tier 索引...');
        db.exec('CREATE INDEX IF NOT EXISTS idx_bands_tier ON bands(tier)');
      }
    }

    // 检查 sessions 表
    const sessionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
    
    if (!sessionsTable) {
      console.log('创建 sessions 表...');
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          genre TEXT NOT NULL,
          comparison_history TEXT NOT NULL,
          preference_weights TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all() as any[];
      const sessionColumnNames = sessionColumns.map((c: any) => c.name);

      if (!sessionColumnNames.includes('updated_at')) {
        console.log('为 sessions 表添加 updated_at 列...');
        db.exec('ALTER TABLE sessions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
      }

      const sessionIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions'").all() as any[];
      const sessionIndexNames = sessionIndexes.map((i: any) => i.name);

      if (!sessionIndexNames.includes('idx_sessions_genre')) {
        console.log('创建 idx_sessions_genre 索引...');
        db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_genre ON sessions(genre)');
      }
    }

    console.log('数据库迁移完成!');
  } catch (error) {
    console.error('迁移失败:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    db.close();
  }
}

function createNewSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      genre TEXT NOT NULL,
      era TEXT NOT NULL,
      albums TEXT NOT NULL,
      description TEXT NOT NULL,
      style_notes TEXT,
      tier TEXT NOT NULL DEFAULT 'niche',
      embedding BLOB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      genre TEXT NOT NULL,
      comparison_history TEXT NOT NULL,
      preference_weights TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bands_genre ON bands(genre);
    CREATE INDEX IF NOT EXISTS idx_bands_tier ON bands(tier);
    CREATE INDEX IF NOT EXISTS idx_sessions_genre ON sessions(genre);
  `);
}

// CLI 接口
if (require.main === module) {
  const dbPath = process.argv[2] || path.join(process.cwd(), 'data/bands.db');
  
  try {
    migrateDatabase(dbPath);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}