import { getDb } from '../db';
import { createPipeline } from '../pipeline-factory';
import { evaluateEntities, computeNerMetrics, NerEvaluationResult } from './ner-evaluator';
import { computeAggregateMetrics, AggregateMetrics } from './metrics';
import { v4 as uuidv4 } from 'uuid';
import type { LlmMode } from '@atlas/api/ai-classification';

const BATCH_INSERT_SIZE = 100;

export interface BenchmarkOptions {
  name: string;
  llmMode: LlmMode;
  batchId?: string;
  category?: string;
  difficulty?: string;
}

export interface BenchmarkRunResult {
  runId: string;
  metrics: AggregateMetrics;
  nerMetrics: { precision: number; recall: number; f1: number };
  emailCount: number;
  durationMs: number;
}

export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkRunResult> {
  const db = getDb();
  const startTime = Date.now();

  // Create benchmark run record
  const runId = uuidv4();
  await db.benchmarkRun.create({
    data: {
      id: runId,
      runName: options.name,
      llmMode: options.llmMode,
      batchIdFilter: options.batchId || null,
    },
  });

  console.log(`\nBenchmark run: ${options.name} (${runId})`);
  console.log(`  LLM mode: ${options.llmMode}`);

  // Load test emails
  const where: Record<string, unknown> = {};
  if (options.batchId) where.generationBatch = options.batchId;
  if (options.category) where.groundTruthLabel = options.category.toUpperCase();
  if (options.difficulty) where.difficulty = options.difficulty.toUpperCase();

  const testEmails = await db.testEmail.findMany({ where });
  console.log(`  Loaded ${testEmails.length} test emails`);

  if (testEmails.length === 0) {
    console.log('  No test emails found — aborting.');
    return { runId, metrics: {} as AggregateMetrics, nerMetrics: { precision: 0, recall: 0, f1: 0 }, emailCount: 0, durationMs: 0 };
  }

  // Create pipeline
  const { pipeline } = await createPipeline(options.llmMode);
  console.log(`  Pipeline created, starting classification...`);

  // Process emails
  const resultRows: Array<{
    groundTruthLabel: string;
    predictedLabel: string | null;
    isCorrect: boolean;
    confidenceBand: string | null;
    inferenceMs: number;
  }> = [];

  const nerResults: NerEvaluationResult[] = [];
  const batchBuffer: Array<Record<string, unknown>> = [];
  let processed = 0;

  for (const email of testEmails) {
    try {
      const result = await pipeline.classify({
        subject: email.subject,
        body: email.body,
        threadContext: email.threadContext || undefined,
      });

      const isCorrect = result.top_label === email.groundTruthLabel;
      const confidenceBand = result.confidence_band;

      // Evaluate NER
      const rawEntities = email.groundTruthEntities;
      const groundTruthEntities: Array<{ entity_type: string; value: string }> =
        typeof rawEntities === 'string' ? JSON.parse(rawEntities) :
        Array.isArray(rawEntities) ? rawEntities as Array<{ entity_type: string; value: string }> :
        [];
      const predictedEntities = result.entities.map((e: { entity_type: string; value: string }) => ({
        entity_type: e.entity_type,
        value: e.value,
      }));
      const nerEval = evaluateEntities(groundTruthEntities, predictedEntities);
      nerResults.push(nerEval);

      // Sentiment/urgency evaluation
      const sentimentCorrect = email.expectedSentiment
        ? result.sentiment?.toLowerCase() === email.expectedSentiment.toLowerCase()
        : null;
      const urgencyCorrect = email.expectedUrgencySignal
        ? result.urgency_signal?.toLowerCase() === email.expectedUrgencySignal.toLowerCase()
        : null;

      const record = {
        id: uuidv4(),
        benchmarkRunId: runId,
        testEmailId: email.id,
        predictedLabel: result.top_label,
        predictedConfidence: result.top_confidence,
        isCorrect,
        confidenceBand,
        extractedEntitiesJson: result.entities,
        entityMatchResultsJson: nerEval.matches,
        validationOutcomesJson: result.validation_outcomes,
        predictedSentiment: result.sentiment || null,
        predictedUrgency: result.urgency_signal || null,
        sentimentCorrect,
        urgencyCorrect,
        summaryJson: result.summary || null,
        llmMode: result.llm_mode,
        inferenceMs: result.inference_ms,
      };

      batchBuffer.push(record);
      resultRows.push({
        groundTruthLabel: email.groundTruthLabel,
        predictedLabel: result.top_label,
        isCorrect,
        confidenceBand,
        inferenceMs: result.inference_ms,
      });

      // Flush batch
      if (batchBuffer.length >= BATCH_INSERT_SIZE) {
        await flushBatch(db, batchBuffer);
        batchBuffer.length = 0;
      }

      processed++;
      if (processed % 50 === 0) {
        console.log(`  Processed ${processed}/${testEmails.length}...`);
      }
    } catch (error) {
      console.error(`  Error processing email ${email.id}:`, error instanceof Error ? error.message : error);
      // Record failure
      batchBuffer.push({
        id: uuidv4(),
        benchmarkRunId: runId,
        testEmailId: email.id,
        predictedLabel: null,
        predictedConfidence: null,
        isCorrect: false,
        confidenceBand: null,
        inferenceMs: 0,
      });
      resultRows.push({
        groundTruthLabel: email.groundTruthLabel,
        predictedLabel: null,
        isCorrect: false,
        confidenceBand: null,
        inferenceMs: 0,
      });
    }
  }

  // Flush remaining
  if (batchBuffer.length > 0) {
    await flushBatch(db, batchBuffer);
  }

  console.log(`  Classification complete: ${processed}/${testEmails.length} processed`);

  // Compute metrics
  const metrics = computeAggregateMetrics(resultRows);
  const nerMetrics = computeNerMetrics(nerResults);
  const durationMs = Date.now() - startTime;

  // Update run record with metrics
  await db.benchmarkRun.update({
    where: { id: runId },
    data: {
      emailCount: testEmails.length,
      overallAccuracy: metrics.overallAccuracy,
      macroF1: metrics.macroF1,
      weightedF1: metrics.weightedF1,
      macroPrecision: metrics.macroPrecision,
      macroRecall: metrics.macroRecall,
      greenCount: metrics.bandDistribution.green.count,
      amberCount: metrics.bandDistribution.amber.count,
      redCount: metrics.bandDistribution.red.count,
      redManualCount: metrics.bandDistribution.redManual.count,
      greenAccuracy: metrics.bandDistribution.green.accuracy,
      amberAccuracy: metrics.bandDistribution.amber.accuracy,
      redAccuracy: metrics.bandDistribution.red.accuracy,
      nerPrecision: nerMetrics.precision,
      nerRecall: nerMetrics.recall,
      nerF1: nerMetrics.f1,
      confusionMatrix: metrics.confusionMatrix as any,
      perClassMetrics: metrics.perClassMetrics as any,
      avgInferenceMs: metrics.latency.avg,
      p95InferenceMs: metrics.latency.p95,
      p99InferenceMs: metrics.latency.p99,
      completedAt: new Date(),
    },
  });

  console.log(`\n  Run completed in ${(durationMs / 1000).toFixed(1)}s`);

  return { runId, metrics, nerMetrics, emailCount: testEmails.length, durationMs };
}

/**
 * FR-129.A5: Hold-out benchmarking pipeline.
 * Splits test emails into train and holdout sets, running benchmarks on each.
 */
export async function runHoldout(
  options: BenchmarkOptions & { holdoutPercent?: number },
): Promise<{ train: BenchmarkRunResult; holdout: BenchmarkRunResult }> {
  const holdoutPercent = options.holdoutPercent ?? 20;
  const db = getDb();

  const where: Record<string, unknown> = {};
  if (options.batchId) where.generationBatch = options.batchId;
  if (options.category) where.groundTruthLabel = options.category.toUpperCase();

  const allEmails = await db.testEmail.findMany({ where });

  // Sort by ID for deterministic split
  const sorted = [...allEmails].sort((a: any, b: any) => a.id.localeCompare(b.id));
  const splitIndex = Math.floor(sorted.length * (1 - holdoutPercent / 100));

  const trainEmails = sorted.slice(0, splitIndex);
  const holdoutEmails = sorted.slice(splitIndex);

  console.log(`Hold-out split: ${trainEmails.length} train, ${holdoutEmails.length} holdout (${holdoutPercent}%)`);

  // Run benchmark on both sets
  const trainResult = await runBenchmark({ ...options, name: `${options.name}-train` });
  const holdoutResult = await runBenchmark({ ...options, name: `${options.name}-holdout` });

  return { train: trainResult, holdout: holdoutResult };
}

async function flushBatch(db: ReturnType<typeof getDb>, records: Array<Record<string, unknown>>): Promise<void> {
  for (const record of records) {
    await db.benchmarkResult.create({ data: record as any });
  }
}
