import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Band, Session, Comparison } from './types';

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Bands table
    this.db.exec(`
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

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        genre TEXT NOT NULL,
        comparison_history TEXT NOT NULL,
        preference_weights TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bands_genre ON bands(genre);
      CREATE INDEX IF NOT EXISTS idx_bands_tier ON bands(tier);
      CREATE INDEX IF NOT EXISTS idx_sessions_genre ON sessions(genre);
    `);
  }

  // Band operations
  createBand(band: Band): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO bands (id, name, genre, era, albums, description, style_notes, tier, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      band.id,
      band.name,
      JSON.stringify(band.genre),
      band.era,
      JSON.stringify(band.albums),
      band.description,
      band.styleNotes || null,
      band.tier || 'niche',
      band.embedding || null
    );
  }

  getBand(id: string): Band | undefined {
    const stmt = this.db.prepare('SELECT * FROM bands WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      genre: JSON.parse(row.genre),
      era: row.era,
      albums: JSON.parse(row.albums),
      description: row.description,
      styleNotes: row.style_notes,
      tier: row.tier || undefined,
      embedding: row.embedding
    };
  }

  getBandsByGenre(genre: string): Band[] {
    const stmt = this.db.prepare('SELECT * FROM bands WHERE genre LIKE ?');
    const rows = stmt.all(`%${genre}%`) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      genre: JSON.parse(row.genre),
      era: row.era,
      albums: JSON.parse(row.albums),
      description: row.description,
      styleNotes: row.style_notes,
      tier: row.tier || undefined,
      embedding: row.embedding
    }));
  }

  getAllBands(): Band[] {
    const stmt = this.db.prepare('SELECT * FROM bands');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      genre: JSON.parse(row.genre),
      era: row.era,
      albums: JSON.parse(row.albums),
      description: row.description,
      styleNotes: row.style_notes,
      tier: row.tier || undefined,
      embedding: row.embedding
    }));
  }

  getBandsByTier(genre: string, tier: string): Band[] {
    const stmt = this.db.prepare('SELECT * FROM bands WHERE genre LIKE ? AND tier = ?');
    const rows = stmt.all(`%${genre}%`, tier) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      genre: JSON.parse(row.genre),
      era: row.era,
      albums: JSON.parse(row.albums),
      description: row.description,
      styleNotes: row.style_notes,
      tier: row.tier || undefined,
      embedding: row.embedding
    }));
  }

  deleteBand(id: string): void {
    const stmt = this.db.prepare('DELETE FROM bands WHERE id = ?');
    stmt.run(id);
  }

  updateBandGenres(id: string, genres: string[]): void {
    const stmt = this.db.prepare('UPDATE bands SET genre = ? WHERE id = ?');
    stmt.run(JSON.stringify(genres), id);
  }

  // Session operations
  createSession(session: Session): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, genre, comparison_history, preference_weights)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.genre,
      JSON.stringify(session.comparisonHistory),
      JSON.stringify(session.preferenceWeights)
    );
  }

  getSession(id: string): Session | undefined {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      genre: row.genre,
      comparisonHistory: JSON.parse(row.comparison_history),
      preferenceWeights: JSON.parse(row.preference_weights),
      seenBands: [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  updateSession(session: Session): void {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET comparison_history = ?, preference_weights = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(
      JSON.stringify(session.comparisonHistory),
      JSON.stringify(session.preferenceWeights),
      session.id
    );
  }

  deleteSession(id: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(id);
  }

  close(): void {
    this.db.close();
  }
}