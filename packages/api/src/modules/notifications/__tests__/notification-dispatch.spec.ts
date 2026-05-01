import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  NotificationDispatchService,
  RETRY_DELAY_SCHEDULE,
  MAX_RETRY_ATTEMPTS,
} from '../services/notification-dispatch.service';
import { SmsTransport } from '../transports/sms.transport';
import { WhatsAppTransport } from '../transports/whatsapp.transport';
import { NotificationRetryProcessor, NotificationRetryJobData } from '../processors/notification-retry.processor';
import { BounceDetectorService } from '../../email-ingest/services/bounce-detector.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { NotificationChannel } from '../types';
import { RawEmail } from '../../email-ingest/types';

describe('Phase 6: Notification Channel Expansion + Channel Fallback', () => {
  let dispatchService: NotificationDispatchService;
  let smsTransport: SmsTransport;
  let whatsAppTransport: WhatsAppTransport;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRetryQueue: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let notificationLogs: any[];

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();
    notificationLogs = [];

    mockPrisma.notificationLog.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        const record = {
          id: `log-${notificationLogs.length + 1}`,
          ...data,
          created_at: new Date(),
        };
        notificationLogs.push(record);
        return Promise.resolve(record);
      },
    );

    mockPrisma.notificationLog.findMany.mockImplementation(() => {
      return Promise.resolve([...notificationLogs]);
    });

    mockPrisma.notificationLog.update.mockImplementation(
      ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entry = notificationLogs.find((l) => l.id === where.id);
        if (entry) {
          Object.assign(entry, data);
        }
        return Promise.resolve(entry || { id: where.id, ...data });
      },
    );

    mockRetryQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        SmsTransport,
        WhatsAppTransport,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('notification-retry'), useValue: mockRetryQueue },
      ],
    }).compile();

    dispatchService = module.get(NotificationDispatchService);
    smsTransport = module.get(SmsTransport);
    whatsAppTransport = module.get(WhatsAppTransport);
  });

  describe('SMS and WhatsApp Channel Stubs', () => {
    it('should include SMS and WHATSAPP in NotificationChannel enum', () => {
      expect(NotificationChannel.SMS).toBe('SMS');
      expect(NotificationChannel.WHATSAPP).toBe('WHATSAPP');
    });

    it('should send via SMS channel successfully', async () => {
      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.SMS,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      expect(result.status).toBe('SENT');
      expect(result.channel).toBe(NotificationChannel.SMS);
    });

    it('should send via WHATSAPP channel successfully', async () => {
      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.WHATSAPP,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      expect(result.status).toBe('SENT');
      expect(result.channel).toBe(NotificationChannel.WHATSAPP);
    });

    it('SmsTransport should send in stub mode when no provider URL', async () => {
      const result = await smsTransport.send('user-1', 'Test message');
      expect(result).toBe(true);
    });

    it('WhatsAppTransport should send in stub mode when no provider URL', async () => {
      const result = await whatsAppTransport.send('user-1', 'Test message');
      expect(result).toBe(true);
    });
  });

  describe('Channel Fallback Chain', () => {
    it('should fallback from EMAIL to SMS when EMAIL fails', async () => {
      // Make EMAIL channel fail
      dispatchService.setChannelSender(NotificationChannel.EMAIL, async () => false);

      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      expect(result.status).toBe('SENT');
      expect(result.channel).toBe(NotificationChannel.SMS);
    });

    it('should fallback from EMAIL to SMS to WHATSAPP when EMAIL and SMS fail', async () => {
      dispatchService.setChannelSender(NotificationChannel.EMAIL, async () => false);
      dispatchService.setChannelSender(NotificationChannel.SMS, async () => false);

      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      expect(result.status).toBe('SENT');
      expect(result.channel).toBe(NotificationChannel.WHATSAPP);
    });

    it('should fallback to IN_APP when EMAIL, SMS, and WHATSAPP all fail', async () => {
      dispatchService.setChannelSender(NotificationChannel.EMAIL, async () => false);
      dispatchService.setChannelSender(NotificationChannel.SMS, async () => false);
      dispatchService.setChannelSender(NotificationChannel.WHATSAPP, async () => false);

      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      expect(result.status).toBe('SENT');
      expect(result.channel).toBe(NotificationChannel.IN_APP);
    });

    it('should alert lead when all primary channels fail and IN_APP is used as fallback', async () => {
      dispatchService.setChannelSender(NotificationChannel.EMAIL, async () => false);
      dispatchService.setChannelSender(NotificationChannel.SMS, async () => false);
      dispatchService.setChannelSender(NotificationChannel.WHATSAPP, async () => false);

      await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      // Verify lead alert was created in notification log
      const leadAlert = notificationLogs.find(
        (log) => log.recipient === 'LEAD' && log.template_code === 'DELIVERY_FAILURE_ALERT',
      );
      expect(leadAlert).toBeDefined();
      expect(leadAlert.status).toBe('SENT');
    });

    it('should not attempt fallback when fallbackEnabled is false', async () => {
      dispatchService.setChannelSender(NotificationChannel.EMAIL, async () => false);

      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
        { fallbackEnabled: false },
      );

      expect(result.status).toBe('FAILED');
      expect(result.channel).toBe(NotificationChannel.EMAIL);
    });

    it('should log FAILED status for each channel that fails in the chain', async () => {
      dispatchService.setChannelSender(NotificationChannel.EMAIL, async () => false);
      dispatchService.setChannelSender(NotificationChannel.SMS, async () => false);

      await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      const failedLogs = notificationLogs.filter((log) => log.status === 'FAILED');
      expect(failedLogs.length).toBe(2); // EMAIL + SMS
      expect(failedLogs[0].channel).toBe(NotificationChannel.EMAIL);
      expect(failedLogs[1].channel).toBe(NotificationChannel.SMS);
    });

    it('should handle sender throwing an error and treat as failure', async () => {
      dispatchService.setChannelSender(NotificationChannel.EMAIL, async () => {
        throw new Error('SMTP connection refused');
      });

      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      // Should fallback to SMS after EMAIL throws
      expect(result.status).toBe('SENT');
      expect(result.channel).toBe(NotificationChannel.SMS);
    });
  });

  describe('Retry with Exponential Backoff', () => {
    it('should enqueue retry with correct delay for attempt 0', async () => {
      const enqueued = await dispatchService.enqueueRetry(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        { case_number: 'ATL-001' },
        0,
      );

      expect(enqueued).toBe(true);
      expect(mockRetryQueue.add).toHaveBeenCalledWith(
        'notification-retry',
        {
          recipientId: 'user-1',
          channel: NotificationChannel.EMAIL,
          templateCode: 'CASE_ASSIGNED',
          variables: { case_number: 'ATL-001' },
          attemptNumber: 1,
        },
        expect.objectContaining({
          delay: RETRY_DELAY_SCHEDULE[0], // 1 minute
        }),
      );
    });

    it('should use escalating delays for each retry attempt', async () => {
      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        mockRetryQueue.add.mockClear();

        await dispatchService.enqueueRetry(
          'user-1',
          NotificationChannel.EMAIL,
          'CASE_ASSIGNED',
          { case_number: 'ATL-001' },
          attempt,
        );

        expect(mockRetryQueue.add).toHaveBeenCalledWith(
          'notification-retry',
          expect.objectContaining({ attemptNumber: attempt + 1 }),
          expect.objectContaining({
            delay: RETRY_DELAY_SCHEDULE[attempt],
          }),
        );
      }
    });

    it('should not enqueue retry when max attempts reached', async () => {
      const enqueued = await dispatchService.enqueueRetry(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        { case_number: 'ATL-001' },
        MAX_RETRY_ATTEMPTS,
      );

      expect(enqueued).toBe(false);
      expect(mockRetryQueue.add).not.toHaveBeenCalled();
    });

    it('should return false when retry queue is not available', async () => {
      // Create a service without retry queue
      const moduleNoQueue: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationDispatchService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      const serviceNoQueue = moduleNoQueue.get(NotificationDispatchService);

      const enqueued = await serviceNoQueue.enqueueRetry(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        { case_number: 'ATL-001' },
        0,
      );

      expect(enqueued).toBe(false);
    });

    it('should have correct retry delay schedule (1m, 5m, 15m, 30m, 60m)', () => {
      expect(RETRY_DELAY_SCHEDULE).toEqual([
        60000,   // 1 minute
        300000,  // 5 minutes
        900000,  // 15 minutes
        1800000, // 30 minutes
        3600000, // 60 minutes
      ]);
    });

    it('should enforce max 5 retry attempts', () => {
      expect(MAX_RETRY_ATTEMPTS).toBe(5);
    });
  });

  describe('Notification Retry Processor', () => {
    let retryProcessor: NotificationRetryProcessor;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationRetryProcessor,
          NotificationDispatchService,
          SmsTransport,
          WhatsAppTransport,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: getQueueToken('notification-retry'), useValue: mockRetryQueue },
        ],
      }).compile();

      retryProcessor = module.get(NotificationRetryProcessor);
      dispatchService = module.get(NotificationDispatchService);
    });

    it('should process a retry job and send successfully', async () => {
      const mockJob = {
        id: 'job-1',
        data: {
          recipientId: 'user-1',
          channel: NotificationChannel.EMAIL,
          templateCode: 'CASE_ASSIGNED',
          variables: {
            case_number: 'ATL-2026-000001',
            fpr_name: 'Amit Sharma',
            priority: 'HIGH',
          },
          attemptNumber: 1,
        } as NotificationRetryJobData,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await retryProcessor.process(mockJob as any);

      // Should have logged a sent notification
      const sentLogs = notificationLogs.filter((l) => l.status === 'SENT');
      expect(sentLogs.length).toBeGreaterThan(0);
    });

    it('should enqueue next retry when send fails', async () => {
      // Make all channels fail
      dispatchService.setChannelSender(NotificationChannel.EMAIL, async () => false);
      dispatchService.setChannelSender(NotificationChannel.SMS, async () => false);
      dispatchService.setChannelSender(NotificationChannel.WHATSAPP, async () => false);
      dispatchService.setChannelSender(NotificationChannel.IN_APP, async () => false);

      const mockJob = {
        id: 'job-2',
        data: {
          recipientId: 'user-1',
          channel: NotificationChannel.EMAIL,
          templateCode: 'CASE_ASSIGNED',
          variables: {
            case_number: 'ATL-2026-000001',
            fpr_name: 'Amit Sharma',
            priority: 'HIGH',
          },
          attemptNumber: 1,
        } as NotificationRetryJobData,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await retryProcessor.process(mockJob as any);

      // Should have enqueued next retry
      expect(mockRetryQueue.add).toHaveBeenCalled();
    });

    it('should not retry when max attempts exceeded', async () => {
      const mockJob = {
        id: 'job-3',
        data: {
          recipientId: 'user-1',
          channel: NotificationChannel.EMAIL,
          templateCode: 'CASE_ASSIGNED',
          variables: { case_number: 'ATL-001' },
          attemptNumber: MAX_RETRY_ATTEMPTS + 1,
        } as NotificationRetryJobData,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await retryProcessor.process(mockJob as any);

      // Should NOT have called add on the retry queue
      expect(mockRetryQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('NDR/Bounce Detection', () => {
    let bounceDetector: BounceDetectorService;

    beforeEach(() => {
      bounceDetector = new BounceDetectorService(dispatchService);
    });

    function createNdrEmail(overrides: Partial<RawEmail> = {}): RawEmail {
      return {
        messageId: 'ndr-001@mail.example.com',
        from: 'mailer-daemon@example.com',
        to: ['inbox@atlas.example.com'],
        cc: [],
        subject: 'Delivery Status Notification (Failure)',
        bodyText: 'The following message was undeliverable.',
        receivedAt: new Date(),
        headers: {},
        attachments: [],
        ...overrides,
      };
    }

    it('should detect NDR by X-Failed-Recipients header', () => {
      const email = createNdrEmail({
        subject: 'Re: Some subject',
        headers: {
          'x-failed-recipients': 'user@example.com',
        },
      });

      expect(bounceDetector.isBounce(email)).toBe(true);
    });

    it('should detect NDR by subject containing "Delivery Status Notification"', () => {
      const email = createNdrEmail({
        subject: 'Delivery Status Notification (Failure)',
        headers: {},
      });

      expect(bounceDetector.isBounce(email)).toBe(true);
    });

    it('should detect NDR by subject containing "Undeliverable"', () => {
      const email = createNdrEmail({
        subject: 'Undeliverable: Case ATL-2026-000001 assigned to you',
        headers: {},
      });

      expect(bounceDetector.isBounce(email)).toBe(true);
    });

    it('should detect NDR by subject containing "Mail delivery failed"', () => {
      const email = createNdrEmail({
        subject: 'Mail delivery failed: returning message to sender',
        headers: {},
      });

      expect(bounceDetector.isBounce(email)).toBe(true);
    });

    it('should detect NDR by DSN content in body', () => {
      const email = createNdrEmail({
        subject: 'Some bounce report',
        bodyText: 'Action: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp;550 User not found',
        headers: {},
      });

      expect(bounceDetector.isBounce(email)).toBe(true);
    });

    it('should not detect normal email as bounce', () => {
      const email = createNdrEmail({
        subject: 'Re: Case ATL-2026-000001 inquiry',
        bodyText: 'Thank you for your response.',
        headers: {},
      });

      expect(bounceDetector.isBounce(email)).toBe(false);
    });

    it('should extract failed recipient from X-Failed-Recipients header', () => {
      const email = createNdrEmail({
        headers: {
          'x-failed-recipients': 'user@example.com',
        },
      });

      expect(bounceDetector.extractFailedRecipient(email)).toBe('user@example.com');
    });

    it('should extract failed recipient from body', () => {
      const email = createNdrEmail({
        bodyText: 'Final-Recipient: rfc822; user@example.com\nAction: failed',
        headers: {},
      });

      expect(bounceDetector.extractFailedRecipient(email)).toBe('user@example.com');
    });

    it('should extract original subject from "Undeliverable:" prefix', () => {
      const email = createNdrEmail({
        subject: 'Undeliverable: Case ATL-2026-000001 assigned to you',
      });

      expect(bounceDetector.extractOriginalSubject(email)).toBe(
        'Case ATL-2026-000001 assigned to you',
      );
    });

    it('should process bounce and trigger handleBounce on dispatch service', async () => {
      const handleBounceSpy = jest.spyOn(dispatchService, 'handleBounce').mockResolvedValue(null);

      const email = createNdrEmail({
        subject: 'Undeliverable: Case ATL-2026-000001 assigned to you',
        headers: {
          'x-failed-recipients': 'user@example.com',
        },
      });

      const result = await bounceDetector.processBounce(email);

      expect(result.handled).toBe(true);
      expect(result.failedRecipient).toBe('user@example.com');
      expect(handleBounceSpy).toHaveBeenCalledWith(
        'user@example.com',
        'Case ATL-2026-000001 assigned to you',
      );

      handleBounceSpy.mockRestore();
    });

    it('should handle bounce and update notification log to BOUNCED', async () => {
      // First send a notification
      await dispatchService.send(
        'user@example.com',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      // Mock findMany to return log entries matching the recipient
      const sentLogs = notificationLogs.filter(
        (l) => l.recipient === 'user@example.com' && l.status === 'SENT',
      );
      mockPrisma.notificationLog.findMany.mockResolvedValue(sentLogs);

      await dispatchService.handleBounce(
        'user@example.com',
        'Case ATL-2026-000001 assigned to you',
      );

      // Verify update was called with BOUNCED status
      expect(mockPrisma.notificationLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'BOUNCED' },
        }),
      );
    });

    it('should return not handled for non-bounce emails', async () => {
      const email = createNdrEmail({
        subject: 'Regular email subject',
        bodyText: 'This is a normal email.',
        headers: {},
      });

      const result = await bounceDetector.processBounce(email);

      expect(result.handled).toBe(false);
    });
  });

  describe('Existing functionality preserved', () => {
    it('should still render templates correctly', async () => {
      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      expect(result.status).toBe('SENT');
      expect(result.renderedSubject).toBe('Case ATL-2026-000001 assigned to you');
      expect(result.renderedBody).toBe(
        'Dear Amit Sharma, case ATL-2026-000001 has been assigned to you. Priority: HIGH.',
      );
    });

    it('should still deduplicate within dedup window', async () => {
      const variables = {
        case_number: 'ATL-2026-000001',
        fpr_name: 'Amit Sharma',
        priority: 'HIGH',
      };

      const first = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        variables,
      );
      const second = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        variables,
      );

      expect(first.status).toBe('SENT');
      expect(second.status).toBe('SUPPRESSED');
    });

    it('should throw for unknown template', async () => {
      await expect(
        dispatchService.send(
          'user-1',
          NotificationChannel.EMAIL,
          'NONEXISTENT_TEMPLATE',
          {},
        ),
      ).rejects.toThrow('Template not found: NONEXISTENT_TEMPLATE');
    });
  });
});
