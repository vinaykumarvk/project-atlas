import { Injectable, Logger } from '@nestjs/common';

export interface SloConfig {
  name: string;
  target: number; // e.g., 0.999
  windowDays: number; // e.g., 30
}

export interface BurnRateResult {
  sloName: string;
  currentErrorBudget: number;
  consumedBudgetPercent: number;
  burnRate: number; // errors per hour
  shortWindowBurnRate: number; // 1h window
  longWindowBurnRate: number; // 6h window
  alerting: boolean;
}

interface EventRecord {
  timestamps: number[];
  successCount: number;
  errorCount: number;
}

@Injectable()
export class SloBurnRateService {
  private readonly logger = new Logger(SloBurnRateService.name);
  private readonly slos: SloConfig[] = [];
  private readonly eventRecords: Map<string, EventRecord> = new Map();

  registerSlo(config: SloConfig): void {
    const existing = this.slos.findIndex((s) => s.name === config.name);
    if (existing >= 0) {
      this.slos[existing] = config;
    } else {
      this.slos.push(config);
    }

    if (!this.eventRecords.has(config.name)) {
      this.eventRecords.set(config.name, {
        timestamps: [],
        successCount: 0,
        errorCount: 0,
      });
    }
  }

  recordError(sloName: string): void {
    const record = this.eventRecords.get(sloName);
    if (!record) {
      this.logger.warn(`SLO not registered: ${sloName}`);
      return;
    }
    record.timestamps.push(Date.now());
    record.errorCount++;
  }

  recordSuccess(sloName: string): void {
    const record = this.eventRecords.get(sloName);
    if (!record) {
      this.logger.warn(`SLO not registered: ${sloName}`);
      return;
    }
    record.successCount++;
  }

  computeBurnRate(sloName: string): BurnRateResult | null {
    const slo = this.slos.find((s) => s.name === sloName);
    if (!slo) {
      return null;
    }

    const record = this.eventRecords.get(sloName);
    if (!record) {
      return null;
    }

    const totalRequests = record.successCount + record.errorCount;
    const errorBudget = (1 - slo.target) * totalRequests;
    const consumedBudgetPercent =
      errorBudget > 0 ? (record.errorCount / errorBudget) * 100 : 0;

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const sixHoursAgo = now - 6 * 60 * 60 * 1000;

    const shortWindowErrors = record.timestamps.filter(
      (t) => t >= oneHourAgo,
    ).length;
    const longWindowErrors = record.timestamps.filter(
      (t) => t >= sixHoursAgo,
    ).length;

    const windowHours = slo.windowDays * 24;
    const burnRate =
      windowHours > 0 ? record.errorCount / windowHours : 0;
    const shortWindowBurnRate = shortWindowErrors; // errors in 1h
    const longWindowBurnRate = longWindowErrors / 6; // errors per hour in 6h

    // Multi-window alerting: alert if both short and long windows exceed thresholds
    const shortThreshold = 14; // 14x burn rate for 1h window
    const longThreshold = 7; // 7x burn rate for 6h window
    const nominalBurnRate = errorBudget > 0 ? errorBudget / windowHours : 0;

    const alerting =
      nominalBurnRate > 0 &&
      shortWindowBurnRate > shortThreshold * nominalBurnRate &&
      longWindowBurnRate > longThreshold * nominalBurnRate;

    return {
      sloName,
      currentErrorBudget: Math.max(0, errorBudget - record.errorCount),
      consumedBudgetPercent: Math.min(100, consumedBudgetPercent),
      burnRate,
      shortWindowBurnRate,
      longWindowBurnRate,
      alerting,
    };
  }

  getAllBurnRates(): BurnRateResult[] {
    return this.slos
      .map((slo) => this.computeBurnRate(slo.name))
      .filter((r): r is BurnRateResult => r !== null);
  }

  shouldAlert(sloName: string): boolean {
    const result = this.computeBurnRate(sloName);
    return result !== null && result.alerting;
  }
}
