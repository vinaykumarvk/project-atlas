import {
  DocumentClassifierService,
  DocumentType,
  ClassifiableAttachment,
} from '../services/document-classifier.service';

function buildAttachment(overrides: Partial<ClassifiableAttachment> = {}): ClassifiableAttachment {
  return {
    filename: 'document.pdf',
    mime_type: 'application/pdf',
    ocr_text: null,
    ...overrides,
  };
}

describe('DocumentClassifierService', () => {
  let service: DocumentClassifierService;

  beforeEach(() => {
    service = new DocumentClassifierService();
  });

  describe('MIME type classification', () => {
    it('should classify image/jpeg as PHOTO', () => {
      const attachment = buildAttachment({
        filename: 'photo.jpg',
        mime_type: 'image/jpeg',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.PHOTO);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify image/png as PHOTO', () => {
      const attachment = buildAttachment({
        filename: 'screenshot.png',
        mime_type: 'image/png',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.PHOTO);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify image/tiff as PHOTO', () => {
      const attachment = buildAttachment({
        filename: 'scan.tiff',
        mime_type: 'image/tiff',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.PHOTO);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('filename pattern matching', () => {
    it('should classify "valuation_report_2024.pdf" as VALUATION_REPORT', () => {
      const attachment = buildAttachment({
        filename: 'valuation_report_2024.pdf',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.VALUATION_REPORT);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify "legal_opinion.pdf" as LEGAL_OPINION', () => {
      const attachment = buildAttachment({
        filename: 'legal_opinion.pdf',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.LEGAL_OPINION);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify "rc_copy.pdf" as RC_COPY', () => {
      const attachment = buildAttachment({
        filename: 'rc_copy.pdf',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.RC_COPY);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify "vehicle_rc.pdf" as RC_COPY (word boundary match)', () => {
      const attachment = buildAttachment({
        filename: 'vehicle_rc.pdf',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.RC_COPY);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify "encumbrance_certificate.pdf" as ENCUMBRANCE_CERT', () => {
      const attachment = buildAttachment({
        filename: 'encumbrance_certificate.pdf',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.ENCUMBRANCE_CERT);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify "invoice_march_2024.pdf" as INVOICE', () => {
      const attachment = buildAttachment({
        filename: 'invoice_march_2024.pdf',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.INVOICE);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify "id_proof_scan.pdf" as ID_PROOF', () => {
      const attachment = buildAttachment({
        filename: 'id_proof_scan.pdf',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.ID_PROOF);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify "aadhaar_card.pdf" as ID_PROOF', () => {
      const attachment = buildAttachment({
        filename: 'aadhaar_card.pdf',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.ID_PROOF);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify "pan_card_copy.pdf" as ID_PROOF', () => {
      const attachment = buildAttachment({
        filename: 'pan_card_copy.pdf',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.ID_PROOF);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('OCR text keyword matching', () => {
    it('should classify by OCR text containing valuation keywords', () => {
      const attachment = buildAttachment({
        filename: 'report.pdf',
        ocr_text: 'Valuation Report\n\nMarket Value: Rs. 12,50,000\nDistress Value: Rs. 10,00,000',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.VALUATION_REPORT);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify by OCR text containing legal opinion keywords', () => {
      const attachment = buildAttachment({
        filename: 'doc.pdf',
        ocr_text: 'Legal Opinion\n\nTitle Clear: Yes\nAdvocate: Mr. Sharma',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.LEGAL_OPINION);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify by OCR text containing invoice keywords', () => {
      const attachment = buildAttachment({
        filename: 'doc123.pdf',
        ocr_text: 'Tax Invoice\n\nInvoice Number: INV-2024-001\nBill To: ABC Corp\nTotal Amount: Rs. 50,000',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.INVOICE);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('combined signals (filename + OCR)', () => {
    it('should boost confidence when filename and OCR agree', () => {
      const attachment = buildAttachment({
        filename: 'valuation_report.pdf',
        ocr_text: 'Valuation Report\nMarket Value: 50,00,000',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.VALUATION_REPORT);
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('unknown / OTHER classification', () => {
    it('should classify unknown PDF files as OTHER', () => {
      const attachment = buildAttachment({
        filename: 'random_document.pdf',
        mime_type: 'application/pdf',
        ocr_text: null,
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.OTHER);
    });

    it('should classify files with no matching signals as OTHER', () => {
      const attachment = buildAttachment({
        filename: 'notes.pdf',
        mime_type: 'application/pdf',
        ocr_text: 'Some random meeting notes from yesterday',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.OTHER);
    });

    it('should return confidence < 0.7 for unknown files', () => {
      const attachment = buildAttachment({
        filename: 'unknown.pdf',
        mime_type: 'application/pdf',
        ocr_text: null,
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.OTHER);
      expect(result.confidence).toBeLessThan(0.7);
    });
  });

  describe('case-insensitive matching', () => {
    it('should match filename patterns case-insensitively', () => {
      const attachment = buildAttachment({
        filename: 'VALUATION_REPORT_Final.PDF',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.VALUATION_REPORT);
    });

    it('should match OCR keywords case-insensitively', () => {
      const attachment = buildAttachment({
        filename: 'doc.pdf',
        ocr_text: 'MARKET VALUE: Rs. 12,50,000\nDISTRESS VALUE: Rs. 10,00,000',
      });

      const result = service.classify(attachment);

      expect(result.documentType).toBe(DocumentType.VALUATION_REPORT);
    });
  });
});
