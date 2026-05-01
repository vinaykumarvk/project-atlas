import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma';
import { DocumentClassifierService, ClassifiableAttachment } from './document-classifier.service';
import { FieldExtractorService } from './field-extractor.service';
import { toJsonValue } from '../../../common/prisma';

/**
 * OCR extraction result.
 */
export interface OcrResult {
  text: string;
  confidence: number;
  method: string;
  /** FR-021.A2: Per-word confidence scores from OCR. */
  wordConfidences: Array<{ word: string; confidence: number }>;
}

/**
 * OCR Service.
 *
 * Extracts text from attachments (PDFs, images) and stores the OCR text
 * on the CaseAttachment record for search and classification purposes.
 *
 * Supported formats:
 * - PDF: uses pdf-parse library (text extraction from PDF text layers)
 * - Images (PNG, JPEG, TIFF): placeholder for Tesseract.js or Cloud Vision API
 *
 * The extracted text is stored on CaseAttachment.ocr_text and made
 * available for full-text search.
 */
/** Region-specific OCR endpoint mapping. */
const OCR_REGION_ENDPOINTS: Record<string, string> = {
  'us-east-1': 'https://ocr.us-east-1.atlas.internal/v1',
  'us-west-2': 'https://ocr.us-west-2.atlas.internal/v1',
  'eu-west-1': 'https://ocr.eu-west-1.atlas.internal/v1',
  'eu-central-1': 'https://ocr.eu-central-1.atlas.internal/v1',
  'ap-south-1': 'https://ocr.ap-south-1.atlas.internal/v1',
  'ap-southeast-1': 'https://ocr.ap-southeast-1.atlas.internal/v1',
};

const DEFAULT_OCR_REGION = 'us-east-1';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly ocrEnabled: boolean;
  /** FR-021.A3: OCR region for data-residency routing. */
  private readonly ocrRegion: string;

  /**
   * FR-021.A1: Cached Tesseract word-level confidences from the most recent
   * extractFromImage() call. Used by processAttachment() to prefer real
   * Tesseract word data over the synthetic computeWordConfidences() fallback.
   */
  private _lastTesseractWordConfidences: Array<{ word: string; confidence: number }> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly documentClassifier: DocumentClassifierService,
    private readonly fieldExtractor: FieldExtractorService,
  ) {
    this.ocrEnabled = this.config.get<string>('OCR_ENABLED', 'true') !== 'false';
    this.ocrRegion = this.config.get<string>('OCR_REGION') || DEFAULT_OCR_REGION;

    // FR-021.A3: In production, enforce India-only OCR processing (ap-south-1)
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production' && this.ocrRegion !== 'ap-south-1') {
      this.logger.warn(
        `FR-021.A3: Production OCR region must be ap-south-1 (India). ` +
        `Configured region "${this.ocrRegion}" overridden to ap-south-1 for data residency compliance.`,
      );
      this.ocrRegion = 'ap-south-1';
    }

    this.logger.log(`OCR service initialized (enabled: ${this.ocrEnabled}, region: ${this.ocrRegion})`);
  }

  /**
   * FR-021.A3: Get the configured OCR region.
   */
  getRegion(): string {
    return this.ocrRegion;
  }

  /**
   * FR-021.A3: Get the region-specific OCR endpoint URL.
   * Falls back to the default region endpoint if the configured region is unknown.
   */
  getEndpoint(): string {
    return OCR_REGION_ENDPOINTS[this.ocrRegion] || OCR_REGION_ENDPOINTS[DEFAULT_OCR_REGION];
  }

  /**
   * Extract text from a file buffer based on its MIME type.
   *
   * @param buffer - The file content
   * @param mimeType - The MIME type of the file
   * @returns Extracted text content
   */
  async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    if (!this.ocrEnabled) {
      return '';
    }

    const normalizedType = mimeType.toLowerCase();

    if (normalizedType === 'application/pdf') {
      // FR-021.A1: Check if PDF has adequate text layer before running OCR
      const hasTextLayer = await this.hasAdequateTextLayer(buffer);
      if (hasTextLayer) {
        this.logger.debug('PDF has adequate text layer, using direct extraction (skipping OCR)');
        return this.extractFromPdf(buffer);
      }
      return this.extractFromPdf(buffer);
    }

    if (normalizedType.startsWith('image/')) {
      return this.extractFromImage(buffer, normalizedType);
    }

    if (
      normalizedType === 'text/plain' ||
      normalizedType === 'text/csv' ||
      normalizedType === 'text/html'
    ) {
      return buffer.toString('utf-8');
    }

    this.logger.debug(`No OCR strategy for MIME type: ${mimeType}`);
    return '';
  }

  /**
   * FR-021.A1: Check if a PDF has an adequate embedded text layer.
   * Returns true if the PDF contains >= 50 characters per page on average,
   * meaning OCR is unnecessary (the text layer is sufficient).
   */
  private async hasAdequateTextLayer(buffer: Buffer): Promise<boolean> {
    try {
      const pdfParse = await this.tryLoadPdfParse();
      if (!pdfParse) return false;

      const result = await pdfParse(buffer);
      const textLength = result.text?.length || 0;
      const pageCount = result.numpages || 1;
      const charsPerPage = textLength / pageCount;

      this.logger.debug(
        `PDF text layer check: ${textLength} chars across ${pageCount} page(s) = ${Math.round(charsPerPage)} chars/page`,
      );

      // Consider the text layer adequate if >= 50 chars per page
      return charsPerPage >= 50;
    } catch {
      return false;
    }
  }

  /**
   * Extract text from a PDF buffer.
   * Attempts to use pdf-parse for text-layer extraction.
   * Falls back to a basic binary text extraction if pdf-parse is unavailable.
   */
  private async extractFromPdf(buffer: Buffer): Promise<string> {
    try {
      // Attempt to use pdf-parse dynamically
      const pdfParse = await this.tryLoadPdfParse();
      if (pdfParse) {
        const result = await pdfParse(buffer);
        this.logger.debug(
          `PDF text extracted: ${result.text.length} chars from ${result.numpages} page(s)`,
        );
        return result.text;
      }
    } catch (error) {
      this.logger.warn(`pdf-parse extraction failed: ${(error as Error).message}`);
    }

    // Fallback: extract readable ASCII strings from the PDF binary
    return this.extractTextFromBinary(buffer);
  }

  /**
   * Attempt to dynamically import pdf-parse.
   * Returns null if the library is not installed.
   */
  private async tryLoadPdfParse(): Promise<((buf: Buffer) => Promise<{ text: string; numpages: number }>) | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      return pdfParse;
    } catch {
      this.logger.debug('pdf-parse not available, using fallback text extraction');
      return null;
    }
  }

  /**
   * Extract text from an image buffer.
   * Uses Tesseract.js for OCR when available, including word-level confidence data.
   * Falls back to empty string if Tesseract is not installed.
   */
  private async extractFromImage(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      // Attempt to use Tesseract.js dynamically
      const tesseract = await this.tryLoadTesseract();
      if (tesseract) {
        const worker = await tesseract.createWorker('eng');
        const { data } = await worker.recognize(buffer);
        await worker.terminate();
        this.logger.debug(`Image OCR extracted: ${data.text.length} chars`);

        // FR-021.A1: Cache Tesseract word-level confidences for use in processAttachment
        if (data.words && Array.isArray(data.words) && data.words.length > 0) {
          this._lastTesseractWordConfidences = data.words.map(
            (w: { text: string; confidence: number }) => ({
              word: w.text,
              confidence: parseFloat((w.confidence / 100).toFixed(3)),
            }),
          );
          this.logger.debug(
            `Captured ${this._lastTesseractWordConfidences.length} word-level confidences from Tesseract`,
          );
        } else {
          this._lastTesseractWordConfidences = null;
        }

        return data.text;
      }
    } catch (error) {
      this.logger.warn(`Tesseract OCR failed: ${(error as Error).message}`);
    }

    this._lastTesseractWordConfidences = null;
    this.logger.debug(
      `Image OCR not available for ${mimeType} (${buffer.length} bytes). ` +
        'Install tesseract.js or configure Cloud Vision for image OCR.',
    );
    return '';
  }

  /**
   * Attempt to dynamically import tesseract.js.
   * Returns null if the library is not installed.
   */
  private async tryLoadTesseract(): Promise<{
    createWorker: (lang: string) => Promise<{
      recognize: (buf: Buffer) => Promise<{
        data: {
          text: string;
          words?: Array<{ text: string; confidence: number }>;
        };
      }>;
      terminate: () => Promise<void>;
    }>;
  } | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Tesseract = require('tesseract.js');
      return Tesseract;
    } catch {
      return null;
    }
  }

  /**
   * Basic fallback: extract readable text strings from a binary buffer.
   * Useful for PDFs with embedded text when pdf-parse is unavailable.
   */
  private extractTextFromBinary(buffer: Buffer): string {
    const str = buffer.toString('latin1');
    // Extract sequences of printable ASCII characters (4+ chars)
    const matches = str.match(/[\x20-\x7E]{4,}/g);
    if (!matches) return '';

    // Filter out PDF structure tokens and binary artifacts
    const pdfTokens = new Set([
      'endobj',
      'endstream',
      'stream',
      'xref',
      'startxref',
      'trailer',
    ]);

    const meaningful = matches.filter(
      (s) =>
        !pdfTokens.has(s.trim().toLowerCase()) &&
        !s.startsWith('/') &&
        !s.startsWith('%') &&
        !s.match(/^\d+ \d+ obj$/) &&
        s.trim().length > 3,
    );

    return meaningful.join(' ').substring(0, 50000);
  }

  /**
   * Extract text from an attachment and store the result on the
   * CaseAttachment record.
   *
   * @param attachmentId - The CaseAttachment record ID
   * @param buffer - The file content
   * @param mimeType - The MIME type of the file
   * @returns The OCR result
   */
  async processAttachment(
    attachmentId: string,
    buffer: Buffer,
    mimeType: string,
    filename?: string,
  ): Promise<OcrResult> {
    this.logger.debug(
      `Processing OCR for attachment ${attachmentId} (${mimeType}, ${buffer.length} bytes, region: ${this.ocrRegion}, endpoint: ${this.getEndpoint()})`,
    );

    const text = await this.extractText(buffer, mimeType);

    if (text) {
      const confidence = this.estimateConfidence(text, mimeType);
      const method = this.getExtractionMethod(mimeType);

      // FR-021.A1: Prefer Tesseract word-level confidences when available,
      // fall back to synthetic computeWordConfidences() otherwise.
      const wordConfidences = this._lastTesseractWordConfidences
        ? this._lastTesseractWordConfidences
        : this.computeWordConfidences(text, confidence);

      // Clear cached Tesseract data after use
      this._lastTesseractWordConfidences = null;

      await this.prisma.caseAttachment.update({
        where: { id: attachmentId },
        data: {
          ocr_text: text,
          ocr_confidence: confidence,
        },
      });

      this.logger.debug(
        `OCR result stored for attachment ${attachmentId}: ${text.length} chars, confidence=${confidence}`,
      );

      // Document classification and structured field extraction
      await this.classifyAndExtract(attachmentId, mimeType, filename || '', text);

      return { text, confidence, method, wordConfidences };
    }

    // Even without OCR text, attempt classification by MIME type / filename
    await this.classifyAndExtract(attachmentId, mimeType, filename || '', null);

    return { text: '', confidence: 0, method: 'none', wordConfidences: [] };
  }

  /**
   * Classify the attachment document type and extract structured fields.
   * Stores the results on the CaseAttachment record.
   */
  private async classifyAndExtract(
    attachmentId: string,
    mimeType: string,
    filename: string,
    ocrText: string | null,
  ): Promise<void> {
    try {
      const classifiable: ClassifiableAttachment = {
        filename,
        mime_type: mimeType,
        ocr_text: ocrText,
      };

      const classification = this.documentClassifier.classify(classifiable);
      const extractedFields = this.fieldExtractor.extract(
        classification.documentType,
        ocrText,
      );

      await this.prisma.caseAttachment.update({
        where: { id: attachmentId },
        data: {
          document_type: classification.documentType,
          doc_type_confidence: classification.confidence,
          extracted_fields_json: toJsonValue(
            extractedFields as Record<string, unknown>,
          ),
        },
      });

      this.logger.debug(
        `Classification stored for attachment ${attachmentId}: type=${classification.documentType}, confidence=${classification.confidence.toFixed(2)}`,
      );
    } catch (error) {
      this.logger.error(
        `Classification/extraction failed for attachment ${attachmentId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * FR-021.A2: Compute per-word confidence scores.
   *
   * In a production system, per-word confidences would come from the OCR engine
   * (e.g., Tesseract word-level data). This implementation estimates word-level
   * confidences based on the document-level confidence and word characteristics.
   *
   * Words with special characters or unusual patterns get lower confidence.
   */
  private computeWordConfidences(
    text: string,
    documentConfidence: number,
  ): Array<{ word: string; confidence: number }> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const words = text.split(/\s+/).filter((w) => w.length > 0);

    return words.map((word) => {
      let wordConfidence = documentConfidence;

      // Short words get slightly lower confidence
      if (word.length <= 2) {
        wordConfidence *= 0.9;
      }

      // Words with unusual characters get lower confidence
      const alphanumericRatio = (word.match(/[a-zA-Z0-9]/g) || []).length / word.length;
      if (alphanumericRatio < 0.5) {
        wordConfidence *= 0.7;
      }

      // Clamp between 0 and 1
      wordConfidence = Math.max(0, Math.min(1, wordConfidence));

      return { word, confidence: parseFloat(wordConfidence.toFixed(3)) };
    });
  }

  /**
   * Estimate OCR confidence based on the extraction method and content quality.
   */
  private estimateConfidence(text: string, mimeType: string): number {
    if (!text || text.length === 0) return 0;

    // Text-based formats have high confidence
    if (mimeType.startsWith('text/')) return 0.99;

    // PDF text layer extraction is generally reliable
    if (mimeType === 'application/pdf') {
      // Check if the text looks like meaningful content
      const wordCount = text.split(/\s+/).length;
      if (wordCount > 10) return 0.9;
      if (wordCount > 3) return 0.7;
      return 0.5;
    }

    // Image OCR has variable confidence
    if (mimeType.startsWith('image/')) {
      return 0.6;
    }

    return 0.5;
  }

  /**
   * Get the extraction method name based on MIME type.
   */
  private getExtractionMethod(mimeType: string): string {
    if (mimeType === 'application/pdf') return 'pdf-parse';
    if (mimeType.startsWith('image/')) return 'tesseract';
    if (mimeType.startsWith('text/')) return 'direct';
    return 'binary-extract';
  }
}
