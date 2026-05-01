import { Test, TestingModule } from '@nestjs/testing';
import {
  DualPollOrchestratorService,
} from '../services/dual-poll-orchestrator.service';
import { MailProvider, RawEmailData } from '../providers/imap.provider';

function buildRawEmail(overrides: Partial<RawEmailData> = {}): RawEmailData {
  return {
    messageId: `<${Date.now()}-${Math.random().toString(36).slice(2)}@test.com>`,
    from: 'sender@example.com',
    to: ['recipient@bank.com'],
    subject: 'Test Email',
    body: 'Test body.',
    receivedAt: new Date(),
    headers: {},
    ...overrides,
  };
}

function createMockProvider(emails: RawEmailData[]): MailProvider {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    onNewMail: jest.fn(),
    fetchUnread: jest.fn().mockResolvedValue(emails),
  };
}

describe('DualPollOrchestratorService (FR-155.A3)', () => {
  let service: DualPollOrchestratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DualPollOrchestratorService],
    }).compile();

    service = module.get<DualPollOrchestratorService>(
      DualPollOrchestratorService,
    );
  });

  describe('registerProvider', () => {
    it('should register a mail provider', () => {
      const provider = createMockProvider([]);
      service.registerProvider('graph', provider);

      expect(service.getProviderCount()).toBe(1);
    });

    it('should register multiple providers', () => {
      service.registerProvider('graph', createMockProvider([]));
      service.registerProvider('imap', createMockProvider([]));

      expect(service.getProviderCount()).toBe(2);
    });

    it('should replace a provider with the same name', () => {
      service.registerProvider('graph', createMockProvider([]));
      service.registerProvider('graph', createMockProvider([]));

      expect(service.getProviderCount()).toBe(1);
    });
  });

  describe('pollAll', () => {
    it('should poll all providers and return results', async () => {
      const email1 = buildRawEmail({ messageId: '<a@test.com>' });
      const email2 = buildRawEmail({ messageId: '<b@test.com>' });

      service.registerProvider('graph', createMockProvider([email1]));
      service.registerProvider('imap', createMockProvider([email2]));

      const results = await service.pollAll();

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ fetched: 1, deduplicated: 0, provider: 'graph' });
      expect(results[1]).toEqual({ fetched: 1, deduplicated: 0, provider: 'imap' });
    });

    it('should deduplicate emails with the same Message-ID across providers', async () => {
      const sharedEmail = buildRawEmail({ messageId: '<shared@test.com>' });

      service.registerProvider('graph', createMockProvider([sharedEmail]));
      service.registerProvider('imap', createMockProvider([sharedEmail]));

      const results = await service.pollAll();

      // First provider gets it through, second detects duplicate
      expect(results[0]).toEqual({
        fetched: 1,
        deduplicated: 0,
        provider: 'graph',
      });
      expect(results[1]).toEqual({
        fetched: 0,
        deduplicated: 1,
        provider: 'imap',
      });
    });

    it('should deduplicate within a single provider', async () => {
      const email = buildRawEmail({ messageId: '<dup@test.com>' });

      service.registerProvider('graph', createMockProvider([email, email]));

      const results = await service.pollAll();

      expect(results[0].fetched).toBe(1);
      expect(results[0].deduplicated).toBe(1);
    });

    it('should return empty results when no providers are registered', async () => {
      const results = await service.pollAll();
      expect(results).toEqual([]);
    });

    it('should handle provider errors gracefully', async () => {
      const failingProvider: MailProvider = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        onNewMail: jest.fn(),
        fetchUnread: jest.fn().mockRejectedValue(new Error('Connection lost')),
      };

      service.registerProvider('failing', failingProvider);

      const results = await service.pollAll();

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        fetched: 0,
        deduplicated: 0,
        provider: 'failing',
      });
    });

    it('should continue polling other providers when one fails', async () => {
      const failingProvider: MailProvider = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        onNewMail: jest.fn(),
        fetchUnread: jest.fn().mockRejectedValue(new Error('Timeout')),
      };

      const email = buildRawEmail({ messageId: '<success@test.com>' });
      service.registerProvider('failing', failingProvider);
      service.registerProvider('working', createMockProvider([email]));

      const results = await service.pollAll();

      expect(results).toHaveLength(2);
      expect(results[0].provider).toBe('failing');
      expect(results[0].fetched).toBe(0);
      expect(results[1].provider).toBe('working');
      expect(results[1].fetched).toBe(1);
    });
  });

  describe('collected emails', () => {
    it('should collect deduplicated emails from all providers', async () => {
      const email1 = buildRawEmail({ messageId: '<e1@test.com>', subject: 'First' });
      const email2 = buildRawEmail({ messageId: '<e2@test.com>', subject: 'Second' });

      service.registerProvider('graph', createMockProvider([email1]));
      service.registerProvider('imap', createMockProvider([email2]));

      await service.pollAll();

      const collected = service.getCollectedEmails();
      expect(collected).toHaveLength(2);
      expect(collected.map((e) => e.subject)).toContain('First');
      expect(collected.map((e) => e.subject)).toContain('Second');
    });

    it('should not include duplicates in collected emails', async () => {
      const shared = buildRawEmail({ messageId: '<shared@test.com>' });

      service.registerProvider('graph', createMockProvider([shared]));
      service.registerProvider('imap', createMockProvider([shared]));

      await service.pollAll();

      const collected = service.getCollectedEmails();
      expect(collected).toHaveLength(1);
    });

    it('should clear collected emails', async () => {
      service.registerProvider(
        'graph',
        createMockProvider([buildRawEmail()]),
      );
      await service.pollAll();

      expect(service.getCollectedEmails()).toHaveLength(1);

      service.clearCollected();
      expect(service.getCollectedEmails()).toHaveLength(0);
    });
  });

  describe('processedIds tracking', () => {
    it('should track processed message IDs across multiple polls', async () => {
      const email1 = buildRawEmail({ messageId: '<first@test.com>' });
      const email2 = buildRawEmail({ messageId: '<second@test.com>' });

      service.registerProvider('graph', createMockProvider([email1]));
      await service.pollAll();

      expect(service.getProcessedCount()).toBe(1);

      // Re-register provider with new + old email
      service.registerProvider(
        'graph',
        createMockProvider([email1, email2]),
      );
      await service.pollAll();

      // email1 should be deduplicated, email2 should be new
      expect(service.getProcessedCount()).toBe(2);
    });
  });
});
