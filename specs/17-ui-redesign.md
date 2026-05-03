# Epic 17 — UI Redesign

> Surgical UI overhaul of the authenticated app: sidebar restructure with three sections, Cmd+K command palette, Spec-Detail three-pane layout (Endpoints / Findings / Preview), Quality-Score-Hero, density pass, empty-states polish.
> **Order note:** Per `brainstorming-launch.md` Q2 = (A), this epic ships **before** Epic 18 (Live Preview) so Live Preview can plug into the finished three-pane layout without rework.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "UI Redesign block", [`prd-decisions.md`](../prd-decisions.md), [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"UI Redesign (Epic 22)".

## Scope

### Sidebar restructure

- `(app)/layout.tsx` Sidebar (existing v0.1 structure) reorganized into three labeled sections + footer:
  - **WORKSPACE** — `Specs`, `Settings`, `API Keys` (API Keys is a new sub-route stub here; full implementation is Epic 21).
  - **TOOLS** — `Try a sample` (deeplinks to `/try?sample=openweathermap`).
  - **RESOURCES** — `Documentation` (external `/docs` or `apiq.dev/docs`), `MCP Setup` (`/mcp`), `CLI` (`/cli`), `Pricing` (`/pricing`), `Contact` (`/contact`). Routes themselves owned by Epic 26 (Operational Hygiene) and Epic 27 (Marketing); this epic stubs the navigation entries.
  - **Footer** — User-Avatar with email next to it, Theme-Toggle (existing v0.1), Sign-Out.
- Section labels render in `text-xs uppercase tracking-wider muted-foreground` per `prd-decisions.md` density conventions.
- Collapsible mini-variant (icon-only) preserved from v0.1; section labels collapse to dividers in mini mode.

### Cmd+K command palette

- Add `cmdk` library (~6 KB): `npm install cmdk`.
- New component `<CommandPalette />` mounted at `(app)/layout.tsx` root level, opens on `Cmd+K` (macOS) / `Ctrl+K` (Win/Linux) / `Esc` to close.
- Sections inside palette:
  - **Navigate:** Specs (`/specs`), Settings (`/settings`), API Keys (`/settings/api-keys`).
  - **Spec actions** (rendered only when route matches `/specs/[id]`): Apply All Critical, Apply All, Re-analyze, Export YAML, Export JSON, Export Markdown findings (Epic 22), Generate share link (Epic 19), Generate badge (Epic 22).
  - **Search:** input filters by `Spec.name` (fuzzy via simple includes-match in v1; `fuse.js` if needed v1.1).
  - **Help:** View keyboard shortcuts (placeholder modal listing the 3 shortcuts for v1: `Cmd+K`, `g s` go-to-specs, `Esc` close palette), Read documentation (deeplink).
- Spec-actions wired to the same handlers as the on-screen buttons; reuse hooks not re-implementations.

### Spec-Detail three-pane layout

- Replace current Spec-Detail single-pane layout in `src/app/(app)/specs/[specId]/spec-detail-view.tsx` with a three-pane resizable layout (`react-resizable-panels` library, ~5 KB):
  - **Left (20% default):** Endpoints list — paths grouped by tag. Monospace per `prd-decisions.md`. Existing v0.1 endpoint-filter promotes here.
  - **Middle (50% default):** Findings list with severity-color badges + filter pills. Existing finding-card components reused.
  - **Right (30% default):** Preview pane — empty state in this epic (*"Live preview coming soon"*); Epic 18 fills it with Stoplight Elements + Prism.
- Right pane collapsible (default open); collapse-state persisted in `localStorage['apiq.preview-pane-collapsed']`.
- Auto-collapse right pane below 1280 px viewport-width (use `matchMedia`).
- Existing v0.1 mobile-banner unchanged (<1024 px shows banner above panes).
- Quality-Score-Hero (see below) sits ABOVE all three panes as a header strip.

### Quality-Score-Hero

- New component `<QualityScoreHero spec={spec} />` at `src/components/quality-score-hero.tsx`:
  - Big SVG score-ring (96 px diameter) — pure-SVG `<circle>` with `stroke-dasharray` color-banded (red <60, amber 60–79, emerald ≥80) per `prd-decisions.md`.
  - Big score number to the right of the ring (`text-4xl font-bold tabular-nums`).
  - Severity breakdown pills below the score: `3 critical · 5 high · 4 medium · 2 low` (each in its severity-color).
  - "Last analyzed N ago" muted line.
  - Animation hook: `useScoreReveal({ score, hasRevealedKey })` — triggers count-up on first render after `analysisStatus` flips to `'completed'`, persists `hasRevealedScore` flag in component state to avoid re-trigger on re-mount. Per `brainstorming-launch.md` §"Magic Moment #1": CSS-transitions + `requestAnimationFrame` for count-up. **No framer-motion**.

### Density pass

- Apply the explicit density-changes per `brainstorming-launch.md` §"UI Redesign":
  - Sidebar items: `h-9` → `h-8`.
  - Body text default: `text-base` → `text-sm`.
  - Card-Padding: `p-6` → `p-4` for SECONDARY cards (e.g. Findings-cards in list); primary content cards stay `p-6`.
  - Specs-list table rows: `py-3.5` → `py-2.5`.
  - Findings-Card height target: ~200 → ~160 px (driven by tighter padding + line-heights).
  - Topbar (56 px), Auth forms, Modals: UNCHANGED.

### Empty-states polish

- Empty states across `(app)`:
  - Specs list: existing v0.1 empty state, density-aware refresh + add "Try a sample →" link to `/try`.
  - Spec-detail with zero findings (post Apply-All): emerald success card *"All findings resolved. Score: {n}."*.
  - Endpoints filtered to zero results: muted line *"No endpoints match this filter."* in left pane.
  - Findings filtered to zero results: muted line *"No findings match these filters."* in middle pane.
  - Versions drawer empty: existing v0.1 *"No applies yet."*.
- All empty states: NO illustrations, NO hero copy. Per `prd-decisions.md` §"Was wir NICHT übernehmen".

### Tests

- Vitest:
  - `<CommandPalette />` opens on `Cmd+K`; closes on `Esc`.
  - Spec-actions section appears only on `/specs/[id]` routes (route-aware mounting).
  - Search filters by name correctly.
  - `<QualityScoreHero>` renders score-ring + breakdown.
  - Score-reveal animation triggers once on `'analyzing'` → `'completed'` transition; does NOT trigger on re-mount of an already-completed spec.
  - Three-pane layout collapses right pane on viewport <1280 px; persists state in localStorage.
- Browser smoke check: navigate via Cmd+K, resize-and-collapse panes, see score-reveal on a freshly-analyzed spec.

## Acceptance criteria

1. Sidebar renders three labeled sections + footer per Scope. Section labels: `text-xs uppercase tracking-wider`. Mini-variant collapses gracefully.
2. `cmdk` installed. `<CommandPalette />` mounted at `(app)/layout.tsx`. Opens on `Cmd+K`, closes on `Esc`.
3. Command Palette has Navigate / Spec-actions (route-aware) / Search / Help sections per Scope.
4. Spec-Detail three-pane layout replaces single-pane: left 20% endpoints / middle 50% findings / right 30% preview-stub. `react-resizable-panels` installed.
5. Right pane collapsible; state persisted in localStorage; auto-collapse <1280 px.
6. `<QualityScoreHero>` renders above the three panes with SVG ring + score number + severity breakdown + "Last analyzed N ago".
7. Score-reveal animation runs once per `analyzing → completed` flip, count-up over 600 ms.
8. No framer-motion in package.json (verify via `cat package.json | grep framer` returns nothing).
9. Density-pass applied per Scope §"Density pass" — verified by visual diff against pre-redesign screenshots.
10. All empty-state variants render per Scope §"Empty-states polish".
11. All Vitest tests in §"Tests" pass.
12. Browser-smoke check documented in `specs/17-ui-redesign-results.md` with before/after screenshots of sidebar + spec-detail.
13. No regressions in Apply-All buttons (Epic 16) — they relocate cleanly into the three-pane header.

## Out of scope

- Live Preview pane content (Stoplight Elements + Prism mock) — Epic 18.
- Marketing surfaces / landing-page redesign — Epic 27.
- Quality-score-formula changes — score is computed by existing v0.1 logic; this epic only changes presentation.
- Severity-color-system changes — already defined in `prd-decisions.md`.
- Mobile-responsive layout — banner remains the v1 acknowledgement (pre-launch PRD locked this).
- Keyboard shortcuts beyond `Cmd+K`, `g s`, `Esc` — single-letter combos like `j/k` finding-nav are deferred to v1.1.
- Re-design of Auth forms (Login / Signup) — out of scope; existing v0.1 unchanged.
- API-Keys settings sub-route content — Epic 21 owns the management UI; this epic only adds the sidebar entry + stub page.

## Domain terms

- **Three-pane layout** — Spec-Detail's left/middle/right structure: Endpoints / Findings / Preview.
- **Score-reveal** — count-up + ring color-fill animation that triggers once on transition `analyzing → completed`.
- **`hasRevealedScore` flag** — component-state-only; not persisted to DB. Resets per session per spec.
- **Density pass** — the spacing/sizing reduction listed in Scope; engineer-tool optimization.
- **Command Palette** — Cmd+K-triggered modal dialog with sections for navigation / actions / search / help.

## Open questions

- Sidebar section labels: `WORKSPACE` is workspace-level config but houses `Specs` (spec-level data). Naming clear enough? Recommendation: yes; "WORKSPACE" reads as "this workspace's contents", not "workspace settings". Revisit if users misclick.
- Whether the right Preview pane should be HIDDEN (not just collapsed) when its content is unavailable (e.g., Spec >2 MB per Epic 18). Recommendation: hide entirely for over-cap specs; collapse for "user closed it".
- `react-resizable-panels` vs `allotment` vs custom split-pane: `react-resizable-panels` has best React-19 + RSC story per current ecosystem (verify at impl). Lock during impl.
- Whether the Quality-Score-Hero should also render on the Specs-list per-row (mini ring instead of just a number badge): out of scope here (existing v0.1 number-only badge preserved); revisit in v1.1 if score-rings on list look right.
