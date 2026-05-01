import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaseCreationService, CreateCaseInput } from '../services/case-creation.service';
import { StateMachineService } from '../services/state-machine.service';
import { RoutingService } from '../services/routing.service';
import { VendorSelectionService } from '../services/vendor-selection.service';
import { AutoAckService } from '../services/auto-ack.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { CanonicalLookupService } from '../../masters/services/canonical-lookup.service';
import { WebhookDispatcherService } from '../../webhooks/services/webhook-dispatcher.service';
import { CaseStatus, FprRecord, VendorRecord } from '../types';

function buildInput(overrides: Partial<CreateCaseInput> = {}): CreateCaseInput {
  return {
    emailIngestId: 'ingest-001',
    subject: 'Property valuation request for Loan #12345',
    from: 'customer@example.com',
    classification: {
      caseType: 'VALUATION_REQUEST',
      confidenceBand: 'GREEN',
      priority: 'MEDIUM',
      loanAccountNo: 'LN0012345',
      customerName: 'Rajesh Kumar',
      propertyCity: 'Mumbai',
      propertyPin: '400001',
      languageDetected: 'en',
    },
    ...overrides,
  };
}

const testFprs: FprRecord[] = [
  {
    id: 'fpr-1',
    name: 'Amit Sharma',
    email: 'amit@bank.com',
    skills: ['valuation', 'legal'],
    propertyZones: ['Mumbai', 'Pune'],
    caseTypes: ['VALUATION_REQUEST', 'LEGAL_OPINION'],
    capacityPerDay: 10,
    openCaseCount: 3,
    isOoo: false,
  },
  {
    id: 'fpr-2',
    name: 'Priya Patel',
    email: 'priya@bank.com',
    skills: ['valuation', 'insurance'],
    propertyZones: ['Mumbai', 'Nashik'],
    caseTypes: ['VALUATION_REQUEST', 'INSURANCE_RENEWAL'],
    capacityPerDay: 8,
    openCaseCount: 7,
    isOoo: false,
  },
  {
    id: 'fpr-3',
    name: 'Suresh Reddy',
    email: 'suresh@bank.com',
    skills: ['valuation'],
    propertyZones: ['Mumbai'],
    caseTypes: ['VALUATION_REQUEST'],
    capacityPerDay: 6,
    openCaseCount: 2,
    isOoo: true,
    delegateId: 'fpr-1',
    supervisorId: 'fpr-4',
  },
  {
    id: 'fpr-4',
    name: 'Meena Desai (Supervisor)',
    email: 'meena@bank.com',
    skills: ['valuation', 'legal', 'insurance'],
    propertyZones: ['Mumbai', 'Pune', 'Nashik'],
    caseTypes: ['VALUATION_REQUEST', 'LEGAL_OPINION', 'INSURANCE_RENEWAL'],
    capacityPerDay: 5,
    openCaseCount: 4,
    isOoo: false,
  },
];

const testVendors: VendorRecord[] = [
  {
    id: 'v-1',
    name: 'QuickVal Services',
    geographies: ['Mumbai', 'Pune'],
    caseTypes: ['VALUATION_REQUEST', 'SITE_VISIT'],
    avgTatDays: 3,
    scorecardRating: 4.2,
    activeJobs: 12,
  },
  {
    id: 'v-2',
    name: 'PremiumVal India',
    geographies: ['Mumbai', 'Nashik'],
    caseTypes: ['VALUATION_REQUEST'],
    avgTatDays: 2,
    scorecardRating: 4.8,
    activeJobs: 5,
  },
  {
    id: 'v-3',
    name: 'LegalEase Partners',
    geographies: ['Mumbai', 'Pune', 'Nashik'],
    caseTypes: ['LEGAL_OPINION', 'TITLE_SEARCH'],
    avgTatDays: 5,
    scorecardRating: 4.5,
    activeJobs: 8,
  },
];

describe('Case Creation & Routing Engine', () => {
  let caseService: CaseCreationService;
  let routingService: RoutingService;
  let vendorService: VendorSelectionService;
  let stateMachine: StateMachineService;
  let autoAck: AutoAckService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    // Stateful mock for cases — track created cases for findById/findAll/linkCases
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdCases: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activityLogs: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notificationLogs: any[] = [];

    mockPrisma.case.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const record = {
        id: data.id || `case-${createdCases.length + 1}`,
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
        activity_logs: [],
        linked_cases_from: [],
      };
      createdCases.push(record);
      return Promise.resolve(record);
    });

    mockPrisma.case.findFirst.mockImplementation(({ where }: { where: Record<string, any> }) => {
      // For generateCaseNumber — find latest case with matching prefix
      if (where?.case_number?.startsWith) {
        const prefix = (where.case_number as { startsWith: string }).startsWith;
        const matching = createdCases
          .filter((c) => (c.case_number as string)?.startsWith(prefix))
          .sort((a, b) => (b.case_number as string).localeCompare(a.case_number as string));
        return Promise.resolve(matching[0] || null);
      }
      return Promise.resolve(null);
    });

    mockPrisma.case.findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      const found = createdCases.find((c) => {
        if (where.id) return c.id === where.id;
        if (where.case_number) return c.case_number === where.case_number;
        return false;
      });
      if (found) {
        // Attach activity logs and links
        found.activity_logs = activityLogs
          .filter((a) => a.case_id === found.id)
          .map((a) => ({
            id: a.id || `log-${Math.random().toString(36).substring(2)}`,
            created_at: a.created_at || new Date(),
            action_code: a.action_code,
            actor_id: a.actor_id || null,
            payload_json: a.payload_json,
          }));
      }
      return Promise.resolve(found || null);
    });

    mockPrisma.case.findMany.mockImplementation(({ where }: { where?: Record<string, unknown> } = {}) => {
      let filtered = [...createdCases];
      if (where?.status) {
        filtered = filtered.filter((c) => c.status === where.status);
      }
      return Promise.resolve(filtered);
    });

    mockPrisma.case.count.mockImplementation(({ where }: { where?: Record<string, unknown> } = {}) => {
      let filtered = [...createdCases];
      if (where?.status) {
        filtered = filtered.filter((c) => c.status === where.status);
      }
      return Promise.resolve(filtered.length);
    });

    mockPrisma.caseActivityLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const log = { id: `log-${activityLogs.length + 1}`, ...data, created_at: new Date() };
      activityLogs.push(log);
      return Promise.resolve(log);
    });

    mockPrisma.caseLink.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      return Promise.resolve({ id: `link-${Math.random().toString(36).substring(2)}`, ...data });
    });

    // Stateful mock for notification logs (auto-ack)
    mockPrisma.notificationLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const record = { id: `notif-${notificationLogs.length + 1}`, ...data, created_at: new Date() };
      notificationLogs.push(record);
      return Promise.resolve(record);
    });

    mockPrisma.notificationLog.findMany.mockImplementation(({ where }: { where?: Record<string, unknown> } = {}) => {
      if (where?.triggered_by === 'ACK') {
        return Promise.resolve(notificationLogs.filter((l) => l.triggered_by === 'ACK'));
      }
      return Promise.resolve([...notificationLogs]);
    });

    // Mock PIN lookup for routeWithLookup
    mockPrisma.propertyLocationMaster.findFirst.mockImplementation(
      ({ where }: { where: { pin_from: { lte: string }; pin_to: { gte: string } } }) => {
        const pin = where.pin_to.gte;
        if (pin === '400001') {
          return Promise.resolve({ city: 'Mumbai', zone: 'West', region: 'Maharashtra' });
        }
        return Promise.resolve(null);
      },
    );

    const mockCanonicalLookup = {
      lookup: jest.fn().mockImplementation(async (masterTable: string, rawValue: string) => {
        if (masterTable === 'CaseTypeMaster') {
          const knownTypes = ['VALUATION_REQUEST', 'LEGAL_OPINION', 'INSURANCE_RENEWAL', 'TITLE_SEARCH', 'SITE_VISIT'];
          if (knownTypes.includes(rawValue)) {
            return {
              canonicalForm: rawValue,
              confidence: 1.0,
              matchType: 'EXACT',
              matchedRecord: {
                code: rawValue,
                required_skills: [],
                effective_from: new Date('2020-01-01'),
                effective_to: null,
              },
            };
          }
          return { canonicalForm: null, confidence: 0, matchType: 'NO_MATCH' };
        }
        if (masterTable === 'PropertyLocationMaster') {
          const knownCities: Record<string, { city: string; zone: string; region: string }> = {
            'Mumbai': { city: 'Mumbai', zone: 'West', region: 'Maharashtra' },
            'Pune': { city: 'Pune', zone: 'West', region: 'Maharashtra' },
            'Nashik': { city: 'Nashik', zone: 'North', region: 'Maharashtra' },
          };
          if (knownCities[rawValue]) {
            return {
              canonicalForm: rawValue,
              confidence: 1.0,
              matchType: 'EXACT',
              matchedRecord: knownCities[rawValue],
            };
          }
        }
        return { canonicalForm: null, confidence: 0, matchType: 'NO_MATCH' };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseCreationService,
        StateMachineService,
        RoutingService,
        VendorSelectionService,
        AutoAckService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CanonicalLookupService, useValue: mockCanonicalLookup },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
        { provide: WebhookDispatcherService, useValue: { dispatch: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    caseService = module.get(CaseCreationService);
    routingService = module.get(RoutingService);
    vendorService = module.get(VendorSelectionService);
    stateMachine = module.get(StateMachineService);
    autoAck = module.get(AutoAckService);

    routingService.setFprs(testFprs);
    vendorService.setVendors(testVendors);
  });

  describe('Case creation (FR-030)', () => {
    it('should create a case with correct case number format ATL-YYYY-NNNNNN', async () => {
      const result = await caseService.createCase(buildInput());
      expect(result.caseNumber).toMatch(/^ATL-\d{4}-\d{6}$/);
    });

    it('should populate all fields from classification', async () => {
      const result = await caseService.createCase(buildInput());
      expect(result.caseType).toBe('VALUATION_REQUEST');
      expect(result.priority).toBe('MEDIUM');
      expect(result.loanAccountNo).toBe('LN0012345');
      expect(result.customerName).toBe('Rajesh Kumar');
      expect(result.propertyCity).toBe('Mumbai');
      expect(result.confidenceBand).toBe('GREEN');
      expect(result.languageDetected).toBe('en');
    });

    it('should compute TAT target date', async () => {
      const result = await caseService.createCase(buildInput());
      expect(result.tatTargetAt).toBeInstanceOf(Date);
      expect(result.tatTargetAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should send auto-acknowledgement', async () => {
      await caseService.createCase(buildInput());
      // Allow async ack to complete
      await new Promise((r) => setTimeout(r, 10));
      const acks = await autoAck.getSentAcks();
      expect(acks.length).toBe(1);
      expect(acks[0].to).toBe('customer@example.com');
      expect(acks[0].caseNumber).toMatch(/^ATL-/);
    });

    it('should send Hindi ack for Hindi emails', async () => {
      const input = buildInput();
      input.classification.languageDetected = 'hi';
      await caseService.createCase(input);
      await new Promise((r) => setTimeout(r, 10));
      const acks = await autoAck.getSentAcks();
      expect(acks[0].body).toContain('\u0928\u092E\u0938\u094D\u0924\u0947');
    });

    it('should log creation activity', async () => {
      const result = await caseService.createCase(buildInput());
      expect(result.activityLog.length).toBeGreaterThanOrEqual(2);
      expect(result.activityLog[0].action).toBe('CREATED');
    });

    it('should generate unique sequential case numbers', async () => {
      const c1 = await caseService.createCase(buildInput());
      const c2 = await caseService.createCase(buildInput({ emailIngestId: 'ingest-002' }));
      expect(c1.caseNumber).not.toBe(c2.caseNumber);
      const seq1 = parseInt(c1.caseNumber.split('-')[2]);
      const seq2 = parseInt(c2.caseNumber.split('-')[2]);
      expect(seq2).toBe(seq1 + 1);
    });
  });

  describe('State machine (FR-030)', () => {
    it('should allow valid transitions', () => {
      expect(() =>
        stateMachine.validateTransition(CaseStatus.NEW, CaseStatus.CLASSIFIED),
      ).not.toThrow();
    });

    it('should reject invalid transitions', () => {
      expect(() =>
        stateMachine.validateTransition(CaseStatus.NEW, CaseStatus.CLOSED),
      ).toThrow(BadRequestException);
    });

    it('should reject transitions from terminal states', () => {
      expect(() =>
        stateMachine.validateTransition(CaseStatus.CLOSED, CaseStatus.IN_PROGRESS),
      ).toThrow(BadRequestException);
    });

    it('should identify terminal states', () => {
      expect(stateMachine.isTerminal(CaseStatus.CLOSED)).toBe(true);
      expect(stateMachine.isTerminal(CaseStatus.CANCELLED)).toBe(true);
      expect(stateMachine.isTerminal(CaseStatus.IN_PROGRESS)).toBe(false);
    });

    it('should list valid next states', () => {
      const next = stateMachine.getNextStates(CaseStatus.IN_PROGRESS);
      expect(next).toContain(CaseStatus.AWAITING_VENDOR);
      expect(next).toContain(CaseStatus.REVIEW);
      expect(next).not.toContain(CaseStatus.NEW);
    });
  });

  describe('FPR Routing (FR-031)', () => {
    it('should route to correct FPR by case type and zone', () => {
      const result = routingService.route('VALUATION_REQUEST', 'Mumbai');
      expect(result).not.toBeNull();
      expect(result!.fprId).toBe('fpr-1');
    });

    it('should apply workload balancing', () => {
      const result = routingService.route('VALUATION_REQUEST', 'Mumbai');
      expect(result!.fprId).toBe('fpr-1');
      expect(result!.reason).toContain('workload');
    });

    it('should handle OOO fallback to delegate', () => {
      routingService.setFprs([
        { ...testFprs[2], propertyZones: ['Thane'] },
        { ...testFprs[0], propertyZones: ['Thane'], isOoo: false },
      ]);
      const result = routingService.route('VALUATION_REQUEST', 'Thane');
      expect(result).not.toBeNull();
      expect(result!.fprId).toBe('fpr-1');
    });

    it('should fallback to supervisor when delegate also OOO', () => {
      routingService.setFprs([
        { ...testFprs[2], propertyZones: ['Thane'], caseTypes: ['VALUATION_REQUEST'] },
        { ...testFprs[0], id: 'fpr-1', propertyZones: ['Thane'], caseTypes: ['VALUATION_REQUEST'], isOoo: true },
        { ...testFprs[3], id: 'fpr-4', propertyZones: ['OTHER'], caseTypes: ['OTHER'], isOoo: false },
      ]);
      const result = routingService.route('VALUATION_REQUEST', 'Thane');
      expect(result).not.toBeNull();
      expect(result!.fprId).toBe('fpr-4');
      expect(result!.reason).toContain('supervisor');
    });

    it('should return null (manual queue) when no FPR available', () => {
      const result = routingService.route('VALUATION_REQUEST', 'UnknownCity');
      expect(result).toBeNull();
    });

    it('should filter by skills', () => {
      const result = routingService.route('LEGAL_OPINION', 'Mumbai', ['legal']);
      expect(result).not.toBeNull();
      expect(result!.fprId).toBe('fpr-1');

      const noMatch = routingService.route('VALUATION_REQUEST', 'Nashik', ['legal']);
      expect(noMatch).not.toBeNull();
      expect(noMatch!.fprId).toBe('fpr-4');
    });
  });

  describe('Vendor selection (FR-032)', () => {
    it('should select vendor by lowest TAT', () => {
      const result = vendorService.select('Mumbai', 'VALUATION_REQUEST', 'lowest-tat');
      expect(result).not.toBeNull();
      expect(result!.vendorId).toBe('v-2');
      expect(result!.reason).toContain('Lowest TAT');
    });

    it('should select vendor by highest scorecard', () => {
      const result = vendorService.select('Mumbai', 'VALUATION_REQUEST', 'highest-scorecard');
      expect(result).not.toBeNull();
      expect(result!.vendorId).toBe('v-2');
    });

    it('should select vendor by round-robin', () => {
      const r1 = vendorService.select('Mumbai', 'VALUATION_REQUEST', 'round-robin');
      const r2 = vendorService.select('Mumbai', 'VALUATION_REQUEST', 'round-robin');
      expect(r1!.vendorId).not.toBe(r2!.vendorId);
    });

    it('should return null when no vendor matches', () => {
      const result = vendorService.select('UnknownCity', 'VALUATION_REQUEST', 'lowest-tat');
      expect(result).toBeNull();
    });

    it('should filter by geography and case type', () => {
      const result = vendorService.select('Nashik', 'LEGAL_OPINION', 'lowest-tat');
      expect(result).not.toBeNull();
      expect(result!.vendorId).toBe('v-3');
    });
  });

  describe('Case lifecycle transitions', () => {
    it('should auto-transition NEW -> CLASSIFIED -> ROUTED on creation', async () => {
      const result = await caseService.createCase(buildInput());
      expect(result.status).toBe(CaseStatus.ROUTED);
    });

    it('should set AWAITING_FIELD_DISAMBIGUATION when no FPR match (routing failure)', async () => {
      const input = buildInput();
      input.classification.propertyCity = 'UnknownCity';
      input.classification.propertyPin = undefined;
      const result = await caseService.createCase(input);
      expect(result.status).toBe(CaseStatus.AWAITING_FIELD_DISAMBIGUATION);
      expect(result.assignedFprId).toBeUndefined();
    });

    it('should log all transitions in activity log', async () => {
      const result = await caseService.createCase(buildInput());
      const statusChanges = result.activityLog.filter((a) => a.action === 'STATUS_CHANGE');
      expect(statusChanges.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Case linking (FR-034)', () => {
    it('should link two cases bidirectionally', async () => {
      const c1 = await caseService.createCase(buildInput({ emailIngestId: 'e1' }));
      const c2 = await caseService.createCase(buildInput({ emailIngestId: 'e2' }));

      await caseService.linkCases(c1.id, c2.id, 'admin');

      const updated1 = await caseService.findById(c1.id);
      expect(updated1).toBeDefined();
    });
  });

  describe('findAll with filters', () => {
    it('should filter by status', async () => {
      await caseService.createCase(buildInput({ emailIngestId: 'e1' }));
      const input2 = buildInput({ emailIngestId: 'e2' });
      input2.classification.propertyCity = 'UnknownCity';
      input2.classification.propertyPin = undefined;
      await caseService.createCase(input2);

      const routed = await caseService.findAll({ status: CaseStatus.ROUTED });
      const disambiguation = await caseService.findAll({ status: CaseStatus.AWAITING_FIELD_DISAMBIGUATION });

      expect(routed.data.length).toBe(1);
      expect(disambiguation.data.length).toBe(1);
    });
  });

  describe('Workload-balancing toggle (FR-031.A3)', () => {
    it('should use first-match when ROUTING_WORKLOAD_BALANCE=false', () => {
      const originalEnv = process.env.ROUTING_WORKLOAD_BALANCE;
      process.env.ROUTING_WORKLOAD_BALANCE = 'false';

      try {
        // fpr-1 has lower workload ratio but fpr-2 has higher.
        // With workload balancing off, first-match (fpr-1) should be selected
        // regardless of workload ratio.
        routingService.setFprs([
          { ...testFprs[1], openCaseCount: 1, capacityPerDay: 10 }, // fpr-2: ratio 0.1
          { ...testFprs[0], openCaseCount: 9, capacityPerDay: 10 }, // fpr-1: ratio 0.9
        ]);
        const result = routingService.route('VALUATION_REQUEST', 'Mumbai');
        expect(result).not.toBeNull();
        // First match should be fpr-2 (first in list)
        expect(result!.fprId).toBe('fpr-2');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.ROUTING_WORKLOAD_BALANCE;
        } else {
          process.env.ROUTING_WORKLOAD_BALANCE = originalEnv;
        }
      }
    });

    it('should use workload balancing by default', () => {
      const originalEnv = process.env.ROUTING_WORKLOAD_BALANCE;
      delete process.env.ROUTING_WORKLOAD_BALANCE;

      try {
        routingService.setFprs([
          { ...testFprs[1], openCaseCount: 7, capacityPerDay: 8 }, // fpr-2: ratio 0.875
          { ...testFprs[0], openCaseCount: 3, capacityPerDay: 10 }, // fpr-1: ratio 0.3
        ]);
        const result = routingService.route('VALUATION_REQUEST', 'Mumbai');
        expect(result).not.toBeNull();
        // Workload balancing should select fpr-1 (lower ratio)
        expect(result!.fprId).toBe('fpr-1');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.ROUTING_WORKLOAD_BALANCE;
        } else {
          process.env.ROUTING_WORKLOAD_BALANCE = originalEnv;
        }
      }
    });
  });

  describe('Block routing on validation failure (FR-016.A3)', () => {
    it('should NOT set status to ROUTED when routeWithLookup returns success=false', async () => {
      const input = buildInput();
      input.classification.propertyCity = 'UnknownCity';
      input.classification.propertyPin = undefined;

      const result = await caseService.createCase(input);
      // Routing fails (no FPR match) -> should NOT be ROUTED
      expect(result.status).not.toBe(CaseStatus.ROUTED);
      expect(result.status).toBe(CaseStatus.AWAITING_FIELD_DISAMBIGUATION);
    });
  });

  describe('accountable_officer_id on state transitions (section 1.5)', () => {
    it('should include accountable_officer_id in activity log on creation', async () => {
      await caseService.createCase(buildInput());

      // Check that every activity log entry has accountable_officer_id in payload
      const createCalls = mockPrisma.caseActivityLog.create.mock.calls;
      for (const call of createCalls) {
        const payloadJson = call[0].data.payload_json;
        expect(payloadJson).toHaveProperty('accountable_officer_id');
      }
    });

    it('should include accountable_officer_id in activity log on status transition', async () => {
      const c = await caseService.createCase(buildInput());

      // Clear previous calls
      mockPrisma.caseActivityLog.create.mockClear();

      // Transition status
      await caseService.transitionStatus(c.id, CaseStatus.AWAITING_FPR, 'user-123', 'Manual action');

      const createCalls = mockPrisma.caseActivityLog.create.mock.calls;
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      const payload = createCalls[0][0].data.payload_json;
      expect(payload.accountable_officer_id).toBe('user-123');
    });

    it('should set accountable_officer_id=null for system transitions', async () => {
      await caseService.createCase(buildInput());

      const createCalls = mockPrisma.caseActivityLog.create.mock.calls;
      // System-created entries should have accountable_officer_id: null
      const createdEntry = createCalls.find(
        (call: [{ data: { action_code: string; payload_json: { accountable_officer_id: unknown } } }]) =>
          call[0].data.action_code === 'CREATED',
      );
      expect(createdEntry).toBeDefined();
      expect(createdEntry[0].data.payload_json.accountable_officer_id).toBeNull();
    });
  });
});
