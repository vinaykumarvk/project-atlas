import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { IsNotEmpty, IsString, IsEnum, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../../common/guards/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../auth/auth.service';
import { Audited } from '../../audit/decorators/audited.decorator';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { OutboundReviewService } from '../services/outbound-review.service';
import { PrismaService } from '../../../common/prisma';
import { NotificationChannel } from '../types';

/**
 * DTO for sending a test notification.
 */
class SendTestNotificationDto {
  @ApiProperty({ description: 'Recipient user ID', example: '00000000-0000-0000-0000-000000000001' })
  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  @ApiProperty({ description: 'Notification channel', enum: NotificationChannel, example: NotificationChannel.EMAIL })
  @IsEnum(NotificationChannel)
  @IsNotEmpty()
  channel!: NotificationChannel;

  @ApiProperty({ description: 'Template code', example: 'CASE_ASSIGNED' })
  @IsString()
  @IsNotEmpty()
  templateCode!: string;

  @ApiPropertyOptional({ description: 'Template variables', example: { case_number: 'ATL-2026-000001', fpr_name: 'John' } })
  @IsObject()
  @IsOptional()
  variables?: Record<string, string>;
}

/**
 * Notifications Controller.
 *
 * Provides REST endpoints for notification history
 * and test notification dispatch (admin only).
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Audited({ resourceType: 'Notification' })
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly notificationDispatchService: NotificationDispatchService,
    private readonly outboundReviewService: OutboundReviewService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * FR-033 A2: Get pending outbound notifications awaiting officer review.
   */
  @Get('pending-review')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.SYS_ADMIN,
  )
  @ApiOperation({ summary: 'Get pending outbound notifications awaiting review' })
  @ApiResponse({ status: 200, description: 'Pending review notifications' })
  async getPendingReviews() {
    const logs = await this.outboundReviewService.getPendingReviews();
    return { data: logs };
  }

  /**
   * Get notification history (logs).
   */
  @Get('logs')
  @ApiOperation({ summary: 'Get notification history logs' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max records to return (default 200)' })
  @ApiResponse({ status: 200, description: 'Notification log entries' })
  async getLogs(@Query('limit') limit?: string) {
    const maxRecords = Math.min(1000, Math.max(1, parseInt(limit ?? '200', 10) || 200));
    const logs = await this.notificationDispatchService.getLog(maxRecords);

    return { data: logs };
  }

  /**
   * Send a test notification (admin only).
   */
  @Post('test')
  @Roles(UserRole.SYS_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test notification (admin only)' })
  @ApiResponse({ status: 200, description: 'Test notification sent' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async sendTestNotification(@Body() dto: SendTestNotificationDto) {
    const result = await this.notificationDispatchService.send(
      dto.recipientId,
      dto.channel,
      dto.templateCode,
      dto.variables || {},
    );

    return {
      data: result,
      message: `Test notification sent via ${dto.channel} (status: ${result.status})`,
    };
  }

  /**
   * FR-102 A1: SMS provider webhook callback.
   * Accepts provider callback payload, finds NotificationLog by provider message ID,
   * and updates status.
   */
  @Post('webhooks/sms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SMS provider delivery status webhook' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async smsWebhook(
    @Body() payload: { message_id?: string; status?: string; [key: string]: unknown },
  ) {
    this.logger.log(`SMS webhook received: message_id=${payload.message_id}, status=${payload.status}`);

    if (payload.message_id && payload.status) {
      const mappedStatus = this.mapProviderStatus(payload.status);
      await this.prisma.notificationLog.updateMany({
        where: { external_id: payload.message_id, channel: 'SMS' },
        data: { status: mappedStatus },
      }).catch((err) => this.logger.warn(`SMS webhook update failed: ${err.message}`));
    }

    return { received: true, channel: 'SMS' };
  }

  /**
   * FR-102 A1: WhatsApp provider webhook callback.
   * Accepts provider callback payload, finds NotificationLog by provider message ID,
   * and updates status.
   */
  @Post('webhooks/whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WhatsApp provider delivery status webhook' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async whatsappWebhook(
    @Body() payload: { message_id?: string; status?: string; [key: string]: unknown },
  ) {
    this.logger.log(`WhatsApp webhook received: message_id=${payload.message_id}, status=${payload.status}`);

    if (payload.message_id && payload.status) {
      const mappedStatus = this.mapProviderStatus(payload.status);
      await this.prisma.notificationLog.updateMany({
        where: { external_id: payload.message_id, channel: 'WHATSAPP' },
        data: { status: mappedStatus },
      }).catch((err) => this.logger.warn(`WhatsApp webhook update failed: ${err.message}`));
    }

    return { received: true, channel: 'WHATSAPP' };
  }

  /**
   * FR-033 A2: Approve a PROPOSED notification for dispatch.
   * Finds the PROPOSED notification log entry, sends it, and updates status to SENT.
   */
  @Post(':id/approve')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.SYS_ADMIN,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a proposed notification for dispatch' })
  @ApiParam({ name: 'id', description: 'Notification log entry ID' })
  @ApiResponse({ status: 200, description: 'Notification approved and sent' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 400, description: 'Notification is not in PROPOSED status' })
  async approveNotification(@Param('id') id: string) {
    const logEntry = await this.prisma.notificationLog.findUnique({
      where: { id },
    });

    if (!logEntry) {
      throw new NotFoundException(`Notification log entry not found: ${id}`);
    }

    if (logEntry.status !== 'PROPOSED') {
      throw new BadRequestException(
        `Notification ${id} is not in PROPOSED status (current: ${logEntry.status})`,
      );
    }

    // Send the notification using the stored details
    const result = await this.notificationDispatchService.send(
      logEntry.recipient,
      logEntry.channel as NotificationChannel,
      logEntry.template_code || '',
      {}, // Variables were already rendered
      { fallbackEnabled: true, skipDedup: true },
    );

    // Update the original PROPOSED entry to SENT
    await this.prisma.notificationLog.update({
      where: { id },
      data: { status: 'SENT', sent_at: new Date() },
    }).catch((err) => this.logger.warn(`Failed to update approved notification: ${err.message}`));

    return {
      data: result,
      message: `Notification ${id} approved and dispatched (status: ${result.status})`,
    };
  }

  /**
   * FR-033 A2: Reject a PROPOSED notification.
   * Updates the notification status to REJECTED with a reason.
   */
  @Post(':id/reject')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.SYS_ADMIN,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a proposed notification' })
  @ApiParam({ name: 'id', description: 'Notification log entry ID' })
  @ApiResponse({ status: 200, description: 'Notification rejected' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 400, description: 'Notification is not in PROPOSED status' })
  async rejectNotification(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const result = await this.outboundReviewService.reject(
      id,
      'current-user', // In production, extract from JWT
      body.reason || 'No reason provided',
    );

    return {
      data: result,
      message: `Notification ${id} rejected`,
    };
  }

  /**
   * Map provider-specific delivery status to internal status.
   */
  private mapProviderStatus(providerStatus: string): string {
    const normalized = providerStatus.toUpperCase();
    if (['DELIVERED', 'READ'].includes(normalized)) return 'DELIVERED';
    if (['FAILED', 'UNDELIVERED', 'REJECTED'].includes(normalized)) return 'FAILED';
    if (['BOUNCED'].includes(normalized)) return 'BOUNCED';
    if (['SENT', 'QUEUED', 'ACCEPTED'].includes(normalized)) return 'SENT';
    return normalized;
  }
}
