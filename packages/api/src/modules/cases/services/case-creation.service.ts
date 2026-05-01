import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../common/prisma';
import { CaseRecord, CaseStatus, ActivityLogEntry, RoutingResult, RoutingFailure, AUTO_CLOSE_RESOLVED_DAYS } from '../types';
import { RoutingInput } from './routing.service';
import { StateMachineService, TransitionContext } from './state-machine.service';
import { RoutingService } from './routing.service';
import { VendorSelectionService } from './vendor-selection.service';
import { AutoAckService } from './auto-ack.service';
import { computeTargetDatetime, BusinessHoursConfig, Holiday, DEFAULT_BUSINESS_HOURS } from '../../../common/utils/business-hours';
import { WebhookDispatcherService } from '../../webhooks/services/webhook-dispatcher.service';

export interface ClassificationInput {
  caseType: string;
  confidenceBand: string;
  priority: string;
  loanAccountNo?: string;
  customerName?: string;
  propertyCity?: string;
  propertyPin?: string;
  languageDetected: string;
}

export interface CreateCaseInput {
  emailIngestId: string;
  subject: string;
  from: string;
  classification: ClassificationInput;
}

/**
 * Case Creation Service (FR-030).
 * Creates cases from classified emails, computes TAT targets,
 * routes to FPR, selects vendor, and sends auto-ack.
 */
@Injectable()
export class CaseCreationService {
  private readonly logger = new Logger(CaseCreationService.name);

  // Cached master data with TTL
  private tatConfigCache: { data: Record<string, number>; loadedAt: number } | null = null;
  private businessHoursCache: { data: BusinessHoursConfig[]; loadedAt: number } | null = null;
  private holidaysCache: { data: Holiday[]; loadedAt: number } | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly routingService: RoutingService,
    private readonly vendorSelection: VendorSelectionService,
    private readonly autoAck: AutoAckService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  /**
   * Set TAT config (for testing).
   */
  setTatConfig(config: Record<string, number>): void {
    this.tatConfigCache = { data: config, loadedAt: Date.now() };
  }

  /**
   * Set business hours (for testing).
   */
  setBusinessHours(hours: BusinessHoursConfig[], holidays: Holiday[]): void {
    this.businessHoursCache = { data: hours, loadedAt: Date.now() };
    this.holidaysCache = { data: holidays, loadedAt: Date.now() };
  }

  /**
   * Create a new case from a classified email.
   */
  async createCase(input: CreateCaseInput): Promise<CaseRecord> {
    const { emailIngestId, subject, from, classification } = input;

    // Load master data (parallel — independent caches)
    const [tatConfig, businessHours, holidays] = await Promise.all([
      this.getTatConfig(),
      this.getBusinessHours(),
      this.getHolidays(),
    ]);

    // Generate case number: ATL-YYYY-NNNNNN
    const caseNumber = await this.generateCaseNumber();

    // Compute TAT target
    const tatHours = tatConfig[classification.caseType] || 48;
    const tatTargetAt = computeTargetDatetime(
      new Date(),
      tatHours,
      businessHours,
      holidays,
    );

    // Route to FPR using routeWithLookup (canonical lookup chain)
    const routingInput: RoutingInput = {
      caseType: classification.caseType,
      propertyPin: classification.propertyPin,
      propertyCity: classification.propertyCity,
    };
    const routeResult = await this.routingService.routeWithLookup(routingInput);

    // Determine if routing succeeded or failed
    const isRoutingFailure = 'success' in routeResult && routeResult.success === false;
    const routingResult: RoutingResult | null = isRoutingFailure ? null : routeResult as RoutingResult;
    const routingFailure: RoutingFailure | null = isRoutingFailure ? routeResult as RoutingFailure : null;

    // Create case + activity logs in a transaction
    const caseId = crypto.randomUUID();
    const now = new Date();

    const activityEntries: { action: string; performedBy: string; details?: string; fromStatus?: string; toStatus?: string; payload?: Record<string, unknown> }[] = [
      { action: 'CREATED', performedBy: 'system', details: `Case created from email ${emailIngestId}` },
      { action: 'STATUS_CHANGE', performedBy: 'system', details: 'Auto-classified', fromStatus: CaseStatus.NEW, toStatus: CaseStatus.CLASSIFIED },
    ];

    // Log initial priority assignment
    activityEntries.push({
      action: 'PRIORITY_CHANGED',
      performedBy: 'system',
      details: `Priority set to ${classification.priority}`,
      payload: { from: null, to: classification.priority, reason: 'Initial classification', source: 'AI_CLASSIFICATION' },
    });

    let finalStatus = CaseStatus.CLASSIFIED;

    if (routingFailure) {
      // Routing failed — set status to AWAITING_FIELD_DISAMBIGUATION
      activityEntries.push({
        action: 'STATUS_CHANGE',
        performedBy: 'system',
        details: routingFailure.reason,
        fromStatus: CaseStatus.CLASSIFIED,
        toStatus: CaseStatus.AWAITING_FIELD_DISAMBIGUATION,
      });
      activityEntries.push({
        action: 'ROUTING_FAILURE',
        performedBy: 'system',
        details: routingFailure.reason,
        payload: {
          failedTier: routingFailure.failedTier,
          resolvedKeys: routingFailure.resolvedKeys,
          lookupMatchTypes: routingFailure.lookupMatchTypes,
        },
      });
      finalStatus = CaseStatus.AWAITING_FIELD_DISAMBIGUATION;
      this.logger.warn(`Routing failed for case: ${routingFailure.reason}. Setting status to AWAITING_FIELD_DISAMBIGUATION.`);
    } else if (routingResult) {
      activityEntries.push({
        action: 'STATUS_CHANGE',
        performedBy: 'system',
        details: routingResult.reason,
        fromStatus: CaseStatus.CLASSIFIED,
        toStatus: CaseStatus.ROUTED,
      });
      finalStatus = CaseStatus.ROUTED;
    }

    // Validate transitions
    this.stateMachine.validateTransition(CaseStatus.NEW, CaseStatus.CLASSIFIED);
    if (routingFailure) {
      this.stateMachine.validateTransition(CaseStatus.CLASSIFIED, CaseStatus.AWAITING_FIELD_DISAMBIGUATION);
    } else if (routingResult) {
      this.stateMachine.validateTransition(CaseStatus.CLASSIFIED, CaseStatus.ROUTED);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.case.create({
        data: {
          id: caseId,
          case_number: caseNumber,
          email_ingest_id: emailIngestId,
          case_type: classification.caseType,
          priority: classification.priority,
          status: finalStatus,
          confidence_band: classification.confidenceBand,
          loan_account_no: classification.loanAccountNo,
          customer_name: classification.customerName,
          property_city: classification.propertyCity,
          property_pin: classification.propertyPin,
          assigned_fpr_id: routingResult?.fprId,
          // FR-133.A1: Enrich routing rationale with explicit tier label and confidence band
          routing_rationale: routingResult?.reason
            ? `[Tier: ${routingResult.matchedTier || 'STANDARD'}] [Confidence: ${classification.confidenceBand}] ${routingResult.reason}`
            : undefined,
          tat_target_at: tatTargetAt,
          ai_summary: subject,
        },
      });

      for (const entry of activityEntries) {
        await tx.caseActivityLog.create({
          data: {
            case_id: caseId,
            action_code: entry.action,
            actor_type: 'SYSTEM',
            payload_json: {
              details: entry.details,
              ...(entry.fromStatus && { fromStatus: entry.fromStatus }),
              ...(entry.toStatus && { toStatus: entry.toStatus }),
              ...(entry.payload && { ...entry.payload }),
              accountable_officer_id: null,
            },
          },
        });
      }
    });

    // Build return object matching CaseRecord interface
    const activityLog: ActivityLogEntry[] = activityEntries.map((e) => ({
      id: crypto.randomUUID(),
      timestamp: now,
      action: e.action,
      performedBy: e.performedBy,
      details: e.details,
      fromStatus: e.fromStatus as CaseStatus | undefined,
      toStatus: e.toStatus as CaseStatus | undefined,
    }));

    const caseRecord: CaseRecord = {
      id: caseId,
      caseNumber,
      emailIngestId,
      subject,
      from,
      status: finalStatus,
      caseType: classification.caseType,
      priority: classification.priority,
      confidenceBand: classification.confidenceBand,
      languageDetected: classification.languageDetected,
      loanAccountNo: classification.loanAccountNo,
      customerName: classification.customerName,
      propertyCity: classification.propertyCity,
      propertyPin: classification.propertyPin,
      assignedFprId: routingResult?.fprId,
      assignedFprName: routingResult?.fprName,
      tatTargetAt,
      createdAt: now,
      updatedAt: now,
      activityLog,
      linkedCaseIds: [],
    };

    // FR-141.A1: Dispatch case.created webhook event (fire-and-forget)
    try {
      this.webhookDispatcher.dispatch('case.created', {
        caseId: caseRecord.id,
        caseNumber: caseRecord.caseNumber,
        caseType: caseRecord.caseType,
        status: caseRecord.status,
        priority: caseRecord.priority,
        assignedFprId: caseRecord.assignedFprId,
        createdAt: caseRecord.createdAt.toISOString(),
      });
    } catch (err) {
      this.logger.error(`Webhook dispatch failed for case.created ${caseNumber}: ${(err as Error).message}`);
    }

    // FR-141.A1: Dispatch case.routed webhook event if routing succeeded (fire-and-forget)
    if (routingResult) {
      try {
        this.webhookDispatcher.dispatch('case.routed', {
          caseId: caseRecord.id,
          caseNumber: caseRecord.caseNumber,
          caseType: caseRecord.caseType,
          assignedFprId: routingResult.fprId,
          assignedFprName: routingResult.fprName,
          routingRationale: routingResult.reason,
          routedAt: new Date().toISOString(),
        });
      } catch (err) {
        this.logger.error(`Webhook dispatch failed for case.routed ${caseNumber}: ${(err as Error).message}`);
      }
    }

    // Do NOT proceed with vendor selection or outbound dispatch on routing failure
    if (!routingFailure) {
      // Send auto-acknowledgement (non-blocking)
      this.autoAck.sendAck(from, caseNumber, classification.caseType, classification.languageDetected).catch((err) => {
        this.logger.error(`Auto-ack failed for ${caseNumber}: ${err.message}`);
      });
    }

    this.logger.log(`Case ${caseNumber} created [${classification.caseType}] assigned to ${routingResult?.fprName || (routingFailure ? 'AWAITING_DISAMBIGUATION' : 'MANUAL_QUEUE')}`);

    return caseRecord;
  }

  /**
   * Transition case status with validation.
   */
  async transitionStatus(
    caseId: string,
    targetStatus: CaseStatus,
    performedBy: string,
    details?: string,
    context?: TransitionContext,
  ): Promise<void> {
    const dbCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!dbCase) throw new Error(`Case not found: ${caseId}`);

    // Build transition context from DB record + caller-supplied context
    const transitionCtx: TransitionContext = {
      closedAt: dbCase.closed_at ? new Date(dbCase.closed_at) : undefined,
      ...context,
    };

    this.stateMachine.validateTransition(
      dbCase.status as CaseStatus,
      targetStatus,
      transitionCtx,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id: caseId },
        data: {
          status: targetStatus,
          ...(targetStatus === CaseStatus.CLOSED && { closed_at: new Date() }),
          ...((targetStatus === CaseStatus.RESOLVED || targetStatus === CaseStatus.CLOSED) && context?.resolution_code && {
            resolution_code: context.resolution_code,
            resolution_summary: context.resolution_summary,
          }),
        },
      });

      await tx.caseActivityLog.create({
        data: {
          case_id: caseId,
          action_code: 'STATUS_CHANGE',
          actor_type: performedBy === 'system' ? 'SYSTEM' : 'USER',
          actor_id: performedBy !== 'system' ? performedBy : undefined,
          payload_json: {
            details,
            fromStatus: dbCase.status,
            toStatus: targetStatus,
            accountable_officer_id: performedBy !== 'system' ? performedBy : null,
            ...(context?.resolution_code && { resolution_code: context.resolution_code }),
            ...(context?.resolution_summary && { resolution_summary: context.resolution_summary }),
          },
        },
      });
    });

    // FR-141.A1: Dispatch case.resolved webhook event on resolution or closure (fire-and-forget)
    if (targetStatus === CaseStatus.RESOLVED || targetStatus === CaseStatus.CLOSED) {
      try {
        this.webhookDispatcher.dispatch('case.resolved', {
          caseId,
          fromStatus: dbCase.status,
          toStatus: targetStatus,
          resolutionCode: context?.resolution_code,
          resolutionSummary: context?.resolution_summary,
          performedBy,
          resolvedAt: new Date().toISOString(),
        });
      } catch (err) {
        this.logger.error(`Webhook dispatch failed for case.resolved ${caseId}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Auto-close cases that have been in RESOLVED status for more than AUTO_CLOSE_RESOLVED_DAYS.
   * This method should be called periodically (e.g., by the escalation sweep job).
   * Returns the number of cases auto-closed.
   */
  async autoCloseResolvedCases(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUTO_CLOSE_RESOLVED_DAYS);

    // Find cases in RESOLVED status that were updated before the cutoff
    const resolvedCases = await this.prisma.case.findMany({
      where: {
        status: CaseStatus.RESOLVED,
        updated_at: { lt: cutoffDate },
      },
      select: { id: true, case_number: true },
    });

    let closedCount = 0;

    for (const c of resolvedCases) {
      try {
        // RESOLVED -> CLOSED does not require resolution fields (already provided at RESOLVED time)
        await this.prisma.$transaction(async (tx) => {
          await tx.case.update({
            where: { id: c.id },
            data: {
              status: CaseStatus.CLOSED,
              closed_at: new Date(),
            },
          });

          await tx.caseActivityLog.create({
            data: {
              case_id: c.id,
              action_code: 'STATUS_CHANGE',
              actor_type: 'SYSTEM',
              payload_json: {
                details: `Auto-closed after ${AUTO_CLOSE_RESOLVED_DAYS} days in RESOLVED status`,
                fromStatus: CaseStatus.RESOLVED,
                toStatus: CaseStatus.CLOSED,
                accountable_officer_id: null,
              },
            },
          });
        });

        closedCount++;
        this.logger.log(`Auto-closed case ${c.case_number} after ${AUTO_CLOSE_RESOLVED_DAYS} days in RESOLVED`);
      } catch (err) {
        this.logger.error(`Failed to auto-close case ${c.case_number}: ${(err as Error).message}`);
      }
    }

    return closedCount;
  }

  /**
   * Change case priority with audit logging.
   */
  async changePriority(
    caseId: string,
    newPriority: string,
    source: 'SENDER_DOMAIN_RULE' | 'AI_CLASSIFICATION' | 'MANUAL' | string,
    reason: string,
    performedBy: string = 'system',
  ): Promise<void> {
    const dbCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!dbCase) throw new Error(`Case not found: ${caseId}`);

    const oldPriority = dbCase.priority;
    if (oldPriority === newPriority) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id: caseId },
        data: { priority: newPriority },
      });

      await tx.caseActivityLog.create({
        data: {
          case_id: caseId,
          action_code: 'PRIORITY_CHANGED',
          actor_type: performedBy === 'system' ? 'SYSTEM' : 'USER',
          actor_id: performedBy !== 'system' ? performedBy : undefined,
          payload_json: {
            details: `Priority changed from ${oldPriority} to ${newPriority}: ${reason}`,
            from: oldPriority,
            to: newPriority,
            reason,
            source,
          },
        },
      });
    });

    this.logger.log(`Priority changed for case ${caseId}: ${oldPriority} -> ${newPriority} (source: ${source})`);
  }

  /**
   * Link two cases together.
   */
  async linkCases(caseId: string, linkedCaseId: string, performedBy: string): Promise<void> {
    const [caseA, caseB] = await Promise.all([
      this.prisma.case.findUnique({ where: { id: caseId } }),
      this.prisma.case.findUnique({ where: { id: linkedCaseId } }),
    ]);

    if (!caseA || !caseB) {
      throw new Error(`Case not found: ${!caseA ? caseId : linkedCaseId}`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Create bidirectional links (upsert to avoid duplicates)
      await tx.caseLink.create({
        data: {
          case_from_id: caseId,
          case_to_id: linkedCaseId,
          link_type: 'RELATED',
          created_by: performedBy !== 'system' ? performedBy : undefined,
        },
      }).catch((err) => { if (err?.code !== 'P2002') throw err; });

      await tx.caseLink.create({
        data: {
          case_from_id: linkedCaseId,
          case_to_id: caseId,
          link_type: 'RELATED',
          created_by: performedBy !== 'system' ? performedBy : undefined,
        },
      }).catch((err) => { if (err?.code !== 'P2002') throw err; });

      await tx.caseActivityLog.create({
        data: {
          case_id: caseId,
          action_code: 'LINKED',
          actor_type: 'USER',
          actor_id: performedBy !== 'system' ? performedBy : undefined,
          payload_json: {
            details: `Linked to ${caseB.case_number}`,
            accountable_officer_id: performedBy !== 'system' ? performedBy : null,
          },
        },
      });

      await tx.caseActivityLog.create({
        data: {
          case_id: linkedCaseId,
          action_code: 'LINKED',
          actor_type: 'USER',
          actor_id: performedBy !== 'system' ? performedBy : undefined,
          payload_json: {
            details: `Linked to ${caseA.case_number}`,
            accountable_officer_id: performedBy !== 'system' ? performedBy : null,
          },
        },
      });

      // FR-034 A3: Propagate thread_id — all linked cases share primary case's thread_id
      const primaryCase = caseA;
      if (primaryCase.thread_id) {
        const linkedCaseIds = [linkedCaseId];
        await tx.case.updateMany({
          where: { id: { in: linkedCaseIds } },
          data: { thread_id: primaryCase.thread_id },
        });
        this.logger.debug(
          `Propagated thread_id ${primaryCase.thread_id} to linked case ${linkedCaseId}`,
        );
      }
    });
  }

  /**
   * Get case by ID.
   */
  async findById(id: string): Promise<CaseRecord | undefined> {
    const c = await this.prisma.case.findUnique({
      where: { id },
      include: {
        activity_logs: { orderBy: { created_at: 'asc' } },
        linked_cases_from: true,
      },
    });

    return c ? this.mapToRecord(c) : undefined;
  }

  /**
   * Get case by case number.
   */
  async findByCaseNumber(caseNumber: string): Promise<CaseRecord | undefined> {
    const c = await this.prisma.case.findUnique({
      where: { case_number: caseNumber },
      include: {
        activity_logs: { orderBy: { created_at: 'asc' } },
        linked_cases_from: true,
      },
    });

    return c ? this.mapToRecord(c) : undefined;
  }

  /**
   * Get all cases (with optional filters and pagination).
   */
  async findAll(filters?: { status?: CaseStatus; assignedFprId?: string; caseType?: string; page?: number; limit?: number }): Promise<{ data: CaseRecord[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.assignedFprId) where.assigned_fpr_id = filters.assignedFprId;
    if (filters?.caseType) where.case_type = filters.caseType;

    const [cases, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        include: {
          activity_logs: { orderBy: { created_at: 'asc' } },
          linked_cases_from: true,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      data: cases.map((c) => this.mapToRecord(c)),
      total,
      page,
      limit,
    };
  }

  /**
   * Generate case number in format ATL-YYYY-NNNNNN.
   */
  private async generateCaseNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ATL-${year}-`;

    // Get the max sequence from existing cases this year
    const lastCase = await this.prisma.case.findFirst({
      where: { case_number: { startsWith: prefix } },
      orderBy: { case_number: 'desc' },
      select: { case_number: true },
    });

    let seq = 1;
    if (lastCase) {
      const lastSeq = parseInt(lastCase.case_number.split('-')[2], 10);
      seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(6, '0')}`;
  }

  private async getTatConfig(): Promise<Record<string, number>> {
    if (this.tatConfigCache && Date.now() - this.tatConfigCache.loadedAt < this.CACHE_TTL_MS) {
      return this.tatConfigCache.data;
    }

    const tats = await this.prisma.tatMaster.findMany({
      where: { is_active: true },
    });

    const config: Record<string, number> = {};
    for (const t of tats) {
      // Use the first match per case_type (simplification)
      if (!config[t.case_type]) {
        config[t.case_type] = t.target_hours_business;
      }
    }

    // Fallback defaults
    if (Object.keys(config).length === 0) {
      Object.assign(config, {
        VALUATION_REQUEST: 48,
        LEGAL_OPINION: 72,
        TITLE_SEARCH: 48,
        INSURANCE_RENEWAL: 24,
        RELEASE_OF_COLLATERAL: 96,
        SITE_VISIT: 48,
        DOCUMENT_COLLECTION: 24,
        GENERAL_INQUIRY: 8,
      });
    }

    this.tatConfigCache = { data: config, loadedAt: Date.now() };
    return config;
  }

  private async getBusinessHours(): Promise<BusinessHoursConfig[]> {
    if (this.businessHoursCache && Date.now() - this.businessHoursCache.loadedAt < this.CACHE_TTL_MS) {
      return this.businessHoursCache.data;
    }

    const hours = await this.prisma.businessHoursMaster.findMany({
      where: { is_active: true },
    });

    const data = hours.length > 0
      ? hours.map((h) => ({
          day_of_week: h.day_of_week,
          open_time: h.open_time,
          close_time: h.close_time,
          is_working: h.is_working,
        }))
      : DEFAULT_BUSINESS_HOURS;

    this.businessHoursCache = { data, loadedAt: Date.now() };
    return data;
  }

  private async getHolidays(): Promise<Holiday[]> {
    if (this.holidaysCache && Date.now() - this.holidaysCache.loadedAt < this.CACHE_TTL_MS) {
      return this.holidaysCache.data;
    }

    const holidays = await this.prisma.holidayCalendarMaster.findMany({
      where: { is_active: true },
    });

    const data = holidays.map((h) => ({
      date: h.date.toISOString().slice(0, 10),
      name: h.name,
    }));

    this.holidaysCache = { data, loadedAt: Date.now() };
    return data;
  }

  /**
   * FR-034 A2: Merge up to 10 secondary cases into a primary case.
   * Links each secondary to the primary and closes them with resolution_code=MERGED.
   */
  async mergeCases(primaryCaseId: string, secondaryCaseIds: string[], performedBy: string): Promise<{ merged: string[]; errors: { caseId: string; error: string }[] }> {
    if (secondaryCaseIds.length > 10) {
      throw new BadRequestException('Cannot merge more than 10 cases at once.');
    }
    if (secondaryCaseIds.length === 0) {
      throw new BadRequestException('At least one secondary case ID is required.');
    }

    const primaryCase = await this.prisma.case.findUnique({ where: { id: primaryCaseId } });
    if (!primaryCase) {
      throw new BadRequestException(`Primary case not found: ${primaryCaseId}`);
    }

    const merged: string[] = [];
    const errors: { caseId: string; error: string }[] = [];

    for (const secondaryId of secondaryCaseIds) {
      try {
        const secondaryCase = await this.prisma.case.findUnique({ where: { id: secondaryId } });
        if (!secondaryCase) {
          errors.push({ caseId: secondaryId, error: 'Case not found' });
          continue;
        }

        // Link secondary to primary (reuse linkCases pattern)
        await this.linkCases(primaryCaseId, secondaryId, performedBy);

        // Close the secondary with resolution_code=MERGED
        await this.prisma.$transaction(async (tx) => {
          await tx.case.update({
            where: { id: secondaryId },
            data: {
              status: CaseStatus.CLOSED,
              resolution_code: 'MERGED',
              closed_at: new Date(),
              // Propagate thread_id from primary
              ...(primaryCase.thread_id ? { thread_id: primaryCase.thread_id } : {}),
            },
          });

          await tx.caseActivityLog.create({
            data: {
              case_id: secondaryId,
              action_code: 'STATUS_CHANGE',
              actor_type: performedBy === 'system' ? 'SYSTEM' : 'USER',
              actor_id: performedBy !== 'system' ? performedBy : undefined,
              payload_json: {
                details: `Merged into case ${primaryCase.case_number}`,
                fromStatus: secondaryCase.status,
                toStatus: CaseStatus.CLOSED,
                resolution_code: 'MERGED',
                primary_case_id: primaryCaseId,
              },
            },
          });
        });

        merged.push(secondaryId);
      } catch (err) {
        errors.push({ caseId: secondaryId, error: (err as Error).message });
      }
    }

    return { merged, errors };
  }

  /**
   * FR-056 A3: Create a follow-up case pre-linked to a closed case.
   * Used when the 60-day reopen window is exceeded.
   */
  async createFollowUp(closedCaseId: string, performedBy: string = 'system'): Promise<CaseRecord> {
    const closedCase = await this.prisma.case.findUnique({ where: { id: closedCaseId } });
    if (!closedCase) {
      throw new BadRequestException(`Closed case not found: ${closedCaseId}`);
    }

    // Create a new case with the same metadata as the closed case
    const newCase = await this.createCase({
      emailIngestId: closedCase.email_ingest_id || `follow-up-${closedCaseId}`,
      subject: `Follow-up: ${closedCase.ai_summary || closedCase.case_number}`,
      from: '',
      classification: {
        caseType: closedCase.case_type,
        confidenceBand: closedCase.confidence_band || 'GREEN',
        priority: closedCase.priority,
        loanAccountNo: closedCase.loan_account_no || undefined,
        customerName: closedCase.customer_name || undefined,
        propertyCity: closedCase.property_city || undefined,
        propertyPin: closedCase.property_pin || undefined,
        languageDetected: 'en',
      },
    });

    // Link the new case to the closed case
    await this.linkCases(newCase.id, closedCaseId, performedBy);

    return newCase;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToRecord(c: any): CaseRecord {
    return {
      id: c.id,
      caseNumber: c.case_number,
      emailIngestId: c.email_ingest_id ?? '',
      subject: c.ai_summary ?? '',
      from: '',
      status: c.status as CaseStatus,
      caseType: c.case_type,
      priority: c.priority,
      confidenceBand: c.confidence_band ?? 'GREEN',
      languageDetected: '',
      assignedFprId: c.assigned_fpr_id ?? undefined,
      assignedFprName: undefined,
      assignedVendorId: c.assigned_vendor_id ?? undefined,
      loanAccountNo: c.loan_account_no ?? undefined,
      customerName: c.customer_name ?? undefined,
      propertyCity: c.property_city ?? undefined,
      propertyPin: c.property_pin ?? undefined,
      tatTargetAt: c.tat_target_at ?? undefined,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      closedAt: c.closed_at ?? undefined,
      activityLog: (c.activity_logs ?? []).map((a: { id: string; created_at: Date; action_code: string; actor_id: string | null; payload_json: Record<string, unknown> | null }) => ({
        id: a.id,
        timestamp: a.created_at,
        action: a.action_code,
        performedBy: a.actor_id ?? 'system',
        details: (a.payload_json as Record<string, unknown>)?.details as string | undefined,
        fromStatus: (a.payload_json as Record<string, unknown>)?.fromStatus as CaseStatus | undefined,
        toStatus: (a.payload_json as Record<string, unknown>)?.toStatus as CaseStatus | undefined,
      })),
      linkedCaseIds: (c.linked_cases_from ?? []).map((l: { case_to_id: string }) => l.case_to_id),
    };
  }
}
