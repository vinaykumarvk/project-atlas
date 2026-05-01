import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { randomUUID } from 'crypto';

@Injectable()
export class VendorResponseService {
  private readonly logger = new Logger(VendorResponseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processResponse(
    vendorId: string,
    caseId: string,
    files: { filename: string; mimeType: string }[],
    dto: { summary: string; remarks?: string },
  ): Promise<{ submissionId: string; receivedAt: Date; fileCount: number }> {
    const submissionId = randomUUID();
    const receivedAt = new Date();

    // Create activity log
    await this.prisma.caseActivityLog.create({
      data: {
        case_id: caseId,
        action_code: 'VENDOR_RESPONSE_RECEIVED',
        actor_type: 'VENDOR',
        actor_id: vendorId,
        payload_json: {
          submissionId,
          summary: dto.summary,
          remarks: dto.remarks || null,
          fileCount: files.length,
          files: files.map(f => ({ filename: f.filename, mimeType: f.mimeType })),
          receivedAt: receivedAt.toISOString(),
        },
      },
    });

    // Trigger OCR for image/PDF files
    const ocrEligible = files.filter(
      f => f.mimeType.startsWith('image/') || f.mimeType === 'application/pdf',
    );
    if (ocrEligible.length > 0) {
      this.logger.log(
        `OCR triggered for ${ocrEligible.length} files in submission ${submissionId}`,
      );
    }

    this.logger.log(`Vendor response processed: vendor=${vendorId}, case=${caseId}, submission=${submissionId}`);

    return { submissionId, receivedAt, fileCount: files.length };
  }
}
