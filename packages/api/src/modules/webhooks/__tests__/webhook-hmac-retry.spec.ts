import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
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

describe('WebhookDispatcherService — HMAC-SHA256 & Retry (FR-141.A2)', () => {
  let service: WebhookDispatcherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookDispatcherService],
    }).compile();

    service = module.get<WebhookDispatcherService>(WebhookDispatcherService);
  });

  describe('signPayload', () => {
    it('should produce a valid HMAC-SHA256 hex signature', () => {
      const payload = '{"event":"case.created","id":"123"}';
      const secret = 'my-secret';

      const signature = service.signPayload(payload, secret);

      // Verify against Node.js crypto directly
      const expected = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      expect(signature).toBe(expected);
    });

    it('should produce different signatures for different payloads', () => {
      const secret = 'shared-secret';
      const sig1 = service.signPayload('payload-a', secret);
      const sig2 = service.signPayload('payload-b', secret);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different secrets', () => {
      const payload = '{"test":true}';
      const sig1 = service.signPayload(payload, 'secret-a');
      const sig2 = service.signPayload(payload, 'secret-b');

      expect(sig1).not.toBe(sig2);
    });

    it('should return a 64-character hex string', () => {
      const signature = service.signPayload('test', 'secret');
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid signature', () => {
      const payload = '{"event":"case.created"}';
      const secret = 'verify-test-secret';
      const signature = service.signPayload(payload, secret);

      expect(service.verifySignature(payload, signature, secret)).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const payload = '{"event":"case.created"}';
      const secret = 'correct-secret';
      const wrongSignature = service.signPayload(payload, 'wrong-secret');

      expect(service.verifySignature(payload, wrongSignature, secret)).toBe(false);
    });

    it('should reject a tampered payload', () => {
      const secret = 'my-secret';
      const originalPayload = '{"event":"case.created"}';
      const signature = service.signPayload(originalPayload, secret);

      const tamperedPayload = '{"event":"case.deleted"}';
      expect(service.verifySignature(tamperedPayload, signature, secret)).toBe(false);
    });

    it('should reject a signature of wrong length', () => {
      expect(service.verifySignature('test', 'short', 'secret')).toBe(false);
    });

    it('should handle non-hex signature gracefully', () => {
      const payload = 'test';
      const secret = 'secret';
      // 64-char string with invalid hex chars
      const badSig = 'g'.repeat(64);
      expect(service.verifySignature(payload, badSig, secret)).toBe(false);
    });
  });

  describe('dispatchWithRetry', () => {
    it('should dispatch to all active subscribers and return counts', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      service.setHttpClient(mockFetch);

      service.registerSubscriber('case.created', buildSubscriber({ id: 'sub-1' }));
      service.registerSubscriber('case.created', buildSubscriber({ id: 'sub-2', url: 'https://other.com/hook' }));

      const result = await service.dispatchWithRetry('case.created', {
        caseId: 'case-123',
      });

      expect(result.dispatched).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should include HMAC signature in request headers', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      service.setHttpClient(mockFetch);

      const sub = buildSubscriber({ secret: 'webhook-secret-123' });
      service.registerSubscriber('case.created', sub);

      await service.dispatchWithRetry('case.created', { id: 'test' });

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers as Record<string, string>;
      expect(headers['X-Webhook-Signature']).toBeDefined();
      expect(headers['X-Webhook-Event']).toBe('case.created');

      // Verify the signature is valid
      const body = callArgs[1].body as string;
      const isValid = service.verifySignature(
        body,
        headers['X-Webhook-Signature'],
        'webhook-secret-123',
      );
      expect(isValid).toBe(true);
    });

    it('should count failed deliveries when HTTP response is not ok', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
      service.setHttpClient(mockFetch);

      service.registerSubscriber('case.created', buildSubscriber());

      const result = await service.dispatchWithRetry('case.created', { id: '1' });

      expect(result.dispatched).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should count failed deliveries when fetch throws', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      service.setHttpClient(mockFetch);

      service.registerSubscriber('case.created', buildSubscriber());

      const result = await service.dispatchWithRetry('case.created', { id: '1' });

      expect(result.dispatched).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should skip inactive subscribers', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      service.setHttpClient(mockFetch);

      service.registerSubscriber(
        'case.created',
        buildSubscriber({ id: 'active', active: true }),
      );
      service.registerSubscriber(
        'case.created',
        buildSubscriber({ id: 'inactive', active: false }),
      );

      const result = await service.dispatchWithRetry('case.created', { id: '1' });

      expect(result.dispatched).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return zeros when no subscribers exist for event type', async () => {
      const result = await service.dispatchWithRetry('unknown.event', {});

      expect(result.dispatched).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should enqueue retry via BullMQ when delivery fails and queue is configured', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      service.setHttpClient(mockFetch);

      const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
      service.setRetryQueue(mockQueue);

      service.registerSubscriber('case.created', buildSubscriber());

      await service.dispatchWithRetry('case.created', { id: '1' });

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'webhook-retry',
        expect.objectContaining({
          eventType: 'case.created',
          subscriberId: 'sub-1',
        }),
      );
    });

    it('should not throw when retry queue is not configured and delivery fails', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
      service.setHttpClient(mockFetch);

      service.registerSubscriber('case.created', buildSubscriber());

      // No retry queue set — should not throw
      await expect(
        service.dispatchWithRetry('case.created', { id: '1' }),
      ).resolves.toEqual({ dispatched: 0, failed: 1 });
    });
  });
});
