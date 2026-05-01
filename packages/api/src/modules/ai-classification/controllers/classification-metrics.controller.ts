import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Audited } from '../../audit/decorators/audited.decorator';
import { ClassificationMetricsService } from '../services/classification-metrics.service';
import { AccuracyTrendService } from '../services/accuracy-trend.service';

@ApiTags('Classification Metrics')
@ApiBearerAuth()
@Controller('classification')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Audited({ resourceType: 'CLASSIFICATION_METRICS' })
export class ClassificationMetricsController {
  constructor(
    private readonly metricsService: ClassificationMetricsService,
    private readonly accuracyTrendService: AccuracyTrendService,
  ) {}

  @Get('accuracy-trend')
  @ApiOperation({ summary: 'Get weekly classification accuracy trend' })
  @ApiResponse({ status: 200, description: 'Weekly accuracy trend data' })
  async getAccuracyTrend(@Query('weeks') weeks?: string) {
    const w = weeks ? parseInt(weeks, 10) : undefined;
    const data = this.metricsService.getAccuracyTrend(w);
    return { data };
  }

  @Get('accuracy-trend/by-segment')
  @ApiOperation({ summary: 'Get accuracy trend segmented by dimension' })
  @ApiQuery({ name: 'dimension', enum: ['caseType', 'language', 'region'], required: true })
  @ApiResponse({ status: 200, description: 'Segmented accuracy data' })
  async getAccuracyBySegment(
    @Query('dimension') dimension: string,
    @Query('weeks') weeks?: string,
  ) {
    const w = weeks ? parseInt(weeks, 10) : undefined;
    const data = this.accuracyTrendService.getWeeklyTrendBySegment(dimension, w);
    return { data };
  }

  @Get('entity-f1')
  @ApiOperation({ summary: 'Get entity F1 metrics' })
  @ApiResponse({ status: 200, description: 'Entity F1 scores by type' })
  async getEntityF1() {
    const data = this.metricsService.getEntityF1Summary();
    return { data };
  }

  @Get('override-rate')
  @ApiOperation({ summary: 'Get classification override rate' })
  @ApiResponse({ status: 200, description: 'Override rate data' })
  async getOverrideRate(@Query('weeks') weeks?: string) {
    const w = weeks ? parseInt(weeks, 10) : undefined;
    const data = this.metricsService.getOverrideRate(w);
    return { data };
  }

  @Get('low-confidence')
  @ApiOperation({ summary: 'Get low-confidence volume by week' })
  @ApiResponse({ status: 200, description: 'Low-confidence weekly volume' })
  async getLowConfidence(@Query('weeks') weeks?: string) {
    const w = weeks ? parseInt(weeks, 10) : undefined;
    const data = this.metricsService.getLowConfidenceVolume(w);
    return { data };
  }
}
