# apiq research-spike harness

Standalone TypeScript harness for **Epic 00 — Research Spike**. Runs prompt iterations against curated OpenAPI specs in `openapi-examples/`, validates emitted JSON Patches, and writes structured run results.

This is throwaway-grade infrastructure. It lives outside the main Next.js app (which doesn't exist yet) and has its own `package.json`. Do not import from it.

## Prerequisites

- Node.js 20+
- An OpenRouter API key (`sk-or-v1-...`)

## Install

```bash
cd scripts/spike
npm install
```

## Configure

Copy `.env.example` to `.env` and fill in your key:

```bash
cp .env.example .env
# then edit .env
```

Required env vars:
- `OPENROUTER_API_KEY` — your OpenRouter key
- `OPENROUTER_MODEL` — model id, defaults to `anthropic/claude-sonnet-4`

`.env` is gitignored at the repo root.

## Run

From inside `scripts/spike/`:

```bash
npx tsx run-prompt.ts <variant-id> <spec-name>
```

Examples:

```bash
npx tsx run-prompt.ts v1 openweathermap
npx tsx run-prompt.ts v2-narration-tighter pagerduty
```

Resolution:
- `<variant-id>` → `prompts/<variant-id>.ts` (must export `SYSTEM_PROMPT` and `buildUserPrompt`)
- `<spec-name>` → `../../openapi-examples/<spec-name>/spec.{json,yaml,yml}` (auto-detected by extension)

## Output

Results are written to `../../specs/research-spike-runs/<variant-id>__<spec-name>.json` (the `specs/research-spike-runs/` directory is gitignored — outputs are large and frequently regenerated). The JSON contains:

- `variantId`, `specName`, `model`
- `durationMs`, `tokensIn`, `tokensOut`, `costUSD`
- `findings[]` — the LLM's findings, conforming to the Finding schema in `schema.ts`
- `patchValidation[]` — per-finding `applyClean` / `hallucinationCheck` / `applyError`
- `summary` — `totalFindings`, `applyCleanRate`, `hallucinatedCount`, `hallucinatedRate`

A 5-line summary is also printed to stdout.

## Adding a new prompt variant

Drop a new file in `prompts/`:

```ts
// prompts/v2-tighter-narration.ts
export const SYSTEM_PROMPT = `...`;
export function buildUserPrompt(specName: string, specJson: object): string {
  return `...`;
}
```

Then run:

```bash
npx tsx run-prompt.ts v2-tighter-narration openweathermap
```

## Files

- `run-prompt.ts` — CLI entry point
- `openrouter.ts` — OpenAI SDK wrapper for OpenRouter, with retry + JSON-fence-strip
- `schema.ts` — zod schema for the LLM output
- `validate-patches.ts` — RFC 6902 patch + hallucinated-path validation
- `prompts/v1.ts` — initial calibration baseline
- `slice-stripe.mjs` — fetch the upstream Stripe spec (`github.com/stripe/openapi`) and slice it to the core domain allow-list documented in `openapi-examples/stripe/slice.md`. Writes `openapi-examples/stripe/spec.json`.
- `slice-pagerduty.mjs` — fetch the upstream PagerDuty spec (`github.com/PagerDuty/api-schema`) and slice it to the incident-response tag allow-list. Writes `openapi-examples/pagerduty/spec.json`.
- `.env.example` — env template (committed)
- `.env` — your real env (gitignored)

## Notes

- Patches operate on the **dereferenced** spec — `$ref`s are inlined via `@apidevtools/swagger-parser` before the LLM sees the spec.
- The harness retries on 5xx / 429 / network errors (1s / 4s / 16s backoff), retries once on JSON-parse failure, and retries once on zod-schema failure. 4xx (except 429) is non-retryable.
- Per-token cost rates for Sonnet are hardcoded in `run-prompt.ts`. If you switch models, update the `PRICING_PER_TOKEN` table.
