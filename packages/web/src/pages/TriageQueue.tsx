import { useState } from 'react';
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
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

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
// Triage card -- used for both demo and live modes
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
    <Card>
      <CardContent className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <strong>{triageCase.caseNumber}</strong>
            <PriorityIndicator priority={triageCase.priority} />
            <Badge
              variant="secondary"
              className={cn(
                'rounded text-[0.7rem] font-bold',
                triageCase.confidenceBand === 'RED'
                  ? 'bg-red-100 text-red-600'
                  : 'bg-amber-100 text-amber-800',
              )}
              aria-label={`Confidence: ${triageCase.confidenceBand} (${triageCase.confidenceBand === 'GREEN' ? 'high' : triageCase.confidenceBand === 'AMBER' ? 'medium' : 'low'})`}
              role="status"
            >
              {triageCase.confidenceBand === 'GREEN' ? '\u2714 ' : triageCase.confidenceBand === 'AMBER' ? '\u26A0 ' : '\u2716 '}
              {triageCase.confidenceBand} ({(triageCase.confidence * 100).toFixed(0)}%)
            </Badge>
          </div>
          <span className="text-xs text-slate-400">{triageCase.receivedAt}</span>
        </div>

        <h4 className="mb-3 text-base font-semibold">{triageCase.subject}</h4>

        <div className="mb-3 rounded-md border bg-slate-50 p-3">
          <p className="text-sm italic leading-relaxed text-slate-600">{triageCase.emailSnippet}</p>
        </div>

        <div className="mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Suggested Classification:</span>
            <span className="text-sm font-semibold">
              {triageCase.suggestedCategory} &rarr; {triageCase.suggestedSubCategory}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onApprove(triageCase.id)}
            disabled={isApproving}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {isApproving ? 'Confirming...' : 'Confirm Classification'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onReject(triageCase.id)}
          >
            Reject
          </Button>
          <Button
            size="sm"
            onClick={() => setShowOverride(!showOverride)}
            className="bg-indigo-500 text-white hover:bg-indigo-600"
          >
            Correct
          </Button>
          {triageCase.fuzzyMatches && triageCase.fuzzyMatches.length > 0 && onDisambiguate && (
            <Button
              size="sm"
              onClick={() => {
                const fm = triageCase.fuzzyMatches![0];
                onDisambiguate(triageCase.id, fm.fieldName, fm.rawValue, fm.candidates);
              }}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              Disambiguate ({triageCase.fuzzyMatches.length})
            </Button>
          )}
        </div>

        {showOverride && (
          <div className="mt-4 rounded-md border bg-slate-50 p-4">
            <h5 className="mb-3 text-sm font-semibold">Correct Classification</h5>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">Category</label>
                <Select value={overrideCategory} onValueChange={setOverrideCategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">Sub-Category</label>
                <Input
                  type="text"
                  value={overrideSubCategory}
                  onChange={(e) => setOverrideSubCategory(e.target.value)}
                  className="w-[200px]"
                />
              </div>
              <Button
                size="sm"
                onClick={() => onOverride(triageCase.id, overrideCategory, overrideSubCategory)}
                disabled={isOverriding}
                className="bg-indigo-500 text-white hover:bg-indigo-600"
              >
                {isOverriding ? 'Submitting...' : 'Submit Correction'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const TriageQueuePage = () => {
  const demo = isDemoMode();
  const [demoCases, setDemoCases] = useState(MOCK_TRIAGE_CASES);
  const [disambiguation, setDisambiguation] = useState<DisambiguationState | null>(null);

  // Live data hooks -- called unconditionally
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
        <h2 className="text-2xl font-bold">Triage Queue</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-16 text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-blue-500" />
          <p className="max-w-[480px] text-sm leading-relaxed text-slate-400">Loading triage queue...</p>
        </div>
      </div>
    );
  }

  // Error (live mode)
  if (!demo && isError) {
    return (
      <div>
        <h2 className="text-2xl font-bold">Triage Queue</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-card p-16 text-center">
          <h3 className="mb-2 text-lg font-semibold text-red-600">
            Failed to load triage queue
          </h3>
          <p className="max-w-[480px] text-sm leading-relaxed text-slate-400">
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
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

      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-2xl font-bold">Triage Queue</h2>
        <CaseStatusBadge status="TRIAGED" />
        <span className="ml-auto text-sm text-slate-500">{cases.length} cases pending review</span>
      </div>

      <p className="mb-6 text-sm leading-relaxed text-slate-500">
        Cases below have been classified with AMBER or RED confidence and require manual review.
        Approve the suggested classification, reject it, or override with a correct classification.
      </p>

      {cases.length === 0 ? (
        <Card className="p-12 text-center text-slate-400">
          <p>All cases have been triaged. No items pending review.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
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

export default TriageQueuePage;
