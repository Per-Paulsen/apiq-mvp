# Epic 08 — Export + Polish

> The final v0.1 epic: spec export (JSON/YAML), polish-pass on loading states / error boundaries / empty states across all screens, and the mobile fallback banner.
> Upstream design tokens: [`prd-decisions.md`](../prd-decisions.md) §"Components" (Toasts, Skeletons, Cards), §"Layout" (mobile fallback breakpoint), §"Color Palette" (toast severity colours).

## Scope

### Export

- Server action `exportSpecAction({ specId, format: 'json' | 'yaml' })`:
  - `getRequiredSession()` workspace check
  - load `Spec.currentJson`, `Spec.name`, current `SpecVersion.versionNumber`
  - if `format = 'json'`: serialise `currentJson` with 2-space indent
  - if `format = 'yaml'`: convert via `yaml.stringify(currentJson)` (the `yaml` package from Epic 03)
  - return `{ filename, contentType, body }` where `filename = '<slug(spec.name)>-v<versionNumber>.<ext>'`
  - **Cycle markers** (per Epic 03's `cycleStripSpec`): `Spec.currentJson` may contain `{"$ref": "#cyclic"}` placeholders wherever the original spec had a recursive `$ref`. Export inherits this shape — the downloaded file is dereferenced AND cycle-stripped, so recursive types appear as opaque cycle markers (NOT standard OpenAPI). This is an accepted v0.1 limitation per Out of Scope §"Re-bundling `$ref`s on export — v0.2"; if a user opens the exported file in Swagger Editor or similar, recursive types will fail to validate as `$ref`. v0.2's re-bundling pass restores named `$ref`s.
- Trigger via a button group on Spec Detail (Epic 05): "Export JSON" + "Export YAML". Default-highlighted button = `Spec.sourceFormat`.
- Client-side: receive the body, create a Blob, trigger a download via an anchor element with `download` attribute. No server-side file storage.
- Slug helper: lowercase, spaces → `-`, strip non-`[a-z0-9-]`, collapse repeated `-`, trim leading/trailing `-`. Empty result → `'spec'`.

### Polish

- **`formatAnalysisError(raw: string): { headline: string; details?: string; budgetShape?: { spent: number; limit: number; retryAt: string } }`** at `src/lib/format-analysis-error.ts` — **already shipped by Epic 05** (Epic 05 had the hard dependency for AC #13 / failed-card; per cross-epic Q6 the helper file is "Epic 08 owned" by design but Epic 05 was the first consumer). The implementation, all 3 parsing rules, and 12 unit tests at `src/__tests__/format-analysis-error.test.ts` are already in place per Epic 05 results. Epic 08's remaining scope on this helper is verification + new-consumer wiring only:
  - Verify the helper still implements all 3 parsing rules (regression-check) — the rules below are the spec contract:
    1. **Budget-shape**: if `raw` matches `/^Daily LLM budget reached \(\$([0-9.]+) \/ \$([0-9.]+)\) — resets at (.+)$/`, return `{ headline: 'Daily LLM budget reached', details: <full message>, budgetShape: { spent, limit, retryAt } }`.
    2. **Zod-error JSON**: try `JSON.parse(raw)`; if the result is an array of `{ message, path }` (zod issue shape), return `{ headline: <path.join('.')>: <first issue's message>, details: JSON.stringify(parsed, null, 2) }` — see Q1 for the headline format.
    3. **Plain message**: fall through — return `{ headline: <truncated to 200 chars + '…' if longer>, details: <full raw if longer than 200 chars, else undefined> }`.
  - Add the new consumer (Spec-Detail budget-toast hook — see §"Rate-limit polish" below) that imports the helper unchanged. Both consumers (Epic 05's failed-card + this hook) MUST share the single helper — no inline parsing duplication.
  - Do NOT duplicate Epic 05's 12 existing tests. Add tests only for new code (e.g. the budget-toast hook + sessionStorage dedupe).
- **Sidebar hydration warning fix** (per cross-epic Q5 — pre-existing across Epic 03 / Epic 04 / Epic 05 browser verification): `SidebarMenuButton` with the `tooltip` prop emits a `data-state` attribute that mismatches between SSR and client (the controlled-tooltip primitive defaults to a different `data-state` server-side vs after hydration). Per the cross-epic Q5 user direction ("every issue needs to be fixed!"), Epic 08 MUST pick one of three candidate fix paths and ship it — not investigate-and-defer. **Important — Epic 07 layout-conversion ordering**: Epic 07 converts `(app)/layout.tsx` from a sync function to an `async` server component (per Epic 07 Scope §"Shared / Layout update": `getRequiredSession()` + `prisma.workspace.findUnique` for the live sidebar footer). Epic 08's hydration fix lands ON TOP of that converted layout — verify the chosen fix path is compatible with an async server-component parent: (a) `useEffect`-gated client component is fine (just a child of the async layout), (b) controlled `open=false` SSR is fine (data-state pinning is independent of async), (c) `suppressHydrationWarning` is fine (HTML attribute). Investigate the root cause first, then commit to ONE of (a)/(b)/(c) and pick whichever has the lowest blast radius. Verify zero hydration warnings on `(app)` routes in browser DevTools console after the fix; document the chosen path + reasoning in Epic 08 results.
- **Toast wiring on existing surfaces** (per Epic 05 results §"Risks for future epics → Epic 08" + Epic 06 §"stale-card Re-analyze"): Epic 05 and Epic 06 already ship the `showToast` calls at these sites; Epic 08 completes the infrastructure (canonical `TOASTS` catalog + `Toaster` mount + runtime body). The wiring points are:
  - `src/app/(app)/specs/[specId]/spec-detail-header.tsx` `onRepull`: after `repullSpecAction({ specId })` returns success, call `showToast(TOASTS.rePullComplete)` BEFORE `router.refresh()`. On error (kind `rate_limited`) call `showToast(formatQuotaToast(error))` instead — same per-consumer pattern documented in §"Rate-limit polish".
  - `src/app/(app)/specs/[specId]/spec-detail-header.tsx` `onReanalyze`: after `reanalyzeSpecAction({ specId })` returns success, call `showToast(TOASTS.reanalyzeStarted)` BEFORE `router.refresh()`. (`reanalyzeSpecAction` writes `analysisStatus = 'analyzing'` synchronously per Epic 04, so the toast confirms the trigger landed even though the user can already see the status pill flip.)
  - `src/app/(app)/specs/[specId]/spec-detail-view.tsx` `FailedPanel.onRetry`: after `reanalyzeSpecAction` returns success, also call `showToast(TOASTS.reanalyzeStarted)` BEFORE `router.refresh()` — same pattern.
  - Epic 06 stale-card Re-analyze button (lives in `src/app/(app)/specs/[specId]/finding-card.tsx` after Epic 06 ships the stale-card UI): same pattern — `showToast(TOASTS.reanalyzeStarted)` after the action call, before `router.refresh()`. Cross-reference Epic 06 §"stale-card UI".
  - Specs-list (Epic 07) row-action Re-analyze: same pattern — `showToast(TOASTS.reanalyzeStarted)` after the action call. Epic 07's row-action menu owns the wiring; Epic 08 owns the catalog and the convention.
  - Tests: each wiring point gets a unit test asserting the toast is invoked on success.
- **Versions-drawer trigger pulse on Apply / Undo Apply** (per Epic 06 results Q3, 2026-05-02): Epic 06 ships the `<Sheet>`-based Versions drawer with a `Versions ({count})` trigger button in the Spec Detail header. After a successful `applyFindingAction` or `undoApplyAction` the count increments but the change is easy to miss. Epic 08 adds a brief `bg-violet-500/15` flash on the trigger when the count delta is non-zero between renders. Implementation sketch: track previous `versions.length` via `useRef`; if the new length is greater, add the class for ~1.2 s via `setTimeout` + `classList`. Pure visual polish, no spec semantics. Test: assert the class lands on the trigger when versions count increases.
- **Loading states across all screens**: every screen using server data renders a skeleton (shadcn `Skeleton`) during the initial fetch instead of a flash of empty layout. Affected: Specs list, Spec Detail, Settings.
- **Error boundaries**: each route group (`(app)`, `(auth)`) has an `error.tsx` that renders a friendly error card with "Try again" + "Go home" buttons. Server-side errors caught by Next.js are surfaced via these boundaries. **Note (per Epic 03 results)**: `src/app/(app)/specs/error.tsx` already exists (minimal Card + Try-again button). Epic 08 polishes per `prd-decisions.md` Cards conventions (border, rounded-lg, "Go home" secondary button) — does NOT create from scratch. Same for `(app)/specs/not-found.tsx` (already exists, polish only).
- **`not-found.tsx`** at the root and per-route-group: friendly 404 with a link back to `/specs` (or `/login` if unauthenticated). Epic 03 shipped `src/app/(app)/specs/not-found.tsx` (Spec Detail 404). Epic 08 adds the missing route-group `not-found.tsx` files (`(app)/not-found.tsx`, `(auth)/not-found.tsx`, root `not-found.tsx`).
- **Empty states** (already partially covered by Epic 05 / 07; this epic ensures consistency):
  - Specs list: covered by Epic 07
  - Spec Detail: zero findings / filter mismatch covered by Epic 05
  - Settings: not applicable
  - Versions drawer (Epic 06): if only the initial version exists, show "No applies yet."
  - All empty states follow `prd-decisions.md` §"Was wir NICHT übernehmen" — no illustrations, no hero copy. Plain card with one-sentence muted explanation + (where applicable) a single primary action.
- **Mobile fallback banner**: a top-of-page banner on screens narrower than 1024 px. Placement: above the `<SidebarInset>` content, below the topbar, full-width. Copy: "apiq is best on desktop — some features may not render correctly". Dismissible per session via sessionStorage; key name: `apiq.mobile-banner-dismissed`. Rendered as a `'use client'` component using `window.matchMedia('(max-width: 1023px)')` (server can't read viewport). The app still renders below the banner.
- **Toast system**: shadcn `Toaster` mounted in `(app)/layout.tsx`, top-right, success / error / info variants per `prd-decisions.md` §"Components" Toasts. Epic 08 ships:
  - **Library install**: `npx shadcn@latest add sonner` (shadcn 4.6.0 uses `sonner` as the toast primitive). Not currently installed (Epic 02 only added card + label).
  - `Toaster` mount in `(app)/layout.tsx` — placed inside the existing `<TooltipProvider><SidebarProvider>...</SidebarProvider></TooltipProvider>` wrapper from Epic 01 + 02 (don't re-wrap the providers; just add `<Toaster position="top-right" />` as a sibling of `<SidebarInset>` or at the layout root).
  - `showToast({ kind, message })` helper — this is a no-op stub shipped by Epic 06; Epic 08 replaces the function body with a real Toaster dispatch from `@/components/ui/sonner`. The signature and import path remain unchanged.
  - **Canonical message catalog** — extends `src/lib/toasts.ts` (which currently exports the `reanalyzeStarted` entry from Epic 06; Epic 08 adds the remaining v0.1 entries below) with a `TOASTS` constant. Do NOT re-create the file; add the catalog and extend `showToast` alongside the existing `formatQuotaToast`. Decision per `specs/cross-epic-review.md` Q1 (option a — single source of truth, easy to i18n later, consistent tone). v0.1 catalog (initial entries — emitting epics may add more):
    ```ts
    export const TOASTS = {
      // Epic 03 — Spec ingestion
      specDeleted: { kind: 'success', message: 'Spec deleted' },
      rePullStarted: { kind: 'info', message: 'Re-pulling from URL…' },
      rePullComplete: { kind: 'success', message: 'Re-pull complete' },
      // Epic 04 — Analysis
      reanalyzeStarted: { kind: 'info', message: 'Re-analyzing…' },
      analysisComplete: { kind: 'success', message: 'Analysis complete' },
      // Epic 06 — Patch apply
      patchApplied: { kind: 'success', message: 'Patch applied' },
      patchRejected: { kind: 'success', message: 'Finding rejected' },
      applyUndone: { kind: 'success', message: 'Apply undone' },
      rejectUndone: { kind: 'success', message: 'Finding restored' },
      // Epic 07 — Settings
      workspaceUpdated: { kind: 'success', message: 'Workspace updated' },
      profileUpdated: { kind: 'success', message: 'Profile updated' },
      // Epic 08 — Export
      exportedJson: { kind: 'success', message: 'Exported as JSON' },
      exportedYaml: { kind: 'success', message: 'Exported as YAML' },
    } as const;
    ```
    Each emitting epic calls `showToast(TOASTS.patchApplied)` instead of hard-coding strings. Adding new messages requires updating this file in the new epic's PR.
  - **Pre-existing TODO from Epic 03 to wire up**: `src/app/(app)/specs/new/add-spec-form.tsx` has a `// TODO (Epic 08): also call showToast(formatQuotaToast(error)) here` comment at the `rate_limited` error case. Epic 03 only renders the inline banner because `showToast` didn't exist yet. When Epic 08 ships `showToast`, swap the form's rate-limited handler to also emit the toast: `showToast(formatQuotaToast(error))` alongside the inline banner. Remove the TODO. Import path: `import { showToast, formatQuotaToast, TOASTS } from '@/lib/toasts'` — all three live in the same module.
- **Favicon + meta**: a minimal SVG favicon, `<title>` and `<meta description>` set per route via Next.js metadata API.
- **README pass**: update the project root `README.md` to include "Quick start" (env vars + first signup + first spec).

### Rate-limit polish

- Standardise the **quota-exceeded** error shapes across all server actions:
  - `{ kind: 'rate_limited', retryAt: ISO8601 }` — count-based limits (Epic 02 signup, Epic 03 URL pulls, Epic 06 applies).
  - `{ kind: 'budget_exceeded', spent: number, limit: number, retryAt: ISO8601 }` — Epic 04's $10/24h LLM dollar-budget.
  Both shapes share the `retryAt` field. **Per-consumer pattern** (per Epic 02 results — there is no global "last action state" subscription in React/Next.js without custom infra; v0.1 keeps it simple): each consuming epic's UI surface (Add Spec form in Epic 03, Spec Detail re-analyze button in Epic 04, Apply / Reject buttons in Epic 06) detects these shapes from its own `useActionState` (or `useTransition`) result and calls `showToast(formatQuotaToast(error))`. **Asynchronous-budget-rejection surfacing — Epic 08-owned implementation**: per Epic 04 results §"Risks for Epic 08", `runAnalysis`'s budget rejection arrives as `Spec.analysisError` (a `'Daily LLM budget reached ($X / $Y) — resets at <ISO>'` string written by runAnalysis), NOT as a synchronous error from `reanalyzeSpecAction`. **Epic 05 did NOT implement this hook** (verified: `spec-detail-view.tsx` polls but emits no toast); Epic 08 owns adding it. Implementation: in `src/app/(app)/specs/[specId]/spec-detail-view.tsx`, add a `useEffect` keyed on `[spec.analysisStatus, spec.analysisError, spec.id]` that, when `spec.analysisStatus === 'failed'`, calls `formatAnalysisError(spec.analysisError)` (already imported by the failed-card) and checks `formatted.budgetShape !== undefined`. If so, dedupe via `sessionStorage` key `'apiq.budget-toast.<specId>'` and call `showToast(formatQuotaToast({ kind: 'budget_exceeded', spent: budgetShape.spent, limit: budgetShape.limit, retryAt: budgetShape.retryAt }))`. The failed-card already renders the formatted message regardless — the toast is the asynchronous notification surface that the spec just flipped to failed. Epic 08 ships the formatter helper at `src/lib/toasts.ts`:
  ```ts
  export function formatQuotaToast(error: { kind: 'rate_limited' | 'budget_exceeded', retryAt: string, spent?: number, limit?: number }): { kind: 'error', message: string } {
    const when = new Date(error.retryAt).toLocaleTimeString();
    if (error.kind === 'rate_limited') {
      return { kind: 'error', message: `Limit reached — try again at ${when}` };
    }
    return { kind: 'error', message: `Daily LLM budget reached ($${error.spent?.toFixed(2)} / $${error.limit?.toFixed(2)}) — resets at ${when}` };
  }
  ```
  Existing per-action success/info toasts (the `TOASTS.*` catalog entries) stay unchanged. v0.2 may centralize quota detection in a layout-level handler if the per-consumer duplication becomes painful.
- **`TOASTS.analysisComplete` polling-layer hook** (per cross-epic Q5, 2026-05-02): symmetric to the budget-toast hook above. Epic 04 is fire-and-forget (no UI surface) and Epic 05 polling is currently silent on transitions, so `TOASTS.analysisComplete` was previously orphaned in the catalog. Epic 08 wires it on the Spec Detail polling layer: in `src/app/(app)/specs/[specId]/spec-detail-view.tsx`, extend the existing `useEffect` keyed on `[spec.analysisStatus, spec.id]` (or add a new one) to detect the `'analyzing'` → `'completed'` transition by tracking the previous status via `useRef`. On a flip-to-`completed`, dedupe via `sessionStorage` key `'apiq.analysis-complete-toast.<specId>'` and call `showToast(TOASTS.analysisComplete)`. Same pattern as the budget-toast hook (sessionStorage dedupe + per-specId scoping); together the two hooks give the user symmetric feedback for both terminal outcomes (success → `analysisComplete`, failure → `formatQuotaToast(...)` for budget OR the failed-card for other errors). The 60-second analysis is exactly the case where a "done" toast helps — user looks away, hears a notification cue, comes back to the result. Vitest test: mock `Spec.analysisStatus` flipping `analyzing` → `completed` across re-renders, advance fake timers, assert `showToast` called once with `TOASTS.analysisComplete`. Re-render with the same `specId` (sessionStorage dedupe key set) → assert NOT called a second time.

### Tests

- Vitest:
  - `exportSpecAction` JSON happy path (round-trips through JSON.parse correctly)
  - `exportSpecAction` YAML happy path (round-trips through YAML parse)
  - filename slug helper edge cases (empty, all-special-chars, collisions)
  - cross-workspace `exportSpecAction` returns 404
  - **Tailwind JIT regression test for `ring-2 ring-violet-500`** (per Epic 05 results §"Open question Q5"): `spec-detail-view.tsx`'s endpoint-click handler applies the ring outline via `el.classList.add('ring-2', 'ring-violet-500')` directly — bypassing React's render. Tailwind v4 JIT scans source files for class string literals, so the classes ARE generated; if a future Tailwind config tweak narrows the source-scan glob, the ring silently breaks. Test: render a `FindingCard` (or a minimal stand-in), apply the two classes via `classList.add`, and assert `getComputedStyle(el).boxShadow` reports a non-empty ring (or assert the classes exist in the document's computed stylesheet via `[...document.styleSheets].flatMap(s => [...s.cssRules]).some(r => r.selectorText?.includes('.ring-2'))`). Cheap belt-and-suspenders against future Tailwind config drift.
  - **Spec-Detail budget-toast hook** (per Scope §"Rate-limit polish"): mock `Spec.analysisError` to a budget-shape string, render `SpecDetailView`, advance fake timers, assert `showToast` was called once with the `budget_exceeded` shape. Re-render with the same `specId` (sessionStorage dedupe key already set) → assert `showToast` was NOT called a second time.
  - **`TOASTS.analysisComplete` polling-layer hook** (per Scope §"`TOASTS.analysisComplete` polling-layer hook"): mock `Spec.analysisStatus` flipping `'analyzing'` → `'completed'` across re-renders, assert `showToast(TOASTS.analysisComplete)` called once. Same-specId re-render with dedupe key set → assert NOT called twice. Initial render with `analysisStatus = 'completed'` (no prior `analyzing` state observed) → assert NOT called (the hook fires on transition, not on cold-load of an already-completed spec).
  - **Toast wiring on Spec Detail header** (per Scope §"Toast wiring on existing surfaces"): `onRepull` happy path → `showToast(TOASTS.rePullComplete)` invoked; `onReanalyze` happy path → `showToast(TOASTS.reanalyzeStarted)` invoked; `FailedPanel.onRetry` → `showToast(TOASTS.reanalyzeStarted)` invoked.
- Browser smoke check (manual, documented in Epic 08 results doc):
  - Export downloads a file with the expected name
  - Mobile-fallback banner appears at <1024 px and dismisses
  - 404 page renders for an unknown route

## Acceptance criteria

1. Spec Detail shows two export buttons: "Export JSON" and "Export YAML". The button matching `Spec.sourceFormat` renders as primary (violet filled per `prd-decisions.md` §"Components" Buttons); the other renders as secondary (ghost). Per `prd-decisions.md` §"Components" Buttons, the two MUST NOT both be primary.
2. Clicking "Export JSON" downloads `<slug(spec.name)>-v<n>.json` with the dereferenced `currentJson` (2-space indent).
3. Clicking "Export YAML" downloads `<slug(spec.name)>-v<n>.yaml` with the YAML-stringified `currentJson`.
4. Round-trip: parsing the downloaded JSON produces a structure deep-equal to `Spec.currentJson`. Same for YAML.
5. Filename slug: spaces → `-`, lowercase, special chars stripped. "My Spec!" → `my-spec-v1.json`.
6. Cross-workspace export returns 404.
7. All `(app)` screens render shadcn `Skeleton` placeholders on initial load (matching the layout's row/card shapes; no spinner-only fallback) — verified by manual inspection + a smoke test that asserts skeleton presence in the initial HTML for `/specs`.
8. Each route group has an `error.tsx` that renders an error card per `prd-decisions.md` §"Components" Cards (border, rounded-lg, no coloured header), with the error message and "Try again" (primary, violet) + "Go home" (secondary, ghost) buttons. Triggering an error in dev surfaces it.
9. Each route group has a `not-found.tsx` rendering a card per `prd-decisions.md` §"Components" Cards with no illustration (per §"Was wir NICHT übernehmen") and a link back to `/specs` (or `/login` if unauthenticated). Visiting `/specs/nonexistent-id` renders the 404 page.
10. Versions drawer empty state ("No applies yet.") renders for a freshly pulled spec.
11. Mobile fallback banner appears on viewports <1024 px, rendered as a muted (zinc) info bar per `prd-decisions.md` §"Color Palette" muted, with a lucide-react `X` close icon (per §"Icons"). Dismissible per session via sessionStorage; remains dismissed on reload within the session.
12. Toast infrastructure is functional: a Vitest test renders a component that calls `showToast(TOASTS.exportedJson)` and asserts the Sonner toast container receives the success message. The `TOASTS` catalog at `src/lib/toasts.ts` is exported and consumed by emitting epics (Epic 03/04/06/07/08). A second Vitest test asserts every `TOASTS.*` entry has both `kind` and non-empty `message` fields. Visual styling (top-right, emerald colour for success per `prd-decisions.md` §"Components" Toasts and §"Color Palette") is verified by manual browser smoke-check (see Tests §"Browser smoke check").
13. `formatQuotaToast(error)` from `src/lib/toasts.ts` is the canonical formatter for both `kind: 'rate_limited'` (Epic 02 signup, Epic 03 URL pulls, Epic 06 applies) and `kind: 'budget_exceeded'` (Epic 04's $10/24h LLM dollar-budget). No other module re-implements these strings. Vitest unit test asserts both branches: `formatQuotaToast({ kind: 'rate_limited', retryAt: <ISO> })` produces a "Limit reached — try again at <time>" message; `formatQuotaToast({ kind: 'budget_exceeded', spent, limit, retryAt })` produces a "Daily LLM budget reached ($spent / $limit) — resets at <time>" message. Consuming epics (03 / 04 / 06) call `showToast(formatQuotaToast(error))` from their own `useActionState` consumers — no global subscription in v0.1.
14. Favicon, `<title>`, `<meta description>` are set per route.
15. README "Quick start" section exists and is accurate.
16. Vitest export tests pass.
17. **`formatAnalysisError`** at `src/lib/format-analysis-error.ts` (shipped by Epic 05 per AC #13) correctly implements all three parsing rules per Scope §"Polish": budget-shape regex match, zod-issue JSON, plain-message fallthrough. Epic 05's 12 unit tests at `src/__tests__/format-analysis-error.test.ts` cover all branches and continue to pass. Both consumers — Epic 05's failed-card (`spec-detail-view.tsx`'s `FailedPanel`) AND Epic 08's new Spec-Detail budget-toast hook (Scope §"Rate-limit polish") — import the same helper; no inline parsing duplication anywhere in the codebase. Epic 08 does NOT re-implement or duplicate Epic 05's tests; new tests cover only the budget-toast hook itself.
18. **Sidebar hydration warning fix** (per Scope §"Polish" + cross-epic Q5 user direction "every issue needs to be fixed"): Epic 08 picks ONE of three candidate fix paths and ships it — investigate-and-defer is NOT acceptable. Browser DevTools console shows zero hydration-mismatch warnings on `(app)` routes after the fix. Verified via Playwright on at least one `(app)` page (e.g. `/specs`). Epic 08 results documents which fix path was chosen (a / b / c) and the reasoning.
19. **Pre-launch checklist reconciliation** (per cross-epic Q7): every item in CLAUDE.md §"Pre-launch checklist (open issues)" is either resolved (verified by test or manual check) or explicitly deferred to v0.2 with documented reasoning in `specs/08-export-polish-results.md`. **Epic 08 first scans Epic 04/05/06/07 results files for follow-up items not yet listed in CLAUDE.md** (cross-epic-review.md Pass 4 noted Epic 04 results add 3 more: `INTERNAL_API_SECRET` rotation reaffirmed, OpenRouter pricing monthly verification, Petstore-failed-state cleanup), updates the checklist to include them, then reconciles all items. The reconciliation is the explicit launch-gate for v0.1; Epic 08 does NOT close until every item has either a `RESOLVED` or `DEFERRED-V0.2` annotation.
20. **Spec-Detail budget-toast hook** (per Scope §"Rate-limit polish" / per Epic 05 results §"Risks → Epic 08"): when `Spec.analysisStatus` flips to `failed` AND the `analysisError` parses as the budget-shape (via `formatAnalysisError(...).budgetShape !== undefined`), the Spec Detail screen emits `showToast(formatQuotaToast({ kind: 'budget_exceeded', spent, limit, retryAt }))` once per session per specId, deduped via `sessionStorage` key `'apiq.budget-toast.<specId>'`. The failed-card itself continues to render the formatted message regardless of the toast. Vitest test asserts the dedupe behaviour (one call across re-renders for the same specId).
21. **Toast wiring on Spec Detail header buttons** (per Scope §"Toast wiring on existing surfaces" / per Epic 05 results §"Risks → Epic 08"): `spec-detail-header.tsx` `onRepull` calls `showToast(TOASTS.rePullComplete)` on success; `onReanalyze` calls `showToast(TOASTS.reanalyzeStarted)` on success; `spec-detail-view.tsx` `FailedPanel.onRetry` also calls `showToast(TOASTS.reanalyzeStarted)`. Epic 06's stale-card Re-analyze button + Epic 07's specs-list row-action Re-analyze ALSO call `showToast(TOASTS.reanalyzeStarted)` (5 wiring points total). Vitest tests assert the toast invocation per click handler.
22. **`TOASTS.analysisComplete` polling-layer hook** (per Scope §"`TOASTS.analysisComplete` polling-layer hook" / per cross-epic Q5): when the Spec Detail poll-tick observes `analysisStatus` flipping `'analyzing'` → `'completed'`, the screen emits `showToast(TOASTS.analysisComplete)` once per session per specId, deduped via `sessionStorage` key `'apiq.analysis-complete-toast.<specId>'`. Symmetric to the budget-toast hook (AC #20). Vitest test asserts the dedupe behaviour (one call across re-renders for the same specId) AND that the hook does NOT fire on cold-load of an already-completed spec (transition-only, not steady-state).
23. **Versions-drawer trigger pulse on Apply / Undo Apply** (per Epic 06 results Q3, 2026-05-02 / per Scope §"Versions-drawer trigger pulse"): after a successful `applyFindingAction` or `undoApplyAction`, the Versions drawer trigger button in `spec-detail-header.tsx` (showing `Versions ({count})`) displays a brief `bg-violet-500/15` flash when the versions count increases between renders. Flash animation lasts ~1.2 s via `setTimeout` + `classList` manipulation. Implementation uses `useRef` to track previous `versions.length` and applies the highlight class only when `newLength > prevLength`. Vitest test asserts the class is added to the trigger button element when the count increases and that it survives re-renders during the timeout window.

## Out of scope

- Re-bundling `$ref`s on export — v0.2 (export is always dereferenced, see brainstorming G2).
- Specific-version export (export an arbitrary `SpecVersion`, not just current) — v0.2.
- Bulk export (download all specs as a ZIP) — v0.2.
- Diff export (changes between two SpecVersions as a patch file) — v0.2.
- Mobile-responsive UI (the banner is the v0.1 acknowledgement that we don't support mobile layouts).
- i18n — Englisch only in v0.1 (see brainstorming I4).
- Formal a11y audit — best-effort via shadcn defaults only.
- Analytics / telemetry beyond `LLMCall` (Epic 04) — v0.2.
- CI/CD pipeline (GitHub Actions, preview deploys) — v0.2.
- Production deployment runbook — v0.2 (the Quick start in README is enough for v0.1).
- Performance profiling / bundle-size audit — v0.2 unless an obvious regression appears.
- Custom error illustrations / branding polish — v0.2.

## Domain terms

- **Export** — a server-action-driven download of `Spec.currentJson` as JSON or YAML. No server-side file storage; the response body is the file body.
- **Filename slug** — derived from `Spec.name` via the slug helper. Suffixed with `-v<versionNumber>.<ext>`.
- **Skeleton** — shadcn `Skeleton` placeholder for initial-load states.
- **Error boundary** — Next.js `error.tsx` per route group; surfaces uncaught server errors with a friendly retry UI.
- **Mobile fallback banner** — a session-dismissible banner on small viewports. Does not block functionality; warns the user.
- **Toast** — shadcn `Toast` for transient success/error confirmation. Used by Apply / Reject / Undo / Re-pull / Re-analyze / rate-limit feedback.
- **Standardised quota-exceeded responses** — two shapes, both detected by the layout-level toast handler:
  - `{ kind: 'rate_limited', retryAt: ISO8601 }` for count-based limits (signup IP, URL pulls, applies)
  - `{ kind: 'budget_exceeded', spent: number, limit: number, retryAt: ISO8601 }` for Epic 04's $10/24h dollar-budget on LLM calls

## Open questions

- (resolved) YAML library: the `yaml` package from Epic 03 — same dependency, symmetric parse/stringify.
- File-download mechanism: pure client-side `URL.createObjectURL` + `<a download>` is the simplest and works on all v0.1 supported browsers (latest 2 of Chrome/Firefox/Safari/Edge). Confirm during implementation.
- Should the export endpoint also be available as a GET route (e.g. `/api/specs/[specId]/export.json`) so users can `curl` it? Recommendation: no, v0.1 keeps it as a server action only — `curl`-friendly export is v0.2.
- (resolved) Mobile fallback breakpoint: <1024 px per `prd-decisions.md` §"Layout" ("Kein Mobile-Layout. Mobile fallback banner (Epic 08) bei Viewport <1024 px.").
- (resolved) Toasts: shadcn `Toaster` top-right (default position), Success / Error / Info variants via colour tokens per `prd-decisions.md` §"Components" Toasts.
- Should the README include a section on running the Phase 0 spike? Recommendation: yes, a short pointer to `specs/research-spike.md` and `scripts/spike/run-prompt.ts`.
- (resolved per cross-epic Q6, 2026-05-02) `formatAnalysisError` helper lives at `src/lib/format-analysis-error.ts` (Epic 08 owned). Both Epic 05's failed-card and the Spec-Detail budget-toast hook import it — no inline parsing duplication. See Scope §"Polish" for parsing rules + AC #17.
- (resolved per cross-epic Q7, 2026-05-02) Pre-launch checklist reconciliation is an Epic 08 AC (#19). Epic 08 does NOT close until every checklist item has a `RESOLVED` or `DEFERRED-V0.2` annotation in the results file.
- (resolved per cross-epic Q5, 2026-05-02) Sidebar hydration warning is owned by Epic 08 polish — see Scope §"Polish" + AC #18 for the fix-path investigation.
- (resolved per `specs/cross-epic-review.md` Q1) Per-action toast wording: option (a) — `src/lib/toasts.ts` canonical `TOASTS` catalog. See Scope §"Toast system" for the v0.1 entries.
- (resolved per cross-epic Q5, 2026-05-02) `TOASTS.analysisComplete` emission point: option (a) — Epic 08 wires it on the Spec Detail polling layer (transition `analyzing` → `completed`, sessionStorage dedupe key `'apiq.analysis-complete-toast.<specId>'`). Symmetric to the budget-toast hook. Documented in Scope §"`TOASTS.analysisComplete` polling-layer hook" + AC #22.
