import type { ReactNode } from 'react';

/**
 * Parse text for @mentions and return an array of React nodes.
 * Each `@username` token is wrapped in a highlighted <span>.
 * Non-mention text is returned as plain strings.
 *
 * Pattern: `@` followed by one or more word characters (letters, digits, underscores).
 */
export function parseMentions(text: string): ReactNode[] {
  const mentionPattern = /@(\w+)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
    // Push text before the mention
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Push the highlighted mention
    parts.push(
      <span key={`mention-${match.index}`} className="rounded bg-blue-100 px-1 py-0.5 text-[length:inherit] font-semibold text-blue-700" data-testid="mention">
        @{match[1]}
      </span>,
    );

    lastIndex = mentionPattern.lastIndex;
  }

  // Push any remaining text after the last mention
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
