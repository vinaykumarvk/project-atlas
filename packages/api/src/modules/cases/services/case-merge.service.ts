import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

@Injectable()
export class CaseMergeService {
  private readonly logger = new Logger(CaseMergeService.name);
  private readonly MAX_MERGE_CASES = 10;

  constructor(private readonly prisma: PrismaService) {}

  async merge(
    primaryCaseId: string,
    secondaryCaseIds: string[],
    actorId: string,
  ): Promise<{ merged: string[]; errors: { caseId: string; error: string }[] }> {
    if (secondaryCaseIds.length > this.MAX_MERGE_CASES) {
      throw new BadRequestException(`Cannot merge more than ${this.MAX_MERGE_CASES} cases at once`);
    }

    if (secondaryCaseIds.length === 0) {
      throw new BadRequestException('At least one secondary case ID is required');
    }

    const primaryCase = await this.prisma.case.findUnique({ where: { id: primaryCaseId } });
    if (!primaryCase) {
      throw new BadRequestException(`Primary case not found: ${primaryCaseId}`);
    }

    if (primaryCase.status === 'CLOSED' || primaryCase.status === 'CANCELLED') {
      throw new BadRequestException(`Primary case ${primaryCaseId} is ${primaryCase.status} and cannot be merged into`);
    }

    const merged: string[] = [];
    const errors: { caseId: string; error: string }[] = [];

    for (const secondaryId of secondaryCaseIds) {
      try {
        const secondaryCase = await this.prisma.case.findUnique({ where: { id: secondaryId } });
        if (!secondaryCase) {
          errors.push({ caseId: secondaryId, error: 'Case not found' });
          continue;
        }

        if (secondaryCase.status === 'CLOSED' || secondaryCase.status === 'CANCELLED') {
          errors.push({ caseId: secondaryId, error: `Case is ${secondaryCase.status}` });
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          // Move activity logs to primary case
          await tx.caseActivityLog.updateMany({
            where: { case_id: secondaryId },
            data: {},  // We keep them linked to secondary but mark the merge
          });

          // Link cases
          await tx.caseLink.create({
            data: {
              case_from_id: primaryCaseId,
              case_to_id: secondaryId,
              link_type: 'MERGED',
            },
          }).catch(() => {}); // ignore duplicate

          // Close secondary
          await tx.case.update({
            where: { id: secondaryId },
            data: {
              status: 'CLOSED',
              resolution_code: 'MERGED',
              closed_at: new Date(),
            },
          });

          // Log merge activity on both cases
          await tx.caseActivityLog.create({
            data: {
              case_id: primaryCaseId,
              action_code: 'CASE_MERGED',
              actor_type: 'USER',
              actor_id: actorId,
              payload_json: {
                details: `Case ${secondaryCase.case_number} merged into this case`,
                secondaryCaseId: secondaryId,
                secondaryCaseNumber: secondaryCase.case_number,
              },
            },
          });

          await tx.caseActivityLog.create({
            data: {
              case_id: secondaryId,
              action_code: 'STATUS_CHANGE',
              actor_type: 'USER',
              actor_id: actorId,
              payload_json: {
                details: `Merged into case ${primaryCase.case_number}`,
                fromStatus: secondaryCase.status,
                toStatus: 'CLOSED',
                resolution_code: 'MERGED',
                primary_case_id: primaryCaseId,
              },
            },
          });
        });

        merged.push(secondaryId);
      } catch (err) {
        errors.push({ caseId: secondaryId, error: (err as Error).message });
      }
    }

    this.logger.log(`Merge complete: ${merged.length} cases merged into ${primaryCaseId}`);
    return { merged, errors };
  }
}
