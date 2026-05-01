import type { CSSProperties } from 'react';

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

const PRIORITY_CONFIG: Record<Priority, { color: string; label: string }> = {
  P1: { color: '#dc2626', label: 'P1 - Critical' },
  P2: { color: '#ea580c', label: 'P2 - High' },
  P3: { color: '#ca8a04', label: 'P3 - Medium' },
  P4: { color: '#16a34a', label: 'P4 - Low' },
};

interface PriorityIndicatorProps {
  priority: Priority;
  showLabel?: boolean;
}

export function PriorityIndicator({ priority, showLabel = false }: PriorityIndicatorProps) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.P3;

  const containerStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
  };

  const dotStyle: CSSProperties = {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: config.color,
    flexShrink: 0,
  };

  const labelStyle: CSSProperties = {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: config.color,
  };

  return (
    <span style={containerStyle}>
      <span style={dotStyle} title={config.label} />
      {showLabel && <span style={labelStyle}>{config.label}</span>}
      {!showLabel && <span style={labelStyle}>{priority}</span>}
    </span>
  );
}
