/**
 * Spectral runner — Stage-A pre-pass detector.
 *
 * Loads (in this order; later files overwrite earlier rule-codes if duplicated):
 *    1. OAS3-default ruleset (`@stoplight/spectral-rulesets`'s `oas` export)
 *    2. apiq-ruleset.yaml                  (Welle A — base apiq custom rules)
 *    3. apiq-ruleset-client-p1.yaml        (Welle B P1 — Client-Friction CL-x)
 *    4. apiq-ruleset-threat-p1.yaml        (Welle B P1 — Threat-Modeling Y-x/TM-Ax)
 *    5. apiq-ruleset-evolution.yaml        (Welle B — Evolution-Friction EV-x)
 *    6. apiq-ruleset-client-p2.yaml        (Welle C P2 — Client-Friction P2 + F-x)
 *    7. apiq-ruleset-threat-p2.yaml        (Welle C P2 — Threat-Modeling P2 + RFC2-x)
 *    8. apiq-ruleset-client-p3.yaml        (Welle D — Client-Friction P3)
 *    9. apiq-ruleset-threat-p3.yaml        (Welle D — Threat-Modeling P3)
 *   10. apiq-ruleset-evolution-p3.yaml     (Welle D — Evolution-Friction P3)
 *   11. apiq-ruleset-standards-p3.yaml     (Welle D — Standards/RFC2-* P3)
 *   12. apiq-ruleset-other-p3.yaml         (Welle D — Other Lenses / Style P3)
 *   13. apiq-ruleset-niche.yaml            (Welle D2 — P4 + P5 Niche / Vendor Patterns, 12 rules)
 *
 *   Each file is loaded best-effort: missing files emit a warn + skip
 *   (the runner falls back to OAS3-default-only when no apiq YAML loads).
 *
 * Maps Spectral diagnostics → DetectorFinding shape so downstream output-mapper
 * can validate them against FindingSchema and feed them through the same Apply /
 * Patch / Score machinery as LLM findings.
 *
 * Public API:
 *   `runSpectralLayers(spec, opts) => Promise<DetectorFinding[]>`
 *   `measureSpectralCoverage(spec, reference, specName) => Promise<SpectralCoverageMeasurement>`
 *
 * CLI:
 *   `npx tsx deterministic/spectral-runner.ts <spec-name>`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';

import * as SpectralCore from '@stoplight/spectral-core';
import type { ISpectralDiagnostic, RulesetDefinition } from '@stoplight/spectral-core';
import { validateApiqMetaYamlBlock } from './severity-schema.js';
import * as SpectralParsers from '@stoplight/spectral-parsers';
import * as SpectralRulesets from '@stoplight/spectral-rulesets';
import * as spectralFunctionsImport from '@stoplight/spectral-functions';

// All four Spectral packages ship CommonJS bundles. Node's ESM-interop only
// fully picks up symbols re-exported with `tslib.__exportStar` from the
// `default` property, NOT from the namespace itself. We therefore route through
// `.default` (which mirrors `module.exports`) and fall back to the namespace
// for cases where Node's interop did pick the named export up.
type SpectralCtor = new (opts?: SpectralCore.IConstructorOpts) => SpectralCore.Spectral;
type DocumentCtor = typeof SpectralCore.Document;
type WithDefault<T> = { default?: T } & Partial<T>;

const coreNs = SpectralCore as unknown as WithDefault<{
  Document: DocumentCtor;
  Spectral: SpectralCtor;
}>;
const parsersNs = SpectralParsers as unknown as WithDefault<{ Json: unknown }>;
const rulesetsNs = SpectralRulesets as unknown as WithDefault<{ oas: unknown }>;
const fnsNs = spectralFunctionsImport as unknown as WithDefault<Record<string, unknown>>;

const Document: DocumentCtor = coreNs.Document ?? coreNs.default!.Document!;
const SpectralClass: SpectralCtor = coreNs.Spectral ?? coreNs.default!.Spectral!;
const JsonParser = (parsersNs.Json ?? parsersNs.default!.Json) as ConstructorParameters<DocumentCtor>[1];
const oas3Ruleset = rulesetsNs.oas ?? rulesetsNs.default!.oas;
const spectralFunctions = (fnsNs.default ?? fnsNs) as Record<string, unknown>;

import type { DetectorFinding, DetectorOptions } from './types.js';
import type { ReferenceTarget } from '../../eval/types.js';
import { JaccardScorer } from '../../eval/scorers/jaccard.js';
import { mapDetectorFindings } from './output-mapper.js';
import { cycleStripSpec } from '../../stringify-spec.js';
import {
  multiLangReservedKeywords,
  FUNCTION_METADATA as ClientP1Metadata,
} from '../spectral-functions/client-p1-functions.js';
import {
  listEndpointHasPagination,
  sensitiveFlowNeedsRateLimitHeaders,
  corsCredentialsWildcardConflict,
  responseHasWwwAuthenticateHeader,
  FUNCTION_METADATA as ThreatP1Metadata,
} from '../spectral-functions/threat-p1-functions.js';
import {
  schemaNestingDepth,
  regexMultiEngineUnsupported,
  allOfHeavyNonRefObjects,
  linguisticAmorphousUri,
  linguisticTinyResource,
  FUNCTION_METADATA as ClientP2Metadata,
} from '../spectral-functions/client-p2-functions.js';
import {
  objectIdWriteOpNeedsSecurity,
  oauth2AuthCodePkceRecommended,
  loginEndpointRateLimit,
  schemaReuseWithoutReadOnlyWriteOnly,
  recursiveSchemaNeedsMaxDepth,
  adminDescriptionWithoutSecurity,
  upstreamUrlNeedsErrorResponses,
  multiVersionServersNeedDeprecation,
  deprecatedNeedsSunsetReplacement,
  infoVersionServerUrlDrift,
  problemDetailsStatusMatchesHttpStatus,
  conditionalRequestCorrectness,
  partialContentNeedsContentRange,
  bearer401WwwAuthenticateRealm,
  patchContentTypeCorrect,
  FUNCTION_METADATA as ThreatP2Metadata,
} from '../spectral-functions/threat-p2-functions.js';
// Welle D P3 — Threat-Modeling P3 (Lens 1) custom functions:
import {
  sensitiveHeaderNameRejected,
  postCreatesNeedIdempotencyKey,
  threeOrMoreIdParamsBola,
  bodyContainsUserIdOnNonAdmin,
  multipleAndSecuritySameType,
  longRunningOpAsyncPattern,
  adminSharesPublicSecurity,
  resourceOnlyGetNoWrite,
  nonStandardMethodNeedsSecurity,
  signupNeedsRateLimitOrCaptcha,
  postingCommentNeedsRateLimit,
  hostParamFlaggedForSsrf,
  corsOriginReflectionWithoutAllowlist,
  browserApiNeedsSecurityHeaders,
  upstreamUrlOpNeeds5xxExplicit,
  webhookRejectsWildcardContentType,
  FUNCTION_METADATA as ThreatP3Metadata,
} from '../spectral-functions/threat-p3-functions.js';
// Welle D P3 — Client-Friction P3 (Lens 4) custom functions:
import {
  camelizeCollideSchemaProperty,
  requiredAsymmetryRequestResponse,
  int64NeedsStringAlternative,
  emptyBody2xx4xxDiscriminator,
  responseRefInconsistency,
  nestedCompositionDepth,
  fieldNameLengthBalance,
  crudShapeConsistency,
  paramsOrderRequiredFirst,
  totalRequiredInputsExceeds,
  vendorExtensionPrefixConsistency,
  tagCasingCrossSpecConsistency,
  readOnlyRequiredConflict,
  FUNCTION_METADATA as ClientP3Metadata,
} from '../spectral-functions/client-p3-functions.js';
// Welle D P3 — Evolution-Friction P3 (Lens 3) custom functions:
import {
  requiredFieldOverdeclaredCheck,
  statusCodeSetCardinality,
  singleMediaTypeResponse,
  requiredPropNeedsDescription,
  refCycleNeedsMaxDepth,
  requiredPropSingleValueEnum,
  fieldEvolutionSuffix,
  tagsInternalExperimental,
  noComponentsSchemas,
  defaultSpecificStatusOverlap,
  multipartJsonSameSchema,
  magicStringEnumCandidate,
  intNeedsStringEncoding,
  versionParamNoEnum,
  redirectWithoutLocation,
  webhookNeedsProse,
  oneofClosedProseSaysOpen,
  int64StringEncodingCandidate,
  FUNCTION_METADATA as EvolutionP3Metadata,
} from '../spectral-functions/evolution-p3-functions.js';
// Welle D P3 — Standards/RFC2-* P3 custom functions:
import {
  problemDetailsExtensionReserved,
  oneXxResponseUpgradeHeader,
  upgradeRequired426,
  oneXxNotInResponsesKeys,
  ifModifiedSinceImplies304,
  ifUnmodifiedSinceImplies412,
  etagCrossResourceConsistency,
  idWriteOpEtagSupport,
  proxyAuthenticate407,
  preferImpliesPreferenceApplied,
  preferRespondAsyncImplies202,
  deprecationPairsSunset,
  rateLimitHeaderFamilyConsistency,
  mergePatchPropertiesNotRequired,
  jsonPatchSchemaIsArray,
  cacheHeaderBundle,
  cacheValidatorsBundle,
  linkHeaderBundle,
  multipartFormBundle,
  FUNCTION_METADATA as StandardsP3Metadata,
} from '../spectral-functions/standards-p3-functions.js';
// Welle D P3 — Other-Lens / Style P3 custom functions:
import {
  restVsRpcMixing,
  httpMethodSemanticsViolated,
  crudAsymmetricResources,
  fieldNameCasingMixed,
  timeFieldNamingMixed,
  filterSyntaxIncoherent,
  sortSyntaxIncoherent,
  statusCodeDistributionPerOpType,
  odataDollarParamAllowedSet,
  aipCustomMethodUsesPost,
  aipTimeFieldImperative,
  phiFieldNameHint,
  listEndpointMissingCacheHeaders,
  descriptionParameterRatio,
  errorSchemaDiscoverability,
  paginationCursorStability,
  operationIdMachineFriendly,
  summaryConcise,
  functionCallFriendlySchema,
  externalDocsStub,
  infoContactSubstantive,
  acceptLanguageOnUserFacingOps,
  consistentExpandFieldsParam,
  polymorphismWireDiscriminator,
  lazyDescription,
  FUNCTION_METADATA as StyleP3Metadata,
} from '../spectral-functions/style-p3-functions.js';
// Welle D2 — P4 + P5 Niche/Vendor custom functions:
import {
  serverUrlHostLowercase,
  serverUrlSchemeLowercase,
  serverUrlPathNormalized,
  retryAfterGrammar,
  defaultExampleStrictJson,
  contentEncodingOnOAS30,
  precondition428Awareness,
  status511Awareness,
  xInternalUsage,
  bloatedDescription,
  aipStandardFieldPresence,
  FUNCTION_METADATA as NicheMetadata,
} from '../spectral-functions/niche-functions.js';
import type { FunctionMetadata } from '../spectral-functions/_metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APIQ_RULESET_PATH = path.join(__dirname, '..', 'rules', 'apiq-ruleset.yaml');
/**
 * Welle B P1 Client-Friction (Lens 4) ruleset — 25 CL-* rules including
 * CL-1 (multi-lang reserved-keywords) which uses a custom Spectral function
 * registered below. Loaded on top of `apiq-ruleset.yaml` so the rules
 * compose with the rest of the apiq custom-rule set.
 */
const APIQ_RULESET_CLIENT_P1_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-client-p1.yaml'
);

/**
 * Welle B P1 Threat-Modeling (Lens 1) ruleset — 22 P1 Y-* / TM-A* rules.
 * 18 are DSL-only; 4 (TM-A22/A32/A39/A53) reference the threat-p1 custom
 * functions registered below. The rule definitions for those 4 are
 * currently commented in the YAML — to activate them, write rule defs
 * referencing list-endpoint-has-pagination /
 * sensitive-flow-needs-rate-limit-headers /
 * cors-credentials-wildcard-conflict /
 * response-has-www-authenticate-header (see threat-p1-rules.test.ts for
 * inline-fixture examples). Follow-up TODO.
 */
const APIQ_RULESET_THREAT_P1_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-threat-p1.yaml'
);

/**
 * Welle B Evolution-Friction (Lens 3) ruleset — 27 EV-* Spectral rules
 * for single-spec breaking-change-prediction (apiq-DIFF). Pure DSL —
 * no custom functions; statistical-aggregation patterns live in the
 * walker layer (walkers/evolution-statistical.ts).
 */
const APIQ_RULESET_EVOLUTION_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-evolution.yaml'
);

/**
 * Welle C P2 Client-Friction (Lens 4 + Lens 5) ruleset — 25 P2 CL-* /
 * F-* rules covering the apiq differentiator-pattern set (codegen-quality,
 * linguistic-anti-patterns, regex-multi-engine, schema-nesting). Uses 5
 * custom Spectral functions registered below: schema-nesting-depth,
 * regex-multi-engine-unsupported, allof-heavy-non-ref-objects,
 * linguistic-amorphous-uri, linguistic-tiny-resource.
 */
const APIQ_RULESET_CLIENT_P2_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-client-p2.yaml'
);

/**
 * Welle C P2 Threat-Modeling (Lens 1) ruleset — 36 P2 Y-* / TM-A* / RFC2-*
 * differentiator rules covering BOLA-via-int-id, OAuth2-PKCE, login-rate-limit,
 * schema-reuse-readOnly/writeOnly, recursive-schema-depth, admin-no-security,
 * RFC-7807 status-correctness, conditional-request bundles, RFC-9745
 * Sunset/Deprecation, RFC-7233 Range/206, www-authenticate realm, and PATCH
 * content-type correctness. Uses 15 custom Spectral functions registered
 * below.
 */
const APIQ_RULESET_THREAT_P2_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-threat-p2.yaml'
);

/**
 * Welle D P3 Threat-Modeling (Lens 1) ruleset — 31 rules covering sensitive
 * header name detection, idempotency-key requirements on POST creates,
 * BOLA-via-multi-id-param, body-user-id-on-non-admin, multi-and-security
 * collision, long-running-op async patterns, admin-share-public-security,
 * non-standard method security, signup/posting rate limits, SSRF host-param
 * detection, CORS origin reflection without allowlist, browser-API security
 * headers, upstream-URL-op 5xx-explicit, webhook content-type rejection.
 * Uses 16 custom Spectral functions registered below.
 */
const APIQ_RULESET_THREAT_P3_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-threat-p3.yaml'
);

/**
 * Welle D P3 Client-Friction (Lens 4) ruleset — 32 rules covering camelize
 * collision detection, required-asymmetry-request-response, int64 string
 * alternative, empty-body-2xx-4xx discriminator, response-ref inconsistency,
 * nested-composition depth, field-name length balance, CRUD-shape
 * consistency, params-order required-first, total-required-inputs exceeds,
 * vendor-extension prefix consistency, tag-casing cross-spec, read-only
 * required-conflict. Uses 13 custom Spectral functions registered below.
 */
const APIQ_RULESET_CLIENT_P3_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-client-p3.yaml'
);

/**
 * Welle D P3 Evolution-Friction (Lens 3) ruleset — 25 rules covering
 * required-field overdeclaration, status-code set cardinality,
 * single-media-type response, required-prop description/single-enum,
 * ref-cycle max-depth, field-evolution suffix, internal/experimental tags,
 * components/schemas absence, default-status overlap, multipart-json same
 * schema, magic-string enum candidate, int-needs-string encoding,
 * version-param no-enum, redirect-without-location, webhook-needs-prose,
 * oneOf-closed-prose-says-open, int64-string encoding candidate. Uses 18
 * custom Spectral functions registered below.
 */
const APIQ_RULESET_EVOLUTION_P3_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-evolution-p3.yaml'
);

/**
 * Welle D P3 Standards/RFC2-* ruleset — 36 rules covering RFC-7807 problem-
 * details extension reserved, RFC-7235 1xx Upgrade-header, 426 Upgrade-Required,
 * RFC-9111 cache-header bundle, RFC-7234 cache-validators bundle, RFC-8288
 * Link-header bundle, RFC-7578 multipart/form bundle, conditional 304/412 on
 * If-Modified-Since/If-Unmodified-Since, ETag cross-resource consistency,
 * Proxy-Authenticate 407, Prefer/Preference-Applied, Prefer respond-async 202,
 * RFC-9745 Deprecation/Sunset pairs, RateLimit header family consistency,
 * RFC-7396 Merge-Patch properties, RFC-6902 JSON-Patch shape. Uses 19 custom
 * Spectral functions registered below.
 */
const APIQ_RULESET_STANDARDS_P3_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-standards-p3.yaml'
);

/**
 * Welle D P3 Other-Lens / Style ruleset — 47 rules covering REST-vs-RPC
 * mixing, HTTP-method semantics violations, CRUD-asymmetric resources,
 * field-name casing mixed, time-field naming mixed, filter/sort syntax
 * incoherent, status-code distribution per op-type, OData $-param allowed
 * set, AIP custom-method uses POST, AIP time-field imperative, PHI
 * field-name hint, list-endpoint missing cache-headers, description-
 * parameter ratio, error-schema discoverability, pagination cursor
 * stability, operation-id machine-friendly, summary concise, function-
 * call-friendly schema, external-docs stub, info-contact substantive,
 * Accept-Language on user-facing ops, consistent expand-fields param,
 * polymorphism wire-discriminator, lazy-description. Uses 25 custom
 * Spectral functions registered below.
 */
const APIQ_RULESET_OTHER_P3_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-other-p3.yaml'
);

/**
 * Welle D2 — P4 + P5 Niche/Vendor ruleset — 12 rules (4 P4 RFC2-71/72/73/95
 * + 8 P5 RFC2-83/89/103/105 + CL-60 + F-18[length+boilerplate split] + SC-20).
 * Uses 11 custom Spectral functions registered below; the F-18 dual-mode
 * detector is referenced by 2 rules (length + boilerplate) sharing one
 * `bloatedDescription` callable.
 */
const APIQ_RULESET_NICHE_PATH = path.join(
  __dirname,
  '..',
  'rules',
  'apiq-ruleset-niche.yaml'
);

/**
 * Custom Spectral functions registered in addition to `@stoplight/spectral-functions`.
 * Function-name (as it appears in YAML `function:` field) → callable.
 *
 * Naming uses kebab-case to match Spectral's stylistic convention.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const APIQ_CUSTOM_FUNCTIONS: Record<string, (...args: any[]) => any> = {
  'multi-lang-reserved-keywords': multiLangReservedKeywords as unknown as (
    ...args: any[]
  ) => any,
  // T16a Threat-P1 custom functions (Lens 1):
  'list-endpoint-has-pagination': listEndpointHasPagination as unknown as (
    ...args: any[]
  ) => any,
  'sensitive-flow-needs-rate-limit-headers':
    sensitiveFlowNeedsRateLimitHeaders as unknown as (...args: any[]) => any,
  'cors-credentials-wildcard-conflict':
    corsCredentialsWildcardConflict as unknown as (...args: any[]) => any,
  'response-has-www-authenticate-header':
    responseHasWwwAuthenticateHeader as unknown as (...args: any[]) => any,
  // T18b Client-P2 custom functions (Lens 4 + Lens 5):
  'schema-nesting-depth': schemaNestingDepth as unknown as (
    ...args: any[]
  ) => any,
  'regex-multi-engine-unsupported': regexMultiEngineUnsupported as unknown as (
    ...args: any[]
  ) => any,
  'allof-heavy-non-ref-objects': allOfHeavyNonRefObjects as unknown as (
    ...args: any[]
  ) => any,
  'linguistic-amorphous-uri': linguisticAmorphousUri as unknown as (
    ...args: any[]
  ) => any,
  'linguistic-tiny-resource': linguisticTinyResource as unknown as (
    ...args: any[]
  ) => any,
  // T16b Threat-P2 custom functions (Lens 1):
  'object-id-write-op-needs-security': objectIdWriteOpNeedsSecurity as unknown as (
    ...args: any[]
  ) => any,
  'oauth2-authcode-pkce-recommended': oauth2AuthCodePkceRecommended as unknown as (
    ...args: any[]
  ) => any,
  'login-endpoint-rate-limit': loginEndpointRateLimit as unknown as (
    ...args: any[]
  ) => any,
  'schema-reuse-without-readonly-writeonly':
    schemaReuseWithoutReadOnlyWriteOnly as unknown as (...args: any[]) => any,
  'recursive-schema-needs-max-depth':
    recursiveSchemaNeedsMaxDepth as unknown as (...args: any[]) => any,
  'admin-description-without-security':
    adminDescriptionWithoutSecurity as unknown as (...args: any[]) => any,
  'upstream-url-needs-error-responses':
    upstreamUrlNeedsErrorResponses as unknown as (...args: any[]) => any,
  'multi-version-servers-need-deprecation':
    multiVersionServersNeedDeprecation as unknown as (...args: any[]) => any,
  'deprecated-needs-sunset-replacement':
    deprecatedNeedsSunsetReplacement as unknown as (...args: any[]) => any,
  'info-version-server-url-drift': infoVersionServerUrlDrift as unknown as (
    ...args: any[]
  ) => any,
  'problem-details-status-matches-http-status':
    problemDetailsStatusMatchesHttpStatus as unknown as (...args: any[]) => any,
  'conditional-request-correctness':
    conditionalRequestCorrectness as unknown as (...args: any[]) => any,
  'partial-content-needs-content-range':
    partialContentNeedsContentRange as unknown as (...args: any[]) => any,
  'bearer-401-www-authenticate-realm':
    bearer401WwwAuthenticateRealm as unknown as (...args: any[]) => any,
  'patch-content-type-correct': patchContentTypeCorrect as unknown as (
    ...args: any[]
  ) => any,
  // Welle D — T16c Threat-P3 custom functions (Lens 1):
  'sensitive-header-name-rejected': sensitiveHeaderNameRejected as unknown as (
    ...args: any[]
  ) => any,
  'post-creates-need-idempotency-key':
    postCreatesNeedIdempotencyKey as unknown as (...args: any[]) => any,
  'three-or-more-id-params-bola': threeOrMoreIdParamsBola as unknown as (
    ...args: any[]
  ) => any,
  'body-contains-user-id-on-non-admin':
    bodyContainsUserIdOnNonAdmin as unknown as (...args: any[]) => any,
  'multiple-and-security-same-type': multipleAndSecuritySameType as unknown as (
    ...args: any[]
  ) => any,
  'long-running-op-async-pattern': longRunningOpAsyncPattern as unknown as (
    ...args: any[]
  ) => any,
  'admin-shares-public-security': adminSharesPublicSecurity as unknown as (
    ...args: any[]
  ) => any,
  'resource-only-get-no-write': resourceOnlyGetNoWrite as unknown as (
    ...args: any[]
  ) => any,
  'non-standard-method-needs-security':
    nonStandardMethodNeedsSecurity as unknown as (...args: any[]) => any,
  'signup-needs-rate-limit-or-captcha':
    signupNeedsRateLimitOrCaptcha as unknown as (...args: any[]) => any,
  'posting-comment-needs-rate-limit':
    postingCommentNeedsRateLimit as unknown as (...args: any[]) => any,
  'host-param-flagged-for-ssrf': hostParamFlaggedForSsrf as unknown as (
    ...args: any[]
  ) => any,
  'cors-origin-reflection-without-allowlist':
    corsOriginReflectionWithoutAllowlist as unknown as (...args: any[]) => any,
  'browser-api-needs-security-headers':
    browserApiNeedsSecurityHeaders as unknown as (...args: any[]) => any,
  'upstream-url-op-needs-5xx-explicit':
    upstreamUrlOpNeeds5xxExplicit as unknown as (...args: any[]) => any,
  'webhook-rejects-wildcard-content-type':
    webhookRejectsWildcardContentType as unknown as (...args: any[]) => any,
  // Welle D — T18c Client-P3 custom functions (Lens 4):
  'camelize-collide-schema-property':
    camelizeCollideSchemaProperty as unknown as (...args: any[]) => any,
  'required-asymmetry-request-response':
    requiredAsymmetryRequestResponse as unknown as (...args: any[]) => any,
  'int64-needs-string-alternative': int64NeedsStringAlternative as unknown as (
    ...args: any[]
  ) => any,
  'empty-body-2xx-4xx-discriminator':
    emptyBody2xx4xxDiscriminator as unknown as (...args: any[]) => any,
  'response-ref-inconsistency': responseRefInconsistency as unknown as (
    ...args: any[]
  ) => any,
  'nested-composition-depth': nestedCompositionDepth as unknown as (
    ...args: any[]
  ) => any,
  'field-name-length-balance': fieldNameLengthBalance as unknown as (
    ...args: any[]
  ) => any,
  'crud-shape-consistency': crudShapeConsistency as unknown as (
    ...args: any[]
  ) => any,
  'params-order-required-first': paramsOrderRequiredFirst as unknown as (
    ...args: any[]
  ) => any,
  'total-required-inputs-exceeds': totalRequiredInputsExceeds as unknown as (
    ...args: any[]
  ) => any,
  'vendor-extension-prefix-consistency':
    vendorExtensionPrefixConsistency as unknown as (...args: any[]) => any,
  'tag-casing-cross-spec-consistency':
    tagCasingCrossSpecConsistency as unknown as (...args: any[]) => any,
  'read-only-required-conflict': readOnlyRequiredConflict as unknown as (
    ...args: any[]
  ) => any,
  // Welle D — T-EV Evolution-P3 custom functions (Lens 3):
  'required-field-overdeclared-check':
    requiredFieldOverdeclaredCheck as unknown as (...args: any[]) => any,
  'status-code-set-cardinality': statusCodeSetCardinality as unknown as (
    ...args: any[]
  ) => any,
  'single-media-type-response': singleMediaTypeResponse as unknown as (
    ...args: any[]
  ) => any,
  'required-prop-needs-description':
    requiredPropNeedsDescription as unknown as (...args: any[]) => any,
  'ref-cycle-needs-max-depth': refCycleNeedsMaxDepth as unknown as (
    ...args: any[]
  ) => any,
  'required-prop-single-value-enum':
    requiredPropSingleValueEnum as unknown as (...args: any[]) => any,
  'field-evolution-suffix': fieldEvolutionSuffix as unknown as (
    ...args: any[]
  ) => any,
  'tags-internal-experimental': tagsInternalExperimental as unknown as (
    ...args: any[]
  ) => any,
  'no-components-schemas': noComponentsSchemas as unknown as (
    ...args: any[]
  ) => any,
  'default-specific-status-overlap':
    defaultSpecificStatusOverlap as unknown as (...args: any[]) => any,
  'multipart-json-same-schema': multipartJsonSameSchema as unknown as (
    ...args: any[]
  ) => any,
  'magic-string-enum-candidate': magicStringEnumCandidate as unknown as (
    ...args: any[]
  ) => any,
  'int-needs-string-encoding': intNeedsStringEncoding as unknown as (
    ...args: any[]
  ) => any,
  'version-param-no-enum': versionParamNoEnum as unknown as (
    ...args: any[]
  ) => any,
  'redirect-without-location': redirectWithoutLocation as unknown as (
    ...args: any[]
  ) => any,
  'webhook-needs-prose': webhookNeedsProse as unknown as (
    ...args: any[]
  ) => any,
  'oneof-closed-prose-says-open': oneofClosedProseSaysOpen as unknown as (
    ...args: any[]
  ) => any,
  'int64-string-encoding-candidate':
    int64StringEncodingCandidate as unknown as (...args: any[]) => any,
  // Welle D — T-RFC2 Standards-P3 custom functions:
  'problem-details-extension-reserved':
    problemDetailsExtensionReserved as unknown as (...args: any[]) => any,
  'one-xx-response-upgrade-header':
    oneXxResponseUpgradeHeader as unknown as (...args: any[]) => any,
  'upgrade-required-426': upgradeRequired426 as unknown as (
    ...args: any[]
  ) => any,
  'one-xx-not-in-responses-keys': oneXxNotInResponsesKeys as unknown as (
    ...args: any[]
  ) => any,
  'if-modified-since-implies-304':
    ifModifiedSinceImplies304 as unknown as (...args: any[]) => any,
  'if-unmodified-since-implies-412':
    ifUnmodifiedSinceImplies412 as unknown as (...args: any[]) => any,
  'etag-cross-resource-consistency':
    etagCrossResourceConsistency as unknown as (...args: any[]) => any,
  'id-write-op-etag-support': idWriteOpEtagSupport as unknown as (
    ...args: any[]
  ) => any,
  'proxy-authenticate-407': proxyAuthenticate407 as unknown as (
    ...args: any[]
  ) => any,
  'prefer-implies-preference-applied':
    preferImpliesPreferenceApplied as unknown as (...args: any[]) => any,
  'prefer-respond-async-implies-202':
    preferRespondAsyncImplies202 as unknown as (...args: any[]) => any,
  'deprecation-pairs-sunset': deprecationPairsSunset as unknown as (
    ...args: any[]
  ) => any,
  'rate-limit-header-family-consistency':
    rateLimitHeaderFamilyConsistency as unknown as (...args: any[]) => any,
  'merge-patch-properties-not-required':
    mergePatchPropertiesNotRequired as unknown as (...args: any[]) => any,
  'json-patch-schema-is-array': jsonPatchSchemaIsArray as unknown as (
    ...args: any[]
  ) => any,
  'cache-header-bundle': cacheHeaderBundle as unknown as (
    ...args: any[]
  ) => any,
  'cache-validators-bundle': cacheValidatorsBundle as unknown as (
    ...args: any[]
  ) => any,
  'link-header-bundle': linkHeaderBundle as unknown as (...args: any[]) => any,
  'multipart-form-bundle': multipartFormBundle as unknown as (
    ...args: any[]
  ) => any,
  // Welle D — T-Other-Lens Style-P3 custom functions:
  'rest-vs-rpc-mixing': restVsRpcMixing as unknown as (...args: any[]) => any,
  'http-method-semantics-violated': httpMethodSemanticsViolated as unknown as (
    ...args: any[]
  ) => any,
  'crud-asymmetric-resources': crudAsymmetricResources as unknown as (
    ...args: any[]
  ) => any,
  'field-name-casing-mixed': fieldNameCasingMixed as unknown as (
    ...args: any[]
  ) => any,
  'time-field-naming-mixed': timeFieldNamingMixed as unknown as (
    ...args: any[]
  ) => any,
  'filter-syntax-incoherent': filterSyntaxIncoherent as unknown as (
    ...args: any[]
  ) => any,
  'sort-syntax-incoherent': sortSyntaxIncoherent as unknown as (
    ...args: any[]
  ) => any,
  'status-code-distribution-per-op-type':
    statusCodeDistributionPerOpType as unknown as (...args: any[]) => any,
  'odata-dollar-param-allowed-set':
    odataDollarParamAllowedSet as unknown as (...args: any[]) => any,
  'aip-custom-method-uses-post': aipCustomMethodUsesPost as unknown as (
    ...args: any[]
  ) => any,
  'aip-time-field-imperative': aipTimeFieldImperative as unknown as (
    ...args: any[]
  ) => any,
  'phi-field-name-hint': phiFieldNameHint as unknown as (...args: any[]) => any,
  'list-endpoint-missing-cache-headers':
    listEndpointMissingCacheHeaders as unknown as (...args: any[]) => any,
  'description-parameter-ratio': descriptionParameterRatio as unknown as (
    ...args: any[]
  ) => any,
  'error-schema-discoverability': errorSchemaDiscoverability as unknown as (
    ...args: any[]
  ) => any,
  'pagination-cursor-stability': paginationCursorStability as unknown as (
    ...args: any[]
  ) => any,
  'operation-id-machine-friendly': operationIdMachineFriendly as unknown as (
    ...args: any[]
  ) => any,
  'summary-concise': summaryConcise as unknown as (...args: any[]) => any,
  'function-call-friendly-schema': functionCallFriendlySchema as unknown as (
    ...args: any[]
  ) => any,
  'external-docs-stub': externalDocsStub as unknown as (...args: any[]) => any,
  'info-contact-substantive': infoContactSubstantive as unknown as (
    ...args: any[]
  ) => any,
  'accept-language-on-user-facing-ops':
    acceptLanguageOnUserFacingOps as unknown as (...args: any[]) => any,
  'consistent-expand-fields-param': consistentExpandFieldsParam as unknown as (
    ...args: any[]
  ) => any,
  'polymorphism-wire-discriminator':
    polymorphismWireDiscriminator as unknown as (...args: any[]) => any,
  'lazy-description': lazyDescription as unknown as (...args: any[]) => any,
  // Welle D2 — P4 + P5 Niche/Vendor custom functions:
  'server-url-host-lowercase': serverUrlHostLowercase as unknown as (
    ...args: any[]
  ) => any,
  'server-url-scheme-lowercase': serverUrlSchemeLowercase as unknown as (
    ...args: any[]
  ) => any,
  'server-url-path-normalized': serverUrlPathNormalized as unknown as (
    ...args: any[]
  ) => any,
  'retry-after-grammar': retryAfterGrammar as unknown as (
    ...args: any[]
  ) => any,
  'default-example-strict-json': defaultExampleStrictJson as unknown as (
    ...args: any[]
  ) => any,
  'content-encoding-on-oas30': contentEncodingOnOAS30 as unknown as (
    ...args: any[]
  ) => any,
  'precondition-428-awareness': precondition428Awareness as unknown as (
    ...args: any[]
  ) => any,
  'status-511-awareness': status511Awareness as unknown as (
    ...args: any[]
  ) => any,
  'x-internal-usage': xInternalUsage as unknown as (...args: any[]) => any,
  'bloated-description': bloatedDescription as unknown as (
    ...args: any[]
  ) => any,
  'aip-standard-field-presence': aipStandardFieldPresence as unknown as (
    ...args: any[]
  ) => any,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Welle Arch+ A3 — aggregated structured metadata for all custom Spectral
 * functions. Mirrors `APIQ_CUSTOM_FUNCTIONS` 1:1 by kebab-case key. Used for
 * introspection (perfClass, primary lens), patternId-cross-validation against
 * `patterns.json`, and downstream LLM-prompt assembly.
 */
export const APIQ_CUSTOM_FUNCTION_METADATA: Record<string, FunctionMetadata> = {
  ...ClientP1Metadata,
  ...ThreatP1Metadata,
  ...ClientP2Metadata,
  ...ThreatP2Metadata,
  ...ThreatP3Metadata,
  ...ClientP3Metadata,
  ...EvolutionP3Metadata,
  ...StandardsP3Metadata,
  ...StyleP3Metadata,
  ...NicheMetadata,
};

// =============================================================================
// OAS3-default rule code set — extracted at module-init from the imported
// ruleset object so it tracks the installed @stoplight/spectral-rulesets version.
// Used for the layer-tag decision (oas3-default vs apiq-custom).
// =============================================================================

const OAS3_DEFAULT_RULE_CODES: ReadonlySet<string> = new Set(
  Object.keys((oas3Ruleset as { rules: Record<string, unknown> }).rules ?? {})
);

// =============================================================================
// Custom-ruleset loader — best-effort YAML → RulesetDefinition conversion.
//
// Spectral 6+ programmatic API expects a JS RulesetDefinition (or a
// pre-bundled ESM module). YAML rulesets are loaded by spectral-cli using
// `@stoplight/spectral-ruleset-bundler`, which we don't depend on here. We
// instead do a best-effort hand-conversion: parse the YAML, swap function
// references (strings) → imports from `@stoplight/spectral-functions`, and
// hand the result to `spectral.setRuleset()`.
//
// Rulesets that use unsupported features (custom-function imports, `extends`
// chains beyond OAS3, formats outside oas3) are rejected with a warning and
// the loader falls back to OAS3-default-only.
// =============================================================================

interface YamlRule {
  description?: string;
  message?: string;
  severity?: string | number;
  recommended?: boolean;
  given?: string | string[];
  then?: YamlThen | YamlThen[];
  formats?: string[];
  resolved?: boolean;
  // Welle F — apiq-meta block (read-only passthrough; stripped before handing
  // the rule definition to Spectral, since Spectral's ruleset-validator rejects
  // unknown top-level keys on rule objects).
  'apiq-meta'?: ApiqMetaYamlBlock;
}

/**
 * apiq-meta YAML-block shape (Welle F).
 *
 * Allows YAML-rules to declare richer metadata (lens-membership, source-of-truth
 * citations, regulatory-mapping, agent-readiness-impact, etc.) inline next to
 * the rule definition — read at YAML-load time and propagated to
 * `DetectorFinding.meta.apiqMeta` so downstream consumers (output-mapper,
 * scoring, telemetry) can route findings on these axes.
 *
 * The shape MUST stay consistent with `RuleMetadata` in `severity-schema.ts`
 * (Phase 1A schema); fields here are kebab-case YAML-style while the Zod-schema
 * over there uses camelCase. This is an IO-boundary type — Phase 2 (F4) will
 * add `apiq-meta` blocks to all 110 YAML-rules.
 */
export interface ApiqMetaYamlBlock {
  'pattern-id'?: string;
  lenses?: string[];
  direction?: 'tighten' | 'loosen' | 'drift';
  sources?: Array<{
    type: 'rfc' | 'bcp' | 'iso' | 'iana-registry' | 'vendor' | 'mining';
    name?: string;
    url?: string;
    /** Verbatim copy-paste from authoritative source (≤200 chars). T25 verifiable. */
    quote?: string;
    /** Mining-paraphrase / subagent-summary. NOT T25-verified. */
    summary?: string;
    /** ISO date YYYY-MM-DD of last T25 verification (only meaningful when `quote` is set). */
    verifiedAt?: string;
    /** @deprecated Use `quote` (T25-verifiable) or `summary` (paraphrase). Welle-D-migration. */
    verbatim?: string;
    [key: string]: unknown;
  }>;
  stakeholders?: string[];
  'lifecycle-phase'?: string;
  'defect-class'?: string;
  iso25010?: string[];
  'codegen-targets'?: string[];
  'detection-precision'?: 'high' | 'medium' | 'low';
  'auto-fix-safe'?: boolean;
  'regulatory-mapping'?: {
    nist?: string[];
    asvs?: string[];
    cis?: string[];
    gdpr?: string[];
    soc2?: string[];
  };
  'cost-impact'?: 'low' | 'medium' | 'high';
  'mttr-impact'?: 'low' | 'medium' | 'high';
  'agent-readiness-impact'?: 'high' | 'medium' | 'low' | 'none';
}

interface YamlThen {
  field?: string;
  function: string;
  functionOptions?: unknown;
}

interface YamlRuleset {
  extends?: string | string[];
  rules: Record<string, YamlRule>;
}

const SUPPORTED_FUNCTIONS = new Set([
  'alphabetical',
  'casing',
  'defined',
  'enumeration',
  'falsy',
  'length',
  'pattern',
  'schema',
  'truthy',
  'undefined',
  'unreferencedReusableObject',
  'xor',
  'or',
  // apiq custom functions registered in APIQ_CUSTOM_FUNCTIONS:
  'multi-lang-reserved-keywords',
  'list-endpoint-has-pagination',
  'sensitive-flow-needs-rate-limit-headers',
  'cors-credentials-wildcard-conflict',
  'response-has-www-authenticate-header',
  // T18b Client-P2 custom functions:
  'schema-nesting-depth',
  'regex-multi-engine-unsupported',
  'allof-heavy-non-ref-objects',
  'linguistic-amorphous-uri',
  'linguistic-tiny-resource',
  // T16b Threat-P2 custom functions:
  'object-id-write-op-needs-security',
  'oauth2-authcode-pkce-recommended',
  'login-endpoint-rate-limit',
  'schema-reuse-without-readonly-writeonly',
  'recursive-schema-needs-max-depth',
  'admin-description-without-security',
  'upstream-url-needs-error-responses',
  'multi-version-servers-need-deprecation',
  'deprecated-needs-sunset-replacement',
  'info-version-server-url-drift',
  'problem-details-status-matches-http-status',
  'conditional-request-correctness',
  'partial-content-needs-content-range',
  'bearer-401-www-authenticate-realm',
  'patch-content-type-correct',
  // Welle D — T16c Threat-P3 custom functions:
  'sensitive-header-name-rejected',
  'post-creates-need-idempotency-key',
  'three-or-more-id-params-bola',
  'body-contains-user-id-on-non-admin',
  'multiple-and-security-same-type',
  'long-running-op-async-pattern',
  'admin-shares-public-security',
  'resource-only-get-no-write',
  'non-standard-method-needs-security',
  'signup-needs-rate-limit-or-captcha',
  'posting-comment-needs-rate-limit',
  'host-param-flagged-for-ssrf',
  'cors-origin-reflection-without-allowlist',
  'browser-api-needs-security-headers',
  'upstream-url-op-needs-5xx-explicit',
  'webhook-rejects-wildcard-content-type',
  // Welle D — T18c Client-P3 custom functions:
  'camelize-collide-schema-property',
  'required-asymmetry-request-response',
  'int64-needs-string-alternative',
  'empty-body-2xx-4xx-discriminator',
  'response-ref-inconsistency',
  'nested-composition-depth',
  'field-name-length-balance',
  'crud-shape-consistency',
  'params-order-required-first',
  'total-required-inputs-exceeds',
  'vendor-extension-prefix-consistency',
  'tag-casing-cross-spec-consistency',
  'read-only-required-conflict',
  // Welle D — T-EV Evolution-P3 custom functions:
  'required-field-overdeclared-check',
  'status-code-set-cardinality',
  'single-media-type-response',
  'required-prop-needs-description',
  'ref-cycle-needs-max-depth',
  'required-prop-single-value-enum',
  'field-evolution-suffix',
  'tags-internal-experimental',
  'no-components-schemas',
  'default-specific-status-overlap',
  'multipart-json-same-schema',
  'magic-string-enum-candidate',
  'int-needs-string-encoding',
  'version-param-no-enum',
  'redirect-without-location',
  'webhook-needs-prose',
  'oneof-closed-prose-says-open',
  'int64-string-encoding-candidate',
  // Welle D — T-RFC2 Standards-P3 custom functions:
  'problem-details-extension-reserved',
  'one-xx-response-upgrade-header',
  'upgrade-required-426',
  'one-xx-not-in-responses-keys',
  'if-modified-since-implies-304',
  'if-unmodified-since-implies-412',
  'etag-cross-resource-consistency',
  'id-write-op-etag-support',
  'proxy-authenticate-407',
  'prefer-implies-preference-applied',
  'prefer-respond-async-implies-202',
  'deprecation-pairs-sunset',
  'rate-limit-header-family-consistency',
  'merge-patch-properties-not-required',
  'json-patch-schema-is-array',
  'cache-header-bundle',
  'cache-validators-bundle',
  'link-header-bundle',
  'multipart-form-bundle',
  // Welle D — T-Other-Lens Style-P3 custom functions:
  'rest-vs-rpc-mixing',
  'http-method-semantics-violated',
  'crud-asymmetric-resources',
  'field-name-casing-mixed',
  'time-field-naming-mixed',
  'filter-syntax-incoherent',
  'sort-syntax-incoherent',
  'status-code-distribution-per-op-type',
  'odata-dollar-param-allowed-set',
  'aip-custom-method-uses-post',
  'aip-time-field-imperative',
  'phi-field-name-hint',
  'list-endpoint-missing-cache-headers',
  'description-parameter-ratio',
  'error-schema-discoverability',
  'pagination-cursor-stability',
  'operation-id-machine-friendly',
  'summary-concise',
  'function-call-friendly-schema',
  'external-docs-stub',
  'info-contact-substantive',
  'accept-language-on-user-facing-ops',
  'consistent-expand-fields-param',
  'polymorphism-wire-discriminator',
  'lazy-description',
  // Welle D2 — P4 + P5 Niche/Vendor custom functions:
  'server-url-host-lowercase',
  'server-url-scheme-lowercase',
  'server-url-path-normalized',
  'retry-after-grammar',
  'default-example-strict-json',
  'content-encoding-on-oas30',
  'precondition-428-awareness',
  'status-511-awareness',
  'x-internal-usage',
  'bloated-description',
  'aip-standard-field-presence',
]);

/**
 * Look up a function name in either the spectral-functions package OR the
 * apiq custom-functions registry. Returns the function or undefined.
 */
function resolveFunction(name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(APIQ_CUSTOM_FUNCTIONS, name)) {
    return APIQ_CUSTOM_FUNCTIONS[name];
  }
  return (spectralFunctions as Record<string, unknown>)[name];
}

/**
 * Rule-codes known to crash Spectral's Nimma JSONPath compiler at run-time on
 * one or more of our reference specs (because the rule's `given` filter
 * expression assumes shapes that real-world specs don't always satisfy).
 *
 * These are stripped at ruleset-load time so a single crashing rule doesn't
 * abort the whole spectral.run() — Spectral does NOT recover from rule-level
 * runtime errors and re-throws synchronously from `run()`. Stripping is the
 * cheapest defensive option until the upstream rules can be fixed (Task A1.2
 * follow-up; coverage map already documents these as candidates for the
 * Walker layer where the heuristic is more naturally expressed).
 */
const RULE_CRASH_BLOCKLIST: ReadonlySet<string> = new Set([
  // `@.description.match(...)` assumes description is a string, but Stripe and
  // GitHub specs include parameters with object-typed description in
  // multi-language docs. Result: TypeError on .match. Defer to Walker.
  'apiq-comma-separated-should-be-array',
]);

// We collect custom-rule descriptions here at load-time so the diagnostic
// mapper can pull them into the rationale (Spectral diagnostics carry only the
// message, not the description).
const customRuleDescriptions = new Map<string, string>();

// Welle F — collect apiq-meta blocks from YAML-rules at load-time so the
// diagnostic-mapper can propagate them into DetectorFinding.meta.apiqMeta.
// Keyed by rule-code; populated in `buildRulesAccFromYaml`. Empty until any
// YAML-rule declares an `apiq-meta` block (Phase 2 / F4 migration adds these).
const customRuleApiqMeta = new Map<string, ApiqMetaYamlBlock>();

function buildRulesAccFromYaml(
  yamlText: string,
  fileLabel: string,
): Record<string, unknown> | null {
  let parsed: YamlRuleset;
  try {
    parsed = YAML.parse(yamlText) as YamlRuleset;
  } catch (err) {
    console.warn(
      `[spectral-runner] failed to parse ${fileLabel}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.rules) {
    console.warn(`[spectral-runner] ${fileLabel} has no \`rules\` block; skipping`);
    return null;
  }

  // Eslint: we work with `any` here because the converted rules need to satisfy
  // Spectral's RuleDefinition shape, which uses heavy generics for function
  // schemas. Keeping the boundary narrow.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rulesAcc: Record<string, any> = {};

  for (const [code, rule] of Object.entries(parsed.rules)) {
    if (RULE_CRASH_BLOCKLIST.has(code)) {
      console.warn(
        `[spectral-runner] skipping rule "${code}" — known to crash on real-world specs (see RULE_CRASH_BLOCKLIST).`
      );
      continue;
    }
    if (!rule || typeof rule !== 'object' || !rule.given || !rule.then) {
      console.warn(`[spectral-runner] ruleset rule "${code}" missing given/then; skipping`);
      continue;
    }
    const thenArray = Array.isArray(rule.then) ? rule.then : [rule.then];
    const convertedThen: any[] = [];
    let badFn = false;
    for (const t of thenArray) {
      if (!t.function || !SUPPORTED_FUNCTIONS.has(t.function)) {
        console.warn(
          `[spectral-runner] ruleset rule "${code}" uses unsupported function "${t.function}"; skipping rule`
        );
        badFn = true;
        break;
      }
      const fn = resolveFunction(t.function);
      if (typeof fn !== 'function') {
        console.warn(`[spectral-runner] ruleset rule "${code}" function "${t.function}" not callable; skipping rule`);
        badFn = true;
        break;
      }
      const built: Record<string, unknown> = { function: fn };
      if (t.field !== undefined) built.field = t.field;
      if (t.functionOptions !== undefined) built.functionOptions = t.functionOptions;
      convertedThen.push(built);
    }
    if (badFn) continue;

    const built: Record<string, unknown> = {
      given: rule.given,
      then: convertedThen.length === 1 ? convertedThen[0] : convertedThen,
    };
    if (rule.description !== undefined) built.description = rule.description;
    if (rule.message !== undefined) built.message = rule.message;
    if (rule.severity !== undefined) built.severity = rule.severity;
    if (rule.recommended !== undefined) built.recommended = rule.recommended;
    if (rule.resolved !== undefined) built.resolved = rule.resolved;
    // Skip `formats` — converting string → Format obj would require deeper
    // wiring; OAS3 format is inherited from the parent ruleset's `extends`.

    rulesAcc[code] = built;
    if (rule.description) customRuleDescriptions.set(code, rule.description);
    // Welle F — capture apiq-meta block if present. Note: we deliberately do
    // NOT include `apiq-meta` in the `built` object handed to Spectral, since
    // Spectral's ruleset-validator rejects unknown rule-level keys.
    //
    // Welle Arch+ A2b — validate the block against RuleMetadataSchema (after
    // kebab→camel transform). Invalid blocks WARN but still pass through, so
    // downstream consumers see what the YAML author intended even if it
    // doesn't conform to the canonical schema (graceful degradation).
    if (rule['apiq-meta']) {
      const v = validateApiqMetaYamlBlock(rule['apiq-meta']);
      if ('errors' in v) {
        console.warn(
          `[spectral-runner] apiq-meta block on rule "${code}" invalid: ${v.errors.join(', ')}`,
        );
      }
      customRuleApiqMeta.set(code, rule['apiq-meta']);
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (Object.keys(rulesAcc).length === 0) {
    console.warn(
      `[spectral-runner] ${fileLabel} had 0 convertible rules; skipping`
    );
    return null;
  }
  return rulesAcc;
}

/**
 * Backwards-compat wrapper retained for tests that import the legacy
 * `buildRulesetFromYaml`. Combines a single YAML file into a full
 * RulesetDefinition extending the OAS3 default.
 */
function buildRulesetFromYaml(yamlText: string): RulesetDefinition | null {
  const rulesAcc = buildRulesAccFromYaml(yamlText, 'apiq-ruleset.yaml');
  if (!rulesAcc) return null;
  return {
    extends: [oas3Ruleset as unknown as RulesetDefinition],
    rules: rulesAcc,
  } as unknown as RulesetDefinition;
}

// =============================================================================
// Spectral-instance bootstrap. Lazily-built so multiple specs reuse the same
// ruleset compilation.
// =============================================================================

let cachedSpectral: SpectralCore.Spectral | null = null;

/**
 * Reset the cached Spectral instance — used by tests that mutate the
 * filesystem-loaded ruleset and need a fresh build.
 *
 * Welle F — also clears the description- and apiq-meta-maps so test-isolation
 * holds across test files (the maps would otherwise accumulate entries from
 * every prior buildSpectral call in the same vitest worker).
 */
export function _resetSpectralCacheForTests(): void {
  cachedSpectral = null;
  customRuleDescriptions.clear();
  customRuleApiqMeta.clear();
}

/**
 * Public read accessor for tests + downstream-consumers. Returns the parsed
 * `apiq-meta` block for a rule-code, or `undefined` if the rule didn't declare
 * one (e.g. pre-Phase-2 / OAS3-default rules / external rulesets).
 *
 * NOTE: returns the YAML-shape (kebab-case keys), NOT the camelCase
 * `RuleMetadata` shape from severity-schema.ts. Consumers wanting the
 * canonical schema should validate with `RuleMetadataSchema` first.
 */
export function getApiqMetaForRule(
  ruleCode: string
): ApiqMetaYamlBlock | undefined {
  return customRuleApiqMeta.get(ruleCode);
}

/**
 * Read-only inspection of the apiq client-friction P1 ruleset — exposed
 * for tests that check the YAML round-trips and contains all expected
 * pattern-IDs.
 */
export function getClientP1RuleCodes(): string[] {
  const acc = loadYamlRules(
    APIQ_RULESET_CLIENT_P1_PATH,
    'apiq-ruleset-client-p1.yaml'
  );
  return acc ? Object.keys(acc) : [];
}

/**
 * Read-only inspection of the apiq client-friction P2 ruleset (Welle C) —
 * exposed for tests that check the YAML round-trips and contains all
 * expected pattern-IDs.
 */
export function getClientP2RuleCodes(): string[] {
  const acc = loadYamlRules(
    APIQ_RULESET_CLIENT_P2_PATH,
    'apiq-ruleset-client-p2.yaml'
  );
  return acc ? Object.keys(acc) : [];
}

/**
 * Read-only inspection of the apiq threat-modeling P2 ruleset (Welle C) —
 * exposed for tests that check the YAML round-trips and contains all
 * expected pattern-IDs.
 */
export function getThreatP2RuleCodes(): string[] {
  const acc = loadYamlRules(
    APIQ_RULESET_THREAT_P2_PATH,
    'apiq-ruleset-threat-p2.yaml'
  );
  return acc ? Object.keys(acc) : [];
}

function loadYamlRules(
  filePath: string,
  fileLabel: string,
): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    console.warn(
      `[spectral-runner] ${fileLabel} not found at ${filePath}; skipping`
    );
    return null;
  }
  try {
    const yamlText = fs.readFileSync(filePath, 'utf8');
    return buildRulesAccFromYaml(yamlText, fileLabel);
  } catch (err) {
    console.warn(
      `[spectral-runner] failed to read ${fileLabel}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

function buildSpectral(): SpectralCore.Spectral {
  if (cachedSpectral) return cachedSpectral;
  const spectral = new SpectralClass();

  // Merge rules from each apiq YAML ruleset (in order — later files overwrite
  // earlier rule-codes if duplicated).
  const baseRules = loadYamlRules(APIQ_RULESET_PATH, 'apiq-ruleset.yaml');
  const clientP1Rules = loadYamlRules(
    APIQ_RULESET_CLIENT_P1_PATH,
    'apiq-ruleset-client-p1.yaml'
  );
  const threatP1Rules = loadYamlRules(
    APIQ_RULESET_THREAT_P1_PATH,
    'apiq-ruleset-threat-p1.yaml'
  );
  const evolutionRules = loadYamlRules(
    APIQ_RULESET_EVOLUTION_PATH,
    'apiq-ruleset-evolution.yaml'
  );
  const clientP2Rules = loadYamlRules(
    APIQ_RULESET_CLIENT_P2_PATH,
    'apiq-ruleset-client-p2.yaml'
  );
  const threatP2Rules = loadYamlRules(
    APIQ_RULESET_THREAT_P2_PATH,
    'apiq-ruleset-threat-p2.yaml'
  );
  // Welle D P3 yamls — load order: client-p3 → threat-p3 → evolution-p3 →
  // standards-p3 → other-p3 (later files overwrite earlier rule-codes).
  const clientP3Rules = loadYamlRules(
    APIQ_RULESET_CLIENT_P3_PATH,
    'apiq-ruleset-client-p3.yaml'
  );
  const threatP3Rules = loadYamlRules(
    APIQ_RULESET_THREAT_P3_PATH,
    'apiq-ruleset-threat-p3.yaml'
  );
  const evolutionP3Rules = loadYamlRules(
    APIQ_RULESET_EVOLUTION_P3_PATH,
    'apiq-ruleset-evolution-p3.yaml'
  );
  const standardsP3Rules = loadYamlRules(
    APIQ_RULESET_STANDARDS_P3_PATH,
    'apiq-ruleset-standards-p3.yaml'
  );
  const otherP3Rules = loadYamlRules(
    APIQ_RULESET_OTHER_P3_PATH,
    'apiq-ruleset-other-p3.yaml'
  );
  // Welle D2 — P4 + P5 Niche/Vendor ruleset (12 rules).
  const nicheRules = loadYamlRules(
    APIQ_RULESET_NICHE_PATH,
    'apiq-ruleset-niche.yaml'
  );

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const merged: Record<string, any> = {};
  if (baseRules) Object.assign(merged, baseRules);
  if (clientP1Rules) Object.assign(merged, clientP1Rules);
  if (threatP1Rules) Object.assign(merged, threatP1Rules);
  if (evolutionRules) Object.assign(merged, evolutionRules);
  if (clientP2Rules) Object.assign(merged, clientP2Rules);
  if (threatP2Rules) Object.assign(merged, threatP2Rules);
  if (clientP3Rules) Object.assign(merged, clientP3Rules);
  if (threatP3Rules) Object.assign(merged, threatP3Rules);
  if (evolutionP3Rules) Object.assign(merged, evolutionP3Rules);
  if (standardsP3Rules) Object.assign(merged, standardsP3Rules);
  if (otherP3Rules) Object.assign(merged, otherP3Rules);
  if (nicheRules) Object.assign(merged, nicheRules);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (Object.keys(merged).length > 0) {
    const customRuleset = {
      extends: [oas3Ruleset as unknown as RulesetDefinition],
      rules: merged,
    } as unknown as RulesetDefinition;
    spectral.setRuleset(customRuleset);
  } else {
    console.warn(
      '[spectral-runner] no apiq custom rules loaded; using OAS3-default only'
    );
    spectral.setRuleset(oas3Ruleset as unknown as RulesetDefinition);
  }

  // Welle F — log apiq-meta coverage across the merged custom-ruleset. Target
  // is ≥95% post-F4 migration (Phase 2). Pre-F4 the coverage is 0% by design.
  let rulesWithApiqMeta = 0;
  let rulesWithoutApiqMeta = 0;
  for (const code of Object.keys(merged)) {
    if (customRuleApiqMeta.has(code)) {
      rulesWithApiqMeta++;
    } else {
      rulesWithoutApiqMeta++;
    }
  }
  const totalCustomRules = rulesWithApiqMeta + rulesWithoutApiqMeta;
  const apiqMetaCoverage =
    totalCustomRules > 0 ? rulesWithApiqMeta / totalCustomRules : 0;
  // eslint-disable-next-line no-console
  console.log(
    `[spectral-runner] apiq-meta coverage: ${rulesWithApiqMeta}/${totalCustomRules} ` +
      `(${(apiqMetaCoverage * 100).toFixed(1)}%)`
  );
  if (totalCustomRules > 0 && apiqMetaCoverage < 0.95) {
    console.warn(
      `[spectral-runner] apiq-meta coverage below 95% target — Welle F migration incomplete?`
    );
  }

  cachedSpectral = spectral;
  return spectral;
}

// =============================================================================
// Diagnostic → DetectorFinding mapping.
// =============================================================================

type SpectralPath = ReadonlyArray<string | number>;

const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
]);

function jsonPointerFromPath(p: SpectralPath): string {
  if (!p || p.length === 0) return '';
  return (
    '/' +
    p.map((seg) => String(seg).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')
  );
}

function endpointsFromPath(p: SpectralPath): Array<{ path: string; method: string }> {
  if (!p || p.length === 0) return [];
  const parts = p.map(String);
  const pathsIdx = parts.indexOf('paths');
  if (pathsIdx < 0 || pathsIdx + 1 >= parts.length) return [];
  const route = parts[pathsIdx + 1];
  if (!route || !route.startsWith('/')) return [];
  // method may or may not be present — only emit endpoint-level when it is and
  // is a known HTTP verb.
  const method =
    pathsIdx + 2 < parts.length ? parts[pathsIdx + 2].toLowerCase() : null;
  if (method && HTTP_METHODS.has(method)) {
    return [{ path: route, method }];
  }
  // path-level finding — we still know the path. Emit with method 'all' would
  // fail apply-validation downstream; better to leave method blank and let
  // scope='spec' degrade gracefully. Returning empty array keeps invariants.
  return [];
}

function severityToFindingSeverity(
  spectralSev: number | undefined,
  ruleCode: string
): 'critical' | 'high' | 'medium' | 'low' {
  // Spectral DiagnosticSeverity: 0=Error, 1=Warn, 2=Info, 3=Hint.
  // Treat oas3-schema parse failures as critical (they indicate the spec
  // doesn't conform to the OpenAPI 3 schema at all).
  if (
    (ruleCode === 'oas3-schema' || ruleCode === 'oas2-schema') &&
    (spectralSev ?? 1) === 0
  ) {
    return 'critical';
  }
  switch (spectralSev) {
    case 0:
      return 'high';
    case 1:
      return 'medium';
    case 2:
      return 'low';
    case 3:
      return 'low';
    default:
      return 'medium';
  }
}

function categoryFor(ruleCode: string): 'clarity' | 'design' | 'risk' | 'correctness' {
  const c = ruleCode.toLowerCase();
  if (c.includes('schema') || c.includes('invalid') || c.includes('missing-required') || c.includes('valid-')) {
    return 'correctness';
  }
  if (c.includes('security') || c.includes('auth') || c.includes('eval') || c.includes('script-tags')) {
    return 'risk';
  }
  if (
    c.includes('description') ||
    c.includes('example') ||
    c.includes('markdown') ||
    c.includes('tag')
  ) {
    return 'clarity';
  }
  return 'design';
}

const RATIONALE_BY_CATEGORY: Record<string, string> = {
  correctness:
    'OAS3 schema-conformance issues block reliable spec parsing and downstream codegen — most tooling silently drops or mis-renders affected operations.',
  risk:
    'Security-relevant gaps (missing auth definitions, unsanitised markdown, missing scopes) carry direct exploit and compliance consequences when consumers trust the spec.',
  clarity:
    'Missing descriptions, tags, or examples force human and AI consumers to guess intent, which produces brittle integrations and degraded SDK / docs output.',
  design:
    'Design-convention violations break URL composition, naming consistency, and the implicit contract that codegen / portal tooling relies on.',
};

function patchSummaryFor(ruleCode: string, message: string): string {
  // Hand-curated short imperatives for the most common OAS3-default rules; for
  // others, reuse the Spectral message (clamped). This mirrors the way the
  // LLM-pipeline emits patchSummary as a "do this" sentence.
  const pre: Record<string, string> = {
    'operation-tag-defined': 'Add the operation tag to the top-level `tags` array.',
    'operation-tags': 'Add a `tags` array to the operation.',
    'operation-description': 'Add a `description` to the operation.',
    'operation-operationId': 'Add an `operationId` to the operation.',
    'operation-operationId-unique': 'Make every `operationId` unique across the spec.',
    'operation-operationId-valid-in-url': 'Use only URL-safe characters in `operationId`.',
    'operation-singular-tag': 'Reduce operation tags to a single tag.',
    'operation-success-response': 'Add a 2xx response to the operation.',
    'oas3-server-trailing-slash': 'Remove the trailing slash from `servers[].url`.',
    'oas3-server-not-example.com': 'Replace example.com server URL with a real server.',
    'oas3-api-servers': 'Add a top-level `servers` array.',
    'oas3-parameter-description': 'Add a `description` to the parameter.',
    'oas3-examples-value-or-externalValue': 'Provide either `value` or `externalValue`, not both.',
    'oas3-unused-component': 'Remove the unused component or reference it from an operation.',
    'oas3-valid-schema-example': 'Make the schema example match its declared schema.',
    'oas3-valid-media-example': 'Make the media-type example match its declared schema.',
    'oas3-server-variables': 'Define every server-template variable in `variables`.',
    'oas3-operation-security-defined': 'Reference only security schemes declared under `components.securitySchemes`.',
    'info-contact': 'Add an `info.contact` block.',
    'info-description': 'Add an `info.description`.',
    'info-license': 'Add an `info.license` block.',
    'license-url': 'Add a `url` to the license object.',
    'contact-properties': 'Fill in `contact.name`, `contact.url`, `contact.email`.',
    'tag-description': 'Add a `description` to the tag.',
    'openapi-tags': 'Add a top-level `tags` array.',
    'openapi-tags-uniqueness': 'Deduplicate top-level tag names.',
    'openapi-tags-alphabetical': 'Alphabetise the top-level `tags` array.',
    'duplicated-entry-in-enum': 'Deduplicate enum values.',
    'no-eval-in-markdown': 'Remove `eval(` from markdown content.',
    'no-script-tags-in-markdown': 'Remove `<script>` tags from markdown content.',
    'no-$ref-siblings': 'Remove sibling fields next to `$ref`.',
    'array-items': 'Add `items` to the array schema.',
    'typed-enum': 'Make every enum value match the declared type.',
    'oas3-schema': 'Fix the OpenAPI 3 schema-conformance violation.',
    'path-params': 'Match path-template parameters to operation parameters.',
    'path-declarations-must-exist': 'Use only declared path-template parameters.',
    'path-keys-no-trailing-slash': 'Remove the trailing slash from the path key.',
    'path-not-include-query': 'Move query parameters out of the path key.',
  };
  const summary = pre[ruleCode] ?? message;
  const cleaned = summary.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return `Address Spectral rule \`${ruleCode}\``;
  return cleaned.slice(0, 200);
}

function buildNarration(
  message: string,
  ruleCode: string,
  pointer: string,
  isCustom: boolean
): string {
  const bits: string[] = [];
  bits.push(`Spectral rule \`${ruleCode}\` flagged: ${message.trim()}`);
  if (pointer) bits.push(`Source location: ${pointer}.`);
  const description = isCustom ? customRuleDescriptions.get(ruleCode) : null;
  if (description) bits.push(description);
  // Pad with category-based context if still under min-length (output-mapper
  // pads to 50 with spaces if necessary, but we'd rather emit substantive prose).
  let out = bits.join(' ');
  if (out.length < 80) {
    out =
      out +
      ` This finding is emitted by the deterministic Stage-A pre-pass and addresses a class of issues that mechanical detectors handle reliably without LLM reasoning.`;
  }
  return out;
}

function buildRationale(
  ruleCode: string,
  category: 'clarity' | 'design' | 'risk' | 'correctness',
  isCustom: boolean
): string {
  if (isCustom) {
    const desc = customRuleDescriptions.get(ruleCode);
    if (desc && desc.length >= 20) return desc;
  }
  return RATIONALE_BY_CATEGORY[category];
}

export function mapDiagnosticToDetectorFinding(d: ISpectralDiagnostic): DetectorFinding {
  const ruleCode = String(d.code);
  const isOas3Default = OAS3_DEFAULT_RULE_CODES.has(ruleCode);
  const layer = isOas3Default ? 'spectral-oas3-default' : 'spectral-apiq-custom';
  const pointer = jsonPointerFromPath(d.path);
  const affectedEndpoints = endpointsFromPath(d.path);
  // Scope: 'endpoint' if path includes /paths/<route>/<method>, else 'spec'.
  const scope: 'endpoint' | 'spec' = affectedEndpoints.length > 0 ? 'endpoint' : 'spec';
  const category = categoryFor(ruleCode);
  const severity = severityToFindingSeverity(d.severity, ruleCode);

  const messageRaw = (d.message ?? '').trim();
  const titleBase = messageRaw.length > 0 ? messageRaw : `Spectral rule ${ruleCode} flagged`;
  const title = titleBase.slice(0, 200);

  const narration = buildNarration(messageRaw, ruleCode, pointer, !isOas3Default);
  const rationale = buildRationale(ruleCode, category, !isOas3Default);
  const patchSummary = patchSummaryFor(ruleCode, messageRaw);

  // Welle F — propagate the rule's apiq-meta block (if present) into the
  // finding's free-form `meta` field. DetectorFinding.meta accepts arbitrary
  // keys, so this is a passthrough — downstream consumers (output-mapper,
  // scoring, telemetry) can route on `meta.apiqMeta.lenses` /
  // `meta.apiqMeta['agent-readiness-impact']` / etc.
  const apiqMeta = customRuleApiqMeta.get(ruleCode);

  return {
    detectorId: `spectral:${ruleCode}`,
    layer,
    title,
    narration,
    rationale,
    category,
    severity,
    scope,
    affectedEndpoints,
    patchOps: [],
    patchSummary,
    sourcePath: pointer || undefined,
    meta: {
      ruleCode,
      severity: d.severity,
      range: d.range,
      ...(apiqMeta ? { apiqMeta } : {}),
    },
  };
}

// =============================================================================
// Null-stripping helper.
//
// The OAS3 default ruleset's `no-$ref-siblings` rule uses a Nimma-compiled
// JSONPath filter that calls `.$ref` on every visited node without a
// null-check. Real-world specs often contain explicit `null` values (dnd5eapi:
// `long: null`, pagerduty: many enum-default nulls), and Spectral crashes on
// them. We replace nulls with `undefined` (which JSON.stringify drops entirely)
// before handing the document to Spectral. This is purely a Spectral
// compatibility shim — the deterministic-layer's downstream walkers should
// receive the original spec, not this sanitised version.
// =============================================================================

/**
 * Single-pass cycle-strip + null-strip. Welle Arch+ (OQ-3): saves one full
 * deep-clone of the spec tree on hot specs (stripe-full ≈ 8 MB). Combines the
 * concerns of `cycleStripSpec` (replace JS object cycles with `{$ref:'#cyclic'}`)
 * and `stripNulls` (drop `null` keys/array-entries) into one traversal so the
 * whole tree is rebuilt exactly once before being handed to Spectral.
 *
 * Behavioural equivalence (verified by tests):
 *   - Cycles produce a fresh `{$ref:'#cyclic'}` object (same as cycleStripSpec).
 *   - Object-keys with `null` value are dropped (same as stripNulls).
 *   - Array-entries that are `null`/`undefined` are dropped.
 *   - Object-keys whose recursive-strip returns `undefined` are dropped.
 */
function cycleStripAndNullStrip(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object') return value;
  const obj = value as object;
  if (seen.has(obj)) return makeCycleMarkerInline();
  seen.add(obj);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const v of value) {
      if (v === null || v === undefined) continue;
      const stripped = cycleStripAndNullStrip(v, seen);
      if (stripped !== undefined) out.push(stripped);
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null) continue;
    const stripped = cycleStripAndNullStrip(v, seen);
    if (stripped === undefined) continue;
    out[k] = stripped;
  }
  return out;
}

function makeCycleMarkerInline(): Record<string, unknown> {
  return { $ref: '#cyclic' };
}

function stripNulls(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    // JSON.stringify converts undefined-array-entries back to null, which
    // re-introduces the very crash we're guarding against. Filter the array
    // to drop nulls / undefined entries instead.
    const out: unknown[] = [];
    for (const v of value) {
      if (v === null || v === undefined) continue;
      const stripped = stripNulls(v);
      if (stripped !== undefined) out.push(stripped);
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null) continue;
    const stripped = stripNulls(v);
    if (stripped === undefined) continue;
    out[k] = stripped;
  }
  return out;
}

// =============================================================================
// Public API
// =============================================================================

export async function runSpectralLayers(
  spec: object,
  opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const spectral = buildSpectral();
  // Document constructor takes a string + parser. Stringify the object so the
  // parser produces correct path-locations. If the caller hands us a
  // dereferenced spec it may contain cycles (recursive schemas) that
  // JSON.stringify can't serialise — run cycleStripSpec defensively so we
  // accept either shape.
  // We also strip explicit `null` values from the tree because the OAS3
  // ruleset's `no-$ref-siblings` rule uses a JSONPath filter that does not
  // null-check before touching `.$ref`, crashing on real-world specs that
  // contain explicit `null` (dnd5eapi has two; PagerDuty has many).
  //
  // Welle Arch+ (OQ-3): the previous two-pass implementation
  // (`cycleStripSpec` + `stripNulls`) cloned the entire spec tree twice. On
  // stripe-full (~8 MB) that's wasted allocation; we now do both in a single
  // traversal via `cycleStripAndNullStrip`.
  const sanitized = cycleStripAndNullStrip(spec, new WeakSet()) as object;
  const json = JSON.stringify(sanitized);
  const document = new Document(
    json,
    JsonParser,
    opts?.specName ? `inmemory:${opts.specName}` : 'inmemory:spec.json'
  );
  const diagnostics = await spectral.run(document);
  const findings: DetectorFinding[] = diagnostics.map((d) =>
    mapDiagnosticToDetectorFinding(d)
  );
  return findings;
}

// =============================================================================
// Coverage measurement utility
// =============================================================================

export interface SpectralCoverageMeasurement {
  spec: string;
  refsTotal: number;
  refsCovered: number;
  refsCoveredByRefId: Record<string, boolean>;
  /** Per-Spectral-rule → ref-IDs the rule helped cover. */
  matchedByRule: Record<string, string[]>;
}

export async function measureSpectralCoverage(
  spec: object,
  reference: ReferenceTarget,
  specName: string
): Promise<SpectralCoverageMeasurement> {
  const detectorFindings = await runSpectralLayers(spec, { specName });
  const llmFindings = mapDetectorFindings(detectorFindings);

  const jaccard = JaccardScorer.score({
    reference,
    llmFindings,
    runMeta: { spec: specName, architecture: 'spectral-only' },
  });

  const refsCoveredByRefId: Record<string, boolean> = {};
  for (const r of jaccard.perRef) {
    refsCoveredByRefId[r.refId] = r.matched;
  }

  // Build matchedByRule: for each matched ref, look up which DetectorFinding
  // produced the matching LLM-finding (by index), then attribute to that
  // detector's rule-code.
  const matchedByRule: Record<string, string[]> = {};
  for (const r of jaccard.perRef) {
    if (!r.matched || r.matchedLlmIndex === null) continue;
    // detectorFindings index aligns 1:1 with llmFindings index when output-mapper
    // doesn't drop any entries. If output-mapper drops some, the index alignment
    // breaks — we re-derive by matching positions after dropping.
    // Quick guard: if lengths differ, we attribute to '__unknown__'.
    if (detectorFindings.length !== llmFindings.length) {
      const bucket = (matchedByRule['__unknown__'] ??= []);
      bucket.push(r.refId);
      continue;
    }
    const detector = detectorFindings[r.matchedLlmIndex];
    const ruleCode = String(detector.meta?.ruleCode ?? detector.detectorId);
    const bucket = (matchedByRule[ruleCode] ??= []);
    bucket.push(r.refId);
  }

  return {
    spec: specName,
    refsTotal: reference.findings.length,
    refsCovered: jaccard.perRef.filter((r) => r.matched).length,
    refsCoveredByRefId,
    matchedByRule,
  };
}

// =============================================================================
// CLI
// =============================================================================

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

async function loadAndDereference(specName: string): Promise<object> {
  const baseDir = path.join(EXAMPLES_DIR, specName);
  const candidates = ['spec.json', 'spec.yaml', 'spec.yml'];
  let specPath: string | null = null;
  for (const c of candidates) {
    const p = path.join(baseDir, c);
    if (fs.existsSync(p)) {
      specPath = p;
      break;
    }
  }
  if (!specPath) {
    throw new Error(
      `No spec file found for "${specName}". Looked in ${candidates
        .map((c) => path.join(baseDir, c))
        .join(', ')}`
    );
  }
  const raw = fs.readFileSync(specPath, 'utf8');
  const ext = path.extname(specPath).toLowerCase();
  const parsed = ext === '.json' ? JSON.parse(raw) : YAML.parse(raw);
  // NOTE: Spectral expects to do its own $ref resolution. Passing a
  // fully-dereferenced spec produces real JS cycles for recursive schemas, and
  // the OAS3 ruleset's JSONPath traversal also crashes on certain dereferenced
  // shapes. We therefore feed Spectral the raw (with-$refs) spec — the same
  // shape `spectral lint` would consume from disk — and rely on Spectral's
  // built-in resolver. The deterministic-layer's downstream walkers + domain
  // detectors (which may need a fully-dereffed spec) get one separately at
  // their own boundary.
  return parsed as object;
}

async function loadReferenceFor(specName: string): Promise<ReferenceTarget | null> {
  const refPath = path.join(EXAMPLES_DIR, specName, 'reference', 'findings.json');
  if (!fs.existsSync(refPath)) return null;
  // Lazy-import to avoid circular at top-level (eval/reference.ts pulls types
  // from this same family of modules).
  const mod = await import('../../eval/reference.js');
  return mod.loadReferenceTarget(refPath, specName);
}

function topNRules(findings: DetectorFinding[], n: number): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const f of findings) {
    const code = String(f.meta?.ruleCode ?? f.detectorId);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    // eslint-disable-next-line no-console
    console.log('Usage: npx tsx deterministic/spectral-runner.ts <spec-name>');
    process.exit(0);
  }
  const specName = args[0];

  // eslint-disable-next-line no-console
  console.log(`[spectral-runner] loading + dereferencing ${specName} ...`);
  const spec = await loadAndDereference(specName);

  // eslint-disable-next-line no-console
  console.log(`[spectral-runner] running Spectral on ${specName} ...`);
  const findings = await runSpectralLayers(spec, { specName });

  const oas3Count = findings.filter((f) => f.layer === 'spectral-oas3-default').length;
  const customCount = findings.filter((f) => f.layer === 'spectral-apiq-custom').length;

  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log(`Spec:                  ${specName}`);
  // eslint-disable-next-line no-console
  console.log(`Total findings:        ${findings.length}`);
  // eslint-disable-next-line no-console
  console.log(`  oas3-default:        ${oas3Count}`);
  // eslint-disable-next-line no-console
  console.log(`  apiq-custom:         ${customCount}`);
  // eslint-disable-next-line no-console
  console.log('');

  const top = topNRules(findings, 5);
  // eslint-disable-next-line no-console
  console.log(`Top 5 rule codes:`);
  for (const [code, count] of top) {
    // eslint-disable-next-line no-console
    console.log(`  ${count.toString().padStart(5)}  ${code}`);
  }

  // Optional coverage measurement
  const reference = await loadReferenceFor(specName);
  if (reference) {
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log(`[spectral-runner] measuring coverage against reference (${reference.findings.length} refs) ...`);
    const cov = await measureSpectralCoverage(spec, reference, specName);
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log(`Coverage:              ${cov.refsCovered} / ${cov.refsTotal}`);
    // eslint-disable-next-line no-console
    console.log(`Covered ref-IDs:       ${
      Object.entries(cov.refsCoveredByRefId)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ') || '(none)'
    }`);
    // Pure-spectral subset (only those classified isPureSpectralDetectable=true).
    const pureRefs = reference.findings.filter((f) => f.classification.isPureSpectralDetectable);
    const purelyCovered = pureRefs.filter((f) => cov.refsCoveredByRefId[f.id]).length;
    // eslint-disable-next-line no-console
    console.log(`Pure-spectral subset:  ${purelyCovered} / ${pureRefs.length} caught`);
    if (pureRefs.length > 0) {
      const missed = pureRefs
        .filter((f) => !cov.refsCoveredByRefId[f.id])
        .map((f) => f.id);
      // eslint-disable-next-line no-console
      console.log(`  Missed pure-spectral: ${missed.join(', ') || '(none)'}`);
    }
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log(`Matched-by-rule (rule → ref-IDs):`);
    for (const [rule, refs] of Object.entries(cov.matchedByRule)) {
      // eslint-disable-next-line no-console
      console.log(`  ${rule}  →  ${refs.join(', ')}`);
    }
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
