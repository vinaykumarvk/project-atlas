import { BusinessValueService } from '../services/business-value.service';

describe('BusinessValueService', () => {
  let service: BusinessValueService;

  beforeEach(() => {
    service = new BusinessValueService();
  });

  it('should return a complete business value report', async () => {
    const report = await service.getBusinessValueSummary();
    expect(report).toHaveProperty('disbursalBlockers');
    expect(report).toHaveProperty('pendingByType');
    expect(report).toHaveProperty('vendorCapacity');
    expect(report).toHaveProperty('slaLeakageByRegion');
    expect(report).toHaveProperty('casesAtRisk');
    expect(report).toHaveProperty('forecast');
    expect(report).toHaveProperty('generatedAt');
  });

  it('should include disbursal blockers with required fields', async () => {
    const report = await service.getBusinessValueSummary();
    expect(report.disbursalBlockers.length).toBeGreaterThan(0);
    expect(report.disbursalBlockers[0]).toHaveProperty('category');
    expect(report.disbursalBlockers[0]).toHaveProperty('count');
    expect(report.disbursalBlockers[0]).toHaveProperty('avgAgeDays');
  });

  it('should include vendor capacity with utilization', async () => {
    const report = await service.getBusinessValueSummary();
    expect(report.vendorCapacity.length).toBeGreaterThan(0);
    const vendor = report.vendorCapacity[0];
    expect(vendor).toHaveProperty('vendorName');
    expect(vendor).toHaveProperty('utilizationPercent');
    expect(vendor.utilizationPercent).toBeGreaterThanOrEqual(0);
    expect(vendor.utilizationPercent).toBeLessThanOrEqual(100);
  });

  it('should include SLA leakage by region', async () => {
    const report = await service.getBusinessValueSummary();
    expect(Object.keys(report.slaLeakageByRegion).length).toBeGreaterThan(0);
  });

  it('should include cases at risk', async () => {
    const report = await service.getBusinessValueSummary();
    expect(report.casesAtRisk.length).toBeGreaterThan(0);
    expect(report.casesAtRisk[0]).toHaveProperty('caseId');
    expect(report.casesAtRisk[0]).toHaveProperty('riskScore');
  });

  it('should include forecast data', async () => {
    const report = await service.getBusinessValueSummary();
    expect(report.forecast).not.toBeNull();
    expect(report.forecast).toHaveProperty('trend');
    expect(report.forecast).toHaveProperty('currentLoad');
  });

  it('should include pending by type', async () => {
    const report = await service.getBusinessValueSummary();
    expect(report.pendingByType.length).toBeGreaterThan(0);
    expect(report.pendingByType[0]).toHaveProperty('caseType');
    expect(report.pendingByType[0]).toHaveProperty('count');
  });

  it('should set generatedAt to current timestamp', async () => {
    const before = new Date().toISOString();
    const report = await service.getBusinessValueSummary();
    const after = new Date().toISOString();
    expect(report.generatedAt >= before).toBe(true);
    expect(report.generatedAt <= after).toBe(true);
  });
});
