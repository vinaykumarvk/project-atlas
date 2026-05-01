import { Injectable } from '@nestjs/common';
import { DigestBatch, DigestItem, NotificationChannel } from '../types';
import { NotificationDispatchService } from './notification-dispatch.service';

const DEFAULT_DIGEST_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class DigestService {
  private digestBatches: Map<string, DigestBatch> = new Map();
  private digestWindowMs: number = DEFAULT_DIGEST_WINDOW_MS;

  constructor(private readonly dispatchService: NotificationDispatchService) {}

  /**
   * Configure the digest window in milliseconds.
   */
  setDigestWindow(windowMs: number): void {
    this.digestWindowMs = windowMs;
  }

  /**
   * Add a notification to the digest batch for a recipient.
   */
  addToDigest(
    recipientId: string,
    notification: { templateCode: string; variables: Record<string, string>; renderedSubject: string; renderedBody: string },
  ): void {
    const existing = this.digestBatches.get(recipientId);
    const now = new Date();

    const item: DigestItem = {
      templateCode: notification.templateCode,
      variables: notification.variables,
      renderedSubject: notification.renderedSubject,
      renderedBody: notification.renderedBody,
      addedAt: now,
    };

    if (existing) {
      existing.items.push(item);
    } else {
      this.digestBatches.set(recipientId, {
        recipientId,
        items: [item],
        windowStartedAt: now,
      });
    }
  }

  /**
   * Flush all digest batches that have exceeded the digest window.
   * Returns the number of digest notifications sent.
   */
  async flushDigests(): Promise<number> {
    const now = new Date();
    let sentCount = 0;

    for (const [recipientId, batch] of this.digestBatches.entries()) {
      const elapsed = now.getTime() - batch.windowStartedAt.getTime();

      if (elapsed >= this.digestWindowMs && batch.items.length > 0) {
        await this.sendDigestNotification(recipientId, batch);
        sentCount++;
        this.digestBatches.delete(recipientId);
      }
    }

    return sentCount;
  }

  /**
   * Force flush all digests regardless of window.
   */
  async forceFlushAll(): Promise<number> {
    let sentCount = 0;
    for (const [recipientId, batch] of this.digestBatches.entries()) {
      if (batch.items.length > 0) {
        await this.sendDigestNotification(recipientId, batch);
        sentCount++;
      }
    }
    this.digestBatches.clear();
    return sentCount;
  }

  /**
   * Get the current digest batch for a recipient.
   */
  getDigestBatch(recipientId: string): DigestBatch | undefined {
    return this.digestBatches.get(recipientId);
  }

  /**
   * Get the count of pending digest batches.
   */
  getPendingCount(): number {
    return this.digestBatches.size;
  }

  private async sendDigestNotification(recipientId: string, batch: DigestBatch): Promise<void> {
    const itemSummaries = batch.items.map((item) => item.renderedSubject).join('; ');
    const combinedBody = batch.items.map((item) => `- ${item.renderedBody}`).join('\n');

    await this.dispatchService.send(recipientId, NotificationChannel.EMAIL, 'DAILY_DIGEST', {
      date: new Date().toISOString().split('T')[0],
      total_open: String(batch.items.length),
      total_breached: '0',
      new_today: String(batch.items.length),
      item_summaries: itemSummaries,
      combined_body: combinedBody,
    });
  }
}
