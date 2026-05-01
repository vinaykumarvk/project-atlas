# BRD Coverage Audit — Project Atlas (Round 2)

**Audit Date:** 2026-04-29
**BRD:** Project Atlas v3.0 (Development-Ready)
**Scope:** Full audit (gaps-only), excluding Module I (Vendor Portal) and Module J (FPR Mobile App)
**Prior Audit:** brd-coverage-project-atlas-2026-04-29.md (Round 1: 31.3% DONE, AT-RISK)
**Remediation Applied:** 9-phase gap remediation (doc/plan-gap-remediation-round1.md), +169 new tests

---

## Phase 0 — Preflight

| Item | Value |
|------|-------|
| BRD file | /tmp/brd_full.txt (882 lines) |
| Tech stack | NestJS + Prisma + PostgreSQL (API), React + Vite (Web) |
| Test suite | 547 API tests (Jest), 13 frontend tests (Vitest) |
| Git state | main, all files untracked (fresh repo) |
| Modules audited | A, B, C, D, E, F, G, H, K, L, M, N, O, P (14 modules) |
| Modules excluded | I (Vendor Portal), J (FPR Mobile App) |

---

## Phase 2 — Code Traceability (Line-Item)

### Module A — Email Ingestion & Pre-processing

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-001 | A1: Email → RECEIVED within 30s | PARTIAL | email-ingest.service.ts:123 — record created; no p95 measurement |
| FR-001 | A2: RFC822 encrypted AES-256-GCM | DONE | encryption.service.ts:11,34; email-ingest.service.ts:248 |
| FR-001 | A3: Duplicate Message-ID → DUPLICATE | DONE | email-ingest.service.ts:144-177 |
| FR-001 | A4: SPF/DKIM/DMARC captured | DONE | spam.processor.ts:34-59; schema.prisma:97-99 |
| FR-001 | A5: Mailbox outage resilience | STUB | intake.processor.ts exists; no replay logic |
| FR-001 | BR: Denylist + size limit | DONE | spam.processor.ts:127; attachment.service.ts:27,115 |
| FR-002 | A1: Phishing >=0.80 → quarantine | DONE | spam.processor.ts:66-94,137; email-ingest.service.ts:103 |
| FR-002 | A2: 0.50-0.80 → flag for review | DONE | spam.processor.ts:144-149; schema.prisma:102 |
| FR-002 | A3: AV scan, INFECTED quarantined | DONE | av-scanner.service.ts:145-184; attachment.service.ts:247 |
| FR-002 | A4: Hyperlink click-time rewrite | NOT_FOUND | — |
| FR-003 | A1: Auto-reply → AUTO_REPLY | DONE | email-ingest.service.ts:84-95,183-221 |
| FR-003 | A2: OOO on thread → logged | DONE | email-ingest.service.ts:88-92,292-311 |
| FR-003 | A3: NDR → BOUNCED + fallback | DONE | bounce-detector.service.ts:38-64,107-129 |
| FR-004 | A1: References/In-Reply-To assembly | DONE | thread.processor.ts:28-43,66-88 |
| FR-004 | A2: Body diffing strips quoted | DONE | thread.processor.ts:94-124 |
| FR-004 | A3: Thread → existing Case Activity | PARTIAL | thread.processor.ts:131; intake-orchestrator.service.ts:135 |
| FR-004 | A4: 90-day look-back window | STUB | No configurable window |
| FR-005 | A1: Language auto-detection | DONE | language.processor.ts:32-74 |
| FR-005 | A2: en, hi, Hinglish supported | DONE | language.processor.ts:14-26,79-82 |
| FR-005 | A3: Unsupported → fallback queue | DONE | intake-orchestrator.service.ts:83-93,141-157 |
| FR-005 | A4: Extensible by config | PARTIAL | SUPPORTED_LANGUAGES hardcoded, not env-driven |

**Module A: 15 DONE, 3 PARTIAL, 2 STUB, 1 NOT_FOUND (21 items)**

---

### Module B — AI Classification & Entity Extraction

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-010 | A1: Top-1 + top-3 calibrated | DONE | classification-pipeline.service.ts:200,236; types.ts:23-36 |
| FR-010 | A2: Multi-label → multiple Cases | STUB | Single top_label only |
| FR-010 | A3: Below threshold → Triage | DONE | confidence-band.service.ts:103; intake-orchestrator.service.ts:95 |
| FR-010 | A4: Rationale persisted | DONE | types.ts:27; schema.prisma:615 |
| FR-010 | A5: Inference p95 <=4s | PARTIAL | Latency tracked (inference_ms); no SLO enforcement |
| FR-011 | A1: NER entity extraction | DONE | rule-based.extractor.ts:107-457 |
| FR-011 | A2: Per-entity F1 >=0.90 | STUB | No F1 calibration |
| FR-011 | A3: Cross-check against masters | DONE | master-validator.ts:61-72 |
| FR-011 | A4: Conflicts surfaced | DONE | types.ts:15-20; classification-pipeline.service.ts:239 |
| FR-012 | A1: Sentiment classification | DONE | sentiment.service.ts:113-152 |
| FR-012 | A2: Urgency upgrades priority | DONE | sentiment.service.ts:158-191 |
| FR-012 | A3: Sender domain → CRITICAL | DONE | sender-domain.service.ts:40-61 |
| FR-012 | A4: Priority changes auditable | DONE | types.ts:41-44; intake-orchestrator.service.ts:164-181 |
| FR-013 | A1: 3-bullet summary | DONE | summarisation.service.ts:26-52 |
| FR-013 | A2: Plain text only | PARTIAL | Uses text param; no explicit HTML sanitization check |
| FR-013 | A3: Source spans | DONE | summarisation.service.ts:52; types.ts:71 |
| FR-014 | A1: Message-ID + SHA-256 dedup | DONE | email-ingest.service.ts:145-174,226-232 |
| FR-014 | A2: Embedding near-duplicate | NOT_FOUND | — |
| FR-014 | A3: Duplicates linked | DONE | schema.prisma:229-242 (CaseLink) |
| FR-015 | A1: >=0.90 green | DONE | confidence-band.service.ts:86-98 |
| FR-015 | A2: 0.75-0.89 amber | DONE | confidence-band.service.ts:91-92 |
| FR-015 | A3: 0.50-0.74 red | DONE | confidence-band.service.ts:93-94 |
| FR-015 | A4: <0.50 red + manual | DONE | confidence-band.service.ts:95-97 |
| FR-015 | A5: Bands configurable per type | DONE | confidence-band.service.ts:58-74 |
| FR-015 | A6: Color-coded chip, accessible | NOT_FOUND | No UI component found |
| FR-015 | A7: Accountability banner | NOT_FOUND | No UI component found |
| FR-016 | A1: Mandatory field validation | DONE | master-validator.ts:61-72 |
| FR-016 | A2: Normalize + Levenshtein | DONE | master-validator.ts:99-153,213-215 |
| FR-016 | A3: Failed → never silently routes | DONE | classification-pipeline.service.ts:208,215 |
| FR-016 | A4: Free-text with source span | DONE | types.ts:15-20; rule-based.extractor.ts:194-201 |
| FR-016 | A5: Outcomes PASS/FUZZY/FAIL | DONE | master-validator.ts:101-161 |
| FR-016 | A6: Validation <=500ms p95 | PARTIAL | Synchronous; no latency tracking |

**Module B: 24 DONE, 3 PARTIAL, 2 STUB, 3 NOT_FOUND (32 items)**

---

### Module C — Attachment Processing & OCR

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-020 | A1: MIME whitelist | DONE | attachment.service.ts:13-22 |
| FR-020 | A2: 25MB per-file, 75MB aggregate | PARTIAL | Per-file done; no aggregate limit |
| FR-020 | A3: AV before preview | DONE | attachment.service.ts:176,248; av-scanner.service.ts:139-184 |
| FR-021 | A1: OCR on missing text-layer | STUB | ocr.service.ts:205-243 — processes all, no sparse check |
| FR-021 | A2: Word-level confidence | NOT_FOUND | Only document-level ocr_confidence |
| FR-021 | A3: In-region; cloud fallback India | STUB | tesseract.js stub; no region selection |
| FR-022 | A1: Document type classification | DONE | document-classifier.service.ts:6-15,139-198 |
| FR-022 | A2: <0.7 → OTHER; user override | PARTIAL | Threshold done; no UI override |
| FR-023 | A1: Valuation field extraction | DONE | field-extractor.service.ts:7-13,73-81 |
| FR-023 | A2: Legal opinion extraction | DONE | field-extractor.service.ts:18-23,86-93 |
| FR-023 | A3: Templates versioned/pluggable | STUB | Static regex; no versioning |
| FR-023 | A4: Fields to extracted_fields_json | PARTIAL | Written to JSON; no Officer confirmation propagation |
| FR-024 | A1: DMS persistence | STUB | schema.prisma:274 (dms_external_id field only) |
| FR-024 | A2: dms_external_id surfaced | STUB | Field exists; not populated or surfaced |

**Module C: 5 DONE, 3 PARTIAL, 5 STUB, 1 NOT_FOUND (14 items)**

---

### Module D — Case Creation & Routing

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-030 | A1: ATL-YYYY-NNNNNN | DONE | case-creation.service.ts:537-555 |
| FR-030 | A2: NER + LMS attributes | DONE | case-creation.service.ts:71-99,105-116 |
| FR-030 | A3: TAT from masters + hours | DONE | case-creation.service.ts:84-91 |
| FR-030 | A4: NEW → CLASSIFIED → ROUTED | DONE | case-creation.service.ts:110-155 |
| FR-030 | A5: Auto-ack with signed URL | DONE | auto-ack.service.ts:110-154 |
| FR-031 | A1: Routing by type+pin/city/zone | DONE | routing.service.ts:68-253,178-230 |
| FR-031 | A2: OOO → delegate → escalate | PARTIAL | routing.service.ts:301-337; manual queue, not full escalation |
| FR-031 | A3: Workload-balancing toggle | DONE | routing.service.ts:13-17 (ROUTING_WORKLOAD_BALANCE) |
| FR-031 | A4: Skill-based routing | DONE | routing.service.ts:275-279,428-432 |
| FR-031 | A5: Routing decision logged | DONE | case-creation.service.ts:146-155 |
| FR-032 | A1: Vendor filter by geo+type | DONE | vendor-selection.service.ts:35-84 |
| FR-032 | A2: Selection algorithms | PARTIAL | Round-robin, lowest-TAT, scorecard; no manual option |
| FR-032 | A3: Officer override | NOT_FOUND | — |
| FR-033 | A1: Template with merge fields | DONE | notification-dispatch.service.ts:141-147 |
| FR-033 | A2: Officer review before dispatch | NOT_FOUND | — |
| FR-033 | A3: Outbound threaded + TAT | PARTIAL | Logged but no explicit threading or TAT counting |
| FR-033 | A4: Bounces → fallback | DONE | notification-dispatch.service.ts:440-490 |
| FR-034 | A1: Manual link cases | DONE | case-creation.service.ts:411-467; cases.controller.ts:436-455 |
| FR-034 | A2: Bulk merge up to 10 | NOT_FOUND | — |
| FR-034 | A3: Linked share thread_id | PARTIAL | schema.prisma:196 thread_id field; no propagation logic |
| FR-035 | A1: Multi-select 100 actions | DONE | cases.controller.ts:193-343 |
| FR-035 | A2: N individual audit entries | DONE | cases.controller.ts:214-333 |

**Module D: 15 DONE, 4 PARTIAL, 0 STUB, 3 NOT_FOUND (22 items)**

---

### Module E — Master Data Management

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-040 | A1: Maker → PENDING | DONE | maker-checker.service.ts:90-122 |
| FR-040 | A2: Checker APPROVE/REJECT | DONE | maker-checker.service.ts:127-203 |
| FR-040 | A3: effective_at | DONE | maker-checker.service.ts:96; schema.prisma:762 |
| FR-040 | A4: Version retained; rollback | DONE | maker-checker.service.ts:208-241 |
| FR-040 | A5: Self-approval forbidden | DONE | maker-checker.service.ts:142-146 |
| FR-041 | A1: CSV/Excel upload + validation | DONE | bulk-import.service.ts:100-208 |
| FR-041 | A2: Batch → maker-checker | DONE | bulk-import.service.ts:214-246 |
| FR-041 | A3: Export CSV | DONE | masters.controller.ts:303-346 |
| FR-042 | A1: effective_from/to | DONE | schema.prisma:333-334 (all masters) |
| FR-042 | A2: Active at timestamp | DONE | effective-dating.service.ts:86-126 |
| FR-042 | A3: One-click rollback | DONE | maker-checker.service.ts:208-241 |
| FR-043 | A1: before/after JSON | DONE | schema.prisma:750-751 |
| FR-043 | A2: Audit log entry | DONE | audit-log.service.ts:73-120 |

**Module E: 13 DONE, 0 PARTIAL, 0 STUB, 0 NOT_FOUND (13 items)**

---

### Module F — Collateral Team Web Workbench

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-050 | A1: My/team queue FIFO | PARTIAL | CaseList.tsx:74-118; no overdue pinning |
| FR-050 | A2: Toggle FIFO/criticality | PARTIAL | CaseList.tsx:88-90; column sort only |
| FR-050 | A3: Saved views | NOT_FOUND | — |
| FR-050 | A4: Inline filters (8 types) | PARTIAL | 4 of 8 filters implemented |
| FR-050 | A5: Full-text + semantic search | STUB | Simple substring; no semantic search |
| FR-051 | A1: Three-pane layout | DONE | CaseDetail.tsx:220-225 |
| FR-051 | A2: Action panel (7 actions) | PARTIAL | Status/note/close; missing pause SLA, approve/reject |
| FR-051 | A3: Inline attachment preview | DONE | CaseDetail.tsx:132-175 |
| FR-051 | A4: Hover entity → source span | STUB | Entities mock; no hover tooltip |
| FR-052 | A1: Next-best-action suggestions | NOT_FOUND | — |
| FR-052 | A2: Template + TAT impact shown | NOT_FOUND | — |
| FR-052 | A3: Accept/edit/reject | NOT_FOUND | — |
| FR-053 | A1: LLM draft body | STUB | schema.prisma:644-663; no generation service |
| FR-053 | A2: Inline edit with redline | STUB | Schema supports edited_body; no UI |
| FR-053 | A3: PII redaction lint | DONE | pii-redaction.service.ts exists |
| FR-054 | A1: Notes private | PARTIAL | CaseActivityLog-based; no explicit "internal" flag |
| FR-054 | A2: @mention → notification | NOT_FOUND | — |
| FR-054 | A3: Notes searchable, compliance gated | PARTIAL | Activity tab shows notes; no compliance unlock |
| FR-055 | A1: Pause with reason | DONE | sla-clock.service.ts:338-363 |
| FR-055 | A2: tat_paused_total_seconds | DONE | schema.prisma:172; sla-clock.service.ts:298-314 |
| FR-055 | A3: Auto-resume on inbound | DONE | intake-orchestrator.service.ts:135-137 |
| FR-056 | A1: Close requires resolution | DONE | state-machine.service.ts:39-48 |
| FR-056 | A2: Auto-close 30 days | DONE | case-creation.service.ts:314-360; types.ts:50 |
| FR-056 | A3: Reopen within 60 days | DONE | state-machine.service.ts:50-65; types.ts:45 |
| FR-057 | A1: Keyboard shortcuts | NOT_FOUND | — |
| FR-057 | A2: WCAG 2.1 AA | STUB | ConfidenceAccessibility.spec.tsx — partial |
| FR-057 | A3: Light/dark mode | DONE | Layout.tsx theme toggle |
| FR-057 | A4: Browser notification CRITICAL | STUB | Backend notifications; no browser API |

**Module F: 10 DONE, 6 PARTIAL, 6 STUB, 6 NOT_FOUND (28 items)**

---

### Module G — SLA Monitoring & Escalation

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-060 | A1: Business-hours SLA clock | DONE | sla-clock.service.ts:279-282; business-hours.ts:105-160 |
| FR-060 | A2: Paused time excluded | DONE | sla-clock.service.ts:298-310 |
| FR-060 | A3: Live countdown + warn_at | DONE | sla-clock.service.ts:263-332,523-534 |
| FR-061 | A1: L1 at breach + delay | PARTIAL | escalation.service.ts:79-85; delay_after_breach_hrs not wired |
| FR-061 | A2: Levels fire after delay | PARTIAL | Repeat cooldown only; no initial delay |
| FR-061 | A3: Recipients roles+users, multi-channel | DONE | escalation.service.ts:317-355; types.ts:1-7 |
| FR-061 | A4: Repeat until action | PARTIAL | Time-based repeat; no stop_on_action |
| FR-061 | A5: Events fully logged | DONE | escalation.service.ts:372-388 |
| FR-062 | A1: ML p_breach hourly | NOT_FOUND | — |
| FR-062 | A2: p_breach >0.7 → Lead | NOT_FOUND | — |
| FR-062 | A3: Predicted-vs-actual monthly | NOT_FOUND | — |
| FR-063 | A1: ON_HOLD → paused | DONE | escalation.service.ts:52-56,226-229 |
| FR-063 | A2: Holiday/weekend suppression | DONE | escalation.service.ts:426-463 |
| FR-063 | A3: Acknowledged → cooldown | STUB | Time-based; not action-based |

**Module G: 7 DONE, 3 PARTIAL, 1 STUB, 3 NOT_FOUND (14 items)**

---

### Module H — Pendency Reports

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-070 | A1: 08:30 IST daily schedule | STUB | pendency-report.service.ts:116; no cron processor |
| FR-070 | A2: Overdue/Due/New/Approaching | PARTIAL | Different section structure than BRD |
| FR-070 | A3: Case links, signed URLs | NOT_FOUND | — |
| FR-070 | A4: HTML + plain-text | STUB | No template rendering |
| FR-070 | A5: WhatsApp/SMS in parallel | STUB | Hardcoded EMAIL only |
| FR-071 | A1: Custom schedules per scope | PARTIAL | Role-level only; no region/case_type |
| FR-071 | A2: Midday refresh opt-in | NOT_FOUND | — |
| FR-071 | A3: Vendor consolidated | NOT_FOUND | — |
| FR-072 | A1: EMAIL → SMS | DONE | bounce-detector.service.ts:41-129; notification-dispatch.service.ts:39-44 |
| FR-072 | A2: SMS → WhatsApp | DONE | notification-dispatch.service.ts:283-325 |
| FR-072 | A3: WhatsApp → IN_APP + Lead | DONE | notification-dispatch.service.ts:330-385 |
| FR-072 | A4: All attempts persisted | DONE | notification-dispatch.service.ts:174-259 |

**Module H: 4 DONE, 2 PARTIAL, 3 STUB, 3 NOT_FOUND (12 items)**

---

### Module K — Notifications & Omnichannel

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-100 | A1: 8 channels supported | PARTIAL | 5 of 8 channels (missing Slack, browser push, mobile push) |
| FR-100 | A2: Channel-specific template bodies | PARTIAL | Schema supports; no enforcement |
| FR-101 | A1: Handlebars placeholders | PARTIAL | Simple {{var}} interpolation; no conditionals |
| FR-101 | A2: Multi-language variants | DONE | schema.prisma:562,571 |
| FR-101 | A3: Admin preview mode | NOT_FOUND | — |
| FR-102 | A1: Status callbacks | PARTIAL | EMAIL bounce only; no SMS/WhatsApp callbacks |
| FR-102 | A2: Exponential backoff 5 retries | DONE | notification-dispatch.service.ts:49-57 |
| FR-102 | A3: Failure → channel fallback | DONE | notification-dispatch.service.ts:261-275 |

**Module K: 3 DONE, 4 PARTIAL, 0 STUB, 1 NOT_FOUND (8 items)**

---

### Module L — Reporting & Analytics

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-110 | A1: Real-time tiles | PARTIAL | sla.controller.ts:48-78; limited to SLA metrics |
| FR-110 | A2: Drill-down to case list | NOT_FOUND | — |
| FR-110 | A3: 30s auto-refresh | STUB | React Query; no polling interval |
| FR-111 | A1: Per-entity TAT percentiles | NOT_FOUND | — |
| FR-111 | A2: SLA % by dimension | PARTIAL | FPR breakdown; missing case_type/vendor/region |
| FR-111 | A3: Heatmaps | NOT_FOUND | — |
| FR-111 | A4: Trend charts | NOT_FOUND | — |
| FR-112 | A1: 7-day forecast | STUB | Model registry exists; no forecast pipeline |
| FR-112 | A2: Breach probability | STUB | Deterministic only; no ML |
| FR-112 | A3: Anomaly detection | NOT_FOUND | — |
| FR-113 | A1: Drag-and-drop builder | NOT_FOUND | — |
| FR-113 | A2: Save + schedule reports | NOT_FOUND | — |
| FR-113 | A3: OData v4 endpoint | STUB | Inbound Graph OData; no outbound |
| FR-114 | A1: DPDP evidence pack | PARTIAL | compliance.controller.ts:129-164; basic |
| FR-114 | A2: RBI audit pack | NOT_FOUND | — |
| FR-114 | A3: Master change report | DONE | maker-checker.service.ts:56-122 |

**Module L: 1 DONE, 3 PARTIAL, 4 STUB, 8 NOT_FOUND (16 items)**

---

### Module M — Compliance, Audit & Security

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-120 | A1: Right of access | DONE | dsr.service.ts:85-127 |
| FR-120 | A2: Right of correction | PARTIAL | Maker-checker for masters only |
| FR-120 | A3: Right of erasure | STUB | is_deleted flag; no anonymisation |
| FR-120 | A4: Consent ledger | DONE | consent-ledger.service.ts:1-170 |
| FR-120 | A5: DPO console | PARTIAL | REST endpoints; no unified UI |
| FR-121 | A1: India-region stores | NOT_FOUND | — |
| FR-121 | A2: Cross-border feature flag | NOT_FOUND | — |
| FR-121 | A3: In-country backups | NOT_FOUND | — |
| FR-122 | A1: AES-256-GCM at rest | DONE | encryption.service.ts:1-66 |
| FR-122 | A2: TLS 1.3, HSTS | NOT_FOUND | Infrastructure-level |
| FR-122 | A3: Key rotation | STUB | Static key; no rotation |
| FR-123 | A1: Logs PII-redacted | DONE | audit.interceptor.ts:83 |
| FR-123 | A2: AI prompts redacted | NOT_FOUND | — |
| FR-123 | A3: Exports default redacted | PARTIAL | Audit logs redacted; DSR reports not |
| FR-124 | A1: RBAC + ABAC | DONE | roles.guard.ts:35-100 |
| FR-124 | A2: Deny-by-default | DONE | roles.guard.ts:45-56 |
| FR-124 | A3: JIT elevation | NOT_FOUND | — |
| FR-125 | A1: OIDC SSO | PARTIAL | OIDC done; SAML not found |
| FR-125 | A2: MFA for admin | PARTIAL | mfa.guard.ts:1-77; @RequiresMfa not applied |
| FR-125 | A3: Session policies | STUB | JWT 60m expiry; no policy enforcement |
| FR-126 | A1: Hash-chain audit log | DONE | audit-log.service.ts:82-138 |
| FR-126 | A2: 7-year retention | DONE | dsr.service.ts documents 7-year policy |
| FR-126 | A3: WORM replication | STUB | AuditLog table only; no WORM |
| FR-127 | A1: Quarterly VAPT | NOT_FOUND | Process; not code |
| FR-127 | A2: Secrets in Vault | STUB | Environment variables; no Vault |
| FR-127 | A3: OWASP ASVS L2 | NOT_FOUND | — |
| FR-128 | A1: LLM_ENABLED toggle | DONE | llm-mode.config.ts:27-47 |
| FR-128 | A2: OFF mode fallback | DONE | classification-pipeline.service.ts:46-84 |
| FR-128 | A3: 80% accuracy floor | DONE | ONNX-only ~86.5% |
| FR-128 | A4: Auto-engagement | DONE | classification-pipeline.service.ts:50-55 |
| FR-128 | A5: Mode banner in UI | DONE | LlmModeBanner component |
| FR-128 | A6: Quarterly drill | PARTIAL | llm-off-drill.ts script; no schedule |
| FR-129 | A1: Dev/UAT isolation | NOT_FOUND | — |
| FR-129 | A2: Synthetic corpus | DONE | generator/prompts.ts:1-80 |
| FR-129 | A3: Signed, versioned | PARTIAL | Generated; no signing |
| FR-129 | A4: Prod data pre-prod only | NOT_FOUND | — |
| FR-129 | A5: Benchmark on synthetic | DONE | benchmark/src/runner |

**Module M: 15 DONE, 7 PARTIAL, 5 STUB, 10 NOT_FOUND (37 items)**

---

### Module N — AI Governance & Continuous Learning

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-130 | A1: Model metadata | PARTIAL | model-registry.ts:8-17; missing hash, risk class |
| FR-130 | A2: Promotion approvals | STUB | No DEV→UAT→PROD pipeline |
| FR-130 | A3: One-click rollback | PARTIAL | Rollback for masters; not model-specific |
| FR-131 | A1: PSI + drift daily | PARTIAL | drift-monitor.service.ts:5-17; weekly, no PSI |
| FR-131 | A2: Drift alerts | PARTIAL | Logger.warn(); no PagerDuty/Opsgenie |
| FR-132 | A1: Triage queue one-click | DONE | triage.controller.ts:66-275 |
| FR-132 | A2: Corrections → training data | STUB | Logged in CaseActivityLog; no pipeline |
| FR-132 | A3: Periodic retraining | NOT_FOUND | — |
| FR-133 | A1: Rationale + alternatives | DONE | schema.prisma:614-621 |
| FR-133 | A2: Token-level NER confidence | STUB | No per-token confidence |
| FR-133 | A3: "Why this routing?" panel | PARTIAL | routing_rationale field; no UI panel |
| FR-134 | A1: Disparity check | STUB | No fairness audit service |
| FR-134 | A2: Findings → MLOps | NOT_FOUND | — |

**Module N: 2 DONE, 5 PARTIAL, 4 STUB, 2 NOT_FOUND (13 items)**

---

### Module O — Integration & APIs

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-140 | A1: REST + OpenAPI 3.0 | DONE | main.ts:16,27-34 |
| FR-140 | A2: OAuth 2.0 + OIDC | PARTIAL | JWT auth; client credentials for Graph only |
| FR-140 | A3: Versioned /v1 | PARTIAL | /v1 done; no /v2 or deprecation policy |
| FR-141 | A1: Webhook subscriptions | NOT_FOUND | — |
| FR-141 | A2: HMAC signed payloads | NOT_FOUND | — |
| FR-142 | A1: LMS loan lookup | STUB | Schema fields; no LMS integration |
| FR-142 | A2: Case push to LMS | NOT_FOUND | — |
| FR-142 | A3: Batch SFTP fallback | NOT_FOUND | — |
| FR-143 | A1: DMS store/retrieve | STUB | Object storage; no DMS API |
| FR-143 | A2: CRM case-linking | NOT_FOUND | — |
| FR-143 | A3: AD SCIM 2.0 | PARTIAL | Graph OAuth2; no SCIM endpoint |
| FR-144 | A1: Outbound SMTP + DKIM | PARTIAL | SMTP configured; no DKIM signing |
| FR-144 | A2: Inbound Graph/IMAP | PARTIAL | Graph polling; no IMAP IDLE |

**Module O: 1 DONE, 5 PARTIAL, 2 STUB, 5 NOT_FOUND (13 items)**

---

### Module P — Admin & Configuration

| FR | AC | Verdict | Evidence |
|----|-----|---------|----------|
| FR-150 | A1: Multi-environment isolation | PARTIAL | Single atlas_dev; NODE_ENV check only |
| FR-150 | A2: Promotable signed manifest | NOT_FOUND | — |
| FR-151 | A1: Feature flags per scope | PARTIAL | FeatureFlags.tsx:12-60; missing env/region/rollout% |
| FR-151 | A2: Toggle audit log | STUB | Audit infra exists; not wired to flags |
| FR-152 | A1: Routing-rule simulator | NOT_FOUND | — |
| FR-152 | A2: A/B testing | NOT_FOUND | — |
| FR-153 | A1: Health dashboard | PARTIAL | health.controller.ts; HealthDashboard.tsx (mock) |
| FR-153 | A2: PagerDuty/Opsgenie | NOT_FOUND | — |
| FR-153 | A3: SLO burn-rate alerts | NOT_FOUND | — |
| FR-154 | A1: Daily + hourly backup | NOT_FOUND | Infrastructure-level |
| FR-154 | A2: Cross-region replication | NOT_FOUND | — |
| FR-154 | A3: Quarterly DR drills | NOT_FOUND | — |
| FR-155 | A1: Secondary mailbox | STUB | source_mailbox field; no provider |
| FR-155 | A2: DNS MX split | NOT_FOUND | — |
| FR-155 | A3: Poll both + dedup | STUB | Polling exists; no dual-provider |
| FR-155 | A4: Outbound SMTP failover | DONE | auto-ack.service.ts:76-98 |
| FR-155 | A5: SMS/WhatsApp fallback | PARTIAL | Transport stubs exist |
| FR-155 | A6: Cached workbench | NOT_FOUND | — |
| FR-155 | A7: Quarterly failover drill | NOT_FOUND | — |
| FR-156 | A1: on_time_response_rate weekly | PARTIAL | schema.prisma:433 field; no scheduler |
| FR-156 | A2: Multi-channel equivalent | NOT_FOUND | — |
| FR-156 | A3: Tier rules | STUB | Scorecard exists; no tier logic |
| FR-156 | A4: Contractual precondition | NOT_FOUND | Process; not code |
| FR-156 | A5: Scorecard leads with rate | PARTIAL | tatCompliancePercent shown; not prioritized |

**Module P: 1 DONE, 6 PARTIAL, 4 STUB, 13 NOT_FOUND (24 items)**

---

## Phase 4 — Gap List

### Category A — NOT_FOUND (59 items)

| # | FR | AC | Description | Size | Priority |
|---|----|----|-------------|------|----------|
| 1 | FR-002 | A4 | Hyperlink click-time protection rewrite | M | P1 |
| 2 | FR-014 | A2 | Embedding-based near-duplicate detection | L | P1 |
| 3 | FR-015 | A6 | Confidence band color-coded chip (accessible) | S | P0 |
| 4 | FR-015 | A7 | Accountability banner (non-dismissable) | S | P0 |
| 5 | FR-021 | A2 | Word-level OCR confidence flagging | M | P1 |
| 6 | FR-032 | A3 | Vendor officer override UI/API | S | P1 |
| 7 | FR-033 | A2 | Officer review/approval before dispatch | M | P1 |
| 8 | FR-034 | A2 | Bulk merge up to 10 cases | M | P1 |
| 9 | FR-050 | A3 | Saved views per user | M | P2 |
| 10 | FR-052 | A1 | AI-suggested next actions | L | P1 |
| 11 | FR-052 | A2 | Template + recipient + TAT shown | M | P1 |
| 12 | FR-052 | A3 | Accept/edit/reject suggestions | M | P1 |
| 13 | FR-054 | A2 | @mention → in-app + email notification | M | P1 |
| 14 | FR-057 | A1 | Configurable keyboard shortcuts | M | P2 |
| 15 | FR-062 | A1 | Predictive breach ML model | XL | P1 |
| 16 | FR-062 | A2 | p_breach surfaced to Lead | M | P1 |
| 17 | FR-062 | A3 | Predicted-vs-actual monthly metric | M | P2 |
| 18 | FR-070 | A3 | Case links with signed-token URLs | M | P1 |
| 19 | FR-071 | A2 | Midday refresh opt-in | S | P2 |
| 20 | FR-071 | A3 | Vendor pendency consolidated | M | P1 |
| 21 | FR-101 | A3 | Admin template preview mode | S | P2 |
| 22 | FR-110 | A2 | Dashboard drill-down to case list | M | P1 |
| 23 | FR-111 | A1 | Per-entity TAT percentiles | M | P1 |
| 24 | FR-111 | A3 | Geographic/time heatmaps | L | P2 |
| 25 | FR-111 | A4 | 30/60/90-day trend charts | M | P1 |
| 26 | FR-112 | A3 | Anomaly detection inbound volume | L | P2 |
| 27 | FR-113 | A1 | Drag-and-drop report builder | XL | P2 |
| 28 | FR-113 | A2 | Saved/scheduled reports | L | P2 |
| 29 | FR-114 | A2 | RBI audit pack | M | P1 |
| 30 | FR-121 | A1 | India-region store enforcement | S | P0 |
| 31 | FR-121 | A2 | Cross-border feature flag + approval | M | P0 |
| 32 | FR-121 | A3 | In-country backups | S | P0 |
| 33 | FR-122 | A2 | TLS 1.3 / HSTS config | S | P1 |
| 34 | FR-123 | A2 | AI prompt PII redaction | M | P1 |
| 35 | FR-124 | A3 | JIT elevation time-boxed | M | P2 |
| 36 | FR-127 | A1 | Quarterly VAPT | XS | P2 |
| 37 | FR-127 | A3 | OWASP ASVS L2 mapping | L | P2 |
| 38 | FR-129 | A1 | Dev/UAT production isolation | S | P1 |
| 39 | FR-129 | A4 | Prod data pre-prod only | S | P1 |
| 40 | FR-132 | A3 | Periodic retraining pipeline | L | P2 |
| 41 | FR-134 | A2 | Bias findings → MLOps triage | M | P2 |
| 42 | FR-141 | A1 | Webhook subscription system | L | P1 |
| 43 | FR-141 | A2 | HMAC-signed webhook payloads | M | P1 |
| 44 | FR-142 | A2 | Case-status push to LMS | M | P1 |
| 45 | FR-142 | A3 | Batch SFTP fallback | M | P2 |
| 46 | FR-143 | A2 | CRM case-linking integration | M | P2 |
| 47 | FR-150 | A2 | Signed config promotion manifest | M | P2 |
| 48 | FR-152 | A1 | Routing-rule simulator | L | P2 |
| 49 | FR-152 | A2 | A/B testing framework | L | P2 |
| 50 | FR-153 | A2 | PagerDuty/Opsgenie integration | M | P2 |
| 51 | FR-153 | A3 | SLO burn-rate alerts | M | P2 |
| 52 | FR-154 | A1 | Daily + hourly backup scheduler | M | P2 |
| 53 | FR-154 | A2 | Cross-region replication | M | P2 |
| 54 | FR-154 | A3 | Quarterly DR drills | XS | P2 |
| 55 | FR-155 | A2 | DNS MX split priorities | M | P2 |
| 56 | FR-155 | A6 | Cached workbench offline mode | L | P2 |
| 57 | FR-155 | A7 | Quarterly failover drill | XS | P2 |
| 58 | FR-156 | A2 | Multi-channel response equivalence | M | P1 |
| 59 | FR-156 | A4 | Contractual precondition gate | XS | P2 |

### Category B — STUB (38 items)

| # | FR | AC | Description | Size |
|---|----|----|-------------|------|
| 1 | FR-001 | A5 | Mailbox outage resilience/replay | M |
| 2 | FR-004 | A4 | 90-day look-back window config | S |
| 3 | FR-010 | A2 | Multi-label → multiple Cases | L |
| 4 | FR-011 | A2 | Per-entity F1 >=0.90 calibration | M |
| 5 | FR-021 | A1 | OCR sparse text-layer detection | S |
| 6 | FR-021 | A3 | In-region/cloud fallback logic | M |
| 7 | FR-023 | A3 | Template versioning/vendor plugins | M |
| 8 | FR-024 | A1 | DMS persistence integration | L |
| 9 | FR-024 | A2 | dms_external_id population | M |
| 10 | FR-050 | A5 | Semantic search backend | L |
| 11 | FR-051 | A4 | Entity hover → source span UI | M |
| 12 | FR-053 | A1 | LLM reply draft generation | L |
| 13 | FR-053 | A2 | Inline edit with redline diff | M |
| 14 | FR-057 | A2 | WCAG 2.1 AA full compliance | L |
| 15 | FR-057 | A4 | Browser push for CRITICAL | M |
| 16 | FR-063 | A3 | Action-based escalation cooldown | S |
| 17 | FR-070 | A1 | Daily pendency cron processor | M |
| 18 | FR-070 | A4 | HTML + plain-text rendering | M |
| 19 | FR-070 | A5 | Multi-channel pendency dispatch | M |
| 20 | FR-110 | A3 | 30s auto-refresh dashboard | S |
| 21 | FR-112 | A1 | Case volume forecast pipeline | XL |
| 22 | FR-112 | A2 | Breach probability ML | XL |
| 23 | FR-113 | A3 | OData v4 outbound endpoint | L |
| 24 | FR-120 | A3 | Erasure anonymisation pipeline | L |
| 25 | FR-122 | A3 | Key rotation automation | M |
| 26 | FR-125 | A3 | Session policy enforcement | M |
| 27 | FR-126 | A3 | WORM replication | M |
| 28 | FR-127 | A2 | Vault/Secrets Manager integration | M |
| 29 | FR-130 | A2 | Model promotion approval pipeline | L |
| 30 | FR-132 | A2 | Corrections → training data pipeline | M |
| 31 | FR-133 | A2 | Token-level NER confidence display | M |
| 32 | FR-134 | A1 | Bias/fairness disparity check | L |
| 33 | FR-142 | A1 | LMS loan-account lookup API | L |
| 34 | FR-143 | A1 | DMS API integration | L |
| 35 | FR-151 | A2 | Feature flag toggle audit | S |
| 36 | FR-155 | A1 | Secondary mailbox provider | M |
| 37 | FR-155 | A3 | Dual-provider dedup polling | M |
| 38 | FR-156 | A3 | Vendor tier classification rules | S |

### Category C — PARTIAL (54 items)

Partially implemented items with specific gaps noted in the traceability matrix above.

---

## Phase 6 — Scorecard

### Coverage Metrics

```
LINE-ITEM COVERAGE
==================
Total auditable items:            267
  Module A (Email Ingest):         21
  Module B (AI Classification):    32
  Module C (Attachment/OCR):       14
  Module D (Case/Routing):         22
  Module E (Master Data):          13
  Module F (Workbench):            28
  Module G (SLA/Escalation):       14
  Module H (Pendency Reports):     12
  Module K (Notifications):         8
  Module L (Reporting):            16
  Module M (Compliance):           37
  Module N (AI Governance):        13
  Module O (Integration):          13
  Module P (Admin):                24

Implementation Verdicts:
  DONE:                116 / 267 = 43.4%
  PARTIAL:              54 / 267 = 20.2%
  STUB:                 38 / 267 = 14.2%
  NOT_FOUND:            59 / 267 = 22.1%

Implementation Rate (DONE+PARTIAL): 170 / 267 = 63.7%

P0 Gaps (blockers):
  1. FR-015 A6+A7: Confidence band UI + accountability banner (Section 1.5 mandate)
  2. FR-121 A1-A3: RBI data localisation enforcement (regulatory)

Total P0 Gaps: 2 (down from ~8 in Round 1)
```

### Module-Level Summary

| Module | Items | DONE | PARTIAL | STUB | NF | DONE% |
|--------|-------|------|---------|------|----|-------|
| A Email Ingest | 21 | 15 | 3 | 2 | 1 | 71.4% |
| B AI/NER | 32 | 24 | 3 | 2 | 3 | 75.0% |
| C Attach/OCR | 14 | 5 | 3 | 5 | 1 | 35.7% |
| D Case/Route | 22 | 15 | 4 | 0 | 3 | 68.2% |
| E Master Data | 13 | 13 | 0 | 0 | 0 | **100%** |
| F Workbench | 28 | 10 | 6 | 6 | 6 | 35.7% |
| G SLA/Escalation | 14 | 7 | 3 | 1 | 3 | 50.0% |
| H Pendency | 12 | 4 | 2 | 3 | 3 | 33.3% |
| K Notifications | 8 | 3 | 4 | 0 | 1 | 37.5% |
| L Reporting | 16 | 1 | 3 | 4 | 8 | 6.3% |
| M Compliance | 37 | 15 | 7 | 5 | 10 | 40.5% |
| N AI Governance | 13 | 2 | 5 | 4 | 2 | 15.4% |
| O Integration | 13 | 1 | 5 | 2 | 5 | 7.7% |
| P Admin | 24 | 1 | 6 | 4 | 13 | 4.2% |

### Compliance Verdict

| Criterion | Value | Threshold | Status |
|-----------|-------|-----------|--------|
| ACs DONE | 43.4% | >= 70% | FAIL |
| P0 Gaps | 2 | <= 3 | PASS |

**Verdict: AT-RISK** (43.4% ACs DONE, below 70% threshold)

### Improvement from Round 1

| Metric | Round 1 | Round 2 | Delta |
|--------|---------|---------|-------|
| DONE % | 31.3% | 43.4% | **+12.1pp** |
| P0 gaps | ~8 | 2 | **-6** |
| Test count | 378 | 560 | **+182** |
| Modules fully covered | 0 | 1 (E) | **+1** |
| DONE items (est.) | ~65 | 116 | **+51** |

---

## Top 10 Priority Actions

| # | Action | Impact | Effort | Modules |
|---|--------|--------|--------|---------|
| 1 | **Confidence band UI + accountability banner** (FR-015 A6-A7) — color-coded chip with icon, non-dismissable banner per Section 1.5 | Resolves P0; +2 DONE | S | B, F |
| 2 | **RBI data localisation enforcement** (FR-121 A1-A3) — config guards for India-region stores, cross-border feature flag | Resolves P0; regulatory | S | M |
| 3 | **Workbench action panel completion** (FR-051 A2, FR-050 A1-A4) — add Pause SLA, Approve/Reject buttons; overdue pinning; 4 missing filters | +6 items to DONE/PARTIAL | M | F |
| 4 | **Pendency report scheduler + formatting** (FR-070 A1-A5, FR-071) — cron processor, BRD-compliant sections, HTML/text templates, multi-channel | +8 items; cross-cutting | M | H |
| 5 | **Dashboard drill-down + auto-refresh + trend charts** (FR-110, FR-111 A2-A4) — clickable tiles, 30s polling, SLA% by dimension, trend lines | +7 items; high visibility | M | L |
| 6 | **Escalation delay_after_breach_hrs + stop_on_action** (FR-061 A1-A2-A4, FR-063 A3) — wire schema field, action-based suppression | +4 PARTIAL→DONE | S | G |
| 7 | **OCR sparse-text detection + word confidence** (FR-021 A1-A2, FR-022 A2) — text-layer check, per-word confidence, user override | +3 items | M | C |
| 8 | **Notification channels + templating** (FR-100 A1, FR-101 A1-A3) — Handlebars engine, admin preview, remaining channels | +4 items | M | K |
| 9 | **@mention notifications + AI suggestions stub** (FR-054 A2, FR-052 A1-A3) — @mention parsing, next-action placeholder | +4 items | M | F |
| 10 | **Webhook subscription system** (FR-141 A1-A2) — event subscription API, HMAC-signed payloads | +2 items; integration-critical | M | O |

---

*Generated: 2026-04-29 | Auditor: Claude Code | Round: 2 of N*
