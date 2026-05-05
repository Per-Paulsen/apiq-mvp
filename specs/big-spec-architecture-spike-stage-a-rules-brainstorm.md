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
