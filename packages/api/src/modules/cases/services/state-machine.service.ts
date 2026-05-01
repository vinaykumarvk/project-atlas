import { Injectable, BadRequestException } from '@nestjs/common';
import { CaseStatus, VALID_TRANSITIONS, REOPEN_WINDOW_DAYS } from '../types';

/**
 * Options for transition validation that require additional context.
 */
export interface TransitionContext {
  /** When the case was closed (required for CLOSED -> REOPENED). */
  closedAt?: Date;
  /** Resolution code (required when transitioning to RESOLVED or CLOSED). */
  resolution_code?: string;
  /** Resolution summary (required when transitioning to RESOLVED or CLOSED). */
  resolution_summary?: string;
  /** The case ID (for follow-up suggestion on reopen failure). */
  caseId?: string;
}

/**
 * Case state machine (FR-030).
 * Enforces valid state transitions for case lifecycle.
 */
@Injectable()
export class StateMachineService {
  /**
   * Validate and return the target status if the transition is allowed.
   * Throws BadRequestException on invalid transition.
   */
  validateTransition(
    currentStatus: CaseStatus,
    targetStatus: CaseStatus,
    context?: TransitionContext,
  ): void {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid state transition: ${currentStatus} → ${targetStatus}. Allowed: [${(allowed || []).join(', ')}]`,
      );
    }

    // Enforce closure requirements: RESOLVED and CLOSED require resolution_code + resolution_summary
    if (
      (targetStatus === CaseStatus.RESOLVED || targetStatus === CaseStatus.CLOSED) &&
      currentStatus !== CaseStatus.RESOLVED // auto-close from RESOLVED -> CLOSED doesn't re-require fields
    ) {
      if (!context?.resolution_code || !context?.resolution_summary) {
        throw new BadRequestException(
          `Transitioning to ${targetStatus} requires both resolution_code and resolution_summary.`,
        );
      }
    }

    // Enforce reopen window: CLOSED -> REOPENED only within REOPEN_WINDOW_DAYS of closure
    if (currentStatus === CaseStatus.CLOSED && targetStatus === CaseStatus.REOPENED) {
      if (!context?.closedAt) {
        throw new BadRequestException(
          'Cannot determine closure date. Case cannot be reopened.',
        );
      }
      const daysSinceClosure = Math.floor(
        (Date.now() - context.closedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceClosure > REOPEN_WINDOW_DAYS) {
        // FR-056 A3: Suggest follow-up creation when reopen window is exceeded
        const error: any = new BadRequestException({
          message: `Case cannot be reopened: closed ${daysSinceClosure} days ago, exceeds the ${REOPEN_WINDOW_DAYS}-day reopen window.`,
          suggestFollowUp: true,
          originalCaseId: context.caseId,
        });
        error.suggestFollowUp = true;
        error.originalCaseId = context.caseId;
        throw error;
      }
    }
  }

  /**
   * Get all valid next states from the current state.
   */
  getNextStates(currentStatus: CaseStatus): CaseStatus[] {
    return VALID_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Check if a case is in a terminal state.
   */
  isTerminal(status: CaseStatus): boolean {
    return status === CaseStatus.CLOSED || status === CaseStatus.CANCELLED;
  }
}
