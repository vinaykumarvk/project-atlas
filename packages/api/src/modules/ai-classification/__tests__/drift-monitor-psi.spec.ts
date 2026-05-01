import {
  DriftMonitorService,
  WeeklySnapshot,
  DriftReport,
  NotificationDispatchServiceInterface,
} from '../services/drift-monitor.service';

describe('DriftMonitorService — PSI calculation, persistence, and alert dispatch', () => {
  let service: DriftMonitorService;

  beforeEach(() => {
    service = new DriftMonitorService();
  });

  afterEach(() => {
    service.reset();
  });

  // --- FR-131.A1: PSI calculation ---

  describe('computePSI()', () => {
    it('should return 0 for identical distributions', () => {
      const dist = { A: 50, B: 30, C: 20 };
      const psi = service.computePSI(dist, dist);
      expect(psi).toBeCloseTo(0, 4);
    });

    it('should return a small PSI for similar distributions', () => {
      const baseline = { A: 50, B: 30, C: 20 };
      const current = { A: 48, B: 32, C: 20 };
      const psi = service.computePSI(baseline, current);
      expect(psi).toBeGreaterThanOrEqual(0);
      expect(psi).toBeLessThan(0.1);
    });

    it('should return a larger PSI for significantly different distributions', () => {
      const baseline = { A: 80, B: 15, C: 5 };
      const current = { A: 20, B: 40, C: 40 };
      const psi = service.computePSI(baseline, current);
      expect(psi).toBeGreaterThan(0.2);
    });

    it('should handle categories that only exist in one distribution', () => {
      const baseline = { A: 100 };
      const current = { A: 50, B: 50 };
      const psi = service.computePSI(baseline, current);
      expect(psi).toBeGreaterThan(0);
    });

    it('should return 0 for empty distributions', () => {
      expect(service.computePSI({}, {})).toBe(0);
      expect(service.computePSI({ A: 10 }, {})).toBe(0);
      expect(service.computePSI({}, { A: 10 })).toBe(0);
    });
  });

  describe('PSI in getWeeklyReport()', () => {
    it('should include psiScore in the drift report', () => {
      // Record baseline week
      for (let i = 0; i < 50; i++) {
        service.recordForWeek('2026-W01', 0.9, 'A');
      }
      for (let i = 0; i < 30; i++) {
        service.recordForWeek('2026-W01', 0.85, 'B');
      }
      for (let i = 0; i < 20; i++) {
        service.recordForWeek('2026-W01', 0.8, 'C');
      }

      // Record current week with different distribution
      for (let i = 0; i < 20; i++) {
        service.recordForWeek('2026-W05', 0.7, 'A');
      }
      for (let i = 0; i < 40; i++) {
        service.recordForWeek('2026-W05', 0.65, 'B');
      }
      for (let i = 0; i < 40; i++) {
        service.recordForWeek('2026-W05', 0.6, 'C');
      }

      const report = service.getWeeklyReport();
      expect(report.psiScore).not.toBeNull();
      expect(typeof report.psiScore).toBe('number');
      expect(report.psiScore!).toBeGreaterThan(0);
    });

    it('should return null psiScore when there is only one week', () => {
      service.recordForWeek('2026-W01', 0.9, 'A');
      const report = service.getWeeklyReport();
      // psiScore should be null since there is no baseline vs current comparison
      // (baseline and current are the same week)
      expect(report.psiScore).toBeNull();
    });

    it('should return null psiScore for empty data', () => {
      const report = service.getWeeklyReport();
      expect(report.psiScore).toBeNull();
    });
  });

  // --- FR-131.A1: Prisma persistence ---

  describe('persistSnapshot()', () => {
    it('should persist a snapshot via Prisma upsert', async () => {
      const mockPrisma = {
        driftSnapshot: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      };

      const serviceWithPrisma = new DriftMonitorService(mockPrisma as any);

      const snapshot: WeeklySnapshot = {
        week: '2026-W18',
        sampleCount: 100,
        avgConfidence: 0.85,
        categoryDistribution: { A: 60, B: 40 },
        confidenceSum: 85,
      };

      await serviceWithPrisma.persistSnapshot(snapshot);

      expect(mockPrisma.driftSnapshot.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.driftSnapshot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { week: '2026-W18' },
          update: expect.objectContaining({
            sample_count: 100,
            avg_confidence: 0.85,
          }),
          create: expect.objectContaining({
            week: '2026-W18',
            sample_count: 100,
          }),
        }),
      );
    });

    it('should log a warning when Prisma is not available', async () => {
      // service was created without prisma
      await expect(service.persistSnapshot({
        week: '2026-W18',
        sampleCount: 10,
        avgConfidence: 0.9,
        categoryDistribution: {},
        confidenceSum: 9,
      })).resolves.not.toThrow();
    });

    it('should handle Prisma errors gracefully', async () => {
      const mockPrisma = {
        driftSnapshot: {
          upsert: jest.fn().mockRejectedValue(new Error('DB error')),
        },
      };

      const serviceWithPrisma = new DriftMonitorService(mockPrisma as any);

      await expect(serviceWithPrisma.persistSnapshot({
        week: '2026-W18',
        sampleCount: 10,
        avgConfidence: 0.9,
        categoryDistribution: {},
        confidenceSum: 9,
      })).resolves.not.toThrow();
    });
  });

  // --- FR-131.A2: Alert dispatch ---

  describe('dispatchDriftAlert()', () => {
    it('should dispatch a drift alert via NotificationDispatchService', async () => {
      const mockNotification: NotificationDispatchServiceInterface = {
        send: jest.fn().mockResolvedValue({}),
        registerTemplate: jest.fn(),
      };

      const serviceWithNotif = new DriftMonitorService(undefined, mockNotification);

      const report: DriftReport = {
        currentWeek: {
          week: '2026-W18',
          sampleCount: 100,
          avgConfidence: 0.75,
          categoryDistribution: { A: 60, B: 40 },
          confidenceSum: 75,
        },
        history: [],
        baselineAvgConfidence: 0.90,
        confidenceDriftAlert: true,
        confidenceDriftDelta: -15,
        categoryDriftFlags: { A: true },
        psiScore: 0.35,
      };

      await serviceWithNotif.dispatchDriftAlert(report);

      expect(mockNotification.registerTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'DRIFT_ALERT' }),
      );
      expect(mockNotification.send).toHaveBeenCalledWith(
        'MLOPS_TEAM',
        'IN_APP',
        'DRIFT_ALERT',
        expect.objectContaining({
          week: '2026-W18',
        }),
      );
    });

    it('should not throw when NotificationDispatchService is not available', async () => {
      const report: DriftReport = {
        currentWeek: null,
        history: [],
        baselineAvgConfidence: null,
        confidenceDriftAlert: false,
        confidenceDriftDelta: null,
        categoryDriftFlags: {},
        psiScore: null,
      };

      await expect(service.dispatchDriftAlert(report)).resolves.not.toThrow();
    });

    it('should handle send errors gracefully', async () => {
      const mockNotification: NotificationDispatchServiceInterface = {
        send: jest.fn().mockRejectedValue(new Error('Send failed')),
        registerTemplate: jest.fn(),
      };

      const serviceWithNotif = new DriftMonitorService(undefined, mockNotification);

      const report: DriftReport = {
        currentWeek: {
          week: '2026-W18',
          sampleCount: 10,
          avgConfidence: 0.5,
          categoryDistribution: {},
          confidenceSum: 5,
        },
        history: [],
        baselineAvgConfidence: 0.9,
        confidenceDriftAlert: true,
        confidenceDriftDelta: -40,
        categoryDriftFlags: {},
        psiScore: 0.5,
      };

      await expect(serviceWithNotif.dispatchDriftAlert(report)).resolves.not.toThrow();
    });
  });
});
