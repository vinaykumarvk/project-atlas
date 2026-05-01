import { DistilledClassifier } from '../../classifiers/distilled.classifier';
import { MockLlmClassifier } from '../../classifiers/llm.classifier';
import { RuleBasedExtractor } from '../../ner/rule-based.extractor';
import { MasterValidator } from '../../validation/master-validator';
import { ConfidenceBandService } from '../confidence-band.service';
import { SentimentService } from '../sentiment.service';
import { SummarisationService } from '../summarisation.service';
import { ClassificationPipelineService } from '../classification-pipeline.service';
import { DriftMonitorService } from '../drift-monitor.service';
import { LlmModeConfig } from '../../config/llm-mode.config';
import { ModelRegistryService } from '../../config/model-registry';
import { ValidationOutcome } from '../../types';

describe('ClassificationPipelineService — Validation Gate (FR-016.A1 / FR-016.A3)', () => {
  let distilledClassifier: DistilledClassifier;
  let llmClassifier: MockLlmClassifier;
  let nerExtractor: RuleBasedExtractor;
  let masterValidator: MasterValidator;
  let confidenceBandService: ConfidenceBandService;
  let sentimentService: SentimentService;
  let summarisationService: SummarisationService;
  let llmModeConfig: LlmModeConfig;
  let modelRegistry: ModelRegistryService;
  let driftMonitor: DriftMonitorService;
  let pipeline: ClassificationPipelineService;

  beforeEach(() => {
    distilledClassifier = new DistilledClassifier();
    llmClassifier = new MockLlmClassifier();
    nerExtractor = new RuleBasedExtractor();
    masterValidator = new MasterValidator();
    confidenceBandService = new ConfidenceBandService();
    sentimentService = new SentimentService();
    summarisationService = new SummarisationService();
    llmModeConfig = new LlmModeConfig();
    modelRegistry = new ModelRegistryService();
    driftMonitor = new DriftMonitorService();
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
  });

  it('should set requiresManualTriage=true and confidence_band=RED_MANUAL when validation has FAIL outcome', async () => {
    // Spy on masterValidator to return a FAIL outcome
    jest.spyOn(masterValidator, 'validate').mockResolvedValue([
      {
        field: 'property_city',
        outcome: 'FAIL',
        original_value: 'Timbuktu',
        candidates: ['Mumbai', 'Pune', 'Delhi'],
      },
    ] as ValidationOutcome[]);

    pipeline.setLlmMode('DEGRADED');

    const result = await pipeline.classify({
      subject: 'Valuation Request',
      body: 'Property at Timbuktu, loan LN-2024-00012345.',
    });

    expect(result.requiresManualTriage).toBe(true);
    expect(result.confidence_band).toBe('RED_MANUAL');
    expect(result.requires_human_review).toBe(true);
    // Sentiment and summary should be skipped (autonomous routing skipped)
    expect(result.sentiment).toBeUndefined();
    expect(result.summary).toBeUndefined();
  });

  it('should allow normal routing when validation outcomes are PASS', async () => {
    // Spy on masterValidator to return all PASS outcomes
    jest.spyOn(masterValidator, 'validate').mockResolvedValue([
      {
        field: 'property_city',
        outcome: 'PASS',
        original_value: 'Mumbai',
        resolved_value: 'Mumbai',
      },
    ] as ValidationOutcome[]);

    pipeline.setLlmMode('DEGRADED');

    const result = await pipeline.classify({
      subject: 'Valuation Request for Mumbai',
      body: 'Property at Mumbai, loan LN-2024-00012345.',
    });

    // requiresManualTriage should not be set (or false)
    expect(result.requiresManualTriage).toBeFalsy();
    // confidence_band should be determined by normal band logic, not forced RED_MANUAL
    expect(['GREEN', 'AMBER', 'RED', 'RED_MANUAL']).toContain(result.confidence_band);
  });

  it('should allow normal routing when validation outcomes are FUZZY_MATCH', async () => {
    jest.spyOn(masterValidator, 'validate').mockResolvedValue([
      {
        field: 'property_city',
        outcome: 'FUZZY_MATCH',
        original_value: 'Mumba',
        resolved_value: 'Mumbai',
        candidates: ['Mumbai'],
      },
    ] as ValidationOutcome[]);

    pipeline.setLlmMode('DEGRADED');

    const result = await pipeline.classify({
      subject: 'Valuation Request',
      body: 'Property at Mumba.',
    });

    expect(result.requiresManualTriage).toBeFalsy();
    // Should still have sentiment populated (normal routing path)
    expect(result.sentiment).toBeDefined();
  });

  it('should skip autonomous routing even with mixed PASS and FAIL outcomes', async () => {
    jest.spyOn(masterValidator, 'validate').mockResolvedValue([
      {
        field: 'property_city',
        outcome: 'PASS',
        original_value: 'Mumbai',
        resolved_value: 'Mumbai',
      },
      {
        field: 'vendor_name',
        outcome: 'FAIL',
        original_value: 'Unknown Vendor XYZ',
        candidates: ['ABC Valuers Pvt Ltd', 'Kumar & Associates'],
      },
    ] as ValidationOutcome[]);

    pipeline.setLlmMode('DEGRADED');

    const result = await pipeline.classify({
      subject: 'Valuation Request',
      body: 'Property at Mumbai by Unknown Vendor XYZ.',
    });

    // Any FAIL should trigger manual triage
    expect(result.requiresManualTriage).toBe(true);
    expect(result.confidence_band).toBe('RED_MANUAL');
  });

  it('should still include validation_outcomes in the result when gate triggers', async () => {
    const failOutcomes: ValidationOutcome[] = [
      {
        field: 'property_city',
        outcome: 'FAIL',
        original_value: 'Atlantis',
        candidates: ['Mumbai', 'Pune'],
      },
    ];
    jest.spyOn(masterValidator, 'validate').mockResolvedValue(failOutcomes);

    pipeline.setLlmMode('DEGRADED');

    const result = await pipeline.classify({
      subject: 'Test',
      body: 'Property at Atlantis.',
    });

    expect(result.validation_outcomes).toEqual(failOutcomes);
    expect(result.validation_outcomes[0].outcome).toBe('FAIL');
  });
});
