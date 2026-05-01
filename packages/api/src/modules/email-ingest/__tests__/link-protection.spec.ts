import { LinkProtectionProcessor, LinkRewriteResult } from '../processors/link-protection.processor';

describe('LinkProtectionProcessor', () => {
  let processor: LinkProtectionProcessor;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'LINK_PROXY_BASE_URL') return 'https://safe.atlas.internal/redirect';
        if (key === 'BLOCKED_DOMAINS') return 'malware.com,phishing.net';
        return undefined;
      }),
    };
    processor = new LinkProtectionProcessor(mockConfigService);
  });

  describe('constructor', () => {
    it('should load proxy base URL from config', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('LINK_PROXY_BASE_URL');
    });

    it('should load blocked domains from config', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('BLOCKED_DOMAINS');
      expect(processor.getBlockedDomains()).toContain('malware.com');
      expect(processor.getBlockedDomains()).toContain('phishing.net');
    });

    it('should use default proxy URL when config is empty', () => {
      const emptyConfig = { get: jest.fn().mockReturnValue(undefined) };
      const proc = new LinkProtectionProcessor(emptyConfig as any);
      const result = proc.rewriteUrl('https://example.com');
      expect(result.rewrittenUrl).toContain('https://safe.atlas.internal/redirect');
    });

    it('should handle empty blocked domains string', () => {
      const emptyConfig = { get: jest.fn().mockReturnValue('') };
      const proc = new LinkProtectionProcessor(emptyConfig as any);
      expect(proc.getBlockedDomains()).toEqual([]);
    });
  });

  describe('rewriteUrl', () => {
    it('should rewrite a safe URL through the proxy', () => {
      const result = processor.rewriteUrl('https://example.com/page');
      expect(result.rewrittenUrl).toContain('https://safe.atlas.internal/redirect?url=');
      expect(result.rewrittenUrl).toContain(encodeURIComponent('https://example.com/page'));
      expect(result.blocked).toBe(false);
    });

    it('should preserve the original URL in the result', () => {
      const result = processor.rewriteUrl('https://example.com/page');
      expect(result.originalUrl).toBe('https://example.com/page');
    });

    it('should include a timestamp parameter', () => {
      const result = processor.rewriteUrl('https://example.com');
      expect(result.rewrittenUrl).toMatch(/&t=\d+$/);
    });

    it('should block URLs from blocked domains', () => {
      const result = processor.rewriteUrl('https://malware.com/payload');
      expect(result.blocked).toBe(true);
    });

    it('should block URLs with risk score above 0.9', () => {
      // IP-based URL with executable and @ sign: 0.4 + 0.5 + 0.3 = 1.0
      const result = processor.rewriteUrl('http://user@192.168.1.1/file.exe');
      expect(result.blocked).toBe(true);
      expect(result.riskScore).toBeGreaterThan(0.9);
    });
  });

  describe('assessRisk', () => {
    it('should return 0 for a clean URL', () => {
      const score = processor.assessRisk('https://example.com/page');
      expect(score).toBe(0);
    });

    it('should increase risk for URLs with @ sign', () => {
      const score = processor.assessRisk('https://user@evil.com');
      expect(score).toBeGreaterThanOrEqual(0.3);
    });

    it('should increase risk for IP-based URLs', () => {
      const score = processor.assessRisk('http://192.168.1.1/admin');
      expect(score).toBeGreaterThanOrEqual(0.4);
    });

    it('should increase risk for URL shorteners', () => {
      const scoreBitly = processor.assessRisk('https://bit.ly/abc123');
      const scoreTinyurl = processor.assessRisk('https://tinyurl.com/xyz');
      const scoreGoogl = processor.assessRisk('https://goo.gl/short');
      expect(scoreBitly).toBeGreaterThanOrEqual(0.2);
      expect(scoreTinyurl).toBeGreaterThanOrEqual(0.2);
      expect(scoreGoogl).toBeGreaterThanOrEqual(0.2);
    });

    it('should increase risk for executable file extensions', () => {
      const scoreExe = processor.assessRisk('https://example.com/file.exe');
      const scoreScr = processor.assessRisk('https://example.com/file.scr');
      const scoreBat = processor.assessRisk('https://example.com/file.bat');
      expect(scoreExe).toBeGreaterThanOrEqual(0.5);
      expect(scoreScr).toBeGreaterThanOrEqual(0.5);
      expect(scoreBat).toBeGreaterThanOrEqual(0.5);
    });

    it('should increase risk for very long URLs', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(200);
      const score = processor.assessRisk(longUrl);
      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    it('should cap risk score at 1.0', () => {
      // Combine multiple risk factors
      const riskyUrl = 'http://user@192.168.1.1/file.exe?q=' + 'a'.repeat(200);
      const score = processor.assessRisk(riskyUrl);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should accumulate multiple risk factors', () => {
      const combined = processor.assessRisk('http://user@192.168.1.1/payload');
      const atOnly = processor.assessRisk('https://user@example.com/page');
      expect(combined).toBeGreaterThan(atOnly);
    });
  });

  describe('rewriteBody', () => {
    it('should rewrite all URLs in email body', () => {
      const body = 'Visit https://example.com and http://test.org for more info.';
      const { rewrittenBody, links } = processor.rewriteBody(body);

      expect(links).toHaveLength(2);
      expect(rewrittenBody).toContain('https://safe.atlas.internal/redirect');
      expect(rewrittenBody).not.toContain('https://example.com');
      expect(rewrittenBody).not.toContain('http://test.org');
    });

    it('should replace blocked URLs with [LINK BLOCKED]', () => {
      const body = 'Check this: https://malware.com/payload';
      const { rewrittenBody, links } = processor.rewriteBody(body);

      expect(rewrittenBody).toContain('[LINK BLOCKED]');
      expect(links[0].blocked).toBe(true);
    });

    it('should handle body with no URLs', () => {
      const body = 'This is a plain text email with no links.';
      const { rewrittenBody, links } = processor.rewriteBody(body);

      expect(rewrittenBody).toBe(body);
      expect(links).toHaveLength(0);
    });

    it('should handle body with mixed safe and blocked URLs', () => {
      const body = 'Safe: https://example.com Bad: https://phishing.net/steal';
      const { rewrittenBody, links } = processor.rewriteBody(body);

      expect(links).toHaveLength(2);
      const safeLink = links.find(l => l.originalUrl.includes('example.com'));
      const badLink = links.find(l => l.originalUrl.includes('phishing.net'));
      expect(safeLink!.blocked).toBe(false);
      expect(badLink!.blocked).toBe(true);
      expect(rewrittenBody).toContain('[LINK BLOCKED]');
      expect(rewrittenBody).toContain('https://safe.atlas.internal/redirect');
    });

    it('should handle empty body', () => {
      const { rewrittenBody, links } = processor.rewriteBody('');
      expect(rewrittenBody).toBe('');
      expect(links).toHaveLength(0);
    });
  });

  describe('domain management', () => {
    it('should add a blocked domain', () => {
      processor.addBlockedDomain('evil.org');
      expect(processor.getBlockedDomains()).toContain('evil.org');
    });

    it('should remove a blocked domain', () => {
      processor.removeBlockedDomain('malware.com');
      expect(processor.getBlockedDomains()).not.toContain('malware.com');
    });

    it('should normalize domains to lowercase', () => {
      processor.addBlockedDomain('EVIL.ORG');
      expect(processor.getBlockedDomains()).toContain('evil.org');
    });

    it('should list all blocked domains', () => {
      const domains = processor.getBlockedDomains();
      expect(domains.length).toBeGreaterThanOrEqual(2);
    });

    it('should block URLs from dynamically added domains', () => {
      processor.addBlockedDomain('newbad.com');
      const result = processor.rewriteUrl('https://newbad.com/page');
      expect(result.blocked).toBe(true);
    });
  });
});
