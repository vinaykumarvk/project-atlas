import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VendorScorecardService } from '../services/vendor-scorecard.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('VendorScorecardService', () => {
  let service: VendorScorecardService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorScorecardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(VendorScorecardService);
  });

  // ── getScorecard ────────────────────────────────────────────────────

  describe('getScorecard', () => {
    it('should throw NotFoundException when vendor does not exist', async () => {
      mockPrisma.vendorMaster.findUnique.mockResolvedValue(null);

      await expect(service.getScorecard('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return a valid scorecard for an existing vendor', async () => {
      mockPrisma.vendorMaster.findUnique.mockResolvedValue({
        id: 'v-1',
        vendor_name: 'QuickVal Services',
        vendor_code: 'QVS',
        vendor_category: 'VALUER',
        service_geographies: ['Mumbai', 'Pune'],
        service_case_types: ['VALUATION_REQUEST', 'SITE_VISIT'],
        contracted_tat_hours: 48,
        scorecard_quality: 4.2,
        on_time_response_rate: 0.85,
      });
      mockPrisma.case.count
        .mockResolvedValueOnce(45) // total cases handled
        .mockResolvedValueOnce(12); // active cases

      const scorecard = await service.getScorecard('v-1');

      expect(scorecard.vendorId).toBe('v-1');
      expect(scorecard.vendorName).toBe('QuickVal Services');
      expect(scorecard.vendorCode).toBe('QVS');
      expect(scorecard.category).toBe('VALUER');
      expect(scorecard.tatCompliancePercent).toBe(0.85);
      expect(scorecard.qualityScore).toBe(4.2);
      expect(scorecard.totalCasesHandled).toBe(45);
      expect(scorecard.activeCases).toBe(12);
      expect(scorecard.reworkRate).toBeGreaterThanOrEqual(0);
      expect(scorecard.serviceGeographies).toEqual(['Mumbai', 'Pune']);
      expect(scorecard.serviceCaseTypes).toEqual(['VALUATION_REQUEST', 'SITE_VISIT']);
    });

    it('should handle vendor with null optional fields', async () => {
      mockPrisma.vendorMaster.findUnique.mockResolvedValue({
        id: 'v-2',
        vendor_name: 'NewVendor',
        vendor_code: 'NV',
        vendor_category: 'SURVEYOR',
        service_geographies: [],
        service_case_types: [],
        contracted_tat_hours: null,
        scorecard_quality: null,
        on_time_response_rate: null,
      });
      mockPrisma.case.count.mockResolvedValue(0);

      const scorecard = await service.getScorecard('v-2');

      expect(scorecard.qualityScore).toBe(0);
      expect(scorecard.tatCompliancePercent).toBe(0);
      expect(scorecard.totalCasesHandled).toBe(0);
    });

    it('should compute rework rate inversely from quality score', async () => {
      // Perfect quality → 0% rework
      mockPrisma.vendorMaster.findUnique.mockResolvedValue({
        id: 'v-3',
        vendor_name: 'PerfectVendor',
        vendor_code: 'PV',
        vendor_category: 'VALUER',
        service_geographies: [],
        service_case_types: [],
        contracted_tat_hours: 24,
        scorecard_quality: 5.0,
        on_time_response_rate: 1.0,
      });
      mockPrisma.case.count.mockResolvedValue(10);

      const scorecard = await service.getScorecard('v-3');
      expect(scorecard.reworkRate).toBe(0);
    });
  });

  // ── listVendorSummaries ─────────────────────────────────────────────

  describe('listVendorSummaries', () => {
    it('should return an empty list when no active vendors exist', async () => {
      mockPrisma.vendorMaster.findMany.mockResolvedValue([]);

      const result = await service.listVendorSummaries();
      expect(result).toEqual([]);
    });

    it('should return summary data for each active vendor', async () => {
      mockPrisma.vendorMaster.findMany.mockResolvedValue([
        {
          id: 'v-1',
          vendor_name: 'QuickVal Services',
          vendor_code: 'QVS',
          vendor_category: 'VALUER',
          scorecard_quality: 4.2,
          on_time_response_rate: 0.85,
          is_active: true,
        },
        {
          id: 'v-2',
          vendor_name: 'LegalEase Partners',
          vendor_code: 'LEP',
          vendor_category: 'ADVOCATE',
          scorecard_quality: 4.5,
          on_time_response_rate: 0.92,
          is_active: true,
        },
      ]);

      const result = await service.listVendorSummaries();
      expect(result.length).toBe(2);
      expect(result[0].vendorName).toBe('QuickVal Services');
      expect(result[1].vendorName).toBe('LegalEase Partners');
    });
  });
});
