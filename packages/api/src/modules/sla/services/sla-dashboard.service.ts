import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { CaseRecord, CaseStatus } from '../../cases/types';
import { SlaClockService, BreachStatus } from './sla-clock.service';

export interface TeamSummary {
  fprId: string;
  fprName: string;
  onTrack: number;
  atRisk: number;
  breached: number;
  total: number;
}

export interface BreachedCaseInfo {
  caseId: string;
  caseNumber: string;
  caseType: string;
  assignedFprId?: string;
  assignedFprName?: string;
  breachDurationHours: number;
  totalHours: number;
  elapsedHours: number;
}

export interface AtRiskCaseInfo {
  caseId: string;
  caseNumber: string;
  caseType: string;
  assignedFprId?: string;
  assignedFprName?: string;
  remainingHours: number;
  percentElapsed: number;
  totalHours: number;
}

export interface ExtendedDashboardData {
  casesByFpr: Array<{ fprId: string; fprName: string; count: number }>;
  casesByVendor: Array<{ vendorId: string; vendorName: string; count: number }>;
  queueByType: Array<{ caseType: string; count: number }>;
}

export interface ComplianceByDimension {
  byType: Record<string, number>;
  byFpr: Record<string, number>;
  byVendor: Record<string, number>;
  byRegion: Record<string, number>;
}

export interface TrendDataPoint {
  date: string;
  newCases: number;
  resolved: number;
  breached: number;
}

/**
 * SLA Dashboard Service
 *
 * Provides aggregated views of SLA status across the team.
 */
@Injectable()
export class SlaDashboardService {
  private readonly logger = new Logger(SlaDashboardService.name);

  // In-memory case store for direct-set mode (testing)
  private directCases: CaseRecord[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly slaClockService: SlaClockService,
  ) {}

  /**
   * Set cases for dashboard (for testing / in-memory mode).
   */
  setCases(cases: CaseRecord[]): void {
    this.directCases = cases;
  }

  /**
   * Add a case to the dashboard store.
   */
  addCase(caseRecord: CaseRecord): void {
    if (!this.directCases) this.directCases = [];
    this.directCases.push(caseRecord);
  }

  /**
   * Get team summary -- counts by status (on_track, at_risk, breached) per FPR.
   */
  async getTeamSummary(now?: Date): Promise<TeamSummary[]> {
    const activeCases = await this.getActiveCases();
    const fprMap = new Map<string, TeamSummary>();

    for (const caseRecord of activeCases) {
      const fprId = caseRecord.assignedFprId || 'UNASSIGNED';
      const fprName = caseRecord.assignedFprName || 'Unassigned';

      if (!fprMap.has(fprId)) {
        fprMap.set(fprId, {
          fprId,
          fprName,
          onTrack: 0,
          atRisk: 0,
          breached: 0,
          total: 0,
        });
      }

      const summary = fprMap.get(fprId)!;
      const slaStatus = this.slaClockService.computeStatus(caseRecord, now);

      summary.total++;
      switch (slaStatus.breachStatus) {
        case BreachStatus.ON_TRACK:
          summary.onTrack++;
          break;
        case BreachStatus.AT_RISK:
          summary.atRisk++;
          break;
        case BreachStatus.BREACHED:
          summary.breached++;
          break;
      }
    }

    return Array.from(fprMap.values());
  }

  /**
   * Get breached cases with breach duration.
   */
  async getBreachedCases(now?: Date): Promise<BreachedCaseInfo[]> {
    const activeCases = await this.getActiveCases();
    const breached: BreachedCaseInfo[] = [];

    for (const caseRecord of activeCases) {
      const slaStatus = this.slaClockService.computeStatus(caseRecord, now);

      if (slaStatus.breachStatus === BreachStatus.BREACHED) {
        const breachDuration = slaStatus.elapsedBusinessHours - slaStatus.totalBusinessHours;
        breached.push({
          caseId: caseRecord.id,
          caseNumber: caseRecord.caseNumber,
          caseType: caseRecord.caseType,
          assignedFprId: caseRecord.assignedFprId,
          assignedFprName: caseRecord.assignedFprName,
          breachDurationHours: Math.max(0, breachDuration),
          totalHours: slaStatus.totalBusinessHours,
          elapsedHours: slaStatus.elapsedBusinessHours,
        });
      }
    }

    return breached.sort((a, b) => b.breachDurationHours - a.breachDurationHours);
  }

  /**
   * Get at-risk cases approaching breach.
   */
  async getAtRiskCases(now?: Date): Promise<AtRiskCaseInfo[]> {
    const activeCases = await this.getActiveCases();
    const atRisk: AtRiskCaseInfo[] = [];

    for (const caseRecord of activeCases) {
      const slaStatus = this.slaClockService.computeStatus(caseRecord, now);

      if (slaStatus.breachStatus === BreachStatus.AT_RISK) {
        atRisk.push({
          caseId: caseRecord.id,
          caseNumber: caseRecord.caseNumber,
          caseType: caseRecord.caseType,
          assignedFprId: caseRecord.assignedFprId,
          assignedFprName: caseRecord.assignedFprName,
          remainingHours: slaStatus.remainingBusinessHours,
          percentElapsed: slaStatus.percentElapsed,
          totalHours: slaStatus.totalBusinessHours,
        });
      }
    }

    return atRisk.sort((a, b) => a.remainingHours - b.remainingHours);
  }

  /**
   * Get extended dashboard data — top 5 FPRs, top 5 vendors, and queue by type.
   */
  async getExtendedDashboard(): Promise<ExtendedDashboardData> {
    const activeCases = await this.getActiveCases();

    // Cases by FPR
    const fprMap = new Map<string, { fprId: string; fprName: string; count: number }>();
    for (const c of activeCases) {
      const fprId = c.assignedFprId || 'UNASSIGNED';
      const fprName = c.assignedFprName || 'Unassigned';
      const existing = fprMap.get(fprId);
      if (existing) {
        existing.count++;
      } else {
        fprMap.set(fprId, { fprId, fprName, count: 1 });
      }
    }
    const casesByFpr = Array.from(fprMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Cases by Vendor
    const vendorMap = new Map<string, { vendorId: string; vendorName: string; count: number }>();
    for (const c of activeCases) {
      const vendorId = c.assignedVendorId || 'NONE';
      if (vendorId === 'NONE') continue;
      const existing = vendorMap.get(vendorId);
      if (existing) {
        existing.count++;
      } else {
        vendorMap.set(vendorId, { vendorId, vendorName: vendorId, count: 1 });
      }
    }
    const casesByVendor = Array.from(vendorMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Queue by case type
    const typeMap = new Map<string, number>();
    for (const c of activeCases) {
      typeMap.set(c.caseType, (typeMap.get(c.caseType) || 0) + 1);
    }
    const queueByType = Array.from(typeMap.entries())
      .map(([caseType, count]) => ({ caseType, count }))
      .sort((a, b) => b.count - a.count);

    return { casesByFpr, casesByVendor, queueByType };
  }

  /**
   * Compute SLA compliance percentages by dimension.
   * Compliance = (closed within TAT / total closed) * 100 per dimension.
   */
  async getComplianceByDimension(now?: Date): Promise<ComplianceByDimension> {
    const allCases = await this.getAllCasesIncludingClosed();
    const closedCases = allCases.filter((c) => c.status === CaseStatus.CLOSED);
    const currentTime = now || new Date();

    const byType: Record<string, { total: number; withinTat: number }> = {};
    const byFpr: Record<string, { total: number; withinTat: number }> = {};
    const byVendor: Record<string, { total: number; withinTat: number }> = {};
    const byRegion: Record<string, { total: number; withinTat: number }> = {};

    for (const c of closedCases) {
      const closedAt = c.closedAt || currentTime;
      const slaStatus = this.slaClockService.computeStatus(
        { ...c, status: CaseStatus.IN_PROGRESS } as CaseRecord,
        closedAt,
      );
      const withinTat = slaStatus.breachStatus !== BreachStatus.BREACHED;

      // By Type
      if (!byType[c.caseType]) byType[c.caseType] = { total: 0, withinTat: 0 };
      byType[c.caseType].total++;
      if (withinTat) byType[c.caseType].withinTat++;

      // By FPR
      const fprKey = c.assignedFprName || c.assignedFprId || 'Unassigned';
      if (!byFpr[fprKey]) byFpr[fprKey] = { total: 0, withinTat: 0 };
      byFpr[fprKey].total++;
      if (withinTat) byFpr[fprKey].withinTat++;

      // By Vendor
      const vendorKey = c.assignedVendorId || 'None';
      if (vendorKey !== 'None') {
        if (!byVendor[vendorKey]) byVendor[vendorKey] = { total: 0, withinTat: 0 };
        byVendor[vendorKey].total++;
        if (withinTat) byVendor[vendorKey].withinTat++;
      }

      // By Region
      const regionKey = c.propertyCity || 'Unknown';
      if (!byRegion[regionKey]) byRegion[regionKey] = { total: 0, withinTat: 0 };
      byRegion[regionKey].total++;
      if (withinTat) byRegion[regionKey].withinTat++;
    }

    const toPercent = (m: Record<string, { total: number; withinTat: number }>) => {
      const result: Record<string, number> = {};
      for (const [key, val] of Object.entries(m)) {
        result[key] = val.total > 0 ? Math.round((val.withinTat / val.total) * 10000) / 100 : 0;
      }
      return result;
    };

    return {
      byType: toPercent(byType),
      byFpr: toPercent(byFpr),
      byVendor: toPercent(byVendor),
      byRegion: toPercent(byRegion),
    };
  }

  /**
   * Get trend data for a configurable window (FR-111 A4).
   * Returns new cases, resolved, and breached per day.
   * @param now - reference date
   * @param windowDays - number of days in the trend window (default 30)
   */
  async getTrendData(now?: Date, windowDays: number = 30): Promise<TrendDataPoint[]> {
    const currentTime = now || new Date();
    const allCases = await this.getAllCasesIncludingClosed();

    // Build date range for last windowDays days
    const trends: TrendDataPoint[] = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const date = new Date(currentTime);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);

      const newCases = allCases.filter(
        (c) => c.createdAt.toISOString().slice(0, 10) === dateStr,
      ).length;

      const resolved = allCases.filter(
        (c) =>
          c.closedAt &&
          c.closedAt.toISOString().slice(0, 10) === dateStr,
      ).length;

      const breached = allCases.filter((c) => {
        if (c.createdAt.toISOString().slice(0, 10) !== dateStr) return false;
        const slaStatus = this.slaClockService.computeStatus(c, currentTime);
        return slaStatus.breachStatus === BreachStatus.BREACHED;
      }).length;

      trends.push({ date: dateStr, newCases, resolved, breached });
    }

    return trends;
  }

  /**
   * FR-111.A1: Get TAT (Turn Around Time) statistics across all closed cases.
   *
   * @returns Mean, median, p90, and count of TAT values (in business hours)
   */
  async getTatStatistics(): Promise<{ mean: number; median: number; p90: number; count: number }> {
    const allCases = await this.getAllCasesIncludingClosed();
    const closedCases = allCases.filter(
      (c) => c.status === CaseStatus.CLOSED && c.closedAt && c.createdAt,
    );

    if (closedCases.length === 0) {
      return { mean: 0, median: 0, p90: 0, count: 0 };
    }

    // Compute TAT in hours for each closed case
    const tatValues: number[] = closedCases.map((c) => {
      const slaStatus = this.slaClockService.computeStatus(
        { ...c, status: CaseStatus.IN_PROGRESS } as CaseRecord,
        c.closedAt!,
      );
      return slaStatus.elapsedBusinessHours;
    });

    // Sort for percentile calculations
    tatValues.sort((a, b) => a - b);

    const count = tatValues.length;
    const mean = tatValues.reduce((a, b) => a + b, 0) / count;
    const median =
      count % 2 === 0
        ? (tatValues[count / 2 - 1] + tatValues[count / 2]) / 2
        : tatValues[Math.floor(count / 2)];
    const p90Index = Math.ceil(count * 0.9) - 1;
    const p90 = tatValues[Math.max(0, p90Index)];

    return {
      mean: parseFloat(mean.toFixed(2)),
      median: parseFloat(median.toFixed(2)),
      p90: parseFloat(p90.toFixed(2)),
      count,
    };
  }

  /**
   * Get all cases including closed ones (for compliance and trend calculations).
   */
  private async getAllCasesIncludingClosed(): Promise<CaseRecord[]> {
    // If direct cases are set (testing mode), use them
    if (this.directCases !== null) {
      return this.directCases;
    }

    // Load from DB
    const cases = await this.prisma.case.findMany({
      include: {
        assigned_fpr: true,
      },
    });

    return cases.map((c) => ({
      id: c.id,
      caseNumber: c.case_number,
      emailIngestId: c.email_ingest_id ?? '',
      subject: c.ai_summary ?? '',
      from: '',
      status: c.status as CaseStatus,
      caseType: c.case_type,
      priority: c.priority,
      confidenceBand: c.confidence_band ?? 'GREEN',
      languageDetected: '',
      assignedFprId: c.assigned_fpr_id ?? undefined,
      assignedFprName: c.assigned_fpr?.full_name ?? undefined,
      assignedVendorId: c.assigned_vendor_id ?? undefined,
      propertyCity: c.property_city ?? undefined,
      tatTargetAt: c.tat_target_at ?? undefined,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      closedAt: c.closed_at ?? undefined,
      activityLog: [],
      linkedCaseIds: [],
    }));
  }

  /**
   * Get active (non-closed, non-cancelled) cases.
   */
  private async getActiveCases(): Promise<CaseRecord[]> {
    // If direct cases are set (testing mode), use them
    if (this.directCases !== null) {
      return this.directCases.filter(
        (c) => c.status !== CaseStatus.CLOSED && c.status !== CaseStatus.CANCELLED,
      );
    }

    // Load from DB
    const cases = await this.prisma.case.findMany({
      where: {
        status: { notIn: [CaseStatus.CLOSED, CaseStatus.CANCELLED] },
      },
      include: {
        assigned_fpr: true,
      },
    });

    return cases.map((c) => ({
      id: c.id,
      caseNumber: c.case_number,
      emailIngestId: c.email_ingest_id ?? '',
      subject: c.ai_summary ?? '',
      from: '',
      status: c.status as CaseStatus,
      caseType: c.case_type,
      priority: c.priority,
      confidenceBand: c.confidence_band ?? 'GREEN',
      languageDetected: '',
      assignedFprId: c.assigned_fpr_id ?? undefined,
      assignedFprName: c.assigned_fpr?.full_name ?? undefined,
      tatTargetAt: c.tat_target_at ?? undefined,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      closedAt: c.closed_at ?? undefined,
      activityLog: [],
      linkedCaseIds: [],
    }));
  }
}
