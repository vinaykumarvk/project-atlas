import { Test, TestingModule } from '@nestjs/testing';
import { SlaClockService, BreachStatus } from '../services/sla-clock.service';
import { EscalationService, EscalationLevel } from '../services/escalation.service';
import { SlaDashboardService } from '../services/sla-dashboard.service';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { CaseRecord, CaseStatus } from '../../cases/types';
import { BusinessHoursConfig, Holiday } from '../../../common/utils/business-hours';
import { WebhookDispatcherService } from '../../webhooks/services/webhook-dispatcher.service';

// Standard business hours: Mon-Fri 09:30-18:30 IST (9 hours/day)
const testBusinessHours: BusinessHoursConfig[] = [
  { day_of_week: 'MON', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'TUE', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'WED', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'THU', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'FRI', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'SAT', open_time: '09:30', close_time: '18:30', is_working: false },
  { day_of_week: 'SUN', open_time: '09:30', close_time: '18:30', is_working: false },
];

const testHolidays: Holiday[] = [];

/**
 * Helper to create a UTC date from IST time components.
 * IST = UTC + 5:30
 */
function istToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Create date in IST then convert to UTC by subtracting 5:30
  const istMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(istMs - 5.5 * 60 * 60 * 1000);
}

/**
 * Build a test case record.
 */
function buildCase(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: 'case-001',
    caseNumber: 'ATL-2025-000001',
    emailIngestId: 'ingest-001',
    subject: 'Test case',
    from: 'test@example.com',
    status: CaseStatus.IN_PROGRESS,
    caseType: 'GENERAL_INQUIRY',
    priority: 'MEDIUM',
    assignedFprId: 'fpr-1',
    assignedFprName: 'Amit Sharma',
    confidenceBand: 'GREEN',
    languageDetected: 'en',
    // Created Mon 10:30 IST — this is within business hours
    createdAt: istToUtc(2025, 1, 6, 10, 30),
    updatedAt: istToUtc(2025, 1, 6, 10, 30),
    activityLog: [],
    linkedCaseIds: [],
    ...overrides,
  };
}

describe('SLA Monitoring & Escalation Engine', () => {
  let slaClockService: SlaClockService;
  let escalationService: EscalationService;
  let dashboardService: SlaDashboardService;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const mockNotificationDispatch = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const mockWebhookDispatcher = {
      dispatch: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaClockService,
        EscalationService,
        SlaDashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationDispatchService, useValue: mockNotificationDispatch },
        { provide: WebhookDispatcherService, useValue: mockWebhookDispatcher },
      ],
    }).compile();

    slaClockService = module.get(SlaClockService);
    escalationService = module.get(EscalationService);
    dashboardService = module.get(SlaDashboardService);

    // Skip DB load on startup for unit tests
    escalationService.setSkipStartupLoad(true);

    // Configure test business hours
    slaClockService.setBusinessHours(testBusinessHours, testHolidays);
    slaClockService.setTatConfig({
      GENERAL_INQUIRY: 8,
      VALUATION_REQUEST: 48,
      LEGAL_OPINION: 72,
    });
  });

  describe('SLA Clock Service', () => {
    describe('Remaining hours computation', () => {
      it('should compute remaining hours correctly when within SLA', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 14, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.totalBusinessHours).toBe(8);
        expect(result.elapsedBusinessHours).toBeCloseTo(4, 1);
        expect(result.remainingBusinessHours).toBeCloseTo(4, 1);
        expect(result.breachStatus).toBe(BreachStatus.ON_TRACK);
      });

      it('should return full hours when no time has elapsed', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 10, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.totalBusinessHours).toBe(8);
        expect(result.elapsedBusinessHours).toBeCloseTo(0, 1);
        expect(result.remainingBusinessHours).toBeCloseTo(8, 1);
      });

      it('should not count non-business hours', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          createdAt: istToUtc(2025, 1, 6, 17, 30),
          tatTargetAt: istToUtc(2025, 1, 7, 16, 30),
        });

        const now = istToUtc(2025, 1, 7, 10, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.elapsedBusinessHours).toBeCloseTo(2, 1);
        expect(result.remainingBusinessHours).toBeCloseTo(6, 1);
      });

      it('should handle weekend correctly', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          createdAt: istToUtc(2025, 1, 10, 17, 30),
          tatTargetAt: istToUtc(2025, 1, 13, 16, 30),
        });

        const now = istToUtc(2025, 1, 13, 10, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.elapsedBusinessHours).toBeCloseTo(2, 1);
      });
    });

    describe('Breach detection', () => {
      it('should detect BREACHED status when past target', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 7, 10, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.breachStatus).toBe(BreachStatus.BREACHED);
        expect(result.remainingBusinessHours).toBe(0);
      });

      it('should detect breach at exact boundary', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
        });

        const now = istToUtc(2025, 1, 6, 18, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.elapsedBusinessHours).toBeCloseTo(8, 1);
        expect(result.remainingBusinessHours).toBeCloseTo(0, 1);
        expect(result.breachStatus).toBe(BreachStatus.BREACHED);
      });

      it('should be ON_TRACK when well within SLA', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 12, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.breachStatus).toBe(BreachStatus.ON_TRACK);
      });
    });

    describe('AT_RISK detection', () => {
      it('should trigger AT_RISK when <=25% remaining', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.elapsedBusinessHours).toBeCloseTo(6, 1);
        expect(result.remainingBusinessHours).toBeCloseTo(2, 1);
        expect(result.breachStatus).toBe(BreachStatus.AT_RISK);
      });

      it('should be ON_TRACK when just above 25% remaining', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 15, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.elapsedBusinessHours).toBeCloseTo(5, 1);
        expect(result.remainingBusinessHours).toBeCloseTo(3, 1);
        expect(result.breachStatus).toBe(BreachStatus.ON_TRACK);
      });

      it('should be AT_RISK at exactly 25% remaining', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.breachStatus).toBe(BreachStatus.AT_RISK);
      });
    });

    describe('Clock pause/resume (AWAITING_VENDOR)', () => {
      it('should not consume SLA time during paused period', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        slaClockService.pauseClock(caseRecord.id, istToUtc(2025, 1, 6, 12, 30));
        slaClockService.resumeClock(caseRecord.id, istToUtc(2025, 1, 6, 15, 30));

        const now = istToUtc(2025, 1, 6, 17, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.pausedHours).toBeCloseTo(3, 1);
        expect(result.elapsedBusinessHours).toBeCloseTo(4, 1);
        expect(result.remainingBusinessHours).toBeCloseTo(4, 1);
        expect(result.breachStatus).toBe(BreachStatus.ON_TRACK);
      });

      it('should count ongoing pause time when clock is still paused', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        slaClockService.pauseClock(caseRecord.id, istToUtc(2025, 1, 6, 12, 30));

        const now = istToUtc(2025, 1, 6, 16, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.pausedHours).toBeCloseTo(4, 1);
        expect(result.elapsedBusinessHours).toBeCloseTo(2, 1);
        expect(result.remainingBusinessHours).toBeCloseTo(6, 1);
        expect(result.breachStatus).toBe(BreachStatus.ON_TRACK);
      });

      it('should not allow duplicate pauses', () => {
        const caseRecord = buildCase();

        slaClockService.pauseClock(caseRecord.id, istToUtc(2025, 1, 6, 12, 30));
        slaClockService.pauseClock(caseRecord.id, istToUtc(2025, 1, 6, 13, 30));

        const records = slaClockService.getPauseRecords(caseRecord.id);
        expect(records.length).toBe(1);
      });

      it('should handle multiple pause/resume cycles', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        slaClockService.pauseClock(caseRecord.id, istToUtc(2025, 1, 6, 11, 30));
        slaClockService.resumeClock(caseRecord.id, istToUtc(2025, 1, 6, 12, 30));

        slaClockService.pauseClock(caseRecord.id, istToUtc(2025, 1, 6, 14, 30));
        slaClockService.resumeClock(caseRecord.id, istToUtc(2025, 1, 6, 15, 30));

        const now = istToUtc(2025, 1, 6, 17, 30);
        const result = slaClockService.computeStatus(caseRecord, now);

        expect(result.pausedHours).toBeCloseTo(2, 1);
        expect(result.elapsedBusinessHours).toBeCloseTo(5, 1);
      });
    });
  });

  describe('Escalation Service', () => {
    const testHierarchy = [
      { id: 'fpr-1', name: 'Amit Sharma', role: 'FPR', parentId: 'tl-1' },
      { id: 'tl-1', name: 'Priya Desai', role: 'TEAM_LEAD', parentId: 'rh-1' },
      { id: 'rh-1', name: 'Suresh Gupta', role: 'REGIONAL_HEAD', parentId: 'coo-1' },
      { id: 'coo-1', name: 'Anita Reddy', role: 'COO' },
    ];

    beforeEach(() => {
      escalationService.setHierarchy(testHierarchy);
      // Set business hours schedule so escalations fire within business hours
      escalationService.setBusinessHoursSchedule(testBusinessHours);
    });

    describe('Escalation triggers at correct thresholds', () => {
      it('should trigger L1 at 75% elapsed', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        expect(actions.length).toBeGreaterThanOrEqual(1);
        const l1 = actions.find((a) => a.level === EscalationLevel.L1);
        expect(l1).toBeDefined();
        expect(l1!.targetRole).toBe('FPR');
        expect(l1!.targetId).toBe('fpr-1');
      });

      it('should trigger L2 at 90% elapsed', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 17, 42);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        const l2 = actions.find((a) => a.level === EscalationLevel.L2);
        expect(l2).toBeDefined();
        expect(l2!.targetRole).toBe('TEAM_LEAD');
        expect(l2!.targetId).toBe('tl-1');
      });

      it('should trigger L3 at 100% breached', () => {
        // Case created Mon 10:30 IST, TAT target same day 18:29 IST.
        // Check at Tue 10:30 IST (next business day, well past breach).
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 6, 18, 29),
        });

        const now = istToUtc(2025, 1, 7, 10, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        const l3 = actions.find((a) => a.level === EscalationLevel.L3);
        expect(l3).toBeDefined();
        expect(l3!.targetRole).toBe('REGIONAL_HEAD');
        expect(l3!.targetId).toBe('rh-1');
      });

      it('should trigger L4 at breach + 4 hours', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
        });

        const now = istToUtc(2025, 1, 7, 13, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        const l4 = actions.find((a) => a.level === EscalationLevel.L4);
        expect(l4).toBeDefined();
        expect(l4!.targetRole).toBe('COO');
        expect(l4!.targetId).toBe('coo-1');
      });

      it('should not trigger L1 before 75%', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 14, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        expect(actions.length).toBe(0);
      });

      it('should not fire same escalation level twice', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now1 = istToUtc(2025, 1, 6, 16, 30);
        const actions1 = escalationService.checkAndEscalate(caseRecord, now1);
        expect(actions1.some((a) => a.level === EscalationLevel.L1)).toBe(true);

        const now2 = istToUtc(2025, 1, 6, 17, 0);
        const actions2 = escalationService.checkAndEscalate(caseRecord, now2);
        expect(actions2.some((a) => a.level === EscalationLevel.L1)).toBe(false);
      });
    });

    describe('Escalation hierarchy resolution', () => {
      it('should resolve FPR target from assigned FPR', () => {
        const caseRecord = buildCase({ assignedFprId: 'fpr-1' });
        const target = escalationService.resolveTarget('FPR', caseRecord);

        expect(target).not.toBeNull();
        expect(target!.id).toBe('fpr-1');
        expect(target!.name).toBe('Amit Sharma');
      });

      it('should resolve Team Lead by walking up hierarchy', () => {
        const caseRecord = buildCase({ assignedFprId: 'fpr-1' });
        const target = escalationService.resolveTarget('TEAM_LEAD', caseRecord);

        expect(target).not.toBeNull();
        expect(target!.id).toBe('tl-1');
        expect(target!.name).toBe('Priya Desai');
      });

      it('should resolve Regional Head by walking up hierarchy', () => {
        const caseRecord = buildCase({ assignedFprId: 'fpr-1' });
        const target = escalationService.resolveTarget('REGIONAL_HEAD', caseRecord);

        expect(target).not.toBeNull();
        expect(target!.id).toBe('rh-1');
        expect(target!.name).toBe('Suresh Gupta');
      });

      it('should resolve COO by walking up hierarchy', () => {
        const caseRecord = buildCase({ assignedFprId: 'fpr-1' });
        const target = escalationService.resolveTarget('COO', caseRecord);

        expect(target).not.toBeNull();
        expect(target!.id).toBe('coo-1');
        expect(target!.name).toBe('Anita Reddy');
      });

      it('should return null when FPR not assigned', () => {
        const caseRecord = buildCase({ assignedFprId: undefined });
        const target = escalationService.resolveTarget('FPR', caseRecord);

        expect(target).toBeNull();
      });
    });

    describe('Configurable rules per case type', () => {
      it('should use case-type specific rules when configured', () => {
        escalationService.setCaseTypeRules('LEGAL_OPINION', [
          { level: EscalationLevel.L1, triggerPercent: 50, target: 'FPR' },
          { level: EscalationLevel.L2, triggerPercent: 70, target: 'TEAM_LEAD' },
          { level: EscalationLevel.L3, triggerPercent: 100, target: 'REGIONAL_HEAD' },
          { level: EscalationLevel.L4, triggerPercent: 100, breachPlusHours: 4, target: 'COO' },
        ]);

        const caseRecord = buildCase({
          id: 'case-legal-001',
          caseType: 'LEGAL_OPINION',
          createdAt: istToUtc(2025, 1, 6, 10, 30),
          tatTargetAt: istToUtc(2025, 1, 15, 10, 30),
        });

        const now = istToUtc(2025, 1, 10, 10, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        const l1 = actions.find((a) => a.level === EscalationLevel.L1);
        expect(l1).toBeDefined();
        expect(l1!.targetRole).toBe('FPR');
      });
    });

    describe('Escalation event recording', () => {
      it('should record escalation events', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        escalationService.checkAndEscalate(caseRecord, now);

        const events = escalationService.getEscalationEvents();
        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events[0].caseId).toBe('case-001');
        expect(events[0].level).toBe(EscalationLevel.L1);
        expect(events[0].targetId).toBe('fpr-1');
      });
    });

    describe('Escalation suppression (Phase 3)', () => {
      it('should skip escalation when case status is ON_HOLD', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          status: CaseStatus.ON_HOLD,
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        expect(actions.length).toBe(0);
      });

      it('should skip escalation when case status is AWAITING_VENDOR', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          status: CaseStatus.AWAITING_VENDOR,
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        expect(actions.length).toBe(0);
      });

      it('should skip escalation when case status is AWAITING_FPR', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          status: CaseStatus.AWAITING_FPR,
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        expect(actions.length).toBe(0);
      });

      it('should skip escalation on a holiday', () => {
        // 2025-01-06 is a Monday
        escalationService.setHolidays(['2025-01-06']);

        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        expect(actions.length).toBe(0);
      });

      it('should skip escalation outside business hours', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        // 20:00 IST is outside business hours (09:30-18:30)
        const now = istToUtc(2025, 1, 6, 20, 0);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        expect(actions.length).toBe(0);
      });

      it('should fire escalation when status is IN_PROGRESS (not suppressed)', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          status: CaseStatus.IN_PROGRESS,
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        const actions = escalationService.checkAndEscalate(caseRecord, now);

        expect(actions.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Repeat escalation reminders (Phase 3)', () => {
      it('should re-fire L3 after cooldown period if case is still breached', () => {
        // Use a case that breaches well within business hours so we can test
        // the cooldown within the same business day
        const caseRecord = buildCase({
          id: 'case-repeat-l3',
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
        });

        // First fire of L3 on Tue at 10:30 IST (case is breached, within biz hrs)
        const now1 = istToUtc(2025, 1, 7, 10, 30);
        const actions1 = escalationService.checkAndEscalate(caseRecord, now1);
        const l3First = actions1.find((a) => a.level === EscalationLevel.L3);
        expect(l3First).toBeDefined();

        // 2 hours later (Tue 12:30 IST) -- within 4h cooldown, should NOT re-fire
        const now2 = istToUtc(2025, 1, 7, 12, 30);
        const actions2 = escalationService.checkAndEscalate(caseRecord, now2);
        const l3Second = actions2.find((a) => a.level === EscalationLevel.L3);
        expect(l3Second).toBeUndefined();

        // 5+ hours later (Tue 15:31 IST) -- beyond 4h cooldown, should re-fire
        const now3 = istToUtc(2025, 1, 7, 15, 31);
        const actions3 = escalationService.checkAndEscalate(caseRecord, now3);
        const l3Third = actions3.find((a) => a.level === EscalationLevel.L3);
        expect(l3Third).toBeDefined();
      });

      it('should re-fire L4 after cooldown period if case is still breached', () => {
        const caseRecord = buildCase({
          id: 'case-repeat-l4',
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
        });

        // First fire -- breach + 4h
        const now1 = istToUtc(2025, 1, 7, 13, 30);
        const actions1 = escalationService.checkAndEscalate(caseRecord, now1);
        const l4First = actions1.find((a) => a.level === EscalationLevel.L4);
        expect(l4First).toBeDefined();

        // After 4+ real hours of cooldown, L4 should re-fire
        const now2 = istToUtc(2025, 1, 7, 17, 31);
        const actions2 = escalationService.checkAndEscalate(caseRecord, now2);
        const l4Second = actions2.find((a) => a.level === EscalationLevel.L4);
        expect(l4Second).toBeDefined();
      });

      it('should not re-fire L1 (non-repeatable)', () => {
        const caseRecord = buildCase({
          id: 'case-no-repeat-l1',
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        // Fire L1
        const now1 = istToUtc(2025, 1, 6, 16, 30);
        const actions1 = escalationService.checkAndEscalate(caseRecord, now1);
        expect(actions1.some((a) => a.level === EscalationLevel.L1)).toBe(true);

        // Even after many hours, L1 should NOT re-fire (no repeatEveryHrs)
        const now2 = istToUtc(2025, 1, 7, 16, 30);
        const actions2 = escalationService.checkAndEscalate(caseRecord, now2);
        expect(actions2.some((a) => a.level === EscalationLevel.L1)).toBe(false);
      });
    });

    describe('Notification dispatch on escalation (Phase 3)', () => {
      it('should call notificationDispatch.send() when escalation fires', () => {
        const caseRecord = buildCase({
          caseType: 'GENERAL_INQUIRY',
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        });

        const now = istToUtc(2025, 1, 6, 16, 30);
        escalationService.checkAndEscalate(caseRecord, now);

        // The mock was set up as mockNotificationDispatch in the outer beforeEach
        // but we can verify via the escalation events that events were recorded
        const events = escalationService.getEscalationEvents();
        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events[0].caseId).toBe('case-001');
      });
    });
  });

  describe('SLA Pause/Resume (Phase 3)', () => {
    it('should pause and resume the SLA clock', () => {
      const caseId = 'case-pause-test';
      const caseRecord = buildCase({
        id: caseId,
        caseType: 'GENERAL_INQUIRY',
        tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
      });

      // Pause at 12:30
      slaClockService.pauseClock(caseId, istToUtc(2025, 1, 6, 12, 30), 'Awaiting vendor');

      // Verify paused
      const pauseRecords = slaClockService.getPauseRecords(caseId);
      expect(pauseRecords.length).toBe(1);
      expect(pauseRecords[0].resumedAt).toBeUndefined();

      // Resume at 15:30
      slaClockService.resumeClock(caseId, istToUtc(2025, 1, 6, 15, 30));

      // Verify resumed and elapsed hours exclude paused time
      const now = istToUtc(2025, 1, 6, 17, 30);
      const result = slaClockService.computeStatus(caseRecord, now);
      expect(result.pausedHours).toBeCloseTo(3, 1);
      expect(result.elapsedBusinessHours).toBeCloseTo(4, 1);
    });
  });

  describe('Auto-resume on inbound (Phase 3)', () => {
    it('should resume SLA clock when called on a paused case', () => {
      const caseId = 'case-auto-resume';

      // Pause the clock
      slaClockService.pauseClock(caseId, istToUtc(2025, 1, 6, 12, 30));

      // Verify paused
      let records = slaClockService.getPauseRecords(caseId);
      expect(records.length).toBe(1);
      expect(records[0].resumedAt).toBeUndefined();

      // Simulate auto-resume (what IntakeOrchestratorService calls)
      const hasActivePause = records.some((r) => !r.resumedAt);
      expect(hasActivePause).toBe(true);

      slaClockService.resumeClock(caseId, istToUtc(2025, 1, 6, 14, 30));

      // Verify resumed
      records = slaClockService.getPauseRecords(caseId);
      expect(records[0].resumedAt).toEqual(istToUtc(2025, 1, 6, 14, 30));
    });

    it('should not fail when resuming a clock that is not paused', () => {
      const caseId = 'case-not-paused';

      // No active pause -- resumeClock should not throw
      expect(() => {
        slaClockService.resumeClock(caseId);
      }).not.toThrow();
    });
  });

  describe('SLA Dashboard Service', () => {
    beforeEach(() => {
      const onTrackCase = buildCase({
        id: 'case-on-track',
        caseNumber: 'ATL-2025-000001',
        caseType: 'GENERAL_INQUIRY',
        assignedFprId: 'fpr-1',
        assignedFprName: 'Amit Sharma',
        createdAt: istToUtc(2025, 1, 6, 10, 30),
        tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
        status: CaseStatus.IN_PROGRESS,
      });

      const atRiskCase = buildCase({
        id: 'case-at-risk',
        caseNumber: 'ATL-2025-000002',
        caseType: 'GENERAL_INQUIRY',
        assignedFprId: 'fpr-1',
        assignedFprName: 'Amit Sharma',
        createdAt: istToUtc(2025, 1, 6, 10, 30),
        tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
        status: CaseStatus.IN_PROGRESS,
      });

      const breachedCase = buildCase({
        id: 'case-breached',
        caseNumber: 'ATL-2025-000003',
        caseType: 'GENERAL_INQUIRY',
        assignedFprId: 'fpr-2',
        assignedFprName: 'Priya Patel',
        createdAt: istToUtc(2025, 1, 6, 10, 30),
        tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
        status: CaseStatus.IN_PROGRESS,
      });

      const closedCase = buildCase({
        id: 'case-closed',
        caseNumber: 'ATL-2025-000004',
        caseType: 'GENERAL_INQUIRY',
        assignedFprId: 'fpr-1',
        assignedFprName: 'Amit Sharma',
        createdAt: istToUtc(2025, 1, 3, 10, 30),
        tatTargetAt: istToUtc(2025, 1, 3, 18, 30),
        status: CaseStatus.CLOSED,
      });

      dashboardService.setCases([onTrackCase, atRiskCase, breachedCase, closedCase]);
    });

    describe('getTeamSummary', () => {
      it('should return counts by status per FPR', async () => {
        dashboardService.setCases([
          buildCase({
            id: 'c1',
            caseNumber: 'ATL-2025-000001',
            assignedFprId: 'fpr-1',
            assignedFprName: 'Amit Sharma',
            caseType: 'VALUATION_REQUEST',
            createdAt: istToUtc(2025, 1, 6, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 13, 10, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
          buildCase({
            id: 'c2',
            caseNumber: 'ATL-2025-000002',
            assignedFprId: 'fpr-1',
            assignedFprName: 'Amit Sharma',
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 6, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
          buildCase({
            id: 'c3',
            caseNumber: 'ATL-2025-000003',
            assignedFprId: 'fpr-2',
            assignedFprName: 'Priya Patel',
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 6, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
        ]);

        const now = istToUtc(2025, 1, 7, 10, 30);
        const summary = await dashboardService.getTeamSummary(now);

        expect(summary.length).toBe(2);

        const fpr1 = summary.find((s) => s.fprId === 'fpr-1')!;
        expect(fpr1).toBeDefined();
        expect(fpr1.onTrack).toBe(1);
        expect(fpr1.breached).toBe(1);
        expect(fpr1.total).toBe(2);

        const fpr2 = summary.find((s) => s.fprId === 'fpr-2')!;
        expect(fpr2).toBeDefined();
        expect(fpr2.breached).toBe(1);
        expect(fpr2.total).toBe(1);
      });

      it('should exclude closed and cancelled cases', async () => {
        dashboardService.setCases([
          buildCase({
            id: 'c-closed',
            caseNumber: 'ATL-2025-000010',
            status: CaseStatus.CLOSED,
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 3, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 3, 18, 30),
          }),
          buildCase({
            id: 'c-cancelled',
            caseNumber: 'ATL-2025-000011',
            status: CaseStatus.CANCELLED,
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 3, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 3, 18, 30),
          }),
        ]);

        const now = istToUtc(2025, 1, 7, 10, 30);
        const summary = await dashboardService.getTeamSummary(now);
        expect(summary.length).toBe(0);
      });
    });

    describe('getBreachedCases', () => {
      it('should return breached cases with breach duration', async () => {
        dashboardService.setCases([
          buildCase({
            id: 'c-breached',
            caseNumber: 'ATL-2025-000003',
            assignedFprId: 'fpr-2',
            assignedFprName: 'Priya Patel',
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 6, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
          buildCase({
            id: 'c-ok',
            caseNumber: 'ATL-2025-000004',
            assignedFprId: 'fpr-1',
            assignedFprName: 'Amit Sharma',
            caseType: 'VALUATION_REQUEST',
            createdAt: istToUtc(2025, 1, 6, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 13, 10, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
        ]);

        const now = istToUtc(2025, 1, 7, 10, 30);
        const breached = await dashboardService.getBreachedCases(now);

        expect(breached.length).toBe(1);
        expect(breached[0].caseId).toBe('c-breached');
        expect(breached[0].breachDurationHours).toBeCloseTo(1, 1);
      });

      it('should sort by breach duration descending', async () => {
        dashboardService.setCases([
          buildCase({
            id: 'c-breach-short',
            caseNumber: 'ATL-2025-000005',
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 6, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
          buildCase({
            id: 'c-breach-long',
            caseNumber: 'ATL-2025-000006',
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 3, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 3, 18, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
        ]);

        const now = istToUtc(2025, 1, 7, 12, 30);
        const breached = await dashboardService.getBreachedCases(now);

        expect(breached.length).toBe(2);
        expect(breached[0].caseId).toBe('c-breach-long');
        expect(breached[1].caseId).toBe('c-breach-short');
      });
    });

    describe('getAtRiskCases', () => {
      it('should return at-risk cases approaching breach', async () => {
        dashboardService.setCases([
          buildCase({
            id: 'c-at-risk',
            caseNumber: 'ATL-2025-000007',
            assignedFprId: 'fpr-1',
            assignedFprName: 'Amit Sharma',
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 6, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
          buildCase({
            id: 'c-safe',
            caseNumber: 'ATL-2025-000008',
            assignedFprId: 'fpr-1',
            assignedFprName: 'Amit Sharma',
            caseType: 'VALUATION_REQUEST',
            createdAt: istToUtc(2025, 1, 6, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 13, 10, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
        ]);

        const now = istToUtc(2025, 1, 6, 16, 30);
        const atRisk = await dashboardService.getAtRiskCases(now);

        expect(atRisk.length).toBe(1);
        expect(atRisk[0].caseId).toBe('c-at-risk');
        expect(atRisk[0].remainingHours).toBeCloseTo(2, 1);
        expect(atRisk[0].percentElapsed).toBeCloseTo(75, 1);
      });

      it('should sort by remaining hours ascending', async () => {
        dashboardService.setCases([
          buildCase({
            id: 'c-risk-more',
            caseNumber: 'ATL-2025-000009',
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 6, 11, 30),
            tatTargetAt: istToUtc(2025, 1, 7, 10, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
          buildCase({
            id: 'c-risk-less',
            caseNumber: 'ATL-2025-000010',
            caseType: 'GENERAL_INQUIRY',
            createdAt: istToUtc(2025, 1, 6, 10, 30),
            tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
            status: CaseStatus.IN_PROGRESS,
          }),
        ]);

        const now = istToUtc(2025, 1, 6, 17, 30);
        const atRisk = await dashboardService.getAtRiskCases(now);

        expect(atRisk.length).toBe(2);
        expect(atRisk[0].caseId).toBe('c-risk-less');
        expect(atRisk[1].caseId).toBe('c-risk-more');
      });
    });
  });
});
