-- Phase 2: Collateral Intelligence columns on the cases table.
-- These nullable columns support the collateral-intelligence scoring pipeline
-- introduced in Phase 2 (FR-035+).

-- collateral_risk_score: Composite risk score from the CI engine (0.0–1.0)
ALTER TABLE "cases"
  ADD COLUMN IF NOT EXISTS "collateral_risk_score" DOUBLE PRECISION;

-- disbursal_blocker_category: Category of disbursal blocker detected (e.g. TITLE_DEFECT, VALUATION_GAP)
ALTER TABLE "cases"
  ADD COLUMN IF NOT EXISTS "disbursal_blocker_category" VARCHAR(100);

-- document_completeness_percent: Percentage of required documents received (0.0–100.0)
ALTER TABLE "cases"
  ADD COLUMN IF NOT EXISTS "document_completeness_percent" DOUBLE PRECISION;

-- vendor_quality_score: Quality score for the assigned vendor on this case (0.0–5.0)
ALTER TABLE "cases"
  ADD COLUMN IF NOT EXISTS "vendor_quality_score" DOUBLE PRECISION;

-- valuation_variance_flag: True when the valuation deviates beyond threshold from the benchmark
ALTER TABLE "cases"
  ADD COLUMN IF NOT EXISTS "valuation_variance_flag" BOOLEAN;
