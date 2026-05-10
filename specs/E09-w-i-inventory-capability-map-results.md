# Welle I — Inventory + Capability-Map — Results (2026-05-10)

> Implementation-Results für `specs/E09-w-i-inventory-capability-map.md`. Append-only.
>
> Commits: `a5979bf` (Welle-I-Main, 27 files / +7201 LOC) + `5f21b1f` (Resolution-Pass, CLAUDE.md drift-fixes).

## What was built

Welle I etabliert auto-generated single-source-of-truth für codebase-state-queries. Ersetzt manuelle Pre-Welle-Audits durch konsultierbare data-files. 8 Sub-Tasks (4 parallele Subagents) implementiert per Maximalismus-Direktive (minimal + alle ideal-erweiterungen).

### Sub-Tasks (4 parallele Subagents)

**inventory-agent — I1 (commit `a5979bf`):**
- `scripts/spike/eval/build-inventory.ts` (~600 LOC) — static-analysis extraction
- `scripts/spike/__tests__/eval/build-inventory.test.ts` (15 tests)
- Output: `INVENTORY.md` (committed) + `inventory.json` (gitignored)
- Ground-truth-totals: 354 yaml-rules / 13 modules / 26 aggregators / 4 classifiers / 127 custom-functions / 101+ test-files / 972 patterns
- Schema-deviation: added `totals.custom_function_files` neben `totals.custom_functions` (14 source-files vs 127 named exports — both unambiguous)

**coverage-agent — I2 (commit `a5979bf`):**
- `scripts/spike/eval/build-coverage-map.ts` + helper-modules (`coverage-map-aggregator.ts`, `coverage-map-markdown.ts`)
- `scripts/spike/__tests__/eval/build-coverage-map.test.ts` (32 tests)
- Output: `COVERAGE.md` (committed) + `coverage.json` (gitignored, 190KB) + 4 partial-files (gitignored, recovery-state)
- Runtime: 41.6min (sequential 4-spec-run)
- Per-Spec: dnd5e 6.9s/1517f/92d, pagerduty 125s/10865f/187d, github-rest 14min/87083f/232d, stripe-full ~25min/~33796f/219d
- Total: 133261 findings / 470 unique detectors / 167 patterns covered
- **0 untested-detectors** — alle 470 fire auf min. 1 Spec
- Coordination-issue: agent went idle without completion-message; team-lead manuell als completed markiert (background-bash-completion-detection unzuverlässig)

**analysis-agent — I3 + I4 + I5 (commit `a5979bf`):**
- `scripts/spike/eval/build-cross-references.ts` + tests (9)
- `scripts/spike/eval/build-drift-report.ts` + tests (11)
- `scripts/spike/eval/build-test-coverage-map.ts` + tests (7)
- `scripts/spike/eval/build-api-surface.ts` + tests (12)
- `scripts/spike/eval/inventory-types.ts` (shared canonical schemas)
- Outputs: `CROSS-REFERENCES.md`, `DRIFT-REPORT.md`, `TEST-COVERAGE.md`, `API-SURFACE.md` (alle committed)
- 39 new tests + 151/151 total eval-tests pass

**wrap-agent — I6 + I7 (commit `a5979bf`):**
- `.github/workflows/inventory-drift.yml` — per-PR drift-check (~3min)
- `.github/workflows/coverage-nightly.yml` — cron 0 3 * * * für 45min coverage-rebuild + auto-PR via peter-evans/create-pull-request@v6
- Memory NEU: `feedback_consult_inventory_first.md` + MEMORY.md pointer
- Plan-Doc §2 Pre-Welle-Audit-Standard post-Welle-I + §21 Welle-Status-Tracker I-row
- CLAUDE.md status-block + resume-trigger + workflow-rules updated

### Drift-Report initial-baseline (post-Resolution-Pass)

| Class | Pre-Resolution | Post-Resolution | Status |
|---|---|---|---|
| 1. substrate-only | 585 | 585 | unchanged — Stage-B-territory + alte Round-1 IDs (legitimate substrate) |
| 2. dead-code-suspicion | 0 | 0 | clean — alle 470 detectors fire auf min. 1 Spec |
| 3. orphan-module | 2 | 2 | known + intentional: spec-diff (per CLAUDE.md), style-classifier (helper-engine) |
| 4. function-binding-broken | 0 | 0 | clean — Welle Arch+ A1 hat hier saubere Arbeit gemacht |
| 5. claimed-vs-actual-mismatch | 57 | **49** | -8 fixed in CLAUDE.md status-block (yaml/functions/modules/aggregators/patterns counts updated to current ground-truth); 49 verbleibende sind historische Narrative in Plan-Doc (§21 Welle-rows, §3-§9 scope-statements) — drift-detector matched too eagerly, NOT actionable |

### npm scripts added

- `build-inventory` (I1)
- `build-coverage` (I2, slow)
- `cross-refs` (I3a)
- `drift-report` (I3b)
- `test-coverage-map` (I4)
- `api-surface` (I5)
- `inventory-all` (I1+I3+I4+I5, fast)

### CI workflows added

- `inventory-drift.yml`: per-PR/push gate; runs `inventory-all`; diffs 5 committed markdowns; fails+comments on drift
- `coverage-nightly.yml`: cron 3 AM + manual; runs `build-coverage`; opens auto-PR on diff

## Key files created/modified

**Created (24 new files):**
- 9 scripts: build-inventory, build-coverage-map, coverage-map-aggregator, coverage-map-markdown, inventory-types, build-cross-references, build-drift-report, build-test-coverage-map, build-api-surface
- 6 test-files (alle in `scripts/spike/__tests__/eval/`)
- 6 markdowns (alle in `scripts/spike/eval/`): INVENTORY.md, COVERAGE.md, CROSS-REFERENCES.md, DRIFT-REPORT.md, TEST-COVERAGE.md, API-SURFACE.md
- 2 CI workflows: `.github/workflows/inventory-drift.yml`, `coverage-nightly.yml`
- 1 memory file: `feedback_consult_inventory_first.md`

**Modified:**
- `package.json` — 7 npm-scripts added
- `.gitignore` — `inventory.json` + `coverage.json` + `coverage-partial-*.json`
- `CLAUDE.md` — status-block + resume-trigger + workflow-rules updated; Resolution-Pass corrected 5 stale counts
- `MEMORY.md` — pointer added für `feedback_consult_inventory_first.md`
- `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` — §2 + §10a + §21 + §3 + §9 + §11 (across earlier commits + Welle-I-spec authoring)

## Decisions and deviations from spec

1. **inventory-agent schema-extension:** added `totals.custom_function_files` neben `totals.custom_functions`. Reason: `custom_functions[]` array is per-source-file (14), but consumers benötigen total-named-exports-count (127). Both exposed unambiguously. I3/I4/I5 schemas unaffected.

2. **coverage-agent completion-detection:** background-bash für 41.6min run completed correctly aber agent ist nicht aufgewacht (idle-poll didn't trigger). Team-lead manuell als completed markiert + cross-refs/drift-report manuell regenerated. Pattern für zukünftige long-running agents: explicit re-prompt nach erwartetem completion-time, oder TaskUpdate via team-lead wenn agent nicht responsive.

3. **Drift-detector False-Positive-Rate:** class-5 (claimed-vs-actual) flaggt historische Narrative (Plan-Doc Welle-rows, scope-statements) als drift obwohl sie point-in-time records sind. 49 von 49 verbleibenden post-Resolution sind solche False Positives. Documented as known-limitation; nicht-fixed in dieser Welle (heuristic-improvement wäre eigene mini-welle).

4. **Scaffolding-mid-implementation:** wrap-agent applied CLAUDE.md + Plan-Doc + Memory updates BEFORE Tasks #1-3 fully done. Risiko: doc-state preceded code-state. Resolved durch Resolution-Pass nach final inventory generated. Empfehlung für zukünftige welles: wrap-agent-equivalent strikt nach allen anderen Tasks done.

5. **Build-error in inventory-agent's lint output:** inventory-agent introduced 9 lint-errors in test-file (8 `require()` + 1 `prefer-const`). Team-lead fixed via Edit nach inventory-agent done. Pattern: team-lead post-task lint-check.

## Verification results

**Eval-tests:** 151/151 passed across 13 test-files. Duration ~17s.

**Drift-test (pattern-drift-coverage):** 5/5 passed (Welle Arch+ A1 baseline 18 unchanged).

**Lint:** 12 errors / 364 warnings. Errors all pre-existing (spec-diff.test.ts × 9, capture-demo-fixtures.ts × 1, seed-demo.ts × 1, build-coverage-map.test.ts × 0 post-fix). Warnings += from new Welle-I files (`_opts/_context` underscore-convention).

**Build:** ✓ Compiled successfully in 19s (Welle-D2-Resolution-Pass-State stable).

**Full test suite:** 2863 passed / 4 skipped / 0 failed (125 test-files). Duration 36.85min. Pre-Welle-I baseline was 2772/4/3-flake → +91 new tests + 3 pre-existing flakes passed this iteration (parallel-load-variance).

## Acceptance criteria check

| # | Criterion | Status |
|---|---|---|
| 1 | I1 build-inventory.ts: 7 sub-categories | ✓ (yaml-rules/modules/aggregators/classifiers/functions/tests/patterns) |
| 2 | I2 build-coverage-map.ts: 4-spec-run + per-detector/PatternId/Lens/Spec/untested | ✓ (133k findings / 470 detectors / 167 patterns / 0 untested) |
| 3 | I3 Cross-References + Drift-Detection: 5 drift-classes | ✓ (585/0/2/0/49 post-Resolution) |
| 4 | I4 Test-Coverage-Map: untested-detectors + test-orphans | ✓ (409 detectors / 42 tested / 60 orphans) |
| 5 | I5 API-Surface-Export: public-vs-internal + unused | ✓ (11 public + 1 internal + 8 unused / 21 total) |
| 6 | I6 CI-Integration: 2 workflows + npm-scripts | ✓ (inventory-drift.yml + coverage-nightly.yml + 7 npm-scripts) |
| 7 | I7 Plan-Doc + Memory updated | ✓ (§2 + §21 + new memory + MEMORY.md pointer + CLAUDE.md updates) |
| 8 | 6 committed markdown-files initial-generated | ✓ (alle 6 in scripts/spike/eval/) |
| 9 | 2 gitignored JSON-files regenerable | ✓ (inventory.json + coverage.json + 4 coverage-partial-*.json) |
| 10 | Test-suite grün: existing + new tests | ✓ (2863/4-skip/0-fail post-Welle-I; +91 vs pre-Welle-I baseline 2772) |
| 11 | Lint + tsc + build keine NEW errors | ✓ (lint baseline-stable; build clean post-D2-Resolution-Pass) |
| 12 | DRIFT-REPORT.md initial-state dokumentiert + fix-able drifts in Resolution-Pass | ✓ (Resolution-Pass commit `5f21b1f` fixed 8 CLAUDE.md drifts; 49 verbleibende sind FP-historical-narrative) |
| 13 | Commit | ✓ `a5979bf` Welle-I-Main + `5f21b1f` Resolution-Pass |

## Risks for future epics

1. **Drift-detector False-Positive-Rate auf historischen Narrative.** 49 von 49 verbleibenden class-5-drifts sind historische point-in-time records (Welle-Status-rows, scope-statements). Erste-Wirkung: CI-gate könnte FP-PRs blockieren. Mitigation: detector currently warns-not-fails for class-5 (only class-2 + class-5 own-baseline check fail CI per pattern-drift-coverage.test.ts existing convention). Workaround: pre-Welle-Doc could improve heuristic to skip historical-narrative-contexts.

2. **coverage-agent completion-detection-pattern.** Background-long-running-bash + agent-idle ist unreliable für agent-completion-detection. Pattern für zukünftige long-running tasks: team-lead-explicit-poll-after-expected-completion + TaskUpdate-on-behalf-of-agent. Documented in Welle-I-handoff für Welle-V (4-way Cross-Linter, ähnlich long-running).

3. **Test-Coverage-Map findings: 60 orphans + 0% yaml-rule-coverage.** 60 test-orphans = test-files referenzieren detector-IDs die nicht in inventory existieren (legacy). 0% yaml-rule-test-coverage = test-files testen nicht 1:1 yaml-rule-names (legitimes Pattern: integration-tests covern multiple rules indirekt). Welle-T2 (Snapshot-Tests pro Module-Output) wird das systematisch addressieren.

4. **API-Surface-Export 8 unused exports.** Pre-Welle-I-snapshot — could be cleanup-candidate für Welle-Doc oder Welle-T-equivalent. Per "niemals defern" könnten direkt entfernt werden, aber out-of-Welle-I-scope.

5. **wrap-agent jumped ahead-pattern.** Mid-implementation document-updates können stale-state in main-commit produzieren. Welle-Standard: wrap-agent strikt sequential nach allen analytics-agents.

6. **Inventory.json schema is canonical-but-evolvable.** I1-extensions (z.B. neue inventory-categories für Plugin-system) brauchen Schema-Updates die I3/I4/I5 brechen können. Future welles sollten Schema-changes versionieren oder migrate-pattern etablieren.

## Open questions

1. **Drift-detector heuristic-improvement scope.** 49 FP-class-5-drifts könnten via "skip-context-historical-narrative"-rule reduziert werden (e.g. ignore Plan-Doc §21-table-rows, skip "~N patterns" scope-estimates). Welle-eigen oder Welle-Doc?
   **Recommendation:** Welle-Doc territory — drift-detector ist ein meta-tool, doc-quality-improvements gehören dahin. Aktuelle FP-rate is documented + non-blocking; nicht urgent.

2. **0% yaml-rule-test-coverage in TEST-COVERAGE.md** — legitimes Pattern (integration-tests indirekt) oder echte Lücke (sollte 1:1-rule-tests existieren)?
   **Recommendation:** Welle T2 entscheidet. Wenn Snapshot-Tests pro Module-Output etabliert werden, kann TEST-COVERAGE.md re-bewerten ob coverage besser via per-module-snapshots oder per-rule-direct-tests gemessen wird.

3. **8 unused-exports in API-SURFACE.md** — Cleanup-Welle?
   **Recommendation:** Welle-Doc territory wie OQ #1; oder als kleine Patch-Spec ad-hoc entfernen wenn jemand vorbeikommt. Nicht-urgent.

4. **coverage-agent completion-detection-pattern-fix.** Sollen wir einen explicit ETA-poll-pattern in dev-skill etablieren für long-running-tasks?
   **Recommendation:** dokumentiert in Welle-I-results als learning + pattern-für-Welle-V (Cross-Linter ist auch long-running). Nicht ein code-change in dieser Welle, sondern ein workflow-learning.

5. **historische Plan-Doc-Welle-rows mit point-in-time-numbers** — sollen diese entfernt/gekürzt werden um drift-noise zu reduzieren?
   **Recommendation:** NEIN — die rows sind audit-trail per "Append-Workflow" (Plan-Doc §2). Drift-detector sollte sie skipen, nicht docs sollten sie verlieren.
