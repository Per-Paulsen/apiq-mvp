# Stage-A Restwork Plan v2 — Maximalismus + /spec_ind/dev-Workflow

> **Status:** 2026-05-06 v2 (Maximalismus-Decision + /dev-Workflow). Plan-Doc ist Source-of-Truth für alle weiteren Stage-A-Wellen + Pre-Phase-B-Wellen. **Putzen-First-Regel + Maximalismus-Setup**: erst alles selbst optimieren das ehrlich geht (nicht nur "Pflicht"-Teile), dann gegen Konkurrenz validieren, dann Phase B.
>
> **Decision (2026-05-06):** v1 hatte 3 Varianten (a/b/c) für Engineering-Constraints — keine davon greift hier. User hat klargestellt: keine v1-launch-Timeline, keine Resource-Constraints (Claude Max + Zeit), Ziel ist "alles ordentlich, sauber, funktionsfähig, optimal". Plan-Doc v2 ist deshalb (a)+ = Plan + Maximalismus-Ergänzungen.
>
> **Origin der Putzen-First-Regel:** `critical-review.md:528, :585`. 2026-05-06 erneut bestätigt nach kritischer User-Review. Cross-Linter-Parity-Test gegen Vacuum/Redocly würde — wenn vor Putzen ausgeführt — die Implementation antreiben statt validieren ("Konkurrenz-treibt-Implementation"-Anti-pattern). Cross-Linter kommt deshalb in Welle V, ganz am Ende vor Phase B.

---

## 0. Strategic Vision Constants — apiq's eigentliches Ziel (2026-05-07)

> **Persistent context, NICHT welle-spezifisch.** Diese Constants bleiben über alle Wellen hinweg gültig + müssen in jedem Wellen-Briefing mitschwingen. User-Direktive (2026-05-07): "es ist kein a oder b, sondern alles. und wir dürfen nichts auf kosten des anderen trade-off machen."

**Vision (long-term):** apiq wird **Infrastructure for AI-consumable APIs / Agent Interaction Quality** — nicht nur "OpenAPI-spec-Linter". Putzen-First gilt weiter als Methode (first-in-class deterministic linter ist Foundation, nicht Endziel), aber nicht als Tunnelblick.

**Core-Insight:** "Humans tolerate bad APIs. Agents don't." Empirisch in Round-3 belegt:
- 22.2% public APIs leave write-ops unsecured (LLM tool-calls scheitern stumm)
- RFC-7807 0% adoption + Sunset/Deprecation 0% (LLM-error-recovery-impossible)
- No industry-standard operationId-naming (LLM tool-selection-confidence niedrig)

**Drei Spannungs-Achsen die wir managen müssen** (kein Trade-off — ALLE drei parallel):

1. **Putzen-First-Welle vs Vision-Tracking:** Stage-A-Foundation muss perfekt geputzt werden (Welle F-V), ABER wir dürfen nicht vergessen dass das nur Foundation für Agent-Quality-Layer ist. Welle M2 + Welle Z bringen die agent-zentrische Arbeit nach Welle V (NACH Putzen, vor Phase B).

2. **OpenAPI-spec-eval (today) vs MCP-eval (tomorrow):** OpenAPI ist NICHT legacy (96.1% adoption in 518-spec corpus, vendors shippen weiter). ABER MCP-server tools-schemas werden zweites primary-Eingabeformat. Welle Z addiert MCP-Input-Adapter ohne OpenAPI-support aufzugeben.

3. **Lens-1-4 (mature) vs Lens-9-11 (untergewichtet):** Aktuell 87% der 871 patterns adressieren Lens 1-4 (klassisch human-developer-zentrisch). Lens-9 + Lens-10 zusammen nur 3.4%. Wenn Vision Agent-Interaction-Quality ist, muss diese Verteilung sich verschieben — durch gerichtetes Mining (M2) + neue Lens 11 (Agent-Tool-Disambiguation, conditional).

**Ergänzende Lens-11-Hypothese (decision-pending):** Tool-Collision-Detection + Promptability-Scoring + Tool-Selection-Confidence sind nicht sauber in Lens-9 (consumability) untergebracht — passen besser zu eigener "Agent-Tool-Disambiguation"-Lens. Mining-Welle M2 hat als Acceptance-Criterium: ≥10 Patterns die Lens-11-Existenz rechtfertigen oder negieren.

**Strategic-Constants-Pflicht für jeden Wellen-Briefing:**
- Subagents wissen, dass Lens-9 + Lens-10 unterbewertet sind und tagging entsprechend skeptical sein
- Welle F (Schema-Erweiterung) hält apiq-meta-block agent-aware (autoFixSafe + detection-precision + lens-9/10-first-class)
- Welle V (Cross-Linter-Comparison) hat agent-quality als zusätzliches Differentiator-Kriterium über klassisches lint-coverage hinaus
- Phase B-design weiß dass Lens-9/10/11 die primary-LLM-territory sind (nicht co-equal mit Lens-1-4)

**Memory-Anchor:** `~/.claude/projects/.../memory/project_apiq_agent_readiness_positioning.md` (2026-05-07)

---

## 1. Putzen-First-Prinzip

**Regel:** Stage-A-Implementation wird zur eigenen Best-in-class-Vision gebaut, nicht zur Konkurrenz-Lücken-Schließung. Konkurrenz-Vergleiche kommen NACH dem Putzen, als Validation. Wenn ein Vacuum/Redocly-Test vor dem Putzen läuft, wird das Resultat zur Roadmap-Vorlage statt zum Reality-Check — apiq würde zum "Vacuum-aber-mit-extra-stuff" statt zum eigenständigen Produkt.

**Konsequenz:** Mining-Optimization + Framework-Optimization + Implementation-Wellen + Code-Quality + Reference-Hardening + Test-Coverage + Documentation + Refactoring kommen ALLE vor Cross-Linter-Parity-Test. Phase-B-Engineering kommt nach Cross-Linter-Parity.

**Maximalismus-Ergänzung:** "alles geputzt was geht" heißt nicht nur "Pflicht-Items im Plan" sondern echte Maximierung — Mining ehrlich maxed-out (Round 3 + Corpus), Framework ehrlich maxed-out (Schema sauber + 110 rules promotet + alle Subagent-B-Lücken geschlossen), Implementation ehrlich maxed-out (P1+P2+P3+P4+P5), Test-Coverage maximal (alle Specs + Snapshot + CI), Documentation maximal (dev-README + Architecture-Diagram + Contributor-Guide), Refactoring (flat → classifiers/aggregators/modules/rules), References ehrlich klassifiziert (R1 + R2).

---

## 2. Execution-Framework — `/spec_ind` + `/dev`

**Architektur:**
- Plan-Doc (DIESES Doc) = strategischer Master (welche Wellen, Pre-Conditions, Reihenfolge)
- Pro Welle: `/spec_ind <slug> "<context-prompt>"` erzeugt Epic-Spec mit konkreten acceptance criteria
- Pro Welle: `/dev <epic-spec>` führt mit self-organizing team aus (code + tests + verification + commit)

**Begründung:**
- Strukturierte acceptance criteria pro Welle statt prose-instructions
- Eingebaute verification + commit (kein hand-orchestrating)
- Self-organizing team-coordination
- Reproduzierbar + auditierbar (Epic-Spec ist Source-of-Truth, nicht Conversation-Memory)
- Skalierbar — orthogonale Wellen können parallel /dev-laufen

**Workflow pro Welle:**
1. Plan-Doc Welle-Section lesen
2. `/spec_ind <welle-slug> "<context-prompt-mit-pre-conditions-+-acceptance-criteria>"`
3. Generated Epic-Spec reviewen, ggf. refinen via `/refine`
4. `/dev <epic-spec>` ausführen
5. Test-Suite verifizieren grün, Commit landen
6. Plan-Doc Status-Section aktualisieren mit Welle-done-Marker
7. Memory-Handoff aktualisieren

**Naming-Convention für Welle-Specs:**
- `specs/E09-w-{m|f|c|d|e|q|t|doc|arch|r|v}-{slug}.md` (E09 = Epic 09 — z.B. `E09-w-m-mining-round3.md`)
- Plus eventuell `*-results.md` post-/dev mit deviations + tests + commit-list

### Decision-Heuristik: `/spec_ind` (mit Brainstorming) vs direkter Epic-Spec

Pro Welle entscheiden: was passt besser?

**Direkter Epic-Spec (kein Brainstorming):** wenn die Welle im Plan-Doc bereits konkrete acceptance criteria hat, alle Decisions klar dokumentiert sind, und kein zusätzlicher Discussion-Wert von Brainstorming entsteht. Vorgehen: Welle-Section aus Plan-Doc als Vorlage → direkt `specs/E09-w-{x}-{slug}.md` schreiben → `/dev`.

**`/spec_ind` mit Brainstorming:** wenn die Welle Sub-Decisions hat die Discussion brauchen (z.B. Refactoring-Strategy bei Welle Arch, Mining-Source-Selection bei Welle M, Reviewer-Auswahl bei Welle R), oder scope ist nicht voll definiert. Vorgehen: `/spec_ind <n> <slug> "<context-mit-link-auf-plan-doc-section>"` → iterative Brainstorming-Antworten → Spec finalized → `/dev`.

**Klassifizierung pro Welle (Stand 2026-05-06):**

| Welle | Modus | Begründung |
|---|---|---|
| Q | direkt | Q1-Q5 sind klar definiert, kein Discussion-Wert |
| M | brainstorming | M1-Source-Selektion + M2-Corpus-Approach + Decision-Point M1→M2 brauchen Diskussion |
| F | brainstorming | F1-F10 mit 10 Sub-Items + F4-Migration-Strategy für 110 rules braucht Sequenzierung-Diskussion |
| C | direkt | P2-Patterns klar in `implementation-priority.md` |
| D | direkt | P3-Patterns klar in `implementation-priority.md` |
| D2 | direkt | P4+P5-Patterns klar in `implementation-priority.md` |
| E | direkt | T24 Putz-Niveau-Benchmark hat klare 28-Springer-Delphi-Regeln |
| T | direkt | T1-T3 sind klar (Integration-Tests + Snapshot + CI) |
| Doc | brainstorming | Doc-Style + Audience + Tiefe nicht voll definiert; Discussion-Wert |
| Arch | brainstorming | Refactor-Strategy + welche Files in welche subtree + spec-diff in modules/ vs experimental/ braucht Diskussion |
| R | brainstorming | R2-Reviewer-Auswahl (welches Modell) + Disagreement-Workflow braucht Diskussion |
| V | direkt | 4-way Cross-Linter-Liste + Comparison-Format klar |
| Phase B | direkt | Bereits ausführliches Design-Doc `phase-b-design.md` vorhanden — direkt als Spec-Vorlage nutzen |

**Append-Workflow:** sobald eine Welle done ist, Plan-Doc §21 Welle-Status-Tracker aktualisieren mit Spec-Pfad + commit-Hash + Test-Stand. Memory-Handoff aktualisieren falls signifikante Erkenntnisse.

**Welle-Reconciliation-Standard (NEU 2026-05-10 ab Welle E):** Wenn eine Welle yaml-rules adds, MUSS sie nach yaml-implementation einen Reconciliation-Pass machen — drift-lint run + alle class-3-drifts zwischen yaml-severity und patterns.json severityHypothesis durch patterns.json-Updates auflösen (yaml = source-of-truth post-implementation), NICHT durch baseline-bumps. Verhindert cumulative-drift. Welle D2 (2026-05-10) etablierte diesen Pattern: 6 patterns.json severityHypothesis-Updates statt baseline-bump 18→24. Memory: `feedback_yaml_truth_reconciliation.md`.

**Pre-Welle-Audit-Standard (NEU 2026-05-10 ab Welle E):** Wenn das Plan-Doc für eine Welle eine Pattern-Liste enumeriert, MUSS Pre-Welle-Audit gemacht werden (grep auf patternId in `scripts/spike/deterministic/`) zur Identifikation bereits-implementierter Patterns. D2 (2026-05-10) hatte 15 von 26 nominellen Patterns bereits in vorigen Wellen — 60% Doppelarbeit-Risiko ohne Audit. Audit-Result wird im Welle-Spec als "Bestandsaufnahme"-Section dokumentiert; D2-deduplicate-Implementation baut nur die echten neuen Patterns.

---

## 3. Wellen-Übersicht (erweitert v2)

| Welle | Inhalt | Pre-Conditions | Parallel-möglich? |
|---|---|---:|---|
| **Q** | Code-Quality (codegen-aggr + OPENAI-fix + layer-tag + ext. integration-tests + PREDICTIONS-marker) | keine | ✓ orthogonal — kann sofort + parallel zu allem laufen |
| **M** | Mining-Optimization (M1 Round-3 + M2 Corpus-Mining + M3 Konsolidierung + M4 Code-Comments) | keine | ✓ orthogonal zu Q |
| **F** | Framework-Optimization (F1-F10, 10 Sub-Items inkl. 110-rule metadata-promotion) | M done (Mining-Outputs müssen Schema-Erweiterungen reflektieren) |
| **C** | P2 Spectral (T16b Threat ~25 + T18b Client ~20 inkl. 4 DOLAR) | F done | ✓ T16b + T18b parallel |
| **D** | P3 Trail (T16c Threat ~30 + T18c Client ~30 + T25 Source-Verify-CI) | C done | ✓ 3 Subagents parallel |
| **D2** | P4 + P5 Niche/Vendor-Patterns (~25 patterns) | D done | — |
| **E** | T24 Putz-Niveau-Benchmark (gegen 28 Springer-Delphi-Rules) | D2 done (alle target rules implementiert) |
| **T** | Test-Coverage (Integration-all-specs + Snapshot-Tests + CI-Pipeline) | C done | ✓ parallel zu D/D2/E |
| **Doc** | Documentation (dev-README + Architecture-Diagram + Contributor-Guide) | M+F+Arch done | — |
| **Arch** | Architectural Refactoring (flat → classifiers/aggregators/modules/rules) | F done | — |
| **R** | Reference-Hardening (R1 isPureSpectralDetectable + R2 Second-LLM-Review) | keine | ✓ orthogonal — parallel zu allem ab Welle C |
| **V** | 4-way Cross-Linter-Parity (Vacuum + Redocly + IBM-validator + Spectral-OWASP) + Final Stage-A-Run | M+F+C+D+D2+E+Q+T+Doc+Arch+R done |
| **M2** | Stage-B + Agent + MCP-Mining (gerichtetes Mining für Phase B + Welle Z + Lens-9/10/11 expansion) | V done | — |
| **Z** | MCP-Input-Format-Adapter (zweites Eingabe-Format neben OpenAPI; Tool-Collision-Detection) | V done | ✓ parallel zu Phase B / M2 |
| **Phase B** | LLM-Pipeline-Engineering (N=3×4 Runs, eigentlicher Spike-Lock-Test) | V + M2 done (M2-patterns als Phase-B-prompt-context-substrate) |

**Total Restwork:** substantial — see per-Welle Acceptance-Criteria.

**Decision-Points zwischendurch:**
- Nach M1: Round-3-Erkenntnisse vielversprechend → M2 Corpus oder skip falls offensichtlich-maxed?
- Nach M2: weitere Mining-Round-4 falls neue Source-Familie auftaucht?
- Nach E: 28/28 Springer-Delphi tatsächlich erreicht? Falls nicht, Welle E1 (Lückenschließen).
- Nach V: Cross-Linter-Parity-Output entscheidet Phase-B-Prompt-Engineering-Strategie.
- Nach Phase B: pass/partial/fail per `phase-b-design.md §7`.

---

## 4. Welle M — Mining-Optimization

### Prinzip
Mining ist NICHT maxed-out. Round-2-Phase-F's "declared converged at 10 lenses" basierte auf 3 Source-Familien (spectral-rules, linters, style-guides). Round 3 mit anderen Sources kann zusätzliche Patterns + möglicherweise zusätzliche Lenses ergeben. Maximalismus-Setup: Round 3 (M1) + Corpus (M2) verpflichtend, Round 4 nach Decision-Point.

### M1 — Mining-Round-3 curated batch 1

**Sources (kuriert, nicht unbounded):**
1. **API-Design-Books** (3-4 Bücher Capacity):
   - Erik Wilde "Web API Design"
   - Olaf Zimmermann / Cesare Pautasso "Patterns for API Design"
   - Restful Web Services Cookbook (Allamaraju)
   - "Design and Build Great Web APIs"
2. **Negative-space — Postmortem Patterns** (5-8 documented public failures):
   - Twitter API v2 deprecation disaster (2023)
   - Reddit API pricing fiasco (2023)
   - PayPal IPN deprecation chaos
   - GitHub deprecation policy evolution
   - Plus 1-2 vendor-side postmortems (e.g. Stripe-Anti-pattern docs)
3. **Round-2-Pattern-Re-Audit:** sind die ~290 take-into-apiq Patterns wirklich vollständig? Oder gab es Patterns aus Round-2-mining die in Master-Konsolidierung verloren gingen?

**Output:** `specs/big-spec-architecture-spike-stage-a-mining-round3.md` — neue Patterns mit Source-Mapping. Patterns werden in `rules-brainstorm.md` Master-Konsolidierung integriert.

**Erwarteter Funde-Range:** +20-50 zusätzliche Patterns. Plus: Evaluation ob neue Lenses (Lens 11 Performance-and-Cost / Lens 12 Observability) eigenständig sind oder in existing Lenses einsortierbar.

### M2 — API-Corpus-Mining VERPFLICHTEND

**Was:** statistische Mining-Pass über APIs.guru-Korpus (2000+ public OpenAPI specs). Patterns wie "99% of healthy APIs declare X, only 30% of yours does" — data-driven Mining vs source-driven.

**Output:** `specs/big-spec-architecture-spike-stage-a-mining-round3-corpus.md`. Statistische Patterns für Lens-3-Evolution + Lens-4-Client + Lens-9-AI-Agent.

**Bei Maximalismus:** verpflichtend (war v1: optional). Macht "Mining maxed-out"-Claim ehrlich.

### M3 — 8 Mining-Files konsolidieren

Per Subagent A's Audit (2026-05-06):
- 3 Round-1-Files (mining-spectral / mining-linters / mining-style-guides) → "sources + extraction-rationale" Stubs (~30 Zeilen each), Patterns redundant zu rules-brainstorm.md
- 5 Round-2-Files (mining-round2-{threat,standards,evolution,client,style}) → ähnliche Stubs
- 1 Round-2-File (mining-round2-meta) — größerer (744 Zeilen) → Konsolidierung größer, weil Lens-10-Discovery + Springer-Delphi-Mapping load-bearing ist
- Master-File `rules-brainstorm.md` bekommt unique-deltas integriert (insbesondere TM-A detail aus round2-threat + Springer-Delphi-Mapping aus round2-meta)
- `implementation-priority.md:10` Cross-Reference zu Round-2-Files updaten

**Total:** ~3500 Zeilen Markdown → ~600 Zeilen Stubs. Reduce process-friction für Round-3-Append.

### M4 — Mining-Reflection in Code-Comments

**Aktuell:** 5000+ Zeilen Mining-Markdown isoliert vom Code. Spectral-Rule-`description:` enthält nicht die Source-Pointer.

**Ziel:** jede aktive Rule trägt Source-Mapping in:
- YAML-rule-comments oberhalb der rule-def: `# Source: OWASP API4 + 42Crunch + Stripe + RFC 9110 §10.2.3 (verbatim "MUST send Retry-After")`
- Custom-function JSDoc: Source + Lens-Mapping als JSDoc-Comments
- Module-class header-comments: Source + Lens + Round-2-Phase-Reference

**Output:** ~110 YAML-Rules mit Source-Comments + 5 Custom-Functions mit JSDoc + 15 Module-Classes mit erweiterten Headern. Defense gegen Skepsis ("warum diese Rule?" → Comment liefert RFC/Source-Pointer).

### M-Decision-Point

Nach M1+M2: wenn diminishing-yield klar (M1 + M2 zusammen <40 neue Patterns), dann ehrlicher Mining-maxed-out-Claim. Sonst Round 4 mit weiteren Sources (Conference-Talks, Vendor-Engineering-Blogs, recent papers).

---

## 5. Welle F — Framework-Optimization

Per Subagent B's Audit (2026-05-06): Framework hat substantielle Lücken — **83% der 110 YAML-Rules tragen Metadata nur in Prosa, nicht structured**. Plus mehrere Schema-Sync-Issues. Welle F adressiert alle Lücken.

### F1 — `autoFixSafe` + `detection-precision` Schema-Erweiterung

- Add `autoFixSafe: boolean` zu `RuleMetadataSchema` in `severity-schema.ts`
- Add `detectionPrecision: 'high' | 'medium' | 'low'` zu schema
- Tag ~30-50 Patterns als `autoFixSafe: true` (basierend auf phase-b-design.md §2 Layer 1 Liste)
- Tag low-precision Patterns (z.B. heuristisch-textbasierte Rules) als `detectionPrecision: 'low'`

**Pre-Condition für Phase B** (autoFixSafe ist explizit Phase-B-Pipeline-Anforderung).

### F2 — Stakeholder/Lifecycle/Defect-class Enum-Sync

Schema ist 1-Round-1-step hinter Round-2-Doc. Konkrete Lücken (per Subagent B Audit):

**Stakeholder-Enum:**
- **`ai-agent` fehlt** — direkt undermining für Lens-9 USP. Walker-rules tagen aktuell `client-dev` als fallback. Add to enum.
- Aktuell: `spec-author / client-dev / end-user / operations / security / codegen-tool / docs-tool / self`
- Ziel (per `meta-insights.md:330, :448`): plus `ai-agent`

**Lifecycle-Enum:**
- **`authoring-time` + `validation-time` fehlen.** Aktuell 8 Werte; doc lists 9 phases.
- Plus naming-Konsistenz (`runtime-scale` vs doc's `runtime-at-scale`).

**Defect-class-Enum:**
- **`privacy-leakage` + `operational-metadata-missing` fehlen** (Round-2-Promotion nicht reflektiert in TS).
- Aktuell 6 Werte; Round-2 promovierte auf 8 (per `meta-insights.md:334, :452`).
- Plus naming-Konsistenz (`ergonomics`/`incompleteness` vs doc's `ergonomic`/`incomplete`).

### F3 — `direction-modifier` von Prosa zu structured field

Schema hat `direction: 'tighten'|'loosen'|'drift'`. **Null YAML-rules tragen es als structured field** — alle 36 Hits in `apiq-ruleset-evolution.yaml` sind Prosa (`[lens-3 | drift]` in description).

Zusätzlich: `spectral-runner.ts:299-307` kopiert nur `description/message/severity/recommended/resolved` durch — selbst wenn YAML `direction:` trüge, würde es bei Conversion gedroppt.

**Workstreams:**
1. Spectral-runner extend um `direction:` + andere apiq-meta-Felder durchzukopieren (siehe F4)
2. ~30 EV-rules + relevante andere Rules taggen mit `direction:`

### F4 — YAML-rule metadata promotion (load-bearing)

**Aktuell:** 110 YAML-rules carry nur `description / message / severity / given / then`. Apiq-Extended-Metadata (lens-tags / source-distinction / codegen-targets / stakeholder / lifecycle / defect-class / iso25010) **nirgends als structured fields**, nur in description-Prosa. **~83% der active rules sind metadata-arm.**

**Ziel:** YAML-rule-shape erweitern um:
```yaml
apiq-tm-y17-server-url-https-only:
  description: Server URLs MUST use HTTPS (OWASP API8)
  message: "..."
  severity: warn
  given: "..."
  then: { ... }
  apiq-meta:
    pattern-id: TM-Y17
    lenses: [lens-1, lens-2]
    direction: drift
    sources:
      - { type: rfc, id: 'RFC 9110', section: '...', verbatim: '...', verifiedAt: '2026-05-06' }
      - { type: vendor, id: 'OWASP API8' }
    stakeholders: [security, end-user]
    lifecyclePhase: deploy-time
    defectClass: semantic
    iso25010: [security]
    codegenTargets: ['*']
    detectionPrecision: high
    autoFixSafe: false
```

**Spectral-runner.ts erweitern:** apiq-meta-Block lesen, in DetectorFinding einbetten, durch `validateMetadata` validieren.

**Migration der 110 rules** parallelisierbar via Subagents (4 parallele Wellen-A/B/C/D-Subagents je ~28 rules).

### F5 — `validateMetadata` enforcement in pipeline

Aktuell ist `validateMetadata` advisory — wird in 23 walker/module-rules aufgerufen, in 0 YAML-rules. Plus `migrateLegacyRule` ist nur in Tests.

**Ziel:** spectral-runner ruft `validateMetadata` auf jeder geladenen rule auf, schmeißt Warning bei missing apiq-meta. Optional: Build-time-Test der mindestens N% der rules komplette Metadata haben.

### F6 — `info`-tier emission auf Lens-10 walkers

Schema unterstützt `info`-Tier. **Null walker emittiert findings auf `info`** (alle Lens-10-positive-markers stehen auf `hint`). Round-2 hat `info`-tier explizit als USP markiert.

**Ziel:** L10-positive-markers (SLA4OAI-presence, capability-discovery-endpoint-presence) emittieren mit `severity: info`.

### F7 — Per-target codegen-tagging

Aktuell **alle rules carry `codegenTargets: ['*']`** auch wenn description sagt "Targets: java, go, python". Lens-4 P1-Rules sind codegen-target-spezifisch.

**Ziel:** ~30-50 Lens-4-Rules taggen mit konkreten Targets-Lists. Erlaubt per-SDK-target finding-Filter.

### F8 — `source-verbatim` + `source-verified-at` Fields

`RuleSourceSchema` hat aktuell kein `verbatim` (RFC-text-quote) + `verified-at` (Timestamp). T25 Source-Verify-CI (Welle D) braucht das.

**Ziel:** Schema erweitern + populate als Teil von F4.

### F9 — Quality-Framework-Mapping (NEU für Maximalismus)

Aktuell nur ISO/IEC 25010 als Quality-Framework. Bei Maximalismus: secondary regulatory-mapping field für Enterprise/Compliance-Tier.

**Frameworks:**
- **NIST CSF 2.0** (Cybersecurity Framework Functions: Govern/Identify/Protect/Detect/Respond/Recover)
- **OWASP ASVS 5.0** (Application Security Verification Standard — V1-V14 chapters)
- **CIS Controls 8.1** (Top 18 Critical Security Controls)
- **GDPR Art** für Privacy-relevante Patterns
- **SOC 2 TSC** (Trust Services Criteria) für Audit-Trail-Patterns

**Ziel:** Schema-erweiterung `regulatoryMapping: { nist?: string[]; asvs?: string[]; cis?: string[]; gdpr?: string[]; soc2?: string[] }`. Tagging ~30-50 security/privacy-relevant rules. Defense für Enterprise-tier-Sales-Conversations.

**Rationale:** kein Konkurrenz-Linter ships explicit regulatory-mapping. Echtes USP-Differentiator.

### F10 — `cost-impact` + `mttr-impact` axes (NEU für Maximalismus)

Aktuell weder dokumentiert noch implementiert. Bei Maximalismus: SRE-relevante Filter-Dimensionen.

**Schema-Erweiterung:**
- `costImpact: 'low' | 'medium' | 'high'` (cost-of-fix für Author)
- `mttrImpact: 'low' | 'medium' | 'high'` (impact-on-MTTR-when-fired-in-prod)

**Ziel:** Tagging der 110 + Welle-C/D-Rules. Ermöglicht "show me only high-cost-impact rules" / "show me MTTR-relevant rules" Filter im UI.

### F-Decision-Point

Nach F4 (YAML-metadata-promotion): erste Migration-Welle erfolgreich + F5-Enforcement aktiv? → Welle C startet. Sonst F4-Subagents nochmal nachschärfen.

---

## 6. Welle C — P2 Spectral Rules

**Inhalt** (per `implementation-priority.md` P2-Tabelle):
- **T16b P2-Threat** ~25 rules — Y-1, Y-8, Y-10, Y-12/13/14, Y-15, Y-19, Y-21, TM-A2, TM-A5, TM-A7, TM-A9, TM-A12, TM-A13, TM-A14, TM-A18, TM-A28, TM-A35, TM-A36, TM-A45, TM-A46, TM-A47, RFC2-1/2/3, RFC2-11, RFC2-20/21/22/25/26, RFC2-32, RFC2-58, RFC2-59, RFC2-65, RFC2-69, RFC2-70, RFC2-74, RFC2-97
- **T18b P2-Client** ~20 rules — CL-4, CL-5, CL-7, CL-9, CL-13, CL-15, CL-17, CL-18, CL-21, CL-22, CL-24, CL-25, CL-29, CL-35, CL-48, CL-54, CL-56, CL-64, CL-77, plus DOLAR F-11/F-12/F-13/F-14 (alle 4)

**Pre-Condition:** Welle F done — alle neue rules nutzen finalisiertes Schema (mit apiq-meta, autoFixSafe, detection-precision, vollständigem Stakeholder/Lifecycle/Defect-Class enum).

**Subagent-Welle:** 2 parallele Subagents (T16b + T18b).

**Output:** `apiq-ruleset-threat-p2.yaml` + `apiq-ruleset-client-p2.yaml`. Plus eventuell Custom-Functions für komplexere Patterns. spectral-runner um neue YAMLs erweitern.

---

## 7. Welle D — P3 Trail (erweitert 2026-05-08 post-Welle-C)

**Inhalt** (per `implementation-priority.md` P3-Tabelle + Welle-C-Open-Questions-Resolutions):

### Original Plan-Doc-Scope
- **T16c P3-Threat** ~30 rules
- **T18c P3-Client** ~30 rules
- **T25 Source-Verify-CI Job** — quarterly gh-api-raw verification of RFC-2119-verbatim wording, populate `source-verified-at` timestamps

### NEU (post-Welle-C user-direktive 2026-05-08 "alles 100% ordentlich")

- **T-Sentinels — 3 sentinel-Walker-Implementations** (resolve Welle-C-sentinel-rules):
  - `walkers/schema-similarity.ts` (CL-48) — pairwise schema-comparison via embedding-distance ODER JSON-structure-Levenshtein für near-duplicate schemas detection
  - `walkers/pluralised-nodes.ts` (F-14) — sing/plur-conflict-detection auf URI-segments (e.g. `/users/{id}/order` vs `/users/{id}/orders`)
  - **Erweiterung** existing `json-schema-draft-detector.ts` für CL-24 multi-type-detection (`Array.isArray(@.type)`-fix)

- **T-F7 — F7-Vollständigkeits-Pass** (codegen-targets-coverage):
  - Alle ~60 neue P3-rules tragen entweder `['*']` ODER konkrete codegen-targets-Liste (per rule-description / custom-function-source explizit entschieden, kein default-`['*']`)
  - **Retroactive** für alle existing P1+P2-rules (~170 rules): rules die sprach-spezifisch sind bekommen konkrete Liste; rules die genuine universal sind behalten `['*']`
  - **Acceptance:** ≥80% der ~230 active rules sind korrekt-getagged (rest = genuine universal)

- **T-Funcs — Custom-Functions Konsistenz-Cleanup** (per `<lens>-p<priority>-functions.ts`-Pattern):
  - **Rename** `spectral-functions/multi-lang-reserved-keywords.ts` → `spectral-functions/client-p1-functions.ts` (consistency mit P2-pattern). Update `spectral-runner.ts` imports.
  - **Neue P3-function-files** per Lens-Bucket wo P3-patterns custom-functions brauchen:
    - `threat-p3-functions.ts` (für TM-A* P3 patterns)
    - `client-p3-functions.ts` (für CL-* P3 patterns)
    - `evolution-p3-functions.ts` (für EV-* P3 patterns)
    - `standards-p3-functions.ts` (für RFC2-* P3 patterns)
    - empty buckets = kein file (nicht alle Lenses brauchen custom-functions in P3)

**Pre-Condition:** Welle C done. F8 (`source-verbatim`/`verified-at` schema) done.

**Subagent-Welle:** 5+ parallele Subagents (T16c + T18c + T25 + T-Sentinels + T-F7 + ggf. T-Funcs als orchestrator-Welle).

**Acceptance-Criteria-Erweiterung gegenüber Plan-Doc-Original:**
- 3 sentinel-walkers built + tested + wired in `walkers/index.ts`
- F7-coverage ≥80% auf alle ~230 active rules (P1+P2+P3) — nicht "in Welle E messen"
- Custom-functions konsistent per `<lens>-p<priority>`-Pattern (rename done)

**Begründung Erweiterung:** Welle C hat 3 sentinel-rules emittiert die auf nicht-existente Walker zeigen — ohne Walker-Impl sind sie unfertig. Maximalismus-Direktive: nichts halb-fertig lassen. F7 + Custom-Functions-Cleanup analog.

---

## 8. Welle D2 — P4 + P5 Niche/Vendor Patterns (NEU für Maximalismus)

**Inhalt** (per `implementation-priority.md` P4 + P5 tables, ~25 patterns):
- **P4 Niche/Low-Frequency** ~15 patterns: RFC2-71/72/73 (Server-URL host/scheme/path lowercase), RFC2-75/76 (Custom JSON / vendor media-types), RFC2-79 (Top-level media-type IANA-registered), RFC2-80 (charset on application/json redundant), RFC2-95 (Retry-After grammar), RFC2-96 (503 → Retry-After SHOULD)
- **P5 Vendor-Extension/Information-only** ~10 patterns: RFC2-50, RFC2-77, RFC2-83, RFC2-89, RFC2-103/105, CL-60, L6-2, L9-7, F-10, F-18, SC-20

**Pre-Condition:** Welle D done.

**Output:** P4/P5-Patterns als zusätzliche YAML-Rules in existing rulesets ODER in eigener `apiq-ruleset-niche.yaml`. Many sind off-by-default/info-tier.

**Maximalismus-Begründung:** "alles was geht" inklusive Niche-Patterns. Niedriger Aufwand pro Pattern (alle S = small, Spectral DSL).

---

## 9. Welle E — Putz-Niveau-Benchmark T24

**Inhalt:** ehrlicher Test der "27/28 Springer-Delphi covered + 1 partial" Behauptung. apiq gegen 4 Reference-Specs, prüfe dass alle 28 high-importance Springer-Delphi-Rules entweder fire OR explicit-skip-with-rationale haben.

**Pre-Condition:** Welle D2 done — alle target-Rules implementiert.

**Output:**
- `specs/big-spec-architecture-spike-stage-a-putz-benchmark.md` — Test-Report
- CI-Job: falls eine Springer-Delphi-Rule nicht fire + nicht explicit-skip → CI-Fail
- Update CLAUDE.md / Memory: "27/28 covered + 1 partial" wird zu **verified statement** (oder corrigiert auf actual Zahl)

### T-Stripe-Perf (NEU 2026-05-09 post-Welle-D)

**Trigger:** Welle-D Phase-3-integration — `run-deterministic-layer.test.ts` stripe-full-test brauchte 23.7 min (vorher <10 min). 12-yaml ruleset (342 rules / 91 custom-fns) ist 2.4× workload vs pre-Welle-D 6-yaml (170/25). Test-timeout temporär auf 30 min gebumpt.

**Sub-Task:**
- Profile `runDeterministicLayer(stripe-full-spec)` — identify bottleneck-rules / custom-functions (CPU-time pro rule/function)
- Suspect-classes: O(n²) custom-functions (schema-similarity walker, recursive-schema-walkers, multi-step pairwise-functions), JSONPath-compilation overhead, repeated-yaml-load (cachable?)
- Optimization-options: rule-batching, single-pass JSONPath-compile + cache, lazy-eval for hint-severity-rules, parallelization
- Target: stripe-full-test wieder unter 10 min (oder unter Welle-T's CI-time-budget)
- Output: `specs/big-spec-architecture-spike-stage-a-stripe-perf-investigation.md` mit profiling-data + applied-optimizations

---

## 10. Welle Q — Code-Quality-Cleanup (orthogonal — parallel-möglich)

Diese Wellen-Punkte sind unabhängig von Coverage/Konkurrenz und können parallel zu M/F/C/D laufen:

### Q1 — codegen-validation Output-Aggregation
**Pre-Condition für Phase B.** Aktuell 9.834 separate Findings auf github-rest. Ziel: 1 category-aggregate `{occurrences: 9834, locations: [top-10]}`. Decision: pragmatisch output-mapper-side collapse all `codegen:*` findings zu 1 row, kein Modul-Code-Change.

### Q2 — OPENAI_API_KEY env-loading Fix
`stage-a-validation.ts` lädt `.env` aber findet `OPENAI_API_KEY` nicht. Embedding-Scorer fehlt deshalb. Quick fix.

### Q3 — Layer-Tagging cosmetic
DetectorLayer-Type um `'module-class'` erweitern. modules tagen sich aktuell als `walker-statistical`. perLayer-reporting undercount-t module contribution.

### Q4 — Integration-Tests auf weitere Specs (ergänzt durch Welle T)
Aktuell nur dnd5eapi getestet. Add stripe / pagerduty / github-rest integration-tests (mit längerer timeout für codegen). Welle T baut darauf auf mit Snapshot-Tests + CI-Pipeline.

### Q5 — STAGE-A-PREDICTIONS.md stale-marker
Header anhängen: "Phase-0 hypothesis. W4 measured large negative deltas (-20.7pp bis -61.1pp). Loader at `stage-a-validation.ts:162` reads this file; do not regenerate without re-running bulk-sweep with updated hypothesis."

### Q-Subset wann
Q1 ist Pre-Condition für Phase B → muss vor Phase B done. Q2-Q5 sind nice-to-have. Q ist orthogonal — kann parallel zu Welle M oder F laufen.

---

## 11. Welle T — Test-Coverage (NEU für Maximalismus)

Aktuell genau **1 Integration-Test** (run-deterministic-layer.test.ts auf dnd5eapi). Bei Maximalismus: vollständige Test-Coverage-Maximierung.

### T1 — Integration-Tests auf alle 4 Specs

**Ziel:** je 1 Integration-Test pro `openapi-examples/{stripe-full,pagerduty-full,github-rest,dnd5eapi}/spec.json`. Pro Test:
- runDeterministicLayer end-to-end
- Findings > expected-threshold
- Per-detector breakdown sane (no detector dominates absurd, no detector silent if expected)
- Duration < timeout (codegen-validation auf stripe-full kann 30s+ — angemessener timeout)

**Pre-Condition:** Welle C done (stable Rule-Set). Vorher würde Test-fixtures bei jeder neuen Rule brechen.

### T2 — Snapshot-Tests pro Module-Output

**Ziel:** für jedes der 15 wired Module-Classes ein Snapshot-Test der das DetectorFinding[]-Output gegen einen baseline-snapshot vergleicht. Hilft regression-detection bei Welle C/D Erweiterungen — wenn ein neuer Rule die Output-Shape eines Moduls ändert, snapshot-test fängt das.

**Tools:** Vitest's snapshot-feature (`expect(...).toMatchSnapshot()`).

### T3 — CI-Pipeline mit Putz-Benchmark + Source-Verify als Gates

**Ziel:** GitHub Actions workflow der:
1. `npx vitest run` (alle 791+ tests)
2. `npx tsx scripts/spike/eval/stage-a-validation.ts` (Coverage-Run, fail-bei-Regression vs baseline)
3. T24 Putz-Niveau-Benchmark als Gate (28/28 Springer-Delphi-Rules fire)
4. T25 Source-Verify-CI als Quarterly-Cron

**Pre-Condition:** T2 done. Welle E done (T24 verfügbar). Welle D done (T25 verfügbar).

---

## 12. Welle Doc — Documentation (NEU für Maximalismus)

### Doc1 — dev-README für scripts/spike

**Aktuell:** kein README für `scripts/spike/`. Engineer der das Repo öffnet hat keinen Entry-Point.

**Ziel:** `scripts/spike/README.md` mit:
- Architecture-Overview (Spectral + Walkers + Module-Classes Layer)
- runDeterministicLayer Public-API
- Wie man neue Rules / Walker / Module hinzufügt
- Test-Workflow + Eval-Workflow
- Mining-Source-Mapping (verweist auf rules-brainstorm.md)
- Severity-Schema-Erklärung

### Doc2 — Architecture-Diagram

**Ziel:** ASCII oder Mermaid Diagramm des Stage-A-Pipeline-Flows. Zeigt:
- Spec-Input → `runDeterministicLayer` → 3 Layer-Runner → Findings → Output-Mapper → Final-Findings
- Cross-Cutting: Severity-Schema + IANA-Registry + Spectral-Functions
- Phase-B-Connection (Stage-A-Output als Pre-pass-Input)

**Output:** in `scripts/spike/README.md` eingebettet plus standalone `docs/architecture-stage-a.md`.

### Doc3 — Contributor-Guide

**Ziel:** wie ein Engineer (extern oder intern) eine neue Rule beiträgt:
- Source-mining-Vorbereitung (welcher Lens? welche Source?)
- Rule-Schreiben (YAML-template oder Walker-template)
- Severity-Metadata-Anforderungen
- Test-Schreiben (inline-fixtures oder spec-based)
- Welle/PR-Process

**Output:** `CONTRIBUTING.md` für scripts/spike-contributors.

---

## 13. Welle Arch — Architectural Refactoring (NEU für Maximalismus)

Per `critical-review.md:585`: "Architectural directory refactor (post-spike-lock candidate): current flat `scripts/spike/deterministic/` could be split into `classifiers/` + `aggregators/` + `modules/` + `rules/` to reflect the 8-rule-classes + 3-arch-elements view."

### Arch1 — flat → classifiers/aggregators/modules/rules subtrees

**Aktuell:** `scripts/spike/deterministic/*.ts` flat-tree mit 22 files. Plus `walkers/` + `iana/` + `spectral-functions/` + `modules/` als sub-trees.

**Ziel-Struktur** (per meta-insights 8 functional rule-classes + 3 architectural elements):
```
scripts/spike/deterministic/
├── classifiers/         # Stage-1 classifiers (kein Finding-Output, gate other detectors)
│   ├── style-classifier.ts
│   ├── json-schema-draft-detector.ts
│   ├── oauth2-flow-classifier.ts ✓ (T12 promoted Welle-D-task-22, 2026-05-09)
│   └── media-type-iana-classifier.ts ✓ (T13 promoted Welle-D-task-22, 2026-05-09)
├── aggregators/         # Statistical aggregators (Walker-class)
│   └── (was walkers/ ist — umbenannt für Konsistenz)
├── modules/             # Deep-mechanic modules (already existing)
│   ├── secret-scanner.ts
│   ├── webhook-signature.ts
│   ├── http-protocol-pairings.ts
│   ├── problem-json-validator.ts
│   ├── per-style-coherence.ts
│   ├── ajv-validator.ts
│   ├── codegen-validation.ts
│   ├── cross-reference-consistency.ts
│   ├── duplicate-schemas.ts
│   ├── naming-classifier.ts
│   ├── path-template-parser.ts
│   ├── ref-graph.ts
│   ├── spec-diff.ts (orphan)
│   └── index.ts (runModules)
├── rules/               # YAML-rule-sets
│   ├── apiq-ruleset.yaml
│   ├── apiq-ruleset-threat-p1.yaml
│   ├── apiq-ruleset-client-p1.yaml
│   ├── apiq-ruleset-evolution.yaml
│   ├── apiq-ruleset-threat-p2.yaml (Welle C)
│   ├── apiq-ruleset-client-p2.yaml (Welle C)
│   └── apiq-ruleset-niche.yaml (Welle D2)
├── spectral-functions/  # already existing
├── iana/                # already existing
├── infra/               # severity-schema + types + output-mapper + spectral-runner
│   ├── severity-schema.ts
│   ├── types.ts
│   ├── output-mapper.ts
│   └── spectral-runner.ts
└── index.ts             # public API entry
```

**Refactor-Approach:**
- Subagent moves files + updates imports
- All tests must continue green
- spec-diff bleibt orphan in modules/ (oder eigener `experimental/` subtree?)

**Pre-Condition:** Welle F done (Schema-Erweiterungen abgeschlossen, sonst doppelarbeit beim refactor).

**Status (2026-05-09 Welle-D-task-22):** T12+T13 classifier-promotions DONE. Beide files git-mv'd `modules/` → `classifiers/`, function-rename `runOAuth2FlowValidator → runOAuth2FlowClassifier` + `runMediaTypeValidator → runMediaTypeClassifier`. Konsumenten-update: `modules/index.ts` + `eval/profile-deterministic-layer.ts` + Test-files (renamed + updated). Output-shape (`DetectorFinding[]`) bleibt unverändert — konsistent mit Präzedenz `json-schema-draft-detector.ts` (also in classifiers/, also returns DetectorFinding[]). `detectorId`-Telemetry-Prefixes (`oauth2-flow-validator:*`, `media-type-iana:*`) bleiben für reference-findings-Stabilität. Tests: 49/49 pass post-rename.

### Arch2 — DetectorLayer-Type erweitert um module-class

Aktuell taggen Module-Findings sich als `walker-statistical`. Erweitere `DetectorLayer` um `'module-class' | 'classifier'` (falls Arch1 Classifier-Subtree introduces als own layer).

### Arch3 — Output-mapper-aggregation für codegen-validation (Q1 wenn nicht früher schon done)

Q1 macht das. Wenn Q1 nicht früher passiert ist, hier in Welle Arch konsolidieren.

---

## 14. Welle R — Reference-Hardening

### R1 — `isPureSpectralDetectable` Re-Classification (VERPFLICHTEND)
Aktuell sind 97 References LLM-authored, never human-hardened. Coverage-Messung ist meta-circular. R1 ist mid-step: ehrliches `isPureSpectralDetectable: true | partial | false` tagging plus optional `expected-detector-id` (welcher Stage-A-Detektor sollte das catchen).

**Output:** updated `openapi-examples/{stripe-full,pagerduty-full,github-rest,dnd5eapi}/reference/findings.json`.

### R2 — Second-LLM-Review (VERPFLICHTEND für Maximalismus)
**Bei Maximalismus:** zweiter LLM-Reviewer (anderes Modell als Phase-0-Author — z.B. wenn Original LLM Sonnet 4.6 war, dann GPT-5 oder Opus 4.7) reviewed die References. Disagreements → human-flagged-for-review-list.

**Optional:** Domain-Expert-Review für je 2-3 References pro Spec — falls verfügbar (ohne external dependency).

### R-Decision-Point
Beide R1 + R2 verpflichtend für Maximalismus. References-Authenticity wird damit Multi-Model-cross-validated.

---

## 15. Welle V — Validation

### V1 — 4-way Cross-Linter-Parity Smoke

**Bei Maximalismus erweitert auf 4-way:**
- **Vacuum** (default rules) auf 4 Specs
- **Redocly-CLI** default-config auf 4 Specs
- **IBM OpenAPI Validator** auf 4 Specs
- **Spectral mit OWASP-Spectral-Rulesets standalone** auf 4 Specs
- Vergleich gegen apiq Stage-A-Output

**Comparison-Tabellen pro Spec:**
- Findings-count per linter
- Top-detectors per linter
- Detector-overlap (welcher detector findet was — Venn-diagram)
- apiq-only catches / Konkurrenz-only catches

**Output:** `specs/big-spec-runs/eval/CROSS-LINTER-PARITY.md` — defense für "best-in-class deterministic linter"-Claim. Plus: detected-but-uncatched-by-apiq Lücken sind input für post-V Welle C′ falls nötig.

### V2 — Final Stage-A Validation Re-Run
`stage-a-validation.ts` final auf alle 4 Specs (mit Embedding-Scorer dank Q2 + R-hardened references). STAGE-A-RESULTS.md final regenerate. Final Coverage-Numbers post-M+F+C+D+D2+E+Q+T+Doc+Arch+R.

### V-Decision-Point
**Nach V1+V2 echte Phase-B-Decision.** Drei mögliche Outcomes:
1. **Stage A schlägt Konkurrenz + Coverage gegen R-hardened references >50%:** Phase-B-Engineering ist klare next step
2. **Stage A pari mit Konkurrenz aber Coverage stagniert <40%:** Phase-B trotzdem Pflicht für Differentiator-Test
3. **Stage A signifikant unter Konkurrenz:** Welle C′/D′ gezielt + erst dann Phase B

---

## 16. Phase B — LLM-Pipeline-Engineering (eigentlicher Spike-Lock-Test)

Per `phase-b-design.md`. Pre-Conditions:
- Alle Wellen oben done (M+F+C+D+D2+E+Q+T+Doc+Arch+R+V)
- F1 autoFixSafe-Tag implementiert
- Q1 codegen-aggregation done (Token-Budget-Math)
- V1 Cross-Linter-Parity-Output verfügbar (Konkurrenz-Diff für Phase-B-Prompt-Engineering)

**Bei Maximalismus erweitert:**
- **N=3 auf alle 4 Specs** (statt N=3 + N=1×3 in v1) für statistische Confidence-Intervalle. Total ~12 Runs.
- **v7-Prompt-Iteration** falls v6 PARTIAL — direkt eingeplant statt optional.

**Output:** Coverage post-Phase-B vs Stage-A-only. Differentiator-Test PASS/PARTIAL/FAIL per `phase-b-design.md §7 Success-Criteria`.

---

## 16a. Welle M2 — Stage-B + Agent + MCP-Mining (NEU 2026-05-07)

**Pre-Condition:** Welle V done. **Position:** nach V, vor Phase B. **Mode:** brainstorming (Source-Selection braucht Diskussion).

**Begründung:** Mining-Round-3 lieferte 97.7% Stage-A-territory + 2.3% Stage-B-territory patterns aus 871 total. Wenn apiq's Vision Agent-Interaction-Quality ist (siehe §0), dann ist diese Verteilung untertaillered. Plus: Lens-9 (AI-Agent-Consumability) + Lens-10 (Operational-Metadata) zusammen nur 30 patterns = 3.4% des Frameworks. Welle M2 schließt diese Lücke gerichtet.

**Mining-Goals (NICHT unbounded discovery — gerichtetes Mining):**

1. **+30-50 Lens-9-patterns** (AI-Agent-Consumability erweitert):
   - Tool-naming-quality (ambiguous-verb-detection, generic-name-detection wie `process`/`handle`/`runTask`)
   - Parameter-ambiguity (synonymous-parameter-detection, unclear-default-detection)
   - Description-actionability (semantic-richness-für-tool-call, nicht nur length)
   - Promptability-score (wie einfach kann LLM aus summary+description+param-names korrekten Tool-Call konstruieren)
   - Hallucination-risk-on-this-spec (welche Felder sind so unklar dass LLMs likely-hallucinieren)
   - Retry-recovery-quality (sind error-responses informativ genug für agent-self-correction)

2. **+15-20 Lens-10-patterns** (Operational-Metadata erweitert):
   - Concrete patterns für Sunset-Header (RFC 8594), Deprecation-Header (RFC 9745), X-Request-Id, RateLimit-* (RFC 9745bis)
   - Per-API-tenant rate-quota-axis (R3-PM-OP-01 Cloudflare-self-DoS als seed-pattern)
   - Brownout-schedule patterns (R3-PM-EV-07 GitHub als positive-marker)

3. **Lens-11 Discovery (Agent-Tool-Disambiguation, conditional):** mining nach patterns die Tool-Selection-Confidence + Tool-Collision adressieren. Wenn ≥10 patterns gefunden → Lens-11 wird promoviert. Wenn <10 → patterns werden in Lens-9 integriert.

**Sources (curated für gerichtetes Mining — nicht discovery-unbounded):**

- **Anthropic Claude tool-use docs + cookbook** (anti-patterns aus claude-cookbook + tool-use-best-practices)
- **OpenAI function-calling docs + community-postmortems** (function-calling-failures aus dev-blogs)
- **MCP-server design discussions** (Anthropic MCP-spec + GitHub MCP-server-Examples + Slack/Linear/Notion MCP-tool-design)
- **Agent-failure-postmortems:** "we shipped tool-calling, here's what broke" engineering-blog-posts
- **Cursor / Cline / Continue / Aider tool-design-discussions** (IDE-agents haben extreme tool-collision-experience)
- **Academic papers 2024-2026:** "tool-use reliability", "agent-API interaction", "function-calling-failures"

**Acceptance Criteria:**

1. ≥30 Lens-9 + ≥15 Lens-10 + Lens-11-Decision (promoviert oder integriert)
2. ≥80% verbatim-citation-rate (web-verifiable)
3. ≥5 Stage-A-detectable patterns aus Lens-9-Mining die in Welle C/D/D2 als concrete Spectral-Rules implementierbar sind (sonst würde M2 reine Phase-B-prompt-context-Anreicherung sein, was zu wenig wäre)
4. Phase-B-prompt-context-bundle: structured retrieval-bundle für Phase B's v6-prompt mit "diese Patterns sind agent-relevant für diese Endpoint-Klasse"
5. Round-4-Decision (M2 als finaler Mining-Pass) dokumentiert

**Output:**

- `specs/E09-w-m2-agent-mining.md` (spec)
- `specs/big-spec-architecture-spike-stage-a-mining-round4-{agent,mcp,toolcalling}.md` (3 source-files)
- Master `rules-brainstorm.md` extended um "Round-4 Additions"-Section
- `scripts/spike/data/patterns.json` regen mit Lens-9/10/11 expansion
- Plus eventuell: `scripts/spike/data/agent-prompt-context-bundle.json` als Phase-B-prompt-substrate

**Risk-Mitigation:** Welle M2 ist post-V — wenn Cross-Linter-Validation zeigt dass apiq schon ist agent-quality-leader auch ohne M2, könnte M2 conditionally auf "Phase B braucht es" reduziert werden. Wenn V zeigt dass Konkurrenz agent-quality besser hat, ist M2 verbindlich.

---

## 16b. Welle Z — MCP-Input-Format-Adapter (NEU 2026-05-07)

**Pre-Condition:** Welle V done. **Position:** parallel zu Welle M2 oder Phase B. **Mode:** direkt (klar definiert).

**Begründung:** Wenn in 3-5 Jahren MCP-server-Schema das primary-Distribution-Format für AI-zugängliche APIs wird, wird apiq's MCP-Eingabe-Format-Support load-bearing. Ohne MCP-Eingabe ist apiq dann "Linter für 1-of-3-Input-Formats" statt "Agent-Quality-Infrastructure". Welle Z addiert MCP-Eingabe ohne OpenAPI-support aufzugeben.

**Was Welle Z baut:**

1. **MCP-Server-Adapter:** `scripts/spike/lib/mcp-adapter.ts` — fetched MCP-server's `tools/list` + tool-Schemas, konvertiert in internes `Spec`-Format-equivalent (Pseudo-OpenAPI repräsentation). Oder: MCP als first-class-format mit eigenem Detector-Layer-Path.

2. **Tool-Collision-Detector:** `scripts/spike/deterministic/tool-collision.ts` — embedding-similarity zwischen Tool-Descriptions + Name-Patterns + Parameter-Schemas. Threshold-based collision-flagging. **Wiederverwendung der `findRelatedPatterns`-Infrastruktur aus Welle M5.**

3. **Naming-Quality-Walker für MCP:** `scripts/spike/deterministic/walkers/mcp-naming-quality.ts` — generic-verb-detection, ambiguous-tool-name-flagging, namespace-hygiene-checks.

4. **AI-Readiness-Score (composite):** `scripts/spike/lib/ai-readiness-score.ts` — combines Lens-9 + Lens-10 + Tool-Collision + Naming-Quality findings into 0-100 composite-score. Für UI-Header-Display + benchmarking.

**Acceptance Criteria:**

1. apiq akzeptiert MCP-server-URL als Input neben OpenAPI-spec-File-upload
2. Tool-Collision-Detector findet ≥1 collision in einem multi-tool-MCP-server (test-fixture)
3. AI-Readiness-Score ist berechenbar für: einzelne OpenAPI-spec, einzelner MCP-server, Vergleich zwischen beiden
4. Bestehende OpenAPI-pipeline-tests bleiben grün (Welle Z ist additive, nicht ersetzend)
5. Welle V (Cross-Linter) weiterhin nur OpenAPI-comparison; MCP-comparison wäre Welle V′ oder v1.1+

**Out of Scope:**

- Runtime simulations (Phase 4 von ChatGPT-Brainstorming) — v2/v3-territory
- Continuous agent observability (Phase 5) — v2/v3-territory
- MCP-server-registry / public scoring — out of v1-scope (potentielle v1.5-Marketing-Erweiterung)
- Live-MCP-server-execution / actual-tool-calling — out of scope (security + latency-Implikationen für statisch-Eval)

---

## 17. Append-Workflow für Mining-Round-N

Mining-Round-3 wird in `mining-round3.md` geschrieben. Falls nach M1+M2 weitere Rounds sinnvoll sind:

**Round-N Append-Pattern:**
1. Neue Datei `mining-round{N}.md` (z.B. `mining-round4.md`)
2. Header dokumentiert: Sources, Mining-Pass-Datum, Erwartete-Funde-Range, Decision-Trigger ("nur wenn...")
3. Subagent-Briefing nutzt curated source-list (nicht unbounded blogs/conference)
4. Output integriert sich in `rules-brainstorm.md` Master-Konsolidierung
5. Falls neue Lenses gefunden: `meta-insights.md` Round-N-Promotion + Severity-Schema-Update + Welle F-Erweiterung

**Decision-Trigger für Round 4+:**
- Round 3 + Corpus zusammen >40 neue Patterns (Hint dass Mining nicht maxed-out)
- ODER neue Source-Familie verfügbar (z.B. neuer API-Design-Standard, neue Compliance-Framework)
- ODER PRD-Reframe macht neuen Lens-Bereich relevant

---

## 18. Resume-Trigger für nächste Sessions

**Resume-Trigger:** "weiter mit restwork-plan v2" oder "stage-a status check" oder "welle X starten" (z.B. "welle M starten", "welle F starten").

**Standard Resume-Procedure:**
1. CLAUDE.md status-block lesen (zeigt aktuellen Welle-Stand)
2. Diesen Plan-Doc v2 lesen
3. Memory-File `~/.claude/projects/.../memory/project_epic09_spike_handoff.md` lesen
4. Letzten Commit + git-status prüfen (ob laufender Welle-Stand sauber ist)
5. Nächste Welle identifizieren basierend auf Pre-Condition-Chain in §3-Tabelle
6. `/spec_ind w-{welle}-{slug} "<context-prompt>"` für die nächste Welle
7. `/dev <epic-spec>` ausführen

**Falls eine Welle interrupted wurde:**
- Subagent-Reports (falls noch verfügbar) prüfen
- Working-tree git-status prüfen
- Tests laufen — wenn nicht 791+ grün, identify regression
- `/dev <epic-spec>` resumed wo es aufhörte (Skill handles es)

---

## 19. Risiken + Mitigations

**Risiko 1 — Mining-Round-3+Corpus liefert <40 neue Patterns.** Dann Round-3-Maximum-Claim ehrlich + skip Round 4.
**Mitigation:** Decision-Point nach M1+M2.

**Risiko 2 — F4 (110-rule metadata promotion) findet Spectral-runner-Conversion-Lücken.** Dann F4 wird umfangreicher als der Welle-Scope sonst nahelegt.
**Mitigation:** F4 ist als Subagent-Welle parallelisiert; falls Conversion-Lücken auftauchen → spectral-runner.ts erweitern als Teil von F4.

**Risiko 3 — Welle C/D bringen zusätzliche Patterns die Round-3-Mining hätte finden sollen.** Doppelarbeit-Risiko.
**Mitigation:** Welle M+F vor Welle C+D ist genau dafür.

**Risiko 4 — Cross-Linter-Parity zeigt Vacuum/Konkurrenz schlägt apiq.** Reputations-Risk.
**Mitigation:** Honest-truth approach — wenn Lücken existieren, sind sie data für Welle C′/D′. Putzen-First-Reihenfolge minimiert dieses Risiko.

**Risiko 5 — Phase-B-Test zeigt LLM-Pipeline bringt nichts über Stage-A.** Spike-Lock-Decision-Risk.
**Mitigation:** Phase-B-Design hat dokumentierte Pass/Partial/Fail-Criteria. Falls Fail: Stage-A allein als "deterministic linter" ist trotzdem ship-bar (siehe stripe-full 62.1% — strong baseline).

**Risiko 6 — `/dev` Skill bei großen Wellen overwhelmed.** Z.B. F4 mit 110 Rule-Migrationen könnte zu groß sein.
**Mitigation:** Welle in Sub-Specs splitten (F4a F4b F4c F4d je ~28 rules). Wir sehen das nach erstem `/dev`-Run.

**Risiko 7 (NEU 2026-05-07) — Putzen-First-Tunnelblick.** Stage-A-Wellen Q/M/F/C/D/D2/E/T/Doc/Arch/R/V haben hohen Putzfokus; Risiko dass agent-readiness-vision (§0) während dieser Wellen aus dem Blickfeld gerät und nur "linter-shipping" mentality bleibt.
**Mitigation:** §0 Strategic Vision Constants ist persistent context für ALLE Wellen-Briefings. Welle M2 + Welle Z post-V als verbindlich im Plan-Doc (nicht "stretch-goals"). Memory-anchor `project_apiq_agent_readiness_positioning.md` + `feedback_no_trade_off_against_vision.md` halten Vision in jedem resume-trigger.

**Risiko 8 (NEU 2026-05-07) — MCP-Markt-Timing-Risk.** Wenn MCP-Adoption schneller wächst als erwartet, könnte v1-launch ohne MCP-Input-Format als zu-spät erscheinen. Wenn MCP-Adoption langsamer wächst, könnte Welle Z premature engineering sein.
**Mitigation:** Welle Z ist post-V positioniert (NACH Putzen) — kein Premature-engineering. Plus Welle Z ist additive, nicht-ersetzend (OpenAPI bleibt primary-input). Plus: AI-Readiness-Score in Welle Z ist eigenständig wertvoll auch wenn MCP-Markt langsam wächst.

**Risiko 9 (NEU 2026-05-07) — Lens-9 + Lens-10 Mining-Untergewichtung.** 87% der 871 Round-1+2+3-patterns sind in Lens 1-4. Wenn Vision Agent-Quality ist, ist diese Verteilung zu stark Linter-zentrisch.
**Mitigation:** Welle M2 mit explizitem Mining-Goal +30 Lens-9 + +15 Lens-10 + Lens-11-Discovery. Plus: Severity-Schema-Erweiterung in Welle F berücksichtigt Lens-9-first-class statt as-afterthought.

---

## 20. Status zum 2026-05-08

**Welle 0+A+B + W1-W4 + Welle Q + Welle M + Welle F done** (siehe `project_epic09_spike_handoff.md`).

**Aktuelle Inventur (post-Welle-F):**
- 110 active spectral rules (4 yamls) — 100% mit Source-Mapping-Comments (M4) + **100% mit `apiq-meta`-Block** (F4)
- **23 walkers** (16 baseline + 7 info-tier neu in F: SLA4OAI / capability-discovery / RFC-9727 api-catalog / RFC-9728 OAuth Protected Resource Metadata / GitHub brownout-schedule / Slack rate-limit-tier / Arazzo workflow-document)
- 15 module-classes wired (modules/index.ts) — 100% mit erweiterten JSDoc-Headers (Lens + Round + Sources)
- 5 custom spectral-functions — 100% mit JSDoc-Source-Mapping
- **Schema-Erweiterungen in `severity-schema.ts`** (Welle F): autoFixSafe, detectionPrecision, ai-agent-stakeholder, privacy-leakage/operational-metadata-missing-defectclass, RuleSourceSchema (verbatim + verifiedAt), regulatoryMapping (NIST/ASVS/CIS/GDPR/SOC2), costImpact, mttrImpact, agentReadinessImpact (Strategic-Vision-Coupling per §0), iso25010 single→array
- **Spectral-runner apiq-meta-Block read+propagate** (Welle F): customRuleApiqMeta map, buildRulesAccFromYaml propagiert apiq-meta in DetectorFinding.meta, coverage-logging mit warn-mode
- **F5 CI-coverage-gate** (`apiq-meta-coverage-gate.test.ts`): 9 tests assert ≥95% coverage per yaml + cross-yaml + alle required-fields populated
- **944 tests pass / 50 files / 2 skipped / 0 fail** (war 845 baseline post-Welle-M — +99 neue Tests aus Welle F: 45+7+41+9 inkl. severity-schema + spectral-runner-apiq-meta + 7 info-tier-walkers + F5 coverage-gate)
- **NEU**: **959 patterns** in `scripts/spike/data/patterns.json` (Round-1 388 + Round-2 375 + Round-3 108 + **Round-4 88**)
  - **Citation-coverage 80.4%** (war 12% pre-enrich) — verbatim-enrich-pass appended Source-Citations + URL für Round-1+2 patterns
  - **URL-coverage 72.4%** (war ~12%)
  - **Verbatim-coverage 23.1%** (war 12%) — intrinsic ceiling weil Master-tables keine inline-quotes haben
- **NEU**: Pattern-Knowledge-Index in `scripts/spike/eval/cache/pattern-index.json` (**763 patterns embedded**, 29.56 MB, gitignored, reproducible)
- **NEU**: API-Corpus-Analyzer-Library in `scripts/spike/eval/api-corpus-analyzer.ts` (10 Statistics)
- **NEU**: 521 healthy OpenAPI-specs in `scripts/spike/data/healthy-corpus/` (gitignored, 253 MB; reproduzierbar via `scripts/spike/download-corpus.mjs`)
- **NEU**: 7 source-families committed (book + postmortem + corpus + re-audit + conference-talk + vendor-blog + paper-rfc)

**Welle M Round-3+4 Mining-Output:**

| Round | Source-Family | Patterns | Citation-Quality | Stop-Reason |
|---|---|---:|---|---|
| R3 | Books | 51 | 100% verbatim+URL | 21 surveyed, Plausibility-Erschöpfung |
| R3 | Postmortems | 42 | 100% verbatim+URL | 36 surveyed, Plausibility-Erschöpfung |
| R3 | API-Corpus | 11 derived + 10 statistics | manifest-anchored | 521-spec saturation |
| R3 | Re-Audit Orphans | 18 (4 active + 5 OOS + 9 doc) | source-traced | 97.5% master-adoption |
| R4 | Conference-Talks | 19 (23 row-IDs) | 100% verbatim+URL | 28 talks surveyed |
| R4 | Vendor-Blogs | 33 | 100% verbatim+URL | 13 vendors surveyed; 97% de-dup |
| R4 | Academic-Papers + IETF | 32 | 100% verbatim+URL | 19 sources (11 IETF + 11 academic) |
| **Total** | | **206 candidates** | | 7 source-families |

**Top Round-3+4 Highlights:**
1. **RFC-7807 (problem+json) adoption is 0% across 518 healthy public APIs** (R3) — apiq-Lens-2 muss `hint` statt `warn` bei RFC-7807-Recommendations setzen
2. **Sunset/Deprecation headers (RFC-8594/9745) at 0%** (R3) — strongest empirical-gap, perfect Stage-A finding-class für Lens-3+10
3. **22.2% of healthy public APIs leave write-ops unsecured** (R3) — Lens-1 catch-all rule justification
4. **RFC 9728 OAuth Protected Resource Metadata (April 2025)** (R4-IETF) — 0% adoption-baseline, foundation für MCP-OAuth-discovery
5. **Hasan et al "MCP Tool Descriptions Are Smelly" arXiv Feb 2026** (R4-AP) — 97.1% MCP-tools haben ≥1 quality-smell, 56% Unclear-Purpose. Direkt vision-aligned (Plan-Doc §0).
6. **RFC 9745 Deprecation Header (März 2025)** (R4-IETF) — Standards-Track, neuer header separate von Sunset, severity-upgrade-evidence
7. **Date-versioning 5+ vendor consensus** (R4-VB) — Stripe + GitHub + Square + Twilio + Heroku
8. **Stripe webhook events not order-guaranteed** (R4-VB) — webhook-payload-schemas brauchen `timestamp`-field
9. **Kheyrollahi Transparent-Server pattern** (R4-CT) — `db_id`/`mongo_id`/`pgsql_*` in property-names = leakage-anti-pattern
10. **Kilcommins Arazzo workflow-document positive-marker** (R4-CT) — neuer Lens-9-pattern für AI-agent-consumability

**Lens-Coverage-Lift (Round-2 → Round-3 deltas):**

| Lens | Round-2-Master | Round-3-Add | Total |
|---|---:|---:|---:|
| 1 Threat-Modeling | ~70 | +15 | ~85 |
| 2 Standards-Compliance | ~95 | +7 | ~102 |
| 3 Evolution-Friction | ~58 | +23 | ~81 (highest lift) |
| 4 Client-Friction | ~78 | +13 | ~91 |
| 5 Style-Coherence | 42 | +7 active + 4 OOS | ~53 |
| 6 Privacy-Data-Class | ~6 | +7 | ~13 |
| 7 Operations | ~5 | +10 | ~15 |
| 8 Internal-Consistency | ~8 | +9 | ~17 |
| 9 AI-Agent-Consumability | 8 | +7 | 15 |
| 10 Operational-Metadata | 6 | +9 | 15 |

**Round-4-Decision (D14):** Trigger erfüllt (122 patterns >40 + 3 neue Source-Familien). ABER: Round-3 saturates Stage-A pattern-mining. Round-4 ist **conditional-on-user-decision** — candidate-sources: Conference-Talks (recht-resourced), Vendor-Engineering-Blogs (Stripe/GitHub/Twilio), Recent-Papers 2024+, non-English-postmortems, governmental APIs. Dokumentiert in master `rules-brainstorm.md` Round-3-Section.

**Coverage post-Welle-Q** (unverändert; Welle M ändert keine Pipeline-Code, nur Mining-Output + Code-Comments + neue Eval-Tools):

| Spec | Predicted | Jaccard | Embedding | Delta vs Predicted |
|---|---:|---:|---:|---:|
| stripe-full | 82.8% | 62.1% | 62.1% | -20.7pp |
| pagerduty-full | 90.9% | 30.4% | **69.6%** | -21.3pp |
| dnd5eapi | 85.7% | 35.7% | **85.7%** | **+0.0pp (= Prediction)** |
| github-rest | 86.9% | 25.8% | **64.5%** | -22.4pp |

**Strategischer Update post-M:** Welle M war Putzen-First-Maximierung von Mining-Coverage, NICHT Coverage-lifter (Master-rules unverändert). Mining ist jetzt ehrlich maxed-out für Stage-A. Welle F (Framework-Optimization) hat 122 Round-3-Patterns + patterns.json + pattern-index als Substrate für 110-rule-metadata-promotion + autoFixSafe-tagging + Schema-Erweiterungen genutzt.

**Strategischer Update post-F:** Welle F hat das Stage-A-Framework auf Maximum gebracht: **110/110 rules mit vollständigem apiq-meta-Block** + 7 neue info-tier walkers + Schema-Erweiterungen (autoFixSafe + detectionPrecision + RuleSourceSchema verbatim/verifiedAt + agentReadinessImpact strategic-vision-coupling) sind Pre-Conditions für Phase-B. F5 CI-coverage-gate fail't bei <95%.

**Strategischer Update post-C (2026-05-08):** Welle C hat **alle ~60 P2-Differentiator-Patterns** in 2 neuen YAML-Files implementiert: `apiq-ruleset-threat-p2.yaml` (36 rules + 15 custom-functions) + `apiq-ruleset-client-p2.yaml` (25 rules + 5 custom-functions). 100% apiq-meta-Coverage auf alle ~170 active rules across 6 yamls. F5-coverage-gate erweitert. P2 catched die Patterns die mature linters (Vacuum/Redocly/Spectral-OWASP) NICHT catchen — Lens-1+4 USP-territory. Tests +187 (~1130 / 4 skip / 0 fail). Welle C war Differentiator-Pattern-Implementation; empirisch-gemessene Coverage-lift gegen Reference-Specs erfordert separate measurement-pass nach Welle V.

**Nächster Schritt:** **Welle D starten** — P3 Trail (T16c+T18c ~60 Threat+Client-rules + T25 Source-Verify-CI). Plan-Doc §7. Pre-Condition Welle-C done erfüllt. Resume-Trigger: "welle d starten".

**Strategischer Update post-D2 (2026-05-10):** Welle D2 done — Pre-D2-Audit zeigte 15 von 26 Plan-Doc-§8-Patterns bereits implementiert in vorigen Wellen (Welle Arch+ T13 media-type-iana, Welle B http-protocol-pairings, Welle D standards-p3, Welle F info-tier walkers, privacy-data-class). D2 deduplicate + implementierte nur 11 echt-neue P4/P5-Patterns als 12 rules (F-18 split in length+boilerplate-modes per Maximalismus-Direktive für full-coverage des dual-mode bloated-description-functions) in `apiq-ruleset-niche.yaml`. 11 neue custom-functions in `spectral-functions/niche-functions.ts`. F5-coverage-gate erweitert auf 12 yamls. Reconciliation-Pass: 6 patterns.json severityHypothesis-Updates auf yaml-truth (Welle-Arch+ A1 drift-baseline blieb 18 = no regression). Tests +542 (2230 → 2772 / 4 skip / 3 pre-existing-flakes unter parallel-load).

**Nächster Schritt nach D2:** **Welle E starten** — T24 Putz-Niveau-Benchmark gegen 28 Springer-Delphi-Rules. Pre-Condition Welle-D2 done erfüllt. Plan-Doc §9. Welle T (Test-Coverage all-specs) parallel-möglich. Resume-Trigger: "welle e starten".

---

## 21. Welle-Status-Tracker

Wird bei jedem `/dev`-Run aktualisiert.

| Welle | Spec | /dev gelaufen | Tests grün | Commit | Notes |
|---|---|---|---|---|---|
| Q | `specs/E09-w-q-code-quality-cleanup.md` (+ `*-results.md`) | ✓ 2026-05-06 | 802/2 skip | `c8f8658` (feat) + `4560a2a` (docs) | done; 4 parallele Subagents (q1+q3+q2q5+q4); Q1 codegen-aggregation + Q2 env-fix + Q3 module-class layer-tag + Q4 3 integration-tests + Q5 PREDICTIONS stale-marker |
| M | `specs/E09-w-m-mining-optimization.md` (+ `*-brainstorming.md` + `*-results.md`) | ✓ 2026-05-07 R3 + R4 | 845/2 skip (war 806 baseline) | `465177f` (R3-feat) + `593d6b7` (R4-feat) | done; 12 parallele Subagent-Phasen (R3: 8 + R4: 4); **R3: 122 patterns** (51 books + 42 postmortems + 11 corpus + 18 reaudit) + **R4: 88 patterns** (19 conferences + 33 vendor-blogs + 32 papers); Total 959 patterns in patterns.json (Round-1+2+3+4); Citation-coverage 80.4% post verbatim-enrich; Pattern-Knowledge-Index 763 entries; 110/110 YAML rules + 5/5 functions + 15/15 module-headers mit Source-Mapping; 8 alte Mining-Files zu Stubs konsolidiert; Round-5-Decision: skip (Mining maxed-out aus discovery-unbounded; Welle M2 post-V bleibt geplant für gerichtetes mining) |
| F | `specs/E09-w-f-framework-optimization.md` (+ `*-brainstorming.md` + `*-results.md`) | ✓ 2026-05-08 | 944/2 skip (war 845 baseline) | `c635ac3` (feat) | done; 8 parallele Subagent-Phasen über 4 Phases; **Phase 1A** severity-schema +158 lines (+45 tests, autoFixSafe + detectionPrecision + ai-agent stakeholder + privacy-leakage/operational-metadata-missing defect-classes + RuleSourceSchema verbatim/verifiedAt + regulatoryMapping NIST/ASVS/CIS/GDPR/SOC2 + costImpact/mttrImpact + agentReadinessImpact strategic-vision-coupling + iso25010 single→array migration); **Phase 1B** spectral-runner +95 lines (+7 tests, ApiqMetaYamlBlock interface + customRuleApiqMeta map + buildRulesAccFromYaml propagiert apiq-meta + coverage-logging + warn-mode); **Phase 1C** 7 info-tier walkers +650 lines (+41 tests; SLA4OAI + capability-discovery + RFC-9727 api-catalog + RFC-9728 OAuth Protected Resource Metadata + GitHub brownout-schedule + Slack rate-limit-tier + Arazzo workflow-document); **Phase 1D** 6 walker/module files migrated (18 enum-renames + 23 iso25010-array-wraps); **Phase 2A-D** 110 YAML rules apiq-meta-promotion (4 parallele Subagents per yaml: apiq-ruleset.yaml 27/27 + threat-p1 26/26 mit regulatoryMapping NIST/ASVS/CIS + client-p1 27/27 mit konkretem codegen-targets per F7 + evolution 30/30 mit direction structured per F3); **Phase 3 F5** apiq-meta-coverage-gate.test.ts CI-gate ≥95% coverage (+9 tests); **Phase 4** full-suite-verify + commit + doc-sync; Round-3+4 severity-upgrades applied (EV-1/F-1 hint→warn per RFC 9745, EV-5/6/14/17/23 hint→warn, EV-18 warn→hint); 110/110 = 100% YAML-rules tragen apiq-meta-Block |
| C | `specs/E09-w-c-p2-spectral-rules.md` (+ `*-results.md`) | ✓ 2026-05-08 | ~1130 / 4 skip / 0 fail (war 944 baseline; +187 neue Tests) | `e62ff05` (feat) | done; 2 parallele Subagents (T16b + T18b) + Phase-2-Integration; **T16b apiq-ruleset-threat-p2.yaml** 36 rules (Y-1/8/10/12/13/14/15/19/21 + TM-A2/5/7/9/12/13/14/18/28/35/36/45/46/47 + RFC2-1/2/3/11/conditional-bundle/32/58/59/65/69/70/74/97) + 15 custom-functions in `threat-p2-functions.ts`, 100% NIST+ASVS regulatoryMapping (Lens-1 mandatory), 83 tests; **T18b apiq-ruleset-client-p2.yaml** 25 rules (CL-4/5/7/9/13/15/17/18/21/22/24/25/29/35/48/54/56/64×3/77 + DOLAR F-11/12/13/14) + 5 custom-functions in `client-p2-functions.ts`, 12 rules mit concrete codegen-targets per F7, 102 tests; **Phase 2** spectral-runner liest beide neue yamls + 20 custom-functions registriert + F5 coverage-gate erweitert auf 6 yamls; 100% apiq-meta-coverage auf alle ~170 active rules |
| D | `specs/E09-w-d-p3-trail.md` (+ `*-results.md`) | ✓ 2026-05-09 | 1681+ / 4 skip / 0 fail (war 1130 baseline; +~550 neue Tests) | `8c80ef7` (feat) | done; **9 parallele Subagents** (T16c + T18c + T-EV + T-RFC2 + T-Other-Lens + T-Sentinels + T25 + T-Funcs-Rename + Phase-3 + T-Verbatim-Cleanup); **5 NEUE yamls (171 P3-rules):** threat-p3 (31) + client-p3 (32) + evolution-p3 (25) + standards-p3 (36, 4 bundles) + other-p3 (47); **Total Spectral rules: 342 across 11 yamls** (war 170/6); **66 NEUE custom-functions** (Total 91, war 25): threat-p3 16 + client-p3 13 + evolution-p3 18 + standards-p3 19 + style-p3 24 + verbatim-cleanup migration-tool; **3 NEUE walkers** (CL-48 schema-similarity + F-14 pluralised-nodes + CL-24 multi-type extension in json-schema-draft-detector) für Welle-C-sentinel-resolution; **T25 Source-Verify-CI:** CLI + workflow `0 0 1 1,4,7,10 *` + 17 tests + baseline (post-cleanup: 0 drift); **T-Funcs-Rename:** multi-lang-reserved-keywords.ts → client-p1-functions.ts (file-discipline consistency); **T-F7:** language-affinity-rules ≥80% concrete codegen-targets (war 28%); **T-Verbatim-Cleanup (User-direktive Option 1):** RuleSourceSchema split `verbatim` → `quote` (T25-verifiable) + `summary` (mining-paraphrase) + `verifiedAt`; 213 entries migriert (alle zu summary, none qualified als quote per heuristic — "when in doubt, summary"); T25 baseline jetzt 0 false-drifts; **Stripe-full perf:** test-timeout 10min → 30min (12-yaml ruleset = 2.4× workload); Welle-E sub-task T-Stripe-Perf in Plan-Doc §9 dokumentiert |
| **D2** | `specs/E09-w-d2-niche-vendor.md` (+ `*-results.md`) | ✓ 2026-05-10 | 2772 / 4 skip / 3 pre-existing-flake (war 2230 baseline; +542 neue Tests via expanded P3-runs + niche-suite) | TBD (this commit) | done; **3 parallele Subagents** (funcs-agent + yaml-agent + wiring-agent) + Reconciliation-Pass; **Pre-D2-Audit:** 15 von 26 Plan-Doc-§8-Patterns bereits implementiert in vorigen Wellen (Arch+ T13 media-type-iana 5 + Welle B http-protocol-pairings RFC2-96 + Welle D standards-p3 RFC2-50 + Welle F info-tier walkers F-10/L9-7/F-16 + privacy-data-class L6-2) — D2 deduplicate + implementiert nur 11 echt-neue P4/P5-Patterns; **1 NEUE yaml** `apiq-ruleset-niche.yaml` (12 rules: 4 P4 + 8 P5 — F-18 split in length-mode + boilerplate-mode); **11 NEUE custom-functions** in `spectral-functions/niche-functions.ts` (Total 127, war 116); **F5-coverage-gate** erweitert auf 12 yamls; **Reconciliation:** 6 patterns.json severityHypothesis-Updates (RFC2-71/72/73/95/105 + CL-60) zur Alignment mit yaml-truth post-implementation, drift-baseline-stable bei 18; **3 pre-existing flakes** unter parallel-load (prisma-import 5s timeout + client-p2-rules CL-4 5s timeout + intermittent severity-schema imports) — alle isoliert PASS; nicht-D2-related; **1 pre-existing build-error** severity-schema.ts:495 Zod-API-Mismatch (Welle Arch+ A2 leftover, out-of-D2-scope, dokumentiert für Cleanup-Pass) |
| E | TBD | — | — | — | wartet auf D2 ✓ |
| T | TBD | — | — | — | wartet auf C; parallel zu D/D2/E |
| Doc | TBD | — | — | — | wartet auf M+F+Arch |
| **Arch+** | `specs/E09-w-arch-architecture-cleanup.md` (+ `*-results.md`) | ✓ 2026-05-09 | 1830+ / 4 skip / 0 fail | `e3521d3` (feat) | done; Welle-Arch+ erweitert vom Plan-Doc-§13-original-scope auf full architectural cleanup — 7 sub-tasks (5 parallel + 2 sequential): OQ-1 cron monthly + A1 drift-lint + A2 zod-schemas + A3 FunctionMetadata + OQ-3 stripe-perf-investigation (vorgezogen) + OQ-2 verbatim-population (vorgezogen) + OQ-4 function-consolidation + File-Tree-Refactor; **342 rules + 116 custom-functions + 3 _helpers/-modules** (rate-limit/request-body/security); **layered tree** classifiers/aggregators/modules/rules/infra/spectral-functions/iana/index.ts (60 files moved git-mv); **34 RFC-quotes verifiziert** (T25 baseline now meaningful); drift-lint surfaced 15 class-2 errors (concrete follow-up); 5 patternIds drift in functionMetadata (KNOWN_DRIFT in test); github-rest 45min timeout unverified |
| R | TBD | — | — | — | startbar ab Welle C |
| V | TBD | — | — | — | wartet auf alle |
| **M2** (NEU) | TBD — agent + MCP-mining gerichtet | — | — | — | wartet auf V; pre-Phase-B; siehe §16a |
| **Z** (NEU) | TBD — MCP-Input-Format-Adapter | — | — | — | wartet auf V; parallel zu M2/Phase-B möglich; siehe §16b |
| Phase B | siehe `phase-b-design.md` | — | — | — | wartet auf V + M2 (M2-patterns als prompt-context-substrate) |

---

## 22. Open Strategic Questions (NEU 2026-05-07)

> Persistent open-questions die NICHT pro-welle resolved werden, sondern strategische Reviews brauchen. Tracked als Plan-Doc-state.

**OQ-Strategic-1 — Lens-10 Split-Decision:** Aktuell ist Lens-10 (Operational-Metadata) heterogen: Deprecation-Policy + Observability-Headers + Rate-Limit + API-Versioning. Sollte das in Lens-10a/10b/10c aufgeteilt werden? **Decision-Trigger:** nach Welle M2 evaluieren — wenn Round-4-Mining ≥10 patterns pro sub-bucket findet, split-würdig. Falls <10, eigenständige Lens-10 mit klar dokumentierten Sub-Sections.

**OQ-Strategic-2 — Lens-11 (Agent-Tool-Disambiguation) Promotion-Decision:** Tool-Collision-Detection + Promptability + Tool-Selection-Confidence sind nicht sauber in Lens-9 (consumability). **Decision-Trigger:** Welle M2 hat als Acceptance-Criterium "Lens-11-Decision dokumentiert" — wenn ≥10 distinct patterns gefunden werden, Lens-11-Promotion + Severity-Schema-Erweiterung in Welle F-Erweiterung. Falls <10, integration in Lens-9.

**OQ-Strategic-3 — Phase-B-Lens-Bias-Correction:** `phase-b-design.md` v6-prompt soll Lens-9 + Lens-10 + (eventuell 11) als primary-territory addressieren statt co-equal mit Lens-1-4. **Decision-Trigger:** post-Welle-M2 — `phase-b-design.md` Update um agent-aware-prompt-engineering. Phase-B-Run nutzt M2-Mining-Output als prompt-context-bundle.

**OQ-Strategic-4 — MCP-Readiness als Marketing/Positioning-Feature:** Soll apiq's Landing-Page + GitHub-README "AI-Readiness-Score" (Welle Z output) als primary value-prop positionieren oder als secondary feature? **Decision-Trigger:** post-Welle-Z + Welle V (wenn Cross-Linter-Validation Differentiator-Position klärt). Tagline-Decision für `prd-launch.md`: "Humans tolerate bad APIs. Agents don't." als Headline-Kandidat.

**OQ-Strategic-5 — v2/v3 Vision-Items NICHT für v1:** Phase 4 (Runtime simulations / agent benchmarking) + Phase 5 (Continuous agent observability) aus ChatGPT-Brainstorming sind out-of-scope für v1-launch — explizit als v2/v3-territory gemarkiert. Soll Plan-Doc post-Phase-B eine v2-Vision-Section haben? **Decision-Trigger:** post-Phase-B Decision — wenn Phase-B PASS, v2-Vision-Plan-Doc als follow-up-spec.
