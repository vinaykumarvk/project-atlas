export { AiClassificationModule } from './ai-classification.module';
export { ClassificationPipelineService } from './services/classification-pipeline.service';
export { DistilledClassifier } from './classifiers/distilled.classifier';
export { OnnxDistilledClassifier } from './classifiers/onnx-distilled.classifier';
export { MockLlmClassifier, AzureOpenAiClassifier, BedrockClassifier } from './classifiers/llm.classifier';
export { OpenAiClassifier } from './classifiers/openai.classifier';
export type { LlmClassifierProvider } from './classifiers/llm.classifier';
export { RuleBasedExtractor, MockLlmEntityExtractor } from './ner/rule-based.extractor';
export type { LlmEntityExtractor } from './ner/rule-based.extractor';
export { MasterValidator } from './validation/master-validator';
export { ConfidenceBandService } from './services/confidence-band.service';
export { SentimentService } from './services/sentiment.service';
export { SummarisationService } from './services/summarisation.service';
export { DriftMonitorService } from './services/drift-monitor.service';
export { SenderDomainService } from './services/sender-domain.service';
export { LlmModeConfig, getLlmMode } from './config/llm-mode.config';
export { ModelRegistryService } from './config/model-registry';
export type { ModelEntry } from './config/model-registry';
export type {
  ClassificationResult,
  ClassificationLabel,
  ExtractedEntity,
  ValidationOutcome,
  EmailInput,
  ConfidenceBand,
  LlmMode,
  LlmClassificationResult,
  SummarisationResult,
} from './types';
