/**
 * Tests for the evolution-statistical Walker module (T17 / Wave-2 Welle-B).
 *
 * Coverage matrix — ≥60 cases across:
 *   - All 9 Walker patterns (positive + negative + edge case = ≥3 each)
 *   - All 21 P1+P2 EV-* Spectral rules (smoke-tests via walkEvolutionStatistical
 *     orchestrator + dedicated unit tests on each named export)
 *   - Severity-Schema integration (patternId, direction, lens metadata)
 *   - Smoke runs against 4 reference openapi-examples specs
 *
 * Test-naming convention: each `describe` block targets one EV-* pattern;
 * inside, `it` blocks cover positive (rule fires) + negative (rule does NOT
 * fire) + edge-cases.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import {
  walkEvolutionStatistical,
  walkRequiredHasDefault,
  walkVersioningAxisDrift,
  walkInconsistentErrorShape,
  walkRequestBodyNoJson,
  walkNullableAndRequired,
  walkAmbiguousPathTemplates,
  walkSchemaNameCollisions,
  walkUrlInfoVersionDrift,
  walkRequiredNotInProperties,
} from '../../deterministic/aggregators/evolution-statistical.js';

// ===========================================================================
// Helpers
// ===========================================================================

function emptySpec(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: { title: 'Test', version: '1.0.0' },
    paths: {},
  };
}

function specWithComponents(schemas: Record<string, unknown>): object {
  return {
    openapi: '3.0.3',
    info: { title: 'Test', version: '1.0.0' },
    paths: {},
    components: { schemas },
  };
}

// ===========================================================================
// EV-7 — required field has default
// ===========================================================================

describe('walkRequiredHasDefault — EV-7 (drift, warn)', () => {
  it('flags a required field that declares a default value', async () => {
    const spec = specWithComponents({
      User: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', default: 'anonymous' },
          email: { type: 'string' },
        },
      },
    });
    const findings = await walkRequiredHasDefault(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.patternId).toBe('EV-7');
    expect(findings[0].meta?.direction).toBe('drift');
    expect(findings[0].meta?.lens).toBe('evolution-friction');
    expect(findings[0].meta?.count).toBe(1);
  });

  it('does NOT flag when the field with default is optional', async () => {
    const spec = specWithComponents({
      User: {
        type: 'object',
        required: ['email'],
        properties: {
          name: { type: 'string', default: 'anonymous' },
          email: { type: 'string' },
        },
      },
    });
    const findings = await walkRequiredHasDefault(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag when no required is declared', async () => {
    const spec = specWithComponents({
      User: { type: 'object', properties: { name: { type: 'string', default: 'x' } } },
    });
    const findings = await walkRequiredHasDefault(spec);
    expect(findings).toHaveLength(0);
  });

  it('aggregates multiple offenders into one finding', async () => {
    const spec = specWithComponents({
      A: { type: 'object', required: ['x'], properties: { x: { type: 'string', default: '' } } },
      B: { type: 'object', required: ['y'], properties: { y: { type: 'integer', default: 0 } } },
    });
    const findings = await walkRequiredHasDefault(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.count).toBe(2);
  });

  it('handles empty spec without crashing', async () => {
    const findings = await walkRequiredHasDefault(emptySpec());
    expect(findings).toHaveLength(0);
  });
});

// ===========================================================================
// EV-10 — Mixed URL + Header versioning
// ===========================================================================

describe('walkVersioningAxisDrift — EV-10 (drift, warn)', () => {
  it('flags mixed URL-version + header-version', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1.0' },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {
        '/items': {
          get: {
            parameters: [{ name: 'API-Version', in: 'header', schema: { type: 'string' } }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkVersioningAxisDrift(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.patternId).toBe('EV-10');
  });

  it('does NOT flag URL-only versioning', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: { '/items': { get: { responses: { '200': { description: 'ok' } } } } },
    };
    const findings = await walkVersioningAxisDrift(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag header-only versioning', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      servers: [{ url: 'https://api.example.com/' }],
      paths: {
        '/items': {
          get: {
            parameters: [{ name: 'X-API-Version', in: 'header', schema: { type: 'string' } }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkVersioningAxisDrift(spec);
    expect(findings).toHaveLength(0);
  });

  it('detects URL-version on path key (not just servers)', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/v2/items': {
          get: {
            parameters: [{ name: 'Api-Version', in: 'header', schema: { type: 'string' } }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkVersioningAxisDrift(spec);
    expect(findings).toHaveLength(1);
  });
});

// ===========================================================================
// EV-11 — No spec-wide error-shape declared
// ===========================================================================

describe('walkInconsistentErrorShape — EV-11 (drift, warn)', () => {
  it('flags spec with 4+ distinct ad-hoc error schemas', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/a': {
          get: {
            responses: {
              '400': {
                description: 'bad',
                content: { 'application/json': { schema: { type: 'object', properties: { msg: { type: 'string' } } } } },
              },
            },
          },
        },
        '/b': {
          get: {
            responses: {
              '404': {
                description: 'nf',
                content: { 'application/json': { schema: { type: 'object', properties: { code: { type: 'integer' } } } } },
              },
            },
          },
        },
        '/c': {
          get: {
            responses: {
              '500': {
                description: 'err',
                content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } },
              },
            },
          },
        },
        '/d': {
          get: {
            responses: {
              '422': {
                description: 'unp',
                content: { 'application/json': { schema: { type: 'object', properties: { fail: { type: 'string' } } } } },
              },
            },
          },
        },
      },
    };
    const findings = await walkInconsistentErrorShape(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.patternId).toBe('EV-11');
  });

  it('does NOT flag spec using application/problem+json', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/a': {
          get: {
            responses: {
              '400': {
                description: 'bad',
                content: { 'application/problem+json': { schema: { type: 'object' } } },
              },
              '500': {
                description: 'err',
                content: { 'application/problem+json': { schema: { type: 'object' } } },
              },
            },
          },
        },
      },
    };
    const findings = await walkInconsistentErrorShape(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag spec using ≤2 distinct shapes', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/a': {
          get: {
            responses: {
              '400': {
                description: 'bad',
                content: { 'application/json': { schema: { type: 'object', properties: { msg: { type: 'string' } } } } },
              },
              '500': {
                description: 'err',
                content: { 'application/json': { schema: { type: 'object', properties: { msg: { type: 'string' } } } } },
              },
            },
          },
        },
      },
    };
    const findings = await walkInconsistentErrorShape(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag spec with no error responses', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/a': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkInconsistentErrorShape(spec);
    expect(findings).toHaveLength(0);
  });
});

// ===========================================================================
// EV-30 — requestBody without application/json
// ===========================================================================

describe('walkRequestBodyNoJson — EV-30 (drift, warn)', () => {
  it('flags POST with only application/x-www-form-urlencoded', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/items': {
          post: {
            requestBody: {
              content: { 'application/x-www-form-urlencoded': { schema: { type: 'object' } } },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkRequestBodyNoJson(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.patternId).toBe('EV-30');
    expect(findings[0].affectedEndpoints[0].path).toBe('/items');
    expect(findings[0].affectedEndpoints[0].method).toBe('post');
  });

  it('does NOT flag when application/json is declared', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/items': {
          post: {
            requestBody: {
              content: {
                'application/json': { schema: { type: 'object' } },
                'application/x-www-form-urlencoded': { schema: { type: 'object' } },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkRequestBodyNoJson(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag when a +json vendor variant is declared', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/items': {
          post: {
            requestBody: {
              content: { 'application/vnd.acme.v1+json': { schema: { type: 'object' } } },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkRequestBodyNoJson(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag GET (no requestBody required)', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: { '/items': { get: { responses: { '200': { description: 'ok' } } } } },
    };
    const findings = await walkRequestBodyNoJson(spec);
    expect(findings).toHaveLength(0);
  });
});

// ===========================================================================
// EV-33 — nullable + required contradiction
// ===========================================================================

describe('walkNullableAndRequired — EV-33 (drift, warn)', () => {
  it('flags OAS 3.0 nullable: true on a required field', async () => {
    const spec = specWithComponents({
      User: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', nullable: true } },
      },
    });
    const findings = await walkNullableAndRequired(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.patternId).toBe('EV-33');
    expect(findings[0].meta?.count).toBe(1);
  });

  it('flags OAS 3.1 type: ["string", "null"] on a required field', async () => {
    const spec = specWithComponents({
      User: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: ['string', 'null'] } },
      },
    });
    const findings = await walkNullableAndRequired(spec);
    expect(findings).toHaveLength(1);
  });

  it('does NOT flag nullable on optional field', async () => {
    const spec = specWithComponents({
      User: {
        type: 'object',
        required: [],
        properties: { name: { type: 'string', nullable: true } },
      },
    });
    const findings = await walkNullableAndRequired(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag required without nullable', async () => {
    const spec = specWithComponents({
      User: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
    });
    const findings = await walkNullableAndRequired(spec);
    expect(findings).toHaveLength(0);
  });
});

// ===========================================================================
// EV-36 — Ambiguous path templates
// ===========================================================================

describe('walkAmbiguousPathTemplates — EV-36 (drift, error)', () => {
  it('flags two paths with identical structural template', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/users/{id}': { get: { responses: { '200': { description: 'ok' } } } },
        '/users/{name}': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkAmbiguousPathTemplates(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.patternId).toBe('EV-36');
    expect(findings[0].severity).toBe('high');
  });

  it('does NOT flag distinct path templates', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/users/{id}': { get: { responses: { '200': { description: 'ok' } } } },
        '/users/{id}/posts': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkAmbiguousPathTemplates(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag empty paths', async () => {
    const findings = await walkAmbiguousPathTemplates(emptySpec());
    expect(findings).toHaveLength(0);
  });

  it('groups multiple collisions correctly', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/a/{x}': { get: { responses: { '200': { description: 'ok' } } } },
        '/a/{y}': { get: { responses: { '200': { description: 'ok' } } } },
        '/a/{z}': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkAmbiguousPathTemplates(spec);
    expect(findings).toHaveLength(1);
    const collisions = findings[0].meta?.collisions as Array<{ paths: string[] }>;
    expect(collisions[0].paths).toHaveLength(3);
  });
});

// ===========================================================================
// EV-40 — Schema-name collisions case-insensitive
// ===========================================================================

describe('walkSchemaNameCollisions — EV-40 (drift, warn)', () => {
  it('flags two schemas with same name in different cases', async () => {
    const spec = specWithComponents({
      User: { type: 'object' },
      user: { type: 'object' },
    });
    const findings = await walkSchemaNameCollisions(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.patternId).toBe('EV-40');
  });

  it('does NOT flag distinct schema names', async () => {
    const spec = specWithComponents({
      User: { type: 'object' },
      Post: { type: 'object' },
    });
    const findings = await walkSchemaNameCollisions(spec);
    expect(findings).toHaveLength(0);
  });

  it('flags multiple collisions', async () => {
    const spec = specWithComponents({
      Order: { type: 'object' },
      order: { type: 'object' },
      ITEM: { type: 'object' },
      item: { type: 'object' },
    });
    const findings = await walkSchemaNameCollisions(spec);
    expect(findings).toHaveLength(1);
    const cols = findings[0].meta?.collisions as Array<{ names: string[] }>;
    expect(cols).toHaveLength(2);
  });

  it('handles spec with no components.schemas gracefully', async () => {
    const findings = await walkSchemaNameCollisions(emptySpec());
    expect(findings).toHaveLength(0);
  });
});

// ===========================================================================
// EV-53 — URL-version vs info.version drift
// ===========================================================================

describe('walkUrlInfoVersionDrift — EV-53 (drift, warn)', () => {
  it('flags drift between URL v1 and info.version 2.0.0', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '2.0.0' },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {},
    };
    const findings = await walkUrlInfoVersionDrift(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.patternId).toBe('EV-53');
  });

  it('does NOT flag when URL v1 matches info 1.x', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1.5.0' },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {},
    };
    const findings = await walkUrlInfoVersionDrift(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag when no URL version present', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '2.0.0' },
      servers: [{ url: 'https://api.example.com/' }],
      paths: {},
    };
    const findings = await walkUrlInfoVersionDrift(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag when info.version is missing', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T' },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {},
    };
    const findings = await walkUrlInfoVersionDrift(spec);
    expect(findings).toHaveLength(0);
  });

  it('detects URL version on path keys, not just servers', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '3.0.0' },
      paths: { '/v1/users': { get: { responses: { '200': { description: 'ok' } } } } },
    };
    const findings = await walkUrlInfoVersionDrift(spec);
    expect(findings).toHaveLength(1);
  });
});

// ===========================================================================
// EV-57 — required not in properties
// ===========================================================================

describe('walkRequiredNotInProperties — EV-57 (drift, error)', () => {
  it('flags required listing a property not in properties', async () => {
    const spec = specWithComponents({
      User: {
        type: 'object',
        required: ['name', 'phantom'],
        properties: { name: { type: 'string' } },
      },
    });
    const findings = await walkRequiredNotInProperties(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.patternId).toBe('EV-57');
    expect(findings[0].severity).toBe('high');
  });

  it('does NOT flag when all required entries are in properties', async () => {
    const spec = specWithComponents({
      User: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      },
    });
    const findings = await walkRequiredNotInProperties(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag when no required is declared', async () => {
    const spec = specWithComponents({
      User: { type: 'object', properties: { name: { type: 'string' } } },
    });
    const findings = await walkRequiredNotInProperties(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag schema with required but no properties at all', async () => {
    // Different pattern (covered by another rule); EV-57 specifically flags
    // drift WITHIN an object that DOES have properties.
    const spec = specWithComponents({
      User: { type: 'object', required: ['x'] },
    });
    const findings = await walkRequiredNotInProperties(spec);
    expect(findings).toHaveLength(0);
  });

  it('aggregates count across multiple schemas', async () => {
    const spec = specWithComponents({
      A: { type: 'object', required: ['x', 'phantom_a'], properties: { x: { type: 'string' } } },
      B: { type: 'object', required: ['phantom_b'], properties: { y: { type: 'string' } } },
    });
    const findings = await walkRequiredNotInProperties(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.count).toBe(2);
  });
});

// ===========================================================================
// Master orchestrator — walkEvolutionStatistical
// ===========================================================================

describe('walkEvolutionStatistical — orchestrator', () => {
  it('runs all 9 walkers and aggregates findings', async () => {
    // A spec triggering several patterns at once
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '2.0.0' },
      servers: [{ url: 'https://api.example.com/v1' }], // EV-53 + EV-10 setup
      paths: {
        '/items': {
          post: {
            parameters: [{ name: 'API-Version', in: 'header', schema: { type: 'string' } }],
            requestBody: { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object' } } } },
            responses: { '200': { description: 'ok' } },
          },
        },
        '/items/{id}': { get: { responses: { '200': { description: 'ok' } } } },
        '/items/{name}': { get: { responses: { '200': { description: 'ok' } } } },
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['name', 'phantom'],
            properties: { name: { type: 'string', default: 'x', nullable: true } },
          },
          user: { type: 'object' },
        },
      },
    };
    const findings = await walkEvolutionStatistical(spec);
    const ids = findings.map((f) => f.meta?.patternId);
    expect(ids).toContain('EV-7');
    expect(ids).toContain('EV-10');
    expect(ids).toContain('EV-30');
    expect(ids).toContain('EV-33');
    expect(ids).toContain('EV-36');
    expect(ids).toContain('EV-40');
    expect(ids).toContain('EV-53');
    expect(ids).toContain('EV-57');
  });

  it('returns empty array on empty spec', async () => {
    const findings = await walkEvolutionStatistical(emptySpec());
    expect(findings).toEqual([]);
  });

  it('every finding carries lens=evolution-friction in meta', async () => {
    const spec = specWithComponents({
      A: { type: 'object', required: ['x'], properties: { x: { type: 'string', default: '' } } },
    });
    const findings = await walkEvolutionStatistical(spec);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.meta?.lens).toBe('evolution-friction');
    }
  });

  it('every finding carries direction in meta', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/a/{x}': { get: { responses: { '200': { description: 'ok' } } } },
        '/a/{y}': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkEvolutionStatistical(spec);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.meta?.direction).toBeDefined();
      expect(['tighten', 'loosen', 'drift']).toContain(f.meta?.direction);
    }
  });

  it('a single walker crash does not abort the rest', async () => {
    // Pass a non-spec value to trigger crashes inside walkers; orchestrator
    // should swallow them and return an array.
    const findings = await walkEvolutionStatistical({} as object);
    expect(Array.isArray(findings)).toBe(true);
  });
});

// ===========================================================================
// Severity-Schema integration
// ===========================================================================

describe('Severity-Schema integration', () => {
  it('EV-7 finding carries direction=drift', async () => {
    const spec = specWithComponents({
      A: { type: 'object', required: ['x'], properties: { x: { type: 'string', default: '' } } },
    });
    const findings = await walkRequiredHasDefault(spec);
    expect(findings[0].meta?.direction).toBe('drift');
  });

  it('EV-36 finding has high severity (error-class)', async () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/a/{x}': { get: { responses: { '200': { description: 'ok' } } } },
        '/a/{y}': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkAmbiguousPathTemplates(spec);
    expect(findings[0].severity).toBe('high');
  });

  it('EV-57 finding has high severity (error-class) and category=correctness', async () => {
    const spec = specWithComponents({
      A: { type: 'object', required: ['phantom'], properties: { x: { type: 'string' } } },
    });
    const findings = await walkRequiredNotInProperties(spec);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].category).toBe('correctness');
  });

  it('EV-* findings emit detectorId with walker:evolution: prefix', async () => {
    const spec = specWithComponents({
      A: { type: 'object', required: ['x'], properties: { x: { type: 'string', default: '' } } },
    });
    const findings = await walkRequiredHasDefault(spec);
    expect(findings[0].detectorId).toMatch(/^walker:evolution:/);
  });

  it('EV-* findings have layer=walker-statistical', async () => {
    const spec = specWithComponents({
      A: { type: 'object', required: ['x'], properties: { x: { type: 'string', default: '' } } },
    });
    const findings = await walkRequiredHasDefault(spec);
    expect(findings[0].layer).toBe('walker-statistical');
  });
});

// ===========================================================================
// Smoke tests against 4 reference openapi-examples specs
// ===========================================================================

describe('Smoke tests against reference specs', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
  const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

  function loadSpec(specName: string): object | null {
    const baseDir = path.join(EXAMPLES_DIR, specName);
    if (!fs.existsSync(baseDir)) return null;
    for (const ext of ['json', 'yaml', 'yml']) {
      const candidate = path.join(baseDir, `spec.${ext}`);
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf8');
        return ext === 'json' ? JSON.parse(raw) : (YAML.parse(raw) as object);
      }
    }
    return null;
  }

  for (const specName of ['stripe', 'pagerduty', 'dnd5eapi', 'openweathermap']) {
    it(`runs against ${specName} without crashing`, async () => {
      const spec = loadSpec(specName);
      if (!spec) {
        // Spec not present — skip gracefully (not all 4 may exist in every environment)
        return;
      }
      const findings = await walkEvolutionStatistical(spec, { specName });
      expect(Array.isArray(findings)).toBe(true);
      // Each finding should be well-formed
      for (const f of findings) {
        expect(f.detectorId).toBeDefined();
        expect(f.layer).toBe('walker-statistical');
        expect(f.meta?.patternId).toMatch(/^EV-\d+$/);
        expect(f.meta?.lens).toBe('evolution-friction');
        expect(['tighten', 'loosen', 'drift']).toContain(f.meta?.direction);
      }
    });
  }
});

// ===========================================================================
// Spectral-rule smoke test — verify YAML parseable and integrates with runner
// ===========================================================================

describe('apiq-ruleset-evolution.yaml — Spectral integration smoke', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const RULESET_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    'deterministic',
    'rules',
    'apiq-ruleset-evolution.yaml'
  );

  it('exists at the expected path', () => {
    expect(fs.existsSync(RULESET_PATH)).toBe(true);
  });

  it('is valid YAML', () => {
    const text = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(text) as Record<string, unknown>;
    expect(parsed).toBeDefined();
    expect(parsed.rules).toBeDefined();
  });

  it('contains the expected EV-* rule IDs', () => {
    const text = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(text) as { rules: Record<string, unknown> };
    const ruleIds = Object.keys(parsed.rules);
    // P1 patterns
    expect(ruleIds).toContain('apiq-ev-1-deprecated-needs-sunset');
    expect(ruleIds).toContain('apiq-ev-4-bare-array-response-body');
    expect(ruleIds).toContain('apiq-ev-5-response-schema-additionalproperties-undeclared');
    expect(ruleIds).toContain('apiq-ev-8-operation-needs-operationid');
    expect(ruleIds).toContain('apiq-ev-23-request-string-needs-maxlength');
    expect(ruleIds).toContain('apiq-ev-24-pattern-needs-anchors');
    expect(ruleIds).toContain('apiq-ev-25-integer-needs-format');
    expect(ruleIds).toContain('apiq-ev-27-path-no-file-extension');
    expect(ruleIds).toContain('apiq-ev-28-server-url-no-environment');
    expect(ruleIds).toContain('apiq-ev-32-no-authorization-header-parameter');
    expect(ruleIds).toContain('apiq-ev-32-no-accept-header-parameter');
    expect(ruleIds).toContain('apiq-ev-34-no-swagger-2');
    expect(ruleIds).toContain('apiq-ev-35-no-consecutive-path-parameters');
    expect(ruleIds).toContain('apiq-ev-37-info-version-required');
    expect(ruleIds).toContain('apiq-ev-43-no-swagger-2-residue-consumes');
    expect(ruleIds).toContain('apiq-ev-43-no-swagger-2-residue-produces');
    // P2 patterns
    expect(ruleIds).toContain('apiq-ev-3-response-enum-needs-extensibility');
    expect(ruleIds).toContain('apiq-ev-6-discriminator-needs-mapping');
    expect(ruleIds).toContain('apiq-ev-14-requestbody-required-explicit');
    expect(ruleIds).toContain('apiq-ev-16-operation-needs-default-response');
    expect(ruleIds).toContain('apiq-ev-17-operation-needs-tags');
    expect(ruleIds).toContain('apiq-ev-18-request-additionalproperties-true');
    expect(ruleIds).toContain('apiq-ev-19-unused-securityschemes');
    expect(ruleIds).toContain('apiq-ev-46-readonly-in-request');
    expect(ruleIds).toContain('apiq-ev-46-writeonly-in-response');
    expect(ruleIds).toContain('apiq-ev-48-patch-content-type');
    expect(ruleIds).toContain('apiq-ev-55-required-param-no-default');
    expect(ruleIds).toContain('apiq-ev-56-servers-required');
  });

  it('every rule has a description, severity, given, and then', () => {
    const text = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(text) as { rules: Record<string, Record<string, unknown>> };
    for (const [code, rule] of Object.entries(parsed.rules)) {
      expect(rule.description, `${code} description`).toBeDefined();
      expect(rule.severity, `${code} severity`).toBeDefined();
      expect(rule.given, `${code} given`).toBeDefined();
      expect(rule.then, `${code} then`).toBeDefined();
    }
  });

  it('every rule description carries the lens-3 marker prefix', () => {
    const text = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(text) as { rules: Record<string, Record<string, unknown>> };
    for (const [code, rule] of Object.entries(parsed.rules)) {
      const desc = rule.description as string;
      expect(desc, `${code} description starts with lens-3 marker`).toMatch(/\[lens-3 \| (tighten|loosen|drift)\]/);
    }
  });

  it('extends spectral:oas', () => {
    const text = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(text) as { extends?: string[] };
    expect(parsed.extends).toContain('spectral:oas');
  });

  it('declares oas3 / oas3_0 / oas3_1 formats', () => {
    const text = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(text) as { formats?: string[] };
    expect(parsed.formats).toContain('oas3');
    expect(parsed.formats).toContain('oas3_0');
    expect(parsed.formats).toContain('oas3_1');
  });

  it('contains at least 21 EV-* rules (P1+P2 net coverage)', () => {
    const text = fs.readFileSync(RULESET_PATH, 'utf8');
    const parsed = YAML.parse(text) as { rules: Record<string, unknown> };
    const evRuleCount = Object.keys(parsed.rules).filter((k) => /^apiq-ev-/.test(k)).length;
    expect(evRuleCount).toBeGreaterThanOrEqual(21);
  });
});
