import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LmsSftpService, SftpConfig } from '../services/lms-sftp.service';

describe('LmsSftpService (FR-142.A3)', () => {
  let service: LmsSftpService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue: string) => {
        const config: Record<string, string> = {
          SFTP_HOST: 'sftp.lms.example.com',
          SFTP_PORT: '2222',
          SFTP_USERNAME: 'atlas_user',
          SFTP_PASSWORD: 'secure-pass',
          SFTP_UPLOAD_PATH: '/outgoing/cases',
          SFTP_DOWNLOAD_PATH: '/incoming/updates',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LmsSftpService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LmsSftpService>(LmsSftpService);
  });

  describe('getConfig', () => {
    it('should load SFTP configuration from environment variables', () => {
      const config = service.getConfig();

      expect(config.host).toBe('sftp.lms.example.com');
      expect(config.port).toBe(2222);
      expect(config.username).toBe('atlas_user');
      expect(config.password).toBe('secure-pass');
      expect(config.uploadPath).toBe('/outgoing/cases');
      expect(config.downloadPath).toBe('/incoming/updates');
    });

    it('should return a copy of the config (not a reference)', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('getConfig with defaults', () => {
    it('should use default values when env vars are not set', async () => {
      const defaultConfigService = {
        get: jest.fn().mockImplementation((_key: string, defaultValue: string) => defaultValue),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LmsSftpService,
          { provide: ConfigService, useValue: defaultConfigService },
        ],
      }).compile();

      const defaultService = module.get<LmsSftpService>(LmsSftpService);
      const config = defaultService.getConfig();

      expect(config.host).toBe('localhost');
      expect(config.port).toBe(22);
      expect(config.username).toBe('lms_user');
      expect(config.uploadPath).toBe('/outgoing');
      expect(config.downloadPath).toBe('/incoming');
    });
  });

  describe('uploadBatch', () => {
    it('should upload a batch of records and return count and filename', async () => {
      const records = [
        { accountNo: 'LN001', caseId: 'case-1', status: 'IN_PROGRESS' },
        { accountNo: 'LN002', caseId: 'case-2', status: 'CLOSED' },
        { accountNo: 'LN003', caseId: 'case-3', status: 'REVIEW' },
      ];

      const result = await service.uploadBatch(records);

      expect(result.uploaded).toBe(3);
      expect(result.filename).toContain('batch_upload_');
      expect(result.filename).toContain('.csv');
    });

    it('should handle empty records array', async () => {
      const result = await service.uploadBatch([]);

      expect(result.uploaded).toBe(0);
      expect(result.filename).toBe('');
    });

    it('should store uploaded batches retrievable via test helper', async () => {
      await service.uploadBatch([
        { accountNo: 'LN001', caseId: 'case-1', status: 'CLOSED' },
      ]);
      await service.uploadBatch([
        { accountNo: 'LN002', caseId: 'case-2', status: 'IN_PROGRESS' },
        { accountNo: 'LN003', caseId: 'case-3', status: 'REVIEW' },
      ]);

      const batches = service.getUploadedBatches();
      expect(batches).toHaveLength(2);
      expect(batches[0].records).toHaveLength(1);
      expect(batches[1].records).toHaveLength(2);
    });

    it('should generate unique filenames for each batch', async () => {
      const records = [
        { accountNo: 'LN001', caseId: 'case-1', status: 'CLOSED' },
      ];

      const result1 = await service.uploadBatch(records);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 5));
      const result2 = await service.uploadBatch(records);

      expect(result1.filename).not.toBe(result2.filename);
    });
  });

  describe('downloadBatch', () => {
    it('should return empty array when no records are available', async () => {
      const result = await service.downloadBatch();
      expect(result).toEqual([]);
    });

    it('should return downloadable records added via test helper', async () => {
      service.addDownloadableRecords([
        { accountNo: 'LN001', data: { valuation: 5000000, status: 'COMPLETE' } },
        { accountNo: 'LN002', data: { valuation: 3000000, status: 'PENDING' } },
      ]);

      const result = await service.downloadBatch();

      expect(result).toHaveLength(2);
      expect(result[0].accountNo).toBe('LN001');
      expect(result[0].data).toEqual({ valuation: 5000000, status: 'COMPLETE' });
      expect(result[1].accountNo).toBe('LN002');
    });
  });
});
