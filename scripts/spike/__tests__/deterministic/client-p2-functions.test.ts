/**
 * Unit tests for the Welle C (T18b) Client-P2 custom Spectral functions.
 *
 * Coverage:
 *   - schemaNestingDepth (CL-29):           depth counting + threshold
 *   - regexMultiEngineUnsupported (CL-25):  multi-engine portability
 *   - allOfHeavyNonRefObjects (CL-77):      heavy-allOf detection
 *   - linguisticAmorphousUri (F-11):        DOLAR amorphous-segment
 *   - linguisticTinyResource (F-12):        DOLAR tiny-resource
 */

import { describe, it, expect } from 'vitest';
import type {
  IFunctionResult,
  RulesetFunctionContext,
} from '@stoplight/spectral-core';

import {
  schemaNestingDepth,
  regexMultiEngineUnsupported,
  allOfHeavyNonRefObjects,
  linguisticAmorphousUri,
  linguisticTinyResource,
} from '../../deterministic/spectral-functions/client-p2-functions.js';

const ctx = {
  path: ['paths', '/x'],
  document: {} as never,
  documentInventory: {} as never,
  rule: {} as never,
} as unknown as RulesetFunctionContext;

/**
 * IFunction's return type is `void | IFunctionResult[] | Promise<...>`. All
 * client-p2 functions in this file return synchronous arrays only, so we
 * narrow once here for ergonomic test assertions on `.length` / `[i]`.
 */
function arr(out: unknown): IFunctionResult[] {
  if (out === undefined) return [];
  if (Array.isArray(out)) return out as IFunctionResult[];
  throw new Error(`expected IFunctionResult[] but got ${typeof out}`);
}

// =============================================================================
// schemaNestingDepth (CL-29)
// =============================================================================

describe('schemaNestingDepth (CL-29)', () => {
  it('returns no findings on flat object schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
    };
    expect(schemaNestingDepth(schema, { maxDepth: 3 }, ctx)).toEqual([]);
  });

  it('returns no findings at exactly the maxDepth (3 levels)', () => {
    const schema = {
      type: 'object',
      properties: {
        a: {
          type: 'object',
          properties: {
            b: {
              type: 'object',
              properties: {
                c: { type: 'string' },
              },
            },
          },
        },
      },
    };
    // depth: a (1) -> b (2) -> c (3). Within limit.
    expect(schemaNestingDepth(schema, { maxDepth: 3 }, ctx)).toEqual([]);
  });

  it('returns finding when depth > maxDepth (4 levels)', () => {
    const schema = {
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
    };
    const result = arr(schemaNestingDepth(schema, { maxDepth: 3 }, ctx));
    expect(result.length).toBe(1);
    expect(result[0].message).toMatch(/nesting depth 4/);
  });

  it('counts nesting through array items', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { x: { type: 'string' } },
          },
        },
      },
    };
    // items don't increase depth beyond what nested objects do.
    expect(schemaNestingDepth(schema, { maxDepth: 0 }, ctx)).not.toEqual([]);
  });

  it('skips $ref-d schemas (resolution boundary)', () => {
    const schema = { $ref: '#/components/schemas/X' };
    expect(schemaNestingDepth(schema, { maxDepth: 1 }, ctx)).toEqual([]);
  });

  it('does not count allOf composition as nesting', () => {
    const schema = {
      type: 'object',
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'string' } } },
      ],
    };
    expect(schemaNestingDepth(schema, { maxDepth: 1 }, ctx)).toEqual([]);
  });

  it('returns no findings on non-object input', () => {
    expect(schemaNestingDepth(null, { maxDepth: 3 }, ctx)).toEqual([]);
    expect(schemaNestingDepth('string', { maxDepth: 3 }, ctx)).toEqual([]);
    expect(schemaNestingDepth(42, { maxDepth: 3 }, ctx)).toEqual([]);
  });

  it('uses default maxDepth=3 when not provided', () => {
    const schema = {
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
    };
    const result = arr(schemaNestingDepth(schema, {}, ctx));
    expect(result.length).toBe(1);
  });
});

// =============================================================================
// regexMultiEngineUnsupported (CL-25)
// =============================================================================

describe('regexMultiEngineUnsupported (CL-25)', () => {
  it('returns empty array on portable regex', () => {
    expect(regexMultiEngineUnsupported('^[a-z]+$', undefined, ctx)).toEqual([]);
    expect(regexMultiEngineUnsupported('^\\d{3}-\\d{4}$', undefined, ctx)).toEqual([]);
    expect(regexMultiEngineUnsupported('[abc]+(xyz)?', undefined, ctx)).toEqual([]);
  });

  it('flags lookbehind assertions', () => {
    const out = arr(regexMultiEngineUnsupported('(?<=foo)bar', undefined, ctx));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('lookbehind');
  });

  it('flags negative lookbehind', () => {
    const out = arr(regexMultiEngineUnsupported('(?<!foo)bar', undefined, ctx));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('lookbehind');
  });

  it('flags Python-style named groups', () => {
    const out = arr(
      regexMultiEngineUnsupported('(?P<name>[a-z]+)', undefined, ctx)
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('Python-style named groups');
  });

  it('flags possessive quantifiers', () => {
    const out = arr(regexMultiEngineUnsupported('a++b', undefined, ctx));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('possessive');
  });

  it('flags atomic groups', () => {
    const out = arr(
      regexMultiEngineUnsupported('(?>foo|bar)baz', undefined, ctx)
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('atomic');
  });

  it('flags conditional patterns', () => {
    const out = arr(regexMultiEngineUnsupported('(?(1)foo|bar)', undefined, ctx));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('conditional');
  });

  it('flags Unicode property escapes', () => {
    const out = arr(regexMultiEngineUnsupported('\\p{Letter}+', undefined, ctx));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('Unicode');
  });

  it('returns empty on null/undefined/non-string input', () => {
    expect(regexMultiEngineUnsupported(null, undefined, ctx)).toEqual([]);
    expect(regexMultiEngineUnsupported(undefined, undefined, ctx)).toEqual([]);
    expect(regexMultiEngineUnsupported(123, undefined, ctx)).toEqual([]);
    expect(regexMultiEngineUnsupported('', undefined, ctx)).toEqual([]);
  });

  it('can flag multiple incompatibilities at once', () => {
    const out = arr(
      regexMultiEngineUnsupported('(?<=foo)(?P<n>[a-z]+)', undefined, ctx)
    );
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// allOfHeavyNonRefObjects (CL-77)
// =============================================================================

describe('allOfHeavyNonRefObjects (CL-77)', () => {
  it('returns empty when allOf has only $refs', () => {
    const allOf = [
      { $ref: '#/components/schemas/Base' },
      { $ref: '#/components/schemas/Mixin' },
    ];
    expect(allOfHeavyNonRefObjects(allOf, undefined, ctx)).toEqual([]);
  });

  it('returns empty with one $ref + one inline object', () => {
    const allOf = [
      { $ref: '#/components/schemas/Base' },
      { type: 'object', properties: { extra: { type: 'string' } } },
    ];
    expect(allOfHeavyNonRefObjects(allOf, undefined, ctx)).toEqual([]);
  });

  it('flags ≥2 inline non-$ref objects', () => {
    const allOf = [
      { type: 'object', properties: { a: { type: 'string' } } },
      { type: 'object', properties: { b: { type: 'string' } } },
    ];
    const out = arr(allOfHeavyNonRefObjects(allOf, undefined, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('2 inline');
  });

  it('flags 3 inline objects with even more emphasis', () => {
    const allOf = [
      { type: 'object', properties: { a: { type: 'string' } } },
      { type: 'object', properties: { b: { type: 'string' } } },
      { type: 'object', properties: { c: { type: 'string' } } },
    ];
    const out = arr(allOfHeavyNonRefObjects(allOf, undefined, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('3 inline');
  });

  it('returns empty on non-array input', () => {
    expect(allOfHeavyNonRefObjects(null, undefined, ctx)).toEqual([]);
    expect(allOfHeavyNonRefObjects({}, undefined, ctx)).toEqual([]);
  });

  it('counts additionalProperties-only inline as object', () => {
    const allOf = [
      { type: 'object', additionalProperties: { type: 'string' } },
      { type: 'object', additionalProperties: { type: 'integer' } },
    ];
    const out = arr(allOfHeavyNonRefObjects(allOf, undefined, ctx));
    expect(out.length).toBe(1);
  });
});

// =============================================================================
// linguisticAmorphousUri (F-11)
// =============================================================================

describe('linguisticAmorphousUri (F-11)', () => {
  it('returns empty on concrete resource paths', () => {
    expect(linguisticAmorphousUri('/users', undefined, ctx)).toEqual([]);
    expect(linguisticAmorphousUri('/users/{id}', undefined, ctx)).toEqual([]);
    expect(linguisticAmorphousUri('/invoices/{id}/line-items', undefined, ctx)).toEqual([]);
  });

  it('flags `data` segment', () => {
    const out = arr(linguisticAmorphousUri('/data', undefined, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('amorphous');
    expect(out[0].message).toContain('data');
  });

  it('flags `object` segment', () => {
    const out = arr(linguisticAmorphousUri('/objects/{id}', undefined, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('objects');
  });

  it('flags `thing`/`resource`/`item`', () => {
    expect(arr(linguisticAmorphousUri('/things', undefined, ctx)).length).toBe(
      1
    );
    expect(
      arr(linguisticAmorphousUri('/resources/{id}', undefined, ctx)).length
    ).toBe(1);
    expect(arr(linguisticAmorphousUri('/items', undefined, ctx)).length).toBe(1);
  });

  it('lists multiple offenders in one path', () => {
    const out = arr(linguisticAmorphousUri('/data/items/{id}', undefined, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('data');
    expect(out[0].message).toContain('items');
  });

  it('returns empty on non-string input', () => {
    expect(linguisticAmorphousUri(null, undefined, ctx)).toEqual([]);
    expect(linguisticAmorphousUri(123, undefined, ctx)).toEqual([]);
  });

  it('does not flag path-template params', () => {
    expect(linguisticAmorphousUri('/users/{data}', undefined, ctx)).toEqual([]);
  });
});

// =============================================================================
// linguisticTinyResource (F-12)
// =============================================================================

describe('linguisticTinyResource (F-12)', () => {
  it('returns empty on full-name resource paths', () => {
    expect(linguisticTinyResource('/users', undefined, ctx)).toEqual([]);
    expect(linguisticTinyResource('/invoices/{id}', undefined, ctx)).toEqual([]);
  });

  it('does NOT flag allowlisted shorthands', () => {
    expect(linguisticTinyResource('/v1/users', undefined, ctx)).toEqual([]);
    expect(linguisticTinyResource('/me', undefined, ctx)).toEqual([]);
    expect(linguisticTinyResource('/eu/users', undefined, ctx)).toEqual([]);
    expect(linguisticTinyResource('/users/{id}', undefined, ctx)).toEqual([]);
  });

  it('does NOT flag version-prefixes (v1..v9 + larger)', () => {
    expect(linguisticTinyResource('/v1', undefined, ctx)).toEqual([]);
    expect(linguisticTinyResource('/v9', undefined, ctx)).toEqual([]);
    // v10+ via regex check
    expect(linguisticTinyResource('/v10/users', undefined, ctx)).toEqual([]);
    expect(linguisticTinyResource('/v25/users', undefined, ctx)).toEqual([]);
  });

  it('flags `/u`', () => {
    const out = arr(linguisticTinyResource('/u', undefined, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('tiny');
  });

  it('flags `/iv`', () => {
    const out = arr(linguisticTinyResource('/iv', undefined, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('iv');
  });

  it('flags single-letter segments', () => {
    const out = arr(linguisticTinyResource('/x/{id}', undefined, ctx));
    expect(out.length).toBe(1);
  });

  it('returns empty on non-string input', () => {
    expect(linguisticTinyResource(null, undefined, ctx)).toEqual([]);
  });
});
