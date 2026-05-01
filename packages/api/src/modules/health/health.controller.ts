import { Controller, Get, Logger, Optional, Inject, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EmailHealthService } from '../email-ingest/services/email-health.service';
import { ProviderHealthService } from './provider-health.service';
import { MetricsService } from './metrics.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly emailHealthService: EmailHealthService,
    private readonly providerHealthService: ProviderHealthService,
    @Optional() @Inject(MetricsService) private readonly metricsService?: MetricsService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'atlas-api',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed,
    };
  }

  /**
   * FR-155.A1: Email provider health aggregation endpoint.
   * Returns health status of all registered email providers.
   */
  @Get('health/email-providers')
  @ApiOperation({ summary: 'Get health status of email providers' })
  @ApiResponse({ status: 200, description: 'Email provider health status' })
  async getEmailProviderHealth() {
    this.logger.log('Checking email provider health');
    const health = await this.emailHealthService.getProviderHealth();
    return { data: health };
  }

  @Get('health/detailed')
  @ApiOperation({ summary: 'Get detailed health status of all providers' })
  @ApiResponse({ status: 200, description: 'Detailed provider health status' })
  async getDetailedHealth() {
    const health = await this.providerHealthService.getDetailedHealth();
    return { data: health };
  }

  /**
   * FR-153.A2: Prometheus-compatible /metrics endpoint.
   */
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  @ApiResponse({ status: 200, description: 'Prometheus text format metrics' })
  getMetrics(): string {
    if (this.metricsService) {
      return this.metricsService.getMetrics();
    }
    return '# No metrics available\n';
  }
}
