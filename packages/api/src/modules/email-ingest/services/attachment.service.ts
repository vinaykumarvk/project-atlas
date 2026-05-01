import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { PrismaService } from '../../../common/prisma';
import { ObjectStorageService } from '../../../common/services/object-storage.service';
import { AvScannerService } from './av-scanner.service';
import { RawEmail, RawAttachment } from '../types';

/**
 * Whitelist of allowed MIME types for attachments (FR-security).
 */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'text/csv',
  'message/rfc822',
]);

/**
 * Maximum file size in bytes — FR-020.A2: configurable via ATTACHMENT_MAX_FILE_MB env var.
 * Default: 25 MB.
 */
export const MAX_FILE_SIZE_BYTES =
  (parseInt(process.env.ATTACHMENT_MAX_FILE_MB || '25', 10)) * 1024 * 1024;

/**
 * Maximum aggregate size in bytes for all attachments per email — FR-020.A2: configurable via ATTACHMENT_MAX_AGGREGATE_MB env var.
 * Default: 75 MB.
 */
export const MAX_AGGREGATE_SIZE_BYTES =
  (parseInt(process.env.ATTACHMENT_MAX_AGGREGATE_MB || '75', 10)) * 1024 * 1024;

/**
 * Represents a stored attachment record.
 */
export interface StoredAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
  checksumSha256: string;
  isInline: boolean;
}

/**
 * Attachment Service.
 *
 * Handles extraction, deduplication, and storage of email attachments.
 * Stores binary content in object storage and creates CaseAttachment
 * records in the database.
 */
@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
    @Inject(forwardRef(() => AvScannerService))
    private readonly avScannerService: AvScannerService,
    @InjectQueue('av-scan') private readonly avScanQueue: Queue,
  ) {}

  /**
   * Extract attachments from a raw email, including inline images.
   * Returns the list of RawAttachment objects found in the email.
   */
  extractAttachments(rawEmail: RawEmail): RawAttachment[] {
    const attachments: RawAttachment[] = [];

    // Direct attachments from the email
    if (rawEmail.attachments && rawEmail.attachments.length > 0) {
      attachments.push(...rawEmail.attachments);
    }

    // Extract embedded inline images from HTML body (cid: references)
    if (rawEmail.bodyHtml) {
      const inlineImages = this.extractInlineImages(rawEmail.bodyHtml, rawEmail.attachments);
      for (const img of inlineImages) {
        // Only add if not already in the attachments list
        const isDuplicate = attachments.some(
          (a) => a.filename === img.filename && a.sizeBytes === img.sizeBytes,
        );
        if (!isDuplicate) {
          attachments.push(img);
        }
      }
    }

    return attachments;
  }

  /**
   * Store a single attachment: upload to object storage and create a
   * CaseAttachment record in the database.
   *
   * Performs SHA-256 deduplication: if an attachment with the same hash
   * already exists for the same case, it is skipped.
   *
   * @param caseId - The case to associate the attachment with
   * @param attachment - The raw attachment data
   * @param emailIngestId - Optional email ingest record ID
   * @returns The stored attachment record, or null if it was a duplicate
   */
  async storeAttachment(
    caseId: string,
    attachment: RawAttachment,
    emailIngestId?: string,
  ): Promise<StoredAttachment | null> {
    // Validate MIME type against whitelist
    if (!ALLOWED_MIME_TYPES.has(attachment.mimeType.toLowerCase())) {
      throw new BadRequestException(
        `File type not allowed: ${attachment.mimeType}. Allowed types: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    // FR-001.BR: Oversized files stored in separate prefix instead of rejected
    const isOversized = attachment.content.length > MAX_FILE_SIZE_BYTES;

    // Compute SHA-256 hash for deduplication
    const checksumSha256 = this.computeSha256(attachment.content);

    // Check for duplicate by hash within the same case
    const existing = await this.prisma.caseAttachment.findFirst({
      where: {
        case_id: caseId,
        checksum_sha256: checksumSha256,
      },
    });

    if (existing) {
      this.logger.debug(
        `Duplicate attachment skipped: ${attachment.filename} (SHA-256: ${checksumSha256.substring(0, 16)}...)`,
      );
      return null;
    }

    // Generate storage key
    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { case_number: true },
    });
    const caseNumber = caseRecord?.case_number || caseId;

    // FR-001.BR: Use 'oversized/' prefix for files exceeding MAX_FILE_SIZE_BYTES
    let s3Key: string;
    if (isOversized) {
      s3Key = `oversized/${this.objectStorage.generateAttachmentKey(caseNumber, attachment.filename)}`;
    } else {
      s3Key = this.objectStorage.generateAttachmentKey(caseNumber, attachment.filename);
    }

    // Upload to object storage
    await this.objectStorage.put(s3Key, attachment.content, {
      'Content-Type': attachment.mimeType,
      'x-amz-meta-checksum-sha256': checksumSha256,
      'x-amz-meta-original-filename': attachment.filename,
    });

    // Determine if this is an inline image
    const isInline = this.isInlineAttachment(attachment);

    // Create database record — mark as OVERSIZED when applicable
    const record = await this.prisma.caseAttachment.create({
      data: {
        case_id: caseId,
        email_ingest_id: emailIngestId || null,
        filename: attachment.filename,
        mime_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
        s3_key: s3Key,
        checksum_sha256: checksumSha256,
        av_scan_status: isOversized ? 'OVERSIZED' : 'PENDING',
      },
    });

    if (isOversized) {
      this.logger.warn(
        `Oversized attachment stored separately: ${attachment.filename} (${attachment.content.length} bytes) -> ${s3Key}`,
      );
    } else {
      this.logger.log(
        `Stored attachment: ${attachment.filename} (${attachment.sizeBytes} bytes) -> ${s3Key}`,
      );
    }

    // Enqueue AV scan job for the newly stored attachment
    await this.avScanQueue.add('scan', {
      attachmentId: record.id,
      s3Key,
    });
    this.logger.debug(`Enqueued AV scan job for attachment ${record.id}`);

    return {
      id: record.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      s3Key,
      checksumSha256,
      isInline,
    };
  }

  /**
   * Process all attachments from a raw email for a given case.
   * Extracts, stores, and returns the list of stored attachment records.
   */
  async processEmailAttachments(
    caseId: string,
    rawEmail: RawEmail,
    emailIngestId?: string,
  ): Promise<StoredAttachment[]> {
    const attachments = this.extractAttachments(rawEmail);

    // FR-020 A2: Reject if aggregate attachment size exceeds 75 MB
    const aggregateSize = attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
    if (aggregateSize > MAX_AGGREGATE_SIZE_BYTES) {
      throw new BadRequestException(
        `Aggregate attachment size ${aggregateSize} bytes exceeds maximum allowed ${MAX_AGGREGATE_SIZE_BYTES} bytes (75 MB)`,
      );
    }

    const stored: StoredAttachment[] = [];

    for (const attachment of attachments) {
      try {
        const result = await this.storeAttachment(caseId, attachment, emailIngestId);
        if (result) {
          stored.push(result);
        }
      } catch (error) {
        this.logger.error(
          `Failed to store attachment ${attachment.filename}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Processed ${stored.length}/${attachments.length} attachments for case ${caseId}`,
    );

    // Trigger AV scanning for all newly stored attachments
    if (stored.length > 0) {
      try {
        await this.avScannerService.scanPendingForCase(caseId);
      } catch (error) {
        this.logger.error(
          `AV scan failed for case ${caseId}: ${(error as Error).message}`,
        );
      }
    }

    return stored;
  }

  /**
   * Get a signed download URL for an attachment.
   */
  async getDownloadUrl(attachmentId: string, expiresInSeconds = 3600): Promise<string> {
    const attachment = await this.prisma.caseAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // Block download of quarantined attachments
    if (attachment.av_scan_status === 'INFECTED') {
      throw new Error('Cannot download quarantined attachment');
    }

    return this.objectStorage.getSignedUrl(attachment.s3_key, expiresInSeconds);
  }

  /**
   * Get attachments for a case.
   */
  async getAttachmentsForCase(caseId: string) {
    return this.prisma.caseAttachment.findMany({
      where: { case_id: caseId, is_deleted: false },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Compute SHA-256 hash of a buffer.
   */
  computeSha256(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Determine if an attachment is an inline image (embedded in HTML body).
   */
  private isInlineAttachment(attachment: RawAttachment): boolean {
    const inlineMimeTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml',
    ];
    return inlineMimeTypes.includes(attachment.mimeType.toLowerCase());
  }

  /**
   * Extract inline images referenced by cid: URLs in the HTML body.
   * These are typically found as data: URIs in the HTML when the email
   * client has already embedded them.
   */
  private extractInlineImages(
    _bodyHtml: string,
    _existingAttachments: RawAttachment[],
  ): RawAttachment[] {
    // Inline images from cid: references are already included in the
    // attachments array from the mail providers. This method handles
    // the case where images are embedded as data: URIs.
    const inlineImages: RawAttachment[] = [];

    const dataUriRegex = /src="data:(image\/[^;]+);base64,([^"]+)"/g;
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = dataUriRegex.exec(_bodyHtml)) !== null) {
      const mimeType = match[1];
      const base64Data = match[2];
      const content = Buffer.from(base64Data, 'base64');
      const ext = mimeType.split('/')[1] || 'bin';

      inlineImages.push({
        filename: `inline-image-${index}.${ext}`,
        mimeType,
        sizeBytes: content.length,
        content,
      });
      index++;
    }

    return inlineImages;
  }
}
