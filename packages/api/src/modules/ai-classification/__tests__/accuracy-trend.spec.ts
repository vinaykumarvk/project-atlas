import { AccuracyTrendService } from '../services/accuracy-trend.service';

describe('AccuracyTrendService', () => {
  let service: AccuracyTrendService;

  beforeEach(() => {
    service = new AccuracyTrendService();
  });

  it('should return empty trend when no data recorded', () => {
    const trend = service.getWeeklyTrend();
    expect(trend).toEqual([]);
  });

  it('should record a single correct outcome and report 100% accuracy', () => {
    const ts = new Date('2026-04-27');
    service.recordOutcome('VALUATION_REQUEST', 'VALUATION_REQUEST', ts);

    const trend = service.getWeeklyTrend();
    expect(trend).toHaveLength(1);
    expect(trend[0].accuracy).toBe(100);
    expect(trend[0].totalPredictions).toBe(1);
  });

  it('should record a single incorrect outcome and report 0% accuracy', () => {
    const ts = new Date('2026-04-27');
    service.recordOutcome('VALUATION_REQUEST', 'LEGAL_OPINION', ts);

    const trend = service.getWeeklyTrend();
    expect(trend).toHaveLength(1);
    expect(trend[0].accuracy).toBe(0);
    expect(trend[0].totalPredictions).toBe(1);
  });

  it('should compute mixed accuracy correctly', () => {
    const ts = new Date('2026-04-27');
    service.recordOutcome('VALUATION_REQUEST', 'VALUATION_REQUEST', ts);
    service.recordOutcome('LEGAL_OPINION', 'LEGAL_OPINION', ts);
    service.recordOutcome('VALUATION_REQUEST', 'GENERAL_INQUIRY', ts);

    const trend = service.getWeeklyTrend();
    expect(trend).toHaveLength(1);
    // 2 out of 3 correct = 66.7%
    expect(trend[0].accuracy).toBeCloseTo(66.7, 0);
    expect(trend[0].totalPredictions).toBe(3);
  });

  it('should group outcomes by ISO week', () => {
    // Week 17 (2026)
    service.recordOutcome('A', 'A', new Date('2026-04-20'));
    service.recordOutcome('A', 'B', new Date('2026-04-21'));

    // Week 18 (2026)
    service.recordOutcome('A', 'A', new Date('2026-04-27'));
    service.recordOutcome('A', 'A', new Date('2026-04-28'));
    service.recordOutcome('A', 'A', new Date('2026-04-29'));

    const trend = service.getWeeklyTrend();
    expect(trend).toHaveLength(2);

    // First week: 1 correct out of 2
    expect(trend[0].accuracy).toBe(50);
    expect(trend[0].totalPredictions).toBe(2);

    // Second week: 3 correct out of 3
    expect(trend[1].accuracy).toBe(100);
    expect(trend[1].totalPredictions).toBe(3);
  });

  it('should limit results to last N weeks', () => {
    // Record data across 4 different weeks
    service.recordOutcome('A', 'A', new Date('2026-04-06')); // W15
    service.recordOutcome('A', 'A', new Date('2026-04-13')); // W16
    service.recordOutcome('A', 'A', new Date('2026-04-20')); // W17
    service.recordOutcome('A', 'A', new Date('2026-04-27')); // W18

    const trend = service.getWeeklyTrend(2);
    expect(trend).toHaveLength(2);
    // Should return only the last 2 weeks
    expect(trend[0].week).toContain('W17');
    expect(trend[1].week).toContain('W18');
  });

  it('should default to 12 weeks', () => {
    // Record one outcome per week for 15 weeks
    for (let i = 0; i < 15; i++) {
      const d = new Date('2026-01-05');
      d.setDate(d.getDate() + i * 7);
      service.recordOutcome('A', 'A', d);
    }

    const trend = service.getWeeklyTrend();
    expect(trend).toHaveLength(12);
  });

  it('should compute overall accuracy', () => {
    service.recordOutcome('A', 'A', new Date('2026-04-20'));
    service.recordOutcome('A', 'B', new Date('2026-04-21'));
    service.recordOutcome('A', 'A', new Date('2026-04-27'));

    const overall = service.getOverallAccuracy();
    // 2 out of 3 correct
    expect(overall.accuracy).toBeCloseTo(66.7, 0);
    expect(overall.totalPredictions).toBe(3);
  });

  it('should return zero overall accuracy when no data', () => {
    const overall = service.getOverallAccuracy();
    expect(overall.accuracy).toBe(0);
    expect(overall.totalPredictions).toBe(0);
  });

  it('should use current time when no timestamp provided', () => {
    service.recordOutcome('A', 'A');

    const trend = service.getWeeklyTrend();
    expect(trend).toHaveLength(1);
    expect(trend[0].totalPredictions).toBe(1);
  });

  it('should compute ISO week correctly', () => {
    // April 27, 2026 is a Monday in W18
    const week = service.getISOWeek(new Date('2026-04-27'));
    expect(week).toBe('2026-W18');
  });

  it('should reset all data', () => {
    service.recordOutcome('A', 'A', new Date('2026-04-27'));
    expect(service.getWeeklyTrend()).toHaveLength(1);

    service.reset();
    expect(service.getWeeklyTrend()).toHaveLength(0);
    expect(service.getOverallAccuracy().totalPredictions).toBe(0);
  });

  it('should sort weeks chronologically', () => {
    // Record in reverse order
    service.recordOutcome('A', 'A', new Date('2026-04-27')); // W18
    service.recordOutcome('A', 'A', new Date('2026-04-13')); // W16
    service.recordOutcome('A', 'A', new Date('2026-04-20')); // W17

    const trend = service.getWeeklyTrend();
    expect(trend).toHaveLength(3);
    // Should be sorted chronologically
    expect(trend[0].week < trend[1].week).toBe(true);
    expect(trend[1].week < trend[2].week).toBe(true);
  });
});
