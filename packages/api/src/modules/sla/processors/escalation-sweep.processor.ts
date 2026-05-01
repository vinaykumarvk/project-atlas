import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../common/prisma';
import { EscalationService } from '../services/escalation.service';
import { CaseStatus, CaseRecord } from '../../cases/types';

/**
 * Escalation Sweep Processor.
 *
 * Runs as a repeatable job every 5 minutes via the 'escalation-sweep'
 * BullMQ queue. On each sweep it queries open cases from the database
 * and invokes `escalationService.checkAndEscalate()` for each case
 * to trigger any pending SLA escalation actions.
 */
@Processor('escalation-sweep')
export class EscalationSweepProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(EscalationSweepProcessor.name);

  constructor(
    @InjectQueue('escalation-sweep') private readonly sweepQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly escalationService: EscalationService,
  ) {
    super();
  }

  /**
   * Register the repeatable job on module initialization.
   * Runs every 5 minutes to sweep open cases for escalation.
   */
  async onModuleInit(): Promise<void> {
    // Remove any existing repeatable jobs to avoid duplicates
    const existingJobs = await this.sweepQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await this.sweepQueue.removeRepeatableByKey(job.key);
    }

    // Add a repeatable job running every 5 minutes
    await this.sweepQueue.add(
      'sweep',
      {},
      {
        repeat: {
          every: 5 * 60 * 1000, // 5 minutes in milliseconds
        },
      },
    );

    this.logger.log('Escalation sweep repeatable job registered (every 5 minutes)');
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Escalation sweep started (job ${job.id})`);

    try {
      // Query all open cases (not CLOSED or CANCELLED).
      // The escalation logic only needs case metadata fields (id, status,
      // caseType, priority, assignedFprId, tatTargetAt, createdAt), all of
      // which live directly on the Case model.
      const openCases = await this.prisma.case.findMany({
        where: {
          status: {
            notIn: [CaseStatus.CLOSED, CaseStatus.CANCELLED],
          },
        },
      });

      this.logger.log(`Found ${openCases.length} open case(s) to check for escalation`);

      let totalEscalations = 0;
      const now = new Date();

      for (const dbCase of openCases) {
        // Map DB record to CaseRecord interface.
        // Fields not on the Case table (subject, from, languageDetected)
        // are set to defaults since escalation logic does not use them.
        const caseRecord: CaseRecord = {
          id: dbCase.id,
          caseNumber: dbCase.case_number,
          emailIngestId: dbCase.email_ingest_id ?? '',
          subject: '',
          from: '',
          status: dbCase.status as CaseStatus,
          caseType: dbCase.case_type,
          priority: dbCase.priority,
          assignedFprId: dbCase.assigned_fpr_id ?? undefined,
          confidenceBand: dbCase.confidence_band ?? 'GREEN',
          languageDetected: 'en',
          tatTargetAt: dbCase.tat_target_at ?? undefined,
          createdAt: dbCase.created_at,
          updatedAt: dbCase.updated_at,
          activityLog: [],
          linkedCaseIds: [],
        };

        const actions = this.escalationService.checkAndEscalate(caseRecord, now);
        if (actions.length > 0) {
          totalEscalations += actions.length;
          this.logger.log(
            `Case ${caseRecord.caseNumber}: ${actions.length} escalation(s) triggered ` +
              `[${actions.map((a) => a.level).join(', ')}]`,
          );
        }
      }

      this.logger.log(
        `Escalation sweep completed: ${totalEscalations} escalation(s) triggered across ${openCases.length} case(s)`,
      );
    } catch (error) {
      this.logger.error(`Escalation sweep failed: ${(error as Error).message}`);
      throw error;
    }
  }
}
