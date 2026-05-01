import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * S3-compatible object storage service.
 * In production: uses AWS SDK v3 / MinIO client.
 * For dev/test: uses in-memory store.
 */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly bucket: string;
  private readonly endpoint: string;

  // In-memory store for dev/test
  private readonly store = new Map<string, Buffer>();

  constructor(private config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET', 'atlas-storage');
    this.endpoint = this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
  }

  /**
   * Upload an object to storage.
   */
  async put(key: string, data: Buffer, metadata?: Record<string, string>): Promise<void> {
    // In production: use S3 PutObject with server-side encryption
    this.store.set(key, data);
    this.logger.debug(`Stored object: ${key} (${data.length} bytes)`);
  }

  /**
   * Retrieve an object from storage.
   */
  async get(key: string): Promise<Buffer | null> {
    const data = this.store.get(key);
    if (!data) {
      this.logger.warn(`Object not found: ${key}`);
      return null;
    }
    return data;
  }

  /**
   * Check if an object exists.
   */
  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  /**
   * Delete an object.
   */
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Generate a pre-signed URL for temporary access.
   */
  async getSignedUrl(key: string, expiresInSeconds: number = 3600): Promise<string> {
    // In production: use S3 getSignedUrl
    return `${this.endpoint}/${this.bucket}/${key}?expires=${expiresInSeconds}`;
  }

  /**
   * Generate the S3 key path for an RFC822 email archive.
   */
  generateRfc822Key(messageId: string, date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const sanitizedId = messageId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `rfc822/${year}/${month}/${day}/${sanitizedId}.eml.enc`;
  }

  /**
   * Generate the S3 key path for an attachment.
   */
  generateAttachmentKey(caseNumber: string, filename: string): string {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `attachments/${caseNumber}/${sanitizedFilename}`;
  }
}
