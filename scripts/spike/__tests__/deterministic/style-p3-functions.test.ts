/**
 * Unit tests for the Welle D (T-Other-Lens) Style-P3 custom Spectral functions.
 *
 * Coverage:
 *   - restVsRpcMixing (SC-1)
 *   - httpMethodSemanticsViolated (SC-3)
 *   - crudAsymmetricResources (SC-15)
 *   - fieldNameCasingMixed (SC-18)
 *   - timeFieldNamingMixed (SC-19)
 *   - filterSyntaxIncoherent (SC-22)
 *   - sortSyntaxIncoherent (SC-23)
 *   - statusCodeDistributionPerOpType (SC-25)
 *   - odataDollarParamAllowedSet (SCF-12)
 *   - aipCustomMethodUsesPost (SCF-13)
 *   - aipTimeFieldImperative (SCF-17)
 *   - phiFieldNameHint (L6-3)
 *   - listEndpointMissingCacheHeaders (L7-1)
 *   - descriptionParameterRatio (L9-2)
 *   - errorSchemaDiscoverability (L9-3)
 *   - paginationCursorStability (L9-4)
 *   - operationIdMachineFriendly (L9-5)
 *   - summaryConcise (L9-6)
 *   - functionCallFriendlySchema (L9-8)
 *   - externalDocsStub (L10-4)
 *   - infoContactSubstantive (L10-5)
 *   - acceptLanguageOnUserFacingOps (F-2)
 *   - consistentExpandFieldsParam (F-5)
 *   - polymorphismWireDiscriminator (F-15)
 *   - lazyDescription (F-19)
 */

import { describe, it, expect } from 'vitest';
import type {
  IFunctionResult,
  RulesetFunctionContext,
} from '@stoplight/spectral-core';

import {
  restVsRpcMixing,
  httpMethodSemanticsViolated,
  crudAsymmetricResources,
  fieldNameCasingMixed,
  timeFieldNamingMixed,
  filterSyntaxIncoherent,
  sortSyntaxIncoherent,
  statusCodeDistributionPerOpType,
  odataDollarParamAllowedSet,
  aipCustomMethodUsesPost,
  aipTimeFieldImperative,
  phiFieldNameHint,
  listEndpointMissingCacheHeaders,
  descriptionParameterRatio,
  errorSchemaDiscoverability,
  paginationCursorStability,
  operationIdMachineFriendly,
  summaryConcise,
  functionCallFriendlySchema,
  externalDocsStub,
  infoContactSubstantive,
  acceptLanguageOnUserFacingOps,
  consistentExpandFieldsParam,
  polymorphismWireDiscriminator,
  lazyDescription,
} from '../../deterministic/spectral-functions/style-p3-functions.js';

const ctx: RulesetFunctionContext = {
  path: [],
  document: {} as never,
  documentInventory: {} as never,
  rule: {} as never,
} as unknown as RulesetFunctionContext;

function ctxAt(...path: (string | number)[]): RulesetFunctionContext {
  return {
    ...ctx,
    path,
  } as unknown as RulesetFunctionContext;
}

function arr(out: unknown): IFunctionResult[] {
  if (out === undefined) return [];
  if (Array.isArray(out)) return out as IFunctionResult[];
  throw new Error(`expected IFunctionResult[] but got ${typeof out}`);
}

// =============================================================================
// SC-1 — restVsRpcMixing
// =============================================================================

describe('restVsRpcMixing (SC-1)', () => {
  it('does not fire on small specs (<5 paths)', () => {
    const spec = {
      paths: {
        '/users': {},
        '/getUser': {},
      },
    };
    expect(arr(restVsRpcMixing(spec, {}, ctx))).toEqual([]);
  });

  it('fires when spec mixes >10% REST and >10% RPC', () => {
    const spec = {
      paths: {
        '/users': {},
        '/users/{id}': {},
        '/orders': {},
        '/orders/{id}': {},
        '/getUser': {},
        '/createOrder': {},
        '/cancelOrder': {},
      },
    };
    const out = arr(restVsRpcMixing(spec, {}, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toMatch(/mix/i);
  });

  it('does not fire on pure REST', () => {
    const spec = {
      paths: {
        '/users': {},
        '/users/{id}': {},
        '/orders': {},
        '/orders/{id}': {},
        '/products': {},
        '/products/{id}': {},
      },
    };
    expect(arr(restVsRpcMixing(spec, {}, ctx))).toEqual([]);
  });

  it('detects AIP-136 colon-action as RPC', () => {
    const spec = {
      paths: {
        '/users': {},
        '/users/{id}': {},
        '/orders': {},
        '/orders/{id}': {},
        '/orders/{id}:cancel': {},
        '/users/{id}:archive': {},
      },
    };
    const out = arr(restVsRpcMixing(spec, {}, ctx));
    expect(out.length).toBe(1);
  });
});

// =============================================================================
// SC-3 — httpMethodSemanticsViolated
// =============================================================================

describe('httpMethodSemanticsViolated (SC-3)', () => {
  it('fires on GET op with state-change verb in operationId', () => {
    const op = { operationId: 'createUser' };
    const out = arr(
      httpMethodSemanticsViolated(op, {}, ctxAt('paths', '/users', 'get'))
    );
    expect(out.length).toBe(1);
    expect(out[0].message).toMatch(/create/i);
  });

  it('fires on GET op with state-change verb in path', () => {
    const op = { operationId: 'fetchSomething' };
    const out = arr(
      httpMethodSemanticsViolated(op, {}, ctxAt('paths', '/cancelOrder', 'get'))
    );
    expect(out.length).toBe(1);
  });

  it('does not fire on idempotent GET', () => {
    const op = { operationId: 'listUsers' };
    expect(
      arr(httpMethodSemanticsViolated(op, {}, ctxAt('paths', '/users', 'get')))
    ).toEqual([]);
  });
});

// =============================================================================
// SC-15 — crudAsymmetricResources
// =============================================================================

describe('crudAsymmetricResources (SC-15)', () => {
  it('fires on item-ops without collection-GET', () => {
    const spec = {
      paths: {
        '/users/{id}': { get: {}, put: {}, delete: {} },
      },
    };
    const out = arr(crudAsymmetricResources(spec, {}, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toMatch(/no collection GET/);
  });

  it('fires on POST collection without GET item', () => {
    const spec = {
      paths: {
        '/users': { get: {}, post: {} },
      },
    };
    const out = arr(crudAsymmetricResources(spec, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire on symmetric CRUD', () => {
    const spec = {
      paths: {
        '/users': { get: {}, post: {} },
        '/users/{id}': { get: {}, put: {}, delete: {} },
      },
    };
    expect(arr(crudAsymmetricResources(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// SC-18 — fieldNameCasingMixed
// =============================================================================

describe('fieldNameCasingMixed (SC-18)', () => {
  it('fires when spec mixes camelCase and snake_case', () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              firstName: { type: 'string' },
              last_name: { type: 'string' },
            },
          },
        },
      },
    };
    const out = arr(fieldNameCasingMixed(spec, {}, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toMatch(/cas/i);
  });

  it('does not fire on consistent casing', () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              emailAddress: { type: 'string' },
            },
          },
        },
      },
    };
    expect(arr(fieldNameCasingMixed(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// SC-19 — timeFieldNamingMixed
// =============================================================================

describe('timeFieldNamingMixed (SC-19)', () => {
  it('fires when spec mixes *_time and *_at', () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              created_at: { type: 'string' },
              update_time: { type: 'string' },
            },
          },
        },
      },
    };
    const out = arr(timeFieldNamingMixed(spec, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire on consistent *_time', () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              create_time: { type: 'string' },
              update_time: { type: 'string' },
            },
          },
        },
      },
    };
    expect(arr(timeFieldNamingMixed(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// SC-22 — filterSyntaxIncoherent
// =============================================================================

describe('filterSyntaxIncoherent (SC-22)', () => {
  it('fires when spec uses 2 filter styles', () => {
    const spec = {
      paths: {
        '/users': {
          get: {
            parameters: [{ name: 'filter', in: 'query' }],
          },
        },
        '/orders': {
          get: {
            parameters: [{ name: '$filter', in: 'query' }],
          },
        },
      },
    };
    const out = arr(filterSyntaxIncoherent(spec, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire on single-style filter', () => {
    const spec = {
      paths: {
        '/users': {
          get: { parameters: [{ name: 'filter', in: 'query' }] },
        },
        '/orders': {
          get: { parameters: [{ name: 'filter', in: 'query' }] },
        },
      },
    };
    expect(arr(filterSyntaxIncoherent(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// SC-23 — sortSyntaxIncoherent
// =============================================================================

describe('sortSyntaxIncoherent (SC-23)', () => {
  it('fires when spec uses 2 sort styles', () => {
    const spec = {
      paths: {
        '/users': {
          get: { parameters: [{ name: 'order_by', in: 'query' }] },
        },
        '/orders': {
          get: { parameters: [{ name: 'sort', in: 'query' }] },
        },
      },
    };
    const out = arr(sortSyntaxIncoherent(spec, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire on single-style sort', () => {
    const spec = {
      paths: {
        '/users': { get: { parameters: [{ name: 'sort', in: 'query' }] } },
      },
    };
    expect(arr(sortSyntaxIncoherent(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// SC-25 — statusCodeDistributionPerOpType
// =============================================================================

describe('statusCodeDistributionPerOpType (SC-25)', () => {
  it('does not fire on GET with 200', () => {
    const op = { responses: { '200': {} } };
    expect(
      arr(
        statusCodeDistributionPerOpType(
          op,
          {},
          ctxAt('paths', '/users', 'get')
        )
      )
    ).toEqual([]);
  });

  it('fires on GET without any success code', () => {
    const op = { responses: { '404': {}, '500': {} } };
    const out = arr(
      statusCodeDistributionPerOpType(
        op,
        {},
        ctxAt('paths', '/users', 'get')
      )
    );
    expect(out.length).toBe(1);
    expect(out[0].message).toMatch(/success/i);
  });

  it('does not fire on POST with 201', () => {
    const op = { responses: { '201': {} } };
    expect(
      arr(
        statusCodeDistributionPerOpType(
          op,
          {},
          ctxAt('paths', '/users', 'post')
        )
      )
    ).toEqual([]);
  });
});

// =============================================================================
// SCF-12 — odataDollarParamAllowedSet
// =============================================================================

describe('odataDollarParamAllowedSet (SCF-12)', () => {
  it('does not fire on allowed $-params', () => {
    const spec = {
      paths: {
        '/users': {
          get: { parameters: [{ name: '$filter', in: 'query' }, { name: '$top', in: 'query' }] },
        },
      },
    };
    expect(arr(odataDollarParamAllowedSet(spec, {}, ctx))).toEqual([]);
  });

  it('fires on disallowed $-param', () => {
    const spec = {
      paths: {
        '/users': {
          get: { parameters: [{ name: '$customParam', in: 'query' }] },
        },
      },
    };
    const out = arr(odataDollarParamAllowedSet(spec, {}, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toMatch(/customParam/);
  });

  it('ignores non-$ params', () => {
    const spec = {
      paths: {
        '/users': {
          get: { parameters: [{ name: 'filter', in: 'query' }] },
        },
      },
    };
    expect(arr(odataDollarParamAllowedSet(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// SCF-13 — aipCustomMethodUsesPost
// =============================================================================

describe('aipCustomMethodUsesPost (SCF-13)', () => {
  it('does not fire on POST custom-method', () => {
    const spec = {
      paths: {
        '/users/{id}:cancel': { post: {} },
      },
    };
    expect(arr(aipCustomMethodUsesPost(spec, {}, ctx))).toEqual([]);
  });

  it('does not fire on GET custom-method', () => {
    const spec = {
      paths: {
        '/users/{id}:read': { get: {} },
      },
    };
    expect(arr(aipCustomMethodUsesPost(spec, {}, ctx))).toEqual([]);
  });

  it('fires on PUT custom-method', () => {
    const spec = {
      paths: {
        '/users/{id}:update': { put: {} },
      },
    };
    const out = arr(aipCustomMethodUsesPost(spec, {}, ctx));
    expect(out.length).toBe(1);
  });
});

// =============================================================================
// SCF-17 — aipTimeFieldImperative
// =============================================================================

describe('aipTimeFieldImperative (SCF-17)', () => {
  it('fires on past-tense `*ed_time`', () => {
    const props = {
      created_time: { type: 'string' },
      updated_time: { type: 'string' },
    };
    const out = arr(aipTimeFieldImperative(props, {}, ctx));
    expect(out.length).toBe(2);
  });

  it('does not fire on imperative `*_time`', () => {
    const props = {
      create_time: { type: 'string' },
      update_time: { type: 'string' },
    };
    expect(arr(aipTimeFieldImperative(props, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// L6-3 — phiFieldNameHint
// =============================================================================

describe('phiFieldNameHint (L6-3)', () => {
  it('fires on diagnosis field-name', () => {
    const props = { diagnosis: { type: 'string' } };
    const out = arr(phiFieldNameHint(props, {}, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toMatch(/PHI/);
  });

  it('fires on icd_code', () => {
    const props = { icd10_code: { type: 'string' } };
    const out = arr(phiFieldNameHint(props, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire on plain user field', () => {
    const props = {
      firstName: { type: 'string' },
      email: { type: 'string' },
    };
    expect(arr(phiFieldNameHint(props, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// L7-1 — listEndpointMissingCacheHeaders
// =============================================================================

describe('listEndpointMissingCacheHeaders (L7-1)', () => {
  it('fires on list endpoint without cache headers', () => {
    const op = {
      responses: {
        '200': { content: { 'application/json': {} } },
      },
    };
    const out = arr(
      listEndpointMissingCacheHeaders(op, {}, ctxAt('paths', '/users', 'get'))
    );
    expect(out.length).toBe(1);
  });

  it('does not fire when ETag header declared', () => {
    const op = {
      responses: {
        '200': { headers: { ETag: { schema: { type: 'string' } } } },
      },
    };
    expect(
      arr(
        listEndpointMissingCacheHeaders(op, {}, ctxAt('paths', '/users', 'get'))
      )
    ).toEqual([]);
  });

  it('does not fire on item endpoints', () => {
    const op = {
      responses: { '200': {} },
    };
    expect(
      arr(
        listEndpointMissingCacheHeaders(
          op,
          {},
          ctxAt('paths', '/users/{id}', 'get')
        )
      )
    ).toEqual([]);
  });
});

// =============================================================================
// L9-2 — descriptionParameterRatio
// =============================================================================

describe('descriptionParameterRatio (L9-2)', () => {
  it('fires when many params + tiny description', () => {
    const op = {
      parameters: [{}, {}, {}, {}, {}],
      description: 'Get items.',
    };
    const out = arr(descriptionParameterRatio(op, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire when description is substantial', () => {
    const op = {
      parameters: [{}, {}, {}, {}, {}],
      description:
        'Returns a paginated list of items filtered by the supplied query parameters. Include pagination cursor for stable iteration.',
    };
    expect(arr(descriptionParameterRatio(op, {}, ctx))).toEqual([]);
  });

  it('does not fire when few params', () => {
    const op = { parameters: [{}], description: 'X' };
    expect(arr(descriptionParameterRatio(op, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// L9-3 — errorSchemaDiscoverability
// =============================================================================

describe('errorSchemaDiscoverability (L9-3)', () => {
  it('fires when 4xx response has no schema', () => {
    const op = {
      responses: {
        '200': {},
        '404': { content: { 'application/json': {} } },
      },
    };
    const out = arr(errorSchemaDiscoverability(op, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire when 4xx has schema', () => {
    const op = {
      responses: {
        '200': {},
        '404': {
          content: {
            'application/problem+json': {
              schema: { $ref: '#/components/schemas/Problem' },
            },
          },
        },
      },
    };
    expect(arr(errorSchemaDiscoverability(op, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// L9-4 — paginationCursorStability
// =============================================================================

describe('paginationCursorStability (L9-4)', () => {
  it('fires on cursor param without stability documentation', () => {
    const op = {
      parameters: [
        { name: 'cursor', in: 'query', description: 'Pagination cursor.' },
      ],
    };
    const out = arr(paginationCursorStability(op, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire on cursor with opaque doc', () => {
    const op = {
      parameters: [
        {
          name: 'cursor',
          in: 'query',
          description:
            'Opaque pagination cursor — do not parse or cache; treat as opaque token.',
        },
      ],
    };
    expect(arr(paginationCursorStability(op, {}, ctx))).toEqual([]);
  });

  it('does not fire when no cursor param', () => {
    const op = { parameters: [{ name: 'limit', in: 'query' }] };
    expect(arr(paginationCursorStability(op, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// L9-5 — operationIdMachineFriendly
// =============================================================================

describe('operationIdMachineFriendly (L9-5)', () => {
  it('fires on too-long operationId', () => {
    const out = arr(
      operationIdMachineFriendly('getUserAccountSettingsByUserIdAndOrgId', {}, ctx)
    );
    expect(out.length).toBe(1);
    expect(out[0].message).toMatch(/30/);
  });

  it('fires on operationId not starting with verb', () => {
    const out = arr(operationIdMachineFriendly('userById', {}, ctx));
    expect(out.length).toBe(1);
    expect(out[0].message).toMatch(/verb/);
  });

  it('does not fire on concise verb-noun', () => {
    expect(arr(operationIdMachineFriendly('listUsers', {}, ctx))).toEqual([]);
    expect(arr(operationIdMachineFriendly('createInvoice', {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// L9-6 — summaryConcise
// =============================================================================

describe('summaryConcise (L9-6)', () => {
  it('fires on missing summary', () => {
    const out = arr(summaryConcise(undefined, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('fires on summary >80 chars', () => {
    const long = 'x'.repeat(81);
    const out = arr(summaryConcise(long, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('fires on multi-sentence summary', () => {
    const out = arr(summaryConcise('First. Second.', {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire on concise single-sentence', () => {
    expect(arr(summaryConcise('List all active users.', {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// L9-8 — functionCallFriendlySchema
// =============================================================================

describe('functionCallFriendlySchema (L9-8)', () => {
  it('fires on anyOf with 3+ branches', () => {
    const schema = {
      anyOf: [{ type: 'string' }, { type: 'integer' }, { type: 'number' }],
    };
    const out = arr(functionCallFriendlySchema(schema, {}, ctx));
    expect(out.length).toBeGreaterThan(0);
  });

  it('does not fire on simple oneOf with 2 branches', () => {
    const schema = {
      oneOf: [{ type: 'string' }, { type: 'integer' }],
    };
    expect(arr(functionCallFriendlySchema(schema, {}, ctx))).toEqual([]);
  });

  it('fires on nested anyOf-within-anyOf', () => {
    const schema = {
      anyOf: [
        { anyOf: [{ type: 'string' }, { type: 'integer' }] },
        { type: 'boolean' },
      ],
    };
    const out = arr(functionCallFriendlySchema(schema, {}, ctx));
    expect(out.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// L10-4 — externalDocsStub
// =============================================================================

describe('externalDocsStub (L10-4)', () => {
  it('fires on example.com URL', () => {
    const out = arr(
      externalDocsStub({ url: 'https://example.com/docs', description: 'Docs' }, {}, ctx)
    );
    expect(out.length).toBeGreaterThan(0);
  });

  it('fires on empty URL', () => {
    const out = arr(externalDocsStub({ url: '', description: '' }, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire on substantive URL + description', () => {
    expect(
      arr(
        externalDocsStub(
          {
            url: 'https://docs.real-api.com/v1/',
            description: 'Full API reference with code samples',
          },
          {},
          ctx
        )
      )
    ).toEqual([]);
  });
});

// =============================================================================
// L10-5 — infoContactSubstantive
// =============================================================================

describe('infoContactSubstantive (L10-5)', () => {
  it('fires on stub email', () => {
    const out = arr(
      infoContactSubstantive(
        { name: 'Support', email: 'support@example.com' },
        {},
        ctx
      )
    );
    expect(out.length).toBe(1);
  });

  it('does not fire on substantive email', () => {
    expect(
      arr(
        infoContactSubstantive(
          { name: 'Support', email: 'support@real-api.io' },
          {},
          ctx
        )
      )
    ).toEqual([]);
  });

  it('does not fire on substantive URL', () => {
    expect(
      arr(
        infoContactSubstantive(
          { url: 'https://support.real-api.io/' },
          {},
          ctx
        )
      )
    ).toEqual([]);
  });
});

// =============================================================================
// F-2 — acceptLanguageOnUserFacingOps
// =============================================================================

describe('acceptLanguageOnUserFacingOps (F-2)', () => {
  it('fires when user-facing op has no Accept-Language', () => {
    const op = {
      parameters: [],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
      },
    };
    const out = arr(acceptLanguageOnUserFacingOps(op, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire when op declares Accept-Language', () => {
    const op = {
      parameters: [{ name: 'Accept-Language', in: 'header' }],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { description: { type: 'string' } },
              },
            },
          },
        },
      },
    };
    expect(arr(acceptLanguageOnUserFacingOps(op, {}, ctx))).toEqual([]);
  });

  it('does not fire when no user-facing content', () => {
    const op = {
      parameters: [],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { id: { type: 'string' } } },
            },
          },
        },
      },
    };
    expect(arr(acceptLanguageOnUserFacingOps(op, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// F-5 — consistentExpandFieldsParam
// =============================================================================

describe('consistentExpandFieldsParam (F-5)', () => {
  it('fires when SOME but NOT ALL collection-getters declare expand', () => {
    const spec = {
      paths: {
        '/users': {
          get: { parameters: [{ name: 'expand', in: 'query' }] },
        },
        '/orders': { get: { parameters: [] } },
        '/products': { get: { parameters: [] } },
      },
    };
    const out = arr(consistentExpandFieldsParam(spec, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire when none use expand', () => {
    const spec = {
      paths: {
        '/users': { get: {} },
        '/orders': { get: {} },
        '/products': { get: {} },
      },
    };
    expect(arr(consistentExpandFieldsParam(spec, {}, ctx))).toEqual([]);
  });

  it('does not fire when all use expand', () => {
    const spec = {
      paths: {
        '/users': { get: { parameters: [{ name: 'expand', in: 'query' }] } },
        '/orders': { get: { parameters: [{ name: 'expand', in: 'query' }] } },
        '/products': { get: { parameters: [{ name: 'expand', in: 'query' }] } },
      },
    };
    expect(arr(consistentExpandFieldsParam(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// F-15 — polymorphismWireDiscriminator
// =============================================================================

describe('polymorphismWireDiscriminator (F-15)', () => {
  it('fires on non-conventional discriminator name', () => {
    const schema = { discriminator: { propertyName: 'category' } };
    const out = arr(polymorphismWireDiscriminator(schema, {}, ctx));
    expect(out.length).toBe(1);
  });

  it('does not fire on @type discriminator', () => {
    const schema = { discriminator: { propertyName: '@type' } };
    expect(arr(polymorphismWireDiscriminator(schema, {}, ctx))).toEqual([]);
  });

  it('does not fire on kind discriminator', () => {
    const schema = { discriminator: { propertyName: 'kind' } };
    expect(arr(polymorphismWireDiscriminator(schema, {}, ctx))).toEqual([]);
  });

  it('does not fire when no discriminator', () => {
    const schema = { type: 'object' };
    expect(arr(polymorphismWireDiscriminator(schema, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// F-19 — lazyDescription
// =============================================================================

describe('lazyDescription (F-19)', () => {
  it('fires when description is verbatim copy of name', () => {
    const out = arr(
      lazyDescription(
        { description: 'firstName' },
        {},
        ctxAt('properties', 'firstName')
      )
    );
    expect(out.length).toBe(1);
  });

  it('does not fire on substantive description', () => {
    expect(
      arr(
        lazyDescription(
          {
            description:
              'The user given name (first / forename), unicode-allowed, max 100 chars.',
          },
          {},
          ctxAt('properties', 'firstName')
        )
      )
    ).toEqual([]);
  });

  it('does not fire when description is empty', () => {
    expect(
      arr(
        lazyDescription({ description: '' }, {}, ctxAt('properties', 'firstName'))
      )
    ).toEqual([]);
  });
});
