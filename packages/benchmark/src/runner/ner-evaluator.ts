export type MatchType = 'EXACT' | 'PARTIAL' | 'MISSING' | 'SPURIOUS';

export interface EntityMatchResult {
  entity_type: string;
  expected_value: string | null;
  predicted_value: string | null;
  match_type: MatchType;
}

export interface NerEvaluationResult {
  matches: EntityMatchResult[];
  truePositives: number;
  partialMatches: number;
  misses: number;
  spurious: number;
}

interface EntityRecord {
  entity_type: string;
  value: string;
}

/**
 * Evaluate NER extraction results against ground truth.
 * PARTIAL counts as 0.5 TP.
 */
export function evaluateEntities(
  groundTruth: EntityRecord[],
  predicted: EntityRecord[],
): NerEvaluationResult {
  const matches: EntityMatchResult[] = [];
  const usedPredicted = new Set<number>();

  let truePositives = 0;
  let partialMatches = 0;
  let misses = 0;

  // For each ground truth entity, find best match in predicted
  for (const gt of groundTruth) {
    let bestMatch: { idx: number; type: MatchType } | null = null;

    for (let i = 0; i < predicted.length; i++) {
      if (usedPredicted.has(i)) continue;
      if (predicted[i].entity_type !== gt.entity_type) continue;

      const gtNorm = normalizeValue(gt.value);
      const predNorm = normalizeValue(predicted[i].value);

      if (gtNorm === predNorm) {
        bestMatch = { idx: i, type: 'EXACT' };
        break; // Exact match is best possible
      }

      if (isPartialMatch(gtNorm, predNorm)) {
        if (!bestMatch || bestMatch.type !== 'EXACT') {
          bestMatch = { idx: i, type: 'PARTIAL' };
        }
      }
    }

    if (bestMatch) {
      usedPredicted.add(bestMatch.idx);
      matches.push({
        entity_type: gt.entity_type,
        expected_value: gt.value,
        predicted_value: predicted[bestMatch.idx].value,
        match_type: bestMatch.type,
      });

      if (bestMatch.type === 'EXACT') {
        truePositives++;
      } else {
        partialMatches++;
      }
    } else {
      matches.push({
        entity_type: gt.entity_type,
        expected_value: gt.value,
        predicted_value: null,
        match_type: 'MISSING',
      });
      misses++;
    }
  }

  // Remaining predicted entities are spurious
  let spurious = 0;
  for (let i = 0; i < predicted.length; i++) {
    if (!usedPredicted.has(i)) {
      matches.push({
        entity_type: predicted[i].entity_type,
        expected_value: null,
        predicted_value: predicted[i].value,
        match_type: 'SPURIOUS',
      });
      spurious++;
    }
  }

  return { matches, truePositives, partialMatches, misses, spurious };
}

function normalizeValue(value: string): string {
  return value.toLowerCase().replace(/[\s\-\/\.]+/g, '').trim();
}

function isPartialMatch(gt: string, pred: string): boolean {
  // One contains the other
  if (gt.includes(pred) || pred.includes(gt)) return true;

  // Levenshtein distance <= 20% of longer string
  const maxLen = Math.max(gt.length, pred.length);
  if (maxLen === 0) return false;

  const dist = levenshtein(gt, pred);
  return dist / maxLen <= 0.2;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Compute NER precision, recall, F1.
 * PARTIAL counts as 0.5 TP for both precision and recall.
 */
export function computeNerMetrics(results: NerEvaluationResult[]): {
  precision: number;
  recall: number;
  f1: number;
} {
  let totalTp = 0;
  let totalPartial = 0;
  let totalPredicted = 0;
  let totalExpected = 0;

  for (const r of results) {
    totalTp += r.truePositives;
    totalPartial += r.partialMatches;
    totalPredicted += r.truePositives + r.partialMatches + r.spurious;
    totalExpected += r.truePositives + r.partialMatches + r.misses;
  }

  const effectiveTp = totalTp + totalPartial * 0.5;
  const precision = totalPredicted > 0 ? effectiveTp / totalPredicted : 0;
  const recall = totalExpected > 0 ? effectiveTp / totalExpected : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { precision, recall, f1 };
}
