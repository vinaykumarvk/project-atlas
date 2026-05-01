import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../../common/guards/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../auth/auth.service';
import { Audited } from '../../audit/decorators/audited.decorator';
import { SlaDashboardService } from '../services/sla-dashboard.service';
import { SlaClockService } from '../services/sla-clock.service';
import { BusinessValueService } from '../services/business-value.service';

/**
 * SLA Controller.
 *
 * Provides REST endpoints for SLA dashboard metrics,
 * breach reporting, admin recomputation, and SLA clock pause/resume.
 */
@ApiTags('SLA')
@ApiBearerAuth()
@Controller('sla')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Audited({ resourceType: 'SLA' })
export class SlaController {
  constructor(
    private readonly slaDashboardService: SlaDashboardService,
    private readonly slaClockService: SlaClockService,
    private readonly businessValueService: BusinessValueService,
  ) {}

  /**
   * Get aggregate SLA dashboard metrics.
   */
  @Get('dashboard')
  @ApiOperation({ summary: 'Get aggregate SLA dashboard metrics by team' })
  @ApiResponse({ status: 200, description: 'SLA dashboard metrics' })
  async getDashboard() {
    const teamSummary = await this.slaDashboardService.getTeamSummary();

    // Compute aggregate totals
    let totalOnTrack = 0;
    let totalAtRisk = 0;
    let totalBreached = 0;
    let totalCases = 0;

    for (const team of teamSummary) {
      totalOnTrack += team.onTrack;
      totalAtRisk += team.atRisk;
      totalBreached += team.breached;
      totalCases += team.total;
    }

    return {
      data: {
        summary: {
          totalCases,
          onTrack: totalOnTrack,
          atRisk: totalAtRisk,
          breached: totalBreached,
        },
        teams: teamSummary,
      },
    };
  }

  /**
   * Get extended dashboard data — top FPRs, top vendors, queue by type.
   */
  @Get('dashboard/extended')
  @ApiOperation({ summary: 'Get extended dashboard breakdowns (FPR, vendor, case type)' })
  @ApiResponse({ status: 200, description: 'Extended dashboard data' })
  async getExtendedDashboard() {
    const extended = await this.slaDashboardService.getExtendedDashboard();
    return { data: extended };
  }

  /**
   * Get SLA compliance percentages by dimension.
   */
  @Get('analytics/compliance')
  @ApiOperation({ summary: 'Get SLA compliance % by type, FPR, vendor, and region' })
  @ApiResponse({ status: 200, description: 'SLA compliance by dimension' })
  async getComplianceByDimension() {
    const compliance = await this.slaDashboardService.getComplianceByDimension();
    return { data: compliance };
  }

  @Get('analytics/business-value')
  @ApiOperation({ summary: 'Get business value command center summary' })
  @ApiResponse({ status: 200, description: 'Business value report' })
  async getBusinessValueSummary() {
    const report = await this.businessValueService.getBusinessValueSummary();
    return { data: report };
  }

  /**
   * Get trend data for a configurable window (FR-111 A4).
   */
  @Get('analytics/trends')
  @ApiOperation({ summary: 'Get case trend data for the specified window' })
  @ApiQuery({ name: 'window', required: false, enum: ['30', '60', '90'], description: 'Trend window in days (default 30)' })
  @ApiResponse({ status: 200, description: 'Trend data points' })
  async getTrendData(@Query('window') window?: string) {
    const allowedWindows = [30, 60, 90];
    let windowDays = 30;
    if (window) {
      const parsed = parseInt(window, 10);
      if (allowedWindows.includes(parsed)) {
        windowDays = parsed;
      }
    }
    const trends = await this.slaDashboardService.getTrendData(undefined, windowDays);
    return { data: trends };
  }

  /**
   * List breached and at-risk cases.
   */
  @Get('breaches')
  @ApiOperation({ summary: 'List breached and at-risk cases' })
  @ApiResponse({ status: 200, description: 'Breached and at-risk cases' })
  async getBreaches() {
    const [breached, atRisk] = await Promise.all([
      this.slaDashboardService.getBreachedCases(),
      this.slaDashboardService.getAtRiskCases(),
    ]);

    return {
      data: {
        breached,
        atRisk,
      },
    };
  }

  /**
   * FR-060.A3: Get SLA countdown for a specific case.
   */
  @Get('countdown/:caseId')
  @ApiOperation({ summary: 'Get SLA countdown for a case' })
  @ApiParam({ name: 'caseId', description: 'Case ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Countdown data' })
  async getCountdown(@Param('caseId') caseId: string) {
    const countdown = await this.slaClockService.getCountdown(caseId);
    return { data: countdown };
  }

  /**
   * Admin: recalculate SLA clocks by reloading master data.
   */
  @Post('recalculate')
  @Roles(UserRole.SYS_ADMIN, UserRole.COLLATERAL_HEAD)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: recompute SLA clocks from master data' })
  @ApiResponse({ status: 200, description: 'SLA recalculated' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async recalculate() {
    await this.slaClockService.loadMasterData();

    return { message: 'SLA clocks recalculated from master data' };
  }

  /**
   * Pause the SLA clock for a case.
   */
  @Post(':caseId/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause the SLA clock for a case' })
  @ApiParam({ name: 'caseId', description: 'Case ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Reason for pausing' } },
      required: ['reason'],
    },
  })
  @ApiResponse({ status: 200, description: 'SLA clock paused' })
  @ApiResponse({ status: 400, description: 'Invalid request or clock already paused' })
  async pauseClock(
    @Param('caseId') caseId: string,
    @Body() body: { reason: string },
  ) {
    if (!body.reason || body.reason.trim().length === 0) {
      throw new BadRequestException('Reason is required to pause the SLA clock');
    }

    this.slaClockService.pauseClock(caseId, undefined, body.reason);

    return {
      message: 'SLA clock paused',
      caseId,
      reason: body.reason,
      pausedAt: new Date().toISOString(),
    };
  }

  /**
   * Resume the SLA clock for a case.
   */
  @Post(':caseId/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume the SLA clock for a case' })
  @ApiParam({ name: 'caseId', description: 'Case ID (UUID)' })
  @ApiResponse({ status: 200, description: 'SLA clock resumed' })
  async resumeClock(@Param('caseId') caseId: string) {
    this.slaClockService.resumeClock(caseId);

    return {
      message: 'SLA clock resumed',
      caseId,
      resumedAt: new Date().toISOString(),
    };
  }
}
