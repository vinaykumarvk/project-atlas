import { Injectable, Logger } from '@nestjs/common';

/**
 * Document type enum for attachment classification.
 */
export enum DocumentType {
  VALUATION_REPORT = 'VALUATION_REPORT',
  LEGAL_OPINION = 'LEGAL_OPINION',
  RC_COPY = 'RC_COPY',
  ENCUMBRANCE_CERT = 'ENCUMBRANCE_CERT',
  PHOTO = 'PHOTO',
  INVOICE = 'INVOICE',
  ID_PROOF = 'ID_PROOF',
  OTHER = 'OTHER',
}

/**
 * Classification result returned by the classifier.
 */
export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
}

/**
 * Input attachment shape for classification.
 * Accepts the fields available on a CaseAttachment record.
 */
export interface ClassifiableAttachment {
  filename: string;
  mime_type: string;
  ocr_text?: string | null;
}

/**
 * Filename patterns mapped to document types.
 * Each entry has a regex and the corresponding document type.
 */
const FILENAME_PATTERNS: { pattern: RegExp; documentType: DocumentType }[] = [
  { pattern: /valuation/i, documentType: DocumentType.VALUATION_REPORT },
  { pattern: /legal/i, documentType: DocumentType.LEGAL_OPINION },
  { pattern: /rc_copy/i, documentType: DocumentType.RC_COPY },
  { pattern: /(?:^|[^a-z])rc(?:[^a-z]|$)/i, documentType: DocumentType.RC_COPY },
  { pattern: /encumbrance/i, documentType: DocumentType.ENCUMBRANCE_CERT },
  { pattern: /invoice/i, documentType: DocumentType.INVOICE },
  { pattern: /id_proof/i, documentType: DocumentType.ID_PROOF },
  { pattern: /aadhaar/i, documentType: DocumentType.ID_PROOF },
  { pattern: /pan_card/i, documentType: DocumentType.ID_PROOF },
];

/**
 * OCR text keyword patterns mapped to document types.
 * Each entry has keywords and the corresponding document type.
 */
const OCR_KEYWORD_PATTERNS: { keywords: RegExp[]; documentType: DocumentType }[] = [
  {
    documentType: DocumentType.VALUATION_REPORT,
    keywords: [
      /market\s*value/i,
      /distress\s*value/i,
      /valuation\s*report/i,
      /valuer/i,
      /fair\s*market/i,
    ],
  },
  {
    documentType: DocumentType.LEGAL_OPINION,
    keywords: [
      /title\s*clear/i,
      /legal\s*opinion/i,
      /encumbrance/i,
      /advocate/i,
      /title\s*deed/i,
    ],
  },
  {
    documentType: DocumentType.RC_COPY,
    keywords: [
      /registration\s*certificate/i,
      /vehicle\s*registration/i,
      /rc\s*copy/i,
    ],
  },
  {
    documentType: DocumentType.ENCUMBRANCE_CERT,
    keywords: [
      /encumbrance\s*certificate/i,
      /no\s*encumbrance/i,
      /certificate\s*of\s*encumbrance/i,
    ],
  },
  {
    documentType: DocumentType.INVOICE,
    keywords: [
      /invoice\s*number/i,
      /bill\s*to/i,
      /total\s*amount/i,
      /tax\s*invoice/i,
    ],
  },
  {
    documentType: DocumentType.ID_PROOF,
    keywords: [
      /aadhaar/i,
      /pan\s*card/i,
      /identity\s*proof/i,
      /unique\s*identification/i,
      /permanent\s*account\s*number/i,
    ],
  },
];

/**
 * Document Classification Service.
 *
 * Classifies attachments into document types using a multi-signal approach:
 * 1. MIME type hints (e.g., image/* -> PHOTO)
 * 2. Filename pattern matching
 * 3. OCR text keyword matching
 *
 * Confidence scoring:
 * - MIME-only classification: 0.75
 * - Filename match: 0.85
 * - OCR keyword match: 0.90
 * - Combined filename + OCR match: 0.95
 *
 * If confidence < 0.7, the document type is set to OTHER.
 */
@Injectable()
export class DocumentClassifierService {
  private readonly logger = new Logger(DocumentClassifierService.name);

  /**
   * Classify an attachment by its MIME type, filename, and OCR text.
   *
   * @param attachment - The attachment to classify
   * @returns Classification result with document type and confidence
   */
  classify(attachment: ClassifiableAttachment): ClassificationResult {
    const signals: { documentType: DocumentType; confidence: number; source: string }[] = [];

    // Signal 1: MIME type classification
    const mimeResult = this.classifyByMimeType(attachment.mime_type);
    if (mimeResult) {
      signals.push({ ...mimeResult, source: 'mime' });
    }

    // Signal 2: Filename pattern matching
    const filenameResult = this.classifyByFilename(attachment.filename);
    if (filenameResult) {
      signals.push({ ...filenameResult, source: 'filename' });
    }

    // Signal 3: OCR text keyword matching
    if (attachment.ocr_text) {
      const ocrResult = this.classifyByOcrText(attachment.ocr_text);
      if (ocrResult) {
        signals.push({ ...ocrResult, source: 'ocr' });
      }
    }

    // No signals at all
    if (signals.length === 0) {
      this.logger.debug(
        `No classification signals for "${attachment.filename}" (${attachment.mime_type})`,
      );
      return { documentType: DocumentType.OTHER, confidence: 0.5 };
    }

    // Pick the highest-confidence signal
    let best = signals[0];
    for (const signal of signals) {
      if (signal.confidence > best.confidence) {
        best = signal;
      }
    }

    // Boost confidence if multiple signals agree
    const agreeing = signals.filter((s) => s.documentType === best.documentType);
    let finalConfidence = best.confidence;
    if (agreeing.length > 1) {
      finalConfidence = Math.min(0.95, best.confidence + 0.1);
    }

    // Apply threshold: if confidence < 0.7, fall back to OTHER
    if (finalConfidence < 0.7) {
      this.logger.debug(
        `Low confidence (${finalConfidence.toFixed(2)}) for "${attachment.filename}" — defaulting to OTHER`,
      );
      return { documentType: DocumentType.OTHER, confidence: finalConfidence };
    }

    this.logger.debug(
      `Classified "${attachment.filename}" as ${best.documentType} (confidence=${finalConfidence.toFixed(2)}, source=${best.source})`,
    );

    return { documentType: best.documentType, confidence: finalConfidence };
  }

  /**
   * Classify by MIME type.
   * Image MIME types map to PHOTO with confidence 0.75.
   */
  private classifyByMimeType(
    mimeType: string,
  ): { documentType: DocumentType; confidence: number } | null {
    const normalized = mimeType.toLowerCase();

    if (normalized.startsWith('image/')) {
      return { documentType: DocumentType.PHOTO, confidence: 0.75 };
    }

    return null;
  }

  /**
   * Classify by filename pattern matching.
   * Returns the first matching pattern with confidence 0.85.
   */
  private classifyByFilename(
    filename: string,
  ): { documentType: DocumentType; confidence: number } | null {
    const normalized = filename.toLowerCase();

    for (const { pattern, documentType } of FILENAME_PATTERNS) {
      if (pattern.test(normalized)) {
        return { documentType, confidence: 0.85 };
      }
    }

    return null;
  }

  /**
   * Classify by OCR text keyword matching.
   * Scores based on how many keywords match for each document type.
   * Returns the best-matching type with confidence 0.90.
   */
  private classifyByOcrText(
    ocrText: string,
  ): { documentType: DocumentType; confidence: number } | null {
    const normalized = ocrText.toLowerCase();
    let bestMatch: { documentType: DocumentType; matchCount: number } | null = null;

    for (const { keywords, documentType } of OCR_KEYWORD_PATTERNS) {
      let matchCount = 0;
      for (const keyword of keywords) {
        if (keyword.test(normalized)) {
          matchCount++;
        }
      }

      if (matchCount > 0 && (!bestMatch || matchCount > bestMatch.matchCount)) {
        bestMatch = { documentType, matchCount };
      }
    }

    if (bestMatch) {
      return { documentType: bestMatch.documentType, confidence: 0.9 };
    }

    return null;
  }
}
