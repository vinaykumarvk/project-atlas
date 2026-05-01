import { BackupConfigService } from '../config/backup.config';

describe('BackupConfigService', () => {
  function createService(envOverrides: Record<string, string> = {}) {
    const mockConfigService = {
      get: jest.fn((key: string) => envOverrides[key] ?? undefined),
    };
    return new BackupConfigService(mockConfigService as any);
  }

  describe('with default configs', () => {
    let service: BackupConfigService;

    beforeEach(() => {
      service = createService();
    });

    it('should load default configs for 3 regions', () => {
      const configs = service.getAllConfigs();
      expect(configs).toHaveLength(3);
    });

    it('should return config for us-east-1', () => {
      const config = service.getConfigForRegion('us-east-1');
      expect(config).toBeDefined();
      expect(config!.s3Bucket).toBe('atlas-backups-us-east-1');
      expect(config!.retentionDays).toBe(30);
    });

    it('should return config for eu-west-1', () => {
      const config = service.getConfigForRegion('eu-west-1');
      expect(config).toBeDefined();
      expect(config!.retentionDays).toBe(90);
    });

    it('should return config for ap-south-1', () => {
      const config = service.getConfigForRegion('ap-south-1');
      expect(config).toBeDefined();
      expect(config!.retentionDays).toBe(60);
    });

    it('should return undefined for unknown region', () => {
      const config = service.getConfigForRegion('us-west-2');
      expect(config).toBeUndefined();
    });

    it('should return destination for known region', () => {
      const dest = service.getDestination('us-east-1');
      expect(dest).toBeDefined();
      expect(dest!.bucket).toBe('atlas-backups-us-east-1');
      expect(dest!.prefix).toBe('daily/');
    });

    it('should return undefined destination for unknown region', () => {
      const dest = service.getDestination('unknown');
      expect(dest).toBeUndefined();
    });
  });

  describe('with custom configs from env', () => {
    it('should load configs from BACKUP_CONFIGS env var', () => {
      const customConfigs = [
        {
          region: 'custom-1',
          s3Bucket: 'custom-bucket',
          s3Prefix: 'backups/',
          retentionDays: 7,
          schedule: '0 0 * * *',
        },
      ];
      const service = createService({
        BACKUP_CONFIGS: JSON.stringify(customConfigs),
      });

      const configs = service.getAllConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0].region).toBe('custom-1');
      expect(configs[0].s3Bucket).toBe('custom-bucket');
    });

    it('should fall back to defaults on invalid JSON', () => {
      const service = createService({
        BACKUP_CONFIGS: 'not-valid-json',
      });

      const configs = service.getAllConfigs();
      expect(configs).toHaveLength(3); // defaults
    });
  });

  describe('config structure', () => {
    it('should have valid cron schedule for each config', () => {
      const service = createService();
      const configs = service.getAllConfigs();
      for (const config of configs) {
        expect(config.schedule).toMatch(/^\d+\s+\d+\s+\*\s+\*\s+\*/);
      }
    });

    it('should have s3Prefix ending with slash', () => {
      const service = createService();
      const configs = service.getAllConfigs();
      for (const config of configs) {
        expect(config.s3Prefix).toMatch(/\/$/);
      }
    });
  });
});
