import { NextActionService } from '../services/next-action.service';

// Mock uuid to return deterministic IDs
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9)),
}));

describe('NextActionService', () => {
  let service: NextActionService;

  beforeEach(() => {
    service = new NextActionService();
  });

  describe('suggest()', () => {
    it('should suggest CLASSIFY action when status is NEW', () => {
      const actions = service.suggest({
        status: 'NEW',
        case_type: 'VALUATION_REQUEST',
        priority: 'P2',
      });

      const classifyAction = actions.find((a) => a.action === 'CLASSIFY');
      expect(classifyAction).toBeDefined();
      expect(classifyAction!.confidence).toBe(0.95);
      expect(classifyAction!.source).toBe('RULE');
      expect(classifyAction!.description).toContain('classification pipeline');
    });

    it('should suggest ROUTE action when status is CLASSIFIED', () => {
      const actions = service.suggest({
        status: 'CLASSIFIED',
        case_type: 'LEGAL_OPINION',
        priority: 'P3',
      });

      const routeAction = actions.find((a) => a.action === 'ROUTE');
      expect(routeAction).toBeDefined();
      expect(routeAction!.confidence).toBe(0.9);
      expect(routeAction!.source).toBe('RULE');
    });

    it('should suggest ESCALATE when status is IN_PROGRESS and daysOpen > 5', () => {
      const actions = service.suggest({
        status: 'IN_PROGRESS',
        case_type: 'VALUATION_REQUEST',
        priority: 'P2',
        daysOpen: 7,
      });

      const escalateAction = actions.find((a) => a.action === 'ESCALATE');
      expect(escalateAction).toBeDefined();
      expect(escalateAction!.confidence).toBe(0.8);
    });

    it('should NOT suggest ESCALATE when daysOpen <= 5', () => {
      const actions = service.suggest({
        status: 'IN_PROGRESS',
        case_type: 'VALUATION_REQUEST',
        priority: 'P2',
        daysOpen: 3,
      });

      const escalateAction = actions.find((a) => a.action === 'ESCALATE');
      expect(escalateAction).toBeUndefined();
    });

    it('should suggest PRIORITISE for P1 priority', () => {
      const actions = service.suggest({
        status: 'NEW',
        case_type: 'VALUATION_REQUEST',
        priority: 'P1',
      });

      const prioritiseAction = actions.find((a) => a.action === 'PRIORITISE');
      expect(prioritiseAction).toBeDefined();
      expect(prioritiseAction!.confidence).toBe(0.85);
    });

    it('should suggest FOLLOW_UP when status is PENDING_INFO', () => {
      const actions = service.suggest({
        status: 'PENDING_INFO',
        case_type: 'VALUATION_REQUEST',
        priority: 'P2',
      });

      const followUpAction = actions.find((a) => a.action === 'FOLLOW_UP');
      expect(followUpAction).toBeDefined();
    });

    it('should suggest CHECK_VENDOR when status is PENDING_VENDOR', () => {
      const actions = service.suggest({
        status: 'PENDING_VENDOR',
        case_type: 'VALUATION_REQUEST',
        priority: 'P3',
      });

      const checkVendorAction = actions.find((a) => a.action === 'CHECK_VENDOR');
      expect(checkVendorAction).toBeDefined();
    });

    it('should suggest REVIEW_ENTITIES when no entities are present', () => {
      const actions = service.suggest({
        status: 'IN_PROGRESS',
        case_type: 'VALUATION_REQUEST',
        priority: 'P2',
        entities: [],
      });

      const reviewAction = actions.find((a) => a.action === 'REVIEW_ENTITIES');
      expect(reviewAction).toBeDefined();
    });

    it('should NOT suggest REVIEW_ENTITIES when entities are present', () => {
      const actions = service.suggest({
        status: 'IN_PROGRESS',
        case_type: 'VALUATION_REQUEST',
        priority: 'P2',
        entities: [{ type: 'ADDRESS', value: '123 Main St' }],
      });

      const reviewAction = actions.find((a) => a.action === 'REVIEW_ENTITIES');
      expect(reviewAction).toBeUndefined();
    });

    it('should return actions sorted by confidence (descending)', () => {
      const actions = service.suggest({
        status: 'NEW',
        case_type: 'VALUATION_REQUEST',
        priority: 'P1',
        entities: [],
      });

      for (let i = 1; i < actions.length; i++) {
        expect(actions[i - 1].confidence).toBeGreaterThanOrEqual(
          actions[i].confidence,
        );
      }
    });

    it('should return unique IDs for each action', () => {
      const actions = service.suggest({
        status: 'NEW',
        case_type: 'VALUATION_REQUEST',
        priority: 'P1',
      });

      const ids = actions.map((a) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('recordFeedback()', () => {
    it('should record accepted feedback', () => {
      service.recordFeedback('action-1', true);
      const stats = service.getFeedbackStats();
      expect(stats['action-1']).toEqual({ accepted: 1, rejected: 0 });
    });

    it('should record rejected feedback', () => {
      service.recordFeedback('action-2', false);
      const stats = service.getFeedbackStats();
      expect(stats['action-2']).toEqual({ accepted: 0, rejected: 1 });
    });

    it('should accumulate multiple feedback entries for the same action', () => {
      service.recordFeedback('action-3', true);
      service.recordFeedback('action-3', true);
      service.recordFeedback('action-3', false);

      const stats = service.getFeedbackStats();
      expect(stats['action-3']).toEqual({ accepted: 2, rejected: 1 });
    });

    it('should track feedback for multiple actions independently', () => {
      service.recordFeedback('action-a', true);
      service.recordFeedback('action-b', false);

      const stats = service.getFeedbackStats();
      expect(stats['action-a']).toEqual({ accepted: 1, rejected: 0 });
      expect(stats['action-b']).toEqual({ accepted: 0, rejected: 1 });
    });
  });

  describe('getFeedbackStats()', () => {
    it('should return empty object when no feedback is recorded', () => {
      const stats = service.getFeedbackStats();
      expect(stats).toEqual({});
    });

    it('should return all recorded feedback stats', () => {
      service.recordFeedback('a', true);
      service.recordFeedback('b', false);
      service.recordFeedback('b', true);

      const stats = service.getFeedbackStats();
      expect(Object.keys(stats)).toHaveLength(2);
      expect(stats['a']).toEqual({ accepted: 1, rejected: 0 });
      expect(stats['b']).toEqual({ accepted: 1, rejected: 1 });
    });
  });
});
