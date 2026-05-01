import { ClassificationPipelineService } from '../services/classification-pipeline.service';
import { DistilledClassifier } from '../classifiers/distilled.classifier';
import { MockLlmClassifier } from '../classifiers/llm.classifier';
import { RuleBasedExtractor } from '../ner/rule-based.extractor';
import { MasterValidator } from '../validation/master-validator';
import { ConfidenceBandService } from '../services/confidence-band.service';
import { SentimentService } from '../services/sentiment.service';
import { SummarisationService } from '../services/summarisation.service';
import { LlmModeConfig } from '../config/llm-mode.config';

describe('ClassificationPipelineService — auto-degrade on 5xx + REGULATOR_MODE', () => {
  let pipeline: ClassificationPipelineService;

  beforeEach(() => {
    const distilled = new DistilledClassifier();
    const llm = new MockLlmClassifier();
    const ner = new RuleBasedExtractor();
    const validator = new MasterValidator();
    const confidenceBand = new ConfidenceBandService();
    const sentiment = new SentimentService();
    const summarisation = new SummarisationService();
    const llmModeConfig = new LlmModeConfig();

    pipeline = new ClassificationPipelineService(
      distilled,
      llm,
      ner,
      validator,
      confidenceBand,
      sentiment,
      summarisation,
      llmModeConfig,
    );

    pipeline.setLlmMode('ON');
    pipeline.reset5xxTracking();
    // Clear REGULATOR_MODE for each test
    delete process.env.REGULATOR_MODE;
  });

  afterEach(() => {
    delete process.env.REGULATOR_MODE;
  });

  // --- REGULATOR_MODE ---

  it('should force DEGRADED mode when REGULATOR_MODE is true', () => {
    process.env.REGULATOR_MODE = 'true';
    expect(pipeline.getEffectiveMode()).toBe('DEGRADED');
  });

  it('should not affect mode when REGULATOR_MODE is false', () => {
    process.env.REGULATOR_MODE = 'false';
    expect(pipeline.getEffectiveMode()).toBe('ON');
  });

  it('should not affect mode when REGULATOR_MODE is not set', () => {
    delete process.env.REGULATOR_MODE;
    expect(pipeline.getEffectiveMode()).toBe('ON');
  });

  // --- 5xx auto-degrade ---

  it('should not degrade when error rate is below 50%', () => {
    // Record 20 calls: 8 errors (40%)
    for (let i = 0; i < 12; i++) pipeline.record5xxResult(false);
    for (let i = 0; i < 8; i++) pipeline.record5xxResult(true);

    expect(pipeline.get5xxErrorRate()).toBeLessThanOrEqual(0.5);
    expect(pipeline.getEffectiveMode()).toBe('ON');
  });

  it('should degrade to DEGRADED when error rate exceeds 50% with enough samples', () => {
    // Record 20 calls: 12 errors (60%)
    for (let i = 0; i < 8; i++) pipeline.record5xxResult(false);
    for (let i = 0; i < 12; i++) pipeline.record5xxResult(true);

    expect(pipeline.get5xxErrorRate()).toBeGreaterThan(0.5);
    expect(pipeline.getEffectiveMode()).toBe('DEGRADED');
  });

  it('should not degrade with very few samples even if error rate is high', () => {
    // Record fewer than 10 calls (threshold for activation)
    for (let i = 0; i < 5; i++) pipeline.record5xxResult(true);

    // Error rate is 100% but only 5 samples
    expect(pipeline.get5xxErrorRate()).toBe(1);
    expect(pipeline.getEffectiveMode()).toBe('ON');
  });

  it('should recover when error rate drops below 50%', () => {
    // First, trigger degradation
    for (let i = 0; i < 15; i++) pipeline.record5xxResult(true);
    for (let i = 0; i < 5; i++) pipeline.record5xxResult(false);
    // 15 errors in 20 calls = 75%
    expect(pipeline.getEffectiveMode()).toBe('DEGRADED');

    // Now add many successes to dilute errors
    pipeline.reset5xxTracking();
    for (let i = 0; i < 15; i++) pipeline.record5xxResult(false);
    for (let i = 0; i < 5; i++) pipeline.record5xxResult(true);
    // 5 errors in 20 calls = 25%
    expect(pipeline.getEffectiveMode()).toBe('ON');
  });

  it('should report correct error rate', () => {
    expect(pipeline.get5xxErrorRate()).toBe(0);

    pipeline.record5xxResult(true);
    pipeline.record5xxResult(false);
    expect(pipeline.get5xxErrorRate()).toBe(0.5);

    pipeline.record5xxResult(false);
    pipeline.record5xxResult(false);
    // 1 error in 4 calls = 25%
    expect(pipeline.get5xxErrorRate()).toBe(0.25);
  });

  it('should reset 5xx tracking', () => {
    for (let i = 0; i < 20; i++) pipeline.record5xxResult(true);
    expect(pipeline.get5xxErrorRate()).toBe(1);

    pipeline.reset5xxTracking();
    expect(pipeline.get5xxErrorRate()).toBe(0);
  });

  it('should still return OFF when llmMode is OFF regardless of REGULATOR_MODE', () => {
    pipeline.setLlmMode('OFF');
    process.env.REGULATOR_MODE = 'true';
    expect(pipeline.getEffectiveMode()).toBe('OFF');
  });

  it('REGULATOR_MODE should take precedence over 5xx auto-degrade', () => {
    process.env.REGULATOR_MODE = 'true';
    // Even with zero errors, REGULATOR_MODE forces DEGRADED
    for (let i = 0; i < 20; i++) pipeline.record5xxResult(false);
    expect(pipeline.getEffectiveMode()).toBe('DEGRADED');
  });
});
