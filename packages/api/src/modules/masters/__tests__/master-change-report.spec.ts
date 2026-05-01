import { Test, TestingModule } from '@nestjs/testing';
import { MasterChangeReportService } from '../services/master-change-report.service';
import { MakerCheckerService } from '../services/maker-checker.service';

describe('MasterChangeReportService (FR-114.A1-A3)', () => {
  let service: MasterChangeReportService;
  let mockMakerChecker: { getAll: jest.Mock };

  const now = new Date('2026-04-15T12:00:00Z');
  const weekAgo = new Date('2026-04-08T00:00:00Z');
  const monthAgo = new Date('2026-03-15T00:00:00Z');

  const mockChanges = [
    {
      id: 'ch-1',
      master_table: 'vendor_masters',
      record_id: 'v-1',
      action: 'UPDATE',
      before_json: { name: 'Old Vendor' },
      after_json: { name: 'New Vendor' },
      status: 'APPROVED',
      maker_id: 'user-1',
      checker_id: 'user-2',
      submitted_at: new Date('2026-04-10T10:00:00Z'),
      effective_at: new Date('2026-04-10T10:00:00Z'),
    },
    {
      id: 'ch-2',
      master_table: 'vendor_masters',
      record_id: 'v-2',
      action: 'CREATE',
      before_json: null,
      after_json: { name: 'Brand New Vendor' },
      status: 'APPROVED',
      maker_id: 'user-3',
      checker_id: 'user-4',
      submitted_at: new Date('2026-04-12T10:00:00Z'),
      effective_at: null,
    },
    {
      id: 'ch-3',
      master_table: 'property_location_masters',
      record_id: 'p-1',
      action: 'UPDATE',
      before_json: { city: 'Mumbai' },
      after_json: { city: 'Pune' },
      status: 'APPROVED',
      maker_id: 'user-1',
      checker_id: null,
      submitted_at: new Date('2026-04-11T10:00:00Z'),
      effective_at: null,
    },
    {
      id: 'ch-4',
      master_table: 'vendor_masters',
      record_id: 'v-3',
      action: 'DELETE',
      before_json: { name: 'Removed Vendor' },
      after_json: null,
      status: 'REJECTED',
      maker_id: 'user-5',
      checker_id: 'user-6',
      submitted_at: new Date('2026-03-01T10:00:00Z'), // Outside date range
      effective_at: null,
    },
  ];

  beforeEach(async () => {
    mockMakerChecker = {
      getAll: jest.fn().mockResolvedValue(mockChanges),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasterChangeReportService,
        { provide: MakerCheckerService, useValue: mockMakerChecker },
      ],
    }).compile();

    service = module.get<MasterChangeReportService>(MasterChangeReportService);
  });

  it('should generate report for specific entity type', async () => {
    const report = await service.generateReport('vendor_masters', { from: weekAgo, to: now });
    expect(report.entityType).toBe('vendor_masters');
    expect(report.totalChanges).toBe(2); // ch-1 and ch-2 (ch-4 is out of range)
  });

  it('should filter changes by date range', async () => {
    // monthAgo = March 15, ch-4 is March 1 (before monthAgo), so only ch-1 and ch-2 match
    const report = await service.generateReport('vendor_masters', { from: monthAgo, to: now });
    expect(report.totalChanges).toBe(2);

    // Widening the range to include ch-4
    const wideReport = await service.generateReport('vendor_masters', { from: new Date('2026-02-01'), to: now });
    expect(wideReport.totalChanges).toBe(3);
  });

  it('should not include changes from other entity types', async () => {
    const report = await service.generateReport('property_location_masters', { from: weekAgo, to: now });
    expect(report.totalChanges).toBe(1);
    expect(report.changes[0].changeId).toBe('ch-3');
  });

  it('should assign correct regulatory label for vendor_masters', async () => {
    const report = await service.generateReport('vendor_masters', { from: weekAgo, to: now });
    for (const change of report.changes) {
      expect(change.regulatoryLabel).toBe('RBI_IT_FRAMEWORK');
    }
  });

  it('should assign correct regulatory label for property_location_masters', async () => {
    const report = await service.generateReport('property_location_masters', { from: weekAgo, to: now });
    for (const change of report.changes) {
      expect(change.regulatoryLabel).toBe('RBI_KYC');
    }
  });
});
