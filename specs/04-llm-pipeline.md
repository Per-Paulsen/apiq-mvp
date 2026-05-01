# Epic 04 — LLM Pipeline

> Runs the analysis pipeline that converts a dereferenced OpenAPI spec into a list of Findings. Implements the prompt, schema, and patch-emission rules **proven by Epic 00 (Research Spike)**. Single Sonnet call per spec for v0.1.

## Scope

- **Spike-to-runtime file mapping** (per Epic 00 results §"What Epic 04 should do"):
  - `scripts/spike/prompts/v4.ts` → `src/lib/analysis/prompt.ts` (SYSTEM_PROMPT verbatim + `buildUserPrompt` + the persona / multi-pass / severity / anti-pattern / large-spec / patch-rules sections — DO NOT paraphrase; the wording is calibrated against 11 spike runs).
  - `scripts/spike/schema.ts` → `src/lib/analysis/schema.ts` (zod `OutputSchema`, `FindingSchema`, `PatchOpSchema`, `AffectedEndpointSchema` verbatim, including the `rationale.min(50)` relaxation comment).
  - `scripts/spike/stringify-spec.ts` → `src/lib/analysis/stringify-spec.ts` (`cycleStripSpec` + `stringifySpecForPrompt`). Used by both Epic 04 (prompt build) and Epic 06 (patch validator); they MUST share the helper so they observe the same tree.
  - `scripts/spike/openrouter.ts` → `src/lib/openrouter.ts` (lazy-init client, `stripJsonFences`, `callLLM` retry policy: 3 net retries 1s/4s/16s; 1 parse-failure retry).
  - `scripts/spike/validate-patches.ts` → `src/lib/analysis/validate-patches.ts` (used by Epic 06; included here so the file is owned by Epic 04's analysis library).
- The decision record is `specs/research-spike.md`. The spike's run harness (`scripts/spike/run-prompt.ts`) is kept as a regression tool — Epic 04 may add a Vitest fixture from `specs/research-spike-runs/v4__openweathermap.json` (decision deferred per research-spike.md Open Question 5).
- Define Prisma models:
  - `Finding { id, specId, specVersionId, scope (spec|endpoint), affectedEndpoints (Json — array of {path, method}), category (clarity|design|risk), severity (critical|high|medium|low), title, narration, rationale, patchSummary, patchOps (Json — RFC 6902 op array), status (open|applied|rejected|stale|outdated), appliedAt?, appliedInVersionId?, rejectedAt?, createdAt, updatedAt }` — workspace-scoped via `Spec.workspaceId`.
  - `LLMCall { id, workspaceId, specId?, specVersionId?, model, prompt (Json), responseRaw (String), tokensIn, tokensOut, costUSD, durationMs, status (success|retry|failed), errorMessage?, createdAt }` — for debugging and cost audit. `prompt` Json shape: `{ systemPromptHash: string, systemPromptVersion: 'v4', userPromptPreamble: string, specName: string, specSizeBytes: number, specEndpointCount: number }` — i.e. system prompt is stored as a content-addressed hash (the actual text lives in `src/lib/analysis/prompt.ts`), and the spec body itself is NOT inlined. Rationale: at 5 MB spec × 50 calls/day, full-body storage would write ≥250 MB/day per workspace; spec body is reconstructible from `specVersionId` for debugging. This resolves Epic 00 results §"Epic 04" risk on `LLMCall.prompt` storage.
- Implement OpenRouter client wrapper at `src/lib/openrouter.ts` by porting `scripts/spike/openrouter.ts` (Epic 00 reference implementation):
  - lazy-init OpenAI SDK (NOT at module scope) with `baseURL: 'https://openrouter.ai/api/v1'` and `apiKey: process.env.OPENROUTER_API_KEY`
  - `stripJsonFences()` helper (handles ` ```json ... ``` ` and ` ``` ... ``` `)
  - `callLLM({ system, user })` with retry policy as in the spike: 3 network retries with 1 s / 4 s / 16 s backoff on 5xx / network / 429; 4xx (other than 429) → throw immediately; JSON-parse-failure after fence-strip → exactly 1 retry with the SAME prompt without burning a network attempt.
  - Returns `{ raw, parsed, tokensIn, tokensOut, durationMs, model }` (the shape consumed by `runAnalysis`'s LLMCall write).
  - The spike's TypeScript file is the source of truth; deviations from it must be justified in a code comment.
- Implement `src/lib/analysis/runAnalysis.ts`:
  - input: `specId`
  - loads `Spec.currentJson` and `Spec.currentVersionId`
  - **dollar-budget check:** `SELECT SUM(costUSD) FROM LLMCall WHERE workspaceId = X AND createdAt > NOW() - INTERVAL '24 hours'`. If sum ≥ `$10.00`, reject with `{ kind: 'budget_exceeded', spent: <sum>, limit: 10.00, retryAt: <oldest call's createdAt + 24h> }`. The $10/24h figure is the Q4 confirmed decision per `specs/ind-epic-review.md`; chosen because reasonable engineer usage (5-7 medium specs/day) stays well below it while a misuse vector (Stripe-class loop) is capped at ~$10 instead of ~$90.
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
7a. `runAnalysis` against a fixture spec containing a recursive schema (e.g. a `TreeNode` with `children: TreeNode[]`) does NOT crash on `JSON.stringify`. The serialized prompt body contains `{"$ref":"#cyclic"}` markers wherever a cycle would re-enter; the prompt's stringification is performed by the shared `cycleStripSpec` helper imported from `src/lib/analysis/stringify-spec.ts` (Epic 06 imports the same helper so the validator and the LLM observe the same tree).
8. Malformed JSON after fence-strip triggers exactly 1 retry; if the retry also fails, the call fails.
9. Quality score at boundaries: 0 findings → 100; 7 critical findings → 0 (clamped from -5); known mix produces the formula's exact result.
10. When `SUM(LLMCall.costUSD) WHERE workspaceId AND createdAt > NOW()-24h ≥ $10.00`, the next `runAnalysis` call returns `{ success: false, error: { kind: 'budget_exceeded', spent, limit: 10.00, retryAt } }`; no LLM call is made. (`retryAt` = oldest call's createdAt + 24h, i.e. when the rolling window first drops below the limit.)
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
- **Hallucinated patches are an expected residual** — even with the v4 prompt's path-verification rules, large or polymorphic specs carry a low hallucination rate (worst case in the Epic 00 spike: 6.7% on PagerDuty). Epic 04 does NOT pre-validate `patchOps` against `Spec.currentJson`; that gate lives in Epic 06's `applyFindingAction` via `validatePatchOps`, which marks the finding `stale` before the user sees a broken apply. Persisting a finding whose `patchOps` will later fail validation is acceptable v0.1 behaviour.

## Open questions

- (resolved) The exact prompt text, output JSON schema (zod), persona, anti-pattern list — copy `scripts/spike/prompts/v4.ts` and `scripts/spike/schema.ts` verbatim per Spike-to-runtime file mapping at top of Scope.
- (resolved) `LLMCall.prompt` stores `{ systemPromptHash, systemPromptVersion, userPromptPreamble, specName, specSizeBytes, specEndpointCount }` — NOT the full spec body. The spec body is reconstructible via `specVersionId` joined to `SpecVersion.json`. Per Epic 00 results, full-body storage at scale would write 100s of MB/day per workspace.
- Should daily-limit count successful calls only or all attempts (including failures)? Recommendation: all attempts that actually hit OpenRouter (i.e. excluding rate-limit-blocked calls). Documented in implementation comment.
- Fire-and-forget `fetch` in a server action: on Vercel, the parent server action returns before the child fetch completes — the child must not be aborted by the parent's response. Verify the platform behaviour during implementation; if aborted, fall back to `waitUntil` or a queued job (Inngest in v0.2).
- Internal-API-secret rotation: a single env var is fine for v0.1. Multi-secret rotation is v0.2+ infra.
- (resolved) Spec's `info.title` and `info.description` are passed in-band as part of the dereferenced spec JSON (per `buildUserPrompt` in `scripts/spike/prompts/v4.ts`). The only out-of-band metadata is `Spec name: ${specName}` as the prompt preamble; everything else is the spec body verbatim. Token-saving by truncating very long `info.description` blocks (Stripe ships ~30 KB) is deferred to Epic 04 cost-tuning per research-spike.md Open Question 4.
- (resolved per `specs/ind-epic-review.md` Q4) Daily cost guardrail = **dollar-budget $10/24h per workspace**. Implementation: rolling-window SUM on `LLMCall.costUSD`. Threshold may be tuned in v0.2 based on production usage data.
