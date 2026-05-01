import { Injectable, Logger } from '@nestjs/common';
import { RawEmail, SecurityVerdicts } from '../types';

/**
 * Spam & phishing processor (FR-002).
 * Evaluates email security headers and content for phishing/spam signals.
 */
@Injectable()
export class SpamProcessor {
  private readonly logger = new Logger(SpamProcessor.name);

  // Known spam denylist patterns
  private readonly denylistPatterns = [
    /no-?reply@/i,
    /spam/i,
    /phishing-test/i,
  ];

  // Phishing signal keywords
  private readonly phishingKeywords = [
    'click here immediately',
    'verify your account',
    'suspended',
    'lottery',
    'congratulations you won',
    'urgent wire transfer',
    'confirm your identity',
    'password expired',
  ];

  /**
   * Evaluate security verdicts from email headers.
   */
  evaluateSecurityHeaders(email: RawEmail): SecurityVerdicts {
    const headers = email.headers;

    const spf = headers['authentication-results']?.includes('spf=pass')
      ? 'pass'
      : headers['authentication-results']?.includes('spf=fail')
        ? 'fail'
        : null;

    const dkim = headers['authentication-results']?.includes('dkim=pass')
      ? 'pass'
      : headers['authentication-results']?.includes('dkim=fail')
        ? 'fail'
        : null;

    const dmarc = headers['authentication-results']?.includes('dmarc=pass')
      ? 'pass'
      : headers['authentication-results']?.includes('dmarc=fail')
        ? 'fail'
        : null;

    const phishingScore = this.computePhishingScore(email);
    const spamScore = this.computeSpamScore(email);

    return { spf, dkim, dmarc, phishingScore, spamScore };
  }

  /**
   * Compute phishing score (0.0 - 1.0).
   * >= 0.80 → quarantine
   * >= 0.50 → flag for review
   */
  computePhishingScore(email: RawEmail): number {
    let score = 0;
    const text = `${email.subject} ${email.bodyText || ''}`.toLowerCase();

    // Check phishing keywords
    for (const keyword of this.phishingKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 0.25;
      }
    }

    // Check for suspicious URLs (many hyperlinks)
    const urlCount = (email.bodyHtml || '').match(/href\s*=/gi)?.length || 0;
    if (urlCount > 10) score += 0.2;

    // Check authentication failures
    const headers = email.headers;
    if (headers['authentication-results']?.includes('spf=fail')) score += 0.15;
    if (headers['authentication-results']?.includes('dkim=fail')) score += 0.15;
    if (headers['authentication-results']?.includes('dmarc=fail')) score += 0.2;

    // Check for display name spoofing (From display name different from domain)
    const fromMatch = email.from.match(/<([^>]+)>/);
    if (fromMatch && email.from.split('<')[0].trim().includes('@')) {
      score += 0.15; // Display name contains @ sign — likely spoofing
    }

    return Math.min(score, 1.0);
  }

  /**
   * Compute spam score (0.0 - 1.0).
   */
  computeSpamScore(email: RawEmail): number {
    let score = 0;
    const text = `${email.subject} ${email.bodyText || ''}`.toLowerCase();

    // Check denylist
    for (const pattern of this.denylistPatterns) {
      if (pattern.test(email.from)) {
        score += 0.4;
      }
    }

    // Excessive caps in subject
    const capsRatio =
      (email.subject.match(/[A-Z]/g)?.length || 0) / Math.max(email.subject.length, 1);
    if (capsRatio > 0.7 && email.subject.length > 10) score += 0.2;

    // Spam keywords
    const spamWords = ['unsubscribe', 'bulk mail', 'promotional', 'advertisement'];
    for (const word of spamWords) {
      if (text.includes(word)) score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Check if email is on the denylist (FR-002 business rule).
   */
  isOnDenylist(fromAddress: string, denylist: string[]): boolean {
    const normalised = fromAddress.toLowerCase().trim();
    return denylist.some(
      (entry) => normalised === entry.toLowerCase() || normalised.endsWith(`@${entry.toLowerCase()}`),
    );
  }

  /**
   * Determine if quarantine is needed.
   */
  shouldQuarantine(verdicts: SecurityVerdicts): boolean {
    return verdicts.phishingScore >= 0.8 || verdicts.spamScore >= 0.8;
  }

  /**
   * Determine if review flag is needed.
   */
  shouldFlagForReview(verdicts: SecurityVerdicts): boolean {
    return (
      (verdicts.phishingScore >= 0.5 && verdicts.phishingScore < 0.8) ||
      (verdicts.spamScore >= 0.5 && verdicts.spamScore < 0.8)
    );
  }
}
