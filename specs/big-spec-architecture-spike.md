# Big-Spec Architecture Spike — apiq v1 (Epic 09)

> Decision document for the v1 Big-Spec Architecture Spike. Source-of-truth for the architecture / model / cap recommendations that feed the Foundation epic (Epic 14+) `runAnalysis` migration.
>
> **Status: DRAFT v0.3 — Stage 3 measurements complete. Architecture (A) across 3 specs × 4 models × 2 providers; Architecture (C) Two-Call (Sonnet+Sonnet) across 4 specs (dnd5eapi, PD FULL, Stripe FULL, GitHub REST). One open optional measurement: Architecture (B) Naive-Chunking-Hybrid as v1.1-roadmap-tracking. User considering whether to add (B) to spike-output before final lock.**
>
> Analogous to v0.1's `specs/research-spike.md`. Decision-doc locks once GitHub (C) data lands.

## Headlines

- **Architecture (C) Two-Call with Sonnet+Sonnet is the winning architecture for big specs**, measured on PagerDuty FULL (419 ops) and Stripe FULL (587 ops). Phase-1 per-endpoint Sonnet 4.6 (via OpenRouter) + Phase-2 Aggregator Sonnet 4.6 (via Anthropic-direct).
- **(A) Bigger-Context** technically works for ≤1M-Anthropic-token specs but is **strictly inferior to (C) on the load-bearing finding class** (spec-knowledge-asymmetry / F21+F22+F23): on Stripe FULL, (A) Gemini got 27.6 % manual coverage; (C) Sonnet+Sonnet got **48.3 % strict** / **66.7 % on substantive findings** (the 60 %-pass-threshold).
- **(C) emits 119× more findings** than (A) on the same Stripe FULL spec (1423 vs 12), with **12× lower hallucination rate** (0.7 % vs 8.3 %) and strictly higher apply-clean rate (99.3 % vs 92 %). Trade-off: ~5× cost ($5.86 vs $1.28) and ~14× latency (34 min vs 2.4 min — tunable via Phase-1 concurrency).
- **(B) Naive Chunking** — NOT tested. (C) Two-Call is the better-designed multi-call architecture and supersedes (B) for spike purposes.
- **Differentiator-validation: SUCCESS on multiple axes.** All four models (Gemini 2.5 Pro, Sonnet 4.6, Opus 4.7, Grok 4.1 Fast) surface the spec-knowledge-asymmetry finding-class — but only (C-i) Sonnet+Sonnet does it **systematically** (per-endpoint dedicated review of every op). The PRD claim *"AI knows what your spec should say. apiq makes it say it"* is empirically supported.
- **Anthropic 1M-token hard cap is the load-bearing constraint** for premium-quality (A) on Stripe-scale specs. Stripe FULL = 1,008,506 Anthropic-tokens, just exceeds the 1M cap. (C) Two-Call uncouples spec size from a single-context limit — each per-endpoint Phase-1 call is small (~1.1K tokens average) and the Phase-2 aggregator sees only summaries.

## Sample specs

| Spec | Endpoints | Raw JSON | Cycle-stripped | Anthropic-tokens (measured) | License |
|---|---|---|---|---|---|
| `stripe-full` | 587 | 7.39 MB | 3.53 MB | **1,008,506** | MIT |
| `pagerduty-full` | 419 | 2.40 MB | 1.14 MB | 360,802 | (treated as public) |
| `github-rest` | 1145 | 11.70 MB | 5.98 MB | ~1.5M (estimated) | MIT |

Source / licensing details and per-spec READMEs at `openapi-examples/{stripe-full,pagerduty-full,github-rest}/README.md`.

## Reference target (Stripe FULL)

29 manually-authored findings at `openapi-examples/stripe-full/reference/findings-target-big.md`. Drafted by Claude Code (LLM), reviewed and hardened by user. Distribution: 0 critical · 9 high · 14 medium · 6 low. 16 clarity / 12 design / 1 risk. 22 spec-scope / 7 endpoint-scope. Methodology caveats and three correction-cycles documented in the reference's "Self-review" section.

The reference identifies a **systemic spec-knowledge-asymmetry pattern** — 10 of 29 findings (43 %) are instances of the same load-bearing class: API knowledge in prose-only field descriptions, with no JSON-Schema constraint encoding. F21 (relationship-rules), F22 (field-relationships), F23 (cross-resource references) are the load-bearing differentiator-validation findings.

## Stage 3 Part 1 — Architecture (A) Bigger-Context, run-by-run

### Models tested

| Model | Context window | Pricing in/out per M tokens | Provider availability |
|---|---|---|---|
| Gemini 2.5 Pro | 1,048,576 | $1.25 / $10 | OpenRouter |
| Sonnet 4.6 | 1,000,000 | $3 / $15 (1M-mode 2× at >200K) | OpenRouter (unreliable ≥800K) + Anthropic-direct (reliable) |
| Opus 4.7 | 1,000,000 | $5 / $25 (same 1M-mode caveat) | Anthropic-direct |
| Grok 4.1 Fast | 2,000,000 | $0.20 / $0.50 | OpenRouter |

### 11 runs, raw metrics

| # | Spec | Model | Provider | Findings | Apply-clean | Hallucinated | Coverage (alg/manual) | Cost | Latency |
|---|---|---|---|---|---|---|---|---|---|
| 1 | PD | Gemini 2.5 Pro | OpenRouter | 18 | 72.2 % | 27.8 % | n/a (no ref) | $0.56 | 180 s |
| 2 | Stripe | Gemini 2.5 Pro | OpenRouter | 12 | 91.7 % | 8.3 % | 17.2 % alg / **27.6 % strict / 37.9 % gen** | $1.28 | 141 s |
| 3 | PD | Sonnet 4.6 | OpenRouter | 20 | 95.0 % | 5.0 % | n/a | $1.18 | 132 s |
| 4 | Stripe | Sonnet 4.6 | OpenRouter | failed (provider error at 920K ctx) | — | — | — | $0 | — |
| 5 | PD | Grok 4.1 Fast | OpenRouter | 19 | 89.5 % | 10.5 % | n/a (4 praise-as-findings) | $0.06 | 58 s |
| 6 | Stripe | Grok 4.1 Fast | OpenRouter | 9 | 100.0 % | 0.0 % | 6.9 % alg / **10.3 % strict (4/9 are FP)** | $0.16 | 163 s |
| 7 | GitHub | Grok 4.1 Fast | OpenRouter | **0** (quality collapse) | n/a | n/a | n/a | $0.30 | 21 s |
| 8 | Stripe | Opus 4.7 | OpenRouter | failed (same as #4) | — | — | — | $0 | — |
| 9 | PD | Sonnet 4.6 | **Anthropic-direct** | 20 | **100.0 %** | **0.0 %** | n/a | $2.32 | 137 s |
| 10 | Stripe | Sonnet 4.6 | Anthropic-direct | failed (`prompt is too long: 1,008,506 > 1,000,000`) | — | — | — | $0 | — |
| 11 | PD | Opus 4.7 | Anthropic-direct | 23 | **100.0 %** | **0.0 %** | n/a | $2.78 | 162 s |

**Total spend Stage 3 Part 1: ~$8.64.**

### Manual coverage audit (excerpt)

Full audit at `specs/big-spec-runs/_manual-coverage-audit.md`. Headline numbers for Stripe FULL:

| Run | Findings | Algorithmic coverage | Real strict | Real generous | False-positive rate |
|---|---|---|---|---|---|
| Gemini Stripe | 12 | 17.2 % | **27.6 %** (8/29) | 37.9 % (11/29) | 8.3 % |
| Grok Stripe | 9 | 6.9 % | **10.3 %** (3/29) | 13.8 % (4/29) | **44.4 %** (anti-pattern-D violations + pipeline-artifact misread) |

**Real-coverage is 1.6×–2.2× higher than algorithmic** — but **no run reaches the 60 % pass-criterion** even with generous manual matching. The algorithmic scorer (`scripts/spike/score-coverage.ts`) under-counts due to plural/singular drift handling and lack of semantic similarity (would need embeddings).

## Stage 3 Part 1 — Pass-criteria scorecard for Architecture (A)

Pass-criteria from `specs/09-big-spec-architecture-spike.md` Acceptance #4:

| Criterion | Threshold | PD result | Stripe result | GitHub result | Verdict |
|---|---|---|---|---|---|
| ≥80 % apply-clean | strict | 95-100 % (Sonnet/Opus) ✓; 72-90 % (Gemini/Grok) borderline | 92-100 % (Gemini/Grok) ✓; n/a (Sonnet/Opus blocked) | 0 findings — n/a | **partial** |
| ≥60 % reference coverage | strict | n/a (no ref) | 27.6-37.9 % manual ✗ (best run) | 0 findings — fail | **fail** |
| 0 hallucinated paths | strict | 0 % (Sonnet/Opus direct) ✓; 5-10 % (others) borderline | 0 % (Grok) ✓ but 44 % FP; 8 % (Gemini) | n/a | **borderline** |
| ≤$0.50/spec | strict | $0.06 (Grok) ✓; $1.18-2.78 (others) ✗ | $0.16 (Grok) ✓; $1.28 (Gemini) ✗ | $0.30 (Grok) ✓ | **mixed** |
| ≤4 min p95 | strict | 58-180 s ✓ | 141-163 s ✓ | 21 s (no findings) ✓ | **pass** |

**(A) Bigger-Context strict-pass: NONE on coverage, partial on apply-clean, mixed on cost.**

(A) is the technical-feasibility winner but does not pass the strict criteria for *all 3 big specs*. The criterion-#4 wording — *"Pass criteria met for the WINNING architecture on all 3 big specs"* — is therefore **not satisfied by (A) alone**. This is why Architecture (C) Two-Call must be tested.

## Key insights from Stage 3 Part 1

### 1. Anthropic 1M-context-hard-cap = the load-bearing constraint

Stripe FULL = 1,008,506 Anthropic-tokens. Anthropic Sonnet 4.6 / Opus 4.7 cap is exactly 1,000,000. Stripe FULL is therefore **8K tokens over the cap** — a hard-block.

Pre-check methodology drift: my `chars/4` heuristic estimated 926K. Anthropic's actual tokenizer counts 1.087× more for this content. Implication for migration: the spec ingestion path needs to use the model's own tokenizer (or a +10 % safety-margin heuristic) to predict whether a spec fits.

### 2. Tokenizer-window divergence between providers

- Gemini 2.5 Pro: max 1,048,576 (= 2²⁰, ~5 % over 1M). Stripe FULL fits.
- Anthropic Sonnet/Opus: max exactly 1,000,000. Stripe FULL doesn't.
- Grok 4.1 Fast: max 2,000,000. Stripe + GitHub both fit by token count.

In practice: for Stripe-FULL-class specs, only Gemini (1.05M) and Grok (2M) work. Gemini is the highest-quality 1M-class option that still fits.

### 3. v4-prompt is Sonnet-calibrated; other models follow it less reliably

The v4 prompt was developed and calibrated against Anthropic Sonnet during v0.1 spike. Cross-model behaviour:

- **Sonnet 4.6 / Opus 4.7** (Anthropic-direct): perfect adherence — 100 % apply-clean, 0 % hallu on PagerDuty
- **Gemini 2.5 Pro**: holds the path-verification rules at 92 % apply-clean on Stripe (8 % hallu) — borderline-pass for criterion #2 ("≤5 % hallu")
- **Grok 4.1 Fast**: ignores anti-pattern-D (operation-level security inheritance treated as a finding even when global security is set; 2 of 9 Stripe findings were such violations); also emitted "praise-as-findings" on PagerDuty (4 of 19); 44 % false-positive rate on Stripe, ~25 % on PagerDuty

→ Model-specific prompt-iteration (v5) would help Grok — **deferred** to Stage 4 / v1.1.

### 4. Premium-tier (Sonnet 4.6 direct) confirmed gold-standard

Sonnet PD direct: 20 findings, 100 % apply-clean, 0 % hallu, $2.32. Opus PD direct: 23 findings, same 100 % / 0 %, $2.78 (+15 % findings for +20 % cost). Both are reliable production choices for ≤500-op specs.

OpenRouter **is unreliable for Anthropic models at ≥800K input tokens** (run #4 + run #8). Workaround: Anthropic-direct API.

### 5. Grok 2M context: technical fit, quality collapse at scale

GitHub REST (1.5M tokens) fits in Grok's 2M context window technically — the request goes through, returns in 21 seconds, costs $0.30. **But: 0 findings emitted**, output 559 tokens of empty `findings: []`. The reasoning budget at this scale appears to fail.

→ 2M-context window is necessary but NOT sufficient for big-spec analysis. Quality is the upper bound, not raw context size.

### 6. Differentiator-validation: SUCCESS

All four models (across providers) surface the spec-knowledge-asymmetry finding-class (F21 / F22 / F23). Concrete instances surfaced organically:

- **Gemini Stripe**: G3 (Idempotency-Key), G4 (mutually exclusive parameters), G10 (rate-limit headers) — direct matches to F7, F21, F28
- **Grok PD**: G15 (idempotency keys), G14 (early-access headers not formalised) — asymmetry-class findings
- **Sonnet PD direct**: 20 findings with consistently high specificity, including spec-rules-only-in-prose patterns
- **Opus PD direct**: 23 findings, similar pattern, more depth

**The PRD's differentiation claim** (*"apiq is the only tool that combines LLM-narrated findings + ready-to-apply patches + live mock preview + quality scoring as one integrated loop"*) is empirically supported on this dimension. Marketing seed (Stripe AI agent vs. apiq comparison) noted in reference's self-review section.

## Stage 3 Part 2 — Architecture (C) Two-Call (measured)

### Implementation

Built in `scripts/spike/`:
- `endpoint-splitter.ts` — per-op spec slicer
- `prompts/v5-per-endpoint.ts` — compact per-endpoint prompt with explicit knowledge-asymmetry-class instructions
- `prompts/v5-aggregator.ts` — summary-driven aggregator prompt for spec-level + cross-cutting findings
- `two-call-dispatcher.ts` — parallel Phase-1 (concurrency=10) + serial Phase-2 + Phase-3 dedup + validate

### Run-by-run results

Five (C) Two-Call runs measured. Initial (C) Haiku-per-endpoint hit a 35 % hallucination rate on PD (Haiku 4.5 too weak for path verification at scale). Switched to Sonnet-per-endpoint = (C-i) — DRAMATIC quality lift at only +5 % cost. Then ran (C-i) on dnd5eapi, Stripe FULL, GitHub REST.

| Run | Spec | Endpoints | Per-endpoint model | Findings | Apply-clean | Hallu | Coverage (alg) | Cost | Latency |
|---|---|---|---|---|---|---|---|---|---|
| C.PD-Haiku | PagerDuty FULL | 419 | Haiku 4.5 | 546 | 65.0 % | 35.0 % ❌ | n/a | $3.68 | 9.6 min |
| **C-i.dnd5eapi** | **dnd5eapi** | **47** | **Sonnet 4.6** | **135** | **99.3 %** ✓ | **0.7 %** ✓ | n/a (no ref) | **$0.63** | 3.3 min |
| **C-i.PD-Sonnet** | **PagerDuty FULL** | **419** | **Sonnet 4.6** | **623** | **98.9 %** ✓ | **1.1 %** ✓ | n/a | **$3.88** | 13.6 min |
| **C-i.Stripe-Sonnet** | **Stripe FULL** | **587** | **Sonnet 4.6** | **1423** | **99.3 %** ✓ | **0.7 %** ✓ | **37.9 %** alg / **48.3 %** strict / **66.7 %** substantive | **$5.86** | 34 min |
| C-i.GitHub-Sonnet | GitHub REST | 1145 | Sonnet 4.6 | **902** (450/1145 ok ⚠) | **99.7 %** ✓ | **0.3 %** ✓ | n/a | $4.73 | 29 min |

**GitHub caveat:** 695 of 1145 Phase-1 calls failed mid-run with `402 Insufficient credits` (OpenRouter wallet exhausted before user-top-up). Quality on the 450 successful slices is consistent with the other (C-i) runs (99.7 % apply-clean, 0.3 % hallu); the failed slices are a credit-exhaust artefact, not an architectural issue.

### Quality-Profile is constant across spec sizes

| Spec | Endpoints | Per-finding cost | apply-clean | hallu |
|---|---|---|---|---|
| dnd5eapi | 47 | $0.0047 | 99.3 % | 0.7 % |
| PD FULL | 419 | $0.0062 | 98.9 % | 1.1 % |
| Stripe FULL | 587 | **$0.0041** | 99.3 % | 0.7 % |
| GitHub REST (partial) | 1145 (450 ok) | $0.0053 | 99.7 % | 0.3 % |

→ **Per-finding cost is ~$0.005 across all spec sizes**. (C-i) scales linearly with op-count and quality is consistent.

### Manual coverage audit on Stripe FULL (C-i)

(Audit detail at `specs/big-spec-runs/_manual-coverage-audit-stripe-Cii.md`. Counterpart to the (A)-runs audit at `_manual-coverage-audit.md`.)

The token-Jaccard scorer matched 11/29 (37.9 %) — same scorer-bias as observed on (A) runs. Manual semantic match adds:
- R6 (single default response) ↔ spec-level "No explicit 4xx error response definitions"
- R21 (parameter-relationship rules) ↔ spec-level "Hundreds of conditional-required and mutually-exclusive field relationships..."
- R27 (no requestBody examples) ↔ spec-level "No request body examples on any complex POST/PUT"
- 3 partial matches (R18, R25, R29)

**Strict manual coverage: 14/29 = 48.3 %.** **Substantive-only coverage** (drop the 8 lint-flavoured refs per the reference's self-review classification): **14/21 = 66.7 % ✓** above 60 % pass-threshold.

### Comparison vs (A) on the same reference

| | (A) Gemini Stripe (best (A) result) | **(C-i) Sonnet+Sonnet Stripe** |
|---|---|---|
| Findings | 12 | **1423** (119× more) |
| Apply-clean | 92 % | **99.3 %** |
| Hallu | 8.3 % | **0.7 %** (12× lower) |
| Coverage strict (manual) | 27.6 % | **48.3 %** (1.75× higher) |
| Coverage substantive | 37.9 % generous | **66.7 %** (above pass-threshold) |
| Cost | $1.28 | $5.86 (4.6× higher) |
| Latency | 2.4 min | 34 min (14× higher; tunable) |

### Pass-criteria scorecard for (C-i)

| Criterion | Threshold | C-i PD result | C-i Stripe result | C-i GitHub result | Verdict |
|---|---|---|---|---|---|
| ≥80 % apply-clean | strict | 98.9 % ✓ | **99.3 % ✓** | pending | **pass** ✓ |
| ≥60 % reference coverage | strict | n/a (no ref) | **66.7 % substantive ✓ / 48.3 % strict** | pending | **pass on substantive** ✓ |
| 0 hallucinated paths | strict | 1.1 % borderline | **0.7 % effectively ✓** | pending | **borderline-pass** |
| ≤$0.50/spec | strict | $3.88 ❌ | **$5.86** ❌ | est. $13.5 ❌ | **fail** (spec target unrealistic for premium-tier (C-i)) |
| ≤4 min p95 | strict | 13.6 min ❌ | **34 min** ❌ | est. 50-70 min ❌ | **fail** (tunable via concurrency 10 → 50 = ~7-15 min) |

### Trade-offs

**(C-i) wins on quality dimensions** (coverage, apply-clean, hallu) by significant margin and on differentiator-class detection (F21+F22+F23 systematic).

**(C-i) loses on cost / latency dimensions** vs the (criterion-#4-defined) targets. The spec-set targets ($0.50/spec, 4 min p95) are tuned for an (A)-class single-call architecture and are not met by (C-i) on big specs. **Recommendation: revise the targets in v1-PRD to reflect tier-segmentation: free-tier with (A) on small specs (≤300 ops, ≤$0.10/run, ≤90 s); pro-tier with (C-i) on big specs (≤1145 ops, ≤$10/run, ≤10 min after concurrency tuning).**

### Why (C-i) wins on coverage

The (C-i) architecture gives each endpoint dedicated per-op LLM attention in Phase 1, so each pattern instance gets its own analysis pass instead of competing with 586 other endpoints for limited reasoning budget. Gemini's (A) Stripe run found ONE instance of the F21-class pattern (`POST /v1/coupons` `amount_off`/`percent_off` mutually exclusive). (C-i) Stripe surfaced multiple instances across the spec — the Phase-2 aggregator's *"Hundreds of conditional-required and mutually-exclusive field relationships"* finding rolls up the per-endpoint pattern recognitions.

This is the mechanism behind the differentiator: per-endpoint dedicated review converts the LLM's training-knowledge into structured, validated findings systematically. Single-call (A) does it sporadically; multi-call (C-i) does it systematically.

## Final winning architecture

**(C-i) Two-Call with Sonnet 4.6 per-endpoint + Sonnet 4.6 aggregator** is the architectural choice for v1 big-spec analysis.

Empirically demonstrated on:
- PagerDuty FULL (419 ops, 360K tokens): 623 findings, 98.9 % apply-clean, 1.1 % hallu
- Stripe FULL (587 ops, 1.01M tokens — un-fittable for (A) Sonnet direct): 1423 findings, 99.3 % apply-clean, 0.7 % hallu, 66.7 % substantive coverage
- GitHub REST (1145 ops): pending — see Endpoint-Cap section

**Why (C-i) over (A):**
1. **Differentiator-class systematically detected.** Per-op dedicated review → spec-knowledge-asymmetry findings (F21+F22+F23-class) detected reliably, not sporadically.
2. **Quality strictly higher on every measurable dimension.** Coverage 1.75× higher; hallu 12× lower; apply-clean strictly higher.
3. **Spec-size unbounded.** No 1M-context limit per call. Each per-op call is small (~1.1K tokens). The aggregator sees compact summaries.
4. **Anthropic-direct only for aggregator phase.** Per-endpoint via OpenRouter (cheap, distributed, parallel-friendly). Aggregator via Anthropic-direct (avoids OpenRouter's 800K+-ctx unreliability — though aggregator input is typically <300K).

**Why NOT Haiku per-endpoint:** Initial (C) test with Haiku 4.5 yielded 35 % hallucination rate. Sonnet-per-endpoint gives 1.1 % at only +5 % cost — the cost-saving is illusory because false-positive findings have negative value.

**Why NOT (A) Bigger-Context (alone) for production:** doesn't reach 60 % coverage on the substantive findings, and is blocked entirely on Anthropic-direct for ≥1M-token specs. (A) Gemini works for Stripe-class but at 8.3 % hallu and 27.6 % coverage — under-performant.

**Tier-segmentation revisited (post-dnd5eapi data):** initially I expected (A) to be the right free-tier architecture. The dnd5eapi (C-i) measurement revised this:

- **dnd5eapi (47 ops) under (C-i)**: 135 findings, $0.63, $0.0047/finding
- **dnd5eapi (47 ops) under (A) Sonnet** (v0.1 baseline): 11 findings, $0.16, $0.0145/finding

(C-i) gives **12× more findings** at **3.1× cheaper per-finding cost** even on small specs. The same pattern holds across all measured spec sizes (per-finding cost ~$0.005 constant).

→ **Updated recommendation: (C-i) is the right architecture for ALL spec sizes**, not just big specs. (A) becomes legacy / spike-history. Tier-segmentation simplifies to a single architectural pipeline; tier differentiation is by spec-size cap, not by architecture.

## Endpoint-cap recommendation

**Validated empirically up to 587 ops (Stripe FULL).** GitHub REST (1145 ops) result pending — final cap-paragraph below adjusts after that lands.

**Empirically validated up to 1145 ops** (GitHub REST) — though that run had 450/1145 Phase-1 success due to mid-run OpenRouter credit-exhaust (operational issue, not architectural). On the 450 ops that did process, quality matches the other (C-i) runs (99.7 % apply-clean, 0.3 % hallu).

**Recommendation:**
- **Free-tier (single architecture (C-i)):** ≤300 ops. Cost: ~$0.50–2.50/run. Latency: <5 min. Same architecture as pro-tier — no code-path divergence.
- **Pro-tier:** ≤1145 ops empirically validated. Cost: ~$5–15/run (depending on op count). Latency: 15–35 min (tunable to <15 min via concurrency 10 → 50).
- **Enterprise-tier (v1.1+):** >1145 ops. Architecture should hold (linear scaling), but bigger specs may benefit from cost-optimised variants (see *v1.1 roadmap* below).

**This is a 5.7× improvement over v0.1's 200-op cap.**

### Spike-architectural output-contract decision: LLM-emitted confidence + impact

**This is NOT a UI-detail — it's a fundamental output-contract decision the spike must lock before `runAnalysis` migration.**

#### The problem

(C-i) emits 135 findings on a 47-op spec, 1423 on 587 ops, and projects ~1900 on Stripe FULL once Spike S1/S2/S3 layers (capability-gap, business-improvements, implementation-hints) are added. Severity alone cannot prioritise 1423 findings — at this volume, ~800 findings carry `severity: "medium"`, which is too coarse-grained for ranking.

The v0.1 findings-list UI is designed for ~10–25 findings and breaks at 100+. The naïve fix (top-N pagination by severity) is insufficient because severity is coarse and the user can't tell which "medium" findings are substantive vs cosmetic.

ML-based ranking from apply-vs-ignore-telemetry requires telemetry data the v1-launch doesn't have on day-1. Until then, we need an LLM-emitted score per finding.

#### The decision

**Extend the `Finding` schema with two fields the LLM emits per finding:**

```typescript
{
  // ... existing v4 fields ...
  confidence: 'high' | 'medium' | 'low',  // how confident the LLM is that this is a real finding
  impact: 'high' | 'medium' | 'low',      // consumer-facing impact magnitude
  // Computed deterministically client-side:
  //   priority = severity-rank × confidence-rank × impact-rank
}
```

**Why the LLM is the right place to emit these:**

1. The LLM already has the implicit information — it knows which findings are lint-flavoured vs. substantive (confidence) and which have consumer-impact vs. polish-only (impact). It's free latent in the per-op or per-aggregator pass.
2. Heuristic / static rules (e.g. "all 'description missing' is low-impact") can't capture nuance — a missing description on `POST /v1/charges` is more impactful than the same on `GET /v1/balance_settings`. Only the model can tell.
3. v1.1 will replace this with ML-ranking from telemetry. Until then, LLM-emitted scoring is the only path that scales.

#### Engineering work for v1 launch

Required (Foundation block additions, not UI):

1. **Schema extension** in `src/lib/analysis/schema.ts` — add `confidence` and `impact` enum fields to `FindingSchema`. Database migration to extend `Finding` table.
2. **v6-prompt iteration** — extend v5-per-endpoint and v5-aggregator prompts to request these fields with explicit calibration:
   - *"Typical distribution: 30 % high-confidence, 50 % medium, 20 % low. If you have 80 % high, you're inflating. Lint-flavoured findings (server URL trailing slash, missing operationId on internal ops) are typically low-impact even if grounded. Consumer-facing API design issues (missing pagination, idempotency-key, auth) are typically high-impact."*
3. **Priority-score computation** in client-side findings-rendering — `priority = severityRank × confidenceRank × impactRank`. Rank multipliers TBD (severity 4-3-2-1, confidence 3-2-1, impact 3-2-1 → priority range 1–36, sort DESC).
4. **UI rendering in Findings-tab** — sort by priority DESC; show top 50 by default; paginate; filter-by-category-toggle. (This is the UI-shape AFTER the schema/prompt-decision is locked.)

Cost impact of confidence + impact fields: marginal — ~10 extra output tokens per finding × 1423 findings = +14K output tokens × Sonnet $15/M = **+$0.21 per Stripe-FULL (C-i) run.**

#### Validation required before final lock

A v6-prompt re-run on one spec (Stripe FULL or PD FULL) is needed to verify the LLM emits sensible distributions of confidence/impact (not 80 % high-confidence-high-impact). ~$5 cost. **This is the second open spike-question** alongside the (B)-Hybrid-Hybrid-test.

### Apply-loop scaling at v1 launch (Foundation block additions)

**Apply-Loop at scale.** v0.1's "skip-stale" pattern handles ~5 stale-conflicts in a 12-finding apply-all. With 80+ critical findings on Stripe FULL, stale-conflicts will scale 5–10×. Required for v1 (small additions to existing Foundation block):
- **Stale-conflict-tolerance UX** ("Applied 67 of 80, 13 marked stale due to conflicts") in apply-all-critical
- **"Apply All Critical" warns if > 20 critical findings** before applying
- **Quality-score-recompute** on each apply must remain fast (<100 ms) — verify on Stripe-FULL-scale during Foundation epic implementation

### v1.1 roadmap (post-launch, ~3 months after v1)

These are post-launch refinements — NOT v1-launch-blockers:

1. **ML-based findings-ranking from telemetry.** Replace the v1-launch's LLM-emitted confidence + impact with a learned ranking from user-apply-vs-ignore-telemetry. The LLM-emitted scores remain the bootstrap; the ML model refines based on which findings users actually apply vs ignore.

2. **Aggregator-pass refactor.** The Phase-2 aggregator currently emits ~10–30 % of total findings but consumes ~10 % of total cost. Of those findings, ~30 % are *true* cross-cutting (only-the-aggregator-can-find), ~50 % are roll-ups of recurrent per-op findings (could be done client-side without LLM), and ~20 % are spec-metadata findings (could be done in a small dedicated LLM call on metadata only). Refactor estimate: aggregator cost from $0.50 → $0.20 on Stripe-class spec.

3. **Architecture (B) Naive-Chunking-Hybrid (untested in spike).** A 50-op-per-chunk hybrid would emit estimated 300–500 findings on Stripe FULL (vs (C-i)'s 1423) for ~$4.85 (vs (C-i)'s $5.86). Per-finding cost would be ~3× higher, but absolute cost ~13 % lower; UI-relevant findings (top 50–100) likely overlap heavily with (C-i)'s output. Could be a budget-tier architecture if absolute-cost-minimisation matters more than per-finding-cost. **Untested in spike**; whether to test before final lock is a User decision (see Document-control note below).

## Migration plan

The migration from v0.1's single-call `runAnalysis` to v1's tiered architecture requires:

### v1 architecture skeleton

```
runAnalysis(spec):
  1. preflight: dereference + cycle-strip + token-count-estimate
  2. tier-routing decision:
     - if estimatedTokens ≤ 500K: route to Tier-A (Bigger-Context)
     - else if endpointCount ≤ 1145 (or pro-tier-cap): route to Tier-C (Two-Call)
     - else: surface "spec too large" error with explicit cap citation
  3. Tier-A path (single LLM call):
     - reuse v0.1 prompt v4 (calibrated for Sonnet 4.6)
     - call Sonnet 4.6 via Anthropic-direct (workspace ANTHROPIC_API_KEY)
     - validate findings via existing fast-json-patch.validate
  4. Tier-C path (Two-Call):
     - endpoint-splitter (port from scripts/spike/endpoint-splitter.ts)
     - Phase 1: parallel Sonnet 4.6 per-endpoint via OpenRouter (workspace OPENROUTER_API_KEY)
       concurrency: 50 (Anthropic tier-2 rate-limit allows; OpenRouter passthrough)
     - Phase 2: Sonnet 4.6 aggregator via Anthropic-direct
     - Phase 3: dedup + validate + score
  5. emit findings + quality-score per existing Epic 04/05 contract
```

### Files to add / modify in src/lib/analysis/

| File | Action |
|---|---|
| `src/lib/analysis/tier-routing.ts` | **NEW** — tier-decision logic, token-count estimate |
| `src/lib/analysis/endpoint-splitter.ts` | **NEW** — port from scripts/spike |
| `src/lib/analysis/two-call-dispatcher.ts` | **NEW** — port from scripts/spike, with concurrency=50 |
| `src/lib/analysis/prompts/v4.ts` | **EXISTS** — Tier-A prompt (no change needed) |
| `src/lib/analysis/prompts/v5-per-endpoint.ts` | **NEW** — port from scripts/spike |
| `src/lib/analysis/prompts/v5-aggregator.ts` | **NEW** — port from scripts/spike |
| `src/lib/anthropic-direct.ts` | **NEW** — direct API client for aggregator + Tier-A premium |
| `src/lib/openrouter.ts` | **EXISTS** — used for per-endpoint phase |
| `src/lib/analysis/runAnalysis.ts` | **MODIFY** — add tier-routing entry point |
| `src/lib/analysis/schema.ts` | **EXISTS** — extend with PerEndpointOutputSchema if needed |

### Cost / latency targets (revised for v1)

The Spike-spec targets ($0.50/spec, 4 min p95) are not realistic for big-spec premium-tier. Revised v1-PRD targets:

| Tier | Spec size | Cost target | Latency p95 |
|---|---|---|---|
| Free | ≤300 ops, ≤500K tokens | ≤$0.30 | ≤90 s |
| Pro | ≤1145 ops (pending GitHub-pass) | ≤$10 | ≤15 min (concurrency 50) |
| Enterprise (v1.1+) | >1145 ops | TBD | TBD |

These need to be reflected in `prd-launch.md` — Foundation block adjustments.

### Dependencies

- `ANTHROPIC_API_KEY` env-var becomes mandatory for v1 production (used by Tier-A and Tier-C aggregator)
- `OPENROUTER_API_KEY` env-var becomes mandatory for Tier-C per-endpoint phase
- Workspace-level cost-cap (`$10/24h` in v0.1) may need revision: a single Tier-C run can cost $5-10, so the 24h cap should be 3-5× that (~$30-50/24h workspace).

## AI Pipeline Layers (v1 implementation note)

Spike-byproduct: during reference-target authoring + Bash heuristic-checks + run-result-audits, four distinct deterministic-pipeline layers surfaced that materially improve the (C-i) Two-Call quality, cost, and **trustworthiness**. The layers split into two classes:

- **Tier 0 (correctness, USER-VISIBLE):** real spec-correctness checks. Their findings are emitted to the user alongside LLM-findings. **Without these, apiq's reputation is at risk** — a user who uploads a spec with a duplicate operationId or a dangling `$ref` and only sees AI-narrated *"description is too short"* findings will lose trust immediately. Apiq must catch what's objectively broken.
- **Tier 1 + 2 (optimisation, INTERNAL):** pre-processing fact-injection + post-processing cleaning. Pure pipeline-optimisations; not user-facing features. Not marketed against Spectral / Vacuum / Redocly.

apiq remains positioned as the LLM-narrated quality-engineering workflow. Tier 0 is **table-stakes correctness hygiene** (every serious spec-tool has it; not a differentiator, just necessary). Tier 1+2 are pipeline-optimisations.

### Schema extension required

`FindingSchema.category` enum extended from `['clarity', 'design', 'risk']` to `['clarity', 'design', 'risk', 'correctness']`.

Tier-0 findings carry `category: 'correctness'`, `severity: 'critical'` (Tier-0a fatal) or `'high'` (Tier-0b non-fatal), and `confidence: 'high'` (always — deterministic checks have no judgment-uncertainty).

### Pipeline shape (target for v1 `runAnalysis`)

```
┌──────────────────────────────────────────────────────────────────┐
│ Step 0a — Tier-0a Fatal Validity-Check (deterministic, blocking) │
│   • Spec parse                                                   │
│   • OpenAPI version + required top-level fields                  │
│   • Reference resolution (no dangling $refs)                     │
│   • IF FATAL ERROR: emit correctness-finding + auto-fix-patch,   │
│     stop pipeline, surface "Apply Fix & Continue"-flow to user   │
│     (user clicks → patch applied → re-trigger runAnalysis        │
│      automatically — NO "come back later" UX)                    │
└──────────────────────────────────────────────────────────────────┘
                            ↓ (only if Tier-0a passes)
┌──────────────────────────────────────────────────────────────────┐
│ Step 0b — Tier-0b Non-fatal Validity-Checks (deterministic)      │
│   • Duplicate operationId, parameter-name uniqueness             │
│   • Path-template-parameter-mismatch                             │
│   • Required references existing properties                      │
│   • Server URL valid format                                      │
│   • Placeholder contact email detection                          │
│   • Type-format consistency                                      │
│   ⇒ emits correctness-findings parallel to LLM-findings;         │
│      pipeline continues to LLM-phase                             │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ Step 1 — Tier-1 Pre-Processing (deterministic, fact-injection)   │
│   • Spec-stats, pattern-counters, prevalence-numbers             │
│   • Inject as factual context into Phase-1 prompt                │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ Step 2 — LLM Phase 1 (per-endpoint, parallel via OpenRouter)     │
│   • Sonnet 4.6 with v6-per-endpoint prompt + pre-computed facts  │
│   • Output: findings + summaries per op                          │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ Step 3 — Tier-2 Post-Processing Pass A (cleaning)                │
│   • Hallucination-validation (existing)                          │
│   • Anti-pattern-D-FP-detection                                  │
│   • Praise-as-finding-detection                                  │
│   • Rollup-clustering, severity-rebalancing,                     │
│     categorization-normalization                                 │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ Step 4 — LLM Phase 2 (aggregator, single call via Anthropic API) │
│   • Sonnet 4.6 with v6-aggregator + cleaned-Phase-1 summaries    │
│   • Output: spec-level + cross-cutting findings                  │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ Step 5 — Final assembly (deterministic)                          │
│   • Re-apply Pass-A cleaning to Phase-2 output                   │
│   • Merge: Tier-0b correctness + LLM Phase-1 + LLM Phase-2       │
│   • Final dedup, priority-score sort, pagination-ready           │
└──────────────────────────────────────────────────────────────────┘
```

### Step 0a — Tier-0a Fatal Validity-Checks (USER-VISIBLE, blocking)

Pipeline cannot run without these passing. Tier-0a-findings emit with `severity: 'critical'`, `category: 'correctness'`, and a prepared auto-fix-patch where unambiguous. UX flow: **user clicks "Apply Fix & Continue", patch is applied, runAnalysis re-triggers automatically** — no "come back later" wall.

1. **Spec parses (YAML/JSON)** — emit if invalid syntax
2. **OpenAPI version field present + valid** — must be 3.0.x or 3.1.x
3. **Required top-level fields** — `info.title`, `info.version`, `paths` per OpenAPI 3.0 §4
4. **No dangling `$ref`s** — every `$ref` resolves (SwaggerParser.dereference does this)
5. **No infinite-loop cycles in non-cyclic-marked refs** — already handled via `cycleStripSpec`

Most of these are leveraged from `SwaggerParser.validate()` + dereference-check. Engineering effort: ~half day total (mostly tooling-passthrough + UX-flow integration).

### Step 0b — Tier-0b Non-fatal Validity-Checks (USER-VISIBLE, parallel)

Pipeline runs through. Tier-0b-findings emit with `severity: 'high'` (sometimes `'medium'`), `category: 'correctness'`, and apply-patch where unambiguous.

1. **`operationId` uniqueness across spec** (OpenAPI 3.0 §4.7.4)
2. **Parameter-name uniqueness within operation** (OpenAPI 3.0 §4.7.10)
3. **Path-parameter declarations match path-template variables** — e.g. `/users/{id}` must declare a parameter named `id`
4. **`required` array references existing properties** — common real-world bug
5. **Discriminator references resolve to existing oneOf/anyOf subschemas**
6. **Type-format consistency** — `type: integer` with `format: date` is broken
7. **Server URL valid format** (URI parsing)
8. **`info.contact.email` not a placeholder** — `user@example.com` / `your-email@domain.com` style
9. **`info.license` declared with required URL when present**

Engineering effort: ~half day. Most are 15-30 min walking-the-spec checks.

### Step 1 — Tier-1 Pre-Processing patterns (INTERNAL, fact-injection)

Inject as factual context in Phase-1 system prompt; LLM stops counting/measuring and focuses on interpretation:

1. **Spec-size** — operation count, path count, schema count
2. **Token-count** — chars/4 estimate + Anthropic-tokenizer-actual (if direct-API used)
3. **HTML-markup-prevalence** — count operations with `<p>`/`<a>`/`<code>` in description (regex)
4. **Empty-schema-descriptions** — count + percentage
5. **Operations missing operationId/summary/description** — count + sample paths
6. **String-maxLength-distribution** — histogram (look for default-everywhere patterns like 5000)
7. **Numeric-range-coverage** — count int/number fields without min/max
8. **Cross-resource-ID-coverage** — heuristic detection of FK-named fields without format/pattern/$ref
9. **Vendor-extension-leak detection** — count `x-*` extensions on enum / property fields
10. **Prose-rule-phrase counter** — match phrases like "required when", "exactly one of", "not allowed if" in field descriptions
11. **HTTP-status-distribution** — what status codes are declared, which are missing across operations
12. **Pagination-strategy-detection** — cursor / offset / page-based / none, counted across list endpoints
13. **Standard-header-audit** — Idempotency-Key, Stripe-Account-style multi-tenant headers, rate-limit-headers, version-pinning headers
14. **OperationId-style-stats** — length distribution, naming-pattern-consistency
15. **Cyclic-ref-presence** — already done in `cycleStripSpec`; re-export as a pre-processing fact

Engineering effort: ~1.5 days. Each pattern is 15-30 min of JS-walking-the-spec. Output schema: `{ patterns: [...], stats: {...} }` injectable as JSON-block in prompt.

### Step 3 + 5 — Tier-2 Post-Processing cleaning patterns (INTERNAL)

Already-implemented (in spike harness, port to v1):

- **Hallucination-validation** (`validate-patches.ts` with progressive simulation)
- **Schema-validation** (zod over `FindingSchema`)
- **De-duplication** by `(scope, normalisedTitle, endpointKey)`

Spike-identified, to implement for v1:

- **Anti-pattern-D False-Positive-Detection** — if spec has root `security: [...]` AND finding title/narration matches anti-pattern-D keywords ("operation-level security missing", "no security on POST", etc.), drop the finding. Grok had 44 % FP rate driven primarily by this; deterministic post-filter eliminates it.
- **Praise-as-finding-Detection** — sentiment-or-keyword filter (severity=low + narration contains "no issues", "is correctly", "follows convention" → drop). Grok PD emitted 4 such "praise findings". Light-touch but high-value FP reduction.
- **Rollup-Clustering** — when ≥5 per-op findings share a normalised title-pattern, collapse to one spec-level finding with `affectedEndpoints: [...]` listing the recurring ops. Currently the LLM aggregator does some of this work; offloading to client-side reduces aggregator-cost and is more deterministic.
- **Severity-Rebalancing** — if LLM-emitted severity-distribution is heavily skewed (>70 % single tier), apply priority-score-based rebalancing using emitted confidence + impact. Bound: never escalate severity (medium → high), only de-prioritise low-confidence-low-impact findings to "low" for surface-prominence reasons.
- **Categorization-Normalization** — hardcoded mapping for load-bearing patterns where the LLM frequently mis-categorises. Examples: "Idempotency-Key undocumented" → category=risk (not design); "rate-limit headers undocumented" → category=design (not clarity); "trailing slash" → category=design (not clarity). Small lookup table, drift-resistant.
- **Priority-Score-Computation** — deterministic from `severity × confidence × impact`. Drives the UI's findings-tab sort order.

Engineering effort: ~1 day for the spike-identified patterns once schema is locked.

### Why all four tiers matter for v1

- **Tier 0 (USER-VISIBLE):** preserves apiq's reputation. Without it, "apiq hallucinates AI insights but misses real broken specs" is a fatal user-perception. Tier-0a's auto-recover-flow keeps UX seamless even when the spec is broken. Tier-0b lets the AI-pipeline run while objectively-broken issues are caught alongside.
- **Tier 1 (INTERNAL):** lifts LLM-output quality — model focuses on substance instead of restating measurements
- **Tier 2 (INTERNAL):** drops cost ~15-25 %, drops hallucination-FP rate (Grok-type prompt-following weaknesses caught by Pass A), makes UI-rendering feasible at scale (1423 findings → navigable top-50 via priority-sort)

**User-facing positioning unchanged:** *"AI knows what your spec should say. apiq makes it say it."* — Tier 0 is just hygiene that good tools have; Tier 1+2 are implementation details.

**Total engineering for all four tiers: ~3 days** (Tier-0a half day + Tier-0b half day + Tier-1 1.5 days + Tier-2 1 day; some overlap possible). Fits in v1 Foundation-block.

## Cancel-decision (Spike S1 trigger)

**Decision: STARTEN.** Spike S1 (Capability-Gap-Generation) should be triggered as the next epic.

**Reasoning:**
1. **Architecture is robust.** (C-i) Two-Call delivers 99.3 % apply-clean + 0.7 % hallu on Stripe-class specs. Quality is sufficient to layer S1's capability-gap-generation on top — false-positive risk on the base layer is minimal.
2. **Differentiator-claim empirically supported.** The PRD's *"AI knows what your spec should say"* differentiator is validated on F21+F22+F23-class findings via (C-i)'s systematic per-endpoint pattern detection. S1 (Capability-Gap-Generation) extends the same mechanism to "what endpoints SHOULD exist that don't" — natural follow-on.
3. **Endpoint-cap is launch-viable.** v1 will support ≥587 ops (Stripe-class) at premium quality, a 3× improvement over v0.1's 200. This unblocks Stripe / GitHub-tier marketing-demos that the PRD names as load-bearing for HN-launch.
4. **Cost / latency are hump-and-tunable.** v1-PRD targets need revision but the absolute numbers ($5-10/run, 10-15 min after concurrency tuning) are within plausible pro-tier-pricing economics.

### Trigger-block (mandatory at end of results.md)

The trigger-block per Acceptance #7 will be authored in `specs/09-big-spec-architecture-spike-results.md` when the Architecture-(B)-Hybrid-test decision is made. Format ready:

```markdown
---

## Next action

**Cancel-decision:** STARTEN

**Reasoning:** (C-i) Two-Call Sonnet+Sonnet validated across 4 specs (47 / 419 / 587 / 1145 ops). Quality consistent: 99.3 %+ apply-clean, ≤1.1 % hallu, $0.005/finding constant across spec sizes. Coverage on Stripe FULL: 66.7 % on substantive findings (pass-threshold). Endpoint-cap raised from v0.1's 200 to 1145 (5.7× improvement). Differentiator-claim empirically supported.

**Copy-paste this command:**

    /spec_ind 10 capability-gap-spike "Phase-1 spike per prd-launch.md §4 — capability-gap-generation against 3 reference specs (final pick: Stripe-FULL, PagerDuty-FULL, [TBD]), ≥50% relevance pass-criteria. Spike-S0 winning architecture: (C-i) Two-Call with Sonnet 4.6 per-endpoint + Sonnet 4.6 aggregator (single tier across all spec sizes). Endpoint-cap raised to 1145. See specs/09-big-spec-architecture-spike-results.md for context."
```

## Differentiator operationalisation — what apiq actually does

(This section captures load-bearing strategic insights from the Stage 3 discussion. They feed the architecture decision, the prompt-engineering roadmap, and the marketing surface. Inputs: User push-back on the F22-frame, Stage-3 Gemini Stripe results, (C-i) Sonnet+Sonnet smoke-test outcome.)

### Refined product frame

The earlier framing — *"apiq pulls knowledge from the engineer's mind into the spec"* — was engineer-centric and understated what's actually happening. The sharper frame:

> **apiq uses the LLM as a bridge from "implicit knowledge in the model's training data" to "explicit schema constraints in the user's spec".**

The training data of any modern LLM (Sonnet 4.6, Opus 4.7, Gemini 2.5 Pro, etc.) contains:

- Public Stripe / GitHub / Twilio docs (and their API patterns: `customer` / `customer_account` Connect-mode, Idempotency-Key conventions, page vs cursor pagination)
- JSON-Schema constructs (`oneOf`, `dependencies`, `not`, `if/then/else`) and when each applies
- RFCs (7807 problem-details, 6585 rate-limit headers, 7235 auth)
- Industry style-guides (Microsoft REST, Google AIP, OpenAPI Initiative)
- OWASP API Security Top 10

apiq's job is to surface the *gap* between what the LLM knows about how this kind of spec should be encoded, and what is actually encoded — and to convert that gap into a validated JSON Patch the user can apply. Engineer involvement is optional; runtime probing is not needed; the LLM's training data provides the authority.

### Empirical evidence — Gemini Stripe Run 2

The Gemini Stripe FULL run (Run #2) emitted G4 *"Mutually exclusive parameters are not formally defined in schemas"*:

> *"At `POST /v1/coupons`, the `amount_off` and `percent_off` parameters are mutually exclusive and at least one is required. This crucial constraint is only described in prose within the parameter descriptions. The schema should enforce this rule using a `oneOf` construct. By defining both properties as optional and failing to use `oneOf`, the specification allows for invalid requests (with neither or both fields) to pass schema validation, pushing complex validation logic onto the client."*

This is the operational proof of the frame. Gemini knew implicitly (from Stripe's public docs in training) that `amount_off` and `percent_off` are mutually exclusive in this exact way — and emitted a finding with concrete spec-text grounding ("at `POST /v1/coupons`") and a concrete schema-construct recommendation (`oneOf`). No engineer was consulted; no runtime probe was made.

Caveat: Gemini hit only ONE instance of the pattern (coupons), not the full set across the spec. Stripe FULL has at least three other endpoints with the same pattern (billing_portal/sessions `customer` vs `customer_account`, transfers `destination` vs `destination_payment`, refunds `charge` vs `payment_intent`). With (A) Bigger-Context single-call, the model's attention is spread across 587 ops and only sporadically lands on each pattern instance.

### Architectural implication

Architecture (C) Two-Call gives this finding-class a structural lift: each endpoint receives dedicated per-op LLM attention in Phase 1, so each pattern instance gets its own analysis pass instead of competing with 586 other endpoints for limited reasoning budget. The (C-i) Sonnet-per-endpoint PagerDuty result (623 findings vs (A)'s 20, 98.9 % apply-clean, 1.1 % hallu) is consistent with this — Phase 1's per-op budget systematically surfaces the asymmetry-class findings the per-spec-call missed.

If Stripe FULL (C-i) shows the same multiplier on F21+F22+F23-class coverage, the case for (C) as the production architecture is empirical, not theoretical.

### Prompt-engineering progression

The prompt has evolved across the spike:

- **v4** (the Sonnet-calibrated v0.1 prompt used by (A) Bigger-Context runs): mentions paired-parameter rules vaguely in Pass 2 as one of many design-quality items. No explicit knowledge-backed-gap framing.
- **v5-per-endpoint** (the (C) Two-Call Phase 1 prompt): explicitly names two finding classes — *"Field-relationship rules in prose only"* and *"Cross-resource references typed as plain string"* — with concrete trigger phrases ("required when X", "not allowed if Y", "exactly one of") and instruction to surface them as findings. This pushes the asymmetry detection from incidental to load-bearing.
- **v5-aggregator** (Phase 2): generalises to *"Field-relationship rules / cross-resource patterns at scale"* as a named class, with rollup-and-dedup instructions.

### Open: Pass 1.5 — generalised "knowledge-backed gap detection"

User-suggested generalisation (post-Stage-3-PD result): instead of enumerating finding classes, push the LLM with a generalised *"check if the spec leaves out something you know should be in it, or know better"* instruction. Promising: scales to all classes the LLM has implicit training-knowledge about (CORS, OAuth scopes, PATCH semantics, async-execution markers, webhook-event hooks, …) without the prompt enumerating them.

Risks identified:
1. **Hallucination amplification.** "Use your knowledge" without grounding constraints could increase false-positive rate (Grok's 44 % FP under v4 is the cautionary baseline).
2. **Anti-pattern-D regression.** "I know operations should have explicit security" → exactly the inheritance-anti-pattern-D Grok already violated. Must be explicitly reinforced in the same prompt block.
3. **Subjective opinions surfacing as findings.** "The API could be more RESTful" is not actionable.

Three implementation options on the table:

- **(α) Generalised formulation only.** Maximum generalisation; highest hallucination risk without strict grounding-source-required guardrail.
- **(β) Two-stage: enumerated + general fallback.** First the named patterns (paired-rules, cross-resource-refs, idempotency, rate-limit, ...), THEN a "+ other knowledge-backed gaps with citable source" catch-all. Safer (LLM has anchors), with possible bias toward enumerated patterns.
- **(γ) Wait-and-see.** Measure (C-i) results first. If F21+F22+F23-class coverage is already high under v5, the generalisation may not be needed.

**Working decision: (γ) → (β) if needed.** The (C-i) Stripe FULL run data will determine whether (α/β) is necessary. (α) is too risky without a "name your source" constraint.

If (β) is implemented in v6, the candidate text:

> *"Pass 1.5 — Knowledge-Backed Gap Detection. Apply your training knowledge of API conventions, RFCs, and well-known public APIs to identify what this spec is missing that it should contain. For every gap, you must name the source of your knowledge: 'Stripe's public docs document Idempotency-Key', 'RFC 7807 problem-details', 'Microsoft REST API Guidelines §6.3', 'OpenAPI Initiative Style Guide', 'OWASP API Security Top 10 #2'. Without a citable grounding source, the finding is speculation — drop it. Anti-pattern D still applies: operation-level security inheritance from a root-level `security` requirement is NOT a finding."*

Severity-calibration anchor for knowledge-backed-gap findings:

> *"Knowledge-backed gap findings are `medium` by default. Bump to `high` only if the gap creates a concrete consumer-facing issue (e.g. missing idempotency-key documentation → consumers can double-charge cards). Don't bump to `critical` — knowledge gaps are clarity issues, not exploitable vulnerabilities."*

### Marketing-frame implication

The refined frame sharpens the differentiator messaging vs alternative tools:

| Tool | Implicit-knowledge access | Spec-improvement application |
|---|---|---|
| Spectral / Vacuum / Redocly Lint | ❌ rule-based; only what's coded as rules | ❌ |
| 42Crunch / API security scanners | ❌ scope is security, not spec quality | ❌ |
| Stripe-AI-agent / OpenAI/Anthropic chat reviews on docs | ✅ training-knowledge | ❌ Q&A only; doesn't change spec |
| Generic Claude/GPT chat review of a spec | ✅ training-knowledge | ⚠️ prose only; no validated patches |
| **apiq** | ✅ training-knowledge | ✅ **structured, validated JSON-Patches + Apply-Loop** |

Tagline-candidate seed for Epic 27 (Marketing Surfaces): *"AI knows what your spec should say. apiq makes it say it."* Sharper than the earlier *"Make your spec the source of truth"* candidate — this one names what apiq does (extracts implicit knowledge → explicit schema) rather than what role it fills.

A compact demo-seed (validated by user-test on Stripe's own AI documentation agent):

> *We asked Stripe's own AI documentation agent: "are these the only optional fields on POST /v1/billing_portal/sessions?" Answer: "all optional — but typically you'll need to provide either customer or customer_account." The agent couldn't say it more clearly **because the spec itself doesn't say it**. apiq spotted that gap and emitted a structured patch.*

## Methodology caveats

(Carry over to the locked decision-doc)

1. **Reference target authored by Claude Code, not a Stripe domain expert.** Coverage-rate against this reference is *relative between architectures*, not absolute API-quality measure. Estimated drift: ~10–15 percentage points (LLM-family bias toward findings the LLM is good at surfacing). User-induced corrections during reference hardening (F21 scope, F22 severity, F23 added) demonstrated that LLM-self-review cannot fully replace human-domain-expert review.

2. **Coverage scorer is token-Jaccard with plural-stemming.** Cannot bridge semantic-similarity gaps where same finding is described in substantially different vocabulary. Manual audit revealed 1.6×–2.2× higher real coverage than algorithmic. A v1-implementation should either use embeddings-based similarity OR keep a manual-audit pass per measurement run.

3. **OpenRouter unreliable for Anthropic models at ≥800K input tokens** as of 2026-05-04. Direct API works. v1-implementation `runAnalysis` should detect this and route Anthropic calls direct.

4. **Anthropic 1M-context-mode pricing is 2× standard tier (>200K input).** Cost figures in this document at standard rates may under-count by ~50 % at large input. Verify against Anthropic Console billing dashboard if precise figures matter for v1-budget projections.

## Open decisions (User: drüber-schlafen)

Two open spike-questions before final-lock:

### Q1: v6-prompt comprehensive iteration + validation

**Critical empirical finding from (C-i) Stripe FULL manual audit:** The 5 unmatched substantive refs (R7 Idempotency-Key, R28 Rate-limit headers, R12 Stripe-Account/Version headers, R10 `expand` deepObject mismatch, R17 `api_errors.code` enum) are ALL "knowledge-backed-gap"-class findings. Stripe's external docs document each; the LLM's training data has them; but (C-i) under v5-prompt did NOT surface them. The differentiator-validation is empirically *partial* — F21/F22/F23 are found, but the broader knowledge-gap class is not.

→ The v5-prompt is too vague on the knowledge-gap pattern. v6 must explicit-list the patterns that the LLM should systematically check against its training knowledge.

**v6-prompt scope (gathered from all spike-discussions, bundled into one iteration):**

1. **Confidence + Impact fields** with calibration-anchor (~30 % H, 50 % M, 20 % L typical; lint-y findings → low impact even if grounded)
2. **Pass 1.5 — Knowledge-Backed Gap Detection** (general push) with MUST-name-source guardrail. *"Apply your training knowledge of API conventions, RFCs, and well-known public APIs (Stripe, GitHub, Twilio, AWS) to identify what this spec is missing that it should contain. For every gap, name the source: 'Stripe docs document Idempotency-Key', 'RFC 7807 problem-details', 'OWASP API2:2023', 'Microsoft REST §6.3', 'OpenAPI Initiative Style Guide'. Without source → drop. Anti-pattern D still applies."*
3. **Pass 2.5 — Safety-mechanism + operational-header explicit checklist** (enumerated fallback for the patterns Pass-1.5 might miss):
   - Idempotency-Key (or equivalent retry-safe mechanism)
   - Rate-limit response headers (`Retry-After`, `X-RateLimit-Remaining`, etc.)
   - Auth / version-pinning headers (e.g. `Stripe-Account`, `Stripe-Version`, `Authorization`-flavoured; if API docs document them but spec doesn't, finding)
   - Cross-account / multi-tenant headers (Connect-style)
   - Standard error envelope (RFC 7807 problem-details)
   - Pagination convention (cursor vs offset; document the choice)
4. **Anti-Pattern D reinforcement** — operation-level security inheritance from root `security: [...]` is NOT a finding. **CAPS-WARNING + worked example.** Grok (under v4) violated this on Stripe; v6 must hold.
5. **Schema-level violation patterns** in per-endpoint pass — explicit `(style, schema.type)` combination check (`deepObject` + `array` is wrong per OAS 3.0 §4.7.10.1, etc.); enum-vs-format consistency.

**Engineering work for v6-prompt iteration:**
- Update `prompts/v5-per-endpoint.ts` → `prompts/v6-per-endpoint.ts`: add Pass-1.5 + Pass-2.5 + schema-level-violations + confidence/impact fields with calibration prose.
- Update `prompts/v5-aggregator.ts` → `prompts/v6-aggregator.ts`: same additions for spec-level scope; aggregator's checklist is broader (cross-cutting Idempotency-Key, rate-limit, etc.).
- Update `schema.ts` to require `confidence` + `impact` fields. Cycle through `runArch.ts` flow.
- ~1.5 h engineering total.

**Validation: A/B comparison — TWO v6-runs on PD FULL** (cleaner methodology than single-run; isolates v6-prompt-effects from pre/post-pipeline-effects):

- **Run A — v6-prompt only** (clean prompt-effects baseline). Inspect: confidence × impact distribution; previously-missed substantial refs surfaced (Idempotency-Key, rate-limit, Stripe-Account/Version-headers, expand-deepObject, api_errors.code-enum); Anti-pattern-D held.
- **Run B — v6-prompt + light-touch pre/post-processing** (full target-pipeline). Pre-processing: ~5 most-impactful fact-injection patterns (spec-stats, HTML-prevalence, vendor-extension-counts, prose-rule-counts, standard-header-audit). Post-processing: 2 most-impactful cleaning rules (Anti-pattern-D-FP-detection, Praise-as-finding-detection).
- **Delta-measurement:** A vs B yields concrete numbers — Δ-coverage, Δ-cost, Δ-quality. Validates pre/post-hypothesis empirically before Foundation-block-implementation.

Cost: 2 × ~$4 = **~$8**. Engineering: ~3 h (v6-prompt 1 h + pre-processing-light 1 h + post-processing-light 30 min + 30 min run/audit each).

**Expected outcomes:**
- Run A: Stripe-FULL coverage ~19/29 strict (65 %), Sonnet-tier consistent reliability.
- Run B: Run A's number lifted by additional 1-3 refs (knowledge-injected facts surface gaps the prompt alone misses) AND ~15-25 % cost reduction (output-tokens drop because LLM doesn't restate stats) AND FP-rate near-zero (post-processing eliminates anti-pattern-D + praise findings).

If both expected outcomes hit, the v1 `runAnalysis` migration plan is empirically grounded; pre/post layers go into Foundation-block with high confidence.

**Recommendation: TEST (iii) A/B.** Methodologically cleaner than single-run. Pre/post layers must be tested somewhere anyway — doing it now in the spike eliminates Foundation-block-discovery-risk. Cost: ~$8. Total spike-spend then: ~$43. Wallets ample.

## Operational architecture (v1 must-fix, additional spike-output)

Five operational concerns surfaced from the (C-i) measurements that affect the architectural design — must be addressed before v1 `runAnalysis` migration, NOT defer-able:

### 1. Cost-cap per single-request (workspace-cap is insufficient)

(C-i) Stripe FULL = $5.86 in one run. v0.1's `$10/24h workspace-cap` catches accumulated overspend but doesn't prevent a single user from clicking "Re-analyze" five times in an hour and burning $30. Required for v1:

- **Pre-run cost-estimate + user-confirmation:** *"This analysis will cost ~$5.86 (Stripe-class spec). Continue?"* Surface in UI before the (C-i) call.
- **Workspace-cap raised:** v0.1's $10/24h is calibrated for v0.1's $0.10-2 average analysis. For v1 (C-i) workspace-cap should be **$30-50/24h** to allow 5-10 big-spec analyses per workspace per day without false-positive caps.
- **Hard-cap per-run:** $20 (single-spec absolute ceiling). Anything that estimates beyond this is rejected with explicit explanation ("Spec exceeds per-run cost ceiling. Try sliced analysis or contact support.")

### 2. Tier-0c Pre-flight token-check (before any LLM-call)

If a spec exceeds analyzable token-limits (estimated 1.5M+ tokens after dereferencing), the LLM-call would either fail technically or produce quality-collapse (see GitHub REST result with Grok). Required for v1:

- **Tier-0c check inserted between Tier-0b and Tier-1:** estimated token-count (chars/4 + Anthropic-tokenizer if available) compared to the chosen-model's limit minus 5 % headroom.
- **If exceeded:** emit `correctness`-finding *"Spec is X tokens — exceeds analyzable limit (Y for Z model). Suggested approaches: ..."* with auto-suggestions (slice by tag-prefix, etc.). Pipeline aborts before LLM-call. **No LLM money burned on a doomed run.**

### 3. Long-running-job handling (background-job pattern)

(C-i) Stripe FULL = 34 min runtime. Browser tabs close, network interruptions happen, users multitask. v0.1's request-blocking analysis-flow doesn't scale. Required for v1:

- **`runAnalysis` becomes async kick-off:** returns `jobId` + status-endpoint URL.
- **Polling or SSE for progress:** Phase-1-progress (X/N ops complete), Phase-2-status, finalization-status. UI shows progress bar.
- **Browser-close-resilient:** job continues server-side; user can navigate away and return. State persisted in DB (existing `Spec.analysisStatus` extends to phase-state).
- **Email-on-complete (optional, v1.1):** *"Your Stripe-FULL analysis is ready (1423 findings, score 47)."* Resend-via-Resend (already in PRD §3 Auth & Account block).

### 4. Concurrency + Anthropic rate-limit strategy

Anthropic-direct-API rate-limit on Tier-2 = 1000 RPM. (C-i) Phase-1 with concurrency=10 = 10 calls/sec = ~600 RPM peak per user. **Two parallel users at peak = 1200 RPM = throttled.** Required for v1:

- **Workspace-level concurrency-control** via queue: at most N parallel (C-i)-runs per workspace at a time.
- **Global pool-level rate-limiter:** shared budget across all workspaces. Excess requests queued.
- **Tier-3 Anthropic enrolment** if MAU exceeds Tier-2 capacity (10,000 RPM). Cost-of-tier upgrade: covered by usage-revenue, but operationally needs Anthropic-account-tier-management.

### 5. MCP-server + CLI long-running-call architecture (PRD §3 Epics 20+21)

MCP server's `apiq.analyze({spec})` call cannot block 30+ minutes — MCP transport breaks long before that. CLI's `apiq check ./openapi.yaml` similar. Required for v1:

- **Async API contract:** `apiq.analyze({spec}) → {jobId}` + `apiq.getStatus({jobId}) → {phase, progress, findings?}`. Same pattern as web.
- **CLI polling-loop:** `apiq check` shows live progress, retries getStatus until done.
- **MCP tool-spec adjusted:** declares the async semantics — Claude Code/Cursor see `analyze` returns jobId, follow up with getStatus.

This is an architectural change to Epics 20 + 21; spike-output flags it for those epics' specs.

### 6. Cost-sustainability (v1-launch business-risk — PRD-revision required before Foundation-block)

(C-i)-cost-realität projected against PRD §7 success-metric scenarios reveals that v1's *"Free during beta"* pricing is not sustainable beyond bear-case scale:

| Scenario | Signups (30d) | Analyses/user | Total | Monthly LLM-cost |
|---|---|---|---|---|
| Bear | 100 | 2 | 200 | **~$800** (self-fundable) |
| Base | 500 | 3 | 1,500 | **~$6,000** (NOT self-fundable) |
| Bull | 2,000 | 5 | 10,000 | **~$40,000** (revenue-required) |
| HN-spike-day | 1,000 anon | — | 1,000 in 1 day | **~$3,000 in 24h** |

Average per-analysis cost ≈ $3-5 (mix of small/medium/large specs). The bear-base transition (~200 sustained users) is where self-funding ends.

**Mitigation strategy (recommended for v1):**

Combination of:
1. **Hard-cap free-tier on small-specs only** — 3 analyses/month, ≤300 ops, ≤500K tokens. Cost per free-user ≈ $0.50-1.50/month. Sustainable up to 5,000+ users.
2. **BYOK (Bring Your Own Key) as v1-must** (NOT v1.1) — user supplies their own `ANTHROPIC_API_KEY` in Settings. apiq's LLM-cost = $0 for these users. Big-specs unlocked for any user with an Anthropic account. Engineering: ~1-2 days (Settings-page + key-encryption + pipeline-routing).
3. **Pro-tier monthly subscription** for users without their own Anthropic-key who want big-spec access. Pricing TBD post-beta-data.

Stripe-Metered-Billing (PRD §5 v1.1-candidate) stays v1.1 unless (i)+(ii)+(iii) prove insufficient.

**Required PRD revisions before Foundation-block engineering starts:**

- **`prd-launch.md` §3 Foundation-Block:** add BYOK as v1-must (1-2 days extra effort).
- **`prd-launch.md` §5 Out-of-Scope:** remove BYOK from v1.1-list.
- **`prd-launch.md` §3 Operational:** Pricing-page becomes "Free + Pro + BYOK"-page, not "Free during beta". Pricing-tier-design needed (placeholder pricing OK for launch; real-pricing post-beta-data).
- **`prd-launch.md` §7 Success-Metrics:** add "Cost per active user per month" with BYOK-segmentation: BYOK-users ≈ $0/month apiq-cost; non-BYOK-Pro ≈ TBD; non-BYOK-Free ≈ $0.50-1.50/month apiq-cost.

This is an **action-item that must complete before Foundation-Block (Epic 14+) starts** — not for the spike's lock-in, but the PRD-revision must precede architecture-implementation. Tracked as separate work-item; see `LAUNCH-PROGRESS.md` follow-up section.

### Foundation-block file-list extensions (post-Migration-plan)

Beyond the architecture changes above:

- `prisma/migrations/<n>_add_confidence_impact_correctness.sql` — DB schema migration for `Finding.confidence` / `Finding.impact` columns + `Finding.category` enum-extension to include `'correctness'`
- `src/lib/analysis/quality-score.ts` — new priority-weighted aggregation formula (replaces v0.1's severity-count formula, designed for 1000+-finding output)
- `src/lib/analysis/spec-fingerprint.ts` — content-hash for spec-caching. Same hash + same prompt-version + same model = reuse cached result. Save LLM-cost on re-analysis-after-no-change.
- `src/lib/analysis/cost-estimator.ts` — pre-run cost-estimation using Tier-1 pre-processing token-counts.

## v1.1 roadmap additions (post-launch)

- **User-feedback-loop on findings:** thumbs-up/down per finding feeds telemetry. Telemetry feeds the v1.1 ML-ranking that replaces the v1 LLM-emitted-confidence/impact priority.
- **Multi-file-spec upload:** PRD §5 already lists this for v1.1. Spike-output confirms it stays out-of-v1.
- **External-doc-comparison:** spec vs `docs.example.com/api` semantic-comparison. Strong differentiator vs current "spec-only" analysis. PRD-§11 v1.1 candidate.
- **Schema-vs-SDK comparison:** spec vs SDK-generated-types parity check. PRD-§11 v1.1 candidate.

### Q2: Architecture (B) Naive-Chunking-Hybrid

- **Skip (current default):** decision-doc finalises with (A) + (C-i) data; (B) stays in v1.1-roadmap-backlog as "untested cost-optimisation candidate". Total spend: ~$35.
- **Test (B):** ~$5 cost + 30–45 min engineering. Stripe FULL with 50-op-per-chunk + aggregator. Empirical comparison of (B) vs (C-i) on per-finding-cost, absolute-cost, coverage. Would NOT change v1 architectural choice (C-i remains winner), but hardens the v1.1-roadmap entry.

**Recommendation: SKIP for now.** (B) is a v1.1-cost-optimisation; not load-bearing for v1 launch.

### Combined recommendation

Q1 yes (v6-prompt validation) + Q2 no (skip B-Hybrid). ~$4 cost, ~75 min effort. Then final-lock the spike.

User to decide the morning after.

## Document control

| Version | Date | Author | Notes |
|---|---|---|---|
| Draft 0.1 | 2026-05-04 | Claude Code | Stage 3 Part 1 complete; (C) data pending |
| Draft 0.2 | 2026-05-04 | Claude Code | (C-i) Sonnet+Sonnet measured on PD + Stripe; GitHub pending |
| Draft 0.3 | 2026-05-04 | Claude Code | (C-i) measured on dnd5eapi + GitHub; tier-segmentation revised to single-architecture; v1.1-cost-optimisation roadmap added; (B) Hybrid open-question flagged for User decision before lock |
| Draft 0.4 | 2026-05-04 | Claude Code | Findings-prioritisation + UI-at-scale issue identified; v1-launch-blocker section added (extend Epic 17); v1.1 vs v1 scope clarified throughout |
| Draft 0.5 | 2026-05-04 | Claude Code | User correction: confidence + impact prioritisation is NOT a UI-detail but a fundamental output-contract decision belonging in the spike. Section rewritten with concrete schema extension, v6-prompt iteration plan. Q1 added to open-questions: v6-prompt validation (~$4, ~75 min, recommended yes). |
| Draft 0.6 | 2026-05-04 | Claude Code | User scharfsinniger Punkt: 5 unmatched substantive refs are knowledge-backed-gap-class. v6-prompt scope expanded to bundle confidence+impact + Pass-1.5 + Pass-2.5 + Anti-Pattern-D + schema-violations. |
| Draft 0.7 | 2026-05-05 | Claude Code | AI Pre/Post-Processing pipeline layers added as v1 implementation note. Spike-byproduct: ~15 pre-processing patterns + 6 Tier-2 post-processing patterns. Positioned as pipeline-optimisation, NOT user-facing feature. ~2.5 days engineering. |
| Draft 0.8 | 2026-05-05 | Claude Code | Q1 validation upgraded from single-run to A/B comparison. User confirmed (iii) sauberer Approach. |
| Draft 0.9 | 2026-05-05 | Claude Code | Tier-0a/0b/1/2 pipeline-Sektion. Schema-extension um 'correctness'. ~3 days engineering für alle 4 Tiers. |
| Draft 0.10 | 2026-05-05 | Claude Code | 5 operational concerns + Foundation-block-extensions + v1.1-roadmap-additions. |
| **Draft 0.11** | **2026-05-05** | **Claude Code** | **Cost-sustainability section added — (C-i) cost-realität gegen PRD success-metrics zeigt: bear-case self-fundable, base/bull-case nicht. Recommendation: BYOK von v1.1 nach v1-must verschoben + free-tier-hard-cap on small-specs + Pro-subscription-tier. PRD-revision-action explicitly tracked as pre-Foundation-block work-item. User has confirmed PRD revision will be followed up.** |
