import { Injectable, Logger } from '@nestjs/common';
import { ConfidenceBand } from '../types';

/**
 * Threshold configuration for confidence band assignment.
 */
interface BandThresholds {
  green: number;   // >= this value -> GREEN
  amber: number;   // >= this value -> AMBER
  red: number;     // >= this value -> RED
  // < red -> RED_MANUAL
}

/**
 * Read a numeric threshold from an environment variable, falling back to the
 * supplied default.  Returns the default if the env var is absent, empty, or
 * not a valid number.
 */
function envThreshold(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Service to assign confidence bands based on classification confidence scores.
 *
 * Default thresholds are calibrated for the ONNX DistilBERT softmax distribution
 * which produces lower absolute scores than a fused ONNX+LLM pipeline.
 *
 * Bands determine the level of human review required:
 * - GREEN: Auto-route (no human review needed)
 * - AMBER: Glance-confirm (quick human verification)
 * - RED: Triage review required
 * - RED_MANUAL: Full manual review required
 */
@Injectable()
export class ConfidenceBandService {
  private readonly logger = new Logger(ConfidenceBandService.name);

  /**
   * Default thresholds calibrated for ONNX softmax distributions.
   * Override via environment variables:
   *   CONFIDENCE_BAND_GREEN, CONFIDENCE_BAND_AMBER, CONFIDENCE_BAND_RED
   */
  private readonly defaultThresholds: BandThresholds = {
    green: envThreshold('CONFIDENCE_BAND_GREEN', 0.40),
    amber: envThreshold('CONFIDENCE_BAND_AMBER', 0.20),
    red: envThreshold('CONFIDENCE_BAND_RED', 0.10),
  };

  /**
   * Per-case-type threshold overrides.
   * Some case types may require higher confidence for auto-routing.
   * These are also scaled down proportionally for the ONNX model.
   */
  private readonly caseTypeThresholds: Record<string, BandThresholds> = {
    RELEASE_OF_COLLATERAL: {
      green: 0.55,  // Higher threshold for collateral release (high-risk action)
      amber: 0.30,
      red: 0.15,
    },
    LEGAL_OPINION: {
      green: 0.50,  // Legal matters need higher confidence
      amber: 0.28,
      red: 0.12,
    },
    GENERAL_INQUIRY: {
      green: 0.35,  // Lower threshold for general inquiries
      amber: 0.18,
      red: 0.08,
    },
  };

  constructor() {
    this.logger.log(
      `Confidence band thresholds: GREEN >= ${this.defaultThresholds.green}, ` +
      `AMBER >= ${this.defaultThresholds.amber}, RED >= ${this.defaultThresholds.red}`,
    );
  }

  /**
   * Assign a confidence band based on the confidence score and optional case type.
   */
  assignBand(confidence: number, caseType?: string): ConfidenceBand {
    const thresholds = this.getThresholds(caseType);

    if (confidence >= thresholds.green) {
      return 'GREEN';
    } else if (confidence >= thresholds.amber) {
      return 'AMBER';
    } else if (confidence >= thresholds.red) {
      return 'RED';
    } else {
      return 'RED_MANUAL';
    }
  }

  /**
   * Determine whether human review is required based on the confidence band.
   */
  requiresHumanReview(band: ConfidenceBand): boolean {
    return band !== 'GREEN';
  }

  /**
   * Get the current default thresholds (useful for diagnostics / tests).
   */
  getDefaultThresholds(): Readonly<BandThresholds> {
    return { ...this.defaultThresholds };
  }

  /**
   * Get thresholds for a given case type, falling back to defaults.
   */
  private getThresholds(caseType?: string): BandThresholds {
    if (caseType && this.caseTypeThresholds[caseType]) {
      return this.caseTypeThresholds[caseType];
    }
    return this.defaultThresholds;
  }
}
