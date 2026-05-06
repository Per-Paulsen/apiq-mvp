/**
 * Tests for the P1 Threat-Modeling Spectral ruleset (T16a, Welle B).
 *
 * Loads `apiq-ruleset-threat-p1.yaml` plus custom functions from
 * `spectral-functions/threat-p1-functions.ts`, builds an isolated Spectral
 * instance, and runs synthetic specs covering each rule's positive (violation)
 * and negative (compliant) case.
 *
 * Coverage matrix (≥ 50 cases, target ≥ 25 rules):
 *   Y-2, Y-3, Y-4, Y-5, Y-7, Y-17, Y-23, TM-A6, TM-A10, TM-A11, TM-A15,
 *   TM-A17, TM-A22, TM-A23, TM-A24, TM-A32, TM-A34, TM-A38, TM-A39, TM-A42,
 *   TM-A44, TM-A53.
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
  listEndpointHasPagination,
  sensitiveFlowNeedsRateLimitHeaders,
  corsCredentialsWildcardConflict,
  responseHasWwwAuthenticateHeader,
} from '../../deterministic/spectral-functions/threat-p1-functions.js';

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
  'apiq-ruleset-threat-p1.yaml'
);

// =============================================================================
// Ruleset YAML → RulesetDefinition compiler (mirrors spectral-runner.ts)
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
  listEndpointHasPagination,
  sensitiveFlowNeedsRateLimitHeaders,
  corsCredentialsWildcardConflict,
  responseHasWwwAuthenticateHeader,
};

function buildThreatP1Ruleset(
  yamlText: string,
  extraRules: Record<string, unknown> = {}
): RulesetDefinition {
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
        console.warn(`[threat-p1-test] rule "${code}" function "${fnName}" not callable; skipping`);
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

  // Merge extra (custom-function) rules registered programmatically.
  Object.assign(rulesAcc, extraRules);

  return {
    extends: [oas3Ruleset as unknown as RulesetDefinition],
    rules: rulesAcc,
  } as unknown as RulesetDefinition;
}

// Custom-function rules — built programmatically because YAML compiler
// would need extension to support custom-function references. These mirror
// the placeholder comments in the YAML (TM-A22, TM-A32, TM-A39, TM-A53).
function buildCustomFunctionRules(): Record<string, unknown> {
  return {
    'apiq-tm-a22-list-endpoint-pagination': {
      description:
        'GET endpoints returning array bodies should declare a pagination query parameter (limit/per_page/page_size/page/cursor) — OWASP API4 + 42Crunch + Stripe.',
      message: '{{error}}',
      severity: 1, // warn
      given: '$.paths[*][get]',
      then: { function: listEndpointHasPagination },
    },
    'apiq-tm-a32-sensitive-flow-rate-limit-headers': {
      description:
        'Sensitive business-flow operations (purchase/checkout/order/booking/payment) MUST declare rate-limit headers (X-RateLimit-* / RateLimit-* / Retry-After) — OWASP API6.',
      message: '{{error}}',
      severity: 0, // error
      given: '$.paths[*][post,put,patch]',
      then: { function: sensitiveFlowNeedsRateLimitHeaders },
    },
    'apiq-tm-a39-cors-credentials-wildcard-conflict': {
      description:
        'CORS Allow-Credentials: true combined with Allow-Origin: * is rejected by browsers (CORS spec) — OWASP CORS WSTG.',
      message: '{{error}}',
      severity: 0, // error
      given: '$..responses[*]',
      then: { function: corsCredentialsWildcardConflict },
    },
    'apiq-tm-a53-401-www-authenticate': {
      description:
        '401 responses MUST declare a WWW-Authenticate header (RFC 9110 §11.6.1 verbatim "MUST send").',
      message: '{{error}}',
      severity: 0, // error
      given: '$.paths[*][*]',
      then: { function: responseHasWwwAuthenticateHeader },
    },
  };
}

// =============================================================================
// Run helper
// =============================================================================

let cachedSpectral: SpectralCore.Spectral | null = null;

function getSpectral(): SpectralCore.Spectral {
  if (cachedSpectral) return cachedSpectral;
  const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
  const ruleset = buildThreatP1Ruleset(yamlText, buildCustomFunctionRules());
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

function hasFinding(
  diags: ISpectralDiagnostic[],
  ruleCode: string
): boolean {
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
      'A long enough description for info-description rules so we can isolate threat-p1 findings.',
  },
  servers: [{ url: 'https://api.example.com' }],
  paths: {},
  components: { schemas: {}, securitySchemes: {} },
  ...overrides,
});

// =============================================================================
// Tests — Sanity
// =============================================================================

describe('threat-p1 ruleset bootstrap', () => {
  it('loads the YAML ruleset without crashing', () => {
    expect(fs.existsSync(RULESET_PATH)).toBe(true);
    const yamlText = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(yamlText) as YamlRuleset;
    expect(parsed.rules).toBeDefined();
    expect(Object.keys(parsed.rules).length).toBeGreaterThanOrEqual(15);
  });

  it('builds a Spectral instance with all rules registered', () => {
    const spectral = getSpectral();
    expect(spectral).toBeDefined();
  });
});

// =============================================================================
// Y-2 — API key in URL (path/query)
// =============================================================================

describe('Y-2 — API key in URL', () => {
  it('flags `api_key` query parameter on a path', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            parameters: [
              { name: 'api_key', in: 'query', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y2-api-key-in-url')).toBe(true);
  });

  it('flags `password` path parameter', async () => {
    const spec = baseSpec({
      paths: {
        '/login/{password}': {
          get: {
            parameters: [
              {
                name: 'password',
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
    expect(hasFinding(diags, 'apiq-tm-y2-api-key-in-url')).toBe(true);
  });

  it('does NOT flag `Authorization` header parameter (header is fine)', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            parameters: [
              {
                name: 'Authorization',
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
    expect(hasFinding(diags, 'apiq-tm-y2-api-key-in-url')).toBe(false);
  });

  it('does NOT flag a normal `id` query parameter', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            parameters: [
              { name: 'id', in: 'query', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y2-api-key-in-url')).toBe(false);
  });
});

// =============================================================================
// Y-3 — Credentials in path-template
// =============================================================================

describe('Y-3 — Credentials in path-template', () => {
  it('flags `/auth/{token}` path-template', async () => {
    const spec = baseSpec({
      paths: {
        '/auth/{token}': {
          get: {
            parameters: [
              {
                name: 'token',
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
    expect(hasFinding(diags, 'apiq-tm-y3-credentials-in-path-template')).toBe(
      true
    );
  });

  it('does NOT flag `/users/{id}` path-template', async () => {
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
    expect(hasFinding(diags, 'apiq-tm-y3-credentials-in-path-template')).toBe(
      false
    );
  });
});

// =============================================================================
// Y-4 — HTTP-Basic on insecure (http://) server
// =============================================================================

describe('Y-4 — HTTP-Basic on insecure server', () => {
  it('flags plain http:// production server', async () => {
    const spec = baseSpec({
      servers: [{ url: 'http://api.example.com' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y4-http-basic-on-insecure-server')).toBe(
      true
    );
  });

  it('does NOT flag http://localhost:3000', async () => {
    const spec = baseSpec({
      servers: [{ url: 'http://localhost:3000' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y4-http-basic-on-insecure-server')).toBe(
      false
    );
  });

  it('does NOT flag https:// server', async () => {
    const spec = baseSpec({
      servers: [{ url: 'https://api.example.com' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y4-http-basic-on-insecure-server')).toBe(
      false
    );
  });
});

// =============================================================================
// Y-5 — OAuth2 *Url HTTPS-only
// =============================================================================

describe('Y-5 — OAuth2 *Url HTTPS-only', () => {
  it('flags http:// authorizationUrl', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'http://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                scopes: { read: 'read scope' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y5-oauth2-authorization-url-https')).toBe(
      true
    );
  });

  it('flags http:// tokenUrl', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              clientCredentials: {
                tokenUrl: 'http://auth.example.com/token',
                scopes: { read: 'read scope' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y5-oauth2-token-url-https')).toBe(true);
  });

  it('does NOT flag https:// URLs', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                refreshUrl: 'https://auth.example.com/refresh',
                scopes: { read: 'read scope' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y5-oauth2-authorization-url-https')).toBe(
      false
    );
    expect(hasFinding(diags, 'apiq-tm-y5-oauth2-token-url-https')).toBe(false);
  });
});

// =============================================================================
// Y-7 — OAuth2 implicit + password flows forbidden
// =============================================================================

describe('Y-7 — OAuth2 implicit/password flows forbidden', () => {
  it('flags implicit flow', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              implicit: {
                authorizationUrl: 'https://auth.example.com/authorize',
                scopes: { read: 'read scope' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y7-oauth2-implicit-flow-forbidden')).toBe(
      true
    );
  });

  it('flags password flow', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              password: {
                tokenUrl: 'https://auth.example.com/token',
                scopes: { read: 'read scope' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y7-oauth2-password-flow-forbidden')).toBe(
      true
    );
  });

  it('does NOT flag authorizationCode flow', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                scopes: { read: 'read scope' },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y7-oauth2-implicit-flow-forbidden')).toBe(
      false
    );
    expect(hasFinding(diags, 'apiq-tm-y7-oauth2-password-flow-forbidden')).toBe(
      false
    );
  });
});

// =============================================================================
// Y-17 — Server URLs HTTPS-only (warn)
// =============================================================================

describe('Y-17 — Server HTTPS-only', () => {
  it('flags http:// production server (warn)', async () => {
    const spec = baseSpec({
      servers: [{ url: 'http://api.example.com' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y17-server-url-https-only')).toBe(true);
  });

  it('does NOT flag https:// server', async () => {
    const spec = baseSpec({
      servers: [{ url: 'https://api.example.com' }],
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y17-server-url-https-only')).toBe(false);
  });
});

// =============================================================================
// Y-23 — Write operations need security
// =============================================================================

describe('Y-23 — Write operations need security', () => {
  it('flags POST without security', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': { schema: { type: 'object' } },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y23-write-op-needs-security')).toBe(true);
  });

  it('does NOT flag POST with operation-level security', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          post: {
            security: [{ apiKey: [] }],
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-y23-write-op-needs-security')).toBe(false);
  });
});

// =============================================================================
// TM-A6 — OpenIdConnect URL HTTPS
// =============================================================================

describe('TM-A6 — OpenIdConnect URL HTTPS', () => {
  it('flags http:// openIdConnectUrl', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oidc: {
            type: 'openIdConnect',
            openIdConnectUrl: 'http://auth.example.com/.well-known/openid-configuration',
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a6-openid-connect-url-https')).toBe(true);
  });

  it('does NOT flag https:// openIdConnectUrl', async () => {
    const spec = baseSpec({
      components: {
        securitySchemes: {
          oidc: {
            type: 'openIdConnect',
            openIdConnectUrl: 'https://auth.example.com/.well-known/openid-configuration',
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a6-openid-connect-url-https')).toBe(false);
  });
});

// =============================================================================
// TM-A10 — Bearer token in URL
// =============================================================================

describe('TM-A10 — Bearer token in URL', () => {
  it('flags query parameter described as bearer-token', async () => {
    const spec = baseSpec({
      paths: {
        '/secure': {
          get: {
            parameters: [
              {
                name: 'auth',
                in: 'query',
                description: 'Bearer token for authentication',
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a10-bearer-token-in-url')).toBe(true);
  });

  it('does NOT flag header parameter described as bearer-token', async () => {
    const spec = baseSpec({
      paths: {
        '/secure': {
          get: {
            parameters: [
              {
                name: 'Authorization',
                in: 'header',
                description: 'Bearer token for authentication',
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a10-bearer-token-in-url')).toBe(false);
  });
});

// =============================================================================
// TM-A11 — Mass-assignment field names
// =============================================================================

describe('TM-A11 — Mass-assignment fields', () => {
  it('flags `is_admin` in request body', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          post: {
            security: [{ apiKey: [] }],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      is_admin: { type: 'boolean' },
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
    expect(hasFinding(diags, 'apiq-tm-a11-mass-assignment-fields')).toBe(true);
  });

  it('does NOT flag `is_admin` if marked readOnly', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          post: {
            security: [{ apiKey: [] }],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      is_admin: { type: 'boolean', readOnly: true },
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
    expect(hasFinding(diags, 'apiq-tm-a11-mass-assignment-fields')).toBe(false);
  });
});

// =============================================================================
// TM-A15 — PII fields in response
// =============================================================================

describe('TM-A15 — PII fields in response', () => {
  it('flags `ssn` field in response', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          get: {
            security: [{ apiKey: [] }],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        ssn: { type: 'string' },
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
    expect(hasFinding(diags, 'apiq-tm-a15-pii-named-fields-response')).toBe(true);
  });

  it('does NOT flag a normal `name` field in response', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          get: {
            security: [{ apiKey: [] }],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
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
    expect(hasFinding(diags, 'apiq-tm-a15-pii-named-fields-response')).toBe(false);
  });
});

// =============================================================================
// TM-A17 — additionalProperties:true on request body
// =============================================================================

describe('TM-A17 — additionalProperties:true on request body', () => {
  it('flags `additionalProperties: true` on request schema', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          post: {
            security: [{ apiKey: [] }],
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: true },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a17-additional-properties-true-request')).toBe(true);
  });

  it('does NOT flag `additionalProperties: false`', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          post: {
            security: [{ apiKey: [] }],
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: false },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a17-additional-properties-true-request')).toBe(false);
  });
});

// =============================================================================
// TM-A22 — List-endpoint pagination (custom function)
// =============================================================================

describe('TM-A22 — List-endpoint pagination', () => {
  it('flags GET returning array body without pagination', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { type: 'object' },
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
    expect(hasFinding(diags, 'apiq-tm-a22-list-endpoint-pagination')).toBe(true);
  });

  it('does NOT flag GET with `limit` query param', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            parameters: [
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', maximum: 100 },
              },
            ],
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a22-list-endpoint-pagination')).toBe(false);
  });

  it('does NOT flag GET that does not return an array', async () => {
    const spec = baseSpec({
      paths: {
        '/users/{id}': {
          get: {
            security: [{ apiKey: [] }],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': { schema: { type: 'object' } },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a22-list-endpoint-pagination')).toBe(false);
  });
});

// =============================================================================
// TM-A23 — Pagination param needs maximum
// =============================================================================

describe('TM-A23 — Pagination param needs maximum', () => {
  it('flags `limit` query param without maximum', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
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
    expect(hasFinding(diags, 'apiq-tm-a23-pagination-param-needs-maximum')).toBe(true);
  });

  it('does NOT flag `limit` with maximum', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            parameters: [
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', maximum: 100 },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a23-pagination-param-needs-maximum')).toBe(false);
  });
});

// =============================================================================
// TM-A24 — Binary upload needs maxLength
// =============================================================================

describe('TM-A24 — Binary upload needs maxLength', () => {
  it('flags binary schema without maxLength', async () => {
    const spec = baseSpec({
      paths: {
        '/upload': {
          post: {
            security: [{ apiKey: [] }],
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      file: { type: 'string', format: 'binary' },
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
    expect(hasFinding(diags, 'apiq-tm-a24-binary-upload-needs-maxlength')).toBe(true);
  });

  it('does NOT flag binary schema with maxLength', async () => {
    const spec = baseSpec({
      paths: {
        '/upload': {
          post: {
            security: [{ apiKey: [] }],
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      file: {
                        type: 'string',
                        format: 'binary',
                        maxLength: 10485760,
                      },
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
    expect(hasFinding(diags, 'apiq-tm-a24-binary-upload-needs-maxlength')).toBe(false);
  });
});

// =============================================================================
// TM-A32 — Sensitive flow rate-limit headers (custom function)
// =============================================================================

describe('TM-A32 — Sensitive flow rate-limit headers', () => {
  it('flags POST /checkout without rate-limit headers', async () => {
    const spec = baseSpec({
      paths: {
        '/checkout': {
          post: {
            security: [{ apiKey: [] }],
            summary: 'Place an order',
            responses: {
              '200': {
                description: 'ok',
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a32-sensitive-flow-rate-limit-headers')).toBe(true);
  });

  it('does NOT flag POST /checkout WITH rate-limit headers', async () => {
    const spec = baseSpec({
      paths: {
        '/checkout': {
          post: {
            security: [{ apiKey: [] }],
            summary: 'Place an order',
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
    expect(hasFinding(diags, 'apiq-tm-a32-sensitive-flow-rate-limit-headers')).toBe(false);
  });

  it('does NOT flag a non-sensitive flow (POST /comments)', async () => {
    const spec = baseSpec({
      paths: {
        '/comments': {
          post: {
            security: [{ apiKey: [] }],
            summary: 'Add a comment',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a32-sensitive-flow-rate-limit-headers')).toBe(false);
  });
});

// =============================================================================
// TM-A34 — URL-handling property format+pattern
// =============================================================================

describe('TM-A34 — URL-handling property format+pattern', () => {
  it('flags `webhook_url` without format+pattern', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          WebhookConfig: {
            type: 'object',
            properties: {
              webhook_url: { type: 'string' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a34-url-property-format-and-pattern')).toBe(true);
  });

  it('does NOT flag webhook_url with format:uri AND pattern', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          WebhookConfig: {
            type: 'object',
            properties: {
              webhook_url: {
                type: 'string',
                format: 'uri',
                pattern: '^https://[a-zA-Z0-9.-]+\\.example\\.com/.*$',
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a34-url-property-format-and-pattern')).toBe(false);
  });
});

// =============================================================================
// TM-A38 — CORS Allow-Origin: * literal
// =============================================================================

describe('TM-A38 — CORS Allow-Origin wildcard', () => {
  it('flags response header with literal `*` example', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
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
    expect(hasFinding(diags, 'apiq-tm-a38-cors-allow-origin-wildcard')).toBe(true);
  });

  it('does NOT flag response header with allowlisted origin example', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  'Access-Control-Allow-Origin': {
                    schema: {
                      type: 'string',
                      example: 'https://app.example.com',
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
    expect(hasFinding(diags, 'apiq-tm-a38-cors-allow-origin-wildcard')).toBe(false);
  });
});

// =============================================================================
// TM-A39 — CORS credentials+wildcard conflict (custom function)
// =============================================================================

describe('TM-A39 — CORS credentials+wildcard conflict', () => {
  it('flags response with both Allow-Credentials:true and Allow-Origin:*', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  'Access-Control-Allow-Credentials': {
                    schema: { type: 'boolean', example: true },
                  },
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
    expect(hasFinding(diags, 'apiq-tm-a39-cors-credentials-wildcard-conflict')).toBe(true);
  });

  it('does NOT flag response with credentials:true but allowlisted origin', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            responses: {
              '200': {
                description: 'ok',
                headers: {
                  'Access-Control-Allow-Credentials': {
                    schema: { type: 'boolean', example: true },
                  },
                  'Access-Control-Allow-Origin': {
                    schema: {
                      type: 'string',
                      example: 'https://app.example.com',
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
    expect(hasFinding(diags, 'apiq-tm-a39-cors-credentials-wildcard-conflict')).toBe(false);
  });
});

// =============================================================================
// TM-A42 — Error-schema with stack/trace
// =============================================================================

describe('TM-A42 — Error schema with stack/trace', () => {
  it('flags error schema with `stack_trace` field', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              stack_trace: { type: 'string' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a42-error-schema-no-stack-trace')).toBe(true);
  });

  it('does NOT flag a clean error schema', async () => {
    const spec = baseSpec({
      components: {
        schemas: {
          Error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a42-error-schema-no-stack-trace')).toBe(false);
  });
});

// =============================================================================
// TM-A44 — Debug paths
// =============================================================================

describe('TM-A44 — No debug paths', () => {
  it('flags `/debug` path', async () => {
    const spec = baseSpec({
      paths: {
        '/debug': {
          get: {
            security: [{ apiKey: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a44-no-debug-paths')).toBe(true);
  });

  it('flags `/internal/health` path', async () => {
    const spec = baseSpec({
      paths: {
        '/internal/health': {
          get: {
            security: [{ apiKey: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a44-no-debug-paths')).toBe(true);
  });

  it('does NOT flag `/users` path', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a44-no-debug-paths')).toBe(false);
  });
});

// =============================================================================
// TM-A53 — 401 → WWW-Authenticate (custom function)
// =============================================================================

describe('TM-A53 — 401 → WWW-Authenticate', () => {
  it('flags 401 response without WWW-Authenticate header', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            responses: {
              '200': { description: 'ok' },
              '401': { description: 'Unauthorized' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a53-401-www-authenticate')).toBe(true);
  });

  it('does NOT flag 401 response WITH WWW-Authenticate header', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            responses: {
              '200': { description: 'ok' },
              '401': {
                description: 'Unauthorized',
                headers: {
                  'WWW-Authenticate': {
                    description: 'Auth challenge',
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a53-401-www-authenticate')).toBe(false);
  });

  it('does NOT flag operation without 401', async () => {
    const spec = baseSpec({
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }],
            responses: {
              '200': { description: 'ok' },
            },
          },
        },
      },
    });
    const diags = await runOn(spec);
    expect(hasFinding(diags, 'apiq-tm-a53-401-www-authenticate')).toBe(false);
  });
});

// =============================================================================
// Smoke test — run on real example specs
// =============================================================================

describe('smoke test on real example specs', () => {
  const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');
  // Small specs: always run. Stripe + GitHub-rest are MULTI-MB and the OAS3
  // default ruleset that we extend takes 2-15 min per spec on those — gate
  // them behind an env-var so CI default-runs the small sanity case only.
  const SMALL_SPECS = ['dnd5eapi', 'pagerduty'];
  const BIG_SPECS = ['stripe', 'github-rest'];

  beforeAll(() => {
    // Sanity: examples directory exists.
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
        // No assertion on count — real specs vary widely; we just need
        // the run to complete.
      },
      300_000
    );
  }

  // Big specs: opt-in via APIQ_SMOKE_BIG=1 so default `npm test` stays fast.
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
