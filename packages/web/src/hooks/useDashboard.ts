import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { CaseRow, PaginatedResponse } from './useCases';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  totalCases: number;
  onTrack: number;
  atRisk: number;
  breached: number;
  statusBreakdown: Array<{
    status: string;
    count: number;
  }>;
}

export interface ExtendedDashboardData {
  casesByFpr: Array<{ fprId: string; fprName: string; count: number }>;
  casesByVendor: Array<{ vendorId: string; vendorName: string; count: number }>;
  queueByType: Array<{ caseType: string; count: number }>;
}

export interface ComplianceByDimension {
  byType: Record<string, number>;
  byFpr: Record<string, number>;
  byVendor: Record<string, number>;
  byRegion: Record<string, number>;
}

export interface TrendDataPoint {
  date: string;
  newCases: number;
  resolved: number;
  breached: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const dashboardKeys = {
  all: ['dashboard'] as const,
  metrics: () => [...dashboardKeys.all, 'metrics'] as const,
  recentCases: () => [...dashboardKeys.all, 'recentCases'] as const,
  extended: () => [...dashboardKeys.all, 'extended'] as const,
  compliance: () => [...dashboardKeys.all, 'compliance'] as const,
  trends: () => [...dashboardKeys.all, 'trends'] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /sla/dashboard — aggregated dashboard metrics (auto-refresh every 30s) */
export function useDashboardMetrics() {
  return useQuery({
    queryKey: dashboardKeys.metrics(),
    queryFn: () => apiGet<DashboardMetrics>('/sla/dashboard'),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });
}

/** GET /cases?limit=10 — recent cases for the dashboard feed */
export function useDashboardCases() {
  return useQuery({
    queryKey: dashboardKeys.recentCases(),
    queryFn: () => apiGet<PaginatedResponse<CaseRow>>('/cases', { limit: 10 }),
  });
}

/** GET /sla/dashboard/extended — FPR, vendor, case type breakdowns */
export function useExtendedDashboard() {
  return useQuery({
    queryKey: dashboardKeys.extended(),
    queryFn: () => apiGet<{ data: ExtendedDashboardData }>('/sla/dashboard/extended'),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });
}

/** GET /sla/analytics/compliance — SLA compliance % by dimension */
export function useComplianceByDimension() {
  return useQuery({
    queryKey: dashboardKeys.compliance(),
    queryFn: () => apiGet<{ data: ComplianceByDimension }>('/sla/analytics/compliance'),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });
}

/** GET /sla/analytics/trends — trend data with configurable window (FR-111 A4) */
export function useTrendData(windowDays: number = 30) {
  return useQuery({
    queryKey: [...dashboardKeys.trends(), windowDays],
    queryFn: () => apiGet<{ data: TrendDataPoint[] }>(`/sla/analytics/trends?window=${windowDays}`),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });
}
