# Stage-A Mining: Spectral-Universum

> **Task #23 — Spectral universe mining (research only, no code).** Surveys curated index `stoplightio/spectral-rulesets` (17 rulesets), 3 generic rulesets (OWASP, APIs You Won't Hate, URL Versioning), 12 corporate style guides, and npm-registry community packages. Goal: extract every generic-applicable rule pattern that mature linters check so apiq's Stage A doesn't miss what reputable tools find.
>
> Output is classified four ways: **Generic** (apply to any OpenAPI spec — take into apiq), **Vendor-/Org-Specific** (skip, document for awareness), **Already-in-apiq-brainstorm** (external source confirms; cross-ref), **Unsure** (orchestrator decides).
>
> **Method:** read each ruleset's source YAML/TS, extract rule-IDs + descriptions + targets, classify per Stage-A architecture-frame (`big-spec-architecture-spike-stage-a-rules-brainstorm.md`).
>
> **Scope guardrails:** apiq Stage A is spec-agnostic and deterministic. Vendor-specific tokens (`x-leanixid`, Zalando-`x-api-id`, SPS-`Sps-` prefix, `application/hal+json` mandate) are NOT for Stage A. They go to LLM-Phase B if at all (semantic reasoning).

---

## Sources surveyed

### Index repository

- **`stoplightio/spectral-rulesets`** (https://github.com/stoplightio/spectral-rulesets) — curated index of 17 community rulesets across API/OpenAPI style guides + functional rulesets. License: **MIT**. Active.

### Generic rulesets (deep-read)

| ID | Repo / NPM | License | Rules-count | Notes |
|---|---|---|---|---|
| OWASP | `stoplightio/spectral-owasp-ruleset` (`@stoplight/spectral-owasp-ruleset` v2.x) | **MIT** | **24 rules** + 2 custom functions | Based on OWASP API Security Top 10 (2023). Generic across any API. |
| APIs You Won't Hate | `apisyouwonthate/style-guide` (`@apisyouwonthate/style-guide`) | **MIT** | **17 rules** | Phil Sturgeon's opinionated REST best-practices. |
| URL Versioning | `stoplightio/spectral-url-versioning` | MIT (assumed via Stoplight pattern) | **3 rules** | Path/server URL versioning policy. |

### Corporate style guides (skim — pattern extraction only)

| Org | Source | Rules-count | License | Generic-value |
|---|---|---|---|---|
| **Adidas** | `adidas/api-guidelines/.spectral.yml` | ~28 rules | (not stated) | High — kebab-case paths, camelCase props, hyphenated-pascal headers, https-only, GET/PUT/DELETE body-rules, no-verbs-in-paths, semver. Skip HAL/Problem+JSON mandates and `x-leanixid`/`x-gateway`. |
| **Azure** | `Azure/azure-api-style-guide/spectral.yaml` | ~50 rules (`az-*`) | MIT (Azure ecosystem) | Mixed — many Azure-specific (LRO/`x-ms-*`/`api-version`-policy). Generic gems: parameter-default-not-allowed, parameter-names-unique, schema-description-or-title, additional-properties-and-properties siblings warning, request-body-not-bare-array, response-body-not-bare-array, post-201-response-discouraged, success-response-body, schema-type-and-format, datetime-naming-At-suffix, boolean-naming-no-is-prefix. |
| **DigitalOcean** | `digitalocean/openapi/spectral/ruleset.yml` | 21 rules | (Apache-2.0 implied, repo-level) | Examples-required everywhere, common-responses 401/404/429/500, snake_case keys, ratelimit-x headers, schema-properties-must-have-type. |
| **Box** | `box/box-openapi/.spectral.yml` | (404 in repo) | Apache-2.0 | Could not retrieve — referenced from index. |
| **Red Hat** | `redhat-developer/app-services-api-guidelines/spectral/ruleset.yaml` | ~12 rules | Apache-2.0 (`rhoas-*`) | Some generic (`rhoas-oas3minimum`, `rhoas-schema-name-pascal-case`, `rhoas-schema-properties-snake-case`, `rhoas-operation-id`). Most are vendor-resource-pattern (Error-shape, ObjectReference-shape, List-shape). |
| **Nexmo** | `Nexmo/api-specification/.spectral.yml` | 0 (404 in repo) | (Vonage / not stated) | Not retrievable; the index attributes "SemVer enforcement, examples, HTTP method ordering" but file moved/removed. |
| **SchwarzIT** | `SchwarzIT/api-linter-rules/packages/openapi/src/rules/` | ~10 rules | (not stated; LICENSE present) | Custom-TS rules: `info-description`, `contact-information`, `common-responses-unauthorized`, `must-define-example-schema`, `no-http-verbs-in-resources`, `path-must-specify-tags`, `must-have-path`, `path-must-match-api-standards`, `servers-must-match-api-standards`. |
| **Team Digitale (Italian gov)** | `teamdigitale/api-openapi-samples/.spectral.yml` | **40+ rules** | (CC-BY-4.0 / public-policy) | High generic value — full Cache-Control rules, RFC7807 enforcement, retry-after on 429/503, ratelimit headers, no-additionalProperties / constrained, security-protection-non-idempotent, JWT RFC8725 hint, OAuth2 no-implicit/no-password, status/health endpoint mandate, problem-schema validation, paths-no-http-verbs, semver, integer-format-int32/64-only. |
| **VRChat Community** | `vrchatapi/specification/spectral/rules/` | 4 custom rules + spectral:oas | MIT | `vrc-description`, `vrc-operation-id`, `vrc-title`, `vrc-typos`. Mostly leverages `spectral:oas` defaults. |
| **VTex** | `vtex/openapi-schemas/.spectral.yml` | 17 rules | (open / not stated) | High doc-quality value — must-include-operation-summary, must-include-response-examples + schemas, no-empty-titles/descriptions, parameters-description, properties-description, array-items defined, request-body-items-type + response-body-items-type, must-end-descriptions-with-period, no-chained-refs-in-components, sentence-case-summaries-and-tags, write-email-not-e-mail. |
| **SPS Commerce** | `SPSCommerce/sps-api-standards/sps-api-standards.spectral.yml` | **80+ rules** | Apache-2.0 (LICENSE.txt) | Broadest corporate ruleset surveyed. Generic value: per-method status-code policies (POST/PUT/DELETE/PATCH/HEAD/OPTIONS), no-x-headers, sensitive-data-in-headers, no-explicit-headers (Authorization/Content-Type/Accept), keyword-conflicts (java/c reserved words), disallowed-prepositions in property-names, paths trailing-slash, paths empty-segments, paths-limit-path-parameters/sub-resources, paths-no-http-methods, query-params no-api-keys, hosts-no-port (except localhost), host-no-environment-name. |
| **Transcom** | `transcom/mymove/swagger-def/.spectral.yml` | (not retrieved) | MIT (US-mil-public) | Index says "JSON content-type standards" — likely 1-2 rules, low value. |
| **Zalando (Baloise port)** | `baloise-incubator/spectral-ruleset/zalando.yml` | Apache-2.0 | ~45 rules | Snake_case props, lowercase-hyphens paths, MUST-not-use-URI-versioning, MUST-use-semver, sub-resource-levels limit, problem+json mandate for default+errors, integer-format-int32/64/bigint, number-format-float/double/decimal, x-extensible-enum encouragement, UPPER_SNAKE_CASE enums, MUST-have-info.description/contact.{name,url,email}/x-api-id/x-audience. Skip x-api-id-format and x-audience taxonomy. |

### Functional rulesets

- **OWASP API Security** — see Generic above.
- **AWS Gateway** (`andylockran/spectral-aws-apigateway-ruleset`, `spectral-aws-apigateway-ruleset` on npm) — vendor-specific (AWS API Gateway integration object hygiene). Skip.
- **URL Versioning** — see Generic above.

### Stoplight ecosystem rulesets (companion)

- **`stoplightio/spectral-documentation`** (`@stoplight/spectral-documentation`) — 13 rules, MIT. Documentation-completeness focus: docs-api-host/servers, docs-api-host-not-example, docs-description (length≥20, capital-first, period-end), docs-info-contact, docs-parameters-anything-useful (oas2), docs-parameter-examples-or-schema (oas3), docs-media-type-examples-or-schema, docs-tags-alphabetical, docs-operationId-valid-in-url, docs-tags (non-empty), docs-operation-tags. **High overlap with apiq goals — many already match apiq brainstorm items.**

### npm registry — community packages found

| Package | Source | Notes |
|---|---|---|
| `@stoplight/spectral-rulesets` | npm v1.22.0 | Bundles Stoplight's curated rulesets. |
| `@stoplight/spectral-owasp-ruleset` v2.x | npm | OWASP 2023. |
| `@apisyouwonthate/style-guide` | npm | Phil Sturgeon's. |
| `@microcks/spectral-ruleset` | npm | Microcks-targeted, with Vacuum compatibility layer. Mostly testing-tool semantics. Skip. |
| `konfig-spectral-ruleset` | npm | Targeted at Konfig SDK-codegen friendliness. Worth deeper look at convention-rules later. |
| `@zapier/spectral-api-ruleset` | npm | Zapier's API-Guidelines ruleset. Not surveyed in detail (vendor); likely overlap with patterns extracted here. |
| `@baloise/spectral-rules` | npm (`baloise-incubator/spectral-ruleset`) | Zalando RESTful Guidelines port. See above. |
| `spectral-aws-apigateway-ruleset` | npm | AWS-vendor; skip. |
| `@stoplight/spectral-documentation` | npm | See Stoplight above. |
| `@stoplight/spectral-url-versioning` | npm | See Generic above. |

No Shopify/Twilio/GitHub/Stripe/LinkedIn public spectral-rulesets found via search.

---

## Patterns extracted

### Generic (apply to any OpenAPI spec — take into apiq)

> Each row maps to apiq Stage-A architecture: **R** = Spectral-rule (per-node-pattern), **W** = Walker (statistical), **M** = Module (graph/hash/AJV/path-parser).
> Sev-suggestions follow apiq's discipline (`error` = OAS spec violation; `warn` = clear right-answer; `hint` = stylistic).

| ID | Pattern (one-liner) | Source | Sev | apiq layer | Notes |
|---|---|---|---|---|---|
| **G-OWASP-1** | Numeric IDs (path-params named `id`/`*_id`) — UUID/random preferred over integer (enumerable-attack vector) | OWASP `owasp:api1:2023-no-numeric-ids` + AYWH `no-numeric-ids` + SPS `sps-no-numeric-ids` | warn | R | apiq has FK-fields-need-format on `*_id` props; **path-param variant is new** |
| **G-OWASP-2** | `securitySchemes[].scheme = http "basic"` rejected (insecure) | OWASP `owasp:api2:2023-no-http-basic` + AYWH `no-http-basic` + SPS `sps-no-http-basic` + Team-D `securitySchemes-oauth-allowed-flows` | error | R | apiq missing |
| **G-OWASP-3** | API keys forbidden in URL (path/query) | OWASP `owasp:api2:2023-no-api-keys-in-url` + SPS `sps-query-params-no-api-keys` | error | R | apiq missing |
| **G-OWASP-4** | URL parameter name matches `password\|secret\|token\|api-?key` (credentials in URL) | OWASP `owasp:api2:2023-no-credentials-in-url` | error | R | apiq missing |
| **G-OWASP-5** | Auth schemes "negotiate" / OAuth1 flagged as outdated | OWASP `owasp:api2:2023-auth-insecure-schemes` | warn | R | apiq missing — light value |
| **G-OWASP-6** | OAuth2 flows require `tokenUrl` over HTTPS only | OWASP + Team-D `securitySchemes-oauth-http` | error | R | apiq's brainstorm F5 covers presence; HTTPS-only is sharper |
| **G-OWASP-7** | OAuth2 scheme should declare `refreshUrl` (token-rotation hygiene) | OWASP `owasp:api2:2023-short-lived-access-tokens` | warn | R | apiq missing |
| **G-OWASP-8** | OAuth2: `implicit` + `password` flows forbidden (RFC 6749 deprecated) | Team-D `securitySchemes-oauth-allowed-flows` | error | R | apiq missing |
| **G-OWASP-9** | JWT bearerFormat — description should mention RFC 8725 (algo-confusion mitigation) | OWASP `owasp:api2:2023-jwt-best-practices` + Team-D `securitySchemes-jwt` | warn | R | apiq missing — niche but high-value-add |
| **G-OWASP-10** | Write operations (POST/PUT/PATCH/DELETE) MUST be protected by `security` | OWASP `owasp:api2:2023-write-restricted` + Team-D `security-protection-non-idempotent` | warn | M (function) | apiq F2 covers per-op security; this is sharper for non-idempotent |
| **G-OWASP-11** | Read operations (GET/HEAD) SHOULD be protected by `security` | OWASP `owasp:api2:2023-read-restricted` | hint | M | Lower priority |
| **G-OWASP-12** | `additionalProperties: false` (or constrained) on objects (mass-assignment hardening) | OWASP `owasp:api3:2023-no-additionalProperties` + `constrained-additionalProperties` + Team-D `no-additionalProperties` + `no-default-additionalProperties` + `constrained-additionalProperties` | warn | W | apiq has Walker M8 for statistical; **add per-object Spectral-rule too** |
| **G-OWASP-13** | OAS 3.1: same on `unevaluatedProperties: false` | OWASP `owasp:api3:2023-no-unevaluatedProperties` + `constrained-unevaluatedProperties` | warn | R (oas3_1-only) | apiq missing OAS 3.1 path — add when 3.1 support matters |
| **G-OWASP-14** | All 2XX/4XX responses should declare RateLimit headers | OWASP `owasp:api4:2023-rate-limit` + Team-D `missing-ratelimit` + DigitalOcean `ratelimit-headers` | warn | W | apiq's brainstorm C9 partially covers; this is more strict (every 2xx + 4xx) |
| **G-OWASP-15** | 429 response MUST declare `Retry-After` header | OWASP `owasp:api4:2023-rate-limit-retry-after` + Team-D `missing-retry-after` (also 503) | error | R | apiq C9 captures intent — formalize as rule |
| **G-OWASP-16** | Spec should define a 429 response somewhere (rate-limit awareness) | OWASP `owasp:api4:2023-rate-limit-responses-429` | warn | M (op-level rule) | apiq missing |
| **G-OWASP-17** | Array schemas MUST have `maxItems` (DoS hardening) | OWASP `owasp:api4:2023-array-limit` + Team-D `array-boundaries` | warn | R | apiq missing — worth adding |
| **G-OWASP-18** | Strings MUST have one of: `maxLength` / `enum` / `const` (DoS + injection hardening) | OWASP `owasp:api4:2023-string-limit` + Team-D `string-maxlength` + `string-pattern-or-format-or-enum` | warn | W (already exists) + R | apiq Walker covers statistical; add per-property error-rule for total absence-of-bound |
| **G-OWASP-19** | Strings should additionally have one of: `format` / `pattern` / `enum` / `const` | OWASP `owasp:api4:2023-string-restricted` | hint | R | apiq missing |
| **G-OWASP-20** | Integers MUST have `minimum` AND `maximum` (DoS hardening) | OWASP `owasp:api4:2023-integer-limit` + Team-D `number-boundaries` | warn | W (already exists statistical) + R | apiq Walker covers; add per-property hint where both undefined |
| **G-OWASP-21** | Integers MUST declare `format: int32` or `int64` (interop) | OWASP `owasp:api4:2023-integer-format` + Team-D `integer-format` + `allowed-integer-format` + Zalando `must-define-a-format-for-integer-types` | warn | R | apiq missing — broadly endorsed |
| **G-OWASP-22** | Numbers MUST declare a format (decimal32/64, float, double) | Team-D `number-format` + `allowed-number-format` + Zalando `must-define-a-format-for-number-types` | hint | R | apiq missing |
| **G-OWASP-23** | URL-handling parameters (named `*_url`/`callback`/`redirect`) flagged for SSRF review | OWASP `owasp:api7:2023-concerning-url-parameter` | hint | R | apiq missing |
| **G-OWASP-24** | All response objects should declare `Access-Control-Allow-Origin` (CORS) | OWASP `owasp:api8:2023-define-cors-origin` | hint | R | apiq missing — opinionated, mark as recommendable-off-by-default |
| **G-OWASP-25** | `servers[].url` MUST NOT use `http://` (HTTPS-only) | OWASP `owasp:api8:2023-no-server-http` + AYWH `hosts-https-only-oas3` + Adidas `adidas-oas3-protocol-https-only` + Team-D `servers-use-https` + SPS `sps-hosts-https-only` | error | R | apiq has localhost-rule; **add explicit-http rejection** |
| **G-OWASP-26** | Spec should declare 400 / 422 / 4XX response (input-validation contract) | OWASP `owasp:api8:2023-define-error-validation` + DigitalOcean `common-responses-not-found` etc. | warn | M (op-level) | apiq C3 covers; formalize |
| **G-OWASP-27** | Operations should declare 401 response if security present | OWASP `owasp:api8:2023-define-error-responses-401` | warn | M | apiq C5 covers; formalize |
| **G-OWASP-28** | Operations should declare 500 / default response (server-error contract) | OWASP `owasp:api8:2023-define-error-responses-500` + DigitalOcean `common-responses-server-error` + SPS `sps-missing-500-response` + Azure `az-default-response` + Zalando `must-specify-default-response` | warn | M | apiq C7 covers; formalize |
| **G-AYWH-1** | `/` root path should exist (API-home / discovery convention) | AYWH `api-home` + `api-home-get` | hint | R | Niche but cheap |
| **G-AYWH-2** | `/health` endpoint should exist (monitoring convention) | AYWH `api-health` + `api-health-format` | hint | R | Niche but cheap |
| **G-AYWH-3** | Path segments: lowercase + kebab-case | AYWH `paths-kebab-case` + Adidas `adidas-paths-kebab-case` + SPS `sps-paths-kebab-case` + Team-D `paths-kebab-case` + Zalando `must-use-lowercase-with-hypens-for-path-segements` + Azure `az-path-case-convention` | warn | R + W | apiq G4/S1 covers; consensus-confirms |
| **G-AYWH-4** | Header parameters MUST NOT start with `X-` (RFC 6648) | AYWH `no-x-headers` + `no-x-response-headers` + SPS `sps-no-x-headers` + `sps-no-x-response-headers` + Team-D `no-x-headers-request` + `no-x-headers-response` | warn | R | apiq missing |
| **G-AYWH-5** | GET MUST NOT have `requestBody` (OAS-3 disallowed in practice) | AYWH `request-GET-no-body-oas3` + Adidas `adidas-oas3-no-get-request-body` + SPS `sps-request-get-invalid-body` | error | R | apiq B1 covers |
| **G-AYWH-6** | DELETE MUST NOT have `requestBody` | Adidas `adidas-oas3-delete-with-request-body` + SPS `sps-request-delete-invalid-body` | warn | R | apiq B7 covers |
| **G-AYWH-7** | PUT MUST have `requestBody` | Adidas `adidas-oas3-put-with-request-body` | warn | R | apiq missing |
| **G-AYWH-8** | OPTIONS MUST NOT have `requestBody` | SPS `sps-request-options-invalid-body` | warn | R | apiq missing |
| **G-AYWH-9** | HEAD MUST NOT have `requestBody`, no response body | SPS `sps-request-head-invalid-body` + `sps-response-head-invalid-body` | warn | R | apiq B2 covers partially |
| **G-AYWH-10** | Every request body should support `application/json` | AYWH `request-support-json-oas3` + Adidas `adidas-oas3-request-support-json` + SPS `sps-request-support-json` | warn | R | apiq has `apiq-post-should-accept-json` for forms-only; broaden to all body methods |
| **G-AYWH-11** | Error responses (4xx/5xx) should use RFC 9457/7807 (`application/problem+json`) or JSON:API | AYWH `no-unknown-error-format` + Adidas `adidas-oas2-response-error-problem` + SPS `sps-unknown-error-format` + Team-D `use-problem-json-for-errors` + Zalando `must-use-problem-json-for-errors` + `must-use-problem-json-as-default-response` | warn | R | apiq K2 covers; widely-endorsed |
| **G-AYWH-12** | Problem-schema validation: response should contain `status` + `title` + `detail` (RFC 7807 fields) | Team-D `use-problem-schema` + `hint-problem-schema` + Zalando `must-use-valid-problem-json-schema` | hint | M | apiq K1 covers; deeper structural variant |
| **G-AYWH-13** | Server URL should not contain global versions (`/v1`, `/v2`) | AYWH `no-global-versioning` + URL-Versioning `no-path-versioning` + Zalando `must-not-use-uri-versioning` | warn | R | apiq H1 covers; consensus is strong (controversial — opinionated) |
| **G-AYWH-14** | Path should not include file extensions (`.json`, `.xml`) | AYWH `no-file-extensions-in-paths` + SPS `sps-paths-expose-extension` + `sps-no-resource-extensions` + `sps-paths-expose-technology` | error | R | apiq missing |
| **G-AYWH-15** | Spec MUST have `securitySchemes` defined (no fully-public APIs) | AYWH `no-security-schemes-defined` + Adidas `adidas-oas3-security-schemes-required` + SPS `sps-authorization-missing` | error | R | apiq F1 covers |
| **G-URL-1** | Single API version per spec (one server-version) | URL-Versioning `one-api-version-per-document` | error | M | apiq H1 covers |
| **G-URL-2** | Server URL versions: major-only (no `/v1.2`) | URL-Versioning `only-major-api-versions` | warn | R | apiq missing |
| **G-URL-3** | No version in path (`/v1/users` rejected) | URL-Versioning `no-path-versioning` + Zalando `must-not-use-uri-versioning` | warn | R | apiq missing — opinionated; controversial vs DigitalOcean's `path-must-include-version`. Mark as off-by-default. |
| **G-AZ-1** | `additionalProperties` AND `properties` siblings is a schema-authoring error | Azure `az-additional-properties-and-properties` | warn | R | apiq missing |
| **G-AZ-2** | `additionalProperties: type: object` without `properties` is common error | Azure `az-additional-properties-object` | hint | R | apiq missing — niche |
| **G-AZ-3** | Boolean property names: no `is`/`has`/`was` prefix | Azure `az-boolean-naming-convention` + SPS `sps-disallowed-boolean-prefixes` | warn | R | apiq missing — opinionated, mark off-by-default |
| **G-AZ-4** | Date-time property names should end with `At` suffix | Azure `az-datetime-naming-convention` | hint | R | apiq missing — opinionated; niche |
| **G-AZ-5** | DELETE operation should return 202 or 204 (not 200) | Azure `az-delete-response-codes` | warn | R | apiq B4 covers |
| **G-AZ-6** | 204 response should have NO response body | Azure `az-204-no-response-body` | warn | R | apiq missing |
| **G-AZ-7** | Header parameters: Authorization / Content-Type / Accept MUST NOT be declared explicitly | Azure `az-header-disallowed` + Team-D `no-forbidden-headers` + SPS `sps-no-explicit-headers` | warn | R | apiq has Content-Type rule; **add Authorization + Accept** |
| **G-AZ-8** | Operation should have summary OR description | Azure `az-operation-summary-or-description` + VTex `must-include-operation-summary` | warn | R | spectral:oas covers `operation-description`; tighten |
| **G-AZ-9** | Required parameter MUST NOT specify `default` | Azure `az-parameter-default-not-allowed` | warn | R | apiq T2 covers |
| **G-AZ-10** | Required schema property MUST NOT specify `default` | Azure `az-property-default-not-allowed` | warn | R | apiq missing — extends T2 |
| **G-AZ-11** | All parameters should have description | Azure `az-parameter-description` | warn | R | apiq T3 covers (length-based) |
| **G-AZ-12** | Path parameter names should be consistent across paths | Azure `az-path-parameter-names` | warn | M | apiq G6/J3 covers |
| **G-AZ-13** | Path parameter schema: `type: string` + `maxLength` + `pattern` | Azure `az-path-parameter-schema` | hint | R | apiq partial (T7) |
| **G-AZ-14** | Path-parameters in operation must be in same order as in path | Azure `az-parameter-order` | warn | M | apiq missing |
| **G-AZ-15** | Operation parameter names should be case-insensitive unique | Azure `az-parameter-names-unique` | warn | M | apiq missing |
| **G-AZ-16** | Request body schema MUST NOT be a bare array | Azure `az-request-body-type` + Zalando `must-always-return-json-objects-as-top-level-data-structures` (response variant) + Team-D `response-with-json-object` | warn | R | apiq missing — strong consensus |
| **G-AZ-17** | Response body schema MUST NOT be a bare array (extensibility) | Azure `az-response-body-type` + Zalando + Team-D `response-with-json-object` + SPS `sps-invalid-response-body` | warn | R | apiq missing — endorsed by 4 sources |
| **G-AZ-18** | All schemas should have `description` OR `title` | Azure `az-schema-description-or-title` + VTex `no-empty-titles` | warn | R + W | apiq M1 Walker covers statistical; per-schema is stricter |
| **G-AZ-19** | Schema should declare both `type` AND `format` (well-defined) | Azure `az-schema-type-and-format` + DigitalOcean `schema-properties-must-have-type` + VTex `array-items` | warn | R | apiq missing — strongly endorsed |
| **G-AZ-20** | All schema properties should have a defined type (or `$ref`/`allOf`/`oneOf`/`anyOf`) | Azure `az-property-type` + DigitalOcean `schema-properties-must-have-type` | warn | R | apiq missing |
| **G-AZ-21** | Security definition should have a description | Azure `az-security-definition-description` | hint | R | apiq F8 covers |
| **G-AZ-22** | Spec-level `security` should have ≥1 requirement (not empty array unless intentional public) | Azure `az-security-min-length` | warn | R | apiq F1 partial |
| **G-AZ-23** | All success responses (≠ 204) should define a response body | Azure `az-success-response-body` | warn | R | apiq missing |
| **G-AZ-24** | Properties marked `readOnly: true` should not appear in request schemas | Azure `az-readonly-in-response-schema` (mirror) | hint | M | apiq missing |
| **G-AZ-25** | `info.version` should follow date-based YYYY-MM-DD or semver | Azure `az-version-convention` + Adidas `adidas-oas3-stable-semantic-version` + SPS `sps-semver` + Team-D `use-semver` + Zalando `must-use-semantic-versioning` | warn | R | apiq H2 covers |
| **G-AZ-26** | Path segments: only allowed chars `0-9 A-Z a-z - . _ ~ :` | Azure `az-path-characters` | hint | R | apiq missing |
| **G-AZ-27** | Schema names should follow PascalCase | Azure `az-schema-names-convention` + Red-Hat `rhoas-schema-name-pascal-case` + SPS `sps-schema-names-pascal-case` + `sps-response-names-pascal-case` | warn | R + W | apiq G2 covers as Walker; rule-form is sharper |
| **G-AZ-28** | Schema property names should be camelCase (Microsoft convention) | Azure `az-property-names-convention` + Adidas `adidas-properties-camelCase-alphanumeric` + SPS `sps-camel-case-properties` | warn | W | apiq G1 covers Walker; controversial vs Zalando snake_case — leave as Walker, not rule |
| **G-DO-1** | Object-property nested object should have examples | DigitalOcean `properties-must-include-examples` + Adidas `adidas-oas3-real-like-examples` + Zalando `must-use-standard-formats-for-date-and-time-properties-example` | hint | W | apiq has examples-walkers; broaden |
| **G-DO-2** | Parameters should have `example` OR `examples` (or schema-derived: format/default/enum) | DigitalOcean `params-must-include-examples` + Stoplight-Docs `docs-parameter-examples-or-schema` (oas3) | warn | R | apiq missing |
| **G-DO-3** | Headers should have `example` OR `examples` | DigitalOcean `headers-must-include-examples` | hint | R | apiq missing |
| **G-DO-4** | Array properties / parameters MUST have `items` with a `type` | DigitalOcean `array-properties-must-have-items-with-type` + `array-params-must-have-items-with-type` + VTex `array-items` + `request-body-items-type` + `response-body-items-type` | warn | R | apiq missing |
| **G-DO-5** | OperationId naming follows method convention (e.g. `list_*` for GET-list, `get_*` for GET-single, `create_*` for POST) | DigitalOcean `operationid-must-follow-new-naming-conventions` | hint | M | apiq B8 covers |
| **G-SD-1** | Description must be capitalized (start with uppercase) and end with period | Stoplight-Docs `docs-description` + VTex `must-end-descriptions-with-period` | hint | R | apiq missing |
| **G-SD-2** | Description should be ≥20 chars | Stoplight-Docs `docs-description` | hint | R | apiq has stub-rule for schemas (≥10) — broaden + raise to 20 |
| **G-SD-3** | Tags should be alphabetical (rendering UX) | Stoplight-Docs `docs-tags-alphabetical` | hint | M | apiq Q3 covers — formalize |
| **G-SD-4** | Server URL should not be `example.com` (placeholder smell) | Stoplight-Docs `docs-api-host-not-example` + `docs-api-server-not-example.com` | warn | R | apiq has localhost-rule; **add example.com** |
| **G-SD-5** | `operationId` must contain only URL-friendly characters | Stoplight-Docs `docs-operationId-valid-in-url` | error | R | apiq missing |
| **G-VTEX-1** | Each parameter MUST have description (no truthy-empty) | VTex `parameters-description` + Azure `az-parameter-description` | warn | R | apiq T3 covers length-based |
| **G-VTEX-2** | Each property MUST have description | VTex `properties-description` + Azure `az-property-description` + Stoplight-Docs `docs-description` | warn | W | apiq M2 covers as Walker |
| **G-VTEX-3** | Descriptions must not be empty/whitespace-only | VTex `no-empty-descriptions` | error | R | apiq M1 covers Walker; add per-node rule |
| **G-VTEX-4** | Each response MUST contain a schema | VTex `must-include-response-schemas` | warn | R | apiq D4 partial; tighten |
| **G-VTEX-5** | Response body fields shouldn't have `example` (schema-level example only) | VTex `response-body-objects-arrays-example` | hint | R | apiq missing — opinionated |
| **G-VTEX-6** | Request body example should be parallel to schema (siblings, not nested) | VTex `request-example-parallel-to-schema` | hint | R | apiq missing — opinionated |
| **G-VTEX-7** | Components must not contain chained `$ref`s | VTex `no-chained-refs-in-components` | warn | M (graph) | apiq missing — solid hygiene |
| **G-VTEX-8** | Tags should use sentence-case (or product-name allowlist) | VTex `tags-should-be-in-sentence-case` | hint | R | apiq G7 covers via Walker |
| **G-VTEX-9** | Operation summaries should be in sentence-case (no period) | VTex `summaries-should-be-in-sentence-case` | hint | R | apiq R1 covers length |
| **G-VTEX-10** | Use `email` not `e-mail` in descriptions | VTex `write-email-not-e-mail` | hint | R | apiq missing — niche |
| **G-VTEX-11** | Status-code descriptions should follow title-case format | VTex `status-code-descriptions-format` | hint | R | apiq missing — opinionated |
| **G-SPS-1** | Custom HTTP-method enumeration: only standard methods allowed | SPS `sps-invalid-http-method` | error | R | apiq missing |
| **G-SPS-2** | Property names: no programming-language reserved keywords (java/c/c++) | SPS `sps-no-keyword-conflicts` | warn | R | apiq missing — codegen-load-bearing |
| **G-SPS-3** | Property names: no preposition-prefixes (`for`, `during`, `at`, `from`...) | SPS `sps-disallowed-prepositions` | hint | R | apiq missing — opinionated |
| **G-SPS-4** | Path: no trailing slash | SPS `sps-paths-trailing-slash` + Zalando `must-use-normalized-paths-without-trailing-slash` | error | R | apiq S3 covers |
| **G-SPS-5** | Path: no empty segments (`//`) | SPS `sps-paths-empty-segments` + Zalando `must-use-normalized-paths-without-empty-path-segments` | error | R | apiq missing |
| **G-SPS-6** | Path: limit ≤3 dynamic path-parameters | SPS `sps-paths-limit-path-parameters` | warn | R | apiq missing |
| **G-SPS-7** | Path: limit sub-resources to ≤8 levels (smell threshold) | SPS `sps-paths-limit-sub-resources` + Zalando `should-limit-number-of-sub-resource-levels` | warn | R | apiq S2 covers |
| **G-SPS-8** | Path: must not contain HTTP method names (`/get`, `/post`, etc.) | SPS `sps-paths-with-http-methods` + Adidas `adidas-oas3-no-verbs-in-paths` + Team-D `paths-http-method` | warn | R | apiq S8 covers |
| **G-SPS-9** | Path: must not start with `/api` (over-namespacing) | Zalando `should-not-use-api-as-base-path` + SPS `sps-paths-with-api` | hint | R | Opinionated; mark off-by-default |
| **G-SPS-10** | Path: must not encode environment names (`/prod`, `/dev`) | SPS `sps-path-no-environment` | error | R | apiq missing |
| **G-SPS-11** | Server URL: must not specify port (except localhost) | SPS `sps-hosts-no-port` | error | R | apiq missing — strong production-hygiene |
| **G-SPS-12** | Server URL: must be lowercase | SPS `sps-hosts-lowercase` | warn | R | apiq missing |
| **G-SPS-13** | Sensitive header-names rejected (`Password`, `Token`-named headers) | SPS `sps-sensitive-data-in-headers` | error | R | apiq missing — security-hygiene |
| **G-SPS-14** | Headers: hyphenated-pascal-case naming | SPS `sps-headers-hyphenated-pascal-case` + Adidas `adidas-headers-hyphenated-pascal-case` + Zalando `should-use-hyphenated-pascal-case-for-header-parameters` + Team-D `request-headers-pascal-case` + `response-headers-pascal-case` | warn | R | apiq G8 covers |
| **G-SPS-15** | `Location` header MUST NOT appear on non-201 responses | SPS `sps-invalid-location-header` | warn | R | apiq missing |
| **G-SPS-16** | Query parameters MUST be optional (not `required: true`) | SPS `sps-query-params-not-required` | warn | R | apiq missing — opinionated, mark off-by-default |
| **G-SPS-17** | Path: must not contain query-string `?` (must be parameters) | SPS `sps-query-params-not-in-path` | warn | R | apiq missing |
| **G-SPS-18** | Status codes restricted to common allowlist (RFC 2616 + common usage) | SPS `sps-invalid-status-code` + Zalando `must-use-standard-http-status-codes` | warn | R | apiq missing |
| **G-SPS-19** | Status code allowlist per HTTP method (Zalando-style "well-understood codes") | Zalando `should-use-well-understood-http-status-codes` (POST→201/202/4xx, DELETE→202/204/4xx, etc.) | warn | M | apiq C8 covers; sharper |
| **G-SPS-20** | Path total-length ≤100-200 characters (URL-length practical bound) | SPS `sps-limit-path-size` | warn | R | apiq missing |
| **G-SPS-21** | Webhook endpoints under conventional prefix (`/_webhooks/...` SPS, `webhooks` OAS3.1) | SPS `sps-webhooks-path` + apiq U-section | hint | R | apiq partial U2 |
| **G-SPS-22** | MIME types: only `application/json` / `problem+json` / `vnd.*` | SPS `sps-invalid-mime-type` | warn | R | apiq partial (markdown-rule) — broaden |
| **G-TD-1** | Cache-Control header: description must mention `max-age`/`private`/`no-store`/`no-cache` if Cache-Control declared | Team-D `cache-control-parameter-undocumented` | hint | R | apiq missing |
| **G-TD-2** | Cache-Control + Expires must not appear together (xor) | Team-D `cache-responses-indeterminate-behavior` | hint | R | apiq missing |
| **G-TD-3** | OpenAPI version must be ≥3.0 (no swagger-2 in modern specs) | Team-D `no-swagger-2` + Red-Hat `rhoas-oas3minimum` | error | R | apiq missing — but apiq is OAS3-only by ingestion-policy; document |
| **G-TD-4** | PATCH operations must NOT use `application/json` (RFC errata 3169 — use `application/json-patch+json` or `merge-patch+json`) | Team-D `patch-media-type` + Azure `az-patch-content-type` | error | R | apiq missing — load-bearing for patch-correctness |
| **G-TD-5** | Server objects must have `description` | Team-D `servers-description` + Adidas servers-description | error | R | apiq P2 covers |
| **G-TD-6** | Tags must have description (substantive) | spectral:oas has `oas3-tag-no-empty-description` (apiq extends with min-5-char) | hint | R | apiq has `apiq-tag-meaningful-description` |
| **G-TD-7** | OperationId must be unique | spectral:oas has `operation-operationId-unique` | error | R | apiq R7 covers |
| **G-ZAL-1** | UPPER_SNAKE_CASE enum values | Zalando `should-declare-enum-values-using-upper-snake-case-format` | hint | R + W | Opinionated; mark off-by-default |
| **G-ZAL-2** | snake_case property names (controversial vs camelCase) | Zalando `must-use-snake-case-for-property-names` + DigitalOcean `schema-key-must-be-snake-cased` + Red-Hat `rhoas-schema-properties-snake-case` | warn | W | apiq G1 Walker — keep as statistical, not rule |
| **G-ZAL-3** | snake_case query-parameter names | Zalando `must-use-snake-case-for-query-parameters` | warn | W | Statistical pattern only |
| **G-ZAL-4** | Date-time properties: example must end with `Z` (UTC) | Zalando `must-use-standard-formats-for-date-and-time-properties-utc` | hint | R | apiq I3 covers |
| **G-ZAL-5** | All schemas (under JSON content) must be top-level objects | Zalando `must-always-return-json-objects-as-top-level-data-structures` + Team-D `response-with-json-object` | warn | R | Same as G-AZ-17 (response variant) |
| **G-ZAL-6** | `info.contact.{name,url,email}` should all be present | Zalando `must-have-info-contact-{name,url,email}` | hint | R | spectral:oas has `info-contact`; tighten to specific fields |
| **G-ZAL-7** | Open-ended enum (`x-extensible-enum`) preferred over `enum` for evolvability | Zalando `should-use-x-extensible-enum` | hint | R | Opinionated; mark off-by-default |
| **G-RHOAS-1** | OpenAPI version pattern (≥3.x) | Red-Hat `rhoas-oas3minimum` | warn | R | Same as G-TD-3 |
| **G-RHOAS-2** | OperationId truthy on every operation | Red-Hat `rhoas-operation-id` | warn | R | spectral:oas covers |

### Deep-mechanic patterns (beyond Spectral DSL)

| ID | Pattern | Source | apiq layer |
|---|---|---|---|
| **DM-1** | Custom function: assert HTTP-status-codes-per-method (op-aware) | Zalando `assert-http-codes-for-operation` + SPS per-method-rules | M |
| **DM-2** | Custom function: count resource types in paths (limit ≤8) | Zalando `count-resource-types` | M |
| **DM-3** | Custom function: is-object-schema (top-level body must be object) | Zalando `is-object-schema` | M |
| **DM-4** | Custom function: is-problem-json-schema (RFC 7807 structural validation) | Zalando `is-problem-json-schema` | M |
| **DM-5** | Custom function: header-naming RFC-compliant + RateLimit-allowlist | Zalando `rule-132` | M |
| **DM-6** | Custom function: parameter-order matches path-template | Azure `param-order` | M |
| **DM-7** | Custom function: param-names case-insensitive uniqueness | Azure `param-names-unique` | M |
| **DM-8** | Custom function: path-param schema (string + maxLength + pattern) | Azure `path-param-schema` | M |
| **DM-9** | Custom function: PUT request schema must equal response schema | Azure `put-request-and-response-body` | M |
| **DM-10** | Custom function: consistent-response-body GET/PUT/PATCH | Azure `consistent-response-body` | M |
| **DM-11** | Custom function: chained-$ref-detection in components | VTex `noChainedRefsInComponents` | M (graph) |
| **DM-12** | Custom function: ensure all arrays have items with type | DigitalOcean `ensureAllArraysHaveItemTypes` | M |
| **DM-13** | Custom function: validate operationId-naming-by-method | DigitalOcean `validateOpIDNaming` | M |
| **DM-14** | Custom function: server-config matches required allowlist | Red-Hat `expectServersConfig` | M (vendor-skip) |
| **DM-15** | Custom function: required schema-shape (Error has code+id+href+reason; List has items+kind+page+size+total) | Red-Hat `schemaDefinition` | M (vendor-skip) |
| **DM-16** | OWASP custom function: `checkSecurity` (op-aware security-coverage check) | OWASP | M |
| **DM-17** | OWASP custom function: `differentSecuritySchemes` (admin-paths use distinct schemes) | OWASP `owasp:api5:2023-admin-security-unique` | M |

### Vendor-/Org-Specific (skip — document for awareness)

| ID | Pattern | Source | Why-skip |
|---|---|---|---|
| **V-1** | `info.x-leanixid` required (with UUID format) | Adidas | LeanIX is Adidas' enterprise inventory tool. Spec-agnostic apiq cannot mandate. |
| **V-2** | `info.x-gateway` enumeration: `kong/nginx/aws/akamai/sap/other` | Adidas | Adidas-internal taxonomy. |
| **V-3** | All success responses MUST be `application/hal+json` | Adidas | HAL is one of many hypermedia conventions; not universal. |
| **V-4** | All errors MUST be `application/problem+json` (mandatory, not just preferred) | Adidas (mandatory) | We have G-AYWH-11 as `warn` — Adidas's `error` severity is opinionated. |
| **V-5** | `info.x-summary` field required | Team-D | OAS 3.1 has `info.summary`; older specs use `x-summary`. Niche. |
| **V-6** | `info.x-api-id` required (Zalando UUID convention) | Zalando + Team-D | Vendor-internal API-tracking convention. |
| **V-7** | `info.x-audience` enum (component-internal/business-unit-internal/...) | Zalando | Zalando taxonomy. |
| **V-8** | `info.termsOfService` required | Team-D | Italian-public-policy mandate. Useful but not universal. |
| **V-9** | `/status` endpoint mandate (health-check) | Team-D | One of many health-conventions (`/health`, `/healthz`, `/ping`). AYWH `api-health` is cousin. |
| **V-10** | `/status` MUST return Problem-JSON | Team-D | Tied to V-9. |
| **V-11** | `x-ms-client-flatten`, `x-ms-long-running-operation`, `x-ms-pageable`, `x-ms-paths`, `x-ms-error-code`, `x-ms-enum`, `x-nullable` | Azure | Azure-vendor extensions. |
| **V-12** | Long-running-operation (LRO) rules — 202 + Operation-Location header pattern | Azure | Azure-LRO convention; not universal. |
| **V-13** | `api-version` query parameter (not in path) | Azure | Microsoft API versioning convention. Conflicts with Zalando/Stoplight. |
| **V-14** | Date-based version YYYY-MM-DD | Azure | Microsoft convention; conflicts with semver. |
| **V-15** | Custom `Sps-*` header prefix mandate; sps-ref schema (255 chars, "sps" pattern) | SPS | SPS internal convention. |
| **V-16** | `api.spscommerce.com` host enforcement | SPS | Vendor-domain. |
| **V-17** | `_webhooks/` path-prefix + `x-internal: true` | SPS | SPS webhook convention. |
| **V-18** | `/api/{name}/v{n}` mandatory path prefix | Red-Hat | Red-Hat OpenShift product convention. |
| **V-19** | Allowlisted server URLs (api.openshift.com, etc.) | Red-Hat | Vendor-specific. |
| **V-20** | Required Error / ObjectReference / List schema-shapes | Red-Hat | Red-Hat product convention. |
| **V-21** | DigitalOcean: paths must include `/v1/` or `/v2/` (mandatory path-versioning) | DigitalOcean | Conflicts with G-AYWH-13 / G-URL-3 — opinion divide. |
| **V-22** | DigitalOcean: endpoint must be a `$ref` to `resources/*.yml` | DigitalOcean | Repository-organization convention. |
| **V-23** | "VTEX/SKU/EAN/B2B" product-name allowlist in tag-casing rule | VTex | Vendor allowlist. |
| **V-24** | "## Permissions" section required in op descriptions | VTex | VTex documentation convention. |
| **V-25** | Box: rules using @box-internal helper functions | Box | (Couldn't fetch but the index notes "custom function enforcement"). |
| **V-26** | `info.contact` (license) Apache-2.0 mandate | Red-Hat `rhoas-info-license-apache2.0` | Vendor license-policy. |
| **V-27** | VRChat typo-detection on ad-hoc word-list | VRChat `vrc-typos` | One of many possible typo-checks; not universal pattern. |
| **V-28** | Microcks compatibility-layer | `@microcks/spectral-ruleset` | Tool-specific. |

### Already-in-apiq-brainstorm (external source confirms)

| brainstorm-ID | external-source-confirms | Notes |
|---|---|---|
| **A1** ($ref-targets exist) | Implicit in spectral:oas + universally expected | Confirmed |
| **A4** (discriminator on oneOf) | apiq-oneof-needs-discriminator | apiq has it; OWASP/Zalando confirm need |
| **A11** (additionalProperties combinatorial) | OWASP G-OWASP-12 + Team-D `no-default-additionalProperties` | Strongly confirmed |
| **B1** (GET no requestBody) | AYWH G-AYWH-5 + Adidas + SPS | Universally confirmed |
| **B7** (DELETE no body) | Adidas + SPS G-AYWH-6 | Confirmed |
| **B3** (POST→201 + Location) | Multiple + SPS sps-invalid-location-header | Confirmed |
| **B4** (DELETE→204/200) | Azure G-AZ-5 + SPS | Confirmed |
| **C1** (every op has 2xx) | spectral:oas `operation-success-response` | Confirmed |
| **C2** (state-changing → 4xx) | OWASP G-OWASP-26 | Confirmed |
| **C3** (requestBody → 400/422) | OWASP G-OWASP-26 | Confirmed |
| **C5** (security → 401) | OWASP G-OWASP-27 | Confirmed |
| **C7** (5xx/default coverage) | OWASP G-OWASP-28 + Azure G-AZ-1+ | Confirmed |
| **C8** (status-code conflicts) | Zalando G-SPS-19 | Confirmed |
| **C9** (429 → Retry-After) | OWASP G-OWASP-15 + Team-D | Confirmed |
| **D6** (problem+json conformance) | AYWH G-AYWH-11 + Team-D + Zalando | Strongly confirmed |
| **F1** (securitySchemes if non-public) | AYWH G-AYWH-15 | Confirmed |
| **F2** (operations have security) | OWASP G-OWASP-10 | Confirmed |
| **F5** (OAuth2 flow has urls) | OWASP G-OWASP-6 + Team-D `securitySchemes-oauth-http` | Confirmed |
| **F8** (security-scheme description) | Azure G-AZ-21 | Confirmed |
| **G1, G2** (camel/snake/Pascal naming) | Confirmed by Zalando + Adidas + DigitalOcean + Azure + Red-Hat + SPS — NOTE: opinion-divided (camelCase vs snake_case). Keep as statistical Walker, not enforced rule. |
| **G4** (path lowercase) | AYWH G-AYWH-3 + Adidas + SPS + Zalando + Team-D + Azure | Universally confirmed |
| **G6** (path-param naming consistency) | Azure G-AZ-12 | Confirmed |
| **G8** (header-naming convention) | SPS G-SPS-14 + Adidas + Zalando + Team-D | Confirmed (hyphenated-pascal) |
| **H1** (URL vs Header version-mixing) | URL-Versioning G-URL-1 + Zalando | Confirmed |
| **H2** (semver) | Adidas G-AZ-25 + SPS + Team-D + Zalando | Confirmed |
| **I1, I2** (date-time / date format) | Zalando G-ZAL-4 + apiq has unix-time-format rule | Confirmed |
| **K1** (error schema has type/code+message) | Team-D G-AYWH-12 | Confirmed |
| **K2** (RFC 7807 / problem+json) | AYWH + Team-D + Zalando | Strongly confirmed |
| **K6** (error examples on 4xx) | Implicit in DigitalOcean examples-everywhere | Confirmed |
| **L2** (requestBody.required explicit) | Azure G-AZ-9-cousin (required-no-default) | Partially confirmed |
| **M1** (schemas without description) | Stoplight-Docs `docs-description` + VTex `no-empty-descriptions` + Azure G-AZ-18 | Strongly confirmed |
| **M8** (additionalProperties statistical) | OWASP G-OWASP-12 + Team-D | Strongly confirmed |
| **M9** (string maxLength) | OWASP G-OWASP-18 + Team-D | Strongly confirmed |
| **M10** (integer min/max) | OWASP G-OWASP-20 + Team-D | Strongly confirmed |
| **N1** (examples validate against schema) | spectral:oas `oas3-valid-media-example` | Confirmed |
| **N3** (requestBody examples) | DigitalOcean G-DO-2 + Adidas G-DO-1 | Confirmed (apiq has rule) |
| **O1** (unused components) | spectral:oas + apiq has headers/examples | Confirmed |
| **P1** (server URL absolute) | Stoplight-Docs G-SD-4 (no-example.com) + SPS + Adidas https-only | Confirmed |
| **P2** (server-variables default+description) | Team-D G-TD-5 | Confirmed |
| **P3, P4** (path-template valid) | spectral:oas `path-params` + Azure G-AZ-14 | Confirmed |
| **Q1** (operations w/o tags) | spectral:oas `operation-tags` + SchwarzIT `path-must-specify-tags` | Confirmed |
| **Q3** (tag ordering) | Stoplight-Docs G-SD-3 | Confirmed |
| **R1** (summary length) | VTex G-VTEX-9 (sentence-case) | Partial |
| **R7** (operationId duplicates) | spectral:oas + Team-D G-TD-7 | Confirmed |
| **S1** (path lowercase) | See G4 | Confirmed |
| **S2** (path depth >5) | SPS G-SPS-7 + Zalando | Confirmed |
| **S3** (trailing slash consistency) | SPS G-SPS-4 + Zalando | Confirmed |
| **S6** (path-param in path) | spectral:oas `path-params` + Azure G-AZ-14 | Confirmed |
| **S8** (verbs in paths) | SPS G-SPS-8 + Adidas + Team-D | Confirmed |
| **T2** (required param no default) | Azure G-AZ-9 | Confirmed |
| **T3** (param description short) | Azure G-AZ-11 + VTex G-VTEX-1 | Confirmed |
| **T4** (Authorization/Content-Type/Accept as headers) | Azure G-AZ-7 + SPS + Team-D | Confirmed (apiq partial) |
| **W6** (% strings with maxLength) | OWASP G-OWASP-18 + Team-D | Confirmed (apiq Walker) |
| **W7** (% integers with min/max) | OWASP G-OWASP-20 + Team-D | Confirmed (apiq Walker) |
| **W11** (HTML in description) | Implicit in CommonMark-spec; apiq has rule | Confirmed |

### Unsure (orchestrator review needed)

| ID | Pattern | Source | Why-unsure |
|---|---|---|---|
| **U-1** | Mandate `securityScheme` description mentions RFC 8725 (JWT alg-confusion mitigation) | OWASP G-OWASP-9 + Team-D | Useful but very narrow — does apiq want to require RFC-citation in prose? Possibly LLM-Phase B (semantic recognition of JWT-best-practice-coverage). |
| **U-2** | Define an `/admin` path uses different security-scheme than non-admin (privilege-escalation-prevention) | OWASP G-OWASP-17 (`differentSecuritySchemes` custom function) | Hardcoded path heuristic ("/admin"). Useful but spec-vs-LLM-borderline. Likely Stage A but with very narrow trigger condition. |
| **U-3** | OAuth2 `refreshUrl` required (token rotation) | OWASP G-OWASP-7 | Valid in many contexts; some auth flows legitimately don't use refresh tokens (clientCredentials excluded by OWASP rule already). Stage A as `warn` is OK; orchestrator decides. |
| **U-4** | All response objects must declare CORS `Access-Control-Allow-Origin` header | OWASP G-OWASP-24 | Strongly opinionated. Many APIs are not browser-consumed. Recommend `recommended: false` (off-by-default). |
| **U-5** | Boolean-prop naming: forbid `is`/`has`/`was`/`can` prefix | Azure G-AZ-3 + SPS G-SPS-3-cousin | Microsoft & SPS opinion. Conflicts with widespread JS/Java conventions where `isFoo` is idiomatic. Mark off-by-default. |
| **U-6** | Date-time props must end with `At` suffix | Azure G-AZ-4 | Microsoft opinion. `created_at`/`createdAt` is widespread; `created`/`creationDate` also common. Mark off-by-default. |
| **U-7** | URL versioning: include version (`/v1/...`) vs forbid | DigitalOcean (mandatory `/v1`) vs URL-Versioning + Zalando + AYWH (forbid) | **Direct contradiction across rulesets.** apiq cannot enforce either side. Recommend: walker-statistic-only, no rule. |
| **U-8** | snake_case (Zalando, DigitalOcean, Red-Hat) vs camelCase (Adidas, Azure, SPS) for property names | Conflicting | Statistical-Walker only. No rule. |
| **U-9** | UPPER_SNAKE_CASE enum values | Zalando G-ZAL-1 | Opinion. Many APIs use lowercase or PascalCase enums. Off-by-default. |
| **U-10** | "Open-ended enum" via `x-extensible-enum` extension | Zalando G-ZAL-7 | Strongly opinionated; not standard. Off. |
| **U-11** | Path-no-`/api`-prefix | Zalando G-SPS-9 | Opinion. SPS-Commerce + many APIs use `/api/v1/`. Off-by-default. |
| **U-12** | Status-code restriction to common allowlist | SPS G-SPS-18 + Zalando | The Zalando allowlist is comprehensive (100s, 200s, 300s, 400s, 500s; specifically-included: 207, 226, 226, 423, 426, 428, 431, 511). SPS allowlist is narrower. apiq could adopt Zalando's broader list as `warn`. |
| **U-13** | Operations must have explicit `default` response | Azure G-AZ-1 + Zalando | Opinion. spectral:oas has `operation-success-response`; not all APIs follow `default` convention (some prefer specific 5xx codes). Mark as `hint`. |
| **U-14** | Strings must specify `format` OR `pattern` OR `enum` OR `const` | OWASP G-OWASP-19 | Stricter than current apiq. Could push false-positives on simple `name: string` props. Worth pilot. |
| **U-15** | All response 2XX/4XX must have RateLimit headers | OWASP G-OWASP-14 + DigitalOcean ratelimit-headers (mandatory!) | Many APIs only declare rate-limits in 429 or globally. Mandatory-everywhere is opinionated. apiq Walker (cross-cutting %) is better fit. |
| **U-16** | Paths kebab-case (Italian/AYWH/Adidas/SPS/Zalando) vs PascalCase/snakecase variants | Cross-cutting consensus on kebab-case | Strong consensus. Adopt as `warn` rule (already part of apiq G4/S1). |
| **U-17** | path-params: type:string + maxLength + pattern (Azure) | Azure G-AZ-13 | Stricter than apiq T7. Useful but high false-positive risk. Pilot. |
| **U-18** | Tags should be alphabetical | Stoplight-Docs G-SD-3 | Style choice; some specs intentionally order tags by user-flow. Recommend off-by-default. |
| **U-19** | Operation summaries: sentence-case, no period | VTex + apiq R1-cousin | Opinion. Short summaries don't always need formatting prescription. Off-by-default. |
| **U-20** | Spec must include `info.x-api-id` (cross-org API-tracking) | Zalando + Team-D | Vendor-extension; not universal. Skip. |
| **U-21** | All success response schemas non-bare (top-level object only) | Azure G-AZ-17 + Zalando G-ZAL-5 + Team-D + SPS `sps-invalid-response-body` | Strong consensus across 4+ sources. apiq should adopt. Edge case: stream/file-download endpoints legitimately return non-objects. |
| **U-22** | Health/status endpoint mandate | AYWH G-AYWH-2 + Team-D V-9 | Many internal APIs don't expose `/health`. Off-by-default for now. |
| **U-23** | Examples mandatory on all properties (DigitalOcean) | DigitalOcean G-DO-1 / G-DO-2 / G-DO-3 | DigitalOcean's `error` severity is very strict. apiq Walker is more nuanced. Keep at `hint`. |
| **U-24** | Custom HTTP-method enumeration | SPS G-SPS-1 (only standard methods) | spectral:oas already validates this via OAS schema. Probably redundant. |
| **U-25** | RFC 6648 X-header rejection | AYWH G-AYWH-4 (universal) | Strong consensus across 5+ rulesets. Adopt as `warn`. apiq missing. |
| **U-26** | PATCH content-type RFC errata 3169 (no `application/json`) | Team-D G-TD-4 + Azure | Strong RFC basis. apiq missing — load-bearing for patch correctness. Adopt. |
| **U-27** | Schema property "fingerprint" not "hash" | SPS `sps-fingerprint-naming` | SPS opinion. Skip. |
| **U-28** | "abbreviation" mandates (`identifier`→`id`, `organization`→`org`) | SPS `sps-mandate-abbreviations-*` | SPS opinion. Skip. |
| **U-29** | OpenAPI version ≥3.0 (no swagger-2) | Team-D + Red-Hat | apiq is OAS3-only by ingestion-policy already. Document, don't lint. |
| **U-30** | Keyword-conflicts in property names (java/c reserved words) | SPS G-SPS-2 | Strong codegen-correctness rationale. apiq adopt as `warn`. |

---

## Top-30 highest-value-add for apiq Stage A (orchestrator decision-list)

Of patterns NOT yet in apiq:

1. **G-OWASP-2** — `securityScheme` HTTP-Basic rejected (5+ rulesets agree)
2. **G-OWASP-3** — API keys in URL forbidden (security-load-bearing)
3. **G-OWASP-4** — credentials-in-URL (path/query) forbidden
4. **G-OWASP-15** — `Retry-After` on 429 mandatory
5. **G-OWASP-17** — `maxItems` on arrays mandatory (DoS hardening)
6. **G-OWASP-21** — `format: int32/int64` on integers
7. **G-OWASP-25** — server URL `http://` forbidden (extends apiq localhost-rule)
8. **G-AYWH-4** / **U-25** — `X-` header prefix forbidden (RFC 6648, 5+ rulesets)
9. **G-AYWH-7** — PUT must have `requestBody`
10. **G-AYWH-10** — every body-method should support `application/json`
11. **G-AYWH-12** — RFC 7807 problem-schema structural validation (status+title+detail)
12. **G-AYWH-14** — file-extension paths (`.json`/`.xml`) forbidden
13. **G-AZ-1** — `additionalProperties` AND `properties` siblings warning
14. **G-AZ-7** — Authorization/Accept headers forbidden as parameters (extends apiq's Content-Type)
15. **G-AZ-10** — required schema-property MUST NOT have `default`
16. **G-AZ-15** — operation-parameter case-insensitive uniqueness
17. **G-AZ-16/17** + **U-21** — request/response body MUST NOT be bare array
18. **G-AZ-19/20** — schemas/properties MUST declare `type` (and ideally `format`)
19. **G-AZ-23** — success responses (≠204) should define a body
20. **G-AZ-26** — path-character allowlist (RFC 3986)
21. **G-DO-4** — array `items` MUST have `type` (4 rulesets confirm)
22. **G-SD-1/2** — descriptions: capitalization + period + ≥20 chars
23. **G-SD-4** — `example.com` server-URL warning (extends localhost-rule)
24. **G-SD-5** — operationId URL-friendly characters
25. **G-SPS-2** — keyword-conflicts (programming-language reserved words)
26. **G-SPS-5** — empty path-segments (`//`)
27. **G-SPS-11** — server URLs must not specify port
28. **G-SPS-13** — sensitive-data-named headers rejected (Token/Password)
29. **G-TD-4** / **U-26** — PATCH must not use `application/json` (RFC errata 3169)
30. **G-VTEX-7** + **DM-11** — chained `$ref`s in components forbidden (graph-mechanic)

---

## Status

- **Mining:** complete 2026-05-05.
- **Sources:** 12 retrieved + 5 surveyed via index. 4 corporate sources (Box, Nexmo, Transcom, full SchwarzIT TS) inaccessible or moved — coverage from indices noted.
- **Output:** ~125 generic patterns extracted (vs ~80 currently in apiq brainstorm). Most of the gap is OWASP/security + schema-strictness + corporate-style hygiene. Strong cross-source consensus on ~30 of the new patterns.
- **Next step (orchestrator):** decide per-pattern adopt/skip/defer; integrate into apiq-ruleset.yaml + walkers/* per layer-discipline.
