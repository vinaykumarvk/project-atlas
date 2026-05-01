import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDemoMode } from '../config/flags';
import { useCollateralRisk } from '../hooks/useCollateralOps';
import type { CollateralRiskSummary, RiskSummaryCase } from '../hooks/useCollateralOps';

// ---------------------------------------------------------------------------
// Mock data for demo mode
// ---------------------------------------------------------------------------

const MOCK_DATA: CollateralRiskSummary = {
  totalCases: 45,
  low: 18,
  medium: 14,
  high: 9,
  critical: 4,
  cases: [
    { id: 'c1', caseNumber: 'ATL-2026-000101', caseType: 'VALUATION_REQUEST', riskScore: 88, riskTier: 'CRITICAL', propertyCity: 'Delhi', status: 'NEW', documentCompleteness: 20, valuationVariance: true },
    { id: 'c2', caseNumber: 'ATL-2026-000102', caseType: 'TITLE_SEARCH', riskScore: 85, riskTier: 'CRITICAL', propertyCity: null, status: 'AWAITING_VENDOR', documentCompleteness: 0, valuationVariance: true },
    { id: 'c3', caseNumber: 'ATL-2026-000103', caseType: 'LEGAL_OPINION', riskScore: 82, riskTier: 'CRITICAL', propertyCity: 'Kolkata', status: 'NEW', documentCompleteness: 25, valuationVariance: false },
    { id: 'c4', caseNumber: 'ATL-2026-000104', caseType: 'SITE_VISIT', riskScore: 78, riskTier: 'CRITICAL', propertyCity: 'Mumbai', status: 'AWAITING_VENDOR', documentCompleteness: 37, valuationVariance: true },
    { id: 'c5', caseNumber: 'ATL-2026-000105', caseType: 'VALUATION_REQUEST', riskScore: 68, riskTier: 'HIGH', propertyCity: 'Pune', status: 'IN_PROGRESS', documentCompleteness: 40, valuationVariance: false },
    { id: 'c6', caseNumber: 'ATL-2026-000106', caseType: 'LEGAL_OPINION', riskScore: 62, riskTier: 'HIGH', propertyCity: 'Delhi', status: 'IN_PROGRESS', documentCompleteness: 50, valuationVariance: false },
    { id: 'c7', caseNumber: 'ATL-2026-000107', caseType: 'TITLE_SEARCH', riskScore: 58, riskTier: 'HIGH', propertyCity: 'Mumbai', status: 'IN_PROGRESS', documentCompleteness: 60, valuationVariance: true },
    { id: 'c8', caseNumber: 'ATL-2026-000108', caseType: 'VALUATION_REQUEST', riskScore: 55, riskTier: 'HIGH', propertyCity: 'Nashik', status: 'AWAITING_VENDOR', documentCompleteness: 40, valuationVariance: false },
    { id: 'c9', caseNumber: 'ATL-2026-000109', caseType: 'SITE_VISIT', riskScore: 52, riskTier: 'HIGH', propertyCity: 'Chennai', status: 'IN_PROGRESS', documentCompleteness: 50, valuationVariance: false },
    { id: 'c10', caseNumber: 'ATL-2026-000110', caseType: 'INSURANCE_RENEWAL', riskScore: 45, riskTier: 'MEDIUM', propertyCity: 'Bangalore', status: 'IN_PROGRESS', documentCompleteness: 75, valuationVariance: false },
    { id: 'c11', caseNumber: 'ATL-2026-000111', caseType: 'VALUATION_REQUEST', riskScore: 38, riskTier: 'MEDIUM', propertyCity: 'Mumbai', status: 'IN_PROGRESS', documentCompleteness: 80, valuationVariance: false },
    { id: 'c12', caseNumber: 'ATL-2026-000112', caseType: 'LEGAL_OPINION', riskScore: 32, riskTier: 'MEDIUM', propertyCity: 'Hyderabad', status: 'REVIEW', documentCompleteness: 100, valuationVariance: false },
    { id: 'c13', caseNumber: 'ATL-2026-000113', caseType: 'VALUATION_REQUEST', riskScore: 20, riskTier: 'LOW', propertyCity: 'Mumbai', status: 'REVIEW', documentCompleteness: 100, valuationVariance: false },
    { id: 'c14', caseNumber: 'ATL-2026-000114', caseType: 'DISCHARGE', riskScore: 12, riskTier: 'LOW', propertyCity: 'Pune', status: 'REVIEW', documentCompleteness: 100, valuationVariance: false },
    { id: 'c15', caseNumber: 'ATL-2026-000115', caseType: 'SETTLEMENT', riskScore: 8, riskTier: 'LOW', propertyCity: 'Delhi', status: 'VENDOR_COMPLETED', documentCompleteness: 100, valuationVariance: false },
  ],
};

const RISK_TIER_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  LOW: { label: 'Low', color: '#16a34a', bgColor: '#dcfce7' },
  MEDIUM: { label: 'Medium', color: '#ca8a04', bgColor: '#fef9c3' },
  HIGH: { label: 'High', color: '#ea580c', bgColor: '#fed7aa' },
  CRITICAL: { label: 'Critical', color: '#dc2626', bgColor: '#fecaca' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CollateralRiskPage = () => {
  const demo = isDemoMode();
  const navigate = useNavigate();
  const [tierFilter, setTierFilter] = useState<string>('');

  // Live hook (called unconditionally)
  const { data: liveData, isLoading, isError, error } = useCollateralRisk();

  const data: CollateralRiskSummary = demo
    ? MOCK_DATA
    : (liveData ?? { totalCases: 0, low: 0, medium: 0, high: 0, critical: 0, cases: [] });

  // Filter cases
  const filteredCases = tierFilter
    ? data.cases.filter((c: RiskSummaryCase) => c.riskTier === tierFilter)
    : data.cases;

  // Loading
  if (!demo && isLoading) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Collateral Risk Portfolio</h2>
        <div style={styles.placeholder}>
          <div style={styles.spinner} />
          <p style={styles.placeholderText}>Loading collateral risk data...</p>
        </div>
      </div>
    );
  }

  // Error
  if (!demo && isError) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Collateral Risk Portfolio</h2>
        <div style={{ ...styles.placeholder, borderColor: '#fecaca' }}>
          <p style={{ ...styles.placeholderText, color: '#dc2626' }}>
            {error instanceof Error ? error.message : 'Failed to load collateral risk data'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Collateral Risk Portfolio</h2>

      {/* Risk Tier Summary */}
      <div style={styles.tierGrid}>
        {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((tier) => {
          const config = RISK_TIER_CONFIG[tier];
          const count = data[tier.toLowerCase() as 'low' | 'medium' | 'high' | 'critical'];
          const isActive = tierFilter === tier;

          return (
            <button
              key={tier}
              onClick={() => setTierFilter(isActive ? '' : tier)}
              style={{
                ...styles.tierCard,
                borderColor: isActive ? config.color : 'var(--color-border)',
                borderWidth: isActive ? '2px' : '1px',
                backgroundColor: isActive ? config.bgColor : 'var(--color-surface)',
              }}
              type="button"
            >
              <span style={{ ...styles.tierLabel, color: config.color }}>{config.label}</span>
              <span style={{ ...styles.tierCount, color: config.color }}>{count}</span>
              <span style={styles.tierPercent}>
                {data.totalCases > 0 ? `${Math.round((count / data.totalCases) * 100)}%` : '0%'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Visual Bar Chart */}
      <div style={styles.chartPanel}>
        <h3 style={styles.panelTitle}>Risk Distribution</h3>
        <div style={styles.barChart}>
          {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((tier) => {
            const config = RISK_TIER_CONFIG[tier];
            const count = data[tier.toLowerCase() as 'low' | 'medium' | 'high' | 'critical'];
            const maxCount = Math.max(data.low, data.medium, data.high, data.critical, 1);

            return (
              <div key={tier} style={styles.barRow}>
                <span style={styles.barLabel}>{config.label}</span>
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      width: `${(count / maxCount) * 100}%`,
                      backgroundColor: config.color,
                    }}
                  />
                </div>
                <span style={styles.barCount}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Document Completeness Trends */}
      <div style={styles.chartPanel}>
        <h3 style={styles.panelTitle}>Document Completeness Overview</h3>
        <div style={styles.completenessGrid}>
          {([
            { label: 'Complete (100%)', min: 100, max: 100, color: '#16a34a' },
            { label: 'Near Complete (75-99%)', min: 75, max: 99, color: '#ca8a04' },
            { label: 'Partial (25-74%)', min: 25, max: 74, color: '#ea580c' },
            { label: 'Low (0-24%)', min: 0, max: 24, color: '#dc2626' },
          ] as const).map((band) => {
            const count = data.cases.filter(
              (c: RiskSummaryCase) => c.documentCompleteness >= band.min && c.documentCompleteness <= band.max,
            ).length;

            return (
              <div key={band.label} style={styles.completenessCard}>
                <div style={{ ...styles.completenessIndicator, backgroundColor: band.color }} />
                <div>
                  <span style={styles.completenessLabel}>{band.label}</span>
                  <span style={{ ...styles.completenessCount, color: band.color }}>{count} cases</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Risk Breakdown Table */}
      <div style={styles.tableSection}>
        <div style={styles.tableHeader}>
          <h3 style={styles.panelTitle}>
            {tierFilter ? `${RISK_TIER_CONFIG[tierFilter].label} Risk Cases` : 'All Cases'} ({filteredCases.length})
          </h3>
          {tierFilter && (
            <button onClick={() => setTierFilter('')} style={styles.clearFilter} type="button">
              Clear filter
            </button>
          )}
        </div>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Case #</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Risk Score</th>
                <th style={styles.th}>Tier</th>
                <th style={styles.th}>Location</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Doc Completeness</th>
                <th style={styles.th}>Valuation Variance</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((c: RiskSummaryCase) => {
                const tierConfig = RISK_TIER_CONFIG[c.riskTier] ?? RISK_TIER_CONFIG['LOW'];
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/cases/${c.id}`)}
                    style={styles.tr}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f1f5f9'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                  >
                    <td style={styles.td}><strong>{c.caseNumber}</strong></td>
                    <td style={styles.td}>{c.caseType.replace(/_/g, ' ')}</td>
                    <td style={styles.td}>{c.riskScore}</td>
                    <td style={styles.td}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        backgroundColor: tierConfig.bgColor,
                        color: tierConfig.color,
                      }}>
                        {tierConfig.label}
                      </span>
                    </td>
                    <td style={styles.td}>{c.propertyCity ?? 'N/A'}</td>
                    <td style={styles.td}>{c.status.replace(/_/g, ' ')}</td>
                    <td style={styles.td}>
                      <div style={styles.completenessBar}>
                        <div style={{
                          ...styles.completenessBarFill,
                          width: `${c.documentCompleteness}%`,
                          backgroundColor: c.documentCompleteness === 100 ? '#16a34a' : c.documentCompleteness >= 75 ? '#ca8a04' : '#dc2626',
                        }} />
                      </div>
                      <span style={styles.completenessText}>{c.documentCompleteness}%</span>
                    </td>
                    <td style={styles.td}>
                      {c.valuationVariance ? (
                        <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.8rem' }}>FLAGGED</span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredCases.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8' }}>
                    No cases found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  container: { padding: 0 },
  heading: { margin: '0 0 1.5rem 0', fontSize: '1.5rem', fontWeight: 700 },
  tierGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' },
  tierCard: { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', transition: 'border-color 0.2s' },
  tierLabel: { fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 },
  tierCount: { fontSize: '2rem', fontWeight: 700 },
  tierPercent: { fontSize: '0.8rem', color: '#94a3b8' },
  chartPanel: { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' },
  panelTitle: { fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0' },
  barChart: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  barRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  barLabel: { width: '80px', fontSize: '0.8rem', fontWeight: 500, flexShrink: 0 },
  barTrack: { flex: 1, height: '24px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '4px', transition: 'width 0.3s ease' },
  barCount: { width: '40px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 },
  completenessGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' },
  completenessCard: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: '6px' },
  completenessIndicator: { width: '8px', height: '40px', borderRadius: '4px', flexShrink: 0 },
  completenessLabel: { display: 'block', fontSize: '0.8rem', fontWeight: 500 },
  completenessCount: { display: 'block', fontSize: '1.1rem', fontWeight: 700 },
  tableSection: { marginTop: '0' },
  tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
  clearFilter: { background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '0.25rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', color: '#64748b' },
  tableContainer: { overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: 'var(--color-surface)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { textAlign: 'left', padding: '0.75rem 1rem', borderBottom: '2px solid var(--color-border)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' },
  tr: { cursor: 'pointer', transition: 'background-color 0.15s' },
  td: { padding: '0.6rem 1rem', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' },
  completenessBar: { display: 'inline-block', width: '60px', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', verticalAlign: 'middle', marginRight: '0.5rem' },
  completenessBarFill: { height: '100%', borderRadius: '4px' },
  completenessText: { fontSize: '0.8rem', color: '#64748b' },
  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', border: '1px dashed var(--color-border)', borderRadius: '8px', backgroundColor: 'var(--color-surface)', textAlign: 'center' },
  placeholderText: { margin: 0, fontSize: '0.875rem', color: '#94a3b8', maxWidth: '480px', lineHeight: 1.5 },
  spinner: { width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTop: '3px solid var(--color-accent, #3b82f6)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem' },
};

export default CollateralRiskPage;
