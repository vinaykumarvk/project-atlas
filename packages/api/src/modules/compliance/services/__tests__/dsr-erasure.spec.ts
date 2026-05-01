import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DsrService } from '../dsr.service';
import { PrismaService } from '../../../../common/prisma';
import { createMockPrismaService } from '../../../../common/prisma/prisma.service.mock';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('DsrService — executeErasure (FR-120.A3)', () => {
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

  describe('PII anonymisation', () => {
    it('should replace PII fields with SHA-256 hashes', async () => {
      const dsrRecord = {
        id: 'dsr-001',
        data_subject_id: 'john@example.com',
        requested_by: 'officer-001',
        type: 'ERASURE',
        status: 'PENDING',
        report_data: null,
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      };

      mockPrisma.dsrRequest.findUnique.mockResolvedValue(dsrRecord);

      // Mock the $transaction to execute the callback with mockPrisma as tx
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) => fn(mockPrisma),
      );

      // EmailIngest records with PII
      const emailRecords = [
        {
          id: 'email-001',
          from_address: 'john@example.com',
          to_addresses: ['jane@example.com'],
        },
      ];
      mockPrisma.emailIngest.findMany.mockResolvedValue(emailRecords);
      mockPrisma.emailIngest.update.mockResolvedValue({});

      // Case records with PII (using customer_name, the actual Prisma field)
      const caseRecords = [
        {
          id: 'case-001',
          customer_name: 'John Doe',
        },
      ];
      mockPrisma.case.findMany.mockResolvedValue(caseRecords);
      mockPrisma.case.update.mockResolvedValue({});

      // CaseActivityLog records with PII in payload
      const activityLogs = [
        {
          id: 'log-001',
          case_id: 'case-001',
          payload_json: { customer_name: 'John Doe', action: 'viewed' },
        },
      ];
      mockPrisma.caseActivityLog.findMany.mockResolvedValue(activityLogs);
      mockPrisma.caseActivityLog.update.mockResolvedValue({});

      // Mock DSR update for completion
      mockPrisma.dsrRequest.update.mockResolvedValue({
        ...dsrRecord,
        status: 'COMPLETED',
        completed_at: new Date(),
        report_data: {
          erasure_completed_at: new Date().toISOString(),
          affected_records: {
            emails_anonymised: 1,
            cases_anonymised: 1,
            activity_logs_anonymised: 1,
          },
        },
      });

      await service.executeErasure('dsr-001');

      // Verify EmailIngest PII was hashed
      expect(mockPrisma.emailIngest.update).toHaveBeenCalledWith({
        where: { id: 'email-001' },
        data: {
          from_address: sha256('john@example.com'),
          to_addresses: [sha256('jane@example.com')],
        },
      });

      // Verify Case customer_name was hashed
      expect(mockPrisma.case.update).toHaveBeenCalledWith({
        where: { id: 'case-001' },
        data: { customer_name: sha256('John Doe') },
      });

      // Verify CaseActivityLog payload PII was hashed
      expect(mockPrisma.caseActivityLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'log-001' },
          data: expect.objectContaining({
            payload_json: expect.objectContaining({
              customer_name: sha256('John Doe'),
              action: 'viewed', // non-PII field preserved
            }),
          }),
        }),
      );
    });
  });

  describe('legal_hold blocks erasure', () => {
    it('should throw BadRequestException when legal_hold is true', async () => {
      const dsrRecord = {
        id: 'dsr-002',
        data_subject_id: 'subject-002',
        requested_by: 'officer-001',
        type: 'ERASURE',
        status: 'PENDING',
        report_data: { legal_hold: true },
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      };

      mockPrisma.dsrRequest.findUnique.mockResolvedValue(dsrRecord);

      await expect(service.executeErasure('dsr-002')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.executeErasure('dsr-002')).rejects.toThrow(
        /legal hold/,
      );
    });

    it('should throw BadRequestException for non-ERASURE type', async () => {
      const dsrRecord = {
        id: 'dsr-003',
        data_subject_id: 'subject-003',
        requested_by: 'officer-001',
        type: 'ACCESS',
        status: 'PENDING',
        report_data: null,
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      };

      mockPrisma.dsrRequest.findUnique.mockResolvedValue(dsrRecord);

      await expect(service.executeErasure('dsr-003')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for already COMPLETED request', async () => {
      const dsrRecord = {
        id: 'dsr-004',
        data_subject_id: 'subject-004',
        requested_by: 'officer-001',
        type: 'ERASURE',
        status: 'COMPLETED',
        report_data: null,
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: new Date(),
      };

      mockPrisma.dsrRequest.findUnique.mockResolvedValue(dsrRecord);

      await expect(service.executeErasure('dsr-004')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent request', async () => {
      mockPrisma.dsrRequest.findUnique.mockResolvedValue(null);

      await expect(service.executeErasure('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('transaction pattern', () => {
    it('should use $transaction for atomicity', async () => {
      const dsrRecord = {
        id: 'dsr-005',
        data_subject_id: 'subject-005',
        requested_by: 'officer-001',
        type: 'ERASURE',
        status: 'PENDING',
        report_data: null,
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      };

      mockPrisma.dsrRequest.findUnique.mockResolvedValue(dsrRecord);
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) => fn(mockPrisma),
      );
      mockPrisma.emailIngest.findMany.mockResolvedValue([]);
      mockPrisma.case.findMany.mockResolvedValue([]);
      mockPrisma.caseActivityLog.findMany.mockResolvedValue([]);
      mockPrisma.dsrRequest.update.mockResolvedValue({
        ...dsrRecord,
        status: 'COMPLETED',
        completed_at: new Date(),
        report_data: {
          erasure_completed_at: new Date().toISOString(),
          affected_records: {
            emails_anonymised: 0,
            cases_anonymised: 0,
            activity_logs_anonymised: 0,
          },
        },
      });

      await service.executeErasure('dsr-005');

      // Verify $transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should mark DSR as COMPLETED with affected record counts', async () => {
      const dsrRecord = {
        id: 'dsr-006',
        data_subject_id: 'test@example.com',
        requested_by: 'officer-001',
        type: 'ERASURE',
        status: 'IN_PROGRESS',
        report_data: null,
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      };

      mockPrisma.dsrRequest.findUnique.mockResolvedValue(dsrRecord);
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) => fn(mockPrisma),
      );

      mockPrisma.emailIngest.findMany.mockResolvedValue([
        { id: 'e1', from_address: 'test@example.com', to_addresses: ['c@d.com'] },
        { id: 'e2', from_address: 'test@example.com', to_addresses: ['z@w.com'] },
      ]);
      mockPrisma.emailIngest.update.mockResolvedValue({});

      mockPrisma.case.findMany.mockResolvedValue([
        { id: 'c1', customer_name: 'Jane Doe' },
      ]);
      mockPrisma.case.update.mockResolvedValue({});

      mockPrisma.caseActivityLog.findMany.mockResolvedValue([]);

      mockPrisma.dsrRequest.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...dsrRecord,
          ...data,
        }),
      );

      const result = await service.executeErasure('dsr-006');

      // Verify the DSR update call
      expect(mockPrisma.dsrRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dsr-006' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            completed_at: expect.any(Date),
            report_data: expect.objectContaining({
              affected_records: {
                emails_anonymised: 2,
                cases_anonymised: 1,
                activity_logs_anonymised: 0,
              },
            }),
          }),
        }),
      );

      expect(result.status).toBe('COMPLETED');
    });
  });
});
