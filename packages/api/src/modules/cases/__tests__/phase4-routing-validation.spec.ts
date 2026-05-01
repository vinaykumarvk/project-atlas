import { Test, TestingModule } from '@nestjs/testing';
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
import { CaseStatus, FprRecord } from '../types';
import { SenderDomainService } from '../../ai-classification/services/sender-domain.service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

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
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Phase 4: Routing Validation Gate + Sender Domain Rules + Priority Audit', () => {
  let caseService: CaseCreationService;
  let routingService: RoutingService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activityLogs: any[];
  let mockCanonicalLookup: { lookup: jest.Mock };

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();
    activityLogs = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdCases: any[] = [];

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

    mockPrisma.case.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      return Promise.resolve(data);
    });

    mockPrisma.caseActivityLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const log = { id: `log-${activityLogs.length + 1}`, ...data, created_at: new Date() };
      activityLogs.push(log);
      return Promise.resolve(log);
    });

    mockPrisma.notificationLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      return Promise.resolve({ id: `notif-1`, ...data, created_at: new Date() });
    });

    mockPrisma.notificationLog.findMany.mockResolvedValue([]);

    // CanonicalLookupService mock — case type returns EXACT, city returns EXACT for Mumbai
    mockCanonicalLookup = {
      lookup: jest.fn().mockImplementation(async (masterTable: string, rawValue: string) => {
        if (masterTable === 'CaseTypeMaster') {
          if (rawValue === 'VALUATION_REQUEST') {
            return {
              canonicalForm: 'VALUATION_REQUEST',
              confidence: 1.0,
              matchType: 'EXACT',
              matchedRecord: {
                code: 'VALUATION_REQUEST',
                required_skills: ['valuation'],
                effective_from: new Date('2020-01-01'),
                effective_to: null,
              },
            };
          }
          if (rawValue === 'UNKNOWN_TYPE') {
            return { canonicalForm: null, confidence: 0, matchType: 'NO_MATCH' };
          }
          // Default for other case types
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
        if (masterTable === 'PropertyLocationMaster') {
          if (rawValue === 'Mumbai') {
            return {
              canonicalForm: 'Mumbai',
              confidence: 1.0,
              matchType: 'EXACT',
              matchedRecord: { city: 'Mumbai', zone: 'West', region: 'Maharashtra' },
            };
          }
        }
        return { canonicalForm: null, confidence: 0, matchType: 'NO_MATCH' };
      }),
    };

    // Mock PIN lookup
    mockPrisma.propertyLocationMaster.findFirst.mockImplementation(
      ({ where }: { where: { pin_from: { lte: string }; pin_to: { gte: string } } }) => {
        const pin = where.pin_to.gte;
        if (pin === '400001') {
          return Promise.resolve({ city: 'Mumbai', zone: 'West', region: 'Maharashtra' });
        }
        return Promise.resolve(null);
      },
    );

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

    routingService.setFprs(testFprs);
  });

  // -----------------------------------------------------------------------
  // Task 1: Routing failure -> AWAITING_FIELD_DISAMBIGUATION
  // -----------------------------------------------------------------------
  describe('Task 1: Routing failure sets AWAITING_FIELD_DISAMBIGUATION', () => {
    it('should set status to AWAITING_FIELD_DISAMBIGUATION when routeWithLookup returns a RoutingFailure', async () => {
      // Use an unknown case type that returns NO_MATCH from canonical lookup
      const input = buildInput();
      input.classification.caseType = 'UNKNOWN_TYPE';

      const result = await caseService.createCase(input);

      expect(result.status).toBe(CaseStatus.AWAITING_FIELD_DISAMBIGUATION);
      expect(result.assignedFprId).toBeUndefined();
    });

    it('should log routing failure reason in activity log', async () => {
      const input = buildInput();
      input.classification.caseType = 'UNKNOWN_TYPE';

      const result = await caseService.createCase(input);

      // Look for ROUTING_FAILURE entry in the activity log
      const routingFailureEntry = result.activityLog.find(
        (a) => a.action === 'ROUTING_FAILURE',
      );
      expect(routingFailureEntry).toBeDefined();
      expect(routingFailureEntry!.details).toContain('not found in CaseTypeMaster');
    });

    it('should transition through CLASSIFIED -> AWAITING_FIELD_DISAMBIGUATION on routing failure', async () => {
      const input = buildInput();
      input.classification.caseType = 'UNKNOWN_TYPE';

      const result = await caseService.createCase(input);

      const statusChanges = result.activityLog.filter(
        (a) => a.action === 'STATUS_CHANGE',
      );
      // Should have: NEW->CLASSIFIED, CLASSIFIED->AWAITING_FIELD_DISAMBIGUATION
      expect(statusChanges.length).toBe(2);
      expect(statusChanges[1].toStatus).toBe(CaseStatus.AWAITING_FIELD_DISAMBIGUATION);
    });

    it('should NOT send auto-ack when routing fails', async () => {
      const input = buildInput();
      input.classification.caseType = 'UNKNOWN_TYPE';

      await caseService.createCase(input);

      // notificationLog.create should NOT have been called with ACK template
      // (it's called inside the transaction for activity logs, but not for ack)
      const ackCalls = mockPrisma.notificationLog.create.mock.calls.filter(
        (call: any[]) => call[0]?.data?.template_code === 'CASE_ACK',
      );
      expect(ackCalls.length).toBe(0);
    });

    it('should still route successfully when FPR matches', async () => {
      const input = buildInput(); // Mumbai + VALUATION_REQUEST - should match
      const result = await caseService.createCase(input);

      expect(result.status).toBe(CaseStatus.ROUTED);
      expect(result.assignedFprId).toBeDefined();
    });

    it('should set AWAITING_FIELD_DISAMBIGUATION when no location data matches any FPR', async () => {
      // Use a city that has no matching FPR
      const input = buildInput();
      input.classification.propertyCity = 'UnknownCity';
      input.classification.propertyPin = undefined;

      const result = await caseService.createCase(input);

      // routeWithLookup should return a RoutingFailure because no FPR covers UnknownCity
      expect(result.status).toBe(CaseStatus.AWAITING_FIELD_DISAMBIGUATION);
    });
  });

  // -----------------------------------------------------------------------
  // Task 2: Sender domain rule matching
  // -----------------------------------------------------------------------
  describe('Task 2: Sender domain rules', () => {
    it('should return matching priority for a known domain', () => {
      const originalEnv = process.env.SENDER_DOMAIN_RULES;
      process.env.SENDER_DOMAIN_RULES = JSON.stringify({
        'legal.client.com': 'CRITICAL',
        'compliance.client.com': 'HIGH',
      });

      const service = new SenderDomainService();

      expect(service.checkDomain('user@legal.client.com')).toBe('CRITICAL');
      expect(service.checkDomain('anyone@compliance.client.com')).toBe('HIGH');

      process.env.SENDER_DOMAIN_RULES = originalEnv;
    });

    it('should return null for unmatched domains', () => {
      const originalEnv = process.env.SENDER_DOMAIN_RULES;
      process.env.SENDER_DOMAIN_RULES = JSON.stringify({
        'legal.client.com': 'CRITICAL',
      });

      const service = new SenderDomainService();

      expect(service.checkDomain('user@random.com')).toBeNull();
      expect(service.checkDomain('user@other.client.com')).toBeNull();

      process.env.SENDER_DOMAIN_RULES = originalEnv;
    });

    it('should handle case-insensitive domain matching', () => {
      const originalEnv = process.env.SENDER_DOMAIN_RULES;
      process.env.SENDER_DOMAIN_RULES = JSON.stringify({
        'Legal.Client.Com': 'CRITICAL',
      });

      const service = new SenderDomainService();

      expect(service.checkDomain('user@legal.client.com')).toBe('CRITICAL');
      expect(service.checkDomain('user@LEGAL.CLIENT.COM')).toBe('CRITICAL');

      process.env.SENDER_DOMAIN_RULES = originalEnv;
    });

    it('should return null for invalid email addresses', () => {
      const originalEnv = process.env.SENDER_DOMAIN_RULES;
      process.env.SENDER_DOMAIN_RULES = JSON.stringify({
        'legal.client.com': 'CRITICAL',
      });

      const service = new SenderDomainService();

      expect(service.checkDomain('')).toBeNull();
      expect(service.checkDomain('nodomain')).toBeNull();

      process.env.SENDER_DOMAIN_RULES = originalEnv;
    });

    it('should handle empty/missing SENDER_DOMAIN_RULES env var', () => {
      const originalEnv = process.env.SENDER_DOMAIN_RULES;
      delete process.env.SENDER_DOMAIN_RULES;

      const service = new SenderDomainService();
      expect(service.checkDomain('user@legal.client.com')).toBeNull();
      expect(service.getRules()).toEqual({});

      process.env.SENDER_DOMAIN_RULES = originalEnv;
    });

    it('should handle invalid JSON in SENDER_DOMAIN_RULES gracefully', () => {
      const originalEnv = process.env.SENDER_DOMAIN_RULES;
      process.env.SENDER_DOMAIN_RULES = 'not-valid-json';

      const service = new SenderDomainService();
      expect(service.checkDomain('user@legal.client.com')).toBeNull();

      process.env.SENDER_DOMAIN_RULES = originalEnv;
    });

    it('should expose configured rules via getRules()', () => {
      const originalEnv = process.env.SENDER_DOMAIN_RULES;
      const rules = { 'legal.client.com': 'CRITICAL', 'compliance.client.com': 'HIGH' };
      process.env.SENDER_DOMAIN_RULES = JSON.stringify(rules);

      const service = new SenderDomainService();
      expect(service.getRules()).toEqual(rules);

      process.env.SENDER_DOMAIN_RULES = originalEnv;
    });
  });

  // -----------------------------------------------------------------------
  // Task 3: Priority audit logging
  // -----------------------------------------------------------------------
  describe('Task 3: Priority audit logging', () => {
    it('should log PRIORITY_CHANGED on case creation with AI_CLASSIFICATION source', async () => {
      const input = buildInput();
      const result = await caseService.createCase(input);

      const priorityEntry = result.activityLog.find(
        (a) => a.action === 'PRIORITY_CHANGED',
      );
      expect(priorityEntry).toBeDefined();
      expect(priorityEntry!.details).toContain('MEDIUM');
    });

    it('should persist PRIORITY_CHANGED with from/to/reason/source in payload', async () => {
      const input = buildInput();
      await caseService.createCase(input);

      // Check the raw activity log entries stored via mock
      const priorityLog = activityLogs.find(
        (l) => l.action_code === 'PRIORITY_CHANGED',
      );
      expect(priorityLog).toBeDefined();
      const payload = priorityLog.payload_json;
      expect(payload.from).toBeNull(); // Initial creation has no prior priority
      expect(payload.to).toBe('MEDIUM');
      expect(payload.reason).toBe('Initial classification');
      expect(payload.source).toBe('AI_CLASSIFICATION');
    });

    it('should log PRIORITY_CHANGED via changePriority method with MANUAL source', async () => {
      const input = buildInput();
      const caseRecord = await caseService.createCase(input);

      await caseService.changePriority(
        caseRecord.id,
        'HIGH',
        'MANUAL',
        'Manager override',
        'admin-user-1',
      );

      // Find the PRIORITY_CHANGED log from changePriority call
      const priorityLogs = activityLogs.filter(
        (l) => l.action_code === 'PRIORITY_CHANGED',
      );
      // Should have 2: one from creation, one from changePriority
      expect(priorityLogs.length).toBe(2);

      const manualLog = priorityLogs[1];
      expect(manualLog.payload_json.from).toBe('MEDIUM');
      expect(manualLog.payload_json.to).toBe('HIGH');
      expect(manualLog.payload_json.source).toBe('MANUAL');
      expect(manualLog.payload_json.reason).toBe('Manager override');
      expect(manualLog.actor_type).toBe('USER');
      expect(manualLog.actor_id).toBe('admin-user-1');
    });

    it('should log PRIORITY_CHANGED via changePriority method with SENDER_DOMAIN_RULE source', async () => {
      const input = buildInput();
      const caseRecord = await caseService.createCase(input);

      await caseService.changePriority(
        caseRecord.id,
        'CRITICAL',
        'SENDER_DOMAIN_RULE',
        'Sender domain legal.client.com matched CRITICAL rule',
      );

      const priorityLogs = activityLogs.filter(
        (l) => l.action_code === 'PRIORITY_CHANGED',
      );
      const domainLog = priorityLogs[priorityLogs.length - 1];
      expect(domainLog.payload_json.from).toBe('MEDIUM');
      expect(domainLog.payload_json.to).toBe('CRITICAL');
      expect(domainLog.payload_json.source).toBe('SENDER_DOMAIN_RULE');
    });

    it('should not log PRIORITY_CHANGED when priority is unchanged', async () => {
      const input = buildInput();
      const caseRecord = await caseService.createCase(input);

      const logCountBefore = activityLogs.filter(
        (l) => l.action_code === 'PRIORITY_CHANGED',
      ).length;

      await caseService.changePriority(
        caseRecord.id,
        'MEDIUM', // Same as current
        'MANUAL',
        'No change',
      );

      const logCountAfter = activityLogs.filter(
        (l) => l.action_code === 'PRIORITY_CHANGED',
      ).length;

      expect(logCountAfter).toBe(logCountBefore);
    });
  });
});
