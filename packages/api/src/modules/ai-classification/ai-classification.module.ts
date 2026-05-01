import { Module } from '@nestjs/common';
import { DistilledClassifier } from './classifiers/distilled.classifier';
import { MockLlmClassifier } from './classifiers/llm.classifier';
import { RuleBasedExtractor } from './ner/rule-based.extractor';
import { MasterValidator } from './validation/master-validator';
import { ConfidenceBandService } from './services/confidence-band.service';
import { SentimentService } from './services/sentiment.service';
import { SummarisationService } from './services/summarisation.service';
import { ClassificationPipelineService } from './services/classification-pipeline.service';
import { DriftMonitorService } from './services/drift-monitor.service';
import { LlmModeConfig } from './config/llm-mode.config';
import { ModelRegistryService } from './config/model-registry';
import { SenderDomainService } from './services/sender-domain.service';
import { EntityF1Service } from './services/entity-f1.service';
import { NextActionService } from './services/next-action.service';
import { SuggestedReplyService } from './services/suggested-reply.service';
import { ModelPromotionService } from './services/model-promotion.service';
import { TrainingDataService } from './services/training-data.service';
import { BiasCheckService } from './services/bias-check.service';
import { RoutingSimulatorService } from './services/routing-simulator.service';
import { AccuracyTrendService } from './services/accuracy-trend.service';
import { ClassificationMetricsService } from './services/classification-metrics.service';
import { ModelRiskPackService } from './services/model-risk-pack.service';
import { ClassificationMetricsController } from './controllers/classification-metrics.controller';
import { AiGovernanceController } from './controllers/ai-governance.controller';

/**
 * AI Classification Module.
 * Provides the full classification pipeline including:
 * - Distilled (mock ONNX) classifier
 * - LLM classifier (mock implementation)
 * - Rule-based NER
 * - Master data validation
 * - Confidence band assignment
 * - Sentiment & urgency analysis
 * - Email summarisation
 * - Model registry (version tracking)
 * - Drift monitoring
 */
@Module({
  controllers: [ClassificationMetricsController, AiGovernanceController],
  providers: [
    DistilledClassifier,
    {
      provide: 'LlmClassifierProvider',
      useClass: MockLlmClassifier,
    },
    RuleBasedExtractor,
    MasterValidator,
    ConfidenceBandService,
    SentimentService,
    SummarisationService,
    LlmModeConfig,
    ModelRegistryService,
    DriftMonitorService,
    SenderDomainService,
    EntityF1Service,
    NextActionService,
    SuggestedReplyService,
    ModelPromotionService,
    TrainingDataService,
    BiasCheckService,
    RoutingSimulatorService,
    AccuracyTrendService,
    ClassificationMetricsService,
    ModelRiskPackService,
    {
      provide: ClassificationPipelineService,
      useFactory: (
        distilled: DistilledClassifier,
        llm: MockLlmClassifier,
        ner: RuleBasedExtractor,
        validator: MasterValidator,
        confidenceBand: ConfidenceBandService,
        sentiment: SentimentService,
        summarisation: SummarisationService,
        llmModeConfig: LlmModeConfig,
        modelRegistry: ModelRegistryService,
        driftMonitor: DriftMonitorService,
        senderDomain: SenderDomainService,
      ) => {
        return new ClassificationPipelineService(
          distilled,
          llm,
          ner,
          validator,
          confidenceBand,
          sentiment,
          summarisation,
          llmModeConfig,
          modelRegistry,
          driftMonitor,
          senderDomain,
        );
      },
      inject: [
        DistilledClassifier,
        'LlmClassifierProvider',
        RuleBasedExtractor,
        MasterValidator,
        ConfidenceBandService,
        SentimentService,
        SummarisationService,
        LlmModeConfig,
        ModelRegistryService,
        DriftMonitorService,
        SenderDomainService,
      ],
    },
  ],
  exports: [
    ClassificationPipelineService,
    DistilledClassifier,
    RuleBasedExtractor,
    MasterValidator,
    ConfidenceBandService,
    SentimentService,
    SummarisationService,
    LlmModeConfig,
    ModelRegistryService,
    DriftMonitorService,
    SenderDomainService,
    EntityF1Service,
    NextActionService,
    SuggestedReplyService,
    ModelPromotionService,
    TrainingDataService,
    BiasCheckService,
    RoutingSimulatorService,
    AccuracyTrendService,
    ClassificationMetricsService,
    ModelRiskPackService,
  ],
})
export class AiClassificationModule {}
