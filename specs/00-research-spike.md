# Epic 00 — Research Spike

> Phase 0 of the apiq MVP. Iterates on the LLM analysis approach against real OpenAPI specs **before** any implementation epic runs. Equivalent of ExpliqAI's Phase 0 spike.
> Upstream: [`prd.md`](../prd.md) §"Phase 0 — Research Spike", brainstorming Sektion H.

## Scope

- Curate a set of **4 real-world public OpenAPI specs** in `openapi-examples/`. No synthetic specs, no `petstore`-style fixtures.
- Author one **manually-written reference target** ("what good looks like" findings document) for one of the curated specs.
- Build a minimal **standalone TypeScript script** (`scripts/spike/run-prompt.ts`) that runs prompt iterations against the curated specs, validates patches, and emits structured run results.
- Iterate on the **system prompt**, **output JSON schema**, **persona**, **anti-patterns**, **patch reliability**, **severity calibration**, and **category boundaries** until the pass criteria are met.
- Produce `specs/research-spike.md` with the final proven prompt, output schema, and decisions — to be consumed by Epic 04.

This epic produces **specs and reference artefacts**, plus a throwaway-grade harness script. It does **not** ship application code or database schema.

## Acceptance criteria

1. **Curated sample specs.** `openapi-examples/` contains exactly 4 specs in 4 sub-folders, each with a `README.md` describing source, license, and rough endpoint count:
   - `openweathermap/` — small, well-known, used as the reference-target spec
   - `stripe/` — sliced to ≤200 endpoints, "what good looks like" reference
   - `pagerduty/` — mid-sized, real-world product API
   - one APIs.guru spec representing genuine messiness (final pick documented in `research-spike.md`)
2. **Reference target findings document.** `openapi-examples/openweathermap/reference/findings-target.md` exists with **15 manually-written findings** (3 critical, 5 high, 5 medium, 2 low; all three categories represented). Each finding uses the same fields the LLM is asked to emit (`title`, `narration`, `rationale`, `category`, `severity`, `affectedEndpoints`, `patchOps`, `patchSummary`, `scope`).
3. **Spike harness script.** `scripts/spike/run-prompt.ts` exists and is executable via `npx tsx`. It:
   - takes a prompt-variant ID and a sample-spec name as input
   - calls OpenRouter Sonnet via the OpenAI SDK
   - writes the structured findings, token counts, costUSD, durationMs, and a patch-apply validation report (per finding: applies cleanly / hallucinated path / patch error) to `specs/research-spike-runs/<variant-id>__<spec-name>.json`
4. **Pass criteria met** for the final prompt variant on all 4 sample specs:
   - ≥80% of LLM-emitted patches apply without conflict via `fast-json-patch` against the source spec
   - ≥70% coverage on the OpenWeatherMap reference target (manual mapping per title-similarity + endpoint-match, documented in `research-spike.md`)
   - 0 hallucinated paths across all 4 specs (every `op.path` references an existing path, or is unambiguously an `add` of a new path)
   - Lead approves narrations qualitatively as "engineering-grade, not Spectral-style"
5. **`specs/research-spike.md` exists** and contains:
   - prompt variants tried, with brief notes on what changed and why
   - the final proven system prompt (full text)
   - the final proven output JSON schema (TypeScript-style or JSON Schema, ready to consume in Epic 04)
   - persona definition
   - anti-patterns list (false confidence, hallucinated paths, generic advice without grounding, …)
   - patch-reliability checklist (every patch op references an existing path or a clearly derivable new one)
   - severity calibration notes (what counts as `critical` vs `high`)
   - single-call vs two-call decision (with size threshold if two-call) — note that PRD pre-commits to single-call for v0.1
   - link to the run results and reference target

## Out of scope

- Application code, database schema, UI, auth, LLM client integration into the Next.js app — all of that is Epic 01–08.
- Vitest test suite for the prompt — iteration speed matters, the harness writes JSON; tests come in v0.2 (or in the implementation epics where stable behaviour is needed).
- BYOK / multi-provider — spike uses one app-managed `OPENROUTER_API_KEY`.
- Quality-score formula — that is deterministic and decided in Epic 04 (not prompt-dependent), see brainstorming C2.
- Re-bundling of `$ref`s in patches — patches operate on the dereferenced JSON throughout the spike.
- Two-call architecture exploration — single-call is committed for v0.1; the spike notes the size threshold at which two-call would become necessary, but does not implement two-call.
- Any spec not in the four-spec shortlist (Twilio, GitHub, etc. are explicitly excluded to keep the spike scoped — the four-spec set is sufficient calibration surface).

## Domain terms

- **Research spike / Phase 0 spike** — pre-implementation iteration to prove out the LLM analysis approach on real specs.
- **Reference target** — a hand-written "gold standard" findings document used as the calibration baseline for one chosen spec.
- **Prompt variant** — a labelled iteration of the system prompt + output schema, tracked by ID in run results.
- **Patch apply / hallucinated path** — a JSON Patch op whose `path` does not exist in the source spec and is not a deliberate `add` of a new path.
- **Pass criteria** — the four numeric and qualitative thresholds that mark the spike as complete (acceptance criterion 4).
- **Apply-clean patch** — a JSON Patch operation that, run via `fast-json-patch.applyOperation`, produces no error and a valid OpenAPI document.

## Open questions

- Final pick for the APIs.guru "messy" spec — to be locked in during spike kickoff and documented in `research-spike.md` Section "Sample selection".
- Token-budget headroom for OpenWeatherMap-sized specs vs Stripe-slice-sized specs at single-call: measured in the first spike run, used to confirm or revise the 200-endpoint cap from brainstorming A1 / B4.
- Whether `narration` and `rationale` collapse into a single field — open to spike findings; default hypothesis from PRD-schema is they stay separate.
- Whether `scope: 'spec' | 'endpoint'` is sufficient or a third value (e.g. `'global'` for cross-cutting ops issues) is needed — defer to first spike run on Stripe slice.
