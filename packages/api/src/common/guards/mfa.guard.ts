import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthModeConfig } from '../../modules/auth/config/auth-mode.config';
import { AuthenticatedUser } from '../../modules/auth/strategies/jwt.strategy';
import { UserRole } from '../../modules/auth/auth.service';
import { REQUIRES_MFA_KEY } from './requires-mfa.decorator';

/**
 * FR-125.A2: Roles that always require MFA, even without the @RequiresMfa() decorator.
 */
const MFA_REQUIRED_ROLES: string[] = [
  UserRole.SYS_ADMIN,
  UserRole.MASTER_DATA_ADMIN,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.COLLATERAL_HEAD,
];

/**
 * Guard that enforces MFA (Multi-Factor Authentication) on endpoints
 * decorated with @RequiresMfa(), and auto-enforces for certain roles.
 *
 * Behaviour varies by auth mode:
 *
 *   OIDC mode:
 *     Checks that the JWT's `amr` claim includes 'mfa'.
 *     Returns 403 if MFA was not used during authentication.
 *
 *   Dev mode:
 *     Skips enforcement but logs a warning so developers are
 *     aware that MFA would be required in production.
 *
 * FR-125.A2: Auto-enforces MFA for SYS_ADMIN, MASTER_DATA_ADMIN,
 *            COMPLIANCE_OFFICER, and COLLATERAL_HEAD roles.
 * FR-080.A3: Auto-enforces MFA for VENDOR users whose caseCount
 *            exceeds the VENDOR_MFA_CASE_THRESHOLD (default 50).
 */
@Injectable()
export class MfaGuard implements CanActivate {
  private readonly logger = new Logger(MfaGuard.name);
  private readonly vendorMfaCaseThreshold: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly authModeConfig: AuthModeConfig,
    private readonly configService: ConfigService,
  ) {
    this.vendorMfaCaseThreshold = parseInt(
      this.configService.get<string>('VENDOR_MFA_CASE_THRESHOLD', '50'),
      10,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const requiresMfa = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_MFA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Extract user early — needed for role-based auto-enforcement
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    // FR-125.A2: Check if the user's role requires MFA regardless of decorator
    const roleRequiresMfa = user
      ? user.roles.some((role) => MFA_REQUIRED_ROLES.includes(role))
      : false;

    // FR-080.A3: Check if vendor exceeds case threshold
    const vendorRequiresMfa = user
      ? user.roles.includes(UserRole.VENDOR) &&
        typeof (user as unknown as Record<string, unknown>).caseCount === 'number' &&
        ((user as unknown as Record<string, unknown>).caseCount as number) > this.vendorMfaCaseThreshold
      : false;

    const mfaRequired = requiresMfa || roleRequiresMfa || vendorRequiresMfa;

    // Not required by decorator, role, or vendor threshold — pass through
    if (!mfaRequired) {
      return true;
    }

    // Dev mode — skip but warn
    if (this.authModeConfig.isDev) {
      this.logger.warn(
        'MFA check skipped in dev mode. This endpoint requires MFA in production.',
      );
      return true;
    }

    // OIDC mode — enforce MFA via amr claim
    if (!user) {
      throw new ForbiddenException(
        'Access denied: authentication required for MFA-protected resource',
      );
    }

    const amr = user.amr ?? [];
    if (!amr.includes('mfa')) {
      this.logger.warn(
        `MFA required but not present for user ${user.id}. amr=${JSON.stringify(amr)}`,
      );
      throw new ForbiddenException(
        'Access denied: multi-factor authentication is required for this action',
      );
    }

    return true;
  }
}
