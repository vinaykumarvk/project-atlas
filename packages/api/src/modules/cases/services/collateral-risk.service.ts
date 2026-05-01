import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

/**
 * Disbursal blocker categories — reasons a loan disbursal may be held up.
 */
export enum DisbursalBlockerCategory {
  VALUATION_PENDING = 'VALUATION_PENDING',
  LEGAL_PENDING = 'LEGAL_PENDING',
  TITLE_CLEAR_PENDING = 'TITLE_CLEAR_PENDING',
  DOCUMENT_MISSING = 'DOCUMENT_MISSING',
  NONE = 'NONE',
}

/**
 * Risk tier thresholds for the collateral risk score.
 */
export enum RiskTier {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * CollateralRiskService — Phase 6 Collateral Operations Intelligence.
 *
 * Computes risk scores, disbursal blockers, document completeness,
 * and valuation variance for collateral operations.
 */
@Injectable()
export class CollateralRiskService {
  private readonly logger = new Logger(CollateralRiskService.name);

  /**
   * Risk weight factors by case type.
   * Higher weight = higher base risk contribution.
   */
  private readonly CASE_TYPE_WEIGHTS: Record<string, number> = {
    VALUATION_REQUEST: 15,
    SITE_VISIT: 20,
    LEGAL_OPINION: 25,
    TITLE_SEARCH: 30,
    INSURANCE_RENEWAL: 10,
    DISCHARGE: 5,
    SETTLEMENT: 10,
  };

  /**
   * Location risk factor — metro areas are lower risk, rural higher.
   */
  private readonly LOCATION_RISK: Record<string, number> = {
    Mumbai: 5,
    Delhi: 8,
    Bangalore: 6,
    Chennai: 7,
    Pune: 10,
    Hyderabad: 9,
    Kolkata: 12,
    Nashik: 15,
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute a 0-100 risk score for a case based on case type, property location,
   * vendor history, and document completeness.
   *
   * @param caseType - The type of the case (e.g. VALUATION_REQUEST, SITE_VISIT)
   * @param propertyLocation - City/location of the property
   * @param vendorId - Assigned vendor ID (null if none)
   * @param documentCount - Number of documents submitted
   * @param requiredDocCount - Number of documents required
   * @returns A score from 0 (no risk) to 100 (critical risk)
   */
  computeRiskScore(
    caseType: string,
    propertyLocation: string | null,
    vendorId: string | null,
    documentCount: number,
    requiredDocCount: number,
  ): number {
    let score = 0;

    // 1. Case type weight (0-30)
    const typeWeight = this.CASE_TYPE_WEIGHTS[caseType] ?? 15;
    score += typeWeight;

    // 2. Location risk (0-20)
    const locationRisk =
      propertyLocation && this.LOCATION_RISK[propertyLocation] !== undefined
        ? this.LOCATION_RISK[propertyLocation]
        : 18; // Unknown locations get higher risk
    score += locationRisk;

    // 3. Document completeness penalty (0-30)
    if (requiredDocCount > 0) {
      const completeness = documentCount / requiredDocCount;
      const docPenalty = Math.round((1 - completeness) * 30);
      score += docPenalty;
    } else {
      // No required docs → no penalty
      score += 0;
    }

    // 4. Vendor assignment penalty (0-20)
    if (!vendorId) {
      score += 20; // No vendor assigned = higher risk
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Classify a risk score into a named tier.
   */
  classifyRiskTier(score: number): RiskTier {
    if (score <= 25) return RiskTier.LOW;
    if (score <= 50) return RiskTier.MEDIUM;
    if (score <= 75) return RiskTier.HIGH;
    return RiskTier.CRITICAL;
  }

  /**
   * Determine the disbursal blocker category for a case based on its current state.
   *
   * @param caseRecord - An object containing the case fields needed for analysis
   * @returns The category string describing what is blocking disbursal
   */
  computeDisbursalBlocker(caseRecord: {
    status: string;
    caseType: string;
    assignedVendorId?: string | null;
    documentCompletenessPercent?: number | null;
  }): DisbursalBlockerCategory {
    // If the case is closed or resolved, no blocker
    if (caseRecord.status === 'CLOSED' || caseRecord.status === 'CANCELLED') {
      return DisbursalBlockerCategory.NONE;
    }

    // Check document completeness first — most common blocker
    if (
      caseRecord.documentCompletenessPercent !== null &&
      caseRecord.documentCompletenessPercent !== undefined &&
      caseRecord.documentCompletenessPercent < 100
    ) {
      return DisbursalBlockerCategory.DOCUMENT_MISSING;
    }

    // Check by case type
    if (caseRecord.caseType === 'VALUATION_REQUEST' || caseRecord.caseType === 'SITE_VISIT') {
      if (caseRecord.status === 'AWAITING_VENDOR' || caseRecord.status === 'NEW') {
        return DisbursalBlockerCategory.VALUATION_PENDING;
      }
    }

    if (caseRecord.caseType === 'LEGAL_OPINION') {
      if (caseRecord.status !== 'CLOSED' && caseRecord.status !== 'REVIEW') {
        return DisbursalBlockerCategory.LEGAL_PENDING;
      }
    }

    if (caseRecord.caseType === 'TITLE_SEARCH') {
      if (caseRecord.status !== 'CLOSED' && caseRecord.status !== 'REVIEW') {
        return DisbursalBlockerCategory.TITLE_CLEAR_PENDING;
      }
    }

    return DisbursalBlockerCategory.NONE;
  }

  /**
   * Compute document completeness as a percentage.
   *
   * @param caseId - The case ID to look up attachments for
   * @returns A percentage from 0 to 100 representing document completeness
   */
  async computeDocumentCompleteness(caseId: string): Promise<number> {
    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
    });

    if (!caseRecord) {
      this.logger.warn(`Case not found: ${caseId}`);
      return 0;
    }

    // Get the required doc count based on case type
    const requiredDocCount = this.getRequiredDocCount(caseRecord.case_type);
    if (requiredDocCount === 0) return 100;

    // Count submitted attachments
    const submittedCount = await this.prisma.caseAttachment.count({
      where: { case_id: caseId },
    });

    const percent = Math.min(100, Math.round((submittedCount / requiredDocCount) * 100));
    return percent;
  }

  /**
   * Detect whether a valuation amount shows significant variance from expected ranges.
   *
   * @param valuationAmount - The reported valuation amount
   * @param caseType - Case type for context
   * @param propertyLocation - Property location for regional benchmarks
   * @returns true if variance is detected (i.e., the amount is outside expected range)
   */
  detectValuationVariance(
    valuationAmount: number | null,
    caseType: string,
    propertyLocation: string | null,
  ): boolean {
    if (!valuationAmount || valuationAmount <= 0) return false;

    // Regional median benchmarks (in currency units)
    const regionMedians: Record<string, number> = {
      Mumbai: 15_000_000,
      Delhi: 12_000_000,
      Bangalore: 10_000_000,
      Chennai: 8_000_000,
      Pune: 7_000_000,
      Hyderabad: 9_000_000,
      Kolkata: 6_000_000,
      Nashik: 4_000_000,
    };

    const median = propertyLocation ? (regionMedians[propertyLocation] ?? 5_000_000) : 5_000_000;

    // Variance threshold: flag if amount is more than 50% above or below median
    const lowerBound = median * 0.5;
    const upperBound = median * 1.5;

    return valuationAmount < lowerBound || valuationAmount > upperBound;
  }

  /**
   * Get aggregate risk summary across all active cases.
   * Returns counts by risk tier.
   */
  async getRiskSummary(): Promise<{
    totalCases: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
    cases: Array<{
      id: string;
      caseNumber: string;
      caseType: string;
      riskScore: number;
      riskTier: string;
      propertyCity: string | null;
      status: string;
      documentCompleteness: number;
      valuationVariance: boolean;
    }>;
  }> {
    const activeCases = await this.prisma.case.findMany({
      where: {
        status: { notIn: ['CLOSED', 'CANCELLED'] },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    const summary = { totalCases: activeCases.length, low: 0, medium: 0, high: 0, critical: 0 };
    const cases: Array<{
      id: string;
      caseNumber: string;
      caseType: string;
      riskScore: number;
      riskTier: string;
      propertyCity: string | null;
      status: string;
      documentCompleteness: number;
      valuationVariance: boolean;
    }> = [];

    for (const c of activeCases) {
      const riskScore = c.collateral_risk_score ?? 0;
      const tier = this.classifyRiskTier(riskScore);

      summary[tier.toLowerCase() as 'low' | 'medium' | 'high' | 'critical'] += 1;

      cases.push({
        id: c.id,
        caseNumber: c.case_number,
        caseType: c.case_type,
        riskScore,
        riskTier: tier,
        propertyCity: c.property_city,
        status: c.status,
        documentCompleteness: c.document_completeness_percent ?? 0,
        valuationVariance: c.valuation_variance_flag ?? false,
      });
    }

    return { ...summary, cases };
  }

  /**
   * Get cases grouped by disbursal blocker category.
   */
  async getDisbursalReadiness(): Promise<{
    groups: Array<{
      category: string;
      count: number;
      cases: Array<{
        id: string;
        caseNumber: string;
        caseType: string;
        status: string;
        riskScore: number;
        propertyCity: string | null;
        assignedFprId: string | null;
      }>;
    }>;
    totalBlocked: number;
    totalReady: number;
  }> {
    const activeCases = await this.prisma.case.findMany({
      where: {
        status: { notIn: ['CLOSED', 'CANCELLED'] },
      },
      orderBy: [
        { collateral_risk_score: 'desc' },
        { created_at: 'asc' },
      ],
    });

    const groups: Record<string, Array<{
      id: string;
      caseNumber: string;
      caseType: string;
      status: string;
      riskScore: number;
      propertyCity: string | null;
      assignedFprId: string | null;
    }>> = {};

    // Initialize all categories
    for (const cat of Object.values(DisbursalBlockerCategory)) {
      groups[cat] = [];
    }

    for (const c of activeCases) {
      const category = c.disbursal_blocker_category ?? DisbursalBlockerCategory.NONE;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push({
        id: c.id,
        caseNumber: c.case_number,
        caseType: c.case_type,
        status: c.status,
        riskScore: c.collateral_risk_score ?? 0,
        propertyCity: c.property_city,
        assignedFprId: c.assigned_fpr_id,
      });
    }

    const result = Object.entries(groups).map(([category, categoryCases]) => ({
      category,
      count: categoryCases.length,
      cases: categoryCases,
    }));

    const totalBlocked = activeCases.filter(
      (c) => (c.disbursal_blocker_category ?? DisbursalBlockerCategory.NONE) !== DisbursalBlockerCategory.NONE,
    ).length;
    const totalReady = activeCases.length - totalBlocked;

    return { groups: result, totalBlocked, totalReady };
  }

  /**
   * Get the number of required documents for a given case type.
   */
  private getRequiredDocCount(caseType: string): number {
    const requirements: Record<string, number> = {
      VALUATION_REQUEST: 5,
      SITE_VISIT: 8,
      LEGAL_OPINION: 4,
      TITLE_SEARCH: 3,
      INSURANCE_RENEWAL: 2,
      DISCHARGE: 3,
      SETTLEMENT: 4,
    };
    return requirements[caseType] ?? 3;
  }
}
