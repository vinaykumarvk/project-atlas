import {
  Controller,
  Get,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Audited } from '../../audit/decorators/audited.decorator';
import { PendencyReportService } from '../services/pendency-report.service';

/**
 * Pendency Controller (FR-071.A1).
 *
 * Exposes REST endpoints for pendency report data,
 * including vendor-level and regional breakdown aggregations.
 */
@ApiTags('Pendency')
@ApiBearerAuth()
@Controller('pendency')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Audited({ resourceType: 'Pendency' })
export class PendencyController {
  private readonly logger = new Logger(PendencyController.name);

  constructor(
    private readonly pendencyReportService: PendencyReportService,
  ) {}

  /**
   * FR-071.A1: Get vendor-level pendency aggregation.
   * Returns open/breached counts and average age per vendor.
   */
  @Get('vendor')
  @ApiOperation({ summary: 'Get vendor-level pendency aggregation' })
  @ApiResponse({ status: 200, description: 'Vendor pendency data' })
  async getVendorPendency() {
    this.logger.log('Fetching vendor pendency data');
    const data = await this.pendencyReportService.getVendorPendency();
    return { data };
  }

  /**
   * FR-070.A2: Get regional breakdown of pendency data.
   * Returns open/breached counts and average TAT per region.
   */
  @Get('regional')
  @ApiOperation({ summary: 'Get regional breakdown of pendency data' })
  @ApiResponse({ status: 200, description: 'Regional pendency breakdown' })
  async getRegionalBreakdown() {
    this.logger.log('Fetching regional pendency breakdown');
    const data = await this.pendencyReportService.getRegionalBreakdown();
    return { data };
  }
}
