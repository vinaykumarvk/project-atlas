import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

/**
 * Represents a suggested next action for a case.
 * FR-052.A2: Includes template, recipient, and TAT impact fields.
 */
export interface NextAction {
  id: string;
  action: string;
  description: string;
  confidence: number;
  source: 'RULE' | 'LLM';
  metadata?: Record<string, unknown>;
  /** FR-052.A2: The notification template code that would be used for this action. */
  templateCode?: string;
  /** FR-052.A2: The role/person who would receive the action outcome. */
  recipientRole?: string;
  /** FR-052.A2: Estimated TAT impact in hours if this action is taken. */
  estimatedTatImpactHours?: number;
  /** FR-016.A4: Whether this action requires user confirmation before executing (e.g., free-text input). */
  requiresConfirmation?: boolean;
}

/**
 * Input data shape for action suggestion.
 */
export interface CaseActionInput {
  status: string;
  case_type: string;
  priority: string;
  entities?: any[];
  daysOpen?: number;
}

/**
 * FR-052.A1: Next Action Service.
 * Suggests next actions for a case based on rule-based logic.
 * Collects feedback on accepted/rejected suggestions for continuous improvement.
 */
@Injectable()
export class NextActionService {
  private readonly logger = new Logger(NextActionService.name);
  private readonly rules: Array<{
    condition: (caseData: CaseActionInput) => boolean;
    action: Omit<NextAction, 'id'>;
  }> = [];
  private readonly feedbackLog = new Map<
    string,
    { accepted: number; rejected: number }
  >();

  constructor() {
    this.registerDefaultRules();
  }

  /**
   * Suggest next actions for a case based on its current state.
   * Returns actions sorted by confidence (descending).
   */
  suggest(caseData: CaseActionInput): NextAction[] {
    const actions: NextAction[] = [];

    for (const rule of this.rules) {
      if (rule.condition(caseData)) {
        actions.push({
          id: uuidv4(),
          ...rule.action,
        });
      }
    }

    // Sort by confidence descending
    actions.sort((a, b) => b.confidence - a.confidence);

    this.logger.debug(
      `Suggested ${actions.length} actions for case with status=${caseData.status}, type=${caseData.case_type}`,
    );

    return actions;
  }

  /**
   * Record feedback for a suggested action.
   */
  recordFeedback(actionId: string, accepted: boolean): void {
    const existing = this.feedbackLog.get(actionId) || {
      accepted: 0,
      rejected: 0,
    };
    if (accepted) {
      existing.accepted++;
    } else {
      existing.rejected++;
    }
    this.feedbackLog.set(actionId, existing);
    this.logger.debug(
      `Feedback recorded for action ${actionId}: ${accepted ? 'ACCEPTED' : 'REJECTED'}`,
    );
  }

  /**
   * Get aggregated feedback statistics for all actions.
   */
  getFeedbackStats(): Record<string, { accepted: number; rejected: number }> {
    const stats: Record<string, { accepted: number; rejected: number }> = {};
    for (const [actionId, feedback] of this.feedbackLog.entries()) {
      stats[actionId] = { ...feedback };
    }
    return stats;
  }

  /**
   * Register the default rule set for next action suggestions.
   */
  private registerDefaultRules(): void {
    // Rule 1: If status is NEW, suggest CLASSIFY
    this.rules.push({
      condition: (caseData) => caseData.status === 'NEW',
      action: {
        action: 'CLASSIFY',
        description:
          'Run the AI classification pipeline to categorise this case.',
        confidence: 0.95,
        source: 'RULE',
        metadata: { trigger: 'status_new' },
        templateCode: 'CASE_CLASSIFIED',
        recipientRole: 'COLLATERAL_OFFICER',
        estimatedTatImpactHours: 0.5,
      },
    });

    // Rule 2: If status is CLASSIFIED, suggest ROUTE
    this.rules.push({
      condition: (caseData) => caseData.status === 'CLASSIFIED',
      action: {
        action: 'ROUTE',
        description:
          'Route this case to the appropriate team or FPR based on classification.',
        confidence: 0.9,
        source: 'RULE',
        metadata: { trigger: 'status_classified' },
        templateCode: 'CASE_ROUTED',
        recipientRole: 'FPR',
        estimatedTatImpactHours: 1,
      },
    });

    // Rule 3: If status is IN_PROGRESS and daysOpen > 5, suggest ESCALATE
    this.rules.push({
      condition: (caseData) =>
        caseData.status === 'IN_PROGRESS' &&
        (caseData.daysOpen ?? 0) > 5,
      action: {
        action: 'ESCALATE',
        description:
          'This case has been open for more than 5 days. Consider escalating.',
        confidence: 0.8,
        source: 'RULE',
        metadata: { trigger: 'overdue' },
        templateCode: 'CASE_ESCALATED',
        recipientRole: 'FPR_SUPERVISOR',
        estimatedTatImpactHours: 4,
      },
    });

    // Rule 4: If priority is P1, suggest PRIORITISE
    this.rules.push({
      condition: (caseData) => caseData.priority === 'P1',
      action: {
        action: 'PRIORITISE',
        description:
          'This is a P1 case. Ensure it receives immediate attention.',
        confidence: 0.85,
        source: 'RULE',
        metadata: { trigger: 'priority_p1' },
        templateCode: 'CASE_PRIORITY_ALERT',
        recipientRole: 'COLLATERAL_LEAD',
        estimatedTatImpactHours: 2,
      },
    });

    // Rule 5: If status is PENDING_INFO, suggest FOLLOW_UP
    this.rules.push({
      condition: (caseData) => caseData.status === 'PENDING_INFO',
      action: {
        action: 'FOLLOW_UP',
        description:
          'This case is pending information. Send a follow-up request.',
        confidence: 0.85,
        source: 'RULE',
        metadata: { trigger: 'pending_info' },
        templateCode: 'FOLLOW_UP_REQUEST',
        recipientRole: 'CUSTOMER',
        estimatedTatImpactHours: 24,
      },
    });

    // Rule 6: If status is PENDING_VENDOR, suggest CHECK_VENDOR
    this.rules.push({
      condition: (caseData) => caseData.status === 'PENDING_VENDOR',
      action: {
        action: 'CHECK_VENDOR',
        description:
          'This case is waiting on a vendor. Check vendor progress.',
        confidence: 0.8,
        source: 'RULE',
        metadata: { trigger: 'pending_vendor' },
        templateCode: 'VENDOR_FOLLOW_UP',
        recipientRole: 'VENDOR',
        estimatedTatImpactHours: 48,
      },
    });

    // Rule 7: If case has no entities, suggest REVIEW_ENTITIES
    this.rules.push({
      condition: (caseData) =>
        !caseData.entities || caseData.entities.length === 0,
      action: {
        action: 'REVIEW_ENTITIES',
        description:
          'No entities were extracted. Manually review the case for missing data.',
        confidence: 0.7,
        source: 'RULE',
        metadata: { trigger: 'no_entities' },
        recipientRole: 'COLLATERAL_OFFICER',
        estimatedTatImpactHours: 1,
      },
    });
  }
}
