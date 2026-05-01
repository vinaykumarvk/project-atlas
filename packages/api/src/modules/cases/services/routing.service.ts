import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import {
  CanonicalLookupService,
  LookupResult,
} from '../../masters/services/canonical-lookup.service';
import { FprRecord, RoutingResult, RoutingFailure } from '../types';

/**
 * Whether workload-based FPR selection is enabled.
 * When false, first-match selection is used instead of least-loaded.
 */
const isWorkloadBalancingEnabled = (): boolean => {
  const envVal = process.env.ROUTING_WORKLOAD_BALANCE;
  if (envVal === undefined || envVal === null) return true; // default: on
  return envVal.toLowerCase() !== 'false';
};

/**
 * Input parameters for the routing engine.
 */
export interface RoutingInput {
  caseType: string;
  propertyPin?: string;
  propertyCity?: string;
  zone?: string;
  region?: string;
  requiredSkills?: string[];
}

/**
 * FPR Routing Engine (FR-031).
 *
 * Resolves routing key chain: case type -> property PIN -> city -> zone -> region (cascading fallback).
 * Uses CanonicalLookupService for all master lookups.
 * Applies required-skills matching, effective-date filtering, and workload balancing.
 * Handles OOO fallback: primary -> delegate -> supervisor -> manual queue.
 * Returns explicit routing failure reasons for manual triage when no route found.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  // Cached FPR data with TTL
  private fprCache: { data: FprRecord[]; loadedAt: number } | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly canonicalLookup: CanonicalLookupService,
  ) {}

  /**
   * Set FPRs directly (for testing / seeding).
   */
  setFprs(fprs: FprRecord[]): void {
    this.fprCache = { data: fprs, loadedAt: Date.now() };
  }

  /**
   * Route a case to an FPR using the cascading routing key chain.
   *
   * The chain is: case type -> property PIN -> city -> zone -> region.
   * At each tier, the engine tries to find eligible FPRs. If none are found,
   * it falls to the next tier. If all tiers fail, returns a RoutingFailure
   * with an explicit reason for manual triage.
   */
  async routeWithLookup(input: RoutingInput): Promise<RoutingResult | RoutingFailure> {
    const now = new Date();
    const fprs = this.getFprsSync();
    const lookupMatchTypes: Record<string, string> = {};
    const resolvedKeys: Record<string, string | undefined> = {};

    // ---------------------------------------------------------------
    // Step 0: Resolve case type via CanonicalLookupService
    // ---------------------------------------------------------------
    const caseTypeLookup = await this.canonicalLookup.lookup('CaseTypeMaster', input.caseType);
    lookupMatchTypes['caseType'] = caseTypeLookup.matchType;
    const resolvedCaseType = caseTypeLookup.canonicalForm ?? input.caseType;
    resolvedKeys['caseType'] = resolvedCaseType;

    if (caseTypeLookup.matchType === 'NO_MATCH') {
      return {
        success: false,
        reason: `Case type "${input.caseType}" not found in CaseTypeMaster. Cannot route.`,
        failedTier: 'CASE_TYPE',
        resolvedKeys,
        lookupMatchTypes,
      };
    }

    // Extract required skills from case type master if available
    const caseTypeMasterRecord = caseTypeLookup.matchedRecord as
      | { required_skills?: string[]; effective_from?: Date; effective_to?: Date | null }
      | undefined;
    const requiredSkills = input.requiredSkills ??
      (caseTypeMasterRecord?.required_skills ?? []);

    // Effective-date check on case type
    if (caseTypeMasterRecord) {
      const effectiveFrom = caseTypeMasterRecord.effective_from
        ? new Date(caseTypeMasterRecord.effective_from as unknown as string)
        : null;
      const effectiveTo = caseTypeMasterRecord.effective_to
        ? new Date(caseTypeMasterRecord.effective_to as unknown as string)
        : null;
      if (effectiveFrom && now < effectiveFrom) {
        return {
          success: false,
          reason: `Case type "${resolvedCaseType}" is not yet effective (starts ${effectiveFrom.toISOString()}).`,
          failedTier: 'CASE_TYPE',
          resolvedKeys,
          lookupMatchTypes,
        };
      }
      if (effectiveTo && now > effectiveTo) {
        return {
          success: false,
          reason: `Case type "${resolvedCaseType}" has expired (ended ${effectiveTo.toISOString()}).`,
          failedTier: 'CASE_TYPE',
          resolvedKeys,
          lookupMatchTypes,
        };
      }
    }

    // ---------------------------------------------------------------
    // Step 1: Resolve location hierarchy via PIN -> city -> zone -> region
    // ---------------------------------------------------------------
    let resolvedZone: string | undefined;
    let resolvedRegion: string | undefined;
    let resolvedCity: string | undefined;

    // Try PIN lookup
    if (input.propertyPin) {
      const pinResult = await this.resolveLocationByPin(input.propertyPin);
      if (pinResult) {
        resolvedCity = pinResult.city;
        resolvedZone = pinResult.zone;
        resolvedRegion = pinResult.region;
        lookupMatchTypes['propertyPin'] = 'EXACT';
        resolvedKeys['propertyPin'] = input.propertyPin;
        resolvedKeys['propertyCity'] = resolvedCity;
        resolvedKeys['zone'] = resolvedZone;
        resolvedKeys['region'] = resolvedRegion;
      } else {
        lookupMatchTypes['propertyPin'] = 'NO_MATCH';
      }
    }

    // If PIN did not resolve city, try city lookup
    if (!resolvedCity && input.propertyCity) {
      const cityLookup = await this.canonicalLookup.lookup(
        'PropertyLocationMaster',
        input.propertyCity,
      );
      lookupMatchTypes['propertyCity'] = cityLookup.matchType;
      if (cityLookup.matchType !== 'NO_MATCH' && cityLookup.canonicalForm) {
        resolvedCity = cityLookup.canonicalForm;
        const cityRecord = cityLookup.matchedRecord as
          | { zone?: string; region?: string }
          | undefined;
        resolvedZone = cityRecord?.zone ?? input.zone;
        resolvedRegion = cityRecord?.region ?? input.region;
      } else {
        resolvedCity = input.propertyCity;
      }
      resolvedKeys['propertyCity'] = resolvedCity;
    }

    // Fall through to explicit zone/region inputs if not resolved
    if (!resolvedZone && input.zone) resolvedZone = input.zone;
    if (!resolvedRegion && input.region) resolvedRegion = input.region;
    resolvedKeys['zone'] = resolvedZone;
    resolvedKeys['region'] = resolvedRegion;

    // ---------------------------------------------------------------
    // Step 2: Cascading FPR search through the key chain tiers
    // ---------------------------------------------------------------
    const tiers: { name: string; matchFn: (fpr: FprRecord) => boolean }[] = [];
    const pinResolved = lookupMatchTypes['propertyPin'] === 'EXACT';

    if (pinResolved && resolvedCity) {
      tiers.push({
        name: 'PIN',
        matchFn: (fpr) =>
          fpr.caseTypes.includes(resolvedCaseType) &&
          fpr.propertyZones.includes(resolvedCity!),
      });
    }

    if (resolvedCity) {
      tiers.push({
        name: 'CITY',
        matchFn: (fpr) =>
          fpr.caseTypes.includes(resolvedCaseType) &&
          fpr.propertyZones.includes(resolvedCity!),
      });
    }

    if (resolvedZone) {
      tiers.push({
        name: 'ZONE',
        matchFn: (fpr) =>
          fpr.caseTypes.includes(resolvedCaseType) &&
          fpr.propertyZones.includes(resolvedZone!),
      });
    }

    if (resolvedRegion) {
      tiers.push({
        name: 'REGION',
        matchFn: (fpr) =>
          fpr.caseTypes.includes(resolvedCaseType) &&
          fpr.propertyZones.includes(resolvedRegion!),
      });
    }

    for (const tier of tiers) {
      const result = this.findFprInTier(
        fprs,
        tier.matchFn,
        requiredSkills,
        tier.name,
        resolvedKeys,
        lookupMatchTypes,
        resolvedCaseType,
      );
      if (result) return result;
    }

    // ---------------------------------------------------------------
    // Step 3: No tier matched — explicit failure for manual triage
    // ---------------------------------------------------------------
    const failureReason = this.buildFailureReason(
      resolvedCaseType,
      resolvedKeys,
      requiredSkills,
      fprs.length,
    );

    this.logger.warn(
      `Routing failed for case_type=${resolvedCaseType}: ${failureReason}`,
    );

    return {
      success: false,
      reason: failureReason,
      failedTier: 'ALL_TIERS',
      resolvedKeys,
      lookupMatchTypes,
    };
  }

  /**
   * Synchronous route for backward compatibility.
   * Uses cached FPR data and simple zone matching (no canonical lookup).
   */
  route(
    caseType: string,
    propertyZone: string,
    requiredSkills: string[] = [],
  ): RoutingResult | null {
    const fprs = this.getFprsSync();
    const fallbackChain: string[] = [];

    // Step 1: Find eligible FPRs by case type and property zone
    let candidates = fprs.filter(
      (fpr) =>
        fpr.caseTypes.includes(caseType) &&
        fpr.propertyZones.includes(propertyZone),
    );

    // Step 2: Skill-based filter
    if (requiredSkills.length > 0) {
      candidates = candidates.filter((fpr) =>
        requiredSkills.every((skill) => fpr.skills.includes(skill)),
      );
    }

    // Step 3: Try to find available FPR (not OOO)
    const available = candidates.filter((fpr) => !fpr.isOoo);

    if (available.length > 0) {
      const selected = this.selectByWorkload(available);
      const workloadRatio =
        selected.capacityPerDay > 0
          ? selected.openCaseCount / selected.capacityPerDay
          : Infinity;
      return {
        fprId: selected.id,
        fprName: selected.name,
        reason: `Matched by case_type=${caseType}, zone=${propertyZone}, workload=${selected.openCaseCount}/${selected.capacityPerDay}`,
        fallbackChain,
        matchedTier: 'CITY',
        workloadRatio,
      };
    }

    // Step 4: All matched FPRs are OOO -- apply fallback cascade
    // FR-031.A2: Collect all available delegates and pick by lowest workload
    const availableDelegates: { delegate: FprRecord; originFpr: FprRecord }[] = [];
    for (const fpr of candidates) {
      fallbackChain.push(`${fpr.name} (OOO)`);

      if (fpr.delegateId) {
        const delegate = fprs.find(
          (f) => f.id === fpr.delegateId && !f.isOoo,
        );
        if (delegate) {
          availableDelegates.push({ delegate, originFpr: fpr });
        }
      }
    }

    if (availableDelegates.length > 0) {
      // Pick the delegate with the lowest openCaseCount (workload tiebreaker)
      availableDelegates.sort((a, b) => a.delegate.openCaseCount - b.delegate.openCaseCount);
      const best = availableDelegates[0];
      fallbackChain.push(`-> delegate: ${best.delegate.name}`);
      return {
        fprId: best.delegate.id,
        fprName: best.delegate.name,
        reason: `OOO fallback: ${best.originFpr.name} -> delegate ${best.delegate.name}`,
        fallbackChain,
        matchedTier: 'OOO_DELEGATE',
      };
    }

    // Try supervisors if no delegates available
    for (const fpr of candidates) {
      if (fpr.supervisorId) {
        const supervisor = fprs.find(
          (f) => f.id === fpr.supervisorId && !f.isOoo,
        );
        if (supervisor) {
          fallbackChain.push(`-> supervisor: ${supervisor.name}`);
          return {
            fprId: supervisor.id,
            fprName: supervisor.name,
            reason: `OOO fallback: ${fpr.name} -> supervisor ${supervisor.name}`,
            fallbackChain,
            matchedTier: 'OOO_SUPERVISOR',
          };
        }
      }
    }

    // FR-031 A2: Both FPR and delegate are OOO — log OOO_ESCALATION
    // Collect all OOO FPR + delegate names for the escalation log
    const oooNames = candidates.map((fpr) => {
      const parts = [fpr.name];
      if (fpr.delegateId) {
        const delegate = fprs.find((f) => f.id === fpr.delegateId);
        if (delegate) parts.push(delegate.name);
      }
      return parts;
    }).flat();

    if (oooNames.length > 0) {
      this.logger.warn(
        `OOO_ESCALATION: Both FPR and delegate are OOO for case_type=${caseType}, zone=${propertyZone}. ` +
        `OOO persons: ${oooNames.join(', ')}. Setting to MANUAL_ROUTING.`,
      );
    }

    // Step 5: No FPR available -- manual queue
    this.logger.warn(
      `No FPR available for case_type=${caseType}, zone=${propertyZone}. Routing to manual queue.`,
    );
    return null;
  }

  /**
   * Create OOO escalation activity log entry (FR-031 A2).
   * Called when both FPR and delegate are OOO.
   */
  async createOooEscalationLog(
    caseId: string,
    fprName: string,
    delegateName: string,
  ): Promise<void> {
    try {
      await this.prisma.caseActivityLog.create({
        data: {
          case_id: caseId,
          action_code: 'OOO_ESCALATION',
          actor_type: 'SYSTEM',
          payload_json: {
            details: `Both FPR (${fprName}) and delegate (${delegateName}) are OOO. Case set to MANUAL_ROUTING.`,
            fpr_name: fprName,
            delegate_name: delegateName,
            status: 'MANUAL_ROUTING',
          },
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to log OOO escalation for case ${caseId}: ${(err as Error).message}`);
    }
  }

  /**
   * Load FPRs from DB (async, for cache refresh).
   */
  async loadFprs(): Promise<FprRecord[]> {
    const fprs = await this.prisma.fprMaster.findMany({
      where: { is_active: true },
      include: {
        cases: {
          where: { status: { notIn: ['CLOSED', 'CANCELLED'] } },
          select: { id: true },
        },
      },
    });

    const records: FprRecord[] = fprs.map((f) => ({
      id: f.id,
      name: f.full_name,
      email: '',
      skills: f.skills,
      propertyZones: f.region_ids,
      caseTypes: [],
      capacityPerDay: f.capacity_per_day,
      openCaseCount: f.cases.length,
      isOoo: f.is_ooo,
      delegateId: f.ooo_delegate_id ?? undefined,
      supervisorId: f.supervisor_id ?? undefined,
    }));

    this.fprCache = { data: records, loadedAt: Date.now() };
    return records;
  }

  /**
   * FR-160: Bulk reassign cases with workload balancing across target agents.
   * Distributes cases round-robin to agents with lowest current workload.
   */
  bulkReassignWithBalancing(caseIds: string[], targetAgents: string[]): Array<{ caseId: string; assignedTo: string }> {
    const workloads = new Map<string, number>(targetAgents.map(a => [a, 0]));
    return caseIds.map(caseId => {
      // Pick agent with lowest current workload
      const sorted = [...workloads.entries()].sort((a, b) => a[1] - b[1]);
      const assignedTo = sorted[0][0];
      workloads.set(assignedTo, (workloads.get(assignedTo) || 0) + 1);
      return { caseId, assignedTo };
    });
  }

  /**
   * FR-161: Check escalation threshold and auto-change priority.
   * When escalation count crosses thresholds, automatically upgrades priority.
   */
  checkEscalationThreshold(caseId: string, currentPriority: string, escalationCount: number): string {
    if (escalationCount >= 3 && currentPriority !== 'CRITICAL') {
      this.logger.log(`Auto-escalating case=${caseId} to CRITICAL (escalations=${escalationCount})`);
      return 'CRITICAL';
    }
    if (escalationCount >= 2 && currentPriority === 'LOW') {
      this.logger.log(`Auto-escalating case=${caseId} to MEDIUM (escalations=${escalationCount})`);
      return 'MEDIUM';
    }
    return currentPriority;
  }

  // ---------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------

  /**
   * Resolve location information from a property PIN using the
   * PropertyLocationMaster table's pin_from/pin_to ranges.
   */
  private async resolveLocationByPin(
    pin: string,
  ): Promise<{ city: string; zone?: string; region?: string } | null> {
    try {
      const location = await this.prisma.propertyLocationMaster.findFirst({
        where: {
          pin_from: { lte: pin },
          pin_to: { gte: pin },
          is_active: true,
          is_deleted: false,
        },
      });

      if (location) {
        return {
          city: location.city,
          zone: location.zone ?? undefined,
          region: location.region ?? undefined,
        };
      }
    } catch (error) {
      this.logger.warn(`PIN lookup failed for ${pin}: ${error}`);
    }
    return null;
  }

  /**
   * Search for an FPR in a given tier, applying skill filtering, OOO
   * fallback, and workload balancing.
   */
  private findFprInTier(
    fprs: FprRecord[],
    matchFn: (fpr: FprRecord) => boolean,
    requiredSkills: string[],
    tierName: string,
    resolvedKeys: Record<string, string | undefined>,
    lookupMatchTypes: Record<string, string>,
    resolvedCaseType: string,
  ): RoutingResult | null {
    let candidates = fprs.filter(matchFn);

    // Skill-based filter
    if (requiredSkills.length > 0) {
      candidates = candidates.filter((fpr) =>
        requiredSkills.every((skill) => fpr.skills.includes(skill)),
      );
    }

    if (candidates.length === 0) return null;

    // Try available (not OOO) FPRs
    const available = candidates.filter((fpr) => !fpr.isOoo);
    if (available.length > 0) {
      const selected = this.selectByWorkload(available);
      const workloadRatio =
        selected.capacityPerDay > 0
          ? selected.openCaseCount / selected.capacityPerDay
          : Infinity;
      return {
        fprId: selected.id,
        fprName: selected.name,
        reason: `Matched at tier=${tierName}, case_type=${resolvedCaseType}, workload=${selected.openCaseCount}/${selected.capacityPerDay}`,
        fallbackChain: [],
        matchedTier: tierName,
        resolvedKeys,
        lookupMatchTypes,
        workloadRatio,
      };
    }

    // OOO fallback cascade
    // FR-031.A2: Collect all available delegates and pick by lowest workload
    const fallbackChain: string[] = [];
    const availableDelegates: { delegate: FprRecord; originFpr: FprRecord }[] = [];
    for (const fpr of candidates) {
      fallbackChain.push(`${fpr.name} (OOO)`);

      if (fpr.delegateId) {
        const delegate = fprs.find(
          (f) => f.id === fpr.delegateId && !f.isOoo,
        );
        if (delegate) {
          availableDelegates.push({ delegate, originFpr: fpr });
        }
      }
    }

    if (availableDelegates.length > 0) {
      // Pick the delegate with the lowest openCaseCount (workload tiebreaker)
      availableDelegates.sort((a, b) => a.delegate.openCaseCount - b.delegate.openCaseCount);
      const best = availableDelegates[0];
      fallbackChain.push(`-> delegate: ${best.delegate.name}`);
      return {
        fprId: best.delegate.id,
        fprName: best.delegate.name,
        reason: `OOO fallback at tier=${tierName}: ${best.originFpr.name} -> delegate ${best.delegate.name}`,
        fallbackChain,
        matchedTier: `${tierName}_OOO_DELEGATE`,
        resolvedKeys,
        lookupMatchTypes,
      };
    }

    // Try supervisors if no delegates available
    for (const fpr of candidates) {
      if (fpr.supervisorId) {
        const supervisor = fprs.find(
          (f) => f.id === fpr.supervisorId && !f.isOoo,
        );
        if (supervisor) {
          fallbackChain.push(`-> supervisor: ${supervisor.name}`);
          return {
            fprId: supervisor.id,
            fprName: supervisor.name,
            reason: `OOO fallback at tier=${tierName}: ${fpr.name} -> supervisor ${supervisor.name}`,
            fallbackChain,
            matchedTier: `${tierName}_OOO_SUPERVISOR`,
            resolvedKeys,
            lookupMatchTypes,
          };
        }
      }
    }

    return null;
  }

  /**
   * Get FPRs synchronously (from cache).
   */
  private getFprsSync(): FprRecord[] {
    return this.fprCache?.data ?? [];
  }

  /**
   * Select FPR with lowest workload ratio (open cases / capacity),
   * or first-match if workload balancing is disabled (FR-031.A3).
   */
  private selectByWorkload(fprs: FprRecord[]): FprRecord {
    if (!isWorkloadBalancingEnabled()) {
      return fprs[0];
    }
    return fprs.reduce((best, current) => {
      const bestRatio =
        best.capacityPerDay > 0
          ? best.openCaseCount / best.capacityPerDay
          : Infinity;
      const currentRatio =
        current.capacityPerDay > 0
          ? current.openCaseCount / current.capacityPerDay
          : Infinity;
      return currentRatio < bestRatio ? current : best;
    });
  }

  /**
   * Build a descriptive failure reason for manual triage.
   */
  private buildFailureReason(
    caseType: string,
    resolvedKeys: Record<string, string | undefined>,
    requiredSkills: string[],
    totalFprCount: number,
  ): string {
    const parts: string[] = [];

    if (totalFprCount === 0) {
      parts.push('No FPRs loaded in cache.');
    }

    const locationKeys = [
      resolvedKeys['propertyPin'],
      resolvedKeys['propertyCity'],
      resolvedKeys['zone'],
      resolvedKeys['region'],
    ].filter(Boolean);

    if (locationKeys.length === 0) {
      parts.push(
        'No property location information available (PIN, city, zone, or region).',
      );
    } else {
      parts.push(
        `No FPR covers case_type="${caseType}" in locations: ${locationKeys.join(', ')}.`,
      );
    }

    if (requiredSkills.length > 0) {
      parts.push(`Required skills: [${requiredSkills.join(', ')}].`);
    }

    parts.push('Case requires manual triage assignment.');

    return parts.join(' ');
  }
}
