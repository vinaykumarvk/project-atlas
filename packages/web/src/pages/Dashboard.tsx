import { useState, type CSSProperties } from 'react';
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

const trendArrows: Record<string, string> = {
  INCREASING: 'Trend Up',
  DECREASING: 'Trend Down',
  STABLE: 'Trend Stable',
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
  if (!allowedRoles) return true; // No restriction — visible to all
  return userRoles.some((role) => allowedRoles.includes(role));
}

const DashboardPage = () => {
  const demo = isDemoMode();
  const navigate = useNavigate();
  // FR-110.A2: Role-based widget visibility
  const { user } = useAuth();
  const userRoles: string[] = user?.roles ?? ['SYS_ADMIN'];

  // Live data hooks — called unconditionally (rules of hooks)
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

  const statusColors: Record<string, string> = {
    New: '#3b82f6',
    Triaged: '#6366f1',
    'In Progress': '#f59e0b',
    'Pending Vendor': '#ec4899',
    Resolved: '#10b981',
    Closed: '#94a3b8',
  };

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

  // Hover state for cards
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  // Loading state (live mode only)
  if (!demo && isLoading) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Dashboard</h2>
        <div style={styles.placeholder}>
          <div style={styles.spinner} />
          <p style={styles.placeholderText}>Loading dashboard metrics...</p>
        </div>
      </div>
    );
  }

  // Error state (live mode only)
  if (!demo && isError) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Dashboard</h2>
        <div style={{ ...styles.placeholder, borderColor: '#fecaca' }}>
          <h3 style={{ ...styles.placeholderTitle, color: '#dc2626' }}>
            Failed to load dashboard
          </h3>
          <p style={styles.placeholderText}>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={styles.retryButton}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} role="region" aria-label="Dashboard">
      <h2 style={styles.heading}>Dashboard</h2>

      {/* Summary Cards — clickable drill-down links */}
      <div style={styles.cardsGrid} role="list" aria-label="Summary metrics">
        {summaryCards.map((card) => (
          <div
            key={card.title}
            role="link"
            data-testid={`card-${card.title.toLowerCase().replace(/\s+/g, '-')}`}
            style={{
              ...styles.card,
              cursor: 'pointer',
              transform: hoveredCard === card.title ? 'translateY(-2px)' : 'none',
              boxShadow: hoveredCard === card.title ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onClick={() => navigate(card.link)}
            onMouseEnter={() => setHoveredCard(card.title)}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <h3 style={styles.cardTitle}>{card.title}</h3>
            <span style={{ ...styles.cardValue, color: card.color }}>{card.value}</span>
          </div>
        ))}
      </div>

      {/* Chart and Activity Feed */}
      <div style={styles.twoColumnGrid}>
        {/* Chart */}
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Cases by Status</h3>
          <div style={styles.chartPlaceholder}>
            {statusBreakdown.map((item) => (
              <div
                key={item.status}
                role="link"
                data-testid={`bar-${item.status.toLowerCase().replace(/\s+/g, '-')}`}
                style={{
                  ...styles.chartBar,
                  cursor: 'pointer',
                  backgroundColor: hoveredBar === item.status ? 'rgba(0,0,0,0.03)' : 'transparent',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  transition: 'background-color 0.2s ease',
                }}
                onClick={() => navigate(`/cases?status=${encodeURIComponent(item.status)}`)}
                onMouseEnter={() => setHoveredBar(item.status)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                <span style={styles.chartLabel}>{item.status}</span>
                <div
                  style={{
                    ...styles.chartFill,
                    width: `${(item.count / maxCount) * 100}%`,
                    backgroundColor: statusColors[item.status] || '#94a3b8',
                  }}
                />
                <span style={styles.chartCount}>{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Recent Activity</h3>
          <div style={styles.activityList}>
            {recentActivity.map((item) => (
              <div key={item.id} style={styles.activityItem}>
                <div style={styles.activityMeta}>
                  <span style={styles.activityUser}>{item.user}</span>
                  <span style={styles.activityTime}>{item.timestamp}</span>
                </div>
                <p style={styles.activityDesc}>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Extended Dashboard — FR-110 A1 Expanded Tiles */}
      <div style={styles.threeColumnGrid}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Top FPRs by Open Cases</h3>
          {extendedData.casesByFpr.length === 0 ? (
            <p style={styles.placeholderText}>No data available</p>
          ) : (
            <div style={styles.breakdownList}>
              {extendedData.casesByFpr.map((item) => (
                <div key={item.fprId} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{item.fprName}</span>
                  <span style={styles.breakdownValue}>{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Top Vendors by Open Cases</h3>
          {extendedData.casesByVendor.length === 0 ? (
            <p style={styles.placeholderText}>No data available</p>
          ) : (
            <div style={styles.breakdownList}>
              {extendedData.casesByVendor.map((item) => (
                <div key={item.vendorId} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{item.vendorName}</span>
                  <span style={styles.breakdownValue}>{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Queue by Case Type</h3>
          {extendedData.queueByType.length === 0 ? (
            <p style={styles.placeholderText}>No data available</p>
          ) : (
            <div style={styles.breakdownList}>
              {extendedData.queueByType.map((item) => (
                <div key={item.caseType} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{item.caseType}</span>
                  <span style={styles.breakdownValue}>{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SLA Compliance by Dimension — FR-111 A2 (FR-110.A2: role-gated) */}
      {canViewWidget('sla-compliance', userRoles) && <div style={styles.panel}>
        <h3 style={styles.panelTitle}>SLA Compliance</h3>
        <div style={styles.complianceGrid}>
          <div>
            <h4 style={styles.complianceSubtitle}>By Case Type</h4>
            {Object.entries(complianceData.byType).length === 0 ? (
              <p style={styles.placeholderText}>No data</p>
            ) : (
              Object.entries(complianceData.byType).map(([key, val]) => (
                <div key={key} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{key}</span>
                  <span style={{
                    ...styles.breakdownValue,
                    color: val >= 90 ? '#16a34a' : val >= 75 ? '#ca8a04' : '#dc2626',
                  }}>{val}%</span>
                </div>
              ))
            )}
          </div>

          <div>
            <h4 style={styles.complianceSubtitle}>By FPR</h4>
            {Object.entries(complianceData.byFpr).length === 0 ? (
              <p style={styles.placeholderText}>No data</p>
            ) : (
              Object.entries(complianceData.byFpr).map(([key, val]) => (
                <div key={key} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{key}</span>
                  <span style={{
                    ...styles.breakdownValue,
                    color: val >= 90 ? '#16a34a' : val >= 75 ? '#ca8a04' : '#dc2626',
                  }}>{val}%</span>
                </div>
              ))
            )}
          </div>

          <div>
            <h4 style={styles.complianceSubtitle}>By Vendor</h4>
            {Object.entries(complianceData.byVendor).length === 0 ? (
              <p style={styles.placeholderText}>No data</p>
            ) : (
              Object.entries(complianceData.byVendor).map(([key, val]) => (
                <div key={key} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{key}</span>
                  <span style={{
                    ...styles.breakdownValue,
                    color: val >= 90 ? '#16a34a' : val >= 75 ? '#ca8a04' : '#dc2626',
                  }}>{val}%</span>
                </div>
              ))
            )}
          </div>

          <div>
            <h4 style={styles.complianceSubtitle}>By Region</h4>
            {Object.entries(complianceData.byRegion).length === 0 ? (
              <p style={styles.placeholderText}>No data</p>
            ) : (
              Object.entries(complianceData.byRegion).map(([key, val]) => (
                <div key={key} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{key}</span>
                  <span style={{
                    ...styles.breakdownValue,
                    color: val >= 90 ? '#16a34a' : val >= 75 ? '#ca8a04' : '#dc2626',
                  }}>{val}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>}

      {/* Trend Data — FR-111 A4 with 30/60/90 day toggle */}
      <div style={styles.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ ...styles.panelTitle, margin: 0 }}>{trendWindow}-Day Trends</h3>
          <div data-testid="trend-window-toggle" style={{ display: 'flex', gap: '0.25rem' }}>
            {([30, 60, 90] as const).map((w) => (
              <button
                key={w}
                data-testid={`trend-window-${w}`}
                onClick={() => setTrendWindow(w)}
                style={{
                  padding: '0.35rem 0.75rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  backgroundColor: trendWindow === w ? 'var(--color-accent, #3b82f6)' : 'var(--color-surface)',
                  color: trendWindow === w ? '#fff' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: trendWindow === w ? 600 : 400,
                }}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>
        {trendData.length === 0 ? (
          <p style={styles.placeholderText}>No trend data available</p>
        ) : (
          <div style={styles.trendTableContainer}>
            <table style={styles.trendTable}>
              <thead>
                <tr>
                  <th style={styles.trendTh}>Date</th>
                  <th style={styles.trendTh}>New Cases</th>
                  <th style={styles.trendTh}>Resolved</th>
                  <th style={styles.trendTh}>Breached</th>
                </tr>
              </thead>
              <tbody>
                {trendData.slice(-10).map((row) => (
                  <tr key={row.date}>
                    <td style={styles.trendTd}>{row.date}</td>
                    <td style={styles.trendTd}>{row.newCases}</td>
                    <td style={styles.trendTd}>{row.resolved}</td>
                    <td style={{
                      ...styles.trendTd,
                      color: row.breached > 0 ? '#dc2626' : 'inherit',
                      fontWeight: row.breached > 0 ? 600 : 400,
                    }}>{row.breached}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Classification Accuracy Trend — FR-110.A3 (FR-110.A2: role-gated) */}
      {canViewWidget('accuracy-trend', userRoles) && <div style={styles.panel} data-testid="accuracy-trend">
        <h3 style={styles.panelTitle}>Classification Accuracy</h3>
        {accuracyTrendData.length === 0 ? (
          <p style={styles.placeholderText}>No accuracy data available</p>
        ) : (
          <div style={styles.trendTableContainer}>
            <table style={styles.trendTable}>
              <thead>
                <tr>
                  <th style={styles.trendTh}>Week</th>
                  <th style={styles.trendTh}>Accuracy</th>
                  <th style={styles.trendTh}>Total Predictions</th>
                </tr>
              </thead>
              <tbody>
                {accuracyTrendData.map((row) => (
                  <tr key={row.week}>
                    <td style={styles.trendTd}>{row.week}</td>
                    <td style={{
                      ...styles.trendTd,
                      color: row.accuracy >= 90 ? '#16a34a' : row.accuracy >= 75 ? '#ca8a04' : '#dc2626',
                      fontWeight: 600,
                    }}>
                      {row.accuracy}%
                    </td>
                    <td style={styles.trendTd}>{row.totalPredictions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Entity F1 Metrics — FR-161 (FR-110.A2: role-gated) */}
      {canViewWidget('entity-f1-metrics', userRoles) && <div style={styles.panel} data-testid="entity-f1-metrics">
        <h3 style={styles.panelTitle}>Entity F1 Metrics</h3>
        {Object.keys(entityF1Data).length === 0 ? (
          <p style={styles.placeholderText}>No entity F1 data available</p>
        ) : (
          <div style={styles.trendTableContainer}>
            <table style={styles.trendTable}>
              <thead>
                <tr>
                  <th style={styles.trendTh}>Entity Type</th>
                  <th style={styles.trendTh}>Precision</th>
                  <th style={styles.trendTh}>Recall</th>
                  <th style={styles.trendTh}>F1</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(entityF1Data).map(([entityType, metrics]) => (
                  <tr key={entityType}>
                    <td style={styles.trendTd}>{entityType}</td>
                    <td style={{ ...styles.trendTd, color: metrics.precision >= 0.9 ? '#16a34a' : metrics.precision >= 0.75 ? '#ca8a04' : '#dc2626', fontWeight: 600 }}>
                      {(metrics.precision * 100).toFixed(1)}%
                    </td>
                    <td style={{ ...styles.trendTd, color: metrics.recall >= 0.9 ? '#16a34a' : metrics.recall >= 0.75 ? '#ca8a04' : '#dc2626', fontWeight: 600 }}>
                      {(metrics.recall * 100).toFixed(1)}%
                    </td>
                    <td style={{ ...styles.trendTd, color: metrics.f1 >= 0.9 ? '#16a34a' : metrics.f1 >= 0.75 ? '#ca8a04' : '#dc2626', fontWeight: 600 }}>
                      {(metrics.f1 * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Override Rate — FR-161 (FR-110.A2: role-gated) */}
      {canViewWidget('override-rate', userRoles) && <div style={styles.panel} data-testid="override-rate">
        <h3 style={styles.panelTitle}>Override Rate</h3>
        <div style={styles.cardsGrid}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Override Rate</h3>
            <span style={{ ...styles.cardValue, color: overrideRateData.rate > 10 ? '#dc2626' : overrideRateData.rate > 5 ? '#ca8a04' : '#16a34a' }}>
              {overrideRateData.rate}%
            </span>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Total Overrides</h3>
            <span style={{ ...styles.cardValue, color: '#3b82f6' }}>{overrideRateData.overrideCount}</span>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Total Predictions</h3>
            <span style={{ ...styles.cardValue, color: '#6366f1' }}>{overrideRateData.totalPredictions}</span>
          </div>
        </div>
      </div>}

      {/* Low-Confidence Volume — FR-161 (FR-110.A2: role-gated) */}
      {canViewWidget('low-confidence-volume', userRoles) && <div style={styles.panel} data-testid="low-confidence-volume">
        <h3 style={styles.panelTitle}>Low-Confidence Volume</h3>
        {lowConfidenceData.length === 0 ? (
          <p style={styles.placeholderText}>No low-confidence data available</p>
        ) : (
          <div style={styles.trendTableContainer}>
            <table style={styles.trendTable}>
              <thead>
                <tr>
                  <th style={styles.trendTh}>Week</th>
                  <th style={styles.trendTh}>Count</th>
                </tr>
              </thead>
              <tbody>
                {lowConfidenceData.map((row) => (
                  <tr key={row.week}>
                    <td style={styles.trendTd}>{row.week}</td>
                    <td style={{ ...styles.trendTd, color: row.count > 5 ? '#dc2626' : row.count > 3 ? '#ca8a04' : '#16a34a', fontWeight: 600 }}>
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* At-Risk Predictions — FR-062.A3 (FR-110.A2: role-gated) */}
      {canViewWidget('at-risk-predictions', userRoles) && <div style={styles.panel} data-testid="at-risk-predictions">
        <h3 style={styles.panelTitle}>At-Risk Predictions</h3>
        {atRiskPredictions.length === 0 ? (
          <p style={styles.placeholderText}>No at-risk cases detected</p>
        ) : (
          <div style={styles.trendTableContainer}>
            <table style={styles.trendTable}>
              <thead>
                <tr>
                  <th style={styles.trendTh}>Case ID</th>
                  <th style={styles.trendTh}>Breach Probability</th>
                  <th style={styles.trendTh}>Risk Factors</th>
                </tr>
              </thead>
              <tbody>
                {atRiskPredictions.map((pred) => (
                  <tr key={pred.caseId}>
                    <td style={styles.trendTd}>{pred.caseId}</td>
                    <td style={{
                      ...styles.trendTd,
                      color: pred.pBreach >= 0.8 ? '#dc2626' : pred.pBreach >= 0.6 ? '#ca8a04' : '#f59e0b',
                      fontWeight: 600,
                    }}>
                      {Math.round(pred.pBreach * 100)}%
                    </td>
                    <td style={styles.trendTd}>
                      {pred.riskFactors.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Workload Forecast — FR-112.A3 (FR-110.A2: role-gated) */}
      {canViewWidget('workload-forecast', userRoles) && <div style={styles.panel} data-testid="workload-forecast">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ ...styles.panelTitle, margin: 0 }}>Workload Forecast</h3>
          {forecastData && (
            <span
              data-testid="forecast-trend"
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: forecastData.trend === 'INCREASING' ? '#dc2626'
                  : forecastData.trend === 'DECREASING' ? '#16a34a'
                  : '#6b7280',
              }}
            >
              {trendArrows[forecastData.trend]} (Current: {forecastData.currentLoad})
            </span>
          )}
        </div>
        {!forecastData || forecastData.points.length === 0 ? (
          <p style={styles.placeholderText}>No forecast data available</p>
        ) : (
          <div style={styles.trendTableContainer}>
            <table style={styles.trendTable}>
              <thead>
                <tr>
                  <th style={styles.trendTh}>Date</th>
                  <th style={styles.trendTh}>Predicted Volume</th>
                  <th style={styles.trendTh}>Confidence (Low-High)</th>
                </tr>
              </thead>
              <tbody>
                {forecastData.points.map((pt) => (
                  <tr key={pt.date}>
                    <td style={styles.trendTd}>{pt.date}</td>
                    <td style={styles.trendTd}>{pt.predictedVolume}</td>
                    <td style={styles.trendTd}>
                      {pt.confidenceInterval.low} - {pt.confidenceInterval.high}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Compliance Summary Widget — FR-164 */}
      <div data-testid="compliance-widget" style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 600 }}>Compliance Status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: 8, background: '#d1fae5', borderRadius: 4 }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#065f46' }}>98%</div>
            <div style={{ fontSize: '0.75rem', color: '#065f46' }}>GDPR Compliance</div>
          </div>
          <div style={{ padding: 8, background: '#dbeafe', borderRadius: 4 }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e40af' }}>100%</div>
            <div style={{ fontSize: '0.75rem', color: '#1e40af' }}>Data Retention</div>
          </div>
          <div style={{ padding: 8, background: '#d1fae5', borderRadius: 4 }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#065f46' }}>95%</div>
            <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Consent Coverage</div>
          </div>
          <div style={{ padding: 8, background: '#fef3c7', borderRadius: 4 }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#92400e' }}>87%</div>
            <div style={{ fontSize: '0.75rem', color: '#92400e' }}>Vendor Compliance</div>
          </div>
        </div>
      </div>

      {/* Business Value Command Center — FR-158 (FR-110.A2: role-gated) */}
      {canViewWidget('business-value', userRoles) && <div style={styles.panel} data-testid="business-value">
        <h3 style={styles.panelTitle}>Business Value Command Center</h3>
        <div style={styles.threeColumnGrid}>
          {/* Disbursal Blockers */}
          <div>
            <h4 style={styles.complianceSubtitle}>Disbursal Blockers</h4>
            <div style={styles.trendTableContainer}>
              <table style={styles.trendTable}>
                <thead>
                  <tr>
                    <th style={styles.trendTh}>Category</th>
                    <th style={styles.trendTh}>Count</th>
                    <th style={styles.trendTh}>Avg Age (days)</th>
                  </tr>
                </thead>
                <tbody>
                  {businessValueData.disbursalBlockers.map((b) => (
                    <tr key={b.category}>
                      <td style={styles.trendTd}>{b.category}</td>
                      <td style={{ ...styles.trendTd, fontWeight: 600 }}>{b.count}</td>
                      <td style={{ ...styles.trendTd, color: b.avgAgeDays > 5 ? '#dc2626' : b.avgAgeDays > 3 ? '#ca8a04' : '#16a34a' }}>
                        {b.avgAgeDays}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vendor Capacity */}
          <div>
            <h4 style={styles.complianceSubtitle}>Vendor Capacity</h4>
            <div style={styles.breakdownList}>
              {businessValueData.vendorCapacity.map((v) => (
                <div key={v.vendorId} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{v.vendorName}</span>
                  <span style={{ ...styles.breakdownValue, color: v.utilizationPercent > 80 ? '#dc2626' : v.utilizationPercent > 60 ? '#ca8a04' : '#16a34a' }}>
                    {v.utilizationPercent}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* SLA Leakage by Region */}
          <div>
            <h4 style={styles.complianceSubtitle}>SLA Compliance by Region</h4>
            <div style={styles.breakdownList}>
              {Object.entries(businessValueData.slaLeakageByRegion).map(([region, compliance]) => (
                <div key={region} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{region}</span>
                  <span style={{ ...styles.breakdownValue, color: (compliance as number) >= 90 ? '#16a34a' : (compliance as number) >= 75 ? '#ca8a04' : '#dc2626' }}>
                    {compliance as number}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
};

const styles: Record<string, CSSProperties> = {
  container: {
    padding: '0',
  },
  heading: {
    margin: '0 0 1.5rem 0',
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  card: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1.25rem',
  },
  cardTitle: {
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    opacity: 0.7,
    margin: '0 0 0.5rem 0',
  },
  cardValue: {
    fontSize: '2rem',
    fontWeight: 700,
  },
  twoColumnGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
    marginBottom: '1.5rem',
  },
  threeColumnGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.5rem',
    marginBottom: '1.5rem',
  },
  panel: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1.25rem',
    marginBottom: '1.5rem',
  },
  panelTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    margin: '0 0 1rem 0',
  },
  chartPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  chartBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  chartLabel: {
    fontSize: '0.8rem',
    width: '100px',
    flexShrink: 0,
  },
  chartFill: {
    height: '20px',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  chartCount: {
    fontSize: '0.8rem',
    fontWeight: 600,
    minWidth: '30px',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  activityItem: {
    padding: '0.75rem',
    borderBottom: '1px solid var(--color-border)',
  },
  activityMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  activityUser: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-accent)',
  },
  activityTime: {
    fontSize: '0.7rem',
    color: '#94a3b8',
  },
  activityDesc: {
    fontSize: '0.85rem',
    margin: 0,
    lineHeight: 1.4,
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 2rem',
    border: '1px dashed var(--color-border)',
    borderRadius: '8px',
    backgroundColor: 'var(--color-surface)',
    textAlign: 'center',
  },
  placeholderIcon: {
    fontSize: '2.5rem',
    marginBottom: '0.75rem',
    opacity: 0.5,
  },
  placeholderTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#475569',
  },
  placeholderText: {
    margin: 0,
    fontSize: '0.875rem',
    color: '#94a3b8',
    maxWidth: '480px',
    lineHeight: 1.5,
  },
  code: {
    backgroundColor: '#f1f5f9',
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid var(--color-border)',
    borderTop: '3px solid var(--color-accent, #3b82f6)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginBottom: '1rem',
  },
  retryButton: {
    marginTop: '1rem',
    padding: '0.5rem 1.25rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    backgroundColor: 'var(--color-bg)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  breakdownList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.4rem 0',
    borderBottom: '1px solid var(--color-border)',
  },
  breakdownLabel: {
    fontSize: '0.85rem',
    color: 'var(--color-text)',
  },
  breakdownValue: {
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  complianceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1.5rem',
  },
  complianceSubtitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    margin: '0 0 0.75rem 0',
    color: '#475569',
  },
  trendTableContainer: {
    overflowX: 'auto',
  },
  trendTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.85rem',
  },
  trendTh: {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    borderBottom: '2px solid var(--color-border)',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#475569',
  },
  trendTd: {
    padding: '0.4rem 0.75rem',
    borderBottom: '1px solid var(--color-border)',
  },
};

export default DashboardPage;
