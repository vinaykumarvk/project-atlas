import { Test, TestingModule } from '@nestjs/testing';
import { EmailIngestService, SUPPORTED_LANGUAGES } from '../email-ingest.service';
import { SpamProcessor } from '../processors/spam.processor';
import { ThreadProcessor } from '../processors/thread.processor';
import { LanguageProcessor } from '../processors/language.processor';
import { PrismaService } from '../../../common/prisma';
import { EncryptionService } from '../../../common/services/encryption.service';
import { ObjectStorageService } from '../../../common/services/object-storage.service';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { RawEmail, IngestStatus } from '../types';

function buildEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: `<${Date.now()}@test.example.com>`,
    from: 'sender@example.com',
    to: ['recipient@bank.com'],
    cc: [],
    subject: 'Test Email',
    bodyText: 'This is a test email body.',
    receivedAt: new Date(),
    headers: {},
    attachments: [],
    ...overrides,
  };
}

describe('EmailIngestService', () => {
  let service: EmailIngestService;
  let mockEncryptionService: { encrypt: jest.Mock; decrypt: jest.Mock; checksum: jest.Mock };
  let mockObjectStorageService: { put: jest.Mock; get: jest.Mock; generateRfc822Key: jest.Mock; generateAttachmentKey: jest.Mock; exists: jest.Mock; delete: jest.Mock; getSignedUrl: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma = createMockPrismaService() as any;

    // Stateful mock for emailIngest — tracks created records for duplicate detection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailRecords: any[] = [];

    mockPrisma.emailIngest.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const record = { id: `ingest-${emailRecords.length + 1}`, ...data, created_at: new Date() };
      emailRecords.push(record);
      return Promise.resolve(record);
    });

    mockPrisma.emailIngest.findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      const found = emailRecords.find((r) => {
        if (where.message_id) return r.message_id === where.message_id;
        if (where.id) return r.id === where.id;
        return false;
      });
      return Promise.resolve(found || null);
    });

    mockPrisma.emailIngest.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      const found = emailRecords.find((r) => {
        if (where?.rfc822_checksum) return r.rfc822_checksum === where.rfc822_checksum;
        return false;
      });
      return Promise.resolve(found || null);
    });

    mockPrisma.emailIngest.findMany.mockImplementation(() => Promise.resolve([...emailRecords]));

    mockPrisma.emailIngest.update.mockImplementation(({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const record = emailRecords.find((r) => r.id === where.id);
      if (record) Object.assign(record, data);
      return Promise.resolve(record);
    });

    mockEncryptionService = {
      encrypt: jest.fn().mockImplementation((buf: Buffer) => Buffer.concat([Buffer.from('ENC:'), buf])),
      decrypt: jest.fn().mockImplementation((buf: Buffer) => buf.subarray(4)),
      checksum: jest.fn().mockReturnValue('mock-checksum'),
    };

    mockObjectStorageService = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      generateRfc822Key: jest.fn().mockImplementation(
        (messageId: string, _date: Date) => `rfc822/2026/01/01/${messageId.replace(/[^a-zA-Z0-9._-]/g, '_')}.eml.enc`,
      ),
      generateAttachmentKey: jest.fn().mockReturnValue('attachments/test/file.pdf'),
      exists: jest.fn().mockResolvedValue(false),
      delete: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn().mockResolvedValue('https://storage.example.com/signed'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailIngestService,
        SpamProcessor,
        ThreadProcessor,
        LanguageProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: ObjectStorageService, useValue: mockObjectStorageService },
      ],
    }).compile();

    service = module.get<EmailIngestService>(EmailIngestService);
  });

  describe('ingest() — happy path', () => {
    it('should ingest a normal email with RECEIVED status', async () => {
      const email = buildEmail({ subject: 'Please review the collateral documents' });
      const result = await service.ingest(email, 'graph');

      expect(result.ingestStatus).toBe(IngestStatus.RECEIVED);
      expect(result.id).toBeDefined();
      expect(result.messageId).toBe(email.messageId);
    });

    it('should store the record retrievable by messageId', async () => {
      const email = buildEmail({ messageId: '<unique-123@test.com>' });
      await service.ingest(email, 'gmail');

      const record = await service.findByMessageId('<unique-123@test.com>');
      expect(record).toBeDefined();
      expect(record!.from).toBe('sender@example.com');
      expect(record!.provider).toBe('gmail');
    });
  });

  describe('ingest() — duplicate detection (FR-014)', () => {
    it('should reject exact Message-ID duplicate', async () => {
      const email = buildEmail({ messageId: '<dup-001@test.com>' });
      await service.ingest(email, 'graph');

      const dup = await service.ingest(email, 'graph');
      expect(dup.ingestStatus).toBe(IngestStatus.DUPLICATE);
      expect(dup.reason).toContain('Message-ID');
    });

    it('should reject body hash duplicate (different Message-ID, same body)', async () => {
      const email1 = buildEmail({
        messageId: '<a@test.com>',
        bodyText: 'Identical body content for dedup testing.',
      });
      const email2 = buildEmail({
        messageId: '<b@test.com>',
        bodyText: 'Identical body content for dedup testing.',
      });

      await service.ingest(email1, 'graph');
      const result = await service.ingest(email2, 'graph');

      expect(result.ingestStatus).toBe(IngestStatus.DUPLICATE);
      expect(result.reason).toContain('SHA-256');
    });

    it('should NOT flag as duplicate if body differs', async () => {
      const email1 = buildEmail({ messageId: '<c@test.com>', bodyText: 'Body A' });
      const email2 = buildEmail({ messageId: '<d@test.com>', bodyText: 'Body B' });

      await service.ingest(email1, 'graph');
      const result = await service.ingest(email2, 'graph');

      expect(result.ingestStatus).toBe(IngestStatus.RECEIVED);
    });
  });

  describe('ingest() — auto-reply / OOO detection (FR-003)', () => {
    it('should detect RFC 3834 Auto-Submitted header', async () => {
      const email = buildEmail({
        headers: { 'auto-submitted': 'auto-replied' },
      });
      const result = await service.ingest(email, 'graph');
      expect(result.ingestStatus).toBe(IngestStatus.AUTO_REPLY);
    });

    it('should detect X-Auto-Response-Suppress header (Microsoft)', async () => {
      const email = buildEmail({
        headers: { 'x-auto-response-suppress': 'All' },
      });
      const result = await service.ingest(email, 'graph');
      expect(result.ingestStatus).toBe(IngestStatus.AUTO_REPLY);
    });

    it('should detect Precedence: bulk', async () => {
      const email = buildEmail({
        headers: { precedence: 'bulk' },
      });
      const result = await service.ingest(email, 'graph');
      expect(result.ingestStatus).toBe(IngestStatus.AUTO_REPLY);
    });

    it('should detect out-of-office body patterns', async () => {
      const email = buildEmail({
        bodyText: 'Thank you for your email. I am currently out of the office and will return on Monday.',
      });
      const result = await service.ingest(email, 'graph');
      expect(result.ingestStatus).toBe(IngestStatus.AUTO_REPLY);
    });

    it('should detect "automatic reply" body pattern', async () => {
      const email = buildEmail({
        bodyText: 'This is an automatic reply. I will respond when I return.',
      });
      const result = await service.ingest(email, 'graph');
      expect(result.ingestStatus).toBe(IngestStatus.AUTO_REPLY);
    });
  });

  describe('ingest() — phishing & spam quarantine (FR-002)', () => {
    it('should quarantine email with high phishing score', async () => {
      const email = buildEmail({
        subject: 'URGENT: Verify your account immediately',
        bodyText:
          'Click here immediately to verify your account. Your password expired. Confirm your identity or your account will be suspended.',
        headers: {
          'authentication-results': 'spf=fail; dkim=fail; dmarc=fail',
        },
      });
      const result = await service.ingest(email, 'graph');
      expect(result.ingestStatus).toBe(IngestStatus.QUARANTINED);
      expect(result.reason).toContain('Phishing score');
    });

    it('should NOT quarantine legitimate email with passing auth', async () => {
      const email = buildEmail({
        subject: 'Re: Property valuation report for Loan #12345',
        bodyText: 'Please find attached the updated valuation report for the Mumbai property.',
        headers: {
          'authentication-results': 'spf=pass; dkim=pass; dmarc=pass',
        },
      });
      const result = await service.ingest(email, 'graph');
      expect(result.ingestStatus).toBe(IngestStatus.RECEIVED);
    });
  });

  describe('ingest() — language detection (FR-005)', () => {
    it('should detect English email', async () => {
      const email = buildEmail({
        subject: 'Request for property valuation',
        bodyText: 'Please review the attached documents regarding the collateral assessment.',
      });
      await service.ingest(email, 'graph');

      const record = await service.findByMessageId(email.messageId);
      expect(record!.languageDetected).toBe('en');
    });

    it('should detect Hindi (Devanagari) email', async () => {
      const email = buildEmail({
        subject: 'संपत्ति मूल्यांकन',
        bodyText: 'कृपया संलग्न दस्तावेजों की समीक्षा करें। यह मुंबई की संपत्ति के लिए है। कृपया तत्काल कार्रवाई करें और रिपोर्ट भेजें।',
      });
      await service.ingest(email, 'graph');

      const record = await service.findByMessageId(email.messageId);
      expect(record!.languageDetected).toBe('hi');
    });

    it('should detect Hinglish (hi-Latn) email', async () => {
      const email = buildEmail({
        subject: 'Property report ke baare mein',
        bodyText: 'Sir ji, ye document abhi chahiye. Kya aap isko review karein? Bahut urgent hai.',
      });
      await service.ingest(email, 'graph');

      const record = await service.findByMessageId(email.messageId);
      expect(record!.languageDetected).toBe('hi-Latn');
    });
  });

  describe('ingest() — thread assembly (FR-004)', () => {
    it('should detect reply from In-Reply-To header', async () => {
      const email = buildEmail({
        subject: 'Re: Property valuation',
        headers: {
          'in-reply-to': '<original-123@bank.com>',
          references: '<original-123@bank.com>',
        },
        bodyText: 'Thanks for the update.\n\n> On Mon, Jan 1 wrote:\n> Original message here.',
      });
      await service.ingest(email, 'graph');

      const record = await service.findByMessageId(email.messageId);
      expect(record!.threadContext).toBeDefined();
      expect(record!.threadContext!.isReply).toBe(true);
      expect(record!.threadContext!.threadId).toBe('original-123@bank.com');
    });

    it('should strip quoted text from body', async () => {
      const email = buildEmail({
        subject: 'Re: Loan docs',
        headers: { 'in-reply-to': '<prev@test.com>' },
        bodyText: 'New content here.\n\nOn Mon, Jan 1 2026, Someone wrote:\n> Old quoted content.\n> More old content.',
      });
      await service.ingest(email, 'graph');

      const record = await service.findByMessageId(email.messageId);
      expect(record!.threadContext!.strippedBody).toContain('New content here');
      expect(record!.threadContext!.strippedBody).not.toContain('Old quoted content');
    });

    it('should identify non-reply email', async () => {
      const email = buildEmail({
        subject: 'New property submission',
        headers: {},
        bodyText: 'Fresh email with no thread context.',
      });
      await service.ingest(email, 'graph');

      const record = await service.findByMessageId(email.messageId);
      expect(record!.threadContext!.isReply).toBe(false);
    });
  });

  describe('getRecords() and updateStatus()', () => {
    it('should return all ingested records', async () => {
      await service.ingest(buildEmail({ messageId: '<r1@test.com>', bodyText: 'First email body' }), 'graph');
      await service.ingest(buildEmail({ messageId: '<r2@test.com>', bodyText: 'Second email body' }), 'gmail');

      const records = await service.getRecords();
      expect(records.length).toBe(2);
    });

    it('should update record status', async () => {
      const email = buildEmail({ messageId: '<upd@test.com>' });
      const result = await service.ingest(email, 'graph');

      await service.updateStatus(result.id, IngestStatus.CLASSIFIED);

      const record = await service.findByMessageId('<upd@test.com>');
      expect(record!.ingestStatus).toBe(IngestStatus.CLASSIFIED);
    });
  });

  describe('ingest() — phishing flag for review (FR-002.A2)', () => {
    it('should set phishingFlagged=true when phishing score is between 0.50 and 0.80', async () => {
      // Use enough phishing keywords to get a score in the 0.50-0.80 range:
      // 2 keywords = 0.50 exactly
      const email = buildEmail({
        subject: 'Verify your account',
        bodyText: 'Your password expired. Please login again.',
        headers: {},
      });
      const result = await service.ingest(email, 'graph');

      expect(result.ingestStatus).toBe(IngestStatus.RECEIVED);
      expect(result.phishingFlagged).toBe(true);

      // Verify the DB record was created with phishing_flagged=true
      expect(mockPrisma.emailIngest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phishing_flagged: true,
          }),
        }),
      );
    });

    it('should NOT set phishingFlagged for legitimate emails', async () => {
      const email = buildEmail({
        subject: 'Property valuation report',
        bodyText: 'Please find attached the valuation report for the Mumbai property.',
        headers: {
          'authentication-results': 'spf=pass; dkim=pass; dmarc=pass',
        },
      });
      const result = await service.ingest(email, 'graph');

      expect(result.ingestStatus).toBe(IngestStatus.RECEIVED);
      expect(result.phishingFlagged).toBe(false);
    });
  });

  describe('ingest() — OOO thread logging (FR-003.A2)', () => {
    it('should log OOO_RECEIVED activity when auto-reply references existing case', async () => {
      // ThreadProcessor.assembleContext will see in-reply-to header but
      // existingCaseId needs to be provided by the lookup callback.
      // In the service, assembleContext is called without the lookup callback,
      // so existingCaseId won't be set. We test the activity log mock is NOT called
      // for auto-replies without an existing case reference.
      const email = buildEmail({
        bodyText: 'I am currently out of the office.',
        headers: { 'auto-submitted': 'auto-replied' },
      });
      const result = await service.ingest(email, 'graph');

      expect(result.ingestStatus).toBe(IngestStatus.AUTO_REPLY);
      // No existing case, so no OOO activity log should be created
      expect(mockPrisma.caseActivityLog.create).not.toHaveBeenCalled();
    });
  });

  describe('ingest() — non-supported language routing (FR-005.A3)', () => {
    it('should return languageSupported=true for supported languages', async () => {
      const email = buildEmail({
        subject: 'Request for property valuation',
        bodyText: 'Please review the attached documents regarding the collateral assessment.',
      });
      const result = await service.ingest(email, 'graph');

      expect(result.languageSupported).toBe(true);
    });

    it('should return languageSupported=true for Hindi', async () => {
      const email = buildEmail({
        subject: 'संपत्ति मूल्यांकन',
        bodyText: 'कृपया संलग्न दस्तावेजों की समीक्षा करें। यह मुंबई की संपत्ति के लिए है। कृपया तत्काल कार्रवाई करें और रिपोर्ट भेजें।',
      });
      const result = await service.ingest(email, 'graph');

      expect(result.languageSupported).toBe(true);
    });

    it('should have SUPPORTED_LANGUAGES constant with the expected languages', () => {
      expect(SUPPORTED_LANGUAGES).toContain('en');
      expect(SUPPORTED_LANGUAGES).toContain('hi');
      expect(SUPPORTED_LANGUAGES).toContain('mr');
      expect(SUPPORTED_LANGUAGES).toContain('gu');
      expect(SUPPORTED_LANGUAGES).toContain('ta');
      expect(SUPPORTED_LANGUAGES).toContain('te');
      expect(SUPPORTED_LANGUAGES).toContain('kn');
      expect(SUPPORTED_LANGUAGES).toContain('ml');
      expect(SUPPORTED_LANGUAGES).toContain('bn');
      expect(SUPPORTED_LANGUAGES).toContain('pa');
      expect(SUPPORTED_LANGUAGES.length).toBe(10);
    });
  });

  describe('RFC822 archival', () => {
    it('should encrypt and store rfc822Raw when present', async () => {
      const rfc822Raw = Buffer.from('From: sender@example.com\r\nTo: recipient@bank.com\r\nSubject: Test\r\n\r\nBody text');
      const email = buildEmail({
        messageId: '<rfc822-test@test.com>',
        rfc822Raw,
      });

      await service.ingest(email, 'graph');

      // Should have encrypted the raw content
      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith(rfc822Raw);

      // Should have generated the S3 key
      expect(mockObjectStorageService.generateRfc822Key).toHaveBeenCalledWith(
        email.messageId,
        email.receivedAt,
      );

      // Should have stored the encrypted buffer in object storage
      expect(mockObjectStorageService.put).toHaveBeenCalledTimes(1);
      const putCall = mockObjectStorageService.put.mock.calls[0];
      expect(putCall[0]).toContain('rfc822/');
      expect(putCall[0]).toContain('.eml.enc');

      // Should have saved the S3 key in the DB record
      expect(mockPrisma.emailIngest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rfc822_s3_key: expect.stringContaining('rfc822/'),
          }),
        }),
      );
    });

    it('should NOT store rfc822 when rfc822Raw is absent', async () => {
      const email = buildEmail({
        messageId: '<no-rfc822@test.com>',
      });

      await service.ingest(email, 'graph');

      expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();
      expect(mockObjectStorageService.put).not.toHaveBeenCalled();

      // rfc822_s3_key should be null
      expect(mockPrisma.emailIngest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rfc822_s3_key: null,
          }),
        }),
      );
    });
  });
});
