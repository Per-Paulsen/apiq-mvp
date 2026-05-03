# Demo seed fixtures

Pre-captured analyses that the portfolio-deploy seeds into the demo workspace.
Each `<slug>.json` is one fully-analyzed Spec snapshot — `name`, `originalJson`,
`currentJson`, `endpointCount`, `qualityScore`, and the open Findings.

These are committed to git so the production-deploy + daily reset-cron run
at zero LLM cost.

## How to (re)generate

1. Make sure your local dev environment has the target specs analyzed:
   - Run `npm run dev`
   - Sign up locally
   - Click "Try sample" → adds OpenWeatherMap + analyzes (the existing v0.1
     sample-allow-list mechanism)
   - Optionally URL-pull 1–2 more specs you want in the demo. Good public
     candidates:
     - **Petstore 3.0:** `https://petstore3.swagger.io/api/v3/openapi.json` — 16
       endpoints, recognizable, ~$0.05 LLM cost
     - **DnD 5e API:** `https://www.dnd5eapi.co/api/v2/2014/openapi.json` — 47
       endpoints, fun, real-world messy
     - **Stripe full:** `https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json` — 587 endpoints, ~$2 LLM, impressive but slow
   - Wait for `analysisStatus = 'completed'` on each
2. From the repo root:
   ```bash
   npm run capture-demo-fixtures
   ```
3. Inspect the output `*.json` files for sanity (no PII, reasonable narrations).
4. Commit the fixtures.

## Default behaviour

The capture script captures **EVERY completed spec with ≥1 open finding** from
your dev DB. Filter to specific names with:

```bash
APIQ_DEMO_FIXTURE_NAMES=OpenWeatherMap,Petstore npm run capture-demo-fixtures
```

The seed-demo logic (`src/lib/seed-demo.ts`) loads ALL `*.json` files from this
directory at seed time — so any fixture you commit gets included in the demo
workspace.

## What gets seeded vs not

Seeded into the demo workspace: Spec rows + their initial SpecVersion + open
Findings.

NOT seeded: Applied/rejected findings, multi-version histories, LLMCall rows,
WorkspaceActionLog rows. Visitors create those themselves while exploring; the
daily reset wipes them and re-seeds the open-state.
