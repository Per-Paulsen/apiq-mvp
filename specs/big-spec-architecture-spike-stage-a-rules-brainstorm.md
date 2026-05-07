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

---

## Mining-Ergänzungen (2026-05-05)

> **Konsolidierung von 3 Mining-Passes** (Tasks #23 / #24 / #25):
> - `big-spec-architecture-spike-stage-a-mining-spectral.md` — Spectral-Universum (~125 Patterns, Prefix `[SP-N]` ≙ G-OWASP / G-AYWH / G-AZ / G-DO / G-SD / G-VTEX / G-SPS / G-TD / G-ZAL / G-RHOAS / G-URL / DM)
> - `big-spec-architecture-spike-stage-a-mining-linters.md` — Konkurrenz-Linter (50 Patterns `MIN-1..MIN-50`)
> - `big-spec-architecture-spike-stage-a-mining-style-guides.md` — Industry-Style-Guides (50 Patterns `SG-1..SG-50`)
>
> **Append-only.** Die existierenden Kategorien A-X bleiben unverändert. Diese Sektion fügt:
> 1. Cross-Source-Konsens (P1 must-implement)
> 2. Single-Source-Patterns nach Kategorie A-X (+ neue Y/Z)
> 3. Severity-Upgrades
> 4. Architecture-Reframes
> 5. Opinion-Divides für Unsure-Tracking
> 6. Deep-Mechanic-Patterns
> 7. Brainstorm-IDs durch externe Quellen bestätigt
>
> **Source-Notation:** `[SP-G-OWASP-2]` = Spectral-Mining G-OWASP-2; `[MIN-3]` = Linter-Mining MIN-3; `[SG-16]` = Style-Guide-Mining SG-16.

---

### 1. Cross-Source Consensus Patterns (P1 — must implement)

Patterns durch ≥2 unabhängige Mining-Quellen bestätigt. Diese sind die höchst-priorisierten Lücken.

| Pattern | Sources | Severity | apiq-Kategorie | Notes |
|---|---|---|---|---|
| RFC 7807 / 9457 problem+json: error-responses (4xx/5xx) sollten `application/problem+json` ODER JSON:API ODER konsistent typed Custom-Schema haben | [SP-G-AYWH-11], [SG-16], [MIN-33 via Redocly], [SP-G-AYWH-12 via Team-D] | warn | K (extends K2) | Tri-Source-Konsens. **Höchste Priorität.** Apiq hat K2 als hint — Mining empfiehlt warn. |
| RFC 7807 schema-shape: response mit `application/problem+json` muss mind. `type` + `title` + `status` declarieren (`detail`/`instance` optional) | [SP-G-AYWH-12], [SG-17], [MIN-33] | hint | K (extends K1) | Companion zur obigen — strukturelle Validierung. Module (`is-problem-json-schema`-Fn). |
| Bare-array bodies forbidden (request UND response) — top-level body schema muss object sein | [SP-G-AZ-16], [SP-G-AZ-17], [SP-G-ZAL-5], [MIN-31 IBM `ibm-no-array-responses`], [SP-Team-D `response-with-json-object`], [SP-SPS `sps-invalid-response-body`] | warn | L + D | 4+ Sources confirm. Edge-case: stream/file-download-endpoints legitim non-objects. |
| X-header-prefix forbidden (RFC 6648, 2012-deprecated) — request- + response-Header beide | [SP-G-AYWH-4], [SG-8], [SP-SPS `sps-no-x-headers`], [SP-Team-D `no-x-headers-request/response`], Microsoft `#http-no-x-custom-headers` | warn | G + neue Y | 5+ Sources. Caveat: `x-ms-*`/`x-amz-*`/`Stripe-*` extensions leben legitim als Vendor-Erweiterungen. Severity warn (nicht error) wegen Legacy-Gewicht. |
| HTTP-Basic-Auth in `securitySchemes` rejected | [SP-G-OWASP-2], [SG-12], [SP-AYWH `no-http-basic`], [SP-SPS `sps-no-http-basic`], [SP-Team-D `securitySchemes-oauth-allowed-flows`] | error | F | 4+ Sources. Security-load-bearing. Apiq-Lücke. |
| API-keys / credentials in URL forbidden (path/query mit `password`/`secret`/`token`/`api[-_]?key`) | [SP-G-OWASP-3], [SP-G-OWASP-4], [SP-SPS `sps-query-params-no-api-keys`], [MIN-37] | error | F | Tri-Source. Strict OWASP-Hygiene. |
| Server-URLs MUST use `https://` (nicht `http://`) | [SP-G-OWASP-25], [SG-7], [SP-AYWH `hosts-https-only-oas3`], [SP-Adidas https-only], [SP-Team-D `servers-use-https`], [SP-SPS `sps-hosts-https-only`], [MIN-39] | warn | F + P | 6+ Sources. Apiq hat localhost-rule — explicit `http://` rejection fehlt. |
| `additionalProperties` AND `properties` siblings warning (schema-authoring error) | [SP-G-AZ-1], [MIN-16/17 OWASP], [SG-42] | warn | A + M | Apiq M8 ist statistical (Walker); per-schema-rule fehlt. |
| Path-segments lowercase / kebab-case | [SP-G-AYWH-3], [SG-3], [MIN-15 SKIP-Vacuum/Redocly], Adidas, SPS, Team-D, Azure, Zalando #129 | warn | G + S (extends G4/S1) | 6+ Sources. Apiq hat lowercase-Rule — kebab-case-Strenger-Variante als Walker. |
| `required`-Felder müssen in `properties` exists | [SP-Vacuum `required-fields-defined`], [MIN-A3 IBM `ibm-define-required-properties`], [Redocly `no-required-schema-properties-undefined`] | error | A (=A3) | Tri-Linter-Konsens — apiq A3 universell bestätigt. |
| `$ref`-Targets müssen wohlgeformte JSON-Pointer sein + existieren | [SP-A1], [MIN-1 IBM `ibm-ref-pattern` + Redocly `spec-strict-refs`], [SG- universal] | error | A (=A1, extends) | Existence + Format-Validity — apiq A1 prüft existence. |
| `oneOf`/`allOf`/`anyOf` mit nur 1 Element (sinnlos) | [SP-Vacuum `no-unnecessary-combinator`], [MIN-22 IBM `ibm-no-superfluous-allof`], [SP- multiple] | hint | A (=A12, A13) | Bi-Linter-Konsens. |
| Component-name case-insensitive Collisions (`User` vs `user`) | [SP-Redocly `component-name-unique`], [MIN-50], [IBM `ibm-avoid-property-name-collision`], [O2] | warn | O (=O2) | Tri-Linter. |
| GET/HEAD/DELETE/OPTIONS dürfen keinen requestBody haben | [SP-G-AYWH-5], [SP-Adidas], [SP-SPS `sps-request-*-invalid-body`], [Vacuum `no-request-body`], [IBM `ibm-no-operation-requestbody`], [SG-10] | error | B (=B1, extends B7) | 6+ Sources, universell. |
| Trailing-slash consistency cross-paths | [SP-SPS `sps-paths-trailing-slash`], [SP-Zalando `must-use-normalized-paths-without-trailing-slash`], [SG-49], Microsoft, Spectral `path-keys-no-trailing-slash`, Vacuum, Redocly `no-path-trailing-slash` | warn | S (=S3) | Multi-Linter. Apiq hat S3 noch nicht implementiert — **gap**. |
| Path-Templating valid (Path-Params in Operation-Param-List + alle `{x}` in Path haben matching parameter) | [SP-P3/P4], [SG-40], [MIN- Spectral `path-params` + IBM `ibm-valid-path-segments`] | error | P + S (=P3/P4/S6) | Multi-Linter-Konsens. |
| 429 Response → `Retry-After` Header mandatory | [SP-G-OWASP-15], [SG-31], [Vacuum `owasp-rate-limit-retry-after`], [Team-D `missing-retry-after`] | error | C (=C9) | 4+ Sources. Apiq C9 als hint — upgrade. |
| OperationId-Duplikate | [SP-Spectral `operation-operationId-unique`], [Vacuum], [SG- universal], [Team-D `operation-operationId-unique`] | error | R (=R7) | Universell. |
| Naming-Konsistenz (camelCase / snake_case / Pascal etc.) — pro Identifier-Klasse | [SP-G1/G2 multi-source], [SG-4], [Zally M010], [IBM 7 casing-Rules], [SP-Adidas, Azure, DigitalOcean, RedHat, SPS, Zalando] | warn | G (=G1-G8) | Multi-Linter. **WICHTIG:** opinion-divided (camel vs snake) — bleibt statistical Walker, NICHT als hardcoded rule (siehe §5). |

---

### 2. Single-Source Generic Patterns by apiq-Kategorie

Pro Kategorie: neue Patterns aus Mining die NICHT cross-source confirmed in §1 sind. Mapping auf bestehende Kategorien A-X; neue Sub-Kategorien (Y, Z) wo nötig.

#### Kategorie A — Strukturelle Validität & OAS-Konformität — Additions from mining

| New ID | Pattern | Source | Severity | Notes/Detection-feasibility |
|---|---|---|---|---|
| A-MIN-1 | `pattern`-Regex ohne `^…$`-Anchors → kann partial-match | [MIN-2 IBM `ibm-anchored-patterns`] | warn | Cousin von A6; Spectral-Rule (regex on schema.pattern). |
| A-MIN-2 | Konflikt: `minimum` + `exclusiveMinimum` (oder max-Variante) gleichzeitig | [MIN-3 Redocly `no-mixed-number-range-constraints`] | error | OAS-3.1-spezifisch. Nur in 3.1-pfad. |
| A-MIN-3 | `nullable: true` ohne `type` (OAS 3.0 invalid) | [MIN-4 Redocly `nullable-type-sibling`] | error | Sub-case von A9/A10. |
| A-MIN-4 | Konsekutive Path-Parameter-Segments (`/foos/{x}/{y}` ohne Separator-Segment) | [MIN-6 IBM `ibm-no-consecutive-path-parameter-segments`] | error | Niemand sonst hat das — IBM-USP. Runtime-Ambiguity. |
| A-MIN-5 | Ambiguous paths cross-template (`/foo/{a}` vs `/foo/{b}`) | [MIN-7 Vacuum + Redocly] | error | Routing-Disambiguation. |
| A-MIN-6 | Duplicate path-keys (string-equal multiple-deklariert) | [MIN-8 Vacuum `duplicate-paths`] | error | OAS-Violation. |
| A-MIN-7 | `path-item-refs` — `$ref` direkt auf path-item-Ebene | [MIN-9 Vacuum] | warn | Smell (statt in operation referenziert). |
| A-MIN-8 | `allOf`-Subschemas mit konfliktbehafteten Constraints (`type: string` + `type: integer`) | [MIN-10 Vacuum `allof-conflicts`] | error | Deeper als A12. |
| A-MIN-9 | Schema ohne `type`-Feld (Codegen-undefined-behavior) | [MIN-11 Vacuum `oas-missing-type`, IBM `ibm-schema-type` off-default] | warn | Generalisiert A8. |
| A-MIN-10 | `discriminator.propertyName` muss schema-Member sein (nicht nur exists) | [MIN-12 IBM `ibm-discriminator-property`] | error | Strenger als A4. |
| A-MIN-11 | `type`+`format`-Combinations validieren (`type: string, format: int32` = nonsense) | [MIN-19 IBM `ibm-schema-type-format`] | error | Erweitert A7. |
| A-MIN-12 | enum-Werte konform zum Schema-Type (`type: integer` mit string-enum-werten) | [MIN-20 Vacuum `typed-enum`] | error | spectral:oas hat das — verifizieren. |
| A-MIN-13 | `nullable: true` + enum muss `null` enthalten | [MIN-21 Vacuum `nullable-enum-contains-null`] | warn | Cousin von A9. |
| A-MIN-14 | `unevaluatedProperties` enabled in 3.0-spec smell | [MIN-OWASP-13 SP-G-OWASP-13] | warn | OAS 3.1-only. Format-conditional. |
| A-MIN-15 | `patternProperties`-Restrictions (3.1-only) | [MIN-IBM `ibm-pattern-properties`] | hint | OAS 3.1-only. |
| A-MIN-16 | OAS-3.1 `type: [x, y]` mit > 1 non-null-type → Ambiguity | [MIN-IBM `ibm-avoid-multiple-types`] | warn | Sub-case von A10. |
| A-SP-1 | Schema-Strict-JSON-Schema-Compilation (Vacuum macht's als Spectral-Rule, apiq-AJV-Layer-Job) | [SP-Vacuum `oas-schema-check`] | error | Bereits in apiq's AJV-Layer-Konzept (siehe §1). |
| A-SP-2 | Spec-Strict-Refs — `$ref`-targets müssen exakt korrekt strukturiert sein | [SP-Redocly `spec-strict-refs`] | error | Apiq A1 erweitert. |
| A-SP-3 | components.*-keys müssen valid identifier-names sein | [MIN-49 Redocly `spec-components-invalid-map-name`] | warn | Codegen-Risk. |
| A-SP-4 | examples-map keys mit spaces (`ibm-no-space-in-example-name`) | [MIN-47 IBM] | warn | Component-Naming-Hygiene. |

#### Kategorie B — HTTP-Method-Semantik — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| B-SP-1 | PUT MUST have `requestBody` | [SP-G-AYWH-7 Adidas `adidas-oas3-put-with-request-body`] | warn | Apiq missing. |
| B-SP-2 | OPTIONS MUST NOT have `requestBody` | [SP-G-AYWH-8 SPS `sps-request-options-invalid-body`] | warn | Apiq missing. |
| B-SP-3 | HEAD MUST NOT have requestBody UND no response-body | [SP-G-AYWH-9 SPS `sps-request-head-invalid-body`+`sps-response-head-invalid-body`] | warn | Apiq B2 covers partial. |
| B-SP-4 | Every requestBody should support `application/json` (nicht nur form-encoded/XML) | [SP-G-AYWH-10], [SG-9], [SP-Adidas + SPS `sps-request-support-json`] | warn | apiq-post-should-accept-json broaden auf alle body-methods. |
| B-SP-5 | DELETE-Operation should return 202 oder 204 (nicht 200) | [SP-G-AZ-5 Azure `az-delete-response-codes`] | warn | Apiq B4 covers. |
| B-SP-6 | 204-Response should have NO response body | [SP-G-AZ-6 Azure `az-204-no-response-body`] | warn | Apiq missing. |
| B-SP-7 | requestBody-Schema MUST NOT be bare array | [SP-G-AZ-16] | warn | (siehe §1 cross-source). |
| B-SP-8 | response-Schema MUST NOT be bare array | [SP-G-AZ-17] | warn | (siehe §1 cross-source). |
| B-SP-9 | Custom HTTP-method enumeration: only standard methods allowed | [SP-G-SPS-1 `sps-invalid-http-method`] | error | spectral:oas catches via OAS-Schema. Verify redundancy. |
| B-MIN-1 | non-form requestBody schema muss `type: object` sein | [MIN-IBM `ibm-requestbody-is-object`] | warn | |
| B-MIN-2 | requestBody optional → properties dürfen nicht required sein | [MIN-IBM `ibm-no-required-properties-in-optional-body`] | warn | |
| B-MIN-3 | JSON-merge-patch req-body kein `required`-Feld | [MIN-IBM `ibm-dont-require-merge-patch-properties`] | warn | RFC-7396. |

#### Kategorie C — Status-Code-Coverage — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| C-SP-1 | All response 2xx/4xx should declare RateLimit headers | [SP-G-OWASP-14], [DigitalOcean `ratelimit-headers`], [Team-D `missing-ratelimit`] | warn | Walker (statistical %). U-15: many APIs nur 429 — vorsichtig. |
| C-SP-2 | Spec sollte mind. eine 429-Response definieren (rate-limit-awareness) | [SP-G-OWASP-16 Vacuum `owasp-define-error-responses-429`] | warn | M (op-level). |
| C-SP-3 | All success responses (≠204) sollten response-body definieren | [SP-G-AZ-23 Azure `az-success-response-body`] | warn | Apiq missing. |
| C-SP-4 | 500/default response coverage formalisieren | [SP-G-OWASP-28], [Azure `az-default-response`], [SPS `sps-missing-500-response`], [Zalando `must-specify-default-response`] | warn | Apiq C7 covers — als formelle Rule. |
| C-SP-5 | Operations mit `requestBody` → 400 ODER 422 declared | [SP-G-OWASP-26], [Vacuum `owasp-define-error-validation`], [MIN-40] | warn | Apiq C3 — als formelle Rule. |
| C-SP-6 | Operations mit security → 401 declared | [SP-G-OWASP-27], [Vacuum `owasp-define-error-responses-401`] | warn | Apiq C5 — formalisieren. |
| C-SP-7 | `Location`-Header MUST NOT auf non-201-Responses appearing | [SP-G-SPS-15 `sps-invalid-location-header`] | warn | Apiq missing. |
| C-MIN-1 | ETag response-header bei If-Match/If-None-Match-param vorhanden | [MIN-28 IBM `ibm-etag-header`], [SG-32], [SG-33] | warn | Cache-Validator-Pair. Companion zu C10. |
| C-MIN-2 | 412-Response → mind. 1 von If-Match/If-None-Match/If-Modified-Since/If-Unmodified-Since als param | [MIN-29 IBM `ibm-precondition-headers`], [SG-32] | warn | Status-Code/Header-Pair. |
| C-MIN-3 | 3xx-Redirect-Response-Body checks (config-driven status-code-Logik) | [MIN-IBM `ibm-redirect-response-body`] | hint | Edge-case. |
| C-SP-8 | RFC 7807 problem-details für 4xx-responses | [SP-G-AYWH-11], [SG-16], [Redocly `operation-4xx-problem-details-rfc7807`] | warn | (siehe §1). |
| C-SP-9 | `response-contains-header` config-driven (z.B. 304 → ETag) | [SP-Redocly `response-contains-header`] | warn | Apiq C10 covers; erweitern config-driven. |
| C-SP-10 | `response-contains-property` — Response-Schemas müssen bestimmte properties haben | [SP-Redocly `response-contains-property`] | warn | Config-driven. |

#### Kategorie D — Response-Body-Konsistenz — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| D-MIN-1 | array-Properties in Response sollten required sein (Empty-array vs missing-property Disambiguation) | [MIN-IBM `ibm-required-array-properties-in-response`] | hint | Niche aber semantisch wichtig. Suggestive-only. |
| D-MIN-2 | enum-Properties in Response sollten required sein | [MIN-IBM `ibm-required-enum-properties-in-response`] | hint | Companion zu obigem. |
| D-MIN-3 | Resource-Response-Konsistenz: POST/PUT/PATCH-response-Schema = GET-response-Schema für gleiche Resource | [MIN-35 IBM `ibm-resource-response-consistency`] | hint | DETERMINISTISCH cross-op-Vergleich. Mächtig. Module §5/§9. |
| D-MIN-4 | top-level array-Response (codegen-Issue auf manchen Sprachen) | [MIN-31 IBM `ibm-no-array-responses`] | hint | (siehe §1 bare-array). |
| D-MIN-5 | array-of-array (`array<array<X>>`) smell | [MIN-32 IBM `ibm-no-array-of-arrays`] | hint | |
| D-MIN-6 | error-responses sollten `application/json` supporten | [MIN-45 IBM `ibm-error-content-type-is-json`] | hint | |

#### Kategorie E — Pagination-Conventions — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| E-SG-1 | Pagination-Response truncation-indicator: `next_page_token`/`nextLink`/`Link: rel=next`/`Content-Range` auf List-shaped-Endpoints | [SG-15], Microsoft `#collections-include-nextlink-for-more-results`, RFC 8288, JSON:API §pagination, Google AIP-158 | hint | Apiq E5. List-vs-detail-Klassifikator-Erweiterung. |

#### Kategorie F — Authentication & Security — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| F-SP-1 | OAuth2-Flows: tokenUrl muss HTTPS-only sein | [SP-G-OWASP-6], [Team-D `securitySchemes-oauth-http`] | error | Apiq F5 covers presence; HTTPS-only schärfer. |
| F-SP-2 | OAuth2-Scheme should declare `refreshUrl` (token-rotation) | [SP-G-OWASP-7 `owasp:api2:2023-short-lived-access-tokens`] | warn | Niche. |
| F-SP-3 | OAuth2: `implicit` + `password` flows forbidden (RFC 6749 deprecated) | [SP-G-OWASP-8 Team-D `securitySchemes-oauth-allowed-flows`] | error | Apiq missing. |
| F-SP-4 | JWT bearerFormat: description sollte RFC 8725 mention (algo-confusion mitigation) | [SP-G-OWASP-9], [Team-D `securitySchemes-jwt`] | warn | Niche-but-high-value. |
| F-SP-5 | Auth-Schemes "negotiate" / OAuth1 flagged as outdated | [SP-G-OWASP-5 `owasp:api2:2023-auth-insecure-schemes`] | warn | Light value. |
| F-SP-6 | Write-Operations (POST/PUT/PATCH/DELETE) MUST be protected by `security` | [SP-G-OWASP-10], [Team-D `security-protection-non-idempotent`] | warn | Apiq F2 partial. Module-Function (op-aware). |
| F-SP-7 | Spec-level `security` should have ≥1 requirement (nicht empty array unless intentional public) | [SP-G-AZ-22 `az-security-min-length`] | warn | Apiq F1 partial. |

#### Kategorie G — Naming-Konsistenz — Additions from mining

(Cross-source consensus auf Walker-Approach — siehe §5 Opinion-Divides)

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| G-MIN-1 | Configurable casing-conventions per Identifier-Klasse (operationId, properties, parameters, enums, schemas, path-segments) — 7 Rules IBM-Style | [MIN-IBM 7 casing-rules + thim81/openapi-format] | warn | Modell für apiq's Naming-Pattern-Klassifikator §8. Beides anbieten: configurable + dynamic. |
| G-SP-1 | Schema-Property-Names camelCase (Microsoft-Konvention) | [SP-G-AZ-28], [Adidas `adidas-properties-camelCase-alphanumeric`], [SPS `sps-camel-case-properties`] | warn | Walker (apiq G1). Conflict: Zalando-snake. **Statistical, NICHT enforced.** |
| G-SP-2 | Schema-Names PascalCase | [SP-G-AZ-27], [Red-Hat `rhoas-schema-name-pascal-case`], [SPS `sps-schema-names-pascal-case`+`sps-response-names-pascal-case`] | warn | Walker (apiq G2). |
| G-SP-3 | snake_case property names (controversial vs camelCase) | [SP-G-ZAL-2], [DigitalOcean `schema-key-must-be-snake-cased`], [Red-Hat `rhoas-schema-properties-snake-case`] | warn | Walker only. NICHT enforced. |
| G-SP-4 | Header-Naming hyphenated-pascal-case | [SP-G-SPS-14], [Adidas], [Zalando `should-use-hyphenated-pascal-case-for-header-parameters`], [Team-D `request-headers-pascal-case`+`response-headers-pascal-case`], [SG-45] | warn | Apiq G8. |
| G-SP-5 | Property-Type-Konsistenz cross-Schema (`user_id` ist überall integer ODER überall string) | [MIN-34 IBM `ibm-property-consistent-name-and-type`] | warn | DETERMINISTISCH (§9). Bestätigt machbar. |
| G-SP-6 | Property-Names: keine programming-language reserved keywords (java/c/c++) | [SP-G-SPS-2 `sps-no-keyword-conflicts`] | warn | Codegen-load-bearing. |
| G-SP-7 | Property-Names: keine preposition-prefixes (`for`, `during`, `at`, `from`...) | [SP-G-SPS-3 `sps-disallowed-prepositions`] | hint | Opinionated. |
| G-SP-8 | operationId only URL-friendly characters | [SP-G-SD-5 Stoplight-Docs `docs-operationId-valid-in-url`], [Vacuum `operation-operationId-valid-in-url`] | error | Apiq missing. |

#### Kategorie H — Versioning-Conventions — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| H-SP-1 | Single API version per spec (one server-version) | [SP-G-URL-1 `one-api-version-per-document`] | error | Apiq H1 covers. |
| H-SP-2 | Server-URL-Versions: major-only (no `/v1.2`) | [SP-G-URL-2 `only-major-api-versions`] | warn | Apiq missing. |
| H-SP-3 | `info.version`: date-based YYYY-MM-DD oder semver | [SP-G-AZ-25], [SG-25], [Adidas], [SPS `sps-semver`], [Team-D `use-semver`], [Zalando `must-use-semantic-versioning`] | warn | Apiq H2. |

#### Kategorie I — Date/Time-Conventions — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| I-SG-1 | Date-Time properties named `*_at`/`*_time`/`created`/`updated`/`timestamp` → `format: date-time` (RFC 3339); `*_date` → `format: date` | [SG-18], [Zalando #126], [Microsoft `#json-date-time-is-rfc3339`], [Google AIP-142], [MIN-IBM `ibm-use-date-based-format`] | warn | Apiq I1/I2 covers — broaden naming pattern. |
| I-SG-2 | Date-Time examples must end with `Z` (UTC) | [SP-G-ZAL-4 `must-use-standard-formats-for-date-and-time-properties-utc`] | hint | Apiq I3. |
| I-SG-3 | Duration encoding: ISO-8601 OR fixed-unit-name (`*_seconds`/`*_minutes`/`*_ms`) — NOT bare integer | [SG-19], [Microsoft `#json-durations-use-fixed-time-intervals`], [Zalando #125] | hint | Apiq missing. Heur (prop-name keyword: `duration`, `interval`, `timeout`, `ttl`). |

#### Kategorie J — ID-Conventions — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| J-SG-1 | UUID `format`: `*_id`/`*_uuid`/`id` (where docs say UUIDs) → `format: uuid` | [SG-20], [Microsoft `#json-uuid-is-rfc4412`], [Heroku], [Zalando #171] | hint | Apiq J2 erweitert (FK-rule deckt schon partiell). |
| J-SG-2 | 64-bit integers should be string-encoded (`format: int64`) — JS-Number-Präzisionsverlust >2^53 | [SG-24], [Google AIP], [Zalando #168 `bigint`-MUST], Stripe-convention | hint | Controversial. |
| J-SG-3 | Country-code `iso-3166-alpha-2` für `country`/`country_code` | [SG-22], [Zalando #170] | hint | Niche. |
| J-SG-4 | Language-code BCP-47 für `language`/`locale`/`lang` | [SG-23], [Zalando #172] | hint | Niche. |
| J-SG-5 | Money/amount + currency sibling: `amount`/`price`/`cost`/`*_amount` benötigen `currency`-Sibling als ISO-4217 (3-letter) | [SG-21], [Zalando #173 MUST iso-4217], PayPal | hint | Niche aber high-trust signal. |

#### Kategorie K — Error-Response-Conventions — Additions from mining

(siehe §1 für problem+json cross-source — höchst-priorisiert)

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| K-SP-1 | error-Schemas konventionell strukturiert (mind. type/code+message) | [MIN-K1 IBM `ibm-error-response-schemas`] | warn | Apiq K1 covers. |

#### Kategorie L — Request-Body-Hygiene — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| L-MIN-1 | content-entries brauchen schema | [MIN-IBM `ibm-content-contains-schema`] | warn | Apiq L4-Variante. |
| L-MIN-2 | `*/*` als content-type vermeiden | [MIN-44 IBM `ibm-content-type-is-specific`] | warn | Mediatype-Hygiene. |
| L-SP-1 | MIME-Types nur `application/json` / `problem+json` / `vnd.*` (allowlist-driven) | [SP-G-SPS-22 `sps-invalid-mime-type`] | warn | Apiq partial (markdown-rule). |
| L-SP-2 | PATCH-Operations MUST use `application/json-patch+json` ODER `application/merge-patch+json` (RFC errata 3169) — flag bare `application/json` PATCH | [SP-G-TD-4 Team-D `patch-media-type`], [Azure `az-patch-content-type`], [SG-34], [MIN-30 IBM `ibm-patch-request-content-type`] | warn | Multi-Source. **Load-bearing für patch-correctness.** Apiq missing. |

#### Kategorie M — Schema-Hygiene — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| M-SP-1 | Schema sollte `type` AND `format` declarieren (well-defined) | [SP-G-AZ-19 Azure `az-schema-type-and-format`], [DigitalOcean `schema-properties-must-have-type`], [VTex `array-items`] | warn | Apiq missing — strongly endorsed. |
| M-SP-2 | All schema-properties sollten defined type haben (`type` ODER `$ref`/`allOf`/`oneOf`/`anyOf`) | [SP-G-AZ-20 Azure `az-property-type`], [DigitalOcean `schema-properties-must-have-type`] | warn | Apiq missing. |
| M-SP-3 | Schema-Property `readOnly: true` sollte nicht in request-Schemas appearing | [SP-G-AZ-24 Azure `az-readonly-in-response-schema` mirror] | hint | Apiq missing. |
| M-SP-4 | All Schemas sollten description ODER title haben | [SP-G-AZ-18], [VTex `no-empty-titles`] | warn | Apiq M1 Walker-statistical; per-schema schärfer. |
| M-SP-5 | array-properties / -parameters MUST have `items` mit `type` | [SP-G-DO-4], [DigitalOcean `array-properties-must-have-items-with-type`+`array-params-must-have-items-with-type`], [VTex `array-items`+`request-body-items-type`+`response-body-items-type`] | warn | 4 Sources confirm. Apiq missing. |
| M-SP-6 | array-schemas MUST have `maxItems` (DoS) | [SP-G-OWASP-17], [Team-D `array-boundaries`], [MIN-14], [IBM `ibm-array-attributes`] | warn | Multi-Linter-Konsens. |
| M-SP-7 | Strings MUST have one of `maxLength`/`enum`/`const` (DoS+Injection) | [SP-G-OWASP-18], [Team-D `string-maxlength`+`string-pattern-or-format-or-enum`], [MIN-18 OWASP `string-restricted`] | warn | Apiq M9 Walker; per-property als error fehlt. |
| M-SP-8 | Strings sollten auch one of `format`/`pattern`/`enum`/`const` (open-string-injection-risk) | [SP-G-OWASP-19] | hint | Apiq missing. |
| M-SP-9 | Integers MUST `format: int32` ODER `int64` (interop) | [SP-G-OWASP-21], [Team-D `integer-format`+`allowed-integer-format`], [Zalando `must-define-a-format-for-integer-types`], [MIN-15] | warn | Multi-Source. |
| M-SP-10 | Numbers MUST format declared (decimal32/64, float, double) | [SP-G-OWASP-22 Team-D `number-format`+`allowed-number-format`], [Zalando `must-define-a-format-for-number-types`] | hint | |
| M-SP-11 | URL-handling parameters (`*_url`/`callback`/`redirect`) flagged für SSRF | [SP-G-OWASP-23 `owasp:api7:2023-concerning-url-parameter`] | hint | Apiq missing. |
| M-SP-12 | All response-objects sollten CORS `Access-Control-Allow-Origin` declarieren | [SP-G-OWASP-24] | hint | Recommended off-by-default. |
| M-SP-13 | `additionalProperties: type: object` ohne `properties` (common error) | [SP-G-AZ-2] | hint | Niche. |
| M-SP-14 | Required Schema-Property MUST NOT have `default` | [SP-G-AZ-10] | warn | Erweitert apiq T2 (Param) auf Schema-Property. |
| M-SP-15 | enum-Wert-Casing-Konsistenz (alle UPPER_SNAKE oder alle camelCase) — innerhalb einer enum | [SG-37], [Zalando #240], [PayPal] | warn | Apiq M12. |
| M-SP-16 | inline-Object-schemas in requestBody/response/properties → reuse-via-$ref-prefer | [MIN-IBM `ibm-avoid-inline-schemas`] | hint | Apiq M6. |
| M-SP-17 | `additionalProperties: {…}` muss konsistent typed sein (well-defined-dictionaries) | [MIN-IBM `ibm-well-defined-dictionaries`] | hint | |
| M-MIN-1 | `$ref` innerhalb `example`-Werten verboten | [MIN-46 IBM `ibm-no-ref-in-example`] | warn | OAS-spec-violation. |
| M-MIN-2 | example mit `value` UND `externalValue` simultaneously | [MIN-48 Redocly `no-example-value-and-externalValue`] | error | Mutually-exclusive. |
| M-MIN-3 | example-values gegen ihr Schema validieren (deeper als spectral) | [SP-Redocly `spec-example-values`] | warn | AJV-Layer-Job. |
| M-MIN-4 | `discriminator`-default-mapping where needed | [SP-Redocly `spec-discriminator-defaultMapping`] | hint | Discriminator-completeness. |
| M-MIN-5 | `readOnly`/`writeOnly` mirror checks | (siehe M-SP-3 readOnly) | hint | |
| M-MIN-6 | JSON-Schema-Allow-list erlaubter Keywords (defensive) | [MIN-IBM `ibm-schema-keywords`] | hint | Defensive. |

#### Kategorie N — Examples-Hygiene — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| N-SP-1 | Object-property nested object should have examples | [SP-G-DO-1], [Adidas `adidas-oas3-real-like-examples`], [Zalando `must-use-standard-formats-for-date-and-time-properties-example`] | hint | Apiq N3 broaden. |
| N-SP-2 | Parameters should have `example` ODER `examples` (oder schema-derived) | [SP-G-DO-2], [Stoplight-Docs `docs-parameter-examples-or-schema`] | warn | Apiq missing. |
| N-SP-3 | Headers should have `example` ODER `examples` | [SP-G-DO-3] | hint | Apiq missing. |
| N-SP-4 | scalar-property-missing-example | [SP-Redocly `scalar-property-missing-example`] | hint | |
| N-VTEX-1 | Response-body-fields sollten kein `example` (schema-level only) | [SP-G-VTEX-5 `response-body-objects-arrays-example`] | hint | Opinionated. |
| N-VTEX-2 | Request-body example parallel zum schema (siblings, not nested) | [SP-G-VTEX-6 `request-example-parallel-to-schema`] | hint | Opinionated. |
| N-MIN-1 | examples gegen schema validieren (deeper als spectral:oas3-valid-schema-example) | [MIN-IBM `ibm-valid-schema-example`] | warn | AJV-Layer. |

#### Kategorie O — Component-Hygiene — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| O-VTEX-1 | Components dürfen keine chained `$ref`s enthalten (`$ref` → `$ref` → schema) | [SP-G-VTEX-7], [DM-11 `noChainedRefsInComponents`] | warn | Graph-Mechanic. Apiq missing. |
| O-SP-1 | components.* (jenseits schemas) brauchen description | [SP-Vacuum `component-description`] | hint | Apiq O1 erweitert. |

#### Kategorie P — Servers/URLs — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| P-SP-1 | Server-URL nicht `example.com` (placeholder smell) | [SP-G-SD-4 Stoplight-Docs `docs-api-host-not-example`+`docs-api-server-not-example.com`], [Redocly `no-server-example.com`] | warn | Apiq hat localhost-rule — example.com hinzufügen. |
| P-SP-2 | Server-URL: must NOT specify port (außer localhost) | [SP-G-SPS-11 `sps-hosts-no-port`] | error | Production-Hygiene. |
| P-SP-3 | Server-URL: must be lowercase | [SP-G-SPS-12 `sps-hosts-lowercase`] | warn | |
| P-SP-4 | Server-Object MUST have `description` | [SP-G-TD-5 Team-D + Adidas] | error | Apiq P2. |
| P-SP-5 | Servers `[]` ist nutzlos | [SP-Redocly `no-empty-servers`] | warn | |
| P-SP-6 | `{var}` in URL ohne Variables-Definition | [SP-Redocly `no-undefined-server-variable`] | error | |
| P-SP-7 | Server-Variables `default` + `description` | [SP-Redocly `no-server-variables-empty-enum`+IBM `ibm-server-variable-default-value`] | warn | Apiq P2. |
| P-SP-8 | Server-Trailing-Slash | [SP-Redocly `no-server-trailing-slash`+spectral:oas `oas3-server-trailing-slash`] | warn | bereits via spectral. |

#### Kategorie Q — Tag-Hygiene — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| Q-SP-1 | Tag-Names duplicate (`no-duplicated-tag-names`) | [SP-Redocly `no-duplicated-tag-names`] | error | |
| Q-SP-2 | Operation singular-tag (höchstens 1 tag pro op — Doc-Portal-Konsistenz) | [SP-Redocly `operation-singular-tag`] | hint | Opinionated. |
| Q-SP-3 | All declared tags müssen in mind. einer operation referenced sein (orphan-tag) | [MIN-IBM `ibm-openapi-tags-used`] | warn | |
| Q-SP-4 | Tag-Hierarchie via `x-displayName` parent-references valid | [SP-Redocly `spec-no-invalid-tag-parents`] | hint | |
| Q-SP-5 | Tags sentence-case (oder product-allowlist) | [SP-G-VTEX-8 `tags-should-be-in-sentence-case`] | hint | Apiq G7-Walker. |

#### Kategorie R — Operation-Hygiene — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| R-SP-1 | Operation summary OR description (one of) | [SP-G-AZ-8 Azure `az-operation-summary-or-description`+VTex `must-include-operation-summary`] | warn | spectral:oas covers description; tighter. |
| R-SP-2 | Operation summaries: sentence-case, no period | [SP-G-VTEX-9 `summaries-should-be-in-sentence-case`] | hint | Apiq R1. |
| R-SP-3 | Operation summary length max 80 chars | [MIN-IBM `ibm-operation-summary-length`] | hint | Apiq R1-Variante. |
| R-SP-4 | Status-Code-Description sentence-case | [SP-G-VTEX-11 `status-code-descriptions-format`] | hint | |
| R-SP-5 | OperationId verb-prefix-Heuristik (ibm-operationid-naming-convention) | [MIN-IBM] | hint | Apiq B8. |
| R-MIN-1 | required-Params vor optional-Params (Reihenfolge — SDK-ergonomics) | [MIN-27 IBM `ibm-parameter-order`] | hint | |

#### Kategorie S — Path-Conventions — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| S-SP-1 | Path: empty segments (`//`) verboten | [SP-G-SPS-5 `sps-paths-empty-segments`+Zalando] | error | Apiq missing. |
| S-SP-2 | Path: limit ≤3 dynamic path-parameters | [SP-G-SPS-6 `sps-paths-limit-path-parameters`] | warn | |
| S-SP-3 | Path: limit sub-resources auf ≤8 levels | [SP-G-SPS-7+Zalando `should-limit-number-of-sub-resource-levels`] | warn | Apiq S2. |
| S-SP-4 | Path-encoding-environment-Names verboten (`/prod`, `/dev`) | [SP-G-SPS-10 `sps-path-no-environment`] | error | Apiq missing. |
| S-SP-5 | Path: Total-Length ≤100-200 chars | [SP-G-SPS-20 `sps-limit-path-size`] | warn | |
| S-SP-6 | Path: file-extensions verboten (`.json`/`.xml`/`.html`/`.txt`) | [SP-G-AYWH-14], [SG-5], [SPS `sps-paths-expose-extension`+`sps-no-resource-extensions`+`sps-paths-expose-technology`] | error | Apiq missing. |
| S-SP-7 | Path: Query-Strings (`?`) verboten — müssen parameters sein | [SP-G-SPS-17 `sps-query-params-not-in-path`] | warn | |
| S-SP-8 | Path: must not start with `/api` (over-namespacing) | [SP-Zalando `should-not-use-api-as-base-path`] | hint | Opinionated. |
| S-SP-9 | Path: only allowed chars `0-9 A-Z a-z - . _ ~ :` | [SP-G-AZ-26 Azure `az-path-characters`] | hint | RFC 3986. |
| S-SP-10 | path-segment-plural für Resources | [SP-Redocly `path-segment-plural`] | hint | Apiq G5. |
| S-SP-11 | path-http-verbs-order (Sortier-Konvention für GET/POST/etc) | [SP-Redocly `path-http-verbs-order`] | hint | Doc-Konsistenz. |
| S-MIN-1 | Vacuum-USP: paths-specificity-order — spezifischere Pfade vor weniger spezifischen | [MIN-5 Vacuum] | warn | Routing-Disambiguation. Niemand sonst. |
| S-MIN-2 | gleicher path-param auf mehreren operations statt path-Level | [MIN-IBM `ibm-avoid-repeating-path-parameters`] | hint | |
| S-SP-12 | path-param-references valid INNERHALB der Segments (z.B. `/foo{id}` statt `/foo/{id}`) | [MIN-IBM `ibm-valid-path-segments`] | error | |

#### Kategorie T — Parameter-Hygiene — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| T-SP-1 | Path-parameter schema: `type: string` + `maxLength` + `pattern` | [SP-G-AZ-13 Azure `az-path-parameter-schema`] | hint | Apiq T7 partial. |
| T-SP-2 | Path-parameters in operation must match path-template-Reihenfolge | [SP-G-AZ-14 Azure `az-parameter-order`] | warn | DM-6. |
| T-SP-3 | Operation-parameter names case-insensitive unique | [SP-G-AZ-15 Azure `az-parameter-names-unique`] | warn | DM-7. |
| T-SP-4 | Query-Parameters MUST NOT be `required: true` (opinionated) | [SP-G-SPS-16 `sps-query-params-not-required`] | warn | Off-by-default. |
| T-SP-5 | param hat schema XOR content (nicht beide) | [MIN-25 IBM `ibm-parameter-schema-or-content`] | error | OAS-Conformance. |
| T-SP-6 | operation-params namens-unique gegenüber requestBody-properties | [MIN-26 IBM `ibm-unique-parameter-request-property-names`] | warn | SDK-collision-Risk. |
| T-SP-7 | Status-Codes restricted to common allowlist (RFC 2616 + common) | [SP-G-SPS-18+Zalando `must-use-standard-http-status-codes`] | warn | Apiq missing. |
| T-SP-8 | Status-Code allowlist per HTTP-Method (Zalando well-understood-codes) | [SP-G-SPS-19] | warn | Apiq C8 erweitert. DM-1. |
| T-SP-9 | Sensitive Header-Names rejected (`Password`, `Token`-named headers) | [SP-G-SPS-13 `sps-sensitive-data-in-headers`] | error | Security-Hygiene. |
| T-SP-10 | Headers `Authorization`/`Content-Type`/`Accept` MUST NOT be declared explicitly als params | [SP-G-AZ-7], [Team-D `no-forbidden-headers`], [SPS `sps-no-explicit-headers`], [SG-46], [MIN-IBM tri] | warn | Apiq T4 partial — Authorization+Accept hinzufügen. |
| T-SP-11 | Required Schema-Property no default | [SP-G-AZ-10] | warn | (siehe M-SP-14) |

#### Kategorie U — Webhooks — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| U-SP-1 | Webhook-Endpoints unter conventional prefix (`/_webhooks/...` / `webhooks` OAS3.1) | [SP-G-SPS-21 `sps-webhooks-path`] | hint | Apiq U2. |

#### Kategorie V — externalDocs — Additions from mining

(no new patterns from mining — V1/V2 stay as-is)

#### Kategorie W — Cross-Cutting Statistical Patterns — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| W-MIN-1 | description-duplication cross-spec (Hash-basiert auf Descriptions) | [MIN-41 Vacuum `description-duplication`] | hint | Cousin von M7-Schema-Hash. Apiq-USP-Erweiterung. |
| W-MIN-2 | Common-Path-Prefix Extraktion-Suggestion (alle paths starten mit `/api/v1/`) | [MIN-43 Zally H001] | hint | Refactor-Empfehlung. Niemand sonst hat's. |
| W-SP-1 | Description-Length-Distribution + Outlier-Findings | apiq §7 Statistical Aggregation-Layer | hint | |

#### Kategorie X — OpenAPI 3.0 vs 3.1 Spezifika — Additions from mining

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| X-SP-1 | OAS 3.1: `unevaluatedProperties: false` constrained (DoS) | [SP-G-OWASP-13] | warn | OAS 3.1-only. |
| X-MIN-1 | OAS-3.1-only-keywords (`unevaluatedProperties`/`patternProperties`/`type-array`) in OAS-3.0-Specs | [MIN-IBM `ibm-no-unsupported-keywords`] | error | Format-Conditional-Rule. |
| X-MIN-2 | `nullable: true` ohne `type` (3.0 invalid) | [MIN-4] | error | (= A-MIN-3). |
| X-MIN-3 | OpenAPI version ≥3.0 (no swagger-2) | [SP-G-TD-3 Team-D `no-swagger-2`+Red-Hat `rhoas-oas3minimum`] | error | Apiq is OAS3-only by ingestion. Document. |

#### Kategorie Y — Security-Hardening (NEU — OWASP-class)

OWASP-class rules die nicht in F passen weil F = "Authentication". Y = breitere Hardening (DoS, SSRF, Injection, etc.).

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| Y-1 | Numeric-IDs in path-params (Enumeration-Risk) — UUID/random preferred | [SP-G-OWASP-1], [SG-13], [SP-AYWH `no-numeric-ids`+SPS `sps-no-numeric-ids`+MIN-36] | warn | Multi-Source. Off-by-default empfohlen. |
| Y-2 | API-Keys in URL forbidden | (siehe §1) | error | |
| Y-3 | Credentials in URL parameter names verboten (`password`/`secret`/`token`/`api[-_]?key`) | [SP-G-OWASP-4] | error | |
| Y-4 | HTTP-Basic-Auth | (siehe §1) | error | |
| Y-5 | OAuth2: `tokenUrl` HTTPS-only | (siehe F-SP-1) | error | |
| Y-6 | OAuth2: `refreshUrl` recommended | (siehe F-SP-2) | warn | |
| Y-7 | OAuth2: `implicit`+`password` flows forbidden | (siehe F-SP-3) | error | |
| Y-8 | JWT bearerFormat: RFC 8725 mention | (siehe F-SP-4) | warn | |
| Y-9 | Auth-Schemes outdated (negotiate, OAuth1) | (siehe F-SP-5) | warn | |
| Y-10 | `additionalProperties: false` (mass-assignment-Hardening) — per-schema-rule | [SP-G-OWASP-12+OWASP `constrained-additionalProperties`+Team-D `no-additionalProperties`+`no-default-additionalProperties`+`constrained-additionalProperties`+MIN-16/17] | warn | Apiq M8 Walker; per-schema fehlt. |
| Y-11 | `unevaluatedProperties: false` (3.1 mass-assignment) | (siehe X-SP-1) | warn | |
| Y-12 | Array `maxItems` (DoS) — per-property-rule | (siehe M-SP-6) | warn | |
| Y-13 | String `maxLength`/`enum`/`const` — per-property-rule (apiq M9 Walker; rule fehlt) | (siehe M-SP-7) | warn | |
| Y-14 | Integer `minimum`+`maximum` — per-property-rule | [SP-G-OWASP-20+Team-D `number-boundaries`] | warn | Apiq M10 Walker. |
| Y-15 | URL-handling-params (`*_url`/`callback`/`redirect`) → SSRF-Review-Flag | (siehe M-SP-11) | hint | |
| Y-16 | All response-objects CORS `Access-Control-Allow-Origin` | (siehe M-SP-12) | hint | Off-by-default. |
| Y-17 | Server-URLs HTTPS-only | (siehe §1) | warn | |
| Y-18 | Sensitive Header-Names (Password/Token) rejected | (siehe T-SP-9) | error | |
| Y-19 | Path: no environment-Names (`/prod`, `/dev`) | (siehe S-SP-4) | error | |
| Y-20 | Path: no port in server-URL (außer localhost) | (siehe P-SP-2) | error | |
| Y-21 | Property-Names: no programming-keywords (Codegen-Korrektheit) | (siehe G-SP-6) | warn | |
| Y-22 | Admin-paths use distinct security-scheme (privilege-escalation-prevention) | [SP-DM-17 OWASP `differentSecuritySchemes`] | hint | Borderline-LLM (siehe Unsure U-2). |
| Y-23 | Write-Operations protected by security | (siehe F-SP-6) | warn | |
| Y-24 | Read-Operations should be security-protected | [SP-G-OWASP-11] | hint | Lower priority. |

#### Kategorie Z — Markdown / Description-Hygiene (Konsolidiert aus Mining)

| New ID | Pattern | Source | Severity | Notes |
|---|---|---|---|---|
| Z-1 | `no-eval-in-markdown` — `eval(` in description-text (XSS) | [SP-Vacuum `no-eval-in-markdown`+Spectral baseline] | warn | bereits in spectral:oas. |
| Z-2 | `no-script-tags-in-markdown` — `<script>` in description (XSS) | [SP-Vacuum + Spectral] | warn | bereits in spectral:oas. |
| Z-3 | description-duplication (copy-paste-smell) | (siehe W-MIN-1) | hint | |
| Z-4 | Description capitalization + period-end | [SP-G-SD-1 Stoplight-Docs `docs-description`+VTex `must-end-descriptions-with-period`] | hint | Apiq missing. |
| Z-5 | Description ≥20 chars | [SP-G-SD-2] | hint | Apiq stub-rule (≥10) — broaden + raise. |
| Z-6 | Descriptions must not be whitespace-only / empty | [SP-G-VTEX-3 `no-empty-descriptions`] | error | Apiq M1 Walker; per-node fehlt. |
| Z-7 | Use `email` not `e-mail` in descriptions | [SP-G-VTEX-10 `write-email-not-e-mail`] | hint | Niche. |
| Z-8 | `info.description` keyword-coverage (auth/version/pagination/bearer) | [SG-28], Heroku, Zalando #218, Microsoft | hint | Apiq has length-only — extend. |
| Z-9 | Cache-Control header description must mention `max-age`/`private`/`no-store`/`no-cache` | [SP-G-TD-1 Team-D `cache-control-parameter-undocumented`] | hint | |
| Z-10 | Cache-Control + Expires must not appear together (xor) | [SP-G-TD-2] | hint | |

---

### 3. Severity-Upgrades from mining

Mining recommendations für Severity-Anpassungen bestehender brainstorm-Items:

| Brainstorm-ID | Aktuell | Empfohlen | Quelle | Begründung |
|---|---|---|---|---|
| M14 (oneOf-discriminator, brainstorm-implicit; apiq-ruleset hat es als rule) | hint | warn | [SG-35], OAS-3 §4.7.25 MUST, Microsoft `#json-use-discriminator-for-polymorphism` DO | OAS-3 spec MUST + Microsoft DO |
| M8 (additionalProperties declaration statistical) | hint | warn (per-schema rule) | [SG-42], Microsoft `#rest-fail-for-unknown-fields` DO 400 on unknown, Zalando #225 | Microsoft "DO 400 on unknown" ist strict |
| C9 (429 → Retry-After) | warn | error (auf 429-responses) | [SG-31], [SP-G-OWASP-15] OWASP-error, Team-D | 4+ Sources alle MUST |
| K2 (RFC 7807 / problem+json) | hint | warn | [SP-G-AYWH-11], [SG-16], [Redocly], [Team-D], [Zalando] | 5+ Sources warn/MUST |
| I1 (date-time RFC 3339) | warn | warn (confirm) — keep `hint` für unix-time-on-integer | [SG-18], [Zalando #126], [Microsoft], [Google] | Multi-Source confirm-warn for naming-pattern → format-mapping |
| A4/A12/A13 (combinator hygiene) | hint | hint (keep — bestätigt) | [SP-Vacuum + IBM] | Bi-Linter-Konsens, bleibt hint |
| O2 (case-insensitive component-collisions) | warn | warn (confirm) | [Redocly + IBM + MIN-50] | Tri-Linter-Konsens |
| A3 (required-Felder in properties) | error | error (confirm) | Tri-Linter-Konsens | bestätigt |
| A11 (additionalProperties+required combinatorial) | hint | warn | [SP-G-OWASP-12+IBM `ibm-well-defined-dictionaries`] | OWASP confirms |

---

### 4. Architecture-relevant Reframes

#### Idempotency-Key (RFC-draft `httpapi-idempotency-key`)

**Vorher** (iteration 6 deletion): "Vendor-Layer Stripe-only" — explizit aus Stage A entfernt.

**Mining-Befund** ([SG-50] + [Stripe-convention] + [APIs-You-Won't-Hate]):
- IETF-Draft `draft-ietf-httpapi-idempotency-key` formalisiert das als generic HTTP-Header (NICHT mehr Stripe-only).
- 3+ Quellen behandeln es als spec-agnostic Pattern.

**Empfehlung:**
- **Reframe als generic Stage-A `hint`-Rule** auf creation-style POST-operations (POST + non-search-path → check parameters für `Idempotency-Key`-Header).
- **Severity: hint** (nicht warn — das wäre opinion-overreach; viele APIs verlassen sich auf andere Mechanismen wie request-id).
- **Apiq-Kategorie:** F (Security/Auth) ODER neu Y (Security-Hardening) — Y passt besser, da Idempotency = Hardening, nicht Auth.
- **Detection:** POST-Operation mit pfad ohne query-search-Patterns (`/users`, `/orders`, NICHT `/users/search`) → check ob `Idempotency-Key`-Parameter existiert. Domain-knowledge nicht required (RFC-draft formalisiert es).
- **NEU als Y-25** in Kategorie Y aufgenommen (siehe oben — implizit; explizit hier dokumentiert).

#### Stage A vs Phase B — Separation bestätigt

Mining bestätigt apiq's Architektur-Frame:
- Stage A = mechanic-detectable, spec-agnostic (alle Y-Rules + alle SG-1 bis SG-50 die mech sind).
- Phase B = LLM-Reasoning für LL-1 bis LL-18 + ambiguity-cases.
- Vendor-/Org-spezifische Patterns (siehe SP-V-1..V-28, SG-OS-1..OS-23, MIN-SKIP-1..SKIP-20) bleiben EXPLIZIT raus aus Stage A.

#### Status-Code-allowlist per HTTP-method (Zalando-style "well-understood codes")

Mining empfiehlt Module-Function (nicht statische Rule) für DM-1 (T-SP-8): per HTTP-method allowed status-codes auf Operation-Level prüfen. Apiq C8 ist ähnlich; Zalando ist tiefer. Empfehlung: als Module (`http-status-codes-per-method.ts`) implementieren.

---

### 5. Opinion-Divides documented for "Unsure" tracking

Diese Patterns sind durch Mining cross-source confirmed, aber sind **opinion-divided** zwischen Style-Guides — sollen NICHT als hardcoded Rules implementiert werden. Stattdessen via existing dynamic naming-classifier / statistical Walker handhaben.

| Topic | Konflikt-Quellen | Apiq-Disposition |
|---|---|---|
| **Property-Naming: camelCase vs snake_case** | camelCase: Adidas, Azure, SPS, Microsoft, Heroku — snake_case: Zalando, Google AIP-140, PayPal, Red-Hat, DigitalOcean | Walker (apiq G1). Statistical-Outlier-Detection. Hardcoded-Rule wäre opinion-overreach. |
| **URL-Versioning: in-path vs forbidden** | in-path: DigitalOcean (mandatory `/v1/`), Stripe-convention — forbidden: Zalando, AYWH, URL-Versioning, Microsoft | Walker statistical only. Mixing flag (apiq H1/S4). Keine prescriptive Rule. |
| **Boolean-Naming: is/has-prefix forbidden vs idiomatic** | forbidden: Microsoft Azure G-AZ-3, SPS — idiomatic: Java/JS-conventions | Walker (Inconsistency-flag), kein Hardcode. Off-by-default Rule für strict-mode. |
| **Status-Code-Allowlist** | Zalando-broad vs SPS-narrow vs no-allowlist | Module (T-SP-8), nicht Rule. |
| **Date-Time-Naming: `*At` suffix** | Required: Microsoft G-AZ-4 — generic: `created`/`updated` ist common | Walker statistical, off-by-default. |
| **Path: `/api`-prefix forbidden vs allowed** | forbidden: Zalando G-SPS-9 — allowed: SPS-Commerce + many APIs | Hint, off-by-default. |
| **Tags-Alphabetical** | required: Stoplight-Docs G-SD-3 — flow-ordered: many specs intentional | Off-by-default Hint. |
| **UPPER_SNAKE_CASE Enums** | required: Zalando G-ZAL-1, PayPal — many APIs lowercase/Pascal | Walker (apiq M12 Inconsistency-flag), kein Hardcode. |
| **Numeric-IDs in path-params** | forbidden: OWASP, AYWH — used: many DBs | Hint, off-by-default. |
| **64-bit ints as strings** | required: Google AIP, Zalando #168, Stripe — common: bare int64 | Hint, controversial. |

**Apiq-Disposition cross-cutting:** für ALL diese Opinion-Divides: **dynamic-Walker statt hardcoded-Rule**. Apiq's existing Naming-Pattern-Klassifikator (§8 in Andere deterministische Mechaniken) ist die richtige Architektur — aus Spec lernen + Outliers flag.

---

### 6. Deep-Mechanic Patterns Beyond Spectral DSL

Mining-Spectral §"Deep-mechanic patterns (beyond Spectral DSL)" listed 17 DM-* patterns die als Custom-Functions / Graph-Analyse / Op-aware-Logic implementiert werden müssen. Diese erweitern apiq's existing detection-modules (ref-graph, ajv, path-template-parser) — KEINE neuen Spectral-Rules.

| DM-ID | Pattern | apiq-Modul-Mapping |
|---|---|---|
| DM-1 | Custom function: HTTP-status-codes-per-method (op-aware) | Erweitert `http-method-coverage-analyse` (§5) und/oder als eigenes Modul `status-codes-per-method.ts`. |
| DM-2 | Custom function: count resource types in paths (limit ≤8) | Erweitert `path-template-parser.ts` (§4). |
| DM-3 | Custom function: is-object-schema (top-level body must be object) | AJV-Layer-Job (§1). |
| DM-4 | Custom function: is-problem-json-schema (RFC 7807 structural validation) | Eigenes Modul `problem-json-validator.ts`. Höchst-priorisiert (siehe §1 cross-source). |
| DM-5 | Custom function: header-naming RFC-compliant + RateLimit-allowlist | Erweitert Naming-Pattern-Klassifikator (§8). |
| DM-6 | Custom function: parameter-order matches path-template | Erweitert `path-template-parser.ts` (§4). |
| DM-7 | Custom function: param-names case-insensitive uniqueness | Erweitert `path-template-parser.ts` (§4) ODER eigenes `parameter-uniqueness.ts`. |
| DM-8 | Custom function: path-param schema (string + maxLength + pattern) | Erweitert `path-template-parser.ts` (§4). |
| DM-9 | Custom function: PUT request schema must equal response schema | Eigenes Modul `resource-symmetry-checker.ts` (cross-op). |
| DM-10 | Custom function: consistent-response-body GET/PUT/PATCH | Erweitert `resource-symmetry-checker.ts` ODER eigenes `cross-op-resource-consistency.ts`. |
| DM-11 | Custom function: chained-$ref-detection in components | Erweitert `$ref-Graph-Analyse` (§3). |
| DM-12 | Custom function: ensure all arrays have items with type | AJV-Layer + Spectral-Rule. |
| DM-13 | Custom function: validate operationId-naming-by-method | Erweitert Naming-Pattern-Klassifikator (§8). |
| DM-14 | Custom function: server-config matches required allowlist | **VENDOR-SKIP** (Red-Hat-specific). |
| DM-15 | Custom function: required schema-shape (Error: code+id+href+reason; List: items+kind+page+size+total) | **VENDOR-SKIP** (Red-Hat-specific). |
| DM-16 | OWASP custom function: `checkSecurity` (op-aware security-coverage check) | Erweitert F-Layer (Y-23 Module). |
| DM-17 | OWASP custom function: `differentSecuritySchemes` (admin-paths use distinct schemes) | Borderline (Y-22). Hardcoded path-heuristic ("/admin"). LLM-borderline. |

**Implementierungs-Priorisierung:**
- **P1** (high-value, tri-source-confirmed): DM-4 (problem-json-validator), DM-9/DM-10 (resource-symmetry), DM-11 (chained-refs)
- **P2**: DM-1 (status-codes-per-method), DM-6/DM-7/DM-8 (path-template-extensions)
- **P3**: DM-3, DM-5, DM-12, DM-13, DM-16
- **Skip**: DM-14, DM-15 (vendor)
- **LLM-borderline**: DM-17

---

### 7. Brainstorm-IDs cross-confirmed by mining

Übersicht der bestehenden brainstorm-Items die durch ≥1 externe Source bestätigt sind. (Vollständige Liste in den jeweiligen Mining-Docs unter "Already-in-apiq-brainstorm".)

| brainstorm-ID | Confirmed by | Severity-validation |
|---|---|---|
| A1 ($ref dangling/exists) | spectral:oas, OAS-3 spec, Redocly `no-unresolved-refs`, IBM `ibm-ref-pattern`, [SG-A1] | error confirmed |
| A2 ($ref-cycles als Finding) | IBM `ibm-no-circular-refs` | warn confirmed |
| A3 (required-Felder in properties) | Vacuum `required-fields-defined`+Redocly+IBM | **Tri-Linter-Konsens, error confirmed** |
| A4 (discriminator.propertyName Member) | OAS-3 §4.7.25, Microsoft, IBM `ibm-discriminator-property`, [SG-35] | error confirmed; severity-upgrade for M14 (siehe §3) |
| A6 (pattern valid Regex) | JSON Schema, IBM (anchored-Erweiterung) | error confirmed |
| A9/A10 (nullable vs type-array) | Redocly `nullable-type-sibling`, IBM `ibm-avoid-multiple-types` | confirmed |
| A11 (additionalProperties+required combinatorial) | OWASP, IBM `ibm-well-defined-dictionaries` | hint→warn upgrade |
| A12 (allOf 1-elem) | Vacuum `no-unnecessary-combinator`, IBM `ibm-no-superfluous-allof` | hint confirmed |
| A13 (oneOf/anyOf 1-elem) | Vacuum | hint confirmed |
| B1 (GET no requestBody) | OAS-3, AYWH, Adidas, SPS, Vacuum, IBM, [SG-10] | **6+ Sources, error confirmed** |
| B3 (POST→201+Location) | Microsoft, Zalando, [SG-29] | hint confirmed |
| B4 (DELETE→204/200) | Microsoft, Zalando, Azure G-AZ-5, SPS, [SG-30] | hint confirmed |
| B7 (DELETE no body) | Adidas, SPS G-AYWH-6, IBM, Vacuum | warn confirmed |
| B8 (operationId-verb-prefix) | IBM `ibm-operationid-naming-convention`, DigitalOcean | hint confirmed |
| C1 (mind. 2xx oder default) | spectral:oas `operation-success-response`, Redocly | error confirmed |
| C2/C3 (4xx coverage) | Vacuum, Redocly, OWASP, [SG- multiple] | warn confirmed |
| C5 (security → 401) | OWASP G-OWASP-27, Vacuum | warn confirmed |
| C7 (5xx oder default) | OWASP G-OWASP-28, Azure, SPS, Zalando | warn confirmed |
| C8 (status-code conflicts) | Zalando G-SPS-19 | warn confirmed |
| C9 (429 → Retry-After) | OWASP G-OWASP-15, Team-D, [SG-31] | **upgrade hint→warn (or error)** |
| C10 (304 needs validators) | RFC 7232, [SG-32 inverse] | warn confirmed |
| D1 (2xx-response-type-Konsistenz) | IBM `ibm-resource-response-consistency` | DETERMINISTISCH confirmed |
| D6 (problem+json) | RFC 7807, AYWH, Zalando, Microsoft, Team-D, [SG-16] | **5+ Sources, upgrade hint→warn** |
| E2/E3 (pagination naming consistent) | Zalando #137, Google AIP-158, [SG-14] | warn confirmed |
| E5 (Link-header for cursor pagination) | RFC 8288, JSON:API, [SG-15] | hint confirmed |
| F1 (securitySchemes when non-public) | AYWH, Adidas, SPS, [SG-11] | error confirmed |
| F2 (operations have security) | OWASP G-OWASP-10 | warn confirmed |
| F5 (OAuth2 flow has urls) | OWASP G-OWASP-6, Team-D | error confirmed |
| F7 (API-Key-Schemes have in+name) | OAS-3 spec | error confirmed |
| F8 (security-scheme description) | Azure G-AZ-21 | hint confirmed |
| G1/G2 (camel/snake/Pascal naming) | Zalando, Adidas, DigitalOcean, Azure, Red-Hat, SPS, IBM 7 casing-rules, Zally M010, [SG-4] | **opinion-divided — bleibt Walker, NICHT enforced rule** |
| G4 (path lowercase) | AYWH, Adidas, SPS, Zalando, Team-D, Azure, [SG-3] | **6+ Sources, warn confirmed** |
| G6 (path-param naming consistency) | Azure G-AZ-12, Zalando #143, Google AIP-122, [SG-40] | warn confirmed |
| G8 (header-naming convention) | SPS, Adidas, Zalando, Team-D, [SG-45] | warn confirmed |
| H1 (URL vs Header version-mixing) | URL-Versioning G-URL-1, Zalando, [SG-6] | warn confirmed |
| H2 (info.version semver) | Adidas, SPS, Team-D, Zalando, [SG-25] | hint confirmed (or warn) |
| I1/I2 (date-time / date format) | Zalando #126, Microsoft, Google AIP-142, [SG-18], IBM `ibm-use-date-based-format` | warn confirmed (severity-clarification §3) |
| I5 (unix-time on integer-fields) | apiq-eigenes; IBM kommt nahe mit string-date | hint confirmed |
| J2 (id-fields format/pattern) | apiq custom + Heroku, Zalando #171, Microsoft RFC4122, [SG-20] | warn confirmed |
| K1 (error schema type+message) | RFC 7807, JSON:API, Heroku, Microsoft, Team-D, IBM `ibm-error-response-schemas`, [SG-17] | **5+ Sources** |
| K2 (RFC 7807 / problem+json) | RFC 7807, AYWH, Team-D, Zalando, Microsoft, Redocly, [SG-16] | **6+ Sources, upgrade hint→warn** |
| K6 (error examples on 4xx) | DigitalOcean | hint confirmed |
| L2 (requestBody.required explicit) | Azure G-AZ-9-cousin | warn confirmed |
| M1 (schemas without description) | Stoplight-Docs, VTex, Azure G-AZ-18, IBM | warn confirmed |
| M2 (properties without description) | VTex, Azure, Stoplight-Docs, IBM | hint confirmed |
| M4 (deeply nested >3) | Microsoft `#rest-flat-is-better-than-nested` (LL-6 says opinion) | hint confirmed |
| M6 (inline-schemas reuse-able) | IBM `ibm-avoid-inline-schemas` | hint confirmed |
| M7 (duplicate schemas via canonical-form-hash) | apiq-USP — niemand sonst macht's deep | apiq-original confirmed |
| M8 (additionalProperties statistical) | OWASP, Team-D, Microsoft strict, Zalando #225, [SG-42] | **upgrade hint→warn** |
| M9 (string maxLength) | OWASP G-OWASP-18, Team-D, IBM `ibm-string-attributes` | warn confirmed |
| M10 (integer min/max) | OWASP G-OWASP-20, Team-D, IBM `ibm-integer-attributes` | hint→warn upgrade |
| M11 (enum value descriptions) | not-strongly confirmed | hint stays |
| M12 (enum casing-Inconsistency) | IBM `ibm-enum-casing-convention`, Zalando #240, PayPal, [SG-37] | warn confirmed |
| N1 (examples validate against schema) | spectral:oas `oas3-valid-media-example`, IBM, Redocly | warn confirmed |
| N3 (requestBody examples) | DigitalOcean, Adidas | hint confirmed |
| N4 (response examples) | DigitalOcean, IBM `ibm-success-response-example` | hint confirmed |
| O1 (unused components) | spectral:oas, Vacuum, Redocly, Zally S005 | hint confirmed; broaden to all 8 classes |
| O2 (case-insensitive collisions) | Redocly `component-name-unique`, IBM `ibm-avoid-property-name-collision`, MIN-50 | **Tri-Linter-Konsens, warn confirmed** |
| O3 (duplicate components hash) | Vacuum `description-duplication` (subset) | apiq-USP confirmed |
| P2 (server.variables default+description) | IBM `ibm-server-variable-default-value`, Team-D | warn confirmed |
| P3/P4 (path-template valid) | spectral:oas `path-params`, Azure G-AZ-14, IBM `ibm-valid-path-segments` | error confirmed |
| Q1 (operations w/o tags) | spectral:oas `operation-tag-defined`, SchwarzIT `path-must-specify-tags`, [SG-41] | warn confirmed |
| Q2 (top-level tags w/o description) | apiq-eigenes + spectral oas3-tag-no-empty-description | hint confirmed |
| Q3 (tag ordering) | Stoplight-Docs G-SD-3 | hint confirmed (off-by-default) |
| R1 (summary length) | VTex G-VTEX-9, IBM `ibm-operation-summary-length` (max 80) | hint confirmed |
| R7 (operationId duplikate) | spectral:oas, Vacuum, Team-D | error confirmed |
| S1 (path lowercase) | (see G4) | warn confirmed |
| S2 (path depth >5) | SPS G-SPS-7, Zalando | hint confirmed |
| S3 (trailing slash) | Spectral, Redocly, Vacuum, Zalando, SPS, Microsoft, [SG-49] | **6+ Sources, warn confirmed (gap — apiq nicht implementiert)** |
| S6 (path-param in path) | spectral:oas `path-params`, Azure G-AZ-14, IBM | error confirmed |
| S7 (Plural vs Singular) | Zalando #134, Google AIP-122, [SG-39] | hint confirmed |
| S8 (verbs in paths) | SPS, Adidas, Team-D, Vacuum, Redocly | hint confirmed (LL-1 borderline) |
| T1 (array-params style/explode) | Redocly `array-parameter-serialization` | warn confirmed |
| T2 (required param no default) | Azure G-AZ-9, IBM `ibm-no-default-for-required-parameter` | warn confirmed |
| T3 (param description short) | Azure G-AZ-11, VTex, IBM | hint confirmed |
| T4 (Standard-headers as params) | Azure G-AZ-7, SPS, Team-D, IBM tri-linter, [SG-46] | warn confirmed (broaden to Authorization+Accept) |
| T7 (path-param required:true explicit) | OAS-3 §4.8.10 | warn confirmed |
| W1-W15 (statistical walkers) | apiq-USP — bestätigt durch mehrfache Linter ohne walker-equivalent | bleibt apiq-USP |
| W6 (% strings maxLength) | (see M9) | warn confirmed |
| W7 (% integers min/max) | (see M10) | hint confirmed |
| W11 (HTML in description) | apiq-eigenes, CommonMark-spec | warn confirmed |
| X1-X5 (3.0 vs 3.1 syntax) | OAS 3.1 changelog, IBM `ibm-no-unsupported-keywords`, Redocly `nullable-type-sibling` | confirmed |

**Summary:** ~60 brainstorm-IDs sind cross-source-confirmed. Die brainstorm-Liste ist **NOT narcissistic on the detection side** — externally validated. Die meisten apiq-USPs (Walker-Statistical-Aggregation, Schema-Hash-Duplicates, Cross-Reference-Field-Konsistenz §9, FK-Heuristik, Unix-time-on-integer) sind in keiner anderen Tool-Class enthalten — bleibt apiq-Differentiator.

---

### Status — Mining-Ergänzungen

- **Konsolidiert:** 2026-05-05.
- **Net-new patterns added:** ~110 (cross-counted across 3 mining sources, dedup'd against existing brainstorm). Davon ~30 in cross-source-consensus (P1), ~80 single-source (P2-P5).
- **Severity-upgrades empfohlen:** 7 (M14, M8, C9, K2, A11, M10, plus M14-discriminator confirm).
- **Architecture-reframes:** Idempotency-Key (vendor → generic Y-25 hint), Stage A/Phase B separation confirmed.
- **Opinion-Divides documented:** 10 — alle bleiben Walker-statistical-only, NICHT hardcoded.
- **Deep-Mechanics tracked:** 17 DM-* patterns mit module-mapping.
- **Brainstorm-IDs validated:** ~60 cross-source-confirmed.
- **Implementation:** Wave 2 nach User-Review dieser Konsolidierung. Quelle für Wave-2-Tickets = §1 (P1 cross-source) + §2 single-source nach Priorität.

---

## Mining-Round-2 Master-Konsolidierung (2026-05-05)

> **Zweck.** Mining-Round-2 surfaced ~340 raw patterns across Phases A–F (Threat / Standards / Evolution / Client / Style / Meta). After de-duplication against Round-1 + cross-phase overlap removal, **~290 take-into-apiq patterns** survive. ALL go into Stage A — priority-tagging is implementation-order, not inclusion-filter. Out-of-scope / LLM-only / vendor-specific patterns stay documented in dedicated sections for delegate-traceability.
>
> **This section is append-only.** Existing Round-1 content above unchanged.

### Provenance

Mining-Round-2 phases A-F integrated:
- **Phase A — Threat-Modeling (Lens 1)** → `mining-round2-threat.md`, 54 TM-A* patterns + Lens 6 Privacy proposal.
- **Phase B — Standards-Compliance (Lens 2)** → `mining-round2-standards.md`, 105 RFC2-* patterns + Lens 7 Operations + Lens 8 Internal-Consistency proposals.
- **Phase C — Evolution-Friction (Lens 3)** → `mining-round2-evolution.md`, 62 EV-* patterns + breaking-change-class taxonomy A-Q + severity-direction-modifier.
- **Phase D — Client-Friction (Lens 4)** → `mining-round2-client.md`, 81 CL-* patterns + Lens 9 AI-Agent-Consumability proposal + per-target metadata.
- **Phase E — Style-Coherence (Lens 5)** → `mining-round2-style.md`, 25 SC-* + 17 SCF-* = 42 patterns + 9-style taxonomy + 2-stage classifier-architecture.
- **Phase F — Higher Abstraction** → `mining-round2-meta.md`, 20 F-* patterns + Lens 10 Operational-Metadata + meta-classification confirmation + 3 architectural elements.

**Source-Quality-Fix applied** (gh-api-raw verbatim sourcing, see §"Source-Quality-Fix Verbatim Verification" below):
- JSON:API 1.1 spec (`json-api/json-api` repo, gh-pages branch) — verified verbatim.
- Google AIPs (`aip-dev/google.aip.dev` repo, master branch) — verified verbatim for AIP-132.
- RFC 9110 (HTTP Semantics, replaces 7230/7231/7232/7233/7235) via `httpwg/http-core` repo — verbatim verified for 5 critical MUST-headers.
- RFC 9111 (HTTP Caching, replaces 7234) — repo accessible, sampling-only verified.

WebFetch-denied sources (HAL spec, Siren, OData, OWASP) remain WebSearch-summary-sourced; flagged as "secondary-source — verify at implementation time" in Source-Quality-Fix table.

### Source-Quality-Fix Verbatim Verification

| RFC# / Spec | Section | RFC-2119-Wording-verbatim (gh-api-raw confirmed) | apiq-pattern-impacted |
|---|---|---|---|
| **RFC 9110 §15.5.6** (405 Method Not Allowed) | §15.5.6 / §10.2.1 | "the origin server **MUST** generate an Allow header field in a 405 (Method Not Allowed) response containing a list of the target resource's currently supported methods" | RFC2-14 — 405 → Allow header (severity: error confirmed) |
| **RFC 9110 §11.6.1** (401 Unauthorized) | §11.6.1 | "A server generating a 401 (Unauthorized) response **MUST** send a WWW-Authenticate header field containing at least one challenge" | RFC2-40 + TM-A53 — 401 → WWW-Authenticate (severity: error confirmed; brainstorm C5 severity-upgrade hint→error confirmed) |
| **RFC 9110 §11.6.4** (407 Proxy Auth Required) | §11.6.4 | "A proxy **MUST** send at least one Proxy-Authenticate header field in each 407 (Proxy Authentication Required) response that it generates" | RFC2-41 — 407 → Proxy-Authenticate (severity: error confirmed) |
| **RFC 9110 §15.3.7** (206 Partial Content) | §15.3.7 | "the server generating the 206 response **MUST** generate a Content-Range header field" | RFC2-32 — 206 → Content-Range (severity: warn→error candidate) |
| **RFC 9110 §15.5.16** (426 Upgrade Required) | §15.5.16 | "The server **MUST** send an Upgrade header field in a 426 response to indicate the required protocol(s)" | RFC2-15 — 426 → Upgrade header (severity: error confirmed) |
| **JSON:API 1.1** (Top-Level Document) | §Document Structure / Top-Level | "The members `data` and `errors` **MUST NOT** coexist in the same document" | SCF-1 — JSON:API top-level data+errors mutually exclusive (severity: warn confirmed) |
| **JSON:API 1.1** (Media-Type) | §Media-Type Parameters | "The JSON:API media type **MUST NOT** be specified with any media type parameters other than `ext` and `profile`" | SCF-6 — top-level extra-members rejection (severity: warn) |
| **Google AIP-132** (List request) | §Request message | "The `page_size` and `page_token` fields, which support pagination, **must** be specified on all list request messages" | SCF-14 — AIP-pagination shape (severity: hint when AIP-style detected) |
| **Google AIP-132** (List request) | §Request message | "A `parent` field **must** be included unless the resource being listed is a top-level resource" | SCF-14 — AIP-parent-field on List (severity: hint when AIP-style detected) |
| **RFC 6750 §2.3** (Bearer Token in URI) | §2.3 | (Round-1 confirmed) "URI Query Parameter ... is included for completeness, but its use is **NOT RECOMMENDED**" | RFC2-56 / Y-3 — Bearer in URI query forbidden (severity: error) |

**Sources NOT verbatim-verified** (kept as secondary-source — verify at implementation time):
- RFC 9457 Problem Details (only obsoletion-fact verified; verbatim §3.1/§3.2 wording: secondary)
- RFC 9700 OAuth 2.0 BCP-240 (2025) — IETF-archive accessible but not gh-mirror; severity-upgrade for Y-7 / F-SP-3 stays based on BCP-fact citation
- RFC 8725 JWT BCP-225 — secondary
- RFC 7232 Conditional Requests / RFC 7233 Range / RFC 7234 Caching — superseded by 9110/9111; verify against 9110/9111 verbatim at implementation time
- RFC 8288 Web Linking — secondary
- RFC 7240 Prefer header — secondary
- HAL spec (`stateless.group/hal_specification.html`) — WebSearch-summary; mark SCF-7/8 as "verify at implementation"
- Siren spec — WebSearch-summary; SCF-9/10 marked
- OData v4.01 — WebSearch-summary; SCF-11/12 marked
- OWASP cheat-sheets — WebSearch-summary; TM-A* multi-source consensus mitigates risk

**Methodology recommendation** for v1 implementation: each rule whose severity hinges on RFC-2119-verbatim wording carries a `source-verified-at` timestamp + URL in its metadata. CI re-verifies every 6 months via gh-api-raw against IETF-mirror repos (`httpwg/http-core` for RFC 9110/9111/9112; `martinthomson/I-D` for drafts).

### Stage-A Pattern Inventory by Lens (All Take-Into-apiq)

> **Format.** Each table row: `Pattern-ID | Title | Sources | Multi-Lens-Tags | Severity (verbatim where verified) | Detection | Priority-Tier | Frequency-Estimate | Cost-Tag | Notes`.
> **Severity column convention:** `MUST` = error; `SHOULD` = warn; `MAY/RECOMMENDED` = hint; `(inferred)` = no RFC-2119 anchor; `(BCP)` indicates BCP-tightened.
> **Frequency-Estimate** on 4 reference specs (`stripe-full`, `pagerduty-full`, `dnd5eapi`, `github-rest`): `H` = 10+ findings on most specs; `M` = 1-10 on some specs; `L` = rarely fires; `n/a` = wouldn't fire on these 4 but may on others.
> **Cost-Tag:** `S` = ~30min Spectral DSL rule; `M` = 1-3h Walker or custom-function; `L` = 1-2 days new Module-class.
> **Priority-Tier:** `P1` = Konkurrenz-Pari (mature linters catch this; apiq-must-too); `P2` = Differentiator (apiq-USP); `P3` = Defense-in-Depth nice-to-have. Implementation-order only — all are implemented.

#### Lens 1 — Threat-Modeling (TM)

| Pattern-ID | Title | Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Y-1 | Numeric IDs in path-params (UUID-format encouraged) | OWASP API1 + multi | TM, Erg | warn (off-by-default) | mech | P2 | M | S | Round-1; Round-2 confirms |
| Y-2 | API-keys in URL | OWASP API2 | TM | error | mech | P1 | L | S | Round-1; universal |
| Y-3 | Credentials in URL parameter names | OWASP API2 | TM, Std | error | mech | P1 | L | S | Round-1; multi-confirm |
| Y-4 | HTTP-Basic Auth (insecure on HTTP) | OWASP + RFC 7617 | TM, Std | error | mech | P1 | L | S | Round-1; verbatim-conditional on non-HTTPS |
| Y-5 | OAuth2 tokenUrl HTTPS-only | OWASP + RFC 6749 §3.1 | TM, Std | error | mech | P1 | M | S | Round-1; verbatim "MUST utilize TLS" |
| Y-6 | OAuth2 refreshUrl recommended | RFC 9700 §4.1.5 (BCP) | TM, Evo | warn | mech | P3 | M | S | Severity-upgrade post-BCP-240 |
| Y-7 | OAuth2 implicit/password forbidden | RFC 9700 §2.1.2 (BCP) | TM, Evo, Std | **error** (BCP) | mech | P1 | M | S | **Severity-upgrade** Round-2: warn→error |
| Y-8 | JWT bearerFormat → RFC 8725 mention | RFC 8725 §3.1/§3.2 | TM, Std | warn | heuristic | P2 | M | S | Round-2: off-by-default → on-by-default |
| Y-9 | Auth-schemes outdated (negotiate/OAuth1) | OWASP API2 | TM | warn | mech | P3 | L | S | |
| Y-10 | additionalProperties:false per-schema | OWASP API3 | TM, Evo | warn | mech | P2 | H | S | |
| Y-11 | unevaluatedProperties:false (3.1) | OAS 3.1 | TM | warn | mech | P3 | M | S | |
| Y-12 | Array maxItems required | OWASP API4 | TM, Erg | warn | mech | P2 | H | S | |
| Y-13 | String maxLength/enum required | OWASP API4 + 42Crunch | TM | warn | mech | P2 | H | S | |
| Y-14 | Integer min+max required | OWASP API4 | TM | warn | mech | P2 | H | S | |
| Y-15 | URL-handling-params SSRF flag | OWASP API7 | TM, Std | warn | heuristic | P2 | M | S | |
| Y-16 | CORS allow-origin declared | OWASP API8 | TM | warn | mech | P3 | L | S | |
| Y-17 | Server URLs HTTPS-only | OWASP API8 | TM | warn | mech | P1 | H | S | |
| Y-18 | Sensitive header-names | OWASP API3 | TM | warn | mech | P3 | M | S | |
| Y-19 | Path no environment-names | OWASP API8 | TM, Evo | warn | mech | P2 | M | S | |
| Y-20 | Server URL no port (except localhost) | SPS | TM | hint | mech | P3 | L | S | |
| Y-21 | Property names no programming-keywords | Codegen-multi | TM, Cli | warn | mech-config | P2 | M | M | |
| Y-22 | Admin-paths distinct security-scheme | OWASP API5 | TM | hint (off-by-default) | graph | P3 | L | M | |
| Y-23 | Write-ops protected by security | OWASP API2/5 | TM, Std | warn | mech | P1 | H | S | |
| Y-24 | Read-ops should be security-protected | OWASP API1/5 | TM | hint | mech | P3 | M | S | |
| Y-25 | Idempotency-Key on POST creates | draft-ietf-httpapi | TM, Std | hint | mech | P3 | L | S | |
| TM-A1 | Path-params named id/_id/uuid declare format/pattern | OWASP API1 | TM, Erg | warn (SHOULD) | mech | P2 | H | S | Sharper than Y-1 |
| TM-A2 | Object-id-write-op SHOULD have security | OWASP API1 | TM, Std | warn | mech | P2 | H | S | Refines Y-23 |
| TM-A3 | 3+ ID-params in one path → BOLA risk | OWASP API1 | TM | hint | mech | P3 | L | M | |
| TM-A4 | Body has user_id/account_id on non-admin endpoint | OWASP API1 | TM | hint | heuristic | P3 | M | S | |
| TM-A5 | Bearer+JWT description SHOULD mention RFC 8725 | OWASP JWT + RFC 8725 | TM, Std | warn | heuristic | P2 | M | S | Cross-source-confirm; promote |
| TM-A6 | OpenIdConnect openIdConnectUrl HTTPS-only | RFC 6749 + APIMatic | TM, Std | error | mech | P1 | L | S | |
| TM-A7 | OAuth2 authorizationCode SHOULD declare PKCE | RFC 9700 (BCP) | TM, Std | warn (hint→warn post-BCP) | heuristic | P2 | M | S | |
| TM-A8 | Multiple AND securityRequirements same type | OWASP API2 | TM, Erg | hint | graph | P3 | L | M | |
| TM-A9 | Login-endpoint password-field + missing rate-limit | OWASP API2 | TM, Erg | warn | heuristic | P2 | L | M | Compound rule |
| TM-A10 | Tokens (access/refresh/id) in path/query | OWASP API2 + RFC 6750 §2.3 | TM, Std | error | mech | P1 | L | S | |
| TM-A11 | Privilege-escalation field-names in request | OWASP API3 | TM, Hyg | warn | mech-config | P1 | M | S | apiq-config-driven; high-value |
| TM-A12 | password/secret request-body SHOULD writeOnly | OAS + OWASP API3 | TM, Std | warn | mech-config | P2 | H | S | |
| TM-A13 | id/created_at/updated_at response SHOULD readOnly | OAS + OWASP API3 | TM, Std, Erg | warn | mech-config | P2 | H | S | |
| TM-A14 | Same schema reused req+resp without readOnly/writeOnly | OWASP API3 + 42Crunch | TM, Erg | hint | graph | P2 | M | M | |
| TM-A15 | PII-named fields in response without format/writeOnly | OWASP API3 + Cloudflare | TM, **Privacy** | warn | mech-config | P1 | H | M | **High-value**; apiq-config-driven; Lens-6 cornerstone |
| TM-A16 | email property SHOULD declare format:email | OWASP + OAS | TM, Hyg | hint | mech | P3 | H | S | |
| TM-A17 | additionalProperties:true on request-body | OWASP API3 | TM | warn | graph | P1 | H | S | Sharper than Y-10 |
| TM-A18 | Recursive schema SHOULD declare max-depth | OWASP API4 + IBM-LI81715 | TM, Erg | warn | graph | P2 | M | M | DoS-class; apiq has cycleStripSpec |
| TM-A19 | object schema with >50 properties | OWASP API4 + 42Crunch | TM, Erg | hint | mech-stat | P3 | M | M | Walker |
| TM-A20 | array maxItems > 10000 (defeats purpose) | OWASP API4 | TM | hint | mech | P3 | M | S | |
| TM-A21 | string maxLength > 1MB (defeats DoS bound) | OWASP API4 | TM | hint | mech | P3 | M | S | |
| TM-A22 | List-endpoint without limit/per_page param | OWASP API4 + 42Crunch | TM, Erg | warn | heuristic | P1 | M | M | |
| TM-A23 | Pagination param MUST have maximum | OWASP API4 | TM | error | mech | P1 | M | S | |
| TM-A24 | File-upload (binary) MUST declare maxLength | OWASP API4 + OAS | TM | error | mech | P1 | L | S | |
| TM-A25 | Long-running ops timeout / async pattern | OWASP API4 | TM, Erg | hint (off-by-default) | heuristic | P3 | L | M | Vendor-extension territory |
| TM-A26 | enum array length > 1000 | OWASP API4 + 42Crunch | TM | hint | mech | P3 | L | S | |
| TM-A27 | Admin paths share security-scheme with public | OWASP API5 | TM | hint | graph | P3 | L | M | |
| TM-A28 | "admin"/"internal" in description without security | OWASP API5 | TM | warn | heuristic | P2 | M | S | |
| TM-A29 | GET-only resource without write-ops (review) | OWASP API5 | TM, Erg | hint (informational) | graph | P3 | M | M | |
| TM-A30 | Non-standard HTTP method without explicit security | OWASP API5 | TM | warn | mech | P3 | L | S | |
| TM-A31 | Signup-flow without CAPTCHA / rate-limit | OWASP API6 | TM | warn (off-by-default) | heuristic | P3 | L | M | |
| TM-A32 | Purchase/booking flow MUST have rate-limit headers | OWASP API6 | TM | error | heuristic | P2 | L | M | |
| TM-A33 | Posting/comment flow SHOULD have rate-limit | OWASP API6 | TM | warn | heuristic | P3 | L | M | |
| TM-A34 | URL-handling property in body MUST format:uri+pattern | OWASP API7 + SSRF cheat | TM, Std | error | heuristic | P1 | M | S | Extends Y-15 |
| TM-A35 | URL-handling without scheme-allowlist (^https?) | OWASP API7 | TM | warn | heuristic | P2 | M | S | |
| TM-A36 | Upstream-URL operation MUST declare 4xx/5xx errors | OWASP API7/10 | TM, Std | warn | graph | P2 | L | M | |
| TM-A37 | host/hostname/server/origin params flagged for SSRF | OWASP API7 | TM | hint | heuristic | P3 | L | S | |
| TM-A38 | CORS Allow-Origin: * literal | OWASP API8 + CORS | TM, Std | error | mech | P1 | L | S | |
| TM-A39 | Allow-Credentials:true + Allow-Origin:* | OWASP CORS | TM, Std | error | graph | P1 | L | S | Mutually-exclusive per CORS-spec |
| TM-A40 | Origin-reflection without allowlist | OWASP CORS | TM | hint (LLM-borderline) | heuristic | P3 | L | M | |
| TM-A41 | Browser-API security-headers (HSTS/CSP/etc.) | OWASP HTTP-Headers | TM, Std | hint (off-by-default) | mech-stat | P3 | L | M | Browser-context only |
| TM-A42 | Error-schema with stack/trace/exception field | OWASP API8 | TM, Hyg | warn | heuristic | P1 | M | S | High-value catch |
| TM-A43 | TRACE/CONNECT/PROPFIND etc. without security | OWASP API8 | TM | warn | mech | P3 | L | S | |
| TM-A44 | /debug, /_debug, /test paths in production spec | OWASP API8/9 | TM, Hyg | error | mech | P1 | L | S | |
| TM-A45 | Multi-version servers without one deprecated | OWASP API9 | TM, Evo | warn | heuristic | P3 | L | M | |
| TM-A46 | deprecated:true SHOULD have sunset+replacement | OWASP API9 + RFC 8594 | TM, Evo | warn | heuristic | P2 | M | S | |
| TM-A47 | info.version differs from server URL version-prefix | OWASP API9 | TM, Evo | warn | mech | P2 | M | S | |
| TM-A48 | info.contact missing in production spec | OWASP API9 | TM, Hyg | warn (production-context) | mech | P3 | H | S | |
| TM-A49 | Upstream-URL op lacks 502/503/504 declaration | OWASP API10 | TM, Std | hint | graph | P3 | L | M | |
| TM-A50 | Webhook endpoint MUST declare signature-header | GitHub + Stripe webhook docs | TM, Std | error | mech-config | P1 | M | M | **Highest-value Round-2 catch**; sleeper-killer |
| TM-A51 | Webhook accepts */* content-type | OWASP API10 + GitHub | TM, Std | warn | mech | P3 | L | S | |
| TM-A52 | info.description SHOULD have Security section | OWASP REST | TM, Std, Doc | hint | heuristic | P3 | L | M | |
| TM-A53 | securitySchemes declared, no 401 anywhere | OWASP API2 + RFC 9110 §11.6.1 (verbatim "MUST") | TM, Std | **error** | graph | P1 | L | M | Severity-upgrade |
| TM-A54 | TLS-version-policy in description | OWASP API8 | TM | hint (LLM-borderline) | heuristic | P3 | L | S | Move to Unsure |

#### Lens 2 — Standards-Compliance (RFC2)

| Pattern-ID | Title | Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| RFC2-1 | problem+json schema MUST have type, SHOULD have title/status/detail/instance | RFC 9457 §3.1 | Std, Erg | warn | mech | P1 | M | M | DM-4 module |
| RFC2-2 | problem-details type MUST be URI (about:blank default) | RFC 9457 §3.1.1 | Std | warn | mech | P2 | M | S | |
| RFC2-3 | problem-details status MUST match HTTP status | RFC 9457 §3.1.2 (verbatim) | Std, Int-Cons | warn | graph | P2 | L | M | |
| RFC2-4 | problem-details extensions MUST NOT redefine reserved names | RFC 9457 §3.2/§4.2 | Std | warn | mech | P3 | L | S | |
| RFC2-5 | problem-class type URI MUST be unique cross-spec | RFC 9457 §4 | Std, Erg | warn | graph | **P1 (USP)** | L | M | **apiq-USP** — no linter ships |
| RFC2-6 | RFC 7807 → 9457 migration (problem+xml) | RFC 9457 | Std, Evo | hint (informative) | mech | P3 | L | S | |
| RFC2-7 | HTTP method tokens uppercase | RFC 9110 §4.1 | Std | error | mech | P1 | M | S | spectral:oas covers; verify redundancy |
| RFC2-8 | GET/HEAD/OPTIONS/TRACE/DELETE SHOULD NOT have body | RFC 9110 §9.3.1 | Std, Erg | warn (DELETE) / error (GET) | mech | P1 | M | S | |
| RFC2-9 | Safe methods MUST NOT have side effects | RFC 9110 §9.2.1 | Std, TM | (LLM-only) | LLM | — | — | — | OUT — moved to LLM |
| RFC2-10 | Idempotent methods MUST be idempotent | RFC 9110 §9.2.2 | Std | (LLM-only) | LLM | — | — | — | OUT — moved to LLM |
| RFC2-11 | Header names canonical Title-Case | RFC 9110 §5.1 | Erg | warn | mech-stat | P2 | H | M | apiq G8 walker |
| RFC2-12 | Standard headers MUST NOT be redeclared as parameters | RFC 9110 §5 + Microsoft | Std, Erg | warn | mech | P1 | M | S | |
| RFC2-13 | 1xx response → Upgrade/Connection header | RFC 9110 §6.2 | Std | hint | mech | P3 | L | S | Niche |
| RFC2-14 | 405 → Allow header REQUIRED | RFC 9110 §15.5.6 (verbatim "MUST") | Std | error | mech | P1 | L | S | http-protocol-pairings module |
| RFC2-15 | 426 → Upgrade header REQUIRED | RFC 9110 §15.5.16 (verbatim "MUST") | Std | error | mech | P3 | L | S | Niche |
| RFC2-16 | Status codes MUST be IANA-registered | RFC 9110 + IANA | Std | error | mech | P1 | M | S | |
| RFC2-17 | 1xx codes MUST NOT be responses-keys | OAS-3 | Std | hint | mech | P3 | L | S | |
| RFC2-18 | Content-Length SHOULD NOT be declared | RFC 9110 §8.6 | Hyg | hint | mech | P3 | L | S | |
| RFC2-19 | Date response-header SHOULD NOT be declared | RFC 9110 §6.6.1 | Hyg | hint | mech | P3 | L | S | |
| RFC2-20 | If-Match → 412 declaration | RFC 9110 §13.1.1 | Std | warn | mech | P2 | L | M | http-protocol-pairings |
| RFC2-21 | If-None-Match GET → 304 | RFC 9110 §13.1.2 | Std | warn | mech | P2 | L | M | |
| RFC2-22 | If-None-Match PUT/PATCH/DELETE → 412 | RFC 9110 §13.1.2 | Std | warn | mech | P2 | L | S | |
| RFC2-23 | If-Modified-Since → 304 | RFC 9110 §13.1.3 | Std | hint | mech | P3 | L | S | |
| RFC2-24 | If-Unmodified-Since → 412 | RFC 9110 §13.1.4 | Std | warn | mech | P3 | L | S | |
| RFC2-25 | 304 → ETag/Last-Modified/conditional-param | RFC 9110 §15.4.5 | Std | warn | mech | P2 | L | M | |
| RFC2-26 | 412 → conditional param | RFC 9110 §15.5.13 | Std | warn | mech | P2 | L | S | |
| RFC2-27 | ETag value SHOULD use opaque DQUOTE form | RFC 9110 §8.8.3 | Std | hint | mech | P3 | L | S | |
| RFC2-28 | ETag consistency cross-resource ops | RFC 9110 §8.8.3 | Erg, Int-Cons | hint | graph | P3 | L | M | |
| RFC2-29 | PUT/PATCH/DELETE on {id} SHOULD support If-Match+ETag | RFC 9110 + Microsoft | Std, Erg | hint | heuristic | P3 | L | M | |
| RFC2-30 | Range param → 206 declaration | RFC 9110 §14.1 | Std | hint | mech | P3 | L | S | |
| RFC2-31 | Range → 416 declaration | RFC 9110 §15.5.17 | Std | hint | mech | P3 | L | S | |
| RFC2-32 | 206 → Content-Range REQUIRED | RFC 9110 §15.3.7 (verbatim "MUST") | Std | error | mech | P2 | L | S | |
| RFC2-33 | Accept-Ranges value IANA-registered | RFC 9110 §14.3 | Std | hint | mech | P3 | L | S | |
| RFC2-34 | Heroku-style Range pagination | RFC 9110 + Heroku | Erg | hint | mech | P3 | L | S | |
| RFC2-35 | Cache-Control directives IANA-registered | RFC 9111 §5.2 | Std | hint | mech | P3 | M | S | |
| RFC2-36 | Pragma deprecated; SHOULD NOT declare | RFC 9111 §5.4 | Std, Evo | hint | mech | P3 | L | S | |
| RFC2-37 | Cache-Control + Expires together = smell | RFC 9111 §5.3 | Hyg, Evo | hint | mech | P3 | L | S | |
| RFC2-38 | Vary header when content-negotiation | RFC 9111 §4.1 | Std, Erg | hint | heuristic | P3 | L | S | |
| RFC2-39 | 304/200 same ETag-shape | RFC 9111 §4.3.4 | Int-Cons | hint | graph | P3 | L | M | |
| RFC2-40 | 401 → WWW-Authenticate REQUIRED | RFC 9110 §11.6.1 (verbatim "MUST") | Std, TM | error | mech | P1 | M | S | http-protocol-pairings |
| RFC2-41 | 407 → Proxy-Authenticate REQUIRED | RFC 9110 §11.6.4 (verbatim "MUST") | Std | error | mech | P3 | L | S | Niche |
| RFC2-42 | WWW-Authenticate scheme IANA-registered | RFC 9110 + IANA | Std | hint | mech | P3 | L | S | |
| RFC2-43 | http-basic security-scheme on non-HTTPS | RFC 7617 + 9110 | TM, Std | error | mech | P1 | L | S | covered by Y-4 |
| RFC2-44 | http-digest auth outdated | RFC 7616 | TM, Evo | hint | mech | P3 | L | S | |
| RFC2-45 | apiKey in:query flagged | RFC 6750 §2.3 | TM | error | mech | P1 | L | S | covered by Y-2/Y-3 |
| RFC2-46 | Prefer param → Preference-Applied response | RFC 7240 §3 | Std, Erg | hint | mech | P3 | L | S | |
| RFC2-47 | Prefer values registered tokens | RFC 7240 §4 + IANA | Std | hint | mech | P3 | L | S | |
| RFC2-48 | Prefer:respond-async → 202 | RFC 7240 §4.1 | Std | warn | mech | P3 | L | S | |
| RFC2-49 | Prefer:return=representation | RFC 7240 §4.2 | Std | (LLM-only) | LLM | — | — | — | OUT |
| RFC2-50 | Custom SFV header example conforms | RFC 9651 §3 | Std | hint | mech | P3 | L | M | |
| RFC2-51 | New custom headers SHOULD be SFV | RFC 9651 §1.2 | Std, Evo | (LLM-only) | LLM | — | — | — | OUT |
| RFC2-52 | Link rel-token IANA OR URI | RFC 8288 §2.1 | Std | hint | mech | P3 | L | S | |
| RFC2-53 | Link rel=next on paginated truncated | RFC 8288 + RFC 5988 | Std, Erg | hint | mech | P3 | L | S | apiq E5 |
| RFC2-54 | Link header anchor-param absolute IRI | RFC 8288 §3.2 | Std | hint | mech | P3 | L | S | |
| RFC2-55 | Link rel-tokens case-insensitive coherence | RFC 8288 §3.3 | Hyg | hint | mech | P3 | L | S | |
| RFC2-56 | Bearer tokens MUST NOT in URI query | RFC 6750 §2.3 (verbatim "NOT RECOMMENDED") | TM, Std | error | mech | P1 | L | S | covered by Y-3 |
| RFC2-57 | Bearer scheme SHOULD declare bearerFormat | RFC 6750 + OAS | Erg | hint | mech | P3 | M | S | |
| RFC2-58 | bearerFormat:JWT description mention RFC 8725 | RFC 8725 §3.1/3.2 | TM | warn | heuristic | P2 | M | S | covered by Y-8 |
| RFC2-59 | Bearer 401 → WWW-Authenticate Bearer realm | RFC 6750 §3 | Std | warn | mech | P2 | L | S | |
| RFC2-60 | OAuth2 implicit forbidden (BCP 240) | RFC 9700 §2.1.2 (verbatim "MUST NOT") | TM, Evo | error | mech | P1 | L | S | covered by Y-7 |
| RFC2-61 | OAuth2 password forbidden (BCP 240) | RFC 9700 §2.1.2 (verbatim "MUST NOT") | TM, Evo | error | mech | P1 | L | S | covered by Y-7 |
| RFC2-62 | OAuth2 *Url MUST HTTPS | RFC 6749 §3.1 (verbatim "MUST utilize TLS") | TM | error | mech | P1 | M | S | covered by Y-5 |
| RFC2-63 | OAuth2 authCode SHOULD declare refreshUrl | RFC 9700 §4.1.5 | TM, Evo | hint | mech | P3 | M | S | |
| RFC2-64 | OAuth2 clientCredentials broad/empty scopes | RFC 9700 §2.1 | TM | hint | mech | P3 | L | S | |
| RFC2-65 | OAuth2 scopes MUST have descriptions | RFC 6749 §3.3 + OAS | Std, Erg | warn | mech | P2 | M | S | |
| RFC2-66 | Path segments percent-encoded | RFC 3986 §3.3 | Std | error | mech | P1 | L | S | |
| RFC2-67 | Path segments unreserved+segment-allowed sub-delims | RFC 3986 §3.3 | Std | hint | mech | P3 | L | S | |
| RFC2-68 | Path MUST NOT contain query `?` | RFC 3986 §3.4 | Std | warn | mech | P1 | L | S | apiq S-SP-7 |
| RFC2-69 | Path MUST NOT contain fragment `#` | RFC 3986 §3.5 | Std | error | mech | P2 | L | S | |
| RFC2-70 | OAS path-template = RFC 6570 Level-1 only | RFC 6570 + OAS | Std | error | mech | P2 | L | S | |
| RFC2-71 | Server-URL host lowercase | RFC 3986 §3.2.2 | Hyg, Std | hint | mech | P4 | M | S | |
| RFC2-72 | Server-URL scheme lowercase | RFC 3986 §3.1 | Hyg, Std | hint | P4 | mech | M | S | |
| RFC2-73 | Server-URL path normalized (no `.`/`..`) | RFC 3986 §6.2.2.3 | Hyg, Std | hint | mech | P4 | L | S | |
| RFC2-74 | Server-URL userinfo (user:pass) forbidden | RFC 3986 §3.2.1 | TM, Hyg | error | mech | P2 | L | S | |
| RFC2-75 | Custom JSON media-type uses +json | RFC 6838 §4.2.8 | Std, Erg | hint | mech | P4 | L | S | |
| RFC2-76 | Vendor-specific media-type uses vnd. tree | RFC 6838 §3.2 | Std | hint | mech | P4 | L | S | |
| RFC2-77 | prs. tree in production = smell | RFC 6838 §3.3 | Hyg | hint | mech | P5 | L | S | |
| RFC2-78 | `*/*` content-type forbidden | OAS interpretive | Hyg | warn | mech | P2 | L | S | apiq L-MIN-2 |
| RFC2-79 | Top-level media-type IANA-registered | RFC 6838 + IANA | Std | error | mech | P4 | L | S | |
| RFC2-80 | charset on application/json redundant | RFC 8259 §8.1 | Hyg | hint | mech | P4 | L | S | |
| RFC2-81 | int64 SHOULD be string-encoded | RFC 8259 §6 | Std, Erg | hint | mech | P3 | M | S | apiq SG-24 |
| RFC2-82 | properties keys unique within schema | RFC 8259 §4 | Std | error | mech | P1 | L | S | |
| RFC2-83 | default/example as JSON-string parses strict | RFC 8259 §2 | Std | hint | heuristic | P5 | L | S | |
| RFC2-84 | OAS 3.0 + 2020-12-only-keywords = error | OAS-3.0 binding | Std, Evo | error | mech | P1 | M | M | json-schema-draft-version-detector |
| RFC2-85 | OAS 3.1 jsonSchemaDialect required when 3.1 keywords | OAS-3.1 §4.7.1 | Std | hint | mech | P3 | L | S | |
| RFC2-86 | definitions → $defs porting smell | JSON-Schema 2019-09 | Evo, Std | hint | mech | P3 | L | S | |
| RFC2-87 | id → $id porting smell | JSON-Schema draft-06 | Evo | hint | mech | P3 | L | S | |
| RFC2-88 | Boolean exclusiveMin/Max in 3.1 | JSON-Schema 2019-09+ | Evo, Std | warn | mech | P3 | L | S | apiq X4 |
| RFC2-89 | contentEncoding/contentMediaType in 3.0 = doc-only | JSON-Schema draft-07 | Std, Evo | hint | mech | P5 | L | S | |
| RFC2-90 | Idempotency-Key on POST creates | draft-httpapi-idempotency-key | Std, TM | hint | mech | P3 | L | S | covered by Y-25 |
| RFC2-91 | Deprecation header SHOULD pair Sunset | draft-deprecation-header + RFC 8594 | Evo, Std | hint | mech | P3 | L | S | |
| RFC2-92 | Sunset header value HTTP-date | RFC 8594 §2 | Std | hint | mech | P3 | L | S | |
| RFC2-93 | RateLimit-* headers SHOULD declare | draft-httpapi-ratelimit | Std | hint | mech | P3 | L | S | |
| RFC2-94 | 429 → Retry-After OR RateLimit-* | RFC 7231 §7.1.3 + draft | Std, TM | **error** | mech | P1 | M | S | Severity-upgrade C9: warn→error |
| RFC2-95 | Retry-After grammar HTTP-date OR delta-seconds | RFC 9110 §10.2.3 | Std | hint | mech | P4 | L | S | |
| RFC2-96 | 503 → Retry-After SHOULD | RFC 9110 §15.6.4 | Std | hint | mech | P4 | L | S | |
| RFC2-97 | PATCH MUST declare merge-patch+json OR json-patch+json | RFC 7396 + 6902 | Std, Erg | warn | mech | P2 | L | S | apiq L-SP-2 |
| RFC2-98 | merge-patch+json properties NOT required | RFC 7396 §2 | Std | warn | mech | P3 | L | S | apiq B-MIN-3 |
| RFC2-99 | json-patch+json schema MUST be array | RFC 6902 §3 | Std | warn | mech | P3 | L | S | |
| RFC2-100 | multipart/form-data SHOULD be type:object+properties | RFC 7578 §4.2 | Std | hint | mech | P3 | L | S | |
| RFC2-101 | multipart binary part SHOULD declare format:binary | RFC 7578 + OAS | Std | hint | mech | P3 | L | S | |
| RFC2-102 | X- prefix forbidden | RFC 6648 §3 | Std, Erg | warn | mech | P1 | M | S | Round-1 |
| RFC2-103 | 428 status declaration awareness | RFC 6585 §3 | Std, TM | hint | mech | P5 | L | S | Niche |
| RFC2-104 | 429 status (covered by C9/RFC2-94) | RFC 6585 §4 | Std, TM | (covered) | mech | — | — | — | |
| RFC2-105 | 511 status awareness | RFC 6585 §6 | Std | hint | mech | P5 | L | S | Niche |

#### Lens 3 — Evolution-Friction (EV)

| Pattern-ID | Title | Sources | Multi-Lens | Severity-Direction | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| EV-1 | deprecated:true without sunset/replacement | OASDIFF + OAS-3.3 + RFC 8594 + 6+ | 3, 4 | warn (drift) | mech | P1 | M | S | apiq H4/R4 strengthen; sleeper compound |
| EV-2 | Required-field-stability heuristic | OASDIFF inverted + Stripe | 3 | hint (drift) | heuristic | P3 | L | S | False-positive risk |
| EV-3 | Closed enum without extensibility hook (response) | Zalando + Speakeasy + OASDIFF | 3, 4 | hint (loosen) | mech+heur | P2 | M | S | |
| EV-4 | Bare-array request/response body | OASDIFF + apiq §1 | 3, 4 | warn (loosen) | mech | P1 | M | S | Round-1 cross-source |
| EV-5 | additionalProperties not declared on response | OASDIFF + SG-42 + Microsoft + Zalando | 3, 4, 1 | warn (tighten) | mech | P1 | H | S | apiq M8 confirmed |
| EV-6 | oneOf/anyOf without discriminator(+mapping) | OASDIFF + Bump.sh | 3, 4 | warn(map)/hint(no-map) | mech | P2 | M | S | apiq M14 |
| EV-7 | Default value on required field | IBM + OASDIFF + Stripe | 3, 5 | warn (drift) | mech | P2 | M | S | apiq T2/M-SP-14 |
| EV-8 | Operation lacks operationId | OPTIC + OASDIFF + Spectral | 3, 4 | warn (drift) | mech | P1 | M | S | |
| EV-9 | info.version placeholder/non-versioned | Stripe + GH-API + MS-AZ | 3 | hint (drift) | mech | P3 | M | S | apiq H2 extend |
| EV-10 | Mixed URL+Header versioning | SG-6 + Zalando + Stripe + GH-API | 3 | warn (drift) | mech | P1 | L | S | apiq H1 |
| EV-11 | No spec-wide error-shape declared | SG-16 + RFC 7807 + OPTIC | 2, 3, 4 | warn (drift) | mech-stat | P2 | M | M | apiq K2 |
| EV-12 | Path-version vN.M (minor in URL) | G-URL-2 + Speakeasy + Stripe | 3 | warn (loosen) | mech | P3 | L | S | |
| EV-13 | info.version non-semver AND non-date | SG-25 + Stripe + GH-API | 3 | warn (drift) | mech | P3 | M | S | |
| EV-14 | requestBody.required not explicit | SP-G-AZ-9 + IBM | 3, 5 | warn (drift) | mech | P2 | M | S | apiq L2 |
| EV-15 | Status-code-set wide-open (>10 codes) | OASDIFF inverted | 3, 4 | hint (loosen) | mech-stat | P3 | M | M | New |
| EV-16 | 5xx/default response missing | SP-G-OWASP-28 + Azure + Zalando | 3, 4 | warn (loosen) | mech | P2 | M | S | apiq C7 |
| EV-17 | Endpoint without tags | SG-41 + spectral:oas | 3, 4 | warn (drift) | mech | P2 | H | S | apiq Q1 |
| EV-18 | additionalProperties:true on request without explicit | OWASP + Stripe + MS-AZ | 3, 1 | hint (tighten) | mech | P2 | H | S | inverse EV-5 |
| EV-19 | securitySchemes declared but unused on ops | OASDIFF + apiq F3 | 3, 1 | warn (drift) | graph | P2 | M | M | |
| EV-20 | Single media-type response (no neg-room) | OASDIFF | 3, 5 | hint (loosen) | mech | P3 | H | S | |
| EV-21 | Required prop without description in response | SG-2 + VTex | 3, 4 | hint (drift) | mech-stat | P3 | H | S | |
| EV-22 | $ref-cycle without max-depth | apiq A2 + JSON-Schema | 3, 1 | hint (drift) | graph | P2 | L | M | |
| EV-23 | Request prop maxLength/maxItems/maximum/pattern absent | OASDIFF | 3, 1 | warn (tighten) | mech | P1 | H | S | |
| EV-24 | Request pattern without ^…$ anchors | MIN-2 IBM + OASDIFF | 3, 2 | warn (tighten) | mech | P1 | M | S | apiq A-MIN-1 |
| EV-25 | type:integer without format:int32/int64 | SP-G-OWASP-21 + Zalando + OASDIFF | 3, 2, 4 | warn (drift) | mech | P1 | H | S | apiq M-SP-9 |
| EV-26 | TODO/FIXME/placeholder in summary/description | SG-2 + apiq stub | 3, 5 | hint (drift) | mech | P3 | L | S | |
| EV-27 | Path-segment file-extension (.json/.xml) | SP-G-AYWH-14 + SG-5 + SPS | 3, 5 | error (drift) | mech | P1 | L | S | apiq S-SP-6 |
| EV-28 | Server URL contains environment name | SP-G-SPS-10 | 3, 1 | error (drift) | mech | P1 | L | S | apiq S-SP-4 |
| EV-29 | API-Path-prefix /api/ | Zalando | 3, 5 | hint (drift) | mech-stat | P3 | M | M | apiq W-MIN-2 (opinion-divided) |
| EV-30 | requestBody without application/json media-type | SP-G-AYWH-10 + SPS + OPTIC | 3, 5 | warn (loosen) | mech | P2 | M | S | apiq B-SP-4 |
| EV-31 | Custom HTTP method without RFC reference | SP-G-SPS-1 | 3, 2 | error (drift) | mech | P1 | L | S | apiq B-SP-9 |
| EV-32 | Authorization/Content-Type/Accept as explicit param | Azure + SPS + IBM | 3, 2 | warn (drift) | mech | P1 | M | S | apiq T4 |
| EV-33 | nullable:true AND required:true | JSON-Schema-evolution-blog + Speakeasy | 3, 5 | warn (drift) | mech | P2 | M | S | New |
| EV-34 | Spec uses Swagger-2 | SP-G-TD-3 + Red-Hat | 3 | error (drift) | mech | P1 | L | S | apiq X-MIN-3 |
| EV-35 | Two adjacent path-template-segments no separator | MIN-6 IBM | 3, 2 | error (drift) | mech | P1 | L | S | apiq A-MIN-4 |
| EV-36 | Two paths same structural template | MIN-7 Vacuum + Redocly | 3, 2 | error (drift) | mech | P1 | L | S | apiq A-MIN-5 |
| EV-37 | info.version not present | OAS-3-MUST | 3 | error (drift) | mech | P1 | L | S | New explicit |
| EV-38 | Past-tense verb in path-segment | SP-G-SPS-3 + SG-11 | 3, 5 | hint (drift) | mech | P3 | L | S | apiq G-SP-7 partial |
| EV-39 | Required prop with single-value enum | JSON-Schema + OASDIFF | 3, 5 | hint (drift) | mech | P3 | L | S | |
| EV-40 | Schema-name reuse case-insensitive | apiq O2 | 3, 4 | warn (drift) | mech | P1 | L | S | apiq O2 |
| EV-41 | Field-name with _v1/_legacy/_old/_deprecated suffix | apiq prose-walker | 3, 4 | hint (drift) | mech | P3 | L | S | |
| EV-42 | tags array contains internal/private/beta/experimental | Microsoft + Google AIPs | 3, 4 | hint (drift) | mech | P3 | L | S | New |
| EV-43 | swagger:2.0 artifacts + openapi:3.x | SP-G-TD-3 + pb33f | 3, 2 | error (drift) | mech | P1 | L | S | |
| EV-44 | No top-level components.schemas (every schema inline) | apiq M6 extended | 3, 4 | hint (drift) | mech-stat | P3 | M | M | apiq M6 |
| EV-45 | default + specific status overlap conflict | OASDIFF + OPTIC | 3, 5 | hint (drift) | mech | P3 | L | M | New |
| EV-46 | readOnly:true in REQUEST or writeOnly:true in RESPONSE | SP-G-AZ-24 + OASDIFF | 3, 4 | warn (drift) | mech | P2 | M | S | apiq M-SP-3 |
| EV-47 | requestBody multipart+json same schema | Azure + OPTIC | 3, 5 | hint (drift) | mech | P3 | L | S | New |
| EV-48 | PATCH accepts application/json (not patch-types) | SP-G-TD-4 + Azure + IBM | 3, 2 | warn (drift) | mech | P2 | L | S | apiq L-SP-2 |
| EV-49 | 429 declared without Retry-After header | SG-31 + SP-G-OWASP-15 | 3, 1, 2 | error (drift) | mech | P1 | M | S | apiq C9; covered by RFC2-94 |
| EV-50 | 304 declared without conditional infrastructure | RFC 7232 / 9110 + apiq C10 | 3, 2 | warn (drift) | mech | P2 | L | S | apiq C10 |
| EV-51 | Magic-string (free-text where enum viable) | LL-13 + apiq M13 | 3, 5 | hint (loosen) | mech-heur | P3 | M | S | apiq M13 |
| EV-52 | Integer maximum > 2^53 without int64 string-encoding | SG-24 + AIP + Zalando #168 + Stripe | 3, 2, 4 | hint (drift) | mech | P3 | M | S | apiq J-SG-2 |
| EV-53 | URL-version /v1/ vs info.version 2.x drift | Adidas + Speakeasy + G-URL-1 | 3, 5 | warn (drift) | mech | P2 | L | S | apiq H3 |
| EV-54 | version param without enum constraint | apiq existing | 3 | warn (loosen) | mech | P3 | L | S | |
| EV-55 | Required parameter shows default value | Azure + IBM + OASDIFF | 3 | warn (drift) | mech | P2 | M | S | apiq T2 |
| EV-56 | servers array missing/empty | SP-Redocly | 3, 5 | warn (drift) | mech | P2 | L | S | apiq P-SP-5 |
| EV-57 | required declares fields not in properties | apiq A3 | 3, 5 | error (drift) | mech | P1 | L | S | apiq A3 |
| EV-58 | deprecated:true op + active-status enum | OAS-3.3-PROP | 3, 5 | (LLM-only) | LLM | — | — | — | OUT |
| EV-59 | 3xx (301/302/307/308) without Location header | SP-G-SPS-15 inverse + RFC 9110 | 3, 2 | warn (drift) | mech | P3 | L | S | New |
| EV-60 | webhooks (3.1) without summary/description | SP-G-SPS-21 + apiq U1/U2 | 3, 4 | hint (drift) | mech | P3 | L | S | apiq U1 |
| EV-61 | oneOf closed + description "more variants" language | apiq prose-walker | 3, 4 | hint (loosen) | mech-heur | P3 | L | S | |
| EV-62 | type:integer candidate for type:string (>2^53 evidence) | SG-24 + Stripe + AIPs | 3, 4 | hint (drift) | mech | P3 | M | S | New |

#### Lens 4 — Client-Friction (CL)

| Pattern-ID | Title | Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| CL-1 | Reserved-keyword property/operationId per target-lang | openapi-generator multi-issue | 4, 3 | warn | mech-stat | P1 | M | M | **Multi-lang allowlist** load-bearing |
| CL-2 | Property-name leading underscore/digit | swagger-codegen #4805 + openapi-gen | 4 | warn | mech | P1 | L | S | Java/Go/Python compile-fail |
| CL-3 | Camelize-collide property×schema-name | openapi-generator #17909 | 4 | warn | graph | P3 | L | M | Niche |
| CL-4 | Inline-Object schemas without title | multi-codegen + Speakeasy | 4 | warn | mech | P2 | H | S | apiq M6 narrower |
| CL-5 | operationId verbose / FastAPI-style | Speakeasy + SDK-vendor | 4 | warn | heuristic | P2 | M | S | apiq G3 strengthen |
| CL-6 | operationId missing | openapi-gen + multi | 4, 3 | error | mech | P1 | M | S | spectral covers |
| CL-7 | required + nullable without 3-state semantics | openapi-generator #14765 + Speakeasy | 4, 3 | hint | mech | P2 | M | S | New |
| CL-8 | Property required-in-response not-in-request asymmetry | Speakeasy + openapi-gen #20213 | 4 | hint | graph | P3 | M | M | |
| CL-9 | Same-status-code multiple content-types | openapi-gen #17877 + oapi-codegen #1897 | 4 | warn | mech | P2 | M | S | High-impact |
| CL-10 | Mixed text/plain + application/json same code | oapi-codegen #1897 | 4 | warn | mech | P3 | L | S | Subset CL-9 |
| CL-11 | anyOf where oneOf intended | Speakeasy + openapi-gen | 4 | hint | LLM | — | — | — | apiq A14; LLM-only |
| CL-12 | oneOf without discriminator | Redocly + multi | 4 | warn | mech | P1 | M | S | apiq existing |
| CL-13 | discriminator.propertyName not in required | openapi-gen #9444 + Redocly | 4 | warn | mech | P2 | L | S | apiq A4 extend |
| CL-14 | discriminator.propertyName leading underscore | openapi-gen #9444 | 4 | warn | mech | P3 | L | S | Java-specific |
| CL-15 | int64 integer without format declared | OAI + Speakeasy + openapi-gen | 4, 3 | warn | heuristic | P2 | M | S | |
| CL-16 | int64 declared without string-alternative | OAI + Speakeasy + Stripe | 4 | hint | mech | P3 | M | S | |
| CL-17 | Recursive schema without termination | openapi-gen + python-client + utoipa | 4, 3 | warn | graph | P2 | L | M | apiq A2 upgrade |
| CL-18 | Recursive cycle on required field | pb33f | 4 | error | graph | P2 | L | M | Stricter CL-17 |
| CL-19 | Empty-body 2xx + 4xx no discriminating header | openapi-typescript | 4 | hint | mech | P3 | L | S | |
| CL-20 | 204 declared with content (RFC violation) | OAI #3536 | 4, 2 | warn | mech | P1 | L | S | New |
| CL-21 | format not in IANA-format-registry | openapi-gen multi | 4 | hint | mech | P2 | M | S | apiq A7 |
| CL-22 | type:object without properties+additionalProperties | openapi-gen + Apicurio | 4 | warn | mech | P2 | M | S | apiq M-SP-13 |
| CL-23 | additionalProperties:true free-form-object | openapi-gen #796 | 4 | hint | mech | P3 | M | S | Java-specific |
| CL-24 | Multiple-types in 3.1 unconstrained | openapi-gen #18207 | 4 | warn | mech | P2 | L | S | apiq A-MIN-16 |
| CL-25 | pattern Regex unsupported by ECMA/Java/Python | ReDoc + openapi-python-client | 4 | warn | mech-stat | P2 | M | M | apiq A6 multi-engine |
| CL-26 | pattern without ^/$ anchors | MIN-2 IBM + Speakeasy | 4, 1 | warn | mech | P1 | M | S | apiq A-MIN-1 |
| CL-27 | components.responses inconsistent $ref | openapi-typescript #408 | 4 | hint | graph | P3 | L | M | |
| CL-28 | Patterned status-codes (4XX/5XX) | openapi-python-client #1271 | 4 | warn | mech | P3 | L | S | |
| CL-29 | Deeply-nested inline objects (>3-4 levels) | swagger-ui + redoc | 4 | warn | mech-stat | P2 | M | M | apiq M4 |
| CL-30 | Deeply-nested allOf/oneOf chains (≥3 hops) | swagger-ui #7437 | 4 | warn | graph | P3 | L | M | New |
| CL-31 | Bare-array request body | openapi-gen #17877 | 4 | warn | mech | P1 | L | S | Extends EV-4 |
| CL-32 | array-of-array | MIN-32 IBM + stoplight #1418 | 4 | hint | mech | P3 | L | S | apiq D-MIN-5 |
| CL-33 | schema without type | MIN-11 Vacuum + openapi-gen | 4 | warn | mech | P1 | M | S | apiq A-MIN-9 |
| CL-34 | Property-name "Client" | openapi-python-client #1045 | 4 | hint | mech | P3 | L | S | |
| CL-35 | Schema named Client/API/Response/Request | openapi-python-client | 4 | warn | mech | P2 | L | S | New |
| CL-36 | example with value AND externalValue | MIN-48 Redocly | 4, syntax | error | mech | P1 | L | S | apiq M-MIN-2 |
| CL-37 | Component naming spaces/special chars | MIN-47 IBM + MIN-49 Redocly | 4 | warn | mech | P1 | L | S | apiq A-SP-3/4 |
| CL-38 | Multi-line description leading-space stripped | openapi-gen #8011 + oapi-codegen | 4 | hint | heuristic | P3 | L | S | |
| CL-39 | Description has HTML or complex Markdown | OAS + swagger-editor #2180 | 4 | hint | mech | P3 | M | S | apiq HTML-Walker |
| CL-40 | Path with `?` query in path-template | SP-G-SPS-17 | 4 | warn | mech | P1 | L | S | apiq S-SP-7 |
| CL-41 | External $ref to relative-path file | openapi-gen + oapi-codegen | 4, 3 | hint | mech | P3 | L | S | |
| CL-42 | $ref to external HTTPS URLs (offline-bundling) | openapi-gen + oapi-codegen | 4, 3 | hint | mech | P3 | L | S | |
| CL-43 | description has $ref-like-strings | MIN-46 IBM | 4 | hint | mech | P3 | L | S | |
| CL-44 | Verbose vs cryptic field-names | Speakeasy + Lens-4 | 4 | hint | heuristic | P3 | M | S | |
| CL-45 | Pagination mixed conventions cross-spec | Speakeasy + Postman + Lens-4 | 4 | warn | heuristic | P1 | M | M | apiq W10 |
| CL-46 | Inconsistent error-shape cross-endpoint | Speakeasy + Lens-4 | 4 | warn | mech-stat | P1 | M | M | apiq D2 strengthen |
| CL-47 | POST/PUT/PATCH return-shape ≠ GET-shape | MIN-35 IBM + Lens-4 | 4 | hint | mech | P3 | M | M | apiq D-MIN-3 |
| CL-48 | Multiple similar-not-identical schemas (no convention) | Lens-4 + Stripe | 4 | hint | mech-stat | P2 | M | M | apiq M7 near-duplicate |
| CL-49 | Doc-vs-Schema divergence | Lens-4 + OAI | 4 | (LLM-only) | LLM | — | — | — | OUT |
| CL-50 | Path-segments file-extensions | SG-5 + SP-G-SPS-13 | 4, 2 | error | mech | P1 | L | S | apiq S-SP-6 |
| CL-51 | Required+optional params unordered | MIN-27 IBM | 4 | hint | mech | P3 | M | S | apiq R-MIN-1 |
| CL-52 | additionalProperties dictionary inconsistent value-type | MIN-IBM | 4 | hint | mech | P3 | L | M | apiq M-SP-17 |
| CL-53 | parameters + requestBody both required total>5 | Speakeasy + Postman | 4 | hint | mech | P3 | L | S | apiq R3 |
| CL-54 | securitySchemes mixed types globally | Speakeasy SDK | 4, 3 | warn | mech-stat | P2 | M | M | apiq F |
| CL-55 | Uppercase mixed with lowercase enum values | SG-37 + apiq M12 | 4 | warn | mech | P1 | M | S | apiq M12 |
| CL-56 | Enum values not valid identifier-chars | openapi-typescript #1874 | 4 | warn | mech | P2 | M | S | New |
| CL-57 | enum with duplicate values | spectral default | 4, syntax | error | mech | P1 | L | S | spectral covers |
| CL-58 | Duplicate paths (case-insensitive resolve same) | MIN-7 + MIN-8 Vacuum | 4 | error | mech | P1 | L | S | apiq A-MIN-5/6 |
| CL-59 | operationId not URL-friendly | SP-G-SD-5 | 4 | error | mech | P1 | L | S | apiq G-SP-8 |
| CL-60 | x-internal:true usage | OpenAPI + Speakeasy + Stripe | 4, 3 | hint (info) | mech | P5 | L | S | Informational |
| CL-61 | Vendor-extension prefix-inconsistency | Speakeasy + OAI | 4, 3 | hint | mech-stat | P3 | L | M | |
| CL-62 | Operations same Resource varying tags | Lens-4 + Postman | 4 | hint | mech-stat | P3 | M | M | apiq Q5 strengthen |
| CL-63 | Operations missing summary AND description | spectral + Speakeasy | 4 | warn | mech | P1 | M | S | apiq R-SP-1 |
| CL-64 | operationId verb-prefix vs HTTP-method | R-SP-5 + apiq B8 | 4 | hint | heuristic | P2 | M | S | apiq B8 |
| CL-65 | Required boolean without default | openapi-gen multi | 4 | hint | mech | P3 | L | S | Niche |
| CL-66 | Discriminator mapping references missing schemas | A4/A5 + swagger-ui #9832 | 4, syntax | error | mech | P1 | L | S | apiq A4/A5 |
| CL-67 | Schema oneOf with single element | apiq A13 | 4 | hint | mech | P2 | L | S | apiq A13 |
| CL-68 | Path consecutive parameters (`/foo/{a}/{b}` no sep) | MIN-6 IBM | 4, syntax | error | mech | P1 | L | S | apiq A-MIN-4 |
| CL-69 | example value violates schema | spectral + AJV-layer | 4 | warn | mech | P1 | M | M | apiq M-MIN-3 |
| CL-70 | default value violates schema | apiq + multi | 4 | error | mech | P1 | M | M | apiq |
| CL-71 | Property-naming change v-N to v-N+1 | Octokit | 4, 3 | (out-of-scope diff) | LLM | — | — | — | OUT (diff) |
| CL-72 | multipart/mixed content-type | swagger-ui + openapi-gen | 4 | warn | mech | P3 | L | S | |
| CL-73 | servers[].url placeholder example.com/localhost | SP-G-SD-4 + apiq P-SP-1 | 4 | warn | mech | P1 | L | S | apiq P-SP-1 |
| CL-74 | callbacks without webhooks-3.1 OR webhooks no signature | Lens-4 + Twilio | 4, 1 | hint | mech | P3 | L | S | apiq U |
| CL-75 | Mixed casing cross-Tag | MIN Q-SP-5 | 4 | hint | mech-stat | P3 | M | M | apiq G7 + Q-SP-5 |
| CL-76 | Same path+method declared multiple times | MIN-8 Vacuum | 4, syntax | error | mech | P1 | L | S | apiq A-MIN-6 |
| CL-77 | Heavy allOf with multi non-$ref objects | openapi-gen #9756 | 4 | warn | heuristic | P2 | M | M | apiq A12 |
| CL-78 | Schema combines allOf + oneOf + anyOf siblings | Speakeasy | 4 | warn | mech | P3 | L | S | New |
| CL-79 | requestBody form-urlencoded + JSON simultaneously | openapi-gen #4908 | 4 | warn | mech | P3 | L | S | Subset CL-9 |
| CL-80 | readOnly:true AND required:true | M-SP-3 mirrors | 4, 3 | hint | mech | P3 | M | S | New |
| CL-81 | $ref siblings in same object (3.0-violation) | OAS A1 + apiq | 4, syntax | error | mech | P1 | L | S | apiq existing |

#### Lens 5 — Style-Coherence (SC + SCF)

| Pattern-ID | Title | Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| SC-1 | REST-vs-RPC mixing in paths (>10% each) | Microsoft + AIP-121 + Richardson | 4, 5 | hint | mech-stat | P2 | M | M | Style-classifier |
| SC-2 | Custom-method colon-verb consistency | AIP-136 + Microsoft | 4, 5 | hint | mech | P3 | L | S | |
| SC-3 | HTTP-method semantics (GET with state-change words) | Fielding + Microsoft + AIP-131..135 | 4, 5 | warn | heuristic | P2 | M | S | |
| SC-4 | Hypermedia-marker consistency | HAL + JSON:API + Siren + Fielding | 4, 5 | hint | mech | P3 | L | M | |
| SC-5 | Envelope-style coherence cross-list | JSON:API + OData + Microsoft + AIP | 4, 5 | warn | mech-stat | P1 | M | M | apiq E4 cross-op classifier |
| SC-6 | Resource-name pluralization coherence | AIP-122 + Zalando + JSON:API | 4, 5 | warn (upgrade from hint) | mech-stat | P1 | H | M | apiq S7 |
| SC-7 | Path-segment alternation (collection/id) | AIP-122 + Microsoft | 4, 5 | hint | graph | P3 | L | M | |
| SC-8 | Pagination-shape coherence | AIP-158 + JSON:API + OData + Zalando | 4, 5 | warn | mech-stat | P1 | M | M | apiq E2/E3 + Walker |
| SC-9 | Error-shape coherence cross-spec | RFC 7807 + JSON:API + Heroku + Zalando | 2, 4, 5 | warn | mech-stat | P1 | M | M | apiq K1/K4 |
| SC-10 | JSON:API conformance (data/errors not coexist) | JSON:API v1.1 (verbatim "MUST NOT") | 2, 5 | warn | mech | P2 | L | M | |
| SC-11 | HAL conformance (_links present when hal+json) | HAL spec | 2, 5 | warn | mech | P2 | L | S | |
| SC-12 | Siren conformance (class array) | Siren spec | 2, 5 | hint | mech | P3 | L | S | Niche |
| SC-13 | OData conformance (value array + @odata.context) | OData v4.01 | 5 | warn | mech | P2 | L | M | Enterprise-pillar |
| SC-14 | Style-marker leakage (mixed envelope styles) | HAL + JSON:API + Siren | 4, 5 | warn | mech-stat | P2 | L | M | |
| SC-15 | CRUD symmetry per resource | AIP-121 + REST | 4, 5 | hint | graph | P3 | M | M | apiq §5 |
| SC-16 | Resource-vs-Action shape | Microsoft + AIP-136 | 4, 5 | hint | mech | P3 | L | S | |
| SC-17 | HTTP-method per-op distribution | Richardson + AIP | 5 | hint | mech-stat | P3 | M | M | New |
| SC-18 | Field-name casing × content-type style | JSON:API + AIP-140 | 4, 5 | hint | mech-stat | P3 | M | M | New |
| SC-19 | Time-field naming coherence (*_time vs *_at) | AIP-142 + Rails/Stripe + Microsoft | 4, 5 | hint | mech-stat | P3 | M | S | apiq I4 extend |
| SC-20 | Standard-field-presence on AIP-style resources | AIP-148 | 5 | hint (off-by-default) | mech | P5 | L | S | Off-by-default |
| SC-21 | Reserved-field-name leakage from non-target style | All hypermedia specs | 4, 5 | hint | mech | P3 | L | S | |
| SC-22 | Filter-syntax coherence | AIP-160 + JSON:API + OData | 4, 5 | hint | mech-stat | P3 | L | M | |
| SC-23 | Sort-syntax coherence | AIP-132 + JSON:API + OData | 4, 5 | hint | mech-stat | P3 | L | M | |
| SC-24 | Asymmetric resource-shape POST vs GET | AIP-133 + Microsoft + IBM | 4, 5 | warn | graph | P2 | M | M | apiq DM-9/10 |
| SC-25 | Status-code distribution per operation type | RFC 7231 + Microsoft + AIP | 2, 5 | hint | mech-stat | P3 | M | M | |
| SCF-1 | JSON:API data/errors mutually exclusive | JSON:API v1.1 (verbatim MUST NOT) | 2, 5 | warn | mech | P2 | L | M | High-precision |
| SCF-2 | JSON:API resource type+id strings | JSON:API v1.1 §Resource | 2, 5 | warn | mech | P3 | L | S | |
| SCF-3 | JSON:API error object members | JSON:API v1.1 §Error | 2, 5 | warn | mech | P3 | L | S | |
| SCF-4 | JSON:API pagination params page[number]/page[size] | JSON:API v1.1 §Pagination | 2, 5 | hint | mech | P3 | L | S | |
| SCF-5 | JSON:API top-level links first/last/prev/next | JSON:API v1.1 §Pagination Links | 2, 5 | hint | mech | P3 | L | S | |
| SCF-6 | JSON:API no extra top-level members | JSON:API v1.1 (verbatim MUST NOT) | 2, 5 | warn | mech | P3 | L | S | |
| SCF-7 | HAL response has _links | HAL spec | 2, 5 | warn | mech | P3 | L | S | |
| SCF-8 | HAL _embedded values are HAL-shape | HAL spec | 2, 5 | hint | mech | P3 | L | S | |
| SCF-9 | Siren response has class array | Siren spec | 2, 5 | warn | mech | P3 | L | S | Niche |
| SCF-10 | Siren actions have name+href | Siren spec | 2, 5 | warn | mech | P3 | L | S | |
| SCF-11 | OData list-response has value array | OData v4.01 | 5 | warn | mech | P3 | L | S | |
| SCF-12 | OData $-prefix params allowed-set | OData v4.01 | 5 | hint | mech | P3 | L | S | |
| SCF-13 | AIP custom-method paths use POST (or GET read-only) | AIP-136 | 5 | warn | mech | P3 | L | S | |
| SCF-14 | AIP list-ops parent/page_size/page_token (verbatim "must") | AIP-132 | 5 | hint | mech | P3 | L | S | |
| SCF-15 | AIP resource paths alternate collection/id | AIP-122 | 5 | hint | mech | P3 | L | S | |
| SCF-16 | AIP field-names lower_snake_case + lowerCamelCase collections | AIP-140/122 | 5 | hint | mech-stat | P3 | L | M | |
| SCF-17 | AIP time-fields imperative (*_time NOT *ed_time) | AIP-142 | 5 | hint | mech | P3 | L | S | apiq I4 form |

#### Lens 6 — Privacy / Data-Classification (NEW Round-2)

| Pattern-ID | Title | Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| TM-A15 | PII-named-fields in response (already listed Lens 1) | OWASP API3 + OAI #2190 + Cloudflare + truffleHog/Gitleaks | 1, **6** | warn | mech-config | P1 | H | M | Lens-6 cornerstone |
| TM-A16 | email format declared (already listed Lens 1) | OWASP + OAI #2190 | 1, **6** | hint | mech | P3 | H | S | |
| L6-1 | PII-named field on path/query parameters | OWASP API3 generalized to params | **6**, 1 | warn | mech-config | P2 | M | S | New — extends TM-A15 to params |
| L6-2 | Vendor-extension PII-tag presence (positive marker) | Cloudflare PII-redaction + OAI #2190 | **6** | hint (info-tier) | mech | P5 | L | S | x-pii-tag / x-data-class — positive marker |
| L6-3 | Health-record-like field-name (PHI hint) | HIPAA-relevance heuristic | **6** | hint (off-by-default) | mech-config | P3 | L | S | Vendor-config-driven |
| L6-4 | Default-values containing literal PII patterns | TruffleHog/Gitleaks regex | **6**, 1 | warn | mech | P2 | L | M | secret-scanner module |

#### Lens 7 — Operations / HTTP-protocol-Performance (NEW Round-2)

| Pattern-ID | Title | Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| RFC2-25..29 | Conditional-request infrastructure (covered Lens 2) | RFC 7232 / 9110 | 2, **7** | (covered) | — | — | — | — | Re-tag |
| RFC2-30..34 | Range-request infrastructure (covered Lens 2) | RFC 7233 / 9110 | 2, **7** | (covered) | — | — | — | — | Re-tag |
| RFC2-35..39 | Caching directives (covered Lens 2) | RFC 7234 / 9111 | 2, **7** | (covered) | — | — | — | — | Re-tag |
| RFC2-93..96 | Rate-limit + Retry-After (covered Lens 2) | RFC 6585 + draft-ratelimit | 2, **7** | (covered) | — | — | — | — | Re-tag |
| L7-1 | List-endpoint without cache-headers (cacheable-GET) | RFC 9111 + cross-industry | **7**, 4 | hint | mech-stat | P3 | M | M | New |

#### Lens 8 — Internal-Consistency (NEW Round-2)

| Pattern-ID | Title | Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| RFC2-3 | problem-status matches HTTP status (covered Lens 2) | RFC 9457 §3.1.2 | 2, **8** | (covered) | graph | P2 | L | M | Re-tag |
| RFC2-5 | Problem-class type-URI uniqueness cross-spec (covered Lens 2 + USP) | RFC 9457 §4 | 2, **8** | (covered USP) | graph | **P1 (USP)** | L | M | Re-tag |
| RFC2-28 | ETag consistency cross-resource ops (covered Lens 2) | RFC 9110 | 2, **8** | (covered) | graph | P3 | L | M | Re-tag |
| RFC2-39 | 304/200 same ETag-shape (covered Lens 2) | RFC 9111 | 2, **8** | (covered) | graph | P3 | L | M | Re-tag |
| L8-1 | Property name+type consistency cross-schemas (apiq G-SP-5) | apiq existing | **8**, 4 | hint | graph | P2 | M | M | Re-tag |
| L8-2 | Hash-duplicate schemas (apiq M7) | apiq existing | **8** | hint | mech-stat | P2 | M | M | Re-tag |
| L8-3 | Component-duplicate-hash (apiq O3) | apiq existing | **8** | hint | mech | P3 | L | S | Re-tag |
| L8-4 | Cross-op response-shape consistency (apiq D1, DM-9/10) | apiq existing | **8**, 4, 5 | warn | graph | P2 | M | M | Re-tag |

#### Lens 9 — AI-Agent-Consumability (NEW Round-2)

| Pattern-ID | Title | Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| L9-1 | Examples-coverage on operations (apiq W4 strengthened) | Postman 2025 + Speakeasy + Fern | **9**, 4 | hint | mech-stat | P2 | M | M | Walker |
| L9-2 | description.length × parameter.count ratio | Postman 2025 + agentic-patterns | **9**, 4 | hint | mech-stat | P3 | M | M | Walker |
| L9-3 | Error-schema discoverability for AI-recovery | Postman 2025 + Speakeasy | **9**, 4 | hint | graph | P3 | M | M | |
| L9-4 | Pagination-cursor stability documentation | Postman 2025 | **9**, 4 | hint | heuristic | P3 | L | S | |
| L9-5 | operationId machine-friendly + concise (≤30 chars + verb-noun) | Speakeasy + LLM-friendly-API | **9**, 4 | hint | heuristic | P3 | M | S | |
| L9-6 | summary present + ≤80-char single-sentence | LLM-friendly-API + Speakeasy | **9**, 4 | hint | mech-stat | P3 | M | S | |
| L9-7 | Capability-discovery endpoint (positive marker) | FHIR + MCP + .well-known | **9**, 10 | hint (info-tier) | mech | P5 | L | S | F-4 / F-16 |
| L9-8 | Function-call-friendly schema (no anyOf complexity) | OpenAI function-calling + MCP | **9** | hint | mech | P3 | M | S | |

#### Lens 10 — Operational-Metadata-Coverage (NEW Round-2 Phase F)

| Pattern-ID | Title | Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| F-1 | Sunset header on deprecated operations | RFC 8594 + FAPI + EV-1 | 3, **10** | warn | mech | P2 | L | S | apiq H4/J3 strengthen |
| F-6 | Retry-After on 429+503 (covered RFC2-94/96) | RFC 9110 + cross-industry | 7, **10** | (covered) | mech | — | — | — | Re-tag |
| F-7 | RateLimit-* headers when 429 declared | OpenAI + GitHub + Stripe + draft | 7, **10** | hint (warn post-RFC) | mech | P2 | M | S | New cornerstone |
| F-10 | SLA4OAI / x-sla / x-rate-limit / x-quota presence | SLA4OAI + MAP | **10** | hint (info-tier positive-marker) | mech | P5 | L | S | Positive marker |
| F-16 | Capability-discovery endpoint (covered Lens 9) | FHIR + MCP | 9, **10** | hint (info-tier) | mech | P5 | L | S | |
| L10-1 | 429 declared without ANY rate-limit signaling | RFC 7231 + draft + apiq C9 | **10**, 7, 1 | warn | mech | P1 | M | S | Compound |
| L10-2 | Some ops have rate-limit headers, others don't (consistency) | cross-industry | **10**, 4, 8 | warn | mech-stat | P2 | M | M | New |
| L10-3 | deprecated:true ops without sunset extension OR Sunset header | OWASP API9 + EV-1 | **10**, 3 | warn | heuristic | P2 | L | S | Compound |
| L10-4 | externalDocs.url declared but stub | FAIR + Postman + RapidAPI | **10**, 4, 9 | hint | mech | P3 | M | S | F-9 stub-check (offline) |
| L10-5 | info.contact substantive (URL/email valid structure) | FAIR + Postman | **10**, 4, 9 | hint | mech | P3 | H | S | F-8 |
| L10-6 | info.license substantive | FAIR + Postman | **10**, 4, 9 | hint | mech | P3 | H | S | F-8 |

#### Cross-Lens / Phase-F-Direct Additions

| Pattern-ID | Title | Sources | Lens | Severity | Detection | Priority | Freq | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| F-2 | Accept-Language support on user-facing ops | i18n | 2, 4 | hint (off-by-default) | mech-stat | P3 | L | M | |
| F-3 | Time-zone-explicit datetime (RFC 3339 with Z/±) | i18n + RFC 3339 | 2, 4 | hint | mech | P3 | M | S | apiq I4 strengthen |
| F-5 | Consistent expand/fields query-param cross-getters | TM Forum + Stripe + GitHub | 4, 5 | hint | mech-stat | P3 | L | M | New (action-item from Phase F) |
| F-11 | Linguistic anti-pattern: Amorphous URI | Palma/Khomh DOLAR | 4, 5 | warn (subset)/hint | mech | P2 | M | S | Already partial |
| F-12 | Linguistic anti-pattern: Tiny Resource (1-2 chars) | DOLAR | 4, 5 | hint | mech | P3 | L | S | New |
| F-13 | Linguistic anti-pattern: Forgotten Verbs | DOLAR | 5 | hint | graph | P3 | M | M | apiq §5 formalize |
| F-14 | Linguistic anti-pattern: Pluralised Nodes (sing/plur on same resource) | DOLAR | 5 | warn | graph | P2 | M | M | Refines apiq S7 |
| F-15 | Polymorphism @type wire-discriminator convention | TM Forum + JSON:API + Schema.org | 5 | hint | graph | P3 | L | M | |
| F-17 | POLA — Operation summary doesn't contradict HTTP method (covered SC-3) | Bloch + Qt + SC-3 | 4, 5 | warn | heuristic | P2 | M | S | Re-tag |
| F-18 | Doc-smell: Bloated description (>2000 words) | API Docs Smells arXiv | 4 | hint | mech-stat | P5 | L | S | New |
| F-19 | Doc-smell: Lazy description (copy of name) | API Docs Smells arXiv | 4 | hint | mech | P3 | M | S | New angle on substantive-rule |
| F-20 | Bearer scheme bearerFormat declared (covered RFC2-57) | RFC 7519 + FAPI | 1, 2 | hint | mech | P3 | M | S | Re-tag |

### Cross-Lens Patterns (multi-tagged)

Patterns that explicitly span 2+ Lenses (a representative subset; complete tagging in tables above):

| Pattern | Lenses |
|---|---|
| Y-2/Y-3 (creds in URL) | 1, 2 |
| Y-7 / RFC2-60/61 (OAuth2 implicit/password) | 1, 2, 3 |
| Y-15 / TM-A34 (URL-handling-params) | 1, 2 |
| TM-A15 (PII-named-fields response) | 1, 6 |
| TM-A50 (webhook-signature) | 1, 2 |
| RFC2-14 (405 → Allow) | 2, 7 |
| RFC2-25..29 (conditional infra) | 2, 7 |
| RFC2-93..96 (rate-limit) | 2, 7, 10 |
| RFC2-94 (429 → Retry-After) | 2, 7, 1, 10 |
| RFC2-3 / RFC2-5 (problem-details consistency) | 2, 8 |
| EV-49 / C9 (429 + Retry-After + Lens-3) | 1, 2, 3, 7, 10 |
| CL-15 (int64 without format) | 4, 3, 1 (precision-loss + drift + JS-overflow attack) |
| F-5 (expand/fields cross-getters) | 4, 5 |
| F-7 (RateLimit-* headers) | 7, 10 |
| L9-7 / F-16 (capability-discovery) | 9, 10 |
| SC-9 (error-shape coherence) | 2, 4, 5 |
| SC-18 (casing × content-type style) | 4, 5 |
| TM-A53 / RFC2-40 (401 needs WWW-Authenticate) | 1, 2 |

### Phase-F Action Items integrated

- **F-5 (expand/fields cross-getter consistency)** — integrated as Cross-Lens Phase-F-Direct rule above (P3, mech-stat).
- **F-10 (SLA4OAI extension presence)** — integrated as Lens-10 positive-marker (P5, info-tier).
- **DOLAR linguistic anti-patterns (F-11/F-12/F-13/F-14)** — integrated as Phase-F-Direct rules (4-6 rules covered).
- **ISO/IEC 25010 quality-characteristic tagging** — recommended-application: every Stage-A rule's metadata carries an `iso25010` tag in `{functional-suitability, performance-efficiency, compatibility, usability, reliability, security, maintainability, portability}`. Mapping: Lens-1/6 → security; Lens-4/5 → usability; Lens-3 → maintainability; Lens-7/10 → reliability + performance-efficiency; Lens-2/9 → compatibility; Lens-8 → functional-suitability.
- **Springer-Delphi 28-high-importance cross-reference** — see Putz-Niveau Benchmark below.

### Out-of-Scope / Delegate Sections (NOT in Stage A)

#### Delegated to Phase B (LLM)

| Pattern | Source | Why-LLM-territory |
|---|---|---|
| RFC2-9 / OOS-1 (Safe methods MUST NOT have side effects) | RFC 9110 §9.2.1 | Semantic intent inspection |
| RFC2-10 / OOS-2 (Idempotent methods MUST be idempotent) | RFC 9110 §9.2.2 | Semantic + runtime |
| RFC2-49 (Prefer:return=representation) | RFC 7240 §4.2 | Semantic — what is "representation" |
| RFC2-51 (custom headers SHOULD be SFV when list/dict) | RFC 9651 | Intent-of-header-value |
| CL-11 (anyOf where oneOf intended) | Speakeasy + openapi-gen | Semantic mutual-exclusivity reasoning |
| CL-49 (Doc-vs-Schema divergence) | Lens-4 + OAI | NLP description-vs-schema reasoning |
| EV-58 (deprecated:true op + active enum value) | OAS-3.3-PROP | Semantic contradiction |
| U-A1 (Tenant-isolation detection) | OWASP API1 | Cross-spec semantic resource-graph |
| U-A2 (admin-by-purpose beyond URL-heuristic) | OWASP API5 | Description NLP |
| U-A3 (sensitive-business-flow classification deeper than path-keyword) | OWASP API6 | Semantic |
| U-A4 (excessive-data-exposure beyond PII-heuristic) | OWASP API3 | Intent of endpoint |
| U-A5 (verbose-error stack-trace in example-content) | OWASP API8 | Example-content NLP |
| U-A6 (response status-codes semantically-make-sense) | OWASP REST | Semantic |
| U-A7 (TLS-version-policy in description) | OWASP API8 | Description NLP |
| U-A13 (single sign-on hygiene beyond openIdConnectUrl-https) | OWASP API2 | Semantic |
| U-A14 (refresh-token rotation strategy in description) | OWASP API2 + RFC 6819 | Description NLP |
| U-A15 (scope granularity smell read_all vs read:invoices.list) | OAuth-BCP | Semantic |
| U-A17 (CORS-origin-reflection beyond heuristic) | OWASP CORS | NLP |
| UNS-2 (operation-summary verb contradicts method beyond keyword) | RFC 9110 | NLP |
| UNS-7 (Link rel="alternate" requires alternate availability) | RFC 8288 + IANA | Semantic |
| UNS-8 (OAuth2 scope-naming-convention coherence) | RFC 6749 | Convention-driven NLP |
| OOS-6 (REST verbs for state changes — soft NLP) | Fielding + Microsoft | Semantic |
| OOS-7 (Hypermedia-discoverability runtime quality) | Fielding | Runtime + semantic |
| U-SC-2 (field-mask AIP annotation-faithful) | AIP-134/203 | Annotation semantics |
| U-SC-7 (HATEOAS-completeness for declared style) | Fielding HAL Siren | Semantic state-transition |
| **All FinTech FDX naming + HealthTech FHIR resource-naming** | Phase-F survey | Domain-knowledge |

#### Out-of-scope (requires runtime / two-spec-diff / vendor-detection)

| Pattern | Source | Reason | Possible-future-feature |
|---|---|---|---|
| OOS-3 / OOS-4 (ETag/Last-Modified runtime) | RFC 7232 | Runtime contract | Live-mode validation (epic post-launch) |
| OOS-5 (Cache-Control honoured) | RFC 7234 / 9111 | Runtime | — |
| OOS-6 (WWW-Authenticate semantic content) | RFC 7235 / 9110 | Semantic NLP | LLM Phase B |
| OOS-7 (JWT signature acceptable) | RFC 7519 / 8725 | Runtime | — |
| OOS-9 (Range-request server actually supports) | RFC 7233 | Runtime | — |
| OOS-13 (URI normalization applied) | RFC 3986 | Runtime/proxy | — |
| OOS-14 (JSON parsing UTF-8 strict) | RFC 8259 | Runtime | — |
| OOS-15 (Sunset/Deprecation honoured) | RFC 8594 + draft | Runtime/client-side | — |
| OOS-16 / OOS-17 (RateLimit / Retry-After actual values) | draft-ratelimit + RFC 7231 | Runtime | — |
| OASDIFF OOS-1..20 (all two-spec breaking-change rules) | OASDIFF + OPTIC + pb33f | Requires v1+v2 spec | Diff-mode epic post-launch |
| U-A11 (API-version-set inventory check) | OWASP API9 | Runtime / multiple endpoints | — |
| U-A12 (dormant endpoint detection) | OWASP API9 | Runtime traffic | — |
| U-A18 (test/sandbox endpoints in production) | OWASP API9 | Heuristic on hostname; off-by-default | Apiq workspace-policy mode |
| OOS-CL-1..6 (run codegen tools and capture output) | openapi-generator + ReDoc + Swagger-UI + Stoplight | Runtime tools | Future opt-in module |
| OOS-CL-7 (cross-spec-version-diff Octokit-style) | Octokit + oasdiff | Two-spec | Diff-mode epic |
| OOS-CL-8 (inferring schema from real API responses) | apiq §15 | Runtime traffic | Apiq spec-vs-traffic mode |

#### Vendor/Org-Specific (skip with reasoning)

| Pattern | Source | Reason |
|---|---|---|
| S-A1..S-A5 (MFA/lockout/password-strength/pwned-passwords markers) | OWASP Auth | Vendor-extension; no standardization |
| S-A6 (HSTS max-age ≥ 1 year) | MDN HSTS | Spec-visible only as default-value; opinion-divided per MDN |
| S-A7..S-A8 (device-fingerprinting / IP-allowlist) | OWASP API6 | Runtime-only |
| S-A9..S-A10 (audit-log-redaction / HIPAA/PCI markers) | OAI #2190 + Cloudflare | Vendor-extension; revisit when standardized |
| S-A11..S-A12 (rate-limit-by-UA / captcha vendor-extensions) | OWASP API6 | Vendor-extension |
| S-A13 (session-cookie attributes) | OWASP HTTP-Headers | Cookies rarely declared per-op in OAS |
| UNS-4 (apiKey in:cookie + Set-Cookie documentation) | OAS + RFC 6265 | Vendor-context |
| UNS-5 (open-vs-closed enum extensibility x-ms-enum.modelAsString) | Azure | Vendor-specific |
| UNS-12 (RFC 8941/9651 SFV grammar in custom headers) | RFC 8941/9651 | High-effort, low-frequency 2026 |
| UN-CL-1 (Redocly-specific x-tagGroups / x-logo) | Redocly | Vendor UX-hint |
| UN-CL-3 (Stripe-style x-resourceId / x-expandableFields) | Stripe-codegen | Vendor-codegen-specific |
| **All FinTech FAPI-runtime / mTLS / DPoP / PSD2 SCA** | OpenID FAPI / PSD2 | Runtime + business-context |
| **Apollo Federation / Shopify GraphQL @key/@shareable** | Federation | GraphQL not OpenAPI |
| **OpenTelemetry semantic-conventions for span attributes** | OTel | Run-time instrumentation |
| **MCP transport-protocol details** | MCP | Separate transport-spec |
| **HIPAA / PCI / FERPA-specific markers** | Compliance | Domain-knowledge |
| **Sustainability / green-software / carbon-aware patterns** | Green Software Foundation | Too speculative |
| **Government accessibility-WCAG-for-APIs** | NHS / GOV.UK | Mostly content-level |

### Severity-Schema (post-Round-2)

**4-tier severity**:
- `error` — Fatal-validity violation OR RFC-2119 MUST violated; CI-blocking.
- `warn` — RFC-2119 SHOULD violated, OR strong cross-source consensus; review-blocking.
- `hint` — Soft signal; informative; opinion-divided OR low-confidence-heuristic; off-by-default-overridable.
- `info` (NEW Round-2 Phase F) — Positive-marker / observation; not a "finding" per se. E.g. SLA4OAI-presence, capability-discovery-endpoint-presence. Below `hint`.

**Direction-modifier (Lens-3 specific, per Phase C)**:
- `tighten` — server adds constraint later; absence-today permits future tightening.
- `loosen` — server removes/expands later; presence-today implies future-removal-or-expansion-breaking.
- `drift` — internal contradiction; future-fix is breaking.

**Multi-lens-tags**: each rule MAY have 2+ lenses (e.g. Y-3 has `[1, 2]`, RFC2-94 has `[1, 2, 7, 10]`).

**Source-distinction**: rule metadata carries `source-type` ∈ `{rfc-N, bcp-N, iso-25010-X, iana-registry-Y, vendor-Z, owasp-cheat, code-gen-issue, paper-X}`.

**Codegen-targets** (Lens 4 patterns): rule MAY have `targets: ['*']` OR `targets: ['java', 'go', 'python', 'typescript', 'rust', 'csharp', 'kotlin']`. Default `*` = all.

**Lens-tags**: required field; values `[1..10]` per Round-2 framework.

**ISO/IEC 25010 quality-characteristic** (NEW Round-2 Phase F): each rule MAY carry `iso25010` ∈ `{functional-suitability, performance-efficiency, compatibility, usability, reliability, security, maintainability, portability}` for severity-justification + marketing.

**Stakeholder × Lifecycle × Defect-Class meta-tags** (NEW Round-2 Phase F validated): each rule MAY carry `stakeholder` + `lifecycle` + `defect-class` for output-grouping. Values per `meta-insights.md` Round-2 Validation appendix.

### Putz-Niveau Benchmark — apiq vs Springer-Delphi-28-high-importance

The Springer Delphi study (arXiv 2108.00033) ranked 82 RESTful API design rules by 21 industry experts; **28 emerged as high-importance**. Below mark which Pattern-ID covers each. Gaps are explicit ✗ entries to close.

| # | High-importance rule (Delphi) | apiq coverage | Pattern-ID(s) |
|---|---|---|---|
| 1 | Use plural nouns for resources | ✓ | apiq S7, SC-6, F-14 |
| 2 | Use HTTP methods semantically | ✓ | apiq B-SP-2/3/9, SC-3, RFC2-7/8 |
| 3 | Use HTTP status codes semantically (RFC 7231/9110) | ✓ | apiq C* + RFC2-16/8/14/40 |
| 4 | Use proper HTTP authentication mechanisms (no Basic on HTTP) | ✓ | Y-4, RFC2-43, RFC2-62 |
| 5 | Use TLS for transport (HTTPS only) | ✓ | Y-17, RFC2-62 |
| 6 | Provide consistent error messages (problem+json) | ✓ | K1/K2/K4 + RFC2-1..6 + SC-9 |
| 7 | Use OAuth2 / OpenID Connect for auth | ✓ | F-SP-* family + RFC2-60..65 |
| 8 | Apply API versioning explicitly | ✓ | H1/H2 + EV-9/10/13/37 |
| 9 | Provide examples in documentation | ✓ | apiq examples-coverage walker (W4) + L9-1 |
| 10 | Use camelCase or snake_case consistently | ✓ | apiq G1/G2 + SC-18 |
| 11 | Use lowercase letters in URIs | ✓ | apiq S* + RFC2-71/72 |
| 12 | Use hyphens to improve readability of URIs | ✓ | apiq S-SP-* (hyphenation) |
| 13 | Avoid file extensions in URIs | ✓ | apiq S-SP-6, EV-27, CL-50, F-11 |
| 14 | Use forward slash to indicate hierarchy | ✓ | spectral path-template |
| 15 | Avoid trailing forward slashes | ✓ | apiq S-SP-* |
| 16 | Validate request inputs | ✓ | A-MIN-1, EV-23/24, M9/M10 + RFC2-82 |
| 17 | Provide pagination for list endpoints | ✓ | E1/E2/E3, SC-8, TM-A22, SCF-14 |
| 18 | Use HATEOAS where appropriate (consistency check, not mandate) | ✓ (consistency) | SC-4, SCF-7/8 |
| 19 | Document the API thoroughly | ✓ | apiq R-SP-1, CL-63, info-description-substantive |
| 20 | Maintain backward compatibility | ✓ | All Lens-3 EV-* patterns |
| 21 | Use Content-Type / Accept headers properly | ✓ | RFC2-78, B-SP-4, EV-30 |
| 22 | Provide rate-limiting and document it | ✓ | RFC2-93/94, F-7, L10-1 |
| 23 | Use appropriate cache control | ✓ | RFC2-35..39 |
| 24 | Use ETags for concurrency control | ✓ | RFC2-25..29, C10, RFC2-50 (state-change ops) |
| 25 | Use proper resource naming conventions | ✓ | S7, SC-6, F-14 |
| 26 | Provide clear contact / license info | ✓ | apiq spectral defaults + Y-A48 + L10-5/6 |
| 27 | Use idempotency keys for non-idempotent operations | ✓ | Y-25, RFC2-90 |
| 28 | Detect and report breaking changes | ⚠ partial (single-spec prediction only; full diff out-of-scope) | Lens-3 EV-* + future "evolution mode" plug-in |

**Coverage:** 27 of 28 fully covered + 1 partial (breaking-change detection — single-spec-prediction part covered, two-spec-diff documented out-of-scope as future feature).

**Reputation-load-bearing claim defensible:** apiq covers ALL 28 high-importance Springer-Delphi rules; the one partial (#28) is by-architecture (single-spec scope) with clear future-roadmap.

### Status — Mining-Round-2 Master-Konsolidierung

- **Konsolidiert:** 2026-05-05 evening.
- **Total Stage-A patterns (take-into-apiq):** ~290 (after dedup + cross-phase consolidation across the 364 raw mining-patterns).
- **By Lens** (primary-tag count; many patterns are multi-tagged):
  - Lens 1 (Threat): 25 (Y-1..25) + 54 (TM-A1..54) = ~70
  - Lens 2 (Standards): ~95 (RFC2-1..105 minus LLM-only)
  - Lens 3 (Evolution): ~58 (EV-1..62 minus LLM-only)
  - Lens 4 (Client): ~78 (CL-1..81 minus LLM-only)
  - Lens 5 (Style): 25 (SC) + 17 (SCF) = 42
  - Lens 6 (Privacy): 4 + cross-tagged from Lens 1
  - Lens 7 (Operations): 0 unique + cross-tagged from Lens 2
  - Lens 8 (Internal-Consistency): 0 unique + cross-tagged
  - Lens 9 (AI-Agent): 8 + L9-1..8
  - Lens 10 (Operational-Metadata): 6 + cross-tagged
  - Phase-F-Direct: 12 (F-2/3/5/11..15/17..20)
- **Severity-upgrades validated:**
  - Y-7 / F-SP-3 / RFC2-60/61: warn → **error** (RFC 9700 BCP-240, 2025)
  - C9 / RFC2-94: warn → **error** (cross-source consensus + verbatim "MUST send Retry-After")
  - C5 / TM-A53 / RFC2-40: warn → **error** (RFC 9110 §11.6.1 verbatim "MUST")
  - Y-8: off-by-default → **on-by-default warn** (multi-source confirm RFC 8725)
  - K2 / problem+json: hint → warn (RFC 9457 + multi-source)
  - SC-6 (resource-name pluralization): hint → warn (Phase E mining recommendation)
- **New module candidates (Round-2)**:
  1. `secret-scanner.ts` — TruffleHog/Gitleaks regex on default/example/description (TM-A* + L6-4)
  2. `http-protocol-pairings.ts` — declarative param↔header / status↔header / scheme↔challenge pairings (RFC2-14/15/20-26/30-32/40-41/48/94/96)
  3. `oauth2-flow-validator.ts` — RFC 9700 BCP-240 wrapper (RFC2-60..65)
  4. `media-type-iana-validator.ts` — RFC 6838 + IANA registry (RFC2-75..79)
  5. `json-schema-draft-version-detector.ts` — version-conditional rule firing (RFC2-84..89)
  6. `problem-json-validator.ts` — RFC 9457 cross-response invariants (RFC2-1..5 incl. USP RFC2-5)
  7. `style-classifier.ts` — first-classify-then-conditional-fire (Phase E SC-* + SCF-*)
  8. `webhook-signature-detector.ts` — TM-A50 dedicated module (sleeper-killer rule)
- **Convergence signal:** Round-1 → 5 lenses; Round-2 A-E → +4 lenses; Round-2 F → +1 lens (10). Each round adds fewer lenses; pattern-mining declared converged at **10 lenses**.
- **Implementation:** Wave 2 ticket-allocation per `big-spec-architecture-spike-stage-a-implementation-priority.md`.


## Round-3 Additions (2026-05-07)

> Round-3-Mining lieferte 122 candidate-patterns aus 4 Source-Familien (Books, Postmortems, API-Corpus, Round-2-Re-Audit-Orphans). Source-Files: `mining-round3-{books,postmortems,reaudit,corpus,corpus-download}.md`. Strict-citation-gating per D1+D3 (≤200 chars verbatim + web-verifiable URL). Per D13 integriert in eigene Section am Ende, NICHT in-line in existing Lens-Tabellen. Pattern-IDs behalten ihre source-prefixes (R3-BK-* / R3-PM-* / R3-CO-* / R3-RA-*) per D17. 100%-Duplikate sind im source-file als "extends-X" markiert; sie tauchen in der Pattern-Tabelle mit `relates-to-existing` Spalte auf, aber sind kein neuer master-row.

### Source-Family-Stats

| Family | Patterns emitted | Avg. citation-quality | Stop-Reason |
|---|---:|---|---|
| Books | 51 | 100% verbatim+URL | Plausibility (21 books surveyed, 14 discovered) |
| Postmortems | 42 | 100% verbatim+URL | Plausibility (36 postmortems surveyed, 28 discovered) |
| API-Corpus | 11 derived + 10 statistics | manifest-anchored | Corpus-saturation (518 healthy specs) |
| Re-Audit Orphans | 18 (4 active + 5 OOS + 9 doc) | source-traced | Audit-saturation (97.5% adoption) |
| **Total** | **122 candidates** | | |

### Lens-Coverage-Lift-Tabelle

| Lens | Round-2-Master | Round-3-Books | Round-3-Postmortems | Round-3-Corpus | Round-3-ReAudit | Round-3-Total |
|---|---:|---:|---:|---:|---:|---:|
| 1 Threat-Modeling | ~70 | 5 | 8 | 2 | 0 | +15 |
| 2 Standards-Compliance | ~95 | 5 | 0 | 2 | 0 | +7 |
| 3 Evolution-Friction | ~58 | 6 | 16 | 1 | 0 | +23 |
| 4 Client-Friction | ~78 | 11 | 0 | 2 | 0 | +13 |
| 5 Style-Coherence | 42 | 5 | 0 | 2 | 4 OOS | +7 active +4 OOS |
| 6 Privacy-Data-Class | 6 | 3 | 4 | 0 | 0 | +7 |
| 7 Operations | ~5 (cross-tagged) | 4 | 4 | 1 | 1 | +10 |
| 8 Internal-Consistency | ~8 (cross-tagged) | 5 | 4 | 0 | 0 | +9 |
| 9 AI-Agent | 8 | 3 | 3 | 0 | 1 | +7 |
| 10 Operational-Metadata | 6 | 4 | 3 | 1 | 1 | +9 |

> Notes: Re-Audit-Orphan-Spalte zählt nur die `R3-RA-*` integration-vorschläge (4 active = R3-RA-7-1, R3-RA-9-1, R3-RA-10-1, R3-RA-10-2). Lens 5 OOS-Cluster (U-SC-3/4/5/8 + CL-71) ist Cluster aus 5 OOS-orphans, separat gezählt.

### Patterns per Lens

#### Lens 1 — Threat-Modeling

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-TM-01 | books:Madden API Sec | Specs without rate-limit declaration violate Madden's first-decision principle | warn | true | true | C9, C-SP-1, Y-1 |
| R3-BK-TM-02 | books:Jin/Sahni/Shevat | Webhook ops without signature-verification header leak replay/forgery | warn | true | true | U1, U2, U-SP-1 |
| R3-BK-TM-03 | books:Jin/Sahni/Shevat | OAuth scopes only `*`/`all`/`admin` violates least-privilege | hint | true | true | F5, F-SP-1, F-SP-3 |
| R3-BK-TM-04 | books:Jin/Sahni/Shevat | OAuth2 flows without `refreshUrl` = no token-rotation | warn | true | true | F-SP-2, Y-6 |
| R3-BK-TM-05 | books:MAP API Key | API-Key in `query` (not header) = URL-logging-leak vector | hint | true | true | Y-2, F-SP-1 |
| R3-PM-TM-01 | postmortem:PayPal IPN | Webhook receivers using legacy MD5/SHA-1 sigs = weak crypto drift | warn | true | true | TM-A50, RFC2-58 |
| R3-PM-TM-02 | postmortem:AWS SigV2→V4 | Pre-signed URL ops should document max-validity-window | hint | false | false | Y-2, Y-3, RFC2-21 |
| R3-PM-TM-03 | postmortem:Optus breach | PII-returning ops MUST declare non-empty `security` array | error | true | true | TM-A15, F2, F4, F10 |
| R3-PM-TM-04 | postmortem:Parler | Sequential int-IDs on user-content paths = enumeration-attractive | warn | true | true | J3, CL-15, CL-16 |
| R3-PM-TM-05 | postmortem:USPS | Wildcard search-params without per-tenant scope = mass-extraction | warn | false | false | E1, E6, TM-A26 |
| R3-PM-TM-06 | postmortem:OWASP API1 BOLA | Path `/users/{id}` without scope-binding = BOLA-attractive | hint | false | false | F4, F10, TM-A15 |
| R3-PM-TM-07 | postmortem:GraphQL/Shopify | GraphQL endpoints should warn introspection-disabled-in-prod | hint | true | true | (new) |
| R3-PM-TM-08 | postmortem:0ktapus | SMS-MFA security-schemes flagged as weakened | hint | false | false | F-20, RFC2-57 |
| R3-CO-TM-01 | corpus:518-specs | 23.4% public APIs declare no `securitySchemes` (corpus-stat) | warn | true | true | TM-A-1, TM-A-7 |
| R3-CO-TM-02 | corpus:518-specs | 22.2% healthy APIs leave write-ops unsecured (corpus-stat) | warn | true | true | TM-A-2, TM-A-9 |

#### Lens 2 — Standards-Compliance

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-ST-01 | books:Massé Rulebook | Path-segments with underscore violate Massé URI-rule | hint | true | true | G4, S1, S-SP-9 |
| R3-BK-ST-02 | books:Massé | Path-segments not kebab-case (camelCase/snake_case) suboptimal | hint | true | true | G4, S-SP-9 |
| R3-BK-ST-03 | books:Massé | Trailing slash in URIs MUST NOT exist (extends-S3) | warn | true | true | S3 |
| R3-BK-ST-04 | books:Massé | Pseudo-hierarchy via `.`/`:` (e.g. `/users.123`) is RPC-leak | hint | true | true | S8, S-MIN-1 |
| R3-BK-ST-05 | books:Massé | Spec-wide error-shape MUST be consistent (extends-K2) | warn | true | true | K2, K1, EV-11 |
| R3-CO-SC-01 | corpus:518-specs | RFC-7807 adoption=0.0%; 58.5% specs declare no 4xx (downgrade to hint) | hint | true | true | SC-7, SC-12 |
| R3-CO-SC-02 | corpus:518-specs | JSON-only=60.6%; `*/*` catch-all 0.6% = ambiguous-parsing anti-pattern | hint | true | true | SC-3, SC-9 |

#### Lens 3 — Evolution-Friction

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-EV-01 | books:MAP SemVer | `info.version` not X.Y.Z = MAP SemanticVersioning violation | warn | true | true | H2, EV-9, EV-13 |
| R3-BK-EV-02 | books:MAP Aggressive Obs | `deprecated:true` without sunset+replacement = fail (extends-EV-1) | warn | true | true | EV-1, R4, H4 |
| R3-BK-EV-03 | books:MAP LLG | `deprecated`-marker without SLA-link = no expiration-date pointer | hint | false | true | V1, V2, EV-1 |
| R3-BK-EV-04 | books:MAP Two-in-Prod | Multi-version-coexistence detection (positive marker) | hint | false | true | H1, H-SP-1, EV-10 |
| R3-BK-EV-05 | books:MAP Exp Preview | "beta"/"preview" prose without `x-experimental` per-op marker | hint | true | true | EV-26 |
| R3-BK-EV-06 | books:Geewax | Versioning-strategy categorization (3 strategies, prose-required) | hint | false | false | EV-9, EV-13 |
| R3-PM-EV-01 | postmortem:Twitter v2 | Sunset <30d before EOL = anti-pattern (compound EV-1) | warn | true | true | EV-1, F-1, L10-3 |
| R3-PM-EV-02 | postmortem:Twitter v2 | `info.x-pricing-tier` positive-marker for tier-change-introspection | hint | true | true | F-10, L10-1 |
| R3-PM-EV-03 | postmortem:Twitter | Multi-version-coexist v1+v2 without Sunset on v1 = fragile | warn | true | true | EV-1, EV-10, H1 |
| R3-PM-EV-04 | postmortem:Reddit | Pricing-discontinuity → declare `x-rate-limit-cost-per-request` | hint | false | true | F-10, L10-1 |
| R3-PM-EV-05 | postmortem:Reddit Apollo | `info.termsOfService` enables ToS-change diff-detection | hint | true | true | F-8 (analog) |
| R3-PM-EV-06 | postmortem:PayPal IPN | Multi-year EOL-runway as positive-marker (info-tier) | hint | true | true | EV-1, F-1, L10-3 |
| R3-PM-EV-07 | postmortem:GitHub brownouts | `x-brownout-schedule` industry-best deprecation-validator | hint | true | true | EV-1, F-1, L10-3 |
| R3-PM-EV-08 | postmortem:Stripe | Date-based versioning (`2024-09-30`) = positive-marker info-tier | hint | true | true | EV-13, H2 |
| R3-PM-EV-09 | postmortem:Stripe pinning | Account-pinning needs `Stripe-Version`-header param documented | hint | true | true | EV-10, RFC2-69 |
| R3-PM-EV-10 | postmortem:Heroku free | Tier-removal-without-replacement = evolution-disaster (extends F-10) | hint | false | true | F-10 |
| R3-PM-EV-11 | postmortem:Slack RTM | Graceful-deprecation phasing (`x-deprecation-phase`) positive-marker | warn | true | true | EV-1, EV-10, F-1 |
| R3-PM-EV-12 | postmortem:Atlassian | Multi-phase deprecation (deprecated→hybrid→shutdown) positive-marker | hint | true | true | EV-1, F-1 |
| R3-PM-EV-13 | postmortem:Mandrill | Auth-flow-substitution (independent→linked-parent) = disaster | hint | false | false | F1, F8 |
| R3-PM-EV-14 | postmortem:Azure AD Graph | Multi-year deprecation w/ extension-checkpoints positive-marker | hint | true | true | EV-1, F-1, L10-3 |
| R3-PM-EV-15 | postmortem:Twilio 2008 | Path-version-prefix span >5 years = accumulated migration-debt | warn | true | true | EV-10, EV-53, H1 |
| R3-PM-EV-16 | postmortem:Imgur ToS | Content-revocation policy in op-description for content-URLs | hint | false | false | (new) |
| R3-CO-EV-01 | corpus:518-specs | Versioning bimodal: 51.5% none vs 43.2% url-path; header=0% | hint | true | true | EV-1, EV-3 |

#### Lens 4 — Client-Friction

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-CL-01 | books:MAP WishList | Heavy GETs (>20 props) without `fields`/`expand` query-param | hint | true | true | (new) |
| R3-BK-CL-02 | books:MAP WishTemplate | Deeply-nested resp (>4 levels) without request-body shaping | hint | false | true | M4 |
| R3-BK-CL-03 | books:MAP Pagination | List-endpoints without pagination (extends-E1, MAP-confirmed warn) | warn | true | true | E1, E2, E3 |
| R3-BK-CL-04 | books:Geewax Ch.21 | `pageSize`/`limit` without `maximum`+default = unbound contract | warn | true | true | apiq-limit-parameter-needs-bounds, E6 |
| R3-BK-CL-05 | books:MAP Embedded | Deeply-embedded sub-entities = transfer-cost outlier | hint | false | false | M4 |
| R3-BK-CL-06 | books:MAP LinkedIH | `*_id` props without `_links` envelope = unfollowable refs | hint | true | true | J2, FK-rule |
| R3-BK-CL-07 | books:MAP Conditional | Heavy GETs without `If-None-Match`+`ETag` = bandwidth-waste | hint | true | true | C10, C-MIN-1, C-MIN-2 |
| R3-BK-CL-08 | books:Geewax Ch.10 | LRO-suggesting POSTs with sync-200-only (need 202+/operations/) | hint | true | true | B5 |
| R3-BK-CL-09 | books:Geewax Ch.8 | PATCH without `update_mask`/`fields` param = no targeted updates | hint | true | true | L-SP-2, B-MIN-3 |
| R3-BK-CL-10 | books:Geewax Ch.6 | Path-param IDs string without `format:uuid` AND no pattern | hint | true | true | J2, J-SG-1, T-SP-1 |
| R3-BK-CL-11 | books:Geewax Ch.6 | Checksum-bearing IDs without `pattern` validation | hint | false | false | J2 |
| R3-CO-CL-01 | corpus:518-specs | List-endpoints without recognized pagination (57% modal) hint-only | hint | true | true | E1, E2, E3 |
| R3-CO-CL-02 | corpus:518-specs | No industry-std operationId-naming; only flag intra-spec mix | hint | true | true | CL-2 |

#### Lens 5 — Style-Coherence

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-SC-01 | books:Continuous API Mgmt | Mixed verb-paths + resource-paths = style-coherence violation | hint | true | true | S8, S-MIN-1, B8 |
| R3-BK-SC-02 | books:Continuous API Mgmt | Half-hypermedia/half-resource style across response-schemas | hint | true | true | (new) |
| R3-BK-SC-03 | books:Higginbotham ADDR | ADDR-process style-marker (borderline LLM) | hint | false | false | (new) |
| R3-BK-SC-04 | books:MAP STO | PUT `change`/`set` without state-machine doc = state-axis missing | hint | false | false | B8 |
| R3-BK-SC-05 | books:MAP Atomic-Param | `deepObject`+`explode:true`+complex-schema = ambig query-encoding | hint | true | true | apiq-deepobject-only-on-objects, T1 |
| R3-CO-ST-01 | corpus:518-specs | REST-L2 industry-std at 85.9%; flag rpc/mixed at hint-level | hint | true | true | ST-1, ST-2 |
| R3-RA-OOS-1 | reaudit:U-SC-3 | LRO shape detection (AIP-151) — niche, OOS | OOS | n/a | OOS | (Lens-5 OOS) |
| R3-RA-OOS-2 | reaudit:U-SC-4 | Annotations/labels K8s-style markers (AIP-148) — OOS | OOS | n/a | OOS | (Lens-5 OOS) |
| R3-RA-OOS-3 | reaudit:U-SC-5 | Filter-language conformance (AIP-160) — runtime-only OOS | OOS | n/a | OOS | (Lens-5 OOS) |
| R3-RA-OOS-4 | reaudit:U-SC-8 | Resource-vs-Singleton distinction (AIP-156) — OOS | OOS | n/a | OOS | (Lens-5 OOS) |

#### Lens 6 — Privacy / Data-Class

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-PR-01 | books:Madden | Sensitive props (password/ssn/cc_number) without writeOnly+format | hint | true | true | (new) |
| R3-BK-PR-02 | books:Geewax Ch.25 | DELETE+204 without soft/hard semantics + no `deleted_at` | hint | true | true | (new) |
| R3-BK-PR-03 | books:Geewax Ch.19 | Bulk-Delete (purge) without `force`/`count`-preview = unsafe | warn | true | true | (new) |
| R3-PM-PR-01 | postmortem:Peloton | Health-metric fields (weight/bmi/heart_rate) on unauth-ops = PHI | warn | true | true | L6-1, L6-3, TM-A15 |
| R3-PM-PR-02 | postmortem:Venmo | List-ops on user-content without privacy-scope param = opt-out | hint | false | false | L6-1, L6-2 |
| R3-PM-PR-03 | postmortem:Atlassian | Path-param `{username}` (mutable PII as ID-key) = GDPR-anti-pattern | hint | true | true | L6-1, J3 |
| R3-PM-PR-04 | postmortem:Cash App | Financial-account-id fields without writeOnly/readOnly masking | warn | true | true | L6-1, L6-4, TM-A15 |

#### Lens 7 — Operations

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-OP-01 | books:MAP RateLimit | No rate-limit headers + no 429 = ops-blindness (extends C-SP-1) | warn | true | true | C-SP-1, C-SP-2, C9 |
| R3-BK-OP-02 | books:MAP SLA | `info.x-sla` absent + no SLA-prose-mention | hint | false | true | V1, V2 |
| R3-BK-OP-03 | books:MAP Pricing | Public-API without `info.x-pricing` + no externalDocs = blind | hint | false | false | V1 |
| R3-BK-OP-04 | books:Continuous API Mgmt | Spec without `info.x-lifecycle-stage` = no governance signal | hint | false | false | (new) |
| R3-PM-OP-01 | postmortem:Cloudflare 2025 | Per-tenant rate-quota distinct from per-client = self-DoS-protector | hint | true | true | F-7, L10-1, L10-2 |
| R3-PM-OP-02 | postmortem:AWS S3 2017 | Bulk-mutation w/o `confirm`/`dry_run` = runbook-incident-attractive | hint | false | false | B7, R3 |
| R3-PM-OP-03 | postmortem:Coinbase | List on volume-sensitive resource without hard-cap (severity-up) | hint | true | true | E1, A6, apiq-limit-parameter-needs-bounds |
| R3-PM-OP-04 | postmortem:TLS-expiry | `servers[].url` http:// (non-localhost) = HSTS-defeat | error | true | true | TM-Y17, P-SP-2, EV-28 |
| R3-CO-OP-01 | corpus:518-specs | 93.4% specs declare zero ops/diagnostic-headers (largest gap) | hint | true | true | OP-2, OP-5, OM-1, OM-3 |
| R3-RA-7-1 | reaudit:SG-44 | ETag/Last-Modified on cacheable GET (read-side cache-validator) | hint | true | true | RFC2-29 (write-side) |

#### Lens 8 — Internal-Consistency

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-IC-01 | books:Geewax Ch.7 | Standard-method predictability via uniform operationId-prefix | warn | true | true | B8, R-SP-5 |
| R3-BK-IC-02 | books:MAP MasterDH | Resource referenced ≥3× via `*_id` w/o GET-by-id endpoint | hint | true | true | O1 |
| R3-BK-IC-03 | books:MAP RetrievalOp | GET with requestBody OR description "creates/updates" = read/write blur | hint | true | true | B1, B-SP-1 |
| R3-BK-IC-04 | books:MAP StateCreationOp | POST `update*`/`replace*` op = breaks append-only contract | hint | true | true | B8, B3 |
| R3-BK-IC-05 | books:MAP CompFn | GET `/compute`/`/calculate` = pure-fn (RPC-style legitimate) | hint | true | true | S8 |
| R3-PM-IC-01 | postmortem:Stripe idempotency | Side-effect POST/PUT/PATCH should declare `Idempotency-Key` header | warn | true | true | RFC2-58, RFC2-59, F-7 |
| R3-PM-IC-02 | postmortem:GitLab DB | Backup endpoints should pair `/verify`/`/restore-test` | hint | false | false | (new) |
| R3-PM-IC-03 | postmortem:WhatsApp/OneUptime | Webhook-receiver ops should declare signature-header parameter | warn | true | true | TM-A50, U1, RFC2-58 |
| R3-PM-IC-04 | postmortem:RFC 9700 (2025) | OAuth2 `flows.implicit`/`flows.password` deprecated → severity-up | warn | true | true | RFC2-60, RFC2-61, Y-7 |

#### Lens 9 — AI-Agent-Consumability

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-AI-01 | books:MAP API-Description | Behavioral-prose missing in op-descriptions = AI cannot compose | hint | false | false | Z5 |
| R3-BK-AI-02 | books:MAP Context-Repr | Metadata scattered (request_id) across params/headers/body = inconsist | hint | true | true | (new) |
| R3-BK-AI-03 | books:Geewax Ch.16 | Polymorphic resp-schemas oneOf without discriminator | hint | true | true | M14, EV-6 |
| R3-PM-AI-01 | postmortem:Slack Events | Deprecated ops should declare `x-replacement-operation` extension | hint | true | true | EV-1, F-1, L9-3 |
| R3-PM-AI-02 | postmortem:Log4Shell | `info.x-vulnerability-disclosure-policy` URL positive-marker | hint | true | true | F-8, F-9 |
| R3-PM-AI-03 | postmortem:npm left-pad | DELETE ops without grace-period response-header (recoverability) | hint | false | false | (new) |
| R3-RA-9-1 | reaudit:SG-1 | API root path `/` declared (capability-discovery positive marker) | hint | true | true | F-4, F-16, L9-7 |

#### Lens 10 — Operational-Metadata

| Pattern-ID | Source | Description (≤80 chars) | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
|---|---|---|---|---|---|---|
| R3-BK-OM-01 | books:MAP ErrorReport | Extends-K1 (error robustness/i18n/security-target-audience) | warn | true | true | K1, K2 |
| R3-BK-OM-02 | books:MAP PublicAPI | `info.x-audience` (Public/Community/Internal) governance-marker | hint | false | false | (new) |
| R3-BK-OM-03 | books:Geewax Ch.28 | Resource-revisions: `revisionId`/`If-Match` audit-trail | hint | true | true | C-MIN-2, C-MIN-1 |
| R3-BK-OM-04 | books:Geewax Ch.27 | Mutation-ops without `dryRun`/`validate_only` = no safe-mode | hint | true | true | (new) |
| R3-PM-OM-01 | postmortem:Reddit | `x-pricing-per-request`/`x-pricing-tier` for AI-cost-monitoring | hint | true | true | F-10, L10-1, L10-2 |
| R3-PM-OM-02 | postmortem:GitHub 410 | Deprecated path-versions should declare 410-Gone-response per-op | warn | true | true | EV-1, F-1, L10-3 |
| R3-PM-OM-03 | postmortem:Snowflake UNC5537 | securitySchemes lacking `x-mfa-required`/MFA-prose | hint | false | false | F1, F8, RFC2-57 |
| R3-CO-OP-02 | corpus:518-specs | Sunset/Deprecation headers (RFC-8594) at 0% — diff-opportunity | hint | true | true | OM-3, EV-9 |
| R3-CO-EV-02 | corpus:518-specs | OAS 3.0=96.1% / 3.1=3.9%; rules MUST handle BOTH idioms | info | true | true | EV-2 |
| R3-RA-10-1 | reaudit:SG-2 | `/health` endpoint declared (operational-readiness signal) | hint | true | true | F-4 (analog) |
| R3-RA-10-2 | reaudit:SG-47 | `Request-Id`/`X-Request-Id` response header for traceability | hint | true | true | F-7 (analog) |

### Severity-Hypothesis-Distribution

> Counted across 122 emitted patterns (excludes 5 OOS-marked Lens-5 reaudit-orphans which carry no severity).

| Severity | Count |
|---|---:|
| error | 2 |
| warn | 33 |
| hint | 81 |
| info | 1 |
| OOS (no severity) | 5 |
| **Total** | **122** |

### Spectral-Detectable-Distribution

| Spectral-detectable? | Count |
|---|---:|
| true | 90 |
| false (Phase-B-territory or runtime) | 27 |
| n/a (OOS) | 5 |
| **Total** | **122** |

### Stage-A-territory-Distribution

| Stage-A? | Count |
|---|---:|
| true | 95 |
| false (Phase-B-territory) | 22 |
| OOS | 5 |
| **Total** | **122** |

### Round-4-Decision (D14)

**Trigger Conditions** (any-of triggers Round-4):
- M1+M2 zusammen >40 neue Patterns: **MET** (122 patterns total Round-3)
- Neue Source-Familie verfügbar: **MET** (Books + Postmortems + Corpus = 3 neue Familien beyond Round-2)
- PRD-Reframe öffnet neuen Lens-Bereich: not applicable

**Decision: Round-3 saturates Stage-A pattern-mining for Welle M.** Round-4 wäre conditional auf:
- Conference-Talks (recht-resourced)
- Vendor-Engineering-Blogs deeper (Stripe/GitHub/Twilio internal-docs)
- Recent papers (2024+ ICSE/FSE/ESE)
- Non-English-vendor postmortems (Alibaba/Yandex/Naver/Mercado-Libre)
- Governmental-API postmortems (HMRC, HealthCare.gov, EU-eIDAS)

**Conditional**: User entscheidet nach Welle-M-Done ob Round-4 lohnt oder ob Stage-A pattern-mining bei diesem Round-3-Total declared-done ist. Per Welle-M Plan-Doc §4: Mining declared-done after Round-3 → Welle F (Framework-Optimization) ist next.

### Top Round-3 Highlights (für Plan-Doc Memory)

1. **R3-PM-EV-07 — GitHub brownouts as deprecation-validator** — industry-best `x-brownout-schedule` positive-marker, neu für Lens-3
2. **R3-CO-SC-01 — RFC-7807 0% adoption in 518 healthy specs** — apiq-Lens-2 muss `hint` statt `warn` setzen (post-Round-3 calibration)
3. **R3-BK-CL-01..11 — 11 client-friction patterns from Wilde/Geewax/Massé** — Lens 4 maximalistisch erweitert
4. **R3-PM-OP-01 — Cloudflare runaway useEffect self-DoS** — neue Per-tenant-rate-quota-axis, Lens-7
5. **R3-PM-TM-04 — Sequential int-IDs as enumeration-attractive (Parler 70TB-leak)** — Lens-1 erweitert
6. **R3-PM-PR-01 — Peloton fitness-metric leak (HIPAA-narrow → expanded)** — Lens-6 generalized auf health-adjacent fields
7. **R3-CO-TM-01 — 23.4% public APIs without securitySchemes** — Lens-1 catch-all opportunity (corpus-empirical)
8. **R3-PM-IC-04 — RFC 9700 (Jan 2025) deprecates OAuth2 implicit/password** — severity-upgrade auf `warn` IETF-formally-justified
9. **R3-CO-OP-02 — Sunset/Deprecation headers 0% adoption** — strongest empirical-gap; high-precision Stage-A finding-class
10. **R3-PM-EV-08 — Stripe date-based versioning** — positive-marker info-tier; AI-agent-Konsumabilität-Signal

### Source-Files (Provenance)

- `specs/big-spec-architecture-spike-stage-a-mining-round3-books.md` (1046 lines, 51 patterns)
- `specs/big-spec-architecture-spike-stage-a-mining-round3-postmortems.md` (894 lines, 42 patterns)
- `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md` (430 lines, 18 orphans)
- `specs/big-spec-architecture-spike-stage-a-mining-round3-corpus.md` (533 lines, 11 patterns + 10 statistics)
- `scripts/spike/data/healthy-corpus/manifest.json` (518 specs corpus)
- `scripts/spike/eval/api-corpus-analyzer.ts` (608 lines, library — corpus-stat tool)
- `scripts/spike/eval/run-api-corpus-analysis.ts` (CLI wrapper, ~13s for 518 specs)
- `scripts/spike/data/healthy-corpus/_analyzer-output.json` (machine-readable distributions)

### Status — Mining-Round-3 Master-Konsolidierung

- **Konsolidiert:** 2026-05-07 (Welle M / M3-Subagent).
- **Total Round-3 patterns surveyed:** 122 (51 Books + 42 Postmortems + 11 Corpus + 18 Re-Audit).
- **Adoption into Stage-A active rules:** ~95 (excl. 22 Phase-B-territory + 5 OOS).
- **Adoption into Phase-B-territory:** 22 (preserved as deferred-LLM patterns).
- **Adoption into OOS:** 5 (4 Lens-5 AIP-niche + 1 CL-71 diff-mode).
- **Cumulative Stage-A pattern-corpus (Round-1+2+3):** ~290 (Round-2 baseline) + ~95 (Round-3 active) = **~385 take-into-apiq Stage-A patterns**.
- **Round-4-Decision:** declared-done unter D14 Plausibility-Erschöpfung; conditional re-trigger vom user nach Welle-M-Done.
- **Implementation-Trail:** Round-3-Patterns werden in Welle F (Framework-Optimization) und Welle C/D (P2/P3 Spectral-Wiring) operationalized. Rule-IDs müssen apiq-Kategorie-Prefix-Convention folgen wenn implementiert (R3-* prefixes für source-traceability beibehalten in metadata).


## Round-4 Additions (2026-05-07)

> Round-4-Mining lieferte 84 patterns aus 3 NEUEN Source-Familien (Conference-Talks, Vendor-Engineering-Blogs, Academic-Papers + IETF-RFCs/drafts). Source-Files: `mining-round4-{conferences,vendor-blogs,papers}.md`. Strict-citation-gating per D1+D3 (verbatim <=200 chars + web-verifiable URL + verified-via). User-Direktive 2026-05-07: "do not skip round 4". Per D13 integriert in eigene Section am Ende, NICHT in-line in existing Lens-Tabellen — Pattern-IDs behalten ihre `R4-CT-*` / `R4-VB-*` / `R4-IETF-*` / `R4-AP-*` Source-Prefixes.

### Source-Family-Stats

| Family | Patterns emitted | Avg. citation-quality | Stop-Reason |
|---|---:|---|---|
| Conference-Talks (R4-CT) | 19 (23 row-IDs) | 100% verbatim+URL | 28 talks surveyed (11 initial + 17 discovered), Plausibility-Erschoepfung |
| Vendor-Blogs (R4-VB) | 33 | 100% verbatim+URL | 13 distinct vendors surveyed (15 initial + 18 discovered), Plausibility-Erschoepfung; 97% de-dup-rate (citation-strengthening primary value) |
| Academic-Papers + IETF (R4-AP / R4-IETF) | 32 | 100% verbatim+URL | 19 sources (8 IETF + 11 academic), Plausibility-Erschoepfung; 11 IETF-RFCs primary-yield-driver (RFC 9700/9727/9728/9745 alle 2025) |
| **Total Round-4** | **84 patterns** | 100% strict-citation-gated | All 3 sub-rounds independently saturated |

### Lens-Coverage-Lift-Tabelle (Round-4 deltas per source-family)

| Lens | R4-CT | R4-VB | R4-AP+IETF | Round-4-Total |
|---|---:|---:|---:|---:|
| 1 Threat-Modeling | 2 | 4 | 4 | 10 |
| 2 Standards-Compliance | 1 | 4 | 8 | 13 |
| 3 Evolution-Friction | 2 | 7 | 4 | 13 |
| 4 Client-Friction | 5 | 5 | 3 | 13 |
| 5 Style-Coherence | 2 | 0 | 1 | 3 |
| 6 Privacy-Data-Class | 1 | 0 | 1 | 2 |
| 7 Operations | 1 | 2 | 2 | 5 |
| 8 Internal-Consistency | 1 | 5 | 2 | 8 |
| 9 AI-Agent-Consumability | 3 | 2 | 4 | 9 |
| 10 Operational-Metadata | 3 | 4 | 3 | 10 |
| Cross-Lens (multi-lens-tagged) | 2 (X-01,X-02) | tagged in primary | tagged in primary | 2 |

### Patterns per Lens

#### Lens 1 — Threat-Modeling

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-TM-01 | conference-talk:Shkedy OWASP-API-Security | BOLA: numeric+GUID dual-form path-params double enumeration-surface | hint | true | true |
| R4-CT-TM-02 | conference-talk:Mitchell AsyncAPI-Conf-2024 | AsyncAPI ops without bindings.security = governance-leak | hint | true | true |
| R4-VB-TM-01 | vendor-blog:AWS-API-Gateway docs | Required inputs without pattern/length/range constraints leak validation to backend | warn | true | true |
| R4-VB-TM-02 | vendor-blog:Stripe webhook-signatures | Webhook signature without timestamp-pair = replay-vector | warn | true | true |
| R4-VB-TM-03 | vendor-blog:Stripe API-Keys | Single-tier securityScheme without role/scope-differentiation = no-least-privilege | hint | true | true |
| R4-VB-TM-04 | vendor-blog:Twilio webhook-security | Webhook-sig description should mention URL-binding, not body-only | hint | false | false |
| R4-IETF-TM-01 | rfc:RFC 9700 OAuth-Security-BCP-240 (Jan 2025) | OAuth authCode without PKCE / implicit / password = BCP-240 violation | error | true | true |
| R4-IETF-TM-02 | rfc-draft:httpapi-privacy BCP (last-call 2025-05) | http:// servers for authenticated APIs leak credentials at HTTPS-redirect | warn | true | true |
| R4-IETF-TM-03 | rfc:RFC 9421 HTTP Message Signatures (Feb 2024) | Finance/admin write-ops should declare Signature-Input + Signature headers | hint | true | true |
| R4-AP-TM-01 | paper:Liu et al MCP-empirical arXiv 2507.16044 | Write-ops with global-only security inherit global-failure when MCP-wrapped (92%) | hint | true | true |

#### Lens 2 — Standards-Compliance

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-ST-01 | conference-talk:Mitchell apidays-London-2025 | OAS 3.2 specs should populate tag.kind (audience/lifecycle) when applicable | info | true | true |
| R4-VB-ST-01 | vendor-blog:Heroku interagent guide | Accept-header versioning (RFC6838 vendor-tree) is positive-marker vs URL-versioning | hint | true | true |
| R4-VB-ST-02 | vendor-blog:DigitalOcean API-v2 | http:// servers + apiKey-in-query violate vendor-policy precedent | warn | true | true |
| R4-VB-ST-03 | vendor-blog:Microsoft REST Guidelines | Verb-in-path (/getUsers, /process) violates noun-based-paths rule | hint | true | true |
| R4-VB-ST-04 | vendor-blog:Google AIP-122 | Mixed flat+hierarchical paths violate hierarchical-resource-name format | hint | true | true |
| R4-IETF-ST-01 | rfc:RFC 9745 Deprecation-Header (Mar 2025) | deprecated:true ops should document Deprecation response-header (RFC9651 Date) | warn | true | true |
| R4-IETF-ST-02 | rfc:RFC 9745 sec 2.1 Deprecation+Sunset pairing | When both Deprecation+Sunset declared, format mismatch violates pairing | warn | true | true |
| R4-IETF-ST-03 | rfc:RFC 9728 OAuth Protected-Resource-Metadata (Apr 2025) | OAuth2 APIs should expose /.well-known/oauth-protected-resource | hint | true | true |
| R4-IETF-ST-04 | rfc:RFC 9728 sec 3 PRM-required-fields | PRM-endpoint response should include 4 core fields (auth-servers + jwks_uri + ...) | hint | true | true |
| R4-IETF-ST-05 | rfc:RFC 9728 sec 5.3 WWW-Authenticate resource_metadata | 401 responses should declare WWW-Authenticate with resource_metadata=URL | hint | true | true |
| R4-IETF-ST-06 | rfc:RFC 9727 api-catalog (Mar 2025) | Multi-API publishers should expose /.well-known/api-catalog (0% adoption) | hint | true | true |
| R4-IETF-ST-07 | rfc-draft:httpapi-ratelimit-headers-10 | Specs should use consolidated RateLimit + RateLimit-Policy, not X-RateLimit-* legacy | warn | true | true |
| R4-AP-ST-01 | paper:OpenAPI Initiative OAS-3.2 announce (Sep 2025) | OAS 3.2.0+ specs should migrate flat-tags to structured Tag with summary/parent/kind | hint | true | true |

#### Lens 3 — Evolution-Friction

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-EV-01 | conference-talk:Kocot post-OpenAPI-era | No deprecated-flag-usage anywhere in spec = evolution-blind | hint | true | true |
| R4-CT-EV-02 | conference-talk:Sturgeon API-versioning | Co-existing /v2/ + /v3/ paths without deprecated-on-v2 = no-evolution-discipline | hint | true | true |
| R4-VB-EV-01 | vendor-blog:Stripe API-versioning blog | Date-format info.version + account-pinning = positive-marker | hint | true | true |
| R4-VB-EV-02 | vendor-blog:GitHub REST-versioning announcement | X-GitHub-Api-Version header param accepting date-format = industry-leading | hint | true | true |
| R4-VB-EV-03 | vendor-blog:GitHub REST API Versions docs | externalDocs.url with migration/upgrade/versioning keyword = positive-marker | hint | true | true |
| R4-VB-EV-04 | vendor-blog:Twilio v2008-EOL (Dec 2023) | Deprecated:true with Sunset <90 days future = insufficient-runway | warn | false | false |
| R4-VB-EV-05 | vendor-blog:Shopify GraphQL-versioning | info.description with explicit cadence-numerics ("supported X months") = positive | hint | false | false |
| R4-VB-EV-06 | vendor-blog:Square date-versioning monthly | 5+ vendor consensus on date-versioning (Stripe+GitHub+Square+Twilio+Heroku) | hint | true | true |
| R4-VB-EV-07 | vendor-blog:Google AIP-154 resource-revisions | Mutable-resources without etag field/header miss optimistic-concurrency rail | hint | true | true |
| R4-AP-EV-01 | paper:Serbout & Pautasso ICWE 2024 | 64% APIs (1970/3075) violate semver on minor/patch breaking changes | warn | false | false |
| R4-AP-EV-02 | paper:Serbout & Pautasso ICWE 2024 | Positive-marker: explicit info.x-evolution-policy backwards-compatible-only | hint | true | true |
| R4-AP-EV-03 | paper:Serbout/Di-Lauro/Pautasso ECSA 2022 | Drop-without-deprecation across versions widespread (1M+ ops surveyed) | warn | false | false |
| R4-AP-EV-04 | paper:Liu et al MCP arXiv 2507.16044 | x-agent-tool: include/exclude/preferred extension raises 19% wrap-ceiling | hint | true | true |

#### Lens 4 — Client-Friction

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-CL-01 | conference-talk:Kheyrollahi NDC-London-2016 | Internal-system terms in property-names (db_id, mongo_id, pgsql_*) leak server-internals | hint | true | true |
| R4-CT-CL-02 | conference-talk:Kheyrollahi NDC-London-2016 | UI-context params (mobile_layout, ios_version) = client-coupling smell | hint | true | true |
| R4-CT-CL-03 | conference-talk:Kheyrollahi NDC-London-2016 | No Cache-Control + no ETag/Last-Modified = presumptuous-client antipattern | hint | true | true |
| R4-CT-CL-04 | conference-talk:Biesack Nordic-APIs-Austin-2024 | Marketing-style names (awesomeId, coolFlag, magic*) = style-over-substance | hint | true | true |
| R4-CT-CL-05 | conference-talk:Lin Postman Infobip-Shift-2021 | Op missing summary AND description AND examples = consumer-disservice triple-gap | hint | true | true |
| R4-VB-CL-01 | vendor-blog:Shopify @deprecated-reasons | deprecated:true with stub description (<20 chars) miss machine-readable reason | warn | true | true |
| R4-VB-CL-02 | vendor-blog:Heroku interagent Request-Id | No X-Request-Id/Trace-Id in any response-headers = trace-debug opaque | hint | true | true |
| R4-VB-CL-03 | vendor-blog:Microsoft REST Guidelines naming | Property-name <4 chars + has underscore = abbreviation-smell | warn | true | true |
| R4-VB-CL-04 | vendor-blog:Microsoft REST Guidelines $filter | filter/q/where param without describing OData/RSQL/FIQL syntax = client-confusion | hint | false | false |
| R4-VB-CL-05 | vendor-blog:Google AIP-158 pagination | Missing page_token (cursor) on list-endpoints = inconsistent-iteration | warn | true | true |
| R4-AP-CL-01 | paper:Palma DOLAR/SARA IJCIS 2017 | Verb-redundancy: POST /createX, GET /getY (HTTP-method already encodes verb) | warn | true | true |
| R4-AP-CL-02 | paper:Palma SARA-12 IJCIS | Non-hierarchical URI organization (flat /users + /orders + /userOrders) | hint | false | true |
| R4-AP-CL-03 | paper:Palma DOLAR linguistic-antipatterns | Inconsistent pluralization (/user/{id} AND /customers/{id} in same spec) | hint | true | true |

#### Lens 5 — Style-Coherence

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-SC-01 | conference-talk:Wilde apidays-Paris-2021 | Single spec mixing REST-resource + RPC-action paths = intra-spec style-drift | warn | true | true |
| R4-CT-SC-02 | conference-talk:Nenashev apidays-Paris-2023 | Mixed-casing vendor-extensions (x-rate-limit + x-RateLimit) = naming-violation | hint | true | true |
| R4-AP-SC-01 | paper:Serbout/Pautasso/Zdun/Zimmermann EuroPLoP 2021 | Schema-fragment-cloning: same property-tuple inline across ops, not $ref-shared | hint | true | true |

#### Lens 6 — Privacy / Data-Class

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-PR-01 | conference-talk:Brosse apidays-London-2024 | Positive-marker: x-accessibility-* extension family on user-facing endpoints | hint | true | true |
| R4-AP-PR-01 | paper:Serbout & Pautasso APIstic MSR 2024 | Positive-marker: info.x-data-classification tagging PII/payment/health-data ops | hint | true | true |

#### Lens 7 — Operations

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-OP-01 | conference-talk:AWS-Eric-Johnson re:Invent-2023 | 429 declared without RateLimit-* response-header family = throttling-blind | hint | true | true |
| R4-VB-OP-01 | vendor-blog:AWS API-Gateway request-validation | Operations with required body/params without 400 declared miss edge-validation | warn | true | true |
| R4-VB-OP-02 | vendor-blog:Cloudflare sliding-window blog | Rate-limit headers without window-semantics description leave clients to guess | hint | false | false |
| R4-IETF-OP-01 | rfc:RFC 9745 sec 3 Deprecation-semantics | Deprecation header value MUST be future/past unix-timestamp (RFC9745 syntax) | hint | true | true |
| R4-AP-OP-01 | paper:Serbout & Pautasso APIstic MSR 2024 | info.description <200 chars or below readability-threshold = NL-quality gap | hint | false | true |

#### Lens 8 — Internal-Consistency

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-IC-01 | conference-talk:Stripe Sessions developer-keynote | POST/PATCH ops with retry-semantics declared but no Idempotency-Key param = retry-unsafe | warn | true | true |
| R4-VB-IC-01 | vendor-blog:Stripe idempotency 2017 | Idempotency-Key param without 409-Conflict response = key-mismatch undeclared | warn | true | true |
| R4-VB-IC-02 | vendor-blog:Stripe online-migrations | 4-phase rename pattern (deprecated:true + new required:false coexist) = no-breaking-rename | hint | false | false |
| R4-VB-IC-03 | vendor-blog:Stripe webhooks | Webhook payload without unique id/event_id field = receivers cannot dedupe | warn | true | true |
| R4-VB-IC-04 | vendor-blog:Stripe webhooks order-not-guaranteed | Webhook payload without created/timestamp field = order-assumption-risk | hint | true | true |
| R4-VB-IC-05 | vendor-blog:Twilio v2008 path-restructure | Path-prefix overlap (/foo + /foo/Local) without parent deprecated:true = silent-break | warn | true | true |
| R4-AP-IC-01 | paper:Liu et al EmRest ISSTA 2025 | Params missing >=2 of [bounds/format/pattern] force testing-by-error-message-inference | warn | true | true |
| R4-AP-IC-02 | paper:OpenAPI semantic-extensions ScienceDirect | Same property-name with incompatible types/shapes across schemas = agent-confusion | warn | false | true |

#### Lens 9 — AI-Agent-Consumability

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-AI-01 | conference-talk:Kilcommins apidays-Helsinki-2024 | Positive-marker: presence of Arazzo workflow file referenced from spec | hint | true | true |
| R4-CT-AI-02 | conference-talk:Wilde apidays-Munich-2025 | Op with empty summary AND empty description = AI-blocked (severity-up R3-BK-AI-01) | hint | true | true |
| R4-CT-AI-03 | conference-talk:Kilcommins Nordic-APIs-2025 | Multi-step prose ("first call X then...") without workflow doc = MCP-leak | hint | false | true |
| R4-VB-AI-01 | vendor-blog:Slack rate-limit-tier docs | Positive-marker: x-rate-limit-tier OR x-rate-limit-rps per-op vendor-extension | hint | true | true |
| R4-VB-AI-02 | vendor-blog:Google AIP-122 name-field | GET-by-id-referenced schemas without name OR id field = agent-introspection-gap | hint | true | true |
| R4-AP-AI-01 | paper:Hasan et al MCP-Smelly arXiv 2602.14878 (Feb 2026) | Unclear-Purpose smell: 56% of 856 MCP tools fail to state purpose clearly | warn | false | true |
| R4-AP-AI-02 | paper:Hasan et al MCP-Smelly | 6-component completeness: purpose/inputs/outputs/side-effects/errors/usage-context | hint | false | true |
| R4-AP-AI-03 | paper:Liu MCP arXiv 2507.16044 | Tool-count explosion: paths >=30 + flat-tags = wrappers blow tool-count past usable | hint | true | true |
| R4-AP-AI-04 | paper:Liu MCP arXiv 2507.16044 SpecFix | externalDocs.url declared but doc-content match low = spec-vs-docs drift suspect | hint | true | true |

#### Lens 10 — Operational-Metadata

| Pattern-ID | Source | Description (<=80 chars) | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|
| R4-CT-OM-01 | conference-talk:Lane apidays-Insider-NYC-2024 | Positive-marker: spec accompanied by apis.json discovery-manifest = governance-mature | hint | true | true |
| R4-CT-OM-02 | conference-talk:Niinioja apidays-Helsinki-2025 | Positive-marker: info.x-business-context / info.x-target-customer = APIOps-aligned | hint | true | true |
| R4-CT-OM-03 | conference-talk:Medjaoui apidays-API-Intersection-2024 | Positive-marker: latency-SLO metadata (info.x-target-latency-p99) | hint | true | true |
| R4-VB-OM-01 | vendor-blog:GitHub REST API Versions docs | Header-versioning param description should mention default-policy (latest vs oldest) | hint | false | false |
| R4-VB-OM-02 | vendor-blog:GitHub rate-limits docs | 429 response without ALL THREE rate-limit-headers (limit + remaining + reset) | warn | true | true |
| R4-VB-OM-03 | vendor-blog:Atlassian PII-evolution-guide 2024 | PII-returning deprecated endpoints should reference replacement-endpoint in description | warn | true | true |
| R4-VB-OM-04 | vendor-blog:Microsoft REST Guidelines async-ops | 202 response without Location header AND without paired status-endpoint operation | warn | true | true |
| R4-IETF-OM-01 | rfc:RFC 9727 api-catalog (Mar 2025) | Spec landing page should return Link: rel="api-catalog" header (mature publisher) | hint | false | true |
| R4-IETF-OM-02 | rfc-draft:httpapi-link-template-04 (Mar 2024) | Collection-shaped responses should declare Link-Template response-header (HATEOAS) | hint | true | true |
| R4-AP-OM-01 | paper:Foster et al VLHCC 2023 qualitative-study | Positive-marker: info.x-design-style-guide URL = explicit uniformity-commitment | hint | true | true |

#### Cross-Lens (multi-lens-tagged)

| Pattern-ID | Lenses | Source | Description | Severity-Hyp | Spectral? | Stage-A? |
|---|---|---|---|---|---|---|
| R4-CT-X-01 | 4+8+9 | conference-talk:Luebke API-Conf-Berlin-2024 | Multiple endpoint-roles (Master-Data + Information-Holder + Computation) with mixed message-structure styles within same role-class = pattern-coherence violation | hint | false | true |
| R4-CT-X-02 | 4+5 | conference-talk:Amundsen apidays-Paris-2023 | Well-defined Resources + >5 cross-resource refs (*_id) but no HATEOAS _links/_embedded envelopes = unfollowable-graph-pattern | hint | true | true |

### Severity-Hypothesis-Distribution (Round-4)

| Severity | Count |
|---|---:|
| error | 1 (R4-IETF-TM-01 OAuth-BCP-240) |
| warn | 23 |
| hint | 59 |
| info | 1 (R4-CT-ST-01 OAS-3.2 tag.kind) |
| **Total** | **84** |

### Spectral-Detectable-Distribution (Round-4)

| Spectral-detectable? | Count |
|---|---:|
| true | 70 |
| false (Phase-B-territory or runtime-only or NLP-required) | 14 |
| **Total** | **84** |

### Stage-A-territory-Distribution (Round-4)

| Stage-A? | Count |
|---|---:|
| true | 78 |
| false (Phase-B / spec-diff / runtime) | 6 |
| **Total** | **84** |

### Top Round-4 Highlights (fuer Memory + Plan-Doc)

1. **R4-IETF-ST-03/04/05 — RFC 9728 OAuth Protected Resource Metadata (April 2025).** 0% adoption in 518-spec corpus. Foundation fuer MCP-OAuth-discovery (modelcontextprotocol/SEP-985 alignment). Brand-new April-2025 RFC. Strongest empirical-gap in Round-4.
2. **R4-AP-AI-01/02 — Hasan et al "MCP Tool Descriptions Are Smelly!" (Feb 2026).** 97.1% of 856 MCP-tools have >=1 quality-smell. Direkt vision-aligned mit Plan-Doc §0. 6-component-completeness rubric (purpose/inputs/outputs/side-effects/errors/context) ist apiq-Lens-9-driver.
3. **R4-IETF-ST-01 — RFC 9745 Deprecation Header (Maerz 2025).** Standards-Track-status seit Maerz 2025. Severity-upgrade-Argument fuer EV-1/F-1 von hint -> warn.
4. **R4-IETF-ST-06 — RFC 9727 api-catalog (Maerz 2025).** /.well-known/api-catalog + service-desc/service-doc link-relations. 0% adoption-baseline = strongest mature-publisher info-tier signal.
5. **R4-VB-EV-06 — Date-versioning 5+ vendor consensus** (Stripe + GitHub + Square + Twilio + Heroku). Positive-marker promotion-Argument von hint -> info-tier evidence-supported.
6. **R4-VB-IC-04 — Webhook events not order-guaranteed** (Stripe documented). Webhooks need timestamp-field. Round-3 hatte signature-Pflicht aber NICHT order-guarantee.
7. **R4-CT-CL-01 — Kheyrollahi Transparent-Server** (`db_id`/`mongo_id`/`pgsql_*` in property-names -> internal-leak). Net-new automation-target, fast Spectral rule, surprising apiq-coverage-gap.
8. **R4-CT-AI-01 — Kilcommins Arazzo workflow-document positive-marker.** First apiq-rule that detects PRESENCE of a workflow-document. Aligns mit strategic-vision (Lens-9 underweighted at 3.4% pre-Round-4).
9. **R4-VB-AI-01 — Slack rate-limit-tier-metadata** (`x-rate-limit-tier`). AI-agents could derive pacing-strategies. Concrete vendor-deployment-evidence.
10. **R4-AP-EV-01 — Serbout & Pautasso ICWE 2024 SemVer empirical:** 64% APIs (1970/3075) violate semver on minor/patch. Empirical-justification fuer spec-diff aggressiveness in Phase B.

### Severity-Upgrade-Candidates (Round-4 evidence)

| Existing-Pattern | Upgrade | Round-4 Evidence | Severity-Argument |
|---|---|---|---|
| EV-1 / F-1 | hint -> warn | R4-IETF-ST-01 (RFC 9745 Standards-Track Maerz 2025) | Standards-Track-status formalisiert Sunset-pairing |
| Y-7 (auth-flows) | confirmation/standards-track-elevation | R4-IETF-TM-01 (RFC 9700 BCP-240 Jan 2025) | BCP-240 deprecates implicit + mandates PKCE |
| B8 / G3 (verb-in-path) | hint -> warn | R4-AP-CL-01 (DOLAR-2017 + SARA-2024 75%-precision) | Empirical ML-detection precision validation |
| EV-1 (additional) | empirical-grounding | R4-AP-EV-01 (Serbout-2024 64% violation) | Quantified prevalence baseline |
| R3-BK-AI-01 (description-quality) | hint -> warn | R4-AP-AI-01 (Hasan-2026 97.1% empirical) | 856-tool/103-server prevalence baseline |
| S8 / R3-BK-SC-01 (style-drift) | hint -> warn | R4-CT-SC-01 (Wilde apidays-2021 + book) | Multi-source confirmation, user-pain-frame |

### Round-5-Decision

Per D14-Trigger erweitert:
- M-R3+R4 zusammen: 122 + 84 = **206 patterns** total Round-3-or-later
- Source-Familien: 4 (Round-3: book / postmortem / corpus / re-audit) + 3 (Round-4: conference-talk / vendor-blog / paper-rfc) = **7 source-families**
- Round-5-Trigger: keine weitere obvious source-family verfuegbar (post-Round-4 stoppte aus Plausibility-Erschoepfung in allen 3 Sub-Rounds). Welle M2 (post-V) bleibt geplant fuer gerichtetes agent-readiness-Mining.

**Decision:** Round-5 entfaellt. Mining-Round-4 saturates discovery-unbounded across all 3 source-families independently. Welle M2 (post-V) wird gerichtetes-Mining sein (governmental-API-design-guides / non-anglophone-conferences / domain-specific corpus expansion if conditional-trigger arises).

### Source-Files (Provenance)

- `specs/big-spec-architecture-spike-stage-a-mining-round4-conferences.md` (571 Zeilen, 19 unique patterns / 23 row-IDs)
- `specs/big-spec-architecture-spike-stage-a-mining-round4-vendor-blogs.md` (757 Zeilen, 33 patterns)
- `specs/big-spec-architecture-spike-stage-a-mining-round4-papers.md` (715 Zeilen, 32 patterns)

### Status — Mining-Round-4 Master-Konsolidierung

- **Konsolidiert:** 2026-05-07 (Welle M / Round-4-Konsolidierung-Subagent).
- **Total Round-4 patterns surveyed:** 84 (19 Conferences + 33 Vendor-Blogs + 32 Papers/IETF).
- **Adoption into Stage-A active rules:** 78 (excl. 6 Phase-B-territory or runtime-only).
- **Adoption into Phase-B-territory:** 6 (R4-VB-EV-04 Sunset-runway, R4-VB-EV-05 cadence-prose, R4-VB-CL-04 OData-syntax, R4-VB-OM-01 default-policy-prose, R4-VB-OP-02 window-semantics-prose, R4-VB-IC-02 4-phase-migration, R4-AP-EV-01 SemVer-spec-diff, R4-AP-EV-03 drop-without-deprecation-spec-diff, R4-VB-TM-04 URL-binding-NLP).
- **Cumulative Stage-A pattern-corpus (Round-1+2+3+4):** ~290 (Round-2 baseline) + ~95 (Round-3 active) + 78 (Round-4 active) = **~463 take-into-apiq Stage-A patterns**.
- **Severity-Upgrade-Candidates:** 6 documented (above table). Welle F operationalizes via metadata-promotion.
- **Round-5-Decision:** declared-done unter D14 Plausibility-Erschoepfung across all 3 sub-rounds.
- **Implementation-Trail:** Round-4-Patterns werden in Welle F (Framework-Optimization) operationalized; severity-upgrades werden in metadata-promotion (110-rule re-tier) entschieden. Pattern-IDs behalten R4-{CT/VB/IETF/AP}-prefix fuer source-traceability.
