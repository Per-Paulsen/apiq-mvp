# Pre-Welle-E Code-Survey (2026-05-10)

> Investigation vor `/dev` zur Reduktion von Welle-E-Implementation-Uncertainty.

## TL;DR

Welle E ist **deutlich besser vorbereitet** als der initial-Audit suggested. Welle Q4 hat bereits Integration-Tests für alle 4 Specs gebaut (was ich als "T1 = nicht da" annahm). E1-Scope schrumpft erheblich: nur noch helper-extraction für reuse, kein neu-Integration-Tests-bauen. E0 + E2 bleiben unverändert in Scope.

## Area 1 — Existing Test-Infrastructure

**Befund:** `scripts/spike/__tests__/deterministic/run-deterministic-layer.test.ts` hat **4 Integration-Tests** (1 pro Reference-Spec) bereits implementiert in Welle Q4 (commit `c8f8658`):

| Spec | Threshold (findings >) | Timeout | Empirical runtime (measured) |
|---|---|---|---|
| dnd5eapi | 0 | 90s | 5-30s |
| stripe-full | 4000 | 27min | 22.85min |
| pagerduty-full | 1500 | 10min | <5min |
| github-rest | 10000 | 30min | 15.27min |

Pattern pro Test:
```typescript
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const result = await runDeterministicLayer(spec, { specName: 'X' });
expect(result.findings.length).toBeGreaterThan(THRESHOLD);
expect(result.findings.every(f => typeof f.title === 'string')).toBe(true);
expect(result.perLayer['module-class']).toBeGreaterThan(0);
```

**Implications für Welle E:**
- E1 wird **drastisch kleiner** — keine neu-Integration-Tests bauen, sondern helpers aus existing 4-test-block extrahieren in eine `multi-spec-helpers.ts`-Datei
- Q4-Tests bleiben unverändert (machen smoke-test); E2 ist additiv (delphi-coverage-assertions auf demselben underlying SpecRunResult)

## Area 2 — DeterministicLayerResult Shape (was E2 konsumiert)

```typescript
interface DeterministicLayerResult {
  findings: Finding[];                     // canonical LLM-schema (post output-mapper)
  perLayer: Record<DetectorLayer, number>; // counts pro layer
  perDetector: Record<string, number>;     // counts pro detectorId
  durationMs: number;
}
```

**detectorId-Format:**
- Spectral-yaml-rules: `spectral:apiq-custom:<rule-name>` (z.B. `spectral:apiq-custom:apiq-rfc2-1-problem-json-needs-type`)
- Spectral-OAS3-default: `spectral:oas3-default:<rule-name>`
- Walkers: `walker:<walker-name>` (z.B. `walker:html-prevalence`)
- Module-classes: `module:<module-name>` (z.B. `module:problem-json-validator`)

**E2 fires-on-spec-assertion ist trivial:**
```typescript
function fires(yaml_rule: string, result: DeterministicLayerResult): boolean {
  return (result.perDetector[`spectral:apiq-custom:${yaml_rule}`] ?? 0) > 0;
}
function firesModule(module_name: string, result: DeterministicLayerResult): boolean {
  return Object.entries(result.perDetector)
    .some(([id, count]) => id.startsWith(`module:${module_name}`) && count > 0);
}
```

Keine komplexe Finding-traversal nötig. **E2-Implementation-Uncertainty: gone.**

## Area 3 — Mapping-Difficulty-Estimate (3 Sample-Mappings)

### #6 Consistent error messages (problem+json)
- yaml_rules-Quellen (5 yamls mit `problem.json`-mentions): `apiq-ruleset.yaml`, `apiq-ruleset-client-p1.yaml`, `apiq-ruleset-evolution.yaml`, `apiq-ruleset-evolution-p3.yaml`, `apiq-ruleset-niche.yaml`
- module_detections: `modules/problem-json-validator.ts` (dedicated K2-module)
- Coverage: **rich** — 4+ yaml-rules + dedicated module
- Estimate per Rule-Mapping: ~10min (konzeptions-grep + yaml-list-extract + module-confirm)

### #11 Lowercase URIs
- yaml_rules: `apiq-ruleset-niche.yaml` (RFC2-71 + RFC2-72 from Welle D2)
- module_detections: keine
- Coverage: **post-D2 fully-implemented**
- Estimate: ~3min (post-D2 trivial — D2 hat exakt diese Konzeption als single-file implementiert)

### #28 Detect breaking changes
- yaml_rules: `apiq-ruleset.yaml` + `apiq-ruleset-evolution.yaml` + `apiq-ruleset-evolution-p3.yaml` (alle EV-* Lens-3-Patterns)
- module_detections: `modules/spec-diff.ts` exists aber **nicht wired** (per CLAUDE.md "spec-diff bleibt orphan (2-Spec lifecycle)")
- Coverage: **partial** (single-spec EV-prediction works; two-spec-diff out-of-scope by architecture)
- skip_rationale: "Two-spec diff is by-architecture out-of-scope; single-spec breaking-change prediction covered by Lens-3 EV-* yaml-rules"
- Estimate: ~15min (most complex of 3 samples)

### Aggregierte Estimate
- Pro Rule: 5-15min (variiert nach Komplexität)
- Total für 28 Rules: **3-7h focused work**
- Parallelisierbar: 4 Subagents × 7 Rules = ~1-2h wallclock per agent
- Per Maximalismus-Direktive: vollständig 28, kein subset

## Area 4 — Performance-Baseline (per Q4 tests)

| Spec | Findings | Pre-Detector-Count |
|---|---|---|
| dnd5eapi | ~30 | ~5+ detectors |
| pagerduty-full | ~3.9k | 10+ detectors |
| stripe-full | ~9.5k | 10+ detectors |
| github-rest | ~21k | 10+ detectors |

Sequential 4-Spec-Run runtime: ~45min worst-case. Parallel via vitest concurrent: limited (Spectral CPU-bound, single-process).

**Welle-E-Test-Strategy:**
- E1 multi-spec helpers laufen 4 Specs sequentiell in einem `describe`-block — kein new infrastructure
- E2 `springer-delphi-coverage.test.ts` reused E1's results (run-once, assert-many) — nicht 28× re-run
- CI-Job per E3 als separater workflow (nicht im normalen `npm run test` pre-commit; CI 40min budget OK)

## Area 5 — Multi-Spec API-Readiness

**Module-level state:** `_spectralRunner`, `_walkerRunner`, `_moduleRunner`, `_domainKnowledgeRunner` sind module-singletons. `registerDefaultRunners()` ist idempotent (registers nur falls nicht already there).

**No caching across calls:** Jede `runDeterministicLayer(spec, opts)`-Aufruf ist independent input, no shared mutable state zwischen Aufrufen.

**Multi-spec-runner-implementation trivially safe:**
```typescript
beforeAll(async () => { await registerDefaultRunners(); }, 60_000);
const stripeResult = await runDeterministicLayer(stripeSpec, { specName: 'stripe-full' });
const githubResult = await runDeterministicLayer(githubSpec, { specName: 'github-rest' });
// no race conditions, no carry-over
```

**Out-of-box ready, no infrastructure-changes needed.**

## Spec-Anpassungen für Welle E (post-Survey)

Folgende Sektionen der `E09-w-e-springer-delphi-benchmark.md` Spec sollten basierend auf Survey-Findings reduziert/präzisiert werden:

### E1-Scope-Reduktion
**Vorher:** "Erweiterung von `run-deterministic-layer.test.ts` ODER neue Datei `multi-spec-runner.test.ts`. Helper `runFullPipelineOnSpec` + `runFullPipelineOnAllSpecs`."

**Nach Survey:** existing 4-test-block bleibt unverändert. Neue Datei `scripts/spike/__tests__/deterministic/multi-spec-helpers.ts` (kein `.test.ts` — pure helpers, no tests):
```typescript
export type SpecName = 'stripe-full' | 'pagerduty-full' | 'github-rest' | 'dnd5eapi';
export const ALL_SPECS: SpecName[] = ['dnd5eapi', 'pagerduty-full', 'stripe-full', 'github-rest'];

export async function loadSpec(name: SpecName): Promise<object> { ... }
export async function runOnSpec(name: SpecName): Promise<DeterministicLayerResult> { ... }
export async function runOnAllSpecs(): Promise<Map<SpecName, DeterministicLayerResult>> { ... }

// Convenience for E2:
export function rulefires(rule: string, results: DeterministicLayerResult[]): SpecName[];
export function moduleFires(module: string, results: DeterministicLayerResult[]): SpecName[];
```

E1-Scope ist jetzt: ~50 LOC helpers + Re-export-pattern. **Nicht mehr "Test-Framework bauen"**.

### E0-Scope unverändert
3 Sample-Mappings bestätigen: machbar in 1-2h pro Subagent, parallelisierbar 4×.

### E2-Scope verschärft
Da `perDetector`-shape klar ist, kann E2 von Tag 1 an testen:
```typescript
for (const mapping of SPRINGER_DELPHI_MAPPING) {
  it(`Delphi #${mapping.delphi_id} — ${mapping.delphi_rule}`, async () => {
    const fires = mapping.yaml_rules.some(r => rulefires(r, results)) ||
                  mapping.module_detections.some(m => moduleFires(m, results));
    if (mapping.skip_rationale) {
      // skip-with-rationale: PASS, but warn if also fires (skip-obsolete)
      if (fires.length > 0) console.warn(`Skip rationale obsolete on #${mapping.delphi_id}`);
    } else {
      expect(fires.length).toBeGreaterThan(0);
    }
  });
}
```

### E3-Scope unverändert
CI-Job + doc-updates wie spec'd.

### Stripe-Perf-Considerations bestätigt
4-Spec-Run sequenziell ~45min. Welle-E-CI-Job als separater workflow `.github/workflows/putz-benchmark.yml` (nicht in regulärem `npm run test`).

## Bottom Line

**Vor Survey:** 5 Probleme identifiziert, 3 in Welle verschoben.

**Nach Survey:**
- ✓ Problem 1 (Mapping stale): unverändert — E0 löst das, ist machbar in 3-7h
- ✓ Problem 2 (Test-Framework fehlt): **TEILWEISE-GELÖST DURCH SURVEY** — Q4-Tests existieren, E1 ist nur helper-extraction
- ✓ Problem 3 (Coverage ≠ Existence): unverändert — exakt das was E2 testet
- ✓ Problem 4 (Stripe-Perf 23min): unverändert — bekannt, in CI-budget
- ✓ Problem 5 (T1 in disguise): bereits strukturell gelöst durch Plan-Doc-Restructure

**Welle E ist jetzt optimal vorbereitet.** Spec sollte mit Survey-Findings angepasst werden (E1-Scope-Reduktion); danach `/dev`.

---

## Update 2026-05-10 post-User-Reflection

User-Frage: "ist gar nicht sofort klar was alles vorhanden ist? haben wir nicht ein riesiges problem, dass niemand mehr den überblick über das hat, was überhaupt vorhanden ist?"

**Diagnose:** Survey hat aufgedeckt dass die Frage berechtigt ist. Pre-Welle-Audits werden ad-hoc gemacht (D2 + E haben das demonstriert), aber das löst nur das aktuelle Welle-Problem, nicht das systemische Drift-Risiko. Plan-Doc + CLAUDE.md + Memory drift gegen Code-State.

**Konsequenz:** **Welle I (Inventory + Capability-Map)** wurde als neue Welle vor Welle E eingeschoben. Welle I produziert auto-generated single-source-of-truth files (INVENTORY.md / COVERAGE.md / CROSS-REFERENCES.md / DRIFT-REPORT.md / TEST-COVERAGE.md / API-SURFACE.md) + CI-gate gegen drift + Plan-Doc-Workflow-Update das Pre-Welle-Audits durch Inventory-Konsultation ersetzt.

Welle-E-Spec wurde präventiv um Welle-I-Substrate-Nutzung erweitert (E0 + E1 reflektieren das jetzt). Pre-Survey-Findings (oben) bleiben relevant aber Welle E wird mit Welle I done noch trivialer.

**Sequenz-Update:** Welle I → Welle E → Welle T2/T3 → Welle Doc → ...

**Spec für Welle I:** `specs/E09-w-i-inventory-capability-map.md`
