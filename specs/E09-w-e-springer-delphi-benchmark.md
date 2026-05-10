# Epic 09 / Welle E — Putz-Niveau-Benchmark T24 (Springer-Delphi 28-Rules)

> Ehrlicher empirischer Test der "27/28 Springer-Delphi covered + 1 partial" Behauptung. apiq gegen 4 Reference-Specs, prüfe dass alle 28 high-importance Springer-Delphi-Rules entweder fire ODER explicit-skip-with-rationale haben. Pre-Condition: Welle D2 done (commit `fe20019`) + **Welle I done** (Inventory + Capability-Map als Substrate für E0).
>
> Plan-Doc Master: `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` §9 (Welle E, restructured 2026-05-10 post-Pre-Welle-E-Audit). Pattern-Substrate: `scripts/spike/data/patterns.json` (972 patterns). 28-Rules-Original-Mapping: `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md:1729-1758` (STALE Stand 2026-05-05 — wird in E0 ersetzt).
>
> **Maximum-Scope-Direktive (User 2026-05-08):** "alles 100% ordentlich machen". Memory: `feedback_plan_doc_is_source_of_truth.md` + `feedback_putzen_first_before_validation.md` + `feedback_no_trade_off_against_vision.md` + `feedback_never_defer_fixes.md` + `feedback_no_engineering_time_estimates.md` + `feedback_yaml_truth_reconciliation.md`.

## Pre-Welle-E-Audit-Befund (2026-05-10)

Audit ergab dass die historisch-zitierte Behauptung "27/28 covered + 1 partial" empirisch nicht haltbar ist gegen aktuellen Code-State (354 yaml-rules + 127 functions + 25 walkers + 4 classifiers post-D2):

| Status | Anzahl | Was |
|---|---|---|
| Fully-covered | 5 | Alle cited Pattern-IDs sind yaml-active oder module-active |
| Partially-covered | 18 | Mindestens 1 cited Pattern-ID nur in patterns.json (kein yaml-rule), aber Konzeption oft anderswo abgedeckt |
| Unmappable | 5 | Wildcards (`S-SP-*`, `EV-*`, "spectral path-template") nie expandiert |

Hauptursache: Pattern-IDs sind unzuverlässige Proxies für "Konzeption ist abgedeckt". Brainstorm-Liste nutzt alte Round-1-Nomenclature (`B-SP-2/3/9`, `R-SP-1`, `K1/K4`, `S7`, `SC-6/9`, `G1/G2`, `H1`, `M9/M10`, `A-MIN-1`, `E1/E2/E3`, `Y-A48`, `RFC2-7/8/16/36-39/43/60-62`, `C10`) — viele wurden in Welle M Round-2/3 umbenannt oder existieren nur als patterns.json-substrate. **Welle E muss daher mit E0 ein authoritative Mapping neu schreiben.**

## Scope

Welle E etabliert einen **verified statement** zur Springer-Delphi-Coverage durch 4 Sub-Tasks: E0 (data-authoring) + E1 (test-framework, subsumiert ehem. Welle-T1) + E2 (assertion-logic) + E3 (CI-Job + status-updates).

### E0 — Authoritative Springer-Delphi-Mapping (data-authoring, **Welle-I-substrate-konsumierend**)

**Output:** `scripts/spike/data/springer-delphi-mapping.ts` mit 28 vollständigen Mapping-Einträgen.

**Welle-I-Substrate-Nutzung (post-Welle-I update):** statt manuellem grep durch 12 yamls + 127 functions + 25 walkers + 4 classifiers, konsumiere `scripts/spike/eval/inventory.json` + `scripts/spike/eval/coverage.json`:
- Per Delphi-Rule-Konzeption: query inventory.json für matching Pattern-IDs / yaml-rules / modules / walkers
- Cross-check coverage.json: welche der gemappten detectors fire tatsächlich auf welche der 4 Specs (= `applicable_to_specs` field)
- E0 ist jetzt "consult + write delphi-mapping-overlay" statt "manual mining"
- Manuell bleibt nur: `skip_rationale` (echte semantische Decision), `notes` (context), `delphi_rule` (verbatim-text aus Paper)

**Type:**
```typescript
export type DelphiMapping = {
  /** 1-28, per arXiv 2108.00033 Table of high-importance rules */
  delphi_id: number;
  /** Verbatim rule-text aus Paper */
  delphi_rule: string;
  /** Aktuelle yaml-rule-names die diese Konzeption abdecken (12 yamls in scripts/spike/deterministic/rules/) */
  yaml_rules: string[];
  /** Module/aggregator/classifier inline detections (nicht-yaml) */
  module_detections: string[];
  /** Walker-based detections (für statistical/cross-spec patterns) */
  walker_detections: string[];
  /** Welche der 4 Reference-Specs die Rule fire-able machen */
  applicable_to_specs: ('stripe-full' | 'pagerduty-full' | 'github-rest' | 'dnd5eapi')[];
  /** Wenn Stage-A out-of-scope: explicit reason (z.B. two-spec-diff für #28) */
  skip_rationale: string | null;
  /** Context: split across mehrere bundles, partial coverage, etc. */
  notes: string;
};

export const SPRINGER_DELPHI_MAPPING: DelphiMapping[] = [...];
```

**Methodik pro 28-Rules:**
1. Lese verbatim rule-text aus `rules-brainstorm.md:1729-1758` Spalte "High-importance rule (Delphi)"
2. Konzeptions-Analyse: was ist die Intent? (z.B. #6 "Consistent error messages" = problem+json conformance)
3. Code-Search: welche aktuellen yaml-rules / modules / walkers / classifiers decken die Konzeption? Suche via:
   - Grep auf Konzeptions-Keywords (z.B. "problem-json", "RFC 7807", "error-response") in den 12 yamls
   - Grep auf relevant module-files (z.B. `aggregators/`, `classifiers/`, `modules/`)
   - Cross-Reference mit `scripts/spike/data/patterns.json` für patterns die als Substrate existieren
4. Applicability-Decision: hat die Konzeption ein fire-able fixture in den 4 Specs? (z.B. Idempotency-keys nur relevant für non-idempotent POST → check ob stripe/pagerduty solche definieren)
5. Skip-rationale wenn: Konzeption ist Stage-B-territory (out-of-scope per architecture, z.B. two-spec-diff für #28); Konzeption hat keine yaml/module-detection (echte Lücke); Konzeption ist nicht fire-able auf den 4 Specs (no-fixture-coverage)

**Erwartete Verteilung (Hypothese, wird durch E0 verifiziert):**
- ~15-18 fully-mapped (yaml_rules + module_detections != [])
- ~5-8 mit `skip_rationale` (Stage-B / no-fixture-in-4-specs / arch-out-of-scope)
- ~2-3 echte Lücken die nachgemined oder als known-limitations dokumentiert werden

**Maximalismus-Direktive:** vollständige 28 Einträge — keine Sub-Selection.

### E1 — Multi-Spec Test-Helpers (Pre-Survey 2026-05-10 reduced; subsumiert ehem. T1)

**Pre-Survey-Befund:** Welle Q4 (commit `c8f8658`) hat bereits Integration-Tests für alle 4 Specs gebaut in `run-deterministic-layer.test.ts`. E1 ist daher **nicht** "Test-Framework bauen" sondern **helper-extraction für reuse**.

**Pre-Welle-I-Reduzierung:** mit Welle I done, ist `coverage.json` bereits eine baseline aus EINEM full-run aller 4 Specs. E2 kann coverage.json als baseline nutzen statt 45min full-run pro test-suite-call.

**Output:** Neue Datei `scripts/spike/__tests__/deterministic/multi-spec-helpers.ts` (kein `.test.ts` — pure helpers, keine eigenständigen tests).

**Helper-Signaturen (post-Survey vereinfacht; perDetector-shape ist `Record<detectorId, count>` per types.ts:88):**
```typescript
export type SpecName = 'stripe-full' | 'pagerduty-full' | 'github-rest' | 'dnd5eapi';
export const ALL_SPECS: readonly SpecName[] = ['dnd5eapi', 'pagerduty-full', 'stripe-full', 'github-rest'];

export async function loadSpec(name: SpecName): Promise<object>;
export async function runOnSpec(name: SpecName): Promise<DeterministicLayerResult>;

// Convenience für E2 (consult coverage.json from Welle I, fallback zu live-run wenn missing):
export function loadCoverageBaseline(): { fires_on: Record<string, SpecName[]> };
export function ruleFires(yaml_rule_name: string, baseline: ReturnType<typeof loadCoverageBaseline>): SpecName[];
export function moduleFires(module_name: string, baseline: ReturnType<typeof loadCoverageBaseline>): SpecName[];
```

**Spec-Pfade:** `openapi-examples/{stripe-full,pagerduty-full,github-rest,dnd5eapi}/spec.json`.

**Per-Spec timeout-budgets:**
- `dnd5eapi`: 60s
- `pagerduty-full`: 5min
- `github-rest`: 30min (CLAUDE.md baseline)
- `stripe-full`: 30min (CLAUDE.md baseline post-Welle-Arch+)

**Per-detector breakdown sane checks** (in test-helper, nicht assertions):
- Kein detector dominiert >70% aller findings auf einem Spec (sonst wahrscheinlich misconfiguration)
- Jeder enabled detector emittiert ≥1 finding auf ≥1 Spec (sonst dead code)

**Test-Layout:**
- `describe('Welle E1 — Multi-Spec Pipeline-Runner')` mit 4 `it`-blocks (1 pro Spec)
- Jeder `it` ruft `runFullPipelineOnSpec` + asserts findings.length > 0 + duration < timeout + breakdown sane
- Cache-Pattern: yaml-loading + spectral-build sollte nicht 4× passieren (Spectral instance reuse wo möglich)
- **Reuse-Klausel:** Helper-functions exported für Welle E2, Welle T2 (Snapshot-Tests), Welle V (Cross-Linter-Comparison).

### E2 — Per-Delphi-Rule fires-on-spec assertion + skip-rationale-check

**Output:** `scripts/spike/__tests__/deterministic/springer-delphi-coverage.test.ts`.

**Test-Helper:**
```typescript
export type DelphiCoverageReport = {
  delphi_id: number;
  delphi_rule: string;
  status: 'fires' | 'skipped-with-rationale' | 'uncovered' | 'skip-obsolete';
  fires_on_specs: SpecName[];          // welche Specs eine relevante finding produzierten
  skip_rationale: string | null;
  matched_rules: string[];              // welche yaml-rules / module-detections matched
};

export function assertDelphiCoverage(
  mapping: DelphiMapping,
  results: SpecRunResult[]
): DelphiCoverageReport;
```

**Failure-Logic:**
- `skip_rationale == null && fires_count == 0` → Test-Fail (uncovered Delphi-rule, regression)
- `skip_rationale != null && fires_count > 0` → Test-Warn via `console.warn` (skip-rationale ist obsolet, könnte entfernt werden) + Test passes
- `skip_rationale == null && fires_count > 0` → Test-Pass (covered)
- `skip_rationale != null && fires_count == 0` → Test-Pass (legitimately skipped)

**Test-Loop:** für jedes der 28 SPRINGER_DELPHI_MAPPING-entries ein parametrisierter test-case.

**Output-Generation:** nach Test-Run automatisch `specs/big-spec-architecture-spike-stage-a-putz-benchmark.md` schreiben mit:
- Coverage-Summary (z.B. "23/28 fully-covered + 4 skip-with-rationale + 1 known-limitation")
- Pro-Rule-Tabelle: status + matched-rules + fires-on-specs + skip-rationale wenn applicable
- Per-Spec fire-counts (welcher Spec triggert wieviele Delphi-Rules)
- Diff vs Pre-Welle-E-Audit-Hypothese

### E3 — verified statement + CI-Job + status-updates

**Output 1 — CI workflow:** `.github/workflows/putz-benchmark.yml`:
- Trigger: PR + push auf main + manual workflow_dispatch
- Steps:
  1. Checkout + npm install
  2. `npx vitest run springer-delphi-coverage --testTimeout=2400000` (40min für stripe-full headroom)
  3. Auf Coverage-Regression (any new uncovered) → fail
  4. Upload `specs/big-spec-architecture-spike-stage-a-putz-benchmark.md` als artifact
- Optional: nightly cron für long-running stripe-full check

**Output 2 — Doku-Updates:**
- CLAUDE.md: "27/28 covered + 1 partial" wird zu **verified statement** mit actual-Zahl (z.B. "23/28 fully-covered + 4 skip-with-rationale + 1 known-limitation per Welle-E benchmark commit `<hash>`")
- Memory `project_epic09_spike_handoff.md`: Welle-E-Status-Block
- Plan-Doc §21 Welle-Status-Tracker: E-Zeile gefüllt
- `rules-brainstorm.md:1729-1758` mit Banner: "STALE Stand 2026-05-05 — see `springer-delphi-mapping.ts` für authoritative current state"
- `specs/E09-w-e-springer-delphi-benchmark-results.md` mit deviations + final coverage + risks

**Acceptance Criterion für E3:** Plan-Doc §21 hat E-row gefüllt mit `*-results.md` reference, commit-Hash, Test-Stand, und Coverage-Statement (z.B. "X/28 fully-covered + Y skip-with-rationale").

## Acceptance criteria

Welle E ist done wenn ALLE folgenden erfüllt sind:

1. **E0:** `scripts/spike/data/springer-delphi-mapping.ts` existiert mit 28 vollständigen Einträgen, alle Felder per Type befüllt
2. **E0-Validation:** alle yaml_rules-Referenzen sind valid (existieren in einer der 12 yamls); alle module_detections / walker_detections referenzieren existierende Code-Files
3. **E1:** Multi-Spec Test-Runner läuft alle 4 Specs durch ohne Exception; per-spec results haben sane breakdown
4. **E1-Reuse:** Helper-functions exported für Welle T2 + Welle V Wiederverwendung (kein duplicate scaffolding später)
5. **E2:** `springer-delphi-coverage.test.ts` läuft 28 parametrisierte Tests; jede Delphi-rule entweder PASS (fires oder legitimately-skipped) oder dokumentierter FAIL (uncovered)
6. **E2-Output:** `specs/big-spec-architecture-spike-stage-a-putz-benchmark.md` wird automatisch nach Test-Run generiert mit Coverage-Tabelle
7. **E3-CI:** `.github/workflows/putz-benchmark.yml` existiert + validiert (`act` oder GitHub-actions-lint)
8. **E3-Docs:** CLAUDE.md + handoff-memory + Plan-Doc §21 mit verified-statement updated
9. **E3-Banner:** `rules-brainstorm.md:1729-1758` mit STALE-banner + pointer auf neue mapping-file
10. **Test-Suite grün:** 2772 baseline + neue Tests (28 parametrisierte + helpers); 0 fail von Welle-E-Tests; 3 pre-existing flakes bleiben akzeptiert
11. **Lint + tsc** keine NEW errors; build clean (Welle-D2-Resolution-Pass-State stable)
12. **Commit:** `feat: implement epic 09 / welle E — Springer-Delphi Putz-Benchmark T24`

## Out of scope

- **Welle T2 (Snapshot-Tests pro Module):** kann parallel laufen NACHDEM E1 als Substrate exists, aber nicht in Welle E
- **Welle T3 (CI-Pipeline-Wickelung):** wickelt Welle-E-CI-Job + andere gates ein; nachgelagert
- **Stripe-perf <10min:** explizit in Welle Arch+ deferred zu Welle V (Spectral-bound; benötigt Cross-Linter-Daten zur Decision)
- **Echte 5./6. Reference-Spec:** wenn E0 zeigt dass die 4-spec-set bestimmte Rules nicht fire-able macht (z.B. webhook-rules), wird das als skip-rationale "no-fixture-in-4-spec-set" dokumentiert; Spec-Erweiterung ist post-V territory
- **Lens-9/Lens-10/Lens-11 agent-readiness coverage:** Welle E testet Springer-Delphi (klassische REST-conformance), NICHT agent-readiness — das ist Welle M2 + Welle Z post-V territory
- **Cross-Linter-Comparison gegen Vacuum/Redocly/IBM/OWASP:** Welle V territory; Welle E testet apiq's eigene Coverage-Behauptung gegen einen academic gold-standard, NICHT gegen Konkurrenz

## Domain terms

- **Springer-Delphi:** Springer-Verlag Delphi-Studie zu RESTful API design rules (arXiv 2108.00033). 21 Industry-Experten ranked 82 rules; **28 emerged as high-importance**. Diese 28 sind apiq's load-bearing coverage-gold-standard.
- **Putz-Niveau-Benchmark:** Begriff aus Plan-Doc — "Putzen-First"-Doktrin sagt apiq muss best-in-class deterministischen Linter implementieren BEVOR Cross-Linter-Validation läuft. Putz-Benchmark testet das eigene Putz-Niveau gegen academic-rigor.
- **Authoritative Mapping:** im Gegensatz zur historisch-zitierten Tabelle in rules-brainstorm.md (Stand 2026-05-05, stale): post-Welle-E ist `springer-delphi-mapping.ts` source-of-truth, automatisch CI-validated.
- **fires-on-spec:** eine yaml-rule oder module-detection emittiert ≥1 finding wenn `runDeterministicLayer` auf einer Reference-Spec läuft. Distinct von "rule exists" (Pattern-ID-Niveau) — fires-on-spec ist empirical.
- **skip-with-rationale:** legitime out-of-scope-Markierung (z.B. "two-spec-diff für #28 breaking-changes"). Test passes dafür; coverage-claim bleibt defensible.
- **uncovered:** echte Lücke ohne skip-rationale → Test-Fail. Triggers either follow-up-mining oder explicit-skip-with-rationale-Decision.
- **skip-obsolete:** skip_rationale gesetzt aber rule fires trotzdem → mapping ist outdated, skip-rationale sollte entfernt werden (warning, kein fail).

## Open questions

Keine. Plan-Doc §9 (post-Restructure 2026-05-10) + Pre-Welle-E-Audit-Befund sind source-of-truth. Falls während Implementation emergent Issues auftauchen → werden im Welle-E-results-File post-/dev dokumentiert.

Spezifisch antizipiert:
- **Was wenn E0 zeigt dass die 4-Spec-Set unzureichend ist?** → skip-rationale "no-fixture-in-4-spec-set" + Note für Welle V/post-V Spec-Erweiterung
- **Was wenn echter coverage-loss existiert (z.B. tatsächlich nur 22/28 statt 27/28)?** → ehrliche Korrektur in CLAUDE.md/Memory; verified statement ist die NEW-truth, kein face-saving
- **Was wenn 28-Rules Mapping länger dauert als erwartet?** → keine Time-Pressure per Memory-Regel; vollständige 28 ist Pflicht-Output, kein "minimum-viable-subset"
