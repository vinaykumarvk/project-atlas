import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

/**
 * Default max session duration: 8 hours (in milliseconds).
 */
const DEFAULT_MAX_DURATION_MS = 8 * 60 * 60 * 1000;

/**
 * Default idle timeout: 15 minutes (in milliseconds).
 */
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Guard that enforces session lifetime and idle-timeout policies
 * (FR-125.A3).
 *
 * Checks:
 *   1. Max session duration — compares the current time against
 *      `session.iat` (issued-at timestamp). If the session has been
 *      active longer than SESSION_MAX_DURATION_MS, access is denied.
 *
 *   2. Idle timeout — compares the current time against
 *      `session.lastActivity`. If the user has been idle longer
 *      than SESSION_IDLE_TIMEOUT_MS, access is denied.
 *
 * Both thresholds are configurable via environment variables:
 *   - SESSION_MAX_DURATION_MS  (default: 28800000 — 8 hours)
 *   - SESSION_IDLE_TIMEOUT_MS  (default: 1800000  — 30 minutes)
 *
 * The guard reads `iat` and `lastActivity` from the request's user/session
 * object (typically populated by the JWT strategy or session middleware).
 *
 * Usage:
 *   @UseGuards(SessionPolicyGuard)
 */
@Injectable()
export class SessionPolicyGuard implements CanActivate {
  private readonly logger = new Logger(SessionPolicyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'Access denied: authentication required for session policy enforcement',
      );
    }

    const now = Date.now();

    const maxDurationMs = parseInt(
      process.env.SESSION_MAX_DURATION_MS ?? String(DEFAULT_MAX_DURATION_MS),
      10,
    );
    const idleTimeoutMs = parseInt(
      process.env.SESSION_IDLE_TIMEOUT_MS ?? String(DEFAULT_IDLE_TIMEOUT_MS),
      10,
    );

    // FR-080.A1,A3: Vendor-specific session timeouts
    const isVendor = user.roles?.includes('VENDOR') || user.role === 'VENDOR';
    const effectiveMaxDuration = isVendor
      ? parseInt(process.env.VENDOR_SESSION_MAX_DURATION_MS ?? String(8 * 60 * 60 * 1000), 10)
      : maxDurationMs;
    const effectiveIdleTimeout = isVendor
      ? parseInt(process.env.VENDOR_SESSION_IDLE_TIMEOUT_MS ?? String(15 * 60 * 1000), 10)
      : idleTimeoutMs;

    // ── Max session duration check ──────────────────────────
    // `iat` may be a Unix timestamp in seconds (JWT standard) or
    // milliseconds. Normalise to milliseconds.
    const iat: number | undefined = user.iat ?? user.session?.iat;

    if (iat !== undefined) {
      const issuedAtMs = iat < 1e12 ? iat * 1000 : iat;
      const sessionAge = now - issuedAtMs;

      if (sessionAge > effectiveMaxDuration) {
        this.logger.warn(
          `Session max duration exceeded for user ${user.id ?? user.sub ?? 'unknown'}: ` +
            `sessionAge=${sessionAge}ms, maxDuration=${effectiveMaxDuration}ms` +
            (isVendor ? ' (vendor policy)' : ''),
        );
        throw new ForbiddenException(
          'Session expired: maximum session duration exceeded. Please re-authenticate.',
        );
      }
    }

    // ── Idle timeout check ──────────────────────────────────
    const lastActivity: number | undefined =
      user.lastActivity ?? user.session?.lastActivity;

    if (lastActivity !== undefined) {
      const lastActivityMs = lastActivity < 1e12 ? lastActivity * 1000 : lastActivity;
      const idleDuration = now - lastActivityMs;

      if (idleDuration > effectiveIdleTimeout) {
        this.logger.warn(
          `Session idle timeout exceeded for user ${user.id ?? user.sub ?? 'unknown'}: ` +
            `idleDuration=${idleDuration}ms, idleTimeout=${effectiveIdleTimeout}ms` +
            (isVendor ? ' (vendor policy)' : ''),
        );
        throw new ForbiddenException(
          'Session expired: idle timeout exceeded. Please re-authenticate.',
        );
      }
    }

    return true;
  }
}
