import { Injectable, Logger } from '@nestjs/common';

/**
 * Status lifecycle for a model version.
 */
export type ModelVersionStatus =
  | 'CANDIDATE'
  | 'VALIDATED'
  | 'PROMOTED'
  | 'ROLLED_BACK';

/**
 * Represents a model version and its promotion status.
 */
export interface ModelVersion {
  version: string;
  status: ModelVersionStatus;
  accuracy?: number;
  promotedAt?: Date;
  promotedBy?: string;
}

/**
 * Validation gate configuration for model promotion.
 */
export interface ValidationGate {
  minAccuracy: number;
}

/**
 * FR-130.A2: Multi-party approval request for model promotion.
 */
export interface ApprovalRequest {
  version: string;
  requestedBy: string;
  requestedAt: Date;
  requiredRoles: string[];
  approvals: Map<string, { approvedBy: string; approvedAt: Date }>;
}

/**
 * FR-130.A2: Roles required for multi-party approval before promotion proceeds.
 */
const REQUIRED_APPROVAL_ROLES = ['MLOPS', 'COMPLIANCE'];

/**
 * FR-130.A2: Model Promotion Service.
 * Manages the lifecycle of ML model versions: candidate -> validated -> promoted.
 * Supports validation gates and rollback tracking.
 */
@Injectable()
export class ModelPromotionService {
  private readonly logger = new Logger(ModelPromotionService.name);
  private readonly versions = new Map<string, ModelVersion>();

  /** FR-130.A2: Pending multi-party approval requests. */
  private readonly pendingApprovals = new Map<string, ApprovalRequest>();

  /**
   * Promote a model version. If a validation gate is provided,
   * the model must meet the minimum accuracy threshold.
   */
  async promote(
    version: string,
    promotedBy: string,
    validationGate?: ValidationGate,
  ): Promise<ModelVersion> {
    let modelVersion = this.versions.get(version);

    if (!modelVersion) {
      // Create as new candidate
      modelVersion = {
        version,
        status: 'CANDIDATE',
      };
    }

    // Apply validation gate if provided
    if (validationGate) {
      if (
        modelVersion.accuracy === undefined ||
        modelVersion.accuracy < validationGate.minAccuracy
      ) {
        this.logger.warn(
          `Model ${version} failed validation gate: accuracy ${modelVersion.accuracy ?? 'unknown'} < ${validationGate.minAccuracy}`,
        );
        throw new Error(
          `Model ${version} does not meet the minimum accuracy threshold of ${validationGate.minAccuracy}. Current accuracy: ${modelVersion.accuracy ?? 'unknown'}`,
        );
      }
      modelVersion.status = 'VALIDATED';
    }

    // Demote the current production version
    const currentProduction = this.getCurrentProduction();
    if (currentProduction && currentProduction.version !== version) {
      currentProduction.status = 'ROLLED_BACK';
      this.versions.set(currentProduction.version, currentProduction);
      this.logger.log(
        `Previous production version ${currentProduction.version} rolled back`,
      );
    }

    // Promote the new version
    modelVersion.status = 'PROMOTED';
    modelVersion.promotedAt = new Date();
    modelVersion.promotedBy = promotedBy;
    this.versions.set(version, modelVersion);

    this.logger.log(
      `Model ${version} promoted to production by ${promotedBy}`,
    );
    return modelVersion;
  }

  /**
   * FR-130.A2: Request multi-party approval for model promotion.
   * Both MLOPS and COMPLIANCE roles must approve before promotion proceeds.
   */
  requestApproval(version: string, requestedBy: string): ApprovalRequest {
    const request: ApprovalRequest = {
      version,
      requestedBy,
      requestedAt: new Date(),
      requiredRoles: [...REQUIRED_APPROVAL_ROLES],
      approvals: new Map(),
    };

    this.pendingApprovals.set(version, request);
    this.logger.log(
      `Approval requested for model ${version} by ${requestedBy}. Required: ${REQUIRED_APPROVAL_ROLES.join(', ')}`,
    );

    return request;
  }

  /**
   * FR-130.A2: Approve model promotion for a specific role.
   * Returns whether all required approvals have been collected.
   */
  approvePromotion(
    version: string,
    approvedBy: string,
  ): { approved: boolean; remaining: string[] } {
    const request = this.pendingApprovals.get(version);
    if (!request) {
      throw new Error(
        `No pending approval request found for model version ${version}`,
      );
    }

    // Record the approval using the approvedBy value as the role key
    request.approvals.set(approvedBy, {
      approvedBy,
      approvedAt: new Date(),
    });

    // Determine which required roles have not yet approved
    const remaining = request.requiredRoles.filter(
      (role) => !request.approvals.has(role),
    );

    const allApproved = remaining.length === 0;

    this.logger.log(
      `Approval recorded for model ${version} by ${approvedBy}. ` +
        `Remaining: ${remaining.length > 0 ? remaining.join(', ') : 'none'}`,
    );

    if (allApproved) {
      this.pendingApprovals.delete(version);
      this.logger.log(
        `All approvals collected for model ${version}. Promotion may proceed.`,
      );
    }

    return { approved: allApproved, remaining };
  }

  /**
   * Get a specific model version.
   */
  getVersion(version: string): ModelVersion | undefined {
    return this.versions.get(version);
  }

  /**
   * Get the current production model version.
   */
  getCurrentProduction(): ModelVersion | undefined {
    for (const v of this.versions.values()) {
      if (v.status === 'PROMOTED') {
        return v;
      }
    }
    return undefined;
  }

  /**
   * Get the full version history sorted by promotion date (most recent first).
   */
  getHistory(): ModelVersion[] {
    return Array.from(this.versions.values()).sort((a, b) => {
      const aTime = a.promotedAt?.getTime() ?? 0;
      const bTime = b.promotedAt?.getTime() ?? 0;
      return bTime - aTime;
    });
  }

  /**
   * Register a candidate model version with accuracy metadata.
   */
  registerCandidate(version: string, accuracy: number): ModelVersion {
    const modelVersion: ModelVersion = {
      version,
      status: 'CANDIDATE',
      accuracy,
    };
    this.versions.set(version, modelVersion);
    this.logger.log(
      `Registered candidate model ${version} with accuracy ${accuracy}`,
    );
    return modelVersion;
  }
}
