/**
 * Phase 6: BRD Gap Remediation Round 2 — Email-Ingest Partial Sweep Tests.
 *
 * Covers:
 *  - FR-001 A1: Latency tracking (ingest_latency_ms)
 *  - FR-004 A3: Thread -> existing case linking
 *  - FR-005 A4: Configurable supported languages
 */

import { EmailIngestService, SUPPORTED_LANGUAGES } from '../email-ingest.service';
import { IngestStatus } from '../types';

// ───────────────────────────────────────────────────────────
// Mocks
// ───────────────────────────────────────────────────────────

const mockPrisma = {
  emailIngest: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'ingest-001' }),
    update: jest.fn().mockResolvedValue({}),
  },
  caseActivityLog: {
    create: jest.fn().mockResolvedValue({}),
  },
};

const mockSpamProcessor = {
  isOnDenylist: jest.fn().mockReturnValue(false),
  evaluateSecurityHeaders: jest.fn().mockReturnValue({
    spf: 'pass',
    dkim: 'pass',
    dmarc: 'pass',
    phishingScore: 0.1,
    spamScore: 0.05,
  }),
  shouldQuarantine: jest.fn().mockReturnValue(false),
  shouldFlagForReview: jest.fn().mockReturnValue(false),
};

const mockThreadProcessor = {
  assembleContext: jest.fn().mockReturnValue({
    threadId: undefined,
    previousMessages: [],
    strippedBody: 'test body',
    isReply: false,
  }),
};

const mockLanguageProcessor = {
  detect: jest.fn().mockReturnValue({ language: 'en', confidence: 0.95 }),
};

const mockEncryptionService = {
  encrypt: jest.fn().mockReturnValue(Buffer.from('encrypted')),
};

const mockObjectStorageService = {
  generateRfc822Key: jest.fn().mockReturnValue('s3://test/key'),
  put: jest.fn().mockResolvedValue(undefined),
};

function buildRawEmail(overrides: Record<string, unknown> = {}) {
  return {
    messageId: `msg-${Date.now()}@test.com`,
    from: 'sender@test.com',
    to: ['recipient@test.com'],
    cc: [],
    subject: 'Test subject',
    bodyText: 'Test body content',
    receivedAt: new Date(),
    headers: {},
    attachments: [],
    ...overrides,
  };
}

describe('Email Ingest — Partial Sweep (Phase 6)', () => {
  let service: EmailIngestService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailIngestService(
      mockPrisma as any,
      mockSpamProcessor as any,
      mockThreadProcessor as any,
      mockLanguageProcessor as any,
      mockEncryptionService as any,
      mockObjectStorageService as any,
    );
  });

  // ─────────────────────────────────────────────────────────
  // FR-001 A1: Latency tracking
  // ─────────────────────────────────────────────────────────

  describe('FR-001 A1: Latency tracking', () => {
    it('should record ingest_latency_ms after successful ingest', async () => {
      const email = buildRawEmail();

      const result = await service.ingest(email, 'graph');

      expect(result.ingestStatus).toBe(IngestStatus.RECEIVED);

      // Verify that the ingest record was updated with latency
      expect(mockPrisma.emailIngest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ingest-001' },
          data: expect.objectContaining({
            ingest_latency_ms: expect.any(Number),
          }),
        }),
      );

      // Verify latency is a positive number
      const updateCall = mockPrisma.emailIngest.update.mock.calls[0][0];
      expect(updateCall.data.ingest_latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should log the latency in the ingest log message', async () => {
      const email = buildRawEmail();
      const logSpy = jest.spyOn((service as any).logger, 'log');

      await service.ingest(email, 'graph');

      // The log message should contain "ms" (latency value)
      const ingestLogCall = logSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('Ingested'),
      );
      expect(ingestLogCall).toBeDefined();
      expect(ingestLogCall![0]).toMatch(/\d+ms/);
    });
  });

  // ─────────────────────────────────────────────────────────
  // FR-004 A3: Thread linking (tested at ingest level)
  // ─────────────────────────────────────────────────────────

  describe('FR-004 A3: Thread context detection', () => {
    it('should detect reply emails and build thread context', async () => {
      mockThreadProcessor.assembleContext.mockReturnValueOnce({
        threadId: 'original-msg@test.com',
        previousMessages: ['original-msg@test.com'],
        strippedBody: 'reply body',
        isReply: true,
        existingCaseId: 'case-123',
      });

      const email = buildRawEmail({
        headers: { 'in-reply-to': '<original-msg@test.com>' },
        subject: 'Re: Original subject',
      });

      await service.ingest(email, 'graph');

      // The create record should include thread context
      expect(mockPrisma.emailIngest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            in_reply_to: 'original-msg@test.com',
            thread_context: expect.any(String),
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // FR-005 A4: Configurable supported languages
  // ─────────────────────────────────────────────────────────

  describe('Configurable supported languages', () => {
    it('should export SUPPORTED_LANGUAGES as a readonly array', () => {
      expect(SUPPORTED_LANGUAGES).toBeDefined();
      expect(Array.isArray(SUPPORTED_LANGUAGES)).toBe(true);
      expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(0);
    });

    it('should include English in supported languages', () => {
      expect(SUPPORTED_LANGUAGES).toContain('en');
    });

    it('should include Indian regional languages by default', () => {
      expect(SUPPORTED_LANGUAGES).toContain('hi');
      expect(SUPPORTED_LANGUAGES).toContain('mr');
    });
  });
});
