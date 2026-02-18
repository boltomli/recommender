import { Band, Session } from '../types';

// 数据库接口抽象
export interface IDatabase {
  // Band operations
  createBand(band: Band): void | Promise<void>;
  getBand(id: string): Band | undefined | Promise<Band | undefined>;
  getBandsByGenre(genre: string): Band[] | Promise<Band[]>;
  getAllBands(): Band[] | Promise<Band[]>;
  getBandsByTier(genre: string, tier: string): Band[] | Promise<Band[]>;
  deleteBand(id: string): void | Promise<void>;
  updateBandGenres(id: string, genres: string[]): void | Promise<void>;
  updateBand(band: Band): void | Promise<void>;
  updateBandDescription(id: string, description: string): void | Promise<void>;

  // Session operations
  createSession(session: Session): void | Promise<void>;
  getSession(id: string): Session | undefined | Promise<Session | undefined>;
  updateSession(session: Session): void | Promise<void>;
  deleteSession(id: string): void | Promise<void>;

  // Connection
  close(): void | Promise<void>;
  isConnected(): boolean;
}

// 数据库配置
export interface DatabaseConfig {
  type: 'postgresql' | 'sqlite';
  connectionString?: string;
  sqlitePath?: string;
}
