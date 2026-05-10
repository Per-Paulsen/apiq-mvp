# Epic 09 / Welle D2 — P4 + P5 Niche/Vendor Patterns

> P4 + P5 Pattern-Implementation aus Plan-Doc §8: nominell ~26 Patterns aus den P4/P5-Tabellen, davon **15 bereits in vorigen Wellen implementiert** (siehe Bestandsaufnahme unten). Echter neuer Scope: **11 Patterns** als Spectral-rules in 1 neuem YAML-File `apiq-ruleset-niche.yaml` plus zugehörige Custom-Functions. Pre-Condition: Welle D done (commit `2983a82` — Welle Arch+ + T12/T13 final).
>
> Plan-Doc Master: `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` §8 (Welle D2). Pattern-Substrate: `scripts/spike/data/patterns.json` (959 patterns). Pattern-Listen: `specs/big-spec-architecture-spike-stage-a-implementation-priority.md` P4-Tabelle (Zeilen 410-421) + P5-Tabelle (Zeilen 425-441).
>
> **Maximum-Scope-Direktive (User 2026-05-08):** "alles 100% ordentlich machen". Memory: `feedback_plan_doc_is_source_of_truth.md` + `feedback_putzen_first_before_validation.md` + `feedback_no_trade_off_against_vision.md` + `feedback_never_defer_fixes.md` + `feedback_no_engineering_time_estimates.md`.

## Bestandsaufnahme — bereits implementiert in vorigen Wellen

Pre-D2-Audit (2026-05-10 Plan-Doc-§8-vs-Code-Cross-Check) zeigt: 15 der nominell ~26 P4/P5-Patterns sind bereits implementiert. Die D2-Spec deduplicate diese und implementiert nur den verbleibenden echten neuen Scope.

| Pattern-ID | Bereits implementiert in | Datei |
|---|---|---|
| RFC2-50 (P5) | Welle D | `rules/apiq-ruleset-standards-p3.yaml:1040` |
| RFC2-75 (P4) | Welle Arch+ T13 | `classifiers/media-type-iana-classifier.ts:309` |
| RFC2-76 (P4) | Welle Arch+ T13 | `classifiers/media-type-iana-classifier.ts:296` |
| RFC2-77 (P5) | Welle Arch+ T13 | `classifiers/media-type-iana-classifier.ts:318` |
| RFC2-79 (P4) | Welle Arch+ T13 + Spectral-rule | `classifiers/media-type-iana-classifier.ts:278` + `rules/apiq-ruleset.yaml:939` |
| RFC2-80 (P4) | Welle Arch+ T13 | `classifiers/media-type-iana-classifier.ts:331` |
| RFC2-96 (P4) | Welle B | `modules/http-protocol-pairings.ts:174` |
| L6-2 (P5) | Welle B (privacy-data-class) | `aggregators/privacy-data-class.ts:374` |
| L9-7 / F-16 (P5) | Welle F info-tier walker | `aggregators/info-tier-capability-discovery.ts` + `aggregators/ai-agent-consumability.ts:737` |
| F-10 (P5) | Welle F info-tier walker | `aggregators/info-tier-sla4oai.ts` |

**Verbleibender echter neuer Scope für D2: 11 Patterns** (4 P4 + 7 P5).

## Scope

Welle D2 implementiert **11 verbleibende P4/P5-Patterns** als Spectral-rules in 1 neuem YAML-File `apiq-ruleset-niche.yaml` plus benötigte Custom-Functions in `spectral-functions/niche-functions.ts`. Alle neue rules tragen vollständige `apiq-meta`-Blocks per Welle-F-Schema. Severity-defaults sind `info` oder `hint` (off-by-default-overridable wo applicable per Maximalismus-"alles drin"-Prinzip — niche-rules sind opt-in-praxis).

### T-D2-P4 — P4 Niche/Low-Frequency (4 rules) → `apiq-ruleset-niche.yaml`

Patterns aus `implementation-priority.md` P4-Tabelle (Zeilen 410-421), bereits-implementierte ausgeklammert:

- **RFC2-71** — Server-URL host MUST be lowercase per RFC 3986 §3.2.2 (case-insensitive comparison; smell wenn mixed-case). Lens: hyg + 2.
- **RFC2-72** — Server-URL scheme MUST be lowercase per RFC 3986 §3.1 (`HTTP://` smell). Lens: hyg + 2.
- **RFC2-73** — Server-URL path normalization per RFC 3986 §6 (no `/./`, no `/../`, no double-slashes, no trailing slash on non-root). Lens: hyg + 2.
- **RFC2-95** — `Retry-After` header value grammar (HTTP-date OR delta-seconds non-negative integer) per RFC 9110 §10.2.3. Detect via header-example/schema validation auf `Retry-After`-headers in 429/503-responses. Lens: 2.

**Custom-Functions:** `spectral-functions/niche-functions.ts` (NEU):
- `serverUrlHostLowercase` (RFC2-71) — parse `servers[].url`, extract host, check `.toLowerCase() === host`
- `serverUrlSchemeLowercase` (RFC2-72) — parse scheme prefix (`http://` vs `HTTP://`)
- `serverUrlPathNormalized` (RFC2-73) — check path-segment normalization (regex against `\.\.|//|/\./`)
- `retryAfterGrammar` (RFC2-95) — validate header-example/schema-example matches HTTP-date pattern OR positive-integer

### T-D2-P5 — P5 Vendor-Extension/Information-only (7 rules) → `apiq-ruleset-niche.yaml`

Patterns aus `implementation-priority.md` P5-Tabelle (Zeilen 425-441), bereits-implementierte ausgeklammert:

- **RFC2-83** — JSON-Schema `default`/`example` value parses as strict JSON per RFC 8259 §2 (kein trailing-comma, kein single-quote-strings). Detect via JSON.parse-attempt auf string-encoded defaults/examples. Lens: 2.
- **RFC2-89** — `contentEncoding`/`contentMediaType` schema-keywords are JSON-Schema draft-07+ (NOT in OpenAPI 3.0; valid in 3.1). Detect via spec-version-check + keyword-presence. Lens: 2 + 3.
- **RFC2-103** — 428 Precondition Required status awareness per RFC 6585 §3 — info-finding wenn write-ops auf etag-resourcen kein 428-response definieren. Lens: 2.
- **RFC2-105** — 511 Network Authentication Required status awareness per RFC 6585 §6 — info-finding (rare; nur relevant für captive-portal-APIs). Lens: 2.
- **CL-60** — `x-internal: true` extension presence info-finding (Stripe/OAI vendor-extension pattern für hidden-from-public-docs operations). Detect via `paths.*.*.x-internal` walk. Lens: 4 + 3.
- **F-18** — Bloated description doc-smell — operation/schema descriptions >1000 chars OR repeated-boilerplate (e.g. same description-prefix on >50% operations). Lens: 4.
- **SC-20** — AIP standard-field-presence (`name`, `display_name`, `create_time`, `update_time`) on AIP-style resource-paths (off-by-default). Detect AIP-pattern via path-shape (`v1/{collection}/{id}`-style) + check resource-schema field-presence. Lens: 5.

**Custom-Functions:** `spectral-functions/niche-functions.ts` (gleiche Datei wie P4):
- `defaultExampleStrictJson` (RFC2-83) — JSON.parse string-encoded defaults/examples (skip non-string)
- `contentEncodingOnOAS30` (RFC2-89) — check `info.openapi` spec-version + flag if `contentEncoding`/`contentMediaType` keyword present
- `precondition428Awareness` (RFC2-103) — walker pattern: detect ETag-bearing GET-resources + corresponding write-ops without 428 in response-list
- `status511Awareness` (RFC2-105) — pure info-rule; check Components.responses for any 511-response (positive marker)
- `xInternalUsage` (CL-60) — JSONPath-walk + count `x-internal: true` occurrences
- `bloatedDescription` (F-18) — char-length-check + repeated-boilerplate-detection (substring-prefix-frequency-analysis)
- `aipStandardFieldPresence` (SC-20) — path-shape-pattern-matcher + schema-field-presence-check (off-by-default — severity `hint` mit `aip-style-only: true` apiq-meta-tag)

### Spectral-Runner-Erweiterung

`scripts/spike/deterministic/infra/spectral-runner.ts` erweitern:
1. Add 1 new path constant: `APIQ_RULESET_NICHE_PATH`
2. `loadYamlRules` für `apiq-ruleset-niche.yaml` in `buildSpectral`
3. `merged`-Object inkludiert niche-rules
4. Custom-functions-registry erweitert um neue niche-functions
5. `SUPPORTED_FUNCTIONS`-Set updated

### F5-Coverage-Gate-Erweiterung

`__tests__/deterministic/apiq-meta-coverage-gate.test.ts` erweitert von 11 auf **12 yamls** (apiq-ruleset-niche.yaml hinzu). 100% apiq-meta-coverage auf alle 11 neuen niche-rules verifiziert.

### Tests

**Pro YAML (1 neue):** Integration-test `apiq-ruleset-niche.test.ts` analog zu `apiq-ruleset-other-p3.test.ts`:
- Rule-loading verifies (alle 11 Pattern-IDs geparst)
- Spectral-runner merge verifies (12. yaml liest)
- apiq-meta coverage 100% per F5-gate
- Per-rule fixture-tests wo non-trivial pattern-detection

**Pro Custom-Function:** Unit-tests in `__tests__/deterministic/niche-functions.test.ts` mit positive + negative + edge-case-fixtures pro function.

**T25 Source-Verify:** existing `source-verify.test.ts` profitiert automatisch — alle niche-rules mit `source-verbatim` (RFC 3986/8259/9110/6585-cites) feeden in die quarterly verification.

## Acceptance criteria

Welle D2 ist done wenn ALLE folgenden erfüllt sind:

1. **1 neue YAML-File** existiert + parst clean: `apiq-ruleset-niche.yaml` (11 rules: 4 P4 + 7 P5)
2. **100% apiq-meta-Coverage** auf allen 11 niche-rules (alle Pflichtfelder per F5-gate populated, inkl. `agentReadinessImpact` wo Lens-9/10-affin)
3. **F5-coverage-gate-test** erweitert auf 12 yamls
4. **Custom-Functions:** `spectral-functions/niche-functions.ts` implementiert 11 functions (1-zu-1 mit rules) + tests pass
5. **Spectral-Runner erweitert:** liest alle 12 yamls + alle niche-functions registriert
6. **Integration-Tests** für niche-yaml: rule-loading + apiq-meta-validity + per-rule fixture-tests
7. **Bestandsaufnahme dokumentiert:** Welle-D2-Spec + Welle-D2-Results referenzieren explizit die 15 bereits-implementierten Patterns aus vorigen Wellen (Audit-Trail)
8. **Source-verbatim populated** für niche-rules wo verbatim-cite vorhanden in patterns.json (feeds T25-baseline-update)
9. **Test-Suite grün:** 2230 baseline + neue Tests (alle pass, 0 fail, ≤4 skip)
10. **Lint + tsc** keine NEW errors
11. **Memory + Plan-Doc updated:**
    - Plan-Doc §8 → "done"; §21 Welle-Status-Tracker D2-Zeile gefüllt
    - handoff-memory `project_epic09_spike_handoff.md` updated mit Welle-D2-Status
    - CLAUDE.md status-block updated
    - `specs/E09-w-d2-niche-vendor-results.md` mit deviations + risks + open-questions
12. **Commit:** `feat: implement epic 09 / welle D2 — niche+vendor patterns`

## Out of scope

- Welle E (T24 Putz-Niveau-Benchmark gegen 28 Springer-Delphi-Rules) — wartet auf D2 done
- Welle T (Test-Coverage all-specs + Snapshot-Tests + CI-Pipeline) — kann parallel laufen
- Welle Doc / Welle R / Welle V — nachgelagert
- Welle M2 / Welle Z / Phase B — post-V
- Re-Implementation der 15 bereits-implementierten Patterns aus vorigen Wellen (siehe Bestandsaufnahme) — explizit deduplicated, kein Doppelarbeit
- Stripe-perf-investigation — bereits in Welle Arch+ explizit deferred auf Welle V (Spectral-bound)

Welle D2 selbst ist Niche-Pattern-Implementation; empirisch-gemessene Coverage-lift gegen Reference-Specs erfordert separate measurement-pass NACH Welle V — nicht hier.

## Domain terms

- **P4-Pattern:** "Niche / Low-Frequency" per `implementation-priority.md` Priority-Achse — selten-vorkommende standards-conformance-checks. Default severity `info` oder `hint`.
- **P5-Pattern:** "Vendor-Extension / Information-only / Niche" per `implementation-priority.md` — meist off-by-default oder positive-marker (kein violation). Default severity `info` oder `hint`.
- **off-by-default-overridable:** rule existiert im YAML aber `recommended: false` — User opt-in via `extends`-config wenn relevant für ihre Domain.
- **AIP-style:** Google API Improvement Proposals (https://google.aip.dev) — REST-resource-pattern mit standardisierten field-names (`name`, `display_name`, `create_time`, `update_time`) und path-shapes (`v1/{collection}/{id}`).
- **Bestandsaufnahme:** 15 der nominellen 26 Plan-Doc-§8-Patterns sind bereits in vorigen Wellen implementiert. Welle-D2-Spec dokumentiert dies explizit als Audit-Trail; D2-Implementation deduplicate und baut nur die verbleibenden 11 patterns.

## Open questions

Keine. Plan-Doc §8 + `implementation-priority.md` P4/P5-Tabellen + Bestandsaufnahme-Audit (Pre-D2 2026-05-10) sind source-of-truth (per `feedback_plan_doc_is_source_of_truth.md`). Maximalismus-Direktive impliziert: alle 11 verbleibenden Patterns implementiert, keine Sub-Selection.

Falls während Implementation emergent Issues auftauchen → werden im Welle-D2-results-File post-/dev dokumentiert, nicht pre-implementation entschieden.
