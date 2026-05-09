/**
 * Tests for the http-protocol-pairings module (T10).
 *
 * Coverage matrix (8+ cases, one per major pairing-class):
 *   1. RFC2-40   401 -> WWW-Authenticate (MUST)
 *   2. RFC2-14   405 -> Allow (MUST)
 *   3. RFC2-32   206 -> Content-Range (MUST)
 *   4. RFC2-94   429 -> Retry-After OR RateLimit-* (MUST, any-of)
 *   5. RFC2-25   304 -> ETag/Last-Modified (SHOULD)
 *   6. RFC2-20   If-Match request -> 412 response (MUST)
 *   7. RFC2-21   If-None-Match GET -> 304 (SHOULD)
 *   8. RFC2-22   If-None-Match PUT -> 412 (MUST)
 *   9. RFC2-30   Range -> 206 (SHOULD)
 *  10. RFC2-26   412 -> conditional-validator parameter (SHOULD)
 *  11. RFC2-46   Prefer -> Preference-Applied (SHOULD)
 *  12. RFC9110-9.3.1 GET with requestBody (MUST not)
 *  13. RFC9110-9.3.2 HEAD response with content body (MUST not)
 *  14. Negative: pairing satisfied -> no finding
 *  15. Severity-class mapping is correct (must -> high, should -> medium, hint -> low)
 *  16. Self-audit: every pairing references real IANA registry entries (table-load smoke)
 */

import { describe, it, expect } from 'vitest';
import { walkHttpProtocolPairings, __test } from '../../deterministic/modules/http-protocol-pairings.js';
import { HTTP_STATUS_CODES } from '../../deterministic/iana/status-codes.js';
import { isRegisteredMethod } from '../../deterministic/iana/methods.js';

// ===========================================================================
// Helpers
// ===========================================================================

interface OpInput {
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, Record<string, unknown>>;
}

function specWithOp(method: string, path: string, op: OpInput): object {
  return {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    paths: {
      [path]: {
        [method.toLowerCase()]: op,
      },
    },
  };
}

function findByPattern(findings: Awaited<ReturnType<typeof walkHttpProtocolPairings>>, patternId: string) {
  return findings.find((f) => f.meta?.patternId === patternId);
}

// ===========================================================================
// Tests
// ===========================================================================

describe('walkHttpProtocolPairings — status -> required-response-header pairings', () => {
  it('flags RFC2-40: 401 response without WWW-Authenticate header', async () => {
    const spec = specWithOp('get', '/things', {
      responses: {
        '200': { description: 'ok' },
        '401': { description: 'unauthorized' },
      },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-40');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
    expect(f!.title).toContain('WWW-Authenticate');
    expect(f!.affectedEndpoints).toEqual([{ path: '/things', method: 'get' }]);
  });

  it('does NOT flag RFC2-40 when WWW-Authenticate IS declared on the 401 response', async () => {
    const spec = specWithOp('get', '/things', {
      responses: {
        '200': { description: 'ok' },
        '401': {
          description: 'unauthorized',
          headers: { 'WWW-Authenticate': { schema: { type: 'string' } } },
        },
      },
    });
    const findings = await walkHttpProtocolPairings(spec);
    expect(findByPattern(findings, 'RFC2-40')).toBeUndefined();
  });

  it('flags RFC2-14: 405 response without Allow header', async () => {
    const spec = specWithOp('get', '/things', {
      responses: { '200': { description: 'ok' }, '405': { description: 'method not allowed' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-14');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
    expect(f!.title).toContain('Allow');
  });

  it('flags RFC2-32: 206 response without Content-Range header', async () => {
    const spec = specWithOp('get', '/files/{id}', {
      responses: { '200': { description: 'ok' }, '206': { description: 'partial' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-32');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
    expect(f!.title).toContain('Content-Range');
  });

  it('flags RFC2-94: 429 response without ANY rate-limit header (any-of pairing)', async () => {
    const spec = specWithOp('post', '/expensive', {
      responses: { '200': { description: 'ok' }, '429': { description: 'too many' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-94');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
  });

  it('does NOT flag RFC2-94 when X-RateLimit-Remaining is declared (any-of satisfaction)', async () => {
    const spec = specWithOp('post', '/expensive', {
      responses: {
        '200': { description: 'ok' },
        '429': {
          description: 'too many',
          headers: { 'X-RateLimit-Remaining': { schema: { type: 'integer' } } },
        },
      },
    });
    const findings = await walkHttpProtocolPairings(spec);
    expect(findByPattern(findings, 'RFC2-94')).toBeUndefined();
  });

  it('flags RFC2-25: 304 response without ETag/Last-Modified at SHOULD severity', async () => {
    const spec = specWithOp('get', '/items/{id}', {
      responses: { '200': { description: 'ok' }, '304': { description: 'not modified' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-25');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('medium'); // SHOULD -> medium
  });
});

describe('walkHttpProtocolPairings — request-header -> required-response-status pairings', () => {
  it('flags RFC2-20: If-Match request param on PUT without 412 response', async () => {
    const spec = specWithOp('put', '/items/{id}', {
      parameters: [{ name: 'If-Match', in: 'header', schema: { type: 'string' } }],
      responses: { '200': { description: 'ok' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-20');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
    expect(f!.title).toContain('If-Match');
    expect(f!.title).toContain('412');
  });

  it('does NOT flag RFC2-20 on a GET (only applies to state-changing methods)', async () => {
    const spec = specWithOp('get', '/items/{id}', {
      parameters: [{ name: 'If-Match', in: 'header', schema: { type: 'string' } }],
      responses: { '200': { description: 'ok' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    expect(findByPattern(findings, 'RFC2-20')).toBeUndefined();
  });

  it('flags RFC2-21: If-None-Match on GET without 304 response (SHOULD)', async () => {
    const spec = specWithOp('get', '/items/{id}', {
      parameters: [{ name: 'If-None-Match', in: 'header', schema: { type: 'string' } }],
      responses: { '200': { description: 'ok' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-21');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('medium');
  });

  it('flags RFC2-22: If-None-Match on PUT/PATCH/DELETE without 412 (MUST)', async () => {
    const spec = specWithOp('patch', '/items/{id}', {
      parameters: [{ name: 'If-None-Match', in: 'header', schema: { type: 'string' } }],
      responses: { '200': { description: 'ok' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-22');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
  });

  it('flags RFC2-30: Range request on GET without 206 response (SHOULD)', async () => {
    const spec = specWithOp('get', '/files/{id}', {
      parameters: [{ name: 'Range', in: 'header', schema: { type: 'string' } }],
      responses: { '200': { description: 'ok' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    expect(findByPattern(findings, 'RFC2-30')).toBeDefined();
    expect(findByPattern(findings, 'RFC2-31')).toBeDefined(); // 416 also missing
  });

  it('flags RFC2-26: 412 response without any conditional-validator request header', async () => {
    const spec = specWithOp('put', '/items/{id}', {
      responses: { '200': { description: 'ok' }, '412': { description: 'precondition failed' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-26');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('medium'); // SHOULD
  });

  it('does NOT flag RFC2-26 when If-Match request parameter is present', async () => {
    const spec = specWithOp('put', '/items/{id}', {
      parameters: [{ name: 'If-Match', in: 'header', schema: { type: 'string' } }],
      responses: {
        '200': { description: 'ok' },
        '412': { description: 'precondition failed' },
      },
    });
    const findings = await walkHttpProtocolPairings(spec);
    expect(findByPattern(findings, 'RFC2-26')).toBeUndefined();
  });

  it('flags RFC2-46: Prefer request param without Preference-Applied response header', async () => {
    const spec = specWithOp('post', '/jobs', {
      parameters: [{ name: 'Prefer', in: 'header', schema: { type: 'string' } }],
      responses: { '200': { description: 'ok' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    expect(findByPattern(findings, 'RFC2-46')).toBeDefined();
  });
});

describe('walkHttpProtocolPairings — method body rules', () => {
  it('flags RFC9110-9.3.1: GET operation with requestBody declared', async () => {
    const spec = specWithOp('get', '/things', {
      requestBody: {
        content: { 'application/json': { schema: { type: 'object' } } },
      },
      responses: { '200': { description: 'ok' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC9110-9.3.1');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
    expect(f!.title).toContain('GET');
  });

  it('flags RFC9110-9.3.1: DELETE with requestBody (OAS-3 forbidden)', async () => {
    const spec = specWithOp('delete', '/items/{id}', {
      requestBody: {
        content: { 'application/json': { schema: { type: 'object' } } },
      },
      responses: { '204': { description: 'no content' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC9110-9.3.1');
    expect(f).toBeDefined();
    expect(f!.title).toContain('DELETE');
  });

  it('flags RFC9110-9.3.2: HEAD response with content body declared', async () => {
    const spec = specWithOp('head', '/things', {
      responses: {
        '200': {
          description: 'ok',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
      },
    });
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC9110-9.3.2');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
  });

  it('does NOT flag POST with requestBody (allowed)', async () => {
    const spec = specWithOp('post', '/things', {
      requestBody: {
        content: { 'application/json': { schema: { type: 'object' } } },
      },
      responses: { '201': { description: 'created' } },
    });
    const findings = await walkHttpProtocolPairings(spec);
    expect(findByPattern(findings, 'RFC9110-9.3.1')).toBeUndefined();
  });
});

describe('walkHttpProtocolPairings — aggregation + meta', () => {
  it('aggregates multiple endpoints into one finding per (pattern, trigger, missing) tuple', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/a': { get: { responses: { '401': { description: 'unauth' } } } },
        '/b': { get: { responses: { '401': { description: 'unauth' } } } },
        '/c': { post: { responses: { '401': { description: 'unauth' } } } },
      },
    };
    const findings = await walkHttpProtocolPairings(spec);
    const f = findByPattern(findings, 'RFC2-40');
    expect(f).toBeDefined();
    expect(f!.affectedEndpoints).toHaveLength(3);
    expect(f!.meta!.count).toBe(3);
  });

  it('sorts findings by patternId ascending', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/a': {
          get: {
            responses: {
              '401': { description: 'unauth' },
              '405': { description: 'noway' },
            },
          },
        },
      },
    };
    const findings = await walkHttpProtocolPairings(spec);
    const ids = findings.map((f) => f.meta?.patternId);
    const sorted = [...ids].sort((a, b) => String(a).localeCompare(String(b)));
    expect(ids).toEqual(sorted);
  });

  it('returns no findings on a fully-clean spec', async () => {
    const spec = specWithOp('get', '/things', {
      responses: {
        '200': { description: 'ok' },
        '401': {
          description: 'unauth',
          headers: { 'WWW-Authenticate': { schema: { type: 'string' } } },
        },
      },
    });
    const findings = await walkHttpProtocolPairings(spec);
    expect(findings).toEqual([]);
  });
});

describe('walkHttpProtocolPairings — pairings-table self-audit', () => {
  it('every pairing-table entry references real IANA-registered status codes', () => {
    for (const p of __test.STATUS_HEADER_PAIRINGS) {
      expect(HTTP_STATUS_CODES.has(p.status)).toBe(true);
    }
    for (const p of __test.REQUEST_RESPONSE_PAIRINGS) {
      const arr = Array.isArray(p.requiredStatuses) ? p.requiredStatuses : [p.requiredStatuses];
      for (const s of arr) {
        expect(HTTP_STATUS_CODES.has(s)).toBe(true);
      }
    }
    for (const p of __test.RESPONSE_REQUEST_PAIRINGS) {
      expect(HTTP_STATUS_CODES.has(p.status)).toBe(true);
    }
    for (const p of __test.PREFER_VALUE_PAIRINGS) {
      expect(HTTP_STATUS_CODES.has(p.requiredStatus)).toBe(true);
    }
  });

  it('every pairing-table entry references real IANA-registered methods', () => {
    for (const p of __test.REQUEST_RESPONSE_PAIRINGS) {
      for (const m of p.applicableMethods) {
        expect(isRegisteredMethod(m)).toBe(true);
      }
    }
    for (const m of __test.NO_REQUEST_BODY_METHODS) {
      expect(isRegisteredMethod(m)).toBe(true);
    }
  });

  it('covers all required RFC2-* pattern IDs from T10 brief', () => {
    const allIds = new Set<string>();
    for (const p of __test.STATUS_HEADER_PAIRINGS) allIds.add(p.patternId);
    for (const p of __test.REQUEST_RESPONSE_PAIRINGS) allIds.add(p.patternId);
    for (const p of __test.REQUEST_RESPONSE_HEADER_PAIRINGS) allIds.add(p.patternId);
    for (const p of __test.RESPONSE_REQUEST_PAIRINGS) allIds.add(p.patternId);
    for (const p of __test.PREFER_VALUE_PAIRINGS) allIds.add(p.patternId);
    // T10 task brief lists these required pattern IDs:
    const required = [
      'RFC2-14', 'RFC2-15', 'RFC2-20', 'RFC2-21', 'RFC2-22',
      'RFC2-23', 'RFC2-24', 'RFC2-25', 'RFC2-26',
      'RFC2-30', 'RFC2-31', 'RFC2-32',
      'RFC2-40', 'RFC2-41', 'RFC2-46', 'RFC2-48',
      'RFC2-94', 'RFC2-96',
    ];
    for (const r of required) {
      expect(allIds).toContain(r);
    }
  });
});
