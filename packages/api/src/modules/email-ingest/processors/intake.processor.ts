import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IntakeOrchestratorService } from '../services/intake-orchestrator.service';

/**
 * Intake Queue Processor.
 *
 * Processes intake jobs from the 'intake' BullMQ queue.
 * Each job contains an ingestId and delegates to the
 * IntakeOrchestratorService for the full intake pipeline
 * (classification, case creation, triage, audit).
 */
@Processor('intake')
export class IntakeProcessor extends WorkerHost {
  private readonly logger = new Logger(IntakeProcessor.name);

  constructor(
    private readonly intakeOrchestratorService: IntakeOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<{ ingestId: string }>): Promise<void> {
    const { ingestId } = job.data;
    this.logger.log(`Processing intake job ${job.id} for ingest ${ingestId}`);

    try {
      const result = await this.intakeOrchestratorService.orchestrate(ingestId);
      this.logger.log(
        `Intake job ${job.id} completed: case ${result.caseRecord.caseNumber} ` +
          `[${result.classification.top_label}] triage=${result.requiresTriage}`,
      );
    } catch (error) {
      this.logger.error(
        `Intake job ${job.id} failed for ingest ${ingestId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
