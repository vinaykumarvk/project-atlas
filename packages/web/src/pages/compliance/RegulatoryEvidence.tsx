import { useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isDemoMode } from '../../config/flags';
import { apiGet } from '../../api/client';

interface RegulatoryEvidenceReport {
  generatedAt: string;
  period: { from: string; to: string };
  auditLogSummary: {
    totalEntries: number;
    chainIntegrity: { valid: boolean };
    byEventCode: Record<string, number>;
  };
  consentRecords: { totalRecords: number; byStatus: Record<string, number> };
  dsrSummary: { totalRequests: number; byStatus: Record<string, number>; avgCompletionDays: number };
  asvsReport: { passed: number; failed: number; notApplicable: number; overallScore: number };
  drDrillReport: { lastDrillDate: string | null; overallSuccess: boolean; steps: Array<{ name: string; passed: boolean }> };
  modelRiskSummary: { currentModel: string | null; currentVersion: string | null; driftDetected: boolean; psiScore: number | null };
  securityScanSummary: { lastScanDate: string; criticalFindings: number; highFindings: number };
  jitElevationLog: { totalElevations: number };
  failoverDrillReport: { lastDrillDate: string | null; success: boolean; steps: Array<{ name: string; passed: boolean }> };
}

const demoEvidence: RegulatoryEvidenceReport = {
  generatedAt: new Date().toISOString(),
  period: { from: '2026-04-01', to: '2026-04-30' },
  auditLogSummary: {
    totalEntries: 1247,
    chainIntegrity: { valid: true },
    byEventCode: { CASE_CREATED: 320, CASE_ROUTED: 305, STATUS_CHANGE: 412, LOGIN: 210 },
  },
  consentRecords: { totalRecords: 89, byStatus: { GRANTED: 72, REVOKED: 12, EXPIRED: 5 } },
  dsrSummary: { totalRequests: 14, byStatus: { COMPLETED: 10, IN_PROGRESS: 3, PENDING: 1 }, avgCompletionDays: 4.2 },
  asvsReport: { passed: 12, failed: 2, notApplicable: 1, overallScore: 85.7 },
  drDrillReport: { lastDrillDate: '2026-04-01T03:00:00Z', overallSuccess: true, steps: [{ name: 'db-connectivity', passed: true }, { name: 'redis-connectivity', passed: true }, { name: 's3-connectivity', passed: true }, { name: 'dns-resolution', passed: true }] },
  modelRiskSummary: { currentModel: 'atlas-distilbert-email-classifier', currentVersion: '1.2.0', driftDetected: false, psiScore: 0.04 },
  securityScanSummary: { lastScanDate: '2026-04-28T02:00:00Z', criticalFindings: 0, highFindings: 0 },
  jitElevationLog: { totalElevations: 3 },
  failoverDrillReport: { lastDrillDate: '2026-04-01T03:30:00Z', success: true, steps: [{ name: 'secondary-provider-check', passed: true }, { name: 'mx-swap-verification', passed: true }] },
};

const RegulatoryEvidence = () => {
  const demo = isDemoMode();
  const [fromDate, setFromDate] = useState('2026-04-01');
  const [toDate, setToDate] = useState('2026-04-30');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: evidenceRaw, isLoading } = useQuery({
    queryKey: ['compliance', 'regulatory-evidence', fromDate, toDate],
    queryFn: () => apiGet<{ data: RegulatoryEvidenceReport }>(`/compliance/regulatory-evidence?from_date=${fromDate}&to_date=${toDate}`),
    enabled: !demo,
  });

  const evidence = demo ? demoEvidence : evidenceRaw?.data ?? demoEvidence;

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderSection = (key: string, title: string, content: React.ReactNode) => (
    <div style={styles.section} data-testid={`evidence-${key}`}>
      <div style={styles.sectionHeader} onClick={() => toggleSection(key)}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        <span style={styles.expandIcon}>{expanded[key] ? '-' : '+'}</span>
      </div>
      {expanded[key] && <div style={styles.sectionContent}>{content}</div>}
    </div>
  );

  if (!demo && isLoading) {
    return <div style={styles.container}><p>Loading regulatory evidence...</p></div>;
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Regulatory Evidence Center</h2>

      <div style={styles.dateRange}>
        <label style={styles.dateLabel}>
          From: <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={styles.dateInput} />
        </label>
        <label style={styles.dateLabel}>
          To: <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={styles.dateInput} />
        </label>
      </div>

      <p style={styles.generatedAt}>Generated: {evidence.generatedAt}</p>

      {renderSection('audit', 'Audit Log Summary', (
        <div>
          <p>Total Entries: <strong>{evidence.auditLogSummary.totalEntries}</strong></p>
          <p>Chain Integrity: <span style={{ color: evidence.auditLogSummary.chainIntegrity.valid ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{evidence.auditLogSummary.chainIntegrity.valid ? 'VALID' : 'BROKEN'}</span></p>
          <div>
            {Object.entries(evidence.auditLogSummary.byEventCode).map(([code, count]) => (
              <div key={code} style={styles.row}><span>{code}</span><strong>{count}</strong></div>
            ))}
          </div>
        </div>
      ))}

      {renderSection('consent', 'Consent Records', (
        <div>
          <p>Total Records: <strong>{evidence.consentRecords.totalRecords}</strong></p>
          {Object.entries(evidence.consentRecords.byStatus).map(([status, count]) => (
            <div key={status} style={styles.row}><span>{status}</span><strong>{count}</strong></div>
          ))}
        </div>
      ))}

      {renderSection('dsr', 'Data Subject Requests', (
        <div>
          <p>Total Requests: <strong>{evidence.dsrSummary.totalRequests}</strong></p>
          <p>Avg Completion: <strong>{evidence.dsrSummary.avgCompletionDays} days</strong></p>
          {Object.entries(evidence.dsrSummary.byStatus).map(([status, count]) => (
            <div key={status} style={styles.row}><span>{status}</span><strong>{count}</strong></div>
          ))}
        </div>
      ))}

      {renderSection('asvs', 'ASVS 4.0 Compliance', (
        <div>
          <p>Overall Score: <span style={{ color: evidence.asvsReport.overallScore >= 80 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{evidence.asvsReport.overallScore}%</span></p>
          <div style={styles.row}><span>Passed</span><strong style={{ color: '#16a34a' }}>{evidence.asvsReport.passed}</strong></div>
          <div style={styles.row}><span>Failed</span><strong style={{ color: '#dc2626' }}>{evidence.asvsReport.failed}</strong></div>
          <div style={styles.row}><span>N/A</span><strong>{evidence.asvsReport.notApplicable}</strong></div>
        </div>
      ))}

      {renderSection('dr-drill', 'DR Drill Report', (
        <div>
          <p>Last Drill: <strong>{evidence.drDrillReport.lastDrillDate || 'Never'}</strong></p>
          <p>Overall: <span style={{ color: evidence.drDrillReport.overallSuccess ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{evidence.drDrillReport.overallSuccess ? 'PASS' : 'FAIL'}</span></p>
          {evidence.drDrillReport.steps.map((s) => (
            <div key={s.name} style={styles.row}><span>{s.name}</span><span style={{ color: s.passed ? '#16a34a' : '#dc2626' }}>{s.passed ? 'PASS' : 'FAIL'}</span></div>
          ))}
        </div>
      ))}

      {renderSection('model-risk', 'Model Risk Summary', (
        <div>
          <p>Model: <strong>{evidence.modelRiskSummary.currentModel || 'N/A'}</strong></p>
          <p>Version: <strong>{evidence.modelRiskSummary.currentVersion || 'N/A'}</strong></p>
          <p>Drift Detected: <span style={{ color: evidence.modelRiskSummary.driftDetected ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{evidence.modelRiskSummary.driftDetected ? 'YES' : 'NO'}</span></p>
          <p>PSI Score: <strong>{evidence.modelRiskSummary.psiScore?.toFixed(4) ?? 'N/A'}</strong></p>
        </div>
      ))}

      {renderSection('security', 'Security Scan Summary', (
        <div>
          <p>Last Scan: <strong>{evidence.securityScanSummary.lastScanDate}</strong></p>
          <div style={styles.row}><span>Critical</span><strong style={{ color: evidence.securityScanSummary.criticalFindings > 0 ? '#dc2626' : '#16a34a' }}>{evidence.securityScanSummary.criticalFindings}</strong></div>
          <div style={styles.row}><span>High</span><strong style={{ color: evidence.securityScanSummary.highFindings > 0 ? '#dc2626' : '#16a34a' }}>{evidence.securityScanSummary.highFindings}</strong></div>
        </div>
      ))}

      {renderSection('jit', 'JIT Access Elevation Log', (
        <p>Total Elevations: <strong>{evidence.jitElevationLog.totalElevations}</strong></p>
      ))}

      {renderSection('failover', 'Provider Failover Drill', (
        <div>
          <p>Last Drill: <strong>{evidence.failoverDrillReport.lastDrillDate || 'Never'}</strong></p>
          <p>Overall: <span style={{ color: evidence.failoverDrillReport.success ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{evidence.failoverDrillReport.success ? 'PASS' : 'FAIL'}</span></p>
          {evidence.failoverDrillReport.steps.map((s) => (
            <div key={s.name} style={styles.row}><span>{s.name}</span><span style={{ color: s.passed ? '#16a34a' : '#dc2626' }}>{s.passed ? 'PASS' : 'FAIL'}</span></div>
          ))}
        </div>
      ))}
    </div>
  );
};

const styles: Record<string, CSSProperties> = {
  container: { padding: '0' },
  heading: { margin: '0 0 1.5rem 0', fontSize: '1.5rem', fontWeight: 700 },
  dateRange: { display: 'flex', gap: '1rem', marginBottom: '1rem' },
  dateLabel: { fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  dateInput: { padding: '0.4rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '0.85rem' },
  generatedAt: { fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1.5rem' },
  section: { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', marginBottom: '0.75rem', overflow: 'hidden' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer' },
  sectionTitle: { margin: 0, fontSize: '1rem', fontWeight: 600 },
  expandIcon: { fontSize: '1.2rem', fontWeight: 700, color: '#6b7280' },
  sectionContent: { padding: '0 1.25rem 1rem 1.25rem', fontSize: '0.85rem', lineHeight: 1.6 },
  row: { display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--color-border)' },
};

export default RegulatoryEvidence;
