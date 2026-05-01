import { Injectable, Logger } from '@nestjs/common';
import { LlmMode } from '../types';

/**
 * Valid LLM_ENABLED environment variable values.
 */
const VALID_MODES: readonly LlmMode[] = ['ON', 'DEGRADED', 'OFF'] as const;

/**
 * Default mode when LLM_ENABLED is not set.
 */
const DEFAULT_MODE: LlmMode = 'ON';

/**
 * Read the LLM_ENABLED environment variable and resolve to an LlmMode.
 *
 * Behaviour per mode:
 *  - ON       : Full pipeline -- ONNX distilled classifier + LLM augmentation.
 *  - DEGRADED : ONNX only, no LLM calls are made.
 *  - OFF      : Skip classification entirely; route to manual triage.
 *
 * The value is case-insensitive (e.g. "on", "On", "ON" all resolve to 'ON').
 * If the variable is absent the default is 'ON'.
 * If the variable contains an unrecognised value a warning is logged and the
 * default ('ON') is returned.
 */
export function getLlmMode(): LlmMode {
  const raw = process.env.LLM_ENABLED;

  if (raw === undefined || raw === '') {
    return DEFAULT_MODE;
  }

  const normalised = raw.trim().toUpperCase() as LlmMode;

  if (VALID_MODES.includes(normalised)) {
    return normalised;
  }

  // Cannot use NestJS Logger statically here -- fall back to console.
  // eslint-disable-next-line no-console
  console.warn(
    `[LlmModeConfig] Unrecognised LLM_ENABLED value "${raw}". ` +
      `Expected one of: ${VALID_MODES.join(', ')}. Defaulting to "${DEFAULT_MODE}".`,
  );
  return DEFAULT_MODE;
}

/**
 * NestJS Injectable that exposes the resolved LLM mode.
 *
 * The mode is resolved once at construction time (i.e. when the DI container
 * instantiates this provider) so that every consumer sees a consistent value
 * for the lifetime of the application.
 *
 * Usage:
 * ```ts
 * constructor(private readonly llmModeConfig: LlmModeConfig) {}
 *
 * doWork() {
 *   if (this.llmModeConfig.mode === 'OFF') { ... }
 * }
 * ```
 */
/**
 * FR-128.A3: Accuracy floor below which LLM_OFF mode should be flagged.
 * If ONNX-only accuracy drops below 80%, the system should alert operators
 * to consider switching back to full LLM mode or triggering a manual drill.
 */
export let LLM_OFF_ACCURACY_FLOOR = 80;

@Injectable()
export class LlmModeConfig {
  private readonly logger = new Logger(LlmModeConfig.name);

  /** The resolved LLM mode for this application instance. */
  readonly mode: LlmMode;

  /** Stores the last known drill date (ISO string). */
  private nextDrillDate: string | null = null;

  constructor() {
    this.mode = getLlmMode();
    this.logger.log(`LLM mode resolved to: ${this.mode}`);
  }

  /** Whether the full pipeline (ONNX + LLM) should run. */
  get isFullPipeline(): boolean {
    return this.mode === 'ON';
  }

  /** Whether the pipeline should run in ONNX-only mode (no LLM calls). */
  get isDegraded(): boolean {
    return this.mode === 'DEGRADED';
  }

  /** Whether classification should be skipped entirely (manual triage). */
  get isOff(): boolean {
    return this.mode === 'OFF';
  }

  /**
   * FR-128.A3: Get the current accuracy floor.
   */
  getAccuracyFloor(): number {
    return LLM_OFF_ACCURACY_FLOOR;
  }

  /**
   * FR-128.A3: Tighten the accuracy floor by raising it to a new value.
   * The new floor must be strictly greater than the current floor.
   *
   * @param newFloor - The new accuracy floor percentage (0-100)
   * @throws Error if newFloor is not greater than the current floor
   */
  tightenAccuracyFloor(newFloor: number): void {
    if (newFloor <= LLM_OFF_ACCURACY_FLOOR) {
      throw new Error(
        `New accuracy floor (${newFloor}) must be greater than current floor (${LLM_OFF_ACCURACY_FLOOR})`,
      );
    }
    this.logger.log(
      `Tightening accuracy floor: ${LLM_OFF_ACCURACY_FLOOR} -> ${newFloor}`,
    );
    LLM_OFF_ACCURACY_FLOOR = newFloor;
  }

  /**
   * FR-128.A3: Get the effective mode, taking into account accuracy floor validation.
   * If the mode is OFF and accuracy is below the floor, returns a warning alongside the mode.
   *
   * @param currentAccuracy - The current classification accuracy percentage (0-100)
   * @returns The effective mode and whether accuracy is below the floor
   */
  getEffectiveMode(currentAccuracy?: number): {
    mode: LlmMode;
    belowAccuracyFloor: boolean;
    accuracyFloor: number;
  } {
    const belowFloor =
      currentAccuracy !== undefined && currentAccuracy < LLM_OFF_ACCURACY_FLOOR;

    if (belowFloor) {
      this.logger.warn(
        `Accuracy ${currentAccuracy}% is below the LLM_OFF floor of ${LLM_OFF_ACCURACY_FLOOR}%. ` +
          `Consider switching to DEGRADED or ON mode.`,
      );
    }

    return {
      mode: this.mode,
      belowAccuracyFloor: belowFloor,
      accuracyFloor: LLM_OFF_ACCURACY_FLOOR,
    };
  }

  /**
   * FR-128.A3: Get the next scheduled LLM drill date.
   * Drills verify that the system can function correctly with LLM disabled.
   */
  getNextDrillDate(): string | null {
    if (this.nextDrillDate) {
      return this.nextDrillDate;
    }

    // Default: schedule a drill for the first Sunday of the next month
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    // Find the first Sunday
    while (nextMonth.getDay() !== 0) {
      nextMonth.setDate(nextMonth.getDate() + 1);
    }
    nextMonth.setHours(3, 0, 0, 0); // 3 AM
    this.nextDrillDate = nextMonth.toISOString();
    return this.nextDrillDate;
  }

  /**
   * FR-128.A3: Trigger an LLM-off drill.
   * Records the drill execution and returns a summary.
   */
  triggerDrill(): {
    drillId: string;
    startedAt: string;
    mode: LlmMode;
    accuracyFloor: number;
  } {
    const drillId = `drill-${Date.now()}`;
    const startedAt = new Date().toISOString();

    this.logger.log(
      `LLM-off drill triggered: drillId=${drillId}, currentMode=${this.mode}`,
    );

    // Schedule next drill
    const nextDrill = new Date();
    nextDrill.setMonth(nextDrill.getMonth() + 1);
    while (nextDrill.getDay() !== 0) {
      nextDrill.setDate(nextDrill.getDate() + 1);
    }
    nextDrill.setHours(3, 0, 0, 0);
    this.nextDrillDate = nextDrill.toISOString();

    return {
      drillId,
      startedAt,
      mode: this.mode,
      accuracyFloor: LLM_OFF_ACCURACY_FLOOR,
    };
  }
}
