import type { CSSProperties } from 'react';

interface SlaProgressBarProps {
  /** Percentage of SLA time remaining (0-100) */
  remainingPercent: number;
  /** Optional label to display */
  label?: string;
}

function getBarColor(percent: number): string {
  if (percent > 50) return '#16a34a'; // green
  if (percent > 20) return '#ca8a04'; // amber
  return '#dc2626'; // red
}

function getBackgroundColor(percent: number): string {
  if (percent > 50) return '#dcfce7';
  if (percent > 20) return '#fef9c3';
  return '#fee2e2';
}

export function SlaProgressBar({ remainingPercent, label }: SlaProgressBarProps) {
  const clampedPercent = Math.max(0, Math.min(100, remainingPercent));
  const barColor = getBarColor(clampedPercent);
  const bgColor = getBackgroundColor(clampedPercent);

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    width: '100%',
  };

  const labelRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: '#64748b',
  };

  const trackStyle: CSSProperties = {
    width: '100%',
    height: '8px',
    borderRadius: '4px',
    backgroundColor: bgColor,
    overflow: 'hidden',
  };

  const fillStyle: CSSProperties = {
    width: `${clampedPercent}%`,
    height: '100%',
    borderRadius: '4px',
    backgroundColor: barColor,
    transition: 'width 0.3s ease',
  };

  return (
    <div style={containerStyle}>
      {label && (
        <div style={labelRowStyle}>
          <span>{label}</span>
          <span>{clampedPercent}% remaining</span>
        </div>
      )}
      <div style={trackStyle}>
        <div style={fillStyle} />
      </div>
    </div>
  );
}
