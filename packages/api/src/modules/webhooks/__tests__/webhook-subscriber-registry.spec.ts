import { Test, TestingModule } from '@nestjs/testing';
import {
  WebhookDispatcherService,
  WebhookSubscriber,
} from '../services/webhook-dispatcher.service';

function buildSubscriber(
  overrides: Partial<WebhookSubscriber> = {},
): WebhookSubscriber {
  return {
    id: 'sub-1',
    url: 'https://external.example.com/webhook',
    secret: 'test-secret-key',
    active: true,
    eventTypes: ['case.created'],
    ...overrides,
  };
}

describe('WebhookDispatcherService — Subscriber Registry (FR-141.A1)', () => {
  let service: WebhookDispatcherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookDispatcherService],
    }).compile();

    service = module.get<WebhookDispatcherService>(WebhookDispatcherService);
  });

  describe('registerSubscriber', () => {
    it('should register a subscriber for an event type', () => {
      const sub = buildSubscriber();
      service.registerSubscriber('case.created', sub);

      const subscribers = service.getSubscribers('case.created');
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].id).toBe('sub-1');
      expect(subscribers[0].url).toBe('https://external.example.com/webhook');
    });

    it('should register multiple subscribers for the same event type', () => {
      service.registerSubscriber('case.created', buildSubscriber({ id: 'sub-1' }));
      service.registerSubscriber('case.created', buildSubscriber({ id: 'sub-2', url: 'https://other.example.com/hook' }));

      const subscribers = service.getSubscribers('case.created');
      expect(subscribers).toHaveLength(2);
    });

    it('should not duplicate a subscriber with the same id', () => {
      const sub = buildSubscriber();
      service.registerSubscriber('case.created', sub);
      service.registerSubscriber('case.created', sub);

      const subscribers = service.getSubscribers('case.created');
      expect(subscribers).toHaveLength(1);
    });

    it('should allow the same subscriber for different event types', () => {
      const sub = buildSubscriber({ eventTypes: ['case.created', 'case.updated'] });
      service.registerSubscriber('case.created', sub);
      service.registerSubscriber('case.updated', sub);

      expect(service.getSubscribers('case.created')).toHaveLength(1);
      expect(service.getSubscribers('case.updated')).toHaveLength(1);
    });
  });

  describe('unregisterSubscriber', () => {
    it('should remove a subscriber from an event type', () => {
      service.registerSubscriber('case.created', buildSubscriber({ id: 'sub-1' }));
      service.registerSubscriber('case.created', buildSubscriber({ id: 'sub-2' }));

      service.unregisterSubscriber('case.created', 'sub-1');

      const subscribers = service.getSubscribers('case.created');
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].id).toBe('sub-2');
    });

    it('should handle unregistering from a non-existent event type gracefully', () => {
      expect(() =>
        service.unregisterSubscriber('non.existent', 'sub-1'),
      ).not.toThrow();
    });

    it('should handle unregistering a non-existent subscriber gracefully', () => {
      service.registerSubscriber('case.created', buildSubscriber());
      service.unregisterSubscriber('case.created', 'non-existent');

      expect(service.getSubscribers('case.created')).toHaveLength(1);
    });

    it('should clean up event type when last subscriber is removed', () => {
      service.registerSubscriber('case.created', buildSubscriber({ id: 'sub-1' }));
      service.unregisterSubscriber('case.created', 'sub-1');

      expect(service.getSubscribers('case.created')).toHaveLength(0);
    });
  });

  describe('getSubscribers', () => {
    it('should return empty array for unknown event type', () => {
      expect(service.getSubscribers('unknown.event')).toEqual([]);
    });

    it('should only return active subscribers', () => {
      service.registerSubscriber(
        'case.created',
        buildSubscriber({ id: 'active-1', active: true }),
      );
      service.registerSubscriber(
        'case.created',
        buildSubscriber({ id: 'inactive-1', active: false }),
      );

      const subscribers = service.getSubscribers('case.created');
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].id).toBe('active-1');
    });

    it('should preserve subscriber properties', () => {
      const sub = buildSubscriber({
        id: 'sub-full',
        url: 'https://hooks.example.com/v2',
        secret: 'my-secret-123',
        active: true,
        eventTypes: ['case.created', 'email.classified'],
      });
      service.registerSubscriber('case.created', sub);

      const result = service.getSubscribers('case.created');
      expect(result[0]).toEqual(sub);
    });
  });
});
