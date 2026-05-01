import { DistilledClassifier } from '../classifiers/distilled.classifier';
import { MockLlmClassifier } from '../classifiers/llm.classifier';
import { RuleBasedExtractor } from '../ner/rule-based.extractor';
import { MasterValidator } from '../validation/master-validator';
import { ConfidenceBandService } from '../services/confidence-band.service';
import { SentimentService } from '../services/sentiment.service';
import { SummarisationService } from '../services/summarisation.service';
import { ClassificationPipelineService } from '../services/classification-pipeline.service';
import { LlmModeConfig } from '../config/llm-mode.config';
import { ModelRegistryService } from '../config/model-registry';
import { DriftMonitorService } from '../services/drift-monitor.service';

describe('ClassificationPipelineService — multi-label support (FR-010.A2)', () => {
  let pipeline: ClassificationPipelineService;

  beforeEach(() => {
    const distilledClassifier = new DistilledClassifier();
    const llmClassifier = new MockLlmClassifier();
    const nerExtractor = new RuleBasedExtractor();
    const masterValidator = new MasterValidator();
    const confidenceBandService = new ConfidenceBandService();
    const sentimentService = new SentimentService();
    const summarisationService = new SummarisationService();
    const llmModeConfig = new LlmModeConfig();
    const modelRegistry = new ModelRegistryService();
    const driftMonitor = new DriftMonitorService();

    pipeline = new ClassificationPipelineService(
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

    // Ensure pipeline is in DEGRADED mode so it uses ONNX only (deterministic)
    pipeline.setLlmMode('DEGRADED');
  });

  it('should include labels array in multi-label result', async () => {
    const result = await pipeline.classifyMultiLabel({
      subject: 'Property Valuation Required',
      body: 'Please arrange for valuation of the property at Mumbai.',
    });

    expect(result.labels).toBeDefined();
    expect(Array.isArray(result.labels)).toBe(true);
    expect(result.labels!.length).toBeGreaterThanOrEqual(1);
  });

  it('should return single label when top confidence is above threshold', async () => {
    const result = await pipeline.classifyMultiLabel(
      {
        subject: 'Property Valuation Required',
        body: 'Please arrange for valuation of the property at Mumbai. The valuation report is needed urgently.',
      },
      0.3, // low threshold so most results will be above
    );

    // When confidence is high enough (above threshold), only one label is returned
    if (result.top_confidence >= 0.3) {
      expect(result.labels).toEqual([result.top_label]);
    }
  });

  it('should return multiple labels when top confidence is below threshold', async () => {
    const result = await pipeline.classifyMultiLabel(
      {
        subject: 'General query about property and insurance',
        body: 'I have some questions about property and insurance matters.',
      },
      0.99, // very high threshold to force multi-label
    );

    expect(result.labels).toBeDefined();
    expect(result.labels!.length).toBeGreaterThan(1);
    // First label should be the top label
    expect(result.labels![0]).toBe(result.top_label);
  });

  it('should filter alternatives with confidence > 0.1 for multi-label', async () => {
    const result = await pipeline.classifyMultiLabel(
      {
        subject: 'Property',
        body: 'Something general',
      },
      0.99, // force multi-label
    );

    expect(result.labels).toBeDefined();
    // Labels should include top label plus alternatives above 0.1
    expect(result.labels![0]).toBe(result.top_label);
    // Each additional label should come from alternatives with confidence > 0.1
    const altLabels = result.alternatives
      .filter((a) => a.confidence > 0.1)
      .map((a) => a.label);
    for (let i = 1; i < result.labels!.length; i++) {
      expect(altLabels).toContain(result.labels![i]);
    }
  });

  it('should still include standard ClassificationResult fields', async () => {
    const result = await pipeline.classifyMultiLabel({
      subject: 'Valuation Request',
      body: 'Need a valuation done for the property.',
    });

    expect(result.top_label).toBeDefined();
    expect(result.top_confidence).toBeDefined();
    expect(result.confidence_band).toBeDefined();
    expect(result.entities).toBeDefined();
    expect(result.inference_ms).toBeDefined();
    expect(result.llm_mode).toBe('DEGRADED');
  });

  it('should handle custom threshold parameter', async () => {
    const lowThreshold = await pipeline.classifyMultiLabel(
      {
        subject: 'Query',
        body: 'General question',
      },
      0.01,
    );

    const highThreshold = await pipeline.classifyMultiLabel(
      {
        subject: 'Query',
        body: 'General question',
      },
      0.99,
    );

    // With a very low threshold, we should get single label (or fewer)
    // With a very high threshold, we should get multi-label
    expect(highThreshold.labels!.length).toBeGreaterThanOrEqual(
      lowThreshold.labels!.length,
    );
  });
});
