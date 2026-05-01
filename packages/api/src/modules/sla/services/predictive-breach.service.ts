import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';

export interface BreachPrediction {
  caseId: string;
  pBreach: number; // 0-1 probability
  riskFactors: string[];
  predictedBreachAt?: Date;
}

export interface CaseDataInput {
  caseId: string;
  ageHours: number;
  tatTotalHours: number;
  priority: string;
  assigneeWorkload?: number;
  caseType?: string;
}

export interface PredictionRecord {
  caseId: string;
  pBreach: number;
  predictedAt: Date;
  actualBreached?: boolean;
}

export interface MonthlyCalibrationReport {
  month: string;
  totalPredicted: number;
  totalActual: number;
  accuracy: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
}

@Injectable()
export class PredictiveBreachService {
  private readonly logger = new Logger(PredictiveBreachService.name);

  // In-memory mock case data for getAtRiskCases
  private mockCases: CaseDataInput[] = [];

  // FR-062.A3: In-memory tracking for predicted-vs-actual calibration
  private predictionRecords: PredictionRecord[] = [];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationDispatch?: NotificationDispatchService,
  ) {}

  /**
   * Set mock case data for testing.
   */
  setMockCases(cases: CaseDataInput[]): void {
    this.mockCases = cases;
  }

  /**
   * Compute the breach probability for a given case.
   */
  async computeBreachProbability(caseData: CaseDataInput): Promise<BreachPrediction> {
    const riskFactors: string[] = [];
    let pBreach = 0;

    // Factor 1: Time consumed ratio
    const timeRatio = caseData.tatTotalHours > 0
      ? caseData.ageHours / caseData.tatTotalHours
      : 0;
    pBreach += Math.min(timeRatio * 0.5, 0.5);
    if (timeRatio > 0.7) riskFactors.push('HIGH_TIME_CONSUMED');

    // Factor 2: Priority weight
    const priorityWeights: Record<string, number> = {
      CRITICAL: 0.2,
      HIGH: 0.15,
      NORMAL: 0.05,
      LOW: 0,
    };
    pBreach += priorityWeights[caseData.priority] || 0;
    if (caseData.priority === 'CRITICAL') riskFactors.push('CRITICAL_PRIORITY');

    // Factor 3: Workload
    if (caseData.assigneeWorkload && caseData.assigneeWorkload > 10) {
      pBreach += 0.15;
      riskFactors.push('HIGH_WORKLOAD');
    }

    pBreach = Math.min(pBreach, 1);

    const roundedPBreach = Math.round(pBreach * 100) / 100;

    // FR-062.A3: Track prediction for calibration reporting
    this.predictionRecords.push({
      caseId: caseData.caseId,
      pBreach: roundedPBreach,
      predictedAt: new Date(),
    });

    return {
      caseId: caseData.caseId,
      pBreach: roundedPBreach,
      riskFactors,
      predictedBreachAt:
        pBreach > 0.5
          ? new Date(
              Date.now() +
                (caseData.tatTotalHours - caseData.ageHours) * 3600000,
            )
          : undefined,
    };
  }

  /**
   * Scan mock case data and return cases with pBreach above a threshold.
   */
  async getAtRiskCases(threshold = 0.5): Promise<BreachPrediction[]> {
    const predictions: BreachPrediction[] = [];

    for (const caseData of this.mockCases) {
      const prediction = await this.computeBreachProbability(caseData);
      if (prediction.pBreach > threshold) {
        predictions.push(prediction);
      }
    }

    return predictions.sort((a, b) => b.pBreach - a.pBreach);
  }

  /**
   * FR-062.A1: Hourly cron check for predictive breach alerts.
   * FR-062.A2: Check and alert when p_breach > 0.7 and remaining TAT > 4 hours.
   * Uses optional NotificationDispatchService to send alerts.
   */
  @Cron('0 * * * *')
  async checkAndAlert(
    caseData?: CaseDataInput,
  ): Promise<{ alerted: boolean; prediction: BreachPrediction } | void> {
    // If called by cron without arguments, scan all mock/at-risk cases
    if (!caseData) {
      for (const c of this.mockCases) {
        await this.checkAndAlert(c);
      }
      return;
    }

    const prediction = await this.computeBreachProbability(caseData);
    const ALERT_THRESHOLD = 0.7;
    const MIN_REMAINING_HOURS = 4;
    const remainingHours = caseData.tatTotalHours - caseData.ageHours;

    if (prediction.pBreach > ALERT_THRESHOLD && remainingHours > MIN_REMAINING_HOURS && this.notificationDispatch) {
      this.logger.warn(
        `High breach probability (${prediction.pBreach}) for case ${caseData.caseId}. Sending alert.`,
      );

      try {
        await this.notificationDispatch.send(
          'COLLATERAL_LEAD',
          'IN_APP' as any,
          'SLA_BREACH_WARNING',
          {
            case_number: caseData.caseId,
            breach_hours: String(
              Math.round(caseData.tatTotalHours - caseData.ageHours),
            ),
            fpr_name: 'System',
          },
          { fallbackEnabled: false },
        );

        return { alerted: true, prediction };
      } catch (error) {
        this.logger.error(
          `Failed to send breach alert for case ${caseData.caseId}: ${(error as Error).message}`,
        );
        return { alerted: false, prediction };
      }
    }

    return { alerted: false, prediction };
  }

  /**
   * FR-062.A3: Record an actual breach outcome for a previously predicted case.
   */
  recordActualOutcome(caseId: string, actualBreached: boolean): void {
    for (const record of this.predictionRecords) {
      if (record.caseId === caseId && record.actualBreached === undefined) {
        record.actualBreached = actualBreached;
        break;
      }
    }
  }

  /**
   * FR-062.A3: Predicted-vs-Actual monthly calibration report.
   * Compares predictions (cases where pBreach > 0.7) against actual breach outcomes
   * for the current month. Returns accuracy, false positive, and false negative rates.
   */
  getMonthlyCalibrationReport(): MonthlyCalibrationReport {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Filter records for the current month that have outcomes recorded
    const monthRecords = this.predictionRecords.filter((r) => {
      const recordMonth = `${r.predictedAt.getFullYear()}-${String(r.predictedAt.getMonth() + 1).padStart(2, '0')}`;
      return recordMonth === currentMonth && r.actualBreached !== undefined;
    });

    const PREDICTION_THRESHOLD = 0.7;

    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    for (const record of monthRecords) {
      const predictedBreach = record.pBreach > PREDICTION_THRESHOLD;
      const actualBreach = record.actualBreached!;

      if (predictedBreach && actualBreach) {
        truePositives++;
      } else if (predictedBreach && !actualBreach) {
        falsePositives++;
      } else if (!predictedBreach && actualBreach) {
        falseNegatives++;
      } else {
        trueNegatives++;
      }
    }

    const totalPredicted = truePositives + falsePositives;
    const totalActual = truePositives + falseNegatives;
    const total = monthRecords.length;

    const accuracy = total > 0
      ? Math.round(((truePositives + trueNegatives) / total) * 10000) / 100
      : 0;

    const falsePositiveRate = (falsePositives + trueNegatives) > 0
      ? Math.round((falsePositives / (falsePositives + trueNegatives)) * 10000) / 100
      : 0;

    const falseNegativeRate = (falseNegatives + truePositives) > 0
      ? Math.round((falseNegatives / (falseNegatives + truePositives)) * 10000) / 100
      : 0;

    return {
      month: currentMonth,
      totalPredicted,
      totalActual,
      accuracy,
      falsePositiveRate,
      falseNegativeRate,
    };
  }

  /**
   * Get all prediction records (for testing/inspection).
   */
  getPredictionRecords(): PredictionRecord[] {
    return [...this.predictionRecords];
  }
}
