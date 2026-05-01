import { Injectable, Logger, Optional, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../common/prisma';
import {
  NotificationChannel,
  NotificationRecord,
  NotificationTemplate,
} from '../types';
import { SmsTransport } from '../transports/sms.transport';
import { WhatsAppTransport } from '../transports/whatsapp.transport';

const DEFAULT_TEMPLATES: NotificationTemplate[] = [
  {
    code: 'CASE_ASSIGNED',
    subject: 'Case {{case_number}} assigned to you',
    body: 'Dear {{fpr_name}}, case {{case_number}} has been assigned to you. Priority: {{priority}}.',
  },
  {
    code: 'SLA_BREACH_WARNING',
    subject: 'SLA Breach Warning: Case {{case_number}}',
    body: 'Case {{case_number}} will breach SLA in {{breach_hours}} hours. Assigned FPR: {{fpr_name}}.',
  },
  {
    code: 'ESCALATION',
    subject: 'Escalation: Case {{case_number}}',
    body: 'Case {{case_number}} has been escalated. Reason: SLA breach of {{breach_hours}} hours.',
  },
  {
    code: 'DAILY_DIGEST',
    subject: 'Daily Pendency Report - {{date}}',
    body: 'Total open cases: {{total_open}}. Breached: {{total_breached}}. New today: {{new_today}}.',
  },
  // FR-100.A2: Channel-specific template variants
  {
    code: 'CASE_ASSIGNED_SMS',
    subject: '',
    body: 'Case {{case_number}} assigned. Priority: {{priority}}. —Atlas',
  },
  {
    code: 'CASE_ASSIGNED_WHATSAPP',
    subject: '',
    body: 'Case *{{case_number}}* assigned to you.\nPriority: {{priority}}\nPlease review in Atlas workbench.',
  },
  {
    code: 'SLA_BREACH_WARNING_SMS',
    subject: '',
    body: 'SLA WARN: Case {{case_number}} breaches in {{breach_hours}}h. —Atlas',
  },
  {
    code: 'SLA_BREACH_WARNING_WHATSAPP',
    subject: '',
    body: 'SLA Warning: Case *{{case_number}}* will breach in *{{breach_hours}} hours*.\nAssigned: {{fpr_name}}',
  },
  {
    code: 'ESCALATION_SMS',
    subject: '',
    body: 'ESCALATED: Case {{case_number}}, SLA breach {{breach_hours}}h. —Atlas',
  },
  {
    code: 'ESCALATION_WHATSAPP',
    subject: '',
    body: 'Escalation: Case *{{case_number}}*\nReason: SLA breach of {{breach_hours}} hours.',
  },
  {
    code: 'DAILY_DIGEST_SMS',
    subject: '',
    body: 'Atlas Pendency: {{total_open}} open, {{total_breached}} breached, {{new_today}} new. —Atlas',
  },
  {
    code: 'DAILY_DIGEST_WHATSAPP',
    subject: '',
    body: 'Daily Pendency Report — {{date}}\nOpen: {{total_open}}\nBreached: {{total_breached}}\nNew: {{new_today}}',
  },
];

/**
 * Default fallback chain: EMAIL -> SMS -> WHATSAPP -> IN_APP.
 */
const FALLBACK_CHAIN: NotificationChannel[] = [
  NotificationChannel.EMAIL,
  NotificationChannel.SMS,
  NotificationChannel.WHATSAPP,
  NotificationChannel.IN_APP,
];

/**
 * Retry delay schedule in milliseconds (1m, 5m, 15m, 30m, 60m).
 */
export const RETRY_DELAY_SCHEDULE = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
];

export const MAX_RETRY_ATTEMPTS = 5;

const DEDUP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const MAX_DEDUP_CACHE_SIZE = 10000;

export interface SendOptions {
  /** Enable fallback chain on failure (default: true). */
  fallbackEnabled?: boolean;
  /** If true, skip dedup check (used internally for fallback sends). */
  skipDedup?: boolean;
  /** Track the original notification ID through fallback chain. */
  originalNotificationId?: string;
  /**
   * FR-033 A3: Optional email headers for outbound threading.
   * When sending via EMAIL channel, these headers enable proper threading
   * in the recipient's mail client for case-related notifications.
   */
  emailHeaders?: {
    inReplyTo?: string;
    references?: string;
  };
  /** When true, create a PROPOSED notification log entry instead of sending (FR-033 A2). */
  requires_review?: boolean;
  /** When true, skip merge field validation (used for bounce fallbacks where original vars are unavailable). */
  skipMergeValidation?: boolean;
}

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);
  private templates: NotificationTemplate[] = [...DEFAULT_TEMPLATES];

  // Dedup cache -- transient (acceptable to lose on restart)
  private dedupCache: Map<string, Date> = new Map();

  // Channel send functions for testability
  private channelSenders: Map<NotificationChannel, (recipient: string, subject: string, body: string) => Promise<boolean>> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly smsTransport?: SmsTransport,
    @Optional() private readonly whatsAppTransport?: WhatsAppTransport,
    @Optional() @InjectQueue('notification-retry') private readonly retryQueue?: Queue,
  ) {
    // Sweep expired dedup entries every 5 minutes
    setInterval(() => this.sweepDedupCache(), 5 * 60 * 1000).unref();

    // Register default channel senders
    this.channelSenders.set(NotificationChannel.EMAIL, async (_recipient, _subject, _body) => {
      // Email sending logic -- currently a stub that always succeeds
      return true;
    });
    this.channelSenders.set(NotificationChannel.SMS, async (recipient, _subject, body) => {
      if (this.smsTransport) {
        return this.smsTransport.send(recipient, body);
      }
      return true;
    });
    this.channelSenders.set(NotificationChannel.WHATSAPP, async (recipient, _subject, body) => {
      if (this.whatsAppTransport) {
        return this.whatsAppTransport.send(recipient, body);
      }
      return true;
    });
    this.channelSenders.set(NotificationChannel.IN_APP, async () => {
      // In-app notifications always succeed (stored in DB)
      return true;
    });
    this.channelSenders.set(NotificationChannel.MS_TEAMS, async () => {
      return true;
    });
    // FR-100.A1: SLACK channel sender (stub)
    this.channelSenders.set(NotificationChannel.SLACK, async (_recipient, _subject, _body) => {
      return true;
    });
    // FR-100.A1: PUSH channel sender (stub)
    this.channelSenders.set(NotificationChannel.PUSH, async (_recipient, _subject, _body) => {
      return true;
    });
  }

  /**
   * Override a channel sender (for testing).
   */
  setChannelSender(
    channel: NotificationChannel,
    sender: (recipient: string, subject: string, body: string) => Promise<boolean>,
  ): void {
    this.channelSenders.set(channel, sender);
  }

  /**
   * Send a notification to a recipient via a specific channel.
   * Performs template rendering, deduplication, and optional fallback.
   */
  async send(
    recipientId: string,
    channel: NotificationChannel,
    templateCode: string,
    variables: Record<string, string>,
    options: SendOptions = {},
  ): Promise<NotificationRecord> {
    const { fallbackEnabled = true, skipDedup = false, originalNotificationId, emailHeaders, requires_review = false, skipMergeValidation = false } = options;

    // FR-033 A3: Log email threading headers when present for EMAIL channel
    if (channel === NotificationChannel.EMAIL && emailHeaders) {
      this.logger.debug(
        `Outbound threading headers: In-Reply-To=${emailHeaders.inReplyTo ?? 'none'}, ` +
        `References=${emailHeaders.references ?? 'none'}`,
      );
    }

    // FR-100 A2: Channel-specific template lookup — check for variant first
    const variantCode = `${templateCode}_${channel}`;
    const template = this.templates.find((t) => t.code === variantCode)
      || this.templates.find((t) => t.code === templateCode);
    if (!template) {
      throw new Error(`Template not found: ${templateCode}`);
    }

    // FR-033 A1: Merge field validation before send
    const placeholderRegex = /\{\{([^#/][^}]*?)\}\}/g;
    const requiredFields: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = placeholderRegex.exec(template.subject)) !== null) {
      const field = m[1].trim();
      if (!requiredFields.includes(field)) requiredFields.push(field);
    }
    while ((m = placeholderRegex.exec(template.body)) !== null) {
      const field = m[1].trim();
      if (!requiredFields.includes(field)) requiredFields.push(field);
    }
    const missingFields = requiredFields.filter(
      (f) => !(f in variables) || variables[f] === undefined || variables[f] === null,
    );
    if (missingFields.length > 0 && !skipMergeValidation) {
      throw new BadRequestException(
        `Missing merge fields: ${missingFields.join(', ')}`,
      );
    }

    const renderedSubject = this.interpolate(template.subject, variables);
    const renderedBody = this.interpolate(template.body, variables);

    // FR-033 A2: When requires_review is true, create a PROPOSED entry instead of sending
    if (requires_review) {
      const now = new Date();
      const proposedRecord: NotificationRecord = {
        id: this.generateId(),
        recipientId,
        channel,
        templateCode,
        variables,
        renderedSubject,
        renderedBody,
        sentAt: now,
        status: 'PROPOSED' as NotificationRecord['status'],
      };

      const logEntry = await this.prisma.notificationLog.create({
        data: {
          channel: channel,
          recipient: recipientId,
          template_code: templateCode,
          subject: renderedSubject,
          body_preview: renderedBody.substring(0, 500),
          status: 'PROPOSED',
        },
      }).catch((err) => {
        this.logger.warn(`Failed to log proposed notification: ${err.message}`);
        return null;
      });

      if (logEntry) {
        proposedRecord.id = logEntry.id;
      }

      return proposedRecord;
    }

    // Deduplication check
    if (!skipDedup) {
      const dedupKey = this.buildDedupKey(recipientId, channel, templateCode, variables);
      const lastSent = this.dedupCache.get(dedupKey);
      const now = new Date();

      // Evict oldest entries if cache exceeds max size
      if (this.dedupCache.size >= MAX_DEDUP_CACHE_SIZE) {
        this.sweepDedupCache();
      }

      if (lastSent && now.getTime() - lastSent.getTime() < DEDUP_WINDOW_MS) {
        const record: NotificationRecord = {
          id: this.generateId(),
          recipientId,
          channel,
          templateCode,
          variables,
          renderedSubject,
          renderedBody,
          sentAt: now,
          status: 'SUPPRESSED',
        };

        // Log suppressed notification to DB
        await this.prisma.notificationLog.create({
          data: {
            channel: channel,
            recipient: recipientId,
            template_code: templateCode,
            subject: renderedSubject,
            body_preview: renderedBody.substring(0, 500),
            status: 'SUPPRESSED',
          },
        }).catch((err) => this.logger.warn(`Failed to log notification: ${err.message}`));

        return record;
      }
    }

    // Attempt to send via the specified channel with same-channel retry (FR-033 A4)
    const now = new Date();
    const sender = this.channelSenders.get(channel);
    let sendSuccess = false;
    const SAME_CHANNEL_RETRIES = 2;
    const RETRY_BACKOFF_MS = [100, 300];

    for (let attempt = 0; attempt <= SAME_CHANNEL_RETRIES; attempt++) {
      try {
        sendSuccess = sender ? await sender(recipientId, renderedSubject, renderedBody) : false;
        if (sendSuccess) break;
      } catch (error) {
        this.logger.error(`Channel ${channel} send error (attempt ${attempt + 1}): ${(error as Error).message}`);
        sendSuccess = false;
      }
      if (!sendSuccess && attempt < SAME_CHANNEL_RETRIES) {
        const backoff = RETRY_BACKOFF_MS[attempt] || 300;
        this.logger.debug(`Retrying same channel ${channel} in ${backoff}ms (attempt ${attempt + 2}/${SAME_CHANNEL_RETRIES + 1})`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    if (sendSuccess) {
      // Record as sent
      if (!skipDedup) {
        const dedupKey = this.buildDedupKey(recipientId, channel, templateCode, variables);
        this.dedupCache.set(dedupKey, now);
      }

      // FR-033.A3: Record precise dispatch timestamp for TAT clock adjustment
      const dispatchedAt = new Date();

      const record: NotificationRecord = {
        id: originalNotificationId || this.generateId(),
        recipientId,
        channel,
        templateCode,
        variables,
        renderedSubject,
        renderedBody,
        sentAt: dispatchedAt,
        status: 'SENT',
      };

      // Log sent notification to DB with dispatch timestamp
      await this.prisma.notificationLog.create({
        data: {
          channel: channel,
          recipient: recipientId,
          template_code: templateCode,
          subject: renderedSubject,
          body_preview: renderedBody.substring(0, 500),
          status: 'SENT',
        },
      }).catch((err) => this.logger.warn(`Failed to log notification: ${err.message}`));

      // FR-033.A3: Record outbound dispatch on case activity log for TAT adjustment
      if (variables.case_id) {
        await this.prisma.caseActivityLog.create({
          data: {
            case_id: variables.case_id as string,
            action_code: 'OUTBOUND_DISPATCHED',
            actor_type: 'SYSTEM',
            payload_json: {
              channel,
              dispatched_at: dispatchedAt.toISOString(),
              template_code: templateCode,
              recipient: recipientId,
            },
          },
        }).catch((err) => this.logger.warn(`Failed to log dispatch activity: ${err.message}`));
      }

      return record;
    }

    // Send failed -- log the failure
    this.logger.warn(`Failed to send ${templateCode} to ${recipientId} via ${channel}`);
    const failedRecord: NotificationRecord = {
      id: originalNotificationId || this.generateId(),
      recipientId,
      channel,
      templateCode,
      variables,
      renderedSubject,
      renderedBody,
      sentAt: now,
      status: 'FAILED',
    };

    await this.prisma.notificationLog.create({
      data: {
        channel: channel,
        recipient: recipientId,
        template_code: templateCode,
        subject: renderedSubject,
        body_preview: renderedBody.substring(0, 500),
        status: 'FAILED',
      },
    }).catch((err) => this.logger.warn(`Failed to log notification: ${err.message}`));

    // Attempt fallback chain if enabled
    if (fallbackEnabled) {
      const fallbackResult = await this.attemptFallback(
        recipientId,
        channel,
        templateCode,
        variables,
        failedRecord.id,
      );
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    return failedRecord;
  }

  /**
   * Attempt to send via the fallback chain.
   * Falls through: EMAIL -> SMS -> WHATSAPP -> IN_APP.
   * If all channels fail before IN_APP, IN_APP is sent + lead is alerted.
   */
  async attemptFallback(
    recipientId: string,
    failedChannel: NotificationChannel,
    templateCode: string,
    variables: Record<string, string>,
    originalNotificationId: string,
  ): Promise<NotificationRecord | null> {
    const startIndex = FALLBACK_CHAIN.indexOf(failedChannel);
    if (startIndex === -1) {
      // Channel not in fallback chain, try IN_APP directly
      return this.sendFallbackInApp(recipientId, templateCode, variables, originalNotificationId);
    }

    // Try each subsequent channel in the fallback chain
    for (let i = startIndex + 1; i < FALLBACK_CHAIN.length; i++) {
      const nextChannel = FALLBACK_CHAIN[i];
      this.logger.log(`Fallback: trying ${nextChannel} for ${recipientId} (was ${failedChannel})`);

      const result = await this.send(recipientId, nextChannel, templateCode, variables, {
        fallbackEnabled: false, // Prevent recursive fallback
        skipDedup: true,
        originalNotificationId,
        skipMergeValidation: Object.keys(variables).length === 0 || '_bounce_fallback' in variables,
      });

      if (result.status === 'SENT') {
        // If we reached IN_APP as the last resort, also alert the lead
        if (nextChannel === NotificationChannel.IN_APP) {
          await this.alertLeadAboutFailure(recipientId, templateCode, originalNotificationId);
        }
        return result;
      }

      // Log fallback attempt failure
      this.logger.warn(`Fallback ${nextChannel} also failed for ${recipientId}`);
    }

    // All channels in chain failed, ensure IN_APP + alert lead
    if (failedChannel !== NotificationChannel.IN_APP) {
      return this.sendFallbackInApp(recipientId, templateCode, variables, originalNotificationId);
    }

    return null;
  }

  /**
   * Send an IN_APP notification as the final fallback and alert the lead.
   */
  private async sendFallbackInApp(
    recipientId: string,
    templateCode: string,
    variables: Record<string, string>,
    originalNotificationId: string,
  ): Promise<NotificationRecord> {
    this.logger.warn(
      `All channels failed for ${recipientId}. Sending IN_APP fallback and alerting lead.`,
    );

    const result = await this.send(
      recipientId,
      NotificationChannel.IN_APP,
      templateCode,
      variables,
      {
        fallbackEnabled: false,
        skipDedup: true,
        originalNotificationId,
      },
    );

    // Alert lead about delivery failure
    await this.alertLeadAboutFailure(recipientId, templateCode, originalNotificationId);

    return result;
  }

  /**
   * Alert the team lead about a notification delivery failure.
   */
  private async alertLeadAboutFailure(
    recipientId: string,
    templateCode: string,
    notificationId: string,
  ): Promise<void> {
    this.logger.warn(
      `ALERT LEAD: All channels failed for notification ${notificationId} ` +
        `(recipient: ${recipientId}, template: ${templateCode}). ` +
        `Fallback to IN_APP completed. Lead notification required.`,
    );

    // In production, this would look up the team lead and send them a notification
    // For now, we log the alert
    await this.prisma.notificationLog.create({
      data: {
        channel: NotificationChannel.IN_APP,
        recipient: 'LEAD',
        template_code: 'DELIVERY_FAILURE_ALERT',
        subject: `Notification delivery failure for ${recipientId}`,
        body_preview: `All channels failed for notification ${notificationId} (template: ${templateCode}). Only IN_APP delivery succeeded.`,
        status: 'SENT',
        sent_at: new Date(),
      },
    }).catch((err) => this.logger.warn(`Failed to alert lead: ${err.message}`));
  }

  /**
   * Enqueue a failed notification for retry with exponential backoff.
   */
  async enqueueRetry(
    recipientId: string,
    channel: NotificationChannel,
    templateCode: string,
    variables: Record<string, string>,
    attemptNumber: number,
  ): Promise<boolean> {
    if (!this.retryQueue) {
      this.logger.warn('Retry queue not available, skipping retry enqueue');
      return false;
    }

    if (attemptNumber >= MAX_RETRY_ATTEMPTS) {
      this.logger.warn(
        `Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached for ${recipientId}/${templateCode}`,
      );
      return false;
    }

    const delay = RETRY_DELAY_SCHEDULE[attemptNumber] || RETRY_DELAY_SCHEDULE[RETRY_DELAY_SCHEDULE.length - 1];

    await this.retryQueue.add(
      'notification-retry',
      {
        recipientId,
        channel,
        templateCode,
        variables,
        attemptNumber: attemptNumber + 1,
      },
      {
        delay,
        attempts: 1, // Each job is a single attempt; we manage retries ourselves
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Enqueued retry #${attemptNumber + 1} for ${recipientId}/${templateCode} ` +
        `via ${channel} with delay ${delay}ms`,
    );

    return true;
  }

  /**
   * Handle a bounce (NDR) for a previously sent notification.
   * Updates the log entry to BOUNCED and triggers fallback.
   */
  async handleBounce(
    originalRecipient: string,
    originalSubject: string,
  ): Promise<NotificationRecord | null> {
    this.logger.warn(
      `Bounce detected for recipient=${originalRecipient}, subject=${originalSubject}`,
    );

    // Find the most recent SENT notification log for this recipient/subject
    const logEntries = await this.prisma.notificationLog.findMany({
      where: {
        recipient: originalRecipient,
        status: 'SENT',
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    // Find matching entry by subject
    const matchingEntry = logEntries.find(
      (entry) => entry.subject && originalSubject.includes(entry.subject),
    );

    if (matchingEntry) {
      // Update status to BOUNCED
      await this.prisma.notificationLog.update({
        where: { id: matchingEntry.id },
        data: { status: 'BOUNCED' },
      }).catch((err) => this.logger.warn(`Failed to update bounce status: ${err.message}`));

      this.logger.log(`Marked notification ${matchingEntry.id} as BOUNCED`);

      // Trigger fallback for the bounced notification
      const templateCode = matchingEntry.template_code || '';
      if (templateCode) {
        // Bounce-triggered fallbacks use a simplified template without merge fields
        return this.attemptFallback(
          originalRecipient,
          NotificationChannel.EMAIL,
          templateCode,
          { _bounce_fallback: 'true' },
          matchingEntry.id,
        );
      }
    } else {
      this.logger.warn(
        `No matching notification log found for bounce: recipient=${originalRecipient}`,
      );
    }

    return null;
  }

  /**
   * Get all notification log entries.
   */
  async getLog(limit = 200): Promise<NotificationRecord[]> {
    const logs = await this.prisma.notificationLog.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    return logs.map((l) => ({
      id: l.id,
      recipientId: l.recipient,
      channel: l.channel as NotificationChannel,
      templateCode: l.template_code ?? '',
      variables: {},
      renderedSubject: l.subject ?? '',
      renderedBody: l.body_preview ?? '',
      sentAt: l.sent_at ?? l.created_at,
      status: l.status as 'SENT' | 'SUPPRESSED' | 'FAILED' | 'BOUNCED',
    }));
  }

  /**
   * Clear the dedup cache (for testing).
   */
  clearDedupCache(): void {
    this.dedupCache.clear();
  }

  /**
   * Manually expire a dedup entry by setting its timestamp to the past.
   */
  expireDedupEntry(
    recipientId: string,
    channel: NotificationChannel,
    templateCode: string,
    variables: Record<string, string>,
  ): void {
    const dedupKey = this.buildDedupKey(recipientId, channel, templateCode, variables);
    const expiredTime = new Date(Date.now() - DEDUP_WINDOW_MS - 1000);
    this.dedupCache.set(dedupKey, expiredTime);
  }

  /**
   * FR-101.A2: Resolve a notification template using multi-language fallback.
   *
   * Lookup pattern: `${code}_${channel}_${lang}` with fallback chain:
   *   1. CODE_CHANNEL_LANG (most specific)
   *   2. CODE_CHANNEL
   *   3. CODE_LANG
   *   4. CODE (least specific, base template)
   *
   * @param code    - The template code (e.g., 'CASE_ASSIGNED')
   * @param channel - The notification channel
   * @param lang    - Optional language code (e.g., 'hi', 'en')
   * @returns The resolved template, or undefined if none found
   */
  resolveTemplate(
    code: string,
    channel: NotificationChannel,
    lang?: string,
  ): NotificationTemplate | undefined {
    // 1. Try CODE_CHANNEL_LANG
    if (lang) {
      const key1 = `${code}_${channel}_${lang}`;
      const t1 = this.templates.find((t) => t.code === key1);
      if (t1) return t1;
    }

    // 2. Try CODE_CHANNEL
    const key2 = `${code}_${channel}`;
    const t2 = this.templates.find((t) => t.code === key2);
    if (t2) return t2;

    // 3. Try CODE_LANG
    if (lang) {
      const key3 = `${code}_${lang}`;
      const t3 = this.templates.find((t) => t.code === key3);
      if (t3) return t3;
    }

    // 4. Try CODE (base)
    const t4 = this.templates.find((t) => t.code === code);
    return t4;
  }

  /**
   * Add or replace a template.
   */
  registerTemplate(template: NotificationTemplate): void {
    const idx = this.templates.findIndex((t) => t.code === template.code);
    if (idx >= 0) {
      this.templates[idx] = template;
    } else {
      this.templates.push(template);
    }
  }

  /**
   * Render a template string supporting Handlebars-style syntax:
   *   {{variable}}          — simple interpolation
   *   {{#if cond}}...{{/if}} — conditional blocks (with optional {{else}})
   *   {{#each items}}...{{/each}} — loop blocks (exposes {{this}}, {{@index}}, {{@key}})
   *
   * Implementation is a safe recursive-descent parser — no eval / Function constructor.
   */
  interpolate(template: string, variables: Record<string, unknown>): string {
    return this.parseTemplate(template, variables);
  }

  private parseTemplate(template: string, ctx: Record<string, unknown>): string {
    let result = '';
    let pos = 0;

    while (pos < template.length) {
      const nextOpen = template.indexOf('{{', pos);
      if (nextOpen === -1) {
        result += template.slice(pos);
        break;
      }

      // Append text before the tag
      result += template.slice(pos, nextOpen);

      // Check for block helpers
      if (template.startsWith('{{#if ', nextOpen)) {
        const parsed = this.parseIfBlock(template, nextOpen, ctx);
        result += parsed.output;
        pos = parsed.endPos;
      } else if (template.startsWith('{{#each ', nextOpen)) {
        const parsed = this.parseEachBlock(template, nextOpen, ctx);
        result += parsed.output;
        pos = parsed.endPos;
      } else {
        // Simple variable interpolation {{varName}} or {{varName.nested}}
        const closeIdx = template.indexOf('}}', nextOpen);
        if (closeIdx === -1) {
          result += template.slice(nextOpen);
          pos = template.length;
        } else {
          const key = template.slice(nextOpen + 2, closeIdx).trim();
          const val = this.resolveValue(key, ctx);
          result += val !== undefined && val !== null ? String(val) : `{{${key}}}`;
          pos = closeIdx + 2;
        }
      }
    }

    return result;
  }

  private parseIfBlock(
    template: string,
    startPos: number,
    ctx: Record<string, unknown>,
  ): { output: string; endPos: number } {
    // Extract condition key from {{#if conditionKey}}
    const openTagEnd = template.indexOf('}}', startPos);
    if (openTagEnd === -1) {
      return { output: template.slice(startPos), endPos: template.length };
    }
    const conditionKey = template.slice(startPos + 6, openTagEnd).trim(); // skip '{{#if '
    const bodyStart = openTagEnd + 2;

    // Find matching {{/if}} considering nesting
    const { endTagStart, elseTagStart } = this.findBlockEnd(template, bodyStart, 'if');

    const condition = this.resolveValue(conditionKey, ctx);
    const isTruthy = this.isTruthy(condition);

    let output: string;
    if (elseTagStart !== -1) {
      const elseBodyStart = template.indexOf('}}', elseTagStart) + 2;
      if (isTruthy) {
        output = this.parseTemplate(template.slice(bodyStart, elseTagStart), ctx);
      } else {
        output = this.parseTemplate(template.slice(elseBodyStart, endTagStart), ctx);
      }
    } else {
      if (isTruthy) {
        output = this.parseTemplate(template.slice(bodyStart, endTagStart), ctx);
      } else {
        output = '';
      }
    }

    const endPos = template.indexOf('}}', endTagStart) + 2;
    return { output, endPos };
  }

  private parseEachBlock(
    template: string,
    startPos: number,
    ctx: Record<string, unknown>,
  ): { output: string; endPos: number } {
    // Extract collection key from {{#each collectionKey}}
    const openTagEnd = template.indexOf('}}', startPos);
    if (openTagEnd === -1) {
      return { output: template.slice(startPos), endPos: template.length };
    }
    const collectionKey = template.slice(startPos + 8, openTagEnd).trim(); // skip '{{#each '
    const bodyStart = openTagEnd + 2;

    const { endTagStart } = this.findBlockEnd(template, bodyStart, 'each');
    const bodyTemplate = template.slice(bodyStart, endTagStart);

    const collection = this.resolveValue(collectionKey, ctx);
    let output = '';

    if (Array.isArray(collection)) {
      for (let i = 0; i < collection.length; i++) {
        const item = collection[i];
        const itemCtx: Record<string, unknown> = {
          ...ctx,
          '@index': i,
          '@first': i === 0,
          '@last': i === collection.length - 1,
          this: item,
        };
        // If item is an object, spread its properties into context
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          Object.assign(itemCtx, item);
        }
        output += this.parseTemplate(bodyTemplate, itemCtx);
      }
    } else if (collection && typeof collection === 'object') {
      const entries = Object.entries(collection as Record<string, unknown>);
      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];
        const itemCtx: Record<string, unknown> = {
          ...ctx,
          '@key': key,
          '@index': i,
          '@first': i === 0,
          '@last': i === entries.length - 1,
          this: value,
        };
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(itemCtx, value as Record<string, unknown>);
        }
        output += this.parseTemplate(bodyTemplate, itemCtx);
      }
    }

    const endPos = template.indexOf('}}', endTagStart) + 2;
    return { output, endPos };
  }

  /**
   * Find matching {{/blockType}} accounting for nested blocks.
   * Also locates an optional {{else}} at the same nesting level.
   */
  private findBlockEnd(
    template: string,
    searchFrom: number,
    blockType: string,
  ): { endTagStart: number; elseTagStart: number } {
    let depth = 1;
    let pos = searchFrom;
    let elseTagStart = -1;

    while (pos < template.length && depth > 0) {
      const nextTag = template.indexOf('{{', pos);
      if (nextTag === -1) break;

      if (template.startsWith(`{{#${blockType} `, nextTag) || template.startsWith(`{{#${blockType}}}`, nextTag)) {
        depth++;
        pos = template.indexOf('}}', nextTag) + 2;
      } else if (template.startsWith(`{{/${blockType}}}`, nextTag)) {
        depth--;
        if (depth === 0) {
          return { endTagStart: nextTag, elseTagStart };
        }
        pos = nextTag + `{{/${blockType}}}`.length;
      } else if (template.startsWith('{{else}}', nextTag) && depth === 1) {
        elseTagStart = nextTag;
        pos = nextTag + 8; // skip {{else}}
      } else {
        pos = template.indexOf('}}', nextTag) + 2;
        if (pos <= 1) break; // indexOf returned -1
      }
    }

    // If not found, return end of string
    return { endTagStart: template.length, elseTagStart };
  }

  /**
   * Unsafe property names that must never be resolved from the prototype chain.
   */
  private static readonly UNSAFE_KEYS = new Set([
    'constructor',
    '__proto__',
    'prototype',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
  ]);

  /**
   * Resolve a dotted path (e.g., "user.name") against a context object.
   * Also handles special keys like "this", "@index", "@key", "@first", "@last".
   * Blocks access to prototype-chain properties for safety.
   */
  private resolveValue(path: string, ctx: Record<string, unknown>): unknown {
    if (path === 'this') return ctx['this'];
    if (path.startsWith('@')) return ctx[path];

    const parts = path.split('.');

    // Block any part that references unsafe prototype properties
    for (const part of parts) {
      if (NotificationDispatchService.UNSAFE_KEYS.has(part)) {
        return undefined;
      }
    }

    let current: unknown = ctx;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object') {
        // Only resolve own properties
        if (!Object.prototype.hasOwnProperty.call(current, part)) {
          return undefined;
        }
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined || value === false || value === 0 || value === '') {
      return false;
    }
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  private buildDedupKey(
    recipientId: string,
    channel: NotificationChannel,
    templateCode: string,
    variables: Record<string, string>,
  ): string {
    const varStr = Object.entries(variables)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('|');
    return `${recipientId}:${channel}:${templateCode}:${varStr}`;
  }

  private generateId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Sweep expired entries from the dedup cache.
   */
  private sweepDedupCache(): void {
    const now = Date.now();
    for (const [key, sentAt] of this.dedupCache.entries()) {
      if (now - sentAt.getTime() >= DEDUP_WINDOW_MS) {
        this.dedupCache.delete(key);
      }
    }
  }
}
