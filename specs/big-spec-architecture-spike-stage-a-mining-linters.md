# Stage-A Mining: Konkurrenz-Linter-Coverage

> **Zweck:** Reality-Check für apiq Stage-A. Welche Patterns finden mature OpenAPI-Linter (Vacuum, Redocly CLI, IBM, Zally), die im aktuellen apiq-Brainstorm fehlen? Reputation-load-bearing: apiq darf nicht weniger finden als Vacuum/Redocly.
>
> **Methode:** Direkte Source-of-truth aus Repos via `gh api`-Raw — `daveshanley/vacuum/rulesets/rulesets.go` (alle 90+ built-in rule-IDs in Konstanten + `GetAllBuiltInRules` + `GetAllOWASPRules`), `IBM/openapi-validator/docs/ibm-cloud-rules.md` (78 IBM-rules + spectral:oas-Subset), `Redocly/redocly-cli/packages/core/src/rules/{common,oas3}` (Verzeichnis-Listing → 60+ rule-Dateien). Sekundär WebSearch für Zally + speccy + openapi-format.
>
> **Status:** Mining 2026-05-05. Noch nicht implementiert; entscheidet was ins Brainstorm aufgenommen / als bestätigt markiert / explizit nicht-skipped wird.

---

## Sources surveyed

| Tool | URL | License | Recency | Primary purpose |
|---|---|---|---|---|
| **Vacuum** | github.com/daveshanley/vacuum | MIT | actively maintained 2026 (Turbo-Mode v0.24) | Go-Linter, 100% Spectral-kompatibel, eigene Built-in-Rules + OWASP-Set |
| **Redocly CLI** | github.com/Redocly/redocly-cli | MIT | actively maintained 2026 | CLI für API-Workflows; eigenes Rules-set (kein Spectral-Fork) |
| **IBM openapi-validator** | github.com/IBM/openapi-validator (`@ibm-cloud/openapi-ruleset` npm) | Apache-2.0 | actively maintained 2026 | Spectral-Fork mit IBM-Cloud API-Handbook-Ruleset (78 Custom-Rules) |
| **Zalando Zally** | github.com/zalando/zally | MIT | maintained (less active, last release 2024) | Kotlin-Linter, eigene Rule-Engine, RESTful-Guidelines-Enforcement |
| **Stoplight Spectral** | github.com/stoplightio/spectral | Apache-2.0 | actively maintained | Reference-Engine; `spectral:oas` ist Industry-Default-Baseline |
| **PayPal openapilint** | github.com/paypal/openapilint | Apache-2.0 | maintained, OAS-2-only (no v3 plans) | Node-Linter (legacy reference) |
| **wework speccy** | github.com/wework/speccy | MIT | **deprecated/archived** (last release 2019) | Historic — ruleset weitgehend von Spectral absorbed |
| **swagger-cli** | npm:swagger-cli | MIT | maintained (low-velocity) | Schema-Validation only — keine style-rules |
| **openapi-format (thim81)** | github.com/thim81/openapi-format | MIT | actively maintained | Sortier-/Filter-Tool, casing-convention-enforcer; **kein Linter im klassischen Sinn**, aber casing-rules übertragbar |

---

## Tool-by-Tool Coverage Snapshot

### Vacuum (`vacuum:oas` + `vacuum:owasp`)

Komplette Rule-IDs aus `rulesets/rulesets.go` const-Block + `GetAllBuiltInRules`/`GetAllOWASPRules`. Vacuum extends `spectral:oas` und addiert die folgenden Rules **die in Spectral-default NICHT enthalten sind**:

**Path/Operation-Hygiene (vacuum-eigene):**
- `no-http-verbs-in-path` — verbs (`get`, `post`, …) als path-Segmente flaggen (RPC-Smell)
- `paths-kebab-case` — path-Segmente kebab-case-konsistent
- `paths-specificity-order` — spezifischere Pfade müssen vor weniger spezifischen kommen (Routing-Disambiguation)
- `no-ambiguous-paths` — `/foo/{a}` vs `/foo/{b}` ist runtime-ambiguous
- `duplicate-paths` — gleicher Path mehrmals deklariert
- `path-item-refs` — `$ref` direkt auf path-item-Ebene (statt in operation) als smell

**Schema-/Combinator-Hygiene:**
- `no-unnecessary-combinator` — `oneOf`/`allOf`/`anyOf` mit nur 1 Element
- `allof-conflicts` — `allOf`-Subschemas mit konfliktbehafteten Constraints (z.B. `type: string` + `type: integer`)
- `oas-missing-type` — Schema ohne `type`-Feld (führt zu codegen-undefined-behavior)
- `oas-schema-check` — strict JSON-Schema-Compilation gegen die Schemas
- `required-fields-defined` — `required`-Liste verweist auf nicht-existierende properties (= apiq A3 ✓)

**Description/Markdown-Sicherheit:**
- `no-eval-in-markdown` — `eval(` in description-text (XSS-relevant in browser-renderern)
- `no-script-tags-in-markdown` — `<script>` in description (XSS) — **bereits in spectral:oas, aber explizit gemacht**
- `description-duplication` — gleiche description-Strings in vielen Stellen (copy-paste-smell)
- `component-description` — components.* (jenseits schemas) brauchen description

**Enum-Hygiene:**
- `typed-enum` — enum-Werte konform zum Schema-Type (z.B. type:integer mit string-enum-werten)
- `nullable-enum-contains-null` — wenn `nullable: true`, dann muss enum `null` enthalten

**Request-Body / Method-Korrelation:**
- `no-request-body` — GET/HEAD/DELETE/OPTIONS dürfen keinen requestBody haben (= apiq B1 ✓)
- `post-response-success` — POST braucht 2xx-Response (Strenger als generic operation-success-response)
- `operation-4xx-response` — jede operation soll mindestens eine 4xx-response haben

**Naming-Convention (vacuum):**
- `camel-case-properties` — Property-Names sind camelCase
- `operation-operationId-valid-in-url` — operationId enthält keine URL-unsafe-chars
- `migrate-zally-ignore` — flagt zalando-`x-zally-ignore`-Extensions (cross-tool-Migration)

**OWASP-Set (`vacuum:owasp`/`spectral:owasp` — komplette neue Klasse):**
- `owasp-no-numeric-ids` — IDs in Path-Params mit `format: int*` und ohne UUID/string-Pattern → enumeration-Risk
- `owasp-no-http-basic` — Basic-Auth ist insecure
- `owasp-no-api-keys-in-url` — apiKey-securityScheme mit `in: query` ist leak-risk
- `owasp-no-credentials-in-url` — `password`/`secret`/`api_key` als path-/query-param-name
- `owasp-auth-insecure-schemes` — `negotiate`, `oauth` (ohne version) sind nicht-sicher
- `owasp-jwt-best-practices` — JWT-bearerFormat ohne explizite-best-practice-Annotation
- `owasp-protection-global-unsafe` — global security-block fehlt für unsafe-methods
- `owasp-protection-global-unsafe-strict` — selber, aber strikter (kein method-level-override)
- `owasp-protection-global-safe` — security auch für safe-methods (GET/HEAD)
- `owasp-define-error-validation` — operation mit body braucht 400 oder 422 (= apiq C3 ✓)
- `owasp-define-error-responses-401` — operation mit security braucht 401 (= apiq C5 ✓)
- `owasp-define-error-responses-500` — operation braucht 500 oder default
- `owasp-define-error-responses-429` — wenn rate-limit advertised, dann 429-response
- `owasp-rate-limit` — alle ops sollen rate-limit-headers in Response haben (X-RateLimit-* oder RateLimit RFC)
- `owasp-rate-limit-retry-after` — 429-response braucht Retry-After-header (= apiq C9 ✓)
- `owasp-array-limit` — array-schemas brauchen `maxItems`
- `owasp-string-limit` — string-schemas brauchen `maxLength` (= apiq M9-Walker ✓)
- `owasp-string-restricted` — string-schemas brauchen entweder `pattern`, `format`, oder `enum`
- `owasp-integer-limit` — integer-schemas brauchen min+max (= apiq M10-Walker ✓)
- `owasp-integer-format` — integer-schemas brauchen `format` (int32/int64) — sonst language-portability-Issue
- `owasp-no-additionalProperties` — `additionalProperties: true` (oder unspecified) → DoS-Risk
- `owasp-constrained-additionalProperties` — wenn `additionalProperties: {schema}`, dann `maxProperties` setzen
- `owasp-security-hosts-https-oas3` — Server-URLs müssen `https://` sein

**Unique selling points / detection mechanics that go beyond standard Spectral:**
1. **OWASP-rule-class** — komplette security-orientierte Rule-Set (24 Rules), spectral:oas hat nichts davon.
2. **Performance-Tier Turbo-Mode** — Vacuum hat einen `TurboExcludedRules`-Set (rule-IDs die für ihre Run-Time too expensive sind), das ist UI-Pattern-relevant für apiq (große Specs schnell ranken).
3. **`paths-specificity-order`** — kein anderer Tool prüft das.
4. **`description-duplication`** — Hash-basierte Duplikat-Detection auf Description-Ebene; konzeptueller-Cousin zu apiq M7 (schema-duplicates).
5. **`migrate-zally-ignore`** — meta-Rule für Tool-Migration; zeigt: vacuum sieht sich als Spectral+Zally-Drop-In.

---

### Redocly CLI (`recommended` ruleset)

Source: `packages/core/src/rules/common/*.ts` + `packages/core/src/rules/oas3/*.ts` (Verzeichnis-Listing). Redocly extends NICHT spectral:oas — eigenes Rules-set, viele aber namens-äquivalent.

**Common (oas2+oas3):**
- `info-contact`, `info-license`, `info-license-strict`
- `no-ambiguous-paths`, `no-identical-paths`, `no-duplicated-tag-names`
- `no-enum-type-mismatch`, `no-schema-type-mismatch`
- `no-http-verbs-in-paths`
- `no-invalid-parameter-examples`, `no-invalid-schema-examples`
- `no-mixed-number-range-constraints` — `minimum` + `exclusiveMinimum` gleichzeitig (semantischer Konflikt, OAS 3.1)
- `no-path-trailing-slash`
- `no-required-schema-properties-undefined` (= apiq A3 ✓ und Vacuum required-fields-defined ✓ — Tri-Linter-Konsens)
- `no-unresolved-refs` (= apiq A1 ✓)
- `operation-2xx-response`, `operation-4xx-response`
- `operation-description`, `operation-summary`
- `operation-operationId`, `operation-operationId-unique`, `operation-operationId-url-safe`
- `operation-parameters-unique`
- `operation-singular-tag` — operation hat höchstens 1 tag (Doc-Portal-Konsistenz)
- `operation-tag-defined`
- `parameter-description`
- `path-declaration-must-exist`, `path-http-verbs-order` (sortier-konvention für GET/POST/etc), `path-not-include-query`, `path-params-defined`
- `path-segment-plural` — Resource-Path-Segments sollten plural sein (= apiq G5 ✓)
- `paths-kebab-case`
- `required-string-property-missing-min-length` — required-string ohne minLength (subtler subset von apiq M9)
- `response-contains-header` — config-driven: bestimmte Status-Codes brauchen bestimmte Headers (z.B. 304 → ETag) (= apiq C10 ✓ erweiterbar)
- `scalar-property-missing-example` — eigene Variante von "examples-coverage"
- `security-defined`
- `spec-strict-refs` — $ref-targets müssen exakt korrekt structuriert sein
- `tag-description`, `tags-alphabetical`
- `struct` — strikte JSON-Schema-Compliance der gesamten Spec

**OAS3-spezifisch:**
- `array-parameter-serialization` — array-params brauchen explizit `style`/`explode` (= apiq T1 ✓)
- `boolean-parameter-prefixes` — boolean-params sollten `is`/`has`-Prefix haben (heuristik)
- `component-name-unique` — case-insensitive Komponenten-Naming-Collision (= apiq O2 ✓)
- `no-empty-servers` — `servers: []` ist nutzlos
- `no-example-value-and-externalValue` — example mit `value` + `externalValue` simultaneously
- `no-invalid-media-type-examples`
- `no-server-example.com` — `example.com` als prod-server-url flaggen
- `no-server-trailing-slash`
- `no-server-variables-empty-enum`
- `no-undefined-server-variable` — `{var}` in URL ohne Variables-Definition
- `no-unused-components` (= spectral:oas3-unused-component, aber expliziter)
- `nullable-type-sibling` — `nullable: true` ohne `type` (OAS-3.0 invalid)
- `operation-4xx-problem-details-rfc7807` — 4xx-Response-Schemas sollten RFC-7807-conformant sein (= apiq K2 ✓)
- `request-mime-type`, `response-mime-type` — config-driven Allowlist erlaubter mediatypes
- `response-contains-property` — bestimmte response-Status-Codes müssen bestimmte properties haben
- `spec-components-invalid-map-name` — components.*-keys müssen valid identifier-names sein
- `spec-discriminator-defaultMapping` — discriminator hat default-mapping wo nötig
- `spec-example-values` — example-values gegen ihr Schema validieren (deeper als spectral)
- `spec-no-invalid-encoding-combinations` — multipart/* mit incompatible encoding-fields
- `spec-no-invalid-tag-parents` — tag-Hierarchie via x-displayName parent-references valid
- `spec-querystring-parameters` — query-string-conventions

**Unique selling points / detection mechanics that go beyond standard Spectral:**
1. **`no-mixed-number-range-constraints`** — semantischer-Konflikt-Check (OAS-3.0/3.1-Drift). Niemand anders hat das.
2. **`response-contains-header`** + **`response-contains-property`** — config-driven Constraint-Engine, sehr nahe an apiq's Domain-Layer-Konzept (aber DETERMINISTISCH).
3. **`operation-4xx-problem-details-rfc7807`** — RFC-7807-Compliance erste-class.
4. **`boolean-parameter-prefixes`** — naming-heuristik für boolean-params.
5. **`spec-discriminator-defaultMapping`** — discriminator-mapping completeness deeper als spectral.
6. **`struct`** — strict-spec-compliance als single fallback-rule.

---

### IBM openapi-validator (`@ibm-cloud/openapi-ruleset`)

Source: `docs/ibm-cloud-rules.md` (TOC + Overview-Tabelle). IBM extends `spectral:oas` und addiert 78 IBM-Rules. Diese Liste filtert die ones, die **NICHT IBM-cloud-spezifisch** sind und auf jede Spec anwendbar:

**Strukturell-generic (high apiq-take-Wert):**
- `ibm-anchored-patterns` — `pattern`-Regex ohne `^…$`-Anchors → kann partial-match (= apiq A6-Erweiterung ✓)
- `ibm-avoid-property-name-collision` — case-insensitive duplicate property-names (= apiq O2-Variante ✓)
- `ibm-avoid-repeating-path-parameters` — gleicher path-param auf mehreren operations statt path-Level
- `ibm-define-required-properties` — `required` referenziert Property die nicht in `properties` exists (= apiq A3 / Tri-Linter-Konsens ✓)
- `ibm-discriminator-property` — discriminator.propertyName muss schema-Member sein (= apiq A4 ✓)
- `ibm-no-circular-refs` — Cycle-Detection als reportable Finding (= apiq A2 ✓)
- `ibm-no-consecutive-path-parameter-segments` — `/v1/foos/{foo_id}/{bar_id}` ist invalid (zwei params back-to-back)
- `ibm-no-superfluous-allof` — `allOf` mit 1 Element (= apiq A12 / vacuum no-unnecessary-combinator ✓)
- `ibm-no-unsupported-keywords` — OAS-3.1-only-keywords (z.B. `unevaluatedProperties`) in OAS-3.0-Specs
- `ibm-pattern-properties` — Restrictions auf `patternProperties`-Use (3.1-only)
- `ibm-ref-pattern` — `$ref`-Werte müssen wohlgeformte JSON-Pointer sein
- `ibm-schema-keywords` — Allow-list erlaubter JSON-Schema-Keywords (defensive)
- `ibm-schema-type-format` — `type`+`format`-Combinations valide (z.B. `type: string, format: int32` ist nonsense) (= apiq A7-Erweiterung ✓)
- `ibm-unevaluated-properties` — `unevaluatedProperties` enabled in schema (3.1-only smell)
- `ibm-valid-path-segments` — path-param-references valid INNERHALB der Segments (z.B. `/foo{id}` statt `/foo/{id}`)

**Naming-Convention-Rules (config-driven; Modell-Pattern für apiq):**
- `ibm-enum-casing-convention` (configurable: snake/kebab/camel/pascal)
- `ibm-operationid-casing-convention`
- `ibm-operationid-naming-convention` — verb-prefix-Heuristik (= apiq B8 ✓)
- `ibm-parameter-casing-convention`
- `ibm-path-segment-casing-convention`
- `ibm-property-casing-convention`
- `ibm-schema-casing-convention`
- `ibm-schema-naming-convention`
- `ibm-property-consistent-name-and-type` — `user_id` muss überall denselben Type haben (= apiq Cross-Reference-Konsistenz §9 ✓ — DETERMINISTISCH lösbar)
- `ibm-no-space-in-example-name` — examples-map keys mit spaces
- `ibm-summary-sentence-style` — operation.summary endet nicht mit Period

**Method-/Body-Semantik:**
- `ibm-no-operation-requestbody` — DELETE/GET/HEAD/OPTIONS keine Body (= apiq B1+B7 / vacuum no-request-body ✓)
- `ibm-no-body-for-delete` (deprecated, replaced by above)
- `ibm-requestbody-is-object` — non-form requestBody schema muss `type: object` sein
- `ibm-requestbody-name` — `x-codegen-request-body-name` extension (off by default — codegen-specific)
- `ibm-patch-request-content-type` — PATCH muss `application/json-patch+json` ODER `application/merge-patch+json` sein (RFC-konform)
- `ibm-no-required-properties-in-optional-body` — wenn requestBody optional, dürfen seine properties nicht required sein
- `ibm-no-optional-properties-in-required-body` (deprecated)
- `ibm-dont-require-merge-patch-properties` — JSON-merge-patch req-body kein `required`-Feld
- `ibm-content-contains-schema` — content-entries brauchen schema (= apiq L4-Variante ✓)
- `ibm-content-type-is-specific` — `*/*` als content-type vermeiden (= apiq Mediatype-Hygiene ✓)
- `ibm-error-content-type-is-json` — error-responses sollten application/json supporten
- `ibm-error-response-schemas` — error-schemas konventionell strukturiert (= apiq K1 ✓)
- `ibm-no-array-responses` — top-level array-Response (codegen-Issue auf manchen Sprachen)
- `ibm-no-array-of-arrays` — `array<array<X>>` smell
- `ibm-no-ref-in-example` — `$ref` innerhalb `example`-Werten (verboten)
- `ibm-no-ref-in-example` — siehe oben
- `ibm-redirect-response-body` — 3xx-Responses ohne body etc. (config-driven status-code-Logik)
- `ibm-resource-response-consistency` — POST/PUT/PATCH-response-Schema = GET-response-Schema für gleiche Resource (= apiq D1+§5 ✓)
- `ibm-required-array-properties-in-response` — array-Properties in Response sollten required sein (Empty-array vs missing-property-Disambiguation)
- `ibm-required-enum-properties-in-response` — enum-Properties in Response sollten required sein
- `ibm-success-response-example` — 2xx-Response braucht example (= apiq N4 ✓)
- `ibm-valid-schema-example` — examples gegen schema validieren (deeper als spectral:oas3-valid-schema-example)

**Header/Parameter-Hygiene:**
- `ibm-no-accept-header` — Accept als header-param ist redundant (OAS3 derives from response.content keys)
- `ibm-no-authorization-header` — Authorization als header-param ist redundant (security-scheme-Job)
- `ibm-no-content-type-header` (= apiq apiq-no-content-type-header-parameter ✓ — Tri-Linter-Konsens)
- `ibm-no-default-for-required-parameter` (= apiq T2 ✓)
- `ibm-no-if-modified-since-header` / `ibm-no-if-unmodified-since-header` — IBM-style: prefer ETag (debatable, opinion)
- `ibm-precondition-headers` — wenn 412-Response, dann mindestens einer von If-Match/If-None-Match/If-Modified-Since/If-Unmodified-Since muss param sein
- `ibm-etag-header` — wenn If-Match/If-None-Match-param, dann muss GET ETag-response-header haben
- `ibm-parameter-description`
- `ibm-parameter-order` — required params vor optional params (= IBM-style)
- `ibm-parameter-schema-or-content` — param hat schema XOR content
- `ibm-unique-parameter-request-property-names` — operation-params namens-unique gegenüber requestBody-properties
- `ibm-array-attributes` — array-schemas brauchen `items` + `minItems` + `maxItems` (= owasp-array-limit ✓)
- `ibm-integer-attributes` — integer-schemas brauchen min+max (= owasp-integer-limit ✓)
- `ibm-string-attributes` — string-schemas brauchen pattern+minLength+maxLength (= owasp-string-* ✓)
- `ibm-property-attributes` — multiple checks auf schema-attributes
- `ibm-use-date-based-format` — string-schemas die date-/date-time-aussehen aber kein `format` (= apiq I1+I2 ✓)
- `ibm-property-description` (= apiq M2 ✓)
- `ibm-schema-description` (= apiq M1 ✓)
- `ibm-no-nullable-properties` — strict: nullable nur in merge-patch (IBM-opinion)
- `ibm-binary-schemas` — `format: binary` nur in bestimmten Contexten erlaubt
- `ibm-well-defined-dictionaries` — `additionalProperties: {…}` muss konsistent typed sein
- `ibm-avoid-inline-schemas` — inline-object-schemas in requestBody/response/properties → reuse-via-$ref-prefer (= apiq M6 ✓)
- `ibm-avoid-multiple-types` — OAS-3.1 `type: [x, y]` mit > 1 non-null-type → ambiguity (= apiq A9/A10 ✓)
- `ibm-no-duplicate-description-with-ref-sibling` — `allOf: [$ref, {description}]` wo description = referenced-schema-description (redundant)
- `ibm-securityscheme-attributes`, `ibm-securityschemes` — security-scheme-Hygiene (= apiq F5+F7 ✓)
- `ibm-server-variable-default-value` (= apiq P2 ✓)
- `ibm-pagination-style` — paginated list-ops sollen Handbook-pagination-Pattern folgen (config-driven)
- `ibm-prefer-token-pagination` — token-based bevorzugt vor offset/limit (IBM-opinion)
- `ibm-collection-array-property` — list-op-response hat array-property dessen Name = letztes path-segment
- `ibm-major-version-in-path` — alle paths starten mit `/v{N}/` (IBM-Cloud-Convention)
- `ibm-no-crn-path-parameters` — IBM-Cloud-internal (CRN-Format) — **SKIP**
- `ibm-sdk-operations` — IBM-internal `x-sdk-operations`-extension — **SKIP**
- `ibm-accept-and-return-models` — req/resp-bodies müssen named-models sein (kein anonymes additionalProperties)
- `ibm-api-symmetry` — Summary/Prototype/Patch-schemas sind graph-fragments des canonical-schema (IBM-API-Handbook-spezifisch)
- `ibm-operation-summary` (= spectral operation-summary)
- `ibm-operation-summary-length` — max 80 chars (= apiq R1-Variante ✓)
- `ibm-operation-responses`, `ibm-response-status-codes`
- `ibm-openapi-tags-used` — alle deklarierten tags sind in mindestens einer operation referenced (orphan-tag-detection)
- `ibm-schema-type` — schemas brauchen non-empty `type`-Feld (off-by-default; cousin von vacuum oas-missing-type)

**Unique selling points / detection mechanics that go beyond standard Spectral:**
1. **Configurable casing-conventions** — 7 separate Rules für jede Identifier-Klasse, alle config-driven (snake/kebab/camel/pascal). Modell für apiq's Naming-Pattern-Klassifikator §8.
2. **`ibm-property-consistent-name-and-type`** — DETERMINISTISCH lösbar (cross-reference-Konsistenz §9), und sie haben's gemacht. Wir sollten auch.
3. **`ibm-resource-response-consistency`** — POST/PUT-response = GET-response für gleiche Resource. Cross-Operation-Vergleich, deterministisch.
4. **`ibm-anchored-patterns`** — pattern ohne `^…$` flag — sehr clean.
5. **`ibm-precondition-headers`** + **`ibm-etag-header`** — paired-rules (412 ↔ If-Match-headers ↔ ETag-response).
6. **`ibm-collection-array-property`** — list-op-response-array-name = path-segment-name, deterministischer Naming-Mismatch-Check.
7. **`ibm-no-consecutive-path-parameter-segments`** — `/foos/{x}/{y}` ohne separator-Segment ist runtime-ambiguous. Niemand anderes hat das.
8. **`ibm-required-array-properties-in-response`** + **`ibm-required-enum-properties-in-response`** — Empty-array vs missing-property Disambiguation.

---

### Zalando Zally (`ZallyRuleSet`)

Source: `server/rules.md`. Zally hat eine kleine "non-Zalando" Rule-Klasse + die große ZalandoRuleSet (in restful-api-guidelines repo). Generisch übertragbar:

**ZallyRuleSet (non-Zalando):**
- M008: Host should not contain protocol — server.url enthält `https://` separat von host-string
- M009: At most one body parameter — Swagger-2-spezifisch (OAS-3 hat single requestBody by design)
- M010: Case-of-various-terms — Configurable (schema-properties / query-params / path-params / tag-names) (= apiq G1+G6+G7 ✓)
- M011: Operations are tagged — alle ops haben tags + alle tags sind defined + alle defined-tags sind used + alle defined-tags haben description (= multi-rule-Bundle)
- S005: Unused definitions (= spectral:oas3-unused-component / vacuum oas3-unused-component)
- S006: Numeric properties have bounds (= apiq M10-Walker / owasp-integer-limit ✓)
- S007: String properties have maxLength (= apiq M9-Walker / owasp-string-limit ✓)
- H001: Base path can be extracted — wenn alle paths einen common-prefix haben → in basePath/server.url verschieben
- H002: Avoid `x-zally-ignore` — zalando-self-Reference (skip generic)

**Unique:**
1. **H001 — common-path-prefix-Extraction-Suggestion** — deterministisch, niemand sonst hat's. Apiq-relevant für rebrandable-spec-cleanup.

ZalandoRuleSet (Hauptmasse) — folgt strikten Zalando-RESTful-Guidelines, viele sind opinion-driven (z.B. "use HAL-style hypermedia"). Generisch nicht übertragbar.

---

### Stoplight Spectral default OAS3 (`spectral:oas`) — Baseline

apiq extends `spectral:oas` (siehe ruleset.yaml line 39-40), so we already have:
- `info-contact`, `info-license`, `info-description` (last is off-by-default in IBM, on in spectral)
- `oas3-server-trailing-slash`, `oas3-api-servers`
- `oas3-unused-component`, `oas3-valid-media-example`, `oas3-valid-schema-example`
- `oas3-schema` (full JSON-Schema-validation der Spec selbst)
- `oas3-operation-security-defined`
- `operation-{description,summary,operationId,operationId-unique,parameters,tags,tag-defined,singular-tag,4xx-response,success-response}`
- `path-params`, `path-declarations-must-exist`, `path-keys-no-trailing-slash`, `path-not-include-query`
- `tag-description`, `openapi-tags`, `openapi-tags-alphabetical`
- `oas3-no-$ref-siblings` (= apiq A1 / no-$ref-siblings ✓)
- `typed-enum`, `duplicated-entry-in-enum`
- `no-script-tags-in-markdown`, `no-eval-in-markdown` (markdown-XSS)
- `oas3-tag-no-empty-description`

Auf der spectral:oas-Baseline ergeben Vacuum / IBM / Redocly ihre Erweiterungen.

---

### Sekundäre Tools

**openapi-format (thim81):** Kein Linter im klassischen Sinn — Sortier-/Filter-/Casing-Tool. Liefert aber die `casingFile`-Konfiguration als Referenz für apiq's Naming-Pattern-Klassifikator (§8). Casing-Targets: `operationId`, `properties`, `parameters`, `enums`, `schemas`. **Kein neuer Pattern**, aber bestätigt: 7 Identifier-Klassen sind die richtige Granularität.

**PayPal openapilint:** OAS-2-only, kein v3-Plan. Historisch interessant aber für apiq irrelevant.

**speccy (deprecated 2019):** `default` und `strict` Rulesets, in Spectral absorbed. Skip.

**swagger-cli:** Schema-Validation (oas3-schema-Aequivalent), keine style-rules. Skip.

---

## Patterns extracted

### Generic (apply to any OpenAPI spec — take into apiq)

35 Patterns aus mining die im aktuellen Brainstorm fehlen oder unterspezifiziert sind:

| ID | Pattern | Source-Tool | Severity-Suggestion | Notes |
|---|---|---|---|---|
| MIN-1 | `$ref`-targets müssen wohlgeformte JSON-Pointer sein (`#/…`-format) | IBM `ibm-ref-pattern`, Redocly `spec-strict-refs` | error | Strenger als A1; A1 prüft "exists", dies prüft "valid format" |
| MIN-2 | `pattern`-Regex ohne `^…$`-Anchors | IBM `ibm-anchored-patterns` | warn | Cousin von A6 (regex valid); zusätzlicher Check |
| MIN-3 | Konflikt: `minimum` + `exclusiveMinimum` (oder max-Variante) gleichzeitig | Redocly `no-mixed-number-range-constraints` | error | OAS-3.1-spezifischer Konflikt |
| MIN-4 | `nullable: true` ohne `type` (OAS 3.0 invalid) | Redocly `nullable-type-sibling` | error | Sub-case von A9/A10 |
| MIN-5 | `paths-specificity-order` — spezifischere Pfade vor weniger spezifischen | Vacuum | warn | Routing-Disambiguation |
| MIN-6 | Konsekutive path-parameter-Segmente (`/foos/{x}/{y}` ohne dazwischen) | IBM `ibm-no-consecutive-path-parameter-segments` | error | Ambiguity-Risk |
| MIN-7 | Ambiguous paths cross-template (`/foo/{a}` vs `/foo/{b}`) | Vacuum, Redocly | error | Runtime-Routing-conflict |
| MIN-8 | Duplicate path-keys (string-equal multiple-deklariert) | Vacuum `duplicate-paths` | error | OAS-error-Variante |
| MIN-9 | `path-item-refs` — `$ref` direkt auf path-item-Ebene | Vacuum | warn | Smell |
| MIN-10 | `allOf`-Subschemas mit konfliktbehafteten Constraints (`type: string` + `type: integer`) | Vacuum `allof-conflicts` | error | Deeper als A12 |
| MIN-11 | Schema ohne `type`-Feld | Vacuum `oas-missing-type`, IBM `ibm-schema-type` (off-default) | warn | Codegen-undefined-behavior |
| MIN-12 | `discriminator.propertyName` in Schema definieren (= apiq A4 erweitert: muss Member sein) | IBM `ibm-discriminator-property` | error | Strenger als A4 |
| MIN-13 | array-schemas brauchen `items` | IBM `ibm-array-attributes` | error | Spec-Conformance |
| MIN-14 | array-schemas brauchen `maxItems` | IBM `ibm-array-attributes`, OWASP `array-limit` | warn | DoS-Risk |
| MIN-15 | integer-schemas brauchen `format: int32` ODER `int64` | OWASP `integer-format` | hint | Language-portability |
| MIN-16 | `additionalProperties: true` (oder unspecified) als DoS-Risk | OWASP `no-additionalProperties` | warn | Statistical-Walker existiert (M8); als Per-Schema-Rule mit severity-warn |
| MIN-17 | `additionalProperties: {schema}` ohne `maxProperties` | OWASP `constrained-additionalProperties` | hint | Companion zu MIN-16 |
| MIN-18 | string-schemas brauchen `pattern` ODER `format` ODER `enum` | OWASP `string-restricted` | hint | Open-string-fields = injection-Risk |
| MIN-19 | `type`+`format`-Combinations valide (z.B. `type: string, format: int32` = nonsense) | IBM `ibm-schema-type-format` | error | Erweitert A7 |
| MIN-20 | enum-Werte konform zum Schema-Type | Vacuum `typed-enum` | error | Bereits in spectral:oas, verifizieren |
| MIN-21 | `nullable: true` + enum muss `null` enthalten | Vacuum `nullable-enum-contains-null` | warn | Cousin von A9 |
| MIN-22 | `oneOf`/`allOf`/`anyOf` mit nur 1 Element (= apiq A12, A13) | Vacuum `no-unnecessary-combinator`, IBM `ibm-no-superfluous-allof` | hint | Tri-Linter-Konsens; A12/A13 bestätigt |
| MIN-23 | `Accept`-Header als param ist redundant (OAS3 derives) | IBM `ibm-no-accept-header` | warn | Companion zu apiq apiq-no-content-type-header-parameter |
| MIN-24 | `Authorization`-Header als param ist redundant (security-scheme-Job) | IBM `ibm-no-authorization-header` | warn | Companion zu T4 |
| MIN-25 | param hat schema XOR content (nicht beide) | IBM `ibm-parameter-schema-or-content` | error | OAS-Conformance |
| MIN-26 | operation-params namens-unique gegenüber requestBody-properties | IBM `ibm-unique-parameter-request-property-names` | warn | SDK-collision-Risk |
| MIN-27 | required-params vor optional-params (Reihenfolge) | IBM `ibm-parameter-order` | hint | SDK-ergonomics |
| MIN-28 | `ETag` response-header bei If-Match/If-None-Match-param vorhanden | IBM `ibm-etag-header` | warn | Cache-Validation-Pair (= apiq C10 erweitert) |
| MIN-29 | 412-Response → mind. 1 von If-Match/If-None-Match/If-Modified-Since/If-Unmodified-Since als param | IBM `ibm-precondition-headers` | warn | Status-code/header-pair |
| MIN-30 | PATCH-content-type muss `application/json-patch+json` ODER `application/merge-patch+json` sein | IBM `ibm-patch-request-content-type` | warn | RFC-Compliance |
| MIN-31 | Top-level `array`-Response (codegen-Issue) | IBM `ibm-no-array-responses` | hint | Wrap-in-object-Recommendation |
| MIN-32 | array-of-array (`array<array<X>>`) | IBM `ibm-no-array-of-arrays` | hint | Smell |
| MIN-33 | RFC-7807 problem-details für 4xx-responses | Redocly `operation-4xx-problem-details-rfc7807` | hint | Erweitert K2 zu eigenständiger Rule |
| MIN-34 | Property-Type-Konsistenz cross-Schema (`user_id` ist überall integer ODER überall string) | IBM `ibm-property-consistent-name-and-type` | warn | DETERMINISTISCH — bestätigt §9 ist machbar |
| MIN-35 | Resource-Response-Konsistenz (POST/PUT-response = GET-response für gleiche Resource) | IBM `ibm-resource-response-consistency` | hint | DETERMINISTISCH cross-op-Vergleich |
| MIN-36 | OWASP: Numeric-IDs in path-params (Enumeration-Risk) | OWASP `no-numeric-ids` | hint | Security-class — neue Klasse für apiq |
| MIN-37 | OWASP: api-key in URL/query (leak-Risk) | OWASP `no-api-keys-in-url`, `no-credentials-in-url` | error | Security-class |
| MIN-38 | OWASP: Basic-Auth (insecure) | OWASP `no-http-basic` | warn | Security-class |
| MIN-39 | OWASP: Server-URLs müssen https | OWASP `security-hosts-https-oas3` | warn | Security-class |
| MIN-40 | OWASP: Operation mit body braucht 400 ODER 422 | OWASP `define-error-validation` | warn | = apiq C3 ✓ explicit |
| MIN-41 | description-duplication cross-spec (Hash-basiert) | Vacuum `description-duplication` | hint | Cousin von M7-Schema-Hash |
| MIN-42 | `no-script-tags-in-markdown` und `no-eval-in-markdown` (XSS in description) | Spectral, Vacuum | warn | bereits in spectral:oas, verifizieren |
| MIN-43 | Common-path-prefix Extraktion-Suggestion (alle paths starten mit `/api/v1/`) | Zally H001 | hint | Refactor-Empfehlung |
| MIN-44 | `*/*` als content-type vermeiden | IBM `ibm-content-type-is-specific` | warn | Mediatype-Hygiene |
| MIN-45 | error-responses sollten `application/json` supporten | IBM `ibm-error-content-type-is-json` | hint | Mediatype-Konvention |
| MIN-46 | `$ref` innerhalb `example`-Werten (verboten) | IBM `ibm-no-ref-in-example` | info | OAS-spec-violation |
| MIN-47 | `examples`-map keys mit spaces | IBM `ibm-no-space-in-example-name` | warn | Component-naming-hygiene |
| MIN-48 | example mit `value` UND `externalValue` simultaneously | Redocly `no-example-value-and-externalValue` | error | Mutually-exclusive |
| MIN-49 | components.*-keys müssen valid identifier-names sein | Redocly `spec-components-invalid-map-name` | warn | Codegen-Risk |
| MIN-50 | Components case-insensitive collision (`User` vs `user`) | Redocly `component-name-unique` | warn | (= apiq O2 ✓ — Tri-Linter-Konsens) |

### Vendor-/Org-Specific (skip)

| ID | Pattern | Source | Why-skip |
|---|---|---|---|
| SKIP-1 | `ibm-major-version-in-path` (`/v{N}/` required) | IBM | IBM-Cloud-Convention; nicht universal — manche APIs versionen via Header |
| SKIP-2 | `ibm-no-crn-path-parameters` | IBM | IBM-Cloud-CRN-Format-spezifisch |
| SKIP-3 | `ibm-sdk-operations` | IBM | IBM-internal `x-sdk-operations`-extension |
| SKIP-4 | `ibm-api-symmetry` (Summary/Prototype/Patch graph-fragments) | IBM | IBM-API-Handbook-spezifisches Resource-Modeling |
| SKIP-5 | `ibm-no-nullable-properties` (nullable nur in merge-patch) | IBM | IBM-opinion; community ist gespalten |
| SKIP-6 | `ibm-no-if-modified-since-header` / `ibm-no-if-unmodified-since-header` | IBM | IBM-prefer-ETag-opinion; nicht universal |
| SKIP-7 | `ibm-prefer-token-pagination` | IBM | API-Family-Preference; offset/limit ist legitim |
| SKIP-8 | `ibm-pagination-style` (Handbook-konforme Pagination) | IBM | Pagination-Konvention ist project-spezifisch |
| SKIP-9 | `ibm-collection-array-property` (response-array-name = path-segment) | IBM | Naming-Convention; dialog-spezifisch |
| SKIP-10 | `ibm-accept-and-return-models` (no-anonymous-additionalProperties for bodies) | IBM | Model-naming-Discipline; opinion |
| SKIP-11 | `ibm-binary-schemas` (binary nur in bestimmten Contexten) | IBM | IBM-Codegen-spezifisch |
| SKIP-12 | `migrate-zally-ignore` (vacuum) | Vacuum | Tool-Migration-Helper |
| SKIP-13 | `boolean-parameter-prefixes` (is-/has-prefix) | Redocly | Naming-heuristik, opinion |
| SKIP-14 | `path-segment-plural` (= apiq G5) | Redocly | Naming-heuristik, opinion |
| SKIP-15 | `paths-kebab-case` (vacuum) / `paths-kebab-case` (Redocly) | Vacuum, Redocly | Naming-Konvention; sollte CONFIGURABLE sein, nicht hard-coded |
| SKIP-16 | `camel-case-properties` (vacuum) | Vacuum | Naming-Konvention; statt configurable |
| SKIP-17 | `H001 base-path-extraction` (Zally) | Zally | Refactor-suggestion; nice-to-have, low priority |
| SKIP-18 | OWASP `protection-global-*` (3 Varianten) | OWASP | strict / non-strict / safe-protection — opinion-driven |
| SKIP-19 | OWASP `jwt-best-practices` | OWASP | JWT-bearerFormat-annotation-style; opinion |
| SKIP-20 | `ibm-requestbody-name` (`x-codegen-request-body-name`) | IBM | IBM-Codegen-extension |

### Already-in-apiq-brainstorm (confirmed externally)

Tri-/Multi-Linter-Konsens — diese Brainstorm-Items sind durch externe Tool-Validierung bestätigt:

| brainstorm-ID | which-tool-confirms | Notes |
|---|---|---|
| A1 ($ref-targets exist) | Redocly `no-unresolved-refs`, IBM `ibm-ref-pattern` | Multi-Linter-Standard |
| A2 ($ref-cycles als Finding) | IBM `ibm-no-circular-refs` | Bestätigt — als reportable Finding |
| A3 (required-Felder in properties) | Vacuum `required-fields-defined`, Redocly `no-required-schema-properties-undefined`, IBM `ibm-define-required-properties` | **Tri-Linter-Konsens** — must-have |
| A4 (discriminator.propertyName Member) | IBM `ibm-discriminator-property` | Bestätigt |
| A6 (pattern valid Regex) | (siehe MIN-2 für Anchored-Erweiterung) | Bestätigt |
| A9/A10 (nullable vs type-array) | Redocly `nullable-type-sibling`, IBM `ibm-avoid-multiple-types` | Bestätigt |
| A11 (additionalProperties+required combinatorial) | OWASP `no-additionalProperties`, IBM `ibm-well-defined-dictionaries` | Bestätigt |
| A12 (allOf 1-elem) | Vacuum `no-unnecessary-combinator`, IBM `ibm-no-superfluous-allof` | Bi-Linter-Konsens |
| A13 (oneOf/anyOf 1-elem) | Vacuum `no-unnecessary-combinator` | Bestätigt |
| B1/B7 (GET/HEAD/DELETE no body) | Vacuum `no-request-body`, IBM `ibm-no-operation-requestbody` | Bestätigt |
| B8 (operationId-verb-prefix) | IBM `ibm-operationid-naming-convention` | Bestätigt |
| C1 (mind. 2xx oder default) | Spectral `operation-success-response`, Redocly `operation-2xx-response` | Bereits-in-spectral:oas |
| C2/C3 (4xx coverage) | Vacuum `operation-4xx-response`, Redocly `operation-4xx-response`, OWASP `define-error-validation` | Multi-Linter |
| C5 (security → 401) | OWASP `define-error-responses-401` | Bestätigt |
| C7 (5xx oder default) | OWASP `define-error-responses-500` | Bestätigt |
| C9 (429 → Retry-After) | OWASP `rate-limit-retry-after` | Bestätigt |
| C10 (304 → cache validators) | (siehe MIN-28 für ETag-pair-Erweiterung) | Bestätigt + erweitert |
| D1 (2xx-response-type-Konsistenz) | IBM `ibm-resource-response-consistency` | Bestätigt — DETERMINISTISCH |
| D4 (description-only response) | (apiq custom-rule existiert) | apiq-eigenes |
| F1/F5/F7 (security-schemes definiert/wohlgeformt) | IBM `ibm-securityscheme-attributes`, `ibm-securityschemes` | Bestätigt |
| G1/G6/G7 (naming-konsistenz) | Zally M010, IBM 7 casing-rules | Multi-Linter |
| I1/I2 (date / date-time format) | IBM `ibm-use-date-based-format` | Bestätigt |
| J2 (id-fields haben format/pattern) | apiq custom-rule existiert (apiq-fk-fields-need-format-or-pattern) | apiq-eigenes |
| K1 (Error-Schema hat type+message) | IBM `ibm-error-response-schemas` | Bestätigt |
| K2 (RFC 7807) | Redocly `operation-4xx-problem-details-rfc7807` | Bestätigt |
| L2 (requestBody.required explicit) | (apiq M-class) | Apiq-eigenes |
| M1/M2 (schema/property descriptions) | IBM `ibm-schema-description`, `ibm-property-description` | Bestätigt |
| M6 (inline-schemas reuse-able) | IBM `ibm-avoid-inline-schemas` | Bestätigt |
| M7 (duplicate schemas via canonical-form-hash) | Vacuum `description-duplication` (schwächer, nur descriptions) | Konzept bestätigt; apiq-extends auf Schema-Hash |
| M8 (additionalProperties absent) | OWASP `no-additionalProperties` | Bestätigt — als per-schema-rule |
| M9 (string maxLength) | OWASP `string-limit`, IBM `ibm-string-attributes` | Multi-Linter |
| M10 (integer min/max) | OWASP `integer-limit`, IBM `ibm-integer-attributes` | Multi-Linter |
| M12 (enum casing inconsistency) | IBM `ibm-enum-casing-convention` | Bestätigt |
| O1 (unused components alle 8 Klassen) | Spectral, Vacuum, Redocly `no-unused-components` | Bestätigt — wir extenden auf alle 8 |
| O2 (case-insensitive component-collisions) | Redocly `component-name-unique`, IBM `ibm-avoid-property-name-collision` | Bestätigt |
| O3 (duplicate components hash-basiert) | Vacuum `description-duplication` (subset) | Konzept bestätigt |
| P2 (server.variables default+description) | IBM `ibm-server-variable-default-value` | Bestätigt |
| P3/P4/S6 (path-template-parameter-Konsistenz) | IBM `ibm-valid-path-segments`, Spectral `path-params`/`path-declarations-must-exist` | Multi-Linter-Konsens |
| Q1 (operations ohne tags) | Spectral `operation-tag-defined` | Bereits |
| Q4 (tag mit nur 1 op) | (apiq Walker-Class) | Apiq-eigenes |
| R1 (summary-length) | IBM `ibm-operation-summary-length` (max 80) | Bestätigt |
| R7 (operationId-duplikate) | Spectral `operation-operationId-unique`, Vacuum `operation-operationId-unique` | Bestätigt |
| S1 (path-segments lowercase) | IBM `ibm-path-segment-casing-convention` (configurable) | Bestätigt |
| S3 (trailing slash konsistenz) | Spectral `path-keys-no-trailing-slash`, Redocly `no-path-trailing-slash`, Vacuum `path-keys-no-trailing-slash` | Multi-Linter |
| S8 (RPC-style verbs in path) | Vacuum `no-http-verbs-in-path`, Redocly `no-http-verbs-in-paths` | Bestätigt |
| T1 (array-params style/explode) | Redocly `array-parameter-serialization` | Bestätigt |
| T2 (required-params no default) | IBM `ibm-no-default-for-required-parameter` | Bestätigt |
| T4 (Standard-headers als params flagen) | IBM `ibm-no-content-type-header`, `ibm-no-accept-header`, `ibm-no-authorization-header` | Tri-Linter |
| T7 (path-param required:true explicit) | (apiq custom existiert) | Apiq-eigenes |
| §9 (Cross-Reference-Konsistenz) | IBM `ibm-property-consistent-name-and-type` | DETERMINISTISCH bestätigt |

### Unsure (orchestrator review)

| ID | Pattern | Source | Why-unsure |
|---|---|---|---|
| UNS-1 | OWASP `protection-global-{unsafe,unsafe-strict,safe}` (3 Varianten) | OWASP | Hat alle 3 Schwierigkeitsgrade. Welche nehmen wir? unsafe-strict ist sehr opinionated. Wahrscheinlich nur "unsafe" (= unsafe methods brauchen security) als warn. |
| UNS-2 | IBM `ibm-anchored-patterns` (`^…$` required) | IBM | Sehr clean, aber manche legitimen patterns haben keine Anchors (z.B. partial-match-flagging). Severity hint? |
| UNS-3 | Redocly `boolean-parameter-prefixes` (`is`/`has`-prefix) | Redocly | Naming-heuristik, opinion. Apiq sagt: NEIN (siehe SKIP-13). Aber als CONFIGURABLE-rule? |
| UNS-4 | Vacuum `description-duplication` als Walker | Vacuum | Wir haben Schema-Duplikat-Hash (M7/O3). Description-Duplikat ist anderes Mechanik. Nice-to-have? |
| UNS-5 | Vacuum `paths-specificity-order` | Vacuum | Routing-Disambiguation. Severity warn? Niemand sonst hat's. Lohnt sich der Walker-Effort? |
| UNS-6 | Redocly `request-mime-type` / `response-mime-type` (config-driven Allowlist) | Redocly | Nur sinnvoll mit User-Config. Apiq-Default ist "no allow-list, just hygiene". Skip oder als opt-in? |
| UNS-7 | IBM `ibm-redirect-response-body` (3xx body checks) | IBM | Edge-case-rule (3xx-response mit body). Geringer Wert. |
| UNS-8 | IBM `ibm-no-array-responses` (top-level array) | IBM | Codegen-relevant aber legitim für viele APIs (z.B. `GET /items` → `[Item]`). Severity hint? |
| UNS-9 | IBM `ibm-required-array-properties-in-response` (empty-vs-missing) | IBM | Sehr-fein. Empty-array vs missing-property ist semantisch wichtig — aber wer prüft das deterministisch? Suggestive-only. |
| UNS-10 | OWASP `no-numeric-ids` (enumeration-risk) | OWASP | Sehr opinionated — viele legitime APIs haben numeric-IDs (DBs!). Könnte hint sein. |
| UNS-11 | Redocly `no-mixed-number-range-constraints` | Redocly | OAS-3.1-spezifisch. Wenn wir nur 3.0 auditieren, irrelevant. Format-conditional rule. |
| UNS-12 | OWASP `array-limit` / `string-limit` / `integer-limit` als Per-Item-Rule (nicht nur Walker) | OWASP | Wir haben Walker (statistical >50%). Per-Item-Rule wäre redundant aber schärfer. Beide? |
| UNS-13 | IBM `ibm-resource-response-consistency` (POST/PUT-response = GET-response) | IBM | Mächtig, aber heuristik-driven (welche Resource gehört zu welcher path?). Komplexe Implementierung. Ja oder nein? |
| UNS-14 | IBM `ibm-pattern-properties` (3.1-only restrictions) | IBM | OAS 3.1 only. Format-conditional. Ja im 3.1-pfad. |
| UNS-15 | IBM `ibm-unevaluated-properties` (3.1-only) | IBM | OAS 3.1 only. Format-conditional. Ja im 3.1-pfad. |
| UNS-16 | IBM `ibm-schema-keywords` (allow-list erlaubter Keywords) | IBM | Defensive. Würde "exotische" Keywords flaggen. Eher hint. |
| UNS-17 | Vacuum `oas-schema-check` (strict JSON-Schema-Compilation) | Vacuum | Eigentlich AJV-Layer-Job (siehe Brainstorm §1). Vacuum macht's als Spectral-Rule. Wir brauchen's deterministisch ohnehin. |
| UNS-18 | IBM `ibm-no-superfluous-allof` mit `description`-sibling case | IBM | Sehr enger sub-case von M7. Lohnt sich eigene Rule? |
| UNS-19 | Configurable casing-conventions (7 IBM-Rules) als CONFIG-driven apiq-Rules | IBM | Wir tendieren zu DYNAMIC-Klassifikator (§13 — aus Spec lernen). Aber configurable wäre "klassischer" Linter-Style. Beide? |
| UNS-20 | `migrate-zally-ignore` (vacuum)-Pattern für apiq | Vacuum | Wenn wir x-spectral-ignore / x-redocly-ignore handlen wollen, brauchen wir cross-tool-extension-mapping. Post-launch-Feature. |

---

## Summary

**Tri-Linter-Konsens (must-have, durch ≥3 Tools bestätigt):**
- `required-fields-defined` (apiq A3) — Vacuum + Redocly + IBM
- `no-content-type-header-parameter` — apiq + IBM + (RFC) — bereits gebaut
- `no-request-body` (apiq B1) — Vacuum + IBM
- 4xx-response-coverage (apiq C2/C3) — Vacuum + Redocly + OWASP
- string-/integer-/array-bounds (apiq M9/M10/L) — IBM + OWASP + Zally
- naming-konsistenz (apiq G1+) — Zally + IBM (7 rules)
- component-name-unique case-insensitive (apiq O2) — Redocly + IBM
- path-template-parameter-Konsistenz (apiq P3/P4/S6) — Spectral + IBM
- $ref-targets exist (apiq A1) — Spectral + Redocly + IBM

**Neue Klassen die im apiq-Brainstorm fehlen (load-bearing):**
1. **OWASP-Security-Class** (24 Vacuum-Rules): `no-numeric-ids`, `no-api-keys-in-url`, `no-credentials-in-url`, `security-hosts-https`, `no-http-basic`, `array-limit`/`string-limit`/`integer-limit` als per-item-Rules, `no-additionalProperties`, `constrained-additionalProperties`. Apiq braucht eine eigene Sektion **F (security)** im Brainstorm.
2. **Path-Routing-Class:** `paths-specificity-order`, `no-ambiguous-paths`, `no-consecutive-path-parameter-segments`, `duplicate-paths`. Apiq Sektion **S** erweitern.
3. **Cache-Validator-Pairs:** `etag-header` ↔ `if-match`-param ↔ 412-response-headers. Apiq Sektion **C** erweitern.
4. **`type`+`format`-Combination-Validity:** apiq A7 nur "known formats" — IBM macht "valide combinations". Strenger.
5. **`pattern`-Anchoring:** apiq A6 nur "valid regex" — IBM `anchored-patterns` ist zusätzlicher Check.
6. **Casing-Convention als config-driven 7-Rule-Klasse:** apiq's dynamic-classifier (§13) ist alternative; wir sollten beides anbieten.
7. **Cross-property-consistency:** IBM `property-consistent-name-and-type` ist DETERMINISTISCH (cross-reference-§9-Konsistenz). Bestätigt machbar.
8. **Cross-operation-resource-consistency:** IBM `resource-response-consistency` ist DETERMINISTISCH cross-op-Vergleich. Mächtig.

**Klassen die apiq HAT, die andere NICHT haben (apiq-USP):**
- `M7` (canonical-form-hash schema-duplicates) — niemand sonst macht's tief.
- `apiq-fk-fields-need-format-or-pattern` (FK-Heuristik) — vacuum/IBM haben einzelne stücke, niemand das kombinierte Pattern.
- `apiq-unix-time-format-on-timestamp-fields` — nur IBM `use-date-based-format` ähnlich, aber für strings; integer-unix-Time ist apiq-only.
- Walker-Klasse (statistical % aggregation) — niemand sonst hat das als first-class output. Spectral ist per-occurrence.
- `apiq-versioning-headers-need-enum` — versionierungs-Heuristik niemand-sonst.
- §9 Cross-Reference-Konsistenz — IBM hat den ersten Schritt (`property-consistent-name-and-type`), apiq erweitert auf Format/Pattern/Description-Drift.

**Stop-Kriterium-Implikation:** Wir haben **35 neue Patterns (MIN-1 bis MIN-50, abzgl. Duplikate)** plus eine **OWASP-Security-Klasse** die ins Brainstorm aufgenommen werden müssen. Davon sind ~15 echte Lücken (rest ist subtle Erweiterung apiq-existing). Plus ~20 SKIP-rules die wir explizit als "vendor-spezifisch, bewusst nicht" markieren. Plus ~50 brainstorm-IDs die durch externe Tools bestätigt sind.

Mit diesen Erweiterungen wäre apiq Stage A **pari oder besser** zu Vacuum/Redocly/IBM auf strukturellen-Patterns. apiq-USP bleibt Walker-Statistical-Aggregation + Schema-Hash-Duplicates + Cross-Reference-Field-Konsistenz + LLM-Phase-B mit Domain-Knowledge.

---

## Sources / external evidence

- Vacuum: `daveshanley/vacuum/rulesets/rulesets.go` (const-block + `GetAllBuiltInRules` + `GetAllOWASPRules`) — https://github.com/daveshanley/vacuum
- Vacuum docs: https://quobix.com/vacuum/rules/all/
- IBM: `IBM/openapi-validator/docs/ibm-cloud-rules.md` (TOC + Overview-Tabelle, 78 IBM-Rules) — https://github.com/IBM/openapi-validator
- IBM npm: `@ibm-cloud/openapi-ruleset` — https://www.npmjs.com/package/@ibm-cloud/openapi-ruleset
- Redocly: `Redocly/redocly-cli/packages/core/src/rules/{common,oas3}` (Datei-Listing) — https://github.com/Redocly/redocly-cli
- Redocly docs: https://redocly.com/docs/cli/rules/built-in-rules
- Zally: `zalando/zally/server/rules.md` — https://github.com/zalando/zally
- Stoplight Spectral: https://github.com/stoplightio/spectral (`spectral:oas` reference)
- thim81/openapi-format: https://github.com/thim81/openapi-format
- speccy (deprecated): https://github.com/wework/speccy
- OWASP-API-Security: https://owasp.org/www-project-api-security/
