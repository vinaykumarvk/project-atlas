# Full Review Report - Project Atlas Full Repository

Date: 2026-04-30
Reviewer: Codex full-review skill
Scope: Full repository review of API, web, shared package, CI, Docker/deployment files, and tests.
Mode: Default full-review, including guardrails, coding standards, UI, quality, security, infrastructure, sanity verification, and high-priority remediation.

## 1. Scope and Options

Reviewed repository areas:

- Root workspace configuration: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, TypeScript config, lint config, ignore files.
- API package: NestJS modules, auth/session handling, controllers, services, migrations, and Jest tests.
- Web package: React app, auth context, API client, pages, components, accessibility patterns, and Vitest tests.
- CI/CD and deployment: `.github/workflows`, Docker Compose variants, environment examples.
- Documentation and prior review artifacts under `doc/` and `docs/`.

Assumptions:

- This review was performed against the current local workspace, not a clean remote branch.
- The working tree is broadly untracked. I did not revert, delete, or commit unrelated project files.
- Network access was not required for this review.

## 2. Sub-Review Summaries

| Review Area | Verdict | Summary |
| --- | --- | --- |
| Vibe coding guardrails | WARN | Found rapid-build residue: broad untracked baseline, localStorage token usage, inconsistent lint coverage, and many UI accessibility patterns that need cleanup. Critical token storage was remediated. |
| Coding standards | NEEDS WORK | Build, type-check, tests, and lint now pass. Lint still emits warnings, shared package lint is a placeholder, and broad frontend accessibility/type-safety debt remains. |
| UI review | NO-GO | Login page high-priority issues were fixed, but tables, buttons, modal overlays, and clickable rows/headers still have accessibility gaps. |
| Quality review | NEEDS WORK | Test coverage is substantial and passing. Remaining issues are mostly maintainability: production `any` usage, React test warnings, lint warnings, and incomplete shared package quality gates. |
| Security review | AT-RISK | The highest-risk browser token storage issue was fixed by moving to httpOnly session cookies. Remaining security risk is mostly gate hardening: CI security scans are non-blocking, dev credential patterns should be moved to seeded/env configuration, and example env values need cleanup. |
| Infrastructure review | CONDITIONAL | CI, Docker Compose, and workspace scripts exist and generally work. Security workflow uses `|| true`, Turbo reports missing test outputs, and release gates need stricter failure behavior. |
| Sanity check | CONDITIONAL | `pnpm build`, `pnpm type-check`, `pnpm lint`, and `pnpm test` all pass after remediation. Warnings remain and are captured below. |

## 3. Severity-Mapped Finding Table

| ID | Severity | Area | Evidence | Status | Recommendation |
| --- | --- | --- | --- | --- | --- |
| F-001 | CRITICAL | Security | Web auth stored access and refresh tokens in browser storage and attached bearer tokens client-side. | Fixed | Replaced client token storage with BFF session cookies, `credentials: 'include'`, and CSRF header support. Keep tokens out of JS-accessible storage. |
| F-002 | CRITICAL | Build gate | `pnpm lint` failed because the web package had no applicable ESLint config and scanned the wrong target. | Fixed | Added root ESLint config and ignore file; scoped web lint to `src/**/*.{ts,tsx}`. |
| F-003 | HIGH | Auth/UI | Login page exposed plaintext development credentials and lacked important auth form semantics. | Fixed | Gated dev hint behind `VITE_SHOW_DEV_CREDENTIALS=true`, removed plaintext password, added `autocomplete`, alert semantics, mobile-safe height, and 1rem input sizing. |
| F-004 | HIGH | UI accessibility | Many buttons lack explicit `type`, including `CaseDetail`, `CaseList`, admin, masters, compliance, and triage components. | Open | Add `type="button"` to non-submit buttons and `type="submit"` only where form submission is intended. |
| F-005 | HIGH | UI accessibility | Sortable headers in `packages/web/src/pages/CaseList.tsx` use clickable `<th>` cells without keyboard support or `aria-sort`. | Open | Use buttons inside table headers, expose current sort through `aria-sort`, and support keyboard activation. |
| F-006 | HIGH | UI accessibility | Clickable table cells/rows and card-like divs are used for navigation without native semantics in `CaseList`, `CaseDetail`, and related pages. | Open | Replace with links/buttons or add appropriate role, tab index, keyboard handlers, and visible focus states. Prefer native controls. |
| F-007 | HIGH | UI accessibility | Modal/drawer overlays use clickable `<div>` patterns in `DisambiguationModal`, `KeyboardShortcutsModal`, admin user drawer, and masters drawers. | Open | Add dialog semantics, focus management, Escape handling, labelled titles, and predictable overlay dismissal. |
| F-008 | MEDIUM | UI accessibility | Table headers across dashboard, admin, masters, compliance, vendor, collateral, and case pages generally lack `scope="col"`. | Open | Add `scope="col"` or `scope="row"` as appropriate across all data tables. |
| F-009 | MEDIUM | Responsive UI | `packages/web/src/index.css` still contains global `min-height: 100vh` and fixed-width controls such as a 320px search input. | Open | Prefer `100dvh`, responsive `minmax`, and constrained width rules that do not overflow mobile viewports. |
| F-010 | MEDIUM | Security/config | API dev users/passwords are hardcoded in `packages/api/src/modules/auth/auth.service.ts`, guarded from production by `NODE_ENV`. | Open | Move dev credentials to explicit seeded fixtures or environment-driven local setup and document them outside production code paths. |
| F-011 | MEDIUM | Security/CI | `.github/workflows/security-scan.yml` runs `semgrep ci ... || true` and `pnpm audit --audit-level=high || true`. | Open | Make security scans fail the workflow for high/critical findings, or split advisory-only scans into a clearly named non-blocking workflow. |
| F-012 | MEDIUM | Quality | Production code still contains broad `any` usage in case creation, cases controller, classifiers, and masters flows. | Open | Replace `any` with DTOs, API response models, discriminated unions, or validated unknown parsing at boundaries. |
| F-013 | MEDIUM | Quality | Tests pass but emit React `act(...)` warnings and style warnings in web tests/components. | Open | Wrap asynchronous user-visible state changes correctly and remove mixed shorthand/longhand style declarations. |
| F-014 | MEDIUM | Quality gate | `packages/shared` lint script is a placeholder. | Open | Add real lint/type/test coverage for shared package exports. |
| F-015 | LOW | Infra | Turbo warns that API/web test tasks produce no configured output files. | Open | Update `turbo.json` outputs for coverage/test artifacts or mark tasks as intentionally no-output. |
| F-016 | LOW | Observability | Startup logging in `packages/api/src/main.ts` still uses direct `console.log`. | Open | Route startup/runtime logs through the app logger with structured fields and environment-aware levels. |
| F-017 | LOW | Config hygiene | Example env files include realistic-looking external DB/API placeholders. | Open | Replace with clearly fake local placeholders and document how real values are injected securely. |

## 4. Conflict Log

| Conflict | Resolution |
| --- | --- |
| Full-review default asks to fix high+ findings, but the repo contains a large number of broad UI accessibility findings across many screens. | Remediated the critical auth/lint blockers and login high-risk items first. Left the broad accessibility sweep open as a release blocker because it spans many components and needs focused regression review. |
| Full-review skill suggests commits per severity tier, but the local repository is almost entirely untracked. | No commit was created to avoid accidentally staging unrelated baseline files. |
| Existing BFF session code existed but was not wired into the app module. | Wired the middleware globally and reused existing session cookie and CSRF abstractions instead of introducing a parallel auth mechanism. |

## 5. Remediation Log

Completed changes:

- Added `.eslintrc.cjs` and `.eslintignore`.
- Updated `packages/web/package.json` lint command to scan only web source files.
- Updated `packages/web/src/auth/AuthContext.tsx` to stop storing access and refresh tokens in localStorage. The client now creates and clears server-side sessions through the BFF endpoint and only keeps non-sensitive user display state locally.
- Updated `packages/web/src/api/client.ts` to send credentialed requests, remove bearer token injection from browser storage, and include `x-csrf-token` for unsafe methods using the `atlas_csrf` cookie.
- Updated `packages/api/src/app.module.ts` to register `SessionMiddleware` globally.
- Updated `packages/api/src/modules/auth/bff/session.middleware.ts` to parse cookies when no cookie parser has populated `req.cookies`, promote the httpOnly session cookie to the server-side authorization header, and maintain CSRF cookie behavior.
- Updated `packages/api/src/modules/auth/bff/csrf.guard.ts` to use the configured session cookie constant.
- Updated `packages/api/src/modules/auth/bff/session.controller.ts` so session creation returns user/session metadata rather than raw JWTs.
- Updated web tests to seed only `atlas_user` instead of fake access/refresh tokens.
- Updated `packages/web/src/auth/LoginPage.tsx` to hide development credential hints by default, remove plaintext password display, improve auth form semantics, and use mobile-safe layout sizing.

Post-remediation token scan:

- `rg -n "localStorage.*token|sessionStorage.*token|atlas_access_token|atlas_refresh_token" packages --glob '!**/dist/**' --glob '!**/node_modules/**'` returned no matches.

## 6. Aggregate Gate Scorecard

| Gate | Result | Notes |
| --- | --- | --- |
| Build | PASS | `pnpm build` completed successfully. |
| Type-check | PASS | `pnpm type-check` completed successfully. |
| Lint | PASS WITH WARNINGS | `pnpm lint` now exits successfully. Remaining warnings are mostly unused variables/imports. |
| Tests | PASS WITH WARNINGS | `pnpm test` passed: API 95 suites / 1481 tests; web 21 suites / 226 tests. React Router future-flag warnings, React `act(...)` warnings, style warnings, and Turbo output warnings remain. |
| Security token storage | PASS | Client-side JWT/refresh token storage removed. |
| UI accessibility | FAIL | Remaining high-impact accessibility findings across buttons, tables, modal overlays, and clickable rows/headers. |
| CI release discipline | CONDITIONAL | Main CI is useful, but the dedicated security scan workflow is advisory because key commands use `|| true`. |

## 7. Unresolved Findings

Priority remediation plan:

1. UI accessibility sweep: fix button types, table header scopes, sortable header semantics, clickable rows/cells, modal/drawer dialog semantics, focus trapping, Escape handling, and visible focus states.
2. CI security hardening: remove `|| true` from high/critical Semgrep and audit gates or explicitly separate advisory scans from blocking release scans.
3. Type-safety cleanup: replace production `any` usage in case/classification/master flows with validated DTOs and typed API contracts.
4. Test warning cleanup: address React `act(...)` warnings and CSS style warnings so test output is signal-rich.
5. Shared package gate: replace placeholder shared lint script with real lint/type/test coverage.
6. Config hygiene: move local dev credentials to explicit seed/env setup and sanitize example env placeholders.
7. Turbo cache hygiene: configure test outputs or mark no-output tasks deliberately.

## 8. Final Verdict

Final verdict: FAIL for release readiness.

The repository is in a substantially better state after remediation: core build/type/test/lint gates pass, and the critical client-side token storage issue has been removed. The app should not be treated as release-ready yet because high-impact UI accessibility gaps remain across multiple user workflows, and the security scan workflow is currently non-blocking for findings that should fail a production release gate.
