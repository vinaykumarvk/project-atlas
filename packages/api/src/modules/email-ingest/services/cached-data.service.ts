import { Injectable, Logger } from '@nestjs/common';

export interface CachedEntry<T> {
  key: string;
  data: T;
  cachedAt: Date;
  ttlMs: number;
  source: string;
}

@Injectable()
export class CachedDataService {
  private readonly logger = new Logger(CachedDataService.name);
  private readonly cache = new Map<string, CachedEntry<unknown>>();
  private readonly DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Get from cache if available and not expired.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.cachedAt.getTime() > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Store in cache.
   */
  set<T>(key: string, data: T, source: string, ttlMs?: number): void {
    this.cache.set(key, {
      key,
      data,
      cachedAt: new Date(),
      ttlMs: ttlMs || this.DEFAULT_TTL_MS,
      source,
    });
  }

  /**
   * Get data with fallback: try fetcher first, serve cache on failure.
   */
  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, source: string, ttlMs?: number): Promise<{ data: T; fromCache: boolean }> {
    try {
      const fresh = await fetcher();
      this.set(key, fresh, source, ttlMs);
      return { data: fresh, fromCache: false };
    } catch (error) {
      this.logger.warn(`Fetch failed for ${key}, trying cache: ${(error as Error).message}`);
      const cached = this.get<T>(key);
      if (cached !== null) {
        this.logger.log(`Serving ${key} from cache (source: ${source})`);
        return { data: cached, fromCache: true };
      }
      throw error; // No cache available
    }
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries.
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.cachedAt.getTime() > entry.ttlMs) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  getSize(): number {
    return this.cache.size;
  }
}
