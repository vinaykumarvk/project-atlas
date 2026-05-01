import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface FlagValue {
  enabled: boolean;
  rolloutPercent: number;
  description: string;
  /** FR-151.A1: Optional scoping arrays for per-role/region/env enforcement. */
  allowedRoles?: string[];
  allowedRegions?: string[];
  allowedEnvs?: string[];
}

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);
  private flags = new Map<string, FlagValue>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastPollHash: string = '';

  constructor() {
    this.seedDefaults();
  }

  /**
   * FR-151.A2: Start polling for configuration changes at a given interval.
   */
  startPolling(intervalMs: number = 30000): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => this.pollForChanges(), intervalMs);
    this.logger.log(`Config hot-reload polling started (interval=${intervalMs}ms)`);
  }

  /**
   * FR-151.A2: Stop polling for configuration changes.
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.logger.log('Config hot-reload polling stopped');
    }
  }

  /**
   * FR-151.A2: Check for configuration changes by comparing serialized flag state.
   */
  private pollForChanges(): void {
    const currentHash = JSON.stringify(Array.from(this.flags.entries()));
    if (currentHash !== this.lastPollHash) {
      this.logger.log('Feature flag configuration change detected');
      this.lastPollHash = currentHash;
    }
  }

  /**
   * Get a single flag by name.
   */
  getFlag(name: string): { enabled: boolean; rolloutPercent: number } | undefined {
    const flag = this.flags.get(name);
    if (!flag) return undefined;
    return { enabled: flag.enabled, rolloutPercent: flag.rolloutPercent };
  }

  /**
   * Set (create or update) a flag.
   */
  setFlag(name: string, enabled: boolean, rolloutPercent?: number): void {
    const existing = this.flags.get(name);
    this.flags.set(name, {
      enabled,
      rolloutPercent: rolloutPercent ?? existing?.rolloutPercent ?? 100,
      description: existing?.description ?? '',
    });
  }

  /**
   * Get all flags as a record.
   */
  getAllFlags(): Record<string, FlagValue> {
    const result: Record<string, FlagValue> = {};
    for (const [key, value] of this.flags.entries()) {
      result[key] = { ...value };
    }
    return result;
  }

  /**
   * Check if a flag is enabled, optionally with rollout percentage check using user ID hash.
   *
   * FR-151.A1: Accepts an optional context for per-role/region/env scoping.
   * If scoping arrays (allowedRoles, allowedRegions, allowedEnvs) are defined on the flag,
   * the corresponding context value must be present in the array for the flag to be enabled.
   *
   * For backward compatibility, the second parameter also accepts a plain userId string.
   */
  isEnabled(name: string, userId?: string): boolean;
  isEnabled(name: string, context?: { userId?: string; role?: string; region?: string; env?: string }): boolean;
  isEnabled(
    name: string,
    contextOrUserId?: string | { userId?: string; role?: string; region?: string; env?: string },
  ): boolean {
    const flag = this.flags.get(name);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // Normalize the second parameter: plain string is treated as userId
    const context: { userId?: string; role?: string; region?: string; env?: string } | undefined =
      typeof contextOrUserId === 'string'
        ? { userId: contextOrUserId }
        : contextOrUserId;

    // FR-151.A1: Per-env scoping
    if (flag.allowedEnvs && flag.allowedEnvs.length > 0) {
      if (!context?.env || !flag.allowedEnvs.includes(context.env)) {
        return false;
      }
    }

    // FR-151.A1: Per-role scoping
    if (flag.allowedRoles && flag.allowedRoles.length > 0) {
      if (!context?.role || !flag.allowedRoles.includes(context.role)) {
        return false;
      }
    }

    // FR-151.A1: Per-region scoping
    if (flag.allowedRegions && flag.allowedRegions.length > 0) {
      if (!context?.region || !flag.allowedRegions.includes(context.region)) {
        return false;
      }
    }

    if (flag.rolloutPercent >= 100) return true;
    if (flag.rolloutPercent <= 0) return false;

    const userId = context?.userId;
    if (!userId) {
      // Without a userId, check only the enabled state
      return flag.enabled;
    }

    // Deterministic rollout check using hash of userId + flagName
    const hash = createHash('sha256')
      .update(`${userId}:${name}`)
      .digest('hex');
    // Take first 8 hex chars and convert to a number in [0, 100)
    const bucket = parseInt(hash.substring(0, 8), 16) % 100;
    return bucket < flag.rolloutPercent;
  }

  /**
   * Seed default feature flags.
   */
  private seedDefaults(): void {
    this.flags.set('llm_classification', {
      enabled: true,
      rolloutPercent: 100,
      description: 'Enable LLM-augmented classification (ON/DEGRADED/OFF modes)',
    });
    this.flags.set('auto_routing', {
      enabled: true,
      rolloutPercent: 100,
      description: 'Automatically route cases to FPR based on classification',
    });
    this.flags.set('vendor_auto_dispatch', {
      enabled: false,
      rolloutPercent: 0,
      description: 'Auto-dispatch to vendor after FPR approval',
    });
    this.flags.set('predictive_breach', {
      enabled: false,
      rolloutPercent: 0,
      description: 'ML-based prediction of SLA breaches before they occur',
    });
    this.flags.set('suggested_replies', {
      enabled: true,
      rolloutPercent: 50,
      description: 'AI-generated reply suggestions for officers',
    });
    this.flags.set('dark_mode', {
      enabled: true,
      rolloutPercent: 100,
      description: 'Enable dark mode UI theme',
    });
  }
}
