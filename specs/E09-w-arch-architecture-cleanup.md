# Epic 09 / Welle Arch+ — Architecture Cleanup (expanded scope)

> Welle Arch erweitert vom Plan-Doc-§13-original-scope (file-tree-Refactor) auf vollen architectural cleanup pre-Welle-D2. Trigger: User-Frage 2026-05-09 nach Welle-D-Commit "machen wir das eigentlich gerade alles richtig oder mit der Brechstange?". Honest self-assessment surfaced 4 broader concerns die nicht in §13 sind. Plus User-decisions auf Welle-D-OQ-1 bis OQ-4 forderten Vorzieh-Execution mehrerer "later" tasks.
>
> Plan-Doc Master: `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` §13 (Welle Arch — wird durch diese Spec erweitert). Pre-Conditions: Welle D done (commit `8c80ef7`).
>
> **Maximum-Direktive (User 2026-05-09):** "ich möchte jetzt dass du die verfickte architektur verbessert wenn das sinnvoll ist". Memory: `feedback_putzen_first_before_validation.md` + `feedback_no_pseudo_questions.md` + `feedback_never_defer_fixes.md` + `feedback_plan_doc_is_source_of_truth.md`.

## Scope

7 sub-tasks, davon 1 Quick-Fix (lead) + 5 parallele + 2 sequential. Plus 2 Welle-D-OQ-resolutions vorgezogen (verbatim-population + stripe-perf-investigation) statt deferred zu Welle E.

### Welle-D-OQ-Resolutions (User-Decisions 2026-05-09)

- **OQ-1:** T25 cron quarterly → **monthly** (`0 0 1 * *`). File renamed `source-verify-quarterly.yml` → `source-verify-monthly.yml`. **DONE** by lead before subagent-spawn.
- **OQ-2 (T-Verbatim-Population):** Vorgezogen aus Welle E. Manuell ~30-50 high-value rules mit echten RFC-quotes populaten. Sub-task in Welle Arch+.
- **OQ-3 (T-Stripe-Perf):** Vorgezogen aus Welle E. Profile run-deterministic-layer.test.ts auf stripe-full + identify bottleneck-rules/functions + apply optimizations. Target: stripe-full-test wieder unter 10 min.
- **OQ-4 (Function-consolidation):** decision-driven by OQ-3 profile-output. Sequential after OQ-3.

### A1 — Three-source-of-truth Drift-Lint (Option 3 per A1)

Pattern-info lebt in 3 places: `patterns.json`, `apiq-meta`-blocks (11 yamls), `rules-brainstorm.md`. Risiko: drift across sources.

**Build:** `scripts/spike/data/lint-pattern-drift.ts` — CLI script that:
- Loads `patterns.json` (959 entries)
- Loads alle 11 yamls + extrahiert apiq-meta `pattern-id` per rule
- Reports per-pattern-id alle 3 places (patterns.json + yaml-rules + brainstorm-mention) + drift wo:
  - patternId in patterns.json aber kein yaml-rule
  - yaml-rule has pattern-id nicht in patterns.json
  - severity-hypothesis in patterns.json ≠ rule-severity in yaml
  - lens in patterns.json ≠ apiq-meta.lenses in yaml (subset OK)
- Exit 1 bei drift, 0 bei clean
- `--json` output für CI integration

**Tests:** `scripts/spike/__tests__/data/lint-pattern-drift.test.ts` mit fixtures für drift / clean / partial-cases.

**Cl-Gate:** new test in `apiq-meta-coverage-gate.test.ts` (or separate test-file): `'pattern-drift across patterns.json + yamls'` — runs the lint, fails on drift.

### A2 — Zod-Schemas für patterns.json + apiq-meta-blocks (Option 3 per A2)

**A2a — `PatternSchema` (Zod) für patterns.json:**
- New file `scripts/spike/data/pattern-schema.ts`
- Schema declares: `patternId` (string format), `lens` (array of closed-set), `source` (object), `severityHypothesis` (enum), `codegenTargets` (array of closed-set), `description` (string), `detectionPrecision` (enum), `isPureSpectralDetectable` (bool), `isStageATerritory` (bool), `round` (number).
- Closed-sets: `lens` enum from existing taxonomy (threat-modeling, standards-compliance, evolution-friction, client-friction, style-convention, privacy, caching, internal-consistency, consumability, operational-metadata).
- Add load-time validation: `loadPatterns()` helper validates each entry, throws on invalid.
- Update `Pattern-Knowledge-Index` build-script to use validated loader.

**A2b — Apiq-Meta-Block Zod-Schema:**
- Either: re-use `RuleMetadataSchema` from `severity-schema.ts` (the canonical Welle-F schema)
- Or: create `ApiqMetaYamlBlockSchema` separately (kebab-case) that maps to RuleMetadataSchema (camelCase)
- Decision: re-use canonical `RuleMetadataSchema` with kebab-to-camel transform at YAML-load. Avoids two-source-of-truth on schema-shape.
- New helper `validateApiqMetaBlock(block: unknown): RuleMetadata` in `severity-schema.ts`.
- Update spectral-runner.ts `buildRulesAccFromYaml` to validate apiq-meta blocks at load-time (warn on invalid + skip block, but don't abort runner).

**Tests:** `scripts/spike/__tests__/data/pattern-schema.test.ts` + extend `severity-schema.test.ts` with apiq-meta block-validation tests (positive + negative fixtures).

### A3 — Custom-function FunctionMetadata-Type (Option 1 per A3)

91 custom-functions across 8 files. Currently registered in `APIQ_CUSTOM_FUNCTIONS` map by kebab-case name only. No structured metadata.

**Build:**
- Define `FunctionMetadata` type in new file `scripts/spike/deterministic/spectral-functions/_metadata.ts`:
  ```typescript
  export interface FunctionMetadata {
    /** Kebab-case name as it appears in YAML `function:` keys. */
    name: string;
    /** Pattern-IDs this function implements (1+; bundled functions cover multiple). */
    patternIds: string[];
    /** Primary lens. */
    lens: string;
    /** Performance class: 'O(n)' linear, 'O(n²)' pairwise, 'O(n*m)' cross. */
    perfClass: 'O(1)' | 'O(n)' | 'O(n*m)' | 'O(n²)';
    /** Brief one-line description for human consumers + LLM-prompts. */
    description: string;
    /** Whether the function is async (reads files, makes network calls). Most are sync. */
    async?: boolean;
  }
  ```
- Each function-file exports a `FUNCTION_METADATA: Record<string, FunctionMetadata>` object next to the callables.
- `spectral-runner.ts` registers metadata in parallel to APIQ_CUSTOM_FUNCTIONS map. Optional new map `APIQ_CUSTOM_FUNCTION_METADATA: Record<string, FunctionMetadata>`.
- Welle-D-Function-Registry-Validation: F5-coverage-gate-style test that all 91 registered functions have a metadata-entry.

**Tests:** new test `apiq-function-metadata-coverage.test.ts` — verifies 91 functions all have metadata + metadata-pattern-IDs match yaml-rule pattern-ids.

### File-Tree-Refactor (Plan-Doc §13 Arch1 original scope) — Sequential after parallel-team

Scope: existing flat `scripts/spike/deterministic/*.ts` (22 files) restructured into:

```
scripts/spike/deterministic/
├── classifiers/         # Stage-1 classifiers (no Finding-Output, gate other detectors)
│   ├── style-classifier.ts
│   ├── json-schema-draft-detector.ts
│   ├── oauth2-flow-classifier.ts
│   └── media-type-iana-classifier.ts
├── aggregators/         # Statistical aggregators (was walkers/)
│   └── (all walker-*.ts files moved here)
├── modules/             # Deep-mechanic modules (already exists, expanded)
│   ├── secret-scanner.ts, webhook-signature.ts, http-protocol-pairings.ts, ...
├── rules/               # YAML-rule-sets
│   ├── apiq-ruleset.yaml + 10 other yamls
├── spectral-functions/  # already exists
├── iana/                # already exists
├── infra/               # severity-schema + types + output-mapper + spectral-runner
└── index.ts             # public API entry
```

Refactor-Approach:
- 1 Subagent moves files + updates imports (~40+ import-statements)
- All tests must continue green after refactor
- spec-diff bleibt orphan in modules/ (NICHT in experimental/, einfacher)

### Plan-Doc Sync

- §13 Welle Arch erweitert um A1+A2+A3 als Arch3+Arch4+Arch5
- §21 Welle-Status-Tracker erweitert um Welle Arch+ row
- §9 Welle E T-Stripe-Perf wird "DONE-by-Arch+" markiert (resolved here)
- §0/§22 unverändert

## Acceptance criteria

Welle Arch+ ist done wenn ALLE folgenden erfüllt sind:

1. **OQ-1 (cron monthly):** workflow file renamed + cron updated. ✓ DONE pre-spec by lead.
2. **A1 Drift-Lint:** `lint-pattern-drift.ts` exists + tested + CI-gate added + 0 drift detected on current state.
3. **A2 Zod-Schemas:** `PatternSchema` validates patterns.json clean + apiq-meta validation in spectral-runner + tests.
4. **A3 FunctionMetadata:** all 91 functions have metadata-entries + metadata-coverage-test passes 100%.
5. **OQ-2 Verbatim-Population:** ≥30 high-value rules have populated `quote` field with verifiable RFC-text + verifiedAt timestamps. T25 baseline regenerated showing ≥30 verified.
6. **OQ-3 T-Stripe-Perf:** stripe-full-test under 10 min OR documented why-not (e.g. inherent JSONPath cost). Profile-output committed as `specs/E09-w-arch-stripe-perf-profile.json`. Test-timeout reverted from 30 min to appropriate value.
7. **OQ-4 Function-consolidation:** profile-driven decisions documented. If candidates exist → consolidated; if not → explicit rationale.
8. **File-Tree-Refactor:** new directory structure live. All imports updated. All tests pass. spec-diff stays in modules/.
9. **Test-Suite grün:** 1681+ baseline + new tests (A1/A2/A3/OQ-* test-additions). 0 fail.
10. **Lint + tsc:** 0 NEW errors.
11. **Plan-Doc + CLAUDE.md + Memory updated.**
12. **Commit:** `feat: implement epic 09 / welle Arch+ — architecture cleanup`.

## Out of scope

- Welle D2 (P4+P5 Niche/Vendor patterns) — separate Welle, after Arch+.
- Welle E (Putz-Niveau-Benchmark) — minus T-Stripe-Perf which moves into Arch+.
- Welle T / Doc / R / V — nachgelagert.
- Phase B / Welle M2 / Welle Z — post-V.

## Domain terms

- **Welle Arch+:** expanded scope vs Plan-Doc §13 original (file-tree-only). Includes A1+A2+A3 architectural concerns + OQ-2/OQ-3 vorgezogene resolutions.
- **A1 Drift-Lint:** automated check that patterns.json + apiq-meta-blocks + brainstorm-doc are consistent. Catches manual-curation-drift.
- **A2 Zod-Schemas:** type-validation at load-time for patterns.json + apiq-meta-blocks. Closes the "loose typing" gap.
- **A3 FunctionMetadata:** structured metadata per custom-function (name + patternIds + lens + perfClass + description + async). Enables introspection + future consolidation analysis.
- **OQ-2 Verbatim-Population:** manual curation of true RFC-quotes for high-value rules so T25 has verifiable content (currently 0/213).
- **OQ-3 T-Stripe-Perf:** profiling + optimization of run-deterministic-layer.test.ts on stripe-full (currently 23.7 min). Welle-E-territory vorgezogen.
- **OQ-4 Function-consolidation:** post-OQ-3 decision whether to merge similar functions or accept the 91-count.

## Open questions

Keine. User-direktive 2026-05-09: "ich möchte jetzt dass du die verfickte architektur verbessert" + "wenn das sinnvoll ist bzw unser vorgehen dadurch optimiert wird". Plus Memory `feedback_no_pseudo_questions.md` — entscheide und führe aus, keine pseudo-questions.

Falls während Implementation emergent Issues → results-file post-/dev.
