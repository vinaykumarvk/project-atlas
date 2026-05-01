import { Test, TestingModule } from '@nestjs/testing';
import {
  CanonicalLookupService,
  levenshteinDistance,
} from '../services/canonical-lookup.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('CanonicalLookupService', () => {
  let service: CanonicalLookupService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  const sampleCaseTypes = [
    {
      id: 'ct-1',
      code: 'VALUATION',
      display_name: 'Valuation Request',
      canonical_form: 'Valuation',
      source_forms: ['Property Valuation', 'Val Request', 'VALUATION REQ'],
      is_deleted: false,
    },
    {
      id: 'ct-2',
      code: 'LEGAL_OPINION',
      display_name: 'Legal Opinion',
      canonical_form: 'Legal Opinion',
      source_forms: ['Legal Op', 'legal opinion request'],
      is_deleted: false,
    },
    {
      id: 'ct-3',
      code: 'TITLE_SEARCH',
      display_name: 'Title Search',
      canonical_form: 'Title Search',
      source_forms: ['TSR', 'Title Search Report'],
      is_deleted: false,
    },
  ];

  const sampleVendors = [
    {
      id: 'v-1',
      vendor_code: 'VND-001',
      vendor_name: 'Acme Valuers',
      canonical_form: 'Acme Valuers Pvt Ltd',
      source_forms: ['Acme', 'ACME VALUERS', 'Acme Val'],
      is_deleted: false,
    },
    {
      id: 'v-2',
      vendor_code: 'VND-002',
      vendor_name: 'Best Legal Services',
      canonical_form: 'Best Legal Services LLP',
      source_forms: ['BLS', 'Best Legal'],
      is_deleted: false,
    },
  ];

  const sampleLocations = [
    {
      id: 'loc-1',
      city: 'Mumbai',
      state: 'Maharashtra',
      pin_from: '400001',
      pin_to: '400099',
      canonical_form: 'Mumbai',
      source_forms: ['Bombay', 'MUMBAI', 'mumbai city'],
      is_deleted: false,
    },
    {
      id: 'loc-2',
      city: 'Bengaluru',
      state: 'Karnataka',
      pin_from: '560001',
      pin_to: '560099',
      canonical_form: 'Bengaluru',
      source_forms: ['Bangalore', 'BENGALURU', 'Blr'],
      is_deleted: false,
    },
  ];

  const sampleFprs = [
    {
      id: 'fpr-1',
      employee_code: 'EMP-101',
      full_name: 'Rahul Sharma',
      canonical_form: 'Rahul Sharma',
      source_forms: ['R Sharma', 'Rahul S'],
      is_deleted: false,
    },
  ];

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    mockPrisma.caseTypeMaster.findMany.mockResolvedValue(sampleCaseTypes);
    mockPrisma.vendorMaster.findMany.mockResolvedValue(sampleVendors);
    mockPrisma.propertyLocationMaster.findMany.mockResolvedValue(sampleLocations);
    mockPrisma.fprMaster.findMany.mockResolvedValue(sampleFprs);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CanonicalLookupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(CanonicalLookupService);
  });

  // ------------------------------------------------------------------
  // Levenshtein distance unit tests
  // ------------------------------------------------------------------
  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('returns length of non-empty string when other is empty', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('abc', '')).toBe(3);
    });

    it('returns 0 for two empty strings', () => {
      expect(levenshteinDistance('', '')).toBe(0);
    });

    it('computes single-character edits correctly', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1); // substitution
      expect(levenshteinDistance('cat', 'cats')).toBe(1); // insertion
      expect(levenshteinDistance('cats', 'cat')).toBe(1); // deletion
    });

    it('computes multi-character edits correctly', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('sunday', 'saturday')).toBe(3);
    });
  });

  // ------------------------------------------------------------------
  // EXACT match tests
  // ------------------------------------------------------------------
  describe('EXACT match', () => {
    it('matches CaseTypeMaster by code exactly', async () => {
      const result = await service.lookup('CaseTypeMaster', 'VALUATION');

      expect(result.matchType).toBe('EXACT');
      expect(result.confidence).toBe(1.0);
      expect(result.canonicalForm).toBe('Valuation');
      expect(result.matchedRecord).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.matchedRecord as any).id).toBe('ct-1');
    });

    it('matches VendorMaster by vendor_code exactly', async () => {
      const result = await service.lookup('VendorMaster', 'VND-001');

      expect(result.matchType).toBe('EXACT');
      expect(result.confidence).toBe(1.0);
      expect(result.canonicalForm).toBe('Acme Valuers Pvt Ltd');
    });

    it('matches PropertyLocationMaster by city exactly', async () => {
      const result = await service.lookup('PropertyLocationMaster', 'Mumbai');

      expect(result.matchType).toBe('EXACT');
      expect(result.confidence).toBe(1.0);
      expect(result.canonicalForm).toBe('Mumbai');
    });

    it('matches FprMaster by employee_code exactly', async () => {
      const result = await service.lookup('FprMaster', 'EMP-101');

      expect(result.matchType).toBe('EXACT');
      expect(result.confidence).toBe(1.0);
      expect(result.canonicalForm).toBe('Rahul Sharma');
    });

    it('is case-sensitive for exact matches', async () => {
      const result = await service.lookup('CaseTypeMaster', 'valuation');

      // 'valuation' != 'VALUATION', so not EXACT
      expect(result.matchType).not.toBe('EXACT');
    });
  });

  // ------------------------------------------------------------------
  // CANONICAL match tests
  // ------------------------------------------------------------------
  describe('CANONICAL match', () => {
    it('matches when rawValue equals canonical_form', async () => {
      const result = await service.lookup('CaseTypeMaster', 'Valuation');

      // 'Valuation' is the canonical_form of VALUATION record
      expect(result.matchType).toBe('CANONICAL');
      expect(result.confidence).toBe(0.95);
      expect(result.canonicalForm).toBe('Valuation');
    });

    it('matches vendor canonical form', async () => {
      const result = await service.lookup('VendorMaster', 'Best Legal Services LLP');

      expect(result.matchType).toBe('CANONICAL');
      expect(result.confidence).toBe(0.95);
      expect(result.canonicalForm).toBe('Best Legal Services LLP');
    });
  });

  // ------------------------------------------------------------------
  // SOURCE_FORM match tests (case-insensitive)
  // ------------------------------------------------------------------
  describe('SOURCE_FORM match', () => {
    it('matches a source form exactly (case-insensitive)', async () => {
      const result = await service.lookup('CaseTypeMaster', 'property valuation');

      expect(result.matchType).toBe('SOURCE_FORM');
      expect(result.confidence).toBe(0.85);
      expect(result.canonicalForm).toBe('Valuation');
    });

    it('matches source form in different casing', async () => {
      const result = await service.lookup('CaseTypeMaster', 'VALUATION REQ');

      expect(result.matchType).toBe('SOURCE_FORM');
      expect(result.confidence).toBe(0.85);
    });

    it('matches location alias (Bombay -> Mumbai)', async () => {
      const result = await service.lookup('PropertyLocationMaster', 'bombay');

      expect(result.matchType).toBe('SOURCE_FORM');
      expect(result.confidence).toBe(0.85);
      expect(result.canonicalForm).toBe('Mumbai');
    });

    it('matches vendor alias case-insensitively', async () => {
      const result = await service.lookup('VendorMaster', 'acme valuers');

      expect(result.matchType).toBe('SOURCE_FORM');
      expect(result.confidence).toBe(0.85);
      expect(result.canonicalForm).toBe('Acme Valuers Pvt Ltd');
    });

    it('matches FPR source forms', async () => {
      const result = await service.lookup('FprMaster', 'r sharma');

      expect(result.matchType).toBe('SOURCE_FORM');
      expect(result.confidence).toBe(0.85);
      expect(result.canonicalForm).toBe('Rahul Sharma');
    });
  });

  // ------------------------------------------------------------------
  // FUZZY match tests
  // ------------------------------------------------------------------
  describe('FUZZY match', () => {
    it('matches with Levenshtein distance 1 (confidence 0.8)', async () => {
      // 'Valuaton' is 1 edit from 'Valuation' (canonical_form)
      const result = await service.lookup('CaseTypeMaster', 'Valuaton');

      expect(result.matchType).toBe('FUZZY');
      expect(result.confidence).toBe(0.8);
      expect(result.canonicalForm).toBe('Valuation');
    });

    it('matches with Levenshtein distance 2 (confidence 0.6)', async () => {
      // 'Valuton' is 2 edits from 'Valuation'
      const result = await service.lookup('CaseTypeMaster', 'Valuton');

      expect(result.matchType).toBe('FUZZY');
      expect(result.confidence).toBe(0.6);
    });

    it('matches fuzzy against source forms', async () => {
      // 'Bangalor' is 1 edit from 'Bangalore' (source_form of Bengaluru)
      const result = await service.lookup('PropertyLocationMaster', 'Bangalor');

      expect(result.matchType).toBe('FUZZY');
      expect(result.confidence).toBe(0.8);
      expect(result.canonicalForm).toBe('Bengaluru');
    });

    it('matches fuzzy against primary field', async () => {
      // 'VND-01' is 1 edit from 'VND-001' (vendor_code, deletion of a '0')
      const result = await service.lookup('VendorMaster', 'VND-01');

      expect(result.matchType).toBe('FUZZY');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('picks the closest match when multiple fuzzy candidates exist', async () => {
      // 'Valuation' canonical is distance 0 (would be CANONICAL match)
      // 'Valuaton' is distance 1 from 'Valuation'
      // Make sure distance-1 beats distance-2
      const result = await service.lookup('CaseTypeMaster', 'Valuaton');
      expect(result.confidence).toBe(0.8); // distance 1
    });
  });

  // ------------------------------------------------------------------
  // NO_MATCH tests
  // ------------------------------------------------------------------
  describe('NO_MATCH', () => {
    it('returns NO_MATCH for garbage input', async () => {
      const result = await service.lookup('CaseTypeMaster', 'xyzzy_garbage_12345');

      expect(result.matchType).toBe('NO_MATCH');
      expect(result.confidence).toBe(0);
      expect(result.canonicalForm).toBeNull();
      expect(result.matchedRecord).toBeUndefined();
    });

    it('returns NO_MATCH for unsupported master table', async () => {
      const result = await service.lookup('NonExistentMaster', 'anything');

      expect(result.matchType).toBe('NO_MATCH');
      expect(result.confidence).toBe(0);
      expect(result.canonicalForm).toBeNull();
    });

    it('returns NO_MATCH when Levenshtein distance exceeds threshold', async () => {
      // 'XYZ' is far from any known value
      const result = await service.lookup('VendorMaster', 'XXXXXXXXXX');

      expect(result.matchType).toBe('NO_MATCH');
      expect(result.confidence).toBe(0);
    });

    it('returns NO_MATCH for empty raw value against long records', async () => {
      const result = await service.lookup('CaseTypeMaster', '');

      // Empty string is far from any code / canonical form
      expect(result.matchType).toBe('NO_MATCH');
      expect(result.confidence).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Edge cases
  // ------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles records with null canonical_form gracefully', async () => {
      mockPrisma.caseTypeMaster.findMany.mockResolvedValue([
        {
          id: 'ct-no-canonical',
          code: 'SPECIAL',
          display_name: 'Special Type',
          canonical_form: null,
          source_forms: [],
          is_deleted: false,
        },
      ]);

      const result = await service.lookup('CaseTypeMaster', 'SPECIAL');

      expect(result.matchType).toBe('EXACT');
      expect(result.confidence).toBe(1.0);
      // Falls back to primary field when canonical_form is null
      expect(result.canonicalForm).toBe('SPECIAL');
    });

    it('handles records with empty source_forms array', async () => {
      mockPrisma.vendorMaster.findMany.mockResolvedValue([
        {
          id: 'v-empty-sf',
          vendor_code: 'VND-999',
          vendor_name: 'No Aliases Inc',
          canonical_form: 'No Aliases Inc',
          source_forms: [],
          is_deleted: false,
        },
      ]);

      const result = await service.lookup('VendorMaster', 'random');

      expect(result.matchType).toBe('NO_MATCH');
    });

    it('filters correctly using is_deleted flag', async () => {
      // The mock returns records that all have is_deleted: false.
      // The service passes { is_deleted: false } to findMany.
      await service.lookup('CaseTypeMaster', 'VALUATION');

      expect(mockPrisma.caseTypeMaster.findMany).toHaveBeenCalledWith({
        where: { is_deleted: false },
      });
    });
  });
});
