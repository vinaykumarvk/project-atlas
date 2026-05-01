import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthService, UserRole } from '../auth.service';
import { AuthModeConfig } from '../config/auth-mode.config';
import { PiiRedactionService } from '../../audit/services/pii-redaction.service';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { MfaGuard } from '../../../common/guards/mfa.guard';
import { ROLES_KEY } from '../../../common/guards/roles.decorator';
import { REGION_SCOPED_KEY } from '../../../common/guards/region-scoped.decorator';
import { REQUIRES_MFA_KEY } from '../../../common/guards/requires-mfa.decorator';

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const JWT_SECRET = 'test-secret-for-integration';

function createMockConfigService(overrides: Record<string, string> = {}): Partial<ConfigService> {
  const config: Record<string, string> = {
    JWT_SECRET: JWT_SECRET,
    NODE_ENV: 'development',
    AUTH_MODE: 'dev',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, defaultVal?: string) => config[key] ?? defaultVal),
  } as unknown as Partial<ConfigService>;
}

function createMockExecutionContext(options: {
  user?: { id: string; email: string; roles: UserRole[]; region?: string; amr?: string[] };
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, string>;
  method?: string;
  handlerMetadata?: Record<string, unknown>;
}): ExecutionContext {
  const request = {
    user: options.user,
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body ?? {},
    method: options.method ?? 'GET',
    regionFilter: undefined as unknown,
  };

  const handler = jest.fn();
  const classRef = jest.fn();

  // Store metadata for the reflector
  if (options.handlerMetadata) {
    Reflect.defineMetadata(
      ROLES_KEY,
      options.handlerMetadata[ROLES_KEY],
      handler,
    );
    if (options.handlerMetadata[REGION_SCOPED_KEY] !== undefined) {
      Reflect.defineMetadata(
        REGION_SCOPED_KEY,
        options.handlerMetadata[REGION_SCOPED_KEY],
        handler,
      );
    }
    if (options.handlerMetadata[REQUIRES_MFA_KEY] !== undefined) {
      Reflect.defineMetadata(
        REQUIRES_MFA_KEY,
        options.handlerMetadata[REQUIRES_MFA_KEY],
        handler,
      );
    }
  }

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getHandler: () => handler,
    getClass: () => classRef,
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getContext: jest.fn(), getData: jest.fn() }),
    switchToWs: () => ({ getClient: jest.fn(), getData: jest.fn(), getPattern: jest.fn() }),
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------
// Test: Dev mode login works
// ---------------------------------------------------------------

describe('Dev mode login', () => {
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: createMockConfigService(),
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock.jwt.token'),
            verify: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  it('should login successfully with valid dev credentials', async () => {
    const result = await authService.login('admin@atlas.dev', 'password123');
    expect(result).toBeDefined();
    expect(result.access_token).toBe('mock.jwt.token');
    expect(result.refresh_token).toBe('mock.jwt.token');
    expect(result.token_type).toBe('Bearer');
    expect(result.expires_in).toBe(3600);
  });

  it('should reject invalid credentials', async () => {
    await expect(
      authService.login('admin@atlas.dev', 'wrong-password'),
    ).rejects.toThrow('Invalid email or password');
  });

  it('should reject unknown email', async () => {
    await expect(
      authService.login('unknown@atlas.dev', 'password123'),
    ).rejects.toThrow('Invalid email or password');
  });
});

// ---------------------------------------------------------------
// Test: PII redaction strips sensitive data
// ---------------------------------------------------------------

describe('PII redaction integration', () => {
  let piiService: PiiRedactionService;

  beforeEach(() => {
    piiService = new PiiRedactionService();
  });

  it('should redact PAN card numbers in audit payloads', () => {
    const payload = {
      method: 'POST',
      path: '/v1/cases',
      status: 'SUCCESS',
      customer_pan: 'ABCDE1234F',
    };

    const redacted = piiService.redact(payload);
    expect(redacted.customer_pan).not.toContain('ABCDE1234F');
    expect(redacted.customer_pan).toContain('[REDACTED:pan:');
    // Non-PII fields are untouched
    expect(redacted.method).toBe('POST');
    expect(redacted.status).toBe('SUCCESS');
  });

  it('should redact Aadhaar numbers', () => {
    const payload = { id_number: '1234 5678 9012' };
    const redacted = piiService.redact(payload);
    expect(redacted.id_number).toContain('[REDACTED:aadhaar:');
  });

  it('should redact Indian phone numbers with +91 prefix', () => {
    const payload = { phone: '+919876543210' };
    const redacted = piiService.redact(payload);
    expect(redacted.phone).toContain('[REDACTED:phone_in:');
  });

  it('should redact email addresses in error messages', () => {
    const errorMsg = 'User john@example.com not found';
    const redacted = piiService.redact(errorMsg);
    expect(redacted).not.toContain('john@example.com');
    expect(redacted).toContain('[REDACTED:email:');
  });

  it('should handle complex nested structures', () => {
    const data = {
      level1: {
        emails: ['a@b.com', 'c@d.com'],
        nested: {
          pan: 'XYZAB1234C',
          count: 5,
          flag: true,
        },
      },
    };
    const redacted = piiService.redact(data);
    expect(redacted.level1.emails[0]).toContain('[REDACTED:email:');
    expect(redacted.level1.emails[1]).toContain('[REDACTED:email:');
    expect(redacted.level1.nested.pan).toContain('[REDACTED:');
    expect(redacted.level1.nested.count).toBe(5);
    expect(redacted.level1.nested.flag).toBe(true);
  });
});

// ---------------------------------------------------------------
// Test: ABAC region filtering works
// ---------------------------------------------------------------

describe('ABAC region filtering', () => {
  let rolesGuard: RolesGuard;

  beforeEach(() => {
    const reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  it('should allow access when user region matches resource region', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'officer@atlas.dev',
        roles: [UserRole.COLLATERAL_OFFICER],
        region: 'NORTH',
      },
      query: { region: 'NORTH' },
      handlerMetadata: {
        [ROLES_KEY]: [UserRole.COLLATERAL_OFFICER],
        [REGION_SCOPED_KEY]: {},
      },
    });

    expect(rolesGuard.canActivate(ctx)).toBe(true);
  });

  it('should deny access when user region does not match resource region', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'officer@atlas.dev',
        roles: [UserRole.COLLATERAL_OFFICER],
        region: 'NORTH',
      },
      query: { region: 'SOUTH' },
      handlerMetadata: {
        [ROLES_KEY]: [UserRole.COLLATERAL_OFFICER],
        [REGION_SCOPED_KEY]: {},
      },
    });

    expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => rolesGuard.canActivate(ctx)).toThrow(
      'Access denied: resource is outside your assigned region',
    );
  });

  it('should allow GLOBAL users to access any region', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'admin-1',
        email: 'admin@atlas.dev',
        roles: [UserRole.SYS_ADMIN],
        region: 'GLOBAL',
      },
      query: { region: 'SOUTH' },
      handlerMetadata: {
        [ROLES_KEY]: [UserRole.SYS_ADMIN],
        [REGION_SCOPED_KEY]: {},
      },
    });

    expect(rolesGuard.canActivate(ctx)).toBe(true);
  });

  it('should inject regionFilter into request when @RegionScoped is present', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'officer@atlas.dev',
        roles: [UserRole.COLLATERAL_OFFICER],
        region: 'WEST',
      },
      handlerMetadata: {
        [ROLES_KEY]: [UserRole.COLLATERAL_OFFICER],
        [REGION_SCOPED_KEY]: {},
      },
    });

    rolesGuard.canActivate(ctx);
    const request = ctx.switchToHttp().getRequest();
    expect((request as Record<string, unknown>).regionFilter).toEqual({ region: 'WEST' });
  });

  it('should allow access when no @RegionScoped decorator is present', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'officer@atlas.dev',
        roles: [UserRole.COLLATERAL_OFFICER],
        region: 'NORTH',
      },
      query: { region: 'SOUTH' }, // different region, but no @RegionScoped
      handlerMetadata: {
        [ROLES_KEY]: [UserRole.COLLATERAL_OFFICER],
      },
    });

    expect(rolesGuard.canActivate(ctx)).toBe(true);
  });

  it('should use custom regionParam from decorator options', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'officer@atlas.dev',
        roles: [UserRole.COLLATERAL_OFFICER],
        region: 'NORTH',
      },
      query: { state: 'SOUTH' },
      handlerMetadata: {
        [ROLES_KEY]: [UserRole.COLLATERAL_OFFICER],
        [REGION_SCOPED_KEY]: { regionParam: 'state' },
      },
    });

    expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ---------------------------------------------------------------
// Test: MFA guard behaviour
// ---------------------------------------------------------------

describe('MFA guard', () => {
  let mfaGuardDev: MfaGuard;
  let mfaGuardOidc: MfaGuard;

  beforeEach(async () => {
    // Dev mode guard
    const devConfigService = createMockConfigService({ AUTH_MODE: 'dev' });
    const devAuthModeConfig = new AuthModeConfig(devConfigService as ConfigService);
    const devReflector = new Reflector();
    mfaGuardDev = new MfaGuard(devReflector, devAuthModeConfig, devConfigService as ConfigService);

    // OIDC mode guard (simulate by creating config directly)
    const oidcAuthModeConfig = {
      mode: 'oidc',
      isDev: false,
      isOidc: true,
    } as AuthModeConfig;
    const oidcReflector = new Reflector();
    const oidcConfigService = createMockConfigService({ AUTH_MODE: 'oidc' });
    mfaGuardOidc = new MfaGuard(oidcReflector, oidcAuthModeConfig, oidcConfigService as ConfigService);
  });

  it('should skip MFA check in dev mode but allow access', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'admin@atlas.dev',
        roles: [UserRole.SYS_ADMIN],
        region: 'GLOBAL',
      },
      handlerMetadata: {
        [REQUIRES_MFA_KEY]: true,
      },
    });

    expect(mfaGuardDev.canActivate(ctx)).toBe(true);
  });

  it('should pass in OIDC mode when amr includes mfa', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'admin@atlas.dev',
        roles: [UserRole.SYS_ADMIN],
        region: 'GLOBAL',
        amr: ['pwd', 'mfa'],
      },
      handlerMetadata: {
        [REQUIRES_MFA_KEY]: true,
      },
    });

    expect(mfaGuardOidc.canActivate(ctx)).toBe(true);
  });

  it('should deny in OIDC mode when amr does not include mfa', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'admin@atlas.dev',
        roles: [UserRole.SYS_ADMIN],
        region: 'GLOBAL',
        amr: ['pwd'],
      },
      handlerMetadata: {
        [REQUIRES_MFA_KEY]: true,
      },
    });

    expect(() => mfaGuardOidc.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => mfaGuardOidc.canActivate(ctx)).toThrow(
      'multi-factor authentication is required',
    );
  });

  it('should deny in OIDC mode when amr is empty', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'admin@atlas.dev',
        roles: [UserRole.SYS_ADMIN],
        region: 'GLOBAL',
        amr: [],
      },
      handlerMetadata: {
        [REQUIRES_MFA_KEY]: true,
      },
    });

    expect(() => mfaGuardOidc.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow access when @RequiresMfa is not present and role does not auto-require MFA', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-2',
        email: 'officer@atlas.dev',
        roles: [UserRole.COLLATERAL_OFFICER],
        region: 'NORTH',
      },
      handlerMetadata: {},
    });

    expect(mfaGuardOidc.canActivate(ctx)).toBe(true);
  });

  it('should auto-enforce MFA for SYS_ADMIN even without @RequiresMfa decorator (FR-125.A2)', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-1',
        email: 'admin@atlas.dev',
        roles: [UserRole.SYS_ADMIN],
        region: 'GLOBAL',
      },
      handlerMetadata: {},
    });

    expect(() => mfaGuardOidc.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ---------------------------------------------------------------
// Test: AuthModeConfig
// ---------------------------------------------------------------

describe('AuthModeConfig', () => {
  it('should default to dev mode', () => {
    const configService = createMockConfigService();
    const config = new AuthModeConfig(configService as ConfigService);
    expect(config.mode).toBe('dev');
    expect(config.isDev).toBe(true);
    expect(config.isOidc).toBe(false);
  });

  it('should fall back to oidc when AUTH_MODE=dev and NODE_ENV=production', () => {
    const configService = createMockConfigService({
      AUTH_MODE: 'dev',
      NODE_ENV: 'production',
      OIDC_ISSUER_URL: 'https://auth.example.com',
      OIDC_CLIENT_ID: 'atlas-client',
    });
    const config = new AuthModeConfig(configService as ConfigService);
    expect(config.mode).toBe('oidc');
  });

  it('should throw when AUTH_MODE=oidc but OIDC_ISSUER_URL is missing', () => {
    const configService = createMockConfigService({
      AUTH_MODE: 'oidc',
      OIDC_CLIENT_ID: 'atlas-client',
    });
    expect(() => new AuthModeConfig(configService as ConfigService)).toThrow(
      'OIDC_ISSUER_URL is required',
    );
  });

  it('should throw when AUTH_MODE=oidc but OIDC_CLIENT_ID is missing', () => {
    const configService = createMockConfigService({
      AUTH_MODE: 'oidc',
      OIDC_ISSUER_URL: 'https://auth.example.com',
    });
    expect(() => new AuthModeConfig(configService as ConfigService)).toThrow(
      'OIDC_CLIENT_ID is required',
    );
  });

  it('should initialise correctly when all OIDC vars are set', () => {
    const configService = createMockConfigService({
      AUTH_MODE: 'oidc',
      OIDC_ISSUER_URL: 'https://auth.example.com',
      OIDC_CLIENT_ID: 'atlas-client',
    });
    const config = new AuthModeConfig(configService as ConfigService);
    expect(config.mode).toBe('oidc');
    expect(config.isOidc).toBe(true);
    expect(config.oidcIssuerUrl).toBe('https://auth.example.com');
    expect(config.oidcClientId).toBe('atlas-client');
  });
});
