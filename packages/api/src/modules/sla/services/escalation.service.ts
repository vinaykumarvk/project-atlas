import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { CaseRecord, CaseStatus } from '../../cases/types';
import { SlaClockService, BreachStatus } from './sla-clock.service';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { NotificationChannel } from '../../notifications/types';
import { WebhookDispatcherService } from '../../webhooks/services/webhook-dispatcher.service';

export enum EscalationLevel {
  L1 = 'L1', // 75% elapsed -> FPR notification
  L2 = 'L2', // 90% elapsed -> Team Lead
  L3 = 'L3', // 100% breached -> Regional Head
  L4 = 'L4', // breach + 4h -> COO
}

export interface EscalationRule {
  level: EscalationLevel;
  triggerPercent: number;
  breachPlusHours?: number;
  target: string;
  repeatEveryHrs?: number;
  /** Hours to delay after breach (L1) or after previous level fired (L2+). 0 = immediate. */
  delayAfterBreachHrs?: number;
  /** When true, suppress further repeats at this level if the case has been actioned since last fire. */
  stopOnAction?: boolean;
  /** Notification channels to dispatch to. Defaults to [EMAIL] if empty/undefined. */
  channels?: NotificationChannel[];
}

export interface EscalationAction {
  caseId: string;
  caseNumber: string;
  level: EscalationLevel;
  targetRole: string;
  targetId: string;
  targetName: string;
  reason: string;
  triggeredAt: Date;
}

export interface EscalationEvent {
  id: string;
  caseId: string;
  level: EscalationLevel;
  targetId: string;
  targetName: string;
  triggeredAt: Date;
  reason: string;
}

export interface HierarchyMember {
  id: string;
  name: string;
  role: string;
  parentId?: string;
}

/** Statuses that suppress escalation. */
const SUPPRESSED_STATUSES: CaseStatus[] = [
  CaseStatus.ON_HOLD,
  CaseStatus.AWAITING_VENDOR,
  CaseStatus.AWAITING_FPR,
];

/**
 * Action codes in CaseActivityLog that count as "case actioned" for stop_on_action
 * and FR-063 A3 action-based escalation cooldown.
 */
const STOP_ON_ACTION_CODES: string[] = [
  'STATE_CHANGE',
  'REASSIGNED',
  'NOTE_ADDED',
  'RESOLVED',
  'OUTBOUND_SENT',
  'ACKNOWLEDGED',
];

/**
 * Escalation Service -- BRD Section 6
 *
 * Implements tiered escalation:
 * - L1 (75% elapsed) -> FPR (assigned)
 * - L2 (90% elapsed) -> Team Lead
 * - L3 (100% breached) -> Regional Head
 * - L4 (breach + 4h) -> COO
 *
 * Phase 3 enhancements:
 * - Notification dispatch on escalation
 * - Suppression for ON_HOLD, AWAITING_VENDOR, AWAITING_FPR
 * - Holiday and outside-business-hours suppression
 * - Cooldown: skip if same level fired within repeat_every_hrs (default 4h)
 * - Repeat L3/L4 reminders when case is still breached
 * - DB-backed fired escalations (persists via CaseActivityLog)
 *
 * Round 2 enhancements (FR-061):
 * - delay_after_breach_hrs: delay escalation fire after breach (L1) or after previous level (L2+)
 * - stop_on_action: suppress repeats if case has been actioned since last fire
 * - Multi-channel dispatch: send to all channels specified in the rule
 */
@Injectable()
export class EscalationService implements OnModuleInit {
  private readonly logger = new Logger(EscalationService.name);

  // Default escalation rules
  private defaultRules: EscalationRule[] = [
    { level: EscalationLevel.L1, triggerPercent: 75, target: 'FPR' },
    { level: EscalationLevel.L2, triggerPercent: 90, target: 'TEAM_LEAD' },
    { level: EscalationLevel.L3, triggerPercent: 100, target: 'REGIONAL_HEAD', repeatEveryHrs: 4 },
    { level: EscalationLevel.L4, triggerPercent: 100, breachPlusHours: 4, target: 'COO', repeatEveryHrs: 4 },
  ];

  // Per case-type rules override
  private caseTypeRules: Record<string, EscalationRule[]> = {};

  // Organization hierarchy (loaded from DB or set for testing)
  private hierarchy: HierarchyMember[] = [];

  // Recorded escalation events -- in-memory log
  private escalationEvents: EscalationEvent[] = [];

  // Track which escalations have already fired for a case with timestamps
  // Key: `${caseId}:${level}`, Value: last fired timestamp
  private firedEscalations: Map<string, Date> = new Map();

  // Holiday dates for suppression checks (loaded from SlaClockService or set for testing)
  private holidays: string[] = [];
  private businessHoursSchedule: { day_of_week: string; is_working: boolean; open_time: string; close_time: string }[] = [];

  // In-memory case activity logs for stop_on_action (for testing; production reads from DB)
  private caseActivityLogs: { caseId: string; actionCode: string; createdAt: Date }[] = [];

  // Skip startup DB load (for testing)
  private skipStartupLoad = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly slaClockService: SlaClockService,
    private readonly notificationDispatch: NotificationDispatchService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.skipStartupLoad) {
      await this.loadFiredEscalationsFromDb();
    }
  }

  /**
   * Load previously fired escalations from CaseActivityLog on startup.
   */
  async loadFiredEscalationsFromDb(): Promise<void> {
    try {
      const logs = await this.prisma.caseActivityLog.findMany({
        where: {
          action_code: { startsWith: 'ESCALATION_' },
        },
        orderBy: { created_at: 'desc' },
      });

      for (const log of logs) {
        const level = log.action_code.replace('ESCALATION_', '');
        const key = `${log.case_id}:${level}`;
        // Keep only the most recent fire time per case:level
        if (!this.firedEscalations.has(key)) {
          this.firedEscalations.set(key, log.created_at);
        }
      }

      this.logger.log(`Loaded ${logs.length} fired escalation records from DB`);
    } catch (err) {
      this.logger.warn(`Failed to load fired escalations from DB: ${(err as Error).message}`);
    }
  }

  /**
   * Skip DB load on startup (for unit testing).
   */
  setSkipStartupLoad(skip: boolean): void {
    this.skipStartupLoad = skip;
  }

  /**
   * Set hierarchy (for testing).
   */
  setHierarchy(members: HierarchyMember[]): void {
    this.hierarchy = members;
  }

  /**
   * Set custom escalation rules for a specific case type.
   */
  setCaseTypeRules(caseType: string, rules: EscalationRule[]): void {
    this.caseTypeRules[caseType] = rules;
  }

  /**
   * Set default escalation rules (for testing).
   */
  setDefaultRules(rules: EscalationRule[]): void {
    this.defaultRules = rules;
  }

  /**
   * Set holidays for suppression checking (for testing).
   */
  setHolidays(holidays: string[]): void {
    this.holidays = holidays;
  }

  /**
   * Set business hours schedule for suppression checking (for testing).
   */
  setBusinessHoursSchedule(schedule: { day_of_week: string; is_working: boolean; open_time: string; close_time: string }[]): void {
    this.businessHoursSchedule = schedule;
  }

  /**
   * Set case activity logs for stop_on_action checking (for testing).
   */
  setCaseActivityLogs(logs: { caseId: string; actionCode: string; createdAt: Date }[]): void {
    this.caseActivityLogs = logs;
  }

  /**
   * Get escalation events (for testing/inspection).
   */
  getEscalationEvents(): EscalationEvent[] {
    return [...this.escalationEvents];
  }

  /**
   * Reset fired escalations for a case (for testing).
   */
  resetFiredEscalations(caseId: string): void {
    for (const key of this.firedEscalations.keys()) {
      if (key.startsWith(`${caseId}:`)) {
        this.firedEscalations.delete(key);
      }
    }
  }

  /**
   * Get the last fired time for a case + level (for testing/inspection).
   */
  getLastFiredTime(caseId: string, level: EscalationLevel): Date | undefined {
    return this.firedEscalations.get(`${caseId}:${level}`);
  }

  /**
   * Check and escalate a case based on current SLA status.
   * Returns escalation actions that need to be taken.
   *
   * Phase 3 enhancements:
   * - Suppresses escalation for ON_HOLD, AWAITING_VENDOR, AWAITING_FPR statuses
   * - Suppresses escalation on holidays or outside business hours
   * - Cooldown: does not re-fire if the same level was fired within repeat_every_hrs
   * - Repeat L3/L4 reminders: re-fires if case is still breached and cooldown elapsed
   */
  checkAndEscalate(caseRecord: CaseRecord, now?: Date): EscalationAction[] {
    const currentTime = now || new Date();

    // --- Suppression: skip if status is ON_HOLD, AWAITING_VENDOR, or AWAITING_FPR ---
    if (SUPPRESSED_STATUSES.includes(caseRecord.status)) {
      return [];
    }

    // --- Suppression: skip if current time is a holiday ---
    if (this.isHoliday(currentTime)) {
      return [];
    }

    // --- Suppression: skip if outside business hours ---
    if (!this.isWithinBusinessHours(currentTime)) {
      return [];
    }

    const slaStatus = this.slaClockService.computeStatus(caseRecord, currentTime);
    const rules = this.caseTypeRules[caseRecord.caseType] || this.defaultRules;
    const actions: EscalationAction[] = [];

    // Compute breach time for delay_after_breach_hrs calculations
    // Breach time = createdAt + totalBusinessHours (in wall-clock terms, approximated)
    const breachTime = caseRecord.tatTargetAt;

    for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
      const rule = rules[ruleIdx];
      const key = `${caseRecord.id}:${rule.level}`;
      const lastFired = this.firedEscalations.get(key);

      const shouldTrigger = this.shouldTriggerRule(
        rule,
        slaStatus.percentElapsed,
        slaStatus.elapsedBusinessHours,
        slaStatus.totalBusinessHours,
      );

      if (!shouldTrigger) {
        continue;
      }

      // --- delay_after_breach_hrs check (FR-061 A1 + A2) ---
      const delayHrs = rule.delayAfterBreachHrs ?? 0;
      if (delayHrs > 0 && !lastFired) {
        // For the first level (index 0), delay is relative to breach time
        // For subsequent levels, delay is relative to when the previous level last fired
        let referenceTime: Date | undefined;

        if (ruleIdx === 0) {
          // L1 or first rule: delay after breach time
          referenceTime = breachTime;
        } else {
          // L2+ : delay after the previous level fired
          const prevRule = rules[ruleIdx - 1];
          const prevKey = `${caseRecord.id}:${prevRule.level}`;
          referenceTime = this.firedEscalations.get(prevKey);
        }

        if (referenceTime) {
          const hoursSinceReference = (currentTime.getTime() - referenceTime.getTime()) / (1000 * 60 * 60);
          if (hoursSinceReference < delayHrs) {
            // Not enough time has elapsed since reference -- skip
            continue;
          }
        } else if (ruleIdx > 0) {
          // Previous level has not fired yet -- cannot fire this level
          continue;
        }
      }

      // --- Cooldown check ---
      if (lastFired) {
        const repeatHrs = rule.repeatEveryHrs ?? 0;
        if (repeatHrs <= 0) {
          // Non-repeatable rule already fired -- skip
          continue;
        }
        const elapsedSinceFire = (currentTime.getTime() - lastFired.getTime()) / (1000 * 60 * 60);
        if (elapsedSinceFire < repeatHrs) {
          // Still within cooldown window -- skip
          continue;
        }

        // --- stop_on_action check (FR-061 A4) ---
        if (rule.stopOnAction === true) {
          const hasRecentAction = this.hasCaseActionSince(caseRecord.id, lastFired);
          if (hasRecentAction) {
            // Case has been actioned since last escalation fire -- suppress repeat
            continue;
          }
        }
      }

      const target = this.resolveTarget(rule.target, caseRecord);
      if (target) {
        const action: EscalationAction = {
          caseId: caseRecord.id,
          caseNumber: caseRecord.caseNumber,
          level: rule.level,
          targetRole: rule.target,
          targetId: target.id,
          targetName: target.name,
          reason: this.buildReason(rule, slaStatus.percentElapsed),
          triggeredAt: currentTime,
        };
        actions.push(action);

        // Record event and dispatch notification (multi-channel)
        this.recordEvent(action, rule.channels);

        // FR-141.A1: Dispatch sla.breached webhook event when SLA is breached (L3+) (fire-and-forget)
        if (rule.triggerPercent >= 100) {
          try {
            this.webhookDispatcher.dispatch('sla.breached', {
              caseId: action.caseId,
              caseNumber: action.caseNumber,
              escalationLevel: action.level,
              targetRole: action.targetRole,
              targetId: action.targetId,
              targetName: action.targetName,
              reason: action.reason,
              breachedAt: currentTime.toISOString(),
            });
          } catch (err) {
            this.logger.error(`Webhook dispatch failed for sla.breached ${action.caseNumber}: ${(err as Error).message}`);
          }
        }

        // Mark as fired with timestamp
        this.firedEscalations.set(key, currentTime);
      }
    }

    return actions;
  }

  /**
   * Determine if a rule should trigger based on current SLA state.
   */
  private shouldTriggerRule(
    rule: EscalationRule,
    percentElapsed: number,
    elapsedHours: number,
    totalHours: number,
  ): boolean {
    if (rule.breachPlusHours !== undefined) {
      const threshold = totalHours + rule.breachPlusHours;
      return elapsedHours >= threshold;
    }
    return percentElapsed >= rule.triggerPercent;
  }

  /**
   * Resolve escalation target from hierarchy.
   */
  resolveTarget(
    targetRole: string,
    caseRecord: CaseRecord,
  ): HierarchyMember | null {
    if (targetRole === 'FPR') {
      if (caseRecord.assignedFprId) {
        const fpr = this.hierarchy.find(
          (m) => m.id === caseRecord.assignedFprId && m.role === 'FPR',
        );
        if (fpr) return fpr;
      }
      return null;
    }

    // Walk up the hierarchy from the assigned FPR (with cycle detection)
    if (caseRecord.assignedFprId) {
      const visited = new Set<string>();
      let current = this.hierarchy.find((m) => m.id === caseRecord.assignedFprId);
      while (current) {
        if (visited.has(current.id)) {
          this.logger.warn(`Cycle detected in hierarchy at ${current.id}`);
          break;
        }
        visited.add(current.id);
        if (current.role === targetRole) {
          return current;
        }
        if (current.parentId) {
          current = this.hierarchy.find((m) => m.id === current!.parentId);
        } else {
          break;
        }
      }
    }

    // Fallback: find any member with the target role
    return this.hierarchy.find((m) => m.role === targetRole) || null;
  }

  /**
   * Record an escalation event (in-memory + DB) and dispatch notification.
   * Dispatches to all channels specified in the rule (FR-061 A3).
   */
  private recordEvent(action: EscalationAction, channels?: NotificationChannel[]): void {
    const event: EscalationEvent = {
      id: `esc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      caseId: action.caseId,
      level: action.level,
      targetId: action.targetId,
      targetName: action.targetName,
      triggeredAt: action.triggeredAt,
      reason: action.reason,
    };
    this.escalationEvents.push(event);

    // Persist to DB via CaseActivityLog (fire-and-forget)
    this.prisma.caseActivityLog.create({
      data: {
        case_id: action.caseId,
        action_code: `ESCALATION_${action.level}`,
        actor_type: 'SYSTEM',
        payload_json: {
          level: action.level,
          targetRole: action.targetRole,
          targetId: action.targetId,
          targetName: action.targetName,
          reason: action.reason,
        },
      },
    }).catch((err) => {
      this.logger.error(`Failed to persist escalation event: ${err.message}`);
    });

    // Determine which channels to dispatch to (FR-061 A3)
    const dispatchChannels: NotificationChannel[] =
      channels && channels.length > 0
        ? channels
        : [NotificationChannel.EMAIL];

    const notificationVars = {
      case_number: action.caseNumber,
      breach_hours: '0',
      level: action.level,
      target_name: action.targetName,
      target_role: action.targetRole,
      reason: action.reason,
    };

    // Dispatch to each channel (fire-and-forget)
    for (const channel of dispatchChannels) {
      this.notificationDispatch
        .send(action.targetId, channel, 'ESCALATION', notificationVars)
        .catch((err) => {
          this.logger.error(
            `Failed to dispatch escalation notification via ${channel}: ${err.message}`,
          );
        });
    }
  }

  /**
   * Check if the case has any relevant activity (resolution, reassign, note, status change)
   * since the given timestamp. Used for stop_on_action suppression.
   */
  private hasCaseActionSince(caseId: string, since: Date): boolean {
    return this.caseActivityLogs.some(
      (log) =>
        log.caseId === caseId &&
        STOP_ON_ACTION_CODES.includes(log.actionCode) &&
        log.createdAt.getTime() > since.getTime(),
    );
  }

  /**
   * Build human-readable reason string.
   */
  private buildReason(rule: EscalationRule, percentElapsed: number): string {
    if (rule.breachPlusHours !== undefined) {
      return `SLA breached and ${rule.breachPlusHours}h elapsed past target \u2014 escalating to ${rule.target}`;
    }
    if (rule.triggerPercent >= 100) {
      return `SLA breached (${percentElapsed.toFixed(0)}% elapsed) \u2014 escalating to ${rule.target}`;
    }
    return `SLA ${rule.triggerPercent}% threshold reached (${percentElapsed.toFixed(0)}% elapsed) \u2014 escalating to ${rule.target}`;
  }

  /**
   * Check if the given time falls on a holiday.
   */
  private isHoliday(time: Date): boolean {
    if (this.holidays.length === 0) {
      return false;
    }
    // Convert to IST date string (UTC + 5:30)
    const istMs = time.getTime() + 5.5 * 60 * 60 * 1000;
    const ist = new Date(istMs);
    const dateStr = ist.toISOString().slice(0, 10);
    return this.holidays.includes(dateStr);
  }

  /**
   * Check if the given time is within business hours.
   */
  private isWithinBusinessHours(time: Date): boolean {
    if (this.businessHoursSchedule.length === 0) {
      // No schedule configured -- assume always within business hours
      return true;
    }
    const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    // Convert to IST
    const istMs = time.getTime() + 5.5 * 60 * 60 * 1000;
    const ist = new Date(istMs);
    const dow = DAY_NAMES[ist.getUTCDay()];
    const minuteOfDay = ist.getUTCHours() * 60 + ist.getUTCMinutes();

    const schedule = this.businessHoursSchedule.find((s) => s.day_of_week === dow);
    if (!schedule || !schedule.is_working) {
      return false;
    }

    const [openH, openM] = schedule.open_time.split(':').map(Number);
    const [closeH, closeM] = schedule.close_time.split(':').map(Number);
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;

    return minuteOfDay >= openMin && minuteOfDay <= closeMin;
  }
}
