import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { FeatureFlagService } from '../services/feature-flag.service';

@Controller('admin/feature-flags')
export class FeatureFlagController {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  @Get()
  getAllFlags() {
    return this.featureFlagService.getAllFlags();
  }

  @Patch(':name')
  updateFlag(
    @Param('name') name: string,
    @Body() body: { enabled: boolean; rolloutPercent?: number },
  ) {
    this.featureFlagService.setFlag(name, body.enabled, body.rolloutPercent);
    const updated = this.featureFlagService.getFlag(name);
    return { name, ...updated };
  }
}
