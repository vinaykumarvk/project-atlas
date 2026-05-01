import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SessionPolicyGuard } from '../guards/session-policy.guard';

function createMockContext(user: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('SessionPolicyGuard — Vendor session policy (FR-080.A1,A3)', () => {
  let guard: SessionPolicyGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    guard = new SessionPolicyGuard();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should apply vendor idle timeout (15 min default) for VENDOR role user', () => {
    const now = Date.now();
    // 16 minutes idle — should exceed the 15-minute vendor idle timeout
    const lastActivity = now - 16 * 60 * 1000;
    const ctx = createMockContext({
      id: 'vendor-1',
      role: 'VENDOR',
      iat: Math.floor((now - 60_000) / 1000), // issued 1 min ago
      lastActivity,
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow vendor within idle timeout window', () => {
    const now = Date.now();
    // 10 minutes idle — within the 15-minute vendor idle timeout
    const lastActivity = now - 10 * 60 * 1000;
    const ctx = createMockContext({
      id: 'vendor-2',
      role: 'VENDOR',
      iat: Math.floor((now - 60_000) / 1000),
      lastActivity,
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should apply vendor max session duration (8h default)', () => {
    const now = Date.now();
    // 9 hours ago — exceeds 8h max session duration
    const iat = Math.floor((now - 9 * 60 * 60 * 1000) / 1000);
    const ctx = createMockContext({
      id: 'vendor-3',
      roles: ['VENDOR'],
      iat,
      lastActivity: now - 1000, // recently active
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should use custom vendor timeout from env vars', () => {
    const now = Date.now();
    // Set a 5-minute vendor idle timeout
    process.env.VENDOR_SESSION_IDLE_TIMEOUT_MS = String(5 * 60 * 1000);

    // 6 minutes idle — exceeds the custom 5-minute vendor idle timeout
    const lastActivity = now - 6 * 60 * 1000;
    const ctx = createMockContext({
      id: 'vendor-4',
      role: 'VENDOR',
      iat: Math.floor((now - 60_000) / 1000),
      lastActivity,
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
