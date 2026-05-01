import { Injectable, Logger } from '@nestjs/common';
import { MakerCheckerService } from './maker-checker.service';

@Injectable()
export class MasterChangeReportService {
  private readonly logger = new Logger(MasterChangeReportService.name);

  constructor(private readonly makerCheckerService: MakerCheckerService) {}

  async generateReport(
    entityType: string,
    dateRange: { from: Date; to: Date },
  ): Promise<{
    entityType: string;
    period: { from: string; to: string };
    totalChanges: number;
    changes: Array<{
      changeId: string;
      action: string;
      maker: string;
      checker: string | null;
      status: string;
      submittedAt: string;
      regulatoryLabel: string;
      before: Record<string, any> | null;
      after: Record<string, any> | null;
    }>;
  }> {
    const allChanges = await this.makerCheckerService.getAll(10000);

    const filtered = allChanges.filter(
      (c) =>
        c.master_table === entityType &&
        c.submitted_at >= dateRange.from &&
        c.submitted_at <= dateRange.to,
    );

    const changes = filtered.map((c) => ({
      changeId: c.id,
      action: c.action,
      maker: c.maker_id,
      checker: c.checker_id || null,
      status: c.status,
      submittedAt: c.submitted_at.toISOString(),
      regulatoryLabel: this.getRegulatoryLabel(entityType),
      before: c.before_json || null,
      after: c.after_json || null,
    }));

    return {
      entityType,
      period: { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() },
      totalChanges: changes.length,
      changes,
    };
  }

  private getRegulatoryLabel(entityType: string): string {
    const labels: Record<string, string> = {
      property_location_masters: 'RBI_KYC',
      vendor_masters: 'RBI_IT_FRAMEWORK',
      tat_masters: 'RBI_IT_FRAMEWORK',
      case_type_masters: 'DPDP_2023',
    };
    return labels[entityType] || 'GENERAL';
  }
}
