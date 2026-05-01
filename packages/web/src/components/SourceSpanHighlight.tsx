import { useState, type CSSProperties, type ReactNode } from 'react';

interface SourceSpanHighlightProps {
  /** The text to display */
  children: ReactNode;
  /** Label shown in the tooltip (default "Source") */
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
  const [hovered, setHovered] = useState(false);

  const baseStyle: CSSProperties = {
    position: 'relative',
    display: 'inline',
    cursor: 'default',
    borderRadius: '2px',
    transition: 'background-color 0.15s',
    backgroundColor: hovered ? '#fef08a' : 'transparent',
  };

  const tooltipStyle: CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    backgroundColor: '#1e293b',
    color: '#fff',
    fontSize: '0.7rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    marginBottom: '4px',
    zIndex: 10,
  };

  return (
    <span
      style={baseStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid="source-span"
    >
      {children}
      {hovered && (
        <span style={tooltipStyle} data-testid="source-tooltip">
          {sourceLabel}
        </span>
      )}
    </span>
  );
}
