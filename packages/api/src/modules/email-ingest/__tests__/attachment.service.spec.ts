import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { AttachmentService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../services/attachment.service';
import { AvScannerService } from '../services/av-scanner.service';
import { PrismaService } from '../../../common/prisma';
import { ObjectStorageService } from '../../../common/services/object-storage.service';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { RawEmail, RawAttachment } from '../types';
import { ConfigService } from '@nestjs/config';

function buildAttachment(overrides: Partial<RawAttachment> = {}): RawAttachment {
  return {
    filename: 'test-document.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    content: Buffer.from('fake PDF content for testing'),
    ...overrides,
  };
}

function buildEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: `<${Date.now()}@test.example.com>`,
    from: 'sender@example.com',
    to: ['recipient@bank.com'],
    cc: [],
    subject: 'Test Email with Attachments',
    bodyText: 'This is a test email body.',
    receivedAt: new Date(),
    headers: {},
    attachments: [],
    ...overrides,
  };
}

describe('AttachmentService', () => {
  let service: AttachmentService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let mockObjectStorage: jest.Mocked<ObjectStorageService>;
  let mockAvScannerService: { scanPendingForCase: jest.Mock; scanAttachment: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachmentRecords: any[] = [];

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();
    attachmentRecords.length = 0;

    mockPrisma.caseAttachment.create.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ data }: { data: any }) => {
        const record = {
          id: `att-${attachmentRecords.length + 1}`,
          ...data,
          created_at: new Date(),
        };
        attachmentRecords.push(record);
        return Promise.resolve(record);
      },
    );

    mockPrisma.caseAttachment.findFirst.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ where }: { where: any }) => {
        const found = attachmentRecords.find(
          (r) =>
            r.case_id === where.case_id &&
            r.checksum_sha256 === where.checksum_sha256,
        );
        return Promise.resolve(found || null);
      },
    );

    mockPrisma.caseAttachment.findUnique.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ where }: { where: any }) => {
        const found = attachmentRecords.find((r) => r.id === where.id);
        return Promise.resolve(found || null);
      },
    );

    mockPrisma.caseAttachment.findMany.mockResolvedValue([]);

    mockPrisma.case.findUnique.mockResolvedValue({
      case_number: 'ATL-2026-000001',
    });

    mockObjectStorage = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      exists: jest.fn().mockResolvedValue(false),
      delete: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('https://storage.example.com/signed-url'),
      generateRfc822Key: jest.fn().mockReturnValue('rfc822/test.eml.enc'),
      generateAttachmentKey: jest
        .fn()
        .mockImplementation(
          (caseNumber: string, filename: string) =>
            `attachments/${caseNumber}/${filename}`,
        ),
    } as unknown as jest.Mocked<ObjectStorageService>;

    mockAvScannerService = {
      scanPendingForCase: jest.fn().mockResolvedValue(undefined),
      scanAttachment: jest.fn().mockResolvedValue({ clean: true, verdict: 'NOOP_CLEAN' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ObjectStorageService, useValue: mockObjectStorage },
        { provide: AvScannerService, useValue: mockAvScannerService },
        {
          provide: getQueueToken('av-scan'),
          useValue: { add: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
      ],
    }).compile();

    service = module.get<AttachmentService>(AttachmentService);
  });

  describe('extractAttachments()', () => {
    it('should return attachments from the raw email', () => {
      const att1 = buildAttachment({ filename: 'doc1.pdf' });
      const att2 = buildAttachment({ filename: 'doc2.pdf' });
      const email = buildEmail({ attachments: [att1, att2] });

      const result = service.extractAttachments(email);

      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('doc1.pdf');
      expect(result[1].filename).toBe('doc2.pdf');
    });

    it('should return empty array when no attachments', () => {
      const email = buildEmail({ attachments: [] });

      const result = service.extractAttachments(email);

      expect(result).toHaveLength(0);
    });

    it('should extract inline images from HTML body with data URIs', () => {
      const email = buildEmail({
        attachments: [],
        bodyHtml:
          '<p>Hello</p><img src="data:image/png;base64,iVBORw0KGgo=" /><p>World</p>',
      });

      const result = service.extractAttachments(email);

      expect(result).toHaveLength(1);
      expect(result[0].filename).toMatch(/inline-image-0\.png/);
      expect(result[0].mimeType).toBe('image/png');
    });
  });

  describe('storeAttachment()', () => {
    it('should store attachment in object storage and create DB record', async () => {
      const attachment = buildAttachment();
      const caseId = 'case-123';

      const result = await service.storeAttachment(caseId, attachment);

      expect(result).not.toBeNull();
      expect(result!.filename).toBe('test-document.pdf');
      expect(result!.mimeType).toBe('application/pdf');
      expect(result!.checksumSha256).toBeDefined();
      expect(result!.checksumSha256).toHaveLength(64); // SHA-256 hex length
      expect(mockObjectStorage.put).toHaveBeenCalledTimes(1);
      expect(mockPrisma.caseAttachment.create).toHaveBeenCalledTimes(1);
    });

    it('should skip duplicate attachment with same SHA-256 hash', async () => {
      const attachment = buildAttachment();
      const caseId = 'case-123';

      // Store first time
      await service.storeAttachment(caseId, attachment);

      // Store second time (same content)
      const result = await service.storeAttachment(caseId, attachment);

      expect(result).toBeNull(); // Duplicate skipped
      expect(mockObjectStorage.put).toHaveBeenCalledTimes(1); // Only stored once
    });

    it('should store different attachments separately', async () => {
      const att1 = buildAttachment({
        filename: 'doc1.pdf',
        content: Buffer.from('content A'),
      });
      const att2 = buildAttachment({
        filename: 'doc2.pdf',
        content: Buffer.from('content B'),
      });
      const caseId = 'case-123';

      const result1 = await service.storeAttachment(caseId, att1);
      const result2 = await service.storeAttachment(caseId, att2);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1!.checksumSha256).not.toBe(result2!.checksumSha256);
    });

    it('should pass email ingest ID to the database record', async () => {
      const attachment = buildAttachment();

      await service.storeAttachment('case-123', attachment, 'ingest-456');

      expect(mockPrisma.caseAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email_ingest_id: 'ingest-456',
          }),
        }),
      );
    });
  });

  describe('computeSha256()', () => {
    it('should produce consistent hashes for same content', () => {
      const buffer = Buffer.from('test content');
      const hash1 = service.computeSha256(buffer);
      const hash2 = service.computeSha256(buffer);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = service.computeSha256(Buffer.from('content A'));
      const hash2 = service.computeSha256(Buffer.from('content B'));

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('processEmailAttachments()', () => {
    it('should process all attachments from an email', async () => {
      const email = buildEmail({
        attachments: [
          buildAttachment({
            filename: 'a.pdf',
            content: Buffer.from('pdf content'),
          }),
          buildAttachment({
            filename: 'b.jpg',
            mimeType: 'image/jpeg',
            content: Buffer.from('jpg content'),
          }),
        ],
      });

      const results = await service.processEmailAttachments(
        'case-123',
        email,
        'ingest-1',
      );

      expect(results).toHaveLength(2);
      expect(results[0].filename).toBe('a.pdf');
      expect(results[1].filename).toBe('b.jpg');
    });

    it('should skip duplicate attachments within the same email', async () => {
      const sameContent = Buffer.from('identical content');
      const email = buildEmail({
        attachments: [
          buildAttachment({
            filename: 'copy1.pdf',
            content: sameContent,
          }),
          buildAttachment({
            filename: 'copy2.pdf',
            content: sameContent,
          }),
        ],
      });

      const results = await service.processEmailAttachments(
        'case-123',
        email,
      );

      // Second attachment with same hash should be skipped
      expect(results).toHaveLength(1);
    });
  });

  describe('getDownloadUrl()', () => {
    it('should return a signed URL for a clean attachment', async () => {
      // Store an attachment first
      const attachment = buildAttachment();
      const stored = await service.storeAttachment('case-123', attachment);

      // Update mock to return the record with CLEAN status
      mockPrisma.caseAttachment.findUnique.mockResolvedValueOnce({
        id: stored!.id,
        s3_key: stored!.s3Key,
        av_scan_status: 'CLEAN',
      });

      const url = await service.getDownloadUrl(stored!.id);

      expect(url).toContain('signed-url');
    });

    it('should throw for quarantined attachment', async () => {
      mockPrisma.caseAttachment.findUnique.mockResolvedValueOnce({
        id: 'att-quarantined',
        s3_key: 'attachments/test/malware.exe',
        av_scan_status: 'INFECTED',
      });

      await expect(
        service.getDownloadUrl('att-quarantined'),
      ).rejects.toThrow('Cannot download quarantined attachment');
    });

    it('should throw for non-existent attachment', async () => {
      mockPrisma.caseAttachment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getDownloadUrl('non-existent'),
      ).rejects.toThrow('Attachment not found');
    });
  });

  describe('MIME type validation', () => {
    it('should reject disallowed MIME types (e.g., application/x-msdownload)', async () => {
      const attachment = buildAttachment({
        filename: 'malware.exe',
        mimeType: 'application/x-msdownload',
        content: Buffer.from('dangerous content'),
      });

      await expect(
        service.storeAttachment('case-123', attachment),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.storeAttachment('case-123', attachment),
      ).rejects.toThrow('File type not allowed');
    });

    it('should reject application/x-javascript MIME type', async () => {
      const attachment = buildAttachment({
        filename: 'script.js',
        mimeType: 'application/x-javascript',
        content: Buffer.from('alert("xss")'),
      });

      await expect(
        service.storeAttachment('case-123', attachment),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject application/zip MIME type', async () => {
      const attachment = buildAttachment({
        filename: 'archive.zip',
        mimeType: 'application/zip',
        content: Buffer.from('zip content'),
      });

      await expect(
        service.storeAttachment('case-123', attachment),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('file size validation', () => {
    it('should store oversized files (>25 MB) in oversized prefix instead of rejecting', async () => {
      const oversizedContent = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, 0);
      const attachment = buildAttachment({
        filename: 'huge-file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: oversizedContent.length,
        content: oversizedContent,
      });

      const result = await service.storeAttachment('case-123', attachment);
      expect(result).not.toBeNull();
      expect(result!.s3Key).toContain('oversized/');
    });

    it('should accept files exactly at the 25 MB limit', async () => {
      const exactContent = Buffer.alloc(MAX_FILE_SIZE_BYTES, 0);
      const attachment = buildAttachment({
        filename: 'exact-limit.pdf',
        mimeType: 'application/pdf',
        sizeBytes: exactContent.length,
        content: exactContent,
      });

      const result = await service.storeAttachment('case-123', attachment);
      expect(result).not.toBeNull();
    });
  });

  describe('happy path with allowed MIME types', () => {
    it('should accept PDF within size limit', async () => {
      const attachment = buildAttachment({
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        content: Buffer.from('valid PDF content'),
      });

      const result = await service.storeAttachment('case-123', attachment);

      expect(result).not.toBeNull();
      expect(result!.filename).toBe('document.pdf');
      expect(result!.mimeType).toBe('application/pdf');
      expect(mockObjectStorage.put).toHaveBeenCalledTimes(1);
    });

    it('should accept JPEG image', async () => {
      const attachment = buildAttachment({
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        content: Buffer.from('jpeg data'),
      });

      const result = await service.storeAttachment('case-123', attachment);
      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/jpeg');
    });

    it('should accept PNG image', async () => {
      const attachment = buildAttachment({
        filename: 'screenshot.png',
        mimeType: 'image/png',
        content: Buffer.from('png data'),
      });

      const result = await service.storeAttachment('case-123', attachment);
      expect(result).not.toBeNull();
    });

    it('should accept DOCX document', async () => {
      const attachment = buildAttachment({
        filename: 'report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        content: Buffer.from('docx data'),
      });

      const result = await service.storeAttachment('case-123', attachment);
      expect(result).not.toBeNull();
    });

    it('should accept XLSX spreadsheet', async () => {
      const attachment = buildAttachment({
        filename: 'data.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: Buffer.from('xlsx data'),
      });

      const result = await service.storeAttachment('case-123', attachment);
      expect(result).not.toBeNull();
    });

    it('should accept CSV file', async () => {
      const attachment = buildAttachment({
        filename: 'data.csv',
        mimeType: 'text/csv',
        content: Buffer.from('col1,col2\nval1,val2'),
      });

      const result = await service.storeAttachment('case-123', attachment);
      expect(result).not.toBeNull();
    });

    it('should accept message/rfc822', async () => {
      const attachment = buildAttachment({
        filename: 'forwarded.eml',
        mimeType: 'message/rfc822',
        content: Buffer.from('From: test@example.com\r\nSubject: Test'),
      });

      const result = await service.storeAttachment('case-123', attachment);
      expect(result).not.toBeNull();
    });
  });

  describe('processEmailAttachments() with AV scanning', () => {
    it('should trigger AV scan after storing attachments', async () => {
      const email = buildEmail({
        attachments: [
          buildAttachment({
            filename: 'doc.pdf',
            content: Buffer.from('pdf data'),
          }),
        ],
      });

      await service.processEmailAttachments('case-123', email, 'ingest-1');

      expect(mockAvScannerService.scanPendingForCase).toHaveBeenCalledWith('case-123');
    });

    it('should not trigger AV scan when no attachments are stored', async () => {
      const email = buildEmail({ attachments: [] });

      await service.processEmailAttachments('case-123', email, 'ingest-1');

      expect(mockAvScannerService.scanPendingForCase).not.toHaveBeenCalled();
    });
  });
});
