/**
 * Unit tests for the Welle D2 niche+vendor custom Spectral functions.
 *
 * Coverage (positive trigger / negative pass / edge case per function):
 *   - serverUrlHostLowercase        (RFC2-71)
 *   - serverUrlSchemeLowercase      (RFC2-72)
 *   - serverUrlPathNormalized       (RFC2-73)
 *   - retryAfterGrammar             (RFC2-95)
 *   - defaultExampleStrictJson      (RFC2-83)
 *   - contentEncodingOnOAS30        (RFC2-89)
 *   - precondition428Awareness      (RFC2-103)
 *   - status511Awareness            (RFC2-105)
 *   - xInternalUsage                (CL-60)
 *   - bloatedDescription            (F-18)
 *   - aipStandardFieldPresence      (SC-20)
 */

import { describe, it, expect } from 'vitest';
import type {
  IFunctionResult,
  RulesetFunctionContext,
} from '@stoplight/spectral-core';

import {
  serverUrlHostLowercase,
  serverUrlSchemeLowercase,
  serverUrlPathNormalized,
  retryAfterGrammar,
  defaultExampleStrictJson,
  contentEncodingOnOAS30,
  precondition428Awareness,
  status511Awareness,
  xInternalUsage,
  bloatedDescription,
  aipStandardFieldPresence,
  FUNCTION_METADATA,
} from '../../deterministic/spectral-functions/niche-functions.js';

const ctx = {
  path: ['$'],
  document: {} as never,
  documentInventory: {} as never,
  rule: {} as never,
} as unknown as RulesetFunctionContext;

function arr(out: unknown): IFunctionResult[] {
  if (out === undefined) return [];
  if (Array.isArray(out)) return out as IFunctionResult[];
  throw new Error(`expected IFunctionResult[] but got ${typeof out}`);
}

// =============================================================================
// FUNCTION_METADATA — registry shape sanity
// =============================================================================

describe('FUNCTION_METADATA', () => {
  it('exports metadata for all 11 niche functions', () => {
    expect(Object.keys(FUNCTION_METADATA).sort()).toEqual(
      [
        'aip-standard-field-presence',
        'bloated-description',
        'content-encoding-on-oas30',
        'default-example-strict-json',
        'precondition-428-awareness',
        'retry-after-grammar',
        'server-url-host-lowercase',
        'server-url-path-normalized',
        'server-url-scheme-lowercase',
        'status-511-awareness',
        'x-internal-usage',
      ].sort(),
    );
  });

  it('every metadata entry has matching kebab-name + non-empty patternIds + description', () => {
    for (const [key, meta] of Object.entries(FUNCTION_METADATA)) {
      expect(meta.name).toBe(key);
      expect(meta.patternIds.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(10);
      expect(meta.description.length).toBeLessThan(220);
    }
  });
});

// =============================================================================
// RFC2-71 — serverUrlHostLowercase
// =============================================================================

describe('serverUrlHostLowercase (RFC2-71)', () => {
  it('flags mixed-case host', () => {
    expect(arr(serverUrlHostLowercase('https://API.Example.com/v1', {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not flag all-lowercase host', () => {
    expect(arr(serverUrlHostLowercase('https://api.example.com/v1', {}, ctx))).toEqual([]);
  });

  it('returns [] on unparseable URL', () => {
    expect(arr(serverUrlHostLowercase('not-a-url', {}, ctx))).toEqual([]);
  });

  it('returns [] on empty / non-string', () => {
    expect(arr(serverUrlHostLowercase('', {}, ctx))).toEqual([]);
    expect(arr(serverUrlHostLowercase(undefined, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// RFC2-72 — serverUrlSchemeLowercase
// =============================================================================

describe('serverUrlSchemeLowercase (RFC2-72)', () => {
  it('flags HTTPS uppercase scheme', () => {
    expect(arr(serverUrlSchemeLowercase('HTTPS://api.example.com', {}, ctx)).length).toBeGreaterThan(0);
  });

  it('flags HTTP uppercase scheme', () => {
    expect(arr(serverUrlSchemeLowercase('HTTP://api.example.com', {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not flag lowercase scheme', () => {
    expect(arr(serverUrlSchemeLowercase('https://api.example.com', {}, ctx))).toEqual([]);
  });

  it('returns [] on URL without scheme', () => {
    expect(arr(serverUrlSchemeLowercase('//example.com', {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// RFC2-73 — serverUrlPathNormalized
// =============================================================================

describe('serverUrlPathNormalized (RFC2-73)', () => {
  it('flags `/./` in path', () => {
    expect(arr(serverUrlPathNormalized('https://api.example.com/v1/./resource', {}, ctx)).length).toBeGreaterThan(0);
  });

  it('flags `/../` in path', () => {
    expect(arr(serverUrlPathNormalized('https://api.example.com/v1/../v2', {}, ctx)).length).toBeGreaterThan(0);
  });

  it('flags `//` empty segment', () => {
    expect(arr(serverUrlPathNormalized('https://api.example.com/v1//resource', {}, ctx)).length).toBeGreaterThan(0);
  });

  it('flags trailing slash on non-root', () => {
    expect(arr(serverUrlPathNormalized('https://api.example.com/v1/', {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not flag root `/`', () => {
    expect(arr(serverUrlPathNormalized('https://api.example.com/', {}, ctx))).toEqual([]);
  });

  it('does not flag normalized path', () => {
    expect(arr(serverUrlPathNormalized('https://api.example.com/v1/resource', {}, ctx))).toEqual([]);
  });

  it('returns [] on unparseable URL', () => {
    expect(arr(serverUrlPathNormalized('::not-a-url', {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// RFC2-95 — retryAfterGrammar
// =============================================================================

describe('retryAfterGrammar (RFC2-95)', () => {
  it('passes valid delta-seconds integer string in example', () => {
    const header = { example: '120' };
    expect(arr(retryAfterGrammar(header, {}, ctx))).toEqual([]);
  });

  it('passes valid IMF-fixdate HTTP-date in example', () => {
    const header = { example: 'Wed, 21 Oct 2015 07:28:00 GMT' };
    expect(arr(retryAfterGrammar(header, {}, ctx))).toEqual([]);
  });

  it('passes numeric delta-seconds', () => {
    const header = { example: 60 };
    expect(arr(retryAfterGrammar(header, {}, ctx))).toEqual([]);
  });

  it('flags invalid string (e.g. ISO date)', () => {
    const header = { example: '2015-10-21T07:28:00Z' };
    expect(arr(retryAfterGrammar(header, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('flags negative number', () => {
    const header = { example: -5 };
    expect(arr(retryAfterGrammar(header, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('flags invalid value in schema.default', () => {
    const header = { schema: { type: 'string', default: 'soon' } };
    expect(arr(retryAfterGrammar(header, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('walks examples map', () => {
    const header = {
      examples: {
        ok: { value: '60' },
        bad: { value: 'whenever' },
      },
    };
    const out = arr(retryAfterGrammar(header, {}, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('whenever');
  });

  it('returns [] on header with no example/schema', () => {
    expect(arr(retryAfterGrammar({}, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// RFC2-83 — defaultExampleStrictJson
// =============================================================================

describe('defaultExampleStrictJson (RFC2-83)', () => {
  it('flags stringified JSON object as default on object schema', () => {
    const schema = { type: 'object', default: '{"foo": 1}' };
    expect(arr(defaultExampleStrictJson(schema, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('flags stringified JSON array as example on array schema', () => {
    const schema = { type: 'array', example: '[1, 2, 3]' };
    expect(arr(defaultExampleStrictJson(schema, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not flag native object default on object schema', () => {
    const schema = { type: 'object', default: { foo: 1 } };
    expect(arr(defaultExampleStrictJson(schema, {}, ctx))).toEqual([]);
  });

  it('does not flag stringified JSON when schema-type is string', () => {
    const schema = { type: 'string', default: '{"foo": 1}' };
    expect(arr(defaultExampleStrictJson(schema, {}, ctx))).toEqual([]);
  });

  it('does not flag plain string default', () => {
    const schema = { type: 'object', default: 'hello world' };
    expect(arr(defaultExampleStrictJson(schema, {}, ctx))).toEqual([]);
  });

  it('returns [] on schema with no default/example', () => {
    expect(arr(defaultExampleStrictJson({ type: 'object' }, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// RFC2-89 — contentEncodingOnOAS30
// =============================================================================

describe('contentEncodingOnOAS30 (RFC2-89)', () => {
  it('flags contentEncoding on OAS 3.0.0 spec', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Image: { type: 'string', contentEncoding: 'base64' },
        },
      },
    };
    expect(arr(contentEncodingOnOAS30(doc, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('flags contentMediaType on OAS 3.0.3 spec', () => {
    const doc = {
      openapi: '3.0.3',
      components: {
        schemas: {
          Image: { type: 'string', contentMediaType: 'image/png' },
        },
      },
    };
    expect(arr(contentEncodingOnOAS30(doc, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not flag on OAS 3.1 spec', () => {
    const doc = {
      openapi: '3.1.0',
      components: {
        schemas: {
          Image: { type: 'string', contentEncoding: 'base64' },
        },
      },
    };
    expect(arr(contentEncodingOnOAS30(doc, {}, ctx))).toEqual([]);
  });

  it('walks nested properties', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Wrapper: {
            type: 'object',
            properties: {
              inner: { type: 'string', contentEncoding: 'base64' },
            },
          },
        },
      },
    };
    expect(arr(contentEncodingOnOAS30(doc, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('returns [] on spec without components.schemas', () => {
    expect(arr(contentEncodingOnOAS30({ openapi: '3.0.0' }, {}, ctx))).toEqual([]);
  });

  it('returns [] on non-OAS doc', () => {
    expect(arr(contentEncodingOnOAS30({ swagger: '2.0' }, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// RFC2-103 — precondition428Awareness
// =============================================================================

describe('precondition428Awareness (RFC2-103)', () => {
  it('flags PUT lacking 428 when GET exposes ETag', () => {
    const paths = {
      '/items/{id}': {
        get: {
          responses: {
            '200': { headers: { ETag: { schema: { type: 'string' } } } },
          },
        },
        put: {
          responses: { '200': {}, '404': {} },
        },
      },
    };
    expect(arr(precondition428Awareness(paths, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not flag when PUT declares 428', () => {
    const paths = {
      '/items/{id}': {
        get: {
          responses: {
            '200': { headers: { ETag: { schema: { type: 'string' } } } },
          },
        },
        put: {
          responses: { '200': {}, '428': {} },
        },
      },
    };
    expect(arr(precondition428Awareness(paths, {}, ctx))).toEqual([]);
  });

  it('does not flag when GET has no ETag', () => {
    const paths = {
      '/items/{id}': {
        get: { responses: { '200': {} } },
        put: { responses: { '200': {} } },
      },
    };
    expect(arr(precondition428Awareness(paths, {}, ctx))).toEqual([]);
  });

  it('matches ETag header case-insensitively (etag, Etag)', () => {
    const paths = {
      '/items/{id}': {
        get: {
          responses: {
            '200': { headers: { etag: { schema: { type: 'string' } } } },
          },
        },
        delete: {
          responses: { '204': {} },
        },
      },
    };
    expect(arr(precondition428Awareness(paths, {}, ctx)).length).toBeGreaterThan(0);
  });
});

// =============================================================================
// RFC2-105 — status511Awareness
// =============================================================================

describe('status511Awareness (RFC2-105)', () => {
  it('emits info-finding when no 511 declared anywhere', () => {
    const paths = {
      '/x': { get: { responses: { '200': {} } } },
    };
    expect(arr(status511Awareness(paths, {}, ctx)).length).toBe(1);
  });

  it('does not emit when at least one 511 declared', () => {
    const paths = {
      '/x': { get: { responses: { '200': {}, '511': {} } } },
    };
    expect(arr(status511Awareness(paths, {}, ctx))).toEqual([]);
  });

  it('returns [] on non-object input', () => {
    expect(arr(status511Awareness(null, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-60 — xInternalUsage
// =============================================================================

describe('xInternalUsage (CL-60)', () => {
  it('flags operation marked x-internal: true', () => {
    const paths = {
      '/admin/cleanup': { post: { 'x-internal': true } },
    };
    const out = arr(xInternalUsage(paths, {}, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('POST /admin/cleanup');
  });

  it('does not flag when no x-internal markers present', () => {
    const paths = {
      '/users': { get: {} },
    };
    expect(arr(xInternalUsage(paths, {}, ctx))).toEqual([]);
  });

  it('caps examples at 10 with `+N more` suffix', () => {
    const paths: Record<string, unknown> = {};
    for (let i = 0; i < 15; i++) {
      paths[`/op${i}`] = { post: { 'x-internal': true } };
    }
    const out = arr(xInternalUsage(paths, {}, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toContain('+5 more');
  });

  it('does not flag x-internal: false', () => {
    const paths = {
      '/x': { get: { 'x-internal': false } },
    };
    expect(arr(xInternalUsage(paths, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// F-18 — bloatedDescription
// =============================================================================

describe('bloatedDescription (F-18)', () => {
  it('flags description >1000 chars (string-target mode)', () => {
    const longStr = 'a'.repeat(1500);
    expect(arr(bloatedDescription(longStr, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not flag short description (string-target mode)', () => {
    expect(arr(bloatedDescription('Get a user by id.', {}, ctx))).toEqual([]);
  });

  it('flags repeated boilerplate prefix on >50% operations (document-target mode)', () => {
    const boilerplate =
      'This endpoint requires authentication via Bearer token. Rate limits apply per the global policy. ';
    const doc = {
      paths: {
        '/a': { get: { description: boilerplate + 'Returns A.' } },
        '/b': { get: { description: boilerplate + 'Returns B.' } },
        '/c': { get: { description: boilerplate + 'Returns C.' } },
        '/d': { get: { description: boilerplate + 'Returns D.' } },
      },
    };
    const out = arr(bloatedDescription(doc, {}, ctx));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('boilerplate');
  });

  it('does not flag varied descriptions (document-target mode)', () => {
    const doc = {
      paths: {
        '/users': { get: { description: 'List all users in the workspace.' } },
        '/orders': { get: { description: 'Search orders by date range and status filter.' } },
      },
    };
    expect(arr(bloatedDescription(doc, {}, ctx))).toEqual([]);
  });

  it('returns [] on document with no operations', () => {
    expect(arr(bloatedDescription({ paths: {} }, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// SC-20 — aipStandardFieldPresence
// =============================================================================

describe('aipStandardFieldPresence (SC-20)', () => {
  it('flags AIP-style path missing required `name` field', () => {
    const paths = {
      '/v1/users/{userId}': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const out = arr(aipStandardFieldPresence(paths, {}, ctx));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('name');
  });

  it('flags AIP-style path missing recommended timestamps', () => {
    const paths = {
      '/v1/users/{userId}': {
        get: {
          responses: {
            '200': {
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
    };
    const out = arr(aipStandardFieldPresence(paths, {}, ctx));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toContain('display_name');
  });

  it('does not flag AIP-style path with all standard fields present', () => {
    const paths = {
      '/v1/users/{userId}': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      display_name: { type: 'string' },
                      create_time: { type: 'string', format: 'date-time' },
                      update_time: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    expect(arr(aipStandardFieldPresence(paths, {}, ctx))).toEqual([]);
  });

  it('does not flag non-AIP-style path (no version prefix)', () => {
    const paths = {
      '/users/{id}': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { id: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    };
    expect(arr(aipStandardFieldPresence(paths, {}, ctx))).toEqual([]);
  });

  it('does not flag AIP-style path without inline schema', () => {
    const paths = {
      '/v1/users/{userId}': {
        get: {
          responses: { '200': { description: 'OK' } },
        },
      },
    };
    expect(arr(aipStandardFieldPresence(paths, {}, ctx))).toEqual([]);
  });

  it('flags multi-segment nested AIP-style path missing standard fields', () => {
    const paths = {
      '/v1/parents/{parentId}/children/{childId}': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const out = arr(aipStandardFieldPresence(paths, {}, ctx));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].message).toMatch(/name/);
  });

  it('flags 3-level-nested AIP-style path missing standard fields', () => {
    const paths = {
      '/v2/orgs/{orgId}/projects/{projectId}/secrets/{secretId}': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { value: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const out = arr(aipStandardFieldPresence(paths, {}, ctx));
    expect(out.length).toBeGreaterThan(0);
  });
});
