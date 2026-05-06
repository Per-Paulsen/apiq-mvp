> Read-only audit of the Epic 09 Stage-A spike (`scripts/spike/`), branch `v1-launch`, generated 2026-05-06.
> Cross-references the post-Welle-B claims in `CLAUDE.md` / memory file `project_epic09_spike_handoff.md` against what actually exists, what is wired into the pipeline, what is only imported by tests, and what was actually executed end-to-end against the four reference specs. All paths absolute. No code changes performed.

# 1. Executive summary

- **The pipeline `runDeterministicLayer` only runs Spectral + Walkers.** The "domain-knowledge" runner is intentionally disabled (per code comment, decision 2026-05-05) and **none of the 17 standalone module-classes are wired into the pipeline.** They live as `.ts` files in `scripts/spike/deterministic/`, are exercised exclusively by their own `__tests__/deterministic/<module>.test.ts`, and are never invoked at runtime. The "17 module-classes" claim is technically true (the files exist + have tests) but materially misleading — only **2** of the 17 (`severity-schema.ts` via `types.ts`, and `output-mapper.ts`) feed any finding into the public `runDeterministicLayer` output. The other 15 are orphan-but-tested code.
- **The 16/17 walker count claim is real and accurately wired.** All 16 walkers under `scripts/spike/deterministic/walkers/` (excluding `_shared.ts` + `index.ts`) are registered in `ALL_WALKERS` and execute on every `runDeterministicLayer` call. Welle B walker count matches.
- **The 4 YAML rulesets, 5 custom-functions claim is *almost* accurate, with one deliberate gap.** 105 active Spectral rules across the 4 YAMLs (27 + 27 + 22 + 30 — slightly different breakdown than the per-Welle docs imply). 5 custom functions are registered in `APIQ_CUSTOM_FUNCTIONS`, but **only 1 of the 5 is referenced by any active rule** — the 4 threat-p1 functions (`listEndpointHasPagination`, `sensitiveFlowNeedsRateLimitHeaders`, `corsCredentialsWildcardConflict`, `responseHasWwwAuthenticateHeader`) are registered + tested in isolation but their rules in `apiq-ruleset-threat-p1.yaml` are commented out. Memory file already calls this out as a known carry-over.
- **Test count claims are correct.** Real `npx vitest run` output: 35 test files / 790 passed + 2 skipped. No tests call `runDeterministicLayer` — every test exercises its target module directly with inline JSON or an `openapi-examples/<spec>/spec.json` load. There is **no integration test of the full pipeline.**
- **`STAGE-A-RESULTS.md` is stale + incomplete.** The validation runner `scripts/spike/eval/stage-a-validation.ts` was committed once on 2026-05-05 (commit `d3ffc19`) and produces results for **3 of 4** specs (stripe-full is missing — coverage-table omits it). Numbers in `specs/big-spec-runs/eval/STAGE-A-RESULTS.md` are pre-Welle-A AND pre-Welle-B (every Welle-A T8/T10/T11/T13/T14/T15/T26 commit is dated 2026-05-05 18:21 onwards; every Welle-B commit is 2026-05-06; the validation file mtime is 2026-05-05 17:15). **The +35–52pp prediction-vs-measured gaps in that doc do not reflect any of the Welle A or B work.** No fresh Stage-A measurement has been run after the additional ~70 Welle-B Spectral rules + 4 walkers landed.

# 2. Pipeline wiring

## 2.1 `runDeterministicLayer` runtime invocation

`C:/Users/perpa/Dev/apiq-mvp/scripts/spike/deterministic/index.ts:50–99` runs three optional layer-runners in order:

| Slot | Variable | Registered by `registerDefaultRunners()` | Source |
|---|---|---|---|
| 1 | `_spectralRunner` | `runSpectralLayers` from `./spectral-runner.js` | `index.ts:109–113` |
| 2 | `_walkerRunner` | `runWalkers` from `./walkers/index.js` | `index.ts:115–119` |
| 3 | `_domainKnowledgeRunner` | **NEVER** (intentionally disabled 2026-05-05) | `index.ts:121–133` (commented block) |

So at runtime only `runSpectralLayers` + `runWalkers` produce findings. Everything else in `deterministic/` is unreachable from the public entry point unless a caller manually `import`s and invokes it.

## 2.2 Top-level `deterministic/*.ts` module → import-status

For every `.ts` directly under `scripts/spike/deterministic/` (excluding subdirs `walkers/`, `spectral-functions/`, `iana/`, `domain-knowledge/`):

| Module | LOC | Public exports (key) | Imported by (non-test) | Imported by test | Status |
|---|---:|---|---|---|---|
| `index.ts` | 135 | `runDeterministicLayer`, `registerDefaultRunners`, `register{Spectral,Walker,DomainKnowledge}Runner` | (entry point) | — | **in-pipeline** (entry) |
| `types.ts` | 155 | `DetectorFinding`, `DetectorOptions`, `DetectorLayer`, re-exports from `severity-schema` | every walker, every wired module, `index.ts:23`, `output-mapper.ts:15`, `spectral-runner.ts:57` | (transitive) | **in-pipeline** |
| `output-mapper.ts` | 79 | `mapDetectorFindings` | `index.ts:24`, `spectral-runner.ts:60` | — | **in-pipeline** |
| `spectral-runner.ts` | 943 | `runSpectralLayers`, `measureSpectralCoverage`, `getClientP1RuleCodes`, `_resetSpectralCacheForTests` | `index.ts:110` (dynamic), `eval/comparison.ts`, `eval/stage-a-validation.ts` (transitive) | `apiq-ruleset-client-p1.test.ts`, `threat-p1-rules.test.ts` | **in-pipeline** |
| `severity-schema.ts` | 466 | `SeveritySchema`, `LensSchema`, `RuleMetadataSchema`, `validateMetadata`, etc. | `types.ts:136,155`, `walkers/{ai-agent-consumability,operational-metadata,privacy-data-class}.ts`, `webhook-signature.ts:44`, `oauth2-flow-validator.ts:38`, `secret-scanner.ts:62` | `severity-schema.test.ts`, `ai-agent-consumability.test.ts` | **in-pipeline** (via `types.ts` re-exports) |
| `ajv-validator.ts` | 1148 | `runAjvValidator`, `__test` | **none** | `ajv-validator.test.ts` | **orphan-but-tested** |
| `codegen-validation.ts` | 602 | `runCodegenValidation` | **none** | `codegen-validation.test.ts` | **orphan-but-tested** |
| `cross-reference-consistency.ts` | 486 | `walkCrossReferenceConsistency` | **none** | `cross-reference-consistency.test.ts` | **orphan-but-tested** |
| `duplicate-schemas.ts` | 516 | `runDuplicateSchemas`, etc. | **none** | `duplicate-schemas.test.ts` | **orphan-but-tested** |
| `http-protocol-pairings.ts` | 919 | `walkHttpProtocolPairings`, `__test` | **none** | `http-protocol-pairings.test.ts` | **orphan-but-tested** |
| `json-schema-draft-detector.ts` | 973 | (multiple) | **none** | `json-schema-draft-detector.test.ts` | **orphan-but-tested** |
| `media-type-iana-validator.ts` | 620 | `runMediaTypeValidator` | **none** | `media-type-iana-validator.test.ts` | **orphan-but-tested** |
| `naming-classifier.ts` | 900 | (multiple) | **none** | `naming-classifier.test.ts` | **orphan-but-tested** |
| `oauth2-flow-validator.ts` | 634 | (multiple) | **none** | `oauth2-flow-validator.test.ts` | **orphan-but-tested** |
| `path-template-parser.ts` | 850 | `walkPathTemplates` | **none** | `path-template-parser.test.ts` | **orphan-but-tested** |
| `per-style-coherence.ts` | 1063 | (multiple) | **none** | `style-classifier.test.ts:30` | **orphan-but-tested** |
| `problem-json-validator.ts` | 890 | (multiple) | **none** | `problem-json-validator.test.ts` | **orphan-but-tested** |
| `ref-graph.ts` | 754 | `runRefGraphAnalysis`, `buildRefGraph` | **none** | `ref-graph.test.ts` | **orphan-but-tested** |
| `secret-scanner.ts` | 1120 | (multiple) | **none** | `secret-scanner.test.ts` | **orphan-but-tested** |
| `spec-diff.ts` | 1030 | `runSpecDiff` | **none** | `spec-diff.test.ts` | **orphan-but-tested** |
| `style-classifier.ts` | 675 | `classifyApiStyle`, `collectStats` | `per-style-coherence.ts:27` (which is itself orphan) | `style-classifier.test.ts:26` | **orphan-but-tested** (chained) |
| `webhook-signature.ts` | 663 | `runWebhookSignature`, `WEBHOOK_SIGNATURE_RULES` | **none** | `webhook-signature.test.ts` | **orphan-but-tested** |

**Summary: of 22 top-level `.ts` files, 5 are in-pipeline, 17 are orphan-but-tested.** The 17 orphans total **~12,830 LOC of production-style code that never executes at runtime** outside its own test fixture.

The `eval/stage-a-validation.ts` runner — the only thing that calls `runDeterministicLayer` end-to-end — therefore measures coverage produced ONLY by Spectral (4 YAML rulesets + OAS3-default) plus the 16 walkers. None of the 17 orphan modules contribute to the published Stage-A measurement.

# 3. Walker inventory

`scripts/spike/deterministic/walkers/index.ts:37–54` defines `ALL_WALKERS`. Every `.ts` file in `walkers/` (excluding `_shared.ts` + `index.ts`) is included exactly once.

| File | Function | In `ALL_WALKERS`? |
|---|---|---|
| `ai-agent-consumability.ts` | `walkAiAgentConsumability` | yes (line 50) |
| `empty-schema-descriptions.ts` | `walkEmptySchemaDescriptions` | yes (line 39) |
| `evolution-statistical.ts` | `walkEvolutionStatistical` | yes (line 51) |
| `html-prevalence.ts` | `walkHtmlPrevalence` | yes (line 38) |
| `integer-no-range-constraints.ts` | `walkIntegerNoRangeConstraints` | yes (line 41) |
| `maxlength-default-everywhere.ts` | `walkMaxLengthDefaultEverywhere` | yes (line 40) |
| `operational-metadata.ts` | `walkOperationalMetadata` | yes (line 52) |
| `operationid-verbose.ts` | `walkOperationIdVerbose` | yes (line 45) |
| `pagination-style-inconsistency.ts` | `walkPaginationStyleInconsistency` | yes (line 46) |
| `privacy-data-class.ts` | `walkPrivacyDataClass` | yes (line 53) |
| `prose-deprecation-without-flag.ts` | `walkProseDeprecationWithoutFlag` | yes (line 44) |
| `request-body-no-examples.ts` | `walkRequestBodyNoExamples` | yes (line 42) |
| `response-without-validators-on-304.ts` | `walkResponseWithoutValidatorsOn304` | yes (line 49) |
| `single-default-response.ts` | `walkSingleDefaultResponse` | yes (line 43) |
| `unused-component-headers.ts` | `walkUnusedComponentHeaders` | yes (line 48) |
| `vendor-extension-overuse.ts` | `walkVendorExtensionOveruse` | yes (line 47) |

**16 walker files / 16 registered. Zero orphans.** Welle B walkers (T19 ai-agent-consumability, T17 evolution-statistical, T20 operational-metadata, T21 privacy-data-class — last 4 entries) wired in commit `b6ba3bd` ("register 4 Welle B walkers in ALL_WALKERS"). Claim accurate.

# 4. YAML rule inventory

The four YAMLs are loaded by `spectral-runner.ts:396–408` and merged into a single ruleset (`spectral-runner.ts:411–423`). All four files are read at startup; rules using unsupported `function:` values are silently dropped (line 280–284), and rule `apiq-comma-separated-should-be-array` is hard-blocklisted (line 228–233 — `RULE_CRASH_BLOCKLIST` — known to crash on Stripe/GitHub specs).

## 4.1 `apiq-ruleset.yaml` (604 LOC)

| Active rule | `then.function:` | Notes |
|---|---|---|
| `apiq-fk-fields-need-format-or-pattern` | `defined` | builtin |
| `apiq-unix-time-format-on-timestamp-fields` | `defined` | builtin |
| `apiq-limit-parameter-needs-bounds` | `defined` | builtin |
| `apiq-limit-property-needs-bounds` | `defined` | builtin |
| `apiq-deepobject-only-on-objects` | `undefined` | builtin |
| `apiq-no-ref-siblings` | `undefined` (×2) | builtin |
| `apiq-description-no-html-markup` | `pattern` | builtin |
| `apiq-schema-description-not-stub` | `length` | builtin |
| `apiq-info-description-substantive` | `length` | builtin |
| `apiq-spec-needs-tags-array` | `defined` + `length` | builtin |
| `apiq-tag-meaningful-description` | `length` | builtin |
| `apiq-oneof-needs-discriminator` | `defined` | builtin |
| `apiq-count-fields-should-be-integer` | `pattern` | builtin |
| `apiq-no-localhost-servers` | `pattern` | builtin |
| `apiq-response-needs-content` | `defined` | builtin |
| `apiq-no-content-type-header-parameter` | `undefined` | builtin |
| `apiq-post-should-accept-json` | `defined` | builtin |
| `apiq-versioning-headers-need-enum` | `defined` | builtin |
| `apiq-default-type-matches-integer` | `schema` | builtin |
| `apiq-default-type-matches-number` | `schema` | builtin |
| `apiq-default-type-matches-boolean` | `schema` | builtin |
| `apiq-default-type-matches-string` | `schema` | builtin |
| `apiq-prefer-iana-markdown-mediatype` | `pattern` | builtin |
| `apiq-request-body-needs-example` | `xor` | builtin |
| `apiq-comma-separated-should-be-array` | `pattern` | builtin (**runtime-blocklisted in `spectral-runner.ts:230`** — never executes against any spec) |
| `apiq-unused-component-headers` | `unreferencedReusableObject` | builtin |
| `apiq-unused-component-examples` | `unreferencedReusableObject` | builtin |

**Active: 27. Effectively-active (after blocklist): 26. Commented-out: 0** (the YAML's notes/comment-block at the bottom only describes rules deferred to other layers, none formatted as commented `# apiq-XX:` blocks).

## 4.2 `apiq-ruleset-client-p1.yaml` (638 LOC)

| Active rule | `then.function:` | Notes |
|---|---|---|
| `apiq-cl1-property-name-reserved-keyword` | `multi-lang-reserved-keywords` | **CUSTOM** |
| `apiq-cl1-operationid-reserved-keyword` | `multi-lang-reserved-keywords` | **CUSTOM** |
| `apiq-cl2-property-name-leading-underscore-or-digit` | `pattern` | builtin |
| `apiq-cl6-operationid-required` | `defined` | builtin |
| `apiq-cl12-oneof-needs-discriminator` | `defined` | builtin |
| `apiq-cl20-204-must-not-have-content` | `undefined` | builtin |
| `apiq-cl26-pattern-needs-anchors` | `pattern` | builtin |
| `apiq-cl31-no-bare-array-request-body` | `pattern` | builtin |
| `apiq-cl33-schema-needs-type` | `defined` | builtin |
| `apiq-cl36-example-value-xor-externalvalue` | `undefined` | builtin |
| `apiq-cl37-component-name-identifier-safe` | `pattern` | builtin |
| `apiq-cl40-path-must-not-have-query` | `pattern` | builtin |
| `apiq-cl45-pagination-cursor-and-offset-cooccur` | `truthy` | builtin |
| `apiq-cl46-error-response-needs-shape` | `schema` | builtin |
| `apiq-cl50-path-no-file-extension` | `pattern` | builtin |
| `apiq-cl55-enum-casing-uniform` | `schema` | builtin |
| `apiq-cl57-enum-no-duplicates` | `schema` | builtin |
| `apiq-cl58-path-no-mixed-case-segments` | `pattern` | builtin |
| `apiq-cl59-operationid-url-friendly` | `pattern` | builtin |
| `apiq-cl63-operation-summary-or-description` | `or` | builtin |
| `apiq-cl66-discriminator-mapping-shape` | `pattern` | builtin |
| `apiq-cl68-path-no-adjacent-params` | `pattern` | builtin |
| `apiq-cl69-example-respects-maxlength` | `schema` | builtin |
| `apiq-cl70-default-respects-required` | `schema` | builtin |
| `apiq-cl73-server-url-no-placeholder` | `pattern` | builtin |
| `apiq-cl76-path-method-uniqueness` | `truthy` | builtin |
| `apiq-cl81-no-ref-siblings` | `undefined` (×4) | builtin |

**Active: 27. Custom-function-using: 2 (CL-1 ×2). Commented-out: 0.**

## 4.3 `apiq-ruleset-threat-p1.yaml` (452 LOC)

| Active rule | `then.function:` | Notes |
|---|---|---|
| `apiq-tm-y2-api-key-in-url` | `falsy` | builtin |
| `apiq-tm-y2-api-key-in-url-components` | `falsy` | builtin |
| `apiq-tm-y3-credentials-in-path-template` | `pattern` | builtin |
| `apiq-tm-y4-http-basic-on-insecure-server` | `pattern` | builtin |
| `apiq-tm-y5-oauth2-authorization-url-https` | `pattern` | builtin |
| `apiq-tm-y5-oauth2-token-url-https` | `pattern` | builtin |
| `apiq-tm-y5-oauth2-refresh-url-https` | `pattern` | builtin |
| `apiq-tm-y7-oauth2-implicit-flow-forbidden` | `undefined` | builtin |
| `apiq-tm-y7-oauth2-password-flow-forbidden` | `undefined` | builtin |
| `apiq-tm-y17-server-url-https-only` | `pattern` | builtin |
| `apiq-tm-y23-write-op-needs-security` | `defined` | builtin |
| `apiq-tm-a6-openid-connect-url-https` | `pattern` | builtin |
| `apiq-tm-a10-bearer-token-in-url` | `pattern` | builtin |
| `apiq-tm-a11-mass-assignment-fields` | `truthy` | builtin |
| `apiq-tm-a15-pii-named-fields-response` | `defined` | builtin |
| `apiq-tm-a17-additional-properties-true-request` | `schema` | builtin |
| `apiq-tm-a23-pagination-param-needs-maximum` | `defined` | builtin |
| `apiq-tm-a24-binary-upload-needs-maxlength` | `defined` | builtin |
| `apiq-tm-a34-url-property-format-and-pattern` | `pattern` + `defined` | builtin |
| `apiq-tm-a38-cors-allow-origin-wildcard` | `pattern` | builtin |
| `apiq-tm-a42-error-schema-no-stack-trace` | `undefined` | builtin |
| `apiq-tm-a44-no-debug-paths` | `pattern` | builtin |

**Active: 22. Custom-function-using: 0. Commented-out (referenced in body comments, no rule definition): 4** — `TM-A22 listEndpointHasPagination` (line 304–312), `TM-A32 sensitiveFlowNeedsRateLimitHeaders` (line 350–356), `TM-A39 corsCredentialsWildcardConflict` (line 402–408), `TM-A53 responseHasWwwAuthenticateHeader` (line 447–452). Functions are imported + registered in `spectral-runner.ts:62–68, 124–132` and have inline tests in `__tests__/deterministic/threat-p1-rules.test.ts`, but no rule in any YAML invokes them.

## 4.4 `apiq-ruleset-evolution.yaml` (688 LOC)

| Active rule | `then.function:` | Notes |
|---|---|---|
| `apiq-ev-1-deprecated-needs-sunset` | `truthy` | builtin |
| `apiq-ev-4-bare-array-response-body` | `undefined` | builtin |
| `apiq-ev-4-bare-array-request-body` | `undefined` | builtin |
| `apiq-ev-5-response-schema-additionalproperties-undeclared` | `defined` | builtin |
| `apiq-ev-8-operation-needs-operationid` | `truthy` | builtin |
| `apiq-ev-23-request-string-needs-maxlength` | `defined` | builtin |
| `apiq-ev-23-request-array-needs-maxitems` | `defined` | builtin |
| `apiq-ev-24-pattern-needs-anchors` | `pattern` | builtin |
| `apiq-ev-25-integer-needs-format` | `defined` | builtin |
| `apiq-ev-27-path-no-file-extension` | `pattern` | builtin |
| `apiq-ev-28-server-url-no-environment` | `pattern` | builtin |
| `apiq-ev-32-no-authorization-header-parameter` | `undefined` | builtin |
| `apiq-ev-32-no-accept-header-parameter` | `undefined` | builtin |
| `apiq-ev-34-no-swagger-2` | `pattern` | builtin |
| `apiq-ev-35-no-consecutive-path-parameters` | `truthy` | builtin |
| `apiq-ev-37-info-version-required` | `undefined` | builtin |
| `apiq-ev-43-no-swagger-2-residue-consumes` | `undefined` | builtin |
| `apiq-ev-43-no-swagger-2-residue-produces` | `undefined` | builtin |
| `apiq-ev-3-response-enum-needs-extensibility` | `defined` | builtin |
| `apiq-ev-6-discriminator-needs-mapping` | `defined` | builtin |
| `apiq-ev-14-requestbody-required-explicit` | `defined` | builtin |
| `apiq-ev-16-operation-needs-default-response` | `schema` | builtin |
| `apiq-ev-17-operation-needs-tags` | `schema` | builtin |
| `apiq-ev-18-request-additionalproperties-true` | `falsy` | builtin |
| `apiq-ev-19-unused-securityschemes` | `unreferencedReusableObject` | builtin |
| `apiq-ev-46-readonly-in-request` | `undefined` | builtin |
| `apiq-ev-46-writeonly-in-response` | `undefined` | builtin |
| `apiq-ev-48-patch-content-type` | `schema` | builtin |
| `apiq-ev-55-required-param-no-default` | `undefined` | builtin |
| `apiq-ev-56-servers-required` | `defined` + `length` | builtin |

**Active: 30. Custom-function-using: 0. Commented-out: 0.**

## 4.5 YAML totals

| File | Active | Effectively-active | Commented-out (rule-blocks) | Custom-fn refs |
|---|---:|---:|---:|---:|
| `apiq-ruleset.yaml` | 27 | 26 (1 blocklisted) | 0 | 0 |
| `apiq-ruleset-client-p1.yaml` | 27 | 27 | 0 | 2 (CL-1 ×2) |
| `apiq-ruleset-threat-p1.yaml` | 22 | 22 | 4 (TM-A22/A32/A39/A53) | 0 |
| `apiq-ruleset-evolution.yaml` | 30 | 30 | 0 | 0 |
| **Total** | **106** | **105** | **4** | **2** |

# 5. Custom-function inventory

Source: `scripts/spike/deterministic/spectral-functions/{multi-lang-reserved-keywords,threat-p1-functions}.ts`. Registered: `spectral-runner.ts:119–133` (`APIQ_CUSTOM_FUNCTIONS`) + listed in `SUPPORTED_FUNCTIONS` set (`spectral-runner.ts:183–203`).

| Export | Source file | Registered? | In `SUPPORTED_FUNCTIONS`? | Referenced by active rule? |
|---|---|---|---|---|
| `multiLangReservedKeywords` (default export) | `multi-lang-reserved-keywords.ts:347` | yes (kebab `multi-lang-reserved-keywords`) | yes | **yes** (CL-1 property + operationId rules in `apiq-ruleset-client-p1.yaml`) |
| `listEndpointHasPagination` | `threat-p1-functions.ts:111` | yes (kebab `list-endpoint-has-pagination`) | yes | **NO** — function imported and registered, but TM-A22 rule body in `apiq-ruleset-threat-p1.yaml:303–312` is a comment, not a rule definition |
| `sensitiveFlowNeedsRateLimitHeaders` | `threat-p1-functions.ts:207` | yes (kebab `sensitive-flow-needs-rate-limit-headers`) | yes | **NO** — TM-A32 rule body at `:350–356` is a comment |
| `corsCredentialsWildcardConflict` | `threat-p1-functions.ts:270` | yes (kebab `cors-credentials-wildcard-conflict`) | yes | **NO** — TM-A39 rule body at `:402–408` is a comment |
| `responseHasWwwAuthenticateHeader` | `threat-p1-functions.ts:340` | yes (kebab `response-has-www-authenticate-header`) | yes | **NO** — TM-A53 rule body at `:447–452` is a comment |

Aux exports from `multi-lang-reserved-keywords.ts` (`Target`, `RESERVED_BY_TARGET`, `ALL_TARGETS`, `findCollisions`, `totalKeywordCount`, `distinctIdentifierCount`, `MultiLangReservedKeywordsOptions`) are tested directly in `apiq-ruleset-client-p1.test.ts` but not registered with Spectral (they are helpers).

**Of 5 registered custom functions, 4 are orphan-at-the-rule-level.** Their tests in `__tests__/deterministic/threat-p1-rules.test.ts` build a Spectral instance inline, register the function inline, write inline rule definitions, and assert against fabricated specs — none of this exercise reaches the production `spectral-runner.ts` ruleset on real specs.

# 6. Test character

23 deterministic test files + 8 IANA test files + 4 eval test files = 35 total. **No test calls `runDeterministicLayer` or `registerDefaultRunners`** — the entry point is exclusively driven by `eval/stage-a-validation.ts` (a CLI), and that file has no test.

| Test file | `it/test()` count | Fixture style | Integration vs unit |
|---|---:|---|---|
| `__tests__/deterministic/ai-agent-consumability.test.ts` | 21 | inline JSON + load `openapi-examples/<spec>/spec.json` | unit (`walkAiAgentConsumability` directly) |
| `__tests__/deterministic/ajv-validator.test.ts` | 21 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/apiq-ruleset-client-p1.test.ts` | 66 | inline + builds Spectral instance via `getClientP1RuleCodes` + spec loads | unit (Spectral-only) |
| `__tests__/deterministic/codegen-validation.test.ts` | 7 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/cross-reference-consistency.test.ts` | 11 | inline | unit (`walkCrossReferenceConsistency` directly) |
| `__tests__/deterministic/duplicate-schemas.test.ts` | 23 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/evolution-statistical.test.ts` | 58 | inline + `openapi-examples` | unit (`walkEvolutionStatistical` directly) |
| `__tests__/deterministic/http-protocol-pairings.test.ts` | 25 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/json-schema-draft-detector.test.ts` | 34 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/media-type-iana-validator.test.ts` | 20 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/naming-classifier.test.ts` | 17 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/oauth2-flow-validator.test.ts` | 23 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/operational-metadata.test.ts` | 25 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/path-template-parser.test.ts` | 14 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/privacy-data-class.test.ts` | 23 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/problem-json-validator.test.ts` | 16 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/ref-graph.test.ts` | 13 | inline | unit |
| `__tests__/deterministic/secret-scanner.test.ts` | 46 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/severity-schema.test.ts` | 42 | synthetic objects only | unit (zod schema) |
| `__tests__/deterministic/spec-diff.test.ts` | 12 | inline | unit |
| `__tests__/deterministic/style-classifier.test.ts` | 27 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/threat-p1-rules.test.ts` | 56 | inline; **builds its own Spectral instance** + registers `threat-p1-functions` inline + invents rule defs | unit (does NOT call `runSpectralLayers`) |
| `__tests__/deterministic/webhook-signature.test.ts` | 15 | inline + `openapi-examples` | unit |
| `__tests__/deterministic/iana/cache-directives.test.ts` | 11 | synthetic | unit (lookup tables) |
| `__tests__/deterministic/iana/field-names.test.ts` | 11 | synthetic | unit |
| `__tests__/deterministic/iana/index.test.ts` | 3 | synthetic | unit (re-exports) |
| `__tests__/deterministic/iana/link-relations.test.ts` | 9 | synthetic | unit |
| `__tests__/deterministic/iana/media-types.test.ts` | 14 | synthetic | unit |
| `__tests__/deterministic/iana/methods.test.ts` | 12 | synthetic | unit |
| `__tests__/deterministic/iana/range-units.test.ts` | 4 | synthetic | unit |
| `__tests__/deterministic/iana/status-codes.test.ts` | 12 | synthetic | unit |
| `__tests__/eval/jaccard.test.ts` | 8 | synthetic ReferenceTarget + Finding objects | unit |
| `__tests__/eval/reference.test.ts` | 5 | inline JSON | unit |
| `__tests__/eval/repetition-cluster.test.ts` | 6 | synthetic | unit |
| `__tests__/eval/snapshot.test.ts` | 7 | filesystem-tmp | unit |

`it/test(` calls summed across all 35 files: **717.** Vitest reports 790 passed + 2 skipped = 792 total. The 75-call delta is `describe.each` / `it.each` parameterisation expanding into multiple test cases at runtime.

**Critical observation:** there is no end-to-end test that asserts "given Stripe FULL → `runDeterministicLayer` produces N findings of which X match the reference". Coverage measurement only happens in the standalone CLI `eval/stage-a-validation.ts`, never in the test suite.

# 7. npm-test results

`scripts/spike/package.json` has no `test` script (only `run`). Used `npx vitest run` instead:

```
RUN  v4.1.5 C:/Users/perpa/Dev/apiq-mvp/scripts/spike

Test Files  35 passed (35)
     Tests  790 passed | 2 skipped (792)
  Start at  19:11:20
  Duration  104.68s (transform 28.51s, setup 0ms, import 64.61s, tests 365.05s, environment 65ms)
```

| Metric | Claim | Measured | Delta |
|---|---|---|---|
| Test files | 35 | 35 | 0 |
| Passed | 790 | 790 | 0 |
| Skipped | 2 | 2 | 0 |
| Failed | 0 | 0 | 0 |

**Test claim is exactly accurate.**

# 8. Eval infrastructure

`scripts/spike/eval/`:

| File | Purpose |
|---|---|
| `bulk-sweep.ts` | Bulk LLM-vs-reference sweep across multiple specs/architectures (Phase 0 / Phase A) |
| `cache/` | Cached embedding-similarity vectors for the embedding scorer |
| `comparison.ts` | Spectral vs no-Spectral A/B harness for measuring Spectral's contribution |
| `debug-ab-regression.ts` | Debug helper for A/B regression in scoring |
| `migrate-md-to-json.ts` | One-shot migration of Markdown reference targets → JSON |
| `reference.ts` | `loadReferenceTarget` — reads + validates `<spec>/reference/findings.json` |
| `runner.ts` | LLM-prompt run-driver (Phase 0/Phase B) |
| `score-run.ts` | CLI for scoring a single run output against its reference |
| `scorers/jaccard.ts`, `embedding-similarity.ts`, `repetition-cluster.ts`, `classification.ts` | Scorer implementations |
| `snapshot.ts` + `snapshots/` | Snapshot machinery for run-output regression |
| **`stage-a-validation.ts`** | **The one + only end-to-end deterministic-layer evaluator** |
| `types.ts` | `ReferenceTarget`, `Scorer`, `RunMeta` — shared types |
| `__test-fixtures__/` | Eval test fixtures |

## `stage-a-validation.ts` — when did it last run?

| Aspect | Value |
|---|---|
| File mtime | `2026-05-05 17:15:27` (no edit since) |
| Single `git log` entry | `d3ffc19 2026-05-05 18:21:36 — feat: epic 09 phase a — stage a1 + reframe a2/a3 + embedding scorer` |
| Specs covered in `STAGE-A-RESULTS.md` | 3 of 4 — dnd5eapi, pagerduty-full, github-rest. **stripe-full omitted** despite being in `ALL_SPECS` at `stage-a-validation.ts:45` |

## Position in the timeline

| Date | Welle / commit | Welle work captured by stage-a-validation? |
|---|---|---|
| 2026-05-05 17:15 | `stage-a-validation.ts` last touched | — |
| 2026-05-05 18:21 | commit `d3ffc19` (Phase-A reframe + embedding scorer) | this commit |
| 2026-05-05 → 2026-05-06 | Welle 0 (T22 IANA, T23 severity) — commits `8d6ad3a`, `0d70a3d` | **NO** (added after) |
| 2026-05-06 | Welle A modules (T8–T15, T26) — 9 commits | **NO** |
| 2026-05-06 | Welle B (T16a / T17 / T18a / T19 / T20 / T21) — 6 commits | **NO** |

**`STAGE-A-RESULTS.md` reflects the state of the codebase BEFORE Welle 0 / A / B even started.** All ~70 Welle-B Spectral rules + 4 Welle-B walkers are not measured in those numbers. The "Predicted vs Measured" deltas of −35 to −52 percentage points may have shrunk substantially after Welle B, but that is an unmeasured hypothesis.

# 9. Reference findings

| Spec dir | File | Findings | Last updated (mtime) |
|---|---|---:|---|
| `openapi-examples/stripe-full/reference/` | `findings.json` (+ `CLASSIFICATION-REVIEW.md`, `findings-target-big.md`) | 29 | 2026-05-05 13:57 |
| `openapi-examples/pagerduty-full/reference/` | `findings.json` | 23 | 2026-05-05 15:17 |
| `openapi-examples/github-rest/reference/` | `findings.json` | 31 | 2026-05-05 15:19 |
| `openapi-examples/dnd5eapi/reference/` | `findings.json` | 14 | 2026-05-05 15:16 |
| **Total reference findings** | | **97** | |

All four are JSON. All four are LLM-authored (per `notes` field on stripe-full: "humanHardenedDate: null" — never been domain-expert reviewed). Self-validation-bias risk acknowledged in the data itself.

# 10. Aggregate numbers vs. claims

| Quantity | Claimed (CLAUDE.md / memory) | Measured | Delta |
|---|---:|---:|---|
| Module-classes (top-level `.ts` excl. tests / spectral-functions / iana / domain-knowledge) | 17 | 22 (excluding `index.ts` + `output-mapper.ts` + `types.ts` + `severity-schema.ts` + `spectral-runner.ts` = 17 "domain" modules); accurate count, but **only 17 are tested-orphan**, not pipeline-active | claim wording obscures wiring status |
| Walker `.ts` files | 16 | 16 (exactly) | 0 |
| Walkers active in `ALL_WALKERS` | 16 | 16 | 0 |
| Spectral YAML rules active (sum across 4) | "4 ruleset-yamls" claim is shape-level; per-Welle docs mention 27+27+22+30 | **106** total active (105 effectively-active, 1 runtime-blocklisted) | within the per-doc numbers |
| Spectral YAML rules commented-out | 4 (per memory: "TM-A22/A32/A39/A53 brauchen actual YAML-defs") | 4 (exact match) | 0 |
| Custom-functions registered in `APIQ_CUSTOM_FUNCTIONS` | 5 | 5 | 0 |
| Custom-functions actually referenced by an active YAML rule | (claim in memory: "functions sind registriert" — implicitly 5) | **1** (only `multi-lang-reserved-keywords` via CL-1 ×2) | **−4** orphans flagged in memory |
| Test files in `__tests__/` | 35 | 35 | 0 |
| Tests passing | 790 | 790 | 0 |
| Tests skipped | 2 | 2 | 0 |
| LOC `deterministic/` top-level (production) | not claimed numerically | 15,621 (incl. `index.ts:135`, `output-mapper:79`, `types:155`, `spectral-runner:943`, `severity-schema:466`, `style-classifier:675`, `per-style-coherence:1063`) | — |
| LOC `walkers/` (production) | not claimed | 4,536 | — |
| LOC `spectral-functions/` (production) | not claimed | 755 | — |
| LOC `iana/` (production) | not claimed | 1,165 | — |
| LOC `domain-knowledge/` (production, declared "removed from default pipeline") | not claimed | 648 | — |
| Total production code | not claimed | 22,725 | — |
| LOC tests (`__tests__/`) | not claimed | 13,977 | — |
| Production-LOC orphan-but-tested (17 modules, excluding wired counts) | not claimed | ~12,830 (sum of LOC for the 17 in §2.2) | — |

# 11. Welle-by-Welle reality check

## Welle 0 — T22 IANA + T23 Severity

| Ticket | Files | Wired into pipeline? |
|---|---|---|
| T22 IANA registry | `deterministic/iana/{cache-directives,field-names,index,link-relations,media-types,methods,range-units,status-codes}.ts` (8 files, 1,165 LOC) | **Partially.** `iana/status-codes.ts`, `iana/methods.ts`, `iana/field-names.ts` are imported by `http-protocol-pairings.ts:51–53` (orphan); `iana/media-types.ts` is imported by `media-type-iana-validator.ts:34` (orphan). **None of these are reachable from `runDeterministicLayer`.** The IANA tables are only exercised by their own tests and by orphan-but-tested validator modules. |
| T23 Severity-schema | `deterministic/severity-schema.ts` (466 LOC) | **Yes.** Re-exported by `types.ts:136,155`, transitively imported by every walker. Also directly imported by walkers `ai-agent-consumability.ts`, `operational-metadata.ts`, `privacy-data-class.ts`, and by orphan modules `webhook-signature.ts`, `oauth2-flow-validator.ts`, `secret-scanner.ts`. |

## Welle A — T8/T9/T10/T11/T12/T13/T14/T15/T26 module-classes

| Ticket | File | Public API exported? | In pipeline? |
|---|---|---|---|
| T8 secret-scanner | `secret-scanner.ts` (1120 LOC) | yes | **NO** (orphan-but-tested) |
| T9 webhook-signature | `webhook-signature.ts` (663 LOC) | yes | **NO** |
| T10 http-protocol-pairings | `http-protocol-pairings.ts` (919 LOC) | yes | **NO** |
| T11 problem-json-validator | `problem-json-validator.ts` (890 LOC) | yes | **NO** |
| T12 oauth2-flow-validator | `oauth2-flow-validator.ts` (634 LOC) | yes | **NO** |
| T13 media-type-iana-validator | `media-type-iana-validator.ts` (620 LOC) | yes | **NO** |
| T14 json-schema-draft-detector | `json-schema-draft-detector.ts` (973 LOC) | yes | **NO** |
| T15 style-classifier + per-style-coherence | `style-classifier.ts` (675 LOC) + `per-style-coherence.ts` (1063 LOC) | yes | **NO** |
| T26 spec-diff | `spec-diff.ts` (1030 LOC) | yes | **NO** |
| (also T7 codegen, T6 cross-reference-consistency, T5 naming-classifier, T4 path-template-parser, T3 ref-graph, T2 ajv-validator, T1 duplicate-schemas — these predate or align with Welle A and have the same status) | (7 more modules, ~5,375 LOC) | yes | **NO** |

**Every Welle A module ships as `.ts` + tests but is unreachable from the runtime entry point `runDeterministicLayer`.** No registration code is provided for these modules — they are not registered as Spectral rules, not registered in `ALL_WALKERS`, and not registered as a third-party-runner via `register{Walker,DomainKnowledge}Runner`. They are tested in isolation, period.

## Welle B — T16a P1-Threat / T17 Evolution / T18a P1-Client / T19 AI-Agent / T20 Operational-Metadata / T21 Privacy

| Ticket | Implementation | Wired in? |
|---|---|---|
| T16a P1-Threat (Lens 1) | `apiq-ruleset-threat-p1.yaml` (22 active rules); `spectral-functions/threat-p1-functions.ts` (4 functions, 378 LOC) | **YAML loaded** by `spectral-runner.ts:401–404`. **Functions registered** at `:124–132`. **But 4 rules using these functions are commented-out** in the YAML — the functions are orphan-at-the-rule-level (see §5). **18 of 22 P1-Threat rules are live**; the 4 custom-function rules are dead. |
| T17 Evolution (Lens 3) | `apiq-ruleset-evolution.yaml` (30 active rules); `walkers/evolution-statistical.ts` | **YAML loaded** at `:405–408`. **Walker registered** in `ALL_WALKERS:51`. Both live. |
| T18a P1-Client (Lens 4) | `apiq-ruleset-client-p1.yaml` (27 active rules); `spectral-functions/multi-lang-reserved-keywords.ts` (377 LOC) | **YAML loaded** at `:397–400`. **Function registered** at `:120–122` and **referenced by 2 active rules** (`apiq-cl1-property-name-reserved-keyword`, `apiq-cl1-operationid-reserved-keyword`). All live. |
| T19 AI-Agent | `walkers/ai-agent-consumability.ts` (1034 LOC) | **Walker registered** in `ALL_WALKERS:50`. Live. |
| T20 Operational-Metadata | `walkers/operational-metadata.ts` (772 LOC) | **Walker registered** in `ALL_WALKERS:52`. Live. |
| T21 Privacy/Data-Class | `walkers/privacy-data-class.ts` (737 LOC) | **Walker registered** in `ALL_WALKERS:53`. Live. |

**Welle B summary: 4 walkers + 3 YAMLs + 1 of 5 custom-functions live.** The remaining 4 custom functions (threat-p1) are registered + tested but their rule definitions are commented out. This matches the memory file's flagged carry-over ("4 commented threat-p1 rules brauchen actual YAML-defs").

# 12. Things this audit did NOT verify

- Whether the active 105 Spectral rules + 16 walkers are *correct* (false-positive rate). Tests assert behaviour on synthetic + sample fixtures; an LLM/human review of Stripe / GitHub / PagerDuty / DnD output is needed.
- Whether re-running `stage-a-validation.ts` with the post-Welle-B codebase would close the "predicted vs measured" gap.
- Whether wiring any of the 17 orphan modules into the pipeline would break the Spectral-only output-mapper invariants.
- Whether the 4 commented-out threat-p1 rules, once written, would produce findings on real specs (the inline tests use synthetic fixtures only).
