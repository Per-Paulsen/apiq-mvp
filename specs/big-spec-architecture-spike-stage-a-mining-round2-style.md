# Stage-A Mining Round-2 Phase E — Style-Coherence (Lens 5)

> **Task #31 — Mining-Round-2 Phase E.** Style-Coherence is harder than other Lenses because
> "REST" itself is ambiguous (Level-2 vs Level-3 in Richardson's model), and the major API styles
> are mutually-exclusive (REST envelope vs JSON:API envelope vs HAL envelope vs OData
> `@odata.*` annotations). Coherence-checks are about **internal consistency**, not about picking
> the "right" style.
>
> **Authored:** 2026-05-05.
>
> **Scope discipline.** Stage A only takes mechanically-detectable patterns. Anything that needs
> domain-knowledge ("is this Stripe?" → no, that's LLM) or runtime context is dropped. The
> Style-Coherence detectors here are mostly **heuristic with high confidence** — they're either
> structural-marker-checks (`_links`, `@odata.*`) or path-shape-checks (RPC verbs) that scale
> across any spec without vendor-conditionals.
>
> **Critical caveat.** Many style-coherence checks are **suggestive, not prescriptive**. Apiq
> must NOT enforce "you should be JSON:API" — that's opinion-overreach. Instead, apiq detects:
> 1. **Style-mixing** within one spec (some endpoints REST, some RPC) — confusing for clients.
> 2. **Style-conformance gaps** when a style is *declared* (content-type `application/vnd.api+json`
>    present but envelope shape doesn't conform).
> 3. **Style-marker leakage** (HAL `_links` on some responses, JSON:API `data`-envelope on others —
>    pick one).

---

## Sources surveyed

| Source | URL | Style-defined | Notes |
|---|---|---|---|
| **JSON:API spec v1.1** | jsonapi.org/format/ | JSON:API envelope (`data`/`errors`/`meta`/`jsonapi`/`links`/`included`), resource objects (`type`/`id`/`attributes`/`relationships`), error objects, sparse fieldsets, sorting, filtering, pagination, includes, content-type `application/vnd.api+json` | RFC-2119 keywords throughout. v1.1 is current; v1.2 in development. WebFetch denied — sourced from WebSearch + 2nd-tier mirrors. |
| **HAL (Hypertext Application Language)** | stateless.group/hal_specification.html, IETF draft-kelly-json-hal-11 (2023-10-10) | `_links` with link-relations + `_embedded` for nested resource objects; `self` link convention; CURIEs for compact custom rel-names; media types `application/hal+json` and `application/hal+xml` | RFC-style language; both JSON and XML variants. |
| **Siren spec** | github.com/kevinswiber/siren | Entity (`class[]`/`title`/`properties`/`entities[]`/`actions[]`/`links[]`); Action (`name`/`method`/`href`/`fields[]`/`title`/`type`); Field (HTML5 input-types); media type `application/vnd.siren+json` | More verbose than HAL — includes affordances/actions, not just links. |
| **OData v4 / v4.01** | docs.oasis-open.org/odata/odata/v4.01/, odata.org | `$select`/`$filter`/`$orderby`/`$top`/`$skip`/`$count`/`$expand`/`$search`/`$format`/`$apply`/`$batch`/`$ref`/`$value`; response envelope `@odata.context`/`@odata.nextLink`/`@odata.count`/`value`; entity-set/key URL pattern; nav-properties; media-type `application/json;odata.metadata=full|minimal|none` | OASIS standard. Heavy enterprise-Microsoft adoption. |
| **gRPC style guide** | grpc/grpc/blob/master/doc/naming.md, AIP-127 (HTTP/JSON Transcoding) | Protobuf naming — `lower_snake_case` fields, `PascalCase` messages, `VerbNoun` method names, `CAPITALS_WITH_UNDERSCORES` enum-values; HTTP transcoding conventions in `google.api.http` annotations | gRPC's "REST face" via transcoding is the bridge into OpenAPI. |
| **Google AIP-1** (Purpose) | google.aip.dev/1 | Framework. | Not directly detectable. |
| **Google AIP-121** (Resource-Oriented Design) | google.aip.dev/121 | Resource-hierarchy as alternating collection/id segments; standard methods (Get/List/Create/Update/Delete); custom methods via `:verb` suffix (NOT verbs-naked-in-path) | The big REST/RPC dividing line. |
| **Google AIP-122** (Resource Names) | google.aip.dev/122 | Resource-name format `collections/id/sub-collections/id`; collection names lowerCamelCase; ID character set per RFC-1123 (DNS-safe); user-IDs `^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$`; ≤63 chars | Strong "Google-style" marker. |
| **Google AIP-127** (HTTP/gRPC Transcoding) | google.aip.dev/127 | `google.api.http` annotation format; URL pattern; body mapping | Transcoding-tells. |
| **Google AIP-131** (Get) | google.aip.dev/131 | Standard Get method shape | |
| **Google AIP-132** (List) | google.aip.dev/132 | Request: `parent`/`page_size`/`page_token`/`filter`/`order_by`; response: `next_page_token`/`total_size`; `desc` suffix on order_by | Strong AIP-style marker. |
| **Google AIP-133** (Create) | google.aip.dev/133 | Standard Create method shape | |
| **Google AIP-134** (Update) | google.aip.dev/134 | Standard Update method shape; field-mask | |
| **Google AIP-135** (Delete) | google.aip.dev/135 | Standard Delete method shape; soft-delete | |
| **Google AIP-136** (Custom Methods) | google.aip.dev/136 | Colon-verb syntax (`POST /tags:archive`); when to use vs avoid (only when standard 5 don't fit); GET on `:verb` only for read-only | Detectable in path. |
| **Google AIP-140** (Field Names) | google.aip.dev/140 | `lower_snake_case`; no leading/trailing/adjacent underscores; plurals for repeated; reserved suffixes `_id`, `_name` (avoid unless ambiguous) | snake_case pillar. |
| **Google AIP-142** (Time/Duration) | google.aip.dev/142 | `*_time` (imperative form, NOT past-tense `*ed_time`); `google.protobuf.Timestamp` ↔ RFC 3339 string; `google.protobuf.Duration` for spans | "Use `publish_time` not `published_time`" is detectable. |
| **Google AIP-143** (Standardized Codes) | google.aip.dev/143 | ISO 4217 currency, ISO 3166 country, BCP-47 language, etc. | (Already in Round-1 SG-21..23.) |
| **Google AIP-148** (Standard Fields) | google.aip.dev/148 | `name` (resource-name), `display_name` (mutable, ≤63), `uid` (UUID4, output-only), `create_time`/`update_time`/`delete_time` (Timestamp, output-only), `etag` (RFC 7232), `annotations` (map<string,string> namespaced), `labels` | Very specific Google-style marker. |
| **Google AIP-154** (Resource Freshness) | google.aip.dev/154 | `etag` field (string, RFC-7232 quoted); If-Match semantics → ABORTED on mismatch | |
| **Google AIP-158** (Pagination) | google.aip.dev/158 | `page_size` + `page_token` request fields; `next_page_token` + optional `total_size` response fields | Already cross-referenced by Round-1 SG-15. |
| **Google AIP-160** (Filtering) | google.aip.dev/160 | Filter language — `field op value`, `AND`/`OR` (OR has higher precedence — UNUSUAL), `NOT`/`-`, `.`-traversal, fuzzy whitespace-AND, type-coercion | Paired with `filter` query parameter. |
| **Google AIP-185** (API Versioning) | google.aip.dev/185 | Major/minor versioning rules | (Versioning lens already in Round-1 H1/H2.) |
| **Google AIP-190** (Naming Conventions) | google.aip.dev/190 | General naming rules | Cross-cuts AIP-122/140. |
| **Google AIP-203** (Field Behavior) | google.aip.dev/203 | `(google.api.field_behavior)` annotation: REQUIRED, OUTPUT_ONLY, INPUT_ONLY, IMMUTABLE, UNORDERED_LIST, NON_EMPTY_DEFAULT, IDENTIFIER | Compiles to OpenAPI as `readOnly`/`writeOnly`/`required` etc. |
| **Microsoft REST API Guidelines** | github.com/microsoft/api-guidelines/azure/Guidelines.md | Resource-vs-action: action via POST + verb-as-action-segment; explicit warning that "verbs in URI = RPC, NOT REST"; colon-verb tolerated as tradeoff; idempotent vs non-idempotent | Already partially mined Round-1. |
| **Roy Fielding REST dissertation** | ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm | 6 architectural constraints: client-server, stateless, cacheable, layered system, code-on-demand (optional), uniform interface (4 sub-constraints — resource identification, manipulation through representations, self-descriptive messages, HATEOAS) | Most constraints are runtime, not spec-detectable. HATEOAS detectable as link-shape presence. |
| **Richardson Maturity Model** | restfulapi.net/richardson-maturity-model/ + Wikipedia | Level 0 (POX, single endpoint single verb), Level 1 (Resources), Level 2 (HTTP verbs), Level 3 (HATEOAS / hypermedia controls) | Level 2 = de-facto-REST; Level 3 = HATEOAS-rare-in-prod. |
| **APIs You Won't Hate (style-guide)** | apisyouwonthate.com (already-mined Round-1) | Pragmatic Level-2 REST + RFC-7807 + OAS conventions | Already in brainstorm. |

---

## API-Style Taxonomy

> Establish the universe of "Styles" before defining "incoherence". Each Style has detectable
> structural markers in an OpenAPI spec.

### Style 1 — Pure-RPC (Richardson Level 0–1)
- **Markers:** verbs in path (`/getUser`, `/createOrder`, `/login`, `/search`); usually all-POST
  or single-endpoint-per-RPC; methods carry no semantic distinction.
- **Examples:** SOAP/RPC bridges, legacy XML-RPC.
- **OAS-detection:** path segments matching `^(get|create|list|update|delete|fetch|do|run|exec|...)[A-Z]\w*$`
  or `^(get|create|...)_\w+`; PUT/DELETE never used.

### Style 2 — REST-Level-2 (HTTP verbs + resource paths) — De-facto-REST
- **Markers:** plural-noun resource paths (`/users`, `/orders`); HTTP methods carry semantics
  (GET=read, POST=create, PUT=replace, PATCH=update, DELETE=delete); status codes used; Content-Type
  declared; no hypermedia.
- **Examples:** Most public REST APIs (GitHub, Stripe-mostly, Twilio, Slack).
- **OAS-detection:** plural noun path-segments + GET+POST+PUT+PATCH+DELETE distribution +
  `application/json` content-type.

### Style 3 — REST-Level-3 / HATEOAS (hypermedia controls)
- **Markers:** Response payloads include link-relations to next-states (typically `_links`,
  `links`, `relationships`, `actions`); clients discover affordances at runtime; servers can
  evolve URLs without breaking clients.
- **Examples:** PayPal (partial), GitHub Hypermedia branch, FHIR, Spring HATEOAS.
- **OAS-detection:** response-schemas with `_links`/`links`/`href`/`rel`/`actions` properties.
- **Sub-styles:** HAL, JSON:API, Siren are HATEOAS-flavored representations.

### Style 4 — JSON:API
- **Markers:** Content-type `application/vnd.api+json`; top-level `data`/`errors`/`meta`/`jsonapi`/
  `links`/`included` envelope; resource-objects (`type`/`id`/`attributes`/`relationships`); error-
  objects (`id`/`status`/`code`/`title`/`detail`/`source`/`meta`); query params `page[number]`/
  `page[size]`/`sort`/`filter`/`fields[type]`/`include`; pagination links `first`/`last`/`prev`/`next`
  in top-level `links`.
- **MUST/MUST-NOTs:** `data` and `errors` MUST NOT coexist; `included` MUST NOT be present without
  `data`; `id` and `type` MUST be strings; `attributes` MUST be an object.
- **OAS-detection:** content-type allowlist + envelope-schema-shape.

### Style 5 — HAL (Hypertext Application Language)
- **Markers:** Content-types `application/hal+json` or `application/hal+xml`; response objects
  contain `_links` (link-relations object → href + properties) and optional `_embedded`
  (resource-objects); `self`-link convention; CURIE syntax in `_links.curies` for compact rels.
- **OAS-detection:** content-type + `_links`/`_embedded` properties on response schemas.

### Style 6 — Siren
- **Markers:** Content-type `application/vnd.siren+json`; response objects with `class[]` (array
  of strings classifying entity), `properties`, `entities[]` (sub-entities or links), `actions[]`
  (with `name`/`method`/`href`/`fields[]`), `links[]` (with `rel`/`href`); HTML5-input-types in
  Field-objects.
- **OAS-detection:** content-type + `class`/`actions`/`entities` properties on response schemas.

### Style 7 — OData
- **Markers:** Content-type `application/json;odata.metadata=full|minimal|none`; response
  envelope `@odata.context`/`@odata.nextLink`/`@odata.count`/`value`; query options `$filter`/
  `$select`/`$expand`/`$orderby`/`$top`/`$skip`/`$count`/`$batch`/`$ref`/`$value`; URL pattern
  `EntitySet(KeyValue)/NavigationProperty` (e.g., `/Customers('ALFKI')/Orders`).
- **OAS-detection:** `@odata.*` properties + `$`-prefixed query-parameters + parenthesis-based
  key-predicate URL syntax.

### Style 8 — Google-AIP / gRPC-via-Transcoding
- **Markers:** Resource-hierarchy paths `collections/id/sub-collections/id` (alternating); custom
  methods use `:verb` suffix (`POST /tags:archive`); request shape with `parent`/`name`/`page_size`/
  `page_token`/`filter`/`order_by` fields; response shape with `next_page_token`/`total_size`;
  field-name `lower_snake_case`; standard fields `name`/`display_name`/`uid`/`create_time`/
  `update_time`/`delete_time`/`etag`/`annotations`/`labels`; collection names `lowerCamelCase`;
  imperative-form time fields (`publish_time` NOT `published_time`).
- **OAS-detection:** `:verb`-suffix paths + AIP-pagination-fieldnames + standard-field-names + alternating
  path structure.

### Style 9 — Custom-Bespoke (the long tail)
- **Markers:** Doesn't match any of 1–8 cleanly. May have idiosyncratic envelopes (`{"result":...}`,
  `{"success":bool, "data":...}`, `{"items":[]}` instead of standard list-pagination).
- **OAS-detection:** by exclusion. Common-but-non-standard patterns (`success`-flag, `result`-wrapper).

### Style 0 — Mixed (the failure mode this lens detects)
- **Markers:** Spec contains elements of ≥2 styles in different operations. THIS is the primary
  detection target.
- **Examples:** REST list-endpoints + RPC `/login`/`/logout` (very common, often legitimate);
  REST core + JSON:API on a single subset of endpoints; Custom-bespoke envelope on List but
  bare object on Get.

---

## Patterns extracted

### Generic Style-Coherence Detectors (take into apiq)

These detect **internal consistency** of a spec without prescribing a specific style. Most are
heuristic but deterministic-detectable.

| ID | Pattern | Detects-incoherence-against-which-Style | Source | Multi-Lens-Tags | Severity-Axis | Detection-feasibility | Notes |
|---|---|---|---|---|---|---|---|
| SC-1 | **REST-vs-RPC mixing in paths.** Some paths follow plural-noun resource style (`/users`, `/orders`), others follow RPC-verb style (`/login`, `/createOrder`, `/searchUsers`). Flag the spec when both shapes appear above a threshold (e.g. ≥10% of paths each). Existing brainstorm S8 detects RPC-verbs (single-rule). SC-1 is the **mixing** detector. | Style-2 vs Style-1 within one spec | Microsoft Guidelines, Google AIP-121, Richardson Maturity Model L1 vs L2 | Lens-4 (client-friction) + Lens-5 | hint (SHOULD; auth/search/health/login frequently break the rule legitimately) | mech-stat (path-template-classifier; ratio of "rest-like" vs "rpc-like" paths) | Existing brainstorm S8 is the *single-pattern* detector ("verbs-in-paths"). SC-1 generalises to a *style-mixing* signal. Threshold-based to avoid false-positives on `/login`/`/search`/`/health` exceptions. |
| SC-2 | **Custom-method colon-verb consistency.** If the spec uses Google AIP-style `:verb` suffix on at least one path (`POST /resources/{id}:archive`), check that ALL non-CRUD operations use the colon-verb pattern, NOT a mix of `:verb` + naked-RPC-paths (`/archiveResource`). | AIP-style (Style-8) consistency | Google AIP-136, Microsoft Guidelines | Lens-4 + Lens-5 | hint | mech (path-regex `:[a-z]\w+$`) | New. Worth checking once but rare in non-Google APIs. Probably off-by-default. |
| SC-3 | **HTTP-method semantics adherence.** Detect operations that violate verb-semantics: GET with state-changing summary/description (e.g., contains "create"/"delete"/"update"/"set"); POST with idempotent description ("retrieve"/"list"); DELETE with non-idempotent description; PUT vs PATCH confusion. | Style-2 (REST-Level-2) violations | Fielding dissertation §5, Microsoft Guidelines, Google AIP-131..135 | Lens-4 (client-friction) + Lens-5 | warn for hard violations (state-change-words on GET); hint for soft (PUT/PATCH ambiguity) | heur (keyword scan in summary/description) | New. Tricky because "list" is ambiguous when it's actually a POST that returns a query result. Keep as hint with strict allowlist of action-words in GET-summaries. |
| SC-4 | **Hypermedia-marker presence: consistent across responses.** If ANY response-schema in the spec has `_links` / `_embedded` / `links` / `relationships` / `actions` / `href` / `rel` properties (HATEOAS markers), check that the same markers appear consistently on resource-shaped responses. Mixing HATEOAS-on-some-endpoints + bare-object-on-others = client-friction. | Style-3/4/5/6 vs Style-2 within one spec | HAL spec, JSON:API, Siren, Fielding HATEOAS | Lens-4 + Lens-5 | hint | mech (property-name scan) | New. Critical: "consistent" doesn't mean "all responses must have it" — singletons / errors / commands legitimately don't. Heuristic: list+detail responses for the same resource should agree. |
| SC-5 | **Envelope-style coherence cross-list-endpoints.** All list-endpoints (responses with array-shape) should use the SAME envelope: bare-array OR `{data: [...], pagination}` OR `{items: [...], meta}` OR JSON:API `{data: [...], links, meta}` OR OData `{value: [...], @odata.nextLink}`. Multiple envelope shapes within one spec = high client-friction. | Style-mixing for list responses | JSON:API, OData, Microsoft Guidelines, Google AIP-132 | Lens-4 (client-friction) + Lens-5 | warn | mech-stat (response-schema-shape-classifier) | New. Companion to existing brainstorm E4. SC-5 is the **classifier** — it picks the dominant envelope shape and flags the outliers, instead of just flagging any inconsistency. |
| SC-6 | **Resource-name pluralisation coherence.** All resource paths should be either consistently plural (`/users`, `/orders`) OR consistently singular (`/user`, `/order`). Mixing is high-friction. | Style-2 internal coherence | Google AIP-122, Zalando #134, JSON:API, REST-tutorials | Lens-4 + Lens-5 | warn | mech-stat (path-segment classifier; existing apiq S7 covers as hint) | Brainstorm S7 already covers (currently `hint`). Mining suggests this is high-friction; consider upgrade to `warn`. Caveat: singletons (`/me`, `/account`) legitimately singular. |
| SC-7 | **Path-segment alternation (collection/id pattern).** Per Google AIP-122, well-formed resource hierarchies alternate `collection/id/sub-collection/id`. Detect anti-patterns: two-IDs-in-a-row (`/users/{user_id}/{org_id}`), two-collections-in-a-row (`/users/orders`, ambiguous), or singletons with IDs (`/account/{id}` where `account` is global). | Style-8 (AIP) coherence | Google AIP-122, Microsoft Guidelines | Lens-4 + Lens-5 | hint | graph (path-template-parser extension) | Adjacent to brainstorm A-MIN-4 (consecutive-path-parameters). SC-7 is the broader alternation-classifier. |
| SC-8 | **Pagination-shape coherence.** All list endpoints should use the SAME pagination shape: cursor (`page_token` + `next_page_token`) OR offset (`limit`/`offset`) OR page-based (`page` + `page_size`) OR Link-header. Mixing is brainstorm E2/E3. SC-8 is more strict: pick the dominant shape via classifier, flag outliers. | Style-mixing on pagination | Google AIP-158, JSON:API, OData, Microsoft Guidelines, Zalando #137 | Lens-4 + Lens-5 | warn | mech-stat (existing apiq pagination-walker) | Existing brainstorm E2/E3 + apiq Pagination-Style-Inconsistency-Walker covers it. SC-8 confirms importance + adds Google-AIP shape (`page_token`/`next_page_token`/`page_size`). |
| SC-9 | **Error-shape coherence cross-spec.** All 4xx/5xx responses across the spec should reference the SAME error-schema component (or use the SAME content-type — `application/problem+json`, JSON:API errors, custom). Inline-different-error-schemas-everywhere = client must write multiple error-handlers. | Style-3 cross-cutting (also Lens-2 RFC-7807) | RFC 7807, JSON:API §errors, Heroku, Microsoft, Zalando | Lens-2 (Standards) + Lens-4 + Lens-5 | warn | mech-stat ($ref-graph + content-type analysis) | Existing brainstorm K1/K4 covers; SC-9 is the cross-op consistency flag. Mining round-1 already upgraded to warn. |
| SC-10 | **JSON:API conformance check** (when content-type declared). If ANY response declares `application/vnd.api+json`, verify the response-schema has the JSON:API envelope: `data` (object or array of resource-objects with `type`+`id` strings), or `errors`, or `meta` at top level. Flag declared-JSON:API-but-not-conformant. | Style-4 conformance | JSON:API §1.1 spec | Lens-2 + Lens-5 | warn | mech (content-type allowlist + envelope-shape match) | New. **Important:** only fires when the content-type is declared, so no false-positives on non-JSON:API specs. High-precision check. |
| SC-11 | **HAL conformance check** (when content-type declared). If ANY response declares `application/hal+json`, verify response-schema has `_links` property. Optionally check `self`-relation present. | Style-5 conformance | HAL spec | Lens-2 + Lens-5 | warn | mech | New. Same precision-pattern as SC-10. |
| SC-12 | **Siren conformance check** (when content-type declared). If `application/vnd.siren+json` declared, verify response-schema has `class` array property. | Style-6 conformance | Siren spec | Lens-2 + Lens-5 | hint | mech | New. Niche — Siren is rare in production. Hint severity. |
| SC-13 | **OData conformance check** (when content-type declared). If `application/json;odata.metadata=*` declared OR `$`-prefixed query-parameters used, verify list-responses have `value` array + `@odata.context` envelope. | Style-7 conformance | OData v4.01 | Lens-5 | warn | mech | New. Critical for enterprise/Microsoft-stack users. |
| SC-14 | **Style-marker leakage** (mixed-envelope-markers in one spec). Flag specs where some responses use HAL `_links` + others use JSON:API `data`-envelope + others use bare-objects. Pick-one-style or live-with-confusion. | Style-3/4/5/6 mixed within one spec | HAL, JSON:API, Siren | Lens-4 + Lens-5 | warn | mech-stat | New. Higher-level than SC-4; SC-14 detects mixing of *different* hypermedia-styles, not just hypermedia-on-some/none. |
| SC-15 | **CRUD symmetry per resource path.** For each resource collection-path, check the verb-distribution: a resource with POST + GET-list typically should have GET-detail + PUT/PATCH + DELETE on `/{id}` sub-path (or document why not). Asymmetric-CRUD = potentially-deliberate, but worth flagging. | Style-2 internal completeness | Google AIP-121 (standard methods), REST tutorials | Lens-4 (client-friction) + Lens-5 | hint | graph (HTTP-method coverage analyse, existing apiq §5) | Existing brainstorm-mechanic §5 covers; SC-15 is the formal-rule version. |
| SC-16 | **Resource-vs-Action shape.** Operations on `/{resource}/{id}/{action}` (paths ending in non-templated action segment after an ID — e.g., `/orders/{id}/cancel`, `/users/{id}/activate`) are RESTful actions and OK; operations like `/cancelOrder?id=...` (verb-as-resource + ID-as-query) are RPC-style, flag inconsistency. | Style-2 vs Style-1 specifically for action-endpoints | Microsoft Guidelines, Google AIP-136 | Lens-4 + Lens-5 | hint | mech (path-pattern) | Companion to SC-1 / S8. Specific case: RESTful-action-on-resource (allowed) vs RPC-action-with-resource-as-param (smell). |
| SC-17 | **HTTP-method per operation distribution shape.** A pure-RPC spec is mostly POST. A REST-2 spec balances GET/POST/PUT/PATCH/DELETE. A read-mostly API is mostly GET. Outliers: `>90% POST` = likely RPC-style despite resource-path naming; `100% GET + DELETE` = read-mostly + tombstones (unusual). | Style-1 vs Style-2 distribution | Richardson Maturity Model L1 vs L2 | Lens-5 | hint | mech-stat | New. Statistical signal that complements path-shape SC-1. |
| SC-18 | **Field-name casing-consistency cross-spec** (already brainstorm G1, here re-tagged for Lens-5). When a JSON-style is implied by content-type or markers (HAL/JSON:API/AIP), the field-naming convention is ALSO usually implied: HAL/JSON:API use camelCase typically; Google-AIP uses snake_case. Flag specs where the implied-style and the actual-naming-pattern conflict (e.g., `vnd.api+json` content-type but mixed snake_case+camelCase fields). | Style-coherence between content-type and field-naming | JSON:API §convention, Google AIP-140 | Lens-4 + Lens-5 | hint | mech-stat | New cross-Lens linkage. Existing brainstorm G1 (Walker) is the foundation. |
| SC-19 | **Time-field naming convention coherence.** AIP-142 says `*_time` (imperative form) — `publish_time`, NOT `published_time`. Many specs mix `created_at`/`updated_at` (Rails convention) with `*_time` (Google convention) within ONE spec. Both are valid; mixing = client-friction. | Time-naming-style coherence | Google AIP-142, Rails/Stripe convention, Microsoft `#json-date-time-is-rfc3339` | Lens-4 + Lens-5 | hint | mech-stat (regex on property-names) | Brainstorm I4 covers date-format-mixing. SC-19 is property-name-suffix-style mixing (`*_at` vs `*_time` vs `*ed`). |
| SC-20 | **Standard-field-presence on resource-shapes** (when AIP-style indicated). If a spec uses AIP-style markers (`page_token`/`next_page_token`/`:verb`-paths), check whether the resource schemas use AIP-148 standard fields: `name`, `display_name`, `create_time`, `update_time`, `etag`. Missing-standard-fields-when-style-suggests-AIP = incomplete-AIP-conformance. | Style-8 (AIP) conformance | Google AIP-148 | Lens-5 | hint | mech | New. Off-by-default. AIP-style is rare outside Google Cloud; high false-positive risk on non-AIP-intending specs. |
| SC-21 | **Reserved-field-name leakage from non-target style.** Specs that aren't OData should NOT have `@odata.*` annotation properties; specs that aren't JSON:API should NOT have `data`/`included`/`relationships` envelopes; specs that aren't HAL should NOT have `_links`/`_embedded`. Detect cross-style accidental adoption (someone copy-pasted a JSON:API example into an otherwise REST-2 spec). | Style-marker leakage | All hypermedia specs | Lens-4 + Lens-5 | hint | mech (property-name allowlist per content-type) | New. False-positive risk on specs that genuinely use `_links` as a custom-not-HAL marker. Hint severity. |
| SC-22 | **Filter-syntax coherence.** AIP-160 (`name = "foo" AND age > 18`), JSON:API (`filter[field]=value`), OData (`$filter=Name eq 'foo'`), Stripe-style (multiple `?status=...&type=...` query params) — all valid; mixing within one spec = client-friction. Detect ≥2 filter-style markers (e.g., both `filter` query-param AND `$filter` query-param exist in different operations). | Filter-style coherence | Google AIP-160, JSON:API §filtering, OData v4.01 | Lens-4 + Lens-5 | hint | mech-stat (query-parameter-name classifier) | New. Detects via parameter-name patterns: `filter` (AIP), `filter[*]` (JSON:API), `$filter` (OData), free-form (Custom). Pick-one-style heuristic. |
| SC-23 | **Sort-syntax coherence.** AIP-132 (`order_by=field desc`), JSON:API (`sort=-field`), OData (`$orderby=field desc`), Stripe-style (`sort_by=field&sort_dir=desc`). Mixing = friction. | Sort-style coherence | Google AIP-132, JSON:API §sorting, OData v4.01 | Lens-4 + Lens-5 | hint | mech-stat | New. Same pattern as SC-22. |
| SC-24 | **Asymmetric-resource-shape (POST vs GET response).** If POST `/resources` returns shape A, and GET `/resources/{id}` returns shape B (different schemas, not subset/superset), flag — this is a Lens-4 friction-pattern AND a style-incoherence (POST should return the same resource-representation as GET in REST-2). | Style-2 internal coherence | Google AIP-133 (Create returns Resource), Microsoft Guidelines | Lens-4 + Lens-5 | warn | graph (cross-op resource-symmetry-checker, brainstorm DM-9/DM-10) | Already in brainstorm DM-9/DM-10/D-MIN-3. SC-24 re-tags for Lens-5. |
| SC-25 | **Status-code distribution per operation type.** RESTful POST→201 (created); RESTful PUT→200 or 204; RESTful DELETE→204 or 200; RPC-style mostly returns 200 for everything. Detect specs where state-changing methods all return 200 (no 201/204/202) — likely RPC-style despite REST-paths. | Style-2 vs Style-1 status-code distribution | RFC 7231, Microsoft Guidelines, Google AIP-133..135 | Lens-2 + Lens-5 | hint | mech-stat | New. Companion to SC-17 (verb-distribution); together they help classify the spec's actual-style despite naming. |

### Style-Conformance Detectors (declared style → check actual conformance)

These fire ONLY when a spec self-identifies via media-type or unambiguous markers. High-precision,
low-false-positive.

| ID | Pattern | Conforming-Style | Source | Severity-Axis | Notes |
|---|---|---|---|---|---|
| SCF-1 | Content-type `application/vnd.api+json` declared anywhere → top-level response schemas must have `data` (object or array) OR `errors` array OR `meta`; `data` and `errors` must NOT coexist. `included` must NOT appear without `data`. | JSON:API v1.1 | jsonapi.org/format/ §Document Structure | warn (declared-style-violation) | High-precision. Inline structural test on response-schemas. |
| SCF-2 | When `application/vnd.api+json` declared → resource objects in `data` must have `type` (string) + `id` (string) members. | JSON:API v1.1 | §Resource Objects | warn | |
| SCF-3 | When `application/vnd.api+json` declared → error objects must contain at least one of {`id`, `links`, `status`, `code`, `title`, `detail`, `source`, `meta`}; `status` must be string-typed. | JSON:API v1.1 | §Error Objects | warn | |
| SCF-4 | When `application/vnd.api+json` declared → pagination params should use `page[number]`/`page[size]` OR `page[cursor]`/`page[size]` syntax (NOT `page=`/`per_page=`). | JSON:API v1.1 | §Pagination | hint | |
| SCF-5 | When `application/vnd.api+json` declared → top-level `links` should include `first`/`last`/`prev`/`next` for paginated collections. | JSON:API v1.1 | §Pagination Links | hint | |
| SCF-6 | When `application/vnd.api+json` declared → no extra members other than {`data`, `errors`, `meta`, `jsonapi`, `links`, `included`} at top level. | JSON:API v1.1 | §Top-Level | warn | |
| SCF-7 | When `application/hal+json` declared → response schemas should have `_links` object property; if non-list-resource, should have `self` relation. | HAL spec | hal_specification.html | warn | |
| SCF-8 | When `application/hal+json` declared and `_embedded` present → `_embedded` values must be HAL-resource-shaped (recursively). | HAL spec | | hint | |
| SCF-9 | When `application/vnd.siren+json` declared → response schema must have `class` array property. | Siren spec | github.com/kevinswiber/siren | warn | |
| SCF-10 | When `application/vnd.siren+json` declared and `actions` present → each action object must have `name` (unique string) + `href` (URI string). | Siren spec | | warn | |
| SCF-11 | When OData markers detected (`@odata.context` in response, OR `$`-prefixed query params, OR `application/json;odata.metadata=*` content-type) → list-responses should have `value` array. | OData v4.01 | docs.oasis-open.org/odata/odata/v4.01/ | warn | |
| SCF-12 | When OData declared → query-parameter names with `$`-prefix should use the OData-allowed set: `$select`, `$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$expand`, `$search`, `$format`, `$apply`, `$batch`, `$ref`, `$value`. Unknown `$`-prefixed params = OData drift. | OData v4.01 | | hint | |
| SCF-13 | When AIP-style detected (`:verb`-suffix paths exist) → custom-method paths must use POST (or GET only for read-only ops). | Google AIP-136 | google.aip.dev/136 | warn | |
| SCF-14 | When AIP-style detected → list-operations should use `parent`/`page_size`/`page_token`/`filter`/`order_by` request fields and `next_page_token`/`total_size` response fields (NOT mix with `limit`/`offset`/`page`). | Google AIP-132/158 | | hint | |
| SCF-15 | When AIP-style detected → resource paths should alternate collection/id segments (per AIP-122). | Google AIP-122 | | hint | |
| SCF-16 | When AIP-style detected → field names should be `lower_snake_case`; collection names `lowerCamelCase`. | Google AIP-140/122 | | hint | |
| SCF-17 | When AIP-style detected → time fields should use imperative form `*_time` (NOT `*ed_time`/`*ed_at`). | Google AIP-142 | | hint | Existing brainstorm I4 covers (date-format mixing); SCF-17 is naming-form. |

### Already-in-apiq-brainstorm

| brainstorm-ID | external-source-confirms | Notes |
|---|---|---|
| S8 (verbs in paths — RPC smell) | AIP-121, AIP-136, Microsoft Guidelines, Richardson L1-vs-L2 | Confirmed; SC-1 generalises to mixing-classifier. |
| S7 (plural vs singular path-segments) | AIP-122, JSON:API, Zalando #134 | Confirmed; SC-6 is direct re-tag. |
| E2/E3 (pagination-naming consistency) | AIP-158, JSON:API, OData, Microsoft, Zalando | Confirmed; SC-8 is the formal classifier. |
| E4 (list-response-wrapper consistency) | JSON:API §Document, OData `value`, Microsoft `#collection-formatting` | Confirmed; SC-5 is the cross-op classifier. |
| K1/K2/K4 (error-schema consistency) | JSON:API errors, RFC 7807, Heroku, Microsoft | Confirmed; SC-9 cross-op flag. |
| G1/G2 (camelCase vs snake_case) | AIP-140 (snake), Microsoft (camel), JSON:API (camel typical) | Confirmed; SC-18 is the cross-style-coherence linkage. |
| I4 (date-format consistency) | AIP-142, Microsoft, Zalando | Confirmed; SC-19 adds property-name-form mixing. |
| D1 (2xx-response-type consistency cross-op) | AIP-133, Microsoft, IBM resource-response-consistency | Confirmed; SC-24 re-tag. |
| D3 (response-components with same status have same schema) | AIP-148 standard fields, JSON:API, OData | Confirmed. |
| L5 (Request-vs-Response asymmetry) | AIP-133 Create returns Resource | Confirmed. |
| H1/S4 (URL versioning vs Header versioning mixing) | AIP-185, Microsoft `#versioning-no-version-in-path`, Zalando | (Lens-3 evolution-friction; not Lens-5.) |
| Y-25 (idempotency-key for unsafe-POST) | RFC-draft, AYWH, Stripe convention | (Lens-1 + Lens-2; not Lens-5.) |

### Out-of-scope

Patterns surfaced but explicitly NOT taken into Stage A.

| ID | Pattern | Source | Why-skip |
|---|---|---|---|
| OOS-1 | "API uses HATEOAS / Level-3-REST" as a mandate | Fielding HATEOAS, Richardson L3 | Opinion-overreach. Apiq must NOT enforce hypermedia adoption. Detection of *consistency* (SC-4) ✓; detection of *level* ✗. |
| OOS-2 | "API should be Google-AIP-style" as a mandate | Google AIPs | Opinion-overreach. Detection of conformance-when-declared (SCF-13..17) ✓; prescription ✗. |
| OOS-3 | "API uses semantic links (rel=)" prescription | HAL, Atom Publishing Protocol, IETF link-relations | Same as OOS-1. |
| OOS-4 | "API exposes machine-readable schema (JSON Schema, OpenAPI)" | Various | Tautology when the input IS OpenAPI. Skip. |
| OOS-5 | gRPC-protobuf-style detection on OpenAPI specs | gRPC + AIP-127 | Transcoded gRPC produces OpenAPI but with very specific markers (`google.api.http` extensions, `@type` envelope, FieldMask). Detectable but rare; if detected, refer to Google-AIP detectors. Skip as separate detector. |
| OOS-6 | "API uses correct REST verbs for state changes" — soft-detection via summary-NLP | Fielding, Microsoft | LLM-job. SC-3 is hard-detection (keyword scan in summary); soft NLP-detection is Phase B. |
| OOS-7 | "Hypermedia-discoverability" runtime quality | Fielding | Cannot detect from spec alone. Runtime quality. |
| OOS-8 | "Protocol-Buffer 3 conventions" detection | gRPC | Out of OpenAPI scope. |
| OOS-9 | "API consistently HATEOAS at Level 3" detection of completeness | Fielding | Subjective threshold. SC-4 captures the consistency-flag; "completeness" is opinion-overreach. |

### Unsure

| ID | Pattern | Source | Why-unsure |
|---|---|---|---|
| U-SC-1 | **Resource-name-character-set check (DNS-safe IDs).** AIP-122 says resource IDs should be DNS-safe per RFC-1123, lower-case-only. Detect path-template `{*_id}` parameters with patterns conflicting with `^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$`. | AIP-122 | False-positive on UUIDs (which are lower-case-hex but >63 chars). Many specs use integer-IDs. Detection feasible but value unclear unless spec self-identifies as AIP-style. Suggest: SCF-15-companion-only. |
| U-SC-2 | **Field-mask presence detection** (AIP-203 IMMUTABLE, AIP-134 update_mask). | AIP-134/203 | Heuristic only — can detect `update_mask` parameter presence but not annotation-faithful. Borderline: detectable-but-low-precision. Skip default. |
| U-SC-3 | **Long-Running-Operation (LRO) shape.** AIP-151 defines an Operation resource (`name`/`done`/`metadata`/`response`/`error`). Detect LRO-style endpoints (POST returns 202 + Operation-shaped body). | AIP-151 | Niche. Detectable when content-type/schema-shape match but rarely declared. Hint at most. |
| U-SC-4 | **Annotations/labels presence as Kubernetes-style markers.** AIP-148 standard fields `annotations` (dot-namespaced) and `labels`. | AIP-148 | High false-positive on non-Kubernetes-derived APIs. Skip default. |
| U-SC-5 | **Filter-language conformance.** AIP-160 syntax has unusual OR-precedence. We can't validate filter expressions from a spec alone — they're runtime values. | AIP-160 | Unfeasible at spec-level. Skip. |
| U-SC-6 | **Style-coherence-classifier as a single composite score.** Per spec, output one of {RPC, REST-L2, REST-L3-HATEOAS, JSON:API, HAL, Siren, OData, AIP, Custom-Bespoke, Mixed}. | All sources | Tempting but risky — classification mistakes harm trust. Better to surface dimensions (SC-1..25) without forcing a single label. |
| U-SC-7 | **HATEOAS-completeness for declared HAL/Siren/JSON:API.** When a spec is declared as Style-3, every state-transition should be link-discoverable. | Fielding HATEOAS, HAL, Siren | Detection requires understanding what state-transitions exist (LLM-job). At spec-level we can detect link-presence but not completeness. Skip default. |
| U-SC-8 | **Resource-vs-Singleton distinction.** AIP-156 distinguishes singletons (`/account`) from resource-collections (`/accounts/{id}`). Detect singletons-treated-as-collections or vice-versa. | AIP-156 | Rare. Niche. Skip default. |
| U-SC-9 | **Custom-method side-effect signal: GET `:verb` for read-only, POST otherwise.** AIP-136 mandates this. | AIP-136 | Detectable but only fires on AIP-style specs. SCF-13 covers. |

### Meta-Observations

**M-1. Style-Coherence is asymmetric: detection-feasibility >> prescription-feasibility.**
The lens has high deterministic-coverage *for consistency*: did the spec mix two styles? — yes/no
is decidable from structure. But "should this spec adopt JSON:API?" is unreachable without
domain context. Apiq stays in the consistency-checking lane.

**M-2. Style-Coherence is heavily tied to Lens-4 (client-friction).**
Almost every SC-* detector has a Lens-4 multi-tag because client-friction IS what style-incoherence
manifests as. The lenses overlap structurally. Implementation-wise, SC-* checks should be reportable
under both Lens-4 and Lens-5 tags.

**M-3. Coherence-detection requires "implied style" classifiers.**
Most SC-* checks need a *style classifier* to fire usefully: classify the spec as REST-L2 by default,
then detect deviations. The classifier is itself heuristic (`>50% plural-noun-paths + >50% non-POST methods → REST-L2`).
This means the implementation-architecture for Lens-5 is **two-stage**:
1. Style classifier (one of {RPC, REST-L2, REST-L3, JSON:API, HAL, Siren, OData, AIP, Custom, Mixed}).
2. Per-style coherence checks (SC-* + SCF-*).

**M-4. Conformance-when-declared is high-precision, almost-no-false-positive.**
SCF-1..17 only fire when the spec self-identifies (content-type, marker-presence). This is the
**safest** style-coherence work: when a spec says "I'm JSON:API", we hold it to the spec. When a
spec says nothing, we don't impose. Strong recommendation: implement SCF-* before SC-*.

**M-5. Mining surfaces no new Lens beyond the 5.**
Style-Coherence is well-covered by existing 5 Lenses (Lens-5 = this; cross-tagged with Lens-2 for
RFC-7807/Standards, Lens-4 for client-friction). No 6th Lens needed.

**M-6. Style-coherence detectors are spec-agnostic by construction.**
None of SC-1..25 / SCF-1..17 require vendor-knowledge ("is this Stripe?"). They use:
- Path-template patterns (universal),
- Property-name patterns (universal),
- Content-type strings (universal IANA markers),
- HTTP-method distributions (universal HTTP semantics).

This means Lens-5 detectors fit cleanly into apiq's Stage-A architectural frame
(deterministic, spec-agnostic, no API-family detection). Good signal.

**M-7. Style-detection-confidence varies by source.**
- **High-confidence-marker:** Content-type strings (`application/vnd.api+json` ⇒ JSON:API; `application/hal+json` ⇒ HAL; `@odata.*` properties ⇒ OData). When present, near-100% precision.
- **Medium-confidence-marker:** Property-name patterns (`_links` + `_embedded` ⇒ HAL-style; `data`+`type`+`id`+`attributes` ⇒ JSON:API-style).
- **Low-confidence-marker:** Path-shape (RPC vs REST). Many specs are 80%-REST-with-some-`/login`-RPC and that's normal.

Apiq's severity-axis should reflect this: SCF-* are warn (high-precision); SC-* are mostly hint (low-precision); SC-3 / SC-5 / SC-9 / SC-24 are warn (cross-op consistency, high client-friction).

**M-8. Style-mixing within one spec is rare-by-design but common-by-accident.**
Real-world data: most specs are coherent at start (single team). Style-mixing emerges over time as:
- Different teams add endpoints with their own style,
- Vendor-acquisitions merge spec-files,
- Documentation-tooling drift (different generators produce different envelope shapes),
- Public-API + Internal-API merge into one spec.

Lens-5 detectors are the early-warning-system for organisational-drift. This makes Lens-5
**high-value for mature/large specs** (Stripe, GitHub, Salesforce-class), low-value for new/small specs.
Severity-tuning should consider spec-size.

**M-9. Brainstorm/Mining-Round-1 already covers the highest-value style-coherence patterns.**
S8 (verbs-in-path), E2/E3 (pagination-naming-consistency), E4 (list-response-wrapper), K1/K2/K4
(error-schema-consistency), D3 (response-shape-consistency), G1/G2 (naming-casing), I4 (date-format),
DM-9/DM-10 (resource-symmetry) — the structural backbone is already there. Round-2 Phase E adds:
- The **classifier-mindset** (statistical / dominant-style / outlier-flagging instead of single-pattern).
- The **conformance-when-declared** family (SCF-1..17) — high-precision, almost-no-false-positive.
- Granular **style-marker-leakage** detection (SC-21).
- Cross-style **filter/sort-syntax** coherence (SC-22, SC-23) — surfaced from comparing AIP-160,
  JSON:API, OData, Stripe.

**M-10. The CRUD-symmetry / standard-method-coverage check (SC-15) is borderline LLM-job.**
"Resource has POST + GET-list but no GET-detail or DELETE — bug or design?" requires understanding
intent. Stage-A can flag the asymmetry; Stage-B (LLM) is the layer that can answer "is this asymmetry
intentional?". Keep SC-15 as `hint` to avoid noise.

**M-11. OData and Google-AIP are the two enterprise-style camps.**
Microsoft-stack and Salesforce-style enterprise APIs lean OData. Google Cloud, gRPC-transcoding, and
Kubernetes-style APIs lean AIP. JSON:API is hipster-Ruby-on-Rails-PHP-Laravel-territory. HAL is
Spring-Java-territory + niche. Siren is rare. Pure-RPC is legacy or developer-internal.
Knowing this helps tune severity per detected style: **enterprise-pillar (OData/AIP) conformance
matters more than hipster-pillar (JSON:API/HAL) conformance** for most apiq-target-users.
This isn't a tuning we can do automatically — but it informs why SCF-11 (OData) / SCF-13..17 (AIP)
should be `warn` while SCF-1..6 (JSON:API) and SCF-7..8 (HAL) might land at `hint` for the
non-declared case (already are).

**M-12. The Style-Coherence lens is the lens where apiq differentiates from existing linters.**
Vacuum, Redocly, Spectral-rulesets — none of them ship a "Style-classifier + style-coherence" module.
They check individual rules (e.g., "RPC verb in path", "pagination consistency") but not "what
is the implied-style of this spec, and how coherent is it to that style?". Lens-5 is therefore
**high-differentiator-potential** if apiq builds the classifier-stage. **Strategically, this is the
"putz-niveau-best-in-class" angle for Stage-A**: not just match Vacuum, but exceed via style-classifier.

---

## Status

- **Authored:** 2026-05-05.
- **Patterns added:** 25 generic-coherence (SC-1..25) + 17 conformance-when-declared (SCF-1..17) = 42 net-new Lens-5 patterns.
- **Cross-confirmation with brainstorm:** 12 brainstorm IDs re-tagged for Lens-5 (S7, S8, E2, E3, E4, K1/K2/K4, G1/G2, I4, D1, D3, L5, DM-9/10).
- **Out-of-scope:** 9 (mostly opinion-overreach or LLM-required).
- **Unsure:** 9 (niche, low-confidence, or composite-classifier).
- **WebFetch denied for jsonapi.org/format/, hal-spec, odata.org, all google.aip.dev pages.** Sources reconstructed from WebSearch summaries + 2nd-tier mirrors (api-linter.aip.dev, GitHub mirrors of AIP markdowns, Wikipedia, restfulapi.net). Quality of citation is "summarised" not "verbatim spec-text". For implementation, the spec-text should be re-verified at coding time.

## Sources

- [JSON:API v1.1](https://jsonapi.org/format/) (and [v1.0 archived](https://jsonapi.org/format/1.0/), [v1.2 in development](https://jsonapi.org/format/1.2/), [recommendations](https://jsonapi.org/recommendations/), [IANA registry application/vnd.api+json](https://www.iana.org/assignments/media-types/application/vnd.api+json), [Drupal core-concepts](https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/core-concepts), [Laravel JSON:API](https://laravel-json-api.readthedocs.io/en/latest/features/media-types/), [Cursor Pagination Profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/))
- [HAL Specification (stateless.group)](https://stateless.group/hal_specification.html) and [IETF draft-kelly-json-hal-11](https://www.ietf.org/archive/id/draft-kelly-json-hal-11.html), [GitHub mikekelly/hal_specification](https://github.com/mikekelly/hal_specification/blob/master/hal_specification.md), [Wikipedia HAL](https://en.wikipedia.org/wiki/Hypertext_Application_Language)
- [Siren spec (kevinswiber/siren)](https://github.com/kevinswiber/siren) and [Siren Best Practices](https://siren-js.github.io/best-practices/)
- [OData v4.01 URL Conventions](https://docs.oasis-open.org/odata/odata/v4.01/odata-v4.01-part2-url-conventions.html), [OData v4.0 URL Conventions](https://docs.oasis-open.org/odata/odata/v4.0/odata-v4.0-part2-url-conventions.html), [OData Basic Tutorial](https://www.odata.org/getting-started/basic-tutorial/), [OData query options Microsoft Learn](https://learn.microsoft.com/en-us/odata/concepts/queryoptions-overview)
- [Google AIP Index](https://google.aip.dev/), individual AIPs: [121 Resource-Oriented Design](https://google.aip.dev/121), [122 Resource Names](https://google.aip.dev/122), [127 HTTP/gRPC Transcoding](https://google.aip.dev/127), [131 Get](https://google.aip.dev/131), [132 List](https://google.aip.dev/132), [133 Create](https://google.aip.dev/133), [134 Update](https://google.aip.dev/134), [135 Delete](https://google.aip.dev/135), [136 Custom Methods](https://google.aip.dev/136), [140 Field Names](https://google.aip.dev/140), [142 Time/Duration](https://google.aip.dev/142), [148 Standard Fields](https://google.aip.dev/148), [154 Resource Freshness](https://google.aip.dev/154), [158 Pagination](https://google.aip.dev/158), [160 Filtering](https://google.aip.dev/160), [185 API Versioning](https://google.aip.dev/185), [190 Naming Conventions](https://google.aip.dev/190), [203 Field Behavior](https://google.aip.dev/203). [api-linter.aip.dev](https://linter.aip.dev/) for rule-text mirrors.
- [gRPC naming](https://github.com/grpc/grpc/blob/master/doc/naming.md), [gRPC core concepts](https://grpc.io/docs/what-is-grpc/core-concepts/), [Velocitas gRPC style guide](https://eclipse.dev/velocitas/docs/concepts/development_model/val/grpc_style_guide/), [Boston Dynamics Protobuf style guide](https://dev.bostondynamics.com/docs/protos/style_guide)
- [Microsoft Azure REST API Guidelines](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md), [Microsoft web API design best practices](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design)
- [Roy Fielding REST dissertation Chapter 5](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm), [Fielding's REST dissertation overview (oleb.net)](https://oleb.net/2018/rest/), [Fielding's misappropriated dissertation (twobithistory)](https://twobithistory.org/2020/06/28/rest.html)
- [Richardson Maturity Model — Wikipedia](https://en.wikipedia.org/wiki/Richardson_Maturity_Model), [Richardson Maturity Model (restfulapi.net)](https://restfulapi.net/richardson-maturity-model/), [HATEOAS — Wikipedia](https://en.wikipedia.org/wiki/HATEOAS), [REST architectural constraints](https://restfulapi.net/rest-architectural-constraints/)
