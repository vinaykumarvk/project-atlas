import { FeatureFlagService } from '../services/feature-flag.service';

describe('FeatureFlagService', () => {
  let service: FeatureFlagService;

  beforeEach(() => {
    service = new FeatureFlagService();
  });

  describe('seedDefaults', () => {
    it('seeds default flags on construction', () => {
      const flags = service.getAllFlags();
      expect(Object.keys(flags).length).toBeGreaterThanOrEqual(6);
    });

    it('includes llm_classification flag', () => {
      const flag = service.getFlag('llm_classification');
      expect(flag).toBeDefined();
      expect(flag!.enabled).toBe(true);
      expect(flag!.rolloutPercent).toBe(100);
    });

    it('includes vendor_auto_dispatch flag as disabled', () => {
      const flag = service.getFlag('vendor_auto_dispatch');
      expect(flag).toBeDefined();
      expect(flag!.enabled).toBe(false);
    });
  });

  describe('getFlag', () => {
    it('returns undefined for non-existent flag', () => {
      expect(service.getFlag('nonexistent')).toBeUndefined();
    });

    it('returns flag data for existing flag', () => {
      const flag = service.getFlag('auto_routing');
      expect(flag).toEqual({ enabled: true, rolloutPercent: 100 });
    });
  });

  describe('setFlag', () => {
    it('creates a new flag', () => {
      service.setFlag('new_flag', true, 75);
      const flag = service.getFlag('new_flag');
      expect(flag).toEqual({ enabled: true, rolloutPercent: 75 });
    });

    it('updates an existing flag', () => {
      service.setFlag('llm_classification', false);
      const flag = service.getFlag('llm_classification');
      expect(flag!.enabled).toBe(false);
      // rolloutPercent should be preserved
      expect(flag!.rolloutPercent).toBe(100);
    });

    it('updates rollout percent when provided', () => {
      service.setFlag('llm_classification', true, 50);
      const flag = service.getFlag('llm_classification');
      expect(flag!.rolloutPercent).toBe(50);
    });
  });

  describe('getAllFlags', () => {
    it('returns all flags as a record', () => {
      const flags = service.getAllFlags();
      expect(flags).toHaveProperty('llm_classification');
      expect(flags).toHaveProperty('auto_routing');
      expect(flags).toHaveProperty('vendor_auto_dispatch');
      expect(flags).toHaveProperty('predictive_breach');
      expect(flags).toHaveProperty('suggested_replies');
      expect(flags).toHaveProperty('dark_mode');
    });

    it('each flag has enabled, rolloutPercent, and description', () => {
      const flags = service.getAllFlags();
      for (const value of Object.values(flags)) {
        expect(value).toHaveProperty('enabled');
        expect(value).toHaveProperty('rolloutPercent');
        expect(value).toHaveProperty('description');
      }
    });
  });

  describe('isEnabled', () => {
    it('returns false for non-existent flag', () => {
      expect(service.isEnabled('nonexistent')).toBe(false);
    });

    it('returns true for enabled flag with 100% rollout', () => {
      expect(service.isEnabled('llm_classification')).toBe(true);
    });

    it('returns false for disabled flag', () => {
      expect(service.isEnabled('vendor_auto_dispatch')).toBe(false);
    });

    it('returns true for enabled flag without userId (no rollout check)', () => {
      service.setFlag('partial_flag', true, 50);
      expect(service.isEnabled('partial_flag')).toBe(true);
    });

    it('performs deterministic rollout check with userId', () => {
      service.setFlag('rollout_flag', true, 50);

      // Hash-based: should be deterministic for same userId
      const result1 = service.isEnabled('rollout_flag', 'user-123');
      const result2 = service.isEnabled('rollout_flag', 'user-123');
      expect(result1).toBe(result2);
    });

    it('returns false when rollout is 0%', () => {
      service.setFlag('zero_flag', true, 0);
      expect(service.isEnabled('zero_flag', 'user-123')).toBe(false);
    });

    it('returns true when rollout is 100%', () => {
      service.setFlag('full_flag', true, 100);
      expect(service.isEnabled('full_flag', 'user-123')).toBe(true);
    });

    it('different users may get different results for partial rollout', () => {
      service.setFlag('split_flag', true, 50);
      const results = new Set<boolean>();
      // Test with many user IDs
      for (let i = 0; i < 100; i++) {
        results.add(service.isEnabled('split_flag', `user-${i}`));
      }
      // With 50% rollout and 100 users, we should get both true and false
      expect(results.size).toBe(2);
    });
  });
});
