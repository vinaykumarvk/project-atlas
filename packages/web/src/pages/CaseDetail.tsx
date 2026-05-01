import { useState, useMemo, useCallback, useEffect, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CaseStatusBadge, type CaseStatus } from '../components/CaseStatusBadge';
import { PriorityIndicator, type Priority } from '../components/PriorityIndicator';
import { SlaProgressBar } from '../components/SlaProgressBar';
import { AccountabilityBanner } from '../components/AccountabilityBanner';
import { ConfidenceBadge, type ConfidenceBand } from '../components/ConfidenceBadge';
import { SourceSpanHighlight } from '../components/SourceSpanHighlight';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { isDemoMode } from '../config/flags';
import { parseMentions } from '../utils/parseMentions';
import { useCase, useTransitionStatus, useAddNote, usePauseSla, useResumeSla, useUpdateCase, type CaseDetail as CaseDetailType } from '../hooks/useCases';
import { useConfirmTriage, useCorrectTriage } from '../hooks/useTriageQueue';
import { useHotkeys } from '../hooks/useHotkeys';
import { useAuth } from '../auth';
import { apiGet, apiPost } from '../api/client';

type TabId = 'overview' | 'activity' | 'linked' | 'attachments' | 'reply-drafts';

/** FR-052.A2: Suggested action from the AI pipeline. */
interface SuggestedAction {
  id: string;
  action: string;
  description: string;
  confidence: number;
  source: 'RULE' | 'LLM';
  /** FR-052.A2: Recipient role for the suggested action. */
  recipientRole?: string;
  /** FR-052.A3: Estimated TAT impact in hours. */
  estimatedTatImpactHours?: number;
}

/** FR-053.A2: Reply draft for the case. */
interface ReplyDraftItem {
  id: string;
  caseId: string;
  subject: string;
  body: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'SENT';
  generatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

const MOCK_SUGGESTED_ACTIONS: SuggestedAction[] = [
  { id: 'sa-1', action: 'CLASSIFY', description: 'Run the AI classification pipeline to categorise this case.', confidence: 0.95, source: 'RULE', recipientRole: 'OFFICER', estimatedTatImpactHours: 2 },
  { id: 'sa-2', action: 'ROUTE', description: 'Route this case to the appropriate team or FPR based on classification.', confidence: 0.9, source: 'RULE', recipientRole: 'FPR', estimatedTatImpactHours: 4 },
  { id: 'sa-3', action: 'PRIORITISE', description: 'This is a high-priority case. Ensure it receives immediate attention.', confidence: 0.85, source: 'LLM', recipientRole: 'LEAD', estimatedTatImpactHours: 1 },
];

const MOCK_REPLY_DRAFTS: ReplyDraftItem[] = [
  {
    id: 'rd-1',
    caseId: '1',
    subject: 'Re: Valuation Request - 123 Main St, Sydney NSW 2000',
    body: 'Dear Customer,\n\nThank you for your valuation request. We have received your request and will process it promptly.\n\nBest regards,\nProperty Services Team',
    status: 'PROPOSED',
    generatedAt: '2026-04-27T10:00:00Z',
  },
  {
    id: 'rd-2',
    caseId: '1',
    subject: 'Re: Valuation Request - 123 Main St, Sydney NSW 2000',
    body: 'Dear Customer,\n\nYour valuation has been completed. Please find the attached report.\n\nBest regards,\nProperty Services Team',
    status: 'APPROVED',
    generatedAt: '2026-04-27T11:30:00Z',
    approvedBy: 'John Smith',
    approvedAt: '2026-04-27T12:00:00Z',
  },
];

interface CaseData {
  id: string;
  caseNumber: string;
  subject: string;
  status: CaseStatus;
  priority: Priority;
  type: string;
  assignedFpr: string;
  createdAt: string;
  tatDue: string;
  slaRemainingPercent: number;
  classification: {
    category: string;
    subCategory: string;
    confidence: number;
    confidenceBand: string;
    modelVersion?: string;
    llmMode?: string;
  };
  entities: Array<{ type: string; value: string; outcome?: string; candidates?: string[]; sourceText?: string; confidence?: number }>;
  securityVerdicts?: {
    spf: 'PASS' | 'FAIL';
    dkim: 'PASS' | 'FAIL';
    dmarc: 'PASS' | 'FAIL';
  };
  routing_rationale?: string;
  customer: {
    name: string;
    accountNumber: string;
    segment: string;
  };
  property: {
    address: string;
    type: string;
    state: string;
    valuationAmount: string;
  };
  notes?: Array<{
    id: string;
    text: string;
    createdBy: string;
    createdAt: string;
  }>;
}

interface ActivityEvent {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  details: string;
}

interface LinkedCase {
  id: string;
  caseNumber: string;
  subject: string;
  relationship: string;
}

interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  avStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'ERROR';
  avVerdict?: string;
  documentType?: string;
  docTypeConfidence?: number;
  ocrText?: string;
  downloadUrl?: string;
  dms_external_id?: string;
}

const MOCK_CASE: CaseData = {
  id: '1',
  caseNumber: 'CASE-1042',
  subject: 'Valuation Request - 123 Main St, Sydney NSW 2000',
  status: 'IN_PROGRESS',
  priority: 'P2',
  type: 'Valuation',
  assignedFpr: 'John Smith',
  createdAt: '2026-04-27T09:15:00Z',
  tatDue: '2026-04-28T17:00:00Z',
  slaRemainingPercent: 65,
  classification: {
    category: 'Valuation Request',
    subCategory: 'New Valuation',
    confidence: 0.92,
    confidenceBand: 'GREEN',
  },
  entities: [
    { type: 'Property Address', value: '123 Main St, Sydney NSW 2000', outcome: 'EXACT_MATCH', sourceText: '123 Main St, Sydney NSW 2000', confidence: 0.97 },
    { type: 'Customer Name', value: 'Acme Corp Pty Ltd', outcome: 'FUZZY_MATCH', candidates: ['Acme Corp Pty Ltd', 'ACME Corporation Pty Limited'], sourceText: 'Acme Corp', confidence: 0.78 },
    { type: 'Loan Reference', value: 'LN-2026-00451', outcome: 'EXACT_MATCH', sourceText: 'LN-2026-00451', confidence: 0.99 },
    { type: 'Amount', value: '$1,250,000', outcome: 'FUZZY_MATCH', candidates: ['$1,250,000', '$1,250,000.00', 'AUD 1.25M'], sourceText: '$1.25M', confidence: 0.82 },
  ],
  securityVerdicts: {
    spf: 'PASS',
    dkim: 'PASS',
    dmarc: 'FAIL',
  },
  routing_rationale: 'Region matches NSW assignment rules; Sub-category "New Valuation" routes to Valuation team; Priority P2 assigned based on loan value > $1M; FPR John Smith selected — lowest current caseload in region',
  customer: {
    name: 'Acme Corp Pty Ltd',
    accountNumber: 'ACC-987654',
    segment: 'Commercial',
  },
  property: {
    address: '123 Main St, Sydney NSW 2000',
    type: 'Commercial Office',
    state: 'NSW',
    valuationAmount: '$1,250,000',
  },
};

const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: '1', timestamp: '2026-04-27 09:15', action: 'Case Created', user: 'System', details: 'Email ingested and classified automatically.' },
  { id: '2', timestamp: '2026-04-27 09:16', action: 'Classification Applied', user: 'ML Pipeline', details: 'Category: Valuation Request | Confidence: 92% (GREEN)' },
  { id: '3', timestamp: '2026-04-27 09:20', action: 'Auto-Assigned', user: 'System', details: 'Assigned to FPR John Smith based on region rules.' },
  { id: '4', timestamp: '2026-04-27 09:45', action: 'Status Changed', user: 'John Smith', details: 'Status changed from NEW to IN_PROGRESS' },
  { id: '5', timestamp: '2026-04-27 10:30', action: 'Vendor Ordered', user: 'John Smith', details: 'Valuation ordered from ABC Valuers Pty Ltd' },
];

const MOCK_LINKED_CASES: LinkedCase[] = [
  { id: '4', caseNumber: 'CASE-1039', subject: 'Property Inspection - 123 Main St', relationship: 'Related Property' },
  { id: '8', caseNumber: 'CASE-1035', subject: 'Settlement Coordination - Acme Corp', relationship: 'Same Customer' },
];

const MOCK_ATTACHMENTS: Attachment[] = [
  {
    id: '1',
    name: 'original-email.eml',
    mimeType: 'message/rfc822',
    size: '45 KB',
    sizeBytes: 46080,
    uploadedAt: '2026-04-27',
    uploadedBy: 'System',
    avStatus: 'CLEAN',
    avVerdict: 'NOOP_CLEAN',
    documentType: 'EMAIL',
  },
  {
    id: '2',
    name: 'property-title-search.pdf',
    mimeType: 'application/pdf',
    size: '1.2 MB',
    sizeBytes: 1258291,
    uploadedAt: '2026-04-27',
    uploadedBy: 'John Smith',
    avStatus: 'CLEAN',
    avVerdict: 'NOOP_CLEAN',
    documentType: 'LEGAL_OPINION',
    docTypeConfidence: 0.87,
    ocrText: 'Property Title Search Report\n\nSubject Property: 123 Main St, Sydney NSW 2000\nTitle Reference: DP123456\nOwner: Acme Corp Pty Ltd\n\nNo encumbrances found.',
    downloadUrl: '#',
    dms_external_id: 'DMS-DOC-20260427-002',
  },
  {
    id: '3',
    name: 'valuation-order-form.pdf',
    mimeType: 'application/pdf',
    size: '320 KB',
    sizeBytes: 327680,
    uploadedAt: '2026-04-27',
    uploadedBy: 'John Smith',
    avStatus: 'CLEAN',
    avVerdict: 'NOOP_CLEAN',
    documentType: 'VALUATION_REPORT',
    docTypeConfidence: 0.93,
    ocrText: 'Valuation Order Form\n\nLoan Reference: LN-2026-00451\nProperty: 123 Main St, Sydney NSW 2000\nValuation Type: Full',
    downloadUrl: '#',
  },
];

const STATUS_OPTIONS: CaseStatus[] = ['NEW', 'TRIAGED', 'IN_PROGRESS', 'PENDING_VENDOR', 'PENDING_INFO', 'RESOLVED', 'CLOSED'];

function mapLiveCaseToData(liveCase: CaseDetailType, caseId: string): CaseData {
  return {
    ...liveCase,
    id: caseId,
  };
}

const CaseDetailPage = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const demo = isDemoMode();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Live data hooks — called unconditionally (rules of hooks)
  const { data: liveCase, isLoading, isError, error } = useCase(caseId ?? '');
  const transitionStatus = useTransitionStatus();
  const addNote = useAddNote();
  const confirmTriage = useConfirmTriage();
  const correctTriage = useCorrectTriage();
  const pauseSla = usePauseSla();
  const resumeSla = useResumeSla();
  const updateCase = useUpdateCase();

  // Status transition UI state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<CaseStatus>('IN_PROGRESS');
  const [statusReason, setStatusReason] = useState('');

  // Add note UI state
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Correct triage UI state
  const [showCorrectForm, setShowCorrectForm] = useState(false);
  const [correctCategory, setCorrectCategory] = useState('');
  const [correctSubCategory, setCorrectSubCategory] = useState('');

  // Pause SLA UI state
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  // Reassign UI state
  const [showReassignForm, setShowReassignForm] = useState(false);
  const [reassignFprId, setReassignFprId] = useState('');

  // Set Priority UI state
  const [showPriorityForm, setShowPriorityForm] = useState(false);
  const [newPriority, setNewPriority] = useState<string>('P2');

  // Keyboard shortcuts modal state
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Attachment preview modal state (FR-051.A3)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  // Keyboard shortcuts (FR-057.A1) — CaseDetail: n = add note, Esc = go back, ? = help
  const hotkeyMap = useMemo(
    () => ({
      n: () => {
        if (!demo) setShowNoteForm(true);
      },
      Escape: () => {
        if (showShortcutsModal) {
          setShowShortcutsModal(false);
        } else {
          navigate('/cases');
        }
      },
      '?': () => setShowShortcutsModal((v) => !v),
    }),
    [demo, navigate, showShortcutsModal],
  );
  useHotkeys(hotkeyMap);

  // Export Audit Trail handler (FR-054.A3)
  const handleExportAuditTrail = useCallback(async () => {
    if (!caseId) return;
    try {
      const data = await apiGet<unknown>(`/v1/cases/${caseId}/activity`, {
        excludeNotes: 'true',
      } as Record<string, string>);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-trail-${caseId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // In demo mode, generate mock audit data
      if (demo) {
        const mockAudit = MOCK_ACTIVITY.filter((e) => e.action !== 'Note Added');
        const blob = new Blob([JSON.stringify(mockAudit, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-trail-${caseId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  }, [caseId, demo]);

  // Determine case data source
  const caseData: CaseData | null = demo
    ? { ...MOCK_CASE, id: caseId || '1' }
    : liveCase
      ? mapLiveCaseToData(liveCase, caseId || '')
      : null;

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity Log' },
    { id: 'linked', label: 'Linked Cases' },
    { id: 'attachments', label: 'Attachments' },
    { id: 'reply-drafts', label: 'Reply Drafts' },
  ];

  // Loading state (live mode)
  if (!demo && isLoading) {
    return (
      <div>
        <button onClick={() => navigate('/cases')} style={styles.backButton}>
          &larr; Back to Cases
        </button>
        <div style={styles.placeholder}>
          <div style={styles.spinner} />
          <p style={styles.placeholderText}>Loading case details...</p>
        </div>
      </div>
    );
  }

  // Error state (live mode)
  if (!demo && isError) {
    return (
      <div>
        <button onClick={() => navigate('/cases')} style={styles.backButton}>
          &larr; Back to Cases
        </button>
        <div style={{ ...styles.placeholder, borderColor: '#fecaca' }}>
          <h3 style={{ ...styles.placeholderTitle, color: '#dc2626' }}>
            Failed to load case
          </h3>
          <p style={styles.placeholderText}>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </p>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div>
        <button onClick={() => navigate('/cases')} style={styles.backButton}>
          &larr; Back to Cases
        </button>
        <div style={styles.placeholder}>
          <h3 style={styles.placeholderTitle}>Case not found</h3>
          <p style={styles.placeholderText}>
            The requested case could not be found.
          </p>
        </div>
      </div>
    );
  }

  const handleTransitionStatus = () => {
    if (!caseId) return;
    transitionStatus.mutate(
      { caseId, status: selectedStatus, reason: statusReason || undefined },
      {
        onSuccess: () => {
          setShowStatusModal(false);
          setStatusReason('');
        },
      },
    );
  };

  const handleAddNote = () => {
    if (!caseId || !noteText.trim()) return;
    addNote.mutate(
      { caseId, text: noteText.trim() },
      {
        onSuccess: () => {
          setShowNoteForm(false);
          setNoteText('');
        },
      },
    );
  };

  const handleConfirmAI = () => {
    if (!caseId) return;
    confirmTriage.mutate(caseId);
  };

  const handleCorrectClassification = () => {
    if (!caseId || !correctCategory) return;
    correctTriage.mutate(
      { caseId, category: correctCategory, subCategory: correctSubCategory },
      {
        onSuccess: () => {
          setShowCorrectForm(false);
          setCorrectCategory('');
          setCorrectSubCategory('');
        },
      },
    );
  };

  const handlePauseSla = () => {
    if (!caseId || !pauseReason.trim()) return;
    pauseSla.mutate(
      { caseId, reason: pauseReason.trim() },
      {
        onSuccess: () => {
          setShowPauseForm(false);
          setPauseReason('');
        },
      },
    );
  };

  const handleResumeSla = () => {
    if (!caseId) return;
    resumeSla.mutate({ caseId });
  };

  const handleReassign = () => {
    if (!caseId || !reassignFprId.trim()) return;
    updateCase.mutate(
      { caseId, assigned_fpr_id: reassignFprId.trim() },
      {
        onSuccess: () => {
          setShowReassignForm(false);
          setReassignFprId('');
        },
      },
    );
  };

  const handleSetPriority = () => {
    if (!caseId || !newPriority) return;
    updateCase.mutate(
      { caseId, priority: newPriority },
      {
        onSuccess: () => {
          setShowPriorityForm(false);
        },
      },
    );
  };

  return (
    <div>
      {/* Accountability Banner */}
      <AccountabilityBanner
        confidenceBand={caseData.classification.confidenceBand}
        llmMode={caseData.classification.llmMode}
        modelVersion={caseData.classification.modelVersion}
      />

      {/* Three-pane flex layout (FR-051.A1) */}
      <div style={styles.threePaneContainer} data-testid="three-pane-layout">
        {/* Left pane — compact navigation sidebar */}
        <aside style={styles.leftPane} data-testid="left-pane" aria-label="Case navigation sidebar">
          <h4 style={styles.paneTitle}>Related Cases</h4>
          {MOCK_LINKED_CASES.map((linked) => (
            <div
              key={linked.id}
              style={{
                ...styles.sidebarItem,
                backgroundColor: linked.id === caseId ? '#f0f9ff' : 'transparent',
              }}
              onClick={() => navigate(`/cases/${linked.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/cases/${linked.id}`); }}
            >
              <strong style={{ fontSize: '0.75rem' }}>{linked.caseNumber}</strong>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginTop: '0.15rem' }}>{linked.subject}</span>
            </div>
          ))}
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0.5rem 0' }} />
          <div
            style={{
              ...styles.sidebarItem,
              backgroundColor: '#f0f9ff',
              borderLeft: '3px solid var(--color-accent, #3b82f6)',
            }}
          >
            <strong style={{ fontSize: '0.75rem' }}>{caseData.caseNumber}</strong>
            <span style={{ fontSize: '0.7rem', color: '#3b82f6', display: 'block', marginTop: '0.15rem' }}>Current Case</span>
          </div>
        </aside>

        {/* Center pane — main case detail content */}
        <div style={styles.centerPane} data-testid="center-pane" role="main">

      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => navigate('/cases')} style={styles.backButton}>
          &larr; Back to Cases
        </button>
        <div style={styles.headerMain}>
          <div style={styles.headerLeft}>
            <h2 style={styles.caseNumber}>{caseData.caseNumber}</h2>
            <CaseStatusBadge status={caseData.status} />
            <PriorityIndicator priority={caseData.priority} showLabel />
          </div>
          <div style={styles.headerActions}>
            {!demo && (
              <>
                <button
                  style={{ ...styles.actionButton, backgroundColor: '#16a34a', color: '#fff', border: 'none' }}
                  onClick={handleConfirmAI}
                  disabled={confirmTriage.isPending}
                >
                  {confirmTriage.isPending ? 'Confirming...' : 'Confirm AI'}
                </button>
                <button
                  style={{ ...styles.actionButton, backgroundColor: '#6366f1', color: '#fff', border: 'none' }}
                  onClick={() => setShowCorrectForm(!showCorrectForm)}
                >
                  Correct
                </button>
              </>
            )}
            <button
              style={styles.actionButton}
              onClick={() => setShowStatusModal(!showStatusModal)}
            >
              Transition Status
            </button>
            {!demo && (
              <button
                style={styles.actionButton}
                onClick={() => setShowNoteForm(!showNoteForm)}
              >
                Add Note
              </button>
            )}
            {!demo && (
              <>
                <button
                  style={styles.actionButton}
                  onClick={() => setShowPauseForm(!showPauseForm)}
                  data-testid="btn-pause-sla"
                >
                  Pause SLA
                </button>
                <button
                  style={styles.actionButton}
                  onClick={handleResumeSla}
                  disabled={resumeSla.isPending}
                  data-testid="btn-resume-sla"
                >
                  {resumeSla.isPending ? 'Resuming...' : 'Resume SLA'}
                </button>
                <button
                  style={styles.actionButton}
                  onClick={() => setShowReassignForm(!showReassignForm)}
                  data-testid="btn-reassign"
                >
                  Reassign
                </button>
                <button
                  style={styles.actionButton}
                  onClick={() => setShowPriorityForm(!showPriorityForm)}
                  data-testid="btn-set-priority"
                >
                  Set Priority
                </button>
              </>
            )}
            <button style={styles.actionButton}>Assign Vendor</button>
            <button style={styles.actionButton}>Link Case</button>
            {/* FR-054.A3: Compliance audit unlock — only COMPLIANCE_OFFICER/SYS_ADMIN can export directly */}
            {user?.roles?.some((r: string) => ['COMPLIANCE_OFFICER', 'SYS_ADMIN', 'DPO'].includes(r)) ? (
              <button
                style={{ ...styles.actionButton, backgroundColor: '#f0f9ff', borderColor: '#93c5fd' }}
                onClick={handleExportAuditTrail}
                data-testid="btn-export-audit"
              >
                Export Audit Trail
              </button>
            ) : (
              <button
                style={{ ...styles.actionButton, opacity: 0.6 }}
                onClick={() => window.alert('Audit trail export requires Compliance Officer or DPO role.')}
                data-testid="btn-export-audit-locked"
              >
                Export Audit Trail (Locked)
              </button>
            )}
          </div>
        </div>
        <p style={styles.subject}>{caseData.subject}</p>
        <div style={styles.slaRow}>
          <SlaProgressBar remainingPercent={caseData.slaRemainingPercent} label="SLA Progress" />
        </div>
      </div>

      {/* Status Transition Modal */}
      {showStatusModal && !demo && (
        <div style={styles.inlineForm}>
          <h4 style={styles.inlineFormTitle}>Transition Status</h4>
          <div style={styles.inlineFormFields}>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as CaseStatus)}
              style={styles.formSelect}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              style={styles.formInput}
            />
            <button
              onClick={handleTransitionStatus}
              disabled={transitionStatus.isPending}
              style={{ ...styles.triageButton, backgroundColor: '#3b82f6', color: '#fff' }}
            >
              {transitionStatus.isPending ? 'Saving...' : 'Update Status'}
            </button>
            <button
              onClick={() => setShowStatusModal(false)}
              style={styles.triageButton}
            >
              Cancel
            </button>
          </div>
          {transitionStatus.isError && (
            <p style={styles.errorText}>
              {transitionStatus.error instanceof Error
                ? transitionStatus.error.message
                : 'Failed to update status'}
            </p>
          )}
        </div>
      )}

      {/* Add Note Form */}
      {showNoteForm && !demo && (
        <div style={styles.inlineForm}>
          <h4 style={styles.inlineFormTitle}>Add Note</h4>
          <div style={styles.inlineFormFields}>
            <textarea
              placeholder="Enter note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={styles.formTextarea}
              rows={3}
            />
            <button
              onClick={handleAddNote}
              disabled={addNote.isPending || !noteText.trim()}
              style={{ ...styles.triageButton, backgroundColor: '#3b82f6', color: '#fff' }}
            >
              {addNote.isPending ? 'Saving...' : 'Save Note'}
            </button>
            <button
              onClick={() => setShowNoteForm(false)}
              style={styles.triageButton}
            >
              Cancel
            </button>
          </div>
          {addNote.isError && (
            <p style={styles.errorText}>
              {addNote.error instanceof Error
                ? addNote.error.message
                : 'Failed to add note'}
            </p>
          )}
        </div>
      )}

      {/* Correct Classification Form */}
      {showCorrectForm && !demo && (
        <div style={styles.inlineForm}>
          <h4 style={styles.inlineFormTitle}>Correct Classification</h4>
          <div style={styles.inlineFormFields}>
            <input
              type="text"
              placeholder="Category"
              value={correctCategory}
              onChange={(e) => setCorrectCategory(e.target.value)}
              style={styles.formInput}
            />
            <input
              type="text"
              placeholder="Sub-Category"
              value={correctSubCategory}
              onChange={(e) => setCorrectSubCategory(e.target.value)}
              style={styles.formInput}
            />
            <button
              onClick={handleCorrectClassification}
              disabled={correctTriage.isPending || !correctCategory}
              style={{ ...styles.triageButton, backgroundColor: '#6366f1', color: '#fff' }}
            >
              {correctTriage.isPending ? 'Saving...' : 'Submit Correction'}
            </button>
            <button
              onClick={() => setShowCorrectForm(false)}
              style={styles.triageButton}
            >
              Cancel
            </button>
          </div>
          {correctTriage.isError && (
            <p style={styles.errorText}>
              {correctTriage.error instanceof Error
                ? correctTriage.error.message
                : 'Failed to correct classification'}
            </p>
          )}
        </div>
      )}

      {/* Pause SLA Form */}
      {showPauseForm && !demo && (
        <div style={styles.inlineForm} data-testid="pause-sla-form">
          <h4 style={styles.inlineFormTitle}>Pause SLA</h4>
          <div style={styles.inlineFormFields}>
            <input
              type="text"
              placeholder="Reason for pause..."
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              style={styles.formInput}
            />
            <button
              onClick={handlePauseSla}
              disabled={pauseSla.isPending || !pauseReason.trim()}
              style={{ ...styles.triageButton, backgroundColor: '#ea580c', color: '#fff' }}
            >
              {pauseSla.isPending ? 'Pausing...' : 'Confirm Pause'}
            </button>
            <button
              onClick={() => setShowPauseForm(false)}
              style={styles.triageButton}
            >
              Cancel
            </button>
          </div>
          {pauseSla.isError && (
            <p style={styles.errorText}>
              {pauseSla.error instanceof Error
                ? pauseSla.error.message
                : 'Failed to pause SLA'}
            </p>
          )}
        </div>
      )}

      {/* Reassign Form */}
      {showReassignForm && !demo && (
        <div style={styles.inlineForm} data-testid="reassign-form">
          <h4 style={styles.inlineFormTitle}>Reassign Case</h4>
          <div style={styles.inlineFormFields}>
            <input
              type="text"
              placeholder="FPR ID or name..."
              value={reassignFprId}
              onChange={(e) => setReassignFprId(e.target.value)}
              style={styles.formInput}
            />
            <button
              onClick={handleReassign}
              disabled={updateCase.isPending || !reassignFprId.trim()}
              style={{ ...styles.triageButton, backgroundColor: '#3b82f6', color: '#fff' }}
            >
              {updateCase.isPending ? 'Reassigning...' : 'Confirm Reassign'}
            </button>
            <button
              onClick={() => setShowReassignForm(false)}
              style={styles.triageButton}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Set Priority Form */}
      {showPriorityForm && !demo && (
        <div style={styles.inlineForm} data-testid="set-priority-form">
          <h4 style={styles.inlineFormTitle}>Set Priority</h4>
          <div style={styles.inlineFormFields}>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              style={styles.formSelect}
            >
              <option value="P1">P1 - CRITICAL</option>
              <option value="P2">P2 - HIGH</option>
              <option value="P3">P3 - NORMAL</option>
              <option value="P4">P4 - LOW</option>
            </select>
            <button
              onClick={handleSetPriority}
              disabled={updateCase.isPending}
              style={{ ...styles.triageButton, backgroundColor: '#3b82f6', color: '#fff' }}
            >
              {updateCase.isPending ? 'Saving...' : 'Update Priority'}
            </button>
            <button
              onClick={() => setShowPriorityForm(false)}
              style={styles.triageButton}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={activeTab === tab.id ? { ...styles.tab, ...styles.activeTab } : styles.tab}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={styles.tabContent}>
        {activeTab === 'overview' && <OverviewTab caseData={caseData} />}
        {activeTab === 'activity' && <ActivityTab />}
        {activeTab === 'linked' && <LinkedCasesTab />}
        {activeTab === 'attachments' && <AttachmentsTab onPreview={setPreviewAttachment} />}
        {activeTab === 'reply-drafts' && <ReplyDraftsTab caseId={caseId || '1'} />}
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        open={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Attachment Preview Modal (FR-051.A3) */}
      {previewAttachment && (
        <div
          style={styles.modalOverlay}
          data-testid="attachment-preview-modal"
          onClick={() => setPreviewAttachment(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewAttachment.name}`}
        >
          <div
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{previewAttachment.name}</span>
              <button
                onClick={() => setPreviewAttachment(null)}
                style={styles.modalCloseButton}
                data-testid="attachment-preview-close"
                aria-label="Close preview"
              >
                X
              </button>
            </div>
            <div style={styles.modalBody}>
              {previewAttachment.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewAttachment.downloadUrl || '#'}
                  title={`Preview ${previewAttachment.name}`}
                  style={{ width: '100%', height: '500px', border: 'none' }}
                  data-testid="attachment-preview-pdf"
                />
              ) : previewAttachment.mimeType.startsWith('image/') ? (
                <img
                  src={previewAttachment.downloadUrl || '#'}
                  alt={previewAttachment.name}
                  style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }}
                  data-testid="attachment-preview-image"
                />
              ) : (
                <div data-testid="attachment-preview-download" style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: '#64748b', marginBottom: '1rem' }}>Preview not available for this file type.</p>
                  {previewAttachment.downloadUrl && (
                    <a
                      href={previewAttachment.downloadUrl}
                      download={previewAttachment.name}
                      style={{ color: 'var(--color-accent, #3b82f6)', fontWeight: 500 }}
                    >
                      Download {previewAttachment.name}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

        </div>{/* end center pane */}

        {/* Right pane — activity timeline & linked cases */}
        <aside style={styles.rightPane} data-testid="right-pane" aria-label="Activity timeline">
          <h4 style={styles.paneTitle}>Activity Timeline</h4>
          {MOCK_ACTIVITY.slice(0, 5).map((event) => (
            <div key={event.id} style={styles.rightPaneEvent}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                <strong style={{ fontSize: '0.7rem' }}>{event.action}</strong>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{event.timestamp}</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', lineHeight: 1.3 }}>{event.details}</p>
            </div>
          ))}
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0.5rem 0' }} />
          <h4 style={styles.paneTitle}>Linked Cases</h4>
          {MOCK_LINKED_CASES.map((linked) => (
            <div
              key={linked.id}
              style={styles.rightPaneEvent}
              onClick={() => navigate(`/cases/${linked.id}`)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/cases/${linked.id}`); }}
            >
              <strong style={{ fontSize: '0.75rem', color: 'var(--color-accent, #3b82f6)', cursor: 'pointer' }}>{linked.caseNumber}</strong>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>{linked.relationship}</span>
            </div>
          ))}
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0.5rem 0' }} />
          <SuggestedActionsPanel caseId={caseId || '1'} />
        </aside>
      </div>{/* end three-pane container */}
    </div>
  );
};

/** FR-052.A2-A3: Suggested Actions panel shown in the right pane with recipient/TAT and accept/edit/reject. */
function SuggestedActionsPanel({ caseId }: { caseId: string }) {
  const [actions, setActions] = useState<SuggestedAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [appliedActions, setAppliedActions] = useState<Set<string>>(new Set());
  const [rejectedActions, setRejectedActions] = useState<Set<string>>(new Set());
  const [editingAction, setEditingAction] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Attempt to fetch from API, fallback to mock data
    apiGet<SuggestedAction[]>(`/v1/cases/${caseId}/suggested-actions`)
      .then((data) => {
        if (!cancelled) {
          setActions(Array.isArray(data) ? data.slice(0, 3) : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActions(MOCK_SUGGESTED_ACTIONS.slice(0, 3));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [caseId]);

  const handleAccept = (actionId: string) => {
    setAppliedActions((prev) => new Set(prev).add(actionId));
    setRejectedActions((prev) => { const s = new Set(prev); s.delete(actionId); return s; });
    setEditingAction(null);
  };

  const handleReject = (actionId: string) => {
    let reason: string | null = '';
    try { reason = window.prompt('Please provide a reason for rejection:'); } catch { /* jsdom */ }
    if (reason === null) return; // user cancelled
    setRejectedActions((prev) => new Set(prev).add(actionId));
    setAppliedActions((prev) => { const s = new Set(prev); s.delete(actionId); return s; });
    setEditingAction(null);
    // FR-052.A3: Post rejection reason to API
    if (reason && reason.trim()) {
      apiPost(`/v1/classification/actions/${actionId}/feedback`, { status: 'rejected', reason }).catch(() => {});
    }
  };

  const handleEdit = (actionId: string) => {
    setEditingAction(editingAction === actionId ? null : actionId);
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.9) return '#16a34a';
    if (confidence >= 0.7) return '#ea580c';
    return '#dc2626';
  };

  const getActionStatus = (actionId: string): 'accepted' | 'rejected' | 'pending' => {
    if (appliedActions.has(actionId)) return 'accepted';
    if (rejectedActions.has(actionId)) return 'rejected';
    return 'pending';
  };

  if (loading) {
    return (
      <div data-testid="suggested-actions-panel">
        <h4 style={styles.paneTitle}>Suggested Actions</h4>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div data-testid="suggested-actions-panel">
      <h4 style={styles.paneTitle}>Suggested Actions</h4>
      {actions.length === 0 && (
        <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No actions suggested.</p>
      )}
      {actions.map((action) => {
        const status = getActionStatus(action.id);
        return (
          <div
            key={action.id}
            data-testid={`suggested-action-${action.id}`}
            style={{
              padding: '0.5rem',
              marginBottom: '0.5rem',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              backgroundColor: status === 'accepted' ? '#f0fdf4' : status === 'rejected' ? '#fef2f2' : 'var(--color-surface)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <strong style={{ fontSize: '0.75rem' }}>{action.action}</strong>
              <span
                data-testid={`confidence-badge-${action.id}`}
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '0.1rem 0.4rem',
                  borderRadius: '9999px',
                  color: '#fff',
                  backgroundColor: getConfidenceColor(action.confidence),
                }}
              >
                {(action.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.7rem', color: '#64748b', lineHeight: 1.3 }}>
              {action.description}
            </p>

            {/* FR-052.A2: Display recipient role and estimated TAT impact */}
            {action.recipientRole && (
              <div data-testid={`recipient-role-${action.id}`} style={{ fontSize: '0.65rem', color: '#475569', marginBottom: '0.2rem' }}>
                <strong>Recipient:</strong> {action.recipientRole}
              </div>
            )}
            {action.estimatedTatImpactHours !== undefined && (
              <div data-testid={`tat-impact-${action.id}`} style={{ fontSize: '0.65rem', color: '#475569', marginBottom: '0.35rem' }}>
                <strong>Est. TAT Impact:</strong> {action.estimatedTatImpactHours}h
              </div>
            )}

            {/* FR-052.A3: Accept/Edit/Reject buttons */}
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <button
                data-testid={`accept-action-${action.id}`}
                onClick={() => handleAccept(action.id)}
                disabled={status === 'accepted'}
                style={{
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: status === 'accepted' ? 'default' : 'pointer',
                  backgroundColor: status === 'accepted' ? '#dcfce7' : '#16a34a',
                  color: status === 'accepted' ? '#16a34a' : '#fff',
                }}
              >
                {status === 'accepted' ? 'Accepted' : 'Accept'}
              </button>
              <button
                data-testid={`edit-action-${action.id}`}
                onClick={() => handleEdit(action.id)}
                disabled={status !== 'pending'}
                style={{
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  cursor: status === 'pending' ? 'pointer' : 'default',
                  backgroundColor: editingAction === action.id ? '#dbeafe' : 'var(--color-bg)',
                  color: editingAction === action.id ? '#2563eb' : 'inherit',
                }}
              >
                Edit
              </button>
              <button
                data-testid={`reject-action-${action.id}`}
                onClick={() => handleReject(action.id)}
                disabled={status === 'rejected'}
                style={{
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  border: status === 'rejected' ? 'none' : '1px solid #dc2626',
                  borderRadius: '4px',
                  cursor: status === 'rejected' ? 'default' : 'pointer',
                  backgroundColor: status === 'rejected' ? '#fecaca' : '#fff',
                  color: '#dc2626',
                }}
              >
                {status === 'rejected' ? 'Rejected' : 'Reject'}
              </button>
            </div>

            {/* FR-052.A3: Edit mode panel */}
            {editingAction === action.id && (
              <div data-testid={`edit-panel-${action.id}`} style={{ marginTop: '0.4rem', padding: '0.4rem', border: '1px dashed #93c5fd', borderRadius: '4px', backgroundColor: '#eff6ff' }}>
                <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.65rem', color: '#1d4ed8' }}>Editing action parameters...</p>
                <button
                  data-testid={`save-edit-${action.id}`}
                  onClick={() => handleAccept(action.id)}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem', fontWeight: 600, border: 'none', borderRadius: '4px', backgroundColor: '#2563eb', color: '#fff', cursor: 'pointer' }}
                >
                  Save &amp; Accept
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** FR-053.A2: Reply Drafts tab showing AI-generated reply drafts. */
function ReplyDraftsTab({ caseId }: { caseId: string }) {
  const [drafts, setDrafts] = useState<ReplyDraftItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<ReplyDraftItem[]>(`/v1/cases/${caseId}/reply-drafts`)
      .then((data) => {
        if (!cancelled) {
          setDrafts(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDrafts(MOCK_REPLY_DRAFTS.filter((d) => d.caseId === caseId || caseId === '1'));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [caseId]);

  const handleApprove = (draftId: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId
          ? { ...d, status: 'APPROVED' as const, approvedBy: 'Current User', approvedAt: new Date().toISOString() }
          : d,
      ),
    );
  };

  const handleReject = (draftId: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId ? { ...d, status: 'REJECTED' as const } : d,
      ),
    );
  };

  const getStatusBadgeStyle = (status: ReplyDraftItem['status']): CSSProperties => {
    const colorMap: Record<string, { bg: string; color: string }> = {
      PROPOSED: { bg: '#fef3c7', color: '#d97706' },
      APPROVED: { bg: '#dcfce7', color: '#16a34a' },
      REJECTED: { bg: '#fecaca', color: '#dc2626' },
      SENT: { bg: '#dbeafe', color: '#2563eb' },
    };
    const colors = colorMap[status] || colorMap.PROPOSED;
    return {
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.7rem',
      fontWeight: 600,
      backgroundColor: colors.bg,
      color: colors.color,
      textTransform: 'uppercase',
    };
  };

  if (loading) {
    return (
      <div data-testid="reply-drafts-tab">
        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Loading drafts...</p>
      </div>
    );
  }

  return (
    <div data-testid="reply-drafts-tab">
      {drafts.length === 0 && (
        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>No reply drafts available.</p>
      )}
      {drafts.map((draft) => (
        <div
          key={draft.id}
          data-testid={`reply-draft-${draft.id}`}
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>{draft.subject}</strong>
            <span data-testid={`draft-status-${draft.id}`} style={getStatusBadgeStyle(draft.status)}>
              {draft.status}
            </span>
          </div>
          <pre style={{
            fontSize: '0.8rem',
            color: '#475569',
            whiteSpace: 'pre-wrap',
            margin: '0 0 0.75rem 0',
            padding: '0.75rem',
            backgroundColor: '#f8fafc',
            borderRadius: '4px',
            border: '1px solid var(--color-border)',
            lineHeight: 1.5,
          }}>
            {draft.body}
          </pre>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {draft.status === 'PROPOSED' && (
              <>
                <button
                  data-testid={`approve-draft-${draft.id}`}
                  onClick={() => handleApprove(draft.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: '#16a34a',
                    color: '#fff',
                  }}
                >
                  Approve
                </button>
                <button
                  data-testid={`reject-draft-${draft.id}`}
                  onClick={() => handleReject(draft.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: '1px solid #dc2626',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: '#fff',
                    color: '#dc2626',
                  }}
                >
                  Reject
                </button>
                <button
                  data-testid={`edit-draft-${draft.id}`}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: 'var(--color-bg)',
                  }}
                >
                  Edit
                </button>
              </>
            )}
            {draft.approvedBy && (
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Approved by {draft.approvedBy}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function OverviewTab({ caseData }: { caseData: CaseData }) {
  const [expandedEntityIdx, setExpandedEntityIdx] = useState<number | null>(null);
  const [routingExpanded, setRoutingExpanded] = useState(false);
  const [hoveredEntityIdx, setHoveredEntityIdx] = useState<number | null>(null);

  // Parse routing rationale into bullet points (split on newlines or semicolons)
  const routingBullets = useMemo(() => {
    if (!caseData.routing_rationale) return [];
    return caseData.routing_rationale
      .split(/[;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [caseData.routing_rationale]);

  return (
    <div style={styles.overviewGrid}>
      {/* Classification Details */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>Classification</h3>
        <div style={styles.detailGrid}>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Category</span>
            <span style={styles.detailValue}>{caseData.classification.category}</span>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Sub-Category</span>
            <span style={styles.detailValue}>{caseData.classification.subCategory}</span>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Confidence</span>
            <span style={styles.detailValue}>{(caseData.classification.confidence * 100).toFixed(0)}%</span>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Confidence Band</span>
            <ConfidenceBadge band={caseData.classification.confidenceBand as ConfidenceBand} />
          </div>
        </div>
      </div>

      {/* Security Verdicts (FR-001.A4) */}
      {caseData.securityVerdicts && (
        <div style={styles.panel} data-testid="security-verdicts">
          <h3 style={styles.panelTitle}>Security Verdicts</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {(['spf', 'dkim', 'dmarc'] as const).map((protocol) => {
              const verdict = caseData.securityVerdicts![protocol];
              const isPass = verdict === 'PASS';
              return (
                <span
                  key={protocol}
                  data-testid={`verdict-${protocol}`}
                  style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: isPass ? '#dcfce7' : '#fecaca',
                    color: isPass ? '#22c55e' : '#ef4444',
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em',
                  }}
                >
                  {protocol.toUpperCase()}: {verdict}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* NER Entities with conflict surfacing (FR-011.A4) */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>Extracted Entities (NER)</h3>
        <table style={styles.entityTable}>
          <thead>
            <tr>
              <th style={styles.entityTh}>Entity Type</th>
              <th style={styles.entityTh}>Value</th>
              <th style={styles.entityTh}>Source</th>
            </tr>
          </thead>
          <tbody>
            {caseData.entities.map((entity, idx) => (
              <tr key={idx}>
                <td style={styles.entityTd}>{entity.type}</td>
                <td style={styles.entityTd}>
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', position: 'relative' }}
                    onMouseEnter={() => setHoveredEntityIdx(idx)}
                    onMouseLeave={() => setHoveredEntityIdx(null)}
                    data-testid={`entity-badge-${idx}`}
                  >
                    {entity.value}
                    {/* Confidence tooltip (FR-133.A2) */}
                    {hoveredEntityIdx === idx && entity.confidence !== undefined && (
                      <span
                        data-testid={`entity-confidence-tooltip-${idx}`}
                        style={{
                          position: 'absolute',
                          bottom: '100%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap',
                          zIndex: 10,
                          marginBottom: '0.25rem',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        }}
                        role="tooltip"
                      >
                        <div>Type: {entity.type}</div>
                        <div>Value: {entity.value}</div>
                        <div>Confidence: {(entity.confidence * 100).toFixed(0)}%</div>
                        <div>Validation: {entity.outcome || 'N/A'}</div>
                      </span>
                    )}
                    {entity.outcome === 'FUZZY_MATCH' && (
                      <span
                        data-testid={`entity-conflict-${idx}`}
                        style={{ cursor: 'pointer', color: '#f59e0b', fontSize: '1rem' }}
                        title="Fuzzy match — click to see candidates"
                        onClick={() => setExpandedEntityIdx(expandedEntityIdx === idx ? null : idx)}
                      >
                        {'\u26A0'}
                      </span>
                    )}
                  </span>
                  {entity.outcome === 'FUZZY_MATCH' && expandedEntityIdx === idx && entity.candidates && (
                    <div
                      data-testid={`entity-candidates-${idx}`}
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                      }}
                    >
                      <strong style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#92400e' }}>
                        Candidate Values:
                      </strong>
                      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                        {entity.candidates.map((c, ci) => (
                          <li key={ci} style={{ color: '#78350f', fontSize: '0.8rem' }}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </td>
                <td style={styles.entityTd}>
                  {entity.sourceText ? (
                    <SourceSpanHighlight sourceLabel={`Source: ${entity.type}`}>
                      {entity.sourceText}
                    </SourceSpanHighlight>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>--</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Routing Rationale (FR-133.A3) */}
      {caseData.routing_rationale && (
        <div style={{ ...styles.panel, gridColumn: '1 / -1' }} data-testid="routing-rationale">
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setRoutingExpanded(!routingExpanded)}
            data-testid="routing-rationale-toggle"
          >
            <h3 style={{ ...styles.panelTitle, margin: 0 }}>Routing Rationale</h3>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
              {routingExpanded ? '[-]' : '[+]'}
            </span>
          </div>
          {routingExpanded && (
            <div style={{ marginTop: '0.75rem' }} data-testid="routing-rationale-content">
              {routingBullets.length > 1 ? (
                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  {routingBullets.map((bullet, i) => (
                    <li key={i} style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.35rem', lineHeight: 1.5 }}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                  {caseData.routing_rationale}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Customer Info */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>Customer Information</h3>
        <div style={styles.detailGrid}>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Name</span>
            <span style={styles.detailValue}>{caseData.customer.name}</span>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Account #</span>
            <span style={styles.detailValue}>{caseData.customer.accountNumber}</span>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Segment</span>
            <span style={styles.detailValue}>{caseData.customer.segment}</span>
          </div>
        </div>
      </div>

      {/* Property Info */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>Property Information</h3>
        <div style={styles.detailGrid}>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Address</span>
            <span style={styles.detailValue}>{caseData.property.address}</span>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Type</span>
            <span style={styles.detailValue}>{caseData.property.type}</span>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>State</span>
            <span style={styles.detailValue}>{caseData.property.state}</span>
          </div>
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Valuation</span>
            <span style={styles.detailValue}>{caseData.property.valuationAmount}</span>
          </div>
        </div>
      </div>

      {/* Notes (live mode) */}
      {caseData.notes && caseData.notes.length > 0 && (
        <div style={{ ...styles.panel, gridColumn: '1 / -1' }}>
          <h3 style={styles.panelTitle}>Notes</h3>
          {caseData.notes.map((note) => (
            <div key={note.id} style={styles.noteItem}>
              <div style={styles.noteMeta}>
                <strong style={{ fontSize: '0.8rem' }}>{note.createdBy}</strong>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{note.createdAt}</span>
              </div>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#475569' }}>{parseMentions(note.text)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Field Visit Evidence Section — only for SITE_VISIT cases */}
      {(caseData.type === 'SITE_VISIT' || caseData.type === 'Inspection') && (
        <FieldVisitEvidenceSection />
      )}
    </div>
  );
}

function ActivityTab() {
  return (
    <div style={styles.timeline}>
      {MOCK_ACTIVITY.map((event) => (
        <div key={event.id} style={styles.timelineItem}>
          <div style={styles.timelineDot} />
          <div style={styles.timelineContent}>
            <div style={styles.timelineHeader}>
              <strong style={styles.timelineAction}>{event.action}</strong>
              <span style={styles.timelineTime}>{event.timestamp}</span>
            </div>
            <p style={styles.timelineDetails}>{event.details}</p>
            <span style={styles.timelineUser}>by {event.user}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkedCasesTab() {
  return (
    <div>
      {MOCK_LINKED_CASES.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>No linked cases.</p>
      ) : (
        <table style={styles.entityTable}>
          <thead>
            <tr>
              <th style={styles.entityTh}>Case #</th>
              <th style={styles.entityTh}>Subject</th>
              <th style={styles.entityTh}>Relationship</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_LINKED_CASES.map((linked) => (
              <tr key={linked.id}>
                <td style={styles.entityTd}><strong>{linked.caseNumber}</strong></td>
                <td style={styles.entityTd}>{linked.subject}</td>
                <td style={styles.entityTd}>{linked.relationship}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AttachmentsTab({ onPreview }: { onPreview?: (att: Attachment) => void }) {
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null);

  return (
    <div>
      {MOCK_ATTACHMENTS.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>No attachments.</p>
      ) : (
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {/* Attachment List */}
          <div style={{ flex: '1 1 60%' }}>
            <table style={styles.entityTable}>
              <thead>
                <tr>
                  <th style={styles.entityTh}>File Name</th>
                  <th style={styles.entityTh}>Type</th>
                  <th style={styles.entityTh}>Size</th>
                  <th style={styles.entityTh}>AV Status</th>
                  <th style={styles.entityTh}>Doc Type</th>
                  <th style={styles.entityTh}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_ATTACHMENTS.map((att) => (
                  <tr
                    key={att.id}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedAttachment?.id === att.id ? '#f0f9ff' : 'transparent',
                    }}
                    onClick={() => setSelectedAttachment(att)}
                  >
                    <td style={styles.entityTd}>
                      <span style={{ fontWeight: 500 }}>{att.name}</span>
                      <br />
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{att.mimeType}</span>
                    </td>
                    <td style={styles.entityTd}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {getMimeIcon(att.mimeType)}
                      </span>
                    </td>
                    <td style={styles.entityTd}>{att.size}</td>
                    <td style={styles.entityTd}>
                      <AvStatusBadge status={att.avStatus} />
                    </td>
                    <td style={styles.entityTd}>
                      {att.documentType ? (
                        <DocTypeBadge type={att.documentType} confidence={att.docTypeConfidence} />
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>--</span>
                      )}
                    </td>
                    <td style={styles.entityTd}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {att.avStatus !== 'INFECTED' && att.downloadUrl ? (
                          <a
                            href={att.downloadUrl}
                            style={{ color: 'var(--color-accent)', fontSize: '0.8rem', textDecoration: 'none' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Download
                          </a>
                        ) : att.avStatus === 'INFECTED' ? (
                          <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600 }}>
                            QUARANTINED
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>--</span>
                        )}
                        {att.avStatus !== 'INFECTED' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onPreview?.(att); }}
                            style={{ border: '1px solid var(--color-border)', borderRadius: '4px', padding: '0.15rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', backgroundColor: 'var(--color-bg)' }}
                            data-testid={`preview-btn-${att.id}`}
                            aria-label={`Preview ${att.name}`}
                          >
                            Preview
                          </button>
                        )}
                        {att.dms_external_id && (
                          <a
                            href={`${import.meta.env.VITE_DMS_BASE_URL || '#'}/documents/${att.dms_external_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 500 }}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`dms-link-${att.id}`}
                          >
                            View in DMS
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* OCR Text Preview Panel */}
          {selectedAttachment && (
            <div style={{ flex: '1 1 40%' }}>
              <div style={styles.panel}>
                <h3 style={styles.panelTitle}>
                  OCR Text Preview: {selectedAttachment.name}
                </h3>
                {selectedAttachment.ocrText ? (
                  <pre style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '0.8rem',
                    lineHeight: 1.5,
                    backgroundColor: '#f8fafc',
                    padding: '1rem',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    margin: 0,
                  }}>
                    {selectedAttachment.ocrText}
                  </pre>
                ) : (
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                    No OCR text available for this attachment.
                  </p>
                )}
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>
                      Uploaded
                    </span>
                    <br />
                    <span style={{ fontSize: '0.8rem' }}>{selectedAttachment.uploadedAt}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>
                      By
                    </span>
                    <br />
                    <span style={{ fontSize: '0.8rem' }}>{selectedAttachment.uploadedBy}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>
                      Size
                    </span>
                    <br />
                    <span style={{ fontSize: '0.8rem' }}>{selectedAttachment.size}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** AV scan status badge component */
function AvStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    CLEAN: { bg: '#dcfce7', fg: '#16a34a' },
    PENDING: { bg: '#fef9c3', fg: '#ca8a04' },
    INFECTED: { bg: '#fecaca', fg: '#dc2626' },
    ERROR: { bg: '#fed7aa', fg: '#ea580c' },
  };
  const colors = colorMap[status] || colorMap['PENDING'];
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.7rem',
      fontWeight: 600,
      backgroundColor: colors.bg,
      color: colors.fg,
    }}>
      {status}
    </span>
  );
}

/** Document type badge component */
function DocTypeBadge({ type, confidence }: { type: string; confidence?: number }) {
  const label = type.replace(/_/g, ' ');
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '4px',
      fontSize: '0.7rem',
      fontWeight: 600,
      backgroundColor: '#e0e7ff',
      color: '#4338ca',
    }}>
      {label}
      {confidence !== undefined && (
        <span style={{ marginLeft: '0.25rem', opacity: 0.7 }}>
          ({(confidence * 100).toFixed(0)}%)
        </span>
      )}
    </span>
  );
}

/** Get a text-based icon for a MIME type */
function getMimeIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '[IMG]';
  if (mimeType === 'application/pdf') return '[PDF]';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '[XLS]';
  if (mimeType.includes('document') || mimeType.includes('word')) return '[DOC]';
  if (mimeType === 'message/rfc822') return '[EML]';
  if (mimeType.startsWith('text/')) return '[TXT]';
  return '[FILE]';
}

/**
 * Field Visit Evidence section displayed for SITE_VISIT type cases.
 * Shows document checklist, photo evidence placeholder, and inspector notes.
 */
function FieldVisitEvidenceSection() {
  const requiredDocuments = [
    { name: 'Property Exterior Photos (4 angles)', submitted: true },
    { name: 'Interior Photographs', submitted: true },
    { name: 'GPS Coordinates Verification', submitted: true },
    { name: 'Land Registry Document', submitted: false },
    { name: 'Neighbourhood Assessment Report', submitted: true },
    { name: 'Structural Integrity Report', submitted: false },
    { name: 'Boundary Demarcation Evidence', submitted: true },
    { name: 'Access Road Documentation', submitted: false },
  ];

  const submittedCount = requiredDocuments.filter((d) => d.submitted).length;
  const completeness = Math.round((submittedCount / requiredDocuments.length) * 100);

  const inspectorNotes = [
    { date: '2026-04-27', inspector: 'Rajesh Verma', note: 'Property accessed via main road. No encroachment observed on visual inspection.' },
    { date: '2026-04-27', inspector: 'Rajesh Verma', note: 'Neighbouring construction within 5m — may require boundary survey update.' },
    { date: '2026-04-26', inspector: 'Amit Khanna', note: 'Initial site visit scheduled. Tenant cooperation confirmed for property access.' },
  ];

  return (
    <div style={{ ...fieldVisitStyles.container, gridColumn: '1 / -1' }}>
      <h3 style={fieldVisitStyles.sectionTitle}>Field Visit Evidence</h3>

      <div style={fieldVisitStyles.twoColumn}>
        {/* Document Checklist */}
        <div style={fieldVisitStyles.panel}>
          <h4 style={fieldVisitStyles.panelTitle}>
            Document Checklist ({submittedCount}/{requiredDocuments.length} — {completeness}%)
          </h4>
          <div style={fieldVisitStyles.progressBar}>
            <div
              style={{
                ...fieldVisitStyles.progressFill,
                width: `${completeness}%`,
                backgroundColor: completeness === 100 ? '#16a34a' : completeness >= 60 ? '#ca8a04' : '#dc2626',
              }}
            />
          </div>
          <div style={fieldVisitStyles.checklistContainer}>
            {requiredDocuments.map((doc) => (
              <div key={doc.name} style={fieldVisitStyles.checklistItem}>
                <span style={{
                  ...fieldVisitStyles.checkIcon,
                  color: doc.submitted ? '#16a34a' : '#dc2626',
                }}>
                  {doc.submitted ? '[Y]' : '[N]'}
                </span>
                <span style={{
                  ...fieldVisitStyles.checkLabel,
                  textDecoration: doc.submitted ? 'none' : 'none',
                  color: doc.submitted ? 'inherit' : '#dc2626',
                }}>
                  {doc.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Photo Evidence and Inspector Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Photo Evidence Placeholder */}
          <div style={fieldVisitStyles.panel}>
            <h4 style={fieldVisitStyles.panelTitle}>Photo Evidence</h4>
            <div style={fieldVisitStyles.photoGrid}>
              {['North View', 'South View', 'East View', 'West View'].map((label) => (
                <div key={label} style={fieldVisitStyles.photoPlaceholder}>
                  <span style={fieldVisitStyles.photoIcon}>[IMG]</span>
                  <span style={fieldVisitStyles.photoLabel}>{label}</span>
                </div>
              ))}
            </div>
            <p style={fieldVisitStyles.photoNote}>
              Photos will appear here once the field inspector uploads them via the mobile app.
            </p>
          </div>

          {/* Inspector Notes */}
          <div style={fieldVisitStyles.panel}>
            <h4 style={fieldVisitStyles.panelTitle}>Inspector Notes</h4>
            <div style={fieldVisitStyles.notesList}>
              {inspectorNotes.map((note, idx) => (
                <div key={idx} style={fieldVisitStyles.noteItem}>
                  <div style={fieldVisitStyles.noteMeta}>
                    <strong style={{ fontSize: '0.8rem' }}>{note.inspector}</strong>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{note.date}</span>
                  </div>
                  <p style={fieldVisitStyles.noteText}>{parseMentions(note.note)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const fieldVisitStyles: Record<string, CSSProperties> = {
  container: {
    marginTop: '1.25rem',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1.25rem',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 700,
    margin: '0 0 1rem 0',
    paddingBottom: '0.75rem',
    borderBottom: '2px solid var(--color-border)',
  },
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.25rem',
  },
  panel: {
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    padding: '1rem',
  },
  panelTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    margin: '0 0 0.75rem 0',
  },
  progressBar: {
    height: '8px',
    backgroundColor: '#f1f5f9',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '0.75rem',
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  checklistContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  checklistItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
  },
  checkIcon: {
    fontWeight: 700,
    fontSize: '0.8rem',
    flexShrink: 0,
  },
  checkLabel: {
    fontSize: '0.85rem',
  },
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  photoPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem 0.5rem',
    border: '1px dashed var(--color-border)',
    borderRadius: '6px',
    backgroundColor: '#f8fafc',
  },
  photoIcon: {
    fontSize: '1.5rem',
    color: '#94a3b8',
    marginBottom: '0.25rem',
  },
  photoLabel: {
    fontSize: '0.7rem',
    color: '#94a3b8',
    fontWeight: 600,
  },
  photoNote: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    margin: 0,
    fontStyle: 'italic',
  },
  notesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  noteItem: {
    padding: '0.5rem 0',
    borderBottom: '1px solid var(--color-border)',
  },
  noteMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.25rem',
  },
  noteText: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#475569',
    lineHeight: 1.4,
  },
};

const styles: Record<string, CSSProperties> = {
  header: {
    marginBottom: '1.5rem',
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent)',
    cursor: 'pointer',
    fontSize: '0.875rem',
    padding: '0.25rem 0',
    marginBottom: '0.75rem',
  },
  headerMain: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  caseNumber: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  headerActions: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  actionButton: {
    padding: '0.5rem 1rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    backgroundColor: 'var(--color-bg)',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 500,
  },
  subject: {
    margin: '0.5rem 0',
    fontSize: '0.95rem',
    color: '#64748b',
  },
  slaRow: {
    maxWidth: '400px',
    marginTop: '0.75rem',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '2px solid var(--color-border)',
    marginBottom: '1.5rem',
    gap: '0',
  },
  tab: {
    padding: '0.75rem 1.25rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#64748b',
  },
  activeTab: {
    borderBottomColor: 'var(--color-accent)',
    color: 'var(--color-accent)',
    fontWeight: 600,
  },
  tabContent: {
    minHeight: '300px',
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.25rem',
  },
  panel: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1.25rem',
  },
  panelTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    margin: '0 0 1rem 0',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  detailLabel: {
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontWeight: 600,
  },
  detailValue: {
    fontSize: '0.875rem',
  },
  entityTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  entityTh: {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--color-border)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    color: '#64748b',
    fontWeight: 600,
  },
  entityTd: {
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--color-border)',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    paddingLeft: '1.5rem',
    borderLeft: '2px solid var(--color-border)',
  },
  timelineItem: {
    display: 'flex',
    gap: '0.75rem',
    position: 'relative',
  },
  timelineDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-accent)',
    position: 'absolute',
    left: '-1.85rem',
    top: '0.3rem',
  },
  timelineContent: {
    flex: 1,
  },
  timelineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  timelineAction: {
    fontSize: '0.875rem',
  },
  timelineTime: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  timelineDetails: {
    margin: '0 0 0.25rem 0',
    fontSize: '0.85rem',
    color: '#64748b',
  },
  timelineUser: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontStyle: 'italic',
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
  inlineForm: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
  },
  inlineFormTitle: {
    margin: '0 0 0.75rem 0',
    fontSize: '0.95rem',
    fontWeight: 600,
  },
  inlineFormFields: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  formSelect: {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '0.85rem',
    backgroundColor: 'var(--color-bg)',
  },
  formInput: {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '0.85rem',
    minWidth: '200px',
  },
  formTextarea: {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '0.85rem',
    width: '100%',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  triageButton: {
    padding: '0.5rem 1rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    backgroundColor: 'var(--color-bg)',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '0.8rem',
    marginTop: '0.5rem',
  },
  noteItem: {
    padding: '0.75rem 0',
    borderBottom: '1px solid var(--color-border)',
  },
  noteMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  threePaneContainer: {
    display: 'flex',
    gap: '0',
    minHeight: '600px',
  },
  leftPane: {
    flex: '0 0 25%',
    maxWidth: '25%',
    borderRight: '1px solid var(--color-border)',
    padding: '0.75rem',
    overflowY: 'auto',
  },
  centerPane: {
    flex: '0 0 50%',
    maxWidth: '50%',
    padding: '0 1rem',
    overflowY: 'auto',
  },
  rightPane: {
    flex: '0 0 25%',
    maxWidth: '25%',
    borderLeft: '1px solid var(--color-border)',
    padding: '0.75rem',
    overflowY: 'auto',
  },
  paneTitle: {
    fontSize: '0.8rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    color: '#475569',
    textTransform: 'uppercase',
  },
  sidebarItem: {
    padding: '0.5rem',
    borderRadius: '4px',
    cursor: 'pointer',
    marginBottom: '0.35rem',
    transition: 'background-color 0.15s',
  },
  rightPaneEvent: {
    padding: '0.5rem 0',
    borderBottom: '1px solid var(--color-border)',
  },
  modalOverlay: {
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
  modalContent: {
    backgroundColor: 'var(--color-surface, #fff)',
    borderRadius: '8px',
    width: '80%',
    maxWidth: '800px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    borderBottom: '1px solid var(--color-border)',
  },
  modalCloseButton: {
    background: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  modalBody: {
    padding: '1rem',
    overflowY: 'auto',
    flex: 1,
  },
  confidenceTooltip: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
    zIndex: 10,
    marginBottom: '0.25rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
};

export default CaseDetailPage;
