# Stage A Claim Audit — Documentation vs Code Reality

> **Status:** Read-only audit performed 2026-05-06 against branch `v1-launch` HEAD `4c31358`.
> Verifier: independent claim-by-claim verification against `scripts/spike/**` source.
> No code changes made.
>
> **Method.** For each numerical, categorical, coverage, differentiator, and architecture claim found in 7 of the 8 audit-target documents (audit ran independently of any other audit), extract verbatim, locate in source, classify ✓/✗/⚠, document evidence + discrepancy.

---

## Executive Summary

1. **The deterministic pipeline is hollow at the entry point.** Of the 17 top-level "module-classes" listed in `scripts/spike/deterministic/*.ts`, only `severity-schema.ts` is reachable from `runDeterministicLayer` (transitively through walkers). The other ~12 files (`secret-scanner`, `webhook-signature`, `http-protocol-pairings`, `problem-json-validator`, `oauth2-flow-validator`, `media-type-iana-validator`, `json-schema-draft-detector`, `style-classifier`, `per-style-coherence`, `spec-diff`, `path-template-parser`, `ref-graph`, `ajv-validator`, `cross-reference-consistency`, `duplicate-schemas`, `naming-classifier`, `codegen-validation`) are **standalone tested modules with no production caller** — they each have unit-tests but `runDeterministicLayer` never invokes them. Public API is `runSpectralLayers` + `runWalkers` only.

2. **The "28/28 Springer-Delphi" claim is unverified narrative — and the +1 vs the previous "27/28" baseline rests on a module (`spec-diff.ts`) that is not wired into the pipeline.** Every doc-to-code mapping in the Putz-Niveau Benchmark table is a manual claim; no test asserts that any Springer-Delphi rule fires. `grep -r "springer\|delphi\|putz" scripts/spike/__tests__` returns zero hits. The 27→28 upgrade hinges on T26 spec-diff, but that module is not invoked from `runDeterministicLayer` or any default-runner; its only callers are its own tests.

3. **Internal docs disagree with each other on the same facts.** Two specs say "27/28 Springer-Delphi + 1 partial" (`implementation-priority.md:536, :556`; `meta-insights.md:511`), three docs say "28/28 covered" (handoff `:3, :11, :76`; CLAUDE.md `:5`; MEMORY.md). The "4 differentiators" list also drifts: meta-insights `:316` lists Lens 3, 5, 8, 9; handoff lists Lens 3, 5, 9 + RFC2-5 (substituting RFC2-5 for Lens 8). LOC claims drift between "~21k" (phase-b `:24`), "~25k incl. Tests" (handoff `:56`); actual is ~31k (no tests) / ~45k (with tests).

4. **4 P1 Threat rules are explicitly admitted-broken in the handoff but the headline "22 P1 patterns" obscures it.** The threat-p1 YAML registers **22 active rule definitions** (counted: lines 41–432). Four additional rules (TM-A22, TM-A32, TM-A39, TM-A53) appear ONLY as YAML comments at lines 304, 350, 402, 447 — no rule definitions. Their custom JS functions (`listEndpointHasPagination`, `sensitiveFlowNeedsRateLimitHeaders`, `corsCredentialsWildcardConflict`, `responseHasWwwAuthenticateHeader`) are imported and registered in `APIQ_CUSTOM_FUNCTIONS` (`spectral-runner.ts:119–133`) but are referenced by ZERO active YAML rule (`grep` confirmed: no matches across all four `.yaml` files). They are dead code in production; only the test fixtures exercise them.

5. **STAGE-A-RESULTS.md is stale empirical evidence.** File timestamp 2026-05-05 17:02 — pre-Welle-B. Numbers reported (e.g. github-rest 8427 findings) reflect the layer state from before the Welle B P1 ruleset additions. The "~50-1100 findings" range claim in `phase-b-design.md:29` does not match github-rest's 8427.

---

## Per-Document Audit

### 1. `CLAUDE.md` — Status block (lines 1–15)

| Claim (verbatim, ≤100 chars) | Source | Status | Evidence | Discrepancy details |
|---|---|---|---|---|
| `Stage A Welle 0+A+B DONE (2026-05-06)` | `CLAUDE.md:5` | ✓ | git log shows commits `8d6ad3a..23b9981` + Welle A + Welle B labelled commits all present | — |
| `17 Module-Klassen` | `CLAUDE.md:5` | ⚠ | `ls scripts/spike/deterministic/*.ts` = 22 files. If you remove infra (`index.ts`, `output-mapper.ts`, `types.ts`, `severity-schema.ts`, `spectral-runner.ts`) the count = 17 | Number is reachable but only by hand-picking exclusions; AND of those 17, only 1 is invoked by `runDeterministicLayer` (transitively). The "17 module-classes" framing implies 17 production-active modules; reality is 16 dead/tested-only + 1 active |
| `4 ruleset-yamls` | `CLAUDE.md:5` | ✓ | 4 files: `apiq-ruleset.yaml`, `apiq-ruleset-client-p1.yaml`, `apiq-ruleset-threat-p1.yaml`, `apiq-ruleset-evolution.yaml` | — |
| `16 walkers` | `CLAUDE.md:5` | ⚠ | `walkers/*.ts` minus `index.ts`+`_shared.ts` = 16 files; `ALL_WALKERS` array in `walkers/index.ts:37–54` has 16 entries | Number is correct but conflates "walker file" with "pattern-detector". `evolution-statistical.ts` is 1 file emitting 9 EV-* patterns; `ai-agent-consumability.ts` is 1 file emitting 8 L9-* patterns; `operational-metadata.ts` similarly multi-pattern. Real distinct pattern-detectors via walkers ≈ 30+, but only 16 walker FILES |
| `5 spectral-functions` | `CLAUDE.md:5` | ⚠ | `spectral-functions/*.ts` = 2 files (`multi-lang-reserved-keywords.ts`, `threat-p1-functions.ts`); 5 export entries in `APIQ_CUSTOM_FUNCTIONS` (`spectral-runner.ts:119–133`) | "5" is correct as count of exported callables. **But** only 1 (`multi-lang-reserved-keywords`) is referenced by an active YAML rule (CL-1). The other 4 are dead in production (their YAML rules are commented-out — see #4 in summary) |
| `790 tests pass / 35 files` | `CLAUDE.md:5` | ✓ | `npx vitest run` (just-executed) = "Test Files 35 passed (35), Tests 790 passed \| 2 skipped (792)" | Doc rounds down; the 2-skipped tests are gated by `APIQ_SMOKE_BIG=1` — handoff doc captures this correctly |
| `28/28 Springer-Delphi covered` | `CLAUDE.md:5` | ✗ | The Springer-Delphi 28-rule mapping (`rules-brainstorm.md:1729–1758`) is a **narrative cross-reference** (manual "this Pattern-ID covers this rule"); zero tests verify any rule fires. Two specs say 27/28 (`implementation-priority.md:536`; `meta-insights.md:511`); only memory + handoff say 28/28 | `grep -r "Springer\|Delphi\|Putz\|Niveau" scripts/spike/__tests__` = 0 hits. The +1 vs 27/28 baseline relies on T26 `spec-diff.ts` which is NOT registered with the pipeline. The benchmark claims to be a "CI gate" (`implementation-priority.md:536`) but no CI job exists |
| `4 confirmed differentiators (Lens 3 / Lens 5 / Lens 9 / RFC2-5)` | `CLAUDE.md:5` | ⚠ | `meta-insights.md:316` lists differentiators as **Lens 3, 5, 8, 9** — different list. RFC2-5 is one rule under Lens 8, not its own "differentiator" | Internal contradiction. Also: "confirmed" is asserted but no cross-linter empirical evidence exists. The critical-review explicitly says (`critical-review.md:528`): "den Spec einfach durch Vacuum, Redocly CLI, Community-Spectral-Rulesets jagen … haben wir nicht gemacht" — and that has not changed |
| `Pattern-Mining declared done at 10 Lenses` | `CLAUDE.md:5` | ✓ | `meta-insights.md:462` argues for convergence at 10 lenses with diminishing-yield curve. This is a documentation/process decision; no falsifiable code claim | — |
| `790 tests pass on v1-launch (Stage A)` | `CLAUDE.md:6` | ✓ | confirmed via test-run | — |
| `298 tests pass v0.1 main` | `CLAUDE.md:6` | (out of scope — main branch) | not checked | not part of this audit's branch |
| `Welle C/D/E pending` | `CLAUDE.md:5,11` | ✓ | No commits or files for T16b/c, T18b/c, T24, T25 | — |

---

### 2. `~/.claude/.../project_epic09_spike_handoff.md`

| Claim | Source | Status | Evidence | Discrepancy |
|---|---|---|---|---|
| `790 tests pass / 35 files` | `:11` | ✓ | matches | — |
| `T22 IANA-Registry-Snapshot … 7 sub-modules` | `:14` | ✓ | `ls deterministic/iana/` = 7 .ts files (excluding index.ts) | — |
| `T8 secret-scanner … TruffleHog+Gitleaks 32 patterns + 4 PII` | `:19` | ✗ | `secret-scanner.ts` `SECRET_PATTERNS` = **35 entries** (counted), `PII_PATTERNS` = 4 entries; total 39 | "32" undercounts SECRETS by 3. The class-comment (`:31`) says "~50 most load-bearing" but actual = 35 |
| `T9 webhook-signature … Sleeper-killer-rule. pagerduty 2 echte findings` | `:20` | ⚠ | Module exists at `webhook-signature.ts` (337 lines). It is NOT imported by anyone in production (`grep` confirmed). Tests pass | "Pagerduty 2 findings" is unverifiable from the module's standalone test (haven't run the standalone CLI) but plausible. Module is inert in the production pipeline |
| `T10 http-protocol-pairings … pagerduty 624 endpoints affected` | `:21` | ⚠ | Module exists; not in pipeline | Not verifiable without standalone run |
| `T11 problem-json-validator … RFC2-5 cross-class uniqueness USP` | `:22` | ⚠ | Module exists; not in pipeline. RFC2-5 not in any active YAML rule | The "USP" is implemented in a module that is unreachable from `runDeterministicLayer` |
| `T12..T15 modules … 9-style-Taxonomie + Style-0 Mixed` | `:23–26` | ⚠ | Modules exist; only `per-style-coherence.ts` imports `style-classifier.ts`; neither is registered with the pipeline | All "Welle A 9 module-classes" are standalone-tested but production-inert |
| `T26 spec-diff … roll-our-own (kein npm-dep), 11 breaking-change-classes. Schließt 28/28 Springer-Delphi` | `:27` | ✗ | `spec-diff.ts` exists. Not registered in pipeline. Class-doc lists 11 classes (A,B,C,D,E,G,H,I,K,L,N) — confirmed; the claim "Schließt 28/28" is the load-bearing one and is unverified by tests. Two other docs still say 27/28 | The rule that bridges 27→28 is "detect breaking changes" — only checkable via two-spec input, but the module receives no spec input from the production runner |
| `T20 A2 entfernen … Stripe-Domain-Layer aus default pipeline` | `:30` | ✓ | `index.ts:121–133` shows the domain-knowledge runner registration is commented-out with explicit removal-rationale | — |
| `T16a … 22 P1 patterns + 4 custom-functions … 18 DSL-only aktiv. 4 (TM-A22/A32/A39/A53) als YAML-Comments + funktioniert nur in tests — TODO follow-up` | `:34` | ⚠ | YAML rule defs in threat-p1.yaml = 22 active (counted at lines 41,55,74,94,111,122,133,149,160,175,194,210,229,248,268,287,319,337,364,387,415,432). 4 commented-out at lines 304, 350, 402, 447. Functions ARE registered (`APIQ_CUSTOM_FUNCTIONS`) — but `grep` confirms zero active YAML rule references them | Self-acknowledged TODO. The handoff is honest here, but the headline "22 P1 patterns" reads as if 22 rules cover all P1; in reality 18 effectively-active + 4 with-functions-but-no-rules. Plus the 22 active includes 22 with rule defs (NOT "18 DSL-only aktiv" — the comment-text is slightly off; it's 22 rule defs total, of which 18 use only stock Spectral functions and 4 reference custom functions but those 4 are: WAIT — let me re-verify) |
| (continuation of above) | — | — | Re-counted: of the 22 active rules, **none** reference custom functions (the 4 custom-function rules are the COMMENTED-OUT ones). All 22 active rules use stock Spectral DSL functions (`pattern`, `defined`, `truthy`, `falsy`, `schema`, `enumeration`, `undefined`). So the "18 DSL-only aktiv" wording in the handoff is wrong — it's 22 DSL-only active. The 4 custom-function rules are entirely commented-out and exist only as test fixtures | Internal-text typo. Claim should read: "22 DSL-only aktiv. 4 (TM-A22/A32/A39/A53) als YAML-Comments — die 4 entsprechenden custom-functions sind registriert aber von keiner aktiven Regel referenziert." |
| `T17 Evolution Spectral + Walker … 27 EV-* Spectral rules + 9 walkers` | `:35` | ⚠ | `apiq-ruleset-evolution.yaml` active rules = 30 (not 27); `evolution-statistical.ts` is 1 walker file emitting 9 EV-* patterns | "27 EV-* Spectral rules" should be 30. "9 walkers" is wrong terminology — it is 1 walker file with 9 sub-pattern detectors |
| `T18a P1 Client-Friction Spectral … 27 rules` | `:36` | ✓ | client-p1.yaml = 27 active rules (counted at lines 41,57,78,100,119,139,161,182,203,223,241,269,298,320,351,373,403,427,448,468,492,511,530,554,575,598,616) | — |
| `multi-lang-reserved-keyword custom-function (250+ keywords / 7 Sprachen)` | `:36` | ✓ | 7 reserved-sets (Java/Go/Python/JS/Rust/C#/Kotlin); ~583 quoted entries across all sets; >> 250 | Conservative claim; actual ~583 |
| `T19 AI-Agent Walker (2a13a0a): 8 L9-* patterns` | `:37` | ✓ | `ai-agent-consumability.ts:1–57` documents L9-1..L9-8 (8 patterns) | — |
| `T20 Operational-Metadata Walker (97e083a): 7 L10-* + F-7 patterns` | `:38` | ⚠ | Walker exists. The label "T20" collides with "T20 A2 entfernen" used in `:30` — the same task-ID names two different commits | Naming collision in handoff doc itself. Not a code-vs-doc bug — a doc-vs-doc bug |
| `T21 Privacy/Data-Class Walker … 4 L6-* patterns + cross-tag` | `:39` | ⚠ | Walker file exists | Not exhaustively verified |
| `Module-Klassen in scripts/spike/deterministic/*.ts \| 17` | `:50` | ⚠ | See #1 above; reachable from `runDeterministicLayer` ≠ 17 | Same finding |
| `Custom Spectral-Functions \| 5 (multi-lang-reserved-keywords + threat-p1's 4)` | `:52` | ⚠ | 5 entries in `APIQ_CUSTOM_FUNCTIONS`; only 1 referenced by active YAML | Misleading without "of which 4 are dead in production" |
| `Walkers in walkers/ \| 16 (12 original + 4 Welle B)` | `:53` | ✓ | confirmed | — |
| `Lines of code (ungefähr) \| ~25k LOC inkl. Tests` | `:56` | ✗ | `find scripts/spike -name "*.ts" -not -path "*/node_modules/*"` = **45,379 lines** | Off by ~80% |
| `28/28 Springer-Delphi high-importance (mit T26 spec-diff)` | `:76` | ✗ | See #2/#3 in summary. T26 spec-diff is not in production pipeline; no test verifies any Springer-Delphi rule fires | — |
| `24 OWASP-Security-Rules` | `:77` | ⚠ | threat-p1 active rules = 22 (not 24). 26 OWASP API* references in YAML comments but rules = 22 active + 4 commented-out | "24" doesn't match either 22-active or 22+4=26 |
| `7-language reserved-keyword catalog (250+ keywords)` | `:79` | ✓ | confirmed | — |
| `4 commented threat-p1 rules (TM-A22/A32/A39/A53) brauchen actual YAML-definitions. Functions registriert via 23b9981, YAML-rules-defs fehlen. ~30-60 min Engineering` | `:97` | ✓ | Self-honest; verified accurate | — |
| `Wallets: OpenAI ~$10, OpenRouter ~$10-15, Anthropic-direct ~$15` | `:126–128` | (out of scope) | not verifiable from code | — |

---

### 3. `~/.claude/.../MEMORY.md`

| Claim | Source | Status | Evidence | Discrepancy |
|---|---|---|---|---|
| `Stage A Welle 0+A+B done. 17 modules + 4 yamls + 16 walkers + 5 spectral-functions` | MEMORY entry "Epic 09 …handoff" | ⚠ | inherits all the same caveats as the handoff | repeats the framing problem |
| `790 tests pass` | same | ✓ | confirmed | — |
| `28/28 Springer-Delphi` | same | ✗ | unverified narrative | same |
| `4 confirmed differentiators (Lens 3/5/9 + RFC2-5 USP)` | same | ⚠ | meta-insights says Lens 3/5/8/9 (4 lenses, not 3 lenses + 1 rule) | same drift |
| `Pattern-mining done at 10 lenses` | same | ✓ | matches meta-insights:462 | — |
| `Carry-over: 4 commented threat-p1 rules need YAML-defs` | same | ✓ | accurate | — |

---

### 4. `specs/big-spec-architecture-spike-phase-b-design.md`

| Claim | Source | Status | Evidence | Discrepancy |
|---|---|---|---|---|
| `Stage A — Deterministic ~290 Pattern-Detectors (17 modules + 4 yamls + 16 walkers)` | `:21–25` | ✗ | Active YAMLs total = 27+27+22+30 = **106 rules**. 16 walker files (with multi-pattern walkers expanding to ~30 sub-patterns). 17 "modules" but 16 are unreachable. Actual reachable pattern-detectors via `runDeterministicLayer` ≈ 106 YAML rules + ~30 walker patterns + Spectral OAS3-default (~56 rules) = **~190 detectors total**, but only ~30+106 = ~136 are apiq's | "~290 Pattern-Detectors" is the MINING TARGET (all of P1+P2+P3+P4+P5 in `implementation-priority.md`), NOT what is implemented. Currently only P1 + parts of P2 are implemented |
| `Stage-A Findings (~50-1100 raw per spec, post-aggregation)` | `:29–30` | ✗ | STAGE-A-RESULTS.md (stale, pre-Welle-B): dnd5eapi=243, pagerduty=1643, github-rest=8427 | github-rest = 8427 is far outside the "~50-1100" range. The doc cites a number that contradicts the actual measurement |
| Auto-Fix-Safe filter `~15% subset` | `:39` | (forecast) | Not implemented | claim is forward-looking |
| `pagerduty: ~60K Tokens nur für Findings + 150K für spec` | `:89` | (forecast) | Token-counts not measured against current Welle-B findings | claim is forward-looking |
| `15% der ~290 patterns` | `:300` | ✗ | Same as ~290 issue. Plus: actual implemented patterns ≪ 290 | — |
| `(Ursprünglich hatte ich Phase B mit "1 Tag" geschätzt — das war falsch. Realistic mit Stage-A-Integration ist 3-5 Tage)` | `:332` | (process correction) | meta-only | — |
| Open question 5: `Stripe-spec hat 262 GET-with-body (RFC-violation aber Stripe-design)` | `:302` | (not verified here) | not part of audit | — |

---

### 5. `specs/big-spec-architecture-spike-stage-a-implementation-priority.md`

| Claim | Source | Status | Evidence | Discrepancy |
|---|---|---|---|---|
| `Total Stage-A patterns (take-into-apiq, after dedup) \| ~290` | `:18` | ✓ | this is the mining-target — defined here | — |
| `P1 ~95, P2 ~60, P3 ~110, P4 ~15, P5 ~10` | `:19–23` | ✓ | mining-target counts | — |
| `P1+P2 = ~155 patterns covering mature-linter-pari` | `:33` | ✓ | mining-target | "covered" not yet — see below |
| `apiq covers 27 of 28 Springer-Delphi high-importance rules + 1 partial` | `:536, :556` | ✗ vs other docs | This is the ORIGINAL baseline. CLAUDE.md/handoff/MEMORY say "28/28" | Internal inconsistency: this doc still says 27/28 |
| `Wave 2 deliverable: P1+P2 + 8 Modules (T8–T15) + Spectral rule-sets (T16–T19) + Cross-cutting (T22–T25)` | `:554` | ⚠ | 8 modules T8–T15 = 9 module files (T15 is two: style-classifier + per-style-coherence). T16–T19 = built. T22 = built. T23 = built. T24 = NOT built. T25 = NOT built (carry-over). T26 (spec-diff) was added later | Plan-vs-actual partial. T16 has only the P1 subset (T16a) — T16b/T16c are pending (Welle C/D) |
| `Pari-gate: 27/28 Springer-Delphi high-importance rules + DOLAR-catalog` | `:556` | ✗ | DOLAR-catalog mentioned but not implemented: F-11/F-12/F-13/F-14 are P2 Client-Friction patterns. `apiq-ruleset-client-p1.yaml` has 27 rules but does NOT include F-11 through F-14 (those are P2 Wave-C deliverables per handoff `:85`) | — |
| `T22 IANA Registry Snapshot Job … quarterly-refresh CI job` | `:465` | ⚠ | Snapshot files exist (`iana/*.ts`); no CI job exists | "CI job" part is aspirational |
| `T24 Putz-Niveau Benchmark validation` | `:467` | ✗ | Not built; explicitly listed as Welle E pending | — |
| `T25 Source-Verification CI job` | `:468` | ✗ | Not built; explicitly listed as Welle D pending | — |

---

### 6. `specs/big-spec-architecture-spike-stage-a-meta-insights.md`

| Claim | Source | Status | Evidence | Discrepancy |
|---|---|---|---|---|
| `5 lenses → 10 lenses` | `:298–301` | ✓ | the 10-lens table at `:303–315` is enumerated | — |
| `4 of 10 lenses are explicit apiq-differentiators: Lens 3, 5, 8, 9` | `:316` | ✓ vs other docs | This is the canonical 4-differentiator list | Inconsistent with handoff/CLAUDE.md/MEMORY which say Lens 3/5/9 + RFC2-5 (substituting RFC2-5 for Lens 8) |
| `8 functional rule-classes + 3 architectural elements` | `:371–419` | ⚠ | 8 functional classes are abstract definitions (no test/code-mapping). 3 architectural elements (Classifiers, Aggregators, Deep-Mechanic Modules) describe code that exists but most of it (Modules) is not in the production pipeline | Architectural framework is sound on paper. The "3 architectural elements" claim that `style-classifier`, `json-schema-draft-version-detector`, `oauth2-flow-classifier`, `media-type-IANA-classifier` are "Classifiers that gate other detectors" — but in code none of these is gating any active YAML rule |
| `Coverage analysis: every existing apiq-rule maps to ≥1 cube-cell` | `:336–337` | ⚠ | Cube-cells defined narratively. No code asserts every active rule has its `stakeholder`+`lifecycle`+`defect-class` metadata populated | The Severity-Schema-Final does define those fields (`severity-schema.ts`); whether each YAML rule actually carries them is not enforced |
| `Putz-Niveau Benchmark: apiq covers 27 of 28 Springer-Delphi high-importance rules + 1 partial` | `:511` | ✗ vs handoff/MEMORY | This says 27/28; CLAUDE.md/MEMORY say 28/28 | Same inconsistency |
| `Pattern-inventory: ~290 take-into-apiq patterns` | `:510` | ✓ | mining-target, repeat of priority-doc | — |
| `Mining declared converged at 10 lenses; further rounds expected to yield single-digit patterns` | `:462–464` | ✓ | meta-claim, unfalsifiable from code | — |

---

### 7. `specs/big-spec-architecture-spike-critical-review.md` (skim)

| Claim | Source | Status | Evidence | Discrepancy |
|---|---|---|---|---|
| `Best-in-class-Linter-Niveau (Vacuum-Tools + Community-Rulesets + tuned Custom-Rules): ✗ wahrscheinlich nicht` | `:525` | ✓ | Self-honest assessment that no cross-linter parity test has been run | This contradicts the later-doc claims of "Konkurrenz-Pari" / "24 OWASP-Security-Rules / Vacuum-default-coverage parity via T16a" — the parity is still un-measured |
| `Stage-A polieren auf Best-in-class-Linter-Niveau (~2-4 Tage). Externe Reality-Check: Vacuum + Redocly CLI + Community-Spectral-Rulesets gegen unsere 4 Specs` | `:542–543` | ✗ done | This planned work has not been done. No `vacuum`, `redocly`, or community-ruleset comparison artifact exists in repo | The "Putz-Schritt-First ist load-bearing für Reputation" lesson (`:585`) is documented but not executed |
| `Custom-Spectral-Ruleset von 27 → 50-100 Rules` | `:547` | ✓ done | Total active YAML rules now 106 (`27+27+22+30`) — exceeds the lower bound | Quantitatively done; quality vs Vacuum still un-tested |
| `Stripe-Domain-Layer feuert nur als Backup falls LLM unter v6 fehlschlägt` | `:514` | ✓ partial | `index.ts:121–133` confirms domain-knowledge runner is removed from default. Module preserved for manual re-registration | Plan executed; "Backup" mechanism is "manual re-import", not user-facing |

---

### 8. `specs/big-spec-runs/eval/STAGE-A-RESULTS.md`

| Claim | Source | Status | Evidence | Discrepancy |
|---|---|---|---|---|
| `Domain-knowledge \| 0` (in per-layer findings) | `:26, :77, :136` | ✓ | Matches the post-T20 reality: domain-knowledge runner removed | — |
| `Stripe-Domain-Layer findings (in coverage tables)` | `:36–39` etc. | ⚠ | dnd5eapi: "Domain-knowledge | 1 | 2 | 50.0%" — but the layer was removed before this commit-set in current state | The file is dated 2026-05-05 17:02, BEFORE Welle B commits. Numbers are stale |
| github-rest: Findings emitted = 8427 | `:128` | ⚠ | Stale measurement; current Welle-B Stage-A may produce different number | The phase-b-design `~50-1100` range can't accommodate this 8427 |
| Coverage rates: dnd5eapi 28.6% (4/14), pagerduty 26.1% (6/23), github-rest 22.6% (7/31) Jaccard | `:11–13` | ⚠ | Pre-Welle-B numbers; Welle B added 22+27+30 = 79 new active YAML rules + 4 walkers. Coverage may be different now | The 22-29% Jaccard / 35-50% Embedding Stage-A-only coverage is significant context that doesn't surface in CLAUDE.md / MEMORY / handoff status messages |
| `Top detectors firing: spectral:apiq-* names` | `:60–64` etc. | ✓ | the rule codes match `apiq-ruleset.yaml` | — |

---

## Cross-Document Inconsistencies

| Fact | Doc 1 | Doc 2 | Doc 3 |
|---|---|---|---|
| Springer-Delphi coverage | `priority.md:536, :556` "27/28 + 1 partial" | `meta-insights.md:511` "27/28 + 1 partial" | `CLAUDE.md:5`, `MEMORY` "28/28 covered"; `handoff:3, :11, :76` "28/28 mit T26" |
| 4-differentiator list | `meta-insights.md:316` "Lens 3, 5, 8, 9" | `handoff:67–72` "Lens 3, 5, 9 + RFC2-5" | `MEMORY` "Lens 3/5/9 + RFC2-5"; `CLAUDE.md:5` same as MEMORY |
| Spike LOC | `phase-b-design.md:24` "~21k LOC" | `handoff:56` "~25k LOC inkl. Tests" | actual `find scripts/spike -name "*.ts"` = 45,379 (with tests) / 31,402 (without tests) |
| Active threat-p1 rule count | `handoff:34` "22 P1 patterns" + "18 DSL-only aktiv" + "4 als YAML-Comments" | YAML reality: 22 active rule-defs (all DSL-only); 4 commented-out (would-be custom-fn rules) | Internal contradiction within handoff: "22 patterns" vs "18 DSL-only aktiv" vs "4 als YAML-Comments" — only consistent if "22 = 18 + 4" but the 4 are NOT active so 22 active count is misleading |
| Active evolution rule count | `handoff:35` "27 EV-* Spectral rules" | `apiq-ruleset-evolution.yaml` actual = 30 active rules | Off by 3 |
| T20 task identity | `handoff:30` "T20 A2 entfernen (568e537)" | `handoff:38` "T20 Operational-Metadata Walker (97e083a)" | Same task-ID for two different commits/deliverables |
| Stage-A finding range | `phase-b-design.md:29–30, :89` "~50-1100 raw per spec" | `STAGE-A-RESULTS.md:128` "github-rest: 8427 findings" | Phase-b range is 8x smaller than measured github-rest |
| Reachable modules from `runDeterministicLayer` | All status-docs imply 17 active "module-classes" | `index.ts:50–99` calls only `_spectralRunner` + `_walkerRunner` (and `_domainKnowledgeRunner` which is no longer registered) | 16 of 17 "module-classes" are not on any code-path triggered by the public API |

---

## Aggregate Confidence Score

| Category | True (✓) | False (✗) | Misleading (⚠) | Sample size |
|---|---:|---:|---:|---:|
| Numerical | ~50% | ~30% | ~20% | n=15 (790 tests ✓; 35 files ✓; 250+ keywords ✓; 7 languages ✓; 16 walker files ✓; 4 yamls ✓; 17 modules ⚠; 5 functions ⚠; 28/28 ✗; 24 OWASP ✗; 32 secret-patterns ✗; 27 EV rules ✗; ~25k LOC ✗; ~290 detectors ✗ as "implemented"; ~50-1100 findings ✗) |
| Done-statements | ~70% | ~10% | ~20% | n=10 (Welle 0/A/B done ✓; T20 A2 entfernt ✓; T22 IANA done ✓; T8 done ✓; T26 spec-diff exists ✓ but not wired); Putz-Benchmark "done" ✗; Cross-linter parity "done" ✗; T15 done ✓ but not wired ⚠ |
| Differentiator | ~30% | ~30% | ~40% | n=4 (Lens 3 evolution ⚠ — single-spec walker exists; Lens 5 style-classifier ⚠ — module exists but not wired into pipeline; Lens 9 AI-agent ✓ — walker is wired; RFC2-5 USP ⚠ — module not wired). "kein anderer Linter ships das" claims have NO empirical verification |
| Pari claims | ~10% | ~60% | ~30% | "28/28 Springer-Delphi covered" ✗ (unverified narrative + module not wired); "24 OWASP-Security-Rules" ⚠ (22 active); "Multi-RFC-Compliance" ⚠ (RFC modules exist but not wired); "Vacuum-default-coverage parity" ✗ (never measured); "DOLAR-catalog" ⚠ (claimed but F-11/12/13/14 not in P1 yamls) |
| Architecture | ~80% | ~5% | ~15% | 10 Lenses ✓; 8+3 architectural-elements taxonomy ✓ (sound description); Stakeholder×Lifecycle×Defect-Class cube ✓ (defined); Severity-Schema 4-tier ✓ (in `severity-schema.ts`); but "every rule maps to a cube-cell" ⚠ (no enforcement) |

---

## Recommended Documentation Fixes

(Specific edits to bring docs in sync with reality.)

1. `CLAUDE.md:5`: change `17 Module-Klassen + 4 ruleset-yamls + 16 walkers + 5 spectral-functions` → `1 active module-class (severity-schema) + 16 standalone-tested module files (not in pipeline) + 4 ruleset-yamls (106 active rules) + 16 walker files + 2 spectral-function files (5 callables, 1 used in active rule)`

2. `CLAUDE.md:5`: change `28/28 Springer-Delphi covered` → `27/28 narrative-mapped + 1 partial (T26 spec-diff exists as standalone module, not yet wired into pipeline; no test verifies any Springer-Delphi rule fires)`

3. `CLAUDE.md:5`: change `4 confirmed differentiators (Lens 3 / Lens 5 / Lens 9 / RFC2-5)` → `4 claimed differentiators per meta-insights (Lens 3, 5, 8, 9); RFC2-5 is one rule under Lens 8. None empirically validated against Vacuum/Redocly/Spectral-OWASP-ruleset cross-linter comparison`

4. `project_epic09_spike_handoff.md:19`: change `TruffleHog+Gitleaks 32 patterns + 4 PII` → `TruffleHog+Gitleaks 35 SECRET patterns + 4 PII patterns (39 total in module; module is standalone-tested, not in production pipeline)`

5. `project_epic09_spike_handoff.md:30 vs :38`: rename one of the two T20 task labels. Suggested: `:30` → "T20a A2 Stripe-Domain-Layer removal", `:38` → "T20b Operational-Metadata Walker"

6. `project_epic09_spike_handoff.md:34`: change `22 P1 patterns + 4 custom-functions … 18 DSL-only aktiv. 4 (TM-A22/A32/A39/A53) als YAML-Comments + funktioniert nur in tests` → `22 active YAML rule-defs (all stock-Spectral DSL) + 4 commented-out rules (TM-A22/A32/A39/A53) whose custom JS functions are imported/registered but reference no active rule. Currently 22 active, 4 dead-functions`

7. `project_epic09_spike_handoff.md:35`: change `27 EV-* Spectral rules + 9 walkers` → `30 active EV-* Spectral rules in apiq-ruleset-evolution.yaml + 1 walker file (evolution-statistical.ts) emitting 9 EV-* statistical patterns`

8. `project_epic09_spike_handoff.md:50`: change `Module-Klassen in scripts/spike/deterministic/*.ts | 17` → `*.ts files | 22 (17 named-module-classes + 5 infrastructure files). Of the 17, only 1 (severity-schema.ts) is reachable from runDeterministicLayer; the other 16 are standalone-tested but not in the production pipeline`

9. `project_epic09_spike_handoff.md:52`: change `Custom Spectral-Functions | 5` → `Custom Spectral-Functions | 5 callables (1 active in YAML rule CL-1; 4 registered but not referenced by any active rule)`

10. `project_epic09_spike_handoff.md:56`: change `Lines of code (ungefähr) | ~25k LOC inkl. Tests` → `Lines of code | ~31k LOC in deterministic/ + spike-harness (no tests) / ~45k LOC including __tests__/`

11. `project_epic09_spike_handoff.md:67–72`: bring 4-differentiator list in sync with `meta-insights.md:316` (Lens 3, 5, 8, 9), or update meta-insights to match — pick one canonical list

12. `project_epic09_spike_handoff.md:76`: change `28/28 Springer-Delphi high-importance (mit T26 spec-diff)` → `27/28 narrative-mapped to apiq-pattern-IDs in rules-brainstorm.md table + 1 partial (rule #28 detect-breaking-changes — T26 spec-diff module exists but is not wired into runDeterministicLayer or any default-runner). No test verifies any Springer-Delphi rule actually fires on a real spec`

13. `project_epic09_spike_handoff.md:77`: change `24 OWASP-Security-Rules (Vacuum-default-coverage parity via T16a)` → `22 active OWASP-referenced rules in threat-p1 (parity vs Vacuum-default not empirically measured — see critical-review.md:528)`

14. `phase-b-design.md:24`: change `(17 modules + 4 yamls + 16 walkers)` → `(1 active module + 16 standalone modules + 4 yamls = 106 active rules + 16 walker files)`

15. `phase-b-design.md:29–30`: change `~50-1100 raw per spec, post-aggregation` → `measured pre-Welle-B (STAGE-A-RESULTS.md, stale): dnd5eapi=243, pagerduty=1643, github-rest=8427. Range claim should be re-measured post-Welle-B before relying on it for token-budget math`

16. `phase-b-design.md:300`: same as #14 — change `~290 patterns` to actual implemented count (~136 = 106 YAML + ~30 walker sub-patterns) when discussing implementation; reserve "~290" only for mining-target language

17. `implementation-priority.md:556` AND `meta-insights.md:511`: pick a single Springer-Delphi number (27/28 or 28/28) and align all docs. If 28/28, then `spec-diff.ts` MUST be wired into `runDeterministicLayer` first and a test asserting rule #28 fires must exist; otherwise stay at 27/28

18. `meta-insights.md:316` vs `handoff:67–72`: as #11, pick canonical 4-differentiator list

19. `STAGE-A-RESULTS.md` (stale): regenerate via `npx tsx scripts/spike/eval/stage-a-validation.ts` to capture current Welle-B numbers, OR add header noting "Pre-Welle-B; numbers do not reflect current Stage A"

20. `MEMORY.md` Epic 09 entry: align with whichever canonical numbers are chosen across CLAUDE.md / handoff / specs

---

## Honest Synthesis

The Stage-A spike has produced a substantial body of work: 35 test files, 790 passing tests, 4 functional Spectral rulesets totaling 106 active rules, 16 walker files, an IANA-snapshot module, a typed Severity-Schema, and 16 deeply-tested standalone modules covering threat / privacy / RFC / OAuth2 / problem-json / spec-diff / style-classification.

What the documentation does not say clearly:

- 16 of the 17 "module-classes" never run when an end-user calls `runDeterministicLayer`. They are tested in isolation; they are not in the production pipeline.
- 4 of the headlined "P1 Threat" rules are commented-out. Their custom JS functions are imported and registered but referenced by no active rule. The handoff acknowledges this as a 30-60min carry-over but the headline number "22 P1 patterns" papers over it.
- The "28/28 Springer-Delphi" claim (and the "Konkurrenz-Pari" / "24 OWASP / Multi-RFC-Compliance" claims) are not backed by any test, CI gate, or cross-linter empirical comparison. The critical-review (`:528`) explicitly admits the Vacuum/Redocly comparison was never done; nothing in the codebase has changed that.
- The empirical Stage-A coverage reported in `STAGE-A-RESULTS.md` is stale (pre-Welle-B) and shows 22-29% Jaccard / 35-50% Embedding coverage — meaningful context that the status-block claims of "DONE" obscure.
- Multiple internal docs disagree on basic counts: 27/28 vs 28/28 Springer-Delphi; ~21k vs ~25k LOC vs actual 45k; "Lens 3, 5, 8, 9" vs "Lens 3, 5, 9 + RFC2-5"; "27 EV-* rules" vs actual 30; "32 + 4 secret-patterns" vs actual 35 + 4.

The spike is real engineering. The status writeups frame it more confidently than the wiring justifies.
