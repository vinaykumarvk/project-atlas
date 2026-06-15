import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CaseStatusBadge, type CaseStatus } from '../components/CaseStatusBadge';
import { PriorityIndicator, type Priority } from '../components/PriorityIndicator';
import { SlaProgressBar } from '../components/SlaProgressBar';
import { AccountabilityBanner } from '../components/AccountabilityBanner';
import { ConfidenceBadge, type ConfidenceBand } from '../components/ConfidenceBadge';
import { SourceSpanHighlight } from '../components/SourceSpanHighlight';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { DraftDiff } from '../components/DraftDiff';
import { isDemoMode } from '../config/flags';
import { parseMentions } from '../utils/parseMentions';
import { useCase, useTransitionStatus, useAddNote, usePauseSla, useResumeSla, useUpdateCase, type CaseDetail as CaseDetailType } from '../hooks/useCases';
import { useConfirmTriage, useCorrectTriage } from '../hooks/useTriageQueue';
import { useHotkeys } from '../hooks/useHotkeys';
import { useAuth } from '../auth';
import { apiGet, apiPost } from '../api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ArrowLeft,
  User,
  FileText,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Send,
  Eye,
  Download,
  Link2,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Plus,
  Pause,
  Play,
  UserCog,
  Flag,
  Lock,
  FileDown,
  Image,
  XCircle,
  PenLine,
  Save,
  MapPin,
  Camera,
  ClipboardList,
} from 'lucide-react';

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
    subject: 'Re: Valuation Request - 42 MG Road, Andheri West, Mumbai 400053',
    body: 'Dear Customer,\n\nThank you for your valuation request. We have received your request and will process it promptly.\n\nBest regards,\nProperty Services Team',
    status: 'PROPOSED',
    generatedAt: '2026-04-27T10:00:00Z',
  },
  {
    id: 'rd-2',
    caseId: '1',
    subject: 'Re: Valuation Request - 42 MG Road, Andheri West, Mumbai 400053',
    body: 'Dear Customer,\n\nYour valuation has been completed. Please find the attached report.\n\nBest regards,\nProperty Services Team',
    status: 'APPROVED',
    generatedAt: '2026-04-27T11:30:00Z',
    approvedBy: 'Rajesh Kumar',
    approvedAt: '2026-04-27T12:00:00Z',
  },
];

interface CaseData {
  id: string;
  caseNumber: string;
  subject: string;
  emailSubject?: string;
  emailFrom?: string;
  emailBody?: string;
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
  previousBody?: string;
  newBody?: string;
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
  /** FR-021.A2: Word-level OCR confidence scores. */
  wordConfidences?: Array<{ word: string; confidence: number }>;
  downloadUrl?: string;
  dms_external_id?: string;
}

const MOCK_CASE: CaseData = {
  id: '1',
  caseNumber: 'CASE-1042',
  subject: 'Valuation Request - 42 MG Road, Andheri West, Mumbai 400053',
  status: 'IN_PROGRESS',
  priority: 'P2',
  type: 'Valuation',
  assignedFpr: 'Rajesh Kumar',
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
    { type: 'Property Address', value: '42 MG Road, Andheri West, Mumbai 400053', outcome: 'EXACT_MATCH', sourceText: '42 MG Road, Andheri West, Mumbai 400053', confidence: 0.97 },
    { type: 'Customer Name', value: 'Godrej Properties Ltd', outcome: 'FUZZY_MATCH', candidates: ['Godrej Properties Ltd', 'Godrej Properties Limited'], sourceText: 'Godrej Properties', confidence: 0.78 },
    { type: 'Loan Reference', value: 'LN-2026-00451', outcome: 'EXACT_MATCH', sourceText: 'LN-2026-00451', confidence: 0.99 },
    { type: 'Amount', value: '₹9,50,00,000', outcome: 'FUZZY_MATCH', candidates: ['₹9,50,00,000', '₹9,50,00,000.00', 'INR 9.5 Cr'], sourceText: '₹9.5 Cr', confidence: 0.82 },
  ],
  securityVerdicts: {
    spf: 'PASS',
    dkim: 'PASS',
    dmarc: 'FAIL',
  },
  routing_rationale: 'Region matches MH assignment rules; Sub-category "New Valuation" routes to Valuation team; Priority P2 assigned based on loan value > ₹7.5 Cr; FPR Rajesh Kumar selected — lowest current caseload in region',
  customer: {
    name: 'Godrej Properties Ltd',
    accountNumber: 'ACC-987654',
    segment: 'Commercial',
  },
  property: {
    address: '42 MG Road, Andheri West, Mumbai 400053',
    type: 'Commercial Office',
    state: 'MH',
    valuationAmount: '₹9,50,00,000',
  },
};

const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: '1', timestamp: '2026-04-27 09:15', action: 'Case Created', user: 'System', details: 'Email ingested and classified automatically.' },
  { id: '2', timestamp: '2026-04-27 09:16', action: 'Classification Applied', user: 'ML Pipeline', details: 'Category: Valuation Request | Confidence: 92% (GREEN)' },
  { id: '3', timestamp: '2026-04-27 09:20', action: 'Auto-Assigned', user: 'System', details: 'Assigned to FPR Rajesh Kumar based on region rules.' },
  { id: '4', timestamp: '2026-04-27 09:45', action: 'Status Changed', user: 'Rajesh Kumar', details: 'Status changed from NEW to IN_PROGRESS' },
  { id: '5', timestamp: '2026-04-27 10:30', action: 'Vendor Ordered', user: 'Rajesh Kumar', details: 'Valuation ordered from JLL India Valuers Pvt Ltd' },
];

const MOCK_LINKED_CASES: LinkedCase[] = [
  { id: '4', caseNumber: 'CASE-1039', subject: 'Property Inspection - 42 MG Road, Mumbai', relationship: 'Related Property' },
  { id: '8', caseNumber: 'CASE-1035', subject: 'Settlement Coordination - Godrej Properties', relationship: 'Same Customer' },
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
    uploadedBy: 'Rajesh Kumar',
    avStatus: 'CLEAN',
    avVerdict: 'NOOP_CLEAN',
    documentType: 'LEGAL_OPINION',
    docTypeConfidence: 0.87,
    ocrText: 'Property Title Search Report\n\nSubject Property: 42 MG Road, Andheri West, Mumbai 400053\nTitle Reference: MH/MUM/2026/04512\nOwner: Godrej Properties Ltd\n\nNo encumbrances found.',
    wordConfidences: [
      { word: 'Property', confidence: 0.98 }, { word: 'Title', confidence: 0.97 },
      { word: 'Search', confidence: 0.95 }, { word: 'Report', confidence: 0.96 },
      { word: 'Subject', confidence: 0.94 }, { word: 'Property:', confidence: 0.91 },
      { word: '42', confidence: 0.99 }, { word: 'MG', confidence: 0.93 },
      { word: 'Road,', confidence: 0.88 }, { word: 'Andheri', confidence: 0.92 },
      { word: 'West,', confidence: 0.91 }, { word: 'Mumbai', confidence: 0.92 },
      { word: '400053', confidence: 0.99 },
      { word: 'Title', confidence: 0.96 }, { word: 'Reference:', confidence: 0.90 },
      { word: 'MH/MUM/2026/04512', confidence: 0.85 }, { word: 'Owner:', confidence: 0.93 },
      { word: 'Godrej', confidence: 0.78 }, { word: 'Properties', confidence: 0.82 },
      { word: 'Ltd', confidence: 0.88 },
      { word: 'No', confidence: 0.97 }, { word: 'encumbrances', confidence: 0.65 },
      { word: 'found.', confidence: 0.91 },
    ],
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
    uploadedBy: 'Rajesh Kumar',
    avStatus: 'CLEAN',
    avVerdict: 'NOOP_CLEAN',
    documentType: 'VALUATION_REPORT',
    docTypeConfidence: 0.93,
    ocrText: 'Valuation Order Form\n\nLoan Reference: LN-2026-00451\nProperty: 42 MG Road, Andheri West, Mumbai 400053\nValuation Type: Full',
    wordConfidences: [
      { word: 'Valuation', confidence: 0.96 }, { word: 'Order', confidence: 0.94 },
      { word: 'Form', confidence: 0.98 }, { word: 'Loan', confidence: 0.93 },
      { word: 'Reference:', confidence: 0.89 }, { word: 'LN-2026-00451', confidence: 0.62 },
      { word: 'Property:', confidence: 0.91 }, { word: '42', confidence: 0.99 },
      { word: 'MG', confidence: 0.92 }, { word: 'Road,', confidence: 0.87 },
      { word: 'Andheri', confidence: 0.91 }, { word: 'West,', confidence: 0.90 },
      { word: 'Mumbai', confidence: 0.95 }, { word: '400053', confidence: 0.99 },
      { word: 'Valuation', confidence: 0.94 },
      { word: 'Type:', confidence: 0.90 }, { word: 'Full', confidence: 0.96 },
    ],
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // FR-051.A3: Fetch signed URL before opening attachment preview
  const handlePreviewAttachment = async (attachment: Attachment) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/attachments/${attachment.id}/signed-url`);
      const { url } = await response.json();
      setPreviewUrl(url || attachment.downloadUrl || null);
    } catch {
      setPreviewUrl(attachment.downloadUrl || null);
    }
    setPreviewAttachment(attachment);
  };

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

  // Loading state (live mode)
  if (!demo && isLoading) {
    return (
      <div>
        <Button variant="ghost" onClick={() => navigate('/cases')} className="mb-3 px-0 text-sm text-primary hover:bg-transparent">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Cases
        </Button>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-16 text-center">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading case details...</p>
        </div>
      </div>
    );
  }

  // Error state (live mode)
  if (!demo && isError) {
    return (
      <div>
        <Button variant="ghost" onClick={() => navigate('/cases')} className="mb-3 px-0 text-sm text-primary hover:bg-transparent">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Cases
        </Button>
        <Alert variant="destructive" className="flex flex-col items-center p-16 text-center">
          <AlertTriangle className="mb-2 h-6 w-6" />
          <AlertTitle className="text-lg">Failed to load case</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div>
        <Button variant="ghost" onClick={() => navigate('/cases')} className="mb-3 px-0 text-sm text-primary hover:bg-transparent">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Cases
        </Button>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-16 text-center">
          <h3 className="mb-2 text-lg font-semibold text-slate-600">Case not found</h3>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
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
      <div className="flex min-h-[600px]" data-testid="three-pane-layout">
        {/* Left pane -- compact navigation sidebar */}
        <aside className="w-1/4 max-w-[25%] shrink-0 overflow-y-auto border-r p-3" data-testid="left-pane" aria-label="Case navigation sidebar">
          <h4 className="mb-2 text-xs font-semibold uppercase text-slate-600">Related Cases</h4>
          {!demo && (
            <p className="px-2 py-1 text-[0.7rem] text-slate-400">No linked cases</p>
          )}
          {demo && MOCK_LINKED_CASES.map((linked) => (
            <div
              key={linked.id}
              className={cn(
                'mb-1 cursor-pointer rounded p-2 transition-colors',
                linked.id === caseId ? 'bg-blue-50' : 'bg-transparent hover:bg-muted',
              )}
              onClick={() => navigate(`/cases/${linked.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/cases/${linked.id}`); }}
            >
              <strong className="text-xs">{linked.caseNumber}</strong>
              <span className="mt-0.5 block text-[0.7rem] text-slate-500">{linked.subject}</span>
            </div>
          ))}
          <Separator className="my-2" />
          <div className="mb-1 rounded border-l-[3px] border-l-primary bg-blue-50 p-2">
            <strong className="text-xs">{caseData.caseNumber}</strong>
            <span className="mt-0.5 block text-[0.7rem] text-blue-500">Current Case</span>
          </div>
        </aside>

        {/* Center pane -- main case detail content */}
        <div className="w-1/2 max-w-[50%] shrink-0 overflow-y-auto px-4" data-testid="center-pane" role="main">

      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/cases')} className="mb-3 px-0 text-sm text-primary hover:bg-transparent">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Cases
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="m-0 text-2xl font-bold">{caseData.caseNumber}</h2>
            <CaseStatusBadge status={caseData.status} />
            <PriorityIndicator priority={caseData.priority} showLabel />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {caseData.classification.confidenceBand === 'GREEN' && (
              <Badge className="border border-green-200 bg-green-100 text-green-700">
                <CheckCircle className="mr-1 h-3.5 w-3.5" />
                Auto-classified — no action needed
              </Badge>
            )}
            {!demo && (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 text-white hover:bg-green-700"
                  onClick={handleConfirmAI}
                  disabled={confirmTriage.isPending}
                >
                  <CheckCircle className="mr-1 h-3.5 w-3.5" />
                  {confirmTriage.isPending ? 'Confirming...' : 'Confirm AI'}
                </Button>
                <Button
                  size="sm"
                  className="bg-indigo-500 text-white hover:bg-indigo-600"
                  onClick={() => setShowCorrectForm(!showCorrectForm)}
                >
                  <PenLine className="mr-1 h-3.5 w-3.5" />
                  Correct
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStatusModal(!showStatusModal)}
            >
              Transition Status
            </Button>
            {!demo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNoteForm(!showNoteForm)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Note
              </Button>
            )}
            {!demo && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPauseForm(!showPauseForm)}
                  data-testid="btn-pause-sla"
                >
                  <Pause className="mr-1 h-3.5 w-3.5" />
                  Pause SLA
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResumeSla}
                  disabled={resumeSla.isPending}
                  data-testid="btn-resume-sla"
                >
                  <Play className="mr-1 h-3.5 w-3.5" />
                  {resumeSla.isPending ? 'Resuming...' : 'Resume SLA'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReassignForm(!showReassignForm)}
                  data-testid="btn-reassign"
                >
                  <UserCog className="mr-1 h-3.5 w-3.5" />
                  Reassign
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPriorityForm(!showPriorityForm)}
                  data-testid="btn-set-priority"
                >
                  <Flag className="mr-1 h-3.5 w-3.5" />
                  Set Priority
                </Button>
              </>
            )}
            <Button variant="outline" size="sm">
              <Send className="mr-1 h-3.5 w-3.5" />
              Assign Vendor
            </Button>
            <Button variant="outline" size="sm">
              <Link2 className="mr-1 h-3.5 w-3.5" />
              Link Case
            </Button>
            {/* FR-051.A2: Complete action panel -- Change Priority & Close Case */}
            <Button
              data-testid="change-priority-btn"
              onClick={() => setShowPriorityForm(true)}
              size="sm"
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              <Flag className="mr-1 h-3.5 w-3.5" />
              Change Priority
            </Button>
            <Button
              data-testid="close-case-btn"
              onClick={() => {
                if (window.confirm('Are you sure you want to close this case?')) {
                  if (caseId) {
                    transitionStatus.mutate({ caseId, status: 'CLOSED' as CaseStatus, reason: 'Closed via action panel' });
                  }
                }
              }}
              size="sm"
              variant="destructive"
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Close Case
            </Button>
            {/* FR-054.A3: Compliance audit unlock -- only COMPLIANCE_OFFICER/SYS_ADMIN can export directly */}
            {user?.roles?.some((r: string) => ['COMPLIANCE_OFFICER', 'SYS_ADMIN', 'DPO'].includes(r)) ? (
              <Button
                variant="outline"
                size="sm"
                className="border-blue-300 bg-blue-50 hover:bg-blue-100"
                onClick={handleExportAuditTrail}
                data-testid="btn-export-audit"
              >
                <FileDown className="mr-1 h-3.5 w-3.5" />
                Export Audit Trail
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="opacity-60"
                onClick={() => window.alert('Audit trail export requires Compliance Officer or DPO role.')}
                data-testid="btn-export-audit-locked"
              >
                <Lock className="mr-1 h-3.5 w-3.5" />
                Export Audit Trail (Locked)
              </Button>
            )}
          </div>
        </div>
        <p className="my-2 text-[0.95rem] text-slate-500">{caseData.subject}</p>
        <div className="mt-3 max-w-[400px]">
          <SlaProgressBar remainingPercent={caseData.slaRemainingPercent} label="SLA Progress" />
        </div>
      </div>

      {/* Status Transition Modal */}
      {showStatusModal && !demo && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-[0.95rem]">Transition Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-3">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as CaseStatus)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <Input
                type="text"
                placeholder="Reason (optional)"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="min-w-[200px]"
              />
              <Button
                onClick={handleTransitionStatus}
                disabled={transitionStatus.isPending}
                size="sm"
              >
                {transitionStatus.isPending ? 'Saving...' : 'Update Status'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStatusModal(false)}
              >
                Cancel
              </Button>
            </div>
            {transitionStatus.isError && (
              <p className="mt-2 text-sm text-destructive">
                {transitionStatus.error instanceof Error
                  ? transitionStatus.error.message
                  : 'Failed to update status'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Note Form */}
      {showNoteForm && !demo && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-[0.95rem]">Add Note</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-3">
              <textarea
                placeholder="Enter note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-[inherit] text-sm"
                rows={3}
              />
              <Button
                onClick={handleAddNote}
                disabled={addNote.isPending || !noteText.trim()}
                size="sm"
              >
                {addNote.isPending ? 'Saving...' : 'Save Note'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNoteForm(false)}
              >
                Cancel
              </Button>
            </div>
            {addNote.isError && (
              <p className="mt-2 text-sm text-destructive">
                {addNote.error instanceof Error
                  ? addNote.error.message
                  : 'Failed to add note'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Correct Classification Form */}
      {showCorrectForm && !demo && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-[0.95rem]">Correct Classification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-3">
              <Input
                type="text"
                placeholder="Category"
                value={correctCategory}
                onChange={(e) => setCorrectCategory(e.target.value)}
                className="min-w-[200px]"
              />
              <Input
                type="text"
                placeholder="Sub-Category"
                value={correctSubCategory}
                onChange={(e) => setCorrectSubCategory(e.target.value)}
                className="min-w-[200px]"
              />
              <Button
                onClick={handleCorrectClassification}
                disabled={correctTriage.isPending || !correctCategory}
                size="sm"
                className="bg-indigo-500 text-white hover:bg-indigo-600"
              >
                {correctTriage.isPending ? 'Saving...' : 'Submit Correction'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCorrectForm(false)}
              >
                Cancel
              </Button>
            </div>
            {correctTriage.isError && (
              <p className="mt-2 text-sm text-destructive">
                {correctTriage.error instanceof Error
                  ? correctTriage.error.message
                  : 'Failed to correct classification'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pause SLA Form */}
      {showPauseForm && !demo && (
        <Card className="mb-4" data-testid="pause-sla-form">
          <CardHeader className="pb-3">
            <CardTitle className="text-[0.95rem]">Pause SLA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-3">
              <Input
                type="text"
                placeholder="Reason for pause..."
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                className="min-w-[200px]"
              />
              <Button
                onClick={handlePauseSla}
                disabled={pauseSla.isPending || !pauseReason.trim()}
                size="sm"
                className="bg-orange-600 text-white hover:bg-orange-700"
              >
                {pauseSla.isPending ? 'Pausing...' : 'Confirm Pause'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPauseForm(false)}
              >
                Cancel
              </Button>
            </div>
            {pauseSla.isError && (
              <p className="mt-2 text-sm text-destructive">
                {pauseSla.error instanceof Error
                  ? pauseSla.error.message
                  : 'Failed to pause SLA'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reassign Form */}
      {showReassignForm && !demo && (
        <Card className="mb-4" data-testid="reassign-form">
          <CardHeader className="pb-3">
            <CardTitle className="text-[0.95rem]">Reassign Case</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-3">
              <Input
                type="text"
                placeholder="FPR ID or name..."
                value={reassignFprId}
                onChange={(e) => setReassignFprId(e.target.value)}
                className="min-w-[200px]"
              />
              <Button
                onClick={handleReassign}
                disabled={updateCase.isPending || !reassignFprId.trim()}
                size="sm"
              >
                {updateCase.isPending ? 'Reassigning...' : 'Confirm Reassign'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReassignForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Set Priority Form */}
      {showPriorityForm && !demo && (
        <Card className="mb-4" data-testid="set-priority-form">
          <CardHeader className="pb-3">
            <CardTitle className="text-[0.95rem]">Set Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-3">
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="P1">P1 - CRITICAL</option>
                <option value="P2">P2 - HIGH</option>
                <option value="P3">P3 - NORMAL</option>
                <option value="P4">P4 - LOW</option>
              </select>
              <Button
                onClick={handleSetPriority}
                disabled={updateCase.isPending}
                size="sm"
              >
                {updateCase.isPending ? 'Saving...' : 'Update Priority'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPriorityForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="mb-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="linked">Linked Cases</TabsTrigger>
          <TabsTrigger value="attachments">Attachments</TabsTrigger>
          <TabsTrigger value="reply-drafts">Reply Drafts</TabsTrigger>
        </TabsList>

        {/* Tab Content */}
        <TabsContent value="overview" className="min-h-[300px]">
          <OverviewTab caseData={caseData} />
        </TabsContent>
        <TabsContent value="activity" className="min-h-[300px]">
          <ActivityTab />
        </TabsContent>
        <TabsContent value="linked" className="min-h-[300px]">
          <LinkedCasesTab />
        </TabsContent>
        <TabsContent value="attachments" className="min-h-[300px]">
          <AttachmentsTab onPreview={handlePreviewAttachment} />
        </TabsContent>
        <TabsContent value="reply-drafts" className="min-h-[300px]">
          <ReplyDraftsTab caseId={caseId || '1'} />
        </TabsContent>
      </Tabs>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        open={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Attachment Preview Modal (FR-051.A3) */}
      <Dialog open={!!previewAttachment} onOpenChange={(open) => { if (!open) setPreviewAttachment(null); }}>
        <DialogContent
          className="max-h-[90vh] max-w-3xl overflow-hidden"
          data-testid="attachment-preview-modal"
          aria-label={previewAttachment ? `Preview ${previewAttachment.name}` : undefined}
        >
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {previewAttachment?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {previewAttachment?.mimeType === 'application/pdf' ? (
              <iframe
                src={previewUrl || previewAttachment.downloadUrl || '#'}
                title={`Preview ${previewAttachment.name}`}
                className="h-[500px] w-full border-none"
                data-testid="attachment-preview-pdf"
              />
            ) : previewAttachment?.mimeType.startsWith('image/') ? (
              <img
                src={previewUrl || previewAttachment.downloadUrl || '#'}
                alt={previewAttachment.name}
                className="max-h-[500px] max-w-full object-contain"
                data-testid="attachment-preview-image"
              />
            ) : (
              <div data-testid="attachment-preview-download" className="p-8 text-center">
                <p className="mb-4 text-slate-500">Preview not available for this file type.</p>
                {previewAttachment && (previewUrl || previewAttachment.downloadUrl) && (
                  <a
                    href={previewUrl || previewAttachment.downloadUrl}
                    download={previewAttachment.name}
                    className="font-medium text-primary hover:underline"
                  >
                    <Download className="mr-1 inline h-4 w-4" />
                    Download {previewAttachment.name}
                  </a>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

        </div>{/* end center pane */}

        {/* Right pane -- activity timeline & linked cases */}
        <aside className="w-1/4 max-w-[25%] shrink-0 overflow-y-auto border-l p-3" data-testid="right-pane" aria-label="Activity timeline">
          <h4 className="mb-2 text-xs font-semibold uppercase text-slate-600">Activity Timeline</h4>
          {MOCK_ACTIVITY.slice(0, 5).map((event) => (
            <div key={event.id} className="border-b py-2">
              <div className="mb-0.5 flex justify-between">
                <strong className="text-[0.7rem]">{event.action}</strong>
                <span className="text-[0.65rem] text-slate-400">{event.timestamp}</span>
              </div>
              <p className="m-0 text-[0.7rem] leading-snug text-slate-500">{event.details}</p>
            </div>
          ))}
          <Separator className="my-2" />
          <h4 className="mb-2 text-xs font-semibold uppercase text-slate-600">Linked Cases</h4>
          {!demo && (
            <p className="py-1 text-[0.7rem] text-slate-400">None</p>
          )}
          {demo && MOCK_LINKED_CASES.map((linked) => (
            <div
              key={linked.id}
              className="cursor-pointer border-b py-2"
              onClick={() => navigate(`/cases/${linked.id}`)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/cases/${linked.id}`); }}
            >
              <strong className="cursor-pointer text-xs text-primary">{linked.caseNumber}</strong>
              <span className="block text-[0.7rem] text-slate-500">{linked.relationship}</span>
            </div>
          ))}
          <Separator className="my-2" />
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
    if (confidence >= 0.9) return 'bg-green-600';
    if (confidence >= 0.7) return 'bg-orange-600';
    return 'bg-red-600';
  };

  const getActionStatus = (actionId: string): 'accepted' | 'rejected' | 'pending' => {
    if (appliedActions.has(actionId)) return 'accepted';
    if (rejectedActions.has(actionId)) return 'rejected';
    return 'pending';
  };

  if (loading) {
    return (
      <div data-testid="suggested-actions-panel">
        <h4 className="mb-2 text-xs font-semibold uppercase text-slate-600">Suggested Actions</h4>
        <p className="text-xs text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div data-testid="suggested-actions-panel">
      <h4 className="mb-2 text-xs font-semibold uppercase text-slate-600">Suggested Actions</h4>
      {actions.length === 0 && (
        <p className="text-xs text-slate-400">No actions suggested.</p>
      )}
      {actions.map((action) => {
        const status = getActionStatus(action.id);
        return (
          <div
            key={action.id}
            data-testid={`suggested-action-${action.id}`}
            className={cn(
              'mb-2 rounded-md border p-2',
              status === 'accepted' && 'bg-green-50',
              status === 'rejected' && 'bg-red-50',
              status === 'pending' && 'bg-card',
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <strong className="text-xs">{action.action}</strong>
              <span
                data-testid={`confidence-badge-${action.id}`}
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold text-white',
                  getConfidenceColor(action.confidence),
                )}
              >
                {(action.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mb-1.5 text-[0.7rem] leading-snug text-slate-500">
              {action.description}
            </p>

            {/* FR-052.A2: Display recipient role and estimated TAT impact */}
            {action.recipientRole && (
              <div data-testid={`recipient-role-${action.id}`} className="mb-0.5 text-[0.65rem] text-slate-600">
                <strong>Recipient:</strong> {action.recipientRole}
              </div>
            )}
            {action.estimatedTatImpactHours !== undefined && (
              <div data-testid={`tat-impact-${action.id}`} className="mb-1.5 text-[0.65rem] text-slate-600">
                <strong>Est. TAT Impact:</strong> {action.estimatedTatImpactHours}h
              </div>
            )}

            {/* FR-052.A3: Accept/Edit/Reject buttons */}
            <div className="flex items-center gap-1">
              <Button
                data-testid={`accept-action-${action.id}`}
                onClick={() => handleAccept(action.id)}
                disabled={status === 'accepted'}
                size="sm"
                className={cn(
                  'h-auto px-2 py-0.5 text-[0.65rem] font-semibold',
                  status === 'accepted'
                    ? 'bg-green-100 text-green-600 hover:bg-green-100'
                    : 'bg-green-600 text-white hover:bg-green-700',
                )}
              >
                {status === 'accepted' ? 'Accepted' : 'Accept'}
              </Button>
              <Button
                data-testid={`edit-action-${action.id}`}
                onClick={() => handleEdit(action.id)}
                disabled={status !== 'pending'}
                variant="outline"
                size="sm"
                className={cn(
                  'h-auto px-2 py-0.5 text-[0.65rem] font-semibold',
                  editingAction === action.id && 'border-blue-200 bg-blue-100 text-blue-600',
                )}
              >
                Edit
              </Button>
              <Button
                data-testid={`reject-action-${action.id}`}
                onClick={() => handleReject(action.id)}
                disabled={status === 'rejected'}
                variant="outline"
                size="sm"
                className={cn(
                  'h-auto px-2 py-0.5 text-[0.65rem] font-semibold text-red-600',
                  status === 'rejected'
                    ? 'border-none bg-red-200 hover:bg-red-200'
                    : 'border-red-600 bg-white hover:bg-red-50',
                )}
              >
                {status === 'rejected' ? 'Rejected' : 'Reject'}
              </Button>
            </div>

            {/* FR-052.A3: Edit mode panel */}
            {editingAction === action.id && (
              <div data-testid={`edit-panel-${action.id}`} className="mt-2 rounded border border-dashed border-blue-300 bg-blue-50 p-2">
                <p className="mb-1 text-[0.65rem] text-blue-700">Editing action parameters...</p>
                <Button
                  data-testid={`save-edit-${action.id}`}
                  onClick={() => handleAccept(action.id)}
                  size="sm"
                  className="h-auto px-2 py-0.5 text-[0.65rem] font-semibold"
                >
                  <Save className="mr-1 h-3 w-3" />
                  Save &amp; Accept
                </Button>
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

  const getStatusBadgeClasses = (status: ReplyDraftItem['status']): string => {
    const classMap: Record<string, string> = {
      PROPOSED: 'bg-amber-100 text-amber-600',
      APPROVED: 'bg-green-100 text-green-600',
      REJECTED: 'bg-red-100 text-red-600',
      SENT: 'bg-blue-100 text-blue-600',
    };
    return classMap[status] || classMap.PROPOSED;
  };

  if (loading) {
    return (
      <div data-testid="reply-drafts-tab">
        <p className="text-sm text-slate-400">Loading drafts...</p>
      </div>
    );
  }

  return (
    <div data-testid="reply-drafts-tab">
      {drafts.length === 0 && (
        <p className="text-sm text-slate-400">No reply drafts available.</p>
      )}
      {drafts.map((draft) => (
        <Card
          key={draft.id}
          data-testid={`reply-draft-${draft.id}`}
          className="mb-4"
        >
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <strong className="text-sm">{draft.subject}</strong>
              <Badge
                data-testid={`draft-status-${draft.id}`}
                variant="secondary"
                className={cn('rounded-full text-[0.7rem] font-semibold uppercase', getStatusBadgeClasses(draft.status))}
              >
                {draft.status}
              </Badge>
            </div>
            <pre className="mb-3 whitespace-pre-wrap rounded border bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
              {draft.body}
            </pre>
            <div className="flex items-center gap-2">
              {draft.status === 'PROPOSED' && (
                <>
                  <Button
                    data-testid={`approve-draft-${draft.id}`}
                    onClick={() => handleApprove(draft.id)}
                    size="sm"
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    <CheckCircle className="mr-1 h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    data-testid={`reject-draft-${draft.id}`}
                    onClick={() => handleReject(draft.id)}
                    size="sm"
                    variant="outline"
                    className="border-red-600 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    Reject
                  </Button>
                  <Button
                    data-testid={`edit-draft-${draft.id}`}
                    size="sm"
                    variant="outline"
                  >
                    <PenLine className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </>
              )}
              {draft.approvedBy && (
                <span className="text-[0.7rem] text-slate-400">
                  Approved by {draft.approvedBy}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
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
    <div className="grid grid-cols-2 gap-5">
      {/* Original Email — the raw ingested message, so the classification can be verified */}
      <Card className="col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.95rem]">
            <MessageSquare className="mr-2 inline h-4 w-4" />
            Original Email
          </CardTitle>
        </CardHeader>
        <CardContent>
          {caseData.emailBody || caseData.emailSubject ? (
            <div className="flex flex-col gap-2">
              {caseData.emailFrom && (
                <div className="text-xs text-slate-400">
                  From: <span className="text-slate-600">{caseData.emailFrom}</span>
                </div>
              )}
              {caseData.emailSubject && (
                <div className="text-sm font-medium text-slate-700">{caseData.emailSubject}</div>
              )}
              <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-sm text-slate-700">
                {caseData.emailBody || '(no message body)'}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Original email not available for this case.</p>
          )}
        </CardContent>
      </Card>
      {/* Classification Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.95rem]">Classification</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Category</Label>
              <span className="text-sm">{caseData.classification.category}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Sub-Category</Label>
              <span className="text-sm">{caseData.classification.subCategory}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Confidence</Label>
              <span className="text-sm">{(caseData.classification.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Confidence Band</Label>
              <ConfidenceBadge band={caseData.classification.confidenceBand as ConfidenceBand} />
            </div>
          </div>
          {/* FR-011.A4: Confidence conflict indicator when top-2 labels are within 10% */}
          {(caseData.classification as any).confidenceScores && (() => {
            const scores = Object.values((caseData.classification as any).confidenceScores).sort((a: any, b: any) => b - a);
            if (scores.length >= 2 && (scores[0] as number) - (scores[1] as number) < 0.1) {
              return (
                <Badge
                  data-testid="confidence-conflict-badge"
                  variant="secondary"
                  className="mt-2 bg-amber-100 text-sm font-semibold text-amber-800"
                >
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                  Classification Conflict
                </Badge>
              );
            }
            return null;
          })()}
        </CardContent>
      </Card>

      {/* Security Verdicts (FR-001.A4) */}
      {caseData.securityVerdicts && (
        <Card data-testid="security-verdicts">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.95rem]">Security Verdicts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {(['spf', 'dkim', 'dmarc'] as const).map((protocol) => {
                const verdict = caseData.securityVerdicts![protocol];
                const isPass = verdict === 'PASS';
                return (
                  <Badge
                    key={protocol}
                    data-testid={`verdict-${protocol}`}
                    variant="secondary"
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                      isPass ? 'bg-green-100 text-green-500' : 'bg-red-100 text-red-500',
                    )}
                  >
                    {isPass ? (
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                    )}
                    {protocol.toUpperCase()}: {verdict}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* NER Entities with conflict surfacing (FR-011.A4) */}
      <Card className="col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.95rem]">Extracted Entities (NER)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">Entity Type</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">Value</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-slate-500">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {caseData.entities.map((entity, idx) => (
                <TableRow key={idx}>
                  <TableCell>{entity.type}</TableCell>
                  <TableCell>
                    <span
                      className="relative inline-flex items-center gap-1.5"
                      onMouseEnter={() => setHoveredEntityIdx(idx)}
                      onMouseLeave={() => setHoveredEntityIdx(null)}
                      data-testid={`entity-badge-${idx}`}
                    >
                      {entity.value}
                      {/* Confidence tooltip (FR-133.A2) */}
                      {hoveredEntityIdx === idx && entity.confidence !== undefined && (
                        <span
                          data-testid={`entity-confidence-tooltip-${idx}`}
                          className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-3 py-2 text-xs text-slate-50 shadow-lg"
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
                          className="cursor-pointer text-base text-amber-500"
                          title="Fuzzy match -- click to see candidates"
                          onClick={() => setExpandedEntityIdx(expandedEntityIdx === idx ? null : idx)}
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                      )}
                    </span>
                    {entity.outcome === 'FUZZY_MATCH' && expandedEntityIdx === idx && entity.candidates && (
                      <div
                        data-testid={`entity-candidates-${idx}`}
                        className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm"
                      >
                        <strong className="text-[0.7rem] uppercase text-amber-800">
                          Candidate Values:
                        </strong>
                        <ul className="mt-1 pl-5">
                          {entity.candidates.map((c, ci) => (
                            <li key={ci} className="text-sm text-amber-900">{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {entity.sourceText ? (
                      <SourceSpanHighlight sourceLabel={`Source: ${entity.type}`}>
                        {entity.sourceText}
                      </SourceSpanHighlight>
                    ) : (
                      <span className="text-sm text-slate-400">--</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Routing Rationale (FR-133.A3) */}
      {caseData.routing_rationale && (
        <Card className="col-span-2" data-testid="routing-rationale">
          <CardHeader className="pb-0">
            <div
              className="flex cursor-pointer items-center justify-between"
              onClick={() => setRoutingExpanded(!routingExpanded)}
              data-testid="routing-rationale-toggle"
            >
              <CardTitle className="text-[0.95rem]">Routing Rationale</CardTitle>
              {routingExpanded ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </div>
          </CardHeader>
          {routingExpanded && (
            <CardContent data-testid="routing-rationale-content" className="pt-3">
              {routingBullets.length > 1 ? (
                <ul className="m-0 pl-6">
                  {routingBullets.map((bullet, i) => (
                    <li key={i} className="mb-1.5 text-sm leading-relaxed text-slate-600">
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm leading-relaxed text-slate-600">
                  {caseData.routing_rationale}
                </p>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Customer Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.95rem]">
            <User className="mr-2 inline h-4 w-4" />
            Customer Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Name</Label>
              <span className="text-sm">{caseData.customer.name}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Account #</Label>
              <span className="text-sm">{caseData.customer.accountNumber}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Segment</Label>
              <span className="text-sm">{caseData.customer.segment}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Property Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.95rem]">
            <MapPin className="mr-2 inline h-4 w-4" />
            Property Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Address</Label>
              <span className="text-sm">{caseData.property.address}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Type</Label>
              <span className="text-sm">{caseData.property.type}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">State</Label>
              <span className="text-sm">{caseData.property.state}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-[0.7rem] uppercase text-slate-400">Valuation</Label>
              <span className="text-sm">{caseData.property.valuationAmount}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes (live mode) */}
      {caseData.notes && caseData.notes.length > 0 && (
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.95rem]">
              <MessageSquare className="mr-2 inline h-4 w-4" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {caseData.notes.map((note) => (
              <div key={note.id} className="border-b py-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm">{note.createdBy}</strong>
                  <span className="text-xs text-slate-400">{note.createdAt}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{parseMentions(note.text)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Field Visit Evidence Section -- only for SITE_VISIT cases */}
      {(caseData.type === 'SITE_VISIT' || caseData.type === 'Inspection') && (
        <FieldVisitEvidenceSection />
      )}
    </div>
  );
}

function ActivityTab() {
  return (
    <div className="flex flex-col gap-4 border-l-2 pl-6">
      {MOCK_ACTIVITY.map((event) => (
        <div key={event.id} className="relative flex gap-3">
          <div className="absolute -left-[1.85rem] top-[0.3rem] h-2.5 w-2.5 rounded-full bg-primary" />
          <div className="flex-1">
            <div className="mb-1 flex justify-between">
              <strong className="text-sm">{event.action}</strong>
              <span className="text-xs text-slate-400">{event.timestamp}</span>
            </div>
            <p className="mb-1 text-[0.85rem] text-slate-500">{event.details}</p>
            {/* FR-004.A2: Show redline diff for Draft Edited events */}
            {event.action === 'Draft Edited' && event.previousBody && event.newBody && (
              <DraftDiff original={event.previousBody} edited={event.newBody} />
            )}
            <span className="text-xs italic text-slate-400">by {event.user}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkedCasesTab() {
  const demo = isDemoMode();
  const linkedCases = demo ? MOCK_LINKED_CASES : [];

  return (
    <div>
      {linkedCases.length === 0 ? (
        <p className="text-slate-400">No linked cases.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">Case #</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">Subject</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">Relationship</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linkedCases.map((linked) => (
              <TableRow key={linked.id}>
                <TableCell><strong>{linked.caseNumber}</strong></TableCell>
                <TableCell>{linked.subject}</TableCell>
                <TableCell>{linked.relationship}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AttachmentsTab({ onPreview }: { onPreview?: (att: Attachment) => void }) {
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null);

  return (
    <div>
      {MOCK_ATTACHMENTS.length === 0 ? (
        <p className="text-slate-400">No attachments.</p>
      ) : (
        <div className="flex gap-6">
          {/* Attachment List */}
          <div className="flex-[1_1_60%]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">File Name</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Type</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Size</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">AV Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Doc Type</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_ATTACHMENTS.map((att) => (
                  <TableRow
                    key={att.id}
                    className={cn(
                      'cursor-pointer',
                      selectedAttachment?.id === att.id && 'bg-blue-50',
                    )}
                    onClick={() => setSelectedAttachment(att)}
                  >
                    <TableCell>
                      <span className="font-medium">{att.name}</span>
                      <br />
                      <span className="text-[0.7rem] text-slate-400">{att.mimeType}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-500">
                        {getMimeIcon(att.mimeType)}
                      </span>
                    </TableCell>
                    <TableCell>{att.size}</TableCell>
                    <TableCell>
                      <AvStatusBadge status={att.avStatus} />
                    </TableCell>
                    <TableCell>
                      {att.documentType ? (
                        <DocTypeBadge type={att.documentType} confidence={att.docTypeConfidence} />
                      ) : (
                        <span className="text-sm text-slate-400">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {att.avStatus !== 'INFECTED' && att.downloadUrl ? (
                          <a
                            href={att.downloadUrl}
                            className="text-sm text-primary no-underline hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Download className="mr-1 inline h-3.5 w-3.5" />
                            Download
                          </a>
                        ) : att.avStatus === 'INFECTED' ? (
                          <Badge variant="destructive" className="text-xs font-semibold">
                            QUARANTINED
                          </Badge>
                        ) : (
                          <span className="text-sm text-slate-400">--</span>
                        )}
                        {att.avStatus !== 'INFECTED' && (
                          <Button
                            onClick={(e) => { e.stopPropagation(); onPreview?.(att); }}
                            variant="outline"
                            size="sm"
                            className="h-auto px-2 py-0.5 text-xs"
                            data-testid={`preview-btn-${att.id}`}
                            aria-label={`Preview ${att.name}`}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Preview
                          </Button>
                        )}
                        {att.dms_external_id && (
                          <a
                            href={`${import.meta.env.VITE_DMS_BASE_URL || '#'}/documents/${att.dms_external_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-indigo-500 no-underline hover:underline"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`dms-link-${att.id}`}
                          >
                            View in DMS
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* OCR Text Preview Panel */}
          {selectedAttachment && (
            <div className="flex-[1_1_40%]">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[0.95rem]">
                    <FileText className="mr-2 inline h-4 w-4" />
                    OCR Text Preview: {selectedAttachment.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedAttachment.ocrText ? (
                    <>
                      {/* FR-021.A2: Word-level confidence display */}
                      {selectedAttachment.wordConfidences && selectedAttachment.wordConfidences.length > 0 ? (
                        <ScrollArea
                          data-testid="ocr-word-confidence"
                          className="max-h-[400px] whitespace-pre-wrap break-words rounded-md border bg-slate-50 p-4 text-sm leading-loose"
                        >
                          {selectedAttachment.wordConfidences.map((wc, idx) => (
                            <span
                              key={idx}
                              title={`Confidence: ${(wc.confidence * 100).toFixed(0)}%`}
                              className={cn(
                                'mr-1 rounded px-1 py-0.5',
                                wc.confidence >= 0.9 && 'bg-green-100 text-green-600',
                                wc.confidence >= 0.7 && wc.confidence < 0.9 && 'bg-yellow-100 text-yellow-600',
                                wc.confidence < 0.7 && 'bg-red-100 font-bold text-red-600',
                              )}
                            >
                              {wc.word}
                            </span>
                          ))}
                          <div className="mt-3 text-[0.7rem] text-slate-400">
                            <span className="mr-2 rounded bg-green-100 px-1.5 py-0.5 text-green-600">High (&ge;90%)</span>
                            <span className="mr-2 rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-600">Medium (&ge;70%)</span>
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-600">Low (&lt;70%)</span>
                          </div>
                        </ScrollArea>
                      ) : (
                        <pre className="m-0 max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-slate-50 p-4 text-sm leading-relaxed">
                          {selectedAttachment.ocrText}
                        </pre>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">
                      No OCR text available for this attachment.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-4">
                    <div>
                      <span className="text-[0.7rem] font-semibold uppercase text-slate-400">
                        Uploaded
                      </span>
                      <br />
                      <span className="text-sm">{selectedAttachment.uploadedAt}</span>
                    </div>
                    <div>
                      <span className="text-[0.7rem] font-semibold uppercase text-slate-400">
                        By
                      </span>
                      <br />
                      <span className="text-sm">{selectedAttachment.uploadedBy}</span>
                    </div>
                    <div>
                      <span className="text-[0.7rem] font-semibold uppercase text-slate-400">
                        Size
                      </span>
                      <br />
                      <span className="text-sm">{selectedAttachment.size}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** AV scan status badge component */
function AvStatusBadge({ status }: { status: string }) {
  const classMap: Record<string, string> = {
    CLEAN: 'bg-green-100 text-green-600',
    PENDING: 'bg-yellow-100 text-yellow-600',
    INFECTED: 'bg-red-100 text-red-600',
    ERROR: 'bg-orange-100 text-orange-600',
  };
  const classes = classMap[status] || classMap['PENDING'];
  return (
    <Badge variant="secondary" className={cn('rounded-full text-[0.7rem] font-semibold', classes)}>
      {status}
    </Badge>
  );
}

/** Document type badge component */
function DocTypeBadge({ type, confidence }: { type: string; confidence?: number }) {
  const label = type.replace(/_/g, ' ');
  return (
    <Badge variant="secondary" className="rounded bg-indigo-100 text-[0.7rem] font-semibold text-indigo-700">
      {label}
      {confidence !== undefined && (
        <span className="ml-1 opacity-70">
          ({(confidence * 100).toFixed(0)}%)
        </span>
      )}
    </Badge>
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
    <Card className="col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="border-b-2 pb-3 text-lg font-bold">
          <ClipboardList className="mr-2 inline h-5 w-5" />
          Field Visit Evidence
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-5">
          {/* Document Checklist */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Document Checklist ({submittedCount}/{requiredDocuments.length} -- {completeness}%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 h-2 overflow-hidden rounded bg-slate-100">
                <div
                  className={cn(
                    'h-full rounded transition-all duration-300',
                    completeness === 100 ? 'bg-green-600' : completeness >= 60 ? 'bg-yellow-600' : 'bg-red-600',
                  )}
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <div className="flex flex-col gap-2">
                {requiredDocuments.map((doc) => (
                  <div key={doc.name} className="flex items-center gap-2 text-sm">
                    {doc.submitted ? (
                      <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                    )}
                    <span className={cn(
                      'text-sm',
                      !doc.submitted && 'text-red-600',
                    )}>
                      {doc.name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Photo Evidence and Inspector Notes */}
          <div className="flex flex-col gap-4">
            {/* Photo Evidence Placeholder */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  <Camera className="mr-2 inline h-4 w-4" />
                  Photo Evidence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  {['North View', 'South View', 'East View', 'West View'].map((label) => (
                    <div key={label} className="flex flex-col items-center justify-center rounded-md border border-dashed bg-slate-50 px-2 py-6">
                      <Image className="mb-1 h-6 w-6 text-slate-400" />
                      <span className="text-[0.7rem] font-semibold text-slate-400">{label}</span>
                    </div>
                  ))}
                </div>
                <p className="m-0 text-xs italic text-slate-400">
                  Photos will appear here once the field inspector uploads them via the mobile app.
                </p>
              </CardContent>
            </Card>

            {/* Inspector Notes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  <MessageSquare className="mr-2 inline h-4 w-4" />
                  Inspector Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {inspectorNotes.map((note, idx) => (
                    <div key={idx} className="border-b py-2">
                      <div className="mb-1 flex items-center justify-between">
                        <strong className="text-sm">{note.inspector}</strong>
                        <span className="text-[0.7rem] text-slate-400">{note.date}</span>
                      </div>
                      <p className="m-0 text-sm leading-snug text-slate-600">{parseMentions(note.note)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CaseDetailPage;
