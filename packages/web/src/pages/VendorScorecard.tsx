import { useState, type CSSProperties } from 'react';
import { isDemoMode } from '../config/flags';
import { useVendorScorecard, useVendorList } from '../hooks/useCollateralOps';
import type { VendorScorecard as VendorScorecardType, VendorSummary } from '../hooks/useCollateralOps';

// ---------------------------------------------------------------------------
// Mock data for demo mode
// ---------------------------------------------------------------------------

const MOCK_VENDORS: VendorSummary[] = [
  { vendorId: 'v-1', vendorName: 'QuickVal Services', vendorCode: 'QVS', category: 'VALUER', qualityScore: 4.2, tatCompliancePercent: 0.85, isActive: true },
  { vendorId: 'v-2', vendorName: 'PremiumVal India', vendorCode: 'PVI', category: 'VALUER', qualityScore: 4.8, tatCompliancePercent: 0.92, isActive: true },
  { vendorId: 'v-3', vendorName: 'LegalEase Partners', vendorCode: 'LEP', category: 'ADVOCATE', qualityScore: 4.5, tatCompliancePercent: 0.88, isActive: true },
  { vendorId: 'v-4', vendorName: 'SafeGuard Surveyors', vendorCode: 'SGS', category: 'SURVEYOR', qualityScore: 3.9, tatCompliancePercent: 0.78, isActive: true },
  { vendorId: 'v-5', vendorName: 'TitleCheck Pro', vendorCode: 'TCP', category: 'ADVOCATE', qualityScore: 4.1, tatCompliancePercent: 0.82, isActive: true },
];

const MOCK_SCORECARDS: Record<string, VendorScorecardType> = {
  'v-1': {
    vendorId: 'v-1', vendorName: 'QuickVal Services', vendorCode: 'QVS', category: 'VALUER',
    tatCompliancePercent: 85, qualityScore: 4.2, reworkRate: 1.6, varianceFromEstimates: 0.15,
    totalCasesHandled: 187, activeCases: 12, serviceGeographies: ['Mumbai', 'Pune'], serviceCaseTypes: ['VALUATION_REQUEST', 'SITE_VISIT'],
  },
  'v-2': {
    vendorId: 'v-2', vendorName: 'PremiumVal India', vendorCode: 'PVI', category: 'VALUER',
    tatCompliancePercent: 92, qualityScore: 4.8, reworkRate: 0.4, varianceFromEstimates: 0.08,
    totalCasesHandled: 312, activeCases: 5, serviceGeographies: ['Mumbai', 'Nashik'], serviceCaseTypes: ['VALUATION_REQUEST'],
  },
  'v-3': {
    vendorId: 'v-3', vendorName: 'LegalEase Partners', vendorCode: 'LEP', category: 'ADVOCATE',
    tatCompliancePercent: 88, qualityScore: 4.5, reworkRate: 1.0, varianceFromEstimates: 0.12,
    totalCasesHandled: 245, activeCases: 8, serviceGeographies: ['Mumbai', 'Pune', 'Nashik'], serviceCaseTypes: ['LEGAL_OPINION', 'TITLE_SEARCH'],
  },
  'v-4': {
    vendorId: 'v-4', vendorName: 'SafeGuard Surveyors', vendorCode: 'SGS', category: 'SURVEYOR',
    tatCompliancePercent: 78, qualityScore: 3.9, reworkRate: 2.2, varianceFromEstimates: 0.22,
    totalCasesHandled: 98, activeCases: 6, serviceGeographies: ['Delhi', 'Kolkata'], serviceCaseTypes: ['SITE_VISIT'],
  },
  'v-5': {
    vendorId: 'v-5', vendorName: 'TitleCheck Pro', vendorCode: 'TCP', category: 'ADVOCATE',
    tatCompliancePercent: 82, qualityScore: 4.1, reworkRate: 1.8, varianceFromEstimates: 0.18,
    totalCasesHandled: 156, activeCases: 9, serviceGeographies: ['Chennai', 'Hyderabad'], serviceCaseTypes: ['TITLE_SEARCH'],
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const VendorScorecardPage = () => {
  const demo = isDemoMode();
  const [selectedVendorId, setSelectedVendorId] = useState('');

  // Live hooks (called unconditionally per rules of hooks)
  const { data: liveVendors, isLoading: vendorsLoading } = useVendorList();
  const { data: liveScorecard, isLoading: scorecardLoading, isError, error } = useVendorScorecard(selectedVendorId);

  const vendors: VendorSummary[] = demo ? MOCK_VENDORS : (liveVendors ?? []);
  const scorecard: VendorScorecardType | null = demo
    ? (MOCK_SCORECARDS[selectedVendorId] ?? null)
    : (liveScorecard ?? null);

  const isLoading = !demo && (vendorsLoading || (selectedVendorId && scorecardLoading));

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Vendor Scorecard</h2>

      {/* Vendor Selection */}
      <div style={styles.searchBar}>
        <label htmlFor="vendor-select" style={styles.label}>Select Vendor:</label>
        <select
          id="vendor-select"
          value={selectedVendorId}
          onChange={(e) => setSelectedVendorId(e.target.value)}
          style={styles.select}
        >
          <option value="">-- Choose a vendor --</option>
          {vendors.map((v) => (
            <option key={v.vendorId} value={v.vendorId}>
              {v.vendorName} ({v.vendorCode}) - {v.category}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={styles.placeholder}>
          <div style={styles.spinner} />
          <p style={styles.placeholderText}>Loading scorecard...</p>
        </div>
      )}

      {/* Error */}
      {!demo && isError && selectedVendorId && (
        <div style={{ ...styles.placeholder, borderColor: '#fecaca' }}>
          <p style={{ ...styles.placeholderText, color: '#dc2626' }}>
            {error instanceof Error ? error.message : 'Failed to load scorecard'}
          </p>
        </div>
      )}

      {/* No selection */}
      {!selectedVendorId && !isLoading && (
        <div style={styles.placeholder}>
          <p style={styles.placeholderText}>Select a vendor above to view their performance scorecard.</p>
        </div>
      )}

      {/* Scorecard Display */}
      {scorecard && !isLoading && (
        <div>
          {/* Header */}
          <div style={styles.scorecardHeader}>
            <div>
              <h3 style={styles.vendorName}>{scorecard.vendorName}</h3>
              <span style={styles.vendorMeta}>{scorecard.vendorCode} | {scorecard.category}</span>
            </div>
          </div>

          {/* Metric Cards */}
          <div style={styles.metricsGrid}>
            <MetricCard
              title="TAT Compliance"
              value={`${typeof scorecard.tatCompliancePercent === 'number' && scorecard.tatCompliancePercent <= 1 ? Math.round(scorecard.tatCompliancePercent * 100) : Math.round(scorecard.tatCompliancePercent)}%`}
              color={scorecard.tatCompliancePercent >= 0.85 || scorecard.tatCompliancePercent >= 85 ? '#16a34a' : scorecard.tatCompliancePercent >= 0.7 || scorecard.tatCompliancePercent >= 70 ? '#ca8a04' : '#dc2626'}
            />
            <MetricCard
              title="Quality Score"
              value={`${scorecard.qualityScore.toFixed(1)} / 5.0`}
              color={scorecard.qualityScore >= 4.0 ? '#16a34a' : scorecard.qualityScore >= 3.0 ? '#ca8a04' : '#dc2626'}
            />
            <MetricCard
              title="Rework Rate"
              value={`${scorecard.reworkRate.toFixed(1)}%`}
              color={scorecard.reworkRate <= 1.0 ? '#16a34a' : scorecard.reworkRate <= 2.0 ? '#ca8a04' : '#dc2626'}
            />
            <MetricCard
              title="Variance from Estimates"
              value={`${(scorecard.varianceFromEstimates * 100).toFixed(0)}%`}
              color={scorecard.varianceFromEstimates <= 0.1 ? '#16a34a' : scorecard.varianceFromEstimates <= 0.2 ? '#ca8a04' : '#dc2626'}
            />
          </div>

          {/* Detail Info */}
          <div style={styles.detailRow}>
            <div style={styles.detailPanel}>
              <h4 style={styles.panelTitle}>Operations Summary</h4>
              <div style={styles.detailGrid}>
                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>Total Cases Handled</span>
                  <span style={styles.detailValue}>{scorecard.totalCasesHandled}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>Active Cases</span>
                  <span style={styles.detailValue}>{scorecard.activeCases}</span>
                </div>
              </div>
            </div>
            <div style={styles.detailPanel}>
              <h4 style={styles.panelTitle}>Service Coverage</h4>
              <div style={styles.detailGrid}>
                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>Geographies</span>
                  <span style={styles.detailValue}>{scorecard.serviceGeographies.join(', ') || 'None'}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>Case Types</span>
                  <span style={styles.detailValue}>{scorecard.serviceCaseTypes.map((t) => t.replace(/_/g, ' ')).join(', ') || 'None'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Summary Table */}
      {vendors.length > 0 && (
        <div style={styles.tableSection}>
          <h3 style={styles.sectionTitle}>All Vendors Overview</h3>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Vendor</th>
                  <th style={styles.th}>Code</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Quality Score</th>
                  <th style={styles.th}>TAT Compliance</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr
                    key={v.vendorId}
                    onClick={() => setSelectedVendorId(v.vendorId)}
                    style={{ ...styles.tr, backgroundColor: v.vendorId === selectedVendorId ? '#f0f9ff' : 'transparent' }}
                  >
                    <td style={styles.td}><strong>{v.vendorName}</strong></td>
                    <td style={styles.td}>{v.vendorCode}</td>
                    <td style={styles.td}>{v.category}</td>
                    <td style={styles.td}>{v.qualityScore.toFixed(1)}</td>
                    <td style={styles.td}>{typeof v.tatCompliancePercent === 'number' && v.tatCompliancePercent <= 1 ? `${Math.round(v.tatCompliancePercent * 100)}%` : `${Math.round(v.tatCompliancePercent)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

function MetricCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div style={styles.metricCard}>
      <span style={styles.metricTitle}>{title}</span>
      <span style={{ ...styles.metricValue, color }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  container: { padding: 0 },
  heading: { margin: '0 0 1.5rem 0', fontSize: '1.5rem', fontWeight: 700 },
  searchBar: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' },
  label: { fontSize: '0.875rem', fontWeight: 600 },
  select: { padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '0.875rem', backgroundColor: 'var(--color-bg)', minWidth: '300px' },
  scorecardHeader: { marginBottom: '1.5rem' },
  vendorName: { margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700 },
  vendorMeta: { fontSize: '0.85rem', color: '#64748b' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  metricCard: { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  metricTitle: { fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 },
  metricValue: { fontSize: '1.75rem', fontWeight: 700 },
  detailRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' },
  detailPanel: { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.25rem' },
  panelTitle: { fontSize: '0.95rem', fontWeight: 600, margin: '0 0 1rem 0' },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  detailItem: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  detailLabel: { fontSize: '0.7rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 },
  detailValue: { fontSize: '0.875rem' },
  tableSection: { marginTop: '2rem' },
  sectionTitle: { margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 },
  tableContainer: { overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: 'var(--color-surface)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: { textAlign: 'left', padding: '0.75rem 1rem', borderBottom: '2px solid var(--color-border)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' },
  tr: { cursor: 'pointer', transition: 'background-color 0.15s' },
  td: { padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' },
  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', border: '1px dashed var(--color-border)', borderRadius: '8px', backgroundColor: 'var(--color-surface)', textAlign: 'center' },
  placeholderText: { margin: 0, fontSize: '0.875rem', color: '#94a3b8', maxWidth: '480px', lineHeight: 1.5 },
  spinner: { width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTop: '3px solid var(--color-accent, #3b82f6)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem' },
};

export default VendorScorecardPage;
