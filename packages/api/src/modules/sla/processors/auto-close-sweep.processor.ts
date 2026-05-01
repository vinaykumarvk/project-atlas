import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

@Injectable()
export class AutoCloseSweepProcessor {
  private readonly logger = new Logger(AutoCloseSweepProcessor.name);
  private readonly AUTO_CLOSE_DAYS = 30;

  constructor(private readonly prisma: PrismaService) {}

  async process(): Promise<{ closedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.AUTO_CLOSE_DAYS);

    const resolvedCases = await this.prisma.case.findMany({
      where: {
        status: 'RESOLVED',
        updated_at: { lt: cutoffDate },
      },
      select: { id: true, case_number: true },
    });

    let closedCount = 0;

    for (const c of resolvedCases) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.case.update({
            where: { id: c.id },
            data: {
              status: 'CLOSED',
              closed_at: new Date(),
              resolution_code: 'AUTO_CLOSED',
            },
          });

          await tx.caseActivityLog.create({
            data: {
              case_id: c.id,
              action_code: 'STATUS_CHANGE',
              actor_type: 'SYSTEM',
              payload_json: {
                details: `Auto-closed after ${this.AUTO_CLOSE_DAYS} days in RESOLVED status`,
                fromStatus: 'RESOLVED',
                toStatus: 'CLOSED',
                resolution_code: 'AUTO_CLOSED',
              },
            },
          });
        });

        closedCount++;
        this.logger.log(`Auto-closed case ${c.case_number}`);
      } catch (err) {
        this.logger.error(`Failed to auto-close case ${c.case_number}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Auto-close sweep complete: ${closedCount} cases closed`);
    return { closedCount };
  }
}
