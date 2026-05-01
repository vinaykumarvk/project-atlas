import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VendorScorecard {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  category: string;
  tatCompliancePercent: number;
  qualityScore: number;
  reworkRate: number;
  varianceFromEstimates: number;
  totalCasesHandled: number;
  activeCases: number;
  serviceGeographies: string[];
  serviceCaseTypes: string[];
}

export interface VendorSummary {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  category: string;
  qualityScore: number;
  tatCompliancePercent: number;
  isActive: boolean;
}

export interface RiskSummaryCase {
  id: string;
  caseNumber: string;
  caseType: string;
  riskScore: number;
  riskTier: string;
  propertyCity: string | null;
  status: string;
  documentCompleteness: number;
  valuationVariance: boolean;
}

export interface CollateralRiskSummary {
  totalCases: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
  cases: RiskSummaryCase[];
}

export interface DisbursalReadinessCase {
  id: string;
  caseNumber: string;
  caseType: string;
  status: string;
  riskScore: number;
  propertyCity: string | null;
  assignedFprId: string | null;
}

export interface DisbursalReadinessGroup {
  category: string;
  count: number;
  cases: DisbursalReadinessCase[];
}

export interface DisbursalReadinessData {
  groups: DisbursalReadinessGroup[];
  totalBlocked: number;
  totalReady: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const collateralKeys = {
  all: ['collateral'] as const,
  vendorScorecard: (id: string) => [...collateralKeys.all, 'vendorScorecard', id] as const,
  vendorList: () => [...collateralKeys.all, 'vendors'] as const,
  riskSummary: () => [...collateralKeys.all, 'riskSummary'] as const,
  disbursalReadiness: () => [...collateralKeys.all, 'disbursalReadiness'] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /vendors/:id/scorecard — vendor performance scorecard */
export function useVendorScorecard(vendorId: string) {
  return useQuery({
    queryKey: collateralKeys.vendorScorecard(vendorId),
    queryFn: () =>
      apiGet<{ data: VendorScorecard }>(`/vendors/${vendorId}/scorecard`).then(
        (res) => res.data,
      ),
    enabled: !!vendorId,
  });
}

/** GET /vendors — list all active vendors */
export function useVendorList() {
  return useQuery({
    queryKey: collateralKeys.vendorList(),
    queryFn: () =>
      apiGet<{ data: VendorSummary[] }>('/vendors').then((res) => res.data),
  });
}

/** GET /cases/risk-summary — aggregate risk data for dashboard */
export function useCollateralRisk() {
  return useQuery({
    queryKey: collateralKeys.riskSummary(),
    queryFn: () =>
      apiGet<{ data: CollateralRiskSummary }>('/cases/risk-summary').then(
        (res) => res.data,
      ),
  });
}

/** GET /cases/disbursal-readiness — cases grouped by blocker category */
export function useDisbursalReadiness() {
  return useQuery({
    queryKey: collateralKeys.disbursalReadiness(),
    queryFn: () =>
      apiGet<{ data: DisbursalReadinessData }>('/cases/disbursal-readiness').then(
        (res) => res.data,
      ),
  });
}
