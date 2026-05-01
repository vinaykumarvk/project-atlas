import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WebhookDispatcherService } from '../services/webhook-dispatcher.service';

/**
 * WebhooksController
 *
 * Stub endpoints for receiving inbound webhooks from external
 * systems (e.g. email providers, vendor portals) and for
 * health-checking the webhook subsystem.
 *
 * Route prefix: webhooks (full path with global prefix: v1/webhooks)
 */
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  /**
   * POST /webhooks/inbound
   *
   * Receives inbound webhook payloads from external systems.
   * Currently acknowledges receipt and logs the payload.
   */
  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive inbound webhook payload' })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  inbound(@Body() payload: Record<string, any>) {
    this.logger.log(`Inbound webhook received: ${JSON.stringify(payload)}`);
    this.webhookDispatcher.dispatch('inbound', payload);
    return { received: true };
  }

  /**
   * POST /webhooks/status-update
   *
   * Receives status update callbacks from external systems
   * (e.g. vendor case status changes, delivery confirmations).
   */
  @Post('status-update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive status update callback' })
  @ApiResponse({ status: 200, description: 'Status update received' })
  statusUpdate(@Body() payload: Record<string, any>) {
    this.logger.log(`Status update webhook received: ${JSON.stringify(payload)}`);
    this.webhookDispatcher.dispatch('status-update', payload);
    return { received: true };
  }

  /**
   * GET /webhooks/health
   *
   * Health check for the webhook subsystem.
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook subsystem health check' })
  @ApiResponse({ status: 200, description: 'Webhook subsystem is healthy' })
  health() {
    return { status: 'ok' };
  }
}
