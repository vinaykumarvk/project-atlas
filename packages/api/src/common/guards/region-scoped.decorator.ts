import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by the RolesGuard to detect region-scoped endpoints.
 */
export const REGION_SCOPED_KEY = 'region_scoped';

/**
 * Options for the @RegionScoped() decorator.
 */
export interface RegionScopedOptions {
  /**
   * The request parameter or body field that contains the region of the resource.
   * Defaults to 'region'.
   */
  regionParam?: string;

  /**
   * If true, a query filter named `regionScope` will be injected into
   * `request.regionFilter` for the controller to use when building DB queries.
   * Defaults to true.
   */
  injectFilter?: boolean;
}

/**
 * Decorator that marks an endpoint as region-scoped.
 *
 * When present, the RolesGuard will:
 * 1. Extract the user's regionScope from the JWT / user record
 * 2. If the resource's region does not match, return 403
 * 3. Attach `request.regionFilter` for query-level filtering
 *
 * Users with region === 'GLOBAL' are exempt from region restrictions.
 *
 * Usage:
 *   @RegionScoped()
 *   @RegionScoped({ regionParam: 'state' })
 */
export const RegionScoped = (options?: RegionScopedOptions) =>
  SetMetadata(REGION_SCOPED_KEY, options ?? {});
