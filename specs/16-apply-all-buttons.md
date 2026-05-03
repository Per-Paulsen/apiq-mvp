# Epic 16 — Apply-All Buttons (Critical + Confirm)

> Two prominent buttons on the Spec Detail screen: **Apply-All-Critical** (one-click severity-color-coded) and **Apply-All** (with confirm modal). Magic Moment #2 — score animates 32 → 53 with finding-cards flipping to applied state.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Foundation block" rows 5–6, §2 "Magic Moment #2", [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Foundation-Block" + §"Magic Moment #1".

## Scope

### Server-side: Apply-All sequence

- New server action `applyAllAction({ specId, scope: 'critical' | 'all' })` at `src/app/(app)/specs/[specId]/actions.ts`:
  - `getRequiredSession()` workspace check + workspace-rate-limit (`apply_all`, 5/workspace/h).
  - Load all `Finding` rows where `specId = X AND status = 'open'`. If `scope = 'critical'` filter to `severity = 'critical'`.
  - Sort: **`severity DESC, endpointPath ASC, endpointMethod ASC, id ASC`** (deterministic).
  - Iterate findings in order, inside one Prisma `$transaction`:
    - Re-validate the patch via `validatePatchOps` against current in-transaction `currentJson`.
    - If invalid → record `{ findingId, reason: 'stale' }` in `skipped[]`, continue.
    - If valid → apply patch (existing `applyFindingAction`-internals), re-validate via `swagger-parser.validate` (Epic 14's hook), update `Finding.status = 'applied'`, increment SpecVersion.
    - If validation fails → halt, rollback this single patch, record `{ findingId, reason: 'validation_failed' }` in `halted[]`, return early.
  - After loop: recompute quality score, write `Spec.qualityScore`.
  - Return `{ applied: Finding[], skipped: Array<{ findingId, reason }>, halted?: { findingId, reason }, newScore: number, oldScore: number }`.

### UI: Apply-All-Critical button

- Lives in Spec Detail header (Epic 17's three-pane layout — but the buttons themselves don't depend on three-pane and can be built first; this epic ships them on the existing single-pane layout, Epic 17 re-positions).
- Button label: *"Apply All Critical"* with `n` count badge: *"Apply All Critical (3)"*.
- Severity-color-coded: red border + red-tinted text + violet primary fill on hover. Disabled with tooltip *"No critical findings"* when `n === 0`.
- Click → optimistic UI:
  - Skeleton-state on critical-finding-cards (*"Applying…"* placeholder).
  - Server-action call.
  - On success: animations (see §"Animations").
  - On error (`rate_limited` / `budget_exceeded`): toast via existing `formatQuotaToast`.
  - On `halted`: toast *"Applied N of M; patch failed validation on finding X."*.

### UI: Apply-All button (with confirm modal)

- Secondary button next to Apply-All-Critical.
- Label: *"Apply All"* (no count — count is in modal).
- Click → opens shadcn `Dialog`:
  - Heading: *"Apply 12 findings to this spec?"* (12 = `count of open findings`)
  - Body: *"3 critical · 5 high · 4 medium · 0 low — applied severity-ordered. Stale findings skipped automatically."*
  - Buttons: **Cancel** (ghost) + **Apply 12 findings** (primary, violet).
- On confirm → same flow as Apply-All-Critical, with `scope: 'all'`.
- No "Don't show again" option.

### Animations (Magic Moment #2)

- **Score count-up:** quality-score-hero (Epic 17) animates from `oldScore` → `newScore` over 600 ms easing (cubic-bezier-out). Pure CSS-transition on `transform` + `requestAnimationFrame` for the number text.
- **Card flips:** finding-cards in `applied[]` array flip-to-applied-state sequentially with 80 ms stagger. Each card transitions: badge changes to green "applied", strike-through on title, fade-to-50%-opacity. CSS transitions.
- **Versions-drawer pulse:** existing v0.1 violet pulse (Epic 08) triggers automatically because `versions.length` increased.
- **No framer-motion** — CSS transitions + `requestAnimationFrame` only.

### Tests

- Vitest:
  - `applyAllAction(critical)` happy path on a fixture spec with 3 critical findings → all applied, score recomputed, returns correct shape.
  - `applyAllAction(all)` with mix of severities → severity-DESC ordering verified.
  - Stale-skip: 2nd patch's path conflicts with 1st patch's mutation → 2nd recorded in `skipped[]` with reason `'stale'`, others continue.
  - Halt: a patch that produces invalid spec (Epic 14's hook) → halts at that finding, prior patches stay applied, returned `halted` field.
  - Rate-limit: 6th call within 1h returns `{ error: { kind: 'rate_limited', retryAt } }`.
  - Cross-workspace: returns 404.
  - Concurrent calls: second call while first in-progress → second blocked with toast.
- Component tests:
  - Apply-All-Critical button shows count badge and disables at count=0.
  - Apply-All button opens confirm modal with correct breakdown.
  - Click confirm → calls server action with `scope: 'all'`.
  - Optimistic skeleton appears on click; clears on response.
  - Score-count-up animation runs on success-result.
- Browser smoke check: Spec with 5 critical findings → click Apply-All-Critical → see score animate + cards flip.

## Acceptance criteria

1. `applyAllAction({ specId, scope })` server action exists. Validates workspace, applies severity-ordered, skips stale, halts on validation-failure. Returns the documented shape.
2. Apply-All-Critical button renders next to Apply-All button in Spec Detail header. Both visible, both functional.
3. Apply-All-Critical disabled when no critical findings exist (tooltip explains).
4. Apply-All opens confirm modal with severity breakdown. Cancel closes; Confirm triggers the action.
5. Severity-ordering deterministic per Scope §"Server-side". Tie-broken by path/method/id ASC.
6. Stale handling: skip + continue. UI receives `skipped[]` and shows toast *"Skipped N stale finding(s)"* if any.
7. Halt handling: halts at first validation-failure. Prior patches stay applied; UI shows toast with halted-finding-id.
8. Score-count-up animation runs over 600 ms on success.
9. Card-flip animation is sequential with 80 ms stagger.
10. Versions-drawer trigger pulses (existing v0.1 mechanism via Epic 08).
11. Rate-limit (5/workspace/h on `apply_all`) implemented via `WorkspaceActionLog`. Excess calls return `kind: 'rate_limited'`.
12. Concurrent Apply-All blocked: if a workspace has an in-progress Apply-All (Postgres advisory lock or status-flag on Spec), second call returns `{ error: { kind: 'apply_all_in_progress' } }`. Toast: *"Another apply is in progress."*.
13. All Vitest tests in §"Tests" pass.
14. Magic-Moment-#2 visual verification documented in `specs/16-apply-all-buttons-results.md` with screenshot.

## Out of scope

- Three-pane layout repositioning of the buttons — Epic 17 owns the visual placement; this epic ships the buttons on existing v0.1 single-pane.
- Apply-Single-Finding (existing v0.1 unchanged).
- Undo-Apply-All (single Undo per finding still works; no batched undo for v1).
- Findings filter / search (existing v0.1).
- Live preview integration with the post-Apply-All state — Epic 18.
- Apply-All-by-severity (e.g. Apply-All-High) — only Critical + All in v1; revisit if users request.

## Domain terms

- **Apply-All-Critical** — applies all `severity = 'critical' AND status = 'open'` findings, severity-ordered tie-broken deterministically.
- **Apply-All** — applies ALL `status = 'open'` findings, severity-DESC ordered, with confirm modal.
- **Stale** — a finding whose patch fails `validatePatchOps` against current in-transaction state (typically because a prior patch in the sequence mutated the same path). Recorded in `skipped[]` with `reason: 'stale'`.
- **Halt** — when a patch produces invalid spec (Epic 14's `swagger-parser.validate` hook fails). Prior patches stay applied; remaining findings are NOT attempted.
- **Severity-DESC ordering** — `critical > high > medium > low`; tie-broken by `endpointPath ASC, endpointMethod ASC, id ASC`.

## Open questions

- Animation performance with >50 findings flipping sequentially: 50 cards × 80 ms stagger = 4 s of animation tail. Recommendation: cap stagger at 20 cards (1.6 s); remaining cards flip in a single batch at the end. Validate during impl.
- Concurrent-Apply-All-blocking mechanism: Postgres advisory lock or a `Spec.applyAllInProgressAt` timestamp column. Recommendation: timestamp column with 30s timeout; simpler than advisory lock and survives crashes.
- Should the confirm modal show per-severity breakdown counts as bullets or as a single line? Default: single line as in §"Apply-All button"; revisit if user testing finds it cramped.
- "Apply All" button when all findings are critical: do we still require the confirm modal (slow) or skip directly to Apply-All-Critical's no-confirm flow? Recommendation: still require confirm for consistency. The button explicitly says "Apply All" which implies a deliberate choice.
