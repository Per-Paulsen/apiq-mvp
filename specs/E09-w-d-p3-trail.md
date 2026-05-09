# Epic 09 / Welle D — P3 Trail (Defense-in-Depth + Nice-to-Have)

> P3-Pattern-Implementation aus Plan-Doc §7: alle ~110 P3-Patterns als Spectral-rules in 5 neuen YAML-Files plus 3 Walker-Sentinels-Auflösung plus T25-Source-Verify-CI plus T-F7-Vollständigkeits-Pass plus T-Funcs-Konsistenz-Cleanup. Pre-Condition: Welle C done (commit `e62ff05`).
>
> Plan-Doc Master: `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` §7 (Welle D, erweitert 2026-05-08 post-Welle-C). Pattern-Substrate: `scripts/spike/data/patterns.json` (959 patterns). P3-Pattern-Listen: `specs/big-spec-architecture-spike-stage-a-implementation-priority.md` P3-Tabellen (Zeilen 238-405). Welle-C-OQ-Resolutions: `specs/E09-w-c-p2-spectral-rules-results.md` Appendix.
>
> **Maximum-Scope-Direktive (User 2026-05-08):** "alles 100% ordentlich machen". Memory: `feedback_plan_doc_is_source_of_truth.md` + `feedback_putzen_first_before_validation.md` + `feedback_no_trade_off_against_vision.md` + `feedback_never_defer_fixes.md` + `feedback_no_engineering_time_estimates.md`.

## Scope

Welle D implementiert **ALLE ~110 P3-Patterns** als Spectral-rules verteilt über 5 neue lens-strukturierte YAML-Files plus alle benötigten Custom-Functions. Zusätzlich: 3 Walker-Implementations zur Auflösung der Welle-C-sentinel-rules, T25 Source-Verify-CI, T-F7 Codegen-Targets-Coverage-Pass auf alle ~280 active rules (P1+P2+P3), T-Funcs Konsistenz-Cleanup. Alle neue rules tragen vollständige `apiq-meta`-Blocks per Welle-F-Schema.

### T16c — P3-Threat (~31 rules) → `apiq-ruleset-threat-p3.yaml`

Patterns aus implementation-priority.md P3-Tabelle:
- **Y-Tier (9):** Y-6, Y-9, Y-11, Y-16, Y-18, Y-20, Y-22, Y-24, Y-25 (= RFC2-90)
- **TM-A-Tier (22):** TM-A3, TM-A4, TM-A8, TM-A16, TM-A19, TM-A20, TM-A21, TM-A25, TM-A26, TM-A27, TM-A29, TM-A30, TM-A31, TM-A33, TM-A37, TM-A40, TM-A41, TM-A43, TM-A48, TM-A49, TM-A51, TM-A52

Lookup pro Pattern in `patterns.json` für: description, severity-hypothesis, source-citations, lens-tagging. Defaults: P3-Threat severity meist `hint` mit Upgrade-Pfad (off-by-default-overridable wo applicable).

**Custom-Functions:** `spectral-functions/threat-p3-functions.ts` (NEU) wo Patterns nicht in stock-Spectral-DSL ausdrückbar (multi-step / cross-resource). Empty-bucket = kein file.

### T18c — P3-Client (~31 rules) → `apiq-ruleset-client-p3.yaml`

Patterns aus implementation-priority.md P3-Tabelle:
- **CL-Tier (31):** CL-3, CL-8, CL-10, CL-14, CL-16, CL-19, CL-23, CL-27, CL-28, CL-30, CL-32, CL-34, CL-38, CL-39, CL-41, CL-42, CL-43, CL-44, CL-47, CL-51, CL-52, CL-53, CL-61, CL-62, CL-65, CL-67, CL-72, CL-74, CL-75, CL-78, CL-79, CL-80

F7 per-target codegen-tagging wo applicable (CL-rules sind oft target-spezifisch — TypeScript / Python / Go / Java / Rust pro Pattern entschieden).

**Custom-Functions:** `spectral-functions/client-p3-functions.ts` (NEU) wo multi-language-aware oder cross-spec-statistics. Empty-bucket = kein file.

### T-EV — P3-Evolution (~24 rules) → `apiq-ruleset-evolution-p3.yaml`

Patterns aus implementation-priority.md P3-Tabelle:
- **EV-Tier (24):** EV-2, EV-9, EV-12, EV-13, EV-15, EV-20, EV-21, EV-22, EV-26, EV-29, EV-38, EV-39, EV-41, EV-42, EV-44, EV-45, EV-47, EV-51, EV-52, EV-54, EV-59, EV-60, EV-61, EV-62

`direction`-field strukturiert per F3 (forward-compat / backward-compat / both). Existing `apiq-ruleset-evolution.yaml` bleibt unverändert (P1+P2 evolution-rules); P3-EV-rules in eigenem File analog zu P1/P2-Threat/Client-Pattern.

**Custom-Functions:** `spectral-functions/evolution-p3-functions.ts` (NEU) wo multi-step. Empty-bucket = kein file.

### T-RFC2 — P3-Standards (~47 rules) → `apiq-ruleset-standards-p3.yaml`

Patterns aus implementation-priority.md P3-Tabelle:
- **RFC2-Tier (47):** RFC2-4, RFC2-13, RFC2-15, RFC2-17, RFC2-18, RFC2-19, RFC2-23, RFC2-24, RFC2-27, RFC2-28, RFC2-29, RFC2-30, RFC2-31, RFC2-33, RFC2-34, RFC2-35, RFC2-36, RFC2-37, RFC2-38, RFC2-39, RFC2-41, RFC2-42, RFC2-44, RFC2-46, RFC2-47, RFC2-48, RFC2-50, RFC2-52, RFC2-53, RFC2-54, RFC2-55, RFC2-57, RFC2-63, RFC2-64, RFC2-67, RFC2-81, RFC2-85, RFC2-86, RFC2-87, RFC2-88, RFC2-91, RFC2-92, RFC2-93, RFC2-98, RFC2-99, RFC2-100, RFC2-101

Subagents dürfen logisch eng-verwandte RFC2-rules zu single conditional-bundle-rule konsolidieren analog zu Welle-C-RFC2-conditional-bundle (RFC2-20/21/22/25/26 → 1 rule); apiq-meta `pattern-id` listet alle subsumierten Pattern-IDs. Anchor-Beispiele: Cache-Header-Bundle (RFC2-30/31/33/34), Cache-Validators-Bundle (RFC2-35/36/37/38/39), Link-Header-Bundle (RFC2-52/53/54/55), Multipart-Form-Bundle (RFC2-100/101). Alle subsumierten Pattern-IDs in apiq-meta dokumentiert + alle in F5-coverage zählend.

`source-verbatim`-Felder MÜSSEN für rules mit "verbatim"-Tag in implementation-priority.md gepopulated werden (z.B. RFC2-15 RFC 9110 §15.5.16, RFC2-32 §15.3.7, RFC2-41 §11.6.4) — feed direkt in T25-Source-Verify-CI.

**Custom-Functions:** `spectral-functions/standards-p3-functions.ts` (NEU) wo benötigt.

### T-Other-Lens — P3-Style/Convention + Lens-6/7/9/10 + F-Tier (~28 rules) → `apiq-ruleset-other-p3.yaml`

Patterns aus implementation-priority.md P3-Tabelle, lens-divers + meist single-rule-per-lens (kein eigener lens-yaml gerechtfertigt):

- **SC-Tier (15):** SC-1, SC-2, SC-3, SC-4, SC-7, SC-12, SC-15, SC-16, SC-17, SC-18, SC-19, SC-21, SC-22, SC-23, SC-25
- **SCF-Tier (15):** SCF-2, SCF-3, SCF-4, SCF-5, SCF-6, SCF-7, SCF-8, SCF-9, SCF-10, SCF-11, SCF-12, SCF-13, SCF-14, SCF-15, SCF-17
- **L6/L7/L9/L10 (12):** L6-3, L7-1, L9-2, L9-3, L9-4, L9-5, L9-6, L9-8, L10-4, L10-5, L10-6
- **F-Tier (8):** F-2, F-3, F-5, F-12, F-13, F-15, F-19, F-20

L9- und L10-Patterns sind agent-readiness-territory — `agentReadinessImpact`-field (per Welle-F-Schema) MUSS gesetzt werden mit non-trivial value. Diese rules feeden Stage-A-Vorbereitung für Phase B + Welle M2 + Welle Z (per Plan-Doc §0 Strategic Vision Constants).

**Custom-Functions:** `spectral-functions/style-p3-functions.ts` (NEU für SC/SCF) und/oder Erweiterung in lens-spezifischer existing function-file je nach Pattern-Affinität. Subagent-Decision wo plausibel.

### T25 — Source-Verify-CI Job (NEU)

Quarterly automated verification dass `source-verbatim`-strings in rules' apiq-meta-blocks tatsächlich noch in den authoritative Sources stehen.

**Implementation:**
- `scripts/source-verify/verify-rfc-verbatim.ts` — main entry-point CLI
  - Iteriert alle 7+ apiq-ruleset-*.yaml-Files
  - Sammelt alle rules mit non-empty `source-verbatim` + `source-url`
  - Pro source-url: fetch raw text (gh-api für github-hosted; direct fetch für IETF/W3C; respect rate-limits + ETag-caching)
  - Verify `source-verbatim`-string ist substring-match (nach whitespace-normalization) in fetched text
  - Update `source-verified-at` timestamp wenn match (in-place yaml-edit per `js-yaml`)
  - Report: count verified / count drift / count fetch-fail (exit 1 bei drift)
- `.github/workflows/source-verify-quarterly.yml` — Cron `0 0 1 1,4,7,10 *` (1st Jan/Apr/Jul/Oct), läuft `verify-rfc-verbatim.ts` + opens PR mit updated timestamps oder failure-issue bei drift
- `__tests__/deterministic/source-verify.test.ts` — Unit-tests für: yaml-parsing, substring-match-logic, rate-limit-handling, drift-detection. Mock-fetch nicht network-call.

**Coverage-target:** ≥90% aller rules mit RFC/standards-source haben source-verbatim populated nach T-RFC2 + retroactive-pass auf P1+P2-rules wo verbatim-cite vorhanden in patterns.json (parallel zu T-F7 Pass).

**Acceptance:**
- CLI-script existiert + tested + runs clean lokal gegen ≥10 sample-rules
- Workflow-yaml validiert (`act` oder GitHub-actions-lint)
- Erste Run-Output committed als `specs/E09-w-d-source-verify-baseline.json` (snapshot der initial verifiedAt-timestamps)

### T-Sentinels — 3 Walker-Implementations (Welle-C OQ-Resolution)

Welle C hat 3 sentinel-rules emittiert die auf nicht-existente Walker zeigen. Maximalismus-Direktive: nichts halb-fertig lassen.

#### Sentinel-1 — `walkers/schema-similarity.ts` (CL-48)
- **Auftrag:** Detect pairwise schema-pairs die "similar but not identical" sind (≥80% structural-overlap, ≠ 100%) in `components.schemas` — Indikator für copy-paste-drift / fehlende DRY-Refactoring.
- **Detection-Algorithm:** Pairwise per `O(n²)` über alle component-schemas:
  - Normalize schema (sort properties alphabetisch, strip descriptions/examples/format-defaults)
  - Compute structural-fingerprint (sorted property-name-list + type-list als hash-input)
  - JSON-structure-Levenshtein OR property-set Jaccard-similarity (≥0.8 ist "near-dup")
  - Embedding-distance-Variant optional (nur wenn `OPENAI_API_KEY` env-var vorhanden); fallback ohne ist primary-path
- **Output:** RuleResult mit pairwise-pointers + similarity-score; `severity: hint`; `agentReadinessImpact: medium` (agents struggle mit redundant-schemas).
- **Tests:** 3+ fixture-pairs (positive: known-near-dup; negative: identical OR semantically-different).

#### Sentinel-2 — `walkers/pluralised-nodes.ts` (F-14)
- **Auftrag:** Detect URI-segment singular/plural-conflicts (z.B. `/users/{id}/order` vs `/users/{id}/orders` co-existing) — DOLAR-pattern aus Round-2-Mining.
- **Detection-Algorithm:**
  - Iterate alle paths
  - Tokenize segments (skip `{var}`-templates)
  - Per resource-segment: collect singular ↔ plural variants (English-rules: `s`-suffix, `es`-suffix, irregular-mapping aus statischer kleiner Liste — children/people/data exemptions)
  - Flag wenn beide co-existieren in derselben spec
- **Output:** RuleResult `severity: warn`; `defectClass: client-burden + naming-inconsistency`.
- **Tests:** Positive (mixed plural/singular), negative (consistent), edge-case (irregular-plural).

#### Sentinel-3 — Erweiterung `walkers/json-schema-draft-detector.ts` (CL-24)
- **Auftrag:** Multi-type detection — Schema mit `Array.isArray(@.type)` (3.1-spec) ohne weitere Constraints (kein `nullable`-equivalent, kein `oneOf`/`anyOf`-fallback).
- **Aktuelle Walker-Status:** `walkers/json-schema-draft-detector.ts` exists und detects draft-version-mismatches. Erweiterung: zusätzlicher check für `type: ['string', 'null']`-style constraints in 3.0-vs-3.1-context.
- **Output:** Existing `RuleResult`-shape erweitert; severity passend zu existing pattern.
- **Tests:** Erweiterung von existing fixtures.

**Walker-index:** `walkers/index.ts` registriert die 2 neuen Walkers (CL-48, F-14). CL-24-Erweiterung läuft via existing detector.

### T-F7 — Codegen-Targets Vollständigkeits-Pass

F7-Coverage **≥80%** auf alle ~280 active rules (P1+P2+P3, alle 11 yamls).

**Auftrag:**
- Iterate alle yaml-files
- Pro rule: `apiq-meta.codegen-targets` muss entweder `['*']` (genuine universal) ODER konkrete Liste sein (`['typescript', 'python', ...]`)
- Default-Verbot: kein rule darf default-`['*']` haben falls rule sprach-spezifisch ist (z.B. CL-* rules sind oft TypeScript/Python-codegen-spezifisch)
- Decision-Quelle pro rule: rule-description + custom-function-source + Welle-C-Pattern (Welle-C-client-p2 hat 12/25 mit konkreten targets — als Vorbild verwenden)

**Acceptance:** ≥80% aller ~280 active rules sind korrekt-getagged (rest = genuine universal mit `['*']`). Coverage-prozent in F5-coverage-gate-test reportet + new threshold-check.

**F5-coverage-gate-Erweiterung:** `__tests__/deterministic/apiq-meta-coverage-gate.test.ts` erweitert um `codegen-targets-coverage`-check (≥80% have non-`['*']` value where rule-affinity ist sprach-spezifisch — affinity-detection per rule-naming-heuristic OR explicit-tag).

### T-Funcs — Custom-Functions Konsistenz-Cleanup

**Per `<lens>-p<priority>-functions.ts`-Pattern** für 100% file-discipline.

- **Rename:** `spectral-functions/multi-lang-reserved-keywords.ts` → `spectral-functions/client-p1-functions.ts` (consistency mit P2-pattern)
  - Update `spectral-runner.ts` imports + `APIQ_CUSTOM_FUNCTIONS`-map keys
  - Re-export under same function-name (`multiLangReservedKeywords`) so YAML-rule-references break-frei
  - Update any other reference (Welle-Q-codegen-aggregation, Welle-F-coverage-gate, etc.)

- **Neue P3-function-files** (per Lens-Bucket wo P3-Patterns custom-functions brauchen):
  - `spectral-functions/threat-p3-functions.ts` (für TM-A* P3 patterns)
  - `spectral-functions/client-p3-functions.ts` (für CL-* P3 patterns)
  - `spectral-functions/evolution-p3-functions.ts` (für EV-* P3 patterns)
  - `spectral-functions/standards-p3-functions.ts` (für RFC2-* P3 patterns)
  - `spectral-functions/style-p3-functions.ts` (für SC/SCF/F* P3 patterns)
  - **empty buckets = kein file** (Subagent skipt files wo alle Patterns stock-DSL sind)

### Spectral-Runner-Erweiterung

`scripts/spike/deterministic/spectral-runner.ts` erweitern:
1. Add 5 new path constants: `APIQ_RULESET_THREAT_P3_PATH`, `APIQ_RULESET_CLIENT_P3_PATH`, `APIQ_RULESET_EVOLUTION_P3_PATH`, `APIQ_RULESET_STANDARDS_P3_PATH`, `APIQ_RULESET_OTHER_P3_PATH`
2. `loadYamlRules` für alle 5 neuen yamls in `buildSpectral`
3. `merged`-Object inkludiert P3-rules
4. Custom-functions-registry erweitert um neue P3-functions + renamed P1-function-key
5. `SUPPORTED_FUNCTIONS`-Set updated

### Tests

**Pro YAML (5 neue):** Integration-test analog zu `apiq-ruleset-threat-p2.test.ts`:
- Rule-loading verifies (alle Pattern-IDs geparst)
- Spectral-runner merge verifies
- apiq-meta coverage 100% per F5-coverage-gate
- Per-rule fixture-tests wo non-trivial pattern-detection

**Pro Custom-Function:** Unit-tests in `__tests__/deterministic/<lens>-p3-functions.test.ts`.

**Pro Walker:** Unit-tests in `__tests__/deterministic/walkers/schema-similarity.test.ts` + `pluralised-nodes.test.ts` + Erweiterung `json-schema-draft-detector.test.ts`.

**T25 Source-Verify:** `__tests__/deterministic/source-verify.test.ts` mit mock-fetch (siehe T25-Section).

**T-F7 Coverage:** Existing `apiq-meta-coverage-gate.test.ts` erweitert.

**T-Funcs Rename:** kein neuer test, aber existing tests müssen weiter pass (rename-correctness implicit).

### Test-Suite-Coverage

apiq-meta-coverage-gate.test.ts (F5) erweitert um die 5 neuen yamls (jetzt prüft 11 statt 6 yamls). Plus codegen-targets-coverage-sub-check (≥80% non-`['*']` für sprach-spezifische rules).

## Acceptance criteria

Welle D ist done wenn ALLE folgenden erfüllt sind:

1. **5 neue YAML-Files** existieren + parsen clean: `apiq-ruleset-threat-p3.yaml` (~31 rules) + `apiq-ruleset-client-p3.yaml` (~31) + `apiq-ruleset-evolution-p3.yaml` (~24) + `apiq-ruleset-standards-p3.yaml` (~47, Bundle-Konsolidation erlaubt) + `apiq-ruleset-other-p3.yaml` (~28)
2. **100% apiq-meta-Coverage** auf allen ~110 P3-rules (alle Pflichtfelder per F5-gate populated)
3. **F5-coverage-gate-test** erweitert auf 11 yamls + codegen-targets-coverage-sub-check (≥80%)
4. **T25 Source-Verify-CI** komplett: CLI-script + workflow-yaml + tests + initial baseline-snapshot committed
5. **T-Sentinels:** 3 walker-Implementations (CL-48 schema-similarity NEU + F-14 pluralised-nodes NEU + CL-24 multi-type-erweiterung in json-schema-draft-detector) built + tested + wired in `walkers/index.ts`
6. **T-F7 Vollständigkeits-Pass:** ≥80% aller ~280 active rules tragen korrekte codegen-targets (sprach-spezifisch oder `['*']`-genuine-universal)
7. **T-Funcs Konsistenz:**
   - `multi-lang-reserved-keywords.ts` → `client-p1-functions.ts` rename done + alle Referenzen updated
   - Neue P3-function-files erstellt wo Patterns custom-functions brauchen (5 lens-buckets, empty-bucket = kein file)
8. **Round-3+4 severity-considerations applied** wo P3-Patterns von Round-3+4-Mining-Insights betroffen (Subagents dokumentieren welche)
9. **Spectral-Runner erweitert:** liest alle 11 yamls + alle custom-functions registriert
10. **Integration-Tests** pro neuer yaml: rule-loading + apiq-meta-validity + per-rule fixture-tests wo non-trivial
11. **Test-Suite grün:** ~1130 baseline + neue Tests (alle pass, 0 fail, ≤4 skip)
12. **Lint + tsc** keine NEW errors
13. **Memory + Plan-Doc updated:**
    - Plan-Doc §20 + §21 + handoff-memory + MEMORY.md hooks + CLAUDE.md status-block
    - `specs/E09-w-d-p3-trail-results.md` mit deviations + risks + open-questions
14. **Commit:** `feat: implement epic 09 / welle D — P3 trail`

## Out of scope

- Welle D2 (P4 + P5 Niche/Vendor patterns) — separate Welle, wartet auf D
- Welle E (T24 Putz-Niveau-Benchmark gegen 28 Springer-Delphi-Rules) — wartet auf D2
- Welle T (Test-Coverage all-specs + Snapshot-Tests + CI-Pipeline) — kann parallel laufen, aber Tests die explizit Snapshot-Coverage prüfen sind T-territory
- Welle Doc / Welle Arch / Welle R / Welle V — nachgelagert
- Welle M2 / Welle Z / Phase B — post-V

Welle D selbst ist Differentiator-Implementation; empirisch-gemessene Coverage-lift gegen Reference-Specs (Stripe / PagerDuty / dnd5e / GitHub-REST) erfordert separate measurement-pass NACH Welle V — nicht hier.

## Domain terms

- **P3-Pattern:** "Defense-in-Depth + Nice-to-Have" per `implementation-priority.md` Priority-Achse. Im Gegensatz zu P1 (Konkurrenz-Pari-Pflicht) und P2 (Differentiator/USP). Die meisten P3-Patterns sind `hint`-severity oder off-by-default-overridable.
- **T16c / T18c / T-EV / T-RFC2 / T-Other-Lens / T25 / T-Sentinels / T-F7 / T-Funcs:** task-IDs aus Plan-Doc §7 Welle-D-Section. Original-Plan-Doc-Scope: T16c + T18c + T25. Erweiterungen 2026-05-08 post-Welle-C: Sentinels + F7 + Funcs. Maximalismus-Erweiterung dieser Spec: T-EV + T-RFC2 + T-Other-Lens für vollständige P3-Coverage (~110 patterns vs. ~60 Original-Plan-Doc-Sub-Set).
- **Sentinel-rule:** YAML-rule die statt actual-detection nur einen Pointer auf einen Walker emittiert (weil Pattern statistical / cross-spec / multi-step ist und nicht in Spectral-DSL ausdrückbar). Welle C hat 3 Sentinels eingeführt (CL-48, F-14, CL-24); Welle D löst sie auf via Walker-Implementations.
- **T25 Source-Verify-CI:** quarterly automated verification dass `source-verbatim`-strings in rules' apiq-meta-blocks tatsächlich noch in den authoritative Sources stehen (RFC-text via gh-api oder IETF-direct-fetch). Verhindert silent-drift wenn RFCs überarbeitet werden oder URLs sich ändern.
- **Codegen-Targets-Coverage (F7):** Quote der rules deren `apiq-meta.codegen-targets` konkrete Liste von SDK-Targets ist (e.g. `['typescript', 'python']`) statt default-`['*']`. Für sprach-spezifische rules sollte ≥80% non-`['*']` sein.
- **Bundle-Konsolidation (RFC2):** logisch eng-verwandte RFC2-rules zu single conditional-bundle-rule konsolidieren (analog Welle-C-Approach für RFC2-20/21/22/25/26). apiq-meta `pattern-id` listet alle subsumierten Pattern-IDs; alle in F5-coverage zählend.
- **agentReadinessImpact:** Welle-F-Schema-field, gesetzt für Lens-9 + Lens-10 P3-Patterns (Strategic-Vision-coupling per Plan-Doc §0).

## Open questions

Keine. Plan-Doc §7 + `implementation-priority.md` P3-Tabellen + Welle-C-Results-Appendix sind source-of-truth (per `feedback_plan_doc_is_source_of_truth.md`). Maximalismus-Direktive 2026-05-08 expandiert Original-Plan-Doc-Scope auf alle ~110 P3-Patterns.

Falls während Implementation emergent Issues auftauchen → werden im Welle-D-results-File post-/dev dokumentiert, nicht pre-implementation entschieden.
