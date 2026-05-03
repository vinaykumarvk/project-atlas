import { cn } from '@/lib/utils';

interface AccountabilityBannerProps {
  confidenceBand?: string;
  llmMode?: string;
  modelVersion?: string;
}

/**
 * Non-dismissable advisory banner shown on case detail and triage pages.
 * Reminds officers that AI suggestions are advisory only and they hold
 * accountability for every decision made on a case.
 */
export function AccountabilityBanner({
  confidenceBand,
  llmMode,
  modelVersion,
}: AccountabilityBannerProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-xs uppercase tracking-wide text-blue-300">Advisory Notice</strong>
        <span className="text-sm leading-relaxed text-slate-200">
          You are the final accountable party for this case. AI suggestions are advisory.
        </span>
      </div>
      {(confidenceBand || llmMode || modelVersion) && (
        <div className="flex flex-wrap gap-2">
          {llmMode && (
            <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              LLM Mode: <strong>{llmMode}</strong>
            </span>
          )}
          {confidenceBand && (
            <span
              className={cn(
                'whitespace-nowrap rounded px-2 py-0.5 text-xs',
                confidenceBand === 'GREEN' && 'bg-emerald-100 text-emerald-800',
                confidenceBand === 'AMBER' && 'bg-amber-100 text-amber-800',
                confidenceBand !== 'GREEN' && confidenceBand !== 'AMBER' && 'bg-red-100 text-red-800',
              )}
            >
              Confidence: <strong>{confidenceBand}</strong>
            </span>
          )}
          {modelVersion && (
            <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              Model: <strong>{modelVersion}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
