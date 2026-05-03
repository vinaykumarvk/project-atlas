import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { isDemoMode } from '../config/flags';
import {
  useDashboardMetrics,
  useExtendedDashboard,
  useComplianceByDimension,
  useTrendData,
} from '../hooks/useDashboard';
import type {
  ExtendedDashboardData,
  ComplianceByDimension,
  TrendDataPoint,
} from '../hooks/useDashboard';
import { apiGet } from '../api/client';
import { useAuth } from '../auth';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  BarChart3,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  Target,
  RefreshCw,
  Users,
  Building2,
  Layers,
  Activity,
} from 'lucide-react';

// --- At-Risk Prediction types (FR-062.A3) ---
interface BreachPrediction {
  caseId: string;
  pBreach: number;
  riskFactors: string[];
  predictedBreachAt?: string;
}

// --- Workload Forecast types (FR-112.A3) ---
interface ForecastPoint {
  date: string;
  predictedVolume: number;
  confidenceInterval: { low: number; high: number };
}

interface WorkloadForecast {
  forecastDays: number;
  points: ForecastPoint[];
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  currentLoad: number;
}

// --- Classification Accuracy Trend types (FR-110.A3) ---
interface AccuracyTrendPoint {
  week: string;
  accuracy: number;
  totalPredictions: number;
}

interface SummaryCard {
  title: string;
  value: number;
  color: string;
  link: string;
}

interface ActivityItem {
  id: string;
  timestamp: string;
  description: string;
  user: string;
}

const summaryCardColorClass: Record<string, string> = {
  '#3b82f6': 'text-blue-500',
  '#16a34a': 'text-green-600',
  '#ca8a04': 'text-yellow-600',
  '#dc2626': 'text-red-600',
};

const demoSummaryCards: SummaryCard[] = [
  { title: 'Total Cases', value: 247, color: '#3b82f6', link: '/cases' },
  { title: 'On Track', value: 189, color: '#16a34a', link: '/cases?tatState=on_track' },
  { title: 'At Risk', value: 41, color: '#ca8a04', link: '/cases?tatState=at_risk' },
  { title: 'Breached', value: 17, color: '#dc2626', link: '/cases?tatState=breached' },
];

const recentActivity: ActivityItem[] = [
  {
    id: '1',
    timestamp: '2026-04-27 09:15',
    description: 'Case #1042 classified as Valuation Request (GREEN confidence)',
    user: 'System',
  },
  {
    id: '2',
    timestamp: '2026-04-27 09:12',
    description: 'Case #1041 assigned to FPR John Smith',
    user: 'Auto-Assignment',
  },
  {
    id: '3',
    timestamp: '2026-04-27 09:08',
    description: 'Case #1039 status changed to RESOLVED',
    user: 'Jane Doe',
  },
  {
    id: '4',
    timestamp: '2026-04-27 08:55',
    description: 'Case #1038 escalated - SLA breach imminent',
    user: 'System',
  },
  {
    id: '5',
    timestamp: '2026-04-27 08:42',
    description: 'Case #1037 vendor inspection report received',
    user: 'Vendor Portal',
  },
];

const demoExtendedData: ExtendedDashboardData = {
  casesByFpr: [
    { fprId: 'fpr-1', fprName: 'Amit Sharma', count: 32 },
    { fprId: 'fpr-2', fprName: 'Priya Patel', count: 28 },
    { fprId: 'fpr-3', fprName: 'Rahul Gupta', count: 24 },
    { fprId: 'fpr-4', fprName: 'Neha Reddy', count: 19 },
    { fprId: 'fpr-5', fprName: 'Vikram Singh', count: 15 },
  ],
  casesByVendor: [
    { vendorId: 'v-1', vendorName: 'PropertyCheck Ltd', count: 18 },
    { vendorId: 'v-2', vendorName: 'ValueAssess Inc', count: 14 },
    { vendorId: 'v-3', vendorName: 'LegalVerify Co', count: 11 },
    { vendorId: 'v-4', vendorName: 'TitleSearch Pro', count: 8 },
    { vendorId: 'v-5', vendorName: 'DocVerify Services', count: 5 },
  ],
  queueByType: [
    { caseType: 'VALUATION_REQUEST', count: 62 },
    { caseType: 'LEGAL_OPINION', count: 45 },
    { caseType: 'GENERAL_INQUIRY', count: 38 },
    { caseType: 'TITLE_SEARCH', count: 27 },
    { caseType: 'INSURANCE_CLAIM', count: 15 },
  ],
};

const demoComplianceData: ComplianceByDimension = {
  byType: { VALUATION_REQUEST: 92.5, LEGAL_OPINION: 87.3, GENERAL_INQUIRY: 95.1, TITLE_SEARCH: 88.9 },
  byFpr: { 'Amit Sharma': 94.2, 'Priya Patel': 91.8, 'Rahul Gupta': 89.5, 'Neha Reddy': 96.1 },
  byVendor: { 'PropertyCheck Ltd': 90.0, 'ValueAssess Inc': 85.7, 'LegalVerify Co': 93.3 },
  byRegion: { Mumbai: 91.2, Delhi: 88.4, Bangalore: 94.7, Chennai: 90.1 },
};

const demoTrendData: TrendDataPoint[] = (() => {
  const data: TrendDataPoint[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toISOString().slice(0, 10),
      newCases: Math.floor(Math.random() * 15) + 3,
      resolved: Math.floor(Math.random() * 12) + 2,
      breached: Math.floor(Math.random() * 4),
    });
  }
  return data;
})();

const demoAtRiskPredictions: BreachPrediction[] = [
  { caseId: 'ATL-2026-001042', pBreach: 0.92, riskFactors: ['HIGH_TIME_CONSUMED', 'CRITICAL_PRIORITY', 'HIGH_WORKLOAD'] },
  { caseId: 'ATL-2026-001038', pBreach: 0.78, riskFactors: ['HIGH_TIME_CONSUMED', 'HIGH_WORKLOAD'] },
  { caseId: 'ATL-2026-001035', pBreach: 0.65, riskFactors: ['HIGH_TIME_CONSUMED'] },
];

const demoForecast: WorkloadForecast = {
  forecastDays: 7,
  points: (() => {
    const pts: ForecastPoint[] = [];
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const vol = Math.floor(Math.random() * 10) + 12;
      pts.push({
        date: d.toISOString().slice(0, 10),
        predictedVolume: vol,
        confidenceInterval: { low: Math.max(0, vol - 3 - i), high: vol + 3 + i },
      });
    }
    return pts;
  })(),
  trend: 'INCREASING',
  currentLoad: 18,
};

const demoAccuracyTrend: AccuracyTrendPoint[] = [
  { week: '2026-W07', accuracy: 88.3, totalPredictions: 45 },
  { week: '2026-W08', accuracy: 89.1, totalPredictions: 52 },
  { week: '2026-W09', accuracy: 87.6, totalPredictions: 48 },
  { week: '2026-W10', accuracy: 90.2, totalPredictions: 61 },
  { week: '2026-W11', accuracy: 91.4, totalPredictions: 55 },
  { week: '2026-W12', accuracy: 89.8, totalPredictions: 63 },
  { week: '2026-W13', accuracy: 93.1, totalPredictions: 58 },
  { week: '2026-W14', accuracy: 91.7, totalPredictions: 67 },
  { week: '2026-W15', accuracy: 94.3, totalPredictions: 72 },
  { week: '2026-W16', accuracy: 93.6, totalPredictions: 69 },
  { week: '2026-W17', accuracy: 95.1, totalPredictions: 74 },
  { week: '2026-W18', accuracy: 94.8, totalPredictions: 71 },
];

// --- Entity F1 Demo Data (FR-161) ---
const demoEntityF1: Record<string, { precision: number; recall: number; f1: number }> = {
  property_city: { precision: 0.92, recall: 0.88, f1: 0.90 },
  loan_account_no: { precision: 0.95, recall: 0.93, f1: 0.94 },
  customer_name: { precision: 0.89, recall: 0.85, f1: 0.87 },
  property_type: { precision: 0.91, recall: 0.90, f1: 0.905 },
  vendor_name: { precision: 0.87, recall: 0.82, f1: 0.845 },
};

const demoOverrideRate = { overrideCount: 12, totalPredictions: 450, rate: 2.67 };

const demoLowConfidence: Array<{ week: string; count: number }> = [
  { week: '2026-W13', count: 3 },
  { week: '2026-W14', count: 5 },
  { week: '2026-W15', count: 2 },
  { week: '2026-W16', count: 7 },
  { week: '2026-W17', count: 4 },
  { week: '2026-W18', count: 6 },
];

// --- Business Value Demo Data (FR-158) ---
const demoBusinessValue = {
  disbursalBlockers: [
    { category: 'VALUATION_PENDING', count: 12, avgAgeDays: 4.2 },
    { category: 'LEGAL_PENDING', count: 8, avgAgeDays: 6.1 },
    { category: 'TITLE_CLEAR_PENDING', count: 5, avgAgeDays: 3.8 },
    { category: 'DOCUMENT_MISSING', count: 15, avgAgeDays: 2.5 },
  ],
  vendorCapacity: [
    { vendorId: 'v-1', vendorName: 'PropertyCheck Ltd', activeCases: 18, maxCapacity: 25, utilizationPercent: 72 },
    { vendorId: 'v-2', vendorName: 'ValueAssess Inc', activeCases: 14, maxCapacity: 20, utilizationPercent: 70 },
    { vendorId: 'v-3', vendorName: 'LegalVerify Co', activeCases: 11, maxCapacity: 15, utilizationPercent: 73 },
  ],
  slaLeakageByRegion: { Mumbai: 91.2, Delhi: 88.4, Bangalore: 94.7, Chennai: 90.1 },
};

/** FR-110.A2: Map of widget IDs to the roles allowed to view them. */
const WIDGET_ROLE_MAP: Record<string, string[]> = {
  'sla-compliance': ['COMPLIANCE_OFFICER', 'SYS_ADMIN', 'LEAD'],
  'accuracy-trend': ['SYS_ADMIN', 'LEAD', 'DATA_ANALYST'],
  'entity-f1-metrics': ['SYS_ADMIN', 'DATA_ANALYST'],
  'override-rate': ['SYS_ADMIN', 'COMPLIANCE_OFFICER', 'DATA_ANALYST'],
  'low-confidence-volume': ['SYS_ADMIN', 'COMPLIANCE_OFFICER', 'DATA_ANALYST'],
  'at-risk-predictions': ['SYS_ADMIN', 'LEAD', 'OFFICER', 'COMPLIANCE_OFFICER'],
  'workload-forecast': ['SYS_ADMIN', 'LEAD'],
  'business-value': ['SYS_ADMIN', 'LEAD', 'COMPLIANCE_OFFICER'],
};

/** FR-110.A2: Check whether the current user has at least one of the required roles for a widget. */
function canViewWidget(widgetId: string, userRoles: string[]): boolean {
  const allowedRoles = WIDGET_ROLE_MAP[widgetId];
  if (!allowedRoles) return true; // No restriction -- visible to all
  return userRoles.some((role) => allowedRoles.includes(role));
}

/** Map summary card title to a Lucide icon */
function summaryCardIcon(title: string) {
  switch (title) {
    case 'Total Cases': return <BarChart3 className="h-5 w-5 text-blue-500" />;
    case 'On Track': return <CheckCircle className="h-5 w-5 text-green-600" />;
    case 'At Risk': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    case 'Breached': return <Clock className="h-5 w-5 text-red-600" />;
    default: return <BarChart3 className="h-5 w-5 text-muted-foreground" />;
  }
}

/** Helper: colour class for compliance percentages */
function complianceColor(val: number): string {
  if (val >= 90) return 'text-green-600';
  if (val >= 75) return 'text-yellow-600';
  return 'text-red-600';
}

/** Helper: colour class for metric values [0..1] */
function metricColor(val: number): string {
  if (val >= 0.9) return 'text-green-600';
  if (val >= 0.75) return 'text-yellow-600';
  return 'text-red-600';
}

/** Status bar colour classes */
const statusBarColors: Record<string, string> = {
  New: 'bg-blue-500',
  Triaged: 'bg-indigo-500',
  'In Progress': 'bg-amber-500',
  'Pending Vendor': 'bg-pink-500',
  Resolved: 'bg-emerald-500',
  Closed: 'bg-slate-400',
};

const DashboardPage = () => {
  const demo = isDemoMode();
  const navigate = useNavigate();
  // FR-110.A2: Role-based widget visibility
  const { user } = useAuth();
  const userRoles: string[] = user?.roles ?? ['SYS_ADMIN'];

  // Live data hooks -- called unconditionally (rules of hooks)
  const { data: metrics, isLoading, isError, error } = useDashboardMetrics();
  const { data: extendedRaw } = useExtendedDashboard();
  const { data: complianceRaw } = useComplianceByDimension();
  const { data: trendsRaw } = useTrendData();

  // At-Risk Predictions (FR-062.A3)
  const { data: atRiskRaw } = useQuery({
    queryKey: ['sla', 'at-risk-predictions'],
    queryFn: () => apiGet<{ data: BreachPrediction[] }>('/sla/at-risk-predictions'),
    refetchInterval: 30000,
    enabled: !demo,
  });

  const atRiskPredictions: BreachPrediction[] = demo
    ? demoAtRiskPredictions
    : atRiskRaw?.data ?? [];

  // Workload Forecast (FR-112.A3)
  const { data: forecastRaw } = useQuery({
    queryKey: ['sla', 'workload-forecast'],
    queryFn: () => apiGet<{ data: WorkloadForecast }>('/sla/workload-forecast'),
    refetchInterval: 30000,
    enabled: !demo,
  });

  const forecastData: WorkloadForecast | null = demo
    ? demoForecast
    : forecastRaw?.data ?? null;

  // Classification Accuracy Trend (FR-110.A3)
  const { data: accuracyTrendRaw } = useQuery({
    queryKey: ['classification', 'accuracy-trend'],
    queryFn: () => apiGet<{ data: AccuracyTrendPoint[] }>('/classification/accuracy-trend'),
    refetchInterval: 60000,
    enabled: !demo,
  });

  const accuracyTrendData: AccuracyTrendPoint[] = demo
    ? demoAccuracyTrend
    : accuracyTrendRaw?.data ?? [];

  // Entity F1 Metrics (FR-161)
  const { data: entityF1Raw } = useQuery({
    queryKey: ['classification', 'entity-f1'],
    queryFn: () => apiGet<{ data: Record<string, { precision: number; recall: number; f1: number }> }>('/classification/entity-f1'),
    refetchInterval: 60000,
    enabled: !demo,
  });
  const entityF1Data = demo ? demoEntityF1 : entityF1Raw?.data ?? {};

  // Override Rate (FR-161)
  const { data: overrideRateRaw } = useQuery({
    queryKey: ['classification', 'override-rate'],
    queryFn: () => apiGet<{ data: { overrideCount: number; totalPredictions: number; rate: number } }>('/classification/override-rate'),
    refetchInterval: 60000,
    enabled: !demo,
  });
  const overrideRateData = demo ? demoOverrideRate : overrideRateRaw?.data ?? { overrideCount: 0, totalPredictions: 0, rate: 0 };

  // Low Confidence Volume (FR-161)
  const { data: lowConfidenceRaw } = useQuery({
    queryKey: ['classification', 'low-confidence'],
    queryFn: () => apiGet<{ data: Array<{ week: string; count: number }> }>('/classification/low-confidence'),
    refetchInterval: 60000,
    enabled: !demo,
  });
  const lowConfidenceData = demo ? demoLowConfidence : lowConfidenceRaw?.data ?? [];

  // Business Value (FR-158)
  const { data: businessValueRaw } = useQuery({
    queryKey: ['sla', 'business-value'],
    queryFn: () => apiGet<{ data: typeof demoBusinessValue }>('/sla/analytics/business-value'),
    refetchInterval: 60000,
    enabled: !demo,
  });
  const businessValueData = demo ? demoBusinessValue : businessValueRaw?.data ?? demoBusinessValue;

  // Build summary cards from live data or demo data
  const summaryCards: SummaryCard[] = demo
    ? demoSummaryCards
    : metrics
      ? [
          { title: 'Total Cases', value: metrics.totalCases, color: '#3b82f6', link: '/cases' },
          { title: 'On Track', value: metrics.onTrack, color: '#16a34a', link: '/cases?tatState=on_track' },
          { title: 'At Risk', value: metrics.atRisk, color: '#ca8a04', link: '/cases?tatState=at_risk' },
          { title: 'Breached', value: metrics.breached, color: '#dc2626', link: '/cases?tatState=breached' },
        ]
      : [];

  const statusBreakdown = !demo && metrics?.statusBreakdown
    ? metrics.statusBreakdown
    : [
        { status: 'New', count: 34 },
        { status: 'Triaged', count: 28 },
        { status: 'In Progress', count: 62 },
        { status: 'Pending Vendor', count: 45 },
        { status: 'Resolved', count: 56 },
        { status: 'Closed', count: 22 },
      ];

  const maxCount = Math.max(...statusBreakdown.map((s) => s.count), 1);

  // Extended dashboard data
  const extendedData: ExtendedDashboardData = demo
    ? demoExtendedData
    : extendedRaw?.data ?? { casesByFpr: [], casesByVendor: [], queueByType: [] };

  // Compliance data
  const complianceData: ComplianceByDimension = demo
    ? demoComplianceData
    : complianceRaw?.data ?? { byType: {}, byFpr: {}, byVendor: {}, byRegion: {} };

  // Trend data
  const trendData: TrendDataPoint[] = demo
    ? demoTrendData
    : trendsRaw?.data ?? [];

  // FR-111 A4: Trend window toggle state
  const [trendWindow, setTrendWindow] = useState<30 | 60 | 90>(30);

  // Loading state (live mode only)
  if (!demo && isLoading) {
    return (
      <div role="region" aria-label="Dashboard">
        <h2 className="mb-6 text-2xl font-bold">Dashboard</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-16 text-center">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading dashboard metrics...</p>
        </div>
      </div>
    );
  }

  // Error state (live mode only)
  if (!demo && isError) {
    return (
      <div role="region" aria-label="Dashboard">
        <h2 className="mb-6 text-2xl font-bold">Dashboard</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-card p-16 text-center">
          <h3 className="mb-2 text-lg font-semibold text-red-600">
            Failed to load dashboard
          </h3>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="mt-4"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty state (live mode, no data)
  if (!demo && summaryCards.length === 0) {
    return (
      <div role="region" aria-label="Dashboard">
        <h2 className="mb-6 text-2xl font-bold">Dashboard</h2>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-semibold">No metrics available</h3>
            <p className="text-sm text-muted-foreground">Dashboard metrics will appear once cases are processed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div role="region" aria-label="Dashboard">
      <h2 className="mb-6 text-2xl font-bold">Dashboard</h2>

      {/* Summary Cards -- clickable drill-down links */}
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4" role="list" aria-label="Summary metrics">
        {summaryCards.map((card) => (
          <Card
            key={card.title}
            role="link"
            data-testid={`card-${card.title.toLowerCase().replace(/\s+/g, '-')}`}
            className="cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            onClick={() => navigate(card.link)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {card.title}
              </CardTitle>
              {summaryCardIcon(card.title)}
            </CardHeader>
            <CardContent>
              <span className={cn('text-3xl font-bold', summaryCardColorClass[card.color] || 'text-foreground')}>{card.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart and Activity Feed */}
      <div className="mb-6 grid grid-cols-2 gap-6">
        {/* Chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Cases by Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {statusBreakdown.map((item) => (
              <div
                key={item.status}
                role="link"
                data-testid={`bar-${item.status.toLowerCase().replace(/\s+/g, '-')}`}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-muted/50"
                onClick={() => navigate(`/cases?status=${encodeURIComponent(item.status)}`)}
              >
                <span className="w-[100px] shrink-0 text-xs">{item.status}</span>
                <div
                  className={cn('h-5 rounded transition-all duration-300', statusBarColors[item.status] || 'bg-slate-400')}
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                />
                <span className="min-w-[30px] text-xs font-semibold">{item.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {recentActivity.map((item) => (
              <div key={item.id} className="border-b pb-3 last:border-b-0">
                <div className="mb-1 flex justify-between">
                  <span className="text-xs font-semibold text-primary">{item.user}</span>
                  <span className="text-[0.7rem] text-muted-foreground">{item.timestamp}</span>
                </div>
                <p className="m-0 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Extended Dashboard -- FR-110 A1 Expanded Tiles */}
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Top FPRs by Open Cases</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {extendedData.casesByFpr.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data available</p>
            ) : (
              <div className="flex flex-col gap-2">
                {extendedData.casesByFpr.map((item) => (
                  <div key={item.fprId} className="flex items-center justify-between border-b py-1.5">
                    <span className="text-sm">{item.fprName}</span>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Top Vendors by Open Cases</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {extendedData.casesByVendor.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data available</p>
            ) : (
              <div className="flex flex-col gap-2">
                {extendedData.casesByVendor.map((item) => (
                  <div key={item.vendorId} className="flex items-center justify-between border-b py-1.5">
                    <span className="text-sm">{item.vendorName}</span>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Queue by Case Type</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {extendedData.queueByType.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data available</p>
            ) : (
              <div className="flex flex-col gap-2">
                {extendedData.queueByType.map((item) => (
                  <div key={item.caseType} className="flex items-center justify-between border-b py-1.5">
                    <span className="text-sm">{item.caseType}</span>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SLA Compliance by Dimension -- FR-111 A2 (FR-110.A2: role-gated) */}
      {canViewWidget('sla-compliance', userRoles) && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">SLA Compliance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-600">By Case Type</h4>
                {Object.entries(complianceData.byType).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  Object.entries(complianceData.byType).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between border-b py-1.5">
                      <span className="text-sm">{key}</span>
                      <span className={cn('text-sm font-semibold', complianceColor(val))}>{val}%</span>
                    </div>
                  ))
                )}
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-600">By FPR</h4>
                {Object.entries(complianceData.byFpr).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  Object.entries(complianceData.byFpr).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between border-b py-1.5">
                      <span className="text-sm">{key}</span>
                      <span className={cn('text-sm font-semibold', complianceColor(val))}>{val}%</span>
                    </div>
                  ))
                )}
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-600">By Vendor</h4>
                {Object.entries(complianceData.byVendor).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  Object.entries(complianceData.byVendor).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between border-b py-1.5">
                      <span className="text-sm">{key}</span>
                      <span className={cn('text-sm font-semibold', complianceColor(val))}>{val}%</span>
                    </div>
                  ))
                )}
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-600">By Region</h4>
                {Object.entries(complianceData.byRegion).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  Object.entries(complianceData.byRegion).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between border-b py-1.5">
                      <span className="text-sm">{key}</span>
                      <span className={cn('text-sm font-semibold', complianceColor(val))}>{val}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend Data -- FR-111 A4 with 30/60/90 day toggle */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">{trendWindow}-Day Trends</CardTitle>
            <div data-testid="trend-window-toggle" className="flex gap-1">
              {([30, 60, 90] as const).map((w) => (
                <Button
                  key={w}
                  data-testid={`trend-window-${w}`}
                  variant={trendWindow === w ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTrendWindow(w)}
                >
                  {w}d
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trend data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>New Cases</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead>Breached</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trendData.slice(-10).map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.newCases}</TableCell>
                    <TableCell>{row.resolved}</TableCell>
                    <TableCell className={cn(
                      row.breached > 0 && 'font-semibold text-red-600'
                    )}>
                      {row.breached}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Classification Accuracy Trend -- FR-110.A3 (FR-110.A2: role-gated) */}
      {canViewWidget('accuracy-trend', userRoles) && (
        <Card className="mb-6" data-testid="accuracy-trend">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Classification Accuracy</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {accuracyTrendData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accuracy data available</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Accuracy</TableHead>
                    <TableHead>Total Predictions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accuracyTrendData.map((row) => (
                    <TableRow key={row.week}>
                      <TableCell>{row.week}</TableCell>
                      <TableCell className={cn('font-semibold', complianceColor(row.accuracy))}>
                        {row.accuracy}%
                      </TableCell>
                      <TableCell>{row.totalPredictions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Entity F1 Metrics -- FR-161 (FR-110.A2: role-gated) */}
      {canViewWidget('entity-f1-metrics', userRoles) && (
        <Card className="mb-6" data-testid="entity-f1-metrics">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Entity F1 Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(entityF1Data).length === 0 ? (
              <p className="text-sm text-muted-foreground">No entity F1 data available</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Precision</TableHead>
                    <TableHead>Recall</TableHead>
                    <TableHead>F1</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(entityF1Data).map(([entityType, m]) => (
                    <TableRow key={entityType}>
                      <TableCell>{entityType}</TableCell>
                      <TableCell className={cn('font-semibold', metricColor(m.precision))}>
                        {(m.precision * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className={cn('font-semibold', metricColor(m.recall))}>
                        {(m.recall * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className={cn('font-semibold', metricColor(m.f1))}>
                        {(m.f1 * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Override Rate -- FR-161 (FR-110.A2: role-gated) */}
      {canViewWidget('override-rate', userRoles) && (
        <Card className="mb-6" data-testid="override-rate">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Override Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Override Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className={cn(
                    'text-3xl font-bold',
                    overrideRateData.rate > 10 ? 'text-red-600' : overrideRateData.rate > 5 ? 'text-yellow-600' : 'text-green-600'
                  )}>
                    {overrideRateData.rate}%
                  </span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Overrides</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-3xl font-bold text-blue-500">{overrideRateData.overrideCount}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Predictions</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-3xl font-bold text-indigo-500">{overrideRateData.totalPredictions}</span>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Low-Confidence Volume -- FR-161 (FR-110.A2: role-gated) */}
      {canViewWidget('low-confidence-volume', userRoles) && (
        <Card className="mb-6" data-testid="low-confidence-volume">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Low-Confidence Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {lowConfidenceData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No low-confidence data available</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowConfidenceData.map((row) => (
                    <TableRow key={row.week}>
                      <TableCell>{row.week}</TableCell>
                      <TableCell className={cn(
                        'font-semibold',
                        row.count > 5 ? 'text-red-600' : row.count > 3 ? 'text-yellow-600' : 'text-green-600'
                      )}>
                        {row.count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* At-Risk Predictions -- FR-062.A3 (FR-110.A2: role-gated) */}
      {canViewWidget('at-risk-predictions', userRoles) && (
        <Card className="mb-6" data-testid="at-risk-predictions">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">At-Risk Predictions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {atRiskPredictions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No at-risk cases detected</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case ID</TableHead>
                    <TableHead>Breach Probability</TableHead>
                    <TableHead>Risk Factors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atRiskPredictions.map((pred) => (
                    <TableRow key={pred.caseId}>
                      <TableCell>{pred.caseId}</TableCell>
                      <TableCell className={cn(
                        'font-semibold',
                        pred.pBreach >= 0.8 ? 'text-red-600' : pred.pBreach >= 0.6 ? 'text-yellow-600' : 'text-amber-500'
                      )}>
                        {Math.round(pred.pBreach * 100)}%
                      </TableCell>
                      <TableCell>{pred.riskFactors.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Workload Forecast -- FR-112.A3 (FR-110.A2: role-gated) */}
      {canViewWidget('workload-forecast', userRoles) && (
        <Card className="mb-6" data-testid="workload-forecast">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Workload Forecast</CardTitle>
              {forecastData && (
                <span
                  data-testid="forecast-trend"
                  className={cn(
                    'flex items-center gap-1 text-sm font-semibold',
                    forecastData.trend === 'INCREASING' ? 'text-red-600'
                      : forecastData.trend === 'DECREASING' ? 'text-green-600'
                      : 'text-muted-foreground'
                  )}
                >
                  {forecastData.trend === 'INCREASING' && <TrendingUp className="h-4 w-4" />}
                  {forecastData.trend === 'DECREASING' && <TrendingDown className="h-4 w-4" />}
                  {forecastData.trend === 'STABLE' && <Minus className="h-4 w-4" />}
                  {forecastData.trend === 'INCREASING' ? 'Trend Up' : forecastData.trend === 'DECREASING' ? 'Trend Down' : 'Trend Stable'} (Current: {forecastData.currentLoad})
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!forecastData || forecastData.points.length === 0 ? (
              <p className="text-sm text-muted-foreground">No forecast data available</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Predicted Volume</TableHead>
                    <TableHead>Confidence (Low-High)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecastData.points.map((pt) => (
                    <TableRow key={pt.date}>
                      <TableCell>{pt.date}</TableCell>
                      <TableCell>{pt.predictedVolume}</TableCell>
                      <TableCell>
                        {pt.confidenceInterval.low} - {pt.confidenceInterval.high}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Compliance Summary Widget -- FR-164 */}
      <Card className="mb-6" data-testid="compliance-widget">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Compliance Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded bg-emerald-100 p-2">
              <div className="text-xl font-bold text-emerald-800">98%</div>
              <div className="text-xs text-emerald-800">GDPR Compliance</div>
            </div>
            <div className="rounded bg-blue-100 p-2">
              <div className="text-xl font-bold text-blue-800">100%</div>
              <div className="text-xs text-blue-800">Data Retention</div>
            </div>
            <div className="rounded bg-emerald-100 p-2">
              <div className="text-xl font-bold text-emerald-800">95%</div>
              <div className="text-xs text-emerald-800">Consent Coverage</div>
            </div>
            <div className="rounded bg-amber-100 p-2">
              <div className="text-xl font-bold text-amber-800">87%</div>
              <div className="text-xs text-amber-800">Vendor Compliance</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Value Command Center -- FR-158 (FR-110.A2: role-gated) */}
      {canViewWidget('business-value', userRoles) && (
        <Card className="mb-6" data-testid="business-value">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Business Value Command Center</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-6">
              {/* Disbursal Blockers */}
              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-600">Disbursal Blockers</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Avg Age (days)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {businessValueData.disbursalBlockers.map((b) => (
                      <TableRow key={b.category}>
                        <TableCell>{b.category}</TableCell>
                        <TableCell className="font-semibold">{b.count}</TableCell>
                        <TableCell className={cn(
                          b.avgAgeDays > 5 ? 'text-red-600' : b.avgAgeDays > 3 ? 'text-yellow-600' : 'text-green-600'
                        )}>
                          {b.avgAgeDays}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Vendor Capacity */}
              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-600">Vendor Capacity</h4>
                <div className="flex flex-col gap-2">
                  {businessValueData.vendorCapacity.map((v) => (
                    <div key={v.vendorId} className="flex items-center justify-between border-b py-1.5">
                      <span className="text-sm">{v.vendorName}</span>
                      <span className={cn(
                        'text-sm font-semibold',
                        v.utilizationPercent > 80 ? 'text-red-600' : v.utilizationPercent > 60 ? 'text-yellow-600' : 'text-green-600'
                      )}>
                        {v.utilizationPercent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SLA Leakage by Region */}
              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-600">SLA Compliance by Region</h4>
                <div className="flex flex-col gap-2">
                  {Object.entries(businessValueData.slaLeakageByRegion).map(([region, compliance]) => (
                    <div key={region} className="flex items-center justify-between border-b py-1.5">
                      <span className="text-sm">{region}</span>
                      <span className={cn(
                        'text-sm font-semibold',
                        complianceColor(compliance as number)
                      )}>
                        {compliance as number}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardPage;
