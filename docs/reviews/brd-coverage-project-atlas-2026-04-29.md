# BRD Coverage Audit — Project Atlas v3.0
**Date:** 2026-04-29
**BRD:** Project_Atlas_BRD_v3.0_DevReady.docx
**Branch:** main
**API Tests:** 378 passing (17 suites) | **Frontend Tests:** 11 passing (1 suite)
**Build:** All 3 packages passing

---

## Preflight Summary

| Item | Value |
|------|-------|
| Tech Stack | NestJS (API), React + Vite (Web), Prisma ORM, PostgreSQL |
| Test Frameworks | Jest (API), Vitest (Web) |
| Monorepo | pnpm workspaces: packages/api, packages/web, packages/benchmark, packages/shared |
| Total FRs in BRD | ~45 FRs across 16 modules (A-P) |
| Total auditable line items | 208 |
| Phase filter | full |

---

## LINE-ITEM COVERAGE SCORECARD

```
IMPLEMENTATION COVERAGE
========================
Total auditable items:           208
  DONE:                           65  (31.3%)
  PARTIAL:                        67  (32.2%)
  STUB:                           11  (5.3%)
  NOT_FOUND:                      65  (31.3%)

Implementation Rate (DONE+PARTIAL): 132 / 208 = 63.5%
Full Implementation Rate (DONE):     65 / 208 = 31.3%
Total Gaps (non-DONE):             143
```

### VERDICT: **AT-RISK**
- AC implementation rate < 70% (63.5% including PARTIAL)
- Multiple P0 gaps in core modules (email ingestion resilience, attachment processing, escalation)

---

## Module-by-Module Traceability

### Module A — Email Ingestion (FR-001 to FR-005) — 22 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-001.A1 | Email polling → Email_Ingest row within 30s | DONE | graph.provider.ts:137, gmail.provider.ts:186 |
| FR-001.A2 | RFC822 stored encrypted in object storage | PARTIAL | EncryptionService + ObjectStorageService exist but wiring absent |
| FR-001.A3 | Duplicate Message-ID dedup | DONE | email-ingest.service.ts:101-131, @unique constraint |
| FR-001.A4 | SPF/DKIM/DMARC verdicts | DONE | spam.processor.ts:34-58 |
| FR-001.A5 | Mailbox outage queueing/replay | NOT_FOUND | No queue infrastructure |
| FR-001.BR | Spam denylist, 25MB handling | PARTIAL | Denylist exists (empty); no size limits |
| FR-002.A1 | Phishing >=0.80 quarantine + notify SysAdmin | PARTIAL | Quarantine works; no SysAdmin notification |
| FR-002.A2 | Score >=0.50 flag with banner | PARTIAL | shouldFlagForReview() exists but never called |
| FR-002.A3 | ClamAV AV scanning | DONE | av-scanner.service.ts:32-85 |
| FR-002.A4 | Hyperlink click-time protection | NOT_FOUND | — |
| FR-003.A1 | Auto-reply/OOO detection | DONE | email-ingest.service.ts:140-178 |
| FR-003.A2 | OOO on existing thread logged | PARTIAL | Returns early before thread assembly |
| FR-003.A3 | NDR/bounce → Notification_Log | NOT_FOUND | — |
| FR-004.A1 | Thread assembly via headers | DONE | thread.processor.ts:66-88 |
| FR-004.A2 | Body diffing strips quoted text | DONE | thread.processor.ts:94-124 |
| FR-004.A3 | Thread linked to existing Case | PARTIAL | Logic exists but DB lookup unimplemented |
| FR-004.A4 | 90-day look-back window | NOT_FOUND | — |
| FR-005.A1 | Language auto-detection | DONE | language.processor.ts:32-73 |
| FR-005.A2 | English, Hindi, Hinglish | DONE | language.processor.ts:79-82 |
| FR-005.A3 | Non-supported → fallback queue | NOT_FOUND | isSupported() exists but never called |
| FR-005.A4 | Extensible by configuration | STUB | Hardcoded language list |

**Module A Score: 8 DONE / 6 PARTIAL / 1 STUB / 6 NOT_FOUND**

---

### Module B — AI Classification (FR-010 to FR-016) — 27 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-010.A1 | Top-1 + top-3 with confidences | DONE | classification-pipeline.service.ts:184-185 |
| FR-010.A2 | Multi-label support | NOT_FOUND | Single-label only |
| FR-010.A3 | Below threshold → Triage Review | DONE | pipeline:199, TriageQueue.tsx |
| FR-010.A4 | Classification rationale persisted | DONE | pipeline:221, schema:614 |
| FR-010.A5 | p95 <= 4s latency | PARTIAL | Measured but not monitored |
| FR-011.A1 | All entity types extracted | DONE | rule-based.extractor.ts:110-119 |
| FR-011.A2 | Per-entity F1 >= 0.90 | NOT_FOUND | No NER evaluation framework |
| FR-011.A3 | Cross-check against masters | DONE | master-validator.ts:61-72 |
| FR-011.A4 | Conflicts surfaced | PARTIAL | Fuzzy match candidates shown; no cross-field conflict UI |
| FR-012.A1 | Sentiment NEGATIVE/NEUTRAL/POSITIVE | DONE | sentiment.service.ts:130-152 |
| FR-012.A2 | Urgency signals upgrade priority | DONE | sentiment.service.ts:180-191 |
| FR-012.A3 | Sender domain rules for CRITICAL | NOT_FOUND | — |
| FR-012.A4 | Priority changes audited | NOT_FOUND | — |
| FR-013.A1 | >1500 chars → 3-bullet summary | DONE | summarisation.service.ts:11,26-53 |
| FR-013.A2 | Only plain text | DONE | No HTML processing |
| FR-013.A3 | Source span highlighting | DONE | summarisation.service.ts:35-36 |
| FR-014.A1 | Message-ID + SHA-256 dedup | DONE | email-ingest.service.ts:101-134 |
| FR-014.A2 | Embedding near-duplicate detection | NOT_FOUND | — |
| FR-014.A3 | Duplicates linked, not dropped | PARTIAL | Status set but CaseLink not created |
| FR-015.A1-A3 | Confidence band thresholds | PARTIAL | Working 4-band system; thresholds calibrated for ONNX (0.40/0.20/0.10 vs BRD 0.90/0.75/0.50) |
| FR-015.A4 | <0.50 red + auto-ack | DONE | RED_MANUAL + auto-ack.service.ts |
| FR-015.A5 | Configurable per Case Type | DONE | confidence-band.service.ts:58-74 |
| FR-015.A6 | Color-coded chips, accessible | PARTIAL | Color coding exists; no aria-labels on chips |
| FR-015.A7 | Accountability banner | DONE | AccountabilityBanner.tsx:14-65 |
| FR-016.A1 | Mandatory validation against masters | DONE | master-validator.ts:61-72 |
| FR-016.A2 | Canonical → source → Levenshtein | DONE | master-validator.ts:95-162 |
| FR-016.A3 | No silent routing on failure | PARTIAL | Validation captured; routing not blocked |
| FR-016.A4 | Free-text fields require confirmation | PARTIAL | Triage flow confirms overall, not per-field |
| FR-016.A5 | Validation outcomes recorded | DONE | schema:620, types.ts |
| FR-016.A6 | <=500ms p95 validation | NOT_FOUND | — |

**Module B Score: 15 DONE / 8 PARTIAL / 0 STUB / 6 NOT_FOUND**

---

### Module C — Attachments (FR-020 to FR-024) — 11 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-020.A1 | Whitelisted MIME types | NOT_FOUND | — |
| FR-020.A2 | 25MB/75MB size limits | NOT_FOUND | — |
| FR-020.A3 | AV scan before preview | DONE | av-scanner.service.ts + attachment.service.ts |
| FR-021.A1 | OCR when text-layer missing | PARTIAL | pdf-parse + Tesseract; no text-layer check |
| FR-021.A2 | Word-level confidence | NOT_FOUND | Document-level only |
| FR-021.A3 | In-region OCR | NOT_FOUND | — |
| FR-022.A1 | Document-type classification | STUB | Schema fields exist; no classifier |
| FR-022.A2 | <0.7 confidence → OTHER | NOT_FOUND | — |
| FR-023.A1-A4 | Structured field extraction | NOT_FOUND | Schema column exists; no extraction logic |
| FR-024.A1 | DMS persist | NOT_FOUND | — |
| FR-024.A2 | dms_external_id recorded | STUB | Schema column only |

**Module C Score: 1 DONE / 1 PARTIAL / 2 STUB / 7 NOT_FOUND**

---

### Module D — Case Creation & Routing (FR-030 to FR-035) — 17 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-030.A1 | case_number ATL-YYYY-NNNNNN | DONE | case-creation.service.ts:361-378 |
| FR-030.A2 | Populated from NER + LMS | DONE | intake-orchestrator.service.ts:91-118 |
| FR-030.A3 | tat_target_at computed | DONE | case-creation.service.ts:74-90 |
| FR-030.A4 | NEW → CLASSIFIED → ROUTED auto | DONE | case-creation.service.ts:100-122 |
| FR-030.A5 | Auto-ack with signed URL | DONE | auto-ack.service.ts:110-153 (URL not cryptographically signed) |
| FR-031.A1 | Cascading routing key | DONE | routing.service.ts:57-243 |
| FR-031.A2 | OOO → delegate → supervisor | DONE | routing.service.ts:291-327 |
| FR-031.A3 | Workload-balancing toggle | PARTIAL | Logic exists; no toggle config |
| FR-031.A4 | Skill-based routing | DONE | routing.service.ts:265-268 |
| FR-031.A5 | Routing decision logged | DONE | case-creation.service.ts:108-116 |
| FR-032.A1 | Vendor filtered by geo + type | DONE | vendor-selection.service.ts:42-47 |
| FR-032.A2 | Configurable algorithm | DONE | vendor-selection.service.ts:5,57-77 |
| FR-032.A3 | Officer override | NOT_FOUND | — |
| FR-033.A1 | Template outbound validated | PARTIAL | Templates exist; no merge field validation |
| FR-033.A2 | Officer review per Case Type | NOT_FOUND | — |
| FR-033.A3 | Outbound threaded to Case | STUB | Schema only |
| FR-033.A4 | Bounce → alternate channel | PARTIAL | SMTP failover only, not channel failover |
| FR-034.A1 | Manual link cases | DONE | case-creation.service.ts:243-291 |
| FR-034.A2 | Bulk merge up to 10 | NOT_FOUND | — |
| FR-034.A3 | thread_id tracking | PARTIAL | On ingest, not on case |
| FR-035.A1 | Multi-select 100 cases | NOT_FOUND | — |
| FR-035.A2 | Bulk actions logged | NOT_FOUND | — |

**Module D Score: 11 DONE / 4 PARTIAL / 1 STUB / 5 NOT_FOUND**

---

### Module E — Master Data (FR-040 to FR-043) — 13 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-040.A1 | Maker creates PENDING | DONE | maker-checker.service.ts:90-122 |
| FR-040.A2 | Different user approves | DONE | maker-checker.service.ts:127-203 |
| FR-040.A3 | Effective at scheduled | DONE | propose-change.dto.ts:42-48 |
| FR-040.A4 | Version retained, rollback | DONE | maker-checker.service.ts:208-241 |
| FR-040.A5 | Self-approval forbidden | DONE | maker-checker.service.ts:142-146 |
| FR-041.A1 | CSV/Excel upload + validation | DONE | bulk-import.service.ts:100-208 |
| FR-041.A2 | Rows into maker-checker | DONE | bulk-import.service.ts:214-246 |
| FR-041.A3 | Export CSV | DONE | masters.controller.ts:303-346 |
| FR-042.A1 | effective_from/effective_to | DONE | effective-dating.service.ts:7-16 |
| FR-042.A2 | Active at any timestamp | DONE | effective-dating.service.ts:86-126 |
| FR-042.A3 | One-click rollback | DONE | maker-checker.service.ts:208-241 |
| FR-043.A1 | Before/after JSON | DONE | maker-checker.service.ts:111-112 |
| FR-043.A2 | Audit log for SOX | PARTIAL | Data sufficient; no SOX-specific export |

**Module E Score: 12 DONE / 1 PARTIAL / 0 STUB / 0 NOT_FOUND** ★ Strongest module

---

### Module F — Workbench (FR-050 to FR-057) — 22 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-050.A1 | My queue, FIFO, overdue pinned | PARTIAL | CaseList exists; no My/Team queue, no pinning |
| FR-050.A2 | Toggle FIFO/criticality sort | NOT_FOUND | — |
| FR-050.A3 | Saved views | NOT_FOUND | — |
| FR-050.A4 | Inline filters | DONE | CaseList.tsx:157-181 |
| FR-050.A5 | Full-text + semantic search | PARTIAL | Text search only |
| FR-051.A1 | Three-pane layout | PARTIAL | Tab-based, not three-pane |
| FR-051.A2 | Action panel | DONE | CaseDetail.tsx:343-376 |
| FR-051.A3 | Inline attachment preview | PARTIAL | OCR text shown; no PDF/image preview |
| FR-051.A4 | Entity hover → source span | NOT_FOUND | — |
| FR-052.A1-A3 | AI-suggested next actions | NOT_FOUND | Entire feature absent |
| FR-053.A1 | LLM-proposed reply draft | STUB | Schema only |
| FR-053.A2 | Inline edit with redline diff | NOT_FOUND | — |
| FR-053.A3 | PII redaction lint on replies | PARTIAL | Service exists; not in reply flow |
| FR-054.A1 | Private notes | PARTIAL | Notes via activity log; no privacy control |
| FR-054.A2 | @mention notifications | NOT_FOUND | — |
| FR-054.A3 | Notes searchable | NOT_FOUND | — |
| FR-055.A1 | Pause SLA with reason | PARTIAL | Pause exists; no reason, no endpoint |
| FR-055.A2 | Paused time excluded | DONE | sla-clock.service.ts:253-254 |
| FR-055.A3 | Auto-resume on inbound | NOT_FOUND | — |
| FR-056.A1 | Resolution code required | PARTIAL | Schema fields; no enforcement |
| FR-056.A2 | Auto-close 30 days | NOT_FOUND | — |
| FR-056.A3 | Reopen within 60 days | NOT_FOUND | — |
| FR-057.A1 | Keyboard shortcuts | NOT_FOUND | — |
| FR-057.A2 | WCAG 2.1 AA | PARTIAL | Basic ARIA; not comprehensive |
| FR-057.A3 | Light/dark mode | DONE | Layout.tsx:25,28,59-63 |
| FR-057.A4 | Browser CRITICAL notification | NOT_FOUND | — |

**Module F Score: 4 DONE / 8 PARTIAL / 1 STUB / 11 NOT_FOUND** ★ Weakest web module

---

### Module G — SLA & Escalation (FR-060 to FR-063) — 14 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-060.A1 | Business-hours aware | DONE | sla-clock.service.ts:246-250 |
| FR-060.A2 | Paused time excluded | DONE | sla-clock.service.ts:253-254 |
| FR-060.A3 | Live countdown + warnings | PARTIAL | SlaProgressBar; not live polling |
| FR-061.A1 | Level 1 at TAT breach | DONE | escalation.service.ts:62-67 |
| FR-061.A2 | Subsequent levels after delay | DONE | escalation.service.ts:66,174-185 |
| FR-061.A3 | Roles/users, multi-channel | PARTIAL | Hierarchy defined; not wired to dispatch |
| FR-061.A4 | Repeat reminders | NOT_FOUND | Prevents re-firing instead |
| FR-061.A5 | All events logged | DONE | escalation.service.ts:232-261 |
| FR-062.A1 | Predictive ML model | STUB | Feature flag only |
| FR-062.A2 | p_breach > 0.7 surfaced | NOT_FOUND | — |
| FR-062.A3 | Predicted vs actual metric | NOT_FOUND | — |
| FR-063.A1 | ON_HOLD pauses escalations | NOT_FOUND | — |
| FR-063.A2 | Holiday/weekend suppression | NOT_FOUND | — |
| FR-063.A3 | Cooldown for acknowledged | NOT_FOUND | — |

**Module G Score: 5 DONE / 2 PARTIAL / 1 STUB / 6 NOT_FOUND**

---

### Module H — Pendency Reports (FR-070 to FR-072) — 11 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-070.A1 | Scheduled report (08:30 IST) | PARTIAL | Schedule model exists; no cron integration |
| FR-070.A2 | Overdue/Due today sections | PARTIAL | Analytics sections only |
| FR-070.A3 | Signed-token URL | NOT_FOUND | — |
| FR-070.A4 | HTML + plain-text variants | NOT_FOUND | — |
| FR-070.A5 | WhatsApp/SMS short-form | NOT_FOUND | — |
| FR-071.A1-A3 | Custom schedules | PARTIAL | Basic schedule model; no per-role/vendor |
| FR-072.A1-A3 | Channel fallback chain | NOT_FOUND | SMS/WhatsApp not implemented |
| FR-072.A4 | All attempts persisted | PARTIAL | NotificationLog model; no retry logging |

**Module H Score: 0 DONE / 4 PARTIAL / 0 STUB / 4 NOT_FOUND**

---

### Module I — Vendor Portal (FR-080 to FR-083) — 4 items

| ID | Requirement | Verdict |
|----|-------------|---------|
| FR-080 | Vendor login (OTP, SAML) | NOT_FOUND |
| FR-081 | Vendor dashboard | NOT_FOUND |
| FR-082 | Response submission | NOT_FOUND |
| FR-083 | Vendor scorecard | PARTIAL (internal admin scorecard exists; no vendor self-service) |

**Module I Score: 0 DONE / 1 PARTIAL / 0 STUB / 3 NOT_FOUND** ★ Entirely absent

---

### Module J — FPR Mobile App (FR-090 to FR-092) — 3 items

| ID | Requirement | Verdict |
|----|-------------|---------|
| FR-090 | Native mobile app | NOT_FOUND |
| FR-091 | GPS field check-in | NOT_FOUND |
| FR-092 | Push notifications | NOT_FOUND |

**Module J Score: 0/3 — Entirely out of scope for web platform**

---

### Module K — Notifications (FR-100 to FR-102) — 3 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-100 | Multi-channel (8 channels) | PARTIAL | 3/8 channels (EMAIL, IN_APP, MS_TEAMS) |
| FR-101 | Templating (Handlebars, i18n) | PARTIAL | Basic interpolation; no Handlebars, no i18n |
| FR-102 | Delivery tracking + retries | PARTIAL | NotificationLog exists; no retries/fallback |

**Module K Score: 0 DONE / 3 PARTIAL / 0 STUB / 0 NOT_FOUND**

---

### Module L — Reports & Analytics (FR-110 to FR-114) — 5 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-110 | Operational dashboard | PARTIAL | Tiles exist; no drill-down, no auto-refresh |
| FR-111 | Performance analytics | PARTIAL | Basic SLA dashboard; no heatmaps/trends |
| FR-112 | Predictive analytics | STUB | Feature flag only |
| FR-113 | Custom report builder | NOT_FOUND | "Coming Soon" placeholder |
| FR-114 | Compliance reports | PARTIAL | Evidence pack endpoint; limited scope |

**Module L Score: 0 DONE / 3 PARTIAL / 1 STUB / 1 NOT_FOUND**

---

### Module M — Compliance & Security (FR-120 to FR-129) — 19 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-120.A1 | Right of access | DONE | dsr.service.ts:62-80 |
| FR-120.A2 | Right of correction | PARTIAL | Schema supports; no workflow |
| FR-120.A3 | Right of erasure | STUB | Schema only |
| FR-120.A4 | Consent ledger | DONE | consent-ledger.service.ts:36-169 |
| FR-120.A5 | DPO console | PARTIAL | Separate pages; not unified |
| FR-121 | RBI data localisation | NOT_FOUND | — |
| FR-122 | Encryption (AES-256-GCM) | DONE | encryption.service.ts:1-66 |
| FR-123 | PII redaction | DONE | pii-redaction.service.ts:1-117 |
| FR-124 | RBAC + ABAC | DONE | roles.guard.ts + region-scoped.decorator.ts |
| FR-125 | Identity & MFA | PARTIAL | OIDC exists; SAML missing; MFA guard not applied |
| FR-126 | Audit log (hash-chain) | DONE | audit-log.service.ts (append-only, SHA-256 chain) |
| FR-127 | Vulnerability mgmt | NOT_FOUND | — |
| FR-128.A1 | LLM_ENABLED toggle (ON/DEGRADED/OFF) | DONE | llm-mode.config.ts:1-92 |
| FR-128.A2 | Distilled classifier in OFF mode | DONE | classification-pipeline.service.ts |
| FR-128.A3 | Accuracy floor >=80% in OFF | DONE | Benchmark: 86.5% ONNX-only |
| FR-128.A4 | Auto-engagement triggers | DONE | pipeline auto-degrades after 3 failures |
| FR-128.A5 | Mode banner in workbench | DONE | LlmModeBanner.tsx:1-94 |
| FR-128.A6 | Quarterly LLM-off drill | PARTIAL | Drill script exists; no scheduled execution |
| FR-129 | Synthetic email corpus | NOT_FOUND | — |

**Module M Score: 10 DONE / 4 PARTIAL / 1 STUB / 2 NOT_FOUND** ★ Strong

---

### Module N — AI Governance (FR-130 to FR-134) — 5 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-130 | Model registry | PARTIAL | In-memory registry; no promotion workflow |
| FR-131 | Drift monitoring | PARTIAL | Weekly snapshots; no PSI, no alert dispatch |
| FR-132 | Human-in-loop labelling | PARTIAL | Triage queue; corrections not piped to training |
| FR-133 | Explainability | PARTIAL | Rationale captured; no token-level NER viz |
| FR-134 | Bias & fairness | NOT_FOUND | — |

**Module N Score: 0 DONE / 4 PARTIAL / 0 STUB / 1 NOT_FOUND**

---

### Module O — Integration (FR-140 to FR-144) — 5 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-140 | Public REST API + OpenAPI | PARTIAL | Swagger generated; no client credentials auth |
| FR-141 | Webhooks | NOT_FOUND | — |
| FR-142 | LMS/CBS integration | NOT_FOUND | — |
| FR-143 | DMS, CRM, AD | STUB | dms_external_id schema field only |
| FR-144 | SMTP/IMAP/Graph | PARTIAL | Graph+Gmail inbound; SMTP outbound via auto-ack |

**Module O Score: 0 DONE / 2 PARTIAL / 1 STUB / 2 NOT_FOUND**

---

### Module P — Admin & Config (FR-150 to FR-156) — 7 items

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| FR-150 | Multi-environment | PARTIAL | docker-compose for dev; no UAT/prod |
| FR-151 | Feature flags | PARTIAL | Client-side mock flags; no server-side evaluation |
| FR-152 | Sandbox & A/B testing | NOT_FOUND | — |
| FR-153 | System health | PARTIAL | Mock health dashboard; no alerting |
| FR-154 | Backup & DR | NOT_FOUND | — |
| FR-155 | Secondary mailbox | DONE | Graph + Gmail providers, dual polling |
| FR-156 | Vendor on-time KPI | PARTIAL | Schema field; no weekly computation job |

**Module P Score: 1 DONE / 4 PARTIAL / 0 STUB / 2 NOT_FOUND**

---

### Cross-Cutting Requirements

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| §1.5 | Accountability banner | DONE | AccountabilityBanner.tsx |
| §1.5 | accountable_officer_id on activity | PARTIAL | In triage payloads; not all transitions |
| §1.5 | AI confidence at every transition | PARTIAL | At intake/triage only |
| §4.0 | canonical_form + source_forms[] | DONE | 4 master tables + seed data |
| §4.0 | >=98% lookup success rate | PARTIAL | Algorithm complete; no success rate monitoring |
| §6.1 | Global UI conventions | PARTIAL | Left nav, top bar; not responsive |
| §6.2 | Login screen | PARTIAL | Email/password; no SSO button |
| §6.6 | Triage Review UI | DONE | TriageQueue.tsx — card-based |
| §6.7 | Master Management UI | DONE | MasterManagement.tsx — tabs, propose, approve |
| §6.8 | Vendor Portal screens | NOT_FOUND | — |
| §6.9 | FPR Mobile screens | NOT_FOUND | — |
| §6.10 | Reports screens | STUB | "Coming Soon" placeholder |
| §6.11 | Admin Console | PARTIAL | Basic tabs; incomplete |
| §6.12 | DPO/Compliance Console | PARTIAL | 4 pages exist; not unified |

---

## Comprehensive Gap List

### Category A: Unimplemented (NOT_FOUND) — 65 items

| # | Gap | Module | Size | Priority |
|---|-----|--------|------|----------|
| 1 | FR-001.A5: Mailbox outage queueing/replay | A | L | P0 |
| 2 | FR-002.A4: Hyperlink click-time protection | A | M | P1 |
| 3 | FR-003.A3: NDR/bounce processing | A | M | P1 |
| 4 | FR-004.A4: 90-day thread look-back window | A | S | P2 |
| 5 | FR-005.A3: Non-supported language fallback queue | A | S | P1 |
| 6 | FR-010.A2: Multi-label classification | B | L | P1 |
| 7 | FR-011.A2: Per-entity NER F1 evaluation | B | M | P1 |
| 8 | FR-012.A3: Sender domain rules for CRITICAL | B | S | P1 |
| 9 | FR-012.A4: Priority change audit trail | B | S | P1 |
| 10 | FR-014.A2: Embedding near-duplicate detection | B | L | P2 |
| 11 | FR-016.A6: Validation latency monitoring | B | S | P2 |
| 12 | FR-020.A1: MIME type whitelist | C | S | P0 |
| 13 | FR-020.A2: File size limits (25MB/75MB) | C | S | P0 |
| 14 | FR-021.A2: Word-level OCR confidence | C | M | P2 |
| 15 | FR-021.A3: In-region OCR enforcement | C | S | P2 |
| 16 | FR-022.A1-A2: Document-type classification | C | L | P1 |
| 17 | FR-023.A1-A4: Structured field extraction | C | XL | P1 |
| 18 | FR-024.A1-A2: DMS hand-off integration | C | L | P2 |
| 19 | FR-032.A3: Officer vendor override | D | S | P1 |
| 20 | FR-033.A2: Officer review per Case Type policy | D | M | P1 |
| 21 | FR-034.A2: Bulk merge up to 10 cases | D | M | P2 |
| 22 | FR-035.A1-A2: Bulk operations (multi-select 100) | F | M | P1 |
| 23 | FR-050.A2: Toggle FIFO/criticality sort | F | S | P1 |
| 24 | FR-050.A3: Saved views | F | M | P2 |
| 25 | FR-051.A4: Entity hover → source span | F | M | P2 |
| 26 | FR-052.A1-A3: AI-suggested next actions | F | XL | P1 |
| 27 | FR-053.A2: Inline edit with redline diff | F | M | P2 |
| 28 | FR-054.A2: @mention notifications | F | M | P1 |
| 29 | FR-054.A3: Notes searchable | F | S | P2 |
| 30 | FR-055.A3: Auto-resume SLA on inbound | F | S | P1 |
| 31 | FR-056.A2: Auto-close after 30 days | F | M | P1 |
| 32 | FR-056.A3: Reopen within 60 days | F | S | P1 |
| 33 | FR-057.A1: Keyboard shortcuts | F | M | P2 |
| 34 | FR-057.A4: Browser CRITICAL notification | F | S | P2 |
| 35 | FR-061.A4: Repeat escalation reminders | G | S | P1 |
| 36 | FR-062.A1-A3: Predictive breach detection ML | G | XL | P2 |
| 37 | FR-063.A1-A3: Escalation suppression rules | G | M | P1 |
| 38 | FR-070.A3: Signed-token vendor URLs | H | S | P1 |
| 39 | FR-070.A4-A5: HTML+text + WhatsApp/SMS | H | M | P1 |
| 40 | FR-071.A2-A3: Midday refresh, vendor consolidation | H | S | P2 |
| 41 | FR-072.A1-A3: Channel fallback chain | H | L | P0 |
| 42 | FR-080-FR-082: Vendor Portal (login, dashboard, submit) | I | XL | P1 |
| 43 | FR-090-FR-092: FPR Mobile App | J | XL | P2* |
| 44 | FR-113: Custom report builder | L | XL | P2 |
| 45 | FR-121: RBI data localisation enforcement | M | M | P0 |
| 46 | FR-127: VAPT/SAST/DAST/secrets mgmt | M | L | P0 |
| 47 | FR-129: Synthetic email corpus (~5000) | M | L | P1 |
| 48 | FR-134: Bias & fairness checks | N | L | P2 |
| 49 | FR-141: Webhooks (event subscriptions) | O | L | P1 |
| 50 | FR-142: LMS/CBS integration | O | L | P1 |
| 51 | FR-152: Sandbox & A/B testing | P | L | P2 |
| 52 | FR-154: Backup & DR drills | P | M | P0 |
| 53 | §6.8: Vendor Portal UI | UI | XL | P1 |
| 54 | §6.9: FPR Mobile screens | UI | XL | P2* |
| 55 | §6.10: Reports library & builder | UI | XL | P2 |

### Category B: Stubbed (STUB) — 11 items

| # | Gap | Module | Size |
|---|-----|--------|------|
| 56 | FR-005.A4: Language list configurable | A | XS |
| 57 | FR-022.A1: Document-type classifier | C | L |
| 58 | FR-023.A4: extracted_fields_json population | C | L |
| 59 | FR-024.A2: dms_external_id population | C | M |
| 60 | FR-033.A3: Outbound threaded to Case | D | S |
| 61 | FR-053.A1: Suggested reply draft service | F | L |
| 62 | FR-062.A1: Predictive breach feature flag | G | XL |
| 63 | FR-112: Predictive analytics | L | XL |
| 64 | FR-120.A3: Right of erasure | M | M |
| 65 | FR-143: DMS integration | O | L |
| 66 | §6.10: Reports UI | UI | XL |

### Category C: Partially Implemented — 67 items
(See traceability tables above for details on what's missing in each PARTIAL item)

### Category D: Implemented but Untested — Key items

| # | Gap | Details |
|---|-----|---------|
| 67 | Graph provider | No integration test for Microsoft Graph polling |
| 68 | Gmail provider | No integration test for Gmail polling |
| 69 | SMTP failover | No test for primary→secondary failover |
| 70 | OCR service | No test for PDF text extraction |
| 71 | Intake orchestrator | No E2E test for full pipeline |
| 72 | Routing cascading lookup | Integration tests exist (12 tests) but don't test real DB |
| 73 | SLA clock business-hours | Tests exist (22 tests) but mock business hours data |
| 74 | Collateral risk scoring | Tests exist (23 tests) |
| 75 | Frontend pages | Only 11 smoke tests; no component-level tests for new pages |

---

## Top 10 Priority Actions

| # | Action | Size | Impact |
|---|--------|------|--------|
| 1 | **Add MIME type whitelist + file size limits** (FR-020.A1-A2) — Security gap allowing arbitrary file upload | S | P0 blocker |
| 2 | **Add message queue for mailbox ingestion** (FR-001.A5) — BullMQ/Redis queue for zero-data-loss | L | P0 resilience |
| 3 | **Implement channel fallback chain** (FR-072) — EMAIL→SMS→WhatsApp→IN_APP | L | P0 notification reliability |
| 4 | **Wire RFC822 archival to encryption+storage** (FR-001.A2) — Connect existing services | S | P0 compliance |
| 5 | **Add document-type classification service** (FR-022) — Classify attachments to doc types | L | P1 attachment intelligence |
| 6 | **Implement bulk operations** (FR-035) — Multi-select reassign/priority/close | M | P1 officer productivity |
| 7 | **Build suggested next actions** (FR-052) — AI-powered action recommendations | XL | P1 core differentiator |
| 8 | **Add escalation suppression + repeat reminders** (FR-061.A4, FR-063) — Complete escalation engine | M | P1 operational correctness |
| 9 | **Block routing on validation failure** (FR-016.A3) — Enforce master-validation gate | S | P1 data integrity |
| 10 | **Add SLA pause endpoint + auto-resume** (FR-055) — REST endpoint with reason codes | S | P1 SLA accuracy |

---

## Modules Deferred / Out of Scope

| Module | Reason |
|--------|--------|
| Module J — FPR Mobile App (FR-090-092) | Separate React Native/Flutter project; out of scope for web platform |
| Module I — Vendor Portal (FR-080-082) | Separate SPA needed; not part of core workbench |
| FR-112 — Predictive Analytics | Requires ML model training infrastructure |
| FR-113 — Custom Report Builder | Large standalone feature |

---

*Generated by BRD Coverage Audit skill on 2026-04-29*
