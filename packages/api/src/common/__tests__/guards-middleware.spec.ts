import { ForbiddenException } from '@nestjs/common';
import { SessionPolicyGuard } from '../guards/session-policy.guard';
import { ProdEmailGuard } from '../guards/prod-email.guard';
import { ApiDeprecationMiddleware } from '../middleware/api-deprecation.middleware';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockExecutionContext(user: Record<string, unknown> | null, body?: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        body: body ?? {},
      }),
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

// ---------------------------------------------------------------------------
// SessionPolicyGuard
// ---------------------------------------------------------------------------

describe('SessionPolicyGuard', () => {
  let guard: SessionPolicyGuard;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    guard = new SessionPolicyGuard();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws ForbiddenException when no user is present', () => {
    const ctx = mockExecutionContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows request when session is fresh', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const ctx = mockExecutionContext({ id: 'u1', iat: nowSec, lastActivity: nowSec });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when session max duration exceeded', () => {
    // Set max duration to 1 second
    process.env.SESSION_MAX_DURATION_MS = '1000';
    guard = new SessionPolicyGuard();

    const oldIat = Math.floor(Date.now() / 1000) - 60; // 60 seconds ago
    const ctx = mockExecutionContext({ id: 'u1', iat: oldIat });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('maximum session duration exceeded');
  });

  it('rejects when idle timeout exceeded', () => {
    process.env.SESSION_IDLE_TIMEOUT_MS = '1000';
    guard = new SessionPolicyGuard();

    const ctx = mockExecutionContext({
      id: 'u1',
      iat: Math.floor(Date.now() / 1000),
      lastActivity: Math.floor(Date.now() / 1000) - 60, // 60 sec idle
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('idle timeout exceeded');
  });

  it('allows request when both checks pass', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const ctx = mockExecutionContext({ id: 'u1', iat: nowSec, lastActivity: nowSec });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProdEmailGuard
// ---------------------------------------------------------------------------

describe('ProdEmailGuard', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows request in production', () => {
    process.env.NODE_ENV = 'production';
    const guard = new ProdEmailGuard();
    const ctx = mockExecutionContext({});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks request in development', () => {
    process.env.NODE_ENV = 'development';
    const guard = new ProdEmailGuard();
    const ctx = mockExecutionContext(
      {},
      { to: 'test@example.com', subject: 'Test' },
    );
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('blocks request in test environment', () => {
    process.env.NODE_ENV = 'test';
    const guard = new ProdEmailGuard();
    const ctx = mockExecutionContext({});
    expect(guard.canActivate(ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ApiDeprecationMiddleware
// ---------------------------------------------------------------------------

describe('ApiDeprecationMiddleware', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('passes through when no deprecated versions configured', () => {
    process.env.API_DEPRECATED_VERSIONS = '';
    const middleware = new ApiDeprecationMiddleware();
    const req = { url: '/v1/cases', method: 'GET' } as any;
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(headers['Deprecation']).toBeUndefined();
  });

  it('adds deprecation headers for deprecated version', () => {
    process.env.API_DEPRECATED_VERSIONS = 'v0,v0.5';
    const middleware = new ApiDeprecationMiddleware();
    const req = { url: '/v0/cases', method: 'GET' } as any;
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(headers['Deprecation']).toBe('true');
    expect(headers['X-Api-Deprecated']).toBe('true');
    expect(headers['Sunset']).toBeDefined();
  });

  it('does not add headers for non-deprecated version', () => {
    process.env.API_DEPRECATED_VERSIONS = 'v0';
    const middleware = new ApiDeprecationMiddleware();
    const req = { url: '/v1/cases', method: 'GET' } as any;
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(headers['Deprecation']).toBeUndefined();
  });

  it('still calls next() even for deprecated versions (warning, not blocking)', () => {
    process.env.API_DEPRECATED_VERSIONS = 'v0';
    const middleware = new ApiDeprecationMiddleware();
    const req = { url: '/v0/data', method: 'POST' } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
