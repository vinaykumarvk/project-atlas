import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JitAccessService } from '../services/jit-access.service';

describe('JitAccessService (FR-129.A4)', () => {
  describe('when NODE_ENV is NOT production', () => {
    let service: JitAccessService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({ NODE_ENV: 'development' })],
          }),
        ],
        providers: [JitAccessService],
      }).compile();

      service = module.get(JitAccessService);
    });

    it('should be active in non-production', () => {
      expect(service.isActive()).toBe(true);
    });

    it('should grant access and return a token', () => {
      const result = service.grantAccess('user-1', 'staging', 30);

      expect(result).not.toBeNull();
      expect(result!.token).toBeDefined();
      expect(result!.userId).toBe('user-1');
      expect(result!.environment).toBe('staging');
      expect(result!.expiresAt).toBeInstanceOf(Date);
      expect(result!.grantedAt).toBeInstanceOf(Date);
    });

    it('should validate a valid token', () => {
      const access = service.grantAccess('user-1', 'staging', 60);
      expect(access).not.toBeNull();

      const validated = service.validateToken(access!.token);
      expect(validated).not.toBeNull();
      expect(validated!.userId).toBe('user-1');
      expect(validated!.environment).toBe('staging');
    });

    it('should return null when validating an invalid token', () => {
      expect(service.validateToken('invalid-token')).toBeNull();
    });

    it('should return null when validating an expired token', () => {
      // Grant with 0 duration (expires immediately)
      const access = service.grantAccess('user-1', 'staging', 0);
      expect(access).not.toBeNull();

      const validated = service.validateToken(access!.token);
      expect(validated).toBeNull();
    });

    it('should revoke a token', () => {
      const access = service.grantAccess('user-1', 'staging', 60);
      expect(access).not.toBeNull();

      const revoked = service.revokeToken(access!.token);
      expect(revoked).toBe(true);

      const validated = service.validateToken(access!.token);
      expect(validated).toBeNull();
    });

    it('should return false when revoking a non-existent token', () => {
      expect(service.revokeToken('non-existent')).toBe(false);
    });

    it('should revoke all tokens for a user', () => {
      service.grantAccess('user-1', 'staging', 60);
      service.grantAccess('user-1', 'uat', 60);
      service.grantAccess('user-2', 'staging', 60);

      const revoked = service.revokeAllForUser('user-1');
      expect(revoked).toBe(2);
    });

    it('should prune expired tokens', () => {
      service.grantAccess('user-1', 'staging', -1); // expired
      service.grantAccess('user-2', 'staging', 60); // active

      const pruned = service.pruneExpired();
      expect(pruned).toBe(1);
    });
  });

  describe('when NODE_ENV is production', () => {
    let service: JitAccessService;

    beforeEach(async () => {
      const mockConfigService = { get: jest.fn((key: string) => key === 'NODE_ENV' ? 'production' : undefined) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          JitAccessService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      service = module.get(JitAccessService);
    });

    it('should not be active in production', () => {
      expect(service.isActive()).toBe(false);
    });

    it('should return null when granting access in production', () => {
      const result = service.grantAccess('user-1', 'staging', 30);
      expect(result).toBeNull();
    });

    it('should return null when validating tokens in production', () => {
      expect(service.validateToken('any-token')).toBeNull();
    });
  });
});
