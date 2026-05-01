import { Injectable, Logger } from '@nestjs/common';

/**
 * A single prediction outcome for accuracy tracking.
 */
export interface PredictionOutcome {
  predicted: string;
  actual: string;
  timestamp: Date;
  caseType?: string;
  language?: string;
  region?: string;
}

/**
 * Weekly accuracy summary returned by getWeeklyTrend().
 */
export interface WeeklyAccuracy {
  /** ISO week identifier, e.g. "2026-W18" */
  week: string;
  /** Accuracy percentage (0-100) for the week. */
  accuracy: number;
  /** Total number of predictions recorded in this week. */
  totalPredictions: number;
}

/**
 * FR-110.A3: Classification Accuracy Trend Service.
 *
 * Tracks classification accuracy over time by recording prediction outcomes
 * (predicted vs actual labels) and computing weekly accuracy trends.
 *
 * Uses in-memory storage (Map) consistent with other services in this module.
 * In production this data would be persisted to a database; for now it resets
 * on application restart.
 */
@Injectable()
export class AccuracyTrendService {
  private readonly logger = new Logger(AccuracyTrendService.name);

  /** In-memory store: ISO week string -> list of outcomes. */
  private readonly weeklyOutcomes = new Map<string, PredictionOutcome[]>();

  /**
   * Record a single prediction outcome.
   *
   * @param predicted - The predicted classification label
   * @param actual    - The actual (ground-truth) classification label
   * @param timestamp - Optional timestamp; defaults to now
   */
  recordOutcome(predicted: string, actual: string, timestamp?: Date, metadata?: { caseType?: string; language?: string; region?: string }): void {
    const ts = timestamp ?? new Date();
    const week = this.getISOWeek(ts);

    let outcomes = this.weeklyOutcomes.get(week);
    if (!outcomes) {
      outcomes = [];
      this.weeklyOutcomes.set(week, outcomes);
    }

    outcomes.push({ predicted, actual, timestamp: ts, ...metadata });

    this.logger.debug(
      `Recorded outcome for week ${week}: predicted="${predicted}", actual="${actual}", match=${predicted === actual}`,
    );
  }

  /**
   * Get weekly accuracy trend for the last N weeks (default 12).
   *
   * Returns an array of weekly accuracy summaries sorted chronologically,
   * including only weeks that have recorded data within the requested window.
   *
   * @param weeks - Number of weeks to look back (default 12)
   * @returns Array of { week, accuracy, totalPredictions }
   */
  getWeeklyTrend(weeks: number = 12): WeeklyAccuracy[] {
    const allWeeks = Array.from(this.weeklyOutcomes.keys()).sort();

    // Determine cutoff: take the last N weeks from available data
    const relevantWeeks = allWeeks.slice(-weeks);

    return relevantWeeks.map((week) => {
      const outcomes = this.weeklyOutcomes.get(week) ?? [];
      const totalPredictions = outcomes.length;
      const correct = outcomes.filter((o) => o.predicted === o.actual).length;
      const accuracy = totalPredictions > 0
        ? parseFloat(((correct / totalPredictions) * 100).toFixed(1))
        : 0;

      return { week, accuracy, totalPredictions };
    });
  }

  /**
   * Get weekly accuracy trend segmented by a given dimension (e.g. caseType, language, region).
   *
   * @param segmentKey - The property name to segment by
   * @param weeks - Number of weeks to look back (default 12)
   * @returns Record mapping segment values to their weekly accuracy arrays
   */
  getWeeklyTrendBySegment(
    segmentKey: string,
    weeks: number = 12,
  ): Record<string, WeeklyAccuracy[]> {
    const segmentMap = new Map<string, Map<string, PredictionOutcome[]>>();

    for (const [week, outcomes] of this.weeklyOutcomes.entries()) {
      for (const outcome of outcomes) {
        const segmentValue = (outcome as unknown as Record<string, unknown>)[segmentKey] as string | undefined;
        if (!segmentValue) continue;

        if (!segmentMap.has(segmentValue)) {
          segmentMap.set(segmentValue, new Map());
        }
        const weekMap = segmentMap.get(segmentValue)!;
        if (!weekMap.has(week)) {
          weekMap.set(week, []);
        }
        weekMap.get(week)!.push(outcome);
      }
    }

    const result: Record<string, WeeklyAccuracy[]> = {};
    for (const [segmentValue, weekMap] of segmentMap.entries()) {
      const allWeeks = Array.from(weekMap.keys()).sort().slice(-weeks);
      result[segmentValue] = allWeeks.map((week) => {
        const outcomes = weekMap.get(week) ?? [];
        const totalPredictions = outcomes.length;
        const correct = outcomes.filter((o) => o.predicted === o.actual).length;
        const accuracy = totalPredictions > 0
          ? parseFloat(((correct / totalPredictions) * 100).toFixed(1))
          : 0;
        return { week, accuracy, totalPredictions };
      });
    }

    return result;
  }

  /**
   * Get the overall accuracy across all recorded outcomes.
   */
  getOverallAccuracy(): { accuracy: number; totalPredictions: number } {
    let total = 0;
    let correct = 0;

    for (const outcomes of this.weeklyOutcomes.values()) {
      total += outcomes.length;
      correct += outcomes.filter((o) => o.predicted === o.actual).length;
    }

    return {
      accuracy: total > 0 ? parseFloat(((correct / total) * 100).toFixed(1)) : 0,
      totalPredictions: total,
    };
  }

  /**
   * Compute ISO week string for a given date (e.g. "2026-W18").
   * Uses the same algorithm as DriftMonitorService for consistency.
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
   * Clear all in-memory data (for testing).
   */
  reset(): void {
    this.weeklyOutcomes.clear();
  }
}
