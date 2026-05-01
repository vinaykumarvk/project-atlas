import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EscalationSweepProcessor } from '../processors/escalation-sweep.processor';
import { EscalationService } from '../services/escalation.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { CaseStatus } from '../../cases/types';

/**
 * Creates a mock BullMQ Queue for testing.
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
    jobs,
  };
}

describe('EscalationSweepProcessor', () => {
  let processor: EscalationSweepProcessor;
  let mockEscalationService: Partial<EscalationService>;
  let mockSweepQueue: ReturnType<typeof createMockQueue>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockSweepQueue = createMockQueue();
    mockPrisma = createMockPrismaService();
    mockEscalationService = {
      checkAndEscalate: jest.fn().mockReturnValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationSweepProcessor,
        { provide: getQueueToken('escalation-sweep'), useValue: mockSweepQueue },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EscalationService, useValue: mockEscalationService },
      ],
    }).compile();

    processor = module.get<EscalationSweepProcessor>(EscalationSweepProcessor);
  });

  describe('onModuleInit', () => {
    it('should register a repeatable job every 5 minutes', async () => {
      await processor.onModuleInit();

      expect(mockSweepQueue.add).toHaveBeenCalledWith(
        'sweep',
        {},
        {
          repeat: {
            every: 5 * 60 * 1000,
          },
        },
      );
    });

    it('should clean up existing repeatable jobs before registering', async () => {
      mockSweepQueue.getRepeatableJobs.mockResolvedValue([
        { key: 'old-key-1' },
        { key: 'old-key-2' },
      ]);

      await processor.onModuleInit();

      expect(mockSweepQueue.removeRepeatableByKey).toHaveBeenCalledTimes(2);
      expect(mockSweepQueue.removeRepeatableByKey).toHaveBeenCalledWith('old-key-1');
      expect(mockSweepQueue.removeRepeatableByKey).toHaveBeenCalledWith('old-key-2');
    });
  });

  describe('process', () => {
    it('should query open cases and call checkAndEscalate for each', async () => {
      // Mock DB records matching the Case model schema
      const openCases = [
        {
          id: 'case-1',
          case_number: 'ATL-2025-000001',
          email_ingest_id: 'ingest-1',
          status: CaseStatus.IN_PROGRESS,
          case_type: 'GENERAL_INQUIRY',
          priority: 'MEDIUM',
          assigned_fpr_id: 'fpr-1',
          confidence_band: 'GREEN',
          tat_target_at: new Date('2025-01-07T04:00:00Z'),
          created_at: new Date('2025-01-06T05:00:00Z'),
          updated_at: new Date('2025-01-06T05:00:00Z'),
        },
        {
          id: 'case-2',
          case_number: 'ATL-2025-000002',
          email_ingest_id: 'ingest-2',
          status: CaseStatus.AWAITING_FPR,
          case_type: 'VALUATION_REQUEST',
          priority: 'HIGH',
          assigned_fpr_id: null,
          confidence_band: 'AMBER',
          tat_target_at: new Date('2025-01-08T04:00:00Z'),
          created_at: new Date('2025-01-06T05:00:00Z'),
          updated_at: new Date('2025-01-06T05:00:00Z'),
        },
      ];

      mockPrisma.case.findMany.mockResolvedValue(openCases);

      const mockJob = { id: 'sweep-job-1' } as any;
      await processor.process(mockJob);

      expect(mockPrisma.case.findMany).toHaveBeenCalledWith({
        where: {
          status: {
            notIn: [CaseStatus.CLOSED, CaseStatus.CANCELLED],
          },
        },
      });
      expect(mockEscalationService.checkAndEscalate).toHaveBeenCalledTimes(2);
    });

    it('should handle no open cases gracefully', async () => {
      mockPrisma.case.findMany.mockResolvedValue([]);

      const mockJob = { id: 'sweep-job-2' } as any;
      await processor.process(mockJob);

      expect(mockEscalationService.checkAndEscalate).not.toHaveBeenCalled();
    });

    it('should propagate errors from prisma queries', async () => {
      mockPrisma.case.findMany.mockRejectedValue(new Error('Database connection lost'));

      const mockJob = { id: 'sweep-job-3' } as any;
      await expect(processor.process(mockJob)).rejects.toThrow('Database connection lost');
    });
  });
});
