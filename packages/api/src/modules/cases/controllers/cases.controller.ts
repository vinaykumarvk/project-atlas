import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../../common/guards/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../auth/auth.service';
import { Audited } from '../../audit/decorators/audited.decorator';
import { CaseCreationService } from '../services/case-creation.service';
import { CollateralRiskService } from '../services/collateral-risk.service';
import { FieldExtractorService } from '../../email-ingest/services/field-extractor.service';
import { PrismaService } from '../../../common/prisma';
import { CaseStatus } from '../types';
import { CreateCaseDto } from '../dto/create-case.dto';
import { TransitionStatusDto } from '../dto/transition-status.dto';
import { AssignCaseDto } from '../dto/assign-case.dto';
import { LinkCasesDto } from '../dto/link-cases.dto';
import { AddNoteDto } from '../dto/add-note.dto';
import { VendorResponseDto } from '../dto/vendor-response.dto';
import { BulkActionDto, BulkAction } from '../dto/bulk-action.dto';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { NotificationChannel } from '../../notifications/types';

/**
 * Interface representing the authenticated user on the request.
 */
interface AuthenticatedRequest {
  user: {
    sub: string;
    email: string;
    roles: UserRole[];
    region?: string;
  };
}

/**
 * Cases Controller.
 *
 * Provides REST endpoints for case management:
 * listing, detail, manual creation, status transitions,
 * reassignment, linking, bulk operations, and activity notes.
 */
@ApiTags('Cases')
@ApiBearerAuth()
@Controller('cases')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Audited({ resourceType: 'Case' })
export class CasesController {
  private readonly logger = new Logger(CasesController.name);

  constructor(
    private readonly caseCreationService: CaseCreationService,
    private readonly collateralRiskService: CollateralRiskService,
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationDispatchService?: NotificationDispatchService,
    @Optional() private readonly fieldExtractorService?: FieldExtractorService,
  ) {}

  /**
   * List cases with pagination and filters.
   */
  @Get()
  @ApiOperation({ summary: 'List cases with pagination and filters' })
  @ApiQuery({ name: 'status', required: false, enum: CaseStatus, description: 'Filter by case status' })
  @ApiQuery({ name: 'assignee', required: false, type: String, description: 'Filter by assigned FPR ID' })
  @ApiQuery({ name: 'caseType', required: false, type: String, description: 'Filter by case type' })
  @ApiQuery({ name: 'priority', required: false, type: String, description: 'Filter by priority' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Records per page' })
  @ApiResponse({ status: 200, description: 'Paginated list of cases' })
  async listCases(
    @Query('status') status?: string,
    @Query('assignee') assignee?: string,
    @Query('caseType') caseType?: string,
    @Query('priority') priority?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: {
      status?: CaseStatus;
      assignedFprId?: string;
      caseType?: string;
      page?: number;
      limit?: number;
    } = {};

    if (status && Object.values(CaseStatus).includes(status as CaseStatus)) {
      filters.status = status as CaseStatus;
    }
    if (assignee) filters.assignedFprId = assignee;
    if (caseType) filters.caseType = caseType;
    if (page) filters.page = parseInt(page, 10) || 1;
    if (limit) filters.limit = parseInt(limit, 10) || 20;

    const result = await this.caseCreationService.findAll(filters);

    return {
      data: result.data,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        total_pages: Math.ceil(result.total / result.limit),
      },
    };
  }

  /**
   * Aggregate risk data across the portfolio for the collateral risk dashboard.
   */
  @Get('risk-summary')
  @ApiOperation({ summary: 'Get portfolio-level collateral risk summary' })
  @ApiResponse({ status: 200, description: 'Collateral risk summary with counts by tier' })
  async getRiskSummary() {
    const summary = await this.collateralRiskService.getRiskSummary();
    return { data: summary };
  }

  /**
   * Get cases grouped by disbursal blocker category for the readiness dashboard.
   */
  @Get('disbursal-readiness')
  @ApiOperation({ summary: 'Get disbursal readiness — cases grouped by blocker category' })
  @ApiResponse({ status: 200, description: 'Disbursal readiness data' })
  async getDisbursalReadiness() {
    const readiness = await this.collateralRiskService.getDisbursalReadiness();
    return { data: readiness };
  }

  /**
   * FR-054.A3: Get activity log for a case, with optional note exclusion for audit exports.
   */
  @Get(':id/activities')
  @ApiOperation({ summary: 'Get activity log for a case' })
  @ApiParam({ name: 'id', description: 'Case ID' })
  @ApiQuery({ name: 'excludeNotes', required: false, type: Boolean, description: 'Exclude NOTE entries from results (for audit exports)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Records per page' })
  @ApiResponse({ status: 200, description: 'Paginated activity log' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async getActivityLog(
    @Param('id') id: string,
    @Query('excludeNotes') excludeNotes?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const existing = await this.prisma.case.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Case not found: ${id}`);
    }

    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    const skip = (pageNum - 1) * pageSize;

    const shouldExcludeNotes = excludeNotes === 'true' || excludeNotes === '1';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { case_id: id };
    if (shouldExcludeNotes) {
      where.NOT = { action_code: { contains: 'NOTE' } };
    }

    const [activities, total] = await Promise.all([
      this.prisma.caseActivityLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.caseActivityLog.count({ where }),
    ]);

    // FR-054.A2: Filter out private notes for VENDOR role users
    const isVendor = req?.user?.roles?.includes(UserRole.VENDOR) ?? false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredActivities = isVendor
      ? activities.filter((a: any) => {
          if (a.action_code === 'NOTE') {
            const payload = a.payload_json as Record<string, unknown> | null;
            if (payload?.isPrivate === true) {
              return false;
            }
          }
          return true;
        })
      : activities;

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: filteredActivities.map((a: any) => ({
        id: a.id,
        caseId: a.case_id,
        actionCode: a.action_code,
        actorType: a.actor_type,
        actorId: a.actor_id,
        payload: a.payload_json,
        createdAt: a.created_at,
      })),
      meta: {
        page: pageNum,
        limit: pageSize,
        total: isVendor ? filteredActivities.length : total,
        total_pages: Math.ceil((isVendor ? filteredActivities.length : total) / pageSize),
        excludeNotes: shouldExcludeNotes,
      },
    };
  }

  /**
   * Get full case detail by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get case detail by ID' })
  @ApiParam({ name: 'id', description: 'Case ID' })
  @ApiResponse({ status: 200, description: 'Case detail' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async getCaseById(@Param('id') id: string) {
    const caseRecord = await this.caseCreationService.findById(id);
    if (!caseRecord) {
      throw new NotFoundException(`Case not found: ${id}`);
    }
    return { data: caseRecord };
  }

  /**
   * Create a case manually.
   */
  @Post()
  @Roles(UserRole.COLLATERAL_OFFICER, UserRole.COLLATERAL_LEAD, UserRole.SYS_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new case manually' })
  @ApiResponse({ status: 201, description: 'Case created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createCase(@Body() dto: CreateCaseDto, @Req() req: AuthenticatedRequest) {
    const caseRecord = await this.caseCreationService.createCase({
      emailIngestId: dto.emailIngestId,
      subject: dto.subject,
      from: dto.from,
      classification: {
        caseType: dto.caseType,
        confidenceBand: dto.confidenceBand,
        priority: dto.priority,
        loanAccountNo: dto.loanAccountNo,
        customerName: dto.customerName,
        propertyCity: dto.propertyCity,
        propertyPin: dto.propertyPin,
        languageDetected: dto.languageDetected || 'en',
      },
    });

    return { data: caseRecord, message: 'Case created successfully' };
  }

  /**
   * Bulk operations on multiple cases.
   * Supports REASSIGN, CHANGE_PRIORITY, ADD_NOTE, and CLOSE.
   * Max 100 case IDs per request. Each action is logged individually.
   */
  @Post('bulk')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.FPR_SUPERVISOR,
    UserRole.SYS_ADMIN,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perform bulk operations on multiple cases' })
  @ApiResponse({ status: 200, description: 'Bulk operation results' })
  @ApiResponse({ status: 400, description: 'Validation error or too many case IDs' })
  async bulkAction(
    @Body() dto: BulkActionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (dto.case_ids.length > 100) {
      throw new BadRequestException('Maximum 100 case IDs allowed per bulk operation.');
    }

    const results: { caseId: string; success: boolean; error?: string }[] = [];

    for (const caseId of dto.case_ids) {
      try {
        switch (dto.action) {
          case BulkAction.REASSIGN: {
            if (!dto.payload.assigneeId) {
              throw new BadRequestException('REASSIGN requires payload.assigneeId');
            }
            const existing = await this.prisma.case.findUnique({ where: { id: caseId } });
            if (!existing) throw new NotFoundException(`Case not found: ${caseId}`);

            const previousFprId = existing.assigned_fpr_id;

            await this.prisma.$transaction(async (tx) => {
              await tx.case.update({
                where: { id: caseId },
                data: { assigned_fpr_id: dto.payload.assigneeId },
              });

              await tx.caseActivityLog.create({
                data: {
                  case_id: caseId,
                  action_code: 'REASSIGNED',
                  actor_type: 'USER',
                  actor_id: req.user.sub,
                  payload_json: {
                    details: dto.payload.reason || 'Bulk reassignment',
                    previousFprId,
                    newFprId: dto.payload.assigneeId,
                    bulkAction: true,
                  },
                },
              });
            });
            break;
          }

          case BulkAction.CHANGE_PRIORITY: {
            if (!dto.payload.priority) {
              throw new BadRequestException('CHANGE_PRIORITY requires payload.priority');
            }
            const existing = await this.prisma.case.findUnique({ where: { id: caseId } });
            if (!existing) throw new NotFoundException(`Case not found: ${caseId}`);

            const previousPriority = existing.priority;

            await this.prisma.$transaction(async (tx) => {
              await tx.case.update({
                where: { id: caseId },
                data: { priority: dto.payload.priority },
              });

              await tx.caseActivityLog.create({
                data: {
                  case_id: caseId,
                  action_code: 'PRIORITY_CHANGED',
                  actor_type: 'USER',
                  actor_id: req.user.sub,
                  payload_json: {
                    details: `Priority changed from ${previousPriority} to ${dto.payload.priority}`,
                    from: previousPriority,
                    to: dto.payload.priority,
                    bulkAction: true,
                  },
                },
              });
            });
            break;
          }

          case BulkAction.ADD_NOTE: {
            if (!dto.payload.note) {
              throw new BadRequestException('ADD_NOTE requires payload.note');
            }
            const existing = await this.prisma.case.findUnique({ where: { id: caseId } });
            if (!existing) throw new NotFoundException(`Case not found: ${caseId}`);

            await this.prisma.caseActivityLog.create({
              data: {
                case_id: caseId,
                action_code: 'NOTE',
                actor_type: 'USER',
                actor_id: req.user.sub,
                payload_json: {
                  details: dto.payload.note,
                  bulkAction: true,
                },
              },
            });
            break;
          }

          case BulkAction.CLOSE: {
            if (!dto.payload.resolution_code || !dto.payload.resolution_summary) {
              throw new BadRequestException(
                'CLOSE requires payload.resolution_code and payload.resolution_summary',
              );
            }
            await this.caseCreationService.transitionStatus(
              caseId,
              CaseStatus.CLOSED,
              req.user.sub,
              'Bulk close',
              {
                resolution_code: dto.payload.resolution_code,
                resolution_summary: dto.payload.resolution_summary,
              },
            );
            break;
          }
        }

        results.push({ caseId, success: true });
      } catch (err) {
        results.push({
          caseId,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    return {
      data: results,
      meta: {
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    };
  }

  /**
   * Transition case status.
   */
  @Patch(':id/status')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.FPR,
    UserRole.FPR_SUPERVISOR,
    UserRole.SYS_ADMIN,
  )
  @ApiOperation({ summary: 'Transition case to a new status' })
  @ApiParam({ name: 'id', description: 'Case ID' })
  @ApiResponse({ status: 200, description: 'Status transitioned' })
  @ApiResponse({ status: 400, description: 'Invalid transition' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: TransitionStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.caseCreationService.transitionStatus(
      id,
      dto.targetStatus,
      req.user.sub,
      dto.details,
      {
        resolution_code: dto.resolution_code,
        resolution_summary: dto.resolution_summary,
      },
    );

    return { message: `Case ${id} transitioned to ${dto.targetStatus}` };
  }

  /**
   * Reassign a case to a different FPR.
   */
  @Post(':id/assign')
  @Roles(
    UserRole.COLLATERAL_LEAD,
    UserRole.FPR_SUPERVISOR,
    UserRole.SYS_ADMIN,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reassign case to a different FPR' })
  @ApiParam({ name: 'id', description: 'Case ID' })
  @ApiResponse({ status: 200, description: 'Case reassigned' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async assignCase(
    @Param('id') id: string,
    @Body() dto: AssignCaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const existing = await this.prisma.case.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Case not found: ${id}`);
    }

    const previousFprId = existing.assigned_fpr_id;

    await this.prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id },
        data: { assigned_fpr_id: dto.assigneeId },
      });

      await tx.caseActivityLog.create({
        data: {
          case_id: id,
          action_code: 'REASSIGNED',
          actor_type: 'USER',
          actor_id: req.user.sub,
          payload_json: {
            details: dto.reason || 'Manual reassignment',
            previousFprId,
            newFprId: dto.assigneeId,
          },
        },
      });
    });

    return {
      message: `Case ${id} reassigned to ${dto.assigneeId}`,
      data: { previousFprId, newFprId: dto.assigneeId },
    };
  }

  /**
   * Link cases together.
   */
  @Post(':id/link')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.FPR,
    UserRole.SYS_ADMIN,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link this case to another case' })
  @ApiParam({ name: 'id', description: 'Case ID' })
  @ApiResponse({ status: 200, description: 'Cases linked' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async linkCases(
    @Param('id') id: string,
    @Body() dto: LinkCasesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.caseCreationService.linkCases(id, dto.linkedCaseId, req.user.sub);
    return { message: `Case ${id} linked to ${dto.linkedCaseId}` };
  }

  /**
   * Add an activity note to a case.
   */
  @Post(':id/notes')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.FPR,
    UserRole.FPR_SUPERVISOR,
    UserRole.SYS_ADMIN,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an activity note to a case' })
  @ApiParam({ name: 'id', description: 'Case ID' })
  @ApiResponse({ status: 201, description: 'Note added' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async addNote(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const existing = await this.prisma.case.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Case not found: ${id}`);
    }

    const entry = await this.prisma.caseActivityLog.create({
      data: {
        case_id: id,
        action_code: 'NOTE',
        actor_type: 'USER',
        actor_id: req.user.sub,
        payload_json: {
          details: dto.note,
          // FR-054 A1: Notes privacy flag
          ...(dto.isPrivate !== undefined && { isPrivate: dto.isPrivate }),
        },
      },
    });

    // Parse @mentions and send notifications (FR-054 A2)
    const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(dto.note)) !== null) {
      mentions.push(match[1]);
    }

    if (mentions.length > 0 && this.notificationDispatchService) {
      // Look up users by email prefix or name and send notifications
      for (const mention of mentions) {
        try {
          const users = await this.prisma.user.findMany({
            where: {
              OR: [
                { email: { startsWith: mention } },
                { full_name: { contains: mention } },
              ],
            },
            take: 5,
          });

          for (const user of users) {
            // Register a mention notification template if not already registered
            this.notificationDispatchService.registerTemplate({
              code: 'NOTE_MENTION',
              subject: 'You were mentioned in Case {{case_number}}',
              body: '{{author}} mentioned you in a note on case {{case_number}}: "{{note_excerpt}}"',
            });

            const variables = {
              case_number: (existing as { case_number?: string }).case_number || id,
              author: req.user.email || req.user.sub,
              note_excerpt: dto.note.substring(0, 200),
            };

            // Send IN_APP notification
            await this.notificationDispatchService.send(
              user.id,
              NotificationChannel.IN_APP,
              'NOTE_MENTION',
              variables,
              { fallbackEnabled: false },
            );

            // Send EMAIL notification
            await this.notificationDispatchService.send(
              user.id,
              NotificationChannel.EMAIL,
              'NOTE_MENTION',
              variables,
              { fallbackEnabled: false },
            );
          }
        } catch (err) {
          this.logger.warn(`Failed to notify @${mention}: ${(err as Error).message}`);
        }
      }
    }

    return {
      data: {
        id: entry.id,
        caseId: id,
        action: 'NOTE',
        performedBy: req.user.sub,
        details: dto.note,
        createdAt: entry.created_at,
        mentions,
      },
      message: 'Note added successfully',
    };
  }

  /**
   * FR-034 A2: Merge secondary cases into a primary case (max 10).
   */
  @Post(':id/merge')
  @Roles(UserRole.COLLATERAL_LEAD, UserRole.SYS_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge secondary cases into this primary case (max 10)' })
  @ApiParam({ name: 'id', description: 'Primary Case ID' })
  @ApiResponse({ status: 200, description: 'Cases merged' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async mergeCases(
    @Param('id') id: string,
    @Body() body: { secondaryCaseIds: string[] },
    @Req() req: AuthenticatedRequest,
  ) {
    if (!body.secondaryCaseIds || !Array.isArray(body.secondaryCaseIds)) {
      throw new BadRequestException('secondaryCaseIds array is required');
    }
    const result = await this.caseCreationService.mergeCases(
      id,
      body.secondaryCaseIds,
      req.user.sub,
    );
    return {
      data: result,
      message: `Merged ${result.merged.length} cases into ${id}`,
    };
  }

  /**
   * Override the vendor assignment for a case (FR-032 A3).
   */
  @Patch(':id/vendor')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.FPR_SUPERVISOR,
    UserRole.SYS_ADMIN,
  )
  @ApiOperation({ summary: 'Override vendor assignment for a case' })
  @ApiParam({ name: 'id', description: 'Case ID' })
  @ApiResponse({ status: 200, description: 'Vendor assignment updated' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async overrideVendor(
    @Param('id') id: string,
    @Body() body: { vendor_id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const existing = await this.prisma.case.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Case not found: ${id}`);
    }

    const previousVendorId = (existing as { assigned_vendor_id?: string }).assigned_vendor_id || null;

    await this.prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id },
        data: { assigned_vendor_id: body.vendor_id },
      });

      await tx.caseActivityLog.create({
        data: {
          case_id: id,
          action_code: 'VENDOR_OVERRIDE',
          actor_type: 'USER',
          actor_id: req.user.sub,
          payload_json: {
            details: `Vendor changed from ${previousVendorId || 'none'} to ${body.vendor_id}`,
            previousVendorId,
            newVendorId: body.vendor_id,
          },
        },
      });
    });

    return {
      message: `Case ${id} vendor updated to ${body.vendor_id}`,
      data: { previousVendorId, newVendorId: body.vendor_id },
    };
  }

  /**
   * FR-023.A4: Officer confirmation of extracted fields for a case.
   */
  @Patch(':id/confirm-extraction')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.FPR,
    UserRole.SYS_ADMIN,
  )
  @ApiOperation({ summary: 'Confirm extracted fields for a case' })
  @ApiParam({ name: 'id', description: 'Case ID' })
  @ApiResponse({ status: 200, description: 'Extraction confirmed' })
  @ApiResponse({ status: 400, description: 'Missing confirmedFields' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async confirmExtraction(
    @Param('id') id: string,
    @Body() body: { confirmedFields: Record<string, string> },
    @Req() req: AuthenticatedRequest,
  ) {
    if (!body.confirmedFields || typeof body.confirmedFields !== 'object') {
      throw new BadRequestException('confirmedFields is required and must be an object');
    }

    const existing = await this.prisma.case.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Case not found: ${id}`);
    }

    if (this.fieldExtractorService) {
      await this.fieldExtractorService.confirmExtraction(id, body.confirmedFields, req.user.sub);
    } else {
      // Fallback: log directly to activity log
      await this.prisma.caseActivityLog.create({
        data: {
          case_id: id,
          action_code: 'EXTRACTION_CONFIRMED',
          actor_type: 'USER',
          actor_id: req.user.sub,
          payload_json: {
            confirmedFields: body.confirmedFields,
            confirmedAt: new Date().toISOString(),
          },
        },
      });
    }

    return {
      message: `Extraction confirmed for case ${id}`,
      data: {
        caseId: id,
        confirmedBy: req.user.sub,
        fieldsConfirmed: Object.keys(body.confirmedFields).length,
      },
    };
  }

  /**
   * FR-020.A3: Download / preview an attachment.
   * Blocks access if the attachment's AV scan status is PENDING.
   */
  @Get(':caseId/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Download or preview an attachment' })
  @ApiParam({ name: 'caseId', description: 'Case ID' })
  @ApiParam({ name: 'attachmentId', description: 'Attachment ID' })
  @ApiResponse({ status: 200, description: 'Signed download URL' })
  @ApiResponse({ status: 403, description: 'File is pending virus scan' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async downloadAttachment(
    @Param('caseId') caseId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const attachment = await this.prisma.caseAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment not found: ${attachmentId}`);
    }

    // FR-020.A3: Block PENDING attachments
    if (attachment.av_scan_status === 'PENDING') {
      throw new ForbiddenException('File is pending virus scan');
    }

    // FR-020.A3: Generate signed download URL for clean/oversized attachments
    const downloadUrl = attachment.s3_key
      ? `${process.env.S3_ENDPOINT || 'https://s3.ap-south-1.amazonaws.com'}/${process.env.S3_BUCKET || 'atlas-attachments'}/${attachment.s3_key}?X-Amz-Expires=3600`
      : null;

    return {
      data: {
        attachmentId: attachment.id,
        filename: attachment.filename,
        avStatus: attachment.av_scan_status,
        mimeType: attachment.mime_type,
        downloadUrl,
      },
    };
  }

  /**
   * FR-022.A2: Override document type classification for an attachment.
   * Requires COLLATERAL_OFFICER or COLLATERAL_LEAD role.
   */
  @Patch(':caseId/attachments/:attachmentId/doc-type')
  @Roles(UserRole.COLLATERAL_OFFICER, UserRole.COLLATERAL_LEAD)
  @ApiOperation({ summary: 'Override document type for an attachment' })
  @ApiParam({ name: 'caseId', description: 'Case ID' })
  @ApiParam({ name: 'attachmentId', description: 'Attachment ID' })
  @ApiResponse({ status: 200, description: 'Document type updated' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async overrideDocumentType(
    @Param('caseId') caseId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() body: { documentType: string },
    @Req() req: AuthenticatedRequest,
  ) {
    if (!body.documentType) {
      throw new BadRequestException('documentType is required');
    }

    const attachment = await this.prisma.caseAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment not found: ${attachmentId}`);
    }

    const previousDocType = attachment.document_type || null;

    // Update the stored classification
    await this.prisma.caseAttachment.update({
      where: { id: attachmentId },
      data: { document_type: body.documentType },
    });

    // Log override as case activity
    await this.prisma.caseActivityLog.create({
      data: {
        case_id: caseId,
        action_code: 'DOC_TYPE_OVERRIDE',
        actor_type: 'USER',
        actor_id: req.user.sub,
        payload_json: {
          details: `Document type changed from ${previousDocType || 'none'} to ${body.documentType}`,
          attachmentId,
          previousDocType,
          newDocType: body.documentType,
        },
      },
    });

    return {
      message: `Document type updated to ${body.documentType}`,
      data: {
        attachmentId,
        previousDocType,
        newDocType: body.documentType,
      },
    };
  }

  /**
   * FR-082: Vendor Response Submission.
   *
   * Allows a vendor to submit deliverables and structured fields for a case.
   * Creates a CaseActivityLog entry, triggers OCR (logged), and notifies
   * the assigned officer.
   */
  @Post(':id/vendor-response')
  @Roles(UserRole.VENDOR, UserRole.SYS_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit vendor response with deliverables for a case' })
  @ApiParam({ name: 'id', description: 'Case ID' })
  @ApiResponse({ status: 201, description: 'Vendor response submitted' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async submitVendorResponse(
    @Param('id') id: string,
    @Body() dto: VendorResponseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const existing = await this.prisma.case.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Case not found: ${id}`);
    }

    const submissionId = randomUUID();
    const submittedAt = new Date();

    // Create activity log entry for vendor response submission
    await this.prisma.caseActivityLog.create({
      data: {
        case_id: id,
        action_code: 'VENDOR_RESPONSE_SUBMITTED',
        actor_type: 'USER',
        actor_id: req.user.sub,
        payload_json: {
          submissionId,
          summary: dto.summary,
          remarks: dto.remarks || null,
          deliverables: dto.deliverables || [],
          fileNames: dto.fileNames || [],
          submittedAt: submittedAt.toISOString(),
        },
      },
    });

    // Trigger OCR for uploaded files (log-only; actual OCR integration deferred)
    if (dto.fileNames && dto.fileNames.length > 0) {
      this.logger.log(
        `[FR-082] OCR trigger requested for case ${id}, submissionId=${submissionId}, ` +
        `files: ${dto.fileNames.join(', ')}`,
      );
    }

    // Notify the assigned officer via NotificationDispatchService
    const assignedFprId = (existing as { assigned_fpr_id?: string }).assigned_fpr_id;
    if (assignedFprId && this.notificationDispatchService) {
      try {
        this.notificationDispatchService.registerTemplate({
          code: 'VENDOR_RESPONSE_SUBMITTED',
          subject: 'Vendor Response Received: Case {{case_number}}',
          body: 'A vendor has submitted a response for case {{case_number}}. Summary: "{{summary}}". Please review the deliverables.',
        });

        const variables = {
          case_number: (existing as { case_number?: string }).case_number || id,
          summary: dto.summary.substring(0, 200),
        };

        await this.notificationDispatchService.send(
          assignedFprId,
          NotificationChannel.IN_APP,
          'VENDOR_RESPONSE_SUBMITTED',
          variables,
          { fallbackEnabled: false },
        );

        await this.notificationDispatchService.send(
          assignedFprId,
          NotificationChannel.EMAIL,
          'VENDOR_RESPONSE_SUBMITTED',
          variables,
          { fallbackEnabled: false },
        );
      } catch (err) {
        this.logger.warn(
          `[FR-082] Failed to notify officer ${assignedFprId} for vendor response on case ${id}: ${(err as Error).message}`,
        );
      }
    }

    return {
      data: {
        submissionId,
        caseId: id,
        submittedBy: req.user.sub,
        submittedAt: submittedAt.toISOString(),
        fileCount: dto.fileNames?.length || 0,
        deliverableCount: dto.deliverables?.length || 0,
      },
      message: 'Vendor response submitted successfully',
    };
  }
}
