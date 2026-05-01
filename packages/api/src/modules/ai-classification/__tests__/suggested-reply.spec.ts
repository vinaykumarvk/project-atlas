import { SuggestedReplyService } from '../services/suggested-reply.service';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-draft-' + Math.random().toString(36).substr(2, 9)),
}));

describe('SuggestedReplyService', () => {
  let service: SuggestedReplyService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      suggestedReplyDraft: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new SuggestedReplyService(mockPrisma);
  });

  describe('generateDraft()', () => {
    it('should generate a draft with PROPOSED status', async () => {
      const draft = await service.generateDraft('case-1', {
        subject: 'Valuation Request',
        body: 'Please arrange valuation',
        case_type: 'VALUATION_REQUEST',
      });

      expect(draft.id).toBeDefined();
      expect(draft.caseId).toBe('case-1');
      expect(draft.subject).toBe('Re: Valuation Request');
      expect(draft.status).toBe('PROPOSED');
      expect(draft.generatedAt).toBeInstanceOf(Date);
      expect(draft.body).toContain('valuation request');
    });

    it('should generate template body for LEGAL_OPINION case type', async () => {
      const draft = await service.generateDraft('case-2', {
        subject: 'Legal query',
        body: 'Need legal review',
        case_type: 'LEGAL_OPINION',
      });

      expect(draft.body).toContain('legal team');
    });

    it('should generate template body for INSURANCE_RENEWAL case type', async () => {
      const draft = await service.generateDraft('case-3', {
        subject: 'Insurance renewal',
        body: 'Renew policy',
        case_type: 'INSURANCE_RENEWAL',
      });

      expect(draft.body).toContain('insurance renewal');
    });

    it('should generate default template for unknown case types', async () => {
      const draft = await service.generateDraft('case-4', {
        subject: 'General query',
        body: 'Some question',
        case_type: 'UNKNOWN_TYPE',
      });

      expect(draft.body).toContain('Customer Services Team');
    });

    it('should set the subject as Re: original subject', async () => {
      const draft = await service.generateDraft('case-5', {
        subject: 'Title Search Request',
        body: 'Please do title search',
        case_type: 'TITLE_SEARCH',
      });

      expect(draft.subject).toBe('Re: Title Search Request');
    });
  });

  describe('approveDraft()', () => {
    it('should approve a PROPOSED draft', async () => {
      const draft = await service.generateDraft('case-1', {
        subject: 'Test',
        body: 'Body',
        case_type: 'VALUATION_REQUEST',
      });

      const approved = await service.approveDraft(draft.id, 'user-1');
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedBy).toBe('user-1');
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });

    it('should throw when approving a non-existent draft', async () => {
      await expect(
        service.approveDraft('non-existent', 'user-1'),
      ).rejects.toThrow('not found');
    });

    it('should throw when approving an already approved draft', async () => {
      const draft = await service.generateDraft('case-1', {
        subject: 'Test',
        body: 'Body',
        case_type: 'VALUATION_REQUEST',
      });
      await service.approveDraft(draft.id, 'user-1');

      await expect(
        service.approveDraft(draft.id, 'user-2'),
      ).rejects.toThrow('cannot be approved');
    });
  });

  describe('rejectDraft()', () => {
    it('should reject a PROPOSED draft', async () => {
      const draft = await service.generateDraft('case-1', {
        subject: 'Test',
        body: 'Body',
        case_type: 'VALUATION_REQUEST',
      });

      const rejected = await service.rejectDraft(draft.id);
      expect(rejected.status).toBe('REJECTED');
    });

    it('should throw when rejecting a non-existent draft', async () => {
      await expect(service.rejectDraft('non-existent')).rejects.toThrow(
        'not found',
      );
    });

    it('should throw when rejecting a non-PROPOSED draft', async () => {
      const draft = await service.generateDraft('case-1', {
        subject: 'Test',
        body: 'Body',
        case_type: 'VALUATION_REQUEST',
      });
      await service.approveDraft(draft.id, 'user-1');

      await expect(service.rejectDraft(draft.id)).rejects.toThrow(
        'cannot be rejected',
      );
    });
  });

  describe('markSent()', () => {
    it('should mark an approved draft as sent', async () => {
      const draft = await service.generateDraft('case-1', {
        subject: 'Test',
        body: 'Body',
        case_type: 'VALUATION_REQUEST',
      });
      await service.approveDraft(draft.id, 'user-1');

      const sent = await service.markSent(draft.id);
      expect(sent.status).toBe('SENT');
    });

    it('should throw when marking a PROPOSED draft as sent', async () => {
      const draft = await service.generateDraft('case-1', {
        subject: 'Test',
        body: 'Body',
        case_type: 'VALUATION_REQUEST',
      });

      await expect(service.markSent(draft.id)).rejects.toThrow(
        'cannot be sent',
      );
    });

    it('should throw when marking non-existent draft as sent', async () => {
      await expect(service.markSent('non-existent')).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('getDraftsForCase()', () => {
    it('should return drafts for a specific case', async () => {
      await service.generateDraft('case-1', {
        subject: 'Test 1',
        body: 'Body 1',
        case_type: 'VALUATION_REQUEST',
      });
      await service.generateDraft('case-1', {
        subject: 'Test 2',
        body: 'Body 2',
        case_type: 'LEGAL_OPINION',
      });
      await service.generateDraft('case-2', {
        subject: 'Other case',
        body: 'Other body',
        case_type: 'VALUATION_REQUEST',
      });

      const drafts = await service.getDraftsForCase('case-1');
      expect(drafts).toHaveLength(2);
      expect(drafts.every((d) => d.caseId === 'case-1')).toBe(true);
    });

    it('should return empty array for a case with no drafts', async () => {
      const drafts = await service.getDraftsForCase('no-case');
      expect(drafts).toEqual([]);
    });

    it('should return drafts sorted by generatedAt descending', async () => {
      await service.generateDraft('case-1', {
        subject: 'First',
        body: 'Body',
        case_type: 'VALUATION_REQUEST',
      });
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await service.generateDraft('case-1', {
        subject: 'Second',
        body: 'Body',
        case_type: 'VALUATION_REQUEST',
      });

      const drafts = await service.getDraftsForCase('case-1');
      expect(drafts[0].generatedAt.getTime()).toBeGreaterThanOrEqual(
        drafts[1].generatedAt.getTime(),
      );
    });
  });

  describe('full lifecycle', () => {
    it('should support PROPOSED -> APPROVED -> SENT lifecycle', async () => {
      const draft = await service.generateDraft('case-1', {
        subject: 'Lifecycle test',
        body: 'Body',
        case_type: 'VALUATION_REQUEST',
      });
      expect(draft.status).toBe('PROPOSED');

      const approved = await service.approveDraft(draft.id, 'approver');
      expect(approved.status).toBe('APPROVED');

      const sent = await service.markSent(draft.id);
      expect(sent.status).toBe('SENT');
    });
  });
});
