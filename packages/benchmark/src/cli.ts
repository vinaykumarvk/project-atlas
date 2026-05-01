import { Command } from 'commander';
import { config, validateConfig } from './config';
import { getDb, disconnectDb } from './db';
import { runGeneration } from './generator';
import { runBenchmark } from './runner';
import { printConsoleReport } from './reporter/console-reporter';
import { generateJsonReport } from './reporter/json-reporter';
import type { LlmMode } from '@atlas/api/ai-classification';

const program = new Command();

program
  .name('atlas-benchmark')
  .description('Test data generation & benchmarking for Project Atlas email classification')
  .version('0.1.0');

// Generate command
program
  .command('generate')
  .description('Generate synthetic test emails using OpenAI GPT-4o')
  .requiredOption('--batch-id <id>', 'Unique batch identifier for this generation run')
  .option('--count <n>', 'Target total email count (scales distribution)', '1000')
  .option('--category <cat>', 'Generate only for a specific category')
  .option('--dry-run', 'Preview generation plan without calling OpenAI')
  .action(async (opts) => {
    try {
      const isDryRun = opts.dryRun || false;
      validateConfig(!isDryRun, !isDryRun); // Skip OpenAI + DB validation for dry-run
      await runGeneration({
        batchId: opts.batchId,
        count: parseInt(opts.count, 10),
        category: opts.category,
        dryRun: isDryRun,
      });
    } catch (error) {
      console.error('Generation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await disconnectDb();
    }
  });

// Benchmark command
program
  .command('benchmark')
  .description('Run classification benchmark against test emails')
  .requiredOption('--name <name>', 'Name for this benchmark run')
  .option('--llm-mode <mode>', 'LLM mode: ON, OFF, or DEGRADED', 'OFF')
  .option('--batch-id <id>', 'Filter test emails by generation batch')
  .option('--category <cat>', 'Filter by category')
  .option('--difficulty <level>', 'Filter by difficulty')
  .option('--format <fmt>', 'Report format: console, json, or both', 'both')
  .action(async (opts) => {
    try {
      validateConfig(false);

      const llmMode = opts.llmMode.toUpperCase() as LlmMode;
      if (!['ON', 'OFF', 'DEGRADED'].includes(llmMode)) {
        throw new Error(`Invalid LLM mode: ${opts.llmMode}. Use ON, OFF, or DEGRADED.`);
      }

      const result = await runBenchmark({
        name: opts.name,
        llmMode,
        batchId: opts.batchId,
        category: opts.category,
        difficulty: opts.difficulty,
      });

      if (result.emailCount === 0) return;

      // Report
      const format = opts.format.toLowerCase();
      if (format === 'console' || format === 'both') {
        printConsoleReport(
          opts.name,
          result.runId,
          result.emailCount,
          llmMode,
          result.metrics,
          result.nerMetrics,
          result.durationMs,
        );
      }
      if (format === 'json' || format === 'both') {
        await generateJsonReport(
          result.runId,
          opts.name,
          llmMode,
          result.emailCount,
          result.metrics,
          result.nerMetrics,
          result.durationMs,
        );
      }
    } catch (error) {
      console.error('Benchmark failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await disconnectDb();
    }
  });

// Report command (re-generate report from existing run)
program
  .command('report')
  .description('Generate report from an existing benchmark run')
  .requiredOption('--run-id <id>', 'Benchmark run ID')
  .option('--format <fmt>', 'Report format: console, json, or both', 'both')
  .action(async (opts) => {
    try {
      validateConfig(false);
      const db = getDb();

      const run = await db.benchmarkRun.findUnique({ where: { id: opts.runId } });
      if (!run) {
        throw new Error(`Benchmark run not found: ${opts.runId}`);
      }

      // Load results for recomputation
      const results = await db.benchmarkResult.findMany({
        where: { benchmarkRunId: run.id },
        include: { testEmail: true },
      });

      // Reconstruct metrics from stored run data
      const metrics = {
        overallAccuracy: run.overallAccuracy || 0,
        macroPrecision: run.macroPrecision || 0,
        macroRecall: run.macroRecall || 0,
        macroF1: run.macroF1 || 0,
        weightedF1: run.weightedF1 || 0,
        confusionMatrix: (run.confusionMatrix as any) || { labels: [], matrix: [] },
        perClassMetrics: (run.perClassMetrics as any) || [],
        bandDistribution: {
          green: { count: run.greenCount || 0, accuracy: run.greenAccuracy || 0 },
          amber: { count: run.amberCount || 0, accuracy: run.amberAccuracy || 0 },
          red: { count: run.redCount || 0, accuracy: run.redAccuracy || 0 },
          redManual: { count: run.redManualCount || 0, accuracy: 0 },
        },
        latency: {
          avg: run.avgInferenceMs || 0,
          p95: run.p95InferenceMs || 0,
          p99: run.p99InferenceMs || 0,
        },
      };

      const nerMetrics = {
        precision: run.nerPrecision || 0,
        recall: run.nerRecall || 0,
        f1: run.nerF1 || 0,
      };

      const durationMs = run.completedAt && run.startedAt
        ? run.completedAt.getTime() - run.startedAt.getTime()
        : 0;

      const format = opts.format.toLowerCase();
      if (format === 'console' || format === 'both') {
        printConsoleReport(
          run.runName,
          run.id,
          run.emailCount,
          run.llmMode,
          metrics,
          nerMetrics,
          durationMs,
        );
      }
      if (format === 'json' || format === 'both') {
        await generateJsonReport(
          run.id,
          run.runName,
          run.llmMode,
          run.emailCount,
          metrics,
          nerMetrics,
          durationMs,
        );
      }
    } catch (error) {
      console.error('Report generation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await disconnectDb();
    }
  });

program.parse();
