import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ConfidenceBand = 'GREEN' | 'AMBER' | 'RED' | 'RED_MANUAL';

interface ConfidenceBadgeProps {
  band: ConfidenceBand;
}

const BAND_CONFIG: Record<ConfidenceBand, { icon: string; className: string; label: string }> = {
  GREEN: {
    icon: '\u2714',
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
    label: 'high',
  },
  AMBER: {
    icon: '\u26A0',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    label: 'medium',
  },
  RED: {
    icon: '\u26A0',
    className: 'bg-red-100 text-red-800 hover:bg-red-100',
    label: 'low',
  },
  RED_MANUAL: {
    icon: '\u26D4',
    className: 'bg-red-900 text-red-200 hover:bg-red-900',
    label: 'manual review',
  },
};

/**
 * ConfidenceBadge — renders a colored chip with an icon AND color.
 * BRD accessibility requirement (Section 1.5): never rely on color alone.
 */
export function ConfidenceBadge({ band }: ConfidenceBadgeProps) {
  const config = BAND_CONFIG[band] ?? BAND_CONFIG.RED;

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1 font-semibold tracking-wide whitespace-nowrap', config.className)}
      aria-label={`Confidence: ${band}`}
      role="status"
      tabIndex={0}
    >
      <span aria-hidden="true">{config.icon}</span>
      {band}
    </Badge>
  );
}
