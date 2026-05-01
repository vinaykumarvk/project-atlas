import { useMemo } from 'react';

interface DraftDiffProps {
  original: string;
  edited: string;
  editable?: boolean;
  onEdit?: (newText: string) => void;
}

interface DiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

export function DraftDiff({ original, edited, editable, onEdit }: DraftDiffProps) {
  const segments = useMemo(() => computeWordDiff(original, edited), [original, edited]);

  return (
    <div data-testid="draft-diff" style={{ fontFamily: 'monospace', lineHeight: 1.6, padding: 12, backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
      {segments.map((seg, i) => {
        if (seg.type === 'added') {
          return (
            <span
              key={i}
              contentEditable={editable}
              suppressContentEditableWarning
              onBlur={(e) => onEdit?.(e.currentTarget.textContent || '')}
              style={{ backgroundColor: '#bbf7d0', textDecoration: 'none', padding: '1px 2px', cursor: editable ? 'text' : 'default' }}
            >
              {seg.text}
            </span>
          );
        }
        if (seg.type === 'removed') {
          return <span key={i} style={{ backgroundColor: '#fecaca', textDecoration: 'line-through', padding: '1px 2px' }}>{seg.text}</span>;
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </div>
  );
}

export function computeWordDiff(original: string, edited: string): DiffSegment[] {
  const originalWords = original.split(/(\s+)/);
  const editedWords = edited.split(/(\s+)/);
  const segments: DiffSegment[] = [];

  let i = 0;
  let j = 0;

  while (i < originalWords.length || j < editedWords.length) {
    if (i < originalWords.length && j < editedWords.length && originalWords[i] === editedWords[j]) {
      segments.push({ type: 'unchanged', text: originalWords[i] });
      i++;
      j++;
    } else if (j < editedWords.length && (i >= originalWords.length || !editedWords.slice(j).includes(originalWords[i]))) {
      segments.push({ type: 'added', text: editedWords[j] });
      j++;
    } else if (i < originalWords.length) {
      segments.push({ type: 'removed', text: originalWords[i] });
      i++;
    }
  }

  return segments;
}
