import { PiiLintService } from '../services/pii-lint.service';

describe('PiiLintService', () => {
  let service: PiiLintService;

  beforeEach(() => {
    service = new PiiLintService();
  });

  describe('Aadhaar detection', () => {
    it('should detect 12 consecutive digits as Aadhaar', () => {
      const result = service.scanForPii('My Aadhaar is 123456789012');
      expect(result.hasPii).toBe(true);
      const aadhaarFindings = result.findings.filter((f) => f.type === 'aadhaar');
      expect(aadhaarFindings.length).toBeGreaterThan(0);
    });

    it('should detect space-separated Aadhaar (1234 5678 9012)', () => {
      const result = service.scanForPii('Aadhaar: 1234 5678 9012');
      expect(result.hasPii).toBe(true);
      const aadhaarFindings = result.findings.filter((f) => f.type === 'aadhaar');
      expect(aadhaarFindings.length).toBeGreaterThan(0);
    });

    it('should detect dash-separated Aadhaar (1234-5678-9012)', () => {
      const result = service.scanForPii('Aadhaar: 1234-5678-9012');
      expect(result.hasPii).toBe(true);
      const aadhaarFindings = result.findings.filter((f) => f.type === 'aadhaar');
      expect(aadhaarFindings.length).toBeGreaterThan(0);
    });
  });

  describe('PAN detection', () => {
    it('should detect PAN card number (ABCDE1234F)', () => {
      const result = service.scanForPii('PAN: ABCDE1234F');
      expect(result.hasPii).toBe(true);
      const panFindings = result.findings.filter((f) => f.type === 'pan');
      expect(panFindings.length).toBe(1);
      expect(panFindings[0].pattern).toBe('ABCDE1234F');
    });

    it('should detect different valid PAN patterns', () => {
      const result = service.scanForPii('BXYPK9876Q is my PAN');
      expect(result.hasPii).toBe(true);
      const panFindings = result.findings.filter((f) => f.type === 'pan');
      expect(panFindings.length).toBe(1);
    });

    it('should not detect lowercase as PAN', () => {
      const result = service.scanForPii('abcde1234f is not a PAN');
      const panFindings = result.findings.filter((f) => f.type === 'pan');
      expect(panFindings.length).toBe(0);
    });
  });

  describe('Email detection', () => {
    it('should detect email addresses', () => {
      const result = service.scanForPii('Contact john.doe@example.com for info');
      expect(result.hasPii).toBe(true);
      const emailFindings = result.findings.filter((f) => f.type === 'email');
      expect(emailFindings.length).toBe(1);
      expect(emailFindings[0].pattern).toBe('john.doe@example.com');
    });

    it('should detect multiple email addresses', () => {
      const result = service.scanForPii('Email a@b.com and c@d.org');
      const emailFindings = result.findings.filter((f) => f.type === 'email');
      expect(emailFindings.length).toBe(2);
    });
  });

  describe('Phone number detection', () => {
    it('should detect 10+ digit phone numbers', () => {
      const result = service.scanForPii('Call 9876543210 now');
      expect(result.hasPii).toBe(true);
      const phoneFindings = result.findings.filter((f) => f.type === 'phone');
      expect(phoneFindings.length).toBe(1);
    });

    it('should detect phone with country code prefix', () => {
      const result = service.scanForPii('Phone: +919876543210');
      expect(result.hasPii).toBe(true);
      const phoneFindings = result.findings.filter((f) => f.type === 'phone');
      expect(phoneFindings.length).toBeGreaterThan(0);
    });
  });

  describe('No PII', () => {
    it('should return hasPii=false when no PII is found', () => {
      const result = service.scanForPii('This is a clean text without any PII');
      expect(result.hasPii).toBe(false);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Multiple PII types', () => {
    it('should detect multiple PII types in the same text', () => {
      const result = service.scanForPii(
        'PAN: ABCDE1234F, email: test@example.com, phone: 9876543210',
      );
      expect(result.hasPii).toBe(true);
      const types = result.findings.map((f) => f.type);
      expect(types).toContain('pan');
      expect(types).toContain('email');
    });

    it('should include correct positions for findings', () => {
      const text = 'PAN is ABCDE1234F here';
      const result = service.scanForPii(text);
      const panFinding = result.findings.find((f) => f.type === 'pan');
      expect(panFinding).toBeDefined();
      expect(panFinding!.position).toBe(text.indexOf('ABCDE1234F'));
    });
  });
});
