import { Injectable, Logger } from '@nestjs/common';
import { AccuracyTrendService, WeeklyAccuracy } from './accuracy-trend.service';
import { EntityF1Service, F1Metrics } from './entity-f1.service';
import { DriftMonitorService } from './drift-monitor.service';

export interface OverrideRecord {
  caseId: string;
  originalLabel: string;
  overriddenLabel: string;
  officerId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface LowConfidenceRecord {
  caseId: string;
  confidence: number;
  timestamp: Date;
}

export interface OverrideRateResult {
  overrideCount: number;
  totalPredictions: number;
  rate: number;
}

export interface LowConfidenceWeekly {
  week: string;
  count: number;
}

@Injectable()
export class ClassificationMetricsService {
  private readonly logger = new Logger(ClassificationMetricsService.name);
  private readonly overrides: OverrideRecord[] = [];
  private readonly lowConfidenceRecords: LowConfidenceRecord[] = [];
  private totalPredictions = 0;

  constructor(
    private readonly accuracyTrendService: AccuracyTrendService,
    private readonly entityF1Service: EntityF1Service,
    private readonly driftMonitorService: DriftMonitorService,
  ) {}

  recordOverride(
    caseId: string,
    originalLabel: string,
    overriddenLabel: string,
    officerId: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.overrides.push({
      caseId,
      originalLabel,
      overriddenLabel,
      officerId,
      timestamp: new Date(),
      metadata,
    });
    this.totalPredictions++;
    this.logger.debug(`Override recorded for case ${caseId}: ${originalLabel} -> ${overriddenLabel}`);
  }

  recordLowConfidence(caseId: string, confidence: number): void {
    this.lowConfidenceRecords.push({
      caseId,
      confidence,
      timestamp: new Date(),
    });
    this.logger.debug(`Low confidence recorded for case ${caseId}: ${confidence}`);
  }

  recordPrediction(): void {
    this.totalPredictions++;
  }

  getOverrideRate(weeks?: number): OverrideRateResult {
    let overrides = this.overrides;
    if (weeks) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - weeks * 7);
      overrides = overrides.filter((o) => o.timestamp >= cutoff);
    }
    const total = this.totalPredictions || 1;
    return {
      overrideCount: overrides.length,
      totalPredictions: total,
      rate: parseFloat((overrides.length / total * 100).toFixed(2)),
    };
  }

  getLowConfidenceVolume(weeks: number = 12): LowConfidenceWeekly[] {
    const weekMap = new Map<string, number>();
    for (const record of this.lowConfidenceRecords) {
      const week = this.accuracyTrendService.getISOWeek(record.timestamp);
      weekMap.set(week, (weekMap.get(week) || 0) + 1);
    }
    const allWeeks = Array.from(weekMap.keys()).sort();
    return allWeeks.slice(-weeks).map((week) => ({
      week,
      count: weekMap.get(week) || 0,
    }));
  }

  getEntityF1Summary(): Record<string, F1Metrics> {
    return this.entityF1Service.getAllMetrics();
  }

  getAccuracyTrend(weeks?: number): WeeklyAccuracy[] {
    return this.accuracyTrendService.getWeeklyTrend(weeks);
  }

  getDriftReport() {
    return this.driftMonitorService.getWeeklyReport();
  }

  reset(): void {
    this.overrides.length = 0;
    this.lowConfidenceRecords.length = 0;
    this.totalPredictions = 0;
  }
}
