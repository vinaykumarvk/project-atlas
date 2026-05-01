import { WorkloadForecastService } from '../services/workload-forecast.service';

describe('WorkloadForecastService', () => {
  let service: WorkloadForecastService;

  beforeEach(() => {
    service = new WorkloadForecastService();
  });

  describe('recordDailyVolume (FR-112.A1)', () => {
    it('should record a daily volume entry', () => {
      service.recordDailyVolume('2026-04-25', 15);
      const data = service.getHistoricalData();

      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({ date: '2026-04-25', volume: 15 });
    });

    it('should update volume for an existing date', () => {
      service.recordDailyVolume('2026-04-25', 15);
      service.recordDailyVolume('2026-04-25', 20);
      const data = service.getHistoricalData();

      expect(data).toHaveLength(1);
      expect(data[0].volume).toBe(20);
    });

    it('should keep data sorted by date', () => {
      service.recordDailyVolume('2026-04-27', 10);
      service.recordDailyVolume('2026-04-25', 15);
      service.recordDailyVolume('2026-04-26', 12);
      const data = service.getHistoricalData();

      expect(data[0].date).toBe('2026-04-25');
      expect(data[1].date).toBe('2026-04-26');
      expect(data[2].date).toBe('2026-04-27');
    });
  });

  describe('forecast (FR-112.A1)', () => {
    it('should return empty forecast with no historical data', () => {
      const result = service.forecast();

      expect(result.forecastDays).toBe(7);
      expect(result.points).toHaveLength(0);
      expect(result.trend).toBe('STABLE');
      expect(result.currentLoad).toBe(0);
    });

    it('should forecast 7 days by default', () => {
      // Record 14 days of data
      for (let i = 0; i < 14; i++) {
        const date = new Date('2026-04-15');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 10 + i);
      }

      const result = service.forecast();

      expect(result.forecastDays).toBe(7);
      expect(result.points).toHaveLength(7);
      expect(result.currentLoad).toBe(23); // 10 + 13
    });

    it('should accept custom forecast days', () => {
      for (let i = 0; i < 10; i++) {
        const date = new Date('2026-04-20');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 10);
      }

      const result = service.forecast(14);

      expect(result.forecastDays).toBe(14);
      expect(result.points).toHaveLength(14);
    });

    it('should generate forecast points with dates, volumes, and confidence intervals', () => {
      for (let i = 0; i < 7; i++) {
        const date = new Date('2026-04-20');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 10 + i);
      }

      const result = service.forecast(3);

      for (const point of result.points) {
        expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof point.predictedVolume).toBe('number');
        expect(point.predictedVolume).toBeGreaterThanOrEqual(0);
        expect(typeof point.confidenceInterval.low).toBe('number');
        expect(typeof point.confidenceInterval.high).toBe('number');
        expect(point.confidenceInterval.low).toBeLessThanOrEqual(point.predictedVolume);
        expect(point.confidenceInterval.high).toBeGreaterThanOrEqual(point.predictedVolume);
      }
    });

    it('should detect INCREASING trend', () => {
      for (let i = 0; i < 14; i++) {
        const date = new Date('2026-04-15');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 5 + i * 2);
      }

      const result = service.forecast();

      expect(result.trend).toBe('INCREASING');
    });

    it('should detect DECREASING trend', () => {
      for (let i = 0; i < 14; i++) {
        const date = new Date('2026-04-15');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 30 - i * 2);
      }

      const result = service.forecast();

      expect(result.trend).toBe('DECREASING');
    });

    it('should detect STABLE trend', () => {
      for (let i = 0; i < 14; i++) {
        const date = new Date('2026-04-15');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 10);
      }

      const result = service.forecast();

      expect(result.trend).toBe('STABLE');
    });

    it('should widen confidence interval for further dates', () => {
      for (let i = 0; i < 14; i++) {
        const date = new Date('2026-04-15');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 10 + Math.random() * 5);
      }

      const result = service.forecast(7);

      if (result.points.length >= 2) {
        const firstWidth =
          result.points[0].confidenceInterval.high -
          result.points[0].confidenceInterval.low;
        const lastWidth =
          result.points[result.points.length - 1].confidenceInterval.high -
          result.points[result.points.length - 1].confidenceInterval.low;

        expect(lastWidth).toBeGreaterThanOrEqual(firstWidth);
      }
    });

    it('should never predict negative volume', () => {
      for (let i = 0; i < 7; i++) {
        const date = new Date('2026-04-20');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 1);
      }

      const result = service.forecast(14);

      for (const point of result.points) {
        expect(point.predictedVolume).toBeGreaterThanOrEqual(0);
        expect(point.confidenceInterval.low).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('computeRiskScore (FR-112.A2)', () => {
    it('should return LOW risk with no data', () => {
      const risk = service.computeRiskScore();

      expect(risk.score).toBe(0);
      expect(risk.level).toBe('LOW');
    });

    it('should return LOW risk for minimal workload', () => {
      for (let i = 0; i < 7; i++) {
        const date = new Date('2026-04-20');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 2);
      }

      const risk = service.computeRiskScore();

      expect(risk.level).toBe('LOW');
      expect(risk.score).toBeLessThan(35);
    });

    it('should return higher risk for high increasing workload', () => {
      for (let i = 0; i < 14; i++) {
        const date = new Date('2026-04-15');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 15 + i * 3);
      }

      const risk = service.computeRiskScore();

      expect(risk.score).toBeGreaterThan(35);
      expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(risk.level);
    });

    it('should cap score at 100', () => {
      for (let i = 0; i < 14; i++) {
        const date = new Date('2026-04-15');
        date.setDate(date.getDate() + i);
        service.recordDailyVolume(date.toISOString().slice(0, 10), 100 + i * 10);
      }

      const risk = service.computeRiskScore();

      expect(risk.score).toBeLessThanOrEqual(100);
    });

    it('should include level property', () => {
      const risk = service.computeRiskScore();

      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(risk.level);
      expect(typeof risk.score).toBe('number');
    });
  });

  describe('getHistoricalData (FR-112.A1)', () => {
    it('should return a copy of the data', () => {
      service.recordDailyVolume('2026-04-25', 15);

      const data = service.getHistoricalData();
      data.push({ date: '2026-04-30', volume: 99 });

      // Original should not be modified
      expect(service.getHistoricalData()).toHaveLength(1);
    });

    it('should return empty array when no data recorded', () => {
      expect(service.getHistoricalData()).toEqual([]);
    });
  });
});
