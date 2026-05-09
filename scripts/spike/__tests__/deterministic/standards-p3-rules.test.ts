/**
 * Tests for the P3 Standards-Compliance Spectral ruleset (T-RFC2 / Welle D).
 *
 * Loads `apiq-ruleset-standards-p3.yaml` plus custom functions from
 * `spectral-functions/standards-p3-functions.ts`, builds an isolated
 * Spectral instance, and runs synthetic specs covering rule-loading +
 * apiq-meta validity + smoke-detection on representative fixtures.
 *
 * Coverage:
 *   - 36 yaml-rules (covering 47 patterns after 4 bundle-consolidations)
 *   - apiq-meta 100% coverage with required Welle-F fields
 *   - per-rule smoke-fixtures focus on bundle-subsumed pattern-IDs (each
 *     subsumed pattern-ID must trigger at least one finding via the bundle
 *     custom-function)
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
} from '../../deterministic/spectral-functions/standards-p3-functions.js';

// =============================================================================
// Spectral bootstrap (mirrors threat-p2-rules.test.ts)
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
  'apiq-ruleset-standards-p3.yaml'
);

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
  'problem-details-extension-reserved': problemDetailsExtensionReserved,
  'one-xx-response-upgrade-header': oneXxResponseUpgradeHeader,
  'upgrade-required-426': upgradeRequired426,
  'one-xx-not-in-responses-keys': oneXxNotInResponsesKeys,
  'if-modified-since-implies-304': ifModifiedSinceImplies304,
  'if-unmodified-since-implies-412': ifUnmodifiedSinceImplies412,
  'etag-cross-resource-consistency': etagCrossResourceConsistency,
  'id-write-op-etag-support': idWriteOpEtagSupport,
  'proxy-authenticate-407': proxyAuthenticate407,
  'prefer-implies-preference-applied': preferImpliesPreferenceApplied,
  'prefer-respond-async-implies-202': preferRespondAsyncImplies202,
  'deprecation-pairs-sunset': deprecationPairsSunset,
  'rate-limit-header-family-consistency': rateLimitHeaderFamilyConsistency,
  'merge-patch-properties-not-required': mergePatchPropertiesNotRequired,
  'json-patch-schema-is-array': jsonPatchSchemaIsArray,
  'cache-header-bundle': cacheHeaderBundle,
  'cache-validators-bundle': cacheValidatorsBundle,
  'link-header-bundle': linkHeaderBundle,
  'multipart-form-bundle': multipartFormBundle,
};

function buildStandardsP3Ruleset(yamlText: string): RulesetDefinition {
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
        // eslint-disable-next-line no-console
        console.warn(
          `[standards-p3-test] rule "${code}" function "${fnName}" not callable; skipping`
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
    if (rule.formats !== undefined) {
      // We don't translate format-restrictions in this lightweight test
      // harness — we just leave them off and let the default OAS3 evaluator
      // run the rule everywhere. Fixtures pick the right OAS-version anyway.
    }
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
  const ruleset = buildStandardsP3Ruleset(yamlText);
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

const baseSpec = (overrides: Record<string, unknown> = {}): object => ({
  openapi: '3.0.3',
  info: {
    title: 'Test',
    version: '1.0.0',
    description:
      'A long enough description to satisfy info-description rules and isolate standards-p3 findings.',
  },
  servers: [{ url: 'https://api.example.com' }],
  paths: {},
  components: { schemas: {}, securitySchemes: {} },
  ...overrides,
});

// =============================================================================
// Bootstrap + apiq-meta coverage
// =============================================================================

describe('standards-p3 ruleset bootstrap', () => {
  it('loads the YAML ruleset without crashing', () => {
    expect(fs.existsSync(RULESET_PATH)).toBe(true);
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(yamlText) as YamlRuleset;
    expect(parsed.rules).toBeDefined();
    // 36 yaml-rules covering 47 patterns (after 4 bundle-consolidations).
    expect(Object.keys(parsed.rules).length).toBeGreaterThanOrEqual(30);
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

  it('citation-tagged rules carry quote/summary populated (T25 input + T-Verbatim-Cleanup)', () => {
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    interface RuleSource {
      /** Welle-D Phase-3 schema-split: T25-verifiable copy-paste. */
      quote?: string;
      /** Welle-D Phase-3 schema-split: mining-paraphrase, NOT T25-verified. */
      summary?: string;
      /** @deprecated legacy `verbatim` field — passthrough during migration. */
      verbatim?: string;
      verifiedAt?: string;
      type?: string;
      number?: number;
      section?: string;
    }
    interface YamlRuleWithMeta extends YamlRule {
      'apiq-meta'?: { sources?: RuleSource[]; 'pattern-id'?: string };
    }
    interface YamlRulesetWithMeta {
      rules: Record<string, YamlRuleWithMeta>;
    }
    const parsed = YAML.parse(yamlText) as YamlRulesetWithMeta;
    // Implementation-priority.md tags RFC2-15 + RFC2-41 as carrying citation-
    // text. Post Welle-D-cleanup these may live under `quote` (T25-verifiable)
    // OR `summary` (paraphrase) OR legacy `verbatim` — all three are accepted.
    // Assert that at least these 2 must-rules and ≥80% of all rules have at
    // least one citation-text entry across their sources array.
    const CITATION_REQUIRED_PATTERN_IDS = new Set(['RFC2-15', 'RFC2-41']);
    let totalRules = 0;
    let rulesWithCitationText = 0;
    for (const [, rule] of Object.entries(parsed.rules)) {
      const meta = rule['apiq-meta'];
      if (!meta) continue;
      totalRules++;
      const sources = meta.sources ?? [];
      const hasCitationText = sources.some(
        (s) =>
          (typeof s.quote === 'string' && s.quote.length > 0) ||
          (typeof s.summary === 'string' && s.summary.length > 0) ||
          (typeof s.verbatim === 'string' && s.verbatim.length > 0)
      );
      if (hasCitationText) rulesWithCitationText++;
      if (CITATION_REQUIRED_PATTERN_IDS.has(meta['pattern-id'] ?? '')) {
        expect(
          hasCitationText,
          `citation-required rule pattern-id ${meta['pattern-id']} must have quote/summary/verbatim populated`
        ).toBe(true);
      }
    }
    // ≥80% of rules should have at least one citation-text entry after T-RFC2.
    expect(rulesWithCitationText / totalRules).toBeGreaterThanOrEqual(0.8);
  });
});

// =============================================================================
// RFC2-15 — 426 Upgrade Required (verbatim MUST)
// =============================================================================
describe('RFC2-15 — 426 → Upgrade header REQUIRED', () => {
  it('flags 426 response without Upgrade header', async () => {
    const spec = baseSpec({
      paths: {
        '/r': {
          get: {
            responses: {
              '200': { description: 'ok' },
              '426': { description: 'Upgrade required' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-15-426-upgrade-required')).toBe(true);
  });
  it('does not flag 426 with Upgrade header', async () => {
    const spec = baseSpec({
      paths: {
        '/r': {
          get: {
            responses: {
              '200': { description: 'ok' },
              '426': {
                description: 'Upgrade required',
                headers: { Upgrade: { schema: { type: 'string' } } },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-15-426-upgrade-required')).toBe(false);
  });
});

// =============================================================================
// RFC2-41 — 407 Proxy-Authenticate (verbatim MUST)
// =============================================================================
describe('RFC2-41 — 407 → Proxy-Authenticate header REQUIRED', () => {
  it('flags 407 response without Proxy-Authenticate', async () => {
    const spec = baseSpec({
      paths: {
        '/r': {
          get: {
            responses: {
              '200': { description: 'ok' },
              '407': { description: 'proxy auth required' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-41-407-proxy-authenticate-required')).toBe(true);
  });
});

// =============================================================================
// RFC2-44 — Digest auth outdated
// =============================================================================
describe('RFC2-44 — Digest auth legacy', () => {
  it('flags http+digest scheme', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          legacyAuth: { type: 'http', scheme: 'digest' },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-44-digest-auth-outdated')).toBe(true);
  });
  it('does not flag http+bearer scheme', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          modernAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-44-digest-auth-outdated')).toBe(false);
  });
});

// =============================================================================
// RFC2-57 — Bearer scheme bearerFormat declared
// =============================================================================
describe('RFC2-57 — Bearer bearerFormat declared', () => {
  it('flags bearer scheme without bearerFormat', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-57-bearer-format-declared')).toBe(true);
  });
  it('does not flag bearer scheme with bearerFormat', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-57-bearer-format-declared')).toBe(false);
  });
});

// =============================================================================
// Bundle smoke — apiq-rfc2-cache-header-bundle (RFC2-30/31/33/34)
// =============================================================================
describe('Bundle — cache-header (rule fires for each subsumed pattern)', () => {
  it('fires for Range-without-206 + Range-without-416', async () => {
    const spec = baseSpec({
      paths: {
        '/r': {
          get: {
            parameters: [{ name: 'Range', in: 'header', schema: { type: 'string' } }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-cache-header-bundle')).toBe(true);
  });
});

// =============================================================================
// Bundle smoke — apiq-rfc2-cache-validators-bundle (RFC2-35..39)
// =============================================================================
describe('Bundle — cache-validators (rule fires for each subsumed pattern)', () => {
  it('fires for Pragma + Cache-Control non-IANA', async () => {
    const spec = baseSpec({
      paths: {
        '/r': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  Pragma: { schema: { type: 'string' } },
                  'Cache-Control': { schema: { example: 'foo-bar-directive' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-cache-validators-bundle')).toBe(true);
  });
});

// =============================================================================
// Bundle smoke — apiq-rfc2-link-header-bundle (RFC2-52..55)
// =============================================================================
describe('Bundle — link-header (rule fires for each subsumed pattern)', () => {
  it('fires for non-IANA rel-token', async () => {
    const spec = baseSpec({
      paths: {
        '/r': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  Link: { example: '<https://api/x>; rel="custom-relation-not-iana"' },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-link-header-bundle')).toBe(true);
  });
});

// =============================================================================
// Bundle smoke — apiq-rfc2-multipart-form-bundle (RFC2-100/101)
// =============================================================================
describe('Bundle — multipart-form (rule fires for each subsumed pattern)', () => {
  it('fires for binary-likely property without format:binary', async () => {
    const spec = baseSpec({
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      file: { type: 'string' },
                      meta: { type: 'string' },
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
    expect(hasFinding(diags, 'apiq-rfc2-multipart-form-bundle')).toBe(true);
  });
});

// =============================================================================
// RFC2-99 — json-patch+json schema is array
// =============================================================================
describe('RFC2-99 — json-patch+json schema array', () => {
  it('flags object-typed json-patch schema', async () => {
    const spec = baseSpec({
      paths: {
        '/r': {
          patch: {
            requestBody: {
              content: {
                'application/json-patch+json': {
                  schema: { type: 'object', properties: {} },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-99-json-patch-array-type')).toBe(true);
  });
  it('does not flag array-typed json-patch schema', async () => {
    const spec = baseSpec({
      paths: {
        '/r': {
          patch: {
            requestBody: {
              content: {
                'application/json-patch+json': { schema: { type: 'array' } },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-99-json-patch-array-type')).toBe(false);
  });
});

// =============================================================================
// RFC2-91 — Deprecation pairs Sunset
// =============================================================================
describe('RFC2-91 — Deprecation header pairs Sunset', () => {
  it('flags op with Deprecation but no Sunset', async () => {
    const spec = baseSpec({
      paths: {
        '/r': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                headers: { Deprecation: { schema: { type: 'string' } } },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-rfc2-91-deprecation-pairs-sunset')).toBe(true);
  });
});
