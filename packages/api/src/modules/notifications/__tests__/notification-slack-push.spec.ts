import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { NotificationChannel } from '../types';

describe('NotificationDispatchService — SLACK + PUSH channels', () => {
  let service: NotificationDispatchService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      notificationLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      caseActivityLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    service = new NotificationDispatchService(mockPrisma);
  });

  describe('SLACK channel', () => {
    it('should have SLACK channel in NotificationChannel enum', () => {
      expect(NotificationChannel.SLACK).toBe('SLACK');
    });

    it('should successfully send a notification via SLACK channel', async () => {
      service.registerTemplate({
        code: 'TEST_TEMPLATE',
        subject: 'Test Subject',
        body: 'Test body for {{recipient}}',
      });

      const result = await service.send(
        'user-1',
        NotificationChannel.SLACK,
        'TEST_TEMPLATE',
        { recipient: 'User 1' },
        { fallbackEnabled: false },
      );

      expect(result.status).toBe('SENT');
      expect(result.channel).toBe(NotificationChannel.SLACK);
    });

    it('should support custom SLACK sender override', async () => {
      let slackSendCalled = false;
      service.setChannelSender(NotificationChannel.SLACK, async (_r, _s, _b) => {
        slackSendCalled = true;
        return true;
      });

      service.registerTemplate({
        code: 'SLACK_TEST',
        subject: 'Slack',
        body: 'Hello {{name}}',
      });

      await service.send(
        'user-1',
        NotificationChannel.SLACK,
        'SLACK_TEST',
        { name: 'World' },
        { fallbackEnabled: false },
      );

      expect(slackSendCalled).toBe(true);
    });

    it('should handle SLACK send failure', async () => {
      service.setChannelSender(NotificationChannel.SLACK, async () => false);

      service.registerTemplate({
        code: 'FAIL_TEST',
        subject: '',
        body: 'Test',
      });

      const result = await service.send(
        'user-1',
        NotificationChannel.SLACK,
        'FAIL_TEST',
        {},
        { fallbackEnabled: false },
      );

      expect(result.status).toBe('FAILED');
    });
  });

  describe('PUSH channel', () => {
    it('should have PUSH channel in NotificationChannel enum', () => {
      expect(NotificationChannel.PUSH).toBe('PUSH');
    });

    it('should successfully send a notification via PUSH channel', async () => {
      service.registerTemplate({
        code: 'TEST_TEMPLATE',
        subject: 'Test Subject',
        body: 'Test body for {{recipient}}',
      });

      const result = await service.send(
        'user-1',
        NotificationChannel.PUSH,
        'TEST_TEMPLATE',
        { recipient: 'User 1' },
        { fallbackEnabled: false },
      );

      expect(result.status).toBe('SENT');
      expect(result.channel).toBe(NotificationChannel.PUSH);
    });

    it('should support custom PUSH sender override', async () => {
      let pushSendCalled = false;
      service.setChannelSender(NotificationChannel.PUSH, async (_r, _s, _b) => {
        pushSendCalled = true;
        return true;
      });

      service.registerTemplate({
        code: 'PUSH_TEST',
        subject: 'Push',
        body: 'Hello {{name}}',
      });

      await service.send(
        'user-1',
        NotificationChannel.PUSH,
        'PUSH_TEST',
        { name: 'World' },
        { fallbackEnabled: false },
      );

      expect(pushSendCalled).toBe(true);
    });

    it('should handle PUSH send failure', async () => {
      service.setChannelSender(NotificationChannel.PUSH, async () => false);

      service.registerTemplate({
        code: 'FAIL_TEST',
        subject: '',
        body: 'Test',
      });

      const result = await service.send(
        'user-1',
        NotificationChannel.PUSH,
        'FAIL_TEST',
        {},
        { fallbackEnabled: false },
      );

      expect(result.status).toBe('FAILED');
    });
  });

  describe('both SLACK and PUSH together', () => {
    it('should send same notification to both SLACK and PUSH channels', async () => {
      service.registerTemplate({
        code: 'MULTI_CHANNEL',
        subject: 'Alert: {{title}}',
        body: 'Details: {{details}}',
      });

      const variables = { title: 'SLA Breach', details: 'Case C-001' };

      const slackResult = await service.send(
        'user-1',
        NotificationChannel.SLACK,
        'MULTI_CHANNEL',
        variables,
        { fallbackEnabled: false, skipDedup: true },
      );

      const pushResult = await service.send(
        'user-1',
        NotificationChannel.PUSH,
        'MULTI_CHANNEL',
        variables,
        { fallbackEnabled: false, skipDedup: true },
      );

      expect(slackResult.status).toBe('SENT');
      expect(pushResult.status).toBe('SENT');
      expect(slackResult.channel).toBe(NotificationChannel.SLACK);
      expect(pushResult.channel).toBe(NotificationChannel.PUSH);
    });
  });
});
