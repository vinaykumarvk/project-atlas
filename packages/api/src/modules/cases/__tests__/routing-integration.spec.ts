import { Test, TestingModule } from '@nestjs/testing';
import { RoutingService, RoutingInput } from '../services/routing.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import {
  CanonicalLookupService,
  LookupResult,
} from '../../masters/services/canonical-lookup.service';
import { FprRecord, RoutingResult, RoutingFailure } from '../types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function buildFpr(overrides: Partial<FprRecord> = {}): FprRecord {
  return {
    id: 'fpr-default',
    name: 'Default FPR',
    email: 'default@bank.com',
    skills: ['valuation'],
    propertyZones: ['Mumbai'],
    caseTypes: ['VALUATION_REQUEST'],
    capacityPerDay: 10,
    openCaseCount: 3,
    isOoo: false,
    ...overrides,
  };
}

const FPR_MUMBAI_1 = buildFpr({
  id: 'fpr-mumbai-1',
  name: 'Amit Sharma',
  skills: ['valuation', 'legal'],
  propertyZones: ['Mumbai', 'Pune'],
  caseTypes: ['VALUATION_REQUEST', 'LEGAL_OPINION'],
  capacityPerDay: 10,
  openCaseCount: 3,
});

const FPR_MUMBAI_2 = buildFpr({
  id: 'fpr-mumbai-2',
  name: 'Priya Patel',
  skills: ['valuation', 'insurance'],
  propertyZones: ['Mumbai', 'Nashik'],
  caseTypes: ['VALUATION_REQUEST', 'INSURANCE_RENEWAL'],
  capacityPerDay: 8,
  openCaseCount: 7,
});

const FPR_OOO = buildFpr({
  id: 'fpr-ooo',
  name: 'Suresh Reddy',
  skills: ['valuation'],
  propertyZones: ['Mumbai'],
  caseTypes: ['VALUATION_REQUEST'],
  capacityPerDay: 6,
  openCaseCount: 2,
  isOoo: true,
  delegateId: 'fpr-mumbai-1',
  supervisorId: 'fpr-supervisor',
});

const FPR_SUPERVISOR = buildFpr({
  id: 'fpr-supervisor',
  name: 'Meena Desai',
  skills: ['valuation', 'legal', 'insurance'],
  propertyZones: ['Mumbai', 'Pune', 'Nashik'],
  caseTypes: ['VALUATION_REQUEST', 'LEGAL_OPINION', 'INSURANCE_RENEWAL'],
  capacityPerDay: 5,
  openCaseCount: 4,
});

const FPR_LEAST_LOADED = buildFpr({
  id: 'fpr-least-loaded',
  name: 'Ravi Kumar',
  skills: ['valuation'],
  propertyZones: ['Mumbai'],
  caseTypes: ['VALUATION_REQUEST'],
  capacityPerDay: 10,
  openCaseCount: 1,
});

const ALL_FPRS = [FPR_MUMBAI_1, FPR_MUMBAI_2, FPR_OOO, FPR_SUPERVISOR, FPR_LEAST_LOADED];

// ---------------------------------------------------------------------------
// Mock CanonicalLookupService
// ---------------------------------------------------------------------------

function createMockCanonicalLookup(): {
  service: CanonicalLookupService;
  lookupMock: jest.Mock;
} {
  const lookupMock = jest.fn<Promise<LookupResult>, [string, string]>();

  // Default: case type lookup returns EXACT match
  lookupMock.mockImplementation(async (masterTable: string, rawValue: string) => {
    if (masterTable === 'CaseTypeMaster') {
      if (rawValue === 'VALUATION_REQUEST') {
        return {
          canonicalForm: 'VALUATION_REQUEST',
          confidence: 1.0,
          matchType: 'EXACT' as const,
          matchedRecord: {
            code: 'VALUATION_REQUEST',
            required_skills: ['valuation'],
            effective_from: new Date('2020-01-01'),
            effective_to: null,
          },
        };
      }
      if (rawValue === 'LEGAL_OPINION') {
        return {
          canonicalForm: 'LEGAL_OPINION',
          confidence: 1.0,
          matchType: 'EXACT' as const,
          matchedRecord: {
            code: 'LEGAL_OPINION',
            required_skills: ['legal'],
            effective_from: new Date('2020-01-01'),
            effective_to: null,
          },
        };
      }
      if (rawValue === 'UNKNOWN_TYPE') {
        return {
          canonicalForm: null,
          confidence: 0,
          matchType: 'NO_MATCH' as const,
        };
      }
    }

    if (masterTable === 'PropertyLocationMaster') {
      if (rawValue === 'Mumbai' || rawValue === 'mumbai') {
        return {
          canonicalForm: 'Mumbai',
          confidence: 1.0,
          matchType: 'EXACT' as const,
          matchedRecord: { city: 'Mumbai', zone: 'West', region: 'Maharashtra' },
        };
      }
      if (rawValue === 'Mumbaai') {
        return {
          canonicalForm: 'Mumbai',
          confidence: 0.8,
          matchType: 'FUZZY' as const,
          matchedRecord: { city: 'Mumbai', zone: 'West', region: 'Maharashtra' },
        };
      }
    }

    return { canonicalForm: null, confidence: 0, matchType: 'NO_MATCH' as const };
  });

  const service = {
    lookup: lookupMock,
  } as unknown as CanonicalLookupService;

  return { service, lookupMock };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('RoutingService Integration Tests (Phase 2)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let routingService: RoutingService;
  let lookupMock: jest.Mock;

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();
    const { service: mockLookup, lookupMock: lm } = createMockCanonicalLookup();
    lookupMock = lm;

    // Mock PIN lookup — propertyLocationMaster.findFirst
    mockPrisma.propertyLocationMaster.findFirst.mockImplementation(
      ({ where }: { where: { pin_from: { lte: string }; pin_to: { gte: string } } }) => {
        const pin = where.pin_to.gte;
        if (pin === '400001') {
          return Promise.resolve({
            city: 'Mumbai',
            zone: 'West',
            region: 'Maharashtra',
          });
        }
        return Promise.resolve(null);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CanonicalLookupService, useValue: mockLookup },
      ],
    }).compile();

    routingService = module.get(RoutingService);
    routingService.setFprs(ALL_FPRS);
  });

  // -----------------------------------------------------------------------
  // Test 1: Exact PIN match routes correctly
  // -----------------------------------------------------------------------
  describe('Exact PIN match routes correctly', () => {
    it('should resolve location by PIN and route to the correct FPR', async () => {
      const input: RoutingInput = {
        caseType: 'VALUATION_REQUEST',
        propertyPin: '400001',
      };

      const result = await routingService.routeWithLookup(input);

      // Should be a successful routing result (not a failure)
      expect(result).toBeDefined();
      expect('fprId' in result).toBe(true);

      const success = result as RoutingResult;
      // Should route to the least loaded FPR in Mumbai
      expect(success.fprId).toBe('fpr-least-loaded');
      expect(success.matchedTier).toBe('PIN');
      expect(success.resolvedKeys?.propertyCity).toBe('Mumbai');
    });
  });

  // -----------------------------------------------------------------------
  // Test 2: City fallback when PIN has no match
  // -----------------------------------------------------------------------
  describe('City fallback when PIN has no match', () => {
    it('should fall back to city-based routing when PIN is not found', async () => {
      const input: RoutingInput = {
        caseType: 'VALUATION_REQUEST',
        propertyPin: '999999', // Unknown PIN
        propertyCity: 'Mumbai',
      };

      const result = await routingService.routeWithLookup(input);

      expect(result).toBeDefined();
      expect('fprId' in result).toBe(true);

      const success = result as RoutingResult;
      expect(success.fprId).toBe('fpr-least-loaded');
      expect(success.matchedTier).toBe('CITY');
      expect(success.lookupMatchTypes?.['propertyPin']).toBe('NO_MATCH');
    });

    it('should use canonical lookup for city name resolution', async () => {
      const input: RoutingInput = {
        caseType: 'VALUATION_REQUEST',
        propertyCity: 'Mumbaai', // Fuzzy spelling
      };

      const result = await routingService.routeWithLookup(input);

      expect(result).toBeDefined();
      expect('fprId' in result).toBe(true);

      const success = result as RoutingResult;
      expect(success.resolvedKeys?.propertyCity).toBe('Mumbai');
      expect(success.lookupMatchTypes?.['propertyCity']).toBe('FUZZY');
    });
  });

  // -----------------------------------------------------------------------
  // Test 3: OOO delegate routing
  // -----------------------------------------------------------------------
  describe('OOO delegate routing', () => {
    it('should route to the delegate when primary FPR is OOO', async () => {
      // Set up FPRs so only the OOO FPR directly covers Thane.
      // The delegate (fpr-mumbai-1) does NOT cover Thane in propertyZones,
      // but is reachable via the OOO fallback chain.
      routingService.setFprs([
        {
          ...FPR_OOO,
          propertyZones: ['Thane'],
          caseTypes: ['VALUATION_REQUEST'],
          delegateId: 'fpr-mumbai-1',
        },
        {
          ...FPR_MUMBAI_1,
          propertyZones: ['Mumbai'], // Does NOT cover Thane
          caseTypes: ['VALUATION_REQUEST', 'LEGAL_OPINION'],
        },
        FPR_SUPERVISOR,
      ]);

      const input: RoutingInput = {
        caseType: 'VALUATION_REQUEST',
        propertyCity: 'Thane',
      };

      // Mock the city lookup for Thane
      lookupMock.mockImplementation(async (masterTable: string, rawValue: string) => {
        if (masterTable === 'CaseTypeMaster' && rawValue === 'VALUATION_REQUEST') {
          return {
            canonicalForm: 'VALUATION_REQUEST',
            confidence: 1.0,
            matchType: 'EXACT' as const,
            matchedRecord: {
              required_skills: ['valuation'],
              effective_from: new Date('2020-01-01'),
              effective_to: null,
            },
          };
        }
        if (masterTable === 'PropertyLocationMaster' && rawValue === 'Thane') {
          return {
            canonicalForm: 'Thane',
            confidence: 1.0,
            matchType: 'EXACT' as const,
            matchedRecord: { city: 'Thane', zone: 'West', region: 'Maharashtra' },
          };
        }
        return { canonicalForm: null, confidence: 0, matchType: 'NO_MATCH' as const };
      });

      const result = await routingService.routeWithLookup(input);

      expect(result).toBeDefined();
      expect('fprId' in result).toBe(true);

      const success = result as RoutingResult;
      // The OOO FPR's delegate is fpr-mumbai-1 (reachable via fallback, not direct zone match)
      expect(success.fprId).toBe('fpr-mumbai-1');
      expect(success.reason).toContain('OOO fallback');
      expect(success.reason).toContain('delegate');
    });
  });

  // -----------------------------------------------------------------------
  // Test 4: Skill mismatch falls to manual queue
  // -----------------------------------------------------------------------
  describe('Skill mismatch falls to manual queue', () => {
    it('should return a routing failure when no FPR has the required skills', async () => {
      const input: RoutingInput = {
        caseType: 'VALUATION_REQUEST',
        propertyCity: 'Mumbai',
        requiredSkills: ['nuclear_physics'], // No FPR has this skill
      };

      const result = await routingService.routeWithLookup(input);

      expect(result).toBeDefined();
      expect('success' in result).toBe(true);

      const failure = result as RoutingFailure;
      expect(failure.success).toBe(false);
      expect(failure.reason).toContain('manual triage');
      expect(failure.failedTier).toBe('ALL_TIERS');
    });

    it('should route correctly when required skills match', async () => {
      const input: RoutingInput = {
        caseType: 'LEGAL_OPINION',
        propertyCity: 'Mumbai',
        requiredSkills: ['legal'],
      };

      const result = await routingService.routeWithLookup(input);

      expect(result).toBeDefined();
      expect('fprId' in result).toBe(true);

      const success = result as RoutingResult;
      // Only FPR_MUMBAI_1 and FPR_SUPERVISOR have legal skill + Mumbai + LEGAL_OPINION
      expect(['fpr-mumbai-1', 'fpr-supervisor']).toContain(success.fprId);
    });
  });

  // -----------------------------------------------------------------------
  // Test 5: Capacity tie-break selects least-loaded FPR
  // -----------------------------------------------------------------------
  describe('Capacity tie-break selects least-loaded FPR', () => {
    it('should select the FPR with the lowest workload ratio', async () => {
      // All FPRs in Mumbai with valuation skill, different loads
      routingService.setFprs([
        buildFpr({
          id: 'fpr-heavy',
          name: 'Heavy Loaded',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          capacityPerDay: 10,
          openCaseCount: 9, // ratio 0.9
        }),
        buildFpr({
          id: 'fpr-medium',
          name: 'Medium Loaded',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          capacityPerDay: 10,
          openCaseCount: 5, // ratio 0.5
        }),
        buildFpr({
          id: 'fpr-light',
          name: 'Light Loaded',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          capacityPerDay: 10,
          openCaseCount: 1, // ratio 0.1
        }),
      ]);

      const input: RoutingInput = {
        caseType: 'VALUATION_REQUEST',
        propertyCity: 'Mumbai',
      };

      const result = await routingService.routeWithLookup(input);

      expect(result).toBeDefined();
      expect('fprId' in result).toBe(true);

      const success = result as RoutingResult;
      expect(success.fprId).toBe('fpr-light');
      expect(success.workloadRatio).toBeCloseTo(0.1);
    });

    it('should prefer lower ratio even when capacity differs', async () => {
      routingService.setFprs([
        buildFpr({
          id: 'fpr-high-cap',
          name: 'High Capacity',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          capacityPerDay: 20,
          openCaseCount: 10, // ratio 0.5
        }),
        buildFpr({
          id: 'fpr-low-cap',
          name: 'Low Capacity',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          capacityPerDay: 5,
          openCaseCount: 1, // ratio 0.2
        }),
      ]);

      const input: RoutingInput = {
        caseType: 'VALUATION_REQUEST',
        propertyCity: 'Mumbai',
      };

      const result = await routingService.routeWithLookup(input);

      expect(result).toBeDefined();
      expect('fprId' in result).toBe(true);

      const success = result as RoutingResult;
      expect(success.fprId).toBe('fpr-low-cap');
      expect(success.workloadRatio).toBeCloseTo(0.2);
    });
  });

  // -----------------------------------------------------------------------
  // Test 6: FR-031.A2 — OOO delegate workload-balanced tiebreaker
  // -----------------------------------------------------------------------
  describe('OOO delegate workload-balanced tiebreaker (FR-031.A2)', () => {
    it('should select delegate with lowest workload when primary agent is OOO', () => {
      routingService.setFprs([
        buildFpr({
          id: 'fpr-ooo-primary',
          name: 'OOO Primary',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          isOoo: true,
          delegateId: 'delegate-a',
        }),
        buildFpr({
          id: 'delegate-a',
          name: 'Delegate A',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          capacityPerDay: 10,
          openCaseCount: 1,
          isOoo: false,
        }),
        buildFpr({
          id: 'delegate-b',
          name: 'Delegate B',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          capacityPerDay: 10,
          openCaseCount: 5,
          isOoo: false,
        }),
      ]);

      // With OOO primary excluded, delegate-a has lowest workload (1 vs 5)
      const result = routingService.route('VALUATION_REQUEST', 'Mumbai');
      expect(result).not.toBeNull();
      // delegate-a selected due to lowest workload among available agents
      expect(result!.fprId).toBe('delegate-a');
    });

    it('should use workload tiebreaker when multiple OOO agents delegate to different agents', () => {
      routingService.setFprs([
        buildFpr({
          id: 'fpr-ooo-1',
          name: 'OOO Agent 1',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          isOoo: true,
          delegateId: 'delegate-x',
        }),
        buildFpr({
          id: 'fpr-ooo-2',
          name: 'OOO Agent 2',
          propertyZones: ['Mumbai'],
          caseTypes: ['VALUATION_REQUEST'],
          isOoo: true,
          delegateId: 'delegate-y',
        }),
        buildFpr({
          id: 'delegate-x',
          name: 'Delegate X',
          propertyZones: ['Delhi'],
          caseTypes: ['VALUATION_REQUEST'],
          capacityPerDay: 10,
          openCaseCount: 3,
          isOoo: false,
        }),
        buildFpr({
          id: 'delegate-y',
          name: 'Delegate Y',
          propertyZones: ['Delhi'],
          caseTypes: ['VALUATION_REQUEST'],
          capacityPerDay: 10,
          openCaseCount: 3,
          isOoo: false,
        }),
      ]);

      const result = routingService.route('VALUATION_REQUEST', 'Mumbai');
      expect(result).not.toBeNull();
      // When workloads are equal, first registered delegate wins (sorted stable)
      expect(['delegate-x', 'delegate-y']).toContain(result!.fprId);
    });
  });

  // -----------------------------------------------------------------------
  // Legacy sync route method (backward compatibility)
  // -----------------------------------------------------------------------
  describe('Legacy synchronous route method', () => {
    it('should still work for simple case type + zone routing', () => {
      routingService.setFprs(ALL_FPRS);
      const result = routingService.route('VALUATION_REQUEST', 'Mumbai');

      expect(result).not.toBeNull();
      expect(result!.fprId).toBe('fpr-least-loaded');
      expect(result!.reason).toContain('workload');
    });

    it('should return null for unmatched zone', () => {
      const result = routingService.route('VALUATION_REQUEST', 'UnknownCity');
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Routing failure reasons
  // -----------------------------------------------------------------------
  describe('Routing failure provides explicit reason', () => {
    it('should return failure with reason when case type is unknown', async () => {
      const input: RoutingInput = {
        caseType: 'UNKNOWN_TYPE',
        propertyCity: 'Mumbai',
      };

      const result = await routingService.routeWithLookup(input);

      expect(result).toBeDefined();
      expect('success' in result).toBe(true);

      const failure = result as RoutingFailure;
      expect(failure.success).toBe(false);
      expect(failure.failedTier).toBe('CASE_TYPE');
      expect(failure.reason).toContain('not found in CaseTypeMaster');
    });

    it('should return failure when no location data is provided', async () => {
      const input: RoutingInput = {
        caseType: 'VALUATION_REQUEST',
        // No PIN, city, zone, or region
      };

      const result = await routingService.routeWithLookup(input);

      expect(result).toBeDefined();
      expect('success' in result).toBe(true);

      const failure = result as RoutingFailure;
      expect(failure.success).toBe(false);
      expect(failure.reason).toContain('No property location information');
    });
  });
});
