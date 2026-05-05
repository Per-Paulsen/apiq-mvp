# Stage-A Mining: Industry-Style-Guides

> **Task #25** — Mining industry style-guides for generic, mechanically-detectable patterns that
> apply to any OpenAPI spec. Goal: find rules apiq's brainstorm-list might be missing, especially
> ones that mature linters (Vacuum / Redocly / community-Spectral-rulesets) would catch.
>
> **Scope discipline:** style-guides contain a lot of *design recommendations* (REST vs RPC,
> versioning strategies, runtime behaviour) that need either runtime context or LLM reasoning.
> Those are explicitly **out of scope** here — Stage A only takes mechanically-detectable patterns.
> Everything else goes to Phase B (LLM) or is dropped.
>
> **Authored:** 2026-05-05.

---

## Sources surveyed

| Source | URL | Focus | Recency / status | MUST/SHOULD/MAY tagged? |
|---|---|---|---|---|
| **Zalando RESTful API Guidelines** | opensource.zalando.com/restful-api-guidelines/ | ~190 rules, very respected, broad coverage | Active, maintained | Yes (RFC-2119 keywords on every rule, numbered IDs e.g. `[129]`) |
| **Microsoft Azure REST API Guidelines** | github.com/microsoft/api-guidelines (azure/Guidelines.md, vNext) | URL/JSON/HTTP conventions, LRO, conditional requests | Active | Yes (`✅ DO`, `☑️ YOU SHOULD`, `⛔ DO NOT`, `✔️ YOU MAY`) |
| **Google API Design Guide / AIPs** | cloud.google.com/apis/design + google.aip.dev | Resource naming, methods, fields, pagination, errors | Active | Partial (AIPs use MUST/SHOULD); resource-oriented framing |
| **JSON:API spec v1.1** | jsonapi.org/format/ | Strict JSON envelope, errors, pagination, includes | Active (v1.1 stable) | Yes (RFC-2119 keywords throughout) |
| **Heroku Platform API Reference** | devcenter.heroku.com/articles/platform-api-reference | Header-based versioning, Range pagination, error shape | Reference doc, mature | Implicit (descriptive prose) |
| **APIs You Won't Hate** (book + Spectral ruleset) | apisyouwonthate.com + github.com/apisyouwonthate/style-guide | Pragmatic OpenAPI pet-peeves, distilled into 18 Spectral rules | v1.x, npm-distributed | Indirect (Spectral severity) |
| **PayPal API Style Guide** | github.com/paypal/api-standards (archived) + InfoQ summary | Money/currency, JSON snake_case, plural URLs, error shape | Archived but still cited | Implicit |
| **RFC 7807 / RFC 9457** | datatracker.ietf.org/doc/html/rfc7807 (RFC 9457 obsoletes) | Problem Details for HTTP APIs (`type`, `title`, `status`, `detail`, `instance` + `application/problem+json`) | RFC 7807 obsoleted by RFC 9457 (2023-07) | RFC keywords |
| **RFC 8288** | datatracker.ietf.org/doc/html/rfc8288 | Web Linking — `Link` header, `rel="next"\|"prev"\|"first"\|"last"` | Standard | RFC keywords |
| **RFC 7231 / 7232** | datatracker.ietf.org/doc/html/rfc7232 | HTTP semantics, conditional requests (`If-Match`, `If-None-Match`, `ETag`, `412`, `304`) | Obsoleted by RFC 9110/9111 (2022) but semantics intact | RFC keywords |
| **Atlassian REST API design** | (skipped — content overlaps Microsoft + Zalando, no unique mechanically-detectable rules surfaced) | — | — | — |

> Two URLs (Zalando home page, JSON:API home page, Phil Sturgeon's site, Google's redirected design-guide URL,
> PayPal master-branch raw md) returned permission errors during the WebFetch pass; results were reconstructed
> from a combination of WebSearch summaries, the GitHub-hosted source-of-truth (apisyouwonthate ruleset.ts),
> and rule-numbered references in third-party tooling (Zally, baloise/spectral-ruleset). Where a Zalando rule
> number appears below it has been corroborated against at least two of those secondary sources.

---

## How "detection-feasibility" is graded

| Bucket | Meaning |
|---|---|
| **mech** | Pure spec-tree traversal + regex. Spectral-rule-shaped or simple walker. |
| **mech-stat** | Mechanical, but requires statistical aggregation (% threshold over a population). Walker territory. |
| **heur** | Mechanical heuristic (keyword match in description, naming pattern). Will have false-positives but tunable. Severity should be `hint` to keep noise low. |
| **graph** | Requires building a graph (path-template ↔ params, $ref-graph, naming-classifier). Custom mechanic, not Spectral. |
| **LLM-only** | Needs semantic / NLP / domain reasoning. Skip from Stage A. |

---

## Patterns extracted (focus: detectable from an OpenAPI spec ALONE)

### Generic + detectable — **TAKE INTO APIQ** (these are the gap candidates)

These are patterns surfaced by ≥2 of the surveyed style-guides as MUST or SHOULD, and that
Stage A can mechanically check on any OpenAPI spec without vendor knowledge. Numbered SG-1..SG-50;
the "Brainstorm-link" column shows whether the apiq brainstorm already has it (so this entry
is corroboration / cross-confirmation, not a gap).

| ID | Pattern | Source(s) | Detection-feasibility | Severity-Suggestion | Brainstorm-link / Note |
|---|---|---|---|---|---|
| SG-1 | **API root / `/` should be defined** so consumers don't need docs for first hop | apisyouwonthate `api-home`, `api-home-get` | mech (path key check) | hint | New — not in brainstorm. Marginal value; some teams reasonably skip. |
| SG-2 | **`/health` (or `/healthz`, `/_health`) endpoint present** for monitoring; if present, response should be `application/health+json` (draft-IETF) | apisyouwonthate `api-health`, `api-health-format` | mech | hint | New — niche. Suggest `hint`. |
| SG-3 | **Path-segments kebab-case** (`^[a-z][a-z0-9-]*$` per template segment, ignoring `{params}`) | Zalando #129 (MUST), Microsoft `#http-url-casing`, apisyouwonthate `paths-kebab-case`, PayPal | mech (regex per segment) | warn | Brainstorm S1 has "lowercase"; this strengthens to kebab-case. Note: Microsoft also allows camelCase, so apply only when caller opts in or when statistical-detection shows kebab-case dominant. |
| SG-4 | **JSON property names snake_case OR camelCase consistently** (`^[a-z_][a-z_0-9]*$` or `^[a-z][a-zA-Z0-9]*$`) — pick whichever the spec mostly uses, flag the other | Zalando #118 (MUST snake), Microsoft `#json-field-name-casing` (DO camel), Google AIP-140 (MUST snake), PayPal (MUST snake) | mech-stat (classifier + outliers) | warn | Brainstorm G1 has it as Walker. Confirmed: must be statistical/dynamic, not statically opinionated. |
| SG-5 | **No file extensions in paths** (`.json`, `.xml`, `.html`, `.txt` at end of path) — content negotiation belongs in `Accept` | apisyouwonthate `no-file-extensions-in-paths` | mech | warn | New — not in brainstorm. Easy add. |
| SG-6 | **No global versioning in server URL** (`/v1/`, `/v2/`) when also using header/path-segment versioning — at least flag mixing | Zalando #115 (header-versioning preferred), apisyouwonthate `no-global-versioning`, Microsoft `#versioning-no-version-in-path` (DO NOT) | mech (regex on `servers[].url`) | hint | Brainstorm H1/S4 has versioning-mix; this corroborates. Note opinion-split — Microsoft DO NOT path-version, Stripe etc. DO. Use as `hint` only and only flag *mixing* (path + header). |
| SG-7 | **HTTPS-only** in `servers[].url` (no `http://` outside dev) | apisyouwonthate `hosts-https-only-oas3`, OWASP-spectral baseline | mech | warn | Companion to apiq's existing `apiq-no-localhost-servers`. Add. |
| SG-8 | **No `X-` prefix on custom headers** (deprecated by RFC 6648, 2012) — both request parameters and response headers | RFC 6648, apisyouwonthate `no-x-headers` + `no-x-response-headers`, Microsoft `#http-no-x-custom-headers` (DO NOT) | mech | hint | New — easy add. Many real specs violate this; severity `hint` because of legacy weight. Caveat: many vendor extensions (`x-ms-*`, `x-amz-*`, `Stripe-*`) live happily this way — keep as `hint`. |
| SG-9 | **`requestBody` should support `application/json`** (not only form-encoded or only XML) | apisyouwonthate `request-support-json-oas3`, Zalando general JSON-first | mech | hint | Generalises apiq's existing `apiq-post-should-accept-json` (which only fires on POST + form-only). |
| SG-10 | **GET MUST NOT have `requestBody`** | OAS-3 spec, apisyouwonthate `request-GET-no-body-oas3` | mech | error | Brainstorm B1. Confirmed across multiple sources. |
| SG-11 | **`securitySchemes` defined** when API is non-public (any operation has `security`, or `security` at root) | apisyouwonthate `no-security-schemes-defined` | mech | warn | Brainstorm F1. Confirmed. |
| SG-12 | **No HTTP-Basic auth scheme** (`type: http, scheme: basic`) for production APIs | apisyouwonthate `no-http-basic`, OWASP-Spectral, Heroku (Bearer-only) | mech | warn | New — easy. |
| SG-13 | **Numeric IDs avoided in path/query** (sequential integer IDs leak ordinal info; UUID/opaque preferred) | apisyouwonthate `no-numeric-ids` | mech (param schema check on `id`-named) | hint | New — controversial (many APIs use integer IDs intentionally). Keep as `hint`. |
| SG-14 | **Standard pagination param names**: pick one set — `[limit, offset]`, `[limit, cursor]`, `[page, per_page]`, or Google's `[page_size, page_token]`. Flag specs mixing >1 set | Zalando #137 (MUST), Google AIP-158 | mech-stat (Walker — already partly covered by Pagination-Style-Inconsistency walker) | warn | Brainstorm E2/E3 has it. Confirmed. Note Google's `page_size`/`page_token` is the most distinctive set. |
| SG-15 | **Pagination response should expose `next_page_token` / `nextLink` / `Link: rel=next`** when result set is truncated | Google AIP-158 (next_page_token MUST), Microsoft `#collections-include-nextlink-for-more-results`, RFC 8288, JSON:API §pagination | mech (presence check on List-shaped responses) | hint | Brainstorm E5. Confirmed. Detection: list endpoint = path with array-typed 2xx response; should have one of {response body has `next_page_token`/`nextLink`/`next`/`links.next`, `Link` response header, `Content-Range` header}. |
| SG-16 | **Standard error envelope**: error responses (4xx/5xx) should declare `application/problem+json` (RFC 7807/9457) **OR** JSON:API error shape **OR** documented custom error schema reused across operations | apisyouwonthate `no-unknown-error-format`, RFC 7807, RFC 9457, Zalando, Microsoft `#rest-error-response-body-structure` | mech (content-type whitelist check + cross-op consistency walker) | warn | Brainstorm K1/K2/K4. Confirmed strongly across all guides. **Highest-priority gap candidate.** |
| SG-17 | **RFC 7807 `Problem` schema shape**: when a response uses `application/problem+json`, schema should have `type` (URI), `title`, `status`, `detail`, `instance` properties (all optional per RFC, but at least `type` + `title` + `status` should be defined) | RFC 7807 §3.1 | mech | hint | New — apiq doesn't have this specifically. Add when SG-16 fires. |
| SG-18 | **Date-time `format`**: properties named `*_at`, `*_time`, `created`, `updated`, `timestamp` should declare `format: date-time` (RFC 3339) — NOT `format: date` and NOT bare `string` | Zalando #126 (RFC 3339 MUST), Microsoft `#json-date-time-is-rfc3339`, Google AIP-142 | mech (regex on prop name) | warn | Brainstorm I1. Confirmed strongly. Suggest broadening `*_at` → `*_at`, `*_time`, `*_date` (latter → `format: date`). |
| SG-19 | **Duration as ISO-8601 OR fixed-unit integer**: durations should be `format: duration` (ISO-8601) OR named `*_seconds` / `*_minutes` / `*_ms` (Microsoft pattern) — NOT bare `integer` | Microsoft `#json-durations-use-fixed-time-intervals`, Zalando #125 | heur (prop-name keyword match: `duration`, `interval`, `timeout`, `ttl`) | hint | New — easy add. |
| SG-20 | **UUID `format`**: `*_id`, `*_uuid`, `id` properties whose values are documented as UUIDs should declare `format: uuid` | Microsoft `#json-uuid-is-rfc4412`, Heroku, Zalando #171 | mech (extension of apiq's existing fk-id rule — currently only checks `*_id`; add UUID-specific) | hint | Brainstorm J2. Already covered, but split: `format: uuid` is the strongest hint. |
| SG-21 | **Money / amount + currency**: properties named `amount`, `price`, `cost`, `total`, `*_amount` should pair with a sibling `currency` property; `currency` should be `format: iso-4217` (or 3-letter pattern) | Zalando #173 (MUST iso-4217), PayPal money type | mech (sibling-property check inside same schema object) | hint | New — not in brainstorm. Niche but high-trust signal where applicable. Skip if no money fields. |
| SG-22 | **Country code `format: iso-3166-alpha-2`**: properties named `country`, `country_code` should declare format or pattern `^[A-Z]{2}$` | Zalando #170 | mech | hint | New — niche. |
| SG-23 | **Language code BCP-47**: properties named `language`, `locale`, `lang` should declare `format: bcp47` or pattern matching BCP-47 | Zalando #172 | mech | hint | New — niche. |
| SG-24 | **64-bit integers should be string-encoded** (`format: int64` AND `type: string` is the safe pattern; or warn when an int64-typed field is named like an ID), since JS-Number loses precision >2^53 | Google AIP (int64-as-string), Zalando #168 (`bigint` MUST), Stripe convention | mech | hint | New — controversial; keep `hint`. |
| SG-25 | **`info.version` is semver**: `info.version` should match `^\d+\.\d+\.\d+(?:-[\w.]+)?$` | Zalando #116 (MUST semver) | mech (regex) | hint | Brainstorm H2. Easy. |
| SG-26 | **`info.contact` populated**: `info.contact.{name OR url OR email}` non-empty | Zalando #218 | mech | hint | spectral:oas already has `info-contact`. Confirmed. |
| SG-27 | **`info.license` populated** | Zalando #218, OAS3 best-practice | mech | hint | spectral:oas already has `info-license`. Confirmed. |
| SG-28 | **`info.description` mentions auth, base URL, versioning, pagination conventions** when a multi-op API | Heroku style, Zalando #218, Microsoft | heur (keyword match: `auth`, `version`, `pagination`, `bearer`, etc. should appear) | hint | apiq has `apiq-info-description-substantive` (length-only). Add keyword-coverage check. |
| SG-29 | **POST resource-creation returns `201 Created` with `Location` header** | Microsoft `#http-success-status-codes`, Zalando #150 | mech (operation: POST + path is collection + 2xx response) | hint | Brainstorm B3. Confirmed. |
| SG-30 | **DELETE returns `204 No Content`** (or `200`/`202`/`404`) — flag if DELETE only declares `200` with body and no `204` | Microsoft `#http-delete-returns-204`, Zalando #151 | mech | hint | Brainstorm B4. Confirmed. |
| SG-31 | **`429 Too Many Requests` operations should have `Retry-After` response header** | Microsoft, RFC 7231, RFC 6585 | mech | warn | Brainstorm C9. Confirmed. |
| SG-32 | **Operations using `If-Match`/`If-None-Match` parameters should declare 412/304 responses** | RFC 7232, Microsoft `#condreq-behavior` | mech (parameter presence → response-code presence) | warn | New — not directly in brainstorm. Companion to brainstorm C10 (304 without validators); this is the inverse: validator-without-304/412. |
| SG-33 | **State-changing operations (PUT/PATCH/DELETE) on identifiable resources should support `If-Match` + return `ETag`** | RFC 7232, Microsoft `#condreq-return-etags` (SHOULD), Heroku | mech (path has `{id}` + method ∈ {PUT,PATCH,DELETE} → check param + response header) | hint | New. Pure pattern. |
| SG-34 | **PATCH should use JSON Merge Patch (RFC 7396) or JSON Patch (RFC 6902)**: PATCH `requestBody.content` should declare `application/merge-patch+json` or `application/json-patch+json` (or document the merge semantics) — flag bare `application/json` PATCH | Microsoft `#rest-patch-use-merge-patch` (DO), Zalando | mech (PATCH operation content-type check) | hint | New — common gap. |
| SG-35 | **`oneOf`/`anyOf` polymorphism: discriminator MUST be present** | OAS 3.0 §4.7.25, Microsoft `#json-use-discriminator-for-polymorphism` | mech | warn | apiq has `apiq-oneof-needs-discriminator` (currently `hint`). Multiple sources support upgrading to `warn`. |
| SG-36 | **Enum values in extensible-style** (`x-ms-enum: { modelAsString: true }` or comparable) — when an enum is documented as "may grow", consumers shouldn't break on unknown values. Hard to detect mechanically without that vendor-extension; **skip for spec-agnostic.** | Microsoft `#json-use-extensible-enums` | mech (only via `x-ms-enum`) | — | OUT — vendor-extension-coupled. |
| SG-37 | **Enum value casing consistent within enum**: e.g., all `UPPER_SNAKE` or all `lower-kebab`, no mixing | PayPal (UPPER_SNAKE for enum values), Zalando #240 (SHOULD UPPER_SNAKE_CASE) | mech (per-enum classifier) | warn | Brainstorm M12. Confirmed. |
| SG-38 | **Boolean property naming**: avoid `is_`/`has_` prefixes (PayPal); some style-guides require them. Spec-agnostic version: at least flag *inconsistency* (some properties have prefix, others don't) | PayPal (DO NOT use is_/has_) — opinion-split | mech-stat (classifier) | hint | New — keep as inconsistency-flag only, no opinion. |
| SG-39 | **Plural for collection paths, singular for item paths**: `/users` (GET list) vs `/users/{id}` (GET item). At least flag *inconsistency* across resources | Zalando #134, Google AIP-122, PayPal | heur (path-segment classifier) | hint | Brainstorm S7. Confirmed. |
| SG-40 | **Path templating consistent within resource**: across all operations on `/users/{user_id}`, the param is consistently named (`user_id` not sometimes `userId` not sometimes `id`) | Zalando #143, Google AIP-122 | graph (path-template-parser already in apiq codebase) | warn | Brainstorm G6. Already partially covered by `path-template-parser.ts`. |
| SG-41 | **Operation `tags` array should have ≥1 entry**, AND tag should be in top-level `tags` array | spectral:oas `operation-tag-defined` | mech | warn | Already covered by spectral default + apiq's `apiq-spec-needs-tags-array`. |
| SG-42 | **`additionalProperties: false`**: schemas SHOULD explicitly declare `additionalProperties` (either `false` for closed, or schema for open). Don't rely on implicit-true. | Microsoft `#rest-fail-for-unknown-fields` (DO 400 on unknown), Zalando #225 | mech-stat (Walker, brainstorm M8) | warn | Brainstorm M8. Confirmed. apiq has the walker. |
| SG-43 | **`null` field handling**: declare nullable explicitly (3.0: `nullable: true`; 3.1: `type: [x, null]`). Microsoft `DO NOT` send `null` for absent fields (omit instead) — but that's runtime-only. Detectable: schemas with `nullable` should be explicit, not relying on `default: null` or example-with-null only. | Microsoft `#json-null-response-values`, Zalando | mech-stat | hint | Brainstorm A9/A10/X1/X2 already covers OAS3.0 vs 3.1 syntax issues. Confirmed. |
| SG-44 | **`Last-Modified` response header on cacheable GETs** OR `ETag` on resource representations | RFC 7232, Heroku | mech (heuristic: GET with 200 on `{id}`-bearing path → check headers) | hint | New — niche. |
| SG-45 | **Header parameter names lowercase / kebab-case**: HTTP header names are case-insensitive, but for spec consistency, all `parameters[in=header].name` should be Title-Case-Hyphenated (`Content-Type`, not `content_type`) | Microsoft `#http-header-names-casing`, RFC 7231 | mech (regex) | hint | Brainstorm G8. Confirmed. |
| SG-46 | **Reserved/standard header names not redeclared as parameters**: `Authorization`, `Content-Type`, `Accept`, `Cookie`, `Set-Cookie`, `User-Agent`, `Host` should not appear in `parameters[in=header]` (they belong to `securitySchemes` / `requestBody.content` / etc.) | Microsoft, OAS3 §4.7.13 | mech (parameter name allowlist) | warn | apiq has `apiq-no-content-type-header-parameter`. Generalise to full reserved list. |
| SG-47 | **`request-id` / `X-Request-Id` response header** on every operation (or globally documented) for traceability | Heroku `Request-Id`, Microsoft `#http-header-request-id`, Zalando | mech | hint | New — niche but cited by 3+ guides. |
| SG-48 | **Tag descriptions populated and ≥5 chars** | spectral:oas `oas3-tag-no-empty-description` + apiq `apiq-tag-meaningful-description` | mech | hint | Already covered. |
| SG-49 | **Trailing-slash inconsistency**: paths should be uniform — either all end with `/` or none. Microsoft and Stripe both require no-trailing-slash; flag mixing. | spectral:oas `oas3-server-trailing-slash` (servers only), Zalando | mech-stat | warn | Brainstorm S3. Confirmed. apiq doesn't have a path-level trailing-slash check. **Gap.** |
| SG-50 | **Idempotency-Key request header for unsafe POST operations** that create resources or perform side-effects | RFC draft-ietf-httpapi-idempotency-key, APIs You Won't Hate, Stripe convention, Adyen | mech (POST + non-search path → check parameters) | hint | Brainstorm-list deferred this as vendor (Stripe). RFC-draft + APIs-You-Won't-Hate make it spec-agnostic now. **Reconsider as generic `hint`-rule, not vendor.** Note: domain-knowledge layer is not strictly required because the IETF draft formalises this. |

---

### Already-in-apiq-brainstorm (confirmed externally — no action needed beyond keeping)

These brainstorm items are corroborated by ≥2 external style-guides; flagged here so the team knows
the brainstorm IDs are not idiosyncratic apiq inventions.

| Brainstorm ID | Source(s) confirming | Note |
|---|---|---|
| A1 ($ref dangling) | OAS-3 spec, swagger-parser baseline | Universal |
| A4 (discriminator.propertyName MUST be in subschemas) | OAS 3 §4.7.25, Microsoft | Universal |
| A6 (pattern is valid regex) | JSON Schema | Universal |
| B1 (GET no requestBody) | OAS-3, apisyouwonthate, Zalando | Confirmed (mapped to SG-10 above) |
| B3 (POST returns 201 + Location) | Microsoft, Zalando | Confirmed (SG-29) |
| B4 (DELETE returns 204) | Microsoft, Zalando | Confirmed (SG-30) |
| C1 (≥1 2xx response) | Universal | OAS-3 best practice; spectral has weaker version |
| C5 (security ⇒ 401) | Microsoft, Zalando | Confirmed |
| C9 (429 ⇒ Retry-After) | RFC 6585, Microsoft | Confirmed (SG-31) |
| C10 (304 needs validators) | RFC 7232 | Confirmed; companion SG-32 covers inverse |
| D6 (problem+json error consistency) | RFC 7807, apisyouwonthate, Zalando, Microsoft | Confirmed (SG-16) |
| E2/E3 (pagination param naming consistent) | Zalando #137, Google AIP-158 | Confirmed (SG-14) |
| E5 (Link-header for cursor pagination) | RFC 8288, JSON:API | Confirmed (SG-15) |
| F1 (securitySchemes when non-public) | apisyouwonthate, Zalando | Confirmed (SG-11) |
| G1/G2/G3 (naming-classifier consistency) | Zalando, Google AIP-140, Microsoft, PayPal | Confirmed (SG-4) |
| G4 (path-segments lowercase) | Zalando #129, apisyouwonthate, PayPal | Confirmed (SG-3) |
| G6 (path-param-naming consistent) | Zalando #143, Google AIP-122 | Confirmed (SG-40) |
| G8 (header parameters dash-separated) | Microsoft, RFC 7231 | Confirmed (SG-45) |
| H2 (info.version is semver) | Zalando #116 | Confirmed (SG-25) |
| I1 (date-time RFC 3339) | Zalando #126, Microsoft, Google | Confirmed (SG-18) |
| J2 (ID fields format/pattern) | Heroku, Zalando #171, Microsoft RFC4122 | Confirmed (SG-20) |
| K1 (error-schema has type/code+message) | RFC 7807, JSON:API, Heroku, Microsoft | Confirmed (SG-17) |
| K2 (problem+json) | RFC 7807, apisyouwonthate | Confirmed (SG-16/17) |
| M7 (duplicate schemas via canonical-form-hash) | (no external SG, but mature linter pattern) | Apiq-original. Keep. |
| M8 (additionalProperties declaration) | Microsoft, Zalando #225 | Confirmed (SG-42) |
| M12 (enum casing consistency) | Zalando #240, PayPal | Confirmed (SG-37) |
| O1 (unused components — all 8 classes) | spectral:oas `oas3-unused-component` (schemas only) | Confirmed; apiq already extends to headers/examples. Extend to remaining classes. |
| O3 (duplicate components hash) | Apiq-original | Keep. |
| P3/P4 (path-template ↔ parameter coherence) | OAS-3 spec | Confirmed |
| R7 (operationId duplicates) | spectral:oas | Confirmed |
| S1 (path lowercase) | Zalando #129, apisyouwonthate | Confirmed (SG-3) |
| S3 (trailing-slash consistency) | Microsoft | Confirmed (SG-49) — gap |
| S7 (plural vs singular) | Zalando #134, Google AIP-122 | Confirmed (SG-39) |
| T2 (required param + default = nonsense) | OAS-3 best practice | Confirmed |
| T7 (path-param `required: true` explicit) | OAS-3 §4.8.10 | Confirmed |
| W1–W15 (statistical walkers) | Multiple — confirmed via Zalando + Microsoft + Google emphasising consistency | Confirmed |
| X1–X5 (3.0 vs 3.1 syntax differences) | OAS-3.1 changelog | Confirmed |

**Summary:** ~36 brainstorm items have external corroboration. The brainstorm is not narcissistic on these — confirmed. Where apiq currently has `hint` and external guides say MUST, **consider upgrading severity** (e.g., SG-35 oneOf-discriminator: brainstorm M14 has `hint`, but OAS-3 spec + Microsoft both say MUST → upgrade to `warn`).

---

### Org-Specific (skip — Zalando-only / Microsoft-only / Vendor)

Patterns that are detectable but only make sense under a specific org's house style. Stage A
must remain spec-agnostic, so these are **not** taken into apiq.

| ID | Pattern | Source | Why-skip |
|---|---|---|---|
| OS-1 | `x-ms-error-code` response header | Microsoft `#rest-error-code-header` | Azure-specific |
| OS-2 | `x-ms-request-id` response header | Microsoft `#http-header-request-id` | Azure-specific (generic version → SG-47) |
| OS-3 | `azure-deprecating` header | Microsoft `#deprecation-header` | Azure-specific |
| OS-4 | `Repeatability-Request-ID` + `Repeatability-First-Sent` | Microsoft `#repeatability-headers` | Azure-specific (generic version → SG-50 Idempotency-Key) |
| OS-5 | `api-version=YYYY-MM-DD` query param required | Microsoft `#versioning-api-version-query-param` | Azure-specific; conflicts with header-versioning APIs |
| OS-6 | Top-level `value` array in list responses | Microsoft `#collections-response-array-name` | OData/Azure convention; not universal |
| OS-7 | `nextLink` (Microsoft) vs `next_page_token` (Google) vs `Link: rel=next` (RFC8288) | All three | Pick one per spec; flag *consistency*, not vendor (covered by SG-15) |
| OS-8 | `Range` request-header pagination | Heroku | Heroku-specific; generic version is `limit/offset` or `cursor` |
| OS-9 | `Accept: application/vnd.<vendor>+json; version=N` versioning | Heroku, GitHub | Vendor-MIME-versioning is a valid choice but not universal |
| OS-10 | `:action` URL pattern for non-CRUD (Google AIP) `/users/{id}:cancel` | Google AIP | Google-style; conflicts with Stripe-style `/users/{id}/cancel` |
| OS-11 | JSON:API `data.attributes` envelope | JSON:API §7.2 | Only applies if spec opts into JSON:API (`application/vnd.api+json`) |
| OS-12 | `page[number]` / `page[size]` brackets-in-query | JSON:API | JSON:API-specific syntax |
| OS-13 | `?fields[type]=name,age` sparse-fieldsets syntax | JSON:API | JSON:API-specific |
| OS-14 | `?include=author,comments` related-resource syntax | JSON:API | JSON:API-specific |
| OS-15 | Google `etag` field in resource (string) | Google AIP-154 | Google-style; equivalent at HTTP level is `ETag` header (SG-33) |
| OS-16 | Google `name` as first field of every resource | Google AIP-122 | Google-specific; conflicts with `id` convention |
| OS-17 | Google `create_time` / `update_time` standard fields | Google AIP-148 | Google-specific naming; generic equivalent → SG-18 (date-time format on `*_at`) |
| OS-18 | Google `page_size`/`page_token`/`next_page_token` | Google AIP-158 | Google-style; included as one of the allowed sets in SG-14 |
| OS-19 | Google long-running operation `Operation` envelope | Google AIP-151 | Google-style; LRO patterns at HTTP-level → 202+`Location`+polling, but not standardised |
| OS-20 | Microsoft `operation-location` header for LRO | Microsoft `#lro-returns-operation-location` | Azure-specific |
| OS-21 | Zalando `x-api-id` extension required | Zalando #215 | Zalando-specific |
| OS-22 | Zalando `x-audience` extension required | Zalando #219 | Zalando-specific |
| OS-23 | Microsoft `kind` field for polymorphism (instead of `discriminator.propertyName: type`) | Microsoft `#json-use-discriminator-for-polymorphism` | Naming-opinion-only; covered semantically by SG-35 |

---

### Unsure / Out-of-scope (orchestrator review — likely LLM)

Patterns surfaced by style-guides that **could** be part of Stage A but require either NLP / domain
reasoning / runtime context, or where mechanical detection would have unacceptably high
false-positive rates. Documented for orchestrator decision; default recommendation: **defer to LLM**.

| ID | Pattern | Source | Why-unsure |
|---|---|---|---|
| LL-1 | "Use REST not RPC" — flag operation paths with verbs (`/getUser`, `/searchOrders`) | Zalando, Google AIP, APIs-You-Won't-Hate | Brainstorm S8 has it as `hint` heuristic. False-positives high (`/auth/login`, `/users/search`, `/payments/refund` are widely-accepted RPC-actions). LLM-better. |
| LL-2 | Field names should be self-explanatory, not abbreviated (`created_at` not `crtd`) | Zalando #240, Google AIP-140 | Pure NLP; detection of "is `crtd` an abbreviation?" is LLM-territory. |
| LL-3 | "Don't return secrets in GET" | Microsoft `#rest-no-secrets-in-get-response` | Requires semantic understanding of "secret". |
| LL-4 | Errors should be unique + recoverable | Microsoft `#rest-descriptive-error-code-values` | Requires reading prose to assess "uniqueness". |
| LL-5 | "Use action-verbs for action operations" `:cancel`, `:refund` | Microsoft `#actions-action-name-is-verb` | Heuristic at best; LLM disambiguates better. |
| LL-6 | Field hierarchy shallow (≤3 levels) | Microsoft `#rest-flat-is-better-than-nested` | Brainstorm M4 (`>3` levels = warn). Mechanical, but threshold is opinion-loaded. Keep apiq's existing hint. |
| LL-7 | Don't expose internal IDs (auto-incremented integers) where it leaks ordinality | Multiple (security guidance) | Requires runtime/domain knowledge. SG-13 covers the syntactic version. |
| LL-8 | Error messages should be human-readable + actionable | RFC 7807 `detail` field | NLP. |
| LL-9 | Wrong summary on operation ("Create a card" on `/bank_accounts`) | apiq stripe:F20 | Already classified LLM-only in apiq-ruleset.yaml. Confirmed. |
| LL-10 | Parameter-relationship rules in prose ("if X is set, Y is required") | apiq stripe:F21 | LLM-only. Confirmed. |
| LL-11 | Conditional-validation rules in prose | apiq pd:F20 | LLM-only. Confirmed. |
| LL-12 | Resource-noun naming consistency (`Order` vs `Orders` vs `OrderResource`) | Zalando, Google | Heuristic; LLM-better at picking up semantic-near-duplicates. Apiq's M7/O3 hash-based duplicate-detection covers the structural side mechanically; the naming-only side is LLM. |
| LL-13 | Long-Running Operations should follow 202+location pattern | Microsoft, Google | Detection requires understanding which operations are LRO; rarely declarative in spec. LLM-better. |
| LL-14 | Health-check format (draft-IETF `application/health+json`) | apisyouwonthate `api-health-format` | Mechanical (SG-2 above), but value-add minimal — keep as low-priority. |
| LL-15 | Resource-name must be plural | Zalando #134 | Heuristic-only (English-grammar pluralisation is hard mechanically). LLM-better. |
| LL-16 | Webhook payload schemas in `webhooks` (3.1) vs `x-webhooks` (3.0 vendor) | Microsoft, Stripe | Brainstorm U1–U3. Mechanical, low value. Keep deferred. |
| LL-17 | Action endpoints (`POST /apps/{id}/addons/{id}/actions/provision`) state-transition convention | Heroku | Vendor-style; LLM judgment. |
| LL-18 | Hypermedia/HATEOAS link relations correctness | Heroku, Zalando | Detection of `links` semantic correctness is LLM-territory. |

---

## Summary — gap analysis

**Brainstorm completeness:** ~36 of 50 SG-rules are already in the apiq brainstorm. The brainstorm is **not narcissistic on the detection side** — externally corroborated.

**Concrete gaps to take into apiq Stage A** (in priority order):

| Priority | SG-ID | Pattern | Why now |
|---|---|---|---|
| P1 | SG-16 | RFC 7807 / JSON:API error-format detection | All 4 reference specs in apiq violate; all major style-guides require; high reputation-load-bearing |
| P1 | SG-17 | RFC 7807 schema-shape detection (`type`/`title`/`status`) | Companion to SG-16 |
| P2 | SG-49 | Trailing-slash consistency across paths | Microsoft + Zalando; brainstorm S3 not yet implemented |
| P2 | SG-15 | Pagination response truncation indicator (`next_page_token` / `nextLink` / `Link: rel=next` / `Content-Range`) on List-shaped endpoints | Already partly via existing pagination walker, but List-vs-detail classifier missing |
| P2 | SG-9 | Generalise apiq-post-should-accept-json → all `requestBody`-bearing operations | Wider trigger surface |
| P3 | SG-32 | If-Match/If-None-Match parameter present ⇒ 412/304 declared | Companion to existing 304-without-validators walker |
| P3 | SG-33 | State-changing op on `{id}`-path ⇒ should support ETag/If-Match | Pure RFC 7232 alignment |
| P3 | SG-34 | PATCH should declare merge-patch+json or json-patch+json content-type | Common bug |
| P3 | SG-46 | Generalise no-content-type-header-parameter → full reserved-header allowlist (Authorization, Accept, Cookie, etc.) | Wider trigger |
| P3 | SG-50 | Reconsider Idempotency-Key as generic (RFC-draft now formalises it) | Reframe from vendor → generic; severity `hint` |
| P4 | SG-5 | No file-extensions in paths | Easy add, low risk |
| P4 | SG-7 | HTTPS-only servers | Companion to existing localhost rule |
| P4 | SG-8 | No `X-` prefix headers (per RFC 6648) | Easy add, `hint` |
| P4 | SG-12 | No HTTP-Basic auth | Easy add, `warn` |
| P4 | SG-13 | Numeric IDs avoided | Easy add, `hint` (controversial) |
| P4 | SG-19 | Duration encoding (ISO-8601 OR fixed-unit-in-name) | Easy add, `hint` |
| P4 | SG-21 | Money/currency sibling check | Niche but high-trust where applicable |
| P4 | SG-25 | info.version is semver | Easy regex |
| P4 | SG-28 | info.description keyword-coverage (auth/version/pagination) | Strengthen existing `apiq-info-description-substantive` |
| P5 | SG-1, SG-2 | API root + /health endpoints | Marginal value, keep optional |
| P5 | SG-22, SG-23 | Country-code, language-code formats | Niche |
| P5 | SG-24 | int64-as-string | Controversial |
| P5 | SG-44 | ETag/Last-Modified on cacheable GET | Niche |
| P5 | SG-47 | Request-Id response header | Niche but cited by 3+ guides |

**Severity-upgrade candidates** (brainstorm has `hint`, external sources say SHOULD/MUST):

- M14 oneOf-discriminator: `hint` → `warn` (Microsoft DO, OAS-3 spec)
- M8 additionalProperties: `hint` → `warn` on stricter Microsoft ("DO 400 on unknown")
- I1 date-time RFC 3339: confirm `warn` (currently sometimes `hint` in apiq's unix-time variant — keep `hint` for unix-time-on-integer; full date-time format-on-naming-pattern → `warn`)

**Out-of-scope confirmation:** vendor-extension patterns (Microsoft `x-ms-*`, Zalando `x-api-id`, Google's `:action` URL, JSON:API envelope) are explicitly **not** taken — they would break apiq's spec-agnostic guarantee.

**Naming-opinion confirmation:** apiq's existing dynamic naming-classifier approach (Walker measures the spec's mode + flags outliers) is **the right call** — the major guides disagree on snake_case (Zalando/Google/PayPal) vs camelCase (Microsoft/Heroku). Hardcoding either would alienate half the user base. Zalando's #118 MUST snake is the most prescriptive; Microsoft's `#json-field-name-casing` DO camel is the inverse. Stay statistical.

---

## Method notes

- WebFetch on several primary-source URLs (Zalando index page, Phil Sturgeon's site, Google's redirected design-guide URL, PayPal master-branch raw md) returned permission errors during the run; the reconstruction relies on a mix of WebSearch summaries, the GitHub-hosted source-of-truth (apisyouwonthate ruleset.ts which fetched fully), and rule-numbered references in third-party tooling (Zally, baloise/spectral-ruleset). Rule-number citations are best-effort — confirm against opensource.zalando.com when implementing.
- Microsoft Azure Guidelines (vNext) fetched fully; Heroku Platform API Reference fetched fully; APIs-You-Won't-Hate Spectral ruleset fetched in full (18 rules listed above).
- The list intentionally favours **breadth + corroboration** over **depth** — the goal is to surface external-confirmation for each apiq brainstorm item and surface the gaps. Implementation-detail JSONPath/given expressions are deferred to A1.x implementation tasks.

---

## Recommended next-action for orchestrator

1. **Take SG-5, SG-7, SG-8, SG-12, SG-25, SG-49** straight into `apiq-ruleset.yaml` — they are pure-Spectral-shaped, low-risk, gap-confirmed.
2. **Take SG-16/17** as a higher-effort module — multi-format error-envelope detection (RFC 7807 OR JSON:API OR consistent-custom) is the highest-reputation rule from this mining and worth a dedicated walker.
3. **Take SG-15** by extending the existing pagination walker with a list-vs-detail classifier (already-half-built territory).
4. **Take SG-32, SG-33, SG-34, SG-46** as a "RFC-7232 + Reserved-Headers" walker bundle — they cluster naturally.
5. **Reframe SG-50 (Idempotency-Key)** in the brainstorm: the IETF draft formalises it as a generic header, so it can move out of the vendor-only domain-knowledge layer into Stage A as a `hint`-rule on POST-creation operations.
6. **Severity audit** on M8/M14 (and any others where this mining cross-references say MUST/SHOULD against apiq's `hint`).
7. **Defer LL-1..LL-18 to LLM phase** — confirmed on the basis of false-positive risk.
