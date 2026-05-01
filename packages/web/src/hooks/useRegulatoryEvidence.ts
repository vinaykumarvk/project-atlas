import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export interface RegulatoryEvidenceReport {
  generatedAt: string;
  period: { from: string; to: string };
  auditLogSummary: { totalEntries: number; chainIntegrity: { valid: boolean } };
  consentRecords: { totalRecords: number; byStatus: Record<string, number> };
  dsrSummary: { totalRequests: number; byStatus: Record<string, number>; avgCompletionDays: number };
  asvsReport: { passed: number; failed: number; notApplicable: number; overallScore: number };
  drDrillReport: { lastDrillDate: string | null; overallSuccess: boolean };
  modelRiskSummary: { currentModel: string | null; driftDetected: boolean; psiScore: number | null };
  securityScanSummary: { lastScanDate: string; criticalFindings: number; highFindings: number };
  jitElevationLog: { totalElevations: number };
  failoverDrillReport: { lastDrillDate: string | null; success: boolean };
}

const regulatoryEvidenceKeys = {
  all: ['regulatory-evidence'] as const,
  report: (from: string, to: string) => [...regulatoryEvidenceKeys.all, from, to] as const,
};

export function useRegulatoryEvidence(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: regulatoryEvidenceKeys.report(fromDate, toDate),
    queryFn: () => apiGet<{ data: RegulatoryEvidenceReport }>(
      `/compliance/regulatory-evidence?from_date=${fromDate}&to_date=${toDate}`,
    ),
  });
}
