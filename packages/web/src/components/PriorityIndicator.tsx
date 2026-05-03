import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

const dotVariants = cva('inline-block h-2.5 w-2.5 shrink-0 rounded-full', {
  variants: {
    priority: {
      P1: 'bg-red-600',
      P2: 'bg-orange-600',
      P3: 'bg-yellow-600',
      P4: 'bg-green-600',
    },
  },
});

const labelVariants = cva('text-xs font-medium', {
  variants: {
    priority: {
      P1: 'text-red-600',
      P2: 'text-orange-600',
      P3: 'text-yellow-600',
      P4: 'text-green-600',
    },
  },
});

const PRIORITY_LABELS: Record<Priority, string> = {
  P1: 'P1 - Critical',
  P2: 'P2 - High',
  P3: 'P3 - Medium',
  P4: 'P4 - Low',
};

interface PriorityIndicatorProps {
  priority: Priority;
  showLabel?: boolean;
}

export function PriorityIndicator({ priority, showLabel = false }: PriorityIndicatorProps) {
  const label = PRIORITY_LABELS[priority] || PRIORITY_LABELS.P3;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn(dotVariants({ priority }))} title={label} />
      <span className={cn(labelVariants({ priority }))}>
        {showLabel ? label : priority}
      </span>
    </span>
  );
}
