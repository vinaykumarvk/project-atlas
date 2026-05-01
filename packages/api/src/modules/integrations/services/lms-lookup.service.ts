import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Result of an LMS account lookup.
 */
export interface LmsAccountResult {
  accountNo: string;
  customerName: string;
  productType: string;
  branchCode: string;
  outstandingAmount: number;
  status: 'ACTIVE' | 'CLOSED' | 'NPA' | 'WRITTEN_OFF';
}

/**
 * LMS provider interface — abstracts the loan management system.
 */
export interface LmsProvider {
  lookupAccount(accountNo: string): Promise<LmsAccountResult | null>;
  pushCaseStatus(
    accountNo: string,
    caseId: string,
    status: string,
  ): Promise<boolean>;
}

/**
 * Mock LMS provider for development and testing.
 * Returns canned data for known account numbers.
 */
export class MockLmsProvider implements LmsProvider {
  private readonly accounts = new Map<string, LmsAccountResult>([
    [
      'LN0012345',
      {
        accountNo: 'LN0012345',
        customerName: 'Rajesh Kumar',
        productType: 'HOME_LOAN',
        branchCode: 'MUM001',
        outstandingAmount: 2500000,
        status: 'ACTIVE',
      },
    ],
    [
      'LN0067890',
      {
        accountNo: 'LN0067890',
        customerName: 'Priya Sharma',
        productType: 'LAP',
        branchCode: 'DEL002',
        outstandingAmount: 1800000,
        status: 'NPA',
      },
    ],
  ]);

  private readonly statusPushLog: Array<{
    accountNo: string;
    caseId: string;
    status: string;
  }> = [];

  async lookupAccount(accountNo: string): Promise<LmsAccountResult | null> {
    return this.accounts.get(accountNo) ?? null;
  }

  async pushCaseStatus(
    accountNo: string,
    caseId: string,
    status: string,
  ): Promise<boolean> {
    const account = this.accounts.get(accountNo);
    if (!account) return false;
    this.statusPushLog.push({ accountNo, caseId, status });
    return true;
  }

  /** Test helper: add an account to the mock store. */
  addAccount(account: LmsAccountResult): void {
    this.accounts.set(account.accountNo, account);
  }

  /** Test helper: get the push log. */
  getStatusPushLog(): Array<{
    accountNo: string;
    caseId: string;
    status: string;
  }> {
    return [...this.statusPushLog];
  }
}

/**
 * LMS Lookup Service (FR-142.A1 / FR-142.A2).
 *
 * Provides account lookup and case status push to the Loan Management System.
 * Uses an injected LmsProvider for actual communication, allowing easy
 * swapping between mock and real implementations.
 */
@Injectable()
export class LmsLookupService {
  private readonly logger = new Logger(LmsLookupService.name);

  /** FR-140.A3: In-memory cache for LMS lookups. */
  private cache = new Map<string, { data: any; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @Inject('LmsProvider') private readonly provider: LmsProvider,
  ) {}

  /**
   * FR-140.A3: Generic cache-or-fetch wrapper with TTL-based expiry.
   */
  private getOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.log(`Cache hit for key=${key}`);
      return Promise.resolve(cached.data as T);
    }
    return fetcher().then((data) => {
      this.cache.set(key, { data, expiresAt: Date.now() + this.CACHE_TTL_MS });
      return data;
    });
  }

  /**
   * Look up an account in the LMS by account number.
   * FR-140.A3: Uses in-memory cache with 5-minute TTL.
   */
  async lookupAccount(accountNo: string): Promise<LmsAccountResult | null> {
    this.logger.log(`Looking up LMS account: ${accountNo}`);
    try {
      const result = await this.getOrFetch<LmsAccountResult | null>(
        `account:${accountNo}`,
        () => this.provider.lookupAccount(accountNo),
      );
      if (result) {
        this.logger.log(
          `LMS account found: ${accountNo} (${result.customerName}, ${result.status})`,
        );
      } else {
        this.logger.warn(`LMS account not found: ${accountNo}`);
      }
      return result;
    } catch (error) {
      this.logger.error(
        `LMS lookup failed for ${accountNo}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * FR-140.A2: Customer profile enrichment — returns account details and case history.
   */
  async getCustomerProfile(accountNo: string): Promise<{ account: any; caseHistory: string[] } | null> {
    this.logger.log(`Customer profile enrichment for account=${accountNo}`);
    const account = await this.lookupAccount(accountNo);
    if (!account) return null;
    return {
      account,
      caseHistory: [], // Would be populated from case DB in production
    };
  }

  /**
   * Push a case status update to the LMS for a given account.
   */
  async pushCaseStatus(
    accountNo: string,
    caseId: string,
    status: string,
  ): Promise<boolean> {
    this.logger.log(
      `Pushing case status to LMS: account=${accountNo}, case=${caseId}, status=${status}`,
    );
    try {
      const success = await this.provider.pushCaseStatus(
        accountNo,
        caseId,
        status,
      );
      if (success) {
        this.logger.log(
          `Case status pushed to LMS: ${caseId} -> ${status}`,
        );
      } else {
        this.logger.warn(
          `Case status push rejected by LMS for account ${accountNo}`,
        );
      }
      return success;
    } catch (error) {
      this.logger.error(
        `LMS push failed for ${accountNo}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
