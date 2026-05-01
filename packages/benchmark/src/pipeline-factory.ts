import {
  ClassificationPipelineService,
  DistilledClassifier,
  MockLlmClassifier,
  OpenAiClassifier,
  RuleBasedExtractor,
  MasterValidator,
  ConfidenceBandService,
  SentimentService,
  SummarisationService,
  DriftMonitorService,
  LlmModeConfig,
  ModelRegistryService,
} from '@atlas/api/ai-classification';
import type { LlmMode, LlmClassifierProvider } from '@atlas/api/ai-classification';

export interface PipelineInstance {
  pipeline: ClassificationPipelineService;
  setLlmMode: (mode: LlmMode) => void;
}

export async function createPipeline(llmMode: LlmMode = 'OFF'): Promise<PipelineInstance> {
  const distilledClassifier = new DistilledClassifier();

  // Initialize ONNX model (falls back to keywords if not available)
  await distilledClassifier.initOnnx();

  // Use real OpenAI classifier when LLM mode is ON, mock otherwise
  let llmClassifier: LlmClassifierProvider;
  if (llmMode !== 'OFF' && process.env.OPENAI_API_KEY) {
    llmClassifier = new OpenAiClassifier();
  } else {
    llmClassifier = new MockLlmClassifier();
  }

  const nerExtractor = new RuleBasedExtractor();
  const masterValidator = new MasterValidator();
  const confidenceBandService = new ConfidenceBandService();
  const sentimentService = new SentimentService();
  const summarisationService = new SummarisationService();

  const llmModeConfig = new LlmModeConfig();
  const modelRegistry = new ModelRegistryService();
  const driftMonitor = new DriftMonitorService();

  const pipeline = new ClassificationPipelineService(
    distilledClassifier,
    llmClassifier,
    nerExtractor,
    masterValidator,
    confidenceBandService,
    sentimentService,
    summarisationService,
    llmModeConfig,
    modelRegistry,
    driftMonitor,
  );

  pipeline.setLlmMode(llmMode);

  return {
    pipeline,
    setLlmMode: (mode: LlmMode) => pipeline.setLlmMode(mode),
  };
}
