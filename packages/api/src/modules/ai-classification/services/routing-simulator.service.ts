import { Injectable, Logger, Optional } from '@nestjs/common';

/**
 * Result of simulating routing for a single case.
 */
export interface SimulationResult {
  caseId: string;
  originalRoute: string;
  simulatedRoute: string;
  match: boolean;
}

/**
 * Aggregated report from a simulation run.
 */
export interface SimulationReport {
  totalCases: number;
  matchRate: number;
  mismatches: SimulationResult[];
  abSplit?: { groupA: number; groupB: number };
}

/**
 * A routing rule definition used in simulation.
 */
interface RoutingRule {
  field: string;
  pattern: string;
  route: string;
}

/**
 * FR-152.A1: Interface for a case data source that provides historical cases.
 */
export interface CaseDataSource {
  fetchCasesSince(since: Date): Promise<Array<{ id: string; data: any }>>;
}

/**
 * FR-152.A1+A2: Routing Simulator Service.
 * Provides shadow run simulation and A/B traffic splitting for
 * validating new routing rules before production deployment.
 */
@Injectable()
export class RoutingSimulatorService {
  private readonly logger = new Logger(RoutingSimulatorService.name);

  /** Optional data source for fetching historical cases. */
  private caseDataSource?: CaseDataSource;

  constructor(@Optional() caseDataSource?: CaseDataSource) {
    this.caseDataSource = caseDataSource;
  }

  /**
   * Set the case data source (for testing or runtime injection).
   */
  setCaseDataSource(source: CaseDataSource): void {
    this.caseDataSource = source;
  }

  /**
   * FR-152.A1: Replay the last 30 days of cases against new routing rules.
   *
   * Fetches cases from the last 30 days using the injected data source
   * and runs them through shadowRun with the provided rules.
   *
   * @param newRules - The new routing rules to test
   * @returns SimulationReport with match rates and mismatches
   */
  async replayLast30Days(newRules: RoutingRule[]): Promise<SimulationReport> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let cases: Array<{ id: string; data: any }>;

    if (this.caseDataSource) {
      this.logger.log('Fetching cases from the last 30 days via data source...');
      cases = await this.caseDataSource.fetchCasesSince(thirtyDaysAgo);
    } else {
      this.logger.warn(
        'No CaseDataSource configured; using empty case set for replay.',
      );
      cases = [];
    }

    this.logger.log(
      `Replaying ${cases.length} cases from last 30 days against ${newRules.length} new rules`,
    );

    return this.shadowRun(cases, newRules);
  }

  /**
   * Run a shadow simulation: apply routing rules to a set of cases
   * and compare with their original routes.
   */
  async shadowRun(
    cases: Array<{ id: string; data: any }>,
    rules: { rules: RoutingRule[] } | RoutingRule[],
  ): Promise<SimulationReport> {
    const ruleList = Array.isArray(rules) ? rules : rules.rules ?? [];
    const results: SimulationResult[] = [];

    for (const caseItem of cases) {
      const originalRoute = caseItem.data.route || 'UNASSIGNED';
      const simulatedRoute = this.applyRules(caseItem.data, ruleList);

      results.push({
        caseId: caseItem.id,
        originalRoute,
        simulatedRoute,
        match: this.compareRoutes(originalRoute, simulatedRoute),
      });
    }

    const mismatches = results.filter((r) => !r.match);
    const matchRate =
      results.length > 0
        ? (results.length - mismatches.length) / results.length
        : 0;

    this.logger.log(
      `Shadow run complete: ${results.length} cases, ${(matchRate * 100).toFixed(1)}% match rate, ${mismatches.length} mismatches`,
    );

    return {
      totalCases: results.length,
      matchRate,
      mismatches,
    };
  }

  /**
   * Split a list of cases into two groups for A/B testing.
   */
  splitTraffic(
    cases: Array<{ id: string }>,
    splitPercent: number,
  ): { groupA: string[]; groupB: string[] } {
    const clampedPercent = Math.max(0, Math.min(100, splitPercent));
    const splitIndex = Math.floor(cases.length * (clampedPercent / 100));

    // Shuffle-based deterministic split using case IDs for stability
    const sorted = [...cases].sort((a, b) => a.id.localeCompare(b.id));

    const groupA = sorted.slice(0, splitIndex).map((c) => c.id);
    const groupB = sorted.slice(splitIndex).map((c) => c.id);

    this.logger.debug(
      `Traffic split: ${groupA.length} in group A (${clampedPercent}%), ${groupB.length} in group B`,
    );

    return { groupA, groupB };
  }

  // ── FR-152.A2: A/B Experiment Framework ───────────────────────────────

  private experiments = new Map<string, {
    name: string;
    controlRules: RoutingRule[];
    variantRules: RoutingRule[];
    trafficSplit: number;
    results: { variant: string; outcome: string }[];
    createdAt: Date;
  }>();

  /**
   * FR-152.A2: Create a new A/B experiment comparing two routing rule sets.
   *
   * @param name - Human-readable experiment name
   * @param controlRules - The control (baseline) routing rules
   * @param variantRules - The variant (challenger) routing rules
   * @param trafficSplit - Percentage of traffic routed to the variant (0-100)
   * @returns The experiment ID
   */
  createExperiment(
    name: string,
    controlRules: RoutingRule[],
    variantRules: RoutingRule[],
    trafficSplit: number,
  ): string {
    const id = `exp-${Date.now()}`;
    this.experiments.set(id, {
      name,
      controlRules,
      variantRules,
      trafficSplit: Math.max(0, Math.min(100, trafficSplit)),
      results: [],
      createdAt: new Date(),
    });
    this.logger.log(`Experiment created: ${name} (${id}), split: ${trafficSplit}%`);
    return id;
  }

  /**
   * FR-152.A2: Record an outcome for an experiment.
   *
   * @param experimentId - The experiment ID
   * @param variant - 'control' or 'variant'
   * @param outcome - The observed outcome (e.g., 'CORRECT', 'INCORRECT', 'ESCALATED')
   */
  recordExperimentResult(experimentId: string, variant: string, outcome: string): void {
    const exp = this.experiments.get(experimentId);
    if (!exp) return;
    exp.results.push({ variant, outcome });
  }

  /**
   * FR-152.A2: Get the aggregated report for an experiment.
   *
   * @param experimentId - The experiment ID
   * @returns Aggregated outcomes for control and variant groups, or null if not found
   */
  getExperimentReport(experimentId: string): {
    name: string;
    totalResults: number;
    controlOutcomes: Record<string, number>;
    variantOutcomes: Record<string, number>;
  } | null {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;

    const controlOutcomes: Record<string, number> = {};
    const variantOutcomes: Record<string, number> = {};

    for (const result of exp.results) {
      const bucket = result.variant === 'control' ? controlOutcomes : variantOutcomes;
      bucket[result.outcome] = (bucket[result.outcome] || 0) + 1;
    }

    return {
      name: exp.name,
      totalResults: exp.results.length,
      controlOutcomes,
      variantOutcomes,
    };
  }

  /**
   * FR-152.A2: Get the routing rule set for a given experiment and variant.
   */
  getExperimentRules(experimentId: string, variant: 'control' | 'variant'): RoutingRule[] {
    const exp = this.experiments.get(experimentId);
    if (!exp) return [];
    return variant === 'control' ? exp.controlRules : exp.variantRules;
  }

  /**
   * Compare two route strings for equivalence (case-insensitive).
   */
  compareRoutes(original: string, simulated: string): boolean {
    return original.toUpperCase().trim() === simulated.toUpperCase().trim();
  }

  /**
   * Apply routing rules to case data and return the determined route.
   */
  private applyRules(data: any, rules: RoutingRule[]): string {
    for (const rule of rules) {
      const fieldValue = data[rule.field];
      if (fieldValue === undefined) continue;

      const valueStr = String(fieldValue);
      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(valueStr)) {
          return rule.route;
        }
      } catch {
        // If pattern is not a valid regex, do exact match
        if (valueStr.toLowerCase() === rule.pattern.toLowerCase()) {
          return rule.route;
        }
      }
    }

    return 'UNASSIGNED';
  }
}
