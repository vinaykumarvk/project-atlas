import { ClassificationMetricsService } from '../services/classification-metrics.service';
import { AccuracyTrendService } from '../services/accuracy-trend.service';
import { EntityF1Service } from '../services/entity-f1.service';
import { DriftMonitorService } from '../services/drift-monitor.service';

describe('ClassificationMetricsService', () => {
  let service: ClassificationMetricsService;
  let accuracyTrend: AccuracyTrendService;
  let entityF1: EntityF1Service;
  let driftMonitor: DriftMonitorService;

  beforeEach(() => {
    accuracyTrend = new AccuracyTrendService();
    entityF1 = new EntityF1Service();
    driftMonitor = new DriftMonitorService();
    service = new ClassificationMetricsService(accuracyTrend, entityF1, driftMonitor);
  });

  afterEach(() => {
    service.reset();
    accuracyTrend.reset();
    entityF1.reset();
    driftMonitor.reset();
  });

  describe('recordOverride', () => {
    it('should record an override and increment totalPredictions', () => {
      service.recordOverride('case-1', 'VALUATION_REQUEST', 'LEGAL_OPINION', 'officer-1');
      const rate = service.getOverrideRate();
      expect(rate.overrideCount).toBe(1);
      expect(rate.totalPredictions).toBe(1);
      expect(rate.rate).toBe(100);
    });

    it('should record override with metadata', () => {
      service.recordOverride('case-1', 'A', 'B', 'officer-1', { reason: 'correction' });
      expect(service.getOverrideRate().overrideCount).toBe(1);
    });
  });

  describe('recordLowConfidence', () => {
    it('should record low-confidence events', () => {
      service.recordLowConfidence('case-1', 0.35);
      service.recordLowConfidence('case-2', 0.42);
      const volume = service.getLowConfidenceVolume();
      const totalCount = volume.reduce((sum, w) => sum + w.count, 0);
      expect(totalCount).toBe(2);
    });
  });

  describe('getOverrideRate', () => {
    it('should return zero rate when no overrides', () => {
      service.recordPrediction();
      service.recordPrediction();
      const rate = service.getOverrideRate();
      expect(rate.overrideCount).toBe(0);
      expect(rate.totalPredictions).toBe(2);
      expect(rate.rate).toBe(0);
    });

    it('should compute correct override rate', () => {
      service.recordPrediction();
      service.recordPrediction();
      service.recordPrediction();
      service.recordOverride('case-1', 'A', 'B', 'officer-1');
      // totalPredictions is now 4 (3 + 1 from override)
      const rate = service.getOverrideRate();
      expect(rate.overrideCount).toBe(1);
      expect(rate.totalPredictions).toBe(4);
      expect(rate.rate).toBe(25);
    });

    it('should filter overrides by weeks when specified', () => {
      service.recordOverride('case-1', 'A', 'B', 'officer-1');
      const rate = service.getOverrideRate(1);
      expect(rate.overrideCount).toBe(1);
    });
  });

  describe('getLowConfidenceVolume', () => {
    it('should return empty array when no data', () => {
      const volume = service.getLowConfidenceVolume();
      expect(volume).toEqual([]);
    });

    it('should group low-confidence records by week', () => {
      service.recordLowConfidence('case-1', 0.3);
      service.recordLowConfidence('case-2', 0.4);
      const volume = service.getLowConfidenceVolume();
      expect(volume.length).toBeGreaterThanOrEqual(1);
      expect(volume[0].count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getEntityF1Summary', () => {
    it('should delegate to EntityF1Service', () => {
      entityF1.recordPrediction('property_city', ['Mumbai'], ['Mumbai']);
      const summary = service.getEntityF1Summary();
      expect(summary.property_city).toBeDefined();
      expect(summary.property_city.f1).toBeGreaterThan(0);
    });
  });

  describe('getAccuracyTrend', () => {
    it('should delegate to AccuracyTrendService', () => {
      accuracyTrend.recordOutcome('A', 'A');
      accuracyTrend.recordOutcome('A', 'B');
      const trend = service.getAccuracyTrend();
      expect(trend.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getDriftReport', () => {
    it('should delegate to DriftMonitorService', () => {
      const report = service.getDriftReport();
      expect(report).toHaveProperty('confidenceDriftAlert');
      expect(report).toHaveProperty('psiScore');
    });
  });

  describe('reset', () => {
    it('should clear all data', () => {
      service.recordOverride('case-1', 'A', 'B', 'officer-1');
      service.recordLowConfidence('case-2', 0.3);
      service.reset();
      expect(service.getOverrideRate().overrideCount).toBe(0);
      expect(service.getLowConfidenceVolume()).toEqual([]);
    });
  });
});
