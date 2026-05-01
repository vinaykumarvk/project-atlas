import { SlaClockService, BreachStatus, SlaClockResult } from '../services/sla-clock.service';
import { CaseStatus } from '../../cases/types';

describe('SlaClockService — getCountdown and warn_at_percent', () => {
  let service: SlaClockService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      case: {
        findUnique: jest.fn(),
      },
      caseActivityLog: {
        create: jest.fn().mockResolvedValue({}),
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
    };

    service = new SlaClockService(mockPrisma);
    service.setTatConfig({ VALUATION_REQUEST: 48 });
    service.setBusinessHours(
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
  });

  describe('getCountdownFromStatus()', () => {
    it('should compute countdown from SLA status', () => {
      const status: SlaClockResult = {
        caseId: 'case-1',
        totalBusinessHours: 48,
        elapsedBusinessHours: 12,
        remainingBusinessHours: 36,
        percentElapsed: 25,
        breachStatus: BreachStatus.ON_TRACK,
        pausedHours: 0,
      };

      const countdown = service.getCountdownFromStatus(status);

      expect(countdown.totalMs).toBe(48 * 3600 * 1000);
      expect(countdown.remainingMs).toBe(36 * 3600 * 1000);
      expect(countdown.percentUsed).toBe(25);
      expect(countdown.warningTriggered).toBe(false);
    });

    it('should trigger warning when percent used >= 80', () => {
      const status: SlaClockResult = {
        caseId: 'case-1',
        totalBusinessHours: 48,
        elapsedBusinessHours: 40,
        remainingBusinessHours: 8,
        percentElapsed: 83.33,
        breachStatus: BreachStatus.AT_RISK,
        pausedHours: 0,
      };

      const countdown = service.getCountdownFromStatus(status);
      expect(countdown.warningTriggered).toBe(true);
    });

    it('should not trigger warning when percent used < 80', () => {
      const status: SlaClockResult = {
        caseId: 'case-1',
        totalBusinessHours: 48,
        elapsedBusinessHours: 24,
        remainingBusinessHours: 24,
        percentElapsed: 50,
        breachStatus: BreachStatus.ON_TRACK,
        pausedHours: 0,
      };

      const countdown = service.getCountdownFromStatus(status);
      expect(countdown.warningTriggered).toBe(false);
    });

    it('should use configurable warn_at_percent', () => {
      service.setWarnAtPercent(60);

      const status: SlaClockResult = {
        caseId: 'case-1',
        totalBusinessHours: 48,
        elapsedBusinessHours: 30,
        remainingBusinessHours: 18,
        percentElapsed: 62.5,
        breachStatus: BreachStatus.ON_TRACK,
        pausedHours: 0,
      };

      const countdown = service.getCountdownFromStatus(status);
      expect(countdown.warningTriggered).toBe(true);
    });

    it('should always trigger warning when case is breached (100% used)', () => {
      const status: SlaClockResult = {
        caseId: 'case-1',
        totalBusinessHours: 48,
        elapsedBusinessHours: 48,
        remainingBusinessHours: 0,
        percentElapsed: 100,
        breachStatus: BreachStatus.BREACHED,
        pausedHours: 0,
      };

      const countdown = service.getCountdownFromStatus(status);
      expect(countdown.warningTriggered).toBe(true);
      expect(countdown.remainingMs).toBe(0);
    });
  });

  describe('getCountdown() — DB lookup', () => {
    it('should return zero remaining for non-existent case', async () => {
      mockPrisma.case.findUnique.mockResolvedValue(null);

      const countdown = await service.getCountdown('non-existent-id');
      expect(countdown.remainingMs).toBe(0);
      expect(countdown.totalMs).toBe(0);
      expect(countdown.percentUsed).toBe(100);
      expect(countdown.warningTriggered).toBe(true);
    });

    it('should return countdown for an existing case', async () => {
      const createdAt = new Date('2026-04-21T10:00:00Z');
      const tatTarget = new Date('2026-04-28T10:00:00Z');

      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-1',
        case_number: 'C-001',
        email_ingest_id: 'e1',
        ai_summary: 'Test case',
        status: 'IN_PROGRESS',
        case_type: 'VALUATION_REQUEST',
        priority: 'NORMAL',
        confidence_band: 'GREEN',
        assigned_fpr_id: null,
        assigned_fpr: null,
        assigned_vendor_id: null,
        tat_target_at: tatTarget,
        created_at: createdAt,
        updated_at: createdAt,
        closed_at: null,
      });

      const countdown = await service.getCountdown('case-1');

      expect(countdown).toHaveProperty('remainingMs');
      expect(countdown).toHaveProperty('totalMs');
      expect(countdown).toHaveProperty('percentUsed');
      expect(countdown).toHaveProperty('warningTriggered');
      expect(countdown.totalMs).toBeGreaterThan(0);
      expect(typeof countdown.warningTriggered).toBe('boolean');
    });
  });

  describe('warn_at_percent configuration', () => {
    it('should default to 80%', () => {
      const status: SlaClockResult = {
        caseId: 'case-1',
        totalBusinessHours: 100,
        elapsedBusinessHours: 79,
        remainingBusinessHours: 21,
        percentElapsed: 79,
        breachStatus: BreachStatus.ON_TRACK,
        pausedHours: 0,
      };

      const countdown = service.getCountdownFromStatus(status);
      expect(countdown.warningTriggered).toBe(false);

      const status80: SlaClockResult = { ...status, elapsedBusinessHours: 80, remainingBusinessHours: 20, percentElapsed: 80 };
      const countdown80 = service.getCountdownFromStatus(status80);
      expect(countdown80.warningTriggered).toBe(true);
    });

    it('should accept custom warn_at_percent values', () => {
      service.setWarnAtPercent(50);

      const status: SlaClockResult = {
        caseId: 'case-1',
        totalBusinessHours: 100,
        elapsedBusinessHours: 50,
        remainingBusinessHours: 50,
        percentElapsed: 50,
        breachStatus: BreachStatus.ON_TRACK,
        pausedHours: 0,
      };

      const countdown = service.getCountdownFromStatus(status);
      expect(countdown.warningTriggered).toBe(true);
    });

    it('should handle 0% warn_at_percent (always warn)', () => {
      service.setWarnAtPercent(0);

      const status: SlaClockResult = {
        caseId: 'case-1',
        totalBusinessHours: 100,
        elapsedBusinessHours: 0,
        remainingBusinessHours: 100,
        percentElapsed: 0,
        breachStatus: BreachStatus.ON_TRACK,
        pausedHours: 0,
      };

      const countdown = service.getCountdownFromStatus(status);
      expect(countdown.warningTriggered).toBe(true);
    });

    it('should handle 100% warn_at_percent (only warn at breach)', () => {
      service.setWarnAtPercent(100);

      const status99: SlaClockResult = {
        caseId: 'case-1',
        totalBusinessHours: 100,
        elapsedBusinessHours: 99,
        remainingBusinessHours: 1,
        percentElapsed: 99,
        breachStatus: BreachStatus.AT_RISK,
        pausedHours: 0,
      };

      const countdown99 = service.getCountdownFromStatus(status99);
      expect(countdown99.warningTriggered).toBe(false);

      const status100: SlaClockResult = {
        ...status99,
        elapsedBusinessHours: 100,
        remainingBusinessHours: 0,
        percentElapsed: 100,
        breachStatus: BreachStatus.BREACHED,
      };

      const countdown100 = service.getCountdownFromStatus(status100);
      expect(countdown100.warningTriggered).toBe(true);
    });
  });
});
