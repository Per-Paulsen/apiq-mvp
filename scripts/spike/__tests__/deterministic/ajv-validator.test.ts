/**
 * Tests for the Stage-A AJV validator detector.
 *
 * Each detection mechanism is exercised with ≥ 3 hand-crafted spec fragments
 * plus a smoke test that the four production specs (stripe-full,
 * pagerduty-full, dnd5eapi, github-rest) don't crash the module.
 *
 * The "qualitative-output sanity" smoke is loose by design — its purpose is
 * regression-safety, not coverage measurement. Coverage measurement happens
 * via the eval harness (eval/stage-a-validation.ts) elsewhere.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runAjvValidator, __test } from '../../deterministic/modules/ajv-validator.js';
import { mapDetectorFindings } from '../../deterministic/infra/output-mapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// __tests__/deterministic → up 3 levels = repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

const SPECS = ['stripe-full', 'pagerduty-full', 'dnd5eapi', 'github-rest'];

function loadSpec(name: string): object {
  const p = path.join(EXAMPLES_DIR, name, 'spec.json');
  if (!fs.existsSync(p)) {
    throw new Error(`Fixture spec missing: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ---------------------------------------------------------------------------
// Detection 1 — schema-compilation failures
// ---------------------------------------------------------------------------

describe('ajv-validator — schema-compilation-fail', () => {
  it('flags a schema with a malformed regex pattern', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          Bad: {
            type: 'string',
            pattern: '^([a-z+', // malformed — unterminated group
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const compFails = findings.filter((f) => f.detectorId === 'ajv:schema-compilation-fail');
    expect(compFails.length).toBeGreaterThanOrEqual(1);
    expect(compFails[0].sourcePath).toContain('/components/schemas/Bad');
    expect(compFails[0].severity).toBe('high');
    expect(compFails[0].category).toBe('correctness');
  });

  it('flags a schema with an invalid type keyword', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          Typo: {
            type: 'strnig', // typo — not a valid JSON-Schema type
            properties: { x: { type: 'string' } },
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const compFails = findings.filter((f) => f.detectorId === 'ajv:schema-compilation-fail');
    expect(compFails.length).toBeGreaterThanOrEqual(1);
    expect(compFails.some((f) => f.sourcePath?.includes('Typo'))).toBe(true);
  });

  it('does not flag a well-formed schema', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          Good: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              age: { type: 'integer', minimum: 0 },
            },
            required: ['id'],
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const compFails = findings.filter((f) => f.detectorId === 'ajv:schema-compilation-fail');
    expect(compFails).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Detection 2 — example-validation failures
// ---------------------------------------------------------------------------

describe('ajv-validator — example-validation-fail', () => {
  it('flags a media-type example whose value violates its schema', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { age: { type: 'integer' } },
                  },
                  example: { age: 'twenty' }, // wrong type
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const exFails = findings.filter((f) => f.detectorId === 'ajv:example-validation-fail');
    expect(exFails.length).toBeGreaterThanOrEqual(1);
    expect(exFails[0].sourcePath).toContain('/example');
  });

  it('flags an entry in a multi-example map (deeper than spectral)', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { type: 'string', enum: ['a', 'b'] },
                    examples: {
                      good: { value: 'a' },
                      bad: { value: 'c' }, // not in enum
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const exFails = findings.filter((f) => f.detectorId === 'ajv:example-validation-fail');
    expect(exFails.some((f) => f.meta?.exampleName === 'bad')).toBe(true);
    expect(exFails.some((f) => f.meta?.exampleName === 'good')).toBe(false);
  });

  it('flags inline `example` keyword on a schema', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          Email: {
            type: 'string',
            format: 'email',
            minLength: 5,
            example: 'a', // too short
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const exFails = findings.filter((f) => f.detectorId === 'ajv:example-validation-fail');
    expect(exFails.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag an example that satisfies its schema', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { n: { type: 'integer' } } },
                    example: { n: 42 },
                  },
                },
              },
            },
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const exFails = findings.filter((f) => f.detectorId === 'ajv:example-validation-fail');
    expect(exFails).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Detection 3 — default-validation failures
// ---------------------------------------------------------------------------

describe('ajv-validator — default-validation-fail', () => {
  it('flags a default whose type does not match the declared type', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          C: {
            type: 'integer',
            default: 'not-a-number',
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const defFails = findings.filter((f) => f.detectorId === 'ajv:default-validation-fail');
    expect(defFails.length).toBeGreaterThanOrEqual(1);
  });

  it('flags a default deep inside a nested object property', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          Outer: {
            type: 'object',
            properties: {
              inner: {
                type: 'object',
                properties: {
                  count: {
                    type: 'integer',
                    minimum: 0,
                    default: -5, // violates minimum
                  },
                },
              },
            },
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const defFails = findings.filter((f) => f.detectorId === 'ajv:default-validation-fail');
    expect(defFails.length).toBeGreaterThanOrEqual(1);
    // Should locate the deep pointer
    expect(defFails.some((f) => f.sourcePath?.includes('count'))).toBe(true);
  });

  it('flags a default that violates an enum constraint', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          Status: {
            type: 'string',
            enum: ['active', 'inactive'],
            default: 'unknown',
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const defFails = findings.filter((f) => f.detectorId === 'ajv:default-validation-fail');
    expect(defFails.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag a default that satisfies its schema', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          P: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 25,
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const defFails = findings.filter((f) => f.detectorId === 'ajv:default-validation-fail');
    expect(defFails).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Detection 4 — required-properties combinatorial conflict
// ---------------------------------------------------------------------------

describe('ajv-validator — required-properties-conflict (A11)', () => {
  it('flags a required field missing from properties (additionalProperties: false → high)', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          U: {
            type: 'object',
            additionalProperties: false,
            properties: { name: { type: 'string' } },
            required: ['name', 'email'], // email missing from properties
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const conflicts = findings.filter((f) => f.detectorId === 'ajv:required-properties-conflict');
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0].severity).toBe('high'); // additionalProperties: false
    expect(conflicts[0].meta?.missingFields).toEqual(['email']);
  });

  it('flags a required field missing from properties (additionalProperties default → medium)', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          U: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id', 'createdAt'],
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const conflicts = findings.filter((f) => f.detectorId === 'ajv:required-properties-conflict');
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0].severity).toBe('medium');
    expect((conflicts[0].meta?.missingFields as string[]).includes('createdAt')).toBe(true);
  });

  it('does not flag when required fields are inherited via allOf composition', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          Base: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          Extended: {
            allOf: [
              { $ref: '#/components/schemas/Base' },
              {
                type: 'object',
                properties: { extra: { type: 'string' } },
              },
            ],
            required: ['id', 'extra'], // both reachable via allOf composition
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const conflicts = findings.filter((f) => f.detectorId === 'ajv:required-properties-conflict');
    // Extended should NOT be flagged — id is in Base (via $ref), extra is in inline allOf member
    expect(conflicts.find((c) => c.sourcePath?.includes('Extended'))).toBeUndefined();
  });

  it('does not flag a well-formed required list', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          U: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
            required: ['id'],
          },
        },
      },
    };
    const findings = await runAjvValidator(spec);
    const conflicts = findings.filter((f) => f.detectorId === 'ajv:required-properties-conflict');
    expect(conflicts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Output shape — must validate through the canonical FindingSchema mapper
// ---------------------------------------------------------------------------

describe('ajv-validator — output-mapper integration', () => {
  it('every emitted DetectorFinding maps cleanly into FindingSchema', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          A: { type: 'integer', default: 'nope' },
          B: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n', 'missing'] },
          C: { type: 'string', pattern: '^([unbalanced' },
        },
      },
    };
    const detectorFindings = await runAjvValidator(spec);
    expect(detectorFindings.length).toBeGreaterThan(0);
    const mapped = mapDetectorFindings(detectorFindings);
    // mapDetectorFindings drops invalid; we expect every input to map cleanly.
    expect(mapped.length).toBe(detectorFindings.length);
    for (const f of mapped) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.narration.length).toBeGreaterThanOrEqual(50);
      expect(f.rationale.length).toBeGreaterThanOrEqual(20);
      expect(f.patchSummary.length).toBeGreaterThan(0);
      expect(['critical', 'high', 'medium', 'low']).toContain(f.severity);
      expect(['clarity', 'design', 'risk']).toContain(f.category); // 'correctness' downcasts to 'risk'
    }
  });
});

// ---------------------------------------------------------------------------
// Smoke tests — run on the four bundled example specs
// ---------------------------------------------------------------------------

describe('ajv-validator — smoke against example specs', () => {
  for (const specName of SPECS) {
    it(`runs on ${specName} without crashing and emits a sensible result`, async () => {
      const spec = loadSpec(specName);
      const findings = await runAjvValidator(spec, { specName });
      // We don't assert specific counts — that would be brittle. We only
      // assert: returned an array, no throw, every finding has required fields.
      expect(Array.isArray(findings)).toBe(true);
      for (const f of findings) {
        expect(typeof f.detectorId).toBe('string');
        expect(f.detectorId.startsWith('ajv:')).toBe(true);
        expect(typeof f.title).toBe('string');
        expect(typeof f.narration).toBe('string');
        expect(typeof f.rationale).toBe('string');
        expect(['high', 'medium', 'low', 'critical']).toContain(f.severity);
      }
      // Every detector finding must also map cleanly through output-mapper —
      // this is the contract that hooks Stage-A into the rest of the pipeline.
      const mapped = mapDetectorFindings(findings);
      expect(mapped.length).toBe(findings.length);
    }, 240_000); // 240s budget: github-rest spec.json is ~327k lines and
    // contains thousands of media-type/example pairs to walk + validate.
  }
});

// ---------------------------------------------------------------------------
// Internal-helper unit tests — guard the helpers we lean on
// ---------------------------------------------------------------------------

describe('ajv-validator — internal helpers', () => {
  it('isSchemaShaped recognises canonical JSON-Schema keywords', () => {
    expect(__test.isSchemaShaped({ type: 'string' })).toBe(true);
    expect(__test.isSchemaShaped({ properties: {} })).toBe(true);
    expect(__test.isSchemaShaped({ $ref: '#/x' })).toBe(true);
    expect(__test.isSchemaShaped({ enum: ['a'] })).toBe(true);
    expect(__test.isSchemaShaped({})).toBe(false);
    expect(__test.isSchemaShaped({ description: 'just docs' })).toBe(false);
    expect(__test.isSchemaShaped(null)).toBe(false);
    expect(__test.isSchemaShaped([])).toBe(false);
  });

  it('collectAllOfProperties merges properties across allOf and $ref', () => {
    const components = {
      Base: { type: 'object', properties: { a: { type: 'string' } } },
    };
    const schema = {
      allOf: [
        { $ref: '#/components/schemas/Base' },
        { type: 'object', properties: { b: { type: 'string' } } },
      ],
    };
    const props = __test.collectAllOfProperties(schema, components);
    expect(props.has('a')).toBe(true);
    expect(props.has('b')).toBe(true);
  });

  it('inlineLocalRefs resolves #/components/schemas/X refs', () => {
    const components = { X: { type: 'string', enum: ['a', 'b'] } };
    const node = { $ref: '#/components/schemas/X' };
    const inlined = __test.inlineLocalRefs(node, components) as Record<string, unknown>;
    expect(inlined.type).toBe('string');
    expect(inlined.enum).toEqual(['a', 'b']);
  });

  it('inlineLocalRefs drops cyclic markers', () => {
    const inlined = __test.inlineLocalRefs({ $ref: '#cyclic' }, undefined);
    expect(inlined).toEqual({});
  });
});
