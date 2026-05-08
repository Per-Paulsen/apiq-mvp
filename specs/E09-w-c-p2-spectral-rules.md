# Epic 09 / Welle C — P2 Spectral Rules

> P2-Pattern-Implementation aus Plan-Doc §6: ~45 neue Spectral-rules in 2 neuen YAML-Files (`apiq-ruleset-threat-p2.yaml` + `apiq-ruleset-client-p2.yaml`). Pre-Condition: Welle F done (commits `c635ac3` + `6b013f6`) — alle neue rules nutzen das finalisierte Schema mit vollständigem `apiq-meta`-Block.
>
> Plan-Doc Master: `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` §6 (Welle C) + §0 (Strategic Vision Constants). Pattern-Substrate: `scripts/spike/data/patterns.json` (959 patterns mit Citation-coverage 80.4%) + Pattern-Knowledge-Index. P2-Pattern-Listen: `specs/big-spec-architecture-spike-stage-a-implementation-priority.md` P2-Tabellen.
>
> **Maximum-Scope-Direktive (User 2026-05-08):** "ALLES so gründlich wie nur möglich. nichts auslassen, nichts verschieben, keine Kompromisse." Memory: `feedback_plan_doc_is_source_of_truth.md` + `feedback_putzen_first_before_validation.md` + `feedback_no_trade_off_against_vision.md`.

## Scope

Welle C implementiert **alle ~45 P2-Patterns** als Spectral-rules in zwei neuen YAML-Files plus benötigte Custom-Functions. Alle rules tragen vollständige `apiq-meta`-Blocks per Welle-F-Schema (kein metadata-arm-Output).

### T16b — P2-Threat (~25 rules) → `apiq-ruleset-threat-p2.yaml`

Patterns aus Plan-Doc §6 P2-Threat-Tabelle:
- **Y-Tier:** Y-1, Y-8, Y-10, Y-12, Y-13, Y-14, Y-15, Y-19, Y-21
- **TM-A-Tier:** TM-A2, TM-A5, TM-A7, TM-A9, TM-A12, TM-A13, TM-A14, TM-A18, TM-A28, TM-A35, TM-A36, TM-A45, TM-A46, TM-A47
- **RFC2-Tier:** RFC2-1, RFC2-2, RFC2-3, RFC2-11, RFC2-20, RFC2-21, RFC2-22, RFC2-25, RFC2-26, RFC2-32, RFC2-58, RFC2-59, RFC2-65, RFC2-69, RFC2-70, RFC2-74, RFC2-97

Lookup pro Pattern in `patterns.json` für: description, severity-hypothesis, source-citations, lens-tagging. Plus Round-3+4 severity-upgrades wo applicable (RFC 9728 OAuth Protected Resource Metadata für TM-rules; weitere wo patterns.json severity-hypothesis ≠ default).

**Custom-Functions:** Falls eines der ~25 Patterns nicht in stock-Spectral-DSL ausdrückbar ist (z.B. multi-step-validation oder cross-resource-checks), neue custom-function in `spectral-functions/threat-p2-functions.ts`. Konfigurieren in `spectral-runner.ts` `APIQ_CUSTOM_FUNCTIONS`-Map.

### T18b — P2-Client (~20 rules) → `apiq-ruleset-client-p2.yaml`

Patterns aus Plan-Doc §6 P2-Client-Tabelle:
- **CL-Tier:** CL-4, CL-5, CL-7, CL-9, CL-13, CL-15, CL-17, CL-18, CL-21, CL-22, CL-24, CL-25, CL-29, CL-35, CL-48, CL-54, CL-56, CL-64, CL-77
- **DOLAR-Tier (alle 4):** F-11, F-12, F-13, F-14

Lookup pro Pattern in `patterns.json`. F7 per-target codegen-tagging wo applicable (CL-rules sind oft target-spezifisch).

**Custom-Functions:** Falls Patterns multi-language-aware sind oder cross-spec-statistics brauchen, neue custom-function in `spectral-functions/client-p2-functions.ts`.

### apiq-meta-Block-Coverage

**100%** der ~45 neuen rules tragen vollständigen apiq-meta-Block per Welle-F-Schema:
- `pattern-id` aus patterns.json
- `lenses` (multi-lens wo applicable)
- `direction` (nur für evolution-relevant)
- `sources` (mit verbatim+verifiedAt aus patterns.json)
- `stakeholders`, `lifecycle-phase`, `defect-class`, `iso25010` (array), `codegen-targets`
- `detection-precision`, `auto-fix-safe`
- `regulatory-mapping` für security/privacy-relevante rules (NIST/ASVS/CIS)
- `cost-impact`, `mttr-impact`, `agent-readiness-impact`

### Spectral-Runner-Erweiterung

`scripts/spike/deterministic/spectral-runner.ts` erweitern:
1. Add `APIQ_RULESET_THREAT_P2_PATH` + `APIQ_RULESET_CLIENT_P2_PATH` constants
2. `loadYamlRules` für beide neuen yaml-files in `buildSpectral`
3. `merged`-Object enthält die neuen rules
4. Falls custom-functions: registrierung in `APIQ_CUSTOM_FUNCTIONS` + `SUPPORTED_FUNCTIONS`-Set

### Tests

**Pro YAML:** Integration-test analog zu existing `threat-p1-rules.test.ts` und `apiq-ruleset-client-p1.test.ts`:
- Rule-loading verifies (alle ~25 / ~20 rules geparst)
- Spectral-runner merge verifies
- apiq-meta coverage 100% per F5-coverage-gate (existing `apiq-meta-coverage-gate.test.ts` automatisch erweitert auf 6 yamls)
- Per-rule fixture-tests wo non-trivial pattern-detection

**Pro Custom-Function:** Unit-tests analog zu existing `threat-p1-functions.test.ts` (falls existing) oder neue `__tests__/deterministic/threat-p2-functions.test.ts`.

### Test-Suite-Coverage

apiq-meta-coverage-gate.test.ts (F5) erweitert um die 2 neuen yamls (jetzt prüft 6 statt 4 yamls).

## Acceptance criteria

Welle C ist done wenn ALLE folgenden erfüllt sind:

1. **`apiq-ruleset-threat-p2.yaml`** existiert + parst clean + enthält ~25 rules (alle Patterns aus Plan-Doc §6 P2-Threat-Tabelle plus weitere die patterns.json als P2-Threat zuordnet)
2. **`apiq-ruleset-client-p2.yaml`** existiert + parst clean + enthält ~20 rules (alle Patterns aus Plan-Doc §6 P2-Client-Tabelle plus DOLAR F-11/F-12/F-13/F-14)
3. **100% apiq-meta-Coverage** auf allen ~45 neuen rules (alle Pflichtfelder gemäß F5-gate populated)
4. **F5-coverage-gate-test** erweitert auf 6 yamls + alle pass
5. **Round-3+4 severity-upgrades applied** wo applicable (Subagents documenten welche)
6. **Custom-Functions** wo Patterns nicht in stock-Spectral-DSL ausdrückbar; mit Tests
7. **Spectral-Runner erweitert** liest beide neuen yamls + custom-functions registriert
8. **Integration-Tests** pro yaml: rule-loading + apiq-meta-validity (analog threat-p1-rules.test.ts pattern)
9. **Per-rule fixture-tests** wo non-trivial pattern-detection (cross-rule oder multi-step)
10. **Test-Suite grün:** 944 baseline + neue Tests (alle pass, 0 fail, 2 skip)
11. **Lint + tsc** keine NEW errors
12. **F7 per-target codegen-tagging** für target-spezifische Lens-4-rules (analog Welle F Phase 2C)
13. **Memory + Plan-Doc updated:** Plan-Doc §20 + §21 + handoff-memory + MEMORY.md hooks + CLAUDE.md status-block
14. **Commit:** feat: implement epic 09 / welle C — P2 spectral rules

## Out of scope

- Welle D / D2 (P3 + P4/P5 Patterns) — separate Wellen
- Welle T (Snapshot-Tests + CI-Pipeline) — kann parallel laufen, aber Tests die explizit Snapshot-Coverage prüfen sind T-territory
- Welle E (Putz-Niveau-Benchmark) — wartet auf D2
- Walker-rules (statistical-aggregation patterns) — Welle-B-territory; Welle C ist Spectral-DSL-only
- Module-class-rules — separate
- Phase B LLM-Pipeline-Engineering — wartet auf V

## Domain terms

- **P2-Pattern:** "Differentiator-Pattern" / apiq-USP per `implementation-priority.md` Priority-Achse. Im Gegensatz zu P1 (Konkurrenz-Pari-Pflicht) und P3-P5 (Defense-in-Depth / Niche / Vendor).
- **T16b / T18b:** task-IDs aus Plan-Doc §6 Welle-C-Section. T16b = P2-Threat-rules, T18b = P2-Client-rules.
- **DOLAR (F-11..F-14):** "DiscOvery, Logging, Auth, Rate-limiting" 4-Pattern-Cluster aus Round-2-Mining (DOLAR-Subagent). Alle 4 in Welle C inkludiert.
- **apiq-meta-Block:** strukturierter YAML-Block per Welle-F-Schema (siehe `specs/E09-w-f-framework-optimization.md` § F4). Wird in jeder neuer rule pflicht-getragen.
- **Custom-Function:** TypeScript-callable die in `spectral-functions/*.ts` lebt + via `function:`-key in YAML-rule referenziert wird. Existing: `multi-lang-reserved-keywords` + 4 threat-p1-functions. Neue P2-Functions wo Patterns multi-step oder cross-resource sind.
- **F5-coverage-gate:** existing Test in `__tests__/deterministic/apiq-meta-coverage-gate.test.ts` der CI-fail't bei <95% apiq-meta-Coverage. Welle C erweitert das auf 6 yamls.

## Open questions

Keine. Plan-Doc §6 + `implementation-priority.md` P2-Tabellen sind source-of-truth (per `feedback_plan_doc_is_source_of_truth.md`). Alle Sub-Items + alle Round-3+4-severity-upgrades + alle Strategic-Vision-Constants werden gebaut.

Falls während Implementation emergent Issues auftauchen → werden im Welle-C-results-File post-/dev dokumentiert, nicht pre-implementation entschieden.
