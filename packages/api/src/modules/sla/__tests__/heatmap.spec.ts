import { Test, TestingModule } from '@nestjs/testing';
import { HeatmapService, HeatmapCell } from '../services/heatmap.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('HeatmapService (FR-111.A3)', () => {
  let service: HeatmapService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  function buildMockData() {
    return [
      { region: 'Mumbai', caseType: 'VALUATION_REQUEST', isBreached: false },
      { region: 'Mumbai', caseType: 'VALUATION_REQUEST', isBreached: true },
      { region: 'Mumbai', caseType: 'VALUATION_REQUEST', isBreached: false },
      { region: 'Mumbai', caseType: 'LEGAL_OPINION', isBreached: true },
      { region: 'Mumbai', caseType: 'LEGAL_OPINION', isBreached: true },
      { region: 'Delhi', caseType: 'VALUATION_REQUEST', isBreached: false },
      { region: 'Delhi', caseType: 'VALUATION_REQUEST', isBreached: false },
      { region: 'Delhi', caseType: 'LEGAL_OPINION', isBreached: false },
      { region: 'Bangalore', caseType: 'VALUATION_REQUEST', isBreached: true },
      { region: 'Bangalore', caseType: 'VALUATION_REQUEST', isBreached: true },
      { region: 'Bangalore', caseType: 'LEGAL_OPINION', isBreached: false },
    ];
  }

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeatmapService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(HeatmapService);
    service.setMockData(buildMockData());
  });

  describe('getBreachHeatmap', () => {
    it('should return cells, regions, and caseTypes', async () => {
      const result = await service.getBreachHeatmap();

      expect(result.cells).toBeDefined();
      expect(result.regions).toBeDefined();
      expect(result.caseTypes).toBeDefined();
      expect(result.cells.length).toBeGreaterThan(0);
    });

    it('should return sorted unique regions', async () => {
      const result = await service.getBreachHeatmap();

      expect(result.regions).toEqual(['Bangalore', 'Delhi', 'Mumbai']);
    });

    it('should return sorted unique case types', async () => {
      const result = await service.getBreachHeatmap();

      expect(result.caseTypes).toEqual(['LEGAL_OPINION', 'VALUATION_REQUEST']);
    });

    it('should compute correct breach rate for each cell', async () => {
      const result = await service.getBreachHeatmap();

      // Mumbai + VALUATION_REQUEST: 3 total, 1 breached => 33.33%
      const mumbaiVal = result.cells.find(
        (c) => c.region === 'Mumbai' && c.caseType === 'VALUATION_REQUEST',
      );
      expect(mumbaiVal).toBeDefined();
      expect(mumbaiVal!.totalCases).toBe(3);
      expect(mumbaiVal!.breachedCases).toBe(1);
      expect(mumbaiVal!.breachRate).toBeCloseTo(33.33, 1);

      // Mumbai + LEGAL_OPINION: 2 total, 2 breached => 100%
      const mumbaiLegal = result.cells.find(
        (c) => c.region === 'Mumbai' && c.caseType === 'LEGAL_OPINION',
      );
      expect(mumbaiLegal).toBeDefined();
      expect(mumbaiLegal!.breachRate).toBe(100);

      // Delhi + VALUATION_REQUEST: 2 total, 0 breached => 0%
      const delhiVal = result.cells.find(
        (c) => c.region === 'Delhi' && c.caseType === 'VALUATION_REQUEST',
      );
      expect(delhiVal).toBeDefined();
      expect(delhiVal!.breachRate).toBe(0);
    });

    it('should have correct totalCases and breachedCases counts', async () => {
      const result = await service.getBreachHeatmap();

      // Bangalore + VALUATION_REQUEST: 2 total, 2 breached
      const bangaloreVal = result.cells.find(
        (c) => c.region === 'Bangalore' && c.caseType === 'VALUATION_REQUEST',
      );
      expect(bangaloreVal!.totalCases).toBe(2);
      expect(bangaloreVal!.breachedCases).toBe(2);
      expect(bangaloreVal!.breachRate).toBe(100);
    });

    it('should return one cell per region-caseType combination', async () => {
      const result = await service.getBreachHeatmap();

      // Total cells = regions * caseTypes (where data exists)
      const expectedCells =
        result.regions.length * result.caseTypes.length;
      // Actual cells might be less if some combinations don't exist
      expect(result.cells.length).toBeLessThanOrEqual(expectedCells);
      expect(result.cells.length).toBeGreaterThan(0);
    });

    it('should handle empty data gracefully', async () => {
      service.setMockData([]);

      const result = await service.getBreachHeatmap();

      expect(result.cells).toHaveLength(0);
      expect(result.regions).toHaveLength(0);
      expect(result.caseTypes).toHaveLength(0);
    });
  });

  describe('getRegionSummary', () => {
    it('should return summary for a specific region', async () => {
      const summary = await service.getRegionSummary('Mumbai');

      // Mumbai: 5 total, 3 breached (1 val + 2 legal)
      expect(summary.total).toBe(5);
      expect(summary.breached).toBe(3);
      expect(summary.rate).toBeCloseTo(60, 0);
    });

    it('should return zero summary for non-existent region', async () => {
      const summary = await service.getRegionSummary('NonExistent');

      expect(summary.total).toBe(0);
      expect(summary.breached).toBe(0);
      expect(summary.rate).toBe(0);
    });

    it('should compute correct rate for region with no breaches', async () => {
      const summary = await service.getRegionSummary('Delhi');

      // Delhi: 3 total, 0 breached
      expect(summary.total).toBe(3);
      expect(summary.breached).toBe(0);
      expect(summary.rate).toBe(0);
    });

    it('should compute correct rate for region with all breaches', async () => {
      service.setMockData([
        { region: 'TestRegion', caseType: 'A', isBreached: true },
        { region: 'TestRegion', caseType: 'B', isBreached: true },
      ]);

      const summary = await service.getRegionSummary('TestRegion');

      expect(summary.total).toBe(2);
      expect(summary.breached).toBe(2);
      expect(summary.rate).toBe(100);
    });
  });
});
