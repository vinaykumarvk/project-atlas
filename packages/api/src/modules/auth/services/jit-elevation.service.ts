import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/services/audit-log.service';

export interface ElevationRecord {
  role: string;
  expiresAt: Date;
  grantedBy: string;
}

/**
 * FR-124.A3: Just-in-Time (JIT) role elevation service.
 *
 * Provides time-bounded temporary role elevations for users.
 * Elevations are stored in memory and automatically pruned when expired.
 */
@Injectable()
export class JitElevationService {
  private readonly logger = new Logger(JitElevationService.name);
  private readonly elevations = new Map<string, ElevationRecord>();

  constructor(@Optional() private readonly auditLogService?: AuditLogService) {}

  /**
   * Elevate a user to a higher role for a specified duration.
   */
  elevate(
    userId: string,
    role: string,
    durationMinutes: number,
    grantedBy: string,
  ): { expiresAt: Date } {
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    this.elevations.set(userId, { role, expiresAt, grantedBy });
    this.logger.log(
      `JIT elevation granted: user=${userId}, role=${role}, expires=${expiresAt.toISOString()}, grantedBy=${grantedBy}`,
    );

    // FR-124.A3: Emit audit event for elevation grant
    if (this.auditLogService) {
      this.auditLogService.emit({
        event_code: 'JIT_ELEVATION_GRANTED',
        actor_id: grantedBy,
        actor_type: 'USER',
        resource_type: 'USER',
        resource_id: userId,
        action: 'ELEVATE',
        payload_json: {
          role,
          durationMinutes,
          expiresAt: expiresAt.toISOString(),
        },
      }).catch((err) => {
        this.logger.error(`Failed to emit audit event for JIT elevation grant: ${(err as Error).message}`);
      });
    }

    return { expiresAt };
  }

  /**
   * Revoke an active elevation for a user.
   */
  revoke(userId: string): boolean {
    const existed = this.elevations.has(userId);
    if (existed) {
      this.elevations.delete(userId);
      this.logger.log(`JIT elevation revoked: user=${userId}`);

      // FR-124.A3: Emit audit event for elevation revocation
      if (this.auditLogService) {
        this.auditLogService.emit({
          event_code: 'JIT_ELEVATION_REVOKED',
          actor_type: 'SYSTEM',
          resource_type: 'USER',
          resource_id: userId,
          action: 'REVOKE',
          payload_json: { userId },
        }).catch((err) => {
          this.logger.error(`Failed to emit audit event for JIT elevation revocation: ${(err as Error).message}`);
        });
      }
    }
    return existed;
  }

  /**
   * Get the active (non-expired) elevation for a user.
   */
  getActiveElevation(userId: string): ElevationRecord | null {
    const elevation = this.elevations.get(userId);
    if (!elevation) return null;
    if (elevation.expiresAt <= new Date()) {
      this.elevations.delete(userId);
      return null;
    }
    return elevation;
  }

  /**
   * Check if a user currently has an active elevation.
   */
  isElevated(userId: string): boolean {
    return this.getActiveElevation(userId) !== null;
  }

  /**
   * Remove all expired elevations. Returns the number of entries pruned.
   */
  pruneExpired(): number {
    const now = new Date();
    let pruned = 0;
    for (const [userId, elevation] of this.elevations.entries()) {
      if (elevation.expiresAt <= now) {
        this.elevations.delete(userId);
        pruned++;
      }
    }
    if (pruned > 0) {
      this.logger.log(`Pruned ${pruned} expired JIT elevation(s)`);
    }
    return pruned;
  }
}
