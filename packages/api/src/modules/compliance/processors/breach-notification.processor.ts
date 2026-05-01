import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BreachNotificationService } from '../services/breach-notification.service';

@Processor('breach-notification')
export class BreachNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(BreachNotificationProcessor.name);

  constructor(private readonly breachService: BreachNotificationService) {
    super();
  }

  async process(job: Job<{ caseId: string; breachType: string; startedAt: string }>): Promise<void> {
    this.logger.log(`Processing breach notification job=${job.id} case=${job.data.caseId}`);
    await this.breachService.onBreachDeadlineReached(job.data.caseId, job.data.breachType);
  }
}
