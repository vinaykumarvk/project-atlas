import { DrDrillService } from '../services/dr-drill.service';
import type { DrDrillStep } from '../services/dr-drill.service';

describe('DrDrillService', () => {
  let service: DrDrillService;

  beforeEach(() => {
    service = new DrDrillService();
  });

  describe('getRegisteredSteps', () => {
    it('should have default steps registered', () => {
      const steps = service.getRegisteredSteps();
      expect(steps).toContain('db-connectivity');
      expect(steps).toContain('redis-connectivity');
      expect(steps).toContain('s3-connectivity');
      expect(steps).toContain('dns-resolution');
    });

    it('should have 4 default steps', () => {
      expect(service.getRegisteredSteps()).toHaveLength(4);
    });
  });

  describe('registerStep', () => {
    it('should add a custom step', () => {
      const customStep: DrDrillStep = {
        name: 'custom-check',
        description: 'Custom DR check',
        execute: async () => ({
          stepName: 'custom-check',
          success: true,
          duration_ms: 0,
          message: 'Custom check passed',
        }),
      };

      service.registerStep(customStep);
      expect(service.getRegisteredSteps()).toContain('custom-check');
      expect(service.getRegisteredSteps()).toHaveLength(5);
    });
  });

  describe('runDrill', () => {
    it('should run all steps in dry-run mode by default', async () => {
      const report = await service.runDrill();

      expect(report.dryRun).toBe(true);
      expect(report.steps).toHaveLength(4);
      expect(report.overallSuccess).toBe(true);
      expect(report.startedAt).toBeInstanceOf(Date);
      expect(report.completedAt).toBeInstanceOf(Date);
      expect(report.totalDuration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should run all steps in live mode', async () => {
      const report = await service.runDrill(false);

      expect(report.dryRun).toBe(false);
      expect(report.steps).toHaveLength(4);
      expect(report.overallSuccess).toBe(true);
    });

    it('should include dry-run messages when dryRun=true', async () => {
      const report = await service.runDrill(true);

      for (const step of report.steps) {
        expect(step.message).toContain('DRY RUN');
      }
    });

    it('should not include dry-run messages when dryRun=false', async () => {
      const report = await service.runDrill(false);

      for (const step of report.steps) {
        expect(step.message).not.toContain('DRY RUN');
      }
    });

    it('should handle step failure gracefully', async () => {
      const failingStep: DrDrillStep = {
        name: 'failing-step',
        description: 'This step always fails',
        execute: async () => {
          throw new Error('Step exploded');
        },
      };

      service.registerStep(failingStep);
      const report = await service.runDrill();

      expect(report.overallSuccess).toBe(false);
      const failedStep = report.steps.find(
        (s) => s.stepName === 'failing-step',
      );
      expect(failedStep).toBeDefined();
      expect(failedStep!.success).toBe(false);
      expect(failedStep!.message).toContain('Step exploded');
    });

    it('should continue executing remaining steps after a failure', async () => {
      const failingStep: DrDrillStep = {
        name: 'early-fail',
        description: 'Fails early',
        execute: async () => {
          throw new Error('Boom');
        },
      };

      // Register failing step - it gets appended after defaults
      service.registerStep(failingStep);
      const report = await service.runDrill();

      // All 5 steps should have results (4 defaults + 1 failing)
      expect(report.steps).toHaveLength(5);
    });

    it('should include correct step names in results', async () => {
      const report = await service.runDrill();
      const stepNames = report.steps.map((s) => s.stepName);

      expect(stepNames).toContain('db-connectivity');
      expect(stepNames).toContain('redis-connectivity');
      expect(stepNames).toContain('s3-connectivity');
      expect(stepNames).toContain('dns-resolution');
    });

    it('should track duration for each step', async () => {
      const report = await service.runDrill();

      for (const step of report.steps) {
        expect(typeof step.duration_ms).toBe('number');
        expect(step.duration_ms).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
