import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExtractedEntity, ValidationOutcome } from '../types';

/**
 * FR-011.A3: Interface for LMS (Loan Management System) lookups.
 * Provides cross-validation of account numbers against the LMS.
 */
export interface LmsLookupProvider {
  lookupAccount(accountNo: string): Promise<{ valid: boolean; details?: Record<string, unknown> }>;
}

/**
 * Master data entry for validation lookups.
 */
interface MasterEntry {
  canonical_form: string;
  source_forms: string[];
}

/**
 * Master-backed validation service (FR-016).
 * Validates extracted entities against master data using:
 * 1. Normalisation
 * 2. Canonical form lookup
 * 3. Source forms lookup
 * 4. Levenshtein fuzzy match (distance <= 2)
 */
@Injectable()
export class MasterValidator {
  private readonly logger = new Logger(MasterValidator.name);

  /** Optional LMS lookup provider for cross-validation. */
  private lmsProvider?: LmsLookupProvider;

  constructor(@Optional() lmsProvider?: LmsLookupProvider) {
    this.lmsProvider = lmsProvider;
  }

  /**
   * Set the LMS lookup provider (for testing or runtime injection).
   */
  setLmsProvider(provider: LmsLookupProvider): void {
    this.lmsProvider = provider;
  }

  /**
   * FR-011.A3: Cross-check an account number against the LMS.
   *
   * @param accountNo - The loan account number to validate
   * @returns Validation result with validity and source info
   */
  async crossCheckWithLms(accountNo: string): Promise<{ valid: boolean; source: string }> {
    if (!this.lmsProvider) {
      this.logger.debug('LMS provider not configured; skipping cross-check.');
      return { valid: false, source: 'NO_LMS_PROVIDER' };
    }

    try {
      const result = await this.lmsProvider.lookupAccount(accountNo);
      return {
        valid: result.valid,
        source: result.valid ? 'LMS_VERIFIED' : 'LMS_NOT_FOUND',
      };
    } catch (err) {
      this.logger.warn(`LMS cross-check failed for ${accountNo}: ${(err as Error).message}`);
      return { valid: false, source: 'LMS_ERROR' };
    }
  }

  // In-memory mock master data for validation.
  // In production, these would be fetched from the database (PropertyLocationMaster, VendorMaster, etc.)
  private readonly cityMasters: MasterEntry[] = [
    { canonical_form: 'Mumbai', source_forms: ['Bombay', 'mumbai', 'MUMBAI', 'Mumbay'] },
    { canonical_form: 'Pune', source_forms: ['Poona', 'pune', 'PUNE'] },
    { canonical_form: 'Nashik', source_forms: ['Nasik', 'nashik', 'NASHIK'] },
    { canonical_form: 'Delhi', source_forms: ['New Delhi', 'delhi', 'DELHI', 'NCR'] },
    { canonical_form: 'Bangalore', source_forms: ['Bengaluru', 'bangalore', 'BANGALORE', 'Blr'] },
    { canonical_form: 'Chennai', source_forms: ['Madras', 'chennai', 'CHENNAI'] },
    { canonical_form: 'Hyderabad', source_forms: ['hyderabad', 'HYDERABAD', 'Hyd'] },
    { canonical_form: 'Kolkata', source_forms: ['Calcutta', 'kolkata', 'KOLKATA'] },
    { canonical_form: 'Ahmedabad', source_forms: ['Amdavad', 'ahmedabad', 'AHMEDABAD'] },
    { canonical_form: 'Jaipur', source_forms: ['jaipur', 'JAIPUR'] },
    { canonical_form: 'Lucknow', source_forms: ['lucknow', 'LUCKNOW'] },
    { canonical_form: 'Gurugram', source_forms: ['Gurgaon', 'gurugram', 'GURUGRAM'] },
    { canonical_form: 'Thane', source_forms: ['thane', 'THANE'] },
    { canonical_form: 'Noida', source_forms: ['noida', 'NOIDA', 'Greater Noida'] },
  ];

  private readonly vendorMasters: MasterEntry[] = [
    { canonical_form: 'ABC Valuers Pvt Ltd', source_forms: ['ABC Valuers', 'ABC Valuation', 'A.B.C. Valuers'] },
    { canonical_form: 'Kumar & Associates', source_forms: ['Kumar Associates', 'Kumar and Associates'] },
    { canonical_form: 'Sharma Valuation Services', source_forms: ['Sharma Valuers', 'Sharma Val Services'] },
    { canonical_form: 'National Appraisers', source_forms: ['Natl Appraisers', 'National Appraisal'] },
    { canonical_form: 'Metro Surveyors', source_forms: ['Metro Survey', 'Metro Surveyor'] },
  ];

  private readonly caseTypeMasters: MasterEntry[] = [
    { canonical_form: 'VALUATION_REQUEST', source_forms: ['Valuation Request', 'valuation', 'Property Valuation'] },
    { canonical_form: 'LEGAL_OPINION', source_forms: ['Legal Opinion', 'legal opinion', 'Legal Op'] },
    { canonical_form: 'TITLE_SEARCH', source_forms: ['Title Search', 'title search', 'Title Verification'] },
    { canonical_form: 'INSURANCE_RENEWAL', source_forms: ['Insurance Renewal', 'insurance renewal'] },
    { canonical_form: 'SITE_VISIT', source_forms: ['Site Visit', 'site visit', 'Field Visit'] },
  ];

  /**
   * Validate a list of extracted entities against master data.
   * Returns validation outcomes for each entity.
   * FR-011.A3: For loan_account_no entities, also cross-checks against LMS.
   */
  async validate(entities: ExtractedEntity[]): Promise<ValidationOutcome[]> {
    const outcomes: ValidationOutcome[] = [];

    for (const entity of entities) {
      const outcome = this.validateEntity(entity);
      if (outcome) {
        // FR-011.A3: Cross-check loan account numbers against LMS
        if (entity.entity_type === 'loan_account_no' && outcome.outcome === 'PASS') {
          const lmsResult = await this.crossCheckWithLms(entity.value);
          // Only fail the outcome if an LMS provider is configured and explicitly returned invalid.
          // If no provider is configured (NO_LMS_PROVIDER), skip the cross-check gracefully.
          if (lmsResult.source !== 'NO_LMS_PROVIDER') {
            if (!lmsResult.valid) {
              outcome.outcome = 'FAIL';
              outcome.resolved_value = undefined;
              this.logger.debug(
                `LMS cross-check failed for ${entity.value}: ${lmsResult.source}`,
              );
            }
            (outcome as unknown as Record<string, unknown>).lms_source = lmsResult.source;
          }
        }

        outcomes.push(outcome);
      }
    }

    return outcomes;
  }

  private validateEntity(entity: ExtractedEntity): ValidationOutcome | null {
    switch (entity.entity_type) {
      case 'property_city':
        return this.validateAgainstMaster(entity, this.cityMasters);
      case 'vendor_name':
        return this.validateAgainstMaster(entity, this.vendorMasters);
      case 'loan_account_no':
        return this.validateLoanAccountFormat(entity);
      case 'property_pin':
        return this.validatePinCode(entity);
      case 'contact_phone':
        return this.validatePhoneFormat(entity);
      default:
        return null;
    }
  }

  /**
   * Validate entity value against a master data list.
   * Algorithm: normalise -> canonical_form lookup -> source_forms lookup -> Levenshtein fuzzy match
   */
  private validateAgainstMaster(entity: ExtractedEntity, masters: MasterEntry[]): ValidationOutcome {
    const normalised = this.normalise(entity.value);

    // Step 1: Exact canonical form match
    for (const master of masters) {
      if (this.normalise(master.canonical_form) === normalised) {
        return {
          field: entity.entity_type,
          outcome: 'PASS',
          original_value: entity.value,
          resolved_value: master.canonical_form,
        };
      }
    }

    // Step 2: Source forms lookup
    for (const master of masters) {
      for (const sourceForm of master.source_forms) {
        if (this.normalise(sourceForm) === normalised) {
          return {
            field: entity.entity_type,
            outcome: 'PASS',
            original_value: entity.value,
            resolved_value: master.canonical_form,
          };
        }
      }
    }

    // Step 3: Levenshtein fuzzy match (distance <= 2)
    const candidates: { canonical: string; distance: number }[] = [];

    for (const master of masters) {
      const distToCanonical = this.levenshteinDistance(normalised, this.normalise(master.canonical_form));
      if (distToCanonical <= 2) {
        candidates.push({ canonical: master.canonical_form, distance: distToCanonical });
      }

      for (const sourceForm of master.source_forms) {
        const distToSource = this.levenshteinDistance(normalised, this.normalise(sourceForm));
        if (distToSource <= 2) {
          candidates.push({ canonical: master.canonical_form, distance: distToSource });
        }
      }
    }

    if (candidates.length > 0) {
      // Sort by distance, pick closest
      candidates.sort((a, b) => a.distance - b.distance);
      const uniqueCandidates = [...new Set(candidates.map((c) => c.canonical))];

      return {
        field: entity.entity_type,
        outcome: 'FUZZY_MATCH',
        original_value: entity.value,
        resolved_value: candidates[0].canonical,
        candidates: uniqueCandidates,
      };
    }

    // No match found
    return {
      field: entity.entity_type,
      outcome: 'FAIL',
      original_value: entity.value,
      candidates: masters.map((m) => m.canonical_form).slice(0, 5),
    };
  }

  /**
   * Validate loan account number format.
   */
  private validateLoanAccountFormat(entity: ExtractedEntity): ValidationOutcome {
    const value = entity.value;
    // Check it matches expected format
    const validPatterns = [
      /^LN[-\/]\d{4}[-\/]\d{4,8}$/i,
      /^LN\d{8,12}$/i,
      /^[A-Z0-9][-A-Z0-9\/]{6,20}$/i,
    ];

    const isValid = validPatterns.some((p) => p.test(value));

    return {
      field: entity.entity_type,
      outcome: isValid ? 'PASS' : 'FAIL',
      original_value: value,
    };
  }

  /**
   * Validate PIN code format (6-digit, first digit 1-9).
   */
  private validatePinCode(entity: ExtractedEntity): ValidationOutcome {
    const isValid = /^[1-9]\d{5}$/.test(entity.value);
    return {
      field: entity.entity_type,
      outcome: isValid ? 'PASS' : 'FAIL',
      original_value: entity.value,
    };
  }

  /**
   * Validate phone number format.
   */
  private validatePhoneFormat(entity: ExtractedEntity): ValidationOutcome {
    const digits = entity.value.replace(/\D/g, '');
    const isValid = digits.length >= 10 && digits.length <= 12;
    return {
      field: entity.entity_type,
      outcome: isValid ? 'PASS' : 'FAIL',
      original_value: entity.value,
    };
  }

  /**
   * Normalise a string for comparison: lowercase, trim, collapse whitespace.
   */
  private normalise(value: string): string {
    return value.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Compute Levenshtein distance between two strings.
   * Uses dynamic programming O(m*n) approach.
   */
  levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    // Create a 2D array for the DP table
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    // Base cases
    for (let i = 0; i <= m; i++) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
    }

    // Fill the table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // deletion
            dp[i][j - 1],     // insertion
            dp[i - 1][j - 1], // substitution
          );
        }
      }
    }

    return dp[m][n];
  }
}
