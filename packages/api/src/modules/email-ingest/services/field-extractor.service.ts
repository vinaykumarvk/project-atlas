import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { DocumentType } from './document-classifier.service';

/**
 * Extracted fields from a valuation report.
 */
export interface ValuationReportFields {
  market_value: number | null;
  distress_value: number | null;
  valuer_id: string | null;
  report_date: string | null;
  property_address: string | null;
}

/**
 * Extracted fields from a legal opinion.
 */
export interface LegalOpinionFields {
  title_clear: boolean | null;
  encumbrances_listed: number | null;
  opinion_date: string | null;
  advocate_name: string | null;
}

/**
 * Union type for all extracted field shapes.
 */
export type ExtractedFields = ValuationReportFields | LegalOpinionFields | Record<string, unknown>;

/**
 * FR-023.A3: Versioned extraction template definition.
 */
export interface ExtractionTemplate {
  version: string;
  fields: Array<{ name: string; pattern: RegExp; required: boolean }>;
  activeFrom: Date;
}

/**
 * Extraction result including template version metadata.
 */
export interface VersionedExtractionResult {
  fields: ExtractedFields;
  templateVersion: string;
}

/**
 * Field Extraction Service.
 *
 * Extracts structured fields from OCR text based on the classified
 * document type. Uses regex-based pattern matching for field extraction.
 *
 * Supported document types:
 * - VALUATION_REPORT: market_value, distress_value, valuer_id, report_date, property_address
 * - LEGAL_OPINION: title_clear, encumbrances_listed, opinion_date, advocate_name
 *
 * Missing or unparseable fields are returned as null.
 */
@Injectable()
export class FieldExtractorService {
  private readonly logger = new Logger(FieldExtractorService.name);

  /** FR-023.A3: Registered extraction templates, sorted by activeFrom descending. */
  private readonly templates: ExtractionTemplate[] = [];

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * FR-023.A3: Register a versioned extraction template.
   * Templates are stored sorted by activeFrom date (newest first).
   */
  registerTemplate(template: ExtractionTemplate): void {
    this.templates.push(template);
    // Sort by activeFrom descending so the most recent active template is first
    this.templates.sort((a, b) => b.activeFrom.getTime() - a.activeFrom.getTime());
    this.logger.log(`Registered extraction template v${template.version} (activeFrom: ${template.activeFrom.toISOString()})`);
  }

  /**
   * FR-023.A3: Get the currently active extraction template.
   * Returns the template with the most recent activeFrom date that is <= now.
   * Returns undefined if no templates are registered or none are active yet.
   */
  getActiveTemplate(): ExtractionTemplate | undefined {
    const now = new Date();
    return this.templates.find(t => t.activeFrom <= now);
  }

  /**
   * FR-023.A3: Get the version string of the currently active template.
   * Returns 'none' if no template is active.
   */
  getTemplateVersion(): string {
    const active = this.getActiveTemplate();
    return active ? active.version : 'none';
  }

  /**
   * FR-023.A3: Extract fields using the active versioned template.
   * Returns the extracted fields along with the template version used.
   */
  extractWithTemplate(text: string): VersionedExtractionResult {
    const template = this.getActiveTemplate();
    if (!template || !text) {
      return {
        fields: {},
        templateVersion: template?.version || 'none',
      };
    }

    const fields: Record<string, string | null> = {};
    for (const field of template.fields) {
      const match = text.match(field.pattern);
      fields[field.name] = match?.[1]?.trim() ?? null;
    }

    this.logger.debug(`Extracted ${Object.keys(fields).length} fields using template v${template.version}`);
    return { fields, templateVersion: template.version };
  }

  /**
   * Extract structured fields from OCR text based on document type.
   *
   * @param documentType - The classified document type
   * @param ocrText - The OCR-extracted text content
   * @returns Extracted fields as a JSON object (nulls for unparseable fields)
   */
  extract(documentType: DocumentType | string, ocrText: string | null | undefined): ExtractedFields {
    if (!ocrText) {
      this.logger.debug(`No OCR text available for field extraction (type=${documentType})`);
      return this.getEmptyFields(documentType);
    }

    switch (documentType) {
      case DocumentType.VALUATION_REPORT:
        return this.extractValuationReport(ocrText);
      case DocumentType.LEGAL_OPINION:
        return this.extractLegalOpinion(ocrText);
      default:
        this.logger.debug(`No extraction rules for document type: ${documentType}`);
        return {};
    }
  }

  /**
   * FR-023.A4: Officer confirmation of extracted fields.
   *
   * Records that a specific officer has confirmed the extracted fields
   * for a given case. Stores the confirmed values and logs the activity.
   *
   * @param caseId         - The case ID
   * @param confirmedFields - The officer-confirmed field values
   * @param officerId      - The confirming officer's user ID
   */
  async confirmExtraction(
    caseId: string,
    confirmedFields: Record<string, string>,
    officerId: string,
  ): Promise<void> {
    this.logger.log(`Officer ${officerId} confirming extraction for case ${caseId}`);

    if (this.prisma) {
      await this.prisma.caseActivityLog.create({
        data: {
          case_id: caseId,
          action_code: 'EXTRACTION_CONFIRMED',
          actor_type: 'USER',
          actor_id: officerId,
          payload_json: {
            confirmedFields,
            confirmedAt: new Date().toISOString(),
          },
        },
      });
    }

    this.logger.log(
      `Extraction confirmed for case ${caseId} by officer ${officerId}: ${Object.keys(confirmedFields).length} fields`,
    );
  }

  /**
   * Extract fields from a valuation report.
   */
  private extractValuationReport(text: string): ValuationReportFields {
    return {
      market_value: this.extractCurrencyValue(text, /market\s*value\s*[:\-]?\s*(?:(?:Rs\.?|INR|₹)\s*)?([0-9,]+(?:\.[0-9]+)?)/i),
      distress_value: this.extractCurrencyValue(text, /distress\s*value\s*[:\-]?\s*(?:(?:Rs\.?|INR|₹)\s*)?([0-9,]+(?:\.[0-9]+)?)/i),
      valuer_id: this.extractString(text, /valuer\s*(?:id|no|number|code)\s*[:\-]?\s*([A-Za-z0-9\-\/]+)/i),
      report_date: this.extractDate(text, /(?:report\s*date|date\s*of\s*(?:report|valuation))\s*[:\-]?\s*(\d{1,2}[\s\-\/\.]\w{2,9}[\s\-\/\.]\d{2,4}|\d{4}[\-\/]\d{2}[\-\/]\d{2}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4})/i),
      property_address: this.extractString(text, /(?:property\s*address|address\s*of\s*property|property\s*location)\s*[:\-]?\s*(.+?)(?:\n|$)/i),
    };
  }

  /**
   * Extract fields from a legal opinion.
   */
  private extractLegalOpinion(text: string): LegalOpinionFields {
    return {
      title_clear: this.extractTitleClear(text),
      encumbrances_listed: this.extractNumber(text, /(?:encumbrances?\s*(?:listed|found|noted|identified))\s*[:\-]?\s*(\d+)/i),
      opinion_date: this.extractDate(text, /(?:opinion\s*date|date\s*of\s*opinion|dated)\s*[:\-]?\s*(\d{1,2}[\s\-\/\.]\w{2,9}[\s\-\/\.]\d{2,4}|\d{4}[\-\/]\d{2}[\-\/]\d{2}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4})/i),
      advocate_name: this.extractString(text, /(?:advocate|lawyer|counsel)\s*(?:name)?\s*[:\-]?\s*([A-Z][a-zA-Z\s\.]+?)(?:\n|,|$)/i),
    };
  }

  /**
   * Return empty field objects for a given document type.
   */
  private getEmptyFields(documentType: DocumentType | string): ExtractedFields {
    switch (documentType) {
      case DocumentType.VALUATION_REPORT:
        return {
          market_value: null,
          distress_value: null,
          valuer_id: null,
          report_date: null,
          property_address: null,
        };
      case DocumentType.LEGAL_OPINION:
        return {
          title_clear: null,
          encumbrances_listed: null,
          opinion_date: null,
          advocate_name: null,
        };
      default:
        return {};
    }
  }

  /**
   * Extract a currency value from text using the given pattern.
   * Handles Indian-style numbers with commas (e.g., 12,50,000 -> 1250000).
   */
  private extractCurrencyValue(text: string, pattern: RegExp): number | null {
    const match = text.match(pattern);
    if (!match || !match[1]) return null;

    // Remove commas and parse as number
    const cleaned = match[1].replace(/,/g, '');
    const value = parseFloat(cleaned);

    if (isNaN(value)) return null;
    return value;
  }

  /**
   * Extract a string value from text using the given pattern.
   * Returns the first capture group trimmed, or null if not found.
   */
  private extractString(text: string, pattern: RegExp): string | null {
    const match = text.match(pattern);
    if (!match || !match[1]) return null;

    const value = match[1].trim();
    return value.length > 0 ? value : null;
  }

  /**
   * Extract a date string from text using the given pattern.
   * Returns the matched date string as-is (not normalized).
   */
  private extractDate(text: string, pattern: RegExp): string | null {
    const match = text.match(pattern);
    if (!match || !match[1]) return null;

    return match[1].trim();
  }

  /**
   * Extract a numeric value from text using the given pattern.
   */
  private extractNumber(text: string, pattern: RegExp): number | null {
    const match = text.match(pattern);
    if (!match || !match[1]) return null;

    const value = parseInt(match[1], 10);
    return isNaN(value) ? null : value;
  }

  /**
   * Extract title clear status from legal opinion text.
   * Looks for phrases indicating whether the title is clear or not.
   */
  private extractTitleClear(text: string): boolean | null {
    const normalizedText = text.toLowerCase();

    // Check for explicit clear/not clear phrases
    if (/title\s*(?:is\s*)?(?:clear|good|clean|marketable)/i.test(normalizedText)) {
      // But check if it's negated
      if (/title\s*(?:is\s*)?(?:not\s*clear|not\s*good|not\s*clean|not\s*marketable)/i.test(normalizedText)) {
        return false;
      }
      return true;
    }

    if (/title\s*(?:is\s*)?(?:not\s*clear|defective|disputed|doubtful)/i.test(normalizedText)) {
      return false;
    }

    // Check for "Title Clear: Yes/No" pattern
    const yesNoMatch = normalizedText.match(/title\s*clear\s*[:\-]?\s*(yes|no)/i);
    if (yesNoMatch) {
      return yesNoMatch[1].toLowerCase() === 'yes';
    }

    return null;
  }
}
