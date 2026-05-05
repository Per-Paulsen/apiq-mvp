# Stage-A Mining Round-2 Phase F — Higher Abstraction

> **Task #32 — optional Phase F.** Test whether Round-2's grown lens-set (1–9) plus deep-mechanic
> modules can be (a) **extended** with further lenses surfaced from cross-industry / academic sources
> (H1), (b) **structured** by a meta-classification axis from research literature (H2), and
> (c) whether the original 8 functional detector classes still hold (H3).
>
> **Authored:** 2026-05-05.
>
> **Method.** WebSearch over academic API-quality literature, cross-industry standards bodies
> (FinTech / HealthTech / Telecom / IoT / Government / ML-AI / E-Commerce), API anti-pattern
> catalogs, ISO/IEC 25010, MAP (Microservice API Patterns), Bloch / Qt / Massé books, FAIR. WebFetch
> denied for most academic-PDF URLs; sources are summarised — citations are second-hand. Where
> verbatim spec text matters, re-verify at coding time.
>
> **Headline finding.** **One new lens (Lens 10 — Operational Metadata / SLA-and-Observability)
> surfaces with strong cross-domain evidence.** A meta-axis emerges (`Stakeholder × Lifecycle ×
> Defect-Class`, refined from meta-insights doc Iteration-1). The 8 functional detector classes
> survive but with a **cleaner re-grouping into 3 super-classes** that better reflects what apiq
> actually ships. **No further lenses 11/12 with strong evidence** — patterns surveyed slot into
> Lenses 1–10.

---

## Sources surveyed

| Source | Type | Insight-density |
|---|---|---|
| Joshua Bloch — *How to Design a Good API* (Google Tech Talk + paper) | Academic / industry | High — POLA, fail-fast, consistent parameter ordering, type-richness, naming. Mostly platform-API-level (Java) but generalises to REST API surface decisions. |
| Qt — *API Design Principles* + Blanchette *Little Manual of API Design* | Industry-canonical book | High — minimal/complete/consistent/intuitive/memorisable/readable framework. Applies to any interface. |
| Mark Massé — *REST API Design Rulebook* (O'Reilly) | Industry-canonical book | High — URI design rules, resource taxonomy (document/collection/store/controller), media-type rules. Already implicit in apiq's ruleset; few new patterns. |
| Heroku HTTP API Design Guide (`interagent/http-api-design`) | Industry style-guide | Medium — already captured in Round-1 (style-guide mining). |
| Olaf Zimmermann et al. — *Patterns for API Design* (Addison Wesley 2022) + microservice-api-patterns.org (MAP) | Academic / industry-bridge | **Very High** — Pattern catalog organised by Foundation / Responsibility / Structure / Quality / Evolution. Quality patterns include `Rate Limit`, `API Key`, `Wish List`, `SLA`. Evolution patterns directly map to apiq Lens 3. |
| Pautasso & Wilde — *Why is the Web Loosely Coupled?* + *May Contain Nuts: The Case for API Labels* (2018) | Academic | Medium — multi-faceted coupling metric (8 facets); "API Labels" idea relevant to detection-confidence levels. |
| Stocker / Zimmermann / Zdun / Lübke / Pautasso — *Interface Quality Patterns: Communicating and Improving the Quality of Microservices APIs* (EuroPLoP 2018) | Academic | Medium — ties Quality → Pattern → Rule chain. |
| Palma / Khomh — *Are RESTful APIs Well-designed? Detection of their Linguistic (Anti)Patterns* + DOLAR + SARA | Academic | **High** — formal anti-pattern catalog (Amorphous URI, Pluralised Nodes, Forgotten Verbs, Tiny Resource, etc.). Many already in apiq; SARA's semantic-NLP layer is LLM-territory. |
| Springer — *Which RESTful API Design Rules Are Important and How Do They Improve Software Quality?* (Delphi study, arXiv 2108.00033) | Academic | **Very High** — 82 design rules ranked by 21 industry experts; 28 high-importance, 17 medium, 37 low. Maps rules → ISO/IEC 25010 quality attributes. Useful for severity-axis. |
| Springer — *Do RESTful API design rules have an impact on the understandability of Web APIs?* (EMSE 2023) | Academic | Medium — empirical confirmation that design-rule adherence improves understandability (Lens 4 evidence). |
| ISO/IEC 25010 (2011 + 2023 product-quality model) | International standard | High — 9 quality characteristics: Functional Suitability / Performance Efficiency / Compatibility / Usability / Reliability / Security / Maintainability / Portability / (added in 2023:) Safety. Dimension framework. |
| FHIR (HL7) — *RESTful API* spec | HealthTech | Medium — CamelCase resources, lowerCamelCase attributes, hyphen-query-params; **CapabilityStatement** = machine-readable feature flag (interesting "spec-of-spec" pattern). |
| Open Banking UK / FAPI 1+2 + PSD2 SCA | FinTech / Government-mandate | High for *Lens 1* — FAPI mandates: PAR (Pushed Authorization Requests), DPoP/MTLS sender-constrained tokens, PKCE always, jwt-secured-authorization-response. **Most are runtime, but spec-detectable: explicit security-scheme types + `flows.authorizationCode.pkce` etc.** |
| FDX (Financial Data Exchange) v5 + v6 | FinTech | Medium — defines 600+ data-elements + recommends FAPI security profile. Domain-knowledge-heavy → mostly LLM-job. |
| GOV.UK API Technical Standards + NHS England API policies | Government | Medium — recommends OpenAPI as primary artefact, JSON + UTF-8, REST default with GraphQL/gRPC tolerated. Mostly aligned with existing brainstorm. |
| TM Forum Open APIs (TMF630 REST API Design Guidelines v4.2) | Telecom | Medium — explicit polymorphism patterns, **expand directives** (`?fields=` deep selection), lifecycle-management patterns. Some not in apiq Round-1. |
| oneM2M REST API + OCF Core | IoT | Low for OpenAPI — IoT specs use CRUD+N (N = Notify) and have heavy resource-tree concepts but aren't typically authored as OpenAPI. Skip. |
| Matter / Zigbee Cluster Library | IoT | Low — protocol-level not REST. Skip. |
| OpenAI API + Hugging Face Inference API + MCP | ML/AI | High for *Lens 9* (AI-Agent-Consumability) — function-calling JSON-schemas + Arazzo workflow spec + MCP. Confirms Lens 9 importance. |
| Shopify GraphQL + Apollo Federation | E-Commerce | Low for OpenAPI Stage-A — GraphQL is its own surface. Federation patterns (subgraph naming, `@key`/`@shareable`) don't have OpenAPI equivalents. Out-of-scope. |
| OpenAPI Initiative *Arazzo* spec + SLA4OAI | API-tooling-standard | **High** — Arazzo defines workflows over OpenAPI (composable multi-step API journeys); SLA4OAI defines machine-readable SLA/rate-limit metadata. **Both extend OpenAPI in directions Lens 10 would need.** |
| OpenTelemetry Semantic Conventions (HTTP / messaging) | Industry standard | Medium — naming conventions for span attributes (`http.request.method`, `url.full`, `server.address`). Indirectly relevant: APIs whose path-templates or operation-IDs match OTel conventions are easier to instrument. |
| FAIR Principles (Wilkinson et al. 2016) | Academic / data-stewardship | Low for API surface — about dataset metadata. Findability is the only direct API-level overlap (`info.contact`, `externalDocs`, `tags`). |
| API Documentation Smells (arXiv 2102.08486) | Academic | Medium — 5 doc-smells: Bloated, Excess Structural, Tangled, Fragmented, Lazy. Some detectable on `description` fields. |
| RESTful API Vulnerability Detection Survey (ScienceDirect 2025) | Academic | High — confirms Lens 1 catalog. |
| Tertiary microservice anti-pattern study (ScienceDirect 2024) — 58 anti-patterns | Academic | Medium — most are runtime/architectural, not spec-level. |

---

## H1 — Lenses 10 / 11 / 12 hypothesis

### Per-Domain survey

For each domain, I checked: are there detectable concerns from this domain that don't fit
Lenses 1–9?

#### FinTech (Open Banking UK / FAPI / PSD2 / FDX)
- **FAPI security-profile conformance** — fits Lens 1 (Threat-Modeling) as a sub-domain. New
  spec-level checks: `security` schemes use `oauth2` with `authorizationCode` + `pkce` flow; no
  `password` / `implicit` / `clientCredentials`-only flows; specs declare `tokenEndpointAuthMethod`
  in extensions when MTLS or `private_key_jwt` mandated. Detectable.
- **mTLS / DPoP token-binding** — runtime, not spec-detectable. Skip.
- **Strong-Customer-Authentication (SCA) flow markers** — spec-level can detect presence of 90-day
  re-auth markers in vendor extensions, but this is FinTech-domain. → LLM-job.
- **FDX 600 data-elements naming** — domain-specific, LLM-job.
- **Conclusion:** FinTech adds detail to Lens 1 (security-scheme conformance) and Lens 2 (FAPI as
  RFC-class standard). No new lens.

#### HealthTech (FHIR / HL7)
- **CapabilityStatement** — interesting "spec-of-spec" pattern. The CapabilityStatement is itself
  a structured FHIR resource describing what the server supports. Generalisation: APIs that publish
  a *machine-readable capability metadata* (introspection endpoint, `/_meta`, OpenAPI server-self-
  description). **This crosses into Lens 9 (AI-Agent-Consumability) as a detectable signal.**
- **FHIR naming** (CamelCase resources, lowerCamelCase attrs) — Lens 5 (Style-Coherence).
- **`_summary`, `_elements`, `_include`, `_revinclude` query params** — domain-specific. Skip.
- **Conclusion:** HealthTech adds depth to Lens 9. No new lens.

#### IoT (oneM2M / OCF / Matter)
- IoT specs are rarely authored as OpenAPI (they're protocol-binding-level). Where they are (oneM2M
  REST binding), the patterns are ordinary REST + CRUD+N (Notify). The N (Notification / Webhook)
  layer overlaps with **Lens 7 (Operations) — Webhooks/Notifications spec coverage**, which Round-2
  Phase B addresses.
- **Conclusion:** No new lens. IoT reinforces Lens 7 webhook patterns.

#### Government (GOV.UK / NHS / U.S. api.gov)
- Government API guidance overwhelmingly says: OpenAPI as primary, JSON, UTF-8, REST, document
  thoroughly, version explicitly. Aligned with existing Lenses 1, 2, 4, 5.
- **Audit / accessibility / WCAG-for-APIs** — interesting edge: NHS guidance includes accessibility
  considerations. But these are **content-level** (descriptions readable; alt-text concepts don't
  apply to APIs). Soft signal at most.
- **Conclusion:** No new lens.

#### ML/AI (OpenAI / Hugging Face / MCP / Arazzo)
- Function-calling consumability is **Lens 9** core. Arazzo workflows = explicit multi-step journey
  description = **could be a sub-lens "Workflow-Spec" but more naturally fits Lens 9** ("can an
  agent compose multi-call sequences from this spec?").
- MCP semantic-context layer — out-of-scope for a pure-OpenAPI-linter (MCP is a separate transport
  spec).
- **Conclusion:** Lens 9 absorbs ML/AI concerns. No new lens.

#### E-Commerce (Shopify GraphQL / Apollo Federation)
- GraphQL surface doesn't translate to OpenAPI Stage A.
- **Conclusion:** Out-of-scope.

#### Telecom (TM Forum TMF630)
- **Polymorphism patterns** (`@type` discriminator-on-the-wire) — fits Lens 5 + apiq existing
  oneOf-discriminator rule.
- **Expand directives** — `?expand=customer.address.city` deep field-selection. **This is a
  detectable spec-level pattern (parameter named `expand`/`fields` with comma-separated values)
  that crosses Lens 4 (client-friction) and Lens 7 (Operations — over-fetch / under-fetch).** Some
  apiq Round-1 patterns touch comma-separated parameters; TM Forum confirms importance.
- **Lifecycle-management patterns** — "lifecycleStatus" on every resource. Domain-specific. Skip.
- **Conclusion:** TM Forum reinforces Lens 4 + Lens 7 (`expand`/`fields` query-param convention).
  No new lens.

#### Cross-domain pattern: **SLA / Quota / Rate-Limit Metadata**
This was hinted at in Round-2 Phase B (Lens 7: Operations) but I want to flag it as a potential
**Lens 10 candidate**:
- **SLA4OAI** — formal OpenAPI extension for SLA + rate-limit metadata.
- **MAP `Rate Limit` pattern + `Wish List` pattern + `SLA` pattern** (Zimmermann book) — quality
  patterns at API-design level.
- **OpenAI rate-limit headers** (`x-ratelimit-limit-requests`, etc.) — de-facto convention but
  not formally documented in OpenAPI specs.
- **TM Forum SLA management API** — explicit SLA-as-resource pattern.
- **`Retry-After` header** — RFC 7231/9110 — already covered in Round-2 Phase B as Lens 7.

The pattern: **APIs increasingly carry machine-readable operational-metadata** — rate limits, SLAs,
quotas, deprecation windows, sunset dates, status pages, support contacts, feature flags. Currently
apiq's brainstorm has scattered detectors (deprecation flow J3-J5; rate-limit 429 + Retry-After
C9; some Lens-7 cache/conditional). **None of them treat "Operational-Metadata Coverage" as a
first-class lens.**

This is borderline — it could fit Lens 7 (Operations / Caching/Conditional/Range/Rate-limit) or
Lens 4 (Client-Friction). But Lens 7 (as defined in Round-2 Phase B) is about **HTTP-protocol
operational features** (caching, conditional, range), not about **higher-level operational metadata
such as SLAs, quotas, deprecation timelines, and feature-flag headers.** I think these are
distinct enough to merit separation.

#### Cross-domain pattern: **Discoverability / Findability Metadata**
Drawing on FAIR principles + Postman public-API-network + RapidAPI:
- `info.contact.{name,email,url}` filled out
- `info.license.{name,url}` filled out
- `info.termsOfService` present
- `externalDocs` present and informative
- `tags` array with descriptions
- `info.description` substantive (≥ 50 words, not stub) — apiq has this
- **API published with consistent canonical URL pattern** (HTTPS, no trailing slash, consistent host)
- **Server-list completeness** (`servers` includes all environments — production, sandbox)

This is **already covered** by existing apiq rules (`apiq-info-description-substantive`,
`spectral:oas` defaults for contact/license/operation-tag-defined). It's a *cluster* of patterns
without being its own lens. Could be argued as part of Lens 4 (Client-Friction; clients need
findability) or Lens 9 (AI-Agent-Consumability; agents need findability). **Not a new lens.**

#### Cross-domain pattern: **Internationalization / Localization**
- Accept-Language header support for content negotiation
- `format: currency-code` (ISO 4217) — Round-1 SG-21..23 already covers
- `format: country-code` (ISO 3166)
- `format: locale-tag` (BCP-47 RFC 5646)
- Explicit `Accept-Language` parameter on `localized` operations
- Time-zone handling: dates explicitly time-zoned (RFC 3339 with `Z`/`±hh:mm` offset, NOT bare
  `YYYY-MM-DDTHH:mm:ss`)

Mostly already in Round-1 SG-21..23 + I4. Time-zone-explicitness is a possible new pattern.
**Not a new lens** — fits Lens 2 (Standards-Compliance) and Lens 4 (Client-Friction).

#### Cross-domain pattern: **Sustainability / Carbon / Cost-Awareness**
Emerging area (Green Software Foundation; some EU regulations 2024+). API-spec markers: `x-cost`
extensions; Cache-Control / max-age aggressively configured to reduce traffic; payload-size
constraints. **Not detectable at spec-level today — too speculative.** Skip.

#### Cross-domain pattern: **Privacy / Data-Classification**
Already proposed as Lens 6 in Phase A.

---

### Conclusion (H1)

**Proposed Lens 10 — Operational-Metadata-Coverage (Quotas / SLAs / Deprecation-Lifecycles /
Feature-Flags / Capability-Discovery).**

- **Definition.** Detects whether the spec carries machine-readable operational metadata that
  consumers need at runtime: rate-limit / quota declarations, SLA tiers, deprecation timelines
  with sunset dates, feature-flag-or-capability headers, and self-describing capability metadata.
- **Distinct from Lens 7** — Lens 7 covers RFC-level HTTP-protocol operational features (caching,
  conditional requests, range, rate-limit headers `429+Retry-After`). Lens 10 covers **higher-level
  application-operational metadata** that is API-design-decision (declared SLA, declared quota,
  declared deprecation-with-sunset, declared capability-discovery endpoint).
- **Evidence:**
  - **MAP `SLA` / `Rate Limit` / `Wish List` patterns** (Zimmermann 2022, Stocker et al. 2018).
  - **SLA4OAI** specification — formal OpenAPI extension for SLA metadata.
  - **TM Forum SLA management** patterns.
  - **OpenAI rate-limit-headers convention** + Stripe / GitHub rate-limit-header conventions.
  - **FAPI / PSD2 deprecation-with-sunset-date** mandates.
  - **HealthTech CapabilityStatement** — machine-readable capability declaration.
  - **Postman / RapidAPI** treat declared SLA/quota as discoverability signal.
- **Detection-feasibility:**
  - Detect operations with `429` status code that **lack** documented `Retry-After` header
    schema → already in Round-1 (C9 + W6 walker; re-tag for Lens 10).
  - Detect operations with `429` status code that lack documented `X-RateLimit-Limit`/`X-RateLimit-
    Remaining`/`X-RateLimit-Reset` (or vendor-equivalents) → new pattern.
  - Detect specs with `deprecated: true` operations that lack `sunset` extension or
    `Sunset` response header (RFC 8594) → already partial in J3 (Round-1); upgrade.
  - Detect operations that lack any rate-limit signalling at all when other operations have it
    (consistency check) → new pattern.
  - Detect specs without `info.contact` (already covered) — consistency with Lens-10 framing.
  - Detect missing `externalDocs` for non-trivial APIs — already covered.
- **Severity-axis:** mostly `hint` (these are nice-to-have); `warn` only when consistency is
  violated (some operations have rate-limit headers, others don't).
- **Multi-Lens-Tags:** Lens 10 (primary) + Lens 4 (client-friction) + Lens 7 (when overlapping
  with HTTP-protocol). Some patterns will be cross-listed.

**No further lens 11 / 12 with strong evidence surfaced.** Cross-domain patterns either
(a) reduced to LLM-domain-knowledge (FinTech FDX naming, HealthTech FHIR resources), (b) fit
existing lenses (Lens 9 absorbed AI/MCP/Arazzo; Lens 5 absorbed style; Lens 1 absorbed FAPI),
or (c) too speculative for spec-level detection (sustainability / carbon, accessibility-for-APIs).

> **Negative finding logged.** Cross-industry survey did NOT yield 2 or 3 net-new lenses as the
> hypothesis allowed for. **One** lens (10) emerged with reasonable evidence; the rest of the
> Round-2 lens-set held.

---

## H2 — Meta-Classification hypothesis

### Candidates considered

I tested 6 meta-classification axes from the literature against the 10 lenses, asking: does
this axis *organise* the lenses meaningfully (i.e., partition them; reveal coverage gaps)?

| Candidate axis | Source | Verdict |
|---|---|---|
| **Internal vs External** (intra-spec coherence vs external-contract violations) | Implicit in 8 functional classes | **Useful** but not crisp — every lens has both internal (consistency) and external (RFC-conformance) sub-aspects. Doesn't cleanly partition. |
| **Structural vs Semantic** (shape vs meaning) | Massé, Bloch | **Useful** but maps to apiq's existing detection-feasibility tags (`mech` vs `mech-stat` vs `heur` vs `graph`). Already in the architecture. Doesn't add a *new* layer. |
| **Spec-Time vs Runtime** | Apigee / Postman lifecycle | **Partial** — most apiq Stage-A is spec-time; Lens 1 + 7 + 10 have runtime-implications. But the lens-axis is already "what *can* we detect from spec alone", so this collapses to a binary. Not useful as organising axis. |
| **Human-Consumer vs Machine-Consumer** | LLM-friendly-API + Bloch + Qt | **Useful** — Lens 4 (client-friction) is human-dev-focused; Lens 9 (AI-agent-consumability) is machine-focused; others are agnostic. **Reveals that almost all lenses are "implicitly assume human reads the spec"** — Lens 9 was the explicit machine-consumer gap. After Round-2 added Lens 9, the remaining gap is closed. **Confirms Round-2 grew correctly but doesn't add new structure.** |
| **Authoring × Operational × Evolutionary** | API maturity models + ISO/IEC 25010 lifecycle phases | **Useful** — three-phase lifecycle. Authoring-time = Lens 5 + Lens 9 (style + AI-agent design choices made at authoring). Operational = Lens 1 + 6 + 7 + 10 (security, privacy, ops, SLA — all manifest at runtime). Evolutionary = Lens 3 (forward-compat). Cross-cutting: Lens 2 (standards) + Lens 4 (client-friction) + Lens 8 (internal-consistency). Maps **most** lenses to one phase but several cross-cut. Decent. |
| **ISO/IEC 25010 quality characteristics** | International standard | **Useful** — see below. |
| **Stakeholder × Lifecycle × Defect-Class** (3-axis cube, from Iteration-1 meta-insights) | Original apiq meta-insights | **Most useful** — see below. |

### ISO/IEC 25010 mapping

The ISO product-quality-model (2011 + 2023 update) defines 9 characteristics. Mapping our 10 lenses
onto them:

| ISO Characteristic | apiq Lens(es) |
|---|---|
| **Functional Suitability** (functional completeness, correctness, appropriateness) | Lens 8 (Internal-Consistency) — mostly. Specs that have a state-changing op without 4xx coverage = functional-incompleteness. |
| **Performance Efficiency** (time behaviour, resource utilisation, capacity) | Lens 7 (Operations — Caching/Conditional/Range/Rate-limit) — partially. Cache-control declarations directly affect performance. |
| **Compatibility** (co-existence, interoperability) | Lens 2 (Standards-Compliance), Lens 5 (Style-Coherence), Lens 9 (AI-Agent-Consumability) — these ARE compatibility-with-standards / styles / agents. |
| **Usability** (appropriateness recognisability, learnability, operability, user error protection, UI aesthetics, accessibility) | Lens 4 (Client-Friction) — primary. Lens 5 (Style-Coherence) — secondary. |
| **Reliability** (maturity, availability, fault tolerance, recoverability) | Lens 7 (Operations — partial), Lens 10 (Operational-Metadata — SLAs declare reliability targets). |
| **Security** | Lens 1 (Threat-Modeling) — direct. Lens 6 (Privacy) — direct. |
| **Maintainability** (modularity, reusability, analysability, modifiability, testability) | Lens 3 (Evolution-Friction) — direct. Lens 8 (Internal-Consistency) — secondary. |
| **Portability** (adaptability, installability, replaceability) | Lens 2 (Standards-Compliance) — partial (RFC-compliant specs are more portable). |
| **Safety** (added 2023) | Out-of-scope at spec level. |

Observations:
- Every ISO characteristic maps to ≥1 lens; every lens maps to ≥1 ISO characteristic. **Coverage
  is essentially complete across both directions.**
- Some lenses span multiple ISO characteristics (Lens 2 maps to Compatibility + Portability;
  Lens 7 spans Performance + Reliability).
- ISO/IEC 25010 is **a useful severity-axis input**: known industry-importance per quality
  characteristic.
- The Springer Delphi study (arXiv 2108.00033) explicitly maps REST design rules → ISO/IEC 25010
  attributes. That's a ready-made bridge.

### Stakeholder × Lifecycle × Defect-Class (refined from Iteration-1 meta-insights)

This was already proposed in `big-spec-architecture-spike-stage-a-meta-insights.md` Iteration-1
(lines 137-180). Let me **refine** it given Round-2:

**Axis 1 — Stakeholder** (who suffers from the defect):
- Spec-author / API-platform-team
- Spec-consumer = client-developer (human)
- AI-agent / tool-call consumer (added in Round-2 — Lens 9)
- End-user-of-client-app
- Operations / SRE
- Security / Compliance
- Code-generator-tool
- Documentation-renderer
- Self (the API itself — maintenance burden)

**Axis 2 — Lifecycle phase** (when the defect manifests):
- Authoring-time (spec-write-time)
- Build-time (codegen)
- Validation-time (CI)
- Deploy-time
- Runtime — happy path
- Runtime — edge case (threats, errors)
- Runtime — at scale (perf, DoS, cache-fail)
- Evolution-time (next version, breaking-change risk)
- Documentation-time (renderer)

**Axis 3 — Defect-class** (what kind of defect):
- Syntax (spec is unparsable)
- Semantic (spec internally inconsistent)
- Norm (spec violates a standard / RFC)
- Ergonomic (spec is valid but unpleasant to use)
- Incomplete (spec is missing something expected)
- Over-specification (spec has too much / too restrictive)
- **Operational-metadata-missing** (spec lacks declared SLA/quota/deprecation-timeline) — added by
  Lens 10
- **Privacy-leakage** (spec exposes PII without classification) — added by Lens 6

**Mapping the 10 lenses onto the three axes:**

| Lens | Primary Stakeholder | Primary Lifecycle | Primary Defect-Class |
|---|---|---|---|
| 1 — Threat-Modeling | Security | Runtime — edge | Norm + Over-specification (mass-assignment) |
| 2 — Standards-Compliance | Multiple (clients + codegen + agents) | Runtime — happy + Build | Norm |
| 3 — Evolution-Friction | Spec-author (future) + clients | Evolution-time | Over-specification (forced contracts) + Incomplete (missing flexibility) |
| 4 — Client-Friction | Client-dev | Runtime — happy | Ergonomic |
| 5 — Style-Coherence | Client-dev + codegen | Authoring + Documentation | Semantic (inconsistency) + Ergonomic |
| 6 — Privacy / Data-Classification | Compliance + end-user | Runtime — edge | Privacy-leakage + Norm (GDPR) |
| 7 — Operations (HTTP-protocol) | SRE + clients | Runtime — at scale | Incomplete (missing cache-control/conditional) |
| 8 — Internal-Consistency | Spec-author + clients | Authoring + Validation | Semantic |
| 9 — AI-Agent-Consumability | AI-agent + tool-call-platform | Runtime — happy | Ergonomic + Incomplete |
| 10 — Operational-Metadata-Coverage | SRE + clients | Runtime — at scale | Operational-metadata-missing + Incomplete |

**Coverage analysis (which `Stakeholder × Lifecycle × Defect-Class` cells are empty?):**
- *Authoring-time × Spec-author × Syntax*: covered by Tier-0 fatal-validity (`A1` dangling-ref,
  `A6` invalid regex, etc.)
- *Runtime-edge × Security × Norm*: covered by Lens 1.
- *Evolution-time × Spec-author-future × Over-specification*: covered by Lens 3.
- **Empty cell:** *Runtime-at-scale × End-user-of-client × Operational-metadata-missing* — when
  the API doesn't declare quotas, end-users hit unpredictable throttle. Lens 10 fills this.
- **Empty cell:** *Documentation-time × Documentation-renderer × Ergonomic* — apiq has some doc-
  smell rules (description-substantive, no-html-markup) but the meta-insights doc-render-friction
  axis is thin. **Possible future: Doc-Renderer-Friendliness sub-lens.** Not strong enough for Lens
  11 yet.
- **Empty cell:** *Runtime-edge × End-user × Privacy-leakage* — covered by Lens 6 (Phase A).

### Proposed Meta-Axis

**Adopt the 3-axis cube `Stakeholder × Lifecycle × Defect-Class` as the operational meta-axis** —
it was already in the meta-insights doc, **and Round-2 confirms its utility**: it predicted the
Round-2 lens-additions (Lens 9 = machine-consumer-stakeholder gap; Lens 10 = runtime-at-scale-
operational-metadata-missing gap; Lens 6 = privacy-leakage defect-class gap).

**ISO/IEC 25010 is the secondary axis** — useful for severity-justification ("this rule improves
ISO Maintainability by reducing breaking-change risk"), publishability/marketing ("apiq covers
ISO/IEC 25010 Section X"), and aligning apiq with the Delphi-study rule-importance ranking.

**Internal/External, Structural/Semantic, Spec-time/Runtime, Human/Machine** are useful as
**descriptive tags** on individual rules (not as the organising meta-axis). They already exist
implicitly in apiq's `severity-axis-direction`, `multi-lens-tags`, and detection-feasibility
metadata.

### Mapping of 10 lenses onto the meta-axis

See the table in the previous section. Bottom-line:
- Every lens has a "home cell" but most spread across 2-3 cells.
- The Defect-Class axis is the most discriminating — it cleanly separates Lens 1 (Norm + Over-spec)
  from Lens 4 (Ergonomic) from Lens 6 (Privacy-leakage) from Lens 8 (Semantic).
- The Stakeholder axis is the second-most useful — it justifies severity (security + privacy are
  always P1; client-friction is P2; doc-renderer-friction is P3).
- The Lifecycle axis is the least discriminating but **most actionable for output-presentation**
  (apiq could group findings by lifecycle phase: "These are CI-blocking findings" / "These will
  bite at runtime" / "These will bite at next-version").

### Rationale

This 3-axis cube + ISO secondary is **operationally-useful** because it:
1. Justifies severity (security stakeholder × runtime-edge × norm-violation = always warn-or-error).
2. Justifies output-grouping (lifecycle-axis maps to "when does this matter to the user?").
3. Justifies coverage gaps (empty cells = where to mine next).
4. Aligns with industry-standard quality model (ISO).

**Strong reuse-recommendation:** the Iteration-1 meta-insights doc already proposed this. **Round-2
validates it.** The doc should be promoted from "proposal" to "adopted" status.

---

## H3 — 8 functional detector classes refactor

### Original 8 (from `meta-insights.md` Iteration-1, Versuch 2)

1. Validates Spec gegen Schema (does-it-parse) — apiq: Spectral, AJV
2. Detects Anti-Patterns (commonly-bad) — apiq: Custom-Spectral-Rules, Walkers
3. Detects Missing Best-Practices (commonly-good fehlt) — apiq: Examples-Coverage-Walker
4. Detects Internal Inconsistencies (cross-references) — apiq: Cross-Reference-Consistency-Module
5. Detects External-Standards-Violations (HTTP/RFCs) — apiq: NUR PARTIAL
6. Detects Ergonomic-Friction (Consumer-Side) — apiq: NUR PARTIAL
7. Detects Evolutionary-Friction (Future-Proofing) — apiq: NUR PARTIAL
8. Detects Security-Risks (Threat-Modeling) — apiq: FAST GAR NICHT

### Round-2 changes that affect these classes

- **Round-2 Phase A** filled class 8 (security-risks) with OWASP / FAPI / mass-assignment / token-
  leakage detectors → class 8 now substantial.
- **Round-2 Phase B** added **deep-mechanic modules** (HTTP-protocol-pairings, problem-json-
  validator, oauth2-flow-validator, media-type-IANA-validator, JSON-Schema-draft-version-detector)
  — these are *bigger* than single-rule detectors but smaller than full lenses. They cross multiple
  classes (a deep-mechanic-module typically does 2+ class-functions).
- **Round-2 Phase C** beefed up class 7 (evolutionary-friction) with breaking-change-set,
  Required-Field-Stability, Default-Value-Stability, etc.
- **Round-2 Phase D** added a *new* class implicitly: AI-agent-consumability detection. Where does
  this live? Class 6 (ergonomic-friction) for *human* consumers + class 6-prime for *machine*
  consumers? Or new class 9?
- **Round-2 Phase E** added the **style-classifier + per-style-coherence-checker** — this is *not*
  a detector in the same shape as the original 8. It's a **classifier-plus-conditional-detector**:
  first classify the spec's style, then run style-conformance checks. **The classifier-stage is a
  meta-mechanism, not a class function.**
- **Round-2 Phase F (this doc)** added Lens 10 (operational-metadata-coverage) — fits class 3
  (missing-best-practices) and class 5 (external-standards-violations) overlap.

### Proposed refactor

**Keep all 8 original classes** — they describe **what a single rule does**. They're still right.

**But add 3 architectural elements above them** — they describe **how rules are organised across
lenses and stages**:

#### Architectural element A — **Classifiers** (new architectural layer)

Some Round-2 modules first **classify** the spec, then run style-or-mode-conditional rules.
Examples:
- **Style-classifier** (Phase E) — `{RPC, REST-L2, REST-L3, JSON:API, HAL, Siren, OData, AIP,
  Custom, Mixed}` → conditionally fires SCF-1..17.
- **JSON-Schema-draft-version-detector** (Phase B) — `{Draft-04, Draft-06, Draft-07, 2019-09,
  2020-12}` → conditionally fires draft-specific rules.
- **OAuth2-flow-validator** (Phase B) — classify flow-types declared, then run flow-conditional
  rules.
- **Media-type-IANA-validator** (Phase B) — classify by IANA-registry-presence.

**These are new — they don't fit the 8 classes.** They are *meta-detectors* that gate other
detectors.

#### Architectural element B — **Cross-cutting Statistical Aggregators**

apiq's 12 walkers are aggregators that compute spec-wide statistics first, then flag outliers.
This is a different shape from "match-pattern, emit-finding" rules. They're already in apiq but
not formally separated from class 2 (anti-patterns) / class 3 (missing-best-practices).

#### Architectural element C — **Multi-Pattern Deep-Mechanic Modules**

Round-2 introduced 8 deep-mechanic modules (secret-scanner, http-protocol-pairings, problem-json-
validator, oauth2-flow-validator, media-type-IANA-validator, json-schema-draft-version-detector,
style-classifier, per-style-coherence-checker). **Each is itself a sub-system of multiple
detectors.** They span 2+ classes. Treating them as monolithic is misleading; treating them as
collections of single-class detectors is also misleading.

### Refined 8 + 3-architectural-element view

| Classification | Description | Examples in apiq |
|---|---|---|
| **Class 1 — Spec-Schema Validators** | Parse/validate against OpenAPI schema; structural validity. | Spectral oas3 ruleset; AJV; A1-A14 from brainstorm. |
| **Class 2 — Anti-Pattern Detectors** | Match-pattern → emit finding; commonly-bad. | apiq custom-rules (RPC verbs, etc.); walkers. |
| **Class 3 — Missing-Best-Practice Detectors** | Match-absence → emit finding; commonly-good missing. | Examples-coverage-walker; tag-required; Lens-10 SLA-coverage. |
| **Class 4 — Internal-Inconsistency Detectors** | Cross-references within spec. | Hash-duplicate-schemas; pagination-style-inconsistency walker. |
| **Class 5 — Standards-Conformance Detectors** | Spec vs external-RFC / spec / IANA-registry. | RFC 7807 problem-json validator; IANA media-type validator; FAPI scheme conformance. |
| **Class 6 — Consumer-Friction Detectors** | Spec vs human-or-machine consumer ergonomics. | Casing-mix-walker; bare-array-body; Lens-9 AI-agent-friendliness. |
| **Class 7 — Evolutionary-Friction Detectors** | Spec vs forward-compat heuristics. | additionalProperties-default-walker; oneOf-discriminator; required-field-stability. |
| **Class 8 — Security-Risk Detectors** | Threat-model lens. | OWASP rules; mass-assignment; token-in-URL; PII-leakage. |
| **Architectural Element A — Classifiers** | First-classify, then conditionally fire. | Style-classifier; JSON-Schema-draft-detector; OAuth2-flow-classifier. |
| **Architectural Element B — Statistical Aggregators** | Spec-wide stats → outlier-flag. | All walkers. |
| **Architectural Element C — Deep-Mechanic Modules** | Multi-rule sub-systems spanning multiple classes. | All 8 deep-mechanic modules from Round-2. |

**Net change vs original 8:** Classes 1-8 unchanged. Three new architectural elements (A, B, C)
added above. **The original 8 are still the rule-level shape; A/B/C describe the architecture
that organises them.**

### Alternative considered: Re-grouping into 3 super-classes

I considered collapsing the 8 classes into 3 super-classes for marketing/output-presentation:
- **Super-class 1 — Validity & Internal-Consistency** (classes 1, 4) — "Is this spec correct?"
- **Super-class 2 — Compliance** (classes 5, 8) — "Does this spec follow the rules?" (RFCs +
  security)
- **Super-class 3 — Quality** (classes 2, 3, 6, 7) — "Is this spec well-designed?"

This **fits ISO/IEC 25010** (Validity → Functional-Suitability + Reliability; Compliance →
Compatibility + Security; Quality → Usability + Maintainability + Performance).

**But it's lossy.** Class 6 (consumer-friction) and class 7 (evolutionary-friction) are not the
same. Collapsing them loses information. Stick with 8 + 3 architectural-elements.

**Recommendation:** keep 8 + 3-arch-elements as the *internal* model. Use the 3 super-classes
**only** for marketing / executive-summary output ("apiq found 12 Validity issues, 8 Compliance
issues, 23 Quality issues"). Don't restructure the codebase around 3.

---

## Cross-Industry Patterns worth adding to apiq (the take-into-apiq subset)

These are concrete, generic-detectable patterns surfaced from cross-domain survey that fit Stage A
constraints (no vendor-conditionals, no API-family-detection, deterministic).

| Pattern | Source-Domain | Lens | Why-generalisable | Detection-feasibility | Severity-axis | Notes |
|---|---|---|---|---|---|---|
| **F-1. Sunset header (RFC 8594) on deprecated operations** | RFC + FinTech FAPI mandate | 3, 10 | Generic deprecation-flow standard; supersedes ad-hoc `deprecated: true`. | mech (response-header-name match) | warn (when `deprecated: true` declared but no `Sunset` header schema documented) | Adjacent to brainstorm J3-J5; upgrade by tagging the formal RFC. |
| **F-2. `Accept-Language` header support on user-facing operations** | i18n / localization | 2, 4 | Detects whether locale-content-negotiation is documented; signals API-readiness for non-English clients. | mech-stat (`info.description` mentions languages OR responses include localized fields OR `Accept-Language` parameter declared) | hint | Borderline opinion-overreach; off-by-default in apiq, on-demand in user config. |
| **F-3. Time-zone-explicit datetime fields** | i18n + RFC 3339 | 2, 4 | `format: date-time` is RFC 3339; specs that use `string` with `pattern` allowing zone-less time = future timezone-bug source. | mech (regex on date-time `pattern` properties) | hint | Promotes existing I4 (date-format-mixing) to RFC-3339-conformance. |
| **F-4. Capability-discovery endpoint detection** | HealthTech FHIR + ML/AI MCP | 9, 10 | A spec that exposes `/capabilities`, `/_meta`, `/.well-known/ai-plugin.json`, etc. signals AI-agent-readiness. | mech (path-template match against allowlist of well-known paths) | hint | Could become positive-marker rather than negative — flag absence on agent-targeted specs only. |
| **F-5. Consistent `expand` / `fields` query-param across collection-getters** | TM Forum + Stripe + GitHub | 4, 5 | Selective-field-loading is a major client-friction-mitigator; specs that have it on some endpoints but not others = cross-op inconsistency. | mech-stat (param-name presence across collection-getters) | hint | Companion to existing brainstorm Pagination-Style-Inconsistency walker. |
| **F-6. `Retry-After` header presence on 429 + 503 responses** | RFC 7231 + cross-industry | 7, 10 | Already partial in C9 + W6 walker. Reinforce as Lens-7 + Lens-10 multi-tag; the cross-industry survey confirms it's universal-best-practice. | mech (response-header-name on 429 + 503) | warn (when 429 declared without Retry-After) | Reinforces existing rule; severity-upgrade candidate. |
| **F-7. Standard rate-limit headers (`RateLimit-*` or `X-RateLimit-*`) when 429 declared** | OpenAI + GitHub + Stripe + draft-ietf-httpapi-ratelimit-headers | 7, 10 | New IETF draft is formalising this. Specs that declare 429 should declare `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` headers. | mech | hint (until draft is RFC; warn after) | New Lens-10 cornerstone. |
| **F-8. `info.contact` + `info.license` substantive (not stub)** | FAIR principles + Postman / RapidAPI | 4, 9, 10 | Discoverability + reusability metadata. Already partially covered by `info-contact` / `info-license` Spectral defaults; refine to check substance. | mech (URL/email structure validation) | hint | Already partial; tighten. |
| **F-9. `externalDocs` URL-resolvable check** | FAIR + Pautasso | 4, 9 | When `externalDocs.url` is declared, basic-sanity-check (HTTP-resolvable) is reasonable for CI mode. **Out-of-scope for offline Stage-A** but in-scope for live-mode. | mech (URL parse) + heur (live HTTP HEAD) | hint | Borderline — "live" check is arguably out-of-Stage-A. Keep parse-validation only. |
| **F-10. SLA4OAI extension presence (or alternative SLA-extension)** | OpenAPI Initiative + MAP | 10 | Detect `x-sla` / `x-rate-limit` / `x-quota` extensions; positive-marker for Lens 10. | mech (vendor-extension-name allowlist) | hint (positive marker; absence not flagged unless other rate-limit-evidence is present) | Lens 10 cornerstone. |
| **F-11. Linguistic anti-pattern: Amorphous URI** | Palma/Khomh DOLAR | 4, 5 | URIs with file-extensions (`/users.json`), trailing-slash, mixed-case, underscore, ambiguous-noun. | mech (path-regex set) | warn for trailing-slash + file-extension; hint for case/underscore (already covered by S1-S4) | Already partial; formalise as full DOLAR-pattern set. |
| **F-12. Linguistic anti-pattern: Tiny Resource** | Palma/Khomh DOLAR | 4, 5 | URIs with single-letter or 1-2-character resource names (`/u`, `/x`). | mech (path-segment-length on resource-segments) | hint | Niche but high-precision. |
| **F-13. Linguistic anti-pattern: Forgotten Verbs** | Palma/Khomh DOLAR | 5 | Resource exposes only one HTTP verb when CRUD is implied (POST + GET-list expected; DELETE missing). | graph (HTTP-method coverage) | hint | Already in apiq §5; formalise as DOLAR-pattern. |
| **F-14. Linguistic anti-pattern: Pluralised Nodes (sing/plur mix on same resource)** | Palma/Khomh DOLAR | 5 | `POST /users` (correct) + `DELETE /user/{id}` (wrong) on same resource. | graph (path-template-tree) | warn | Refines existing S7 (plural/singular consistency); new shape: same-resource-but-mixed. |
| **F-15. Polymorphism `@type`-discriminator-on-the-wire convention** | TM Forum + JSON:API + Schema.org | 5 | Specs that use polymorphism via inheritance without declaring runtime-type-marker (`@type` / `kind` / `_type`) → client cannot distinguish variants. | graph (oneOf with inheritance + missing discriminator + missing _type-like marker) | hint | Adjacent to existing apiq oneOf-discriminator rule. |
| **F-16. CapabilityStatement / Server-Self-Description endpoint declared** | FHIR + healthcare | 9, 10 | A `GET /metadata` or similar self-description endpoint signals server-introspection support. | mech (path-template match) | hint (positive marker only) | Off-by-default. |
| **F-17. POLA — Operation summary doesn't contradict HTTP method** | Bloch + Qt + apiq SC-3 | 4, 5 | Summary says "Create user" on a `GET /users` operation = high-friction smell. | heur (keyword match in summary against HTTP method) | warn | Already in Phase-E SC-3; reinforced. |
| **F-18. Doc-smell: Bloated description** | API Documentation Smells (arXiv 2102.08486) | 4 | `description` field >2000 words on a single property. | mech-stat | hint | Niche; off-by-default. |
| **F-19. Doc-smell: Lazy description** | API Documentation Smells | 4 | `description` is a copy of the property name (`description: "userId"` for property `userId`). | mech (string-equality after normalisation) | hint | New angle on existing apiq description-substantive rule. |
| **F-20. JWT Bearer-Token security-scheme — `bearerFormat: "JWT"`** | RFC 7519 + FAPI | 1, 2 | When `securitySchemes.X.scheme: bearer` declared, `bearerFormat` should be set (commonly `"JWT"`). Missing = ambiguous. | mech | hint | Lens 1 + Lens 2 multi-tag. |

**Totals:** 20 net-new patterns from Phase F cross-industry survey, mostly Lens 4 / 5 / 7 / 10 with
some Lens 1 / 2 / 9 reinforcement. Most are `hint` severity (low-confidence, opinion-overreach
risk).

---

## Domain-specific patterns explicitly skipped (for documentation)

| Pattern | Source-Domain | Why-domain-specific |
|---|---|---|
| FDX 600+ data-element naming conventions | FinTech | Vendor-knowledge → LLM-job |
| FHIR resource-naming conventions (Patient, Observation, etc.) | HealthTech | Domain-knowledge → LLM-job |
| FHIR `_summary`/`_elements`/`_revinclude` query-params | HealthTech | Domain-specific search-modifiers |
| HL7 v2-pipe-separated-segments | HealthTech | Pre-REST format |
| oneM2M `<AE>`, `<container>`, `<contentInstance>` resource types | IoT | Protocol-binding-level, rarely OpenAPI |
| Matter cluster-and-attribute schema | IoT | Protocol-level, not REST |
| TM Forum `lifecycleStatus` field on every resource | Telecom | Domain-convention |
| FAPI client-side transport requirements (mTLS, DPoP) | FinTech | Runtime, not spec-detectable |
| PSD2 SCA (Strong Customer Authentication) flow | FinTech | Runtime + business-logic |
| Apollo Federation `@key`/`@shareable` directives | E-Commerce | GraphQL, not OpenAPI |
| Shopify GraphQL connections / cursor-based pagination | E-Commerce | GraphQL-specific |
| OpenTelemetry semantic-conventions for span attributes | Observability | Run-time instrumentation, not spec |
| MCP transport-protocol details | ML/AI | Separate transport-spec, not OpenAPI |
| FAIR principles for dataset-metadata (DOI, ORCID, etc.) | Research-data | Dataset-level, not API-level |
| HealthTech HIPAA-specific PHI handling rules | HealthTech / Compliance | Domain-knowledge → LLM-job (Lens 6 generic-PII-detection covers structurally) |
| GDPR Article-32 specific encryption requirements | Compliance / EU | Runtime + business-context |
| Government-specific accessibility-WCAG-for-APIs | Government | Mostly content-level (description-readability), already covered |
| Sustainability / green-software / carbon-aware patterns | Cross | Too speculative for spec-level today |

---

## Meta-Observations / Insights

**MO-1. Round-2 found 4 new lenses; Round-2-Phase-F finds 1 new lens (10).** The marginal-yield
curve is clearly diminishing. Each round adds **fewer** lenses than the last (Round-1: 5 lenses
established; Round-2 Phase A-E: +4; Round-2 Phase F: +1). Probably converged.

**MO-2. `Stakeholder × Lifecycle × Defect-Class` is the right meta-axis** — confirmed by Round-2
because the cube *predicted* the gaps (Lens 9 = machine-stakeholder; Lens 10 = runtime-at-scale-
operational-metadata-missing; Lens 6 = privacy-leakage). The cube isn't *new* — it was already in
Iteration-1 — but Round-2 *validates* it.

**MO-3. ISO/IEC 25010 is a useful secondary axis** for severity-justification, marketing, and
linking to industry-canonical research (Springer Delphi study has the rule-importance map).
**Recommendation:** when each apiq rule is finalised, tag it with its ISO/IEC 25010 quality-
characteristic. This lets apiq report findings as "Maintainability: 5 issues; Security: 2 issues"
in addition to lens-based grouping.

**MO-4. The 8 functional detector classes survive Round-2** — they're rule-level shapes, not
architecture-level shapes. Round-2 added **3 new architectural elements above them** (Classifiers,
Statistical Aggregators, Deep-Mechanic Modules). These were already implicit in apiq; the
contribution of Phase F is to **name them explicitly**.

**MO-5. Cross-industry patterns are mostly LLM-job, not Stage-A** — confirmed.
- **FinTech / HealthTech / Telecom domain-knowledge** — LLM-job
- **Generic-detectable** patterns from cross-industry survey: ~20 (see take-into-apiq table)
- This validates the Iteration-6 architecture-correction: "Stage A is putz, LLM is differentiator."

**MO-6. The `expand` / `fields` query-param convention is a quiet-but-consistent pattern across
TM Forum + Stripe + GitHub + Salesforce.** It's currently underrepresented in apiq's brainstorm.
**Recommendation:** add F-5 (consistent `expand`/`fields` cross-collection-getters) to the next
brainstorm iteration. Strong cross-domain evidence; mech-stat detectable; high client-friction
when inconsistent.

**MO-7. Lens 10 (Operational-Metadata) overlaps Lens 7 (Operations-HTTP-protocol) and Lens 4
(Client-Friction).** When implementing, keep Lens 10 as a **logical grouping** with multi-lens-tags
on individual rules. Don't create a separate detection-pipeline for it.

**MO-8. Doc-smell research (arXiv 2102.08486) gives 5 doc-smells.** apiq already covers 2-3 of
them via existing rules. Adding the remaining 2-3 (Bloated, Lazy) is low-effort, low-controversy.

**MO-9. Linguistic anti-patterns from Palma/Khomh (DOLAR/SARA) are partially in apiq.**
Formalising the full DOLAR catalog would add maybe 4-6 new rules. **Recommendation:** explicit
DOLAR-pattern-set in apiq's published ruleset would be a marketing-win (cite the academic source).

**MO-10. POLA (Principle of Least Astonishment) is the unifying-principle most rules indirectly
serve.** Bloch / Qt / Massé all converge on it. apiq's `description` should explicitly say "apiq
lints OpenAPI specs against the Principle of Least Astonishment" — it's a clean elevator-pitch
that captures Lens 4 + 5 + 9.

**MO-11. SLA4OAI exists but adoption is thin.** Detecting `x-sla` / `x-rate-limit` extensions is
a positive-marker (low-volume signal); not flagging absence aggressively. The community-publish-
ability of "apiq supports SLA4OAI" is a marketing-bonus.

**MO-12. The Springer Delphi study (arXiv 2108.00033) gives apiq a defensible severity-axis
calibration.** Of 82 design rules, 28 are "high-importance". Cross-reference apiq's existing
ruleset to that 28-list and ensure all 28 are at `warn` or higher. **Action item.**

**MO-13. Apollo Federation / Shopify GraphQL is genuinely out-of-scope** for OpenAPI-Stage-A.
If apiq ever adds GraphQL support, those patterns would be relevant; until then, document-and-
skip is correct.

**MO-14. Capability-discovery endpoint detection (FHIR CapabilityStatement, MCP `/.well-known`,
etc.) is interesting but borderline.** It's a *positive marker* (presence is good), not a
*negative finding* (absence isn't necessarily bad). Treating it as an information-only "spec-
metadata-presence" tag rather than a finding might be the right framing. **Recommendation:** add
as info-tier (below `hint`) with a flag like `metadata: positive-marker`.

---

## Open Questions remaining

1. **Should "info-tier" findings exist alongside error/warn/hint?** Lens 10's positive markers
   (SLA4OAI presence, capability-discovery endpoint presence) are not really "findings" — they're
   "observations". apiq's severity-axis currently doesn't have a positive/info tier. **Worth a
   patch.**

2. **Is Lens 10 distinct enough from Lens 7 to justify separation?** I've argued yes (HTTP-protocol
   ops vs application-operational-metadata are different concerns). But during Phase B (LLM)
   testing, if the LLM lumps them or the user feedback says "this distinction is artificial",
   merge them.

3. **How does apiq handle the `Stakeholder` axis in output presentation?** A finding tagged
   `stakeholder: security` should probably surface differently than `stakeholder: doc-renderer`.
   Currently apiq's output is flat. **Patch candidate.**

4. **Is the Springer Delphi 28-high-importance-rules list a hard target for apiq's "best-in-class"
   bar?** I.e., should we measure ourselves against "all 28 covered + all 17 medium covered" as
   the explicit putz-niveau benchmark? **Yes, recommend so.** Convert the 28 + 17 into apiq
   benchmark-targets in the next Stage-A polish round.

5. **Does Lens 9 (AI-Agent-Consumability) need a sub-lens for MCP-specific patterns?** MCP is
   evolving fast (May 2026). For now, keep Lens 9 generic; revisit if MCP becomes the dominant
   AI-agent-consumption pattern.

6. **Are deep-mechanic modules better as single TypeScript module per concern (current direction)
   or as Spectral functions?** Performance and testability favour TS modules. Spectral-function
   integration favours interop with downstream Spectral-rule users. **Probably both — the TS
   module exports a Spectral-function-compatible interface.** Architectural follow-up.

7. **Should the meta-axis (`Stakeholder × Lifecycle × Defect-Class`) be exposed in the apiq UI?**
   Probably yes, as filterable tags on findings. UI design follow-up for v1.1.

8. **Is "Sustainability / Green-Software" worth revisiting in 6-12 months?** Currently too
   speculative. Watch for EU regulatory developments + Green Software Foundation OpenAPI guidance.
   **Tracking item, not action item.**

9. **Should DOLAR-pattern-coverage be an explicit benchmark?** "apiq covers the full DOLAR
   anti-pattern catalog" is a marketing-defensible claim. **Yes, recommend.**

10. **Does the 3-architectural-element view (Classifiers / Aggregators / Deep-Mechanic-Modules)
    need to be reflected in the codebase directory structure?** Currently `scripts/spike/
    deterministic/` has a flat structure. **Possible refactor target post-spike-lock.**

---

## Status

- **Authored:** 2026-05-05.
- **Hypothesis-test results:**
  - **H1 — partially confirmed:** Lens 10 (Operational-Metadata-Coverage) emerges with strong
    cross-domain evidence (MAP, SLA4OAI, FAPI, TM Forum, OpenAI, FDX). No Lens 11 / 12 with strong
    evidence; cross-domain patterns either fold into existing lenses or are LLM-domain-knowledge.
  - **H2 — confirmed:** `Stakeholder × Lifecycle × Defect-Class` from Iteration-1 is the right
    operational meta-axis. ISO/IEC 25010 is the right secondary axis (severity-justification +
    marketing + literature-bridge to Springer Delphi rule-importance map). Other candidate axes
    (Internal/External, Structural/Semantic, Spec-time/Runtime, Human/Machine) are useful as
    descriptive tags, not as the organising structure.
  - **H3 — refined-not-replaced:** Original 8 functional detector classes survive as the rule-
    level taxonomy. Round-2 adds **3 architectural elements above them** (Classifiers, Statistical
    Aggregators, Deep-Mechanic Modules). The codebase already has these implicitly; Phase F's
    contribution is naming them explicitly.
- **Net-new patterns:** 20 (F-1 .. F-20). Most are `hint` severity, multi-lens-tagged.
- **Net-new lens:** 1 (Lens 10).
- **Net-new architectural elements:** 3 (Classifiers, Aggregators, Deep-Mechanic Modules — formerly
  implicit, now explicit).
- **Marginal-yield-curve:** clearly diminishing across rounds. Round-2 + Round-2-F combined yields
  add 5 lenses + 8 deep-mechanic modules + 20 patterns. Convergence likely; further mining rounds
  would yield single-digit patterns each.

## Sources

**Academic / canonical:**
- [Joshua Bloch — *How to Design a Good API and Why It Matters* (Google, 2006)](https://research.google.com/pubs/archive/32713.pdf)
- [Joshua Bloch — *Bumper-Sticker API Design* (InfoQ)](https://www.infoq.com/articles/API-Design-Joshua-Bloch/)
- [Qt — *API Design Principles*](https://wiki.qt.io/API_Design_Principles)
- [Jasmin Blanchette — *The Little Manual of API Design*](https://www.cs.vu.nl/~jbe248/api-design.pdf)
- [Mark Massé — *REST API Design Rulebook* (O'Reilly)](https://www.oreilly.com/library/view/rest-api-design/9781449317904/)
- [Heroku HTTP API Design Guide](https://github.com/interagent/http-api-design)
- [Olaf Zimmermann et al. — *Patterns for API Design*](https://microservice-api-patterns.org/introduction)
- [Stocker / Zimmermann / Zdun / Lübke / Pautasso — *Interface Quality Patterns* (EuroPLoP 2018)](https://microservice-api-patterns.org/publications)
- [Pautasso — publication list](https://scholar.google.com/citations?user=r7ISNNYAAAAJ&hl=en)
- [Palma / Khomh — *Are RESTful APIs Well-Designed? Detection of Linguistic (Anti)Patterns*](https://link.springer.com/chapter/10.1007/978-3-662-48616-0_11)
- [Palma — *Semantic Analysis of RESTful APIs (SARA)* — World Scientific](https://www.worldscientific.com/doi/abs/10.1142/S0218843017420011)
- [Springer / Delphi study — *Which RESTful API Design Rules Are Important?* (arXiv 2108.00033)](https://arxiv.org/abs/2108.00033)
- [Springer / EMSE — *Do RESTful API design rules have an impact on understandability?*](https://link.springer.com/article/10.1007/s10664-023-10367-y)
- [API Documentation Smells (arXiv 2102.08486)](https://arxiv.org/pdf/2102.08486)
- [RESTful API Vulnerability Detection — ScienceDirect 2025](https://www.sciencedirect.com/org/science/article/pii/S1546221825007040)
- [Catalog of Microservice Anti-patterns (tertiary study) — ScienceDirect 2024](https://www.sciencedirect.com/science/article/pii/S0164121223002248)
- [Microservice Bad Smells Definition — ResearchGate / IEEE Xplore](https://ieeexplore.ieee.org/document/8354414/)

**Standards / quality models:**
- [ISO/IEC 25010:2011 (and 2023 update)](https://www.iso.org/standard/35733.html)
- [arc42 — ISO/IEC 25010 Quality Model](https://quality.arc42.org/standards/iso-25010)
- [FAIR Guiding Principles (Wilkinson et al., Scientific Data 2016)](https://www.nature.com/articles/sdata201618)
- [GO FAIR Principles](https://www.go-fair.org/fair-principles/)
- [Principle of Least Astonishment — Wikipedia](https://en.wikipedia.org/wiki/Principle_of_least_astonishment)

**Cross-industry standards bodies:**
- [HL7 FHIR RESTful API](https://www.hl7.org/fhir/http.html)
- [Open Banking UK — Security Profiles](https://standards.openbanking.org.uk/security-profiles/)
- [OpenID FAPI Working Group](https://openid.net/wg/fapi/)
- [Financial Data Exchange — FDX 5.0](https://www.financialdataexchange.org/FDX/FDX/News/Press-Releases/Financial_Data_Exchange_Releases_FDX_API_5.0.aspx)
- [GOV.UK — API Technical and Data Standards](https://www.gov.uk/guidance/gds-api-technical-and-data-standards)
- [TM Forum — Open APIs (TMF630 v4.2)](https://www.tmforum.org/resources/specification/tmf630-rest-api-design-guidelines-4-2-0/)
- [oneM2M — Wiki + API guide](https://wiki.onem2m.org/index.php?title=OneM2M_overview)
- [OCF — Specifications](https://openconnectivity.org/developer/specifications/)
- [Hugging Face — Inference Providers](https://huggingface.co/docs/inference-providers/index)
- [Apollo GraphQL — Federated Schemas](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/federation)

**API design + lifecycle + observability:**
- [Postman — API Lifecycle](https://www.postman.com/api-platform/api-lifecycle/)
- [Apigee — API Development Lifecycle](https://docs.apigee.com/api-platform/fundamentals/api-development-lifecycle)
- [Zuplo — API Management Maturity Model](https://zuplo.com/learning-center/api-management-maturity-model)
- [OpenTelemetry — Semantic Conventions Overview](https://opentelemetry.io/docs/concepts/observability-primer/)

**OpenAPI extensions:**
- [SLA4OAI Specification](https://sla4oai.specs.governify.io/Specification.html)
- [OpenAPI Initiative — Arazzo Specification](https://www.openapis.org/blog/2021/03/10/openapi-meets-sla)
- [LLM-Friendly API Design — Agentic Patterns](https://www.agentic-patterns.com/patterns/llm-friendly-api-design/)
- [Making REST APIs Agent-Ready — arXiv 2507.16044](https://arxiv.org/html/2507.16044v1)

**Internationalization:**
- [Octo / Internationalize-your-API cookbook](https://octo-woapi.github.io/cookbook/internationalization.html)
- [API UX — How to Localize your API](https://apiux.com/2013/04/25/how-to-localize-your-api/)
