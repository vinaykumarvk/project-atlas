/**
 * FR-129.A5: Hold-out benchmarking pipeline tests.
 *
 * These tests verify the runHoldout function exports and configuration
 * without requiring a live database or ML pipeline.
 */

// Mock the db module before importing
jest.mock('../db', () => ({
  getDb: jest.fn().mockReturnValue({
    testEmail: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    benchmarkRun: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    benchmarkResult: {
      create: jest.fn().mockResolvedValue({}),
    },
  }),
}));

jest.mock('../pipeline-factory', () => ({
  createPipeline: jest.fn().mockResolvedValue({
    pipeline: {
      classify: jest.fn().mockResolvedValue({
        top_label: 'VALUATION',
        top_confidence: 0.95,
        alternatives: [],
        entities: [],
        validation_outcomes: [],
        confidence_band: 'GREEN',
        requires_human_review: false,
        llm_mode: 'OFF',
        inference_ms: 10,
      }),
    },
  }),
}));

import { runHoldout, BenchmarkOptions } from '../runner/index';

describe('runHoldout (FR-129.A5)', () => {
  it('should be exported as a function', () => {
    expect(typeof runHoldout).toBe('function');
  });

  it('should accept holdoutPercent option', async () => {
    const options: BenchmarkOptions & { holdoutPercent?: number } = {
      name: 'test-holdout',
      llmMode: 'OFF' as any,
      holdoutPercent: 30,
    };

    const result = await runHoldout(options);
    expect(result).toHaveProperty('train');
    expect(result).toHaveProperty('holdout');
  });

  it('should default holdoutPercent to 20 when not specified', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const options: BenchmarkOptions = {
      name: 'test-default',
      llmMode: 'OFF' as any,
    };

    await runHoldout(options);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('20%'),
    );
    consoleSpy.mockRestore();
  });

  it('should return train and holdout BenchmarkRunResult objects', async () => {
    const options: BenchmarkOptions = {
      name: 'test-result-shape',
      llmMode: 'OFF' as any,
    };

    const result = await runHoldout(options);
    expect(result.train).toHaveProperty('runId');
    expect(result.train).toHaveProperty('emailCount');
    expect(result.holdout).toHaveProperty('runId');
    expect(result.holdout).toHaveProperty('emailCount');
  });
});
