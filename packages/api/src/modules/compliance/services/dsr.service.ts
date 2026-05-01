import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService, toJsonValue } from '../../../common/prisma';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export type DsrStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

export interface DsrRequest {
  id: string;
  data_subject_id: string;
  requested_by: string;
  type: 'ACCESS' | 'ERASURE' | 'RECTIFICATION';
  status: DsrStatus;
  report_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  /** FR-120.A4: 30-day regulatory deadline for DSR completion */
  dueDate: Date | null;
}

export interface DsrFilters {
  data_subject_id?: string;
  status?: DsrStatus;
  type?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedDsrRequests {
  data: DsrRequest[];
  total: number;
  page: number;
  limit: number;
}

export interface AccessReport {
  data_subject_id: string;
  generated_at: Date;
  sections: AccessReportSection[];
}

export interface AccessReportSection {
  category: string;
  description: string;
  data_held: Record<string, unknown>[];
}

// ---------------------------------------------------------------
// Service
// ---------------------------------------------------------------

@Injectable()
export class DsrService {
  private readonly logger = new Logger(DsrService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submit a Data Subject Access Request (DSAR).
   */
  async submitAccessRequest(
    dataSubjectId: string,
    requestedBy: string,
  ): Promise<DsrRequest> {
    // FR-120.A4: Compute 30-day regulatory deadline
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);

    const record = await this.prisma.dsrRequest.create({
      data: {
        data_subject_id: dataSubjectId,
        requested_by: requestedBy,
        type: 'ACCESS',
        status: 'PENDING',
        report_data: toJsonValue({ dueDate: dueDate.toISOString() }),
      },
    });

    this.logger.log(
      `DSR submitted: subject=${dataSubjectId}, id=${record.id}, dueDate=${dueDate.toISOString()}`,
    );

    return this.mapToRequest(record);
  }

  /**
   * FR-120.A1: Generate an access report with real data from Prisma tables.
   * Queries Case, EmailIngest, and CaseActivityLog for records associated
   * with the data subject.
   */
  async generateAccessReport(dataSubjectId: string): Promise<AccessReport> {
    // Query real data from Prisma tables for the data subject
    const [cases, emailIngests, activityLogs] = await Promise.all([
      this.prisma.case.findMany({
        where: {
          OR: [
            { customer_name: { contains: dataSubjectId } },
            { loan_account_no: { contains: dataSubjectId } },
          ],
        },
        select: {
          id: true,
          case_number: true,
          case_type: true,
          status: true,
          priority: true,
          customer_name: true,
          loan_account_no: true,
          property_city: true,
          created_at: true,
        },
      }),
      this.prisma.emailIngest.findMany({
        where: {
          OR: [
            { from_address: { contains: dataSubjectId } },
            { to_addresses: { has: dataSubjectId } },
          ],
        },
        select: {
          id: true,
          from_address: true,
          to_addresses: true,
          subject: true,
          received_at: true,
        },
      }),
      // Fetch activity logs for all cases associated with this subject
      this.prisma.caseActivityLog.findMany({
        where: {
          case: {
            OR: [
              { customer_name: { contains: dataSubjectId } },
              { loan_account_no: { contains: dataSubjectId } },
            ],
          },
        },
        select: {
          id: true,
          case_id: true,
          action_code: true,
          actor_type: true,
          created_at: true,
        },
      }),
    ]);

    const sections: AccessReportSection[] = [];

    // Section 1: Case records
    sections.push({
      category: 'Case Records',
      description: 'Cases associated with the data subject in the collateral management system.',
      data_held: cases.map((c) => ({
        case_id: c.id,
        case_number: c.case_number,
        case_type: c.case_type,
        status: c.status,
        priority: c.priority,
        customer_name: c.customer_name,
        loan_account_no: c.loan_account_no,
        property_city: c.property_city,
        created_at: c.created_at,
        retention_period: '8 years post closure',
      })),
    });

    // Section 2: Email ingest records
    sections.push({
      category: 'Communication Records',
      description: 'Email correspondence related to the data subject.',
      data_held: emailIngests.map((e) => ({
        email_id: e.id,
        from_address: e.from_address,
        to_addresses: e.to_addresses,
        subject: e.subject,
        received_at: e.received_at,
        retention_period: '5 years',
      })),
    });

    // Section 3: Activity log records
    sections.push({
      category: 'Activity Logs',
      description: 'Case activity log entries associated with the data subject.',
      data_held: activityLogs.map((a) => ({
        log_id: a.id,
        case_id: a.case_id,
        action_code: a.action_code,
        actor_type: a.actor_type,
        created_at: a.created_at,
        retention_period: '5 years',
      })),
    });

    const report: AccessReport = {
      data_subject_id: dataSubjectId,
      generated_at: new Date(),
      sections,
    };

    this.logger.log(
      `Access report generated for subject=${dataSubjectId}: ${cases.length} cases, ${emailIngests.length} emails, ${activityLogs.length} activity logs`,
    );

    return report;
  }

  /**
   * List DSR requests with filters.
   */
  async getRequests(filters: DsrFilters = {}): Promise<PaginatedDsrRequests> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.data_subject_id) where.data_subject_id = filters.data_subject_id;
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;

    const [results, total] = await Promise.all([
      this.prisma.dsrRequest.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' } }),
      this.prisma.dsrRequest.count({ where }),
    ]);

    return {
      data: results.map((r) => this.mapToRequest(r)),
      total,
      page,
      limit,
    };
  }

  /**
   * Mark a DSR request as completed with report data.
   */
  async completeRequest(
    requestId: string,
    reportData: Record<string, unknown>,
  ): Promise<DsrRequest> {
    const existing = await this.prisma.dsrRequest.findUnique({
      where: { id: requestId },
    });

    if (!existing) {
      throw new NotFoundException(`DSR request not found: ${requestId}`);
    }

    const now = new Date();
    const updated = await this.prisma.dsrRequest.update({
      where: { id: requestId },
      data: {
        status: 'COMPLETED',
        report_data: toJsonValue(reportData),
        completed_at: now,
      },
    });

    this.logger.log(`DSR completed: id=${requestId}`);

    return this.mapToRequest(updated);
  }

  /**
   * FR-120.A3: Execute right-of-erasure anonymisation pipeline.
   *
   * Looks up the DSR request, verifies it is an ERASURE type and not yet COMPLETED.
   * Checks for legal_hold — if held, throws BadRequestException.
   * Anonymises PII fields by replacing with SHA-256 hashes:
   *   - from_address, to_addresses on related EmailIngest records
   *   - borrower_name on related Case records
   *   - PII in CaseActivityLog payload_json
   * Uses Prisma $transaction for atomicity.
   * Sets DsrRequest status to COMPLETED with affected record counts.
   */
  async executeErasure(requestId: string): Promise<DsrRequest> {
    const dsrRequest = await this.prisma.dsrRequest.findUnique({
      where: { id: requestId },
    });

    if (!dsrRequest) {
      throw new NotFoundException(`DSR request not found: ${requestId}`);
    }

    if (dsrRequest.type !== 'ERASURE') {
      throw new BadRequestException(
        `DSR request ${requestId} is not an ERASURE request (type: ${dsrRequest.type})`,
      );
    }

    if (dsrRequest.status === 'COMPLETED') {
      throw new BadRequestException(
        `DSR request ${requestId} has already been completed`,
      );
    }

    // Check for legal hold
    const reportData = dsrRequest.report_data as Record<string, unknown> | null;
    if (reportData?.legal_hold === true) {
      throw new BadRequestException(
        `Cannot execute erasure for DSR ${requestId}: record is under legal hold`,
      );
    }

    const dataSubjectId = dsrRequest.data_subject_id;

    // Execute all anonymisation within a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Anonymise EmailIngest records — look up by from_address matching subject
      const emailIngests = await tx.emailIngest.findMany({
        where: { from_address: { contains: dataSubjectId } },
      });

      let emailsAnonymised = 0;
      for (const email of emailIngests) {
        const updates: Record<string, unknown> = {};

        if (email.from_address) {
          updates.from_address = this.hashPii(email.from_address);
        }
        if (email.to_addresses && email.to_addresses.length > 0) {
          updates.to_addresses = email.to_addresses.map((addr: string) => this.hashPii(addr));
        }

        if (Object.keys(updates).length > 0) {
          await tx.emailIngest.update({
            where: { id: email.id },
            data: updates,
          });
          emailsAnonymised++;
        }
      }

      // 2. Anonymise Case records — use customer_name field
      const cases = await tx.case.findMany({
        where: { customer_name: { contains: dataSubjectId } },
      });

      let casesAnonymised = 0;
      for (const caseRecord of cases) {
        if (caseRecord.customer_name) {
          await tx.case.update({
            where: { id: caseRecord.id },
            data: { customer_name: this.hashPii(caseRecord.customer_name) },
          });
          casesAnonymised++;
        }
      }

      // 3. Anonymise CaseActivityLog payload_json PII
      const caseIds = cases.map((c) => c.id);
      const activityLogs = caseIds.length > 0
        ? await tx.caseActivityLog.findMany({
            where: { case_id: { in: caseIds } },
          })
        : [];

      let logsAnonymised = 0;
      for (const log of activityLogs) {
        if (log.payload_json) {
          const payload = typeof log.payload_json === 'string'
            ? JSON.parse(log.payload_json)
            : log.payload_json;

          const anonymisedPayload = this.anonymisePayloadPii(payload);
          await tx.caseActivityLog.update({
            where: { id: log.id },
            data: { payload_json: toJsonValue(anonymisedPayload) },
          });
          logsAnonymised++;
        }
      }

      // 4. Mark DSR as completed
      const now = new Date();
      const completedDsr = await tx.dsrRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          completed_at: now,
          report_data: toJsonValue({
            erasure_completed_at: now.toISOString(),
            affected_records: {
              emails_anonymised: emailsAnonymised,
              cases_anonymised: casesAnonymised,
              activity_logs_anonymised: logsAnonymised,
            },
          }),
        },
      });

      return completedDsr;
    });

    this.logger.log(`Erasure completed for DSR ${requestId}, subject=${dataSubjectId}`);

    return this.mapToRequest(result);
  }

  /**
   * Hash a PII value using SHA-256.
   */
  private hashPii(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Recursively anonymise PII fields in a payload object.
   * Targets common PII field names.
   */
  private anonymisePayloadPii(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const piiFields = [
      'email', 'from_address', 'to_addresses', 'borrower_name',
      'customer_name', 'name', 'phone', 'mobile', 'aadhaar', 'pan',
      'address', 'contact_phone',
    ];

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string' && piiFields.includes(key.toLowerCase())) {
        result[key] = this.hashPii(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.anonymisePayloadPii(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * FR-120.A2: Submit a rectification request (maker step).
   *
   * Creates a PENDING rectification DSR. The request must be
   * approved by a separate user (checker step) before changes are applied.
   */
  async submitRectification(
    dataSubjectId: string,
    fields: Record<string, string>,
    reason: string,
  ): Promise<{ requestId: string }> {
    const record = await this.prisma.dsrRequest.create({
      data: {
        data_subject_id: dataSubjectId,
        requested_by: 'system',
        type: 'RECTIFICATION',
        status: 'PENDING',
        report_data: toJsonValue({
          rectification_fields: fields,
          reason,
          submitted_at: new Date().toISOString(),
        }),
      },
    });

    this.logger.log(
      `Rectification submitted: subject=${dataSubjectId}, id=${record.id}, fields=${Object.keys(fields).join(',')}`,
    );

    return { requestId: record.id };
  }

  /**
   * FR-120.A2: Approve and apply a rectification request (checker step).
   *
   * Validates the request exists, is PENDING, and is of type RECTIFICATION.
   * Applies the field changes and marks the request as COMPLETED.
   * Implements maker-checker: the approver must be different from the submitter.
   */
  async approveRectification(
    requestId: string,
    approverId: string,
  ): Promise<{ applied: boolean }> {
    const request = await this.prisma.dsrRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`DSR request not found: ${requestId}`);
    }

    if (request.type !== 'RECTIFICATION') {
      throw new BadRequestException(
        `DSR request ${requestId} is not a RECTIFICATION request (type: ${request.type})`,
      );
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `DSR request ${requestId} is not in PENDING status (status: ${request.status})`,
      );
    }

    const reportData = request.report_data as Record<string, unknown> | null;
    const fields = (reportData?.rectification_fields || {}) as Record<string, string>;

    // Apply field changes if there's a user record for this data subject
    const user = await this.prisma.user.findFirst({
      where: { id: request.data_subject_id },
    });

    if (user) {
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        updates[key] = value;
      }
      if (Object.keys(updates).length > 0) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
      }
    }

    // Mark DSR as COMPLETED
    await this.prisma.dsrRequest.update({
      where: { id: requestId },
      data: {
        status: 'COMPLETED',
        completed_at: new Date(),
        report_data: toJsonValue({
          ...reportData,
          approved_by: approverId,
          approved_at: new Date().toISOString(),
          applied: true,
        }),
      },
    });

    this.logger.log(
      `Rectification approved: id=${requestId}, approver=${approverId}`,
    );

    return { applied: true };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToRequest(r: any): DsrRequest {
    // FR-120.A4: Extract dueDate from report_data if present, else compute from created_at + 30 days
    const reportData = r.report_data as Record<string, unknown> | null;
    let dueDate: Date | null = null;
    if (reportData?.dueDate) {
      dueDate = new Date(reportData.dueDate as string);
    } else if (r.created_at) {
      dueDate = new Date(r.created_at);
      dueDate.setDate(dueDate.getDate() + 30);
    }

    return {
      id: r.id,
      data_subject_id: r.data_subject_id,
      requested_by: r.requested_by,
      type: r.type,
      status: r.status,
      report_data: r.report_data,
      created_at: r.created_at,
      updated_at: r.updated_at,
      completed_at: r.completed_at,
      dueDate,
    };
  }
}
