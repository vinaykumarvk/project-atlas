import { Injectable, Logger } from '@nestjs/common';

/**
 * Customer record from CRM.
 */
export interface CrmCustomer {
  name: string;
  email: string;
  phone?: string;
  segment?: string;
}

/**
 * Result of a CRM case sync operation.
 */
export interface CrmSyncResult {
  crmId: string;
  synced: boolean;
}

/**
 * FR-143.A2: Aggregated customer 360 view.
 */
export interface Customer360View {
  customer: CrmCustomer;
  totalCases: number;
  openCases: number;
  averageTatHours: number;
  lastInteractionDate: Date | null;
  cases: Array<{
    caseId: string;
    crmId: string;
    status: string;
    syncedAt: Date;
  }>;
}

/**
 * CRM Integration Service (FR-143.A2).
 *
 * Provides case synchronization and customer lookup with the CRM system.
 * Uses an in-memory mock implementation for development and testing.
 */
@Injectable()
export class CrmIntegrationService {
  private readonly logger = new Logger(CrmIntegrationService.name);

  /** In-memory store for synced cases. */
  private readonly syncedCases = new Map<
    string,
    { crmId: string; caseData: Record<string, unknown>; syncedAt: Date }
  >();

  /** In-memory customer store. */
  private readonly customers = new Map<string, CrmCustomer>([
    [
      'CUST001',
      {
        name: 'Rajesh Kumar',
        email: 'rajesh.kumar@example.com',
        phone: '+91-9876543210',
        segment: 'PREMIUM',
      },
    ],
    [
      'CUST002',
      {
        name: 'Priya Sharma',
        email: 'priya.sharma@example.com',
        phone: '+91-9876543211',
        segment: 'STANDARD',
      },
    ],
  ]);

  private crmIdCounter = 0;

  /**
   * Sync a case to the CRM system.
   *
   * @param caseId - Internal case ID to sync
   * @param caseData - Case data to push to CRM
   * @returns The CRM ID and sync status
   */
  async syncCase(
    caseId: string,
    caseData: Record<string, unknown>,
  ): Promise<CrmSyncResult> {
    this.logger.log(`Syncing case ${caseId} to CRM`);

    try {
      this.crmIdCounter++;
      const crmId = `CRM-${this.crmIdCounter}-${Date.now()}`;

      this.syncedCases.set(caseId, {
        crmId,
        caseData,
        syncedAt: new Date(),
      });

      this.logger.log(`Case ${caseId} synced to CRM as ${crmId}`);
      return { crmId, synced: true };
    } catch (error) {
      this.logger.error(
        `CRM sync failed for case ${caseId}: ${(error as Error).message}`,
      );
      return { crmId: '', synced: false };
    }
  }

  /**
   * Look up a customer in the CRM by customer ID.
   *
   * @param customerId - The customer identifier
   * @returns Customer details or null if not found
   */
  async lookupCustomer(customerId: string): Promise<CrmCustomer | null> {
    this.logger.log(`Looking up customer in CRM: ${customerId}`);

    const customer = this.customers.get(customerId) ?? null;
    if (customer) {
      this.logger.log(`Customer found in CRM: ${customerId} (${customer.name})`);
    } else {
      this.logger.warn(`Customer not found in CRM: ${customerId}`);
    }

    return customer;
  }

  /**
   * FR-143.A2: Get an aggregated Customer 360 view.
   *
   * Returns the customer's info, list of related cases, total/open case counts,
   * average TAT, and last interaction date.
   *
   * @param customerId - The customer identifier
   * @returns Aggregated Customer360View
   */
  async getCustomer360(customerId: string): Promise<Customer360View> {
    this.logger.log(`Building Customer 360 view for: ${customerId}`);

    const customer = this.customers.get(customerId);
    if (!customer) {
      this.logger.warn(`Customer not found for 360 view: ${customerId}`);
      return {
        customer: { name: 'Unknown', email: 'unknown@example.com' },
        totalCases: 0,
        openCases: 0,
        averageTatHours: 0,
        lastInteractionDate: null,
        cases: [],
      };
    }

    // Gather all synced cases for this customer (cases whose data references this customerId)
    const relatedCases: Array<{
      caseId: string;
      crmId: string;
      status: string;
      syncedAt: Date;
    }> = [];

    for (const [caseId, syncData] of this.syncedCases.entries()) {
      const caseCustomerId =
        syncData.caseData.customerId || syncData.caseData.customer_id;
      if (caseCustomerId === customerId) {
        relatedCases.push({
          caseId,
          crmId: syncData.crmId,
          status: (syncData.caseData.status as string) || 'UNKNOWN',
          syncedAt: syncData.syncedAt,
        });
      }
    }

    const totalCases = relatedCases.length;
    const openCases = relatedCases.filter(
      (c) => c.status !== 'CLOSED' && c.status !== 'CANCELLED',
    ).length;

    // Compute average TAT from synced case data (tat_hours field if present)
    let totalTatHours = 0;
    let tatCount = 0;
    for (const [, syncData] of this.syncedCases.entries()) {
      const caseCustomerId =
        syncData.caseData.customerId || syncData.caseData.customer_id;
      if (caseCustomerId === customerId && syncData.caseData.tat_hours) {
        totalTatHours += syncData.caseData.tat_hours as number;
        tatCount++;
      }
    }
    const averageTatHours = tatCount > 0 ? totalTatHours / tatCount : 0;

    // Find last interaction date from the most recent synced case
    const sortedByDate = [...relatedCases].sort(
      (a, b) => b.syncedAt.getTime() - a.syncedAt.getTime(),
    );
    const lastInteractionDate =
      sortedByDate.length > 0 ? sortedByDate[0].syncedAt : null;

    this.logger.log(
      `Customer 360 for ${customerId}: ${totalCases} total, ${openCases} open, avg TAT ${averageTatHours.toFixed(1)}h`,
    );

    return {
      customer,
      totalCases,
      openCases,
      averageTatHours,
      lastInteractionDate,
      cases: relatedCases,
    };
  }

  /**
   * Test helper: add a customer to the mock store.
   */
  addCustomer(customerId: string, customer: CrmCustomer): void {
    this.customers.set(customerId, customer);
  }

  /**
   * Test helper: get synced case data.
   */
  getSyncedCase(
    caseId: string,
  ): { crmId: string; caseData: Record<string, unknown>; syncedAt: Date } | undefined {
    return this.syncedCases.get(caseId);
  }
}
