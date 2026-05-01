import { ActionFeedbackDto } from '../dto/action-feedback.dto';

describe('ActionFeedbackDto', () => {
  it('should require rejectionReason when action is REJECT', () => {
    const dto = new ActionFeedbackDto();
    dto.action = 'REJECT';
    dto.caseId = 'case-1';
    const errors = dto.validate();
    expect(errors).toContain('rejectionReason is required when action is REJECT');
  });

  it('should pass validation when REJECT has rejectionReason', () => {
    const dto = new ActionFeedbackDto();
    dto.action = 'REJECT';
    dto.caseId = 'case-1';
    dto.rejectionReason = 'Insufficient documentation';
    const errors = dto.validate();
    expect(errors).toHaveLength(0);
  });

  it('should pass validation for APPROVE without rejectionReason', () => {
    const dto = new ActionFeedbackDto();
    dto.action = 'APPROVE';
    dto.caseId = 'case-2';
    const errors = dto.validate();
    expect(errors).toHaveLength(0);
  });

  it('should require action field', () => {
    const dto = new ActionFeedbackDto();
    dto.caseId = 'case-3';
    const errors = dto.validate();
    expect(errors).toContain('action is required');
  });

  it('should require caseId field', () => {
    const dto = new ActionFeedbackDto();
    dto.action = 'APPROVE';
    const errors = dto.validate();
    expect(errors).toContain('caseId is required');
  });
});
