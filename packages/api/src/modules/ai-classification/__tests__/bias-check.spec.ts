import { BiasCheckService } from '../services/bias-check.service';

describe('BiasCheckService', () => {
  let service: BiasCheckService;

  beforeEach(() => {
    service = new BiasCheckService();
  });

  describe('recordPrediction()', () => {
    it('should record predictions without error', () => {
      expect(() =>
        service.recordPrediction('A', 'A', { region: 'NSW' }),
      ).not.toThrow();
    });
  });

  describe('generateReport()', () => {
    it('should generate a report with overall accuracy', () => {
      // 8 correct, 2 incorrect = 80% accuracy
      for (let i = 0; i < 8; i++) {
        service.recordPrediction('VALUATION', 'VALUATION', {
          region: 'NSW',
        });
      }
      service.recordPrediction('VALUATION', 'LEGAL', { region: 'NSW' });
      service.recordPrediction('LEGAL', 'VALUATION', { region: 'NSW' });

      const report = service.generateReport(['region']);
      expect(report.overallAccuracy).toBe(0.8);
      expect(report.dimensions).toEqual(['region']);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should compute metrics per group within a dimension', () => {
      // NSW: 9/10 correct = 90% accuracy
      for (let i = 0; i < 9; i++) {
        service.recordPrediction('A', 'A', { region: 'NSW' });
      }
      service.recordPrediction('A', 'B', { region: 'NSW' });

      // VIC: 7/10 correct = 70% accuracy
      for (let i = 0; i < 7; i++) {
        service.recordPrediction('A', 'A', { region: 'VIC' });
      }
      for (let i = 0; i < 3; i++) {
        service.recordPrediction('A', 'B', { region: 'VIC' });
      }

      const report = service.generateReport(['region']);
      const nswMetric = report.metrics.find(
        (m) => m.groupValue === 'NSW',
      );
      const vicMetric = report.metrics.find(
        (m) => m.groupValue === 'VIC',
      );

      expect(nswMetric).toBeDefined();
      expect(nswMetric!.accuracy).toBe(0.9);
      expect(nswMetric!.sampleCount).toBe(10);

      expect(vicMetric).toBeDefined();
      expect(vicMetric!.accuracy).toBe(0.7);
      expect(vicMetric!.sampleCount).toBe(10);
    });

    it('should pass fairness when disparity < 10%', () => {
      // NSW: 90% accuracy, VIC: 85% accuracy = 5% disparity
      for (let i = 0; i < 90; i++) {
        service.recordPrediction('A', 'A', { region: 'NSW' });
      }
      for (let i = 0; i < 10; i++) {
        service.recordPrediction('A', 'B', { region: 'NSW' });
      }

      for (let i = 0; i < 85; i++) {
        service.recordPrediction('A', 'A', { region: 'VIC' });
      }
      for (let i = 0; i < 15; i++) {
        service.recordPrediction('A', 'B', { region: 'VIC' });
      }

      const report = service.generateReport(['region']);
      expect(report.maxDisparityPercent).toBeCloseTo(5, 1);
      expect(report.fairnessPass).toBe(true);
    });

    it('should fail fairness when disparity >= 10%', () => {
      // NSW: 95% accuracy
      for (let i = 0; i < 95; i++) {
        service.recordPrediction('A', 'A', { region: 'NSW' });
      }
      for (let i = 0; i < 5; i++) {
        service.recordPrediction('A', 'B', { region: 'NSW' });
      }

      // VIC: 80% accuracy => 15% disparity
      for (let i = 0; i < 80; i++) {
        service.recordPrediction('A', 'A', { region: 'VIC' });
      }
      for (let i = 0; i < 20; i++) {
        service.recordPrediction('A', 'B', { region: 'VIC' });
      }

      const report = service.generateReport(['region']);
      expect(report.maxDisparityPercent).toBeCloseTo(15, 1);
      expect(report.fairnessPass).toBe(false);
    });

    it('should handle multiple dimensions', () => {
      service.recordPrediction('A', 'A', {
        region: 'NSW',
        segment: 'COMMERCIAL',
      });
      service.recordPrediction('A', 'B', {
        region: 'VIC',
        segment: 'RESIDENTIAL',
      });

      const report = service.generateReport(['region', 'segment']);
      expect(report.dimensions).toEqual(['region', 'segment']);
      expect(report.metrics.length).toBeGreaterThanOrEqual(2);
    });

    it('should compute false positive and negative rates', () => {
      // 7 correct, 3 wrong
      for (let i = 0; i < 7; i++) {
        service.recordPrediction('A', 'A', { group: 'X' });
      }
      for (let i = 0; i < 3; i++) {
        service.recordPrediction('A', 'B', { group: 'X' });
      }

      const report = service.generateReport(['group']);
      const metric = report.metrics.find((m) => m.groupValue === 'X');
      expect(metric).toBeDefined();
      expect(metric!.falsePositiveRate).toBe(0.3);
      expect(metric!.falseNegativeRate).toBe(0.3);
    });

    it('should handle empty predictions', () => {
      const report = service.generateReport(['region']);
      expect(report.overallAccuracy).toBe(0);
      expect(report.metrics).toEqual([]);
      expect(report.fairnessPass).toBe(true);
    });

    it('should skip predictions that lack the requested dimension', () => {
      service.recordPrediction('A', 'A', { region: 'NSW' });
      service.recordPrediction('A', 'A', {}); // no region attribute

      const report = service.generateReport(['region']);
      expect(report.metrics).toHaveLength(1);
      expect(report.metrics[0].sampleCount).toBe(1);
    });
  });

  describe('checkFairness()', () => {
    it('should return pass=true when disparity is acceptable', () => {
      for (let i = 0; i < 10; i++) {
        service.recordPrediction('A', 'A', { region: 'NSW' });
        service.recordPrediction('A', 'A', { region: 'VIC' });
      }

      const result = service.checkFairness('region');
      expect(result.pass).toBe(true);
      expect(result.disparity).toBe(0);
    });

    it('should return pass=false when disparity exceeds 10%', () => {
      // NSW: 100% accuracy
      for (let i = 0; i < 10; i++) {
        service.recordPrediction('A', 'A', { region: 'NSW' });
      }
      // VIC: 50% accuracy => 50% disparity
      for (let i = 0; i < 5; i++) {
        service.recordPrediction('A', 'A', { region: 'VIC' });
      }
      for (let i = 0; i < 5; i++) {
        service.recordPrediction('A', 'B', { region: 'VIC' });
      }

      const result = service.checkFairness('region');
      expect(result.pass).toBe(false);
      expect(result.disparity).toBe(50);
    });
  });
});
