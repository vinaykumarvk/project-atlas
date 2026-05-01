import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  MakerCheckerService,
  ChangeAction,
  MasterChangeLogEntry,
} from './maker-checker.service';

/**
 * Represents a validation error for a specific row/field.
 */
export interface RowValidationError {
  row: number;
  field: string;
  message: string;
}

/**
 * Result of row validation.
 */
export interface ValidationResult {
  valid: Record<string, unknown>[];
  errors: RowValidationError[];
}

/**
 * Result of a batch submission.
 */
export interface BatchSubmitResult {
  batch_id: string;
  changes: MasterChangeLogEntry[];
  total: number;
}

/**
 * Schema rules for validation per master table.
 * Each key is a field name; value describes constraints.
 */
export interface FieldRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'date';
  maxLength?: number;
  pattern?: RegExp;
}

export type SchemaRules = Record<string, FieldRule>;

/**
 * Known validation schemas for master tables.
 */
const MASTER_SCHEMAS: Record<string, SchemaRules> = {
  property_location_masters: {
    state: { required: true, type: 'string', maxLength: 100 },
    city: { required: true, type: 'string', maxLength: 100 },
    pin_from: { required: true, type: 'string', maxLength: 10 },
    pin_to: { required: true, type: 'string', maxLength: 10 },
  },
  case_type_masters: {
    code: { required: true, type: 'string', maxLength: 50 },
    display_name: { required: true, type: 'string', maxLength: 200 },
    default_priority: { required: true, type: 'string' },
    default_owner_role: { required: true, type: 'string', maxLength: 50 },
  },
  vendor_masters: {
    vendor_code: { required: true, type: 'string', maxLength: 50 },
    vendor_name: { required: true, type: 'string', maxLength: 200 },
    vendor_category: { required: true, type: 'string', maxLength: 50 },
  },
  fpr_masters: {
    employee_code: { required: true, type: 'string', maxLength: 50 },
    full_name: { required: true, type: 'string', maxLength: 200 },
    capacity_per_day: { required: false, type: 'number' },
  },
  tat_masters: {
    case_type: { required: true, type: 'string', maxLength: 50 },
    priority: { required: true, type: 'string', maxLength: 20 },
    stage: { required: true, type: 'string', maxLength: 50 },
    target_hours_business: { required: true, type: 'number' },
  },
};

/**
 * CSV/Excel bulk import service for master data.
 *
 * Handles parsing of CSV files, validation against schema rules,
 * and batch submission through the maker-checker workflow.
 */
@Injectable()
export class BulkImportService {
  // No counter — use UUID for globally unique batch IDs

  constructor(private readonly makerCheckerService: MakerCheckerService) {}

  /**
   * Parse a file buffer into row objects.
   * Supports CSV (text/csv) and Excel-like tab-separated (for simplicity).
   *
   * For CSV: splits by newline, then by comma, handling quoted fields.
   */
  parseFile(
    buffer: Buffer,
    mimeType: string,
  ): Record<string, unknown>[] {
    if (
      mimeType === 'text/csv' ||
      mimeType === 'application/csv' ||
      mimeType === 'text/plain'
    ) {
      return this.parseCsv(buffer.toString('utf-8'));
    }

    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      // For Excel files, we'd need a library like xlsx.
      // For now, treat as tab-separated for simplicity.
      return this.parseTsv(buffer.toString('utf-8'));
    }

    throw new BadRequestException(
      `Unsupported file type: ${mimeType}. Supported: text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
    );
  }

  /**
   * Validate rows against the schema rules for a master table.
   * Returns valid rows and error details.
   */
  validateRows(
    rows: Record<string, unknown>[],
    masterTable: string,
  ): ValidationResult {
    const schema = MASTER_SCHEMAS[masterTable];
    if (!schema) {
      // If no schema is defined, accept all rows as valid
      return { valid: rows, errors: [] };
    }

    const valid: Record<string, unknown>[] = [];
    const errors: RowValidationError[] = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 1; // 1-based row numbers
      let rowIsValid = true;

      for (const [field, rule] of Object.entries(schema)) {
        const value = row[field];

        // Check required
        if (rule.required && (value === undefined || value === null || value === '')) {
          errors.push({
            row: rowNumber,
            field,
            message: `${field} is required`,
          });
          rowIsValid = false;
          continue;
        }

        // Skip further checks if value is empty and not required
        if (value === undefined || value === null || value === '') {
          continue;
        }

        // Check type
        if (rule.type === 'number') {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push({
              row: rowNumber,
              field,
              message: `${field} must be a number`,
            });
            rowIsValid = false;
            continue;
          }
        }

        // Check maxLength
        if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
          errors.push({
            row: rowNumber,
            field,
            message: `${field} exceeds maximum length of ${rule.maxLength}`,
          });
          rowIsValid = false;
        }

        // Check pattern
        if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
          errors.push({
            row: rowNumber,
            field,
            message: `${field} does not match required pattern`,
          });
          rowIsValid = false;
        }
      }

      if (rowIsValid) {
        valid.push(row);
      }
    });

    return { valid, errors };
  }

  /**
   * Submit a batch of valid rows as maker-checker changes.
   * All rows share the same batch_id for traceability.
   */
  async submitBatch(
    validRows: Record<string, unknown>[],
    masterTable: string,
    makerId: string,
  ): Promise<BatchSubmitResult> {
    if (validRows.length === 0) {
      throw new BadRequestException('No valid rows to submit');
    }

    const batchId = randomUUID();

    const changes: MasterChangeLogEntry[] = [];
    for (const row of validRows) {
      const change = await this.makerCheckerService.proposeChange(
        masterTable,
        null, // record_id is null for CREATE operations
        ChangeAction.CREATE,
        row,
        makerId,
        {
          isBatch: true,
          batchId,
        },
      );
      changes.push(change);
    }

    return {
      batch_id: batchId,
      changes,
      total: changes.length,
    };
  }

  /**
   * Parse CSV string into row objects.
   * Handles quoted fields (with commas inside quotes).
   */
  private parseCsv(content: string): Record<string, unknown>[] {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return []; // Need at least header + 1 data row
    }

    const headers = this.parseCsvLine(lines[0]);
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, unknown> = {};

      headers.forEach((header, idx) => {
        row[header.trim()] = idx < values.length ? values[idx].trim() : '';
      });

      rows.push(row);
    }

    return rows;
  }

  /**
   * Parse a single CSV line, handling quoted fields.
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  /**
   * Parse tab-separated values (simple Excel-like format).
   */
  private parseTsv(content: string): Record<string, unknown>[] {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return [];
    }

    const headers = lines[0].split('\t');
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      const row: Record<string, unknown> = {};

      headers.forEach((header, idx) => {
        row[header.trim()] = idx < values.length ? values[idx].trim() : '';
      });

      rows.push(row);
    }

    return rows;
  }
}
