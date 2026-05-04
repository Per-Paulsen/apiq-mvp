# Manual Coverage Audit — Stage-3 Runs

> Manually-annotated coverage of LLM-emitted findings vs the 29-finding Stripe-FULL reference target.
> Scope: Stripe FULL runs only (PagerDuty has no reference target — qualitative observations only).
> Author: Claude Code, 2026-05-04. User-reviewed.
>
> **Why manual:** the algorithmic coverage scorer (`scripts/spike/score-coverage.ts`) is token-Jaccard-based + plural-stemmed, but cannot bridge semantic similarity gaps where LLM and reference describe the same finding with substantially different vocabulary. Manual audit recovers the real coverage rate.

## Reference target

29 findings at `openapi-examples/stripe-full/reference/findings-target-big.md`. F1–F29.

---

## Run: Gemini 2.5 Pro · Stripe FULL

12 findings emitted. Algorithmic coverage: 5/29 (17.2%). Manual coverage:

| LLM-Finding | Match | Notes |
|---|---|---|
| G1: Default error responses inconsistent | **MATCH F6** | Single default response — same finding, different wording |
| G2: String maxLength too permissive | **MATCH F24** | maxLength=5000 — exact same |
| G3: Idempotency key not documented | **MATCH F7** | Same; F7=risk vs G3=design (cat-mismatch only) |
| G4: Mutually exclusive parameters not formal | **MATCH F21** | Same finding (paired-parameter rules); F21=spec, G4=endpoint (scope-mismatch only) |
| G5: Integer/number range constraints missing | **MATCH F25** | Same (455 of 455 fields without min/max) |
| G6: Format attribute missing for content-types | partial F11 | F11 is specifically about unix-time; G6 broader. Generous match. |
| G7: OperationIds inconsistent | partial F26 | F26 about verbosity, G7 about casing. Related, not same. |
| G8: Server URL trailing slash | **MATCH F1** | Exact same |
| G9: Examples missing on complex schemas | partial F27 | F27 about requestBody examples, G9 broader. Related. |
| G10: Rate-limit headers not defined | **MATCH F28** | Exact same |
| G11: Compositional schemas empty descriptions | **MATCH F29** | Same (1096 of 1385 schemas empty) |
| G12: Contact email general dev alias | **FALSE POSITIVE** | dev-platform@stripe.com IS monitored |

**Strict matches: 8/29 = 27.6 %.** **Generous matches (incl. partial): 11/29 = 37.9 %.** False positives: 1/12 (8.3 %).

---

## Run: Grok 4.1 Fast · Stripe FULL

9 findings emitted. Algorithmic coverage: 2/29 (6.9 %). Manual coverage:

| LLM-Finding | Match | Notes |
|---|---|---|
| G1: No global security requirement on spec | **FALSE POSITIVE** | Stripe HAS global security: `[basicAuth, bearerAuth]`. Anti-pattern D violation. |
| G2: Write endpoints lack operation-level security | **FALSE POSITIVE** | Same — operation-level inheritance from global is correct OpenAPI. Anti-pattern D. |
| G3: List endpoints miss pagination cursors | **FALSE POSITIVE** | Stripe HAS cursor pagination (`starting_after`, `ending_before`). Verifiably wrong. |
| G4: Missing 4xx/5xx response schemas | **MATCH F6** | Same as Gemini's G1 |
| G5: OperationIds use inconsistent casing | partial F26 | F26 is about verbosity; G5 about casing. Related. |
| G6: Sparse examples on complex schemas | **MATCH F27** | Zero requestBody examples |
| G7: Deprecated endpoints lack deprecation info | **MATCH F13/F19** | Maps to either of the deprecation findings |
| G8: Missing descriptions on enum values | new (not in ref) | Possibly valid, unverified — partial F29 only if charitable |
| G9: Cyclic refs not documented | **FALSE POSITIVE** | This is OUR pipeline's `{$ref: "#cyclic"}` marker; not a Stripe-spec issue |

**Strict matches: 3/29 = 10.3 %.** **Generous: 4/29 = 13.8 %.** **False-positive rate: 4/9 = 44.4 %.**

The false-positive rate is the headline number for Grok on Stripe: nearly half of emitted findings are wrong. v4-prompt anti-pattern D not held; pagination check incorrect; pipeline-artifact mistaken for spec issue.

---

## PagerDuty FULL (no reference target — qualitative)

### Sonnet 4.6 — 20 findings

Spot-check of findings shows **high specificity and verifiable detail**:

- G2: "GET /incidents/{id}/workflow_instances returns 201 instead of 200" — exact spec-citation, verifiable.
- G7: "Content-Based Intelligent Grouping aggregate enum contains a comma-separated string" — concrete finding.
- G15: "Automation runner create response exposes plain-text 'secret' in example" — concrete risk finding.
- G17: "Typo 'Reqeuest' in responder request description" — pinpointed.

Pattern: **detailed, spec-grounded, low false-positive rate.** This matches the v0.1 spike's "Sonnet quality" reputation.

### Grok 4.1 Fast — 19 findings

Significant prompt-following issue: **first 4 findings are NOT findings**:

- G1: "Global security covers all endpoints" — praise, not finding (severity=low/risk)
- G2: "Contact email is official PagerDuty address" — praise
- G3: "No credentials or secrets in spec text" — praise
- G4: "Server URL clean, no trailing slash" — praise

These are *observations of correct behaviour*, not findings of issues. The v4 prompt instructs the model to emit findings (issues), not validate the spec is OK. Grok mis-interprets the task framing.

Of the remaining 15 findings, several are valid (G5: analytics POST endpoints lack pagination, G15: idempotency keys, G14: early-access headers not formalised). False-positive estimate: ~20–25 % including the praise-as-findings.

---

## Quality summary across all runs

| Run | Findings | Real Match Rate (strict) | False-Positive Rate | Notes |
|---|---|---|---|---|
| Gemini Stripe FULL | 12 | **27.6 %** | 8.3 % | Best raw match; some borderline cat/scope-mismatches |
| Grok Stripe FULL | 9 | **10.3 %** | **44.4 %** | Anti-pattern violations; pipeline-artifact misread |
| Sonnet PagerDuty | 20 | n/a (no ref) | low (~5 %) | Premium quality, spec-grounded |
| Grok PagerDuty | 19 | n/a (no ref) | ~20–25 % | Praise-as-findings, prompt-following weakness |

## Headline conclusions

1. **Real coverage is 1.6×–2.2× higher than algorithmic** (Gemini Stripe: 17.2% algorithmic → 27.6% strict / 37.9% generous manual). The algorithmic scorer under-counts. **None of the runs reach the 60 % pass-criterion** even with generous manual matching.

2. **Sonnet 4.6 quality > Gemini 2.5 Pro > Grok 4.1 Fast** for spec-quality findings, holding prompt constant. Sonnet is the only model that delivers both low false-positive and (likely) high real-coverage. But: Sonnet is missing the Stripe-FULL data point because OpenRouter provider issues at 920K ctx.

3. **Grok's false-positive rate is the disqualifier on this prompt.** 44.4 % FP on Stripe + ~20–25 % FP on PagerDuty. Grok's quality on small-medium specs may still be OK for the budget tier; on large specs the prompt-following weakness compounds.

4. **The v4 prompt is Sonnet-calibrated.** Other models follow it less reliably. v5-iteration with Anti-Pattern-D reinforcement is the natural next step — but: needs Sonnet-direct-API-data (the missing Stripe FULL point) to validate first.
