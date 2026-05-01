import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../common/prisma';
import {
  BrdPendencyReport,
  BrdReportSection,
  PendencyCaseEntry,
  PendencyReport,
  ReportFilters,
  ReportSection,
  ScheduledReport,
} from '../types';

export interface CaseSnapshot {
  id: string;
  caseNumber?: string;
  status: string;
  team?: string;
  region?: string;
  fprId?: string;
  fprName?: string;
  vendorId?: string;
  vendorName?: string;
  caseType: string;
  createdAt: Date;
  resolvedAt?: Date;
  tatTargetAt?: Date;
  isBreached: boolean;
}

export interface VendorPendency {
  vendorId: string;
  vendorName: string;
  openCases: number;
  breachedCases: number;
  avgAge: number;
}

export interface RegionalBreakdown {
  region: string;
  openCases: number;
  breachedCases: number;
  avgTatHours: number;
}

const CASE_LINK_BASE_URL = 'https://atlas.bank.internal/cases';
const LINK_SECRET_ENV = 'JWT_SECRET';
const DEFAULT_LINK_SECRET = 'atlas-pendency-report-default-secret';

@Injectable()
export class PendencyReportService {
  private readonly logger = new Logger(PendencyReportService.name);

  // Direct-set cases for testing
  private directCases: CaseSnapshot[] | null = null;

  // Track last report time for "New Since Last Report" section
  private lastReportAt: Date | null = null;

  // FR-071.A2: In-memory set for midday refresh opt-in users
  private middayOptIns = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Set the case data (for testing).
   */
  setCases(cases: CaseSnapshot[]): void {
    this.directCases = cases;
  }

  /**
   * Set the last report timestamp (for testing).
   */
  setLastReportAt(date: Date): void {
    this.lastReportAt = date;
  }

  /**
   * Generate a daily pendency report for the given date.
   * Preserves the original report format for backward compatibility.
   */
  async generateDailyReport(date: Date, filters?: ReportFilters): Promise<PendencyReport> {
    const allCases = this.directCases !== null
      ? this.directCases
      : await this.loadCasesFromDb();

    const filteredCases = this.applyFilters(allCases, filters);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const startOfYesterday = new Date(startOfDay);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const endOfYesterday = new Date(startOfYesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    const openCases = filteredCases.filter(
      (c) => c.status !== 'CLOSED' && c.status !== 'CANCELLED',
    );

    const statusBreakdown: Record<string, number> = {};
    for (const c of openCases) {
      statusBreakdown[c.status] = (statusBreakdown[c.status] || 0) + 1;
    }

    const breachedCases = filteredCases.filter((c) => c.isBreached);
    const breachedByTeam: Record<string, number> = {};
    const breachedByFpr: Record<string, number> = {};
    for (const c of breachedCases) {
      const team = c.team || 'UNASSIGNED';
      breachedByTeam[team] = (breachedByTeam[team] || 0) + 1;
      const fpr = c.fprName || c.fprId || 'UNASSIGNED';
      breachedByFpr[fpr] = (breachedByFpr[fpr] || 0) + 1;
    }

    const resolvedCases = filteredCases.filter((c) => c.resolvedAt);
    let avgResolutionTimeHours = 0;
    if (resolvedCases.length > 0) {
      const totalHours = resolvedCases.reduce((sum, c) => {
        const resolutionMs = c.resolvedAt!.getTime() - c.createdAt.getTime();
        return sum + resolutionMs / (1000 * 60 * 60);
      }, 0);
      avgResolutionTimeHours = Math.round((totalHours / resolvedCases.length) * 100) / 100;
    }

    const newCasesToday = filteredCases.filter(
      (c) => c.createdAt >= startOfDay && c.createdAt <= endOfDay,
    ).length;

    const newCasesYesterday = filteredCases.filter(
      (c) => c.createdAt >= startOfYesterday && c.createdAt <= endOfYesterday,
    ).length;

    // Build BRD-compliant sections
    const brdSections = this.buildBrdSections(filteredCases, date);

    const sections: ReportSection[] = [
      { title: 'Open Cases by Status', data: statusBreakdown },
      { title: 'Breached Cases by Team', data: breachedByTeam },
      { title: 'Breached Cases by FPR', data: breachedByFpr },
      { title: 'Resolution Metrics', data: { averageResolutionTimeHours: avgResolutionTimeHours, totalResolved: resolvedCases.length } },
      { title: 'New Cases Comparison', data: { today: newCasesToday, yesterday: newCasesYesterday, change: newCasesToday - newCasesYesterday } },
      // BRD-compliant sections appended
      ...brdSections.map((s) => ({
        title: s.title,
        data: { count: s.cases.length, cases: s.cases } as Record<string, unknown>,
      })),
    ];

    // Update last report time
    this.lastReportAt = new Date();

    return {
      generatedAt: new Date(),
      period: { from: startOfDay, to: endOfDay },
      summary: {
        totalOpenCases: openCases.length,
        statusBreakdown,
        breachedCasesByTeam: breachedByTeam,
        breachedCasesByFpr: breachedByFpr,
        averageResolutionTimeHours: avgResolutionTimeHours,
        newCasesToday,
        newCasesYesterday,
      },
      sections,
    };
  }

  /**
   * Generate a BRD-compliant daily report with 4 mandated sections:
   *   1. Overdue (oldest first)
   *   2. Due Today
   *   3. New Since Last Report
   *   4. Approaching Deadline (next 24h)
   */
  async generateBrdReport(date: Date, filters?: ReportFilters): Promise<BrdPendencyReport> {
    const allCases = this.directCases !== null
      ? this.directCases
      : await this.loadCasesFromDb();

    const filteredCases = this.applyFilters(allCases, filters);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const brdSections = this.buildBrdSections(filteredCases, date);

    const report: BrdPendencyReport = {
      generatedAt: new Date(),
      period: { from: startOfDay, to: endOfDay },
      sections: brdSections,
      summary: {
        totalOverdue: brdSections[0]?.cases.length ?? 0,
        totalDueToday: brdSections[1]?.cases.length ?? 0,
        totalNewSinceLastReport: brdSections[2]?.cases.length ?? 0,
        totalApproachingDeadline: brdSections[3]?.cases.length ?? 0,
      },
    };

    report.html = this.renderHtml(brdSections);
    report.plainText = this.renderPlainText(brdSections);

    // Update last report time
    this.lastReportAt = new Date();

    return report;
  }

  /**
   * Build the 4 BRD-mandated sections from case data.
   */
  buildBrdSections(cases: CaseSnapshot[], date: Date): BrdReportSection[] {
    const now = date;
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Only consider open cases
    const openCases = cases.filter(
      (c) => c.status !== 'CLOSED' && c.status !== 'CANCELLED',
    );

    // 1. Overdue: cases with tatTargetAt < now, sorted oldest first
    const overdueCases = openCases
      .filter((c) => c.tatTargetAt && c.tatTargetAt < now)
      .sort((a, b) => (a.tatTargetAt!.getTime() - b.tatTargetAt!.getTime()))
      .map((c) => this.toCaseEntry(c, now));

    // 2. Due Today: tatTargetAt falls within today
    const dueTodayCases = openCases
      .filter((c) => c.tatTargetAt && c.tatTargetAt >= startOfDay && c.tatTargetAt <= endOfDay)
      .sort((a, b) => (a.tatTargetAt!.getTime() - b.tatTargetAt!.getTime()))
      .map((c) => this.toCaseEntry(c, now));

    // 3. New Since Last Report: created after the last report run (or today if first run)
    const lastReportTime = this.lastReportAt || startOfDay;
    const newSinceLastReport = openCases
      .filter((c) => c.createdAt >= lastReportTime)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((c) => this.toCaseEntry(c, now));

    // 4. Approaching Deadline: tatTargetAt is within next 24h but not yet overdue
    const approachingDeadline = openCases
      .filter((c) => c.tatTargetAt && c.tatTargetAt >= now && c.tatTargetAt <= next24h)
      .sort((a, b) => (a.tatTargetAt!.getTime() - b.tatTargetAt!.getTime()))
      .map((c) => this.toCaseEntry(c, now));

    return [
      { title: 'Overdue', cases: overdueCases },
      { title: 'Due Today', cases: dueTodayCases },
      { title: 'New Since Last Report', cases: newSinceLastReport },
      { title: 'Approaching Deadline (next 24h)', cases: approachingDeadline },
    ];
  }

  /**
   * Convert a CaseSnapshot to a PendencyCaseEntry with computed fields.
   */
  private toCaseEntry(c: CaseSnapshot, now: Date): PendencyCaseEntry {
    const hoursOverdue = c.tatTargetAt && c.tatTargetAt < now
      ? Math.round((now.getTime() - c.tatTargetAt.getTime()) / (1000 * 60 * 60) * 100) / 100
      : undefined;

    const hoursRemaining = c.tatTargetAt && c.tatTargetAt >= now
      ? Math.round((c.tatTargetAt.getTime() - now.getTime()) / (1000 * 60 * 60) * 100) / 100
      : undefined;

    return {
      caseId: c.id,
      caseNumber: c.caseNumber,
      caseType: c.caseType,
      status: c.status,
      fprName: c.fprName,
      team: c.team,
      createdAt: c.createdAt,
      tatTargetAt: c.tatTargetAt,
      hoursOverdue,
      hoursRemaining,
      caseLink: this.generateCaseLink(c.id),
    };
  }

  /**
   * Generate a signed URL for a case (FR-070 A3).
   * Uses HMAC-SHA256 with a secret to produce a tamper-proof link.
   */
  generateCaseLink(caseId: string): string {
    const secret = process.env[LINK_SECRET_ENV] || DEFAULT_LINK_SECRET;
    const expires = Math.floor(Date.now() / 1000) + 86400; // 24h expiry
    const payload = `${caseId}:${expires}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return `${CASE_LINK_BASE_URL}/${caseId}?expires=${expires}&sig=${signature}`;
  }

  /**
   * Verify a signed case link is valid and not expired.
   */
  static verifyCaseLink(caseId: string, expires: number, signature: string): boolean {
    const secret = process.env[LINK_SECRET_ENV] || DEFAULT_LINK_SECRET;
    const payload = `${caseId}:${expires}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (signature !== expected) return false;
    if (Math.floor(Date.now() / 1000) > expires) return false;
    return true;
  }

  /**
   * Render BRD sections as an HTML table layout (FR-070 A4).
   */
  renderHtml(sections: BrdReportSection[]): string {
    const rows = sections.map((section) => {
      if (section.cases.length === 0) {
        return `<h3>${this.escapeHtml(section.title)}</h3>\n<p>No cases in this section.</p>`;
      }

      const tableRows = section.cases.map((c) => {
        const caseRef = c.caseNumber || c.caseId;
        const caseCell = c.caseLink
          ? `<a href="${this.escapeHtml(c.caseLink)}">${this.escapeHtml(caseRef)}</a>`
          : this.escapeHtml(caseRef);

        const overdueCell = c.hoursOverdue !== undefined
          ? `${c.hoursOverdue}h overdue`
          : c.hoursRemaining !== undefined
            ? `${c.hoursRemaining}h remaining`
            : '-';

        return `<tr>
  <td>${caseCell}</td>
  <td>${this.escapeHtml(c.caseType)}</td>
  <td>${this.escapeHtml(c.status)}</td>
  <td>${this.escapeHtml(c.fprName || '-')}</td>
  <td>${this.escapeHtml(c.team || '-')}</td>
  <td>${overdueCell}</td>
</tr>`;
      }).join('\n');

      return `<h3>${this.escapeHtml(section.title)} (${section.cases.length})</h3>
<table border="1" cellpadding="4" cellspacing="0">
<thead>
<tr><th>Case</th><th>Type</th><th>Status</th><th>FPR</th><th>Team</th><th>TAT</th></tr>
</thead>
<tbody>
${tableRows}
</tbody>
</table>`;
    });

    return `<html>
<head><style>
  body { font-family: Arial, sans-serif; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
  th { background-color: #f2f2f2; text-align: left; }
  td, th { padding: 6px 10px; border: 1px solid #ddd; }
</style></head>
<body>
<h2>Daily Pendency Report</h2>
${rows.join('\n\n')}
</body>
</html>`;
  }

  /**
   * Render BRD sections as plain text with alignment (FR-070 A4).
   */
  renderPlainText(sections: BrdReportSection[]): string {
    const lines: string[] = ['DAILY PENDENCY REPORT', '='.repeat(60), ''];

    for (const section of sections) {
      lines.push(`--- ${section.title} (${section.cases.length}) ---`);

      if (section.cases.length === 0) {
        lines.push('  No cases in this section.');
        lines.push('');
        continue;
      }

      // Header
      lines.push(
        this.padRight('Case', 22) +
        this.padRight('Type', 22) +
        this.padRight('Status', 16) +
        this.padRight('FPR', 20) +
        this.padRight('TAT', 16),
      );
      lines.push('-'.repeat(96));

      for (const c of section.cases) {
        const caseRef = c.caseNumber || c.caseId.substring(0, 18);
        const tatStr = c.hoursOverdue !== undefined
          ? `${c.hoursOverdue}h overdue`
          : c.hoursRemaining !== undefined
            ? `${c.hoursRemaining}h left`
            : '-';

        lines.push(
          this.padRight(caseRef, 22) +
          this.padRight(c.caseType, 22) +
          this.padRight(c.status, 16) +
          this.padRight(c.fprName || '-', 20) +
          this.padRight(tatStr, 16),
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Register a scheduled report (FR-071 A1: supports region and case_type).
   */
  async scheduleReport(
    cron: string,
    recipients: string[],
    filters?: ReportFilters,
    options?: { region?: string; caseType?: string; channels?: string[] },
  ): Promise<ScheduledReport> {
    // Cast data to bypass Prisma generated types until schema is regenerated.
    // The region and case_type columns are added in the Prisma schema (FR-071 A1).
    const createData = {
      recipient_role: recipients[0] ?? 'ALL',
      cron_expression: cron,
      channels: options?.channels || ['EMAIL'],
      region: options?.region || filters?.region || null,
      case_type: options?.caseType || filters?.caseType || null,
      is_active: true,
    } as Record<string, unknown>;

    const schedule = await (this.prisma.pendencyReportSchedule.create as Function)({
      data: createData,
    });

    return {
      id: schedule.id,
      cron,
      recipients,
      filters,
    };
  }

  /**
   * Get all scheduled reports.
   */
  async getScheduledReports(): Promise<ScheduledReport[]> {
    const schedules = await this.prisma.pendencyReportSchedule.findMany({
      where: { is_active: true },
    });

    return schedules.map((s) => ({
      id: s.id,
      cron: s.cron_expression,
      recipients: [s.recipient_role],
      filters: {
        region: (s as Record<string, unknown>).region as string | undefined,
        caseType: (s as Record<string, unknown>).case_type as string | undefined,
      },
    }));
  }

  /**
   * FR-070 A5: Render a short-form SMS/WhatsApp template from pendency data.
   * Returns condensed text: case count, top 3 breached case IDs, and signed deep-link.
   */
  renderShortForm(pendencyData: { totalOverdue: number; breachedCases: Array<{ caseId: string; caseNumber?: string }> }): string {
    const { totalOverdue, breachedCases } = pendencyData;
    const top3 = breachedCases.slice(0, 3);
    const caseIds = top3.map((c) => c.caseNumber || c.caseId).join(', ');
    const deepLink = top3.length > 0
      ? this.generateCaseLink(top3[0].caseId)
      : `${CASE_LINK_BASE_URL}`;

    let text = `PENDENCY ALERT: ${totalOverdue} overdue case(s).`;
    if (top3.length > 0) {
      text += ` Top breached: ${caseIds}.`;
    }
    text += ` View: ${deepLink}`;
    return text;
  }

  /**
   * FR-071.A3: Vendor-level pendency aggregation.
   * Returns open/breached counts and average age per vendor.
   */
  async getVendorPendency(): Promise<VendorPendency[]> {
    const allCases = this.directCases !== null
      ? this.directCases
      : await this.loadCasesFromDb();

    // Only consider open cases
    const openCases = allCases.filter(
      (c) => c.status !== 'CLOSED' && c.status !== 'CANCELLED',
    );

    const vendorMap = new Map<string, {
      vendorId: string;
      vendorName: string;
      openCases: number;
      breachedCases: number;
      totalAgeMs: number;
    }>();

    const now = new Date();

    for (const c of openCases) {
      const vendorId = c.vendorId;
      if (!vendorId) continue;

      if (!vendorMap.has(vendorId)) {
        vendorMap.set(vendorId, {
          vendorId,
          vendorName: c.vendorName || vendorId,
          openCases: 0,
          breachedCases: 0,
          totalAgeMs: 0,
        });
      }

      const entry = vendorMap.get(vendorId)!;
      entry.openCases++;
      if (c.isBreached) {
        entry.breachedCases++;
      }
      entry.totalAgeMs += now.getTime() - c.createdAt.getTime();
    }

    const result: VendorPendency[] = [];
    for (const entry of vendorMap.values()) {
      result.push({
        vendorId: entry.vendorId,
        vendorName: entry.vendorName,
        openCases: entry.openCases,
        breachedCases: entry.breachedCases,
        avgAge: entry.openCases > 0
          ? Math.round((entry.totalAgeMs / entry.openCases / (1000 * 60 * 60)) * 100) / 100
          : 0,
      });
    }

    return result.sort((a, b) => b.openCases - a.openCases);
  }

  /**
   * FR-070.A2: Regional breakdown of pendency data.
   * Groups open cases by region and returns open/breached counts
   * and average TAT (turnaround time) in hours per region.
   */
  async getRegionalBreakdown(): Promise<RegionalBreakdown[]> {
    const allCases = this.directCases !== null
      ? this.directCases
      : await this.loadCasesFromDb();

    // Only consider open cases
    const openCases = allCases.filter(
      (c) => c.status !== 'CLOSED' && c.status !== 'CANCELLED',
    );

    const regionMap = new Map<string, {
      region: string;
      openCases: number;
      breachedCases: number;
      totalTatMs: number;
      tatCount: number;
    }>();

    const now = new Date();

    for (const c of openCases) {
      const region = c.region || 'UNKNOWN';

      if (!regionMap.has(region)) {
        regionMap.set(region, {
          region,
          openCases: 0,
          breachedCases: 0,
          totalTatMs: 0,
          tatCount: 0,
        });
      }

      const entry = regionMap.get(region)!;
      entry.openCases++;
      if (c.isBreached) {
        entry.breachedCases++;
      }
      // Calculate TAT as elapsed time from creation to now (for open cases)
      const elapsed = now.getTime() - c.createdAt.getTime();
      entry.totalTatMs += elapsed;
      entry.tatCount++;
    }

    const result: RegionalBreakdown[] = [];
    for (const entry of regionMap.values()) {
      result.push({
        region: entry.region,
        openCases: entry.openCases,
        breachedCases: entry.breachedCases,
        avgTatHours: entry.tatCount > 0
          ? Math.round((entry.totalTatMs / entry.tatCount / (1000 * 60 * 60)) * 100) / 100
          : 0,
      });
    }

    return result.sort((a, b) => b.openCases - a.openCases);
  }

  /**
   * FR-071.A2: Opt a user into the midday refresh report.
   */
  optInMiddayRefresh(userId: string): void {
    this.middayOptIns.add(userId);
    this.logger.log(`User ${userId} opted in to midday refresh`);
  }

  /**
   * FR-071.A2: Opt a user out of the midday refresh report.
   */
  optOutMiddayRefresh(userId: string): void {
    this.middayOptIns.delete(userId);
    this.logger.log(`User ${userId} opted out of midday refresh`);
  }

  /**
   * FR-071.A2: Get all users opted into the midday refresh report.
   */
  getMiddayOptIns(): string[] {
    return Array.from(this.middayOptIns);
  }

  private async loadCasesFromDb(): Promise<CaseSnapshot[]> {
    const cases = await this.prisma.case.findMany({
      where: { status: { notIn: ['CLOSED', 'CANCELLED'] } },
      include: { assigned_fpr: true },
    });

    return cases.map((c) => ({
      id: c.id,
      caseNumber: c.case_number,
      status: c.status,
      fprId: c.assigned_fpr_id ?? undefined,
      fprName: c.assigned_fpr?.full_name ?? undefined,
      caseType: c.case_type,
      createdAt: c.created_at,
      resolvedAt: c.resolved_at ?? undefined,
      tatTargetAt: c.tat_target_at ?? undefined,
      isBreached: c.sla_breach_at ? c.sla_breach_at <= new Date() : false,
    }));
  }

  /**
   * Apply filters to case snapshots (FR-071 A1: includes region filter).
   */
  applyFilters(cases: CaseSnapshot[], filters?: ReportFilters): CaseSnapshot[] {
    if (!filters) return cases;

    let filtered = cases;
    if (filters.team) {
      filtered = filtered.filter((c) => c.team === filters.team);
    }
    if (filters.fprId) {
      filtered = filtered.filter((c) => c.fprId === filters.fprId);
    }
    if (filters.status) {
      filtered = filtered.filter((c) => c.status === filters.status);
    }
    if (filters.caseType) {
      filtered = filtered.filter((c) => c.caseType === filters.caseType);
    }
    if (filters.region) {
      filtered = filtered.filter((c) => c.region === filters.region);
    }
    return filtered;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private padRight(str: string, len: number): string {
    if (str.length >= len) return str.substring(0, len);
    return str + ' '.repeat(len - str.length);
  }
}
