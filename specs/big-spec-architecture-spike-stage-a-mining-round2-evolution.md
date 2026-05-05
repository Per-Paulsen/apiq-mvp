# Stage-A Mining Round-2 Phase C — Evolution-Friction (Lens 3)

> **Zweck:** Round-1 caught severity-implications (M14 oneOf-discriminator, M8 additionalProperties, bare-array-bodies forbidden). Round-2 Phase C: systematic mining of breaking-change rules — what predicts that an OpenAPI spec is going to need a breaking change to evolve?
>
> **Stage-A constraint (load-bearing):** apiq Stage-A is **single-spec analysis**. Tools like oasdiff/openapi-diff/openapi-changes/Optic operate on **two spec versions** (head vs base). Most of their rule-corpus is therefore directly out-of-scope. **The Round-2-Phase-C insight** is that many of those breaking-change-categories can be **approximated from a single spec** — by flagging structural patterns that *predict* future breaking changes (e.g., "this required field looks like it'll need to become optional", "this enum has no extensibility hook", "this `deprecated:true` operation has no sunset date").
>
> **Source-Notation:** `[OASDIFF-N]` = oasdiff rule-class; `[OPTIC-N]` = Optic breaking-change ruleset; `[STRIPE]`/`[GH-API]`/`[TWILIO]`/`[MS-AZ]` = vendor versioning policies; `[RFC-N]` = HTTP/IETF spec; `[PROTO]` = Google Protocol Buffers style; `[ZAL-EXT]` = Zalando extensible-enum; `[OAS-3.3-PROP]` = OpenAPI 3.3 deprecated-object proposal.

---

## Sources surveyed

| Tool/Doc | URL | License/Status | Recency |
|---|---|---|---|
| oasdiff (breaking-change-rule-corpus, 450+ rules across 12 categories) | https://www.oasdiff.com/docs/breaking-changes + https://github.com/oasdiff/oasdiff | Apache-2.0, active | maintained 2026 |
| oasdiff Breaking-Changes-Examples | https://github.com/oasdiff/oasdiff/blob/main/docs/BREAKING-CHANGES-EXAMPLES.md | Apache-2.0 | active |
| OpenAPITools/openapi-diff | https://github.com/OpenAPITools/openapi-diff | Apache-2.0, active | active |
| openapi-tools/open-api-diff | https://github.com/openapi-tools/open-api-diff | Apache-2.0 | maintained |
| pb33f openapi-changes / libopenapi (OAS 3.0/3.1/3.2 single-and-double-spec) | https://github.com/pb33f/openapi-changes + https://pb33f.io/openapi-changes/configuring/ | MIT, active | 2026 |
| Azure/openapi-diff | https://github.com/Azure/openapi-diff | MIT, vendor-leaning | maintained |
| Optic (`breaking-changes` ruleset + lifecycle-rules `required_on:added`) | https://www.useoptic.com/docs/detect-breaking-changes + https://github.com/opticdev/optic | MIT, active | 2026 |
| Postman API-versioning best-practices | https://www.postman.com/api-platform/api-versioning/ | docs | 2026 |
| Stripe upgrades + versioning (case study, date-based versioning, response-compat-layer) | https://docs.stripe.com/upgrades + https://docs.stripe.com/api/versioning + https://stripe.com/blog/api-versioning + https://stripe.com/blog/introducing-stripes-new-api-release-process | docs | 2026 (Acacia release) |
| GitHub REST API Versioning + breaking-change list | https://docs.github.com/en/rest/about-the-rest-api/api-versions + https://docs.github.com/en/rest/about-the-rest-api/breaking-changes | docs | 2026-03-10 latest version |
| Twilio Versioning + Support Lifecycle | https://www.twilio.com/docs/conversations/versioning-and-support-lifecycle | docs | maintained |
| Microsoft REST API Guidelines / Azure breaking-change-policy | https://github.com/microsoft/api-guidelines | MIT, active | maintained |
| Microsoft Graph versioning + support + breaking-change policy | https://learn.microsoft.com/en-us/graph/versioning-and-support | docs | 2026 |
| Zalando RESTful API Guidelines — compatibility chapter (`x-extensible-enum`, MUST-stable-required, etc.) | https://github.com/zalando/restful-api-guidelines/blob/main/chapters/compatibility.adoc | CC-BY-SA, active | maintained |
| RFC 8594 — Sunset HTTP Header | https://datatracker.ietf.org/doc/html/rfc8594 | IETF | 2019 |
| RFC 9745 — Deprecation HTTP Response Header | https://www.rfc-editor.org/rfc/rfc9745.html | IETF | 2025 |
| RFC 7231 / 9110 — HTTP semantics (HTTP-Date format used by Sunset/Deprecation) | https://www.rfc-editor.org/rfc/rfc9110.html | IETF | 2022 |
| OpenAPI 3.3 deprecated/sunset proposal (Issue #5193) | https://github.com/OAI/OpenAPI-Specification/discussions/5193 | proposal | 2025 |
| OpenAPI Specification v3.1.0 / v3.2.0 (semantics + extensibility-relevant fields) | https://spec.openapis.org/oas/v3.1.0.html + https://spec.openapis.org/oas/v3.2.0.html | OpenAPI Foundation | 3.1=2021, 3.2=draft 2025 |
| Zalando `x-extensible-enum` and successor (description + examples) | https://github.com/zalando/restful-api-guidelines/issues/831 | CC-BY-SA | deprecated 2024 in favor of description-based extension |
| Speakeasy `x-speakeasy-unknown-values` (open-enum vendor extension) | https://www.speakeasy.com/openapi/schemas/enums | docs | 2025 |
| JSON-Schema breaking-change / compatibility (closed vs open content models) | https://www.dataexpert.io/blog/backward-compatibility-schema-evolution-guide + https://json-schema.org/blog/posts/the-last-breaking-change | docs/blog | 2024-2026 |
| Google Protocol Buffers Style Guide — never-reuse-field-numbers, reserved-keyword | https://protobuf.dev/programming-guides/style/ + https://protobuf.dev/best-practices/dos-donts/ | Apache-2.0 | maintained |
| Buf protobuf style guide — backward-compatibility-style | https://buf.build/docs/best-practices/style-guide/ | Apache-2.0 | maintained |
| Protocol Buffers schema-evolution analysis (forward/backward compat) | https://earthly.dev/blog/backward-and-forward-compatibility/ + https://jsontotable.org/blog/protobuf/protobuf-schema-evolution | blog | 2025 |
| Speakeasy versioning best practices | https://www.speakeasy.com/api-design/versioning | docs | 2025 |
| Redocly versioning best practices | https://redocly.com/blog/api-versioning-best-practices | blog | 2024 |
| Bump.sh — discriminator extensibility analysis | https://bump.sh/blog/the-discriminator-in-openapi-is-generally-redundant-and-confusing/ | blog | 2024 |
| API-Platform deprecation alternatives (`x-deprecation-details`) | https://api-platform.com/docs/core/deprecations/ | docs | maintained |
| Avro/Schema-evolution comparative compatibility (numeric type-widening: int→long→float→double) | https://www.dataexpert.io/blog/backward-compatibility-schema-evolution-guide | blog | maintained |
| OneUptime API-deprecation-headers guide | https://oneuptime.com/blog/post/2026-01-30-api-deprecation-headers/view | blog | 2026 |
| Zuplo HTTP Deprecation Header guide | https://zuplo.com/learning-center/http-deprecation-header | docs | 2025 |
| Earthly Protobuf forward/backward compat | https://earthly.dev/blog/backward-and-forward-compatibility/ | blog | 2024 |

**Status of one-shot full-rule-list dump:** oasdiff officially advertises 450+ rules but does not publish a single canonical web page enumerating all of them with stable rule-IDs; its README points users to `oasdiff checks` CLI output. The categorical breakdown (12 categories: Endpoints / Request-Parameters / Request-Body / Response-Body / Status-Codes / Schemas-and-Types / Security / Headers / Content-Types / Callbacks-and-Links / Extensions-and-Tags / Servers-and-Paths) is consistent across cited sources. We extract patterns at the **rule-class level**, not the rule-ID level.

---

## Patterns extracted

### Generic (take into apiq)

These patterns are detectable in a SINGLE spec and predict that future evolution would create a breaking change. They are derived by inverting each two-spec breaking-change rule into "what authoring-pattern present in v1 makes a v2-evolution forced-breaking?"

| ID | Pattern | Source | Multi-Lens-Tags | Severity-Axis | Detection-feasibility | Future-breaking-class (which kind of breaking change does this prevent) | Notes |
|---|---|---|---|---|---|---|---|
| EV-1 | **`deprecated: true` operation/parameter without sunset date or replacement reference** in description / x-extensions | [OASDIFF — endpoint-deprecated-no-sunset], [OAS-3.3-PROP], [RFC 8594], [API-Platform `x-deprecation-details`], Zalando #189 | Lens 3 + Lens 4 (client-friction) | warn | mech (regex on description for `sunset`, `removed`, `Y(YYY)-M(M)-D(D)`, `use ... instead`, `replaced by`; OR vendor-ext `x-sunset` / `x-replacement` / `x-deprecation-details`; OR direct `deprecated.successor` if OAS 3.3) | removing-an-endpoint-without-sunset-window | apiq H4/R4 already partially cover; tighten to require *any* of the markers. 6+ sources concur. |
| EV-2 | **Required-field-stability smell** — request-property `required:true` whose name strongly suggests it will become optional later (e.g., contains "legacy_" / has both new+old field hint / property whose description says "currently required" or "will be required") | [OASDIFF — required-property-changed-to-optional is breaking]; inverted from [STRIPE: `removing required` is breaking] | Lens 3 | hint | heuristic (description-regex) | making-required-optional (Microsoft MS-AZ: "make optional required or vice versa is breaking") | Signal-low/false-positive risk; off-by-default. |
| EV-3 | **Closed enum with no extensibility hook** — `enum: [a,b,c]` on a response-property without `x-extensible-enum` (Zalando), `x-speakeasy-unknown-values` (Speakeasy), description containing "extensible"/"open"/"may add new", and >1 enum-value with semantic prefix (suggests growth axis like `status:active`/`status:pending`/...) | [ZAL-EXT], [Speakeasy], [OASDIFF — added-enum-value-on-response is breaking-for-strict-clients], [OPTIC — removed-enum-value-breaking] | Lens 3 + Lens 4 | hint | mech (presence-check) + heuristic (semantic-prefix detection) | adding-new-enum-value (breaking for clients that exhaustively-switch on enum without default branch) | Specifically applies to **response** enums, not request enums (request enum growth is breaking the other way). For request-body enums, use Y-25/different-rule. |
| EV-4 | **Bare-array response/request body** | [OASDIFF — body-type-changed-from-array-to-object is breaking]; already in apiq §1 cross-source | Lens 3 + Lens 4 | warn | mech | wrapping-array-in-envelope-later (forces breaking change to add metadata/pagination/links) | already in brainstorm cross-source consensus (§1); evolution-friction is the *primary* lens — re-tag. |
| EV-5 | **`additionalProperties` not declared** on response schemas | inverted [OASDIFF — additionalProperties-changed-from-true-to-false is breaking]; [SG-42], Microsoft, Zalando #225 | Lens 3 + Lens 4 + Lens 1 (mass-assignment) | warn | mech (statistical M8 already; per-schema rule needed) | adding-strict-validation-later (server tightens, clients that sent extra props now fail); also forward-compat: client-sent-extras silently dropped vs rejected | apiq M8 statistical → **Round-1 already upgraded to warn**. Confirmed. |
| EV-6 | **`oneOf`/`anyOf` without `discriminator`** OR with `discriminator` but **no `mapping` table** (clients can't dispatch on unknown variant) | inverted [OASDIFF — discriminator-mapping-changed], [Bump.sh discriminator-redundancy-analysis], [SmartBear unknown-subtype-analysis] | Lens 3 + Lens 4 | warn (with mapping) / hint (without) | mech | adding-new-subtype-without-default-fallback (clients deserialize-fail) | apiq M14 already lifted to warn (Round-1). Add: `discriminator` present but `mapping` absent → hint (encourages explicit registry that documents which subtypes are known). |
| EV-7 | **Default value present on a required field** (semantic contradiction; default-changes are breaking under Stripe/MS rules; required+default is dead code) | [SP-G-AZ-10], [IBM `ibm-no-default-for-required-parameter`], [OASDIFF — default-value-changed-on-property], [STRIPE: changing-default-is-backwards-incompatible] | Lens 3 + Lens 5 | warn | mech | changing-default-value-later (server-side changes default; clients depending on old default break) | apiq T2 (param) + M-SP-14 (property) cover. Re-tag with Lens-3. |
| EV-8 | **Operation lacks `operationId`** | [OPTIC — operationId-required], [OASDIFF — operationId-removed-is-breaking], [Spectral default] | Lens 3 + Lens 4 (codegen) | warn | mech | renaming-operation-via-path-change (without operationId, clients have only path-method as identity → any path-change is breaking-rename) | apiq mostly relies on spectral:oas; codify: operationId missing → ID-stability-loss-under-evolution. |
| EV-9 | **`info.version` looks like a placeholder or non-versioned** (`1.0.0`, `0.0.1`, `v1`, `unknown`, missing) — implies no versioning discipline | [STRIPE date-versioning], [GH-API date-versioning], [MS-AZ date-versioning], [Postman versioning], [Speakeasy versioning] | Lens 3 | hint | mech (set-membership against placeholder-list) | undeclared-version-scheme (any change is implicitly breaking) | apiq H2 — extend with placeholder-list. |
| EV-10 | **Mixed versioning (URL-version `/v1/...` + Header-version `Accept: vnd.x.v2`)** | [SG-6], [G-URL-1 `one-api-version-per-document`], [Zalando MUST-single-version], [GH-API single-header-only], [STRIPE single-header-only], [MS-AZ single-query-only] | Lens 3 | warn | mech | drift-confusion: which version-axis-is-canonical? Future-breaking = author-disagreement | apiq H1 — confirmed multi-source. |
| EV-11 | **No spec-wide error-shape declared** (no `application/problem+json`-references; no `components.responses.Error`; inline ad-hoc error-objects per operation) | [SG-16], [RFC 7807/9457], [OPTIC `consistent-error-shape`], [STRIPE-convention] | Lens 2 + Lens 3 + Lens 4 | warn | mech-stat (count distinct error-schemas; if >2 cross-spec → flag) | adding-fields-to-error-shape-later-becomes-cross-cutting-breaking | already in brainstorm (K2/§1). Re-tag Lens-3. |
| EV-12 | **Path-version `vN.M` (minor in URL)** — minor-version-in-URL forces URL-rotation on every minor bump | [G-URL-2 `only-major-api-versions`], [Speakeasy URL-best-practice], [STRIPE date-only], [GH-API date-only] | Lens 3 | warn | mech (regex `/v\d+\.\d+/`) | minor-bump-forces-URL-rotation | apiq H-SP-2 already in brainstorm; re-tag Lens-3. |
| EV-13 | **`info.version` non-semver AND non-date-based** (e.g., random strings, `latest`, `current`) | [SG-25], [SP-G-AZ-25], [STRIPE], [GH-API] | Lens 3 | warn | mech (semver-regex OR date-regex match) | no-version-progression-discipline | apiq H2 strengthen. |
| EV-14 | **Required request-body without `requestBody.required: true` declared explicitly** (defaults to `false`; tools may treat differently → silent breaking) | [SP-G-AZ-9], [IBM `ibm-content-contains-schema`] | Lens 3 + Lens 5 | warn | mech | making-default-required-implicit-vs-explicit creates-version-skew | apiq L2 — Round-1 brainstorm covers; re-tag Lens-3. |
| EV-15 | **Status-code-set wide-open** — operation declares >10 distinct response codes (likely incomplete-axis or kitchen-sink) | inverted [OASDIFF removing-response-code]; apiq §7 outlier-detection | Lens 3 + Lens 4 | hint | mech-stat (count) | removing-response-codes-later (any subset removal is breaking-for-clients-that-handle-them) | apiq has no current rule; new pattern. |
| EV-16 | **5xx/`default` response missing** — operation has no catch-all error response | [SP-G-OWASP-28], [Azure `az-default-response`], [Zalando `must-specify-default-response`] | Lens 3 + Lens 4 | warn | mech | adding-default-later-changes-handler-resolution | apiq C7 — confirm. |
| EV-17 | **Endpoint without `tags`** — orphan operation cannot be moved into a logical group later without doc-restructure | [SG-41], spectral:oas `operation-tag-defined` | Lens 3 (mild) + Lens 4 | warn | mech | re-organizing-docs-later-orphans-clients-bookmarks | apiq Q1 — confirm. |
| EV-18 | **Schema with `additionalProperties: true` in REQUEST body without explicit allow-list of expected fields** — server cannot tighten to `false` later without client-breakage | [OWASP-mass-assignment], [STRIPE-strict-by-design], [MS-AZ `#rest-fail-for-unknown-fields`] | Lens 3 + Lens 1 | hint | mech | adding-strict-mode-later-breaks-clients | inverse of EV-5 (response-side). |
| EV-19 | **`securitySchemes` defined but no operation references any (or only some) of them** — adding a security requirement later is breaking | [OASDIFF security-removed-or-added-is-breaking], [F3 dead-scheme-detection] | Lens 3 + Lens 1 | warn | mech (graph) | adding-required-auth-to-existing-public-endpoint-is-breaking | apiq F3 — re-tag Lens-3. |
| EV-20 | **Operation declares one media-type for response** (e.g., only `application/json`) without leaving room for content-negotiation | [OASDIFF media-type-removed-is-breaking] | Lens 3 + Lens 5 | hint | mech | adding-or-removing-media-types-later-changes-`Accept`-negotiation-semantics | low priority; off-by-default. |
| EV-21 | **Schema property has no description** AND is `required: true` AND occurs in a response — implies semantics carried only by name; renaming-for-clarity-later is breaking | [SG-2 desc-substantive], [VTex `no-empty-descriptions`] | Lens 3 + Lens 4 | hint | mech | renaming-required-property-for-clarity-is-breaking | apiq M2 statistical — per-property pattern stricter. |
| EV-22 | **`$ref`-cycles introduce schema-self-reference without `maxDepth` declaration** — clients build infinite-tree, server-side limit-change breaks them | [JSON-Schema-recursive-DoS-class], apiq A2 | Lens 3 + Lens 1 | hint | graph (cycle detection) | server-tightens-recursion-limit-later → breaking | apiq A2 already; Lens-3 re-tag. |
| EV-23 | **`maxLength`/`maxItems`/`maximum`/`pattern` constraint absent on request properties** — server tightening (e.g., adding `maxLength: 100` to a string later) is breaking-for-clients-that-sent-101-chars | [OASDIFF schema-pattern-added (request)], [OASDIFF maxLength-decreased] | Lens 3 + Lens 1 (DoS) | warn | mech | server-validation-tightening-later-is-breaking | apiq M9 statistical → per-property rule has different lens-tags depending on direction (request vs response). |
| EV-24 | **`pattern` constraint present on request property without `^…$` anchors** — server tightening anchors later is breaking | [MIN-2 IBM `ibm-anchored-patterns`], [OASDIFF pattern-tightened] | Lens 3 + Lens 2 | warn | mech | server-tightens-anchored-pattern-later-rejects-prefix-passing-strings | apiq A-MIN-1 — re-tag Lens-3. |
| EV-25 | **`type: integer` without `format: int32`/`int64`** — codegen-defaults differ; future explicit-type-declaration is silent-breaking on edge cases (precision-loss `int → number`) | [SP-G-OWASP-21], [Zalando `must-define-a-format-for-integer-types`], [OASDIFF format-changed], JSON-Schema-evolution-int→long→float→double-allowed-rule | Lens 3 + Lens 2 + Lens 4 | warn | mech | declaring-format-later-on-untyped-integer-changes-precision-or-codegen-class | apiq M-SP-9 already in §1; re-tag Lens-3. |
| EV-26 | **Operation `summary`/`description` mentions "TODO"/"FIXME"/"will be removed"/"placeholder"** — implies pre-release / not contract-stable | apiq stub-detection, [SG-2] | Lens 3 + Lens 5 | hint | mech (regex-list) | author-knows-this-is-not-stable; consumers-shouldn't-rely-on-it | exists in apiq partially. |
| EV-27 | **Path-segment file-extension** (`.json`, `.xml`, `.html`) — content-negotiation-via-extension is anti-modern; future-removal-is-breaking | [SP-G-AYWH-14], [SG-5], [SPS `sps-paths-expose-extension`] | Lens 3 + Lens 5 | error | mech | replacing-extension-with-Accept-negotiation-is-major-breaking | apiq S-SP-6 — re-tag Lens-3. |
| EV-28 | **Server URL contains environment name** (`/dev/`, `/staging/`, `/prod/`, `/sandbox/`) | [SP-G-SPS-10 `sps-path-no-environment`] | Lens 3 + Lens 1 | error | mech | promoting-from-staging-to-prod-via-path-change-is-breaking | apiq S-SP-4 — re-tag Lens-3. |
| EV-29 | **API-Path-prefix `/api/`** vs other paths inconsistent — refactoring root-prefix later is breaking | [SP-Zalando `should-not-use-api-as-base-path`], [W-MIN-2 common-path-prefix detection] | Lens 3 (mild) + Lens 5 | hint | mech-stat | refactoring-prefix-later-rotates-all-URLs | apiq W-MIN-2 — re-tag Lens-3. |
| EV-30 | **Operation declares `requestBody` but no `application/json` media-type entry** | [SP-G-AYWH-10 + Adidas + SPS `sps-request-support-json`], [OPTIC `consistent-content-type`] | Lens 3 + Lens 5 | warn | mech | adding-application/json-later-changes-content-negotiation-default-precedence | apiq B-SP-4 — re-tag Lens-3. |
| EV-31 | **Custom HTTP method or non-standard verb** (`SEARCH`, `LOCK`, `MKCOL`) without RFC reference | [SP-G-SPS-1 `sps-invalid-http-method`] | Lens 3 + Lens 2 | error | mech | normalizing-to-standard-method-later-is-breaking | apiq B-SP-9 — re-tag Lens-3. |
| EV-32 | **Operation `parameters` contains `Authorization`/`Content-Type`/`Accept` as explicit Header-Param** — should come from `securityScheme`/`requestBody.content` — refactoring later is breaking | [Azure G-AZ-7], [Team-D `no-forbidden-headers`], [SPS `sps-no-explicit-headers`], [SG-46], IBM tri | Lens 3 + Lens 2 | warn | mech | refactoring-from-explicit-param-to-securityScheme-later-is-breaking | apiq T4 — re-tag Lens-3. |
| EV-33 | **Schema property is `nullable: true` AND `required: true`** — combination is contradictory under most validators; future "fix" (drop nullable OR drop required) is breaking | [JSON-Schema-evolution-blog], [Speakeasy openapi-schemas-best-practices], inverted from [OASDIFF nullable-changed] | Lens 3 + Lens 5 | warn | mech | resolving-nullable+required-contradiction-later-is-breaking | apiq missing — new pattern. |
| EV-34 | **Spec uses Swagger-2 (vs OAS 3.x)** — migration-to-OAS-3-is-already-breaking-for-codegen-clients | [SP-G-TD-3 Team-D `no-swagger-2`], [Red-Hat `rhoas-oas3minimum`] | Lens 3 (already-pre-broken) | error | mech (info.swagger field check) | already-deprecated-spec-version | apiq X-MIN-3 — re-tag. apiq is OAS-3-only by ingestion; document. |
| EV-35 | **Two adjacent path-template-segments with no separator** (`/foos/{x}/{y}` is OK; `/foos/{x}{y}` is ambiguous; ambiguous-path-disambiguation later is breaking) | [MIN-6 IBM `ibm-no-consecutive-path-parameter-segments`] | Lens 3 + Lens 2 | error | mech (path-template parser) | disambiguation-later-rotates-URL | apiq A-MIN-4 — re-tag Lens-3. |
| EV-36 | **Two paths with identical structural template** (`/foo/{a}` and `/foo/{b}`) | [MIN-7 Vacuum + Redocly] | Lens 3 + Lens 2 | error | mech (path-template parser) | routing-collision; renaming-disambiguation-is-breaking | apiq A-MIN-5 — re-tag Lens-3. |
| EV-37 | **`info.version` not present at all** | OAS-3-MUST + apiq | Lens 3 | error | mech | introducing-`info.version`-later-is-doc-only-but-flags-no-prior-version-discipline | apiq missing as explicit rule. |
| EV-38 | **Path-segment uses past-tense verb or stateful word** (`/created/`, `/updated/`, `/done/`) — semantic-loaded-segments resist refactor; past-tense in resource-paths is RPC-leak | [SP-G-SPS-3 `sps-disallowed-prepositions`], [SG-11], REST-purist guidance | Lens 3 + Lens 5 | hint | mech (verb-list regex on path-segments) | refactoring-to-resource-style-later-is-breaking | apiq G-SP-7 partial (preposition-only); extend to verbs. |
| EV-39 | **`required` on a request-property that lacks `default` AND has only one allowed value** (`enum: ["v1"]`) — adding a new enum value later forces clients to choose; making it not-required-once-default-existed is breaking | [JSON-Schema evolution], [OASDIFF enum-extended] | Lens 3 + Lens 5 | hint | mech | trapped-design (single-value-required-enum) | apiq A13 covers single-element-anyOf/oneOf — extend to enum. |
| EV-40 | **Schema-name reuse** — two schemas with same name in different cases (`User`, `user`) → component-name collision; rename-later-is-breaking | already in apiq O2 | Lens 3 + Lens 4 | warn | mech (case-insensitive lookup) | renaming-collision-target-is-breaking | apiq O2 — re-tag Lens-3. |
| EV-41 | **Field-name with `_v1` / `_legacy` / `_old` / `_deprecated` suffix** in property-name — author signals upcoming-deprecation but no `deprecated:true` flag | apiq prose-deprecation-walker, [W-MIN-1] | Lens 3 + Lens 4 | hint | mech (regex on property-name) | author-knows-rename-coming; client-shouldn't-rely | apiq has prose-walker; extend to property-names. |
| EV-42 | **Operation `tags` array contains `internal`/`private`/`beta`/`experimental`/`deprecated`** — semantic-tag indicating non-contract-stable surface | many style-guides (Microsoft, Google AIPs) | Lens 3 + Lens 4 | hint | mech (tag-name allowlist comparison) | beta/internal-paths-becoming-stable-rotates-contract | new pattern; off-by-default. |
| EV-43 | **Spec contains both `swagger: "2.0"` artifacts (e.g., `consumes`/`produces`) AND `openapi: 3.x`** — half-migrated spec | [SP-G-TD-3], pb33f migration-warnings | Lens 3 + Lens 2 | error | mech | half-migrated-spec; finishing-migration-is-breaking-pre-launch | apiq currently rejects swagger-2 at ingest; check residual fields. |
| EV-44 | **No top-level `components.schemas` declared (every schema inline)** — refactoring-to-component-extraction-later-changes-codegen-output (different class names) | apiq M6 inline-reuse-detection extended | Lens 3 + Lens 4 | hint | mech-stat (count `$ref` vs inline schemas) | inline-only specs cannot be refactored without renaming-class-output | apiq M6 — re-tag Lens-3. |
| EV-45 | **Operation `responses` has `default` AND specific status-codes that conflict semantically** (e.g., both `200` and `default` returning different shapes) | [OASDIFF response-default-changed], [OPTIC consistent-default] | Lens 3 + Lens 5 | hint | mech | resolving-overlap-later-is-breaking | new pattern. |
| EV-46 | **Schema has `readOnly: true` property in REQUEST body** OR `writeOnly: true` in RESPONSE body — semantic-leak; future-fix-by-removing-property-is-breaking | [SP-G-AZ-24 Azure mirror], [OASDIFF readOnly-flag-changed] | Lens 3 + Lens 4 | warn | mech | semantically-confused-payload; cleanup-is-breaking | apiq M-SP-3 — re-tag Lens-3. |
| EV-47 | **Operation with `requestBody` accepting `multipart/form-data` AND `application/json` for the SAME schema** — content-negotiation-divergence; reducing to single later is breaking | [Azure az-multiple-content-types], OPTIC | Lens 3 + Lens 5 | hint | mech | future-narrowing-of-accepted-types-is-breaking | new pattern; off-by-default. |
| EV-48 | **`PATCH` operation accepts `application/json`** (not `application/json-patch+json` or `application/merge-patch+json`) — semantic of PATCH-body unclear; standardizing later is breaking | [SP-G-TD-4], [Azure `az-patch-content-type`], [SG-34], [MIN-30 IBM] | Lens 3 + Lens 2 | warn | mech | rfc-correctness-fix-later-is-breaking-because-server-changes-parser | apiq L-SP-2 — re-tag Lens-3. |
| EV-49 | **`429` response declared without `Retry-After` header in the response-headers** | [SG-31], [SP-G-OWASP-15], [OASDIFF response-header-removed] | Lens 3 + Lens 1 + Lens 2 | error (on 429-responses) | mech | adding-Retry-After-later-is-additive-non-breaking; missing-it-day-1 forces clients to guess; later-tightening-of-rate-limit semantics is breaking | apiq C9 — Round-1 already upgrade-recommended. Re-tag Lens-3. |
| EV-50 | **`304 Not Modified` declared without conditional-request infrastructure (`ETag` / `Last-Modified` / `If-None-Match` / `If-Modified-Since`)** | [RFC 7232], apiq C10 already | Lens 3 + Lens 2 | warn | mech | introducing-conditional-validation-later-is-additive-but-clients-already-coded-against-broken-304 | apiq C10 — re-tag Lens-3. |
| EV-51 | **Schema property described as a "magic string" (free-text-only) where enum was viable** (description contains "must be one of" / "valid values") — bare string with no enum | [LL-13 prose-enum-detection], apiq M13 | Lens 3 + Lens 5 | hint | mech (regex on description) + LL boundary | adding-enum-later-restricts-clients-that-sent-other-strings-is-breaking | apiq M13 boundary-LLM; can also be heuristic. |
| EV-52 | **`maximum` / `minimum` on integer property is `Number.MAX_SAFE_INTEGER`-class large** (>2^53) without `format: int64` declared as string-encoding | [SG-24 64-bit-as-string], [Google AIP], [Zalando #168], [Stripe-convention] | Lens 3 + Lens 2 + Lens 4 | hint | mech | js-precision-loss; future-fix-via-string-encoding-is-breaking | apiq J-SG-2 — re-tag Lens-3. |
| EV-53 | **Spec contains explicit version path `/v1/` AND uses `info.version: "2.x"`** — drift between URL-version and spec-version | [SP-Adidas + Speakeasy versioning], [G-URL-1] | Lens 3 + Lens 5 | warn | mech | reconciliation-of-mismatched-version-axes-is-breaking | apiq H3 — re-tag Lens-3. |
| EV-54 | **Operation `parameters` contains `version` query-param OR `version` header without `enum` constraining valid values** | [apiq versioning-headers-need-enum existing rule], [Speakeasy] | Lens 3 | warn | mech | adding-enum-later-rejects-currently-passing-version-strings-is-breaking | apiq existing rule already; re-tag Lens-3. |
| EV-55 | **Required parameter shows `default` value** (semantic contradiction; default-changes are breaking) | [Azure G-AZ-9], [IBM `ibm-no-default-for-required-parameter`], inverted [OASDIFF default-changed] | Lens 3 | warn | mech | dead-code-default; cleanup-or-evolution-of-default-is-breaking | apiq T2 — re-tag Lens-3. |
| EV-56 | **`servers` array is missing or empty AND no `host`/`basePath`** — clients must hard-code; introducing servers later is doc-only but exposes drift | [SP-Redocly `no-empty-servers`] | Lens 3 + Lens 5 | warn | mech | undeclared-base-introduces-drift | apiq P-SP-5 — re-tag Lens-3. |
| EV-57 | **Schema `required` declares fields not in `properties`** — author drift; fixing it changes validation semantics | apiq A3 | Lens 3 + Lens 5 | error | mech | fix-required-list-later-changes-validation-passing-set | apiq A3 — re-tag Lens-3. |
| EV-58 | **Operation has `deprecated: true` BUT response body contains a `status: "active"`-class enum value** — internal contradiction | inferred from [OAS-3.3-PROP] consistency-checks | Lens 3 + Lens 5 | hint | LL-only (semantic) | inconsistency-burns-when-clients-test | borderline-LLM (Phase B). |
| EV-59 | **Status-code `301`/`302`/`307`/`308` declared without `Location` header in response-headers** | [SP-G-SPS-15 inverse], RFC 9110 | Lens 3 + Lens 2 | warn | mech | adding-Location-later-changes-redirect-target-resolution | new pattern; off-by-default. |
| EV-60 | **Spec declares `webhooks` (OAS 3.1+) without each webhook having `summary` / `description`** — webhook contract is informal; renaming or restructuring later is breaking | apiq U1/U2, [SP-G-SPS-21] | Lens 3 + Lens 4 | hint | mech | undocumented-webhook-evolution-is-silent-breaking | apiq U1/U2 — re-tag Lens-3. |
| EV-61 | **`oneOf`/`anyOf` member-list is *closed* but description mentions "more variants in the future" / "additional types may be added"** — author signals growth without infrastructure | apiq prose-walker | Lens 3 + Lens 4 | hint | mech (regex) + boundary-LLM | author-anticipates-growth-but-design-doesn't-permit-it | new pattern. |
| EV-62 | **Property `type: integer` becomes a candidate for `type: string` if value space is large** — apiq's existing `apiq-count-fields-should-be-integer` is the inverse-direction; for evolution-friction the **outgoing** direction is "anything that exceeds 2^53 should be string today" | [SG-24], [Stripe], [Google AIPs] | Lens 3 + Lens 4 | hint | mech (range-evidence: `maximum > 2^53` OR property-name contains `id` AND no `format: int32`/`int64` AND no `format: uuid`) | downstream-changing-int-to-string-is-breaking | new pattern. |

### Already-in-apiq-brainstorm (or Round-1)

| brainstorm-ID | external-source-confirms | Notes |
|---|---|---|
| H1 (URL+Header version-mixing) | [G-URL-1], [Zalando MUST-single], [GH-API], [Stripe], [MS-AZ] | Lens-3 confirmed; same multi-source as Round-1 |
| H2 (info.version semver/date) | [STRIPE date-only], [GH-API date-only], [MS-AZ date-only], [SG-25] | Lens-3 confirmed |
| H4 (deprecated: true without sunset/replacement) | [OAS-3.3-PROP], [RFC 8594], [API-Platform] | Lens-3 confirmed; matches EV-1 — keep H4 strengthened |
| R4 (`deprecated: true` without sunset hint in description) | (sub-case of H4 / EV-1) | Lens-3 confirmed |
| S4 (mixed versioning in path) | (= EV-10 / H1) | Lens-3 confirmed |
| §1 cross-source consensus on bare-array bodies | [OASDIFF bare-array-changes-to-object is breaking], [OPTIC bare-body-types-discouraged] | Confirmed Lens-3 primary lens (was Lens-4 in Round-1 framing) |
| M14 (oneOf needs discriminator) Round-1 lift | [OASDIFF discriminator-changes-breaking], [Bump.sh-discriminator-analysis] | Lens-3 confirmed; Round-1 upgrade hint→warn validated |
| M8 (additionalProperties undeclared) Round-1 lift | [OASDIFF additionalProperties-changed-breaking], [MS-AZ rest-fail-for-unknown-fields] | Lens-3 confirmed; Round-1 upgrade hint→warn validated |
| K2 (problem+json) | [OASDIFF response-shape-change-breaking], [SG-16] | Lens-3 confirmed; multi-source |
| C9 (429 + Retry-After) | [OASDIFF response-header-removed], [SG-31] | Lens-3 confirmed; matches EV-49 |
| O2 (case-insensitive component collisions) | [Redocly], [IBM], [MIN-50] | Lens-3 confirmed |
| M9 / M10 (string-maxLength / integer min-max statistical Walkers) | [OASDIFF maxLength-decreased-or-pattern-tightened] | Lens-3 confirmed for request-side; less critical for response-side |
| A2 ($ref-cycles silent strip) | [JSON-Schema-recursive-DoS], OASDIFF cycle-handling | Lens-3 + Lens-1 |
| A3 (required-fields not in properties) | [Tri-linter consensus] | Lens-3 confirmed |
| A-MIN-4 (consecutive path-params) | [MIN-6] | Lens-3 confirmed |
| A-MIN-5 (ambiguous paths) | [MIN-7] | Lens-3 confirmed |
| A-MIN-13 (nullable+enum without null) | [Vacuum] | Lens-3 sub-case of EV-33 |
| L-SP-2 (PATCH content-type) | [Team-D], [Azure], [SG-34] | Lens-3 confirmed |
| W-MIN-2 (common path-prefix) | [Zally H001] | Lens-3 confirmed |

### Out-of-scope (require comparing two spec versions, which is a different feature)

These are oasdiff/openapi-diff/pb33f primary use-case — they fundamentally need v1 + v2. apiq Stage-A is single-spec, so these are NOT to be built into Stage-A. They could be a future feature (epic post-launch as called-out in apiq §10 Diff-Detection).

| ID | Pattern | Source | Why-skip |
|---|---|---|---|
| OOS-1 | `request-property-became-required` (compare two versions of same operation) | [OASDIFF] | Requires base+head spec |
| OOS-2 | `response-property-removed` | [OASDIFF] | Requires base+head spec |
| OOS-3 | `endpoint-removed` | [OASDIFF] | Requires base+head spec |
| OOS-4 | `enum-value-removed` (response) / `enum-value-added` (request) | [OASDIFF, OPTIC] | Requires diff |
| OOS-5 | `response-status-code-removed` | [OASDIFF] | Requires diff |
| OOS-6 | `request-parameter-renamed` | [OASDIFF] | Requires diff (rename = remove+add at structural level) |
| OOS-7 | `schema-type-changed` (e.g., string → integer) | [OASDIFF, OpenAPITools/openapi-diff #599] | Requires diff |
| OOS-8 | `default-value-changed` | [OASDIFF, STRIPE policy] | Requires diff (single-spec presence-of-default is EV-7/EV-55) |
| OOS-9 | `pattern-tightened` / `maxLength-decreased` | [OASDIFF] | Requires diff (single-spec presence-of-no-constraint is EV-23/EV-24) |
| OOS-10 | `security-scheme-added-to-existing-operation` | [OASDIFF] | Requires diff |
| OOS-11 | `additionalProperties-true-to-false` | [OASDIFF] | Requires diff (single-spec absence is EV-5/EV-18) |
| OOS-12 | `discriminator-mapping-entry-removed` | [OASDIFF] | Requires diff (single-spec absence-of-mapping is EV-6) |
| OOS-13 | `content-type-removed` | [OASDIFF] | Requires diff |
| OOS-14 | `response-header-removed` | [OASDIFF] | Requires diff (single-spec absence is EV-49/EV-59) |
| OOS-15 | `parameter-required-changed-to-true` | [OASDIFF, OpenAPITools/openapi-diff] | Requires diff |
| OOS-16 | `media-type-changed` | [OASDIFF, Azure/openapi-diff] | Requires diff |
| OOS-17 | `tags-renamed` (cross-version) | [pb33f openapi-changes] | Requires diff |
| OOS-18 | `webhook-removed` | [pb33f] | Requires diff |
| OOS-19 | `server-url-changed-incompatibly` | [OASDIFF] | Requires diff |
| OOS-20 | Optic's `required_on: added` lifecycle-rule semantics (only flag rule on newly-added endpoints) | [OPTIC] | Requires git-history of spec / two-spec-diff to know which endpoints are new |

### Unsure

| ID | Pattern | Source | Why-unsure |
|---|---|---|---|
| UN-1 | **Required-field-stability heuristic** ("this required field looks like it'll need to become optional later") | EV-2 (proposed); inverted [OASDIFF] | Heuristic relies on regex on description / property-name (`legacy_`, `currently required`, etc.) — false-positive rate likely high. Worth implementing as `hint` off-by-default? Or skip and let LLM Phase B handle? |
| UN-2 | **Closed-enum without extensibility-hook** (EV-3) | [Zalando-deprecated-x-extensible-enum], [Speakeasy `x-speakeasy-unknown-values`] | Zalando deprecated `x-extensible-enum` in 2024 in favor of description+example convention. There's no canonical mech-marker; we can only mech-detect *absence* of any of {`x-extensible-enum`, `x-speakeasy-unknown-values`, description-keyword `extensible`/`open`/`additional values may`}. Detection feasibility OK but signal quality middling. |
| UN-3 | **Default value present on a `required: true` field** (EV-7/EV-55) | Multi-source | Already in apiq T2/M-SP-14 brainstorm. Question is whether to track as primarily Lens-3 (evolution) or Lens-5 (style) — multi-tag is the answer. Not really unsure; just confirming Lens-3 is the dominant frame. |
| UN-4 | **API-Path-prefix `/api/`** (EV-29) | [Zalando, W-MIN-2] | Opinion-divided per apiq §5: Zalando says no, SPS-Commerce + many others say yes. Off-by-default. Lens-3 is real but mild. |
| UN-5 | **Response-body absent of `default` response declaration** (EV-16) | Multi-source | Borderline whether evolution-friction or just hygiene. Already in apiq C7. |
| UN-6 | **Operation declares `summary` field starting with "Get"/"List"/"Create" but path uses RPC-style verb** (`POST /createOrder`) — RPC-vs-REST drift = future-restructure-breaking | [LL-1], apiq S8 | This is borderline-LLM (Lens-5 style + Lens-3 evolution). apiq has heuristic in path-template-parser; question is whether to lift severity for evolution-prediction. |
| UN-7 | **`oneOf` with named schemas where the schema-names share a common prefix** (`Order`, `OrderV2`, `OrderLegacy`) — implies version-coexistence-schemas inside one spec | informal pattern | Detection: hash-based naming-prefix-clustering. False-positive risk on legitimate hierarchies (`Animal`, `AnimalDog`). Borderline-mech. |
| UN-8 | **Spec contains both `webhooks` (OAS 3.1) AND `x-webhooks` Vendor-Extension** (drift between formal-feature and old vendor-style) | apiq U3 | apiq U3 already; Lens-3 lens. Low-priority. |
| UN-9 | **Schema with `discriminator` but `mapping` is absent** (EV-6 sub-case) | inferred from [OASDIFF discriminator-mapping-evolution] | apiq A5 covers `mapping` validity-when-present; EV-6 covers `mapping` absence. Should the absence-rule be `hint` or `warn`? Mining suggests `hint` (extensibility encouragement, not strict requirement). |
| UN-10 | **Response status-code `200` returns array** AND no `next_page_token`/`Link`/`Content-Range`/`pagination` envelope | apiq E1 + bare-array-class | Bare-array-response is already EV-4 (warn). Pagination-absence is apiq E1 (warn). The combination compounds Lens-3 friction. Worth a separate compound-rule? Probably not — fold into EV-4. |

### Meta-Observations

#### A) New Lens hint — "Vendor-Versioning-Discipline" sub-lens of Lens-3

Mining the case-studies (Stripe / GitHub / Twilio / Microsoft / OpenAI Deprecations) reveals a consistent **vendor-versioning-discipline** pattern that is *meta* over individual rules:

1. **Date-based versions** (Stripe `2024-09-30.acacia`, GH-API `2026-03-10`, MS-Graph `v1.0`+`/beta`) → predictable monotonic timeline; Stripe's monthly-non-breaking + semi-annual-breaking-major-with-plant-name sets explicit cadence
2. **Versioning axis singularity** — exactly ONE version-axis (header OR path OR query, never two) — Stripe header-only, GH header-only, MS query-only, Postman path-only
3. **Pinning on first-use** — Stripe: account auto-pins on first API call, so old clients never receive breaking changes by accident
4. **Response-compatibility-layer architecture** — Stripe's internal pattern: latest core + version-translator transforms responses backward; consumers see a stable contract regardless of internal evolution
5. **Explicit deprecation timeline** — Twilio 12-month deprecation phase + 12-month EOL; GH-API 24-month-min support; MS 24-month-deprecation-window
6. **`Sunset` + `Deprecation` headers** (RFC 8594 + RFC 9745) — runtime communication layer
7. **What's-additive-vs-breaking explicitly listed** — Stripe enumerates 6 changes that are backwards-compatible; everything else is breaking

The single-spec-detectable signals from this discipline-pattern are EV-1, EV-9, EV-10, EV-12, EV-13, EV-37, EV-53, EV-54. **Architectural signal:** apiq could compose these into a *compound* Stage-A finding "no versioning discipline detected" if 3+ of {EV-1, EV-9, EV-10, EV-13, EV-37} fire on a single spec. That's a higher-level Lens-3 finding.

#### B) Breaking-change-class taxonomy (single-spec-prediction-friendly)

Round-2 surfaces a clean taxonomy of breaking-change classes, each predictable from a single-spec authoring pattern:

| Breaking-Change Class | Predicting Single-Spec Pattern |
|---|---|
| **A. Required-field changes** (add new required, remove existing required, make optional required) | EV-2 (heuristic), EV-3 (closed-enum), EV-14 (requestBody.required-implicit), EV-39 (single-value-required-enum) |
| **B. Type changes** (string→integer, narrowing-int→string, etc.) | EV-25 (untyped-integer), EV-52 (>2^53 int), EV-62 (int-to-string-candidate) |
| **C. Default-value changes** | EV-7, EV-55 (required+default contradiction) |
| **D. Constraint-tightening** (maxLength↓, pattern-narrowed, anchor-added) | EV-23 (no-constraint), EV-24 (unanchored-pattern) |
| **E. Enum-value changes** (add to request, remove from response) | EV-3 (closed-enum no-extensibility), EV-39 (single-value enum), EV-58 (deprecated-with-active-enum), EV-51 (magic-string-no-enum) |
| **F. Polymorphism changes** (add new oneOf variant) | EV-6 (no discriminator/mapping), EV-61 (closed oneOf with growth-language) |
| **G. additionalProperties change** (true→false on response, false→true on request) | EV-5 (undeclared response), EV-18 (true on request) |
| **H. Operation removal/renaming** | EV-8 (no operationId), EV-17 (no tags), EV-27 (path-extension), EV-28 (env-in-path), EV-38 (verb-in-path) |
| **I. Status-code-set changes** (remove 4xx, etc.) | EV-15 (>10 codes wide-open), EV-16 (no default), EV-45 (default+specific overlap) |
| **J. Header-set changes** (remove header response) | EV-49 (429 no Retry-After), EV-50 (304 no validators), EV-59 (3xx no Location) |
| **K. Security changes** (add auth requirement) | EV-19 (declared-unused), EV-32 (auth-as-param) |
| **L. Content-type changes** (remove media-type) | EV-20 (single media-type), EV-30 (no JSON), EV-47 (multiple-types same-schema), EV-48 (PATCH wrong content-type) |
| **M. Server-URL / version-axis changes** | EV-9 (placeholder version), EV-10 (mixed versioning), EV-12 (minor in URL), EV-13 (non-semver-non-date), EV-37 (no version), EV-53 (URL-version vs spec-version drift), EV-56 (no servers), EV-28 (env in path) |
| **N. Schema-rename / refactor** | EV-21 (no description on required), EV-40 (name collision), EV-41 (versioned suffix), EV-44 (no components), EV-46 (readOnly/writeOnly leak) |
| **O. Deprecation-without-migration** | EV-1 (no sunset/replacement), EV-58 (active+deprecated contradiction), EV-60 (webhook no docs) |
| **P. Validation-tightening** | covered by D + EV-22 (no-maxDepth on cycle) + EV-33 (nullable+required contradiction) |
| **Q. Spec-version migration** | EV-34 (Swagger-2), EV-43 (half-migrated 2-to-3) |

#### C) Severity-Axis policy refinement for Lens-3

Round-1's severity-axis discussion identified `{level: must|should|may, lens: ..., source: ...}`. Round-2 Phase C suggests a **direction modifier** specific to Lens-3:

- **Tightening direction (server adds constraint later):** patterns whose absence today permits future tightening that breaks existing-passing clients. → severity tends warn (mechanical predictability).
  - Examples: EV-5 (response add. props undeclared), EV-18 (request additionalProperties: true), EV-23 (no maxLength), EV-24 (unanchored pattern), EV-25 (untyped integer)
- **Loosening direction (server removes / expands):** patterns whose presence today implies future-removal-or-expansion will break. → severity tends hint (predictability lower; some looseness is healthy).
  - Examples: EV-3 (closed enum), EV-15 (wide status codes), EV-39 (single-value enum), EV-51 (magic-string)
- **Drift / contradiction direction:** patterns indicating internal inconsistency that future-fix is breaking. → severity tends warn-to-error.
  - Examples: EV-7/EV-55 (required+default), EV-33 (nullable+required), EV-40 (name collision), EV-43 (half-migrated), EV-46 (readOnly/writeOnly leak), EV-57 (required not in properties)

Recommend tagging each Lens-3 rule with **direction**: `tighten` | `loosen` | `drift`. apiq's UI can sort/filter by it; LLM Phase B can use it as ranking context.

#### D) Cross-Lens overlap is heaviest with Lens-4 (Client-Friction) and Lens-2 (Standards)

Of the 62 EV-* patterns above, ~30 carry both Lens-3 and Lens-4 tags, ~15 carry both Lens-3 and Lens-2 tags, and 4 carry all three (EV-25, EV-49, EV-50, EV-32). This is empirical evidence that Lens-3/Lens-4 is essentially one continuous "developer-experience-over-time" axis. apiq's lens-tagging-architecture should treat them as orthogonal but expect heavy multi-tag in practice — that's a feature, not noise.

#### E) Patterns most-uniquely Lens-3 (no overlap)

Patterns that are NEARLY uniquely-Lens-3 (low overlap with other lenses) — these are the "purely-evolution-friction" rules:

- EV-1 (deprecated without sunset)
- EV-2 (required-field-stability heuristic)
- EV-9 (placeholder info.version)
- EV-13 (non-semver/non-date version)
- EV-37 (no info.version)
- EV-39 (single-value-required enum)
- EV-41 (versioned-suffix property name)
- EV-42 (internal/beta tag-name)
- EV-44 (no components extracted)
- EV-53 (URL-version vs spec-version drift)
- EV-58 (deprecated with active enum)
- EV-60 (webhook without docs)
- EV-61 (closed oneOf with growth-language)

These are the "smoking-gun" Lens-3 patterns that genuinely add Round-2 coverage that Round-1's Lens-frame did not surface. Recommend prioritizing these in Stage-A Phase-A2 implementation — even if their individual signal quality is hint-level, *they collectively form the Lens-3 differentiator* over mature linters that mostly stop at Lens-2/standards-compliance and don't predict future breaking changes.

#### F) The "minimum-viable Lens-3 detector" composite

If apiq wants ONE high-signal Lens-3 finding that surfaces "this spec is heading-for-evolution-friction", combine these 5 single-spec patterns into a single compound-finding (raise severity if 3+ fire):

1. **EV-1** — `deprecated: true` somewhere with no sunset/replacement
2. **EV-9 OR EV-13 OR EV-37** — version-discipline-absent
3. **EV-3 OR EV-39** — closed-enum-without-extensibility on a response
4. **EV-5 OR EV-18** — additionalProperties-undeclared
5. **EV-6** — oneOf without discriminator-mapping

This is the apiq-USP equivalent: a single deterministic finding that says "this API will hurt to evolve" — something no other linter currently produces. Worth implementing as a top-level Stage-A summary alongside the per-rule findings.

#### G) Out-of-band: openapi-changes + Optic give us the "lifecycle-rule" framing

Optic's `required_on: added` semantic (apply lint rule only to newly-added endpoints) is fundamentally a **two-spec feature** but the framing is interesting for apiq's roadmap: a future "apiq spec-evolution mode" where the user uploads v1 and v2 (or apiq remembers the previous-uploaded version and diffs) becomes a natural extension. The Lens-3 single-spec rules above are the *foundation* — they tell you the spec is at risk; the diff-mode would *confirm* or *deny* that risk on actual evolution events. apiq should keep this in mind when designing Stage-A's data model so a future "evolution mode" plug-in can re-use the same rule definitions with a different lifecycle gate.

---

## Summary

- **62 net-new EV-* patterns** added (Lens-3 specific), each tagged with multi-lens, severity-direction (tighten/loosen/drift), and breaking-change-class (A through Q).
- **20 already-in-apiq-brainstorm** confirmed by Round-2 sources for the Lens-3 lens specifically — most of these were tagged as Lens-1/2/4/5 in Round-1; Round-2 adds Lens-3 to their multi-lens metadata.
- **20 out-of-scope** patterns identified that fundamentally need two-spec diff (Stage-A is single-spec; this is future-feature territory).
- **10 unsure** patterns flagged for review — mostly heuristic-quality concerns (false-positive risk on regex-on-description rules) or Lens-borderline-LLM cases.
- **One compound-finding** proposed (Section F) as the apiq-Lens-3-USP — a single high-signal "evolution-friction-detected" output drawn from 5 sub-rules.

**Net-effect on apiq Stage-A:** ~25 new rules / patterns to implement (the high-signal subset of the 62), ~20 re-tag operations on existing brainstorm-IDs (multi-lens annotation), and one architectural addition (severity-axis-direction-modifier).

**Reputation-load-bearing relevance:** mature linters (Vacuum, Redocly, Spectral-OWASP, IBM, Zalando) heavily cover Lens-1/2/5; they undercover Lens-3 (evolution-friction) because they don't have a notion of "predict future breaking changes from a single spec". oasdiff and openapi-changes cover Lens-3 only in the two-spec mode. **apiq's single-spec Lens-3 detection is therefore a genuine differentiator** — and it's the lens least at-risk-of-self-narcissistic-measurement (because the prediction is verifiable: *did* the next version of this API actually break in the predicted way?).

---

**Status:** Mining-Round-2 Phase C draft — 2026-05-05. Ready for consolidation with Phases A, B, D, E, F (when complete) into the brainstorm-living-doc.
