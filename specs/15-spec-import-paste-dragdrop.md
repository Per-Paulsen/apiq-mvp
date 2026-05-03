# Epic 15 — Spec Import — Paste & Drag-Drop

> Reusable spec-import surface (textarea paste + drag-drop file upload) usable on three pages: authenticated `/specs/new`, anonymous landing `/`, and anonymous `/try`. Auto-detects JSON vs YAML; reuses existing v0.1 validation pipeline.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Foundation block" row "Paste/Upload Spec Import", [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Foundation-Block".

## Scope

- Author a reusable React component `<SpecImportPanel mode="auth" | "anon" />` at `src/components/spec-import-panel.tsx`:
  - Textarea for pasted spec content (full-width, ~10 rows visible, monospace).
  - Drag-and-drop overlay covering the whole panel; drop a file → reads via `FileReader.readAsText` → fills the textarea.
  - File-picker fallback button ("or browse files…") opening native file dialog with `accept=".json,.yaml,.yml"`.
  - Submit button: *"Analyze spec"* (auth mode) or *"Try this spec"* (anon mode).
  - Inline validation messages below textarea (size > 5 MB, parse error, validation error).
- Auto-detect JSON vs YAML:
  - Heuristic: trim, then first non-whitespace char `{` or `[` → JSON, else YAML.
  - Try `JSON.parse` first if heuristic says JSON, else `yaml.parse`. On heuristic-detection-fail, try the other parser as fallback. Both fail → reject with parse error.
- File-extension handling:
  - Drop/upload accepts `.json`, `.yaml`, `.yml` by extension.
  - Mismatch (e.g. `.txt` with valid JSON content) → accept anyway with toast *"We detected JSON in this file."*.
  - Size limit: 5 MB (consistent with v0.1 URL-pull limit).
- Mode-prop wiring:
  - `mode="auth"` → on submit, calls existing `addSpecFromPasteAction({ name, content })` server action (NEW; mirrors the URL-pull action with paste-content-in-body). Redirects to `/specs/<id>` on success.
  - `mode="anon"` → on submit, calls `POST /api/anonymous-demo` with `{ content }`. Redirects to `/anon/<token>` on success. (Anon endpoint logic is Epic 19 territory; this epic only wires the front-end call.)
- Three integration points:
  - **Authenticated `/specs/new`** — `SpecImportPanel mode="auth"` replaces the existing paste-area-or-upload (existing v0.1 surface stays as-is; this epic refactors to use the reusable component). URL-pull tab remains alongside.
  - **Anonymous landing `/`** — Hero CTA renders `SpecImportPanel mode="anon"` next to a `SamplePicker` (Epic 27 owns SamplePicker; this epic stubs it).
  - **Anonymous `/try`** — same panel as landing, no hero. (Route itself is Epic 19.)
- Add `addSpecFromPasteAction({ name, content })` server action in `src/app/(app)/specs/new/actions.ts` (or wherever existing URL-pull-action lives), reusing the existing validation pipeline (parse → swagger-parser-validate → dereference → store).

### Tests

- Vitest:
  - JSON/YAML auto-detect heuristic on 4 fixture inputs (JSON-with-leading-whitespace, plain JSON, plain YAML, YAML-with-comments).
  - Drop file with `.txt` extension but JSON content → submits successfully, toast called.
  - Drop file >5 MB → rejection with size error.
  - `addSpecFromPasteAction` happy path (parses + stores + returns specId).
  - `addSpecFromPasteAction` with invalid YAML → returns `{ error: { kind: 'parse_failed', message } }`.
  - Component renders in both modes; submit button label differs.
- Browser smoke check: paste a Stripe spec into landing's panel; analysis kicks off.

## Acceptance criteria

1. `<SpecImportPanel>` exists at `src/components/spec-import-panel.tsx`, accepts `mode: "auth" | "anon"` prop, exports a default React component.
2. Textarea + drag-drop overlay + file-picker fallback all functional. Drop visual feedback (border-violet) on dragover.
3. Auto-detect heuristic and dual-parser-fallback handle all 4 fixture cases in tests.
4. File extension `.json | .yaml | .yml` filtered in `accept` attribute. Mismatch with valid content accepted (with toast). Size > 5 MB rejected with inline error.
5. `addSpecFromPasteAction` reuses the existing v0.1 validation/dereference pipeline (no duplicated logic). Returns same shape as v0.1 `addSpecFromUrlAction` (`{ specId } | { error: {...} }`).
6. Authenticated `/specs/new` page renders `SpecImportPanel mode="auth"` for paste-flow; existing URL-pull tab remains. No regressions in URL-pull flow.
7. Anonymous landing `/` and `/try` pages render `SpecImportPanel mode="anon"` (the routes themselves can be stubs — Epic 19 fills the anon backend; Epic 27 polishes the landing page).
8. Toasts wired via existing `TOASTS` catalog (extend with new entries: `TOASTS.specPasteSuccess`, `TOASTS.fileExtensionMismatch`).
9. All Vitest tests in §"Tests" pass.

## Out of scope

- Multi-file spec upload (zip with split `$ref`s) — explicitly deferred to v1.1 per PRD §5.
- The actual `/api/anonymous-demo` backend, `/anon/<token>` route, sign-up-carryover — Epic 19.
- Sample-picker UI on landing — Epic 27.
- Three-pane spec-detail layout — Epic 17.
- Re-pull / Re-analyze surfaces (existing v0.1 unchanged here).

## Domain terms

- **`SpecImportPanel`** — the reusable React component shipped by this epic; identical UI in auth and anon mode.
- **Auto-detect heuristic** — first-char-based JSON-vs-YAML guess; falls back to dual-parser attempt on failure.
- **Mode prop** — `auth | anon`; switches submit handler (server-action vs anon-API-route).

## Open questions

- Should `<SpecImportPanel>` accept additional props for placeholder text or hero-text customization, or should the surrounding page own that copy entirely? Recommendation: only the bare textarea + buttons live in the component; hero copy is page-level. Re-evaluate if marketing iterates often on the panel's CTA wording.
- Should we add server-side rate-limiting on `addSpecFromPasteAction` (per workspace, like Epic 03 URL-pull)? Recommendation: yes — same `IpActionLog` pattern, action-key `spec_paste`, limit 30/workspace/h. Documented as part of Epic 24 catalog (paste rate-limit), implemented inline here.
