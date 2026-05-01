import { Injectable, Logger, Optional } from '@nestjs/common';
import { RawEmail } from '../types';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';

/**
 * NDR (Non-Delivery Report) / Bounce patterns.
 */
const NDR_SUBJECT_PATTERNS = [
  /delivery status notification/i,
  /undeliverable/i,
  /mail delivery failed/i,
  /returned mail/i,
  /delivery failure/i,
  /failure notice/i,
  /undelivered mail returned/i,
  /message not delivered/i,
];

const NDR_HEADERS = [
  'x-failed-recipients',
  'x-original-to',
];

/**
 * Bounce Detector Service.
 *
 * Detects NDR (Non-Delivery Report) / bounce emails from inbound messages
 * and triggers channel fallback for the original notification.
 */
@Injectable()
export class BounceDetectorService {
  private readonly logger = new Logger(BounceDetectorService.name);

  constructor(
    @Optional() private readonly notificationDispatchService?: NotificationDispatchService,
  ) {}

  /**
   * Check if an inbound email is an NDR/bounce message.
   */
  isBounce(email: RawEmail): boolean {
    // Check for NDR-specific headers
    for (const header of NDR_HEADERS) {
      if (email.headers[header]) {
        return true;
      }
    }

    // Check subject line patterns
    const subject = email.subject || '';
    for (const pattern of NDR_SUBJECT_PATTERNS) {
      if (pattern.test(subject)) {
        return true;
      }
    }

    // Check for DSN (Delivery Status Notification) content type hints in body
    const body = email.bodyText || '';
    if (/action:\s*failed/i.test(body) && /status:\s*[45]\.\d+\.\d+/i.test(body)) {
      return true;
    }

    return false;
  }

  /**
   * Extract the original recipient from an NDR/bounce email.
   */
  extractFailedRecipient(email: RawEmail): string | null {
    // Check X-Failed-Recipients header first
    const failedRecipients = email.headers['x-failed-recipients'];
    if (failedRecipients) {
      return failedRecipients.trim().split(',')[0].trim();
    }

    // Try to extract from body
    const body = email.bodyText || '';
    const recipientMatch = body.match(/(?:original-recipient|final-recipient):\s*(?:rfc822;)?\s*([^\s;]+@[^\s;]+)/i);
    if (recipientMatch) {
      return recipientMatch[1];
    }

    return null;
  }

  /**
   * Extract the original subject from the bounce email.
   */
  extractOriginalSubject(email: RawEmail): string | null {
    const subject = email.subject || '';

    // Remove common NDR prefixes to get original subject
    const cleaned = subject
      .replace(/^(Re:\s*)?Undeliverable:\s*/i, '')
      .replace(/^(Re:\s*)?Delivery Status Notification.*?:\s*/i, '')
      .replace(/^(Re:\s*)?Mail delivery failed:\s*/i, '')
      .replace(/^(Re:\s*)?Returned mail:\s*/i, '')
      .replace(/^(Re:\s*)?Failure Notice:\s*/i, '')
      .trim();

    return cleaned || null;
  }

  /**
   * Process a detected bounce: update notification log and trigger fallback.
   */
  async processBounce(email: RawEmail): Promise<{ handled: boolean; failedRecipient: string | null }> {
    if (!this.isBounce(email)) {
      return { handled: false, failedRecipient: null };
    }

    const failedRecipient = this.extractFailedRecipient(email);
    const originalSubject = this.extractOriginalSubject(email);

    this.logger.warn(
      `NDR detected: failed_recipient=${failedRecipient}, original_subject=${originalSubject}`,
    );

    if (!failedRecipient || !originalSubject) {
      this.logger.warn('Could not extract recipient or subject from NDR');
      return { handled: false, failedRecipient };
    }

    if (this.notificationDispatchService) {
      await this.notificationDispatchService.handleBounce(failedRecipient, originalSubject);
    }

    return { handled: true, failedRecipient };
  }
}
