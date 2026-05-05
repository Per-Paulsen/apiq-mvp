# Stage A Meta-Insights — Mining-Round-1 Lessons

> **Zweck:** Die strukturellen Lehren aus Mining-Round-1 (Tasks #23-26) festhalten — nicht die einzelnen Patterns (die liegen in den 3 Mining-Files + im konsolidierten brainstorm), sondern was die Lücken über unsere Sicht-Achsen verraten und welche höheren Abstraktionen das ermöglicht. Plus: Plan für Mining-Round-2 auf erweiterten Achsen.
> **Status (2026-05-05):** Round-1 done; Round-2 pending.

---

## Big Picture

Mining-Round-1 hat ~80 spezifische Patterns ergänzt — das ist das Offensichtliche. **Das eigentlich Wertvolle liegt eine Ebene drüber:** die Lücken haben uns 5 systematische Sicht-Verzerrungen aufgedeckt, die unser Brainstorm hatte. Wenn wir diese Lenses jetzt explizit machen + Round-2 entsprechend strukturieren, finden wir Patterns die auch nach Round-2 noch fehlen würden, weil sie in keiner aktuell-mature-Linter-Source sind aber trotzdem load-bearing wären.

---

## Die 5 Sicht-Verzerrungen unseres Round-0-Brainstorms

### Lens 1 — Threat-Modeling fehlte komplett
**Symptom in Round-1:** 24 OWASP-Security-Rules komplett fehlend. HTTP-Basic, API-Keys-in-URL, Bearer-Tokens-in-URL, Credentials-in-URL, HTTPS-only — alles security-class.

**Diagnose:** unser Brainstorm war "schöne Spec" (Description-Quality, Naming, Schema-Completeness, Hygiene). Wir haben nicht "wie kann ein Angreifer das ausnutzen?" gefragt.

**Generalisierung:** weitere Threat-Modeling-Class-Patterns die WIR (auch nach Round-1) wahrscheinlich noch nicht haben:
- **PII-Detection** — Specs die explizit PII-Felder leaken (email/ssn/credit_card als unmasked strings, ohne format/pattern)
- **DoS-Vectors** — unbounded arrays/strings ohne maxItems/maxLength (statistical Walker hat es, aus Threat-Perspektive nicht systematisch)
- **Recursive-Schemas ohne max-depth** (parser-DoS)
- **Authorization-Coverage-Gaps** — security definiert aber nicht auf allen state-changing Endpoints (privilege-escalation)
- **Token-Leakage in Error-Schemas** (4xx/5xx Schemas die Auth-tokens / Stack-Traces returnen)
- **Mass-Assignment-Risiko** — request bodies die mehr Fields akzeptieren als nötig (additionalProperties: true auf createUser-endpoint)
- **CORS-Konfiguration** (wenn in Spec dokumentiert)
- **Webhook-Security** — Webhooks ohne signature-verification headers dokumentiert

### Lens 2 — Standards-Compliance über OpenAPI hinaus
**Symptom in Round-1:** RFC 7807 (Problem-Details) und RFC 6648 (X-header forbidden) verpasst. Plus: IETF draft `httpapi-idempotency-key` als formalisierter generic standard surfaced.

**Diagnose:** wir haben "OpenAPI-Validity" geprüft, nicht "spricht diese API HTTP-/JSON-/IETF-Standards-konform?". Eine API ist ein Stack: HTTP + JSON-Schema + MIME-Types + Status-Codes + Conditional-Requests + Caching — jedes davon hat eigene RFCs.

**Generalisierung:** weitere RFCs/Standards die wir prüfen sollten:
- **RFC 9457** (Problem-Details, supersedes 7807) — die neuere Version
- **RFC 7240** (Prefer header) — `respond-async`, `return=representation`
- **RFC 8941** (Structured Field Values for HTTP)
- **RFC 5988 / RFC 8288** (Web-Linking, Link header) — voll verwendet?
- **RFC 7232** (Conditional Requests) — ETag, If-None-Match, Last-Modified
- **RFC 7233** (Range Requests) — Pagination via Range
- **RFC 7234** (HTTP Caching) — Cache-Control directives
- **RFC 7235** (Authentication) — WWW-Authenticate challenge
- **RFC 7807 (deprecated by 9457)** — Migration check
- **RFC 6750** (Bearer Token Usage)
- **RFC 7519** (JWT) — wenn Bearer-Tokens
- **JSON-Schema Drafts** (2020-12, 2019-09) — wir nutzen 2020-12 in AJV; specs könnten ältere Drafts erwarten
- **MIME-Type IANA registry** — alle media-types registered? Sub-types-Konventionen?
- **URL/URI Normalisation** (RFC 3986) — path-Normalisation, query-encoding

### Lens 3 — Evolution-Friction / Forward-Compatibility
**Symptom in Round-1:** Severity-Upgrades von M14 (oneOf-discriminator) und M8 (additionalProperties) — Begründung in den Sources war konsistent: **clients müssen unbekannte Variants/Felder ignorieren können, sonst sind Erweiterungen breaking changes**. Plus bare-array-bodies forbidden (kann später nicht zu Object erweitert werden).

**Diagnose:** wir haben "Current-State-Hygiene" gemacht — ist die Spec heute korrekt? — aber nicht "kann diese API morgen ohne breaking change wachsen?". Eine API ist niemals fertig.

**Generalisierung:** weitere Forward-Compat-Patterns:
- **Versioning-Strategy-Konsistenz** — path-version + header-version mixed = Drift-Smell + breaking-Risk
- **Deprecation-Flow-Vollständigkeit** — `deprecated: true` ohne sunset-Date oder Replacement-Reference
- **Open-vs-Closed-Enums** — ein enum mit nur 3 Werten ohne Erweiterungs-Strategie ist Future-Trap
- **Required-Field-Stabilität** — was du required machst, kannst du später nicht optional machen ohne breaking → flagge required-Felder die "sehen aus als ob sie irgendwann optional werden müssen" (heuristisch)
- **Default-Value-Stabilität** — Defaults sind Vertrag, Default-changes sind breaking
- **Response-Schema-Erweiterbarkeit** — response 200 als Object (✓) vs als bare-array (✗ breaking-Risk)
- **Type-Widening vs Narrowing** — z.B. integer → number ist breaking (precision-loss); string-pattern weiter machen ist OK
- **Status-Code-Set Stability** — neue 4xx-Codes hinzufügen ist OK, neue success-codes hinzufügen kann breaking sein
- **Header-Set-Stabilität** — neue headers hinzufügen meist OK, removing breaking

### Lens 4 — Client-Developer-Friction (Consumer-Experience)
**Symptom in Round-1:** X-header-forbidden-Begründung war "Vendor-Extension-Wildwuchs erschwert Client-Devs". Casing-Mix-Detection-Begründung war "Clients müssen multiple naming conventions handlen". Bare-Array-Forbidden — "schwer zu paginieren / metadata-erweitern".

**Diagnose:** wir haben "Spec-Quality" geprüft, nicht "Client-Developer-Friction". Aber: Clients müssen mit der Spec leben — Friktionspunkte sind UX-Schmerzpunkte.

**Generalisierung:** weitere Client-Friction-Patterns:
- **Inkonsistente Pagination-Conventions cross-endpoint** (GET /users hat cursor, GET /orders hat offset) — wir haben den Walker für Style-Konsistenz, nicht für cross-endpoint-Inkonsistenz
- **Inkonsistente Date-Format-Conventions cross-spec** — wir haben I4 als hint, eigentlich ist es CLIENT-FRICTION P1
- **Inkonsistente Error-Schemas cross-endpoint** — Endpunkt A returnt Error-Shape X, Endpunkt B Shape Y → Client braucht zwei Error-Handler
- **Endpoint-Kontradiktionen** — POST /users gibt User-Shape zurück, GET /users gibt UserSummary-Shape zurück, GET /users/{id} gibt UserDetails-Shape zurück — drei verschiedene Shapes für eine Resource
- **Schema-Refactoring-Smells** — viele similar-aber-not-identical Schemas (User, UserBase, UserPublic, UserPrivate) ohne klare Naming-Convention
- **Fehlende Code-Examples** — Codegen kann das ggf., aber Client-Devs lesen Examples zum Verstehen
- **Doc-vs-Schema-Divergence** — `description` sagt "returns user object" aber response-schema ist String
- **Verbose vs Cryptic Field-Names** — `customer_payment_method_creation_timestamp` vs `cpmct` — beides UX-Schmerz
- **Pagination-Wrapper-Konsistenz** — wenn Paginiert: alle Endpoints haben `pagination: {next, prev, total}` ODER alle haben `_links: {...}` — nie gemischt

### Lens 5 — API-Style-Coherence
**Symptom in Round-1:** RPC-Style-Detection im Path-Template-Parser, JSON:API als eigene API-Style-Spec im Mining gefunden, Google AIPs differenzieren REST/gRPC.

**Diagnose:** wir prüfen Spec auf OpenAPI-Konformität, aber nicht "ist diese API ein konsistenter Style?". Specs die zwischen REST, RPC, Hypermedia und Custom-Styles vermischen sind verwirrend.

**Generalisierung:** Style-Coherence-Patterns:
- **REST-vs-RPC-Drift** — sind manche Endpoints Resource-Style (`POST /orders`), manche RPC-Style (`POST /createOrder`) im selben Spec?
- **Resource-vs-Action-Naming** — `POST /orders/{id}/cancel` (RESTful action) vs `POST /cancelOrder?id=123` (RPC-style)
- **HTTP-Method-Semantik-Adherence** — PUT idempotent, POST nicht idempotent, DELETE idempotent. Specs die das verletzen (z.B. POST mit ID im Body als "update")
- **Hypermedia-Style-Markers** — wenn HATEOAS: ist es konsistent (alle Resources haben `_links`)? Mixed mit non-Hypermedia ist confusing
- **Granularity-Konsistenz** — manche Endpoints chatty (1 endpoint, 1 Field), manche fat (1 endpoint, 50 fields) im selben Spec
- **CRUD-Symmetrie** — Resource hat POST + GET aber kein DELETE / PUT? Bewusste Designentscheidung oder vergessen?

---

## Best-Practice-Patterns aus Mining-Round-1 destilliert

### Was mature APIs MACHEN (Pattern-MAKE)
1. **Definieren EINEN spec-weiten Error-Shape** (RFC 7807 / 9457 oder eigenes — aber konsistent)
2. **Versionieren EXPLICIT auf einer Achse** (Path ODER Header, nie mixed)
3. **List-Endpoints kriegen Pagination + Envelope**, KEINE bare arrays
4. **POST-Creates returnen 201 + Location-Header**
5. **Components werden wiederverwendet (DRY)** — Inline nur für truly-unique-shapes
6. **Schemas haben Examples auf Component-Level** (für codegen + docs)
7. **Authentication ist Spec-Level Default + Per-Op-Override** (nicht per-Op repeat)
8. **Date-Time ist ISO 8601** (nicht unix-time-mix, nicht epoch-mix)
9. **IDs haben format/pattern** (UUID oder declared)
10. **Tagging mit MUST/SHOULD/MAY-Severität** (RFC 2119-Style; jede Rule sourced auf RFC oder Standard)
11. **additionalProperties explicit** (true für extensibility, false für strict — aber declared)
12. **discriminator declared** wenn oneOf/anyOf
13. **Required-Felder stabilisierbar** — required ist Vertrag forever
14. **Webhooks dokumentiert mit Signature-Verification-Headers**

### Was mature APIs NICHT machen (Pattern-DONT)
1. **Inline-Schemas duplizieren** (DRY-Violation, Refactoring-Schuld)
2. **X-headers für standard-stuff** (Cache-Control, Content-Type sind RFC-typed)
3. **API-Keys/Bearer-Tokens in URLs** (security)
4. **Status-Codes inkonsistent** (mal 200 für Create, mal 201 für Read)
5. **Mixed Casing in einem Spec** (camel + snake mixed)
6. **Mixed Versioning** (path-version + header-version)
7. **Bare-Array Bodies** (nicht-extensibel)
8. **HTTP-Basic Auth** (insecure, verwende OAuth2/JWT)
9. **HTTP statt HTTPS** (insecure transport)
10. **Required-Fields die später optional werden müssen** (breaking-change-Trap)
11. **Status-Code-Set zu groß** (>10 Codes pro op = wahrscheinlich Design-Smell)
12. **Schema-Tiefe >5 Ebenen** (parser-/codegen-Friction)
13. **Tagging-Wildwuchs** (jeder Endpoint ein eigenes Tag)
14. **Endpoint-Naming-Kontradiktionen** (camelCase Path, snake_case Property im selben Endpoint)

---

## Höhere Abstraktion — zwei Generalisierungs-Versuche

### Versuch 1: Klassifikation nach Stakeholder × Lifecycle × Defect-Class

Jeder Befund kann auf 3 Achsen verortet werden:

**Achse 1 — Wer leidet?** (Stakeholder)
- Spec-Author (wenn Spec broken)
- Spec-Consumer = Client-Dev (Friction)
- End-User der Client-App (UX-Impact via fehlerhaftem Client)
- Operations / SRE (Cost, Latency, Cache-fehlend, DoS-anfällig)
- Security / Compliance (Threats, GDPR, PII)
- Code-Generator-Tool (Codegen-Friction)
- Documentation-Tool (Doc-Renderer-Friction)
- Self (API selbst, Maintenance-Burden)

**Achse 2 — Wann manifestiert sich's?** (Lifecycle-Phase)
- Build-Time (Codegen broken)
- Test-Time (Test-Gen broken)
- Deploy-Time (Spec validation fails)
- Runtime — Happy Path (Client missing required field)
- Runtime — Edge Case (Threat exploit, edge-error)
- Runtime — At Scale (Performance, Cache, DoS)
- Evolution-Time (breaking-change introduced 6 months later)
- Documentation-Time (Renderer fails)

**Achse 3 — Welche Defect-Class?**
- Syntax (Spec selbst broken / unparsable)
- Semantic (Spec selbst inkonsistent — z.B. cross-references)
- Norm (Spec gegen Standards verletzt — RFC violations)
- Ergonomics (Spec hat schlechte Wahl, ist gültig aber unangenehm)
- Incompleteness (Spec fehlt etwas Standard-erwartetes — z.B. Examples)
- Over-Specification (Spec hat zu viel — z.B. zu viele inline schemas)

**Beispiele:**
- "API-Key in URL" = `Security-Stakeholder × Runtime-Edge × Norm`
- "Bare array body" = `Client-Dev × Evolution-Time × Ergonomics`
- "Missing description" = `Client-Dev × Documentation-Time × Incompleteness`
- "Hash-duplicate schemas" = `Spec-Author × Build-Time × Semantic`
- "Mass-assignment-Risiko" = `Security × Runtime-Edge × Over-Specification`

**Wert dieser Klassifikation:**
- Findings können ge-prioritized werden (Security × Runtime-Edge ist immer P1)
- Severity-System wird systematisch ableitbar (statt ad-hoc warn/hint)
- Coverage-Gaps werden sichtbar (welche `Stakeholder × Lifecycle × Defect-Class`-Zellen sind leer?)

### Versuch 2: 8 funktionale Detektor-Klassen (Was tut ein API-Linter eigentlich?)

Statt Lens-Klassifikation: Funktional-Klassifikation. Ein API-Linter kann nur:
1. **Validates Spec gegen Schema** (does-it-parse) — apiq: Spectral, AJV
2. **Detects Anti-Patterns** (commonly-bad) — apiq: Custom-Spectral-Rules, Walkers
3. **Detects Missing Best-Practices** (commonly-good fehlt) — apiq: Examples-Coverage-Walker
4. **Detects Internal Inconsistencies** (cross-references) — apiq: Cross-Reference-Consistency-Module, Hash-Duplicates
5. **Detects External-Standards-Violations** (HTTP/RFCs) — apiq: NUR PARTIAL (Mining-Lens-2)
6. **Detects Ergonomic-Friction** (Consumer-Side) — apiq: NUR PARTIAL (Mining-Lens-4)
7. **Detects Evolutionary-Friction** (Future-Proofing) — apiq: NUR PARTIAL (Mining-Lens-3)
8. **Detects Security-Risks** (Threat-Modeling) — apiq: FAST GAR NICHT (Mining-Lens-1)

**Wert:** zeigt klar wo apiq's Coverage-Gaps SIND. Klassen 5-8 sind wo Mining-Round-2 hingehen muss.

---

## Konsequenzen für unseren Plan

### A) Severity-System aktualisieren
- Aktuell: error / warn / hint
- Industry-Standard: MUST / SHOULD / MAY (RFC 2119)
- Plus: Severity per Lens (security-error vs hygiene-error sind nicht gleich)
- Vorschlag: `severity-axis` als zusätzliche Metadata pro Rule (`{level: 'must'|'should'|'may', lens: 'security'|'standards'|'evolution'|'ergonomics'|'style'|'hygiene', source: 'rfc-7807' | 'owasp-api-3' | ...}`)

### B) Brainstorm-Struktur erweitern
- Aktuell: Kategorien A-X (Spec-strukturell)
- Brauchen wir: Lens-orthogonale Sicht damit Coverage-Gaps sichtbar werden
- Vorschlag: brainstorm bekommt eine "Lens-Coverage-Matrix" Tabelle (welche Kategorien decken welche Lenses ab) — sichtbar machen welche Lens × Kategorie-Zellen leer sind

### C) "Konkurrenz-Pari"-Definition anpassen
- Bisher: pari mit Vacuum/Redocly auf 4 Specs
- Mining-Round-1 hat gezeigt: Pari mit Spectral-Universum + Linter-Defaults reicht NICHT für Lens-1 (Threat-Modeling) und Lens-2 (Standards-Compliance over-OpenAPI)
- Besser: pari mit Sum aus Vacuum + Redocly + IBM + OWASP + Zalando + Microsoft + Google + 4 corporate-rulesets — UND systematisch alle 5 Lenses abdecken

### D) Mining-Round-2 strukturieren auf den Lenses

5 Phasen, eine pro Lens (plus optional Phase F für noch höhere Abstraktion):

**Phase A — Threat-Modeling-Mining (Lens 1)**
- OWASP API Security Top 10 (2023 latest) — vollständige 10-Kategorien durchgehen, nicht nur die OWASP-Spectral-Ruleset
- 42Crunch Security Patterns documentation
- API-specific Security Top-10 from OWASP (vs general OWASP)
- PII-Detection-Tools (truffleHog patterns, GitHub-Secret-Scanning patterns) — anwendbar auf API-Specs?
- Mass-Assignment-Detection patterns
- CORS-Best-Practices

**Phase B — Standards-Compliance-Mining (Lens 2)**
- RFC 9457 (Problem-Details, latest)
- RFCs 7230-7235 (HTTP/1.1 semantics, conditional, range, caching, auth)
- RFC 7240 (Prefer header)
- RFC 8941 (Structured Field Values)
- RFCs 5988 / 8288 (Web-Linking)
- RFC 6750 (Bearer Token)
- RFC 7519 (JWT)
- JSON-Schema 2020-12 / 2019-09 differences
- IETF httpapi working-group active drafts (idempotency-key, scim, etc.)
- W3C HTTP-related specs
- IANA Media-Type Registry-conventions

**Phase C — Evolution-Friction-Mining (Lens 3)**
- oasdiff documentation (their breaking-change-rule-set)
- openapi-diff
- Optic CI/CD docs
- Postman docs on versioning best-practices
- Stripe API versioning docs (case study)
- Microsoft API-Versioning best-practices

**Phase D — Client-Friction-Mining (Lens 4)**
- Codegen-Tool issues (openapi-generator known-bug-trackers, Java/Python/Go/Rust) — was lehnen die ab als input
- Documentation-Renderer-Quirks (ReDoc, Swagger-UI, Stoplight Elements known-issues)
- API Client-SDK-Conventions (Stripe, Twilio, GitHub Octokit) — was sie als Spec-Patterns "nicht mögen"
- Postman API Survey + RapidAPI State of APIs (welche client-side pain-points)

**Phase E — Style-Coherence-Mining (Lens 5)**
- JSON:API spec (vollständige doc, nicht nur Index)
- HAL (Hypertext Application Language)
- Siren spec
- gRPC Style Best-Practices (vs REST)
- Google AIPs (alle, nicht nur paginations-relevante)
- API-Style-Coherence research papers

**Phase F (OPTIONAL) — Höhere Abstraktion**
- API-Design-Principles research (academic)
- "What is a Good API?" essays / books
- API-Evolution-of-the-Decade reports
- Cross-Industry API patterns (FinTech, HealthTech, etc.) — gibt es domain-übergreifende Konventionen?

---

## Was wir noch nicht wissen (Open Questions)

1. **Stehen die 5 Lenses unabhängig oder überlappen sie?** — Z.B. ist "API-Key-in-URL" Threat-Modeling ODER Standards-Compliance (RFC violations)? Wahrscheinlich beides. Implikation: Ein Pattern kann multiple Lens-Tags haben.

2. **Ist die `Stakeholder × Lifecycle × Defect-Class`-Klassifikation operativ-nützlich oder nur theoretisch sauber?** — Test: kann jeder bisherige Brainstorm-Item klar in genau eine Zelle eingeordnet werden? Wenn nicht, ist die Klassifikation nicht-disjunkt.

3. **Wo enden "deterministisch detektierbar"-Patterns vs "LLM-only"?** — Mining-Round-2 wird neue Patterns surfaccen (z.B. "Endpoint-Kontradiktion" aus Lens-4) die heuristisch detektierbar sind aber LLM eher zuverlässig macht. Wo ziehen wir die Grenze?

4. **Severity-Mapping zu Lens** — wie? Vorschlag: Threat-Modeling immer ≥warn, Standards-Compliance ≥warn wenn MUST, Evolution+Ergonomics meist hint außer P1, Style-Coherence meist hint. Aber das ist hand-wave; brauchen empirische Validierung.

5. **Gibt es Lens-6/7/8 die wir noch nicht sehen?** — z.B. "Performance" als eigene Lens (Pagination-Default-too-large, Schema-too-deep)? Oder fällt das unter Lens-1 + 4? "Documentability" als eigene Lens? "Internationalization"?

6. **Wie strukturieren wir die Brainstorm-Doc nach Round-2?** — wenn noch ~150-300 Patterns dazukommen, wird die flache Liste unleserbar. Brauchen wir hierarchische Struktur (Lens → Kategorie → Pattern)?

---

## Plan für Round-2

**Recommended:** alle 5 Phasen (A-E) parallel via Subagents. Plus optional Phase F als 6. Subagent für höhere Abstraktion. Jeder Phase ein Mining-File analog Round-1. Konsolidierung danach.

**Effort:** ~5-6 Subagents in worktrees parallel, ~30-60 min Wall-Clock + Konsolidierung. Total: ~1-1.5h.

**ROI:** wenn Round-1 bestätigt hat, dass Mining substantielle Lücken aufdeckt — und Round-1 nur "Spectral-Universum" + "Linter-Defaults" + "Style-Guides" abgedeckt hat — dann sind die Lens-1/2/3 Bereiche (Security / Standards / Evolution) wahrscheinlich noch substantieller weil dort die Coverage in Round-1 thin war.
