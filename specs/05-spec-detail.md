# Epic 05 — Spec Detail Screen (read-only)

> The screen that answers "What's wrong with this spec?". Lists endpoints and findings (with narration, rationale, patch summary, diff preview). Apply / reject / undo flows live in Epic 06 — this epic ships the UI scaffolding for them as disabled buttons.
> Upstream design tokens: [`prd-decisions.md`](../prd-decisions.md) §"Components" (Cards, Severity-Badges, Status-Pills, Diff-Viewer), §"Color Palette" (semantic colors for severity), §"Typography" (monospace for endpoint paths and JSON).

## Scope

- `(app)/specs/[specId]/page.tsx` — Spec Detail screen with `getRequiredSession()` workspace-scoping.
  - Header: spec name, source URL (with re-pull button — wired in Epic 03 / 06), quality-score badge, analysis status pill, last-analyzed timestamp, "Re-analyze" button (wired in Epic 04).
  - Two-column layout: left pane = endpoint list (collapsible by tag), right pane = findings list.
  - **Loading states** for `analysisStatus`:
    - `pending` / `analyzing` → centered spinner with "Analyzing… (typically 30-90 s)" text. Client polls the spec row every 3 s and refreshes when status changes.
    - `failed` → error card with `analysisError` and a "Retry analysis" button (server action from Epic 04).
    - `completed` → render findings.
- Endpoint list (left pane):
  - tree by tag → endpoints (`METHOD path` rows)
  - clicking an endpoint scrolls/highlights its findings in the right pane (anchor-based)
  - shows a small badge per endpoint with the count of open findings, coloured by max severity
- Findings list (right pane):
  - default sort: severity desc → category asc → endpoint-path asc
  - filter bar above the list (state persisted in URL query string per `specs/ind-epic-review.md` Q5 — reload, share-link, and browser-back all preserve the filter):
    - severity multi-select (`critical | high | medium | low`) → `?severity=critical,high`
    - category multi-select (`clarity | design | risk`) → `?category=design`
    - status toggle (default: `open` only; toggle to also show `applied`, `rejected`, `stale`, `outdated`) → `?status=open,applied`
    - endpoint-path free-text search → `?search=/orders`
    - URL is updated via Next.js `useRouter().replace()` (no history pollution); on first load filters are read from the URL query and applied as initial state
  - each finding card uses the compact card density (`p-4`) per `prd-decisions.md` §"Components" Cards and shows:
    - title (headline)
    - severity badge (colour-coded) + category badge
    - "N endpoints affected" with expandable list of `METHOD path` rows
    - narration (engineering-language explanation)
    - rationale (why it matters, principle reference)
    - patch summary (1-line description of the change)
    - collapsible "Show diff" → side-by-side text diff of the affected JSON sub-tree (before/after) using `react-diff-viewer-continued`
    - collapsible "Show JSON Patch ops" → raw `op`/`path`/`value` table
    - **Apply / Reject buttons** rendered but **disabled with tooltip "Implemented in Epic 06"** — Epic 06 wires them up
- Empty states:
  - `analysisStatus = completed` AND zero findings → "No findings — your spec looks clean. Re-analyze to refresh."
  - filter produces zero results → "No findings match your filters."
- `Spec`-not-found / cross-workspace access → 404 (server-side check via `getRequiredSession()` workspace match).
- Responsive: respects the 1280×800 minimum viewport (Epic 08 adds the mobile fallback banner).
- Tests (Vitest + React Testing Library):
  - renders findings sorted correctly
  - filter interactions narrow the list
  - status toggle reveals applied/rejected/stale/outdated
  - cross-workspace access returns 404
  - polling logic (mocked timers) refetches the spec while `analysisStatus = analyzing`

## Acceptance criteria

1. `/specs/[specId]` for a valid spec in the user's workspace renders the header with name, quality-score badge (colour thresholds per `prd-decisions.md` §"Color Palette" — ≥80 emerald, 60–79 amber, <60 red), status pill (colours per `prd-decisions.md` §"Components" Status-Pills mapping), source URL, last-analyzed timestamp.
2. While `analysisStatus = analyzing`, the right pane shows a spinner and the client polls every 3 s; when status flips to `completed`, the findings render without a manual refresh.
3. Findings render in the default sort: severity desc → category asc → endpoint-path asc.
4. Each finding card shows title, severity badge (colour per `prd-decisions.md` §"Color Palette" semantic mapping: critical→red, high→orange, medium→amber, low→blue), category badge, "N endpoints affected" (with `affectedEndpoints[]` expanded), narration, rationale, patch summary.
5. "Show diff" expands to a side-by-side `react-diff-viewer-continued` diff of the affected JSON sub-tree (computed by applying `patchOps` to the relevant slice of `Spec.currentJson`), themed per `prd-decisions.md` §"Color Palette" Diff-Viewer (green-500/15 additions, red-500/15 deletions), monospace, with line numbers.
6. "Show JSON Patch ops" expands to a table of `op` / `path` / `value` rows, with `path` and `value` cells rendered in monospace (JetBrains Mono per `prd-decisions.md` §"Typography").
7. Apply / Reject buttons are rendered, disabled, with tooltip "Implemented in Epic 06".
8. Severity, category, and status filters narrow the list. Default status filter is `open`. **Filter state is persisted in the URL query string** (e.g. `?severity=critical,high&status=open&search=/orders`); reload preserves the filter; share-link with that URL applies the same filter for the recipient.
9. Endpoint-path search narrows by substring match against any of the finding's `affectedEndpoints[].path`. The search term is also persisted in the URL query (`?search=`).
10. Endpoint list (left pane) groups endpoints by `tags[0]` (or "untagged"), is collapsible per group, shows per-endpoint open-finding counts (badge coloured by max severity per `prd-decisions.md` §"Color Palette"), and renders `METHOD path` rows in monospace (JetBrains Mono).
11. Clicking an endpoint scrolls the right pane to the first matching finding card and applies a temporary `ring-2 ring-violet-500` outline (~1.5 s) per the violet accent colour in `prd-decisions.md` §"Color Palette".
12. Spec belonging to another workspace returns 404 (verified by server-side workspace check).
13. `analysisStatus = failed` renders an error card with the `analysisError` message and a primary "Retry analysis" button (violet per `prd-decisions.md` §"Components" Buttons); clicking it triggers `reanalyzeSpecAction` from Epic 04.
14. Zero findings on a completed analysis shows the "No findings" empty state.
15. Filters producing zero matches show the "No findings match" empty state.
16. Vitest tests above pass.

## Out of scope

- Apply / Reject / Undo functionality — Epic 06 (this epic stops at the disabled buttons).
- Patch-conflict detection (`stale` status flip on apply) — Epic 06.
- SpecVersion history drawer / version switcher — Epic 06.
- Re-pull button wiring — Epic 03 (this epic only renders the button).
- Re-analyze button wiring — Epic 04 (this epic only renders the button).
- Specs list (the index of all specs) — Epic 07.
- Settings page — Epic 07.
- Export — Epic 08.
- Manual editing of spec JSON in-browser — v0.2.
- Per-finding comments / discussion — v0.2 (team features).
- Pagination / virtual-scroll for findings — v0.2 (out of scope for the 20-80-finding range expected in v0.1).
- Visual polish beyond shadcn defaults (custom illustrations for empty states, etc.) — Epic 08.

## Domain terms

- **Spec Detail screen** — the per-spec view at `/specs/[specId]`. The user's primary workplace for inspecting findings and (in Epic 06) applying patches.
- **Endpoint list (left pane)** — a tag-grouped tree of `(method, path)` pairs derived from `Spec.currentJson.paths`. Acts as a navigation aid into the findings.
- **Finding card** — the unit of display in the findings list. One card per Finding row.
- **Affected endpoints expansion** — when a finding has `scope = 'spec'`, no endpoint list is shown; for `scope = 'endpoint'`, the `affectedEndpoints[]` array is rendered as a collapsible list of `METHOD path` rows.
- **Diff sub-tree** — the smallest JSON sub-tree of `Spec.currentJson` that contains all `patchOps[].path` ancestors. Used as the "before" side of the diff; the "after" side is the same sub-tree with `patchOps` applied (via `fast-json-patch.applyPatch` to a deep clone).
- **Status filter default** — only `open` findings are shown by default. `applied`, `rejected`, `stale`, `outdated` are hidden behind a toggle.
- **Polling** — the client refetches `Spec.analysisStatus` every 3 s while it is `pending` or `analyzing`. Auto-stops on `completed` or `failed`.

## Open questions

- (resolved) Diff library: `react-diff-viewer-continued`, side-by-side, monospace, line numbers on, custom theme using the GitHub-style colour tokens (green-500/15 additions, red-500/15 deletions, thin coloured left border) per `prd-decisions.md` §"Components" Diff-Viewer and §"Color Palette" Diff-Viewer.
- Endpoint-list grouping: by `tags[0]` is fine for most specs but some specs use multiple tags per endpoint or no tags at all. Recommendation: group by `tags[0]` when present, else "untagged"; do not duplicate endpoints into multiple groups.
- (resolved) Highlight uses the violet accent colour from `prd-decisions.md` §"Color Palette" — temporary `ring-2 ring-violet-500` outline applied to the target finding card on scroll.
- (resolved per `specs/ind-epic-review.md` Q5) Filter state lives in the URL query string for reload-safety and share-link support.
- Polling vs SSE: polling is simpler in v0.1 (see Epic 04 brainstorming I2). If Vercel function logs show high cold-start latency, revisit in Epic 04.
