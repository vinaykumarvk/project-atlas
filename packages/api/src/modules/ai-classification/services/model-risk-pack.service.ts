import { Injectable, Logger } from '@nestjs/common';
import { ModelRegistryService } from '../config/model-registry';
import { ModelPromotionService } from './model-promotion.service';
import { DriftMonitorService } from './drift-monitor.service';
import { AccuracyTrendService } from './accuracy-trend.service';
import { EntityF1Service } from './entity-f1.service';
import { BiasCheckService } from './bias-check.service';

/**
 * RACI matrix entry for model risk governance.
 */
export interface RaciMatrix {
  owner: string;
  reviewer: string;
  approver: string;
  informed: string;
}

/**
 * Benchmark snapshot of the current model.
 */
export interface BenchmarkSnapshot {
  modelVersion: string;
  corpusHash: string;
  corpusSize: number;
  snapshotDate: string;
}

/**
 * Champion vs Challenger comparison.
 */
export interface ChampionChallenger {
  champion: {
    version: string;
    accuracy: number;
    status: string;
  } | null;
  challenger: {
    version: string;
    accuracy: number;
    status: string;
  } | null;
}

/**
 * Kill-switch criterion evaluation.
 */
export interface KillSwitchCriterion {
  name: string;
  threshold: string;
  currentValue: string;
  triggered: boolean;
}

/**
 * Board/risk committee summary.
 */
export interface BoardSummary {
  modelName: string;
  modelVersion: string;
  accuracy: number;
  riskClassification: string;
  driftStatus: string;
  recommendation: 'CONTINUE' | 'REVIEW' | 'HALT';
}

/**
 * Full model risk pack.
 */
export interface ModelRiskPack {
  generatedAt: string;
  raci: RaciMatrix;
  benchmark: BenchmarkSnapshot;
  monthlyReview: {
    accuracyTrend: Array<{ week: string; accuracy: number; totalPredictions: number }>;
    driftReport: {
      confidenceDriftAlert: boolean;
      psiScore: number | null;
    };
  };
  championChallenger: ChampionChallenger;
  killSwitch: {
    triggered: boolean;
    criteria: KillSwitchCriterion[];
  };
  boardSummary: BoardSummary;
  entityF1Summary: Record<string, { precision: number; recall: number; f1: number }>;
  biasReport: {
    maxDisparityPercent: number;
    fairnessPass: boolean;
  };
}

/**
 * FR-159: Model Risk Operating Pack Service.
 *
 * Generates a comprehensive model risk pack including:
 * - RACI matrix for label ownership
 * - Immutable benchmark set
 * - Monthly accuracy/drift review
 * - Champion/challenger comparison
 * - Kill-switch criteria evaluation
 * - Board/risk committee summary
 */
@Injectable()
export class ModelRiskPackService {
  private readonly logger = new Logger(ModelRiskPackService.name);

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly modelPromotion: ModelPromotionService,
    private readonly driftMonitor: DriftMonitorService,
    private readonly accuracyTrend: AccuracyTrendService,
    private readonly entityF1: EntityF1Service,
    private readonly biasCheck: BiasCheckService,
  ) {}

  /**
   * Get the RACI matrix (configurable via MODEL_RISK_RACI env).
   */
  getRaciMatrix(): RaciMatrix {
    const envRaci = process.env.MODEL_RISK_RACI;
    if (envRaci) {
      try {
        return JSON.parse(envRaci);
      } catch {
        this.logger.warn('Failed to parse MODEL_RISK_RACI env; using defaults.');
      }
    }
    return {
      owner: 'Data Science Lead',
      reviewer: 'MLOps Team',
      approver: 'Risk Committee',
      informed: 'Board/CRO',
    };
  }

  /**
   * Evaluate kill-switch criteria.
   *
   * Triggers if:
   * - Accuracy < 75% for 2+ consecutive weeks
   * - PSI > 0.2
   * - Bias disparity > 15%
   */
  getKillSwitchStatus(): { triggered: boolean; criteria: KillSwitchCriterion[] } {
    const criteria: KillSwitchCriterion[] = [];

    // 1. Accuracy check (last 2 weeks)
    const trend = this.accuracyTrend.getWeeklyTrend(2);
    const lowAccuracyWeeks = trend.filter((w) => w.accuracy < 75);
    const accuracyTriggered = lowAccuracyWeeks.length >= 2;
    const latestAccuracy = trend.length > 0 ? trend[trend.length - 1].accuracy : 100;
    criteria.push({
      name: 'accuracy_below_75_2_weeks',
      threshold: '< 75% for 2 consecutive weeks',
      currentValue: `${latestAccuracy}% (${lowAccuracyWeeks.length} weeks below)`,
      triggered: accuracyTriggered,
    });

    // 2. PSI check
    const driftReport = this.driftMonitor.getWeeklyReport();
    const psiScore = driftReport.psiScore ?? 0;
    const psiTriggered = psiScore > 0.2;
    criteria.push({
      name: 'psi_above_0.2',
      threshold: '> 0.2',
      currentValue: psiScore.toFixed(4),
      triggered: psiTriggered,
    });

    // 3. Bias disparity check
    const biasReport = this.biasCheck.generateReport(['region', 'language']);
    const biasTriggered = biasReport.maxDisparityPercent > 15;
    criteria.push({
      name: 'bias_disparity_above_15',
      threshold: '> 15%',
      currentValue: `${biasReport.maxDisparityPercent.toFixed(1)}%`,
      triggered: biasTriggered,
    });

    const triggered = accuracyTriggered || psiTriggered || biasTriggered;

    return { triggered, criteria };
  }

  /**
   * Generate the full model risk pack.
   */
  generateModelRiskPack(): ModelRiskPack {
    const now = new Date().toISOString();
    const raci = this.getRaciMatrix();

    // Benchmark snapshot
    const currentModel = this.modelRegistry.getCurrentModel();
    const benchmark: BenchmarkSnapshot = {
      modelVersion: currentModel?.version ?? 'unknown',
      corpusHash: currentModel?.training_data_hash ?? 'unknown',
      corpusSize: currentModel?.corpus_size ?? 0,
      snapshotDate: now,
    };

    // Monthly review (last 4 weeks)
    const accuracyTrendData = this.accuracyTrend.getWeeklyTrend(4);
    const driftReport = this.driftMonitor.getWeeklyReport();

    // Champion/challenger comparison
    const currentProduction = this.modelPromotion.getCurrentProduction();
    const allModels = this.modelRegistry.getAllModels();
    const candidateModel = allModels.find(
      (m) => m.version !== (currentModel?.version ?? '') && m.version !== currentProduction?.version,
    );

    const championChallenger: ChampionChallenger = {
      champion: currentModel
        ? {
            version: currentModel.version,
            accuracy: currentModel.accuracy,
            status: currentProduction?.status ?? 'PROMOTED',
          }
        : null,
      challenger: candidateModel
        ? {
            version: candidateModel.version,
            accuracy: candidateModel.accuracy,
            status: 'CANDIDATE',
          }
        : null,
    };

    // Kill-switch
    const killSwitch = this.getKillSwitchStatus();

    // Entity F1 summary
    const entityF1Summary = this.entityF1.getAllMetrics();

    // Bias report
    const biasReport = this.biasCheck.generateReport(['region', 'language']);

    // Board summary
    const overallAccuracy = this.accuracyTrend.getOverallAccuracy();
    let recommendation: 'CONTINUE' | 'REVIEW' | 'HALT' = 'CONTINUE';
    if (killSwitch.triggered) {
      recommendation = 'HALT';
    } else if (
      driftReport.confidenceDriftAlert ||
      overallAccuracy.accuracy < 80 ||
      !biasReport.fairnessPass
    ) {
      recommendation = 'REVIEW';
    }

    const boardSummary: BoardSummary = {
      modelName: currentModel?.name ?? 'unknown',
      modelVersion: currentModel?.version ?? 'unknown',
      accuracy: overallAccuracy.accuracy,
      riskClassification: currentModel?.risk_classification ?? 'MEDIUM',
      driftStatus: driftReport.confidenceDriftAlert ? 'DRIFT_DETECTED' : 'STABLE',
      recommendation,
    };

    return {
      generatedAt: now,
      raci,
      benchmark,
      monthlyReview: {
        accuracyTrend: accuracyTrendData,
        driftReport: {
          confidenceDriftAlert: driftReport.confidenceDriftAlert,
          psiScore: driftReport.psiScore,
        },
      },
      championChallenger,
      killSwitch,
      boardSummary,
      entityF1Summary,
      biasReport: {
        maxDisparityPercent: biasReport.maxDisparityPercent,
        fairnessPass: biasReport.fairnessPass,
      },
    };
  }
}
