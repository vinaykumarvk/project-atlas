import { MetricsService } from '../metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('should return Prometheus text format', () => {
    const metrics = service.getMetrics();
    expect(metrics).toContain('# TYPE classification_total counter');
    expect(metrics).toContain('classification_total 0');
    expect(metrics).toContain('# TYPE queue_depth gauge');
  });

  it('should increment counters', () => {
    service.incrementCounter('classification_total', 5);
    expect(service.getMetricValue('classification_total')).toBe(5);
    service.incrementCounter('classification_total');
    expect(service.getMetricValue('classification_total')).toBe(6);
  });

  it('should set gauges', () => {
    service.setGauge('queue_depth', 42);
    expect(service.getMetricValue('queue_depth')).toBe(42);
  });

  it('should include all default metrics', () => {
    const metrics = service.getMetrics();
    expect(metrics).toContain('classification_total');
    expect(metrics).toContain('sla_breached_cases');
    expect(metrics).toContain('queue_depth');
    expect(metrics).toContain('active_cases');
    expect(metrics).toContain('ai_model_latency_ms');
  });
});
