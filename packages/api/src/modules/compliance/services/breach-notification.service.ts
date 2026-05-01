import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class BreachNotificationService {
  private readonly logger = new Logger(BreachNotificationService.name);
  private readonly BREACH_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours

  constructor(
    @InjectQueue('breach-notification') private readonly breachQueue: Queue,
    @Optional() private readonly notificationService?: { send(payload: { template: string; channel: string; recipients: string[]; context: Record<string, string> }): Promise<void> },
  ) {}

  async startBreachWindow(caseId: string, breachType: string): Promise<string> {
    const job = await this.breachQueue.add(
      'breach-deadline',
      { caseId, breachType, startedAt: new Date().toISOString() },
      { delay: this.BREACH_WINDOW_MS, jobId: `breach-${caseId}-${Date.now()}` },
    );
    this.logger.log(`Breach window started for case=${caseId} type=${breachType} jobId=${job.id}`);
    return job.id!;
  }

  async cancelBreachWindow(jobId: string): Promise<boolean> {
    const job = await this.breachQueue.getJob(jobId);
    if (job && (await job.isDelayed())) {
      await job.remove();
      this.logger.log(`Breach window cancelled jobId=${jobId}`);
      return true;
    }
    this.logger.warn(`Cannot cancel breach window jobId=${jobId} — not found or not delayed`);
    return false;
  }

  async onBreachDeadlineReached(caseId: string, breachType: string): Promise<void> {
    this.logger.warn(`72h breach deadline reached for case=${caseId} type=${breachType}`);
    if (this.notificationService) {
      await this.notificationService.send({
        template: 'BREACH_NOTIFICATION_72H',
        channel: 'EMAIL',
        recipients: ['DPO', 'COMPLIANCE_OFFICER'],
        context: { caseId, breachType, deadline: '72h' },
      });
    }
  }
}
