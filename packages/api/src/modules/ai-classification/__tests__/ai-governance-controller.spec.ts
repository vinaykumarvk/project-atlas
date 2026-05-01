import { Test, TestingModule } from '@nestjs/testing';
import { AiGovernanceController } from '../controllers/ai-governance.controller';
import { ModelRiskPackService } from '../services/model-risk-pack.service';
import { ModelRegistryService } from '../config/model-registry';
import { ModelPromotionService } from '../services/model-promotion.service';
import { DriftMonitorService } from '../services/drift-monitor.service';
import { AccuracyTrendService } from '../services/accuracy-trend.service';
import { EntityF1Service } from '../services/entity-f1.service';
import { BiasCheckService } from '../services/bias-check.service';

describe('AiGovernanceController (FR-159)', () => {
  let controller: AiGovernanceController;
  let modelRiskPackService: ModelRiskPackService;

  beforeEach(async () => {
    const modelRegistry = new ModelRegistryService();
    const modelPromotion = new ModelPromotionService();
    const driftMonitor = new DriftMonitorService();
    const accuracyTrend = new AccuracyTrendService();
    const entityF1 = new EntityF1Service();
    const biasCheck = new BiasCheckService();

    modelRiskPackService = new ModelRiskPackService(
      modelRegistry,
      modelPromotion,
      driftMonitor,
      accuracyTrend,
      entityF1,
      biasCheck,
    );

    controller = new AiGovernanceController(modelRiskPackService);
  });

  it('should return model risk pack from GET /ai-governance/model-risk-pack', () => {
    const result = controller.getModelRiskPack();
    expect(result.data).toHaveProperty('raci');
    expect(result.data).toHaveProperty('benchmark');
    expect(result.data).toHaveProperty('boardSummary');
    expect(result.data).toHaveProperty('killSwitch');
  });

  it('should return kill-switch status from GET /ai-governance/kill-switch-status', () => {
    const result = controller.getKillSwitchStatus();
    expect(result.data).toHaveProperty('triggered');
    expect(result.data).toHaveProperty('criteria');
    expect(result.data.criteria).toBeInstanceOf(Array);
  });

  it('should include 3 kill-switch criteria', () => {
    const result = controller.getKillSwitchStatus();
    expect(result.data.criteria).toHaveLength(3);
  });

  it('should include RACI in the risk pack', () => {
    const result = controller.getModelRiskPack();
    expect(result.data.raci).toHaveProperty('owner');
    expect(result.data.raci).toHaveProperty('reviewer');
    expect(result.data.raci).toHaveProperty('approver');
    expect(result.data.raci).toHaveProperty('informed');
  });
});
