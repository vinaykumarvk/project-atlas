import { Injectable, Logger } from '@nestjs/common';
import { DistilledClassifier } from '../classifiers/distilled.classifier';
import { LlmClassifierProvider } from '../classifiers/llm.classifier';
import { RuleBasedExtractor } from '../ner/rule-based.extractor';
import { MasterValidator } from '../validation/master-validator';
import { ConfidenceBandService } from './confidence-band.service';
import { SentimentService } from './sentiment.service';
import { SummarisationService } from './summarisation.service';
import { LlmModeConfig } from '../config/llm-mode.config';
import { ModelRegistryService } from '../config/model-registry';
import { DriftMonitorService } from './drift-monitor.service';
import { SenderDomainService } from './sender-domain.service';
import { PiiRedactionService } from '../../audit/services/pii-redaction.service';
import {
  ClassificationResult,
  EmailInput,
  LlmMode,
  ClassificationLabel,
  ConfidenceBand,
} from '../types';

/**
 * Sliding window configuration for LLM failure tracking.
 */
interface FailureWindow {
  timestamps: number[];
  windowMs: number;
  maxFailures: number;
}

/**
 * Classification Pipeline Service.
 * Orchestrates the full AI classification pipeline:
 * 1. Distilled classifier (always runs)
 * 2. Confidence-gated LLM augmentation:
 *    - GREEN band: use ONNX result directly (no LLM call)
 *    - AMBER/RED band: augment with LLM (if mode is ON)
 * 3. Named Entity Recognition
 * 4. Master data validation
 * 5. Confidence band assignment
 * 6. Sentiment and urgency detection
 * 7. Summarisation (if needed)
 *
 * Implements auto-degradation: tracks LLM failures in a sliding window
 * and automatically switches to DEGRADED mode if failure rate exceeds threshold.
 */
@Injectable()
export class ClassificationPipelineService {
  private readonly logger = new Logger(ClassificationPipelineService.name);

  /** FR-010 A5: Counter for inference SLO violations (> 4000ms). */
  private static sloViolationCount = 0;

  /** FR-016 A6: Counter for validation latency violations (> 500ms). */
  private static valLatencyViolationCount = 0;

  /** FR-010.A5: Circular buffer of last 1000 inference latencies for p99 tracking. */
  private static readonly P99_BUFFER_SIZE = 1000;
  private static latencyBuffer: number[] = [];
  private static latencyBufferIndex = 0;
  private static latencyBufferFull = false;

  /**
   * FR-010.A5: Record an inference latency sample into the circular buffer.
   */
  static recordLatency(latencyMs: number): void {
    ClassificationPipelineService.latencyBuffer[ClassificationPipelineService.latencyBufferIndex] = latencyMs;
    ClassificationPipelineService.latencyBufferIndex =
      (ClassificationPipelineService.latencyBufferIndex + 1) % ClassificationPipelineService.P99_BUFFER_SIZE;
    if (ClassificationPipelineService.latencyBufferIndex === 0) {
      ClassificationPipelineService.latencyBufferFull = true;
    }
  }

  /**
   * FR-010.A5: Compute the p95 latency from the circular buffer.
   * Returns undefined if no samples have been recorded.
   */
  static getP95(): number | undefined {
    const count = ClassificationPipelineService.latencyBufferFull
      ? ClassificationPipelineService.P99_BUFFER_SIZE
      : ClassificationPipelineService.latencyBufferIndex;
    if (count === 0) return undefined;

    const samples = ClassificationPipelineService.latencyBuffer.slice(0, count);
    samples.sort((a, b) => a - b);
    const p95Index = Math.ceil(count * 0.95) - 1;
    return samples[p95Index];
  }

  /**
   * FR-010.A5: Compute the p99 latency from the circular buffer.
   * Returns undefined if no samples have been recorded.
   */
  static getP99(): number | undefined {
    const count = ClassificationPipelineService.latencyBufferFull
      ? ClassificationPipelineService.P99_BUFFER_SIZE
      : ClassificationPipelineService.latencyBufferIndex;
    if (count === 0) return undefined;

    const samples = ClassificationPipelineService.latencyBuffer.slice(0, count);
    samples.sort((a, b) => a - b);
    const p99Index = Math.ceil(count * 0.99) - 1;
    return samples[p99Index];
  }

  /**
   * FR-010.A5: Reset the latency buffer (for testing).
   */
  static resetLatencyBuffer(): void {
    ClassificationPipelineService.latencyBuffer = [];
    ClassificationPipelineService.latencyBufferIndex = 0;
    ClassificationPipelineService.latencyBufferFull = false;
  }

  private llmMode: LlmMode;
  private readonly failureWindow: FailureWindow = {
    timestamps: [],
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxFailures: 3,
  };

  /** FR-128.A4: Circular buffer to track 5xx errors in last 100 calls. */
  private readonly errorTrackingWindow = 100;
  private callResults: boolean[] = []; // true = 5xx error, false = success
  private callResultIndex = 0;
  private callResultCount = 0;

  /**
   * FR-010.BR: Region-level data residency enforcement.
   * Returns the LLM endpoint URL for the current DATA_REGION, or null if no override needed.
   */
  getRegionEndpoint(): { endpoint: string; region: string } | null {
    const dataRegion = process.env.DATA_REGION;
    if (!dataRegion) return null;

    const regionMapJson =
      process.env.LLM_ENDPOINT_REGION_MAP ||
      '{"ap-south-1":"https://llm-mumbai.internal"}';

    try {
      const regionMap: Record<string, string> = JSON.parse(regionMapJson);
      const endpoint = regionMap[dataRegion];
      if (endpoint) {
        return { endpoint, region: dataRegion };
      }
    } catch (error) {
      this.logger.warn(
        `Failed to parse LLM_ENDPOINT_REGION_MAP: ${(error as Error).message}`,
      );
    }

    return null;
  }

  private readonly allLabels = [
    'VALUATION_REQUEST',
    'LEGAL_OPINION',
    'TITLE_SEARCH',
    'INSURANCE_RENEWAL',
    'RELEASE_OF_COLLATERAL',
    'SITE_VISIT',
    'DOCUMENT_COLLECTION',
    'GENERAL_INQUIRY',
  ];

  constructor(
    private readonly distilledClassifier: DistilledClassifier,
    private readonly llmClassifier: LlmClassifierProvider,
    private readonly nerExtractor: RuleBasedExtractor,
    private readonly masterValidator: MasterValidator,
    private readonly confidenceBandService: ConfidenceBandService,
    private readonly sentimentService: SentimentService,
    private readonly summarisationService: SummarisationService,
    private readonly llmModeConfig: LlmModeConfig,
    private readonly modelRegistry?: ModelRegistryService,
    private readonly driftMonitor?: DriftMonitorService,
    private readonly senderDomainService?: SenderDomainService,
    private readonly piiRedactionService?: PiiRedactionService,
  ) {
    // Initialise the runtime LLM mode from environment-based config.
    this.llmMode = this.llmModeConfig.mode;
    this.logger.log(`Pipeline initialised with LLM mode: ${this.llmMode}`);
  }

  /**
   * Set the LLM mode.
   */
  setLlmMode(mode: LlmMode): void {
    this.llmMode = mode;
    this.logger.log(`LLM mode set to: ${mode}`);
  }

  /**
   * Get the current LLM mode.
   */
  getLlmMode(): LlmMode {
    return this.llmMode;
  }

  /**
   * Run the full classification pipeline on an email.
   *
   * Behaviour depends on the effective LLM mode:
   *  - OFF      : Skip classification entirely and return a manual-triage result.
   *  - DEGRADED : Run ONNX distilled classifier only (no LLM calls).
   *  - ON       : Run ONNX, then confidence-gate the LLM call:
   *               GREEN  -> use ONNX result directly (onnx_only)
   *               AMBER/RED -> augment with LLM (onnx_llm_augmented)
   */
  async classify(email: EmailInput): Promise<ClassificationResult> {
    const startTime = Date.now();
    const effectiveMode = this.getEffectiveMode();

    // --- OFF mode: skip classification, route to manual triage ---
    if (effectiveMode === 'OFF') {
      this.logger.log('LLM mode is OFF. Skipping classification; routing to manual triage.');
      const inferenceMs = Date.now() - startTime;
      return {
        top_label: 'MANUAL_TRIAGE',
        top_confidence: 0,
        alternatives: [],
        rationale: 'Classification disabled (LLM mode OFF). Routed to manual triage.',
        entities: [],
        validation_outcomes: [],
        confidence_band: 'RED_MANUAL',
        requires_human_review: true,
        sentiment: undefined,
        urgency_signal: undefined,
        summary: undefined,
        llm_mode: effectiveMode,
        inference_ms: inferenceMs,
        classification_path: 'onnx_only',
        model_version: this.modelRegistry?.getCurrentVersion() ?? undefined,
      };
    }

    // Step 0: Check sender domain rules for priority override (before ONNX classification)
    let priorityOverride: string | undefined;
    let priorityOverrideSource: string | undefined;
    if (this.senderDomainService && email.senderEmail) {
      const domainPriority = this.senderDomainService.checkDomain(email.senderEmail);
      if (domainPriority) {
        priorityOverride = domainPriority;
        priorityOverrideSource = 'SENDER_DOMAIN_RULE';
        this.logger.log(
          `Sender domain rule matched for ${email.senderEmail}: priority override = ${domainPriority}`,
        );
      }
    }

    // Step 1: Run distilled classifier (always runs in ON and DEGRADED modes)
    const distilledResults = await this.distilledClassifier.classify(email);
    const onnxTopResult = distilledResults[0];

    // FR-010.BR: Region-level data residency enforcement
    const regionInfo = this.getRegionEndpoint();
    const regionEnforced = regionInfo !== null;
    if (regionEnforced) {
      this.logger.log(
        `FR-010.BR: Region data residency enforced — LLM endpoint routed to ${regionInfo!.region} (${regionInfo!.endpoint})`,
      );
    }

    // Step 2: Confidence-gated LLM augmentation
    let classificationPath: 'onnx_only' | 'onnx_llm_augmented' = 'onnx_only';
    let llmResults: ClassificationLabel[] | null = null;
    let rationale: string | undefined;

    if (effectiveMode === 'ON') {
      // Check the ONNX confidence band to decide whether LLM augmentation is needed
      const onnxBand: ConfidenceBand = this.confidenceBandService.assignBand(
        onnxTopResult.confidence,
        onnxTopResult.label,
      );

      if (onnxBand === 'GREEN') {
        // HIGH confidence: ONNX result is sufficient, skip LLM call
        this.logger.debug(
          `ONNX confidence ${onnxTopResult.confidence.toFixed(3)} is GREEN band — skipping LLM augmentation`,
        );
        classificationPath = 'onnx_only';
      } else {
        // AMBER/RED/RED_MANUAL: augment with LLM
        this.logger.debug(
          `ONNX confidence ${onnxTopResult.confidence.toFixed(3)} is ${onnxBand} band — calling LLM for augmentation`,
        );
        try {
          // FR-123 A2: Redact PII before passing email body to LLM
          const redactedBody = this.piiRedactionService
            ? this.piiRedactionService.redact(email.body)
            : email.body;
          const llmEmail = { ...email, body: redactedBody };
          const llmOutput = await this.llmClassifier.classify(llmEmail, this.allLabels);
          llmResults = llmOutput.map((r) => ({ label: r.label, confidence: r.confidence }));
          rationale = llmOutput[0]?.rationale;
          classificationPath = 'onnx_llm_augmented';
        } catch (error) {
          this.recordLlmFailure();
          this.logger.warn(`LLM classification failed: ${(error as Error).message}. Falling back to distilled only.`);
          classificationPath = 'onnx_only';
        }
      }
    } else {
      // DEGRADED mode -- explicitly skip LLM
      this.logger.debug('LLM mode is DEGRADED. Running ONNX only; skipping LLM augmentation.');
    }

    // Step 3: Determine final scores
    // If LLM results were obtained, fuse them; otherwise use ONNX results directly
    const finalResults = llmResults
      ? this.fuseScores(distilledResults, llmResults)
      : distilledResults;
    const topResult = finalResults[0];
    const alternatives = finalResults.slice(1, 5);

    // Step 4: Run NER
    const fullText = `${email.subject}\n${email.body}`;
    const entities = this.nerExtractor.extract(fullText);

    // Step 5: Run master validation (FR-016 A6: with latency tracking)
    const valStart = Date.now();
    const validationOutcomes = await this.masterValidator.validate(entities);
    const valMs = Date.now() - valStart;
    if (valMs > 500) {
      ClassificationPipelineService.valLatencyViolationCount++;
      this.logger.warn(`Validation latency exceeded: ${valMs}ms > 500ms target`);
    }

    // FR-016.A1 / FR-016.A3: Validation gate — if any outcome is FAIL,
    // skip autonomous routing and flag for manual triage.
    const failedOutcomes = validationOutcomes.filter((v) => v.outcome === 'FAIL');
    if (failedOutcomes.length > 0) {
      const failReasons = failedOutcomes
        .map((v) => `${v.field}: "${v.original_value}"`)
        .join(', ');
      this.logger.warn(
        `Validation gate FAIL — skipping autonomous routing. Failed fields: ${failReasons}`,
      );

      const inferenceMs = Date.now() - startTime;

      // FR-010 A5: Inference SLO check (target < 4000ms)
      if (inferenceMs > 4000) {
        ClassificationPipelineService.sloViolationCount++;
        this.logger.warn(`Inference SLO exceeded: ${inferenceMs}ms > 4000ms target`);
      }

      return {
        top_label: topResult.label,
        top_confidence: topResult.confidence,
        alternatives: alternatives.map((a) => ({ label: a.label, confidence: a.confidence })),
        rationale,
        entities,
        validation_outcomes: validationOutcomes,
        confidence_band: 'RED_MANUAL' as const,
        requires_human_review: true,
        sentiment: undefined,
        urgency_signal: undefined,
        summary: undefined,
        llm_mode: effectiveMode,
        inference_ms: inferenceMs,
        classification_path: classificationPath,
        model_version: this.modelRegistry?.getCurrentVersion() ?? undefined,
        priority_override: priorityOverride,
        priority_override_source: priorityOverrideSource,
        requiresManualTriage: true,
      };
    }

    // Step 6: Assign confidence band
    const confidenceBand = this.confidenceBandService.assignBand(
      topResult.confidence,
      topResult.label,
    );
    const requiresHumanReview = this.confidenceBandService.requiresHumanReview(confidenceBand);

    // Step 7: Sentiment and urgency analysis
    const sentimentResult = this.sentimentService.analyse(fullText);

    // Step 8: Summarisation (if needed)
    let summary: ClassificationResult['summary'] | undefined;
    if (this.summarisationService.needsSummary(fullText)) {
      summary = this.summarisationService.summarise(fullText);
    }

    const inferenceMs = Date.now() - startTime;

    // FR-010 A5: Inference SLO check (target < 4000ms)
    if (inferenceMs > 4000) {
      ClassificationPipelineService.sloViolationCount++;
      this.logger.warn(`Inference SLO exceeded: ${inferenceMs}ms > 4000ms target`);
    }

    // FR-010.A5: Record latency and check p99 SLO
    ClassificationPipelineService.recordLatency(inferenceMs);
    const p99 = ClassificationPipelineService.getP99();
    const p99Slo = parseInt(process.env.INFERENCE_P99_SLO_MS || '8000', 10);
    if (p99 !== undefined && p99 > p99Slo) {
      this.logger.warn(
        `CRITICAL: p99 inference latency ${p99}ms exceeds SLO of ${p99Slo}ms`,
      );
    }

    // Step 9: Feed drift monitor (non-blocking)
    if (this.driftMonitor) {
      this.driftMonitor.record(topResult.confidence, topResult.label);
    }

    return {
      top_label: topResult.label,
      top_confidence: topResult.confidence,
      alternatives: alternatives.map((a) => ({ label: a.label, confidence: a.confidence })),
      rationale,
      entities,
      validation_outcomes: validationOutcomes,
      confidence_band: confidenceBand,
      requires_human_review: requiresHumanReview,
      sentiment: sentimentResult.sentiment,
      urgency_signal: sentimentResult.urgency_signal ?? undefined,
      summary,
      llm_mode: effectiveMode,
      inference_ms: inferenceMs,
      classification_path: classificationPath,
      model_version: this.modelRegistry?.getCurrentVersion() ?? undefined,
      priority_override: priorityOverride,
      priority_override_source: priorityOverrideSource,
    };
  }

  /**
   * FR-010.A2: Multi-label classification.
   * When top confidence is below the multi-label threshold,
   * returns multiple labels instead of forcing a single label.
   */
  async classifyMultiLabel(
    email: EmailInput,
    multiLabelThreshold = 0.7,
  ): Promise<ClassificationResult> {
    const result = await this.classify(email);

    // If top confidence is below threshold, include alternatives as labels
    if (result.top_confidence < multiLabelThreshold) {
      const labels = [
        result.top_label,
        ...result.alternatives
          .filter((a) => a.confidence > 0.1)
          .map((a) => a.label),
      ];
      result.labels = labels;
      this.logger.debug(
        `Multi-label classification: confidence ${result.top_confidence.toFixed(3)} < ${multiLabelThreshold} — returning ${labels.length} labels`,
      );
    } else {
      result.labels = [result.top_label];
    }

    return result;
  }

  /**
   * Fuse distilled and LLM scores.
   * If LLM results are available, weighted average is used:
   * - Distilled: 40% weight
   * - LLM: 60% weight (assumed more accurate)
   * If only distilled, use distilled scores directly.
   */
  private fuseScores(
    distilledResults: ClassificationLabel[],
    llmResults: ClassificationLabel[] | null,
  ): ClassificationLabel[] {
    if (!llmResults || llmResults.length === 0) {
      return distilledResults;
    }

    const distilledWeight = 0.4;
    const llmWeight = 0.6;

    // Build a map of label -> fused score
    const scoreMap = new Map<string, number>();

    for (const result of distilledResults) {
      scoreMap.set(result.label, (scoreMap.get(result.label) || 0) + result.confidence * distilledWeight);
    }

    for (const result of llmResults) {
      scoreMap.set(result.label, (scoreMap.get(result.label) || 0) + result.confidence * llmWeight);
    }

    // Convert to sorted array
    const fused: ClassificationLabel[] = Array.from(scoreMap.entries())
      .map(([label, confidence]) => ({ label, confidence }))
      .sort((a, b) => b.confidence - a.confidence);

    return fused;
  }

  /**
   * FR-128.A4: Record a call result for 5xx auto-degrade tracking.
   * @param is5xx - true if the call resulted in a 5xx error
   */
  record5xxResult(is5xx: boolean): void {
    if (this.callResults.length < this.errorTrackingWindow) {
      this.callResults.push(is5xx);
    } else {
      this.callResults[this.callResultIndex] = is5xx;
    }
    this.callResultIndex = (this.callResultIndex + 1) % this.errorTrackingWindow;
    this.callResultCount++;
  }

  /**
   * FR-128.A4: Get the current 5xx error rate in the last 100 calls.
   */
  get5xxErrorRate(): number {
    const count = Math.min(this.callResults.length, this.errorTrackingWindow);
    if (count === 0) return 0;
    const errors = this.callResults.slice(0, count).filter(Boolean).length;
    return errors / count;
  }

  /**
   * FR-128.A4: Reset the 5xx error tracking (for testing).
   */
  reset5xxTracking(): void {
    this.callResults = [];
    this.callResultIndex = 0;
    this.callResultCount = 0;
  }

  /**
   * Get the effective LLM mode, accounting for auto-degradation.
   */
  getEffectiveMode(): LlmMode {
    if (this.llmMode === 'OFF') return 'OFF';

    // FR-128.A4: REGULATOR_MODE env var — force DEGRADED (no LLM)
    if (process.env.REGULATOR_MODE === 'true') {
      this.logger.warn('REGULATOR_MODE is active — forcing DEGRADED mode (no LLM).');
      return 'DEGRADED';
    }

    // FR-128.A4: Auto-degrade when 5xx error rate > 50% in last 100 calls
    const errorRate = this.get5xxErrorRate();
    if (this.callResults.length >= 10 && errorRate > 0.5) {
      this.logger.warn(
        `5xx error rate ${(errorRate * 100).toFixed(1)}% exceeds 50% threshold. Auto-degrading to DEGRADED.`,
      );
      return 'DEGRADED';
    }

    // Check if we should auto-degrade based on sliding window failures
    this.pruneFailureWindow();
    if (this.failureWindow.timestamps.length >= this.failureWindow.maxFailures) {
      this.logger.warn(
        `LLM failure threshold exceeded (${this.failureWindow.timestamps.length}/${this.failureWindow.maxFailures}). Auto-degrading to OFF.`,
      );
      return 'OFF';
    }

    return this.llmMode;
  }

  /**
   * Record an LLM failure timestamp for the sliding window.
   */
  private recordLlmFailure(): void {
    this.failureWindow.timestamps.push(Date.now());
    this.pruneFailureWindow();
  }

  /**
   * Remove failure timestamps that are outside the sliding window.
   */
  private pruneFailureWindow(): void {
    const cutoff = Date.now() - this.failureWindow.windowMs;
    this.failureWindow.timestamps = this.failureWindow.timestamps.filter((t) => t > cutoff);
  }
}
