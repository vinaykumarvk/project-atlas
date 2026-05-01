import { Injectable, Logger } from '@nestjs/common';

/**
 * FR-127.A2: Secrets provider interface.
 *
 * Abstracts secret retrieval/storage across environments:
 * - EnvSecretsProvider: reads from process.env
 * - VaultSecretsProvider: stub for HashiCorp Vault
 * - AwsSecretsProvider: stub for AWS Secrets Manager
 */
export interface SecretsProvider {
  getSecret(key: string): Promise<string | undefined>;
  setSecret(key: string, value: string): Promise<void>;
}

/**
 * Reads secrets from process.env. Suitable for development and CI.
 */
export class EnvSecretsProvider implements SecretsProvider {
  async getSecret(key: string): Promise<string | undefined> {
    return process.env[key];
  }

  async setSecret(key: string, value: string): Promise<void> {
    process.env[key] = value;
  }
}

/**
 * Stub provider for HashiCorp Vault integration.
 * In production, this would use the Vault HTTP API.
 */
export class VaultSecretsProvider implements SecretsProvider {
  private readonly secrets = new Map<string, string>();

  constructor(
    private readonly endpoint: string = 'http://localhost:8200',
    private readonly token: string = '',
  ) {}

  async getSecret(key: string): Promise<string | undefined> {
    // Stub: return from local cache
    // Production: GET {endpoint}/v1/secret/data/{key} with X-Vault-Token header
    return this.secrets.get(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    // Stub: store in local cache
    // Production: PUT {endpoint}/v1/secret/data/{key}
    this.secrets.set(key, value);
  }

  getEndpoint(): string {
    return this.endpoint;
  }
}

/**
 * Stub provider for AWS Secrets Manager integration.
 */
export class AwsSecretsProvider implements SecretsProvider {
  private readonly secrets = new Map<string, string>();

  constructor(private readonly region: string = 'ap-south-1') {}

  async getSecret(key: string): Promise<string | undefined> {
    // Stub: return from local cache
    // Production: use AWS SDK SecretsManager.getSecretValue({ SecretId: key })
    return this.secrets.get(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    // Stub: store in local cache
    // Production: use AWS SDK SecretsManager.putSecretValue(...)
    this.secrets.set(key, value);
  }

  getRegion(): string {
    return this.region;
  }
}

/**
 * FR-127.A2: Secrets Manager Service.
 *
 * Provides a unified interface for secret retrieval/storage,
 * delegating to a configurable SecretsProvider.
 */
@Injectable()
export class SecretsManagerService {
  private readonly logger = new Logger(SecretsManagerService.name);

  constructor(private readonly provider: SecretsProvider) {}

  async getSecret(key: string): Promise<string | undefined> {
    const value = await this.provider.getSecret(key);
    if (value === undefined) {
      this.logger.debug(`Secret not found: ${key}`);
    }
    return value;
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.provider.setSecret(key, value);
    this.logger.log(`Secret stored: ${key}`);
  }

  /**
   * Factory method to create a provider by type.
   */
  static createProvider(type: 'env' | 'vault' | 'aws'): SecretsProvider {
    switch (type) {
      case 'env':
        return new EnvSecretsProvider();
      case 'vault':
        return new VaultSecretsProvider();
      case 'aws':
        return new AwsSecretsProvider();
      default:
        throw new Error(`Unknown secrets provider type: ${type}`);
    }
  }
}
