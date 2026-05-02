# Epic 06 — Patch Apply

> Wires the apply / reject / undo loop on findings. Mutates `Spec.currentJson` via RFC 6902 JSON Patch ops, creates new `SpecVersion` rows, handles patch conflicts by flipping the finding to `stale`. Re-uses the disabled-button surface laid down by Epic 05.

## Scope

- **Shared analysis-library imports** — `applyFindingAction` and `undoApplyAction` consume helpers owned by Epic 04:
  - `validatePatchOps` from `src/lib/analysis/validate-patches.ts` (the cycle-aware patch + hallucination validator).
  - `cycleStripSpec` from `src/lib/analysis/stringify-spec.ts` (used to ensure `currentJson` is acyclic before `applyPatch`; Epic 03 already stores it that way, but a defensive call is cheap and means a future loader change can't silently break this epic).
  Both are ports of the Epic 00 spike (`scripts/spike/validate-patches.ts`, `scripts/spike/stringify-spec.ts`) and are consumed verbatim — do not re-implement.
- Server actions:
  - `applyFindingAction({ findingId })`:
    1. `getRequiredSession()` — workspace check.
    2. Apply rate-limit check (≤30 applies per hour per workspace; reuse `WorkspaceActionLog` from Epic 03).
    3. Load the Finding; require `status = 'open'` (else return `{ kind: 'invalid_status' }`).
    4. Load the Spec + currentVersion.
    5. Validate `patchOps` against `Spec.currentJson` using `validatePatchOps` from `src/lib/analysis/validate-patches.ts` (ported from `scripts/spike/validate-patches.ts` — Epic 00 reference implementation). The validator combines:
       - `fast-json-patch.validate` against a `structuredClone` of the cycle-stripped `currentJson`,
       - a hallucination check that resolves each op's source pointer (RFC 6901): for `add` the parent must exist; for `replace`/`remove`/`test` the `path` must exist; for `move`/`copy` the `from` must exist (the destination `path` is created by the op and must NOT be checked — this is bug-fix #1 from the spike), and
       - a `structuredClone`-based `applyPatch` dry-run to confirm path resolution.
       If validation fails (`!applyClean` OR `hallucinated`) → set finding `status = 'stale'`, return `{ kind: 'patch_stale', message }` (using the validator's `applyError` or `hallucinationCheck.details`). **Do not** mutate the spec. The validator MUST be called against the cycle-stripped `currentJson` (Epic 03 stores it that way; Epic 04 prompts the LLM with the same shape — all three observers agree).
    6. Apply: `const newJson = fast-json-patch.applyPatch(structuredClone(currentJson), patchOps, /*validate*/ true).newDocument`. `structuredClone` is mandatory (Node 17+; available in Vercel runtime) — `JSON.parse(JSON.stringify(...))` will choke on any value that becomes non-JSON during prior in-memory transforms, and `currentJson` may carry cycle markers (`{"$ref":"#cyclic"}`) per Epic 03; the markers are themselves ordinary JSON and survive cloning intact.
    7. In a single transaction:
       - create `SpecVersion { specId, parentVersionId: currentVersionId, versionNumber: maxVersionNumber + 1, json: newJson, label: finding.title }`
       - update `Spec.currentJson = newJson`, `Spec.currentVersionId = newVersion.id`
       - update Finding: `status = 'applied'`, `appliedAt = now`, `appliedInVersionId = newVersion.id`
       - **recompute** `Spec.qualityScore = computeQualityScore(remainingOpenFindings)` using the deterministic formula from Epic 04 (`src/lib/analysis/quality-score.ts`); the apply removes one finding from the open-set so the score should usually rise. Pure function — no LLM call.
    8. Return `{ success: true, newVersionId }`. UI re-fetches the spec and the findings list updates.
  - `rejectFindingAction({ findingId })`:
    - **Workspace check**: `getRequiredSession()` first; load Finding's Spec and verify `Spec.workspaceId === session.workspaceId` (return 404 on mismatch — required by AC #11).
    - require `status = 'open'`; set `status = 'rejected'`, `rejectedAt = now`. Recompute `Spec.qualityScore` (rejected drops out of the open-set). No SpecVersion created.
  - `undoApplyAction({ findingId })`:
    - **Workspace check**: `getRequiredSession()` first; load Finding's Spec and verify `Spec.workspaceId === session.workspaceId` (return 404 on mismatch — required by AC #11).
    - require `status = 'applied'`.
    - `appliedInVersionId` must equal `Spec.currentVersionId` (i.e. this was the most recent apply). Otherwise return `{ kind: 'not_latest_apply', message: "Only the most recent apply can be undone." }`. Linear undo only — no rebase.
    - In a transaction:
      - find `parentVersion = SpecVersion.findUnique({ id: currentVersion.parentVersionId })`
      - create `SpecVersion { specId, parentVersionId: currentVersionId, versionNumber: maxVersionNumber + 1, json: parentVersion.json, label: 'Undo: ' + finding.title }`
      - set `Spec.currentJson = parentVersion.json`, `Spec.currentVersionId = newVersion.id`
      - set Finding `status = 'open'`, clear `appliedAt`, `appliedInVersionId`
      - recompute `Spec.qualityScore` (the finding rejoins the open-set)
    - return `{ success: true }`.
  - `undoRejectAction({ findingId })`:
    - **Workspace check**: `getRequiredSession()` first; load Finding's Spec and verify `Spec.workspaceId === session.workspaceId` (return 404 on mismatch — required by AC #11).
    - require `status = 'rejected'`; set `status = 'open'`, clear `rejectedAt`. Recompute `Spec.qualityScore` (the finding rejoins the open-set, lowering the score).
- Wire these actions into the Spec Detail screen (Epic 05): enable the Apply / Reject buttons, add Undo Apply on `applied` cards, Undo Reject on `rejected` cards. `stale` and `outdated` cards show a read-only badge with a "Re-analyze to refresh" hint that calls `reanalyzeSpecAction` (Epic 04).
- When `applyFindingAction` returns `{ kind: 'patch_stale' }`, the UI MUST NOT show a destructive / error toast. Instead it (a) silently re-renders the finding card in its new `stale` state (status badge changes from `open` to `stale`), and (b) shows a non-blocking inline hint on that single card: "This patch is no longer applicable to the current spec. Re-analyze to refresh." with a "Re-analyze" button calling `reanalyzeSpecAction` (Epic 04). Per Epic 00 results: hallucinated patches are an expected residual (≤6.7% in the spike), and the user should never see an apply-error toast for them.
- **Quota-toast emission** (per Epic 08 cross-epic handoff): when `applyFindingAction` returns `{ success: false, error: { kind: 'rate_limited', retryAt } }` (from the apply rate-limit at step 2), the Apply button's `useTransition` / `useActionState` consumer calls `showToast(formatQuotaToast(error))` from `@/lib/toasts` (Epic 08). The same applies to any future rate-limit on Reject / Undo (currently none — see Open Questions). `budget_exceeded` is not produced by Epic 06 actions.
- Add a **Versions drawer** to Spec Detail: collapsible side drawer listing all SpecVersions for the spec (newest first), each row showing `versionNumber`, `label`, `createdAt`. Read-only — no rollback-to-version action in v0.1 (see Out of scope).
- Diff preview on the finding card (already scaffolded in Epic 05) is now also computed live: when the user expands "Show diff", `fast-json-patch.applyPatch` is invoked client-side on a sub-tree slice to render before/after. (Server-side computation is also acceptable; pick whichever has lower complexity in implementation.)
- Tests (Vitest):
  - `applyFindingAction` happy path: creates SpecVersion, updates Spec, marks finding applied
  - `applyFindingAction` on stale-patch: marks finding `stale`, no SpecVersion created
  - `applyFindingAction` rate-limit branch
  - `applyFindingAction` cross-workspace 403
  - `rejectFindingAction` + `undoRejectAction` round-trip
  - `undoApplyAction` happy path on the latest applied finding
  - `undoApplyAction` rejected when the finding isn't the latest apply (`not_latest_apply`)
  - SpecVersion `versionNumber` increments correctly across mixed apply / undo / re-pull sequences

## Acceptance criteria

1. Apply on an `open` finding with valid `patchOps`: a new `SpecVersion` is created, `Spec.currentJson` and `Spec.currentVersionId` update, finding becomes `applied` with `appliedAt` and `appliedInVersionId` set. `versionNumber` is `previousMax + 1`.
2. Apply on a finding whose `patchOps` fail validation flips the finding to `status = 'stale'`, does NOT mutate the spec, and creates no SpecVersion; the server action returns `{ kind: 'patch_stale' }`. The three hallucination shapes that must each be tested:
   - 2a. `add` whose parent path does not exist (e.g. `add /paths/~1foo/get/parameters/-` when `/paths/~1foo/get` is missing). Stale.
   - 2b. `replace` / `remove` / `test` whose `path` does not exist. Stale.
   - 2c. `move` or `copy` whose `from` does not exist. Stale.
   - 2d. `move` or `copy` whose `path` (destination) ALREADY exists is NOT stale — `path` is the destination, created by the op (per RFC 6902 / `validate-patches.ts`). This is the spike's bug-fix and must remain green.
3. Reject on an `open` finding sets `status = 'rejected'` and `rejectedAt`. No SpecVersion changes.
4. Undo Apply on the latest applied finding (whose `appliedInVersionId === Spec.currentVersionId`): creates a new SpecVersion containing the parent version's `json`, sets it as current, flips the finding back to `open`.
5. Undo Apply on an applied finding that is NOT the latest apply (because another apply happened on top of it) returns `{ kind: 'not_latest_apply' }` and changes nothing.
6. Undo Reject on a rejected finding flips it back to `open` and clears `rejectedAt`.
7. Apply / Reject / Undo buttons are visible and functional on the Spec Detail screen for the appropriate finding statuses.
8. `stale` and `outdated` finding cards render a read-only badge plus "Re-analyze to refresh" button that calls Epic 04's `reanalyzeSpecAction`.
8a. When `applyFindingAction` returns `{ kind: 'patch_stale' }`, the UI does NOT show an error toast. The finding card transitions to `stale` and shows the inline "This patch is no longer applicable, re-analyze" hint with a working Re-analyze button. (Tested via Vitest + RTL: simulate the action returning `patch_stale`, assert no `aria-live=assertive` error toast is rendered.)
9. The Versions drawer lists all SpecVersions (newest first) with `vN`, label, timestamp. The current version is visually marked.
10. After an Apply, the UI re-renders without a full page reload (server-action revalidation): the finding card moves to `applied`, and the quality-score badge updates from the freshly-recomputed `Spec.qualityScore` (written by `applyFindingAction` in the same transaction — see Scope step 7).
11. Cross-workspace apply / reject / undo returns 404 (workspace check via `getRequiredSession`).
12. Apply rate-limit: 31st apply within an hour for a workspace returns `{ success: false, error: { kind: 'rate_limited', retryAt } }`.
13. Vitest tests above pass.

## Out of scope

- **Rollback to a specific SpecVersion** (full-history-rewind UI). v0.1 supports only per-finding "Undo Apply" on the latest apply. Linear undo only.
- **Bulk apply** ("Apply all critical findings") — v0.2.
- **Auto-rebase** of stale patches. v0.1 sets the finding to `stale` and asks the user to re-analyze. v0.2 may attempt to re-emit a fresh patch via the LLM.
- **Hash-based finding identity** across re-analyses — v0.2 (see Epic 04).
- **Undoing a Reject after another action has happened on top** — Undo Reject is always allowed (no version state to roll back).
- **Quality-score recomputation on Apply / Undo** — see Open Question; the simple v0.1 behaviour is "score updates next time `runAnalysis` runs". See AC 10 for the alternative.
- **Per-version diff** (compare any two SpecVersions) — v0.2.
- **Conflict-resolution UI for stale patches** — v0.2 (currently the user just re-analyzes).
- **Manual JSON editing** — v0.2.

## Domain terms

- **Apply** — execute a finding's `patchOps` against `Spec.currentJson`, creating a new SpecVersion and marking the finding as `applied`.
- **Reject** — mark a finding as `rejected` without changing the spec.
- **Undo Apply** — only valid for the most recent `applied` finding. Creates a new SpecVersion that copies the parent version's JSON (the state before the apply), and flips the finding back to `open`. **Linear** — cannot undo applies that have other applies on top.
- **Undo Reject** — flips a `rejected` finding back to `open`. Always valid.
- **`stale` (status)** — set when `validatePatchOps` (Epic 04 lib, ported from `scripts/spike/validate-patches.ts`) returns `!applyClean` OR `hallucinationCheck.hallucinated` against `Spec.currentJson` at apply time. Read-only; user must re-analyze. This gate is the production safety net that Epic 04's pass-criterion 2 (≤5% hallucination) relies on per research-spike.md §"Pass-criterion 2 relaxation rationale" — without this gate, Epic 04 cannot ship.
- **`outdated` (status)** — set by Epic 03 re-pull on all previously open findings (the spec was replaced wholesale). Distinct from `stale`. Read-only.
- **SpecVersion graph** — every SpecVersion has a `parentVersionId` (except the initial). Apply creates a child of `currentVersion`. Undo Apply creates a child whose `json` equals the *grandparent*'s `json` — keeping the graph linear, never re-pointing parents.
- **Versions drawer** — read-only list of SpecVersions in the Spec Detail screen.

## Open questions

- (resolved) **Quality-score recomputation on Apply / Undo Apply / Reject / Undo Reject:** option (a) — recompute via `computeQualityScore` (Epic 04 pure function) over the current `open` set inside the same transaction as the status change, write to `Spec.qualityScore`. Pure function, no LLM cost. **Subtle implication:** `reject` also raises the score (the rejected finding drops out of the open-set). This is consistent with the current `computeQualityScore` definition but semantically fragile ("user dismisses a warning" then "spec quality goes up"). v0.2 may revisit by extending the formula to weight `applied` and `rejected` differently. Out of scope for v0.1.
- **Atomic SpecVersion `versionNumber` increments under concurrent applies.** Two simultaneous applies on the same spec could both compute `maxVersionNumber + 1` and conflict. Recommendation: a unique `(specId, versionNumber)` constraint with a serial transaction wrapper, or a `nextVersionNumber` counter on Spec. Confirm during implementation.
- **Side-by-side diff sub-tree computation: client-side vs server-side.** Client-side keeps the server action small (the action returns only `success`); server-side avoids shipping `currentJson` to the client (could be ≤5 MB). Recommendation: client-side for v0.1, server-side if the spec's currentJson is large enough to make the client sluggish. Decide in implementation.
- **Rate-limit on Undo Apply / Undo Reject** — currently no limit. Recommendation: don't limit (low-risk operations, low LLM cost).
- **Versions drawer pagination** for specs with many applies — v0.1 expects ≤30 versions per spec, list inline; revisit if a spec ever grows to 100+ versions.
