import { FieldExtractorService, ExtractionTemplate } from '../services/field-extractor.service';

describe('FieldExtractorService — versioned extraction templates', () => {
  let service: FieldExtractorService;

  beforeEach(() => {
    service = new FieldExtractorService();
  });

  describe('registerTemplate', () => {
    it('should register a template successfully', () => {
      const template: ExtractionTemplate = {
        version: '1.0.0',
        fields: [
          { name: 'accountNumber', pattern: /account\s*(?:no|number|#)\s*[:\-]?\s*(\w+)/i, required: true },
        ],
        activeFrom: new Date('2024-01-01'),
      };

      service.registerTemplate(template);
      expect(service.getTemplateVersion()).toBe('1.0.0');
    });

    it('should register multiple templates', () => {
      const template1: ExtractionTemplate = {
        version: '1.0.0',
        fields: [{ name: 'field1', pattern: /field1:\s*(.+)/i, required: false }],
        activeFrom: new Date('2024-01-01'),
      };
      const template2: ExtractionTemplate = {
        version: '2.0.0',
        fields: [
          { name: 'field1', pattern: /field1:\s*(.+)/i, required: false },
          { name: 'field2', pattern: /field2:\s*(.+)/i, required: true },
        ],
        activeFrom: new Date('2024-06-01'),
      };

      service.registerTemplate(template1);
      service.registerTemplate(template2);

      // The most recent active template should be returned
      expect(service.getTemplateVersion()).toBe('2.0.0');
    });

    it('should sort templates by activeFrom descending', () => {
      const old: ExtractionTemplate = {
        version: '1.0.0',
        fields: [],
        activeFrom: new Date('2023-01-01'),
      };
      const newer: ExtractionTemplate = {
        version: '2.0.0',
        fields: [],
        activeFrom: new Date('2024-06-01'),
      };

      // Register in reverse order
      service.registerTemplate(old);
      service.registerTemplate(newer);

      expect(service.getActiveTemplate()?.version).toBe('2.0.0');
    });
  });

  describe('getActiveTemplate', () => {
    it('should return undefined when no templates are registered', () => {
      expect(service.getActiveTemplate()).toBeUndefined();
    });

    it('should return the most recent active template', () => {
      const template: ExtractionTemplate = {
        version: '1.0.0',
        fields: [{ name: 'name', pattern: /name:\s*(.+)/i, required: true }],
        activeFrom: new Date('2024-01-01'),
      };

      service.registerTemplate(template);
      const active = service.getActiveTemplate();

      expect(active).toBeDefined();
      expect(active!.version).toBe('1.0.0');
    });

    it('should not return a template that is not yet active', () => {
      const futureTemplate: ExtractionTemplate = {
        version: '3.0.0',
        fields: [],
        activeFrom: new Date('2099-01-01'),
      };

      service.registerTemplate(futureTemplate);
      expect(service.getActiveTemplate()).toBeUndefined();
    });

    it('should return the latest active template when multiple exist', () => {
      const v1: ExtractionTemplate = {
        version: '1.0.0',
        fields: [{ name: 'field1', pattern: /field1:\s*(.+)/i, required: false }],
        activeFrom: new Date('2023-01-01'),
      };
      const v2: ExtractionTemplate = {
        version: '2.0.0',
        fields: [
          { name: 'field1', pattern: /field1:\s*(.+)/i, required: false },
          { name: 'field2', pattern: /field2:\s*(.+)/i, required: true },
        ],
        activeFrom: new Date('2024-06-01'),
      };
      const v3: ExtractionTemplate = {
        version: '3.0.0',
        fields: [],
        activeFrom: new Date('2099-12-31'),
      };

      service.registerTemplate(v1);
      service.registerTemplate(v2);
      service.registerTemplate(v3);

      const active = service.getActiveTemplate();
      expect(active!.version).toBe('2.0.0');
    });
  });

  describe('getTemplateVersion', () => {
    it('should return "none" when no templates are registered', () => {
      expect(service.getTemplateVersion()).toBe('none');
    });

    it('should return "none" when only future templates exist', () => {
      service.registerTemplate({
        version: '5.0.0',
        fields: [],
        activeFrom: new Date('2099-01-01'),
      });
      expect(service.getTemplateVersion()).toBe('none');
    });

    it('should return the version string of the active template', () => {
      service.registerTemplate({
        version: '1.2.3',
        fields: [],
        activeFrom: new Date('2024-01-01'),
      });
      expect(service.getTemplateVersion()).toBe('1.2.3');
    });
  });

  describe('extractWithTemplate', () => {
    it('should extract fields using the active template', () => {
      const template: ExtractionTemplate = {
        version: '1.0.0',
        fields: [
          { name: 'accountNumber', pattern: /account\s*(?:no|number)\s*[:\-]?\s*(\w+)/i, required: true },
          { name: 'customerName', pattern: /customer\s*name\s*[:\-]?\s*(.+)/i, required: true },
        ],
        activeFrom: new Date('2024-01-01'),
      };

      service.registerTemplate(template);
      const result = service.extractWithTemplate('Account Number: ACC12345\nCustomer Name: John Doe');

      expect(result.templateVersion).toBe('1.0.0');
      expect(result.fields).toHaveProperty('accountNumber', 'ACC12345');
      expect(result.fields).toHaveProperty('customerName', 'John Doe');
    });

    it('should return null for fields not found in text', () => {
      const template: ExtractionTemplate = {
        version: '1.0.0',
        fields: [
          { name: 'accountNumber', pattern: /account\s*number\s*[:\-]?\s*(\w+)/i, required: true },
          { name: 'email', pattern: /email\s*[:\-]?\s*(\S+@\S+)/i, required: false },
        ],
        activeFrom: new Date('2024-01-01'),
      };

      service.registerTemplate(template);
      const result = service.extractWithTemplate('Account Number: ACC99999');

      expect(result.fields).toHaveProperty('accountNumber', 'ACC99999');
      expect(result.fields).toHaveProperty('email', null);
    });

    it('should return empty fields when no template is active', () => {
      const result = service.extractWithTemplate('Some text');
      expect(result.templateVersion).toBe('none');
      expect(result.fields).toEqual({});
    });

    it('should return empty fields for empty text', () => {
      service.registerTemplate({
        version: '1.0.0',
        fields: [{ name: 'field1', pattern: /field1:\s*(.+)/i, required: false }],
        activeFrom: new Date('2024-01-01'),
      });

      const result = service.extractWithTemplate('');
      expect(result.fields).toEqual({});
      expect(result.templateVersion).toBe('1.0.0');
    });

    it('should use the latest active template version', () => {
      service.registerTemplate({
        version: '1.0.0',
        fields: [{ name: 'amount', pattern: /amount\s*[:\-]?\s*(\d+)/i, required: true }],
        activeFrom: new Date('2023-01-01'),
      });
      service.registerTemplate({
        version: '2.0.0',
        fields: [
          { name: 'amount', pattern: /amount\s*[:\-]?\s*(?:Rs\.?\s*)?(\d+)/i, required: true },
          { name: 'currency', pattern: /currency\s*[:\-]?\s*(\w+)/i, required: false },
        ],
        activeFrom: new Date('2024-06-01'),
      });

      const result = service.extractWithTemplate('Amount: Rs. 50000\nCurrency: INR');
      expect(result.templateVersion).toBe('2.0.0');
      expect(result.fields).toHaveProperty('amount', '50000');
      expect(result.fields).toHaveProperty('currency', 'INR');
    });

    it('should record the template version used in the result', () => {
      service.registerTemplate({
        version: '3.1.4',
        fields: [],
        activeFrom: new Date('2024-01-01'),
      });

      const result = service.extractWithTemplate('any text');
      expect(result.templateVersion).toBe('3.1.4');
    });
  });

  describe('integration with existing extract method', () => {
    it('should not break the existing extract method', () => {
      // The existing extract() method should still work
      const result = service.extract('VALUATION_REPORT', 'Market Value: 10,00,000');
      expect(result).toHaveProperty('market_value', 1000000);
    });

    it('should allow templates alongside existing extraction logic', () => {
      service.registerTemplate({
        version: '1.0.0',
        fields: [{ name: 'custom', pattern: /custom:\s*(.+)/i, required: false }],
        activeFrom: new Date('2024-01-01'),
      });

      // Existing extraction still works
      const existing = service.extract('VALUATION_REPORT', 'Market Value: 5,00,000');
      expect(existing).toHaveProperty('market_value', 500000);

      // Template extraction also works
      const templated = service.extractWithTemplate('Custom: hello world');
      expect(templated.fields).toHaveProperty('custom', 'hello world');
      expect(templated.templateVersion).toBe('1.0.0');
    });
  });
});
