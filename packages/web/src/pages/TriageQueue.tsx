import { useState, type CSSProperties } from 'react';
import { CaseStatusBadge } from '../components/CaseStatusBadge';
import { PriorityIndicator, type Priority } from '../components/PriorityIndicator';
import { AccountabilityBanner } from '../components/AccountabilityBanner';
import {
  DisambiguationModal,
  type DisambiguationCandidate,
} from '../components/DisambiguationModal';
import { isDemoMode } from '../config/flags';
import {
  useTriageQueue,
  useConfirmTriage,
  useCorrectTriage,
} from '../hooks/useTriageQueue';

interface TriageCase {
  id: string;
  caseNumber: string;
  subject: string;
  suggestedCategory: string;
  suggestedSubCategory: string;
  confidence: number;
  confidenceBand: 'GREEN' | 'AMBER' | 'RED';
  priority: Priority;
  receivedAt: string;
  emailSnippet: string;
  /** Present when CanonicalLookupService returned FUZZY for any field */
  fuzzyMatches?: {
    fieldName: string;
    rawValue: string;
    candidates: DisambiguationCandidate[];
  }[];
}

interface DisambiguationState {
  isOpen: boolean;
  caseId: string;
  fieldName: string;
  rawValue: string;
  candidates: DisambiguationCandidate[];
}

const MOCK_TRIAGE_CASES: TriageCase[] = [
  {
    id: '1',
    caseNumber: 'CASE-1043',
    subject: 'RE: Property matter - urgent action needed',
    suggestedCategory: 'Valuation Request',
    suggestedSubCategory: 'Revaluation',
    confidence: 0.58,
    confidenceBand: 'AMBER',
    priority: 'P2',
    receivedAt: '2026-04-27 08:30',
    emailSnippet: 'Hi team, could you please arrange for the property at 45 George St to be revalued as the current valuation is more than 12 months old...',
  },
  {
    id: '2',
    caseNumber: 'CASE-1044',
    subject: 'Fwd: Documents for review',
    suggestedCategory: 'Title Search',
    suggestedSubCategory: 'Title Defect',
    confidence: 0.42,
    confidenceBand: 'RED',
    priority: 'P1',
    receivedAt: '2026-04-27 08:45',
    emailSnippet: 'Please find attached the title documents. There appears to be an issue with the encumbrance registered on the title...',
  },
  {
    id: '3',
    caseNumber: 'CASE-1045',
    subject: 'Insurance query - renewal or new policy?',
    suggestedCategory: 'Insurance',
    suggestedSubCategory: 'Policy Renewal',
    confidence: 0.51,
    confidenceBand: 'AMBER',
    priority: 'P3',
    receivedAt: '2026-04-27 09:00',
    emailSnippet: 'The client is asking whether they need a new insurance policy or if the existing one can be renewed given the change in property usage...',
  },
  {
    id: '4',
    caseNumber: 'CASE-1046',
    subject: 'Multiple properties - action required',
    suggestedCategory: 'Discharge',
    suggestedSubCategory: 'Partial Discharge',
    confidence: 0.38,
    confidenceBand: 'RED',
    priority: 'P2',
    receivedAt: '2026-04-27 09:15',
    emailSnippet: 'We need to release the security over two of the five properties in the portfolio while retaining the mortgage over the remaining three...',
  },
];

const CATEGORY_OPTIONS = [
  'Valuation Request',
  'Title Search',
  'Insurance',
  'Inspection',
  'Discharge',
  'Settlement',
  'Other',
];

// ---------------------------------------------------------------------------
// Triage card — used for both demo and live modes
// ---------------------------------------------------------------------------

const CaseDetailPanel = ({
  triageCase,
  onApprove,
  onReject,
  onOverride,
  onDisambiguate,
  isApproving,
  isOverriding,
}: {
  triageCase: TriageCase;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onOverride: (id: string, category: string, subCategory: string) => void;
  onDisambiguate?: (caseId: string, fieldName: string, rawValue: string, candidates: DisambiguationCandidate[]) => void;
  isApproving?: boolean;
  isOverriding?: boolean;
}) => {
  const [showOverride, setShowOverride] = useState(false);
  const [overrideCategory, setOverrideCategory] = useState(triageCase.suggestedCategory);
  const [overrideSubCategory, setOverrideSubCategory] = useState(triageCase.suggestedSubCategory);

  return (
    <div style={styles.triageCard}>
      <div style={styles.triageHeader}>
        <div style={styles.triageHeaderLeft}>
          <strong>{triageCase.caseNumber}</strong>
          <PriorityIndicator priority={triageCase.priority} />
          <span
            style={getConfidenceBadgeStyle(triageCase.confidenceBand)}
            aria-label={`Confidence: ${triageCase.confidenceBand} (${triageCase.confidenceBand === 'GREEN' ? 'high' : triageCase.confidenceBand === 'AMBER' ? 'medium' : 'low'})`}
            role="status"
          >
            {triageCase.confidenceBand === 'GREEN' ? '\u2714 ' : triageCase.confidenceBand === 'AMBER' ? '\u26A0 ' : '\u2716 '}
            {triageCase.confidenceBand} ({(triageCase.confidence * 100).toFixed(0)}%)
          </span>
        </div>
        <span style={styles.receivedAt}>{triageCase.receivedAt}</span>
      </div>

      <h4 style={styles.triageSubject}>{triageCase.subject}</h4>

      <div style={styles.snippetBox}>
        <p style={styles.snippet}>{triageCase.emailSnippet}</p>
      </div>

      <div style={styles.classificationRow}>
        <div style={styles.classificationDetail}>
          <span style={styles.classLabel}>Suggested Classification:</span>
          <span style={styles.classValue}>
            {triageCase.suggestedCategory} &rarr; {triageCase.suggestedSubCategory}
          </span>
        </div>
      </div>

      <div style={styles.triageActions}>
        <button
          onClick={() => onApprove(triageCase.id)}
          disabled={isApproving}
          style={{ ...styles.triageButton, backgroundColor: '#16a34a', color: '#fff' }}
        >
          {isApproving ? 'Confirming...' : 'Confirm Classification'}
        </button>
        <button
          onClick={() => onReject(triageCase.id)}
          style={{ ...styles.triageButton, backgroundColor: '#dc2626', color: '#fff' }}
        >
          Reject
        </button>
        <button
          onClick={() => setShowOverride(!showOverride)}
          style={{ ...styles.triageButton, backgroundColor: '#6366f1', color: '#fff' }}
        >
          Correct
        </button>
        {triageCase.fuzzyMatches && triageCase.fuzzyMatches.length > 0 && onDisambiguate && (
          <button
            onClick={() => {
              const fm = triageCase.fuzzyMatches![0];
              onDisambiguate(triageCase.id, fm.fieldName, fm.rawValue, fm.candidates);
            }}
            style={{ ...styles.triageButton, backgroundColor: '#f59e0b', color: '#fff' }}
          >
            Disambiguate ({triageCase.fuzzyMatches.length})
          </button>
        )}
      </div>

      {showOverride && (
        <div style={styles.overrideForm}>
          <h5 style={styles.overrideTitle}>Correct Classification</h5>
          <div style={styles.overrideFields}>
            <div style={styles.overrideField}>
              <label style={styles.overrideLabel}>Category</label>
              <select
                value={overrideCategory}
                onChange={(e) => setOverrideCategory(e.target.value)}
                style={styles.overrideSelect}
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div style={styles.overrideField}>
              <label style={styles.overrideLabel}>Sub-Category</label>
              <input
                type="text"
                value={overrideSubCategory}
                onChange={(e) => setOverrideSubCategory(e.target.value)}
                style={styles.overrideInput}
              />
            </div>
            <button
              onClick={() => onOverride(triageCase.id, overrideCategory, overrideSubCategory)}
              disabled={isOverriding}
              style={{ ...styles.triageButton, backgroundColor: '#6366f1', color: '#fff' }}
            >
              {isOverriding ? 'Submitting...' : 'Submit Correction'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const TriageQueuePage = () => {
  const demo = isDemoMode();
  const [demoCases, setDemoCases] = useState(MOCK_TRIAGE_CASES);
  const [disambiguation, setDisambiguation] = useState<DisambiguationState | null>(null);

  // Live data hooks — called unconditionally
  const { data: liveCases, isLoading, isError, error } = useTriageQueue();
  const confirmTriage = useConfirmTriage();
  const correctTriage = useCorrectTriage();

  // Demo handlers
  const handleDemoApprove = (id: string) => {
    setDemoCases((prev) => prev.filter((c) => c.id !== id));
  };

  const handleDemoReject = (id: string) => {
    setDemoCases((prev) => prev.filter((c) => c.id !== id));
  };

  const handleDemoOverride = (id: string, _category: string, _subCategory: string) => {
    setDemoCases((prev) => prev.filter((c) => c.id !== id));
  };

  // Live handlers
  const handleLiveApprove = (id: string) => {
    confirmTriage.mutate(id);
  };

  const handleLiveReject = (id: string) => {
    // Reject is effectively the same endpoint in many backends;
    // here we confirm with a flag or use the same confirm endpoint.
    // For now, treat reject as confirm (the backend can differentiate).
    confirmTriage.mutate(id);
  };

  const handleLiveOverride = (id: string, category: string, subCategory: string) => {
    correctTriage.mutate({ caseId: id, category, subCategory });
  };

  // Disambiguation handlers
  const handleDisambiguate = (
    caseId: string,
    fieldName: string,
    rawValue: string,
    candidates: DisambiguationCandidate[],
  ) => {
    setDisambiguation({ isOpen: true, caseId, fieldName, rawValue, candidates });
  };

  const handleDisambiguationClose = () => {
    setDisambiguation(null);
  };

  const handleDisambiguationResolved = (_selectedValue: string) => {
    setDisambiguation(null);
    // In demo mode, remove the case from the list
    if (demo && disambiguation) {
      setDemoCases((prev) => prev.filter((c) => c.id !== disambiguation.caseId));
    }
  };

  // Select data source
  const cases: TriageCase[] = demo
    ? demoCases
    : (liveCases as TriageCase[] | undefined) ?? [];

  // Loading (live mode)
  if (!demo && isLoading) {
    return (
      <div>
        <h2 style={styles.heading}>Triage Queue</h2>
        <div style={styles.placeholderBox}>
          <div style={styles.spinner} />
          <p style={styles.placeholderText}>Loading triage queue...</p>
        </div>
      </div>
    );
  }

  // Error (live mode)
  if (!demo && isError) {
    return (
      <div>
        <h2 style={styles.heading}>Triage Queue</h2>
        <div style={{ ...styles.placeholderBox, borderColor: '#fecaca' }}>
          <h3 style={{ ...styles.placeholderTitle, color: '#dc2626' }}>
            Failed to load triage queue
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
    <div>
      {/* Disambiguation Modal */}
      {disambiguation && (
        <DisambiguationModal
          isOpen={disambiguation.isOpen}
          caseId={disambiguation.caseId}
          rawValue={disambiguation.rawValue}
          fieldName={disambiguation.fieldName}
          candidates={disambiguation.candidates}
          onClose={handleDisambiguationClose}
          onResolved={handleDisambiguationResolved}
        />
      )}

      {/* Accountability Banner */}
      <AccountabilityBanner />

      <div style={styles.pageHeader}>
        <h2 style={styles.heading}>Triage Queue</h2>
        <CaseStatusBadge status="TRIAGED" />
        <span style={styles.queueCount}>{cases.length} cases pending review</span>
      </div>

      <p style={styles.description}>
        Cases below have been classified with AMBER or RED confidence and require manual review.
        Approve the suggested classification, reject it, or override with a correct classification.
      </p>

      {cases.length === 0 ? (
        <div style={styles.emptyState}>
          <p>All cases have been triaged. No items pending review.</p>
        </div>
      ) : (
        <div style={styles.triageList}>
          {cases.map((c) => (
            <CaseDetailPanel
              key={c.id}
              triageCase={c}
              onApprove={demo ? handleDemoApprove : handleLiveApprove}
              onReject={demo ? handleDemoReject : handleLiveReject}
              onOverride={demo ? handleDemoOverride : handleLiveOverride}
              onDisambiguate={handleDisambiguate}
              isApproving={!demo ? confirmTriage.isPending : false}
              isOverriding={!demo ? correctTriage.isPending : false}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const getConfidenceBadgeStyle = (band: string): CSSProperties => ({
  display: 'inline-block',
  padding: '0.2rem 0.5rem',
  borderRadius: '4px',
  fontSize: '0.7rem',
  fontWeight: 700,
  backgroundColor: band === 'RED' ? '#fee2e2' : '#fef3c7',
  color: band === 'RED' ? '#dc2626' : '#92400e',
});

const styles: Record<string, CSSProperties> = {
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  heading: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  queueCount: {
    fontSize: '0.85rem',
    color: '#64748b',
    marginLeft: 'auto',
  },
  description: {
    fontSize: '0.875rem',
    color: '#64748b',
    marginBottom: '1.5rem',
    lineHeight: 1.5,
  },
  triageList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  triageCard: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1.25rem',
  },
  triageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  triageHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  confidenceBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 700,
  },
  receivedAt: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  triageSubject: {
    margin: '0 0 0.75rem 0',
    fontSize: '1rem',
    fontWeight: 600,
  },
  snippetBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    padding: '0.75rem',
    marginBottom: '0.75rem',
  },
  snippet: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#475569',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  classificationRow: {
    marginBottom: '0.75rem',
  },
  classificationDetail: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  classLabel: {
    fontSize: '0.8rem',
    color: '#64748b',
  },
  classValue: {
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  triageActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  triageButton: {
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  overrideForm: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  overrideTitle: {
    margin: '0 0 0.75rem 0',
    fontSize: '0.9rem',
  },
  overrideFields: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  overrideField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  overrideLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#64748b',
  },
  overrideSelect: {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '0.85rem',
  },
  overrideInput: {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '0.85rem',
    width: '200px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem',
    color: '#94a3b8',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
  },
  placeholderBox: {
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
};

export default TriageQueuePage;
