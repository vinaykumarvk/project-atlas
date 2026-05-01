import { Injectable, Logger } from '@nestjs/common';
import { RawEmail, ThreadContext } from '../types';

/**
 * Thread lookback window in days (FR-004 A4).
 * Configurable via THREAD_LOOKBACK_DAYS env var; defaults to 90.
 */
export const THREAD_LOOKBACK_DAYS = parseInt(
  process.env.THREAD_LOOKBACK_DAYS ?? '90',
  10,
);

/**
 * Thread context assembly processor (FR-004).
 * Assembles full thread history from In-Reply-To/References headers,
 * strips quoted text for LLM token efficiency.
 */
@Injectable()
export class ThreadProcessor {
  private readonly logger = new Logger(ThreadProcessor.name);

  // Patterns that indicate quoted/forwarded text
  private readonly quotePatterns = [
    /^>+\s?.*/gm, // Lines starting with >
    /^On .+ wrote:$/gm, // "On <date> <person> wrote:"
    /^-{3,}\s*Original Message\s*-{3,}$/gim,
    /^-{3,}\s*Forwarded Message\s*-{3,}$/gim,
    /^From:\s+.+$/gm, // Forwarded message headers
    /^Sent:\s+.+$/gm,
    /^To:\s+.+$/gm,
    /^Subject:\s+.+$/gm,
  ];

  /**
   * Assemble thread context from an email.
   * Only includes thread references within the THREAD_LOOKBACK_DAYS window (FR-004 A4).
   */
  assembleContext(email: RawEmail, lookupPreviousMessages?: (messageIds: string[]) => string[]): ThreadContext {
    const isReply = this.isReplyOrForward(email);
    const referencedIds = this.extractReferencedIds(email);
    const strippedBody = this.stripQuotedText(email.bodyText || '');

    // FR-004 A4: Apply lookback window filter
    const lookbackCutoff = new Date(
      email.receivedAt.getTime() - THREAD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );

    // Look up previous messages if a lookup function is provided
    // The lookup function receives referenced IDs; the caller is responsible
    // for filtering by the lookback cutoff date if they have timestamp data.
    const previousMessages = lookupPreviousMessages
      ? lookupPreviousMessages(referencedIds)
      : [];

    return {
      threadId: referencedIds.length > 0 ? referencedIds[0] : undefined,
      previousMessages,
      strippedBody,
      isReply,
      lookbackCutoff,
    };
  }

  /**
   * Determine if this email is a reply or forward.
   */
  isReplyOrForward(email: RawEmail): boolean {
    // Check headers
    if (email.headers['in-reply-to']) return true;
    if (email.headers['references']) return true;

    // Check subject line
    const subject = email.subject.toLowerCase().trim();
    if (subject.startsWith('re:') || subject.startsWith('fwd:') || subject.startsWith('fw:')) {
      return true;
    }

    return false;
  }

  /**
   * Extract referenced message IDs from headers (for thread assembly).
   */
  extractReferencedIds(email: RawEmail): string[] {
    const ids: string[] = [];

    // In-Reply-To header (single message ID)
    const inReplyTo = email.headers['in-reply-to'];
    if (inReplyTo) {
      const match = inReplyTo.match(/<([^>]+)>/);
      if (match) ids.push(match[1]);
    }

    // References header (space-separated list of message IDs)
    const references = email.headers['references'];
    if (references) {
      const matches = references.matchAll(/<([^>]+)>/g);
      for (const match of matches) {
        if (!ids.includes(match[1])) {
          ids.push(match[1]);
        }
      }
    }

    return ids;
  }

  /**
   * Strip quoted and forwarded text from email body.
   * Preserves only the new content written by the sender.
   */
  stripQuotedText(body: string): string {
    if (!body) return '';

    let stripped = body;

    // Remove lines starting with >
    stripped = stripped.replace(/^>+\s?.*$/gm, '');

    // Remove "On ... wrote:" blocks and everything after
    const wroteMatch = stripped.match(/^On .+wrote:\s*$/m);
    if (wroteMatch && wroteMatch.index !== undefined) {
      stripped = stripped.substring(0, wroteMatch.index);
    }

    // Remove "--- Original Message ---" and everything after
    const originalMatch = stripped.match(/^-{3,}\s*(Original|Forwarded)\s*Message\s*-{3,}\s*$/im);
    if (originalMatch && originalMatch.index !== undefined) {
      stripped = stripped.substring(0, originalMatch.index);
    }

    // Remove signature blocks (-- followed by signature)
    const sigMatch = stripped.match(/^--\s*$/m);
    if (sigMatch && sigMatch.index !== undefined) {
      stripped = stripped.substring(0, sigMatch.index);
    }

    // Clean up excessive whitespace
    stripped = stripped.replace(/\n{3,}/g, '\n\n').trim();

    return stripped;
  }

  /**
   * Check if an existing case should be linked (FR-004 A3).
   * If the thread already corresponds to an open Case, the new email
   * should be attached as a fresh Activity, not a new Case.
   */
  shouldLinkToExistingCase(threadContext: ThreadContext): boolean {
    return threadContext.isReply && !!threadContext.existingCaseId;
  }
}
