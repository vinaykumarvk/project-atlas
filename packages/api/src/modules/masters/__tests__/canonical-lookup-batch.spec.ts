import { CanonicalLookupService, LookupResult } from '../services/canonical-lookup.service';

describe('CanonicalLookupService — batchLookup & LRU cache', () => {
  let service: CanonicalLookupService;
  let mockPrisma: any;

  const mockRecords = [
    {
      city: 'Mumbai',
      canonical_form: 'Mumbai',
      source_forms: ['Bombay', 'mumbai'],
      is_deleted: false,
    },
    {
      city: 'Pune',
      canonical_form: 'Pune',
      source_forms: ['Poona', 'pune'],
      is_deleted: false,
    },
    {
      city: 'Delhi',
      canonical_form: 'Delhi',
      source_forms: ['New Delhi', 'delhi'],
      is_deleted: false,
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      propertyLocationMaster: {
        findMany: jest.fn().mockResolvedValue(mockRecords),
      },
    };
    service = new CanonicalLookupService(mockPrisma);
  });

  it('should perform batch lookup for multiple values', async () => {
    const results = await service.batchLookup('PropertyLocationMaster', [
      'Mumbai',
      'Pune',
      'UnknownCity',
    ]);

    expect(results).toBeInstanceOf(Map);
    expect(results.size).toBe(3);

    const mumbai = results.get('Mumbai');
    expect(mumbai).toBeDefined();
    expect(mumbai!.matchType).toBe('EXACT');
    expect(mumbai!.canonicalForm).toBe('Mumbai');

    const pune = results.get('Pune');
    expect(pune).toBeDefined();
    expect(pune!.matchType).toBe('EXACT');

    const unknown = results.get('UnknownCity');
    expect(unknown).toBeDefined();
    expect(unknown!.matchType).toBe('NO_MATCH');
  });

  it('should return empty map for empty input array', async () => {
    const results = await service.batchLookup('PropertyLocationMaster', []);
    expect(results.size).toBe(0);
  });

  it('should cache lookup results (LRU cache)', async () => {
    // First call: hits Prisma
    await service.lookup('PropertyLocationMaster', 'Mumbai');
    expect(mockPrisma.propertyLocationMaster.findMany).toHaveBeenCalledTimes(1);

    // Second call: should use cache (no additional Prisma call)
    const result = await service.lookup('PropertyLocationMaster', 'Mumbai');
    expect(result.matchType).toBe('EXACT');
    expect(mockPrisma.propertyLocationMaster.findMany).toHaveBeenCalledTimes(1);
  });

  it('should report correct cache size', async () => {
    expect(service.getCacheSize()).toBe(0);

    await service.lookup('PropertyLocationMaster', 'Mumbai');
    expect(service.getCacheSize()).toBe(1);

    await service.lookup('PropertyLocationMaster', 'Pune');
    expect(service.getCacheSize()).toBe(2);

    // Same lookup should not increase size
    await service.lookup('PropertyLocationMaster', 'Mumbai');
    expect(service.getCacheSize()).toBe(2);
  });

  it('should clear cache', async () => {
    await service.lookup('PropertyLocationMaster', 'Mumbai');
    expect(service.getCacheSize()).toBe(1);

    service.clearCache();
    expect(service.getCacheSize()).toBe(0);

    // After clearing, should hit Prisma again
    await service.lookup('PropertyLocationMaster', 'Mumbai');
    expect(mockPrisma.propertyLocationMaster.findMany).toHaveBeenCalledTimes(2);
  });

  it('should return NO_MATCH for unsupported master table in batch', async () => {
    const results = await service.batchLookup('UnknownTable', ['foo', 'bar']);
    expect(results.size).toBe(2);
    expect(results.get('foo')!.matchType).toBe('NO_MATCH');
    expect(results.get('bar')!.matchType).toBe('NO_MATCH');
  });

  it('should resolve source forms in batch lookup', async () => {
    const results = await service.batchLookup('PropertyLocationMaster', [
      'Bombay',
      'Poona',
    ]);

    const bombay = results.get('Bombay');
    expect(bombay!.matchType).toBe('SOURCE_FORM');
    expect(bombay!.canonicalForm).toBe('Mumbai');

    const poona = results.get('Poona');
    expect(poona!.matchType).toBe('SOURCE_FORM');
    expect(poona!.canonicalForm).toBe('Pune');
  });
});
