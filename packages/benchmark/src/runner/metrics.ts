export const ALL_LABELS = [
  'VALUATION_REQUEST',
  'LEGAL_OPINION',
  'TITLE_SEARCH',
  'INSURANCE_RENEWAL',
  'RELEASE_OF_COLLATERAL',
  'SITE_VISIT',
  'DOCUMENT_COLLECTION',
  'GENERAL_INQUIRY',
];

export interface ConfusionMatrix {
  labels: string[];
  matrix: number[][];
}

export interface PerClassMetrics {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface BandDistribution {
  green: { count: number; accuracy: number };
  amber: { count: number; accuracy: number };
  red: { count: number; accuracy: number };
  redManual: { count: number; accuracy: number };
}

export interface AggregateMetrics {
  overallAccuracy: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  weightedF1: number;
  confusionMatrix: ConfusionMatrix;
  perClassMetrics: PerClassMetrics[];
  bandDistribution: BandDistribution;
  latency: { avg: number; p95: number; p99: number };
}

interface ResultRow {
  groundTruthLabel: string;
  predictedLabel: string | null;
  isCorrect: boolean;
  confidenceBand: string | null;
  inferenceMs: number;
}

export function computeAggregateMetrics(results: ResultRow[]): AggregateMetrics {
  const labels = ALL_LABELS;
  const n = labels.length;
  const labelIdx = new Map(labels.map((l, i) => [l, i]));

  // Confusion matrix
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (const r of results) {
    const actual = labelIdx.get(r.groundTruthLabel);
    const predicted = labelIdx.get(r.predictedLabel || '');
    if (actual !== undefined && predicted !== undefined) {
      matrix[actual][predicted]++;
    }
  }

  // Per-class metrics
  const perClassMetrics: PerClassMetrics[] = labels.map((label, i) => {
    const tp = matrix[i][i];
    const fp = matrix.reduce((sum, row, j) => (j !== i ? sum + row[i] : sum), 0);
    const fn = matrix[i].reduce((sum, val, j) => (j !== i ? sum + val : sum), 0);
    const support = matrix[i].reduce((sum, val) => sum + val, 0);

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return { label, precision, recall, f1, support };
  });

  // Macro averages
  const validClasses = perClassMetrics.filter((m) => m.support > 0);
  const macroPrecision = validClasses.reduce((sum, m) => sum + m.precision, 0) / validClasses.length;
  const macroRecall = validClasses.reduce((sum, m) => sum + m.recall, 0) / validClasses.length;
  const macroF1 = validClasses.reduce((sum, m) => sum + m.f1, 0) / validClasses.length;

  // Weighted F1
  const totalSupport = validClasses.reduce((sum, m) => sum + m.support, 0);
  const weightedF1 = validClasses.reduce((sum, m) => sum + m.f1 * (m.support / totalSupport), 0);

  // Overall accuracy
  const correct = results.filter((r) => r.isCorrect).length;
  const overallAccuracy = results.length > 0 ? correct / results.length : 0;

  // Band distribution
  const bandDistribution = computeBandDistribution(results);

  // Latency
  const latencies = results.map((r) => r.inferenceMs).filter((v) => v > 0).sort((a, b) => a - b);
  const latency = {
    avg: latencies.length > 0 ? latencies.reduce((sum, v) => sum + v, 0) / latencies.length : 0,
    p95: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0,
    p99: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0,
  };

  return {
    overallAccuracy,
    macroPrecision,
    macroRecall,
    macroF1,
    weightedF1,
    confusionMatrix: { labels, matrix },
    perClassMetrics,
    bandDistribution,
    latency,
  };
}

function computeBandDistribution(results: ResultRow[]): BandDistribution {
  const bands = { GREEN: { count: 0, correct: 0 }, AMBER: { count: 0, correct: 0 }, RED: { count: 0, correct: 0 }, RED_MANUAL: { count: 0, correct: 0 } };

  for (const r of results) {
    const band = r.confidenceBand as keyof typeof bands;
    if (band && bands[band]) {
      bands[band].count++;
      if (r.isCorrect) bands[band].correct++;
    }
  }

  return {
    green: { count: bands.GREEN.count, accuracy: bands.GREEN.count > 0 ? bands.GREEN.correct / bands.GREEN.count : 0 },
    amber: { count: bands.AMBER.count, accuracy: bands.AMBER.count > 0 ? bands.AMBER.correct / bands.AMBER.count : 0 },
    red: { count: bands.RED.count, accuracy: bands.RED.count > 0 ? bands.RED.correct / bands.RED.count : 0 },
    redManual: { count: bands.RED_MANUAL.count, accuracy: bands.RED_MANUAL.count > 0 ? bands.RED_MANUAL.correct / bands.RED_MANUAL.count : 0 },
  };
}

export function getTopMisclassifications(
  cm: ConfusionMatrix,
  topN = 5,
): { actual: string; predicted: string; count: number }[] {
  const pairs: { actual: string; predicted: string; count: number }[] = [];

  for (let i = 0; i < cm.labels.length; i++) {
    for (let j = 0; j < cm.labels.length; j++) {
      if (i !== j && cm.matrix[i][j] > 0) {
        pairs.push({
          actual: cm.labels[i],
          predicted: cm.labels[j],
          count: cm.matrix[i][j],
        });
      }
    }
  }

  return pairs.sort((a, b) => b.count - a.count).slice(0, topN);
}
