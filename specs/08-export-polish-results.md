# Epic 08 — Export + Polish — Results

> Implementation results for `[08-export-polish.md](08-export-polish.md)`. Author: Claude Code (Lead) + 4 delegated agents (foundation, layout-polish, spec-detail-polish, tests). Date: 2026-05-03. Commit: `d098d31`.
> **Append-only** after this initial draft. Corrections go in a labelled "Correction" section at the end.

## What was built

The final v0.1 epic. Spec export (JSON/YAML) via server action + Spec-Detail button group, the canonical Sonner-based toast infrastructure (real `showToast` dispatch + 12-entry `TOASTS` catalog), full polish pass on loading / error / not-found states across all `(app)` and `(auth)` routes, mobile-fallback banner at <1024 px, sidebar-hydration-warning fix, favicon + per-route metadata, and the pre-launch checklist reconciliation.

Browser-verified end-to-end against the e2e-test workspace's two Petstore specs. Highlights:

- **Login → /specs**: zero hydration warnings in DevTools console after the sidebar fix (option (a) — mounted-gated client island for the nav items). Page title `Specs · apiq` renders. Sonner Toaster mounts top-right via `<Toaster position="top-right" />` in `(app)/layout.tsx`.
- **Spec Detail → /specs/[specId]**: page title is `<spec.name> · apiq` via `generateMetadata`. Action-button row now shows `Versions (3) · Re-pull from URL · Re-analyze · Export JSON · Export YAML`. The default-highlighted Export button matches `Spec.sourceFormat` (`json` for both Petstore specs → "Export JSON" gets `variant="default"` violet, "Export YAML" gets `variant="outline"` ghost).
- **Export JSON click**: server action returns `{ filename: 'swagger-petstore-openapi-30-v3.json', contentType: 'application/json', body: <pretty JSON> }`. Browser-side: Blob + anchor download fires; file lands on disk; Sonner emits `Exported as JSON` toast (verified via `document.querySelectorAll('[data-sonner-toast]')`). YAML branch: filename `swagger-petstore-openapi-30-v3.yaml`, contentType `application/yaml`.
- **Mobile-fallback banner**: at viewport `800 × 800`, the banner renders above `<SidebarInset>` with copy "apiq is best on desktop — some features may not render correctly". Clicking the X icon writes `sessionStorage['apiq.mobile-banner-dismissed'] = '1'` and the banner unmounts.
- **Versions drawer** still shows the 3 versions newest-first with the violet `current` pill on `v3`. The "No applies yet." muted line appears below the list when `versions.length <= 1`. Trigger button gets the `bg-violet-500/15` flash for ~1.2 s on `versions.length` increase (verified via Vitest; not exercised in browser since this run had no apply).

Screenshot: `docs/screenshots/epic-08-spec-detail.png`.

## Key files created / modified

### Library installs

- `src/components/ui/sonner.tsx` (NEW, via `npx shadcn@latest add sonner`).
- `package.json`: `sonner` (transitively, by shadcn add).

### Toast infrastructure

- `src/lib/toasts.ts` — `showToast` body now dispatches via `import { toast } from 'sonner'` (calls `toast.success / .error / .info` based on `kind`). `formatQuotaToast` unchanged. `TOASTS` catalog extended from 5 entries to **12**: existing `reanalyzeStarted`, `rePullComplete`, `specDeleted`, `workspaceUpdated`, `profileUpdated` + new `analysisComplete`, `patchApplied`, `patchRejected`, `applyUndone`, `rejectUndone`, `exportedJson`, `exportedYaml`. Per cross-epic Q1 Pass 6 the spec dropped `rePullStarted`; the catalog is consistent.
- `src/app/(app)/layout.tsx` — mounts `<Toaster position="top-right" richColors />` from `@/components/ui/sonner` as a sibling of `<SidebarInset>` inside `<SidebarProvider>`. Existing TooltipProvider + SidebarProvider chain unchanged.

### Slug + Export

- `src/lib/slug.ts` (NEW) — `slugify(name: string): string`. Lowercase → space-to-dash → strip non-`[a-z0-9-]` → collapse repeated dashes → trim → fallback `'spec'` when empty.
- `src/app/(app)/specs/actions.ts` — added `exportSpecAction({ specId, format })`. Workspace-scoped via `getRequiredSession` + `findFirst`; loads the current SpecVersion for `versionNumber`. JSON: `JSON.stringify(currentJson, null, 2)`, contentType `application/json`. YAML: `import { stringify } from 'yaml'`, contentType `application/yaml`. Returns `{ success: true, filename, contentType, body } | { success: false, error: { kind: 'not_found' | 'unexpected' } }`.
- `src/app/(app)/specs/[specId]/export-buttons.tsx` (NEW) — client component. Two buttons; default-highlighted matches `Spec.sourceFormat`. On click: build a `Blob`, `URL.createObjectURL`, click an `<a download={filename}>` element, `URL.revokeObjectURL`. Then `showToast(TOASTS.exportedJson | exportedYaml)`. Wired into `spec-detail-header.tsx` action-button row.

### Sidebar hydration fix (option (a) — chosen)

- `src/app/(app)/sidebar-nav-items.tsx` (NEW) — `'use client'` component. Uses `useSyncExternalStore` to gate the mounted state (avoids React 19's `set-state-in-effect` lint rule that `useState + useEffect` would trigger). Pre-mount: renders `<SidebarMenuButton asChild>` WITHOUT the `tooltip` prop, eliminating the data-state mismatch source. Post-mount: the `tooltip` prop attaches and the Tooltip primitive renders. Chosen over (b) "controlled `open=false` SSR" and (c) `suppressHydrationWarning` because (a) actually fixes the root cause (the SSR/CSR `data-state` divergence on the Tooltip primitive) rather than pinning a brittle initial state or hiding the warning. Browser-verified zero hydration warnings on `/specs` after the fix.
- `src/app/(app)/layout.tsx` — replaced inline `<SidebarMenuItem>` JSX with `<SidebarNavItems />` import.

### Mobile-fallback banner

- `src/components/mobile-fallback-banner.tsx` (NEW) — `'use client'` component. `useEffect` reads `window.matchMedia('(max-width: 1023px)')` + `sessionStorage`. State: `isMobile` + `dismissed`. Render-gated on `isMobile && !dismissed`. Subscribes to mq `change` for live viewport changes. X close icon (`lucide-react`) writes the sessionStorage key + flips `dismissed`. Mounted in `(app)/layout.tsx` ABOVE the `<SidebarInset>` content.

### Spec-Detail polish

- `src/app/(app)/specs/[specId]/spec-detail-header.tsx` — `onRepull` now branches on `result.success` and emits `showToast(TOASTS.rePullComplete)` on success / `showToast(formatQuotaToast(error))` on `rate_limited`. `onReanalyze` emits `showToast(TOASTS.reanalyzeStarted)` on success.
- `src/app/(app)/specs/[specId]/spec-detail-view.tsx`:
  - `FailedPanel.onRetry`: emits `showToast(TOASTS.reanalyzeStarted)` on success before `router.refresh()`.
  - **Budget-toast hook**: new `useEffect` keyed on `[spec.analysisStatus, spec.analysisError, spec.id]`. When `analysisStatus === 'failed'` AND `formatAnalysisError(spec.analysisError).budgetShape !== undefined`, dedupes via `sessionStorage['apiq.budget-toast.<specId>']` and emits `showToast(formatQuotaToast({ kind: 'budget_exceeded', ... }))`.
  - **analysisComplete polling hook**: `useRef<string | null>` tracks previous status. On flip from `analyzing|pending` → `completed`, dedupes via `sessionStorage['apiq.analysis-complete-toast.<specId>']` and emits `showToast(TOASTS.analysisComplete)`. Cold-load of an already-`completed` spec does NOT fire (the ref starts as `null`).
- `src/app/(app)/specs/[specId]/versions-drawer.tsx` — trigger pulse: `useRef<number>` for prev count + `useState<boolean>` for the flash flag. On `versions.length > prev`, sets the flag, `setTimeout(() => setFlash(false), 1200)` clears it. Trigger button gets `bg-violet-500/15` while flash is true. Empty-state line "No applies yet." renders muted below the list when `versions.length <= 1`.
- `src/app/(app)/specs/[specId]/finding-card.tsx`:
  - `OpenActions.onApply` success → `showToast(TOASTS.patchApplied)`.
  - `OpenActions.onReject` success → `showToast(TOASTS.patchRejected)`.
  - `AppliedActions.onUndo` success → `showToast(TOASTS.applyUndone)`.
  - `RejectedActions.onUndo` success → `showToast(TOASTS.rejectUndone)`.
  - The stale-card branch's `showToast(TOASTS.reanalyzeStarted)` is unchanged (Epic 06).

### Add-spec form (TODO removal)

- `src/app/(app)/specs/new/add-spec-form.tsx` — removed the `// TODO (Epic 08)` comment. Added a new `useEffect` keyed on `state` that detects `error.kind === 'rate_limited'` and emits `showToast(formatQuotaToast({ kind: 'rate_limited', retryAt: state.error.retryAt ?? new Date().toISOString() }))` once. Inline banner via `formatQuotaToast` is kept.

### Error / not-found boundaries

- `src/app/(app)/specs/error.tsx` — polished: Card with border + rounded-lg, "Try again" primary + new "Go home" outline → `/specs`.
- `src/app/(app)/specs/not-found.tsx` — polished to match the new error.tsx Cards convention.
- `src/app/(app)/error.tsx` (NEW) — route-group root error boundary.
- `src/app/(app)/not-found.tsx` (NEW) — route-group root 404.
- `src/app/(auth)/error.tsx` (NEW) — auth-group error.
- `src/app/(auth)/not-found.tsx` (NEW) — auth-group 404 → `/login`.
- `src/app/not-found.tsx` (NEW) — top-level 404.

### Loading skeletons

- `src/app/(app)/specs/loading.tsx` (NEW) — header + Add Spec button skeleton + table-5-row skeleton matching the columns.
- `src/app/(app)/specs/[specId]/loading.tsx` (NEW) — header skeleton + 2-column grid skeleton.
- `src/app/(app)/settings/loading.tsx` (NEW) — title + 4 card skeletons.

### Favicon + per-route metadata

- `src/app/icon.svg` (NEW) — minimal violet-on-zinc 32×32 favicon.
- Per-route `metadata` exports added to: `(app)/specs/page.tsx`, `(app)/specs/new/page.tsx`, `(app)/specs/[specId]/page.tsx` (async `generateMetadata` reading `Spec.name`; fallback `'Spec · apiq'`), `(app)/settings/page.tsx`, `(auth)/login/page.tsx`, `(auth)/signup/page.tsx`.

### README

- `README.md` — added "Quick start" section between Status and Workflow: install → copy `.env.example` → fill required env vars → `npx prisma migrate dev` → `npm run dev` → signup → first spec.

### Pre-launch reconciliation (per AC #19)

- 3 UUID-named PNGs renamed at repo root: `{F50D61EF-...}.png` → `fillow-template-reference.png`, `{1B526EBB-...}.png` → `design-reference-1.png`, `{731E7182-...}.png` → `design-reference-2.png`. `prd-decisions.md` reference updated.
- `CLAUDE.md` Pre-launch checklist: UUID-rename item annotated `RESOLVED`. Added 2 follow-ups from Epic 04 results: OpenRouter pricing monthly verification (DEFERRED-V0.2) + Petstore-failed-state cleanup (DEFERRED-V0.2).

### Tests (+39 new tests, 259 → 298 total, 44 files)

- `src/__tests__/export/actions.test.ts` — JSON/YAML happy paths (round-trip parse), cross-workspace 404.
- `src/__tests__/lib/slug.test.ts` — 7 slugify edge cases (empty, all-special-chars, repeated dashes, trim, parentheses).
- `src/__tests__/toasts/catalog.test.ts` — every TOASTS entry has `kind` + non-empty `message`; `showToast` dispatches to the right Sonner method.
- `src/__tests__/spec-detail/budget-toast-hook.test.tsx` — once-per-session dedupe.
- `src/__tests__/spec-detail/analysis-complete-hook.test.tsx` — `analyzing → completed` transition fires once; cold-load of `completed` does NOT fire; same-specId re-render does NOT re-fire.
- `src/__tests__/spec-detail/header-toasts.test.tsx` — Re-analyze + Re-pull happy path + Re-pull rate_limited toast.
- `src/__tests__/spec-detail/finding-card-toasts.test.tsx` — Apply / Reject / Undo Apply / Undo Reject toasts.
- `src/__tests__/spec-detail/versions-drawer.test.tsx` — pulse class on length grow + 1.2 s clear via fake timers.
- `src/__tests__/spec-detail/ring-class-regression.test.tsx` — Tailwind JIT belt-and-suspenders (per Epic 05 Q5).
- `src/__tests__/components/mobile-fallback-banner.test.tsx` — matchMedia `true|false` + sessionStorage states + dismiss click.
- `formatQuotaToast` branches: existing coverage in `src/__tests__/spec-ingestion/toasts.test.ts` already covers both `rate_limited` and `budget_exceeded` — no new tests added (per task instruction "ADD missing branches only").

## Decisions and deviations from spec

1. **Sidebar hydration fix path: option (a) — mounted-gated client island.** Spec listed (a)/(b)/(c) and required picking one. (b) (controlled `open=false` SSR pinning) doesn't actually fix the underlying Tooltip-primitive `data-state` divergence — it only changes which divergence happens. (c) (`suppressHydrationWarning`) hides the warning without addressing the cause. (a) extracts `<SidebarNavItems />` as a tiny client island that only renders the `tooltip` prop after mount, eliminating the SSR Tooltip wrapper entirely. Implementation uses `useSyncExternalStore` (rather than `useState + useEffect`) so React 19's `react-hooks/set-state-in-effect` lint rule doesn't fire. Browser-verified: zero hydration warnings on `/specs` after the fix.
2. **Sonner toast position is `top-right` with `richColors`.** Spec said top-right. `richColors` was a quality-of-life pick by the foundation agent — Sonner's defaults are very muted; `richColors` gives the success/error/info variants colour tokens that read as themed pills. Trivial to revert if user prefers monochrome.
3. **"Notifications alt+T" region label is Sonner's default ARIA name** for the toast container. Surfaced in Playwright's a11y tree but invisible to sighted users. Acceptable.
4. **Browser smoke check skipped re-pull rate_limited toast** — would require burning the 20/h URL-pull bucket on a real flow. Unit-tested in `header-toasts.test.tsx` against the action-mock returning `{ kind: 'rate_limited', retryAt }`. Mirrors the convention from Epic 06 (delete-flow not browser-verified, only RTL-tested).
5. **Empty Versions-drawer line lives BELOW the list, not in place of it.** Spec line 48 said "if only the initial version exists, show 'No applies yet.'". The drawer ALWAYS lists the existing versions (even if just `v1`); the muted "No applies yet." line is appended below the list when `versions.length <= 1`. Reads cleaner than replacing the list with the empty-state text — the user still sees the v1 row.
6. **Pre-launch checklist additions stayed conservative.** The cross-epic-review.md Pass 4 hint mentioned 3 Epic 04 follow-ups; reading Epic 04 results §"Cross-cutting / pre-launch" the actually-discrete items are 2 (pricing-table monthly check, Petstore-failed cleanup). The third hint ("INTERNAL_API_SECRET reaffirmed") is the same item already listed in CLAUDE.md, so it wasn't duplicated. The checklist has 6 items total now: 4 originals + 2 new + 1 RESOLVED.
7. **Browser verification did not exercise the budget-toast or analysisComplete hooks live.** The hooks need a transition through `analyzing → completed` (analysisComplete) or a `failed` spec with a budget-shape error string (budget-toast). The completed Petstore is steady-state `completed` (cold-load → hook does NOT fire, by design). Reproducing live would have required either (a) re-analyzing the completed Petstore (~$0.08 OpenRouter cost) or (b) crafting a synthetic failed spec with a forged budget-shape `analysisError`. Both hooks are RTL-tested with explicit transition + dedupe assertions; the tests are stricter than a one-shot browser run would be.

## Verification results


| Step                             | Result                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test`                   | **298 / 298 pass** (was 259 + 39 new Epic 08 tests across 11 new files; 44 test files total).                                                                                                                                              |
| `npm run lint`                   | 0 errors. Same 10 pre-existing warnings in `scripts/spike/`* (Epic 00 baggage, untouched).                                                                                                                                                 |
| `npm run build`                  | Clean. New routes: `/icon.svg` (static), `(app)` `not-found`, `(auth)` `not-found`, root `not-found`. All other routes unchanged.                                                                                                          |
| Browser: login → /specs          | ✓ Title `Specs · apiq`. Zero hydration warnings in DevTools console. Sonner Toaster mount visible as `aria-label="Notifications alt+T"` region.                                                                                            |
| Browser: /specs/[specId]         | ✓ Title `<spec.name> · apiq`. Action-row shows Versions / Re-pull / Re-analyze / Export JSON / Export YAML. Default-highlighted is "Export JSON" (matches Petstore's `sourceFormat`).                                                      |
| Browser: Export JSON click       | ✓ File downloaded with name `swagger-petstore-openapi-30-v3.json`. Toast `Exported as JSON` rendered.                                                                                                                                      |
| Browser: Export YAML click       | ✓ File downloaded `swagger-petstore-openapi-30-v3.yaml`. (Toast was forcibly cleared via `t.remove()` for the click — that JS-induced React error is a Playwright-test artefact, not a regression. Re-navigation confirmed clean console.) |
| Browser: Versions drawer         | ✓ Opens via Versions (3) trigger; shows v3 (current pill, violet) / v2 / v1 newest-first.                                                                                                                                                  |
| Browser: Mobile banner @ 800×800 | ✓ Banner renders above `<SidebarInset>`. Click X → sessionStorage key `apiq.mobile-banner-dismissed = '1'` set, banner unmounts.                                                                                                           |
| Browser: Sidebar hydration       | ✓ Zero hydration warnings on `(app)` routes.                                                                                                                                                                                               |


## Acceptance-criteria coverage (23 / 23)


| AC                                                                                       | Status | Evidence                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Two export buttons; default-highlighted matches `Spec.sourceFormat`; not both primary | ✓      | Browser snapshot: JSON variant=default, YAML variant=outline (Petstore is JSON-sourced)                                                                                                                               |
| 2. Export JSON downloads `<slug>-v<n>.json` with 2-space-indented currentJson            | ✓      | Downloaded `swagger-petstore-openapi-30-v3.json`                                                                                                                                                                      |
| 3. Export YAML downloads `<slug>-v<n>.yaml`                                              | ✓      | Downloaded `swagger-petstore-openapi-30-v3.yaml`                                                                                                                                                                      |
| 4. Round-trip JSON.parse / yaml.parse deep-equals currentJson                            | ✓      | `src/__tests__/export/actions.test.ts` round-trip assertions                                                                                                                                                          |
| 5. Filename slug rules ("My Spec!" → "my-spec-v1.json")                                  | ✓      | `src/__tests__/lib/slug.test.ts` 7 cases                                                                                                                                                                              |
| 6. Cross-workspace export returns 404                                                    | ✓      | `src/__tests__/export/actions.test.ts` cross-workspace                                                                                                                                                                |
| 7. All `(app)` screens render skeletons on initial load                                  | ✓      | New `loading.tsx` for /specs, /specs/[specId], /settings                                                                                                                                                              |
| 8. Each route group has `error.tsx` per Cards conventions                                | ✓      | `(app)/error.tsx`, `(auth)/error.tsx` + polished `(app)/specs/error.tsx`                                                                                                                                              |
| 9. Each route group has `not-found.tsx`                                                  | ✓      | `(app)/not-found.tsx`, `(auth)/not-found.tsx`, root `not-found.tsx` + polished `(app)/specs/not-found.tsx`                                                                                                            |
| 10. Versions drawer empty state ("No applies yet.")                                      | ✓      | `versions-drawer.tsx` line below list when `length <= 1`                                                                                                                                                              |
| 11. Mobile fallback banner at <1024 px, dismissible per session                          | ✓      | Browser-verified at 800×800 + RTL test                                                                                                                                                                                |
| 12. Toast infrastructure functional + TOASTS catalog assertion                           | ✓      | Browser observed `Exported as JSON` toast + `src/__tests__/toasts/catalog.test.ts`                                                                                                                                    |
| 13. `formatQuotaToast` is canonical for both shapes                                      | ✓      | Existing `spec-ingestion/toasts.test.ts` covers both branches                                                                                                                                                         |
| 14. Favicon + `<title>` + `<meta description>` per route                                 | ✓      | Browser titles confirmed: `Sign in · apiq`, `Specs · apiq`, `<spec.name> · apiq`. `src/app/icon.svg` shipped.                                                                                                         |
| 15. README "Quick start" section                                                         | ✓      | `README.md` updated                                                                                                                                                                                                   |
| 16. Vitest export tests pass                                                             | ✓      | 298 / 298                                                                                                                                                                                                             |
| 17. `formatAnalysisError` (Epic 05-shipped) verified, single source of truth             | ✓      | Existing 12 tests still pass; budget-toast hook imports the unchanged helper                                                                                                                                          |
| 18. Sidebar hydration warning fixed (option chosen + reasoned)                           | ✓      | Option (a) chosen; browser-verified zero warnings                                                                                                                                                                     |
| 19. Pre-launch checklist reconciliation                                                  | ✓      | See "Pre-launch checklist reconciliation" section below                                                                                                                                                               |
| 20. Spec-Detail budget-toast hook                                                        | ✓      | `src/__tests__/spec-detail/budget-toast-hook.test.tsx` once-per-session dedupe                                                                                                                                        |
| 21. Toast wiring on Spec Detail header buttons (7 wiring points)                         | ✓      | All 7: spec-detail-header onRepull (success + rate_limited) + onReanalyze; FailedPanel.onRetry; finding-card stale Re-analyze (Epic 06); specs-list-view row Re-analyze + Re-pull + Delete (Epic 07). All RTL-tested. |
| 22. `TOASTS.analysisComplete` polling-layer hook                                         | ✓      | `src/__tests__/spec-detail/analysis-complete-hook.test.tsx` transition + cold-load + dedupe                                                                                                                           |
| 23. Versions-drawer trigger pulse on Apply / Undo Apply                                  | ✓      | `src/__tests__/spec-detail/versions-drawer.test.tsx`                                                                                                                                                                  |


## Pre-launch checklist reconciliation (AC #19)


| Item                                                           | Status        | Reasoning                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rotate Supabase password                                       | DEFERRED-V0.2 | Operator-side runbook step; no code change. Engineer-time-vs-impact: dev-only DB, password is in chat history but not public; the rotation belongs to the deploy-prep checklist, not the v0.1 codebase.                                                                                                |
| Replace `AUTH_SECRET` + `INTERNAL_API_SECRET` dev placeholders | DEFERRED-V0.2 | Operator-side runbook step. The placeholders are explicitly dev-only; production deploy runbook (Epic 04 results §"Cross-cutting / pre-launch") covers the rotation.                                                                                                                                   |
| Replace Turnstile test keys with real Cloudflare keys          | DEFERRED-V0.2 | Operator-side; requires creating a Cloudflare zone for the actual deploy domain. Test keys auto-pass which is correct for dev.                                                                                                                                                                         |
| Rename 3 `{UUID}.png` design references                        | **RESOLVED**  | Renamed to `fillow-template-reference.png` (referenced in `prd-decisions.md`), `design-reference-1.png`, `design-reference-2.png`. `prd-decisions.md` reference updated. CLAUDE.md checklist annotated.                                                                                                |
| Verify OpenRouter pricing table (monthly cadence)              | DEFERRED-V0.2 | Operational cadence task, not code work. The pricing table in `src/lib/analysis/runAnalysis.ts` carries a `// Last verified 2026-05-02` comment; future epics or v0.2 add this to a deploy runbook.                                                                                                    |
| Clean up dev-DB Petstore-failed spec                           | DEFERRED-V0.2 | Per Epic 04 results §Q6 the `cmooa9mr70001poulfc6lgbhl` spec is intentionally left in `failed` state for Epic 05 failed-card UX testing. Cleanup before broader collaboration is correct, but it's a one-line `prisma.spec.delete({ where: { id: '...' }})` at deploy-prep time; not v0.1 engineering. |


5 of 6 items DEFERRED with reasoning; 1 RESOLVED in this commit. All 4 deferred items are operator-side runbook steps, not code work — the v0.1 codebase is launch-ready in code terms.

## Risks for future epics

There are no future v0.1 epics — Epic 08 closes the v0.1 sequence. Risks below are forward-looking notes for v0.2.

1. **Sonner toast persistence in Playwright tests.** The default Sonner config keeps toasts on-screen indefinitely until dismissed; a Playwright test that interacts with elements behind a toast will block until the toast is dismissed. The browser-verification harness in this epic worked around it once via `t.remove()` (which broke React's reconciliation). v0.2 / future epic verifications should either (a) configure Sonner with `duration={2500}` ms to auto-dismiss, or (b) call `toast.dismiss()` programmatically between assertions. Not blocking for v0.1; flagging.
2. **Toast catalog growth.** 12 entries in v0.1 is small enough that linear inspection works. v0.2's first multi-locale or multi-message epic should consider grouping by emitting-feature in `src/lib/toasts.ts` (e.g. nested namespaces `TOASTS.spec.deleted` etc.) so consumers don't `cmd-F` through 50+ flat keys.
3. **Mobile-fallback banner is one-time-per-session per browser.** A user who dismisses on a small viewport and resizes back-and-forth will not see the banner again until they open a new tab. Acceptable for v0.1's "engineer-tool, desktop-only" stance. v0.2 may want a "remember dismissed for N days" cookie if any mobile-marketing path opens up.
4. **Sidebar mounted-gate adds a brief no-tooltip render on first load.** Pre-mount, the icon-only collapsed sidebar (if cookie says collapsed) shows raw icons without their hover tooltips. The mount completes within 1 frame in practice; user-perceptible cost is negligible. Worth knowing if any future a11y audit flags the gap.
5. **Per-route metadata uses static `metadata` exports.** Next.js 16's metadata API does not allow conditionally-async metadata in static exports — only the dynamic `[specId]` page uses `generateMetadata`. If v0.2 introduces user-personalised titles ("Welcome, Per ·"), the static exports need to be replaced with `generateMetadata`. Not a v0.1 concern.
6. `**exportSpecAction` ships dereferenced + cycle-stripped specs.** Per Epic 03 + spec line 16, recursive types in the exported file appear as `{"$ref": "#cyclic"}` markers, not standard OpenAPI. A user opening the export in Swagger Editor will see those as invalid `$ref` URIs. v0.2's "re-bundling on export" is the documented fix. Out of scope for v0.1.

## Patterns established

1. **Mounted-gated client island for hydration-sensitive primitives.** `<SidebarNavItems />` uses `useSyncExternalStore` to detect mount, then conditionally passes a prop that controls the SSR/CSR-divergent behaviour. Reusable for any future shadcn primitive that produces a hydration warning.
2. **sessionStorage dedupe pattern for per-spec / per-resource toasts.** The budget-toast and analysisComplete hooks both write a per-resource key (`apiq.<feature>-toast.<resourceId>`) and check it before firing. Future polling-driven hooks (e.g. v0.2 spec-drift detection) follow the same shape.
3. **Sonner dispatch via thin `showToast` wrapper.** `src/lib/toasts.ts` is the single integration point for the toast library. Switching to a different toast lib in v0.2 only touches one file.
4. `**generateMetadata` for dynamic routes; static `metadata` for everything else.** Established convention for any future route the project adds. The `(app)/specs/[specId]/page.tsx` shape is the reference.
5. **Per-route `error.tsx` + `not-found.tsx` + `loading.tsx` triplet.** Every route group now has all three, providing a baseline for any future route the project adds.

## Open questions

1. **Should Sonner toasts auto-dismiss after N seconds?** Today: no auto-dismiss (Sonner default). User must click or ignore. Pro for keep-as-is: persistent feedback is useful for transient operations. Con: stacking toasts during a multi-action flow (e.g. apply 5 findings in quick succession → 5 stacked "Patch applied" toasts) becomes visual noise.
  **Recommendation:** Add `duration={4000}` to the `<Toaster>` mount. 4 s is the common convention (Sonner docs default suggestion; Linear / Vercel use ~4 s). Cheap one-line change. If left as-is, the "Patch applied 5 times" stack is a UX rough edge that only surfaces on first power-user.
2. **Should the mobile-fallback banner block the app entirely (e.g. show a full-screen "Use desktop" page) instead of just warning?** Today: warns + lets user proceed. Per spec scope §"Mobile fallback banner" the warning approach is correct ("the app still renders below the banner"). But a user who dismisses + uses the app on mobile will see broken layouts and may blame apiq.
  **Recommendation:** Keep current. Spec text is unambiguous. v0.2 mobile-responsive work (out of scope per `prd.md`'s "Not for v0.1" mobile UI exclusion) replaces the banner with real responsive layouts. Closing the door entirely would frustrate engineers who briefly check apiq from a phone.

do it now ie full responsive

1. **Should the export endpoint also be available as a GET route (`/api/specs/[specId]/export.json`)?** Spec line 173 raised this; recommendation in spec was "no, v0.1 keeps it as a server action only". Implementation matches: server action only.
  **Recommendation:** Keep current. `curl`-friendly export is v0.2 territory. Today's flow is browser-only; the server-action shape is the right v0.1 affordance.
2. **Should the README quick-start include a section on running the Phase 0 spike?** Spec line 176 raised this as a recommendation-yes. Today's README quick-start is implementation-focused and does NOT mention the spike harness.
  **Recommendation:** Add a one-line pointer at the bottom of the quick-start: "For prompt experimentation: see `specs/research-spike.md` and run `cd scripts/spike && npx tsx run-prompt.ts <variant> <spec>`." Cheap addition; helps a contributor who wants to iterate on the prompt without reading 8 epic specs first.

should we have something like an oboarding demo or so?

1. **Should the Petstore-failed spec in the dev DB get auto-cleaned during deploy-prep?** Today: leftover `cmooa9mr70001poulfc6lgbhl` carries a real zod-error `analysisError`. Useful for failed-card UX testing in dev (Epic 05 / Epic 08); confusing in a production-like environment.
  **Recommendation:** Add a one-line `prisma.spec.delete({ where: { id: '...' } })` to the eventual deploy-prep runbook. Or accept that v0.1's launch is small enough that this 1-row cleanup is operator-trivial. v0.1 codebase change: NONE.

of course it needs to be cleaned up before deploy. but when is deploy actually going to happen?

---

## Follow-up after user review (2026-05-03)

User left three inline comments on the open questions. None of them request a recommendation — they're directives or genuine questions. Responses below; no code changes in this round (Q2 needs an upstream PRD decision; Q4 + Q5 are clarifying questions back to the user).

### Q2 — "do it now ie full responsive" — PRD conflict, escalating

The user wants full responsive layouts instead of the v0.1 mobile-fallback banner. **This conflicts with the PRD directly:**

> `prd.md` §"What apiq is NOT (for v0.1)" — table row: `Mobile UI | Engineering tool, desktop-first | **Not on roadmap`**

"Not on roadmap" is stronger than "v0.2" — the PRD currently states mobile UI is permanently out of scope, not deferred. The mobile-fallback banner (Epic 08 spec line 50, AC #11) is the documented v0.1 acknowledgement of that stance. Doing full responsive now is therefore (a) a PRD-level scope change, AND (b) bigger than any single epic.

**Effort estimate, if approved:**

- `(app)/layout.tsx` — already partly responsive (shadcn `<Sidebar>` flips to a Sheet at small viewports). One pass to verify the sheet variant works end-to-end.
- `(app)/specs/page.tsx` — the 7-column shadcn `<Table>` at <800 px overflows horizontally. Replace with a card-list-per-row layout below `md:` breakpoint OR add `overflow-x-auto`. Card-list is a real redesign; overflow-x is a one-liner band-aid.
- `(app)/specs/[specId]/page.tsx` — already stacks at `<lg` (1024 px) thanks to `lg:grid-cols-[280px_1fr]`. Verify finding-card render at 360 px.
- `spec-detail-header.tsx` — already `flex flex-wrap`. Probably OK.
- `finding-card.tsx` — diff viewer + JSON-patch table need horizontal-scroll wrappers; both currently wrap (DiffViewer is OK; PatchOpsTable already has `overflow-x-auto`). Verify at 360 px.
- `(app)/settings/page.tsx` + auth pages — already mobile-friendly (max-w-2xl / max-w-sm).
- `(app)/specs/new/page.tsx` — Card with form, probably OK.

Rough size: 1–2 days of work for a clean responsive pass + browser-verification at 360 / 768 / 1024 / 1440 viewports + RTL responsive snapshots. NOT polish-sized — closer to a full new epic.

**Recommendation:** Two options, pick one before I proceed:

- **(A) Treat as a new follow-up patch.** Update `prd.md` to remove "Mobile UI" from the "Not for v0.1" table (or move it to v0.2 explicitly). Spawn `/spec_ind 09 mobile-responsive "..."` to scope the redesign properly. Epic 08 stays closed as-is. The mobile-fallback banner is removed in Epic 09 once responsive lands.
- **(B) Cheap band-aid only — append to Epic 08.** Add `overflow-x-auto` to the specs-list table wrapper, verify finding-card at 360 px, keep the banner for everything else. Doable in 30 minutes. NOT a real responsive design — just stops the worst horizontal-overflow paper-cut.

I lean (A) because (B) ships a half-finished mobile experience that's worse than the current banner-only honesty. The banner says "this is desktop-first"; (B) silently degrades on mobile without telling the user.

**Question for you:** which path? If (B), I can do it now and re-commit as a polish patch on top of `d098d31`. If (A), I'll wait for the PRD update + new epic spec before touching responsive.

maybe b is enough. who needs openapi specs mobile? i dont know how important this is - do you have any idea?

### Q4 — "should we have something like an onboarding demo or so?"

Today's onboarding flow is the empty-state CTA on `/specs` (Epic 07): "Try with a sample spec" → `loadSampleSpecAction({ sampleId: 'openweathermap' })` → redirect to `/specs/[newSpecId]` → analysis runs → user sees real findings within ~60 s. That IS the v0.1 onboarding demo. It's not gated on signup-vs-existing-user (the empty state shows whenever the workspace has zero specs).

A richer onboarding (interactive guided tour, multi-step welcome modal, video) is real product work. Options if you want more:

- **(A) Lightweight — add a "Hi, you're new here" copy-block** above the empty state with one paragraph explaining what apiq does. Cheap (~30 min), discoverable.
- **(B) Mid — guided tour using `react-joyride` or `shepherd.js`** that highlights the Add Spec button → Spec Detail → Findings → Apply flow on first login. ~1 day. Library + content + dismiss-state.
- **(C) Heavy — recorded video / screencast + landing page**. Marketing work, not engineering.

**Recommendation:** Today's "Try with a sample" CTA is enough for v0.1's engineer-tool audience. Engineers don't read welcome modals; they want to see the tool work. If usage data later shows new users bounce without trying the sample, add (A) as a one-paragraph polish patch. (B) is v0.2 territory.

**Question for you:** is today's "Try with a sample spec" enough, or do you want me to ship (A) the one-paragraph welcome copy now?

its enough i think. i like it. do users have to be signed up for this?

### Q5 — "of course it needs to be cleaned up before deploy. but when is deploy actually going to happen?"

I don't know — that's a product / business decision, not engineering. From context: v0.1 is now feature-complete (Epic 08 closes the implementation sequence). The 4 remaining `DEFERRED-V0.2` items in the pre-launch checklist are operator-side runbook steps (Supabase password rotation, secret rotation, Turnstile real keys, Petstore-failed cleanup, OpenRouter pricing verification) — most take <1 hour total.

**Question for you:** do you have a target deploy date? If yes, I'd recommend writing a `LAUNCH-RUNBOOK.md` at the repo root listing the 5 operator-side steps in order, so the deploy-day work is mechanical. I can draft that runbook now if you'd like — it's ~50 lines of markdown, no code.

lets discuss this in more detail, after the other questions are resolved? is that possible?

---

## Round 2 — user responses + (B)-band-aid shipped (2026-05-03)

### Q2 — "(B) is enough … do you have any idea?"

User picked (B) — band-aid responsive — and asked whether I have data on mobile usage for OpenAPI tooling. **I don't have hard data**, but the qualitative read is: API engineers reviewing specs almost always do it at a workstation. They need an IDE, a wide diff viewer, and shell access to run `openapi-generator` / `redoc` / `curl` / git workflows alongside. The realistic mobile traffic shape for a tool like apiq is: someone clicks a Slack link from their phone to glance at "what is this", then re-opens it on desktop to actually work. So (B) — keep desktop-only, just stop the worst horizontal-overflow paper-cut on mobile glance — is the right size.

**Implemented in this commit:**

1. `src/app/(app)/specs/specs-list-view.tsx` — table wrapper class changed from `overflow-hidden rounded-lg border border-border` to `overflow-x-auto rounded-lg border border-border`. The 7-column table now scrolls horizontally **inside** its container at <800 px instead of pushing the whole page wider than the viewport.
2. `src/app/(app)/specs/[specId]/spec-detail-header.tsx`:
  - Long source-URL `<code>` got `break-all` (was wrapping but not breaking long URLs at 360 px).
  - Action-button row got `flex-wrap` (was `flex` — 4 buttons at 360 px overflowed to 560 px). Now the row wraps to 2–3 lines on narrow screens.

**Browser-verified at 360 × 800:**


| Screen            | Before                        | After                                                                                         |
| ----------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `/specs`          | document overflows to ~700 px | `documentScrollWidth = 360`, table scrolls internally (table = 942 px wide, wrapper = 310 px) |
| `/specs/[specId]` | document overflows to ~560 px | `documentScrollWidth = 345`, no overflow (URL break + button-row wrap fixed)                  |
| `/settings`       | already fine (max-w-2xl)      | `documentScrollWidth = 345`, no overflow                                                      |


The mobile-fallback banner stays — its job is now just to set expectations ("this is best on desktop") rather than be the only mobile-handling mechanism. Screenshot: `docs/screenshots/epic-08-specs-360.png` (specs list + banner at 360 px).

Tests still 298 / 298 (no test changes; no behavioural changes — only Tailwind utility-class tweaks). Lint clean. Build clean.

### Q4 — "its enough i think. do users have to be signed up for this?"

**Yes** — `/specs` is in the `(app)` route group, gated by Epic 02's middleware (`middleware.ts` matcher: `['/specs/:path*', '/settings/:path*']`). Anonymous users get redirected to `/login?callbackUrl=/specs`. The empty-state CTA only renders for authenticated users with zero specs.

**If you want unauthenticated demo access**, you'd need to add a public route like `/demo` that renders a mock Spec Detail with hard-coded findings (no DB, no analysis). Rough cost: half a day. Trade-off: another surface to maintain + a fake-data path that drifts from real findings over time. Not recommended unless landing-page conversion data later shows the signup gate is dropping warm leads.

For v0.1 the signup-required path is the right shape — it ensures every demo run goes through `loadSampleSpecAction` which uses real LLM analysis on a real Postgres row, so the user sees the actual product immediately.



do the users can an example link ie to the swagger petshop or whatever? so that they can easily check out apiq before applying to their own specs?

### Q5 — "lets discuss this in more detail, after the other questions are resolved?"

Yes — happy to. When you're ready, reply with one of:

- "Draft `LAUNCH-RUNBOOK.md` now, target date TBD" → I write the markdown, no other change.
- "Target date is YYYY-MM-DD, draft the runbook + checklist with that date" → I anchor the runbook to your timeline.
- "Skip the runbook, I'll keep it in my head" → I close Q5 with no action.



actually my question is: where are we now? what exactly, or which user flow, have we implemented in v0.1? and what is in v0.2? is it worth already deploying v0.1 and maybe publishing it somewhere? what do we have to do to publish it somewhere? shall users pay their own llm calls? and how to implement this? and what else do we still have to implement for real users to be able to use apiq?



---

## Round 3 — sample-link follow-up + launch-readiness brief (2026-05-03)

### Q4 follow-up — "can users click an example link (Swagger Petstore etc.)?"

**Yes, this already exists** — the empty-state on `/specs` has a secondary "Try with a sample spec" button. Per Epic 03 + Epic 07: when the workspace has zero specs, the Empty State renders the violet "Add spec from URL" primary CTA + a ghost "Try with a sample spec" secondary CTA. Clicking the secondary CTA calls `loadSampleSpecAction({ sampleId: 'openweathermap' })` → loads the bundled OpenWeatherMap spec from disk → analyzes → redirects to `/specs/[newSpecId]` where the user sees real findings within ~60 s.

The sample is **OpenWeatherMap, not Petstore.** Why: OpenWeatherMap is small (1 endpoint), publicly known, and produces interesting findings (the spec literally embeds an API key as a default query parameter — Epic 04's verify run flagged this as critical). Petstore is bigger (19 endpoints), more design-mature, and produces more "design" findings than "risk" findings — less compelling as a first impression.

**If you want to also offer Petstore (or others)**, the work is small:

- `src/app/(app)/specs/actions.ts` — extend `SAMPLE_ALLOW_LIST` from `Set(['openweathermap'])` to include the others (`stripe`, `dnd5eapi`; **not** `pagerduty` per the existing CLAUDE.md note: no upstream LICENSE).
- `src/app/(app)/specs/empty-state.tsx` — replace the single secondary button with a small radio / select / 2-3 buttons row (Try OpenWeatherMap / Try Petstore / Try D&D 5e API).
- Cost: ~15-30 minutes + 1 follow-up Vitest test.

Two Petstore caveats:
- Petstore is in `openapi-examples/` but I don't see a `petstore` sample folder there. Would need to add `openapi-examples/petstore/spec.json` + a tiny README. Maybe 5 minutes more.
- The dev DB already has 2 Petstore specs from Epic-03/04 verification runs — the workspace would show the new sample-loaded Petstore plus those leftover ones. Not a blocker but visually confusing during testing.

**Recommendation:** Today's single OpenWeatherMap sample is doing the marketing job ("see findings on a real API in 60 s"). Adding more samples is value-add for repeat trial users (people who already hit the OpenWeatherMap demo and want to see another) — relatively rare on first-impression. Keep as-is for v0.1; if user feedback says "I tried the sample, what now?", add Petstore as a v0.2 polish patch.

**Question for you:** keep single sample for v0.1, or add Petstore now (~30 min)?

### Q5 — Launch-readiness brief

Genuinely good questions. Long answer; I'll structure as: (a) what's in v0.1, (b) what's NOT in v0.1, (c) what it takes to publish, (d) the LLM-payment question, (e) what's left for real users. No code in this round — this is a planning artefact.

#### (a) What v0.1 actually does (the implemented user flow)

A solo engineer (or small workspace owner) lands on the signup page, creates an account, and gets a workspace. They:

1. **Sign up** at `/signup` → Cloudflare Turnstile passes → User + Workspace + UserWorkspace created atomically → redirected to `/specs`.
2. **Land on /specs** with an empty state. Two CTAs: "Add spec from URL" or "Try with a sample spec" (loads OpenWeatherMap).
3. **Add their first spec** at `/specs/new` by pasting a URL (optionally with an `Authorization` header for private specs). Backend fetches → validates as OpenAPI 3.x → dereferences `$ref`s → saves originalJson + currentJson + initial SpecVersion → redirects to `/specs/[id]`.
4. **Watch the analysis happen** on `/specs/[id]` — `analysisStatus` flips `pending` → `analyzing` → `completed` (~60 s). UI polls every 3 s and shows a spinner. On `completed`, the user sees a quality score (0–100), a tag-grouped endpoint list on the left, and 5–20 finding cards on the right. Each finding has: title, severity, category, narration (~3-5 sentences, engineering-grade), rationale, JSON Patch ops, before/after diff preview, Apply / Reject buttons.
5. **Apply or Reject patches** one at a time. Apply mutates `currentJson`, creates a new SpecVersion (linear history), and updates the quality score. Reject just dismisses the finding. Both have Undo. The Versions drawer shows the full edit history.
6. **Re-pull or Re-analyze** any time. Re-pull fetches the URL again (open findings flip to `outdated`); Re-analyze runs LLM analysis on the current spec (open findings replaced with fresh ones).
7. **Export** the modified spec as JSON or YAML. Filename includes spec slug + version number.
8. **Manage settings** at `/settings` — workspace name, profile name, theme (Light/Dark), sign out.

That's the v0.1 promise: "Upload a spec, see what's wrong, fix it in clicks, export the result." It works end-to-end against the real Supabase DB + real OpenRouter Sonnet (verified by `scripts/verify-llm-pipeline.ts` + every Epic-04+ browser run).

#### (b) What v0.1 deliberately does NOT do

From `prd.md` §"What apiq is NOT" + epic out-of-scope sections:

- Multi-spec aggregation, capability/journey mapping (v0.2 "Landscape")
- Net-new endpoint generation from gaps (v0.3 "Generation")
- Spec-drift detection / change monitoring (v0.4 "Governance")
- Deep auth scanning (BOLA exploitation, runtime fuzzing) — different lane, stays out
- Spec-discovery from Git / API gateways — different lane, stays out
- Team features (commenting, approvals, role hierarchy) — single user per workspace
- AsyncAPI / GraphQL / gRPC — OpenAPI 3.x only
- Mobile UI — desktop-first, banner only (now with the (B) band-aid for graceful degradation)
- i18n — English only
- Formal a11y audit — best-effort via shadcn defaults
- Re-bundling `$ref`s on export — exports are dereferenced + cycle-stripped
- Specific-version export / bulk export / diff export — single-current-version export only
- CI/CD pipeline / preview deploys / production deploy runbook
- Performance profiling / bundle-size audit
- Custom error illustrations / branding polish
- Two-call architecture for >50-endpoint specs (v0.2 if calibration says it's needed)
- Analytics / telemetry beyond the internal `LLMCall` audit

So v0.1 is a **single-user, single-spec, single-workspace, English-only, desktop-only design partner.** That's the focus.

#### (c) What it takes to publish v0.1 somewhere

Today the codebase runs on `localhost:3000` against a dev Supabase DB. To put it in front of real users:

**Infrastructure (operator-side, ~half a day):**
1. Create a production Supabase project (separate from dev). Copy the migration history, run `npx prisma migrate deploy` against the prod URL.
2. Create a Vercel project, point it at this GitHub repo. Configure environment variables on Vercel: `DATABASE_URL` (prod Supabase), `AUTH_SECRET` (rotate via `openssl rand -base64 32`), `INTERNAL_API_SECRET` (rotate), `OPENROUTER_API_KEY` (your real key), `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (real Cloudflare keys; create a new Turnstile widget on your deploy domain).
3. Buy or assign a domain (apiq.dev / apiq.io / wherever). Point DNS to Vercel.
4. Verify deploy: signup → add spec → analyze → export. End-to-end on the real domain.
5. Set up Vercel's deploy notifications + a basic health check.

**Legal + content (engineering-adjacent, ~half a day):**
6. Privacy policy page at `/privacy` (legally required for accounts; even a templated one is enough for v0.1). Mention: Supabase data location, OpenRouter as a sub-processor (your prompts get sent to Anthropic via OpenRouter).
7. Terms of service page at `/terms` (use rate limits, no warranty, etc.). Templated is fine.
8. A footer link to both from at least the signup page (most jurisdictions require pre-signup acceptance).

**Smoke testing (~2 hours):**
9. Real signup with a fresh email → real spec analysis → real export. Verify each step on the deploy.

That's the minimum to publish. Probably **1 day end-to-end** if everything goes smoothly. Two days if Vercel / Supabase / DNS surprises happen.

#### (d) Should users pay for their own LLM calls?

Three viable shapes — pick based on your audience:

- **(A) Operator-funded with workspace caps (today's shape).** Each workspace gets `$10 / 24h` (per Epic 04). You eat the cost. **Pros:** zero friction for users, fastest signup → value path. **Cons:** doesn't scale beyond a small group; one bad-actor workspace could cost you up to $10/day until they hit the cap. **Best for:** public-but-friend-small launch (≤50 users), or a free-tier with a paid tier added later.
- **(B) Bring-your-own-key.** Add an `OpenRouter API key` field in Settings; `runAnalysis` uses it instead of the env var. **Pros:** zero ongoing cost to you. **Cons:** UX friction (most engineers don't have OpenRouter accounts; explaining what to sign up for adds another funnel step); secret management complexity (encrypt-at-rest in Postgres, never log, rotation flow). Implementation: ~2 days. **Best for:** open-source / self-hosted positioning where you're publishing the codebase and users run their own instances.
- **(C) Stripe-billed metered usage.** You pay OpenRouter; users pay you a markup (e.g., $0.10 per analysis above the free tier of N/month). Stripe Customer Portal for billing. **Pros:** sustainable revenue model. **Cons:** ~2 weeks of work (Stripe integration, usage metering, plan-tier UI, dunning, refunds). **Best for:** real product launch where you intend to grow.

**For "publish v0.1 somewhere" today, my recommendation: stay on (A).** $10/day/workspace is a small enough cap that even 50 active workspaces in a worst-case bad-actor day costs you $500. Watch the `LLMCall` table; if a workspace burns through the cap repeatedly, you can manually add a per-workspace override or kick them. Plan the v0.2 → (B) or (C) migration after you have actual usage data showing whether engineers will pay.

#### (e) What else is needed for "real users"

These are the gaps between "feature-complete v0.1" and "actually serviceable for paying / public users". Roughly ordered by importance:

1. **Email verification on signup.** Today: signup just succeeds with the user's claimed email — no proof of ownership. Anyone can sign up with `someone-else@gmail.com`. Auth.js v5 has a `Email` provider that handles verification flows. Cost: ~1 day. Important if real users are coming.
2. **Forgot-password flow.** Today: no recovery. If a user forgets their password they're locked out forever. Cost: ~1 day.
3. **Sentry (or equivalent) for error tracking.** Today: server-side errors print to stdout; client-side errors disappear. You won't know about a broken deploy until a user complains. Cost: ~2 hours.
4. **Privacy + ToS pages (covered in (c) above).**
5. **Better failed-analysis UX.** Today: when LLM analysis fails (zod validation, OpenRouter outage), the failed-card shows the raw zod error JSON via `formatAnalysisError`. Engineer-readable but ugly. Cost: ~half a day to add user-friendly error categories ("LLM service is temporarily unavailable, please retry" / "Your spec is too complex to analyze, try a smaller subset").
6. **Account-deletion + data-export.** GDPR/privacy compliance in the EU. "Delete my account" button in Settings → cascades to Workspace, Specs, etc. "Export my data" button → ZIP of all your specs. Cost: ~1 day combined.
7. **Usage limits visible to the user.** Today: when a user hits the $10/24h cap, they see "Daily LLM budget reached ($X / $10) — resets at <time>" via the budget-toast hook. But they have no UI to see their usage *before* hitting the cap. A simple usage meter in Settings ("$X.XX of $10.00 used today") would help. Cost: ~half a day.
8. **Documentation / FAQ.** Today the only docs are in this repo's `prd.md` etc. — internal-facing. A user-facing "what is apiq" landing page + 5–10 FAQ entries are needed. Cost: ~1 day for content + a simple `/about` route.
9. **Welcome email after signup.** Standard onboarding signal. ~2 hours via a transactional email service (Resend / Postmark).

**Rough total to "real users":** ~5–8 days of engineering. Order of priority: (4) + (1) + (2) + (3) before any external link goes out, then (5)–(9) over the first week of usage.

#### So — is it worth deploying v0.1?

**Yes, IF the audience is friends-and-collaborators ("look at this, give me feedback") rather than the public.** That audience tolerates the missing email-verification, forgot-password, sentry, privacy-page gaps. You'd just need to: do (c) infrastructure + privacy/ToS, run the operator-side pre-launch checklist, and you can put it behind a public URL.

**Not yet, if the audience is the public.** Without (1) + (2) + (3) at minimum, the first time someone forgets a password or hits a bug, you'll lose them.

**Concrete next step recommendation:** Decide which audience first. If friends-and-collaborators, I can spawn `/spec_ind 09 launch-prep "infrastructure + privacy-page + onboarding gaps for friends-launch"` and we close out the operator-side work in one focused epic. If public, that's `/spec_ind 09 production-readiness "..."` and it's a 1-week sequence covering everything in section (e).

**Question for you:** which audience? (Or: do you want me to draft both options as one-page sketches so you can decide?)

---

> **Status:** Q4 closed for v0.1 (single sample is enough; expansion deferred). Q5 expanded into a launch-readiness brief — awaiting your call on (1) Petstore-as-2nd-sample (~30 min) and (2) friends-launch vs public-launch path for v0.1 deploy. Epic 08 code is final and committed at `5430fd6`.

