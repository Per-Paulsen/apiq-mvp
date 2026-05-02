/**
 * Tests for `countEndpoints` (Epic 03 AC #11 / #12 — endpoint-count thresholds).
 *
 * Per Epic 03 Open Question recommendation, ALL eight HTTP methods are counted
 * (including options/head/trace).
 */
import { describe, expect, it } from 'vitest';

import { countEndpoints } from '@/lib/spec-ingestion/endpoint-count';

describe('countEndpoints', () => {
  it('returns 0 for empty paths', () => {
    expect(countEndpoints({ openapi: '3.0.1', paths: {} })).toBe(0);
  });

  it('returns 0 when paths is missing', () => {
    expect(countEndpoints({ openapi: '3.0.1' })).toBe(0);
  });

  it('returns 0 for null / non-object input', () => {
    expect(countEndpoints(null)).toBe(0);
    expect(countEndpoints(undefined)).toBe(0);
    expect(countEndpoints('not-a-spec')).toBe(0);
  });

  it('returns 1 for a single GET on one path', () => {
    const spec = {
      openapi: '3.0.1',
      paths: {
        '/x': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    expect(countEndpoints(spec)).toBe(1);
  });

  it('counts all 8 HTTP methods on a single path', () => {
    const op = { responses: { '200': { description: 'ok' } } };
    const spec = {
      openapi: '3.0.1',
      paths: {
        '/x': {
          get: op,
          post: op,
          put: op,
          patch: op,
          delete: op,
          options: op,
          head: op,
          trace: op,
        },
      },
    };
    expect(countEndpoints(spec)).toBe(8);
  });

  it('counts methods across multiple paths', () => {
    const op = { responses: { '200': { description: 'ok' } } };
    const spec = {
      openapi: '3.0.1',
      paths: {
        '/a': { get: op, post: op }, // 2
        '/b': { get: op }, // 1
        '/c': { delete: op, patch: op, put: op }, // 3
      },
    };
    expect(countEndpoints(spec)).toBe(6);
  });

  it('skips non-method keys on a path object (parameters, summary, description, $ref)', () => {
    const op = { responses: { '200': { description: 'ok' } } };
    const spec = {
      openapi: '3.0.1',
      paths: {
        '/x': {
          summary: 'A path summary',
          description: 'a description',
          parameters: [{ name: 'q', in: 'query' }],
          get: op,
          post: op,
        },
      },
    };
    expect(countEndpoints(spec)).toBe(2);
  });

  it('skips path entries that are not objects', () => {
    const spec = {
      openapi: '3.0.1',
      paths: {
        '/null': null,
        '/string': 'oops',
        '/x': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    expect(countEndpoints(spec)).toBe(1);
  });
});
