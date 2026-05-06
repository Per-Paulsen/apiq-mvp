# Epic 09 / Welle Q — Code-Quality-Cleanup

> Orthogonale Code-Quality-Welle des Stage-A-Restwork-Plans. Adressiert 5 unabhängige Cleanups die parallel zu allen anderen Wellen laufen können. Q1 ist Phase-B-Pre-Condition (Token-Budget-Math); Q2-Q5 sind Hygiene-Fixes.
>
> Source-Plan: [`specs/big-spec-architecture-spike-stage-a-restwork-plan.md`](./big-spec-architecture-spike-stage-a-restwork-plan.md) §10. Audit-Reports: [`specs/big-spec-architecture-spike-stage-a-implementation-audit.md`](./big-spec-architecture-spike-stage-a-implementation-audit.md) + [`specs/big-spec-architecture-spike-stage-a-claim-audit.md`](./big-spec-architecture-spike-stage-a-claim-audit.md). Run-Output: [`specs/big-spec-runs/eval/STAGE-A-RESULTS.md`](./big-spec-runs/eval/STAGE-A-RESULTS.md).

## Scope

Welle Q hat 5 unabhängige Sub-Aufgaben (Q1-Q5). Alle können in einem `/dev`-Run abgearbeitet werden. Alle ändern nur Pipeline-/Eval-Code, NICHT die 110 Spectral-Rules / 16 Walker / 15 Module-Klassen-Logik.

### Q1 — codegen-validation Output-Aggregation (Phase-B-Pre-Condition)

**Problem.** `codegen-validation.ts` (Modul T7, wired in W2) emittiert per-occurrence `DetectorFinding`-Records — auf github-rest **9.834 separate Findings** für ein Root-Problem (`codegen:openapi-typescript:validation-problem`). Aktuell sprengt das jeden naive 3-Layer-Cleanup im Phase-B-Token-Budget (siehe `phase-b-design.md` §2 Token-Budget-Math caveat).

**Acceptance Criteria.**

- **Aggregation-Layer im output-mapper** (`scripts/spike/deterministic/output-mapper.ts`): nach `mapDetectorFindings` aggregiere alle Findings deren `detectorId` mit `codegen:` startet zu **maximal 1 Finding pro distinct (`ruleCode`)-Wert**. Aggregierte Finding-Shape:
  - `detectorId`: original (z.B. `codegen:openapi-typescript:validation-problem`)
  - `title`: `"<original-title> (aggregated, N occurrences)"` — z.B. `"openapi-typescript validation problem (aggregated, 9834 occurrences)"`
  - `narration`: prepended mit `"Aggregated from N raw codegen findings on M distinct sourcePaths. Top sample paths: <bis zu 10 distinct sourcePaths, comma-separated>."`
  - `affectedEndpoints`: deduped union aller Endpoints aus den raw-findings
  - `meta.aggregateOccurrences`: count (number)
  - `meta.aggregateSourcePaths`: bis zu top-10 distinct sourcePaths (string array)
  - Severity = max severity der raw-findings (critical > high > medium > low)
- **Implementation-Detail:** Aggregation passiert AUSSCHLIESSLICH für `detectorId.startsWith('codegen:')` — keine Auswirkung auf Spectral / Walker / andere Module.
- **Konfigurierbar via `DetectorOptions`-Erweiterung:** `aggregateCodegen?: boolean` (default `true`). Wenn `false`, raw-findings kommen durch (für Tests / debugging).
- **Tests:**
  - Unit-Test in `scripts/spike/__tests__/deterministic/codegen-aggregation.test.ts`: synthesizes 100 raw `codegen:openapi-typescript:validation-problem` findings + 50 raw `codegen:openapi-typescript:resolver-warning` findings → expects 2 aggregated findings (1 per rule-code) with `aggregateOccurrences: 100` und `50`.
  - Integration-Test (extend `run-deterministic-layer.test.ts`): assert auf dnd5eapi dass `result.findings` keine `codegen:`-Findings mit doppeltem `ruleCode` enthält.
  - Regression-Check: full test-suite (`npx vitest run`) bleibt grün post-Implementation.
- **Output-Validation:** nach Q1 wird auf github-rest `runDeterministicLayer` ~21k Findings statt 30.939 Findings emittieren (delta = 9.834 codegen-findings → 1 aggregated). Falls real-Reduction signifikant abweicht: Mismatch-Investigation als sub-task.

**Out of Scope.** Module-internal-Aggregation in `codegen-validation.ts` selbst. Phase-B-Compaction-Layer-2 implementation. Andere per-occurrence-Walker (z.B. `apiq-cl1-property-name-reserved-keyword` mit 2.662 occurrences auf github-rest) — Aggregation ist codegen-spezifisch in dieser Welle.

### Q2 — OPENAI_API_KEY env-loading Fix

**Problem.** `scripts/spike/eval/stage-a-validation.ts` ruft `dotenv.config()` auf `scripts/spike/.env` + `<repo>/.env`, aber im W4-Run war `OPENAI_API_KEY` nicht im Process-Environment, obwohl im `.env`-File vorhanden. Embedding-Scorer wurde komplett übersprungen (`process.env.OPENAI_API_KEY` was undefined). Per pre-W2-Run vorher hatte Embedding +7-15pp Coverage-Lift gegenüber Jaccard.

**Acceptance Criteria.**

- **Diagnose first:** lokal `cd scripts/spike && npx tsx eval/stage-a-validation.ts dnd5eapi` ausführen mit `console.log({ openai: process.env.OPENAI_API_KEY ? 'set' : 'missing' })` als debug-step. Identifizieren wo das Loading-Problem liegt:
  - (a) dotenv lädt aber überschreibt nicht weil bereits in env? — unwahrscheinlich
  - (b) dotenv-Path falsch — z.B. relative-path-issue mit `__dirname` resolution
  - (c) Spike `.env` hat key in falscher Form (z.B. quoted ohne `OPENAI_API_KEY="..."`-Format)
  - (d) Repo-root `.env` hat den key nicht
- **Fix gemäß Diagnose:**
  - Falls (b): explicit absolute path mit `path.resolve(__dirname, '..', '.env')` + check.
  - Falls (c): debug + ggf. fix `.env`-File (aber nicht committen!).
  - Falls (d): das ist Setup-Issue nicht Code-Issue — dokumentieren.
- **Erweiterung:** falls beide `.env` (spike + repo-root) den key NICHT haben, früh-fail mit klarem Error-Message: `"OPENAI_API_KEY not found in process.env after loading .env files. Embedding-scorer will be skipped. Add OPENAI_API_KEY=... to scripts/spike/.env or repo-root .env to enable embedding-scoring."`
- **Tests:** kein neuer Test (env-loading ist runtime-config, nicht logic). Stattdessen: nach Fix, `cd scripts/spike && npx tsx eval/stage-a-validation.ts dnd5eapi` ausführen + verify dass embedding-scorer NICHT geskippt wird (sichtbar in stdout: kein `"skipping embedding scorer (OPENAI_API_KEY not set)"`).
- **Verifikation:** post-Q2 ein Re-Run von `stage-a-validation.ts` für mindestens 1 Spec produziert Embedding-Coverage-Numbers in `STAGE-A-RESULTS.md` (zusätzlich zu Jaccard).

**Out of Scope.** Re-Run von stage-a-validation auf alle 4 Specs (das ist Welle V's V2-Job). Mock/test-mode für embedding-scorer.

### Q3 — Layer-Tagging cosmetic

**Problem.** `DetectorLayer` Type-Union in `scripts/spike/deterministic/types.ts` hat 4 Tags: `'spectral-oas3-default' | 'spectral-apiq-custom' | 'walker-statistical' | 'domain-knowledge'`. Module-class-Findings (15 wired modules) tagen sich aktuell als `walker-statistical` (per individuellen Modul-Code-Comments dokumentiert). Resultat: `runDeterministicLayer.perLayer` undercount-t module-class contribution.

**Acceptance Criteria.**

- **DetectorLayer-Type erweitern** in `scripts/spike/deterministic/types.ts`:
  ```typescript
  export type DetectorLayer =
    | 'spectral-oas3-default'
    | 'spectral-apiq-custom'
    | 'walker-statistical'
    | 'module-class'        // NEW
    | 'domain-knowledge';
  ```
- **`runDeterministicLayer.perLayer` initialization** (in `index.ts`): neuen Key `'module-class': 0` hinzufügen.
- **Modul-Layer-Tag-Migration:** in jedem der 15 wired modules das `layer:`-Field auf `'module-class'` setzen (oder besser: in `modules/index.ts` ein post-collection step der alle Findings vom `runModules`-call retagt zu `'module-class'` falls sie aktuell `'walker-statistical'` tragen — vermeidet dass jedes Modul einzeln editiert werden muss).
- **Decision (im Spec verankert):** post-collection-Retagging in `modules/index.ts` ist der einfachere Weg. Implementation:
  ```typescript
  // in modules/index.ts runModules():
  const findings = await mod.fn(spec, opts);
  // Retag to module-class layer (modules historically self-tagged as walker-statistical
  // because DetectorLayer union didn't have a module-class entry)
  for (const f of findings) {
    if (f.layer === 'walker-statistical') f.layer = 'module-class';
  }
  all.push(...findings);
  ```
- **Tests:**
  - Update existing `run-deterministic-layer.test.ts` integration test: assert `result.perLayer['module-class']` ist `> 0` post-run auf dnd5eapi (alle 15 module-classes feuern auf dnd5eapi mindestens 1 Finding).
  - Regression: full test-suite bleibt grün.

**Out of Scope.** Refactoring der Module-Files selbst (das ist Welle Arch). Output-Reporting / UI-Filter for-each-layer (post-launch).

### Q4 — Integration-Tests auf weitere Specs

**Problem.** Nur 1 Integration-Test (`run-deterministic-layer.test.ts` auf dnd5eapi). Pipeline-Crashes auf den 3 größeren Specs (stripe-full / pagerduty-full / github-rest) würden nicht von Tests gefangen — nur vom CLI-Run. github-rest mit 30.939 Findings + stripe-full mit 12.947 Findings sind die Stress-Tests die fehlen.

**Acceptance Criteria.**

- **Erweitere `scripts/spike/__tests__/deterministic/run-deterministic-layer.test.ts`** um 3 zusätzliche `it()` blocks (oder besser: split in 4 separate test files für klarere Test-Ownership):
  - `it('runs end-to-end on stripe-full without crashing and produces findings', async () => { ... })` — timeout 180000ms (3min), expects findings count > 5000 post-Q1-aggregation (war ~12.947 pre-Q1 — post-Q1 vermutlich ~3.500-4.000), expects `perDetector` >> 10 distinct detectors, expects `result.findings.every(f => typeof f.title === 'string')`.
  - `it('runs end-to-end on pagerduty-full without crashing and produces findings', async () => { ... })` — timeout 180000ms, expects findings > 3000 post-Q1, expects `perLayer['module-class'] > 0` (Q3 tag).
  - `it('runs end-to-end on github-rest without crashing and produces findings', async () => { ... })` — timeout 240000ms (4min), expects findings > 15000 post-Q1 (war 30.939 pre-Q1 — post-Q1 ~21.000), expects no module crash.
- **Each test loads spec via:**
  ```typescript
  const specPath = path.join(REPO_ROOT, 'openapi-examples', '<spec>', 'spec.json');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  ```
- **Test-Suite-Total nach Q4:** 791 + 3 = 794 tests pass / 36 files.
- **Regression-Check:** alle 3 neuen Tests müssen zusammen unter ~10 min wallclock laufen (parallel via Vitest's `it.concurrent` falls möglich + Resourcen passend).

**Out of Scope.** Snapshot-Tests pro Module-Output (das ist Welle T's T2-Job). CI-Pipeline (Welle T's T3). Performance-Optimization der Pipeline.

### Q5 — STAGE-A-PREDICTIONS.md stale-marker

**Problem.** `specs/big-spec-runs/eval/STAGE-A-PREDICTIONS.md` enthält Phase-0-Hypothesen die durch W4 empirisch invalidiert wurden (-20.7pp bis -61.1pp Delta vs predicted). Datei wird aktiv von `scripts/spike/eval/stage-a-validation.ts:162` gelesen (`loadPredictions`). Kann nicht gelöscht werden, aber muss als invalidated markiert sein damit niemand die Numbers zukünftig wieder als gültig liest.

**Acceptance Criteria.**

- **Header anhängen** an den Anfang von `specs/big-spec-runs/eval/STAGE-A-PREDICTIONS.md` (BEFORE existing content):
  ```markdown
  > ⚠️ **EMPIRICALLY INVALIDATED 2026-05-06.** Phase-0-Hypothesen unten sind durch W4-Measurement gefalsifiziert (-20.7pp bis -61.1pp Delta vs predicted; siehe `STAGE-A-RESULTS.md`).
  >
  > **Strategischer Befund:** die Coverage-Lücke ist LLM-territory (Lens 3/5/8/9), nicht deterministic-territory. Welle C/D/E würde 0-3pp lift bringen, nicht 50pp. Phase-B ist der eigentliche Hebel.
  >
  > **Loader-Note:** `scripts/spike/eval/stage-a-validation.ts:162` (`loadPredictions`) liest diese Datei für Comparison-Tabellen. Datei NICHT regenerieren ohne neue Hypothesen-Round (would-be: post-Welle-V Re-Predict basierend auf 4-way-Cross-Linter-Output).

  ---

  ```
- **Nichts unterhalb des `---` separator ändern** — die existing predictions stay as-is for loader-compat.
- **Cross-Reference-Update**: in `CLAUDE.md` "Next" und in `phase-b-design.md` falls noch Verweise auf Predictions ohne Stale-Marker — alle aktuell schon synced per Doc-Sync v2.
- **Tests:** keine.
- **Verifikation:** `loadPredictions` in `stage-a-validation.ts` wird nicht beeinflusst (Header ist über `---` separator + Markdown-Block-Quote — Parser im script `:169` matched per regex `^|\s*([\w-]+)\s*\|...` was Header nicht matched).

**Out of Scope.** STAGE-A-PREDICTIONS.md neu schreiben mit post-W4-Hypothesen (das wäre eigene Aufgabe, nicht Welle-Q-Cleanup).

## Tests + Verification

Nach allen Q1-Q5 done:

1. **Test-Suite**: `cd scripts/spike && npx vitest run` → erwartet: 794 tests pass / 36 files / 2 skipped (war 791 pre-Q).
2. **Manual-Verification** post-Q2: `cd scripts/spike && npx tsx eval/stage-a-validation.ts dnd5eapi` ausführen + verify dass embedding-scorer NICHT geskippt wird.
3. **Aggregation-Reduction-Check** post-Q1: github-rest Findings-Count via `npx tsx scripts/spike/eval/stage-a-validation.ts github-rest` sollte signifikant reduziert sein (~21k statt 30.939).
4. **Layer-Tag-Check** post-Q3: integration-tests `result.perLayer['module-class'] > 0` assertions passen.

## Out of Scope (verschoben auf andere Wellen)

- **Snapshot-Tests pro Module**: Welle T (T2)
- **CI-Pipeline mit T24-Putz-Benchmark + T25-Source-Verify als Gates**: Welle T (T3)
- **Module-internal aggregation logic** (codegen-validation.ts internal): out-of-scope dieser Welle, möglicherweise Welle Arch
- **STAGE-A-PREDICTIONS regenerate mit post-W4-Hypothesen**: spätere eigenständige Aufgabe nach Welle V
- **Re-Run stage-a-validation auf alle 4 Specs nach Q1+Q2-Fixes**: Welle V (V2)

## Commit-Convention

Per CLAUDE.md "Workflow rules": Commit-Format `feat: implement epic 09 / welle Q — code-quality-cleanup`. Optional: Q1-Q5 als separate commits falls /dev das so structured emittet (Q1 könnte als "feat: codegen output-aggregation"; Q2 als "fix: env-loading"; Q3 als "refactor: layer-tagging"; Q4 als "test: integration-tests on 3 specs"; Q5 als "docs: stale-marker on STAGE-A-PREDICTIONS").
