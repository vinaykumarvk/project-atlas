import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PendencyReportService } from '../services/pendency-report.service';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { PrismaService } from '../../../common/prisma';
import { NotificationChannel } from '../types';

export interface PendencyReportJobData {
  /** Override date for testing; if absent, uses current date. */
  date?: string;
  /** Schedule ID that triggered this job. */
  scheduleId?: string;
}

/**
 * Pendency Report Processor (FR-070 A1).
 *
 * BullMQ processor that runs as a repeatable cron job (03:00 UTC = 08:30 IST).
 * Generates the daily BRD-compliant pendency report and dispatches it via
 * notification channels defined in PendencyReportSchedule.
 */
@Processor('pendency-report')
export class PendencyReportProcessor extends WorkerHost {
  private readonly logger = new Logger(PendencyReportProcessor.name);

  constructor(
    private readonly pendencyReportService: PendencyReportService,
    private readonly notificationDispatchService: NotificationDispatchService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<PendencyReportJobData>): Promise<void> {
    const reportDate = job.data.date ? new Date(job.data.date) : new Date();
    this.logger.log(`Processing pendency report job ${job.id} for date ${reportDate.toISOString()}`);

    try {
      // Fetch all active schedules
      const schedules = await this.prisma.pendencyReportSchedule.findMany({
        where: { is_active: true },
      });

      if (schedules.length === 0) {
        this.logger.warn('No active pendency report schedules found. Generating default report.');

        // Generate default report without filters
        const report = await this.pendencyReportService.generateBrdReport(reportDate);
        this.logger.log(
          `Default report generated: ${report.summary.totalOverdue} overdue, ` +
          `${report.summary.totalDueToday} due today, ` +
          `${report.summary.totalNewSinceLastReport} new, ` +
          `${report.summary.totalApproachingDeadline} approaching deadline`,
        );
        return;
      }

      // Process each schedule
      for (const schedule of schedules) {
        try {
          // Build filters from schedule (FR-071 A1: region + case_type)
          const filters: Record<string, string | undefined> = {};
          const scheduleAny = schedule as Record<string, unknown>;
          if (scheduleAny.region) {
            filters.region = scheduleAny.region as string;
          }
          if (scheduleAny.case_type) {
            filters.caseType = scheduleAny.case_type as string;
          }

          const reportFilters = Object.keys(filters).length > 0 ? filters : undefined;

          // Generate BRD-compliant report
          const report = await this.pendencyReportService.generateBrdReport(
            reportDate,
            reportFilters as { region?: string; caseType?: string } | undefined,
          );

          this.logger.log(
            `Report for schedule ${schedule.id} (${schedule.recipient_role}): ` +
            `${report.summary.totalOverdue} overdue, ` +
            `${report.summary.totalDueToday} due today`,
          );

          // FR-070 A5: Multi-channel dispatch
          const channels = schedule.channels || ['EMAIL'];
          for (const channel of channels) {
            const notifChannel = channel as NotificationChannel;

            // Determine body based on channel
            const body = notifChannel === NotificationChannel.EMAIL
              ? (report.html || report.plainText || 'See attached report')
              : (report.plainText || 'See attached report');

            try {
              await this.notificationDispatchService.send(
                schedule.recipient_id || schedule.recipient_role,
                notifChannel,
                'DAILY_DIGEST',
                {
                  date: reportDate.toISOString().split('T')[0],
                  total_open: String(
                    report.summary.totalOverdue +
                    report.summary.totalDueToday +
                    report.summary.totalNewSinceLastReport +
                    report.summary.totalApproachingDeadline,
                  ),
                  total_breached: String(report.summary.totalOverdue),
                  new_today: String(report.summary.totalNewSinceLastReport),
                  report_body: body,
                },
              );

              this.logger.log(
                `Dispatched pendency report to ${schedule.recipient_role} via ${channel}`,
              );
            } catch (sendError) {
              this.logger.error(
                `Failed to dispatch report via ${channel} for schedule ${schedule.id}: ` +
                `${(sendError as Error).message}`,
              );
            }
          }

          // Update last_run_at
          await this.prisma.pendencyReportSchedule.update({
            where: { id: schedule.id },
            data: { last_run_at: new Date() },
          }).catch((err) =>
            this.logger.warn(`Failed to update last_run_at: ${err.message}`),
          );
        } catch (scheduleError) {
          this.logger.error(
            `Error processing schedule ${schedule.id}: ${(scheduleError as Error).message}`,
          );
        }
      }

      this.logger.log(`Pendency report job ${job.id} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Pendency report job ${job.id} failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
