import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  AvScannerService,
  NoOpAvScanner,
  LocalAvScanner,
} from '../services/av-scanner.service';
import { PrismaService } from '../../../common/prisma';
import { ObjectStorageService } from '../../../common/services/object-storage.service';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('AvScannerService', () => {
  let service: AvScannerService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let mockObjectStorage: { get: jest.Mock; put: jest.Mock; exists: jest.Mock; delete: jest.Mock; getSignedUrl: jest.Mock; generateRfc822Key: jest.Mock; generateAttachmentKey: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachmentRecords: any[] = [];

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();
    attachmentRecords.length = 0;

    mockPrisma.caseAttachment.update.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ where, data }: { where: any; data: any }) => {
        const record = attachmentRecords.find((r) => r.id === where.id);
        if (record) Object.assign(record, data);
        return Promise.resolve(record || { id: where.id, ...data });
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

    mockObjectStorage = {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      delete: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn().mockResolvedValue('https://signed-url'),
      generateRfc822Key: jest.fn().mockReturnValue('rfc822/test.eml.enc'),
      generateAttachmentKey: jest.fn().mockReturnValue('attachments/test/file.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvScannerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ObjectStorageService, useValue: mockObjectStorage },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue: string) => {
              if (key === 'AV_SCANNER_MODE') return 'noop';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AvScannerService>(AvScannerService);
  });

  describe('NoOpAvScanner', () => {
    it('should always return clean result', async () => {
      const scanner = new NoOpAvScanner();
      const result = await scanner.scan(Buffer.from('test data'));

      expect(result.clean).toBe(true);
      expect(result.verdict).toBe('NOOP_CLEAN');
    });
  });

  describe('scan()', () => {
    it('should return clean result in noop mode', async () => {
      const buffer = Buffer.from('test file content');
      const result = await service.scan(buffer);

      expect(result.clean).toBe(true);
      expect(result.verdict).toBe('NOOP_CLEAN');
    });
  });

  describe('scanAttachment()', () => {
    it('should scan a buffer and update the CaseAttachment record as CLEAN', async () => {
      const attachmentId = 'att-1';
      attachmentRecords.push({
        id: attachmentId,
        av_scan_status: 'PENDING',
        filename: 'test.pdf',
      });

      const buffer = Buffer.from('clean file content');
      const result = await service.scanAttachment(attachmentId, buffer);

      expect(result.clean).toBe(true);
      expect(mockPrisma.caseAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: attachmentId },
          data: expect.objectContaining({
            av_scan_status: 'CLEAN',
            av_scan_verdict: 'NOOP_CLEAN',
          }),
        }),
      );
    });

    it('should set av_scanned_at timestamp', async () => {
      const attachmentId = 'att-2';
      attachmentRecords.push({
        id: attachmentId,
        av_scan_status: 'PENDING',
      });

      await service.scanAttachment(attachmentId, Buffer.from('test'));

      expect(mockPrisma.caseAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            av_scanned_at: expect.any(Date),
          }),
        }),
      );
    });

    it('should handle scan errors gracefully', async () => {
      const attachmentId = 'att-3';
      attachmentRecords.push({
        id: attachmentId,
        av_scan_status: 'PENDING',
      });

      // Temporarily replace the scanner with one that throws
      const originalScan = service['scanner'].scan;
      service['scanner'].scan = jest
        .fn()
        .mockRejectedValue(new Error('ClamAV not available'));

      const result = await service.scanAttachment(
        attachmentId,
        Buffer.from('test'),
      );

      // Should handle error gracefully
      expect(result.verdict).toContain('SCAN_ERROR');
      expect(mockPrisma.caseAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            av_scan_status: 'ERROR',
          }),
        }),
      );

      // Restore
      service['scanner'].scan = originalScan;
    });
  });

  describe('isQuarantined()', () => {
    it('should return true for INFECTED attachments', async () => {
      mockPrisma.caseAttachment.findUnique.mockResolvedValueOnce({
        id: 'att-infected',
        av_scan_status: 'INFECTED',
      });

      const result = await service.isQuarantined('att-infected');
      expect(result).toBe(true);
    });

    it('should return false for CLEAN attachments', async () => {
      mockPrisma.caseAttachment.findUnique.mockResolvedValueOnce({
        id: 'att-clean',
        av_scan_status: 'CLEAN',
      });

      const result = await service.isQuarantined('att-clean');
      expect(result).toBe(false);
    });

    it('should return false for PENDING attachments', async () => {
      mockPrisma.caseAttachment.findUnique.mockResolvedValueOnce({
        id: 'att-pending',
        av_scan_status: 'PENDING',
      });

      const result = await service.isQuarantined('att-pending');
      expect(result).toBe(false);
    });

    it('should return false for non-existent attachments', async () => {
      mockPrisma.caseAttachment.findUnique.mockResolvedValueOnce(null);

      const result = await service.isQuarantined('att-nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('scanPendingForCase()', () => {
    it('should fetch each pending attachment from object storage and scan it', async () => {
      const pendingAttachments = [
        { id: 'att-1', s3_key: 'attachments/case-1/doc.pdf', filename: 'doc.pdf', av_scan_status: 'PENDING', is_deleted: false },
        { id: 'att-2', s3_key: 'attachments/case-1/img.png', filename: 'img.png', av_scan_status: 'PENDING', is_deleted: false },
      ];
      attachmentRecords.push(...pendingAttachments);

      mockPrisma.caseAttachment.findMany.mockResolvedValue(pendingAttachments);
      mockObjectStorage.get
        .mockResolvedValueOnce(Buffer.from('pdf content'))
        .mockResolvedValueOnce(Buffer.from('png content'));

      await service.scanPendingForCase('case-1');

      // Should have fetched both attachments from object storage
      expect(mockObjectStorage.get).toHaveBeenCalledTimes(2);
      expect(mockObjectStorage.get).toHaveBeenCalledWith('attachments/case-1/doc.pdf');
      expect(mockObjectStorage.get).toHaveBeenCalledWith('attachments/case-1/img.png');

      // Should have updated both attachment records (via scanAttachment)
      expect(mockPrisma.caseAttachment.update).toHaveBeenCalledTimes(2);
    });

    it('should skip attachments not found in object storage', async () => {
      const pendingAttachments = [
        { id: 'att-missing', s3_key: 'attachments/case-1/missing.pdf', filename: 'missing.pdf', av_scan_status: 'PENDING', is_deleted: false },
      ];
      mockPrisma.caseAttachment.findMany.mockResolvedValue(pendingAttachments);
      mockObjectStorage.get.mockResolvedValue(null);

      await service.scanPendingForCase('case-1');

      // Should have attempted to fetch but not scanned
      expect(mockObjectStorage.get).toHaveBeenCalledWith('attachments/case-1/missing.pdf');
      expect(mockPrisma.caseAttachment.update).not.toHaveBeenCalled();
    });

    it('should handle empty pending list', async () => {
      mockPrisma.caseAttachment.findMany.mockResolvedValue([]);

      await service.scanPendingForCase('case-empty');

      expect(mockObjectStorage.get).not.toHaveBeenCalled();
    });
  });

  describe('LocalAvScanner (unit, no ClamAV binary)', () => {
    it('should be instantiable with custom path', () => {
      const scanner = new LocalAvScanner('/usr/bin/clamscan');
      expect(scanner).toBeDefined();
    });

    it('should handle missing clamscan binary gracefully', async () => {
      const scanner = new LocalAvScanner(
        '/nonexistent/path/to/clamscan',
      );

      await expect(
        scanner.scan(Buffer.from('test')),
      ).rejects.toThrow();
    });
  });
});
