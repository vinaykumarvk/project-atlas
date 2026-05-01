import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { NotificationChannel } from '../../notifications/types';

@Injectable()
export class VolumeAnomalyService {
  private readonly logger = new Logger(VolumeAnomalyService.name);
  private readonly dailyVolumes: Map<string, number> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationDispatch?: NotificationDispatchService,
  ) {}

  recordDailyVolume(date: string, count: number): void {
    this.dailyVolumes.set(date, count);
  }

  detectAnomaly(): { isAnomaly: boolean; todayVolume: number; rollingAvg: number; stdDev: number; threshold: number } {
    const today = new Date().toISOString().split('T')[0];
    const todayVolume = this.dailyVolumes.get(today) ?? 0;

    // Get last 30 days of volumes
    const volumes = Array.from(this.dailyVolumes.entries())
      .filter(([date]) => date !== today)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30)
      .map(([, count]) => count);

    if (volumes.length < 7) {
      return { isAnomaly: false, todayVolume, rollingAvg: 0, stdDev: 0, threshold: 0 };
    }

    const avg = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const variance = volumes.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / volumes.length;
    const stdDev = Math.sqrt(variance);
    const threshold = avg + 2 * stdDev;

    const isAnomaly = todayVolume > threshold;

    if (isAnomaly) {
      this.logger.warn(
        `Volume anomaly detected: today=${todayVolume}, avg=${avg.toFixed(1)}, threshold=${threshold.toFixed(1)}`,
      );

      if (this.notificationDispatch) {
        this.notificationDispatch.registerTemplate({
          code: 'VOLUME_ANOMALY',
          subject: 'Case Volume Anomaly Detected',
          body: 'Case volume today ({{today}}) exceeds the 2-sigma threshold ({{threshold}}) based on 30-day rolling average ({{avg}}).',
        });

        this.notificationDispatch.send(
          'SYS_ADMIN',
          NotificationChannel.IN_APP,
          'VOLUME_ANOMALY',
          { today: String(todayVolume), threshold: threshold.toFixed(1), avg: avg.toFixed(1) },
          { fallbackEnabled: false },
        ).catch(() => {});
      }
    }

    return {
      isAnomaly,
      todayVolume,
      rollingAvg: Math.round(avg * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10,
      threshold: Math.round(threshold * 10) / 10,
    };
  }

  getVolumeHistory(days: number): { date: string; volume: number }[] {
    return Array.from(this.dailyVolumes.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, days)
      .map(([date, volume]) => ({ date, volume }));
  }

  /**
   * FR-112.A1: Simple trend forecasting using least-squares linear regression
   * on historical daily volumes.
   *
   * @param days - Number of days to forecast into the future
   * @returns Array of { date, predicted } for each forecasted day
   */
  forecast(days: number): { date: string; predicted: number }[] {
    const history = Array.from(this.dailyVolumes.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    if (history.length < 2) {
      return [];
    }

    // Least-squares linear regression: y = slope * x + intercept
    const n = history.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = history[i][1];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denominator = n * sumX2 - sumX * sumX;
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Forecast future days
    const lastDate = new Date(history[history.length - 1][0]);
    const results: { date: string; predicted: number }[] = [];

    for (let d = 1; d <= days; d++) {
      const futureDate = new Date(lastDate);
      futureDate.setDate(futureDate.getDate() + d);
      const x = n - 1 + d; // continuation of the index series
      const predicted = Math.max(0, Math.round(slope * x + intercept));
      results.push({
        date: futureDate.toISOString().split('T')[0],
        predicted,
      });
    }

    return results;
  }
}
