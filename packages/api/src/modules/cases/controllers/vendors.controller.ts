import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  Header,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Audited } from '../../audit/decorators/audited.decorator';
import { VendorScorecardService } from '../services/vendor-scorecard.service';

/** FR-081.A3: Fields visible to vendor-facing responses. */
const VENDOR_VISIBLE_FIELDS = [
  'id',
  'caseNumber',
  'status',
  'priority',
  'type',
  'property',
  'assignedVendorId',
  'createdAt',
  'tatDue',
  'slaRemainingPercent',
];

/**
 * FR-081.A3: Strip non-visible fields before returning vendor-facing responses.
 * Returns a new object containing only the fields listed in VENDOR_VISIBLE_FIELDS.
 */
function filterFieldsForVendor(data: any): any {
  if (Array.isArray(data)) {
    return data.map((item) => filterFieldsForVendor(item));
  }
  if (data && typeof data === 'object') {
    const filtered: Record<string, unknown> = {};
    for (const field of VENDOR_VISIBLE_FIELDS) {
      if (field in data) {
        filtered[field] = data[field];
      }
    }
    return filtered;
  }
  return data;
}

/**
 * Vendors Controller.
 *
 * Provides REST endpoints for vendor scorecard and performance data.
 */
@ApiTags('Vendors')
@ApiBearerAuth()
@Controller('vendors')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Audited({ resourceType: 'Vendor' })
export class VendorsController {
  private readonly logger = new Logger(VendorsController.name);

  constructor(
    private readonly vendorScorecardService: VendorScorecardService,
  ) {}

  /**
   * List all active vendors with summary data.
   */
  @Get()
  @ApiOperation({ summary: 'List all active vendors with summary scores' })
  @ApiResponse({ status: 200, description: 'List of vendor summaries' })
  async listVendors(
    /** FR-081.A2: Optional location-based vendor filter. */
    @Query('location') location?: string,
  ) {
    const vendors = await this.vendorScorecardService.listVendorSummaries(location);
    return { data: vendors };
  }

  /**
   * Get detailed scorecard for a specific vendor.
   */
  @Get(':id/scorecard')
  @ApiOperation({ summary: 'Get vendor scorecard with performance metrics' })
  @ApiParam({ name: 'id', description: 'Vendor ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Vendor scorecard' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async getVendorScorecard(@Param('id') id: string) {
    const scorecard = await this.vendorScorecardService.getScorecard(id);
    return { data: scorecard };
  }

  /**
   * FR-083.A2: Vendor quarterly peer comparison.
   */
  @Get(':id/scorecard/comparison')
  @ApiOperation({ summary: 'Get vendor scorecard with quarterly peer comparison' })
  @ApiParam({ name: 'id', description: 'Vendor ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Vendor scorecard with peer comparison' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async getQuarterlyComparison(@Param('id') id: string) {
    const comparison = await this.vendorScorecardService.getQuarterlyComparison(id);
    return { data: comparison };
  }

  /**
   * FR-083.A3: Export vendor scorecard as downloadable JSON.
   */
  @Get(':id/scorecard/export')
  @ApiOperation({ summary: 'Export vendor scorecard as downloadable JSON file' })
  @ApiParam({ name: 'id', description: 'Vendor ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Downloadable scorecard JSON' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async exportScorecard(
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Res() res: any,
  ) {
    // FR-083.A3: Support ?format=pdf for HTML-based PDF export
    if (format === 'pdf') {
      const { html, filename } = await this.vendorScorecardService.exportAsPdf(id);
      res.set({
        'Content-Disposition': `attachment; filename=${filename}`,
        'Content-Type': 'text/html',
      });
      return res.send(html);
    }

    const scorecard = await this.vendorScorecardService.getScorecard(id);
    const comparison = await this.vendorScorecardService.getQuarterlyComparison(id);

    const exportData = {
      exportedAt: new Date().toISOString(),
      vendor: scorecard,
      peerComparison: comparison.peers,
    };

    const filename = `scorecard-${scorecard.vendorCode}-${new Date().toISOString().split('T')[0]}.json`;

    res.set({
      'Content-Disposition': `attachment; filename=${filename}`,
      'Content-Type': 'application/json',
    });

    res.send(JSON.stringify(exportData, null, 2));
  }
}
