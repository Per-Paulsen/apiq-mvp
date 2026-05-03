# Epic 18 — Live Preview — Stoplight Elements + Prism

> Magic Moment #3: Stoplight Elements renders the improved spec interactively in the right pane of the Spec-Detail three-pane layout (Epic 17). Try-It buttons hit a stateless Prism mock per spec via a Vercel Edge Function, with a 24h edge-cached `currentJson` lookup acting as the "ephemeral 24h cleanup".
> **Order:** ships AFTER Epic 17. Right-pane shell exists; this epic fills it.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Foundation block" row "Stoplight Elements + Prism Live Preview", §2 "Magic Moment #3", [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Live Preview (Epic 13)".

## Scope

### Stoplight Elements integration (right pane)

- `npm install @stoplight/elements` (latest stable in `8.x` range; pin in `package.json`).
- New client component `src/components/spec-preview-pane.tsx`:
  - `'use client'` (required — Stoplight Elements is a Web Component).
  - Imports `<elements-api>` via `next/dynamic({ ssr: false })`. Bundle size note: ~300 KB gzipped — acceptable as a feature-gated dynamic-import.
  - Receives `currentJson` (already-dereferenced + cycle-marker-restored via Epic 14's `restoreCycleRefs`) and `apiBase` (the Prism-mock URL — see below) as props.
  - Renders `<elements-api apiDescriptionDocument={JSON.stringify(currentJson)} layout="sidebar" router="hash" tryItDefaultServer={apiBase} />`.
  - Theme override for dark mode: CSS in `src/app/globals.css` under `[data-theme="dark"] .sl-elements-api { --color-canvas: ...; --color-text: ...; }` mapping our zinc + violet palette.
- Mounts inside the right pane shell from Epic 17. Pane width 30% default.
- Disabled-state: if `Spec.endpointCount > 1000` OR `byteLength(currentJson) > 2_000_000` (2 MB) → render a muted card *"Preview not available for specs above 2 MB. Export and try locally."* (cap-threshold final-tunable post-Epic 09 spike result).

### Prism mock as Vercel Edge Function

- New route handler `src/app/api/mock/[specId]/[...path]/route.ts`:
  - Runtime: `'edge'` (Vercel Edge).
  - Loads `Spec.currentJson` for `specId` (workspace-scoped if Epic 19's anon path triggers a public-share-mock; the request carries either an authed session OR a public-share-token in query for `/share/<token>` previews).
  - Cache headers: `'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600'` — Edge-cache acts as the "24h ephemeral cleanup".
  - Instantiates Prism in-process (`@stoplight/prism-http`) with the loaded spec.
  - Routes the request: `GET /api/mock/<specId>/<path>` → Prism processes against the spec → returns mock response.
  - Reuses the same `currentJson` already dereferenced + cycle-restored.
- Public-share preview (Epic 19's `/share/<token>` page): preview pane uses `apiBase = /api/mock/share/<token>` → same handler resolved via the share-token, reusing the Spec-snapshot stored in the share-record (NOT the live Spec — share is frozen).
- Per `brainstorming-launch.md` §"Live Preview" decision: Stateless Edge-Function. No long-running mock-server. No container. Cold-start 200-500 ms first hit, warm thereafter.
- Vercel Edge-Function payload limit is 4 MB request/response. Specs >2 MB at-edge-load fail; the disabled-state in `<SpecPreviewPane>` catches this client-side before the request fires.

### Big-spec disable mechanism

- Server-side gate in `<SpecPreviewPane>` props: parent (`SpecDetailView`) checks `spec.endpointCount` and `Buffer.byteLength(JSON.stringify(spec.currentJson))` before rendering. If over cap, render the disabled-card directly without loading Stoplight Elements. Saves bundle weight on big specs.
- Cap-threshold in `src/lib/preview-cap.ts`: `MAX_PREVIEW_ENDPOINTS = 1000`, `MAX_PREVIEW_BYTES = 2_000_000`. Both finalized after Epic 09 (Spike S0) result; this epic ships them as constants overridable in one place.

### Three-pane integration

- Epic 17's Preview pane stub replaced with `<SpecPreviewPane spec={spec} apiBase={`/api/mock/${spec.id}`} />`.
- Per Epic 17, pane is collapsible / auto-collapses below 1280 px viewport.

### Tests

- Vitest:
  - `<SpecPreviewPane>` renders the disabled-card when `spec.endpointCount > 1000`.
  - `<SpecPreviewPane>` renders the disabled-card when `currentJson` byte-size > 2 MB.
  - `<SpecPreviewPane>` renders the Stoplight Elements element otherwise (mock the dynamic-import).
- E2E (Playwright if available in v1, else manual smoke check documented in results):
  - Open a freshly-analyzed OpenWeatherMap spec → preview renders → click a Try-It on `GET /weather` → mock response shows up in <1 s.
  - Open a freshly-analyzed Stripe (sliced 126 ops) spec → preview renders.
  - Open a >1000-endpoint spec (Stripe full from Epic 09's curated set) → disabled-card shows, no Stoplight bundle loaded.
- Network smoke: hit `/api/mock/<specId>/foo` directly via curl → returns Prism-generated response (200 with example body).

## Acceptance criteria

1. `@stoplight/elements` installed at a pinned version in `8.x` range.
2. `<SpecPreviewPane>` exists at `src/components/spec-preview-pane.tsx`, dynamically imports Stoplight Elements (`ssr: false`), passes `currentJson` + `apiBase`.
3. Dark-mode theming overrides Stoplight defaults to use zinc + violet from `prd-decisions.md`. Manual visual check passes.
4. `/api/mock/[specId]/[...path]` Edge Route exists. Loads `Spec.currentJson`, instantiates Prism, returns mock response for the requested method+path.
5. Cache header is `public, max-age=86400, stale-while-revalidate=3600`.
6. Public-share-preview path (`apiBase = /api/mock/share/<token>`) resolves `Spec`-snapshot via share-token. Workspace-isolation enforced.
7. Disabled-state shows for `endpointCount > 1000` OR `byteLength > 2_000_000`.
8. Cap constants exist in `src/lib/preview-cap.ts` and are referenced by both the gate component and the route-handler. Single-source-of-truth.
9. Spec-Detail's right pane (Epic 17) renders `<SpecPreviewPane>` for normal-sized specs.
10. Try-It on a sample-spec (OpenWeatherMap or Petstore) returns a mock response within 2 s p95.
11. Tests in §"Tests" pass.
12. Browser-smoke documented in `specs/18-live-preview-stoplight-prism-results.md` with screenshots: preview pane on small spec, preview-disabled state on big spec, Try-It happy path.

## Out of scope

- Long-running container-based Prism mock (e.g., Fly.io / Render) — explicitly rejected per `brainstorming-launch.md` §"Live Preview".
- Static pre-generated mocks at analyze-time — rejected per same.
- Custom mock-response-shaping (user edits Prism behavior) — Prism's defaults only; users export the spec to customize locally.
- Authentication-aware mocks (mock returns 401 without auth) — Prism follows the spec's `securitySchemes`; no apiq-side auth-injection.
- Preview-on-Specs-list (mini preview per row) — out of scope; preview is per-spec-detail only.
- Real-API-passthrough (proxy to actual backend) — not a mock-server feature.
- Try-It history / replay — out of scope.
- Schema-aware faker beyond Prism defaults — out of scope.

## Domain terms

- **Stoplight Elements** — `@stoplight/elements` web-component library that renders an interactive OpenAPI explorer.
- **Prism** — `@stoplight/prism-http` mock server library; instantiated in-process per Edge Function call.
- **Edge-cached spec lookup** — the de-facto "24h ephemeral cleanup": the Edge Function caches `currentJson` lookups for 24 h; after that, a fresh DB hit re-warms the cache.
- **Big-spec disable** — client-side gate that prevents loading Stoplight Elements for specs over the 1000-endpoint or 2 MB cap.
- **Public-share preview** — preview pane on `/share/<token>` page (Epic 19); reads the share-snapshot, not live `Spec`.

## Open questions

- Cap thresholds (1000 endpoints, 2 MB) are Epic-09 dependent. If Spike S0 result shows the chosen architecture handles bigger, raise cap. Locked at Epic 18 impl-start.
- Stoplight Elements has periodic breaking changes between minor versions; pin exact version + add to dependabot-ignore. Re-test on each manual upgrade.
- Whether the public-share preview should rate-limit per-IP independently of the share-link rate-limit (separate `mock_view` action-key in `IpActionLog`). Recommendation: yes; mock-calls are heavier than HTML page-views. 200/IP/h on `mock_view`.
- Try-It-button cold-start latency (first hit per spec): 200–500 ms — acceptable. If users complain, pre-warm by hitting `/api/mock/<specId>/` (root) on pane-mount.
- Vercel Pro vs Hobby Edge-Function quota: 100 GB-hours/month on Hobby. Estimate: ~5k mock-calls/day at avg 50ms × 128 MB = ~30 GB-hours/month. Fits Hobby tier for v1; revisit at growth signal.
