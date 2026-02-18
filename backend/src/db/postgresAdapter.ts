import { Pool, PoolClient } from 'pg';
import { IDatabase } from './types';
import { Band, Session } from '../types';

export class PostgresAdapter implements IDatabase {
  private pool: Pool;
  private connected: boolean = false;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create tables if not exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS bands (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          genre TEXT NOT NULL,
          era TEXT NOT NULL,
          albums TEXT NOT NULL,
          description TEXT NOT NULL,
          style_notes TEXT,
          tier TEXT NOT NULL DEFAULT 'niche',
          embedding BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
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
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_bands_genre ON bands(genre);
        CREATE INDEX IF NOT EXISTS idx_bands_tier ON bands(tier);
        CREATE INDEX IF NOT EXISTS idx_sessions_genre ON sessions(genre);
      `);

      this.connected = true;
    } finally {
      client.release();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Band operations
  async createBand(band: Band): Promise<void> {
    await this.pool.query(`
      INSERT INTO bands (id, name, genre, era, albums, description, style_notes, tier, embedding)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        genre = EXCLUDED.genre,
        era = EXCLUDED.era,
        albums = EXCLUDED.albums,
        description = EXCLUDED.description,
        style_notes = EXCLUDED.style_notes,
        tier = EXCLUDED.tier,
        embedding = EXCLUDED.embedding
    `, [
      band.id,
      band.name,
      JSON.stringify(band.genre),
      band.era,
      JSON.stringify(band.albums),
      band.description,
      band.styleNotes || null,
      band.tier || 'niche',
      band.embedding || null
    ]);
  }

  async getBand(id: string): Promise<Band | undefined> {
    const result = await this.pool.query('SELECT * FROM bands WHERE id = $1', [id]);
    if (result.rows.length === 0) return undefined;
    return this.rowToBand(result.rows[0]);
  }

  async getBandsByGenre(genre: string): Promise<Band[]> {
    const result = await this.pool.query(
      'SELECT * FROM bands WHERE genre ILIKE $1',
      [`%${genre}%`]
    );
    return result.rows.map(row => this.rowToBand(row));
  }

  async getAllBands(): Promise<Band[]> {
    const result = await this.pool.query('SELECT * FROM bands');
    return result.rows.map(row => this.rowToBand(row));
  }

  async getBandsByTier(genre: string, tier: string): Promise<Band[]> {
    const result = await this.pool.query(
      'SELECT * FROM bands WHERE genre ILIKE $1 AND tier = $2',
      [`%${genre}%`, tier]
    );
    return result.rows.map(row => this.rowToBand(row));
  }

  async deleteBand(id: string): Promise<void> {
    await this.pool.query('DELETE FROM bands WHERE id = $1', [id]);
  }

  async updateBandGenres(id: string, genres: string[]): Promise<void> {
    await this.pool.query(
      'UPDATE bands SET genre = $1 WHERE id = $2',
      [JSON.stringify(genres), id]
    );
  }

  async updateBand(band: Band): Promise<void> {
    await this.pool.query(`
      UPDATE bands SET
        name = $1,
        genre = $2,
        era = $3,
        albums = $4,
        description = $5,
        style_notes = $6,
        tier = $7,
        embedding = $8
      WHERE id = $9
    `, [
      band.name,
      JSON.stringify(band.genre),
      band.era,
      JSON.stringify(band.albums),
      band.description,
      band.styleNotes || null,
      band.tier || 'niche',
      band.embedding || null,
      band.id
    ]);
  }

  async updateBandDescription(id: string, description: string): Promise<void> {
    await this.pool.query(
      'UPDATE bands SET description = $1 WHERE id = $2',
      [description, id]
    );
  }

  // Session operations
  async createSession(session: Session): Promise<void> {
    await this.pool.query(`
      INSERT INTO sessions (id, genre, comparison_history, preference_weights)
      VALUES ($1, $2, $3, $4)
    `, [
      session.id,
      session.genre,
      JSON.stringify(session.comparisonHistory),
      JSON.stringify(session.preferenceWeights)
    ]);
  }

  async getSession(id: string): Promise<Session | undefined> {
    const result = await this.pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
    if (result.rows.length === 0) return undefined;
    return this.rowToSession(result.rows[0]);
  }

  async updateSession(session: Session): Promise<void> {
    await this.pool.query(`
      UPDATE sessions
      SET comparison_history = $1, preference_weights = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
      JSON.stringify(session.comparisonHistory),
      JSON.stringify(session.preferenceWeights),
      session.id
    ]);
  }

  async deleteSession(id: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE id = $1', [id]);
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.connected = false;
  }

  private rowToBand(row: any): Band {
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

  private rowToSession(row: any): Session {
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
}
