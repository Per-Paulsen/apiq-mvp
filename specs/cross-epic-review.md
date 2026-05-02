# Cross-Epic Review — 2026-05-01

## Summary
- **Total specs reviewed:** 9 (00-08); Epic 00 read-only (completed)
- **Specs modified:** 02, 03, 06, 08
- **Specs clean:** 01, 04, 05, 07
- **Total cross-epic findings:** 7 (6 structural applied, 1 NEEDS CONFIRMATION → Phase 2)
- **Triggering inputs:** all spec files post-`/refine_all_ind`, plus `00-research-spike-results.md` (read-only)

## Changes by Epic

### 02 — Auth + Workspace

- **Issue:** `IpActionLog` (Epic 02) and `WorkspaceActionLog` (Epic 03) are sibling rate-limit tables introduced independently; no documented relationship → future-engineer confusion. (Schema drift — sibling tables)
  - **Involved epics:** 02, 03
  - **Change:** Domain term for `IpActionLog` extended to explain the sibling-relationship: same shape (`{ id, scope_field, action, createdAt }`), different scoping (IP vs workspace), intentional non-unification because Prisma doesn't model polymorphic scopes cleanly.
  - **Cascade:** Epic 03 also got a domain-term-level mention (see Epic 03 changes).

### 03 — Spec Ingestion (URL-only)

- **Issue:** `WorkspaceActionLog` was only in Open Questions; Epic 06 references it as defined → Forward dependency gap.
  - **Involved epics:** 03 (owns), 04 (no longer uses — removed via dollar-budget switch), 06 (consumes)
  - **Change:** Moved `WorkspaceActionLog { id, workspaceId, action, createdAt }` from Open Questions into Scope as a committed Prisma model. Added cross-reference to Epic 02's `IpActionLog` and explicit note that Epic 04 does NOT use it (dollar-budget on `LLMCall.costUSD` instead). Added migration AC #1 update to include `WorkspaceActionLog` table creation.
  - **Cascade:** Epic 06 now safe to import without dangling reference; Epic 04 has no obsolete reference (verified).

- **Issue:** `loadSampleSpecAction({ sampleId })` accepted free-form `sampleId` string; PagerDuty exclusion (per Epic 00 results §"Cross-cutting" license issue) only documented in Epic 07 prose, not enforced in code. (Missing handoff)
  - **Involved epics:** 03 (owns the loader), 07 (consumes via empty-state CTA), 00 (results dictate exclusion)
  - **Change:** Restricted `loadSampleSpecAction` to a hard-coded allow-list (v0.1: only `'openweathermap'`); unknown `sampleId` → `{ kind: 'unknown_sample', sampleId }`. PagerDuty / Stripe / dnd5eapi explicitly noted as dev-fixtures only.
  - **Cascade:** Epic 07's existing call (`'openweathermap'`) is unchanged — it falls within the allow-list.

### 06 — Patch Apply

- **Issue:** Quality-score recomputation on Apply / Reject was an Open Question with recommendation but no commit; Epic 07 reads `Spec.qualityScore` for badge → ambiguity about when score updates. (Acceptance criteria gap)
  - **Involved epics:** 06 (writes score on action), 04 (owns `computeQualityScore` pure function), 07 (reads + renders the badge)
  - **Change:** Committed to recompute on all four actions (Apply / Undo Apply / Reject / Undo Reject) inside the same transaction. Pure function call, no LLM cost. Documented the subtle implication that `reject` raises the score (the rejected finding drops out of the open-set) as a known v0.1 trade-off — v0.2 may revisit by weighting `applied` differently from `rejected`.
  - **Cascade:** Epic 07's badge rendering doesn't change (it always reads `Spec.qualityScore`); the value is now updated on every action.

### 08 — Export + Polish

- **Issue:** Standardised rate-limit toast handler only recognises `{ kind: 'rate_limited' }`, but Epic 04's dollar-budget rejection uses `{ kind: 'budget_exceeded' }` → user hits a $10/24h cap and sees no toast. (Missing handoff between Epic 04 → Epic 08)
  - **Involved epics:** 04 (emitter), 08 (handler)
  - **Change:** Extended Epic 08's "Rate-limit polish" section into "Quota-exceeded" handling that recognises both `rate_limited` and `budget_exceeded`. Added per-shape toast wording. Updated AC #13 + Domain terms to reflect both shapes.
  - **Cascade:** Epic 04 unchanged (it was already emitting `budget_exceeded` correctly per the Q4 confirmation).

- **Issue:** Per-action toast wording (e.g. "Patch applied", "Re-pull complete", "Spec deleted", "Re-analyzing…") is not specified anywhere — Epic 08 ships infrastructure, but consuming epics don't define their messages. (Acceptance criteria gap — for the toast experience as a whole)
  - **Involved epics:** 03, 04, 06 (emitters), 08 (infra)
  - **Change:** **NEEDS CONFIRMATION** — added as Open Question on Epic 08. Three options surfaced: (a) Epic 08 owns canonical text catalog; (b) per-epic decides; (c) hybrid.

## Cascading Changes

| Trigger | Cascade |
|---|---|
| Epic 03 commits `WorkspaceActionLog` to Scope | Epic 06's existing reference becomes valid (no edit needed); Epic 04 already moved away (no edit needed) |
| Epic 03 sample-allow-list | Epic 07's existing `'openweathermap'` call still valid (no edit needed) |
| Epic 06 score-recompute commit | Epic 07's badge gains live updates (no edit needed) |
| Epic 08 quota-exceeded shape extension | Epic 04 already emits the right shape (no edit needed) |
| Epic 02 ↔ Epic 03 sibling-tables doc | Both Domain terms updated for symmetry |

## NEEDS CONFIRMATION items (1 → Phase 2 Brainstorming)

1. **Epic 08 — Per-action toast text catalog** — central catalog (Epic 08 owns) vs per-epic wording vs hybrid?

---

## Brainstorming (Phase 2)

> Append-only. Bitte unter die Frage antworten — "ack [empfehlung]" / Variante / Freitext.

### Q1 — Epic 08: Per-action toast wording

Epic 08 ships toast infrastructure (`Toaster` mount + `showToast({kind, message})` helper). But the actual wording for per-action toasts is currently not specified anywhere:

- "Patch applied" / "Patch rejected" / "Apply undone" (Epic 06)
- "Re-pull complete" / "Spec deleted" (Epic 03)
- "Re-analyzing…" / "Analysis complete" (Epic 04)
- "Workspace updated" / "Display name updated" (Epic 07)
- "Exported as JSON" / "Exported as YAML" (Epic 08)

**Optionen:**

- **(a) Epic 08 owns canonical text catalog** — `src/lib/toasts.ts` exports a `TOASTS` object with all v0.1 messages. Each emitter calls `showToast(TOASTS.patchApplied)`. Pros: single place to read, easy i18n later, consistent tone. Cons: Epic 08 needs to know every other epic's actions before it ships.
- **(b) Per-epic decides** — Epic 06 hard-codes "Patch applied", Epic 03 hard-codes "Re-pull complete", etc. Pros: epic-local ownership, no central coupling. Cons: tone drift, harder i18n later, multiple places to find a string.
- **(c) Hybrid** — Epic 08 ships **default messages per kind** (success: "Done", error: "Something went wrong", info: "Heads up") plus a few common ones; epics override for action-specific text. Pros: middle ground. Cons: more rules to remember.

Empfehlung: **(a) catalog**. v0.1 has only ~10 distinct toasts. The catalog file is a 30-line constant. Single point of truth pays for itself when the first translation request arrives. Implementation cost is trivial.

**Antwort:** a

---

## Confirmations Applied

Q1 resolved by user 2026-05-01: option (a) — Epic 08 owns canonical toast text catalog.

### Q1 — Epic 08: TOASTS catalog at `src/lib/toasts.ts`

- `specs/08-export-polish.md` Scope §"Toast system": extended to spec out the `TOASTS` constant with v0.1 entries (specDeleted, rePullStarted, rePullComplete, reanalyzeStarted, analysisComplete, patchApplied, patchRejected, applyUndone, rejectUndone, workspaceUpdated, profileUpdated, exportedJson, exportedYaml). Each emitting epic calls `showToast(TOASTS.<key>)` instead of hard-coding strings.
- `specs/08-export-polish.md` AC #12: rewritten to assert the catalog is consumed; added Vitest test that every `TOASTS.*` entry has `kind` and non-empty `message`.
- `specs/08-export-polish.md` Open Questions: marked resolved.

**Cascade:** Epic 03 (specDeleted, rePull*), Epic 04 (reanalyzeStarted, analysisComplete), Epic 06 (patchApplied, patchRejected, applyUndone, rejectUndone), Epic 07 (workspaceUpdated, profileUpdated) all import `TOASTS` from `src/lib/toasts.ts`. No spec edits needed in those epics — the import path is conventional and they were already specified to "use the showToast helper" without specifying the message strings.

---

**Phase 3 status:** complete. All 1 NEEDS CONFIRMATION resolved. The cross-epic spec set is implementation-ready.

---

# Cross-Epic Review — 2026-05-02

## Summary

- **Total specs reviewed:** 9 (00–08)
- **Read-only (completed epics):** 00, 01, 02
- **Specs reviewed for edits:** 03, 04, 05, 06, 07, 08 (6)
- **Specs modified:** 03, 04, 06, 08
- **Specs clean:** 05, 07
- **Total cross-epic findings:** 4 (4 structural applied, 0 NEEDS CONFIRMATION)
- **Triggering inputs:** the 6 specs as just edited by the 2026-05-02 `/refine_all_ind` pass — particularly Epic 08's quota-toast handling (which contradicted itself) and Epic 04/06's handoff for the new `computeQualityScore` and quota-error flows.

## Changes by Epic

### 04 — LLM Pipeline

- **Issue:** `computeQualityScore` referenced by Epic 06 at `src/lib/analysis/quality-score.ts`, but Epic 04's spike-to-runtime file mapping does not list this file → Epic 06's import path is ungrounded. (Forward dependency gap)
  - **Involved epics:** 04 (owner), 06 (consumer)
  - **Change:** New entry added to Epic 04's spike-to-runtime mapping: `No spike source → src/lib/analysis/quality-score.ts (new file owned by Epic 04). Exports computeQualityScore(findings: Finding[]): number per the formula below. Imported by both runAnalysis (this epic) and Epic 06's apply / reject / undo actions for transactional score recomputation.`
  - **Cascade:** Epic 06's existing reference to `src/lib/analysis/quality-score.ts` is now grounded (no edit needed).

- **Issue:** When `runAnalysis` budget-check rejects with `{ kind: 'budget_exceeded' }`, `Spec.analysisStatus` is never updated. The auto-trigger from Epic 03 is fire-and-forget — without a status update, the spec stays in `'pending'` indefinitely, and Epic 05's failed-card never surfaces the error. (Missing handoff between Epic 04 → Epic 05)
  - **Involved epics:** 04 (producer), 05 (consumer of `analysisStatus` + `analysisError`)
  - **Change:** Epic 04 dollar-budget bullet rewritten — when budget is exceeded, FIRST set `Spec.analysisStatus = 'failed'` + `Spec.analysisError = 'Daily LLM budget reached ($<spent> / $10.00) — resets at <retryAt>'`, THEN return the error shape. Explicit reasoning added: fire-and-forget trigger from Epic 03 cannot surface the error otherwise.
  - **Cascade:** Epic 05's failed-card now correctly renders for the budget case (no edit needed — Epic 05's failed-state handler already reads `analysisStatus + analysisError`).

- **Issue:** `reanalyzeSpecAction` does not produce `budget_exceeded` synchronously (fire-and-forget trigger). Earlier /refine_all_ind edit recommended emitting quota toasts from `useActionState` consumers — that pattern doesn't fit a fire-and-forget action. (Missing handoff between Epic 04 → Epic 08)
  - **Involved epics:** 04, 08
  - **Change:** Note added to Epic 04's `reanalyzeSpecAction` bullet explaining that `budget_exceeded` surfaces via Spec status (per the prior change), not via a synchronous toast. v0.2 may switch to await + sync toast.

### 03 — Spec Ingestion (URL-only)

- **Issue:** Epic 08 ships the quota-error toast handler but no consuming epic (03/04/06) explicitly says they emit the toast on `rate_limited` / `budget_exceeded` returns. Without this handoff, the user hits a rate-limit and sees only the inline form error — no top-right toast. (Missing handoff Epic 08 → Epic 03)
  - **Involved epics:** 03 (producer of `rate_limited` from URL-pull rate-limit), 08 (handler)
  - **Change:** New "Quota-toast emission" bullet added to the Add Spec scope: when `addSpecFromUrlAction` returns `rate_limited`, the form's `useActionState` consumer calls `showToast(formatQuotaToast(error))` from `@/lib/toasts`. Also clarifies that `budget_exceeded` is not produced by this action (covered by Epic 04's status-failed mechanism).

### 06 — Patch Apply

- **Issue:** Same as above — Epic 06's `applyFindingAction` returns `rate_limited` (apply rate-limit, AC #12) but no spec text says the Apply button emits the corresponding toast. (Missing handoff Epic 08 → Epic 06)
  - **Involved epics:** 06 (producer), 08 (handler)
  - **Change:** New "Quota-toast emission" bullet added: Apply button's `useTransition` / `useActionState` consumer calls `showToast(formatQuotaToast(error))` from `@/lib/toasts` when `rate_limited` is returned. Reject / Undo currently have no rate-limit (per Open Questions).

### 08 — Export + Polish

- **Issue:** Internal contradiction introduced by the 2026-05-02 `/refine_all_ind` pass — the same scope bullet says both "top-level toast/banner in `(app)/layout.tsx` that detects either shape" AND "per-form `useActionState` consumers ... no global subscription". One says centralized, one says decentralized. (Inconsistent domain language — within Epic 08, but with cross-epic ripple to 03/04/06)
  - **Involved epics:** 08 (owner), 03/04/06 (downstream)
  - **Change:** Bullet rewritten to commit cleanly to **per-consumer pattern** (no global subscription in v0.1). Epic 08 ships a `formatQuotaToast(error)` helper (TypeScript snippet inlined) at `src/lib/toasts.ts` that the consuming UI surfaces import and call alongside `showToast`. v0.2 may centralize.
  - **Cascade:** Epic 03 + 06 add explicit "Quota-toast emission" bullets pointing at this helper. Epic 04 documents that `reanalyzeSpecAction` does NOT produce a synchronous quota toast (fire-and-forget) — handled via Spec status instead.

- **Issue:** AC #13 referenced "the appropriate message above" but the messages were just prose in the scope bullet — no concrete shape to test against. (Untestable AC)
  - **Change:** AC #13 rewritten to assert behavior of the new `formatQuotaToast(error)` helper (Vitest unit test for both `rate_limited` and `budget_exceeded` branches). Pattern reference to consumers (03/04/06) added.

## Cascading Changes

| Trigger | Cascade |
|---|---|
| Epic 04 commits `quality-score.ts` to file mapping | Epic 06's existing reference is grounded — no edit needed |
| Epic 04 sets `analysisStatus = 'failed'` on budget reject | Epic 05's failed-card UX path covers the budget case automatically — no edit needed |
| Epic 08 commits to per-consumer pattern + `formatQuotaToast` helper | Epic 03 + Epic 06 add explicit quota-toast emission bullets pointing at the helper |
| Epic 04 documents fire-and-forget can't surface synchronous quota | Notes that v0.2 may switch to await + sync toast — captured as future work |

## NEEDS CONFIRMATION items

None. All 4 findings were structural fixes anchoring to existing decisions (Q4 dollar-budget, Q1 toast catalog) or surfacing implicit handoffs.

---

**Status:** Phase 1 complete. Phase 2 (brainstorming) skipped — no NEEDS CONFIRMATION items. Phase 3 not needed.

The cross-epic spec set is implementation-ready. Recommended next: `/dev specs/03-spec-ingestion.md` to start Epic 03.

---

# Cross-Epic Review — 2026-05-02 (Pass 3, post-Epic-03)

## Summary

- **Total specs reviewed:** 9 (00–08)
- **Read-only (completed epics):** 00, 01, 02, 03
- **Specs reviewed for edits:** 04, 05, 06, 07, 08 (5)
- **Specs modified:** 04, 07
- **Specs clean (in this pass):** 05, 06, 08 (the prior `/refine_all_ind` Pass 3 already pulled the cross-epic-relevant Epic 03 conventions into them; no further cross-epic gaps surfaced)
- **Total cross-epic findings:** 4 (4 structural applied, 0 NEEDS CONFIRMATION)
- **Triggering inputs:** the 5 specs as just edited by the 2026-05-02 `/refine_all_ind` Pass 3 — particularly Epic 04's new "modify Epic 03's source" scope items (direct-call swap + Finding wiring) and Epic 07's now-required `revalidatePath` for live sidebar-footer updates.

## Changes by Epic

### 04 — LLM Pipeline

- **Issue:** `reanalyzeSpecAction` file location not specified — Epic 05 imports it but the spec doesn't say where it lives. (Forward dependency gap)
  - **Involved epics:** 04 (owner), 05 (consumer)
  - **Change:** `reanalyzeSpecAction` bullet extended to pin the location: `src/app/(app)/specs/actions.ts` (alongside Epic 03's existing actions). Epic 05 imports from `@/app/(app)/specs/actions`. Same workspace-scoped server-action conventions as Epic 03.
  - **Cascade:** Epic 05 doesn't need an edit — its existing reference to "`reanalyzeSpecAction` from Epic 04" is now grounded.

- **Issue:** Finding-invalidation snippet sets `updatedAt: new Date()` manually — redundant with Prisma's `@updatedAt` auto-handling. (Implementation drift)
  - **Involved epics:** 04 (only)
  - **Change:** Removed the manual `updatedAt: new Date()` from the `tx.finding.updateMany(...)` call in the new "Wire deferred Finding-invalidation" scope bullet. Added a one-line note that Prisma's `@updatedAt` auto-handles the bump for `updateMany`.

### 07 — Specs List + Settings

- **Issue:** AC #10 ("editing workspace name reflects immediately in the sidebar footer") is untestable without the `revalidatePath` mechanism — server-component layouts don't auto-refresh after a server action mutates their data. (Untestable AC / Missing handoff between `updateWorkspaceAction` and the layout's workspace-name fetch)
  - **Involved epics:** 07 (only — owns both the action and the layout edit)
  - **Change:** `updateWorkspaceAction` Workspace bullet extended to require `revalidatePath('/', 'layout')` from `next/cache` after a successful update. Profile bullet annotated to clarify no `revalidatePath` is needed (sidebar footer doesn't surface displayName in v0.1).

- **Issue:** Re-pull row-action visibility says "non-authed pulls" — vague and disconnects from Epic 03's actual `wasAuthedPull` boolean field. (Inconsistent domain language with Epic 03 schema)
  - **Involved epics:** 07 (consumer), 03 (schema)
  - **Change:** Specs List row-action bullet rewritten to spell out the field check: `Spec.sourceType !== 'url' OR Spec.wasAuthedPull === true` hides the button. AC #6 updated with the same explicit field references. Same field name Epic 05 already uses (Epic 05's spec was updated in `/refine_all_ind` Pass 3 to reference `wasAuthedPull` explicitly).

## Cascading Changes

| Trigger | Cascade |
|---|---|
| Epic 04 pins `reanalyzeSpecAction` to `(app)/specs/actions.ts` | Epic 05's existing reference is grounded — no edit needed |
| Epic 04 removes redundant `updatedAt: new Date()` | No cross-epic effect — Prisma handles it |
| Epic 07 commits to `revalidatePath('/', 'layout')` | AC #10 becomes testable; future epics that mutate layout-rendered data follow the same pattern |
| Epic 07 spells out `wasAuthedPull` field check | Domain-language symmetric with Epic 05's `wasAuthedPull` reference (added in `/refine_all_ind` Pass 3) |

## Issues considered but not changed

- **Sidebar hydration warning ownership.** Epic 05 + 07 both have notes about the pre-existing warning (added in `/refine_all_ind` Pass 3). No epic is formally assigned the fix. Pragmatic for v0.1 — leave soft. Likely Epic 05 fixes during impl when the warning's noise crosses a threshold.
- **Budget-exceeded retry loop.** When `Spec.analysisError` is budget-related and the user clicks "Retry analysis" (Epic 05 AC #13), they re-hit the budget cap and see the same error. Could add a disabled-state with `retryAt` parsing — overkill for v0.1, accepted residual.
- **Multiple form-action.ts files in Epic 07 Settings.** Two adapter files (workspace-form-action.ts, profile-form-action.ts) for two server actions. Implementation detail — Epic 07 will figure out; spec already establishes the convention.

## NEEDS CONFIRMATION items

None. All 4 findings were structural fixes (forward-dep grounding + AC testability + domain-language pinning + redundant-field cleanup).

---

**Status:** Phase 1 complete. Phase 2 (brainstorming) skipped — no NEEDS CONFIRMATION items. Phase 3 not needed.

The cross-epic spec set is implementation-ready. Recommended next: `/dev specs/04-llm-pipeline.md` to start Epic 04.
