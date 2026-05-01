import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EmailIngestController } from '../controllers/email-ingest.controller';
import { EmailIngestService } from '../email-ingest.service';
import { IntakeProcessor } from '../processors/intake.processor';
import { AvScanProcessor } from '../processors/av-scan.processor';
import { IntakeOrchestratorService } from '../services/intake-orchestrator.service';
import { AttachmentService } from '../services/attachment.service';
import { AvScannerService } from '../services/av-scanner.service';
import { ObjectStorageService } from '../../../common/services/object-storage.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

/**
 * Creates a mock BullMQ Queue that records enqueued jobs in-memory.
 * No Redis connection required.
 */
function createMockQueue() {
  const jobs: Array<{ name: string; data: unknown; opts?: unknown }> = [];
  return {
    add: jest.fn().mockImplementation((name: string, data: unknown, opts?: unknown) => {
      const job = { id: `mock-job-${jobs.length + 1}`, name, data, opts };
      jobs.push(job);
      return Promise.resolve(job);
    }),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
    getJobs: jest.fn().mockResolvedValue([]),
    jobs,
  };
}

describe('BullMQ Queue Infrastructure (Phase 2)', () => {
  describe('Intake Queue — EmailIngestController', () => {
    let controller: EmailIngestController;
    let mockIntakeQueue: ReturnType<typeof createMockQueue>;
    let mockEmailIngestService: Partial<EmailIngestService>;

    beforeEach(async () => {
      mockIntakeQueue = createMockQueue();
      mockEmailIngestService = {
        ingest: jest.fn().mockResolvedValue({
          id: 'ingest-1',
          messageId: '<test@test.com>',
          ingestStatus: 'RECEIVED',
        }),
        findByMessageId: jest.fn().mockResolvedValue(null),
        getRecords: jest.fn().mockResolvedValue([]),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [EmailIngestController],
        providers: [
          { provide: EmailIngestService, useValue: mockEmailIngestService },
          { provide: getQueueToken('intake'), useValue: mockIntakeQueue },
        ],
      }).compile();

      controller = module.get<EmailIngestController>(EmailIngestController);
    });

    it('should enqueue an intake job when processIngest is called', async () => {
      const result = await controller.processIngest('ingest-123');

      expect(mockIntakeQueue.add).toHaveBeenCalledTimes(1);
      expect(mockIntakeQueue.add).toHaveBeenCalledWith('process', { ingestId: 'ingest-123' });
      expect(result.data.jobId).toBe('mock-job-1');
      expect(result.data.ingestId).toBe('ingest-123');
      expect(result.message).toContain('enqueued');
    });

    it('should enqueue multiple intake jobs with unique job IDs', async () => {
      await controller.processIngest('ingest-1');
      await controller.processIngest('ingest-2');

      expect(mockIntakeQueue.add).toHaveBeenCalledTimes(2);
      expect(mockIntakeQueue.jobs).toHaveLength(2);
      expect(mockIntakeQueue.jobs[0].data).toEqual({ ingestId: 'ingest-1' });
      expect(mockIntakeQueue.jobs[1].data).toEqual({ ingestId: 'ingest-2' });
    });
  });

  describe('Intake Processor', () => {
    let processor: IntakeProcessor;
    let mockOrchestrator: Partial<IntakeOrchestratorService>;

    beforeEach(async () => {
      mockOrchestrator = {
        orchestrate: jest.fn().mockResolvedValue({
          ingestId: 'ingest-1',
          classification: { top_label: 'GENERAL_INQUIRY', confidence_band: 'GREEN' },
          caseRecord: { caseNumber: 'ATL-2025-000001' },
          requiresTriage: false,
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          IntakeProcessor,
          { provide: IntakeOrchestratorService, useValue: mockOrchestrator },
        ],
      }).compile();

      processor = module.get<IntakeProcessor>(IntakeProcessor);
    });

    it('should call orchestrate with the ingestId from job data', async () => {
      const mockJob = { id: 'job-1', data: { ingestId: 'ingest-abc' } } as any;
      await processor.process(mockJob);

      expect(mockOrchestrator.orchestrate).toHaveBeenCalledWith('ingest-abc');
    });

    it('should propagate errors from orchestrate', async () => {
      (mockOrchestrator.orchestrate as jest.Mock).mockRejectedValue(
        new Error('Classification failed'),
      );

      const mockJob = { id: 'job-2', data: { ingestId: 'ingest-fail' } } as any;
      await expect(processor.process(mockJob)).rejects.toThrow('Classification failed');
    });
  });

  describe('AV Scan Processor', () => {
    let processor: AvScanProcessor;
    let mockAvScanner: Partial<AvScannerService>;

    beforeEach(async () => {
      mockAvScanner = {
        scanAttachment: jest.fn().mockResolvedValue({ clean: true, verdict: 'CLEAN' }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AvScanProcessor,
          { provide: AvScannerService, useValue: mockAvScanner },
        ],
      }).compile();

      processor = module.get<AvScanProcessor>(AvScanProcessor);
    });

    it('should call scanAttachment with the attachmentId from job data', async () => {
      const mockJob = {
        id: 'av-job-1',
        data: { attachmentId: 'att-1', s3Key: 'attachments/test.pdf' },
      } as any;

      await processor.process(mockJob);

      expect(mockAvScanner.scanAttachment).toHaveBeenCalledWith('att-1', expect.any(Buffer));
    });

    it('should propagate errors from scanAttachment', async () => {
      (mockAvScanner.scanAttachment as jest.Mock).mockRejectedValue(
        new Error('Scan engine unavailable'),
      );

      const mockJob = {
        id: 'av-job-2',
        data: { attachmentId: 'att-fail', s3Key: 'attachments/bad.pdf' },
      } as any;

      await expect(processor.process(mockJob)).rejects.toThrow('Scan engine unavailable');
    });
  });

  describe('AttachmentService — AV scan queue enqueue', () => {
    let attachmentService: AttachmentService;
    let mockAvScanQueue: ReturnType<typeof createMockQueue>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockPrisma: any;

    beforeEach(async () => {
      mockAvScanQueue = createMockQueue();
      mockPrisma = createMockPrismaService();

      // Setup prisma mocks for storeAttachment
      mockPrisma.caseAttachment.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.case.findUnique.mockResolvedValue({ case_number: 'ATL-2025-000001' });
      mockPrisma.caseAttachment.create.mockResolvedValue({
        id: 'att-new-1',
        case_id: 'case-1',
        filename: 'test.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        s3_key: 'attachments/ATL-2025-000001/test.pdf',
        checksum_sha256: 'abc123',
        av_scan_status: 'PENDING',
      });

      const mockObjectStorage = {
        generateAttachmentKey: jest.fn().mockReturnValue('attachments/ATL-2025-000001/test.pdf'),
        put: jest.fn().mockResolvedValue(undefined),
        getSignedUrl: jest.fn().mockResolvedValue('https://signed-url'),
      };

      const mockAvScanner = {
        scanAttachment: jest.fn().mockResolvedValue({ clean: true, verdict: 'CLEAN' }),
        scanPendingForCase: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AttachmentService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ObjectStorageService, useValue: mockObjectStorage },
          { provide: AvScannerService, useValue: mockAvScanner },
          { provide: getQueueToken('av-scan'), useValue: mockAvScanQueue },
        ],
      }).compile();

      attachmentService = module.get<AttachmentService>(AttachmentService);
    });

    it('should enqueue an AV scan job after storing an attachment', async () => {
      const result = await attachmentService.storeAttachment('case-1', {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        content: Buffer.from('test pdf content'),
      });

      expect(result).not.toBeNull();
      expect(mockAvScanQueue.add).toHaveBeenCalledTimes(1);
      expect(mockAvScanQueue.add).toHaveBeenCalledWith('scan', {
        attachmentId: 'att-new-1',
        s3Key: 'attachments/ATL-2025-000001/test.pdf',
      });
    });

    it('should not enqueue an AV scan job for duplicate attachments', async () => {
      // Make findFirst return an existing record (duplicate)
      mockPrisma.caseAttachment.findFirst.mockResolvedValue({
        id: 'att-existing',
        checksum_sha256: 'some-hash',
      });

      const result = await attachmentService.storeAttachment('case-1', {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        content: Buffer.from('test pdf content'),
      });

      expect(result).toBeNull();
      expect(mockAvScanQueue.add).not.toHaveBeenCalled();
    });
  });
});
