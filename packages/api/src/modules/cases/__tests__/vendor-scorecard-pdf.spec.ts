import { VendorScorecardService } from '../services/vendor-scorecard.service';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('VendorScorecardService — exportAsPdf (FR-083.A3)', () => {
  let service: VendorScorecardService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  const mockVendor = {
    id: 'v-1',
    vendor_name: 'QuickVal Services',
    vendor_code: 'QVS',
    vendor_category: 'VALUER',
    service_geographies: ['Mumbai'],
    service_case_types: ['VALUATION_REQUEST'],
    contracted_tat_hours: 48,
    scorecard_quality: 4.2,
    on_time_response_rate: 0.92,
    is_active: true,
  };

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    service = new VendorScorecardService(mockPrisma);

    // Setup mocks for getScorecard + getQuarterlyComparison
    mockPrisma.vendorMaster.findUnique.mockResolvedValue(mockVendor);
    mockPrisma.case.count
      .mockResolvedValueOnce(45) // totalCasesHandled for getScorecard
      .mockResolvedValueOnce(12) // activeCases for getScorecard
      .mockResolvedValueOnce(45) // totalCasesHandled for comparison's getScorecard
      .mockResolvedValueOnce(12); // activeCases for comparison's getScorecard
    mockPrisma.vendorMaster.findMany.mockResolvedValue([]); // no peers
  });

  it('should return an HTML string containing vendor name', async () => {
    const result = await service.exportAsPdf('v-1');
    expect(result.html).toContain('QuickVal Services');
    expect(result.html).toContain('<!DOCTYPE html>');
  });

  it('should return a filename with vendor code and date', async () => {
    const result = await service.exportAsPdf('v-1');
    expect(result.filename).toMatch(/^scorecard-QVS-\d{4}-\d{2}-\d{2}\.html$/);
  });

  it('should include scorecard metrics in the HTML', async () => {
    const result = await service.exportAsPdf('v-1');
    expect(result.html).toContain('TAT Compliance');
    expect(result.html).toContain('Quality Score');
    expect(result.html).toContain('Rework Rate');
  });

  it('should include peer comparison section', async () => {
    const result = await service.exportAsPdf('v-1');
    expect(result.html).toContain('Peer Comparison');
    expect(result.html).toContain('Peer Avg');
  });
});
