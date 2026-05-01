import { ObjectLockConfigService } from '../config/object-lock.config';

describe('ObjectLockConfigService', () => {
  function createService(envOverrides: Record<string, string> = {}) {
    const mockConfigService = {
      get: jest.fn((key: string) => envOverrides[key] ?? undefined),
    };
    return new ObjectLockConfigService(mockConfigService as any);
  }

  describe('with default policies', () => {
    let service: ObjectLockConfigService;

    beforeEach(() => {
      service = createService();
    });

    it('should load default policies', () => {
      const policies = service.getAllPolicies();
      expect(policies).toHaveLength(3);
    });

    it('should return policy for atlas-audit-logs', () => {
      const policy = service.getPolicyForBucket('atlas-audit-logs');
      expect(policy).toBeDefined();
      expect(policy!.mode).toBe('COMPLIANCE');
      expect(policy!.retentionDays).toBe(365);
      expect(policy!.enabled).toBe(true);
    });

    it('should return policy for atlas-email-archives', () => {
      const policy = service.getPolicyForBucket('atlas-email-archives');
      expect(policy).toBeDefined();
      expect(policy!.mode).toBe('GOVERNANCE');
      expect(policy!.retentionDays).toBe(180);
      expect(policy!.enabled).toBe(true);
    });

    it('should return policy for atlas-backups', () => {
      const policy = service.getPolicyForBucket('atlas-backups');
      expect(policy).toBeDefined();
      expect(policy!.enabled).toBe(false);
    });

    it('should return undefined for unknown bucket', () => {
      const policy = service.getPolicyForBucket('unknown-bucket');
      expect(policy).toBeUndefined();
    });

    it('should report locked for enabled policy', () => {
      expect(service.isLocked('atlas-audit-logs')).toBe(true);
      expect(service.isLocked('atlas-email-archives')).toBe(true);
    });

    it('should report not locked for disabled policy', () => {
      expect(service.isLocked('atlas-backups')).toBe(false);
    });

    it('should report not locked for unknown bucket', () => {
      expect(service.isLocked('unknown-bucket')).toBe(false);
    });

    it('should return copies of policies (not references)', () => {
      const policies1 = service.getAllPolicies();
      const policies2 = service.getAllPolicies();
      expect(policies1).not.toBe(policies2);
      expect(policies1).toEqual(policies2);
    });
  });

  describe('with custom policies from env', () => {
    it('should load policies from OBJECT_LOCK_POLICIES env var', () => {
      const customPolicies = [
        {
          bucket: 'custom-bucket',
          mode: 'GOVERNANCE' as const,
          retentionDays: 30,
          enabled: true,
        },
      ];
      const service = createService({
        OBJECT_LOCK_POLICIES: JSON.stringify(customPolicies),
      });

      const policies = service.getAllPolicies();
      expect(policies).toHaveLength(1);
      expect(policies[0].bucket).toBe('custom-bucket');
    });

    it('should fall back to defaults on invalid JSON', () => {
      const service = createService({
        OBJECT_LOCK_POLICIES: '{invalid}',
      });

      const policies = service.getAllPolicies();
      expect(policies).toHaveLength(3); // defaults
    });
  });
});
