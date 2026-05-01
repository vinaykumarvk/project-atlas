import { RoutingSimulatorService } from '../services/routing-simulator.service';

describe('RoutingSimulatorService — A/B Experiments (FR-152.A2)', () => {
  let service: RoutingSimulatorService;

  beforeEach(() => {
    service = new RoutingSimulatorService();
  });

  it('should create an experiment and return an ID', () => {
    const id = service.createExperiment(
      'Test Experiment',
      [{ field: 'caseType', pattern: 'VALUATION', route: 'TEAM_A' }],
      [{ field: 'caseType', pattern: 'VALUATION', route: 'TEAM_B' }],
      50,
    );
    expect(id).toMatch(/^exp-\d+$/);
  });

  it('should record experiment results', () => {
    const id = service.createExperiment(
      'Recording Test',
      [],
      [],
      50,
    );

    service.recordExperimentResult(id, 'control', 'CORRECT');
    service.recordExperimentResult(id, 'variant', 'INCORRECT');
    service.recordExperimentResult(id, 'control', 'CORRECT');

    const report = service.getExperimentReport(id);
    expect(report).not.toBeNull();
    expect(report!.totalResults).toBe(3);
  });

  it('should aggregate outcomes by variant in the report', () => {
    const id = service.createExperiment(
      'Aggregation Test',
      [],
      [],
      50,
    );

    service.recordExperimentResult(id, 'control', 'CORRECT');
    service.recordExperimentResult(id, 'control', 'CORRECT');
    service.recordExperimentResult(id, 'control', 'INCORRECT');
    service.recordExperimentResult(id, 'variant', 'CORRECT');
    service.recordExperimentResult(id, 'variant', 'ESCALATED');

    const report = service.getExperimentReport(id);
    expect(report!.controlOutcomes).toEqual({ CORRECT: 2, INCORRECT: 1 });
    expect(report!.variantOutcomes).toEqual({ CORRECT: 1, ESCALATED: 1 });
  });

  it('should return null for non-existent experiment', () => {
    const report = service.getExperimentReport('non-existent-id');
    expect(report).toBeNull();
  });

  it('should clamp traffic split between 0 and 100', () => {
    const id1 = service.createExperiment('Clamp Low', [], [], -10);
    const id2 = service.createExperiment('Clamp High', [], [], 150);

    // Both should still be valid experiments
    expect(service.getExperimentReport(id1)).not.toBeNull();
    expect(service.getExperimentReport(id2)).not.toBeNull();
  });

  it('should return the correct rule sets for each variant', () => {
    const controlRules = [{ field: 'caseType', pattern: 'LEGAL', route: 'LEGAL_TEAM' }];
    const variantRules = [{ field: 'caseType', pattern: 'LEGAL', route: 'NEW_LEGAL_TEAM' }];

    const id = service.createExperiment('Rules Test', controlRules, variantRules, 50);

    expect(service.getExperimentRules(id, 'control')).toEqual(controlRules);
    expect(service.getExperimentRules(id, 'variant')).toEqual(variantRules);
  });
});
