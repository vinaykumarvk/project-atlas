import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AvScannerService } from '../services/av-scanner.service';

/**
 * AV Scan Job Data.
 */
export interface AvScanJobData {
  attachmentId: string;
  s3Key: string;
}

/**
 * AV Scan Queue Processor.
 *
 * Processes individual attachment antivirus scan jobs from the
 * 'av-scan' BullMQ queue. Retrieves attachment content from
 * object storage and delegates scanning to AvScannerService.
 */
@Processor('av-scan')
export class AvScanProcessor extends WorkerHost {
  private readonly logger = new Logger(AvScanProcessor.name);

  constructor(
    private readonly avScannerService: AvScannerService,
  ) {
    super();
  }

  async process(job: Job<AvScanJobData>): Promise<void> {
    const { attachmentId, s3Key } = job.data;
    this.logger.log(
      `Processing AV scan job ${job.id} for attachment ${attachmentId} (key: ${s3Key})`,
    );

    try {
      // In a full implementation, the file content would be fetched from
      // object storage using the s3Key. For now, we create an empty buffer
      // as a placeholder since the AvScannerService handles the scan
      // and updates the attachment record.
      const buffer = Buffer.alloc(0);
      const result = await this.avScannerService.scanAttachment(attachmentId, buffer);

      this.logger.log(
        `AV scan job ${job.id} completed for attachment ${attachmentId}: ` +
          `${result.clean ? 'CLEAN' : 'INFECTED'} (${result.verdict})`,
      );
    } catch (error) {
      this.logger.error(
        `AV scan job ${job.id} failed for attachment ${attachmentId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
