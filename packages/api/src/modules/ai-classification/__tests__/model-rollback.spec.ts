import { ModelRegistryService } from '../config/model-registry';

describe('ModelRegistryService — rollback()', () => {
  let service: ModelRegistryService;

  beforeEach(() => {
    // Ensure no env override
    delete process.env.MODEL_REGISTRY_PATH;
    service = new ModelRegistryService();
  });

  it('should use default registry when no file is present', () => {
    expect(service.getCurrentVersion()).toBe('1.2.0');
    expect(service.getAllModels().length).toBeGreaterThanOrEqual(1);
  });

  it('should throw when rolling back to a non-existent version', () => {
    expect(() => service.rollback('99.99.99')).toThrow(
      'not found in registry',
    );
  });

  it('should throw when rolling back to the current version', () => {
    const currentVersion = service.getCurrentVersion();
    expect(() => service.rollback(currentVersion)).toThrow(
      `Already on version ${currentVersion}`,
    );
  });

  it('should rollback to a valid previous version', () => {
    // The default registry has version 1.2.0. We need at least two versions.
    // Since default only has one, let's test with the one available by first
    // confirming error for same version, then testing the rollback mechanism
    // by adding a model entry via direct access for testing purposes.
    // Instead, we test the rollback method on a service with multiple models.
    const multiModelService = createMultiModelService();
    const result = multiModelService.rollback('1.0.0');

    expect(result.previousVersion).toBe('1.2.0');
    expect(result.rolledBackTo).toBe('1.0.0');
    expect(multiModelService.getCurrentVersion()).toBe('1.0.0');
  });

  it('should update getCurrentVersion after rollback', () => {
    const multiModelService = createMultiModelService();
    expect(multiModelService.getCurrentVersion()).toBe('1.2.0');

    multiModelService.rollback('1.0.0');
    expect(multiModelService.getCurrentVersion()).toBe('1.0.0');
  });

  it('should allow rolling back multiple times', () => {
    const multiModelService = createMultiModelService();

    multiModelService.rollback('1.1.0');
    expect(multiModelService.getCurrentVersion()).toBe('1.1.0');

    multiModelService.rollback('1.0.0');
    expect(multiModelService.getCurrentVersion()).toBe('1.0.0');
  });

  it('should return correct previousVersion in the result', () => {
    const multiModelService = createMultiModelService();

    multiModelService.rollback('1.1.0');
    const result = multiModelService.rollback('1.0.0');
    expect(result.previousVersion).toBe('1.1.0');
    expect(result.rolledBackTo).toBe('1.0.0');
  });
});

/**
 * Helper: create a ModelRegistryService instance with multiple model versions.
 * We write a temp registry file for testing.
 */
function createMultiModelService(): ModelRegistryService {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-reg-'));
  const registryPath = path.join(tmpDir, 'registry.json');

  const registry = {
    models: [
      {
        name: 'atlas-distilbert-email-classifier',
        version: '1.0.0',
        training_date: '2026-01-01',
        corpus_size: 20000,
        accuracy: 0.80,
        macro_f1: 0.78,
        weighted_f1: 0.79,
        notes: 'Initial model',
        training_data_hash: 'sha256:aaaa',
        risk_classification: 'MEDIUM',
      },
      {
        name: 'atlas-distilbert-email-classifier',
        version: '1.1.0',
        training_date: '2026-02-15',
        corpus_size: 22000,
        accuracy: 0.83,
        macro_f1: 0.80,
        weighted_f1: 0.82,
        notes: 'Improved model',
        training_data_hash: 'sha256:bbbb',
        risk_classification: 'MEDIUM',
      },
      {
        name: 'atlas-distilbert-email-classifier',
        version: '1.2.0',
        training_date: '2026-04-10',
        corpus_size: 24000,
        accuracy: 0.85,
        macro_f1: 0.82,
        weighted_f1: 0.84,
        notes: 'Latest model',
        training_data_hash: 'sha256:cccc',
        risk_classification: 'MEDIUM',
      },
    ],
    current_version: '1.2.0',
  };

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  process.env.MODEL_REGISTRY_PATH = registryPath;

  const service = new ModelRegistryService();

  // Clean up env after construction (service has already loaded)
  delete process.env.MODEL_REGISTRY_PATH;

  // Schedule cleanup
  try {
    fs.unlinkSync(registryPath);
    fs.rmdirSync(tmpDir);
  } catch {
    // ignore cleanup errors
  }

  return service;
}
