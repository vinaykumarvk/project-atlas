import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BreachNotificationService } from '../services/breach-notification.service';
import { BreachNotificationProcessor } from '../processors/breach-notification.processor';

describe('BreachNotificationService', () => {
  let service: BreachNotificationService;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      getJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreachNotificationService,
        { provide: getQueueToken('breach-notification'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(BreachNotificationService);
  });

  it('should start a breach window with 72h delay', async () => {
    const jobId = await service.startBreachWindow('case-1', 'DATA_BREACH');
    expect(jobId).toBe('job-123');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'breach-deadline',
      expect.objectContaining({ caseId: 'case-1', breachType: 'DATA_BREACH' }),
      expect.objectContaining({ delay: 72 * 60 * 60 * 1000 }),
    );
  });

  it('should cancel a delayed breach window', async () => {
    mockQueue.getJob.mockResolvedValue({ isDelayed: () => true, remove: jest.fn() });
    const result = await service.cancelBreachWindow('job-123');
    expect(result).toBe(true);
  });

  it('should return false when cancelling non-existent job', async () => {
    mockQueue.getJob.mockResolvedValue(null);
    const result = await service.cancelBreachWindow('job-999');
    expect(result).toBe(false);
  });

  it('should return false when job is not delayed', async () => {
    mockQueue.getJob.mockResolvedValue({ isDelayed: () => false });
    const result = await service.cancelBreachWindow('job-456');
    expect(result).toBe(false);
  });

  it('should dispatch notification on deadline reached', async () => {
    const mockNotification = { send: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreachNotificationService,
        { provide: getQueueToken('breach-notification'), useValue: mockQueue },
        { provide: 'NotificationDispatchService', useValue: mockNotification },
      ],
    }).compile();

    // Re-create with notification service injected manually
    const svc = new (BreachNotificationService as any)(mockQueue, mockNotification);
    await svc.onBreachDeadlineReached('case-1', 'DATA_BREACH');
    expect(mockNotification.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'BREACH_NOTIFICATION_72H' }),
    );
  });
});

describe('BreachNotificationProcessor', () => {
  it('should call onBreachDeadlineReached when processing job', async () => {
    const mockService = { onBreachDeadlineReached: jest.fn().mockResolvedValue(undefined) };
    const processor = new BreachNotificationProcessor(mockService as any);
    await processor.process({ id: 'job-1', data: { caseId: 'case-1', breachType: 'DATA_BREACH', startedAt: '2024-01-01' } } as any);
    expect(mockService.onBreachDeadlineReached).toHaveBeenCalledWith('case-1', 'DATA_BREACH');
  });
});
