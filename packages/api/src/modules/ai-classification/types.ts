/**
 * Shared types for the AI Classification module.
 */

export interface ExtractedEntity {
  entity_type: string;
  value: string;
  start_offset: number;
  end_offset: number;
  confidence: number;
  /** Indicates which extraction path produced this entity. */
  entity_source?: 'rule_based' | 'llm_fallback';
}

export interface ValidationOutcome {
  field: string;
  outcome: 'PASS' | 'FUZZY_MATCH' | 'FAIL';
  original_value: string;
  resolved_value?: string;
  candidates?: string[];
}

export interface ClassificationResult {
  top_label: string;
  top_confidence: number;
  alternatives: { label: string; confidence: number }[];
  rationale?: string;
  entities: ExtractedEntity[];
  validation_outcomes: ValidationOutcome[];
  confidence_band: 'GREEN' | 'AMBER' | 'RED' | 'RED_MANUAL';
  requires_human_review: boolean;
  sentiment?: string;
  urgency_signal?: string;
  summary?: { bullets: string[]; source_spans: { start: number; end: number }[] };
  llm_mode: string;
  inference_ms: number;
  /** Which classification path was used: onnx_only or onnx_llm_augmented. */
  classification_path?: 'onnx_only' | 'onnx_llm_augmented';
  /** Model version identifier from the model registry. */
  model_version?: string;
  /** Priority override from sender domain rules (if matched). */
  priority_override?: string;
  /** Source of the priority override. */
  priority_override_source?: string;
  /** FR-016.A1: Set to true when validation gate fails, skipping autonomous routing. */
  requiresManualTriage?: boolean;
  /** FR-010.BR: True when region-level data residency was enforced for LLM calls. */
  regionEnforced?: boolean;
  /** FR-010.BR: The LLM endpoint region used, if region enforcement was active. */
  llmEndpointRegion?: string;
  /** FR-010.A2: Multi-label classification results. */
  labels?: string[];
}

export interface ClassificationLabel {
  label: string;
  confidence: number;
}

export interface LlmClassificationResult {
  label: string;
  confidence: number;
  rationale: string;
}

export interface EmailInput {
  subject: string;
  body: string;
  threadContext?: string;
  /** Sender email address for domain-based priority rules. */
  senderEmail?: string;
}

export type ConfidenceBand = 'GREEN' | 'AMBER' | 'RED' | 'RED_MANUAL';

export type LlmMode = 'ON' | 'DEGRADED' | 'OFF';

export interface SummarisationResult {
  bullets: string[];
  source_spans: { start: number; end: number }[];
}
