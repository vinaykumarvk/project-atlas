import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * A single model entry in the registry.
 */
export interface ModelEntry {
  name: string;
  version: string;
  training_date: string;
  corpus_size: number;
  accuracy: number;
  macro_f1: number;
  weighted_f1: number;
  notes: string;
  /** FR-130 A1: SHA-256 hash of the training data for reproducibility. */
  training_data_hash: string;
  /** FR-130 A1: Risk classification for model governance. */
  risk_classification: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Shape of the registry.json file.
 */
interface RegistryFile {
  models: ModelEntry[];
  current_version: string;
}

/**
 * NestJS Injectable service that loads the model registry from
 * doc/model-registry/registry.json and exposes the current model version
 * and history.
 *
 * The registry path can be overridden via the MODEL_REGISTRY_PATH environment
 * variable.
 */
@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);
  private readonly models: ModelEntry[];
  private readonly currentVersion: string;

  constructor() {
    const registryPath =
      process.env.MODEL_REGISTRY_PATH ||
      path.resolve(__dirname, '../../../../../../doc/model-registry/registry.json');

    let registry: RegistryFile;

    try {
      if (fs.existsSync(registryPath)) {
        const raw = fs.readFileSync(registryPath, 'utf-8');
        registry = JSON.parse(raw) as RegistryFile;
      } else {
        this.logger.warn(
          `Model registry not found at ${registryPath}. Using built-in defaults.`,
        );
        registry = this.getDefaultRegistry();
      }
    } catch (error) {
      this.logger.warn(
        `Failed to load model registry: ${(error as Error).message}. Using defaults.`,
      );
      registry = this.getDefaultRegistry();
    }

    this.models = registry.models;
    this.currentVersion = registry.current_version;
    this.logger.log(`Model registry loaded. Current version: ${this.currentVersion}`);
  }

  /**
   * Get the current model version string.
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Get the current model entry.
   */
  getCurrentModel(): ModelEntry | undefined {
    return this.models.find((m) => m.version === this.currentVersion);
  }

  /**
   * Get all model entries (version history).
   */
  getAllModels(): readonly ModelEntry[] {
    return this.models;
  }

  /**
   * Get a specific model entry by version.
   */
  getModelByVersion(version: string): ModelEntry | undefined {
    return this.models.find((m) => m.version === version);
  }

  /**
   * FR-129.A3: Verify the corpus signature (training data hash) for a model version.
   * Returns true if the stored hash matches the expected hash.
   */
  verifyCorpusSignature(version: string, expectedHash: string): boolean {
    const model = this.getModelByVersion(version);
    if (!model) {
      this.logger.warn(`Cannot verify corpus signature: model version ${version} not found`);
      return false;
    }
    const matches = model.training_data_hash === expectedHash;
    if (!matches) {
      this.logger.warn(
        `Corpus signature mismatch for version ${version}: expected ${expectedHash}, got ${model.training_data_hash}`,
      );
    }
    return matches;
  }

  /**
   * FR-130.A3: Roll back to a previous model version.
   * Returns the previous version and the version rolled back to.
   */
  rollback(toVersion: string): { previousVersion: string; rolledBackTo: string } {
    const currentVersion = this.currentVersion;
    const targetModel = this.models.find((m) => m.version === toVersion);

    if (!targetModel) {
      throw new Error(`Model version ${toVersion} not found in registry`);
    }

    if (toVersion === currentVersion) {
      throw new Error(`Already on version ${toVersion}`);
    }

    // Update the current version to the target
    (this as any).currentVersion = toVersion;
    this.logger.log(
      `Model rolled back from ${currentVersion} to ${toVersion}`,
    );

    return {
      previousVersion: currentVersion,
      rolledBackTo: toVersion,
    };
  }

  /**
   * Built-in defaults when registry.json is not available.
   */
  private getDefaultRegistry(): RegistryFile {
    return {
      models: [
        {
          name: 'atlas-distilbert-email-classifier',
          version: '1.2.0',
          training_date: '2026-04-10',
          corpus_size: 24000,
          accuracy: 0.85,
          macro_f1: 0.82,
          weighted_f1: 0.84,
          notes: 'Default model entry (registry file not found).',
          training_data_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
          risk_classification: 'MEDIUM',
        },
      ],
      current_version: '1.2.0',
    };
  }
}
