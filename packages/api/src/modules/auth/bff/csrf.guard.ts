import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from './session.middleware';

/**
 * CSRF protection guard using the double-submit cookie pattern.
 *
 * For state-changing requests (POST, PUT, PATCH, DELETE) that originate
 * from the BFF session (i.e. the session cookie is present), this guard
 * verifies that the value of the `x-csrf-token` header matches the
 * `atlas_csrf` cookie.
 *
 * GET / HEAD / OPTIONS requests are exempt.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  private readonly safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Safe methods are exempt
    if (this.safeMethods.has(request.method.toUpperCase())) {
      return true;
    }

    // Only enforce CSRF when a session cookie is present
    // (Bearer-token-only requests from non-browser clients are not subject to CSRF)
    const sessionCookie = request.cookies?.[SESSION_COOKIE];
    if (!sessionCookie) {
      return true;
    }

    const cookieToken: string | undefined = request.cookies?.[CSRF_COOKIE];
    const headerToken: string | undefined = request.headers[CSRF_HEADER] as string | undefined;

    if (!cookieToken || !headerToken) {
      this.logger.warn('CSRF validation failed: missing token');
      throw new ForbiddenException('CSRF token missing');
    }

    if (cookieToken !== headerToken) {
      this.logger.warn('CSRF validation failed: token mismatch');
      throw new ForbiddenException('CSRF token mismatch');
    }

    return true;
  }
}
