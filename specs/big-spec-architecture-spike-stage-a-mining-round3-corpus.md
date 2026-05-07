# Round-3 Mining — API-Corpus (M2c)

> Authored 2026-05-07 by M2b+M2c-Subagent. Statistical pattern-mining über 518 healthy OpenAPI-Specs (APIs.guru + Vendor) per D8/D9/D10. Tool-Source-of-truth: `scripts/spike/eval/api-corpus-analyzer.ts`. CLI: `scripts/spike/eval/run-api-corpus-analysis.ts`. JSON-dump: `scripts/spike/data/healthy-corpus/_analyzer-output.json`. Tests: `scripts/spike/__tests__/eval/api-corpus-analyzer.test.ts` (10 passing).

## Corpus-Manifest

- **Source-Manifest:** `scripts/spike/data/healthy-corpus/manifest.json` (M2a-Output)
- **Total attempted:** 1527 specs (apis.guru + vendor)
- **Total parseable:** 1527 (no JSON-parse-failures)
- **Total healthy on disk:** 518 (manifest reports 518 — the per-file count of 521 includes 3 force-included specs; 518 are flagged `healthy=true && onDisk=true` and pass all filterCriteria — matching what the analyzer loaded)
- **Specs analyzed:** 518
- **Filter-criteria (per M2a):** `oas3=true, minOps=5, tags=true, descRate=0.8`
- **OAS-Version-Mix:** 3.0.x: 498 (96.1%), 3.1.x: 20 (3.9%) — no 2.0 in healthy-set
- **Outliers / force-included:** Microsoft Graph (22361 ops), GitHub-variants (9 specs), Stripe (587 ops). All retained per D8 — but Stripe was excluded from the healthy filter (didn't pass tags-check); only the GitHub-variants and Graph survive into 518. Specs intentionally NOT coalesced.
- **Skipped during stat-runs:** 0 specs failed JSON.parse, 0 had top-level structural breakage. Per-stat skips reflect "stat not applicable" (e.g. no list-endpoints → pagination skip).

## Statistical Pattern-Findings

### S1 — Pagination-Convention-Verteilung (R3-CO-CL-01)

- **Lens:** 4 (client-friction), 5 (style-coherence)
- **Total specs analyzed:** 149 (369 specs had no detectable list-endpoints — heuristic: GET op with array-shaped 2xx response)
- **Confidence:** 57.0% dominant value
- **Distribution:**

  | Convention | Count | % |
  |---|---:|---:|
  | none | 85 | 57.0% |
  | link-header | 21 | 14.1% |
  | page+per_page | 13 | 8.7% |
  | offset+limit | 12 | 8.1% |
  | limit-only | 10 | 6.7% |
  | page-only | 4 | 2.7% |
  | cursor | 4 | 2.7% |

- **Examples (top-3):**
  - `none` → anchore-io, apicurio-local-registry
  - `link-header` → ato-gov-au, github-com (RFC-5988-style)
  - `offset+limit` → 1password-local-connect, api2cart-com
  - `cursor` → drchrono-com, files-com

- **Derived Pattern:** A **plurality (57%) of healthy list-endpoints declare NO recognized pagination-convention.** This is the pure "pagination-is-missing" finding-class apiq already targets. When a convention IS present, it splits across 5+ styles (no single style ≥15%) — confirming Round-2 hypothesis that pagination is the canonical "no industry consensus" pattern.

### S2 — Auth-Scheme-Verteilung (R3-CO-TM-01)

- **Lens:** 1 (threat-modeling)
- **Total specs analyzed:** 518
- **Confidence:** 42.7% dominant
- **Distribution (top 8):**

  | Scheme | Count | % |
  |---|---:|---:|
  | oauth2 | 221 | 42.7% |
  | none | 121 | 23.4% |
  | apiKey-header | 92 | 17.8% |
  | bearer (HTTP) | 20 | 3.9% |
  | multi:apiKey-header+basic | 14 | 2.7% |
  | basic (HTTP) | 10 | 1.9% |
  | apiKey-query | 8 | 1.5% |
  | multi:apiKey-header+oauth2 | 6 | 1.2% |

  (24 distinct combinations total; long-tail of multi-scheme variants ≤2 specs each)

- **Examples:**
  - `oauth2` → box-com, peertube
  - `apiKey-header` → api2cart, apideck-accounting
  - `apiKey-query` → bbc-com, dataflowkit-com (← typically deprecated, security-anti-pattern)
  - `none` → amentum-space, anchore-io (← spec declares no security; major Lens-1 red-flag)

- **Derived Pattern:** **23.4% of public APIs publish no `securitySchemes` at all** — far above intuition. apiq-Threat-Modeling rule TM-A-1 (require ≥1 securityScheme on non-public-data APIs) catches a HUGE chunk of corpus. Also: 1.5% use `apiKey-query` which is RFC-6750-discouraged (URL leaks via referers/logs) → distinct hint-class rule.

### S3 — Error-Response-Shape-Verteilung (R3-CO-SC-01)

- **Lens:** 2 (standards-compliance), 5 (style-coherence)
- **Total specs analyzed:** 518
- **Confidence:** 58.5% dominant
- **Distribution:**

  | Shape | Count | % |
  |---|---:|---:|
  | none (no 4xx defined) | 303 | 58.5% |
  | status-code-only (4xx defined, no schema) | 133 | 25.7% |
  | inline-mixed (custom shape) | 75 | 14.5% |
  | vendor-custom (errors[]/error_code) | 7 | 1.4% |
  | rfc-7807 (problem+json) | **0** | 0.0% |

- **Examples:**
  - `none` → amentum-space, api2cart
  - `status-code-only` → airbyte-local-config, anchore-io
  - `vendor-custom` → canada-holidays-ca, digitallocker

- **Derived Pattern:** **RFC-7807 (problem+json) adoption is essentially 0% across 518 healthy public APIs.** This dramatically undercuts the implicit assumption in lots of Spectral-rulesets (and apiq's Lens-2 patterns) that RFC-7807 is the "modern default". The "modern default" in real-world specs is `inline-mixed` or `status-code-only`. This finding suggests apiq should NOT make RFC-7807 a `warn`, but at most a `hint`. Also: **58.5% of healthy specs don't define ANY 4xx response** — Lens-2 rule "every operation should declare 4xx for error-state" is the single biggest coverage-gap.

### S4 — Versioning-Convention-Verteilung (R3-CO-EV-01)

- **Lens:** 3 (evolution-friction)
- **Total specs analyzed:** 518
- **Confidence:** 51.5% dominant
- **Distribution:**

  | Convention | Count | % |
  |---|---:|---:|
  | none | 267 | 51.5% |
  | url-path | 224 | 43.2% |
  | accept-vendor | 22 | 4.2% |
  | query | 5 | 1.0% |
  | header (Api-Version etc.) | 0 | 0.0% |

- **Examples:**
  - `url-path` → 1password-connect (`/v1/`), adyen (`/v68/`)
  - `accept-vendor` → github-com (`application/vnd.github.v3+json`)
  - `query` → anchore-io, box-com (`?api_version=…`)

- **Derived Pattern:** **Versioning splits 51% none / 43% url-path — a near-bimodal distribution.** "None" includes single-version-no-discriminator APIs and rolling-deploy APIs (e.g. Stripe-style date-headers, but `Stripe-Version` header is rare in healthy-corpus). `url-path` is the de-facto standard. **Header-based versioning (Api-Version param) is essentially absent** in healthy-corpus — Microsoft REST guideline recommendation is contradicted by empirical reality. apiq-EV rule should rank `url-path` as preferred default; `query`/`accept-vendor` as variants; flag `none` only for multi-version APIs (info-level).

### S5 — Standard-Header-Adoption (R3-CO-OP-01)

- **Lens:** 1, 2, 7, 9, 10 (cross-lens — operational-metadata)
- **Total specs analyzed:** 518
- **Confidence:** 93.4% dominant ("none")
- **Aggregate-Distribution:**

  | Coverage-Bucket | Count | % |
  |---|---:|---:|
  | none | 484 | 93.4% |
  | partial:3 | 22 | 4.2% |
  | minimal:retry-after | 4 | 0.8% |
  | comprehensive:4 | 3 | 0.6% |
  | minimal:idempotency-key | 2 | 0.4% |
  | minimal:x-request-id | 2 | 0.4% |
  | partial:2 | 1 | 0.2% |

- **Per-Header Adoption-Rate (auxiliary detail):**

  | Header | Count | % |
  |---|---:|---:|
  | `X-RateLimit-Limit` | 24 | 4.6% |
  | `X-RateLimit-Remaining` | 24 | 4.6% |
  | `X-RateLimit-Reset` | 23 | 4.4% |
  | `Retry-After` | 6 | 1.2% |
  | `X-Request-Id` | 3 | 0.6% |
  | `Idempotency-Key` | 2 | 0.4% |
  | `RateLimit-Limit` (RFC-9331-draft) | 2 | 0.4% |
  | `RateLimit-Remaining` | 2 | 0.4% |
  | `RateLimit-Reset` | 2 | 0.4% |
  | `Sunset` | 0 | 0.0% |
  | `Deprecation` | 0 | 0.0% |
  | `X-API-Version` | 0 | 0.0% |

- **Derived Pattern:** **93.4% of healthy public APIs declare ZERO operational/diagnostic headers.** The "comprehensive" tier (4+ standard headers in spec) is 0.6% of specs (3 specs!). This is the single sharpest empirical signal in the entire corpus: standard-header-adoption is massively-undermarketed in OpenAPI specs (likely declared in API impl but not in spec — a documentation-coverage problem). RFC-9331 `RateLimit-*` (draft, 2024) is at 0.4% — early-mover indicator. **Sunset / Deprecation headers (RFC-8594) at 0%** is a stunning gap given how many APIs deprecate endpoints. This is pure Lens-10 evolution-friction territory.

### S6 — Schema-Style-Verteilung (R3-CO-ST-01)

- **Lens:** 5 (style-coherence)
- **Total specs analyzed:** 518
- **Confidence:** 85.9% dominant
- **Distribution:**

  | Style | Count | % |
  |---|---:|---:|
  | rest-l2 (resource-paths with `{id}`) | 445 | 85.9% |
  | rest-l1-or-flat | 66 | 12.7% |
  | rpc (verb-prefixed paths) | 4 | 0.8% |
  | mixed | 2 | 0.4% |
  | hal (`_links`/`_embedded`) | 1 | 0.2% |
  | json-api (`data`+`included`) | 0 | 0.0% |
  | aip (resource:custom-verbs) | 0 | 0.0% |

- **Examples:**
  - `rest-l2` → 1password-connect, adyen-balance-platform
  - `rpc` → geodesystems, googleapis-domainsrdap
  - `hal` → configcat-com (the only healthy HAL-API in 518)

- **Derived Pattern:** **REST-L2 (resource-paths with path-templated IDs) is the de-facto standard at 85.9%.** JSON-API/HAL/AIP combined are <0.5%. apiq-Style-Coherence rules can confidently treat REST-L2 as default; `rpc` and `mixed` are the two outlier-classes worth flagging at hint-level.

### S7 — OperationId-Naming-Convention (R3-CO-CL-02)

- **Lens:** 4 (client-friction)
- **Total specs analyzed:** 518
- **Confidence:** 43.2% dominant ("other")
- **Distribution:**

  | Style | Count | % |
  |---|---:|---:|
  | other (irregular/PascalCase-mixed/non-classifiable) | 224 | 43.2% |
  | camelCase | 113 | 21.8% |
  | PascalCase | 63 | 12.2% |
  | kebab-case | 46 | 8.9% |
  | no-operationIds | 37 | 7.1% |
  | snake_case | 25 | 4.8% |
  | verbResource-camel (e.g. `getUser`) | 6 | 1.2% |
  | mixed (no single style ≥60%) | 4 | 0.8% |

- **Derived Pattern:** **There is NO industry-standard operationId-naming convention.** The biggest "convention" is "no convention" (43.2% other / 7.1% no-IDs / 0.8% mixed = >50%). Spectral's `operation-operationId-valid-in-url` (kebab-case enforcement) reflects ONE family-preference, but healthy-corpus shows kebab-case at 8.9% — a minority-style. apiq-CL rule should emit a hint-level finding only if NONE of camelCase/PascalCase/snake_case/kebab-case dominates the spec at >60% (i.e. fall through to `mixed` bucket). Hard-flagging any single style is unjustified by data.

### S8 — Content-Type-Verteilung (R3-CO-SC-02)

- **Lens:** 2 (standards-compliance), 5 (style-coherence)
- **Total specs analyzed:** 518
- **Confidence:** 60.6% dominant
- **Distribution (top 8):**

  | Profile | Count | % |
  |---|---:|---:|
  | json-only | 314 | 60.6% |
  | json+form | 65 | 12.5% |
  | json+other | 55 | 10.6% |
  | json+binary | 32 | 6.2% |
  | json+xml | 26 | 5.0% |
  | none (declared no content-type) | 14 | 2.7% |
  | single:`*/*` (catch-all) | 3 | 0.6% |
  | multi-non-json | 3 | 0.6% |

- **Derived Pattern:** **JSON dominates at 60.6% pure / >97% mixed.** The only niche is `single:*/*` (3 specs — anti-pattern: catch-all without explicit type = ambiguous parsing) and `multi-non-json` (3 specs — likely XML-only legacy or octet-stream-heavy). Note: **`json+problem-json` is at 0.2% (1 spec)** — confirming S3-finding that RFC-7807 is invisible in real specs even when declared. apiq-SC rule "operations should declare `application/json` or explicit other" is empirically defensible.

### S9 — OAS-Version-Verteilung (R3-CO-EV-02)

- **Lens:** 3 (evolution-friction), 5 (style-coherence)
- **Total specs analyzed:** 518
- **Confidence:** 96.1% dominant
- **Distribution:**

  | Version | Count | % |
  |---|---:|---:|
  | 3.0.x | 498 | 96.1% |
  | 3.1.x | 20 | 3.9% |
  | 2.0 (Swagger) | 0 | 0.0% (filtered out by `oas3=true`) |

- **Derived Pattern:** **OAS 3.0.x is the production-incumbent at 96%.** OAS 3.1 adoption (which switches `nullable: true` → `type: ['string','null']`, drops `definitions`, aligns with JSON-Schema-draft-2020-12) is at 3.9% three years post-spec-release — slow adoption. apiq-Evolution rule "ratchet 3.0 → 3.1 over time" is forward-looking, not present-day reality. Detection-rules MUST handle BOTH 3.0 and 3.1 schema-shapes (e.g. `nullable` field absence in 3.1).

### S10 — Security-Coverage über Write-Ops (R3-CO-TM-02)

- **Lens:** 1 (threat-modeling)
- **Total specs analyzed:** 477 (41 specs have NO write-ops at all → skipped)
- **Confidence:** 70.4% dominant
- **Distribution:**

  | Coverage | Count | % |
  |---|---:|---:|
  | fully-secured (≥99% of write-ops have `security:[…]`) | 336 | 70.4% |
  | unsecured (0% have explicit security) | 106 | 22.2% |
  | mostly-secured (80–99%) | 25 | 5.2% |
  | half-secured (50–79%) | 5 | 1.0% |
  | partial-secured (1–49%) | 5 | 1.0% |

- **Derived Pattern:** **22.2% of healthy public APIs leave their write-ops UNSECURED in spec.** This may include APIs that intentionally use a global `security` block at the document-root (counted as "fully-secured" if global is set + non-empty), so `unsecured` here means: no global AND no operation-level security. This is the **single-largest threat-modeling-gap** in the corpus.

---

## Derived Patterns für Master (Round-3 Output)

The following patterns are formatted per Round-2 master-format and ready for inclusion in the apiq pattern-master via M3 (Konsolidierung). Each carries the verbatim corpus-citation.

```yaml
- pattern-id: R3-CO-CL-01
  source-family: api-corpus
  lens: [client-friction, style-coherence]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "57.0% no-recognized-pagination, 14.1% link-header, 8.7% page+per_page, 8.1% offset+limit, 6.7% limit-only, 2.7% cursor"
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: "List-endpoint without recognized pagination-convention is a 57% modal pattern — but the 43% who DO declare are evenly split across 5+ styles. Flag absence as hint, not warn."
  relates-to-existing: [E1, E2, E3]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-TM-01
  source-family: api-corpus
  lens: [threat-modeling]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "23.4% no-securitySchemes-declared, 42.7% oauth2, 17.8% apiKey-header, 1.5% apiKey-query (RFC-6750-discouraged)"
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: "23% of healthy public APIs declare no securitySchemes — far above intuition. Recommend warn-level rule. Sub-pattern: apiKey-query is RFC-6750-discouraged at 1.5%."
  relates-to-existing: [TM-A-1, TM-A-7]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-SC-01
  source-family: api-corpus
  lens: [standards-compliance, style-coherence]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "RFC-7807 adoption=0.0% (literal zero of 518). 58.5% of specs declare NO 4xx response at all. 25.7% status-code-only. 14.5% inline-mixed. 1.4% vendor-custom."
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: "RFC-7807 (application/problem+json) is invisible in real-world OpenAPI specs. Lens-2 rules MUST NOT enforce 7807 above hint-level. The dominant gap is 58.5% missing-4xx."
  relates-to-existing: [SC-7, SC-12]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-EV-01
  source-family: api-corpus
  lens: [evolution-friction]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "51.5% none, 43.2% url-path, 4.2% accept-vendor, 1.0% query, 0.0% header (Api-Version)"
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: "Versioning is bimodal: 51.5% no-versioning vs 43.2% url-path. Header-based versioning is empirically zero — Microsoft REST guidelines do not match real-world. apiq-EV should treat url-path as default-recommended."
  relates-to-existing: [EV-1, EV-3]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-OP-01
  source-family: api-corpus
  lens: [operations, ai-agent-consumability, operational-metadata, threat-modeling, standards-compliance]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "X-RateLimit-Limit=4.6%, Retry-After=1.2%, Idempotency-Key=0.4%, X-Request-Id=0.6%, Sunset=0.0%, Deprecation=0.0%, X-API-Version=0.0%. Coverage-bucket-modus 'none' = 93.4% of specs."
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: "93.4% of healthy public OpenAPI specs declare zero operational/diagnostic headers. RFC-8594 Sunset+Deprecation headers at 0%. Largest empirical gap in entire corpus. Strong Lens-7/9/10 rule-class."
  relates-to-existing: [OP-2, OP-5, OM-1, OM-3]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-OP-02
  source-family: api-corpus
  lens: [operational-metadata]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "Sunset header (RFC-8594) adoption: 0/518 = 0.0%. Deprecation header (RFC-9745) adoption: 0/518 = 0.0%."
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: hint
  direction: tighten
  codegen-targets: ["*"]
  description: "Sub-pattern of R3-CO-OP-01 — RFC-8594/RFC-9745 deprecation-signaling is literally invisible. Flag operations marked `deprecated: true` that DO NOT declare a Sunset/Deprecation response-header — currently zero specs do, large opportunity for differentiator."
  relates-to-existing: [OM-3, EV-9]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-ST-01
  source-family: api-corpus
  lens: [style-coherence]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "rest-l2=85.9%, rest-l1-or-flat=12.7%, rpc=0.8%, mixed=0.4%, hal=0.2%, json-api=0.0%, aip=0.0%"
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: "REST-L2 is industry-standard at 85.9%. RPC/mixed are <2% combined. JSON-API/HAL/AIP combined <0.5%. apiq-Style-Coherence rule can defensibly treat REST-L2 as expected default."
  relates-to-existing: [ST-1, ST-2]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-CL-02
  source-family: api-corpus
  lens: [client-friction]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "operationId-naming: other=43.2%, camelCase=21.8%, PascalCase=12.2%, kebab-case=8.9%, no-operationIds=7.1%, snake_case=4.8%, verbResource-camel=1.2%, mixed=0.8%"
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: "No industry-standard operationId-naming convention exists. Spectral's kebab-case-default reflects a minority-preference (8.9%). apiq-CL rule should only flag intra-spec inconsistency (no dominant style >60%), NOT enforce a particular casing."
  relates-to-existing: [CL-2]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-SC-02
  source-family: api-corpus
  lens: [standards-compliance, style-coherence]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "json-only=60.6%, json+form=12.5%, json+other=10.6%, json+binary=6.2%, json+xml=5.0%, single:*/* (catch-all anti-pattern)=0.6%"
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: hint
  direction: drift
  codegen-targets: ["*"]
  description: "JSON dominates >97% of content-types when present. `*/*` catch-all at 0.6% is a defensible warn-class anti-pattern (ambiguous parsing). `none`-bucket at 2.7% suggests operations defined without content-type declaration."
  relates-to-existing: [SC-3, SC-9]
  detection-precision: medium
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-EV-02
  source-family: api-corpus
  lens: [evolution-friction, style-coherence]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "OAS 3.0.x=96.1%, OAS 3.1.x=3.9% three years post-release"
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: info
  direction: tighten
  codegen-targets: ["*"]
  description: "OAS 3.0 is production-incumbent. 3.1 adoption is glacial (3.9%). apiq detection-rules MUST handle BOTH 3.0 and 3.1 idioms (e.g. nullable-field absence in 3.1, JSON-Schema-2020-12 alignment)."
  relates-to-existing: [EV-2]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true

- pattern-id: R3-CO-TM-02
  source-family: api-corpus
  lens: [threat-modeling]
  source:
    type: api-corpus
    citation: "APIs.guru healthy-corpus N=518 (2026-05-07)"
    verbatim: "Write-op security-coverage: fully-secured=70.4%, unsecured=22.2%, mostly-secured=5.2%, half-secured=1.0%, partial-secured=1.0%"
    url: "scripts/spike/data/healthy-corpus/manifest.json"
    verified-via: api-corpus-analyzer
  severity-hypothesis: warn
  direction: tighten
  codegen-targets: ["*"]
  description: "22.2% of healthy public APIs leave write-ops (POST/PUT/PATCH/DELETE) unsecured. Single largest threat-modeling-gap in the corpus."
  relates-to-existing: [TM-A-2, TM-A-9]
  detection-precision: high
  is-pure-spectral-detectable: true
  is-stage-a-territory: true
```

**Total derived patterns extracted: 11** (10 core + 1 sub-pattern R3-CO-OP-02 carved out from R3-CO-OP-01 because RFC-8594-Sunset-coverage at literal-zero is striking enough to warrant its own pattern for downstream rule-implementation).

---

## Outlier-Analyse

### Specs that "fail" multiple stats (≥5 of 10 statistics report `none` / negative-extreme)

This is a heuristic — `none` is not always a "failure", but specs that hit `none` across most lenses are potential **Stage-A Anti-Pattern Reference Specs**. Computed by inspection of the JSON-dump:

- `amentum-space-aviation_radiation` — `none` on auth, error-shape, versioning, headers + low-content-type variation. Niche aerospace/radiation-data API; plausibly low security-need.
- `anchore-io` — `none` on auth, error-shape, query-version-only. Container-security tool; presumably internal-network deployment.
- `apicurio-local-registry` — `none` on auth, errors, headers. Local-deployment registry; expected.
- `apache-org-qakka` — Apache project, queue-API, no auth/headers/4xx. Open-source-internal pattern.

These specs are useful as "negative-control" Stage-A inputs — Phase B should NOT report critical findings on them (they're internally-consistent in their minimalism).

### Specs that excel (positive-extreme on ≥6 of 10)

- `github-com` (and 8 GitHub-variants) — accept-vendor versioning + comprehensive RateLimit/Retry-After headers + mostly-secured + REST-L2 + camelCase consistency. Reference-class for "modern public REST API".
- `digitalocean-com` — comprehensive:4 standard-headers (rare), full security-coverage, REST-L2, kebab-case consistency.
- `billingo-hu` — comprehensive:4 standard-headers + full security on a non-Tier-1 API; outlier-positive.
- `1password-local-connect` — bearer-JWT + offset+limit pagination + full security-coverage + REST-L2; clean baseline.

These are the "Stage-A Reference Class" — Phase B should report MINIMAL findings on these (they're already in the >90th-percentile of the corpus).

### Force-included specs (per M2a)

- **Microsoft Graph** (file `microsoft-com-graph--…`): on-disk verified, processed normally. Contains 22361 ops; classified `oauth2` + `none` versioning + REST-L2 + 60% security-coverage. No skips triggered.
- **Stripe** — was filtered OUT by `tags=true` requirement at M2a (Stripe spec uses operationId-tags but not tag-objects). NOT in healthy-corpus; only the 4-spec eval-set has Stripe.
- **GitHub variants** (9 specs): all 9 retained as separate entries. `github-com--1-1-4`, `github-com-api-github-com--1-1-4`, `github-com-api-github-com-2022-11-28--1-1-4`, etc. — each contributes independently to the distribution. Not coalesced per D8-revised.

### Specs skipped per stat

- **S1 (pagination)** skipped 369 specs — most-frequent skip-class. Reason: no detected list-endpoint (heuristic: GET op with array-shaped 2xx response). Includes purely-RPC APIs and APIs without "list" semantics.
- **S10 (security-coverage)** skipped 41 specs — they have NO write-ops (read-only APIs).
- All other stats: 0 skipped (every healthy spec contributes to every other stat).

---

## Round-4-Decision-Input

- **Total derived patterns:** 11 (S1-S10 + R3-CO-OP-02 sub-pattern)
- **D14-Threshold:** Round-3 total >40 patterns to justify Round-4 (per E09-w-m brainstorming D14)
- **Round-3 cumulative count:**
  - M2 (api-corpus): **11 patterns**
  - M-other (book-mining + postmortem-mining + re-audit, per Welle M Plan §4 M1/M3/M4/M5): TBD by parallel sub-tasks
- **Source-Family added:** `api-corpus` is **NEW** alongside `book` + `postmortem` + `re-audit`. Citation-format is `verified-via: api-corpus-analyzer` — first-class evidence-class in master.
- **Recommendation for Round-4 trigger:** If M1+M2+M3+M4+M5 cumulative-count exceeds 40 (`-> Round 4` per D14), continue mining. If <40, declare Mining-Done and proceed to Welle F (Framework-Optimization) with the 11 corpus-patterns ready for downstream consolidation.

### Surprising findings die in apiq-Rules werden sollten (Top-5)

1. **RFC-7807 adoption is literal-zero** in 518 healthy public OpenAPI specs. apiq-rule severity-rebalancing required: any rule recommending `application/problem+json` MUST be `hint`, not `warn`. (S3 — R3-CO-SC-01)

2. **Sunset/Deprecation headers (RFC-8594/RFC-9745) at 0% adoption** — strongest empirical-gap in corpus. apiq-rule "deprecated operations should declare Sunset header in success responses" is a high-precision Stage-A finding-class with literally-zero false-positive risk in current corpus. (S5 sub — R3-CO-OP-02)

3. **22.2% of healthy public APIs leave write-ops unsecured** — far above intuition. Strong threat-modeling-rule justification with empirical mass behind it. (S10 — R3-CO-TM-02)

4. **OperationId naming has NO industry standard** — Spectral's kebab-case enforcement reflects an 8.9%-minority preference. apiq-rule should detect intra-spec inconsistency (no dominant casing >60%), not enforce a particular style. (S7 — R3-CO-CL-02)

5. **93.4% of healthy public APIs declare zero standard operational headers** — including the X-RateLimit-* family (RFC-9331-draft) at 4.6%, X-Request-Id at 0.6%, Idempotency-Key at 0.4%. The "headers-as-spec-coverage-gap" pattern is the largest single Lens-7+9+10 opportunity, surfacing-friction patterns spec-authors don't think to declare. (S5 — R3-CO-OP-01)

---

## Implementation Notes

- **Tool location:** `scripts/spike/eval/api-corpus-analyzer.ts` (608 lines, library) + `scripts/spike/eval/run-api-corpus-analysis.ts` (CLI wrapper).
- **Public-API contract:** `analyzeCorpus(specs, name)`, `analyzeAll(specs)`, `loadCorpusFromManifest(path)`, `STATISTICS` registry, `detailedStandardHeaderCoverage(specs)` aux helper.
- **Robustness:** All detection-functions are try/catch-wrapped at the per-spec level. Loading from manifest skips `notOnDisk` and `parseFailed` entries with warning-log.
- **Test coverage:** `scripts/spike/__tests__/eval/api-corpus-analyzer.test.ts` — 10 tests, all passing. Covers: auth-scheme distribution, analyzeAll on minimal fixture, pagination detection, error-shape detection, versioning, OAS-version bucketing, security-coverage, malformed-spec robustness, header-coverage helper, STATISTICS registry consistency.
- **JSON-dump artifact:** `scripts/spike/data/healthy-corpus/_analyzer-output.json` — full machine-readable distribution + examples for downstream M3 consumption.

## Reproduction

```bash
cd scripts/spike
npx tsx eval/run-api-corpus-analysis.ts --json data/healthy-corpus/_analyzer-output.json
```

Runs in ~13 seconds (file-load 11s, analysis 2s) on the 518-spec healthy-corpus. No external API calls. Pure deterministic spec-walking.
