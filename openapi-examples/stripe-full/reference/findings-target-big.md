# Reference Target — Stripe FULL Findings (Big-Spec)

> Manually-authored "gold standard" findings document for the apiq Big-Spec Architecture Spike (Epic 09).
> 29 findings. Initial draft: 20. F21–F22 added during user-prompted senior-engineer hardening; F23 added after user-prompted generalisation surfaced the "spec-knowledge-asymmetry" pattern as a systemic finding-class. F24–F29 added 2026-05-04 (post-Stage-3 reference completeness pass) after Gemini-2.5-Pro's run on Stripe FULL surfaced 6 strong, spec-grounded findings I had missed during initial drafting (string maxLength=5000 default, integer/number range constraints, operationId verbosity, requestBody examples, rate-limit response headers, empty schema descriptions). Each F24–F29 is empirically measured against the spec, see the per-finding narration. F21's scope corrected from endpoint to spec on the same day after user push-back surfaced that the pattern is spec-wide. F22's severity corrected from high to medium and its hard-reject claim weakened to "relationship not documented" after user fact-checked it against Stripe's own documentation AI-agent. Distribution: 0 critical · 9 high · 14 medium · 6 low. All three categories represented (16 clarity / 12 design / 1 risk). 22 spec-scope · 7 endpoint-scope.
> Used as the coverage baseline (≥60% match required per Epic 09 Acceptance Criterion #4 / Pass-Criterion 3).
> Authoring date: 2026-05-04. Drafted by Claude Code; pending user review.
>
> **Authoring discipline:** every finding is hard-grounded in the actual spec text at `openapi-examples/stripe-full/spec.json` (commit `011d8e301d28a95e1b8898229954d79da3e0fa43`, version `2026-04-22.dahlia`). When in doubt, the path → JSON-pointer reference is included so the finding can be verified against the source.
>
> **No `critical` findings.** Stripe is one of the most polished public OpenAPI specs in the wild (rotated demo keys, monitored contact mailbox `dev-platform@stripe.com`, root-level `security: [basicAuth, bearerAuth]` correctly inherited by all writes). The v0.1 spike's calibration anchor — *"On large polished specs, critical findings are RARE"* — applies here. Severity inflation on Stripe FULL would itself be a finding-quality bug.

## Spec under review

- Source: `openapi-examples/stripe-full/spec.json`
- Endpoint count: 587
- Path count: 414
- OpenAPI version: 3.0.0
- Component schemas: 1385
- Estimated input tokens (cycle-stripped, dereferenced): ~926 K

---

## Finding 1 — Server URL has a trailing slash

- **category:** design
- **severity:** low
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Remove the trailing slash from `servers[0].url`.

### narration

`servers[0].url` is `https://api.stripe.com/`. The trailing slash is concatenated with each operation's `path` (which itself starts with `/`), producing `https://api.stripe.com//v1/charges` in URL-builders that naively join the two. RFC 3986 normalises the doubled slash for HTTP, so requests still succeed, but downstream tooling — code generators (openapi-generator, OpenAPI TS), HTTP clients with strict URL-validation, OpenAPI mock servers — emits warnings or strips the duplicate inconsistently. The OpenAPI 3.0 specification §4.7.5 recommends omitting the trailing slash on `servers[].url` to keep URL composition unambiguous.

### rationale

OpenAPI 3.0 §4.7.5 ("Server Object") notes that the `url` value SHOULD NOT include a trailing slash. RFC 3986 §6.2.3 treats `https://host//x` and `https://host/x` as syntactically distinct identifiers even though most server stacks normalise the former.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/servers/0/url",
    "value": "https://api.stripe.com"
  }
]
```

---

## Finding 2 — No top-level `tags` block; 587 operations untagged

- **category:** clarity
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Add a top-level `tags` array and tag every operation with its resource family.

### narration

The spec declares no top-level `tags` array, and not a single one of its 587 operations carries `tags: [...]`. As a result, every documentation portal that consumes this spec (ReDoc, SwaggerUI, Stoplight Elements) renders a flat 587-item operation list with no navigation grouping. AI-codegen tools that synthesise SDK module structure from `tags` cannot derive a sensible package layout — every operation lands in a single namespace. Stripe's own Dashboard documentation groups by resource (Customers / Charges / Subscriptions / Invoices / etc.); the OpenAPI spec carries none of that grouping signal because the path-prefix is the only available proxy. This is the single most consequential clarity issue in the spec.

### rationale

OpenAPI 3.0 §4.7.4 ("Operation Object") names `tags` as the canonical signal for grouping operations into navigable sections. The OpenAPI Initiative style guide and the conventions used by GitHub's REST API spec, Twilio's spec, and the Microsoft REST API guidelines all rely on per-operation `tags` for SDK module structure and documentation navigation.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/tags",
    "value": [
      { "name": "Customers", "description": "Customer records and their attached resources." },
      { "name": "Charges", "description": "Direct charge creation (legacy; use Payment Intents for new integrations)." },
      { "name": "PaymentIntents", "description": "The recommended primitive for accepting payments." },
      { "name": "Subscriptions", "description": "Recurring billing." },
      { "name": "Invoices", "description": "Invoicing for one-time and recurring billing." }
    ]
  }
]
```

---

## Finding 3 — Operation descriptions use HTML markup; OpenAPI 3.x assumes CommonMark

- **category:** clarity
- **severity:** high
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Convert HTML markup in operation `description` fields to CommonMark.

### narration

582 of 587 operations have `description` values that contain inline HTML — `<p>`, `<a>`, `<code>`, `<strong>`. For example, `paths./v1/account.get.description` reads `"<p>Retrieves the details of an account.</p>"`. The OpenAPI 3.0 specification states that all `description` fields support **CommonMark** Markdown. Renderers therefore expect Markdown source, and the most popular ones (ReDoc, SwaggerUI, Stoplight Elements) treat the HTML as either passed-through raw text or as Markdown-with-inline-HTML — but their handling diverges, especially around block elements. AI agents that consume the spec to generate documentation prompts get HTML they then have to sanitise or convert. Schema descriptions (1385 entries) are already plain text; only the operation `description` fields are HTML, suggesting a documentation-pipeline mismatch where Stripe's docs portal is HTML-driven but the published spec is the unmigrated source.

### rationale

OpenAPI 3.0 §3 ("Specification") states: *"Throughout the specification description fields are noted as supporting CommonMark markdown formatting."* CommonMark §6 ("HTML blocks") allows raw HTML inside Markdown, but consistently using HTML rather than Markdown defeats the cross-renderer compatibility that the standard provides.

### patchOps (RFC 6902)

```json
[]
```

(No automatic patch — the conversion is mechanical for `<p>`/`<code>` but requires per-paragraph review for nested lists and complex markup. The fix is a documented spec-pipeline change at Stripe; here we surface the issue rather than half-converting.)

---

## Finding 4 — `bearerAuth.bearerFormat` is set to a non-standard value

- **category:** clarity
- **severity:** low
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Drop `bearerFormat` from `bearerAuth` or set it to `"api-key"`.

### narration

`components.securitySchemes.bearerAuth.bearerFormat` is `"auth-scheme"`. RFC 6750 ("The OAuth 2.0 Authorization Framework: Bearer Token Usage") and the OpenAPI 3.0 specification both treat `bearerFormat` as a free-form hint to the consumer about what kind of token to expect — examples in the OpenAPI specification are `"JWT"`, `"opaque"`, `"api-key"`. The string `"auth-scheme"` is not a token-format hint; it appears to be a copy-paste artifact (perhaps from an internal tooling field that names the scheme rather than the format). Codegen tooling that reads `bearerFormat` to specialise the SDK shape will make the wrong choice, and human readers learn nothing about what to put in the header.

### rationale

OpenAPI 3.0 §4.7.27.1 documents `bearerFormat` as "a hint to the client to identify how the bearer token is formatted" with non-normative examples like `JWT`. RFC 6750 distinguishes the bearer **scheme** from the bearer **format**; the value here conflates the two.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/securitySchemes/bearerAuth/bearerFormat",
    "value": "api-key"
  }
]
```

---

## Finding 5 — `api_errors.message` is not in `required`

- **category:** design
- **severity:** high
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Add `"message"` to `required` on the `api_errors` schema.

### narration

The error-payload schema at `components.schemas.api_errors` declares `required: ["type"]`. Every other field — `message`, `code`, `param`, `doc_url`, `request_log_url`, `decline_code`, `advice_code` — is optional. Since the entire spec uses this schema (wrapped in `error.error`) as the `default` response body for every operation, consumers cannot rely on receiving a human-readable `message` from any failed call. In practice Stripe's runtime always returns `message`, but the spec contract permits an empty error body with only `{"type": "api_error"}` — which a strict client generator (or a defensive consumer relying on the schema as the source of truth) must treat as the documented response shape, leading to either over-defensive null-checks across the client or runtime crashes when `message` is unexpectedly absent. The `type` field alone — one of four enum values — is not enough to drive user-facing error handling.

### rationale

The OpenAPI 3.0 specification's JSON Schema `required` field is a contract: properties not listed there are optional and clients must handle their absence. RFC 7807 ("Problem Details for HTTP APIs") §3.1 names `title` and `status` as recommended-required for problem documents. The general industry pattern (Microsoft REST API Guidelines, Google AIP-193) marks the human-readable error message as required so error-handling code is dispatchable rather than defensive.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/schemas/api_errors/required",
    "value": ["type", "message"]
  }
]
```

---

## Finding 6 — All write operations use a single `default` response with no per-status differentiation

- **category:** design
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Add explicit `400` / `401` / `402` / `404` / `429` response entries on write operations.

### narration

All 325 POST/PUT/PATCH/DELETE operations declare exactly two responses: `200` and `default`. The `default` entry references `#/components/schemas/error` and is meant to apply to every non-200 status. In practice, Stripe's API returns rich status differentiation: `400` for validation errors, `401` for missing/invalid auth, `402` for declined cards, `403` for permission errors on Connect, `404` for missing resources, `409` for idempotency-key conflicts, `429` for rate limits, `5xx` for transient server errors. A consumer reading the spec cannot tell the spec which status to dispatch on at compile time; the `default`-only model defers everything to runtime. AI-codegen tools that build typed result shapes (e.g. `Result<Charge, BadRequestError | UnauthorizedError | RateLimitedError>`) cannot do so from this spec — they degenerate to `Result<Charge, GenericError>`, losing all the dispatch information Stripe's runtime actually produces.

### rationale

OpenAPI 3.0 §4.7.18 ("Responses Object") describes per-status entries as the primary mechanism for documenting response variation. RFC 7807 problem-detail conventions and Microsoft's REST guideline 7.10 both recommend documenting each meaningful status code rather than relying on a single catch-all.

### patchOps (RFC 6902)

```json
[]
```

(No automatic patch — the fix requires authoring per-status response entries on every write operation, which exceeds a single mechanical transformation. The finding flags the issue; the remediation is a spec-pipeline change.)

---

## Finding 7 — `Idempotency-Key` header is not declared on any of 293 POST/PUT/PATCH operations

- **category:** risk
- **severity:** high
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Declare `Idempotency-Key` as a header parameter on every state-changing operation.

### narration

Stripe's runtime supports the `Idempotency-Key` header on every POST and most PUT/PATCH operations — it is documented at `https://docs.stripe.com/api/idempotent_requests` as the recommended way to safely retry payment-creation calls. Yet the spec declares zero parameters with `name: "Idempotency-Key"` across the 293 POST/PUT/PATCH operations. Codegen tooling that reads the spec produces SDKs without typed support for the header, forcing consumers to either patch the SDK manually or pass the header through a low-level escape hatch. The risk is not theoretical: payment-creation calls (`POST /v1/charges`, `POST /v1/payment_intents`, `POST /v1/payment_intents/{intent}/confirm`) without an Idempotency-Key on retry can result in duplicate charges to a real card. By omitting the header from the contract, the spec hides one of the most important safety mechanisms Stripe offers.

### rationale

RFC 7231 §4.2.2 ("Idempotent Methods") names idempotency as a contract property of HTTP methods; for POST (which is not inherently idempotent) the `Idempotency-Key` convention pioneered by Stripe is the de-facto industry pattern (also adopted by GitHub, Square, PayPal). Omitting it from the spec means the safety pattern is invisible to the consumer who only reads the spec.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/components/parameters",
    "value": {
      "IdempotencyKey": {
        "in": "header",
        "name": "Idempotency-Key",
        "required": false,
        "description": "A unique key per request to safely retry without creating duplicates. See https://docs.stripe.com/api/idempotent_requests.",
        "schema": { "type": "string", "maxLength": 255 }
      }
    }
  }
]
```

(Per-operation `parameters: [{"$ref": "#/components/parameters/IdempotencyKey"}]` additions follow as a second mechanical pass.)

---

## Finding 8 — POST endpoints accept only `application/x-www-form-urlencoded`; not `application/json`

- **category:** design
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Add `application/json` content-type alongside `application/x-www-form-urlencoded` on POST operations.

### narration

All 292 of 292 POST operations declare exactly one request-body content-type: `application/x-www-form-urlencoded`. None accept `application/json`. This is a historical Stripe API design choice (the API predates JSON-everywhere REST) but creates real friction for modern consumers: AI-codegen tools default to JSON; OpenAPI documentation portals render the form-encoding tab less prominently than JSON; consumers passing structured nested data (e.g. `expand[]` or `metadata[key]`) must hand-encode using PHP-style bracket notation rather than nested JSON objects. The single-content-type declaration also blocks a low-friction migration path: Stripe could accept JSON behind the scenes without changing the spec, but until the spec advertises it, consumers will not adopt it.

### rationale

RFC 7159 / RFC 8259 establish JSON as the dominant REST request format. OpenAPI 3.0 §4.7.13 ("Request Body Object") allows multiple content-types per operation specifically so APIs can document both legacy and modern transports. Microsoft REST API Guidelines §7.4 lists JSON as the default request format unless the API has resource-shape reasons to differ.

### patchOps (RFC 6902)

```json
[]
```

(Spec-wide change; no automatic patch. Per-operation `requestBody.content` augmentation is mechanical but voluminous.)

---

## Finding 9 — `x-stripeBypassValidation` vendor extension exposed on 538 enum fields signals non-authoritative enums

- **category:** clarity
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Either remove `x-stripeBypassValidation` from the public spec or document its semantics in a top-level `info.description` note.

### narration

The vendor extension `x-stripeBypassValidation: true` appears on 538 enum fields across the spec — for example `components.schemas.account.properties.business_type` declares `enum: ["company", "government_entity", "individual", "non_profit"]` and `x-stripeBypassValidation: true`. The extension is undocumented in the spec itself; reverse-engineering its name suggests "this enum is not validated server-side", which means the listed enum values are *not* the authoritative set and the API may accept other values. A consumer that reads the spec assumes enums are exhaustive (per OpenAPI 3.0 conventions). With `x-stripeBypassValidation` widely scattered across the spec, the spec quietly tells consumers "the enums you see are advisory, not contractual" — but only if you know what the extension means. AI-codegen tools that emit strict-enum types based on the spec will produce TypeScript / Rust enums that exclude valid values seen at runtime. Either remove the extension before publishing or document it explicitly so consumers know the enums are open sets.

### rationale

OpenAPI 3.0 §3.4 ("Specification Extensions") permits `x-` extensions but expects them to be either documented or to have semantic meaning visible from context. JSON Schema §6.1.2 ("Validation Keywords for Any Instance Type") treats `enum` as a closed set. A spec that emits closed-enum syntax while flagging the enum as non-authoritative under a vendor extension creates a contract gap.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/info/description",
    "value": "The Stripe REST API. Please see https://stripe.com/docs/api for more details.\n\nNote: Properties annotated with `x-stripeBypassValidation: true` may accept additional values beyond those listed in `enum`. The enumerated values represent the most common cases and are advisory rather than contractual."
  }
]
```

---

## Finding 10 — `expand` parameter declares `style: deepObject` but `schema.type: array` on 270 operations

- **category:** design
- **severity:** high
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Change `style: "deepObject"` to `style: "form"` on the `expand` parameter (`type: array` is correct; `deepObject` is for objects).

### narration

Across 270 operations the `expand` query parameter is shaped as `{ "in": "query", "name": "expand", "explode": true, "style": "deepObject", "schema": { "type": "array", "items": { "type": "string" } } }`. The `style: deepObject` value is defined by OpenAPI 3.0 §4.7.10.1 specifically for **objects** with `explode: true`, used to encode nested object structures in query strings (e.g. `?filter[name]=foo&filter[active]=true`). For an **array** of strings, the correct style is `form` (the default for query parameters) or `pipeDelimited` / `spaceDelimited`. The `deepObject + array` combination is undefined behaviour in OpenAPI 3.0; concrete consequences vary by tooling: openapi-generator emits broken serialisation code, ReDoc renders the parameter incorrectly, and Stoplight Elements warns. At runtime Stripe's API actually expects the form-encoded `expand[]=path.to.field` shape, which `style: form` with `explode: true` produces correctly.

### rationale

OpenAPI 3.0 §4.7.10.1 ("Style Values") explicitly maps `deepObject` to objects (with the example `{ "color": { "R": 100 } }`) and `form` to arrays. RFC 6570 ("URI Template") templates `{?list*}` (the form style) and `{?obj*}` (the deepObject style) are syntactically distinct.

### patchOps (RFC 6902)

```json
[]
```

(Per-operation patch — there are 270 instances of this parameter shape. The fix is mechanical: replace `style: "deepObject"` with `style: "form"` on every `parameter` named `expand` whose `schema.type` is `array`. No single JSON pointer covers them.)

---

## Finding 11 — 5 unix-epoch integer fields lack `format: "unix-time"` despite 152 consistent usages elsewhere

- **category:** clarity
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Add `format: "unix-time"` to the 5 unix-epoch integer fields that are missing it.

### narration

The spec uses the non-standard `format: "unix-time"` on 152 integer properties to document "seconds since the Unix epoch" — for example `components.schemas.account.properties.created` correctly declares `{ "type": "integer", "format": "unix-time", "description": "Time at which the account was connected. Measured in seconds since the Unix epoch." }`. Five further fields contain the same description but omit the `format`:

- `components.schemas.account_terms_of_service.properties.date`
- `components.schemas.card_issuing_account_terms_of_service.properties.date`
- `components.schemas.payment_intent_next_action_pix_display_qr_code.properties.expires_at`
- `components.schemas.sigma.sigma_api_query.properties.created`
- `components.schemas.subscription_item.properties.created`

The inconsistency confuses codegen tools that map `format: "unix-time"` to a domain-specific `Timestamp` type — those five fields land as raw `int` while the surrounding 152 fields land as `Timestamp`, producing a fragile API surface. The fix is to add `"format": "unix-time"` on each of the five.

### rationale

JSON Schema §7.3.3 ("Implementation Requirements") and OpenAPI 3.0 §3.7.1 ("Data Types") permit non-standard `format` values; what matters is internal consistency. Stripe's spec adopts `unix-time` as a convention; the spec breaks its own convention five times.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/components/schemas/account_terms_of_service/properties/date/format",
    "value": "unix-time"
  },
  {
    "op": "add",
    "path": "/components/schemas/card_issuing_account_terms_of_service/properties/date/format",
    "value": "unix-time"
  },
  {
    "op": "add",
    "path": "/components/schemas/payment_intent_next_action_pix_display_qr_code/properties/expires_at/format",
    "value": "unix-time"
  },
  {
    "op": "add",
    "path": "/components/schemas/sigma/sigma_api_query/properties/created/format",
    "value": "unix-time"
  },
  {
    "op": "add",
    "path": "/components/schemas/subscription_item/properties/created/format",
    "value": "unix-time"
  }
]
```

---

## Finding 12 — `Stripe-Account` and `Stripe-Version` headers are not declared on any operation

- **category:** clarity
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Declare `Stripe-Account` and `Stripe-Version` as common header parameters; reference them where relevant.

### narration

Stripe's REST API documents two operationally-critical request headers: `Stripe-Account` (used by Connect platforms to act on behalf of a connected account) and `Stripe-Version` (pins the API version per request, overriding the account default). Both are documented at `https://docs.stripe.com/api/versioning` and `https://docs.stripe.com/connect/authentication`, and both are observable on every Stripe SDK's request path. Neither appears in the OpenAPI spec — searching all 587 operations and `components.parameters` returns zero matches. Codegen tools that read the spec emit SDKs without typed support for either header. Connect integrators (a non-trivial slice of Stripe's audience) must reach for low-level header-injection escape hatches; version-pinning, which is a strongly-recommended Stripe practice, is invisible to consumers who only read the spec.

### rationale

OpenAPI 3.0 §4.7.10 ("Parameter Object") supports header parameters as first-class. Headers that are part of the documented API contract belong in the spec; absence of these two well-documented headers is a contract gap. Microsoft's REST API Guidelines §7.6 names version negotiation via header as a first-class API concern that should appear in the spec.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/components/parameters",
    "value": {
      "StripeAccount": {
        "in": "header",
        "name": "Stripe-Account",
        "required": false,
        "description": "Connect platforms: ID of the connected account to act on behalf of. See https://docs.stripe.com/connect/authentication.",
        "schema": { "type": "string", "pattern": "^acct_" }
      },
      "StripeVersion": {
        "in": "header",
        "name": "Stripe-Version",
        "required": false,
        "description": "Pin the API version for this request, overriding the account default. See https://docs.stripe.com/api/versioning.",
        "schema": { "type": "string", "example": "2026-04-22.dahlia" }
      }
    }
  }
]
```

---

## Finding 13 — Three operations have prose-only deprecation markers but `deprecated: true` is not set

- **category:** clarity
- **severity:** high
- **scope:** endpoint
- **affectedEndpoints:** POST /v1/charges, GET /v1/exchange_rates, GET /v1/exchange_rates/{rate_id}
- **patchSummary:** Set `deprecated: true` on the 3 operations that already announce deprecation in prose.

### narration

Three operations carry deprecation language in their `description` field but do **not** set the OpenAPI `deprecated: true` flag:

- `POST /v1/charges` — *"This method is no longer recommended—use the Payment Intents API to initiate a new payment instead."*
- `GET /v1/exchange_rates` — *"[Deprecated] The ExchangeRate APIs are deprecated. Please use the FX Quotes API instead."*
- `GET /v1/exchange_rates/{rate_id}` — same prose marker.

OpenAPI tooling — codegens, lint tools, documentation portals — reads `deprecated: true` to flag operations as legacy in generated SDKs (e.g. `@deprecated` annotations in TypeScript / Java) and to grey-out entries in docs. Prose-only deprecation is invisible to that tooling. Consumers who use the auto-generated Stripe SDKs based on this spec will get first-class type-safety on `POST /v1/charges` with no deprecation hint, even though Stripe's own runtime guidance is to migrate. The fix is mechanical: set `deprecated: true` on each operation. The prose can stay as the "why" / "what to use instead" detail.

### rationale

OpenAPI 3.0 §4.7.4 ("Operation Object") defines `deprecated` as a boolean signal for tooling. The spec's authors clearly know about deprecation (they wrote the prose), so the omission is an oversight rather than a stylistic choice. Microsoft REST API Guidelines §12.4 ("Deprecation") recommends the machine-readable flag *and* prose, not prose alone.

### patchOps (RFC 6902)

```json
[
  { "op": "add", "path": "/paths/~1v1~1charges/post/deprecated", "value": true },
  { "op": "add", "path": "/paths/~1v1~1exchange_rates/get/deprecated", "value": true },
  { "op": "add", "path": "/paths/~1v1~1exchange_rates~1{rate_id}/get/deprecated", "value": true }
]
```

---

## Finding 14 — Five operations are missing the `description` field entirely

- **category:** clarity
- **severity:** low
- **scope:** endpoint
- **affectedEndpoints:** POST /v1/application_fees/{id}/refund, POST /v1/charges/{charge}/dispute, POST /v1/charges/{charge}/dispute/close, GET /v1/customers/{customer}/discount, GET /v1/customers/{customer}/subscriptions/{subscription_exposed_id}/discount
- **patchSummary:** Add a `description` to each of the 5 operations missing it.

### narration

Five specific operations have no `description` field at all. Each is a legitimate part of Stripe's API surface — disputes, discounts, refunds — but documentation portals built from this spec render an empty body for these entries, leaving consumers to guess what they do. Every other operation in the spec has either a one-paragraph or multi-paragraph `description`. The omission is structural — likely an artefact of the internal documentation pipeline missing those entries — and the fix is one short paragraph per operation describing intent, side effects, and notable parameters.

### rationale

OpenAPI 3.0 §4.7.4 ("Operation Object") names `description` as the place for in-depth documentation. Style guides across the industry (Microsoft REST §3.5, Google AIP-192) treat per-operation description as required for any consumer-facing API.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/paths/~1v1~1charges~1{charge}~1dispute/post/description",
    "value": "Update the dispute on the specified charge. Use this to provide evidence or update dispute metadata before the dispute deadline. See https://docs.stripe.com/api/disputes/update."
  },
  {
    "op": "add",
    "path": "/paths/~1v1~1charges~1{charge}~1dispute~1close/post/description",
    "value": "Close the dispute on the specified charge, conceding to the cardholder and forfeiting the disputed funds. Once closed, the dispute cannot be reopened. See https://docs.stripe.com/api/disputes/close."
  }
]
```

(Same shape applies to the remaining three operations; abbreviated here for brevity.)

---

## Finding 15 — 24 operations missing the `summary` field, including high-traffic POST /v1/charges and POST /v1/accounts

- **category:** clarity
- **severity:** medium
- **scope:** endpoint
- **affectedEndpoints:** POST /v1/charges, POST /v1/accounts, GET /v1/apple_pay/domains, POST /v1/apple_pay/domains, GET /v1/apple_pay/domains/{domain}, DELETE /v1/apple_pay/domains/{domain}, POST /v1/application_fees/{id}/refund, GET /v1/charges/{charge}/dispute, POST /v1/charges/{charge}/dispute, POST /v1/charges/{charge}/dispute/close
- **patchSummary:** Add a one-line `summary` to each of the 24 operations missing it.

### narration

Twenty-four operations lack the `summary` field — a one-line title used by every documentation portal and by code-generators as the operation's display name in IDE autocomplete (`POST /v1/charges → "Create a charge"`). The list includes flagship endpoints: `POST /v1/charges` (the canonical pay-a-charge endpoint), `POST /v1/accounts` (Connect account creation), and the entire `/v1/apple_pay/domains` family. Without a summary, ReDoc renders these as `POST /v1/charges` (the raw method+path) where every other entry shows a human-readable title. SDK codegen tools fall back to `operationId` (`PostCharges`), which is a shape-of-name not a description-of-purpose. A one-line summary per operation is half-an-hour of work; the impact on consumer-facing surface is high.

### rationale

OpenAPI 3.0 §4.7.4 names `summary` as "a short summary of what the operation does"; tooling consumes it as the primary operation title. Operations without summary degrade the rendered docs to method+path raw display.

### patchOps (RFC 6902)

```json
[
  { "op": "add", "path": "/paths/~1v1~1charges/post/summary", "value": "Create a charge" },
  { "op": "add", "path": "/paths/~1v1~1accounts/post/summary", "value": "Create an account" },
  { "op": "add", "path": "/paths/~1v1~1apple_pay~1domains/get/summary", "value": "List Apple Pay domains" },
  { "op": "add", "path": "/paths/~1v1~1apple_pay~1domains/post/summary", "value": "Register an Apple Pay domain" }
]
```

(Abbreviated — same shape applies to the remaining 20 operations.)

---

## Finding 16 — Seven `/search` endpoints use page-based pagination while the rest of the spec uses cursor-based

- **category:** design
- **severity:** medium
- **scope:** endpoint
- **affectedEndpoints:** GET /v1/charges/search, GET /v1/customers/search, GET /v1/invoices/search, GET /v1/payment_intents/search, GET /v1/prices/search, GET /v1/products/search, GET /v1/subscriptions/search
- **patchSummary:** Document the pagination divergence — search endpoints use `page` + `limit`; list endpoints use `starting_after` + `ending_before`.

### narration

Seven operations under `/v1/{resource}/search` use page-based pagination (`page`, `limit`) instead of the cursor-based pattern (`starting_after`, `ending_before`, `limit`) used by every other list endpoint in the spec. The divergence is intentional — Stripe's Sigma-backed search endpoints sit on a different storage layer than the cursor-paginated REST endpoints — but consumers reading the spec face an unannounced pagination split. SDK codegens that build a typed `Pagination` abstraction over the spec must special-case the search endpoints; consumers building dashboards must implement two pagination strategies. The fix is not to standardise pagination (the search endpoints genuinely cannot use cursors) but to **document the divergence**: a per-operation `description` note explaining why these endpoints diverge, ideally with a top-level `info.description` paragraph linking to the broader pattern.

### rationale

OpenAPI 3.0 has no built-in pagination construct, so the spec is the only place to document the convention. The OpenAPI Initiative's API Design Style Guide and Microsoft REST §10.5 ("Pagination") name internal consistency as the dominant design lever — a divergent pattern is acceptable, an undocumented divergent pattern is not.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/paths/~1v1~1charges~1search/get/description",
    "value": "<p>Search for charges using Stripe's Sigma search syntax. Note: search endpoints use page-based pagination (`page`, `limit`) rather than the cursor-based (`starting_after`/`ending_before`) pagination used by other list endpoints in this API.</p>"
  }
]
```

(Same description-augmentation pattern applies to the other 6 search endpoints.)

---

## Finding 17 — `api_errors.code` is typed as a free-form string but is documented as an enumerated value

- **category:** design
- **severity:** low
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Replace `maxLength: 5000, type: "string"` on `api_errors.code` with an `enum` of the documented Stripe error codes.

### narration

`components.schemas.api_errors.code` is `{ "type": "string", "maxLength": 5000, "description": "For some errors that could be handled programmatically, a short string indicating the error code reported." }`. The description explicitly links to `https://docs.stripe.com/error-codes`, which lists ~150 well-defined error codes (`card_declined`, `expired_card`, `invalid_number`, `rate_limit`, `idempotency_key_in_use`, …). A consumer that wants to dispatch on `code` (e.g. retry on `rate_limit` but not on `card_declined`) cannot rely on the schema for that dispatch — the type is "any string". An `enum` with the documented values would let codegen tools emit a typed enum, would catch typos at compile time in TypeScript / Rust SDKs, and would make the spec self-documenting.

### rationale

JSON Schema §6.1.2 ("enum") is designed precisely for this case: a string that takes one of a known set of values. OpenAPI 3.0 inherits this. Microsoft REST §6.5 names typed-enum exposure as a key SDK ergonomics concern.

### patchOps (RFC 6902)

```json
[]
```

(No automatic patch — the canonical enum list is at https://docs.stripe.com/error-codes and has 150+ entries; manual extraction is required.)

---

## Finding 18 — Error payloads expose full nested PaymentIntent / PaymentMethod / SetupIntent / Source schemas

- **category:** design
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Replace nested resource references in `api_errors` with ID-only references; add a separate Expand mechanism if the full object is needed.

### narration

`api_errors` declares `payment_intent: { "$ref": "#/components/schemas/payment_intent" }`, `payment_method: { "$ref": "#/components/schemas/payment_method" }`, `setup_intent: { "$ref": "#/components/schemas/setup_intent" }`, and `source: { "anyOf": [{ "$ref": "bank_account" }, { "$ref": "card" }, { "$ref": "source" }] }`. Each of these refs expands to a hundreds-of-fields object, so when a card decline error fires, the runtime payload includes the full PaymentIntent and the full PaymentMethod (which itself includes card metadata, billing address, etc.). Two consequences: payload size — a single `card_declined` error response can exceed 100 KB; data exposure — the error response surface includes fields (e.g. `payment_method.card.fingerprint`) that consumers may not have intended to receive in error logs. The pattern of "ID-only in error, expand if needed" is industry-standard (Microsoft REST §7.10, Google AIP-202). The fix is to type `payment_intent` etc. as `{ "type": "string" }` with the ID prefix pattern, and add an explicit `expand` mechanism if the full object is required.

### rationale

OpenAPI 3.0 §4.7.21.1 ("Schema Object") allows referencing identifier-only versus full-object representations independently; choosing the latter on error payloads inflates the contract beyond what consumers typically need. RFC 7807 problem-details documents recommend keeping error bodies small and pointing at the resource via URI rather than embedding it.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/schemas/api_errors/properties/payment_intent",
    "value": {
      "type": "string",
      "pattern": "^pi_",
      "description": "ID of the PaymentIntent associated with the error. Retrieve the full object via GET /v1/payment_intents/{id} if needed."
    }
  }
]
```

---

## Finding 19 — Deprecation marking is inconsistent across the legacy `/cards` and `/bank_accounts` resource families

- **category:** clarity
- **severity:** high
- **scope:** endpoint
- **affectedEndpoints:** GET /v1/customers/{customer}/cards, POST /v1/customers/{customer}/cards, GET /v1/customers/{customer}/cards/{id}, POST /v1/customers/{customer}/cards/{id}, DELETE /v1/customers/{customer}/cards/{id}, GET /v1/customers/{customer}/bank_accounts, POST /v1/customers/{customer}/bank_accounts, GET /v1/customers/{customer}/bank_accounts/{id}, POST /v1/customers/{customer}/bank_accounts/{id}, DELETE /v1/customers/{customer}/bank_accounts/{id}
- **patchSummary:** Set `deprecated: true` on the 7 endpoints in the cards/bank_accounts legacy families that are missing the flag.

### narration

The `/v1/customers/{customer}/cards` and `/v1/customers/{customer}/bank_accounts` resource families are documented across the spec and Stripe's docs as "legacy — use Sources / PaymentMethods instead". Within these families the `deprecated` flag is applied inconsistently:

- GET /v1/customers/{customer}/cards: `deprecated: true` ✓
- POST /v1/customers/{customer}/cards: `deprecated: undefined` ✗
- GET /v1/customers/{customer}/cards/{id}: `deprecated: true` ✓
- POST /v1/customers/{customer}/cards/{id}: `deprecated: undefined` ✗
- DELETE /v1/customers/{customer}/cards/{id}: `deprecated: undefined` ✗
- GET /v1/customers/{customer}/bank_accounts: `deprecated: true` ✓
- POST /v1/customers/{customer}/bank_accounts: `deprecated: undefined` ✗ (also has `summary: "Create a card"` — see Finding 20)
- GET /v1/customers/{customer}/bank_accounts/{id}: `deprecated: true` ✓
- POST /v1/customers/{customer}/bank_accounts/{id}: `deprecated: undefined` ✗
- DELETE /v1/customers/{customer}/bank_accounts/{id}: `deprecated: undefined` ✗

The Read endpoints are flagged deprecated but the Create/Update/Delete endpoints are not — even though deprecation is per-resource-family, not per-method. SDK consumers see "this endpoint is fine to use" on POST /v1/customers/{customer}/cards while GET on the same resource warns them away. The fix is to flag all 10 endpoints with `deprecated: true`.

### rationale

OpenAPI 3.0 §4.7.4 names `deprecated` per-operation. Internal consistency within a resource family is the lever for clear consumer signal — a half-deprecated family is worse than either fully deprecated or fully active.

### patchOps (RFC 6902)

```json
[
  { "op": "add", "path": "/paths/~1v1~1customers~1{customer}~1cards/post/deprecated", "value": true },
  { "op": "add", "path": "/paths/~1v1~1customers~1{customer}~1cards~1{id}/post/deprecated", "value": true },
  { "op": "add", "path": "/paths/~1v1~1customers~1{customer}~1cards~1{id}/delete/deprecated", "value": true },
  { "op": "add", "path": "/paths/~1v1~1customers~1{customer}~1bank_accounts/post/deprecated", "value": true },
  { "op": "add", "path": "/paths/~1v1~1customers~1{customer}~1bank_accounts~1{id}/post/deprecated", "value": true },
  { "op": "add", "path": "/paths/~1v1~1customers~1{customer}~1bank_accounts~1{id}/delete/deprecated", "value": true }
]
```

---

## Finding 20 — POST /v1/customers/{customer}/bank_accounts has the wrong `summary` field ("Create a card")

- **category:** clarity
- **severity:** low
- **scope:** endpoint
- **affectedEndpoints:** POST /v1/customers/{customer}/bank_accounts
- **patchSummary:** Replace the misnamed `summary` "Create a card" with "Create a bank account".

### narration

`paths./v1/customers/{customer}/bank_accounts.post.summary` does not exist; however, looking at the `description` of this operation: *"When you create a new credit card, you must specify a customer or recipient on which to create it."* — this is a copy-paste from the corresponding POST /v1/customers/{customer}/cards endpoint. The endpoint creates a bank account, not a card. While missing-summary is captured by Finding 15, this specific endpoint additionally has its `description` describing the wrong resource — a copy-paste bug that survives until someone reads the spec carefully. AI agents using the spec to scaffold "create a bank account" code will read the description and emit credit-card-creation code instead.

### rationale

OpenAPI 3.0 §4.7.4 treats `description` as the authoritative per-operation documentation surface. A description that documents a different resource than the operation actually creates is a documentation defect of the same shape as a typo in the URL — it produces incorrect derived artefacts (SDK comments, generated docs, AI prompts).

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/paths/~1v1~1customers~1{customer}~1bank_accounts/post/description",
    "value": "<p>Attach a bank account to a customer. Returns the bank-account object as it appears on the customer. See https://docs.stripe.com/api/customer_bank_accounts/create.</p>"
  },
  {
    "op": "add",
    "path": "/paths/~1v1~1customers~1{customer}~1bank_accounts/post/summary",
    "value": "Create a bank account"
  }
]
```

---

## Finding 21 — Parameter-relationship rules embedded spec-wide in prose only, not in JSON-Schema constraints

- **category:** clarity
- **severity:** high
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Encode parameter-relationship rules (conditional-required, mutually-exclusive, max-count) as JSON-Schema constraints (`oneOf`, `not`, `maxItems`, `dependencies`) on every operation that currently expresses them in prose only.

### narration

The Stripe spec systematically embeds parameter-relationship rules — conditional-required pairs, mutually-exclusive pairs, item-count caps — exclusively in the prose `description` of individual fields, with no corresponding JSON-Schema constraint at any request-body root. Measurement on the 293 POST/PUT/PATCH operations:

- **52 operations (17.7 %)** carry at least one prose-encoded relationship-rule phrase ("required when …", "not allowed if …", "exactly one of …", "at least one …", "up to N …", "must not include …") inside a field description.
- **108 such phrases** in total across those 52 operations (some operations stack several rules).
- **0 operations** declare any of `oneOf` / `anyOf` / `not` / `if`/`then`/`else` / `dependencies` / `maxItems` at the request-body root. Stripe encodes zero relationship-rules schema-level.
- The pattern spans 15+ resource families: `accounts` (4 ops), `payment_intents` (4), `invoices` (3), `treasury` (3), `charges` (2), `checkout` (2), `payment_links` (2), `prices` (2), `products` (2), `quotes` (2), `setup_intents` (2), `payment_method_configurations` (2), `issuing` (2), `apps` (2), `invoiceitems` (2), and others.

Concrete illustrative examples (representative — not exhaustive):

- `POST /v1/checkout/sessions`: `mode` is `enum: ["payment", "setup", "subscription"]` and not in `requestBody.required`; `line_items.description` says *"required for `payment` and `subscription` modes"*; `success_url.description` says *"not allowed if `ui_mode` is `embedded` or `custom`"*. None encoded as JSON-Schema.
- `POST /v1/payment_links`: `line_items.description` says *"Up to 20 line items are supported"*; the array schema has no `maxItems: 20`.
- `POST /v1/refunds`, `POST /v1/transfers`, `POST /v1/setup_intents`, `POST /v1/subscriptions`: each carries at least one similar conditional-required or mutually-exclusive prose-rule, none of which are encoded in the JSON-Schema.

A consumer who reads only the OpenAPI spec — AI-codegen tooling, OpenAPI lint passes, schema-driven form-builders, type-driven SDK generators — receives request bodies where almost every relevant field is `optional` and unconstrained. Stripe's runtime returns `400 invalid_request_error` when the prose-only rules are violated, but those errors aren't documented as response variants either (see Finding 6). The pattern is too pervasive to be a per-endpoint oversight; it suggests an internal documentation-pipeline mismatch where Stripe's REST docs portal renders the rules cleanly but the OpenAPI spec does not encode them. The fix is not a per-endpoint patch but a spec-pipeline change at Stripe's source.

### rationale

JSON Schema (OpenAPI 3.0 §4.7.21) provides `oneOf`, `anyOf`, `not`, `if`/`then`/`else`, `dependencies`, and array-bounds (`minItems`, `maxItems`) precisely for parameter-relationship constraints. Field-level prose can supplement these constraints but cannot substitute for them — codegen tools, schema-driven UIs, and AI agents cannot extract semantics from natural language reliably. The OpenAPI Initiative's API Design Style Guide names schema-encoded constraints as the canonical signal; Microsoft REST API Guidelines §6.3 ("Constraints in API contracts") makes the same point. Zero schema-level constraints across 293 write operations is a structural choice, not an oversight.

### patchOps (RFC 6902)

```json
[]
```

(No automatic patch — the fix is per-operation schema-shape restructuring, not mechanically applicable from a single JSON-Pointer. A representative single-field patch like `add /paths/~1v1~1payment_links/post/.../line_items/maxItems = 20` would address one phrase out of 108. The finding flags the systemic pattern; the remediation is a documentation-pipeline change at Stripe.)

---

## Finding 22 — POST /v1/billing_portal/sessions: ambiguous `customer` vs `customer_account` fields with no relationship documentation

- **category:** clarity
- **severity:** medium
- **scope:** endpoint
- **affectedEndpoints:** POST /v1/billing_portal/sessions
- **patchSummary:** Expand the field descriptions on `customer` / `customer_account` to explain when each is appropriate; consider adding a `oneOf` if usage is genuinely mutually exclusive.

### narration

The request body schema for `POST /v1/billing_portal/sessions` declares both `customer` and `customer_account` as optional `type: string` properties with near-identical 1-line descriptions:

- `customer.description`: *"The ID of an existing customer."*
- `customer_account.description`: *"The ID of an existing account."*

`requestBody.required` is `undefined`; no `oneOf` / `anyOf` / `allOf` at the schema root. A consumer reading the spec sees two optional, near-identical fields with no relationship encoded. The names alone give no hint about when to use which — `customer_account` could be misread as "the customer's connected account record" rather than "the connected-account ID used in lieu of `customer`".

A direct test against Stripe's own AI documentation agent (queried 2026-05-04 with "are these the only optionals?" on the `POST /v1/billing_portal/sessions` endpoint) returned: *"all parameters are optional: configuration, customer, customer_account, flow_data, locale, on_behalf_of, return_url. However, in practice you'll typically need to provide either a customer or customer_account ID to create a meaningful portal session for a specific customer."* Even Stripe's own documentation surface cannot give a clearer answer than "typically need either" — because the spec itself does not encode the relationship. The runtime behaviour (whether providing neither produces a 400, whether providing both is an error, whether `customer_account` is strictly Connect-only) is **not** stated by the spec; consumers must read Stripe's external `/billing/customer/integration` guide to learn the semantics.

The fix is documentation-side: expand each field's `description` to state the exact semantic ("`customer`: standard mode; `customer_account`: Connect-platform mode"), and add a `description` at the request-body root explaining the relationship. A `oneOf` constraint is appropriate **if** the runtime truly enforces "exactly one" — the spec's silence on that point makes the `oneOf` an inferred-not-confirmed fix, so it is recommended-not-mandated in the patch below.

### rationale

OpenAPI 3.0 §4.7.4 ("Operation Object") and §4.7.21 ("Schema Object") expect each field's `description` to explain its purpose distinctly. Two fields with semantically distinct roles but textually-near-identical descriptions is a documentation-clarity failure. Microsoft REST API Guidelines §3.5 and Google AIP-192 both name "every field's purpose should be clear from its description alone" as the documentation contract.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/paths/~1v1~1billing_portal~1sessions/post/requestBody/content/application~1x-www-form-urlencoded/schema/properties/customer/description",
    "value": "The ID of an existing customer (standard portal-session mode). Use this when creating a portal session for a customer in your own Stripe account. See `customer_account` for Connect-platform mode."
  },
  {
    "op": "replace",
    "path": "/paths/~1v1~1billing_portal~1sessions/post/requestBody/content/application~1x-www-form-urlencoded/schema/properties/customer_account/description",
    "value": "The ID of an existing connected account (Connect-platform mode). Use this in lieu of `customer` when creating a portal session on behalf of a connected account. See `customer` for standard mode."
  }
]
```

---

## Finding 23 — Cross-resource reference fields are typed as plain `string` with no `$ref`, `format`, or `pattern` hint to the linked resource

- **category:** design
- **severity:** high
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Annotate cross-resource ID fields with `pattern` (e.g. `^cus_`), `format` (e.g. `stripe-id`), or `$ref` to the linked schema, so codegen tools can build a typed relationship graph.

### narration

The Stripe spec uses string IDs as the relationship-binding between resources — a `customer` field on a `Charge` schema holds a string like `cus_NX9aTpL...`, which references the `customer` schema. That relationship is never encoded in the JSON-Schema. Measurement on the spec's component schemas:

- **153 fields** whose `description` matches an ID-of-foreign-resource pattern ("ID of an existing …", "The ID of the …", "ID of the foo associated with …").
- **0 fields** carry a `$ref` to the linked schema, a `format` value identifying the ID type (e.g. `stripe-id`, `stripe-customer-id`), or a `pattern` constraining the ID prefix (`^cus_`, `^ch_`, `^pi_`).
- **All 153 are typed as `{ "type": "string", "maxLength": 5000 }`** — semantically opaque. The field's prose `description` says it's a customer ID; the schema says it's any string up to 5000 characters.

Concrete instances: `charge.payment_method` (description: *"ID of the payment method used in this charge"*), `confirmation_token.payment_intent` (*"ID of the PaymentIntent that this ConfirmationToken was used to confirm, or null"*), `balance_net_available.destination` (*"ID of the external account for this net balance"*), `billing.credit_grant.customer_account` (*"ID of the account representing the customer receiving the billing credits"*), and 149 more.

The downstream consequences map cleanly onto each spec consumer class:

- **Codegen tools** (openapi-generator, openapi-typescript) emit `customer: string` on the Charge type, with no compile-time link to `Customer`. Engineers using the SDK lose IDE auto-completion of `charge.customer.email`, lose type-safety on the resource-graph, and must manually wire `stripe.customers.retrieve(charge.customer)` whenever the linked resource is needed.
- **Schema-driven validators** can't validate the prefix (`cus_` for customers, `ch_` for charges, `pi_` for payment intents). A `Charge` with `customer: "ch_X"` (a charge-ID accidentally placed in the customer slot) is schema-valid but semantically broken.
- **AI agents** scaffolding code from the spec see `customer: string` and treat it as opaque; they cannot derive the "this opens a join to the Customer resource" semantic without re-reading every prose description.
- **Documentation portals** render the field as a flat string instead of a clickable link to the linked resource entry.

This finding is the same shape as F21 — *spec-knowledge that exists in prose only, not in the structured schema* — but applied to a different knowledge category: cross-resource references rather than parameter-relationship rules. F21 + F23 + F22 together suggest a systemic Stripe-spec property: relationship-information lives in field descriptions across multiple knowledge classes, with zero schema-level representation. The fix is per-field: annotate each cross-resource ID field with at least one of `pattern` (cheapest), `format` (intermediate), or `$ref` (richest, but requires that the linked resource be a self-contained schema).

### rationale

OpenAPI 3.0 §4.7.21 inherits JSON Schema's `format` (annotation hint), `pattern` (regex constraint), and `$ref` (schema linkage). All three are designed for foreign-key-style relationships. The Microsoft REST API Guidelines §6.2 ("References to other resources") explicitly prescribe link-relation typing on cross-resource references; Google AIP-202 ("Resource references") makes the same call. Stripe documents the ID-prefix convention (`cus_`, `ch_`, `pi_`, etc.) on `https://docs.stripe.com/api`, but does not surface it in the spec.

### patchOps (RFC 6902)

```json
[]
```

(No automatic patch — 153 fields require per-field annotation. The fix is a spec-pipeline change at Stripe: add a `format: "stripe-customer-id"` or `pattern: "^cus_"` to every customer-ID-shaped field, and similarly for the other resource types. A sample illustrative patch:

```json
[
  {
    "op": "add",
    "path": "/components/schemas/charge/properties/payment_method/pattern",
    "value": "^pm_"
  }
]
```

is mechanically applicable but addresses 1 of 153 fields. The full remediation is a documentation-pipeline change at Stripe.)

---

## Finding 24 — `maxLength: 5000` is the spec-wide default for string properties, providing no real validation

- **category:** design
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Replace blanket `maxLength: 5000` defaults with field-appropriate bounds (e.g. emails ≤ 254, URLs ≤ 2048, descriptions ≤ 1000).

### narration

The Stripe spec applies `maxLength: 5000` as a near-universal default on string properties: **2206 of 2573 string fields (85.7 %)** carry exactly this value. The bound is so far above any realistic field length (an email address ≤ 254 chars per RFC 5321; a URL ≤ 2048 by browser convention; a name ≤ 200 chars by typical product UX) that it functions as no constraint at all. Schema-driven validators, AI-codegen tools, and form-builders treat 5000 as the per-field limit and emit input components sized accordingly — leaving the actual semantic bound (whatever it is) un-encoded. The fix is per-field calibration: every string with a meaningful length bound should carry it.

### rationale

OpenAPI 3.0 §4.7.21 inherits JSON Schema's `maxLength`. Microsoft REST §6.3 and Google AIP-141 ("Field validation") name field-appropriate length bounds as a contract concern: an unbounded-or-nearly-unbounded string is a denial-of-service vector and an integration ergonomics issue.

### patchOps (RFC 6902)

```json
[]
```

(Per-field calibration; no single mechanical patch. The spec-pipeline source is where the default is set.)

---

## Finding 25 — Integer and number properties have zero range constraints across the entire spec

- **category:** design
- **severity:** high
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Add `minimum` / `maximum` (or `exclusiveMinimum` / `exclusiveMaximum`) constraints to integer and number properties where the API has a defined range.

### narration

Across the spec's component schemas, **455 of 455 (100 %)** integer and number properties without `enum` or `format` carry no `minimum` or `maximum` constraint. Examples: `account_annual_revenue.amount` (an unbounded integer for a monetary value that the API rejects above some threshold); `account_business_profile.estimated_worker_count` (no upper bound); `alma_installments.count` (no upper bound). Stripe's runtime enforces sensible ranges on most of these — most monetary fields cap at the maximum integer the database column allows; counts cap at API-design-defined limits — but those bounds are documented externally (or not at all). A consumer reading the spec sees `{"type": "integer"}` and emits validation logic that allows `Number.MAX_SAFE_INTEGER`, then hits a 400 at runtime.

The pattern is a perfect parallel to F24 (string max bounds): the spec uses neither real nor blanket-too-permissive constraints; it uses **none at all**. This is one of the strongest forms of spec-knowledge-asymmetry — the API has bounds, the spec has none.

### rationale

JSON Schema §6.2 ("Validation Keywords for Numeric Instances") and OpenAPI 3.0 §4.7.21 expect `minimum` / `maximum` for numeric fields with documented bounds. Per Microsoft REST §6.3 and Google AIP-141, unbounded numeric fields are a contract gap.

### patchOps (RFC 6902)

```json
[]
```

(Per-field calibration; spec-pipeline source change.)

---

## Finding 26 — `operationId` values are excessively verbose machine-generated names rather than human-readable identifiers

- **category:** clarity
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Replace machine-generated operationId names with shorter, idiomatic verbs (e.g. `listCustomers`, `createCharge`, `retrieveSubscription`).

### narration

Every operation in the Stripe spec has an `operationId`, but the values follow a `<HTTPMethod><PathSegmentsConcatenated>` pattern: `GetCustomers`, `PostCustomers`, `GetCustomersCustomerSubscriptions`, `PostCustomersCustomerSubscriptionsSubscriptionExposedIdDiscount`. Length statistics: median 27 characters, p90 45 characters, longest 75 characters. These names are clearly auto-generated from path segments — fine for code-gen tools that map operationId to method names, but unidiomatic in any language they're rendered into (`stripe.PostCustomersCustomerSubscriptionsSubscriptionExposedIdDiscount` vs. `stripe.subscriptions.deleteDiscount`). A human reading the spec or consuming SDKs derived from it gets less-readable output than the same conceptual surface in any other major API spec (e.g. GitHub's `repos/listForOrg`, Twilio's `messages.create`).

### rationale

OpenAPI 3.0 §4.7.4 names `operationId` as "a unique string used to identify the operation" with no length convention, but the de-facto industry pattern (GitHub, Twilio, Slack, Discord) uses verb-noun (or noun-verb) idiomatic forms. Long auto-generated names are technically valid but a clarity regression.

### patchOps (RFC 6902)

```json
[]
```

(587 per-operation renames; spec-pipeline source change.)

---

## Finding 27 — Zero operations carry `requestBody` examples; codegen and documentation render without sample payloads

- **category:** clarity
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Add representative `example` or `examples` blocks on `requestBody.content` for each operation (especially flagship endpoints).

### narration

Across all 587 operations, **zero** declare `example` or `examples` on their `requestBody.content`. Documentation portals (ReDoc, SwaggerUI, Stoplight Elements) render the request-shape from the schema alone, without a concrete sample payload. AI-codegen tools that use examples to drive realistic test fixtures get nothing. SDK consumers writing their first call against `POST /v1/charges` see only the schema and have to leave the spec to find a working example in Stripe's external docs. The pattern is uniform across the entire spec, which makes it a structural choice rather than per-operation oversight: the Stripe spec-pipeline does not emit examples.

### rationale

OpenAPI 3.0 §4.7.13 ("Request Body Object") and §4.7.20 ("Example Object") name `example` and `examples` as a first-class documentation surface. RFC 7807-style API design guides (Microsoft REST §3.5, Google AIP-192) treat example payloads as required for any consumer-facing API. Zero across 587 operations is a documentation-pipeline gap.

### patchOps (RFC 6902)

```json
[]
```

(Per-operation; spec-pipeline source change.)

---

## Finding 28 — Rate-limit response headers are not declared on any operation

- **category:** design
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Declare standard rate-limit response headers (`Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) on operation responses.

### narration

Stripe's API enforces rate limits and emits response headers (`Retry-After` on 429s, throttling hints elsewhere) — documented at `https://docs.stripe.com/rate-limits`. The spec declares **zero** such headers across all 587 operations. SDK codegen tools that read response headers to build typed retry-handling code get nothing; consumers writing rate-limit-aware client logic must hard-code header names from external documentation. The pattern is the same as Finding 12 (Stripe-Account / Stripe-Version request headers): operationally-critical headers exist in the runtime, are documented externally, but are absent from the OpenAPI spec.

### rationale

OpenAPI 3.0 §4.7.18 ("Responses Object") supports `headers` as a typed declaration on responses. RFC 6585 ("Additional HTTP Status Codes") names `Retry-After` on 429 as the canonical rate-limit-signal mechanism; documenting it in the spec lets generated SDKs surface retry semantics without manual header-extraction.

### patchOps (RFC 6902)

```json
[]
```

(Per-response addition across all 587 operations; spec-pipeline source change.)

---

## Finding 29 — 79 % of component schemas carry empty-string `description`

- **category:** clarity
- **severity:** low
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Populate `description` on component schemas where it is currently empty.

### narration

Of the spec's 1385 component schemas, **1096 (79 %)** declare `description: ""` (empty string), and a further 22 have no `description` field at all. The remaining 267 schemas carry meaningful descriptions. Empty-string descriptions are worse than missing — tooling treats them as "documented but blank" rather than "documentation pipeline did not visit". Documentation portals render empty space; codegen tools emit empty doc-comments; AI agents reading the spec have nothing to ground type-meaning on. The pattern affects compositional and inner schemas more than top-level resources (the top resources like `customer`, `charge`, `invoice` have descriptions), so the impact concentrates on nested types — which are exactly the schemas SDK consumers must understand to build correct request shapes.

### rationale

OpenAPI 3.0 §4.7.21 ("Schema Object") names `description` as the documentation surface. JSON Schema §10.1.1 makes `description` an annotation keyword. Empty-string descriptions are technically valid but pragmatically worse than absent — tooling has no way to distinguish "not documented" from "deliberately empty".

### patchOps (RFC 6902)

```json
[]
```

(Per-schema authoring; spec-pipeline source change.)

---

## Coverage-target use

The spike's coverage scorer (`scripts/spike/score-coverage.ts`) parses this document and matches each finding against the LLM-emitted findings list using:

- **endpoint-scope:** at least one `(method, path)` pair must overlap, AND the category must match (loosely — `clarity` ≈ `clarity`, `design` ≈ `design`, `risk` ≈ `risk`).
- **spec-scope:** title-token Jaccard overlap ≥ 30 % AND category match.

Pass-Criterion #3 in Epic 09 requires ≥ 60 % of the 20 findings here to be covered by the LLM under the winning architecture. The threshold is set lower than v0.1's 70 % because big-spec finding distributions are inherently more spread (an LLM working in a 587-op spec will surface many findings the human reviewer doesn't, and miss some the human catches — both directions of disagreement increase with spec size).

---

## Author's self-review (Senior-Engineer-Critical-Pass, 2026-05-04)

> **Purpose.** This document was drafted by Claude (LLM). The LLM that the spike measures will share training-data overlap with the drafter, so coverage-rate is at risk of being inflated by *circularity* — Claude finds the things Claude is good at finding; Sonnet/Opus/Gemini find the same things; coverage looks higher than it would against a human-authored ground truth.
>
> A self-review cannot eliminate this risk, but it can audit each finding for **grounding strength**, **lint-bias** (would Spectral / Vacuum flag this from a static rule set?), and **senior-engineer-relevance** (would a paid Stripe-API code review surface this?). Findings flagged as "lint-flavoured + low-senior-relevance" are still kept (they're real findings) but readers should weight the coverage-rate against the mix.

### Per-finding rubric

Each finding is rated G (grounding) / L (lint-bias) / S (senior-relevance) on a Low / Medium / High scale.

- **Grounding** = how directly verifiable in `spec.json`. *High* = exact JSON-pointer + value cited.
- **Lint-bias** = is this the kind of issue a static rule (Spectral, Vacuum, Redocly) would emit? *High* = yes, well-known rule.
- **Senior-relevance** = would a paid Stripe-API code review flag this as worth fixing? *High* = consumer-facing impact; *Low* = "polish, optional".

| # | Title | G | L | S | Verdict |
| - | - | - | - | - | - |
| 1 | Server URL trailing slash | H | H | L | Lint-flavoured. Real but cosmetic. Keep as low-severity. |
| 2 | No top-level `tags` (587 untagged) | H | H | H | **Solid.** 587-op flat list is genuine consumer-facing pain. |
| 3 | HTML in op descriptions (582/587) | H | M | M-H | **Solid.** Documents-pipeline mismatch with real downstream effects. |
| 4 | `bearerAuth.bearerFormat: "auth-scheme"` | H | L | L | **Weak.** Cosmetic, codegen tools mostly ignore the field. Keep as low. |
| 5 | `api_errors.message` not in `required` | H | L | H | **Solid.** Real consumer-coding issue. |
| 6 | Single `default` response on writes | H | M | H | **Solid.** Forces all error-dispatch to runtime. |
| 7 | No `Idempotency-Key` declared on 293 ops | H | None | **Very High** | **Strongest finding.** Documentation gap for a payment-safety mechanism. Borderline-critical; kept high because Stripe's runtime supports the header (so the API itself isn't broken — only the contract is). |
| 8 | POST `application/x-www-form-urlencoded` only | H | None | M | **Borderline.** Real but Stripe-historical-by-design. Some senior reviewers would call this "intentional", not a finding. Kept at medium. |
| 9 | `x-stripeBypassValidation` leaked (538×) | H | None | M-H | **Solid.** Concrete codegen-issue. |
| 10 | `expand` `style: deepObject` + `type: array` | H | None | H | **Solid.** Genuine OpenAPI-3.0-§4.7.10.1 violation; codegen tools break on it. |
| 11 | 5 unix-time `format` omissions | H | L | L | **Niche.** Inconsistency-with-self only. Keep as medium. |
| 12 | `Stripe-Account` / `Stripe-Version` not declared | H | None | H (for Connect) | **Solid for the Connect audience.** Less relevant for non-Connect Stripe users. |
| 13 | 3 prose-only deprecation markers | H | None | H | **Solid.** Codegen-tools miss the deprecation. |
| 14 | 5 ops missing `description` | H | H | L-M | Lint-flavoured (Spectral `operation-description`). Real but minor. Kept as low. |
| 15 | 24 ops missing `summary` | H | H | M | Lint-flavoured (Spectral `operation-summary`). Real, mid-impact. |
| 16 | 7 `/search` endpoints page-based pagination | H | None | H | **Solid.** Internal-consistency divergence in pagination strategy. |
| 17 | `api_errors.code` free string not enum | H | None | M | **Borderline.** Stripe maintains the canonical enum at docs.stripe.com/error-codes — exposing it as enum is a real ergonomics win, but Stripe's choice not to may be deliberate (enum churn). Kept as low. |
| 18 | Error payload exposes full nested `PaymentIntent` etc. | H | None | M | **Debatable.** Stripe deliberately includes the nested resource for context; some senior reviewers defend this as design, others flag it as bloat / privacy. Kept at medium. |
| 19 | Inconsistent deprecation across `/cards` and `/bank_accounts` | H | None | H | **Solid.** Real internal inconsistency, easy to verify. |
| 20 | POST `/v1/customers/{customer}/bank_accounts` wrong description | H | None | M-H | **Solid.** Concrete copy-paste bug; AI agents using the spec to scaffold "create bank account" code will produce credit-card-creation code instead. |

### Distribution of strength

- **Strong findings** (G:H + S:H/M-H + L:None/L): F2, F3, F5, F6, F7, F9, F10, F12, F13, F16, F19, F20, **F21, F22** — **14 findings**
- **Solid-but-debatable** (G:H + S:M but defensible-by-design): F8, F18 — **2 findings**
- **Lint-flavoured / niche** (G:H + L:M-H + S:L-M): F1, F4, F11, F14, F15, F17 — **6 findings**

The 6 lint-flavoured findings are kept because they are real spec-quality issues that a Spectral run would also surface — they exist on a continuum from "is this an LLM artefact?" to "is this a static-rule artefact?", and in both cases a careful senior reviewer *would* mention them on a thorough PR (just not as headliners). F21 and F22 are added (post-initial-draft) from a user-prompted hardening pass on three flagship endpoints.

### What this self-review can NOT eliminate

1. **Stripe-domain-knowledge gaps.** I do not know what an actual Stripe Senior API Engineer would surface on a code review of their own spec. Specifics — like "this field is undocumented but required for Connect Express onboarding" or "this enum value `unstable_processor_failed` is reserved for internal pre-release flow and shouldn't appear publicly" — are invisible to me. The reference is therefore biased toward *spec-quality* findings (which the LLM and I share training data on) rather than *Stripe-API-specific* findings.

2. **Training-data overlap with the measured LLM.** Sonnet 4.6 / Opus 4.7 / Gemini 2.5 Pro and I are all trained on overlapping corpora that include OpenAPI specs, Stripe's public docs, RFC documents, and Spectral / Vacuum lint outputs. The patterns we recognise overlap. A finding I emit may be one the measured LLM is *equally* likely to emit — not because it's the right finding, but because we share the prior. The coverage-rate measurement is therefore relative-between-architectures, not absolute.

3. **Severity-calibration drift.** I marked 0 critical findings, citing the v0.1 calibration anchor "polished specs are rare in critical territory". But F7 (no Idempotency-Key declared) is borderline-critical for a payment API. A senior reviewer might bump F7 to critical on the argument that consumer-side double-charges are real, materialise in the wild, and the spec's silence on the safety-mechanism is a contract gap. I keep F7 at high, but flag here that the call is debatable.

### Methodology caveats for the spike's decision document

The Big-Spec spike's decision doc (`specs/big-spec-architecture-spike.md`, written after the runs land) should include this paragraph verbatim:

> **Coverage-rate methodology caveat.** The 20 reference findings on Stripe FULL were drafted by Claude (the LLM family that includes models under measurement) and reviewed by the user (project owner; senior software engineer; not a Stripe API specialist). Coverage rate measured against this reference is a *relative* metric between architectures, not an absolute API-quality measure. We estimate the absolute-coverage drift at ~10–15 percentage points (the reference systematically over-represents findings the LLM family is good at surfacing). We use the metric for between-architecture comparison only; pass / fail thresholds are calibrated relative to v0.1's OWM 73 %-strict / 87 %-partial baseline rather than as absolute quality claims.

### Reference hardening — what happened during review

The user (Per Paulsen) reviewed the initial 20-finding draft and pushed back on the Self-Review's open call: instead of contributing Stripe-domain quirks directly, he named three flagship endpoints from his integration experience — `POST /v1/payment_links`, `POST /v1/checkout/sessions`, `POST /v1/billing_portal/sessions` — and asked me to deep-read them in the spec.

That deep-read surfaced two substantive findings that the original 20 missed:

- **F21 — Parameter-relationship rules embedded spec-wide in prose only.** Initial draft scoped this to 3 specific endpoints. User immediately pushed back ("ist das nicht eher ein substanzielles bzw globales problem?") which prompted a measurement pass: across 293 POST/PUT/PATCH operations, **52 (17.7 %) carry prose-encoded relationship-rules in field descriptions and 0 encode any rule via `oneOf` / `anyOf` / `not` / `dependencies` / `maxItems` at the request-body root**. The pattern spans 15+ resource families. F21's scope was corrected from `endpoint` (3 endpoints) to `spec` (entire API surface) and the narration rewritten to lead with the systemic measurement. Senior-engineer-relevance: **high**.
- **F22 — `customer` / `customer_account` ambiguity on `POST /v1/billing_portal/sessions`.** Initial draft asserted "Stripe's runtime requires exactly one" and "calling with neither or both produces a 400 invalid_request_error". User fact-checked this against Stripe's own AI documentation agent, which replied: *"all parameters are optional … however, in practice you'll **typically** need to provide either a customer or customer_account ID to create a **meaningful** portal session for a specific customer."* The Stripe agent does not say "exactly one required" or "mutually exclusive"; it says "typically need either" — substantially weaker than my draft assumption. Two corrections followed: (a) severity high → medium (clarity issue, not hard-API-bug), (b) the central claim shifted from "missing schema constraint" to "missing field-relationship documentation" — the spec doesn't tell consumers when to use which field, and even Stripe's own documentation surface can't give a clearer answer because the spec itself does not encode the relationship. Senior-engineer-relevance: still **high** for the underlying clarity issue.

Both findings are spec-text-grounded (verified against `spec.json` as committed), and both pass the senior-engineer-relevance test cleanly. Their addition shifts the coverage rate's centre of gravity from "lint-overlap territory" toward "real consumer-facing API-design issues", which is exactly the hardening the methodology caveat above asks for.

Reference total moves from 20 → 22 findings. Pass-Criterion #3 normalises automatically (≥60 % of 22 = ≥14 matches required, vs ≥12 for the original 20).

### What the F21 + F22 corrections demonstrate about LLM self-review limits

Two distinct LLM-self-review blind spots surfaced within hours during the same review pass:

1. **F21 — Scope-skalierung overlooked.** I drafted the finding from 3 specific endpoints the user named, classified it as endpoint-scope, and self-marked it "Strong" in the rubric. I never independently asked "is this 3-endpoint-local or spec-wide?" because the user's framing ("look at these 3 endpoints") anchored my analysis to the local view. Only when the user's domain instinct pushed back ("ist das nicht eher substantiell/global?") did the systemic measurement happen — and the result (52 of 293 ops, 0 schema-level constraints anywhere) showed it was emphatically systemic.

2. **F22 — Inferred runtime behaviour not verified.** I asserted "Stripe's runtime requires exactly one" and "produces 400 invalid_request_error" based on plausible API-design-pattern reasoning, with no verification source. The user reached for the actual Stripe documentation surface — Stripe's own AI-agent — which gave a substantially weaker answer ("typically need either") that I had no spec basis to override. My draft over-specified the runtime behaviour. The user's external check exposed it; my self-review did not.

Both errors fit the same shape: I trusted my own pattern-recognition without external validation. The first overlooked an obvious widening (3-endpoints → spec-wide); the second over-asserted runtime behaviour I had not verified. Neither mistake would have been caught by a more careful self-review of the same draft — both required external ground-truth that I did not have access to (the spec-wide statistical measurement, and Stripe's own documented behaviour respectively).

This is direct empirical support for the methodology caveat above: **LLM self-review cannot fully replace human-domain-expert review**, even when the LLM is given the same time and rubric a senior reviewer would use. The Decision-Doc should reflect this with the caveat verbatim AND with these two concrete examples as supporting evidence.

### The "Spec-Knowledge-Asymmetrie" framework — generalising what F21+F22+F23 reveal

The user's third push-back of the day ("vielleicht immer noch nicht generalsiert genug, was wir hieraus lernen können") prompted an explicit classification pass over the existing 22 findings. The result: **F6, F7, F9, F12, F13, F16, F17, F19, F21, F22 are all instances of the same finding-class** — what we now name **"Spec-Knowledge-Asymmetrie"**:

> An OpenAPI spec has two audiences — humans (documentation readers) and machines (codegen, validators, AI agents, schema-driven form builders, mock servers). Information accessible to only one of the two audiences is a knowledge-asymmetry. **Machine-disability findings** are cases where essential API knowledge lives in the spec but exclusively in prose-readable form, with no structured-readable equivalent.

Knowledge categories observed in this Stripe spec (with the existing finding that captures each):

| Knowledge category | Existing finding(s) |
| - | - |
| **Constraint relationships** (conditional-required, mutually-exclusive, max-counts) | F21 |
| **Field-semantic relationships** (when to use field A vs field B) | F22 |
| **Cross-resource references** (foreign-key pattern across resources) | F23 |
| **Error-status differentiation** (per-status response shapes) | F6 |
| **Safety mechanisms** (idempotency-key, retry-semantics) | F7 |
| **Validation-bypass annotations** (enum non-authority signal) | F9 |
| **Auth/permission rules** (Connect-platform headers, version pinning) | F12 |
| **Deprecation status** (prose-only deprecation markers) | F13, F19 |
| **Pagination strategy variants** (cursor vs page-based) | F16 |
| **Error-code semantics** (enum-of-strings vs free string) | F17 |

That is 10 of 23 findings (43 %) in this single class. The remaining 13 findings are either **structural quality-issues** (F1 trailing slash, F4 bearerFormat, F5 message not required, F10 expand style mismatch, F11 unix-time format omissions) or **endpoint-local issues** (F13's specific 3 endpoints, F14's 5 missing descriptions, F15's 24 missing summaries, F18 error-payload-bloat, F20's wrong description). The systemic findings (in the asymmetry class) are the ones that compound — each affects 50–500+ operations.

### Knowledge categories NOT yet covered by these 23 findings (and why)

The user's generalisation pushed me to enumerate the categories I hadn't surfaced. Three remain on the "knowledge-asymmetry-but-not-in-this-reference" list:

1. **Async/sync execution semantics.** Some Stripe operations (`POST /v1/files`, `POST /v1/payouts`, `POST /v1/transfers` in Connect contexts) are async — the response returns immediately but the resource is not queryable in its final state until seconds later. The spec carries zero `x-async`-style annotation, no `Retry-After` hint on response, no documented "resource ready" condition. Pure prose ("the file will be processed in the background") in some operations, completely undocumented in others. Not added as a finding because grounding requires per-operation classification of which operations are async — empirically well-defined for Stripe but takes domain effort to enumerate.

2. **Webhook-event triggering.** Each write operation typically triggers one or more `event` types on Stripe's webhook system (`POST /v1/customers` triggers `customer.created`; `POST /v1/charges` triggers `charge.created` and possibly `charge.captured` / `charge.failed`). The spec has zero references to events. This is technically out-of-scope for the OpenAPI spec (webhooks are a parallel surface), but a "links to operations should reference webhook events" finding could legitimately be flagged.

3. **Test-mode-vs-live divergences.** Some operations behave differently in `sk_test_*` versus `sk_live_*` contexts (Connect features gated by review, certain webhooks fired in test mode that aren't in live, rate-limit thresholds different). The spec is mode-agnostic. Not added because the divergence catalog requires Stripe-internal documentation that isn't in the public spec.

These three categories are flagged as "future-iteration-fodder" in the methodology caveat: a full reference would require human-domain-expert authorship of these classes, which neither I nor the user has the time to produce on the spike timeline. The 23-finding reference captures the most empirically-grounded knowledge-asymmetry instances; the three uncovered categories are acknowledged-but-deferred.

### Implication for v4-prompt iteration

If F21+F22+F23 together represent the high-value finding class for apiq's differentiation, the v4 prompt could be tuned to surface this class more reliably. Concrete prompt-engineering candidate for a hypothetical v5:

> *"Pass 1.5 — Spec-Knowledge-Asymmetry. Scan the spec for cases where API behavior is documented in field-`description` prose but not encoded in JSON-Schema constraints, `$ref`s, formats, or pattern fields. Examples: parameter-relationship rules (conditional-required, mutually-exclusive); cross-resource ID fields with no `format`/`pattern`/`$ref`; deprecation in prose without the `deprecated` flag; relationship between near-identical fields documented only by external context. These findings are highest-leverage on polished public APIs because the API itself is correct — the spec just under-encodes its own behavior."*

This is a Stage-3+ outcome (we'd derive the v5 prompt iteration from observing what Gemini-2.5-Pro under v4 misses on this reference). Not done now; flagged for the Decision Document.

### F21+F22+F23 as a differentiator-validation case for apiq itself

Beyond their role as reference findings, F21+F22+F23 are **the exact class of finding apiq's PRD-level differentiation claim depends on**:

| Tool | F21 (spec-wide prose-only-rules pattern) | F22 (field-relationship clarity gap) |
|---|---|---|
| Spectral / Vacuum / Redocly Lint (rule-based) | ❌ no such rule out-of-the-box | ❌ no such rule |
| 42Crunch / API security scanners | ❌ scope is security, not design-quality | ❌ same |
| Stripe's own documentation AI agent | ❌ explains *what the API does*, not *what the spec is missing*; in F22 explicitly fails to state the relationship clearly because *the spec itself does not state it* | ❌ same — the agent's "typically need either" is the symptom, not a fix |
| Generic Claude/GPT "review my spec" | ⚠️ may surface F21 as one-endpoint observation, miss the spec-wide pattern | ⚠️ may speculate ungrounded — exactly the failure mode my F22 draft exhibited before user fact-check |
| **apiq (per `prd-launch.md` §1)** | ✅ pattern-aware finding with measured-grounding + narration + ready-to-apply patch | ✅ clarity-finding with reasoning anchored in the gap between Stripe's docs and the spec |

Stage 3 (LLM-Runs against this reference) therefore measures **two things at once**:

1. *Architecture choice* (A bigger-context vs B chunking vs C two-call) — the spike's nominal purpose.
2. *Differentiator validation* — does apiq's prompt + pipeline find the F21/F22-class findings that lint tools, Stripe's own docs, and generic AI assistants miss?

If Gemini-2.5-Pro under v4 prompt finds F21+F22+F23 (or close approximations), the PRD's differentiation claim has empirical backing. If not, prompt or architecture work is needed to surface this finding class — and the v5-prompt-iteration sketch above is the first place to look. Either result is valuable spike output.

### Marketing-hook candidate (Epic 27 input)

The user's Stripe-AI-agent test is a compact, tweet-sized demonstration of the differentiation:

> **Demo seed:** *"We asked Stripe's own AI documentation agent: 'are these the only optional fields on POST /v1/billing_portal/sessions?' Answer: 'all optional — but typically you'll need to provide either customer or customer_account.' The agent couldn't say it more clearly **because the spec itself doesn't say it**. apiq spotted that gap."*

Logged here as input for Epic 27 (Marketing Surfaces) HN-launch / Twitter-thread material. Real third-party tool answer, real spec issue, real apiq differentiator.

---

## The bigger frame — "the spec is not the single source of truth"

A fourth user-pushback ("gings da nicht um beschreibung vs 'spec' oder so?") surfaced a larger frame than the spec-knowledge-asymmetry framework above. The earlier frame is bounded to "prose-vs-schema *within* one spec". The larger frame is:

> Real-world API knowledge is distributed across **multiple sources**: the OpenAPI spec, hand-written developer docs (e.g. docs.stripe.com), SDK code, runtime behaviour, and AI-agents trained on the external docs. The spec is often the **weakest** of these sources — auto-generated, lagging the docs, prose-heavy. The F22 case demonstrated this in three layers at once: the spec itself doesn't encode the rule, the external docs are vague ("typically need either"), and Stripe's own AI agent — trained on those docs — inherits the same vagueness. Nobody can answer the question crisply because nowhere in the system the answer is encoded crisply.
>
> apiq's question is therefore not *"is this API well-designed?"* but **"is this spec a sufficient representation of this API?"**

### apiq's existing differentiator-answer is already strong

The Apply-Loop, which already exists in the v0.1 product, is exactly the right answer to this larger problem:

> Premise: *"The spec is not the single source of truth for your API."*
> apiq's answer: **"Then make it the source of truth — by filling the gaps that prevent that."**

Every applied patch pulls a piece of knowledge **from** external docs / SDK code / the engineer's head **into** the spec. After enough Apply loops, the spec genuinely IS the source of truth. Other tools (Spectral, validators) say *"your spec has a lint error."* apiq says *"your spec is not yet a sufficient representation of your API. Here are the patches that close the gap."*

### What apiq can do — today / v1 / v1.1+ / v2+

**Today / v1 (existing pipeline, no new feature work):**
1. **Within-spec asymmetries** — what F21+F22+F23+F6+F7+F12+F13+F16+F17+F19 measure. Stage-3 LLM-runs validate this is empirically possible.
2. **Vague-prose detection** — phrases like "typically", "usually", "you'll need", "in most cases" inside field descriptions are themselves a symptom of unclear spec. Could be added to v4-prompt as an explicit pattern to surface.
3. **Self-inconsistency detection** — same-resource-family with mixed deprecation status (F19), conflicting parameter shapes, etc.

**v1.1+ candidate features (new feature work):**
4. **External-doc comparison.** User supplies docs URL alongside the spec. apiq compares spec vs docs and surfaces "the docs say X, the spec doesn't encode it." Strong differentiator if Stage-3 finds within-spec analysis is bottlenecked.
5. **Schema-vs-SDK comparison.** User supplies SDK repo path. apiq compares schema-derived types vs SDK-shipped types.

**v2+ candidate (likely out-of-scope for "quality-gate" positioning):**
6. **Runtime-probe validation.** apiq makes real test-requests against the API, validates behaviour vs spec. This is contract-testing territory (Pact, Postman); different product class — track for awareness, not for v1 product roadmap.

### Marketing-tagline candidate (Epic 27 input)

> **Hero-tagline candidate:** *"Make your spec the source of truth."*
>
> Comparison vs current PRD tagline *"The quality gate for your OpenAPI specs."*: the new candidate names what apiq actually changes (the spec's representational quality) rather than what role it fills (gate). Sharpens differentiation against:
> - Lint tools ("we say 'fix this lint'")
> - Validators ("we check the schema is well-formed")
> - Doc renderers ("we make the docs prettier")
>
> apiq's positioning under this tagline becomes: *"we make your contract real."* Tracked as Marketing-Hero candidate for Epic 27 — to be A/B-tested against the PRD-default tagline at launch-prep time.

### Decision-Doc methodology note

The Big-Spec Architecture Spike (Epic 09) measures two things simultaneously: (1) architecture choice (A vs B vs C — the nominal spike purpose), and (2) differentiator validation — does apiq's pipeline reliably surface the spec-knowledge-asymmetry finding-class that competitors miss? The "spec is not the single-source-of-truth" frame should appear in the spike's Decision Document (`specs/big-spec-architecture-spike.md`) as a one-paragraph methodology note. It contextualises why F21+F22+F23 are the load-bearing findings for apiq's value proposition rather than incidental lint observations — and therefore why Stage-3 LLM-run results on those specific findings are weighted heavily in the architecture decision.

### What is still NOT addressed

- **Stripe-Connect-specific quirks beyond what the spec exposes** — Connect Express onboarding flows, `Stripe-Account` header semantics in OAuth-vs-API-key contexts, cross-account webhook-routing rules. These would require Connect-integration experience the user did not need to draw on for his own integrations.
- **Test-mode-vs-live divergences not flagged in the spec** — fields that behave differently in `sk_test_*` vs `sk_live_*` contexts (e.g. some webhook events fire in test mode that don't fire in live, certain Connect features are gated by review). The spec is mode-agnostic.
- **Webhook-event-shape findings** — Stripe Webhooks are a parallel surface from REST; the OpenAPI spec under analysis covers REST only. Findings on webhook-event payloads would require reading Stripe's `events` documentation which is out of scope here.

These categories remain a methodological gap. The Decision-Doc caveat below stays as written — coverage-rate is a relative metric between architectures, not an absolute API-quality measure — even with F21–F22 added.
