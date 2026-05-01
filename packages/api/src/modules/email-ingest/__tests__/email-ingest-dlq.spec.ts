import { EmailIngestService } from '../email-ingest.service';

describe('EmailIngestService — DLQ config and replayFailedJobs', () => {
  describe('DLQ_CONFIG', () => {
    it('should have maxRetries of 3', () => {
      expect(EmailIngestService.DLQ_CONFIG.maxRetries).toBe(3);
    });

    it('should have exponential backoff type', () => {
      expect(EmailIngestService.DLQ_CONFIG.backoffType).toBe('exponential');
    });

    it('should have backoff delay of 5000ms', () => {
      expect(EmailIngestService.DLQ_CONFIG.backoffDelay).toBe(5000);
    });

    it('should be a static readonly configuration', () => {
      expect(EmailIngestService.DLQ_CONFIG).toBeDefined();
      expect(typeof EmailIngestService.DLQ_CONFIG).toBe('object');
    });
  });

  describe('replayFailedJobs()', () => {
    it('should return empty result when DLQ queue is not available', async () => {
      const mockPrisma = {} as any;
      const mockSpam = {} as any;
      const mockThread = {} as any;
      const mockLanguage = {} as any;
      const mockEncryption = {} as any;
      const mockStorage = {} as any;

      const service = new EmailIngestService(
        mockPrisma,
        mockSpam,
        mockThread,
        mockLanguage,
        mockEncryption,
        mockStorage,
        undefined, // no bounceDetector
        undefined, // no dlqQueue
      );

      const result = await service.replayFailedJobs();
      expect(result.replayed).toBe(0);
      expect(result.failed).toEqual([]);
    });

    it('should replay failed jobs from the DLQ queue', async () => {
      const mockJobs = [
        { id: 'job-1', retry: jest.fn().mockResolvedValue(undefined) },
        { id: 'job-2', retry: jest.fn().mockResolvedValue(undefined) },
        { id: 'job-3', retry: jest.fn().mockResolvedValue(undefined) },
      ];

      const mockDlqQueue = {
        getFailed: jest.fn().mockResolvedValue(mockJobs),
      };

      const mockPrisma = {} as any;
      const mockSpam = {} as any;
      const mockThread = {} as any;
      const mockLanguage = {} as any;
      const mockEncryption = {} as any;
      const mockStorage = {} as any;

      const service = new EmailIngestService(
        mockPrisma,
        mockSpam,
        mockThread,
        mockLanguage,
        mockEncryption,
        mockStorage,
        undefined,
        mockDlqQueue as any,
      );

      const result = await service.replayFailedJobs();
      expect(result.replayed).toBe(3);
      expect(result.failed).toEqual([]);
      expect(mockDlqQueue.getFailed).toHaveBeenCalledWith(0, 100);
    });

    it('should track jobs that fail to replay', async () => {
      const mockJobs = [
        { id: 'job-1', retry: jest.fn().mockResolvedValue(undefined) },
        { id: 'job-2', retry: jest.fn().mockRejectedValue(new Error('Retry failed')) },
        { id: 'job-3', retry: jest.fn().mockResolvedValue(undefined) },
      ];

      const mockDlqQueue = {
        getFailed: jest.fn().mockResolvedValue(mockJobs),
      };

      const mockPrisma = {} as any;
      const mockSpam = {} as any;
      const mockThread = {} as any;
      const mockLanguage = {} as any;
      const mockEncryption = {} as any;
      const mockStorage = {} as any;

      const service = new EmailIngestService(
        mockPrisma,
        mockSpam,
        mockThread,
        mockLanguage,
        mockEncryption,
        mockStorage,
        undefined,
        mockDlqQueue as any,
      );

      const result = await service.replayFailedJobs();
      expect(result.replayed).toBe(2);
      expect(result.failed).toEqual(['job-2']);
    });

    it('should respect the limit parameter', async () => {
      const mockDlqQueue = {
        getFailed: jest.fn().mockResolvedValue([]),
      };

      const mockPrisma = {} as any;
      const mockSpam = {} as any;
      const mockThread = {} as any;
      const mockLanguage = {} as any;
      const mockEncryption = {} as any;
      const mockStorage = {} as any;

      const service = new EmailIngestService(
        mockPrisma,
        mockSpam,
        mockThread,
        mockLanguage,
        mockEncryption,
        mockStorage,
        undefined,
        mockDlqQueue as any,
      );

      await service.replayFailedJobs(50);
      expect(mockDlqQueue.getFailed).toHaveBeenCalledWith(0, 50);
    });

    it('should handle empty failed jobs list', async () => {
      const mockDlqQueue = {
        getFailed: jest.fn().mockResolvedValue([]),
      };

      const mockPrisma = {} as any;
      const mockSpam = {} as any;
      const mockThread = {} as any;
      const mockLanguage = {} as any;
      const mockEncryption = {} as any;
      const mockStorage = {} as any;

      const service = new EmailIngestService(
        mockPrisma,
        mockSpam,
        mockThread,
        mockLanguage,
        mockEncryption,
        mockStorage,
        undefined,
        mockDlqQueue as any,
      );

      const result = await service.replayFailedJobs();
      expect(result.replayed).toBe(0);
      expect(result.failed).toEqual([]);
    });
  });
});
