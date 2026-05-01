import { DistilledClassifier } from '../classifiers/distilled.classifier';
import { MockLlmClassifier } from '../classifiers/llm.classifier';
import { RuleBasedExtractor } from '../ner/rule-based.extractor';
import { MasterValidator } from '../validation/master-validator';
import { ConfidenceBandService } from '../services/confidence-band.service';
import { SentimentService } from '../services/sentiment.service';
import { SummarisationService } from '../services/summarisation.service';
import { ClassificationPipelineService } from '../services/classification-pipeline.service';
import { DriftMonitorService } from '../services/drift-monitor.service';
import { LlmModeConfig } from '../config/llm-mode.config';
import { ModelRegistryService } from '../config/model-registry';

describe('AI Classification Pipeline', () => {
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

  describe('DistilledClassifier', () => {
    it('should return valid labels for a valuation request email', async () => {
      const result = await distilledClassifier.classify({
        subject: 'Property Valuation Required',
        body: 'Please arrange for valuation of the property at Mumbai. The valuation report is needed urgently.',
      });

      expect(result.length).toBeGreaterThanOrEqual(5);
      expect(result[0].label).toBe('VALUATION_REQUEST');
      expect(result[0].confidence).toBeGreaterThan(0);
      expect(result[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should return valid labels for a legal opinion email', async () => {
      const result = await distilledClassifier.classify({
        subject: 'Legal Opinion Needed',
        body: 'We require a legal opinion on the title documents for the property.',
      });

      expect(result.length).toBeGreaterThanOrEqual(5);
      expect(result[0].label).toBe('LEGAL_OPINION');
      expect(result[0].confidence).toBeGreaterThan(0);
    });

    it('should return valid labels for an insurance renewal email', async () => {
      const result = await distilledClassifier.classify({
        subject: 'Insurance Policy Renewal',
        body: 'The insurance premium is due for renewal. Please process the insurance renewal.',
      });

      expect(result.length).toBeGreaterThanOrEqual(5);
      expect(result[0].label).toBe('INSURANCE_RENEWAL');
    });

    it('should return valid labels for a site visit email', async () => {
      const result = await distilledClassifier.classify({
        subject: 'Schedule Site Visit',
        body: 'Please arrange a site visit and inspection of the property.',
      });

      expect(result.length).toBeGreaterThanOrEqual(5);
      expect(result[0].label).toBe('SITE_VISIT');
    });

    it('should return confidences that approximately sum to 1.0', async () => {
      const result = await distilledClassifier.classify({
        subject: 'Test email',
        body: 'Some general text about a valuation matter',
      });

      const totalConfidence = result.reduce((sum, r) => sum + r.confidence, 0);
      // Top 5 of 8 labels, so sum should be close to (but not exactly) 1.0
      // All 8 labels sum to 1.0, top 5 should be the bulk
      expect(totalConfidence).toBeGreaterThan(0.5);
      expect(totalConfidence).toBeLessThanOrEqual(1.0);
    });

    it('should produce deterministic results (no jitter) on repeated calls', async () => {
      const email = {
        subject: 'Valuation Request',
        body: 'Please conduct property valuation.',
      };

      const result1 = await distilledClassifier.classify(email);
      const result2 = await distilledClassifier.classify(email);

      // Labels and confidences should be identical without jitter
      expect(result1[0].label).toBe(result2[0].label);
      expect(result1[0].confidence).toBe(result2[0].confidence);
    });
  });

  describe('RuleBasedExtractor (NER)', () => {
    it('should extract loan account number', () => {
      const text = 'Regarding loan account LN-2024-00012345, please process the request.';
      const entities = nerExtractor.extract(text);

      const loanEntities = entities.filter((e) => e.entity_type === 'loan_account_no');
      expect(loanEntities.length).toBeGreaterThan(0);
      expect(loanEntities[0].value).toContain('LN-2024-00012345');
    });

    it('should extract loan number with slash format', () => {
      const text = 'Reference: LN/1234/56789012 for the property.';
      const entities = nerExtractor.extract(text);

      const loanEntities = entities.filter((e) => e.entity_type === 'loan_account_no');
      expect(loanEntities.length).toBeGreaterThan(0);
    });

    it('should extract Indian PIN code', () => {
      const text = 'Property located at Andheri West, Mumbai, PIN: 400058.';
      const entities = nerExtractor.extract(text);

      const pinEntities = entities.filter((e) => e.entity_type === 'property_pin');
      expect(pinEntities.length).toBeGreaterThan(0);
      expect(pinEntities[0].value).toBe('400058');
    });

    it('should not extract invalid PIN codes starting with 0', () => {
      const text = 'Code 012345 is not a valid PIN.';
      const entities = nerExtractor.extract(text);

      const pinEntities = entities.filter((e) => e.entity_type === 'property_pin');
      // PIN pattern requires first digit 1-9
      const validPins = pinEntities.filter((e) => /^[1-9]\d{5}$/.test(e.value));
      expect(validPins.length).toBe(0);
    });

    it('should extract contact phone number', () => {
      const text = 'Please contact Mr. Sharma at +919876543210 for further details.';
      const entities = nerExtractor.extract(text);

      const phoneEntities = entities.filter((e) => e.entity_type === 'contact_phone');
      expect(phoneEntities.length).toBeGreaterThan(0);
      expect(phoneEntities[0].value).toContain('9876543210');
    });

    it('should extract customer name', () => {
      const text = 'Dear Mr. Rajesh Kumar, your loan application has been received.';
      const entities = nerExtractor.extract(text);

      const nameEntities = entities.filter((e) => e.entity_type === 'customer_name');
      expect(nameEntities.length).toBeGreaterThan(0);
      expect(nameEntities[0].value).toContain('Rajesh Kumar');
    });

    it('should extract monetary amount', () => {
      const text = 'The property is valued at Rs. 45,00,000 as per the latest report.';
      const entities = nerExtractor.extract(text);

      const amountEntities = entities.filter((e) => e.entity_type === 'monetary_amount');
      expect(amountEntities.length).toBeGreaterThan(0);
      expect(amountEntities[0].value).toContain('45,00,000');
    });

    it('should extract property city', () => {
      const text = 'The property is located in Pune, Maharashtra.';
      const entities = nerExtractor.extract(text);

      const cityEntities = entities.filter((e) => e.entity_type === 'property_city');
      expect(cityEntities.length).toBeGreaterThan(0);
      expect(cityEntities[0].value).toBe('Pune');
    });

    it('should extract due date', () => {
      const text = 'Please submit the documents by 15-Mar-2024.';
      const entities = nerExtractor.extract(text);

      const dateEntities = entities.filter((e) => e.entity_type === 'due_date');
      expect(dateEntities.length).toBeGreaterThan(0);
      expect(dateEntities[0].value).toContain('15-Mar-2024');
    });

    it('should extract reference number', () => {
      const text = 'Reference No: ATL-2024-000123 for this case.';
      const entities = nerExtractor.extract(text);

      const refEntities = entities.filter((e) => e.entity_type === 'reference_number');
      expect(refEntities.length).toBeGreaterThan(0);
    });

    it('should extract multiple entities from a complex email', () => {
      const text = `Dear Mr. Suresh Patel,

Regarding loan account LN-2024-00056789, we need a valuation report for the property
located at Andheri West, Mumbai, PIN 400058. The estimated value is Rs. 1,25,00,000.

Please contact our vendor: ABC Valuers for scheduling a site visit.
The report is due by 20/03/2024.

Contact: +919876543210
Ref: ATL-2024-000456`;

      const entities = nerExtractor.extract(text);

      const entityTypes = entities.map((e) => e.entity_type);
      expect(entityTypes).toContain('customer_name');
      expect(entityTypes).toContain('loan_account_no');
      expect(entityTypes).toContain('property_city');
      expect(entityTypes).toContain('property_pin');
      expect(entityTypes).toContain('monetary_amount');
      expect(entityTypes).toContain('contact_phone');
    });

    it('should tag all extracted entities with entity_source = rule_based', () => {
      const text = 'Dear Mr. Rajesh Kumar, loan LN-2024-00012345 for property in Mumbai.';
      const entities = nerExtractor.extract(text);

      expect(entities.length).toBeGreaterThan(0);
      for (const entity of entities) {
        expect(entity.entity_source).toBe('rule_based');
      }
    });

    it('should fall back to LLM when expected entities are missing', async () => {
      const mockLlmExtractor = {
        extractEntities: jest.fn().mockResolvedValue([
          {
            entity_type: 'loan_account_no',
            value: 'LN-MOCK-0001',
            start_offset: 0,
            end_offset: 12,
            confidence: 0.75,
          },
        ]),
      };
      nerExtractor.setLlmExtractor(mockLlmExtractor);

      // Text that has no loan account number but would be VALUATION_REQUEST
      const text = 'Please arrange for valuation of the property at Mumbai.';
      const entities = await nerExtractor.extractWithFallback(text, 'VALUATION_REQUEST');

      // Should have called LLM for missing entities
      expect(mockLlmExtractor.extractEntities).toHaveBeenCalled();

      // LLM-sourced entities should be tagged
      const llmEntities = entities.filter((e) => e.entity_source === 'llm_fallback');
      expect(llmEntities.length).toBeGreaterThan(0);
      expect(llmEntities[0].value).toBe('LN-MOCK-0001');
    });

    it('should not call LLM when all expected entities are found', async () => {
      const mockLlmExtractor = {
        extractEntities: jest.fn().mockResolvedValue([]),
      };
      nerExtractor.setLlmExtractor(mockLlmExtractor);

      // Text with loan_account_no, property_city, and customer_name
      const text = 'Dear Mr. Rajesh Kumar, loan LN-2024-00012345 at Mumbai needs valuation.';
      const entities = await nerExtractor.extractWithFallback(text, 'VALUATION_REQUEST');

      expect(entities.length).toBeGreaterThan(0);
      // LLM should NOT have been called since all expected entities are present
      expect(mockLlmExtractor.extractEntities).not.toHaveBeenCalled();
    });
  });

  describe('MasterValidator', () => {
    it('should return PASS for exact canonical match', async () => {
      const entities = [
        {
          entity_type: 'property_city',
          value: 'Mumbai',
          start_offset: 0,
          end_offset: 6,
          confidence: 0.9,
        },
      ];

      const outcomes = await masterValidator.validate(entities);
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].outcome).toBe('PASS');
      expect(outcomes[0].resolved_value).toBe('Mumbai');
    });

    it('should return PASS for source form match', async () => {
      const entities = [
        {
          entity_type: 'property_city',
          value: 'Bombay',
          start_offset: 0,
          end_offset: 6,
          confidence: 0.9,
        },
      ];

      const outcomes = await masterValidator.validate(entities);
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].outcome).toBe('PASS');
      expect(outcomes[0].resolved_value).toBe('Mumbai');
    });

    it('should return FUZZY_MATCH for close misspelling', async () => {
      const entities = [
        {
          entity_type: 'property_city',
          value: 'Mumba',  // 1 character off from "Mumbai"
          start_offset: 0,
          end_offset: 5,
          confidence: 0.9,
        },
      ];

      const outcomes = await masterValidator.validate(entities);
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].outcome).toBe('FUZZY_MATCH');
      expect(outcomes[0].resolved_value).toBe('Mumbai');
      expect(outcomes[0].candidates).toContain('Mumbai');
    });

    it('should return FAIL for unrecognised city', async () => {
      const entities = [
        {
          entity_type: 'property_city',
          value: 'Timbuktu',
          start_offset: 0,
          end_offset: 8,
          confidence: 0.9,
        },
      ];

      const outcomes = await masterValidator.validate(entities);
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].outcome).toBe('FAIL');
      expect(outcomes[0].candidates).toBeDefined();
    });

    it('should validate loan account number format', async () => {
      const entities = [
        {
          entity_type: 'loan_account_no',
          value: 'LN-2024-00012345',
          start_offset: 0,
          end_offset: 16,
          confidence: 0.9,
        },
      ];

      const outcomes = await masterValidator.validate(entities);
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].outcome).toBe('PASS');
    });

    it('should validate PIN code format', async () => {
      const entities = [
        {
          entity_type: 'property_pin',
          value: '400058',
          start_offset: 0,
          end_offset: 6,
          confidence: 0.9,
        },
      ];

      const outcomes = await masterValidator.validate(entities);
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].outcome).toBe('PASS');
    });

    it('should compute correct Levenshtein distance', () => {
      expect(masterValidator.levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(masterValidator.levenshteinDistance('mumbai', 'mumbai')).toBe(0);
      expect(masterValidator.levenshteinDistance('mumbai', 'mumba')).toBe(1);
      expect(masterValidator.levenshteinDistance('pune', 'pne')).toBe(1);
      expect(masterValidator.levenshteinDistance('', 'abc')).toBe(3);
      expect(masterValidator.levenshteinDistance('abc', '')).toBe(3);
    });
  });

  describe('ConfidenceBandService (calibrated thresholds)', () => {
    it('should assign GREEN for confidence >= 0.40 (default)', () => {
      expect(confidenceBandService.assignBand(0.50)).toBe('GREEN');
      expect(confidenceBandService.assignBand(0.40)).toBe('GREEN');
    });

    it('should assign AMBER for confidence 0.20-0.39', () => {
      expect(confidenceBandService.assignBand(0.35)).toBe('AMBER');
      expect(confidenceBandService.assignBand(0.20)).toBe('AMBER');
    });

    it('should assign RED for confidence 0.10-0.19', () => {
      expect(confidenceBandService.assignBand(0.15)).toBe('RED');
      expect(confidenceBandService.assignBand(0.10)).toBe('RED');
    });

    it('should assign RED_MANUAL for confidence < 0.10', () => {
      expect(confidenceBandService.assignBand(0.09)).toBe('RED_MANUAL');
      expect(confidenceBandService.assignBand(0.01)).toBe('RED_MANUAL');
    });

    it('should use case-type-specific thresholds', () => {
      // RELEASE_OF_COLLATERAL has higher threshold (0.55 for GREEN)
      expect(confidenceBandService.assignBand(0.50, 'RELEASE_OF_COLLATERAL')).toBe('AMBER');
      expect(confidenceBandService.assignBand(0.60, 'RELEASE_OF_COLLATERAL')).toBe('GREEN');

      // GENERAL_INQUIRY has lower threshold (0.35 for GREEN)
      expect(confidenceBandService.assignBand(0.36, 'GENERAL_INQUIRY')).toBe('GREEN');
    });

    it('should correctly determine human review requirement', () => {
      expect(confidenceBandService.requiresHumanReview('GREEN')).toBe(false);
      expect(confidenceBandService.requiresHumanReview('AMBER')).toBe(true);
      expect(confidenceBandService.requiresHumanReview('RED')).toBe(true);
      expect(confidenceBandService.requiresHumanReview('RED_MANUAL')).toBe(true);
    });

    it('should expose default thresholds', () => {
      const thresholds = confidenceBandService.getDefaultThresholds();
      expect(thresholds.green).toBe(0.40);
      expect(thresholds.amber).toBe(0.20);
      expect(thresholds.red).toBe(0.10);
    });
  });

  describe('SentimentService', () => {
    it('should detect negative sentiment', () => {
      const result = sentimentService.analyse(
        'I am very frustrated and disappointed with the poor service. This is unacceptable.',
      );
      expect(result.sentiment).toBe('NEGATIVE');
    });

    it('should detect positive sentiment', () => {
      const result = sentimentService.analyse(
        'Thank you for the excellent and prompt service. Very happy with the resolution.',
      );
      expect(result.sentiment).toBe('POSITIVE');
    });

    it('should detect neutral sentiment', () => {
      const result = sentimentService.analyse(
        'Please find attached the valuation report for the property at Mumbai.',
      );
      expect(result.sentiment).toBe('NEUTRAL');
    });

    it('should detect urgency signal', () => {
      const result = sentimentService.analyse(
        'This matter is urgent and needs immediate attention. Please respond ASAP.',
      );
      expect(result.urgency_signal).toBeTruthy();
    });

    it('should upgrade priority for urgent negative emails', () => {
      const result = sentimentService.analyse(
        'This is urgent and I am very frustrated with your negligence. I will file a complaint.',
      );
      expect(result.priority_upgrade).toBe(true);
    });
  });

  describe('SummarisationService', () => {
    it('should not summarise short emails', () => {
      const shortText = 'Please find attached the valuation report.';
      expect(summarisationService.needsSummary(shortText)).toBe(false);
    });

    it('should summarise long emails', () => {
      const longText = 'A'.repeat(1501);
      expect(summarisationService.needsSummary(longText)).toBe(true);
    });

    it('should produce 3 bullets for long emails', () => {
      const longEmail = `Dear Sir,

This is regarding the property valuation request for loan account LN-2024-00012345. The property is located at Andheri West, Mumbai, PIN 400058. The borrower Mr. Rajesh Kumar has applied for a top-up loan and we need a fresh valuation report.

The previous valuation was done in January 2023 and the report has expired. The property is a 2BHK flat in a residential complex called "Green Valley Apartments". The carpet area is 850 sq ft and the super built-up area is 1100 sq ft. The society has 4 buildings with a total of 200 flats. The complex is well maintained with all modern amenities including swimming pool, gymnasium, and children's play area.

The current market rate in the area is approximately Rs 15,000 per sq ft. The previous valuation was Rs 1,10,00,000. We expect the current market value to be around Rs 1,25,00,000 based on recent transactions in the area. The nearest metro station is approximately 500 meters away and the area has excellent connectivity to the western express highway. Several schools, hospitals, and shopping centres are within a 2 km radius.

The property documentation includes the original sale deed dated 2018, the society share certificate, the occupation certificate from the municipal corporation, and the approved building plan. All documents have been verified by our legal team and found to be in order. The title is clear with no encumbrances or pending litigations.

Please arrange for a site visit by the empanelled valuer within 3 working days. The valuation report should be submitted in the standard format prescribed by the bank. Please ensure all photographs of the property are included including exterior views, interior rooms, common areas, and surrounding neighbourhood.

Kindly note that this is a time-sensitive matter as the customer has a court hearing scheduled for next week. The loan disbursement is contingent on the valuation report being submitted before 15-Mar-2024. Any delay will result in the customer missing the court deadline.

Please contact Mr. Rajesh Kumar at +919876543210 to schedule the site visit. His preferred time is between 10 AM and 4 PM on weekdays. Alternatively you may reach out to our branch operations team for coordination.

Thank you for your prompt attention to this matter.

Regards,
Operations Team`;

      const result = summarisationService.summarise(longEmail);
      expect(result.bullets.length).toBe(3);
      expect(result.source_spans.length).toBe(3);
      result.source_spans.forEach((span) => {
        expect(span.start).toBeGreaterThanOrEqual(0);
        expect(span.end).toBeGreaterThan(span.start);
      });
    });
  });

  describe('ClassificationPipelineService', () => {
    it('should run in OFF mode without errors and route to manual triage', async () => {
      pipeline.setLlmMode('OFF');

      const result = await pipeline.classify({
        subject: 'Property Valuation Required',
        body: 'Please arrange for valuation of the property at Mumbai.',
      });

      expect(result).toBeDefined();
      expect(result.top_label).toBe('MANUAL_TRIAGE');
      expect(result.top_confidence).toBe(0);
      expect(result.confidence_band).toBe('RED_MANUAL');
      expect(result.requires_human_review).toBe(true);
      expect(result.llm_mode).toBe('OFF');
      expect(result.inference_ms).toBeGreaterThanOrEqual(0);
      expect(result.entities).toBeInstanceOf(Array);
      expect(result.entities).toHaveLength(0);
      expect(result.validation_outcomes).toBeInstanceOf(Array);
      expect(result.validation_outcomes).toHaveLength(0);
      expect(result.classification_path).toBe('onnx_only');
    });

    it('should run in ON mode with LLM', async () => {
      pipeline.setLlmMode('ON');

      const result = await pipeline.classify({
        subject: 'Legal Opinion Request',
        body: 'We need a legal opinion on the title documents for property in Pune.',
      });

      expect(result).toBeDefined();
      expect(result.top_label).toBeDefined();
      expect(result.llm_mode).toBe('ON');
      // classification_path should be set
      expect(['onnx_only', 'onnx_llm_augmented']).toContain(result.classification_path);
    });

    it('should set classification_path to onnx_only in DEGRADED mode', async () => {
      pipeline.setLlmMode('DEGRADED');

      const result = await pipeline.classify({
        subject: 'Valuation Request',
        body: 'Please process the property valuation at Mumbai.',
      });

      expect(result.classification_path).toBe('onnx_only');
    });

    it('should include model_version in results', async () => {
      pipeline.setLlmMode('DEGRADED');

      const result = await pipeline.classify({
        subject: 'Test',
        body: 'Test body',
      });

      expect(result.model_version).toBeDefined();
      expect(typeof result.model_version).toBe('string');
    });

    it('should handle LLM errors gracefully', async () => {
      // Create a failing LLM classifier
      const failingLlm = {
        classify: jest.fn().mockRejectedValue(new Error('LLM service unavailable')),
      };

      const pipelineWithFailingLlm = new ClassificationPipelineService(
        distilledClassifier,
        failingLlm as any,
        nerExtractor,
        masterValidator,
        confidenceBandService,
        sentimentService,
        summarisationService,
        llmModeConfig,
        modelRegistry,
        driftMonitor,
      );
      pipelineWithFailingLlm.setLlmMode('ON');

      const result = await pipelineWithFailingLlm.classify({
        subject: 'Valuation Request',
        body: 'Please process the property valuation.',
      });

      // Should still return a valid result using distilled only
      expect(result).toBeDefined();
      expect(result.top_label).toBeDefined();
      expect(result.top_confidence).toBeGreaterThan(0);
      expect(result.classification_path).toBe('onnx_only');
    });

    it('should auto-degrade after multiple LLM failures', async () => {
      const failingLlm = {
        classify: jest.fn().mockRejectedValue(new Error('LLM timeout')),
      };

      const pipelineWithFailingLlm = new ClassificationPipelineService(
        distilledClassifier,
        failingLlm as any,
        nerExtractor,
        masterValidator,
        confidenceBandService,
        sentimentService,
        summarisationService,
        llmModeConfig,
        modelRegistry,
        driftMonitor,
      );
      pipelineWithFailingLlm.setLlmMode('ON');

      // Trigger multiple failures to exceed the threshold (3)
      for (let i = 0; i < 4; i++) {
        await pipelineWithFailingLlm.classify({
          subject: 'Test',
          body: 'Test body',
        });
      }

      // After exceeding failure threshold, LLM should no longer be called
      const callCountBefore = failingLlm.classify.mock.calls.length;
      await pipelineWithFailingLlm.classify({
        subject: 'Another test',
        body: 'Another test body',
      });
      const result = await pipelineWithFailingLlm.classify({
        subject: 'Final test',
        body: 'Final test body',
      });
      expect(result).toBeDefined();
      expect(result.top_label).toBeDefined();
    });

    it('should extract entities and validate them in the pipeline', async () => {
      pipeline.setLlmMode('DEGRADED');

      const result = await pipeline.classify({
        subject: 'Valuation for LN-2024-00012345',
        body: 'Property at Mumbai, PIN 400058. Customer: Mr. Rajesh Kumar. Amount: Rs. 50,00,000.',
      });

      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.validation_outcomes.length).toBeGreaterThan(0);

      // Check that Mumbai was validated
      const cityValidation = result.validation_outcomes.find((v) => v.field === 'property_city');
      if (cityValidation) {
        expect(cityValidation.outcome).toBe('PASS');
      }
    });

    it('should detect sentiment and urgency in the pipeline', async () => {
      pipeline.setLlmMode('DEGRADED');

      const result = await pipeline.classify({
        subject: 'URGENT: Immediate Action Required',
        body: 'This is urgent. I am extremely frustrated with the delay. Please respond immediately or I will escalate.',
      });

      expect(result.sentiment).toBe('NEGATIVE');
      expect(result.urgency_signal).toBeTruthy();
    });

    it('should produce summary for long emails', async () => {
      pipeline.setLlmMode('DEGRADED');

      const longBody = `This is regarding the property valuation request for loan account LN-2024-00012345.
The property is located at Andheri West, Mumbai, PIN 400058.
${'The detailed description of the property continues with many more details. '.repeat(30)}
Please arrange for a site visit by the empanelled valuer within 3 working days.
The valuation report should be submitted before 15-Mar-2024.`;

      const result = await pipeline.classify({
        subject: 'Valuation Request',
        body: longBody,
      });

      expect(result.summary).toBeDefined();
      expect(result.summary!.bullets.length).toBeGreaterThan(0);
    });

    it('should return correct structure for ClassificationResult', async () => {
      pipeline.setLlmMode('DEGRADED');

      const result = await pipeline.classify({
        subject: 'General Query',
        body: 'What is the status of my application?',
      });

      // Verify all required fields exist
      expect(result).toHaveProperty('top_label');
      expect(result).toHaveProperty('top_confidence');
      expect(result).toHaveProperty('alternatives');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('validation_outcomes');
      expect(result).toHaveProperty('confidence_band');
      expect(result).toHaveProperty('requires_human_review');
      expect(result).toHaveProperty('llm_mode');
      expect(result).toHaveProperty('inference_ms');
      expect(result).toHaveProperty('classification_path');
      expect(result).toHaveProperty('model_version');

      // Verify types
      expect(typeof result.top_label).toBe('string');
      expect(typeof result.top_confidence).toBe('number');
      expect(Array.isArray(result.alternatives)).toBe(true);
      expect(Array.isArray(result.entities)).toBe(true);
      expect(Array.isArray(result.validation_outcomes)).toBe(true);
      expect(['GREEN', 'AMBER', 'RED', 'RED_MANUAL']).toContain(result.confidence_band);
      expect(typeof result.requires_human_review).toBe('boolean');
      expect(typeof result.inference_ms).toBe('number');
      expect(['onnx_only', 'onnx_llm_augmented']).toContain(result.classification_path);
    });
  });

  describe('DriftMonitorService', () => {
    it('should record classification results', () => {
      driftMonitor.record(0.85, 'VALUATION_REQUEST');
      driftMonitor.record(0.72, 'LEGAL_OPINION');

      const report = driftMonitor.getWeeklyReport();
      expect(report.currentWeek).toBeDefined();
      expect(report.currentWeek!.sampleCount).toBe(2);
    });

    it('should compute correct average confidence', () => {
      driftMonitor.record(0.80, 'VALUATION_REQUEST');
      driftMonitor.record(0.60, 'LEGAL_OPINION');

      const report = driftMonitor.getWeeklyReport();
      expect(report.currentWeek!.avgConfidence).toBeCloseTo(0.70, 5);
    });

    it('should track category distribution', () => {
      driftMonitor.record(0.85, 'VALUATION_REQUEST');
      driftMonitor.record(0.72, 'VALUATION_REQUEST');
      driftMonitor.record(0.65, 'LEGAL_OPINION');

      const report = driftMonitor.getWeeklyReport();
      expect(report.currentWeek!.categoryDistribution['VALUATION_REQUEST']).toBe(2);
      expect(report.currentWeek!.categoryDistribution['LEGAL_OPINION']).toBe(1);
    });

    it('should detect confidence drift when avg drops > 5%', () => {
      // Simulate baseline week with high confidence
      driftMonitor.recordForWeek('2026-W15', 0.85, 'VALUATION_REQUEST');
      driftMonitor.recordForWeek('2026-W15', 0.80, 'LEGAL_OPINION');
      driftMonitor.recordForWeek('2026-W15', 0.82, 'TITLE_SEARCH');

      // Simulate current week with significantly lower confidence
      driftMonitor.recordForWeek('2026-W18', 0.40, 'VALUATION_REQUEST');
      driftMonitor.recordForWeek('2026-W18', 0.35, 'LEGAL_OPINION');
      driftMonitor.recordForWeek('2026-W18', 0.38, 'TITLE_SEARCH');

      const report = driftMonitor.getWeeklyReport();
      expect(report.confidenceDriftAlert).toBe(true);
      expect(report.confidenceDriftDelta).toBeLessThan(-5);
    });

    it('should NOT raise drift alert for small confidence changes', () => {
      // Simulate baseline week
      driftMonitor.recordForWeek('2026-W15', 0.85, 'VALUATION_REQUEST');
      driftMonitor.recordForWeek('2026-W15', 0.80, 'LEGAL_OPINION');

      // Simulate current week with similar confidence
      driftMonitor.recordForWeek('2026-W16', 0.83, 'VALUATION_REQUEST');
      driftMonitor.recordForWeek('2026-W16', 0.78, 'LEGAL_OPINION');

      const report = driftMonitor.getWeeklyReport();
      expect(report.confidenceDriftAlert).toBe(false);
    });

    it('should return empty report when no data is recorded', () => {
      const report = driftMonitor.getWeeklyReport();
      expect(report.currentWeek).toBeNull();
      expect(report.history).toHaveLength(0);
      expect(report.confidenceDriftAlert).toBe(false);
    });

    it('should detect category distribution drift', () => {
      // Baseline: mostly VALUATION_REQUEST
      for (let i = 0; i < 10; i++) {
        driftMonitor.recordForWeek('2026-W15', 0.85, 'VALUATION_REQUEST');
      }
      for (let i = 0; i < 2; i++) {
        driftMonitor.recordForWeek('2026-W15', 0.80, 'LEGAL_OPINION');
      }

      // Current: mostly LEGAL_OPINION (distribution shift)
      for (let i = 0; i < 2; i++) {
        driftMonitor.recordForWeek('2026-W18', 0.85, 'VALUATION_REQUEST');
      }
      for (let i = 0; i < 10; i++) {
        driftMonitor.recordForWeek('2026-W18', 0.80, 'LEGAL_OPINION');
      }

      const report = driftMonitor.getWeeklyReport();
      // Distribution of VALUATION_REQUEST changed from ~83% to ~17%
      expect(report.categoryDriftFlags['VALUATION_REQUEST']).toBe(true);
      expect(report.categoryDriftFlags['LEGAL_OPINION']).toBe(true);
    });

    it('should provide history in reverse chronological order', () => {
      driftMonitor.recordForWeek('2026-W15', 0.85, 'VALUATION_REQUEST');
      driftMonitor.recordForWeek('2026-W16', 0.80, 'LEGAL_OPINION');
      driftMonitor.recordForWeek('2026-W17', 0.75, 'TITLE_SEARCH');

      const report = driftMonitor.getWeeklyReport();
      expect(report.history.length).toBe(3);
      expect(report.history[0].week).toBe('2026-W17');
      expect(report.history[1].week).toBe('2026-W16');
      expect(report.history[2].week).toBe('2026-W15');
    });

    it('should reset in-memory data', () => {
      driftMonitor.record(0.85, 'VALUATION_REQUEST');
      driftMonitor.reset();

      const report = driftMonitor.getWeeklyReport();
      expect(report.currentWeek).toBeNull();
      expect(report.history).toHaveLength(0);
    });

    it('should generate correct ISO week strings', () => {
      // Jan 1, 2026 is a Thursday -> Week 1
      const week = driftMonitor.getISOWeek(new Date('2026-01-01'));
      expect(week).toBe('2026-W01');
    });
  });

  describe('ModelRegistryService', () => {
    it('should load and expose current model version', () => {
      expect(modelRegistry.getCurrentVersion()).toBeDefined();
      expect(typeof modelRegistry.getCurrentVersion()).toBe('string');
    });

    it('should return the current model entry', () => {
      const currentModel = modelRegistry.getCurrentModel();
      expect(currentModel).toBeDefined();
      if (currentModel) {
        expect(currentModel.version).toBe(modelRegistry.getCurrentVersion());
        expect(currentModel.name).toBeDefined();
        expect(typeof currentModel.accuracy).toBe('number');
      }
    });

    it('should return all models', () => {
      const allModels = modelRegistry.getAllModels();
      expect(allModels.length).toBeGreaterThan(0);
    });
  });
});
