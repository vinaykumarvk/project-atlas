import { SloBurnRateService } from '../services/slo-burnrate.service';

describe('SloBurnRateService', () => {
  let service: SloBurnRateService;

  beforeEach(() => {
    service = new SloBurnRateService();
  });

  describe('registerSlo', () => {
    it('should register a new SLO', () => {
      service.registerSlo({ name: 'api-availability', target: 0.999, windowDays: 30 });
      const result = service.computeBurnRate('api-availability');
      expect(result).not.toBeNull();
      expect(result!.sloName).toBe('api-availability');
    });

    it('should overwrite existing SLO with same name', () => {
      service.registerSlo({ name: 'api-availability', target: 0.999, windowDays: 30 });
      service.registerSlo({ name: 'api-availability', target: 0.995, windowDays: 7 });
      const rates = service.getAllBurnRates();
      expect(rates).toHaveLength(1);
    });
  });

  describe('recordError / recordSuccess', () => {
    beforeEach(() => {
      service.registerSlo({ name: 'test-slo', target: 0.99, windowDays: 30 });
    });

    it('should record errors that affect burn rate', () => {
      for (let i = 0; i < 100; i++) {
        service.recordSuccess('test-slo');
      }
      for (let i = 0; i < 5; i++) {
        service.recordError('test-slo');
      }

      const result = service.computeBurnRate('test-slo');
      expect(result).not.toBeNull();
      expect(result!.consumedBudgetPercent).toBeGreaterThan(0);
    });

    it('should silently ignore errors for unregistered SLOs', () => {
      // Should not throw
      service.recordError('nonexistent');
      service.recordSuccess('nonexistent');
    });
  });

  describe('computeBurnRate', () => {
    it('should return null for unregistered SLO', () => {
      const result = service.computeBurnRate('nonexistent');
      expect(result).toBeNull();
    });

    it('should return zero burn rate with no events', () => {
      service.registerSlo({ name: 'empty-slo', target: 0.999, windowDays: 30 });
      const result = service.computeBurnRate('empty-slo');
      expect(result).not.toBeNull();
      expect(result!.burnRate).toBe(0);
      expect(result!.consumedBudgetPercent).toBe(0);
    });

    it('should compute correct consumed budget percent', () => {
      service.registerSlo({ name: 'budget-slo', target: 0.99, windowDays: 30 });

      // 100 total requests, 1% error budget = 1 error allowed
      for (let i = 0; i < 99; i++) {
        service.recordSuccess('budget-slo');
      }
      service.recordError('budget-slo');

      const result = service.computeBurnRate('budget-slo');
      expect(result).not.toBeNull();
      // 1 error out of 1 budget = ~100%
      expect(result!.consumedBudgetPercent).toBeCloseTo(100, 0);
    });

    it('should cap consumed budget at 100%', () => {
      service.registerSlo({ name: 'over-slo', target: 0.99, windowDays: 30 });

      for (let i = 0; i < 90; i++) {
        service.recordSuccess('over-slo');
      }
      for (let i = 0; i < 10; i++) {
        service.recordError('over-slo');
      }

      const result = service.computeBurnRate('over-slo');
      expect(result).not.toBeNull();
      expect(result!.consumedBudgetPercent).toBe(100);
    });

    it('should include shortWindowBurnRate and longWindowBurnRate', () => {
      service.registerSlo({ name: 'window-slo', target: 0.999, windowDays: 30 });
      service.recordError('window-slo');
      service.recordSuccess('window-slo');

      const result = service.computeBurnRate('window-slo');
      expect(result).not.toBeNull();
      expect(typeof result!.shortWindowBurnRate).toBe('number');
      expect(typeof result!.longWindowBurnRate).toBe('number');
    });

    it('should include alerting field', () => {
      service.registerSlo({ name: 'alert-slo', target: 0.999, windowDays: 30 });
      const result = service.computeBurnRate('alert-slo');
      expect(result).not.toBeNull();
      expect(typeof result!.alerting).toBe('boolean');
    });
  });

  describe('getAllBurnRates', () => {
    it('should return burn rates for all registered SLOs', () => {
      service.registerSlo({ name: 'slo-1', target: 0.999, windowDays: 30 });
      service.registerSlo({ name: 'slo-2', target: 0.995, windowDays: 7 });

      const rates = service.getAllBurnRates();
      expect(rates).toHaveLength(2);
      expect(rates.map((r) => r.sloName).sort()).toEqual(['slo-1', 'slo-2']);
    });

    it('should return empty array when no SLOs registered', () => {
      expect(service.getAllBurnRates()).toHaveLength(0);
    });
  });

  describe('shouldAlert', () => {
    it('should return false for unregistered SLO', () => {
      expect(service.shouldAlert('nonexistent')).toBe(false);
    });

    it('should return false when no errors recorded', () => {
      service.registerSlo({ name: 'healthy-slo', target: 0.999, windowDays: 30 });
      for (let i = 0; i < 1000; i++) {
        service.recordSuccess('healthy-slo');
      }
      expect(service.shouldAlert('healthy-slo')).toBe(false);
    });
  });
});
