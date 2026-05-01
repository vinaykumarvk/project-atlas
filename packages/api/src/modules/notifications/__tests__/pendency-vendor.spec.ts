import { Test, TestingModule } from '@nestjs/testing';
import { PendencyReportService, CaseSnapshot } from '../services/pendency-report.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('FR-071.A3: Vendor-level pendency aggregation', () => {
  let service: PendencyReportService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  const now = new Date('2026-04-29T10:00:00.000Z');

  function buildVendorCases(): CaseSnapshot[] {
    return [
      {
        id: 'case-1',
        caseNumber: 'ATL-001',
        status: 'IN_PROGRESS',
        vendorId: 'vendor-1',
        vendorName: 'PropertyCheck Ltd',
        caseType: 'VALUATION_REQUEST',
        createdAt: new Date('2026-04-27T08:00:00.000Z'),
        isBreached: true,
      },
      {
        id: 'case-2',
        caseNumber: 'ATL-002',
        status: 'AWAITING_VENDOR',
        vendorId: 'vendor-1',
        vendorName: 'PropertyCheck Ltd',
        caseType: 'VALUATION_REQUEST',
        createdAt: new Date('2026-04-28T08:00:00.000Z'),
        isBreached: false,
      },
      {
        id: 'case-3',
        caseNumber: 'ATL-003',
        status: 'IN_PROGRESS',
        vendorId: 'vendor-1',
        vendorName: 'PropertyCheck Ltd',
        caseType: 'LEGAL_OPINION',
        createdAt: new Date('2026-04-26T08:00:00.000Z'),
        isBreached: true,
      },
      {
        id: 'case-4',
        caseNumber: 'ATL-004',
        status: 'ROUTED',
        vendorId: 'vendor-2',
        vendorName: 'ValueAssess Inc',
        caseType: 'VALUATION_REQUEST',
        createdAt: new Date('2026-04-28T10:00:00.000Z'),
        isBreached: false,
      },
      {
        id: 'case-5',
        caseNumber: 'ATL-005',
        status: 'IN_PROGRESS',
        vendorId: 'vendor-2',
        vendorName: 'ValueAssess Inc',
        caseType: 'LEGAL_OPINION',
        createdAt: new Date('2026-04-25T08:00:00.000Z'),
        isBreached: true,
      },
      // Case without vendor (should be excluded)
      {
        id: 'case-6',
        caseNumber: 'ATL-006',
        status: 'NEW',
        caseType: 'GENERAL_INQUIRY',
        createdAt: new Date('2026-04-29T08:00:00.000Z'),
        isBreached: false,
      },
      // Closed case (should be excluded from open counts)
      {
        id: 'case-7',
        caseNumber: 'ATL-007',
        status: 'CLOSED',
        vendorId: 'vendor-1',
        vendorName: 'PropertyCheck Ltd',
        caseType: 'VALUATION_REQUEST',
        createdAt: new Date('2026-04-20T08:00:00.000Z'),
        resolvedAt: new Date('2026-04-22T08:00:00.000Z'),
        isBreached: false,
      },
    ];
  }

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendencyReportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(PendencyReportService);
    service.setCases(buildVendorCases());
  });

  describe('getVendorPendency', () => {
    it('should return vendor-level aggregation', async () => {
      const result = await service.getVendorPendency();

      expect(result.length).toBeGreaterThan(0);
      for (const vendor of result) {
        expect(vendor.vendorId).toBeDefined();
        expect(vendor.vendorName).toBeDefined();
        expect(typeof vendor.openCases).toBe('number');
        expect(typeof vendor.breachedCases).toBe('number');
        expect(typeof vendor.avgAge).toBe('number');
      }
    });

    it('should count open cases per vendor correctly', async () => {
      const result = await service.getVendorPendency();

      const vendor1 = result.find((v) => v.vendorId === 'vendor-1');
      expect(vendor1).toBeDefined();
      expect(vendor1!.openCases).toBe(3); // case-1, case-2, case-3 (case-7 is CLOSED)

      const vendor2 = result.find((v) => v.vendorId === 'vendor-2');
      expect(vendor2).toBeDefined();
      expect(vendor2!.openCases).toBe(2); // case-4, case-5
    });

    it('should count breached cases per vendor correctly', async () => {
      const result = await service.getVendorPendency();

      const vendor1 = result.find((v) => v.vendorId === 'vendor-1');
      expect(vendor1!.breachedCases).toBe(2); // case-1, case-3

      const vendor2 = result.find((v) => v.vendorId === 'vendor-2');
      expect(vendor2!.breachedCases).toBe(1); // case-5
    });

    it('should exclude cases without vendor', async () => {
      const result = await service.getVendorPendency();

      const vendorIds = result.map((v) => v.vendorId);
      // case-6 has no vendorId
      expect(vendorIds).not.toContain(undefined);
      expect(vendorIds.every((id) => id.length > 0)).toBe(true);
    });

    it('should exclude closed cases from counts', async () => {
      const result = await service.getVendorPendency();

      // vendor-1 has 4 total cases, but case-7 is CLOSED
      const vendor1 = result.find((v) => v.vendorId === 'vendor-1');
      expect(vendor1!.openCases).toBe(3);
    });

    it('should compute average age in hours', async () => {
      const result = await service.getVendorPendency();

      for (const vendor of result) {
        expect(vendor.avgAge).toBeGreaterThan(0);
      }
    });

    it('should sort results by openCases descending', async () => {
      const result = await service.getVendorPendency();

      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].openCases).toBeGreaterThanOrEqual(
          result[i].openCases,
        );
      }
    });

    it('should include vendor name', async () => {
      const result = await service.getVendorPendency();

      const vendor1 = result.find((v) => v.vendorId === 'vendor-1');
      expect(vendor1!.vendorName).toBe('PropertyCheck Ltd');

      const vendor2 = result.find((v) => v.vendorId === 'vendor-2');
      expect(vendor2!.vendorName).toBe('ValueAssess Inc');
    });

    it('should return empty array when no cases have vendors', async () => {
      service.setCases([
        {
          id: 'case-no-vendor',
          status: 'NEW',
          caseType: 'GENERAL_INQUIRY',
          createdAt: new Date(),
          isBreached: false,
        },
      ]);

      const result = await service.getVendorPendency();

      expect(result).toEqual([]);
    });

    it('should return empty array when all cases are closed', async () => {
      service.setCases([
        {
          id: 'case-closed-v',
          status: 'CLOSED',
          vendorId: 'vendor-1',
          vendorName: 'Test Vendor',
          caseType: 'VALUATION_REQUEST',
          createdAt: new Date(),
          isBreached: false,
        },
      ]);

      const result = await service.getVendorPendency();

      expect(result).toEqual([]);
    });
  });
});
