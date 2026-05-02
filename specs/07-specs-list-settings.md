# Epic 07 — Specs List + Settings

> The two "workspace overview" surfaces. Specs List is the landing page after login. Settings is small in v0.1 (workspace name, display name, sign-out).
> Upstream design tokens: [`prd-decisions.md`](../prd-decisions.md) §"Components" (Tables, Status-Pills, Quality-Score-Badges), §"Color Palette" (status + severity colors), §"Layout" (Sidebar items, Topbar).

## Scope

### Specs List

- `(app)/specs/page.tsx` — index of all specs in the user's workspace.
- Layout: a shadcn `Table` (sticky header, row-hover `bg-accent/50`, no zebra stripes, compact density `py-2.5` per `prd-decisions.md` §"Components" Tables) with columns:
  - Name (link to `/specs/[specId]`)
  - Quality score (badge, colours and thresholds per `prd-decisions.md` §"Color Palette" Quality-Score-Badges: ≥80 emerald, 60–79 amber, <60 red; "—" if unanalysed)
  - Status pill (`pending | analyzing | completed | failed`)
  - Open / applied / rejected finding counts (small triplet)
  - Source URL (truncated, with full URL on hover)
  - Last analyzed (relative time, e.g. "3 hours ago")
  - Row actions menu: "Re-analyze", "Re-pull from URL" (hidden for `sourceType=sample` and authed-pull specs), "Delete" (with confirm dialog)
- Default sort: `lastAnalyzedAt desc`, with `pending` / `analyzing` specs floating to top.
- Header bar: "Add Spec" CTA → `/specs/new` (Epic 03). Workspace name on the left.
- Empty state (zero specs in workspace) — engineer-tauglich, kein Illustration-Hero per `prd-decisions.md` §"Konkrete Konsequenzen pro Epic" / §"Was wir NICHT übernehmen":
  - large heading "Add your first spec to get started"
  - primary button (violet, per `prd-decisions.md` §"Components" Buttons): "Add spec from URL" → `/specs/new`
  - secondary link: "Try with a sample spec" → calls `loadSampleSpecAction({ sampleId: 'openweathermap' })` (Epic 03), then redirects to `/specs/[newSpecId]`
- No tour banner, no modal, no illustration — Engineer-UX is self-service.
- Polling: while any spec in the list has `analysisStatus = 'pending' | 'analyzing'`, the list refetches every 5 s. Auto-stop when no spec is in those states.
- Cross-workspace isolation: the query is scoped via `workspaceId = session.workspaceId`.

### Settings

- `(app)/settings/page.tsx` — single-page settings.
- Sections:
  - **Workspace** — `name` (editable text input, `updateWorkspaceAction({ name })`)
  - **Profile** — `displayName` (editable text input, `updateUserAction({ displayName })`); `email` (read-only, shown for confirmation)
  - **Appearance** — Theme toggle (Light / Dark) via `next-themes`, Dark default, persisted per `prd-decisions.md` §"Theme". (May alternately live in the Topbar user menu — implementation choice.)
  - **Session** — "Sign out" button (calls `signOutAction` from Epic 02 — already implemented at `@/lib/session` per Epic 02 results)
- All form interactions return `{success}|{error}` (per CLAUDE.md conventions); validation errors render inline.
- **Form pattern** (per Epic 02 results): each section's form is a plain `<form action={...}>` with shadcn `Input`/`Label`/`Button`/`Card`, wrapped in a `'use client'` component using React 19's `useActionState` for pending state + structured error rendering. shadcn 4.6.0 radix-nova preset does NOT ship a `form` component — do not attempt `npx shadcn add form`.
- No password change (out of scope — see brainstorming E2).
- No account deletion (out of scope — see brainstorming F1).
- No BYOK / API key management (out of scope — see brainstorming B7).

### Shared

- Both screens use the `(app)/layout.tsx` sidebar (Epic 01) with two nav items: "Specs" → `/specs`, "Settings" → `/settings`. The layout is already wrapped in `<TooltipProvider>` (Epic 02) — Specs List row-action menus + AlertDialog tooltips work without further wrapper setup.
- **Layout update**: `(app)/layout.tsx` currently hardcodes the sidebar footer to `"Workspace name • user@example.com"` (Epic 01 placeholder, left as-is by Epic 02). Epic 07 must replace this with real values: convert the layout to an async server component, call `getRequiredSession()`, fetch the workspace name (`prisma.workspace.findUnique`), and render `{workspace.name} • {session.email}`. AC #10 ("reflects immediately in the sidebar footer") requires this layout edit.
- Sidebar footer: workspace name + user email (small, muted).
- **Library install**: `npx shadcn@latest add alert-dialog` for the "Delete spec?" confirm dialog (per Open Question §2 / row action menu). Not currently installed.
- Tests (Vitest + React Testing Library):
  - Specs list renders rows correctly, sorts by `lastAnalyzedAt desc`
  - Empty state renders both CTAs and "Try with a sample" creates a spec
  - Polling refetches while any spec is `pending` / `analyzing`
  - Cross-workspace query returns zero rows
  - `updateWorkspaceAction` / `updateUserAction` validation (non-empty names)

## Acceptance criteria

1. `/specs` is the post-login landing page (login redirect target from Epic 02 and middleware).
2. Specs list renders the columns above for every spec in the user's workspace, sorted by `lastAnalyzedAt desc` with pending/analyzing on top.
3. Quality score badge colours and thresholds match `prd-decisions.md` §"Color Palette" Quality-Score-Badges (≥80 emerald, 60–79 amber, <60 red); unanalysed specs show "—".
4. Status pill renders for each of `pending | analyzing | completed | failed` with colours and spinner per `prd-decisions.md` §"Components" Status-Pills (pending/analyzing → blue + spinner-icon, completed → emerald, failed → red).
5. While any visible spec has `analysisStatus = pending | analyzing`, the list refetches every 5 s and auto-stops when none remain.
6. Row action menu offers "Re-analyze" (always), "Re-pull from URL" (only for `sourceType=url` non-authed pulls), "Delete" (always, with a "Delete spec?" confirm dialog).
7. Empty state CTAs work: "Add spec from URL" navigates to `/specs/new`; "Try with a sample spec" creates an OpenWeatherMap-sample spec and redirects to its detail page.
8. Cross-workspace isolation: a spec from another workspace never appears (test by seeding two workspaces).
9. `/settings` renders Workspace + Profile + Session sections.
10. Editing workspace name persists via `updateWorkspaceAction` and reflects immediately in the sidebar footer.
11. Editing display name persists via `updateUserAction`; email field is rendered as read-only.
12. Sign-out clears session and redirects to `/login`.
13. Validation: empty workspace name or empty display name returns inline `{error: 'name_required'}` and the row does not save.
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
