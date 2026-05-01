import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * DNS MX record configuration.
 */
export interface MxRecord {
  priority: number;
  host: string;
  port: number;
  tls: boolean;
}

/**
 * MX Swap Configuration Service (FR-155.A2).
 *
 * Manages DNS MX failover configuration for email ingestion.
 * Loads initial configuration from the MX_RECORDS environment variable
 * (expected as a JSON array) and provides methods to manage MX records
 * at runtime.
 */
@Injectable()
export class MxSwapConfigService {
  private readonly logger = new Logger(MxSwapConfigService.name);
  private records: MxRecord[] = [];

  constructor(private readonly configService: ConfigService) {
    const mxRecordsJson = this.configService.get<string>('MX_RECORDS', '[]');
    try {
      const parsed = JSON.parse(mxRecordsJson);
      if (Array.isArray(parsed)) {
        this.records = parsed.map((r: Partial<MxRecord>) => ({
          priority: r.priority ?? 10,
          host: r.host ?? 'localhost',
          port: r.port ?? 25,
          tls: r.tls ?? false,
        }));
        this.sortRecords();
      }
    } catch (error) {
      this.logger.error(
        `Failed to parse MX_RECORDS: ${(error as Error).message}`,
      );
      this.records = [];
    }

    this.logger.log(`MX swap config loaded: ${this.records.length} record(s)`);
  }

  /**
   * Get all MX records, sorted by priority (ascending).
   */
  getRecords(): MxRecord[] {
    return [...this.records];
  }

  /**
   * Get the primary (lowest priority number) MX record.
   */
  getPrimary(): MxRecord | null {
    return this.records.length > 0 ? this.records[0] : null;
  }

  /**
   * Get the failover (second lowest priority) MX record.
   */
  getFailover(): MxRecord | null {
    return this.records.length > 1 ? this.records[1] : null;
  }

  /**
   * Add an MX record to the configuration.
   */
  addRecord(record: MxRecord): void {
    this.records.push(record);
    this.sortRecords();
    this.logger.log(
      `Added MX record: ${record.host}:${record.port} (priority ${record.priority})`,
    );
  }

  /**
   * Remove an MX record by host.
   */
  removeRecord(host: string): void {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.host !== host);
    if (this.records.length < before) {
      this.logger.log(`Removed MX record for host: ${host}`);
    } else {
      this.logger.warn(`MX record not found for host: ${host}`);
    }
  }

  /**
   * Sort records by priority (ascending — lower number = higher priority).
   */
  private sortRecords(): void {
    this.records.sort((a, b) => a.priority - b.priority);
  }
}
