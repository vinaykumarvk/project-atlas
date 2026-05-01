import { JitElevationService } from '../services/jit-elevation.service';

const mockAuditLogService = {
  emit: jest.fn().mockResolvedValue({ id: 'mock-id' }),
};

describe('JitElevationService (FR-124.A3)', () => {
  let service: JitElevationService;

  beforeEach(() => {
    mockAuditLogService.emit.mockClear();
    service = new JitElevationService(mockAuditLogService as any);
  });

  describe('elevate()', () => {
    it('should create an elevation with correct expiry', () => {
      const before = Date.now();
      const result = service.elevate('user-1', 'SYS_ADMIN', 30, 'admin-1');
      const after = Date.now();

      expect(result.expiresAt).toBeInstanceOf(Date);
      // Expiry should be ~30 minutes from now
      const expiryMs = result.expiresAt.getTime();
      expect(expiryMs).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
      expect(expiryMs).toBeLessThanOrEqual(after + 30 * 60 * 1000);
    });

    it('should emit JIT_ELEVATION_GRANTED audit event', () => {
      service.elevate('user-1', 'SYS_ADMIN', 30, 'admin-1');
      expect(mockAuditLogService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event_code: 'JIT_ELEVATION_GRANTED',
          actor_id: 'admin-1',
          resource_id: 'user-1',
          action: 'ELEVATE',
        }),
      );
    });

    it('should replace an existing elevation for the same user', () => {
      service.elevate('user-1', 'COLLATERAL_LEAD', 10, 'admin-1');
      service.elevate('user-1', 'SYS_ADMIN', 60, 'admin-2');

      const active = service.getActiveElevation('user-1');
      expect(active).not.toBeNull();
      expect(active!.role).toBe('SYS_ADMIN');
      expect(active!.grantedBy).toBe('admin-2');
    });
  });

  describe('getActiveElevation()', () => {
    it('should return the elevation when it is active', () => {
      service.elevate('user-1', 'SYS_ADMIN', 30, 'admin-1');

      const elevation = service.getActiveElevation('user-1');
      expect(elevation).not.toBeNull();
      expect(elevation!.role).toBe('SYS_ADMIN');
      expect(elevation!.grantedBy).toBe('admin-1');
    });

    it('should return null for a non-elevated user', () => {
      expect(service.getActiveElevation('user-999')).toBeNull();
    });

    it('should return null and clean up expired elevations', () => {
      // Create an elevation that expires in the past
      service.elevate('user-1', 'SYS_ADMIN', 0, 'admin-1');
      // The 0-minute duration means expiresAt = now, which is <= new Date()

      // Wait a tiny bit to ensure it's expired
      const elevation = service.getActiveElevation('user-1');
      expect(elevation).toBeNull();
    });
  });

  describe('isElevated()', () => {
    it('should return true for an elevated user', () => {
      service.elevate('user-1', 'SYS_ADMIN', 30, 'admin-1');
      expect(service.isElevated('user-1')).toBe(true);
    });

    it('should return false for a non-elevated user', () => {
      expect(service.isElevated('user-999')).toBe(false);
    });
  });

  describe('revoke()', () => {
    it('should revoke an active elevation', () => {
      service.elevate('user-1', 'SYS_ADMIN', 30, 'admin-1');
      expect(service.isElevated('user-1')).toBe(true);

      const result = service.revoke('user-1');
      expect(result).toBe(true);
      expect(service.isElevated('user-1')).toBe(false);
    });

    it('should emit JIT_ELEVATION_REVOKED audit event on revocation', () => {
      service.elevate('user-1', 'SYS_ADMIN', 30, 'admin-1');
      mockAuditLogService.emit.mockClear();
      service.revoke('user-1');
      expect(mockAuditLogService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event_code: 'JIT_ELEVATION_REVOKED',
          resource_id: 'user-1',
          action: 'REVOKE',
        }),
      );
    });

    it('should return false when revoking a non-existent elevation', () => {
      const result = service.revoke('user-999');
      expect(result).toBe(false);
    });
  });

  describe('pruneExpired()', () => {
    it('should remove expired elevations and return the count', () => {
      // Create one expired elevation (0 minutes = already expired)
      service.elevate('user-expired', 'SYS_ADMIN', -1, 'admin-1');
      // Create one active elevation
      service.elevate('user-active', 'SYS_ADMIN', 60, 'admin-1');

      const pruned = service.pruneExpired();

      expect(pruned).toBe(1);
      expect(service.isElevated('user-active')).toBe(true);
      expect(service.isElevated('user-expired')).toBe(false);
    });

    it('should return 0 when there are no expired elevations', () => {
      service.elevate('user-1', 'SYS_ADMIN', 60, 'admin-1');
      expect(service.pruneExpired()).toBe(0);
    });
  });
});
