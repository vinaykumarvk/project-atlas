import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  MakerCheckerService,
  ChangeStatus,
  ChangeAction,
} from '../services/maker-checker.service';
import { EffectiveDatingService } from '../services/effective-dating.service';
import { BulkImportService } from '../services/bulk-import.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { WebhookDispatcherService } from '../../webhooks/services/webhook-dispatcher.service';
import { randomUUID } from 'crypto';

describe('MakerCheckerService', () => {
  let service: MakerCheckerService;

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPrisma = createMockPrismaService() as any;

    // Stateful mock for masterChangeLog
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changeLogs: any[] = [];

    mockPrisma.masterChangeLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const record = {
        id: data.id || randomUUID(),
        ...data,
        submitted_at: new Date(),
        reviewed_at: null,
        rejection_reason: null,
        checker_id: null,
        ...(!data.status && { status: ChangeStatus.PENDING }),
      };
      changeLogs.push(record);
      return Promise.resolve(record);
    });

    mockPrisma.masterChangeLog.findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      const found = changeLogs.find((c) => c.id === where.id);
      return Promise.resolve(found || null);
    });

    mockPrisma.masterChangeLog.findMany.mockImplementation(({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, string> | Record<string, string>[] } = {}) => {
      let results = [...changeLogs];
      if (where) {
        if (where.status) results = results.filter((c) => c.status === where.status);
        if (where.master_table) results = results.filter((c) => c.master_table === where.master_table);
        if (where.record_id) results = results.filter((c) => c.record_id === where.record_id);
      }
      // Sort by submitted_at asc by default
      results.sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
      // If orderBy includes reviewed_at desc, apply that
      if (Array.isArray(orderBy) && orderBy[0]?.reviewed_at === 'desc') {
        results.sort((a, b) => {
          const aTime = a.reviewed_at ? new Date(a.reviewed_at).getTime() : 0;
          const bTime = b.reviewed_at ? new Date(b.reviewed_at).getTime() : 0;
          if (bTime !== aTime) return bTime - aTime;
          // Tiebreaker: later-inserted entries first (desc)
          return changeLogs.indexOf(b) - changeLogs.indexOf(a);
        });
      }
      return Promise.resolve(results);
    });

    mockPrisma.masterChangeLog.update.mockImplementation(({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const record = changeLogs.find((c) => c.id === where.id);
      if (record) Object.assign(record, data);
      return Promise.resolve(record);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MakerCheckerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhookDispatcherService, useValue: { dispatch: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get(MakerCheckerService);
  });

  describe('proposeChange', () => {
    it('should create a change with status PENDING', async () => {
      const change = await service.proposeChange(
        'property_location_masters',
        'record-1',
        ChangeAction.UPDATE,
        { state: 'Maharashtra', city: 'Mumbai' },
        'maker-user-1',
      );

      expect(change).toBeDefined();
      expect(change.id).toBeDefined();
      expect(change.status).toBe(ChangeStatus.PENDING);
      expect(change.master_table).toBe('property_location_masters');
      expect(change.record_id).toBe('record-1');
      expect(change.action).toBe(ChangeAction.UPDATE);
      expect(change.after_json).toEqual({ state: 'Maharashtra', city: 'Mumbai' });
      expect(change.maker_id).toBe('maker-user-1');
      expect(change.checker_id).toBeNull();
      expect(change.reviewed_at).toBeNull();
      expect(change.submitted_at).toBeInstanceOf(Date);
    });

    it('should create a change with optional before_data and effectiveAt', async () => {
      const effectiveDate = new Date('2026-06-01');
      const change = await service.proposeChange(
        'vendor_masters',
        'vendor-1',
        ChangeAction.UPDATE,
        { vendor_name: 'New Corp' },
        'maker-user-1',
        {
          beforeData: { vendor_name: 'Old Corp' },
          effectiveAt: effectiveDate,
        },
      );

      expect(change.before_json).toEqual({ vendor_name: 'Old Corp' });
      expect(change.effective_at).toEqual(effectiveDate);
    });

    it('should create a CREATE change with null record_id', async () => {
      const change = await service.proposeChange(
        'case_type_masters',
        null,
        ChangeAction.CREATE,
        { code: 'NEW_TYPE', display_name: 'New Type' },
        'maker-user-1',
      );

      expect(change.record_id).toBeNull();
      expect(change.action).toBe(ChangeAction.CREATE);
    });
  });

  describe('approveChange', () => {
    it('should approve a pending change when checker is different from maker', async () => {
      const change = await service.proposeChange(
        'property_location_masters',
        'record-1',
        ChangeAction.UPDATE,
        { city: 'Pune' },
        'maker-user-1',
      );

      const approved = await service.approveChange(change.id, 'checker-user-2');

      expect(approved.status).toBe(ChangeStatus.APPROVED);
      expect(approved.checker_id).toBe('checker-user-2');
      expect(approved.reviewed_at).toBeInstanceOf(Date);
    });

    it('should throw error on self-approval (maker === checker)', async () => {
      const change = await service.proposeChange(
        'property_location_masters',
        'record-1',
        ChangeAction.UPDATE,
        { city: 'Pune' },
        'same-user',
      );

      await expect(service.approveChange(change.id, 'same-user')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.approveChange(change.id, 'same-user')).rejects.toThrow(
        'Self-approval is not allowed',
      );
    });

    it('should throw error when change is not found', async () => {
      await expect(
        service.approveChange('non-existent-id', 'checker-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error when change is not in PENDING status', async () => {
      const change = await service.proposeChange(
        'property_location_masters',
        'record-1',
        ChangeAction.UPDATE,
        { city: 'Pune' },
        'maker-user-1',
      );

      await service.approveChange(change.id, 'checker-user-2');

      await expect(
        service.approveChange(change.id, 'checker-user-3'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectChange', () => {
    it('should reject a pending change with a reason', async () => {
      const change = await service.proposeChange(
        'property_location_masters',
        'record-1',
        ChangeAction.UPDATE,
        { city: 'Pune' },
        'maker-user-1',
      );

      const rejected = await service.rejectChange(
        change.id,
        'checker-user-2',
        'PIN code overlap with existing record',
      );

      expect(rejected.status).toBe(ChangeStatus.REJECTED);
      expect(rejected.checker_id).toBe('checker-user-2');
      expect(rejected.rejection_reason).toBe(
        'PIN code overlap with existing record',
      );
      expect(rejected.reviewed_at).toBeInstanceOf(Date);
    });

    it('should throw error on self-rejection (maker === checker)', async () => {
      const change = await service.proposeChange(
        'property_location_masters',
        'record-1',
        ChangeAction.UPDATE,
        { city: 'Pune' },
        'same-user',
      );

      await expect(
        service.rejectChange(change.id, 'same-user', 'some reason'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.rejectChange(change.id, 'same-user', 'some reason'),
      ).rejects.toThrow('Self-approval is not allowed');
    });

    it('should throw error when reason is empty', async () => {
      const change = await service.proposeChange(
        'property_location_masters',
        'record-1',
        ChangeAction.UPDATE,
        { city: 'Pune' },
        'maker-user-1',
      );

      await expect(
        service.rejectChange(change.id, 'checker-user-2', ''),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.rejectChange(change.id, 'checker-user-2', '   '),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when change is not found', async () => {
      await expect(
        service.rejectChange('non-existent', 'checker-1', 'reason'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rollback', () => {
    it('should create a new PENDING change to revert the last approved change', async () => {
      const original = await service.proposeChange(
        'vendor_masters',
        'vendor-1',
        ChangeAction.UPDATE,
        { vendor_name: 'New Name' },
        'maker-user-1',
        { beforeData: { vendor_name: 'Old Name' } },
      );
      await service.approveChange(original.id, 'checker-user-2');

      const rollbackChange = await service.rollback(
        'vendor_masters',
        'vendor-1',
        'rollback-user-3',
      );

      expect(rollbackChange.status).toBe(ChangeStatus.PENDING);
      expect(rollbackChange.action).toBe(ChangeAction.UPDATE);
      expect(rollbackChange.maker_id).toBe('rollback-user-3');
      expect(rollbackChange.after_json).toEqual({ vendor_name: 'Old Name' });
      expect(rollbackChange.before_json).toEqual({ vendor_name: 'New Name' });
    });

    it('should throw error when no approved changes exist for rollback', async () => {
      await expect(
        service.rollback('vendor_masters', 'non-existent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rollback the most recent approved change when multiple exist', async () => {
      const change1 = await service.proposeChange(
        'vendor_masters',
        'vendor-1',
        ChangeAction.UPDATE,
        { vendor_name: 'Second Name' },
        'maker-1',
        { beforeData: { vendor_name: 'First Name' } },
      );
      await service.approveChange(change1.id, 'checker-1');

      const change2 = await service.proposeChange(
        'vendor_masters',
        'vendor-1',
        ChangeAction.UPDATE,
        { vendor_name: 'Third Name' },
        'maker-1',
        { beforeData: { vendor_name: 'Second Name' } },
      );
      await service.approveChange(change2.id, 'checker-1');

      const rollback = await service.rollback('vendor_masters', 'vendor-1', 'user-3');
      expect(rollback.after_json).toEqual({ vendor_name: 'Second Name' });
      expect(rollback.before_json).toEqual({ vendor_name: 'Third Name' });
    });
  });

  describe('getByStatus', () => {
    it('should filter changes by status', async () => {
      await service.proposeChange(
        'table-a',
        'rec-1',
        ChangeAction.UPDATE,
        { x: 1 },
        'maker-1',
      );
      const c2 = await service.proposeChange(
        'table-b',
        'rec-2',
        ChangeAction.CREATE,
        { y: 2 },
        'maker-2',
      );
      await service.approveChange(c2.id, 'checker-1');

      const pending = await service.getByStatus(ChangeStatus.PENDING);
      const approved = await service.getByStatus(ChangeStatus.APPROVED);

      expect(pending).toHaveLength(1);
      expect(approved).toHaveLength(1);
      expect(pending[0].master_table).toBe('table-a');
      expect(approved[0].master_table).toBe('table-b');
    });
  });
});

describe('EffectiveDatingService', () => {
  let service: EffectiveDatingService;

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPrisma = createMockPrismaService() as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectiveDatingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(EffectiveDatingService);
    service.reset();
  });

  describe('getActiveVersion', () => {
    it('should return the record effective at a given date', async () => {
      service.addRecord(
        'tat_masters',
        'tat-1',
        { target_hours: 24 },
        new Date('2025-01-01'),
        new Date('2025-06-01'),
      );
      service.addRecord(
        'tat_masters',
        'tat-1',
        { target_hours: 48 },
        new Date('2025-06-01'),
        null,
      );

      const v1 = await service.getActiveVersion(
        'tat_masters',
        'tat-1',
        new Date('2025-03-15'),
      );
      expect(v1).not.toBeNull();
      expect(v1!.data).toEqual({ target_hours: 24 });

      const v2 = await service.getActiveVersion(
        'tat_masters',
        'tat-1',
        new Date('2025-07-01'),
      );
      expect(v2).not.toBeNull();
      expect(v2!.data).toEqual({ target_hours: 48 });
    });

    it('should return null when no version is active at that date', async () => {
      service.addRecord(
        'tat_masters',
        'tat-1',
        { target_hours: 24 },
        new Date('2025-06-01'),
        null,
      );

      const result = await service.getActiveVersion(
        'tat_masters',
        'tat-1',
        new Date('2025-01-01'),
      );
      expect(result).toBeNull();
    });

    it('should default to current date when no asOfDate provided', async () => {
      service.addRecord(
        'tat_masters',
        'tat-1',
        { target_hours: 24 },
        new Date('2020-01-01'),
        null,
      );

      const result = await service.getActiveVersion('tat_masters', 'tat-1');
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ target_hours: 24 });
    });
  });

  describe('getHistory', () => {
    it('should return all versions ordered by effective_from', async () => {
      service.addRecord(
        'tat_masters',
        'tat-1',
        { target_hours: 24 },
        new Date('2025-01-01'),
        new Date('2025-06-01'),
      );
      service.addRecord(
        'tat_masters',
        'tat-1',
        { target_hours: 48 },
        new Date('2025-06-01'),
        new Date('2025-12-01'),
      );
      service.addRecord(
        'tat_masters',
        'tat-1',
        { target_hours: 72 },
        new Date('2025-12-01'),
        null,
      );

      const history = await service.getHistory('tat_masters', 'tat-1');

      expect(history).toHaveLength(3);
      expect(history[0].data).toEqual({ target_hours: 24 });
      expect(history[1].data).toEqual({ target_hours: 48 });
      expect(history[2].data).toEqual({ target_hours: 72 });
    });

    it('should throw NotFoundException when no history exists', async () => {
      await expect(service.getHistory('tat_masters', 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

describe('BulkImportService', () => {
  let bulkImportService: BulkImportService;
  let makerCheckerService: MakerCheckerService;

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPrisma = createMockPrismaService() as any;

    // Stateful mock for masterChangeLog (shared with MakerCheckerService)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changeLogs: any[] = [];

    mockPrisma.masterChangeLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const record = {
        id: data.id || randomUUID(),
        ...data,
        submitted_at: new Date(),
        reviewed_at: null,
        rejection_reason: null,
        checker_id: null,
      };
      changeLogs.push(record);
      return Promise.resolve(record);
    });

    mockPrisma.masterChangeLog.findMany.mockImplementation(({ where }: { where?: Record<string, unknown> } = {}) => {
      let results = [...changeLogs];
      if (where) {
        if (where.status) results = results.filter((c) => c.status === where.status);
      }
      return Promise.resolve(results);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MakerCheckerService,
        BulkImportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhookDispatcherService, useValue: { dispatch: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    makerCheckerService = module.get(MakerCheckerService);
    bulkImportService = module.get(BulkImportService);
  });

  describe('parseFile', () => {
    it('should parse a CSV file into row objects', () => {
      const csvContent = 'state,city,pin_from,pin_to\nMaharashtra,Mumbai,400001,400099\nKarnataka,Bangalore,560001,560099';
      const buffer = Buffer.from(csvContent, 'utf-8');

      const rows = bulkImportService.parseFile(buffer, 'text/csv');

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        state: 'Maharashtra',
        city: 'Mumbai',
        pin_from: '400001',
        pin_to: '400099',
      });
      expect(rows[1]).toEqual({
        state: 'Karnataka',
        city: 'Bangalore',
        pin_from: '560001',
        pin_to: '560099',
      });
    });

    it('should handle quoted CSV fields with commas', () => {
      const csvContent = 'name,address\n"John Doe","123, Main St, Apt 4"\n"Jane","Simple"';
      const buffer = Buffer.from(csvContent, 'utf-8');

      const rows = bulkImportService.parseFile(buffer, 'text/csv');

      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('John Doe');
      expect(rows[0].address).toBe('123, Main St, Apt 4');
    });

    it('should throw BadRequestException for unsupported mime type', () => {
      const buffer = Buffer.from('data', 'utf-8');

      expect(() =>
        bulkImportService.parseFile(buffer, 'application/pdf'),
      ).toThrow(BadRequestException);
    });

    it('should return empty array for CSV with only headers', () => {
      const csvContent = 'state,city,pin_from,pin_to';
      const buffer = Buffer.from(csvContent, 'utf-8');

      const rows = bulkImportService.parseFile(buffer, 'text/csv');
      expect(rows).toHaveLength(0);
    });
  });

  describe('validateRows', () => {
    it('should return valid rows when all pass validation', () => {
      const rows = [
        { state: 'Maharashtra', city: 'Mumbai', pin_from: '400001', pin_to: '400099' },
        { state: 'Karnataka', city: 'Bangalore', pin_from: '560001', pin_to: '560099' },
      ];

      const result = bulkImportService.validateRows(
        rows,
        'property_location_masters',
      );

      expect(result.valid).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid rows (missing required fields)', () => {
      const rows = [
        { state: 'Maharashtra', city: 'Mumbai', pin_from: '400001', pin_to: '400099' },
        { state: '', city: 'Bangalore', pin_from: '560001', pin_to: '560099' },
        { state: 'Tamil Nadu', city: '', pin_from: '', pin_to: '600099' },
      ];

      const result = bulkImportService.validateRows(
        rows,
        'property_location_masters',
      );

      expect(result.valid).toHaveLength(1);
      expect(result.errors.length).toBeGreaterThan(0);

      const row2Errors = result.errors.filter((e) => e.row === 2);
      expect(row2Errors.length).toBeGreaterThan(0);
      expect(row2Errors.some((e) => e.field === 'state')).toBe(true);

      const row3Errors = result.errors.filter((e) => e.row === 3);
      expect(row3Errors.length).toBeGreaterThanOrEqual(2);
      expect(row3Errors.some((e) => e.field === 'city')).toBe(true);
      expect(row3Errors.some((e) => e.field === 'pin_from')).toBe(true);
    });

    it('should return errors for fields exceeding maxLength', () => {
      const longState = 'A'.repeat(101);
      const rows = [
        { state: longState, city: 'Mumbai', pin_from: '400001', pin_to: '400099' },
      ];

      const result = bulkImportService.validateRows(
        rows,
        'property_location_masters',
      );

      expect(result.valid).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('state');
      expect(result.errors[0].message).toContain('maximum length');
    });

    it('should return errors for invalid number fields', () => {
      const rows = [
        { case_type: 'VALUATION', priority: 'HIGH', stage: 'ROUTING', target_hours_business: 'not-a-number' },
      ];

      const result = bulkImportService.validateRows(rows, 'tat_masters');

      expect(result.valid).toHaveLength(0);
      expect(result.errors.some((e) => e.field === 'target_hours_business')).toBe(true);
      expect(result.errors.some((e) => e.message.includes('must be a number'))).toBe(true);
    });

    it('should accept all rows when no schema is defined for the table', () => {
      const rows = [
        { anything: 'goes', here: 123 },
        { completely: 'freeform' },
      ];

      const result = bulkImportService.validateRows(rows, 'unknown_table');

      expect(result.valid).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('submitBatch', () => {
    it('should create maker-checker changes with shared batch_id', async () => {
      const validRows = [
        { state: 'Maharashtra', city: 'Mumbai', pin_from: '400001', pin_to: '400099' },
        { state: 'Karnataka', city: 'Bangalore', pin_from: '560001', pin_to: '560099' },
      ];

      const result = await bulkImportService.submitBatch(
        validRows,
        'property_location_masters',
        'maker-user-1',
      );

      expect(result.batch_id).toBeDefined();
      expect(result.total).toBe(2);
      expect(result.changes).toHaveLength(2);

      result.changes.forEach((change) => {
        expect(change.status).toBe(ChangeStatus.PENDING);
        expect(change.is_batch).toBe(true);
        expect(change.batch_id).toBe(result.batch_id);
        expect(change.maker_id).toBe('maker-user-1');
        expect(change.action).toBe(ChangeAction.CREATE);
      });
    });

    it('should throw BadRequestException when no valid rows provided', async () => {
      await expect(
        bulkImportService.submitBatch(
          [],
          'property_location_masters',
          'maker-user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('end-to-end: parse, validate, submit', () => {
    it('should handle the full bulk import workflow', async () => {
      const csvContent =
        'vendor_code,vendor_name,vendor_category\nV001,Acme Valuers,VALUER\nV002,,ADVOCATE\nV003,Beta Surveyors,SURVEYOR';
      const buffer = Buffer.from(csvContent, 'utf-8');

      const rows = bulkImportService.parseFile(buffer, 'text/csv');
      expect(rows).toHaveLength(3);

      const { valid, errors } = bulkImportService.validateRows(
        rows,
        'vendor_masters',
      );
      expect(valid).toHaveLength(2);
      expect(errors).toHaveLength(1);
      expect(errors[0].row).toBe(2);
      expect(errors[0].field).toBe('vendor_name');

      const result = await bulkImportService.submitBatch(
        valid,
        'vendor_masters',
        'bulk-user',
      );
      expect(result.total).toBe(2);

      const pending = await makerCheckerService.getByStatus(ChangeStatus.PENDING);
      expect(pending).toHaveLength(2);
    });
  });
});
