import { EntityF1Service } from '../services/entity-f1.service';

describe('EntityF1Service', () => {
  let service: EntityF1Service;

  beforeEach(() => {
    service = new EntityF1Service();
  });

  it('should return zero metrics for unknown entity type', () => {
    const metrics = service.getMetrics('unknown');
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBe(0);
  });

  it('should compute perfect precision and recall for exact match', () => {
    service.recordPrediction('property_city', ['Mumbai', 'Pune'], ['Mumbai', 'Pune']);
    const metrics = service.getMetrics('property_city');

    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.f1).toBe(1);
  });

  it('should compute correct metrics when predicted has extra values (false positives)', () => {
    service.recordPrediction('property_city', ['Mumbai', 'Pune', 'Delhi'], ['Mumbai', 'Pune']);
    const metrics = service.getMetrics('property_city');

    // TP=2, FP=1, FN=0
    expect(metrics.precision).toBeCloseTo(2 / 3);
    expect(metrics.recall).toBe(1);
    expect(metrics.f1).toBeCloseTo(2 * (2 / 3) * 1 / ((2 / 3) + 1));
  });

  it('should compute correct metrics when predicted is missing values (false negatives)', () => {
    service.recordPrediction('property_city', ['Mumbai'], ['Mumbai', 'Pune']);
    const metrics = service.getMetrics('property_city');

    // TP=1, FP=0, FN=1
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(0.5);
    expect(metrics.f1).toBeCloseTo(2 * 1 * 0.5 / (1 + 0.5));
  });

  it('should compute metrics when predicted and actual are completely different', () => {
    service.recordPrediction('property_city', ['Delhi'], ['Mumbai', 'Pune']);
    const metrics = service.getMetrics('property_city');

    // TP=0, FP=1, FN=2
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBe(0);
  });

  it('should accumulate metrics across multiple predictions', () => {
    // First prediction: perfect match
    service.recordPrediction('loan_account_no', ['LN-1234'], ['LN-1234']);
    // TP=1, FP=0, FN=0 -> precision=1, recall=1, f1=1

    // Second prediction: partial match
    service.recordPrediction('loan_account_no', ['LN-5678', 'LN-9999'], ['LN-5678']);
    // Running: TP=2, FP=1, FN=0

    const metrics = service.getMetrics('loan_account_no');
    expect(metrics.precision).toBeCloseTo(2 / 3);
    expect(metrics.recall).toBe(1);
  });

  it('should track metrics independently per entity type', () => {
    service.recordPrediction('property_city', ['Mumbai'], ['Mumbai']);
    service.recordPrediction('loan_account_no', ['LN-WRONG'], ['LN-1234']);

    const cityMetrics = service.getMetrics('property_city');
    expect(cityMetrics.f1).toBe(1);

    const loanMetrics = service.getMetrics('loan_account_no');
    expect(loanMetrics.f1).toBe(0);
  });

  it('should return all metrics', () => {
    service.recordPrediction('property_city', ['Mumbai'], ['Mumbai']);
    service.recordPrediction('loan_account_no', ['LN-1234'], ['LN-1234']);
    service.recordPrediction('vendor_name', ['ABC'], ['XYZ']);

    const all = service.getAllMetrics();
    expect(Object.keys(all)).toHaveLength(3);
    expect(all.property_city.f1).toBe(1);
    expect(all.loan_account_no.f1).toBe(1);
    expect(all.vendor_name.f1).toBe(0);
  });

  it('should handle empty predicted array', () => {
    service.recordPrediction('property_city', [], ['Mumbai']);
    const metrics = service.getMetrics('property_city');

    // TP=0, FP=0, FN=1
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBe(0);
  });

  it('should handle empty actual array', () => {
    service.recordPrediction('property_city', ['Mumbai'], []);
    const metrics = service.getMetrics('property_city');

    // TP=0, FP=1, FN=0
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBe(0);
  });

  it('should handle both empty arrays', () => {
    service.recordPrediction('property_city', [], []);
    const metrics = service.getMetrics('property_city');

    // TP=0, FP=0, FN=0 - no data
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBe(0);
  });

  it('should reset all counters', () => {
    service.recordPrediction('property_city', ['Mumbai'], ['Mumbai']);
    expect(service.getMetrics('property_city').f1).toBe(1);

    service.reset();
    expect(service.getMetrics('property_city').f1).toBe(0);
    expect(Object.keys(service.getAllMetrics())).toHaveLength(0);
  });
});
