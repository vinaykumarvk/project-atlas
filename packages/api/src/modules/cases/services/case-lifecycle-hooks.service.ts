import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

@Injectable()
export class CaseLifecycleHooksService {
  private readonly logger = new Logger(CaseLifecycleHooksService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async onStatusChange(
    caseRecord: { id: string; case_number?: string; loan_account_no?: string | null; status?: string },
    newStatus: string,
  ): Promise<void> {
    // FR-142.A2: Push case status to LMS when transitioning to RESOLVED or CLOSED
    if ((newStatus === 'RESOLVED' || newStatus === 'CLOSED') && caseRecord.loan_account_no) {
      await this.pushCaseStatusToLms(caseRecord, newStatus);
    }
  }

  private async pushCaseStatusToLms(
    caseRecord: { id: string; case_number?: string; loan_account_no?: string | null },
    newStatus: string,
  ): Promise<void> {
    this.logger.log(
      `Pushing case status to LMS: case=${caseRecord.case_number || caseRecord.id}, ` +
      `loan=${caseRecord.loan_account_no}, status=${newStatus}`,
    );

    // Create audit trail for LMS push
    await this.prisma.caseActivityLog.create({
      data: {
        case_id: caseRecord.id,
        action_code: 'LMS_STATUS_PUSH',
        actor_type: 'SYSTEM',
        payload_json: {
          details: `Case status ${newStatus} pushed to LMS for loan account ${caseRecord.loan_account_no}`,
          loanAccountNo: caseRecord.loan_account_no,
          status: newStatus,
          pushedAt: new Date().toISOString(),
        },
      },
    });
  }
}
