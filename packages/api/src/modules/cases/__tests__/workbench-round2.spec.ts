import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CasesController } from '../controllers/cases.controller';
import { CaseCreationService } from '../services/case-creation.service';
import { CollateralRiskService } from '../services/collateral-risk.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { NotificationsController } from '../../notifications/controllers/notifications.controller';
import { NotificationChannel } from '../../notifications/types';

/**
 * Build a mock authenticated request.
 */
function mockReq(overrides: Partial<{ sub: string; email: string; roles: string[] }> = {}) {
  return {
    user: {
      sub: overrides.sub ?? 'user-1',
      email: overrides.email ?? 'admin@atlas.dev',
      roles: overrides.roles ?? ['SYS_ADMIN'],
    },
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Workbench Round 2 — API Enhancements', () => {
  let casesController: CasesController;
  let notificationsController: NotificationsController;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let mockNotificationService: {
    send: jest.Mock;
    registerTemplate: jest.Mock;
    getLog: jest.Mock;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activityLogs: any[] = [];

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();
    activityLogs.length = 0;

    // Track activity log entries
    mockPrisma.caseActivityLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const log = { id: `log-${activityLogs.length + 1}`, ...data, created_at: new Date() };
      activityLogs.push(log);
      return Promise.resolve(log);
    });

    // Mock notification dispatch service
    mockNotificationService = {
      send: jest.fn().mockResolvedValue({
        id: 'notif-1',
        recipientId: 'user-1',
        channel: NotificationChannel.IN_APP,
        templateCode: 'NOTE_MENTION',
        variables: {},
        renderedSubject: 'Test',
        renderedBody: 'Test body',
        sentAt: new Date(),
        status: 'SENT',
      }),
      registerTemplate: jest.fn(),
      getLog: jest.fn().mockResolvedValue([]),
    };

    // Build controllers manually with constructor injection
    casesController = new CasesController(
      {} as CaseCreationService,
      {} as CollateralRiskService,
      mockPrisma as PrismaService,
      mockNotificationService as unknown as NotificationDispatchService,
    );

    notificationsController = new NotificationsController(
      mockNotificationService as unknown as NotificationDispatchService,
      {} as any,
      mockPrisma as PrismaService,
    );
  });

  // -----------------------------------------------------------------------
  // FR-054 A2: @mention parsing in notes
  // -----------------------------------------------------------------------

  describe('@mention parsing in notes (FR-054 A2)', () => {
    it('should parse @username patterns from note text', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-1',
        case_number: 'ATL-2026-000001',
      });

      // Mock user lookup
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-john', email: 'john@atlas.dev', name: 'John Smith' },
      ]);

      const result = await casesController.addNote(
        'case-1',
        { note: 'Please review this @john' },
        mockReq() as any,
      );

      expect(result.data.mentions).toBeDefined();
      expect(result.data.mentions).toContain('john');
    });

    it('should parse multiple @mentions from note text', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-1',
        case_number: 'ATL-2026-000001',
      });

      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'alice@atlas.dev', name: 'Alice' },
      ]);

      const result = await casesController.addNote(
        'case-1',
        { note: 'Hey @alice and @bob, please review' },
        mockReq() as any,
      );

      expect(result.data.mentions).toEqual(['alice', 'bob']);
    });

    it('should send IN_APP and EMAIL notifications for matched @mentions', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-1',
        case_number: 'ATL-2026-000001',
      });

      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-john', email: 'john@atlas.dev', name: 'John Smith' },
      ]);

      await casesController.addNote(
        'case-1',
        { note: 'Please check @john' },
        mockReq() as any,
      );

      // Should have registered the mention template
      expect(mockNotificationService.registerTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NOTE_MENTION' }),
      );

      // Should have sent IN_APP + EMAIL notifications (2 calls for 1 user)
      expect(mockNotificationService.send).toHaveBeenCalledTimes(2);

      // First call: IN_APP
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        'user-john',
        NotificationChannel.IN_APP,
        'NOTE_MENTION',
        expect.objectContaining({ case_number: 'ATL-2026-000001' }),
        expect.objectContaining({ fallbackEnabled: false }),
      );

      // Second call: EMAIL
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        'user-john',
        NotificationChannel.EMAIL,
        'NOTE_MENTION',
        expect.objectContaining({ case_number: 'ATL-2026-000001' }),
        expect.objectContaining({ fallbackEnabled: false }),
      );
    });

    it('should return empty mentions when note has no @patterns', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-1',
        case_number: 'ATL-2026-000001',
      });

      const result = await casesController.addNote(
        'case-1',
        { note: 'A simple note with no mentions' },
        mockReq() as any,
      );

      expect(result.data.mentions).toEqual([]);
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockPrisma.case.findUnique.mockResolvedValue(null);

      await expect(
        casesController.addNote('non-existent', { note: 'test @user' }, mockReq() as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // FR-032 A3: Vendor officer override
  // -----------------------------------------------------------------------

  describe('Vendor officer override (FR-032 A3)', () => {
    it('should update vendor assignment and log activity', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-1',
        assigned_vendor_id: 'vendor-old',
      });

      const result = await casesController.overrideVendor(
        'case-1',
        { vendor_id: 'vendor-new' },
        mockReq() as any,
      );

      expect(result.message).toContain('vendor updated');
      expect(result.data.previousVendorId).toBe('vendor-old');
      expect(result.data.newVendorId).toBe('vendor-new');

      // Should have called update on the case
      expect(mockPrisma.case.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'case-1' },
          data: { assigned_vendor_id: 'vendor-new' },
        }),
      );

      // Should have logged the activity
      expect(mockPrisma.caseActivityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            case_id: 'case-1',
            action_code: 'VENDOR_OVERRIDE',
            actor_type: 'USER',
            actor_id: 'user-1',
          }),
        }),
      );
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockPrisma.case.findUnique.mockResolvedValue(null);

      await expect(
        casesController.overrideVendor(
          'non-existent',
          { vendor_id: 'vendor-1' },
          mockReq() as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle null previous vendor', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-2',
        // no vendor_id field
      });

      const result = await casesController.overrideVendor(
        'case-2',
        { vendor_id: 'vendor-first' },
        mockReq() as any,
      );

      expect(result.data.previousVendorId).toBeNull();
      expect(result.data.newVendorId).toBe('vendor-first');
    });
  });

  // -----------------------------------------------------------------------
  // FR-033 A2: Officer review before dispatch (approve endpoint)
  // -----------------------------------------------------------------------

  describe('Officer review before dispatch (FR-033 A2)', () => {
    it('should approve a PROPOSED notification and dispatch it', async () => {
      mockPrisma.notificationLog.findUnique.mockResolvedValue({
        id: 'notif-proposed-1',
        status: 'PROPOSED',
        recipient: 'user-1',
        channel: 'EMAIL',
        template_code: 'CASE_ASSIGNED',
        subject: 'Case assigned',
        body_preview: 'Case ATL-2026-000001 assigned',
      });

      mockPrisma.notificationLog.update.mockResolvedValue({
        id: 'notif-proposed-1',
        status: 'SENT',
      });

      const result = await notificationsController.approveNotification('notif-proposed-1');

      expect(result.message).toContain('approved');

      // Should have called send on the notification service
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        'user-1',
        'EMAIL',
        'CASE_ASSIGNED',
        {},
        expect.objectContaining({ fallbackEnabled: true, skipDedup: true }),
      );

      // Should have updated the log entry status
      expect(mockPrisma.notificationLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-proposed-1' },
          data: expect.objectContaining({ status: 'SENT' }),
        }),
      );
    });

    it('should throw NotFoundException when notification entry does not exist', async () => {
      mockPrisma.notificationLog.findUnique.mockResolvedValue(null);

      await expect(
        notificationsController.approveNotification('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when notification is not PROPOSED', async () => {
      mockPrisma.notificationLog.findUnique.mockResolvedValue({
        id: 'notif-sent-1',
        status: 'SENT',
        recipient: 'user-1',
        channel: 'EMAIL',
      });

      await expect(
        notificationsController.approveNotification('notif-sent-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
