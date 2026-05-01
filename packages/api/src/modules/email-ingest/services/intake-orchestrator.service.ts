import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { EmailIngestService, SUPPORTED_LANGUAGES } from '../email-ingest.service';
import { ClassificationPipelineService } from '../../ai-classification/services/classification-pipeline.service';
import { CaseCreationService } from '../../cases/services/case-creation.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { SlaClockService } from '../../sla/services/sla-clock.service';
import { PiiLintService } from '../../notifications/services/pii-lint.service';
import { IngestStatus } from '../types';
import { CaseRecord, CaseStatus } from '../../cases/types';
import { ClassificationResult } from '../../ai-classification/types';

/** FR-129.A1: Default synthetic-only domains for non-prod email isolation. */
const SYNTHETIC_ONLY_DOMAINS = ['synthetic.atlas.dev', 'test.atlas.dev'];

export interface OrchestrateResult {
  ingestId: string;
  classification: ClassificationResult;
  caseRecord: CaseRecord;
  requiresTriage: boolean;
}

/**
 * Intake Orchestrator Service.
 *
 * Chains the full intake pipeline:
 *   1. Retrieve ingested email record
 *   2. Classify via AI classification pipeline
 *   3. Validate classification
 *   4. Create case from classification result
 *   5. If confidence is RED/RED_MANUAL, mark case for triage
 *   6. Emit audit log
 *
 * Records accountable_officer_id on CaseActivityLog entries.
 */
@Injectable()
export class IntakeOrchestratorService {
  private readonly logger = new Logger(IntakeOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailIngestService: EmailIngestService,
    private readonly classificationPipeline: ClassificationPipelineService,
    private readonly caseCreationService: CaseCreationService,
    private readonly auditLogService: AuditLogService,
    private readonly piiLintService: PiiLintService,
    @Optional() private readonly slaClockService?: SlaClockService,
  ) {}

  /**
   * Orchestrate the full intake pipeline for an ingested email.
   *
   * @param ingestId - The email ingest record ID (database UUID).
   */
  async orchestrate(ingestId: string): Promise<OrchestrateResult> {
    this.logger.log(`Starting intake orchestration for ingest ${ingestId}`);

    // Step 1: Retrieve the ingested email record
    const ingestRecord = await this.prisma.emailIngest.findUnique({
      where: { id: ingestId },
    });

    if (!ingestRecord) {
      throw new NotFoundException(`Ingest record not found: ${ingestId}`);
    }

    // FR-129.A1,A4: Dev/UAT email isolation — only process emails from allowed domains in non-prod
    if (process.env.NODE_ENV !== 'production') {
      const envDomains = (process.env.ALLOWED_DEV_DOMAINS || '').split(',').map(d => d.trim()).filter(Boolean);
      // FR-129.A1: If ALLOWED_DEV_DOMAINS is empty, default to synthetic-only domains
      const allowedDomains = envDomains.length > 0 ? envDomains : SYNTHETIC_ONLY_DOMAINS;
      if (ingestRecord.from_address) {
        const senderDomain = ingestRecord.from_address.split('@')[1]?.toLowerCase();
        if (senderDomain && !allowedDomains.includes(senderDomain)) {
          this.logger.warn(
            `Dev/UAT email isolation: rejecting email from ${senderDomain} — ` +
            `not in ALLOWED_DEV_DOMAINS: ${allowedDomains.join(', ')}`,
          );
          await this.emailIngestService.updateStatus(ingestId, IngestStatus.QUARANTINED);
          throw new Error(`Email from ${senderDomain} rejected by dev/UAT email isolation policy`);
        }
      }
    }

    // Update status to PROCESSING
    await this.emailIngestService.updateStatus(ingestId, IngestStatus.PROCESSING);

    // FR-004 A3: If thread references an existing open case, link to it instead of creating new
    const threadContext = ingestRecord.thread_context
      ? JSON.parse(ingestRecord.thread_context)
      : null;
    if (threadContext?.existingCaseId) {
      const existingCase = await this.prisma.case.findUnique({
        where: { id: threadContext.existingCaseId },
        select: { id: true, status: true, case_number: true },
      });

      if (existingCase && existingCase.status !== 'CLOSED' && existingCase.status !== 'CANCELLED') {
        this.logger.log(
          `Thread links to existing open case ${existingCase.case_number}. ` +
          `Linking ingest ${ingestId} instead of creating new case.`,
        );

        // Link the EmailIngest to the existing case
        await this.prisma.emailIngest.update({
          where: { id: ingestId },
          data: { ingest_status: IngestStatus.CLASSIFIED },
        });

        // Log activity on the existing case
        await this.prisma.caseActivityLog.create({
          data: {
            case_id: existingCase.id,
            action_code: 'INBOUND_RECEIVED',
            actor_type: 'SYSTEM',
            payload_json: {
              details: `New inbound email linked to existing case via thread`,
              ingestId,
              messageId: ingestRecord.message_id,
              from: ingestRecord.from_address,
              subject: ingestRecord.subject,
            },
          },
        });

        // Update the email_ingest record to reference the existing case
        await this.prisma.case.update({
          where: { id: existingCase.id },
          data: { email_ingest_id: ingestId },
        }).catch(() => {
          // email_ingest_id is unique; if already set, just log the linkage
          this.logger.debug(`Case ${existingCase.case_number} already has an email_ingest_id set`);
        });

        // Return a stub result referencing the existing case
        return {
          ingestId,
          classification: {
            top_label: 'THREAD_LINKED',
            top_confidence: 1.0,
            alternatives: [],
            entities: [],
            validation_outcomes: [],
            confidence_band: 'GREEN',
            requires_human_review: false,
            llm_mode: 'OFF',
            inference_ms: 0,
          } as ClassificationResult,
          caseRecord: {
            id: existingCase.id,
            caseNumber: existingCase.case_number,
            emailIngestId: ingestId,
            subject: ingestRecord.subject,
            from: ingestRecord.from_address,
            status: existingCase.status as CaseStatus,
            caseType: 'THREAD_LINKED',
            priority: 'MEDIUM',
            confidenceBand: 'GREEN',
            languageDetected: ingestRecord.language_detected || 'en',
            createdAt: new Date(),
            updatedAt: new Date(),
            activityLog: [],
            linkedCaseIds: [],
          },
          requiresTriage: false,
        };
      }
    }

    // Step 2: Classify the email
    let classification: ClassificationResult;
    try {
      classification = await this.classificationPipeline.classify({
        subject: ingestRecord.subject,
        body: ingestRecord.body_text || '',
        threadContext: ingestRecord.thread_context || undefined,
      });
    } catch (error) {
      // Mark as failed and re-throw
      await this.emailIngestService.updateStatus(ingestId, IngestStatus.FAILED);
      this.logger.error(`Classification failed for ingest ${ingestId}: ${(error as Error).message}`);
      throw error;
    }

    // Update ingest status to CLASSIFIED
    await this.emailIngestService.updateStatus(ingestId, IngestStatus.CLASSIFIED);

    // FR-053.A3: PII lint scan on ingested email body
    const emailBodyText = ingestRecord.body_text || '';
    const piiScanResult = this.piiLintService.scanForPii(emailBodyText);
    if (piiScanResult.hasPii) {
      this.logger.warn(
        `PII detected in ingest ${ingestId}: ${piiScanResult.findings.length} finding(s) ` +
        `[${[...new Set(piiScanResult.findings.map((f) => f.type))].join(', ')}]`,
      );
      // Flag for human review so PII-containing emails are triaged
      classification.requires_human_review = true;
      // Persist PII flag in thread_context for downstream audit / redaction
      const piiTypes = [...new Set(piiScanResult.findings.map((f) => f.type))];
      const existingContext = ingestRecord.thread_context
        ? (() => { try { return JSON.parse(ingestRecord.thread_context!); } catch { return {}; } })()
        : {};
      await this.prisma.emailIngest.update({
        where: { id: ingestId },
        data: {
          thread_context: JSON.stringify({ ...existingContext, pii_detected: true, pii_types: piiTypes }),
        },
      });
    }

    // FR-005.A3: Non-supported language routing
    const detectedLanguage = ingestRecord.language_detected || 'en';
    const isLanguageSupported = SUPPORTED_LANGUAGES.includes(
      detectedLanguage as typeof SUPPORTED_LANGUAGES[number],
    );
    if (!isLanguageSupported) {
      classification.requires_human_review = true;
      this.logger.log(
        `Unsupported language "${detectedLanguage}" for ingest ${ingestId} — routing to Triage Review`,
      );
    }

    // Step 3: Determine if classification requires triage
    const requiresTriage =
      classification.confidence_band === 'RED' ||
      classification.confidence_band === 'RED_MANUAL' ||
      classification.requires_human_review;

    // Step 4: Determine priority from classification
    const priority = this.derivePriority(classification);

    // Extract entities for case creation
    const loanAccountNo = classification.entities.find(
      (e) => e.entity_type === 'LOAN_ACCOUNT_NO',
    )?.value;
    const customerName = classification.entities.find(
      (e) => e.entity_type === 'CUSTOMER_NAME',
    )?.value;
    const propertyCity = classification.entities.find(
      (e) => e.entity_type === 'PROPERTY_CITY',
    )?.value;
    const propertyPin = classification.entities.find(
      (e) => e.entity_type === 'PROPERTY_PIN' || e.entity_type === 'PIN_CODE',
    )?.value;

    // Step 5: Create the case
    const caseRecord = await this.caseCreationService.createCase({
      emailIngestId: ingestId,
      subject: ingestRecord.subject,
      from: ingestRecord.from_address,
      classification: {
        caseType: classification.top_label,
        confidenceBand: classification.confidence_band,
        priority,
        loanAccountNo,
        customerName,
        propertyCity,
        propertyPin,
        languageDetected: ingestRecord.language_detected || 'en',
      },
    });

    // Step 5b: Auto-resume SLA clock if this email belongs to an existing thread
    // with a paused SLA clock (inbound email on existing case should resume the clock)
    await this.autoResumeIfPaused(ingestRecord, caseRecord);

    // Step 6: If requires triage, record on the case activity log
    if (requiresTriage) {
      const triageReason = !isLanguageSupported
        ? `UNSUPPORTED_LANGUAGE: "${detectedLanguage}" is not in the supported languages list`
        : `AI confidence band ${classification.confidence_band} requires human review`;

      this.logger.log(`Case ${caseRecord.caseNumber} requires triage (confidence: ${classification.confidence_band})`);

      await this.prisma.caseActivityLog.create({
        data: {
          case_id: caseRecord.id,
          action_code: 'TRIAGE_REQUIRED',
          actor_type: 'SYSTEM',
          payload_json: {
            details: triageReason,
            confidenceBand: classification.confidence_band,
            topConfidence: classification.top_confidence,
            accountable_officer_id: null,
            ...(!isLanguageSupported && { reason: 'UNSUPPORTED_LANGUAGE', detectedLanguage }),
          },
        },
      });
    }

    // Step 7: Emit audit log
    await this.auditLogService.emit({
      event_code: 'INTAKE_ORCHESTRATION',
      actor_type: 'SERVICE',
      resource_type: 'Case',
      resource_id: caseRecord.id,
      action: 'INTAKE_COMPLETE',
      payload_json: {
        ingestId,
        caseNumber: caseRecord.caseNumber,
        caseType: classification.top_label,
        confidenceBand: classification.confidence_band,
        topConfidence: classification.top_confidence,
        requiresTriage,
        llmMode: classification.llm_mode,
        inferenceMs: classification.inference_ms,
      },
      ai_confidence: classification.top_confidence,
    });

    this.logger.log(
      `Intake orchestration complete: ${caseRecord.caseNumber} [${classification.top_label}] ` +
        `confidence=${classification.confidence_band} triage=${requiresTriage}`,
    );

    return {
      ingestId,
      classification,
      caseRecord,
      requiresTriage,
    };
  }

  /**
   * FR-003.A2: Detect Out-of-Office (OOO) auto-reply from email body.
   */
  detectOooReply(emailBody: string): boolean {
    const oooPatterns = [
      /out of (?:the )?office/i,
      /auto[- ]?reply/i,
      /automatic reply/i,
      /on (?:annual |sick )?leave/i,
      /currently (?:away|unavailable|out)/i,
      /will (?:be )?(?:back|return)/i,
      /away from (?:the )?office/i,
      /i am (?:currently )?(?:out of office|on leave|away)/i,
      /thank you for your (?:email|message).*(?:away|unavailable)/i,
    ];

    return oooPatterns.some((pattern) => pattern.test(emailBody));
  }

  /**
   * FR-004.A3: Find an existing open case by thread message IDs.
   */
  async findCaseByThreadId(messageIds: string[]): Promise<{ id: string; case_number: string; status: string } | null> {
    if (!messageIds || messageIds.length === 0) return null;

    const activity = await this.prisma.caseActivityLog.findFirst({
      where: {
        action_code: 'INBOUND_RECEIVED',
        payload_json: {
          path: ['messageId'],
          string_contains: messageIds[0],
        },
      },
      select: { case_id: true },
    });

    if (!activity) return null;

    const existingCase = await this.prisma.case.findUnique({
      where: { id: activity.case_id },
      select: { id: true, case_number: true, status: true },
    });

    if (existingCase && existingCase.status !== 'CLOSED' && existingCase.status !== 'CANCELLED') {
      return existingCase;
    }

    return null;
  }

  /**
   * Auto-resume the SLA clock if the inbound email is a reply on an existing
   * thread whose case currently has the SLA clock paused.
   */
  private async autoResumeIfPaused(
    ingestRecord: { thread_context?: string | null; in_reply_to?: string | null },
    caseRecord: CaseRecord,
  ): Promise<void> {
    if (!this.slaClockService) {
      return;
    }

    // Only attempt auto-resume if the email is a reply (i.e., has thread context)
    const isReply =
      !!ingestRecord.in_reply_to ||
      (ingestRecord.thread_context && ingestRecord.thread_context.length > 0);

    if (!isReply) {
      return;
    }

    // Check if the case has an active SLA pause
    const pauseRecords = this.slaClockService.getPauseRecords(caseRecord.id);
    const hasActivePause = pauseRecords.some((r) => !r.resumedAt);

    if (hasActivePause) {
      this.logger.log(
        `Auto-resuming SLA clock for case ${caseRecord.caseNumber} due to inbound email on paused thread`,
      );
      this.slaClockService.resumeClock(caseRecord.id);
    }
  }

  /**
   * Derive priority from classification result.
   */
  private derivePriority(classification: ClassificationResult): string {
    // Use urgency signal if available
    if (classification.urgency_signal === 'HIGH') return 'HIGH';
    if (classification.urgency_signal === 'CRITICAL') return 'CRITICAL';

    // Use sentiment as secondary signal
    if (classification.sentiment === 'ANGRY' || classification.sentiment === 'FRUSTRATED') {
      return 'HIGH';
    }

    // Default based on confidence band
    if (classification.confidence_band === 'RED' || classification.confidence_band === 'RED_MANUAL') {
      return 'HIGH';
    }
    if (classification.confidence_band === 'AMBER') {
      return 'MEDIUM';
    }

    return 'MEDIUM';
  }
}
