import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { getDb } from '../db';
import { AggregateMetrics, getTopMisclassifications } from '../runner/metrics';

export interface JsonReport {
  metadata: {
    runId: string;
    runName: string;
    llmMode: string;
    emailCount: number;
    generatedAt: string;
    durationMs: number;
  };
  classification: {
    overallAccuracy: number;
    macroPrecision: number;
    macroRecall: number;
    macroF1: number;
    weightedF1: number;
  };
  perClassMetrics: Array<{
    label: string;
    precision: number;
    recall: number;
    f1: number;
    support: number;
  }>;
  confusionMatrix: {
    labels: string[];
    matrix: number[][];
  };
  confidenceBands: {
    green: { count: number; percentage: number; accuracy: number };
    amber: { count: number; percentage: number; accuracy: number };
    red: { count: number; percentage: number; accuracy: number };
    redManual: { count: number; percentage: number; accuracy: number };
  };
  ner: {
    precision: number;
    recall: number;
    f1: number;
  };
  latency: {
    avgMs: number;
    p95Ms: number;
    p99Ms: number;
  };
  topMisclassifications: Array<{
    actual: string;
    predicted: string;
    count: number;
  }>;
  misclassifiedExamples: Array<{
    emailId: string;
    subject: string;
    actual: string;
    predicted: string;
    confidence: number;
    band: string;
  }>;
}

export async function generateJsonReport(
  runId: string,
  runName: string,
  llmMode: string,
  emailCount: number,
  metrics: AggregateMetrics,
  nerMetrics: { precision: number; recall: number; f1: number },
  durationMs: number,
): Promise<string> {
  const db = getDb();

  // Fetch misclassified examples
  const misclassified = await db.benchmarkResult.findMany({
    where: { benchmarkRunId: runId, isCorrect: false },
    include: { testEmail: true },
    take: 50,
  });

  const total =
    metrics.bandDistribution.green.count +
    metrics.bandDistribution.amber.count +
    metrics.bandDistribution.red.count +
    metrics.bandDistribution.redManual.count;

  const report: JsonReport = {
    metadata: {
      runId,
      runName,
      llmMode,
      emailCount,
      generatedAt: new Date().toISOString(),
      durationMs,
    },
    classification: {
      overallAccuracy: metrics.overallAccuracy,
      macroPrecision: metrics.macroPrecision,
      macroRecall: metrics.macroRecall,
      macroF1: metrics.macroF1,
      weightedF1: metrics.weightedF1,
    },
    perClassMetrics: metrics.perClassMetrics,
    confusionMatrix: metrics.confusionMatrix,
    confidenceBands: {
      green: { count: metrics.bandDistribution.green.count, percentage: total > 0 ? metrics.bandDistribution.green.count / total : 0, accuracy: metrics.bandDistribution.green.accuracy },
      amber: { count: metrics.bandDistribution.amber.count, percentage: total > 0 ? metrics.bandDistribution.amber.count / total : 0, accuracy: metrics.bandDistribution.amber.accuracy },
      red: { count: metrics.bandDistribution.red.count, percentage: total > 0 ? metrics.bandDistribution.red.count / total : 0, accuracy: metrics.bandDistribution.red.accuracy },
      redManual: { count: metrics.bandDistribution.redManual.count, percentage: total > 0 ? metrics.bandDistribution.redManual.count / total : 0, accuracy: metrics.bandDistribution.redManual.accuracy },
    },
    ner: nerMetrics,
    latency: {
      avgMs: metrics.latency.avg,
      p95Ms: metrics.latency.p95,
      p99Ms: metrics.latency.p99,
    },
    topMisclassifications: getTopMisclassifications(metrics.confusionMatrix, 10),
    misclassifiedExamples: misclassified.map((r) => ({
      emailId: r.testEmailId,
      subject: r.testEmail.subject,
      actual: r.testEmail.groundTruthLabel,
      predicted: r.predictedLabel || 'N/A',
      confidence: r.predictedConfidence || 0,
      band: r.confidenceBand || 'N/A',
    })),
  };

  // Ensure reports directory exists
  if (!fs.existsSync(config.reportsDir)) {
    fs.mkdirSync(config.reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${runName}-${timestamp}.json`;
  const filepath = path.join(config.reportsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`\n  JSON report saved: ${filepath}`);

  return filepath;
}
