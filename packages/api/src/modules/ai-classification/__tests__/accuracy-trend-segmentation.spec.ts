import { AccuracyTrendService } from '../services/accuracy-trend.service';

describe('AccuracyTrendService — Segmentation (FR-161)', () => {
  let service: AccuracyTrendService;

  beforeEach(() => {
    service = new AccuracyTrendService();
  });

  afterEach(() => {
    service.reset();
  });

  it('should accept metadata with caseType, language, region', () => {
    service.recordOutcome('A', 'A', undefined, { caseType: 'VALUATION_REQUEST', region: 'Mumbai' });
    const trend = service.getWeeklyTrend();
    expect(trend.length).toBe(1);
    expect(trend[0].totalPredictions).toBe(1);
  });

  it('should segment accuracy by caseType', () => {
    service.recordOutcome('A', 'A', undefined, { caseType: 'VALUATION_REQUEST' });
    service.recordOutcome('B', 'A', undefined, { caseType: 'VALUATION_REQUEST' });
    service.recordOutcome('A', 'A', undefined, { caseType: 'LEGAL_OPINION' });
    const segmented = service.getWeeklyTrendBySegment('caseType');
    expect(segmented['VALUATION_REQUEST']).toBeDefined();
    expect(segmented['LEGAL_OPINION']).toBeDefined();
  });

  it('should compute correct accuracy per segment', () => {
    service.recordOutcome('A', 'A', undefined, { caseType: 'VR' });
    service.recordOutcome('A', 'A', undefined, { caseType: 'VR' });
    service.recordOutcome('B', 'A', undefined, { caseType: 'LO' });
    const segmented = service.getWeeklyTrendBySegment('caseType');
    const vrWeek = segmented['VR'][0];
    expect(vrWeek.accuracy).toBe(100);
    const loWeek = segmented['LO'][0];
    expect(loWeek.accuracy).toBe(0);
  });

  it('should segment by region', () => {
    service.recordOutcome('A', 'A', undefined, { region: 'Mumbai' });
    service.recordOutcome('A', 'B', undefined, { region: 'Delhi' });
    const segmented = service.getWeeklyTrendBySegment('region');
    expect(segmented['Mumbai']).toBeDefined();
    expect(segmented['Delhi']).toBeDefined();
  });

  it('should return empty result for unknown segment key', () => {
    service.recordOutcome('A', 'A');
    const segmented = service.getWeeklyTrendBySegment('unknownKey');
    expect(Object.keys(segmented)).toHaveLength(0);
  });

  it('should respect weeks parameter in segmentation', () => {
    service.recordOutcome('A', 'A', undefined, { caseType: 'VR' });
    const segmented = service.getWeeklyTrendBySegment('caseType', 4);
    expect(segmented['VR'].length).toBeLessThanOrEqual(4);
  });
});
