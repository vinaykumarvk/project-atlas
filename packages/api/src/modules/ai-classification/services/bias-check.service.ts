import { Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { NotificationChannel } from '../../notifications/types';

/**
 * Metrics for a specific group within a fairness dimension.
 */
export interface BiasMetric {
  group: string;
  groupValue: string;
  accuracy: number;
  sampleCount: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
}

/**
 * Full fairness report across one or more dimensions.
 */
export interface FairnessReport {
  generatedAt: Date;
  dimensions: string[];
  metrics: BiasMetric[];
  overallAccuracy: number;
  maxDisparityPercent: number;
  fairnessPass: boolean; // true if max disparity < 10%
}

/**
 * A recorded prediction with demographic/attribute data.
 */
interface PredictionRecord {
  predicted: string;
  actual: string;
  attributes: Record<string, string>;
}

/**
 * FR-134.A1+A2: Bias Check Service.
 * Records predictions with demographic attributes and generates
 * fairness reports comparing accuracy and error rates across groups.
 * A disparity threshold of 10% determines pass/fail.
 */
@Injectable()
export class BiasCheckService {
  private readonly logger = new Logger(BiasCheckService.name);
  private predictions: PredictionRecord[] = [];

  constructor(
    @Optional() private readonly notificationDispatch?: NotificationDispatchService,
  ) {}

  /**
   * Record a prediction with its actual label and demographic attributes.
   */
  recordPrediction(
    predicted: string,
    actual: string,
    attributes: Record<string, string>,
  ): void {
    this.predictions.push({ predicted, actual, attributes });
  }

  /**
   * Generate a fairness report across the specified dimensions.
   */
  generateReport(dimensions: string[]): FairnessReport {
    const metrics: BiasMetric[] = [];
    let overallCorrect = 0;
    let overallTotal = 0;

    for (const dimension of dimensions) {
      // Group predictions by this dimension's value
      const groups = new Map<string, PredictionRecord[]>();

      for (const pred of this.predictions) {
        const groupValue = pred.attributes[dimension];
        if (groupValue === undefined) continue;

        if (!groups.has(groupValue)) {
          groups.set(groupValue, []);
        }
        groups.get(groupValue)!.push(pred);
      }

      // Compute metrics for each group
      for (const [groupValue, preds] of groups.entries()) {
        const sampleCount = preds.length;
        let correct = 0;
        let falsePositives = 0;
        let falseNegatives = 0;

        for (const pred of preds) {
          const isCorrect = pred.predicted === pred.actual;
          if (isCorrect) {
            correct++;
          } else {
            // For multi-class, we treat a wrong prediction as both FP and FN
            falsePositives++;
            falseNegatives++;
          }
        }

        const accuracy = sampleCount > 0 ? correct / sampleCount : 0;
        const falsePositiveRate =
          sampleCount > 0 ? falsePositives / sampleCount : 0;
        const falseNegativeRate =
          sampleCount > 0 ? falseNegatives / sampleCount : 0;

        metrics.push({
          group: dimension,
          groupValue,
          accuracy,
          sampleCount,
          falsePositiveRate,
          falseNegativeRate,
        });

        overallCorrect += correct;
        overallTotal += sampleCount;
      }
    }

    const overallAccuracy =
      overallTotal > 0 ? overallCorrect / overallTotal : 0;

    // Compute max disparity: max difference in accuracy between any two groups
    // within the same dimension
    let maxDisparityPercent = 0;
    for (const dimension of dimensions) {
      const dimMetrics = metrics.filter((m) => m.group === dimension);
      if (dimMetrics.length < 2) continue;

      const accuracies = dimMetrics.map((m) => m.accuracy);
      const maxAcc = Math.max(...accuracies);
      const minAcc = Math.min(...accuracies);
      const disparity = (maxAcc - minAcc) * 100;
      if (disparity > maxDisparityPercent) {
        maxDisparityPercent = disparity;
      }
    }

    const fairnessPass = maxDisparityPercent < 10;

    this.logger.log(
      `Fairness report generated: overall accuracy ${(overallAccuracy * 100).toFixed(1)}%, max disparity ${maxDisparityPercent.toFixed(1)}%, pass=${fairnessPass}`,
    );

    const report: FairnessReport = {
      generatedAt: new Date(),
      dimensions,
      metrics,
      overallAccuracy,
      maxDisparityPercent,
      fairnessPass,
    };

    // FR-134.A2: Notify MLOPS and COMPLIANCE_OFFICER on bias failure
    if (!fairnessPass && this.notificationDispatch) {
      const biasVars: Record<string, string> = {
        disparity: maxDisparityPercent.toFixed(1),
        accuracy: (overallAccuracy * 100).toFixed(1),
        dimensions: dimensions.join(', '),
      };

      // Register a one-off template for bias alerts if not already present
      this.notificationDispatch.registerTemplate({
        code: 'BIAS_FINDING_ALERT',
        subject: 'Bias Check FAILED — Disparity {{disparity}}%',
        body:
          'A fairness report has FAILED. Max disparity: {{disparity}}%. ' +
          'Overall accuracy: {{accuracy}}%. Dimensions checked: {{dimensions}}. ' +
          'Please review the bias report in the Atlas dashboard.',
      });

      const recipients = ['MLOPS', 'COMPLIANCE_OFFICER'];
      for (const recipient of recipients) {
        this.notificationDispatch
          .send(
            recipient,
            NotificationChannel.IN_APP,
            'BIAS_FINDING_ALERT',
            biasVars,
            { fallbackEnabled: false },
          )
          .catch((err) =>
            this.logger.warn(
              `Failed to notify ${recipient} of bias finding: ${(err as Error).message}`,
            ),
          );
      }

      this.logger.warn(
        'Bias check FAILED — notifications dispatched to MLOPS and COMPLIANCE_OFFICER',
      );

      // FR-134.A2: Trigger MLOps model review for bias findings
      this.triggerModelReview(report);
    }

    return report;
  }

  /**
   * FR-134.A2: Trigger a model review when bias findings exceed thresholds.
   * Creates a structured triage ticket for the MLOps team with
   * the full fairness report details.
   */
  triggerModelReview(report: FairnessReport): {
    reviewId: string;
    status: 'PENDING_REVIEW';
    disparity: number;
    dimensions: string[];
    triggeredAt: Date;
  } {
    const reviewId = `bias-review-${Date.now()}`;
    const triggeredAt = new Date();

    this.logger.warn(
      `MLOps model review triggered: reviewId=${reviewId}, ` +
      `disparity=${report.maxDisparityPercent.toFixed(1)}%, ` +
      `dimensions=[${report.dimensions.join(', ')}]`,
    );

    // Dispatch a HIGH-priority in-app notification to MLOPS if notification service is available
    if (this.notificationDispatch) {
      this.notificationDispatch.registerTemplate({
        code: 'BIAS_MODEL_REVIEW',
        subject: 'Model Review Required — Bias Disparity {{disparity}}%',
        body:
          'A model review has been triggered due to bias disparity of {{disparity}}%. ' +
          'Review ID: {{reviewId}}. Dimensions: {{dimensions}}. ' +
          'Please evaluate the model for retraining or rule adjustments.',
      });

      this.notificationDispatch
        .send(
          'MLOPS',
          NotificationChannel.IN_APP,
          'BIAS_MODEL_REVIEW',
          {
            disparity: report.maxDisparityPercent.toFixed(1),
            reviewId,
            dimensions: report.dimensions.join(', '),
          },
          { fallbackEnabled: false },
        )
        .catch((err) =>
          this.logger.warn(
            `Failed to send model review notification: ${(err as Error).message}`,
          ),
        );
    }

    return {
      reviewId,
      status: 'PENDING_REVIEW',
      disparity: report.maxDisparityPercent,
      dimensions: report.dimensions,
      triggeredAt,
    };
  }

  /**
   * Quick check for fairness on a single dimension.
   */
  checkFairness(dimension: string): { pass: boolean; disparity: number } {
    const report = this.generateReport([dimension]);
    return {
      pass: report.fairnessPass,
      disparity: report.maxDisparityPercent,
    };
  }
}
