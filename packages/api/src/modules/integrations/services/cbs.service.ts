import { Injectable, Inject, Logger } from '@nestjs/common';

export interface CbsAccountResult {
  accountNumber: string;
  customerName: string;
  accountType: 'SAVINGS' | 'CURRENT' | 'LOAN' | 'FIXED_DEPOSIT';
  balance: number;
  currency: string;
  status: 'ACTIVE' | 'DORMANT' | 'CLOSED' | 'FROZEN';
  branch: string;
  ifsc: string;
}

export interface CbsTransaction {
  txnId: string;
  date: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  currency: string;
  description: string;
  balance: number;
}

export interface KycResult {
  accountNumber: string;
  kycStatus: 'VERIFIED' | 'PENDING' | 'EXPIRED' | 'REJECTED';
  lastVerifiedAt: string | null;
  documents: string[];
}

export interface CbsProvider {
  lookupAccount(accountNumber: string): Promise<CbsAccountResult | null>;
  getTransactionHistory(accountNumber: string, fromDate?: string, toDate?: string): Promise<CbsTransaction[]>;
  verifyKyc(accountNumber: string): Promise<KycResult | null>;
}

export class MockCbsProvider implements CbsProvider {
  private readonly accounts = new Map<string, CbsAccountResult>([
    ['ACC001234', {
      accountNumber: 'ACC001234',
      customerName: 'Rajesh Kumar',
      accountType: 'SAVINGS',
      balance: 125000.50,
      currency: 'INR',
      status: 'ACTIVE',
      branch: 'Mumbai Main',
      ifsc: 'HDFC0001234',
    }],
    ['ACC005678', {
      accountNumber: 'ACC005678',
      customerName: 'Priya Sharma',
      accountType: 'CURRENT',
      balance: 450000.00,
      currency: 'INR',
      status: 'ACTIVE',
      branch: 'Delhi Central',
      ifsc: 'HDFC0005678',
    }],
    ['ACC009999', {
      accountNumber: 'ACC009999',
      customerName: 'Closed Account',
      accountType: 'SAVINGS',
      balance: 0,
      currency: 'INR',
      status: 'CLOSED',
      branch: 'Chennai East',
      ifsc: 'HDFC0009999',
    }],
  ]);

  private readonly transactions = new Map<string, CbsTransaction[]>([
    ['ACC001234', [
      { txnId: 'TXN001', date: '2024-01-15', type: 'CREDIT', amount: 50000, currency: 'INR', description: 'Salary Credit', balance: 125000.50 },
      { txnId: 'TXN002', date: '2024-01-10', type: 'DEBIT', amount: 15000, currency: 'INR', description: 'EMI Payment', balance: 75000.50 },
    ]],
    ['ACC005678', [
      { txnId: 'TXN003', date: '2024-01-14', type: 'CREDIT', amount: 200000, currency: 'INR', description: 'Business Receipt', balance: 450000 },
    ]],
  ]);

  async lookupAccount(accountNumber: string): Promise<CbsAccountResult | null> {
    return this.accounts.get(accountNumber) || null;
  }

  async getTransactionHistory(accountNumber: string, _fromDate?: string, _toDate?: string): Promise<CbsTransaction[]> {
    return this.transactions.get(accountNumber) || [];
  }

  async verifyKyc(accountNumber: string): Promise<KycResult | null> {
    const account = this.accounts.get(accountNumber);
    if (!account) return null;
    return {
      accountNumber,
      kycStatus: account.status === 'ACTIVE' ? 'VERIFIED' : 'EXPIRED',
      lastVerifiedAt: account.status === 'ACTIVE' ? '2024-01-01T00:00:00Z' : null,
      documents: account.status === 'ACTIVE' ? ['AADHAAR', 'PAN'] : [],
    };
  }
}

@Injectable()
export class CbsService {
  private readonly logger = new Logger(CbsService.name);

  constructor(@Inject('CbsProvider') private readonly provider: CbsProvider) {}

  async lookupAccount(accountNumber: string): Promise<CbsAccountResult | null> {
    this.logger.log(`CBS lookup account=${accountNumber}`);
    try {
      const result = await this.provider.lookupAccount(accountNumber);
      if (!result) {
        this.logger.warn(`CBS account not found: ${accountNumber}`);
      }
      return result;
    } catch (error) {
      this.logger.error(`CBS lookup failed for ${accountNumber}: ${error}`);
      return null;
    }
  }

  async getTransactionHistory(accountNumber: string, fromDate?: string, toDate?: string): Promise<CbsTransaction[]> {
    this.logger.log(`CBS transaction history account=${accountNumber}`);
    try {
      return await this.provider.getTransactionHistory(accountNumber, fromDate, toDate);
    } catch (error) {
      this.logger.error(`CBS transaction history failed for ${accountNumber}: ${error}`);
      return [];
    }
  }

  async verifyKyc(accountNumber: string): Promise<KycResult | null> {
    this.logger.log(`CBS KYC verification account=${accountNumber}`);
    try {
      return await this.provider.verifyKyc(accountNumber);
    } catch (error) {
      this.logger.error(`CBS KYC verification failed for ${accountNumber}: ${error}`);
      return null;
    }
  }
}
