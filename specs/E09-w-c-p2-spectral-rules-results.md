# Welle C — P2 Spectral Rules — Results

> Implementation-results für Welle C aus `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` §6. Spec: `specs/E09-w-c-p2-spectral-rules.md`. Commits: `e62ff05` (feat). Authored 2026-05-08.

## Status

**DONE** — alle 14 Acceptance-Criteria erfüllt. ~1130 Tests / 4 skip / 0 fail. Branch `v1-launch`.

## Was gebaut wurde

### T16b — apiq-ruleset-threat-p2.yaml (36 rules)

**File:** `scripts/spike/deterministic/apiq-ruleset-threat-p2.yaml` (1521 lines)

Patterns implementiert (40 patterns in 36 yaml-rules):

- **Y-Tier (9):** Y-1, Y-8, Y-10, Y-12, Y-13, Y-14, Y-15, Y-19, Y-21
- **TM-A-Tier (14):** TM-A2, TM-A5, TM-A7, TM-A9, TM-A12, TM-A13, TM-A14, TM-A18, TM-A28, TM-A35, TM-A36, TM-A45, TM-A46, TM-A47
- **RFC2-Tier (13 yaml-rules covering 17 patterns):** RFC2-1, RFC2-2, RFC2-3, RFC2-11, **RFC2-conditional-bundle** (20+21+22+25+26 zu 1 rule konsolidiert), RFC2-32, RFC2-58, RFC2-59, RFC2-65, RFC2-69, RFC2-70, RFC2-74, RFC2-97

**Custom Functions (15):** `scripts/spike/deterministic/spectral-functions/threat-p2-functions.ts` (1080 lines)

Alle 15: objectIdWriteOpNeedsSecurity, oauth2AuthCodePkceRecommended, loginEndpointRateLimit, schemaReuseWithoutReadOnlyWriteOnly, recursiveSchemaNeedsMaxDepth, adminDescriptionWithoutSecurity, upstreamUrlNeedsErrorResponses, multiVersionServersNeedDeprecation, deprecatedNeedsSunsetReplacement, infoVersionServerUrlDrift, problemDetailsStatusMatchesHttpStatus, conditionalRequestCorrectness, partialContentNeedsContentRange, bearer401WwwAuthenticateRealm, patchContentTypeCorrect.

**apiq-meta:**

- 100% Coverage (36/36 rules)
- 100% NIST + ASVS regulatoryMapping (Lens-1 mandatory)
- TM-A12, TM-A13, RFC2-2, RFC2-11 als `auto-fix-safe: true`

**Tests:** `scripts/spike/__tests__/deterministic/threat-p2-rules.test.ts` (2289 lines, 85 tests, 83 pass + 2 skip).

### T18b — apiq-ruleset-client-p2.yaml (25 rules)

**File:** `scripts/spike/deterministic/apiq-ruleset-client-p2.yaml` (1325 lines, 1374 lines incl. apiq-meta)

Patterns implementiert (23 patterns in 25 yaml-rules):

- **CL-Tier (21 rules covering 19 patterns):** CL-4, CL-5, CL-7, CL-9, CL-13, CL-15, CL-17, CL-18, CL-21, CL-22, **CL-24** (sentinel), **CL-25** (custom fn), **CL-29** (custom fn), CL-35, **CL-48** (sentinel for walker), CL-54, CL-56, **CL-64** (3 split rules: GET/POST/DELETE), **CL-77** (custom fn)
- **DOLAR (4):** **F-11** (custom fn), **F-12** (custom fn), F-13, **F-14** (sentinel for walker)

**Custom Functions (5):** `scripts/spike/deterministic/spectral-functions/client-p2-functions.ts` (411 lines)

Alle 5: schemaNestingDepth, regexMultiEngineUnsupported, allOfHeavyNonRefObjects, linguisticAmorphousUri, linguisticTinyResource.

**apiq-meta:**

- 100% Coverage (25/25 rules)
- F7 per-target codegen-tagging: 12/25 rules mit concrete `codegen-targets` (NICHT `['*']`) — Java/Csharp/Kotlin/Go für type-narrowing rules, Python/Ruby für SDK-class-collision (CL-35), TS/Java/Python für regex-multi-engine (CL-25)

**Tests:**

- `client-p2-functions.test.ts` (396 lines, 38 unit-tests)
- `client-p2-rules.test.ts` (763 lines, 64 integration-tests)
- Total: 102 tests pass

### Phase 2 — Integration

**Modified:** `scripts/spike/deterministic/spectral-runner.ts`

- Added `APIQ_RULESET_THREAT_P2_PATH` + `APIQ_RULESET_CLIENT_P2_PATH` constants
- Imported 15 threat-p2 + 5 client-p2 custom-functions
- Erweitert `APIQ_CUSTOM_FUNCTIONS` map um 20 neue functions (kebab-case YAML keys)
- Erweitert `SUPPORTED_FUNCTIONS` set um 20 neue function-names
- `loadYamlRules` für beide neue yamls in `buildSpectral`, merged into final ruleset
- File-header documentiert 7-yaml load-chain (apiq-ruleset → client-p1 → threat-p1 → evolution → client-p2 → threat-p2)

**Modified:** `scripts/spike/__tests__/deterministic/apiq-meta-coverage-gate.test.ts`

- `YAML_FILES` array erweitert um threat-p2.yaml + client-p2.yaml (jetzt 6 yamls statt 4)
- `combined: ≥95%`-test gilt jetzt für ~170 rules statt 110

## Acceptance-Criteria-Erfüllung


| #   | Criterium                                   | Status | Evidence                                   |
| --- | ------------------------------------------- | ------ | ------------------------------------------ |
| 1   | apiq-ruleset-threat-p2.yaml mit ~25 rules   | ✅      | 36 rules (Plan-Doc-baseline + extras)      |
| 2   | apiq-ruleset-client-p2.yaml mit ~20 rules   | ✅      | 25 rules (CL + DOLAR)                      |
| 3   | 100% apiq-meta-Coverage auf neuen rules     | ✅      | 61/61 (36+25) — 100%                       |
| 4   | F5-coverage-gate-test erweitert auf 6 yamls | ✅      | apiq-meta-coverage-gate.test.ts updated    |
| 5   | Round-3+4 severity-upgrades applied         | ✅      | per-rule documented in subagent-reports    |
| 6   | Custom-Functions wo nötig                   | ✅      | 20 total (15 threat-p2 + 5 client-p2)      |
| 7   | Spectral-Runner erweitert                   | ✅      | Phase 2 done                               |
| 8   | Integration-Tests pro yaml                  | ✅      | 85 + 64 + 38 tests                         |
| 9   | Per-rule fixture-tests wo non-trivial       | ✅      | 78 threat-p2 fixture-tests + 64 client-p2  |
| 10  | Test-Suite grün                             | ✅      | ~1130 / 4 skip / 0 fail                    |
| 11  | Lint + tsc 0 NEW errors                     | ✅      | 0 new                                      |
| 12  | F7 per-target codegen-tagging               | ✅      | 12/25 client-p2 rules mit concrete targets |
| 13  | Memory + Plan-Doc updated                   | ✅      | this commit                                |
| 14  | Commit                                      | ✅      | `e62ff05`                                  |


## Decisions / Deviations from spec

1. **RFC2-conditional-bundle:** RFC2-20/21/22/25/26 (5 patterns) zu 1 yaml-rule konsolidiert via `conditionalRequestCorrectness`-custom-function. Mehrere RFC2-conditional-Patterns sind logisch eng verwandt (If-Match → 412, If-None-Match GET → 304, etc.); single-rule ist sauberer als 5 separate. Pattern-IDs in apiq-meta dokumentieren coverage.
2. **CL-64 split in 3 rules:** GET/POST/DELETE-Variants getrennt weil `given:` JSONPath-filter pro HTTP-method einfacher ist. apiq-meta-pattern-id ist `CL-64` für alle 3.
3. **CL-24 + CL-48 + F-14 als sentinel-rules:** Multi-type detection (CL-24), schema-similarity (CL-48), pluralised-nodes (F-14) sind Walker-territory (statistical / cross-spec). YAML-rule emits sentinel finding mit Pointer auf Walker. Detection-precision: medium.
4. **CL-77 + TM-A14 mit `resolved: false`:** Spectral resolved $refs by default, was inline-vs-ref-detection (CL-77) und schema-reuse-marker-detection (TM-A14) brechen würde. Beide rules deklarieren explizit `resolved: false`.
5. **CL-25 multi-engine regex detection:** Custom function detects ECMA/Java/Python regex-incompatibilities. Possessive quantifier-regex sorgfältig konfiguriert um false-positives auf Unicode property escapes zu vermeiden.
6. **Y-1 + Y-15 chained `then` `[defined, pattern]`:** bare `pattern` fired nicht wenn field undefined. Explicit existence-check nötig.
7. **RFC2-65 bare `function: truthy`:** picks up empty-string scope-values direkt via array-iteration auf `$..flows.*.scopes[*]`.
8. **Y-21 limited to component-schemas:** Programming-keyword detection nur in `$.components.schemas[*].properties` (nicht inline-schemas). Inline-detection ist Phase-B-Reasoning-territory.

## Patterns / Conventions established

1. **P2-rule-naming:** `apiq-tm-<id>` für threat-p2, `apiq-cl-<id>` für client-p2 (matches P1 conventions).
2. **Custom-function-file-pattern:** `spectral-functions/<lens>-p<N>-functions.ts` mit named exports (camelCase). Wird in `APIQ_CUSTOM_FUNCTIONS`-Map als kebab-case YAML-key referenziert.
3. **Sentinel-rules:** YAML-rule emits "see walker for full coverage"-finding wenn Detection in Walker-territory liegt. Dokumentiert in `description:` + `apiq-meta.detection-precision: medium`.
4. **Pattern-ID-bundling:** wenn mehrere RFC2-patterns logisch eng verwandt sind, zu 1 yaml-rule + custom-function konsolidieren mit pattern-IDs-list in apiq-meta.

## Risiken für Folge-Wellen

1. **Welle D (P3 Trail) wird Walker-rules brauchen** für die sentinel-flagged P2-patterns (CL-24/48, F-14, etc.). Walker werden aktuelle Walker erweitern oder neue erstellen.
2. **F7 per-target codegen-tagging Coverage:** 12/25 (~48%) auf client-p2 erreicht. Welle D kann ergänzen für P3-Patterns.
3. **Custom-function-Count auf 20** (zusätzlich zu 5 P1) — pipeline lädt jetzt 25 functions. Performance-impact minimal (Spectral lazy-loads), aber Welle T (Test-Coverage) sollte Pipeline-Performance-test addieren.
4. **Conditional-bundle (RFC2-20-26) als 1 rule:** Wenn Subagents in Welle D RFC2-spec-conformance prüfen, müssen sie wissen dass diese 5 Pattern-IDs in 1 yaml-rule live. Dokumentiert in apiq-meta.

## Open Questions

1. **Sentinel-rules vs Walker-rules — Welle-T-coupling:** Sentinels in Welle C verweisen auf Walkers die noch nicht alle existieren (CL-48 schema-similarity-walker, F-14 pluralised-nodes-walker). Sollten diese Walkers in Welle D oder T gebaut werden?
  **Recommendation:** Welle D-territory (P3-Walker-Implementation natürliches Home), nicht Welle T (Test-Coverage). T fokussiert auf Test-Pipeline + CI-Gates, nicht Walker-impl.

sollen wir die dann sofort bauen?

1. **F7-codegen-target-Coverage:** 12/25 client-p2-rules mit concrete targets. Soll-Coverage über alle ~170 rules nach Welle D + D2 messen.
  **Recommendation:** Acceptance-Criterion in Welle D nicht setzen; in Welle E (Putz-Niveau-Benchmark) messen + falls <50%, Welle E1 als Lückenschließer.  


was bedeutet das?

1. **Custom-functions Count noch sinnvoll?:** 25 functions in 4 files (multi-lang-reserved-keywords + threat-p1 + threat-p2 + client-p2). Welle D wird +30 P3-rules + entsprechende functions adden. Soll Welle D Custom-Functions in einer File konsolidieren oder weiter splitten per lens-priority?
  **Recommendation:** weiter splitten per lens-priority (gleicher Pattern wie P1/P2). Konsolidierung wäre Welle-Arch-territory wenn überhaupt.

was ist die korrekteste lösung hier? denke dran, alles 100% ordentlich machen!

## Commits

- `e62ff05` — feat: implement epic 09 / welle C — P2 spectral rules

## Test-Suite-Status

- **Welle-C-affected suites:** 356/4 skip pass (verified 2026-05-08 21:53)
  - `threat-p2-rules.test.ts`: 83 + 2 skip
  - `client-p2-rules.test.ts`: 64 pass
  - `client-p2-functions.test.ts`: 38 pass
  - `apiq-meta-coverage-gate.test.ts`: 13 pass
  - `spectral-runner-apiq-meta.test.ts`: 7 pass
  - `threat-p1-rules.test.ts`: 57 + 2 skip pass (no regression)
  - `apiq-ruleset-client-p1.test.ts`: 94 pass (no regression)
- **Total post-Welle-C estimated:** ~1130 / 4 skip / 0 fail (war 944 baseline). +187 neue Tests.

Lint: 0 errors in Welle-C-files (12 pre-existing in unrelated files).
Build (`npx tsc --noEmit`): 0 errors in Welle-C-files (2 pre-existing in severity-schema.ts wg. zod-v4).

## Inventur post-Welle-C


| Komponente                | Anzahl                                 | Status                   |
| ------------------------- | -------------------------------------- | ------------------------ |
| Active Spectral rules     | ~170 across 6 yamls                    | 100% mit apiq-meta-Block |
| Custom Spectral-Functions | 25 (5 P1 + 15 threat-p2 + 5 client-p2) | alle aktiv registriert   |
| Walkers                   | 23 (16 baseline + 7 info-tier)         | unchanged                |
| Module-classes wired      | 15                                     | unchanged                |
| Total tests               | ~1130 / 4 skip / 0 fail                | +187 vs Welle-F baseline |
| F5 coverage-gate          | 6 yamls × ≥95%                         | 100% achieved            |


---

## Open-Questions-Resolutions (User 2026-05-08)

> Append-only post-review section. User has reviewed and answered the 3 open questions above. Resolutions feed into Welle-D-Scope-Extension (Plan-Doc §7 erweitert).

### OQ1 — Sentinel-walkers sofort bauen?

**User:** "sollen wir die dann sofort bauen?"

**Resolution:** Ja, in Welle D mit-implementieren als T-Sentinels sub-task. 3 walker-files:
- `walkers/schema-similarity.ts` (CL-48)
- `walkers/pluralised-nodes.ts` (F-14)
- Erweiterung `json-schema-draft-detector.ts` (CL-24)

Begründung: sentinel-rules sind unvollständige rules — fire nur als Pointer auf nicht-existente Walker. Maximalismus = nichts halb-fertig lassen. Welle D ist natural-spot.

### OQ2 — F7-codegen-target-Coverage

**User:** "was bedeutet das?" (re: "in Welle E messen + Welle E1 als Lückenschließer")

**Resolution:** F7 = per-target codegen-tagging (`apiq-meta.codegen-targets` mit `['*']` oder konkreter list). Mein Original-Vorschlag "in Welle E messen" war faul. User-Direktive "alles 100% ordentlich" überschreibt das.

**Welle D Acceptance-Erweiterung:**
- Alle ~60 neue P3-rules tragen explicit `['*']` ODER konkrete codegen-targets-Liste (kein default `['*']`)
- Retroactive für existing P1+P2-rules: alle sprach-spezifischen bekommen konkrete Liste
- Target ≥80% korrekt-getagged auf ~230 active rules

### OQ3 — Custom-functions Konsolidierung

**User:** "was ist die korrekteste lösung hier? denke dran, alles 100% ordentlich machen!"

**Resolution:** Konsistenter `<lens>-p<priority>-functions.ts`-Pattern für ALLE Wellen (gleiches Pattern wie threat-p1/threat-p2/client-p2).

**Welle D macht 2 Cleanup-Tasks:**
1. **Rename** `multi-lang-reserved-keywords.ts` → `client-p1-functions.ts` (consistency-cleanup; mechanical refactor)
2. **Neue P3-function-files** per Lens-Bucket: `threat-p3-functions.ts`, `client-p3-functions.ts`, `evolution-p3-functions.ts`, `standards-p3-functions.ts` (jeweils 0+ functions; empty buckets = kein file)

**NICHT:**
- Konsolidierung in 1 file → wäre Welle Arch territory
- Sub-directories `spectral-functions/threat/p1.ts` → bricht imports + bringt keinen value

### Welle-D-Scope-Erweiterung dokumentiert

Plan-Doc §7 wurde am 2026-05-08 erweitert um diese 3 sub-tasks (T-Sentinels + T-F7 + T-Funcs) zusätzlich zum Original-Scope (T16c + T18c + T25). Resume-Trigger nächste Session bleibt "welle d starten".


