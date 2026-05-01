import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { NotificationChannel } from '../types';

describe('NotificationDispatchService — multi-language template lookup', () => {
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

  describe('resolveTemplate()', () => {
    it('should resolve the most specific template (CODE_CHANNEL_LANG)', () => {
      service.registerTemplate({
        code: 'CASE_ASSIGNED_EMAIL_hi',
        subject: 'Hindi email subject',
        body: 'Hindi email body',
      });
      service.registerTemplate({
        code: 'CASE_ASSIGNED_EMAIL',
        subject: 'Email subject',
        body: 'Email body',
      });
      service.registerTemplate({
        code: 'CASE_ASSIGNED_hi',
        subject: 'Hindi subject',
        body: 'Hindi body',
      });
      service.registerTemplate({
        code: 'CASE_ASSIGNED',
        subject: 'Default subject',
        body: 'Default body',
      });

      const result = service.resolveTemplate('CASE_ASSIGNED', NotificationChannel.EMAIL, 'hi');
      expect(result).toBeDefined();
      expect(result!.code).toBe('CASE_ASSIGNED_EMAIL_hi');
    });

    it('should fall back to CODE_CHANNEL when CODE_CHANNEL_LANG is not found', () => {
      service.registerTemplate({
        code: 'CASE_ASSIGNED_EMAIL',
        subject: 'Email subject',
        body: 'Email body',
      });
      service.registerTemplate({
        code: 'CASE_ASSIGNED',
        subject: 'Default subject',
        body: 'Default body',
      });

      const result = service.resolveTemplate('CASE_ASSIGNED', NotificationChannel.EMAIL, 'fr');
      expect(result).toBeDefined();
      expect(result!.code).toBe('CASE_ASSIGNED_EMAIL');
    });

    it('should fall back to CODE_LANG when CODE_CHANNEL is not found', () => {
      service.registerTemplate({
        code: 'ALERT_hi',
        subject: 'Hindi alert',
        body: 'Hindi alert body',
      });
      service.registerTemplate({
        code: 'ALERT',
        subject: 'Alert',
        body: 'Alert body',
      });

      const result = service.resolveTemplate('ALERT', NotificationChannel.SMS, 'hi');
      expect(result).toBeDefined();
      expect(result!.code).toBe('ALERT_hi');
    });

    it('should fall back to base CODE when no specific templates exist', () => {
      // Base template already registered as default
      const result = service.resolveTemplate('CASE_ASSIGNED', NotificationChannel.IN_APP, 'ja');
      expect(result).toBeDefined();
      expect(result!.code).toBe('CASE_ASSIGNED');
    });

    it('should return undefined when no template matches at all', () => {
      const result = service.resolveTemplate('NON_EXISTENT', NotificationChannel.EMAIL);
      expect(result).toBeUndefined();
    });

    it('should work without a language parameter', () => {
      service.registerTemplate({
        code: 'SIMPLE_ALERT_SMS',
        subject: '',
        body: 'SMS alert body',
      });
      service.registerTemplate({
        code: 'SIMPLE_ALERT',
        subject: 'Alert',
        body: 'Alert body',
      });

      // Without lang, should try CODE_CHANNEL first, then CODE
      const result = service.resolveTemplate('SIMPLE_ALERT', NotificationChannel.SMS);
      expect(result).toBeDefined();
      expect(result!.code).toBe('SIMPLE_ALERT_SMS');
    });

    it('should resolve base template without lang and without channel-specific variant', () => {
      service.registerTemplate({
        code: 'BASE_ONLY',
        subject: 'Base',
        body: 'Base body',
      });

      const result = service.resolveTemplate('BASE_ONLY', NotificationChannel.PUSH);
      expect(result).toBeDefined();
      expect(result!.code).toBe('BASE_ONLY');
    });

    it('should handle SLACK channel in lookup pattern', () => {
      service.registerTemplate({
        code: 'BREACH_WARN_SLACK',
        subject: 'Slack breach',
        body: 'Breach alert via Slack',
      });

      const result = service.resolveTemplate('BREACH_WARN', NotificationChannel.SLACK);
      expect(result).toBeDefined();
      expect(result!.code).toBe('BREACH_WARN_SLACK');
    });

    it('should handle PUSH channel in lookup pattern', () => {
      service.registerTemplate({
        code: 'BREACH_WARN_PUSH_en',
        subject: 'Push breach EN',
        body: 'Breach alert via Push in English',
      });

      const result = service.resolveTemplate('BREACH_WARN', NotificationChannel.PUSH, 'en');
      expect(result).toBeDefined();
      expect(result!.code).toBe('BREACH_WARN_PUSH_en');
    });

    it('should prefer CODE_CHANNEL_LANG over CODE_LANG', () => {
      service.registerTemplate({
        code: 'NOTIFY_SMS_hi',
        subject: 'SMS Hindi',
        body: 'SMS Hindi body',
      });
      service.registerTemplate({
        code: 'NOTIFY_hi',
        subject: 'Hindi',
        body: 'Hindi body',
      });
      service.registerTemplate({
        code: 'NOTIFY',
        subject: 'Base',
        body: 'Base body',
      });

      const result = service.resolveTemplate('NOTIFY', NotificationChannel.SMS, 'hi');
      expect(result!.code).toBe('NOTIFY_SMS_hi');
    });

    it('should prefer CODE_CHANNEL over CODE_LANG', () => {
      service.registerTemplate({
        code: 'NOTIFY_EMAIL',
        subject: 'Email',
        body: 'Email body',
      });
      service.registerTemplate({
        code: 'NOTIFY_hi',
        subject: 'Hindi',
        body: 'Hindi body',
      });
      service.registerTemplate({
        code: 'NOTIFY',
        subject: 'Base',
        body: 'Base body',
      });

      const result = service.resolveTemplate('NOTIFY', NotificationChannel.EMAIL, 'hi');
      // No CODE_CHANNEL_LANG, so falls to CODE_CHANNEL
      expect(result!.code).toBe('NOTIFY_EMAIL');
    });
  });
});
