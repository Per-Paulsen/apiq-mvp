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
