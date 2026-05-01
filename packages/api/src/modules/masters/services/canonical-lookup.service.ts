import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

/**
 * Match type describing how the raw value was resolved.
 */
export type MatchType = 'EXACT' | 'CANONICAL' | 'SOURCE_FORM' | 'FUZZY' | 'NO_MATCH';

/**
 * Result returned by the canonical lookup service.
 */
export interface LookupResult {
  canonicalForm: string | null;
  confidence: number;
  matchType: MatchType;
  matchedRecord?: unknown;
}

/**
 * Supported master tables and their primary identifier fields.
 */
const MASTER_TABLE_CONFIG: Record<
  string,
  { delegate: string; primaryField: string }
> = {
  PropertyLocationMaster: {
    delegate: 'propertyLocationMaster',
    primaryField: 'city',
  },
  CaseTypeMaster: {
    delegate: 'caseTypeMaster',
    primaryField: 'code',
  },
  FprMaster: {
    delegate: 'fprMaster',
    primaryField: 'employee_code',
  },
  VendorMaster: {
    delegate: 'vendorMaster',
    primaryField: 'vendor_code',
  },
};

/**
 * Compute the Levenshtein distance between two strings.
 *
 * Uses the classic dynamic-programming matrix approach (Wagner-Fischer).
 */
export function levenshteinDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;

  // Short-circuit trivial cases
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (a === b) return 0;

  // Build a (la+1) x (lb+1) matrix
  const matrix: number[][] = [];

  for (let i = 0; i <= la; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[la][lb];
}

/**
 * Canonical Lookup Service for master data matching.
 *
 * Resolves a raw string value to its canonical form in a master table using
 * a multi-tier matching strategy:
 *
 *  1. EXACT     - rawValue matches the primary identifier field exactly
 *  2. CANONICAL - rawValue matches the record's canonicalForm exactly
 *  3. SOURCE_FORM - rawValue matches one of the record's sourceForms (case-insensitive)
 *  4. FUZZY     - rawValue is within Levenshtein distance <= 2 of any canonical or source form
 *  5. NO_MATCH  - nothing found
 */
/**
 * Simple LRU cache with a maximum capacity.
 * When the cache is full, the least recently used entry is evicted.
 */
class LruCache<V> {
  private readonly map = new Map<string, V>();
  constructor(private readonly maxSize: number) {}

  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict the least recently used (first entry)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

@Injectable()
export class CanonicalLookupService {
  /** LRU cache for single lookups (max 500 entries). */
  private readonly cache = new LruCache<LookupResult>(500);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up a raw value against a supported master table.
   *
   * @param masterTable - One of the supported master table names
   * @param rawValue    - The raw string value to resolve
   * @returns A LookupResult describing the match outcome
   */
  async lookup(masterTable: string, rawValue: string): Promise<LookupResult> {
    const cacheKey = `${masterTable}:${rawValue}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.lookupInternal(masterTable, rawValue);
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Batch lookup: resolve multiple raw values against a master table.
   *
   * @param masterTable - One of the supported master table names
   * @param rawValues   - Array of raw string values to resolve
   * @returns A Map of rawValue -> LookupResult
   */
  async batchLookup(masterTable: string, rawValues: string[]): Promise<Map<string, LookupResult>> {
    const results = new Map<string, LookupResult>();

    for (const rawValue of rawValues) {
      const result = await this.lookup(masterTable, rawValue);
      results.set(rawValue, result);
    }

    return results;
  }

  /**
   * Clear the LRU cache (for testing).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size (for testing).
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Internal lookup implementation.
   */
  private async lookupInternal(masterTable: string, rawValue: string): Promise<LookupResult> {
    const config = MASTER_TABLE_CONFIG[masterTable];
    if (!config) {
      return { canonicalForm: null, confidence: 0, matchType: 'NO_MATCH' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (this.prisma as any)[config.delegate];
    const records = await delegate.findMany({
      where: { is_deleted: false },
    });

    // 1. EXACT match against the primary identifier field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exactMatch = records.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r[config.primaryField] === rawValue,
    );
    if (exactMatch) {
      return {
        canonicalForm: exactMatch.canonical_form ?? exactMatch[config.primaryField],
        confidence: 1.0,
        matchType: 'EXACT',
        matchedRecord: exactMatch,
      };
    }

    // 2. CANONICAL match against the canonical_form field
    const canonicalMatch = records.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.canonical_form != null && r.canonical_form === rawValue,
    );
    if (canonicalMatch) {
      return {
        canonicalForm: canonicalMatch.canonical_form,
        confidence: 0.95,
        matchType: 'CANONICAL',
        matchedRecord: canonicalMatch,
      };
    }

    // 3. SOURCE_FORM match (case-insensitive)
    const rawLower = rawValue.toLowerCase();
    const sourceFormMatch = records.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) =>
        Array.isArray(r.source_forms) &&
        r.source_forms.some(
          (sf: string) => sf.toLowerCase() === rawLower,
        ),
    );
    if (sourceFormMatch) {
      return {
        canonicalForm:
          sourceFormMatch.canonical_form ?? sourceFormMatch[config.primaryField],
        confidence: 0.85,
        matchType: 'SOURCE_FORM',
        matchedRecord: sourceFormMatch,
      };
    }

    // 4. FUZZY match - Levenshtein distance <= 2 against canonical_form and source_forms
    let bestDistance = Infinity;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bestRecord: any = null;

    for (const record of records) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = record as any;

      // Check against canonical_form
      if (r.canonical_form != null) {
        const dist = levenshteinDistance(
          rawLower,
          r.canonical_form.toLowerCase(),
        );
        if (dist <= 2 && dist < bestDistance) {
          bestDistance = dist;
          bestRecord = r;
        }
      }

      // Check against source_forms
      if (Array.isArray(r.source_forms)) {
        for (const sf of r.source_forms) {
          const dist = levenshteinDistance(rawLower, sf.toLowerCase());
          if (dist <= 2 && dist < bestDistance) {
            bestDistance = dist;
            bestRecord = r;
          }
        }
      }

      // Check against primary field
      const primaryVal = r[config.primaryField];
      if (primaryVal != null) {
        const dist = levenshteinDistance(
          rawLower,
          String(primaryVal).toLowerCase(),
        );
        if (dist <= 2 && dist < bestDistance) {
          bestDistance = dist;
          bestRecord = r;
        }
      }
    }

    if (bestRecord) {
      // Confidence: 0.8 for distance 1, 0.6 for distance 2
      const confidence = bestDistance === 1 ? 0.8 : 0.6;
      return {
        canonicalForm:
          bestRecord.canonical_form ?? bestRecord[config.primaryField],
        confidence,
        matchType: 'FUZZY',
        matchedRecord: bestRecord,
      };
    }

    // 5. NO_MATCH
    return { canonicalForm: null, confidence: 0, matchType: 'NO_MATCH' };
  }
}
