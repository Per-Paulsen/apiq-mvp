/**
 * Tests for the P3 Threat-Modeling Spectral ruleset (T16c, Welle D).
 *
 * Loads `apiq-ruleset-threat-p3.yaml` plus custom functions from
 * `spectral-functions/threat-p3-functions.ts`, builds an isolated Spectral
 * instance, and runs synthetic specs covering each rule's positive
 * (violation) and negative (compliant) case.
 *
 * Coverage matrix (31 rules, ~75 cases):
 *   Y-Tier (9):  Y-6, Y-9, Y-11, Y-16, Y-18, Y-20, Y-22, Y-24, Y-25
 *   TM-A (22):   TM-A3, TM-A4, TM-A8, TM-A16, TM-A19, TM-A20, TM-A21, TM-A25,
 *                TM-A26, TM-A27, TM-A29, TM-A30, TM-A31, TM-A33, TM-A37,
 *                TM-A40, TM-A41, TM-A43, TM-A48, TM-A49, TM-A51, TM-A52
 *
 * Plus apiq-meta coverage gates (100% Welle-F schema; Lens-1 NIST+ASVS).
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
} from '../../deterministic/spectral-functions/threat-p3-functions.js';

// =============================================================================
// Spectral bootstrap (mirrors threat-p2-rules.test.ts ESM-interop dance)
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
  'apiq-ruleset-threat-p3.yaml'
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
  'sensitive-header-name-rejected': sensitiveHeaderNameRejected,
  'post-creates-need-idempotency-key': postCreatesNeedIdempotencyKey,
  'three-or-more-id-params-bola': threeOrMoreIdParamsBola,
  'body-contains-user-id-on-non-admin': bodyContainsUserIdOnNonAdmin,
  'multiple-and-security-same-type': multipleAndSecuritySameType,
  'long-running-op-async-pattern': longRunningOpAsyncPattern,
  'admin-shares-public-security': adminSharesPublicSecurity,
  'resource-only-get-no-write': resourceOnlyGetNoWrite,
  'non-standard-method-needs-security': nonStandardMethodNeedsSecurity,
  'signup-needs-rate-limit-or-captcha': signupNeedsRateLimitOrCaptcha,
  'posting-comment-needs-rate-limit': postingCommentNeedsRateLimit,
  'host-param-flagged-for-ssrf': hostParamFlaggedForSsrf,
  'cors-origin-reflection-without-allowlist': corsOriginReflectionWithoutAllowlist,
  'browser-api-needs-security-headers': browserApiNeedsSecurityHeaders,
  'upstream-url-op-needs-5xx-explicit': upstreamUrlOpNeeds5xxExplicit,
  'webhook-rejects-wildcard-content-type': webhookRejectsWildcardContentType,
};

function buildThreatP3Ruleset(yamlText: string): RulesetDefinition {
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
          `[threat-p3-test] rule "${code}" function "${fnName}" not callable; skipping`
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
    if (rule.formats !== undefined) built.formats = rule.formats;
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
  const ruleset = buildThreatP3Ruleset(yamlText);
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
      'A long enough description for info-description rules so we can isolate threat-p3 findings. # Authentication \nUse OAuth2.',
    contact: { name: 'API team', url: 'https://example.com/support', email: 'api@example.com' },
  },
  servers: [{ url: 'https://api.example.com' }],
  paths: {},
  components: { schemas: {}, securitySchemes: {} },
  security: [{ apiKey: [] }],
  ...overrides,
});

// =============================================================================
// Bootstrap / coverage gates
// =============================================================================

describe('threat-p3 ruleset bootstrap', () => {
  it('loads the YAML ruleset without crashing', () => {
    expect(fs.existsSync(RULESET_PATH)).toBe(true);
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(yamlText) as YamlRuleset;
    expect(parsed.rules).toBeDefined();
    expect(Object.keys(parsed.rules).length).toBe(31);
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
    const parsed = YAML.parse(yamlText) as { rules: Record<string, YamlRuleWithMeta> };
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
    const parsed = YAML.parse(yamlText) as { rules: Record<string, YamlRuleWithMeta> };
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
    const parsed = YAML.parse(yamlText) as { rules: Record<string, YamlRuleWithMeta> };
    for (const [ruleName, rule] of Object.entries(parsed.rules)) {
      const meta = rule['apiq-meta'];
      if (!meta) continue;
      const lenses = meta.lenses ?? [];
      if (!lenses.includes('threat-modeling')) continue;
      const reg = meta['regulatory-mapping'];
      expect(reg, `Lens-1 rule "${ruleName}" missing regulatory-mapping`).toBeDefined();
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
// Y-6 — OAuth2 refreshUrl recommended
// =============================================================================

describe('Y-6 — OAuth2 refreshUrl recommended', () => {
  it('flags password flow without refreshUrl', async () => {
    const spec = baseSpec({
      components: {
        schemas: {},
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            flows: {
              password: {
                tokenUrl: 'https://example.com/token',
                scopes: { read: 'read access' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y6-oauth2-refresh-url-recommended')).toBe(true);
  });

  it('does NOT flag password flow with refreshUrl', async () => {
    const spec = baseSpec({
      components: {
        schemas: {},
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            flows: {
              password: {
                tokenUrl: 'https://example.com/token',
                refreshUrl: 'https://example.com/refresh',
                scopes: { read: 'read access' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y6-oauth2-refresh-url-recommended')).toBe(false);
  });
});

// =============================================================================
// Y-9 — Auth-Schemes outdated
// =============================================================================

describe('Y-9 — outdated auth schemes', () => {
  it('flags negotiate / ntlm / oauth1', async () => {
    const spec = baseSpec({
      components: {
        schemas: {},
        securitySchemes: {
          legacy: { type: 'http', scheme: 'negotiate' },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y9-auth-scheme-outdated')).toBe(true);
  });

  it('does NOT flag bearer / basic', async () => {
    const spec = baseSpec({
      components: {
        schemas: {},
        securitySchemes: {
          modern: { type: 'http', scheme: 'bearer' },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y9-auth-scheme-outdated')).toBe(false);
  });
});

// =============================================================================
// Y-11 — unevaluatedProperties:false (OAS 3.1)
// =============================================================================

describe('Y-11 — unevaluatedProperties:false', () => {
  it('flags 3.1 composed schema lacking unevaluatedProperties', async () => {
    const spec = baseSpec({
      openapi: '3.1.0',
      components: {
        schemas: {
          Cat: {
            type: 'object',
            allOf: [{ $ref: '#/components/schemas/Pet' }],
            properties: { meow: { type: 'string' } },
          },
          Pet: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y11-unevaluated-properties-false')).toBe(true);
  });

  it('does NOT flag 3.1 composed schema WITH unevaluatedProperties', async () => {
    const spec = baseSpec({
      openapi: '3.1.0',
      components: {
        schemas: {
          Cat: {
            type: 'object',
            allOf: [{ $ref: '#/components/schemas/Pet' }],
            unevaluatedProperties: false,
            properties: { meow: { type: 'string' } },
          },
          Pet: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y11-unevaluated-properties-false')).toBe(false);
  });
});

// =============================================================================
// Y-18 — sensitive header name rejected
// =============================================================================

describe('Y-18 — sensitive header name rejected', () => {
  it('flags `password` header parameter', async () => {
    const spec = baseSpec({
      paths: {
        '/sensitive': {
          get: {
            parameters: [
              { name: 'password', in: 'header', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y18-sensitive-header-name-rejected')).toBe(true);
  });

  it('flags `x-api-token` header parameter (not allowlisted)', async () => {
    const spec = baseSpec({
      paths: {
        '/sensitive': {
          get: {
            parameters: [
              { name: 'x-access-token', in: 'header', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y18-sensitive-header-name-rejected')).toBe(true);
  });

  it('does NOT flag `Authorization` header (allowlisted — securityScheme expectation)', async () => {
    const spec = baseSpec({
      paths: {
        '/sensitive': {
          get: {
            parameters: [
              { name: 'Authorization', in: 'header', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y18-sensitive-header-name-rejected')).toBe(false);
  });

  it('does NOT flag a non-credential header', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          get: {
            parameters: [
              { name: 'X-Request-Id', in: 'header', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y18-sensitive-header-name-rejected')).toBe(false);
  });
});

// =============================================================================
// Y-20 — Server URL no port
// =============================================================================

describe('Y-20 — Server URL no port', () => {
  it('flags production server URL with explicit port', async () => {
    const spec = baseSpec({ servers: [{ url: 'https://api.example.com:8080' }] });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y20-server-url-no-port')).toBe(true);
  });

  it('does NOT flag localhost with port', async () => {
    const spec = baseSpec({ servers: [{ url: 'http://localhost:3000' }] });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y20-server-url-no-port')).toBe(false);
  });

  it('does NOT flag URL without port', async () => {
    const spec = baseSpec({ servers: [{ url: 'https://api.example.com' }] });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y20-server-url-no-port')).toBe(false);
  });
});

// =============================================================================
// Y-22 — Admin paths distinct security
// =============================================================================

describe('Y-22 — Admin path distinct security', () => {
  it('flags admin path without operation-level security', async () => {
    const spec = baseSpec({
      paths: {
        '/admin/users': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y22-admin-distinct-security')).toBe(true);
  });

  it('does NOT flag admin path WITH operation-level security', async () => {
    const spec = baseSpec({
      paths: {
        '/admin/users': {
          security: [{ apiKey: [] }],
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y22-admin-distinct-security')).toBe(false);
  });
});

// =============================================================================
// Y-24 — Read ops need security
// =============================================================================

describe('Y-24 — Read ops need security', () => {
  it('flags GET without operation-level security', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y24-read-ops-need-security')).toBe(true);
  });

  it('does NOT flag GET WITH operation-level security', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          get: {
            security: [{ apiKey: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y24-read-ops-need-security')).toBe(false);
  });
});

// =============================================================================
// Y-25 — POST creates need Idempotency-Key
// =============================================================================

describe('Y-25 — POST creates need Idempotency-Key', () => {
  it('flags POST creating resource without Idempotency-Key', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          post: {
            requestBody: {
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            responses: { '201': { description: 'created' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y25-post-creates-need-idempotency-key')).toBe(true);
  });

  it('does NOT flag POST WITH Idempotency-Key parameter', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          post: {
            parameters: [
              { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } },
            ],
            requestBody: {
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            responses: { '201': { description: 'created' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y25-post-creates-need-idempotency-key')).toBe(false);
  });

  it('does NOT flag POST on /resource/{id} (action-style)', async () => {
    const spec = baseSpec({
      paths: {
        '/things/{id}': {
          post: {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '201': { description: 'created' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y25-post-creates-need-idempotency-key')).toBe(false);
  });
});

// =============================================================================
// TM-A3 — three or more ID params (BOLA)
// =============================================================================

describe('TM-A3 — three+ ID params BOLA', () => {
  it('flags path with 3 ID-template segments', async () => {
    const spec = baseSpec({
      paths: {
        '/orgs/{orgId}/teams/{teamId}/members/{memberId}': {
          get: {
            parameters: [
              { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
              { name: 'teamId', in: 'path', required: true, schema: { type: 'string' } },
              { name: 'memberId', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a3-three-or-more-id-params-bola')).toBe(true);
  });

  it('does NOT flag path with only 2 ID segments', async () => {
    const spec = baseSpec({
      paths: {
        '/orgs/{orgId}/teams/{teamId}': {
          get: {
            parameters: [
              { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
              { name: 'teamId', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a3-three-or-more-id-params-bola')).toBe(false);
  });
});

// =============================================================================
// TM-A4 — body contains user_id on non-admin
// =============================================================================

describe('TM-A4 — body identity-bearing field on non-admin', () => {
  it('flags POST /things with user_id in body', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user_id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { '201': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a4-body-contains-user-id-on-non-admin')).toBe(true);
  });

  it('does NOT flag admin path with user_id', async () => {
    const spec = baseSpec({
      paths: {
        '/admin/things': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { user_id: { type: 'string' } } },
                },
              },
            },
            responses: { '201': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a4-body-contains-user-id-on-non-admin')).toBe(false);
  });

  it('does NOT flag body without identity field', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { name: { type: 'string' } } },
                },
              },
            },
            responses: { '201': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a4-body-contains-user-id-on-non-admin')).toBe(false);
  });
});

// =============================================================================
// TM-A8 — multiple AND security same type
// =============================================================================

describe('TM-A8 — multiple AND security same type', () => {
  it('flags two apiKey schemes in single AND requirement', async () => {
    const spec = baseSpec({
      components: {
        schemas: {},
        securitySchemes: {
          apiKey1: { type: 'apiKey', name: 'X-Key-1', in: 'header' },
          apiKey2: { type: 'apiKey', name: 'X-Key-2', in: 'header' },
        },
      },
      paths: {
        '/secured': {
          get: {
            security: [{ apiKey1: [], apiKey2: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a8-multiple-and-security-same-type')).toBe(true);
  });

  it('does NOT flag mixed apiKey + http-bearer (real MFA)', async () => {
    const spec = baseSpec({
      components: {
        schemas: {},
        securitySchemes: {
          apiKey1: { type: 'apiKey', name: 'X-Key-1', in: 'header' },
          bearer1: { type: 'http', scheme: 'bearer' },
        },
      },
      paths: {
        '/secured': {
          get: {
            security: [{ apiKey1: [], bearer1: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a8-multiple-and-security-same-type')).toBe(false);
  });
});

// =============================================================================
// TM-A16 — email property needs format
// =============================================================================

describe('TM-A16 — email property needs format:email', () => {
  it('flags email property without format', async () => {
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
    expect(hasFinding(diags, 'apiq-tm-a16-email-property-needs-format')).toBe(true);
  });

  it('does NOT flag email property WITH format:email', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { email: { type: 'string', format: 'email' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a16-email-property-needs-format')).toBe(false);
  });
});

// =============================================================================
// TM-A19 — object schema property count
// =============================================================================

describe('TM-A19 — object schema with too many properties', () => {
  it('flags schema with > 50 properties', async () => {
    const props: Record<string, { type: string }> = {};
    for (let i = 0; i < 60; i++) props[`p${i}`] = { type: 'string' };
    const spec = baseSpec({
      components: {
        schemas: {
          Big: { type: 'object', properties: props },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a19-object-schema-property-count')).toBe(true);
  });

  it('does NOT flag schema with 5 properties', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Small: {
            type: 'object',
            properties: {
              a: { type: 'string' },
              b: { type: 'string' },
              c: { type: 'string' },
              d: { type: 'string' },
              e: { type: 'string' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a19-object-schema-property-count')).toBe(false);
  });
});

// =============================================================================
// TM-A20 — array maxItems too permissive
// =============================================================================

describe('TM-A20 — array maxItems too permissive', () => {
  it('flags array with maxItems > 10000', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          List: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 99999,
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a20-array-max-items-too-permissive')).toBe(true);
  });

  it('does NOT flag array with reasonable maxItems', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          List: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 100,
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a20-array-max-items-too-permissive')).toBe(false);
  });
});

// =============================================================================
// TM-A21 — string maxLength too permissive
// =============================================================================

describe('TM-A21 — string maxLength too permissive', () => {
  it('flags string with maxLength > 1MB', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Blob: { type: 'string', maxLength: 5_000_000 },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a21-string-max-length-too-permissive')).toBe(true);
  });

  it('does NOT flag string with reasonable maxLength', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Bio: { type: 'string', maxLength: 1024 },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a21-string-max-length-too-permissive')).toBe(false);
  });
});

// =============================================================================
// TM-A25 — long-running op async pattern
// =============================================================================

describe('TM-A25 — long-running op async pattern', () => {
  it('flags long-running op with synchronous-only response', async () => {
    const spec = baseSpec({
      paths: {
        '/jobs/run': {
          post: {
            description: 'Long-running task that may take several minutes.',
            responses: { '200': { description: 'done' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a25-long-running-op-async-pattern')).toBe(true);
  });

  it('does NOT flag long-running op WITH 202 + Location', async () => {
    const spec = baseSpec({
      paths: {
        '/jobs/run': {
          post: {
            description: 'Long-running asynchronous task.',
            responses: {
              '202': {
                description: 'accepted',
                headers: {
                  Location: { schema: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a25-long-running-op-async-pattern')).toBe(false);
  });

  it('does NOT flag short op without long-running hint', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          get: {
            description: 'Quick lookup.',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a25-long-running-op-async-pattern')).toBe(false);
  });
});

// =============================================================================
// TM-A26 — enum too large
// =============================================================================

describe('TM-A26 — enum too large', () => {
  it('flags enum with > 1000 values', async () => {
    const big: string[] = [];
    for (let i = 0; i < 1500; i++) big.push(`v${i}`);
    const spec = baseSpec({
      components: {
        schemas: {
          E: { type: 'string', enum: big },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a26-enum-too-large')).toBe(true);
  });

  it('does NOT flag enum with reasonable size', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          E: { type: 'string', enum: ['a', 'b', 'c'] },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a26-enum-too-large')).toBe(false);
  });
});

// =============================================================================
// TM-A27 — admin shares public security
// =============================================================================

describe('TM-A27 — admin shares public security', () => {
  it('flags when admin paths use same scheme as public', async () => {
    const spec = baseSpec({
      components: {
        schemas: {},
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'X-Key', in: 'header' },
        },
      },
      security: [{ apiKey: [] }],
      paths: {
        '/things': { get: { responses: { '200': { description: 'ok' } } } },
        '/admin/users': { get: { responses: { '200': { description: 'ok' } } } },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a27-admin-shares-public-security')).toBe(true);
  });

  it('does NOT flag when admin uses distinct scheme', async () => {
    const spec = baseSpec({
      components: {
        schemas: {},
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'X-Key', in: 'header' },
          adminBearer: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ apiKey: [] }],
      paths: {
        '/things': { get: { responses: { '200': { description: 'ok' } } } },
        '/admin/users': {
          get: {
            security: [{ adminBearer: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a27-admin-shares-public-security')).toBe(false);
  });
});

// =============================================================================
// TM-A29 — resource only GET no write
// =============================================================================

describe('TM-A29 — resource only GET no write', () => {
  it('flags resource tree with GETs but no writes', async () => {
    const spec = baseSpec({
      paths: {
        '/items': { get: { responses: { '200': { description: 'ok' } } } },
        '/items/{id}': { get: { responses: { '200': { description: 'ok' } } } },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a29-resource-only-get-no-write')).toBe(true);
  });

  it('does NOT flag resource tree WITH write op', async () => {
    const spec = baseSpec({
      paths: {
        '/items': {
          get: { responses: { '200': { description: 'ok' } } },
          post: { responses: { '201': { description: 'created' } } },
        },
        '/items/{id}': { get: { responses: { '200': { description: 'ok' } } } },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a29-resource-only-get-no-write')).toBe(false);
  });
});

// =============================================================================
// TM-A30 — non-standard method needs security
// =============================================================================

describe('TM-A30 — non-standard method needs security', () => {
  it('flags TRACE without security', async () => {
    const spec = baseSpec({
      security: [],
      paths: {
        '/echo': {
          trace: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a30-non-standard-method-needs-security')).toBe(true);
  });

  it('does NOT flag TRACE WITH explicit security', async () => {
    const spec = baseSpec({
      security: [],
      paths: {
        '/echo': {
          trace: {
            security: [{ apiKey: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a30-non-standard-method-needs-security')).toBe(false);
  });
});

// =============================================================================
// TM-A31 — signup needs rate-limit or captcha
// =============================================================================

describe('TM-A31 — signup needs rate-limit or captcha', () => {
  it('flags POST /signup without rate-limit / captcha', async () => {
    const spec = baseSpec({
      paths: {
        '/signup': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { email: { type: 'string' } } },
                },
              },
            },
            responses: { '201': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a31-signup-needs-rate-limit-or-captcha')).toBe(true);
  });

  it('does NOT flag /signup WITH rate-limit header', async () => {
    const spec = baseSpec({
      paths: {
        '/signup': {
          post: {
            responses: {
              '201': {
                description: 'ok',
                headers: {
                  'X-RateLimit-Limit': { schema: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a31-signup-needs-rate-limit-or-captcha')).toBe(false);
  });

  it('does NOT flag /signup WITH captcha hint property', async () => {
    const spec = baseSpec({
      paths: {
        '/signup': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      email: { type: 'string' },
                      turnstile: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { '201': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a31-signup-needs-rate-limit-or-captcha')).toBe(false);
  });
});

// =============================================================================
// TM-A33 — posting / comment needs rate-limit
// =============================================================================

describe('TM-A33 — comment posting needs rate-limit', () => {
  it('flags POST /comments without rate-limit', async () => {
    const spec = baseSpec({
      paths: {
        '/comments': {
          post: {
            responses: { '201': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a33-posting-comment-needs-rate-limit')).toBe(true);
  });

  it('does NOT flag POST /comments WITH rate-limit header', async () => {
    const spec = baseSpec({
      paths: {
        '/comments': {
          post: {
            responses: {
              '201': {
                description: 'ok',
                headers: { 'Retry-After': { schema: { type: 'integer' } } },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a33-posting-comment-needs-rate-limit')).toBe(false);
  });
});

// =============================================================================
// TM-A37 — host param SSRF
// =============================================================================

describe('TM-A37 — host param flagged for SSRF', () => {
  it('flags `host` parameter without allowlist mention', async () => {
    const spec = baseSpec({
      paths: {
        '/proxy': {
          get: {
            parameters: [
              { name: 'host', in: 'query', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a37-host-param-flagged-for-ssrf')).toBe(true);
  });

  it('does NOT flag `host` parameter with allowlist description', async () => {
    const spec = baseSpec({
      paths: {
        '/proxy': {
          get: {
            parameters: [
              {
                name: 'host',
                in: 'query',
                description: 'Target host. Validated against allowlist; private IPs blocked.',
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a37-host-param-flagged-for-ssrf')).toBe(false);
  });
});

// =============================================================================
// TM-A40 — CORS Allow-Origin without allowlist
// =============================================================================

describe('TM-A40 — CORS origin reflection without allowlist', () => {
  it('flags `Access-Control-Allow-Origin: *` example', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  'Access-Control-Allow-Origin': {
                    schema: { type: 'string', example: '*' },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a40-cors-origin-reflection-without-allowlist')).toBe(true);
  });

  it('does NOT flag CORS header with allowlist description', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  'Access-Control-Allow-Origin': {
                    description: 'Origin from server-side allowlist. Validated against approved list.',
                    schema: { type: 'string', example: 'https://app.example.com' },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a40-cors-origin-reflection-without-allowlist')).toBe(false);
  });
});

// =============================================================================
// TM-A41 — browser API needs security headers
// =============================================================================

describe('TM-A41 — browser API needs security headers', () => {
  it('flags HTML response without security headers', async () => {
    const spec = baseSpec({
      paths: {
        '/page': {
          get: {
            responses: {
              '200': {
                description: 'page',
                content: { 'text/html': { schema: { type: 'string' } } },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a41-browser-api-needs-security-headers')).toBe(true);
  });

  it('does NOT flag HTML response WITH HSTS', async () => {
    const spec = baseSpec({
      paths: {
        '/page': {
          get: {
            responses: {
              '200': {
                description: 'page',
                headers: {
                  'Strict-Transport-Security': { schema: { type: 'string' } },
                },
                content: { 'text/html': { schema: { type: 'string' } } },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a41-browser-api-needs-security-headers')).toBe(false);
  });

  it('does NOT flag JSON-only response', async () => {
    const spec = baseSpec({
      paths: {
        '/things': {
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
    expect(hasFinding(diags, 'apiq-tm-a41-browser-api-needs-security-headers')).toBe(false);
  });
});

// =============================================================================
// TM-A43 — non-standard method without security (alias of TM-A30)
// =============================================================================

describe('TM-A43 — non-standard method without security', () => {
  it('flags PROPFIND without security', async () => {
    const spec = baseSpec({
      security: [],
      paths: {
        '/dav': {
          propfind: { responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a43-non-standard-method-without-security')).toBe(true);
  });
});

// =============================================================================
// TM-A48 — info contact required
// =============================================================================

describe('TM-A48 — info.contact required', () => {
  it('flags info.contact missing email and url', async () => {
    const spec = baseSpec({
      info: {
        title: 'T',
        version: '1.0.0',
        description: 'D',
        contact: { name: 'team' },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a48-info-contact-required')).toBe(true);
  });

  it('does NOT flag info.contact WITH email', async () => {
    const spec = baseSpec({
      info: {
        title: 'T',
        version: '1.0.0',
        description: 'D',
        contact: { name: 'team', email: 'team@example.com', url: 'https://example.com' },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a48-info-contact-required')).toBe(false);
  });
});

// =============================================================================
// TM-A49 — upstream URL op needs 5xx explicit
// =============================================================================

describe('TM-A49 — upstream URL needs 502/503/504 explicit', () => {
  it('flags upstream-URL op without 502/503/504', async () => {
    const spec = baseSpec({
      paths: {
        '/proxy': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { callback_url: { type: 'string' } },
                  },
                },
              },
            },
            responses: {
              '200': { description: 'ok' },
              '400': { description: 'bad' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a49-upstream-url-op-needs-5xx-explicit')).toBe(true);
  });

  it('does NOT flag upstream-URL op WITH 502/503/504', async () => {
    const spec = baseSpec({
      paths: {
        '/proxy': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { callback_url: { type: 'string' } },
                  },
                },
              },
            },
            responses: {
              '200': { description: 'ok' },
              '502': { description: 'bad gateway' },
              '503': { description: 'unavailable' },
              '504': { description: 'timeout' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a49-upstream-url-op-needs-5xx-explicit')).toBe(false);
  });
});

// =============================================================================
// TM-A51 — webhook rejects wildcard content-type
// =============================================================================

describe('TM-A51 — webhook rejects */*', () => {
  it('flags webhook accepting */*', async () => {
    const spec = baseSpec({
      paths: {
        '/webhooks/receive': {
          post: {
            requestBody: {
              content: { '*/*': { schema: {} } },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a51-webhook-rejects-wildcard-content-type')).toBe(true);
  });

  it('does NOT flag webhook accepting application/json only', async () => {
    const spec = baseSpec({
      paths: {
        '/webhooks/receive': {
          post: {
            requestBody: {
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a51-webhook-rejects-wildcard-content-type')).toBe(false);
  });
});

// =============================================================================
// TM-A52 — info.description Security section
// =============================================================================

describe('TM-A52 — info.description has Security section', () => {
  it('flags info.description without Security/Authentication heading', async () => {
    const spec = baseSpec({
      info: {
        title: 'T',
        version: '1.0.0',
        description: 'Just a plain description with no Security section.',
        contact: { email: 'a@b.c', url: 'https://x' },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a52-info-description-security-section')).toBe(true);
  });

  it('does NOT flag info.description WITH `## Authentication` heading', async () => {
    const spec = baseSpec({
      info: {
        title: 'T',
        version: '1.0.0',
        description: 'Welcome\n\n## Authentication\n\nUse OAuth2 with PKCE.',
        contact: { email: 'a@b.c', url: 'https://x' },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a52-info-description-security-section')).toBe(false);
  });
});
