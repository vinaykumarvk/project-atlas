import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../../common/prisma';

/**
 * Status lifecycle for a reply draft.
 */
export type ReplyDraftStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'SENT';

/**
 * Represents a suggested reply draft for a case.
 */
export interface ReplyDraft {
  id: string;
  caseId: string;
  subject: string;
  body: string;
  status: ReplyDraftStatus;
  generatedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  /** FR-053.A1: Grounding citations — sources used to generate this draft. */
  groundingSources?: Array<{ type: string; reference: string; snippet: string }>;
}

/**
 * Context needed to generate a reply draft.
 */
export interface ReplyContext {
  subject: string;
  body: string;
  case_type: string;
}

/**
 * FR-053.A1: Suggested Reply Service.
 * Generates, manages, and tracks the lifecycle of AI-suggested reply drafts.
 * Uses an in-memory store backed by a Map for fast access,
 * with optional Prisma persistence when available.
 */
@Injectable()
export class SuggestedReplyService {
  private readonly logger = new Logger(SuggestedReplyService.name);
  private readonly drafts = new Map<string, ReplyDraft>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a reply draft for a given case.
   * Uses template-based generation (no actual LLM call).
   */
  async generateDraft(
    caseId: string,
    context: ReplyContext,
  ): Promise<ReplyDraft> {
    // FR-053.A1: Determine which template was used and build grounding citations
    const templateName = context.case_type in {
      VALUATION_REQUEST: 1, LEGAL_OPINION: 1, INSURANCE_RENEWAL: 1,
    } ? context.case_type : 'DEFAULT';

    const groundingSources: Array<{ type: string; reference: string; snippet: string }> = [
      {
        type: 'TEMPLATE',
        reference: `reply-template:${templateName}`,
        snippet: `Template selected for case_type="${context.case_type}"`,
      },
      {
        type: 'CONTEXT_FIELD',
        reference: 'context.subject',
        snippet: context.subject,
      },
      {
        type: 'CONTEXT_FIELD',
        reference: 'context.case_type',
        snippet: context.case_type,
      },
    ];
    if (context.body) {
      groundingSources.push({
        type: 'CONTEXT_FIELD',
        reference: 'context.body',
        snippet: context.body.substring(0, 200),
      });
    }

    const draft: ReplyDraft = {
      id: uuidv4(),
      caseId,
      subject: `Re: ${context.subject}`,
      body: this.generateTemplateBody(context),
      status: 'PROPOSED',
      generatedAt: new Date(),
      groundingSources,
    };

    this.drafts.set(draft.id, draft);
    this.logger.log(
      `Generated reply draft ${draft.id} for case ${caseId}`,
    );

    return draft;
  }

  /**
   * Approve a draft, recording the approver and timestamp.
   */
  async approveDraft(draftId: string, approverId: string): Promise<ReplyDraft> {
    const draft = this.drafts.get(draftId);
    if (!draft) {
      throw new Error(`Draft ${draftId} not found`);
    }
    if (draft.status !== 'PROPOSED') {
      throw new Error(
        `Draft ${draftId} cannot be approved from status ${draft.status}`,
      );
    }

    draft.status = 'APPROVED';
    draft.approvedBy = approverId;
    draft.approvedAt = new Date();
    this.drafts.set(draftId, draft);

    this.logger.log(`Draft ${draftId} approved by ${approverId}`);
    return draft;
  }

  /**
   * Reject a draft.
   */
  async rejectDraft(draftId: string): Promise<ReplyDraft> {
    const draft = this.drafts.get(draftId);
    if (!draft) {
      throw new Error(`Draft ${draftId} not found`);
    }
    if (draft.status !== 'PROPOSED') {
      throw new Error(
        `Draft ${draftId} cannot be rejected from status ${draft.status}`,
      );
    }

    draft.status = 'REJECTED';
    this.drafts.set(draftId, draft);

    this.logger.log(`Draft ${draftId} rejected`);
    return draft;
  }

  /**
   * Mark a draft as sent.
   */
  async markSent(draftId: string): Promise<ReplyDraft> {
    const draft = this.drafts.get(draftId);
    if (!draft) {
      throw new Error(`Draft ${draftId} not found`);
    }
    if (draft.status !== 'APPROVED') {
      throw new Error(
        `Draft ${draftId} cannot be sent from status ${draft.status}`,
      );
    }

    draft.status = 'SENT';
    this.drafts.set(draftId, draft);

    this.logger.log(`Draft ${draftId} marked as sent`);
    return draft;
  }

  /**
   * Get all drafts for a specific case.
   */
  async getDraftsForCase(caseId: string): Promise<ReplyDraft[]> {
    const caseDrafts: ReplyDraft[] = [];
    for (const draft of this.drafts.values()) {
      if (draft.caseId === caseId) {
        caseDrafts.push(draft);
      }
    }
    return caseDrafts.sort(
      (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime(),
    );
  }

  /**
   * Generate a template-based reply body based on case type.
   */
  private generateTemplateBody(context: ReplyContext): string {
    const templates: Record<string, string> = {
      VALUATION_REQUEST: `Dear Customer,\n\nThank you for your valuation request regarding "${context.subject}".\n\nWe have received your request and will process it promptly. A qualified valuer will be assigned to your case shortly.\n\nPlease do not hesitate to contact us if you require any further information.\n\nBest regards,\nProperty Services Team`,
      LEGAL_OPINION: `Dear Customer,\n\nThank you for your inquiry regarding "${context.subject}".\n\nWe have forwarded your request to our legal team for review. You can expect a response within 3-5 business days.\n\nBest regards,\nLegal Services Team`,
      INSURANCE_RENEWAL: `Dear Customer,\n\nThank you for contacting us about "${context.subject}".\n\nWe have noted your insurance renewal request and will process it accordingly. Please ensure all required documentation is submitted.\n\nBest regards,\nInsurance Team`,
    };

    return (
      templates[context.case_type] ||
      `Dear Customer,\n\nThank you for your inquiry regarding "${context.subject}".\n\nWe have received your message and will respond shortly.\n\nBest regards,\nCustomer Services Team`
    );
  }
}
