-- AlterTable: Add canonical_form and source_forms to property_location_masters
ALTER TABLE "property_location_masters"
  ADD COLUMN IF NOT EXISTS "canonical_form" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "source_forms" VARCHAR(200)[] DEFAULT '{}';

-- AlterTable: Add canonical_form and source_forms to case_type_masters
ALTER TABLE "case_type_masters"
  ADD COLUMN IF NOT EXISTS "canonical_form" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "source_forms" VARCHAR(200)[] DEFAULT '{}';

-- AlterTable: Add canonical_form and source_forms to fpr_masters
ALTER TABLE "fpr_masters"
  ADD COLUMN IF NOT EXISTS "canonical_form" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "source_forms" VARCHAR(200)[] DEFAULT '{}';

-- AlterTable: Add canonical_form and source_forms to vendor_masters
ALTER TABLE "vendor_masters"
  ADD COLUMN IF NOT EXISTS "canonical_form" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "source_forms" VARCHAR(200)[] DEFAULT '{}';

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "property_location_masters_canonical_form_idx"
  ON "property_location_masters"("canonical_form");

CREATE INDEX IF NOT EXISTS "case_type_masters_canonical_form_idx"
  ON "case_type_masters"("canonical_form");

CREATE INDEX IF NOT EXISTS "fpr_masters_canonical_form_idx"
  ON "fpr_masters"("canonical_form");

CREATE INDEX IF NOT EXISTS "vendor_masters_canonical_form_idx"
  ON "vendor_masters"("canonical_form");
