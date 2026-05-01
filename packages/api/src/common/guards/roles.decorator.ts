import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/auth/auth.service';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which roles are allowed to access a route.
 * Usage: @Roles(UserRole.SYS_ADMIN, UserRole.COLLATERAL_LEAD)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
