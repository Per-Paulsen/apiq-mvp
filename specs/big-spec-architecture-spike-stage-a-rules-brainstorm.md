# Stage A — Comprehensive Deterministic-Rules Brainstorming

> **Zweck:** alle deterministischen Checks sammeln die für **eine beliebige OpenAPI Spec** anwendbar sind, ohne Vendor-/API-Family-Wissen. Stage A muss vor LLM-Phase B vollständig stehen, weil:
> 1. **Reputation:** apiq darf nicht weniger finden als mature Linter (Vacuum, Redocly, Community-Rulesets).
> 2. **Cost/Hallu:** alles was deterministisch geht, soll nicht ans LLM.
> 3. **Architektur:** Stage A = Mechanik (spec-agnostic). LLM = Reasoning (spec-agnostic, ohne Vendor-Recognition). Keine API-Family-Detection nirgends.

> **Status (2026-05-05):** Inventur vorhanden. Brainstorming-Liste unten ist proaktiv-comprehensive. Implementation + Konkurrenz-Benchmark (Vacuum/Redocly) folgen als Reality-Check.

---

## Architektur-Frame (load-bearing)

| Layer | Macht | Was nicht |
|---|---|---|
| **Stage A — Deterministisch** | Strukturelle Validität, generische REST/HTTP/OpenAPI-Conventions, Schema-Hygiene, Statistical Cross-cutting Patterns | Vendor-spezifische Patterns (Stripe-Idempotency, GitHub-Versioning, etc.) — NICHT |
| **Phase B — LLM** | Reasoning über die spezifische Spec, semantische Inkonsistenzen, Domain-Implikit-Lücken — auf JEDE Spec anwendbar via Training-Knowledge | API-Family-Detection ("ist das Stripe?") — NICHT |

Stage A skaliert auf jede beliebige Spec, weil keine Vendor-Conditionals drin sind. LLM skaliert auf jede beliebige Spec, weil es Reasoning anwendet, nicht Pattern-Recognition gegen einen Catalog.

---

## Inventur — was schon da ist

### Custom-Spectral-Rules (27 in `apiq-ruleset.yaml`)
- FK/ID-Typing: `apiq-fk-fields-need-format-or-pattern`, `apiq-unix-time-format-on-timestamp-fields`
- Numeric-Range: `apiq-limit-parameter-needs-bounds`, `apiq-limit-property-needs-bounds`
- OAS-3-Violations: `apiq-deepobject-only-on-objects`, `apiq-no-ref-siblings`
- Description: `apiq-description-no-html-markup`, `apiq-schema-description-not-stub`, `apiq-info-description-substantive`
- Tags: `apiq-spec-needs-tags-array`, `apiq-tag-meaningful-description`
- Polymorphism: `apiq-oneof-needs-discriminator`
- Type-Primitive: `apiq-count-fields-should-be-integer`
- Server: `apiq-no-localhost-servers`
- Response-Shape: `apiq-response-needs-content`, `apiq-no-content-type-header-parameter`, `apiq-post-should-accept-json`
- Enum: `apiq-versioning-headers-need-enum`
- Default-Type-Match: `apiq-default-type-matches-{integer,number,boolean,string}`
- Mediatype: `apiq-prefer-iana-markdown-mediatype`
- Examples: `apiq-request-body-needs-example`
- Parameter-Style: `apiq-comma-separated-should-be-array`
- Dead-Code: `apiq-unused-component-{headers,examples}`

### Walkers (12)
HTML-Prevalence · Empty-Schema-Descriptions · MaxLength-Default-Everywhere · Integer-No-Range-Constraints · Request-Body-No-Examples · Single-Default-Response · Prose-Deprecation-Without-Flag · OperationId-Verbose · Pagination-Style-Inconsistency · Vendor-Extension-Overuse · Unused-Component-Headers · Response-Without-Validators-On-304

### spectral:oas Default-Coverage
operation-{description,summary,operationId,tag-defined} · oas3-{server-trailing-slash,unused-component,valid-media-example,valid-schema-example} · duplicated-entry-in-enum · oas3-tag-no-empty-description · info-{contact,license}

---

## Brainstorming — generische Custom-Rules die FEHLEN

### A. Strukturelle Validität & OAS-Konformität

| ID | Check | Severity | Notes |
|---|---|---|---|
| A1 | `$ref`-Targets müssen existieren (dangling-ref) | error | swagger-parser catched basics; deeper check für intra-spec refs |
| A2 | `$ref`-Cycles als reportable Finding (nicht nur strip) | warn | wir haben cycleStripSpec — bisher silent |
| A3 | `required`-Felder müssen in `properties` existieren | error | klassisch falsch authored |
| A4 | `discriminator.propertyName` muss in allen oneOf-Subschemas sein | error | OAS 3 §4.7.25 |
| A5 | `discriminator.mapping`-Werte müssen valide $refs sein | error | |
| A6 | `pattern`-Felder sind valid Regex (compile-test via JS) | error | |
| A7 | `format`-Werte sind known formats oder dokumentiert | hint | date, date-time, email, uuid, uri, etc. — unbekannte format-Werte als hint |
| A8 | `type`-Werte sind valid (string/number/integer/boolean/array/object) | error | typos catchen |
| A9 | `nullable: true` in OAS 3.1-spec (deprecated, use `type: [x, null]`) | warn | |
| A10 | `type: [x, null]` in OAS 3.0-spec (nicht supported, use `nullable: true`) | error | |
| A11 | `additionalProperties: false` mit fehlenden required-Felder catched (combinatorial check) | hint | |
| A12 | `allOf` mit nur 1 Element (sinnlos, könnte direkter $ref sein) | hint | |
| A13 | `oneOf`/`anyOf` mit nur 1 Element (sinnlos) | warn | |
| A14 | `anyOf` wo `oneOf` semantisch korrekt wäre (mutually-exclusive Subschemas) | hint | nur wenn klar mechanisch detektierbar — sonst LLM |

### B. HTTP-Method-Semantik

| ID | Check | Severity | Notes |
|---|---|---|---|
| B1 | `GET`-Operations dürfen keinen `requestBody` haben | error | OAS-3 disallowed |
| B2 | `HEAD`-Operations dürfen keine Response-Body haben | warn | |
| B3 | `POST` für Resource-Creation sollte 201 + Location-Header zurückgeben | hint | |
| B4 | `DELETE` sollte 204 (no-content) oder 200 (mit body) | hint | |
| B5 | `PUT`/`PATCH` sollten 200/204 | hint | |
| B6 | `OPTIONS` sollte CORS-Konvention dokumentieren | hint | |
| B7 | Body auf Methods die historisch keinen haben sollten (DELETE, GET) | warn | |
| B8 | `operationId`-Verb-Prefix passt zur HTTP-Method (createX → POST, getX → GET, etc.) | hint | naming-convention |

### C. Status-Code-Coverage

| ID | Check | Severity | Notes |
|---|---|---|---|
| C1 | Jede Operation hat mindestens eine 2xx-Response (oder default) | error | |
| C2 | State-changing Operations (POST/PUT/PATCH/DELETE) sollten 4xx haben | warn | |
| C3 | Operations mit `requestBody` sollten 400 oder 422 haben | warn | input-validation |
| C4 | Operations mit Path-Param-IDs sollten 404 haben | hint | resource-not-found |
| C5 | Operations mit `security` sollten 401 haben | warn | |
| C6 | Operations mit role/permission-Logik sollten 403 haben | hint | nicht immer detektierbar — vorsichtig |
| C7 | Operations sollten 5xx oder `default` haben | hint | server-error coverage |
| C8 | Status-Code-Konflikte: 200 für POST-Create, 201 für GET, etc. | warn | |
| C9 | Specs mit 429 in Responses sollten Retry-After-Header dokumentieren | warn | |
| C10 | 304 Not-Modified ohne Cache-Validators (ETag, If-None-Match) | warn | wir haben Walker — als Spectral-Rule formalisieren |

### D. Response-Body-Konsistenz

| ID | Check | Severity | Notes |
|---|---|---|---|
| D1 | 2xx-Responses einer Operation geben gleichen Type zurück (oder alle anders) | hint | |
| D2 | 4xx-Responses einer Operation haben einheitliches Error-Schema | hint | |
| D3 | Response-Components mit gleichem Status haben gleiches Schema (cross-op) | hint | statistical |
| D4 | Empty `description`-only Response-Components (no `content`, no `headers`) | warn | wir haben `apiq-response-needs-content` — generalisieren |
| D5 | Content-Type-Konsistenz innerhalb einer Operation (alle 2xx → application/json) | hint | |
| D6 | application/problem+json oder eigenes Error-Schema konsistent | hint | RFC 7807 |

### E. Pagination-Conventions (generic, ohne Vendor)

| ID | Check | Severity | Notes |
|---|---|---|---|
| E1 | List-Endpoints (Plural-Path mit Array-Response) sollten Pagination-Parameter haben | warn | heuristik |
| E2 | Pagination-Parameter konsistent benannt (alle `limit/offset` ODER `page/per_page` ODER `cursor`) | warn | innerhalb Spec |
| E3 | Pagination-Style konsistent (cursor vs offset/limit) cross-spec | warn | wir haben Walker — als Rule? |
| E4 | List-Response-Wrapper konsistent (alle haben `data`+`pagination` ODER alle bare-array) | hint | |
| E5 | Link-Header für Pagination wo cursor-based | hint | RFC 8288 |
| E6 | Pagination-Limits haben Defaults dokumentiert | hint | |

### F. Authentication & Security

| ID | Check | Severity | Notes |
|---|---|---|---|
| F1 | `securitySchemes` definiert wenn nicht-public | error | |
| F2 | Operations haben security definiert (oder spec-level default greift) | warn | |
| F3 | Mindestens eine Operation nutzt jeden definierten securityScheme | hint | dead-scheme-detection |
| F4 | `security` mit leerem Array (`[]`) für public-Override dokumentiert | hint | |
| F5 | OAuth2-Flows haben tokenUrl/authorizationUrl/scopes definiert | error | |
| F6 | `bearerFormat` definiert wenn `type: http, scheme: bearer` | hint | JWT vs opaque |
| F7 | API-Key-Schemes haben `in` und `name` | error | |
| F8 | Security-Schemes mit Description | hint | |
| F9 | Operations mit security sollten 401 haben (link zu C5) | warn | |
| F10 | Sensitive Operations (POST/PUT/DELETE auf admin-paths) mit Auth | hint | path-heuristik |

### G. Naming-Konsistenz (Cross-Spec Statistical)

| ID | Check | Severity | Notes |
|---|---|---|---|
| G1 | Property-Naming-Konsistenz (camelCase vs snake_case mehrheitlich) | warn | Walker |
| G2 | Schema-Naming-Konsistenz (PascalCase vs camelCase mehrheitlich) | warn | Walker |
| G3 | operationId-Naming-Pattern (alle verbResource ODER alle resource_verb) | warn | wir haben verbose-Walker — erweitern |
| G4 | Path-Segments lowercase | warn | RESTful convention |
| G5 | Path-Plural für Listen, Singular für Single-Resource | hint | heuristik |
| G6 | Path-Parameter-Naming-Konsistenz ({user_id} vs {userId}) | warn | innerhalb Spec |
| G7 | Tag-Naming-Konsistenz (alle Capitalized ODER alle lowercase) | hint | |
| G8 | Header-Parameter-Naming (HTTP-Header-Convention: dash-separated) | warn | |

### H. Versioning-Conventions

| ID | Check | Severity | Notes |
|---|---|---|---|
| H1 | URL-Path-Version vs Header-Version-Konsistenz (kein Mixing) | warn | |
| H2 | `info.version` ist semver oder dokumentiert non-semver | hint | |
| H3 | Version in Servers-URL vs Path konsistent | warn | |
| H4 | Deprecated-Operations haben sunset-Date oder Replacement | warn | OAS 3.1 hat `deprecated: true` — wir checken auf Replacement-Hinweis im description |

### I. Date/Time-Conventions

| ID | Check | Severity | Notes |
|---|---|---|---|
| I1 | Date-Time-Felder haben `format: date-time` (ISO 8601) | warn | |
| I2 | Date-Felder haben `format: date` | warn | |
| I3 | Timezone-Handling explicit (UTC oder offset dokumentiert) | hint | |
| I4 | Date vs date-time Konsistenz innerhalb ähnlicher Felder | hint | statistical |
| I5 | Unix-time-Format wenn integer-Felder timestamp-Naming haben | hint | wir haben — erweitern auf milliseconds-detection |

### J. ID-Conventions

| ID | Check | Severity | Notes |
|---|---|---|---|
| J1 | ID-Format-Konsistenz innerhalb einer Resource (alle UUID oder alle integer) | warn | |
| J2 | ID-Felder haben `format` oder `pattern` | warn | wir haben FK-rule — erweitern auf primary-keys |
| J3 | Path-Param-IDs konsistent benannt (cross-resource: alle `{*_id}` ODER alle `{id}`) | warn | |
| J4 | Composite-Keys dokumentiert (mehrere ID-Felder zusammen unique) | hint | nur via prose detectable — eher LLM |

### K. Error-Response-Conventions

| ID | Check | Severity | Notes |
|---|---|---|---|
| K1 | Error-Schema hat mindestens `type/code` + `message`-Felder | warn | |
| K2 | application/problem+json (RFC 7807) wenn Error-Schemas konsistent typed | hint | |
| K3 | Error-Code-Enumeration (enum) vs free-text-Message | hint | |
| K4 | Error-Schemas referenzieren ein gemeinsames Component (Reuse-Check) | hint | |
| K5 | 400 vs 422 Konsistenz (validation vs semantic-error) | hint | |
| K6 | Error-Examples für 4xx vorhanden | hint | |

### L. Request-Body-Hygiene

| ID | Check | Severity | Notes |
|---|---|---|---|
| L1 | POST/PUT/PATCH ohne `requestBody` (verdächtig wenn nicht resource-action wie /reset) | hint | |
| L2 | `requestBody.required` explicit gesetzt (nicht default false) | warn | |
| L3 | File-Upload mit `multipart/form-data` Konvention | hint | |
| L4 | Binary-Upload-Endpoints declarieren `application/octet-stream` oder spezifisch | hint | |
| L5 | RequestBody mit type-different von Response (asymmetric resource shape ok aber dokumentieren) | hint | |

### M. Schema-Hygiene

| ID | Check | Severity | Notes |
|---|---|---|---|
| M1 | Schemas ohne description (statistical >50% threshold) | warn | wir haben Walker |
| M2 | Properties ohne description (statistical) | hint | |
| M3 | Schemas mit nur 1 Property (verdächtig — könnte inline sein) | hint | |
| M4 | Tief verschachtelte Schemas (>3 Ebenen ohne $ref-Extraction) | warn | |
| M5 | Schemas mit zu vielen Felder (>50) | hint | maintenance smell |
| M6 | Inline-Schemas die wiederverwendbar wären (>3 Properties + 2× verwendet) | hint | reuse-detection |
| M7 | Duplicate Schemas (gleiche Shape, unterschiedliche Namen) — Hash-basiert | warn | **deterministisch lösbar via canonical-form-hash** |
| M8 | Schemas ohne `additionalProperties` declaration (statistical >70%) | hint | wir haben Walker |
| M9 | String-Properties ohne `maxLength` (statistical) | warn | wir haben Walker |
| M10 | Integer-Properties ohne `minimum`/`maximum` (statistical) | hint | wir haben Walker |
| M11 | enum-Werte ohne Description (oder Markdown-table-convention) | hint | |
| M12 | enum-Werte mit Casing-Inconsistency innerhalb einer enum | warn | |
| M13 | enum-Werte als magic-strings die wahrscheinlich Enum-Object sein sollten | hint | nur prose-detectable — eher LLM |

### N. Examples-Hygiene

| ID | Check | Severity | Notes |
|---|---|---|---|
| N1 | Examples gegen Schema validieren (AJV) | warn | spectral hat oas3-valid-media-example — generalisieren |
| N2 | Defaults gegen Schema validieren (AJV) | error | wir haben für 4 primitives — generalisieren auf nested |
| N3 | Operations mit `requestBody` haben Examples | hint | wir haben — extend |
| N4 | Operations mit non-trivial Response haben Examples | hint | |
| N5 | Examples mit konsistenten Daten cross-references (z.B. user_id "123" überall) | hint | LLM-Job |
| N6 | Examples für jede Status-Code-Response | hint | |

### O. Component-Hygiene

| ID | Check | Severity | Notes |
|---|---|---|---|
| O1 | Unused Components (schemas/headers/examples/parameters/responses/requestBodies/securitySchemes/links/callbacks) | hint | wir haben Schemas+Headers+Examples — alle 8 Component-Klassen abdecken |
| O2 | Naming-Collisions (case-insensitive Duplicates: `User` vs `user`) | warn | |
| O3 | Duplicate Components (gleiche canonical-form, unterschiedliche Namen) | warn | **deterministisch via Hash** |
| O4 | components.responses für Standard-4xx/5xx vs Inline-Definitions (Reuse-Quote) | hint | statistical |
| O5 | Component-Naming-Pattern-Konsistenz | hint | |

### P. Servers/URLs

| ID | Check | Severity | Notes |
|---|---|---|---|
| P1 | Server-URLs absolut oder dokumentiert relativ | warn | |
| P2 | Server-Variables haben `default` und `description` | warn | |
| P3 | Path-Templates valid (alle `{x}` in Path haben matching parameter) | error | |
| P4 | Path-Parameter ohne Path-Template-Position | error | |
| P5 | Custom-Ports in Server-URLs (verdächtig in Production-Specs) | hint | |
| P6 | Multiple Servers — sind die URLs konsistent strukturiert? | hint | |
| P7 | Server-Variable-Patterns (`{environment}` etc.) konsistent verwendet | hint | |

### Q. Tag-Hygiene

| ID | Check | Severity | Notes |
|---|---|---|---|
| Q1 | Operations ohne Tags | warn | spectral hat tag-defined |
| Q2 | Top-level Tags ohne Description | hint | wir haben — strengere Variante |
| Q3 | Tag-Reihenfolge konsistent zu logischer Resource-Hierarchie | hint | hard to detect |
| Q4 | Tags mit nur 1 Operation (zu granular) | hint | |
| Q5 | externalDocs auf Tag-Level vs Operation-Level konsistent | hint | |

### R. Operation-Hygiene

| ID | Check | Severity | Notes |
|---|---|---|---|
| R1 | summary-Length zu kurz (<10) oder zu lang (>200) | hint | |
| R2 | description sehr ähnlich zu summary (Duplikation, levenshtein-distance) | hint | |
| R3 | Operations mit zu vielen Parametern (>20) | hint | smell |
| R4 | `deprecated: true` ohne sunset-Hinweis im description | warn | |
| R5 | externalDocs auf complex-behavior Operations (heuristisch) | hint | |
| R6 | Operations ohne Response-Examples bei polymorphic Schemas | hint | |
| R7 | OperationId-Duplikate (Spectral hat — verifizieren) | error | |

### S. Path-Conventions

| ID | Check | Severity | Notes |
|---|---|---|---|
| S1 | Path-Segments lowercase | warn | |
| S2 | Path-Tiefe (>5 Levels = smell) | hint | |
| S3 | Trailing slashes konsistent (alle paths mit ODER ohne) | warn | |
| S4 | Mixed Versioning (`/v1/users` + `/users`) | warn | |
| S5 | Path-Templating-Konsistenz innerhalb einer Resource (cross-op) | warn | |
| S6 | Path-Parameter werden in Path-Template referenziert (link zu P3) | error | |
| S7 | Plural vs Singular cross-Resource (alle plural ODER alle singular) | hint | |
| S8 | RPC-Style-Paths (Verben in Path) — REST-Smell | hint | heuristik |

### T. Parameter-Hygiene

| ID | Check | Severity | Notes |
|---|---|---|---|
| T1 | Query-Parameter mit Array-Schema haben `style`/`explode` definiert | warn | |
| T2 | Required Parameter haben keinen `default` | warn | sinnlos |
| T3 | Parameter-Description zu kurz (<10 chars) | hint | |
| T4 | Header-Parameter mit Standard-HTTP-Header-Names (Authorization, Content-Type, etc.) flagen | warn | sollten via security oder requestBody-content kommen |
| T5 | Cookie-Parameter security-relevant (sollten via securityScheme) | hint | |
| T6 | Parameter-Reuse via $ref (statistical: hoch-frequente Param-Duplikate) | hint | |
| T7 | path-Parameter `required: true` explicit | warn | OAS-3 implicit, aber explicit ist sauberer |

### U. Webhooks (OAS 3.1)

| ID | Check | Severity | Notes |
|---|---|---|---|
| U1 | webhooks-Definitionen haben request-Schemas | warn | |
| U2 | Webhook-Payload-Types referenced via $ref oder inline mit description | hint | |
| U3 | x-webhooks Vendor-Extension wo `webhooks` use-case existiert | hint | OAS 3.1 vs Vendor-Drift |

### V. externalDocs

| ID | Check | Severity | Notes |
|---|---|---|---|
| V1 | externalDocs URLs valid HTTP-fetchable (optional online check) | hint | |
| V2 | spec-level externalDocs vorhanden bei großer Spec | hint | |

### W. Cross-Cutting Statistical Patterns (Walker-Klasse)

| ID | Check | Severity | Notes |
|---|---|---|---|
| W1 | % Operations mit Tags | hint | (haben wir indirekt) |
| W2 | % Properties mit description | hint | |
| W3 | % Schemas mit Examples | hint | |
| W4 | % Operations mit Request-/Response-Examples | hint | |
| W5 | % Schemas mit `additionalProperties` declared | hint | (haben wir) |
| W6 | % strings mit `maxLength` | warn | (haben wir) |
| W7 | % integers mit min/max | hint | (haben wir) |
| W8 | Naming-Konsistenz cross-spec (camelCase % vs snake_case %) | warn | (G1+G2 als Walker) |
| W9 | Date-Format-Konsistenz cross-spec | hint | (I4 als Walker) |
| W10 | Pagination-Style cross-Endpoint-Konsistenz | warn | (haben wir) |
| W11 | HTML-in-Description Quote | warn | (haben wir) |
| W12 | OperationId-Verbose-Quote | hint | (haben wir) |
| W13 | Schema-Description-Empty Quote | warn | (haben wir) |
| W14 | MaxLength-Default Quote | hint | (haben wir) |
| W15 | Vendor-Extension-Coverage | hint | (haben wir) |

### X. OpenAPI 3.0 vs 3.1 Spezifika

| ID | Check | Severity | Notes |
|---|---|---|---|
| X1 | `nullable: true` in 3.1 — deprecated, use `type: [x, null]` | warn | (link A9) |
| X2 | `type: [x, null]` in 3.0 — invalid, use `nullable: true` | error | (link A10) |
| X3 | `example` (singular) vs `examples` (plural) Konsistenz | hint | |
| X4 | `exclusiveMinimum`/`exclusiveMaximum` als boolean (3.0) vs number (3.1) | error | |
| X5 | Webhooks-Section nur in 3.1 verfügbar | error | wenn 3.0 + webhooks |

---

## Andere deterministische Mechaniken (außer Spectral-Rules + Walkers)

### 1. **AJV-basierte Validation-Layer**
Die OpenAPI-Schemas selbst gegen JSON-Schema-Spec validieren via AJV. Spectral macht oberflächliche Checks — AJV deeper.
- Compilation-Errors als Findings (Schemas die kein Validator akzeptiert)
- Examples gegen ihr Schema validieren (über N1/N2 hinaus)
- Defaults rekursiv validieren (auch nested objects)
- Required-Felder gegen properties combinatorial check (A11)

### 2. **Hash-basierte Duplicate-Detection** (M7, O3)
Schemas in Canonical-Form transformieren (sortierte Keys, normalisierte $refs), Hash bilden, Duplikate finden. Liefert "Schema X und Y sind identisch — konsolidieren als $ref" Findings. Spectral kann das nicht.

### 3. **$ref-Graph-Analyse**
Den $ref-Graph der Spec zeichnen:
- Cycle-Detection als reportable Finding (A2) — wir machen das schon mit cycleStripSpec, aber silent. Als Output emittieren.
- Tot-Komponenten (orphans) — Spectral hat Schemas, aber nicht headers/parameters/responses/examples/links/callbacks/securitySchemes
- $ref-Tiefe (Schemas die >5 Hops weit referenzieren — refactor smell)
- Component-Reuse-Histogram (Schemas die einmal referenced — könnten inline sein; Schemas die 50× referenced — gut)

### 4. **Path-Template-Parser**
Alle Pfade parsen, Path-Parameter extrahieren, gegen die parameters-Listen abgleichen:
- Path-Template-Position-Konsistenz (P3, P4, S6)
- Path-Parameter-Naming cross-Resource (G6, J3)
- Path-Tiefe-Statistik (S2)
- RPC-Style-Detection (Verben in Path: /login, /search, /reset — eher OK; /user/getById — Smell) (S8)

### 5. **HTTP-Method-Coverage-Analyse**
Pro Path-Segment: welche Methoden? Reports:
- Resource-Style-Konsistenz (Path mit GET+POST vs nur GET)
- CRUD-Coverage pro Resource-Path (Resource mit POST aber ohne DELETE — fehlt das?)
- Asymmetric-Resource-Operations (POST gibt Object X zurück, GET gibt Object Y zurück)

### 6. **Content-Type-Coverage-Histogram**
Alle Content-Types in der Spec sammeln:
- Outlier-Detection (97% application/json + 1× text/x-markdown)
- Mismatched-Conventions (POST mit form-encoded + JSON mixed)
- IANA-Compliance (apiq-prefer-iana-markdown ist hier; weitere mediatype-checks)

### 7. **Statistical Aggregation-Layer (über Walkers hinaus)**
Walkers liefern einzelne Aggregat-Findings. Ein Aggregations-Layer liefert Histogramme:
- Description-Length-Distribution (median, p10, p90)
- Schema-Depth-Distribution
- Parameter-Count-per-Operation Distribution
- Response-Codes-per-Operation Distribution

Outlier-Findings: Operation X hat 47 Parameter (Median 4) — Smell.

### 8. **Naming-Pattern-Klassifikator**
Alle Identifier (Property-Names, Schema-Names, operationIds, Path-Segments, Tag-Names) sammeln. Classifier-Pass: camelCase / snake_case / kebab-case / PascalCase / SCREAMING_SNAKE / mixed. Pro Identifier-Klasse Konsistenz-Quote berechnen. Inkonsistenzen flaggen (G1-G8).

### 9. **Cross-Reference-Konsistenz-Check**
Felder mit gleichem Namen quer durch die Spec sollten konsistente Types haben:
- `user_id` ist in Schema A `integer` und in Schema B `string` — Inconsistency-Finding
- `created_at` ist mal date-time, mal unix-time — Inconsistency-Finding
- `email` Pattern variiert zwischen Schemas

### 10. **Diff-/Breaking-Change-Detection** (out-of-scope für initialen Run, aber deterministisch)
Wenn der User eine Vorgänger-Version hochlädt: oasdiff-class breaking-change-detection. Eigenes Epic/Feature post-launch.

### 11. **External-Reference-Validation**
$refs auf externe URLs/Files dereferenzieren (HTTP fetch, optional toggle):
- Tote externe Refs (404)
- Externe Refs zu unvollständigen/invalid Specs

### 12. **TypeScript-Codegen-Validation**
`openapi-typescript` über die Spec laufen lassen. Compilation-Errors → Findings die kommerzielle Codegen-Pipelines stolpern lassen würden.

### 13. **Convention-Rule-Generators**
Nicht statisch hardcoden, sondern aus der Spec selbst lernen: "diese Spec verwendet zu 95% snake_case, hier sind 3 camelCase-Inkonsistenzen". Dynamic-Rule-Generation pro Spec — pragmatischer als statische Naming-Rules.

### 14. **Prose-Pattern-Lookups (mechanisch, nicht NLP)**
Description-Text nach Regex-Patterns scannen die mechanisch zuverlässig sind:
- "deprecated" / "obsolete" / "removed" / "do not use" → deprecation-without-flag (haben wir)
- "comma-separated" / "comma separated" → array-instead-of-string (haben wir)
- "see also" / "alternative" → externalDocs-suggestion
- TODO / FIXME / XXX in description → unfinished-authoring (haben wir indirekt via stub-detection)
- URL-Patterns in description die externalDocs-fields wären

### 15. **Schema-Inference-Comparison** (out-of-scope für reine Spec-Analyse, aber deterministisch)
Wenn der User echte API-Responses hochlädt: Schema aus Response inferieren und gegen Spec vergleichen. Eigenes Epic/Feature.

---

## Implementierungs-Strategie

1. **Brainstorming-Liste oben** wird als TODO-Source für Custom-Rules + Walker-Erweiterungen genutzt.
2. **Pro Item entscheiden:** Spectral-Rule (per-node-pattern) oder Walker (statistical/cross-cutting) oder eigenes Mechanik-Modul (Hash-Detection, Graph-Analyse, etc.).
3. **Comprehensive Implementation** — alle Items oben adressieren, nicht selektiv.
4. **DANN Konkurrenz-Benchmark:** Vacuum + Redocly CLI + 2-3 Community-Spectral-Rulesets gegen unsere 4 Specs. Lücken = was wir vergessen haben.
5. **Lücken schließen.** Stop-Kriterium: pari oder besser auf allen 4 Specs.

---

## Was nicht in Stage A gehört

- **Vendor-spezifische Patterns** (Idempotency-Key auf Stripe, X-GitHub-Api-Version, From-Header auf PD) — LLM-Job.
- **API-Family-Detection** (`info.title.includes("Stripe")`) — generell nicht.
- **Semantische Plausibilität** ("Endpoint heißt /charge aber gibt User-Object zurück") — LLM-Job.
- **Deprecation-Marker in Prosa als ambiguity-frei detektieren** ("the last X has priority" vs "X is deprecated") — LLM-Job. Mechanisch nur Strict-Pattern.
- **Wrong-Summary-Detection** ("Create a card" auf bank_accounts-Endpoint) — LLM-Job.
- **Parameter-Relationship-Rules in Prosa** ("if X is set, Y is required") — LLM-Job.

---

## Status

- **Brainstorming:** initiiert 2026-05-05.
- **Implementation:** noch nicht gestartet — folgt nach User-Review der Liste.
- **Konkurrenz-Benchmark:** geplant nach comprehensive Implementation.
- **Living-Doc:** Liste oben wird ergänzt während Stage-A-Bau (neue Rules die beim Implementieren auffallen).
