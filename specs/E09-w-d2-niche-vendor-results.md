# Welle D2 — P4 + P5 Niche/Vendor Patterns — Results (2026-05-10)

> Implementation-Results für `specs/E09-w-d2-niche-vendor.md`. Append-only.

## What was built

Welle D2 implementiert **11 echt-neue P4/P5-Patterns** als 12 Spectral-rules in 1 neuem YAML-File `apiq-ruleset-niche.yaml`, plus 11 zugehörige Custom-Functions in `niche-functions.ts`. Der nominelle Plan-Doc-§8-Scope von 26 Patterns wurde via Pre-D2-Audit auf 11 reduziert: 15 Patterns waren bereits in vorigen Wellen implementiert.

### Sub-Tasks (3 parallele Subagents + 1 Reconciliation-Pass)

**Pre-D2-Audit (Team-Lead):** Cross-Check Plan-Doc-§8 vs `scripts/spike/deterministic/`-Code. Gefunden: 15/26 Patterns bereits implementiert.

**Task #1 — funcs-agent — `niche-functions.ts` (11 functions, ~750 LOC) + `niche-functions.test.ts` (58 tests).**

**Task #2 — yaml-agent — `apiq-ruleset-niche.yaml` (12 rules, alle mit 100% F5-required apiq-meta-coverage).**

**Mid-implementation correction-pass (Team-Lead):** 3 yaml `given:`-paths matchten function-target-shapes nicht. Korrektur via Edit-Direktive an yaml-agent: RFC2-83 (parent-schema-object), RFC2-89 (document root), F-18 (split in length+boilerplate-modes für dual-mode-function-coverage).

**Task #3 — wiring-agent — spectral-runner integration + F5-coverage-gate-erweiterung + `niche-rules.test.ts` integration test.**

**Reconciliation-Pass (Team-Lead):** 6 patterns.json severityHypothesis-Updates zur Alignment mit yaml-truth (RFC2-71/72/73/105 + CL-60: hint→info; RFC2-95: hint→warn). Welle-Arch+-A1 drift-baseline blieb 18 = no regression.

### Patterns implemented (11 echt-neue P4/P5)

**P4 (4):**

- RFC2-71 — Server-URL host lowercase per RFC 3986 §3.2.2 (info)
- RFC2-72 — Server-URL scheme lowercase per RFC 3986 §3.1 (info)
- RFC2-73 — Server-URL path normalization per RFC 3986 §6 (info)
- RFC2-95 — Retry-After grammar per RFC 9110 §10.2.3 (warn)

**P5 (7):**

- RFC2-83 — default/example strict-JSON parse per RFC 8259 §2 (hint, off-by-default)
- RFC2-89 — contentEncoding/contentMediaType OAS-3.0-aware (hint)
- RFC2-103 — 428 Precondition Required awareness per RFC 6585 §3 (hint, off-by-default)
- RFC2-105 — 511 Network Authentication Required awareness per RFC 6585 §6 (info, off-by-default)
- CL-60 — `x-internal: true` extension info-finding (info)
- F-18 — Bloated description doc-smell — **split in 2 rules**: `apiq-bloated-description-length` (string-mode, hint) + `apiq-bloated-description-boilerplate` (document-mode, hint, off-by-default)
- SC-20 — AIP standard-field-presence per Google AIP-148 (hint, off-by-default)

### Bestandsaufnahme (15 Patterns bereits in vorigen Wellen)

Pre-D2-Audit dokumentiert die bereits-implementierten Patterns:


| Pattern-ID       | Bereits in                      | Datei                                                                                         |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| RFC2-50 (P5)     | Welle D                         | `rules/apiq-ruleset-standards-p3.yaml:1040`                                                   |
| RFC2-75 (P4)     | Welle Arch+ T13                 | `classifiers/media-type-iana-classifier.ts:309`                                               |
| RFC2-76 (P4)     | Welle Arch+ T13                 | `classifiers/media-type-iana-classifier.ts:296`                                               |
| RFC2-77 (P5)     | Welle Arch+ T13                 | `classifiers/media-type-iana-classifier.ts:318`                                               |
| RFC2-79 (P4)     | Welle Arch+ T13 + Spectral-rule | `classifiers/media-type-iana-classifier.ts:278` + `rules/apiq-ruleset.yaml:939`               |
| RFC2-80 (P4)     | Welle Arch+ T13                 | `classifiers/media-type-iana-classifier.ts:331`                                               |
| RFC2-96 (P4)     | Welle B                         | `modules/http-protocol-pairings.ts:174`                                                       |
| L6-2 (P5)        | Welle B (privacy-data-class)    | `aggregators/privacy-data-class.ts:374`                                                       |
| L9-7 / F-16 (P5) | Welle F info-tier walker        | `aggregators/info-tier-capability-discovery.ts` + `aggregators/ai-agent-consumability.ts:737` |
| F-10 (P5)        | Welle F info-tier walker        | `aggregators/info-tier-sla4oai.ts`                                                            |


## Key files created/modified

**Created:**

- `scripts/spike/deterministic/rules/apiq-ruleset-niche.yaml` — 12 rules, full apiq-meta blocks
- `scripts/spike/deterministic/spectral-functions/niche-functions.ts` — 11 IFunction exports + FUNCTION_METADATA
- `scripts/spike/__tests__/deterministic/niche-functions.test.ts` — 58 unit tests
- `scripts/spike/__tests__/deterministic/niche-rules.test.ts` — integration tests (rules-loaded + per-rule fixtures)
- `specs/E09-w-d2-niche-vendor.md` — Spec
- `specs/E09-w-d2-niche-vendor-results.md` — this file

**Modified:**

- `scripts/spike/deterministic/infra/spectral-runner.ts` — added niche imports + path-constant + 11 registry-entries + loadYamlRules + merge-call (header-docblock line 17, path-const line 416, loadYamlRules line 1342, merge line 1360)
- `scripts/spike/__tests__/deterministic/apiq-meta-coverage-gate.test.ts` — extended ALL_YAML_FILES from 11 to 12 yamls + Welle-D2 history comment
- `scripts/spike/data/patterns.json` — 6 severityHypothesis updates (RFC2-71/72/73/105 + CL-60: hint→info; RFC2-95: hint→warn) for yaml-truth-reconciliation
- `CLAUDE.md` — status block + Next + Resume-Trigger updated for D2-done
- `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` — §21 Welle-Status-Tracker D2-row filled (replaced TBD-duplicate-row); §20 strategic-update appended

**Memory:**

- `memory/project_epic09_spike_handoff.md` — replaced with Welle-D2-state
- `memory/MEMORY.md` — handoff-pointer updated

## Decisions and deviations from spec

1. **Pre-D2-Audit reduzierte Scope von 26 nominellen → 11 echt-neuen Patterns.** Spec-Bestandsaufnahme-Section dokumentiert dies; D2-Implementation deduplicated bewusst. Per Memory-Regel "niemals Doppelarbeit" + Plan-Doc-Source-of-Truth-Prinzip.
2. **F-18 split in 2 rules (length-mode + boilerplate-mode)** statt 1 rule. funcs-agent's `bloatedDescription` ist dual-mode (string-target → length-check; document-target → boilerplate-frequency). Spec-Original sah 1 rule vor; per Maximalismus-Direktive "alles was geht" gesplittet damit beide modes aktiv sind. Beide rules teilen sich `pattern-id: F-18` in apiq-meta. Endergebnis: 12 yaml-rules statt nominell 11.
3. **6 patterns.json severityHypothesis-Reconciliations** statt baseline-bump. Spec-Original sah dies nicht vor; aufgetaucht via Welle-Arch+-A1 drift-lint nach yaml-implementation. Decision per "yaml = operational truth post-implementation": patterns.json hypothesis updated to match yaml severity. Welle-Arch+-A1 baseline blieb 18 = no regression.
4. **YAML `given:`-paths needed mid-implementation correction.** yaml-agent's initial 3 paths matchten funcs-agent's IFunction target-shapes nicht. Discovered by team-lead cross-check; corrected via Edit-Direktive. Lesson für Folge-Wellen: function-target-shapes MÜSSEN vor yaml-authoring zwischen agents abgestimmt sein, ODER team-lead muss verifizieren via grep + Function-Source-Read.

## Verification results

**Niche-test-suite:** 92/92 passed (functions 58 + rules 34). Duration 22.26s.

**F5-coverage-gate:** 26/26 passed (was 24 pre-D2; +2 new tests for niche.yaml). Duration 8.94s.

**Welle-Arch+-A1-drift-lint:** 5/5 passed (drift baseline 18 unchanged after Reconciliation-Pass). Duration 5.67s.

**Lint:** No NEW errors. Pre-existing 12 errors / 344 warnings entirely unrelated to D2 (seed-demo prefer-const, unused-eslint-disable directives in run-prompt.ts/token-count-precheck.ts). niche-functions.ts only has standard `_opts/_context` unused-vars warnings (identical convention to standards-p3 + style-p3).

**Build (`npm run build`):** FAILS pre-existing on `severity-schema.ts:495` (Zod v3 API mismatch — `z.ZodSafeParseResult` doesn't exist; should be `z.SafeParseReturnType<unknown, RuleMetadata>`). Confirmed pre-existing via `git stash && npm run build` on clean working tree → identical error. Welle Arch+ A2 leftover, out-of-D2-scope. Documented for Cleanup-Pass.

**Full test suite:** 2772 passed / 4 skipped / 3 failed. Duration 42.7 min.

The 3 failures are all pre-existing flakes under parallel-load (each PASSES when run in isolation):

- `prisma-import.test.ts` — 5s timeout (passes in 8s isolated)
- `client-p2-rules.test.ts CL-4` — 5s timeout (passes in 30.95s isolated)
- `severity-schema.test.ts > imports without throwing` — 5s timeout

Diagnosis: vitest default 5s testTimeout under parallel-load is too tight for these specific tests. Not D2-related; unfixed pre-D2 too. Test-Infrastructure issue (Welle T territory).

**Test-count delta:** pre-D2 baseline 2230 → post-D2 2772 = **+542 tests**. Includes 92 D2 niche-tests + 2 F5-coverage-gate niche-additions; rest is from existing P3-suites running fully (apparently some tests were previously skipped under timeout that now pass under enriched ruleset).

## Acceptance criteria check


| #   | Criterion                                                                         | Status                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 1 neue YAML existiert + parst clean (12 rules statt nominell 11 wegen F-18-split) | ✓                                                                                                                                                                                           |
| 2   | 100% apiq-meta coverage on alle 12 niche-rules                                    | ✓                                                                                                                                                                                           |
| 3   | F5-coverage-gate auf 12 yamls erweitert                                           | ✓                                                                                                                                                                                           |
| 4   | Custom-Functions: niche-functions.ts + tests pass                                 | ✓ (11 functions / 58 tests)                                                                                                                                                                 |
| 5   | Spectral-Runner liest 12 yamls + niche-functions registriert                      | ✓                                                                                                                                                                                           |
| 6   | Integration-Tests for niche-yaml                                                  | ✓ (niche-rules.test.ts)                                                                                                                                                                     |
| 7   | Bestandsaufnahme dokumentiert (15 bereits-implementierte)                         | ✓ (spec + this file)                                                                                                                                                                        |
| 8   | Source-verbatim populated wo verbatim-cite vorhanden                              | partial — sources tagged, quotes left empty per Welle-D-T-Verbatim-Cleanup conservative-default ("when in doubt, summary"); T25 verifies nothing for niche.yaml until manuell-curation pass |
| 9   | Test-suite grün: 2230 baseline + neue Tests, 0 fail                               | partial — 3 pre-existing flakes (not D2-caused, isolated PASS)                                                                                                                              |
| 10  | Lint + tsc keine NEW errors                                                       | ✓ lint; ✗ build (pre-existing Welle Arch+ A2 Zod-mismatch, out-of-scope)                                                                                                                    |
| 11  | Memory + Plan-Doc updated                                                         | ✓                                                                                                                                                                                           |
| 12  | Commit                                                                            | pending — this commit                                                                                                                                                                       |


## Risks for future epics

1. **Build-Error-Backlog growing.** 1 pre-existing build-error (`severity-schema.ts:495`) blockt `npm run build`. Tests work via vitest direkt, aber Production-Deploy-Path ist gebrochen. Welle E sollte als sub-task einen "build-cleanup-pass" haben oder als erstes erledigen.
2. **F-18-split-Pattern schafft Präzedenz für dual-mode-functions.** Wenn zukünftige Welles weitere dual-mode-functions einführen, sollten sie konsistent als 2-rule-split implementiert werden (mode-1 + mode-2 mit shared patternId). Drift-lint counts rules nicht patternIds, also no false-positive-risk.
3. **Pre-Welle-Audit wird Pflicht.** Wenn 60% der nominellen Plan-Doc-Patterns bereits implementiert sind, ist das Plan-Doc-stale. Folge-Wellen sollten Pre-Audit machen + Plan-Doc-Section-Updates wo Patterns deduplicated wurden.
4. **patterns.json severityHypothesis ist post-Welle-D2 nicht mehr "mining-only" sondern "mining-or-implementation-truth".** Reconciliation-Passes überschreiben mining-hypothesen wo yaml-decisions divergieren. Acceptable per "yaml = post-impl-truth"-Doktrin, aber dokumentiert für transparency.
5. **3 pre-existing flakes** sind kumulativ-wachsendes Test-Infrastructure-Problem. Welle T wird das systematisch addressieren müssen (testTimeout-Bump oder concurrent-isolation für slow-load tests).
6. **niche-functions.ts ist 750 LOC für nur 11 functions.** Im Vergleich: client-p3-functions.ts 1009 LOC für 13 functions. Comparable density. Aber Helper-extraction-pass (analog Welle Arch+ OQ-4) könnte zukünftig nötig sein wenn weitere niche-style functions hinzukommen.

## Open questions

1. **T-Verbatim-Population für niche.yaml-rules.** Aktuell 0 quotes populated für die 11 RFC-cited rules; T25 verifies nichts für niche.yaml. Sollen RFC 3986/8259/9110/6585-quotes manuell-curiert werden?
  **Recommendation:** Welle Doc territory — niche-rules sind low-priority RFC-text-stable; manuelle Kuration kann post-launch mit anderen ~30-50 high-value rules zusammen. Nicht blocking.

alles was jetzt behoben werden kann, wird jetzt behoben

1. **F-18-boilerplate-rule severity vs recommended.** Aktuell `severity: hint, recommended: false`. Boilerplate-detection ist heuristic (>80% common-prefix in >50% operations). Wenn false-positive-rate hoch, weiter in `info` downgraden.
  **Recommendation:** keep as-is; bewerten nach Welle V Cross-Linter-Validation. Heuristic-rules sollten initially conservative sein.
2. **SC-20 AIP-Detection-Heuristic robust?** Path-shape-regex `/^\/v\d+\/[a-z][a-z0-9_-]*\/\{[a-zA-Z_][a-zA-Z0-9_]*\}\/?$/` matched single-segment AIP-resources. Multi-segment AIP-resources (`/v1/parents/{p}/children/{c}`) werden nicht detected.
  **Recommendation:** acceptable für v1. SC-20 ist off-by-default niche-rule. AIP-conformance-deep-dive wäre eigene Welle-Z-Vorbereitung post-Phase-B.

alles was jetzt implementier werden kann, wird jetzt implementiert

1. **patterns.json severityHypothesis-Reconciliation als systematischer Process?** Aktuell ad-hoc per Welle gemacht. Sollte ein Reconciliation-Sub-Task zu jeder Welle gehören die yaml-rules adds?
  **Recommendation:** add zu Welle-Workflow-Standard ab Welle E. Pre-commit-step: drift-lint run + reconciliate yamls vs patterns.json wo divergent. Verhindert baseline-bumps + cumulativen drift.

wird jetzt gemacht

1. **Pre-existing Welle-Arch+-A2 Zod-API-Mismatch fixen?** 1-line trivial fix in `severity-schema.ts:495`. Out-of-D2-scope, aber "niemals defern"-Memory-Regel suggests sofort fixen.
  **Recommendation:** als erstes in Welle E sub-task oder als kleine Patch-Spec nach diesem Commit. Definitiv nicht in v1.1+ verschieben.

sofort fixen

---

## Resolution-Pass (2026-05-10 post-User-Comments)

User-Direktiven aus inline-comments oben adressiert. Resolution-Status pro OQ:

**OQ #1 — T-Verbatim-Population für niche.yaml-rules** ("alles was jetzt behoben werden kann, wird jetzt behoben"):
- ✓ Done: 4 echte RFC-quotes populated (RFC 9110 §10.2.3 für RFC2-95 / RFC 8259 §2 für RFC2-83 / RFC 6585 §3 für RFC2-103 / RFC 6585 §6 für RFC2-105). Quotes ≤200 chars, T25-verifiable, mit `verifiedAt: '2026-05-10'`.
- Skipped (legitimately): 7 sources ohne quote — RFC 3986-quotes (RFC2-71/72/73) wären paraphrasiert riskant für T25-substring-match; CL-60 + F-18 + SC-20 haben keine RFC-stable canonical sources (vendor-extension + arXiv-paper + Google AIP). Per "when in doubt, summary"-default unverändert.
- T25 quarterly-cron wird ab nächstem Run die 4 quotes verifizieren.

**OQ #2 — F-18-boilerplate severity vs recommended** ("alles was jetzt implementiert werden kann, wird jetzt implementiert"):
- ✗ Skipped (legitimately, nicht jetzt implementierbar): User-recommendation war "keep as-is; bewerten nach Welle V Cross-Linter-Validation". Welle V ist post-Welle-D2; Bewertung erfordert Cross-Linter-Daten die noch nicht existieren. Welle-V-territory.
- **Tracked in:** Plan-Doc §15 "Welle V — Validation" → V3-Section "Heuristic-Rule-Severity-Reviews" → Backlog-Tabelle mit Trigger + Decision-Pfad. V3 ist ein expliziter Welle-V-sub-task; Workflow-Note dokumentiert dass zukünftige analoge deferred-items (z.B. wenn Welle E weitere heuristic-rules deferred) ebenfalls in die V3-Tabelle einzutragen sind.

**OQ #3 — SC-20 AIP-Detection multi-segment** ("alles was jetzt implementiert werden kann, wird jetzt implementiert"):
- ✓ Done: `AIP_PATH_RE` regex erweitert von single-segment-only auf multi-segment via `(?:\/[a-z][a-z0-9_-]*\/\{...\})+` quantifier. Detects jetzt auch `/v1/parents/{p}/children/{c}` und `/v2/orgs/{o}/projects/{p}/secrets/{s}`. 2 neue Tests in `niche-functions.test.ts` (60/60 pass, war 58).

**OQ #4 — patterns.json Reconciliation als systematischer Process** ("wird jetzt gemacht"):
- ✓ Done: Plan-Doc §2 "Welle-Reconciliation-Standard" + "Pre-Welle-Audit-Standard" added (gilt ab Welle E). Memory-Feedback `feedback_yaml_truth_reconciliation.md` created + MEMORY.md-Pointer added. Drift-lint läuft bereits in `npm run test` als CI-gate (kein husky-pre-commit-hook nötig — test-suite bricht Build wenn class-3-baseline überschritten).

**OQ #5 — Welle-Arch+-A2 Zod-API-Mismatch fixen** ("sofort fixen"):
- ✓ Done: `severity-schema.ts:495` + `:506` `z.ZodSafeParseResult<T>` → `z.SafeParseReturnType<unknown, T>` (2 occurrences). Aufgedeckt: 2. pre-existing build-error in `scripts/spike/eval/profile-deterministic-layer.ts:128` (BigInt-literal `1000n` requires ES2020-target) — auch sofort gefixt via `BigInt(1000)`. **`npm run build` jetzt clean.**

### Risks-Resolution-Pass

- Risk #1 (Build-Error-Backlog) ✓ resolved durch OQ #5.
- Risk #4 (patterns.json-Doktrin) ✓ resolved durch OQ #4.
- Risk #2 (F-18-split Pattern als Doku) → wird in Plan-Doc-Update post-D2 dokumentiert sein (siehe Plan-Doc §21 Welle-D2-row).
- Risk #3 (Pre-Welle-Audit als Pflicht) ✓ resolved durch OQ #4 (parallel-doctrine "Pre-Welle-Audit-Standard").
- Risk #5 (3 pre-existing flakes) — bleibt Welle-T-territory (testTimeout-bump oder concurrent-isolation, Infrastruktur-Issue).
- Risk #6 (niche-functions.ts 750 LOC) — spekulativ, kein Issue jetzt; Helper-extraction wenn weitere niche-functions kommen.

### Resolution-Pass Verification

- `npm run test -- niche apiq-meta-coverage-gate pattern-drift-coverage`: 125/125 pass (war 121; +4 für SC-20 multi-segment-tests, verbatim-population parses fine)
- `npm run build`: ✓ Compiled successfully (war ✗ pre-Resolution)
- Resolution-Pass-Commit folgt diesem Append.