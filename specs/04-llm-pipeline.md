# Epic 04 — LLM Pipeline

> Runs the analysis pipeline that converts a dereferenced OpenAPI spec into a list of Findings. Implements the prompt, schema, and patch-emission rules **proven by Epic 00 (Research Spike)**. Single Sonnet call per spec for v0.1.

## Scope

- Define Prisma models:
  - `Finding { id, specId, specVersionId, scope (spec|endpoint), affectedEndpoints (Json — array of {path, method}), category (clarity|design|risk), severity (critical|high|medium|low), title, narration, rationale, patchSummary, patchOps (Json — RFC 6902 op array), status (open|applied|rejected|stale|outdated), appliedAt?, appliedInVersionId?, rejectedAt?, createdAt, updatedAt }` — workspace-scoped via `Spec.workspaceId`.
  - `LLMCall { id, workspaceId, specId?, specVersionId?, model, prompt (Json), responseRaw (String), tokensIn, tokensOut, costUSD, durationMs, status (success|retry|failed), errorMessage?, createdAt }` — for debugging and cost audit.
- Implement OpenRouter client wrapper at `src/lib/openrouter.ts`:
  - lazy-init OpenAI SDK with `baseURL: 'https://openrouter.ai/api/v1'` and `apiKey: process.env.OPENROUTER_API_KEY` (not at module scope — instantiate inside the call function so build/edge contexts don't crash)
  - JSON-fence stripping on every response (handles ```json ... ``` wrappers)
  - exponential-backoff retry: 3 retries on retryable failures (network timeout, 5xx, 429) with 1 s / 4 s / 16 s delays. 4xx → no retry. JSON-parse-failure-after-fence-strip → 1 retry with the same prompt.
- Implement `src/lib/analysis/runAnalysis.ts`:
  - input: `specId`
  - loads `Spec.currentJson` and `Spec.currentVersionId`
  - daily-limit check (≤50 LLM calls per workspace per 24 h via `WorkspaceActionLog` from Epic 03; reject with `{ kind: 'rate_limited' }`)
  - sets `Spec.analysisStatus = 'analyzing'`
  - builds the prompt from the proven template in `src/lib/analysis/prompt.ts` (sourced from `specs/research-spike.md`)
  - calls OpenRouter with `OPENROUTER_MODEL || 'anthropic/claude-sonnet-4'`
  - validates the response against the proven JSON schema (zod), rejects + retries malformed structure once
  - in a single transaction:
    - deletes prior `Finding` rows for this spec where `status = 'open'` (open findings are always re-generated; applied/rejected/stale/outdated are kept as history)
    - inserts the new findings with `specVersionId = Spec.currentVersionId`, `status = 'open'`
    - updates `Spec.qualityScore`, `Spec.lastAnalyzedAt`, `Spec.analysisStatus = 'completed'`
    - writes the `LLMCall` row (always, including failed calls)
  - on terminal failure: `Spec.analysisStatus = 'failed'`, `Spec.analysisError = errorMessage`
- Implement `src/app/api/internal/analyze/route.ts`:
  - `export const maxDuration = 300` (Vercel function timeout 5 min, requires Pro plan)
  - `POST` handler — body `{ specId }` — calls `runAnalysis(specId)`
  - **internal-only**: checks a shared secret header `x-internal-secret` against `process.env.INTERNAL_API_SECRET` to prevent external invocation
  - server action `addSpecFromUrlAction` (Epic 03) and `repullSpecAction` (Epic 03) and `reanalyzeSpecAction` (this epic) call this route via fire-and-forget `fetch` with the secret header
- `reanalyzeSpecAction({ specId })` server action — manual re-trigger from Spec Detail. Same path as the auto-trigger.
- Implement `computeQualityScore(findings: Finding[]): number` deterministically:
  - `score = clamp(100 - (15·critical + 7·high + 3·medium + 1·low), 0, 100)` — only counts `status === 'open'` findings
  - exposed as a pure function for use by both the analysis pipeline and any future re-display
- Tests (Vitest):
  - `runAnalysis` happy path — mocked OpenRouter response (a fixture from Epic 00 spike output)
  - retry logic for 5xx, timeout, 4xx (no retry), malformed-JSON
  - quality-score formula at boundary cases (all critical, no findings, mixed)
  - `LLMCall` is written for both success and failure
  - daily-limit branch
  - prompt-stability test: snapshot test on the rendered prompt for a fixture spec

## Acceptance criteria

1. Prisma migration `add_finding_and_llm_call` creates `Finding` + `LLMCall` with the schema above. Indexed on `(specId, status)` for filtering and on `(workspaceId, createdAt)` for cost audits.
2. Triggering `runAnalysis(specId)` against a small fixture spec (using a mocked OpenRouter response) creates ≥1 Finding row with all fields populated, sets `Spec.qualityScore`, `Spec.lastAnalyzedAt`, `Spec.analysisStatus = 'completed'`.
3. The fixture-mocked Findings have `affectedEndpoints` as a Json array, `patchOps` as a Json array of RFC 6902 ops, `scope` set to either `'spec'` or `'endpoint'`, `status = 'open'`.
4. A second `runAnalysis(specId)` call (re-analysis) deletes prior `open` findings but keeps prior `applied` / `rejected` / `stale` / `outdated` findings.
5. Mocked 5xx response triggers 3 retries with exponential backoff (verified via fake timers) before final failure; `Spec.analysisStatus = 'failed'`, `Spec.analysisError` is set; an `LLMCall` row exists with `status = 'failed'`.
6. Mocked 4xx response triggers no retry; same failure-path bookkeeping.
7. JSON-fence-wrapped response (```json …```) is parsed correctly.
8. Malformed JSON after fence-strip triggers exactly 1 retry; if the retry also fails, the call fails.
9. Quality score at boundaries: 0 findings → 100; 7 critical findings → 0 (clamped from -5); known mix produces the formula's exact result.
10. The 51st `runAnalysis` call within 24 h for a workspace returns `{ success: false, error: { kind: 'rate_limited', retryAt } }`; no LLM call is made.
11. `/api/internal/analyze` POST without the `x-internal-secret` header returns 403.
12. `/api/internal/analyze` POST with the correct secret triggers `runAnalysis` and returns 202 immediately (the actual work runs within the 5-min function timeout).
13. `reanalyzeSpecAction` produces the same effects as the auto-trigger from Epic 03.
14. Vitest tests above pass; no real OpenRouter calls are made in tests.

## Out of scope

- Two-call (per-endpoint Haiku + spec-level Sonnet) architecture — v0.2 (when Stripe-class specs are in scope).
- Streaming responses (SSE / WebSocket) — v0.2.
- BYOK (per-workspace OpenRouter key) — v0.2.
- Token-usage display in the UI — `LLMCall` table is internal-only in v0.1.
- Cost billing, per-user budgeting — v0.2+.
- Incremental re-analysis (only re-eval affected findings after a patch) — v0.2.
- Hash-based finding identity across re-analyses — v0.2.
- The Spec Detail UI that surfaces findings — Epic 05.
- The Patch-apply server action — Epic 06 (this epic only emits `patchOps`).
- The prompt itself, output schema, persona, anti-pattern list — produced by Epic 00. This epic consumes them; if Epic 00 is not yet complete, this epic is blocked.

## Domain terms

- **Finding** — one identified issue in the spec, with category, severity, narration, rationale, patch ops, patch summary, and one or more affected endpoints. Belongs to a SpecVersion (the version it was generated against).
- **`scope`** — `'endpoint'` for findings tied to one or more concrete endpoints (`affectedEndpoints` non-empty); `'spec'` for cross-cutting findings about the spec as a whole (`affectedEndpoints` empty).
- **`affectedEndpoints`** — Json array of `{ path: string, method: string }`. Plural per PRD §"Each finding shows" → "Endpoint(s) affected". Used for filtering and for the "N endpoints affected" evidence count.
- **`patchOps`** — Json array of RFC 6902 JSON Patch operations that, when applied to `Spec.currentJson`, produce the corrected spec. Validated by Epic 00 spike for apply-cleanness; applied by Epic 06.
- **`patchSummary`** — short (≤120 char) human-readable description of what the patch does ("Adds `cursor` query parameter to /orders for stable pagination"). Distinct from `narration` (why it matters) and `rationale` (which principle it grounds in).
- **Quality score** — deterministic 0-100 derived from open findings via the formula. Never LLM-emitted.
- **`LLMCall`** — internal log row per OpenRouter call (incl. retries). Not user-visible in v0.1; used for debugging and cost audit.
- **Status `outdated` vs `stale`** — `outdated` is set by Epic 03 re-pull (entire batch invalidated). `stale` is set by Epic 06 patch-apply (a single patch can no longer apply to current spec). Both are read-only.

## Open questions

- The exact prompt text, output JSON schema (zod), persona, anti-pattern list — owned by Epic 00. This spec lists where they live (`src/lib/analysis/prompt.ts`, sourced from `specs/research-spike.md`).
- Should `LLMCall.prompt` store the full rendered prompt (Json) or a hash + reference? For v0.1: full prompt — debugging value outweighs storage cost (specs are ≤5 MB, prompts are ~10× spec size).
- Should daily-limit count successful calls only or all attempts (including failures)? Recommendation: all attempts that actually hit OpenRouter (i.e. excluding rate-limit-blocked calls). Documented in implementation comment.
- Fire-and-forget `fetch` in a server action: on Vercel, the parent server action returns before the child fetch completes — the child must not be aborted by the parent's response. Verify the platform behaviour during implementation; if aborted, fall back to `waitUntil` or a queued job (Inngest in v0.2).
- Internal-API-secret rotation: a single env var is fine for v0.1. Multi-secret rotation is v0.2+ infra.
- Whether the prompt should reference the spec's `info.title` and `info.description` to ground the LLM in domain context — Epic 00 to decide.
