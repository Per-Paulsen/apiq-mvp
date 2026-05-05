# Stage-A Mining Round-2 Phase B — Standards-Compliance (Lens 2)

> **Task #28** — Systematic RFC sweep for Standards-Compliance (Lens 2 of the meta-insights
> framework). Round-1 caught RFC 7807 (`problem+json`) and RFC 6648 (X-headers). Round-2
> walks the full HTTP/JSON/auth/URI standards stack and surfaces what mature linters miss
> because they pre-date the RFC or only check shallow conformance.
>
> **Scope discipline:** every pattern below must be detectable from an OpenAPI spec ALONE
> (no runtime traffic, no domain knowledge). Patterns that need server behaviour
> (e.g. "ETag value actually changes when resource changes") are listed under
> Out-of-scope. Patterns that need NLP (e.g. "WWW-Authenticate `realm` parameter is
> meaningful") are listed under Unsure (most likely LLM).
>
> **Severity-axis convention:** the column captures the verbatim RFC 2119 keyword(s)
> from the source RFC ("MUST", "MUST NOT", "SHOULD", "SHOULD NOT", "MAY", "RECOMMENDED").
> The `Severity-Suggestion` for apiq is in the Notes column, mapping `MUST → error`,
> `SHOULD → warn`, `MAY/RECOMMENDED → hint` unless cross-source weight (or false-positive
> risk) shifts it.
>
> **Authored:** 2026-05-05.

---

## Sources surveyed (RFCs + drafts)

| RFC# | Title | Year | Status | Key sections relevant to apiq |
|---|---|---|---|---|
| **RFC 9457** | Problem Details for HTTP APIs | 2023-07 | Proposed Standard (obsoletes 7807) | §3 Members of a Problem Details Object, §4 Defining New Problem Types, §4.2 Extension Members |
| **RFC 7807** | Problem Details for HTTP APIs | 2016-03 | Obsoleted by 9457; still widely cited | §3.1 Members, §3.2 Extension Members |
| **RFC 7230** | HTTP/1.1 Message Syntax and Routing | 2014-06 | Obsoleted by RFC 9112 (2022) | §3.2 Header Fields, §5 Request Target, §7 ABNF |
| **RFC 7231** | HTTP/1.1 Semantics and Content | 2014-06 | Obsoleted by RFC 9110 (2022) | §4 Methods, §5 Request Header Fields, §6 Response Status Codes, §7 Response Header Fields |
| **RFC 7232** | HTTP/1.1 Conditional Requests | 2014-06 | Obsoleted by RFC 9110 (2022) | §2 ETag/Last-Modified, §3 Preconditions, §4 Status Codes (304/412) |
| **RFC 7233** | HTTP/1.1 Range Requests | 2014-06 | Obsoleted by RFC 9110 (2022) | §2.3 Accept-Ranges, §3.1 Range, §4 Content-Range, §4.4 206 Partial Content |
| **RFC 7234** | HTTP/1.1 Caching | 2014-06 | Obsoleted by RFC 9111 (2022) | §5.2 Cache-Control, §5.4 Pragma (deprecated), §7 Vary |
| **RFC 7235** | HTTP/1.1 Authentication | 2014-06 | Obsoleted by RFC 9110 (2022) | §2.1 Challenges, §4.1 WWW-Authenticate, §4.2 Authorization, §4.4 Proxy-* |
| **RFC 9110** | HTTP Semantics | 2022-06 | Internet Standard (consolidates 7230/7231/7232/7233/7235) | All of the above, restated; status-code registry, methods registry |
| **RFC 9111** | HTTP Caching | 2022-06 | Internet Standard (replaces 7234) | Cache-Control directives registry |
| **RFC 9112** | HTTP/1.1 | 2022-06 | Internet Standard (replaces 7230) | Wire format only — out-of-scope for spec linting |
| **RFC 7240** | Prefer Header for HTTP | 2014-06 | Proposed Standard | §2 Prefer, §4.1 respond-async, §4.2 return, §4.3 wait, §3 Preference-Applied |
| **RFC 8941** | Structured Field Values for HTTP | 2021-02 | Proposed Standard | §3 Top-Level Types, §4 Item / List / Dictionary serialization |
| **RFC 5988** | Web Linking | 2010-10 | Obsoleted by RFC 8288 | (legacy reference) |
| **RFC 8288** | Web Linking | 2017-10 | Proposed Standard (obsoletes 5988) | §3 Link Header, §3.3 Target Attributes, §3.4 Context-IRI |
| **RFC 6750** | OAuth 2.0 Bearer Token Usage | 2012-10 | Proposed Standard | §2 Authenticated Requests, §2.3 URI Query Parameter (NOT RECOMMENDED), §3 WWW-Authenticate Response |
| **RFC 7519** | JSON Web Token (JWT) | 2015-05 | Proposed Standard | §4 JWT Claims, §10 IANA registries |
| **RFC 8725** | JWT Best Current Practices | 2020-02 | BCP 225 | §2.1 Algorithm Confusion, §3.1 Avoiding `none`, §3.2 Algorithm Restriction |
| **RFC 6749** | OAuth 2.0 Authorization Framework | 2012-10 | Proposed Standard | §1.3 Grants, §4 Obtaining Authorization, §10 Security Considerations |
| **RFC 6819** | OAuth 2.0 Threat Model | 2013-01 | Informational | §4.4.1.1 (implicit-flow concerns), §5.1.5 (don't leak in URLs) |
| **RFC 8252** | OAuth 2.0 for Native Apps | 2017-10 | BCP 212 | §8.4 Implicit-flow deprecation |
| **RFC 9700** | Best Current Practice for OAuth 2.0 Security | 2025-01 | BCP 240 | §2.1.2 Implicit/Password Grant deprecation, §4.1.5 Refresh Tokens |
| **RFC 3986** | URI Generic Syntax | 2005-01 | Internet Standard 66 | §3 Syntax Components, §3.3 Path, §3.4 Query, §6 Normalization, §2.5 Internationalized URIs |
| **RFC 6570** | URI Template | 2012-03 | Proposed Standard | §2.1 Literals, §2.3 Variables, §3.2 Expression Types — relevant for OpenAPI path templates |
| **JSON-Schema 2020-12** | JSON Schema (latest) | 2022-06 | IETF Internet-Draft (stable) | $id, $defs, $dynamicRef, prefixItems, deprecated, contentSchema |
| **JSON-Schema 2019-09** | JSON Schema | 2019-09 | IETF Internet-Draft | $defs (replaces definitions), unevaluatedProperties, dependentRequired, $anchor |
| **JSON-Schema draft-07** | JSON Schema | 2018-03 | IETF Internet-Draft | OpenAPI-3.0 default subset; if/then/else, contentEncoding/contentMediaType |
| **RFC 8259** | JSON Format | 2017-12 | Internet Standard 90 (replaces 7159) | §6 Numbers (no precision guarantee), §8.1 UTF-8, §9 Parsers (duplicate names UB) |
| **draft-ietf-httpapi-idempotency-key** | The Idempotency-Key HTTP Header | active draft | Internet-Draft (stable since 2021) | §2 Header Definition, §3 Lifecycle |
| **draft-ietf-httpapi-deprecation-header** | The Deprecation HTTP Header | active draft | Internet-Draft | §2 Deprecation, §3 Sunset (links to RFC 8594) |
| **RFC 8594** | The Sunset HTTP Header | 2019-05 | Informational | §2 Sunset, §3 Sunset & Deprecation, §4 The "sunset" Link Relation |
| **draft-ietf-httpapi-link-template** | Link Templates | active draft | Internet-Draft | (extension to RFC 8288) |
| **draft-ietf-httpapi-ratelimit-headers** | RateLimit Header Fields for HTTP | active draft (2024) | Internet-Draft (stabilized) | §3 RateLimit-Limit, §4 RateLimit-Remaining, §5 RateLimit-Reset, §6 RateLimit-Policy |
| **RFC 6585** | Additional HTTP Status Codes | 2012-04 | Proposed Standard | §4 429 Too Many Requests, §6 511 Network Authentication Required |
| **RFC 7396** | JSON Merge Patch | 2014-10 | Proposed Standard | §1 (`application/merge-patch+json`), §2 Algorithm |
| **RFC 6902** | JSON Patch | 2013-04 | Proposed Standard | §3 Document Structure, §4 Operations (`application/json-patch+json`) |
| **RFC 7578** | Returning Values from Forms: multipart/form-data | 2015-07 | Proposed Standard | §4.2 Content-Disposition |
| **RFC 6648** | Deprecating the "X-" Prefix | 2012-06 | BCP 178 | §3 Recommendations |
| **IANA Media Types Registry** | iana.org/assignments/media-types | living | Reference | top-level types `application`/`text`/etc., `+json` / `+xml` / `+yaml` / `+cbor` suffixes (RFC 6838 §4.2.8) |
| **RFC 6838** | Media Type Specifications and Registration Procedures | 2013-01 | BCP 13 | §3.2 Vendor Tree (`vnd.`), §3.3 Personal Tree (`prs.`), §4.2.8 Structured Suffixes |
| **RFC 7405** | Case-Sensitive String Support in ABNF | 2014-12 | Proposed Standard | (background only) |
| **RFC 5234** | ABNF | 2008-01 | Internet Standard 68 | (background for header grammars) |
| **RFC 9651** | Structured Field Values for HTTP (bis) | 2024-09 | Proposed Standard (replaces 8941) | (refresh of 8941; same patterns apply) |

---

## How "detection-feasibility" is graded

| Bucket | Meaning |
|---|---|
| **mech** | Pure spec-tree traversal + regex / allowlist. Spectral-rule-shaped. |
| **mech-stat** | Mechanical, but requires statistical aggregation (% threshold). Walker territory. |
| **heur** | Mechanical heuristic (keyword match in name / description). Will have false-positives but tunable. Severity should be `hint`. |
| **graph** | Requires building a graph / cross-operation analysis (path-template ↔ params, status-code ↔ header pairs, security-scheme ↔ challenge). Custom mechanic, not Spectral. |
| **LLM-only** | Needs semantic / NLP / domain reasoning. Skip from Stage A. |

---

## Patterns extracted

### Generic — TAKE INTO APIQ

These are patterns where (a) the source RFC uses normative language (MUST / SHOULD / MAY)
and (b) the constraint is detectable from the OpenAPI spec alone. Numbered RFC2-1 .. RFC2-N.
"Brainstorm-link" column flags whether the apiq brainstorm already has it; if so this is
corroboration / severity-upgrade evidence, not a new gap.

#### RFC 9457 / 7807 — Problem Details

| ID | Pattern | RFC# | RFC-Section | Multi-Lens-Tags | Severity-axis (verbatim) | Detection | Notes / Brainstorm-link |
|---|---|---|---|---|---|---|---|
| RFC2-1 | A response declared as `application/problem+json` MUST have an object schema with at least `type` (URI), `title` (string), `status` (integer 100-599) — `detail` (string) and `instance` (URI) SHOULD be present when meaningful | 9457 | §3.1 | Standards, Ergonomics | "type ... is the only REQUIRED member ... Other members (title, status, detail, and instance) ... SHOULD be supplied" (9457 §3.1) | mech (content-type → schema-shape) | Brainstorm K2 / SG-17 / DM-4. Today: hint. With 9457: upgrade `title`/`status` to warn (cross-source confirms). |
| RFC2-2 | Problem-Details `type` value MUST be a URI; the default `"about:blank"` is the only allowed non-resolvable value | 9457 | §3.1.1 | Standards | "When 'type' is not present, its value is assumed to be 'about:blank'" + URI-form is normative | mech (regex on `default` / `enum` / `example` of `type` property when schema is problem-shape) | New. False-positives only on free-form-string `type`. |
| RFC2-3 | Problem-Details `status` field, when present, MUST match the actual HTTP response status of the response declaring this problem | 9457 | §3.1.2 | Standards, Internal-Consistency | "the 'status' member ... MUST be the same as the HTTP response status code" (9457 §3.1.2) | graph (response-key 4xx/5xx ↔ problem-schema example/default for `status`) | Brainstorm-NEW. Highly mechanic when example present; otherwise unverifiable. |
| RFC2-4 | Problem-Details extension members MUST NOT redefine reserved names (`type`, `title`, `status`, `detail`, `instance`) with non-conforming types | 9457 | §3.2, §4.2 | Standards | "extension members MUST NOT have ... names already defined" (paraphrase) | mech (allOf + sibling-property check) | New. |
| RFC2-5 | When a problem-details schema is reused across many error responses, **the same registered `type` URI MUST identify the same problem-class** (no two error-classes sharing one URI) | 9457 | §4 | Standards, Ergonomics | "Each problem type SHOULD be registered under a unique URI" + "MUST have a single 'type' URI" | graph (cross-response unique-type-URI check) | New. Light-touch detection: collect every example/default of `type` URI across all problem-shape schemas → flag duplicates carrying distinct surface schemas. |
| RFC2-6 | RFC 7807 → 9457 migration: when `application/problem+xml` content-type is declared, recommend RFC 9457's preference for `+json` | 9457 | §3 (preface) | Standards, Evolution | (informative, not normative) | mech | hint only; many specs still ship +xml legitimately. |

#### RFC 7230 / 7231 / 9110 — HTTP Methods, Headers, Status Codes

| ID | Pattern | RFC# | RFC-Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-7 | HTTP method tokens MUST be case-sensitive uppercase as registered (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`) | 7231/9110 | §4.1 | Standards | "request method ... is case-sensitive" + IANA Method Registry | mech (path-item-key allowlist) | spectral:oas catches via OAS schema. Verify redundancy. Brainstorm B-SP-9. |
| RFC2-8 | GET / HEAD / OPTIONS / TRACE / DELETE SHOULD NOT define semantics for a request body | 7231/9110 | §4.3.1 / §4.3.5 / §4.3.7 | Standards, Ergonomics | "A payload within a GET/HEAD/DELETE/CONNECT request message has no defined semantics" (9110 §9.3.1 etc.) | mech | Brainstorm B1 + B-SP-2 + B-SP-3. Confirmed; severity = warn (DELETE) / error (GET) per cross-source. |
| RFC2-9 | Safe methods (GET, HEAD, OPTIONS) MUST NOT have side effects (per spec contract) | 7231/9110 | §4.2.1 | Standards, Threat | "MUST be safe" | LLM-only (intent inspection of summary/description) | OUT — moved to LLM. Listed for completeness. |
| RFC2-10 | Idempotent methods (PUT / DELETE / safe methods) MUST be idempotent semantically | 7231/9110 | §4.2.2 | Standards | "MUST be idempotent" | LLM-only | OUT — moved to LLM. |
| RFC2-11 | Header field names are case-insensitive but the registered canonical Title-Case form (e.g. `Content-Type`) SHOULD be used in spec authoring for clarity | 7230 / 9110 | §3.2 / §5.1 | Ergonomics | "Field names ... case-insensitive" + IANA registry conventions | mech-stat (Walker — apiq G8) | Brainstorm G8 / G-SP-4. |
| RFC2-12 | Standard request headers reserved by HTTP MUST NOT be redeclared as `parameters[in=header]` (`Authorization`, `Accept`, `Accept-*`, `Content-Type`, `Content-Length`, `Content-Encoding`, `Cookie`, `Host`, `User-Agent`, `Date`, `Connection`, `Upgrade`, `TE`, `Transfer-Encoding`, `Expect`, `Origin`, `Referer`, `Range`, `If-*`) | 7230 / 9110 | §5 | Standards, Ergonomics | "Spec authors SHOULD NOT shadow these" (de-facto from OAS-3 §4.7.13 + Microsoft Azure DO NOT) | mech (allowlist) | Brainstorm T4 / T-SP-10 / SG-46. Today partial — broaden. |
| RFC2-13 | When a 100-class response (specifically 100, 101, 102, 103) is declared, an `Upgrade` / `Connection` header pair SHOULD be documented (1xx are tied to upgrade/early-hints) | 7231 / 9110 | §6.2 | Standards | "MAY use ... to indicate that the request was received" | mech (status-code → header) | New. Niche. hint. |
| RFC2-14 | When a `405 Method Not Allowed` response is declared, an `Allow` response header MUST be sent (per RFC 7231 §6.5.5 / 9110 §15.5.6) | 7231 / 9110 | §6.5.5 / §15.5.6 | Standards | "The origin server MUST generate an Allow header field in a 405 response" | mech | New. error. |
| RFC2-15 | When a `426 Upgrade Required` response is declared, an `Upgrade` response header MUST be sent | 7231 / 9110 | §6.5.15 | Standards | "MUST send an Upgrade header field" | mech | New. error. Niche. |
| RFC2-16 | Status codes used in the spec MUST be members of the IANA HTTP Status Code Registry (no invented codes) | 7231 / 9110 | §6 + IANA registry | Standards | "Codes ... that are not assigned MUST NOT be used" | mech (allowlist) | Brainstorm T-SP-7 / SP-G-SPS-18 / Zalando. error. |
| RFC2-17 | A spec MUST NOT use 1xx codes as `responses` keys (per OpenAPI semantics — informational responses are not OpenAPI-modelable) | 7231 + OAS-3 | OAS-3 §4.7.13 | Standards | (OAS-spec bound) | mech | New. hint. |
| RFC2-18 | `Content-Length` SHOULD NOT be declared as a response header in spec (it is automatically computed by the server) | 7230 / 9110 | §3.3.2 / §8.6 | Hygiene | implicit; "is automatically generated" | mech | New. hint. |
| RFC2-19 | `Date` response header SHOULD NOT be declared (auto-generated by HTTP infrastructure per §7.1.1.2 / §6.6.1) | 7231 / 9110 | §7.1.1.2 / §6.6.1 | Hygiene | "An origin server MUST send a Date header field" — but the spec doesn't add value by re-declaring | mech | New. hint. |

#### RFC 7232 — Conditional Requests

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-20 | When `If-Match` request header parameter is declared, the operation MUST declare a `412 Precondition Failed` response | 7232 / 9110 | §3.1 / §13.1.1 | Standards | "MUST respond with a 412 ... if the precondition is false" | mech (param-presence → response-presence) | Brainstorm SG-32 / C-MIN-2. warn. |
| RFC2-21 | When `If-None-Match` request header parameter is declared on a GET/HEAD, the operation SHOULD declare a `304 Not Modified` response | 7232 / 9110 | §3.2 | Standards | "the origin server MUST respond with a 304 ... or with one of the resource representations" | mech | Brainstorm SG-32. warn. |
| RFC2-22 | When `If-None-Match` is declared on PUT/PATCH/DELETE, the operation MUST declare a `412 Precondition Failed` response | 7232 / 9110 | §3.2 | Standards | "MUST respond with the 412" | mech | New. warn. |
| RFC2-23 | When `If-Modified-Since` is declared on GET/HEAD, the operation SHOULD declare a `304 Not Modified` response | 7232 / 9110 | §3.3 | Standards | "the origin server MUST respond with a 304" (when matching) | mech | Brainstorm SG-32. hint. |
| RFC2-24 | When `If-Unmodified-Since` is declared on PUT/PATCH/DELETE, the operation MUST declare a `412 Precondition Failed` response | 7232 / 9110 | §3.4 | Standards | "MUST respond with the 412" | mech | New. warn. |
| RFC2-25 | A `304 Not Modified` response declaration MUST be paired with at least one of: an `ETag` response header, a `Last-Modified` response header, OR a request parameter from `If-None-Match` / `If-Modified-Since` / `If-Match` / `If-Unmodified-Since` | 7232 / 9110 | §4.1 | Standards | "the response MUST include the following header fields: Cache-Control, ... ETag and/or Content-Location, ... Expires" | mech (cross-op pair) | Brainstorm C10. Currently warn. Confirmed. |
| RFC2-26 | A `412 Precondition Failed` response declaration MUST be paired with at least one of: `If-Match`, `If-None-Match`, `If-Modified-Since`, `If-Unmodified-Since` parameter | 7232 / 9110 | §4.2 | Standards | "if-precondition-applies" | mech | Brainstorm C-MIN-2. warn. |
| RFC2-27 | An `ETag` response header value SHOULD use the form `"opaque"` (DQUOTE wrapped, optionally `W/` weak prefix) — when an example or pattern is given, it should match the ABNF | 7232 / 9110 | §2.3 | Standards | ABNF in §2.3 | mech (regex on example) | New. hint. |
| RFC2-28 | When operations on the same resource path declare ETag in some responses but not others, this is inconsistent and SHOULD be flagged | 7232 | §2.3 (interpretive) | Ergonomics, Internal-Consistency | (no normative MUST; consistency-driven) | graph (cross-op) | New. hint. |
| RFC2-29 | State-changing operations (PUT/PATCH/DELETE) on identifiable resources (path with `{id}`) SHOULD support `If-Match` + return `ETag` for safe concurrent edits | 7232 + Microsoft + Heroku | §2.3 / §3.1 | Standards, Ergonomics | "SHOULD support these directives" (Microsoft `condreq-return-etags` SHOULD; informative wording in 7232) | mech (heuristic: PUT/PATCH/DELETE on `{id}`-path) | Brainstorm SG-33. hint. |

#### RFC 7233 — Range Requests

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-30 | When a `Range` request parameter is declared, the operation MUST declare a `206 Partial Content` response | 7233 / 9110 | §4.1 | Standards | "the server SHOULD respond with a 206" | mech | New. hint. |
| RFC2-31 | When a `Range` parameter is declared, a `416 Range Not Satisfiable` response SHOULD also be declared | 7233 / 9110 | §4.4 / §15.5.17 | Standards | "the server SHOULD respond with a 416" (when no overlap) | mech | New. hint. |
| RFC2-32 | A `206 Partial Content` response MUST include a `Content-Range` response header | 7233 / 9110 | §4.1 / §14 | Standards | "MUST generate a Content-Range header field" | mech | New. warn. |
| RFC2-33 | An `Accept-Ranges` response header value, if declared, SHOULD be one of `bytes` / `none` / a registered range-unit | 7233 / 9110 | §2.3 / §14.3 | Standards | "registered as a range unit" — IANA registry | mech (allowlist) | New. hint. |
| RFC2-34 | When pagination via `Range` request-header is used (Heroku-style), `Content-Range` and `Next-Range` should be paired in the response — this is informative (RFC doesn't prescribe `Next-Range`) | 7233 + Heroku | §14 | Ergonomics | (informative) | mech | New. hint. Heroku-style only — keep low-prio. |

#### RFC 7234 / 9111 — Caching

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-35 | When a `Cache-Control` response header is declared, the parameter description (or example) MUST use directives from the IANA Cache-Control registry (`max-age`, `s-maxage`, `private`, `public`, `no-cache`, `no-store`, `must-revalidate`, `proxy-revalidate`, `immutable`, `stale-while-revalidate`, `stale-if-error`) | 7234 / 9111 | §5.2 | Standards | "directive-name ... MUST be ASCII registered" | mech (regex / allowlist on description) | Brainstorm Z-9 / SP-G-TD-1. hint. |
| RFC2-36 | `Pragma` request header is deprecated; `Pragma: no-cache` MUST be treated identically to `Cache-Control: no-cache` and SHOULD NOT be declared in new specs | 7234 / 9111 | §5.4 | Standards, Evolution | "deprecated ... MAY be ignored" | mech | New. hint. |
| RFC2-37 | A `Cache-Control` and `Expires` response header MUST NOT both appear (when both, `Cache-Control` wins) — for spec authoring, declaring both is a smell | 7234 / 9111 | §5.3 | Hygiene, Evolution | "If a response includes a Cache-Control field with the max-age directive ... a recipient MUST ignore the Expires field" | mech | Brainstorm Z-10 / SP-G-TD-2. hint. |
| RFC2-38 | `Vary` response header SHOULD be declared when the response varies on a request header (negotiation) | 7234 / 9111 | §7.1.4 | Standards, Ergonomics | "An origin server SHOULD send a Vary header field" | heur (presence of `Accept-*` / `Authorization` parameters with varying response-schemas → expect Vary) | New. hint. |
| RFC2-39 | When a 304 / 200 response on the same operation declares ETag, the headers SHOULD be consistent (same ETag-shape) | 7234 / 9111 | §4.3.4 | Internal-Consistency | (interpretive) | graph | New. hint. |

#### RFC 7235 / 9110 — Authentication

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-40 | A `401 Unauthorized` response MUST include a `WWW-Authenticate` response header documenting the challenge | 7235 / 9110 | §3.1 / §15.5.2 | Standards, Threat | "MUST send one or more challenges with a 401 ... WWW-Authenticate header" | mech (status-code → header pairing) | New. **error**. Cross-source: brainstorm K1 partial. |
| RFC2-41 | A `407 Proxy Authentication Required` response MUST include a `Proxy-Authenticate` response header | 7235 / 9110 | §3.2 / §15.5.8 | Standards | "MUST contain ... Proxy-Authenticate header" | mech | New. error. Niche. |
| RFC2-42 | The auth-scheme name in `WWW-Authenticate` SHOULD be one of registered IANA HTTP Authentication Scheme Registry values (`Basic`, `Bearer`, `Digest`, `Negotiate`, `OAuth`, `Scram-Sha-1`, `Scram-Sha-256`, `Mutual`, `vapid`, `Concealed`) | 7235 / 9110 | §2.1 + IANA | Standards | "registered scheme name" | mech (regex / allowlist on header description / example) | New. hint. |
| RFC2-43 | A `securitySchemes` entry of `type: http, scheme: basic` is RFC 7617's HTTP Basic — flag as insecure unless paired with HTTPS-only servers (already covered by Y-4) | 7617 / 7235 | (RFC 7617 §2) | Threat, Standards | "Basic ... transmits passwords in clear text" | mech | Brainstorm F (siehe §1 cross-source). error. |
| RFC2-44 | A `securitySchemes` entry of `type: http, scheme: digest` is RFC 7616 / 7235 — flag as outdated when used alone (recommend OAuth2/Bearer) | 7616 / 7235 | (informative) | Threat, Evolution | (informative) | mech | New. hint. |
| RFC2-45 | A `securitySchemes` entry of `type: apiKey, in: query` SHOULD be flagged because query-string credentials leak to logs/referrers (covered by Y-2/Y-3) | 6750 §2.3 (analogous) | (general security guidance) | Threat | "NOT RECOMMENDED" (6750 §2.3) — extends by analogy | mech | Brainstorm Y-2/Y-3 covered. error. |

#### RFC 7240 — Prefer Header

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-46 | When a `Prefer` request-header parameter is declared, a `Preference-Applied` response header SHOULD be declared (so client can know preference was honoured) | 7240 | §3 | Standards, Ergonomics | "SHOULD include the Preference-Applied response header" | mech (param ↔ header) | New. hint. |
| RFC2-47 | `Prefer` header values, when documented in description / example, MUST use the registered preference-tokens (`respond-async`, `return=minimal`, `return=representation`, `wait=N`, `handling=lenient`, `handling=strict`) | 7240 | §4 + IANA registry | Standards | "preferences ... registered" | mech (regex on description) | New. hint. |
| RFC2-48 | `Prefer: respond-async` MUST be paired with `202 Accepted` response declaration | 7240 | §4.1 | Standards | "the server MUST process the request asynchronously and return a 202" | mech | New. warn. |
| RFC2-49 | `Prefer: return=representation` on POST/PUT/PATCH MUST be paired with the resource representation in the response body | 7240 | §4.2 | Standards | "the server SHOULD return the representation" | LLM-only (semantic) | OUT — needs reasoning about what "representation" means. |

#### RFC 8941 / 9651 — Structured Field Values

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-50 | When a custom HTTP header is declared as Structured-Field (Item / List / Dictionary), the example MUST conform to the SFV ABNF (no surrounding whitespace, ASCII-only, comma-separated lists, semicolon-separated parameters) | 8941 / 9651 | §3 | Standards | "structured-field values MUST conform" | mech (parser; AJV-class) | New. hint. Niche but rising — used by `Cache-Status`, `Accept-CH`, RateLimit, etc. |
| RFC2-51 | New custom headers SHOULD use Structured Field Values (per RFC 9651 BCP guidance) when they carry list/dict semantics | 9651 | §1.2 (informative) | Evolution, Ergonomics | (informative; "RECOMMENDED for new fields") | LLM-only (intent) | OUT — can't tell mechanically what the header is meant to carry. |

#### RFC 8288 (Web Linking) + RFC 5988

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-52 | When a `Link` response header is declared with `rel=` documented, the rel-token MUST be either an IANA-registered link-relation type OR a URI (extension relation) | 8288 | §2.1 | Standards | "MUST be either an IANA-registered relation type ... OR a URI" | mech (allowlist + URI-shape) | New. hint. |
| RFC2-53 | Pagination via `Link` header requires at least `rel="next"` to be documented when the result-set may be truncated | 8288 + RFC 5988 | §3 | Standards, Ergonomics | "rel=next" registered + "the response SHOULD" | mech (presence) | Brainstorm E5 / SG-15. hint. |
| RFC2-54 | `Link` response-header media-type when used with anchor MUST include `anchor` parameter only with absolute IRI | 8288 | §3.2 | Standards | "MUST be an absolute URI" | mech | New. hint. Niche. |
| RFC2-55 | `Link` rel-tokens are case-insensitive — flag mixed casing within one Link header description (`rel="Next"` vs `rel="next"` in same example) | 8288 | §3.3 | Hygiene | "case-insensitive" | mech | New. hint. |

#### RFC 6750 / 7519 / 8725 — OAuth 2.0 Bearer + JWT BCP

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-56 | Bearer tokens MUST NOT be sent in URI query parameters in production APIs (security: leaks to logs / referrers) | 6750 | §2.3 | Threat, Standards | "URI Query Parameter ... NOT RECOMMENDED ... clients SHOULD NOT use" | mech (param-name allowlist on `in: query`) | Brainstorm Y-3 covered. error. |
| RFC2-57 | A `securitySchemes` entry of `type: http, scheme: bearer` SHOULD declare `bearerFormat` (e.g. `JWT`) for client-side parsing assistance | 6750 + OAS-3 | §3 / OAS-3 §4.7.27 | Ergonomics | (informative) | mech | Brainstorm F6. hint. |
| RFC2-58 | A `securitySchemes` entry whose `bearerFormat: JWT` SHOULD have a description mentioning the algorithm restriction (RFC 8725 BCP §3.2) and `none`-rejection (RFC 8725 §3.1) | 8725 | §3.1 / §3.2 | Threat | "MUST avoid the 'none' algorithm" / "implementations MUST validate algorithm" (BCP-225) | heur (description keyword scan) | Brainstorm F-SP-4 / Y-8. warn. |
| RFC2-59 | A 401 response from a Bearer-protected operation SHOULD have `WWW-Authenticate: Bearer realm="..."` documented | 6750 | §3 | Standards | "the resource server MUST include the HTTP 'WWW-Authenticate' response header field" | mech (security-scheme bearer + 401 → WWW-Authenticate header presence) | New. warn. Cross-tags with RFC2-40. |

#### RFC 6749 / 9700 — OAuth 2.0 Framework + BCP

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-60 | OAuth2 `implicit` flow declarations SHOULD be flagged — deprecated by RFC 9700 §2.1.2 (BCP 240, 2025) | 9700 | §2.1.2 | Threat, Evolution | "Clients MUST NOT use the OAuth Implicit grant" (RFC 9700 BCP) | mech | Brainstorm F-SP-3 / Y-7. error. |
| RFC2-61 | OAuth2 `password` (Resource Owner Password Credentials) flow declarations SHOULD be flagged — deprecated by RFC 9700 §2.1.2 | 9700 | §2.1.2 | Threat, Evolution | "Clients MUST NOT use the resource-owner-password-credentials grant" | mech | Brainstorm F-SP-3 / Y-7. error. |
| RFC2-62 | OAuth2 `authorizationUrl` / `tokenUrl` / `refreshUrl` MUST use `https://` | 6749 | §3.1 | Threat | "MUST utilize TLS" (6749 §3.1) | mech | Brainstorm F-SP-1 / Y-5. error. |
| RFC2-63 | OAuth2 `authorizationCode` flow SHOULD declare a `refreshUrl` (token-rotation per RFC 9700 §4.1.5) | 9700 | §4.1.5 | Threat, Evolution | "RECOMMENDED" | mech | Brainstorm F-SP-2 / Y-6. hint. |
| RFC2-64 | OAuth2 `clientCredentials` flow with broad / no `scopes` defined is a privilege-escalation smell (RFC 9700 §2.1) | 9700 | §2.1 + 6749 §3.3 | Threat | "Scopes ... SHOULD be granular" | mech (scope-empty check) | New. hint. |
| RFC2-65 | OAuth2 `scopes` map MUST have `scope-name → human-readable description` (OAS-3 schema requirement, codifies 6749 §3.3) | 6749 | §3.3 | Standards, Ergonomics | (OAS schema MUST) | mech | New. warn. |

#### RFC 3986 — URI Generic Syntax

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-66 | Path segments in `paths` keys MUST be percent-encoded for non-unreserved characters; raw spaces / `?` / `#` / `[` / `]` are invalid | 3986 | §3.3 | Standards | "MUST be percent-encoded ... unreserved-only" | mech (regex per segment) | Brainstorm partial (SP-G-AZ-26). error. |
| RFC2-67 | Path segments SHOULD use only unreserved (`A-Za-z0-9-._~`) plus sub-delims allowed in segments (`!$&'()*+,;=:@`) | 3986 | §3.3 | Standards | "segment ABNF" | mech | Brainstorm S-SP-9. hint. |
| RFC2-68 | A `path` MUST NOT contain a query-string `?` — query goes in `parameters[in=query]` | 3986 | §3.4 | Standards | "ABNF: path MUST NOT contain ?" | mech | Brainstorm S-SP-7. warn. |
| RFC2-69 | A `path` MUST NOT contain a fragment `#` (non-routable; only client-side) | 3986 | §3.5 | Standards | "fragment is part of the URI but only on the client side" | mech | New. error. |
| RFC2-70 | URI-Template variables (`{name}`) in OpenAPI paths follow RFC 6570 Level-1 expansion only (`{var}`); `{+var}` / `{#var}` / `{?var}` / `{var,var2}` are NOT valid in OAS path-template grammar | 6570 + OAS-3 | §3.2 (RFC 6570) + OAS-3 §4.8.10 | Standards | (OAS-spec bound) | mech (regex) | New. error. |
| RFC2-71 | Server-URL host MUST be lowercase per RFC 3986 §3.2.2 normalisation (case-insensitive but lowercase canonical) | 3986 | §3.2.2 / §6.2.2.1 | Hygiene, Standards | "the host subcomponent is case-insensitive ... lowercase normalization" | mech | Brainstorm P-SP-3. hint. |
| RFC2-72 | Server-URL scheme MUST be lowercase per RFC 3986 §3.1 normalisation | 3986 | §3.1 / §6.2.2.1 | Hygiene, Standards | "case-insensitive ... lowercase normalization" | mech | New. hint. |
| RFC2-73 | Server-URL paths SHOULD be normalized (no `.` / `..` / multiple `//`) | 3986 | §6.2.2.3 | Hygiene, Standards | "syntax-based normalization" | mech | New. hint. Brainstorm S-SP-1 covers `//`. |
| RFC2-74 | Server-URL with userinfo (`https://user:pass@host`) MUST NOT appear (deprecated by RFC 3986 §3.2.1 + security) | 3986 | §3.2.1 | Threat, Hygiene | "Use of the format 'user:password' ... is deprecated" | mech | New. error. |

#### RFC 6838 / IANA Media Types

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-75 | A custom JSON-based media-type used in `content` keys SHOULD use the `+json` structured suffix (`application/vnd.example.foo+json`) per RFC 6838 §4.2.8 | 6838 | §4.2.8 | Standards, Ergonomics | "type SHOULD use the structured suffix" | mech (regex on content-type keys) | New. hint. |
| RFC2-76 | A vendor-specific media-type SHOULD use the `vnd.` tree (e.g. `application/vnd.example+json`) per RFC 6838 §3.2 | 6838 | §3.2 | Standards | "vendor-specific media types ... SHOULD be registered" | mech | New. hint. |
| RFC2-77 | A `personal/prs.` tree media-type in production specs is a smell (typically test/dev) | 6838 | §3.3 | Hygiene | (informative) | mech | New. hint. |
| RFC2-78 | The wildcard media-type `*/*` SHOULD NOT appear in `content` keys (per OpenAPI semantics — meaningless because content is keyed by media-type) | 6838 + OAS-3 | (OAS-spec interpretive) | Hygiene | (informative) | mech | Brainstorm L-MIN-2. warn. |
| RFC2-79 | Media-type top-level type MUST be one of the registered values (`application`, `audio`, `font`, `example`, `image`, `message`, `model`, `multipart`, `text`, `video`) | 6838 + IANA registry | §4.2 | Standards | (IANA registry) | mech (allowlist) | New. error. |
| RFC2-80 | Charset parameter on `application/json` media-type SHOULD NOT be declared (`application/json; charset=utf-8` is redundant — JSON is UTF-8 by RFC 8259 §8.1) | 8259 | §8.1 | Hygiene, Standards | "MUST be encoded using UTF-8" | mech | New. hint. |

#### RFC 8259 — JSON

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-81 | JSON Numbers have no IEEE-754 precision guarantee (RFC 8259 §6) — int64 properties SHOULD be string-encoded for cross-language safety | 8259 | §6 | Standards, Ergonomics | "implementations ... SHOULD avoid representations beyond IEEE-754 binary64" | mech (`format: int64` schema check) | Brainstorm SG-24 / J-SG-2. hint. |
| RFC2-82 | JSON object members with the same name lead to undefined behaviour (RFC 8259 §4 / §9) — `properties` keys MUST be unique within a schema | 8259 | §4 / §9 | Standards | "names within an object SHOULD be unique" | mech (OpenAPI parser-level catch — verify) | New. error. |
| RFC2-83 | JSON does not allow trailing commas / comments / single-quoted strings — `default` / `example` values declared as raw JSON-strings in description SHOULD parse as strict JSON | 8259 | §2 / §6 / §7 | Standards | "strict JSON" | heur (description-prose parser) | New. hint. |

#### JSON-Schema (2020-12, 2019-09, draft-07)

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-84 | OpenAPI 3.0 uses a JSON-Schema-draft-04-derived subset; `$id`, `$defs`, `$dynamicRef`, `prefixItems`, `unevaluatedProperties`, `unevaluatedItems`, `dependentRequired`, `dependentSchemas`, `contentSchema`, `if/then/else` are NOT supported | OAS-3.0 spec (§4.7.24) + JSON-Schema | (OAS-3.0 binding) | Standards, Evolution | (informative; "subset of JSON Schema") | mech (keyword-allowlist per OAS-version) | Brainstorm X-MIN-1. error when 3.0 + draft-2020-12-keyword. |
| RFC2-85 | OpenAPI 3.1 declares `jsonSchemaDialect` of `2020-12` by default; if a spec uses 3.1 keywords (`$dynamicRef`, `prefixItems`, `unevaluatedProperties`) → require explicit `jsonSchemaDialect` declaration | OAS-3.1 spec (§4.7.1) | (OAS-3.1 §4.7.1) | Standards | (OAS-spec bound) | mech | New. hint. |
| RFC2-86 | `definitions` (draft-04) → `$defs` (2019-09+) — OpenAPI uses `components.schemas` instead; `definitions` keyword in a sub-schema is a porting smell | JSON-Schema 2019-09 + OAS-3 | (informative) | Evolution, Standards | "$defs replaces definitions" | mech | New. hint. |
| RFC2-87 | `id` (draft-04) → `$id` (draft-06+) — `id` keyword in OAS-3 schemas is a porting smell | JSON-Schema draft-06 | (informative) | Evolution | "$id replaces id" | mech | New. hint. |
| RFC2-88 | Boolean form of `exclusiveMinimum` / `exclusiveMaximum` (draft-04) is invalid in 2019-09+ — flag in OAS 3.1 | JSON-Schema 2019-09+ + OAS-3.1 | (informative) | Evolution, Standards | (changelog) | mech | Brainstorm X4 covers. |
| RFC2-89 | `contentEncoding` / `contentMediaType` (draft-07) declared on `string` schemas in OAS-3.0 are mostly ignored by validators — flag as "doc-only" smell | JSON-Schema draft-07 + OAS-3.0 | §8 (draft-07) | Standards, Evolution | (informative) | mech | New. hint. |

#### IETF httpapi WG drafts (active)

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-90 | `Idempotency-Key` request-header on POST-creation operations (RFC-draft `httpapi-idempotency-key`) — generic spec-agnostic pattern | draft-ietf-httpapi-idempotency-key | §2 | Standards, Threat | "MAY include ... idempotency token" (BCP-aspiring) | mech (POST + non-search-path → param) | Brainstorm Y-25 (reframe in §4). hint. |
| RFC2-91 | `Deprecation` response-header (RFC-draft `httpapi-deprecation-header`) SHOULD be paired with a `Sunset` response-header (RFC 8594 §3) — declare both or neither | draft + RFC 8594 | §3 (draft) / §3 (RFC 8594) | Evolution, Standards | "SHOULD be paired" (informative) | mech | New. hint. Cross-tag with brainstorm H4. |
| RFC2-92 | `Sunset` HTTP-header value MUST be an HTTP-date per RFC 8594 §2 | RFC 8594 | §2 | Standards | "an HTTP-date" | mech (regex on example) | New. hint. |
| RFC2-93 | `RateLimit` / `RateLimit-Policy` headers (draft `httpapi-ratelimit-headers`, stabilizing 2024) — SHOULD be declared on operations that may rate-limit | draft-ietf-httpapi-ratelimit-headers | §3 / §4 / §5 / §6 | Standards | "RECOMMENDED ... informational" | mech | Brainstorm C-SP-1 partial. hint. |
| RFC2-94 | When a 429 response is declared, AT LEAST ONE of the rate-limit-signaling headers SHOULD be declared: `Retry-After` (RFC 7231 §7.1.3 / 9110 §10.2.3) OR `RateLimit-*` (draft) | RFC 7231 §7.1.3 + draft-ratelimit | (cross-RFC) | Standards, Threat | "Servers send the Retry-After header" (7231) | mech | Brainstorm C9 / SG-31. error (per cross-source upgrade). |
| RFC2-95 | When a `Retry-After` response-header is declared, the value-grammar MUST be HTTP-date OR delta-seconds | 7231 / 9110 | §7.1.3 / §10.2.3 | Standards | "HTTP-date / delta-seconds" | mech (regex on example) | New. hint. |
| RFC2-96 | A `503 Service Unavailable` response SHOULD declare `Retry-After` response header | 7231 / 9110 | §6.6.4 / §15.6.4 | Standards | "the response SHOULD include a Retry-After" | mech | New. hint. |

#### RFC 7396 / 6902 — PATCH

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-97 | PATCH operations MUST declare `application/merge-patch+json` (RFC 7396) OR `application/json-patch+json` (RFC 6902) OR a documented merge-semantics — bare `application/json` PATCH is ambiguous | 7396 + 6902 | §1 / §3 | Standards, Ergonomics | "MUST be the patch document" | mech | Brainstorm L-SP-2 / SG-34. warn. |
| RFC2-98 | PATCH with `application/merge-patch+json` request: properties MUST NOT be marked `required` (because RFC 7396 semantics is partial-update) | 7396 | §2 | Standards | "fields ... not present ... is to be retained" | mech | Brainstorm B-MIN-3. warn. |
| RFC2-99 | PATCH with `application/json-patch+json` request: schema MUST be an array of operation objects per RFC 6902 §3 (each with `op` enum and `path`) | 6902 | §3 / §4 | Standards | "MUST be an array" + "each ... MUST have op + path" | mech | New. warn. |

#### RFC 7578 — multipart/form-data

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-100 | When `multipart/form-data` is declared, the schema SHOULD be `type: object` with `properties` mapping form-field-names → typed values; bare `type: string` smells like a misconfiguration | 7578 | §4.2 | Standards | "Each part is named" | mech | New. hint. |
| RFC2-101 | A binary file part in `multipart/form-data` SHOULD use OAS-3 `format: binary` (3.0) or `contentEncoding: binary` (3.1) | 7578 + OAS-3 | (OAS-spec bound) | Standards | (OAS-spec MUST) | mech | New. hint. |

#### RFC 6648 — X-headers

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-102 | Custom headers SHOULD NOT use `X-` prefix per RFC 6648 (deprecated since 2012) | 6648 | §3 | Standards, Ergonomics | "SHOULD NOT prefix their parameter names with 'X-'" | mech | Already in §1 cross-source. warn. |

#### RFC 6585 — Additional Status Codes

| ID | Pattern | RFC# | Section | Multi-Lens-Tags | Severity-axis | Detection | Notes |
|---|---|---|---|---|---|---|---|
| RFC2-103 | A `428 Precondition Required` response is the recommended way to require conditional-request use — declaring it gives clients an explicit signal | 6585 | §3 | Standards, Threat | "SHOULD be returned" | mech | New. hint. |
| RFC2-104 | A `429 Too Many Requests` response (RFC 6585 §4) — see RFC2-94. | 6585 | §4 | Standards, Threat | "the server can return ... 429" | mech | Already covered. |
| RFC2-105 | A `511 Network Authentication Required` response (RFC 6585 §6) — niche; declaring it for captive-portal-like flows is OK | 6585 | §6 | Standards | "the server returns ... 511" | mech | New. hint. Niche. |

---

### Already-in-apiq-brainstorm (RFC sweep confirms)

These brainstorm items are corroborated verbatim by the RFCs surveyed; the cross-source
weight from this Round-2 phase strengthens their severity and authority.

| Brainstorm ID | RFC source(s) confirming | Notes |
|---|---|---|
| C9 (429 → Retry-After) | RFC 6585 §4 + RFC 7231 §7.1.3 / 9110 §10.2.3 + draft-ratelimit | **error** confirmed (severity-upgrade from current `warn`) |
| C10 (304 needs validators) | RFC 7232 §4.1 / 9110 §15.4.5 | warn confirmed |
| C-MIN-1 (ETag with If-Match/None-Match) | RFC 7232 §3.1 / §3.2 / 9110 §13.1 | warn confirmed |
| C-MIN-2 (412 needs precondition param) | RFC 7232 §4.2 / 9110 §15.5.13 | warn confirmed |
| K1 (error-schema type/code+message) | RFC 7807 §3.1 / 9457 §3.1 | warn confirmed |
| K2 (problem+json) | RFC 7807 + 9457 | **upgrade hint→warn** (5+ Sources in §1 already, RFC sweep confirms) |
| F-SP-1 (OAuth2 tokenUrl HTTPS) | RFC 6749 §3.1 | error confirmed |
| F-SP-2 (refreshUrl recommended) | RFC 9700 §4.1.5 (BCP 240) | warn confirmed (formerly stated as Team-D speculation; now BCP) |
| F-SP-3 (implicit/password forbidden) | RFC 9700 §2.1.2 (BCP 240) — **post-2025 normative** | **error** confirmed; brainstorm Y-7 to-error |
| F-SP-4 (JWT bearerFormat RFC 8725) | RFC 8725 §3.1 / §3.2 (BCP 225) | warn confirmed |
| F6 (bearerFormat declared) | RFC 6750 §3 + OAS-3 §4.7.27 | hint confirmed |
| G8 (header-naming hyphenated-pascal-case) | RFC 7230 §3.2 + IANA registry | warn confirmed |
| H1 / S4 (versioning mixed) | (no direct RFC; consensus pattern) | warn confirmed |
| L-SP-2 (PATCH content-type) | RFC 7396 + RFC 6902 | warn confirmed |
| L-MIN-2 (`*/*` content-type) | RFC 6838 + OAS-3 interpretive | warn confirmed |
| M9 (string maxLength) | OWASP-derived; RFC-orthogonal | warn confirmed |
| M10 (integer min/max) | OWASP-derived; RFC-orthogonal | warn→hint confirmed |
| S-SP-9 (path chars) | RFC 3986 §3.3 | hint confirmed; promote to warn for spec-grammar-violations |
| S-SP-1 (path empty segments `//`) | RFC 3986 §3.3 + §6.2.2.3 | error confirmed |
| S-SP-7 (no `?` in path) | RFC 3986 §3.4 | warn confirmed |
| S-SP-6 (file-extensions) | (no direct RFC; SG / Microsoft) | warn confirmed |
| Y-1 (numeric IDs in paths) | (OWASP-derived; not RFC) | hint confirmed |
| Y-2 / Y-3 (creds-in-URL) | RFC 6750 §2.3 + RFC 3986 §3.2.1 | error confirmed |
| Y-4 (HTTP-Basic) | RFC 7617 §2 (insecure on plain HTTP) | error confirmed (when paired with non-HTTPS server) |
| Y-25 (Idempotency-Key) | draft-ietf-httpapi-idempotency-key | hint confirmed |
| X-MIN-1 (3.0 + 3.1-only-keywords) | OAS-3.0 + JSON-Schema 2020-12 binding | error confirmed |
| Z-9 (Cache-Control description directive-allowlist) | RFC 7234 §5.2 / 9111 §5.2 | hint confirmed |
| Z-10 (Cache-Control + Expires together) | RFC 7234 §5.3 | hint confirmed |

**Summary:** ~28 brainstorm items receive RFC-anchored confirmation. Severity-upgrades:
- C9 (429 Retry-After): warn → **error**
- F-SP-3 / Y-7 (implicit/password): warn → **error** (RFC 9700 BCP-240, 2025-01)

---

### Out-of-scope

Patterns surfaced by the surveyed RFCs that **cannot** be detected from a spec alone.
Documented for orchestrator transparency; default disposition: skip (Stage A) and
defer to runtime / LLM where applicable.

| ID | Pattern | RFC | Why-skip |
|---|---|---|---|
| OOS-1 | "Safe methods MUST NOT have observable side effects" | 7231 §4.2.1 / 9110 §9.2.1 | Semantic — only LLM can read summary/description and judge intent |
| OOS-2 | "Idempotent methods MUST be idempotent" | 7231 §4.2.2 / 9110 §9.2.2 | Same — semantic, runtime |
| OOS-3 | "ETag value MUST change when entity-body changes" | 7232 §2.3 / 9110 §8.8 | Runtime contract; spec can only declare ETag-presence |
| OOS-4 | "Last-Modified MUST be HTTP-date" of the actual entity | 7232 §2.2 / 9110 §8.8 | Runtime |
| OOS-5 | "Cache-Control directives MUST be honoured" | 7234 / 9111 | Runtime |
| OOS-6 | "WWW-Authenticate MUST be valid challenge" (parsed for `realm`, `scope`, etc.) | 7235 §4.1 / 9110 §11.6.1 | Spec only declares header presence; semantic content parsing requires NLP |
| OOS-7 | "JWT signature algorithm MUST be acceptable" | RFC 7519 + 8725 | Runtime; spec only declares bearerFormat |
| OOS-8 | "OAuth2 access token MUST be of sufficient entropy" | 6749 §10.10 | Runtime |
| OOS-9 | "Range-Request server actually supports byte-ranges" | 7233 §2.3 | Runtime |
| OOS-10 | "Prefer header preferences MUST be applied or declined" | 7240 §2 | Runtime |
| OOS-11 | "Content-Type charset normalisation" | RFC 6838 §4.2.1 | Runtime |
| OOS-12 | "Link header `anchor` MUST resolve to a known representation" | RFC 8288 §3.2 | Cross-document semantic |
| OOS-13 | "URI normalisation MUST be applied before matching" | 3986 §6 | Runtime / proxy |
| OOS-14 | "JSON parsing MUST be UTF-8 strict" | 8259 §8.1 | Runtime |
| OOS-15 | "Sunset / Deprecation header value MUST be honoured by client" | RFC 8594 / draft-deprecation | Runtime / client-side |
| OOS-16 | "RateLimit-Reset values MUST reflect actual quota" | draft-ratelimit | Runtime |
| OOS-17 | "Retry-After value MUST reflect actual back-off" | RFC 7231 §7.1.3 | Runtime |

---

### Unsure

Patterns that are **borderline** between mechanic detection and LLM. Default
disposition: defer to LLM unless a dominant cross-source signal pulls them into
Stage A. Documented for orchestrator decision.

| ID | Pattern | RFC | Why-unsure |
|---|---|---|---|
| UNS-1 | RFC 9457 `type` URI must be **resolvable** to a problem-class document | 9457 §4 | "SHOULD" but resolvability requires HTTP-fetch; would gate on online check (apiq's `External-Reference-Validation` §11 — already optional). Stage A keep as `hint` if presence-check only. |
| UNS-2 | Operation-summary uses an HTTP-method verb that contradicts the actual method (e.g. `summary: "Get user"` on `DELETE /users/{id}`) | 7231 / 9110 | Semantic; LL-9 already classified LLM-only. Out. |
| UNS-3 | A `Prefer: return=representation` request requires a non-empty response body | 7240 §4.2 | "SHOULD return the representation" — but mechanically: response body presence is detectable. Borderline mech. Keep as hint. |
| UNS-4 | OAS-3 `securitySchemes.apiKey` with `in: cookie` should require `Set-Cookie` documentation | OAS-3 + RFC 6265 | OAS-spec doesn't require it; cross-source weight low. Defer. |
| UNS-5 | Open-vs-closed enum extensibility (`x-ms-enum.modelAsString: true` on Azure-specs) | (vendor-extension) | Vendor-specific; Stage-A keeps spec-agnostic. Out. |
| UNS-6 | RFC 7240 `Preference-Applied` value matches the `Prefer` request | 7240 §3 | Runtime-only matching; semantic. Out. |
| UNS-7 | Link-header `rel` token semantics: `rel="alternate"` requires alternate representation availability | RFC 8288 + IANA Link Relations | LLM judgment about "alternate" intent. Out. |
| UNS-8 | OAuth2 `scopes` map names match resource-naming-conventions | 6749 §3.3 | Convention-driven; LLM-better. Out. |
| UNS-9 | Web-Linking `Link` header on paginated GET should include both `next` and `prev` rels | RFC 8288 + JSON:API | Convention; mechanic-detectable but opinion-loaded. Hint, off-by-default. |
| UNS-10 | Content-negotiation `Vary` header SHOULD list the request-headers the response varies on | 7234 §7 / 9111 §4.1 | Mechanic-detectable but heuristic ("does this op declare multiple Accept-Variants?"). Hint. |
| UNS-11 | `Content-Type` charset MUST be `utf-8` for `application/json` (per RFC 8259 §8.1) — spec rarely declares charset | 6838 + 8259 | RFC2-80 covers; whether a `; charset=utf-8` declaration is "wrong" or "redundant" is interpretation-dependent. Keep as hint. |
| UNS-12 | RFC 8941 / 9651 Structured-Field validation in custom-header-examples | 8941 / 9651 | Requires SFV-parser; high-effort, low-frequency-of-occurrence in 2026 specs. Defer to v2 mining. |

---

### Meta-Observations

**1. Three lenses share the same RFC**

A single RFC can land patterns into multiple Lenses simultaneously:
- RFC 7235 (Authentication) is **Standards** AND **Threat** (security challenge required).
- RFC 6750 §2.3 (Bearer in URL) is **Standards** AND **Threat** (NOT RECOMMENDED for security reasons).
- RFC 6648 (X-headers) is **Standards** AND **Ergonomics** (consumer-friction).
- RFC 7232 (Conditional) is **Standards** AND **Performance / Cost** (caching efficiency).

This validates the meta-insights "5 Lenses overlap, not partition" hypothesis (Open Question #1).
Multi-Lens-Tags column was filled deliberately to surface this.

**2. New Lens candidate — "Performance/Cost"**

Round-1 + Phase-A focused on Threat / Standards / Evolution / Ergonomics / Style. Several RFC-2 patterns
(RFC 7232 conditional / RFC 7234 caching / RFC 9111 Cache-Control / RFC 7233 Range / draft-ratelimit) cluster
around a Lens that doesn't fit cleanly into any of the existing 5: **"Operations / Performance / Cost"** —
i.e. patterns whose violation costs the operator (more bandwidth, less cache-hit-rate, no rate-limit-signaling-to-client).

Recommendation: add **Lens 6 — Operations** to the framework. Its symptoms cluster:
- Cache-Control absent on cacheable GET → bandwidth cost
- ETag/Last-Modified absent → no conditional-request support → re-transmission cost
- Range-headers absent on large-object GETs → no partial-fetch
- RateLimit-headers absent → clients hammer naively
- 503 without Retry-After → exponential-back-off-storm risk

Many of these RFCs appear in apiq's stakeholder-axis ("Operations / SRE") in the meta-insights doc but
weren't promoted to a Lens. RFC-sweep makes the case that they should be — the cluster is real.

**3. RFC obsoletion-chain matters for severity sourcing**

Several patterns' severity changed because the obsoleting RFC tightened wording:
- 7807 → 9457 (2023): kept the same MUST/SHOULD on `type`; tightened `status` MUST-match; extension members rules clarified.
- 7230/7231/7232/7233/7235 → 9110/9111/9112 (2022): consolidated; some "SHOULD" → "MUST" (e.g. 405 Allow-header was MUST in both).
- 6749 → 9700 BCP-240 (2025-01): **implicit and password grants moved from "deprecated guidance" to BCP MUST-NOT.** This is a 2025 hardening that severity-upgrades F-SP-3 / Y-7 from `warn` → `error`. apiq's brainstorm pre-dates the BCP and should be updated.

When citing severity in apiq's rule-metadata, **cite the most recent RFC**, not the obsolete one — but document
the obsoletion chain so reviewers can trace.

**4. Active drafts (httpapi WG) are unusually stable**

Three drafts surveyed are in IETF Last-Call territory and are likely to RFC-publish soon:
- `httpapi-idempotency-key` (since 2021)
- `httpapi-deprecation-header` (paired with RFC 8594 Sunset)
- `httpapi-ratelimit-headers` (stabilized 2024)

This is unusual — normally drafts churn for years. The implication: apiq can treat them as
de-facto-stable for Stage A (their patterns are unlikely to materially change). Move
Idempotency-Key out of "vendor" (already done in §4 reframe) and bring rate-limit-headers
in as `hint`-rules even before formal RFC-status.

**5. Cross-RFC pairing is the most-common deep-mechanic class**

Many RFC2-N patterns are pairings between a request-parameter and a response-header (or
response-status-code). Examples:
- `If-Match` ↔ 412 ↔ ETag-on-200 (RFC 7232 trio)
- `Range` ↔ 206 ↔ Content-Range (RFC 7233 trio)
- `Prefer: respond-async` ↔ 202 (RFC 7240 pair)
- 401 ↔ WWW-Authenticate (RFC 7235 pair)
- 405 ↔ Allow header (RFC 7231 pair)
- 426 ↔ Upgrade header (RFC 7231 pair)
- 503 ↔ Retry-After (RFC 7231 pair)
- 429 ↔ Retry-After OR RateLimit-* (RFC 6585 + draft pair)
- Bearer-securityScheme ↔ 401-WWW-Authenticate-Bearer (RFC 6750 chain)

**Implication for apiq architecture:** these all need a "request-response-pairing-walker"
class (graph-detection — already partially addressed by the brainstorm's §3 `$ref-Graph-Analyse`
and §5 `HTTP-Method-Coverage-Analyse`). Recommendation: **promote a dedicated module**
`http-protocol-pairings.ts` that holds a declarative table of (param/scheme/status) → (required-header / required-status)
edges and enforces them across operations. This is more maintainable than ~25 individual
Spectral rules and exposes a clean catalog for users to read.

**6. JSON-Schema-draft-version detection is now load-bearing**

OAS 3.0 specs that smuggle in JSON-Schema-2020-12 keywords (`unevaluatedProperties`, `prefixItems`,
`$dynamicRef`, `dependentRequired`) are common in 2025+ migrations from 3.1. apiq currently has
X1-X5 covering some 3.0/3.1 differences but not the keyword-allowlist-by-version. RFC2-84 makes
this an `error` because validators silently ignore unsupported keywords → false-positive validation passes
on the server side. **High-priority gap.**

**7. RFC 9457 `type` cross-class uniqueness is a deep-mechanic invention**

RFC2-5 (every problem-class has a unique `type` URI) is a cross-response invariant that no
mature linter checks today (Vacuum / Redocly / Spectral / IBM etc. don't ship it). It's
purely mechanical — collect every `type` example/default across all problem-shape responses and
flag URI-collisions. **apiq can ship this as a USP-level differentiator** alongside its
schema-hash-duplicate detection.

**8. Pattern density: ~105 net-new patterns from 22 RFCs**

Round-1 mining yielded ~80 new patterns from 7 sources (~11/source).
Round-2 Phase-B yields ~105 from 22 sources (~5/source). Lower density — RFCs are
narrower per-source, but the breadth covers much more of the API-stack. Combined with
phases A/C/D/E, Round-2 should land ~400-500 new patterns total, validating the
"Round-2 substantial" hypothesis from the meta-insights doc.

**9. Many "SHOULD" patterns are 2025-tightened to "MUST" via BCPs**

Pattern: when a draft RFC matures to BCP, "SHOULD" tightens to "MUST" without a wire-format
change. This is the case for OAuth2-implicit (BCP 240), OAuth2-password (BCP 240), and
JWT-`none`-rejection (BCP 225). **apiq's severity should track BCPs, not just the original RFC.**
Recommendation: every Stage-A rule's metadata source-field should support a BCP-reference
("source: rfc-9700-bcp-240" not just "source: rfc-6749").

**10. A new Lens emerges — "Internal-Consistency"**

RFC2-3 (status field matches HTTP response code), RFC2-5 (type URI uniqueness across responses),
RFC2-28 (ETag consistent across operations), RFC2-39 (304/200 same ETag-shape) are all
**cross-response / cross-operation internal-consistency invariants**. They don't fit Standards
(the spec is *valid* in isolation), don't fit Ergonomics (no consumer-friction unless violated
at runtime), don't fit Threat. They fit a 7th Lens: **Internal-Consistency** — and apiq's
existing brainstorm already has invariants in this class (D1 cross-op-response-shape, M7 schema-hash-duplicate,
O3 component-duplicate-hash, G-SP-5 property-name-type-consistency cross-schema). **Recommendation:
formalize Lens 7 — Internal-Consistency** as a peer to the 5 existing ones.

---

## Summary — gap analysis

**Concrete Stage-A gaps confirmed by RFC-sweep** (priority order):

| Priority | RFC2-ID | Pattern | Why now |
|---|---|---|---|
| P1 | RFC2-5 | Problem-Details `type`-URI cross-class uniqueness | apiq-USP candidate; no linter has it; mechanic |
| P1 | RFC2-25/26 | 304/412 paired with proper validators (cross-direction) | Half-covered in brainstorm; complete the pairing |
| P1 | RFC2-40 | 401 → WWW-Authenticate header REQUIRED | Universal MUST; not in apiq |
| P1 | RFC2-14 | 405 → Allow header REQUIRED | Universal MUST; not in apiq |
| P1 | RFC2-94 / C9-upgrade | 429 → Retry-After OR RateLimit-* | Severity-upgrade brainstorm C9 to error (per cross-source consensus) |
| P1 | RFC2-60/61 | OAuth2 implicit/password forbidden (BCP 240, 2025) | Severity-upgrade brainstorm Y-7 to error |
| P2 | RFC2-1/2 | RFC 9457 problem-shape MUST type (URI) + title/status SHOULD | Strengthen brainstorm K2 / DM-4 |
| P2 | RFC2-32 | 206 → Content-Range REQUIRED | New module, niche but pure-MUST |
| P2 | RFC2-69 | Path MUST NOT contain `#` | Universal; brainstorm S-SP-* gap |
| P2 | RFC2-70 | OAS path-template grammar (RFC 6570 Level-1 only) | New |
| P2 | RFC2-74 | Userinfo in server URL forbidden | Threat + Hygiene |
| P2 | RFC2-78 | `*/*` content-type forbidden | Brainstorm L-MIN-2 confirmed warn |
| P2 | RFC2-84 | OAS 3.0 + 2020-12-only-keywords = error | Brainstorm X-MIN-1 confirmed error |
| P3 | RFC2-3 | Problem-Details `status` matches HTTP response-status | Cross-response invariant; AJV-class |
| P3 | RFC2-58 | JWT bearerFormat → RFC 8725 mention in description | Brainstorm Y-8 confirmed warn |
| P3 | RFC2-65 | OAuth2 scopes have human-readable descriptions | New |
| P3 | RFC2-91/92 | Deprecation/Sunset header pairing | Brainstorm H4 extension |
| P3 | RFC2-97 | PATCH content-type `merge-patch+json` / `json-patch+json` | Brainstorm L-SP-2 confirmed warn |
| P3 | RFC2-98 | `merge-patch+json` requestBody MUST NOT have required props | Brainstorm B-MIN-3 confirmed warn |
| P3 | RFC2-99 | `json-patch+json` requestBody MUST be array of patch-ops | New |
| P4 | RFC2-71/72 | Server URL host/scheme lowercase | Brainstorm P-SP-3 confirmed |
| P4 | RFC2-75/76 | Custom JSON media-types use `+json` suffix / `vnd.` tree | New |
| P4 | RFC2-79 | Top-level media-type MUST be IANA-registered | New, niche |
| P4 | RFC2-80 | Charset on application/json redundant | New, niche |
| P4 | RFC2-93 | RateLimit-* draft-headers presence | New |
| P4 | RFC2-95 | Retry-After value-grammar | New, niche |
| P4 | RFC2-96 | 503 → Retry-After SHOULD | New |
| P4 | RFC2-103/105 | 428 + 511 status-code awareness | New, niche |
| P5 | RFC2-50 | Structured Field Values grammar in custom headers | Defer to v2 — niche |
| P5 | RFC2-54/55 | Link-header `anchor` URI / case-mixing | New, niche |
| P5 | RFC2-77 | `prs.` tree media-types in production | New, niche |
| P5 | RFC2-89 | `contentEncoding` / `contentMediaType` on OAS-3.0 | New, niche |

**Severity-upgrade candidates** (RFC-sourced):
- C9 (429 → Retry-After): warn → **error** (cross-source consensus, including draft-ratelimit)
- F-SP-3 / Y-7 (OAuth2 implicit/password): warn → **error** (RFC 9700 BCP-240, 2025-01)
- F6 (bearerFormat declared): hint → **hint** (no upgrade — informative)
- K2 / D6 (problem+json): hint → **warn** (already noted in §3 of brainstorm — RFC-sweep adds RFC 9457 normative weight)

**New module candidates** (deep-mechanics, not Spectral-rule-shaped):
- `problem-json-validator.ts` (DM-4) — handles RFC2-1/2/3/4/5
- `http-protocol-pairings.ts` (NEW) — declarative param↔header / status↔header / scheme↔challenge pairings (RFC2-14/15/20-26/30-32/40-41/48/94/96)
- `oauth2-flow-validator.ts` (NEW) — RFC 9700 BCP-240 wrapper (RFC2-60/61/62/63/64/65)
- `media-type-iana-validator.ts` (NEW) — RFC 6838 + IANA registry (RFC2-75/76/77/79/80)
- `json-schema-draft-version-detector.ts` (extends existing) — RFC2-84/85/86/87/89

**Lens-framework recommendations** (from Meta-Observations):
- Add **Lens 6 — Operations / Performance / Cost** (caching, conditional-requests, rate-limit-signaling, partial-fetch)
- Add **Lens 7 — Internal-Consistency** (cross-op invariants — formalize what apiq already does ad-hoc)
- BCP-tracking in rule-metadata (`source` field SHOULD support BCP-references)

---

## Method notes

- All RFCs surveyed from training-knowledge of the cited sections; verbatim RFC 2119 keywords
  reproduced where stated. Where a paraphrase is used (e.g. "the response MUST include the following
  header fields" abbreviated), the section reference is exact and any verifier should re-check
  the wording against the IETF datatracker text.
- Active IETF drafts (`httpapi-*`) cited at their 2024-2025 stabilized state; if implementation
  begins after 2026-Q3, re-check `tools.ietf.org/wg/httpapi/` for promotion to RFC.
- IANA registries cited: HTTP Method Registry, HTTP Status Code Registry, HTTP Field Name Registry,
  HTTP Authentication Scheme Registry, Cache-Control Directive Registry, Link Relation Type Registry,
  Media Types Registry, Range Unit Registry. Allowlists in apiq rules SHOULD be data-driven
  (snapshot of IANA registry at apiq-release-time, refreshed quarterly) rather than hardcoded.
- Severity-axis verbatim wording is the most load-bearing column; if a future reviewer disputes
  a `MUST` → `error` mapping, the recourse is to read the RFC section and re-cite. Where wording
  is "SHOULD" but the obsoleting RFC tightened to "MUST", the latter governs (per
  RFC-obsoletion-chain meta-observation).

---

## Recommended next-action for orchestrator

1. **Take RFC2-5 + RFC2-40 + RFC2-14 + RFC2-94** as a P1 batch — all are pure-MUST patterns with
   no current apiq coverage and high reputation-load-bearing weight (every mature linter ships
   these or equivalents).
2. **Promote `http-protocol-pairings.ts`** as a new deep-mechanic module (declarative pairings
   table) — replaces ~15 individual Spectral rules with a maintainable single source.
3. **Severity-upgrade C9 / Y-7** to `error` based on cross-source + BCP-tracking.
4. **Add Lens 6 (Operations) + Lens 7 (Internal-Consistency)** to the meta-insights framework.
5. **Add IANA-registry-snapshot dependency** — apiq ships allowlists for status codes, methods,
   header field names, link relations, cache directives, media types. Refresh quarterly.
6. **Defer P5 patterns + UNS-* + OOS-***. Phase B (LLM) handles the semantic remainder
   (OOS-1/2/6/8 at minimum).
