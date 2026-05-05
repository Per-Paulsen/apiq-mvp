# Stripe FULL Reference — Classification Review

> Per-finding review of the classification tags I (Claude Code) seeded into
> `findings.json` during the migration from `findings-target-big.md`. The user
> should glance through this and flag any tag that looks wrong. Coverage
> headline numbers (especially knowledge-backed-coverage 28.6%, pure-spectral
> coverage 45%, domain-knowledge coverage 0% under v5) all hang on these tags
> being right.
>
> Edit either this file (and re-run the migration) or directly in
> `findings.json` (changes will be lost on next re-run unless you also edit
> the `STRIPE_CLASSIFICATIONS` map in `scripts/spike/eval/migrate-md-to-json.ts`).

## Distribution summary

- **Lint-flavoured:** 6/29 (F1, F4, F14, F15, F20, F26) — surface / cosmetic / Spectral-default-rule-class
- **Knowledge-backed-gap:** 14/29 (F3, F6, F7, F8, F9, F10, F12, F16, F17, F18, F21, F22, F23, F28) — the differentiator class (LLM training-knowledge → schema constraints)
- **Pure-spectral detectable:** 20/29 — pure spec-walk + standard rules (Spectral-OAS3-defaults class). No domain knowledge required.
- **Domain-knowledge detectable:** 4/29 (F7, F9, F12, F28) — spec-walk + hardcoded API-family knowledge ("if Stripe → expect Idempotency-Key").
- **LLM-only (neither det-tag):** 5/29 (F17, F18, F20, F21, F22) — NLP-level reasoning required; only an LLM can find these.
- **Cluster keys assigned:** 5 (missing-error-response, missing-description, missing-summary, limit-no-range, empty-schema-description)

## Tag semantics (cheatsheet)

- **Lint** = surface/cosmetic. Drop these for "substantive coverage" calculation.
- **KGap** = knowledge-backed-gap. The differentiator class — LLM training data has the answer.
- **PSpec** = pure-spectral-detectable. Stage-A pure-Spectral-class layer (no domain knowledge).
- **DomK** = domain-knowledge-detectable. Stage-A domain-layer (Stripe-specific patterns hardcoded).
- **Cluster** = `expectedClusterKey`. If non-empty, this finding *should* match a cluster of LLM findings rather than a single one (rollup-class).

A finding can be PSpec OR DomK but not both (cleanliness). If neither, it's LLM-only.

## Per-finding tags

| F# | Sev | Title | Lint | KGap | PSpec | DomK | Cluster | Reasoning |
|---|---|---|---|---|---|---|---|---|
| F1 | low | Server URL has a trailing slash | ✓ | ✗ | ✓ | ✗ | — | Spectral has this as default rule. Cosmetic. |
| F2 | med | No top-level `tags` block; 587 operations untagged | ✗ | ✗ | ✓ | ✗ | — | Spectral can detect "tags array empty". Substantive (kills nav). |
| F3 | high | Operation descriptions use HTML markup; OAS expects CommonMark | ✗ | ✓ | ✓ | ✗ | — | Regex-detectable. Knowledge-backed (CommonMark-Standard). |
| F4 | low | `bearerAuth.bearerFormat` is set to a non-standard value | ✓ | ✗ | ✓ | ✗ | — | Whitelist of standard values. Spectral-class. |
| F5 | high | `api_errors.message` is not in `required` | ✗ | ✗ | ✓ | ✗ | — | Walk the required arrays. Spectral-class. |
| F6 | med | All write operations use a single `default` response | ✗ | ✓ | ✓ | ✗ | missing-error-response | Walk responses, count statuses. KGap = HTTP-status-knowledge. |
| F7 | high | `Idempotency-Key` not declared on 293 POST/PUT/PATCH ops | ✗ | ✓ | ✗ | ✓ | — | **DomK only** — Stripe-specific expectation. Pure spec-walk can't know to expect it. |
| F8 | med | POST endpoints accept only `application/x-www-form-urlencoded` | ✗ | ✓ | ✓ | ✗ | — | Walk content-types. Spectral could flag "no JSON content-type". |
| F9 | med | `x-stripeBypassValidation` vendor extension on 538 enum fields | ✗ | ✓ | ✗ | ✓ | — | **DomK only** — Stripe-specific anti-pattern. Generic walker doesn't know. |
| F10 | high | `expand` deepObject + schema.type:array — OAS 3.0 §4.7.10.1 violation | ✗ | ✓ | ✓ | ✗ | — | Walk parameters with style+type combo. OAS-spec rule. Spectral-class. |
| F11 | med | 5 unix-epoch integer fields lack `format: "unix-time"` | ✗ | ✗ | ✓ | ✗ | — | Heuristic on field-name endings (`_at`, `_timestamp`). |
| F12 | med | `Stripe-Account` and `Stripe-Version` headers not declared | ✗ | ✓ | ✗ | ✓ | — | **DomK only** — Stripe-specific operational headers. |
| F13 | high | Three ops with prose-only deprecation markers, no `deprecated: true` | ✗ | ✗ | ✓ | ✗ | — | Regex on description for "deprecated"/"will be removed". |
| F14 | low | Five operations missing `description` | ✓ | ✗ | ✓ | ✗ | missing-description | Spectral default. |
| F15 | med | 24 operations missing `summary` | ✓ | ✗ | ✓ | ✗ | missing-summary | Spectral default. |
| F16 | med | `/search` endpoints use page-based; rest cursor-based | ✗ | ✓ | ✓ | ✗ | — | Compare pagination patterns across endpoints (internal consistency). |
| F17 | low | `api_errors.code` typed as free-form string, documented as enum | ✗ | ✓ | ✗ | ✗ | — | **LLM-only** — needs NLP on description ("documented as enum"). |
| F18 | med | Error payloads expose nested PaymentIntent / PaymentMethod schemas | ✗ | ✓ | ✗ | ✗ | — | **LLM-only** — semantic decision (schema leak). |
| F19 | high | Deprecation marking inconsistent across `/cards` and `/bank_accounts` | ✗ | ✗ | ✓ | ✗ | — | Cross-check resource families. |
| F20 | low | POST /customers/{c}/bank_accounts has wrong `summary` ("Create a card") | ✓ | ✗ | ✗ | ✗ | — | **LLM-only** — semantic mismatch (path vs summary). |
| F21 | high | Parameter-relationship rules in prose only, not JSON-Schema | ✗ | ✓ | ✗ | ✗ | — | **LLM-only** — NLP detection of "required when X". The differentiator. |
| F22 | med | POST /billing_portal/sessions: ambiguous `customer` vs `customer_account` | ✗ | ✓ | ✗ | ✗ | — | **LLM-only** — NLP / semantic disambiguation. |
| F23 | high | Cross-resource reference fields typed as plain `string`, no `$ref` | ✗ | ✓ | ✓ | ✗ | — | Heuristic on FK-named fields (`*_id`). PSpec-detectable but pattern catalog is borderline domain. |
| F24 | med | `maxLength: 5000` is spec-wide default for strings | ✗ | ✗ | ✓ | ✗ | — | Count + threshold (>50% of all string maxLengths). |
| F25 | high | Integer/number properties have zero range constraints | ✗ | ✗ | ✓ | ✗ | limit-no-range | Count fields without min/max. |
| F26 | med | `operationId` values verbose machine-generated names | ✓ | ✗ | ✓ | ✗ | — | Heuristic on operationId length / character composition. |
| F27 | med | Zero operations carry `requestBody` examples | ✗ | ✗ | ✓ | ✗ | — | Walk requestBodies, count examples. |
| F28 | med | Rate-limit response headers not declared on any operation | ✗ | ✓ | ✗ | ✓ | — | **DomK only** — industry-best-practice not OAS-mandated. Pattern library is "all REST APIs should declare X-RateLimit-*". |
| F29 | low | 79% of component schemas carry empty-string `description` | ✗ | ✗ | ✓ | ✗ | empty-schema-description | Count + threshold. |

## Likely review-discussion points

- **F23** is the only PSpec finding tagged simultaneously with KGap. The argument is: detecting "FK-named string fields without `$ref`" is a heuristic walker (PSpec), but knowing it *matters* (i.e. that consumers want typed cross-references) is knowledge. I currently say PSpec=true to be optimistic about Stage-A's coverage. Could be argued it's better as DomK or even LLM-only.
- **F28** (rate-limit headers): on the line between DomK (industry-best-practice catalog) and PSpec (the catalog could be encoded as a generic Spectral rule). I went DomK because the catalog is non-trivial to maintain.
- **F11** (unix-time format): the "152 consistent usages elsewhere" makes this *internally-consistent-detectable*. Heuristic on `*_at` / `_timestamp` field-names → very Spectral-able. PSpec=true is correct.
- **F2** (no tags) is *not* lint-flavoured because the impact (no nav, no SDK module structure) is high — but it IS Spectral-detectable (count tags). So `lint=false, pspec=true`. Could be reasoned the other way (Spectral lint).
- **F17 / F18 / F20 / F21 / F22** are the five LLM-only findings (PSpec=false AND DomK=false). If you disagree with any of these — i.e. think it's actually catchable by a generic walker — flag it, because that changes Stage-A's projected scope.
- **F12 + F28** assume a domain-knowledge-layer that recognizes Stripe-style operational headers. If the Stage-A scope ends up not having such a layer, these become LLM-only and the domain-knowledge bucket shrinks to F7 + F9.

## After review — how to apply changes

1. Edit either this file's tags column OR the `STRIPE_CLASSIFICATIONS` map in `scripts/spike/eval/migrate-md-to-json.ts`.
2. Re-run migration: `cd scripts/spike && npx tsx eval/migrate-md-to-json.ts`
3. Re-score the baseline: `npx tsx eval/score-run.ts ../../specs/big-spec-runs/eval/c-i-baseline-stripe__<latest>.json`
4. Re-lock the snapshot: `npx tsx eval/snapshot.ts lock c-i-baseline-stripe ../../specs/big-spec-runs/eval/c-i-baseline-stripe__<latest>.scored.json`

The headline coverage numbers will shift by the corrected count; document the shift in the next commit.
