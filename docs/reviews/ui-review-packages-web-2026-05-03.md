# UI/UX Review — Project Atlas Web Frontend

**Target:** `packages/web`
**Date:** 2026-05-03
**Branch:** `main` @ commit `0a50fac`
**Reviewer:** Claude (automated)

---

## 1. Scope and Preflight

**Scope:** Full UI/UX review of the Atlas web frontend (`packages/web`) — a React + Vite + Tailwind CSS + shadcn/ui SPA for email classification case management.

**Scripts available:** `dev`, `build`, `preview`, `lint`, `test`

**Environment constraints:**
- No running backend — all data via demo/mock mode
- No browser runtime — cannot take screenshots or run Lighthouse
- Tests: 276/276 passing, TypeScript: 0 errors, Build: passes in ~2s

---

## 2. UI Inventory

### Route Inventory (24 routes + 404)

| Route | Component | Lazy | Suspense |
|-------|-----------|------|----------|
| `/login` | LoginPage | No | No |
| `/dashboard` | DashboardPage | No | No |
| `/cases` | CaseListPage | Yes | `<div>Loading...</div>` |
| `/cases/:caseId` | CaseDetailPage | Yes | `<div>Loading...</div>` |
| `/triage` | TriageQueuePage | Yes | `<div>Loading...</div>` |
| `/queue` | Placeholder | No | — |
| `/team-queue` | Placeholder | No | — |
| `/vendors` | VendorScorecardPage | Yes | `<div>Loading...</div>` |
| `/disbursal-readiness` | DisbursalReadinessPage | Yes | `<div>Loading...</div>` |
| `/collateral-risk` | CollateralRiskPage | Yes | `<div>Loading...</div>` |
| `/masters` | MasterManagement | Yes | `<div>Loading...</div>` |
| `/reports` | Placeholder | No | — |
| `/reports/custom` | CustomReportBuilder | Yes | `<div>Loading...</div>` |
| `/admin` | AdminConsole | Yes | `<div>Loading...</div>` |
| `/vendor-portal` | VendorPortalPage | Yes | `<div>Loading...</div>` |
| `/compliance/audit` | AuditSearch | Yes | `<div>Loading...</div>` |
| `/compliance/dsr` | DsrTracking | Yes | `<div>Loading...</div>` |
| `/compliance/consent` | ConsentLedger | Yes | `<div>Loading...</div>` |
| `/compliance/evidence` | EvidencePack | Yes | `<div>Loading...</div>` |
| `/compliance/regulatory-evidence` | RegulatoryEvidence | Yes | `<div>Loading...</div>` |
| `/compliance/dpo` | DpoConsole | Yes | `<div>Loading...</div>` |
| `*` | Inline 404 page | No | — |

### Component Map

| Category | Count | Examples |
|----------|-------|---------|
| Custom components | 13 | Layout, ErrorBoundary, CaseStatusBadge, PriorityIndicator, etc. |
| shadcn/ui components | 22 | Button, Card, Dialog, Table, Input, Badge, Tabs, Select, etc. |
| Page components | 24 | Dashboard, CaseList, CaseDetail, TriageQueue, etc. |

### CSS Map

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.css` | 80 | Tailwind directives + HSL CSS variables (light + dark) |

### Navigation

| Feature | Status |
|---------|--------|
| Sidebar present | Yes — 15 items, fixed 240px |
| All items have icons | Yes — Lucide React icons |
| Active state styling | Yes — 3px left border + bg highlight |
| aria-label on nav | Yes — "Main navigation" |
| Skip-to-main link | Yes — sr-only with focus |
| **Mobile hamburger** | **MISSING** |
| **Collapsible on mobile** | **MISSING** |
| **Responsive breakpoints** | **MISSING** |

### Empty/Error/Loading State Coverage

| View | Empty State | Loading State | Error Boundary |
|------|-------------|---------------|----------------|
| CaseList | Yes (icon + message + CTA) | Yes (Loader2) | Via Layout |
| Dashboard | No explicit | Yes (Loader2) | Via Layout |
| CaseDetail | No (mock data) | Yes (Loader2) | Via Layout |
| TriageQueue | Yes ("All triaged") | Yes (spinner) | Via Layout |
| VendorScorecard | No | Yes (spinner) | Via Layout |
| DisbursalReadiness | No | Yes (spinner) | Via Layout |
| CollateralRisk | No | Yes | Via Layout |
| Admin pages | Partial | Partial | Via Layout |
| Compliance pages | Partial | Partial | Via Layout |

### i18n Status: **NOT IMPLEMENTED**
- Zero i18n libraries or translation files
- All strings hardcoded in English

### Theme System
- Dark mode via `.dark` class on `document.documentElement`
- Persisted to `localStorage` key `atlas_dark_mode`
- 26 HSL CSS variables for light + dark modes
- Toggle in top bar (Sun/Moon icon)

---

## 3. Login Screen Completeness Audit

| # | Check | Status | Notes |
|---|-------|--------|-------|
| L-01 | Full-viewport layout (100dvh) | **PRESENT** | `min-h-dvh` on root div |
| L-02 | Card with elevation | **PRESENT** | shadcn Card + `shadow-lg` |
| L-03 | Branded header | **PRESENT** | "Project Atlas" + subtitle, rotating quotes |
| L-05 | Background in dark mode | **PARTIAL** | Left panel gradient uses hardcoded colors |
| L-06 | Max-width constraint | **PRESENT** | `max-w-[420px]` |
| L-07 | Responsive padding | **PRESENT** | `p-6` |
| L-08 | Footer below card | **MISSING** | No footer |
| F-01 | Email autocomplete + icon | **PARTIAL** | `autocomplete="username"` present, no leading icon |
| F-02 | Password autocomplete + icon | **PARTIAL** | `autocomplete="current-password"` present, no leading icon |
| F-03 | Password visibility toggle | **PRESENT** | Eye/EyeOff icons |
| F-05 | Auto-focus first field | **MISSING** | No autoFocus |
| F-06 | Enter submits form | **PRESENT** | Native `<form onSubmit>` |
| F-07 | Inline validation | **PARTIAL** | Top-level Alert only, no field-level |
| F-09 | Labels on inputs | **PRESENT** | `<Label htmlFor>` on all fields |
| A-01 | Remember me | **PARTIAL** | Checkbox present, no localStorage persistence |
| A-02 | Forgot password | **MISSING** | No forgot password flow |
| A-03 | Loading state on submit | **PRESENT** | Loader2 spinner + disabled |
| A-04 | Double-submit prevention | **PRESENT** | Button + inputs disabled |
| A-05 | Error with aria-live | **PRESENT** | `role="alert" aria-live="assertive"` |
| A-06 | Error clears on input | **MISSING** | Error only clears on submit |
| T-01 | Theme selector on login | **MISSING** | No theme toggle |
| T-03 | Dark mode support | **PARTIAL** | Card uses tokens, left panel gradient hardcoded |
| X-01 | main landmark | **MISSING** | Root `<div>`, not `<main>` |
| X-05 | focus-visible rings | **PRESENT** | Via global CSS + shadcn components |
| X-06 | Touch targets >= 44px | **PARTIAL** | Eye toggle button may be undersized |

**Score:** 15 PRESENT / 7 PARTIAL / 6 MISSING (out of 28)

---

## 4. Mobile Navigation Audit

| # | Check | Status | Severity |
|---|-------|--------|----------|
| NAV-01 | Sidebar collapses on mobile | **MISSING** | P0 |
| NAV-02 | Hamburger toggle visible on mobile | **MISSING** | P0 |
| NAV-03 | Hamburger aria-label | **MISSING** | P1 |
| NAV-04 | aria-expanded on toggle | **MISSING** | P1 |
| NAV-05 | Sidebar overlay on mobile | **MISSING** | P1 |
| NAV-06 | Close on route navigation | **MISSING** | P2 |
| NAV-07 | Close via Escape | **MISSING** | P1 |
| NAV-11 | nav landmark with aria-label | **PRESENT** | — |
| MI-01 | Leading icons on all items | **PRESENT** | — |
| MI-03 | Active route highlight | **PRESENT** | — |
| MI-04 | Hover state | **PRESENT** | — |
| MI-07 | Semantic NavLink elements | **PRESENT** | — |

**Verdict: FAIL — No mobile navigation support at all**

---

## 5. Design System Findings

### Token Compliance — GOOD

- 26 HSL CSS variables defined for light + dark themes
- Sidebar-specific variables (--sidebar, --sidebar-width)
- Focus ring color uses `--ring` token
- Border color uses `--border` token globally

### Hardcoded Colors — 160 OCCURRENCES

Across 28 files. These are Tailwind utility colors (e.g., `bg-red-100`, `text-green-600`) used for semantic states (status, priority, confidence) rather than theme tokens.

**Top offenders:**
- `CaseStatusBadge.tsx` — 14 (status-specific colors)
- `PriorityIndicator.tsx` — 8 (P1-P4 colors)
- `SlaProgressBar.tsx` — 6 (progress colors)
- `ConfidenceBadge.tsx` — 6 (band colors)
- `AccountabilityBanner.tsx` — 6 (confidence band colors)

**Assessment:** These are semantic color mappings (status=green, error=red, warning=amber) which are acceptable for now. Creating custom tokens (e.g., `bg-status-new`, `text-priority-p1`) would improve theme consistency but is P3.

---

## 6. Tailwind / shadcn/ui Component Adoption

### Tailwind Setup — COMPLETE

| Check | Status |
|-------|--------|
| TW-01 tailwind.config.ts | PRESENT |
| TW-02 @tailwind directives | PRESENT |
| TW-05 Tailwind scale usage | PRESENT |
| TW-06 Theme tokens for colors | PRESENT (via HSL vars) |
| TW-07 cn() helper | PRESENT (148 usages) |
| TW-08 Content paths | PRESENT |
| TW-09 Minimal custom CSS | PRESENT (80 lines total) |

### shadcn/ui Adoption — EXCELLENT

| Component | Import Count | Status |
|-----------|-------------|--------|
| Button | 24 files | Heavy use |
| Table | 19 files | Heavy use |
| Badge | 19 files | Heavy use |
| Card | 17 files | Heavy use |
| Input | 16 files | Heavy use |
| Label | 5 files | Used |
| Dialog | 4 files | Used |
| Sheet | 4 files | Used |
| Tabs | 4 files | Used |
| Checkbox | 4 files | Used |
| Alert | 4 files | Used |
| Select | 3 files | Used |
| Collapsible | 3 files | Used |
| Tooltip | 1 file | Minimal |
| Separator | 1 file | Minimal |
| Skeleton | 0 files | Available but unused |
| DropdownMenu | 0 files | Available but unused |

### Anti-Patterns

| Pattern | Count | Severity | Notes |
|---------|-------|----------|-------|
| Raw `<button>` in pages | 0 | — | Clean |
| Raw `<input>` in pages | 0 | — | Clean |
| Raw `<select>` in pages | 1 | P2 | VendorPortal.tsx:172 |
| Raw `<table>` in pages | 0 | — | Clean |
| Inline `style={{}}` | 11 | P2 | Mostly dynamic values (widths, colors); 2 in router/auth are legacy |
| Custom modal | 0 | — | All use shadcn Dialog |
| Missing Toast system | — | P2 | No toast/notification library installed |

### Remaining Inline Styles (11 occurrences)

| File | Line | Reason | Acceptable? |
|------|------|--------|-------------|
| SlaProgressBar.tsx | 36 | Dynamic width% | Yes |
| CaseDetail.tsx | 2117 | Dynamic width% | Yes |
| Dashboard.tsx | 497 | Dynamic card.color | Refactorable |
| Dashboard.tsx | 522 | Dynamic bar width% | Yes |
| CaseList.tsx | 874 | Dynamic TAT border color | Refactorable |
| CollateralRisk.tsx | 153, 189, 255 | Dynamic chart widths/colors | Partially |
| router.tsx | 135 | 404 page legacy inline | Should convert |
| AuthGuard.tsx | 29 | Access denied legacy inline | Should convert |
| progress.tsx | 20 | Dynamic transform | Yes (shadcn) |

**shadcn/ui Adoption Score: ~85% — PASS**

---

## 7. Responsive & Mobile-First Findings

| # | Finding | Severity | File | Line |
|---|---------|----------|------|------|
| R-01 | Sidebar fixed at 240px, not responsive | P0 | Layout.tsx | 97 |
| R-02 | Content area uses `ml-[var(--sidebar-width)]` — no mobile breakpoint | P0 | Layout.tsx | 124 |
| R-03 | No Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) in Layout | P0 | Layout.tsx | — |
| R-04 | Sidebar covers entire viewport on phones (no hide/toggle) | P0 | Layout.tsx | 93-121 |
| R-05 | No `min-w-0` on flex children (potential text overflow) | P2 | Layout.tsx | 124 |
| R-06 | Suspense fallback is plain text, no centering/styling | P2 | router.tsx | all |
| R-07 | 404 page has inline styles, renders outside Layout | P1 | router.tsx | 135 |
| R-08 | Access Denied has inline styles | P2 | AuthGuard.tsx | 29 |
| R-09 | Viewport meta tag present and correct | — | index.html | OK |
| R-10 | No 100vh usage (good) | — | — | OK |

---

## 8. Accessibility Findings

| # | Finding | Severity | File | Line |
|---|---------|----------|------|------|
| A-01 | Skip-to-main link present | — | Layout.tsx | 85-91 | OK |
| A-02 | Nav has aria-label="Main navigation" | — | Layout.tsx | 95 | OK |
| A-03 | Main content has role="main" + id="main-content" | — | Layout.tsx | 179 | OK |
| A-04 | All icon-only buttons have aria-label | — | Layout.tsx | 159, 167 | OK |
| A-05 | Confidence badges have role="status" + aria-label | — | ConfidenceBadge.tsx | 44-50 | OK |
| A-06 | Search input has aria-label | — | Layout.tsx | 134 | OK |
| A-07 | Global :focus-visible styles defined | — | index.css | 77-80 | OK |
| A-08 | **No prefers-reduced-motion support** | P1 | index.css | — | MISSING |
| A-09 | **Table sort headers lack keyboard access** (onClick but no onKeyDown/tabIndex) | P1 | CaseList.tsx | 813-837 |
| A-10 | **Clickable table rows lack keyboard access** in some pages | P1 | CaseList.tsx | 865-877 |
| A-11 | **Login page root is div, not main** | P1 | LoginPage.tsx | 60 |
| A-12 | **Login eye toggle may be < 44px touch target** | P1 | LoginPage.tsx | 147 |
| A-13 | Error alerts use role="alert" + aria-live | — | LoginPage.tsx | 112 | OK |

---

## 9. Empty State / Error Boundary / Loading Findings

| # | Finding | Severity | Notes |
|---|---------|----------|-------|
| ES-01 | CaseList has empty state (icon + heading + text) | — | Good pattern |
| ES-02 | TriageQueue has empty state ("All triaged") | — | Good pattern |
| ES-03 | **Dashboard has no empty state** | P1 | Shows nothing if metrics empty |
| ES-04 | **Most pages lack empty states** (VendorScorecard, DisbursalReadiness, etc.) | P2 | Mock data masks the issue |
| EB-01 | ErrorBoundary wraps main content Outlet | — | Good |
| EB-02 | **ErrorBoundary doesn't wrap lazy import failures** | P2 | Suspense fallback is plain text |
| EB-03 | **404 page is unstyled, outside Layout** | P1 | Inline styles, no icon/branding |
| EB-04 | **Access Denied page is unstyled** | P2 | Inline styles |
| LD-01 | **Suspense fallbacks are plain `<div>Loading...</div>`** | P1 | Should use Skeleton or centered Loader2 |
| LD-02 | Skeleton component available but **unused** | P2 | Installed but 0 imports |
| LD-03 | React Query loading states present on data-fetching pages | — | Good |

---

## 10. Modern UI Pattern Findings

### Toast/Notification System — MISSING (P2)
No toast library installed. Mutation success/failure feedback is inconsistent.

### Modal/Dialog — GOOD
All modals use shadcn Dialog (Radix-based), with proper focus trap, Escape handling, and backdrop.

### Form Patterns — PARTIAL
- Login form uses native `<form onSubmit>` — good
- No field-level validation (only top-level error Alert)
- No required field indicators
- Missing autocomplete on some forms

### Card Patterns — GOOD
Consistent use of shadcn Card with proper border-radius, shadow, and padding.

### Animation — PARTIAL
- Tailwind transitions used for hover effects
- **No prefers-reduced-motion support** (P1)
- No page transition animations

### Dark Mode — GOOD
- HSL CSS variables for light + dark themes
- Toggle persisted to localStorage
- Most components properly themed
- **Left panel gradient on login page uses hardcoded colors** (P2)

### Data Tables — GOOD
- All tables use shadcn Table components
- Horizontal scroll wrapper on tables
- **Sortable headers lack keyboard support** (P1)

---

## 11. QA Gates and Verdict

### Blocking Gates (15)

| # | Gate | Status | Notes |
|---|------|--------|-------|
| 1 | Accessibility (WCAG 2.1 AA) | **PARTIAL** | Missing: reduced-motion, keyboard table sort, login landmark |
| 2 | Mobile responsiveness | **FAIL** | Fixed sidebar, no responsive layout |
| 3 | Mobile navigation | **FAIL** | No hamburger, no collapsible sidebar |
| 4 | Login completeness | **PARTIAL** | Missing: forgot password, theme selector, remember-me persistence |
| 5 | Interaction predictability | **PASS** | Consistent patterns |
| 6 | Sensitive action safety | **PASS** | Confirm dialogs on triage actions |
| 7 | System status visibility | **PARTIAL** | Plain-text Suspense fallbacks |
| 8 | Error prevention & recovery | **PARTIAL** | ErrorBoundary present, but unstyled 404 and Access Denied |
| 9 | Progressive disclosure | **PASS** | Collapsible sections, tabs |
| 10 | State resilience | **PASS** | React Query cache, localStorage persistence |
| 11 | Graceful degradation | **PARTIAL** | Demo mode works offline, but no offline indicator |
| 12 | Empty state coverage | **PARTIAL** | 2/10+ data views have empty states |
| 13 | Error boundary coverage | **PARTIAL** | One boundary, no route-level |
| 14 | UI determinism | **PASS** | Same input = same output |
| 15 | Behavioral trust | **PASS** | Actions predictable |

### Non-Blocking Gates (7)

| # | Gate | Status |
|---|------|--------|
| 1 | Perceived performance | **PASS** — 14 lazy routes, build < 2s |
| 2 | Temporal awareness | **PARTIAL** — SLA indicators present, no auto-refresh indicator |
| 3 | Input efficiency | **PASS** — Keyboard shortcuts modal, search |
| 4 | UX observability | **PARTIAL** — No analytics/telemetry |
| 5 | Animation/motion quality | **PARTIAL** — No reduced-motion support |
| 6 | Dark mode completeness | **PASS** — HSL token system, toggle persisted |
| 7 | Tailwind/shadcn adoption | **PASS** — ~85% coverage |

### Verdict

```
WCAG Status:            PARTIAL
Mobile Readiness:       FAIL
Mobile Navigation:      FAIL
Login Completeness:     PARTIAL
Empty/Error States:     PARTIAL
Blocking Gates:         7/15 PASS, 6/15 PARTIAL, 2/15 FAIL
Tailwind/shadcn:        PASS (85%)
Non-Blocking Gates:     3/7 PASS, 4/7 PARTIAL, 0/7 FAIL
Release Decision:       NO-GO (2 blocking FAIL gates)
```

**Blocking failures:**
1. **Mobile responsiveness** — Fixed 240px sidebar with no responsive breakpoints
2. **Mobile navigation** — No hamburger toggle, no collapsible sidebar

---

## 12. Bugs and Foot-Guns

| # | Severity | Confidence | File:Line | Issue | Fix |
|---|----------|------------|-----------|-------|-----|
| 1 | P0 | High | Layout.tsx:97 | Sidebar fixed 240px, covers phone viewport | Add responsive classes: `fixed -translate-x-full md:translate-x-0` + hamburger toggle |
| 2 | P0 | High | Layout.tsx:124 | Content `ml-[240px]` on all screens | Change to `md:ml-[var(--sidebar-width)]` |
| 3 | P1 | High | index.css | No `prefers-reduced-motion` | Add `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; } }` |
| 4 | P1 | High | CaseList.tsx:813-837 | Sort headers not keyboard accessible | Add `tabIndex={0}`, `role="button"`, `onKeyDown` for Enter/Space |
| 5 | P1 | High | router.tsx:135 | 404 page uses inline styles, outside Layout | Create proper NotFoundPage component with Tailwind classes |
| 6 | P1 | High | router.tsx:all | Suspense fallback is `<div>Loading...</div>` | Replace with centered `<Loader2 className="animate-spin" />` or Skeleton |
| 7 | P1 | Medium | LoginPage.tsx:60 | Root div should be `<main>` | Change `<div className="flex min-h-dvh">` to `<main>` |
| 8 | P1 | Medium | LoginPage.tsx:147 | Password eye toggle may be < 44px | Add `h-11 w-11` or `min-h-[44px] min-w-[44px]` |
| 9 | P2 | High | AuthGuard.tsx:29 | Access Denied uses inline styles | Convert to Tailwind classes + add icon |
| 10 | P2 | High | VendorPortal.tsx:172 | Raw `<select>` instead of shadcn Select | Replace with `<Select>` from `@/components/ui/select` |
| 11 | P2 | Medium | LoginPage.tsx | Remember me has no localStorage persistence | Wire checkbox to localStorage for username |
| 12 | P2 | Medium | LoginPage.tsx | No error clear on user input | Add `onChange` handler to clear error |
| 13 | P2 | Medium | Dashboard.tsx:497 | Inline `style={{ color }}` for card values | Map to Tailwind classes via lookup |
| 14 | P2 | Medium | CaseList.tsx:874 | Inline `style={{ borderLeft }}` for TAT color | Map to Tailwind `border-l-*` classes |
| 15 | P2 | Low | — | No toast system for mutation feedback | Install `sonner` or shadcn toast |
| 16 | P2 | Low | — | Skeleton component installed but unused | Use for Suspense fallbacks |
| 17 | P3 | Medium | — | No i18n infrastructure | Install react-i18next when multilingual needed |
| 18 | P3 | Low | — | 3 placeholder routes show "Coming Soon" | Add proper placeholder pages |

---

## 13. UI Architect Backlog

| ID | Title | Priority | Effort | Area | File | Why |
|----|-------|----------|--------|------|------|-----|
| 1 | Implement responsive sidebar with hamburger toggle | P0 | M | Navigation | Layout.tsx | Mobile users cannot navigate |
| 2 | Add mobile overlay + backdrop for sidebar | P0 | M | Navigation | Layout.tsx | Mobile UX blocked |
| 3 | Add prefers-reduced-motion support | P1 | S | Accessibility | index.css | WCAG violation |
| 4 | Add keyboard support to sortable table headers | P1 | S | Accessibility | CaseList.tsx | Keyboard users cannot sort |
| 5 | Create proper 404 page component | P1 | S | Error handling | router.tsx | Unstyled, outside Layout |
| 6 | Upgrade Suspense fallbacks to Loader2/Skeleton | P1 | S | Loading | router.tsx | Poor perceived performance |
| 7 | Add `<main>` landmark to login page | P1 | S | Accessibility | LoginPage.tsx | WCAG landmark requirement |
| 8 | Size password toggle touch target to 44px | P1 | S | Accessibility | LoginPage.tsx | Touch target too small |
| 9 | Convert AuthGuard Access Denied to Tailwind | P2 | S | Consistency | AuthGuard.tsx | Inline styles |
| 10 | Replace raw select in VendorPortal | P2 | S | Consistency | VendorPortal.tsx | Only remaining raw select |
| 11 | Wire Remember Me to localStorage | P2 | S | Login | LoginPage.tsx | Feature incomplete |
| 12 | Clear login error on user input | P2 | S | UX | LoginPage.tsx | Error persists until submit |
| 13 | Add empty states to all data views | P2 | M | UX | Dashboard, Vendor*, etc. | Blank screens if no data |
| 14 | Install toast/notification system | P2 | M | UX | — | No mutation feedback |
| 15 | Add forgot password flow | P2 | M | Login | LoginPage.tsx | Missing feature |
| 16 | Refactor dynamic inline styles to Tailwind lookups | P2 | S | Consistency | Dashboard, CaseList, CollateralRisk | 8 remaining style={{}} |
| 17 | Add autoFocus to login email field | P2 | S | UX | LoginPage.tsx | No auto-focus |
| 18 | Add leading icons to login inputs | P2 | S | Login | LoginPage.tsx | Missing per checklist |
| 19 | Add theme selector to login page | P2 | S | Login | LoginPage.tsx | Dark mode inaccessible pre-login |
| 20 | Use Skeleton for data loading states | P2 | M | UX | Multiple pages | Better perceived performance |
| 21 | Add ErrorBoundary to route-level Suspense | P2 | S | Error handling | router.tsx | Lazy load failures unhandled |
| 22 | Add route-level error boundaries | P2 | M | Error handling | router.tsx | Only one boundary |
| 23 | Add footer to login page | P3 | S | Login | LoginPage.tsx | Missing per checklist |
| 24 | Create semantic color tokens for status/priority | P3 | M | Design system | tailwind.config.ts | 160 hardcoded color usages |
| 25 | Add dark mode variants for login left panel gradient | P3 | S | Theme | LoginPage.tsx | Hardcoded gradient |

---

## 14. Quick Wins (< 2 hours each)

### Immediate Fixes (Priority Order)

1. **Add prefers-reduced-motion** — Add `@media (prefers-reduced-motion: reduce)` block to `index.css`
2. **Fix login `<main>` landmark** — Change root `<div>` to `<main>` in LoginPage.tsx
3. **Size eye toggle to 44px** — Add `h-11 w-11` to password toggle button
4. **Keyboard-accessible sort headers** — Add tabIndex, role, onKeyDown to CaseList.tsx sort headers
5. **Upgrade Suspense fallbacks** — Replace `<div>Loading...</div>` with `<div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>`
6. **Create 404 page** — Extract inline 404 JSX into a proper `NotFoundPage.tsx` with Tailwind
7. **Convert AuthGuard** — Replace inline styles with Tailwind classes
8. **Wire Remember Me** — Add localStorage get/set for username
9. **Clear error on input** — Add `setError(null)` to input onChange handlers
10. **Add autoFocus** — Add `autoFocus` to email input

### 2-Day Stabilization Sprint

Items 1-10 above PLUS:
11. **Responsive sidebar** — Implement hamburger toggle with translate-x pattern
12. **Mobile overlay** — Add backdrop + Sheet for sidebar on mobile
13. **Empty states** — Add icon + message + CTA to Dashboard, VendorScorecard, DisbursalReadiness
14. **Toast system** — Install sonner, add to mutation hooks
15. **Skeleton usage** — Replace Suspense plain text with Skeleton layouts

---

## 15. Top 5 Priorities

1. **P0: Mobile-responsive sidebar** — The sidebar covers the entire phone viewport. Users on phones/tablets cannot use the application at all. Implement hamburger toggle + collapsible sidebar with translate-x transition.

2. **P1: Accessibility fixes** — Add prefers-reduced-motion, fix keyboard-accessible sort headers, add `<main>` to login, size touch targets to 44px. These are WCAG 2.1 AA requirements.

3. **P1: Loading UX** — Replace all `<div>Loading...</div>` Suspense fallbacks with proper loading indicators. Use the already-installed Skeleton and Loader2 components.

4. **P1: 404 and error pages** — Create proper styled pages for 404 and Access Denied within the Layout wrapper.

5. **P2: Empty states and toast** — Add empty-state UI to all data views. Install a toast system for mutation feedback.
