import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/auth/auth.service';
import { AuthenticatedUser } from '../../modules/auth/strategies/jwt.strategy';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import {
  REGION_SCOPED_KEY,
  RegionScopedOptions,
} from './region-scoped.decorator';

/**
 * Guard that checks:
 * 1. Role-based access (RBAC) — user must have one of the @Roles() specified.
 * 2. Region-scoped access (ABAC) — when @RegionScoped() is present, the user
 *    can only access resources within their assigned region. Users with
 *    region === 'GLOBAL' bypass region checks.
 *
 * Must be used after the JwtAuthGuard (i.e., the route must be authenticated first).
 *
 * If no @Roles() decorator is present, access is granted to any authenticated user
 * (region checks still apply if @RegionScoped() is present).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // ── FR-124.A2: @Public routes bypass all auth checks ──
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    // ── FR-124.A2: Deny-by-default — require authenticated user ──
    if (!user) {
      throw new ForbiddenException('Access denied: authentication required');
    }

    // ── RBAC check ──────────────────────────────────────────
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles && requiredRoles.length > 0) {
      if (!user.roles) {
        throw new ForbiddenException('Access denied: no roles assigned');
      }

      const hasRole = user.roles.some((role) => requiredRoles.includes(role));
      if (!hasRole) {
        throw new ForbiddenException(
          'Access denied: insufficient role permissions',
        );
      }
    }

    // ── ABAC region check ───────────────────────────────────
    const regionOptions = this.reflector.getAllAndOverride<
      RegionScopedOptions | undefined
    >(REGION_SCOPED_KEY, [context.getHandler(), context.getClass()]);

    if (regionOptions !== undefined) {
      if (!user) {
        throw new ForbiddenException('Access denied: authentication required for region-scoped resource');
      }

      const userRegion = user.region;

      // Users with GLOBAL region can access everything
      if (userRegion !== 'GLOBAL') {
        const regionParam = regionOptions.regionParam ?? 'region';

        // Check route params and query params for the resource's region
        const resourceRegion: string | undefined =
          request.params?.[regionParam] ??
          request.query?.[regionParam] ??
          request.body?.[regionParam];

        // If a specific resource region is in the request, enforce it
        if (resourceRegion && userRegion && resourceRegion !== userRegion) {
          this.logger.warn(
            `Region access denied: user region=${userRegion}, resource region=${resourceRegion}`,
          );
          throw new ForbiddenException(
            'Access denied: resource is outside your assigned region',
          );
        }

        // Inject a region filter for query-level scoping
        const injectFilter = regionOptions.injectFilter !== false;
        if (injectFilter && userRegion) {
          request.regionFilter = { region: userRegion };
        }
      }
    }

    return true;
  }
}
