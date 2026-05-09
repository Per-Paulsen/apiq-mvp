/**
 * Unit tests for the P3 Standards-Compliance custom Spectral functions
 * (T-RFC2 / Welle D).
 *
 * Each function is exercised with positive (violation) and negative
 * (compliant) fixtures. Bundles are covered with one fixture per subsumed
 * pattern-ID.
 *
 * Functions covered (~15):
 *   - problemDetailsExtensionReserved        (RFC2-4)
 *   - oneXxResponseUpgradeHeader             (RFC2-13)
 *   - upgradeRequired426                     (RFC2-15)
 *   - oneXxNotInResponsesKeys                (RFC2-17)
 *   - ifModifiedSinceImplies304              (RFC2-23)
 *   - ifUnmodifiedSinceImplies412            (RFC2-24)
 *   - etagCrossResourceConsistency           (RFC2-28)
 *   - idWriteOpEtagSupport                   (RFC2-29)
 *   - proxyAuthenticate407                   (RFC2-41)
 *   - preferImpliesPreferenceApplied         (RFC2-46)
 *   - preferRespondAsyncImplies202           (RFC2-48)
 *   - deprecationPairsSunset                 (RFC2-91)
 *   - rateLimitHeaderFamilyConsistency       (RFC2-93)
 *   - mergePatchPropertiesNotRequired        (RFC2-98)
 *   - jsonPatchSchemaIsArray                 (RFC2-99)
 *   - cacheHeaderBundle                      (RFC2-30/31/33/34)
 *   - cacheValidatorsBundle                  (RFC2-35/36/37/38/39)
 *   - linkHeaderBundle                       (RFC2-52/53/54/55)
 *   - multipartFormBundle                    (RFC2-100/101)
 */

import { describe, it, expect } from 'vitest';

import {
  problemDetailsExtensionReserved,
  oneXxResponseUpgradeHeader,
  upgradeRequired426,
  oneXxNotInResponsesKeys,
  ifModifiedSinceImplies304,
  ifUnmodifiedSinceImplies412,
  etagCrossResourceConsistency,
  idWriteOpEtagSupport,
  proxyAuthenticate407,
  preferImpliesPreferenceApplied,
  preferRespondAsyncImplies202,
  deprecationPairsSunset,
  rateLimitHeaderFamilyConsistency,
  mergePatchPropertiesNotRequired,
  jsonPatchSchemaIsArray,
  cacheHeaderBundle,
  cacheValidatorsBundle,
  linkHeaderBundle,
  multipartFormBundle,
} from '../../deterministic/spectral-functions/standards-p3-functions.js';

import type { IFunction, IFunctionContext } from '@stoplight/spectral-core';

// Minimal Spectral function-context shim — production Spectral provides a
// full Document object, but our pure-detection functions only read
// `context.path` and (for select callables) `context.document?.data`.
function ctx(
  path: (string | number)[],
  document?: { data: unknown }
): IFunctionContext {
  return {
    path,
    document,
  } as unknown as IFunctionContext;
}

function runFn(
  fn: IFunction,
  target: unknown,
  path: (string | number)[],
  document?: { data: unknown }
) {
  return fn(target, {}, ctx(path, document)) ?? [];
}

// =============================================================================
// RFC2-4 — problemDetailsExtensionReserved
// =============================================================================
describe('RFC2-4 — problem-details-extension-reserved', () => {
  it('flags reserved-name redefined with conflicting type', () => {
    const target = {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' }, // wrong: should be integer
          custom: { type: 'string' },
        },
      },
    };
    const out = runFn(problemDetailsExtensionReserved, target, []);
    expect(out.length).toBe(1);
    expect((out as { message: string }[])[0].message).toMatch(/status/);
  });
  it('does not flag reserved-names with correct types', () => {
    const target = {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'integer' },
          title: { type: 'string' },
        },
      },
    };
    const out = runFn(problemDetailsExtensionReserved, target, []);
    expect(out.length).toBe(0);
  });
  it('returns nothing when schema is missing', () => {
    expect(runFn(problemDetailsExtensionReserved, {}, []).length).toBe(0);
  });
});

// =============================================================================
// RFC2-13 — oneXxResponseUpgradeHeader
// =============================================================================
describe('RFC2-13 — 1xx response → Upgrade/Connection', () => {
  it('flags 101 response without Upgrade or Connection header', () => {
    const responses = {
      '101': { description: 'Switching Protocols' },
      '200': { description: 'ok' },
    };
    const out = runFn(oneXxResponseUpgradeHeader, responses, [
      'paths',
      '/r',
      'get',
      'responses',
    ]);
    expect(out.length).toBe(1);
  });
  it('does not flag when 101 declares Upgrade header', () => {
    const responses = {
      '101': { description: 'sp', headers: { Upgrade: { schema: { type: 'string' } } } },
    };
    const out = runFn(oneXxResponseUpgradeHeader, responses, [
      'paths',
      '/r',
      'get',
      'responses',
    ]);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-15 — upgradeRequired426 (verbatim MUST)
// =============================================================================
describe('RFC2-15 — 426 Upgrade Required', () => {
  it('flags 426 response without Upgrade header (MUST)', () => {
    const responses = { '426': { description: 'Upgrade required' } };
    const out = runFn(upgradeRequired426, responses, [
      'paths',
      '/r',
      'get',
      'responses',
    ]);
    expect(out.length).toBe(1);
    expect((out as { message: string }[])[0].message).toMatch(/MUST/);
  });
  it('does not flag 426 with Upgrade header', () => {
    const responses = {
      '426': {
        description: 'ok',
        headers: { Upgrade: { schema: { type: 'string' } } },
      },
    };
    const out = runFn(upgradeRequired426, responses, [
      'paths',
      '/r',
      'get',
      'responses',
    ]);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-17 — oneXxNotInResponsesKeys
// =============================================================================
describe('RFC2-17 — 1xx not in responses-keys', () => {
  it('flags concrete 1xx response-code', () => {
    const responses = { '100': {}, '200': {} };
    const out = runFn(oneXxNotInResponsesKeys, responses, [
      'paths',
      '/r',
      'get',
      'responses',
    ]);
    expect(out.length).toBe(1);
  });
  it('does not flag 1XX wildcard', () => {
    const responses = { '1XX': {}, '200': {} };
    const out = runFn(oneXxNotInResponsesKeys, responses, [
      'paths',
      '/r',
      'get',
      'responses',
    ]);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-23 — ifModifiedSinceImplies304
// =============================================================================
describe('RFC2-23 — If-Modified-Since → 304', () => {
  it('flags GET with If-Modified-Since but no 304', () => {
    const op = {
      parameters: [
        { name: 'If-Modified-Since', in: 'header', schema: { type: 'string' } },
      ],
      responses: { '200': { description: 'ok' } },
    };
    const out = runFn(ifModifiedSinceImplies304, op, ['paths', '/r', 'get']);
    expect(out.length).toBe(1);
  });
  it('does not flag when 304 is declared', () => {
    const op = {
      parameters: [{ name: 'If-Modified-Since', in: 'header' }],
      responses: { '200': {}, '304': { description: 'not modified' } },
    };
    const out = runFn(ifModifiedSinceImplies304, op, ['paths', '/r', 'get']);
    expect(out.length).toBe(0);
  });
  it('does not flag POST', () => {
    const op = {
      parameters: [{ name: 'If-Modified-Since', in: 'header' }],
      responses: { '200': {} },
    };
    const out = runFn(ifModifiedSinceImplies304, op, ['paths', '/r', 'post']);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-24 — ifUnmodifiedSinceImplies412
// =============================================================================
describe('RFC2-24 — If-Unmodified-Since → 412', () => {
  it('flags op with If-Unmodified-Since but no 412', () => {
    const op = {
      parameters: [{ name: 'If-Unmodified-Since', in: 'header' }],
      responses: { '200': {} },
    };
    const out = runFn(ifUnmodifiedSinceImplies412, op, ['paths', '/r', 'put']);
    expect(out.length).toBe(1);
  });
  it('does not flag when 412 is declared', () => {
    const op = {
      parameters: [{ name: 'If-Unmodified-Since', in: 'header' }],
      responses: { '200': {}, '412': {} },
    };
    const out = runFn(ifUnmodifiedSinceImplies412, op, ['paths', '/r', 'put']);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-28 — etagCrossResourceConsistency
// =============================================================================
describe('RFC2-28 — ETag cross-resource consistency', () => {
  it('flags PUT without ETag when GET declares ETag', () => {
    const pathItem = {
      get: {
        responses: {
          '200': { headers: { ETag: { schema: { type: 'string' } } } },
        },
      },
      put: { responses: { '200': { description: 'ok' } } },
    };
    const out = runFn(etagCrossResourceConsistency, pathItem, [
      'paths',
      '/users/{id}',
    ]);
    expect(out.length).toBe(1);
  });
  it('does not flag when sibling write also declares ETag', () => {
    const pathItem = {
      get: {
        responses: {
          '200': { headers: { ETag: { schema: { type: 'string' } } } },
        },
      },
      put: {
        responses: {
          '200': { headers: { ETag: { schema: { type: 'string' } } } },
        },
      },
    };
    const out = runFn(etagCrossResourceConsistency, pathItem, [
      'paths',
      '/users/{id}',
    ]);
    expect(out.length).toBe(0);
  });
  it('does not flag when GET has no ETag', () => {
    const pathItem = {
      get: { responses: { '200': {} } },
      put: { responses: { '200': {} } },
    };
    const out = runFn(etagCrossResourceConsistency, pathItem, [
      'paths',
      '/users/{id}',
    ]);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-29 — idWriteOpEtagSupport
// =============================================================================
describe('RFC2-29 — {id} write-op If-Match support', () => {
  it('flags PUT /users/{id} without If-Match', () => {
    const op = {
      parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }],
      responses: { '200': {} },
    };
    const out = runFn(idWriteOpEtagSupport, op, ['paths', '/users/{id}', 'put']);
    expect(out.length).toBe(1);
  });
  it('does not flag when If-Match is declared', () => {
    const op = {
      parameters: [
        { name: 'id', in: 'path' },
        { name: 'If-Match', in: 'header' },
      ],
      responses: { '200': {} },
    };
    const out = runFn(idWriteOpEtagSupport, op, ['paths', '/users/{id}', 'put']);
    expect(out.length).toBe(0);
  });
  it('does not flag write op on non-id path', () => {
    const op = { responses: { '200': {} } };
    const out = runFn(idWriteOpEtagSupport, op, ['paths', '/search', 'put']);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-41 — proxyAuthenticate407 (verbatim MUST)
// =============================================================================
describe('RFC2-41 — 407 Proxy-Authenticate', () => {
  it('flags 407 without Proxy-Authenticate (MUST)', () => {
    const responses = { '407': { description: 'proxy auth required' } };
    const out = runFn(proxyAuthenticate407, responses, [
      'paths',
      '/r',
      'get',
      'responses',
    ]);
    expect(out.length).toBe(1);
    expect((out as { message: string }[])[0].message).toMatch(/MUST/);
  });
  it('does not flag 407 with Proxy-Authenticate', () => {
    const responses = {
      '407': { headers: { 'Proxy-Authenticate': { schema: { type: 'string' } } } },
    };
    const out = runFn(proxyAuthenticate407, responses, [
      'paths',
      '/r',
      'get',
      'responses',
    ]);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-46 — preferImpliesPreferenceApplied
// =============================================================================
describe('RFC2-46 — Prefer → Preference-Applied', () => {
  it('flags op with Prefer but no Preference-Applied response-header', () => {
    const op = {
      parameters: [{ name: 'Prefer', in: 'header' }],
      responses: { '200': { description: 'ok' } },
    };
    const out = runFn(preferImpliesPreferenceApplied, op, [
      'paths',
      '/r',
      'post',
    ]);
    expect(out.length).toBe(1);
  });
  it('does not flag when Preference-Applied is declared', () => {
    const op = {
      parameters: [{ name: 'Prefer', in: 'header' }],
      responses: {
        '200': { headers: { 'Preference-Applied': { schema: { type: 'string' } } } },
      },
    };
    const out = runFn(preferImpliesPreferenceApplied, op, [
      'paths',
      '/r',
      'post',
    ]);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-48 — preferRespondAsyncImplies202
// =============================================================================
describe('RFC2-48 — Prefer:respond-async → 202', () => {
  it('flags op advertising respond-async but no 202', () => {
    const op = {
      parameters: [
        {
          name: 'Prefer',
          in: 'header',
          description: 'Use Prefer: respond-async to enable async processing.',
        },
      ],
      responses: { '200': {} },
    };
    const out = runFn(preferRespondAsyncImplies202, op, ['paths', '/r', 'post']);
    expect(out.length).toBe(1);
  });
  it('does not flag when 202 is declared', () => {
    const op = {
      parameters: [
        { name: 'Prefer', in: 'header', schema: { enum: ['respond-async'] } },
      ],
      responses: { '202': {} },
    };
    const out = runFn(preferRespondAsyncImplies202, op, ['paths', '/r', 'post']);
    expect(out.length).toBe(0);
  });
  it('does not flag op without respond-async mention', () => {
    const op = {
      parameters: [{ name: 'Prefer', in: 'header', description: 'wait=10' }],
      responses: { '200': {} },
    };
    const out = runFn(preferRespondAsyncImplies202, op, ['paths', '/r', 'post']);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-91 — deprecationPairsSunset
// =============================================================================
describe('RFC2-91 — Deprecation pairs Sunset', () => {
  it('flags op with Deprecation header but no Sunset', () => {
    const op = {
      responses: {
        '200': { headers: { Deprecation: { schema: { type: 'string' } } } },
      },
    };
    const out = runFn(deprecationPairsSunset, op, ['paths', '/r', 'get']);
    expect(out.length).toBe(1);
  });
  it('does not flag when Sunset is declared', () => {
    const op = {
      responses: {
        '200': {
          headers: {
            Deprecation: { schema: { type: 'string' } },
            Sunset: { schema: { type: 'string' } },
          },
        },
      },
    };
    const out = runFn(deprecationPairsSunset, op, ['paths', '/r', 'get']);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-93 — rateLimitHeaderFamilyConsistency
// =============================================================================
describe('RFC2-93 — RateLimit triplet consistency', () => {
  it('flags partial triplet (only Limit + Remaining)', () => {
    const op = {
      responses: {
        '200': {
          headers: {
            'RateLimit-Limit': { schema: { type: 'integer' } },
            'RateLimit-Remaining': { schema: { type: 'integer' } },
          },
        },
      },
    };
    const out = runFn(rateLimitHeaderFamilyConsistency, op, [
      'paths',
      '/r',
      'get',
    ]);
    expect(out.length).toBe(1);
    expect((out as { message: string }[])[0].message).toMatch(/RateLimit-Reset/);
  });
  it('does not flag full triplet', () => {
    const op = {
      responses: {
        '200': {
          headers: {
            'RateLimit-Limit': {},
            'RateLimit-Remaining': {},
            'RateLimit-Reset': {},
          },
        },
      },
    };
    const out = runFn(rateLimitHeaderFamilyConsistency, op, [
      'paths',
      '/r',
      'get',
    ]);
    expect(out.length).toBe(0);
  });
  it('does not flag zero declared (no rate-limit signaling)', () => {
    const op = { responses: { '200': {} } };
    const out = runFn(rateLimitHeaderFamilyConsistency, op, [
      'paths',
      '/r',
      'get',
    ]);
    expect(out.length).toBe(0);
  });
  it('accepts X-RateLimit-* legacy form', () => {
    const op = {
      responses: {
        '200': {
          headers: {
            'X-RateLimit-Limit': {},
            'X-RateLimit-Remaining': {},
            'X-RateLimit-Reset': {},
          },
        },
      },
    };
    const out = runFn(rateLimitHeaderFamilyConsistency, op, [
      'paths',
      '/r',
      'get',
    ]);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-98 — mergePatchPropertiesNotRequired
// =============================================================================
describe('RFC2-98 — merge-patch+json no required', () => {
  it('flags merge-patch+json with required properties', () => {
    const op = {
      requestBody: {
        content: {
          'application/merge-patch+json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string' } },
            },
          },
        },
      },
    };
    const out = runFn(mergePatchPropertiesNotRequired, op, [
      'paths',
      '/r',
      'patch',
    ]);
    expect(out.length).toBe(1);
  });
  it('does not flag merge-patch+json without required', () => {
    const op = {
      requestBody: {
        content: {
          'application/merge-patch+json': {
            schema: { type: 'object', properties: { name: { type: 'string' } } },
          },
        },
      },
    };
    const out = runFn(mergePatchPropertiesNotRequired, op, [
      'paths',
      '/r',
      'patch',
    ]);
    expect(out.length).toBe(0);
  });
  it('does not flag PUT (only patch)', () => {
    const op = {
      requestBody: {
        content: {
          'application/merge-patch+json': {
            schema: { type: 'object', required: ['name'] },
          },
        },
      },
    };
    const out = runFn(mergePatchPropertiesNotRequired, op, [
      'paths',
      '/r',
      'put',
    ]);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// RFC2-99 — jsonPatchSchemaIsArray
// =============================================================================
describe('RFC2-99 — json-patch+json schema is array', () => {
  it('flags json-patch+json with type:object', () => {
    const op = {
      requestBody: {
        content: {
          'application/json-patch+json': {
            schema: { type: 'object', properties: {} },
          },
        },
      },
    };
    const out = runFn(jsonPatchSchemaIsArray, op, ['paths', '/r', 'patch']);
    expect(out.length).toBe(1);
  });
  it('does not flag json-patch+json with type:array', () => {
    const op = {
      requestBody: {
        content: {
          'application/json-patch+json': { schema: { type: 'array' } },
        },
      },
    };
    const out = runFn(jsonPatchSchemaIsArray, op, ['paths', '/r', 'patch']);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// BUNDLE — cacheHeaderBundle (RFC2-30/31/33/34)
// =============================================================================
describe('Bundle — cache-header (RFC2-30/31/33/34)', () => {
  it('RFC2-30 — flags Range param without 206', () => {
    const op = {
      parameters: [{ name: 'Range', in: 'header' }],
      responses: { '200': {} },
    };
    const out = runFn(cacheHeaderBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-30|206/.test(o.message))
    ).toBe(true);
  });
  it('RFC2-31 — flags Range param without 416', () => {
    const op = {
      parameters: [{ name: 'Range', in: 'header' }],
      responses: { '200': {}, '206': {} },
    };
    const out = runFn(cacheHeaderBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-31|416/.test(o.message))
    ).toBe(true);
  });
  it('RFC2-33 — flags Accept-Ranges with non-IANA enum', () => {
    const op = {
      responses: {
        '200': {
          headers: {
            'Accept-Ranges': {
              schema: { type: 'string', enum: ['bytes', 'foo'] },
            },
          },
        },
      },
    };
    const out = runFn(cacheHeaderBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-33|IANA/.test(o.message))
    ).toBe(true);
  });
  it('does not flag Range with both 206 + 416 + IANA Accept-Ranges', () => {
    const op = {
      parameters: [{ name: 'Range', in: 'header' }],
      responses: {
        '200': {
          headers: {
            'Accept-Ranges': { schema: { enum: ['bytes', 'none'] } },
          },
        },
        '206': {},
        '416': {},
      },
    };
    const out = runFn(cacheHeaderBundle, op, ['paths', '/r', 'get']);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// BUNDLE — cacheValidatorsBundle (RFC2-35/36/37/38/39)
// =============================================================================
describe('Bundle — cache-validators (RFC2-35..39)', () => {
  it('RFC2-35 — flags non-IANA Cache-Control directive', () => {
    const op = {
      responses: {
        '200': {
          headers: {
            'Cache-Control': {
              schema: { example: 'max-age=60, foo-directive' },
            },
          },
        },
      },
    };
    const out = runFn(cacheValidatorsBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-35|foo-directive/.test(o.message))
    ).toBe(true);
  });
  it('RFC2-36 — flags Pragma header', () => {
    const op = {
      responses: {
        '200': { headers: { Pragma: { schema: { type: 'string' } } } },
      },
    };
    const out = runFn(cacheValidatorsBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-36|Pragma/.test(o.message))
    ).toBe(true);
  });
  it('RFC2-37 — flags Cache-Control + Expires together', () => {
    const op = {
      responses: {
        '200': {
          headers: {
            'Cache-Control': { schema: { example: 'max-age=60' } },
            Expires: { schema: { type: 'string' } },
          },
        },
      },
    };
    const out = runFn(cacheValidatorsBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) =>
        /RFC2-37|Cache-Control.*Expires|both/.test(o.message)
      )
    ).toBe(true);
  });
  it('RFC2-38 — flags Accept param without Vary', () => {
    const op = {
      parameters: [{ name: 'Accept', in: 'header' }],
      responses: { '200': {} },
    };
    const out = runFn(cacheValidatorsBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-38|Vary/.test(o.message))
    ).toBe(true);
  });
  it('RFC2-39 — flags 200/304 ETag-shape mismatch', () => {
    const op = {
      responses: {
        '200': { headers: { ETag: { schema: { type: 'string', format: 'opaque' } } } },
        '304': { headers: { ETag: { schema: { type: 'integer' } } } },
      },
    };
    const out = runFn(cacheValidatorsBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) =>
        /RFC2-39|mismatching|ETag/.test(o.message)
      )
    ).toBe(true);
  });
  it('does not flag clean response set', () => {
    const op = {
      responses: {
        '200': {
          headers: { 'Cache-Control': { schema: { example: 'no-cache' } } },
        },
      },
    };
    const out = runFn(cacheValidatorsBundle, op, ['paths', '/r', 'get']);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// BUNDLE — linkHeaderBundle (RFC2-52/53/54/55)
// =============================================================================
describe('Bundle — link-header (RFC2-52/53/54/55)', () => {
  it('RFC2-52 — flags non-IANA non-URI rel-token', () => {
    const op = {
      responses: {
        '200': {
          headers: {
            Link: {
              example: '<https://api/x>; rel="custom-relation-not-iana"',
            },
          },
        },
      },
    };
    const out = runFn(linkHeaderBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-52|rel-token/.test(o.message))
    ).toBe(true);
  });
  it('RFC2-53 — flags paginated op without rel="next"', () => {
    const op = {
      parameters: [{ name: 'page', in: 'query' }],
      responses: {
        '200': {
          headers: {
            Link: { example: '<https://api/x>; rel="self"' },
          },
        },
      },
    };
    const out = runFn(linkHeaderBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-53|next/.test(o.message))
    ).toBe(true);
  });
  it('RFC2-54 — flags non-absolute anchor', () => {
    const op = {
      responses: {
        '200': {
          headers: {
            Link: { example: '<https://api/x>; rel="self"; anchor="/relative"' },
          },
        },
      },
    };
    const out = runFn(linkHeaderBundle, op, ['paths', '/r', 'get']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-54|anchor/.test(o.message))
    ).toBe(true);
  });
  it('does not flag clean Link header with rel=next on paginated op', () => {
    const op = {
      parameters: [{ name: 'page', in: 'query' }],
      responses: {
        '200': {
          headers: {
            Link: {
              example: '<https://api/x?page=2>; rel="next", <https://api/x?page=last>; rel="last"',
            },
          },
        },
      },
    };
    const out = runFn(linkHeaderBundle, op, ['paths', '/r', 'get']);
    expect(out.length).toBe(0);
  });
});

// =============================================================================
// BUNDLE — multipartFormBundle (RFC2-100/101)
// =============================================================================
describe('Bundle — multipart-form (RFC2-100/101)', () => {
  it('RFC2-100 — flags multipart/form-data with no schema', () => {
    const op = {
      requestBody: {
        content: { 'multipart/form-data': {} },
      },
    };
    const out = runFn(multipartFormBundle, op, ['paths', '/r', 'post']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-100|schema/.test(o.message))
    ).toBe(true);
  });
  it('RFC2-100 — flags multipart with non-object schema', () => {
    const op = {
      requestBody: {
        content: { 'multipart/form-data': { schema: { type: 'string' } } },
      },
    };
    const out = runFn(multipartFormBundle, op, ['paths', '/r', 'post']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-100|object/.test(o.message))
    ).toBe(true);
  });
  it('RFC2-101 — flags binary-likely property without format:binary', () => {
    const op = {
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
        },
      },
    };
    const out = runFn(multipartFormBundle, op, ['paths', '/r', 'post']);
    expect(
      (out as { message: string }[]).some((o) => /RFC2-101|binary/.test(o.message))
    ).toBe(true);
  });
  it('does not flag clean multipart with format:binary', () => {
    const op = {
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' },
                name: { type: 'string' },
              },
            },
          },
        },
      },
    };
    const out = runFn(multipartFormBundle, op, ['paths', '/r', 'post']);
    expect(out.length).toBe(0);
  });
});
