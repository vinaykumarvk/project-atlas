import { PiiRedactionService } from '../services/pii-redaction.service';

describe('PiiRedactionService', () => {
  let service: PiiRedactionService;

  beforeEach(() => {
    service = new PiiRedactionService();
  });

  // ─────────────────────────────────────────────────────────
  // Indian PAN card redaction
  // ─────────────────────────────────────────────────────────

  describe('PAN card redaction', () => {
    it('should redact a valid PAN number (ABCDE1234F pattern)', () => {
      const result = service.redact({ pan: 'ABCDE1234F' });
      expect(result.pan).not.toContain('ABCDE1234F');
      expect(result.pan).toContain('[REDACTED:pan:');
    });

    it('should redact PAN embedded in text', () => {
      const result = service.redact({
        note: 'Customer PAN is BXYPK5678R and submitted docs',
      });
      expect(result.note).not.toContain('BXYPK5678R');
      expect(result.note).toContain('[REDACTED:');
    });

    it('should not redact a string that does not match PAN format', () => {
      const result = service.redact({ text: 'HELLO' });
      expect(result.text).toBe('HELLO');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Aadhaar (12-digit) redaction
  // ─────────────────────────────────────────────────────────

  describe('Aadhaar redaction', () => {
    it('should redact 12-digit Aadhaar with spaces', () => {
      const result = service.redact({ id: 'Aadhaar: 1234 5678 9012' });
      expect(result.id).not.toContain('1234 5678 9012');
      expect(result.id).toContain('[REDACTED:aadhaar:');
    });

    it('should redact 12-digit Aadhaar with dashes', () => {
      const result = service.redact({ id: '1234-5678-9012' });
      expect(result.id).not.toContain('1234-5678-9012');
      expect(result.id).toContain('[REDACTED:aadhaar:');
    });

    it('should redact contiguous 12-digit Aadhaar', () => {
      const result = service.redact({ id: '123456789012' });
      expect(result.id).not.toContain('123456789012');
      expect(result.id).toContain('[REDACTED:aadhaar:');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Indian phone number (+91) redaction
  // ─────────────────────────────────────────────────────────

  describe('Indian phone number redaction', () => {
    it('should redact +91 prefixed number', () => {
      const result = service.redact({ phone: 'Call +91 9876543210' });
      expect(result.phone).not.toContain('9876543210');
      expect(result.phone).toContain('[REDACTED:phone_in:');
    });

    it('should redact +91 without space', () => {
      const result = service.redact({ phone: '+919876543210' });
      expect(result.phone).not.toContain('9876543210');
      expect(result.phone).toContain('[REDACTED:phone_in:');
    });

    it('should redact 0-prefixed number', () => {
      const result = service.redact({ phone: '09876543210' });
      expect(result.phone).not.toContain('9876543210');
      expect(result.phone).toContain('[REDACTED:phone_in:');
    });

    it('should redact bare 10-digit Indian number starting with 6-9', () => {
      const result = service.redact({ phone: '7654321098' });
      expect(result.phone).not.toContain('7654321098');
      expect(result.phone).toContain('[REDACTED:phone_in:');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Email redaction
  // ─────────────────────────────────────────────────────────

  describe('email redaction', () => {
    it('should redact standard email addresses', () => {
      const result = service.redact({
        contact: 'john.doe@example.com',
      });
      expect(result.contact).not.toContain('john.doe@example.com');
      expect(result.contact).toContain('[REDACTED:email:');
    });

    it('should redact email embedded in a sentence', () => {
      const result = service.redact({
        msg: 'Please contact user@bank.co.in for more details',
      });
      expect(result.msg).not.toContain('user@bank.co.in');
      expect(result.msg).toContain('[REDACTED:email:');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Deep / nested data structures
  // ─────────────────────────────────────────────────────────

  describe('nested data handling', () => {
    it('should redact PII in deeply nested objects', () => {
      const data = {
        level1: {
          level2: {
            email: 'deep@nested.com',
            pan: 'XYZAB1234C',
          },
        },
      };
      const redacted = service.redact(data);
      expect(redacted.level1.level2.email).toContain('[REDACTED:email:');
      expect(redacted.level1.level2.pan).toContain('[REDACTED:');
    });

    it('should redact PII in arrays', () => {
      const data = {
        phones: ['+919876543210', '09123456789'],
      };
      const redacted = service.redact(data);
      expect(redacted.phones[0]).toContain('[REDACTED:phone_in:');
      expect(redacted.phones[1]).toContain('[REDACTED:phone_in:');
    });

    it('should not mutate the original data', () => {
      const original = {
        email: 'original@example.com',
        nested: { pan: 'ABCDE1234F' },
      };
      const copy = JSON.parse(JSON.stringify(original));
      service.redact(original);
      expect(original).toEqual(copy);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Deterministic hashing
  // ─────────────────────────────────────────────────────────

  describe('deterministic redaction', () => {
    it('should produce the same redacted output for the same input', () => {
      const r1 = service.redact({ email: 'test@example.com' });
      const r2 = service.redact({ email: 'test@example.com' });
      expect(r1.email).toBe(r2.email);
    });

    it('should produce different redacted output for different inputs', () => {
      const r1 = service.redact({ email: 'a@example.com' });
      const r2 = service.redact({ email: 'b@example.com' });
      expect(r1.email).not.toBe(r2.email);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Edge cases
  // ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle null values', () => {
      const result = service.redact({ value: null });
      expect(result.value).toBeNull();
    });

    it('should handle undefined values', () => {
      const result = service.redact({ value: undefined });
      expect(result.value).toBeUndefined();
    });

    it('should handle numbers', () => {
      const result = service.redact({ count: 42 });
      expect(result.count).toBe(42);
    });

    it('should handle booleans', () => {
      const result = service.redact({ flag: true });
      expect(result.flag).toBe(true);
    });

    it('should handle empty strings', () => {
      const result = service.redact({ text: '' });
      expect(result.text).toBe('');
    });

    it('should handle strings with multiple PII types', () => {
      const result = service.redact({
        combined:
          'Customer john@example.com, PAN ABCDE1234F, phone +919876543210',
      });
      expect(result.combined).not.toContain('john@example.com');
      expect(result.combined).not.toContain('ABCDE1234F');
      expect(result.combined).not.toContain('9876543210');
    });
  });
});
