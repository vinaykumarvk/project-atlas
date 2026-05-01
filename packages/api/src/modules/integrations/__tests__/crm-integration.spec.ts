import { Test, TestingModule } from '@nestjs/testing';
import { CrmIntegrationService } from '../services/crm-integration.service';

describe('CrmIntegrationService (FR-143.A2)', () => {
  let service: CrmIntegrationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CrmIntegrationService],
    }).compile();

    service = module.get<CrmIntegrationService>(CrmIntegrationService);
  });

  describe('syncCase', () => {
    it('should sync a case and return a CRM ID', async () => {
      const result = await service.syncCase('case-001', {
        caseType: 'VALUATION_REQUEST',
        status: 'IN_PROGRESS',
        customerName: 'Rajesh Kumar',
      });

      expect(result.crmId).toBeDefined();
      expect(result.crmId).toContain('CRM-');
      expect(result.synced).toBe(true);
    });

    it('should generate unique CRM IDs for each sync', async () => {
      const result1 = await service.syncCase('case-001', { status: 'NEW' });
      const result2 = await service.syncCase('case-002', { status: 'NEW' });

      expect(result1.crmId).not.toBe(result2.crmId);
    });

    it('should store synced case data retrievable via test helper', async () => {
      const caseData = {
        caseType: 'LEGAL_OPINION',
        priority: 'HIGH',
        assignee: 'fpr-1',
      };

      const result = await service.syncCase('case-010', caseData);

      const stored = service.getSyncedCase('case-010');
      expect(stored).toBeDefined();
      expect(stored!.crmId).toBe(result.crmId);
      expect(stored!.caseData).toEqual(caseData);
      expect(stored!.syncedAt).toBeInstanceOf(Date);
    });

    it('should overwrite previous sync for the same case ID', async () => {
      await service.syncCase('case-001', { status: 'NEW' });
      const result2 = await service.syncCase('case-001', { status: 'CLOSED' });

      const stored = service.getSyncedCase('case-001');
      expect(stored!.crmId).toBe(result2.crmId);
      expect(stored!.caseData).toEqual({ status: 'CLOSED' });
    });
  });

  describe('lookupCustomer', () => {
    it('should return customer details for a known customer ID', async () => {
      const result = await service.lookupCustomer('CUST001');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Rajesh Kumar');
      expect(result!.email).toBe('rajesh.kumar@example.com');
      expect(result!.phone).toBe('+91-9876543210');
      expect(result!.segment).toBe('PREMIUM');
    });

    it('should return null for an unknown customer ID', async () => {
      const result = await service.lookupCustomer('UNKNOWN');
      expect(result).toBeNull();
    });

    it('should return standard segment customer', async () => {
      const result = await service.lookupCustomer('CUST002');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Priya Sharma');
      expect(result!.segment).toBe('STANDARD');
    });

    it('should look up dynamically added customers', async () => {
      service.addCustomer('CUST-NEW', {
        name: 'New Customer',
        email: 'new@example.com',
        phone: '+91-1234567890',
        segment: 'VIP',
      });

      const result = await service.lookupCustomer('CUST-NEW');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('New Customer');
      expect(result!.segment).toBe('VIP');
    });

    it('should return customer without optional fields', async () => {
      service.addCustomer('CUST-MIN', {
        name: 'Minimal Customer',
        email: 'min@example.com',
      });

      const result = await service.lookupCustomer('CUST-MIN');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Minimal Customer');
      expect(result!.phone).toBeUndefined();
      expect(result!.segment).toBeUndefined();
    });
  });
});
