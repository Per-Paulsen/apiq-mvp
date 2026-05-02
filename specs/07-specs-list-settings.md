# Epic 07 — Specs List + Settings

> The two "workspace overview" surfaces. Specs List is the landing page after login. Settings is small in v0.1 (workspace name, display name, sign-out).
> Upstream design tokens: [`prd-decisions.md`](../prd-decisions.md) §"Components" (Tables, Status-Pills, Quality-Score-Badges), §"Color Palette" (status + severity colors), §"Layout" (Sidebar items, Topbar).

## Scope

### Specs List

- `(app)/specs/page.tsx` — index of all specs in the user's workspace.
- Layout: a shadcn `Table` (sticky header, row-hover `bg-accent/50`, no zebra stripes, compact density `py-2.5` per `prd-decisions.md` §"Components" Tables) with columns:
  - Name (link to `/specs/[specId]`)
  - Quality score (badge, colours and thresholds per `prd-decisions.md` §"Color Palette" Quality-Score-Badges: ≥80 emerald, 60–79 amber, <60 red; `—` if `qualityScore IS NULL`. After a `failed` re-analysis on a previously-completed spec, the prior numeric score is shown — `runAnalysis` only writes `qualityScore` inside its success transaction, so the field accurately reflects the last completed analysis; the `failed` status pill alongside is the truth-signal for "current state". Per cross-epic Q3.)
  - Status pill (`pending | analyzing | completed | failed`)
  - Open / applied / rejected finding counts (small triplet — these 3 statuses only; `stale` and `outdated` are transient states resolved by re-analyze and aren't surfaced as actionable counts at the row level. The Spec Detail screen (Epic 05) surfaces them via the status filter when the user wants to see them. Per cross-epic Q4, 2026-05-02.)
  - Source URL (truncated, with full URL on hover)
  - Last analyzed (relative time, e.g. "3 hours ago")
  - Row actions menu: "Re-analyze" (calls `reanalyzeSpecAction({ specId })`, then calls `showToast(TOASTS.reanalyzeStarted)` BEFORE `router.refresh()` — same pattern as Epic 05 header Re-analyze / Epic 06 stale-card Re-analyze. Toast wiring infrastructure is owned by Epic 08; Epic 07 row-action menu imports `TOASTS` and `showToast` from `@/lib/toasts`.), "Re-pull from URL" (hidden when `Spec.sourceType !== 'url'` OR `Spec.wasAuthedPull === true` — the `wasAuthedPull` boolean is set by Epic 03's `addSpecFromUrlAction` based on whether an Authorization header was supplied; Epic 03's `repullSpecAction` rejects mismatches at the action level, this UI hides for parity), "Delete" (with confirm dialog)
- Default sort: `lastAnalyzedAt desc`, with `pending` / `analyzing` specs floating to top.
- Header bar: "Add Spec" CTA → `/specs/new` (Epic 03). Workspace name on the left.
- Empty state (zero specs in workspace) — engineer-tauglich, kein Illustration-Hero per `prd-decisions.md` §"Konkrete Konsequenzen pro Epic" / §"Was wir NICHT übernehmen":
  - large heading "Add your first spec to get started"
  - primary button (violet, per `prd-decisions.md` §"Components" Buttons): "Add spec from URL" → `/specs/new`
  - secondary link: "Try with a sample spec" → calls `loadSampleSpecAction({ sampleId: 'openweathermap' })` (Epic 03), then redirects to `/specs/[newSpecId]`
- No tour banner, no modal, no illustration — Engineer-UX is self-service.
- Polling: while any spec in the list has `analysisStatus = 'pending' | 'analyzing'`, the list refetches every 5 s. Auto-stop when no spec is in those states. (Cadence is intentionally slower than Epic 05's per-spec 3 s polling — list-view tolerates more lag and polling cost scales linearly with row count. Per cross-epic Q4.)
- Cross-workspace isolation: the query is scoped via `workspaceId = session.workspaceId`.

### Settings

- `(app)/settings/page.tsx` — single-page settings.
- Sections:
  - **Workspace** — `name` (editable text input, `updateWorkspaceAction({ name })`). After successful update, the action MUST call `revalidatePath('/', 'layout')` from `next/cache` so the sidebar footer (rendered in `(app)/layout.tsx` per the Layout-update bullet below) re-renders with the new name on next navigation — required by AC #10 ("reflects immediately in the sidebar footer").
  - **Profile** — `name` (editable text input, `updateUserAction({ name })`, label "Name"; persists to `User.name` — the existing Auth.js standard nullable field); `email` (read-only, shown for confirmation). Currently the sidebar footer renders `session.email` (immutable in v0.1, no name field there), so no `revalidatePath` is required here; future epics that surface the user's name in shared layouts should add the call. (Per cross-epic Q3, 2026-05-02: reuse `User.name` instead of adding a `User.displayName` column. The Auth.js field is already in the schema, nullable, and "Name" is a fine label for the v0.1 single-user-per-workspace UX. Future migration to a separate `displayName` field is non-destructive — add column + copy data — if v0.2 needs the distinction.)
  - **Appearance** — Theme toggle (Light / Dark) via `next-themes`, Dark default, persisted per `prd-decisions.md` §"Theme". (May alternately live in the Topbar user menu — implementation choice.)
  - **Session** — "Sign out" button (calls `signOutAction` from Epic 02 — already implemented at `@/lib/session` per Epic 02 results)
- All form interactions return `{success}|{error}` (per CLAUDE.md conventions); validation errors render inline.
- **Form pattern** (per Epic 02 + 03 results): each section's form is a plain `<form action={...}>` with shadcn `Input`/`Label`/`Button`/`Card`, wrapped in a `'use client'` component using React 19's `useActionState` for pending state + structured error rendering. shadcn 4.6.0 radix-nova preset does NOT ship a `form` component — do not attempt `npx shadcn add form`. **Action signature convention (per Epic 03)**: the underlying server actions take typed object args (e.g. `updateWorkspaceAction({ name }: { name: string })`, `updateUserAction({ name }: { name: string })`) for testability + programmatic reuse. A thin `'use server'` adapter file colocated with each form (e.g. `(app)/settings/workspace-form-action.ts` exporting `updateWorkspaceFormAction(prevState, formData)`) converts `useActionState`'s `(prevState, FormData)` signature into the typed object call. The form imports the adapter; the underlying action stays object-typed. Tests assert against the object-typed action directly (cleaner than constructing FormData per case). Reference: Epic 03's `src/app/(app)/specs/new/form-action.ts`.
- No password change (out of scope — see brainstorming E2).
- No account deletion (out of scope — see brainstorming F1).
- No BYOK / API key management (out of scope — see brainstorming B7).

### Shared

- Both screens use the `(app)/layout.tsx` sidebar (Epic 01) with two nav items: "Specs" → `/specs`, "Settings" → `/settings`. The layout is already wrapped in `<TooltipProvider>` (Epic 02) — Specs List row-action menus + AlertDialog tooltips work without further wrapper setup. The pre-existing Sidebar hydration warning (Epic 03 / Epic 04 browser verification) is owned by Epic 08 polish (per cross-epic Q5) — Epic 07 doesn't investigate it; if a regression surfaces during Epic 07 implementation, fix inline.
- **Layout update**: `(app)/layout.tsx` currently hardcodes the sidebar footer to `"Workspace name • user@example.com"` (Epic 01 placeholder, left as-is by Epic 02). Epic 07 must replace this with real values: convert the layout to an async server component, call `getRequiredSession()`, fetch the workspace name (`prisma.workspace.findUnique`), and render `{workspace.name} • {session.email}`. AC #10 ("reflects immediately in the sidebar footer") requires this layout edit.
- Sidebar footer: workspace name + user email (small, muted).
- **Library install**: `npx shadcn@latest add alert-dialog` for the "Delete spec?" confirm dialog (per Open Question §2 / row action menu). Not currently installed.
- **Extract `QualityScoreBadge` and `StatusPill` into shared components** (per Epic 05 results §"Risks for future epics → Epic 07"). Both currently live as private functions inside `src/app/(app)/specs/[specId]/spec-detail-header.tsx` (Epic 05). Epic 07's specs-list table needs the same badges per row (AC #3, #4); without extraction, both components get duplicated. Move them to `src/components/quality-score-badge.tsx` and `src/components/status-pill.tsx` (or a single `src/components/spec-badges.tsx` if preferred), update `spec-detail-header.tsx` to import from the new location, and import the same components in the specs-list row renderer. The `QualityScoreBadge` must keep all 4 colour bands (≥80 emerald, 60–79 amber, <60 red, null → zinc `—`); the `StatusPill` must keep the spinner-icon for `pending`/`analyzing`. No prop-shape change vs Epic 05.
- Tests (Vitest + React Testing Library):
  - Specs list renders rows correctly, sorts by `lastAnalyzedAt desc`
  - Empty state renders both CTAs and "Try with a sample" creates a spec
  - Polling refetches while any spec is `pending` / `analyzing`
  - Cross-workspace query returns zero rows
  - `updateWorkspaceAction` / `updateUserAction` validation (non-empty names)

## Acceptance criteria

1. `/specs` is the post-login landing page (login redirect target from Epic 02 and middleware).
2. Specs list renders the columns above for every spec in the user's workspace, sorted by `lastAnalyzedAt desc` with pending/analyzing on top.
3. Quality score badge colours and thresholds match `prd-decisions.md` §"Color Palette" Quality-Score-Badges (≥80 emerald, 60–79 amber, <60 red); unanalysed specs (`qualityScore IS NULL`) show "—" in zinc, mirroring Epic 05's null-score placeholder (`spec-detail-header.tsx`'s `qualityScoreClasses` 4th band: `border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300`).
4. Status pill renders for each of `pending | analyzing | completed | failed` with colours and spinner per `prd-decisions.md` §"Components" Status-Pills (pending/analyzing → blue + spinner-icon, completed → emerald, failed → red).
5. While any visible spec has `analysisStatus = pending | analyzing`, the list refetches every 5 s and auto-stops when none remain.
6. Row action menu offers "Re-analyze" (always), "Re-pull from URL" (only when `Spec.sourceType === 'url' AND Spec.wasAuthedPull === false`), "Delete" (always, with a "Delete spec?" confirm dialog). The "Re-analyze" item is disabled with tooltip "Already analyzing" when `Spec.analysisStatus === 'analyzing'` (per resolved Open Question §3).
7. Empty state CTAs work: "Add spec from URL" navigates to `/specs/new`; "Try with a sample spec" creates an OpenWeatherMap-sample spec and redirects to its detail page.
8. Cross-workspace isolation: a spec from another workspace never appears (test by seeding two workspaces).
9. `/settings` renders Workspace + Profile + Session sections.
10. Editing workspace name persists via `updateWorkspaceAction` and reflects immediately in the sidebar footer.
11. Editing the user's name persists via `updateUserAction({ name })` (writes `User.name`); email field is rendered as read-only.
12. Sign-out clears session and redirects to `/login`.
13. Validation: empty workspace name or empty user name returns inline `{error: 'name_required'}` and the row does not save.
14. Vitest tests above pass.

## Out of scope

- Password change (no mail provider — Epic 02 / brainstorming E2).
- Account deletion (manual via Lead — brainstorming F1).
- E-mail change.
- BYOK OpenRouter key management (brainstorming B7 — v0.2).
- Workspace switcher / multi-workspace UI (Epic 02 — v0.2).
- Workspace member invitations / roles (v0.2).
- Per-spec sharing with other users (v0.2).
- Specs list filters / search (v0.1 expects ≤20 specs per workspace; revisit if needed).
- Bulk actions on specs (delete-many, re-analyze-many) — v0.2.
- Specs list pagination — v0.1 expects ≤20 specs.
- Tour, onboarding modals, in-app changelog — v0.2+.

## Domain terms

- **Specs list** — the index page at `/specs`. The landing page after login.
- **Status pill** — the small coloured badge on each row reflecting `Spec.analysisStatus`. Visual tokens (size, shape, per-status colour, spinner-icon for analyzing) are defined in `prd-decisions.md` §"Components" Status-Pills.
- **Quality-score badge** — coloured badge showing the deterministic quality score from Epic 04. "—" when unanalysed.
- **Empty state CTA** — "Add spec from URL" + "Try with a sample spec". The sample CTA invokes a server-side path that copies a static file from `openapi-examples/` into a new Spec with `sourceType = 'sample'`.
- **Sidebar footer** — small text at the bottom of the sidebar showing workspace name + user email; updates live when workspace name is edited.
- **Settings sections** — `Workspace`, `Profile`, `Session`. Each is a small card on the single Settings page.

## Open questions

- (resolved) Sample spec ID convention: `'openweathermap'` is the only sample exposed via the "Try with a sample" CTA in v0.1. Stripe (sliced) and dnd5eapi remain dev-fixtures only. PagerDuty is explicitly excluded from production-facing surfaces — Epic 00 results §"Cross-cutting" flag missing upstream LICENSE; "If apiq ever ships sample specs in production … avoid PagerDuty until license is clarified upstream."
- Confirm dialog component: shadcn `AlertDialog` is the canonical pattern. Confirm during implementation.
- "Re-analyze" from the list row uses the same `reanalyzeSpecAction` (Epic 04) as the Spec Detail button. Should it disable while `analysisStatus = analyzing`? Yes — the row action should be greyed out with a tooltip "Already analyzing".
- (resolved) Sidebar collapse/expand persisted in cookie (shadcn default), collapsible Mini-Variante (Icon-only, ~64 px) per `prd-decisions.md` §"Layout".
- Display-name uniqueness: not required (multiple users can share a display name). Confirm.
- (resolved per cross-epic Q3, 2026-05-02) `qualityScore` rendering after a `failed` re-analysis on a previously-completed spec: render the prior numeric score; the `failed` status pill alongside signals retry. Documented in scope + AC #3.
- (resolved per cross-epic Q4, 2026-05-02) Specs-list polling cadence stays 5 s (intentionally slower than Epic 05's per-spec 3 s). Inline rationale added to Scope §"Polling" + AC #5.
- (resolved per cross-epic Q5, 2026-05-02) Sidebar hydration warning investigation is owned by Epic 08 polish (it's a real fix, not a defer-by-default). Epic 07's "consider investigating" directive removed.
- (resolved per cross-epic Q3, 2026-05-02) Profile-name field: option (b) — reuse `User.name` (Auth.js standard nullable field), no migration. Profile field label is "Name", form action is `updateUserAction({ name })`. Future migration to a separate `displayName` column is non-destructive if v0.2 ever needs the distinction. Documented in Scope §"Settings" Profile bullet + AC #11 / #13.
- (resolved per cross-epic Q4, 2026-05-02) Finding-counts triplet: option (a) — show 3 statuses only (open / applied / rejected). `stale` and `outdated` are transient states resolved by re-analyze, not actionable counts for the user; Spec Detail's status filter surfaces them when needed. Documented in Scope §"Specs List" columns line.
