/**
 * FR-052.A3: Action Feedback DTO — captures approve/reject actions with mandatory rejection reason.
 */
export class ActionFeedbackDto {
  action!: 'APPROVE' | 'REJECT';
  caseId!: string;
  comment?: string;
  rejectionReason?: string;

  validate(): string[] {
    const errors: string[] = [];
    if (!this.action) errors.push('action is required');
    if (!this.caseId) errors.push('caseId is required');
    if (this.action === 'REJECT' && !this.rejectionReason) {
      errors.push('rejectionReason is required when action is REJECT');
    }
    return errors;
  }
}
