import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OutboundReviewService } from '../services/outbound-review.service';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('OutboundReviewService', () => {
  let service: OutboundReviewService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDispatchService: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    mockDispatchService = {
      send: jest.fn().mockResolvedValue({ status: 'SENT', channel: 'EMAIL' }),
    };

    service = new OutboundReviewService(mockPrisma, mockDispatchService);
  });

  // ── getPendingReviews ──────────────────────────────────────────────

  describe('getPendingReviews', () => {
    it('should return PROPOSED notifications ordered by created_at desc', async () => {
      const mockLogs = [
        { id: 'log-1', status: 'PROPOSED', created_at: new Date('2026-01-02') },
        { id: 'log-2', status: 'PROPOSED', created_at: new Date('2026-01-01') },
      ];
      mockPrisma.notificationLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getPendingReviews();

      expect(result).toEqual(mockLogs);
      expect(mockPrisma.notificationLog.findMany).toHaveBeenCalledWith({
        where: { status: 'PROPOSED' },
        orderBy: { created_at: 'desc' },
        take: 100,
      });
    });

    it('should return empty array when no pending reviews exist', async () => {
      mockPrisma.notificationLog.findMany.mockResolvedValue([]);

      const result = await service.getPendingReviews();

      expect(result).toEqual([]);
    });
  });

  // ── approveAndSend ─────────────────────────────────────────────────

  describe('approveAndSend', () => {
    it('should approve a PROPOSED notification and send it', async () => {
      mockPrisma.notificationLog.findUnique.mockResolvedValue({
        id: 'notif-1',
        status: 'PROPOSED',
        recipient: 'user-1',
        channel: 'EMAIL',
        template_code: 'CASE_ASSIGNED',
      });

      const result = await service.approveAndSend('notif-1', 'officer-1');

      expect(result.status).toBe('SENT');
      expect(mockDispatchService.send).toHaveBeenCalledWith(
        'user-1',
        'EMAIL',
        'CASE_ASSIGNED',
        {},
        { fallbackEnabled: true, skipDedup: true },
      );
      expect(mockPrisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { status: 'SENT', sent_at: expect.any(Date) },
      });
    });

    it('should throw NotFoundException when notification does not exist', async () => {
      mockPrisma.notificationLog.findUnique.mockResolvedValue(null);

      await expect(service.approveAndSend('nonexistent', 'officer-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when notification is not PROPOSED', async () => {
      mockPrisma.notificationLog.findUnique.mockResolvedValue({
        id: 'notif-1',
        status: 'SENT',
      });

      await expect(service.approveAndSend('notif-1', 'officer-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── reject ─────────────────────────────────────────────────────────

  describe('reject', () => {
    it('should reject a PROPOSED notification', async () => {
      mockPrisma.notificationLog.findUnique.mockResolvedValue({
        id: 'notif-1',
        status: 'PROPOSED',
      });

      const result = await service.reject('notif-1', 'officer-1', 'Not appropriate');

      expect(result.status).toBe('REJECTED');
      expect(mockPrisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { status: 'REJECTED' },
      });
    });

    it('should throw NotFoundException when notification does not exist', async () => {
      mockPrisma.notificationLog.findUnique.mockResolvedValue(null);

      await expect(
        service.reject('nonexistent', 'officer-1', 'reason'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when notification is already SENT', async () => {
      mockPrisma.notificationLog.findUnique.mockResolvedValue({
        id: 'notif-1',
        status: 'SENT',
      });

      await expect(
        service.reject('notif-1', 'officer-1', 'Too late'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
