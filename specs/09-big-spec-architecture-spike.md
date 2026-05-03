# Epic 09 — Big-Spec Architecture Spike (S0)

> Phase 0 of the v1 launch — calibrate which LLM-pipeline architecture survives big real-world specs (>200 endpoints) before any v1 implementation epic runs. Equivalent of Epic 00's role for v0.1.
> Upstream: [`prd-launch.md`](../prd-launch.md) §4 "Spike Strategy" Phase 0, [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Spike & Conditional Epics".

## Scope

- Test **3 candidate architectures** for big-spec analysis against real public OpenAPI specs:
  - **(A) Bigger Context** — same single-call architecture as v0.1, but swap to a larger-context model (Sonnet long-context, Gemini 1.5 Pro 2M, or whatever is available via OpenRouter at spike time). Cost = high per call, simplest to integrate.
  - **(B) Naive Chunking** — partition the dereferenced spec by tag / path-prefix into N chunks, run the v0.1 single-call prompt per chunk, aggregate findings client-side (de-dup by `(endpointPath, endpointMethod, title)`). Cost = parallel-friendly, but loses cross-cutting findings.
  - **(C) Two-Call** — Haiku-per-endpoint micro-analysis (cheap, parallel) followed by Sonnet-on-the-aggregated-summaries for spec-level + cross-cutting findings. Cost = lowest per token, two-stage complexity.
- Source **3 real big specs** (>200 endpoints each), placed under `openapi-examples/`:
  - **Stripe FULL** — un-slice the existing `openapi-examples/stripe/` (587 ops at v0.1 source-pin). Same MIT license.
  - **GitHub REST API** — sourced from `github.com/github/rest-api-description` (1000+ ops). Verify license.
  - **PagerDuty FULL** — un-slice existing `openapi-examples/pagerduty/` (419 ops).
- Author one **manually-written reference target** for the chosen big-spec-calibration spec (likely Stripe full — pick at kickoff). Same finding-shape as Epic 00's `findings-target.md`.
- Extend the existing `scripts/spike/run-prompt.ts` harness to:
  - take an architecture variant (`bigger-context | chunking | two-call`) + spec-name
  - emit `specs/big-spec-runs/<arch>__<spec>.json` with per-arch metrics: token counts, costUSD, latencyMs, patch-apply-validation, findings-coverage-vs-reference-target, hallucination-count
  - support architecture (B) and (C) with reusable building blocks (chunker, aggregator, two-call dispatcher)
- Iterate on the winning architecture (best Pass Criteria score) until it locks. Document **trade-offs vs alternatives** in `specs/big-spec-architecture-spike.md`.
- Produce the **endpoint-cap recommendation**: at what spec size does even the winning architecture break down? This becomes the new launch-time `endpointCount` cap (replaces v0.1's 200).
- Output: `specs/big-spec-architecture-spike.md` (markdown decision doc, analogous to `specs/research-spike.md`) + harness reference impls in `scripts/spike/{chunker,two-call-dispatcher,architectures-runner}.ts`.

This epic produces **specs and reference artefacts**, plus extensions to the throwaway harness. It does **not** ship application code. Epic 18 (Live Preview) and Epics 14–16 may not start until this spike's Pass Criteria are met OR a hard fallback (200-endpoint cap) is locked in.

## Acceptance criteria

1. **3 big specs sourced** in `openapi-examples/` with own `README.md` per Epic 00's catalog convention. Endpoint counts documented; licenses verified (Stripe MIT, GitHub: verify, PagerDuty: existing "treated as public").
2. **Reference target** — `openapi-examples/stripe/reference/findings-target-big.md` (or whichever spec is chosen) with **20 manually-written findings** (mix of severity + category). Used to score architecture-coverage.
3. **Harness extension** — `scripts/spike/run-prompt.ts` accepts `--arch=bigger-context|chunking|two-call`, runs the architecture, writes per-run JSON to `specs/big-spec-runs/<arch>__<spec>.json` with the metrics block above.
4. **Pass criteria met** for the winning architecture on all 3 big specs:
   - ≥80% of LLM-emitted patches apply clean via `fast-json-patch` against the source spec
   - ≥60% reference-target coverage on the chosen-reference big-spec (lower bar than Epic 00's 70% — big-spec naturally has more total findings)
   - 0 hallucinated paths (every `op.path` references existing path or unambiguous `add`)
   - Cost per spec ≤ $0.50 (vs v0.1's ~$0.10 on small specs — 5× headroom acceptable)
   - Latency per spec ≤ 4 minutes p95 (UI implications: smart-loading-hints can cover this)
5. **`specs/big-spec-architecture-spike.md` exists** with:
   - all 3 architectures tested + pass-criteria-scores per spec
   - winning architecture identified + rationale + cost/latency profile
   - endpoint-cap recommendation (e.g., "≤1000 ops via Two-Call; reject above")
   - migration-plan from v0.1 single-call → v1 winning architecture (which files in `src/lib/analysis/` change, what the API to `runAnalysis` looks like)
   - cancel-decision: if Pass Criteria fail across all architectures → recommend reverting to 200-endpoint cap + adding Big-Spec-Disabled-State to UI (Epic 19's `/try` + Epic 27 landing-page-CTA gallery use small specs only)
6. **Cancel-cascade decision documented** at end of spike: "Spike S1 starten / abbrechen / vertagen v1.1" with reasoning. This decision drives whether `/spec_ind 10 capability-gap-spike "..."` runs next.
7. **`results.md` MUST end with a Trigger-Block** — copy-pastable next-command + checkbox-update for `LAUNCH-PROGRESS.md`. Format (mandatory):

   ```markdown
   ---

   ## Next action

   **Cancel-decision:** [STARTEN | ABBRECHEN | VERTAGEN-V1.1]

   **Reasoning:** <1–3 sentences>

   **If STARTEN — copy-paste this command:**

       /spec_ind 10 capability-gap-spike "Phase-1 spike per prd-launch.md §4 — capability-gap-generation against 3 reference specs (final pick: <name1>, <name2>, <name3>), ≥50% relevance pass-criteria. Spike-S0 winning architecture: <bigger-context|chunking|two-call>. Endpoint-cap raised to <N>. See specs/09-...-results.md for context."

   **If ABBRECHEN / VERTAGEN — update `LAUNCH-PROGRESS.md`:**

   - Mark Epic 09 `[x]` complete.
   - Mark Epic 10 → 13 `[skip]` (capability-gap deferred to v1.1).
   - Jump to `/dev specs/14-prelaunch-spec-fixes-export-hardening.md`.
   ```

   This block is the LAST thing in `results.md`, no closing paragraphs after. The intent: when the user reads results-md after `/dev` finishes, the next command is literally the last thing they see.

## Out of scope

- Phase-1+ spike content (S1 Capability-Gap, S2 Business-Improvements, S3 Implementation-Hints) — those have their own conditional epic specs derived later.
- Production application code, schema migrations, UI changes — all of that is the engineering-epic block (Epic 14+).
- Multi-call architectures beyond the three above (e.g. Map-Reduce, Tree-of-Thought) — defer unless the three above all fail.
- BYOK / multi-provider — spike uses one app-managed `OPENROUTER_API_KEY`.
- Re-bundling `$ref`s — spike operates on dereferenced JSON throughout, same as Epic 00.
- Integration into `runAnalysis` in app code — that's the migration-step in a follow-up Foundation epic (Epic 14 if scope allows, else dedicated patch).
- Capability-gap-generation prompt (S1 territory).

## Domain terms

- **Bigger-Context architecture** — single-call analysis using a model with larger context window than v0.1's Sonnet (≥500 K tokens).
- **Naive-Chunking architecture** — partition spec by tag or path-prefix, analyze each chunk with v0.1's single-call prompt, aggregate findings client-side.
- **Two-Call architecture** — Haiku-per-endpoint micro-analysis emits per-endpoint summaries; Sonnet-aggregator emits spec-level + cross-cutting findings from those summaries.
- **Endpoint-cap** — the maximum `endpointCount` above which apiq refuses to analyze (or warns "too big for v1").
- **Reference target (big-spec)** — manually-written 20-finding gold standard for the chosen big-spec, used to score architecture coverage.
- **Pass Criteria** — five thresholds in AC #4 that mark the spike as complete.

## Open questions

- Final pick for the chosen-reference big-spec (Stripe full likely; alt: GitHub if license clear) — locked at spike kickoff.
- Whether to also test a fourth architecture (Map-Reduce with chunked Sonnet → final-pass aggregator) if the three above all underperform — defer to in-spike decision.
- Whether the existing v0.1 prompt (`specs/research-spike.md` v4) survives unchanged in chunking/two-call architectures, or needs adaptation. Default hypothesis: chunking reuses v0.1 prompt verbatim per-chunk; two-call needs new prompts (per-endpoint + aggregator) and diverges from v0.1 architecture.
- Cost-cap during the spike itself — the spike will run dozens of architecture×spec combinations. Soft-cap $200 in OpenRouter spend across spike duration; hard-cap $400. Alarm at $150.
- Reference-target authorship effort — 20 findings × ~10 min each = ~3-4 hours. May extend spike total effort if pre-existing v0.1 reference can't be extended.
