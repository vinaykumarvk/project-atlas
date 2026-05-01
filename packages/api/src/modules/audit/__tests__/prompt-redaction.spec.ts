import { PromptRedactionService } from '../services/prompt-redaction.service';

describe('PromptRedactionService (FR-123.A2-A3)', () => {
  let service: PromptRedactionService;

  beforeEach(() => {
    service = new PromptRedactionService();
  });

  describe('redactPrompt', () => {
    it('should redact Aadhaar numbers', () => {
      const input = 'Customer Aadhaar is 1234 5678 9012 and their address is Mumbai';
      const result = service.redactPrompt(input);
      expect(result).toContain('[AADHAAR_REDACTED]');
      expect(result).not.toContain('1234 5678 9012');
    });

    it('should redact PAN numbers', () => {
      const input = 'PAN card: ABCDE1234F belongs to customer';
      const result = service.redactPrompt(input);
      expect(result).toContain('[PAN_REDACTED]');
      expect(result).not.toContain('ABCDE1234F');
    });

    it('should redact email addresses', () => {
      const input = 'Contact the customer at john.doe@example.com for details';
      const result = service.redactPrompt(input);
      expect(result).toContain('[EMAIL_REDACTED]');
      expect(result).not.toContain('john.doe@example.com');
    });

    it('should redact Indian phone numbers', () => {
      const input = 'Call +91-9876543210 or 8765432109 for verification';
      const result = service.redactPrompt(input);
      expect(result).toContain('[PHONE_REDACTED]');
      expect(result).not.toContain('9876543210');
    });

    it('should handle prompts with no PII', () => {
      const input = 'Classify this email about property valuation in Mumbai';
      const result = service.redactPrompt(input);
      expect(result).toBe(input);
    });
  });

  describe('redactReport', () => {
    it('should redact PII in nested objects when redacted=true', () => {
      const report = {
        summary: 'Customer ABCDE1234F submitted a request',
        details: {
          contact: 'Email: user@test.com',
          nested: {
            note: 'Called +91-9876543210',
          },
        },
      };

      const result = service.redactReport(report, { redacted: true });
      expect(result.summary).toContain('[PAN_REDACTED]');
      expect(result.details.contact).toContain('[EMAIL_REDACTED]');
      expect(result.details.nested.note).toContain('[PHONE_REDACTED]');
    });

    it('should return original report when redacted=false', () => {
      const report = {
        summary: 'Customer ABCDE1234F submitted a request',
      };

      const result = service.redactReport(report, { redacted: false });
      expect(result).toBe(report); // same reference, not redacted
    });

    it('should not modify the original report object', () => {
      const report = {
        summary: 'PAN: ABCDE1234F',
      };

      const result = service.redactReport(report, { redacted: true });
      expect(report.summary).toBe('PAN: ABCDE1234F'); // original unchanged
      expect(result.summary).toContain('[PAN_REDACTED]');
    });
  });
});
