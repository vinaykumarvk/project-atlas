import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationChannel } from '../types';

@Injectable()
export class OutboundReviewService {
  private readonly logger = new Logger(OutboundReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationDispatchService: NotificationDispatchService,
  ) {}

  async getPendingReviews(officerId?: string): Promise<any[]> {
    const where: any = { status: 'PROPOSED' };
    const logs = await this.prisma.notificationLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return logs;
  }

  async approveAndSend(notificationId: string, officerId: string): Promise<{ status: string }> {
    const logEntry = await this.prisma.notificationLog.findUnique({
      where: { id: notificationId },
    });

    if (!logEntry) {
      throw new NotFoundException(`Notification not found: ${notificationId}`);
    }

    if (logEntry.status !== 'PROPOSED') {
      throw new BadRequestException(
        `Notification ${notificationId} is not in PROPOSED status (current: ${logEntry.status})`,
      );
    }

    const result = await this.notificationDispatchService.send(
      logEntry.recipient,
      logEntry.channel as NotificationChannel,
      logEntry.template_code || '',
      {},
      { fallbackEnabled: true, skipDedup: true },
    );

    await this.prisma.notificationLog.update({
      where: { id: notificationId },
      data: { status: 'SENT', sent_at: new Date() },
    });

    this.logger.log(`Notification ${notificationId} approved by ${officerId} and sent`);
    return { status: 'SENT' };
  }

  async reject(notificationId: string, officerId: string, reason: string): Promise<{ status: string }> {
    const logEntry = await this.prisma.notificationLog.findUnique({
      where: { id: notificationId },
    });

    if (!logEntry) {
      throw new NotFoundException(`Notification not found: ${notificationId}`);
    }

    if (logEntry.status !== 'PROPOSED') {
      throw new BadRequestException(
        `Notification ${notificationId} is not in PROPOSED status (current: ${logEntry.status})`,
      );
    }

    await this.prisma.notificationLog.update({
      where: { id: notificationId },
      data: {
        status: 'REJECTED',
      },
    });

    this.logger.log(`Notification ${notificationId} rejected by ${officerId}: ${reason}`);
    return { status: 'REJECTED' };
  }
}
