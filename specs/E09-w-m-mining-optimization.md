# Epic 09 / Welle M — Mining-Optimization

> Putzen-First-Welle die Stage-A-Mining auf maximale Source-Coverage erweitert bevor Welle F (Framework-Optimization) und alle Folge-Wellen laufen. Pre-Conditions: keine — orthogonal-startbar. Output substanziert die in `meta-insights.md` deklarierte 10-Lens-Pattern-Architektur durch zusätzliche evidence-backed Patterns aus Books / Postmortems / API-Corpus-Statistics + bringt das Gesamt-Pattern-Inventar zu einem ehrlichen Mining-Maximum-Claim.
>
> Source-Plan: [`specs/big-spec-architecture-spike-stage-a-restwork-plan.md`](./big-spec-architecture-spike-stage-a-restwork-plan.md) §4. Brainstorming + Decisions: [`specs/E09-w-m-mining-optimization-brainstorming.md`](./E09-w-m-mining-optimization-brainstorming.md). Existing patterns als Master-Source-of-Truth: [`specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md`](./big-spec-architecture-spike-stage-a-rules-brainstorm.md). Lens-Framework-Definition: [`specs/big-spec-architecture-spike-stage-a-meta-insights.md`](./big-spec-architecture-spike-stage-a-meta-insights.md).

## Scope

Welle M besteht aus 5 Sub-Wellen die in 4 Phasen mit maximaler Parallelisierung ausgeführt werden.

### M1 — Mining-Round-3 Source-Mining (3 parallele Subagents)

**M1-Books:** Subagent mined API-Design-Patterns aus folgenden Bücher-Starting-Points + sucht aktiv weitere plausible API-Design-Books (Discovery unbounded — kein Cap):

| # | Book | Author | Year | Lens-Coverage |
|---|---|---|---|---|
| 1 | Web API Design | Erik Wilde | 2010s | 4, 5 |
| 2 | Patterns for API Design | Zimmermann/Pautasso | 2022 | 3, 4, 5, 8 |
| 3 | Restful Web Services Cookbook | Subbu Allamaraju | 2010 | 2, 4 |
| 4 | Design and Build Great Web APIs | Mike Amundsen | 2021 | 4, 9 |
| 5 | Continuous API Management | O'Reilly | 2019/2021 | 3, 10 |
| 6 | API Marketplace Engineering | Apress | 2020 | 10, 4 |
| 7 | REST in Practice | Webber/Parastatidis/Robinson | 2010 | 5 |

Plus: Subagent macht Web-Discovery nach weiteren post-2020 API-Design-Books (z.B. via O'Reilly TOC-search, Manning-Catalog, GitHub-API-design-Reading-Lists). Stoppt bei Plausibility-Erschöpfung.

Citation-Pflicht (per D1 / D3): jeder extracted Pattern braucht web-verifiable verbatim-Quote ≤200 chars + URL/Citation. Training-Knowledge ALLEIN ist nicht akzeptabel.

Output: `specs/big-spec-architecture-spike-stage-a-mining-round3-books.md`.

**M1-Postmortems:** Subagent mined Anti-Patterns + Lessons aus folgenden Engineering-Postmortems-Starting-Points + sucht aktiv weitere documented public API-Disasters (Discovery explizit unbounded — Postmortem-Discovery ist Kern-Wert dieser Sub-Welle):

| # | Postmortem | Topic | Lens |
|---|---|---|---|
| 1 | Twitter API v2 deprecation 2023 | evolution-disaster, communication-failure | 3 |
| 2 | Reddit API pricing fiasco 2023 | cost-impact, ecosystem-collapse | 3, 9 |
| 3 | PayPal IPN deprecation chaos | deprecation-without-replacement | 3 |
| 4 | GitHub deprecation policy evolution | positive-case (sunset-headers) | 3, 10 |
| 5 | Stripe API versioning model | positive-case (date-based versioning) | 3 |
| 6 | Heroku Platform API removal | entire-product-deprecation | 3 |
| 7 | Slack RTM API → Events API migration | forced migration | 3 |
| 8 | AWS Signature V2 → V4 | auth-deprecation | 1, 3 |

Plus: Subagent web-search nach weiteren API-Outages / Deprecation-Disasters / Migration-Failures / Security-Incidents (z.B. "API deprecation chaos" / "API outage postmortem" / "API breaking change disaster" / "API security incident postmortem").

Output: `specs/big-spec-architecture-spike-stage-a-mining-round3-postmortems.md`.

**M1-Re-Audit:** Subagent re-liest die 5 Round-2-Mining-Files (`mining-round2-{threat,standards,evolution,client,style,meta}.md`) + master `rules-brainstorm.md` und identifiziert Patterns die in Round-2-Files erwähnt wurden aber NICHT in master-Konsolidierung integriert wurden ("orphaned in Round-2"). Plus: Re-Audit checkt ob existing Master-Patterns noch korrekte IDs haben oder Drift.

Output: `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md`.

### M2 — API-Corpus-Mining (Phase A start parallel zu M1, Phase B sequenziell)

**M2a (parallel zu M1) — Multi-Source Corpus Download + Healthy-Spec-Filter:** Subagent lädt OpenAPI-Specs aus mehreren Quellen:
- APIs.guru (~2000+ specs)
- OpenAPI Directory
- Postman Public Workspaces (OAS-konvertierbare collections)
- GitHub-search nach `openapi.yaml` / `openapi.json` (raw, ungekuratet)
- Dedicated Vendor-Specs: Stripe / GitHub / AWS / Google APIs Discovery / PagerDuty / Slack / etc.

Subagent dedupliziert über Quellen + applied Healthy-Spec-Filter:
- (a) validates against oas3-schema
- (b) ≥10 operations
- (c) hat top-level `tags` array
- (d) ≥80% der ops haben `description`
- (e) updated <2y

Bei <500 healthy specs nach Filter → relax (a)-(e) iteratively. Output: `scripts/spike/data/healthy-corpus/<spec-id>.json` + manifest.

**M2b (Phase B) — Statistical-Analyzer-Tool:** Subagent baut `scripts/spike/eval/api-corpus-analyzer.ts` als wiederverwendbares Library-Tool. Public API:

```typescript
export interface CorpusStat {
  patternId: string;
  description: string;
  lens: Lens[];
  distribution: Map<string, number>; // value → count
  totalSpecs: number;
  confidenceScore: number; // % adoption
}

export function analyzeCorpus(specs: OpenApiSpec[], stat: keyof typeof STATISTICS): CorpusStat;
export function analyzeAll(specs: OpenApiSpec[]): CorpusStat[];
```

Tool muss als Library exportierbar sein damit Welle V (Cross-Linter-Parity) später gegen Corpus comparen kann.

**M2c (Phase B) — Pattern-Extraction-Run:** Subagent ruft Analyzer auf + extrahiert mindestens diese 10 Statistical Patterns plus weitere die er identifiziert:

1. Pagination-Convention-Verteilung (offset/limit / cursor / page+per_page / Link-header)
2. Auth-Scheme-Verteilung (apiKey-header / apiKey-query / oauth2 / bearer / basic / mtls)
3. Error-Shape-Verteilung (RFC-7807 / inline-mixed / status-code-only / vendor)
4. Versioning-Convention-Verteilung (header / url-path / query / Accept-vendor)
5. Standard-Header-Adoption (X-Request-Id / Idempotency-Key / Retry-After / RateLimit-* / Sunset / Deprecation)
6. Schema-Style-Verteilung (REST-L2 / RPC / JSON:API / HAL / AIP)
7. Operation-naming-Convention (verbResource / resource_verb / colon-method)
8. Content-type-Verteilung
9. OAS-Version-Verteilung
10. Security-Coverage (% of write-ops with security declared)

Output: `specs/big-spec-architecture-spike-stage-a-mining-round3-corpus.md` mit Statistics-Tabellen + abgeleiteten Patterns ("99% of healthy APIs declare X but apiq's Reference-Specs don't" → potential apiq-Rule).

### M3 — Mining-Files Konsolidierung + Master-Integration (Phase C parallel zu M4)

Subagent integriert M1+M2-Outputs in master `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` als neue Section "## Round-3 Additions (2026-05-06)" mit per-Lens-Tabellen analog zu Round-2.

Plus: 8 alte Mining-Files konsolidieren zu Stub-Files (per Subagent-A-Audit-Empfehlung):
- `mining-spectral.md`, `mining-linters.md`, `mining-style-guides.md` (Round-1)
- `mining-round2-{threat,standards,evolution,client,style,meta}.md` (Round-2)

Stub-Format: ~30 Zeilen pro File mit "Sources surveyed + extraction-rationale" plus Pointer auf master für die actual Patterns.

Plus: `specs/big-spec-architecture-spike-stage-a-implementation-priority.md:10` Cross-Reference zu Round-2-Files updaten.

### M4 — Mining-Reflection in Code-Comments (Phase C parallel zu M3)

Subagent appliziert Source-Mapping als Code-Comments in:

- **YAML-rule-comments oberhalb jeder rule-def** in `apiq-ruleset*.yaml` (110 active rules):
  ```yaml
  # Source: OWASP API4 + 42Crunch + Stripe + RFC 9110 §10.2.3 (verbatim "MUST send Retry-After")
  apiq-tm-y17-server-url-https-only:
    description: ...
  ```
- **Custom-function JSDoc** in `scripts/spike/deterministic/spectral-functions/*.ts` (5 callables):
  ```typescript
  /**
   * Multi-language reserved-keyword check (CL-1).
   *
   * Source: openapi-generator multi-issue (#XXXX, #YYYY)
   * Lens: 4 (Client-Friction)
   * Round-2 Phase E
   */
  export default function multiLangReservedKeywords(...) { ... }
  ```
- **Module-class header-comments** (15 wired modules in `scripts/spike/deterministic/`):
  ```typescript
  /**
   * Secret-Scanner Module — Stage A, Welle A T8 (Lens 1 + 6).
   *
   * Sources: TruffleHog (https://github.com/trufflesecurity/trufflehog)
   *          + Gitleaks (https://github.com/gitleaks/gitleaks)
   *          + OWASP API3 + Cloudflare PII-detection guidance
   * Patterns: 35 SECRET + 4 PII (39 total) + Shannon-entropy heuristic
   * Round-2 Phase A
   */
  ```

Coverage-target: ≥80% der active Spectral-Rules + 100% der Custom-Functions + 100% der Module-Class-headers tragen Source-Comments.

### M5 — Pattern-Knowledge-Index (Phase D nach M3+M4)

Subagent baut Embedding-basierten Pattern-Index als Substrate für Welle F + V + Phase-B downstream-Konsumenten:

- Schema:
  ```typescript
  interface PatternIndexEntry {
    patternId: string;
    lens: Lens[];
    sourceType: 'rfc' | 'owasp' | 'book' | 'postmortem' | 'corpus' | 'spectral-default' | ...;
    description: string;
    embedding: number[]; // text-embedding-3-small, 1536-dim
    metadata: {
      round: 1 | 2 | 3;
      severityHypothesis: 'error' | 'warn' | 'hint' | 'info';
      direction: 'tighten' | 'loosen' | 'drift';
      detectionPrecision: 'high' | 'medium' | 'low';
      isPureSpectralDetectable: boolean;
      isStageATerritory: boolean;
    };
  }
  ```
- Storage: in-memory JSON-on-disk at `scripts/spike/eval/cache/pattern-index.json`. Reuse existing `scripts/spike/eval/cache/` embedding-cache (dont re-embed already-cached descriptions).
- Embedding-Provider: `text-embedding-3-small` (consistent mit existing `eval/scorers/embedding-similarity.ts`).
- Public API:
  ```typescript
  export function findRelatedPatterns(
    query: string,
    opts?: { topK?: number; lens?: Lens; sourceType?: string; minSimilarity?: number }
  ): PatternIndexEntry[];

  export function buildPatternIndex(): Promise<void>; // one-shot index-build
  ```
- Index-Build-Skript: `scripts/spike/eval/build-pattern-index.ts` reads `rules-brainstorm.md` + `mining-round3-*.md`, embeds each pattern, writes JSON.

### Plus — Patterns JSON-Export (orthogonal, Phase D)

Subagent baut `scripts/spike/eval/patterns-export.ts` der `rules-brainstorm.md` parsed + structured `scripts/spike/data/patterns.json` als single-source-of-truth für downstream-Wellen exportiert. Schema (per D15):

```typescript
interface ExportedPattern {
  patternId: string;
  lens: Lens[];
  source: { type, citation, verbatim, url? };
  severityHypothesis: 'error' | 'warn' | 'hint' | 'info';
  direction: 'tighten' | 'loosen' | 'drift';
  codegenTargets: string[];
  description: string;
  detectionPrecision: 'high' | 'medium' | 'low';
  isPureSpectralDetectable: boolean;
  isStageATerritory: boolean;
  round: 1 | 2 | 3;
}
```

Output: committed (small file, valuable als single-source).

## Acceptance criteria

Welle M ist done wenn ALLE folgenden Kriterien erfüllt sind:

1. **Pattern-Anzahl:** ≥30 neue Patterns Round-3 in `rules-brainstorm.md` integriert (Threshold "valuable round").
2. **Source-Diversität:** ≥4 unique Source-Familien (book / postmortem / corpus / re-audit + optional blog/conference-talk).
3. **Verbatim-Cite-Rate:** ≥90% der neuen Patterns mit web-verifiable verbatim-Quote ≤200 chars + URL/Citation. Patterns ohne werden discarded.
4. **De-Dup-Rate:** ≥70% der candidate-patterns post-de-dup als wirklich-neu durchgegangen (`relates-to-existing`-Field korrekt belegt).
5. **Lens-Coverage-Lift:** ≥1 Lens deutlich gestärkt (≥10 neue Patterns auf einer einzelnen Lens). Plus: Lens-Coverage-Lift-Tabelle (Round-2 vs Round-3 per Lens) im Output.
6. **API-Corpus-Statistical-Findings:** ≥10 Statistical Pattern-Findings aus M2c.
7. **Mining-Files konsolidiert:** 8 alte Mining-Files (3 Round-1 + 5 Round-2-non-meta) → Stub-Files mit Pointer auf master. Round-2-meta bleibt eigenständig (≥600 Zeilen content).
8. **Code-Comments-Coverage:** ≥80% der active Spectral-Rules + 100% der Custom-Functions + 100% der Module-Class-headers tragen Source-Mapping als Comment.
9. **Pattern-Knowledge-Index funktional:** `findRelatedPatterns("oauth2 implicit flow")` returnt mindestens 3 relevante Patterns mit similarity ≥0.5.
10. **Patterns-JSON-Export:** `scripts/spike/data/patterns.json` committed mit allen Round-1+2+3-Patterns im Schema von D15.
11. **Discovery-Unbounded-Pflicht:** M1-Books-Subagent + M1-Postmortems-Subagent + M2a-Corpus-Subagent haben jeweils dokumentiert dass sie nach Discovery von neuen Quellen gestoppt haben (Plausibility-Erschöpfung), nicht wegen Time/Count-Cap.
12. **Test-Suite grün:** 806/0/2 bleibt unverändert (Welle M ändert keine Pipeline-Code, nur Code-Comments + neue Eval-Tools). Plus: neue Tests für `api-corpus-analyzer.ts` + `findRelatedPatterns` + `patterns-export.ts` (mind. 1 Test pro neues Tool).
13. **Memory + Plan-Doc updated:** handoff-memory + MEMORY.md hook + Plan-Doc §20 mit Round-3-Pattern-counts + Source-Diversity-Stats + Lens-Coverage-Lift-Tabelle + commit-hashes.
14. **Round-4-Decision dokumentiert:** Output-File `mining-round3.md` enthält explizite Decision "Round 4 lohnt sich (any-of conditions met)" oder "Mining maxed-out (none of conditions)" basierend auf Trigger D14.

## Out of scope

- Pattern-Extraction aus echten Book-Volltexten falls nicht web-zugänglich (Citation-Pflicht via Sample-Chapters / Reviews / Publisher-pages — Volltext-PDF-Ingestion ist v1.1+).
- Vector-Database (Vercel-Postgres-pgvector) — in-memory JSON-on-disk reicht für Welle M; pgvector ist v1.1+ candidate falls Pattern-Index >10k entries wird.
- Welle F (Framework-Optimization) — separate Welle, kommt nach Welle M.
- Cross-Linter-Parity-Test (Vacuum/Redocly) — Welle V territory, kommt nach allen Putzen-Wellen.
- Phase-B LLM-Pipeline-Engineering — kommt nach Welle V.
- Round-4-Mining — conditional auf Round-3 Decision-Trigger D14.

## Domain terms

- **Round-N Mining:** strukturierte Pattern-Extraction-Pass über curated source-set. Round 1 = spectral/linters/style-guides (done); Round 2 = per-Lens deepening (done); Round 3 = books/postmortems/corpus (this Welle); Round 4+ = conditional-trigger.
- **Postmortem:** öffentlich dokumentierte Engineering-Retrospektive eines Failures / Outages / Incidents. Im API-Kontext: dokumentierte Analyse von API-Disasters (deprecation chaos, auth-breaking-changes, etc.) mit "what NOT to do"-Patterns aus realen Konsequenzen.
- **Healthy-Spec-Filter:** Kriterien-Set das aus einem Roh-Korpus von OpenAPI-Specs die "healthy" Subset filtert (oas3-validates + ≥10 ops + tags + descriptions + updated <2y). Verhindert dass Hobby-/Test-Specs Statistics verzerren.
- **Source-Familie:** Kategorie der Quellen-Type (book / postmortem / api-corpus / blog / conference-talk / paper / spec). Source-Diversität-Kriterium in Acceptance §2 misst über diese Familien.
- **Lens-Coverage-Lift:** Delta der Pattern-Anzahl pro Lens zwischen Round-N-1 und Round-N. Diagnostic ob Mining biased ist auf bestimmte Lenses (z.B. Books decken primär Lens-4-Client-Friction, Postmortems primär Lens-3-Evolution-Friction).
- **Verbatim-Cite-Rate:** % der neuen Patterns die einen web-verifiable verbatim-Quote ≤200 chars + URL/Citation tragen. Strict-gating-Kriterium gegen Halluzination.
- **Pattern-Knowledge-Index:** Embedding-Index aller consolidated Patterns (Round-1+2+3) als Substrate für `findRelatedPatterns`-Queries in Welle F (metadata-promotion), Welle V (cross-linter-mapping), Phase-B (LLM-prompt-context-retrieval).
- **Discovery-unbounded:** Subagent stoppt Source/Pattern-Suche nur wenn keine plausiblen weiteren Funde findable sind, nicht wegen Time-Box / Count-Cap. Maximalismus-Setup-Konsequenz.

## Open questions

Keine offenen Decisions vor Implementierung. Alle Decision-Punkte wurden im Brainstorming-File §10/§12 resolved. Mid-implementation könnten emergent Issues auftauchen — diese werden im Welle-M-results-File post-/dev dokumentiert.

Optional spätere Decisions die NICHT pre-implementation sind:

1. **Round-4-Trigger-Outcome.** Decision-Trigger D14 wird post-Welle-M evaluiert basierend auf actual Pattern-Anzahl + Source-Familien-Funden. Falls trigger fires → separate `/spec_ind w-m2 mining-round4` Welle.
2. **Vector-Database-Migration.** Falls Pattern-Knowledge-Index >10k entries wird (unlikely für Round-3, möglich für Round-4+ + Phase-B-feedback-loop) → Migration zu Vercel-Postgres-pgvector. v1.1+ candidate.
3. **Plus-Books / Plus-Postmortems Discovery-Yield.** Falls Subagent-Discovery viele zusätzliche plausible Quellen findet (e.g. >20 Books oder >15 Postmortems über Initial-Liste hinaus) → split in Sub-Subagents pro source-family für besseres Curation.
