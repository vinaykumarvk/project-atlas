import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by the AuditInterceptor to detect
 * whether a controller or method should be audit-logged.
 */
export const AUDITED_KEY = 'audited';

/**
 * Options that can be passed to the @Audited() decorator
 * to customise audit behaviour.
 */
export interface AuditedOptions {
  /** Override the default resource_type derived from the route. */
  resourceType?: string;
  /** Override the default event_code mapping. */
  eventCode?: string;
}

/**
 * Marks a controller or method for automatic audit logging via
 * the AuditInterceptor.
 *
 * Usage:
 *   @Audited()                                  // defaults
 *   @Audited({ resourceType: 'Case' })          // override resource type
 *   @Audited({ eventCode: 'CUSTOM_EVENT' })     // override event code
 */
export const Audited = (options?: AuditedOptions) =>
  SetMetadata(AUDITED_KEY, options ?? {});
