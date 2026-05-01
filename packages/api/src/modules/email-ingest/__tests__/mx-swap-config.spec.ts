import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MxSwapConfigService, MxRecord } from '../config/mx-swap.config';

describe('MxSwapConfigService (FR-155.A2)', () => {
  function createService(mxRecordsJson: string): Promise<MxSwapConfigService> {
    return Test.createTestingModule({
      providers: [
        MxSwapConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue: string) => {
              if (key === 'MX_RECORDS') return mxRecordsJson;
              return defaultValue;
            }),
          },
        },
      ],
    })
      .compile()
      .then((module: TestingModule) =>
        module.get<MxSwapConfigService>(MxSwapConfigService),
      );
  }

  describe('constructor — loading from MX_RECORDS env var', () => {
    it('should load MX records from JSON env var', async () => {
      const records = [
        { priority: 10, host: 'mx1.bank.com', port: 25, tls: true },
        { priority: 20, host: 'mx2.bank.com', port: 587, tls: false },
      ];
      const service = await createService(JSON.stringify(records));

      const loaded = service.getRecords();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].host).toBe('mx1.bank.com');
      expect(loaded[1].host).toBe('mx2.bank.com');
    });

    it('should sort records by priority on load', async () => {
      const records = [
        { priority: 30, host: 'mx3.bank.com', port: 25, tls: false },
        { priority: 10, host: 'mx1.bank.com', port: 25, tls: true },
        { priority: 20, host: 'mx2.bank.com', port: 25, tls: true },
      ];
      const service = await createService(JSON.stringify(records));

      const loaded = service.getRecords();
      expect(loaded[0].priority).toBe(10);
      expect(loaded[1].priority).toBe(20);
      expect(loaded[2].priority).toBe(30);
    });

    it('should default to empty array when MX_RECORDS is not set', async () => {
      const service = await createService('[]');

      expect(service.getRecords()).toEqual([]);
    });

    it('should handle invalid JSON gracefully', async () => {
      const service = await createService('not-valid-json');

      expect(service.getRecords()).toEqual([]);
    });

    it('should apply default values for missing fields', async () => {
      const records = [{ host: 'mx.bank.com' }];
      const service = await createService(JSON.stringify(records));

      const loaded = service.getRecords();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].priority).toBe(10);
      expect(loaded[0].port).toBe(25);
      expect(loaded[0].tls).toBe(false);
    });
  });

  describe('getPrimary', () => {
    it('should return the lowest priority record', async () => {
      const records = [
        { priority: 20, host: 'mx2.bank.com', port: 25, tls: true },
        { priority: 10, host: 'mx1.bank.com', port: 25, tls: true },
      ];
      const service = await createService(JSON.stringify(records));

      const primary = service.getPrimary();
      expect(primary).not.toBeNull();
      expect(primary!.host).toBe('mx1.bank.com');
      expect(primary!.priority).toBe(10);
    });

    it('should return null when no records exist', async () => {
      const service = await createService('[]');

      expect(service.getPrimary()).toBeNull();
    });
  });

  describe('getFailover', () => {
    it('should return the second lowest priority record', async () => {
      const records = [
        { priority: 10, host: 'mx1.bank.com', port: 25, tls: true },
        { priority: 20, host: 'mx2.bank.com', port: 587, tls: false },
        { priority: 30, host: 'mx3.bank.com', port: 25, tls: true },
      ];
      const service = await createService(JSON.stringify(records));

      const failover = service.getFailover();
      expect(failover).not.toBeNull();
      expect(failover!.host).toBe('mx2.bank.com');
      expect(failover!.priority).toBe(20);
    });

    it('should return null when only one record exists', async () => {
      const records = [{ priority: 10, host: 'mx1.bank.com', port: 25, tls: true }];
      const service = await createService(JSON.stringify(records));

      expect(service.getFailover()).toBeNull();
    });

    it('should return null when no records exist', async () => {
      const service = await createService('[]');

      expect(service.getFailover()).toBeNull();
    });
  });

  describe('addRecord', () => {
    it('should add a record and maintain sort order', async () => {
      const records = [
        { priority: 10, host: 'mx1.bank.com', port: 25, tls: true },
        { priority: 30, host: 'mx3.bank.com', port: 25, tls: true },
      ];
      const service = await createService(JSON.stringify(records));

      service.addRecord({ priority: 20, host: 'mx2.bank.com', port: 587, tls: false });

      const all = service.getRecords();
      expect(all).toHaveLength(3);
      expect(all[0].host).toBe('mx1.bank.com');
      expect(all[1].host).toBe('mx2.bank.com');
      expect(all[2].host).toBe('mx3.bank.com');
    });

    it('should add a record to an empty configuration', async () => {
      const service = await createService('[]');

      service.addRecord({ priority: 10, host: 'new-mx.bank.com', port: 25, tls: true });

      expect(service.getRecords()).toHaveLength(1);
      expect(service.getPrimary()!.host).toBe('new-mx.bank.com');
    });

    it('should add a new primary when priority is lower', async () => {
      const records = [
        { priority: 20, host: 'mx2.bank.com', port: 25, tls: true },
      ];
      const service = await createService(JSON.stringify(records));

      service.addRecord({ priority: 5, host: 'mx0.bank.com', port: 25, tls: true });

      expect(service.getPrimary()!.host).toBe('mx0.bank.com');
      expect(service.getFailover()!.host).toBe('mx2.bank.com');
    });
  });

  describe('removeRecord', () => {
    it('should remove a record by host', async () => {
      const records = [
        { priority: 10, host: 'mx1.bank.com', port: 25, tls: true },
        { priority: 20, host: 'mx2.bank.com', port: 25, tls: true },
      ];
      const service = await createService(JSON.stringify(records));

      service.removeRecord('mx1.bank.com');

      const remaining = service.getRecords();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].host).toBe('mx2.bank.com');
    });

    it('should handle removing a non-existent host gracefully', async () => {
      const records = [
        { priority: 10, host: 'mx1.bank.com', port: 25, tls: true },
      ];
      const service = await createService(JSON.stringify(records));

      service.removeRecord('nonexistent.bank.com');

      expect(service.getRecords()).toHaveLength(1);
    });

    it('should update primary after removing current primary', async () => {
      const records = [
        { priority: 10, host: 'mx1.bank.com', port: 25, tls: true },
        { priority: 20, host: 'mx2.bank.com', port: 25, tls: true },
      ];
      const service = await createService(JSON.stringify(records));

      service.removeRecord('mx1.bank.com');

      expect(service.getPrimary()!.host).toBe('mx2.bank.com');
    });
  });
});
