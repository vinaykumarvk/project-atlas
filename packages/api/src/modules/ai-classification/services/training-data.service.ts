import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../common/prisma';

/**
 * Represents a single training example with correction data.
 */
export interface TrainingExample {
  emailId: string;
  originalLabel: string;
  correctedLabel: string;
  correctedBy: string;
  correctedAt: Date;
  features: Record<string, unknown>;
}

/**
 * FR-132.A2 + FR-132.A3: Training Data Service.
 * Collects human-corrected labels for model retraining.
 * Supports JSONL export and retraining threshold detection.
 */
@Injectable()
export class TrainingDataService {
  private readonly logger = new Logger(TrainingDataService.name);
  private corrections: TrainingExample[] = [];
  private readonly defaultThreshold = 100;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Record a correction (human override of a model prediction).
   */
  recordCorrection(
    example: Omit<TrainingExample, 'correctedAt'>,
  ): void {
    const correction: TrainingExample = {
      ...example,
      correctedAt: new Date(),
    };
    this.corrections.push(correction);
    this.logger.debug(
      `Correction recorded: ${example.originalLabel} -> ${example.correctedLabel} by ${example.correctedBy}`,
    );
  }

  /**
   * Get the most recent corrections, optionally limited.
   */
  getCorrections(limit?: number): TrainingExample[] {
    if (limit !== undefined && limit > 0) {
      return this.corrections.slice(-limit);
    }
    return [...this.corrections];
  }

  /**
   * Export all corrections as JSONL (JSON Lines) format for training pipelines.
   */
  exportAsJsonl(): string {
    return this.corrections
      .map((c) => JSON.stringify(c))
      .join('\n');
  }

  /**
   * Get the total number of corrections recorded.
   */
  getCorrectionCount(): number {
    return this.corrections.length;
  }

  /**
   * Clear all exported corrections (after successful export/ingestion).
   */
  clearExported(): void {
    const count = this.corrections.length;
    this.corrections = [];
    this.logger.log(`Cleared ${count} exported corrections`);
  }

  /**
   * FR-132.A3: Check if the correction count has reached the retraining threshold.
   */
  shouldTriggerRetraining(threshold?: number): boolean {
    const effectiveThreshold = threshold ?? this.defaultThreshold;
    return this.corrections.length >= effectiveThreshold;
  }

  /**
   * FR-132.A3: Get the current retraining status.
   */
  getRetrainingStatus(threshold?: number): {
    correctionCount: number;
    threshold: number;
    ready: boolean;
  } {
    const effectiveThreshold = threshold ?? this.defaultThreshold;
    return {
      correctionCount: this.corrections.length,
      threshold: effectiveThreshold,
      ready: this.corrections.length >= effectiveThreshold,
    };
  }

  /**
   * FR-132.A3: Get the retraining schedule.
   * Returns the next scheduled retraining date and cadence.
   * The schedule follows a monthly cadence, with the next run on the 1st of the next month.
   */
  getRetrainingSchedule(): { nextScheduled: Date; cadence: string } {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 2, 0, 0);
    return {
      nextScheduled: nextMonth,
      cadence: 'MONTHLY',
    };
  }

  /**
   * FR-132.A3: Trigger a retraining job.
   * Queues a retraining job and returns a job ID with QUEUED status.
   * In production, this would submit the job to an ML pipeline (e.g., SageMaker).
   */
  triggerRetraining(): { jobId: string; status: 'QUEUED' } {
    const jobId = `retrain-${randomUUID()}`;
    this.logger.log(
      `Retraining job queued: jobId=${jobId}, corrections=${this.corrections.length}`,
    );
    return {
      jobId,
      status: 'QUEUED',
    };
  }

  /**
   * FR-132.A2: Persist a correction to the database via the audit log.
   * Falls back to in-memory storage if PrismaService is not available.
   */
  async persistCorrectionToDb(
    example: Omit<TrainingExample, 'correctedAt'>,
  ): Promise<void> {
    // Always record in-memory
    this.recordCorrection(example);

    if (!this.prisma) {
      this.logger.debug('PrismaService not available — correction stored in-memory only');
      return;
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          event_code: 'CLASSIFICATION_CORRECTION',
          actor_type: 'USER',
          actor_id: example.correctedBy,
          resource_type: 'EmailIngest',
          resource_id: example.emailId,
          action: 'CORRECT_LABEL',
          payload_json: JSON.parse(JSON.stringify({
            original_label: example.originalLabel,
            corrected_label: example.correctedLabel,
            corrected_by: example.correctedBy,
            features: example.features,
          })),
          row_hash: '',
        },
      });

      this.logger.debug(
        `Correction persisted to DB: ${example.originalLabel} -> ${example.correctedLabel}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to persist correction to DB: ${(err as Error).message}`,
      );
    }
  }

  /**
   * FR-132.A2: Export corrections from the database.
   * Retrieves all CLASSIFICATION_CORRECTION audit log entries and returns
   * them as TrainingExample objects.
   */
  async exportFromDb(limit?: number): Promise<TrainingExample[]> {
    if (!this.prisma) {
      this.logger.warn('PrismaService not available — returning in-memory corrections');
      return this.getCorrections(limit);
    }

    try {
      const records = await this.prisma.auditLog.findMany({
        where: { event_code: 'CLASSIFICATION_CORRECTION' },
        orderBy: { created_at: 'desc' },
        ...(limit ? { take: limit } : {}),
      });

      return records.map((r) => {
        const payload = r.payload_json as Record<string, any>;
        return {
          emailId: r.resource_id || '',
          originalLabel: payload?.original_label || '',
          correctedLabel: payload?.corrected_label || '',
          correctedBy: payload?.corrected_by || r.actor_id || '',
          correctedAt: r.created_at,
          features: payload?.features || {},
        };
      });
    } catch (err) {
      this.logger.error(`Failed to export corrections from DB: ${(err as Error).message}`);
      return this.getCorrections(limit);
    }
  }

  /**
   * FR-132.A3: Check retraining readiness using DB-persisted corrections count.
   */
  async checkDbRetrainingReadiness(threshold?: number): Promise<{
    correctionCount: number;
    threshold: number;
    ready: boolean;
  }> {
    const effectiveThreshold = threshold ?? this.defaultThreshold;

    if (!this.prisma) {
      return this.getRetrainingStatus(effectiveThreshold);
    }

    try {
      const count = await this.prisma.auditLog.count({
        where: { event_code: 'CLASSIFICATION_CORRECTION' },
      });

      return {
        correctionCount: count,
        threshold: effectiveThreshold,
        ready: count >= effectiveThreshold,
      };
    } catch (err) {
      this.logger.error(`Failed to check DB readiness: ${(err as Error).message}`);
      return this.getRetrainingStatus(effectiveThreshold);
    }
  }
}
