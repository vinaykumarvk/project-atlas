/**
 * Phase 6: BRD Gap Remediation Round 2 — Cases Partial Sweep Tests.
 *
 * Covers:
 *  - FR-031 A2: OOO escalation (both FPR and delegate OOO)
 *  - FR-032 A2: Manual vendor selection option
 *  - FR-034 A3: thread_id propagation on case linking
 *  - FR-032 vendor override
 */

import { RoutingService } from '../services/routing.service';
import { VendorSelectionService, SelectionAlgorithm } from '../services/vendor-selection.service';
import { CaseCreationService } from '../services/case-creation.service';
import { CaseStatus, FprRecord, VendorRecord } from '../types';

// ───────────────────────────────────────────────────────────
// Mocks
// ───────────────────────────────────────────────────────────

const mockPrisma = {
  fprMaster: { findMany: jest.fn().mockResolvedValue([]) },
  vendorMaster: { findMany: jest.fn().mockResolvedValue([]) },
  caseActivityLog: { create: jest.fn().mockResolvedValue({}) },
  case: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  caseLink: {
    create: jest.fn().mockResolvedValue({}),
  },
  $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
    return fn(mockPrisma);
  }),
};

const mockCanonicalLookup = {
  lookup: jest.fn().mockResolvedValue({
    matchType: 'EXACT',
    canonicalForm: 'VALUATION_REQUEST',
    matchedRecord: {},
  }),
};

// ───────────────────────────────────────────────────────────
// FR-031 A2: OOO Escalation
// ───────────────────────────────────────────────────────────

describe('FR-031 A2: OOO Escalation', () => {
  let routingService: RoutingService;

  beforeEach(() => {
    jest.clearAllMocks();
    routingService = new RoutingService(mockPrisma as any, mockCanonicalLookup as any);
  });

  it('should return null when both FPR and delegate are OOO', () => {
    const fprs: FprRecord[] = [
      {
        id: 'fpr-1',
        name: 'Raj Kumar',
        email: 'raj@test.com',
        skills: ['valuation'],
        propertyZones: ['Mumbai'],
        caseTypes: ['VALUATION_REQUEST'],
        capacityPerDay: 10,
        openCaseCount: 5,
        isOoo: true,
        delegateId: 'fpr-2',
      },
      {
        id: 'fpr-2',
        name: 'Priya Singh',
        email: 'priya@test.com',
        skills: ['valuation'],
        propertyZones: ['Mumbai'],
        caseTypes: ['VALUATION_REQUEST'],
        capacityPerDay: 10,
        openCaseCount: 3,
        isOoo: true, // delegate is also OOO
      },
    ];

    routingService.setFprs(fprs);
    const result = routingService.route('VALUATION_REQUEST', 'Mumbai');

    // When both are OOO, route() returns null (manual queue)
    expect(result).toBeNull();
  });

  it('should create OOO_ESCALATION activity log entry', async () => {
    routingService = new RoutingService(mockPrisma as any, mockCanonicalLookup as any);

    await routingService.createOooEscalationLog('case-001', 'Raj Kumar', 'Priya Singh');

    expect(mockPrisma.caseActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          case_id: 'case-001',
          action_code: 'OOO_ESCALATION',
          actor_type: 'SYSTEM',
          payload_json: expect.objectContaining({
            fpr_name: 'Raj Kumar',
            delegate_name: 'Priya Singh',
            status: 'MANUAL_ROUTING',
          }),
        }),
      }),
    );
  });

  it('should include MANUAL_ROUTING in CaseStatus enum', () => {
    expect(CaseStatus.MANUAL_ROUTING).toBe('MANUAL_ROUTING');
  });
});

// ───────────────────────────────────────────────────────────
// FR-032 A2: Manual Vendor Selection
// ───────────────────────────────────────────────────────────

describe('FR-032 A2: Manual Vendor Selection', () => {
  let vendorService: VendorSelectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    vendorService = new VendorSelectionService(mockPrisma as any);
  });

  it('should return null when algorithm is MANUAL', () => {
    const vendors: VendorRecord[] = [
      {
        id: 'v-1',
        name: 'Vendor A',
        geographies: ['Mumbai'],
        caseTypes: ['VALUATION_REQUEST'],
        avgTatDays: 3,
        scorecardRating: 4.5,
        activeJobs: 2,
      },
    ];

    vendorService.setVendors(vendors);
    const result = vendorService.select('Mumbai', 'VALUATION_REQUEST', 'MANUAL' as SelectionAlgorithm);

    // MANUAL mode: no auto-selection, Officer picks
    expect(result).toBeNull();
  });

  it('should still auto-select with other algorithms', () => {
    const vendors: VendorRecord[] = [
      {
        id: 'v-1',
        name: 'Vendor A',
        geographies: ['Mumbai'],
        caseTypes: ['VALUATION_REQUEST'],
        avgTatDays: 3,
        scorecardRating: 4.5,
        activeJobs: 2,
      },
      {
        id: 'v-2',
        name: 'Vendor B',
        geographies: ['Mumbai'],
        caseTypes: ['VALUATION_REQUEST'],
        avgTatDays: 2,
        scorecardRating: 3.5,
        activeJobs: 1,
      },
    ];

    vendorService.setVendors(vendors);

    // lowest-tat should pick Vendor B
    const result = vendorService.select('Mumbai', 'VALUATION_REQUEST', 'lowest-tat');
    expect(result).not.toBeNull();
    expect(result!.vendorId).toBe('v-2');
  });
});

// ───────────────────────────────────────────────────────────
// FR-034 A3: thread_id propagation on case linking
// ───────────────────────────────────────────────────────────

describe('FR-034 A3: thread_id propagation', () => {
  let caseCreationService: CaseCreationService;

  const mockStateMachine = {
    validateTransition: jest.fn(),
  };

  const mockRoutingService = {
    routeWithLookup: jest.fn().mockResolvedValue({
      fprId: 'fpr-1',
      fprName: 'Test FPR',
      reason: 'test',
    }),
  };

  const mockVendorSelection = {
    select: jest.fn(),
  };

  const mockAutoAck = {
    sendAck: jest.fn().mockResolvedValue(undefined),
  };

  const mockWebhookDispatcher = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    caseCreationService = new CaseCreationService(
      mockPrisma as any,
      mockStateMachine as any,
      mockRoutingService as any,
      mockVendorSelection as any,
      mockAutoAck as any,
      mockWebhookDispatcher as any,
    );

    // Set up case lookup
    mockPrisma.case.findUnique
      .mockResolvedValueOnce({
        id: 'case-A',
        case_number: 'ATL-2026-000001',
        thread_id: 'thread-uuid-123',
      })
      .mockResolvedValueOnce({
        id: 'case-B',
        case_number: 'ATL-2026-000002',
        thread_id: null,
      });
  });

  it('should propagate primary case thread_id to linked cases', async () => {
    await caseCreationService.linkCases('case-A', 'case-B', 'user-1');

    // Should have called updateMany to propagate thread_id
    expect(mockPrisma.case.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['case-B'] } },
        data: { thread_id: 'thread-uuid-123' },
      }),
    );
  });

  it('should not propagate thread_id if primary case has no thread_id', async () => {
    // Reset mocks and set up both cases without thread_id
    mockPrisma.case.findUnique
      .mockReset()
      .mockResolvedValueOnce({
        id: 'case-A',
        case_number: 'ATL-2026-000001',
        thread_id: null,
      })
      .mockResolvedValueOnce({
        id: 'case-B',
        case_number: 'ATL-2026-000002',
        thread_id: null,
      });

    await caseCreationService.linkCases('case-A', 'case-B', 'user-1');

    // updateMany should NOT have been called because primary has no thread_id
    expect(mockPrisma.case.updateMany).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────
// Vendor Override — SelectionAlgorithm type includes MANUAL
// ───────────────────────────────────────────────────────────

describe('Vendor Selection algorithm type', () => {
  it('should accept MANUAL as a valid SelectionAlgorithm', () => {
    const algo: SelectionAlgorithm = 'MANUAL';
    expect(algo).toBe('MANUAL');
  });

  it('should accept all standard algorithms', () => {
    const algos: SelectionAlgorithm[] = ['round-robin', 'lowest-tat', 'highest-scorecard', 'MANUAL'];
    expect(algos).toHaveLength(4);
  });
});
