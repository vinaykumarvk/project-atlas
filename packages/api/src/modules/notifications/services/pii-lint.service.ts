import { Injectable, Logger } from '@nestjs/common';

/**
 * A single PII finding detected in a text scan.
 */
export interface PiiFinding {
  type: 'aadhaar' | 'pan' | 'email' | 'phone';
  pattern: string;
  position: number;
}

/**
 * Result of a PII scan on a text string.
 */
export interface PiiScanResult {
  hasPii: boolean;
  findings: PiiFinding[];
}

/**
 * FR-053.A3: PII Lint Service.
 *
 * Scans outbound text (e.g. reply drafts) for PII patterns before sending.
 * Detects:
 * - Aadhaar numbers (12 consecutive digits, optionally space/dash separated in groups of 4)
 * - PAN card numbers (ABCDE1234F pattern)
 * - Email addresses
 * - Phone numbers (10+ consecutive digits, optionally prefixed with +)
 */
@Injectable()
export class PiiLintService {
  private readonly logger = new Logger(PiiLintService.name);

  /**
   * Scan text for PII patterns.
   */
  scanForPii(text: string): PiiScanResult {
    const findings: PiiFinding[] = [];

    // Aadhaar: 12 consecutive digits (with optional spaces/dashes in groups of 4)
    const aadhaarRegex = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
    let match: RegExpExecArray | null;
    while ((match = aadhaarRegex.exec(text)) !== null) {
      const digitsOnly = match[0].replace(/[\s-]/g, '');
      if (digitsOnly.length === 12) {
        findings.push({
          type: 'aadhaar',
          pattern: match[0],
          position: match.index,
        });
      }
    }

    // PAN: 5 uppercase letters + 4 digits + 1 uppercase letter
    const panRegex = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
    while ((match = panRegex.exec(text)) !== null) {
      findings.push({
        type: 'pan',
        pattern: match[0],
        position: match.index,
      });
    }

    // Email addresses
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    while ((match = emailRegex.exec(text)) !== null) {
      findings.push({
        type: 'email',
        pattern: match[0],
        position: match.index,
      });
    }

    // Phone numbers: 10+ digits, optionally prefixed by +
    const phoneRegex = /\+?\d[\d\s-]{8,}\d/g;
    while ((match = phoneRegex.exec(text)) !== null) {
      const digitsOnly = match[0].replace(/[\s+-]/g, '');
      if (digitsOnly.length >= 10) {
        findings.push({
          type: 'phone',
          pattern: match[0],
          position: match.index,
        });
      }
    }

    const result: PiiScanResult = {
      hasPii: findings.length > 0,
      findings,
    };

    if (result.hasPii) {
      this.logger.warn(
        `PII detected in outbound text: ${findings.length} finding(s) — types: ${[...new Set(findings.map((f) => f.type))].join(', ')}`,
      );
    }

    return result;
  }
}
