# Epic 09 / Welle F — Framework-Optimization

> Schema-Erweiterungs- und Metadata-Promotion-Welle die Stage-A-Framework auf Maximum bringt: alle F1-F10 sub-items aus Plan-Doc §5 + alle Round-3+4-severity-upgrades + Strategic-Vision-Constants (Plan-Doc §0) + agent-readiness-coupling. Pre-Conditions: Welle M Round-3+4 done.
>
> Plan-Doc Master: [`specs/big-spec-architecture-spike-stage-a-restwork-plan.md`](./big-spec-architecture-spike-stage-a-restwork-plan.md) §5 (Welle F detail) + §0 (Strategic Vision Constants) + §22 (Open Strategic Questions). Pattern-substrate: [`scripts/spike/data/patterns.json`](../scripts/spike/data/patterns.json) (959 patterns) + Pattern-Knowledge-Index ([`scripts/spike/eval/cache/pattern-index.json`](../scripts/spike/eval/cache/pattern-index.json), 763 entries via `findRelatedPatterns` API). Auditor-Findings: `specs/big-spec-architecture-spike-stage-a-implementation-audit.md` (Subagent-B's Welle-F-Lücken-Audit). Lens-Framework: `specs/big-spec-architecture-spike-stage-a-meta-insights.md`.
>
> **Maximum-Scope-Direktive (User 2026-05-08):** "es gibt nichts zu entscheiden. das Vorgehen ist klar. ALLES so gründlich wie nur möglich. nichts auslassen, nichts verschieben, keine Kompromisse." Memory: `feedback_plan_doc_is_source_of_truth.md` + `feedback_putzen_first_before_validation.md` + `feedback_never_defer_fixes.md` + `feedback_no_trade_off_against_vision.md` + `feedback_no_engineering_time_estimates.md`.

## Scope

Welle F erweitert das Stage-A-Framework um vollständig-strukturierte Metadata + Pipeline-Enforcement + Strategic-Vision-Coupling. Alle Sub-Items werden gebaut. Keine Selektion, keine Phasen-Reduktion.

### F1 — autoFixSafe + detectionPrecision Schema-Erweiterung

In `scripts/spike/deterministic/severity-schema.ts`:
- Add `autoFixSafe: boolean` zu `RuleMetadataSchema` (Pre-Condition für Phase B per `phase-b-design.md §2 Layer 1`)
- Add `detectionPrecision: 'high' | 'medium' | 'low'` zu Schema
- Tag alle Patterns aus `phase-b-design.md §2 Layer 1` Liste als `autoFixSafe: true`
- Tag alle heuristisch-textbasierten Rules + alle walker-statistical-rules als `detectionPrecision: 'medium'` oder `'low'` per pattern-Heuristik

### F2 — Stakeholder/Lifecycle/Defect-class Enum-Sync

Schema in `severity-schema.ts` ist 1-Round-step hinter Round-2-Doc + Round-3+4-Erweiterungen. Vollständige enum-additions:

**StakeholderSchema:**
- Add `'ai-agent'` (Lens-9 USP, aktuell missing — Walker-rules tagen `client-dev` als fallback). Per `meta-insights.md:330,:448`.

**LifecyclePhaseSchema:**
- Add `'authoring-time'` + `'validation-time'`. Aktuell 8 Werte; doc lists 9 phases.
- Naming-Konsistenz fix: `'runtime-scale'` → `'runtime-at-scale'` (Doc-konform).

**DefectClassSchema:**
- Add `'privacy-leakage'` + `'operational-metadata-missing'` (Round-2-Promotion nicht reflektiert in TS). Per `meta-insights.md:334,:452`.
- Naming-Konsistenz fix: `'ergonomics'` → `'ergonomic'`, `'incompleteness'` → `'incomplete'`.

### F3 — direction-modifier von Prosa zu structured field

Schema hat `direction: tighten|loosen|drift`. Aktuell 0 YAML-rules tragen es structured. Workstreams:

1. `spectral-runner.ts:299-307` erweitern um `direction:` + alle anderen apiq-meta-Felder durchzukopieren in DetectorFinding (Pre-Condition für F4)
2. ALLE YAML-rules taggen mit `direction:` wo direction in `patterns.json` belegt ist (nicht nur EV-rules — patterns.json hat direction-fields auf vielen patterns aus Round-3+4 z.B. R3-PM-EV-04, R4-IETF-* etc.)

### F4 — YAML-rule metadata promotion (load-bearing)

110 YAML-rules erhalten vollständigen `apiq-meta`-Block per Plan-Doc §5 schema:

```yaml
apiq-tm-y17-server-url-https-only:
  description: ...
  message: "..."
  severity: warn
  given: "..."
  then: { ... }
  apiq-meta:
    pattern-id: TM-Y17                # extracted aus YAML-rule-key suffix
    lenses: [lens-1, lens-2]          # multi-lens (per patterns.json)
    direction: drift                  # F3 structured (per patterns.json wo applicable)
    sources:
      - { type: rfc, id: 'RFC 9110', section: '...', verbatim: '...', verifiedAt: '2026-05-08' }
      - { type: vendor, id: 'OWASP API8' }
    stakeholders: [security, end-user]
    lifecyclePhase: deploy-time
    defectClass: semantic
    iso25010: [security]
    codegenTargets: ['*']             # F7 per-target wo applicable
    detectionPrecision: high          # F1
    autoFixSafe: false                # F1
    regulatoryMapping:                # F9
      nist: ['PR.DS-2']
      asvs: ['V9.1.1']
    costImpact: medium                # F10
    mttrImpact: high                  # F10
    agentReadinessImpact: high        # Strategic-Vision-coupling (NEU)
```

**Migration:** 4 parallele Subagent-Wellen, partitioniert per YAML-File (apiq-ruleset.yaml=27, apiq-ruleset-threat-p1.yaml=26, apiq-ruleset-client-p1.yaml=27, apiq-ruleset-evolution.yaml=30). Pro Subagent:
1. Read existing rule + Source-Mapping-Comment (M4-Output)
2. Lookup in `patterns.json` (959 patterns, citation-coverage 80.4%) für strukturierte metadata
3. Optional: `findRelatedPatterns(rule-description)` aus pattern-index für additional context
4. Construct vollständigen `apiq-meta`-Block
5. Apply Round-3+4 severity-upgrades wo patterns.json severity-hypothesis ≠ aktueller YAML-severity
6. Add agent-readiness-impact-tagging (high/medium/low/none per Strategic-Vision-Definitionen)
7. Document semantics-changes-list im Subagent-Output

**Round-3+4 Severity-Upgrades verbindlich-applye während F4-Migration:**
- RFC 9745 Deprecation Header (R4-IETF-ST-01) → EV-1/F-1 von hint→warn
- 5-Vendor date-versioning consensus (R4-VB-EV-06) → EV-13 severity-validation
- RFC 9700 BCP-240 OAuth implicit deprecation (R3-PM-IC-04) → apiq-tm-y7 von hint→warn
- RFC-7807 0% adoption (R3-CO-SC-01) → Lens-2 RFC-7807-recommendations von warn→hint
- Sunset/Deprecation 0% adoption → high-precision-rule-class für Lens-10 (info-tier)
- Plus alle weiteren severity-hypothesis-Differenzen aus patterns.json

### F5 — validateMetadata enforcement in pipeline

`spectral-runner.ts` ruft `validateMetadata` auf jeder geladenen rule auf. Implementation:
1. Warn-only-mode: log warning bei missing apiq-meta (nicht fail)
2. Build-time-Test: CI-gate mit threshold ≥95% rules tragen apiq-meta-Block
3. Walker + module-class rules werden ebenfalls validiert (sie nutzen `validateMetadata` schon, aber nicht enforced)

### F6 — info-tier emission auf Lens-10 walkers

Schema unterstützt `info`-Tier. Aktuell 0 walker emittiert findings auf `info`. Round-2 hat info-tier explizit als USP markiert. Round-3+4 brachte zusätzliche info-tier-Kandidaten.

Vollständige info-tier-walker-Additions:
- **SLA4OAI-presence** (Plan-Doc §5 original) — SLA4OAI-extension declared in info.x-sla
- **Capability-discovery-endpoint-presence** (Plan-Doc §5 original) — `/.well-known/capabilities` or similar
- **RFC 9727 api-catalog presence** (R4-IETF-ST-06) — `/.well-known/api-catalog`
- **RFC 9728 OAuth Protected Resource Metadata presence** (R4-IETF-ST-03/04/05) — `/.well-known/oauth-protected-resource`
- **GitHub-style brownout-schedule presence** (R3-PM-EV-07) — `x-brownout-schedule` vendor-extension
- **Slack-style rate-limit-tier-metadata presence** (R4-VB-AI-01) — `x-rate-limit-tier` per-operation
- **Arazzo workflow-document presence** (R4-CT-AI-01) — workflows.arazzo.yaml linked

Walker emission auf `severity: info` mit positive-marker semantik.

### F7 — Per-target codegen-tagging

Lens-4 (Client-Friction) Rules wo description sagt "Targets: java, go, python" oder Custom-Function multi-language-aware ist (z.B. `multi-lang-reserved-keywords`):

1. Subagent extracts targets-list aus rule-description + custom-function-source
2. Tag mit konkreten `codegenTargets: ['python', 'java', 'go', 'javascript', 'ruby', 'php', 'c-sharp']` etc.
3. Nicht-explicit-targeted Lens-4-rules behalten `['*']`

### F8 — source-verbatim + source-verified-at Fields

`RuleSourceSchema` erweitert um:
- `verbatim?: string` (≤200 chars exact RFC/source-text-quote)
- `verifiedAt?: string` (ISO-Datum letzter URL-fetch-verification)

F4-Subagents übernehmen `verbatim` + `verifiedAt` direkt aus `patterns.json` (Round-3+4 patterns haben 100% verbatim+URL; Round-1+2 nach verbatim-enrich citation-coverage 80.4%, URL-coverage 72.4%). T25 Source-Verify-CI (Welle D) refresht `verifiedAt` quarterly.

### F9 — Quality-Framework-Mapping (apiq-USP)

Schema-Erweiterung um `regulatoryMapping`-Object mit 5 Frameworks-Feldern:

```typescript
regulatoryMapping?: {
  nist?: string[];   // NIST CSF 2.0 — z.B. ['PR.DS-2', 'GV.OC-01']
  asvs?: string[];   // OWASP ASVS 5.0 — z.B. ['V9.1.1', 'V14.4.5']
  cis?: string[];    // CIS Controls 8.1 — z.B. ['CIS-3.10', 'CIS-16.7']
  gdpr?: string[];   // GDPR Articles — z.B. ['Art-5', 'Art-25', 'Art-32']
  soc2?: string[];   // SOC 2 TSC — z.B. ['CC6.1', 'CC7.2']
}
```

**Tagging:** F4-Subagents priorisieren security/privacy-relevant rules (~30-50 rules). Mapping-Heuristiken:
- Lens-1 (Threat) → NIST CSF (Protect-Function) + OWASP ASVS V-chapters + CIS (Critical Controls)
- Lens-6 (Privacy-Data-Class) → GDPR (Art-5/25/32)
- Lens-7 (Operations) + Lens-10 (Operational-Metadata) → SOC 2 TSC
- patterns.json source-citations enthalten oft schon OWASP/ASVS-references (via verbatim-enrich-pass) — Subagent extracts + augmentiert

### F10 — cost-impact + mttr-impact axes

Schema-Erweiterung um zwei zusätzliche Axes:

**costImpact: 'low' | 'medium' | 'high'** (cost-of-fix für Author):
- **low:** trivial fix (add field, add description, fix typo) — Minutes per occurrence
- **medium:** moderate fix (add header support, add error-shape, add pagination) — Hours per occurrence
- **high:** significant rework (restructure schema, add auth-flow, refactor versioning-strategy) — Days per occurrence

**mttrImpact: 'low' | 'medium' | 'high'** (impact-on-MTTR-when-fired-in-prod):
- **low:** finding affects developer-experience only, no prod-impact
- **medium:** finding affects client-integration-quality, hours-MTTR
- **high:** finding affects security/correctness, days-MTTR (data-loss/security-incident risk)

Tagging integriert in F4 (pro rule während Migration). Heuristik-Defaults: Lens-1 → mttr-high, Lens-2-typos → cost-low, Lens-3-evolution-breaking → cost-high+mttr-high, etc.

### F-NEU — agentReadinessImpact axis (Strategic-Vision-Coupling)

Per Plan-Doc §0 Strategic Vision Constants ist apiq-Long-term-vision "Agent Interaction Quality Infrastructure". Schema-Erweiterung um Lens-9-spezifische Achse:

**agentReadinessImpact: 'high' | 'medium' | 'low' | 'none'**:
- **high:** finding directly causes agent tool-call-failure (ambiguous-name, unclear-description, missing-required-field, parameter-ambiguity)
- **medium:** finding causes agent retry-loop or error-recovery-difficulty (vague-error-shape, missing-rate-limit-headers)
- **low:** finding affects agent-quality but not blocking
- **none:** finding is human-developer-only

Tagging integriert in F4 (pro rule während Migration). All Lens-9-rules + Lens-10-rules werden mit agentReadinessImpact-Wert getagged. Andere Lenses default `'none'` außer wo explicit agent-relevant.

### F-INFRA — Spectral-Runner Erweiterung

`scripts/spike/deterministic/spectral-runner.ts:299-307` erweitert um:
1. Read `apiq-meta` block aus geladener YAML-rule
2. Embed alle `apiq-meta` fields in DetectorFinding via passthrough
3. Aufruf `validateMetadata` für jeden DetectorFinding (advisory + warn-mode per F5)

Plus: `migrateLegacyRule` (aktuell nur in Tests) wird als runtime-fallback aktiviert für YAML-rules die noch keinen vollständigen apiq-meta-Block tragen — automatic best-effort default-tagging plus warning.

## Acceptance criteria

Welle F ist done wenn ALLE folgenden erfüllt sind:

1. **Schema vollständig erweitert** in `severity-schema.ts`:
   - `autoFixSafe: boolean` (F1)
   - `detectionPrecision: 'high' | 'medium' | 'low'` (F1)
   - `StakeholderSchema` erweitert um `'ai-agent'` (F2)
   - `LifecyclePhaseSchema` erweitert um `'authoring-time'` + `'validation-time'`; renamed `'runtime-scale'` → `'runtime-at-scale'` (F2)
   - `DefectClassSchema` erweitert um `'privacy-leakage'` + `'operational-metadata-missing'`; renamed `'ergonomics'` → `'ergonomic'`, `'incompleteness'` → `'incomplete'` (F2)
   - `RuleSourceSchema` erweitert um `verbatim?` + `verifiedAt?` (F8)
   - `regulatoryMapping?` Object mit nist/asvs/cis/gdpr/soc2-feldern (F9)
   - `costImpact: 'low' | 'medium' | 'high'` (F10)
   - `mttrImpact: 'low' | 'medium' | 'high'` (F10)
   - `agentReadinessImpact: 'high' | 'medium' | 'low' | 'none'` (Strategic-Vision)
2. **YAML-rule metadata-promotion (F4):** ≥95% der 110 active YAML-rules tragen vollständigen `apiq-meta`-Block (target ≥104 rules; remaining ≤6 dürfen apiq-original ohne external-citation sein wo Patterns nirgends in patterns.json sind).
3. **direction-modifier strukturiert (F3):** Alle YAML-rules wo `patterns.json` direction-field belegt → tragen `apiq-meta.direction` als structured field (nicht Prosa).
4. **Spectral-runner.ts Erweiterung (F-INFRA):** apiq-meta-Block wird gelesen + propagiert in DetectorFinding. `migrateLegacyRule` als runtime-fallback aktiv.
5. **validateMetadata enforcement aktiv (F5):** spectral-runner ruft auf jeder geladenen rule. Warn-only-mode + Build-time-Test mit CI-gate ≥95%.
6. **info-tier walker-rules (F6):** ≥7 walker-rules emittieren `severity: info` (SLA4OAI + capability-discovery + RFC-9727 api-catalog + RFC-9728 oauth-protected-resource + brownout-schedule + rate-limit-tier + arazzo-workflow). Plus eventuell weitere die während Implementation als sinnvoll identifiziert werden.
7. **Per-target codegen-tagging (F7):** ≥30 Lens-4-rules tragen konkrete `codegenTargets: [<list>]` (nicht `['*']`) basierend auf rule-description + custom-function-source.
8. **Quality-Framework-Mapping (F9):** ≥30 security/privacy-relevant rules tragen `regulatoryMapping` mit min. 1 Framework-Feld populiert.
9. **cost-impact + mttr-impact + agentReadinessImpact (F10 + Strategic-Vision):** ALLE 110 YAML-rules tragen alle drei axes (auch wenn Default-Werte). 100% coverage.
10. **Round-3+4 Severity-Upgrades applied:**
    - EV-1/F-1 von `hint` → `warn` (per RFC 9745, R4-IETF-ST-01)
    - EV-13 severity-validation (per 5-Vendor date-versioning consensus, R4-VB-EV-06)
    - apiq-tm-y7 von `hint` → `warn` (per RFC 9700 BCP-240, R3-PM-IC-04)
    - Lens-2 RFC-7807-recommendations von `warn` → `hint` (per R3-CO-SC-01 0%-adoption)
    - Plus alle weiteren severity-hypothesis-Differenzen aus patterns.json (Subagent dokumentiert vollständige Liste im Subagent-Output)
11. **Schema-Tests erweitert** in `scripts/spike/__tests__/deterministic/severity-schema.test.ts` für alle neuen Schema-Felder (alle enum-additions + alle neuen Object-Felder).
12. **Per-YAML-Integration-Tests:** ≥1 test pro yaml-file der prüft "≥95% rules tragen apiq-meta-block + alle required-fields populated".
13. **Walker-Tests für info-tier (F6):** je 1 test pro neuem info-tier-walker-rule.
14. **Test-Suite grün:** 845/2/0 baseline + neue Tests (alle passing).
15. **Memory + Plan-Doc updated:**
    - Plan-Doc §20 + §21 Welle-Status-Tracker mit Welle-F-state + commit-hash
    - Plan-Doc §0 Strategic-Vision-Constants verifiziert (agentReadinessImpact addresses Lens-9-undermining)
    - Memory-handoff `project_epic09_spike_handoff.md` updated
    - MEMORY.md hooks updated
    - CLAUDE.md status-block updated mit Welle-F-state
16. **Commit:** feat: implement epic 09 / welle F — framework-optimization

## Out of scope

- Welle C/D/D2-Pattern-Implementations (P2/P3/P4/P5 Spectral-Rules) — separate Wellen, kommen NACH F
- Welle T (Test-Coverage-Maximierung mit Snapshot-Tests + CI-Pipeline) — separate Welle
- Welle Doc (dev-README + Architecture-Diagram + Contributor-Guide)
- Welle Arch (flat → classifiers/aggregators/modules/rules-Refactor)
- Welle R (Reference-Hardening — R1 isPureSpectralDetectable + R2 Second-LLM-Review)
- Welle V (Cross-Linter-Parity)
- Welle M2 (Stage-B + Agent + MCP-Mining post-V) — separate Welle
- Welle Z (MCP-Input-Format-Adapter post-V) — separate Welle
- Phase B (LLM-Pipeline-Engineering)
- v2/v3-Vision-Items (Runtime simulations + Continuous observability)

## Domain terms

- **apiq-meta-block:** strukturierter YAML-block innerhalb einer Spectral-rule der alle apiq-Extended-Metadata-Felder enthält (pattern-id, lenses, direction, sources, stakeholders, lifecyclePhase, defectClass, iso25010, codegenTargets, detectionPrecision, autoFixSafe, regulatoryMapping, costImpact, mttrImpact, agentReadinessImpact). Aktuell tragen 0 von 110 YAML-rules diesen Block. F4 baut ihn für alle.
- **autoFixSafe:** Boolean, ob ein Auto-Fix für diese rule sicher ohne Engineer-Review applybar ist. Phase-B-Pipeline-Anforderung — Layer-1-Auto-Apply nutzt nur autoFixSafe-true rules.
- **detectionPrecision:** high/medium/low — Confidence-Indikator dass Rule-Match wirklich ein echter Issue ist (nicht False-Positive). Heuristisch-textbasierte Walker-rules sind oft `medium` oder `low`, structurelle Schema-Validity-rules sind `high`.
- **direction-modifier:** tighten/loosen/drift — applies primary für Lens-3-evolution patterns, beschreibt Server-side-evolution-direction relativ zu Client-erwartung.
- **regulatoryMapping:** mapping zu 5 Quality-Frameworks (NIST CSF 2.0 / OWASP ASVS 5.0 / CIS Controls 8.1 / GDPR / SOC 2 TSC). apiq-USP für Enterprise-Tier-Sales.
- **costImpact / mttrImpact:** SRE-relevante Filter-Dimensionen — wie teuer ist Fix vs wie teuer ist Production-Incident-MTTR.
- **agentReadinessImpact:** Strategic-Vision-Coupling-Achse (Plan-Doc §0). Misst direct-impact-on-AI-agent-tool-call-success. Lens-9-aware-Schema-Field.
- **F4-Migration:** parallele Subagent-Welle für 110-rule-metadata-promotion. 4 Subagents partitioniert per yaml-file (apiq-ruleset.yaml=27, threat-p1=26, client-p1=27, evolution=30).
- **Round-3+4 severity-upgrades:** konkrete severity-changes die aus Welle-M-Mining-findings (RFC 9745, RFC 9700, RFC-7807-0%-adoption, etc.) verbindlich sind. F4-Subagents apply direkt während Migration.
- **patterns.json single-source:** F4-Subagents nutzen `scripts/spike/data/patterns.json` (959 patterns, 80.4% citation-coverage, 72.4% URL-coverage) als primary-lookup. `findRelatedPatterns` aus pattern-index als fallback/augmentation.

## Open questions

Keine. Plan-Doc §5 ist source-of-truth (per `feedback_plan_doc_is_source_of_truth.md` 2026-05-08). Alle Sub-Items + alle Round-3+4-severity-upgrades + alle Strategic-Vision-Constants werden gebaut.

Falls während Implementation emergent Issues auftauchen → werden im Welle-F-results-File post-/dev dokumentiert, nicht pre-implementation entschieden.
