import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public — bypasses the deny-by-default RBAC guard.
 * Use on health checks, login, and other unauthenticated endpoints.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
