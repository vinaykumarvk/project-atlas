import { CachedDataService } from '../services/cached-data.service';

describe('CachedDataService', () => {
  let service: CachedDataService;

  beforeEach(() => {
    service = new CachedDataService();
  });

  afterEach(() => {
    service.clear();
  });

  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      service.set('key1', { name: 'test' }, 'gmail');
      const result = service.get<{ name: string }>('key1');
      expect(result).toEqual({ name: 'test' });
    });

    it('should return null for non-existent keys', () => {
      const result = service.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should store different data types', () => {
      service.set('string', 'hello', 'test');
      service.set('number', 42, 'test');
      service.set('array', [1, 2, 3], 'test');
      service.set('object', { a: 1, b: 'two' }, 'test');

      expect(service.get<string>('string')).toBe('hello');
      expect(service.get<number>('number')).toBe(42);
      expect(service.get<number[]>('array')).toEqual([1, 2, 3]);
      expect(service.get<Record<string, unknown>>('object')).toEqual({ a: 1, b: 'two' });
    });

    it('should overwrite existing entries', () => {
      service.set('key1', 'old', 'test');
      service.set('key1', 'new', 'test');
      expect(service.get<string>('key1')).toBe('new');
    });

    it('should return null for expired entries', () => {
      // Set with a very short TTL
      service.set('expiring', 'value', 'test', 1); // 1ms TTL

      // Wait for expiry
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy wait 5ms
      }

      expect(service.get('expiring')).toBeNull();
    });
  });

  describe('getOrFetch', () => {
    it('should call fetcher and cache the result on success', async () => {
      const fetcher = jest.fn().mockResolvedValue({ data: 'fresh' });
      const result = await service.getOrFetch('key1', fetcher, 'gmail');

      expect(result.data).toEqual({ data: 'fresh' });
      expect(result.fromCache).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Should be in cache now
      expect(service.get('key1')).toEqual({ data: 'fresh' });
    });

    it('should serve from cache when fetcher fails', async () => {
      // First, populate the cache
      service.set('key1', { data: 'cached' }, 'gmail');

      const fetcher = jest.fn().mockRejectedValue(new Error('Provider offline'));
      const result = await service.getOrFetch('key1', fetcher, 'gmail');

      expect(result.data).toEqual({ data: 'cached' });
      expect(result.fromCache).toBe(true);
    });

    it('should throw when fetcher fails and no cache exists', async () => {
      const fetcher = jest.fn().mockRejectedValue(new Error('Provider offline'));

      await expect(service.getOrFetch('uncached', fetcher, 'gmail')).rejects.toThrow('Provider offline');
    });

    it('should update cache on successful fetch', async () => {
      service.set('key1', { data: 'old' }, 'gmail');

      const fetcher = jest.fn().mockResolvedValue({ data: 'updated' });
      const result = await service.getOrFetch('key1', fetcher, 'gmail');

      expect(result.data).toEqual({ data: 'updated' });
      expect(result.fromCache).toBe(false);
      expect(service.get('key1')).toEqual({ data: 'updated' });
    });

    it('should respect custom TTL', async () => {
      const fetcher = jest.fn().mockResolvedValue('value');
      await service.getOrFetch('key1', fetcher, 'test', 5000); // 5s TTL

      expect(service.get('key1')).toBe('value');
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      service.set('key1', 'v1', 'test');
      service.set('key2', 'v2', 'test');
      expect(service.getSize()).toBe(2);

      service.clear();
      expect(service.getSize()).toBe(0);
      expect(service.get('key1')).toBeNull();
      expect(service.get('key2')).toBeNull();
    });
  });

  describe('prune', () => {
    it('should remove expired entries', () => {
      // Add entries with very short TTLs
      service.set('expiring1', 'v1', 'test', 1);
      service.set('expiring2', 'v2', 'test', 1);
      service.set('alive', 'v3', 'test', 60000);

      // Wait for short-TTL entries to expire
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy wait 5ms
      }

      const pruned = service.prune();

      expect(pruned).toBe(2);
      expect(service.getSize()).toBe(1);
      expect(service.get('alive')).toBe('v3');
    });

    it('should return 0 when nothing to prune', () => {
      service.set('key1', 'v1', 'test', 60000);
      const pruned = service.prune();
      expect(pruned).toBe(0);
    });

    it('should return 0 on empty cache', () => {
      expect(service.prune()).toBe(0);
    });
  });

  describe('getSize', () => {
    it('should return 0 for empty cache', () => {
      expect(service.getSize()).toBe(0);
    });

    it('should return the correct count after adding entries', () => {
      service.set('k1', 'v1', 'test');
      service.set('k2', 'v2', 'test');
      service.set('k3', 'v3', 'test');
      expect(service.getSize()).toBe(3);
    });

    it('should decrease after clearing', () => {
      service.set('k1', 'v1', 'test');
      service.set('k2', 'v2', 'test');
      service.clear();
      expect(service.getSize()).toBe(0);
    });
  });
});
