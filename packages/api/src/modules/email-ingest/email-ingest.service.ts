import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma';
import { EncryptionService } from '../../common/services/encryption.service';
import { ObjectStorageService } from '../../common/services/object-storage.service';
import { SpamProcessor } from './processors/spam.processor';
import { ThreadProcessor } from './processors/thread.processor';
import { LanguageProcessor } from './processors/language.processor';
import { BounceDetectorService } from './services/bounce-detector.service';
import { NotificationDispatchService } from '../notifications/services/notification-dispatch.service';
import { RawEmail, IngestResult, IngestStatus, SecurityVerdicts, ThreadContext } from './types';

/**
 * Default supported languages for classification (FR-005.A3 / FR-005 A4).
 * Emails in languages outside this list are routed to Triage Review.
 * Configurable via SUPPORTED_LANGUAGES env var (comma-separated).
 */
const DEFAULT_LANGUAGES = ['en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'bn', 'pa'];

/**
 * FR-001.A1: Sliding window p95 SLO enforcement.
 * Keeps last 1000 latencies in a circular buffer and computes p95.
 */
const P95_BUFFER_SIZE = 1000;
const INGEST_P95_SLO_MS = parseInt(process.env.INGEST_P95_SLO_MS || '5000', 10);

export const SUPPORTED_LANGUAGES: readonly string[] = process.env.SUPPORTED_LANGUAGES
  ? process.env.SUPPORTED_LANGUAGES.split(',').map((l) => l.trim()).filter(Boolean)
  : DEFAULT_LANGUAGES;

export interface EmailIngestRecord {
  id: string;
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText?: string;
  receivedAt: Date;
  ingestStatus: IngestStatus;
  languageDetected?: string;
  securityVerdicts?: SecurityVerdicts;
  threadContext?: ThreadContext;
  rfc822S3Key?: string;
  rfc822Checksum?: string;
  sourceMailbox: string;
  provider: string;
}

/**
 * Email Ingestion Service (FR-001 through FR-005).
 * Orchestrates the full ingestion pipeline: receive -> deduplicate -> screen -> detect language -> assemble thread.
 */
@Injectable()
export class EmailIngestService {
  private readonly logger = new Logger(EmailIngestService.name);

  /** FR-001.A5: BullMQ Dead Letter Queue configuration. */
  static readonly DLQ_CONFIG = {
    maxRetries: 3,
    backoffType: 'exponential' as const,
    backoffDelay: 5000,
  };

  /** FR-001.A1: Circular buffer for p95 latency tracking. */
  private static latencyBuffer: number[] = [];
  private static latencyIndex = 0;
  private static latencyCount = 0;

  /**
   * Record a latency sample into the circular buffer.
   */
  static recordLatency(ms: number): void {
    if (EmailIngestService.latencyBuffer.length < P95_BUFFER_SIZE) {
      EmailIngestService.latencyBuffer.push(ms);
    } else {
      EmailIngestService.latencyBuffer[EmailIngestService.latencyIndex] = ms;
    }
    EmailIngestService.latencyIndex =
      (EmailIngestService.latencyIndex + 1) % P95_BUFFER_SIZE;
    EmailIngestService.latencyCount++;
  }

  /**
   * Compute the p95 latency from the circular buffer.
   * Returns 0 if no samples have been recorded.
   */
  static getP95(): number {
    const count = Math.min(EmailIngestService.latencyBuffer.length, P95_BUFFER_SIZE);
    if (count === 0) return 0;
    const sorted = EmailIngestService.latencyBuffer.slice(0, count).sort((a, b) => a - b);
    const idx = Math.ceil(count * 0.95) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * Get latency statistics: count, p95, mean, max.
   */
  static getLatencyStats(): {
    count: number;
    p95: number;
    mean: number;
    max: number;
  } {
    const count = Math.min(EmailIngestService.latencyBuffer.length, P95_BUFFER_SIZE);
    if (count === 0) return { count: 0, p95: 0, mean: 0, max: 0 };
    const slice = EmailIngestService.latencyBuffer.slice(0, count);
    const sum = slice.reduce((a, b) => a + b, 0);
    return {
      count: EmailIngestService.latencyCount,
      p95: EmailIngestService.getP95(),
      mean: sum / count,
      max: Math.max(...slice),
    };
  }

  /**
   * Reset the latency buffer (useful for testing).
   */
  static resetLatencyBuffer(): void {
    EmailIngestService.latencyBuffer = [];
    EmailIngestService.latencyIndex = 0;
    EmailIngestService.latencyCount = 0;
  }

  // Configurable denylist
  private readonly spamDenylist: string[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly spamProcessor: SpamProcessor,
    private readonly threadProcessor: ThreadProcessor,
    private readonly languageProcessor: LanguageProcessor,
    private readonly encryptionService: EncryptionService,
    private readonly objectStorageService: ObjectStorageService,
    @Optional() private readonly bounceDetectorService?: BounceDetectorService,
    @Optional() @InjectQueue('email-ingest-dlq') private readonly dlqQueue?: Queue,
    @Optional() private readonly notificationDispatchService?: NotificationDispatchService,
  ) {}

  /**
   * Process a raw email through the full ingestion pipeline.
   */
  async ingest(email: RawEmail, provider: string): Promise<IngestResult> {
    const ingestStart = Date.now();
    const startTime = ingestStart;

    // 1. Duplicate detection (FR-014 partial)
    const dupResult = await this.checkDuplicate(email);
    if (dupResult) {
      this.logger.debug(`Duplicate detected: ${email.messageId}`);
      return dupResult;
    }

    // 2. NDR/Bounce detection
    if (this.bounceDetectorService && this.bounceDetectorService.isBounce(email)) {
      this.logger.log(`NDR/Bounce detected: ${email.messageId}`);
      const record = await this.createRecord(email, IngestStatus.RECEIVED, provider);
      await this.bounceDetectorService.processBounce(email);
      return {
        id: record.id,
        messageId: email.messageId,
        ingestStatus: IngestStatus.RECEIVED,
        reason: 'NDR/Bounce detected and processed',
      };
    }

    // 3. Auto-reply / OOO detection (FR-003)
    if (this.isAutoReply(email)) {
      const record = await this.createRecord(email, IngestStatus.AUTO_REPLY, provider);

      // FR-003.A2: If the auto-reply references an existing case thread, log it
      const autoReplyThread = this.threadProcessor.assembleContext(email);
      if (autoReplyThread.existingCaseId) {
        await this.logOooActivity(autoReplyThread.existingCaseId, email);
      }

      return { id: record.id, messageId: email.messageId, ingestStatus: IngestStatus.AUTO_REPLY, reason: 'Auto-reply detected' };
    }

    // 3. Spam denylist check
    if (this.spamProcessor.isOnDenylist(email.from, this.spamDenylist)) {
      const record = await this.createRecord(email, IngestStatus.QUARANTINED, provider);
      await this.dispatchQuarantineAlert(email, 'Sender on denylist');
      return { id: record.id, messageId: email.messageId, ingestStatus: IngestStatus.QUARANTINED, reason: 'Sender on denylist' };
    }

    // 4. Phishing & spam scoring (FR-002)
    const verdicts = this.spamProcessor.evaluateSecurityHeaders(email);
    if (this.spamProcessor.shouldQuarantine(verdicts)) {
      const record = await this.createRecord(email, IngestStatus.QUARANTINED, provider, verdicts);
      await this.dispatchQuarantineAlert(email, `Phishing score: ${verdicts.phishingScore.toFixed(2)}`);
      return { id: record.id, messageId: email.messageId, ingestStatus: IngestStatus.QUARANTINED, reason: `Phishing score: ${verdicts.phishingScore.toFixed(2)}` };
    }

    // FR-002.A2: Flag for review if phishing score is in 0.50-0.80 range
    const phishingFlagged = this.spamProcessor.shouldFlagForReview(verdicts);

    // 5. Language detection (FR-005)
    const langResult = this.languageProcessor.detect(`${email.subject} ${email.bodyText || ''}`);

    // FR-005.A3: Non-supported language routing
    const languageSupported = SUPPORTED_LANGUAGES.includes(langResult.language);

    // 6. Thread context assembly (FR-004)
    const threadContext = this.threadProcessor.assembleContext(email);

    // 7. Create the ingest record
    const record = await this.createRecord(
      email, IngestStatus.RECEIVED, provider, verdicts,
      langResult.language, threadContext, phishingFlagged,
    );

    const ingestLatencyMs = Date.now() - ingestStart;

    // Store latency metric on the ingest record (FR-001 A1)
    await this.prisma.emailIngest.update({
      where: { id: record.id },
      data: { ingest_latency_ms: ingestLatencyMs } as any,
    });

    // FR-001.A1: Record latency in sliding window and check p95 SLO
    EmailIngestService.recordLatency(ingestLatencyMs);
    const currentP95 = EmailIngestService.getP95();
    if (currentP95 > INGEST_P95_SLO_MS) {
      this.logger.warn(
        `p95 ingest latency ${currentP95}ms exceeds SLO threshold ${INGEST_P95_SLO_MS}ms`,
      );
    }

    this.logger.log(`Ingested ${email.messageId} in ${ingestLatencyMs}ms [${langResult.language}]${phishingFlagged ? ' [PHISHING_FLAGGED]' : ''}`);

    return {
      id: record.id,
      messageId: email.messageId,
      ingestStatus: IngestStatus.RECEIVED,
      phishingFlagged,
      languageSupported,
    };
  }

  /**
   * Check for duplicate emails (FR-014).
   * Exact Message-ID match + SHA-256 body hash.
   */
  private async checkDuplicate(email: RawEmail): Promise<IngestResult | null> {
    // Exact Message-ID duplicate (unique constraint in DB)
    const existing = await this.prisma.emailIngest.findUnique({
      where: { message_id: email.messageId },
    });

    if (existing) {
      // FR-014.A3: Store duplicate record linked to original
      const dupRecord = await this.prisma.emailIngest.create({
        data: {
          message_id: `dup-${Date.now()}-${email.messageId}`,
          from_address: email.from,
          to_addresses: email.to,
          cc_addresses: email.cc,
          subject: email.subject,
          body_text: email.bodyText,
          received_at: email.receivedAt,
          ingest_status: IngestStatus.DUPLICATE,
          thread_context: JSON.stringify({ original_email_ingest_id: existing.id }),
          source_mailbox: 'primary',
          provider: 'unknown',
        },
      });

      return {
        id: dupRecord.id,
        messageId: email.messageId,
        ingestStatus: IngestStatus.DUPLICATE,
        reason: 'Exact Message-ID duplicate',
        originalEmailIngestId: existing.id,
      };
    }

    // Body hash duplicate
    if (email.bodyText) {
      const hash = this.computeBodyHash(email);
      const bodyDup = await this.prisma.emailIngest.findFirst({
        where: { rfc822_checksum: hash },
      });

      if (bodyDup) {
        // FR-014.A3: Store duplicate record linked to original
        const dupRecord = await this.prisma.emailIngest.create({
          data: {
            message_id: `dup-body-${Date.now()}-${email.messageId}`,
            from_address: email.from,
            to_addresses: email.to,
            cc_addresses: email.cc,
            subject: email.subject,
            body_text: email.bodyText,
            received_at: email.receivedAt,
            ingest_status: IngestStatus.DUPLICATE,
            thread_context: JSON.stringify({ original_email_ingest_id: bodyDup.id }),
            rfc822_checksum: hash,
            source_mailbox: 'primary',
            provider: 'unknown',
          },
        });

        return {
          id: dupRecord.id,
          messageId: email.messageId,
          ingestStatus: IngestStatus.DUPLICATE,
          reason: 'Body content duplicate (SHA-256 match)',
          originalEmailIngestId: bodyDup.id,
        };
      }
    }

    return null;
  }

  /**
   * Detect auto-reply / out-of-office messages (FR-003).
   * RFC 3834: Auto-Submitted header.
   */
  private isAutoReply(email: RawEmail): boolean {
    const headers = email.headers;

    // RFC 3834: Auto-Submitted header
    const autoSubmitted = headers['auto-submitted']?.toLowerCase();
    if (autoSubmitted && autoSubmitted !== 'no') {
      return true;
    }

    // X-Auto-Response-Suppress header (Microsoft)
    if (headers['x-auto-response-suppress']) {
      return true;
    }

    // Precedence: bulk or auto_reply
    const precedence = headers['precedence']?.toLowerCase();
    if (precedence === 'bulk' || precedence === 'auto_reply') {
      return true;
    }

    // Body pattern matching for OOO
    const body = (email.bodyText || '').toLowerCase();
    const oooPatterns = [
      /out of (the )?office/i,
      /i am currently (away|out|on leave|on vacation)/i,
      /automatic reply/i,
      /auto-?reply/i,
      /i will be (away|back|returning)/i,
      /limited access to (my )?email/i,
    ];

    for (const pattern of oooPatterns) {
      if (pattern.test(body)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compute normalized body hash for deduplication.
   */
  private computeBodyHash(email: RawEmail): string {
    const normalized = (email.bodyText || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Create a new ingest record in the database.
   */
  private async createRecord(
    email: RawEmail,
    status: IngestStatus,
    provider: string,
    verdicts?: SecurityVerdicts,
    language?: string,
    threadContext?: ThreadContext,
    phishingFlagged = false,
  ): Promise<{ id: string }> {
    const bodyHash = email.bodyText ? this.computeBodyHash(email) : undefined;

    // RFC822 archival: encrypt and store raw email if present
    let rfc822S3Key: string | null = null;
    if (email.rfc822Raw) {
      const encryptedBuffer = this.encryptionService.encrypt(email.rfc822Raw);
      rfc822S3Key = this.objectStorageService.generateRfc822Key(
        email.messageId,
        email.receivedAt,
      );
      await this.objectStorageService.put(rfc822S3Key, encryptedBuffer);
      this.logger.debug(`Archived RFC822 for ${email.messageId} -> ${rfc822S3Key}`);
    }

    const record = await this.prisma.emailIngest.create({
      data: {
        message_id: email.messageId,
        from_address: email.from,
        to_addresses: email.to,
        cc_addresses: email.cc,
        subject: email.subject,
        body_text: email.bodyText,
        received_at: email.receivedAt,
        ingest_status: status,
        language_detected: language,
        spf_verdict: verdicts?.spf ?? null,
        dkim_verdict: verdicts?.dkim ?? null,
        dmarc_verdict: verdicts?.dmarc ?? null,
        phishing_score: verdicts?.phishingScore ?? null,
        spam_score: verdicts?.spamScore ?? null,
        phishing_flagged: phishingFlagged,
        in_reply_to: threadContext?.threadId ?? null,
        thread_context: threadContext ? JSON.stringify(threadContext) : null,
        rfc822_checksum: bodyHash,
        rfc822_s3_key: rfc822S3Key,
        source_mailbox: 'primary',
        provider,
      },
    });

    return { id: record.id };
  }

  /**
   * Log an OOO auto-reply as a CaseActivityLog entry (FR-003.A2).
   */
  private async logOooActivity(caseId: string, email: RawEmail): Promise<void> {
    try {
      await this.prisma.caseActivityLog.create({
        data: {
          case_id: caseId,
          action_code: 'OOO_RECEIVED',
          actor_type: 'SYSTEM',
          payload_json: {
            details: `Out-of-office reply received from ${email.from}`,
            messageId: email.messageId,
            from: email.from,
            receivedAt: email.receivedAt.toISOString(),
          },
        },
      });
      this.logger.debug(`Logged OOO activity for case ${caseId} from ${email.from}`);
    } catch (err) {
      this.logger.warn(`Failed to log OOO activity for case ${caseId}: ${(err as Error).message}`);
    }
  }

  /**
   * FR-002.A1: Dispatch a quarantine alert notification to SysAdmin.
   */
  private async dispatchQuarantineAlert(email: RawEmail, reason: string): Promise<void> {
    if (!this.notificationDispatchService) return;
    try {
      await this.notificationDispatchService.send(
        'SYS_ADMIN',
        'IN_APP' as any,
        'QUARANTINE_ALERT',
        {
          message_id: email.messageId,
          from: email.from,
          subject: email.subject,
          reason,
        },
      );
    } catch (err) {
      this.logger.warn(`Failed to dispatch quarantine alert for ${email.messageId}: ${(err as Error).message}`);
    }
  }

  /**
   * FR-001.A5: Replay failed jobs from the Dead Letter Queue.
   *
   * @param limit - Maximum number of jobs to replay (default 100)
   * @returns Count of replayed jobs and list of job IDs that failed to replay
   */
  async replayFailedJobs(limit = 100): Promise<{ replayed: number; failed: string[] }> {
    if (!this.dlqQueue) {
      this.logger.warn('DLQ queue not available; cannot replay failed jobs.');
      return { replayed: 0, failed: [] };
    }

    const failedJobs = await this.dlqQueue.getFailed(0, limit);
    let replayed = 0;
    const failed: string[] = [];

    for (const job of failedJobs) {
      try {
        await job.retry();
        replayed++;
      } catch (err) {
        const jobId = job.id ?? 'unknown';
        failed.push(jobId);
        this.logger.warn(`Failed to replay job ${jobId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Replayed ${replayed} failed jobs, ${failed.length} could not be replayed.`);
    return { replayed, failed };
  }

  /**
   * Get all ingested records.
   */
  async getRecords(limit = 100, offset = 0): Promise<EmailIngestRecord[]> {
    const records = await this.prisma.emailIngest.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });

    return records.map((r) => this.mapToRecord(r));
  }

  /**
   * Find a record by message ID.
   */
  async findByMessageId(messageId: string): Promise<EmailIngestRecord | undefined> {
    const record = await this.prisma.emailIngest.findUnique({
      where: { message_id: messageId },
    });

    return record ? this.mapToRecord(record) : undefined;
  }

  /**
   * Update record status.
   */
  async updateStatus(id: string, status: IngestStatus): Promise<void> {
    try {
      await this.prisma.emailIngest.update({
        where: { id },
        data: { ingest_status: status },
      });
    } catch {
      throw new Error(`Ingest record not found: ${id}`);
    }
  }

  private mapToRecord(r: {
    id: string;
    message_id: string;
    from_address: string;
    to_addresses: string[];
    cc_addresses: string[];
    subject: string;
    body_text: string | null;
    received_at: Date;
    ingest_status: string;
    language_detected: string | null;
    spf_verdict: string | null;
    dkim_verdict: string | null;
    dmarc_verdict: string | null;
    phishing_score: number | null;
    spam_score: number | null;
    thread_context: string | null;
    rfc822_s3_key: string | null;
    rfc822_checksum: string | null;
    source_mailbox: string;
    provider: string;
  }): EmailIngestRecord {
    const threadContext = r.thread_context ? JSON.parse(r.thread_context) : undefined;
    const securityVerdicts = (r.phishing_score !== null || r.spam_score !== null) ? {
      spf: r.spf_verdict,
      dkim: r.dkim_verdict,
      dmarc: r.dmarc_verdict,
      phishingScore: r.phishing_score ?? 0,
      spamScore: r.spam_score ?? 0,
    } : undefined;

    return {
      id: r.id,
      messageId: r.message_id,
      from: r.from_address,
      to: r.to_addresses,
      cc: r.cc_addresses,
      subject: r.subject,
      bodyText: r.body_text ?? undefined,
      receivedAt: r.received_at,
      ingestStatus: r.ingest_status as IngestStatus,
      languageDetected: r.language_detected ?? undefined,
      securityVerdicts,
      threadContext,
      rfc822S3Key: r.rfc822_s3_key ?? undefined,
      rfc822Checksum: r.rfc822_checksum ?? undefined,
      sourceMailbox: r.source_mailbox,
      provider: r.provider,
    };
  }
}
