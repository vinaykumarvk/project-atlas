import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
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
import { PrismaService } from '../../../common/prisma';
import { CaseCreationService } from '../services/case-creation.service';
import { CaseStatus } from '../types';
import { TriageConfirmDto } from '../dto/triage-confirm.dto';
import { TriageCorrectDto } from '../dto/triage-correct.dto';

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
 * Triage Controller.
 *
 * Provides endpoints for officers to review and correct AI classification
 * results for cases that require human oversight (low confidence or
 * validation failures).
 */
@ApiTags('Triage')
@ApiBearerAuth()
@Controller('triage')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Audited({ resourceType: 'Triage' })
export class TriageController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseCreationService: CaseCreationService,
  ) {}

  /**
   * List cases that require triage (low confidence or validation-failed).
   */
  @Get()
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.COLLATERAL_HEAD,
    UserRole.SYS_ADMIN,
  )
  @ApiOperation({ summary: 'List cases needing triage (low confidence, validation-failed)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Records per page' })
  @ApiResponse({ status: 200, description: 'Paginated list of cases requiring triage' })
  async listTriageCases(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    const skip = (pageNum - 1) * pageSize;

    const where = {
      OR: [
        { confidence_band: { in: ['RED', 'RED_MANUAL'] } },
        { status: CaseStatus.CLASSIFIED },
      ],
      status: { notIn: [CaseStatus.CLOSED, CaseStatus.CANCELLED] },
    };

    const [cases, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        include: {
          activity_logs: { orderBy: { created_at: 'asc' } },
        },
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      data: cases.map((c) => ({
        id: c.id,
        caseNumber: c.case_number,
        caseType: c.case_type,
        priority: c.priority,
        status: c.status,
        confidenceBand: c.confidence_band,
        aiSummary: c.ai_summary,
        assignedFprId: c.assigned_fpr_id,
        createdAt: c.created_at,
      })),
      meta: {
        page: pageNum,
        limit: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Confirm AI classification suggestion for a triage case.
   */
  @Post(':caseId/confirm')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.COLLATERAL_HEAD,
    UserRole.SYS_ADMIN,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm AI classification suggestion' })
  @ApiParam({ name: 'caseId', description: 'Case ID to confirm triage' })
  @ApiResponse({ status: 200, description: 'Triage confirmed' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async confirmTriage(
    @Param('caseId') caseId: string,
    @Body() dto: TriageConfirmDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const existing = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!existing) {
      throw new NotFoundException(`Case not found: ${caseId}`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Update confidence band to GREEN (officer-confirmed)
      await tx.case.update({
        where: { id: caseId },
        data: {
          confidence_band: 'GREEN',
        },
      });

      await tx.caseActivityLog.create({
        data: {
          case_id: caseId,
          action_code: 'TRIAGE_CONFIRMED',
          actor_type: 'USER',
          actor_id: req.user.sub,
          payload_json: {
            details: dto.notes || 'Officer confirmed AI classification',
            originalConfidenceBand: existing.confidence_band,
            accountable_officer_id: req.user.sub,
          },
        },
      });
    });

    // If the case was in CLASSIFIED status, transition it to ROUTED
    if (existing.status === CaseStatus.CLASSIFIED) {
      await this.caseCreationService.transitionStatus(
        caseId,
        CaseStatus.ROUTED,
        req.user.sub,
        'Triage confirmed - routing case',
      );
    }

    return {
      message: `Triage confirmed for case ${caseId}`,
      data: {
        caseId,
        confirmedBy: req.user.sub,
        previousConfidenceBand: existing.confidence_band,
        newConfidenceBand: 'GREEN',
      },
    };
  }

  /**
   * Correct AI classification for a triage case.
   */
  @Post(':caseId/correct')
  @Roles(
    UserRole.COLLATERAL_OFFICER,
    UserRole.COLLATERAL_LEAD,
    UserRole.COLLATERAL_HEAD,
    UserRole.SYS_ADMIN,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Correct AI classification for a case' })
  @ApiParam({ name: 'caseId', description: 'Case ID to correct triage' })
  @ApiResponse({ status: 200, description: 'Triage corrected' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async correctTriage(
    @Param('caseId') caseId: string,
    @Body() dto: TriageCorrectDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const existing = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!existing) {
      throw new NotFoundException(`Case not found: ${caseId}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {
        case_type: dto.correctedCaseType,
        confidence_band: 'GREEN',
      };
      if (dto.correctedPriority) {
        updateData.priority = dto.correctedPriority;
      }

      await tx.case.update({
        where: { id: caseId },
        data: updateData,
      });

      await tx.caseActivityLog.create({
        data: {
          case_id: caseId,
          action_code: 'TRIAGE_CORRECTED',
          actor_type: 'USER',
          actor_id: req.user.sub,
          payload_json: {
            details: dto.reason || 'Officer corrected AI classification',
            originalCaseType: existing.case_type,
            correctedCaseType: dto.correctedCaseType,
            originalPriority: existing.priority,
            correctedPriority: dto.correctedPriority || existing.priority,
            originalConfidenceBand: existing.confidence_band,
            accountable_officer_id: req.user.sub,
          },
        },
      });
    });

    // If the case was in CLASSIFIED status, transition it to ROUTED
    if (existing.status === CaseStatus.CLASSIFIED) {
      await this.caseCreationService.transitionStatus(
        caseId,
        CaseStatus.ROUTED,
        req.user.sub,
        'Triage corrected - routing case',
      );
    }

    return {
      message: `Triage corrected for case ${caseId}`,
      data: {
        caseId,
        correctedBy: req.user.sub,
        originalCaseType: existing.case_type,
        correctedCaseType: dto.correctedCaseType,
        correctedPriority: dto.correctedPriority || existing.priority,
      },
    };
  }
}
