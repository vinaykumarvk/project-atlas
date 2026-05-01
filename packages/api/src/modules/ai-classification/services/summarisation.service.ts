import { Injectable } from '@nestjs/common';
import { SummarisationResult } from '../types';

/**
 * Email summarisation service.
 * For emails exceeding the length threshold, produces a 3-bullet summary.
 * Uses extractive summarisation (sentence extraction) as a mock implementation.
 */
@Injectable()
export class SummarisationService {
  private readonly lengthThreshold = 1500;

  /**
   * Determine if an email needs summarisation.
   */
  needsSummary(text: string): boolean {
    return text.length > this.lengthThreshold;
  }

  /**
   * Summarise email text into 3 bullets:
   * 1. First sentence / opening statement
   * 2. Key entity mention or subject reference
   * 3. Action requested / closing instruction
   */
  summarise(text: string): SummarisationResult {
    // FR-013 A2: Strip HTML tags before summarisation
    text = this.stripHtml(text);

    if (!this.needsSummary(text)) {
      return {
        bullets: [text.substring(0, 200).trim()],
        source_spans: [{ start: 0, end: Math.min(200, text.length) }],
      };
    }

    const bullets: string[] = [];
    const sourceSpans: { start: number; end: number }[] = [];

    // Bullet 1: First meaningful sentence
    const firstSentence = this.extractFirstSentence(text);
    bullets.push(firstSentence.text);
    sourceSpans.push(firstSentence.span);

    // Bullet 2: Key entity mention or subject context
    const entityMention = this.extractKeyEntityMention(text);
    bullets.push(entityMention.text);
    sourceSpans.push(entityMention.span);

    // Bullet 3: Action requested
    const actionRequested = this.extractActionRequested(text);
    bullets.push(actionRequested.text);
    sourceSpans.push(actionRequested.span);

    return { bullets, source_spans: sourceSpans };
  }

  /**
   * Extract the first meaningful sentence from the text.
   */
  private extractFirstSentence(text: string): { text: string; span: { start: number; end: number } } {
    // Skip salutation lines
    const lines = text.split('\n');
    let startOffset = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        startOffset += line.length + 1;
        continue;
      }
      // Skip common salutations
      if (/^(dear|hi|hello|respected|sir|madam|good\s+(morning|afternoon|evening))/i.test(trimmed)) {
        startOffset += line.length + 1;
        continue;
      }
      break;
    }

    // Find the first sentence ending
    const remainingText = text.substring(startOffset);
    const sentenceEnd = remainingText.search(/[.!?]\s|[.!?]$/);
    const endIdx = sentenceEnd > 0 ? sentenceEnd + 1 : Math.min(150, remainingText.length);
    const sentence = remainingText.substring(0, endIdx).trim();

    return {
      text: sentence.length > 120 ? sentence.substring(0, 117) + '...' : sentence,
      span: { start: startOffset, end: startOffset + endIdx },
    };
  }

  /**
   * Extract a sentence containing key entity references (loan numbers, names, amounts).
   */
  private extractKeyEntityMention(text: string): { text: string; span: { start: number; end: number } } {
    const entityPatterns = [
      /\b(LN[-\/]\d{4}[-\/]\d{4,8})\b/i,
      /\b(loan\s*(?:account|a\/c|acc)\s*(?:no\.?|number|#)\s*:?\s*\S+)/i,
      /\b(₹\s*[\d,]+|INR\s*[\d,]+|Rs\.?\s*[\d,]+)/i,
      /\b(property\s+(?:at|in|located)\s+[^.]{10,60})/i,
      /\b(Customer\s*:\s*[A-Z][a-zA-Z\s]+)/i,
    ];

    for (const pattern of entityPatterns) {
      const match = pattern.exec(text);
      if (match) {
        // Get surrounding sentence context
        const contextStart = Math.max(0, text.lastIndexOf('.', match.index) + 1);
        const contextEnd = text.indexOf('.', match.index + match[0].length);
        const end = contextEnd > 0 ? contextEnd + 1 : Math.min(text.length, match.index + match[0].length + 50);
        const sentence = text.substring(contextStart, end).trim();

        return {
          text: sentence.length > 120 ? sentence.substring(0, 117) + '...' : sentence,
          span: { start: contextStart, end },
        };
      }
    }

    // Fallback: middle section of text
    const midStart = Math.floor(text.length * 0.3);
    const midSentenceStart = text.indexOf('.', midStart) + 1;
    const start = midSentenceStart > 0 ? midSentenceStart : midStart;
    const sentenceEnd = text.indexOf('.', start + 10);
    const end = sentenceEnd > 0 ? sentenceEnd + 1 : Math.min(text.length, start + 150);
    const midText = text.substring(start, end).trim();

    return {
      text: midText.length > 120 ? midText.substring(0, 117) + '...' : midText,
      span: { start, end },
    };
  }

  /**
   * Extract the action requested or closing instruction from the email.
   */
  private extractActionRequested(text: string): { text: string; span: { start: number; end: number } } {
    const actionPatterns = [
      /\b(please\s+[^.]{10,100}\.)/i,
      /\b(kindly\s+[^.]{10,100}\.)/i,
      /\b(request(?:ed|ing)?\s+(?:you\s+)?to\s+[^.]{10,100}\.)/i,
      /\b(action\s+required\s*:?\s*[^.]{10,100}\.)/i,
      /\b(we\s+need\s+[^.]{10,100}\.)/i,
      /\b((?:could|can|would)\s+you\s+(?:please\s+)?[^.?]{10,100}[.?])/i,
    ];

    for (const pattern of actionPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        return {
          text: match[1].length > 120 ? match[1].substring(0, 117) + '...' : match[1],
          span: { start: matchStart, end: matchEnd },
        };
      }
    }

    // Fallback: last meaningful sentence
    const lines = text.trim().split('\n').filter((l) => l.trim().length > 10);
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      const lastLineStart = text.lastIndexOf(lastLine);
      return {
        text: lastLine.length > 120 ? lastLine.substring(0, 117) + '...' : lastLine,
        span: { start: lastLineStart, end: lastLineStart + lastLine.length },
      };
    }

    return {
      text: 'No specific action identified.',
      span: { start: 0, end: 0 },
    };
  }

  /**
   * Strip HTML tags from input text (FR-013 A2).
   */
  private stripHtml(input: string): string {
    return input.replace(/<[^>]*>/g, '');
  }
}
