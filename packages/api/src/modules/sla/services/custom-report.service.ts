import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

export interface ReportSchema {
  name: string;
  dimensions: string[]; // e.g., ['case_type', 'priority', 'status']
  measures: string[]; // e.g., ['count', 'avg_tat', 'breach_rate']
  filters?: Record<string, string | string[]>;
  groupBy?: string[];
  orderBy?: string;
  limit?: number;
}

export interface ReportResult {
  schema: ReportSchema;
  rows: Record<string, unknown>[];
  totalRows: number;
  generatedAt: Date;
}

export interface SavedReport {
  id: string;
  name: string;
  schema: ReportSchema;
  savedAt: Date;
}

export interface ScheduledReport {
  id: string;
  reportId: string;
  cron: string;
  recipients: string[];
  format: 'csv' | 'json';
  scheduledAt: Date;
}

const VALID_DIMENSIONS = [
  'case_type',
  'priority',
  'status',
  'assigned_fpr_id',
  'assigned_vendor_id',
  'property_city',
  'confidence_band',
  'region',
];

const VALID_MEASURES = [
  'count',
  'avg_tat',
  'breach_rate',
  'total_breached',
  'total_resolved',
  'min_tat',
  'max_tat',
];

@Injectable()
export class CustomReportService {
  private readonly logger = new Logger(CustomReportService.name);

  // FR-113.A2: In-memory stores for saved and scheduled reports
  private savedReports = new Map<string, SavedReport>();
  private scheduledReports = new Map<string, ScheduledReport>();
  private nextId = 1;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate a report schema before execution.
   */
  validateSchema(schema: ReportSchema): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!schema.name || schema.name.trim().length === 0) {
      errors.push('Report name is required');
    }

    if (!schema.dimensions || schema.dimensions.length === 0) {
      errors.push('At least one dimension is required');
    } else {
      for (const dim of schema.dimensions) {
        if (!VALID_DIMENSIONS.includes(dim)) {
          errors.push(`Invalid dimension: ${dim}`);
        }
      }
    }

    if (!schema.measures || schema.measures.length === 0) {
      errors.push('At least one measure is required');
    } else {
      for (const measure of schema.measures) {
        if (!VALID_MEASURES.includes(measure)) {
          errors.push(`Invalid measure: ${measure}`);
        }
      }
    }

    if (schema.groupBy) {
      for (const gb of schema.groupBy) {
        if (!VALID_DIMENSIONS.includes(gb)) {
          errors.push(`Invalid groupBy field: ${gb}`);
        }
      }
    }

    if (schema.limit !== undefined && (schema.limit < 1 || schema.limit > 10000)) {
      errors.push('Limit must be between 1 and 10000');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Execute a custom report against the database.
   * Builds a Prisma-like groupBy query from the schema definition.
   */
  async executeReport(schema: ReportSchema): Promise<ReportResult> {
    const validation = this.validateSchema(schema);
    if (!validation.valid) {
      throw new Error(`Invalid report schema: ${validation.errors.join(', ')}`);
    }

    const groupByFields = schema.groupBy || schema.dimensions;

    // Build where clause from filters
    const where: Record<string, unknown> = {};
    if (schema.filters) {
      for (const [key, value] of Object.entries(schema.filters)) {
        if (Array.isArray(value)) {
          where[key] = { in: value };
        } else {
          where[key] = value;
        }
      }
    }

    try {
      // Use Prisma groupBy for aggregation
      const groupByResult = await (this.prisma.case.groupBy as Function)({
        by: groupByFields,
        where,
        _count: { id: true },
        _avg: schema.measures.includes('avg_tat')
          ? { created_at: true }
          : undefined,
        _min: schema.measures.includes('min_tat')
          ? { created_at: true }
          : undefined,
        _max: schema.measures.includes('max_tat')
          ? { created_at: true }
          : undefined,
        take: schema.limit || 100,
        orderBy: schema.orderBy
          ? { [schema.orderBy]: 'desc' }
          : { _count: { id: 'desc' } },
      });

      // Transform results into report rows
      const rows = (groupByResult as Record<string, unknown>[]).map(
        (row: Record<string, unknown>) => {
          const resultRow: Record<string, unknown> = {};

          // Include dimensions
          for (const dim of groupByFields) {
            resultRow[dim] = row[dim];
          }

          // Include measures
          if (schema.measures.includes('count')) {
            const countObj = row._count as
              | Record<string, number>
              | undefined;
            resultRow.count = countObj?.id ?? 0;
          }
          if (schema.measures.includes('avg_tat')) {
            resultRow.avg_tat = (row._avg as Record<string, unknown>)
              ?.created_at;
          }
          if (schema.measures.includes('min_tat')) {
            resultRow.min_tat = (row._min as Record<string, unknown>)
              ?.created_at;
          }
          if (schema.measures.includes('max_tat')) {
            resultRow.max_tat = (row._max as Record<string, unknown>)
              ?.created_at;
          }

          return resultRow;
        },
      );

      return {
        schema,
        rows,
        totalRows: rows.length,
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to execute report "${schema.name}": ${(error as Error).message}`,
      );

      // Return empty result on error
      return {
        schema,
        rows: [],
        totalRows: 0,
        generatedAt: new Date(),
      };
    }
  }

  /**
   * Get available dimensions for report building.
   */
  getAvailableDimensions(): string[] {
    return [...VALID_DIMENSIONS];
  }

  /**
   * Get available measures for report building.
   */
  getAvailableMeasures(): string[] {
    return [...VALID_MEASURES];
  }

  /**
   * FR-113.A2: Save a report configuration by name to the in-memory store.
   */
  saveReport(name: string, schema: ReportSchema): SavedReport {
    const id = `report-${this.nextId++}`;
    const savedReport: SavedReport = {
      id,
      name,
      schema,
      savedAt: new Date(),
    };
    this.savedReports.set(id, savedReport);
    this.logger.log(`Saved report "${name}" with id ${id}`);
    return savedReport;
  }

  /**
   * FR-113.A2: List all saved report configurations.
   */
  listSavedReports(): SavedReport[] {
    return Array.from(this.savedReports.values());
  }

  /**
   * FR-113.A2: Schedule a saved report with a cron expression, recipients, and format.
   */
  scheduleReport(
    reportId: string,
    cron: string,
    recipients: string[],
    format: 'csv' | 'json',
  ): ScheduledReport {
    const savedReport = this.savedReports.get(reportId);
    if (!savedReport) {
      throw new Error(`Report with id "${reportId}" not found`);
    }

    const id = `schedule-${this.nextId++}`;
    const scheduledReport: ScheduledReport = {
      id,
      reportId,
      cron,
      recipients,
      format,
      scheduledAt: new Date(),
    };
    this.scheduledReports.set(id, scheduledReport);
    this.logger.log(
      `Scheduled report "${savedReport.name}" (${reportId}) with cron "${cron}" for ${recipients.length} recipient(s) in ${format} format`,
    );
    return scheduledReport;
  }

  /**
   * FR-113.A2: List all scheduled reports.
   */
  listScheduledReports(): ScheduledReport[] {
    return Array.from(this.scheduledReports.values());
  }
}
