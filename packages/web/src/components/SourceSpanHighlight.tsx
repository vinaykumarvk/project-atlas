import { type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SourceSpanHighlightProps {
  children: ReactNode;
  sourceLabel?: string;
}

/**
 * Highlights text spans with a yellow background on hover,
 * showing a "Source" tooltip.
 *
 * Used for entity source text and summary bullets (FR-013.A3 / FR-016.A4 / FR-051.A4).
 */
export function SourceSpanHighlight({
  children,
  sourceLabel = 'Source',
}: SourceSpanHighlightProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline cursor-default rounded-sm transition-colors hover:bg-yellow-200 dark:hover:bg-yellow-800/50"
            data-testid="source-span"
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent data-testid="source-tooltip">
          <p className="text-xs font-semibold">{sourceLabel}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
