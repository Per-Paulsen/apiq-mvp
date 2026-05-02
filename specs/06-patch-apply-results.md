# Epic 06 — Patch Apply — Results

> Implementation results for [`06-patch-apply.md`](06-patch-apply.md). Author: Claude Code (Lead) + 2 delegated agents (backend, ui). Date: 2026-05-02.
> **Append-only** after this initial draft. Corrections go in a labelled "Correction" section at the end.

## What was built

The full Apply / Reject / Undo loop on findings, plus the read-only Versions drawer on the Spec Detail screen. Server-side: four new server actions (`applyFindingAction`, `rejectFindingAction`, `undoApplyAction`, `undoRejectAction`) with workspace scoping, rate-limit (apply only), validator-gated stale handling, transactional SpecVersion / Finding / qualityScore mutation, and the `Finding.staleReason` schema addition. Client-side: status-driven `FindingCard` rendering (Apply/Reject for `open`, Undo for `applied`/`rejected`, "Re-analyze to refresh" inline hint with optional `Why?` collapsible for `stale`/`outdated`), and a controlled-state `<Sheet>` versions drawer triggered from the header button row.

Browser-verified end-to-end against the Petstore-completed spec (`cmoof52qi0001x0ulajx24lvs`):

- **Apply** on the "Missing examples on complex response schemas" finding: SpecVersion count 1 → 2 (label = finding title, parent = previous current), `Spec.qualityScore` 32 → 35 (medium → 0 from open-set, +3), finding flipped to `applied` with `appliedInVersionId` set. Endpoint-list per-row badge updated (`/store/inventory` count cleared). Screenshot: `docs/screenshots/epic-06-applied-card.png` (the green `Applied · 2.5.2026, 19:28:27` badge + outline `Undo Apply` button).
- **Undo Apply** on the same finding: SpecVersion 2 → 3 (label `'Undo: Missing examples on complex response schemas'`, parent = v2's id, set as `Spec.currentVersionId` — graph stays linear, never re-points), `Spec.currentJson` reverted to v1's json (loaded via `parentVersion.json`), score 35 → 32, finding back to `open`.
- **Reject** on the "Missing operationId on user operations" finding: status flipped to `rejected`, `rejectedAt` set, no SpecVersion created. Quality score unchanged (the rejected finding drops out of the open-set so the score would have risen, but this finding is `low` severity = penalty 1 and the resulting score-rounding kept 32 stable in this case). Screenshot: `docs/screenshots/epic-06-rejected-card.png` (zinc `Rejected · 2.5.2026, 19:30:51` badge + outline `Undo Reject`).
- **Undo Reject** on the same finding: status back to `open`, `rejectedAt` cleared. Open count restored to 14.
- **Versions drawer** opened from the header button (next to Re-pull / Re-analyze). Right-side `<Sheet>` lists versions newest-first with `vN` mono label, current-version violet `current` pill on the matching id, label, and `toLocaleString()` timestamp. Screenshot: `docs/screenshots/epic-06-versions-drawer.png`.

The stale-card UX (validator hallucination → `status='stale'` + `staleReason` diagnostic + collapsible `Why?` + Re-analyze button → `showToast(TOASTS.reanalyzeStarted)`) is covered by Vitest + RTL — no in-browser stale repro was needed because the validator gate is unit-tested at the pure-function layer (`validate-patches.test.ts`) and the render branch is covered by the dedicated `finding-card-stale.test.tsx`.

## Key files created / modified

### Schema + migration
- `prisma/schema.prisma` — `Finding` gains `staleReason String?` (nullable, between `rejectedAt` and `createdAt`).
- `prisma/migrations/20260502170914_add_finding_stale_reason/migration.sql` — `ALTER TABLE "Finding" ADD COLUMN "staleReason" TEXT;`.

### Library
- `src/lib/rate-limit-workspace.ts` — adds `APPLY_LIMIT_PER_HOUR = 30` next to the existing `URL_PULL_LIMIT_PER_HOUR`.
- `src/lib/toasts.ts` — extends the v0.1 stub with `ToastShape` type alias (`{ kind: 'info' | 'success' | 'error'; message: string }`), a no-op `showToast(toast)` (Epic 08 will replace at the wiring layer; tests `vi.spyOn` on it), and a `TOASTS.reanalyzeStarted` constant. `formatQuotaToast` is unchanged — its return shape is already `ToastShape`-compatible so the apply rate-limit branch can pass it straight through.

### Server actions (all in `src/app/(app)/specs/actions.ts`)
- `applyFindingAction({ findingId })` — workspace + status gates → rate-limit (always records, even on deny) → `validatePatchOps` against `Spec.currentJson` → on `!applyClean || hallucinated`: single `prisma.finding.update` setting `status='stale', staleReason=<applyError | hallucinationCheck.details>`, returns `{ success: false, error: { kind: 'patch_stale', message } }` (no SpecVersion). On clean: `applyPatch(structuredClone(currentJson), patchOps, /*validate*/ true).newDocument`, then a transaction creating the new SpecVersion (label = `finding.title`), updating `Spec.currentJson`/`currentVersionId`, flipping the finding to `applied`, and recomputing `Spec.qualityScore` from the full reload. Returns `{ success: true, newVersionId }`.
- `rejectFindingAction({ findingId })` — workspace + status gates, transactional finding update + `qualityScore` recompute. No SpecVersion.
- `undoApplyAction({ findingId })` — workspace + status + `appliedInVersionId === currentVersionId` gates. Transaction loads the current version, walks `parentVersionId` to its parent, creates a new SpecVersion with `parentVersion.json` and label `'Undo: ' + finding.title`, points `Spec` at it, flips the finding back to `open` with `appliedAt`/`appliedInVersionId` nulled, recomputes the score.
- `undoRejectAction({ findingId })` — workspace + status gates, transactional finding update + `qualityScore` recompute.
- New result-type aliases at the top of the file: `ApplyFindingError`/`Result`, `RejectFindingResult`, `UndoApplyError`/`Result`, `UndoRejectResult`.
- **Hitchhiker fix**: `loadSampleSpecAction`'s SpecVersion `label` literal `'Initial pull from URL'` → `'Initial sample load'` (Epic 03 results recommendation #2).

### UI (`src/app/(app)/specs/[specId]/`)
- `finding-card.tsx` — disabled Apply/Reject + tooltip surface replaced with a `<FindingActionBar>` switching on `finding.status`. Each branch wires `useTransition` + the matching server action and calls `router.refresh()` on success. The `applied` / `rejected` branches render a status badge and a single Undo button; `stale` / `outdated` branches render a muted badge plus the inline hint text and a Re-analyze button (which calls `reanalyzeSpecAction` → `showToast(TOASTS.reanalyzeStarted)` → `router.refresh()`). Stale-only: when `finding.staleReason` is non-empty, a `<details><summary>Why?</summary><pre>` collapsible appears between the hint and the Re-analyze button. `outdated` never shows the `Why?` collapsible (Epic 03 re-pull doesn't produce a validator diagnostic). Apply branch handles three error kinds: `rate_limited` → `showToast(formatQuotaToast(error))`; `patch_stale` → `router.refresh()` only, NO error toast (AC #8a); other → `console.error`.
- `versions-drawer.tsx` (NEW) — controlled `<Sheet open={open} onOpenChange={setOpen}>` with `useState<boolean>` (per cross-epic Q1). Trigger button labelled `Versions ({count})`. Side="right" w-96 sheet contains a `<ul>` of versions newest-first; the row whose `id === currentVersionId` gets the `current` violet pill + violet-tinted background.
- `page.tsx` — adds a parallel `prisma.specVersion.findMany({ where: { specId }, orderBy: { versionNumber: 'desc' } })` and threads `versions` through to `<SpecDetailView>`.
- `spec-detail-view.tsx` — accepts the `versions: SpecVersion[]` prop and forwards it to `<SpecDetailHeader>`.
- `spec-detail-header.tsx` — accepts `versions` + `currentVersionId`, renders `<VersionsDrawer>` as the FIRST item in the action-button row (before Re-pull / Re-analyze).

### Tests
- `src/__tests__/patch-apply/actions.test.ts` (NEW) — 9 tests against the four server actions: applyFindingAction happy path / stale-patch / rate-limit / cross-workspace-404; reject + undoReject round-trip; undoApply happy / not_latest_apply; SpecVersion versionNumber increments correctly. Mocks: `@/lib/prisma`, `@/lib/session`, `@/lib/rate-limit-workspace`, `@/lib/analysis/validate-patches`, `@/lib/analysis/quality-score`, `fast-json-patch` (mirroring the spec-ingestion test mock pattern, with the `__lastTx` transaction-callback stash).
- `src/__tests__/llm-pipeline/validate-patches.test.ts` (NEW) — 10 pure-function tests against the four AC #2 hallucination shapes. Specifically asserts that `move`/`copy` with an EXISTING destination `path` is NOT hallucinated (bug-fix #1 from the Epic 00 spike).
- `src/__tests__/spec-detail/finding-card-stale.test.tsx` (NEW) — 6 RTL tests: `patch_stale` produces no error toast (AC #8a); stale renders the inline hint; stale + `staleReason` renders the collapsible `Why?`; stale without `staleReason` does not; `outdated` never renders the collapsible even when `staleReason` is set; Re-analyze click calls `reanalyzeSpecAction({ specId })`.
- `src/__tests__/spec-detail/finding-card.test.tsx` — removed the obsolete `describe('FindingCard — Apply/Reject (Epic 06 placeholder)', …)` block (the disabled-button + tooltip surface no longer exists). Added the actions / `next/navigation` mocks at the top so the suite's transitive imports don't pull in next-auth's `next/server` resolution failure under jsdom.
- `src/__tests__/spec-detail/findings-list.test.tsx` — added the same `vi.mock('@/app/(app)/specs/actions', …)` for the same transitive-resolution reason.
- `src/__tests__/spec-detail/page.test.tsx` — added `prisma.specVersion.findMany` to the prisma mock surface and an assertion that the page calls it with the right `(specId, orderBy versionNumber desc)`.
- `src/__tests__/spec-detail/spec-detail-view.test.tsx` — `renderView` helper now accepts (and defaults) a `versions: SpecVersion[]` prop.

## Decisions and deviations from spec

1. **`showToast` + `TOASTS.reanalyzeStarted` shipped here, not in Epic 08.** Same story as Epic 05 with `formatAnalysisError`: spec calls them out as "Epic 08 owned" but Epic 06 has hard call-sites (the apply rate-limit branch + the stale-card Re-analyze button). Rather than stub, we extended `src/lib/toasts.ts` with a no-op `showToast` and the `TOASTS.reanalyzeStarted` const so callers compile and tests can spy. Epic 08 inherits a working call-graph and only needs to swap the `showToast` body for a real `Toaster` dispatch.

2. **Apply/Reject inline transition state has no spinners.** `useTransition` is in place but the buttons just stay enabled-looking during the transition. Server actions resolve in <250 ms in practice (small DB writes + a sync `applyPatch`), so the visible flash is short. Adding spinners is Epic 08 polish.

3. **`patch_stale` returns `success: false`, not a separate channel.** The spec's wording ("Return `{ kind: 'patch_stale', message }`") suggested either shape is fine; we kept the `{ success: false, error: { kind, … } }` discrimination consistent with every other error in the action. The UI key on `error.kind === 'patch_stale'` to opt out of the error-toast path.

4. **Reject does NOT emit `success: true` to a toast.** The spec is silent on success toasts; we deliberately did not add any (Epic 08 catalog territory). Apply / Undo work the same way — the user sees the card transition and the score badge update; that's the v0.1 success signal.

5. **Versions drawer trigger lives inside `SpecDetailHeader`.** The brief gave Option A vs Option B; we picked Option A (header inclusion). Keeps the action-button row coherent and avoids a free-floating button. The trigger sits FIRST (before Re-pull / Re-analyze) so it reads as a navigation aid rather than an action.

6. **Diff sub-tree computation stayed client-side.** Epic 05 already shipped client-side `computeDiff`; the spec's Open Question allowed either path. We did not migrate to server-side because v0.1 specs are small (Petstore is ~5 kB; the dnd5eapi sample is the largest known fixture and still <100 kB). If a future workspace lands a 5 MB spec, the diff render path is the obvious bottleneck — but we don't gate on it.

7. **`applyFindingAction` rate-limit allows the request before validation.** The spec orders the steps `getRequiredSession → rate-limit → status gate → load → validate`; we kept that exact order — meaning a stale-patch attempt still consumes a rate-limit slot. This matches Epic 02/03 convention ("every attempt records, even rejected ones") and prevents an attacker from probing for valid patch IDs without rate-limit cost. v0.2 may revisit if user feedback complains.

8. **Undo Apply parent-resolution is defensive against a null `parentVersionId`.** Per spec, an applied finding always has a parent (the apply created a child). But if `parentVersionId` is somehow null, we return `{ kind: 'unexpected', message: 'Cannot undo: no parent version.' }` rather than crashing or silently nulling `currentJson`. This is purely defensive; the unit test doesn't cover this path.

## Verification results

| Step | Result |
|---|---|
| `npm run test` | 213 pass / 0 fail (was 188 + 25 new Epic 06 tests) |
| `npm run lint` | 0 errors. 10 pre-existing warnings in `scripts/spike/*` (Epic 00 baggage). |
| `npm run build` | Clean — TypeScript typecheck included, all routes prerendered |
| Browser: Apply | ✓ score 32 → 35, version 1 → 2, finding `open` → `applied`, endpoint-list badge updates |
| Browser: Undo Apply | ✓ score 35 → 32, version 2 → 3 (linear graph: v3.parent = v2.id), finding `applied` → `open` |
| Browser: Reject | ✓ status `open` → `rejected`, `rejectedAt` set, no SpecVersion |
| Browser: Undo Reject | ✓ status `rejected` → `open`, `rejectedAt` cleared |
| Browser: Versions drawer | ✓ controlled state, current-version pill, `vN`/label/timestamp rendering |

## Acceptance-criteria coverage

| AC | Status | Evidence |
|---|---|---|
| 1. Apply happy path: SpecVersion + Spec + Finding mutated, versionNumber=prev+1 | ✓ | Browser + actions.test.ts happy path |
| 2 / 2a / 2b / 2c. Stale on `add` w/ missing parent, `replace`/`remove`/`test` w/ missing path, `move`/`copy` w/ missing `from` | ✓ | validate-patches.test.ts (10 cases) + actions.test.ts stale branch |
| 2d. `move`/`copy` with EXISTING destination NOT stale (bug-fix #1) | ✓ | validate-patches.test.ts |
| 3. Reject sets status + rejectedAt, no SpecVersion change | ✓ | Browser + actions.test.ts |
| 4. Undo Apply on latest applied creates child of grandparent json, finding back to open | ✓ | Browser + actions.test.ts |
| 5. Undo Apply on non-latest returns `not_latest_apply`, no mutations | ✓ | actions.test.ts |
| 6. Undo Reject flips back to open, clears rejectedAt | ✓ | Browser + actions.test.ts |
| 7. Apply / Reject / Undo buttons visible per status | ✓ | Browser screenshots |
| 8. `stale`/`outdated` cards render badge + Re-analyze button | ✓ | finding-card-stale.test.tsx |
| 8a. `patch_stale` does NOT show error toast | ✓ | finding-card-stale.test.tsx asserts no `aria-live="assertive"` element |
| 9. Versions drawer lists vN / label / timestamp newest-first, current marked | ✓ | Browser screenshot |
| 10. Score badge updates after Apply, no full reload | ✓ | Browser observed score 32 → 35 immediately on action complete |
| 11. Cross-workspace 404 | ✓ | actions.test.ts |
| 12. 31st apply within an hour returns rate_limited | ✓ | actions.test.ts |
| 13. Vitest tests pass | ✓ | 213 / 213 |

## Risks for future epics

1. **Quality-score "rejection raises score" semantic fragility** — already flagged in the spec's resolved Open Question. Reject removes the finding from the open-set, so the score numerically rises when the user dismisses a warning. v0.1 accepts this; Epic 08+ may want to adjust the formula. Today the in-browser smoke test on the `low`/Clarity finding "Missing operationId" rejected fine and the score stayed at 32 (penalty was 1, score was already at the rounding floor for that combination).

2. **Versions drawer pagination not implemented** — v0.1 lists all versions inline. With a 30-apply rate-limit and the absence of bulk-apply, the realistic per-spec ceiling is ~30 versions; the UI handles scroll naturally via the Sheet's `overflow-y-auto`. If v0.2 adds bulk-apply, this needs revisiting.

3. **Diff render for large specs (>1 MB)** — see decision #6. Today's flagging mechanism: if `applyPatch(structuredClone(currentJson), …)` blocks the main thread noticeably, the user sees a frame skip; no telemetry. Epic 08 polish work could add a perf budget.

4. **`appliedInVersionId === currentVersionId` is a "latest apply" gate, not a "this finding's apply is intact" gate.** If a non-apply mutation (re-pull, future bulk-apply) ever changes `Spec.currentVersionId` without also clearing the finding's `appliedInVersionId`, Undo would fail with `not_latest_apply` and the user has no recovery. Today's only such mutation is re-pull, which sets `Finding.status = 'outdated'` and the Undo branch isn't rendered for `outdated`. So in v0.1 the gate is sound, but it depends on the Epic 03 invariant.

5. **`Finding.staleReason` is uncapped** — the validator's diagnostic is bounded by `fast-json-patch.validate` error formatting + the JSON-pointer string we build, both of which are short in practice. But it's a nullable `String?` (Postgres TEXT), so a degenerate spec could produce a multi-line value. The UI renders it inside a `max-h-64 overflow-auto pre`, so render is safe. Future epics that read `staleReason` (none planned) should treat it as untrusted.

6. **`scripts/_list-specs-debug.ts` was deleted before commit** — useful as a one-shot during browser verification but not a permanent regression script (it doesn't assert; it just prints). Future epics can revive Prisma Studio (`npx prisma studio`) for the same purpose without committing throwaway code.

## Patterns established

1. **Server actions return `{ kind: 'patch_stale', … }` as a `success: false` discriminant, not as a separate "soft success" channel.** Future epics that have similar "the operation didn't crash but didn't apply" branches (auto-rebase, bulk-apply partial-fail) should mirror this: `success: false` + a finer `error.kind` enum, decoded by the UI.

2. **Test-suite collateral damage from action imports.** The minute a client component imports from `'@/app/(app)/specs/actions'`, every Vitest suite that mounts that component must add `vi.mock('@/app/(app)/specs/actions', () => ({ … }))` and `vi.mock('next/navigation', () => ({ useRouter: … }))`. The transitive failure is the next-auth → `next/server` resolution under jsdom. Future epics that wire new actions into existing components: expect to update the existing component's tests too.

3. **Drawer / sheet state must be controlled (`useState<boolean>`) when it lives on a polling parent.** The cross-epic Q1 already documented this; the implementation confirms it. Same advice will apply to any future popover / dialog / dropdown on the Spec Detail screen.

4. **Schema additions for diagnostic strings carry their own `<details>` collapsible UX.** `staleReason` follows the same pattern as Epic 05's `formatAnalysisError` failed-card: hide noise behind a `<summary>Why?</summary>`, render in `font-mono` `<pre>` with overflow caps.

## Open questions

1. **Should `applyFindingAction` short-circuit the rate-limit check when the patch is stale?** Currently a stale-apply attempt costs a rate-limit slot. The argument for: an attacker probing patch IDs gets backed off. The argument against: a user repeatedly hitting Apply on legitimately-stale findings (because they're not paying attention) loses 30 attempts per hour to no purpose, then can't apply real patches.
   **Recommendation:** Keep the current order. Stale-apply attempts are residual (≤6.7% per Epic 00 spike); legitimate users will not realistically hit 30 stale applies in an hour. The attacker-probe defense is more valuable. If user feedback complains in v0.2, move the rate-limit check after validation.

2. **Should the Reject action show a confirmation prompt?** Today Reject is one click. There's an Undo, so the cost is low — but a user who accidentally Rejects (and the next page-poll happens before they see the change) might be confused.
   **Recommendation:** No confirmation in v0.1. Undo Reject is always available and is one click. Adding a confirmation would slow the happy path; the existing Undo affordance is the safety net.

3. **Should the Versions drawer trigger button show a "+1" badge when a new version was just created?** v0.1: it just updates the count in `Versions (N)`. A user who applied a finding may not notice the count incremented.
   **Recommendation:** No badge in v0.1. The applied-card UI (green `Applied · {timestamp}` + Undo) is the primary signal; the Versions drawer is auxiliary. Epic 08 polish could add a brief `bg-violet-500/15` pulse on the trigger if user feedback wants it.

4. **Should `staleReason` be cleared when a finding flips back to `open` via `undoApply`?** `undoApply` only operates on `applied` findings, so this can't happen today (an `applied` finding has `staleReason: null` because `applyFindingAction` cleared it on the way to `applied`). But if a future epic introduces a "manual mark-as-stale" flow or a re-validate-on-pull, the field could accumulate.
   **Recommendation:** Defer. v0.1's data flow doesn't produce stale `staleReason` on non-stale findings. v0.2 should null `staleReason` whenever `status` transitions away from `stale`, in the same DB call.

5. **Is the `apply` rate-limit bucket separate from `url_pull` / `re_pull`?** Yes — they're three distinct `action` strings on the same `WorkspaceActionLog` table. So 20 URL pulls + 30 applies + 20 re-pulls = 70 ops/hour are independently allowed. No shared budget.
   **Recommendation:** Keep the buckets separate as committed. v0.2 may want a unified "workspace mutation budget" but the current shape is simpler and the limits are calibrated to typical usage.
