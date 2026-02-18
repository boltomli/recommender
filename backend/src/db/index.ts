import { IDatabase } from './types';
import { PostgresAdapter } from './postgresAdapter';
import { SQLiteAdapter } from './sqliteAdapter';
import path from 'path';
import dotenv from 'dotenv';

// 加载 .env 文件中的环境变量
dotenv.config();

// 数据库连接管理器
export class DatabaseManager {
  private db: IDatabase | null = null;
  private type: 'postgresql' | 'sqlite' = 'sqlite';

  async initialize(): Promise<IDatabase> {
    // 首先尝试 PostgreSQL
    const postgresUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

    if (postgresUrl) {
      try {
        console.log('尝试连接 PostgreSQL...');
        const postgresDb = new PostgresAdapter(postgresUrl);
        await postgresDb.initialize();
        this.db = postgresDb;
        this.type = 'postgresql';
        console.log('✓ PostgreSQL 连接成功');
        return this.db;
      } catch (error) {
        console.warn('PostgreSQL 连接失败，将使用 SQLite:', error instanceof Error ? error.message : error);
      }
    } else {
      console.log('未找到 PostgreSQL 连接字符串，使用 SQLite');
    }

    // 回退到 SQLite
    const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data', 'bands.db');
    console.log('使用 SQLite:', sqlitePath);
    this.db = new SQLiteAdapter(sqlitePath);
    this.type = 'sqlite';
    console.log('✓ SQLite 连接成功');
    return this.db;
  }

  getDatabase(): IDatabase {
    if (!this.db) {
      throw new Error('数据库尚未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  getType(): 'postgresql' | 'sqlite' {
    return this.type;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

// 导出单例实例
export const dbManager = new DatabaseManager();
export { IDatabase } from './types';
