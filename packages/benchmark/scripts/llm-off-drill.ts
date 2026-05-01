#!/usr/bin/env ts-node
/**
 * LLM-Off Drill Script
 *
 * Runs the classification pipeline with LLM_ENABLED=OFF to verify that the
 * ONNX-only path meets the minimum accuracy threshold (>= 70%).
 *
 * Generates a comparison report across three modes: ON, DEGRADED, and OFF.
 *
 * Usage:
 *   npx ts-node scripts/llm-off-drill.ts
 *
 * Requires:
 *   - ONNX model available at packages/api/ml/model/onnx/
 *   - No external API keys needed (ONNX-only mode)
 */

import {
  DistilledClassifier,
  MockLlmClassifier,
  RuleBasedExtractor,
  MasterValidator,
  ConfidenceBandService,
  SentimentService,
  SummarisationService,
  ClassificationPipelineService,
  DriftMonitorService,
  LlmModeConfig,
  ModelRegistryService,
} from '@atlas/api/ai-classification';
import type { LlmMode, EmailInput, ClassificationResult } from '@atlas/api/ai-classification';

// ---------------------------------------------------------------------------
// Test corpus: representative emails with known ground-truth labels
// ---------------------------------------------------------------------------
interface TestCase {
  email: EmailInput;
  expected_label: string;
}

const TEST_CORPUS: TestCase[] = [
  {
    email: {
      subject: 'Valuation Report Required for LN-2024-00012345',
      body: 'Please arrange property valuation for the flat at Mumbai, PIN 400058. The valuation report is needed urgently for loan disbursement. Amount: Rs. 1,25,00,000.',
    },
    expected_label: 'VALUATION_REQUEST',
  },
  {
    email: {
      subject: 'Legal Opinion on Title Documents',
      body: 'We require a legal opinion from the advocate regarding the title deed and ownership documents for the property. Please review the court records and litigation history.',
    },
    expected_label: 'LEGAL_OPINION',
  },
  {
    email: {
      subject: 'Title Search Request',
      body: 'Please conduct a title search for the property. Verify ownership chain and check for any encumbrance or title defects in the title deed records.',
    },
    expected_label: 'TITLE_SEARCH',
  },
  {
    email: {
      subject: 'Insurance Policy Renewal Due',
      body: 'The insurance premium for the property is due for renewal next month. Please process the insurance renewal and update the coverage details.',
    },
    expected_label: 'INSURANCE_RENEWAL',
  },
  {
    email: {
      subject: 'Release of Collateral - NOC Required',
      body: 'The loan has been fully repaid. Please initiate the release of collateral and issue the no objection certificate (NOC) at the earliest.',
    },
    expected_label: 'RELEASE_OF_COLLATERAL',
  },
  {
    email: {
      subject: 'Schedule Site Visit for Property Inspection',
      body: 'Please arrange a site visit for physical verification and inspection of the property. The field visit should be completed within 3 working days.',
    },
    expected_label: 'SITE_VISIT',
  },
  {
    email: {
      subject: 'Pending Documents Required',
      body: 'Please collect the following pending documents from the borrower: sale deed, society NOC, and property tax receipts. Document submission is required before processing.',
    },
    expected_label: 'DOCUMENT_COLLECTION',
  },
  {
    email: {
      subject: 'Status Update Request',
      body: 'Could you please provide an update on the status of my application? I need some information regarding the current progress and any help with the query.',
    },
    expected_label: 'GENERAL_INQUIRY',
  },
  {
    email: {
      subject: 'Fresh Valuation Needed for Top-Up Loan',
      body: 'The borrower Mr. Sharma has applied for a top-up loan. The previous valuation report has expired. Please arrange a fresh property valuation and appraisal.',
    },
    expected_label: 'VALUATION_REQUEST',
  },
  {
    email: {
      subject: 'Legal Review of Mortgage Documents',
      body: 'Our legal team needs to provide a legal opinion on the mortgage deed. The advocate should review all court documents and check for any pending litigation or dispute.',
    },
    expected_label: 'LEGAL_OPINION',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createPipelineForMode(mode: LlmMode): Promise<ClassificationPipelineService> {
  const distilledClassifier = new DistilledClassifier();
  await distilledClassifier.initOnnx();

  const llmClassifier = new MockLlmClassifier();
  const nerExtractor = new RuleBasedExtractor();
  const masterValidator = new MasterValidator();
  const confidenceBandService = new ConfidenceBandService();
  const sentimentService = new SentimentService();
  const summarisationService = new SummarisationService();
  const llmModeConfig = new LlmModeConfig();
  const modelRegistry = new ModelRegistryService();
  const driftMonitor = new DriftMonitorService();

  const pipeline = new ClassificationPipelineService(
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

  pipeline.setLlmMode(mode);
  return pipeline;
}

interface ModeResult {
  mode: LlmMode;
  accuracy: number;
  avgConfidence: number;
  avgLatencyMs: number;
  results: ClassificationResult[];
  correctCount: number;
  totalCount: number;
}

async function runMode(mode: LlmMode): Promise<ModeResult> {
  const pipeline = await createPipelineForMode(mode);
  const results: ClassificationResult[] = [];

  let correctCount = 0;
  let totalConfidence = 0;
  let totalLatency = 0;

  for (const testCase of TEST_CORPUS) {
    const result = await pipeline.classify(testCase.email);
    results.push(result);

    if (result.top_label === testCase.expected_label) {
      correctCount++;
    }
    totalConfidence += result.top_confidence;
    totalLatency += result.inference_ms;
  }

  const totalCount = TEST_CORPUS.length;
  return {
    mode,
    accuracy: correctCount / totalCount,
    avgConfidence: totalConfidence / totalCount,
    avgLatencyMs: totalLatency / totalCount,
    results,
    correctCount,
    totalCount,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const MINIMUM_ONNX_ACCURACY = 0.80;

// ---------------------------------------------------------------------------
// FR-155.A7: Automated drill scheduling configuration
// ---------------------------------------------------------------------------
/** How often the drill should be run. Matches FR-155 quarterly requirement. */
const DRILL_SCHEDULE = 'quarterly';

/** Minimum number of test cases required in the corpus for a valid drill run. */
const DRILL_MIN_CORPUS_SIZE = 10;

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // FR-155.A7 — Recommended cron schedule (quarterly):
  //
  //   0 2 1 */3 *   npx ts-node packages/benchmark/scripts/llm-off-drill.ts --schedule
  //
  // This runs at 02:00 on the 1st day of every 3rd month (Jan, Apr, Jul, Oct).
  // The --schedule flag signals the run was triggered by automation rather than
  // a manual invocation.  Both paths execute the same drill logic; the flag is
  // available for logging / alerting integrations to distinguish the two.
  // -------------------------------------------------------------------------
  const isScheduled = process.argv.includes('--schedule');

  console.log('='.repeat(72));
  console.log('  PROJECT ATLAS - LLM-OFF DRILL');
  console.log('  Verifying ONNX-only classification meets minimum accuracy');
  if (isScheduled) {
    console.log(`  Mode: SCHEDULED (${DRILL_SCHEDULE})`);
  }
  console.log('='.repeat(72));
  console.log('');

  // FR-155.A7: Validate minimum corpus size before running
  if (TEST_CORPUS.length < DRILL_MIN_CORPUS_SIZE) {
    console.error(
      `ERROR: Test corpus has ${TEST_CORPUS.length} cases but minimum is ${DRILL_MIN_CORPUS_SIZE}. ` +
      `Add more ground-truth test cases before running the drill.`,
    );
    process.exit(2);
  }

  // Run all three modes
  console.log('Running classification across all modes...\n');

  const onResult = await runMode('ON');
  const degradedResult = await runMode('DEGRADED');
  const offResult = await runMode('OFF');

  // Print comparison table
  console.log('-'.repeat(72));
  console.log(
    `${'Mode'.padEnd(12)} | ${'Accuracy'.padEnd(10)} | ${'Avg Conf'.padEnd(10)} | ${'Avg Latency'.padEnd(12)} | ${'Correct'.padEnd(10)}`,
  );
  console.log('-'.repeat(72));

  for (const r of [onResult, degradedResult, offResult]) {
    const accuracyStr = `${(r.accuracy * 100).toFixed(1)}%`;
    const confidenceStr = r.mode === 'OFF' ? 'N/A' : r.avgConfidence.toFixed(3);
    const latencyStr = `${r.avgLatencyMs.toFixed(0)}ms`;
    const correctStr = `${r.correctCount}/${r.totalCount}`;

    console.log(
      `${r.mode.padEnd(12)} | ${accuracyStr.padEnd(10)} | ${confidenceStr.padEnd(10)} | ${latencyStr.padEnd(12)} | ${correctStr.padEnd(10)}`,
    );
  }
  console.log('-'.repeat(72));
  console.log('');

  // Per-case breakdown for DEGRADED mode
  console.log('DEGRADED MODE - Per-case breakdown:');
  console.log('-'.repeat(72));
  for (let i = 0; i < TEST_CORPUS.length; i++) {
    const testCase = TEST_CORPUS[i];
    const result = degradedResult.results[i];
    const correct = result.top_label === testCase.expected_label;
    const icon = correct ? 'PASS' : 'FAIL';
    const path = result.classification_path || 'onnx_only';

    console.log(
      `  [${icon}] Expected: ${testCase.expected_label.padEnd(25)} Got: ${result.top_label.padEnd(25)} ` +
      `Conf: ${result.top_confidence.toFixed(3)} Band: ${result.confidence_band.padEnd(10)} Path: ${path}`,
    );
  }
  console.log('');

  // Verdict
  console.log('='.repeat(72));
  const onnxAccuracy = degradedResult.accuracy;
  const passed = onnxAccuracy >= MINIMUM_ONNX_ACCURACY;

  if (passed) {
    console.log(
      `  RESULT: PASS - ONNX-only accuracy ${(onnxAccuracy * 100).toFixed(1)}% >= ${(MINIMUM_ONNX_ACCURACY * 100).toFixed(0)}% threshold`,
    );
  } else {
    console.log(
      `  RESULT: FAIL - ONNX-only accuracy ${(onnxAccuracy * 100).toFixed(1)}% < ${(MINIMUM_ONNX_ACCURACY * 100).toFixed(0)}% threshold`,
    );
    console.log('  ACTION: Review model quality or retrain before proceeding.');
  }

  if (degradedResult.results[0]?.model_version) {
    console.log(`  Model version: ${degradedResult.results[0].model_version}`);
  }
  console.log('='.repeat(72));

  // Exit with appropriate code
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error('Drill failed:', error);
  process.exit(2);
});
