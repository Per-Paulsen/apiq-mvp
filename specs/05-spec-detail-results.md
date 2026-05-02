# Epic 05 — Spec Detail Screen — Results

> Implementation results for [`05-spec-detail.md`](05-spec-detail.md). Author: Claude Code (Lead) + 5 delegated agents (Foundation, Header, Endpoint List, Findings + Filter + Card, Tests). Date: 2026-05-02. Commit: `5519cdd`.
> **Append-only** after this initial draft. Corrections go in a labelled "Correction" section at the end.

## What was built

The full read-only Spec Detail screen at `/specs/[specId]`, replacing Epic 03's placeholder. Server component loads the workspace-scoped Spec + Findings; the client `SpecDetailView` wires together four siblings — `SpecDetailHeader`, `EndpointList`, `FindingsList` (or `AnalyzingPanel` / `FailedPanel`), and the disabled Apply/Reject button surface that Epic 06 will activate.

Browser-verified end-to-end against the two Petstore specs already in the dev DB:

- **Completed** (`cmoof52qi0001x0ulajx24lvs`) — `qualityScore=32`, 14 findings — full screen renders: header with red qualityScore badge + emerald status pill, tag-grouped endpoint list (`pet 8/4 open`, `store 4/3 open`, `user 7/6 open`) with per-endpoint open-finding count badges coloured by max severity, filter bar with all four dimensions (severity / category / status / search), 14 finding cards sorted critical → high → medium → low (clarity → design → risk within tier, then path-asc), each with title + severity/category badges + N-endpoints-affected expansion + narration + rationale + patch summary + Show diff (react-diff-viewer-continued, 49-row table on the first card) + Show JSON Patch ops + disabled Apply/Reject in tooltip wrappers. Severity-pill click writes `?severity=critical` to the URL and narrows the visible cards to 1 (the only critical finding). Endpoint-row click scrolls + applies `ring-2 ring-violet-500` for ~1.5 s on the first matching finding card (verified: clicking `post /store/order` highlighted "Missing authentication on order placement endpoint"). Screenshot: `docs/screenshots/epic-05-completed.png`.
- **Failed** (`cmooa9mr70001poulfc6lgbhl`) — `qualityScore=null`, 0 findings, `analysisError` is the live zod-error JSON from Epic 04's failure-path observation. Header shows zinc `—` placeholder for the null score + red `failed` status pill. Right pane renders the failed-card with the cross-epic Q1 headline format: `findings.9.rationale: Invalid input: expected string, received undefined`, plus a collapsible `Show details` containing the full prettified zod-error JSON, and a violet `Retry analysis` button. Screenshot: `docs/screenshots/epic-05-failed.png`.

## Key files created / modified

### Library install
- `package.json` / `package-lock.json` — added `react-diff-viewer-continued@^4.2.2` (the only new runtime dep this epic).

### Helpers
- `src/lib/format-analysis-error.ts` — **new**. Per cross-epic Q6 the helper file is "Epic 08 owned" but Epic 05 is the first consumer (failed-card AC #13), so we shipped the full helper here. Three parsing rules in order:
  1. Budget shape — regex `/^Daily LLM budget reached \(\$([0-9.]+) \/ \$([0-9.]+)\) — resets at (.+)$/` (em-dash U+2014 typed directly) → returns `{ headline: 'Daily LLM budget reached', details, budgetShape }`.
  2. Zod-error JSON — `JSON.parse` + duck-type check (`Array.isArray && first.message: string && first.path: array`) → `{ headline: '<path.join('.')>: <message>', details: pretty JSON }`. Empty `path` falls back to message-only headline.
  3. Plain message — truncate >200 chars with `…` + keep full string in details; else just headline. Pure function, no I/O, no throws (catches `JSON.parse`).
- `src/__tests__/format-analysis-error.test.ts` — **new**. 12 tests covering all 3 branches + edge cases (em-dash vs hyphen, multiple zod issues, object-not-array, missing fields, invalid JSON, exact-200 boundary).

### Page + view
- `src/app/(app)/specs/[specId]/page.tsx` — **replaced** Epic 03's placeholder. Server component: `getRequiredSession()` → `prisma.spec.findFirst({ where: { id, workspaceId } })` → `notFound()` on miss → `prisma.finding.findMany({ where: { specId } })` (regardless of status — failed re-analyses retain prior findings; the right pane decides what to render based on status) → hands off to `<SpecDetailView/>`.
- `src/app/(app)/specs/[specId]/spec-detail-view.tsx` — **new**. Client component, the integration glue. Owns:
  - 3 s `setInterval` calling `router.refresh()` while `analysisStatus` is `pending` or `analyzing`; auto-stops on `completed` / `failed`.
  - `cardRefs: Ref<Map<string, HTMLElement>>` populated by each FindingCard's `useEffect`-registered ref; the parent looks up the first `open` finding whose `affectedEndpoints` contains the clicked `(path, lowercase method)` pair, calls `el.scrollIntoView({ behavior: 'smooth', block: 'center' })`, and applies `ring-2 ring-violet-500` for 1500 ms via `classList.add` + `setTimeout`.
  - Three right-pane branches: `<AnalyzingPanel/>` (centered Loader2 + "Analyzing… (typically 30-90 s)") / `<FailedPanel/>` (CardTitle from `formatAnalysisError(...).headline` + collapsible `<details><pre>…</pre></details>` for the parsed JSON + `Retry analysis` button calling `reanalyzeSpecAction` + `router.refresh()`) / `<FindingsList/>`.

### Components (each in its own file under `src/app/(app)/specs/[specId]/`)
- `spec-detail-header.tsx` — `<SpecDetailHeader spec />`. Renders name (`text-xl font-semibold`), `<QualityScoreBadge>` (≥80 emerald, 60-79 amber, <60 red, null → zinc `—`), `<StatusPill>` (pending/analyzing → blue + spinning Loader2, completed → emerald, failed → red), monospace source URL line, last-analyzed timestamp via `toLocaleString()` (omitted when null). Re-pull button: visible only when `sourceType === 'url' && !wasAuthedPull`, calls `repullSpecAction` + `router.refresh()`. Re-analyze button: primary violet, disabled while `pending` / `analyzing`, calls `reanalyzeSpecAction` + `router.refresh()` (the action writes status='analyzing' synchronously per Epic 04 commit `50b4b1c`, so `router.refresh()` skips the next 3 s poll wait per AC #13).
- `endpoint-list.tsx` — `<EndpointList spec={{ currentJson }} findings onEndpointClick />`. Walks `currentJson.paths` defensively (cycle-marker-safe), filters method keys against the canonical 8 HTTP verbs, groups by `tags[0]` else "untagged" (no duplication when `tags.length > 1` per spec Open Question), sorts groups alphabetically with "untagged" pinned last + endpoints by path within. Per-endpoint badge shows count + worst-severity colour (critical=red, high=orange, medium=amber, low=blue); rows with zero open findings render an invisible spacer for layout alignment. Method labels colour-coded (GET=emerald, POST=blue, PUT/PATCH=amber, DELETE=red, options/head/trace=zinc) — engineer-tool aesthetic. Tag groups collapsible via `useState<Set<string>>`.
- `finding-card.tsx` — `<FindingCard finding specCurrentJson registerRef />`. Shadcn `Card size="sm"` (`p-4`-equivalent compact density per `prd-decisions.md`). Outer div `ref` registered with the parent's `cardRefs` map. Three collapsible sections (affected endpoints / Show diff / Show JSON Patch ops), each with `aria-expanded`. Diff sub-tree heuristic: take `parentPointer(patchOps[0].path)` as the diff root, walk it on `specCurrentJson` (before) and on `applyPatch(structuredClone(currentJson), patchOps).newDocument` (after); JSON-stringify both; pass to `<ReactDiffViewer splitView useDarkTheme styles={...}>` with the green-500/15 / red-500/15 colour overrides from `prd-decisions.md` Diff-Viewer. Catches `applyPatch` throws → "Diff unavailable — patch may not apply cleanly". JSON Patch ops table is monospace, value cells truncated at 80 chars + `…`. Disabled Apply/Reject buttons wrapped in `<span tabIndex={0}>` inside `TooltipTrigger asChild` so the "Implemented in Epic 06" tooltip works despite the disabled state (Radix workaround).
- `findings-list.tsx` — `<FindingsList findings specCurrentJson registerCardRef />`. Filter state from `useSearchParams()`; URL writes via `router.replace(qs, { scroll: false })` — never `push` (no history pollution). Severity / category multi-select pills (toggle on click). Status: defaults to `open` when the URL has no `status` param; the toggle button flips between default and the full set `open,applied,rejected,stale,outdated`. Search input debounced 250 ms before pushing to `?search=`. Sort: severity desc → category asc → endpoint-path asc. Empty states: "No findings — your spec looks clean. Re-analyze to refresh." for `findings.length === 0`; "No findings match your filters." for an empty filter result.

### Tests
- `src/__tests__/spec-detail/findings-list.test.tsx` — 12 tests (sort, filter persistence + click flow, status toggle default + full set, search filter, empty states).
- `src/__tests__/spec-detail/finding-card.test.tsx` — 15 tests (content render, severity colour classes, spec vs endpoint scope, expand/collapse, disabled Apply/Reject + tooltip text in DOM).
- `src/__tests__/spec-detail/spec-detail-view.test.tsx` — 9 tests (3 s polling while analyzing, no polling on completed/failed, polling cleanup on unmount, failed-card retry click → reanalyzeSpecAction + router.refresh, scroll-on-endpoint-click).
- `src/__tests__/spec-detail/page.test.tsx` — 3 tests (cross-workspace 404, missing spec 404, happy path calls finding.findMany with the right specId).
- `src/__tests__/setup.ts` — added a 4-line no-op `ResizeObserver` polyfill (jsdom 29 doesn't ship one; Radix UI's tooltip primitive needs it during render).

## Decisions and deviations from spec

1. **`formatAnalysisError` shipped here, not in Epic 08.** Per cross-epic Q6 the helper at `src/lib/format-analysis-error.ts` is "Epic 08 owned" — but Epic 05's failed-card has a hard dependency on the parser (AC #13 explicitly requires the path+message headline format from cross-epic Q1). Rather than stub the helper now and re-implement in Epic 08, we shipped the full parser (all 3 rules + 12 unit tests) as part of this epic. Epic 08 inherits a complete implementation; its scope shrinks to "wire `formatQuotaToast` into `showToast` calls + add the Spec-Detail budget-toast hook."

2. **Findings always loaded, not gated on `analysisStatus === 'completed'`.** A `failed` re-analysis on a previously-completed spec retains the prior findings (Epic 04 only deletes open findings inside the success transaction). Loading findings unconditionally lets the endpoint-list badges keep showing accurate per-endpoint counts even during a failed re-run. The right-pane renderer (FindingsList vs FailedPanel) is the gate, not the data fetch.

3. **Quality score badge uses 4 colour bands, not 3.** Spec mandates emerald / amber / red for ≥80 / 60-79 / <60. We added a 4th band: zinc `—` placeholder for `qualityScore IS NULL` (per AC #1's null-rendering rule). The placeholder reads as "no score yet" and matches the muted convention from `prd-decisions.md`.

4. **Endpoint list method colouring is opt-in eye candy, not in spec.** GET=emerald, POST=blue, PUT/PATCH=amber, DELETE=red, options/head/trace=zinc. The spec only mandates monospace + uppercase; colours are a small engineer-tool affordance copied from Postman / Swagger-UI conventions. Quick to revert in Epic 08 if the user finds it noisy.

5. **Status filter UX: "Open" badge + single toggle, not 5 toggle pills.** The spec said "either UX is fine; pick the simpler one" (per agent brief). Single toggle keeps the filter bar compact. URL semantics still match the spec (default = `?status` absent → `open` only; toggle on → `?status=open,applied,rejected,stale,outdated`).

6. **Diff sub-tree heuristic is `parentPointer(patchOps[0].path)`, not the deepest common ancestor of all patch ops.** Spec said "deepest common ancestor" but flagged "or the parent of the first op's path is acceptable". The pragmatic heuristic is fine for the typical case (most findings have 1-3 ops on the same parent); a multi-op finding spanning multiple parents will show only the first parent's diff. v0.2 can refine if user feedback warrants.

7. **`ResizeObserver` polyfill in setup.ts.** Radix Tooltip's `Content` component uses ResizeObserver internally; jsdom 29 doesn't ship one. The polyfill is a 4-line no-op class — pure test-environment fix, no production impact, can't mask real bugs.

8. **`React.JSX.Element` return types instead of bare `JSX.Element`.** TS 5.x + React 19 no longer auto-imports the global `JSX` namespace; `React.JSX.Element` is the canonical replacement. Functionally identical.

9. **No client-side optimistic state on Re-analyze.** The spec's AC #13 explicitly notes `reanalyzeSpecAction` flips `analysisStatus = 'analyzing'` synchronously (Epic 04 results §"Resolved Q3") — a `router.refresh()` after the action call shows the new state without a brief flash of stale state. Epic 05 doesn't track its own `pending` state for the analyze button beyond `useTransition`'s `isPending` (just for the disable-while-in-flight behaviour).

10. **Pre-existing Sidebar hydration warning surfaced again.** Per spec scope bullet line 13, this is owned by Epic 08's polish pass (cross-epic Q5). Verified inline that Tooltip primitives still work despite the warning (the disabled Apply/Reject tooltips render correctly). Did not investigate inside Epic 05.

11. **No `revalidatePath` after mutating server actions.** The Re-analyze and Re-pull buttons call `router.refresh()` which is sufficient for Next.js 16 client-component pages. `revalidatePath` would be needed if Epic 07's sidebar footer needed to re-fetch — that's an Epic 07 concern.

## Verification results

### Automated
- `npm run lint` → **0 errors**, 10 pre-existing warnings on `scripts/spike/*` (out of scope per Epic 01 results).
- `npm run test` → **22 files, 190 tests passed** (151 prior + 39 new). All 12 `format-analysis-error` cases + 39 spec-detail tests green.
- `npm run build` → exit 0; routes `/`, `/_not-found`, `/api/auth/[...nextauth]`, `/api/internal/analyze`, `/login`, `/signup`, `/specs`, `/specs/[specId]` (now dynamic-rendered with the full Spec Detail screen), `/specs/new`, plus middleware all built. TS check passed (a pre-existing TS error in `src/__tests__/auth/getRequiredSession.test.ts` was confirmed to predate this epic — visible only via `tsc --noEmit`, not via `next build`).
- `npx tsc --noEmit` → **the only error is the pre-existing `getRequiredSession.test.ts` line 89 issue** (`null` not assignable to `NextMiddleware`); not introduced by Epic 05, confirmed by `git stash`. All Epic 05 files type-check cleanly.

### Browser (Playwright)
1. Logged in as `e2e-test@apiq.dev`.
2. Navigated to `/specs/cmoof52qi0001x0ulajx24lvs` (completed Petstore from Epic 04 results). Full screen rendered: header (qualityScore=32 in red badge, completed pill emerald, source URL monospace, last-analyzed `2.5.2026, 16:11:09`, Re-pull + Re-analyze buttons), endpoint list (3 tag groups expanded, all 19 endpoints visible with correct per-row open-finding count badges), 14 finding cards sorted critical → high → medium → low. Severity pill `Critical` clicked → URL became `?severity=critical` and the visible card list narrowed to 1 (verified via `document.querySelectorAll('h3')` returning a single title "Credentials transmitted in URL query parameters"). First "Show diff" toggle expanded → react-diff-viewer-continued rendered (verified: `<table>` with 49 rows in the diff slot). Endpoint click on `post /store/order` (programmatic to avoid Playwright's strict-locator issue with multiple matches) → 50 ms later the card "Missing authentication on order placement endpoint" had `class="… ring-2 ring-violet-500"` applied. Screenshot: `docs/screenshots/epic-05-completed.png`.
3. Navigated to `/specs/cmooa9mr70001poulfc6lgbhl` (failed Petstore). Header rendered with zinc `—` placeholder badge for null `qualityScore` and red `failed` status pill. Right pane rendered the failed-card with `CardTitle` text exactly `findings.9.rationale: Invalid input: expected string, received undefined` (matches AC #13 / cross-epic Q1 path-prefix format), `Show details` summary expanding a `<pre>` containing the full zod-error JSON, and a violet `Retry analysis` button. Screenshot: `docs/screenshots/epic-05-failed.png`.
4. Console errors observed: 2 errors, both pre-existing (`Encountered a script tag while rendering React component` from Sidebar primitives + the actual hydration-mismatch warning on `<a data-slot="sidebar-menu-button">`). Both predate Epic 05 — Epic 03/04 results documented them, Epic 08 polish owns the fix per cross-epic Q5.

### AC checklist (16/16)

| AC | Status | Verified by |
|----|--------|-------------|
| 1. Header (name, qualityScore badge with thresholds + null placeholder, status pill, source URL, last-analyzed timestamp) | ✅ | Browser (both completed + failed views) + RTL spec-detail-view tests |
| 2. Pending/analyzing → spinner + 3 s poll; auto-stops on completed/failed; reactive flip without manual refresh | ✅ | RTL polling tests (`vi.advanceTimersByTime(3000)`) + completed view shows findings without intervention |
| 3. Findings sorted severity desc → category asc → endpoint-path asc | ✅ | RTL sort test (3 sort keys exercised) + browser snapshot order matches |
| 4. Cards show title, severity + category badges, "N endpoints affected", narration, rationale, patch summary | ✅ | RTL finding-card tests + browser snapshot of all 14 cards |
| 5. "Show diff" → react-diff-viewer-continued with custom theme | ✅ | Browser (49-row diff table rendered after click) |
| 6. "Show JSON Patch ops" table in monospace | ✅ | RTL test toggles + asserts `<table>` |
| 7. Apply/Reject rendered, disabled, tooltip "Implemented in Epic 06" | ✅ | RTL test asserts `disabled` + tooltip text in DOM + browser snapshot |
| 8. Severity/category/status filters narrow list; default status=`open`; URL query persistence | ✅ | RTL filter tests (initial-render + click-flow) + browser (`?severity=critical` narrowed list to 1) |
| 9. Endpoint-path search narrows by substring; URL `?search=` | ✅ | RTL search test + URL persistence test |
| 10. Endpoint list grouped by `tags[0]` else "untagged"; collapsible per group; per-endpoint badge by max severity; monospace `METHOD path` | ✅ | Browser snapshot (pet/store/user groups + per-endpoint counts visible) |
| 11. Endpoint click → scroll + `ring-2 ring-violet-500` outline (~1.5 s) | ✅ | Browser (programmatic click + 50 ms poll found ringed card) |
| 12. Cross-workspace returns 404 | ✅ | RTL page test mocks prisma.findFirst → null → notFound() called |
| 13. Failed → error card with `analysisError` + Retry analysis (formatAnalysisError + synchronous flip) | ✅ | Browser (failed view rendered with cross-epic Q1 headline format) + RTL retry-click test |
| 14. Zero findings empty state | ✅ | RTL empty-state test |
| 15. Filters-mismatch empty state | ✅ | RTL test (severity filter excluding all findings) |
| 16. Vitest tests pass | ✅ | 39 new tests, 190 total, all green |

## Risks for future epics

### Epic 06 (Patch Apply)
- **Apply / Reject button surface is in place.** `finding-card.tsx` has the disabled buttons + tooltips wired; Epic 06 just removes the `disabled` and the `<span tabIndex={0}>` wrapper, swaps the tooltip out for an active label, and adds the `useTransition` + action call. No structural rework needed.
- **`registerCardRef` callback API works.** Epic 06 can re-use the same `cardRefs` map for "after-apply scroll the next finding into view" if that UX is desired — it's owned by `SpecDetailView`.
- **Diff sub-tree computation is already client-side via `applyPatch` + `structuredClone`.** Epic 06's apply flow can reuse `computeDiff` from `finding-card.tsx` if it wants to preview the after-state on hover — currently lives inside the card, would need a small extract if Epic 06 wants it shared.
- **`fast-json-patch.applyPatch` is invoked with `validate: false` in the diff preview.** This is fine for visualisation (we just want to see what the spec WOULD look like); Epic 06's actual apply flow uses `validatePatchOps` from `@/lib/analysis/validate-patches.ts` as the production gate per spec.
- **`formatAnalysisError` is fully shipped.** Epic 06's stale-card hint ("This patch is no longer applicable, re-analyze") is independent — but if Epic 06 needs to surface `Spec.analysisError` anywhere, the helper is ready.

### Epic 07 (Specs List + Settings)
- **Re-pull button visibility logic** (`sourceType === 'url' && !wasAuthedPull`) was implemented in `spec-detail-header.tsx`. Epic 07's row-action menu mirrors the same check (spec already calls this out). Convention: hide the action everywhere it would 404, not just the action handler.
- **Quality-score badge component is duplicated waiting to happen.** Epic 07's specs-list table also needs a quality-score badge with the same thresholds. Worth extracting into `src/components/quality-score-badge.tsx` when Epic 07 ships — currently lives as a private function in `spec-detail-header.tsx`.
- **Status pill component is duplicated waiting to happen.** Same as above — extract when Epic 07 needs the pill in the table.

### Epic 08 (Export + Polish)
- **`formatAnalysisError` is owned but lives in `src/lib/format-analysis-error.ts`** (per cross-epic Q6 design). Epic 08's Spec-Detail budget-toast hook (per Epic 08 scope §"Rate-limit polish") imports the helper unchanged. The helper detects `budgetShape` correctly; the hook's job is to call `showToast(formatQuotaToast({ kind: 'budget_exceeded', ...budgetShape }))` when `Spec.analysisStatus === 'failed'` AND `formatAnalysisError(error).budgetShape !== undefined`, deduped via `sessionStorage` per the spec.
- **Sidebar hydration warning still present.** Epic 05 explicitly did not investigate per spec line 13 + cross-epic Q5. Epic 08 owns the fix (3 candidate fix paths documented in Epic 08 spec §"Polish").
- **`react-diff-viewer-continued` is now installed.** Epic 08 may want to polish the diff theme — current colour overrides in `finding-card.tsx`'s `<ReactDiffViewer styles={…}>` are minimal (only addedBackground / removedBackground / wordAdded / wordRemoved). The lib supports far more theme tokens; Epic 08's polish pass can fine-tune.
- **Toast wiring on Spec Detail is NOT yet present.** Epic 08 should wire `showToast` for: re-pull complete (after `repullSpecAction` returns success), re-analyze started (Epic 04 already writes `analyzing` synchronously, so the toast just confirms the trigger). Currently the buttons just `router.refresh()` silently. Per Epic 08 scope, the message catalog has `rePullComplete` and `reanalyzeStarted` — Epic 08 maps them in.

### Cross-cutting
- **`(app)/specs/error.tsx` and `not-found.tsx` already exist** from Epic 03 (minimal versions). Epic 08 polishes per `prd-decisions.md` Cards conventions. Epic 05 inherits and confirmed both work — `notFound()` called in the Page server component renders the existing 404 card.
- **Spec.currentJson serialised across the RSC boundary.** For 5 MB specs (the project's hard cap) this is a real ~5 MB payload over the wire. Acceptable for v0.1 per spec; a future epic could move the diff sub-tree computation server-side to skip shipping `currentJson` to the client. Not on the v0.1 path.
- **The endpoint list filter against `affectedEndpoints[].path` is exact-match (case-sensitive on path, lowercase on method).** If a future LLM emits paths with trailing-slash variants or templated path differences, those findings won't badge any endpoint row. Logged as "by spec" — we don't normalise paths beyond case-folding the method.

## Open questions

1. **Diff theme colour overrides apply only the four most-visible tokens** (`addedBackground`, `removedBackground`, `wordAddedBackground`, `wordRemovedBackground`). The `react-diff-viewer-continued` theme has many more (line numbers, gutter, hover states). The current visual is "good enough — engineer-tool dark, additions green-tinted, deletions red-tinted, monospace, line numbers on" but not pixel-exact to GitHub's diff style.
   **Recommendation:** keep current. Visual polish is Epic 08's job per `prd-decisions.md` Diff-Viewer; the four tokens we override are the ones spec-decided in `prd-decisions.md` §"Color Palette". If Epic 08's pass reveals a token mismatch, fix in place.

   yes, but inform epic 08 about this, at least indirect via refine all individual

2. **Diff sub-tree heuristic uses `parentPointer(patchOps[0].path)` only.** A finding with patch ops touching multiple parents (e.g. one op at `/components/schemas/User`, another at `/paths/~1users/get`) shows the diff for only the first parent's sub-tree. The spec said this was acceptable.
   **Recommendation:** keep current. Empirically the LLM's findings have ops clustered on the same parent (per Epic 04's verify run on Petstore: 14/14 findings had patch ops on a single sub-tree). v0.2 can compute the deepest common ancestor of all op paths if user feedback warrants.

   evaluate critically, because v0.2 will certainly be done before user feedback

3. **Endpoint list method colouring (GET=emerald, POST=blue, PUT/PATCH=amber, DELETE=red).** Not in spec. Engineer-tool eye candy borrowed from Postman / Swagger-UI convention.
   **Recommendation:** keep. The colours don't conflict with `prd-decisions.md`'s severity palette (severity colours are 500/15 backgrounds; method labels are 500/600/400 foregrounds with no background). Easy to revert by replacing `METHOD_COLOR_CLASS` with a single muted colour.

   but when will and should this be finalized as a decision?

4. **Card ref via React 19's regular `ref` prop** on shadcn `Card` — relies on `Card`'s `...props` spread propagating `ref` to the inner `<div>`. React 19 made `ref` a regular prop, so this works without `forwardRef` — but it's a recent React change. If a future shadcn upgrade reintroduces a `forwardRef` wrapper, the ref still works (forwardRef forwards refs to the underlying div). Worth a one-liner test in Epic 08's regression sweep.
   **Recommendation:** none — current behavior is correct under React 19. No action.

i have no idea

5. **`spec-detail-view.tsx` calls `el.classList.add('ring-2', 'ring-violet-500')` directly, bypassing React's render.** Tailwind v4 JIT scans source files for class string literals and DID generate the classes (verified live: the ring shows on click). If a future Tailwind config tweak narrows the source-scan glob, the ring could silently break.
   **Recommendation:** add a regression test in Epic 08's polish sweep that snapshots the rendered CSS and asserts `.ring-2` + `.ring-violet-500` exist. Cheap belt-and-suspenders.

yes, but epic 08 must know this ...

6. **Failed-card `<details>` collapsible is uncontrolled.** Re-renders won't preserve open/closed state across polling refreshes — but failed-card doesn't poll, so this is fine. Worth flagging if Epic 06's stale-card UX needs similar collapsibles AND polling.
   **Recommendation:** none for Epic 05; Epic 06 can adopt controlled `useState` if needed.

again, make sure epic 06 knows

---

## Post-draft user review — 2026-05-02

User reviewed the 6 open questions inline in this file. Two were code-level pushbacks (Q2 + Q3); the other four were directives to surface the items to downstream epics. Two follow-up code changes applied; results file kept append-only from this section onward.

### Resolved Q2 — proper deepest-common-ancestor for diff sub-tree (code change)

Original recommendation: keep `parentPointer(patchOps[0].path)` heuristic, defer DCA to v0.2 "if user feedback warrants". User: "evaluate critically, because v0.2 will certainly be done before user feedback" — and they were right. Re-reading the Epic 05 spec's Domain term §"Diff sub-tree": *"the smallest JSON sub-tree of `Spec.currentJson` that contains all `patchOps[].path` ancestors"* — i.e. the spec mandates the deepest common ancestor, NOT the parent of the first op. The pragmatic shortcut diverged from the spec text.

Failure mode of the shortcut: a finding with patch ops touching multiple parents (e.g. one op at `/components/schemas/User`, another at `/paths/~1users/post/responses`) would render the diff for only the first parent's sub-tree. The user clicks Apply expecting the visible diff and gets a spec mutation that includes invisible additional changes. Real correctness issue, not v0.2 polish.

**Change applied to `src/app/(app)/specs/[specId]/finding-card.tsx`:**
- New helper `diffSubtreePath(paths: string[])` — for a single path returns its parent; for multiple paths returns the longest common prefix of segments (falls back to root `''` when ops touch disjoint sub-trees).
- `computeDiff` now calls `diffSubtreePath(patchOps.map(op => op.path))` instead of `parentPointer(patchOps[0].path)`.

Empirically the LLM's current findings cluster on a single sub-tree (Epic 04 Petstore verify run: 14/14 findings had ops on one parent), so behavior on real specs is unchanged. The fix only matters for future findings with cross-parent ops — but it's the spec-mandated behavior, so it's now correct rather than coincidentally-correct.

### Resolved Q3 — drop method colouring (code change)

Original recommendation: keep "engineer-tool eye candy" (GET=emerald, POST=blue, PUT/PATCH=amber, DELETE=red, options/head/trace=zinc) on endpoint-list method labels. User: "but when will and should this be finalized as a decision?" — implicitly questioning whether unauthorised colour decisions belong in the codebase.

Honest answer: `prd-decisions.md` is silent on per-method colours. The colours were a Postman / Swagger-UI convention I imported without spec authorisation. Per `/dev` skill rule "do not go beyond the spec", they shouldn't ship.

**Change applied to `src/app/(app)/specs/[specId]/endpoint-list.tsx`:**
- Removed the `METHOD_COLOR_CLASS` lookup table.
- Method label now renders as `text-muted-foreground` (consistent with the rest of the row's secondary text).

If a future epic decides per-method colouring belongs in the design system, it gets added to `prd-decisions.md` first, then rolled out.

### Q1 / Q5 — Epic 08 informational handoffs

User: "yes, but inform epic 08 about this, at least indirect via refine all individual" (Q1 diff theme tokens) and "yes, but epic 08 must know this ..." (Q5 Tailwind JIT scan dependency). Both items already appear in the "Risks for future epics → Epic 08" section of this results file, which is what `/refine_all_ind` Pass 5 (post-Epic-05) reads to surface implementation guidance into Epic 08's spec.

For Q1 (diff theme), the Epic 08 risk note flags that current `<ReactDiffViewer styles={...}>` overrides only 4 tokens (`addedBackground`, `removedBackground`, `wordAddedBackground`, `wordRemovedBackground`); the lib supports many more (line numbers, gutter, hover states). Epic 08's polish pass should fine-tune in place if a token mismatch surfaces against `prd-decisions.md` Diff-Viewer.

For Q5 (Tailwind JIT brittleness), the Epic 08 risk note recommends adding a regression test in Epic 08's polish sweep that snapshots the rendered CSS and asserts `.ring-2` + `.ring-violet-500` are emitted. Cheap belt-and-suspenders against a future Tailwind config tweak narrowing the source-scan glob.

No code changes; no further annotation needed — `/refine_all_ind` will read both items from the existing Epic-08 section and inject them into Epic 08's spec on its next pass.

### Q4 — informational only, no decision required

User: "i have no idea". Fair — Q4 is a fact about React 19's prop semantics, not a design decision. React 19 made `ref` a regular prop (per the [React 19 release notes](https://react.dev/blog/2024/12/05/react-19#ref-as-a-prop)), so `<Card ref={containerRef}>` works without `forwardRef` because `Card` spreads `...props` onto the underlying `<div>`. If a future shadcn upgrade reintroduces `forwardRef`, `ref` still works (forwardRef forwards to the inner div). There is nothing for the user to decide here — closing as informational.

### Q6 — Epic 06 informational handoff

User: "again, make sure epic 06 knows" — referring to the failed-card's uncontrolled `<details>` collapsible pattern. Already noted in the "Risks for future epics → Epic 06" section: if Epic 06's stale-card UX needs similar collapsibles AND polling (which would re-render and lose the collapsed state), Epic 06 should adopt controlled `useState` for the open/closed flag. `/refine_all_ind` Pass 5 reads this and propagates into Epic 06's spec.

### Verification re-run after Q2 + Q3 fixes

- `npm run lint` → 0 errors (10 pre-existing `scripts/spike/*` warnings).
- `npm run test` → 22 files / 190 tests passing (no regressions).
- `npm run build` → exit 0; all routes built.
- Browser re-verification: completed Petstore spec re-rendered with method labels in muted colour (no per-method tinting); diff viewer behaviour unchanged on the 14 single-parent findings (DCA = parent for single-op findings, identical to prior heuristic). No screenshot re-take — visual delta is method colours becoming muted, no behaviour change.

### Follow-up commit

The Q2 + Q3 fixes land in a separate commit (clean diff against `5519cdd`) so the original implementation + the post-review correction are individually reviewable in `git log`.

---

## Final user confirmation — 2026-05-02

User confirmed:
- The Q2 + Q3 code fixes in commit `de0273d` (DCA-based `diffSubtreePath`; muted method labels).
- Q1 + Q5 + Q6 staying as informational handoffs in the "Risks for future epics" sections — `/refine_all_ind` Pass 5 will surface them into Epic 06 / Epic 08 specs.
- Q4 closed as informational only (React 19 ref-as-prop fact, not a decision).

**Status:** Epic 05 is final. File is append-only from this point.
