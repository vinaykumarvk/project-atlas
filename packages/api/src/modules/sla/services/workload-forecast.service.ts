import { Injectable, Logger } from '@nestjs/common';

export interface ForecastPoint {
  date: string; // ISO date
  predictedVolume: number;
  confidenceInterval: { low: number; high: number };
}

export interface WorkloadForecast {
  forecastDays: number;
  points: ForecastPoint[];
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  currentLoad: number;
}

@Injectable()
export class WorkloadForecastService {
  private readonly logger = new Logger(WorkloadForecastService.name);

  private historicalData: Array<{ date: string; volume: number }> = [];

  /**
   * Record a daily volume data point.
   */
  recordDailyVolume(date: string, volume: number): void {
    // Avoid duplicates for the same date; update if exists
    const existing = this.historicalData.find((d) => d.date === date);
    if (existing) {
      existing.volume = volume;
    } else {
      this.historicalData.push({ date, volume });
    }
    // Keep sorted by date
    this.historicalData.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Forecast future workload using moving average + linear trend.
   * @param days Number of days to forecast (default 7)
   */
  forecast(days = 7): WorkloadForecast {
    const data = this.historicalData;
    const n = data.length;

    if (n === 0) {
      return {
        forecastDays: days,
        points: [],
        trend: 'STABLE',
        currentLoad: 0,
      };
    }

    const currentLoad = data[n - 1].volume;

    // Compute linear regression for trend
    const xValues = data.map((_, i) => i);
    const yValues = data.map((d) => d.volume);

    const xMean = xValues.reduce((a, b) => a + b, 0) / n;
    const yMean = yValues.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
      denominator += (xValues[i] - xMean) ** 2;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;

    // Moving average window (use last 7 days or all available)
    const maWindow = Math.min(7, n);
    const recentVolumes = yValues.slice(-maWindow);
    const movingAvg =
      recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

    // Compute standard deviation for confidence interval
    const variance =
      recentVolumes.reduce((sum, v) => sum + (v - movingAvg) ** 2, 0) /
      recentVolumes.length;
    const stdDev = Math.sqrt(variance);

    // Generate forecast points
    const points: ForecastPoint[] = [];
    const lastDate = new Date(data[n - 1].date);

    for (let d = 1; d <= days; d++) {
      const forecastDate = new Date(lastDate);
      forecastDate.setDate(forecastDate.getDate() + d);
      const dateStr = forecastDate.toISOString().slice(0, 10);

      // Blend moving average and linear regression
      const linearPrediction = intercept + slope * (n - 1 + d);
      const blendedPrediction = (movingAvg + linearPrediction) / 2;
      const predictedVolume = Math.max(0, Math.round(blendedPrediction));

      // Confidence interval widens with distance
      const widthMultiplier = 1 + (d - 1) * 0.1;
      const margin = stdDev * 1.96 * widthMultiplier;

      points.push({
        date: dateStr,
        predictedVolume,
        confidenceInterval: {
          low: Math.max(0, Math.round(blendedPrediction - margin)),
          high: Math.round(blendedPrediction + margin),
        },
      });
    }

    // Determine trend based on slope
    let trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    if (slope > 0.5) {
      trend = 'INCREASING';
    } else if (slope < -0.5) {
      trend = 'DECREASING';
    } else {
      trend = 'STABLE';
    }

    return {
      forecastDays: days,
      points,
      trend,
      currentLoad,
    };
  }

  /**
   * FR-112.A2: Compute an aggregate risk score from workload data.
   */
  computeRiskScore(): {
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  } {
    const forecastResult = this.forecast(7);

    if (forecastResult.points.length === 0) {
      return { score: 0, level: 'LOW' };
    }

    // Score based on: current load, trend, and predicted peak
    let score = 0;

    // Current load factor (normalized, assume 20 as high baseline)
    score += Math.min(forecastResult.currentLoad / 20, 1) * 30;

    // Trend factor
    if (forecastResult.trend === 'INCREASING') {
      score += 30;
    } else if (forecastResult.trend === 'STABLE') {
      score += 10;
    }

    // Peak forecast factor
    const peakVolume = Math.max(
      ...forecastResult.points.map((p) => p.predictedVolume),
      0,
    );
    score += Math.min(peakVolume / 25, 1) * 40;

    score = Math.min(Math.round(score), 100);

    let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (score >= 80) {
      level = 'CRITICAL';
    } else if (score >= 60) {
      level = 'HIGH';
    } else if (score >= 35) {
      level = 'MEDIUM';
    } else {
      level = 'LOW';
    }

    return { score, level };
  }

  /**
   * FR-112.A3: Anomaly detection on inbound volume using z-score.
   * If the latest data point is more than 2.5 standard deviations from the mean, flag as anomaly.
   * @param data Array of numeric volume data points
   */
  detectAnomalies(data: number[]): {
    isAnomaly: boolean;
    zScore: number;
    threshold: number;
    mean: number;
    stdDev: number;
  } {
    const ANOMALY_THRESHOLD = 2.5;

    if (data.length === 0) {
      return {
        isAnomaly: false,
        zScore: 0,
        threshold: ANOMALY_THRESHOLD,
        mean: 0,
        stdDev: 0,
      };
    }

    const mean = data.reduce((sum, v) => sum + v, 0) / data.length;
    const variance =
      data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length;
    const stdDev = Math.sqrt(variance);

    const latest = data[data.length - 1];

    const zScore = stdDev > 0
      ? Math.round(Math.abs(latest - mean) / stdDev * 100) / 100
      : 0;

    return {
      isAnomaly: zScore > ANOMALY_THRESHOLD,
      zScore,
      threshold: ANOMALY_THRESHOLD,
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
    };
  }

  /**
   * Get the raw historical data.
   */
  getHistoricalData(): Array<{ date: string; volume: number }> {
    return [...this.historicalData];
  }
}
