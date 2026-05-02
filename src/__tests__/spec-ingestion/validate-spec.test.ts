/**
 * Tests for `detectSwagger2`, `findExternalRefs`, `validateAndDereference`
 * (Epic 03 AC #7, #8, #9, #17).
 *
 * `validateAndDereference` is exercised against the real `openweathermap`
 * fixture (read from disk) for the happy path, and a hand-crafted invalid
 * spec for the error branch.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  detectSwagger2,
  findExternalRefs,
  validateAndDereference,
} from '@/lib/spec-ingestion/validate-spec';

const OPENWEATHERMAP_PATH = resolve(
  __dirname,
  '../../../openapi-examples/openweathermap/spec.json',
);

const EXTERNAL_REF_FIXTURE_PATH = resolve(
  __dirname,
  './external-ref-fixture.json',
);

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

describe('detectSwagger2', () => {
  it("returns true for { swagger: '2.0' }", () => {
    expect(detectSwagger2({ swagger: '2.0', info: {}, paths: {} })).toBe(true);
  });

  it("returns false for { openapi: '3.0.1' }", () => {
    expect(detectSwagger2({ openapi: '3.0.1', info: {}, paths: {} })).toBe(false);
  });

  it('returns false for null / non-object / missing field', () => {
    expect(detectSwagger2(null)).toBe(false);
    expect(detectSwagger2(undefined)).toBe(false);
    expect(detectSwagger2('swagger 2.0')).toBe(false);
    expect(detectSwagger2({})).toBe(false);
  });

  it('returns false when swagger field is set but not the string "2.0"', () => {
    expect(detectSwagger2({ swagger: '1.2' })).toBe(false);
    expect(detectSwagger2({ swagger: 2 })).toBe(false);
  });
});

describe('findExternalRefs', () => {
  it('returns empty for an internal-only spec (openweathermap fixture)', () => {
    const spec = readJson(OPENWEATHERMAP_PATH);
    expect(findExternalRefs(spec)).toEqual([]);
  });

  it('finds external https $refs in the fixture', () => {
    const fixture = readJson(EXTERNAL_REF_FIXTURE_PATH);
    const refs = findExternalRefs(fixture);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toBe('https://example.com/schemas/Thing.json#/Thing');
  });

  it('finds nested external refs and ignores internal refs', () => {
    const spec = {
      openapi: '3.0.1',
      paths: {
        '/x': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: 'https://example.com/A.json' },
                  },
                },
              },
            },
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Local' }, // internal
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Local: { type: 'object' },
          Foreign: { $ref: 'file:///etc/passwd' }, // external
        },
      },
    };

    const refs = findExternalRefs(spec);
    expect(refs).toHaveLength(2);
    expect(refs).toContain('https://example.com/A.json');
    expect(refs).toContain('file:///etc/passwd');
  });

  it('does not flag the cycle marker { $ref: "#cyclic" } as external', () => {
    const spec = {
      schemas: {
        Self: { $ref: '#cyclic' },
      },
    };
    expect(findExternalRefs(spec)).toEqual([]);
  });

  it('ignores arrays containing only primitives', () => {
    expect(findExternalRefs([1, 2, 3])).toEqual([]);
    expect(findExternalRefs([null, 'x', 5])).toEqual([]);
  });

  it('handles primitive / null input', () => {
    expect(findExternalRefs(null)).toEqual([]);
    expect(findExternalRefs(undefined)).toEqual([]);
    expect(findExternalRefs('hello')).toEqual([]);
  });
});

describe('validateAndDereference', () => {
  it('happy path on the openweathermap fixture', async () => {
    const spec = readJson(OPENWEATHERMAP_PATH);
    const result = await validateAndDereference(spec);
    expect(result.ok).toBe(true);

    if (!result.ok) return; // for TS narrowing
    const dereffed = result.dereferenced as Record<string, unknown>;
    expect(dereffed.openapi).toBe('3.0.1');

    // After dereference, the parameters under /weather GET should be
    // resolved objects (not `$ref` strings).
    const paths = dereffed.paths as Record<string, unknown>;
    const weather = paths['/weather'] as Record<string, unknown>;
    const get = weather.get as Record<string, unknown>;
    const params = get.parameters as Array<Record<string, unknown>>;
    expect(Array.isArray(params)).toBe(true);
    // None of the resolved params should still be a bare `{ $ref: '#/...' }` shape.
    for (const p of params) {
      expect(p.$ref).toBeUndefined();
      expect(p.name).toBeDefined();
    }
  });

  it('rejects a spec with an unresolvable internal $ref (kind: invalid_openapi)', async () => {
    // Internal ref pointing to a non-existent component — swagger-parser's
    // dereference() will throw a MissingPointerError.
    const malformed = {
      openapi: '3.0.1',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/DoesNotExist' },
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = await validateAndDereference(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_openapi');
    expect(Array.isArray(result.error.issues)).toBe(true);
    expect(result.error.issues.length).toBeGreaterThan(0);
    expect(result.error.issues.length).toBeLessThanOrEqual(10);
  });

  it('caps issues at 10', async () => {
    // Build a spec with 15 broken $refs so dereference reports >10 lines.
    const paths: Record<string, unknown> = {};
    for (let i = 0; i < 15; i++) {
      paths[`/x${i}`] = {
        get: {
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/Missing${i}` },
                },
              },
            },
          },
        },
      };
    }
    const garbage = {
      openapi: '3.0.1',
      info: { title: 't', version: '1' },
      paths,
    };
    const result = await validateAndDereference(garbage);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues.length).toBeLessThanOrEqual(10);
  });

  it('does not mutate the input spec (passes a clone to swagger-parser)', async () => {
    const spec = readJson<Record<string, unknown>>(OPENWEATHERMAP_PATH);
    const before = JSON.stringify(spec);
    await validateAndDereference(spec);
    const after = JSON.stringify(spec);
    expect(after).toBe(before);
  });
});
