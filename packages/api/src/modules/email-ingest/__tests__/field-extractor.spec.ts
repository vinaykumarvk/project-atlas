import { FieldExtractorService } from '../services/field-extractor.service';
import { DocumentType } from '../services/document-classifier.service';

describe('FieldExtractorService', () => {
  let service: FieldExtractorService;

  beforeEach(() => {
    service = new FieldExtractorService();
  });

  describe('valuation report extraction', () => {
    it('should extract market_value from "Market Value: 12,50,000"', () => {
      const ocrText = `
        Valuation Report
        Property Address: 123 MG Road, Mumbai
        Market Value: 12,50,000
        Distress Value: 10,00,000
        Valuer ID: VAL-2024-001
        Report Date: 15-Jan-2024
      `;

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('market_value', 1250000);
    });

    it('should extract distress_value', () => {
      const ocrText = `
        Valuation Report
        Market Value: Rs. 50,00,000
        Distress Value: Rs. 40,00,000
      `;

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('distress_value', 4000000);
    });

    it('should extract valuer_id', () => {
      const ocrText = `
        Valuation Report
        Valuer ID: VAL-2024-001
        Market Value: 12,50,000
      `;

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('valuer_id', 'VAL-2024-001');
    });

    it('should extract report_date', () => {
      const ocrText = `
        Valuation Report
        Report Date: 15-Jan-2024
        Market Value: 12,50,000
      `;

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('report_date', '15-Jan-2024');
    });

    it('should extract property_address', () => {
      const ocrText = `
        Valuation Report
        Property Address: 123 MG Road, Andheri West, Mumbai 400058
        Market Value: 12,50,000
      `;

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('property_address', '123 MG Road, Andheri West, Mumbai 400058');
    });

    it('should extract all fields from a complete valuation report', () => {
      const ocrText = `
        VALUATION REPORT
        Date of Valuation: 20-March-2024
        Report Date: 20-March-2024
        Property Address: Plot No. 45, Sector 12, Navi Mumbai, Maharashtra
        Market Value: Rs. 1,25,00,000
        Distress Value: Rs. 1,00,00,000
        Valuer No: V12345
      `;

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('market_value', 12500000);
      expect(result).toHaveProperty('distress_value', 10000000);
      expect(result).toHaveProperty('valuer_id');
      expect(result).toHaveProperty('report_date', '20-March-2024');
      expect(result).toHaveProperty('property_address');
    });

    it('should handle currency with INR prefix', () => {
      const ocrText = 'Market Value: INR 25,00,000';

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('market_value', 2500000);
    });

    it('should handle currency with rupee symbol', () => {
      const ocrText = 'Market Value: ₹ 25,00,000';

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('market_value', 2500000);
    });
  });

  describe('legal opinion extraction', () => {
    it('should extract title_clear as true when title is clear', () => {
      const ocrText = `
        Legal Opinion
        Title Clear: Yes
        Encumbrances Listed: 0
        Opinion Date: 10-Feb-2024
        Advocate: Mr. Rajesh Kumar
      `;

      const result = service.extract(DocumentType.LEGAL_OPINION, ocrText);

      expect(result).toHaveProperty('title_clear', true);
    });

    it('should extract title_clear as false when title is not clear', () => {
      const ocrText = `
        Legal Opinion
        The title is not clear due to pending litigation.
        Encumbrances Listed: 2
      `;

      const result = service.extract(DocumentType.LEGAL_OPINION, ocrText);

      expect(result).toHaveProperty('title_clear', false);
    });

    it('should extract encumbrances_listed', () => {
      const ocrText = `
        Legal Opinion
        Encumbrances Listed: 3
        Title Clear: No
      `;

      const result = service.extract(DocumentType.LEGAL_OPINION, ocrText);

      expect(result).toHaveProperty('encumbrances_listed', 3);
    });

    it('should extract opinion_date', () => {
      const ocrText = `
        Legal Opinion
        Opinion Date: 15-Jan-2024
        Title is clear
      `;

      const result = service.extract(DocumentType.LEGAL_OPINION, ocrText);

      expect(result).toHaveProperty('opinion_date', '15-Jan-2024');
    });

    it('should extract advocate_name', () => {
      const ocrText = `
        Legal Opinion
        Title is clear
        Advocate: Rajesh Kumar
      `;

      const result = service.extract(DocumentType.LEGAL_OPINION, ocrText);

      expect(result).toHaveProperty('advocate_name', 'Rajesh Kumar');
    });

    it('should extract all fields from a complete legal opinion', () => {
      const ocrText = `
        LEGAL OPINION REPORT
        Opinion Date: 25-Dec-2023
        Advocate Name: Suresh Mehta
        After examining the property documents, the title is clear and marketable.
        Encumbrances Found: 0
      `;

      const result = service.extract(DocumentType.LEGAL_OPINION, ocrText);

      expect(result).toHaveProperty('title_clear', true);
      expect(result).toHaveProperty('encumbrances_listed', 0);
      expect(result).toHaveProperty('opinion_date', '25-Dec-2023');
      expect(result).toHaveProperty('advocate_name', 'Suresh Mehta');
    });
  });

  describe('graceful handling of missing fields', () => {
    it('should return null for all fields when OCR text is empty', () => {
      const result = service.extract(DocumentType.VALUATION_REPORT, '');

      expect(result).toHaveProperty('market_value', null);
      expect(result).toHaveProperty('distress_value', null);
      expect(result).toHaveProperty('valuer_id', null);
      expect(result).toHaveProperty('report_date', null);
      expect(result).toHaveProperty('property_address', null);
    });

    it('should return null for all fields when OCR text is null', () => {
      const result = service.extract(DocumentType.VALUATION_REPORT, null);

      expect(result).toHaveProperty('market_value', null);
      expect(result).toHaveProperty('distress_value', null);
      expect(result).toHaveProperty('valuer_id', null);
      expect(result).toHaveProperty('report_date', null);
      expect(result).toHaveProperty('property_address', null);
    });

    it('should return null for missing individual fields', () => {
      const ocrText = 'Market Value: 10,00,000';

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('market_value', 1000000);
      expect(result).toHaveProperty('distress_value', null);
      expect(result).toHaveProperty('valuer_id', null);
      expect(result).toHaveProperty('report_date', null);
      expect(result).toHaveProperty('property_address', null);
    });

    it('should return null for unparseable values', () => {
      const ocrText = 'Market Value: not-a-number';

      const result = service.extract(DocumentType.VALUATION_REPORT, ocrText);

      expect(result).toHaveProperty('market_value', null);
    });

    it('should return null for legal opinion fields when OCR text is null', () => {
      const result = service.extract(DocumentType.LEGAL_OPINION, null);

      expect(result).toHaveProperty('title_clear', null);
      expect(result).toHaveProperty('encumbrances_listed', null);
      expect(result).toHaveProperty('opinion_date', null);
      expect(result).toHaveProperty('advocate_name', null);
    });

    it('should return empty object for unsupported document types', () => {
      const result = service.extract(DocumentType.PHOTO, 'some text');

      expect(result).toEqual({});
    });

    it('should return empty object for OTHER document type', () => {
      const result = service.extract(DocumentType.OTHER, 'some text');

      expect(result).toEqual({});
    });
  });
});
