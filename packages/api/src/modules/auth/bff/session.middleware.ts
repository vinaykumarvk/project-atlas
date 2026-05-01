import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Cookie names used by the BFF session layer.
 */
export const SESSION_COOKIE = 'atlas_session';
export const CSRF_COOKIE = 'atlas_csrf';
export const CSRF_HEADER = 'x-csrf-token';

type RequestWithCookies = Request & {
  cookies?: Record<string, string>;
};

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey || rawValue.length === 0) return cookies;
    cookies[rawKey] = decodeURIComponent(rawValue.join('='));
    return cookies;
  }, {});
}

/**
 * Session middleware that:
 * 1. Reads the httpOnly session cookie and attaches the JWT to the Authorization header
 *    (so that JwtAuthGuard / JwtStrategy can process it transparently).
 * 2. Sets a CSRF double-submit cookie if one does not exist.
 *
 * This middleware should be applied before the auth guards.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SessionMiddleware.name);

  use(req: RequestWithCookies, res: Response, next: NextFunction): void {
    req.cookies = req.cookies ?? parseCookieHeader(req.headers.cookie);

    // If the request has a session cookie but no Authorization header,
    // promote the cookie value into the header.
    const sessionToken = req.cookies?.[SESSION_COOKIE];
    if (sessionToken && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${sessionToken}`;
    }

    // Ensure a CSRF double-submit cookie exists for every response
    if (!req.cookies?.[CSRF_COOKIE]) {
      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE, csrfToken, {
        httpOnly: false, // readable by JS so the SPA can send it as a header
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 1000, // 1 hour
      });
    }

    next();
  }
}

/**
 * Helper to set the httpOnly session cookie from a JWT.
 */
export function setSessionCookie(
  res: Response,
  jwt: string,
  maxAgeSeconds: number,
): void {
  res.cookie(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  });
}

/**
 * Helper to clear the session (and CSRF) cookies.
 */
export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}
