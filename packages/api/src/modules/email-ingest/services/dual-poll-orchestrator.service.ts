import { Injectable, Logger } from '@nestjs/common';
import { MailProvider, RawEmailData } from '../providers/imap.provider';

/**
 * Result of a poll operation for a single provider.
 */
export interface PollResult {
  fetched: number;
  deduplicated: number;
  provider: string;
}

/**
 * Dual-Poll Orchestrator Service (FR-155.A3).
 *
 * Manages multiple mail providers and orchestrates polling across all of them.
 * Provides message-level deduplication using Message-ID tracking to prevent
 * the same email from being processed twice when received by multiple providers.
 */
/**
 * FR-001.A5: Maximum outage tolerance window in milliseconds (15 minutes).
 * The system must continue processing emails within this window even when
 * a single provider is temporarily unavailable. Back-off retries are capped
 * at this duration before raising a critical alert.
 */
export const OUTAGE_TOLERANCE_MS = 15 * 60 * 1000;

@Injectable()
export class DualPollOrchestratorService {
  private readonly logger = new Logger(DualPollOrchestratorService.name);

  /** Registered mail providers keyed by name. */
  private readonly providers: Map<string, MailProvider> = new Map();

  /** Set of processed Message-IDs for deduplication. */
  private readonly processedIds = new Set<string>();

  /** Collected emails from the last poll (for consumers). */
  private readonly collectedEmails: RawEmailData[] = [];

  /** FR-001.A5: Track provider outage start times for tolerance monitoring. */
  private readonly providerOutageStart: Map<string, number> = new Map();

  /**
   * FR-001.A5: Check if a provider has exceeded the outage tolerance window.
   */
  isOutageExceeded(providerName: string): boolean {
    const start = this.providerOutageStart.get(providerName);
    if (!start) return false;
    return Date.now() - start > OUTAGE_TOLERANCE_MS;
  }

  /**
   * FR-001.A5: Record a provider outage start time.
   */
  recordOutageStart(providerName: string): void {
    if (!this.providerOutageStart.has(providerName)) {
      this.providerOutageStart.set(providerName, Date.now());
      this.logger.warn(`Provider ${providerName} outage started, tolerance window: ${OUTAGE_TOLERANCE_MS / 60000}min`);
    }
  }

  /**
   * FR-001.A5: Clear a provider outage (provider recovered).
   */
  clearOutage(providerName: string): void {
    if (this.providerOutageStart.delete(providerName)) {
      this.logger.log(`Provider ${providerName} outage cleared`);
    }
  }

  /**
   * Register a mail provider with the orchestrator.
   *
   * @param name - Unique name for this provider (e.g. 'graph', 'imap-primary')
   * @param provider - The mail provider instance
   */
  registerProvider(name: string, provider: MailProvider): void {
    if (this.providers.has(name)) {
      this.logger.warn(`Provider ${name} is already registered, replacing`);
    }
    this.providers.set(name, provider);
    this.logger.log(`Registered mail provider: ${name}`);
  }

  /**
   * Poll all registered providers for new emails.
   * Deduplicates messages by Message-ID across providers.
   *
   * @returns Array of poll results, one per provider
   */
  async pollAll(): Promise<PollResult[]> {
    const results: PollResult[] = [];

    for (const [name, provider] of this.providers) {
      this.logger.log(`Polling provider: ${name}`);

      try {
        const emails = await provider.fetchUnread();
        let fetched = 0;
        let deduplicated = 0;

        for (const email of emails) {
          if (this.isDuplicate(email.messageId)) {
            deduplicated++;
            this.logger.debug(
              `Duplicate message skipped: ${email.messageId} from provider ${name}`,
            );
          } else {
            this.processedIds.add(email.messageId);
            this.collectedEmails.push(email);
            fetched++;
          }
        }

        results.push({ fetched, deduplicated, provider: name });
        this.logger.log(
          `Provider ${name}: fetched=${fetched}, deduplicated=${deduplicated}`,
        );
      } catch (error) {
        this.logger.error(
          `Poll failed for provider ${name}: ${(error as Error).message}`,
        );
        results.push({ fetched: 0, deduplicated: 0, provider: name });
      }
    }

    return results;
  }

  /**
   * Check if a message ID has already been processed.
   */
  private isDuplicate(messageId: string): boolean {
    return this.processedIds.has(messageId);
  }

  /**
   * Get all collected (deduplicated) emails from the last poll cycle.
   */
  getCollectedEmails(): RawEmailData[] {
    return [...this.collectedEmails];
  }

  /**
   * Clear collected emails after processing.
   */
  clearCollected(): void {
    this.collectedEmails.length = 0;
  }

  /**
   * Get the number of registered providers.
   */
  getProviderCount(): number {
    return this.providers.size;
  }

  /**
   * Get the total number of processed message IDs (for monitoring).
   */
  getProcessedCount(): number {
    return this.processedIds.size;
  }
}
