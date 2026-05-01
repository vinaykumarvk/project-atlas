import { Test, TestingModule } from '@nestjs/testing';
import { SlaClockService, BreachStatus } from '../services/sla-clock.service';
import { SlaDashboardService } from '../services/sla-dashboard.service';
import { EscalationService } from '../services/escalation.service';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { CaseRecord, CaseStatus } from '../../cases/types';
import { BusinessHoursConfig, Holiday } from '../../../common/utils/business-hours';
import { SlaController } from '../controllers/sla.controller';
import { WebhookDispatcherService } from '../../webhooks/services/webhook-dispatcher.service';
import { BusinessValueService } from '../services/business-value.service';

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

function istToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const istMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(istMs - 5.5 * 60 * 60 * 1000);
}

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
    createdAt: istToUtc(2025, 1, 6, 10, 30),
    updatedAt: istToUtc(2025, 1, 6, 10, 30),
    activityLog: [],
    linkedCaseIds: [],
    ...overrides,
  };
}

describe('Dashboard Round 2 — Extended, Compliance, Trends', () => {
  let slaClockService: SlaClockService;
  let dashboardService: SlaDashboardService;
  let controller: SlaController;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const mockNotificationDispatch = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const mockWebhookDispatcher = {
      dispatch: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlaController],
      providers: [
        SlaClockService,
        EscalationService,
        SlaDashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationDispatchService, useValue: mockNotificationDispatch },
        { provide: WebhookDispatcherService, useValue: mockWebhookDispatcher },
        { provide: BusinessValueService, useValue: { getBusinessValueSummary: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    slaClockService = module.get(SlaClockService);
    dashboardService = module.get(SlaDashboardService);
    controller = module.get(SlaController);

    // Skip DB load on startup for unit tests
    const escalationService = module.get(EscalationService);
    escalationService.setSkipStartupLoad(true);

    // Configure test business hours
    slaClockService.setBusinessHours(testBusinessHours, testHolidays);
    slaClockService.setTatConfig({
      GENERAL_INQUIRY: 8,
      VALUATION_REQUEST: 48,
      LEGAL_OPINION: 72,
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Extended Dashboard (FR-110 A1)
  // ─────────────────────────────────────────────────────────────

  describe('getExtendedDashboard', () => {
    it('should return top FPRs by open case count', async () => {
      dashboardService.setCases([
        buildCase({ id: 'c1', assignedFprId: 'fpr-1', assignedFprName: 'Amit Sharma' }),
        buildCase({ id: 'c2', assignedFprId: 'fpr-1', assignedFprName: 'Amit Sharma' }),
        buildCase({ id: 'c3', assignedFprId: 'fpr-2', assignedFprName: 'Priya Patel' }),
      ]);

      const result = await dashboardService.getExtendedDashboard();

      expect(result.casesByFpr).toHaveLength(2);
      expect(result.casesByFpr[0].fprName).toBe('Amit Sharma');
      expect(result.casesByFpr[0].count).toBe(2);
      expect(result.casesByFpr[1].fprName).toBe('Priya Patel');
      expect(result.casesByFpr[1].count).toBe(1);
    });

    it('should return top vendors by open case count', async () => {
      dashboardService.setCases([
        buildCase({ id: 'c1', assignedVendorId: 'v-1' }),
        buildCase({ id: 'c2', assignedVendorId: 'v-1' }),
        buildCase({ id: 'c3', assignedVendorId: 'v-2' }),
        buildCase({ id: 'c4' }), // no vendor
      ]);

      const result = await dashboardService.getExtendedDashboard();

      expect(result.casesByVendor).toHaveLength(2);
      expect(result.casesByVendor[0].vendorId).toBe('v-1');
      expect(result.casesByVendor[0].count).toBe(2);
      expect(result.casesByVendor[1].vendorId).toBe('v-2');
      expect(result.casesByVendor[1].count).toBe(1);
    });

    it('should return queue by case type', async () => {
      dashboardService.setCases([
        buildCase({ id: 'c1', caseType: 'GENERAL_INQUIRY' }),
        buildCase({ id: 'c2', caseType: 'GENERAL_INQUIRY' }),
        buildCase({ id: 'c3', caseType: 'VALUATION_REQUEST' }),
        buildCase({ id: 'c4', caseType: 'LEGAL_OPINION' }),
      ]);

      const result = await dashboardService.getExtendedDashboard();

      expect(result.queueByType).toHaveLength(3);
      expect(result.queueByType[0].caseType).toBe('GENERAL_INQUIRY');
      expect(result.queueByType[0].count).toBe(2);
    });

    it('should limit FPRs to top 5', async () => {
      const cases = [];
      for (let i = 0; i < 7; i++) {
        cases.push(
          buildCase({
            id: `c-fpr-${i}`,
            assignedFprId: `fpr-${i}`,
            assignedFprName: `FPR ${i}`,
          }),
        );
      }
      dashboardService.setCases(cases);

      const result = await dashboardService.getExtendedDashboard();
      expect(result.casesByFpr).toHaveLength(5);
    });

    it('should exclude closed/cancelled cases', async () => {
      dashboardService.setCases([
        buildCase({ id: 'c1', status: CaseStatus.CLOSED }),
        buildCase({ id: 'c2', status: CaseStatus.CANCELLED }),
        buildCase({ id: 'c3', status: CaseStatus.IN_PROGRESS }),
      ]);

      const result = await dashboardService.getExtendedDashboard();
      expect(result.casesByFpr).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Compliance Analytics (FR-111 A2)
  // ─────────────────────────────────────────────────────────────

  describe('getComplianceByDimension', () => {
    it('should compute compliance by case type', async () => {
      dashboardService.setCases([
        // Closed within TAT
        buildCase({
          id: 'c1',
          caseType: 'GENERAL_INQUIRY',
          status: CaseStatus.CLOSED,
          createdAt: istToUtc(2025, 1, 6, 10, 30),
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
          closedAt: istToUtc(2025, 1, 6, 14, 30),
        }),
        // Closed after TAT breach
        buildCase({
          id: 'c2',
          caseType: 'GENERAL_INQUIRY',
          status: CaseStatus.CLOSED,
          createdAt: istToUtc(2025, 1, 6, 10, 30),
          tatTargetAt: istToUtc(2025, 1, 6, 18, 30),
          closedAt: istToUtc(2025, 1, 8, 10, 30),
        }),
      ]);

      const now = istToUtc(2025, 1, 9, 10, 30);
      const result = await dashboardService.getComplianceByDimension(now);

      expect(result.byType['GENERAL_INQUIRY']).toBe(50);
    });

    it('should compute compliance by FPR', async () => {
      dashboardService.setCases([
        buildCase({
          id: 'c1',
          assignedFprName: 'Amit Sharma',
          status: CaseStatus.CLOSED,
          createdAt: istToUtc(2025, 1, 6, 10, 30),
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
          closedAt: istToUtc(2025, 1, 6, 14, 30),
        }),
        buildCase({
          id: 'c2',
          assignedFprName: 'Amit Sharma',
          status: CaseStatus.CLOSED,
          createdAt: istToUtc(2025, 1, 6, 10, 30),
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
          closedAt: istToUtc(2025, 1, 6, 15, 30),
        }),
      ]);

      const now = istToUtc(2025, 1, 9, 10, 30);
      const result = await dashboardService.getComplianceByDimension(now);

      expect(result.byFpr['Amit Sharma']).toBe(100);
    });

    it('should return empty records when no closed cases exist', async () => {
      dashboardService.setCases([
        buildCase({ id: 'c1', status: CaseStatus.IN_PROGRESS }),
      ]);

      const result = await dashboardService.getComplianceByDimension();

      expect(Object.keys(result.byType)).toHaveLength(0);
      expect(Object.keys(result.byFpr)).toHaveLength(0);
    });

    it('should handle compliance by vendor', async () => {
      dashboardService.setCases([
        buildCase({
          id: 'c1',
          assignedVendorId: 'v-1',
          status: CaseStatus.CLOSED,
          createdAt: istToUtc(2025, 1, 6, 10, 30),
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
          closedAt: istToUtc(2025, 1, 6, 14, 30),
        }),
      ]);

      const now = istToUtc(2025, 1, 9, 10, 30);
      const result = await dashboardService.getComplianceByDimension(now);

      expect(result.byVendor['v-1']).toBe(100);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Trend Data (FR-111 A4)
  // ─────────────────────────────────────────────────────────────

  describe('getTrendData', () => {
    it('should return 30 data points', async () => {
      dashboardService.setCases([]);

      const now = istToUtc(2025, 1, 31, 10, 30);
      const trends = await dashboardService.getTrendData(now);

      expect(trends).toHaveLength(30);
    });

    it('should count new cases on their creation date', async () => {
      const createdDate = istToUtc(2025, 1, 20, 10, 30);
      dashboardService.setCases([
        buildCase({ id: 'c1', createdAt: createdDate }),
        buildCase({ id: 'c2', createdAt: createdDate }),
      ]);

      const now = istToUtc(2025, 1, 31, 10, 30);
      const trends = await dashboardService.getTrendData(now);

      const dateStr = createdDate.toISOString().slice(0, 10);
      const point = trends.find((t) => t.date === dateStr);
      expect(point).toBeDefined();
      expect(point!.newCases).toBe(2);
    });

    it('should count resolved cases on their closed date', async () => {
      const closedDate = istToUtc(2025, 1, 22, 14, 30);
      dashboardService.setCases([
        buildCase({
          id: 'c1',
          status: CaseStatus.CLOSED,
          createdAt: istToUtc(2025, 1, 20, 10, 30),
          closedAt: closedDate,
        }),
      ]);

      const now = istToUtc(2025, 1, 31, 10, 30);
      const trends = await dashboardService.getTrendData(now);

      const dateStr = closedDate.toISOString().slice(0, 10);
      const point = trends.find((t) => t.date === dateStr);
      expect(point).toBeDefined();
      expect(point!.resolved).toBe(1);
    });

    it('should include dates with zero activity', async () => {
      dashboardService.setCases([]);

      const now = istToUtc(2025, 1, 31, 10, 30);
      const trends = await dashboardService.getTrendData(now);

      // All points should have zero values
      for (const point of trends) {
        expect(point.newCases).toBe(0);
        expect(point.resolved).toBe(0);
        expect(point.breached).toBe(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Controller Endpoints
  // ─────────────────────────────────────────────────────────────

  describe('SlaController — new endpoints', () => {
    it('GET dashboard/extended — should return wrapped extended data', async () => {
      dashboardService.setCases([
        buildCase({ id: 'c1', caseType: 'GENERAL_INQUIRY' }),
        buildCase({ id: 'c2', caseType: 'VALUATION_REQUEST' }),
      ]);

      const response = await controller.getExtendedDashboard();

      expect(response.data).toBeDefined();
      expect(response.data.queueByType).toBeDefined();
      expect(response.data.casesByFpr).toBeDefined();
      expect(response.data.casesByVendor).toBeDefined();
      expect(response.data.queueByType.length).toBe(2);
    });

    it('GET analytics/compliance — should return wrapped compliance data', async () => {
      dashboardService.setCases([
        buildCase({
          id: 'c1',
          status: CaseStatus.CLOSED,
          createdAt: istToUtc(2025, 1, 6, 10, 30),
          tatTargetAt: istToUtc(2025, 1, 7, 9, 30),
          closedAt: istToUtc(2025, 1, 6, 14, 30),
        }),
      ]);

      const response = await controller.getComplianceByDimension();

      expect(response.data).toBeDefined();
      expect(response.data.byType).toBeDefined();
      expect(response.data.byFpr).toBeDefined();
      expect(response.data.byVendor).toBeDefined();
      expect(response.data.byRegion).toBeDefined();
    });

    it('GET analytics/trends — should return wrapped trend data', async () => {
      dashboardService.setCases([]);

      const response = await controller.getTrendData();

      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data).toHaveLength(30);
    });
  });
});
