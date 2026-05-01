import { AggregateMetrics, getTopMisclassifications } from '../runner/metrics';

export function printConsoleReport(
  runName: string,
  runId: string,
  emailCount: number,
  llmMode: string,
  metrics: AggregateMetrics,
  nerMetrics: { precision: number; recall: number; f1: number },
  durationMs: number,
): void {
  const divider = '═'.repeat(70);
  const thinDivider = '─'.repeat(70);

  console.log(`\n${divider}`);
  console.log(`  BENCHMARK REPORT: ${runName}`);
  console.log(divider);
  console.log(`  Run ID:      ${runId}`);
  console.log(`  Date:        ${new Date().toISOString()}`);
  console.log(`  Emails:      ${emailCount}`);
  console.log(`  LLM Mode:    ${llmMode}`);
  console.log(`  Duration:    ${(durationMs / 1000).toFixed(1)}s`);

  // Overall metrics
  console.log(`\n${thinDivider}`);
  console.log('  OVERALL METRICS');
  console.log(thinDivider);
  console.log(`  Accuracy:         ${pct(metrics.overallAccuracy)}`);
  console.log(`  Macro Precision:  ${pct(metrics.macroPrecision)}`);
  console.log(`  Macro Recall:     ${pct(metrics.macroRecall)}`);
  console.log(`  Macro F1:         ${pct(metrics.macroF1)}`);
  console.log(`  Weighted F1:      ${pct(metrics.weightedF1)}`);

  // Per-class metrics
  console.log(`\n${thinDivider}`);
  console.log('  PER-CLASS PERFORMANCE');
  console.log(thinDivider);
  console.log(`  ${'Label'.padEnd(28)} ${'Prec'.padStart(7)} ${'Recall'.padStart(7)} ${'F1'.padStart(7)} ${'Support'.padStart(8)}`);
  console.log(`  ${'─'.repeat(28)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(8)}`);

  for (const m of metrics.perClassMetrics) {
    console.log(
      `  ${m.label.padEnd(28)} ${pct(m.precision).padStart(7)} ${pct(m.recall).padStart(7)} ${pct(m.f1).padStart(7)} ${String(m.support).padStart(8)}`,
    );
  }

  // Confidence bands
  console.log(`\n${thinDivider}`);
  console.log('  CONFIDENCE BAND DISTRIBUTION');
  console.log(thinDivider);
  const bd = metrics.bandDistribution;
  const total = bd.green.count + bd.amber.count + bd.red.count + bd.redManual.count;
  console.log(`  GREEN:      ${String(bd.green.count).padStart(5)} (${pct(bd.green.count / total).padStart(6)})  Accuracy: ${pct(bd.green.accuracy)}`);
  console.log(`  AMBER:      ${String(bd.amber.count).padStart(5)} (${pct(bd.amber.count / total).padStart(6)})  Accuracy: ${pct(bd.amber.accuracy)}`);
  console.log(`  RED:        ${String(bd.red.count).padStart(5)} (${pct(bd.red.count / total).padStart(6)})  Accuracy: ${pct(bd.red.accuracy)}`);
  console.log(`  RED_MANUAL: ${String(bd.redManual.count).padStart(5)} (${pct(bd.redManual.count / total).padStart(6)})  Accuracy: ${pct(bd.redManual.accuracy)}`);

  // NER metrics
  console.log(`\n${thinDivider}`);
  console.log('  NER (ENTITY EXTRACTION) METRICS');
  console.log(thinDivider);
  console.log(`  Precision:  ${pct(nerMetrics.precision)}`);
  console.log(`  Recall:     ${pct(nerMetrics.recall)}`);
  console.log(`  F1:         ${pct(nerMetrics.f1)}`);

  // Latency
  console.log(`\n${thinDivider}`);
  console.log('  LATENCY');
  console.log(thinDivider);
  console.log(`  Average:    ${metrics.latency.avg.toFixed(1)} ms`);
  console.log(`  P95:        ${metrics.latency.p95.toFixed(1)} ms`);
  console.log(`  P99:        ${metrics.latency.p99.toFixed(1)} ms`);

  // Top misclassifications
  const misclassifications = getTopMisclassifications(metrics.confusionMatrix);
  if (misclassifications.length > 0) {
    console.log(`\n${thinDivider}`);
    console.log('  TOP MISCLASSIFICATION PAIRS');
    console.log(thinDivider);
    for (const m of misclassifications) {
      console.log(`  ${m.actual} → ${m.predicted}: ${m.count} times`);
    }
  }

  console.log(`\n${divider}\n`);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
