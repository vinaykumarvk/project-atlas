import {
  SecretsManagerService,
  EnvSecretsProvider,
  VaultSecretsProvider,
  AwsSecretsProvider,
} from '../services/secrets-manager.service';

describe('SecretsManagerService (FR-127.A2)', () => {
  describe('EnvSecretsProvider', () => {
    let provider: EnvSecretsProvider;

    beforeEach(() => {
      provider = new EnvSecretsProvider();
    });

    it('should read from process.env', async () => {
      process.env.TEST_SECRET_KEY = 'test-value-123';
      const value = await provider.getSecret('TEST_SECRET_KEY');
      expect(value).toBe('test-value-123');
      delete process.env.TEST_SECRET_KEY;
    });

    it('should return undefined for missing env vars', async () => {
      const value = await provider.getSecret('NON_EXISTENT_SECRET_KEY');
      expect(value).toBeUndefined();
    });

    it('should set secrets in process.env', async () => {
      await provider.setSecret('TEST_SET_SECRET', 'set-value');
      expect(process.env.TEST_SET_SECRET).toBe('set-value');
      delete process.env.TEST_SET_SECRET;
    });
  });

  describe('VaultSecretsProvider', () => {
    let provider: VaultSecretsProvider;

    beforeEach(() => {
      provider = new VaultSecretsProvider('https://vault.example.com', 'test-token');
    });

    it('should store and retrieve secrets', async () => {
      await provider.setSecret('db_password', 'super-secret');
      const value = await provider.getSecret('db_password');
      expect(value).toBe('super-secret');
    });

    it('should return undefined for non-existent secrets', async () => {
      const value = await provider.getSecret('non_existent');
      expect(value).toBeUndefined();
    });

    it('should expose the endpoint', () => {
      expect(provider.getEndpoint()).toBe('https://vault.example.com');
    });
  });

  describe('AwsSecretsProvider', () => {
    let provider: AwsSecretsProvider;

    beforeEach(() => {
      provider = new AwsSecretsProvider('us-east-1');
    });

    it('should store and retrieve secrets', async () => {
      await provider.setSecret('api_key', 'aws-secret-value');
      const value = await provider.getSecret('api_key');
      expect(value).toBe('aws-secret-value');
    });

    it('should return undefined for non-existent secrets', async () => {
      const value = await provider.getSecret('non_existent');
      expect(value).toBeUndefined();
    });

    it('should expose the region', () => {
      expect(provider.getRegion()).toBe('us-east-1');
    });
  });

  describe('SecretsManagerService', () => {
    it('should delegate getSecret to the provider', async () => {
      const provider = new EnvSecretsProvider();
      process.env.DELEGATED_SECRET = 'delegated-value';

      const service = new SecretsManagerService(provider);
      const value = await service.getSecret('DELEGATED_SECRET');
      expect(value).toBe('delegated-value');

      delete process.env.DELEGATED_SECRET;
    });

    it('should delegate setSecret to the provider', async () => {
      const provider = new VaultSecretsProvider();
      const service = new SecretsManagerService(provider);

      await service.setSecret('new_secret', 'new_value');
      const value = await provider.getSecret('new_secret');
      expect(value).toBe('new_value');
    });

    it('should return undefined for missing secrets', async () => {
      const provider = new EnvSecretsProvider();
      const service = new SecretsManagerService(provider);

      const value = await service.getSecret('MISSING_KEY_ABC_123');
      expect(value).toBeUndefined();
    });
  });

  describe('createProvider factory', () => {
    it('should create EnvSecretsProvider for "env"', () => {
      const provider = SecretsManagerService.createProvider('env');
      expect(provider).toBeInstanceOf(EnvSecretsProvider);
    });

    it('should create VaultSecretsProvider for "vault"', () => {
      const provider = SecretsManagerService.createProvider('vault');
      expect(provider).toBeInstanceOf(VaultSecretsProvider);
    });

    it('should create AwsSecretsProvider for "aws"', () => {
      const provider = SecretsManagerService.createProvider('aws');
      expect(provider).toBeInstanceOf(AwsSecretsProvider);
    });

    it('should throw for unknown provider type', () => {
      expect(() =>
        SecretsManagerService.createProvider('unknown' as 'env'),
      ).toThrow('Unknown secrets provider type');
    });
  });
});
