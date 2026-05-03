import { useMemo } from 'react';
import { cn } from '@/lib/utils';

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
    <div
      data-testid="draft-diff"
      className="rounded-lg border border-border bg-muted/50 p-3 font-mono leading-relaxed"
    >
      {segments.map((seg, i) => {
        if (seg.type === 'added') {
          return (
            <span
              key={i}
              contentEditable={editable}
              suppressContentEditableWarning
              onBlur={(e) => onEdit?.(e.currentTarget.textContent || '')}
              className={cn(
                'bg-green-200 px-0.5 dark:bg-green-900/50',
                editable && 'cursor-text',
              )}
            >
              {seg.text}
            </span>
          );
        }
        if (seg.type === 'removed') {
          return (
            <span key={i} className="bg-red-200 px-0.5 line-through dark:bg-red-900/50">
              {seg.text}
            </span>
          );
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
