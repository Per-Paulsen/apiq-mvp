# Stage-A Mining Round-2 Phase A — Threat-Modeling (Lens 1)

> **Phase A of Mining-Round-2.** Round-1 surfaced 24 OWASP-rules from the OWASP-Spectral-ruleset (already mapped to brainstorm Kategorie Y). Round-2 Phase A goes beyond the Spectral-ruleset:
> - all 10 OWASP API Security Top 10 (2023) categories surveyed systematically (not just the ones that have a mature Spectral-rule);
> - OWASP REST Security + Authentication + JWT + CORS + HTTP-Headers cheat-sheets;
> - 42Crunch's 300+ audit checks (the Spectral-ruleset is a small subset of what 42Crunch encodes);
> - PII-detection-tool patterns (truffleHog, Gitleaks, Cloudflare-OpenAPI-redaction);
> - GitHub + Stripe webhook conventions (signature-header documentation patterns);
> - OAuth2.1 / RFC 9700 PKCE-mandate (post-2024 standard).
>
> **Scope guardrails:** apiq Stage A is spec-agnostic, deterministic, and can only see what's *in the OpenAPI document*. Threat-classes that require runtime observation (e.g. "is the implementation actually rate-limited?") are LLM-territory (or cannot be detected at all). Detection-feasibility column makes this explicit.
>
> **Method:** read each source, extract every detection-pattern that is *spec-visible* (i.e. inferable from the OpenAPI document alone), classify by:
> - **Generic — take into apiq:** mech / mech-stat / heuristic / graph detection feasible from spec alone, generic across APIs, NEW vs Round-1.
> - **Already-in-apiq-brainstorm:** Round-1 captured this as Y-1..Y-25; this row notes additional source-confirms from Round-2.
> - **Unsure:** detection borderline-LLM, opinion-divided, or requires runtime observation. Includes everything where the *only* reliable detector is semantic reasoning (LLM-territory).
> - **Org-specific / Skip:** only meaningful for one vendor/regulator (HIPAA-only, PCI-only, etc.) or runtime-only.
>
> **Multi-Lens-Tags:** Threat-Modeling (TM) is the primary lens for this Phase, but several patterns are cross-lens (e.g. RFC 8725 = TM + Standards-Compliance). Captured per-row.
>
> **Severity-Axis:** RFC-2119 verbatim where source uses it (most OWASP cheats use SHOULD/MUST). Where source is silent, severity inferred from threat-criticality (CVSS-like reasoning) — column says "inferred".

---

## Sources surveyed

| Source | URL | License/Status | Recency | Coverage |
|---|---|---|---|---|
| **OWASP API Security Top 10 (2023)** — main page | https://owasp.org/API-Security/editions/2023/en/0x11-t10/ | CC-BY-SA 4.0 | 2023-06 (current) | All 10 risk categories |
| OWASP API1:2023 BOLA | https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/ | CC-BY-SA 4.0 | 2023-06 | Object-level auth |
| OWASP API2:2023 Broken Authentication | https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/ | CC-BY-SA 4.0 | 2023-06 | Authentication-flaws |
| OWASP API3:2023 BOPLA (Mass-Assignment + Excessive-Data-Exposure merged) | https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/ | CC-BY-SA 4.0 | 2023-06 | Property-level auth, mass-assignment, excessive-data-exposure |
| OWASP API4:2023 Unrestricted Resource Consumption | https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/ | CC-BY-SA 4.0 | 2023-06 | DoS, rate-limit, schema-bounds |
| OWASP API5:2023 Broken Function Level Authorization | https://owasp.org/API-Security/editions/2023/en/0xa5-broken-function-level-authorization/ | CC-BY-SA 4.0 | 2023-06 | Function-level auth, admin-paths |
| OWASP API6:2023 Unrestricted Access to Sensitive Business Flows | https://owasp.org/API-Security/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/ | CC-BY-SA 4.0 | 2023-06 | Business-flow abuse |
| OWASP API7:2023 SSRF | https://owasp.org/API-Security/editions/2023/en/0xa7-server-side-request-forgery/ | CC-BY-SA 4.0 | 2023-06 | URL-handling-params |
| OWASP API8:2023 Security Misconfiguration | https://owasp.org/API-Security/editions/2023/en/0xa8-security-misconfiguration/ | CC-BY-SA 4.0 | 2023-06 | TLS, CORS, headers, methods |
| OWASP API9:2023 Improper Inventory Management | https://owasp.org/API-Security/editions/2023/en/0xa9-improper-inventory-management/ | CC-BY-SA 4.0 | 2023-06 | Versioning, deprecation, debug-endpoints |
| OWASP API10:2023 Unsafe Consumption of APIs | https://owasp.org/API-Security/editions/2023/en/0xaa-unsafe-consumption-of-apis/ | CC-BY-SA 4.0 | 2023-06 | Upstream-API hygiene |
| OWASP REST Security Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html | CC-BY-SA 4.0 | active | Content-Type, Accept, errors, headers |
| OWASP Authentication Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html | CC-BY-SA 4.0 | active | Auth-flow patterns, password-policy |
| OWASP JWT Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html | CC-BY-SA 4.0 | active | JWT-alg-confusion, RFC 8725 |
| OWASP CORS Misconfiguration / WSTG | https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/07-Testing_Cross_Origin_Resource_Sharing | CC-BY-SA 4.0 | active | CORS-wildcard, credentials-mix |
| OWASP HTTP Headers Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html | CC-BY-SA 4.0 | active | HSTS, CSP, X-Content-Type-Options |
| OWASP Information-Exposure-Through-Query-Strings | https://owasp.org/www-community/vulnerabilities/Information_exposure_through_query_strings_in_url | CC-BY-SA 4.0 | active | PII-in-URL |
| OWASP SSRF Prevention Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html | CC-BY-SA 4.0 | active | URL-allowlist |
| **42Crunch API Security Audit** (300+ checks) | https://42crunch.com/api-security-audit/ + https://docs.42crunch.com/latest/content/concepts/api_contract_security_audit.htm | proprietary; rule-list public via VS-Code-extension docs | active 2024 | Most extensive OpenAPI-spec audit ruleset publicly documented |
| 42Crunch unknown-format rule | https://docs.42crunch.com/latest/content/oasv3/datavalidation/schema/v3-schema-response-string-unknown-format.htm | docs-public | active | Format-restriction enforcement |
| **TruffleHog** secret-patterns (800+ verifiers) | https://github.com/trufflesecurity/trufflehog | AGPL-3.0 | active | Secret-format regex (applicability for spec-default-strings + example-values) |
| **Gitleaks** secret-patterns (150+ default rules) | https://github.com/gitleaks/gitleaks | MIT | active | Secret-format regex |
| Cloudflare OpenAPI-PII-redaction (case study) | https://apievangelist.com/2025/02/13/cloudflare-uses-openapi-to-standardize-the-redaction-of-audit-log-data-at-the-api-gateway-layer/ | article | 2025-02 | OpenAPI-as-PII-tagging-source pattern |
| OAI-Specification-issue #2190 (PII-tagging proposal) | https://github.com/OAI/OpenAPI-Specification/issues/2190 | open issue | active | Community-recognition that field-name-based PII-detection is needed |
| **GitHub webhook-validation** | https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries | docs-public | active 2024 | `X-Hub-Signature-256` HMAC convention |
| **Stripe webhook docs** | https://docs.stripe.com/webhooks/signature | docs-public | active | `Stripe-Signature` header convention |
| **OAuth 2.1 / RFC 9700** (BCP) | https://oauth.net/2.1/ + https://datatracker.ietf.org/doc/html/rfc9700 | IETF | RFC 9700 published 2025 | PKCE mandatory; implicit/password forbidden |
| RFC 8725 (JWT BCP) | https://datatracker.ietf.org/doc/html/rfc8725 | IETF | 2020 | JWT-alg-confusion, "alg":"none" forbidden |
| MDN HSTS reference | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security | CC-BY-SA 2.5 | active | HSTS-as-response-header pattern |

**Note on coverage gaps:** several sources surveyed report findings as "platform-detected" (i.e. require runtime observation, e.g. "verbose error messages leak stack-trace"). Those are NOT spec-detectable and are filtered into the Unsure-LLM-or-runtime bucket.

---

## Patterns extracted

### Generic (take into apiq) — NEW (not yet in Round-1 OWASP-coverage)

> Each row: **Source → Pattern → Multi-Lens-Tags → Severity (verbatim if RFC-2119, else inferred) → Detection-feasibility → Notes.**
> Detection-feasibility levels:
> - **mech**: deterministic single-pass spec-traversal (Spectral-rule territory)
> - **mech-stat**: walker (% / threshold / coverage statistic)
> - **heuristic**: needs name-heuristic (regex on field-names), known-false-positive-risk
> - **graph**: needs cross-spec-traversal (e.g. response-schema vs request-schema)
> - **mech-config**: deterministic but requires apiq-config (PII-allowlist, sensitive-name-list)

| ID | Pattern | Source | Multi-Lens-Tags | Severity | Detection-feasibility | Notes |
|---|---|---|---|---|---|---|

#### API1:2023 BOLA — Object-Level Authorization

| **TM-A1** | Path-params named `id`/`*_id`/`uuid` MUST declare `format: uuid` or pattern (rejects sequential-integer enumeration risk) | OWASP API1 + API1-prevention §"Use random and unpredictable IDs (GUIDs)" | TM, Ergonomics | SHOULD (OWASP) | mech | apiq Y-1 covers numeric-IDs; **this is sharper**: declare format/pattern positively, not just reject `type: integer`. Confirms + extends Y-1. |
| **TM-A2** | `requestBody`/path-params accepting an *object-id* on a write-op SHOULD have a `security` requirement on the operation (BOLA-coverage) | OWASP API1 prevention §"object-level authorization checks" | TM, Standards | SHOULD (OWASP) | mech | Refines existing F2/Y-23: when the op has a path-param matching `*-id` AND the op is non-GET, check security is non-empty. Sharper than blanket "non-idempotent → security". |
| **TM-A3** | Endpoints with multiple object-references in one path (`/orgs/{org_id}/users/{user_id}/orders/{order_id}`) flag for nested-authorization-review (3+ ID-params = high BOLA risk) | OWASP API1 §"common cause: tenant isolation missing" | TM | SHOULD (inferred) | mech | New. Triggers on path-template parser counting `*_id`-style params per path. |
| **TM-A4** | Request-body `{ user_id, ... }` field on non-admin endpoint suggests object-level-id IS in the body (BOLA via body-param) — flag for review | OWASP API1 examples §"object_id taken from request body" | TM | SHOULD (inferred) | heuristic | New. Body has property literally named `user_id`/`account_id`/`tenant_id` whose schema-context is non-admin → review. |

#### API2:2023 Broken Authentication

| **TM-A5** | If `securitySchemes` includes type `http` with `scheme: bearer` AND `bearerFormat: JWT`, then `description` SHOULD mention RFC 8725 / "alg none" mitigation OR otherwise indicate signing-algo policy | OWASP API2 §"JWT" + RFC 8725 + OWASP JWT cheat-sheet | TM, Standards | SHOULD (RFC 8725) | heuristic | apiq Y-8 captured this; Round-2 confirms multi-source. Detection: regex on `description` field. **Already in Y-8** — promote from "off-by-default" to "on by default" given RFC 8725 multi-source confirmation. |
| **TM-A6** | OpenIdConnect `openIdConnectUrl` MUST be HTTPS (mirror of OAuth2-tokenUrl-rule) | OpenAPI-Spec + APIMatic ruleset `required-open-id-connect-security-scheme-url` + OWASP API2 | TM, Standards | MUST (inferred from RFC 6749) | mech | New. Apiq has `apiq-oauth2-needs-tokenurl`-style for OAuth2; analog rule for `openIdConnect`-type missing. |
| **TM-A7** | OAuth2 flow `authorizationCode` SHOULD declare PKCE-support (e.g. via `x-usePkce: true` extension OR mention "PKCE" in description) — RFC 9700 / OAuth 2.1 mandate | RFC 9700 (2025-BCP) + OAuth 2.1 + Auth0 + Speakeasy | TM, Standards | MUST (RFC 9700) | heuristic | New. PKCE became mandatory in OAuth 2.1 / RFC 9700 (2025). Detection: if `flows.authorizationCode` exists, look for `x-usePkce` extension OR "PKCE"/"S256"/"code_challenge" in description. False-positive: many specs are pre-2.1 — start as `hint`, severity-bump after stage-A-pari. |
| **TM-A8** | If any operation lists multiple `securityRequirement` ANDed (`security: [{a:[],b:[]}]`), the schemes SHOULD be of complementary types (e.g. `http+apiKey` for client-id + bearer-token), NOT two of the same type | OWASP API2 §"layered auth" + Speakeasy security-schemes | TM, Ergonomics | SHOULD (inferred) | graph | New. Detect AND-combinator with two same-type schemes → flag as suspicious. |
| **TM-A9** | Login/auth-endpoints (`/login`, `/signin`, `/auth/token`) SHOULD NOT have ALL of: (a) request-body `password` field with no `format: password` AND (b) no rate-limit headers in 4xx responses (auth-brute-force-class) | OWASP API2 §"credential stuffing", OWASP Authentication cheat-sheet | TM, Ergonomics | SHOULD (inferred) | heuristic | New. Compound rule: detect login-endpoint-by-name + request-body has password-field-by-name → check rate-limit-header coverage on 401/429. |
| **TM-A10** | Tokens of name `access_token`, `refresh_token`, `id_token` returned in **path** or **query** (e.g. `?access_token=...`) violate OAuth2 BCP (must be in body or header) | OWASP API2 + RFC 6750 §"Don't pass bearer tokens in URI" | TM, Standards | MUST (RFC 6750 §2.3) | mech | New. apiq Y-3 covers credential-named *params*; this is the response-side analog: tokens returned via URI redirect param. Niche but RFC-load-bearing. |

#### API3:2023 BOPLA — Mass-Assignment + Excessive-Data-Exposure

| **TM-A11** | Request-body schema for a POST/PUT/PATCH op contains property literally named `is_admin` / `role` / `permissions` / `is_super_user` / `account_balance` / `verified` (privilege-escalation-class field accepting input) | OWASP API3 §"Mass Assignment examples" + OWASP API3-prevention | TM, Hygiene | SHOULD (OWASP) | mech-config | New. Heuristic field-name list. **Apiq-config-driven** (allow corporate teams to extend the list). High-value: catches the canonical "createUser accepts admin:true" bug. |
| **TM-A12** | Request-body schema for a *user-creation* op SHOULD use `writeOnly: true` on `password`/`secret` properties (so they're not echoed back in responses) | OpenAPI Spec writeOnly + OWASP API3 §"separate request/response models" | TM, Standards | SHOULD (inferred) | mech-config | New. Triggers on property-name in {password, secret, ssn, token} on a request-body without `writeOnly: true`. |
| **TM-A13** | Response-body schema SHOULD use `readOnly: true` on identity/timestamp fields (`id`, `created_at`, `updated_at`, `deleted_at`) so codegen-tools don't accept them in requests | OpenAPI Spec readOnly + OWASP API3 + APIMatic | TM, Standards, Ergonomics | SHOULD (inferred) | mech-config | New. Symmetric to TM-A12. Without `readOnly`, codegen produces clients that can attempt to set server-managed fields → mass-assignment-friendly. |
| **TM-A14** | Request-body and response-body for the SAME resource SHOULD NOT share an identical schema (`#/components/schemas/User` reused in both) — they typically diverge (writeOnly password in req, readOnly id in resp) | OWASP API3 §"separate request/response object models" + 42Crunch audit | TM, Ergonomics | SHOULD (inferred) | graph | New. Detection: walk schemas; for each resource (paired by name `Foo` vs `FooCreate`/`FooRequest`), if a single schema is referenced from both `requestBody.content.*.schema` AND `responses.*.content.*.schema` AND has no readOnly/writeOnly markers → flag. |
| **TM-A15** | Response-body schema contains property names matching PII-allowlist (`ssn`, `social_security_number`, `tax_id`, `national_id`, `passport_number`, `credit_card`, `card_number`, `cvv`, `pan`, `iban`, `phone_number`, `date_of_birth`, `dob`) WITHOUT a `format`/`pattern` constraint AND without `writeOnly` (excessive-data-exposure-risk) | OWASP API3 + OAI Issue #2190 + Cloudflare PII-redaction case study + truffleHog/Gitleaks PII patterns | TM, Standards (GDPR) | SHOULD (inferred) | mech-config | New. **High-value**: this is the canonical excessive-data-exposure leak. Detection: regex on property-name. **Apiq-config-driven** with sensible default list (above). |
| **TM-A16** | Property `email` on a response-body SHOULD declare `format: email` (allows tooling to recognize PII for masking) | OWASP API3 + OAI #2190 + OAS spec format-list | TM, Hygiene | SHOULD (inferred) | mech | New. Specific case of TM-A15 generalized. Lower-severity (format declaration alone doesn't prevent leak; signals intent). |
| **TM-A17** | `additionalProperties: true` on a *request-body* schema (mass-assignment risk specifically — Y-10 was per-schema; this narrows to request-bodies) | OWASP API3 §"Mass Assignment prevention: use Object Schemas" | TM | SHOULD (inferred) | graph | New. apiq Y-10 covers per-schema; this is the *contextual* variant: per-schema-on-request-body is sharper signal than per-schema-anywhere. |

#### API4:2023 Unrestricted Resource Consumption

| **TM-A18** | Recursive schema (component refs itself transitively) SHOULD declare a max-depth via `x-max-depth` extension OR have non-recursive base-case in oneOf-discriminator | OWASP API4 + IBM-LI81715 (10-level max-depth bug) + langchain RecursionError + fastmcp issue#1016 + 42Crunch | TM, Ergonomics | SHOULD (inferred) | graph | New. **Parser-DoS class**: deeply-nested or cyclic schemas crash codegen/parsers. apiq has `cycleStripSpec` for AJV — detection signal: any cycle exists in dereferenced graph. Severity: warn (cycle present) / error (cycle without termination-discriminator). |
| **TM-A19** | Request-body or response-body that's an `object` with >50 properties (chatty-fat-payload / bloat) → DoS-class via memory + serialization-cost | OWASP API4 §"resource consumption" + 42Crunch object-property-limits | TM, Ergonomics | SHOULD (inferred) | mech-stat | New. Walker. apiq has Walker-territory; new threshold-rule. |
| **TM-A20** | `array` schemas with `maxItems` > 10000 (declared but trivially-large) defeat the purpose | OWASP API4 §"upper-bound check meaningful?" | TM | SHOULD (inferred) | mech | New. apiq Y-12 covers absence of `maxItems`; this catches the bypass. |
| **TM-A21** | `string` schemas with `maxLength` > 1_000_000 (1 MB strings) defeat DoS bound | OWASP API4 + 42Crunch | TM | SHOULD (inferred) | mech | New. Same pattern as TM-A20 for strings. |
| **TM-A22** | List-endpoints (`GET /users`) without `limit`/`per_page`/`page_size`/`size` query-parameter (no pagination defined) → unbounded-result-set DoS | OWASP API4 §"pagination missing" + 42Crunch + Stripe API guide | TM, Ergonomics | SHOULD (OWASP) | heuristic | New. Detection: GET op with response-body containing `array`-typed top-level OR `data: array` AND no `limit`-style param → flag. apiq has Pagination-walker; new explicit rule. |
| **TM-A23** | List-endpoint pagination param `limit`/`per_page` MUST have `maximum` constraint (else attacker passes `limit=999999999`) | OWASP API4 + Stripe + OWASP integer-bounds | TM | MUST (inferred from API4) | mech | New. Compound: locate pagination-param by name → assert `maximum` is present. |
| **TM-A24** | File-upload endpoint (multipart/form-data with `format: binary`) MUST declare `maxLength` on the binary property (file-size limit DoS) | OWASP API4 §"large payloads" + OAS multipart spec | TM | MUST (inferred) | mech | New. apiq Y-13 covers strings generally; binary-uploads-without-bound is sharper signal. |
| **TM-A25** | Operation-level `timeout` extension (`x-timeout-seconds`) recommended on long-running operations (so clients don't stall indefinitely) — alternatively, OAS 3.1 webhook + 202+Operation-Location async-pattern declared | OWASP API4 §"timeouts" | TM, Ergonomics | SHOULD (inferred) | heuristic | New. Off-by-default (vendor-extension territory). |
| **TM-A26** | `enum` array length > 1000 (huge enum = parser-DoS) | OWASP API4 + 42Crunch | TM | SHOULD (inferred) | mech | New. Walker / per-property rule. |

#### API5:2023 Broken Function Level Authorization

| **TM-A27** | Spec contains paths under `/admin` / `/internal` / `/private` / `/_*` namespace AND operations there share the SAME `securityScheme` as public endpoints (no privilege separation) | OWASP API5 §"admin endpoints" + Spectral-OWASP `differentSecuritySchemes` | TM | SHOULD (OWASP) | graph | apiq Y-22 captured this; Round-2 confirms. **Reinforces existing**: keep at hint, off-by-default (heuristic on path-prefix). |
| **TM-A28** | Operation `summary`/`description` mentions "admin"/"internal"/"superuser"/"root" but operation has NO `security` requirement (admin-by-name without auth) | OWASP API5 §"don't assume URL = role" | TM | SHOULD (inferred) | heuristic | New. Description-keyword-scan. |
| **TM-A29** | Resource has GET endpoint defined but PUT/PATCH/DELETE for same resource missing → either intentional read-only (OK) OR forgotten write-op-with-auth (BFLA-blind-spot). Not a violation per se, but flag for review when admin-style description mentions edit/delete | OWASP API5 §"HTTP method matters" | TM, Ergonomics | (inferred informational) | graph | New. Borderline — likely Unsure (orchestrator decides). Move to Unsure if false-positive too high. |
| **TM-A30** | Operation defines a non-standard HTTP method (PROPFIND/MKCOL/etc.) without explicit security — flag (OAS3 allows custom methods; uncommon ones are often forgotten in auth-routing) | OWASP API5 §"changing HTTP method" | TM | SHOULD (inferred) | mech | New. apiq has standard-method-allowlist hint; this adds the auth-coverage angle. |

#### API6:2023 Unrestricted Access to Sensitive Business Flows

| **TM-A31** | Operations whose path/summary suggests *signup-like* business-flow (`/signup`, `/register`, `/account/create`) SHOULD declare a CAPTCHA/Turnstile challenge mechanism via either: header-param `cf-turnstile-token`/`g-recaptcha-response`, OR response 429 with rate-limit headers | OWASP API6 §"prevention - device fingerprinting / human detection" | TM | SHOULD (OWASP) | heuristic | New. Likely off-by-default (depends on whether API is human-facing vs server-to-server). Detection: regex on path/summary. |
| **TM-A32** | Operations whose path/summary suggests *purchase/booking* business-flow (`/orders`, `/checkout`, `/reservations`, `/bookings`) MUST have rate-limit headers documented in 429 response (else automation-abuse) | OWASP API6 §"sensitive business flows: purchase, reservation, comment" | TM | MUST (OWASP API6 prevention) | heuristic | New. Same heuristic-detection caveat. |
| **TM-A33** | Operations whose path/summary suggests *posting/commenting* business-flow (`/comments`, `/posts`, `/messages`) SHOULD have rate-limit headers (spam-prevention) | OWASP API6 | TM | SHOULD (OWASP) | heuristic | New. Same caveat. |

#### API7:2023 SSRF

| **TM-A34** | Property in request-body literally named `*_url`/`callback`/`redirect`/`webhook_url`/`url`/`href` MUST have `format: uri` AND `pattern` (allowlist hint) AND description-mention of allowlist policy | OWASP API7 §"prevention: input validation, allowlists, schemes/ports" + OWASP SSRF-cheat-sheet | TM, Standards | MUST (OWASP API7) | heuristic | apiq Y-15 covered URL-handling-params on path/query; **extends to request-body properties**. Confirmed multi-source. |
| **TM-A35** | URL-handling parameter that allows `file://`, `gopher://`, `dict://`, `internal://` schemes (i.e. no `pattern` restricting to `^https?://`) is SSRF-prone | OWASP API7 + OWASP SSRF Prevention §"URL schemes" | TM | MUST (OWASP API7) | heuristic | New. If `format: uri` declared without `pattern`, suggest pattern. |
| **TM-A36** | Operation that consumes an upstream URL (parameter named like above) MUST declare 4xx response (likely 400/422) for invalid-URL and SHOULD declare 502/504 for upstream-fetch-failure | OWASP API7 + OWASP API10 §"validate response status codes" | TM, Standards | SHOULD (inferred) | graph | New. Compound rule. |
| **TM-A37** | `parameter` in path/query named `host`/`hostname`/`server`/`endpoint`/`origin` (not just `url`) flagged for SSRF-review | OWASP API7 §"webhooks, file fetching, custom SSO, URL previews" | TM | SHOULD (inferred) | heuristic | New. Extends Y-15 name-list. |

#### API8:2023 Security Misconfiguration

| **TM-A38** | Spec declares CORS-headers (e.g. `Access-Control-Allow-Origin` example value `*` literal) — wildcard CORS is misconfiguration when paired with credentialed-auth | OWASP API8 §"overly permissive CORS" + OWASP CORS-Misconfig | TM, Standards | MUST (OWASP CORS) | mech | New. Detection: response-header `Access-Control-Allow-Origin` example-value or default = `*`. |
| **TM-A39** | Spec declares CORS `Access-Control-Allow-Credentials: true` AND `Access-Control-Allow-Origin: *` together → impossible per spec, dangerous misconfiguration | OWASP CORS WSTG | TM, Standards | MUST (CORS-spec) | graph | New. Both headers must coexist for detection. |
| **TM-A40** | Spec defines authenticated endpoints but declares `Access-Control-Allow-Origin: <single-origin>` reflecting browser-Origin without allowlist — flag for orchestrator-/LLM-review | OWASP CORS-Misconfig §"origin-reflection" | TM | SHOULD (inferred) | heuristic | New. Borderline — move to Unsure. |
| **TM-A41** | Response headers SHOULD include security-headers when API serves browser-clients: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, `X-Frame-Options` | OWASP HTTP-Headers cheat-sheet + OWASP API8 §"security headers missing" | TM, Standards | SHOULD (inferred) | mech-stat | New. Off-by-default (HSTS doesn't apply to non-browser APIs per MDN). When API has cookies/session-auth (browser-context-signal), upgrade to warn. |
| **TM-A42** | Verbose error response schema (4xx/5xx) that includes properties named `stack`/`trace`/`stack_trace`/`exception`/`internal_message` → leakage of internals | OWASP API8 §"verbose error messages" + OWASP REST-cheat §"error handling" | TM, Hygiene | SHOULD (OWASP) | heuristic | New. High-value: catches "we returned the .NET exception in the body" anti-pattern. |
| **TM-A43** | Operation declares HTTP methods rarely used outside upload/download (TRACE, CONNECT, PROPFIND, MKCOL) without explicit security AND without a description explaining why — likely DAV-residue or attack-surface | OWASP API8 §"unnecessary HTTP methods" | TM | SHOULD (OWASP) | mech | New. apiq has standard-method-list (Y-style); this is the security-angle. |
| **TM-A44** | `info.x-debug` / `paths` containing `/debug`/`/_debug`/`/test`/`/_test`/`/dev`/`/_dev` namespace exposed in production spec | OWASP API8 §"open debug endpoints" + OWASP API9 §"shadow APIs" | TM, Hygiene | MUST (OWASP) | mech | New. Multi-source. |

#### API9:2023 Improper Inventory Management

| **TM-A45** | Spec declares multiple `servers` entries pointing at different *versions* (`/v1`, `/v2`, `/v3`) without one being marked `deprecated` or `description: "deprecated"` → unclear retirement plan | OWASP API9 §"deprecated versions still live" | TM, Evolution | SHOULD (OWASP) | heuristic | New. Cross-Lens: TM + Lens-3 (Evolution-Friction). |
| **TM-A46** | Operations marked `deprecated: true` SHOULD declare a `sunset`-date (via `x-sunset` extension or RFC 8594 Sunset-header in description) AND a replacement-reference (via `description` linking to new endpoint) | OWASP API9 §"deprecation lifecycle" + RFC 8594 + apiq Lens-3 already-noted | TM, Evolution | SHOULD (OWASP) | heuristic | New. Extends apiq's existing `deprecated:true` Lens-3 finding with security-angle. |
| **TM-A47** | `info.version` differs from path-version-prefix (`info.version: 2.3.0` but `servers[].url: https://api/v1`) → version-drift / inventory-mismatch | OWASP API9 §"inventory mismatch" | TM, Evolution | SHOULD (inferred) | mech | New. Multi-source check. |
| **TM-A48** | `info.contact` missing in production-marked-spec (no responsible-party for vulnerability disclosure) | OWASP API9 §"who to contact for vulnerability reports" | TM, Hygiene | SHOULD (OWASP) | mech | apiq has contact-rule; **upgrade severity from hint to warn for production-context** when `info.x-environment: production` or similar. |

#### API10:2023 Unsafe Consumption of APIs

> Most API10 patterns are runtime-only (does the implementation validate upstream-API responses?). Spec-detectable subset:

| **TM-A49** | Operation declares an upstream-API URL parameter (TM-A34/A37) AND lacks 502/503/504 response declarations (no upstream-failure-handling) | OWASP API10 §"timeouts/limits on upstream" | TM, Standards | SHOULD (OWASP API10) | graph | New. |
| **TM-A50** | Webhook-receiving endpoint (path matches `/webhooks/`/`/_webhooks/`/`/callbacks/`) MUST declare a signature-verification header parameter (e.g. `X-Hub-Signature-256`, `Stripe-Signature`, `X-Signature`, `X-Webhook-Signature`) | GitHub webhook docs + Stripe webhook docs + OWASP API10 §"upstream-API trust" | TM, Standards | MUST (multi-vendor convention) | mech-config | New. **High-value**: catches the "we accept any webhook payload without HMAC-verification" pattern. Apiq-config-driven (allowlist of signature-header names). |
| **TM-A51** | Webhook endpoint that consumes JSON body but accepts unknown content-types (`*/*` or no `consumes`) — webhook-replay vector | OWASP API10 + GitHub webhook §"raw-body required" | TM, Standards | SHOULD (inferred) | mech | New. |

#### Cross-cutting (multiple OWASP-categories)

| **TM-A52** | `info.description` SHOULD declare a "Security" section (heuristic: `## Security` heading or "auth"/"authentication"/"authorization" mentioned) | OWASP REST cheat-sheet §"document security expectations" + Lens-2 already-noted Z-8 | TM, Standards, Documentability | SHOULD (inferred) | heuristic | apiq Z-8 covers keyword-coverage; **TM-angle adds**: must mention rate-limit policy, token rotation, MFA-availability. |
| **TM-A53** | API requires authentication (any `securitySchemes` declared) BUT spec has NO 401 response declaration anywhere (orphan auth: defined but never returned) | OWASP API2 §"401 Unauthorized declared" + Round-1 G-OWASP-27 | TM, Standards | MUST (RFC 7235) | graph | apiq C5 partially; **promote to error severity** when scheme is declared and no 401-response exists in any operation. |
| **TM-A54** | TLS / HTTPS-only enforcement (`server[].url` HTTPS — Round-1 confirmed Y-17) WITH additional check: `description` mentions TLS-version-policy (TLS 1.2+ minimum). Pure-spec rule? **No** — this is description-prose and best-flagged as hint. | OWASP API8 §"TLS encryption" + OWASP REST cheat-sheet | TM | SHOULD (inferred) | heuristic | Borderline LLM. → Unsure. |

---

### Already-in-apiq-brainstorm (Y-1..Y-25 from Round-1 — confirm or expand from Round-2)

| brainstorm-ID | Source-confirms (Round-2) | Notes |
|---|---|---|
| **Y-1** (Numeric IDs in path-params) | OWASP API1 §"sequential IDs vulnerable" + multi-source-Round-2 | **Severity: keep as warn/off-by-default — Round-2 confirms, but UUID-format is opinion-divided in legacy APIs**. |
| **Y-2** (API-keys in URL) | OWASP API2 §"credentials in URL" | Confirmed; severity error stays. |
| **Y-3** (Credentials in URL parameter names) | OWASP API2 §"password/secret/token" | Confirmed. |
| **Y-4** (HTTP-Basic-Auth) | OWASP API2 + RFC 7617 deprecation | Confirmed. |
| **Y-5** (OAuth2 tokenUrl HTTPS-only) | OWASP API2 + RFC 6749 BCP | Confirmed. **Extend to**: include openIdConnectUrl (TM-A6 above is the new variant). |
| **Y-6** (OAuth2 refreshUrl recommended) | OWASP API2 §"short-lived tokens" | Confirmed. |
| **Y-7** (OAuth2 implicit/password forbidden) | OAuth 2.1 + RFC 9700 (now MANDATORY-forbidden for new APIs) | **Severity-Upgrade: warn → error** for `implicit`/`password` flows, given RFC 9700 (2025) makes them BCP-forbidden. |
| **Y-8** (JWT bearerFormat → RFC 8725 mention) | OWASP JWT cheat-sheet + RFC 8725 + multi-source | Confirmed. **Promote from off-by-default to on-by-default warn**. |
| **Y-9** (Auth-schemes outdated: negotiate/OAuth1) | OWASP API2 | Confirmed. |
| **Y-10** (additionalProperties:false per-schema) | OWASP API3 BOPLA §"Object Schemas vs additional properties" | Confirmed. **Round-2 adds** TM-A17 (request-body-specific variant — sharper signal). |
| **Y-11** (unevaluatedProperties:false 3.1) | OAS 3.1 + OWASP API3 | Confirmed. |
| **Y-12** (Array maxItems) | OWASP API4 §"array boundaries" | Confirmed. **Round-2 adds** TM-A20 (trivial-large bound bypass). |
| **Y-13** (String maxLength/enum/const) | OWASP API4 + 42Crunch | Confirmed. **Round-2 adds** TM-A21, TM-A24 (binary-upload). |
| **Y-14** (Integer min+max) | OWASP API4 + 42Crunch | Confirmed. |
| **Y-15** (URL-handling-params SSRF-flag) | OWASP API7 + multi-source-Round-2 | Confirmed. **Round-2 extends** to body properties (TM-A34), expanded name-list (TM-A37). |
| **Y-16** (CORS allow-origin declared) | OWASP API8 + OWASP CORS-Misconfig | Confirmed. **Round-2 sharpens**: TM-A38/A39 (wildcard + credentials-mix forbidden, NOT just "should declare"). |
| **Y-17** (Server URLs HTTPS-only) | OWASP API8 §"TLS" + multi-source | Confirmed. |
| **Y-18** (Sensitive header-names) | OWASP API3 + SPS | Confirmed. |
| **Y-19** (Path no environment-names) | OWASP API8 §"environment-leaking paths" | Confirmed. |
| **Y-20** (Server URL no port except localhost) | SPS + OWASP API8 §"unnecessary surface" | Confirmed. |
| **Y-21** (Property names no programming-keywords) | Codegen-correctness, indirect TM via codegen-bug-class | Confirmed. |
| **Y-22** (Admin-paths distinct security-scheme) | OWASP API5 + Spectral-OWASP `differentSecuritySchemes` | Confirmed. **Stay at hint, off-by-default.** |
| **Y-23** (Write-ops protected by security) | OWASP API2 + API5 | Confirmed. **Round-2 sharpens** TM-A2 (object-id-reading-write-ops). |
| **Y-24** (Read-ops should be security-protected) | OWASP API1 + API5 | Confirmed. Stays at hint. |
| **Y-25** (Idempotency-Key on POST creates) | RFC-draft-httpapi-idempotency-key + multi-source-Round-1 | Confirmed (Round-1 reframe). |

---

### Org-specific / Skip

| ID | Pattern | Source | Why-skip |
|---|---|---|---|
| **S-A1** | Mandatory MFA-declaration in spec (e.g. `x-requires-mfa: true`) | OWASP Authentication cheat-sheet §"MFA" | Vendor-extension; not standardized. |
| **S-A2** | Account-lockout-after-N-attempts policy declared in spec | OWASP API2 §"account lockout" | Runtime-only (not spec-visible) unless via vendor-extension. |
| **S-A3** | Password-strength-meter integration declared in spec | OWASP Authentication cheat-sheet | Runtime / client-side concern. |
| **S-A4** | "Don't disclose username-vs-password-incorrect" — error-message-content | OWASP API2 prevention | Runtime, not spec-visible. |
| **S-A5** | Pwned-Passwords integration documented | OWASP Authentication cheat-sheet | Runtime / vendor-specific. |
| **S-A6** | HSTS `max-age` ≥ 31536000 (1 year) | MDN HSTS + OWASP HSTS cheat-sheet | Spec-visible only as response-header default-value; off-by-default since HSTS-on-API is opinion-divided per MDN. Capture as TM-A41 hint instead. |
| **S-A7** | Device-fingerprinting requirement | OWASP API6 §"slow down automation" | Runtime-only. |
| **S-A8** | IP-allowlist for Tor/proxy-blocking | OWASP API6 prevention | Runtime-only. |
| **S-A9** | Audit-log-redaction declared (e.g. Cloudflare-style `x-redact-in-audit`) | Cloudflare PII-redaction case study | Vendor-extension territory; revisit when `OAI/OpenAPI-Specification#2190` lands. |
| **S-A10** | HIPAA / PCI-specific compliance markers (`x-pii-tag`, `x-phi-tag`) | OAI Issue #2190 + Cloudflare | Vendor-extension; not spec-standard yet. |
| **S-A11** | Rate-limit-by-user-agent | OWASP API6 prevention | Runtime, not declared in spec. |
| **S-A12** | Captcha-challenge declared in spec for sensitive flows | OWASP API6 | Vendor-extension territory (TM-A31 captures this as heuristic; this skip-row notes the *standardized* version doesn't exist). |
| **S-A13** | Session-cookie attributes (`Secure`, `HttpOnly`, `SameSite`) declared in spec | OWASP HTTP-Headers + OWASP REST | Cookies are typically not declared per-op in OAS specs; would belong to LLM-Phase B if at all. |
| **S-A14** | TruffleHog/Gitleaks regex applied to default-values / examples in spec to catch *embedded* live secrets | TruffleHog + Gitleaks 800+/150+ pattern-libs | **Borderline-mech** — this IS spec-detectable. **MOVED to Unsure-U-A8** as it's a different deliverable scope (pre-commit secret-scanner has different lifecycle than spec-linter). Don't skip; revisit. |

---

### Unsure (orchestrator review or LLM-territory)

> These patterns are surfaced from Round-2 sources but EITHER detection is borderline-LLM, OR opinion is divided across sources, OR runtime-only signal but borderline-spec-detectable.

| ID | Pattern | Source | Why-unsure (LLM-territory note where applicable) |
|---|---|---|---|
| **U-A1** | "Tenant-isolation" detection: do operations on `/tenants/{tenant_id}/...` paths consistently *also* require a workspace/tenant scope in `securityRequirement`? | OWASP API1 §"tenant isolation missing" | Cross-spec semantic-reasoning; would need to understand resource-ownership-graph. **LLM-territory.** |
| **U-A2** | Endpoint-level "is this endpoint admin-by-purpose?" classification — beyond URL-path-heuristic | OWASP API5 §"don't assume URL = role" | LLM-territory: requires reading description + summary semantically. TM-A28 captures the heuristic version; finer classification = LLM. |
| **U-A3** | "Sensitive business flow" classification (signup vs purchase vs comment vs account-recovery) | OWASP API6 | Heuristic version captured (TM-A31..A33); deeper classification = LLM. |
| **U-A4** | "Excessive data exposure" — does this response leak fields not strictly needed? | OWASP API3 §"clients filter; bad" | LLM-territory: requires understanding intent of endpoint. apiq-Phase-B job. |
| **U-A5** | Verbose-error-detection — "does this 500-response body's example include a stack-trace?" | OWASP API8 §"verbose error" | TM-A42 captures field-name heuristic; example-content scanning is LLM-territory. |
| **U-A6** | Response status-code-set semantically-makes-sense (e.g. POST→404 is suspicious) | OWASP REST + Round-1 C8 | LLM-or-graph; deferred. |
| **U-A7** | "TLS-version-policy declared in description prose" | OWASP API8 §"TLS encryption" | TM-A54: heuristic on description text. Move to Unsure since description-prose-scanning is LLM-better. |
| **U-A8** | Apply TruffleHog / Gitleaks 950+ secret-regexes to default-values + example-values + description-prose in OAS spec (catches "we hardcoded the AWS-key in example: aws_access_key: AKIA...") | TruffleHog + Gitleaks | **Borderline mech-yes (regex-apply-able)** but ROI vs scope-creep needs orchestrator-review. Could be a separate Stage-A-module ("secret-scanner-on-spec"). **Recommendation: build as separate module, not Spectral-rule.** |
| **U-A9** | OAuth2 `scopes` map: are scope-names consistent (`read:users` vs `users.read`)? | OWASP API5 §"scope-design" | Style-Coherence (Lens 5). Cross-lens; TM-secondary. Likely Walker. |
| **U-A10** | Re-emerging vulnerability classes (XML-XXE, DTD-bombs) when `consumes: application/xml` declared without parser-config-mention in description | OWASP REST cheat-sheet §"XML" | Niche; declining relevance. Off-by-default. |
| **U-A11** | "API-version-set" inventory check: spec declares only one version, but does the API-server actually expose `/v0`/`/v1`/`/v2` — runtime-only | OWASP API9 §"shadow APIs" | Runtime-only. Cannot detect from single-spec. Phase-of-the-platform issue (apiq workspace-level). |
| **U-A12** | "Dormant endpoint" detection (operation declared but not used) | OWASP API9 §"zombie APIs" | Runtime-only. |
| **U-A13** | "Single sign-on" hygiene (different OIDC providers, ID-token validation) | OWASP API2 §"custom SSO" | LLM-territory beyond `openIdConnectUrl` HTTPS-check (TM-A6). |
| **U-A14** | Refresh-token rotation strategy declared in description | OWASP API2 §"short-lived tokens" + RFC 6819 | Description-prose scan; LLM-better. |
| **U-A15** | Scope-of-token granularity (e.g. `read_all` is a smell vs fine-grained `read:invoices.list`) | OAuth-BCP + OWASP API5 | LLM-territory; or Walker for "scope name length statistic". |
| **U-A16** | Check if write-only password fields are NOT echoed in 200/201 response example | OWASP API3 + writeOnly-spec | Graph-mech feasible BUT overlaps with TM-A12 sufficiently — orchestrator decides whether to bundle or split. |
| **U-A17** | CORS-origin-reflection-detection (server reflects request-Origin without allowlist — TM-A40 heuristic) | OWASP CORS-Misconfig §"origin-reflection" | Heuristic on response-default-value vs description text. LLM-better. |
| **U-A18** | "Test/sandbox endpoints in production spec" — distinct from /debug. E.g. `https://api-sandbox.example.com` declared as one of `servers[]` without description-marker | OWASP API9 + API8 | Heuristic on hostname (`-sandbox`/`-test`/`-staging`); off-by-default. |

---

### Meta-Observations

#### M-1: Lens-1 (Threat-Modeling) doesn't fully cover excessive-data-exposure detection
Round-2 surfaces a clear gap: **TM-A15 (PII-named-fields-in-responses)** is *technically* TM-class but operationally needs a NEW lens we'd call "Privacy / Data-Classification". This is distinct from threat-modeling because:
- Threat-modeling is "how does an attacker exploit?"
- Data-classification is "is this field's mere presence in this response a regulatory/contractual concern?"
- Many TM-A* rules (TM-A11 mass-assignment fields, TM-A15 PII-fields) are *both* — but a pure data-classification rule (e.g. "GDPR personal-data shouldn't be in URL params, even if no attack vector") fits Lens-?-Privacy better than Lens-1.

**Recommendation:** add **Lens 6 — Privacy / Data-Classification** to the meta-insights doc. This Lens would also house things like:
- "spec declares a property `health_record_id` but no `x-data-class: PHI` annotation" (HIPAA-relevance);
- Cloudflare-style `x-redact-in-audit` markers;
- The OAI-Issue-#2190 PII-tagging-proposal.

#### M-2: OWASP rules split into two detection-feasibility-tiers
Of OWASP's 10 categories, **roughly half is mech-detectable from spec alone, half is runtime-only or LLM-only**:
- Spec-detectable subset (where Stage-A delivers value): API2 (auth-schemes), API3 (mass-assignment-fields, PII-leaking-responses), API4 (schema-bounds), API7 (URL-handling-params), API8 (CORS-headers, debug-paths, verbose-errors, methods, TLS), API9 (deprecation-flow, version-mismatch), API10 (webhook-signatures, upstream-URL-handling).
- Runtime-only / LLM-only subset (Stage-A cannot help): API1 (BOLA — runtime auth-check correctness), API5 (BFLA — same, plus role-semantics), API6 (business-flow-abuse — needs traffic patterns), parts of API4 (actual rate-limit enforcement).
- This means **Stage-A's threat-coverage will be inherently asymmetric** — and that's OK. Document this asymmetry so users don't expect "Stage-A finds all OWASP issues" — it finds the spec-visible subset.

#### M-3: TruffleHog/Gitleaks-class regex application to OAS-default/example/description-prose is a NEW module-class
Round-2 surfaces the realization that 950+ secret-format-regexes (combined truffleHog + Gitleaks) could be applied to:
- `default:` values across the spec
- `example:` values
- `description:` text (might leak secrets in narratives)

This is a NEW Stage-A-module idea, NOT a Spectral-rule. Recommendation: build as `scripts/spike/deterministic/secret-scanner.ts` — a separate module that runs alongside Spectral. Rule-IDs would map to truffleHog detector-types (e.g. `secret-aws-access-key-in-default`).

#### M-4: Cross-Lens patterns dominate
Of 54 new TM-A* rules surfaced, ~30 are cross-Lens (TM + Standards / TM + Ergonomics / TM + Hygiene / TM + Evolution). This **strongly validates** the Lens-Coverage-Matrix recommendation in meta-insights §B. **Implication:** apiq's rule-metadata schema MUST support multi-lens-tags, not single-lens.

#### M-5: Severity-axis splits cleanly into RFC-MUST vs OWASP-SHOULD vs inferred
Of the 54 new rules:
- **MUST** (RFC-anchored): ~12 (HTTPS-only-tokenUrl, no-credentials-in-URL, JWT-RFC8725, OAuth-2.1-PKCE, RFC-6750-tokens-not-in-URI, CORS-spec-violations)
- **SHOULD** (OWASP cheat-sheets): ~28
- **Inferred** (no RFC, no OWASP-explicit, but consistent across sources): ~14

The inferred-rules are the ones most likely to drift in severity per organizational policy. Recommendation: surface those distinctly as `apiq-config.threat-rules.severity` overrides.

#### M-6: Webhook-signature-verification (TM-A50) is a sleeper-killer rule
Of the 54 new rules, TM-A50 stands out as the **highest-likely-real-world-vulnerability-catch** — because:
- Webhooks are explicitly cited in OWASP API10's prevention-text;
- Both GitHub (`X-Hub-Signature-256`) and Stripe (`Stripe-Signature`) document the convention publicly;
- Implementing it is mechanical (path-prefix-heuristic + header-name-allowlist);
- The miss-rate in real specs is high (we surveyed informally — many specs don't document signature-headers).

Recommendation: prioritize TM-A50 in the next "Top-30 highest-value-add" list.

#### M-7: OAuth 2.1 / RFC 9700 (2025) materially upgrades severities of existing Y-rules
Round-1 marked Y-7 (OAuth2 implicit/password forbidden) as `error` based on RFC 6749 deprecation. Round-2 sources confirm RFC 9700 (2025-BCP) makes this **explicitly mandatory** — these flows are now BCP-forbidden, not just deprecated. Same upgrade-trigger for Y-8 (JWT-alg-confusion / RFC 8725) — it was published 2020 but the multi-source confirmation in Round-2 (OWASP API2 + JWT-cheat + TM-A5) elevates from off-by-default to on-by-default.

#### M-8: Multi-source consensus is real and load-bearing
Of the 54 new rules:
- **6+ sources** agree: ~5 (HTTPS-only servers, security-on-write-ops, RFC 8725 JWT, no-credentials-in-URL, CORS-wildcard-with-credentials)
- **3-5 sources**: ~18
- **1-2 sources**: ~31

The 6+-source ones should be high-confidence adopt-rules. The 1-2-source ones need orchestrator-pilot before adoption (false-positive risk).

---

## Status

- **Mining:** complete 2026-05-05 evening (Phase A of Round-2).
- **Sources:** 27 surveyed (OWASP-2023-Top-10 fully; cheat-sheets 6; tools 3; vendor-docs 4; RFCs 4).
- **Output:** 54 new rules (TM-A1 … TM-A54), 25 confirmed/expanded existing Y-rules, 14 skip-rationaled, 18 unsure (mostly LLM-borderline).
- **Top-3 Round-2-Phase-A highest-value-add for apiq Stage A:**
  1. **TM-A50** (webhook signature-verification header) — high-real-world-catch, mechanical detection.
  2. **TM-A11+TM-A15** (mass-assignment + PII-named-fields) — apiq-config-driven heuristic, high-value-class, well-sourced.
  3. **TM-A18** (recursive schema max-depth) — DoS-class, mechanical via cycle-detection (apiq has cycleStripSpec already).
- **Severity-Upgrades for existing Y-rules:**
  - Y-7: warn → **error** (RFC 9700 BCP-forbidden)
  - Y-8: off-by-default → **on-by-default warn** (multi-source confirm)
  - Round-1 G-OWASP-27 / brainstorm C5 ↔ TM-A53: warn → **error** when `securitySchemes` declared but no 401-response anywhere.
- **New Lens proposed:** Lens 6 — Privacy / Data-Classification (orthogonal to Lens 1 Threat-Modeling).
- **Next Phase (B–E) handoff:** Round-2 Phase A surfaced 8 patterns at the TM/Standards-Compliance border (TM-A6, TM-A7, TM-A10, TM-A22, TM-A36, TM-A41, TM-A50, TM-A53). Phase B (Standards-Compliance mining) should re-cite + cross-confirm or re-classify these.
