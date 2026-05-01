import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

export interface HeatmapCell {
  region: string;
  caseType: string;
  breachRate: number;
  totalCases: number;
  breachedCases: number;
}

export interface HeatmapResult {
  cells: HeatmapCell[];
  regions: string[];
  caseTypes: string[];
}

export interface RegionSummary {
  total: number;
  breached: number;
  rate: number;
}

export interface HeatmapCaseInput {
  caseId: string;
  caseType: string;
  performer: string; // FPR or officer name/id
  isBreached: boolean;
  createdAt: Date;
}

@Injectable()
export class HeatmapService {
  private readonly logger = new Logger(HeatmapService.name);

  // In-memory mock data for testing
  private mockData: Array<{
    region: string;
    caseType: string;
    isBreached: boolean;
  }> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Set mock data for testing.
   */
  setMockData(
    data: Array<{ region: string; caseType: string; isBreached: boolean }>,
  ): void {
    this.mockData = data;
  }

  /**
   * Generate a breach heatmap showing breach rates by region x caseType.
   */
  async getBreachHeatmap(): Promise<HeatmapResult> {
    const data = this.mockData ?? (await this.loadFromDb());

    // Aggregate by region x caseType
    const cellMap = new Map<string, HeatmapCell>();
    const regionSet = new Set<string>();
    const caseTypeSet = new Set<string>();

    for (const item of data) {
      const key = `${item.region}::${item.caseType}`;
      regionSet.add(item.region);
      caseTypeSet.add(item.caseType);

      if (!cellMap.has(key)) {
        cellMap.set(key, {
          region: item.region,
          caseType: item.caseType,
          breachRate: 0,
          totalCases: 0,
          breachedCases: 0,
        });
      }

      const cell = cellMap.get(key)!;
      cell.totalCases++;
      if (item.isBreached) {
        cell.breachedCases++;
      }
    }

    // Compute breach rates
    const cells: HeatmapCell[] = [];
    for (const cell of cellMap.values()) {
      cell.breachRate =
        cell.totalCases > 0
          ? Math.round((cell.breachedCases / cell.totalCases) * 10000) / 100
          : 0;
      cells.push(cell);
    }

    return {
      cells,
      regions: Array.from(regionSet).sort(),
      caseTypes: Array.from(caseTypeSet).sort(),
    };
  }

  /**
   * Get a summary for a specific region.
   */
  async getRegionSummary(region: string): Promise<RegionSummary> {
    const heatmap = await this.getBreachHeatmap();

    const regionCells = heatmap.cells.filter((c) => c.region === region);

    const total = regionCells.reduce((sum, c) => sum + c.totalCases, 0);
    const breached = regionCells.reduce((sum, c) => sum + c.breachedCases, 0);
    const rate =
      total > 0 ? Math.round((breached / total) * 10000) / 100 : 0;

    return { total, breached, rate };
  }

  /**
   * FR-111.A3: Generate a time-of-day heatmap grouping breach counts by day-of-week x hour-of-day.
   * Returns a nested record: { dayOfWeek: { hourOfDay: breachCount } }
   */
  getTimeOfDayHeatmap(
    cases: HeatmapCaseInput[],
  ): Record<string, Record<string, number>> {
    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    const heatmap: Record<string, Record<string, number>> = {};

    // Initialize all day x hour cells to 0
    for (const day of dayNames) {
      heatmap[day] = {};
      for (let h = 0; h < 24; h++) {
        heatmap[day][String(h).padStart(2, '0')] = 0;
      }
    }

    // Count breached cases by day-of-week x hour-of-day
    for (const c of cases) {
      if (!c.isBreached) continue;
      const date = c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt);
      const day = dayNames[date.getDay()];
      const hour = String(date.getHours()).padStart(2, '0');
      heatmap[day][hour]++;
    }

    return heatmap;
  }

  /**
   * FR-111.A3: Generate a performer heatmap grouping breach rate by performer x case_type.
   * Returns a nested record: { performer: { caseType: breachRate } }
   */
  getPerformerHeatmap(
    cases: HeatmapCaseInput[],
  ): Record<string, Record<string, number>> {
    // Collect counts per performer x case_type
    const counts = new Map<
      string,
      Map<string, { total: number; breached: number }>
    >();

    for (const c of cases) {
      if (!counts.has(c.performer)) {
        counts.set(c.performer, new Map());
      }
      const performerMap = counts.get(c.performer)!;
      if (!performerMap.has(c.caseType)) {
        performerMap.set(c.caseType, { total: 0, breached: 0 });
      }
      const cell = performerMap.get(c.caseType)!;
      cell.total++;
      if (c.isBreached) {
        cell.breached++;
      }
    }

    // Convert to breach rate percentages
    const heatmap: Record<string, Record<string, number>> = {};
    for (const [performer, caseTypeMap] of counts) {
      heatmap[performer] = {};
      for (const [caseType, cell] of caseTypeMap) {
        heatmap[performer][caseType] =
          cell.total > 0
            ? Math.round((cell.breached / cell.total) * 10000) / 100
            : 0;
      }
    }

    return heatmap;
  }

  /**
   * Load heatmap data from the database.
   */
  private async loadFromDb(): Promise<
    Array<{ region: string; caseType: string; isBreached: boolean }>
  > {
    try {
      const cases = await this.prisma.case.findMany({
        select: {
          property_city: true,
          case_type: true,
          sla_breach_at: true,
        },
      });

      return cases.map((c) => ({
        region: (c as Record<string, unknown>).property_city as string || 'Unknown',
        caseType: c.case_type,
        isBreached: !!(c as Record<string, unknown>).sla_breach_at &&
          ((c as Record<string, unknown>).sla_breach_at as Date) <= new Date(),
      }));
    } catch (error) {
      this.logger.error(
        `Failed to load heatmap data: ${(error as Error).message}`,
      );
      return [];
    }
  }
}
