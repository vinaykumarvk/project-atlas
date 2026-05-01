import { ThreadProcessor, THREAD_LOOKBACK_DAYS } from '../processors/thread.processor';
import { RawEmail } from '../types';

function buildEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: `<${Date.now()}@test.example.com>`,
    from: 'sender@example.com',
    to: ['recipient@bank.com'],
    cc: [],
    subject: 'Test Email',
    bodyText: 'This is a test email body.',
    receivedAt: new Date('2026-04-01T12:00:00Z'),
    headers: {},
    attachments: [],
    ...overrides,
  };
}

describe('ThreadProcessor', () => {
  let processor: ThreadProcessor;

  beforeEach(() => {
    processor = new ThreadProcessor();
  });

  describe('THREAD_LOOKBACK_DAYS constant', () => {
    it('should default to 90 when env var is not set', () => {
      // The constant is evaluated at module load time.
      // In CI/test environments where THREAD_LOOKBACK_DAYS is not set,
      // it should default to 90.
      expect(THREAD_LOOKBACK_DAYS).toBe(90);
    });

    it('should be a positive integer', () => {
      expect(Number.isInteger(THREAD_LOOKBACK_DAYS)).toBe(true);
      expect(THREAD_LOOKBACK_DAYS).toBeGreaterThan(0);
    });
  });

  describe('assembleContext() — lookback window (FR-004 A4)', () => {
    it('should set lookbackCutoff to THREAD_LOOKBACK_DAYS before receivedAt', () => {
      const receivedAt = new Date('2026-04-01T12:00:00Z');
      const email = buildEmail({ receivedAt });

      const context = processor.assembleContext(email);

      const expectedCutoff = new Date(
        receivedAt.getTime() - THREAD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      );
      expect(context.lookbackCutoff).toEqual(expectedCutoff);
    });

    it('should compute a cutoff exactly 90 days before receivedAt by default', () => {
      const receivedAt = new Date('2026-06-01T00:00:00Z');
      const email = buildEmail({ receivedAt });

      const context = processor.assembleContext(email);

      // 90 days = 90 * 86400000 ms
      const diffMs = receivedAt.getTime() - context.lookbackCutoff!.getTime();
      const diffDays = diffMs / (24 * 60 * 60 * 1000);
      expect(diffDays).toBe(90);
    });

    it('should pass lookbackCutoff so callers can filter old thread references', () => {
      const receivedAt = new Date('2026-04-01T12:00:00Z');
      const email = buildEmail({
        receivedAt,
        headers: {
          'in-reply-to': '<old-msg@test.com>',
          references: '<old-msg@test.com> <recent-msg@test.com>',
        },
        subject: 'Re: Some thread',
      });

      const lookupFn = jest.fn().mockReturnValue(['previous body text']);
      const context = processor.assembleContext(email, lookupFn);

      // The lookup function should have been called with the referenced IDs
      expect(lookupFn).toHaveBeenCalledWith(['old-msg@test.com', 'recent-msg@test.com']);

      // lookbackCutoff should be present for downstream filtering
      expect(context.lookbackCutoff).toBeDefined();
      expect(context.lookbackCutoff!.getTime()).toBeLessThan(receivedAt.getTime());
    });
  });

  describe('assembleContext() — thread identification', () => {
    it('should identify a reply email and extract thread ID', () => {
      const email = buildEmail({
        subject: 'Re: Property valuation',
        headers: {
          'in-reply-to': '<original-123@bank.com>',
          references: '<original-123@bank.com>',
        },
      });

      const context = processor.assembleContext(email);

      expect(context.isReply).toBe(true);
      expect(context.threadId).toBe('original-123@bank.com');
    });

    it('should identify a non-reply email', () => {
      const email = buildEmail({
        subject: 'New inquiry',
        headers: {},
      });

      const context = processor.assembleContext(email);

      expect(context.isReply).toBe(false);
      expect(context.threadId).toBeUndefined();
    });

    it('should strip quoted text from the body', () => {
      const email = buildEmail({
        subject: 'Re: Loan docs',
        headers: { 'in-reply-to': '<prev@test.com>' },
        bodyText:
          'New content here.\n\nOn Mon, Jan 1 2026, Someone wrote:\n> Old quoted content.\n> More old content.',
      });

      const context = processor.assembleContext(email);

      expect(context.strippedBody).toContain('New content here');
      expect(context.strippedBody).not.toContain('Old quoted content');
    });
  });

  describe('isReplyOrForward()', () => {
    it('should return true for In-Reply-To header', () => {
      const email = buildEmail({
        headers: { 'in-reply-to': '<msg@test.com>' },
      });
      expect(processor.isReplyOrForward(email)).toBe(true);
    });

    it('should return true for References header', () => {
      const email = buildEmail({
        headers: { references: '<msg@test.com>' },
      });
      expect(processor.isReplyOrForward(email)).toBe(true);
    });

    it('should return true for Re: subject prefix', () => {
      const email = buildEmail({ subject: 'Re: Follow up' });
      expect(processor.isReplyOrForward(email)).toBe(true);
    });

    it('should return true for Fwd: subject prefix', () => {
      const email = buildEmail({ subject: 'Fwd: Documents' });
      expect(processor.isReplyOrForward(email)).toBe(true);
    });

    it('should return true for Fw: subject prefix', () => {
      const email = buildEmail({ subject: 'Fw: Documents' });
      expect(processor.isReplyOrForward(email)).toBe(true);
    });

    it('should return false for a fresh email', () => {
      const email = buildEmail({
        subject: 'New submission',
        headers: {},
      });
      expect(processor.isReplyOrForward(email)).toBe(false);
    });
  });

  describe('extractReferencedIds()', () => {
    it('should extract ID from In-Reply-To header', () => {
      const email = buildEmail({
        headers: { 'in-reply-to': '<abc-123@example.com>' },
      });
      const ids = processor.extractReferencedIds(email);
      expect(ids).toEqual(['abc-123@example.com']);
    });

    it('should extract multiple IDs from References header', () => {
      const email = buildEmail({
        headers: {
          references: '<first@test.com> <second@test.com> <third@test.com>',
        },
      });
      const ids = processor.extractReferencedIds(email);
      expect(ids).toEqual([
        'first@test.com',
        'second@test.com',
        'third@test.com',
      ]);
    });

    it('should deduplicate IDs between In-Reply-To and References', () => {
      const email = buildEmail({
        headers: {
          'in-reply-to': '<msg-1@test.com>',
          references: '<msg-1@test.com> <msg-2@test.com>',
        },
      });
      const ids = processor.extractReferencedIds(email);
      expect(ids).toEqual(['msg-1@test.com', 'msg-2@test.com']);
    });

    it('should return empty array when no headers present', () => {
      const email = buildEmail({ headers: {} });
      const ids = processor.extractReferencedIds(email);
      expect(ids).toEqual([]);
    });
  });

  describe('stripQuotedText()', () => {
    it('should remove lines starting with >', () => {
      const body = 'New text.\n> Quoted line.\n> Another quoted line.';
      const result = processor.stripQuotedText(body);
      expect(result).toContain('New text.');
      expect(result).not.toContain('Quoted line.');
    });

    it('should remove "On ... wrote:" blocks and everything after', () => {
      const body =
        'My reply.\n\nOn Mon, Jan 1, 2026, Person wrote:\nOriginal message.';
      const result = processor.stripQuotedText(body);
      expect(result).toContain('My reply.');
      expect(result).not.toContain('Original message.');
    });

    it('should remove "--- Original Message ---" blocks', () => {
      const body =
        'My text.\n\n--- Original Message ---\nForwarded content here.';
      const result = processor.stripQuotedText(body);
      expect(result).toContain('My text.');
      expect(result).not.toContain('Forwarded content');
    });

    it('should remove signature blocks', () => {
      const body = 'My message.\n\n-- \nJohn Doe\nSenior Manager';
      const result = processor.stripQuotedText(body);
      expect(result).toContain('My message.');
      expect(result).not.toContain('John Doe');
    });

    it('should return empty string for empty input', () => {
      expect(processor.stripQuotedText('')).toBe('');
    });
  });

  describe('shouldLinkToExistingCase() (FR-004 A3)', () => {
    it('should return true when reply has an existing case ID', () => {
      const result = processor.shouldLinkToExistingCase({
        isReply: true,
        existingCaseId: 'case-123',
        previousMessages: [],
        strippedBody: 'reply body',
      });
      expect(result).toBe(true);
    });

    it('should return false when not a reply', () => {
      const result = processor.shouldLinkToExistingCase({
        isReply: false,
        existingCaseId: 'case-123',
        previousMessages: [],
        strippedBody: 'body',
      });
      expect(result).toBe(false);
    });

    it('should return false when no existing case ID', () => {
      const result = processor.shouldLinkToExistingCase({
        isReply: true,
        previousMessages: [],
        strippedBody: 'body',
      });
      expect(result).toBe(false);
    });
  });
});
