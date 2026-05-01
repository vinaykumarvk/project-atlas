import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DsrService } from '../services/dsr.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('DsrService — submitRectification / approveRectification (FR-120.A2)', () => {
  let service: DsrService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DsrService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(DsrService);
  });

  describe('submitRectification()', () => {
    it('should create a PENDING rectification request', async () => {
      mockPrisma.dsrRequest.create.mockResolvedValue({
        id: 'rect-001',
        data_subject_id: 'subject-1',
        requested_by: 'system',
        type: 'RECTIFICATION',
        status: 'PENDING',
        report_data: {
          rectification_fields: { email: 'new@example.com' },
          reason: 'Email change request',
        },
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      });

      const result = await service.submitRectification(
        'subject-1',
        { email: 'new@example.com' },
        'Email change request',
      );

      expect(result.requestId).toBe('rect-001');

      expect(mockPrisma.dsrRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data_subject_id: 'subject-1',
          type: 'RECTIFICATION',
          status: 'PENDING',
          report_data: expect.objectContaining({
            rectification_fields: { email: 'new@example.com' },
            reason: 'Email change request',
          }),
        }),
      });
    });

    it('should store multiple fields for rectification', async () => {
      mockPrisma.dsrRequest.create.mockResolvedValue({
        id: 'rect-002',
        data_subject_id: 'subject-2',
        requested_by: 'system',
        type: 'RECTIFICATION',
        status: 'PENDING',
        report_data: {},
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      });

      const result = await service.submitRectification(
        'subject-2',
        { name: 'Updated Name', phone: '+91-9876543210' },
        'Personal info correction',
      );

      expect(result.requestId).toBe('rect-002');

      expect(mockPrisma.dsrRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          report_data: expect.objectContaining({
            rectification_fields: {
              name: 'Updated Name',
              phone: '+91-9876543210',
            },
          }),
        }),
      });
    });
  });

  describe('approveRectification()', () => {
    it('should approve a pending rectification and mark as COMPLETED', async () => {
      const dsrRecord = {
        id: 'rect-001',
        data_subject_id: 'subject-1',
        requested_by: 'system',
        type: 'RECTIFICATION',
        status: 'PENDING',
        report_data: {
          rectification_fields: { email: 'new@example.com' },
          reason: 'Email change',
          submitted_at: new Date().toISOString(),
        },
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      };

      mockPrisma.dsrRequest.findUnique.mockResolvedValue(dsrRecord);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'subject-1',
        email: 'old@example.com',
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.dsrRequest.update.mockResolvedValue({
        ...dsrRecord,
        status: 'COMPLETED',
        completed_at: new Date(),
      });

      const result = await service.approveRectification('rect-001', 'approver-1');

      expect(result.applied).toBe(true);

      // Verify user was updated
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'subject-1' },
        data: { email: 'new@example.com' },
      });

      // Verify DSR was marked COMPLETED
      expect(mockPrisma.dsrRequest.update).toHaveBeenCalledWith({
        where: { id: 'rect-001' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          completed_at: expect.any(Date),
          report_data: expect.objectContaining({
            approved_by: 'approver-1',
            applied: true,
          }),
        }),
      });
    });

    it('should throw NotFoundException for non-existent request', async () => {
      mockPrisma.dsrRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.approveRectification('non-existent', 'approver-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for non-RECTIFICATION type', async () => {
      mockPrisma.dsrRequest.findUnique.mockResolvedValue({
        id: 'rect-003',
        type: 'ERASURE',
        status: 'PENDING',
        report_data: null,
      });

      await expect(
        service.approveRectification('rect-003', 'approver-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-PENDING status', async () => {
      mockPrisma.dsrRequest.findUnique.mockResolvedValue({
        id: 'rect-004',
        type: 'RECTIFICATION',
        status: 'COMPLETED',
        report_data: null,
      });

      await expect(
        service.approveRectification('rect-004', 'approver-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle approval when user record does not exist', async () => {
      const dsrRecord = {
        id: 'rect-005',
        data_subject_id: 'unknown-user',
        requested_by: 'system',
        type: 'RECTIFICATION',
        status: 'PENDING',
        report_data: {
          rectification_fields: { name: 'New Name' },
          reason: 'Correction',
        },
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      };

      mockPrisma.dsrRequest.findUnique.mockResolvedValue(dsrRecord);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.dsrRequest.update.mockResolvedValue({
        ...dsrRecord,
        status: 'COMPLETED',
      });

      const result = await service.approveRectification('rect-005', 'approver-1');
      expect(result.applied).toBe(true);

      // user.update should NOT have been called
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
