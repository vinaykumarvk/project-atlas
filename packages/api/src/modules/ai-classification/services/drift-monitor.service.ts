import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

/**
 * Weekly snapshot of classification metrics for drift detection.
 */
export interface WeeklySnapshot {
  /** ISO week identifier, e.g. "2026-W18" */
  week: string;
  /** Number of classifications recorded in this week. */
  sampleCount: number;
  /** Average confidence across all classifications. */
  avgConfidence: number;
  /** Category distribution: label -> count */
  categoryDistribution: Record<string, number>;
  /** Sum of all confidence values (internal; used for running average). */
  confidenceSum: number;
}

/**
 * Drift report returned by getWeeklyReport().
 */
export interface DriftReport {
  /** The current week snapshot. */
  currentWeek: WeeklySnapshot | null;
  /** Historical weekly snapshots, most recent first. */
  history: WeeklySnapshot[];
  /** Baseline average confidence (from the earliest week on record). */
  baselineAvgConfidence: number | null;
  /** Whether a confidence drift alert has been raised. */
  confidenceDriftAlert: boolean;
  /** If drifted, by how much (percentage points). Negative = confidence dropped. */
  confidenceDriftDelta: number | null;
  /** Category distribution drift flags: label -> true if distribution changed significantly. */
  categoryDriftFlags: Record<string, boolean>;
  /** Population Stability Index score (null if not enough data). */
  psiScore: number | null;
}

/**
 * Interface for notification dispatch (optional dependency).
 */
export interface NotificationDispatchServiceInterface {
  send(
    recipientId: string,
    channel: unknown,
    templateCode: string,
    variables: Record<string, string>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  registerTemplate(template: { code: string; subject: string; body: string }): void;
}

/**
 * In-memory drift monitoring service.
 *
 * Tracks per-week:
 *  - Confidence distribution (average)
 *  - Category distribution (count per label)
 *
 * Raises an alert when the average confidence drops by more than 5 percentage
 * points compared to the baseline (the first week recorded).
 *
 * In production this data would be persisted to a database; for now it is
 * held in memory and resets on application restart.
 */
@Injectable()
export class DriftMonitorService {
  private readonly logger = new Logger(DriftMonitorService.name);

  /** Optional Prisma service for snapshot persistence. */
  private readonly prisma?: PrismaService;
  /** Optional notification dispatch service for drift alerts. */
  private readonly notificationDispatch?: NotificationDispatchServiceInterface;

  constructor(
    @Optional() prisma?: PrismaService,
    @Optional() notificationDispatch?: NotificationDispatchServiceInterface,
  ) {
    this.prisma = prisma;
    this.notificationDispatch = notificationDispatch;
  }

  /** Alert threshold: a drop of this many percentage points triggers an alert. */
  private readonly driftThresholdPct = 5;

  /** Category distribution change threshold (percentage points). */
  private readonly categoryDriftThresholdPct = 10;

  /** In-memory store keyed by ISO week string. */
  private readonly weeklyData = new Map<string, WeeklySnapshot>();

  /**
   * Record a single classification result for drift tracking.
   */
  record(confidence: number, label: string): void {
    const week = this.getCurrentWeek();
    let snapshot = this.weeklyData.get(week);

    if (!snapshot) {
      snapshot = {
        week,
        sampleCount: 0,
        avgConfidence: 0,
        categoryDistribution: {},
        confidenceSum: 0,
      };
      this.weeklyData.set(week, snapshot);
    }

    snapshot.sampleCount++;
    snapshot.confidenceSum += confidence;
    snapshot.avgConfidence = snapshot.confidenceSum / snapshot.sampleCount;
    snapshot.categoryDistribution[label] = (snapshot.categoryDistribution[label] || 0) + 1;
  }

  /**
   * Generate a weekly drift report.
   */
  getWeeklyReport(): DriftReport {
    const allWeeks = Array.from(this.weeklyData.values()).sort(
      (a, b) => a.week.localeCompare(b.week),
    );

    if (allWeeks.length === 0) {
      return {
        currentWeek: null,
        history: [],
        baselineAvgConfidence: null,
        confidenceDriftAlert: false,
        confidenceDriftDelta: null,
        categoryDriftFlags: {},
        psiScore: null,
      };
    }

    const baseline = allWeeks[0];
    const currentWeek = allWeeks[allWeeks.length - 1];

    // Confidence drift detection
    let confidenceDriftAlert = false;
    let confidenceDriftDelta: number | null = null;

    if (allWeeks.length >= 2 && baseline.sampleCount > 0 && currentWeek.sampleCount > 0) {
      confidenceDriftDelta = (currentWeek.avgConfidence - baseline.avgConfidence) * 100;
      // Alert if average confidence dropped by more than threshold
      if (confidenceDriftDelta < -this.driftThresholdPct) {
        confidenceDriftAlert = true;
        this.logger.warn(
          `Confidence drift detected: ${confidenceDriftDelta.toFixed(1)}pp from baseline ` +
          `(${baseline.avgConfidence.toFixed(3)} -> ${currentWeek.avgConfidence.toFixed(3)})`,
        );
      }
    }

    // Category distribution drift detection
    const categoryDriftFlags: Record<string, boolean> = {};
    if (allWeeks.length >= 2 && baseline.sampleCount > 0 && currentWeek.sampleCount > 0) {
      const allLabels = new Set<string>();
      for (const label of Object.keys(baseline.categoryDistribution)) allLabels.add(label);
      for (const label of Object.keys(currentWeek.categoryDistribution)) allLabels.add(label);

      for (const label of allLabels) {
        const baselinePct =
          ((baseline.categoryDistribution[label] || 0) / baseline.sampleCount) * 100;
        const currentPct =
          ((currentWeek.categoryDistribution[label] || 0) / currentWeek.sampleCount) * 100;
        const delta = Math.abs(currentPct - baselinePct);
        categoryDriftFlags[label] = delta > this.categoryDriftThresholdPct;
      }
    }

    // Compute PSI between baseline and current category distributions
    let psiScore: number | null = null;
    if (allWeeks.length >= 2 && baseline.sampleCount > 0 && currentWeek.sampleCount > 0) {
      psiScore = this.computePSI(
        baseline.categoryDistribution,
        currentWeek.categoryDistribution,
      );
    }

    return {
      currentWeek,
      history: [...allWeeks].reverse(),
      baselineAvgConfidence: baseline.avgConfidence,
      confidenceDriftAlert,
      confidenceDriftDelta,
      categoryDriftFlags,
      psiScore,
    };
  }

  /**
   * Get the current ISO week string (e.g. "2026-W18").
   */
  private getCurrentWeek(): string {
    return this.getISOWeek(new Date());
  }

  /**
   * Compute ISO week string for a given date. Exposed for testing.
   */
  getISOWeek(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /**
   * Record a data point for a specific week (useful for testing / backfill).
   */
  recordForWeek(week: string, confidence: number, label: string): void {
    let snapshot = this.weeklyData.get(week);

    if (!snapshot) {
      snapshot = {
        week,
        sampleCount: 0,
        avgConfidence: 0,
        categoryDistribution: {},
        confidenceSum: 0,
      };
      this.weeklyData.set(week, snapshot);
    }

    snapshot.sampleCount++;
    snapshot.confidenceSum += confidence;
    snapshot.avgConfidence = snapshot.confidenceSum / snapshot.sampleCount;
    snapshot.categoryDistribution[label] = (snapshot.categoryDistribution[label] || 0) + 1;
  }

  /**
   * Compute the Population Stability Index (PSI) between two distributions.
   *
   * PSI = sum( (actual_i - expected_i) * ln(actual_i / expected_i) )
   *
   * PSI < 0.1  => no significant change
   * PSI 0.1-0.2 => moderate change
   * PSI >= 0.2  => significant change (alert)
   *
   * @param baseline - baseline distribution (counts per label)
   * @param current  - current distribution (counts per label)
   * @returns PSI score
   */
  computePSI(baseline: Record<string, number>, current: Record<string, number>): number {
    const allLabels = new Set<string>([
      ...Object.keys(baseline),
      ...Object.keys(current),
    ]);

    const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
    const currentTotal = Object.values(current).reduce((a, b) => a + b, 0);

    if (baselineTotal === 0 || currentTotal === 0) {
      return 0;
    }

    const EPSILON = 0.0001; // avoid log(0) and division by zero
    let psi = 0;

    for (const label of allLabels) {
      const baselinePct = Math.max((baseline[label] || 0) / baselineTotal, EPSILON);
      const currentPct = Math.max((current[label] || 0) / currentTotal, EPSILON);

      psi += (currentPct - baselinePct) * Math.log(currentPct / baselinePct);
    }

    return psi;
  }

  /**
   * Persist a weekly snapshot to the database via Prisma.
   *
   * @param snapshot - The weekly snapshot to persist
   */
  async persistSnapshot(snapshot: WeeklySnapshot): Promise<void> {
    if (!this.prisma) {
      this.logger.warn('PrismaService not available; skipping snapshot persistence.');
      return;
    }

    try {
      await (this.prisma as any).driftSnapshot.upsert({
        where: { week: snapshot.week },
        update: {
          sample_count: snapshot.sampleCount,
          avg_confidence: snapshot.avgConfidence,
          category_distribution: snapshot.categoryDistribution as any,
          confidence_sum: snapshot.confidenceSum,
        },
        create: {
          week: snapshot.week,
          sample_count: snapshot.sampleCount,
          avg_confidence: snapshot.avgConfidence,
          category_distribution: snapshot.categoryDistribution as any,
          confidence_sum: snapshot.confidenceSum,
        },
      });
      this.logger.log(`Persisted drift snapshot for week ${snapshot.week}`);
    } catch (err) {
      this.logger.error(`Failed to persist drift snapshot: ${(err as Error).message}`);
    }
  }

  /**
   * Dispatch a drift alert notification when drift is detected.
   *
   * @param report - The drift report that triggered the alert
   */
  async dispatchDriftAlert(report: DriftReport): Promise<void> {
    if (!this.notificationDispatch) {
      this.logger.warn('NotificationDispatchService not available; skipping drift alert dispatch.');
      return;
    }

    try {
      this.notificationDispatch.registerTemplate({
        code: 'DRIFT_ALERT',
        subject: 'Classification Drift Alert — Week {{week}}',
        body: 'Confidence drift detected: {{delta}}pp from baseline ({{baseline}} -> {{current}}). PSI: {{psi}}.',
      });

      const variables: Record<string, string> = {
        week: report.currentWeek?.week ?? 'unknown',
        delta: report.confidenceDriftDelta?.toFixed(1) ?? '0',
        baseline: report.baselineAvgConfidence?.toFixed(3) ?? '0',
        current: report.currentWeek?.avgConfidence.toFixed(3) ?? '0',
        psi: report.psiScore?.toFixed(4) ?? 'N/A',
      };

      await this.notificationDispatch.send(
        'MLOPS_TEAM',
        'IN_APP',
        'DRIFT_ALERT',
        variables,
      );

      this.logger.log(`Drift alert dispatched for week ${variables.week}`);
    } catch (err) {
      this.logger.error(`Failed to dispatch drift alert: ${(err as Error).message}`);
    }
  }

  /**
   * Clear all in-memory data (for testing).
   */
  reset(): void {
    this.weeklyData.clear();
  }
}
