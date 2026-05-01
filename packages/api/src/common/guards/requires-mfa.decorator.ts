import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by the MfaGuard.
 */
export const REQUIRES_MFA_KEY = 'requires_mfa';

/**
 * Decorator that marks an endpoint as requiring MFA verification.
 *
 * In OIDC mode: the guard checks for 'mfa' in the JWT's `amr` claim.
 * In dev mode:  the check is skipped but a warning is logged.
 *
 * Usage:
 *   @RequiresMfa()
 *   @Post('approve')
 *   async approve() { ... }
 */
export const RequiresMfa = () => SetMetadata(REQUIRES_MFA_KEY, true);
