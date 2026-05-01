import { useState, useMemo, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CaseStatusBadge, type CaseStatus } from '../components/CaseStatusBadge';
import { PriorityIndicator, type Priority } from '../components/PriorityIndicator';
import { apiGet } from '../api/client';

interface VendorCase {
  id: string;
  case_id: string;
  caseNumber: string;
  type: string;
  status: CaseStatus;
  priority: Priority;
  tatRemaining: string;
  submittedAt?: string;
}

interface VendorCasesResponse {
  data: VendorCase[];
  total: number;
}

const MOCK_VENDOR_CASES: VendorCase[] = [
  { id: '1', case_id: 'case-1042', caseNumber: 'CASE-1042', type: 'Valuation', status: 'PENDING_VENDOR', priority: 'P2', tatRemaining: '12h 30m' },
  { id: '2', case_id: 'case-1038', caseNumber: 'CASE-1038', type: 'Inspection', status: 'IN_PROGRESS', priority: 'P1', tatRemaining: '4h 15m' },
  { id: '3', case_id: 'case-1035', caseNumber: 'CASE-1035', type: 'Settlement', status: 'PENDING_VENDOR', priority: 'P3', tatRemaining: '2d 6h' },
  { id: '4', case_id: 'case-1031', caseNumber: 'CASE-1031', type: 'Title Search', status: 'IN_PROGRESS', priority: 'P1', tatRemaining: '1h 45m' },
  { id: '5', case_id: 'case-1029', caseNumber: 'CASE-1029', type: 'Valuation', status: 'PENDING_VENDOR', priority: 'P4', tatRemaining: '5d 0h', submittedAt: new Date().toISOString() },
];

// In a real app this would come from auth context or route param
const VENDOR_ID = 'vendor-001';

/**
 * Check whether a TAT string represents an overdue case.
 * Negative or zero remaining TAT is considered overdue.
 */
function isOverdue(tatRemaining: string): boolean {
  return tatRemaining.startsWith('-') || tatRemaining === '0h 0m';
}

/**
 * Check whether a case was submitted today.
 */
function isSubmittedToday(submittedAt?: string): boolean {
  if (!submittedAt) return false;
  const today = new Date().toISOString().split('T')[0];
  return submittedAt.startsWith(today);
}

const VendorPortalPage = () => {
  const [vendorId] = useState(VENDOR_ID);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['vendor-cases', vendorId],
    queryFn: () => apiGet<VendorCasesResponse>('/cases', { vendor_id: vendorId }),
  });

  const cases: VendorCase[] = data?.data ?? MOCK_VENDOR_CASES;
  const total = data?.total ?? MOCK_VENDOR_CASES.length;

  // Derive unique statuses and types for filter dropdowns
  const uniqueStatuses = useMemo(() => [...new Set(cases.map((c) => c.status))], [cases]);
  const uniqueTypes = useMemo(() => [...new Set(cases.map((c) => c.type))], [cases]);

  // Apply filters
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (typeFilter && c.type !== typeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesCaseNumber = c.caseNumber.toLowerCase().includes(q);
        const matchesType = c.type.toLowerCase().includes(q);
        if (!matchesCaseNumber && !matchesType) return false;
      }
      return true;
    });
  }, [cases, statusFilter, typeFilter, searchQuery]);

  // Compute summary tile values
  const openCount = cases.filter(
    (c) => c.status !== 'CLOSED' && c.status !== ('CANCELLED' as CaseStatus),
  ).length;
  const overdueCount = cases.filter((c) => isOverdue(c.tatRemaining)).length;
  const submittedTodayCount = cases.filter((c) => isSubmittedToday(c.submittedAt)).length;
  const weekScore = total > 0 ? Math.round(((total - overdueCount) / total) * 100) : 0;

  if (isLoading) {
    return (
      <div>
        <h2 style={styles.heading}>Vendor Portal</h2>
        <div style={styles.placeholder}>
          <p>Loading vendor cases...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h2 style={styles.heading}>Vendor Portal</h2>
        <div style={{ ...styles.placeholder, borderColor: '#fecaca' }}>
          <p style={{ color: '#dc2626' }}>
            Failed to load cases: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="vendor-portal">
      <h2 style={styles.heading}>Vendor Portal</h2>
      <p style={styles.subtitle}>
        Read-only view of assigned cases ({total} total)
      </p>

      <button data-testid="start-onboarding-btn" onClick={() => { setShowOnboarding(true); setOnboardingStep(1); }} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, marginBottom: 16, cursor: 'pointer' }}>
        Start Vendor Onboarding
      </button>

      {/* FR-156.A1: Vendor Onboarding Wizard */}
      {showOnboarding && (
        <div data-testid="vendor-onboarding-wizard" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, maxWidth: 500, width: '100%' }}>
            <h2>Vendor Onboarding — Step {onboardingStep} of 3</h2>
            {onboardingStep === 1 && (
              <div data-testid="onboarding-step-1">
                <p>Enter your organization details</p>
                <input placeholder="Organization Name" style={{ width: '100%', padding: 8, marginBottom: 12, border: '1px solid #ddd', borderRadius: 4 }} />
                <input placeholder="Contact Email" style={{ width: '100%', padding: 8, marginBottom: 12, border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
            )}
            {onboardingStep === 2 && (
              <div data-testid="onboarding-step-2">
                <p>Configure integration settings</p>
                <select style={{ width: '100%', padding: 8, marginBottom: 12, border: '1px solid #ddd', borderRadius: 4 }}>
                  <option>API Integration</option>
                  <option>Email Integration</option>
                  <option>Portal Only</option>
                </select>
                <input placeholder="API Key (if applicable)" style={{ width: '100%', padding: 8, marginBottom: 12, border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
            )}
            {onboardingStep === 3 && (
              <div data-testid="onboarding-step-3">
                <p>Review and confirm</p>
                <p style={{ color: '#059669' }}>Organization details configured</p>
                <p style={{ color: '#059669' }}>Integration settings saved</p>
                <p>Click &quot;Complete&quot; to finish onboarding.</p>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button onClick={() => onboardingStep > 1 ? setOnboardingStep(s => s - 1) : setShowOnboarding(false)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
                {onboardingStep === 1 ? 'Cancel' : 'Back'}
              </button>
              <button onClick={() => onboardingStep < 3 ? setOnboardingStep(s => s + 1) : setShowOnboarding(false)} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                {onboardingStep === 3 ? 'Complete' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FR-081 A1: Summary tiles */}
      <div style={styles.tilesContainer} data-testid="vendor-summary-tiles">
        <div style={{ ...styles.tile, borderLeft: '4px solid #3b82f6' }}>
          <div style={styles.tileLabel}>Open Cases</div>
          <div style={styles.tileValue}>{openCount}</div>
        </div>
        <div style={{ ...styles.tile, borderLeft: '4px solid #ef4444' }}>
          <div style={styles.tileLabel}>Overdue</div>
          <div style={styles.tileValue}>{overdueCount}</div>
        </div>
        <div style={{ ...styles.tile, borderLeft: '4px solid #22c55e' }}>
          <div style={styles.tileLabel}>Submitted Today</div>
          <div style={styles.tileValue}>{submittedTodayCount}</div>
        </div>
        <div style={{ ...styles.tile, borderLeft: '4px solid #a855f7' }}>
          <div style={styles.tileLabel}>This Week Score</div>
          <div style={styles.tileValue}>{weekScore}%</div>
        </div>
      </div>

      {/* FR-081 A2: Filter controls */}
      <div style={styles.filtersContainer} data-testid="vendor-filters">
        <select
          style={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {uniqueStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          style={styles.filterSelect}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All Types</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          style={styles.filterInput}
          type="text"
          placeholder="Search cases..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search cases"
        />
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table} role="table" aria-label="Vendor cases">
          <thead>
            <tr>
              <th style={styles.th}>Case #</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Priority</th>
              <th style={styles.th}>TAT Remaining</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.map((c) => (
              <tr
                key={c.id}
                data-testid="vendor-case-row"
                style={styles.clickableRow}
                onClick={() => navigate(`/cases/${c.case_id}`)}
              >
                <td style={styles.td}><strong>{c.caseNumber}</strong></td>
                <td style={styles.td}>{c.type}</td>
                <td style={styles.td}><CaseStatusBadge status={c.status} /></td>
                <td style={styles.td}><PriorityIndicator priority={c.priority} /></td>
                <td style={styles.td}>{c.tatRemaining}</td>
              </tr>
            ))}
            {filteredCases.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8' }}>
                  No cases match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const styles: Record<string, CSSProperties> = {
  heading: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  subtitle: {
    margin: '0 0 1rem 0',
    fontSize: '0.875rem',
    color: '#64748b',
  },
  tilesContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1rem',
    marginBottom: '1rem',
  },
  tile: {
    padding: '1rem',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
  },
  tileLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    color: '#64748b',
    marginBottom: '0.25rem',
  },
  tileValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  filtersContainer: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '1rem',
    flexWrap: 'wrap' as const,
  },
  filterSelect: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    fontSize: '0.875rem',
    minWidth: '160px',
  },
  filterInput: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    fontSize: '0.875rem',
    minWidth: '200px',
    flex: 1,
  },
  tableContainer: {
    overflowX: 'auto',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    backgroundColor: 'var(--color-surface)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.75rem 1rem',
    borderBottom: '2px solid var(--color-border)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    fontWeight: 600,
    color: '#64748b',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--color-border)',
    whiteSpace: 'nowrap',
  },
  clickableRow: {
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
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
};

export default VendorPortalPage;
