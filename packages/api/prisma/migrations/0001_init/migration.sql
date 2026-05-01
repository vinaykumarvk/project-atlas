-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(256),
    "idp_subject" VARCHAR(256),
    "phone" VARCHAR(20),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "region" VARCHAR(50),
    "preferences_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "permissions_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "region" VARCHAR(50),
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_ingests" (
    "id" UUID NOT NULL,
    "message_id" VARCHAR(998) NOT NULL,
    "from_address" VARCHAR(320) NOT NULL,
    "to_addresses" VARCHAR(320)[],
    "cc_addresses" VARCHAR(320)[],
    "subject" TEXT NOT NULL,
    "body_text" TEXT,
    "body_html" TEXT,
    "received_at" TIMESTAMPTZ NOT NULL,
    "ingest_status" VARCHAR(30) NOT NULL,
    "language_detected" VARCHAR(10),
    "spf_verdict" VARCHAR(20),
    "dkim_verdict" VARCHAR(20),
    "dmarc_verdict" VARCHAR(20),
    "phishing_score" DOUBLE PRECISION,
    "spam_score" DOUBLE PRECISION,
    "in_reply_to" VARCHAR(998),
    "references" VARCHAR(998)[],
    "thread_context" TEXT,
    "rfc822_s3_key" VARCHAR(512),
    "rfc822_checksum" VARCHAR(128),
    "size_bytes" INTEGER,
    "source_mailbox" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "email_ingests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "case_number" VARCHAR(20) NOT NULL,
    "email_ingest_id" UUID,
    "case_type" VARCHAR(50) NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "status" VARCHAR(30) NOT NULL DEFAULT 'NEW',
    "confidence_band" VARCHAR(20),
    "requires_human_review" BOOLEAN NOT NULL DEFAULT false,
    "loan_account_no" VARCHAR(50),
    "customer_name" VARCHAR(200),
    "property_address" TEXT,
    "property_pin" VARCHAR(10),
    "property_city" VARCHAR(100),
    "property_geo" VARCHAR(50),
    "monetary_amount" DECIMAL(18,2),
    "due_date" DATE,
    "reference_number" VARCHAR(100),
    "contact_phone" VARCHAR(20),
    "assigned_fpr_id" UUID,
    "assigned_vendor_id" UUID,
    "assigned_officer_id" UUID,
    "routing_rationale" TEXT,
    "tat_target_at" TIMESTAMPTZ,
    "tat_paused_total_seconds" INTEGER NOT NULL DEFAULT 0,
    "tat_paused_at" TIMESTAMPTZ,
    "sla_breach_at" TIMESTAMPTZ,
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "resolution_code" VARCHAR(50),
    "resolution_summary" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "ai_summary" TEXT,
    "sentiment" VARCHAR(20),
    "urgency_signal" VARCHAR(50),
    "thread_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_links" (
    "id" UUID NOT NULL,
    "case_from_id" UUID NOT NULL,
    "case_to_id" UUID NOT NULL,
    "link_type" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "case_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_attachments" (
    "id" UUID NOT NULL,
    "case_id" UUID,
    "email_ingest_id" UUID,
    "filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "s3_key" VARCHAR(512) NOT NULL,
    "checksum_sha256" VARCHAR(64) NOT NULL,
    "document_type" VARCHAR(50),
    "doc_type_confidence" DOUBLE PRECISION,
    "ocr_text" TEXT,
    "ocr_confidence" DOUBLE PRECISION,
    "extracted_fields_json" JSONB,
    "av_scan_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "av_scanned_at" TIMESTAMPTZ,
    "dms_external_id" VARCHAR(256),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "case_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_activity_logs" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "action_code" VARCHAR(50) NOT NULL,
    "actor_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL DEFAULT 'USER',
    "payload_json" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_location_masters" (
    "id" UUID NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "zone" VARCHAR(50),
    "circle" VARCHAR(50),
    "pin_from" VARCHAR(10) NOT NULL,
    "pin_to" VARCHAR(10) NOT NULL,
    "default_fpr_id" UUID,
    "region" VARCHAR(50),
    "canonical_form" VARCHAR(200),
    "source_forms" VARCHAR(200)[],
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "property_location_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_type_masters" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "default_priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "default_owner_role" VARCHAR(50) NOT NULL,
    "required_skills" VARCHAR(50)[],
    "confidence_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "canonical_form" VARCHAR(200),
    "source_forms" VARCHAR(200)[],
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "case_type_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fpr_masters" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_code" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "region_ids" VARCHAR(50)[],
    "skills" VARCHAR(50)[],
    "capacity_per_day" INTEGER NOT NULL DEFAULT 10,
    "is_ooo" BOOLEAN NOT NULL DEFAULT false,
    "ooo_delegate_id" UUID,
    "supervisor_id" UUID,
    "canonical_form" VARCHAR(200),
    "source_forms" VARCHAR(200)[],
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fpr_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_masters" (
    "id" UUID NOT NULL,
    "vendor_code" VARCHAR(50) NOT NULL,
    "vendor_name" VARCHAR(200) NOT NULL,
    "vendor_category" VARCHAR(50) NOT NULL,
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(20),
    "service_geographies" VARCHAR(100)[],
    "service_case_types" VARCHAR(50)[],
    "contracted_tat_hours" INTEGER,
    "scorecard_quality" DOUBLE PRECISION DEFAULT 0,
    "on_time_response_rate" DOUBLE PRECISION DEFAULT 0,
    "canonical_form" VARCHAR(200),
    "source_forms" VARCHAR(200)[],
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tat_masters" (
    "id" UUID NOT NULL,
    "case_type" VARCHAR(50) NOT NULL,
    "priority" VARCHAR(20) NOT NULL,
    "stage" VARCHAR(50) NOT NULL,
    "target_hours_business" INTEGER NOT NULL,
    "warn_at_percent" INTEGER NOT NULL DEFAULT 80,
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tat_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_hierarchy_masters" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "level" INTEGER NOT NULL,
    "delay_after_breach_hrs" INTEGER NOT NULL DEFAULT 0,
    "recipient_role" VARCHAR(50) NOT NULL,
    "recipient_user_id" UUID,
    "channels" VARCHAR(20)[],
    "repeat_every_hrs" INTEGER,
    "stop_on_action" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "escalation_hierarchy_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_calendar_masters" (
    "id" UUID NOT NULL,
    "region" VARCHAR(50) NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "holiday_calendar_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hours_masters" (
    "id" UUID NOT NULL,
    "region" VARCHAR(50) NOT NULL,
    "day_of_week" VARCHAR(3) NOT NULL,
    "open_time" VARCHAR(5) NOT NULL,
    "close_time" VARCHAR(5) NOT NULL,
    "is_working" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "business_hours_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(500),
    "body_template" TEXT NOT NULL,
    "language" VARCHAR(5) NOT NULL DEFAULT 'en',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "template_code" VARCHAR(50),
    "subject" VARCHAR(500),
    "body_preview" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_detail" TEXT,
    "external_id" VARCHAR(256),
    "case_id" UUID,
    "triggered_by" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_classification_results" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "model_name" VARCHAR(100) NOT NULL,
    "model_version" VARCHAR(50) NOT NULL,
    "llm_mode" VARCHAR(10) NOT NULL,
    "top_label" VARCHAR(50) NOT NULL,
    "top_confidence" DOUBLE PRECISION NOT NULL,
    "alternatives_json" JSONB NOT NULL,
    "rationale_text" TEXT,
    "extracted_entities_json" JSONB,
    "validation_outcomes_json" JSONB,
    "sentiment" VARCHAR(20),
    "urgency_signal" VARCHAR(50),
    "inference_ms" INTEGER,
    "token_count" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_classification_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggested_reply_drafts" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PROPOSED',
    "edited_body" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ,
    "approved_by" UUID,

    CONSTRAINT "suggested_reply_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pendency_report_schedules" (
    "id" UUID NOT NULL,
    "recipient_role" VARCHAR(50) NOT NULL,
    "recipient_id" UUID,
    "cron_expression" VARCHAR(50) NOT NULL,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    "channels" VARCHAR(20)[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pendency_report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "event_code" VARCHAR(50) NOT NULL,
    "actor_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL DEFAULT 'USER',
    "resource_type" VARCHAR(50),
    "resource_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "payload_json" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "prev_hash" VARCHAR(64),
    "row_hash" VARCHAR(64) NOT NULL,
    "ai_confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_ledger" (
    "id" UUID NOT NULL,
    "data_subject_id" VARCHAR(200) NOT NULL,
    "purpose_code" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "consent_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_change_logs" (
    "id" UUID NOT NULL,
    "master_table" VARCHAR(50) NOT NULL,
    "record_id" UUID,
    "action" VARCHAR(20) NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "maker_id" UUID NOT NULL,
    "checker_id" UUID,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ,
    "effective_at" TIMESTAMPTZ,
    "is_batch" BOOLEAN NOT NULL DEFAULT false,
    "batch_id" UUID,

    CONSTRAINT "master_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsr_requests" (
    "id" UUID NOT NULL,
    "data_subject_id" VARCHAR(200) NOT NULL,
    "requested_by" VARCHAR(200) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "report_data" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "dsr_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_idp_subject_key" ON "users"("idp_subject");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_ingests_message_id_key" ON "email_ingests"("message_id");

-- CreateIndex
CREATE INDEX "email_ingests_ingest_status_idx" ON "email_ingests"("ingest_status");

-- CreateIndex
CREATE INDEX "email_ingests_from_address_idx" ON "email_ingests"("from_address");

-- CreateIndex
CREATE INDEX "email_ingests_received_at_idx" ON "email_ingests"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "cases_case_number_key" ON "cases"("case_number");

-- CreateIndex
CREATE UNIQUE INDEX "cases_email_ingest_id_key" ON "cases"("email_ingest_id");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "cases_case_type_idx" ON "cases"("case_type");

-- CreateIndex
CREATE INDEX "cases_priority_idx" ON "cases"("priority");

-- CreateIndex
CREATE INDEX "cases_assigned_officer_id_idx" ON "cases"("assigned_officer_id");

-- CreateIndex
CREATE INDEX "cases_assigned_fpr_id_idx" ON "cases"("assigned_fpr_id");

-- CreateIndex
CREATE INDEX "cases_tat_target_at_idx" ON "cases"("tat_target_at");

-- CreateIndex
CREATE INDEX "cases_created_at_idx" ON "cases"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "case_links_case_from_id_case_to_id_key" ON "case_links"("case_from_id", "case_to_id");

-- CreateIndex
CREATE INDEX "case_attachments_case_id_idx" ON "case_attachments"("case_id");

-- CreateIndex
CREATE INDEX "case_attachments_document_type_idx" ON "case_attachments"("document_type");

-- CreateIndex
CREATE INDEX "case_activity_logs_case_id_created_at_idx" ON "case_activity_logs"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "property_location_masters_pin_from_pin_to_idx" ON "property_location_masters"("pin_from", "pin_to");

-- CreateIndex
CREATE INDEX "property_location_masters_city_idx" ON "property_location_masters"("city");

-- CreateIndex
CREATE INDEX "property_location_masters_canonical_form_idx" ON "property_location_masters"("canonical_form");

-- CreateIndex
CREATE UNIQUE INDEX "case_type_masters_code_key" ON "case_type_masters"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fpr_masters_user_id_key" ON "fpr_masters"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fpr_masters_employee_code_key" ON "fpr_masters"("employee_code");

-- CreateIndex
CREATE INDEX "fpr_masters_employee_code_idx" ON "fpr_masters"("employee_code");

-- CreateIndex
CREATE INDEX "fpr_masters_canonical_form_idx" ON "fpr_masters"("canonical_form");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_masters_vendor_code_key" ON "vendor_masters"("vendor_code");

-- CreateIndex
CREATE INDEX "vendor_masters_vendor_code_idx" ON "vendor_masters"("vendor_code");

-- CreateIndex
CREATE INDEX "vendor_masters_canonical_form_idx" ON "vendor_masters"("canonical_form");

-- CreateIndex
CREATE UNIQUE INDEX "tat_masters_case_type_priority_stage_key" ON "tat_masters"("case_type", "priority", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "escalation_hierarchy_masters_scope_level_key" ON "escalation_hierarchy_masters"("scope", "level");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_calendar_masters_region_date_key" ON "holiday_calendar_masters"("region", "date");

-- CreateIndex
CREATE UNIQUE INDEX "business_hours_masters_region_day_of_week_key" ON "business_hours_masters"("region", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_code_key" ON "notification_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_code_channel_language_key" ON "notification_templates"("code", "channel", "language");

-- CreateIndex
CREATE INDEX "notification_logs_status_idx" ON "notification_logs"("status");

-- CreateIndex
CREATE INDEX "notification_logs_case_id_idx" ON "notification_logs"("case_id");

-- CreateIndex
CREATE INDEX "notification_logs_recipient_idx" ON "notification_logs"("recipient");

-- CreateIndex
CREATE INDEX "ai_classification_results_case_id_idx" ON "ai_classification_results"("case_id");

-- CreateIndex
CREATE INDEX "ai_classification_results_top_label_idx" ON "ai_classification_results"("top_label");

-- CreateIndex
CREATE INDEX "suggested_reply_drafts_case_id_idx" ON "suggested_reply_drafts"("case_id");

-- CreateIndex
CREATE INDEX "audit_logs_event_code_idx" ON "audit_logs"("event_code");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "consent_ledger_data_subject_id_idx" ON "consent_ledger"("data_subject_id");

-- CreateIndex
CREATE INDEX "consent_ledger_purpose_code_status_idx" ON "consent_ledger"("purpose_code", "status");

-- CreateIndex
CREATE INDEX "master_change_logs_master_table_status_idx" ON "master_change_logs"("master_table", "status");

-- CreateIndex
CREATE INDEX "master_change_logs_maker_id_idx" ON "master_change_logs"("maker_id");

-- CreateIndex
CREATE INDEX "master_change_logs_status_idx" ON "master_change_logs"("status");

-- CreateIndex
CREATE INDEX "dsr_requests_data_subject_id_idx" ON "dsr_requests"("data_subject_id");

-- CreateIndex
CREATE INDEX "dsr_requests_status_idx" ON "dsr_requests"("status");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_email_ingest_id_fkey" FOREIGN KEY ("email_ingest_id") REFERENCES "email_ingests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_fpr_id_fkey" FOREIGN KEY ("assigned_fpr_id") REFERENCES "fpr_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_vendor_id_fkey" FOREIGN KEY ("assigned_vendor_id") REFERENCES "vendor_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_officer_id_fkey" FOREIGN KEY ("assigned_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_links" ADD CONSTRAINT "case_links_case_from_id_fkey" FOREIGN KEY ("case_from_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_links" ADD CONSTRAINT "case_links_case_to_id_fkey" FOREIGN KEY ("case_to_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_attachments" ADD CONSTRAINT "case_attachments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_attachments" ADD CONSTRAINT "case_attachments_email_ingest_id_fkey" FOREIGN KEY ("email_ingest_id") REFERENCES "email_ingests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_activity_logs" ADD CONSTRAINT "case_activity_logs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_activity_logs" ADD CONSTRAINT "case_activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_location_masters" ADD CONSTRAINT "property_location_masters_default_fpr_id_fkey" FOREIGN KEY ("default_fpr_id") REFERENCES "fpr_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fpr_masters" ADD CONSTRAINT "fpr_masters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_classification_results" ADD CONSTRAINT "ai_classification_results_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggested_reply_drafts" ADD CONSTRAINT "suggested_reply_drafts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_change_logs" ADD CONSTRAINT "master_change_logs_maker_id_fkey" FOREIGN KEY ("maker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_change_logs" ADD CONSTRAINT "master_change_logs_checker_id_fkey" FOREIGN KEY ("checker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 7.8.0                       │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
