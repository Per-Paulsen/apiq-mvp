# Epic 09 / Welle Q — Code-Quality-Cleanup — Results

> **Done:** 2026-05-06. Welle Q (Q1-Q5) implementiert via /dev workflow mit 4 parallelen Subagents (q1-aggregation, q3-layer-tagging, q2q5-env-marker, q4-integration). Alle acceptance-criteria erfüllt, Tests grün, keine Module-Crashes, kein Spec-Deviation außer den in §"Deviations" genannten Detail-Choices.
>
> Spec: [`specs/E09-w-q-code-quality-cleanup.md`](./E09-w-q-code-quality-cleanup.md). Plan: [`specs/big-spec-architecture-spike-stage-a-restwork-plan.md`](./big-spec-architecture-spike-stage-a-restwork-plan.md) §10 + §21.

---

## What was built

### Q1 — codegen-validation Output-Aggregation
- **`scripts/spike/deterministic/output-mapper.ts`**: neue exportierte `aggregateCodegenFindings(findings)` Helper-Funktion + erweiterte `mapDetectorFindings(findings, opts?)`-Signatur. Aggregation: `detectorId.startsWith('codegen:')` → grouping by `detectorId` → 1 aggregierte DetectorFinding pro Group mit `meta.aggregateOccurrences`, `meta.aggregateSourcePaths` (top-10 distinct), severity-max (rank: critical>high>medium>low), deduped `affectedEndpoints`. Single-Group-Findings (count=1) bleiben unverändert.
- **`scripts/spike/deterministic/types.ts`**: `DetectorOptions.aggregateCodegen?: boolean` (default true).
- **`scripts/spike/deterministic/index.ts`**: `mapDetectorFindings(collected, opts)` reicht opts durch.
- **`scripts/spike/__tests__/deterministic/codegen-aggregation.test.ts`** NEU: 8 Tests aller Codegen-Aggregation-Pfade (aggregation on/off, multi-rule-codes, deduplication, severity-max, sourcePaths-top-10).

### Q2 — OPENAI_API_KEY env-loading Fix
- **`scripts/spike/eval/stage-a-validation.ts`**: SPIKE_DIR-Pfad-Bug behoben (`path.resolve(__dirname, '..', '..')` → `path.resolve(__dirname, '..')` weil `__dirname = scripts/spike/eval/`). Plus reverse load-order (REPO_ROOT zuerst, SPIKE_DIR mit `override: true` danach) + early-fail-warn-block der missing `OPENAI_API_KEY` mit aufgelösten Pfaden + `exists`-Checks meldet.
- **Verifikation:** `npx tsx eval/stage-a-validation.ts --specs=dnd5eapi` zeigt `running embedding scorer (text-embedding-3-small @ threshold 0.55)` + `embedding coverage: 12/14 = 85.7%` — vor Q2 wurde scorer geskippt.

### Q3 — module-class Layer-Tag
- **`scripts/spike/deterministic/types.ts`**: `'module-class'` zur `DetectorLayer` Union hinzugefügt.
- **`scripts/spike/deterministic/output-mapper.ts`**: `'module-class': '[module]'` in `LAYER_TAGS` map (Q1-Agent hatte das bereits ergänzt damit Record exhaustive bleibt während Q1's edits — Q3 hat verifiziert + komplettiert).
- **`scripts/spike/deterministic/index.ts`**: `'module-class': 0` zur `perLayer` initialization in `runDeterministicLayer`.
- **`scripts/spike/deterministic/modules/index.ts`**: post-collection retag-Loop in `runModules` — `walker-statistical` → `module-class` für jede Modul-Finding. Header-Comment rewritten reflecting Q3-Resolution.
- **dnd5eapi perLayer post-Q3:** `spectral-oas3-default: 116, spectral-apiq-custom: 338, walker-statistical: 5, module-class: 24, domain-knowledge: 0` (vorher: alle 24 module-Findings als walker-statistical mit-getallt, undercount-d die 16 walker-Findings).

### Q4 — Integration-Tests auf 3 Specs
- **`scripts/spike/__tests__/deterministic/run-deterministic-layer.test.ts`**: 3 neue `it()`-Blocks in bestehender `describe('runDeterministicLayer integration', ...)`. Identische Assertion-Struktur pro Test (findings-count > Threshold, perDetector-keys > 10, alle title-Strings non-empty, perLayer['module-class'] > 0).

### Q5 — STAGE-A-PREDICTIONS stale-marker
- **`specs/big-spec-runs/eval/STAGE-A-PREDICTIONS.md`**: Warn-Block ganz oben eingefügt (3 Absätze: empirically-invalidated / strategischer-befund / loader-note) + `---` separator. Original-Content unverändert. Loader-Regex `loadPredictions` in `stage-a-validation.ts:169` matched garantiert nichts im Block (nutzt `>` quote-markdown, keine `|`-pipe-rows).

---

## Key files (modified/created)

| File | Welle | Type |
|---|---|---|
| `scripts/spike/deterministic/output-mapper.ts` | Q1 + Q3 | M |
| `scripts/spike/deterministic/types.ts` | Q1 + Q3 | M |
| `scripts/spike/deterministic/index.ts` | Q1 + Q3 | M |
| `scripts/spike/deterministic/modules/index.ts` | Q3 | M |
| `scripts/spike/eval/stage-a-validation.ts` | Q2 | M |
| `scripts/spike/__tests__/deterministic/codegen-aggregation.test.ts` | Q1 | NEW |
| `scripts/spike/__tests__/deterministic/run-deterministic-layer.test.ts` | Q3 + Q4 | M |
| `specs/big-spec-runs/eval/STAGE-A-PREDICTIONS.md` | Q5 | M (header) |
| `specs/big-spec-runs/eval/STAGE-A-RESULTS.md` | Q2-verify | M (regenerated for dnd5eapi-only — wird in Welle V V2 final regeneriert) |
| `specs/E09-w-q-code-quality-cleanup.md` | (Welle-Spec) | NEW |

---

## Decisions and deviations from spec

1. **Q1 Pattern-Choice — beide Pfade exposed.** Spec ließ Wahl offen zwischen "modify mapDetectorFindings signature" vs "new helper". q1-aggregation hat BEIDE: `aggregateCodegenFindings(findings)` als pure exported helper UND `mapDetectorFindings(findings, opts?)` mit erweiterter Signatur. Helper-Export erleichtert Unit-Tests + zukünftige opt-out-Pfade. Code-Comment dokumentiert die Wahl.

2. **Q1 Aggregation-Ordering.** Output preserviert Insertion-Order des first-seen Findings einer Group (nicht stable-sort by detectorId). Spec spezifiziert das nicht explizit; Verhalten ist getestet + deterministisch.

3. **Q1 Cross-Pollution mit Q3.** Während q1-aggregation auf output-mapper.ts arbeitete, ist parallel der `module-class`-Layer-Tag von q3-layer-tagging in `DetectorLayer`-Union + `perLayer`-Init aufgetaucht. q1-Agent musste `LAYER_TAGS['module-class'] = '[module]'` ergänzen, sonst wäre `Record<DetectorLayer, string>` nicht mehr exhaustive und der Build hätte gebrochen. Minimal-invasiv, Q3-Spec-conform.

4. **Q4 Threshold-Choice.** Spec-Estimate "post-Q1 ~3.500-4.000 für stripe-full" war off — gemessen 9.513 (stripe-full's codegen-Anteil war kleiner als spec-estimate annahm: ~3.430 codegen → 1 aggregated, also Reduktion ~36% nicht ~74%). Q4-Agent setzte Schwellenwerte gemäß tatsächlich gemessenem Wert (50% rule): stripe-full > 4000, pagerduty-full > 1500, github-rest > 10000.

5. **Q4 Test-File-Choice.** Spec nannte "split in 4 separate test files" als Alternative. Q4 ist bei einer Datei geblieben (extending statt splitten) — einfacher, Test-Ownership ist mit prefix-konformen Test-Namen klar genug.

---

## Verification results

### Test counts

| Was | Count |
|---|---:|
| Pre-Welle-Q baseline | 791 passed / 36 files / 2 skipped / 0 fail |
| Q1 added (codegen-aggregation.test.ts) | +8 tests |
| Q3 added (existing test +1 assertion) | +0 tests (extension) |
| Q4 added (3 integration-tests in existing file) | +3 tests |
| **Post-Welle-Q total** | **802 passed / 36 files / 2 skipped / 0 fail** |

`cd scripts/spike && npx vitest run` → 274.20s (4m37s) total wallclock.

### Lint

`npx eslint scripts/spike/deterministic/output-mapper.ts ...` (targeted on Welle-Q-files): **0 errors / 2 pre-existing warnings** (unused `label` param + unused `JaccardScorer` import — both pre-Welle-Q).

Full-repo `npm run lint` shows 12 errors / 206 warnings — all in **pre-existing** files (run-prompt.ts, token-count-precheck.ts, src/lib/seed-demo.ts), **none in Welle-Q-changed files**.

### Manual Verification

- **Q1:** new `codegen-aggregation.test.ts` 8 tests passed. Pre-existing dnd5eapi integration-test passes without threshold adjustment (existing thresholds were soft `> 0` and `> 5`).
- **Q2:** `npx tsx eval/stage-a-validation.ts --specs=dnd5eapi` post-fix → embedding-scorer runs, prints `embedding coverage: 12/14 = 85.7%`. Pre-fix: skipped silently.
- **Q3:** integration-test on dnd5eapi assertion `result.perLayer['module-class'] > 0` passes (24 module-class findings observed).
- **Q4:** 3 new integration-tests on stripe-full / pagerduty-full / github-rest pass within their timeouts (89s / 36s / 130s respectively). No module-crashes in stderr.

### Module-Crashes

**Keine.** Alle 3 large-spec runs (stripe-full, pagerduty-full, github-rest) haben sauber durchgelaufen ohne dass ein per-module `try/catch`-fallback in `runModules` oder `runWalkers` gefeuert hat. Einzige stderr-Warning: pre-existing `[spectral-runner] skipping rule "apiq-comma-separated-should-be-array"` (RULE_CRASH_BLOCKLIST entry).

---

## Risks for future epics

1. **STAGE-A-RESULTS.md ist aktuell dnd5eapi-only** weil Q2-verify-run die Datei regeneriert hat (mit nur 1 Spec). Welle V (V2) muss `stage-a-validation.ts` final auf alle 4 Specs laufen lassen + Datei komplett regenerieren mit Embedding-Coverage. Bis dahin: STAGE-A-RESULTS.md ist unvollständig + sollte nicht für Phase-B-Token-Budget-Math herangezogen werden.

2. **Q1 Aggregation gilt nur für `codegen:*` detectorIds.** Andere per-occurrence-Walker (z.B. `apiq-cl1-property-name-reserved-keyword` mit 2.662 occurrences auf github-rest) bleiben un-aggregated. Falls Phase-B-Token-Budget weiter sprengt nach Q1, müssen weitere Walker aggregations-aware werden — entweder generisches Pattern-ID-grouping oder dedicated aggregator pro problematic Walker. Welle T's Snapshot-Tests werden helfen das zu monitoren.

3. **Welle F (Framework-Optimization) wird in YAML-rule metadata-promotion 110 rules + die 23 walker/module-rules touchen.** Q3 hat den Layer-Tag eingeführt — Welle F muss sicherstellen dass apiq-meta für module-class-Findings ebenso vollständig ist wie für walker-statistical. Plus: F4 muss spectral-runner.ts erweitern um `apiq-meta:`-Block durchzukopieren — das ist orthogonal zu Q3 aber sollte koordiniert sein wenn Welle F läuft.

4. **Welle Arch (Refactoring) möchte `scripts/spike/deterministic/` flat → classifiers/aggregators/modules/rules subtrees splitten.** modules/index.ts existiert schon — Welle Arch wird das beibehalten + walkers/ → aggregators/ umbenennen. Q3's perLayer 'module-class' tag bleibt unverändert nach Refactor.

5. **Q4 Integration-Tests sind serial (Vitest serial default).** github-rest braucht 130s allein. Bei Welle T's CI-Pipeline (T3) müsste man entweder parallelisieren oder die langen integration-tests in dedicated CI-stage isolieren um total-runtime nicht über 5min zu treiben.

---

## Open questions

1. **Soll die `aggregateCodegen` default-Policy von `true` (current) auf `'auto'` umgestellt werden?** Aktuell aggregiert immer wenn nicht explizit deaktiviert. Eventuell: `auto` = aggregate wenn count > 100, sonst raw. Vorteil: kleine Specs sehen alle codegen-Findings; große Specs werden komprimiert.
   **Recommendation:** Pre Phase-B noch nicht ändern — aktueller default `true` ist consistent + Phase-B-friendly. Falls Welle V's Cross-Linter-Compare zeigt dass kleine Specs durch Aggregation Information verlieren, das in Phase-B-Engineering thresholdshohe-config umstellen.

2. **`affectedEndpoints` in aggregierten Findings ist deduped union — könnte bei einem Pattern auf 1145 endpoints (github-rest) groß werden (max ~1145 entries).** Phase-B-Token-Budget muss das berücksichtigen — eine codegen-aggregated finding könnte ~50KB JSON sein wenn alle 1145 endpoints in `affectedEndpoints` stehen.
   **Recommendation:** In Welle F (F4 metadata-promotion) plus Welle T (Snapshot-Tests) cap auf max 50-100 affectedEndpoints pro aggregated finding einbauen, mit `affectedEndpointsTotal: 1145` als zusätzlicher meta-field. Phase-B-Cleanup-Layer-3 Per-Endpoint-Slicing reicht dann den vollen list aus dem raw findings durch.

3. **STAGE-A-RESULTS.md regeneration-Zyklus.** Q2-verify hat die Datei mit nur dnd5eapi überschrieben. Welle V V2 wird final regenerieren. Aber: zwischen jetzt und Welle V werden weitere Wellen (M / F / C / D / D2 / E / R) andere Tests laufen lassen die via `stage-a-validation.ts` die Datei regenerieren würden — jedes Mal neu/unvollständig.
   **Recommendation:** kurzes Refactoring von `stage-a-validation.ts` so dass `--specs=X,Y,Z` argument NICHT die ganze Datei überschreibt sondern nur die relevanten Sections updatet (oder explicit `--write-output=path` flag). Wäre Q-follow-up oder Q6 in einer späteren Session. Jetzt nicht load-bearing.

4. **Q3 retagging-Approach** ist post-collection in `modules/index.ts` (statt jedes Modul direkt zu modifizieren). Funktioniert sauber, aber: wenn ein Modul intentional `domain-knowledge` oder `spectral-apiq-custom` taggen würde (zukünftig), wäre der Retag too aggressive (würde nur `walker-statistical` → `module-class` retag, andere bleiben).
   **Recommendation:** in Welle F (F4 metadata-promotion) sollte das Retag-Pattern durch explizites `mod.layer = 'module-class'` field auf `ALL_MODULES`-entries ersetzt werden. Aktueller Retag bleibt korrekt für jetzige Module-Set; Welle F kann's robustifizieren.

---

## Commit-Plan

2 Commits geplant für sauberen Audit-Trail:

1. **`docs: epic 09 — restwork plan v2 + audit-reports + doc-sync`** — alle markdown-Files in specs/ + CLAUDE.md (Plan-Doc + Audit-Reports + Phase-B-design + meta-insights + implementation-priority + STAGE-A-PREDICTIONS Q5-marker)
2. **`feat: epic 09 / wellen W2 + W3 + W4 + Q — pipeline-wiring + threat-rules + cleanup`** — alle code/test/spec-files (modules/index.ts + apiq-ruleset-threat-p1.yaml + output-mapper.ts + types.ts + index.ts + tests + stage-a-validation.ts + STAGE-A-RESULTS.md + welle-q-spec)

Die Multi-Welle-Bündelung im 2. Commit reflektiert dass W2/W3/W4-Implementations in vorherigen Sessions begonnen wurden aber niemals committed wurden (44 commits ahead of origin pre-this-session, post-W4 working tree clean per `git status`, jetzt wieder dirty durch Welle Q).
