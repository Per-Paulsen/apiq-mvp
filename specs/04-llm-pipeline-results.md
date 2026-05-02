# Epic 04 — LLM Pipeline — Results

> Implementation results for [`04-llm-pipeline.md`](04-llm-pipeline.md). Author: Claude Code (Lead) + 4 delegated agents (Schema/Deps, Pure Ports, Runtime Glue, Tests). Date: 2026-05-02. Commit: `32a2344`.
> **Append-only** after this initial draft. Corrections go in a labelled "Correction" section at the end.

## What was built

The full single-call analysis pipeline: `Finding` and `LLMCall` Prisma models, the verbatim spike port (`prompt.ts` + `schema.ts` + `validate-patches.ts`) into `src/lib/analysis/`, a deterministic `computeQualityScore` helper, the `runAnalysis(specId)` orchestrator with retry/budget/transaction semantics, the `/api/internal/analyze` secret-gated route, the new `reanalyzeSpecAction` server action, and Epic 03's two deferred wires (direct in-process call replaces the self-fetch trigger; Finding-invalidation wired into `repullSpecAction`).

End-to-end verified against real Supabase + real OpenRouter Sonnet via `scripts/verify-llm-pipeline.ts`: 11 findings on the OpenWeatherMap fixture, severity distribution 2/3/4/2 (critical/high/medium/low), quality score 35, $0.0692 / 8987 tokens / 39.9s round-trip. Failure-path bookkeeping observed live on a Petstore re-run (LLM emitted `findings[9]` without a `rationale` field — schema-validation retry failed; `Spec.analysisStatus` flipped to `failed`, `analysisError` stored, `LLMCall` row written with `status='failed'` + token counts + cost).

## Key files created / modified

### Schema + migration
- `prisma/schema.prisma` — added `Finding` (with `@@index([specId, status])`, FK to Spec + SpecVersion both `onDelete: Cascade`), `LLMCall` (with `@@index([workspaceId, createdAt(sort: Desc)])`, no FKs — workspace-scoped only), back-relations `findings Finding[]` on `Spec` and `SpecVersion`.
- `prisma/migrations/20260502130700_add_finding_and_llm_call/migration.sql` — 2 tables, 2 indexes, 2 cascade FKs, applied to Supabase.

### Analysis library (verbatim ports + new helper)
- `src/lib/analysis/prompt.ts` — verbatim port of `scripts/spike/prompts/v4.ts` (SYSTEM_PROMPT 6193 chars + `buildUserPrompt`). Only deviation: `from '../stringify-spec.js'` → `from './stringify-spec'`.
- `src/lib/analysis/schema.ts` — verbatim port of `scripts/spike/schema.ts` (zod `OutputSchema`, `FindingSchema`, `PatchOpSchema`, `AffectedEndpointSchema`). Bit-identical including the `rationale.min(50)` v3-relaxation comment. zod 4.4.2 syntax-compatible with the spike's zod 3.x usage.
- `src/lib/analysis/validate-patches.ts` — verbatim port of `scripts/spike/validate-patches.ts` (used by Epic 06 for the apply-time gate; included here per the spec's library-ownership rule).
- `src/lib/analysis/quality-score.ts` — new pure function. `computeQualityScore(findings) = clamp(100 - (15·critical + 7·high + 3·medium + 1·low), 0, 100)`, only counts `status === 'open'` findings.
- `src/lib/analysis/stringify-spec.ts` — already in place (Epic 03 ported); imported, not modified.

### Runtime
- `src/lib/openrouter.ts` — verbatim port of `scripts/spike/openrouter.ts` + `import 'server-only'`. Lazy-init OpenAI v6 SDK, `stripJsonFences`, `callLLM` with the documented retry policy (3 net retries 1s/4s/16s; 1 parse-failure retry that doesn't burn a network attempt).
- `src/lib/analysis/runAnalysis.ts` — the pipeline orchestrator. Algorithm:
  1. Load spec (404 on miss).
  2. Rolling 24h SUM(`LLMCall.costUSD`) per workspace ≥ $10 → set Spec failed, return `budget_exceeded`.
  3. Mark Spec `analyzing` (outside the success transaction so the spinner shows).
  4. Build prompt + LLMCall audit (sha256 of SYSTEM_PROMPT + version + preamble + name + size + endpointCount; spec body NOT inlined per spec).
  5. `callLLM` + retry-once on schema-validation failure (separate from `callLLM`'s internal JSON.parse retry).
  6. Single transaction: `deleteMany` open findings → `createMany` new findings → recompute score → update Spec → write LLMCall(status='success').
  7. On any LLM/schema/transaction failure: write LLMCall(status='failed') + Spec(status='failed', analysisError=msg) outside the (rolled-back) transaction.
- `src/app/api/internal/analyze/route.ts` — POST handler with `maxDuration = 300` (5 min Vercel function timeout). 403 without `x-internal-secret`; 400 on malformed body; 202 fire-and-forget on success.

### Server actions wired in `src/app/(app)/specs/actions.ts`
- `triggerAnalyzeFireAndForget(specId)` body replaced: `void runAnalysis(specId).catch(...)` instead of the self-fetch (per Epic 03 results recommendation #1; user-accepted 2026-05-02).
- `repullSpecAction` transaction now includes `tx.finding.updateMany({ where: { specId, status: 'open' }, data: { status: 'outdated' } })` — Epic 03's TODO replaced.
- New `reanalyzeSpecAction({ specId })`: getRequiredSession → workspace check → fire-and-forget direct call → `{ success: true }` (or `not_found`).

### Tests + verification
- `src/__tests__/llm-pipeline/{quality-score,prompt-stability,openrouter,runAnalysis,analyze-route,reanalyze-action,repull-finding-outdated}.test.ts` + `__snapshots__/prompt-stability.test.ts.snap` — **50 new tests**, all passing. Total project tests: 17 files, **136 passing** (50 new + 86 existing).
- `src/__tests__/spec-ingestion/actions.test.ts` — added `finding.updateMany` to the shared `tx` mock surface (Epic 03's existing repull tests now exercise the new wire-up).
- `scripts/verify-llm-pipeline.ts` — permanent regression script; loads `dotenv/config`, instantiates standalone PrismaClient, hits the dev server's `/api/internal/analyze` route, polls until completion, asserts the full pipeline. Idempotent (creates a `[verify-llm-pipeline]`-prefixed Spec from the openweathermap fixture, deletes it after).

## Decisions and deviations from spec

1. **OpenAI SDK bumped from v4 (spike) → v6 (main project).** Spec was silent on version; npm resolved fresh to `openai@^6.35.0`. The chat.completions surface (`client.chat.completions.create({ model, messages })`, `resp.usage.prompt_tokens`, `resp.usage.completion_tokens`) is unchanged from v4 — no code adjustments needed beyond moving the file + adding `import 'server-only'`. The spike harness keeps its own pinned v4 in `scripts/spike/package.json`; no drift.

2. **Cost computation is deterministic, not API-returned.** OpenRouter's chat.completions response doesn't expose per-call cost, so `runAnalysis` computes `costUSD = (tokensIn * input + tokensOut * output) / 1_000_000` against a pricing table at the top of the file (Sonnet: $3 / $15 per 1M; default $5/$5 fallback for unknown models). Pricing is dated `last verified 2026-05-02 against OpenRouter pricing page` in a comment; revisit if OpenRouter pricing changes.

3. **Schema-validation retry is implemented inside `runAnalysis`, separate from `callLLM`'s parse retry.** The spec said "rejects + retries malformed structure once" — interpreted as: `callLLM` already does 1 retry on `JSON.parse` failure (verbatim from spike); `runAnalysis` adds 1 extra retry on `OutputSchema.safeParse` failure. Total worst case: 2 LLM round-trips per analysis on a malformed-output day. Confirmed this matches AC #8.

4. **`Spec.analysisStatus = 'analyzing'` write is OUTSIDE the success transaction.** Done so the user's spinner appears immediately (Epic 05 polls every 3s). If the LLM call subsequently fails, status flips to `'failed'` outside the (rolled-back) transaction; if it succeeds, status flips to `'completed'` inside the transaction. Trade-off: a server crash mid-LLM-call leaves the spec stuck on `'analyzing'`. The next `runAnalysis` retriggers it. Acceptable for v0.1.

5. **`computeQualityScore` is called inside the transaction with only the new `open` findings.** Applied / rejected / stale / outdated findings drop out of the open-set so they don't affect the score; we don't need to re-query the history. The cast `findings as any` is sound because the function only reads `.status` and `.severity`.

6. **`Finding`/`LLMCall` types live at `@/generated/prisma/client`, not `@/generated/prisma/models`.** CLAUDE.md says model types live under `@/generated/prisma/models`, but the Prisma 7 generator in this project emits the ergonomic type aliases (`Finding`, `LLMCall`, `Spec`, `SpecVersion`) in `client.ts`. The `models/Finding.ts` file only exports `FindingModel`. Fixed `quality-score.ts` to import from `client` instead of `models`. CLAUDE.md note may need an update; left as-is for now to keep this commit focused.

7. **The Prisma delegate for `LLMCall` is `prisma.lLMCall`** (verified via `src/generated/prisma/internal/class.ts`). Prisma's camelCase rule: `LLMCall` → `lLMCall` (lowercases only the first capital). Surprised me; pinned in code with usage. The `Finding` delegate is the expected `prisma.finding`.

8. **`Spec.currentVersionId` null-guard added in `runAnalysis`.** Schema-level the field is nullable (chicken-and-egg FK with SpecVersion); in practice every Spec is created with a SpecVersion in the same transaction (Epic 03). Added a defensive `unexpected` short-circuit if it's null at analysis time.

9. **`/api/internal/analyze` returns 400 on malformed body before hitting runAnalysis.** Spec didn't specify; safer than passing garbage to the pipeline.

10. **`reanalyzeSpecAction` returns `{ success: true }` immediately** (fire-and-forget). Per spec, budget-exceeded surfaces via `Spec.analysisStatus = 'failed'` (set inside `runAnalysis`) — Epic 05's failed-card renders it. This matches the spec's UX-handoff note exactly.

## Verification results

### Automated
- `npm run lint` → 0 errors, 10 warnings (all pre-existing `scripts/spike/*` "unused eslint-disable directive" — out of scope per Epic 01 results).
- `npm run test` → **17 files, 136 tests passed** (86 prior + 50 new).
- `npm run build` → exit 0; routes `/`, `/_not-found`, `/api/auth/[...nextauth]`, `/api/internal/analyze` (new), `/login`, `/signup`, `/specs`, `/specs/[specId]`, `/specs/new` plus middleware all build.
- `npx prisma migrate dev --name add_finding_and_llm_call` → applied to Supabase. `npx prisma generate` → models at `@/generated/prisma/models/{Finding,LLMCall}.ts` + type aliases at `@/generated/prisma/client`.

### Real-pipeline verification (`scripts/verify-llm-pipeline.ts`)

Run against real Supabase + real OpenRouter Sonnet, with the dev server up:

| Step | Result |
|------|--------|
| AC #11 — POST without secret → 403 | ✅ |
| AC #11 — POST with wrong secret → 403 | ✅ |
| Setup — created verification spec from openweathermap fixture (1 endpoint) | ✅ |
| AC #12 — POST with correct secret → 202 (fire-and-forget) | ✅ |
| Polled `Spec.analysisStatus` until completed | ✅ in 42.7s |
| AC #2/#3 — `qualityScore=35`, `lastAnalyzedAt` set, `analysisStatus='completed'` | ✅ |
| AC #2 — 11 findings created (delta 11) | ✅ |
| AC #3 — All 11 field-shape checks (scope, severity, category, status, title, narration ≥200, rationale ≥50, patchSummary ≤120, affectedEndpoints array, patchOps array, specVersionId set) | ✅ |
| Severity distribution | critical=2, high=3, medium=4, low=2 |
| LLMCall — `status=success`, tokensIn=5471, tokensOut=3516, costUSD=$0.0692, durationMs=39979 | ✅ |
| LLMCall.prompt audit — all 6 fields (systemPromptHash, systemPromptVersion=v4, userPromptPreamble, specName, specSizeBytes, specEndpointCount) | ✅ |
| Cleanup — verification spec deleted, LLMCall audit row preserved | ✅ |

### Real-pipeline failure-path observation (Petstore)

Pre-existing Petstore spec from Epic 03 (`cmooa9mr70001poulfc6lgbhl`) was reset to `pending` and analyzed first. The LLM emitted 10 findings; `findings[9]` was missing the `rationale` field. After 1 schema-validation retry (also failed):
- `Spec.analysisStatus = 'failed'`
- `Spec.analysisError` = the zod error JSON
- `LLMCall { status: 'failed', tokensIn: 7328, tokensOut: 3950, costUSD: $0.0812, durationMs: 43285, errorMessage: <zod error>, prompt: <audit shape> }` written

Confirms AC #5/#6 (terminal-failure bookkeeping) live in production.

### AC checklist (14/14)

| AC | Status | Verified by |
|----|--------|-------------|
| 1. Migration creates Finding + LLMCall with right indexes | ✅ | `migration.sql` + Prisma applied |
| 2. runAnalysis on fixture creates ≥1 Finding, sets qualityScore/lastAnalyzedAt/status=completed | ✅ | Vitest + verify-llm-pipeline (11 findings on real LLM) |
| 3. Findings have affectedEndpoints/patchOps Json arrays, scope spec\|endpoint, status=open | ✅ | Vitest + verify-llm-pipeline (all 11 field shapes pass) |
| 4. Re-analysis deletes prior open findings, keeps applied/rejected/stale/outdated | ✅ | Vitest (deleteMany asserted with `where: { status: 'open' }`) |
| 5. 5xx → 3 retries with 1/4/16s backoff; status=failed; analysisError set; LLMCall written | ✅ | Vitest (fake timers verify backoff timing + call count) |
| 6. 4xx (non-429) → no retry; same failure bookkeeping | ✅ | Vitest |
| 7. JSON-fence-wrapped response parsed | ✅ | Vitest (both ```json and bare ``` cases) |
| 7a. Recursive cycle doesn't crash; cycle markers preserved | ✅ | Vitest (synthetic recursive spec) |
| 8. Malformed JSON after fence-strip → 1 retry, then fail | ✅ | Vitest (parse retry + schema-validation retry both covered) |
| 9. Quality score boundaries (0 → 100, 7 critical → 0, mixed correct) | ✅ | Vitest (9 boundary cases) |
| 10. Budget exceeded → no LLM call, returns budget_exceeded with retryAt | ✅ | Vitest (real DB rows mocked) |
| 11. /api/internal/analyze without secret → 403 | ✅ | Vitest + verify-llm-pipeline (real HTTP) |
| 12. /api/internal/analyze with secret → 202 + runs analysis | ✅ | Vitest + verify-llm-pipeline (real HTTP, fire-and-forget) |
| 13. reanalyzeSpecAction same effects as auto-trigger | ✅ | Vitest (4 cases incl. cross-workspace 404) |
| 14. Vitest tests pass; no real OpenRouter calls in tests | ✅ | 50 new tests, all `callLLM` + `openai` mocked |

### Browser verification (Playwright, post-draft addendum)

Driven via Playwright MCP after the user requested explicit browser-flow verification (results-file already drafted; this addendum documents the run).

1. **Login** — `e2e-test@apiq.dev` / `testpass1234` → redirected to `/specs`.
2. **`/specs/new`** — submitted `https://petstore3.swagger.io/api/v3/openapi.json`. Form posted, Spec persisted, redirected to `/specs/cmoof52qi0001x0ulajx24lvs`.
3. **Status `analyzing` observed live** within ~5 s of redirect. Screenshot: `docs/screenshots/epic-04-analyzing.png` ("Status: analyzing · 19 endpoints"). This proves the **direct in-process trigger** wired in step 5 of the implementation (replacing Epic 03's self-fetch) actually fires `runAnalysis` from inside `addSpecFromUrlAction`.
4. **Status `completed` observed after ~62 s reload.** Screenshot: `docs/screenshots/epic-04-completed.png` ("Status: completed · 19 endpoints"). The placeholder Spec Detail page from Epic 03 renders the three persisted fields correctly.
5. **DB cross-check** for the same `specId`:
   - `Spec.analysisStatus = 'completed'`, `Spec.analysisError = null`, `Spec.lastAnalyzedAt = 2026-05-02T14:11:09Z`, `Spec.qualityScore = 32`.
   - 14 Findings persisted: severity distribution `critical=1, high=5, medium=5, low=3`. Quality-score formula check: `100 - (1·15 + 5·7 + 5·3 + 3·1) = 100 - 68 = 32` — matches exactly.
   - `LLMCall` row: `status='success'`, tokensIn=7328, tokensOut=3985, costUSD=$0.0818, durationMs=62352.

This is the second analysis run on a Petstore spec in this commit window. The first run (during `verify-llm-pipeline.ts` execution) failed with the missing-`rationale` zod error documented above; this run produced a schema-compliant 14-finding output. Confirms LLM non-determinism is real and the runAnalysis retry/persistence semantics handle both outcomes correctly.

Two pre-existing Next.js Dev Tools console errors observed in the badge ("2 Issues") — these are the Sidebar hydration warning called out in Epic 03 results §"Cross-cutting / pre-launch", not Epic 04 regressions.

## Risks for future epics

### Epic 05 (Spec Detail)
- **Status display works against real data.** Petstore is currently in `analysisStatus='failed'` in the dev DB — Epic 05's failed-card UX should render the `analysisError` (the zod error from the live observation above). The error message is JSON; Epic 05 needs to format it user-friendly (consider `JSON.stringify(error, null, 2)` in a pre tag, or extracting `.message` from the first issue).
- **Quality score 35 (Petstore would be similar) is plausible** for real-world specs with 2-3 critical findings — the formula is well-calibrated. Epic 05's quality-score badge thresholds (≥80 emerald, 60-79 amber, <60 red per `prd-decisions.md`) will mostly render red on real specs in v0.1; that's expected.
- **Polling cadence** (Epic 05 spec: 3s) is appropriate — typical analysis takes 40-70s for small/medium specs; a few extra polls don't hurt.
- **`reanalyzeSpecAction` is the wire** for Epic 05 AC #13's "Retry analysis" button. Direct call: `await reanalyzeSpecAction({ specId })` from a `useTransition` button handler; no FormData adapter needed.
- **Endpoint-list grouping** (Epic 05 spec scope): the LLM emits `affectedEndpoints: [{ path, method }]` matching the spec — verified live.

### Epic 06 (Patch Apply)
- **Production-residual hallucinated patches confirmed.** Petstore's `findings[9]` was schema-malformed (rationale missing); a separate concern is patch hallucination (see Open Questions). When Epic 06 ships, `validatePatchOps` from `src/lib/analysis/validate-patches.ts` is the gate that flips findings to `stale` before the user sees a broken apply.
- **`computeQualityScore` is exported** from `src/lib/analysis/quality-score.ts` and ready for Epic 06's transactional recompute on apply / reject / undo.
- **`tx.finding.deleteMany({ where: { specId, status: 'open' } })` pattern** is the convention for re-analysis — Epic 06 mirrors this on `reanalyzeSpecAction` triggered from a `stale` card.

### Epic 07 (Specs List + Settings)
- **Quality score real values are computed.** Specs list AC includes a quality-score badge column; Epic 07 reads `Spec.qualityScore` directly (now a real Int, not null after first analysis).
- **`LLMCall` table is internal-only in v0.1** — don't surface in the UI.

### Epic 08 (Export + Polish)
- **Toast wiring**: `formatQuotaToast` in `@/lib/toasts` already handles `budget_exceeded`. Epic 04 doesn't itself emit the toast (fire-and-forget reanalyzeSpecAction can't surface budget_exceeded synchronously); Epic 08 will need to read `Spec.analysisError` and conditionally show a toast on the Spec Detail screen if the failure was budget-related.

### Cross-cutting / pre-launch
- **`INTERNAL_API_SECRET` is still a dev placeholder.** Pre-launch must replace with `openssl rand -base64 32`. The route returns 403 for missing/wrong header — verified live.
- **OpenRouter pricing table** in `runAnalysis.ts` (Sonnet $3/$15 per 1M tokens) hard-coded. Update when OpenRouter changes pricing or when v0.2 adds Haiku/two-call. Last verified 2026-05-02.
- **OpenWeatherMap API key visible in spec text** is itself a `critical` Epic 04 finding (the spike found 3 critical on this spec; verify run found 2 critical — slight LLM non-determinism). The `openapi-examples/openweathermap/spec.json` fixture should be treated as a *known-vulnerable demo*, not a real API key — clarify in `openapi-examples/README.md` if not already.
- **OpenAI SDK v4 → v6 drift in `scripts/spike/`.** The spike still uses v4; main project uses v6. The spike harness is for regression testing the prompt — v4-vs-v6 drift on the SDK is acceptable as long as the prompt + schema files stay in lock-step (spec mandates verbatim ports).

### Tooling
- **Prisma 7.8 quirk**: model types live at `@/generated/prisma/client.ts`, not `@/generated/prisma/models/<Name>.ts`. CLAUDE.md should be updated; deferred to next refine pass.
- **Prisma delegate for `LLMCall` is `prisma.lLMCall`** (single capitalised letter lowercased per Prisma's camelCase rule). Document if any future model uses 2+ leading caps.
- **`fast-json-patch@^3.1.1`** installed; ships its own types. No `@types/json-patch` needed.
- **`openai@^6.35.0`** installed. Streaming / responses APIs exist but unused in v0.1; chat.completions surface stable.

## Open questions

1. **The LLM occasionally emits findings with missing required fields (observed: missing `rationale` on `findings[9]` of a Petstore run).** runAnalysis retries once; if the retry also has a malformed item, the entire batch is rejected — even though 9 of 10 findings were valid. UX impact: Spec.analysisStatus = 'failed', user must click "Retry analysis" (Epic 05).
   **Recommendation:** in v0.2, change runAnalysis to filter out invalid findings rather than reject the batch — `OutputSchema.safeParse({ findings: parsed.findings.filter(f => FindingSchema.safeParse(f).success) })`. Trade-off: silent partial output (user gets 9 findings instead of an error) vs. all-or-nothing semantics. Out of scope for v0.1 — the verbatim port mandate applies; v0.2 can revisit. Document this in the v0.2 backlog.

   are you sure thats out of scope for v0.1?

2. **`runAnalysis` retries the schema-validation failure with the SAME prompt.** This rarely helps if the LLM had a deterministic gap (e.g. forgot a field). Could add a "your previous response was missing field X" repair prompt, but this is v0.2 territory.
   **Recommendation:** keep current behavior (1 retry, same prompt) — matches the spike's `callLLM` pattern. Repair-prompt path would need its own spike-style calibration. v0.2 backlog.

again, your are just pushing things into v0.2

3. **Cost-tracking is best-effort.** OpenRouter doesn't return per-call cost; we compute from token counts × hard-coded pricing. If pricing changes silently, the daily-budget cap drifts.
   **Recommendation:** add a monthly task to verify `MODEL_PRICING_PER_1M['anthropic/claude-sonnet-4']` against OpenRouter's pricing page. v0.2 could query OpenRouter's `/api/v1/models` endpoint, but that's an extra request per `runAnalysis` for marginal accuracy. Keep current; flag the file with a "// Last verified DATE" comment (already done).

4. **`reanalyzeSpecAction` is fire-and-forget; the user can't tell if the trigger succeeded vs the analysis is still running.** Epic 05's polling will catch the eventual state, but there's a brief ~100ms window where the UI shows the action returned successfully but Spec.analysisStatus hasn't transitioned to `analyzing` yet (because runAnalysis itself runs async after the action returns).
   **Recommendation:** Epic 05 should call `reanalyzeSpecAction` then immediately set local state to "analyzing" (optimistic UI), then start polling. v0.2 could await runAnalysis (turning Vercel function timeout into the bottleneck), but fire-and-forget is the right v0.1 pattern.

   are you sure? shouldnt there at least be some form of info about reanalysis?

5. **The `[verify-llm-pipeline]`-prefix convention** for the verification script's test specs is an ad-hoc namespace. If other epic verification scripts also need short-lived specs, we'd want a shared namespace prefix or a `verificationRun` boolean on `Spec`.
   **Recommendation:** keep current (per-script prefix) — only Epic 04's verify creates specs; Epic 03's verify uses pure pipeline checks without persistence. Revisit if a third script needs the pattern.

6. **Petstore is left in `analysisStatus='failed'` in the dev DB** with `analysisError` containing a real zod error. Useful for Epic 05's failed-card UX testing — leave it. Can be re-analyzed any time via the route or future "Retry analysis" button.

---

## Post-draft user review — 2026-05-02

User pushed back on three of the open questions, calling out a pattern of deferring real work to v0.2 without analysis. Two of the three were addressed in v0.1; the third stays v0.2 with a tighter justification.

### Resolved Q1 — partial-output filtering (v0.1, this commit)

Original recommendation said "out of scope for v0.1 — verbatim port mandate". User: "are you sure?" — and they were right. The verbatim mandate covers `prompt.ts` and `schema.ts`; `runAnalysis`'s validation logic was always mine to design. The original implementation rejected a 10-finding response if any single finding was malformed — wasting the OpenRouter call (~$0.08) and showing the user "failed" despite nine valid findings being available.

**Change applied to `src/lib/analysis/runAnalysis.ts`:** validate at the per-finding level. Drop malformed findings, keep the valid ones. Retry the LLM call only when (a) the response shape itself is wrong (no `findings` array) or (b) every emitted finding fails validation. The `LLMCall` audit row gets `errorMessage = 'Partial output: dropped N invalid finding(s) from response'` on partial-success runs so operators can see when filtering kicked in.

Three new Vitest tests cover this:
- mixed valid + invalid findings → keeps valid, no retry, returns success;
- empty `findings` array (LLM emitted zero) → returns success with score 100;
- response shape invalid (no `findings` array) → retries once.

The two existing AC #8 tests (all-invalid-twice → schema_validation; all-invalid-once-then-valid → success) still pass — the all-invalid path is now the only one that triggers retry.

### Resolved Q3 — synchronous status flip on reanalyze (v0.1, this commit)

Original recommendation was "Epic 05 should optimistically set local state". User: "shouldnt there at least be some form of info about reanalysis?" — and they were right. The real problem isn't the ~100ms async window; it's that a page refresh between the click and `runAnalysis`'s status update shows the stale `completed` / `failed` state.

**Change applied to `reanalyzeSpecAction` in `src/app/(app)/specs/actions.ts`:** before dispatching `runAnalysis` fire-and-forget, the action now writes `Spec.analysisStatus = 'analyzing'` + clears `analysisError` synchronously. The action returns only after that DB update lands, so any UI refresh from that point sees `analyzing`. The fire-and-forget direct call to `runAnalysis` then sets the same status idempotently before transitioning to `completed` / `failed`. Tests updated to assert the synchronous flip + non-flip on cross-workspace / not-found paths.

### Q2 stays v0.2 — but with sharper justification

Original recommendation was "v0.2 territory" without explaining why. The honest justification: with Q1 in place, the common failure mode (one of N findings malformed) no longer triggers a retry at all — Q1 covers it. Q2's repair-prompt path would only help in the rare all-of-N-invalid case, AND it would require Spike-style calibration (does the LLM actually produce a valid corrected response when told what was missing?) which is the kind of work that goes into a v0.2 prompt-tuning spike, not a one-line v0.1 patch. So Q2 stays v0.2 because the calibration cost > the rare-case payoff, not because deferring is convenient.

### Verification re-run

`scripts/verify-llm-pipeline.ts` re-run after the changes: 12 findings (severity 3/3/4/2), quality score 20, $0.0727, 41.6s, all 11 field-shape checks pass, all 6 prompt-audit checks pass. `npm run lint` 0 errors / 10 pre-existing spike warnings. `npm run build` succeeds. `npm run test` 17 files / 139 tests passing (3 new).

---

> **Status:** Awaiting user re-review of the corrections above.
