# Epic 14 — Pre-Launch Spec-Fixes & Export-Hardening

> Three v0.1-deferred safety fixes to the apply/export pipeline + an export-time validation safety-net + a refuse-export modal UX. All small, all blocking-quality issues for any public-launch.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Foundation block" rows 1–3, [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Foundation-Block (Epic 10–13)" + §"Resolved 2026-05-03" Q3.

## Scope

### Re-validate-after-apply

- After every successful `applyFindingAction` (Epic 06's transaction), call `swagger-parser.validate()` on the new `currentJson` **before** committing the transaction. If validation fails:
  - **Rollback** the transaction (no new `SpecVersion`, finding stays `open`).
  - Return `{ error: { kind: 'validation_failed', issues: ParserIssue[] } }` to the client.
  - UI (Epic 06's `finding-card.tsx`): toast *"This patch produced an invalid spec — finding kept open. Other findings should still be reviewable."*
- Inside Apply-All (Epic 16's flow): same validation per-patch. On fail, current patch rolls back, prior patches in the sequence stay applied. Apply-All reports `{ applied: N, skipped: [...], halted_at_finding_id: <id>, halt_reason: 'validation_failed' }`.

### Cycle-marker → real-`$ref` roundtrip

- `cycleStripSpec` (existing v0.1 helper in `src/lib/analysis/`) currently writes `{"$ref": "#cyclic"}` placeholders for recursive references. Extend it to **also** write the original-ref-pointer as a vendor-extension: `{"$ref": "#cyclic", "x-apiq-original-ref": "#/components/schemas/Tree"}`.
- Add helper `restoreCycleRefs(json: unknown): unknown` in `src/lib/analysis/cycle-strip.ts` that:
  - traverses the JSON tree
  - for any object with both `$ref: '#cyclic'` AND `x-apiq-original-ref`: replace with `{"$ref": "<x-apiq-original-ref>"}`, drop the vendor-extension
- `exportSpecAction` (existing v0.1, Epic 08) calls `restoreCycleRefs(currentJson)` BEFORE serialization (JSON or YAML). The exported file then has correct OpenAPI `$ref`s, not apiq-internal cycle markers.
- Run an `npm test` regression to verify Stripe-spec roundtrip preserves all original `$ref`s.

### Export-time validation safety-net

- `exportSpecAction` runs `swagger-parser.validate(restoreCycleRefs(currentJson))` immediately before serialization, **always** (even though re-validate-after-apply should have caught issues earlier — defense in depth).
- If validation fails: return `{ error: { kind: 'export_validation_failed', issues: ParserIssue[] } }` instead of the file body.

### Export-validation-failed UX

- Client-side `onExport` handler (Epic 08's `spec-detail-header.tsx` + Epic 07's row-action menu): on `export_validation_failed` error, open a Modal with:
  - Heading: *"Export blocked — invalid spec"*
  - Body: list of validation issues (max 5 + "+N more if applicable"), max 80 chars per line.
  - Buttons: **Cancel** (secondary) + **Re-analyze the spec** (primary, violet) — re-analyze button calls `reanalyzeSpecAction` and closes the modal.
- No auto-fix in v1. The user must re-analyze + apply additional findings to make the spec valid.

### Tests

- Vitest:
  - `applyFindingAction` with a patch that produces invalid spec → rollback verified, finding still `open`, error returned with `kind: 'validation_failed'`.
  - Apply-All with one bad patch in sequence → halt-at-id behavior.
  - `restoreCycleRefs` roundtrips a fixture spec with self-referencing schema (Tree-style) — input has cycle-marker + vendor-ext, output has original `$ref`.
  - `exportSpecAction` on a spec with restored cycle-refs round-trips through swagger-parser-validate cleanly.
  - `exportSpecAction` on a deliberately-broken `currentJson` → returns `export_validation_failed` with parsed issues.
  - Modal renders and Re-analyze button calls `reanalyzeSpecAction`.

## Acceptance criteria

1. `applyFindingAction` re-validates `currentJson` after the patch transformation, rolls back on validation failure, returns `{ error: { kind: 'validation_failed', issues } }`.
2. Apply-All halts at the first validation failure; prior patches in the sequence stay applied; result includes `halted_at_finding_id` and `halt_reason: 'validation_failed'`.
3. `cycleStripSpec` writes both `$ref: '#cyclic'` AND `x-apiq-original-ref` for cyclic schemas. New unit test verifies on a Tree-style fixture.
4. `restoreCycleRefs` exists at `src/lib/analysis/cycle-strip.ts`, exported, and roundtrips cycle-marked JSON to OpenAPI-valid JSON. Unit test on Tree-style fixture passes.
5. `exportSpecAction` calls `restoreCycleRefs` then `swagger-parser.validate` before serialization. On validation fail returns `{ error: { kind: 'export_validation_failed', issues } }`.
6. Spec-Detail-Header (Epic 08) and Specs-list row-action Export (Epic 07) both surface a Modal on `export_validation_failed`. Modal shows max-5-issue summary + Cancel + Re-analyze buttons.
7. Re-analyze button in modal calls `reanalyzeSpecAction({ specId })` and closes the modal.
8. Vitest tests in §"Tests" all pass.
9. `restoreCycleRefs` is also called in any other path that serializes `currentJson` to a user-facing artefact: Markdown findings export (Epic 22), Public-Share-Page (Epic 19), CLI Export (Epic 21). No raw cycle-markers leak into any export surface.

## Out of scope

- Re-bundling `$ref`s on export (re-internalization of repeated schemas) — explicitly deferred per `brainstorming-launch.md` §"Resolved 2026-05-03" Q3. Export remains dereferenced JSON/YAML.
- Auto-fix on export-validation-failed (the user must Re-analyze).
- New finding-types or analysis-prompt changes.
- Multi-file spec re-bundling.
- Performance audit of `swagger-parser.validate` on big specs — the spike (Epic 09) addresses analysis-time performance; export-time validation runs once per export and is acceptable at any size.

## Domain terms

- **Re-validate-after-apply** — `swagger-parser.validate()` invocation as the last step of `applyFindingAction`'s transaction; failure rolls back.
- **Cycle marker** — the v0.1-introduced `{"$ref": "#cyclic"}` placeholder that replaces self-referencing schemas in `currentJson`. Not valid OpenAPI.
- **Vendor extension** — OpenAPI 3.x permits any `x-`-prefixed property; apiq uses `x-apiq-original-ref` to remember the original `$ref` target so cycle-markers can be restored on export.
- **Export-validation-failed** — error shape returned by `exportSpecAction` when the post-cycle-restore spec fails `swagger-parser.validate`. Triggers the refuse-export modal.

## Open questions

- Edge case: a finding's patch ADDs a new schema with a self-reference. The new `$ref` won't carry `x-apiq-original-ref` (the apply path doesn't emit cycle-markers — only `cycleStripSpec` does). Either: (a) `cycleStripSpec` re-runs at export-time to handle newly-introduced cycles, or (b) accept that user-applied cycles export as native `$ref` (which is fine and what we want anyway). Recommendation (b); document in §"Out of scope" if it lands awkwardly.
- Should the export-validation modal offer a "Download anyway" escape hatch for advanced users? Default: no — refuse-export is safer. Revisit only if support requests pile up.
- For the existing v0.1 `restoreCycleRefs` helper, are there already test fixtures with cyclic schemas in the codebase, or do we need to author one? Investigate during impl.
