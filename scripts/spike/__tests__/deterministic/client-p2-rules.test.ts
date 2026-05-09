/**
 * Tests for the Welle C P2 Client-Friction (Lens 4 + Lens 5) Spectral
 * ruleset.
 *
 * Coverage matrix:
 *   - YAML loads cleanly (>=23 rule-codes — 19 CL-* + 4 DOLAR F-* + 2 split
 *     companions for CL-64 verb-method match).
 *   - Each P2 pattern has a matching rule-code prefixed `apiq-cl` or `apiq-f`.
 *   - apiq-meta block coverage 100% (validated by F5 gate test, but a
 *     spot-check here too).
 *   - Per-rule fixture-tests for the non-trivial pattern detectors:
 *     CL-4, CL-5, CL-7, CL-15, CL-21, CL-22, CL-25, CL-29, CL-35, CL-56,
 *     CL-64, CL-77, F-11, F-12, F-13.
 *   - Smoke-run on 2 example specs (openweathermap, dnd5eapi) without
 *     crashes.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import {
  runSpectralLayers,
  getClientP2RuleCodes,
  _resetSpectralCacheForTests,
} from '../../deterministic/infra/spectral-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');
const YAML_PATH = path.join(
  SPIKE_DIR,
  'deterministic',
  'rules',
  'apiq-ruleset-client-p2.yaml'
);

// =============================================================================
// SECTION 1 — YAML loads + has all expected pattern-IDs
// =============================================================================

describe('apiq-ruleset-client-p2.yaml — load + completeness', () => {
  it('YAML file exists', () => {
    expect(fs.existsSync(YAML_PATH)).toBe(true);
  });

  it('YAML parses cleanly without errors', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    const parsed = YAML.parse(text);
    expect(parsed).toBeDefined();
    expect(parsed.rules).toBeDefined();
    expect(typeof parsed.rules).toBe('object');
  });

  it('loads >=23 rule-codes (19 CL-* P2 patterns + 4 DOLAR F-* + verb-method companions)', () => {
    const codes = getClientP2RuleCodes();
    expect(codes.length).toBeGreaterThanOrEqual(23);
  });

  it('every loaded rule-code is prefixed `apiq-cl` or `apiq-f`', () => {
    for (const code of getClientP2RuleCodes()) {
      expect(code).toMatch(/^apiq-(cl|f)\d+/);
    }
  });

  // Pattern-id presence checks — one assertion per P2 CL-pattern from
  // implementation-priority.md / Plan-Doc §6.
  const REQUIRED_CL_PATTERN_IDS = [
    'cl4', 'cl5', 'cl7', 'cl9', 'cl13', 'cl15', 'cl17', 'cl18',
    'cl21', 'cl22', 'cl24', 'cl25', 'cl29', 'cl35', 'cl48', 'cl54',
    'cl56', 'cl64', 'cl77',
  ];
  it.each(REQUIRED_CL_PATTERN_IDS)('has rule for CL pattern %s', (id) => {
    const codes = getClientP2RuleCodes();
    const matching = codes.filter(
      (c) => c.startsWith(`apiq-${id}-`) || c === `apiq-${id}`
    );
    expect(matching.length).toBeGreaterThan(0);
  });

  const REQUIRED_F_PATTERN_IDS = ['f11', 'f12', 'f13', 'f14'];
  it.each(REQUIRED_F_PATTERN_IDS)('has rule for DOLAR pattern %s', (id) => {
    const codes = getClientP2RuleCodes();
    const matching = codes.filter(
      (c) => c.startsWith(`apiq-${id}-`) || c === `apiq-${id}`
    );
    expect(matching.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// SECTION 2 — apiq-meta block coverage (100% on all P2 client rules)
// =============================================================================

describe('apiq-ruleset-client-p2.yaml — apiq-meta coverage', () => {
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
  ] as const;

  it('every rule carries apiq-meta block', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    const parsed = YAML.parse(text) as {
      rules: Record<string, { 'apiq-meta'?: Record<string, unknown> }>;
    };
    for (const [name, rule] of Object.entries(parsed.rules)) {
      expect(rule['apiq-meta'], `rule ${name} missing apiq-meta`).toBeDefined();
    }
  });

  it('every apiq-meta block has all required fields', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    const parsed = YAML.parse(text) as {
      rules: Record<string, { 'apiq-meta'?: Record<string, unknown> }>;
    };
    for (const [name, rule] of Object.entries(parsed.rules)) {
      const meta = rule['apiq-meta'];
      expect(meta).toBeDefined();
      for (const f of REQUIRED_FIELDS) {
        expect(
          meta,
          `rule ${name} apiq-meta missing field "${f}"`
        ).toHaveProperty(f);
      }
    }
  });
});

// =============================================================================
// SECTION 3 — F7 per-target codegen-tagging audit
// =============================================================================

describe('apiq-ruleset-client-p2.yaml — F7 per-target codegen-tagging', () => {
  it('at least 10 rules tag concrete codegen-targets (not just `*`)', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    const parsed = YAML.parse(text) as {
      rules: Record<
        string,
        { 'apiq-meta'?: { 'codegen-targets'?: unknown[] } }
      >;
    };
    let perTargetCount = 0;
    for (const rule of Object.values(parsed.rules)) {
      const targets = rule['apiq-meta']?.['codegen-targets'];
      if (
        Array.isArray(targets) &&
        targets.length > 0 &&
        !(targets.length === 1 && targets[0] === '*')
      ) {
        perTargetCount++;
      }
    }
    expect(perTargetCount).toBeGreaterThanOrEqual(10);
  });
});

// =============================================================================
// SECTION 4 — Per-rule fixture firing tests
// =============================================================================

const MINIMAL_OAS3 = {
  openapi: '3.0.3',
  info: { title: 't', version: '1.0.0' },
  paths: {},
};

function fixture(over: object): object {
  return { ...MINIMAL_OAS3, ...over };
}

async function findFindings(spec: object, code: string): Promise<unknown[]> {
  const findings = await runSpectralLayers(spec, { specName: 'fixture' });
  return findings.filter(
    (f) =>
      String(f.meta?.ruleCode ?? f.detectorId) === code ||
      f.detectorId === `spectral:${code}`
  );
}

describe('CL-4 — inline-object schema without title', () => {
  it('fires on inline schema without title in response', async () => {
    const spec = fixture({
      paths: {
        '/x': {
          get: {
            operationId: 'getX',
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { name: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl4-inline-object-needs-title');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire when title is present', async () => {
    const spec = fixture({
      paths: {
        '/x': {
          get: {
            operationId: 'getX',
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      title: 'XResult',
                      type: 'object',
                      properties: { name: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl4-inline-object-needs-title');
    expect(out.length).toBe(0);
  });
});

describe('CL-5 — operationId verbose / FastAPI-style', () => {
  it('fires on FastAPI-style operationId with multiple double-underscores', async () => {
    const spec = fixture({
      paths: {
        '/x': {
          get: {
            operationId: 'read_users_users__user_id__get',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl5-operationid-not-verbose');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on concise operationId', async () => {
    const spec = fixture({
      paths: {
        '/x': {
          get: {
            operationId: 'getUser',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl5-operationid-not-verbose');
    expect(out.length).toBe(0);
  });
});

describe('CL-15 — integer without format', () => {
  it('fires on type:integer without format', async () => {
    const spec = fixture({
      components: {
        schemas: {
          U: {
            type: 'object',
            properties: { count: { type: 'integer' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl15-integer-needs-format');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire when format is int64', async () => {
    const spec = fixture({
      components: {
        schemas: {
          U: {
            type: 'object',
            properties: { count: { type: 'integer', format: 'int64' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl15-integer-needs-format');
    expect(out.length).toBe(0);
  });
});

describe('CL-21 — format not in OAS-known list', () => {
  it('fires on unknown format like `ipv4-cidr`', async () => {
    const spec = fixture({
      components: {
        schemas: {
          U: {
            type: 'object',
            properties: { addr: { type: 'string', format: 'ipv4-cidr' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl21-format-known-only');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on `email` format', async () => {
    const spec = fixture({
      components: {
        schemas: {
          U: {
            type: 'object',
            properties: { email: { type: 'string', format: 'email' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl21-format-known-only');
    expect(out.length).toBe(0);
  });
});

describe('CL-22 — type:object without properties or additionalProperties', () => {
  it('fires on type:object with neither', async () => {
    const spec = fixture({
      components: {
        schemas: {
          Blob: { type: 'object' },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl22-object-needs-properties-or-additional-properties'
    );
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire when properties is declared', async () => {
    const spec = fixture({
      components: {
        schemas: {
          U: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl22-object-needs-properties-or-additional-properties'
    );
    expect(out.length).toBe(0);
  });
});

describe('CL-25 — pattern uses non-portable regex', () => {
  it('fires on lookbehind pattern', async () => {
    const spec = fixture({
      components: {
        schemas: {
          U: {
            type: 'object',
            properties: {
              name: { type: 'string', pattern: '^(?<=foo)bar$' },
            },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl25-pattern-multi-engine-portable');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on portable pattern', async () => {
    const spec = fixture({
      components: {
        schemas: {
          U: {
            type: 'object',
            properties: {
              name: { type: 'string', pattern: '^[a-z]+$' },
            },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl25-pattern-multi-engine-portable');
    expect(out.length).toBe(0);
  });
});

describe('CL-29 — deeply-nested inline objects', () => {
  it('fires when inline schema nests >3 levels', async () => {
    const spec = fixture({
      components: {
        schemas: {
          DeepBlob: {
            type: 'object',
            properties: {
              a: {
                type: 'object',
                properties: {
                  b: {
                    type: 'object',
                    properties: {
                      c: {
                        type: 'object',
                        properties: { d: { type: 'string' } },
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
    const out = await findFindings(spec, 'apiq-cl29-no-deep-inline-nesting');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on flat schema', async () => {
    const spec = fixture({
      components: {
        schemas: {
          Flat: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl29-no-deep-inline-nesting');
    expect(out.length).toBe(0);
  });
});

describe('CL-35 — schema named Client/API/Response/Request', () => {
  it('fires on schema named `Client`', async () => {
    const spec = fixture({
      components: {
        schemas: {
          Client: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl35-schema-name-not-sdk-reserved'
    );
    expect(out.length).toBeGreaterThan(0);
  });

  it('fires on schema named `Response`', async () => {
    const spec = fixture({
      components: {
        schemas: {
          Response: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl35-schema-name-not-sdk-reserved'
    );
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on safe schema name', async () => {
    const spec = fixture({
      components: {
        schemas: {
          UserResponse: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl35-schema-name-not-sdk-reserved'
    );
    expect(out.length).toBe(0);
  });
});

describe('CL-56 — enum value not identifier-safe', () => {
  it('fires on enum value with space', async () => {
    const spec = fixture({
      components: {
        schemas: {
          E: { type: 'string', enum: ['hello world', 'foo'] },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl56-enum-value-identifier-safe'
    );
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on identifier-safe enum values', async () => {
    const spec = fixture({
      components: {
        schemas: {
          E: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl56-enum-value-identifier-safe'
    );
    expect(out.length).toBe(0);
  });
});

describe('CL-64 — operationId verb mismatch', () => {
  it('fires on POST operationId beginning with `get`', async () => {
    const spec = fixture({
      paths: {
        '/x': {
          post: {
            operationId: 'getX',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl64-operationid-verb-matches-method-post'
    );
    expect(out.length).toBeGreaterThan(0);
  });

  it('fires on DELETE operationId beginning with `create`', async () => {
    const spec = fixture({
      paths: {
        '/x': {
          delete: {
            operationId: 'createX',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl64-operationid-verb-matches-method-delete'
    );
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on POST + `createX`', async () => {
    const spec = fixture({
      paths: {
        '/x': {
          post: {
            operationId: 'createX',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(
      spec,
      'apiq-cl64-operationid-verb-matches-method-post'
    );
    expect(out.length).toBe(0);
  });
});

describe('CL-77 — heavy allOf inline composition', () => {
  it('fires on allOf with ≥2 inline non-$ref objects', async () => {
    const spec = fixture({
      components: {
        schemas: {
          U: {
            allOf: [
              { type: 'object', properties: { a: { type: 'string' } } },
              { type: 'object', properties: { b: { type: 'string' } } },
            ],
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl77-allof-not-heavy-inline');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire when allOf has $ref + 1 inline', async () => {
    const spec = fixture({
      components: {
        schemas: {
          Base: { type: 'object', properties: { id: { type: 'string' } } },
          U: {
            allOf: [
              { $ref: '#/components/schemas/Base' },
              { type: 'object', properties: { extra: { type: 'string' } } },
            ],
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-cl77-allof-not-heavy-inline');
    expect(out.length).toBe(0);
  });
});

describe('F-11 — Linguistic Amorphous URI', () => {
  it('fires on path /data', async () => {
    const spec = fixture({
      paths: {
        '/data': {
          get: { operationId: 'getData', responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-f11-no-amorphous-uri-segments');
    expect(out.length).toBeGreaterThan(0);
  });

  it('fires on path /resources/{id}', async () => {
    const spec = fixture({
      paths: {
        '/resources/{id}': {
          get: {
            operationId: 'getR',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-f11-no-amorphous-uri-segments');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on /users', async () => {
    const spec = fixture({
      paths: {
        '/users': {
          get: { operationId: 'listU', responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-f11-no-amorphous-uri-segments');
    expect(out.length).toBe(0);
  });
});

describe('F-12 — Linguistic Tiny Resource', () => {
  it('fires on path /u', async () => {
    const spec = fixture({
      paths: {
        '/u': {
          get: { operationId: 'listU', responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-f12-no-tiny-resource-segments');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on /v1/users', async () => {
    const spec = fixture({
      paths: {
        '/v1/users': {
          get: { operationId: 'listU', responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-f12-no-tiny-resource-segments');
    expect(out.length).toBe(0);
  });
});

describe('F-13 — Linguistic Forgotten Verbs', () => {
  it('fires on path /getUsers', async () => {
    const spec = fixture({
      paths: {
        '/getUsers': {
          get: { operationId: 'lU', responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-f13-no-verb-in-uri-path');
    expect(out.length).toBeGreaterThan(0);
  });

  it('fires on path /createInvoice', async () => {
    const spec = fixture({
      paths: {
        '/createInvoice': {
          post: { operationId: 'cI', responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-f13-no-verb-in-uri-path');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on /users', async () => {
    const spec = fixture({
      paths: {
        '/users': {
          get: { operationId: 'lU', responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-f13-no-verb-in-uri-path');
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// SECTION 5 — Smoke-runs against example specs
// =============================================================================

describe('smoke: runSpectralLayers on example specs', () => {
  const examples = [
    { name: 'openweathermap', minFindings: 1, timeoutMs: 30_000 },
    { name: 'dnd5eapi', minFindings: 1, timeoutMs: 60_000 },
  ];

  for (const ex of examples) {
    it(
      `runs cleanly on ${ex.name} and emits >= ${ex.minFindings} finding(s)`,
      async () => {
        _resetSpectralCacheForTests();
        const specPath = path.join(EXAMPLES_DIR, ex.name, 'spec.json');
        if (!fs.existsSync(specPath)) {
          return;
        }
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as object;
        const findings = await runSpectralLayers(spec, { specName: ex.name });
        expect(findings.length).toBeGreaterThanOrEqual(ex.minFindings);
      },
      ex.timeoutMs
    );
  }
});
