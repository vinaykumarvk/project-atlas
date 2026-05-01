import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  SetMetadata,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma';
import { CrossBorderApprovalService } from '../../modules/compliance/services/cross-border-approval.service';

/**
 * Metadata key used by DataRegionGuard to detect endpoints that enforce
 * RBI data localisation (FR-121 A1-A3).
 */
export const DATA_REGION_ENFORCED_KEY = 'data_region_enforced';

/**
 * Decorator that marks an endpoint as requiring data-region enforcement.
 *
 * When present, the DataRegionGuard will:
 * 1. Read DATA_REGION env var (default `ap-south-1`)
 * 2. If CROSS_BORDER_ENABLED is not `true`, reject any request that
 *    originates from (or targets) a region outside DATA_REGION with 403.
 * 3. Log the rejection to AuditLog for compliance traceability.
 */
export const DataRegionEnforced = () =>
  SetMetadata(DATA_REGION_ENFORCED_KEY, true);

/**
 * Guard that enforces RBI data localisation requirements (FR-121).
 *
 * - DATA_REGION env var defines the allowed region (default: ap-south-1).
 * - CROSS_BORDER_ENABLED env var (default: false) allows cross-border when true.
 * - Rejects with 403 and logs to AuditLog when a cross-border attempt is detected.
 */
@Injectable()
export class DataRegionGuard implements CanActivate {
  private readonly logger = new Logger(DataRegionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(CrossBorderApprovalService)
    private readonly crossBorderApprovalService?: CrossBorderApprovalService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // FR-121.A1: In production, enforce India-only data storage
    if (process.env.NODE_ENV === 'production') {
      const configuredRegion = process.env.DATA_REGION || 'ap-south-1';
      if (configuredRegion !== 'ap-south-1') {
        this.logger.error(
          `CRITICAL: DATA_REGION is set to "${configuredRegion}" in production. ` +
          `RBI compliance requires ap-south-1. Blocking request.`,
        );
        throw new ForbiddenException(
          'Data region violation: production data must be stored in ap-south-1 (India)',
        );
      }
    }

    const enforced = this.reflector.getAllAndOverride<boolean>(
      DATA_REGION_ENFORCED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!enforced) {
      return true;
    }

    const dataRegion = process.env.DATA_REGION || 'ap-south-1';
    const crossBorderEnabled =
      process.env.CROSS_BORDER_ENABLED?.toLowerCase() === 'true';

    if (crossBorderEnabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const requestRegion: string | undefined =
      request.headers?.['x-data-region'] ??
      request.query?.dataRegion ??
      request.body?.dataRegion;

    if (requestRegion && requestRegion !== dataRegion) {
      // FR-121.A2: Check if a valid cross-border approval exists before blocking
      if (
        this.crossBorderApprovalService &&
        this.crossBorderApprovalService.hasValidApproval(dataRegion, requestRegion)
      ) {
        this.logger.log(
          `Cross-border access allowed via approval: requestRegion=${requestRegion}, allowedRegion=${dataRegion}`,
        );
        return true;
      }

      const userId = request.user?.sub ?? request.user?.id ?? 'anonymous';

      this.logger.warn(
        `Cross-border data access blocked: user=${userId}, requestRegion=${requestRegion}, allowedRegion=${dataRegion}`,
      );

      // Log to AuditLog for compliance (fire-and-forget)
      this.prisma.auditLog
        .create({
          data: {
            event_code: 'CROSS_BORDER_BLOCKED',
            actor_id: typeof userId === 'string' && userId !== 'anonymous' ? userId : null,
            actor_type: 'USER',
            resource_type: 'DataRegion',
            action: 'ACCESS_DENIED',
            payload_json: {
              requestRegion,
              allowedRegion: dataRegion,
              path: request.url,
              method: request.method,
            },
            ip_address: request.ip ?? null,
            user_agent: request.headers?.['user-agent'] ?? null,
            row_hash: 'pending',
          },
        })
        .catch((err: Error) => {
          this.logger.error(
            `Failed to log cross-border audit event: ${err.message}`,
          );
        });

      throw new ForbiddenException(
        'Cross-border data access is not permitted. Data must remain within the configured region.',
      );
    }

    return true;
  }
}
