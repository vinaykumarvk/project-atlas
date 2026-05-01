import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { VendorRecord, VendorSelectionResult } from '../types';

export type SelectionAlgorithm = 'round-robin' | 'lowest-tat' | 'highest-scorecard' | 'MANUAL';

/**
 * Vendor Selection Service (FR-032).
 * Filters vendors by geography + case_type, then applies selection algorithm.
 */
@Injectable()
export class VendorSelectionService {
  private readonly logger = new Logger(VendorSelectionService.name);

  // Cached vendor data with TTL
  private vendorCache: { data: VendorRecord[]; loadedAt: number } | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  // Round-robin index (transient — acceptable to lose on restart)
  private roundRobinIndex = 0;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Set vendors directly (for testing / seeding).
   */
  setVendors(vendors: VendorRecord[]): void {
    this.vendorCache = { data: vendors, loadedAt: Date.now() };
    this.roundRobinIndex = 0;
  }

  /**
   * Select a vendor for a case based on geography, case type, and selection algorithm.
   */
  select(
    geography: string,
    caseType: string,
    algorithm: SelectionAlgorithm = 'lowest-tat',
  ): VendorSelectionResult | null {
    const vendors = this.getVendorsSync();

    // Filter by geography and case type
    const eligible = vendors.filter(
      (v) =>
        v.geographies.includes(geography) &&
        v.caseTypes.includes(caseType),
    );

    if (eligible.length === 0) {
      this.logger.warn(`No vendor found for geography=${geography}, caseType=${caseType}`);
      return null;
    }

    // FR-032 A2: MANUAL algorithm returns null — Officer selects vendor manually
    if (algorithm === 'MANUAL') {
      this.logger.log(`MANUAL vendor selection mode: no auto-selection for geography=${geography}, caseType=${caseType}`);
      return null;
    }

    let selected: VendorRecord;
    let reason: string;

    switch (algorithm) {
      case 'round-robin':
        selected = eligible[this.roundRobinIndex % eligible.length];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % eligible.length;
        reason = `Round-robin selection (index=${this.roundRobinIndex === 0 ? eligible.length - 1 : this.roundRobinIndex - 1})`;
        break;

      case 'lowest-tat':
        selected = eligible.reduce((best, curr) =>
          curr.avgTatDays < best.avgTatDays ? curr : best,
        );
        reason = `Lowest TAT (${selected.avgTatDays} days)`;
        break;

      case 'highest-scorecard':
        selected = eligible.reduce((best, curr) =>
          curr.scorecardRating > best.scorecardRating ? curr : best,
        );
        reason = `Highest scorecard (${selected.scorecardRating}/5)`;
        break;
    }

    return {
      vendorId: selected.id,
      vendorName: selected.name,
      reason,
    };
  }

  /**
   * Load vendors from DB (async, for cache refresh).
   */
  async loadVendors(): Promise<VendorRecord[]> {
    const vendors = await this.prisma.vendorMaster.findMany({
      where: { is_active: true },
    });

    const records: VendorRecord[] = vendors.map((v) => ({
      id: v.id,
      name: v.vendor_name,
      geographies: v.service_geographies,
      caseTypes: v.service_case_types,
      avgTatDays: v.contracted_tat_hours ? v.contracted_tat_hours / 24 : 99,
      scorecardRating: v.scorecard_quality ?? 0,
      activeJobs: 0,
    }));

    this.vendorCache = { data: records, loadedAt: Date.now() };
    return records;
  }

  private getVendorsSync(): VendorRecord[] {
    return this.vendorCache?.data ?? [];
  }
}
