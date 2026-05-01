import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDemoMode } from '../config/flags';
import { useDisbursalReadiness } from '../hooks/useCollateralOps';
import type { DisbursalReadinessData, DisbursalReadinessGroup } from '../hooks/useCollateralOps';

// ---------------------------------------------------------------------------
// Mock data for demo mode
// ---------------------------------------------------------------------------

const MOCK_DATA: DisbursalReadinessData = {
  totalBlocked: 18,
  totalReady: 7,
  groups: [
    {
      category: 'VALUATION_PENDING',
      count: 6,
      cases: [
        { id: 'c1', caseNumber: 'ATL-2026-000101', caseType: 'VALUATION_REQUEST', status: 'AWAITING_VENDOR', riskScore: 72, propertyCity: 'Mumbai', assignedFprId: 'fpr-1' },
        { id: 'c2', caseNumber: 'ATL-2026-000105', caseType: 'SITE_VISIT', status: 'NEW', riskScore: 65, propertyCity: 'Pune', assignedFprId: 'fpr-2' },
        { id: 'c3', caseNumber: 'ATL-2026-000112', caseType: 'VALUATION_REQUEST', status: 'AWAITING_VENDOR', riskScore: 58, propertyCity: 'Delhi', assignedFprId: 'fpr-1' },
        { id: 'c4', caseNumber: 'ATL-2026-000118', caseType: 'VALUATION_REQUEST', status: 'NEW', riskScore: 48, propertyCity: 'Bangalore', assignedFprId: null },
        { id: 'c5', caseNumber: 'ATL-2026-000125', caseType: 'SITE_VISIT', status: 'AWAITING_VENDOR', riskScore: 42, propertyCity: 'Chennai', assignedFprId: 'fpr-3' },
        { id: 'c6', caseNumber: 'ATL-2026-000130', caseType: 'VALUATION_REQUEST', status: 'NEW', riskScore: 35, propertyCity: 'Hyderabad', assignedFprId: 'fpr-4' },
      ],
    },
    {
      category: 'LEGAL_PENDING',
      count: 4,
      cases: [
        { id: 'c7', caseNumber: 'ATL-2026-000102', caseType: 'LEGAL_OPINION', status: 'IN_PROGRESS', riskScore: 68, propertyCity: 'Mumbai', assignedFprId: 'fpr-1' },
        { id: 'c8', caseNumber: 'ATL-2026-000109', caseType: 'LEGAL_OPINION', status: 'AWAITING_VENDOR', riskScore: 55, propertyCity: 'Delhi', assignedFprId: 'fpr-2' },
        { id: 'c9', caseNumber: 'ATL-2026-000115', caseType: 'LEGAL_OPINION', status: 'IN_PROGRESS', riskScore: 45, propertyCity: 'Pune', assignedFprId: 'fpr-3' },
        { id: 'c10', caseNumber: 'ATL-2026-000122', caseType: 'LEGAL_OPINION', status: 'IN_PROGRESS', riskScore: 38, propertyCity: 'Bangalore', assignedFprId: 'fpr-4' },
      ],
    },
    {
      category: 'TITLE_CLEAR_PENDING',
      count: 3,
      cases: [
        { id: 'c11', caseNumber: 'ATL-2026-000103', caseType: 'TITLE_SEARCH', status: 'IN_PROGRESS', riskScore: 62, propertyCity: 'Mumbai', assignedFprId: 'fpr-1' },
        { id: 'c12', caseNumber: 'ATL-2026-000110', caseType: 'TITLE_SEARCH', status: 'AWAITING_VENDOR', riskScore: 50, propertyCity: 'Nashik', assignedFprId: 'fpr-2' },
        { id: 'c13', caseNumber: 'ATL-2026-000120', caseType: 'TITLE_SEARCH', status: 'IN_PROGRESS', riskScore: 40, propertyCity: 'Chennai', assignedFprId: 'fpr-3' },
      ],
    },
    {
      category: 'DOCUMENT_MISSING',
      count: 5,
      cases: [
        { id: 'c14', caseNumber: 'ATL-2026-000104', caseType: 'VALUATION_REQUEST', status: 'IN_PROGRESS', riskScore: 78, propertyCity: 'Delhi', assignedFprId: 'fpr-1' },
        { id: 'c15', caseNumber: 'ATL-2026-000108', caseType: 'SITE_VISIT', status: 'IN_PROGRESS', riskScore: 70, propertyCity: 'Kolkata', assignedFprId: 'fpr-2' },
        { id: 'c16', caseNumber: 'ATL-2026-000113', caseType: 'INSURANCE_RENEWAL', status: 'IN_PROGRESS', riskScore: 55, propertyCity: 'Mumbai', assignedFprId: 'fpr-3' },
        { id: 'c17', caseNumber: 'ATL-2026-000119', caseType: 'LEGAL_OPINION', status: 'IN_PROGRESS', riskScore: 45, propertyCity: 'Pune', assignedFprId: 'fpr-4' },
        { id: 'c18', caseNumber: 'ATL-2026-000126', caseType: 'VALUATION_REQUEST', status: 'NEW', riskScore: 38, propertyCity: 'Hyderabad', assignedFprId: null },
      ],
    },
    {
      category: 'NONE',
      count: 7,
      cases: [
        { id: 'c19', caseNumber: 'ATL-2026-000106', caseType: 'VALUATION_REQUEST', status: 'REVIEW', riskScore: 15, propertyCity: 'Mumbai', assignedFprId: 'fpr-1' },
        { id: 'c20', caseNumber: 'ATL-2026-000107', caseType: 'INSURANCE_RENEWAL', status: 'REVIEW', riskScore: 10, propertyCity: 'Delhi', assignedFprId: 'fpr-2' },
        { id: 'c21', caseNumber: 'ATL-2026-000111', caseType: 'DISCHARGE', status: 'REVIEW', riskScore: 8, propertyCity: 'Pune', assignedFprId: 'fpr-3' },
        { id: 'c22', caseNumber: 'ATL-2026-000114', caseType: 'SETTLEMENT', status: 'REVIEW', riskScore: 12, propertyCity: 'Chennai', assignedFprId: 'fpr-4' },
        { id: 'c23', caseNumber: 'ATL-2026-000116', caseType: 'VALUATION_REQUEST', status: 'VENDOR_COMPLETED', riskScore: 18, propertyCity: 'Bangalore', assignedFprId: 'fpr-1' },
        { id: 'c24', caseNumber: 'ATL-2026-000121', caseType: 'LEGAL_OPINION', status: 'REVIEW', riskScore: 5, propertyCity: 'Mumbai', assignedFprId: 'fpr-2' },
        { id: 'c25', caseNumber: 'ATL-2026-000123', caseType: 'TITLE_SEARCH', status: 'VENDOR_COMPLETED', riskScore: 14, propertyCity: 'Hyderabad', assignedFprId: 'fpr-3' },
      ],
    },
  ],
};

const CATEGORY_LABELS: Record<string, string> = {
  VALUATION_PENDING: 'Valuation Pending',
  LEGAL_PENDING: 'Legal Pending',
  TITLE_CLEAR_PENDING: 'Title Clear Pending',
  DOCUMENT_MISSING: 'Documents Missing',
  NONE: 'Ready for Disbursal',
};

const CATEGORY_COLORS: Record<string, string> = {
  VALUATION_PENDING: '#f59e0b',
  LEGAL_PENDING: '#8b5cf6',
  TITLE_CLEAR_PENDING: '#ec4899',
  DOCUMENT_MISSING: '#dc2626',
  NONE: '#16a34a',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DisbursalReadinessPage = () => {
  const demo = isDemoMode();
  const navigate = useNavigate();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Live hook (called unconditionally)
  const { data: liveData, isLoading, isError, error } = useDisbursalReadiness();

  const data: DisbursalReadinessData = demo ? MOCK_DATA : (liveData ?? { groups: [], totalBlocked: 0, totalReady: 0 });

  // Loading
  if (!demo && isLoading) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Disbursal Readiness</h2>
        <div style={styles.placeholder}>
          <div style={styles.spinner} />
          <p style={styles.placeholderText}>Loading disbursal readiness data...</p>
        </div>
      </div>
    );
  }

  // Error
  if (!demo && isError) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Disbursal Readiness</h2>
        <div style={{ ...styles.placeholder, borderColor: '#fecaca' }}>
          <p style={{ ...styles.placeholderText, color: '#dc2626' }}>
            {error instanceof Error ? error.message : 'Failed to load disbursal readiness data'}
          </p>
        </div>
      </div>
    );
  }

  const totalCases = data.totalBlocked + data.totalReady;

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Disbursal Readiness Command Center</h2>

      {/* Summary Cards */}
      <div style={styles.summaryRow}>
        <div style={{ ...styles.summaryCard, borderLeft: '4px solid #3b82f6' }}>
          <span style={styles.summaryLabel}>Total Active</span>
          <span style={{ ...styles.summaryValue, color: '#3b82f6' }}>{totalCases}</span>
        </div>
        <div style={{ ...styles.summaryCard, borderLeft: '4px solid #dc2626' }}>
          <span style={styles.summaryLabel}>Blocked</span>
          <span style={{ ...styles.summaryValue, color: '#dc2626' }}>{data.totalBlocked}</span>
        </div>
        <div style={{ ...styles.summaryCard, borderLeft: '4px solid #16a34a' }}>
          <span style={styles.summaryLabel}>Ready</span>
          <span style={{ ...styles.summaryValue, color: '#16a34a' }}>{data.totalReady}</span>
        </div>
        <div style={{ ...styles.summaryCard, borderLeft: '4px solid #f59e0b' }}>
          <span style={styles.summaryLabel}>Readiness Rate</span>
          <span style={{ ...styles.summaryValue, color: '#f59e0b' }}>
            {totalCases > 0 ? `${Math.round((data.totalReady / totalCases) * 100)}%` : '0%'}
          </span>
        </div>
      </div>

      {/* Category Groups */}
      <div style={styles.groupsContainer}>
        {data.groups.map((group: DisbursalReadinessGroup) => {
          const isExpanded = expandedCategory === group.category;
          const label = CATEGORY_LABELS[group.category] ?? group.category;
          const color = CATEGORY_COLORS[group.category] ?? '#64748b';

          return (
            <div key={group.category} style={styles.groupCard}>
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : group.category)}
                style={styles.groupHeader}
                type="button"
              >
                <div style={styles.groupHeaderLeft}>
                  <div style={{ ...styles.categoryDot, backgroundColor: color }} />
                  <span style={styles.categoryLabel}>{label}</span>
                  <span style={{ ...styles.countBadge, backgroundColor: color }}>
                    {group.count}
                  </span>
                </div>
                <span style={styles.expandIcon}>{isExpanded ? '-' : '+'}</span>
              </button>

              {isExpanded && group.cases.length > 0 && (
                <div style={styles.casesList}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Case #</th>
                        <th style={styles.th}>Type</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Risk Score</th>
                        <th style={styles.th}>Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.cases.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => navigate(`/cases/${c.id}`)}
                          style={styles.tr}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f1f5f9'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                        >
                          <td style={styles.td}><strong>{c.caseNumber}</strong></td>
                          <td style={styles.td}>{c.caseType.replace(/_/g, ' ')}</td>
                          <td style={styles.td}>{c.status.replace(/_/g, ' ')}</td>
                          <td style={styles.td}>
                            <span style={{ ...styles.riskBadge, backgroundColor: getRiskColor(c.riskScore), color: '#fff' }}>
                              {c.riskScore}
                            </span>
                          </td>
                          <td style={styles.td}>{c.propertyCity ?? 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {isExpanded && group.cases.length === 0 && (
                <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                  No cases in this category.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function getRiskColor(score: number): string {
  if (score <= 25) return '#16a34a';
  if (score <= 50) return '#f59e0b';
  if (score <= 75) return '#ea580c';
  return '#dc2626';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  container: { padding: 0 },
  heading: { margin: '0 0 1.5rem 0', fontSize: '1.5rem', fontWeight: 700 },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  summaryCard: { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  summaryLabel: { fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 },
  summaryValue: { fontSize: '2rem', fontWeight: 700 },
  groupsContainer: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  groupCard: { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' },
  groupHeader: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' },
  groupHeaderLeft: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  categoryDot: { width: '12px', height: '12px', borderRadius: '50%' },
  categoryLabel: { fontWeight: 600, fontSize: '0.95rem' },
  countBadge: { padding: '0.15rem 0.6rem', borderRadius: '9999px', color: '#fff', fontSize: '0.75rem', fontWeight: 700 },
  expandIcon: { fontSize: '1.25rem', fontWeight: 700, color: '#64748b' },
  casesList: { borderTop: '1px solid var(--color-border)', padding: '0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { textAlign: 'left', padding: '0.5rem 1rem', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600, color: '#64748b', borderBottom: '1px solid var(--color-border)' },
  tr: { cursor: 'pointer', transition: 'background-color 0.15s' },
  td: { padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' },
  riskBadge: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 },
  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', border: '1px dashed var(--color-border)', borderRadius: '8px', backgroundColor: 'var(--color-surface)', textAlign: 'center' },
  placeholderText: { margin: 0, fontSize: '0.875rem', color: '#94a3b8', maxWidth: '480px', lineHeight: 1.5 },
  spinner: { width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTop: '3px solid var(--color-accent, #3b82f6)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem' },
};

export default DisbursalReadinessPage;
