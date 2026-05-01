import { Injectable, Logger } from '@nestjs/common';
import { ClassificationLabel, EmailInput } from '../types';
import { OnnxDistilledClassifier } from './onnx-distilled.classifier';

/**
 * Distilled classifier with ONNX model support.
 * Uses fine-tuned DistilBERT ONNX model when available,
 * falls back to keyword-based classification otherwise.
 */
@Injectable()
export class DistilledClassifier {
  private readonly logger = new Logger(DistilledClassifier.name);
  private onnxClassifier: OnnxDistilledClassifier | null = null;
  private onnxInitialized = false;

  private readonly labelKeywords: Record<string, string[]> = {
    VALUATION_REQUEST: ['valuation', 'property valuation', 'valuation report', 'appraisal'],
    LEGAL_OPINION: ['legal opinion', 'legal', 'advocate', 'court', 'litigation'],
    TITLE_SEARCH: ['title', 'title search', 'title clear', 'title deed', 'ownership'],
    INSURANCE_RENEWAL: ['insurance', 'renewal', 'premium', 'policy renewal', 'coverage'],
    RELEASE_OF_COLLATERAL: ['release', 'collateral', 'noc', 'no objection', 'release of charge'],
    SITE_VISIT: ['site visit', 'inspection', 'field visit', 'physical verification', 'survey'],
    DOCUMENT_COLLECTION: ['document', 'collect', 'documents required', 'pending documents', 'submission'],
    GENERAL_INQUIRY: ['query', 'information', 'status', 'update', 'help'],
  };

  private readonly allLabels = Object.keys(this.labelKeywords);

  /**
   * Initialize the ONNX model. Call this before classify() for ONNX support.
   */
  async initOnnx(): Promise<void> {
    if (this.onnxInitialized) return;
    this.onnxInitialized = true;

    try {
      this.onnxClassifier = new OnnxDistilledClassifier();
      await this.onnxClassifier.loadModel();
      if (this.onnxClassifier.isReady()) {
        this.logger.log('ONNX model loaded — using DistilBERT for classification');
      } else {
        this.onnxClassifier = null;
        this.logger.warn('ONNX model not available — using keyword fallback');
      }
    } catch {
      this.onnxClassifier = null;
      this.logger.warn('ONNX model failed to load — using keyword fallback');
    }
  }

  /**
   * Classify an email input. Uses ONNX model if available, else keyword fallback.
   */
  async classify(email: EmailInput): Promise<ClassificationLabel[]> {
    if (this.onnxClassifier?.isReady()) {
      return this.onnxClassifier.classify(email);
    }
    return this.keywordClassify(email);
  }

  /**
   * Keyword-based fallback classifier.
   */
  private keywordClassify(email: EmailInput): ClassificationLabel[] {
    const text = `${email.subject} ${email.body}`.toLowerCase();

    const rawScores: Record<string, number> = {};
    for (const label of this.allLabels) {
      rawScores[label] = this.computeRawScore(text, label);
    }

    const labels = this.applySoftmax(rawScores);
    return labels.slice(0, 5);
  }

  private computeRawScore(text: string, label: string): number {
    const keywords = this.labelKeywords[label];
    let score = 0.1;

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score += 1.0 + keyword.length * 0.1;
      }
    }

    return score;
  }

  private applySoftmax(rawScores: Record<string, number>): ClassificationLabel[] {
    const labels = Object.keys(rawScores);
    const scores = labels.map((l) => rawScores[l]);

    const maxScore = Math.max(...scores);
    const temperature = 0.5;
    const expScores = scores.map((s) => Math.exp((s - maxScore) / temperature));
    const sumExp = expScores.reduce((a, b) => a + b, 0);

    const results: ClassificationLabel[] = labels.map((label, i) => {
      const confidence = expScores[i] / sumExp;
      return { label, confidence };
    });

    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }
}
