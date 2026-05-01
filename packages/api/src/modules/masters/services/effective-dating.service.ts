import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

/**
 * Represents a versioned master record with effective dating.
 */
export interface VersionedRecord {
  id: string;
  master_table: string;
  record_id: string;
  data: Record<string, unknown>;
  effective_from: Date;
  effective_to: Date | null;
  is_active: boolean;
  version: number;
}

// Map of master table names to Prisma model accessors
const MASTER_TABLES = [
  'property_location_masters',
  'case_type_masters',
  'fpr_masters',
  'vendor_masters',
  'tat_masters',
  'escalation_hierarchy_masters',
  'holiday_calendar_masters',
  'business_hours_masters',
] as const;

type MasterTableName = (typeof MASTER_TABLES)[number];

/**
 * Temporal query service for master data.
 *
 * Supports effective dating (point-in-time queries) using effective_from/effective_to.
 */
@Injectable()
export class EffectiveDatingService {
  // In-memory records for testing mode
  private directRecords: VersionedRecord[] | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * For testing: reset in-memory state.
   */
  reset(): void {
    this.directRecords = [];
  }

  /**
   * Add a versioned record (for testing and seeding).
   */
  addRecord(
    masterTable: string,
    recordId: string,
    data: Record<string, unknown>,
    effectiveFrom: Date,
    effectiveTo: Date | null = null,
    isActive = true,
  ): VersionedRecord {
    if (!this.directRecords) this.directRecords = [];

    const existingVersions = this.directRecords.filter(
      (r) => r.master_table === masterTable && r.record_id === recordId,
    );

    const record: VersionedRecord = {
      id: `ver-${this.directRecords.length + 1}`,
      master_table: masterTable,
      record_id: recordId,
      data,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      is_active: isActive,
      version: existingVersions.length + 1,
    };

    this.directRecords.push(record);
    return record;
  }

  /**
   * Get the version of a record that was effective at a given date.
   */
  async getActiveVersion(
    masterTable: string,
    recordId: string,
    asOfDate?: Date,
  ): Promise<VersionedRecord | null> {
    if (this.directRecords !== null) {
      return this.getActiveVersionFromMemory(masterTable, recordId, asOfDate);
    }

    const queryDate = asOfDate ?? new Date();

    // Query the actual master table for the effective version
    const delegate = this.getDelegate(masterTable as MasterTableName);
    if (!delegate) return null;

    const record = await delegate.findFirst({
      where: {
        id: recordId,
        is_active: true,
        effective_from: { lte: queryDate },
        OR: [
          { effective_to: null },
          { effective_to: { gt: queryDate } },
        ],
      },
      orderBy: { effective_from: 'desc' },
    });

    if (!record) return null;

    return {
      id: record.id,
      master_table: masterTable,
      record_id: record.id,
      data: record as unknown as Record<string, unknown>,
      effective_from: record.effective_from,
      effective_to: record.effective_to,
      is_active: record.is_active,
      version: record.version,
    };
  }

  /**
   * Get the complete history of a record.
   */
  async getHistory(masterTable: string, recordId: string): Promise<VersionedRecord[]> {
    if (this.directRecords !== null) {
      return this.getHistoryFromMemory(masterTable, recordId);
    }

    const delegate = this.getDelegate(masterTable as MasterTableName);
    if (!delegate) {
      throw new NotFoundException(`No history found for ${masterTable}/${recordId}`);
    }

    const records = await delegate.findMany({
      where: { id: recordId },
      orderBy: { effective_from: 'asc' },
    });

    if (records.length === 0) {
      throw new NotFoundException(`No history found for ${masterTable}/${recordId}`);
    }

    return records.map((r: { id: string; effective_from: Date; effective_to: Date | null; is_active: boolean; version: number }, idx: number) => ({
      id: r.id,
      master_table: masterTable,
      record_id: r.id,
      data: r as unknown as Record<string, unknown>,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      is_active: r.is_active,
      version: r.version ?? idx + 1,
    }));
  }

  /**
   * Get all active records for a master table as of a given date.
   */
  async getActiveRecords(
    masterTable: string,
    asOfDate?: Date,
  ): Promise<VersionedRecord[]> {
    if (this.directRecords !== null) {
      return this.getActiveRecordsFromMemory(masterTable, asOfDate);
    }

    const queryDate = asOfDate ?? new Date();

    const delegate = this.getDelegate(masterTable as MasterTableName);
    if (!delegate) return [];

    const records = await delegate.findMany({
      where: {
        is_active: true,
        effective_from: { lte: queryDate },
        OR: [
          { effective_to: null },
          { effective_to: { gt: queryDate } },
        ],
      },
    });

    return records.map((r: { id: string; effective_from: Date; effective_to: Date | null; is_active: boolean; version: number }) => ({
      id: r.id,
      master_table: masterTable,
      record_id: r.id,
      data: r as unknown as Record<string, unknown>,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      is_active: r.is_active,
      version: r.version ?? 1,
    }));
  }

  /**
   * FR-042.A3: Rollback a record to a specific version.
   *
   * Finds the target version in history and creates a new active version
   * with the same data, effectively rolling back the record.
   */
  async rollbackToVersion(
    masterTable: string,
    recordId: string,
    targetVersion: number,
  ): Promise<VersionedRecord> {
    const history = await this.getHistory(masterTable, recordId);
    const targetRecord = history.find((r) => r.version === targetVersion);

    if (!targetRecord) {
      throw new NotFoundException(
        `Version ${targetVersion} not found for ${masterTable}/${recordId}`,
      );
    }

    // Mark the current active version as superseded
    const currentActive = history.filter((r) => r.is_active);
    if (this.directRecords !== null) {
      // In-memory mode: deactivate current, add rollback version
      for (const active of currentActive) {
        active.is_active = false;
        active.effective_to = new Date();
      }
      return this.addRecord(
        masterTable,
        recordId,
        { ...targetRecord.data },
        new Date(),
        null,
        true,
      );
    }

    // Database mode: create a new version from the target's data
    const newVersion = this.addRecord(
      masterTable,
      recordId,
      { ...targetRecord.data },
      new Date(),
      null,
      true,
    );

    return newVersion;
  }

  // --- In-memory helpers for testing ---

  private getActiveVersionFromMemory(masterTable: string, recordId: string, asOfDate?: Date): VersionedRecord | null {
    const queryDate = asOfDate ?? new Date();
    const matching = this.directRecords!.filter(
      (r) =>
        r.master_table === masterTable &&
        r.record_id === recordId &&
        r.is_active &&
        r.effective_from <= queryDate &&
        (r.effective_to === null || r.effective_to > queryDate),
    );

    if (matching.length === 0) return null;
    matching.sort((a, b) => b.effective_from.getTime() - a.effective_from.getTime());
    return matching[0];
  }

  private getHistoryFromMemory(masterTable: string, recordId: string): VersionedRecord[] {
    const history = this.directRecords!.filter(
      (r) => r.master_table === masterTable && r.record_id === recordId,
    );

    if (history.length === 0) {
      throw new NotFoundException(`No history found for ${masterTable}/${recordId}`);
    }

    return history.sort((a, b) => a.effective_from.getTime() - b.effective_from.getTime());
  }

  private getActiveRecordsFromMemory(masterTable: string, asOfDate?: Date): VersionedRecord[] {
    const queryDate = asOfDate ?? new Date();
    return this.directRecords!.filter(
      (r) =>
        r.master_table === masterTable &&
        r.is_active &&
        r.effective_from <= queryDate &&
        (r.effective_to === null || r.effective_to > queryDate),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getDelegate(tableName: MasterTableName): any {
    const map: Record<string, unknown> = {
      property_location_masters: this.prisma.propertyLocationMaster,
      case_type_masters: this.prisma.caseTypeMaster,
      fpr_masters: this.prisma.fprMaster,
      vendor_masters: this.prisma.vendorMaster,
      tat_masters: this.prisma.tatMaster,
      escalation_hierarchy_masters: this.prisma.escalationHierarchyMaster,
      holiday_calendar_masters: this.prisma.holidayCalendarMaster,
      business_hours_masters: this.prisma.businessHoursMaster,
    };

    return map[tableName] ?? null;
  }
}
