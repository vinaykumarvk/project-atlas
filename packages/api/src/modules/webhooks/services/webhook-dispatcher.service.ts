import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * A registered webhook subscriber.
 */
export interface WebhookSubscriber {
  id: string;
  url: string;
  secret: string;
  active: boolean;
  eventTypes: string[];
}

/**
 * Result of a dispatch attempt to a single subscriber.
 */
export interface DispatchResult {
  subscriberId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * WebhookDispatcherService
 *
 * Dispatches webhook events to registered external systems.
 * Supports a full subscriber registry, HMAC-SHA256 payload signing,
 * and BullMQ-backed retry for failed deliveries.
 */
@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  /**
   * In-memory subscriber registry, keyed by event type.
   * Each event type maps to an array of subscribers interested in that event.
   */
  private readonly subscribers: Map<string, WebhookSubscriber[]> = new Map();

  /**
   * Optional BullMQ queue for retry. Injected externally if available.
   */
  private retryQueue: { add: (name: string, data: unknown) => Promise<unknown> } | null = null;

  /**
   * Set the retry queue (BullMQ or compatible).
   */
  setRetryQueue(queue: { add: (name: string, data: unknown) => Promise<unknown> }): void {
    this.retryQueue = queue;
  }

  /**
   * Optional HTTP client for delivering webhooks. Defaults to global fetch.
   * Can be overridden for testing.
   */
  private httpPost: (url: string, options: RequestInit) => Promise<Response> =
    (url, options) => fetch(url, options);

  /**
   * Override the HTTP client (useful for testing).
   */
  setHttpClient(client: (url: string, options: RequestInit) => Promise<Response>): void {
    this.httpPost = client;
  }

  // ---------------------------------------------------------------------------
  // Subscriber Registry (FR-141.A1)
  // ---------------------------------------------------------------------------

  /**
   * Register a subscriber for a specific event type.
   * The subscriber is also added for each of its declared eventTypes.
   */
  registerSubscriber(eventType: string, subscriber: WebhookSubscriber): void {
    const existing = this.subscribers.get(eventType) ?? [];
    // Avoid duplicate registration
    if (existing.some((s) => s.id === subscriber.id)) {
      this.logger.warn(
        `Subscriber ${subscriber.id} already registered for event ${eventType}`,
      );
      return;
    }
    existing.push(subscriber);
    this.subscribers.set(eventType, existing);
    this.logger.log(
      `Registered subscriber ${subscriber.id} for event ${eventType}`,
    );
  }

  /**
   * Unregister a subscriber from a specific event type.
   */
  unregisterSubscriber(eventType: string, subscriberId: string): void {
    const existing = this.subscribers.get(eventType);
    if (!existing) return;
    const filtered = existing.filter((s) => s.id !== subscriberId);
    if (filtered.length === 0) {
      this.subscribers.delete(eventType);
    } else {
      this.subscribers.set(eventType, filtered);
    }
    this.logger.log(
      `Unregistered subscriber ${subscriberId} from event ${eventType}`,
    );
  }

  /**
   * Get all active subscribers for a given event type.
   */
  getSubscribers(eventType: string): WebhookSubscriber[] {
    return (this.subscribers.get(eventType) ?? []).filter((s) => s.active);
  }

  // ---------------------------------------------------------------------------
  // HMAC-SHA256 Signing (FR-141.A2)
  // ---------------------------------------------------------------------------

  /**
   * Sign a payload string using HMAC-SHA256 with the given secret.
   * Returns the hex-encoded signature.
   */
  signPayload(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify an HMAC-SHA256 signature for a payload.
   * Uses timing-safe comparison to prevent timing attacks.
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = this.signPayload(payload, secret);
    if (expected.length !== signature.length) {
      return false;
    }
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Dispatch with Retry (FR-141.A2)
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a webhook event to all active subscribers for the given event type.
   * For each subscriber, signs the payload and POSTs to the subscriber URL.
   * Failed deliveries are enqueued to BullMQ for retry if a retry queue is configured.
   *
   * Returns counts of dispatched and failed deliveries.
   */
  async dispatchWithRetry(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<{ dispatched: number; failed: number }> {
    const activeSubscribers = this.getSubscribers(eventType);
    let dispatched = 0;
    let failed = 0;

    for (const subscriber of activeSubscribers) {
      const body = JSON.stringify(payload);
      const signature = this.signPayload(body, subscriber.secret);

      try {
        const response = await this.httpPost(subscriber.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': eventType,
          },
          body,
        });

        if (response.ok) {
          dispatched++;
          this.logger.log(
            `Webhook delivered to ${subscriber.id} (${subscriber.url}) for ${eventType}`,
          );
        } else {
          failed++;
          this.logger.warn(
            `Webhook delivery failed for ${subscriber.id}: HTTP ${response.status}`,
          );
          await this.enqueueRetry(eventType, payload, subscriber);
        }
      } catch (error) {
        failed++;
        this.logger.error(
          `Webhook delivery error for ${subscriber.id}: ${(error as Error).message}`,
        );
        await this.enqueueRetry(eventType, payload, subscriber);
      }
    }

    return { dispatched, failed };
  }

  /**
   * Enqueue a failed delivery for retry via BullMQ (if configured).
   */
  private async enqueueRetry(
    eventType: string,
    payload: Record<string, unknown>,
    subscriber: WebhookSubscriber,
  ): Promise<void> {
    if (!this.retryQueue) {
      this.logger.debug(
        `No retry queue configured. Skipping retry for ${subscriber.id}`,
      );
      return;
    }

    try {
      await this.retryQueue.add('webhook-retry', {
        eventType,
        payload,
        subscriberId: subscriber.id,
        subscriberUrl: subscriber.url,
        subscriberSecret: subscriber.secret,
        attemptedAt: new Date().toISOString(),
      });
      this.logger.log(
        `Enqueued retry for subscriber ${subscriber.id} event ${eventType}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue retry: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Legacy dispatch method — kept for backward compatibility.
   * Fires event to all subscribers without retry.
   */
  dispatch(event: string, payload: any): void {
    this.logger.log(
      `Webhook dispatch: event=${event}, payload=${JSON.stringify(payload)}`,
    );
    // Fire-and-forget dispatch with retry
    this.dispatchWithRetry(event, payload).catch((err) => {
      this.logger.error(`Async dispatch failed: ${(err as Error).message}`);
    });
  }
}
