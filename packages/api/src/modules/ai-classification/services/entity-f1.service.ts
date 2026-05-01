import { Injectable, Logger } from '@nestjs/common';

/**
 * Per-entity type metrics counters.
 */
interface EntityCounters {
  tp: number; // True Positives
  fp: number; // False Positives
  fn: number; // False Negatives
}

/**
 * Computed precision/recall/F1 metrics.
 */
export interface F1Metrics {
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Entity F1 Service (FR-011.A2).
 *
 * Tracks per-entity precision, recall, and F1 score based on
 * predicted vs actual entity values. Uses in-memory counters
 * for True Positives, False Positives, and False Negatives.
 */
@Injectable()
export class EntityF1Service {
  private readonly logger = new Logger(EntityF1Service.name);

  /** In-memory counters keyed by entity type. */
  private readonly counters = new Map<string, EntityCounters>();

  /**
   * Record a prediction result for a given entity type.
   *
   * Compares predicted values against actual values:
   * - Values in both predicted and actual = True Positives
   * - Values in predicted but not actual = False Positives
   * - Values in actual but not predicted = False Negatives
   *
   * @param entityType - The entity type (e.g., 'property_city', 'loan_account_no')
   * @param predicted  - Array of predicted entity values
   * @param actual     - Array of actual (ground truth) entity values
   */
  recordPrediction(entityType: string, predicted: string[], actual: string[]): void {
    if (!this.counters.has(entityType)) {
      this.counters.set(entityType, { tp: 0, fp: 0, fn: 0 });
    }

    const counters = this.counters.get(entityType)!;
    const predictedSet = new Set(predicted);
    const actualSet = new Set(actual);

    // True Positives: in both predicted and actual
    for (const val of predictedSet) {
      if (actualSet.has(val)) {
        counters.tp++;
      } else {
        counters.fp++;
      }
    }

    // False Negatives: in actual but not predicted
    for (const val of actualSet) {
      if (!predictedSet.has(val)) {
        counters.fn++;
      }
    }
  }

  /**
   * Get precision, recall, and F1 score for a specific entity type.
   *
   * @param entityType - The entity type to query
   * @returns Metrics object with precision, recall, f1 (all 0 if no data)
   */
  getMetrics(entityType: string): F1Metrics {
    const counters = this.counters.get(entityType);
    if (!counters) {
      return { precision: 0, recall: 0, f1: 0 };
    }

    return this.computeMetrics(counters);
  }

  /**
   * Get precision, recall, and F1 scores for all tracked entity types.
   *
   * @returns Record mapping entity type to its metrics
   */
  getAllMetrics(): Record<string, F1Metrics> {
    const result: Record<string, F1Metrics> = {};

    for (const [entityType, counters] of this.counters.entries()) {
      result[entityType] = this.computeMetrics(counters);
    }

    return result;
  }

  /**
   * Reset all counters (for testing).
   */
  reset(): void {
    this.counters.clear();
  }

  /**
   * Compute precision, recall, F1 from raw counters.
   */
  private computeMetrics(counters: EntityCounters): F1Metrics {
    const { tp, fp, fn } = counters;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return { precision, recall, f1 };
  }
}
