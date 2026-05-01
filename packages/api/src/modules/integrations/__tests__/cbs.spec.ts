import { Test, TestingModule } from '@nestjs/testing';
import { CbsService, MockCbsProvider } from '../services/cbs.service';

describe('CbsService', () => {
  let service: CbsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CbsService,
        { provide: 'CbsProvider', useClass: MockCbsProvider },
      ],
    }).compile();

    service = module.get(CbsService);
  });

  it('should lookup existing account', async () => {
    const result = await service.lookupAccount('ACC001234');
    expect(result).not.toBeNull();
    expect(result!.customerName).toBe('Rajesh Kumar');
    expect(result!.accountType).toBe('SAVINGS');
    expect(result!.status).toBe('ACTIVE');
  });

  it('should return null for non-existent account', async () => {
    const result = await service.lookupAccount('ACC_NONEXIST');
    expect(result).toBeNull();
  });

  it('should get transaction history', async () => {
    const txns = await service.getTransactionHistory('ACC001234');
    expect(txns.length).toBe(2);
    expect(txns[0].txnId).toBe('TXN001');
    expect(txns[0].type).toBe('CREDIT');
  });

  it('should return empty array for account without transactions', async () => {
    const txns = await service.getTransactionHistory('ACC009999');
    expect(txns).toEqual([]);
  });

  it('should verify KYC for active account', async () => {
    const kyc = await service.verifyKyc('ACC001234');
    expect(kyc).not.toBeNull();
    expect(kyc!.kycStatus).toBe('VERIFIED');
    expect(kyc!.documents).toContain('AADHAAR');
  });

  it('should return expired KYC for closed account', async () => {
    const kyc = await service.verifyKyc('ACC009999');
    expect(kyc).not.toBeNull();
    expect(kyc!.kycStatus).toBe('EXPIRED');
  });
});
