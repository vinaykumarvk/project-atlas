import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * FR-140.A3: API Version Deprecation Middleware.
 *
 * Reads API_DEPRECATED_VERSIONS env var (comma-separated, e.g. "v0,v0.5") and
 * checks if the request URL contains a deprecated version prefix. When a
 * deprecated version is detected the middleware adds standard deprecation
 * headers to the response but still allows the request through (warning, not
 * blocking).
 *
 * Headers added on deprecated version match:
 *   - Sunset: <RFC 7231 date string>
 *   - Deprecation: true
 *   - X-Api-Deprecated: true
 *
 * Usage:
 *   consumer.apply(ApiDeprecationMiddleware).forRoutes('*');
 */
@Injectable()
export class ApiDeprecationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiDeprecationMiddleware.name);
  private readonly deprecatedVersions: string[];

  constructor() {
    const raw = process.env.API_DEPRECATED_VERSIONS || '';
    this.deprecatedVersions = raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (this.deprecatedVersions.length > 0) {
      this.logger.log(
        `Deprecated API versions loaded: ${this.deprecatedVersions.join(', ')}`,
      );
    }
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if (this.deprecatedVersions.length === 0) {
      return next();
    }

    const matchedVersion = this.findDeprecatedVersion(req.url);

    if (matchedVersion) {
      // RFC 7231 / draft-ietf-httpapi-deprecation-header compliant headers
      res.setHeader('Sunset', new Date().toUTCString());
      res.setHeader('Deprecation', 'true');
      res.setHeader('X-Api-Deprecated', 'true');

      this.logger.warn(
        `Deprecated API version "${matchedVersion}" accessed: ${req.method} ${req.url}`,
      );
    }

    next();
  }

  /**
   * Check if the request URL starts with (or contains) a deprecated version
   * prefix segment. Matches patterns like `/v0/resource` or `/api/v0.5/resource`.
   */
  private findDeprecatedVersion(url: string): string | null {
    // Normalise: split on '/' and check each segment
    const segments = url.split('/').filter((s) => s.length > 0);

    for (const version of this.deprecatedVersions) {
      if (segments.some((segment) => segment === version)) {
        return version;
      }
    }

    return null;
  }
}
