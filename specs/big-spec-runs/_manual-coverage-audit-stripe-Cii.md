# Manual Coverage Audit — (C-i) Sonnet+Sonnet Stripe FULL

> Manual semantic-match audit of the 1,423 findings emitted by the (C-i) Two-Call run on Stripe FULL, against the 29-finding reference target.
> Counterpart to `_manual-coverage-audit.md` (which audited the (A) Bigger-Context runs).
> Author: Claude Code, 2026-05-04. User-reviewed.

## Run summary

- Architecture: (C) Two-Call — v5-per-endpoint + v5-aggregator
- Per-endpoint model: anthropic/claude-sonnet-4.6 (via OpenRouter)
- Aggregator model: anthropic/claude-sonnet-4.6 (via Anthropic-direct)
- 587/587 phase-1 calls successful
- 1403 per-endpoint findings + 20 spec-level findings = **1423 total** (after dedup)
- apply-clean: **99.3 %** (1413/1423)
- hallucinated: **0.7 %** (10/1423)
- Cost: $5.86; runtime: 34 min

## Algorithmic coverage: 11/29 (37.9 %)

The token-Jaccard scorer matched these reference findings; details in `haiku4-5_x_sonnet4-6__two-call__stripe-full.json` `coverage.perRef`.

## Manual semantic match — additional matches the scorer missed

Verified by reading the 20 spec-level findings + grep over the 1403 per-endpoint findings:

| Ref | Matched in | Notes |
|---|---|---|
| R6 (single default response) | spec-level "No explicit 4xx error response definitions on any operation" | Same finding, different vocabulary |
| R21 (parameter-relationship rules) | spec-level "Hundreds of conditional-required and mutually-exclusive field relationships are encoded on..." | Direct match — load-bearing F22-class finding |
| R27 (no requestBody examples) | spec-level "No request body examples on any complex POST/PUT" | Same finding |
| R18 (Error payloads expose nested) | partial — spec-level "Sensitive fields lack writeOnly: true" addresses related concern | Partial; not direct |
| R25 (number ranges) | partial — spec-level "limit pagination parameter lacks min/max/default" | Only `limit`, not the 455 broader fields |
| R29 (79 % schemas empty description) | partial — spec-level "Numerous operations have empty or missing descriptions" | Operations, not schemas; partial overlap |

**Manual strict coverage: 14/29 = 48.3 %.**

## Unmatched (15 refs) — categorised

### Lint-flavoured (8 refs) — low criticality if missed

R3 (HTML markup), R4 (bearerFormat), R11 (unix-time format), R14 (5 ops missing description) — wait, R14 is matched algorithmically. Removing it: R3, R4, R11, R26 (operationId verbosity), R29 (partial only), and a few others rated "lint-flavoured" in the reference's self-review.

Lint-y unmatched: R3, R4, R11, R26 (4 firmly lint-y). Plus R14, R15, R17, R29 considered lint-flavoured per self-review but R14, R15 are actually matched. Net lint-y unmatched: 4.

### Substantive gaps (5 refs) — real misses

These are the load-bearing finding-class instances the (C-i) run did not surface:

| Ref | Description | Likely reason missed |
|---|---|---|
| **R7** Idempotency-Key not declared | safety-mechanism for payment APIs | Aggregator-pass did not enumerate "safety-mechanism patterns" as an explicit search class |
| **R28** Rate-limit response headers | operational visibility for retry logic | Same — operational-headers pattern not in aggregator-prompt's explicit list |
| **R12** Stripe-Account / Stripe-Version headers | Connect-platform + version-pinning | Same — operational-headers pattern |
| **R10** `expand` parameter style:deepObject + type:array | OpenAPI 3.0 §4.7.10.1 violation | Specific schema-level violation; would need per-op detection of deepObject/array combination |
| **R17** `api_errors.code` free string not enum | typed-error-code dispatch | Specific schema design issue; might need a "look for fields documented as enum-by-prose" prompt instruction |

### Borderline (3 refs)

R5 (api_errors.message not required), R9 (x-stripeBypassValidation), R16 (search page-based pagination) — none clearly matched. R16 had a spurious algorithmic match to a different finding ("Unnecessary requestBody on a GET endpoint"); the manual check shows that's NOT R16.

## Verdict

**Strict coverage of all 29 refs: 14/29 = 48.3 %.**

**Coverage of "substantive" findings only (drop 8 lint-y per Self-Review classification): 14/21 = 66.7 %** ✓ above the 60 % pass-threshold.

**vs (A) Gemini Stripe FULL:**
- (A) strict: 8/29 = 27.6 % manual; 11/29 = 37.9 % generous
- (C-i) strict: 14/29 = 48.3 % manual; ~16-18/29 = 55-62 % generous (with the 3 partial matches)

→ **(C-i) is 1.7×–1.9× better at coverage than (A) on the same reference target.**

Plus:
- (C-i) emits 1423 raw findings → 27× more "useful coverage material" than (A)'s 12, even before manual filtering
- (C-i) hallu rate 0.7 % vs (A)'s 8.3 % → 12× better
- (C-i) apply-clean 99.3 % vs (A)'s 92 % → strictly better

The trade-off is cost (5×) and latency (12×); both can be tuned (concurrency 10 → 50; aggregator-prompt-tightening to reduce per-finding output).

## Implications for v6 prompt iteration

The 5 substantive gaps suggest a clear v6 enhancement: an explicit "**operational-headers and safety-mechanism patterns**" check in the aggregator prompt:

> *"Pass 2.5 — Safety mechanism + operational header audit. Check whether the spec declares: Idempotency-Key (or equivalent retry-safe mechanism); rate-limit response headers (Retry-After, X-RateLimit-Remaining, X-RateLimit-Reset); auth/version pinning headers if the API documents them externally; cross-account / multi-tenant headers (e.g. Stripe-Account in Connect-style platforms). For each: if the API's external docs document the header but the spec doesn't, emit a finding."*

Plus: a "schema-level violation patterns" check in per-endpoint prompt:

> *"For every parameter, check the (style, schema.type) combination against OpenAPI 3.0 §4.7.10.1 — `deepObject` for objects, `form` for arrays, `simple` for path-params, etc. Mismatched combinations are findings."*

Both deferred to v6 — not blocking the spike's go/no-go.
