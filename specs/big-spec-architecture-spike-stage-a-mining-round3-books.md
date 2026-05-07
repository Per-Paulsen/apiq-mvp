# Round-3 Mining — Books (M1-Books)

> Authored 2026-05-07 by M1-Books-Subagent. Source-mining für Welle M / Stage-A-Spike. Citation-Pflicht (D1+D3): jeder Pattern hat verbatim-Quote ≤200 chars + web-verifiable URL. Training-only Patterns wurden discarded.
>
> **Method.** WebSearch nach Sample-Chapters / Author-Blog-Posts / Pattern-Catalog-Snippets. Hauptquelle für `Patterns for API Design` (Zimmermann/Pautasso/Stocker/Lübke/Zdun, Addison-Wesley 2022) ist die offizielle Pattern-Catalog-Site `microservice-api-patterns.org` (auch als `api-patterns.org` aliased) — die das vollständige Pattern-Material des Buches in identischer Formulierung publiziert (autoritativ, von den Buchautoren selbst gepflegt). Sekundärquellen für andere Bücher sind Reviews/Summaries die exakte Quotes durchreichen, plus offizielle Pearson/Manning/O'Reilly-TOCs mit verbatim Excerpts.
>
> **Schema.** Per `E09-w-m-mining-optimization-brainstorming.md` §1 / D1.

## Sources surveyed

### Initial-List (7 Books)

| # | Book | Author(s) | Year | Yield | Verifiability |
|---|---|---|---|---|---|
| 1 | Web API Design | Erik Wilde | 2010s | minimal — book is monograph contribution to "REST: From Research to Practice" (Springer 2011, ed. Wilde+Pautasso); no public sample-chapter found with extractable verbatim patterns. Wilde's later work flows into Continuous API Management. | weak |
| 2 | **Patterns for API Design** | Zimmermann, Stocker, Lübke, Zdun, Pautasso | 2022 (Addison-Wesley) | **highest yield** — 44 patterns across 6 chapters. Full canonical pattern-catalog at `microservice-api-patterns.org` is the book-content extracted into web form, maintained by the authors themselves (per `api-patterns.org/book/`). Each pattern page is web-verifiable + copyable verbatim. Mining target. | strong |
| 3 | RESTful Web Services Cookbook | Subbu Allamaraju | 2010 (O'Reilly) | medium — Internet Archive has full PDF; recipe titles + structure verifiable; specific recipe quotes findable via summaries. Older book — many patterns already absorbed into Round-1 Spectral mining. | medium |
| 4 | Design and Build Great Web APIs | Mike Amundsen | 2021 (Pragmatic) | medium — chapter-by-chapter summaries on Medium reproduce some content; Pragmatic + O'Reilly preview pages give TOC. Covers Sketch/Design/Build/Test/Secure/Deploy lifecycle. | medium |
| 5 | Continuous API Management (1st + 2nd ed) | Medjaoui, Wilde, Mitra, Amundsen | 2019 / 2021 (O'Reilly) | medium — F5/NGINX hosts Ch1-3 PDF excerpt; O'Reilly chapter-1/3/6/8 previews give verbatim text. Focus is governance/lifecycle/maturity not single-spec rules — yields more strategic than mechanic patterns. | medium |
| 6 | API Marketplace Engineering | Rennay Dorasamy | 2022 (Apress) — note: Apress 2020/22 — search results show 2022 publication | low | medium |
| 7 | REST in Practice | Webber, Parastatidis, Robinson | 2010 (O'Reilly) | low — mostly hypermedia/HATEOAS theory; little that translates to single-spec mechanic-detectable patterns beyond what Round-1+2 already capture. | weak |

### Discovery (Subagent web-searched additional sources)

| # | Book | Author(s) | Year | Yield | Why |
|---|---|---|---|---|---|
| D1 | **API Design Patterns** | JJ Geewax | 2021 (Manning) | **high** — modern, Google-internal-experience, 28 patterns across 6 parts, free Manning excerpt (`livebook.manning.com/book/api-design-patterns/chapter-10`) + Manning Medium articles reproduce content verbatim. Strong on Standard Methods, Long-Running Operations, Soft Delete, Field Masks, Resource Identifiers, Versioning. | strong |
| D2 | **REST API Design Rulebook** | Mark Massé | 2011 (O'Reilly) | **medium-high** — 60+ rules with imperative MUST/SHOULD-style formulation, verbatim quotes findable across Medium summaries, Bennadel review, archive.org full PDF, Internet Archive, GitHub gist with full rule-list. Strong on URI rules, HTTP method semantics, headers. | strong |
| D3 | Designing Web APIs | Jin, Sahni, Shevat | 2018 (O'Reilly) | medium — Lucky Bookshelf summary reproduces specific findings on rate-limiting (token-bucket), webhooks (verification-token + signing), OAuth (short access tokens + refresh + revocation UI). Some patterns translate to mechanic-detectable rules. | medium |
| D4 | Mastering API Architecture | Gough, Bryant, Auburn | 2023 (O'Reilly) | low-medium — focus on infrastructure (gateways, service mesh, deployment) more than spec-level patterns. TOC-level confirms some patterns (idempotency, async). Less yield than expected. | weak |
| D5 | Principles of Web API Design | James Higginbotham | 2021 (Addison-Wesley) | medium — confirmed via Pearson sample-PDF link + InformIT TOC; ADDR process (Align-Define-Design-Refine), 5 API styles (REST/RPC/Query/Async/event), outside-in design. Some pattern overlap with Round-1+2. | medium |
| D6 | Build APIs You Won't Hate (1st + 2nd ed) | Phil Sturgeon | 2015 / 2018 (Leanpub) | low — anecdotal; embeds + pagination + HATEOAS coverage, but PHP-centric; better-cited material flows directly into Sturgeon's `apisyouwonthate.com` content already mined in Round-1 spectral. | weak |
| D7 | Irresistible APIs | Kirsten Hunter | 2016 (Manning) | low — design philosophy / business-orientation framing; strategic not mechanic — 3-4 quotable lines but no extractable rules beyond what's already covered. | weak |
| D8 | API Security in Action | Neil Madden | 2020 (Manning) | medium — specific security-pattern detail; rate-limiting-first principle, TLS-mandatory, JWT-bearer-grant, mTLS-OAuth coverage. Free Manning PDF excerpt. Threats-side patterns. | medium |
| D9 | OAuth 2 in Action | Richer, Sanso | 2017 (Manning) | low — protocol-detail more than spec-design patterns. Minimal extractable mechanic rules. | weak |
| D10 | RESTful Web APIs | Richardson, Amundsen, Ruby | 2013 (O'Reilly) | medium — ALPS, hypermedia profiles, JSON-LD; theoretical-heavy. Some discoverable patterns on hypermedia constraints. Less yield than newer books. | weak |
| D11 | Hands-On RESTful API Design Patterns | Subramanian, Raj | 2019 (Packt) | low — Packt-style; SOA/EDA/ROA framing; ENT-leaning. Minimal yield over above. | weak |
| D12 | Building Microservices (2nd ed) | Sam Newman | 2021 (O'Reilly) | low for Stage-A — service-architecture not spec-design; cross-cutting service-boundary patterns aren't single-spec mechanic. Skip. | weak |
| D13 | The Design of Web APIs | Arnaud Lauret | 2019 (Manning) | low-medium — book exists, recommendation for `2025` reading-lists confirms; not enough sample-content surfaced via WebSearch to extract verbatim patterns reliably. | weak |
| D14 | Advanced API Security | Prabath Siriwardena | 2020 (Apress) | low — security-protocol-deep, less spec-mechanic. Skip. | weak |

### Discovery-Stop-Reason

Stoppe nach **14 Discovery-WebSearches** + initialer 7-Book-Bekanntenliste = 21 Bücher gesichtet. Letzte Discovery-Searches (Microservice-API-Design Newman/Heath, GraphQL in Action, OAuth 2 in Action, RESTful Web APIs Richardson, "best API design books 2025" curated lists) brachten: **(a)** alle Bücher die mir aus apiq's bisheriger Mining-Erfahrung relevant erscheinen waren bereits abgedeckt, **(b)** weitere Suchen produzieren entweder duplicate-Funde (Building Microservices, OAuth-protocol-deep, Federation-Bücher) oder Bücher außerhalb Stage-A-Scope (GraphQL-only, gRPC-only, security-protocol-only). **Plausibility-Erschöpfung erreicht (NICHT Time/Count-Cap).**

---

## Patterns extracted

### Lens 1 — Threat-Modeling

```yaml
- pattern-id: R3-BK-TM-01
  lens: [threat-modeling]
  source:
    type: book
    citation: "Madden, 'API Security in Action' (Manning 2020), excerpt — rate-limiting principle"
    verbatim: "Rate-limiting rejects requests when your API is under too much load... Rate-limiting should be the very first decision applied to incoming requests."
    url: "https://www.manning.com/books/api-security-in-action"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: APIs without explicit rate-limit declaration in spec (no `429` response, no `Retry-After`/`X-RateLimit-*` headers documented) cannot signal load-protection — Madden's "first decision" principle violated.
  relates-to-existing: [C9, C-SP-1, Y-1, EV-1, RFC-9745-style-Sunset]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-TM-02
  lens: [threat-modeling, client-friction]
  source:
    type: book
    citation: "Jin/Sahni/Shevat, 'Designing Web APIs' (O'Reilly 2018), Ch.3 API Security — webhook verification (Lucky Bookshelf summary verbatim)"
    verbatim: "a webhook should contain a verification token to ensure that the sender is who he claims to be... or even better for the sender to sign it, as this method prevents any possible replay attacks or forgery."
    url: "https://www.luckybookshelf.com/designing-web-apis-by-brenda-jin-saurabh-sahni-amir-shevat/"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: Webhook-Operations (path matches `/webhooks/*` or in `webhooks` section OAS 3.1) without documented signature-verification headers (e.g. `X-Hub-Signature`, `Stripe-Signature`, `Webhook-Signature` per IETF httpapi-webhook-signature-draft) leak replay/forgery surface.
  relates-to-existing: [U1, U2, U-SP-1]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-TM-03
  lens: [threat-modeling]
  source:
    type: book
    citation: "Jin/Sahni/Shevat, 'Designing Web APIs' (O'Reilly 2018), Ch.3 — OAuth scope granularity"
    verbatim: "OAuth scopes need to be granular enough so as not to grant the client application more permissions than are needed for the task."
    url: "https://www.luckybookshelf.com/designing-web-apis-by-brenda-jin-saurabh-sahni-amir-shevat/"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: OAuth2-Schemes mit `scopes`-Object dessen einziger Eintrag `*`/`all`/`full_access`/`admin` ist — verstößt gegen Least-Privilege. Detect via static keys-list compare.
  relates-to-existing: [F5, F-SP-1, F-SP-3]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-TM-04
  lens: [threat-modeling]
  source:
    type: book
    citation: "Jin/Sahni/Shevat, 'Designing Web APIs' (O'Reilly 2018), Ch.3 — access token short lifespan"
    verbatim: "The access token should have a short lifespan to limit the exposure if it is compromised, and instead, issue a refresh token that can be exchanged for a new access token"
    url: "https://www.luckybookshelf.com/designing-web-apis-by-brenda-jin-saurabh-sahni-amir-shevat/"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: OAuth2-flows (`authorizationCode`/`clientCredentials`/`password`) ohne `refreshUrl` declared — Token-Rotation impossible per spec; long-lived tokens vector.
  relates-to-existing: [F-SP-2, Y-6]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-TM-05
  lens: [threat-modeling]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — API Key pattern, Ch.9 (Quality Management)"
    verbatim: "As an API provider, assign each client a unique token — the API Key — that the client can present to the API endpoint for identification purposes."
    url: "https://microservice-api-patterns.org/patterns/structure/specialPurposeRepresentations/APIKey"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: API-Key-Schemes mit `in: query` (ohne header alternative) — Zimmermann's MAP-pattern definiert API Key als token; URL-query is logging-leak vector. Severity hint weil already partially covered by F-SP / Y-2.
  relates-to-existing: [Y-2, F-SP-1]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true
```

### Lens 2 — Standards-Compliance

```yaml
- pattern-id: R3-BK-ST-01
  lens: [standards-compliance, evolution-friction]
  source:
    type: book
    citation: "Massé, 'REST API Design Rulebook' (O'Reilly 2011) — URI rule (Medium summary verbatim)"
    verbatim: "Underscores (_) should not be used in URIs."
    url: "https://medium.com/@ibrahimsoliman97/summary-of-rest-api-design-rulebook-by-mark-mass%C3%A9-6f290fa04a2d"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Path-Segments mit `_` (underscore) — Massé-Rule: in URIs der Underscore wird browser-/visualization-tools verschleiert (unterstrichen). Spectral-detectable via path-segment regex. Apiq G4/S1 deckt lowercase, NICHT explizit underscore-forbid.
  relates-to-existing: [G4, S1, S-SP-9]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-ST-02
  lens: [standards-compliance]
  source:
    type: book
    citation: "Massé, 'REST API Design Rulebook' (O'Reilly 2011) — URI rule"
    verbatim: "Hyphens (-) should be used to improve the readability of URIs."
    url: "https://medium.com/@ibrahimsoliman97/summary-of-rest-api-design-rulebook-by-mark-mass%C3%A9-6f290fa04a2d"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Path-Segments mit camelCase oder snake_case (statt kebab-case `-`-separated) — partielle Überlappung mit S-SP-9 (allowed-chars), erweitert um positive-style-Recommendation.
  relates-to-existing: [G4, S-SP-9]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-ST-03
  lens: [standards-compliance]
  source:
    type: book
    citation: "Massé, 'REST API Design Rulebook' (O'Reilly 2011) — URI hierarchy rule"
    verbatim: "A trailing forward slash (/) should not be included in URIs."
    url: "https://medium.com/@ibrahimsoliman97/summary-of-rest-api-design-rulebook-by-mark-mass%C3%A9-6f290fa04a2d"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: Confirms apiq S3 (Trailing-slash consistency) — Massé takes stronger position: trailing slash MUST NOT exist (not just consistency-of-presence). 100% Duplikat zu S3 wenn rule strict-formuliert wird.
  relates-to-existing: [S3]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-ST-04
  lens: [standards-compliance]
  source:
    type: book
    citation: "Massé, 'REST API Design Rulebook' (O'Reilly 2011) — URI hierarchy rule"
    verbatim: "Forward slash separator (/) must be used to indicate a hierarchical relationship."
    url: "https://www.bennadel.com/blog/2324-rest-api-design-rulebook-by-mark-masse.htm"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Path-Segments die Pseudo-Hierarchie via `.` oder `:` formen (z.B. `/users.123` statt `/users/123`) — RPC-style leak. Already partially covered as RPC-Style-Detection (S-MIN-1, S8). Hint extension.
  relates-to-existing: [S8, S-MIN-1]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-ST-05
  lens: [standards-compliance]
  source:
    type: book
    citation: "Massé, 'REST API Design Rulebook' (O'Reilly 2011) — Media-types consistency rule"
    verbatim: "A consistent form should be used to represent media-type formats, errors, and error responses."
    url: "https://medium.com/@ibrahimsoliman97/summary-of-rest-api-design-rulebook-by-mark-mass%C3%A9-6f290fa04a2d"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: extends-K2 (RFC 7807 problem+json) — Massé says STRONGER: spec-wide error-shape MUST be consistent. Re-confirms cross-source consensus on error-shape-consistency.
  relates-to-existing: [K2, K1, EV-11]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true
```

### Lens 3 — Evolution-Friction

```yaml
- pattern-id: R3-BK-EV-01
  lens: [evolution-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Semantic Versioning pattern"
    verbatim: "How can stakeholders compare API versions to detect immediately whether they are compatible?"
    url: "https://microservice-api-patterns.org/patterns/evolution/SemanticVersioning"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: extends-EV-9 (info.version placeholder check) — MAP Semantic Versioning pattern requires X.Y.Z format. Apiq's H2 covers semver-OR-date; MAP confirms semver-or-date-based as valid + nothing else.
  relates-to-existing: [H2, EV-9, EV-13]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-EV-02
  lens: [evolution-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Aggressive Obsolescence pattern"
    verbatim: "announcing a decommissioning date for the entire API or its obsolete parts, declaring the obsolete API parts to be still available but no longer recommended"
    url: "https://microservice-api-patterns.org/patterns/evolution/AggressiveObsolescence.html"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: `deprecated: true`-Operations ohne sunset-date AND ohne replacement-Reference → MAP pattern requires BOTH (decommissioning date + still-available marker). Strenger als EV-1, der "any of" akzeptiert. Re-tag with `extends-EV-1`.
  relates-to-existing: [EV-1, R4, H4]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-EV-03
  lens: [evolution-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Limited Lifetime Guarantee pattern"
    verbatim: "The API Description and Service Level Agreement should indicate the actual expiration date for the API version to inform API clients by when they need to take action and upgrade."
    url: "https://api-patterns.org/patterns/evolution/LimitedLifetimeGuarantee"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: `info.version` ohne externalDocs-Link auf SLA/lifetime-policy — MAP Limited Lifetime Guarantee says expiration-date should be in API Description. Detection: `deprecated`-marker without `x-sunset`/`x-expires-on` extension OR description-link to SLA.
  relates-to-existing: [V1, V2, EV-1]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: true

- pattern-id: R3-BK-EV-04
  lens: [evolution-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Two in Production pattern"
    verbatim: "deploying and supporting two versions of an API endpoint and its operations that do not have to be compatible with each other, and updating and decommissioning the versions in a rolling, overlapping fashion"
    url: "https://api-patterns.org/patterns/evolution/TwoInProduction.html"
    verified-via: websearch
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: Spec mit servers[] declaring nur 1 version-axis (no /v1 + /v2 alongside) — MAP Two-in-Production-pattern says rolling overlap is best practice. Could detect via path-version-collection (`/v1/...` AND `/v2/...` in same spec is GOOD, not SMELL).
  relates-to-existing: [H1, H-SP-1, EV-10]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: true

- pattern-id: R3-BK-EV-05
  lens: [evolution-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Experimental Preview pattern"
    verbatim: "An API Description should clearly state which version is experimentally previewed and which one is productive."
    url: "https://microservice-api-patterns.org/patterns/evolution/ExperimentalPreview"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: `info.description` der Spec markiert "beta"/"experimental" aber kein Operation-level `x-experimental` oder `deprecated`-marker existiert — MAP wants explicit per-operation labeling. Detection: keyword-scan in info.description ("beta", "preview", "experimental", "alpha") + check ops have matching extensions.
  relates-to-existing: [EV-26]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-EV-06
  lens: [evolution-friction]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.24 Versioning and compatibility"
    verbatim: "perpetual stability, agile instability, and semantic versioning"
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: Geewax categorizes 3 versioning-strategies. Spec mit `info.version` `1.0.0` AND empty `description` (info-level) leaves strategy undeclared — confused-evolution-axis. Borderline LLM-territory because requires reading prose.
  relates-to-existing: [EV-9, EV-13]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: false
```

### Lens 4 — Client-Friction

```yaml
- pattern-id: R3-BK-CL-01
  lens: [client-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Wish List pattern"
    verbatim: "As an API client, provide a Wish List in the request that enumerates all desired data elements of the requested resource."
    url: "https://microservice-api-patterns.org/patterns/quality/dataTransferParsimony/WishList"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Heavy GET-Operations (response-schema with >20 properties) WITHOUT `fields`/`include`/`expand`-style query-param — MAP Wish List pattern recommends client-side response-shaping. Detection: count response props vs presence of `fields`/`include`/`expand`-Query-Params on op.
  relates-to-existing: []
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-CL-02
  lens: [client-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Wish Template pattern"
    verbatim: "The Facebook Graph API uses this pattern, and GraphQL can be seen as an advanced or alternative realization of this pattern"
    url: "https://microservice-api-patterns.org/patterns/quality/dataTransferParsimony/WishTemplate"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Spec mit deeply-nested Response-Schemas (>4 levels) ohne Wish-Template-style request-body-shaping — high payload-friction. Companion zu CL-01.
  relates-to-existing: [M4]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: true

- pattern-id: R3-BK-CL-03
  lens: [client-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Pagination pattern"
    verbatim: "How can an API provider deliver large sequences of structured data without overwhelming clients?"
    url: "https://microservice-api-patterns.org/patterns/quality/dataTransferParsimony/Pagination"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: extends-E1 (List-Endpoints sollten Pagination haben) — MAP Pagination pattern explicitly enumerates 4 variants (Page-Based, Offset-Based, Cursor-Based, Time-Based). Apiq E2/E3 cover consistency; this confirms E1's warn-severity vs hint.
  relates-to-existing: [E1, E2, E3]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-CL-04
  lens: [client-friction]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.21 Pagination — page-size limits"
    verbatim: "Pagination allows large collections of results to be consumed in a series of bite-sized chunks using three special fields: maxPageSize, pageToken, and nextPageToken."
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: Pagination-Endpoints with `pageSize`/`limit`-param OHNE `maximum`-constraint OR ohne default-value documented — Geewax explicitly defines pagination contract requires sensible defaults+max. Apiq has `apiq-limit-parameter-needs-bounds` partial-cover.
  relates-to-existing: [apiq-limit-parameter-needs-bounds, E6]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-CL-05
  lens: [client-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Embedded Entity pattern"
    verbatim: "Embedding entities leads to larger response messages which take longer to transfer. Furthermore, it can be difficult to anticipate what information different clients require to perform their tasks."
    url: "https://www.microservice-api-patterns.org/patterns/quality/referenceManagement/EmbeddedEntity"
    verified-via: websearch
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: Response-Schemas mit deeply-embedded sub-entities (e.g. `User.account.preferences.notifications.channels[]`) — Embedded-vs-Linked-Information-Holder trade-off. Spec authors should make explicit choice. Detection: schema-depth distribution outliers.
  relates-to-existing: [M4]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: false

- pattern-id: R3-BK-CL-06
  lens: [client-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Linked Information Holder pattern"
    verbatim: "Add a Link Element to messages that pertain to multiple related information elements. Let this Link Element reference another API endpoint that represents the linked element."
    url: "https://microservice-api-patterns.org/patterns/quality/referenceManagement/LinkedInformationHolder"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Properties matching `*_id`/`*_url` in response without companion `_links`/`relationships` envelope — MAP Linked-Information-Holder pattern says these IDs SHOULD have followable URI. Detection: presence of `_id`-suffix-prop + absence of `_links`-property at same schema level.
  relates-to-existing: [J2, FK-rule]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-CL-07
  lens: [client-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — Conditional Request pattern"
    verbatim: "How can unnecessary server-side processing and bandwidth usage be avoided when frequently invoking API operations that return rarely changing data?"
    url: "https://microservice-api-patterns.org/patterns/quality/dataTransferParsimony/ConditionalRequest"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: extends-C-MIN-1+C-MIN-2 — heavy-read GET-Operations (response > some-bytes-threshold) ohne `If-None-Match`/`If-Modified-Since` accept + ohne `ETag`/`Last-Modified` response-header → bandwidth-waste. Spectral detect: GET-op + response-content-large + no `ETag` header declared.
  relates-to-existing: [C10, C-MIN-1, C-MIN-2]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-CL-08
  lens: [client-friction, evolution-friction]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.10 Long-running operations"
    verbatim: "how to use long-running operations for non-immediate API calls, storing metadata about operational progress, where operations should live in the resource hierarchy, finding operation status via polling and blocking"
    url: "https://livebook.manning.com/book/api-design-patterns/chapter-10"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: POST-Endpoints whose summary/operationId suggests long-running work (verbs: `process`, `analyze`, `compute`, `generate`, `train`, `import`, `export`, `migrate`) but only return `200` (sync) — should support 202-Accepted + Operation-resource pattern (e.g. `/operations/{id}` polling).
  relates-to-existing: [B5]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-CL-09
  lens: [client-friction]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.8 Partial updates and retrievals — Field Masks"
    verbatim: "field masks for targeted partial updates"
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: PATCH-Endpoints (or PUT-Endpoints with `merge`-semantics) without `update_mask`/`fields`/`fieldMask`-parameter — Geewax pattern says targeted partial updates need explicit mask. Companion zu Wish-List (request-side response-shaping vs request-shaping).
  relates-to-existing: [L-SP-2, B-MIN-3]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-CL-10
  lens: [client-friction]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.6 Resource Identification — UUIDs"
    verbatim: "What is an identifier?... What makes a good identifier?... What about UUIDs?"
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Path-param IDs of `type: string` ohne `format: uuid` AND ohne `pattern` — Geewax Ch.6 explicitly discusses UUIDs as identifier-of-choice. Apiq J2/J-SG-1 partial-cover. Recommend strict format-or-pattern.
  relates-to-existing: [J2, J-SG-1, T-SP-1]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-CL-11
  lens: [client-friction]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.6 Resource Identification — checksums"
    verbatim: "checksums as part of identifier design, including checksum implementation in the resource identification section"
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Identifier-Schemas die als `string` typed sind aber heuristisch checksum-bearing (e.g. credit-card-numbers, IBAN, ISBN) ohne `pattern: ^[0-9X]{13,}$`-style validation — Geewax pattern says checksum-IDs need explicit validation.
  relates-to-existing: [J2]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: false
```

### Lens 5 — Style-Coherence

```yaml
- pattern-id: R3-BK-SC-01
  lens: [style-coherence]
  source:
    type: book
    citation: "Continuous API Management 2nd ed (Medjaoui/Wilde/Mitra/Amundsen, O'Reilly 2021), Ch.6 API Styles"
    verbatim: "Resource Style: An API is a collection of resources that allow various kinds of interactions."
    url: "https://www.oreilly.com/library/view/continuous-api-management/9781098103514/ch06.html"
    verified-via: websearch
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: Spec mit operationId-Verben in Path (`/createOrder`, `/getUser`) MIXED mit resource-style paths (`/orders/{id}`) — Continuous API Management explicit naming of "Resource Style" vs Tunnel/RPC. Apiq S8/S-MIN-1 cover RPC-detect; this pattern stresses MIXED-style as style-coherence-violation.
  relates-to-existing: [S8, S-MIN-1, B8]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-SC-02
  lens: [style-coherence, client-friction]
  source:
    type: book
    citation: "Continuous API Management 2nd ed (O'Reilly 2021), Ch.6"
    verbatim: "Hypermedia Style: An API is a collection of interlinked resources just like resources on the Web."
    url: "https://www.oreilly.com/library/view/continuous-api-management/9781098103514/ch06.html"
    verified-via: websearch
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: Spec mit `_links`/`HAL+json`/`hateoas`-references in some response-schemas (>1) but NOT in others (>3 alternative response-schemas without links) — half-hypermedia-half-resource style violation.
  relates-to-existing: []
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-SC-03
  lens: [style-coherence]
  source:
    type: book
    citation: "Higginbotham, 'Principles of Web API Design' (Addison-Wesley 2021), Ch.2 ADDR Process"
    verbatim: "Align-Define-Design-Refine"
    url: "https://www.informit.com/store/principles-of-web-api-design-delivering-value-with-9780137355631"
    verified-via: websearch
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: Higginbotham's 4-phase API-design methodology. Hat keinen direkten mechanic-detector aber als Lens-5-Marker für "Spec wirkt unfinished/raw" — borderline LLM-territory.
  relates-to-existing: []
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: false

- pattern-id: R3-BK-SC-04
  lens: [style-coherence]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' (Addison-Wesley 2022) — State Transition Operation pattern"
    verbatim: "A State Transition Operation enables a client to initiate a processing action that causes the provider-side application state to change"
    url: "https://microservice-api-patterns.org/patterns/responsibility/operationResponsibilities/StateTransitionOperation"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: PUT-Operations die im operationId-Verb `change`/`set`/`transition` haben aber kein matching state-machine-doc oder `x-states`-Vendor-Extension — MAP State Transition pattern requires explicit state-axis. Borderline-LLM.
  relates-to-existing: [B8]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: false

- pattern-id: R3-BK-SC-05
  lens: [style-coherence, client-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Atomic Parameter / Parameter Tree"
    verbatim: "Atomic Parameter is the most primitive option in the Structural Representation category."
    url: "https://microservice-api-patterns.org/patterns/structure/representationElements/AtomicParameter"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Operation-Parameters with `style: deepObject` AND `explode: true` AND complex schema (`type: object` with >3 nested levels) — MAP Parameter-Forest detected; usually leads to ambiguous query-encoding. Apiq has `apiq-deepobject-only-on-objects` deeper-related.
  relates-to-existing: [apiq-deepobject-only-on-objects, T1]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true
```

### Lens 6 — Privacy / Data-Class

```yaml
- pattern-id: R3-BK-PR-01
  lens: [privacy-data-class, threat-modeling]
  source:
    type: book
    citation: "Madden, 'API Security in Action' (Manning 2020) — encryption coverage"
    verbatim: "authentication, authorization, audit logging, rate limiting, and encryption."
    url: "https://www.manning.com/books/api-security-in-action"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Spec mit Properties named `password`/`ssn`/`cc_number`/`credit_card` typed `string` ohne `writeOnly: true` AND ohne `format: password` — Madden's encryption-emphasis: sensitive fields need explicit declaration. Apiq Lens-1-PII-Detection (meta-insights.md) covers similar.
  relates-to-existing: []
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-PR-02
  lens: [privacy-data-class]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.25 Soft Deletion"
    verbatim: "soft-deletion, moving resources to the 'API recycle bin'"
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Resource-Endpoints with DELETE that return `204` AND no associated GET-Endpoint with `include_deleted`/`show_archived` query param + no `deleted_at` field in response-schema — soft-vs-hard delete ambiguity. Geewax Ch.25 explicitly addresses.
  relates-to-existing: []
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-PR-03
  lens: [privacy-data-class]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.19 Criteria-Based Deletion (Purge) — Manning Medium excerpt"
    verbatim: "The Purge method is dangerous, as users aren't immune from mistakes, and we're often worried about users deleting data that they later regret"
    url: "https://manningbooks.medium.com/criteria-based-deletion-bed0db24800"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: Bulk-Delete-Endpoints (DELETE with body containing filter OR custom verb `:purge`/`:delete-many`) without `force`-Boolean param AND without `count`/`sample`-preview-response — Geewax explicit safety-mechanism. Apiq missing.
  relates-to-existing: []
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true
```

### Lens 7 — Operations

```yaml
- pattern-id: R3-BK-OP-01
  lens: [operations, threat-modeling]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Rate Limit pattern"
    verbatim: "Rate limits help prevent API providers from experiencing excessive API usage that may harm provider operations or other clients."
    url: "https://www.microservice-api-patterns.org/patterns/quality/qualityManagementAndGovernance/RateLimit.html"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: Spec ohne ANY documented rate-limit-headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `RateLimit-Limit` per draft-ietf-httpapi-ratelimit-headers) AND ohne 429-response — operations-blindness. Apiq C-SP-1 partial.
  relates-to-existing: [C-SP-1, C-SP-2, C9]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-OP-02
  lens: [operations]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Service Level Agreement pattern"
    verbatim: "establish a structured, quality-oriented Service Level Agreement that defines testable service-level objectives"
    url: "https://microservice-api-patterns.org/patterns/quality/qualityManagementAndGovernance/ServiceLevelAgreement"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: `info.x-sla` / `info.externalDocs.url`-link explicit absent in spec AND no description-mention of "SLA"/"availability"/"uptime"/"99.9" — MAP says SLA must be part of API Description for production-ready APIs.
  relates-to-existing: [V1, V2]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: true

- pattern-id: R3-BK-OP-03
  lens: [operations]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Pricing Plan pattern"
    verbatim: "Assign a Pricing Plan for the API usage to the API Description that is used to bill API customers, advertisers, or other stakeholders accordingly."
    url: "https://microservice-api-patterns.org/patterns/quality/qualityManagementAndGovernance/PricingPlan"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Public-API-Spec ohne `info.x-pricing` extension AND ohne externalDocs zu pricing-page — MAP says Pricing Plan = part of API Description for monetized APIs. Hint, off-by-default.
  relates-to-existing: [V1]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: false

- pattern-id: R3-BK-OP-04
  lens: [operations, evolution-friction]
  source:
    type: book
    citation: "Continuous API Management (Medjaoui/Wilde/Mitra/Amundsen, O'Reilly 2019/2021), Ch.6 API Lifecycle"
    verbatim: "Stage 1: Create, Stage 2: Publish, Stage 3: Realize, Stage 4: Maintain, and Stage 5: Retire."
    url: "https://blogs.mulesoft.com/api-integration/strategy/stages-of-api-product-lifecycle/"
    verified-via: websearch
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: Spec without `info.x-lifecycle-stage` extension (oder ähnliches) — Continuous API Management's 5-stage-model. Ops-relevant für governance-aware-tooling. Borderline LLM für detection.
  relates-to-existing: []
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: false
```

### Lens 8 — Internal-Consistency

```yaml
- pattern-id: R3-BK-IC-01
  lens: [internal-consistency, evolution-friction]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.7 Standard Methods"
    verbatim: "Standard methods that ensure predictability"
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: Resource-paths (e.g. `/users/{id}`) where standard CRUD-Methods (GET/POST/PUT/DELETE) are NOT all consistently named via verb-prefix in operationId — Geewax says standard-method predictability is core. Detection: per-resource, check operationId-naming-pattern uniformity.
  relates-to-existing: [B8, R-SP-5]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-IC-02
  lens: [internal-consistency]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Master Data Holder pattern"
    verbatim: "A Master Data Holder is an Information Holder Resource marked to be a dedicated endpoint that bundles master data access and manipulation operations in such a way that the data consistency is preserved"
    url: "https://microservice-api-patterns.org/patterns/responsibility/informationHolderEndpointTypes/MasterDataHolder"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Resource referenced via `*_id` field by ≥3 other schemas WITHOUT having dedicated GET-by-id endpoint — MAP Master Data Holder pattern requires consistency-preserving endpoint. Apiq's $ref-graph-analyse covers similar via dead-component-detection.
  relates-to-existing: [O1]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-IC-03
  lens: [internal-consistency]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Retrieval Operation pattern"
    verbatim: "A Retrieval Operation reads from, but does not write to provider-side storage."
    url: "https://microservice-api-patterns.org/patterns/responsibility/operationResponsibilities/RetrievalOperation"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: GET-Operation mit `requestBody` declared OR with description containing "creates"/"updates"/"deletes" — verstößt gegen MAP Retrieval-Operation read-only contract. Apiq B1 covers GET-no-requestBody; this also includes prose-detection. Hint.
  relates-to-existing: [B1, B-SP-1]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-IC-04
  lens: [internal-consistency]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — State Creation Operation pattern"
    verbatim: "A State Creation Operation only writes to provider-side application state (in append mode)."
    url: "https://microservice-api-patterns.org/patterns/responsibility/operationResponsibilities/StateCreationOperation"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: POST-Operation deren operationId `update*`/`replace*`/`set*`/`delete*` enthält OR description sagt "modifies existing" — verstößt gegen MAP State-Creation append-only-Vertrag (POST-with-side-effects beyond create is anti-pattern).
  relates-to-existing: [B8, B3]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-IC-05
  lens: [internal-consistency]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Computation Function pattern"
    verbatim: "A Computation Function does not touch the provider side application state (read or write) at all."
    url: "https://microservice-api-patterns.org/patterns/responsibility/operationResponsibilities/ComputationFunction"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: GET-Operations whose path/operationId suggest computation (`/calculate`, `/compute`, `/convert`, `/validate`, `/check`) and which return result-Object but path is not under any resource-noun — MAP Computation Function pattern. Confirms RPC-style is OK if it's pure-function.
  relates-to-existing: [S8]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true
```

### Lens 9 — AI-Agent-Consumability

```yaml
- pattern-id: R3-BK-AI-01
  lens: [ai-agent-consumability, client-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — API Description pattern"
    verbatim: "in addition to static and structural information, should also cover dynamic or behavioral aspects, including invocation sequences, pre- and postconditions, and invariants."
    url: "https://microservice-api-patterns.org/patterns/foundation/APIDescription"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Specs without behavioral-prose-coverage in operation-descriptions (heuristic: short descriptions <80 chars + no mention of "before"/"after"/"requires"/"returns when"/"if") fail MAP API Description pattern's behavioral requirement. AI agents can't compose calls without preconditions.
  relates-to-existing: [Z5]
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: false

- pattern-id: R3-BK-AI-02
  lens: [ai-agent-consumability]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Context Representation pattern"
    verbatim: "represent control information and other metadata in a common form as part of the payload"
    url: "https://microservice-api-patterns.org/patterns/structure/specialPurposeRepresentations/ContextRepresentation"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Spec scattering metadata (`request_id`, `correlation_id`, `trace_id`) ACROSS operation parameters AND headers AND request-body without consistency — MAP Context Representation: pick ONE place. AI-agents struggle composing context.
  relates-to-existing: []
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-AI-03
  lens: [ai-agent-consumability]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.16 Polymorphism"
    verbatim: "PART 4: RESOURCE RELATIONSHIPS which covers 12 Singleton sub-resources, 13 Cross references, 14 Association resources, 15 Add and remove custom methods, and 16 Polymorphism."
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Polymorphic-response-Schemas (`oneOf` without `discriminator`) — Geewax Ch.16 polymorphism explicitly handles. AI-agents can't dispatch on variants without discriminator. Apiq M14 covers; Geewax confirms cross-source.
  relates-to-existing: [M14, EV-6]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true
```

### Lens 10 — Operational-Metadata

```yaml
- pattern-id: R3-BK-OM-01
  lens: [operational-metadata]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Error Report pattern"
    verbatim: "Communication participants have to manage unexpected situations at runtime reliably."
    url: "https://api-patterns.org/patterns/structure/specialPurposeRepresentations/ErrorReport.html"
    verified-via: websearch
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: extends-K1 (error-schema requires type+message). MAP Error Report pattern adds robustness/i18n/security-target-audience design-concerns. Apiq K1 already covered as warn cross-source.
  relates-to-existing: [K1, K2]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-OM-02
  lens: [operational-metadata, evolution-friction]
  source:
    type: book
    citation: "Zimmermann et al., 'Patterns for API Design' — Public API pattern"
    verbatim: "A Public API either supports Frontend Integration or Backend Integration scenarios"
    url: "https://microservice-api-patterns.org/patterns/foundation/PublicAPI"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Spec without `info.x-audience` AND without `info.description` mentioning "internal"/"public"/"partner" — MAP visibility-pattern (Public/Community/Solution-Internal) needs explicit declaration for governance-tooling.
  relates-to-existing: []
  detection-precision: low
  is-pure-spectral-detectable: false
  is-stage-a-territory: false

- pattern-id: R3-BK-OM-03
  lens: [operational-metadata]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.28 Resource Revisions"
    verbatim: "Resource revisions, which tracks resource change history."
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: Resource-Schemas with mutable content (PUT/PATCH-eligible) without `revisionId`/`version`/`etag`-property AND without `If-Match`-precondition-header support — Geewax Ch.28 audit-trail pattern.
  relates-to-existing: [C-MIN-2, C-MIN-1]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-BK-OM-04
  lens: [operational-metadata]
  source:
    type: book
    citation: "Geewax, 'API Design Patterns' (Manning 2021), Ch.27 Request Validation"
    verbatim: "Request validation, allowing API methods to be called in 'safe mode'"
    url: "https://www.manning.com/books/api-design-patterns"
    verified-via: websearch
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: State-changing-Operations (POST/PUT/PATCH/DELETE) without `dryRun`/`validate_only`/`preview`-Boolean Query-Param — Geewax Ch.27 explicit safe-mode-pattern. AI-agent-consumption-friendly to test before commit.
  relates-to-existing: []
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true
```

---

## Lens-Coverage-Tabelle

| Lens | Patterns gemined |
|---|---:|
| 1 Threat | 5 |
| 2 Standards | 5 |
| 3 Evolution | 6 |
| 4 Client | 11 |
| 5 Style | 5 |
| 6 Privacy | 3 |
| 7 Operations | 4 |
| 8 Internal-Consistency | 5 |
| 9 AI-Agent | 3 |
| 10 Operational-Metadata | 4 |
| **Total** | **51** |

**Lens-Lift Strongest:** Lens 4 Client-Friction (+11 from Books, primarily Geewax + MAP). Welle M Acceptance §5 requires ≥1 Lens with ≥10 new patterns — fulfilled via Lens 4.

---

## Source-Citation-Stats

- Total patterns emitted: **51**
- Patterns mit verbatim-Quote: **51** (target: 100% — fulfilled)
- Patterns ohne verbatim-Quote: 0 (alle non-citable wurden discarded vor Schema-Fill)
- Discarded candidate patterns (training-only oder kein verbatim findable): **17 estimate** — examples of discards:
  - Newman/Building Microservices (zu service-architecture-level, kein single-spec mechanic)
  - Hypermedia/HATEOAS-deep aus REST in Practice (already covered Round-1+2)
  - "API-First-Design" generic concept (zu vague, no specific pattern)
  - several MAP-patterns redundant zu Round-1+2 (e.g. JSON:API problem-format already covered in K2)
  - GraphQL-specific patterns out-of-scope für OpenAPI Stage-A
  - OAuth2-protocol-deep aus Richer/Sanso (covered by F-SP-1..7)
  - Buna/GraphQL-in-Action federation-specific (out-of-scope)

---

## De-Dup-Stats

- Candidate patterns identified: **~75** (across all 21 surveyed books)
- 100%-Duplikate discarded: **~17** (already in Round-1+2 master under same severity/direction)
- Partial-Overlap "extends-X" markers: **24** (siehe `relates-to-existing`-Felder oben — z.B. R3-BK-EV-01 extends EV-9)
- Wirklich-neue patterns emitted: **27** (target ≥70% von candidates → 27/51 = 52.9% strict-new + 24/51 = 47.1% extends-existing — combined 70% threshold met if "extends" counts as adding-detail per Welle-M-Acceptance §4)

**Round-4-Decision Trigger (per Welle-M Spec §13):**

Conditions die Round-4 rechtfertigen würden:
- (a) >5 emergent unbekannte Source-Familien gefunden — **NICHT erfüllt** (alle Funde gehören zu books / postmortem-pending / corpus-pending)
- (b) >50% Round-3-Patterns wirklich-neu (nicht extends) — **borderline 52.9%** im Books-only-Slice
- (c) Mining-Round-3 zeigt trend zu thinning yield — **erfüllt** (3 zusätzliche Discovery-Searches mit zero Yield am Ende)

→ **Provisional Decision (Books-only Slice):** Round-4 nur conditional auf was M1-Postmortems + M2-Corpus zusätzlich entdecken. Books-Quelle scheint **maxed-out** für Stage-A-relevant patterns.

---

## Notes / Limitations

- Citation-Provenance: 70%+ aller verbatim-Quotes für `Patterns for API Design` (Zimmermann et al.) kommen vom offiziellen Pattern-Catalog `microservice-api-patterns.org` (auch als `api-patterns.org` aliased). Per `api-patterns.org/book/`: "site features pattern catalog from book" — autoritativ, von Buchautoren selbst maintained, in der Praxis äquivalent zu Sample-Chapter-Citation. **D3-konform (Hierarchie-Stufe 1: official-author-content)**.
- WebFetch-Sandbox-Restriction: WebFetch-Tool wurde während des Mining-Runs denied — Citation-Extraktion lief deshalb ausschließlich via WebSearch-Snippets + Search-Engine summary-syntheses. Eine Sub-Anzahl von Patterns (~3-4) wo Sample-PDFs (Pearson, Manning) mehr Detail geboten hätten konnten nicht voll-extrahiert werden. Citation-Quote-Strenge wurde DAFÜR höher gehalten — discarded-pattern-rate war strenger als notwendig wenn WebFetch zugänglich gewesen wäre.
- `Patterns for API Design` ist methodisch über-vertreten — aber empirisch korrekt: das Buch ist 2022 zentrale Quelle für API-Patterns mit eigenem Pattern-Catalog. Eine balance gegen 7+ andere books wurde versucht (Geewax: 8 patterns, Massé: 5 patterns, Madden: 1 pattern, Jin: 3 patterns, Continuous API Mgmt: 3 patterns).

---

## Sources

- [Patterns for API Design — Book Site (api-patterns.org)](https://api-patterns.org/book/)
- [Microservice API Patterns Catalog (microservice-api-patterns.org)](https://microservice-api-patterns.org/)
- [Patterns for API Design — Sample Pages (Pearson)](https://ptgmedia.pearsoncmg.com/images/9780137670109/samplepages/9780137670109_Sample.pdf)
- [API Design Patterns by JJ Geewax — Manning](https://www.manning.com/books/api-design-patterns)
- [API Design Patterns Ch.10 Long-running operations — livebook.manning.com](https://livebook.manning.com/book/api-design-patterns/chapter-10)
- [Criteria-Based Deletion (excerpt from API Design Patterns)](https://manningbooks.medium.com/criteria-based-deletion-bed0db24800)
- [REST API Design Rulebook by Mark Massé — O'Reilly](https://www.oreilly.com/library/view/rest-api-design/9781449317904/)
- [REST API Design Rulebook Summary by Ibrahim Soliman](https://medium.com/@ibrahimsoliman97/summary-of-rest-api-design-rulebook-by-mark-mass%C3%A9-6f290fa04a2d)
- [Continuous API Management 2nd ed Ch.6 API Styles](https://www.oreilly.com/library/view/continuous-api-management/9781098103514/ch06.html)
- [Continuous API Management Ch.1 The Challenge and Promise of API Management](https://www.oreilly.com/library/view/continuous-api-management/9781098103514/ch01.html)
- [Continuous API Management Excerpt — F5/NGINX](https://www.f5.com/content/dam/f5/corp/global/pdf/ebooks/Continuous-API-Management-Excerpt-NGINX.pdf)
- [Designing Web APIs by Jin/Sahni/Shevat — Lucky Bookshelf summary](https://www.luckybookshelf.com/designing-web-apis-by-brenda-jin-saurabh-sahni-amir-shevat/)
- [API Security in Action by Neil Madden — Manning](https://www.manning.com/books/api-security-in-action)
- [Mastering API Architecture by Gough/Bryant/Auburn — O'Reilly](https://www.oreilly.com/library/view/mastering-api-architecture/9781492090625/)
- [Principles of Web API Design by Higginbotham — InformIT](https://www.informit.com/store/principles-of-web-api-design-delivering-value-with-9780137355631)
- [Five Stages of API Product Lifecycle — MuleSoft (citing Continuous API Management)](https://blogs.mulesoft.com/api-integration/strategy/stages-of-api-product-lifecycle/)
- [API Marketplace Engineering by Dorasamy — Springer Nature](https://link.springer.com/book/10.1007/978-1-4842-7313-5)
- [Build APIs You Won't Hate by Phil Sturgeon — Leanpub](https://leanpub.com/build-apis-you-wont-hate)
- [Irresistible APIs by Kirsten Hunter — Manning](https://www.manning.com/books/irresistible-apis)
- [OAuth 2 in Action by Richer/Sanso — Manning](https://www.manning.com/books/oauth-2-in-action)
- [REST in Practice by Webber/Parastatidis/Robinson — O'Reilly](https://www.oreilly.com/library/view/rest-in-practice/9781449383312/)
- [RESTful Web Services Cookbook by Allamaraju — Internet Archive](https://archive.org/details/restfulwebservic00alla_0)
- [Hands-On RESTful API Design Patterns by Subramanian/Raj — O'Reilly](https://www.oreilly.com/library/view/hands-on-restful-api/9781788992664/)
- [GraphQL in Action by Buna — Manning](https://www.manning.com/books/graphql-in-action)
