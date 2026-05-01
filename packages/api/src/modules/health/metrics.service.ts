import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();

  constructor() {
    // Initialize default metrics
    this.counters.set('classification_total', 0);
    this.counters.set('sla_breached_cases', 0);
    this.gauges.set('queue_depth', 0);
    this.gauges.set('active_cases', 0);
    this.gauges.set('ai_model_latency_ms', 0);
  }

  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  getMetrics(): string {
    const lines: string[] = [];

    for (const [name, value] of this.counters) {
      lines.push(`# HELP ${name} Counter metric`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }

    for (const [name, value] of this.gauges) {
      lines.push(`# HELP ${name} Gauge metric`);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    }

    return lines.join('\n') + '\n';
  }

  getMetricValue(name: string): number | undefined {
    return this.counters.get(name) ?? this.gauges.get(name);
  }
}
