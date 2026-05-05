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

---

## Mining-Round-2 Validation (2026-05-05)

> **Status update.** Round-2 Phases A–F completed 2026-05-05. The 5-lens framework expanded to **10 lenses**; the `Stakeholder × Lifecycle × Defect-Class` cube was validated; the 8 functional detector classes survived with **3 new architectural elements** identified.
> Append-only update; existing content above unchanged.

### Lens-Framework Final: 10 Lenses

| # | Lens | Defining-question | Primary Stakeholder | Primary Lifecycle Phase | Primary Defect-Class | Sources confirming | apiq-Differentiator? |
|---|---|---|---|---|---|---|---|
| 1 | Threat-Modeling | "How can an attacker exploit?" | Security/Compliance | Runtime — edge | Norm + Over-specification | OWASP API1..10, 42Crunch, RFC 9700, GitHub/Stripe webhook docs | N (Vacuum/Redocly cover; apiq must match) |
| 2 | Standards-Compliance | "Does this spec follow HTTP/IETF/IANA standards?" | Multiple (clients + codegen + agents) | Runtime — happy + Build | Norm | RFC 9110/9111/9112 + 7807/9457 + 6838 + 6648 + 22 RFCs | N (mature linters cover most; apiq must match RFC 9457 + RFC 9700) |
| 3 | Evolution-Friction | "Can this API evolve without breaking changes?" | Spec-author (future) + clients | Evolution-time | Over-specification + Incomplete | OASDIFF + OPTIC + Stripe + GitHub + MS-AZ + Zalando | **Y** — single-spec breaking-prediction not in mature linters |
| 4 | Client-Friction | "How painful is this spec for SDK-users?" | Client-dev | Runtime — happy + Build | Ergonomic | openapi-generator + openapi-typescript + ReDoc + Swagger-UI + Speakeasy + Postman 2025 | Partial (Vacuum/Redocly cover ergonomics; cross-op clustering + per-target metadata = apiq-differentiator) |
| 5 | Style-Coherence | "Is the style consistent within the spec?" | Client-dev + codegen | Authoring + Documentation | Semantic + Ergonomic | JSON:API + HAL + Siren + OData + Google AIPs + Microsoft Guidelines + Fielding + DOLAR | **Y** — style-classifier-architecture not in mature linters |
| 6 | Privacy / Data-Classification (NEW Round-2 Phase A) | "Does the spec leak PII / regulatory-classified data?" | Compliance + end-user | Runtime — edge | Privacy-leakage + Norm (GDPR) | OWASP API3 + OAI #2190 + Cloudflare PII-redaction + TruffleHog/Gitleaks | **Y** — name-pattern-driven PII-detection not in mature linters |
| 7 | Operations / HTTP-protocol-Performance (NEW Round-2 Phase B) | "Does the spec enable cache/conditional/rate-limit?" | SRE + clients | Runtime — at scale | Incomplete | RFC 7232/9110 + 7234/9111 + 7233 + 6585 + draft-ratelimit | N (mature linters cover individually; apiq's deep-mechanics-pairings = apiq-differentiator) |
| 8 | Internal-Consistency (NEW Round-2 Phase B) | "Are cross-op invariants preserved within the spec?" | Spec-author + clients | Authoring + Validation | Semantic | RFC 9457 §4 + apiq existing G-SP-5 / M7 / O3 / D1 | **Y** — cross-response invariants (RFC2-5 type-URI-uniqueness, hash-duplicate, response-shape) = apiq-USP cluster |
| 9 | AI-Agent-Consumability (NEW Round-2 Phase D — apiq-strategic-fit) | "Can an AI agent compose multi-call sequences from this spec?" | AI-agent + tool-call platform | Runtime — happy | Ergonomic + Incomplete | Postman 2025 + Speakeasy + Fern + OpenAI function-calling + MCP + Arazzo + LLM-friendly-API agentic-patterns | **Y** — strategic-fit; emerging area; not in mature linters yet |
| 10 | Operational-Metadata-Coverage (NEW Round-2 Phase F) | "Does the spec carry machine-readable SLA / quota / deprecation metadata?" | SRE + clients | Runtime — at scale | Operational-metadata-missing + Incomplete | MAP (Zimmermann) + SLA4OAI + TM Forum + OpenAI/Stripe/GitHub rate-limit conventions + FAPI-deprecation | **Y** — Lens-10 + positive-marker `info`-tier are apiq-novel |

**4 of 10 lenses are explicit apiq-differentiators**: Lens 3 (Evolution single-spec prediction), Lens 5 (Style-classifier), Lens 8 (Internal-Consistency cross-response), Lens 9 (AI-Agent-Consumability). Plus partial in Lens 4 (cross-op clustering + per-target). Plus emerging Lens 6 (PII-detection) + Lens 10 (operational-metadata) — these are early-mover-advantage, not architectural moats.

### Stakeholder × Lifecycle × Defect-Class Cube — VALIDATED (Phase F)

The cube proposed in Iteration-1 was speculative; **Round-2 validated it by predicting where the new lenses would land**. Each new Round-2 lens occupies a previously-empty cube-cell:

| New Lens | Empty cube-cell occupied |
|---|---|
| Lens 6 (Privacy) | `Compliance × Runtime-edge × Privacy-leakage` (newly-named defect-class) |
| Lens 9 (AI-Agent) | `AI-agent × Runtime-happy × Ergonomic` (newly-named stakeholder) |
| Lens 10 (Operational-Metadata) | `SRE × Runtime-at-scale × Operational-metadata-missing` (newly-named defect-class) |

**Refined cube (Round-2 final):**

**Axis 1 — Stakeholders (9 values):** Spec-author / Spec-consumer-human-dev / **AI-agent** (NEW Round-2) / End-user-of-client-app / Operations-SRE / Security-Compliance / Code-generator-tool / Documentation-renderer / Self-API-itself.

**Axis 2 — Lifecycle (9 values):** Authoring-time / Build-time / Validation-time / Deploy-time / Runtime-happy / Runtime-edge / Runtime-at-scale / Evolution-time / Documentation-time.

**Axis 3 — Defect-Classes (8 values):** Syntax / Semantic / Norm / Ergonomic / Incomplete / Over-specification / **Privacy-leakage** (NEW Round-2 Phase A) / **Operational-metadata-missing** (NEW Round-2 Phase F).

**Coverage analysis** (from Phase F Stakeholder × Lifecycle × Defect-Class table):
- Every existing apiq-rule maps to ≥1 cube-cell.
- Empty cell remaining: `Documentation-time × Documentation-renderer × Ergonomic` — apiq has thin coverage (description-substantive, no-html-markup); not strong enough for a Lens 11.
- All other previously-empty cells are now filled by Lenses 6/9/10.

**The cube is the OPERATIONAL meta-axis.** Use cases:
1. Severity-justification: `Security × Runtime-edge × Norm-violation` ⇒ always warn-or-error.
2. Output-grouping: lifecycle-axis maps to "when does this matter?" (CI-blocking / runtime-bites / next-version-bites).
3. Coverage-gap detection: empty cells = where to mine next.
4. Industry-canonical alignment: aligns with ISO/IEC 25010 (see secondary axis below).

### ISO/IEC 25010 — Secondary Axis (NEW Round-2)

Mapping 10 lenses → 9 ISO product-quality-characteristics (from Phase F):

| ISO Characteristic | apiq Lens(es) |
|---|---|
| Functional Suitability | Lens 8 (Internal-Consistency) |
| Performance Efficiency | Lens 7 (Operations) |
| Compatibility | Lens 2 (Standards), Lens 5 (Style), Lens 9 (AI-Agent) |
| Usability | Lens 4 (Client-Friction) primary; Lens 5 (Style) secondary |
| Reliability | Lens 7 (Operations), Lens 10 (Operational-Metadata SLAs) |
| Security | Lens 1 (Threat), Lens 6 (Privacy) |
| Maintainability | Lens 3 (Evolution) primary; Lens 8 (Internal-Consistency) secondary |
| Portability | Lens 2 (Standards) partial |
| Safety (2023 added) | Out-of-scope at spec level |

**Coverage is essentially complete in both directions.** Every ISO characteristic maps to ≥1 lens; every lens maps to ≥1 ISO characteristic.

**Use cases for ISO secondary axis:**
- **Severity-justification**: industry-canonical importance per characteristic.
- **Marketing**: "apiq covers ISO/IEC 25010 §X" is publishable.
- **Springer Delphi alignment**: arXiv 2108.00033 explicitly maps REST design rules → ISO/IEC 25010; ready-made bridge to academic-canonical rule-importance ranking.
- **Recommendation**: every rule's metadata carries `iso25010` tag in `{functional-suitability, performance-efficiency, compatibility, usability, reliability, security, maintainability, portability}`.

### 8 Functional Rule-Classes + 3 Architectural Elements (Phase F refactor)

**Original 8 functional classes survive at the rule-level**:
1. Spec-Schema Validators (Spectral oas3 / AJV / A1-A14)
2. Anti-Pattern Detectors (custom-rules / walkers)
3. Missing-Best-Practice Detectors (examples-coverage / tag-required / Lens-10 SLA)
4. Internal-Inconsistency Detectors (hash-duplicates / pagination-walker / cross-op)
5. Standards-Conformance Detectors (RFC 7807 problem-json / IANA media-type / FAPI scheme)
6. Consumer-Friction Detectors (casing-mix-walker / bare-array / Lens-9 AI-friendly)
7. Evolutionary-Friction Detectors (additionalProperties / oneOf-discriminator / required-stability)
8. Security-Risk Detectors (OWASP / mass-assignment / token-in-URL / PII-leakage)

**3 NEW architectural elements above the rule-level** (made explicit by Phase F; were implicit in apiq):

#### Architectural Element A — **Classifiers**
First-classify-then-conditionally-fire. Examples:
- **Style-classifier** (Phase E) — `{RPC, REST-L2, REST-L3, JSON:API, HAL, Siren, OData, AIP, Custom, Mixed}` → conditionally fires SCF-1..17.
- **JSON-Schema-draft-version-detector** (Phase B) — `{Draft-04, Draft-06, Draft-07, 2019-09, 2020-12}` → conditionally fires draft-specific rules (RFC2-84..89).
- **OAuth2-flow-classifier** (Phase B) — classify flow-types declared, then run flow-conditional rules (RFC2-60..65).
- **Media-type-IANA-classifier** (Phase B) — classify by IANA-registry-presence + structured-suffix.

These are **meta-detectors** that gate other detectors. New shape; doesn't fit the 8 classes.

#### Architectural Element B — **Statistical Aggregators**
The 12 walkers compute spec-wide statistics first, then flag outliers. Different shape from "match-pattern, emit-finding" rules. Already in apiq but not formally separated. Examples: casing-mix-walker (G1/G2), description-coverage-walker (W2), pagination-style-inconsistency-walker (W10), examples-coverage-walker (W4), HTML-prevalence-walker, vendor-extension-overuse-walker.

These emit **fact-class findings** (e.g. "70% snake_case + 30% camelCase = inconsistent"), not pattern-violation findings.

#### Architectural Element C — **Multi-Pattern Deep-Mechanic Modules**
Round-2 introduced **8 deep-mechanic modules** that span multiple rule-classes:
1. `secret-scanner.ts` (TruffleHog/Gitleaks regex; Lens-1 + Lens-6)
2. `http-protocol-pairings.ts` (param↔header / status↔header / scheme↔challenge declarative-table; Lens-2 + Lens-7)
3. `problem-json-validator.ts` (RFC 9457 cross-response invariants incl. USP RFC2-5; Lens-2 + Lens-8)
4. `oauth2-flow-validator.ts` (RFC 9700 BCP-240 wrapper; Lens-1 + Lens-2)
5. `media-type-iana-validator.ts` (RFC 6838 + IANA registry snapshot; Lens-2)
6. `json-schema-draft-version-detector.ts` (extends existing X1-X5; Lens-2 + Lens-3)
7. `style-classifier.ts` + `per-style-coherence-checker.ts` (Phase E architecture; Lens-5)
8. `webhook-signature-detector.ts` (TM-A50 dedicated; Lens-1 + Lens-2)

Each is a **sub-system** of multiple detectors. Treating as monolithic OR as flat-collection-of-single-class-detectors is misleading; treating as **multi-pattern modules with multi-lens output** is correct.

#### Net change vs original 8

| | Before Round-2 | After Round-2 |
|---|---|---|
| Rule-level classes | 8 | 8 (unchanged) |
| Architectural elements above rule-level | 0 (implicit) | 3 (explicit) |
| Implementation-architecture: codebase directory | Flat `scripts/spike/deterministic/` | **Possible refactor target post-spike-lock**: `classifiers/` + `aggregators/` + `modules/` + `rules/` |

### Severity-Schema Final (NEW Round-2)

Definitive doc with all extensions surfaced across Round-2:

```yaml
severity:
  enum: [error, warn, hint, info]    # info = NEW Round-2 (Phase F positive-markers like SLA4OAI-presence)
direction:
  enum: [tighten, loosen, drift]     # NEW Round-2 (Phase C); applies primarily to Lens-3
lens:
  type: array
  items: {enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}    # NEW Round-2: 10-lens framework; multi-tag allowed
  minItems: 1
source-type:
  enum: [rfc, bcp, iso-25010, iana-registry, vendor, owasp-cheat, codegen-issue, paper, style-guide, draft-ietf]
source-id:
  type: string                       # e.g. "rfc-9700-bcp-240", "rfc-9110-section-15.5.6", "iso-25010-2023"
source-verbatim:
  type: string                       # NEW Round-2 (Source-Quality-Fix): the verbatim RFC-2119 wording
source-verified-at:
  type: string                       # NEW Round-2: ISO-8601 timestamp + URL of last gh-api-raw verification
codegen-targets:                     # NEW Round-2 (Phase D)
  type: array
  items: {enum: ['*', 'java', 'go', 'python', 'typescript', 'rust', 'csharp', 'kotlin']}
  default: ['*']
iso25010:                            # NEW Round-2 (Phase F)
  enum: [functional-suitability, performance-efficiency, compatibility, usability, reliability, security, maintainability, portability]
stakeholder:                         # NEW Round-2 (Phase F validated)
  enum: [spec-author, human-client-dev, ai-agent, end-user, sre, security-compliance, codegen-tool, doc-renderer, self-api]
lifecycle:                           # NEW Round-2 (Phase F validated)
  enum: [authoring, build, validation, deploy, runtime-happy, runtime-edge, runtime-at-scale, evolution, documentation]
defect-class:                        # NEW Round-2 (Phase F validated)
  enum: [syntax, semantic, norm, ergonomic, incomplete, over-specification, privacy-leakage, operational-metadata-missing]
```

### Convergence Signal

Marginal-yield curve across rounds:
- **Round-1**: 5 lenses established (~80 patterns).
- **Round-2 Phases A-E**: +4 lenses (6, 7, 8, 9), ~340 patterns raw → ~270 dedup'd.
- **Round-2 Phase F**: +1 lens (10), +20 patterns.

**Diminishing-yield curve confirmed.** Each round adds **fewer** lenses than the last (Round-1: 5; Round-2-AE: 4; Round-2-F: 1). Pattern-mining declared **converged at 10 lenses**. Further mining-rounds would yield single-digit patterns each.

**Implication**: post-spike-lock, scheduled re-mining quarterly (openapi-generator issues + RFC publishing-status) is sufficient — no need for a Round-3.

### Open Questions Updated (Round-2)

Re-evaluating the 6 original open questions from Iteration-1:

1. **Q1: Stehen die 5 Lenses unabhängig oder überlappen sie?** — **RESOLVED Round-2.** Heavy overlap confirmed (~30 of 54 TM-A* are cross-Lens; ~60% of EV-* are cross-Lens; almost all SC-* are cross-Lens with Lens-4). Multi-Lens-Tags is required not optional. All Round-2 patterns carry multi-lens.

2. **Q2: Ist die `Stakeholder × Lifecycle × Defect-Class`-Klassifikation operativ-nützlich?** — **RESOLVED Round-2.** Validated by Phase F: the cube *predicted* the new lenses (Lens 9 = machine-stakeholder-cell; Lens 10 = runtime-at-scale-operational-metadata; Lens 6 = privacy-leakage). Cube promoted from "proposal" to "adopted operational meta-axis". Each new defect-class (privacy-leakage, operational-metadata-missing) was added to fill empty cells.

3. **Q3: Wo enden "deterministisch detektierbar"-Patterns vs "LLM-only"?** — **PARTIALLY RESOLVED Round-2.** Each phase made the boundary explicit per-pattern. Boundary stays **fluid**: many heuristics (description-keyword-match, name-pattern-detect) are deterministic-but-low-precision and benefit from LLM Phase B confirmation. Recommendation: each rule carries a `detection-precision` ∈ `{high, medium, low}`. Low-precision rules are off-by-default OR LLM-confirmed.

4. **Q4: Severity-Mapping zu Lens** — **RESOLVED Round-2.** RFC-2119-verbatim mapping is the gold-standard (MUST → error; SHOULD → warn; MAY/RECOMMENDED → hint). For inferred-severity, multi-source-consensus governs (6+ sources → confident severity; 1-2 sources → start as hint, upgrade after orchestrator-pilot). BCP-tightening overrides original-RFC severity (e.g. RFC 9700 BCP-240 makes OAuth2-implicit MUST-NOT, severity-upgrade Y-7 warn→error).

5. **Q5: Gibt es Lens-6/7/8 die wir noch nicht sehen?** — **RESOLVED Round-2.** YES, found 5 more (6, 7, 8, 9, 10). Phase F H1-test argued for "no Lens 11/12 with strong evidence" (sustainability/i18n/domain-specific all fold into existing lenses or are LLM-territory). Mining declared converged.

6. **Q6: Wie strukturieren wir die Brainstorm-Doc nach Round-2?** — **RESOLVED.** Hierarchical structure adopted: brainstorm Round-1 sections (1-19) preserved; Round-2 Master-Konsolidierung appended as `## Mining-Round-2 Master-Konsolidierung (2026-05-05)` with structured Pattern-Inventory-by-Lens tables, cross-lens patterns, out-of-scope/delegated sections, and Putz-Niveau Benchmark.

### NEW Open Questions surfaced by Round-2

7. **Should "info-tier" findings exist alongside error/warn/hint?** Lens-10 positive markers (SLA4OAI presence, capability-discovery endpoint presence) are not really "findings" — they're "observations". **PROPOSED:** add `info` as 4th severity-tier below `hint`. Patch candidate.

8. **Is Lens 10 distinct enough from Lens 7?** Phase F argued yes (HTTP-protocol vs application-operational-metadata are different concerns). **TRACKING**: during Phase B (LLM) testing, validate distinction with users; merge if artificial.

9. **How does apiq handle the Stakeholder axis in output presentation?** A finding tagged `stakeholder: security` should probably surface differently than `stakeholder: doc-renderer`. **TRACKING**: UI-design follow-up for v1.1.

10. **Is the Springer Delphi 28-high-importance-rules list a hard target for apiq's "best-in-class" bar?** **YES, ADOPTED**: see `rules-brainstorm.md` Putz-Niveau Benchmark (27/28 covered + 1 partial). Reputation-load-bearing claim defensible.

11. **Should DOLAR-pattern-coverage be an explicit benchmark?** **PROPOSED ADOPT**: F-11..F-14 cover the load-bearing DOLAR anti-patterns. "apiq covers the full DOLAR anti-pattern catalog" is a marketing-defensible claim.

12. **Does the 3-architectural-element view (Classifiers / Aggregators / Deep-Mechanic-Modules) need codebase-directory reflection?** Currently flat. **TRACKING**: refactor target post-spike-lock — `classifiers/` + `aggregators/` + `modules/` + `rules/`.

13. **BCP-tracking in rule-metadata** — `source` field SHOULD support BCP-references (`source: rfc-9700-bcp-240` not just `source: rfc-6749`). **ADOPTED** in Severity-Schema Final above.

14. **IANA-registry-snapshot dependency** — apiq ships allowlists for status codes, methods, header field names, link relations, cache directives, media types. Refresh quarterly. **ADOPTED** as recommendation; implementation track in Wave 2.

### Status — Round-2 Validation

- **Authored:** 2026-05-05 evening.
- **Lens-Framework:** 5 → **10** lenses (5 new Round-2: Privacy, Operations, Internal-Consistency, AI-Agent, Operational-Metadata).
- **Functional rule-classes:** 8 (unchanged).
- **Architectural elements above rule-level:** 0 → **3** (Classifiers, Statistical Aggregators, Deep-Mechanic Modules).
- **Cube validation:** the `Stakeholder × Lifecycle × Defect-Class` axis predicted Round-2 lens-additions; promoted from proposal to adopted operational meta-axis.
- **Secondary axis:** ISO/IEC 25010 mapping established; serves severity-justification + marketing + Springer-Delphi-bridge.
- **Severity-Schema:** extended to 4-tier (error/warn/hint/info), direction-modifier (tighten/loosen/drift), multi-lens-tags, source-distinction (incl. BCP-tracking), codegen-targets, ISO/IEC 25010 tag, Stakeholder/Lifecycle/Defect-Class meta-tags, source-verbatim + source-verified-at.
- **Convergence:** Pattern-mining declared converged at 10 lenses; further rounds expected to yield single-digit-patterns each. Quarterly re-mining recommended (no Round-3 needed pre-launch).
- **Pattern-inventory:** ~290 take-into-apiq patterns across all 10 lenses (see `rules-brainstorm.md` Mining-Round-2 Master-Konsolidierung section).
- **Putz-Niveau Benchmark:** apiq covers 27 of 28 Springer-Delphi high-importance rules + 1 partial (single-spec breaking-change prediction; full diff out-of-scope).
