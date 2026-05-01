import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * DMS provider interface — abstracts the Document Management System.
 */
export interface DmsProvider {
  upload(
    filename: string,
    content: Buffer,
    metadata: Record<string, string>,
  ): Promise<string>; // returns external_id
  fetch(
    externalId: string,
  ): Promise<{ content: Buffer; metadata: Record<string, string> } | null>;
}

/**
 * Mock DMS provider for development and testing.
 * Uses an in-memory store keyed by external ID.
 */
export class MockDmsProvider implements DmsProvider {
  private readonly store = new Map<
    string,
    { content: Buffer; metadata: Record<string, string>; filename: string }
  >();
  private counter = 0;

  async upload(
    filename: string,
    content: Buffer,
    metadata: Record<string, string>,
  ): Promise<string> {
    this.counter++;
    const externalId = `dms-${this.counter}-${Date.now()}`;
    this.store.set(externalId, { content, metadata, filename });
    return externalId;
  }

  async fetch(
    externalId: string,
  ): Promise<{ content: Buffer; metadata: Record<string, string> } | null> {
    const entry = this.store.get(externalId);
    if (!entry) return null;
    return { content: entry.content, metadata: entry.metadata };
  }

  /** Test helper: get the count of stored documents. */
  getDocumentCount(): number {
    return this.store.size;
  }
}

/**
 * Document Management Service (FR-024.A1).
 *
 * Provides document upload and retrieval through an injected DmsProvider.
 * Adds case-level metadata enrichment and logging.
 */
@Injectable()
export class DmsService {
  private readonly logger = new Logger(DmsService.name);

  constructor(
    @Inject('DmsProvider') private readonly provider: DmsProvider,
  ) {}

  /**
   * Upload a document to the DMS, associating it with a case.
   *
   * @param caseId - The case this document belongs to
   * @param filename - Original filename
   * @param content - File content as a Buffer
   * @returns The DMS external ID for future retrieval
   */
  async uploadDocument(
    caseId: string,
    filename: string,
    content: Buffer,
  ): Promise<{ dmsExternalId: string }> {
    this.logger.log(
      `Uploading document to DMS: case=${caseId}, file=${filename}, size=${content.length}`,
    );

    const metadata: Record<string, string> = {
      caseId,
      filename,
      uploadedAt: new Date().toISOString(),
      sizeBytes: content.length.toString(),
    };

    try {
      // FR-024.A1: Generate deterministic ID for idempotent uploads
      const deterministicId = this.generateDeterministicId(caseId, filename, content);
      metadata.deterministicId = deterministicId;

      const dmsExternalId = await this.provider.upload(
        filename,
        content,
        metadata,
      );
      this.logger.log(
        `Document uploaded to DMS: externalId=${dmsExternalId} (deterministicId=${deterministicId}) for case ${caseId}`,
      );
      return { dmsExternalId };
    } catch (error) {
      this.logger.error(
        `DMS upload failed for case ${caseId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * FR-024.A1: Generate a deterministic DMS external ID using SHA-256.
   * Ensures the same document always receives the same ID for idempotent uploads.
   */
  generateDeterministicId(caseId: string, filename: string, content: Buffer): string {
    const contentHash = createHash('sha256').update(content).digest('hex');
    const compositeKey = `${caseId}:${filename}:${contentHash}`;
    return createHash('sha256').update(compositeKey).digest('hex');
  }

  /**
   * Fetch a document from the DMS by its external ID.
   *
   * @param dmsExternalId - The DMS external ID
   * @returns The document content and metadata, or null if not found
   */
  async fetchDocument(
    dmsExternalId: string,
  ): Promise<{ content: Buffer; metadata: Record<string, string> } | null> {
    this.logger.log(`Fetching document from DMS: externalId=${dmsExternalId}`);

    try {
      const result = await this.provider.fetch(dmsExternalId);
      if (!result) {
        this.logger.warn(`Document not found in DMS: ${dmsExternalId}`);
        return null;
      }
      this.logger.log(`Document fetched from DMS: ${dmsExternalId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `DMS fetch failed for ${dmsExternalId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
