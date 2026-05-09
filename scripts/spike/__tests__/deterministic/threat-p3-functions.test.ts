/**
 * Unit tests for the P3 Threat-Modeling custom Spectral functions
 * (T16c, Welle D). Each test exercises a function with a synthetic
 * targetVal + context shape, asserting the function emits / doesn't emit
 * the expected diagnostic.
 */

import { describe, it, expect } from 'vitest';
import type { IFunctionContext } from '@stoplight/spectral-core';

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

/* eslint-disable @typescript-eslint/no-explicit-any */
function ctx(pathArr: (string | number)[], docData?: unknown): IFunctionContext {
  return {
    path: pathArr,
    document: docData ? ({ data: docData } as any) : undefined,
    documentInventory: {} as any,
    rule: {} as any,
  } as unknown as IFunctionContext;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('sensitiveHeaderNameRejected', () => {
  it('flags `password` header parameter', () => {
    const param = { name: 'password', in: 'header' };
    const r = sensitiveHeaderNameRejected(
      param,
      {},
      ctx(['paths', '/x', 'get', 'parameters', 0])
    );
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag `Authorization` header (allowlisted)', () => {
    const param = { name: 'Authorization', in: 'header' };
    const r = sensitiveHeaderNameRejected(param, {}, ctx(['paths']));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });

  it('does not flag query parameter named password', () => {
    const param = { name: 'password', in: 'query' };
    const r = sensitiveHeaderNameRejected(param, {}, ctx(['paths']));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('postCreatesNeedIdempotencyKey', () => {
  it('flags POST creating a resource without Idempotency-Key', () => {
    const op = {
      requestBody: { content: { 'application/json': {} } },
      responses: { '201': {} },
    };
    const r = postCreatesNeedIdempotencyKey(
      op,
      {},
      ctx(['paths', '/things', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag POST with Idempotency-Key parameter', () => {
    const op = {
      parameters: [{ name: 'Idempotency-Key', in: 'header' }],
      responses: { '201': {} },
    };
    const r = postCreatesNeedIdempotencyKey(
      op,
      {},
      ctx(['paths', '/things', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });

  it('does not flag POST on /things/{id} (action-style)', () => {
    const op = { responses: { '201': {} } };
    const r = postCreatesNeedIdempotencyKey(
      op,
      {},
      ctx(['paths', '/things/{id}', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('threeOrMoreIdParamsBola', () => {
  it('flags path with 3 ID-template segments', () => {
    const r = threeOrMoreIdParamsBola(
      undefined,
      {},
      ctx(['paths', '/orgs/{orgId}/teams/{teamId}/members/{memberId}'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag path with 2 ID segments', () => {
    const r = threeOrMoreIdParamsBola(
      undefined,
      {},
      ctx(['paths', '/orgs/{orgId}/teams/{teamId}'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('bodyContainsUserIdOnNonAdmin', () => {
  it('flags non-admin POST with user_id in body', () => {
    const op = {
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { user_id: { type: 'string' } } },
          },
        },
      },
    };
    const r = bodyContainsUserIdOnNonAdmin(
      op,
      {},
      ctx(['paths', '/things', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag /admin path', () => {
    const op = {
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { user_id: { type: 'string' } } },
          },
        },
      },
    };
    const r = bodyContainsUserIdOnNonAdmin(
      op,
      {},
      ctx(['paths', '/admin/things', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('multipleAndSecuritySameType', () => {
  it('flags AND of two apiKey schemes', () => {
    const op = { security: [{ k1: [], k2: [] }] };
    const doc = {
      components: {
        securitySchemes: {
          k1: { type: 'apiKey' },
          k2: { type: 'apiKey' },
        },
      },
    };
    const r = multipleAndSecuritySameType(op, {}, ctx(['paths', '/x', 'get'], doc));
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag AND of mixed types', () => {
    const op = { security: [{ k1: [], b1: [] }] };
    const doc = {
      components: {
        securitySchemes: {
          k1: { type: 'apiKey' },
          b1: { type: 'http' },
        },
      },
    };
    const r = multipleAndSecuritySameType(op, {}, ctx(['paths', '/x', 'get'], doc));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('longRunningOpAsyncPattern', () => {
  it('flags long-running op without 202', () => {
    const op = {
      description: 'May take several minutes.',
      responses: { '200': {} },
    };
    const r = longRunningOpAsyncPattern(op, {}, ctx(['paths', '/jobs', 'post']));
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag short op', () => {
    const op = { description: 'Quick lookup.', responses: { '200': {} } };
    const r = longRunningOpAsyncPattern(op, {}, ctx(['paths', '/things', 'get']));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('adminSharesPublicSecurity', () => {
  it('flags shared scheme between admin and public paths', () => {
    const doc = {
      security: [{ apiKey: [] }],
      paths: {
        '/things': { get: {} },
        '/admin/users': { get: {} },
      },
    };
    const r = adminSharesPublicSecurity(doc, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag distinct admin scheme', () => {
    const doc = {
      security: [{ apiKey: [] }],
      paths: {
        '/things': { get: {} },
        '/admin/users': { get: { security: [{ adminBearer: [] }] } },
      },
    };
    const r = adminSharesPublicSecurity(doc, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('resourceOnlyGetNoWrite', () => {
  it('flags resource tree with GETs but no writes', () => {
    const doc = {
      paths: {
        '/items': { get: {} },
        '/items/{id}': { get: {} },
      },
    };
    const r = resourceOnlyGetNoWrite(doc, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag resource tree with writes', () => {
    const doc = {
      paths: {
        '/items': { get: {}, post: {} },
        '/items/{id}': { get: {} },
      },
    };
    const r = resourceOnlyGetNoWrite(doc, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('nonStandardMethodNeedsSecurity', () => {
  it('flags TRACE without security', () => {
    const doc = {
      paths: {
        '/echo': { trace: {} },
      },
    };
    const r = nonStandardMethodNeedsSecurity(doc, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag TRACE with operation-level security', () => {
    const doc = {
      paths: {
        '/echo': { trace: { security: [{ apiKey: [] }] } },
      },
    };
    const r = nonStandardMethodNeedsSecurity(doc, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });

  it('does not flag GET (standard method)', () => {
    const doc = { paths: { '/x': { get: {} } } };
    const r = nonStandardMethodNeedsSecurity(doc, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('signupNeedsRateLimitOrCaptcha', () => {
  it('flags POST /signup with no rate-limit or captcha', () => {
    const op = { responses: { '201': {} } };
    const r = signupNeedsRateLimitOrCaptcha(
      op,
      {},
      ctx(['paths', '/signup', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag /signup with rate-limit header', () => {
    const op = {
      responses: {
        '201': { headers: { 'X-RateLimit-Limit': {} } },
      },
    };
    const r = signupNeedsRateLimitOrCaptcha(
      op,
      {},
      ctx(['paths', '/signup', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('postingCommentNeedsRateLimit', () => {
  it('flags POST /comments without rate-limit', () => {
    const op = { responses: { '201': {} } };
    const r = postingCommentNeedsRateLimit(
      op,
      {},
      ctx(['paths', '/comments', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag random POST', () => {
    const op = { responses: { '201': {} } };
    const r = postingCommentNeedsRateLimit(
      op,
      {},
      ctx(['paths', '/things', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('hostParamFlaggedForSsrf', () => {
  it('flags `host` parameter without allowlist mention', () => {
    const param = { name: 'host', in: 'query', description: '' };
    const r = hostParamFlaggedForSsrf(param, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag `host` with allowlist description', () => {
    const param = {
      name: 'host',
      in: 'query',
      description: 'Validated against allowlist.',
    };
    const r = hostParamFlaggedForSsrf(param, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('corsOriginReflectionWithoutAllowlist', () => {
  it('flags Access-Control-Allow-Origin: * example', () => {
    const headers = {
      'Access-Control-Allow-Origin': { schema: { example: '*' } },
    };
    const r = corsOriginReflectionWithoutAllowlist(headers, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag CORS header with allowlist description', () => {
    const headers = {
      'Access-Control-Allow-Origin': {
        description: 'Validated against allowlist.',
        schema: { example: 'https://app.example.com' },
      },
    };
    const r = corsOriginReflectionWithoutAllowlist(headers, {}, ctx([]));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('browserApiNeedsSecurityHeaders', () => {
  it('flags HTML response without security headers', () => {
    const op = {
      responses: {
        '200': {
          content: { 'text/html': { schema: {} } },
        },
      },
    };
    const r = browserApiNeedsSecurityHeaders(op, {}, ctx(['paths', '/page', 'get']));
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag HTML response with HSTS', () => {
    const op = {
      responses: {
        '200': {
          headers: { 'Strict-Transport-Security': {} },
          content: { 'text/html': {} },
        },
      },
    };
    const r = browserApiNeedsSecurityHeaders(op, {}, ctx(['paths', '/page', 'get']));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });

  it('does not flag JSON-only response', () => {
    const op = {
      responses: {
        '200': { content: { 'application/json': {} } },
      },
    };
    const r = browserApiNeedsSecurityHeaders(op, {}, ctx(['paths', '/x', 'get']));
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('upstreamUrlOpNeeds5xxExplicit', () => {
  it('flags upstream-URL op without 502/503/504', () => {
    const op = {
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
      responses: { '200': {}, '400': {} },
    };
    const r = upstreamUrlOpNeeds5xxExplicit(
      op,
      {},
      ctx(['paths', '/proxy', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag op with 502+503+504', () => {
    const op = {
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
      responses: { '200': {}, '502': {}, '503': {}, '504': {} },
    };
    const r = upstreamUrlOpNeeds5xxExplicit(
      op,
      {},
      ctx(['paths', '/proxy', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });

  it('does not flag op without upstream URL', () => {
    const op = { responses: { '200': {} } };
    const r = upstreamUrlOpNeeds5xxExplicit(
      op,
      {},
      ctx(['paths', '/things', 'get'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});

describe('webhookRejectsWildcardContentType', () => {
  it('flags webhook accepting */*', () => {
    const op = {
      requestBody: { content: { '*/*': {} } },
    };
    const r = webhookRejectsWildcardContentType(
      op,
      {},
      ctx(['paths', '/webhooks/receive', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBeGreaterThan(0);
  });

  it('does not flag webhook accepting application/json', () => {
    const op = {
      requestBody: { content: { 'application/json': {} } },
    };
    const r = webhookRejectsWildcardContentType(
      op,
      {},
      ctx(['paths', '/webhooks/receive', 'post'])
    );
    expect(Array.isArray(r) ? r.length : 0).toBe(0);
  });
});
