import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt?: number;
}

export class CacheManager {
  private cacheDir: string;
  private defaultTTL: number;

  constructor(cacheDir: string, defaultTTL: number = 7 * 24 * 60 * 60 * 1000) {
    this.cacheDir = cacheDir;
    this.defaultTTL = defaultTTL;
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private generateCacheKey(prefix: string, params: Record<string, any>): string {
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex');
    return `${prefix}_${hash}`;
  }

  private getCacheFilePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  get<T>(prefix: string, params: Record<string, any>): T | null {
    const key = this.generateCacheKey(prefix, params);
    const filePath = this.getCacheFilePath(key);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(content);

      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.delete(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error(`Error reading cache for key ${key}:`, error);
      return null;
    }
  }

  set<T>(prefix: string, params: Record<string, any>, data: T, ttl?: number): void {
    const key = this.generateCacheKey(prefix, params);
    const filePath = this.getCacheFilePath(key);

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : Date.now() + this.defaultTTL,
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Error writing cache for key ${key}:`, error);
    }
  }

  delete(prefix: string, params?: Record<string, any>): void {
    if (params) {
      const key = this.generateCacheKey(prefix, params);
      const filePath = this.getCacheFilePath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } else {
      this.clearPrefix(prefix);
    }
  }

  clearPrefix(prefix: string): void {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }

    const files = fs.readdirSync(this.cacheDir);
    files.forEach(file => {
      if (file.startsWith(prefix) && file.endsWith('.json')) {
        const filePath = path.join(this.cacheDir, file);
        fs.unlinkSync(filePath);
      }
    });
  }

  clear(): void {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }

    const files = fs.readdirSync(this.cacheDir);
    files.forEach(file => {
      const filePath = path.join(this.cacheDir, file);
      fs.unlinkSync(filePath);
    });
  }

  getStats(): { count: number; totalSize: number } {
    if (!fs.existsSync(this.cacheDir)) {
      return { count: 0, totalSize: 0 };
    }

    const files = fs.readdirSync(this.cacheDir);
    let count = 0;
    let totalSize = 0;

    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        count++;
        totalSize += stats.size;
      }
    });

    return { count, totalSize };
  }

  cleanExpired(): void {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }

    const files = fs.readdirSync(this.cacheDir);
    const now = Date.now();

    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const entry: CacheEntry<any> = JSON.parse(content);

          if (entry.expiresAt && now > entry.expiresAt) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          console.error(`Error cleaning expired cache file ${file}:`, error);
        }
      }
    });
  }
}