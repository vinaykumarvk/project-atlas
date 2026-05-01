import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

// ───────────────────────────────────────────────────────────
// PII pattern definitions
// ───────────────────────────────────────────────────────────

interface PiiPattern {
  name: string;
  regex: RegExp;
}

/**
 * Patterns we scan for:
 *
 * 1. Email addresses          — standard RFC-5322-ish
 * 2. Indian mobile numbers    — +91 / 0 prefix, 10 digits starting with 6-9
 * 3. Aadhaar-like numbers     — 12 digits (optionally space/dash separated in groups of 4)
 * 4. PAN card numbers         — ABCDE1234F  (5 alpha + 4 digits + 1 alpha)
 * 5. Loan account numbers     — common bank formats: alphanumeric 10-20 chars
 */
const PII_PATTERNS: PiiPattern[] = [
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  },
  {
    name: 'phone_in',
    // Indian mobile: optional +91/0 prefix, then 10 digits starting with 6-9
    regex: /(?:\+91[\s-]?|0)?[6-9]\d{9}\b/g,
  },
  {
    name: 'aadhaar',
    // 12 digits, optionally separated by spaces or dashes in groups of 4
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  },
  {
    name: 'pan',
    // PAN: 5 alpha + 4 digit + 1 alpha  (uppercase)
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  },
  {
    name: 'loan_account',
    // Loan account numbers: typically alphanumeric 10-20 chars starting with letters
    regex: /\b[A-Z]{2,4}\d{8,16}\b/g,
  },
];

// ───────────────────────────────────────────────────────────
// Service
// ───────────────────────────────────────────────────────────

@Injectable()
export class PiiRedactionService {
  private readonly logger = new Logger(PiiRedactionService.name);

  /**
   * Deterministic SHA-256 hash of a PII value.
   * Uses a static salt so the same input always yields the same output,
   * enabling correlation without exposing raw PII.
   */
  hashPii(value: string): string {
    return createHash('sha256')
      .update(`atlas:pii:${value}`)
      .digest('hex');
  }

  /**
   * Deep-clone `data` and replace any PII matches with their
   * deterministic SHA-256 hashes.  The original object is NOT mutated.
   *
   * Supports strings, arrays, and nested plain objects.
   */
  redact<T>(data: T): T {
    return this.redactValue(data) as T;
  }

  // ─────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────

  private redactValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.redactString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactValue(item));
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = this.redactValue(val);
      }
      return result;
    }

    // numbers, booleans, null, undefined — pass through
    return value;
  }

  private redactString(input: string): string {
    let output = input;

    for (const pattern of PII_PATTERNS) {
      // Reset lastIndex because we reuse the global regex
      pattern.regex.lastIndex = 0;
      output = output.replace(pattern.regex, (match) => {
        const hash = this.hashPii(match);
        return `[REDACTED:${pattern.name}:${hash.substring(0, 12)}]`;
      });
    }

    return output;
  }
}
