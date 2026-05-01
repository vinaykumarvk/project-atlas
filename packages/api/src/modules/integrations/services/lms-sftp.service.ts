import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SFTP connection configuration.
 */
export interface SftpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  uploadPath: string;
  downloadPath: string;
}

/**
 * LMS SFTP Batch Exchange Service (FR-142.A3).
 *
 * Provides configurable SFTP batch file upload/download for LMS integration.
 * In this implementation, file operations are mocked — the service validates
 * configuration and simulates batch exchanges for development and testing.
 */
@Injectable()
export class LmsSftpService {
  private readonly logger = new Logger(LmsSftpService.name);
  private readonly config: SftpConfig;

  /** In-memory storage for uploaded batches (mock). */
  private readonly uploadedBatches: Array<{
    filename: string;
    records: Array<{ accountNo: string; caseId: string; status: string }>;
    uploadedAt: Date;
  }> = [];

  /** In-memory storage for downloadable batches (mock). */
  private readonly downloadableRecords: Array<{
    accountNo: string;
    data: Record<string, unknown>;
  }> = [];

  constructor(private readonly configService: ConfigService) {
    this.config = {
      host: this.configService.get<string>('SFTP_HOST', 'localhost'),
      port: parseInt(
        this.configService.get<string>('SFTP_PORT', '22'),
        10,
      ),
      username: this.configService.get<string>('SFTP_USERNAME', 'lms_user'),
      password: this.configService.get<string>('SFTP_PASSWORD', ''),
      uploadPath: this.configService.get<string>(
        'SFTP_UPLOAD_PATH',
        '/outgoing',
      ),
      downloadPath: this.configService.get<string>(
        'SFTP_DOWNLOAD_PATH',
        '/incoming',
      ),
    };

    this.logger.log(`SFTP configured for ${this.config.host}:${this.config.port}`);
  }

  /**
   * Upload a batch of case status records via SFTP.
   * Returns the number of records uploaded and the generated filename.
   */
  async uploadBatch(
    records: Array<{ accountNo: string; caseId: string; status: string }>,
  ): Promise<{ uploaded: number; filename: string }> {
    if (records.length === 0) {
      this.logger.warn('uploadBatch called with empty records array');
      return { uploaded: 0, filename: '' };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `batch_upload_${timestamp}.csv`;

    this.logger.log(
      `Uploading batch of ${records.length} records as ${filename} to ${this.config.uploadPath}`,
    );

    // Mock: store in memory
    this.uploadedBatches.push({
      filename,
      records: [...records],
      uploadedAt: new Date(),
    });

    this.logger.log(`Batch upload complete: ${filename} (${records.length} records)`);

    return { uploaded: records.length, filename };
  }

  /**
   * Download a batch of account data records from SFTP.
   * Returns an array of account records with their associated data.
   */
  async downloadBatch(): Promise<
    Array<{ accountNo: string; data: Record<string, unknown> }>
  > {
    this.logger.log(
      `Downloading batch from ${this.config.downloadPath}`,
    );

    // Mock: return from in-memory store
    const records = [...this.downloadableRecords];
    this.logger.log(`Downloaded ${records.length} records`);

    return records;
  }

  /**
   * Get the current SFTP configuration.
   */
  getConfig(): SftpConfig {
    return { ...this.config };
  }

  /**
   * Test helper: add records to the downloadable store.
   */
  addDownloadableRecords(
    records: Array<{ accountNo: string; data: Record<string, unknown> }>,
  ): void {
    this.downloadableRecords.push(...records);
  }

  /**
   * Test helper: get the uploaded batches.
   */
  getUploadedBatches(): Array<{
    filename: string;
    records: Array<{ accountNo: string; caseId: string; status: string }>;
    uploadedAt: Date;
  }> {
    return [...this.uploadedBatches];
  }
}
