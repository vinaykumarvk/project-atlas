import { RegulatoryEvidenceService } from '../services/regulatory-evidence.service';

describe('RegulatoryEvidenceService', () => {
  let service: RegulatoryEvidenceService;

  beforeEach(() => {
    service = new RegulatoryEvidenceService();
  });

  it('should generate a complete regulatory evidence report', async () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-04-30');
    const report = await service.generateRegulatoryEvidence(from, to);
    expect(report).toHaveProperty('generatedAt');
    expect(report).toHaveProperty('period');
    expect(report.period.from).toContain('2026-01-01');
    expect(report.period.to).toContain('2026-04-30');
  });

  it('should include audit log summary', async () => {
    const report = await service.generateRegulatoryEvidence(new Date(0), new Date());
    expect(report.auditLogSummary).toHaveProperty('totalEntries');
    expect(report.auditLogSummary).toHaveProperty('chainIntegrity');
  });

  it('should include consent records', async () => {
    const report = await service.generateRegulatoryEvidence(new Date(0), new Date());
    expect(report.consentRecords).toHaveProperty('totalRecords');
    expect(report.consentRecords).toHaveProperty('byStatus');
  });

  it('should include DSR summary', async () => {
    const report = await service.generateRegulatoryEvidence(new Date(0), new Date());
    expect(report.dsrSummary).toHaveProperty('totalRequests');
    expect(report.dsrSummary).toHaveProperty('avgCompletionDays');
  });

  it('should include ASVS report', async () => {
    const report = await service.generateRegulatoryEvidence(new Date(0), new Date());
    expect(report.asvsReport).toHaveProperty('passed');
    expect(report.asvsReport).toHaveProperty('failed');
    expect(report.asvsReport).toHaveProperty('overallScore');
  });

  it('should include DR drill report', async () => {
    const report = await service.generateRegulatoryEvidence(new Date(0), new Date());
    expect(report.drDrillReport).toHaveProperty('lastDrillDate');
    expect(report.drDrillReport).toHaveProperty('overallSuccess');
    expect(report.drDrillReport.steps.length).toBeGreaterThan(0);
  });

  it('should include model risk summary', async () => {
    const report = await service.generateRegulatoryEvidence(new Date(0), new Date());
    expect(report.modelRiskSummary).toHaveProperty('driftDetected');
    expect(report.modelRiskSummary).toHaveProperty('psiScore');
  });

  it('should include security scan summary', async () => {
    const report = await service.generateRegulatoryEvidence(new Date(0), new Date());
    expect(report.securityScanSummary).toHaveProperty('lastScanDate');
    expect(report.securityScanSummary).toHaveProperty('criticalFindings');
  });

  it('should include JIT elevation log', async () => {
    const report = await service.generateRegulatoryEvidence(new Date(0), new Date());
    expect(report.jitElevationLog).toHaveProperty('totalElevations');
  });

  it('should include failover drill report', async () => {
    const report = await service.generateRegulatoryEvidence(new Date(0), new Date());
    expect(report.failoverDrillReport).toHaveProperty('success');
    expect(report.failoverDrillReport.steps.length).toBeGreaterThan(0);
  });
});
