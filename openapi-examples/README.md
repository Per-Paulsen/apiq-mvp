# OpenAPI Examples

Real-world public OpenAPI specifications used for development, testing, and verification of the analysis pipeline.

**Hard rule: no synthetic specs.** No `petstore`-style examples, no specs constructed to exercise specific cases, no hand-crafted "this should fail X check" specs. Real specs always carry messiness no synthetic suite anticipates — the analysis pipeline must calibrate against that, not against our own invented cases.

This folder is intentionally empty in Phase A. It will be populated as part of the **Phase 0 — Research Spike** (Epic 00) with a curated set of real public OpenAPI specs sourced from production APIs.

## Suggested shortlist (decided in spike kickoff)

- **Stripe** — `github.com/stripe/openapi` — large, polished, gold-standard reference for "what good looks like"
- **OpenWeatherMap** — small, well-known, ties back to the project's 2019 origin
- **Twilio** or **PagerDuty** — mid-sized real-world product APIs
- **GitHub REST API** (full or sliced) — large, complex, real-world quirks
- One smaller / less-polished spec from **APIs.guru** — genuine messiness

When adding a sample spec, also add a brief entry below describing what it is and where it came from.

## Catalog

Entries are sorted alphabetically by sub-folder name. Each row is one curated spec; per-spec details live in the spec's own `README.md`.

| Sub-folder | Spec | Endpoints | License | One-liner |
| - | - | -: | - | - |
| [`dnd5eapi/`](./dnd5eapi/README.md) | D&D 5e API (`dnd5eapi.co` v0.1) | 47 | MIT | Hobby community API; "messy" calibration spec — every op missing `operationId`, sparse descriptions. |
| [`openweathermap/`](./openweathermap/README.md) | OpenWeatherMap API 2.5 (current weather) | 1 | CC BY-SA 4.0 | **Reference-target spec for the spike** — small, well-known surface backing the manually-written 15-finding "gold standard" document at `openweathermap/reference/findings-target.md`. |
| [`pagerduty/`](./pagerduty/README.md) | PagerDuty REST API v2 (sliced) | 183 | Not declared (treated as public API documentation) | Mid-sized real-world incident-response API; sliced from 419 ops to operational-core tags. |
| [`stripe/`](./stripe/README.md) | Stripe API `2026-04-22.dahlia` (sliced) | 126 | MIT | "What good looks like" reference; sliced from 587 ops to 6 core payment/billing domains. |
