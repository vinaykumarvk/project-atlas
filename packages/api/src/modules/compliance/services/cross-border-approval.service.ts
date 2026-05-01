import { Injectable, Logger } from '@nestjs/common';

/**
 * Represents a cross-border data transfer approval.
 */
export interface CrossBorderApproval {
  id: string;
  sourceRegion: string;
  targetRegion: string;
  reason: string;
  approvedBy: string;
  approvedAt: Date;
  expiresAt: Date;
}

/**
 * FR-121.A2: In-memory store for cross-border data transfer approvals.
 *
 * Approvals expire after 24 hours by default. The DataRegionGuard
 * checks this service before rejecting cross-border requests.
 */
@Injectable()
export class CrossBorderApprovalService {
  private readonly logger = new Logger(CrossBorderApprovalService.name);
  private readonly approvals: CrossBorderApproval[] = [];

  /** Default approval TTL: 24 hours in milliseconds. */
  private readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

  /**
   * Create a cross-border approval record.
   */
  createApproval(
    sourceRegion: string,
    targetRegion: string,
    reason: string,
    approvedBy: string,
    ttlMs?: number,
  ): CrossBorderApproval {
    const now = new Date();
    const approval: CrossBorderApproval = {
      id: `cba-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      sourceRegion,
      targetRegion,
      reason,
      approvedBy,
      approvedAt: now,
      expiresAt: new Date(now.getTime() + (ttlMs ?? this.DEFAULT_TTL_MS)),
    };

    this.approvals.push(approval);

    this.logger.log(
      `Cross-border approval created: ${sourceRegion} -> ${targetRegion} by ${approvedBy}, expires ${approval.expiresAt.toISOString()}`,
    );

    return approval;
  }

  /**
   * Check if a valid (non-expired, matching regions) approval exists.
   * The approval must match either:
   *   - sourceRegion matches the allowed data region and targetRegion matches the request region, or
   *   - sourceRegion matches the request region and targetRegion matches the allowed data region
   * This allows bidirectional approval matching.
   */
  hasValidApproval(regionA: string, regionB: string): boolean {
    const now = new Date();

    return this.approvals.some((a) => {
      if (a.expiresAt <= now) {
        return false;
      }
      return (
        (a.sourceRegion === regionA && a.targetRegion === regionB) ||
        (a.sourceRegion === regionB && a.targetRegion === regionA)
      );
    });
  }

  /**
   * List all approvals (including expired, for audit purposes).
   */
  listApprovals(): CrossBorderApproval[] {
    return [...this.approvals];
  }

  /**
   * Clear all approvals (for testing).
   */
  clearApprovals(): void {
    this.approvals.length = 0;
  }
}
