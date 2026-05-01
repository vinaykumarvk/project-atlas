import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EmailHealthService } from '../email-ingest/services/email-health.service';
import { ProviderHealthService } from './provider-health.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly emailHealthService: EmailHealthService,
    private readonly providerHealthService: ProviderHealthService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'atlas-api',
      version: '0.1.0',
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
}
