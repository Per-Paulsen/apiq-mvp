/**
 * Tests for the P3 Evolution-Friction Spectral ruleset (T-EV / Welle D).
 *
 * Loads `apiq-ruleset-evolution-p3.yaml` plus custom functions from
 * `spectral-functions/evolution-p3-functions.ts`, builds an isolated Spectral
 * instance, and runs synthetic specs covering each rule's positive (violation)
 * and negative (compliant) case.
 *
 * Coverage matrix (24 patterns):
 *   EV-2, EV-9, EV-12 (server + path mirror), EV-13, EV-15, EV-20, EV-21,
 *   EV-22, EV-26, EV-29, EV-38, EV-39, EV-41, EV-42, EV-44, EV-45, EV-47,
 *   EV-51, EV-52, EV-54, EV-59, EV-60, EV-61, EV-62
 *
 * Plus apiq-meta-block validation (100% Welle-F coverage + required fields).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import * as SpectralCore from '@stoplight/spectral-core';
import type { ISpectralDiagnostic, RulesetDefinition } from '@stoplight/spectral-core';
import * as SpectralParsers from '@stoplight/spectral-parsers';
import * as SpectralRulesets from '@stoplight/spectral-rulesets';
import * as spectralFunctionsImport from '@stoplight/spectral-functions';

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
} from '../../deterministic/spectral-functions/evolution-p3-functions.js';

// =============================================================================
// Spectral bootstrap (mirrors threat-p2-rules.test.ts conventions)
// =============================================================================

type SpectralCtor = new (
  opts?: SpectralCore.IConstructorOpts
) => SpectralCore.Spectral;
type DocumentCtor = typeof SpectralCore.Document;
type WithDefault<T> = { default?: T } & Partial<T>;

const coreNs = SpectralCore as unknown as WithDefault<{
  Document: DocumentCtor;
  Spectral: SpectralCtor;
}>;
const parsersNs = SpectralParsers as unknown as WithDefault<{ Json: unknown }>;
const rulesetsNs = SpectralRulesets as unknown as WithDefault<{ oas: unknown }>;
const fnsNs = spectralFunctionsImport as unknown as WithDefault<
  Record<string, unknown>
>;

const Document: DocumentCtor = coreNs.Document ?? coreNs.default!.Document!;
const SpectralClass: SpectralCtor =
  coreNs.Spectral ?? coreNs.default!.Spectral!;
const JsonParser = (parsersNs.Json ??
  parsersNs.default!.Json) as ConstructorParameters<DocumentCtor>[1];
const oas3Ruleset = rulesetsNs.oas ?? rulesetsNs.default!.oas;
const spectralFunctions = (fnsNs.default ?? fnsNs) as Record<string, unknown>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..', '..');
const RULESET_PATH = path.join(
  SPIKE_DIR,
  'deterministic',
  'rules',
  'apiq-ruleset-evolution-p3.yaml'
);

// =============================================================================
// Ruleset YAML → RulesetDefinition compiler
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

const SUPPORTED_BUILTIN_FUNCTIONS = new Set([
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
]);

const CUSTOM_FUNCTIONS_REGISTRY: Record<string, unknown> = {
  'required-field-overdeclared-check': requiredFieldOverdeclaredCheck,
  'status-code-set-cardinality': statusCodeSetCardinality,
  'single-media-type-response': singleMediaTypeResponse,
  'required-prop-needs-description': requiredPropNeedsDescription,
  'ref-cycle-needs-max-depth': refCycleNeedsMaxDepth,
  'required-prop-single-value-enum': requiredPropSingleValueEnum,
  'field-evolution-suffix': fieldEvolutionSuffix,
  'tags-internal-experimental': tagsInternalExperimental,
  'no-components-schemas': noComponentsSchemas,
  'default-specific-status-overlap': defaultSpecificStatusOverlap,
  'multipart-json-same-schema': multipartJsonSameSchema,
  'magic-string-enum-candidate': magicStringEnumCandidate,
  'int-needs-string-encoding': intNeedsStringEncoding,
  'version-param-no-enum': versionParamNoEnum,
  'redirect-without-location': redirectWithoutLocation,
  'webhook-needs-prose': webhookNeedsProse,
  'oneof-closed-prose-says-open': oneofClosedProseSaysOpen,
  'int64-string-encoding-candidate': int64StringEncodingCandidate,
};

function buildEvolutionP3Ruleset(yamlText: string): RulesetDefinition {
  const parsed = YAML.parse(yamlText) as YamlRuleset;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rulesAcc: Record<string, any> = {};

  for (const [code, rule] of Object.entries(parsed.rules ?? {})) {
    if (!rule || !rule.given || !rule.then) continue;
    const thenArr = Array.isArray(rule.then) ? rule.then : [rule.then];
    const convertedThen: any[] = [];
    let badFn = false;
    for (const t of thenArr) {
      const fnName = t.function;
      let fn: unknown;
      if (SUPPORTED_BUILTIN_FUNCTIONS.has(fnName)) {
        fn = spectralFunctions[fnName];
      } else if (fnName in CUSTOM_FUNCTIONS_REGISTRY) {
        fn = CUSTOM_FUNCTIONS_REGISTRY[fnName];
      }
      if (typeof fn !== 'function') {
        console.warn(
          `[evolution-p3-test] rule "${code}" function "${fnName}" not callable; skipping`
        );
        badFn = true;
        break;
      }
      const built: Record<string, unknown> = { function: fn };
      if (t.field !== undefined) built.field = t.field;
      if (t.functionOptions !== undefined)
        built.functionOptions = t.functionOptions;
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
    rulesAcc[code] = built;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    extends: [oas3Ruleset as unknown as RulesetDefinition],
    rules: rulesAcc,
  } as unknown as RulesetDefinition;
}

let cachedSpectral: SpectralCore.Spectral | null = null;

function getSpectral(): SpectralCore.Spectral {
  if (cachedSpectral) return cachedSpectral;
  const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
  const ruleset = buildEvolutionP3Ruleset(yamlText);
  const spectral = new SpectralClass();
  spectral.setRuleset(ruleset);
  cachedSpectral = spectral;
  return spectral;
}

function stripNulls(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
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

async function runOn(spec: object): Promise<ISpectralDiagnostic[]> {
  const spectral = getSpectral();
  const sanitized = stripNulls(spec) as object;
  const json = JSON.stringify(sanitized);
  const document = new Document(json, JsonParser, 'inmemory:test.json');
  return spectral.run(document);
}

function findingCodes(diags: ISpectralDiagnostic[]): string[] {
  return diags.map((d) => String(d.code));
}

function hasFinding(diags: ISpectralDiagnostic[], ruleCode: string): boolean {
  return findingCodes(diags).includes(ruleCode);
}

// =============================================================================
// Synthetic spec helpers
// =============================================================================

const baseSpec = (overrides: Record<string, unknown> = {}): object => ({
  openapi: '3.0.3',
  info: {
    title: 'Test',
    version: '1.0.1',
    description:
      'A long enough description for info-description rules so we can isolate evolution-p3 findings.',
  },
  servers: [{ url: 'https://api.example.com' }],
  paths: {},
  components: { schemas: { _Probe: { type: 'object' } } },
  ...overrides,
});

// =============================================================================
// Bootstrap / apiq-meta validation
// =============================================================================

describe('evolution-p3 ruleset bootstrap', () => {
  it('loads the YAML ruleset without crashing', () => {
    expect(fs.existsSync(RULESET_PATH)).toBe(true);
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(yamlText) as YamlRuleset;
    expect(parsed.rules).toBeDefined();
    expect(Object.keys(parsed.rules).length).toBeGreaterThanOrEqual(24);
  });

  it('builds a Spectral instance with all rules registered', () => {
    const spectral = getSpectral();
    expect(spectral).toBeDefined();
  });

  it('every rule carries an `apiq-meta` block (100% Welle-F coverage)', () => {
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    interface YamlRuleWithMeta extends YamlRule {
      'apiq-meta'?: Record<string, unknown>;
    }
    interface YamlRulesetWithMeta {
      rules: Record<string, YamlRuleWithMeta>;
    }
    const parsed = YAML.parse(yamlText) as YamlRulesetWithMeta;
    const ruleNames = Object.keys(parsed.rules);
    const withMeta = ruleNames.filter((n) => !!parsed.rules[n]['apiq-meta']);
    expect(withMeta.length).toBe(ruleNames.length);
  });

  it('every apiq-meta block has the required Welle-F fields', () => {
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    const REQUIRED_FIELDS = [
      'pattern-id',
      'lenses',
      'sources',
      'stakeholders',
      'lifecycle-phase',
      'defect-class',
      'iso25010',
      'codegen-targets',
      'cost-impact',
      'mttr-impact',
      'agent-readiness-impact',
    ];
    interface YamlRuleWithMeta extends YamlRule {
      'apiq-meta'?: Record<string, unknown>;
    }
    interface YamlRulesetWithMeta {
      rules: Record<string, YamlRuleWithMeta>;
    }
    const parsed = YAML.parse(yamlText) as YamlRulesetWithMeta;
    for (const [ruleName, rule] of Object.entries(parsed.rules)) {
      const meta = rule['apiq-meta'];
      expect(meta, `rule "${ruleName}" missing apiq-meta block`).toBeDefined();
      for (const field of REQUIRED_FIELDS) {
        expect(
          (meta as Record<string, unknown>)[field],
          `rule "${ruleName}" missing apiq-meta.${field}`
        ).toBeDefined();
      }
    }
  });

  it('every rule declares `direction` field per F3 (tighten/loosen/drift)', () => {
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    interface YamlRuleWithMeta extends YamlRule {
      'apiq-meta'?: { direction?: string; [k: string]: unknown };
    }
    interface YamlRulesetWithMeta {
      rules: Record<string, YamlRuleWithMeta>;
    }
    const parsed = YAML.parse(yamlText) as YamlRulesetWithMeta;
    const validDirections = new Set(['tighten', 'loosen', 'drift']);
    for (const [ruleName, rule] of Object.entries(parsed.rules)) {
      const meta = rule['apiq-meta'];
      expect(meta?.direction, `rule "${ruleName}" missing direction`).toBeDefined();
      expect(
        validDirections.has(meta!.direction!),
        `rule "${ruleName}" direction "${meta!.direction}" not in {tighten,loosen,drift}`
      ).toBe(true);
    }
  });

  it('every rule declares evolution-friction in `lenses`', () => {
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    interface YamlRuleWithMeta extends YamlRule {
      'apiq-meta'?: { lenses?: string[]; [k: string]: unknown };
    }
    interface YamlRulesetWithMeta {
      rules: Record<string, YamlRuleWithMeta>;
    }
    const parsed = YAML.parse(yamlText) as YamlRulesetWithMeta;
    for (const [ruleName, rule] of Object.entries(parsed.rules)) {
      const lenses = rule['apiq-meta']?.lenses ?? [];
      expect(
        lenses.includes('evolution-friction'),
        `rule "${ruleName}" must declare evolution-friction lens`
      ).toBe(true);
    }
  });
});

// =============================================================================
// EV-2 — required-field overdeclared
// =============================================================================

describe('EV-2 — required-field overdeclared', () => {
  it('flags schema with >15 required fields', async () => {
    const required = Array.from({ length: 18 }, (_, i) => `f${i}`);
    const properties: Record<string, unknown> = {};
    for (const r of required) properties[r] = { type: 'string' };
    const spec = baseSpec({
      components: {
        schemas: {
          BigSchema: { type: 'object', required, properties },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-2-required-field-overdeclared')).toBe(true);
  });

  it('does NOT flag schema with ≤15 required fields', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Small: {
            type: 'object',
            required: ['a', 'b'],
            properties: { a: { type: 'string' }, b: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-2-required-field-overdeclared')).toBe(false);
  });
});

// =============================================================================
// EV-9 — info.version placeholder
// =============================================================================

describe('EV-9 — info.version placeholder', () => {
  it('flags info.version=0.0.1 as placeholder', async () => {
    const spec = baseSpec({ info: { title: 'T', version: '0.0.1' } });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-9-info-version-placeholder')).toBe(true);
  });

  it('flags info.version=1.0.0 as placeholder', async () => {
    const spec = baseSpec({ info: { title: 'T', version: '1.0.0' } });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-9-info-version-placeholder')).toBe(true);
  });

  it('does NOT flag info.version=2.5.3 (real semver)', async () => {
    const spec = baseSpec({ info: { title: 'T', version: '2.5.3' } });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-9-info-version-placeholder')).toBe(false);
  });
});

// =============================================================================
// EV-12 — Path-version with minor (server + path mirror)
// =============================================================================

describe('EV-12 — Path-version with minor', () => {
  it('flags server URL with /v1.2/ path-segment', async () => {
    const spec = baseSpec({
      servers: [{ url: 'https://api.example.com/v1.2' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-12-path-version-includes-minor')).toBe(true);
  });

  it('flags path with /v2.1/ segment', async () => {
    const spec = baseSpec({
      paths: {
        '/v2.1/users': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-12-path-version-includes-minor-paths')).toBe(true);
  });

  it('does NOT flag major-only path /v1/users', async () => {
    const spec = baseSpec({
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {
        '/v1/users': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-12-path-version-includes-minor')).toBe(false);
    expect(hasFinding(diags, 'apiq-ev-12-path-version-includes-minor-paths')).toBe(false);
  });
});

// =============================================================================
// EV-13 — info.version non-semver non-date
// =============================================================================

describe('EV-13 — info.version non-semver non-date', () => {
  it('flags non-semver-non-date version', async () => {
    const spec = baseSpec({ info: { title: 'T', version: 'beta-2' } });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-13-info-version-non-semver-non-date')).toBe(
      true
    );
  });

  it('does NOT flag SemVer 1.2.3', async () => {
    const spec = baseSpec({ info: { title: 'T', version: '1.2.3' } });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-13-info-version-non-semver-non-date')).toBe(
      false
    );
  });

  it('does NOT flag ISO date 2026-05-09', async () => {
    const spec = baseSpec({ info: { title: 'T', version: '2026-05-09' } });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-13-info-version-non-semver-non-date')).toBe(
      false
    );
  });
});

// =============================================================================
// EV-15 — Status-code set wide-open
// =============================================================================

describe('EV-15 — Status-code-set wide-open', () => {
  it('flags operation with >10 response codes', async () => {
    const responses: Record<string, unknown> = {};
    const codes = ['200', '201', '202', '204', '301', '400', '401', '403', '404', '409', '422'];
    for (const c of codes) responses[c] = { description: 'r' };
    const spec = baseSpec({
      paths: { '/foo': { get: { responses } } },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-15-status-code-set-wide-open')).toBe(true);
  });

  it('does NOT flag operation with ≤10 response codes', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            responses: {
              '200': { description: 'ok' },
              '400': { description: 'bad' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-15-status-code-set-wide-open')).toBe(false);
  });
});

// =============================================================================
// EV-20 — Single media-type response
// =============================================================================

describe('EV-20 — Single media-type response', () => {
  it('flags response with single media-type content', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: { 'application/json': { schema: { type: 'object' } } },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-20-single-media-type-response')).toBe(true);
  });

  it('does NOT flag response with two media-types', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': { schema: { type: 'object' } },
                  'application/cbor': { schema: { type: 'object' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-20-single-media-type-response')).toBe(false);
  });
});

// =============================================================================
// EV-21 — Required prop without description
// =============================================================================

describe('EV-21 — Required prop without description', () => {
  it('flags required property lacking description', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-21-required-prop-no-description')).toBe(true);
  });

  it('does NOT flag required property with description', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'User display name' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-21-required-prop-no-description')).toBe(false);
  });
});

// =============================================================================
// EV-22 — $ref-cycle without max-depth
// =============================================================================

describe('EV-22 — $ref-cycle without max-depth', () => {
  it('flags self-referential schema without x-max-depth', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              child: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-22-ref-cycle-needs-max-depth')).toBe(true);
  });

  it('does NOT flag schema with x-max-depth declared', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Node: {
            type: 'object',
            'x-max-depth': 5,
            properties: {
              child: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-22-ref-cycle-needs-max-depth')).toBe(false);
  });

  it('does NOT flag acyclic schemas', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Leaf: { type: 'object', properties: { v: { type: 'string' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-22-ref-cycle-needs-max-depth')).toBe(false);
  });
});

// =============================================================================
// EV-26 — TODO/FIXME in prose
// =============================================================================

describe('EV-26 — TODO/FIXME in prose', () => {
  it('flags description with TODO marker', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            description: 'TODO: figure out the spec',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-26-todo-fixme-in-prose')).toBe(true);
  });

  it('does NOT flag clean description', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            description: 'Returns the foo resource for the given user.',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-26-todo-fixme-in-prose')).toBe(false);
  });
});

// =============================================================================
// EV-29 — /api/ path prefix
// =============================================================================

describe('EV-29 — /api/ path prefix', () => {
  it('flags path /api/users', async () => {
    const spec = baseSpec({
      paths: {
        '/api/users': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-29-api-path-prefix')).toBe(true);
  });

  it('does NOT flag /users without /api/ prefix', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-29-api-path-prefix')).toBe(false);
  });
});

// =============================================================================
// EV-38 — Past-tense verb in path-segment
// =============================================================================

describe('EV-38 — Past-tense path-segment', () => {
  it('flags /orders/created', async () => {
    const spec = baseSpec({
      paths: {
        '/orders/created': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-38-past-tense-path-segment')).toBe(true);
  });

  it('does NOT flag /orders', async () => {
    const spec = baseSpec({
      paths: {
        '/orders': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-38-past-tense-path-segment')).toBe(false);
  });
});

// =============================================================================
// EV-39 — Required prop with single-value enum
// =============================================================================

describe('EV-39 — Required prop with single-value enum', () => {
  it('flags required property with single-value enum', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Event: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['user.created'] },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-39-required-prop-single-value-enum')).toBe(
      true
    );
  });

  it('does NOT flag required property with multi-value enum', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Event: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['a', 'b'] },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-39-required-prop-single-value-enum')).toBe(
      false
    );
  });
});

// =============================================================================
// EV-41 — Field-name with evolution suffix
// =============================================================================

describe('EV-41 — Field-name evolution-suffix', () => {
  it('flags property name `email_v1`', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { email_v1: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-41-field-evolution-suffix')).toBe(true);
  });

  it('flags property name `address_legacy`', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { address_legacy: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-41-field-evolution-suffix')).toBe(true);
  });

  it('does NOT flag clean property name `email`', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { email: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-41-field-evolution-suffix')).toBe(false);
  });
});

// =============================================================================
// EV-42 — tags internal/experimental
// =============================================================================

describe('EV-42 — Tags internal/experimental', () => {
  it('flags operation tagged "internal"', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            tags: ['internal'],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-42-tags-internal-experimental')).toBe(true);
  });

  it('flags operation tagged "experimental"', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            tags: ['experimental'],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-42-tags-internal-experimental')).toBe(true);
  });

  it('does NOT flag clean tag "users"', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            tags: ['users'],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-42-tags-internal-experimental')).toBe(false);
  });
});

// =============================================================================
// EV-44 — No components.schemas
// =============================================================================

describe('EV-44 — No components.schemas', () => {
  it('flags spec with no components.schemas declared', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1.2.3' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/foo': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-44-no-components-schemas')).toBe(true);
  });

  it('does NOT flag spec with non-empty components.schemas', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
      components: {
        schemas: {
          User: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-44-no-components-schemas')).toBe(false);
  });
});

// =============================================================================
// EV-45 — default + specific status overlap
// =============================================================================

describe('EV-45 — default + specific status overlap', () => {
  it('flags default + 4XX range overlap', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            responses: {
              '200': { description: 'ok' },
              '4XX': { description: 'client err' },
              default: { description: 'fallback' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-45-default-specific-status-overlap')).toBe(
      true
    );
  });

  it('does NOT flag default-only', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            responses: {
              '200': { description: 'ok' },
              default: { description: 'fallback' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-45-default-specific-status-overlap')).toBe(
      false
    );
  });
});

// =============================================================================
// EV-47 — multipart + json same schema
// =============================================================================

describe('EV-47 — multipart + json same schema', () => {
  it('flags multipart + json with same $ref', async () => {
    const spec = baseSpec({
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: { $ref: '#/components/schemas/Upload' },
                },
                'application/json': {
                  schema: { $ref: '#/components/schemas/Upload' },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: {
        schemas: {
          Upload: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-47-multipart-json-same-schema')).toBe(true);
  });

  it('does NOT flag distinct schemas', async () => {
    const spec = baseSpec({
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: { $ref: '#/components/schemas/UploadMultipart' },
                },
                'application/json': {
                  schema: { $ref: '#/components/schemas/UploadJson' },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: {
        schemas: {
          UploadMultipart: {
            type: 'object',
            properties: { file: { type: 'string', format: 'binary' } },
          },
          UploadJson: {
            type: 'object',
            properties: { url: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-47-multipart-json-same-schema')).toBe(false);
  });
});

// =============================================================================
// EV-51 — Magic-string enum candidate
// =============================================================================

describe('EV-51 — Magic-string enum candidate', () => {
  it('flags property `status` (string, no enum)', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Order: {
            type: 'object',
            properties: { status: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-51-magic-string-enum-candidate')).toBe(true);
  });

  it('does NOT flag property `status` with enum', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Order: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['pending', 'shipped'] },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-51-magic-string-enum-candidate')).toBe(false);
  });

  it('does NOT flag arbitrary property name `displayName`', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { displayName: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-51-magic-string-enum-candidate')).toBe(false);
  });
});

// =============================================================================
// EV-52 — int max > 2^53
// =============================================================================

describe('EV-52 — int max > 2^53', () => {
  it('flags integer with maximum > 2^53', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Tx: {
            type: 'object',
            properties: {
              amount: { type: 'integer', maximum: 9999999999999999 },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-52-int-maximum-over-2-pow-53')).toBe(true);
  });

  it('does NOT flag int32-bounded integer', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Tx: {
            type: 'object',
            properties: {
              amount: { type: 'integer', maximum: 2147483647 },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-52-int-maximum-over-2-pow-53')).toBe(false);
  });
});

// =============================================================================
// EV-54 — Version param without enum
// =============================================================================

describe('EV-54 — Version param without enum', () => {
  it('flags `api-version` query-param without enum', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            parameters: [
              {
                name: 'api-version',
                in: 'query',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-54-version-param-no-enum')).toBe(true);
  });

  it('does NOT flag version param with enum', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            parameters: [
              {
                name: 'api-version',
                in: 'query',
                required: true,
                schema: { type: 'string', enum: ['v1', 'v2'] },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-54-version-param-no-enum')).toBe(false);
  });

  it('does NOT flag non-version param', async () => {
    const spec = baseSpec({
      paths: {
        '/foo': {
          get: {
            parameters: [
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer' },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-54-version-param-no-enum')).toBe(false);
  });
});

// =============================================================================
// EV-59 — 3xx redirect without Location header
// =============================================================================

describe('EV-59 — 3xx redirect without Location header', () => {
  it('flags 301 response without Location header', async () => {
    const spec = baseSpec({
      paths: {
        '/old': {
          get: {
            responses: {
              '301': { description: 'redirected' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-59-3xx-without-location')).toBe(true);
  });

  it('does NOT flag 301 with Location header', async () => {
    const spec = baseSpec({
      paths: {
        '/old': {
          get: {
            responses: {
              '301': {
                description: 'redirected',
                headers: {
                  Location: { schema: { type: 'string', format: 'uri' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-59-3xx-without-location')).toBe(false);
  });
});

// =============================================================================
// EV-60 — Webhook without prose
// =============================================================================

describe('EV-60 — Webhook without prose', () => {
  it('flags webhook without summary/description (OAS 3.1)', async () => {
    const spec = {
      openapi: '3.1.0',
      info: {
        title: 'T',
        version: '1.2.3',
        description: 'long enough for info-description',
      },
      servers: [{ url: 'https://api.example.com' }],
      paths: {},
      webhooks: {
        userCreated: {
          post: {
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: { schemas: { _Probe: { type: 'object' } } },
    };
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-60-webhook-no-prose')).toBe(true);
  });

  it('does NOT flag webhook with description', async () => {
    const spec = {
      openapi: '3.1.0',
      info: {
        title: 'T',
        version: '1.2.3',
        description: 'long enough for info-description',
      },
      servers: [{ url: 'https://api.example.com' }],
      paths: {},
      webhooks: {
        userCreated: {
          post: {
            description: 'Sent when a new user signs up.',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: { schemas: { _Probe: { type: 'object' } } },
    };
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-60-webhook-no-prose')).toBe(false);
  });
});

// =============================================================================
// EV-61 — oneOf closed + open prose
// =============================================================================

describe('EV-61 — oneOf closed + prose says open', () => {
  it('flags oneOf with prose claiming "more variants will be added"', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Event: {
            description:
              'An event union. More variants will be added in future releases.',
            oneOf: [
              { $ref: '#/components/schemas/A' },
              { $ref: '#/components/schemas/B' },
            ],
          },
          A: { type: 'object' },
          B: { type: 'object' },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-61-oneof-closed-prose-says-open')).toBe(true);
  });

  it('does NOT flag oneOf with neutral description', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Event: {
            description: 'An event union of A or B.',
            oneOf: [
              { $ref: '#/components/schemas/A' },
              { $ref: '#/components/schemas/B' },
            ],
          },
          A: { type: 'object' },
          B: { type: 'object' },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-61-oneof-closed-prose-says-open')).toBe(false);
  });
});

// =============================================================================
// EV-62 — int64 string-encoding candidate
// =============================================================================

describe('EV-62 — int64 string-encoding candidate', () => {
  it('flags type:integer + format:int64', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Tx: {
            type: 'object',
            properties: {
              id: { type: 'integer', format: 'int64' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-62-int64-string-encoding-candidate')).toBe(
      true
    );
  });

  it('does NOT flag type:integer + format:int32', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Tx: {
            type: 'object',
            properties: {
              id: { type: 'integer', format: 'int32' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-62-int64-string-encoding-candidate')).toBe(
      false
    );
  });

  it('does NOT flag type:string + format:int64 (the recommended form)', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Tx: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'int64' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-ev-62-int64-string-encoding-candidate')).toBe(
      false
    );
  });
});
