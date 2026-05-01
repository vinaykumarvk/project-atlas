import { Test, TestingModule } from '@nestjs/testing';
import {
  LmsLookupService,
  LmsProvider,
  LmsAccountResult,
  MockLmsProvider,
} from '../services/lms-lookup.service';

describe('LmsLookupService (FR-142.A1 / FR-142.A2)', () => {
  let service: LmsLookupService;
  let mockProvider: MockLmsProvider;

  beforeEach(async () => {
    mockProvider = new MockLmsProvider();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LmsLookupService,
        { provide: 'LmsProvider', useValue: mockProvider },
      ],
    }).compile();

    service = module.get<LmsLookupService>(LmsLookupService);
  });

  describe('lookupAccount (FR-142.A1)', () => {
    it('should return account details for a known account number', async () => {
      const result = await service.lookupAccount('LN0012345');

      expect(result).not.toBeNull();
      expect(result!.accountNo).toBe('LN0012345');
      expect(result!.customerName).toBe('Rajesh Kumar');
      expect(result!.productType).toBe('HOME_LOAN');
      expect(result!.branchCode).toBe('MUM001');
      expect(result!.outstandingAmount).toBe(2500000);
      expect(result!.status).toBe('ACTIVE');
    });

    it('should return null for an unknown account number', async () => {
      const result = await service.lookupAccount('UNKNOWN123');
      expect(result).toBeNull();
    });

    it('should return NPA account details', async () => {
      const result = await service.lookupAccount('LN0067890');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('NPA');
      expect(result!.customerName).toBe('Priya Sharma');
    });

    it('should look up a dynamically added account', async () => {
      const newAccount: LmsAccountResult = {
        accountNo: 'LN0099999',
        customerName: 'Test Customer',
        productType: 'COMMERCIAL',
        branchCode: 'BLR003',
        outstandingAmount: 5000000,
        status: 'ACTIVE',
      };
      mockProvider.addAccount(newAccount);

      const result = await service.lookupAccount('LN0099999');
      expect(result).not.toBeNull();
      expect(result!.customerName).toBe('Test Customer');
      expect(result!.branchCode).toBe('BLR003');
    });

    it('should propagate errors from the provider', async () => {
      const errorProvider: LmsProvider = {
        lookupAccount: jest.fn().mockRejectedValue(new Error('Connection refused')),
        pushCaseStatus: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LmsLookupService,
          { provide: 'LmsProvider', useValue: errorProvider },
        ],
      }).compile();

      const errorService = module.get<LmsLookupService>(LmsLookupService);
      await expect(errorService.lookupAccount('LN001')).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  describe('pushCaseStatus (FR-142.A2)', () => {
    it('should push case status successfully for a known account', async () => {
      const result = await service.pushCaseStatus(
        'LN0012345',
        'case-001',
        'IN_PROGRESS',
      );

      expect(result).toBe(true);
    });

    it('should return false for an unknown account', async () => {
      const result = await service.pushCaseStatus(
        'UNKNOWN',
        'case-001',
        'IN_PROGRESS',
      );

      expect(result).toBe(false);
    });

    it('should record the status push in the provider log', async () => {
      await service.pushCaseStatus('LN0012345', 'case-001', 'CLOSED');
      await service.pushCaseStatus('LN0067890', 'case-002', 'IN_PROGRESS');

      const log = mockProvider.getStatusPushLog();
      expect(log).toHaveLength(2);
      expect(log[0]).toEqual({
        accountNo: 'LN0012345',
        caseId: 'case-001',
        status: 'CLOSED',
      });
      expect(log[1]).toEqual({
        accountNo: 'LN0067890',
        caseId: 'case-002',
        status: 'IN_PROGRESS',
      });
    });

    it('should propagate errors from the provider', async () => {
      const errorProvider: LmsProvider = {
        lookupAccount: jest.fn(),
        pushCaseStatus: jest.fn().mockRejectedValue(new Error('Timeout')),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LmsLookupService,
          { provide: 'LmsProvider', useValue: errorProvider },
        ],
      }).compile();

      const errorService = module.get<LmsLookupService>(LmsLookupService);
      await expect(
        errorService.pushCaseStatus('LN001', 'case-1', 'CLOSED'),
      ).rejects.toThrow('Timeout');
    });
  });

  describe('MockLmsProvider', () => {
    it('should support adding and looking up custom accounts', async () => {
      const provider = new MockLmsProvider();
      provider.addAccount({
        accountNo: 'CUSTOM001',
        customerName: 'Custom User',
        productType: 'PERSONAL',
        branchCode: 'HYD004',
        outstandingAmount: 100000,
        status: 'CLOSED',
      });

      const result = await provider.lookupAccount('CUSTOM001');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('CLOSED');
    });
  });
});
