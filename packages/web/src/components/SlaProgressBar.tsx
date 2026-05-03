import { cn } from '@/lib/utils';

interface SlaProgressBarProps {
  /** Percentage of SLA time remaining (0-100) */
  remainingPercent: number;
  /** Optional label to display */
  label?: string;
}

function getBarClasses(percent: number): string {
  if (percent > 50) return 'bg-green-600';
  if (percent > 20) return 'bg-yellow-600';
  return 'bg-red-600';
}

function getTrackClasses(percent: number): string {
  if (percent > 50) return 'bg-green-100';
  if (percent > 20) return 'bg-yellow-100';
  return 'bg-red-100';
}

export function SlaProgressBar({ remainingPercent, label }: SlaProgressBarProps) {
  const clampedPercent = Math.max(0, Math.min(100, remainingPercent));

  return (
    <div className="flex w-full flex-col gap-1">
      {label && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{clampedPercent}% remaining</span>
        </div>
      )}
      <div className={cn('h-2 w-full overflow-hidden rounded', getTrackClasses(clampedPercent))}>
        <div
          className={cn('h-full rounded transition-all duration-300', getBarClasses(clampedPercent))}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </div>
  );
}
