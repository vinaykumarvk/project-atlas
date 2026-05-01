import { Injectable, Logger } from '@nestjs/common';
import { ExtractedEntity } from '../types';

/**
 * Expected entity types per case type.
 * When rule-based extraction fails to find these, we fall back to LLM extraction.
 */
const EXPECTED_ENTITIES_BY_CASE_TYPE: Record<string, string[]> = {
  VALUATION_REQUEST: ['loan_account_no', 'property_city', 'customer_name'],
  LEGAL_OPINION: ['loan_account_no', 'customer_name'],
  TITLE_SEARCH: ['loan_account_no', 'property_city'],
  INSURANCE_RENEWAL: ['loan_account_no', 'monetary_amount'],
  RELEASE_OF_COLLATERAL: ['loan_account_no', 'customer_name'],
  SITE_VISIT: ['loan_account_no', 'property_city'],
  DOCUMENT_COLLECTION: ['loan_account_no', 'customer_name'],
  GENERAL_INQUIRY: ['loan_account_no'],
};

/**
 * Interface for the LLM entity extraction fallback provider.
 * Production implementations would call OpenAI with structured output.
 */
export interface LlmEntityExtractor {
  extractEntities(text: string, expectedTypes: string[]): Promise<ExtractedEntity[]>;
}

/**
 * Mock LLM entity extractor for use in tests and when no real provider is configured.
 */
@Injectable()
export class MockLlmEntityExtractor implements LlmEntityExtractor {
  async extractEntities(_text: string, _expectedTypes: string[]): Promise<ExtractedEntity[]> {
    // Mock returns empty -- in production, this would call OpenAI with structured output
    return [];
  }
}

/**
 * Rule-based Named Entity Recognition (NER) using regex patterns.
 * Extracts structured entities from email text.
 *
 * When rule-based extraction misses expected entities for a given case type,
 * an LLM-based fallback is used to attempt extraction.
 */
@Injectable()
export class RuleBasedExtractor {
  private readonly logger = new Logger(RuleBasedExtractor.name);
  private llmExtractor: LlmEntityExtractor | null = null;

  private readonly knownCities = [
    'Mumbai',
    'Pune',
    'Nashik',
    'Delhi',
    'New Delhi',
    'Bangalore',
    'Bengaluru',
    'Chennai',
    'Hyderabad',
    'Kolkata',
    'Ahmedabad',
    'Jaipur',
    'Lucknow',
    'Chandigarh',
    'Noida',
    'Gurgaon',
    'Gurugram',
    'Thane',
    'Navi Mumbai',
    'Indore',
    'Bhopal',
    'Nagpur',
    'Surat',
    'Vadodara',
    'Coimbatore',
    'Kochi',
    'Trivandrum',
    'Visakhapatnam',
    'Mysore',
    'Mysuru',
  ];

  /**
   * FR-011.A1: Configurable list of known FPR names for fpr_name entity extraction.
   * Can be overridden by calling setKnownFprNames().
   */
  private knownFprNames: string[] = [
    'Amit Sharma',
    'Priya Patel',
    'Suresh Reddy',
    'Meena Desai',
    'Rajesh Kumar',
    'Sneha Nair',
    'Vikram Singh',
    'Anita Joshi',
    'Deepak Verma',
    'Kavita Rao',
  ];

  private readonly knownVendors = [
    'ABC Valuers',
    'XYZ Associates',
    'Kumar & Associates',
    'Sharma Valuation Services',
    'National Appraisers',
    'Metro Surveyors',
    'City Legal Services',
    'Apex Valuers',
    'Pioneer Surveyors',
    'Standard Valuation Co',
  ];

  /**
   * Set the LLM entity extractor for fallback.
   */
  setLlmExtractor(extractor: LlmEntityExtractor): void {
    this.llmExtractor = extractor;
  }

  /**
   * FR-011.A1: Set configurable list of known FPR names.
   */
  setKnownFprNames(names: string[]): void {
    this.knownFprNames = names;
  }

  /**
   * Extract all entities from the given text using rule-based patterns.
   * All entities are tagged with entity_source = 'rule_based'.
   */
  extract(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    entities.push(...this.extractLoanAccountNo(text));
    entities.push(...this.extractCustomerName(text));
    entities.push(...this.extractPropertyPin(text));
    entities.push(...this.extractPropertyCity(text));
    entities.push(...this.extractMonetaryAmount(text));
    entities.push(...this.extractDueDate(text));
    entities.push(...this.extractContactPhone(text));
    entities.push(...this.extractVendorName(text));
    entities.push(...this.extractReferenceNumber(text));
    entities.push(...this.extractPropertyAddress(text));
    entities.push(...this.extractPropertyGeo(text));
    entities.push(...this.extractFprName(text));

    // Tag all rule-based entities
    for (const entity of entities) {
      entity.entity_source = 'rule_based';
    }

    return entities;
  }

  /**
   * Extract entities with LLM fallback for missing expected entity types.
   * Call this instead of extract() when you want the full extraction pipeline
   * including LLM fallback for a specific case type.
   */
  async extractWithFallback(text: string, caseType?: string): Promise<ExtractedEntity[]> {
    // Step 1: Run rule-based extraction
    const ruleBasedEntities = this.extract(text);

    if (!caseType || !this.llmExtractor) {
      return ruleBasedEntities;
    }

    // Step 2: Determine which expected entities are missing
    const expectedTypes = EXPECTED_ENTITIES_BY_CASE_TYPE[caseType] || [];
    const foundTypes = new Set(ruleBasedEntities.map((e) => e.entity_type));
    const missingTypes = expectedTypes.filter((t) => !foundTypes.has(t));

    if (missingTypes.length === 0) {
      this.logger.debug(
        `All expected entities found for ${caseType} via rule-based extraction`,
      );
      return ruleBasedEntities;
    }

    // Step 3: Attempt LLM fallback for missing entity types
    this.logger.log(
      `Missing entity types for ${caseType}: [${missingTypes.join(', ')}]. Attempting LLM fallback.`,
    );

    try {
      const llmEntities = await this.llmExtractor.extractEntities(text, missingTypes);

      // Tag LLM-sourced entities
      for (const entity of llmEntities) {
        entity.entity_source = 'llm_fallback';
      }

      this.logger.log(
        `LLM fallback extracted ${llmEntities.length} entities for types: [${missingTypes.join(', ')}]`,
      );

      return [...ruleBasedEntities, ...llmEntities];
    } catch (error) {
      this.logger.warn(
        `LLM entity extraction fallback failed: ${(error as Error).message}. Using rule-based results only.`,
      );
      return ruleBasedEntities;
    }
  }

  /**
   * Loan account number patterns: LN-XXXX-YYYY, LN/XXXX/YYYY, LNXXXXYYYY
   */
  private extractLoanAccountNo(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = [
      /\bLN[-\/]\d{4}[-\/]\d{4,8}\b/gi,
      /\bLN\d{8,12}\b/gi,
      /\bloan\s*(?:a\/c|account|acc|acct)?\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9][-A-Z0-9\/]{6,20})/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[1] || match[0];
        entities.push({
          entity_type: 'loan_account_no',
          value: value.trim(),
          start_offset: match.index,
          end_offset: match.index + match[0].length,
          confidence: 0.9,
        });
      }
    }

    return entities;
  }

  /**
   * Customer name: after "Mr./Mrs./Ms./Dear" or "Customer:" prefix
   */
  private extractCustomerName(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = [
      /\b(?:Dear\s+)?(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.?)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/g,
      /\bDear\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})/g,
      /\bCustomer\s*:\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/g,
      /\bBorrower\s*:\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/g,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          const nameStart = match.index + match[0].indexOf(match[1]);
          entities.push({
            entity_type: 'customer_name',
            value: match[1].trim(),
            start_offset: nameStart,
            end_offset: nameStart + match[1].length,
            confidence: 0.85,
          });
        }
      }
    }

    return entities;
  }

  /**
   * Property PIN code: 6-digit Indian PIN (first digit 1-9)
   */
  private extractPropertyPin(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const pattern = /\b(?:PIN|pin|Pin)\s*(?:code|Code)?\s*:?\s*([1-9]\d{5})\b|\b([1-9]\d{5})\b/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[1] || match[2];
      if (value) {
        // Check context - PIN codes often appear near location-related text
        const contextStart = Math.max(0, match.index - 30);
        const context = text.substring(contextStart, match.index).toLowerCase();
        const hasLocationContext =
          context.includes('pin') ||
          context.includes('address') ||
          context.includes('location') ||
          context.includes('city') ||
          context.includes('area') ||
          context.includes('property') ||
          context.includes(',');

        const confidence = hasLocationContext ? 0.9 : 0.7;

        entities.push({
          entity_type: 'property_pin',
          value,
          start_offset: match.index,
          end_offset: match.index + match[0].length,
          confidence,
        });
      }
    }

    return entities;
  }

  /**
   * Property city: match against known cities list
   */
  private extractPropertyCity(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    for (const city of this.knownCities) {
      const escapedCity = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedCity}\\b`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          entity_type: 'property_city',
          value: city,
          start_offset: match.index,
          end_offset: match.index + match[0].length,
          confidence: 0.92,
        });
      }
    }

    return entities;
  }

  /**
   * Monetary amount: patterns like Rs X,XX,XXX or INR X or currency symbol
   */
  private extractMonetaryAmount(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = [
      /₹\s*([\d,]+(?:\.\d{1,2})?)/g,
      /\bINR\s*([\d,]+(?:\.\d{1,2})?)/gi,
      /\bRs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi,
      /\bRupees\s*([\d,]+(?:\.\d{1,2})?)/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          entity_type: 'monetary_amount',
          value: match[0].trim(),
          start_offset: match.index,
          end_offset: match.index + match[0].length,
          confidence: 0.93,
        });
      }
    }

    return entities;
  }

  /**
   * Due date: DD-MMM-YYYY, DD/MM/YYYY, "by <date>"
   */
  private extractDueDate(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = [
      /\b(\d{1,2}[-\/]\w{3}[-\/]\d{4})\b/g,
      /\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\b/g,
      /\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2})\b/g,
      /\bby\s+(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*,?\s*\d{4})/gi,
      /\bbefore\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\b/gi,
      /\bdue\s+(?:on|by|date)?\s*:?\s*(\d{1,2}[-\/]\w{3,9}[-\/]\d{2,4})/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[1] || match[0];
        entities.push({
          entity_type: 'due_date',
          value: value.trim(),
          start_offset: match.index,
          end_offset: match.index + match[0].length,
          confidence: 0.88,
        });
      }
    }

    return entities;
  }

  /**
   * Contact phone: Indian mobile +91XXXXXXXXXX or 10-digit
   */
  private extractContactPhone(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = [
      /\+91[-\s]?\d{10}\b/g,
      /\b(?:91[-\s])?\d{10}\b/g,
      /\b(?:mob(?:ile)?|phone|contact|cell|tel)\s*(?:no\.?|number|#)?\s*:?\s*\+?(\d[\d\s-]{8,14}\d)\b/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[1] || match[0];
        // Validate: should have at least 10 digits
        const digitsOnly = value.replace(/\D/g, '');
        if (digitsOnly.length >= 10 && digitsOnly.length <= 12) {
          entities.push({
            entity_type: 'contact_phone',
            value: value.trim(),
            start_offset: match.index,
            end_offset: match.index + match[0].length,
            confidence: 0.9,
          });
        }
      }
    }

    return entities;
  }

  /**
   * Vendor name: after "vendor:" or matched against known vendor names
   */
  private extractVendorName(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Pattern-based extraction
    const vendorPattern = /\bvendor\s*:\s*([A-Z][a-zA-Z&\s]+(?:Pvt\.?|Ltd\.?|LLP|Co\.?)?)/gi;
    let match: RegExpExecArray | null;
    while ((match = vendorPattern.exec(text)) !== null) {
      if (match[1]) {
        entities.push({
          entity_type: 'vendor_name',
          value: match[1].trim(),
          start_offset: match.index,
          end_offset: match.index + match[0].length,
          confidence: 0.88,
        });
      }
    }

    // Known vendor name matching
    for (const vendor of this.knownVendors) {
      const escapedVendor = vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedVendor}\\b`, 'gi');
      let vendorMatch: RegExpExecArray | null;
      while ((vendorMatch = pattern.exec(text)) !== null) {
        entities.push({
          entity_type: 'vendor_name',
          value: vendor,
          start_offset: vendorMatch.index,
          end_offset: vendorMatch.index + vendorMatch[0].length,
          confidence: 0.95,
        });
      }
    }

    return entities;
  }

  /**
   * Reference number: alphanumeric patterns after "ref:" or "reference"
   */
  private extractReferenceNumber(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const patterns = [
      /\bref(?:erence)?\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9][-A-Z0-9\/]{4,25})\b/gi,
      /\bcase\s*(?:no\.?|number|#)\s*:?\s*([A-Z0-9][-A-Z0-9\/]{4,25})\b/gi,
      /\bATL[-\/]\d{4}[-\/]\d{4,8}\b/g,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[1] || match[0];
        entities.push({
          entity_type: 'reference_number',
          value: value.trim(),
          start_offset: match.index,
          end_offset: match.index + match[0].length,
          confidence: 0.87,
        });
      }
    }

    return entities;
  }

  /**
   * FR-011.A1: Property address — Indian address patterns.
   * Looks for building/flat + street + city + PIN.
   */
  private extractPropertyAddress(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Pattern: Flat/Building No. + Street/Road + City + PIN
    const patterns = [
      /\b(?:Flat|Plot|House|Building|Bldg|Unit|Shop|Office|Block)\s*(?:No\.?|#)?\s*[\w\/-]+[,\s]+[\w\s]+(?:Road|Rd|Street|St|Lane|Ln|Nagar|Colony|Society|Soc|Layout|Park|Enclave|Extension|Ext|Sector|Phase|Marg|Path|Chowk|Circle|Gali|Mohalla|Wadi)[,\s]+[\w\s]+[,\s]+[1-9]\d{5}\b/gi,
      /\b(?:Address|Property\s*(?:Address|Location))\s*:?\s*(.{10,150}?[1-9]\d{5})\b/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[1] || match[0];
        entities.push({
          entity_type: 'property_address',
          value: value.trim(),
          start_offset: match.index,
          end_offset: match.index + match[0].length,
          confidence: 0.85,
        });
      }
    }

    return entities;
  }

  /**
   * FR-011.A1: Property geo-coordinates — lat/lon patterns.
   * Looks for decimal degree coordinate pairs.
   */
  private extractPropertyGeo(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Decimal degrees: lat, lon (e.g. 19.0760, 72.8777)
    const patterns = [
      /\b(-?\d{1,3}\.\d{3,8})\s*[,\s]+\s*(-?\d{1,3}\.\d{3,8})\b/g,
      /\b(?:lat(?:itude)?)\s*:?\s*(-?\d{1,3}\.\d{3,8})\s*[,;\s]+\s*(?:lon(?:gitude)?|lng)\s*:?\s*(-?\d{1,3}\.\d{3,8})\b/gi,
      /\b(?:geo|coordinates?|coords?|location)\s*:?\s*(-?\d{1,3}\.\d{3,8})\s*[,\s]+\s*(-?\d{1,3}\.\d{3,8})\b/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);

        // Validate reasonable lat/lon ranges (India-focused but permissive)
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          const value = `${match[1]}, ${match[2]}`;
          entities.push({
            entity_type: 'property_geo',
            value,
            start_offset: match.index,
            end_offset: match.index + match[0].length,
            confidence: 0.88,
          });
        }
      }
    }

    return entities;
  }

  /**
   * FR-011.A1: FPR name — lookup from configurable list or master data.
   * Matches known FPR names in the text.
   */
  private extractFprName(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Pattern-based extraction: "FPR:", "Field Officer:", "Assigned to:"
    const prefixPatterns = [
      /\b(?:FPR|Field\s*(?:Officer|Person|Representative)|Assigned\s*(?:to|officer))\s*:?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/gi,
    ];

    for (const pattern of prefixPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          const nameStart = match.index + match[0].indexOf(match[1]);
          entities.push({
            entity_type: 'fpr_name',
            value: match[1].trim(),
            start_offset: nameStart,
            end_offset: nameStart + match[1].length,
            confidence: 0.85,
          });
        }
      }
    }

    // Known FPR name matching
    for (const fprName of this.knownFprNames) {
      const escapedName = fprName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedName}\\b`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        // Avoid duplicates with prefix-based matches
        const isDup = entities.some(
          (e) => e.entity_type === 'fpr_name' &&
            e.start_offset === match!.index &&
            e.end_offset === match!.index + match![0].length,
        );
        if (!isDup) {
          entities.push({
            entity_type: 'fpr_name',
            value: fprName,
            start_offset: match.index,
            end_offset: match.index + match[0].length,
            confidence: 0.92,
          });
        }
      }
    }

    return entities;
  }
}
