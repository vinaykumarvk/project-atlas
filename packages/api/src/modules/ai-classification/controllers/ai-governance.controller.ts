import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/guards/roles.decorator';
import { UserRole } from '../../auth/auth.service';
import { Audited } from '../../audit/decorators/audited.decorator';
import { ModelRiskPackService } from '../services/model-risk-pack.service';

/**
 * FR-159: AI Governance Controller.
 *
 * Provides endpoints for model risk pack and kill-switch status.
 */
@ApiTags('AI Governance')
@ApiBearerAuth()
@Controller('ai-governance')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Audited({ resourceType: 'AI_GOVERNANCE' })
export class AiGovernanceController {
  constructor(
    private readonly modelRiskPackService: ModelRiskPackService,
  ) {}

  /**
   * Get the full model risk operating pack.
   */
  @Get('model-risk-pack')
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Generate model risk operating pack (FR-159)' })
  @ApiResponse({ status: 200, description: 'Model risk pack' })
  getModelRiskPack() {
    const pack = this.modelRiskPackService.generateModelRiskPack();
    return { data: pack };
  }

  /**
   * Get the current kill-switch criteria status.
   */
  @Get('kill-switch-status')
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Get kill-switch criteria status (FR-159)' })
  @ApiResponse({ status: 200, description: 'Kill-switch status' })
  getKillSwitchStatus() {
    const status = this.modelRiskPackService.getKillSwitchStatus();
    return { data: status };
  }
}
