import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

@Injectable()
export class QuarantinePurgeService {
  private readonly logger = new Logger(QuarantinePurgeService.name);
  private readonly PURGE_AFTER_DAYS = 90;

  constructor(private readonly prisma: PrismaService) {}

  async schedulePurge(): Promise<{ purgedCount: number; skippedLegalHold: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.PURGE_AFTER_DAYS);

    const quarantinedEmails = await this.prisma.emailIngest.findMany({
      where: {
        ingest_status: 'QUARANTINED',
        created_at: { lt: cutoffDate },
      },
      select: { id: true, legal_hold: true, message_id: true },
    });

    let purgedCount = 0;
    let skippedLegalHold = 0;

    for (const email of quarantinedEmails) {
      if (this.isUnderLegalHold(email)) {
        skippedLegalHold++;
        this.logger.debug(`Skipping purge for email ${email.id} — under legal hold`);
        continue;
      }

      await this.purge(email.id);
      purgedCount++;
    }

    this.logger.log(
      `Quarantine purge complete: purged=${purgedCount}, skippedLegalHold=${skippedLegalHold}`,
    );

    return { purgedCount, skippedLegalHold };
  }

  isUnderLegalHold(email: { legal_hold?: boolean | null }): boolean {
    return email.legal_hold === true;
  }

  async purge(emailId: string): Promise<void> {
    await this.prisma.emailIngest.update({
      where: { id: emailId },
      data: {
        ingest_status: 'PURGED',
        purged_at: new Date(),
        body_text: null,
        body_html: null,
      },
    });
    this.logger.debug(`Purged quarantined email ${emailId}`);
  }
}
