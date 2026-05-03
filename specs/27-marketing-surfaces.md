# Epic 27 — Marketing Surfaces

> Public-facing pages: landing-page redesign with hero + paste-textarea + sample-picker + below-fold value-props, marketing-copy across surfaces, smart-loading-hints catalog wired into analyzing-state UI, OG/Twitter card meta with edge-rendered preview images, sample-spec-allow-list expansion to OpenWeatherMap + Stripe (sliced) + Petstore.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Marketing surfaces block", §6 "Distribution Strategy", [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Marketing Surfaces", §"Resolved 2026-05-03" Q5.

## Scope

### Landing page redesign (`/`)

- Replace existing v0.1 placeholder `(public)/page.tsx` with the new landing layout per `brainstorming-launch.md` §"Marketing Surfaces" and `prd-launch.md` §6:

  ```
  Topbar: apiq logo (left), Sign in (right)

  Hero (centered, max-w-4xl, py-20):
    H1: "The quality gate for your OpenAPI specs"
    Subtext: "LLM-narrated findings · One-click patches · Live preview"

    <SpecImportPanel mode="anon" /> (Epic 15 component)

    Divider: "or try a sample"

    <SamplePicker /> — 3 buttons: OpenWeatherMap | Stripe | Petstore

  Below fold:
    "How it works" — 3-step horizontal cards (Upload → Analyze → Apply)
    "Compare" — comparison table (PRD §1's table — 6 rows: Spectral, 42Crunch, Stoplight Studio, Postman, OpenSpec, Generic AI)
    "Why you'll love it" — 3-card layout: 🧠 Narration · 🔧 Patches · 👀 Live preview
    "From the founder" — 1-paragraph personal note (Reply-To: founder@apiq.dev)
    Footer: links to /docs, /mcp, /cli, /pricing, /privacy, /terms, /contact, GitHub
  ```

- Components needed:
  - `<HeroCTA />` wrapping `<SpecImportPanel mode="anon">` + `<SamplePicker>`.
  - `<HowItWorks />` 3-step cards.
  - `<ComparisonTable />` from PRD §1.
  - `<ValueProps />` 3-card.
  - `<FromFounder />` plain text card.
- All layout uses `prd-decisions.md` zinc + violet, no illustrations, density-aware.

### `<SamplePicker />` component

- New `src/components/sample-picker.tsx`:
  - 3 buttons (OpenWeatherMap, Stripe, Petstore — per `brainstorming-launch.md` §"Resolved 2026-05-03" Q5).
  - Each button has icon + name + endpoint-count badge.
  - Click → navigate to `/anon/sample-<name>` (Epic 19 routes).
- Sample-allow-list update in `src/lib/sample-specs.ts` (existing v0.1 file): expand from `['openweathermap']` to `['openweathermap', 'stripe-sliced', 'petstore']`.
- Add `openapi-examples/petstore/` directory:
  - `openapi-examples/petstore/openapi.yaml` — the canonical Petstore spec (sourced from `https://github.com/swagger-api/swagger-petstore` — Apache 2.0).
  - `openapi-examples/petstore/README.md` — license, source, classification as **marketing-demo-sample** (NOT spike-calibration sample, per Hard-Rule clarification).
- Update `openapi-examples/README.md`: add a "Marketing demo samples" section header above the existing catalog. Petstore listed there. Spike-calibration samples (current 4) remain in their own section. Hard-Rule clarification: *"Synthetic-spec rule applies only to spike-calibration; marketing-demo-samples may include synthetic specs (e.g. Petstore) for user-recognition value."*

### Marketing copy + tone

- Audit + update copy in: Landing page, `<SpecImportPanel>` placeholders, `<EmptyState>` Specs-list (Epic 17), all toast messages (Epic 08 catalog).
- Style guide per `brainstorming-launch.md` §"Marketing":
  - YES: concrete, ehrlich, engineer-tone.
  - NO: marketing-fluff, "revolutionize", "empower", em-dash-heavy hyperbole.
- Apply to: tagline, sub-tagline, sample-picker labels, CTA button copy, error toasts, success toasts, empty-states.

### Smart-loading-hints catalog

- New `src/lib/loading-hints.ts`:

  ```typescript
  export const ANALYSIS_LOADING_HINTS: Array<{ duration_ms: number; text: string }> = [
    { duration_ms: 3000,  text: "Parsing your spec…" },
    { duration_ms: 3000,  text: "Validating OpenAPI 3.x compliance…" },
    { duration_ms: 5000,  text: "Resolving $refs and computing dereferenced graph…" },
    { duration_ms: 10000, text: "Reviewing endpoints for clarity…" },
    { duration_ms: 10000, text: "Looking for design-pattern violations (REST, RFC 7807, pagination)…" },
    { duration_ms: 10000, text: "Checking for risk indicators (auth-shape, sensitive fields)…" },
    { duration_ms: 5000,  text: "Computing quality score…" },
    { duration_ms: 3000,  text: "Polishing the report…" },
  ];
  ```

- Wired into Spec-Detail's `analyzing` state (replaces existing v0.1 generic spinner). Component `<AnalyzingHints />`:
  - `useEffect` loops through hints in order, advancing on each `duration_ms` timer.
  - On reach end of list, holds last hint until status flips.
  - On `status` flip to `completed` → unmount, Score-Reveal-Animation triggers (Epic 17).

### OG/Twitter card meta

- Per-route Next.js Metadata API entries:
  - `/` — apiq logo + tagline + CTA hint static OG image (~1200×630 PNG, in `public/og-default.png`).
  - `/share/<token>` — DYNAMIC OG image via `@vercel/og` rendered Edge-side; ~1200×630 with score-ring + spec-name + severity-breakdown.
  - `/anon/<token>` — same dynamic OG via `@vercel/og`.
  - `/badge/<token>.svg` — already an image.
  - `/try`, `/mcp`, `/cli`, `/pricing`, `/contact`, `/docs` — static minimal OG (logo + page-title).
  - `/privacy`, `/terms`, `/privacy/sub-processors` — same minimal OG.
- Twitter card type: `summary_large_image`.
- `og:url`, `og:type`, `og:title`, `og:description`, `og:image`, `twitter:card`, `twitter:site`, `twitter:image` — all set.

### `@vercel/og` image generation

- `npm install @vercel/og`.
- New route `src/app/api/og/[type]/[id]/route.ts`:
  - Edge runtime.
  - `type ∈ {share, anon}`, `id` is the token.
  - Looks up the Spec/AnonymousAnalysis snapshot, renders 1200×630 image with score-ring + spec-name + severity-breakdown via `<ImageResponse>`.
  - Cache-Control: `public, max-age=3600` (1 h — share-snapshots are frozen, but may revoke).

### Tests

- Vitest:
  - `<SamplePicker />` renders 3 buttons; click navigates correctly.
  - Sample-allow-list updated: `isSampleAllowed('petstore')` returns true.
  - `<AnalyzingHints />` cycles through hints in order; final hint held when last reached.
  - Metadata API per-route returns correct OG fields (snapshot-test).
  - `/api/og/share/<token>` route returns 200 PNG/JPEG response.
- Visual regression (manual): screenshot landing page; document in results.

## Acceptance criteria

1. Landing page (`/`) renders new layout per Scope §"Landing page redesign".
2. `<SpecImportPanel mode="anon">` + `<SamplePicker>` integrated in hero.
3. `<SamplePicker />` exists with 3 buttons (OWM, Stripe, Petstore); navigates to `/anon/sample-<name>`.
4. `openapi-examples/petstore/` directory + README + spec file exist; allow-list expanded.
5. `openapi-examples/README.md` updated with Marketing-demo-samples section + Hard-Rule clarification.
6. Marketing copy across audited surfaces matches the style guide.
7. `<AnalyzingHints />` component cycles 8 hints during analyzing-state in Spec-Detail.
8. OG/Twitter meta per-route configured via Next.js Metadata API.
9. Dynamic OG via `@vercel/og` for /share/* and /anon/* routes.
10. Static OG image `public/og-default.png` exists (~1200×630 PNG).
11. Vitest tests in §"Tests" pass.
12. Browser smoke documented in results: landing page screenshot, share-OG-image preview in Twitter card validator.

## Out of scope

- Paid ads / influencer outreach — out of v1 budget.
- Localization / i18n — English only v1.
- Conference-talk submissions — post-launch.
- Open-source-community contributions as marketing — post-launch.
- Custom Stripe-Pricing API on /pricing — Epic 26 covers static pricing; dynamic billing is post-monetization.
- A/B testing variants — v1.1.
- Email-newsletter signup — v1.1 if user demand.
- Press kit / brand-asset downloads — post-Naming-Workshop output.

## Domain terms

- **Marketing demo sample** — sample spec used purely for in-app try-it (Petstore, OpenWeatherMap, Stripe-sliced); distinct from spike-calibration samples.
- **Sample-allow-list** — `src/lib/sample-specs.ts` whitelist of safely loadable sample-spec names.
- **Smart-loading-hints** — sequence of strings shown during `analyzing` status, replacing generic spinner.
- **OG image** — Open Graph image (1200×630 PNG); Twitter, LinkedIn, Slack, etc. read it for link-previews.

## Open questions

- Stripe-sliced sample: should we add a SECOND Stripe sample (full 587 ops) for "advanced sample"? Recommendation: no — full Stripe is for spike-calibration, not landing-page-demo. Sliced version is friendly enough.
- Should the landing-page-hero auto-play a demo loom-video instead of (or alongside) the paste-textarea? Recommendation: paste-textarea ONLY in v1 (immediate engagement); video is v1.1 if conversion rate signals it would help.
- "From the founder" copy — per session, we'll generate 2-3 candidates and pick. Keeps timestamped + reply-to founder so it stays personal.
- Should `<AnalyzingHints />` track LLM-pipeline phase events instead of fixed-time? Future enhancement — for v1, fixed-time is enough; phase-events would require Epic 04 changes (out of scope).
