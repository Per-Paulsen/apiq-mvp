# Stage A Implementation Priority Stack — Wave 2 Briefing Source

> **Authored:** 2026-05-05 evening, post-Mining-Round-2 Master-Konsolidierung.
>
> **Purpose.** This file is the source-of-truth for Wave 2 ticket-allocation: it lists ALL ~290 take-into-apiq Stage-A patterns (after dedup across Round-2 phases A-F + against Round-1) ordered by implementation-priority. Priority-tagging is implementation-order, NOT inclusion-filter — every pattern listed below is implemented in Stage A. P1 first, P2 next, P3 third; P4 / P5 trail.
>
> **Source documents.**
> - Pattern definitions + sources: `big-spec-architecture-spike-stage-a-rules-brainstorm.md` (Round-1 + Round-2 Master-Konsolidierung).
> - Lens framework + meta-axis: `big-spec-architecture-spike-stage-a-meta-insights.md` (Round-1 + Round-2 Validation).
> - Per-phase mining details: `mining-round2-{threat,standards,evolution,client,style,meta}.md`.

---

## Overview

| Metric | Count |
|---|---|
| Total Stage-A patterns (take-into-apiq, after dedup) | ~290 |
| P1 — Konkurrenz-Pari-Pflicht (mature linters catch + reputation-load-bearing) | ~95 |
| P2 — Differentiator-Patterns (apiq-USP) | ~60 |
| P3 — Defense-in-Depth + Nice-to-Have | ~110 |
| P4 — Niche / Low-Frequency | ~15 |
| P5 — Vendor-Extension / Information-only | ~10 |
| Estimated implementation-cost (S = small, ~30 min Spectral DSL) | ~170 |
| Estimated implementation-cost (M = medium, ~1-3 h Walker / custom-function) | ~85 |
| Estimated implementation-cost (L = large, ~1-2 days new Module-class) | ~35 |

**Aggregate estimated Wave 2 implementation cost:**
- ~170 × 0.5 h = **~85 h Spectral DSL rules**
- ~85 × 2 h = **~170 h Walker / custom-function**
- ~35 × 12 h = **~420 h new Modules** (8 deep-mechanic modules + classifier + aggregator-formalization + per-target metadata)

**Total: ~675 h ≈ 84 person-days for full Stage-A coverage.** Realistic delivery: 4-week sprint × 2 engineers × 80% capacity = ~50 person-days for the P1+P2 subset (~155 patterns covering mature-linter-pari + apiq-USP). P3 trail in Wave 3.

**Source-Quality-Fix verbatim verification status** (per `rules-brainstorm.md` Source-Quality-Fix table): RFC 9110 / 9111 (verbatim verified via gh-api-raw on `httpwg/http-core`); JSON:API 1.1 (verbatim verified via `json-api/json-api`); Google AIP-132 (verbatim verified via `aip-dev/google.aip.dev`); RFC 9457 / 9700 / 8725 / 7232..7240 / HAL / Siren / OData / OWASP cheats = secondary-source — re-verify at implementation time.

---

## Priority Tiers (implementation-order, all included)

### P1 — Konkurrenz-Pari-Pflicht (Reputations-load-bearing)

> Patterns that mature linters (Vacuum, Redocly, IBM, OWASP-Spectral, Zalando-Zally, Microsoft, Google) catch and apiq must catch too. Missing any of these = trust-kaputt at first pari-test. Implement first.

| Pattern-ID | Source | Lens | Cost | Frequency | Notes |
|---|---|---|---|---|---|
| Y-2 | OWASP API2 | 1 | S | L | API-keys in URL — error |
| Y-3 / RFC2-56 | OWASP API2 + RFC 6750 | 1, 2 | S | L | Credentials in URL — error |
| Y-4 / RFC2-43 | OWASP + RFC 7617 | 1, 2 | S | L | HTTP-Basic on non-HTTPS — error |
| Y-5 / RFC2-62 | RFC 6749 §3.1 (verbatim "MUST utilize TLS") | 1, 2 | S | M | OAuth2 *Url HTTPS-only — error |
| Y-7 / RFC2-60/61 | RFC 9700 BCP-240 (2025, verbatim "MUST NOT") | 1, 2, 3 | S | M | OAuth2 implicit/password — **error (severity-upgrade Round-2)** |
| Y-17 | OWASP API8 + multi | 1 | S | H | Server URLs HTTPS-only — warn |
| Y-23 | OWASP API2/5 | 1, 2 | S | H | Write-ops protected by security — warn |
| TM-A6 | RFC 6749 + APIMatic | 1, 2 | S | L | OpenIdConnect openIdConnectUrl HTTPS-only |
| TM-A10 | OWASP API2 + RFC 6750 §2.3 | 1, 2 | S | L | Tokens in path/query forbidden — error |
| TM-A11 | OWASP API3 mass-assignment | 1 | S | M | Privilege-escalation field-names in request — apiq-config-driven |
| TM-A15 | OWASP API3 + Cloudflare + #2190 | 1, 6 | M | H | PII-named-fields response — **high-value cornerstone** |
| TM-A17 | OWASP API3 | 1 | S | H | additionalProperties:true on request-body |
| TM-A22 | OWASP API4 + 42Crunch + Stripe | 1 | M | M | List-endpoint without limit/per_page — warn |
| TM-A23 | OWASP API4 | 1 | S | M | Pagination param MUST have maximum — error |
| TM-A24 | OWASP API4 + OAS multipart | 1 | S | L | File-upload binary MUST declare maxLength — error |
| TM-A32 | OWASP API6 sensitive-business-flow | 1 | M | L | Purchase/booking flow MUST have rate-limit headers — error |
| TM-A34 | OWASP API7 + SSRF cheat | 1, 2 | S | M | URL-handling property MUST format:uri+pattern — error |
| TM-A38 | OWASP API8 + CORS-Misconfig | 1, 2 | S | L | CORS Allow-Origin: * literal — error |
| TM-A39 | OWASP CORS WSTG | 1, 2 | S | L | Allow-Credentials:true + Allow-Origin:* impossible — error |
| TM-A42 | OWASP API8 verbose-error | 1 | S | M | Error-schema with stack/trace/exception field — warn |
| TM-A44 | OWASP API8/9 | 1 | S | L | /debug, /_debug, /test paths — error |
| TM-A50 | GitHub + Stripe webhook docs | 1, 2 | M | M | **Webhook MUST declare signature-header** — sleeper-killer rule |
| TM-A53 / RFC2-40 | RFC 9110 §11.6.1 (verbatim "MUST send WWW-Authenticate") | 1, 2 | S | M | 401 → WWW-Authenticate (severity-upgrade hint→error) |
| RFC2-7 | RFC 9110 §4.1 | 2 | S | M | HTTP method tokens uppercase |
| RFC2-8 | RFC 9110 §9.3.1 | 2, 4 | S | M | GET/HEAD/OPTIONS/TRACE/DELETE no body |
| RFC2-12 | RFC 9110 §5 + Microsoft | 2, 4 | S | M | Standard headers MUST NOT be redeclared as parameters |
| RFC2-14 | RFC 9110 §15.5.6 (verbatim "MUST generate Allow header") | 2 | S | L | 405 → Allow header REQUIRED (http-protocol-pairings module) |
| RFC2-16 | RFC 9110 + IANA registry | 2 | S | M | Status codes MUST be IANA-registered |
| RFC2-66 | RFC 3986 §3.3 | 2 | S | L | Path segments percent-encoded |
| RFC2-68 | RFC 3986 §3.4 | 2 | S | L | Path MUST NOT contain `?` |
| RFC2-78 | OAS interpretive + RFC 6838 | 2 | S | L | `*/*` content-type forbidden |
| RFC2-82 | RFC 8259 §4 | 2 | S | L | properties keys unique within schema |
| RFC2-84 | OAS 3.0 + JSON-Schema 2020-12 binding | 2, 3 | M | M | OAS 3.0 + 2020-12-only-keywords = error (json-schema-draft-version-detector) |
| RFC2-94 / C9 / EV-49 | RFC 9110 §10.2.3 + RFC 6585 + draft-ratelimit (cross-source verbatim "MUST send Retry-After") | 1, 2, 3, 7, 10 | S | M | 429 → Retry-After OR RateLimit-* — **severity-upgrade warn→error** |
| RFC2-102 | RFC 6648 §3 | 2, 4 | S | M | X- prefix forbidden |
| EV-1 | OASDIFF + OAS-3.3 + RFC 8594 + 6+ sources | 3, 4 | S | M | deprecated:true without sunset/replacement |
| EV-4 / CL-31 | OASDIFF + multi-source | 3, 4 | S | M | Bare-array request/response body |
| EV-5 / M8-uplift | OASDIFF + Microsoft + Zalando | 3, 4, 1 | S | H | additionalProperties not declared on response |
| EV-8 | OPTIC + OASDIFF + Spectral | 3, 4 | S | M | Operation lacks operationId |
| EV-10 / H1 | SG-6 + Zalando + Stripe + GH-API + MS-AZ | 3 | S | L | Mixed URL+Header versioning |
| EV-23 | OASDIFF schema-tightening | 3, 1 | S | H | Request prop maxLength/maxItems/maximum/pattern absent |
| EV-24 | MIN-2 IBM + OASDIFF | 3, 2 | S | M | Request pattern without ^…$ anchors |
| EV-25 | SP-G-OWASP-21 + Zalando + OASDIFF | 3, 2, 4 | S | H | type:integer without format:int32/int64 |
| EV-27 | SP-G-AYWH-14 + SG-5 + SPS | 3, 5 | S | L | Path-segment file-extension — error |
| EV-28 | SP-G-SPS-10 | 3, 1 | S | L | Server URL contains environment name — error |
| EV-31 | SP-G-SPS-1 | 3, 2 | S | L | Custom HTTP method without RFC reference — error |
| EV-32 | Azure + SPS + IBM + SG-46 | 3, 2 | S | M | Authorization/Content-Type/Accept as explicit param |
| EV-34 | SP-G-TD-3 + Red-Hat | 3 | S | L | Spec uses Swagger-2 — error |
| EV-35 / A-MIN-4 | MIN-6 IBM | 3, 2 | S | L | Two adjacent path-template-segments no separator |
| EV-36 / A-MIN-5 | MIN-7 Vacuum + Redocly | 3, 2 | S | L | Two paths same structural template |
| EV-37 | OAS-3-MUST | 3 | S | L | info.version not present — error |
| EV-40 / O2 | Redocly + IBM + MIN-50 + apiq | 3, 4 | S | L | Schema-name reuse case-insensitive |
| EV-43 | SP-G-TD-3 + pb33f | 3, 2 | S | L | swagger:2.0 artifacts + openapi:3.x — error |
| EV-57 / A3 | apiq existing | 3, 5 | S | L | required declares fields not in properties |
| CL-1 | openapi-generator multi-issue | 4, 3 | M | M | **Multi-lang reserved-keyword allowlist** (load-bearing) |
| CL-2 | swagger-codegen #4805 | 4 | S | L | Property-name leading underscore/digit |
| CL-6 | openapi-gen + multi | 4, 3 | S | M | operationId missing |
| CL-12 | Redocly + multi | 4 | S | M | oneOf without discriminator |
| CL-20 | OAI #3536 | 4, 2 | S | L | 204 declared with content (RFC violation) |
| CL-26 / A-MIN-1 | MIN-2 IBM + Speakeasy | 4, 1 | S | M | pattern without ^/$ anchors |
| CL-31 | openapi-gen #17877 | 4 | S | L | Bare-array request body |
| CL-33 / A-MIN-9 | MIN-11 Vacuum + openapi-gen | 4 | S | M | schema without type |
| CL-36 / M-MIN-2 | MIN-48 Redocly | 4 | S | L | example with value AND externalValue — error |
| CL-37 / A-SP-3 | MIN-47 IBM + MIN-49 Redocly | 4 | S | L | Component naming spaces/special chars |
| CL-40 / S-SP-7 | SP-G-SPS-17 | 4 | S | L | Path with `?` query in path-template |
| CL-45 / W10 | Speakeasy + Postman + Lens-4 | 4 | M | M | Pagination mixed conventions cross-spec |
| CL-46 / D2 | Speakeasy errors + Postman | 4 | M | M | Inconsistent error-shape cross-endpoint |
| CL-50 / S-SP-6 | SG-5 + SP-G-SPS-13 | 4, 2 | S | L | Path-segments file-extensions — error |
| CL-55 / M12 | SG-37 + Speakeasy + Zalando | 4 | S | M | Uppercase mixed lowercase enum-values |
| CL-57 | spectral default | 4, syntax | S | L | enum with duplicate values — error |
| CL-58 / A-MIN-5 | MIN-7 + MIN-8 Vacuum | 4 | S | L | Duplicate paths case-insensitive |
| CL-59 / G-SP-8 | SP-G-SD-5 | 4 | S | L | operationId not URL-friendly |
| CL-63 / R-SP-1 | spectral + Speakeasy | 4 | S | M | Operations missing summary AND description |
| CL-66 / A4-A5 | OAS + swagger-ui #9832 | 4, syntax | S | L | Discriminator mapping references missing schemas |
| CL-68 / A-MIN-4 | MIN-6 IBM | 4, syntax | S | L | Path consecutive parameters no separator |
| CL-69 / M-MIN-3 | spectral + AJV-layer | 4 | M | M | example value violates schema |
| CL-70 | apiq + multi | 4 | M | M | default value violates schema |
| CL-73 / P-SP-1 | SP-G-SD-4 | 4 | S | L | servers[].url placeholder example.com/localhost |
| CL-76 / A-MIN-6 | MIN-8 Vacuum | 4, syntax | S | L | Same path+method declared multiple times |
| CL-81 | OAS A1 + apiq existing | 4, syntax | S | L | $ref siblings in same object (3.0 violation) |
| SC-5 / E4 | JSON:API + OData + Microsoft + AIP | 4, 5 | M | M | Envelope-style coherence cross-list |
| SC-6 / S7 | AIP-122 + Zalando + JSON:API + REST | 4, 5 | M | H | Resource-name pluralization coherence — **severity-upgrade hint→warn** |
| SC-8 / E2/E3 | AIP-158 + JSON:API + OData + Zalando | 4, 5 | M | M | Pagination-shape coherence (formal classifier) |
| SC-9 / K1/K4 | RFC 7807 + JSON:API + Heroku + Zalando | 2, 4, 5 | M | M | Error-shape coherence cross-spec |
| L10-1 | RFC 7231 + draft + apiq C9 | 10, 7, 1 | S | M | 429 declared without ANY rate-limit signaling |
| RFC2-5 | RFC 9457 §4 | 2, 8 | M | L | **apiq-USP candidate** — Problem-class type-URI uniqueness cross-spec (problem-json-validator module) |

**P1 total: ~95 patterns. Estimated implementation cost: ~50 S + ~25 M + ~20 L (mostly in Modules-A/B/C).** Fits within first 3-4 weeks of Wave 2.

---

### P2 — Differentiator-Patterns (apiq-USP)

> Patterns that mature linters DON'T catch — apiq's competitive moat. Lens-3 + Lens-5-classifier + Lens-8-cross-response + Lens-9 patterns plus single-source severity-elevations.

| Pattern-ID | Source | Lens | Why-USP | Cost | Frequency |
|---|---|---|---|---|---|
| RFC2-5 | RFC 9457 §4 | 2, 8 | No linter ships cross-class type-URI uniqueness | M | L (also P1; cross-listed) |
| Y-1 / TM-A1 | OWASP API1 | 1, 4 | UUID-format on path-params not in mature linters | S | H |
| Y-8 | RFC 8725 + OWASP JWT | 1, 2 | RFC 8725-mention in description heuristic | S | M |
| Y-10 / TM-A17 | OWASP API3 | 1, 3 | Per-schema additionalProperties + request-body-narrower variant | S | H |
| Y-12, Y-13, Y-14 | OWASP API4 + 42Crunch | 1 | Schema-bounds enforcement bundle | S | H |
| Y-15 / TM-A34 | OWASP API7 | 1, 2 | URL-handling-params SSRF flag | S | M |
| Y-19 | OWASP API8 | 1, 3 | Path no environment-names | S | M |
| Y-21 | Codegen-multi | 1, 4 | Property names no programming-keywords | M | M |
| TM-A2 | OWASP API1 | 1, 2 | Object-id-write-op SHOULD have security (sharper than Y-23) | S | H |
| TM-A5 | OWASP JWT + RFC 8725 | 1, 2 | Bearer+JWT description SHOULD mention RFC 8725 | S | M |
| TM-A7 | RFC 9700 BCP-240 | 1, 2 | OAuth2 authorizationCode SHOULD declare PKCE | S | M |
| TM-A9 | OWASP API2 + Auth-cheat | 1, 4 | Login-endpoint password-field + missing rate-limit (compound) | M | L |
| TM-A12 | OAS + OWASP API3 | 1, 2 | password/secret request-body SHOULD writeOnly | S | H |
| TM-A13 | OAS + OWASP API3 | 1, 2, 4 | id/created_at response SHOULD readOnly | S | H |
| TM-A14 | OWASP API3 + 42Crunch | 1, 4 | Same schema reused req+resp without RO/WO | M | M |
| TM-A18 | OWASP API4 + IBM-LI81715 | 1, 4 | Recursive schema SHOULD declare max-depth | M | M |
| TM-A28 | OWASP API5 | 1 | "admin"/"internal" in description without security | S | M |
| TM-A35 | OWASP API7 | 1 | URL-handling without scheme-allowlist | S | M |
| TM-A36 | OWASP API7/10 | 1, 2 | Upstream-URL operation MUST declare 4xx/5xx | M | L |
| TM-A45 | OWASP API9 | 1, 3 | Multi-version servers without one deprecated | M | L |
| TM-A46 | OWASP API9 + RFC 8594 | 1, 3 | deprecated:true SHOULD have sunset+replacement | S | M |
| TM-A47 | OWASP API9 | 1, 3 | info.version differs from server URL version-prefix | S | M |
| RFC2-1 | RFC 9457 §3.1 | 2, 4 | problem+json schema MUST have type, SHOULD have title/status (DM-4 module) | M | M |
| RFC2-2 | RFC 9457 §3.1.1 | 2 | problem-details type MUST be URI | S | M |
| RFC2-3 | RFC 9457 §3.1.2 | 2, 8 | problem-details status matches HTTP status (cross-response) | M | L |
| RFC2-11 | RFC 9110 §5.1 | 4 | Header names canonical Title-Case (Walker) | M | H |
| RFC2-20 | RFC 9110 §13.1.1 | 2 | If-Match → 412 (http-protocol-pairings) | M | L |
| RFC2-21 | RFC 9110 §13.1.2 | 2 | If-None-Match GET → 304 | M | L |
| RFC2-22 | RFC 9110 §13.1.2 | 2 | If-None-Match PUT/PATCH/DELETE → 412 | S | L |
| RFC2-25 | RFC 9110 §15.4.5 | 2, 7 | 304 → ETag/Last-Modified/conditional-param | M | L |
| RFC2-26 | RFC 9110 §15.5.13 | 2, 7 | 412 → conditional param | S | L |
| RFC2-32 | RFC 9110 §15.3.7 (verbatim "MUST generate Content-Range") | 2 | 206 → Content-Range REQUIRED | S | L |
| RFC2-58 | RFC 8725 §3.1/§3.2 | 1 | bearerFormat:JWT description mention RFC 8725 | S | M |
| RFC2-59 | RFC 6750 §3 | 2 | Bearer 401 → WWW-Authenticate Bearer realm | S | L |
| RFC2-65 | RFC 6749 §3.3 + OAS | 2, 4 | OAuth2 scopes MUST have descriptions | S | M |
| RFC2-69 | RFC 3986 §3.5 | 2 | Path MUST NOT contain `#` — error | S | L |
| RFC2-70 | RFC 6570 + OAS | 2 | OAS path-template = RFC 6570 Level-1 only | S | L |
| RFC2-74 | RFC 3986 §3.2.1 | 1, 4 | Server-URL userinfo (user:pass) forbidden — error | S | L |
| RFC2-97 | RFC 7396 + 6902 | 2, 4 | PATCH MUST declare merge-patch+json OR json-patch+json | S | L |
| EV-3 | Zalando + Speakeasy + OASDIFF | 3, 4 | Closed enum without extensibility hook | S | M |
| EV-6 / M14 | OASDIFF + Bump.sh | 3, 4 | oneOf without discriminator(+mapping) | S | M |
| EV-7 | IBM + OASDIFF + Stripe | 3, 5 | Default value on required field | S | M |
| EV-11 / K2 | SG-16 + RFC 7807 + OPTIC | 2, 3, 4 | No spec-wide error-shape declared | M | M |
| EV-14 / L2 | SP-G-AZ-9 + IBM | 3, 5 | requestBody.required not explicit | S | M |
| EV-16 / C7 | SP-G-OWASP-28 + Azure + Zalando | 3, 4 | 5xx/default response missing | S | M |
| EV-17 / Q1 | SG-41 + spectral:oas | 3, 4 | Endpoint without tags | S | H |
| EV-18 | OWASP + Stripe + MS-AZ | 3, 1 | additionalProperties:true on request without explicit allow-list | S | H |
| EV-19 / F3 | OASDIFF + apiq | 3, 1 | securitySchemes declared but unused on ops | M | M |
| EV-30 / B-SP-4 | SP-G-AYWH-10 + SPS + OPTIC | 3, 5 | requestBody without application/json media-type | S | M |
| EV-33 | JSON-Schema-evolution + Speakeasy | 3, 5 | nullable:true AND required:true | S | M |
| EV-46 / M-SP-3 | SP-G-AZ-24 + OASDIFF | 3, 4 | readOnly in request OR writeOnly in response | S | M |
| EV-48 / L-SP-2 | SP-G-TD-4 + Azure + IBM | 3, 2 | PATCH accepts application/json (not patch-types) | S | L |
| EV-50 / C10 | RFC 7232 / 9110 + apiq | 3, 2 | 304 declared without conditional infrastructure | S | L |
| EV-53 / H3 | Adidas + Speakeasy + G-URL-1 | 3, 5 | URL-version /v1/ vs info.version 2.x drift | S | L |
| EV-55 / T2 | Azure + IBM + OASDIFF | 3 | Required parameter shows default | S | M |
| EV-56 / P-SP-5 | SP-Redocly | 3, 5 | servers array missing/empty | S | L |
| CL-4 | multi-codegen + Speakeasy | 4 | Inline-Object schemas without title | S | H |
| CL-5 | Speakeasy + SDK-vendor | 4 | operationId verbose / FastAPI-style | S | M |
| CL-7 | openapi-generator #14765 + Speakeasy | 4, 3 | required + nullable without 3-state semantics | S | M |
| CL-9 | openapi-gen + oapi-codegen | 4 | Same-status-code multiple content-types | S | M |
| CL-13 | openapi-gen #9444 + Redocly | 4 | discriminator.propertyName not in required | S | L |
| CL-15 | OAI + Speakeasy + openapi-gen | 4, 3 | int64 integer without format declared | S | M |
| CL-17 | openapi-gen + python-client + utoipa | 4, 3 | Recursive schema without termination | M | L |
| CL-18 | pb33f | 4 | Recursive cycle on required field | M | L |
| CL-21 / A7 | openapi-gen multi | 4 | format not in IANA-format-registry | S | M |
| CL-22 / M-SP-13 | openapi-gen + Apicurio | 4 | type:object without properties+additionalProperties | S | M |
| CL-24 / A-MIN-16 | openapi-gen #18207 | 4 | Multiple-types in 3.1 unconstrained | S | L |
| CL-25 / A6 | ReDoc + openapi-python-client | 4 | pattern Regex unsupported by ECMA/Java/Python | M | M |
| CL-29 / M4 | swagger-ui + redoc multi | 4 | Deeply-nested inline objects (>3-4 levels) | M | M |
| CL-35 | openapi-python-client | 4 | Schema named Client/API/Response/Request | S | L |
| CL-48 / M7 near-dup | Lens-4 + Stripe | 4 | Multiple similar-not-identical schemas | M | M |
| CL-54 / F | Speakeasy SDK | 4, 3 | securitySchemes mixed types globally | M | M |
| CL-56 | openapi-typescript #1874 | 4 | Enum values not valid identifier-chars | S | M |
| CL-64 / B8 | R-SP-5 + apiq B8 | 4 | operationId verb-prefix vs HTTP-method | S | M |
| CL-77 / A12 | openapi-gen #9756 | 4 | Heavy allOf with multi non-$ref objects | M | M |
| SC-13 | OData v4.01 | 5 | OData conformance — enterprise-pillar | M | L |
| SC-14 | HAL + JSON:API + Siren | 4, 5 | Style-marker leakage (mixed envelopes) | M | L |
| SC-24 / DM-9/10 | AIP-133 + Microsoft + IBM | 4, 5 | Asymmetric resource-shape POST vs GET | M | M |
| SCF-1 | JSON:API v1.1 (verbatim "MUST NOT") | 2, 5 | JSON:API data/errors mutually exclusive | M | L |
| SCF-10 | HAL spec | 2, 5 | HAL response has _links | S | L |
| L6-1 | OWASP API3 | 6, 1 | PII-named field on path/query params | S | M |
| L6-4 | TruffleHog/Gitleaks | 6, 1 | Default-values containing PII patterns (secret-scanner module) | M | L |
| L9-1 / W4 | Postman 2025 + Speakeasy + Fern | 9, 4 | Examples-coverage on operations (Walker strengthened) | M | M |
| F-7 | OpenAI + GitHub + Stripe + draft | 7, 10 | RateLimit-* headers when 429 declared | S | M |
| F-11 | DOLAR | 4, 5 | Linguistic Amorphous URI | S | M |
| F-14 | DOLAR | 5 | Linguistic Pluralised Nodes (sing/plur on same resource) | M | M |
| F-17 / SC-3 | Bloch + Qt + SC-3 | 4, 5 | POLA — summary doesn't contradict HTTP method | S | M |
| L10-2 | cross-industry | 10, 4, 8 | Some ops have rate-limit headers, others don't | M | M |
| L10-3 | OWASP API9 + EV-1 | 10, 3 | deprecated ops without sunset/Sunset header | S | L |

**P2 total: ~60 patterns. Estimated cost: ~35 S + ~20 M + ~5 L. Wave 2 weeks 4-7.**

---

### P3 — Defense-in-Depth + Nice-to-Have

> Generic patterns that apiq covers as additional value beyond competitors. Most are `hint`-severity, off-by-default-overridable, or low-frequency-but-real-when-it-fires.

| Pattern-ID | Source | Lens | Cost | Frequency |
|---|---|---|---|---|
| Y-6 | RFC 9700 §4.1.5 (BCP) | 1, 3 | S | M |
| Y-9 | OWASP API2 | 1 | S | L |
| Y-11 | OAS 3.1 | 1 | S | M |
| Y-16 | OWASP API8 | 1 | S | L |
| Y-18 | OWASP API3 | 1 | S | M |
| Y-20 | SPS | 1 | S | L |
| Y-22 | OWASP API5 | 1 | M | L |
| Y-24 | OWASP API1/5 | 1 | S | M |
| Y-25 / RFC2-90 | draft-ietf-httpapi | 1, 2 | S | L |
| TM-A3 | OWASP API1 | 1 | M | L |
| TM-A4 | OWASP API1 | 1 | S | M |
| TM-A8 | OWASP API2 | 1, 4 | M | L |
| TM-A16 | OWASP + OAS | 1 | S | H |
| TM-A19 | OWASP API4 + 42Crunch | 1, 4 | M | M |
| TM-A20 | OWASP API4 | 1 | S | M |
| TM-A21 | OWASP API4 + 42Crunch | 1 | S | M |
| TM-A25 | OWASP API4 | 1, 4 | M | L |
| TM-A26 | OWASP API4 + 42Crunch | 1 | S | L |
| TM-A27 | OWASP API5 + Spectral-OWASP | 1 | M | L |
| TM-A29 | OWASP API5 | 1, 4 | M | M |
| TM-A30 | OWASP API5 | 1 | S | L |
| TM-A31 | OWASP API6 | 1 | M | L |
| TM-A33 | OWASP API6 | 1 | M | L |
| TM-A37 | OWASP API7 | 1 | S | L |
| TM-A40 | OWASP CORS-Misconfig | 1 | M | L |
| TM-A41 | OWASP HTTP-Headers | 1, 2 | M | L |
| TM-A43 | OWASP API8 | 1 | S | L |
| TM-A48 | OWASP API9 | 1 | S | H |
| TM-A49 | OWASP API10 | 1, 2 | M | L |
| TM-A51 | OWASP API10 + GitHub | 1, 2 | S | L |
| TM-A52 | OWASP REST cheat | 1, 2 | M | L |
| RFC2-4 | RFC 9457 §3.2 | 2 | S | L |
| RFC2-13 | RFC 9110 §6.2 | 2 | S | L |
| RFC2-15 | RFC 9110 §15.5.16 (verbatim) | 2 | S | L |
| RFC2-17 | OAS-3 | 2 | S | L |
| RFC2-18 | RFC 9110 §8.6 | hyg | S | L |
| RFC2-19 | RFC 9110 §6.6.1 | hyg | S | L |
| RFC2-23 | RFC 9110 §13.1.3 | 2 | S | L |
| RFC2-24 | RFC 9110 §13.1.4 | 2 | S | L |
| RFC2-27 | RFC 9110 §8.8.3 | 2 | S | L |
| RFC2-28 | RFC 9110 + Lens-8 | 2, 8 | M | L |
| RFC2-29 | RFC 9110 + Microsoft | 2, 4 | M | L |
| RFC2-30 / RFC2-31 / RFC2-33 / RFC2-34 | RFC 9110 §14 + Heroku | 2 | S | L |
| RFC2-35 / RFC2-36 / RFC2-37 / RFC2-38 / RFC2-39 | RFC 9111 §5 | 2, 7, 8 | S | M |
| RFC2-41 | RFC 9110 §11.6.4 (verbatim) | 2 | S | L |
| RFC2-42 | RFC 9110 + IANA | 2 | S | L |
| RFC2-44 | RFC 7616 | 1, 3 | S | L |
| RFC2-46 | RFC 7240 §3 | 2 | S | L |
| RFC2-47 | RFC 7240 §4 + IANA | 2 | S | L |
| RFC2-48 | RFC 7240 §4.1 | 2 | S | L |
| RFC2-50 | RFC 9651 §3 | 2 | M | L |
| RFC2-52 / RFC2-53 / RFC2-54 / RFC2-55 | RFC 8288 §2/§3 | 2, hyg | S | L |
| RFC2-57 / F6 | RFC 6750 + OAS | 4 | S | M |
| RFC2-63 | RFC 9700 §4.1.5 | 1, 3 | S | M |
| RFC2-64 | RFC 9700 §2.1 | 1 | S | L |
| RFC2-67 | RFC 3986 §3.3 | 2 | S | L |
| RFC2-81 / SG-24 | RFC 8259 §6 | 2, 4 | S | M |
| RFC2-85 | OAS 3.1 §4.7.1 | 2 | S | L |
| RFC2-86 | JSON-Schema 2019-09 | 3, 2 | S | L |
| RFC2-87 | JSON-Schema draft-06 | 3 | S | L |
| RFC2-88 / X4 | JSON-Schema 2019-09+ | 3, 2 | S | L |
| RFC2-91 / H4 strengthen | draft + RFC 8594 | 3, 2 | S | L |
| RFC2-92 | RFC 8594 §2 | 2 | S | L |
| RFC2-93 / W6 | draft-httpapi-ratelimit | 2 | S | L |
| RFC2-98 / B-MIN-3 | RFC 7396 §2 | 2 | S | L |
| RFC2-99 | RFC 6902 §3 | 2 | S | L |
| RFC2-100 / RFC2-101 | RFC 7578 + OAS | 2 | S | L |
| EV-2 | OASDIFF inverted + Stripe | 3 | S | L |
| EV-9 / H2 strengthen | Stripe + GH-API + MS-AZ | 3 | S | M |
| EV-12 | G-URL-2 + Speakeasy | 3 | S | L |
| EV-13 | SG-25 + Stripe + GH-API | 3 | S | M |
| EV-15 | OASDIFF inverted | 3, 4 | M | M |
| EV-20 | OASDIFF | 3, 5 | S | H |
| EV-21 | SG-2 + VTex | 3, 4 | M | H |
| EV-22 / A2 | apiq + JSON-Schema | 3, 1 | M | L |
| EV-26 | SG-2 + apiq stub | 3, 5 | S | L |
| EV-29 / W-MIN-2 | Zalando + others (opinion-divided) | 3, 5 | M | M |
| EV-38 / G-SP-7 | SP-G-SPS-3 + SG-11 | 3, 5 | S | L |
| EV-39 | JSON-Schema + OASDIFF | 3, 5 | S | L |
| EV-41 | apiq prose-walker | 3, 4 | S | L |
| EV-42 | Microsoft + Google AIPs | 3, 4 | S | L |
| EV-44 / M6 | apiq existing | 3, 4 | M | M |
| EV-45 | OASDIFF + OPTIC | 3, 5 | M | L |
| EV-47 | Azure + OPTIC | 3, 5 | S | L |
| EV-51 / M13 | LL-13 + apiq M13 | 3, 5 | S | M |
| EV-52 / J-SG-2 | SG-24 + AIP + Zalando #168 | 3, 2, 4 | S | M |
| EV-54 | apiq existing | 3 | S | L |
| EV-59 | SP-G-SPS-15 inverse + RFC 9110 | 3, 2 | S | L |
| EV-60 / U1 | SP-G-SPS-21 + apiq U | 3, 4 | S | L |
| EV-61 | apiq prose-walker | 3, 4 | S | L |
| EV-62 | SG-24 + Stripe + AIPs | 3, 4 | S | M |
| CL-3 | openapi-generator #17909 | 4 | M | L |
| CL-8 | Speakeasy + openapi-gen | 4 | M | M |
| CL-10 | oapi-codegen #1897 | 4 | S | L |
| CL-14 | openapi-generator #9444 | 4 | S | L |
| CL-16 | OAI + Speakeasy + Stripe | 4 | S | M |
| CL-19 | openapi-typescript | 4 | S | L |
| CL-23 | openapi-gen #796 | 4 | S | M |
| CL-27 | openapi-typescript #408 | 4 | M | L |
| CL-28 | openapi-python-client #1271 | 4 | S | L |
| CL-30 | swagger-ui #7437 | 4 | M | L |
| CL-32 / D-MIN-5 | MIN-32 IBM + stoplight #1418 | 4 | S | L |
| CL-34 | openapi-python-client #1045 | 4 | S | L |
| CL-38 | openapi-gen + oapi-codegen | 4 | S | L |
| CL-39 / HTML-Walker | OAS + swagger-editor #2180 | 4 | S | M |
| CL-41 / CL-42 | openapi-gen + oapi-codegen | 4, 3 | S | L |
| CL-43 | MIN-46 IBM | 4 | S | L |
| CL-44 | Speakeasy | 4 | S | M |
| CL-47 / D-MIN-3 | MIN-35 IBM | 4 | M | M |
| CL-51 / R-MIN-1 | MIN-27 IBM | 4 | S | M |
| CL-52 / M-SP-17 | MIN-IBM | 4 | M | L |
| CL-53 / R3 | Speakeasy + Postman | 4 | S | L |
| CL-61 | Speakeasy + OAI | 4, 3 | M | L |
| CL-62 / Q5 | Lens-4 + Postman | 4 | M | M |
| CL-65 | openapi-gen multi | 4 | S | L |
| CL-67 / A13 | apiq A13 | 4 | S | L |
| CL-72 | swagger-ui + openapi-gen | 4 | S | L |
| CL-74 / U | Lens-4 + Twilio | 4, 1 | S | L |
| CL-75 / G7 + Q-SP-5 | MIN Q-SP-5 | 4 | M | M |
| CL-78 | Speakeasy | 4 | S | L |
| CL-79 | openapi-gen #4908 | 4 | S | L |
| CL-80 / M-SP-3 mirrors | M-SP-3 mirrors | 4, 3 | S | M |
| SC-1 | Microsoft + AIP-121 + Richardson | 4, 5 | M | M |
| SC-2 | AIP-136 + Microsoft | 4, 5 | S | L |
| SC-3 | Fielding + Microsoft + AIP | 4, 5 | S | M |
| SC-4 | HAL + JSON:API + Siren + Fielding | 4, 5 | M | L |
| SC-7 | AIP-122 + Microsoft | 4, 5 | M | L |
| SC-12 | Siren spec | 2, 5 | S | L |
| SC-15 / §5 | AIP-121 + REST | 4, 5 | M | M |
| SC-16 | Microsoft + AIP-136 | 4, 5 | S | L |
| SC-17 | Richardson + AIP | 5 | M | M |
| SC-18 | JSON:API + AIP-140 | 4, 5 | M | M |
| SC-19 / I4 extend | AIP-142 + Rails/Stripe + Microsoft | 4, 5 | S | M |
| SC-21 | All hypermedia specs | 4, 5 | S | L |
| SC-22 / SC-23 | AIP-160 + JSON:API + OData | 4, 5 | M | L |
| SC-25 | RFC 7231 + Microsoft + AIP | 2, 5 | M | M |
| SCF-2..6 | JSON:API v1.1 | 2, 5 | S | L |
| SCF-7 / SCF-8 | HAL spec | 2, 5 | S | L |
| SCF-9 / SCF-10 | Siren spec | 2, 5 | S | L |
| SCF-11 | OData v4.01 | 5 | S | L |
| SCF-12 | OData v4.01 | 5 | S | L |
| SCF-13 / SCF-14 / SCF-15 / SCF-17 | Google AIPs | 5 | S | L |
| L6-3 | HIPAA-relevance heuristic | 6 | S | L |
| L7-1 | RFC 9111 + cross-industry | 7, 4 | M | M |
| L9-2 | Postman 2025 + agentic-patterns | 9, 4 | M | M |
| L9-3 | Postman 2025 + Speakeasy | 9, 4 | M | M |
| L9-4 | Postman 2025 | 9, 4 | S | L |
| L9-5 | Speakeasy + LLM-friendly-API | 9, 4 | S | M |
| L9-6 | LLM-friendly-API + Speakeasy | 9, 4 | S | M |
| L9-8 | OpenAI function-calling + MCP | 9 | S | M |
| L10-4 / F-9 | FAIR + Pautasso | 10, 4, 9 | S | M |
| L10-5 / F-8 | FAIR + Postman | 10, 4, 9 | S | H |
| L10-6 / F-8 | FAIR + Postman | 10, 4, 9 | S | H |
| F-2 | i18n | 2, 4 | M | L |
| F-3 / I4 strengthen | i18n + RFC 3339 | 2, 4 | S | M |
| F-5 | TM Forum + Stripe + GitHub | 4, 5 | M | L |
| F-12 | DOLAR | 4, 5 | S | L |
| F-13 | DOLAR | 5 | M | M |
| F-15 | TM Forum + JSON:API + Schema.org | 5 | M | L |
| F-19 | API Docs Smells arXiv | 4 | S | M |
| F-20 / RFC2-57 re-tag | RFC 7519 + FAPI | 1, 2 | S | M |

**P3 total: ~110 patterns. Estimated cost: ~75 S + ~30 M + ~5 L. Wave 2 weeks 7-10 + Wave 3 trail.**

---

### P4 — Niche / Low-Frequency

| Pattern-ID | Source | Lens | Cost | Frequency | Notes |
|---|---|---|---|---|---|
| RFC2-71, RFC2-72, RFC2-73 | RFC 3986 §3 | hyg, 2 | S | M-L | Server-URL host/scheme/path lowercase + normalization |
| RFC2-75, RFC2-76 | RFC 6838 | 2 | S | L | Custom JSON / vendor media-types |
| RFC2-79 | RFC 6838 + IANA | 2 | S | L | Top-level media-type IANA-registered |
| RFC2-80 | RFC 8259 §8.1 | hyg | S | L | charset on application/json redundant |
| RFC2-95 | RFC 9110 §10.2.3 | 2 | S | L | Retry-After grammar |
| RFC2-96 | RFC 9110 §15.6.4 | 2 | S | L | 503 → Retry-After SHOULD |

**P4 total: ~15 patterns. Estimated cost: ~13 S. Wave 2 trailing tickets.**

---

### P5 — Vendor-Extension / Information-only / Niche

| Pattern-ID | Source | Lens | Cost | Frequency | Notes |
|---|---|---|---|---|---|
| RFC2-50 | RFC 9651 §3 | 2 | M | L | SFV custom-header validation (defer to v2 mining) |
| RFC2-77 | RFC 6838 §3.3 | hyg | S | L | prs. tree in production = smell |
| RFC2-83 | RFC 8259 §2 | 2 | S | L | default/example as JSON-string parses strict |
| RFC2-89 | JSON-Schema draft-07 | 2, 3 | S | L | contentEncoding/contentMediaType in 3.0 |
| RFC2-103 / RFC2-105 | RFC 6585 | 2 | S | L | 428 + 511 status awareness |
| CL-60 | OpenAPI + Speakeasy + Stripe | 4, 3 | S | L | x-internal usage info-finding |
| L6-2 | Cloudflare + OAI #2190 | 6 | S | L | Vendor-extension PII-tag (positive marker) |
| L9-7 / F-16 | FHIR + MCP | 9, 10 | S | L | Capability-discovery endpoint (positive marker) |
| F-10 | SLA4OAI + MAP | 10 | S | L | SLA4OAI / x-sla extension presence (positive marker) |
| F-18 | API Docs Smells arXiv | 4 | S | L | Doc-smell: Bloated description |
| SC-20 | AIP-148 | 5 | S | L | Standard-field-presence on AIP-style (off-by-default) |

**P5 total: ~11 patterns. Estimated cost: ~10 S. Optional / off-by-default / info-tier.**

---

## Wave 2 Subagent-Briefing-Strategy

Suggested Pattern-Allocation per Wave 2 task (mapping to existing kategorie-tasks T8-T19 in `LAUNCH-PROGRESS.md` if they exist; otherwise free allocation):

| Wave 2 Task | Lens / Module | Pattern-IDs (P1-first) | Effort |
|---|---|---|---|
| **T8 — secret-scanner Module** | Lens 1 + 6 | TM-A* PII-list + L6-4 + Y-A* secret-format-regex | L (~2 days) |
| **T9 — webhook-signature Module** | Lens 1 + 2 | TM-A50 + TM-A51 + CL-74 | M (~1 day) |
| **T10 — http-protocol-pairings Module** | Lens 2 + 7 | RFC2-14, RFC2-15, RFC2-20..29, RFC2-30..32, RFC2-40, RFC2-41, RFC2-46, RFC2-48, RFC2-94, RFC2-96 | L (~2 days) |
| **T11 — problem-json-validator Module (incl. USP RFC2-5)** | Lens 2 + 8 | RFC2-1, RFC2-2, RFC2-3, RFC2-4, RFC2-5, EV-11/K2 | L (~2 days) |
| **T12 — oauth2-flow-validator Module** | Lens 1 + 2 | Y-5/RFC2-62, Y-7/RFC2-60/61, RFC2-63, RFC2-64, RFC2-65, TM-A6, TM-A7 | L (~1.5 days) |
| **T13 — media-type-IANA-validator Module + IANA-snapshot dependency** | Lens 2 | RFC2-75, RFC2-76, RFC2-77, RFC2-79, RFC2-80, RFC2-78 | M (~1 day) |
| **T14 — json-schema-draft-version-detector Module** | Lens 2 + 3 | RFC2-84, RFC2-85, RFC2-86, RFC2-87, RFC2-88, RFC2-89 + apiq X1-X5 | L (~1.5 days) |
| **T15 — Style-classifier + per-style-coherence-checker Modules** | Lens 5 | All SC-1..25 + SCF-1..17 | L (~2-3 days) |
| **T16 — Threat Spectral Rules** | Lens 1 | All Y-* + TM-A* (single-rule shape, not Module) | M (~5 days for 70+ rules in P1+P2) |
| **T17 — Evolution Spectral Rules + Walkers** | Lens 3 | All EV-* (single-rule + 3 Walkers) | M (~3 days) |
| **T18 — Client-Friction Spectral Rules + per-target metadata** | Lens 4 | All CL-* + targets:[] metadata | M (~4 days) |
| **T19 — AI-Agent Walkers (NEW)** | Lens 9 | L9-1..L9-8 (mostly Walkers + heuristics) | M (~2 days) |
| **T20 — Operational-Metadata Walkers (NEW)** | Lens 10 | L10-1..L10-6 + F-7 (positive markers info-tier) | M (~1 day) |
| **T21 — Privacy / Data-Class Walkers (NEW)** | Lens 6 | L6-1..L6-4 + TM-A15 cross-tag re-tag | M (~1 day) |
| **T22 — IANA Registry Snapshot Job** | Cross-cutting | quarterly-refresh CI job + status-codes / methods / headers / link-relations / cache-directives / media-types snapshots | M (~1 day) |
| **T23 — Severity-Schema Final implementation** | Cross-cutting | rule-metadata schema upgrade (4-tier + direction + multi-lens + ISO/IEC 25010 + Stakeholder/Lifecycle/Defect-Class) | M (~1 day) |
| **T24 — Putz-Niveau Benchmark validation** | Cross-cutting | run apiq against 4 reference-specs + verify all 28 Springer-Delphi rules fire OR are explicit-skip-with-rationale | M (~1 day) |
| **T25 — Source-Verification CI job** | Cross-cutting | quarterly gh-api-raw verification of RFC-2119-verbatim wording for all P1 rules with `source-verified-at` timestamp | M (~0.5 day) |

**Total Wave 2 estimate (P1+P2):** ~30 person-days for 2 engineers = ~15 calendar-weeks at 50% capacity. Realistically a 4-6 week sprint with dedicated effort.

**Wave 3 (P3 trail + P4/P5 backfill):** ~15 person-days additional, mostly Spectral DSL rules (single-pattern shape).

---

## Out-of-Scope Documentation (NOT in Wave 2)

These are explicitly NOT implemented in Stage A. Documented for delegate-traceability so users / reviewers understand the boundary.

### Delegated to Phase B (LLM)

| Pattern | Why-LLM-territory | Future-feature-candidate |
|---|---|---|
| RFC2-9 / OOS-1 (Safe methods MUST NOT have side effects) | Semantic intent | LLM Phase B prompt mentions explicitly |
| RFC2-10 / OOS-2 (Idempotent methods MUST be idempotent) | Semantic + runtime | LLM Phase B |
| RFC2-49 (Prefer:return=representation) | Semantic | LLM Phase B |
| RFC2-51 (custom headers SHOULD be SFV when list/dict) | Intent-of-header-value | LLM Phase B |
| CL-11 (anyOf where oneOf intended) | Semantic mutual-exclusivity | LLM Phase B |
| CL-49 (Doc-vs-Schema divergence) | NLP description-vs-schema | LLM Phase B |
| EV-58 (deprecated:true op + active enum) | Semantic contradiction | LLM Phase B |
| All FinTech FDX naming + HealthTech FHIR domain-resources | Domain-knowledge | LLM Phase B (vendor-domain prompts) |
| U-A* (tenant-isolation, admin-by-purpose, sensitive-flow classification, excessive-data-exposure beyond PII heuristic, verbose-error stack-trace in example, response-status semantically-makes-sense, TLS-version-in-description, single-sign-on-hygiene, refresh-token-rotation-strategy, scope-granularity, CORS-origin-reflection) | NLP / semantic / domain | LLM Phase B |
| UNS-* (operation-summary verb contradicts method, Link rel="alternate" semantics, OAuth2 scope-naming-convention) | NLP | LLM Phase B |
| OOS-6 (REST verbs for state changes — soft NLP) | Semantic | LLM Phase B |
| U-SC-2 / U-SC-7 (field-mask AIP, HATEOAS-completeness) | Annotation / semantic | LLM Phase B |

### Out-of-scope (requires runtime / two-spec-diff)

| Pattern | Why-out-of-scope | Future-feature-candidate |
|---|---|---|
| OOS-3..17 (ETag/Last-Modified/Cache-Control/etc. runtime) | Runtime contract | Live-mode validation epic post-launch |
| OOS-CL-1..6 (run codegen tools and capture output) | Runtime tool-invocation | Future opt-in modules |
| OOS-CL-7 / CL-71 (cross-spec-version-diff Octokit-style) | Two-spec | "apiq evolution mode" plug-in (see Phase C §G) |
| OOS-CL-8 (inferring schema from real API responses) | Runtime traffic | Apiq spec-vs-traffic mode |
| OASDIFF OOS-1..20 (all two-spec breaking-change rules) | Requires v1+v2 | Diff-mode epic |
| U-A11 / U-A12 (API-version-set inventory check / dormant endpoint) | Runtime | Apiq workspace-policy mode |
| U-A18 (test/sandbox endpoints in production heuristic) | Heuristic on hostname; off-by-default | Apiq workspace-policy mode |

### Vendor / Org-specific (skip with reasoning)

| Pattern | Why-skip |
|---|---|
| S-A1..S-A14 (MFA-decl / lockout / password-policy / pwned-passwords / device-fp / IP-allowlist / etc.) | Vendor-extension or runtime-only |
| UNS-4 / UNS-5 (apiKey-cookie / x-ms-enum.modelAsString) | Vendor-context |
| UNS-12 (RFC 8941/9651 SFV grammar) | High-effort, low-frequency 2026 — defer to v2 |
| UN-CL-1 (Redocly extensions x-tagGroups / x-logo) | Vendor-specific UX-hint |
| UN-CL-3 (Stripe-style x-resourceId / x-expandableFields) | Vendor-codegen-specific |
| FAPI runtime / mTLS / DPoP / PSD2 SCA | Runtime + business-context |
| Apollo Federation / Shopify GraphQL @key/@shareable | GraphQL not OpenAPI |
| OpenTelemetry semantic-conventions | Run-time instrumentation |
| MCP transport-protocol details | Separate transport-spec |
| HIPAA / PCI / FERPA-specific markers | Domain-knowledge — LLM Phase B |
| Sustainability / green-software / carbon-aware | Too speculative for spec-level |
| Government accessibility-WCAG-for-APIs | Mostly content-level |

---

## Implementation Notes

1. **Source-Quality-Fix CI verification** (`source-verified-at` timestamps): every P1 rule whose severity hinges on RFC-2119 verbatim has been (or will be) verified via gh-api-raw against the IETF source-mirror (`httpwg/http-core` for RFC 9110/9111/9112 — verified 2026-05-05; `aip-dev/google.aip.dev` for AIPs — verified 2026-05-05; `json-api/json-api` for JSON:API — verified 2026-05-05). Quarterly re-verification CI job (T25).

2. **IANA-registry-snapshot dependency** (T22): apiq ships allowlists (status codes, methods, header field names, link relations, cache directives, media types, range units). Snapshot at apiq-release-time, refresh quarterly. Rules SHOULD be data-driven against the snapshot, not hardcoded.

3. **Severity-axis policy** (T23): every rule's metadata carries the full Round-2 schema (severity + direction + lens-array + source-distinction + codegen-targets + ISO/IEC 25010 + Stakeholder/Lifecycle/Defect-Class). UI-team can filter/group findings by any of these axes.

4. **Putz-Niveau Benchmark** (T24): apiq covers 27 of 28 Springer-Delphi high-importance rules + 1 partial (single-spec breaking-change prediction; full diff out-of-scope). After Wave 2, run benchmark + verify all 28 rules fire OR are explicit-skip-with-rationale. CI gate.

5. **Architectural directory refactor** (post-spike-lock candidate): current flat `scripts/spike/deterministic/` could be split into `classifiers/` + `aggregators/` + `modules/` + `rules/` to reflect the 8-rule-classes + 3-arch-elements view. **Defer until post-Wave-2 stable.**

6. **DOLAR-pattern-coverage marketing claim**: F-11 / F-12 / F-13 / F-14 cover the load-bearing DOLAR linguistic anti-patterns. Marketing-defensible claim "apiq covers the full DOLAR anti-pattern catalog" lands after T18 (Client-Friction Spectral rules) ships.

7. **Per-target metadata** (Lens 4 patterns) should be in T18 output: each rule declares `targets: ['*']` or specific list. Enables per-target rule-sets without hard-fork.

8. **info-tier severity** (NEW Round-2 Phase F): UI must distinguish positive-markers (`info`) from findings (error/warn/hint). Positive markers are observations (SLA4OAI present ✓, capability-discovery endpoint present ✓), not violations.

---

## Status

- **Authored:** 2026-05-05 evening, post-Mining-Round-2 Master-Konsolidierung.
- **Total patterns:** ~290 take-into-apiq + ~25 LLM-delegated + ~25 runtime/diff-out-of-scope + ~20 vendor/skip-with-reasoning.
- **Priority distribution:** P1 ~95 / P2 ~60 / P3 ~110 / P4 ~15 / P5 ~10.
- **Cost estimate:** P1+P2 = ~155 patterns, ~30 person-days for 2 engineers = realistic 4-6 week dedicated sprint.
- **Wave 2 deliverable:** P1+P2 + 8 Modules (T8-T15) + Spectral rule-sets (T16-T19) + Cross-cutting infra (T22-T25) = full Stage-A polishing per Iteration-6 reputation-load-bearing standard.
- **Wave 3 (post-launch):** P3 trail + P4/P5 backfill + per-quarterly-review re-mining.
- **Pari-gate (target, not current state):** 27/28 Springer-Delphi narrative-mapped + 1 partial (T26 spec-diff). DOLAR-catalog (F-11..F-14) wartet auf Welle C P2-Client. RFC-9457 USP RFC2-5 + webhook-signature USP TM-A50 sind in `problem-json-validator.ts` und `webhook-signature.ts` implementiert, **aber beide Module sind orphan-but-tested und nicht in `runDeterministicLayer` gewired** (W2-Fix). Bis Pari-Gate empirisch (cross-linter + reference-spec-firing) verifiziert ist, gilt: target-formulation, nicht achievement-statement.
