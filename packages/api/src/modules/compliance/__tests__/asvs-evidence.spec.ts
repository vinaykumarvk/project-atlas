import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AsvsEvidenceService } from '../services/asvs-evidence.service';

describe('AsvsEvidenceService (FR-127.A3)', () => {
  describe('with full config', () => {
    let service: AsvsEvidenceService;

    beforeEach(async () => {
      const configValues: Record<string, string> = {
        JWT_SECRET: 'test-secret',
        MFA_ENABLED: 'true',
        ENCRYPTION_KEY: 'a'.repeat(64),
        NODE_ENV: 'production',
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AsvsEvidenceService,
          { provide: ConfigService, useValue: { get: jest.fn((key: string) => configValues[key]) } },
        ],
      }).compile();

      service = module.get(AsvsEvidenceService);
    });

    it('should generate a report with all required fields', () => {
      const report = service.generateReport();

      expect(report.version).toBe('4.0');
      expect(report.generatedAt).toBeDefined();
      expect(report.totalItems).toBeGreaterThan(0);
      expect(report.items).toBeInstanceOf(Array);
      expect(report.passed + report.failed + report.notApplicable).toBe(
        report.totalItems,
      );
    });

    it('should mark JWT-based authentication as PASS when JWT_SECRET is set', () => {
      const report = service.generateReport();
      const authItem = report.items.find((i) => i.id === 'V1.1.1');

      expect(authItem).toBeDefined();
      expect(authItem!.status).toBe('PASS');
    });

    it('should mark MFA as PASS when MFA_ENABLED is true', () => {
      const report = service.generateReport();
      const mfaItem = report.items.find((i) => i.id === 'V2.8.1');

      expect(mfaItem).toBeDefined();
      expect(mfaItem!.status).toBe('PASS');
    });

    it('should mark TLS as PASS in production', () => {
      const report = service.generateReport();
      const tlsItem = report.items.find((i) => i.id === 'V9.1.1');

      expect(tlsItem).toBeDefined();
      expect(tlsItem!.status).toBe('PASS');
    });

    it('should mark cryptography items as PASS when ENCRYPTION_KEY is set', () => {
      const report = service.generateReport();
      const cryptoItem = report.items.find((i) => i.id === 'V6.2.1');

      expect(cryptoItem).toBeDefined();
      expect(cryptoItem!.status).toBe('PASS');
    });

    it('should include items across multiple categories', () => {
      const report = service.generateReport();
      const categories = new Set(report.items.map((i) => i.category));

      expect(categories.has('Architecture')).toBe(true);
      expect(categories.has('Authentication')).toBe(true);
      expect(categories.has('Session Management')).toBe(true);
      expect(categories.has('Access Control')).toBe(true);
      expect(categories.has('Cryptography')).toBe(true);
      expect(categories.has('API Security')).toBe(true);
    });

    it('should filter items by category', () => {
      const authItems = service.getByCategory('Authentication');
      expect(authItems.length).toBeGreaterThan(0);
      expect(authItems.every((i) => i.category === 'Authentication')).toBe(true);
    });

    it('should filter items by status', () => {
      const passedItems = service.getByStatus('PASS');
      expect(passedItems.length).toBeGreaterThan(0);
      expect(passedItems.every((i) => i.status === 'PASS')).toBe(true);
    });
  });

  describe('with minimal config', () => {
    let service: AsvsEvidenceService;

    beforeEach(async () => {
      const configValues: Record<string, string> = { NODE_ENV: 'development' };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AsvsEvidenceService,
          { provide: ConfigService, useValue: { get: jest.fn((key: string) => configValues[key]) } },
        ],
      }).compile();

      service = module.get(AsvsEvidenceService);
    });

    it('should mark JWT items as FAIL when JWT_SECRET is not set', () => {
      const report = service.generateReport();
      const authItem = report.items.find((i) => i.id === 'V1.1.1');

      expect(authItem!.status).toBe('FAIL');
    });

    it('should mark MFA as FAIL when MFA_ENABLED is not set', () => {
      const report = service.generateReport();
      const mfaItem = report.items.find((i) => i.id === 'V2.8.1');

      expect(mfaItem!.status).toBe('FAIL');
    });

    it('should mark TLS as N/A in non-production', () => {
      const report = service.generateReport();
      const tlsItem = report.items.find((i) => i.id === 'V9.1.1');

      expect(tlsItem!.status).toBe('N/A');
    });

    it('should have failures reflected in the summary counts', () => {
      const report = service.generateReport();
      expect(report.failed).toBeGreaterThan(0);
    });
  });
});
