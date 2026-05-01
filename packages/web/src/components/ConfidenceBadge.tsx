import type { CSSProperties } from 'react';

export type ConfidenceBand = 'GREEN' | 'AMBER' | 'RED' | 'RED_MANUAL';

interface ConfidenceBadgeProps {
  band: ConfidenceBand;
}

/**
 * Unicode icons per band for accessibility (FR-015 A6).
 * Icons ensure the badge conveys meaning without relying on color alone.
 */
const BAND_CONFIG: Record<
  ConfidenceBand,
  { icon: string; bg: string; text: string; label: string }
> = {
  GREEN: {
    icon: '\u2714', // checkmark
    bg: '#dcfce7',
    text: '#166534',
    label: 'high',
  },
  AMBER: {
    icon: '\u26A0', // warning
    bg: '#fef3c7',
    text: '#92400e',
    label: 'medium',
  },
  RED: {
    icon: '\u26A0', // alert (triangle)
    bg: '#fee2e2',
    text: '#991b1b',
    label: 'low',
  },
  RED_MANUAL: {
    icon: '\u26D4', // stop
    bg: '#7f1d1d',
    text: '#fecaca',
    label: 'manual review',
  },
};

/**
 * ConfidenceBadge — renders a colored chip with an icon AND color.
 *
 * BRD accessibility requirement (Section 1.5): never rely on color alone.
 * Each band includes a distinct Unicode icon alongside the label.
 */
export function ConfidenceBadge({ band }: ConfidenceBadgeProps) {
  const config = BAND_CONFIG[band] ?? BAND_CONFIG.RED;

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.25rem 0.625rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    backgroundColor: config.bg,
    color: config.text,
    letterSpacing: '0.025em',
    whiteSpace: 'nowrap',
  };

  return (
    <span
      style={style}
      aria-label={`Confidence: ${band}`}
      role="status"
      tabIndex={0}
    >
      <span aria-hidden="true">{config.icon}</span>
      {band}
    </span>
  );
}
