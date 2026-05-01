import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LinkRewriteResult {
  originalUrl: string;
  rewrittenUrl: string;
  riskScore: number; // 0-1
  blocked: boolean;
}

@Injectable()
export class LinkProtectionProcessor {
  private readonly logger = new Logger(LinkProtectionProcessor.name);
  private readonly proxyBaseUrl: string;
  private readonly blockedDomains: Set<string> = new Set();

  constructor(private readonly configService: ConfigService) {
    this.proxyBaseUrl = this.configService.get<string>('LINK_PROXY_BASE_URL') || 'https://safe.atlas.internal/redirect';
    // Load blocked domains from env
    const blocked = this.configService.get<string>('BLOCKED_DOMAINS') || '';
    blocked.split(',').filter(Boolean).forEach(d => this.blockedDomains.add(d.trim().toLowerCase()));
  }

  /**
   * Rewrite all URLs in email body to go through the safe redirect proxy.
   */
  rewriteBody(body: string): { rewrittenBody: string; links: LinkRewriteResult[] } {
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
    const links: LinkRewriteResult[] = [];

    const rewrittenBody = body.replace(urlRegex, (url) => {
      const result = this.rewriteUrl(url);
      links.push(result);
      return result.blocked ? '[LINK BLOCKED]' : result.rewrittenUrl;
    });

    return { rewrittenBody, links };
  }

  /**
   * Rewrite a single URL to the safe redirect proxy.
   */
  rewriteUrl(url: string): LinkRewriteResult {
    const riskScore = this.assessRisk(url);
    const domain = this.extractDomain(url);
    const blocked = this.blockedDomains.has(domain) || riskScore > 0.9;

    const encodedUrl = encodeURIComponent(url);
    const rewrittenUrl = blocked ? url : `${this.proxyBaseUrl}?url=${encodedUrl}&t=${Date.now()}`;

    return { originalUrl: url, rewrittenUrl, riskScore, blocked };
  }

  /**
   * Assess the risk score of a URL.
   */
  assessRisk(url: string): number {
    let score = 0;
    const lower = url.toLowerCase();

    // Suspicious patterns
    if (lower.includes('@')) score += 0.3; // URL with @ sign
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(lower)) score += 0.4; // IP address
    if (lower.includes('bit.ly') || lower.includes('tinyurl') || lower.includes('goo.gl')) score += 0.2; // URL shortener
    if (lower.includes('.exe') || lower.includes('.scr') || lower.includes('.bat')) score += 0.5; // Executable
    if (lower.length > 200) score += 0.2; // Very long URL

    return Math.min(score, 1);
  }

  addBlockedDomain(domain: string): void {
    this.blockedDomains.add(domain.toLowerCase());
  }

  removeBlockedDomain(domain: string): void {
    this.blockedDomains.delete(domain.toLowerCase());
  }

  getBlockedDomains(): string[] {
    return Array.from(this.blockedDomains);
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
}
