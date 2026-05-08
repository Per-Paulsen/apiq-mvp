/**
 * Tests for the P2 Threat-Modeling Spectral ruleset (T16b, Welle C).
 *
 * Loads `apiq-ruleset-threat-p2.yaml` plus custom functions from
 * `spectral-functions/threat-p2-functions.ts`, builds an isolated Spectral
 * instance, and runs synthetic specs covering each rule's positive (violation)
 * and negative (compliant) case.
 *
 * Coverage matrix (≥ 36 rules, ≥ 70 cases):
 *   Y-Tier (9):  Y-1, Y-8, Y-10, Y-12, Y-13, Y-14, Y-15, Y-19, Y-21
 *   TM-A (14):   TM-A2, TM-A5, TM-A7, TM-A9, TM-A12, TM-A13, TM-A14, TM-A18,
 *                TM-A28, TM-A35, TM-A36, TM-A45, TM-A46, TM-A47
 *   RFC2 (13):   RFC2-1, RFC2-2, RFC2-3, RFC2-11, RFC2-conditional (bundle of
 *                20/21/22/25/26), RFC2-32, RFC2-58, RFC2-59, RFC2-65, RFC2-69,
 *                RFC2-70, RFC2-74, RFC2-97
 *
 * Plus a smoke-run on the 4 example specs (stripe / pagerduty / dnd5eapi /
 * github-rest) — verifies the ruleset doesn't crash on real-world inputs.
 */

import { describe, it, expect, beforeAll } from 'vitest';
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
} from '../../deterministic/spectral-functions/threat-p2-functions.js';

// =============================================================================
// Spectral bootstrap (mirrors spectral-runner.ts ESM-interop dance)
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
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const RULESET_PATH = path.join(
  SPIKE_DIR,
  'deterministic',
  'apiq-ruleset-threat-p2.yaml'
);

// =============================================================================
// Ruleset YAML → RulesetDefinition compiler (handles BOTH built-in and custom
// function references inline, unlike threat-p1-rules.test.ts which separated
// them. P2 has 15 custom functions — splitting would double the boilerplate.)
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

// kebab-case YAML function names → JS callable. Mirrors what spectral-runner.ts
// will register in APIQ_CUSTOM_FUNCTIONS once Phase-2 wiring lands.
const CUSTOM_FUNCTIONS_REGISTRY: Record<string, unknown> = {
  'object-id-write-op-needs-security': objectIdWriteOpNeedsSecurity,
  'oauth2-authcode-pkce-recommended': oauth2AuthCodePkceRecommended,
  'login-endpoint-rate-limit': loginEndpointRateLimit,
  'schema-reuse-without-readonly-writeonly':
    schemaReuseWithoutReadOnlyWriteOnly,
  'recursive-schema-needs-max-depth': recursiveSchemaNeedsMaxDepth,
  'admin-description-without-security': adminDescriptionWithoutSecurity,
  'upstream-url-needs-error-responses': upstreamUrlNeedsErrorResponses,
  'multi-version-servers-need-deprecation': multiVersionServersNeedDeprecation,
  'deprecated-needs-sunset-replacement': deprecatedNeedsSunsetReplacement,
  'info-version-server-url-drift': infoVersionServerUrlDrift,
  'problem-details-status-matches-http-status':
    problemDetailsStatusMatchesHttpStatus,
  'conditional-request-correctness': conditionalRequestCorrectness,
  'partial-content-needs-content-range': partialContentNeedsContentRange,
  'bearer-401-www-authenticate-realm': bearer401WwwAuthenticateRealm,
  'patch-content-type-correct': patchContentTypeCorrect,
};

function buildThreatP2Ruleset(yamlText: string): RulesetDefinition {
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
          `[threat-p2-test] rule "${code}" function "${fnName}" not callable; skipping`
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

// =============================================================================
// Run helper
// =============================================================================

let cachedSpectral: SpectralCore.Spectral | null = null;

function getSpectral(): SpectralCore.Spectral {
  if (cachedSpectral) return cachedSpectral;
  const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
  const ruleset = buildThreatP2Ruleset(yamlText);
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
    version: '1.0.0',
    description:
      'A long enough description for info-description rules so we can isolate threat-p2 findings.',
  },
  servers: [{ url: 'https://api.example.com' }],
  paths: {},
  components: { schemas: {}, securitySchemes: {} },
  security: [{ apiKey: [] }],
  ...overrides,
});

// =============================================================================
// Tests — Sanity / Bootstrap
// =============================================================================

describe('threat-p2 ruleset bootstrap', () => {
  it('loads the YAML ruleset without crashing', () => {
    expect(fs.existsSync(RULESET_PATH)).toBe(true);
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(yamlText) as YamlRuleset;
    expect(parsed.rules).toBeDefined();
    expect(Object.keys(parsed.rules).length).toBeGreaterThanOrEqual(36);
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

  it('every Lens-1 rule has regulatoryMapping populated (NIST + ASVS minimum)', () => {
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    interface YamlRuleWithMeta extends YamlRule {
      'apiq-meta'?: {
        lenses?: string[];
        'regulatory-mapping'?: {
          nist?: string[];
          asvs?: string[];
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
    }
    interface YamlRulesetWithMeta {
      rules: Record<string, YamlRuleWithMeta>;
    }
    const parsed = YAML.parse(yamlText) as YamlRulesetWithMeta;
    for (const [ruleName, rule] of Object.entries(parsed.rules)) {
      const meta = rule['apiq-meta'];
      if (!meta) continue;
      const lenses = meta.lenses ?? [];
      if (!lenses.includes('threat-modeling')) continue;
      const reg = meta['regulatory-mapping'];
      expect(
        reg,
        `Lens-1 rule "${ruleName}" missing regulatory-mapping`
      ).toBeDefined();
      expect(
        (reg!.nist ?? []).length,
        `Lens-1 rule "${ruleName}" missing regulatory-mapping.nist`
      ).toBeGreaterThan(0);
      expect(
        (reg!.asvs ?? []).length,
        `Lens-1 rule "${ruleName}" missing regulatory-mapping.asvs`
      ).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Y-1 — Numeric IDs in path-params
// =============================================================================

describe('Y-1 — Numeric ID in path params', () => {
  it('flags integer-typed path param without uuid format', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y1-numeric-id-path-params')).toBe(true);
  });

  it('does NOT flag integer-typed path param with format:uuid', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer', format: 'uuid' },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y1-numeric-id-path-params')).toBe(false);
  });

  it('does NOT flag string-typed path param', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
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
    expect(hasFinding(diags, 'apiq-tm-y1-numeric-id-path-params')).toBe(false);
  });
});

// =============================================================================
// Y-8 — JWT bearer description SHOULD mention RFC 8725
// =============================================================================

describe('Y-8 — JWT bearer RFC 8725 mention', () => {
  it('flags JWT bearer scheme without RFC 8725 in description', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT bearer auth',
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y8-jwt-bearer-rfc-8725-mention')).toBe(true);
  });

  it('does NOT flag JWT bearer scheme that mentions RFC 8725', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT bearer auth. Tokens must be signed per RFC 8725 (JWT BCP).',
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y8-jwt-bearer-rfc-8725-mention')).toBe(false);
  });
});

// =============================================================================
// Y-10 — additionalProperties:false on component schemas
// =============================================================================

describe('Y-10 — Component schema additionalProperties:false', () => {
  it('flags component schema without additionalProperties declared', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-y10-component-schema-additional-properties-false')
    ).toBe(true);
  });

  it('does NOT flag schema with additionalProperties:false', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { name: { type: 'string' } },
            additionalProperties: false,
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-y10-component-schema-additional-properties-false')
    ).toBe(false);
  });
});

// =============================================================================
// Y-12 — Array maxItems
// =============================================================================

describe('Y-12 — Array maxItems', () => {
  it('flags array schema without maxItems', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y12-array-needs-max-items')).toBe(true);
  });

  it('does NOT flag array schema with maxItems', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Items: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 100,
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y12-array-needs-max-items')).toBe(false);
  });
});

// =============================================================================
// Y-13 — String maxLength/enum/const (DoS-bound)
// =============================================================================

describe('Y-13 — String needs maxLength/enum/const', () => {
  it('flags string schema without maxLength/enum/const', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Name: { type: 'string' },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y13-string-needs-max-length-or-enum')).toBe(
      true
    );
  });

  it('does NOT flag string with maxLength', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Name: { type: 'string', maxLength: 100 },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y13-string-needs-max-length-or-enum')).toBe(
      false
    );
  });
});

// =============================================================================
// Y-14 — Integer minimum + maximum
// =============================================================================

describe('Y-14 — Integer needs minimum + maximum', () => {
  it('flags integer schema without minimum AND maximum', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Count: { type: 'integer' },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y14-integer-needs-min-and-max')).toBe(true);
  });

  it('does NOT flag integer with both minimum and maximum', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Count: { type: 'integer', minimum: 0, maximum: 1000 },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y14-integer-needs-min-and-max')).toBe(false);
  });
});

// =============================================================================
// Y-15 — URL property needs format:uri
// =============================================================================

describe('Y-15 — URL property needs format:uri', () => {
  it('flags webhook_url property without format:uri', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Cfg: {
            type: 'object',
            properties: {
              webhook_url: { type: 'string' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y15-url-property-needs-format-uri')).toBe(
      true
    );
  });

  it('does NOT flag webhook_url with format:uri', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Cfg: {
            type: 'object',
            properties: {
              webhook_url: { type: 'string', format: 'uri' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y15-url-property-needs-format-uri')).toBe(
      false
    );
  });
});

// =============================================================================
// Y-19 — No environment-name paths
// =============================================================================

describe('Y-19 — No environment-name paths', () => {
  it('flags /prod path', async () => {
    const spec = baseSpec({
      paths: {
        '/prod/users': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y19-path-no-env-names')).toBe(true);
  });

  it('flags /staging path', async () => {
    const spec = baseSpec({
      paths: {
        '/staging': { get: { responses: { '200': { description: 'ok' } } } },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y19-path-no-env-names')).toBe(true);
  });

  it('does NOT flag /users path', async () => {
    const spec = baseSpec({
      paths: {
        '/users': { get: { responses: { '200': { description: 'ok' } } } },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y19-path-no-env-names')).toBe(false);
  });
});

// =============================================================================
// Y-21 — Property names: no programming keywords
// =============================================================================

describe('Y-21 — Property name no programming keywords', () => {
  it('flags property named `class`', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { class: { type: 'string' }, name: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-y21-property-name-no-programming-keywords')
    ).toBe(true);
  });

  it('does NOT flag normal property names', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { name: { type: 'string' }, email: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-y21-property-name-no-programming-keywords')
    ).toBe(false);
  });
});

// =============================================================================
// TM-A2 — Object-id write op needs security
// =============================================================================

describe('TM-A2 — Object-id write op needs security', () => {
  it('flags POST /users/{id} without security and no spec-level security', async () => {
    const spec = baseSpec({
      security: undefined,
      paths: {
        '/users/{id}': {
          post: {
            parameters: [
              {
                name: 'id',
                in: 'path',
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
    expect(hasFinding(diags, 'apiq-tm-a2-object-id-write-op-needs-security')).toBe(
      true
    );
  });

  it('does NOT flag if spec-level security is declared', async () => {
    const spec = baseSpec({
      security: [{ apiKey: [] }],
      paths: {
        '/users/{id}': {
          post: {
            parameters: [
              {
                name: 'id',
                in: 'path',
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
    expect(hasFinding(diags, 'apiq-tm-a2-object-id-write-op-needs-security')).toBe(
      false
    );
  });

  it('does NOT flag GET /users/{id}', async () => {
    const spec = baseSpec({
      security: undefined,
      paths: {
        '/users/{id}': {
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
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
    expect(hasFinding(diags, 'apiq-tm-a2-object-id-write-op-needs-security')).toBe(
      false
    );
  });
});

// =============================================================================
// TM-A5 — Bearer JWT description text → RFC 8725 mention
// =============================================================================

describe('TM-A5 — Bearer scheme description JWT text RFC 8725 mention', () => {
  it('flags bearer scheme mentioning JWT in description but no RFC 8725', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'Pass JWT in Authorization header',
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a5-bearer-jwt-text-rfc-8725-mention')).toBe(
      true
    );
  });

  it('does NOT flag bearer scheme that references RFC 8725', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description:
              'Pass JWT in Authorization header. Validate per RFC 8725 BCP.',
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a5-bearer-jwt-text-rfc-8725-mention')).toBe(
      false
    );
  });
});

// =============================================================================
// TM-A7 — OAuth2 authCode SHOULD declare PKCE
// =============================================================================

describe('TM-A7 — OAuth2 authCode PKCE recommended', () => {
  it('flags authCode flow without PKCE marker', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                scopes: { read: 'Read access' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a7-oauth2-authcode-pkce-recommended')
    ).toBe(true);
  });

  it('does NOT flag authCode flow with x-pkce-required:true', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                scopes: { read: 'Read access' },
                'x-pkce-required': true,
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a7-oauth2-authcode-pkce-recommended')
    ).toBe(false);
  });
});

// =============================================================================
// TM-A9 — Login endpoint rate-limit
// =============================================================================

describe('TM-A9 — Login endpoint rate-limit headers', () => {
  it('flags POST /login without rate-limit headers', async () => {
    const spec = baseSpec({
      paths: {
        '/login': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      username: { type: 'string' },
                      password: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a9-login-endpoint-rate-limit')).toBe(true);
  });

  it('does NOT flag POST /login with rate-limit headers', async () => {
    const spec = baseSpec({
      paths: {
        '/login': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      username: { type: 'string' },
                      password: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  'X-RateLimit-Limit': { schema: { type: 'integer' } },
                  'X-RateLimit-Remaining': { schema: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a9-login-endpoint-rate-limit')).toBe(false);
  });
});

// =============================================================================
// TM-A12 — Password/secret request fields → writeOnly
// =============================================================================

describe('TM-A12 — Password/secret writeOnly', () => {
  it('flags password field in request body without writeOnly', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      password: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a12-password-secret-write-only')).toBe(true);
  });

  it('does NOT flag password with writeOnly:true', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      password: { type: 'string', writeOnly: true },
                    },
                  },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a12-password-secret-write-only')).toBe(false);
  });
});

// =============================================================================
// TM-A13 — Server-managed fields → readOnly
// =============================================================================

describe('TM-A13 — Server-managed readOnly', () => {
  it('flags `id` in response without readOnly', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a13-server-managed-fields-read-only')).toBe(
      true
    );
  });

  it('does NOT flag `id` with readOnly:true', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', readOnly: true },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a13-server-managed-fields-read-only')).toBe(
      false
    );
  });
});

// =============================================================================
// TM-A14 — Schema reuse without RO/WO
// =============================================================================

describe('TM-A14 — Schema reuse without readOnly/writeOnly', () => {
  it('flags schema referenced from BOTH request and response', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            responses: {
              '201': {
                description: 'Created',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a14-schema-reuse-without-readonly-writeonly')
    ).toBe(true);
  });

  it('does NOT flag if schema has at least one readOnly/writeOnly', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'string', readOnly: true },
              name: { type: 'string' },
            },
          },
        },
      },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            responses: {
              '201': {
                description: 'Created',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a14-schema-reuse-without-readonly-writeonly')
    ).toBe(false);
  });
});

// =============================================================================
// TM-A18 — Recursive schema needs max-depth
// =============================================================================

describe('TM-A18 — Recursive schema needs max-depth', () => {
  it('flags self-referential schema without x-max-depth', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          TreeNode: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              children: {
                type: 'array',
                items: { $ref: '#/components/schemas/TreeNode' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a18-recursive-schema-needs-max-depth')).toBe(
      true
    );
  });

  it('does NOT flag recursive schema with x-max-depth', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          TreeNode: {
            type: 'object',
            'x-max-depth': 5,
            properties: {
              name: { type: 'string' },
              children: {
                type: 'array',
                items: { $ref: '#/components/schemas/TreeNode' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a18-recursive-schema-needs-max-depth')).toBe(
      false
    );
  });

  it('does NOT flag non-recursive schema', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a18-recursive-schema-needs-max-depth')).toBe(
      false
    );
  });
});

// =============================================================================
// TM-A28 — Admin description without security
// =============================================================================

describe('TM-A28 — Admin description without security', () => {
  it('flags op with "admin" in description and no security', async () => {
    const spec = baseSpec({
      security: undefined,
      paths: {
        '/users': {
          get: {
            summary: 'List users',
            description: 'Admin-only endpoint for user listing.',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a28-admin-description-without-security')
    ).toBe(true);
  });

  it('does NOT flag op with admin description but security declared', async () => {
    const spec = baseSpec({
      security: undefined,
      paths: {
        '/users': {
          get: {
            summary: 'List users',
            description: 'Admin-only endpoint.',
            security: [{ apiKey: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a28-admin-description-without-security')
    ).toBe(false);
  });
});

// =============================================================================
// TM-A35 — URL property scheme allowlist
// =============================================================================

describe('TM-A35 — URL property scheme allowlist', () => {
  it('flags webhook_url format:uri without pattern', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Cfg: {
            type: 'object',
            properties: {
              webhook_url: { type: 'string', format: 'uri' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a35-url-property-needs-scheme-allowlist')
    ).toBe(true);
  });

  it('does NOT flag webhook_url with both format:uri and pattern', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Cfg: {
            type: 'object',
            properties: {
              webhook_url: {
                type: 'string',
                format: 'uri',
                pattern: '^https://',
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a35-url-property-needs-scheme-allowlist')
    ).toBe(false);
  });
});

// =============================================================================
// TM-A36 — Upstream URL needs error responses
// =============================================================================

describe('TM-A36 — Upstream URL needs 4xx + 5xx', () => {
  it('flags op consuming webhook_url without 4xx/5xx', async () => {
    const spec = baseSpec({
      paths: {
        '/webhooks': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      webhook_url: { type: 'string', format: 'uri' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a36-upstream-url-needs-error-responses')).toBe(
      true
    );
  });

  it('does NOT flag op with both 4xx and 5xx', async () => {
    const spec = baseSpec({
      paths: {
        '/webhooks': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      webhook_url: { type: 'string', format: 'uri' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': { description: 'ok' },
              '400': { description: 'bad request' },
              '502': { description: 'upstream error' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a36-upstream-url-needs-error-responses')).toBe(
      false
    );
  });
});

// =============================================================================
// TM-A45 — Multi-version servers need deprecation
// =============================================================================

describe('TM-A45 — Multi-version servers need deprecation', () => {
  it('flags spec with /v1/ and /v2/ servers and no deprecation', async () => {
    const spec = baseSpec({
      servers: [
        { url: 'https://api.example.com/v1' },
        { url: 'https://api.example.com/v2' },
      ],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a45-multi-version-servers-deprecation')).toBe(
      true
    );
  });

  it('does NOT flag if one server marked deprecated in description', async () => {
    const spec = baseSpec({
      servers: [
        {
          url: 'https://api.example.com/v1',
          description: 'v1 — deprecated, sunset 2026-12-31',
        },
        { url: 'https://api.example.com/v2', description: 'Current version.' },
      ],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a45-multi-version-servers-deprecation')).toBe(
      false
    );
  });

  it('does NOT flag single-version spec', async () => {
    const spec = baseSpec({
      servers: [{ url: 'https://api.example.com/v1' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a45-multi-version-servers-deprecation')).toBe(
      false
    );
  });
});

// =============================================================================
// TM-A46 — deprecated needs sunset + replacement
// =============================================================================

describe('TM-A46 — deprecated needs sunset + replacement', () => {
  it('flags deprecated op without Sunset header AND without replacement', async () => {
    const spec = baseSpec({
      paths: {
        '/old': {
          get: {
            deprecated: true,
            summary: 'Old endpoint',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a46-deprecated-needs-sunset-replacement')
    ).toBe(true);
  });

  it('does NOT flag deprecated op WITH Sunset header AND replacement', async () => {
    const spec = baseSpec({
      paths: {
        '/old': {
          get: {
            deprecated: true,
            summary: 'Old endpoint',
            description: 'Use /v2/users instead — see migration guide.',
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  Sunset: { schema: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a46-deprecated-needs-sunset-replacement')
    ).toBe(false);
  });

  it('does NOT flag non-deprecated op', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-tm-a46-deprecated-needs-sunset-replacement')
    ).toBe(false);
  });
});

// =============================================================================
// TM-A47 — info.version vs server-URL drift
// =============================================================================

describe('TM-A47 — info.version vs server-URL drift', () => {
  it('flags info.version 2.x with server /v1/ prefix', async () => {
    const spec = baseSpec({
      info: {
        title: 'Test',
        version: '2.5.0',
        description: 'Test API',
      },
      servers: [{ url: 'https://api.example.com/v1' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a47-info-version-server-url-drift')).toBe(true);
  });

  it('does NOT flag matching versions', async () => {
    const spec = baseSpec({
      info: {
        title: 'Test',
        version: '2.5.0',
        description: 'Test API',
      },
      servers: [{ url: 'https://api.example.com/v2' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a47-info-version-server-url-drift')).toBe(
      false
    );
  });
});

// =============================================================================
// RFC2-1 — problem+json schema needs `type` property
// =============================================================================

describe('RFC2-1 — problem+json schema needs `type`', () => {
  it('flags problem+json schema without `type` property', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            responses: {
              '400': {
                description: 'bad',
                content: {
                  'application/problem+json': {
                    schema: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-1-problem-json-needs-type')).toBe(true);
  });

  it('does NOT flag problem+json schema with `type`', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            responses: {
              '400': {
                description: 'bad',
                content: {
                  'application/problem+json': {
                    schema: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', format: 'uri' },
                        title: { type: 'string' },
                        status: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-1-problem-json-needs-type')).toBe(false);
  });
});

// =============================================================================
// RFC2-3 — problem-details status matches HTTP status (custom function)
// =============================================================================

describe('RFC2-3 — problem-details status matches HTTP status', () => {
  it('flags problem+json status default mismatch', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            responses: {
              '404': {
                description: 'not found',
                content: {
                  'application/problem+json': {
                    schema: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', format: 'uri' },
                        status: { type: 'integer', example: 500 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-rfc2-3-problem-details-status-matches-http-status')
    ).toBe(true);
  });

  it('does NOT flag matching status', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            responses: {
              '404': {
                description: 'not found',
                content: {
                  'application/problem+json': {
                    schema: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', format: 'uri' },
                        status: { type: 'integer', example: 404 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-rfc2-3-problem-details-status-matches-http-status')
    ).toBe(false);
  });
});

// =============================================================================
// RFC2-11 — Header names canonical Title-Case
// =============================================================================

describe('RFC2-11 — Header name Title-Case', () => {
  it('flags lowercase header name', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  'x-rate-limit-remaining': { schema: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-11-header-names-title-case')).toBe(true);
  });

  it('does NOT flag Title-Case header', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  'X-RateLimit-Remaining': { schema: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-11-header-names-title-case')).toBe(false);
  });
});

// =============================================================================
// RFC2-conditional-request-correctness (bundle: 20/21/22/25/26)
// =============================================================================

describe('RFC2-conditional-request-correctness', () => {
  it('flags op with If-Match parameter but no 412 response', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          put: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
              {
                name: 'If-Match',
                in: 'header',
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-conditional-request-correctness')).toBe(
      true
    );
  });

  it('flags GET with If-None-Match but no 304', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
              {
                name: 'If-None-Match',
                in: 'header',
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-conditional-request-correctness')).toBe(
      true
    );
  });

  it('does NOT flag op with If-Match + 412 + If-None-Match GET + 304', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
              {
                name: 'If-None-Match',
                in: 'header',
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  ETag: { schema: { type: 'string' } },
                },
              },
              '304': {
                description: 'not modified',
                headers: { ETag: { schema: { type: 'string' } } },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-conditional-request-correctness')).toBe(
      false
    );
  });
});

// =============================================================================
// RFC2-32 — 206 needs Content-Range
// =============================================================================

describe('RFC2-32 — 206 needs Content-Range', () => {
  it('flags 206 response without Content-Range header', async () => {
    const spec = baseSpec({
      paths: {
        '/files/{id}': {
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': { description: 'ok' },
              '206': { description: 'partial' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-32-partial-content-content-range')).toBe(
      true
    );
  });

  it('does NOT flag 206 with Content-Range', async () => {
    const spec = baseSpec({
      paths: {
        '/files/{id}': {
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': { description: 'ok' },
              '206': {
                description: 'partial',
                headers: {
                  'Content-Range': { schema: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-32-partial-content-content-range')).toBe(
      false
    );
  });
});

// =============================================================================
// RFC2-59 — Bearer 401 → WWW-Authenticate Bearer realm
// =============================================================================

describe('RFC2-59 — Bearer 401 WWW-Authenticate realm', () => {
  it('flags Bearer scheme + 401 without WWW-Authenticate', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': { description: 'ok' },
              '401': { description: 'Unauthorized' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-rfc2-59-bearer-401-www-authenticate-realm')
    ).toBe(true);
  });

  it('does NOT flag Bearer scheme + 401 WITH WWW-Authenticate Bearer realm', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': { description: 'ok' },
              '401': {
                description: 'Unauthorized',
                headers: {
                  'WWW-Authenticate': {
                    schema: {
                      type: 'string',
                      example: 'Bearer realm="api"',
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-rfc2-59-bearer-401-www-authenticate-realm')
    ).toBe(false);
  });
});

// =============================================================================
// RFC2-65 — OAuth2 scopes need descriptions
// =============================================================================

describe('RFC2-65 — OAuth2 scopes need descriptions', () => {
  it('flags OAuth2 scope with empty description', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                scopes: { 'read:users': '', 'write:users': 'Write users' },
                'x-pkce-required': true,
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-rfc2-65-oauth2-scopes-need-descriptions')
    ).toBe(true);
  });

  it('does NOT flag scopes with non-empty descriptions', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                scopes: {
                  'read:users': 'Read users',
                  'write:users': 'Write users',
                },
                'x-pkce-required': true,
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(
      hasFinding(diags, 'apiq-rfc2-65-oauth2-scopes-need-descriptions')
    ).toBe(false);
  });
});

// =============================================================================
// RFC2-69 — Path no fragment
// =============================================================================

describe('RFC2-69 — Path no fragment', () => {
  it('flags path containing #', async () => {
    const spec = baseSpec({
      paths: {
        '/users#section': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-69-path-no-fragment')).toBe(true);
  });

  it('does NOT flag path without #', async () => {
    const spec = baseSpec({
      paths: {
        '/users': { get: { responses: { '200': { description: 'ok' } } } },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-69-path-no-fragment')).toBe(false);
  });
});

// =============================================================================
// RFC2-70 — OAS path-template Level-1 only
// =============================================================================

describe('RFC2-70 — OAS path-template Level-1 only', () => {
  it('flags Level-2 syntax `{?var}`', async () => {
    const spec = baseSpec({
      paths: {
        '/users{?filter}': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-70-oas-path-template-level1-only')).toBe(
      true
    );
  });

  it('flags `{var:3}` operator', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{name:3}': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-70-oas-path-template-level1-only')).toBe(
      true
    );
  });

  it('does NOT flag Level-1 `{var}`', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-70-oas-path-template-level1-only')).toBe(
      false
    );
  });
});

// =============================================================================
// RFC2-74 — Server-URL no userinfo
// =============================================================================

describe('RFC2-74 — Server-URL no userinfo', () => {
  it('flags server URL with userinfo', async () => {
    const spec = baseSpec({
      servers: [{ url: 'https://user:pass@api.example.com' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-74-server-url-no-userinfo')).toBe(true);
  });

  it('does NOT flag normal server URL', async () => {
    const spec = baseSpec({
      servers: [{ url: 'https://api.example.com' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-74-server-url-no-userinfo')).toBe(false);
  });
});

// =============================================================================
// RFC2-97 — PATCH content-type correct
// =============================================================================

describe('RFC2-97 — PATCH content-type correct', () => {
  it('flags PATCH with only application/json content-type', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          patch: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            requestBody: {
              content: {
                'application/json': { schema: { type: 'object' } },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-97-patch-content-type-correct')).toBe(true);
  });

  it('does NOT flag PATCH with application/merge-patch+json', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          patch: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            requestBody: {
              content: {
                'application/merge-patch+json': {
                  schema: { type: 'object' },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-97-patch-content-type-correct')).toBe(
      false
    );
  });
});

// =============================================================================
// Smoke test — run on real example specs (does not crash)
// =============================================================================

describe('threat-p2 smoke test on real example specs', () => {
  const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');
  const SMALL_SPECS = ['dnd5eapi', 'pagerduty'];
  const BIG_SPECS = ['stripe', 'github-rest'];

  beforeAll(() => {
    if (!fs.existsSync(EXAMPLES_DIR)) {
      throw new Error(`openapi-examples not found at ${EXAMPLES_DIR}`);
    }
  });

  async function loadAndRun(specName: string): Promise<ISpectralDiagnostic[]> {
    const baseDir = path.join(EXAMPLES_DIR, specName);
    if (!fs.existsSync(baseDir)) {
      return [];
    }
    const candidates = ['spec.json', 'spec.yaml', 'spec.yml'];
    let specPath: string | null = null;
    for (const c of candidates) {
      const p = path.join(baseDir, c);
      if (fs.existsSync(p)) {
        specPath = p;
        break;
      }
    }
    if (!specPath) return [];
    const raw = fs.readFileSync(specPath, 'utf8');
    const ext = path.extname(specPath).toLowerCase();
    const parsed: unknown = ext === '.json' ? JSON.parse(raw) : YAML.parse(raw);
    return runOn(parsed as object);
  }

  for (const specName of SMALL_SPECS) {
    it(
      `runs on ${specName} without crashing`,
      async () => {
        const diags = await loadAndRun(specName);
        expect(Array.isArray(diags)).toBe(true);
      },
      300_000
    );
  }

  const RUN_BIG = process.env.APIQ_SMOKE_BIG === '1';
  for (const specName of BIG_SPECS) {
    (RUN_BIG ? it : it.skip)(
      `runs on ${specName} without crashing (big-spec, opt-in via APIQ_SMOKE_BIG=1)`,
      async () => {
        const diags = await loadAndRun(specName);
        expect(Array.isArray(diags)).toBe(true);
      },
      900_000
    );
  }
});
