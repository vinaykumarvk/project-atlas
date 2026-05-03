import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isDemoMode } from '../../config/flags';
import { apiGet } from '../../api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
    <Card className="mb-3 overflow-hidden" data-testid={`evidence-${key}`}>
      <Collapsible open={expanded[key]} onOpenChange={() => toggleSection(key)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between cursor-pointer py-4 px-5">
            <CardTitle className="text-base">{title}</CardTitle>
            <span className="text-lg font-bold text-muted-foreground">{expanded[key] ? '-' : '+'}</span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-5 pb-4 pt-0 text-sm leading-relaxed">{content}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );

  if (!demo && isLoading) {
    return <div><p>Loading regulatory evidence...</p></div>;
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Regulatory Evidence Center</h2>

      <div className="flex gap-4 mb-4">
        <label className="text-sm flex items-center gap-2">
          From: <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto" />
        </label>
        <label className="text-sm flex items-center gap-2">
          To: <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto" />
        </label>
      </div>

      <p className="text-xs text-muted-foreground mb-6">Generated: {evidence.generatedAt}</p>

      {renderSection('audit', 'Audit Log Summary', (
        <div>
          <p>Total Entries: <strong>{evidence.auditLogSummary.totalEntries}</strong></p>
          <p>Chain Integrity: <span className={cn('font-semibold', evidence.auditLogSummary.chainIntegrity.valid ? 'text-green-600' : 'text-red-600')}>{evidence.auditLogSummary.chainIntegrity.valid ? 'VALID' : 'BROKEN'}</span></p>
          <div>
            {Object.entries(evidence.auditLogSummary.byEventCode).map(([code, count]) => (
              <div key={code} className="flex justify-between py-1 border-b border-border"><span>{code}</span><strong>{count}</strong></div>
            ))}
          </div>
        </div>
      ))}

      {renderSection('consent', 'Consent Records', (
        <div>
          <p>Total Records: <strong>{evidence.consentRecords.totalRecords}</strong></p>
          {Object.entries(evidence.consentRecords.byStatus).map(([status, count]) => (
            <div key={status} className="flex justify-between py-1 border-b border-border"><span>{status}</span><strong>{count}</strong></div>
          ))}
        </div>
      ))}

      {renderSection('dsr', 'Data Subject Requests', (
        <div>
          <p>Total Requests: <strong>{evidence.dsrSummary.totalRequests}</strong></p>
          <p>Avg Completion: <strong>{evidence.dsrSummary.avgCompletionDays} days</strong></p>
          {Object.entries(evidence.dsrSummary.byStatus).map(([status, count]) => (
            <div key={status} className="flex justify-between py-1 border-b border-border"><span>{status}</span><strong>{count}</strong></div>
          ))}
        </div>
      ))}

      {renderSection('asvs', 'ASVS 4.0 Compliance', (
        <div>
          <p>Overall Score: <span className={cn('font-semibold', evidence.asvsReport.overallScore >= 80 ? 'text-green-600' : 'text-red-600')}>{evidence.asvsReport.overallScore}%</span></p>
          <div className="flex justify-between py-1 border-b border-border"><span>Passed</span><strong className="text-green-600">{evidence.asvsReport.passed}</strong></div>
          <div className="flex justify-between py-1 border-b border-border"><span>Failed</span><strong className="text-red-600">{evidence.asvsReport.failed}</strong></div>
          <div className="flex justify-between py-1 border-b border-border"><span>N/A</span><strong>{evidence.asvsReport.notApplicable}</strong></div>
        </div>
      ))}

      {renderSection('dr-drill', 'DR Drill Report', (
        <div>
          <p>Last Drill: <strong>{evidence.drDrillReport.lastDrillDate || 'Never'}</strong></p>
          <p>Overall: <span className={cn('font-semibold', evidence.drDrillReport.overallSuccess ? 'text-green-600' : 'text-red-600')}>{evidence.drDrillReport.overallSuccess ? 'PASS' : 'FAIL'}</span></p>
          {evidence.drDrillReport.steps.map((s) => (
            <div key={s.name} className="flex justify-between py-1 border-b border-border"><span>{s.name}</span><span className={s.passed ? 'text-green-600' : 'text-red-600'}>{s.passed ? 'PASS' : 'FAIL'}</span></div>
          ))}
        </div>
      ))}

      {renderSection('model-risk', 'Model Risk Summary', (
        <div>
          <p>Model: <strong>{evidence.modelRiskSummary.currentModel || 'N/A'}</strong></p>
          <p>Version: <strong>{evidence.modelRiskSummary.currentVersion || 'N/A'}</strong></p>
          <p>Drift Detected: <span className={cn('font-semibold', evidence.modelRiskSummary.driftDetected ? 'text-red-600' : 'text-green-600')}>{evidence.modelRiskSummary.driftDetected ? 'YES' : 'NO'}</span></p>
          <p>PSI Score: <strong>{evidence.modelRiskSummary.psiScore?.toFixed(4) ?? 'N/A'}</strong></p>
        </div>
      ))}

      {renderSection('security', 'Security Scan Summary', (
        <div>
          <p>Last Scan: <strong>{evidence.securityScanSummary.lastScanDate}</strong></p>
          <div className="flex justify-between py-1 border-b border-border"><span>Critical</span><strong className={evidence.securityScanSummary.criticalFindings > 0 ? 'text-red-600' : 'text-green-600'}>{evidence.securityScanSummary.criticalFindings}</strong></div>
          <div className="flex justify-between py-1 border-b border-border"><span>High</span><strong className={evidence.securityScanSummary.highFindings > 0 ? 'text-red-600' : 'text-green-600'}>{evidence.securityScanSummary.highFindings}</strong></div>
        </div>
      ))}

      {renderSection('jit', 'JIT Access Elevation Log', (
        <p>Total Elevations: <strong>{evidence.jitElevationLog.totalElevations}</strong></p>
      ))}

      {renderSection('failover', 'Provider Failover Drill', (
        <div>
          <p>Last Drill: <strong>{evidence.failoverDrillReport.lastDrillDate || 'Never'}</strong></p>
          <p>Overall: <span className={cn('font-semibold', evidence.failoverDrillReport.success ? 'text-green-600' : 'text-red-600')}>{evidence.failoverDrillReport.success ? 'PASS' : 'FAIL'}</span></p>
          {evidence.failoverDrillReport.steps.map((s) => (
            <div key={s.name} className="flex justify-between py-1 border-b border-border"><span>{s.name}</span><span className={s.passed ? 'text-green-600' : 'text-red-600'}>{s.passed ? 'PASS' : 'FAIL'}</span></div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default RegulatoryEvidence;
