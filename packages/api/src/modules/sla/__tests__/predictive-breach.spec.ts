import { Test, TestingModule } from '@nestjs/testing';
import {
  PredictiveBreachService,
  BreachPrediction,
  CaseDataInput,
} from '../services/predictive-breach.service';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('PredictiveBreachService', () => {
  let service: PredictiveBreachService;
  let dispatchService: NotificationDispatchService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    mockPrisma.notificationLog.create.mockResolvedValue({
      id: 'mock-id',
      created_at: new Date(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictiveBreachService,
        NotificationDispatchService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(PredictiveBreachService);
    dispatchService = module.get(NotificationDispatchService);
  });

  describe('computeBreachProbability (FR-062.A1)', () => {
    it('should return low probability for new case with lots of time remaining', async () => {
      const caseData: CaseDataInput = {
        caseId: 'case-1',
        ageHours: 2,
        tatTotalHours: 48,
        priority: 'LOW',
      };

      const prediction = await service.computeBreachProbability(caseData);

      expect(prediction.caseId).toBe('case-1');
      expect(prediction.pBreach).toBeLessThan(0.3);
      expect(prediction.riskFactors).not.toContain('HIGH_TIME_CONSUMED');
      expect(prediction.predictedBreachAt).toBeUndefined();
    });

    it('should return high probability for case consuming most of its TAT', async () => {
      const caseData: CaseDataInput = {
        caseId: 'case-2',
        ageHours: 40,
        tatTotalHours: 48,
        priority: 'CRITICAL',
        assigneeWorkload: 15,
      };

      const prediction = await service.computeBreachProbability(caseData);

      expect(prediction.pBreach).toBeGreaterThan(0.5);
      expect(prediction.riskFactors).toContain('HIGH_TIME_CONSUMED');
      expect(prediction.riskFactors).toContain('CRITICAL_PRIORITY');
      expect(prediction.riskFactors).toContain('HIGH_WORKLOAD');
      expect(prediction.predictedBreachAt).toBeDefined();
    });

    it('should add HIGH_TIME_CONSUMED when timeRatio > 0.7', async () => {
      const prediction = await service.computeBreachProbability({
        caseId: 'case-3',
        ageHours: 36,
        tatTotalHours: 48,
        priority: 'NORMAL',
      });

      expect(prediction.riskFactors).toContain('HIGH_TIME_CONSUMED');
    });

    it('should add CRITICAL_PRIORITY for CRITICAL priority cases', async () => {
      const prediction = await service.computeBreachProbability({
        caseId: 'case-4',
        ageHours: 5,
        tatTotalHours: 48,
        priority: 'CRITICAL',
      });

      expect(prediction.riskFactors).toContain('CRITICAL_PRIORITY');
    });

    it('should add HIGH_WORKLOAD when assigneeWorkload > 10', async () => {
      const prediction = await service.computeBreachProbability({
        caseId: 'case-5',
        ageHours: 5,
        tatTotalHours: 48,
        priority: 'NORMAL',
        assigneeWorkload: 12,
      });

      expect(prediction.riskFactors).toContain('HIGH_WORKLOAD');
    });

    it('should cap pBreach at 1.0', async () => {
      const prediction = await service.computeBreachProbability({
        caseId: 'case-6',
        ageHours: 100,
        tatTotalHours: 48,
        priority: 'CRITICAL',
        assigneeWorkload: 20,
      });

      expect(prediction.pBreach).toBeLessThanOrEqual(1);
    });

    it('should return pBreach rounded to 2 decimal places', async () => {
      const prediction = await service.computeBreachProbability({
        caseId: 'case-7',
        ageHours: 20,
        tatTotalHours: 48,
        priority: 'HIGH',
      });

      const decimalPlaces = prediction.pBreach.toString().split('.')[1]?.length || 0;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('should handle zero tatTotalHours gracefully', async () => {
      const prediction = await service.computeBreachProbability({
        caseId: 'case-8',
        ageHours: 10,
        tatTotalHours: 0,
        priority: 'NORMAL',
      });

      expect(prediction.pBreach).toBeGreaterThanOrEqual(0);
      expect(prediction.pBreach).toBeLessThanOrEqual(1);
    });
  });

  describe('getAtRiskCases (FR-062.A1)', () => {
    it('should return cases with pBreach above default threshold (0.5)', async () => {
      service.setMockCases([
        { caseId: 'c1', ageHours: 2, tatTotalHours: 48, priority: 'LOW' },
        { caseId: 'c2', ageHours: 44, tatTotalHours: 48, priority: 'CRITICAL', assigneeWorkload: 15 },
        { caseId: 'c3', ageHours: 40, tatTotalHours: 48, priority: 'HIGH' },
      ]);

      const atRisk = await service.getAtRiskCases();

      // Only high-probability cases should be returned
      const caseIds = atRisk.map((p) => p.caseId);
      expect(caseIds).toContain('c2');
      // Each returned case should have pBreach > 0.5
      for (const prediction of atRisk) {
        expect(prediction.pBreach).toBeGreaterThan(0.5);
      }
    });

    it('should return cases sorted by pBreach descending', async () => {
      service.setMockCases([
        { caseId: 'c1', ageHours: 44, tatTotalHours: 48, priority: 'CRITICAL', assigneeWorkload: 15 },
        { caseId: 'c2', ageHours: 38, tatTotalHours: 48, priority: 'HIGH' },
        { caseId: 'c3', ageHours: 42, tatTotalHours: 48, priority: 'CRITICAL' },
      ]);

      const atRisk = await service.getAtRiskCases();

      for (let i = 1; i < atRisk.length; i++) {
        expect(atRisk[i - 1].pBreach).toBeGreaterThanOrEqual(atRisk[i].pBreach);
      }
    });

    it('should accept a custom threshold', async () => {
      service.setMockCases([
        { caseId: 'c1', ageHours: 30, tatTotalHours: 48, priority: 'NORMAL' },
        { caseId: 'c2', ageHours: 44, tatTotalHours: 48, priority: 'CRITICAL', assigneeWorkload: 15 },
      ]);

      const atRisk = await service.getAtRiskCases(0.3);

      // With lower threshold, more cases should match
      expect(atRisk.length).toBeGreaterThanOrEqual(1);
      for (const p of atRisk) {
        expect(p.pBreach).toBeGreaterThan(0.3);
      }
    });

    it('should return empty array when no cases are set', async () => {
      const atRisk = await service.getAtRiskCases();

      expect(atRisk).toEqual([]);
    });
  });

  describe('checkAndAlert (FR-062.A2)', () => {
    it('should alert when pBreach > 0.7', async () => {
      const sendSpy = jest.spyOn(dispatchService, 'send');

      const caseData: CaseDataInput = {
        caseId: 'case-alert-1',
        ageHours: 43,
        tatTotalHours: 48,
        priority: 'CRITICAL',
        assigneeWorkload: 15,
      };

      const result = await service.checkAndAlert(caseData);

      expect(result).toBeDefined();
      if (!result) throw new Error('Expected checkAndAlert to return a result');
      expect(result.prediction.pBreach).toBeGreaterThan(0.7);
      expect(result.alerted).toBe(true);
      expect(sendSpy).toHaveBeenCalledWith(
        'COLLATERAL_LEAD',
        expect.any(String),
        'SLA_BREACH_WARNING',
        expect.objectContaining({
          case_number: 'case-alert-1',
        }),
        expect.objectContaining({ fallbackEnabled: false }),
      );
    });

    it('should not alert when pBreach <= 0.7', async () => {
      const sendSpy = jest.spyOn(dispatchService, 'send');

      const caseData: CaseDataInput = {
        caseId: 'case-no-alert',
        ageHours: 5,
        tatTotalHours: 48,
        priority: 'LOW',
      };

      const result = await service.checkAndAlert(caseData);

      expect(result).toBeDefined();
      if (!result) throw new Error('Expected checkAndAlert to return a result');
      expect(result.prediction.pBreach).toBeLessThanOrEqual(0.7);
      expect(result.alerted).toBe(false);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should return alerted: false when notification dispatch fails', async () => {
      jest.spyOn(dispatchService, 'send').mockRejectedValue(new Error('Send failed'));

      const caseData: CaseDataInput = {
        caseId: 'case-fail',
        ageHours: 44,
        tatTotalHours: 48,
        priority: 'CRITICAL',
        assigneeWorkload: 15,
      };

      const result = await service.checkAndAlert(caseData);

      expect(result).toBeDefined();
      if (!result) throw new Error('Expected checkAndAlert to return a result');
      expect(result.prediction.pBreach).toBeGreaterThan(0.7);
      expect(result.alerted).toBe(false);
    });

    it('should return prediction regardless of alert status', async () => {
      const caseData: CaseDataInput = {
        caseId: 'case-predict',
        ageHours: 10,
        tatTotalHours: 48,
        priority: 'NORMAL',
      };

      const result = await service.checkAndAlert(caseData);

      expect(result).toBeDefined();
      if (!result) throw new Error('Expected checkAndAlert to return a result');
      expect(result.prediction).toBeDefined();
      expect(result.prediction.caseId).toBe('case-predict');
      expect(typeof result.prediction.pBreach).toBe('number');
      expect(Array.isArray(result.prediction.riskFactors)).toBe(true);
    });
  });

  describe('checkAndAlert without NotificationDispatchService', () => {
    it('should not alert when dispatchService is not injected', async () => {
      // Create a service without notification dispatch
      const serviceWithoutDispatch = new PredictiveBreachService(
        mockPrisma as PrismaService,
      );

      const caseData: CaseDataInput = {
        caseId: 'case-no-dispatch',
        ageHours: 44,
        tatTotalHours: 48,
        priority: 'CRITICAL',
        assigneeWorkload: 15,
      };

      const result = await serviceWithoutDispatch.checkAndAlert(caseData);

      expect(result).toBeDefined();
      if (!result) throw new Error('Expected checkAndAlert to return a result');
      expect(result.prediction.pBreach).toBeGreaterThan(0.7);
      expect(result.alerted).toBe(false);
    });
  });
});
