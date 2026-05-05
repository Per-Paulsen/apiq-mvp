# apiq Spectral Ruleset — Coverage Map

Maps each rule in `apiq-ruleset.yaml` to the reference findings it targets across the 4 reference specs (Stripe FULL, PagerDuty FULL, dnd5eapi, GitHub REST).

**Authored:** 2026-05-05 (Task A1.2)
**Total `isPureSpectralDetectable: true` refs across 4 references:** 73 (stripe:20 + pd:17 + dnd:10 + github:26)
**Custom apiq-rules in `apiq-ruleset.yaml`:** 27
**OAS3-default rules pulled in via `extends: spectral:oas`:** 56 (total Spectral instance: 83 rules)

## Coverage matrix — apiq custom rules

Each row links one custom rule to the reference findings it claims to detect. "(varies)" means the finding shape exists in that spec but the specific ID was not catalogued; the rule still fires.

| Rule | Stripe | PagerDuty | dnd5eapi | GitHub |
|---|---|---|---|---|
| `apiq-fk-fields-need-format-or-pattern` | F23 | F12 | — | F22 |
| `apiq-unix-time-format-on-timestamp-fields` | F11 | — | — | (varies) |
| `apiq-limit-parameter-needs-bounds` | — | F11 | — | F19 (per-page) |
| `apiq-limit-property-needs-bounds` | F25 (partial) | F11 | — | F19 |
| `apiq-deepobject-only-on-objects` | F10 | — | — | — |
| `apiq-no-ref-siblings` | — | — | F5 | — |
| `apiq-description-no-html-markup` | F3 | — | — | — |
| `apiq-schema-description-not-stub` | — | — | F11 | — |
| `apiq-info-description-substantive` | — | — | — | F10 |
| `apiq-spec-needs-tags-array` | F2 | — | F2 (partial) | — |
| `apiq-tag-meaningful-description` | — | F13 (orphan) | F2 | — |
| `apiq-oneof-needs-discriminator` | — | F14 | — | F26 |
| `apiq-count-fields-should-be-integer` | — | — | F10 | — |
| `apiq-no-localhost-servers` | — | — | F1 | — |
| `apiq-response-needs-content` | — | F6 | — | F13 |
| `apiq-no-content-type-header-parameter` | — | F7 | — | — |
| `apiq-post-should-accept-json` | F8 | — | — | — |
| `apiq-versioning-headers-need-enum` | — | F8 | — | — |
| `apiq-default-type-matches-integer` | — | F9 | — | — |
| `apiq-default-type-matches-number` | — | (preventive) | — | — |
| `apiq-default-type-matches-boolean` | — | (preventive) | — | — |
| `apiq-default-type-matches-string` | — | (preventive) | — | — |
| `apiq-prefer-iana-markdown-mediatype` | — | — | — | F31 |
| `apiq-request-body-needs-example` | F27 | (varies) | — | — |
| `apiq-comma-separated-should-be-array` | — | — | — | F28 |
| `apiq-unused-component-headers` | — | — | — | F5 |
| `apiq-unused-component-examples` | — | — | — | F29 (partial) |

## OAS3-default-handled refs (no custom rule needed)

These refs are caught by `spectral:oas` rules pulled in via `extends`, so the apiq custom ruleset deliberately doesn't duplicate them.

| Ref | Default Spectral rule that handles it |
|---|---|
| stripe:F1 (server trailing slash) | `oas3-server-trailing-slash` |
| stripe:F4 (bearerFormat free-form) | `oas3-schema` (validates against OAS schema) |
| stripe:F5 (api_errors.message not required) | partially `oas3-schema`; also covered by `apiq-default-type-matches-*` for type checks |
| stripe:F13 (deprecated prose only) | `oas3-schema` validates `deprecated` flag presence — partial; full prose-vs-flag detection deferred to LLM |
| stripe:F14 (5 ops missing description) | `operation-description` |
| stripe:F15 (24 ops missing summary) | `operation-summary` (if not part of `spectral:oas` defaults, fold into apiq layer; current Spectral 6.x does include it via `spectral:oas-recommended`) |
| stripe:F19 (deprecation inconsistent across cards/bank_accounts) | none directly; pattern-spotting deferred to Walker |
| pd:F17 (info.license/termsOfService missing) | `info-license` + `info-license-url` (via spectral:oas) |
| dnd:F3 (47 ops missing operationId) | `operation-operationId` |
| dnd:F4 (25 ops missing description) | `operation-description` |
| dnd:F13 (info.contact.email) | `info-contact` (presence only — email-specific check deferred) |
| github:F11 (servers[0].description) | partially `oas3-schema` |
| github:F12 (basic-error no required) | not directly; Stripe F5 / GitHub F12 both follow same pattern — recommend Walker rule "well-known error envelopes should have required fields" |
| github:F21 (28 ops missing description) | `operation-description` |
| github:F24 (single-tag-per-op convention undocumented) | `operation-tag-defined` (warns if op tag not in top-level array) |

## Refs deferred to Walkers layer (Task A1.3)

These require statistical aggregation, occurrence counting, or cross-spec ratio thresholds that Spectral's per-node DSL cannot express cleanly. Each is flagged in `apiq-ruleset.yaml`'s comments and should be picked up by a `Walker` deterministic detector.

| Ref | Why Walker, not Spectral |
|---|---|
| stripe:F24 (`maxLength: 5000` everywhere) | Requires counting same-value occurrence across >2000 properties + ratio threshold (>50%) |
| stripe:F29 (79% schemas with empty-string description) | Percentage aggregation; Spectral fires per-schema and would emit 1096 findings |
| github:F17 (97% schemas without `additionalProperties`) | Percentage aggregation across 814 object schemas |
| github:F18 (99.8% strings without `maxLength`) | Percentage aggregation across 8037 string properties |
| github:F20 (42% schemas without description) | Percentage aggregation; Spectral defaults emit per-schema |
| github:F8 (Link-header missing on 81 list endpoints) | Requires classifying each GET as list-vs-detail (response shape: array body), then per-class aggregation |
| github:F16 (pagination convention undocumented in `info.description`) | Walker enumerates pagination param shapes, then checks `info.description` mentions them |
| pd:F19 (`additionalProperties` absent on 518/520 schemas) | Same shape as github:F17 — percentage aggregation |
| pd:F16 (76% schemas missing description) | Percentage aggregation |
| pd:F22 (`$ref` chain into Conflict schema — 1800+ refs) | Walker counts cross-reference-component patterns and flags topology |
| pd:F10 (pagination paradigm split: 37 offset + 14 cursor) | Walker classifies pagination strategy per list endpoint, then flags split |
| pd:F23 (only 19 of 272 schemas have `example`) | Percentage aggregation |
| pd:F5 (two error envelope shapes coexist) | Walker collects all referenced response-body schemas and clusters by shape |
| github:F30 (`x-github-breaking-changes` 21 ops, semantically hidden) | Walker counts the extension and reasons about its semantics; Spectral can flag presence but not advise |
| stripe:F26 (operationId verbose machine-generated) | Walker measures p50/p90 length and flags above threshold |
| github:F25 (3.0.3 → 3.1 migration recommendation) | Single-shot Walker check on `openapi:` field + presence of `x-webhooks` |
| stripe:F16 (search endpoints page-based vs cursor-based) | Walker classifies pagination per-endpoint |
| stripe:F18 (error payload exposes nested schemas) | Walker checks `api_errors`-like schemas for ref-resolution depth |
| stripe:F25 (455/455 numeric properties have no range) | Aggregation — Spectral emits per-property, Walker rolls up |

## Refs deferred to Domain-Knowledge layer (Task A2)

These require an external API-family catalogue (Stripe-knowledge, GitHub-knowledge, PagerDuty-knowledge, IETF/RFC standards) that the deterministic Spectral layer cannot encode. Each finding is `isDomainKnowledgeDetectable: true` in the reference JSON.

| Ref | Domain catalogue needed |
|---|---|
| stripe:F7 (Idempotency-Key on POSTs) | Stripe's docs.stripe.com/api/idempotent_requests catalogue |
| stripe:F12 (Stripe-Account, Stripe-Version headers) | Stripe header convention catalogue |
| stripe:F9 (`x-stripeBypassValidation` semantics) | Stripe vendor-extension catalogue |
| stripe:F17 (`api_errors.code` enum from docs.stripe.com/error-codes) | Stripe error-code dictionary |
| stripe:F28 (rate-limit response headers) | Stripe rate-limit doc page |
| github:F2 (X-GitHub-Api-Version header) | GitHub api-versions docs |
| github:F14 (429 response on rate-limited operations) | GitHub rate-limit doc page |
| github:F15 (Idempotency-Key advisory) | Industry best-practice catalogue |
| github:F23 (`x-github` extension semantics) | GitHub vendor-extension catalogue |
| pd:F1 (OAuth2 scheme alongside api_key) | PagerDuty OAuth-scopes catalogue |
| pd:F2 (From header on writes) | PagerDuty audit-log convention |
| pd:F3 (X-EARLY-ACCESS stability signal) | PagerDuty stability-extension knowledge |
| pd:F4 (Retry-After / X-RateLimit on 429) | RFC 6585 + IETF ratelimit-headers draft + industry baseline |
| pd:F18 (Error code enumeration) | PagerDuty errors documentation |
| dnd:F8 (RFC 7807 conformance) | RFC 7807 standard knowledge |
| dnd:F9 (pagination convention absent) | Industry best-practice |

## Refs deferred to LLM-only layer (Stage-B)

These require NLP / semantic reasoning that no rule-based detector can express reliably.

| Ref | Why LLM-only |
|---|---|
| stripe:F13 (prose-only deprecation marker) | NLP needed to distinguish "deprecated" prose from false positives |
| stripe:F20 (wrong summary "Create a card" on bank_accounts) | Cross-reference operation semantics with description prose |
| stripe:F21 (parameter-relationship rules in prose only) | NLP on description fields ("required when X", "mutually exclusive with Y") |
| stripe:F22 (ambiguous customer/customer_account relationship) | Semantic similarity + relationship reasoning |
| pd:F15 (prose-only deprecation marker) | Same as stripe:F13 |
| pd:F20 (conditional-validation rules in prose only) | NLP on field descriptions |
| dnd:F12 (path-parameter naming inconsistency) | Cross-path semantic reasoning |
| github:F9 (webhooks under `x-webhooks` instead of native) | Schema-shape recognition |
| github:F27 (binary-upload content-type) | NLP on operation description |
| pd:F8 (Accept header version vocabulary) | Partial — schema-level rule + NLP for full coverage |

## Validation status

The ruleset was validated against `@stoplight/spectral-core@1.22.0` on 2026-05-05:

- YAML parses cleanly (top-level keys: `extends`, `formats`, `rules`)
- All 27 custom rules accepted by `Spectral.setRuleset()` (after function-name and format-name resolution against `@stoplight/spectral-functions` and `@stoplight/spectral-formats`)
- Combined with `extends: [[oas, 'all']]`, the Spectral instance carries 83 rules total
- Smoke-run on a synthetic mini-spec fired 6 of 27 custom rules correctly (the rest target patterns absent from that mini-spec)

The runner that integrates this ruleset (Task A1.1, currently a stub at `scripts/spike/deterministic/spectral-runner.ts`) needs to perform the same function-name and format-name resolution that the temp-validator did. Recommended pattern (or install `@stoplight/spectral-ruleset-bundler` for the official path):

```ts
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Spectral } = require('@stoplight/spectral-core');
const { oas } = require('@stoplight/spectral-rulesets');
const fns = require('@stoplight/spectral-functions');
const fmts = require('@stoplight/spectral-formats');
const yaml = require('yaml');
const fs = require('fs');

function resolveRuleset(parsed: any): any {
  const walk = (node: any): any => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(walk);
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'function' && typeof v === 'string') out[k] = fns[v];
      else if (k === 'formats' && Array.isArray(v)) {
        out[k] = v.map((f: any) => (typeof f === 'string' ? fmts[f] : f));
      } else out[k] = walk(v);
    }
    return out;
  };
  return walk(parsed);
}

const text = fs.readFileSync('deterministic/apiq-ruleset.yaml', 'utf8');
const resolved = resolveRuleset(yaml.parse(text));
const s = new Spectral();
s.setRuleset({
  rules: resolved.rules,
  formats: resolved.formats,
  extends: [[oas, 'all']],
});
```
