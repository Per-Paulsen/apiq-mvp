# E09-w-f — Framework-Optimization — Brainstorming

> **Welle F aus `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` §5.** Pre-Condition: Welle M Round-3+4 done (commits `465177f` + `593d6b7` + `87c4d2b` + `540e818` + `154dd35`). Mode: brainstorming weil F1-F10 mit 10 Sub-Items + F4-Migration-Strategy für 110 rules echte Sequenzierungs-Diskussion brauchen (Plan-Doc §2 Decision-Heuristik).
>
> **Strategic Vision Constants gelten** (Plan-Doc §0): Welle F muss apiq-meta-block agent-aware sein + Lens-9/10/11-discovery first-class behandeln + nicht "kein a oder b sondern alles" verletzen. Memory-Anchors: `project_apiq_agent_readiness_positioning.md`, `feedback_no_trade_off_against_vision.md`, `feedback_no_pseudo_questions.md`.
>
> **Substrate verfügbar:** 959 patterns in `scripts/spike/data/patterns.json` (citation-coverage 80.4%, URL 72.4%) + Pattern-Knowledge-Index 763 entries (`scripts/spike/eval/cache/pattern-index.json`, RAG via `findRelatedPatterns`) + 110 YAML rules mit 100% Source-Mapping-Comments dank M4 + 5 custom-functions + 15 module-classes.
>
> **Convention für Antworten:** User schreibt direkt UNTER der Frage. Append-only. Bei "Vorschlag: X" reicht "OK" oder "ja" als accept; abweichende Antworten begründen.

---

## §0 Pre-Reads für Subagent

VOR Brainstorming-Antworten — wenn unklar, lies:

- `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` §0 (Strategic Vision Constants), §5 (Welle F detail), §22 (Open Strategic Questions)
- `specs/big-spec-architecture-spike-stage-a-implementation-audit.md` (Subagent-B-Audit der Welle-F-Lücken)
- `specs/big-spec-architecture-spike-stage-a-meta-insights.md` (10-Lens-Framework + Stakeholder×Lifecycle×Defect-Class cube — F2 enum-additions referenzieren das)
- `specs/big-spec-architecture-spike-phase-b-design.md` (F1 autoFixSafe ist explizit Phase-B-Pre-Condition)
- `scripts/spike/deterministic/severity-schema.ts` (current schema-state — wird in F1+F2+F8+F9+F10 erweitert)
- `scripts/spike/deterministic/spectral-runner.ts:299-307` (current rule-conversion — F3 + F4 erweitern das)

---

## §1 F1+F2+F3+F8 Schema-Erweiterung — Reihenfolge + Coupling

**Frage 1.1 — Schema-First Reihenfolge:**

F1 (autoFixSafe + detectionPrecision), F2 (enum-sync), F3 (direction-modifier structured), F8 (source-verbatim + source-verified-at) sind alle TypeScript-Schema-Erweiterungen in `severity-schema.ts`. F4 (YAML-rule-promotion) konsumiert das vollständige Schema. F5 (validateMetadata enforcement) prüft das Schema.

**Vorschlag:** F1+F2+F3+F8 als **eine Schema-Erweiterungs-Welle (Phase 1) BEFORE F4**. Damit F4-Subagents komplettes Schema sehen. Plus: spectral-runner.ts erweitern um apiq-meta-Block-Read als Teil von Phase 1. F5 enforcement als Phase 2 nach F4 (kann Subagents mid-flight nicht bremsen). F6+F7 als Phase 3 (orthogonal). F9+F10 als Phase 4 (additive, kann jederzeit dazu).

Q1.1: Reihenfolge OK? Oder splittest du anders?

**Frage 1.2 — F8 verbatim-coupling:**

F8 fügt `source.verbatim` + `source.verifiedAt` zu `RuleSourceSchema`. Round-3+4-Mining hat bereits 100% verbatim+URL-Coverage in `patterns.json`. **Vorschlag:** F4-Subagents nutzen patterns.json als single-source — der entsprechende `source.verbatim`-wert ist aus patterns.json copy-paste-able. Zero re-mining-effort. T25 (Welle D) Source-Verify-CI re-fetcht später um `verifiedAt` zu erneuern.

Q1.2: OK so coupling? Oder F8-verbatim-fields optional (nur wo patterns.json was hat)?

**Frage 1.3 — F3 direction-modifier scope:**

Schema hat `direction: tighten|loosen|drift`. Aktuell 0 YAML-rules tragen es structured. Plan-Doc sagt "~30 EV-rules". Aber Round-3+4-Mining brachte direction-fields auch für non-EV-patterns (z.B. R3-PM-EV-04 hat `direction: drift`). 

**Vorschlag:** F3 tagged ALLE rules wo direction in patterns.json = nicht-null (vermutlich ~50-60 rules total, nicht nur EV). F4-Subagents übernehmen das per copy-from-patterns.json.

Q1.3: OK alle rules, nicht nur EV? Oder strikt nur EV-rules wie Plan-Doc sagt?

---

## §2 F4 — 110-rule Metadata-Promotion-Strategie

**Frage 2.1 — Subagent-Partitionierung:**

Plan-Doc §5 sagt "4 parallele Subagent-Wellen je ~28 rules". 4 YAMLs existieren:
- `apiq-ruleset.yaml` (27 rules)
- `apiq-ruleset-threat-p1.yaml` (26 rules)
- `apiq-ruleset-client-p1.yaml` (27 rules)
- `apiq-ruleset-evolution.yaml` (30 rules)

**Vorschlag:** **per-yaml-file partitionieren** — 1 Subagent pro YAML. Konfliktfrei (jeder Subagent edits genau 1 file). Plus per-yaml-coherence (alle threat-p1-rules zusammen geschrieben statt random verteilt).

Q2.1: per-yaml partitionieren OK? Oder nach pattern-id-prefix oder Lens?

**Frage 2.2 — F4-Subagent-Briefing-Strategie:**

Subagent muss pro rule:
1. Read existing rule from YAML + Source-Mapping-Comment (M4-Output)
2. Lookup in `patterns.json` für strukturierte metadata
3. Plus optional: `findRelatedPatterns(rule-description)` aus pattern-index für additional context
4. Construct apiq-meta-block per Plan-Doc §5 schema
5. Add to YAML rule

**Vorschlag:** patterns.json-lookup ist primary. pattern-index ist nur fallback/augmentation falls Pattern nicht in patterns.json (sollte selten sein — patterns.json hat Round-1+2+3+4 = 959 patterns). Subagents bekommen vereinheitlichte Schema-Vorlage per Briefing + Beispiel-rule (1 voll-getaggte rule per yaml als reference).

Q2.2: Approach OK? Oder soll Subagent direkt ohne patterns.json-shortcut arbeiten und alles aus rules-brainstorm.md re-extracten?

**Frage 2.3 — Round-3+4 Severity-Upgrades-Apply:**

Round-3+4 findings haben konkrete severity-upgrade-Kandidaten:
- RFC 9745 Deprecation Header (R4-IETF-ST-01) → EV-1/F-1 von hint→warn upgrade
- 5-Vendor date-versioning consensus (R4-VB-EV-06) → EV-13 severity-validation
- RFC 9700 BCP-240 OAuth implicit deprecation (R3-PM-IC-04) → apiq-tm-y7 von hint→warn
- RFC-7807 0% adoption (R3-CO-SC-01) → Lens-2 RFC-7807-recommendations von warn→hint runter
- Sunset/Deprecation 0% adoption → high-precision rule für Lens-10

**Vorschlag:** F4-Subagents apply severity-upgrades **als Teil der Migration**. Pro rule: lookup patterns.json severity-hypothesis, falls != current YAML-severity → severity update. Plus: semantic-changes-list im Subagent-Output dokumentiert ("changed apiq-tm-y7 from hint to warn per R3-PM-IC-04").

Q2.3: OK semantics-changes mit-applye? Oder F4 nur metadata-add (no severity-changes), severity-update als separate F-Decision-Point danach?

**Frage 2.4 — Pattern-ID-Coupling:**

YAML-rule-key ist `apiq-tm-y17-server-url-https-only`. Master-pattern-id ist `Y17` oder `TM-Y17`. patterns.json sollte beide verlinken via `apiq-meta.pattern-id` field.

**Vorschlag:** apiq-meta.pattern-id ist die master-pattern-id (e.g. "Y17"). Subagent infert das aus YAML-rule-key durch suffix-extraction. Bei Mismatch (nicht-trivial-mapping) → Subagent loggt + manueller Fix.

Q2.4: OK auto-extract? Oder soll Pattern-ID per Subagent-rule explizit angegeben werden via patterns.json-lookup-by-description-similarity?

---

## §3 F5+F6 — Pipeline-Enforcement + info-tier

**Frage 3.1 — F5 enforcement-strictness:**

F5 ruft `validateMetadata` auf jeder geladenen rule. **Vorschlag:** Phase-2-Enforcement = warn-only mode (log warning bei missing apiq-meta, nicht fail). Build-time-Test sagt "mindestens 95% rules tragen apiq-meta" als CI-gate. Strict-fail-mode kommt später (Welle V territory) wenn 100%-coverage stable.

Q3.1: warn-only enforcement OK? Oder strict-fail-mode sofort?

**Frage 3.2 — F6 info-tier walker-additions:**

Plan-Doc §5 sagt "L10-positive-markers (SLA4OAI-presence, capability-discovery-endpoint-presence)". Plus Round-3+4 brought neue info-tier-Kandidaten:
- R4-IETF-ST-06 RFC 9727 api-catalog → info-tier wenn `/.well-known/api-catalog` exists
- R4-IETF-ST-03/04/05 RFC 9728 OAuth Protected Resource Metadata → info-tier wenn `/.well-known/oauth-protected-resource` exists
- R3-PM-EV-07 GitHub `x-brownout-schedule` → info-tier wenn vendor-extension exists
- R4-VB-AI-01 Slack `x-rate-limit-tier` → info-tier per-operation

**Vorschlag:** F6 inkl. die 4 NEW info-tier-walker-rules + 2 von Plan-Doc-original-list. Total ~6 info-tier-rules. Welle T (Test-Coverage) braucht später Tests für jeden.

Q3.2: 6 info-tier walker-rules OK? Oder nur die 2 von Plan-Doc original?

---

## §4 F7 — Per-target codegen-tagging

**Frage 4.1 — Welche Lens-4-rules per-target taggen?**

patterns.json hat 91 Lens-4 (Client-Friction) patterns. Aber nur ~30-50 davon sind echt codegen-target-spezifisch (z.B. multi-lang-reserved-keywords ist explizit target-aware).

**Vorschlag:** Subagent extracts targets-list aus rule-description und custom-function-source. Beispiel: `apiq-cl-1-reserved-keywords` → Custom-function liefert `keywords-by-language`-map → targets = `[python, java, go, javascript, ruby, php, c-sharp]`. Nicht-explicit-targeted rules behalten `[*]`.

Q4.1: Subagent-auto-extract OK? Oder explicit-list-pro-rule (manuell kuriert)?

---

## §5 F9 — Quality-Framework-Mapping

**Frage 5.1 — Welche Frameworks zuerst?**

Plan-Doc §5 listet: **NIST CSF 2.0** (Govern/Identify/Protect/Detect/Respond/Recover), **OWASP ASVS 5.0** (V1-V14 chapters), **CIS Controls 8.1** (Top 18), **GDPR Art** für Privacy, **SOC 2 TSC** für Audit.

**Vorschlag:** **Alle 5 Frameworks als Schema-Felder** (`regulatoryMapping: { nist?, asvs?, cis?, gdpr?, soc2? }`). Tagging-Effort: Subagent priorisiert security/privacy-relevant rules (~30-50 rules). Lens-1 (Threat) → NIST + ASVS + CIS bevorzugt. Lens-6 (Privacy) → GDPR. Lens-7 (Operations) → SOC 2.

Q5.1: alle 5 Frameworks im Schema OK? Oder phasen-priorisiert (z.B. NIST + ASVS jetzt, CIS+GDPR+SOC 2 später)?

**Frage 5.2 — Tagging-Quelle:**

Frameworks haben strukturierte Standards (z.B. NIST CSF 2.0 hat numbered functions GV.OC-01, GV.RM-02 etc.). Subagent muss mapping construct.

**Vorschlag:** Subagent kriegt im Briefing **5 mapping-Heuristiken**: "wenn rule OWASP-API-Top-10 cited → ASVS V-chapter mappable" usw. patterns.json source-citations enthalten oft schon OWASP/ASVS-references via verbatim-enrich-pass. Subagent extracts + augmentiert.

Q5.2: Heuristik-basiert OK? Oder soll Subagent jeden Framework-Standard als reference-text laden (groß) + per-rule explizit lookup?

---

## §6 F10 — cost-impact + mttr-impact axes

**Frage 6.1 — Definitionen für low/medium/high:**

Plan-Doc §5 sagt "cost-impact = cost-of-fix für Author" und "mttr-impact = impact-on-MTTR-when-fired-in-prod". Aber low/medium/high braucht klare Definitionen.

**Vorschlag-Definitionen:**

cost-impact:
- **low:** trivial fix (add field, add description, fix typo) — minutes per occurrence
- **medium:** moderate fix (add header support, add error-shape, add pagination) — hours per occurrence
- **high:** significant rework (restructure schema, add auth-flow, refactor versioning-strategy) — days per occurrence

mttr-impact:
- **low:** finding affects developer-experience only, no prod-impact
- **medium:** finding affects client-integration-quality, may cause user-experience degradation, hours-MTTR if fired in prod
- **high:** finding affects security/correctness, may cause data-loss/security-incident, days-MTTR

Q6.1: Definitionen OK? Andere Axis-Werte sinnvoll (z.B. zusätzlich `critical`-Tier)?

**Frage 6.2 — Tagging-Coverage:**

110 rules + Welle-C/D-Rules (P2/P3). **Vorschlag:** F10-tagging als Teil von F4 (also pro rule während Migration). Subagent tag basierend auf severity + lens + description-keywords. Heuristik-Defaults (Lens-1 → mttr-high, Lens-2 typos → cost-low, etc.).

Q6.2: F4-coupling OK? Oder F10 als separater Pass nach F4?

---

## §7 Lens-9/10/11-Coupling — Strategic-Vision-Implementation

**Frage 7.1 — Welche Schema-Felder sind agent-aware:**

Plan-Doc §0 sagt: Lens-9 + Lens-10 sind unter-gemined; Welle F muss apiq-meta-block agent-aware-Felder haben. Aber konkret: WELCHE Felder sind agent-aware?

**Vorschlag:** F1's `detectionPrecision` ist agent-aware (LLM-Tool-call-confidence-Indikator). Plus NEW: `agentReadinessImpact: 'high' | 'medium' | 'low' | 'none'` als 11. Schema-Field. Definitionen:
- **high:** finding directly causes agent tool-call-failure (ambiguous-name, unclear-description, missing-required-field)
- **medium:** finding causes agent retry-loop or error-recovery-difficulty
- **low:** finding affects agent-quality but not blocking
- **none:** finding is human-developer-only

Q7.1: agentReadinessImpact als zusätzliches Field OK? Oder reicht detectionPrecision + Lens-9-tagging?

**Frage 7.2 — Lens-11-Decision-Trigger:**

Plan-Doc §22 OQ-Strategic-2: Lens-11 (Agent-Tool-Disambiguation) wird in Welle M2 (post-V) decided. Welle F sollte Schema **future-proof** für Lens-11-addition machen.

**Vorschlag:** `LensSchema` aktuell 10 enum-werte. Welle F erweitert NICHT auf 11 (premature). Aber: Schema dokumentiert "lens-11-pending"-comment. Wenn Welle M2 entscheidet Lens-11 wird promoviert → kleine Schema-erweiterung in Welle F-Erweiterung oder Welle V.

Q7.2: future-proof-only OK? Oder Lens-11 jetzt in Schema als "experimental" einbauen?

---

## §8 Reihenfolge + Quality-Gate für Welle F

**Frage 8.1 — Phasen-Sequenz finalisieren:**

Mein Vorschlag aus §1.1:

```
Phase 1 (parallel): F1 + F2 + F3 + F8 (Schema-Erweiterung) + spectral-runner.ts apiq-meta-Block-Read
Phase 2 (parallel — 4 Subagents): F4 per yaml-file (~28 rules each); F4 inkl. Round-3+4-severity-upgrades + F7 codegen-targets + F10 cost/mttr-impact
Phase 3 (parallel): F5 enforcement + F6 info-tier walker-additions + F9 regulatory-mapping (~30-50 security/privacy rules)
Phase 4: Verify + commit + memory + plan-doc-sync
```

Q8.1: OK Phasen-Sequenz?

**Frage 8.2 — Welle-F-Done-Criteria:**

**Vorschlag — Welle F ist done wenn:**
1. Schema erweitert (autoFixSafe, detectionPrecision, ai-agent-stakeholder, authoring-time/validation-time-lifecycle, privacy-leakage/operational-metadata-missing-defect-class, source-verbatim, source-verified-at, regulatoryMapping, costImpact, mttrImpact, agentReadinessImpact)
2. ≥95% der 110 YAML-rules tragen apiq-meta-block (target ≥104 rules)
3. spectral-runner.ts liest apiq-meta-block + propagiert in DetectorFinding
4. validateMetadata enforcement aktiv (warn-only mode) + CI-gate ≥95%
5. ≥6 info-tier walker-rules (4 NEW + 2 Plan-Doc-original)
6. ≥30-50 Lens-4-rules per-target codegen-getagged
7. ≥30-50 security/privacy-rules regulatory-getagged
8. Round-3+4 severity-upgrades applied (5 concrete + emergent)
9. Tests bleiben grün (845/2/0 baseline + neue Tests für apiq-meta-block-validation)
10. Memory + plan-doc updated mit Welle-F-state

Q8.2: Quality-Gates OK?

**Frage 8.3 — Test-Updates:**

Welle F erweitert Schema → tests in `severity-schema.test.ts` brauchen Updates. Plus: neue Tests für apiq-meta-block-validation + spectral-runner-propagation.

**Vorschlag:** Subagent in jeder Phase fügt Tests hinzu (nicht separater Test-Pass). Phase 1 = severity-schema.test.ts erweitern. Phase 2 = pro yaml-file ein integration-test "alle rules tragen apiq-meta-block". Phase 3 = info-tier-walker-tests + regulatory-mapping-test.

Q8.3: Coupled Tests OK? Oder separater Test-Welle nach Welle F?

---

## §9 Open Items

(User kann hier eigene Anmerkungen, Vorschläge, Bedenken einfügen die nicht in §1-§8 abgedeckt sind.)

---

**Status:** Brainstorming v1 (initial questions) — **OBSOLET 2026-05-08**.

---

## §10 Brainstorming-Skip — User-Direktive 2026-05-08

> **User-Direktive verbatim:** "es gibt hier nichts zu entscheiden! erst recht für dich nicht! das Vorgehen ist völlig klar. es wird ALLES so gründlich wie nur möglich gemacht. es wird nichts ausgelassen, nichts verschoben und es werden keine Kompromisse eingegangen!"

**Konsequenz:**

Plan-Doc `big-spec-architecture-spike-stage-a-restwork-plan.md` §5 ist source-of-truth für Welle-F-Scope. Keine Sub-Item-Decisions zu treffen. Keine Phasen-Reihenfolge zu diskutieren. Keine Sub-Set-Selektion. Alle F1-F10 werden gebaut, alle Round-3+4 severity-upgrades applied, alle Strategic-Vision-Constants (Plan-Doc §0) berücksichtigt.

Brainstorming-Fragen §1-§8 oben sind hiermit alle resolved als "Maximum-Scope, alles wie in Plan-Doc + Round-3+4-findings + Strategic-Vision dokumentiert". Spec-File wird direkt geschrieben.

Memory-Lehre: `feedback_no_pseudo_questions.md` + `feedback_never_defer_fixes.md` + `feedback_putzen_first_before_validation.md` + `feedback_no_trade_off_against_vision.md` werden ergänzt um neue feedback-memory `feedback_plan_doc_is_source_of_truth.md`.
