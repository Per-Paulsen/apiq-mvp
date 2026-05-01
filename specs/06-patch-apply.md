# Epic 06 — Patch Apply

> Wires the apply / reject / undo loop on findings. Mutates `Spec.currentJson` via RFC 6902 JSON Patch ops, creates new `SpecVersion` rows, handles patch conflicts by flipping the finding to `stale`. Re-uses the disabled-button surface laid down by Epic 05.

## Scope

- Server actions:
  - `applyFindingAction({ findingId })`:
    1. `getRequiredSession()` — workspace check.
    2. Apply rate-limit check (≤30 applies per hour per workspace; reuse `WorkspaceActionLog` from Epic 03).
    3. Load the Finding; require `status = 'open'` (else return `{ kind: 'invalid_status' }`).
    4. Load the Spec + currentVersion.
    5. Validate `patchOps` against `Spec.currentJson` using `fast-json-patch.validate`. If validation fails (path doesn't exist, wrong op type, etc.) → set finding `status = 'stale'`, return `{ kind: 'patch_stale', message }`. **Do not** mutate the spec.
    6. Apply: `const newJson = fast-json-patch.applyPatch(deepClone(currentJson), patchOps, /*validate*/ true).newDocument`.
    7. In a single transaction:
       - create `SpecVersion { specId, parentVersionId: currentVersionId, versionNumber: maxVersionNumber + 1, json: newJson, label: finding.title }`
       - update `Spec.currentJson = newJson`, `Spec.currentVersionId = newVersion.id`
       - update Finding: `status = 'applied'`, `appliedAt = now`, `appliedInVersionId = newVersion.id`
    8. Return `{ success: true, newVersionId }`. UI re-fetches the spec and the findings list updates.
  - `rejectFindingAction({ findingId })`:
    - require `status = 'open'`; set `status = 'rejected'`, `rejectedAt = now`. No SpecVersion created.
  - `undoApplyAction({ findingId })`:
    - require `status = 'applied'`.
    - `appliedInVersionId` must equal `Spec.currentVersionId` (i.e. this was the most recent apply). Otherwise return `{ kind: 'not_latest_apply', message: "Only the most recent apply can be undone." }`. Linear undo only — no rebase.
    - In a transaction:
      - find `parentVersion = SpecVersion.findUnique({ id: currentVersion.parentVersionId })`
      - create `SpecVersion { specId, parentVersionId: currentVersionId, versionNumber: maxVersionNumber + 1, json: parentVersion.json, label: 'Undo: ' + finding.title }`
      - set `Spec.currentJson = parentVersion.json`, `Spec.currentVersionId = newVersion.id`
      - set Finding `status = 'open'`, clear `appliedAt`, `appliedInVersionId`
    - return `{ success: true }`.
  - `undoRejectAction({ findingId })`:
    - require `status = 'rejected'`; set `status = 'open'`, clear `rejectedAt`.
- Wire these actions into the Spec Detail screen (Epic 05): enable the Apply / Reject buttons, add Undo Apply on `applied` cards, Undo Reject on `rejected` cards. `stale` and `outdated` cards show a read-only badge with a "Re-analyze to refresh" hint that calls `reanalyzeSpecAction` (Epic 04).
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
2. Apply on a finding whose `patchOps` reference a non-existent path: finding flips to `status = 'stale'`, the spec is **not** mutated, no SpecVersion is created. Server action returns `{ kind: 'patch_stale' }`.
3. Reject on an `open` finding sets `status = 'rejected'` and `rejectedAt`. No SpecVersion changes.
4. Undo Apply on the latest applied finding (whose `appliedInVersionId === Spec.currentVersionId`): creates a new SpecVersion containing the parent version's `json`, sets it as current, flips the finding back to `open`.
5. Undo Apply on an applied finding that is NOT the latest apply (because another apply happened on top of it) returns `{ kind: 'not_latest_apply' }` and changes nothing.
6. Undo Reject on a rejected finding flips it back to `open` and clears `rejectedAt`.
7. Apply / Reject / Undo buttons are visible and functional on the Spec Detail screen for the appropriate finding statuses.
8. `stale` and `outdated` finding cards render a read-only badge plus "Re-analyze to refresh" button that calls Epic 04's `reanalyzeSpecAction`.
9. The Versions drawer lists all SpecVersions (newest first) with `vN`, label, timestamp. The current version is visually marked.
10. After an Apply, the UI re-renders without a full page reload (server-action revalidation): the finding card moves to `applied`, the quality score recomputes (server-side, in a follow-up cycle, or by re-reading the persisted `Spec.qualityScore` — see Open Questions).
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
- **`stale` (status)** — set when an apply is attempted but the patch ops no longer validate against `Spec.currentJson` (path missing, wrong op kind, etc.). Read-only; user must re-analyze to get a fresh finding.
- **`outdated` (status)** — set by Epic 03 re-pull on all previously open findings (the spec was replaced wholesale). Distinct from `stale`. Read-only.
- **SpecVersion graph** — every SpecVersion has a `parentVersionId` (except the initial). Apply creates a child of `currentVersion`. Undo Apply creates a child whose `json` equals the *grandparent*'s `json` — keeping the graph linear, never re-pointing parents.
- **Versions drawer** — read-only list of SpecVersions in the Spec Detail screen.

## Open questions

- **Quality-score recomputation on Apply / Undo Apply.** Three options:
  - (a) Recompute on every Apply / Undo from current `open` findings — cheap (deterministic formula, no LLM call).
  - (b) Don't recompute; only refresh on next `runAnalysis`.
  - (c) Recompute as in (a) but only for the score field; treat findings as snapshot until re-analysis.
  Recommendation: **(a)** — `computeQualityScore` is a pure function (Epic 04), and `applied` findings drop out of the open-set so the score should rise after applies. Confirm during implementation.
- **Atomic SpecVersion `versionNumber` increments under concurrent applies.** Two simultaneous applies on the same spec could both compute `maxVersionNumber + 1` and conflict. Recommendation: a unique `(specId, versionNumber)` constraint with a serial transaction wrapper, or a `nextVersionNumber` counter on Spec. Confirm during implementation.
- **Side-by-side diff sub-tree computation: client-side vs server-side.** Client-side keeps the server action small (the action returns only `success`); server-side avoids shipping `currentJson` to the client (could be ≤5 MB). Recommendation: client-side for v0.1, server-side if the spec's currentJson is large enough to make the client sluggish. Decide in implementation.
- **Rate-limit on Undo Apply / Undo Reject** — currently no limit. Recommendation: don't limit (low-risk operations, low LLM cost).
- **Versions drawer pagination** for specs with many applies — v0.1 expects ≤30 versions per spec, list inline; revisit if a spec ever grows to 100+ versions.
