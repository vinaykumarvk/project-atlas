import { Injectable, Logger } from '@nestjs/common';

/**
 * Sender Domain Service.
 * Reads domain-to-priority mappings from the SENDER_DOMAIN_RULES environment variable
 * and provides domain-based priority overrides for incoming emails.
 *
 * The env var should be a JSON string, e.g.:
 *   {"legal.client.com":"CRITICAL","compliance.client.com":"HIGH"}
 */
@Injectable()
export class SenderDomainService {
  private readonly logger = new Logger(SenderDomainService.name);
  private readonly domainRules: Record<string, string>;

  constructor() {
    const rulesJson = process.env.SENDER_DOMAIN_RULES || '{}';
    try {
      this.domainRules = JSON.parse(rulesJson);
      const ruleCount = Object.keys(this.domainRules).length;
      if (ruleCount > 0) {
        this.logger.log(`Loaded ${ruleCount} sender domain rules`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to parse SENDER_DOMAIN_RULES env var: ${(error as Error).message}. Using empty rules.`,
      );
      this.domainRules = {};
    }
  }

  /**
   * Check if the sender's email domain matches a priority rule.
   * Extracts the domain from the email address and looks up
   * the domain-to-priority mapping.
   *
   * @param emailAddress - Full email address (e.g., "user@legal.client.com")
   * @returns The matched priority string or null if no rule matches
   */
  checkDomain(emailAddress: string): string | null {
    if (!emailAddress || !emailAddress.includes('@')) {
      return null;
    }

    const domain = emailAddress.split('@')[1]?.toLowerCase();
    if (!domain) {
      return null;
    }

    // Check for exact domain match (case-insensitive)
    for (const [ruleDomain, priority] of Object.entries(this.domainRules)) {
      if (domain === ruleDomain.toLowerCase()) {
        this.logger.debug(
          `Sender domain rule matched: ${domain} -> ${priority}`,
        );
        return priority;
      }
    }

    return null;
  }

  /**
   * Get all configured domain rules (for debugging/admin).
   */
  getRules(): Record<string, string> {
    return { ...this.domainRules };
  }
}
