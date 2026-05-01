import { useState, type CSSProperties } from 'react';
import { apiPost } from '../api/client';

/**
 * A candidate match returned by the CanonicalLookupService FUZZY match.
 */
export interface DisambiguationCandidate {
  /** The canonical form of the master record */
  canonicalForm: string;
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  /** The match type (typically FUZZY) */
  matchType: string;
  /** Display label (e.g. city name, case type name) */
  displayLabel: string;
  /** The master record ID for selection */
  recordId: string;
}

export interface DisambiguationModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** The case ID this disambiguation applies to */
  caseId: string;
  /** The raw value that produced a fuzzy match */
  rawValue: string;
  /** The field being disambiguated (e.g. "propertyCity", "caseType") */
  fieldName: string;
  /** The candidate matches to choose from */
  candidates: DisambiguationCandidate[];
  /** Called when the modal is closed without selection */
  onClose: () => void;
  /** Called after a successful selection */
  onResolved: (selectedCanonicalForm: string) => void;
}

/**
 * DisambiguationModal
 *
 * Displayed when the CanonicalLookupService returns a FUZZY match during triage.
 * Shows the top matching candidates with confidence scores and allows the
 * officer to select the correct master record. On confirmation, calls
 * POST /triage/:caseId/correct with the selected canonical value.
 */
export function DisambiguationModal({
  isOpen,
  caseId,
  rawValue,
  fieldName,
  candidates,
  onClose,
  onResolved,
}: DisambiguationModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedCandidate = candidates.find((c) => c.recordId === selectedId);

  const handleConfirm = async () => {
    if (!selectedCandidate) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await apiPost(`/triage/${caseId}/correct`, {
        correctedCaseType: selectedCandidate.canonicalForm,
        reason: `Disambiguation: officer selected "${selectedCandidate.canonicalForm}" for fuzzy-matched field "${fieldName}" (raw value: "${rawValue}")`,
      });
      onResolved(selectedCandidate.canonicalForm);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to submit correction. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return '#16a34a';
    if (confidence >= 0.6) return '#ca8a04';
    return '#dc2626';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>Disambiguate: {fieldName}</h3>
          <button onClick={onClose} style={styles.closeButton} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Description */}
        <div style={styles.description}>
          <p style={styles.descText}>
            The value <strong>&quot;{rawValue}&quot;</strong> produced a fuzzy match.
            Please select the correct master record from the candidates below.
          </p>
        </div>

        {/* Candidates list */}
        <div style={styles.candidateList}>
          {candidates.map((candidate) => {
            const isSelected = selectedId === candidate.recordId;
            return (
              <button
                key={candidate.recordId}
                onClick={() => setSelectedId(candidate.recordId)}
                style={{
                  ...styles.candidateRow,
                  ...(isSelected ? styles.candidateRowSelected : {}),
                }}
              >
                <div style={styles.candidateInfo}>
                  <span style={styles.candidateLabel}>
                    {candidate.displayLabel || candidate.canonicalForm}
                  </span>
                  <span style={styles.candidateCanonical}>
                    {candidate.canonicalForm}
                  </span>
                </div>
                <div style={styles.candidateScore}>
                  <span
                    style={{
                      ...styles.confidenceBadge,
                      backgroundColor: `${getConfidenceColor(candidate.confidence)}20`,
                      color: getConfidenceColor(candidate.confidence),
                    }}
                  >
                    {(candidate.confidence * 100).toFixed(0)}% -{' '}
                    {getConfidenceLabel(candidate.confidence)}
                  </span>
                </div>
                <div style={styles.radioIndicator}>
                  <div
                    style={{
                      ...styles.radio,
                      ...(isSelected ? styles.radioSelected : {}),
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button onClick={onClose} style={styles.cancelButton}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId || isSubmitting}
            style={{
              ...styles.confirmButton,
              opacity: !selectedId || isSubmitting ? 0.5 : 1,
            }}
          >
            {isSubmitting ? 'Submitting...' : 'Confirm Selection'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '560px',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid #e2e8f0',
  },
  title: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#1e293b',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '0 0.25rem',
    lineHeight: 1,
  },
  description: {
    padding: '1rem 1.5rem',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  descText: {
    margin: 0,
    fontSize: '0.875rem',
    color: '#475569',
    lineHeight: 1.5,
  },
  candidateList: {
    padding: '0.75rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  candidateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  candidateRowSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  candidateInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  candidateLabel: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#1e293b',
  },
  candidateCanonical: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  candidateScore: {
    flexShrink: 0,
  },
  confidenceBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 700,
  },
  radioIndicator: {
    flexShrink: 0,
  },
  radio: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: '2px solid #cbd5e1',
    backgroundColor: '#ffffff',
  },
  radioSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#3b82f6',
    boxShadow: 'inset 0 0 0 3px #ffffff',
  },
  errorBox: {
    margin: '0 1.5rem',
    padding: '0.75rem',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
  },
  errorText: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#dc2626',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '1rem 1.5rem',
    borderTop: '1px solid #e2e8f0',
  },
  cancelButton: {
    padding: '0.5rem 1.25rem',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    color: '#475569',
  },
  confirmButton: {
    padding: '0.5rem 1.25rem',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#3b82f6',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    color: '#ffffff',
  },
};

export default DisambiguationModal;
