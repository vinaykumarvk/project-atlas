import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ImapProvider, RawEmailData } from '../providers/imap.provider';

function buildRawEmail(overrides: Partial<RawEmailData> = {}): RawEmailData {
  return {
    messageId: `<${Date.now()}-${Math.random().toString(36).slice(2)}@test.com>`,
    from: 'sender@example.com',
    to: ['recipient@bank.com'],
    subject: 'Test Email',
    body: 'This is a test email body.',
    receivedAt: new Date(),
    headers: {},
    ...overrides,
  };
}

describe('ImapProvider (FR-144.A2)', () => {
  let provider: ImapProvider;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue: string) => {
        const config: Record<string, string> = {
          IMAP_HOST: 'imap.bank.internal',
          IMAP_PORT: '993',
          IMAP_USER: 'collateral-ai',
          IMAP_PASSWORD: 'secure',
          IMAP_TLS: 'true',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapProvider,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    provider = module.get<ImapProvider>(ImapProvider);
  });

  describe('connect / disconnect', () => {
    it('should connect successfully', async () => {
      expect(provider.isConnected()).toBe(false);

      await provider.connect();

      expect(provider.isConnected()).toBe(true);
    });

    it('should handle duplicate connect gracefully', async () => {
      await provider.connect();
      await provider.connect(); // Should not throw

      expect(provider.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await provider.connect();
      expect(provider.isConnected()).toBe(true);

      await provider.disconnect();
      expect(provider.isConnected()).toBe(false);
    });

    it('should handle disconnect when not connected gracefully', async () => {
      await provider.disconnect(); // Should not throw
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('onNewMail', () => {
    it('should register a listener that receives simulated emails', async () => {
      await provider.connect();

      const receivedEmails: RawEmailData[] = [];
      provider.onNewMail((email) => {
        receivedEmails.push(email);
      });

      const email = buildRawEmail({ subject: 'Urgent: Property valuation' });
      provider.simulateIncoming(email);

      expect(receivedEmails).toHaveLength(1);
      expect(receivedEmails[0].subject).toBe('Urgent: Property valuation');
    });

    it('should notify multiple listeners', async () => {
      await provider.connect();

      const listener1: RawEmailData[] = [];
      const listener2: RawEmailData[] = [];
      provider.onNewMail((email) => listener1.push(email));
      provider.onNewMail((email) => listener2.push(email));

      provider.simulateIncoming(buildRawEmail());

      expect(listener1).toHaveLength(1);
      expect(listener2).toHaveLength(1);
    });

    it('should clear listeners on disconnect', async () => {
      await provider.connect();

      const received: RawEmailData[] = [];
      provider.onNewMail((email) => received.push(email));

      await provider.disconnect();

      // After disconnect, simulate should still add to unread but not notify
      provider.simulateIncoming(buildRawEmail());
      expect(received).toHaveLength(0);
    });
  });

  describe('fetchUnread', () => {
    it('should return empty array when not connected', async () => {
      const result = await provider.fetchUnread();
      expect(result).toEqual([]);
    });

    it('should return simulated incoming emails', async () => {
      await provider.connect();

      provider.simulateIncoming(buildRawEmail({ subject: 'Email 1' }));
      provider.simulateIncoming(buildRawEmail({ subject: 'Email 2' }));

      const result = await provider.fetchUnread();
      expect(result).toHaveLength(2);
      expect(result[0].subject).toBe('Email 1');
      expect(result[1].subject).toBe('Email 2');
    });

    it('should consume emails on fetch (not return them again)', async () => {
      await provider.connect();

      provider.simulateIncoming(buildRawEmail({ subject: 'Once only' }));

      const first = await provider.fetchUnread();
      expect(first).toHaveLength(1);

      const second = await provider.fetchUnread();
      expect(second).toHaveLength(0);
    });

    it('should respect the limit parameter', async () => {
      await provider.connect();

      for (let i = 0; i < 10; i++) {
        provider.simulateIncoming(buildRawEmail({ subject: `Email ${i}` }));
      }

      const result = await provider.fetchUnread(3);
      expect(result).toHaveLength(3);
      expect(result[0].subject).toBe('Email 0');
      expect(result[2].subject).toBe('Email 2');

      // Remaining 7 should still be available
      const remaining = await provider.fetchUnread();
      expect(remaining).toHaveLength(7);
    });

    it('should default to limit of 50', async () => {
      await provider.connect();

      for (let i = 0; i < 60; i++) {
        provider.simulateIncoming(buildRawEmail({ subject: `Email ${i}` }));
      }

      const result = await provider.fetchUnread();
      expect(result).toHaveLength(50);
    });
  });

  describe('simulateIncoming', () => {
    it('should add email to unread queue and notify listeners', async () => {
      await provider.connect();

      const notifications: RawEmailData[] = [];
      provider.onNewMail((email) => notifications.push(email));

      const email = buildRawEmail({
        messageId: '<sim-test@test.com>',
        from: 'customer@example.com',
        subject: 'Property submission',
      });

      provider.simulateIncoming(email);

      // Should have notified listener
      expect(notifications).toHaveLength(1);
      expect(notifications[0].messageId).toBe('<sim-test@test.com>');

      // Should be available via fetchUnread
      const unread = await provider.fetchUnread();
      expect(unread).toHaveLength(1);
    });

    it('should preserve all email fields', async () => {
      await provider.connect();

      const email: RawEmailData = {
        messageId: '<full-test@test.com>',
        from: 'sender@corp.com',
        to: ['team@bank.com', 'manager@bank.com'],
        subject: 'Multi-recipient test',
        body: 'Test body content',
        receivedAt: new Date('2026-01-15T10:30:00Z'),
        headers: { 'x-custom': 'value', 'content-type': 'text/plain' },
      };

      provider.simulateIncoming(email);

      const fetched = await provider.fetchUnread();
      expect(fetched[0]).toEqual(email);
    });
  });
});
