import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationDispatchService, MAX_RETRY_ATTEMPTS } from '../services/notification-dispatch.service';
import { NotificationChannel } from '../types';

export interface NotificationRetryJobData {
  recipientId: string;
  channel: NotificationChannel;
  templateCode: string;
  variables: Record<string, string>;
  attemptNumber: number;
}

/**
 * Notification Retry Processor.
 *
 * Processes retry jobs from the 'notification-retry' BullMQ queue.
 * Each job represents a failed notification that should be re-attempted
 * with the channel fallback chain.
 */
@Processor('notification-retry')
export class NotificationRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationRetryProcessor.name);

  constructor(
    private readonly notificationDispatchService: NotificationDispatchService,
  ) {
    super();
  }

  async process(job: Job<NotificationRetryJobData>): Promise<void> {
    const { recipientId, channel, templateCode, variables, attemptNumber } = job.data;

    this.logger.log(
      `Processing notification retry #${attemptNumber} (job ${job.id}) ` +
        `for ${recipientId}/${templateCode} via ${channel}`,
    );

    if (attemptNumber > MAX_RETRY_ATTEMPTS) {
      this.logger.warn(
        `Max retry attempts exceeded for ${recipientId}/${templateCode}. Giving up.`,
      );
      return;
    }

    try {
      const result = await this.notificationDispatchService.send(
        recipientId,
        channel,
        templateCode,
        variables,
        { fallbackEnabled: true, skipDedup: true },
      );

      if (result.status === 'SENT') {
        this.logger.log(
          `Retry #${attemptNumber} succeeded for ${recipientId}/${templateCode} via ${result.channel}`,
        );
      } else if (result.status === 'FAILED') {
        // Enqueue next retry with increased delay
        this.logger.warn(
          `Retry #${attemptNumber} failed for ${recipientId}/${templateCode}. Enqueueing next retry.`,
        );
        await this.notificationDispatchService.enqueueRetry(
          recipientId,
          channel,
          templateCode,
          variables,
          attemptNumber,
        );
      }
    } catch (error) {
      this.logger.error(
        `Retry job ${job.id} failed: ${(error as Error).message}`,
      );
      // Enqueue next retry
      await this.notificationDispatchService.enqueueRetry(
        recipientId,
        channel,
        templateCode,
        variables,
        attemptNumber,
      );
    }
  }
}
