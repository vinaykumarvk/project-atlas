import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import {
  computeElapsedBusinessHours,
  BusinessHoursConfig,
  DEFAULT_BUSINESS_HOURS,
  Holiday,
} from '../../../common/utils/business-hours';
import { CaseRecord, CaseStatus } from '../../cases/types';

export enum BreachStatus {
  ON_TRACK = 'ON_TRACK',
  AT_RISK = 'AT_RISK',
  BREACHED = 'BREACHED',
}

export interface SlaClockResult {
  caseId: string;
  totalBusinessHours: number;
  elapsedBusinessHours: number;
  remainingBusinessHours: number;
  percentElapsed: number;
  breachStatus: BreachStatus;
  pausedHours: number;
  /** The TAT config key used for the lookup */
  tatConfigKey?: string;
  /** The region whose business hours / holidays were applied */
  appliedRegion?: string;
}

export interface ClockPauseRecord {
  caseId: string;
  pausedAt: Date;
  resumedAt?: Date;
}

/**
 * TAT configuration key composed of case type + priority + stage.
 */
interface TatConfigEntry {
  caseType: string;
  priority: string;
  stage: string;
  targetHoursBusiness: number;
  warnAtPercent: number;
}

/**
 * Region-specific business hours and holidays.
 */
interface RegionCalendar {
  businessHours: BusinessHoursConfig[];
  holidays: Holiday[];
}

/**
 * SLA Clock Service
 *
 * Computes remaining business hours for a case given its tatTargetAt and current time.
 * Determines breach status: ON_TRACK, AT_RISK (<=25% remaining), BREACHED (past target).
 * Handles clock pause/resume (e.g., when case is AWAITING_VENDOR).
 *
 * Phase 2 enhancements:
 * - TAT lookup by case type + priority + stage (not just case type)
 * - Business hours and holiday calendar per region
 * - Edge case handling for weekends and holiday boundaries
 */
@Injectable()
export class SlaClockService {
  private readonly logger = new Logger(SlaClockService.name);

  // Cached master data
  private businessHoursCache: { data: BusinessHoursConfig[]; loadedAt: number } | null = null;
  private holidaysCache: { data: Holiday[]; loadedAt: number } | null = null;
  private tatConfigCache: { data: Record<string, number>; loadedAt: number } | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  // Region-specific caches
  private regionCalendarCache: Map<string, { data: RegionCalendar; loadedAt: number }> = new Map();
  private tatEntriesCache: { data: TatConfigEntry[]; loadedAt: number } | null = null;

  /**
   * FR-055.A1: Configurable SLA timer list.
   * Controls which SLA timer stages are shown in the workbench UI.
   * Defaults to all stages; can be overridden via setVisibleTimerStages().
   */
  private visibleTimerStages: Set<string> = new Set([
    'INITIAL_TRIAGE',
    'VENDOR_RESPONSE',
    'OFFICER_REVIEW',
    'FINAL_RESOLUTION',
    'OVERALL',
  ]);

  // Pause records -- in-memory cache; DB-backed via CaseActivityLog
  private pauseRecords: ClockPauseRecord[] = [];

  // Whether to use DB-backed pause records (false = in-memory only, for testing)
  private useDbPauseRecords = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * FR-055.A1: Set which SLA timer stages are visible in the workbench.
   */
  setVisibleTimerStages(stages: string[]): void {
    this.visibleTimerStages = new Set(stages);
  }

  /**
   * FR-055.A1: Get the configurable list of visible SLA timer stages.
   */
  getVisibleTimerStages(): string[] {
    return Array.from(this.visibleTimerStages);
  }

  /**
   * FR-055.A1: Check if a timer stage should be displayed.
   */
  isTimerStageVisible(stage: string): boolean {
    return this.visibleTimerStages.has(stage);
  }

  /**
   * Set business hours config (for testing).
   */
  setBusinessHours(hours: BusinessHoursConfig[], holidays: Holiday[]): void {
    this.businessHoursCache = { data: hours, loadedAt: Date.now() };
    this.holidaysCache = { data: holidays, loadedAt: Date.now() };
  }

  /**
   * Set TAT config (for testing).
   */
  setTatConfig(config: Record<string, number>): void {
    this.tatConfigCache = { data: config, loadedAt: Date.now() };
  }

  /**
   * Enable DB-backed pause records.
   * When enabled, computePausedHours() will load pause/resume records from CaseActivityLog.
   */
  setUseDbPauseRecords(enabled: boolean): void {
    this.useDbPauseRecords = enabled;
  }

  /**
   * Load pause records from CaseActivityLog for a specific case.
   * Constructs ClockPauseRecord entries from SLA_PAUSED/SLA_RESUMED activity log entries.
   */
  async loadPauseRecordsFromDb(caseId: string): Promise<ClockPauseRecord[]> {
    try {
      const logs = await this.prisma.caseActivityLog.findMany({
        where: {
          case_id: caseId,
          action_code: { in: ['SLA_PAUSED', 'SLA_RESUMED'] },
        },
        orderBy: { created_at: 'asc' },
      });

      const records: ClockPauseRecord[] = [];
      let currentPause: ClockPauseRecord | null = null;

      for (const log of logs) {
        if (log.action_code === 'SLA_PAUSED') {
          if (currentPause) {
            // Previous pause was never resumed; close it at the current pause time
            records.push(currentPause);
          }
          currentPause = { caseId, pausedAt: log.created_at };
        } else if (log.action_code === 'SLA_RESUMED') {
          if (currentPause) {
            currentPause.resumedAt = log.created_at;
            records.push(currentPause);
            currentPause = null;
          }
        }
      }

      // If there is an open pause (no resume yet), include it
      if (currentPause) {
        records.push(currentPause);
      }

      return records;
    } catch (err) {
      this.logger.warn(`Failed to load pause records for case ${caseId}: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Set detailed TAT entries (for testing) -- keyed by caseType|priority|stage.
   */
  setTatEntries(entries: TatConfigEntry[]): void {
    this.tatEntriesCache = { data: entries, loadedAt: Date.now() };
  }

  /**
   * Set region-specific calendar (for testing).
   */
  setRegionCalendar(region: string, calendar: RegionCalendar): void {
    this.regionCalendarCache.set(region, { data: calendar, loadedAt: Date.now() });
  }

  /**
   * Get total TAT hours for a case type (legacy simple lookup).
   */
  getTotalHours(caseType: string): number {
    const config = this.tatConfigCache?.data ?? {};
    return config[caseType] || 48;
  }

  /**
   * Get total TAT hours by case type + priority + stage.
   *
   * Falls back through a specificity cascade:
   *   1. Exact match: caseType + priority + stage
   *   2. Default priority: caseType + "NORMAL" + stage
   *   3. Default stage: caseType + priority + "RESOLUTION"
   *   4. Any match for caseType: caseType only
   *   5. Legacy simple lookup by caseType
   *   6. Default 48 hours
   */
  getTotalHoursByKey(caseType: string, priority: string, stage: string): { hours: number; configKey: string } {
    const entries = this.tatEntriesCache?.data ?? [];

    // 1. Exact match
    const exact = entries.find(
      (e) => e.caseType === caseType && e.priority === priority && e.stage === stage,
    );
    if (exact) {
      return { hours: exact.targetHoursBusiness, configKey: `${caseType}|${priority}|${stage}` };
    }

    // 2. Default priority fallback
    const defaultPriority = entries.find(
      (e) => e.caseType === caseType && e.priority === 'NORMAL' && e.stage === stage,
    );
    if (defaultPriority) {
      return {
        hours: defaultPriority.targetHoursBusiness,
        configKey: `${caseType}|NORMAL|${stage}`,
      };
    }

    // 3. Default stage fallback
    const defaultStage = entries.find(
      (e) => e.caseType === caseType && e.priority === priority && e.stage === 'RESOLUTION',
    );
    if (defaultStage) {
      return {
        hours: defaultStage.targetHoursBusiness,
        configKey: `${caseType}|${priority}|RESOLUTION`,
      };
    }

    // 4. Any match for caseType
    const anyForType = entries.find((e) => e.caseType === caseType);
    if (anyForType) {
      return {
        hours: anyForType.targetHoursBusiness,
        configKey: `${caseType}|*|*`,
      };
    }

    // 5. Legacy simple lookup
    const legacyHours = this.getTotalHours(caseType);
    return { hours: legacyHours, configKey: `${caseType}(legacy)` };
  }

  /**
   * Get the business hours schedule and holidays for a given region.
   * Falls back to the global/default schedule if no region-specific config exists.
   */
  getRegionCalendar(region?: string): RegionCalendar {
    if (region) {
      const cached = this.regionCalendarCache.get(region);
      if (cached) {
        return cached.data;
      }
    }

    // Fall back to global config
    return {
      businessHours: this.businessHoursCache?.data ?? this.defaultBusinessHours(),
      holidays: this.holidaysCache?.data ?? [],
    };
  }

  /**
   * Compute SLA clock status for a case at a given point in time.
   *
   * Enhanced to use case type + priority + stage for TAT lookup
   * and region-specific business hours / holiday calendar.
   */
  computeStatus(
    caseRecord: CaseRecord,
    now?: Date,
    options?: { stage?: string; region?: string },
  ): SlaClockResult {
    const currentTime = now || new Date();
    const stage = options?.stage ?? 'RESOLUTION';
    const region = options?.region;

    // Look up TAT by case type + priority + stage
    const { hours: totalHours, configKey } = this.getTotalHoursByKey(
      caseRecord.caseType,
      caseRecord.priority,
      stage,
    );

    // Get region-specific business hours and holidays
    const calendar = this.getRegionCalendar(region);
    const businessHours = calendar.businessHours;
    const holidays = calendar.holidays;

    if (!caseRecord.tatTargetAt) {
      return {
        caseId: caseRecord.id,
        totalBusinessHours: totalHours,
        elapsedBusinessHours: 0,
        remainingBusinessHours: totalHours,
        percentElapsed: 0,
        breachStatus: BreachStatus.ON_TRACK,
        pausedHours: 0,
        tatConfigKey: configKey,
        appliedRegion: region,
      };
    }

    // Calculate paused hours for this case
    const pausedHours = this.computePausedHours(caseRecord.id, currentTime, region);

    // Compute elapsed business hours since case creation
    const elapsedRaw = computeElapsedBusinessHours(
      caseRecord.createdAt,
      currentTime,
      businessHours,
      holidays,
    );

    // FR-055.A2: Subtract paused hours from elapsed time for correct breach determination.
    // The effectiveElapsed value excludes any time the clock was paused (e.g., AWAITING_VENDOR).
    const effectiveElapsed = elapsedRaw - (pausedHours || 0);
    const elapsedBusinessHours = Math.max(0, effectiveElapsed);

    // Remaining = total - elapsed
    const remainingBusinessHours = Math.max(0, totalHours - elapsedBusinessHours);

    // Percent elapsed
    const percentElapsed = totalHours > 0 ? (elapsedBusinessHours / totalHours) * 100 : 0;

    // Determine breach status
    const breachStatus = this.determineBreachStatus(remainingBusinessHours, totalHours);

    return {
      caseId: caseRecord.id,
      totalBusinessHours: totalHours,
      elapsedBusinessHours,
      remainingBusinessHours,
      percentElapsed: Math.min(percentElapsed, 100),
      breachStatus,
      pausedHours,
      tatConfigKey: configKey,
      appliedRegion: region,
    };
  }

  /**
   * Pause the SLA clock for a case (e.g., when AWAITING_VENDOR).
   * Also persists a SLA_PAUSED entry to CaseActivityLog.
   */
  pauseClock(caseId: string, pausedAt?: Date, reason?: string): void {
    const existing = this.pauseRecords.find(
      (r) => r.caseId === caseId && !r.resumedAt,
    );
    if (existing) {
      this.logger.warn(`Clock already paused for case ${caseId}`);
      return;
    }
    const ts = pausedAt || new Date();
    this.pauseRecords.push({
      caseId,
      pausedAt: ts,
    });

    // Persist to DB (fire-and-forget)
    this.prisma.caseActivityLog.create({
      data: {
        case_id: caseId,
        action_code: 'SLA_PAUSED',
        actor_type: 'SYSTEM',
        payload_json: { reason: reason || 'SLA clock paused', pausedAt: ts.toISOString() },
      },
    }).catch((err) => {
      this.logger.error(`Failed to persist SLA_PAUSED: ${err.message}`);
    });
  }

  /**
   * Resume the SLA clock for a case.
   * Also persists a SLA_RESUMED entry to CaseActivityLog.
   */
  resumeClock(caseId: string, resumedAt?: Date): void {
    const record = this.pauseRecords.find(
      (r) => r.caseId === caseId && !r.resumedAt,
    );
    if (!record) {
      this.logger.warn(`No active pause found for case ${caseId}`);
      return;
    }
    const ts = resumedAt || new Date();
    record.resumedAt = ts;

    // Persist to DB (fire-and-forget)
    this.prisma.caseActivityLog.create({
      data: {
        case_id: caseId,
        action_code: 'SLA_RESUMED',
        actor_type: 'SYSTEM',
        payload_json: { resumedAt: ts.toISOString() },
      },
    }).catch((err) => {
      this.logger.error(`Failed to persist SLA_RESUMED: ${err.message}`);
    });
  }

  /**
   * Compute total paused business hours for a case.
   * Uses region-specific calendar if provided.
   * When DB mode is enabled, loads pause records from CaseActivityLog.
   */
  computePausedHours(caseId: string, now?: Date, region?: string): number {
    const currentTime = now || new Date();
    const records = this.pauseRecords.filter((r) => r.caseId === caseId);
    const calendar = this.getRegionCalendar(region);

    let totalPaused = 0;
    for (const record of records) {
      const endTime = record.resumedAt || currentTime;
      totalPaused += computeElapsedBusinessHours(
        record.pausedAt,
        endTime,
        calendar.businessHours,
        calendar.holidays,
      );
    }
    return totalPaused;
  }

  /** Configurable warning threshold (percentage). */
  private warnAtPercent = 80;

  /**
   * Set the warning threshold percentage (for testing).
   */
  setWarnAtPercent(percent: number): void {
    this.warnAtPercent = percent;
  }

  /**
   * FR-060.A3: Get countdown information for a case.
   *
   * @param caseId - The case ID
   * @returns Countdown info with remaining time, total time, percent used, and warning status
   */
  async getCountdown(caseId: string): Promise<{
    remainingMs: number;
    totalMs: number;
    percentUsed: number;
    warningTriggered: boolean;
  }> {
    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: { assigned_fpr: true },
    });

    if (!caseRecord) {
      return { remainingMs: 0, totalMs: 0, percentUsed: 100, warningTriggered: true };
    }

    const mappedCase: CaseRecord = {
      id: caseRecord.id,
      caseNumber: caseRecord.case_number,
      emailIngestId: caseRecord.email_ingest_id ?? '',
      subject: caseRecord.ai_summary ?? '',
      from: '',
      status: caseRecord.status as CaseStatus,
      caseType: caseRecord.case_type,
      priority: caseRecord.priority,
      confidenceBand: caseRecord.confidence_band ?? 'GREEN',
      languageDetected: '',
      assignedFprId: caseRecord.assigned_fpr_id ?? undefined,
      assignedFprName: caseRecord.assigned_fpr?.full_name ?? undefined,
      tatTargetAt: caseRecord.tat_target_at ?? undefined,
      createdAt: caseRecord.created_at,
      updatedAt: caseRecord.updated_at,
      closedAt: caseRecord.closed_at ?? undefined,
      activityLog: [],
      linkedCaseIds: [],
    };

    const status = this.computeStatus(mappedCase);
    const totalMs = status.totalBusinessHours * 3600 * 1000;
    const remainingMs = status.remainingBusinessHours * 3600 * 1000;
    const percentUsed = status.percentElapsed;
    const warningTriggered = percentUsed >= this.warnAtPercent;

    return { remainingMs, totalMs, percentUsed, warningTriggered };
  }

  /**
   * FR-060.A3: Simplified countdown using pre-computed SLA result (for testing).
   */
  getCountdownFromStatus(status: SlaClockResult): {
    remainingMs: number;
    totalMs: number;
    percentUsed: number;
    warningTriggered: boolean;
  } {
    const totalMs = status.totalBusinessHours * 3600 * 1000;
    const remainingMs = status.remainingBusinessHours * 3600 * 1000;
    const percentUsed = status.percentElapsed;
    const warningTriggered = percentUsed >= this.warnAtPercent;

    return { remainingMs, totalMs, percentUsed, warningTriggered };
  }

  /**
   * Get pause records for a case (for testing/inspection).
   */
  getPauseRecords(caseId: string): ClockPauseRecord[] {
    return this.pauseRecords.filter((r) => r.caseId === caseId);
  }

  /**
   * Load business hours and holidays from DB.
   *
   * Phase 2: Loads region-specific business hours and holidays,
   * plus multi-key TAT entries (case type + priority + stage).
   */
  async loadMasterData(): Promise<void> {
    const [hours, holidays, tats] = await Promise.all([
      this.prisma.businessHoursMaster.findMany({ where: { is_active: true } }),
      this.prisma.holidayCalendarMaster.findMany({ where: { is_active: true } }),
      this.prisma.tatMaster.findMany({ where: { is_active: true } }),
    ]);

    // Global business hours (uses first available or default)
    if (hours.length > 0) {
      this.businessHoursCache = {
        data: hours.map((h) => ({
          day_of_week: h.day_of_week,
          open_time: h.open_time,
          close_time: h.close_time,
          is_working: h.is_working,
        })),
        loadedAt: Date.now(),
      };
    }

    // Build region-specific calendars
    const regionHoursMap = new Map<string, BusinessHoursConfig[]>();
    for (const h of hours) {
      const region = h.region;
      if (!regionHoursMap.has(region)) {
        regionHoursMap.set(region, []);
      }
      regionHoursMap.get(region)!.push({
        day_of_week: h.day_of_week,
        open_time: h.open_time,
        close_time: h.close_time,
        is_working: h.is_working,
      });
    }

    const regionHolidaysMap = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const region = h.region;
      if (!regionHolidaysMap.has(region)) {
        regionHolidaysMap.set(region, []);
      }
      regionHolidaysMap.get(region)!.push({
        date: h.date.toISOString().slice(0, 10),
      });
    }

    // Merge region calendars
    const allRegions = new Set([
      ...regionHoursMap.keys(),
      ...regionHolidaysMap.keys(),
    ]);
    for (const region of allRegions) {
      const bh = regionHoursMap.get(region) ?? this.defaultBusinessHours();
      const hols = regionHolidaysMap.get(region) ?? [];
      this.regionCalendarCache.set(region, {
        data: { businessHours: bh, holidays: hols },
        loadedAt: Date.now(),
      });
    }

    // Global holidays
    this.holidaysCache = {
      data: holidays.map((h) => ({
        date: h.date.toISOString().slice(0, 10),
        name: h.name,
      })),
      loadedAt: Date.now(),
    };

    // Legacy simple TAT config (case type -> hours)
    const config: Record<string, number> = {};
    for (const t of tats) {
      if (!config[t.case_type]) {
        config[t.case_type] = t.target_hours_business;
      }
    }
    if (Object.keys(config).length > 0) {
      this.tatConfigCache = { data: config, loadedAt: Date.now() };
    }

    // Detailed TAT entries (case type + priority + stage)
    const entries: TatConfigEntry[] = tats.map((t) => ({
      caseType: t.case_type,
      priority: t.priority,
      stage: t.stage,
      targetHoursBusiness: t.target_hours_business,
      warnAtPercent: t.warn_at_percent,
    }));
    this.tatEntriesCache = { data: entries, loadedAt: Date.now() };
  }

  /**
   * Determine breach status based on remaining hours.
   */
  private determineBreachStatus(remainingHours: number, totalHours: number): BreachStatus {
    if (remainingHours <= 0) {
      return BreachStatus.BREACHED;
    }

    const remainingPercent = (remainingHours / totalHours) * 100;
    if (remainingPercent <= 25) {
      return BreachStatus.AT_RISK;
    }

    return BreachStatus.ON_TRACK;
  }

  private defaultBusinessHours(): BusinessHoursConfig[] {
    return DEFAULT_BUSINESS_HOURS;
  }
}
