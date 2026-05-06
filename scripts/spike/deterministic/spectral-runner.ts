/**
 * Spectral runner — Stage-A pre-pass detector.
 *
 * Loads:
 *   1. OAS3-default ruleset (`@stoplight/spectral-rulesets`'s `oas` export)
 *   2. apiq-custom ruleset YAML (`./apiq-ruleset.yaml`) if present — falls back
 *      gracefully to OAS3-default-only when the file doesn't yet exist (Task A1.2
 *      runs in parallel with this).
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
import type { ReferenceTarget } from '../eval/types.js';
import { JaccardScorer } from '../eval/scorers/jaccard.js';
import { mapDetectorFindings } from './output-mapper.js';
import { cycleStripSpec } from '../stringify-spec.js';
import multiLangReservedKeywordsFn from './spectral-functions/multi-lang-reserved-keywords.js';
import {
  listEndpointHasPagination,
  sensitiveFlowNeedsRateLimitHeaders,
  corsCredentialsWildcardConflict,
  responseHasWwwAuthenticateHeader,
} from './spectral-functions/threat-p1-functions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APIQ_RULESET_PATH = path.join(__dirname, 'apiq-ruleset.yaml');
/**
 * Welle B P1 Client-Friction (Lens 4) ruleset — 25 CL-* rules including
 * CL-1 (multi-lang reserved-keywords) which uses a custom Spectral function
 * registered below. Loaded on top of `apiq-ruleset.yaml` so the rules
 * compose with the rest of the apiq custom-rule set.
 */
const APIQ_RULESET_CLIENT_P1_PATH = path.join(
  __dirname,
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
  'apiq-ruleset-evolution.yaml'
);

/**
 * Custom Spectral functions registered in addition to `@stoplight/spectral-functions`.
 * Function-name (as it appears in YAML `function:` field) → callable.
 *
 * Naming uses kebab-case to match Spectral's stylistic convention.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const APIQ_CUSTOM_FUNCTIONS: Record<string, (...args: any[]) => any> = {
  'multi-lang-reserved-keywords': multiLangReservedKeywordsFn as unknown as (
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
};
/* eslint-enable @typescript-eslint/no-explicit-any */

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
 */
export function _resetSpectralCacheForTests(): void {
  cachedSpectral = null;
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

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const merged: Record<string, any> = {};
  if (baseRules) Object.assign(merged, baseRules);
  if (clientP1Rules) Object.assign(merged, clientP1Rules);
  if (threatP1Rules) Object.assign(merged, threatP1Rules);
  if (evolutionRules) Object.assign(merged, evolutionRules);
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
  const decycled = cycleStripSpec(spec) as object;
  const sanitized = stripNulls(decycled) as object;
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

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
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
  const mod = await import('../eval/reference.js');
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
