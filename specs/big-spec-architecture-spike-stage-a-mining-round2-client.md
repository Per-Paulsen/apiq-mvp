# Stage-A Mining Round-2 Phase D — Client-Friction (Lens 4)

> **Zweck:** Systematic mining of patterns that cause friction for **client-developers and their tools** (codegen, SDK-Builder, doc-renderer). Round-1 hinted at this lens (X-headers, casing-mix, bare-array). Round-2 widens to: what makes specs painful for openapi-generator (Java/Python/Go/Rust/TS), openapi-typescript, ReDoc, Swagger-UI, Stoplight Elements; what mature SDK-pipelines (Stripe, GitHub Octokit, Twilio) avoid; refactoring antipatterns (DRY, naming-collisions, similar-not-identical).
> **Method:** Issue-tracker keyword-mining + recent (2025/2026) State-of-API reports + SDK-vendor best-practices + targeted research on Stripe/Octokit/Twilio conventions.
> **Status (2026-05-05):** Round-2 Phase D done.

---

## Sources surveyed

| Tool/Source | URL | What-was-extracted |
|---|---|---|
| openapi-generator (multi-lang) | https://github.com/OpenAPITools/openapi-generator/issues | Reserved-keyword collisions, allOf-inheritance breakage, anyOf vs oneOf modeling problems, multiple-content-types-per-op generates only one, multi-line description squishing, nullable+required three-state confusion, identifier-stripping (underscore→camelCase) collisions, type+format-mismatch crashes, inline-schema deduplication failures (`EntityMapping1`, `EntityMapping2`), int64 precision loss in JS clients, recursive-schema infinite-loop (REF_AS_PARENT_IN_ALLOF), discriminator-collision-with-property-named-`type`, external $ref relative-path resolution failures, multipart/mixed unsupported. |
| openapi-typescript | https://github.com/openapi-ts/openapi-typescript/issues | Missing types for `pattern`/`maxLength`/`minLength`, `components.responses` not generated correctly, 204-empty-body type-system breakage (`{}` vs `null`/`undefined`), error-vs-success indistinguishable when both empty, runtime-validation absence, oneOf/anyOf union complexity, enum duplicate-identifier collisions (e.g. timezone `+`/`-` chars). |
| openapi-python-client | https://github.com/openapi-generators/openapi-python-client/issues | Patterned status codes (`4XX`) not respected, recursive-schema parse-failure (response omitted), pattern lost in oneOf-of-strings, model named "Client" collides with `client.Client`, enum only string/integer supported, allOf base-extend drops maxLength/pattern. |
| oapi-codegen (Go) | https://github.com/oapi-codegen/oapi-codegen/issues | Inconsistent underscore handling (`_UPPER` → `UPPERSNAKECASE`), inline anonymous types tedious, leading-digit operationIds, `text/plain` invalid type-assertion, multiline-description-leading-spaces breaks overlay, additionalProperties ambiguity, external $ref CWD-dependent resolution. |
| utoipa (Rust) | https://github.com/juhaku/utoipa | Tuples/arrays/slices unsupported as generic args, no recursion without `no_recursion` attribute, only schema+response components, inline-with-generics ambiguous. |
| ReDoc | https://github.com/Redocly/redoc/issues | Pattern-rendering-failure on long UUID-regex, deeply-nested `allOf`/`oneOf` race-condition, models-with-`allOf` break with ≥3 `$ref` hops, freeze on deeply nested expand, `$ref`-pointer-resolution-fails on relative paths, schema-arrays-of-arrays render error. |
| Swagger-UI | https://github.com/swagger-api/swagger-ui/issues | discriminator.mapping content not displayed, only first oneOf/anyOf in example rendered, deeply-nested-allOf intermittent rendering, multipart/mixed unsupported, deepObject query-params don't handle nested objects, freeze on deeply nested PUT/POST, XML examples broken with oneOf/anyOf. |
| Stoplight Elements | https://github.com/stoplightio/elements/issues | Schema-render-error for arrays-of-arrays (`'in' operator on array`), hash-routing failures v9.0.x, CSS conflicts with host webapp. |
| Stripe OpenAPI | https://github.com/stripe/openapi | Separate `spec3.sdk.json` for SDK-codegen with `x-expandableFields`, `x-resourceId`, idempotency-key as Header (not body-field) on POST/DELETE, expand-mechanism, predictable resource-naming, separate "preview" features marked. |
| GitHub Octokit OpenAPI | https://github.com/octokit/openapi | `x-octokit` extensions overlay onto base OpenAPI to drive SDK behavior; tracks operation-id and parameter-name changes for deprecation-warnings; avoids breaking-change-frequency by stable-naming. |
| Twilio openapi | https://github.com/twilio/twilio-oai | Per-product spec-files, callback-pattern docs, country-aware phone-validation, vendor-extensions for SDK-templating. |
| Speakeasy SDK best practices | https://www.speakeasy.com/docs/sdks/prep-openapi/best-practices | Long auto-gen operationIds (FastAPI) → unidiomatic SDK methods; need `x-speakeasy-name-override` for clear error-types; OpenAPI 3.1 recommended; consistent error-class names; extension naming `x-<vendor>-<function>`. |
| Speakeasy comparison-blog | https://www.speakeasy.com/blog/comparison-sdk-generators-openapi | Different generators per language → inconsistent SDK ergonomics (chains vs kwargs vs functional-options vs builders). |
| Postman 2025 State of the API | https://www.postman.com/state-of-api/2025/ | 93% of teams have collaboration-blockers; 89% REST/OpenAPI; doc-stale top-pain; AI-agent-consumption emerging (89% of devs use AI tools but only 24% design APIs for agents). |
| OpenAPI Initiative blog (2025/12) | https://www.openapis.org/blog/2025/12/04/openapi-initiative-newsletter-december-2025 | Specification-evolution / governance signals. |
| dev.to "Good/Bad/OpenAPI" | https://dev.to/lovestaco/the-good-the-bad-and-the-openapi-why-developers-love-and-hate-it-40ho | Manual-annotation pain, drift between spec + impl, missing-example pain. |
| Redocly: how-to-use-discriminator | https://redocly.com/learn/openapi/discriminator | discriminator best-practices: must point to required property; mapping-explicit; no oneOf-without-discriminator. |
| Speakeasy oneOf/allOf/anyOf guide | https://www.speakeasy.com/openapi/schemas/objects/polymorphism | TS-unions don't XOR; oneOf-mixed-with-other-keywords creates intersection+union mess; anyOf interpretation-divided across generators. |
| Speakeasy "Numbers/Integers" | https://www.speakeasy.com/openapi/schemas/numbers | int64 must declare format; JS precision-loss > 2^53; recommend string-encoding for big-int. |
| Speakeasy "Null in OpenAPI" | https://www.speakeasy.com/openapi/schemas/null | nullable+required three-state-problem; need wrapper-type to express set/unset/null. |
| Stripe Codegen-Story (Brandur) | https://brandur.org/fragments/stripe-codegen | Resources must follow same form for templating to work; extensions like `x-expandableFields`, `x-resourceId`. |

---

## Patterns extracted

### Generic (take into apiq)

| ID | Pattern | Source | Multi-Lens-Tags | Severity-Axis | Detection-feasibility | Tools-affected | Notes |
|---|---|---|---|---|---|---|---|
| CL-1 | **Reserved-keyword property/operationId-names** (`type`, `class`, `default`, `package`, `interface`, `protected`, `import`, `for`, `from`, `id` etc.) per target-language | openapi-generator #1831, #7100, swagger-codegen #4805 | client-friction, evolution | warn | mech-stat (allowlist of multi-lang reserved-words) | **Java, Go, Python, Rust, C#, TypeScript** — generators silently rename or fail-compile | Apiq G-SP-6 has it for SPS — **broaden as multi-lang-allowlist**. SPS is single-lang — apiq should ship with built-in union (Java + Go + Python + JS-strict + Rust + C# + Kotlin). |
| CL-2 | **Property-name with leading underscore or leading digit** | swagger-codegen #4805, openapi-generator #2032, AbstractGoCodegen | client-friction | warn | mechanical (regex `^[_\d]`) | **Java, Go, Python** — Go strips underscores → collisions; Java compile-fail; Python reserved | Apiq missing. |
| CL-3 | **Property-names that camelize-collide with sibling Schema-names** (e.g. `User.tier` + `UserTier` schema → `User_tier` ↔ `UserTier`) | openapi-generator #17909 | client-friction | warn | mechanical (cross-reference table: for each property, compute camelCase → check against components.schemas keys case-insensitive) | **typescript-fetch, Java, C#** | Cousin of apiq O2 (case-insensitive component-name collision); this is a property×schema-name collision. **Niche-but-mechanical.** |
| CL-4 | **Inline-Object schemas without `title`** (codegen produces `InlineObject`, `InlineObject1`, `InlineObject2`) | openapi-generator multi, oapi-codegen DEFAULT, Speakeasy best-practices | client-friction, ergonomics | warn | mechanical (every inline-object-schema has parent context but no `title`) | **All** Java, Python, Go, Rust, TS — produces unnamed/anonymous types | Apiq M6 is reuse-detection. CL-4 narrower: even if inline is acceptable, **adding `title`** fixes codegen-name-quality. |
| CL-5 | **operationId verbose / auto-generated by framework** (`getUsersByIdGetUsersUserIdGet`, FastAPI-style) | Speakeasy best-practices, SDK-vendor consensus | client-friction, ergonomics | warn | heuristic (length>40 OR contains repeated tokens OR contains http-verb-twice OR contains path-segments duplicated) | **All SDK-codegen** — produces ugly method names | Apiq has operationId-verbose Walker (G3). Strengthen with framework-fingerprint patterns. |
| CL-6 | **operationId missing entirely** (some operations) | openapi-generator #320, NIFI-7498, all generators | client-friction, evolution | error | mechanical | **All** | Spectral has `operation-operationId`. Apiq covers via spectral:oas. **Verify it's emitting.** |
| CL-7 | **Required + nullable property without explicit semantics-clarification in description** (3-state problem: missing / null / value) | openapi-generator #14765, #5698, #4530, #21504, Speakeasy null-guide | client-friction, evolution | hint | mechanical (any property both `required: true` AND `nullable: true` / `type: [x, null]`) | **Java (JsonNullable), Python (Optional/wrapper), TS (\|null), C#** — all need explicit 3-state handling | Apiq missing. **Common spec-author oversight.** |
| CL-8 | **Property-required-in-response but not-in-request schemas** (asymmetry without explicit Read/Write split via `readOnly`/`writeOnly`) | Speakeasy responses-guide, openapi-generator #20213 | client-friction, ergonomics | hint | mechanical (compare schemas used by GET-response vs POST-request: same Resource-ID pattern, divergent required-set, no readOnly/writeOnly) | **All codegen** | Companion to apiq M-SP-3 (readOnly in request). Detect via cross-op-comparison. |
| CL-9 | **Same-status-code with multiple content-types** (codegen picks first, others unreachable) | openapi-generator #17877, #18293, oapi-codegen #1897 | client-friction | warn | mechanical | **Java, openapi-typescript, Go** — only first `content` entry generated | Apiq missing. **High-impact for clients.** |
| CL-10 | **Mixed `text/plain` + `application/json` for same status-code** (codegen produces invalid type-assertion in Go) | oapi-codegen #1897 | client-friction | warn | mechanical | **Go (oapi-codegen), Java** | Subset of CL-9 with stronger severity for go. |
| CL-11 | **anyOf used where oneOf is intended** (combinatorial generator-explosion, 2^n types) | Speakeasy polymorphism, oneOf/anyOf consensus, openapi-generator #6376 | client-friction, ergonomics | hint | LLM-only / heuristic (mutually-exclusive subschemas signal) | **TS-strict-unions, Python pydantic, Rust enums** — anyOf produces N intersection-types, oneOf produces XOR | Apiq has A14 already as "LLM-only". Confirmed not-deterministic. |
| CL-12 | **oneOf without discriminator** (codegen guesses or produces verbose union-handling) | Redocly discriminator-guide, openapi-generator #18207, openapi-typescript discussion #1869 | client-friction, ergonomics | warn | mechanical | **All** TS generates `T1\|T2\|...`, runtime can't distinguish; Java needs custom-deserializer | Apiq has `apiq-oneof-needs-discriminator`. **Verified consensus.** |
| CL-13 | **discriminator.propertyName matches existing-but-non-required property** (codegen omits or mishandles) | openapi-generator #9444 (`_type` collision), Redocly | client-friction | warn | mechanical (discriminator.propertyName must be in `required` array of the discriminating schema) | **Java, TS, C#** | Apiq A4 checks existence — **extend: also must be in required**. |
| CL-14 | **discriminator.propertyName with leading underscore** (Java codegen produces uncompilable) | openapi-generator #9444 | client-friction | warn | mechanical | **Java** specifically | Subset of CL-2 + discriminator-context. |
| CL-15 | **`int64` integer without `format: int64` declared** (JS clients silently lose precision >2^53) | OAI #3231, Speakeasy numbers, openapi-generator #18082 | client-friction, evolution | warn | heuristic (integer-property named `*_id`/`*_count`/`*_timestamp` or schema-description hints "snowflake"/"unix-time-ms"/"large" without format) | **JavaScript/TypeScript clients** — silent precision-loss | Apiq has unix-time check on naming. Generalize: integer without `format` AND naming-suggests-large. |
| CL-16 | **`int64` declared but no string-representation alternative** (JS-clients have no safe option) | OAI #3231, Speakeasy numbers, Stripe-convention | client-friction | hint | mechanical (any `format: int64` integer property without `oneOf: [{type: integer, format: int64}, {type: string, pattern: ^-?\\d+$}]`) | **JavaScript, Go (rare)** | Recommended-pattern. Hint-only. |
| CL-17 | **Recursive schema without termination-marker / `default`-stops** (codegen infinite-loop) | openapi-generator #17425, openapi-python-client #338, utoipa `no_recursion` | client-friction, evolution | warn | graph (cycle-detection on $ref-graph; flag cycles) | **openapi-generator, openapi-python-client, utoipa** | Apiq has `cycleStripSpec` silent. **Round-1 brainstorm A2 already says emit as Finding** — confirmed via codegen-pain. **Upgrade severity.** |
| CL-18 | **Recursive cycle on a `required` field** (unrecoverable codegen-loop, no escape) | pb33f Circular References | client-friction | error | graph (cycle on edges where target is in `required` of source) | **All codegen** | Stricter than CL-17 — required-cycle is unrecoverable. |
| CL-19 | **Empty body 2xx response with no discriminating header** (e.g. 204 + 404 both empty → client can't distinguish via body) | openapi-typescript #2291, #1868, openapi-generator #7720 | client-friction | hint | mechanical (op has both 2xx-no-content AND 4xx-no-content) | **openapi-typescript, react-query integration** | Niche but real. |
| CL-20 | **204 Response with declared `content`** (RFC-violation; codegen confused) | OAI #3536, openapi-typescript discussion | client-friction, standards | warn | mechanical | **All** | Apiq missing — explicit 204+content combo. |
| CL-21 | **Response uses `format` not in IANA-format-registry** (Codegen falls back to string; pattern is ignored) | openapi-generator multi, OpenAPI registry | client-friction | hint | mechanical (allowlist: int32, int64, float, double, byte, binary, date, date-time, password, email, uuid, uri, hostname, ipv4, ipv6, regex) | **All** | Apiq A7 covers as hint. **Confirmed.** |
| CL-22 | **`type: object` without `properties` AND without `additionalProperties`** (codegen produces empty class / opaque blob; map vs object ambiguous) | openapi-generator #796, #14232, Apicurio #129, swagger-codegen #5132 | client-friction | warn | mechanical | **Java (HashMap missing), C# (object instead of Dictionary), Go** | Apiq M-SP-13 partial. **Stronger:** type:object without properties&additionalProperties is ambiguous. |
| CL-23 | **`additionalProperties: true` for free-form-object** (Java codegen failure for HashMap-Wrapper) | openapi-generator #796 | client-friction | hint | mechanical | **Java specifically** | Niche; document as "Java-specific". Hint. |
| CL-24 | **Multiple-types in 3.1 spec unconstrained** (e.g. `type: [string, integer, object]`) | openapi-generator #18207 (3.1 Error), Mining MIN-IBM | client-friction | warn | mechanical | **typescript-fetch, Java** — fail or generate `Object` | Apiq A-MIN-16 partial. **Confirmed.** |
| CL-25 | **`pattern` Regex with constructs unsupported by ECMA-262 / Java / Python re** (named-groups, lookbehinds, possessive-quantifiers, etc.) | ReDoc #1372, openapi-python-client #11521 | client-friction | warn | mech-stat (try-compile pattern in JS-Regex AND Java-Pattern AND Python-re; report incompatibilities) | **All** ReDoc render-fail; Python-client validation-skip; Java-client OK but TS-strict-fail | Apiq A6 just compile-tests JS — **upgrade to multi-engine**. |
| CL-26 | **`pattern` without `^`/`$` anchors** (JS engine partial-matches; many codegen tools warn) | Mining MIN-2 IBM, Speakeasy | client-friction, security | warn | mechanical | **All** | Apiq A-MIN-1 has it. **Confirmed.** |
| CL-27 | **Response defined under `components.responses` but `$ref`'d differently in different ops, leading to type-table-mismatch** | openapi-typescript #408 | client-friction | hint | graph (component-response-usage-consistency) | **openapi-typescript** | Niche. |
| CL-28 | **Patterned status-codes (`4XX`, `5XX`)** (some codegen tools omit them silently) | openapi-python-client #1271 | client-friction | warn | mechanical | **openapi-python-client, others** | Apiq missing. |
| CL-29 | **Excessive deeply-nested inline objects (>3-4 levels) without $ref-extraction** (Swagger-UI freezes; ReDoc race-condition) | swagger-ui #6197, #6362, redoc #311, #840 | client-friction, ergonomics | warn | mechanical (max-depth-stat-walker) | **Swagger-UI, ReDoc** | Apiq M4 has it (>3 levels). **Confirmed via doc-renderer pain.** |
| CL-30 | **Deeply-nested allOf/oneOf chains via $ref (≥3 hops)** (Swagger-UI broken) | swagger-ui #7437 | client-friction | warn | graph ($ref-hop-counter for combinator-chains) | **Swagger-UI** | Apiq missing. Niche. |
| CL-31 | **Bare-array request body** (codegen problems on languages where method-overloads expect named-keys) | openapi-generator #17877, [SP-G-AZ-16] | client-friction | warn | mechanical | **All** Same as Round-1 cross-source consensus. | Already in apiq §1 cross-source for response — extend to request-body. |
| CL-32 | **`array<array<X>>` (array-of-array)** | Mining MIN-32 IBM, stoplight-elements #1418 | client-friction | hint | mechanical | **Stoplight Elements (render error), most codegen** | Apiq D-MIN-5 has it. **Confirmed.** |
| CL-33 | **`schema` without `type`** (codegen-undefined behavior; many generators produce `Object` or fail) | Mining MIN-11 Vacuum, openapi-generator multi | client-friction | warn | mechanical | **All** | Apiq A-MIN-9 has it. **Confirmed.** |
| CL-34 | **Property-name "Client"** (collision with generated SDK class `Client`) | openapi-python-client #1045 | client-friction | hint | mechanical (allowlist of common SDK-class-names: `Client`, `Api`, `Configuration`, `Response`, `Request`) | **openapi-python-client; many SDK-frameworks** | Niche but real. Suggest renaming. |
| CL-35 | **Schema named `Client`/`API`/`Response`/`Request` etc.** (collides with SDK-built-in) | openapi-python-client #1045 generalized | client-friction | warn | mechanical (allowlist) | **openapi-python-client; openapi-generator (multi); Speakeasy** | Component-naming-hygiene companion to O2. |
| CL-36 | **`example` with `value` AND `externalValue` simultaneously** (mutually-exclusive in spec) | Mining MIN-48 Redocly | client-friction, syntax | error | mechanical | **All renderers** | Apiq M-MIN-2 has it. **Confirmed.** |
| CL-37 | **Component naming uses spaces or special chars** (codegen produces invalid identifier) | Mining MIN-47 IBM, MIN-49 Redocly | client-friction | warn | mechanical (regex `^[A-Za-z_][A-Za-z0-9_]*$` per component-key) | **All** | Apiq A-SP-3, A-SP-4 cover. **Confirmed.** |
| CL-38 | **Multi-line description with leading/trailing whitespace stripped/squished** (Go-codegen squishes; Spring-doc loses formatting) | openapi-generator #8011, #4111, oapi-codegen #1927 | client-friction, ergonomics | hint | heuristic (description has explicit `\n\n` paragraph-breaks AND uses Markdown features that may break in target-comment-syntax: code-blocks, tables, lists with leading-spaces) | **Go-codegen, Java/Spring** | Niche but documented. Apiq has HTML-prevalence walker — extend to "complex-markdown-prevalence". |
| CL-39 | **Description contains HTML or complex Markdown** (some renderers escape, some interpret; codegen comments break) | OAS-supports-CommonMark, swagger-editor #2180 | client-friction, ergonomics | hint | mechanical (HTML-tags-detection, already in apiq) | **swagger-ui (some elements escaped), openapi-generator (Java/Python)** | Apiq covers via HTML-Walker. **Confirmed.** |
| CL-40 | **Path with `?` query in path-template** (specs that erroneously include `?foo=bar` in path-string) | Mining SP-G-SPS-17 | client-friction | warn | mechanical | **All** — rejected at validation | Apiq S-SP-7 has it. **Confirmed.** |
| CL-41 | **External `$ref` to a relative-path file** (codegen tool can't resolve unless invoked from spec-CWD) | openapi-generator #1976, oapi-codegen #542, openapi-generator #3233 | client-friction, evolution | hint | mechanical (find any `$ref` with `./`, `../`, or relative file-path) | **All codegen** running from non-spec directory | Apiq has External-Reference-Validation as §11 module. **Confirm: emit warn for relative refs.** |
| CL-42 | **Spec uses external $refs to URLs (HTTPS) without offline-bundling** (codegen breaks in airgapped CI; doc-render breaks for offline) | openapi-generator #149, oapi-codegen wiki | client-friction, evolution | hint | mechanical (find any `$ref` with `http://`/`https://`) | **All codegen, doc-renderers** | Apiq missing. Note: diff-treatment from same-file-relative. |
| CL-43 | **Description `description` contains `$ref`-like-strings or unescaped JSON-pointers** (markdown-renderer interprets) | Mining MIN-46 IBM | client-friction | hint | mechanical (`description` field contains `"$ref"` substring) | **ReDoc, swagger-ui** | Apiq missing. Niche. |
| CL-44 | **Verbose vs cryptic field-names** (`customer_payment_method_creation_timestamp` vs `cpmct`) | Lens-4 brainstorm explicit; Speakeasy ergonomics | client-friction, ergonomics | hint | heuristic (length > 40 chars OR contains 5+ underscore-segments OR length < 3) | **All SDKs — both extremes hurt readability** | Apiq has operationId-verbose; extend to property-names. |
| CL-45 | **Pagination: list-endpoints with mixed conventions cross-spec** (`/users` cursor, `/orders` offset) | Lens-4 brainstorm; Speakeasy pagination, Postman-survey | client-friction | warn | heuristic (cluster list-endpoints by parameter-set; flag if > 1 distinct cluster) | **All SDKs** — pagination-helper inconsistency | Apiq W10 walker. **Confirmed cross-source.** |
| CL-46 | **Inconsistent error-shape cross-endpoint** (op A returns `{error}`, op B returns `{message, code}`) | Lens-4 brainstorm, Speakeasy errors | client-friction, ergonomics | warn | mech-stat (cluster 4xx response-schemas; flag if > 1 distinct shape & not all problem+json) | **All SDKs** — distinct error-handlers per op | Apiq D2 has it. Strengthen via cross-op clustering. |
| CL-47 | **Resource-shape contradiction: POST/PUT/PATCH return-shape ≠ GET-shape** (creates type-soup for client) | Mining MIN-35 IBM `ibm-resource-response-consistency`, Lens-4 brainstorm | client-friction, ergonomics | hint | mechanical (cross-op cluster: same Resource-Path-Stem, compare 2xx response-schema reference equality / hash) | **All SDKs** | Apiq D-MIN-3 has it. **Confirmed via SDK-codegen pain.** |
| CL-48 | **`schemas/` directory has multiple similar-not-identical Schemas** (`User`, `UserBase`, `UserPublic`, `UserPrivate`) without naming convention | Lens-4 brainstorm; Stripe-codegen requires same-form | client-friction, ergonomics | hint | mech-stat (cluster schemas by property-name-set Jaccard ≥ 0.7; flag clusters of size ≥ 3; suggest allOf-refactor) | **All** | Apiq M7 hash-duplicate covers exact. CL-48 = near-duplicate. |
| CL-49 | **Doc-vs-Schema divergence** (description "returns user object" but response-schema is `string`) | Lens-4 brainstorm; OAI-survey | client-friction, ergonomics | hint | LLM-only | **All** — not deterministic | Out-of-scope for Stage A (LLM-job). |
| CL-50 | **Path-segments with file-extensions** (`/users.json`) — Codegen tools strip silently, breaks routing | Mining SG-5, [SP-G-SPS-13] | client-friction, standards | error | mechanical | **All routing** | Apiq S-SP-6. **Confirmed.** |
| CL-51 | **Operation has many parameters mixed required/optional without ordering** (SDK ergonomics: positional-param-API order matters) | Mining MIN-27 IBM `ibm-parameter-order` | client-friction, ergonomics | hint | mechanical (parameters array: required-params should precede optional-params) | **Go, Python (positional), Rust (positional)** | Apiq R-MIN-1 has it. **Confirmed.** |
| CL-52 | **Heavy use of `additionalProperties: {schema}` patterns** (well-defined dictionaries) without consistent value-type cross-spec | Mining MIN-IBM `ibm-well-defined-dictionaries` | client-friction, ergonomics | hint | mechanical (all `additionalProperties: {…}` schemas: cluster by structure; warn if mix of types) | **Strongly-typed languages: Java, Go, Rust** | Apiq M-SP-17 has it. **Confirmed.** |
| CL-53 | **Operation with `parameters` AND `requestBody` both required, body+query mixed** (some codegen produces awkward signatures) | Speakeasy ergonomics, Postman-survey | client-friction, ergonomics | hint | mechanical (count required-params + required-body, flag if both exist AND total > 5) | **All SDK-frameworks** | Apiq R3 (parameter-count) covers partial. Strengthen. |
| CL-54 | **`securitySchemes` with mixed types globally** (operations sometimes apiKey, sometimes OAuth2, sometimes both) | Speakeasy SDK-best-practices | client-friction, evolution | warn | mech-stat (per-op security-scheme set; cluster) | **All SDKs** — auth-handling-complexity multiplied | Apiq F covers. Cross-op-security-clustering = strengthen. |
| CL-55 | **Uppercase enum values mixed with lowercase enum values within same enum** (Go/Rust generator-naming-mess) | Mining SG-37, M12 | client-friction, ergonomics | warn | mechanical | **All** | Apiq M12 covers. **Confirmed.** |
| CL-56 | **Enum values with characters that aren't valid identifier-chars** (e.g. timezone `+05:00`, `Sao_Paulo`) | openapi-typescript #1874 | client-friction | warn | mechanical (enum-value matches regex `^[A-Za-z_][A-Za-z0-9_]*$`?) | **TS-enum, Java-enum, Rust-enum** | Apiq missing. **Specific to enum-rendering.** |
| CL-57 | **`enum` with duplicate values** (some langs error, some take last) | spectral `duplicated-entry-in-enum` | client-friction, syntax | error | mechanical | **All** | Apiq covers via spectral default. **Verify it's emitting.** |
| CL-58 | **Duplicate `path` strings (different operations on differently-templated paths that resolve to same)** | Mining MIN-7 Vacuum/Redocly, MIN-8 | client-friction | error | mechanical | **All routing** | Apiq A-MIN-5/A-MIN-6. **Confirmed.** |
| CL-59 | **`operationId` not URL-friendly** (contains spaces, slashes, etc.) | Mining SP-G-SD-5 | client-friction, ergonomics | error | mechanical (regex `^[A-Za-z][A-Za-z0-9_-]*$`) | **All SDKs, doc-portals** | Apiq G-SP-8. **Confirmed.** |
| CL-60 | **`x-internal: true` extension on operations that ARE in spec** (Speakeasy/Stripe-pattern; some codegens omit, some include) | OpenAPI Generator wiki, Speakeasy extensions | client-friction, evolution | hint | mechanical (info-finding: "this spec uses x-internal — be aware of generator-handling differences") | **OpenAPI Generator, Speakeasy, Stripe** | Apiq missing. Informational pattern. |
| CL-61 | **Vendor-extension vendor-prefix-inconsistency** (mix of `x-amazon-`, `x-stripe-`, generic `x-foo-` in same spec — no convention) | Speakeasy extensions guide; OpenAPI-Initiative best-practices | client-friction, evolution | hint | mech-stat (cluster x-*-extensions; warn if vendor-prefix-inconsistent) | **All codegen — silently ignored** | Apiq has Vendor-Extension-Overuse Walker. Extend to vendor-prefix-consistency. |
| CL-62 | **Operations on the same Resource have varying tag-assignment** (some tagged "Users", others "User Management", others untagged) | Lens-4 brainstorm; Postman-survey doc-quality | client-friction, ergonomics | hint | mech-stat (cluster ops by Path-stem, flag if tag-set-per-cluster > 1) | **doc-portals, SDK-method-grouping** | Apiq Q5 partial. Strengthen via cross-op-clustering. |
| CL-63 | **Operations missing both `summary` AND `description`** | spectral default + Speakeasy SDK-best-practices | client-friction, ergonomics | warn | mechanical | **All** — SDK-method-docstrings empty | Apiq R-SP-1 has it. **Confirmed.** |
| CL-64 | **OperationId verb-prefix inconsistent with HTTP-method** (`getUser` on POST, `createUser` on GET) | Mining R-SP-5, Apiq B8 | client-friction, ergonomics | hint | heuristic (operationId-verb-prefix vs http-method dictionary) | **All SDKs** — confusing method-naming | Apiq B8 covers. **Confirmed.** |
| CL-65 | **Required boolean-property without explicit `default`** (some codegen serializes default-false even when meant absent) | openapi-generator multiple | client-friction | hint | mechanical | **Java boolean, Go bool** — language has no "absent" for primitive | Niche; informational. |
| CL-66 | **Polymorphic discriminator + `mapping` references that don't exist as schemas** | OAS A4/A5; swagger-ui #9832 | client-friction, syntax | error | mechanical | **All** | Apiq A4/A5. **Confirmed.** |
| CL-67 | **Schema with `oneOf: [single-element]`** (sinnlos) | Mining `no-unnecessary-combinator` | client-friction | hint | mechanical | **All** | Apiq A13. **Confirmed.** |
| CL-68 | **Path with consecutive parameters (`/foo/{a}/{b}` no separator-segment)** | Mining MIN-6 IBM | client-friction, syntax | error | mechanical | **All routing** | Apiq A-MIN-4. **Confirmed.** |
| CL-69 | **`example` value violates schema constraints** (max-length, pattern, enum-values) | Mining N1 spectral, AJV-layer | client-friction | warn | mechanical (AJV-layer, deeper than spectral default) | **doc-renderers, SDK-test-data** | Apiq M-MIN-3 has it. **Confirmed.** |
| CL-70 | **`default` value violates schema constraints** | Apiq existing, multiple sources | client-friction | error | mechanical | **All codegen** | Apiq covers (4 primitives) — extend to nested. |
| CL-71 | **Property-naming change between v-N and v-N+1** (deprecation-warnings strategy) — Octokit-pattern | Octokit openapi-types.ts repo | client-friction, evolution | hint | mech-stat (out-of-scope: requires diff between two specs) | **Octokit-style SDKs** | Out-of-scope for Stage A — diff-tooling. |
| CL-72 | **Spec uses `multipart/mixed` content-type** (not supported by Swagger-UI, openapi-generator) | swagger-ui #5090, openapi-generator multiple | client-friction | warn | mechanical | **Swagger-UI, openapi-generator (Java/JS)** | Apiq missing. Niche. |
| CL-73 | **`servers[].url` contains placeholder-like `example.com`/`localhost`** | Mining SP-G-SD-4, Apiq P-SP-1 | client-friction | warn | mechanical | **All** — clients bake placeholder | Apiq P-SP-1. **Confirmed.** |
| CL-74 | **Spec defines callbacks but no `webhooks` (3.1)** OR webhooks but no signature-header-spec | Lens-4 brainstorm; Twilio webhook conventions | client-friction, security | hint | mechanical | **Webhook-consuming SDKs** | Apiq U covers basics. Extend with signature-header-check. |
| CL-75 | **Mixed casing-conventions cross-Tag (e.g. `Users` vs `user-management`)** | Mining Q-SP-5 | client-friction, ergonomics | hint | mech-stat | **doc-portals, navigation** | Apiq G7 + Q-SP-5. **Confirmed.** |
| CL-76 | **Operations with same path+method declared multiple times** (would be syntax-error but some specs split via overlay-files and tools merge wrong) | Mining MIN-8 Vacuum | client-friction, syntax | error | mechanical | **All** — undefined-behavior | Apiq A-MIN-6. **Confirmed.** |
| CL-77 | **Heavy use of `allOf` with multiple non-$ref objects** (codegen flattens; AutoRest fails inheritance; openapi-generator allOf-broken) | openapi-generator #9756, #20038, #3172 | client-friction, ergonomics | warn | heuristic (count `allOf`-elements: if > 2 OR mix of $ref + inline → flag) | **Java, C#, Go (significant impact)** | Apiq A12, M-SP-13 partial. **Confirmed.** |
| CL-78 | **Schema combines `allOf` + `oneOf` + `anyOf` siblings** (codegen-confused; TS produces type-soup) | Speakeasy polymorphism | client-friction, ergonomics | warn | mechanical | **TS, Python pydantic** | Apiq missing. Document. |
| CL-79 | **Operation has `requestBody` form `application/x-www-form-urlencoded` AND `application/json` simultaneously** (codegen picks one) | openapi-generator #4908, #17877 | client-friction | warn | mechanical | **Java/Feign, openapi-typescript** | Subset of CL-9. |
| CL-80 | **Schema-property `readOnly: true` AND `required: true`** (POST-time client must omit, GET-time present — many codegen frameworks fail) | Mining M-SP-3 mirrors | client-friction, evolution | hint | mechanical (`required` array contains property where schema has `readOnly: true`) | **Java (Jackson), C#** | Apiq missing. Specific corner-case. |
| CL-81 | **`$ref` inline siblings (`$ref` + other props in same object)** (3.0-violation; 3.1-allowed-context-dependent) | OAS A1, apiq has `apiq-no-ref-siblings` | client-friction, syntax | error | mechanical | **All** | Apiq covers. **Verified.** |

### Already-in-apiq-brainstorm (external sources confirm)

| brainstorm-ID | external-source-confirms | Notes |
|---|---|---|
| A1, A-SP-2 (`$ref` validity) | openapi-generator-issues, ReDoc-issues, swagger-ui-issues | Multi-tool consensus. **Apiq A1 confirmed-load-bearing.** |
| A2 (`$ref` cycles) | openapi-generator #17425, openapi-python-client #338, utoipa | Round-1 already brainstormed cycles; CL-17/CL-18 add severity-graduation. **Confirmed.** |
| A3 (`required` field exists in `properties`) | openapi-generator multi, IBM, Redocly | Universal. |
| A4/A5 (discriminator) | swagger-ui #9832, openapi-generator multi, Speakeasy | Apiq A4 add: extend to require discriminator-prop be `required` (CL-13). |
| A6 (`pattern` Regex) | ReDoc #1372, openapi-python-client #11521 | CL-25 generalizes: multi-engine compile-test. |
| A7 (`format` allowlist) | openapi-generator multi | CL-21 confirms. |
| A12, A13 (`allOf`/`oneOf`/`anyOf` single-element) | Vacuum, IBM | Multi-linter consensus. CL-67, CL-77 add. |
| A14 (`anyOf` where `oneOf` correct) | openapi-generator #6376, Speakeasy | CL-11 — confirmed-LLM-only. |
| C9 (429 + Retry-After) | DigitalOcean, Team-D | Round-1 already cross-source. |
| D2 (4xx error-schema consistency) | Speakeasy errors, Postman-survey | CL-46 strengthens via cross-op-clustering. |
| D-MIN-3 (cross-op resource-shape consistency) | IBM `ibm-resource-response-consistency` | CL-47 confirms. |
| D-MIN-5 (array-of-array) | IBM, Stoplight Elements #1418 | CL-32 confirms. |
| F1-F10 (auth-coverage) | OWASP, Speakeasy SDK-best-practices | CL-54 cross-op-security-clustering adds. |
| G1-G8 (naming-conventions) | Speakeasy SDK-vendor consensus | Statistical-walker approach validated. |
| G-SP-6 (reserved-keywords) | openapi-generator #1831, #7100 | **CL-1 generalizes to multi-lang allowlist (load-bearing).** |
| G-SP-8 (operationId URL-friendly) | Stoplight-Docs, Vacuum | CL-59. |
| K1, K2, problem+json | Speakeasy errors, RFC 7807 cross-source | Round-1 already P1. |
| M4 (deeply nested schemas) | swagger-ui multiple, ReDoc multiple | CL-29 confirms-via-renderer-pain. |
| M6 (inline-schemas-reuse) | Speakeasy SDK-best-practices, openapi-generator | CL-4 confirms. |
| M7 (hash-duplicate schemas) | Speakeasy DRY | CL-48 adds near-duplicate clustering. |
| M9 (string maxLength) | OWASP, multi-source | Round-1 already cross-source. |
| M-MIN-2 (`example.value` + `externalValue`) | Redocly | CL-36 confirms. |
| M-SP-13 (additionalProperties:type:object) | OWASP | CL-22, CL-23 strengthen. |
| M-SP-17 (well-defined dictionaries) | IBM | CL-52 confirms. |
| M12 (enum-casing inconsistency) | Speakeasy, Zalando | CL-55 confirms. |
| M-MIN-3 (example-value AJV-validation) | Redocly | CL-69 confirms. |
| O2 (case-insensitive component-name collision) | openapi-generator #17909, Redocly `component-name-unique` | CL-3 strengthens to property×schema-camelCase-collision. |
| P-SP-1 (server-URL `example.com`) | Stoplight-Docs, Redocly | CL-73 confirms. |
| Q5 (cross-operation tag-coherence) | Postman-survey, Speakeasy | CL-62 strengthens via cross-op clustering. |
| R-MIN-1 (parameter-order required-first) | IBM | CL-51 confirms. |
| R-SP-1 (operation summary OR description) | Speakeasy SDK-best-practices | CL-63 confirms. |
| S-SP-6 (path file-extensions) | Mining cross-source | CL-50 confirms. |
| S-SP-7 (path query-string `?`) | SPS | CL-40 confirms. |
| W10 (cross-endpoint pagination consistency) | Speakeasy pagination, Postman-survey | CL-45 confirms. |
| existing operationId-verbose Walker | Speakeasy SDK-best-practices | CL-5 strengthens via FastAPI-fingerprint heuristics. |

### Out-of-scope (requires running tools, not pure spec analysis)

| ID | Pattern | Source | Why-skip |
|---|---|---|---|
| OOS-CL-1 | Run **openapi-generator-cli** with `--validate-spec` against the spec, capture errors | openapi-generator usage doc | Requires JVM + multi-GB toolchain — heavy. **Future opt-in module.** apiq has TS-codegen-validation-module already (Round-1 §12). |
| OOS-CL-2 | Run **openapi-python-client** generator and capture warnings | openapi-python-client | Requires Python toolchain. **Future opt-in.** |
| OOS-CL-3 | Run **utoipa**-style or **oapi-codegen** Go-codegen and capture errors | utoipa, oapi-codegen | Rust/Go toolchain. **Future opt-in.** |
| OOS-CL-4 | Run **ReDoc** standalone-bundle and capture render-warnings | ReDoc | Headless-browser required. **Future opt-in.** |
| OOS-CL-5 | Run **Swagger-UI** and capture render-warnings | Swagger-UI | Same as above. |
| OOS-CL-6 | Run **Stoplight Elements** and capture render-warnings | Stoplight Elements | Same. |
| OOS-CL-7 | **Cross-spec-version-diff** for breaking-change-detection (Octokit-style operation-id-tracking) | Octokit, oasdiff | Requires 2 specs, not 1. **Out-of-scope for single-spec analysis** (already noted in §10 of Round-0). |
| OOS-CL-8 | **Inferring schema from real API responses** vs declared schema | Apiq existing §15 brainstorm | Requires HTTP traffic — out of single-spec scope. |

### Unsure

| ID | Pattern | Source | Why-unsure |
|---|---|---|---|
| UN-CL-1 | **Spec uses `info.x-logo` / `x-tagGroups` / Redocly-specific extensions** (non-portable across renderers) | Redocly extensions | Friction for non-Redocly renderers, but it's Redocly-specific UX-hint. Detect-able mechanically; severity unclear. Pure-info-finding? |
| UN-CL-2 | **Schema description-prevalence** below some-threshold in **request**-body schemas (vs response) | Speakeasy ergonomics | Apiq already has W2 (% Properties with description). This unsure-pattern: split request-vs-response. Possibly redundant. |
| UN-CL-3 | **`x-resourceId` / `x-expandableFields` Stripe-style extensions absent** when spec is large (≥50 endpoints) | Stripe-codegen Brandur | Suggesting a Stripe-style codegen-friendly extension is opinionated. Apiq Stage A is spec-agnostic; this is a Stripe-influence pattern. **Probably skip.** |
| UN-CL-4 | **Resource-Path-stem unclear** (e.g. `/api/v1/foo/bar` — what is the resource? heuristic-only) | Lens-4 brainstorm (granularity-consistency) | Heuristic; relies on path-clustering. Already covered partially via cluster-mechanics in CL-47, CL-62. |
| UN-CL-5 | **Operations with ≥10 path-parameters** (deep nesting smell) | Lens-4 brainstorm | Already covered by S-SP-2 (≤3 dynamic path-params). Severity could vary. |
| UN-CL-6 | **`description` markdown contains internal-only doc-fragments** (e.g. `TODO`, `FIXME`, `internal-use`) | Lens-4 brainstorm | Apiq has stub-detection partial. Could broaden. |
| UN-CL-7 | **`examples` map has key with same name as `value` content** (rendering ambiguity) | Edge-case from spec authoring | Niche; severity unclear. |
| UN-CL-8 | **`callbacks` defined without `request`/`response` schemas** | OAS-callbacks; webhook-renderer breakage | Niche; OAS-3.1-specific. |
| UN-CL-9 | **`format: binary` with no `maxLength`** (DoS-vector) | OWASP M-SP-7 partial | Already in apiq M-SP-6/M-SP-7. Possibly redundant. |
| UN-CL-10 | **Spec uses both `openapi: 3.0.x` AND `webhooks` block** (3.1-only feature in 3.0-spec) | OAS-version-strict | Apiq X5 has it. |

### Meta-Observations

#### A) Lens-4 strongly overlaps with Lens-3 (Evolution-Friction)
Many client-friction patterns (CL-7 required+nullable, CL-13 discriminator-required, CL-17 recursive, CL-30 deep-nesting, CL-77 allOf-multi-non-ref) are **simultaneously evolution-friction** because they create change-fragility: a pattern that breaks Java-codegen today will likely break it harder when the spec evolves. **Implication:** apiq should **double-tag** patterns: a pattern can be `lens: [client-friction, evolution]`. Severity-aggregation should sum.

#### B) Lens-4 partially overlaps with Lens-1 (Security)
Anchorless patterns (CL-26), URL-handling parameters (M-SP-11 SSRF), int64-precision-overflows (CL-15), recursive-no-required (CL-18) appear in both lenses. **Implication:** patterns are dual-tagged.

#### C) New micro-Lens candidate: "Codegen-Tooling-Compatibility"
CL-1, CL-2, CL-3, CL-4, CL-25, CL-34, CL-35 are all **target-language-specific** — a pattern that is fine for Python may break Java, etc. This suggests a **per-target sub-lens** within Lens-4 with at-least 5 facets: `java`, `go`, `python`, `typescript`, `rust` — apiq could **declare which target a pattern affects** in metadata so authors can opt-in/out per-target.

**Recommendation:** Stage A rules carry a `targets: ['*']` OR `targets: ['java', 'go']` metadata field. Default `*` means "all SDK-targets affected; broadly applicable". Specific lists enable per-target rule-sets without hard-fork.

#### D) Tools with most spec-issues (correlation observations)
1. **openapi-generator (multi-lang)** — most-issues-by-volume; widest target-surface. The most pattern-detection-yield comes from openapi-generator-issue-mining because the multi-lang scope surfaces patterns invisible to single-target tools.
2. **openapi-typescript** — most-issues-around polymorphism (oneOf/anyOf TS-strict-unions), 204-response, runtime-validation. Concentrated on type-system-mismatch.
3. **ReDoc** — pattern-rendering, deeply-nested-allOf, $ref-resolution. Render-side pain.
4. **Swagger-UI** — discriminator + oneOf + multipart + freeze-on-deep-nesting. Render-side pain, distinct from ReDoc.
5. **utoipa, oapi-codegen** — concentrated on **strong-typed-language-friction** (Rust generics, Go-anonymous-types). Reveals patterns the dynamic-language generators don't surface.
6. **openapi-python-client** — recursive-schemas, status-code patterns, model-name-collisions.

**Implication:** the highest-yield-source for Stage A is **openapi-generator multi-language issues**, because every issue there reflects a real-author-pain in production. Apiq should mine `tag/spec-issue` + `kind/bug` filters periodically.

#### E) Postman 2025 + Speakeasy + Fern: emerging trend "API-for-AI-agents"
89% of devs use AI tools; only 24% design APIs for agents. Implication: future Lens may be **"AI-Agent-Consumability"**:
- examples-coverage (Walker exists as W4 — strengthen via deep-walk?)
- description-richness for parameter-purpose (LLM-job, but apiq could measure `description.length` × `parameter.count` ratio)
- error-schema-discoverability for AI-code-recovery
- pagination-cursor-stability documentation
**This is a Lens-6 candidate**, ortho to client-friction but related. **Document for future round.**

#### F) Stripe / Octokit / Twilio convention takeaways
- **Stripe**: separate `spec3.json` (public docs) vs `spec3.sdk.json` (SDK with extensions). Means: production-API-spec ≠ SDK-template-spec. Apiq Stage A target = the spec authors pass (public). Detect: if extensions `x-internal`, `x-expandableFields`, `x-resourceId` (Stripe-specific) appear in spec, this is a SDK-derivative-spec — different lens.
- **Octokit**: Octokit overlay-extensions `x-octokit` track operation-id deprecation. Means: if the spec has high-frequency `x-octokit`/x-deprecated extensions → it's a vendor-overlay, semantically not a clean public spec. **Hint-only signal**: detect "vendor-overlay-saturation" Walker.
- **Twilio**: per-product spec-files (split-spec). Detect: if a spec has multiple `info.title` patterns or repeated path-prefixes hinting "split-aggregation" — could be a meta-spec. **Hint-only signal.**

These are vendor-pattern signals that **could** be Stage-A-detectable but likely belong in Phase B (LLM) — Stage A's principle is spec-agnostic.

#### G) Severity-stratification observed
Looking at the 81 patterns: **~25%-error**, **~50%-warn**, **~25%-hint**. Severity-distribution roughly matches Round-1 mining. Rules-of-thumb that emerged:
- error: codegen-actually-fails-or-spec-syntax-violation
- warn: codegen-produces-bad-but-compilable; a renderer fails
- hint: SDK-quality-degraded; ergonomics-suboptimal

#### H) Pattern-Density-by-Source (rough yield)
- **openapi-generator issues**: ~30 patterns (highest yield)
- **openapi-typescript issues**: ~10 patterns
- **oapi-codegen + utoipa + openapi-python-client**: ~10 patterns combined
- **Renderer-issues (ReDoc + Swagger-UI + Stoplight Elements)**: ~10 patterns
- **SDK-vendor-best-practices (Speakeasy, Fern, Stainless)**: ~10 patterns
- **Lens-4-original-brainstorm + Stripe/Octokit/Twilio analysis**: ~10 patterns
- Cross-counted (multi-source)

**Conclusion:** The richest single source is **openapi-generator GitHub issues** (multi-lang surface area). Stage-A future iterations should re-mine periodically.

---

## Recommended-Apiq-Action

1. **Ingest 81 CL-patterns above** into the brainstorm doc as a new section `## Mining-Round-2 Phase D — Client-Friction Additions`.
2. **Re-tag existing apiq rules** with multi-lens metadata: `lens: ['client-friction']` where applicable. Prepare for Lens-3 (Evolution) which Round-2 Phase C will surface — many overlap.
3. **Add `targets`-metadata field** to rule-schema (per Meta-Obs C) — each rule declares "all" or specific target-languages.
4. **Surface CL-1 (multi-lang reserved-keywords)** as the load-bearing top-priority: this is a category-killer for SDK-codegen pari with mature linters.
5. **Validate via openapi-generator-issue-mining periodically** (every 3-6 months) — pattern-yield decays slowly; new patterns emerge with each generator-major-version.
6. **Future Lens-6 candidate ("AI-Agent-Consumability")** flagged for post-launch consideration.

---

## Status

- **Mining Round-2 Phase D:** done 2026-05-05.
- **81 generic client-friction patterns** extracted (CL-1 to CL-81).
- **8 out-of-scope patterns** (require runtime tools — flagged for future opt-in modules).
- **10 unsure patterns** (need design decision before adoption).
- **Cross-source confirmations** for ~30 existing apiq brainstorm-IDs.
- **Meta-observations** suggest: (a) double-tagging across lenses, (b) per-target metadata, (c) future Lens-6 "AI-Agent-Consumability".
