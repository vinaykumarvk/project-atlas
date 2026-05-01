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
   * FR-112.A1: ARIMA(1,1,1) forecast implementation.
   * Applies first-order differencing, AR(1), and MA(1) components.
   */
  private arimaForecast(data: number[], periods: number): number[] {
    if (data.length < 3) return data.slice(-1).map(v => Array(periods).fill(v)).flat();

    // First-order differencing
    const differenced: number[] = [];
    for (let i = 1; i < data.length; i++) {
      differenced.push(data[i] - data[i - 1]);
    }

    // AR(1) coefficient from autocorrelation
    const mean = differenced.reduce((a, b) => a + b, 0) / differenced.length;
    let numerator = 0, denominator = 0;
    for (let i = 1; i < differenced.length; i++) {
      numerator += (differenced[i] - mean) * (differenced[i - 1] - mean);
      denominator += (differenced[i - 1] - mean) ** 2;
    }
    const phi = denominator !== 0 ? numerator / denominator : 0;

    // MA(1) coefficient from residuals
    const residuals: number[] = [];
    for (let i = 1; i < differenced.length; i++) {
      residuals.push(differenced[i] - phi * differenced[i - 1]);
    }
    const theta = residuals.length > 1 ? residuals.reduce((a, b) => a + b, 0) / residuals.length / (Math.max(...residuals.map(Math.abs)) || 1) : 0;

    // Forecast
    const forecasts: number[] = [];
    let lastDiff = differenced[differenced.length - 1];
    let lastResidual = residuals.length > 0 ? residuals[residuals.length - 1] : 0;
    let lastValue = data[data.length - 1];

    for (let i = 0; i < periods; i++) {
      const nextDiff = phi * lastDiff + theta * lastResidual;
      const nextValue = lastValue + nextDiff;
      forecasts.push(Math.max(0, Math.round(nextValue)));
      lastResidual = 0; // Future residuals unknown
      lastDiff = nextDiff;
      lastValue = nextValue;
    }

    return forecasts;
  }

  /**
   * Forecast future workload using ARIMA(1,1,1) model.
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
    const yValues = data.map((d) => d.volume);

    // FR-112.A1: Use ARIMA(1,1,1) for predictions
    const predictions = this.arimaForecast(yValues, days);

    // Compute standard deviation from recent data for confidence intervals
    const maWindow = Math.min(7, n);
    const recentVolumes = yValues.slice(-maWindow);
    const movingAvg =
      recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
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

      const predictedVolume = predictions[d - 1];

      // Confidence interval widens with distance
      const widthMultiplier = 1 + (d - 1) * 0.1;
      const margin = stdDev * 1.96 * widthMultiplier;

      points.push({
        date: dateStr,
        predictedVolume,
        confidenceInterval: {
          low: Math.max(0, Math.round(predictedVolume - margin)),
          high: Math.round(predictedVolume + margin),
        },
      });
    }

    // Determine trend based on historical data slope (linear regression on inputs)
    const xValues = yValues.map((_, i) => i);
    const xMean = xValues.reduce((a, b) => a + b, 0) / n;
    const yMean = yValues.reduce((a, b) => a + b, 0) / n;
    let slopeNum = 0, slopeDen = 0;
    for (let i = 0; i < n; i++) {
      slopeNum += (xValues[i] - xMean) * (yValues[i] - yMean);
      slopeDen += (xValues[i] - xMean) ** 2;
    }
    const slope = slopeDen !== 0 ? slopeNum / slopeDen : 0;
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
