# Epic 08 — Export + Polish

> The final v0.1 epic: spec export (JSON/YAML), polish-pass on loading states / error boundaries / empty states across all screens, and the mobile fallback banner.
> Upstream design tokens: [`prd-decisions.md`](../prd-decisions.md) §"Components" (Toasts, Skeletons, Cards), §"Layout" (mobile fallback breakpoint), §"Color Palette" (toast severity colours).

## Scope

### Export

- Server action `exportSpecAction({ specId, format: 'json' | 'yaml' })`:
  - `getRequiredSession()` workspace check
  - load `Spec.currentJson`, `Spec.name`, current `SpecVersion.versionNumber`
  - if `format = 'json'`: serialise `currentJson` with 2-space indent
  - if `format = 'yaml'`: convert via `yaml.stringify(currentJson)` (the `yaml` package from Epic 03)
  - return `{ filename, contentType, body }` where `filename = '<slug(spec.name)>-v<versionNumber>.<ext>'`
- Trigger via a button group on Spec Detail (Epic 05): "Export JSON" + "Export YAML". Default-highlighted button = `Spec.sourceFormat`.
- Client-side: receive the body, create a Blob, trigger a download via an anchor element with `download` attribute. No server-side file storage.
- Slug helper: lowercase, spaces → `-`, strip non-`[a-z0-9-]`, collapse repeated `-`, trim leading/trailing `-`. Empty result → `'spec'`.

### Polish

- **Loading states across all screens**: every screen using server data renders a skeleton (shadcn `Skeleton`) during the initial fetch instead of a flash of empty layout. Affected: Specs list, Spec Detail, Settings.
- **Error boundaries**: each route group (`(app)`, `(auth)`) has an `error.tsx` that renders a friendly error card with "Try again" + "Go home" buttons. Server-side errors caught by Next.js are surfaced via these boundaries.
- **`not-found.tsx`** at the root and per-route-group: friendly 404 with a link back to `/specs` (or `/login` if unauthenticated).
- **Empty states** (already partially covered by Epic 05 / 07; this epic ensures consistency):
  - Specs list: covered by Epic 07
  - Spec Detail: zero findings / filter mismatch covered by Epic 05
  - Settings: not applicable
  - Versions drawer (Epic 06): if only the initial version exists, show "No applies yet."
- **Mobile fallback banner**: a top-of-page banner on screens narrower than 1024 px ("apiq is best on desktop — some features may not render correctly"). Dismissible per session (sessionStorage). The app still renders below the banner.
- **Toast system**: shadcn `Toaster` mounted in `(app)/layout.tsx`, top-right, success / error / info variants per `prd-decisions.md` §"Components" Toasts. Epic 08 ships the toast infrastructure (`Toaster` mount + `showToast({kind, message})` helper); per-action toasts (Apply / Reject / Undo from Epic 06; Re-pull from Epic 03; Re-analyze from Epic 04) are emitted by their respective epics using this helper.
- **Favicon + meta**: a minimal SVG favicon, `<title>` and `<meta description>` set per route via Next.js metadata API.
- **README pass**: update the project root `README.md` to include "Quick start" (env vars + first signup + first spec).

### Rate-limit polish

- Standardise the rate-limit error response shape across all server actions to `{ kind: 'rate_limited', retryAt: ISO8601 }`. Add a top-level toast/banner in `(app)/layout.tsx` that detects this shape from the most recent server-action response and renders a single message ("Daily/hourly limit reached — try again at <time>"). Existing per-action messaging stays.

### Tests

- Vitest:
  - `exportSpecAction` JSON happy path (round-trips through JSON.parse correctly)
  - `exportSpecAction` YAML happy path (round-trips through YAML parse)
  - filename slug helper edge cases (empty, all-special-chars, collisions)
  - cross-workspace `exportSpecAction` returns 404
- Browser smoke check (manual, documented in Epic 08 results doc):
  - Export downloads a file with the expected name
  - Mobile-fallback banner appears at <1024 px and dismisses
  - 404 page renders for an unknown route

## Acceptance criteria

1. Spec Detail shows two export buttons: "Export JSON" and "Export YAML". The button matching `Spec.sourceFormat` renders as primary (violet filled per `prd-decisions.md` §"Components" Buttons); the other renders as secondary (ghost). Per `prd-decisions.md` §"Components" Buttons, the two MUST NOT both be primary.
2. Clicking "Export JSON" downloads `<slug(spec.name)>-v<n>.json` with the dereferenced `currentJson` (2-space indent).
3. Clicking "Export YAML" downloads `<slug(spec.name)>-v<n>.yaml` with the YAML-stringified `currentJson`.
4. Round-trip: parsing the downloaded JSON produces a structure deep-equal to `Spec.currentJson`. Same for YAML.
5. Filename slug: spaces → `-`, lowercase, special chars stripped. "My Spec!" → `my-spec-v1.json`.
6. Cross-workspace export returns 404.
7. All `(app)` screens render shadcn `Skeleton` placeholders on initial load (matching the layout's row/card shapes; no spinner-only fallback) — verified by manual inspection + a smoke test that asserts skeleton presence in the initial HTML for `/specs`.
8. Each route group has an `error.tsx` that renders an error card per `prd-decisions.md` §"Components" Cards (border, rounded-lg, no coloured header), with the error message and "Try again" (primary, violet) + "Go home" (secondary, ghost) buttons. Triggering an error in dev surfaces it.
9. Each route group has a `not-found.tsx` rendering a card per `prd-decisions.md` §"Components" Cards with no illustration (per §"Was wir NICHT übernehmen") and a link back to `/specs` (or `/login` if unauthenticated). Visiting `/specs/nonexistent-id` renders the 404 page.
10. Versions drawer empty state ("No applies yet.") renders for a freshly pulled spec.
11. Mobile fallback banner appears on viewports <1024 px, rendered as a muted (zinc) info bar per `prd-decisions.md` §"Color Palette" muted, with a lucide-react `X` close icon (per §"Icons"). Dismissible per session via sessionStorage; remains dismissed on reload within the session.
12. Toast infrastructure is functional: a stub action wired into a smoke-test page emits a success toast that renders top-right with the emerald colour token (per `prd-decisions.md` §"Components" Toasts and §"Color Palette"). Per-action toasts (e.g. "Patch applied" from Epic 06) consume this infrastructure.
13. Standardised rate-limit toast appears in any rate-limited action.
14. Favicon, `<title>`, `<meta description>` are set per route.
15. README "Quick start" section exists and is accurate.
16. Vitest export tests pass.

## Out of scope

- Re-bundling `$ref`s on export — v0.2 (export is always dereferenced, see brainstorming G2).
- Specific-version export (export an arbitrary `SpecVersion`, not just current) — v0.2.
- Bulk export (download all specs as a ZIP) — v0.2.
- Diff export (changes between two SpecVersions as a patch file) — v0.2.
- Mobile-responsive UI (the banner is the v0.1 acknowledgement that we don't support mobile layouts).
- i18n — Englisch only in v0.1 (see brainstorming I4).
- Formal a11y audit — best-effort via shadcn defaults only.
- Analytics / telemetry beyond `LLMCall` (Epic 04) — v0.2.
- CI/CD pipeline (GitHub Actions, preview deploys) — v0.2.
- Production deployment runbook — v0.2 (the Quick start in README is enough for v0.1).
- Performance profiling / bundle-size audit — v0.2 unless an obvious regression appears.
- Custom error illustrations / branding polish — v0.2.

## Domain terms

- **Export** — a server-action-driven download of `Spec.currentJson` as JSON or YAML. No server-side file storage; the response body is the file body.
- **Filename slug** — derived from `Spec.name` via the slug helper. Suffixed with `-v<versionNumber>.<ext>`.
- **Skeleton** — shadcn `Skeleton` placeholder for initial-load states.
- **Error boundary** — Next.js `error.tsx` per route group; surfaces uncaught server errors with a friendly retry UI.
- **Mobile fallback banner** — a session-dismissible banner on small viewports. Does not block functionality; warns the user.
- **Toast** — shadcn `Toast` for transient success/error confirmation. Used by Apply / Reject / Undo / Re-pull / Re-analyze / rate-limit feedback.
- **Standardised rate-limit response** — `{ kind: 'rate_limited', retryAt: ISO8601 }`. Detected by the layout-level toast handler.

## Open questions

- (resolved) YAML library: the `yaml` package from Epic 03 — same dependency, symmetric parse/stringify.
- File-download mechanism: pure client-side `URL.createObjectURL` + `<a download>` is the simplest and works on all v0.1 supported browsers (latest 2 of Chrome/Firefox/Safari/Edge). Confirm during implementation.
- Should the export endpoint also be available as a GET route (e.g. `/api/specs/[specId]/export.json`) so users can `curl` it? Recommendation: no, v0.1 keeps it as a server action only — `curl`-friendly export is v0.2.
- (resolved) Mobile fallback breakpoint: <1024 px per `prd-decisions.md` §"Layout" ("Kein Mobile-Layout. Mobile fallback banner (Epic 08) bei Viewport <1024 px.").
- (resolved) Toasts: shadcn `Toaster` top-right (default position), Success / Error / Info variants via colour tokens per `prd-decisions.md` §"Components" Toasts.
- Should the README include a section on running the Phase 0 spike? Recommendation: yes, a short pointer to `specs/research-spike.md` and `scripts/spike/run-prompt.ts`.
