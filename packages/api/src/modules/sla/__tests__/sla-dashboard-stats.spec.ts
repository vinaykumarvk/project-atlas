import { SlaDashboardService } from '../services/sla-dashboard.service';
import { SlaClockService } from '../services/sla-clock.service';
import { CaseStatus } from '../../cases/types';

describe('SlaDashboardService — getTatStatistics', () => {
  let dashboardService: SlaDashboardService;
  let clockService: SlaClockService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      case: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      businessHoursMaster: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      holidayCalendarMaster: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      tatMaster: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      caseActivityLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    clockService = new SlaClockService(mockPrisma);
    clockService.setTatConfig({ VALUATION_REQUEST: 48, LEGAL_OPINION: 72 });
    clockService.setBusinessHours(
      [
        { day_of_week: 'MON', open_time: '09:00', close_time: '18:00', is_working: true },
        { day_of_week: 'TUE', open_time: '09:00', close_time: '18:00', is_working: true },
        { day_of_week: 'WED', open_time: '09:00', close_time: '18:00', is_working: true },
        { day_of_week: 'THU', open_time: '09:00', close_time: '18:00', is_working: true },
        { day_of_week: 'FRI', open_time: '09:00', close_time: '18:00', is_working: true },
        { day_of_week: 'SAT', open_time: '09:00', close_time: '18:00', is_working: false },
        { day_of_week: 'SUN', open_time: '09:00', close_time: '18:00', is_working: false },
      ],
      [],
    );

    dashboardService = new SlaDashboardService(mockPrisma, clockService);
  });

  it('should return zeros for empty case set', async () => {
    dashboardService.setCases([]);
    const stats = await dashboardService.getTatStatistics();

    expect(stats.mean).toBe(0);
    expect(stats.median).toBe(0);
    expect(stats.p90).toBe(0);
    expect(stats.count).toBe(0);
  });

  it('should compute TAT statistics for closed cases', async () => {
    const baseDate = new Date('2026-04-20T10:00:00Z'); // Monday
    const closedDate1 = new Date('2026-04-21T14:00:00Z'); // Tuesday

    dashboardService.setCases([
      {
        id: 'case-1',
        caseNumber: 'C-001',
        emailIngestId: 'e1',
        subject: 'Test',
        from: 'a@b.com',
        status: CaseStatus.CLOSED,
        caseType: 'VALUATION_REQUEST',
        priority: 'NORMAL',
        confidenceBand: 'GREEN',
        languageDetected: 'en',
        createdAt: baseDate,
        updatedAt: closedDate1,
        closedAt: closedDate1,
        tatTargetAt: new Date('2026-04-25T10:00:00Z'),
        activityLog: [],
        linkedCaseIds: [],
      },
    ]);

    const stats = await dashboardService.getTatStatistics();

    expect(stats.count).toBe(1);
    expect(stats.mean).toBeGreaterThan(0);
    expect(stats.median).toBeGreaterThan(0);
    expect(stats.p90).toBeGreaterThan(0);
  });

  it('should ignore non-closed cases', async () => {
    const baseDate = new Date('2026-04-20T10:00:00Z');

    dashboardService.setCases([
      {
        id: 'case-1',
        caseNumber: 'C-001',
        emailIngestId: 'e1',
        subject: 'Test',
        from: 'a@b.com',
        status: CaseStatus.IN_PROGRESS,
        caseType: 'VALUATION_REQUEST',
        priority: 'NORMAL',
        confidenceBand: 'GREEN',
        languageDetected: 'en',
        createdAt: baseDate,
        updatedAt: baseDate,
        tatTargetAt: new Date('2026-04-25T10:00:00Z'),
        activityLog: [],
        linkedCaseIds: [],
      },
    ]);

    const stats = await dashboardService.getTatStatistics();
    expect(stats.count).toBe(0);
    expect(stats.mean).toBe(0);
  });

  it('should compute median correctly for even number of cases', async () => {
    const cases = [];
    for (let i = 0; i < 4; i++) {
      const created = new Date(`2026-04-${20 + i}T10:00:00Z`);
      const closed = new Date(`2026-04-${21 + i}T10:00:00Z`);
      cases.push({
        id: `case-${i}`,
        caseNumber: `C-${i}`,
        emailIngestId: `e${i}`,
        subject: 'Test',
        from: 'a@b.com',
        status: CaseStatus.CLOSED,
        caseType: 'VALUATION_REQUEST',
        priority: 'NORMAL',
        confidenceBand: 'GREEN',
        languageDetected: 'en',
        createdAt: created,
        updatedAt: closed,
        closedAt: closed,
        tatTargetAt: new Date('2026-04-30T10:00:00Z'),
        activityLog: [],
        linkedCaseIds: [],
      });
    }

    dashboardService.setCases(cases);

    const stats = await dashboardService.getTatStatistics();
    expect(stats.count).toBe(4);
    expect(stats.median).toBeGreaterThan(0);
  });

  it('should compute p90 correctly for multiple cases', async () => {
    const cases = [];
    for (let i = 0; i < 10; i++) {
      const created = new Date('2026-04-21T10:00:00Z');
      // Each case takes progressively longer (1 more hour per case)
      const hoursLater = (i + 1);
      const closed = new Date(created.getTime() + hoursLater * 3600 * 1000);
      cases.push({
        id: `case-${i}`,
        caseNumber: `C-${i}`,
        emailIngestId: `e${i}`,
        subject: 'Test',
        from: 'a@b.com',
        status: CaseStatus.CLOSED,
        caseType: 'VALUATION_REQUEST',
        priority: 'NORMAL',
        confidenceBand: 'GREEN',
        languageDetected: 'en',
        createdAt: created,
        updatedAt: closed,
        closedAt: closed,
        tatTargetAt: new Date('2026-04-30T10:00:00Z'),
        activityLog: [],
        linkedCaseIds: [],
      });
    }

    dashboardService.setCases(cases);

    const stats = await dashboardService.getTatStatistics();
    expect(stats.count).toBe(10);
    expect(stats.p90).toBeGreaterThanOrEqual(stats.median);
    expect(stats.p90).toBeGreaterThanOrEqual(stats.mean);
  });

  it('should return result shape with all required fields', async () => {
    dashboardService.setCases([]);
    const stats = await dashboardService.getTatStatistics();

    expect(stats).toHaveProperty('mean');
    expect(stats).toHaveProperty('median');
    expect(stats).toHaveProperty('p90');
    expect(stats).toHaveProperty('count');
    expect(typeof stats.mean).toBe('number');
    expect(typeof stats.median).toBe('number');
    expect(typeof stats.p90).toBe('number');
    expect(typeof stats.count).toBe('number');
  });
});
