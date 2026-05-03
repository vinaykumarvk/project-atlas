import { useState } from 'react';
import { apiPost } from '../api/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { AlertCircle, Loader2 } from 'lucide-react';

export interface DisambiguationCandidate {
  canonicalForm: string;
  confidence: number;
  matchType: string;
  displayLabel: string;
  recordId: string;
}

export interface DisambiguationModalProps {
  isOpen: boolean;
  caseId: string;
  rawValue: string;
  fieldName: string;
  candidates: DisambiguationCandidate[];
  onClose: () => void;
  onResolved: (selectedCanonicalForm: string) => void;
}

function getConfidenceStyle(confidence: number) {
  if (confidence >= 0.8) return 'bg-green-100 text-green-700';
  if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.6) return 'Medium';
  return 'Low';
}

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Disambiguate: {fieldName}</DialogTitle>
          <DialogDescription>
            The value <strong>"{rawValue}"</strong> produced a fuzzy match.
            Please select the correct master record from the candidates below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {candidates.map((candidate) => {
            const isSelected = selectedId === candidate.recordId;
            return (
              <button
                key={candidate.recordId}
                onClick={() => setSelectedId(candidate.recordId)}
                className={cn(
                  'flex w-full items-center gap-4 rounded-lg border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-border bg-background hover:bg-muted/50',
                )}
              >
                <div className="flex-1 space-y-0.5">
                  <span className="text-sm font-semibold text-foreground">
                    {candidate.displayLabel || candidate.canonicalForm}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {candidate.canonicalForm}
                  </span>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded px-2 py-0.5 text-[0.7rem] font-bold',
                    getConfidenceStyle(candidate.confidence),
                  )}
                >
                  {(candidate.confidence * 100).toFixed(0)}% - {getConfidenceLabel(candidate.confidence)}
                </span>
                <div
                  className={cn(
                    'h-4.5 w-4.5 shrink-0 rounded-full border-2',
                    isSelected
                      ? 'border-blue-500 bg-blue-500 shadow-[inset_0_0_0_3px_white]'
                      : 'border-muted-foreground/30 bg-background',
                  )}
                />
              </button>
            );
          })}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Confirm Selection'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DisambiguationModal;
