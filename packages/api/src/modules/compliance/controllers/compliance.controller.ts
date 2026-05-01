import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { MfaGuard } from '../../../common/guards/mfa.guard';
import { Roles } from '../../../common/guards/roles.decorator';
import { RequiresMfa } from '../../../common/guards/requires-mfa.decorator';
import { UserRole } from '../../auth/auth.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { ConsentLedgerService } from '../services/consent-ledger.service';
import { DsrService } from '../services/dsr.service';
import { CrossBorderApprovalService } from '../services/cross-border-approval.service';
import { MakerCheckerService, ChangeStatus as MasterChangeStatus } from '../../masters/services/maker-checker.service';
import { Audited } from '../../audit/decorators/audited.decorator';
import { RegulatoryEvidenceService } from '../services/regulatory-evidence.service';

// ───────────────────────────────────────────────────────────
// Controller
// ───────────────────────────────────────────────────────────

@ApiTags('Compliance')
@ApiBearerAuth()
@Controller('compliance')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Audited({ resourceType: 'COMPLIANCE' })
export class ComplianceController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly consentLedgerService: ConsentLedgerService,
    private readonly dsrService: DsrService,
    private readonly crossBorderApprovalService: CrossBorderApprovalService,
    private readonly makerCheckerService: MakerCheckerService,
    private readonly regulatoryEvidenceService: RegulatoryEvidenceService,
  ) {}

  // ─────────────────────────────────────────────────────────
  // Audit Logs
  // ─────────────────────────────────────────────────────────

  @Get('audit-logs')
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Query audit logs (COMPLIANCE_OFFICER role)' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  async queryAuditLogs(
    @Query('event_code') eventCode?: string,
    @Query('actor_id') actorId?: string,
    @Query('resource_type') resourceType?: string,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogService.query({
      event_code: eventCode,
      actor_id: actorId,
      resource_type: resourceType,
      from_date: fromDate ? new Date(fromDate) : undefined,
      to_date: toDate ? new Date(toDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('audit-logs/verify')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Verify audit log hash chain integrity' })
  @ApiResponse({ status: 200, description: 'Chain verification result' })
  async verifyAuditChain(
    @Body() body: { from_id?: string; to_id?: string },
  ) {
    return this.auditLogService.verifyChain(body.from_id, body.to_id);
  }

  // ─────────────────────────────────────────────────────────
  // Consent Ledger
  // ─────────────────────────────────────────────────────────

  @Get('consent/:subjectId')
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Get consents for a data subject' })
  @ApiResponse({ status: 200, description: 'List of consent entries' })
  async getConsents(@Param('subjectId') subjectId: string) {
    return this.consentLedgerService.getConsentsForSubject(subjectId);
  }

  // ─────────────────────────────────────────────────────────
  // Data Subject Requests (DSR)
  // ─────────────────────────────────────────────────────────

  @Post('dsr')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Submit a Data Subject Request' })
  @ApiResponse({ status: 201, description: 'DSR created' })
  async submitDsr(
    @Body() body: { data_subject_id: string; requested_by: string },
  ) {
    return this.dsrService.submitAccessRequest(
      body.data_subject_id,
      body.requested_by,
    );
  }

  @Get('dsr')
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'List Data Subject Requests' })
  @ApiResponse({ status: 200, description: 'Paginated DSR list' })
  async listDsr(
    @Query('data_subject_id') dataSubjectId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dsrService.getRequests({
      data_subject_id: dataSubjectId,
      status: status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED',
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ─────────────────────────────────────────────────────────
  // Evidence Pack
  // ─────────────────────────────────────────────────────────

  @Get('evidence-pack')
  @RequiresMfa()
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({
    summary: 'Generate enhanced compliance evidence pack for a date range',
  })
  @ApiResponse({ status: 200, description: 'Enhanced evidence pack data' })
  async generateEvidencePack(
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    // Support both from_date/to_date and dateFrom/dateTo param styles
    const from = (dateFrom || fromDate) ? new Date(dateFrom || fromDate!) : new Date(0);
    const to = (dateTo || toDate) ? new Date(dateTo || toDate!) : new Date();

    // Gather audit logs in range
    const auditLogs = await this.auditLogService.query({
      from_date: from,
      to_date: to,
      limit: 10000,
    });

    // Verify chain integrity
    const chainIntegrity = await this.auditLogService.verifyChain();

    // Gather consent records in date range
    const consentRecords = await this.consentLedgerService.getConsentsInRange(from, to);

    // Gather DSR request history in date range
    const dsrRequests = await this.dsrService.getRequests({
      page: 1,
      limit: 10000,
    });
    const dsrInRange = dsrRequests.data.filter(
      (r) => r.created_at >= from && r.created_at <= to,
    );

    // Gather PII access events (event_code like 'PII_%')
    const piiAccessEvents = await this.auditLogService.query({
      event_code: 'PII_%',
      from_date: from,
      to_date: to,
      limit: 10000,
    });

    // Gather data export events (event_code like 'EXPORT_%')
    const dataExportEvents = await this.auditLogService.query({
      event_code: 'EXPORT_%',
      from_date: from,
      to_date: to,
      limit: 10000,
    });

    return {
      generated_at: new Date().toISOString(),
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      summary: {
        total_audit_entries: auditLogs.total,
        chain_integrity: chainIntegrity,
        total_consent_records: consentRecords.length,
        total_dsr_requests: dsrInRange.length,
        total_pii_access_events: piiAccessEvents.total,
        total_data_export_events: dataExportEvents.total,
      },
      audit_logs: auditLogs.data,
      consent_records: consentRecords,
      dsr_requests: dsrInRange,
      pii_access_events: piiAccessEvents.data,
      data_export_events: dataExportEvents.data,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Cross-Border Approval (FR-121.A2)
  // ─────────────────────────────────────────────────────────

  @Post('cross-border-approval')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Approve cross-border data transfer (SYS_ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Cross-border approval created' })
  async approveCrossBorderTransfer(
    @Body() body: { sourceRegion: string; targetRegion: string; reason: string },
  ) {
    const approval = this.crossBorderApprovalService.createApproval(
      body.sourceRegion,
      body.targetRegion,
      body.reason,
      'SYS_ADMIN', // In production, extract from JWT
    );

    // Log to audit
    await this.auditLogService.emit({
      event_code: 'CROSS_BORDER_APPROVED',
      actor_type: 'USER',
      resource_type: 'CrossBorderApproval',
      resource_id: approval.id,
      action: 'CREATE',
      payload_json: {
        sourceRegion: body.sourceRegion,
        targetRegion: body.targetRegion,
        reason: body.reason,
        expiresAt: approval.expiresAt.toISOString(),
      },
    });

    return approval;
  }

  // ─────────────────────────────────────────────────────────
  // Feature Flag Audit Log (FR-151.A2)
  // ─────────────────────────────────────────────────────────

  @Post('feature-flags/audit')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Log a feature flag change (SYS_ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Feature flag change logged' })
  async auditFeatureFlagChange(
    @Body()
    body: {
      flag_name: string;
      old_value: string | boolean;
      new_value: string | boolean;
      changed_by: string;
    },
  ) {
    const entry = await this.auditLogService.emit({
      event_code: 'FEATURE_FLAG_CHANGE',
      actor_id: body.changed_by,
      actor_type: 'USER',
      resource_type: 'FeatureFlag',
      resource_id: body.flag_name,
      action: 'UPDATE',
      payload_json: {
        flag_name: body.flag_name,
        old_value: body.old_value,
        new_value: body.new_value,
        changed_by: body.changed_by,
      },
    });

    return entry;
  }

  // ─────────────────────────────────────────────────────────
  // Data Export (FR-123.A3)
  // ─────────────────────────────────────────────────────────

  @Post('export')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Request a data export (COMPLIANCE_OFFICER or SYS_ADMIN)' })
  @ApiResponse({ status: 201, description: 'Export queued' })
  async requestExport(
    @Body()
    body: {
      resource_type: string;
      reason: string;
      format?: 'csv' | 'json';
    },
  ) {
    // Validate reason is non-empty
    if (!body.reason || body.reason.trim().length === 0) {
      throw new BadRequestException('A non-empty reason is required for data exports.');
    }

    const exportId = randomUUID();

    // Log export via audit log
    await this.auditLogService.emit({
      event_code: 'DATA_EXPORT',
      actor_type: 'USER',
      resource_type: body.resource_type,
      resource_id: exportId,
      action: 'EXPORT',
      payload_json: {
        resource_type: body.resource_type,
        reason: body.reason.trim(),
        format: body.format ?? 'json',
        exportId,
      },
    });

    return { exportId, status: 'queued' as const };
  }

  // ─────────────────────────────────────────────────────────
  // RBI Audit Pack (FR-114.A2)
  // ─────────────────────────────────────────────────────────

  @Get('rbi-audit-pack')
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Generate RBI audit pack (COMPLIANCE_OFFICER or SYS_ADMIN)' })
  @ApiResponse({ status: 200, description: 'RBI audit pack data' })
  async getRbiAuditPack() {
    // Gather DSR summary
    const dsrRequests = await this.dsrService.getRequests({ page: 1, limit: 100000 });
    const dsrByStatus: Record<string, number> = {};
    for (const dsr of dsrRequests.data) {
      dsrByStatus[dsr.status] = (dsrByStatus[dsr.status] || 0) + 1;
    }

    // Gather consent stats
    const consentRecords = await this.consentLedgerService.getConsentsInRange(
      new Date(0),
      new Date(),
    );
    const consentsByPurpose: Record<string, number> = {};
    for (const consent of consentRecords) {
      const purpose = (consent as unknown as Record<string, unknown>).purpose as string || 'unknown';
      consentsByPurpose[purpose] = (consentsByPurpose[purpose] || 0) + 1;
    }

    // Gather breach events from audit logs
    const breachEvents = await this.auditLogService.query({
      event_code: 'DATA_BREACH%',
      limit: 10000,
    });

    // Data residency status
    const allApprovals = this.crossBorderApprovalService.listApprovals();
    const now = new Date();
    const crossBorderApprovals = allApprovals.filter(
      (a) => a.expiresAt > now,
    );

    const generatedAt = new Date().toISOString();

    return {
      generatedAt,
      sections: {
        dsrSummary: {
          totalRequests: dsrRequests.total,
          byStatus: dsrByStatus,
        },
        consentStats: {
          totalRecords: consentRecords.length,
          byPurpose: consentsByPurpose,
        },
        breachReport: {
          totalBreachEvents: breachEvents.total,
          events: breachEvents.data,
        },
        dataResidencyStatus: {
          activeCrossBorderApprovals: Array.isArray(crossBorderApprovals)
            ? crossBorderApprovals.length
            : 0,
          approvals: crossBorderApprovals,
        },
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // Master Change Aggregate Report (FR-114.A3)
  // ─────────────────────────────────────────────────────────

  @Get('master-changes/aggregate')
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Aggregate master data change report' })
  @ApiResponse({ status: 200, description: 'Aggregated change statistics' })
  async getMasterChangeAggregateReport(
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
  ) {
    const allChanges = await this.makerCheckerService.getAll(50000);

    // Apply date filters
    let filtered: typeof allChanges = allChanges;
    if (fromDate) {
      const from = new Date(fromDate);
      filtered = filtered.filter((c: typeof allChanges[number]) => c.submitted_at >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      filtered = filtered.filter((c: typeof allChanges[number]) => c.submitted_at <= to);
    }

    // Group by master_table
    const byTable: Record<string, Record<string, number>> = {};
    const byStatus: Record<string, number> = {};

    for (const change of filtered) {
      const table = change.master_table || 'unknown';
      const action = change.action || 'UPDATE';
      const status = change.status || 'PENDING';

      if (!byTable[table]) byTable[table] = {};
      byTable[table][action] = (byTable[table][action] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    return {
      summary: {
        totalChanges: filtered.length,
        totalApproved: byStatus['APPROVED'] || 0,
        totalRejected: byStatus['REJECTED'] || 0,
        totalPending: byStatus['PENDING'] || 0,
      },
      byTable,
      byStatus,
      dateRange: {
        from: fromDate || null,
        to: toDate || null,
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // Regulatory Evidence (FR-165)
  // ─────────────────────────────────────────────────────────

  @Get('regulatory-evidence')
  @RequiresMfa()
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Generate consolidated regulatory evidence pack' })
  @ApiResponse({ status: 200, description: 'Regulatory evidence report' })
  async generateRegulatoryEvidence(
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
  ) {
    const from = fromDate ? new Date(fromDate) : new Date(0);
    const to = toDate ? new Date(toDate) : new Date();
    const report = await this.regulatoryEvidenceService.generateRegulatoryEvidence(from, to);
    return { data: report };
  }
}
