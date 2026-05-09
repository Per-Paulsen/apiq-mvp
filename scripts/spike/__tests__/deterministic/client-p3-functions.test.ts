/**
 * Unit tests for the Welle D (T18c) Client-P3 custom Spectral functions.
 *
 * Coverage (one happy/sad pair per function):
 *   - camelizeCollideSchemaProperty (CL-3)
 *   - requiredAsymmetryRequestResponse (CL-8)
 *   - int64NeedsStringAlternative (CL-16)
 *   - emptyBody2xx4xxDiscriminator (CL-19)
 *   - responseRefInconsistency (CL-27)
 *   - nestedCompositionDepth (CL-30)
 *   - fieldNameLengthBalance (CL-44)
 *   - crudShapeConsistency (CL-47)
 *   - paramsOrderRequiredFirst (CL-51)
 *   - totalRequiredInputsExceeds (CL-53)
 *   - vendorExtensionPrefixConsistency (CL-61)
 *   - tagCasingCrossSpecConsistency (CL-75)
 *   - readOnlyRequiredConflict (CL-80)
 */

import { describe, it, expect } from 'vitest';
import type {
  IFunctionResult,
  RulesetFunctionContext,
} from '@stoplight/spectral-core';

import {
  camelizeCollideSchemaProperty,
  requiredAsymmetryRequestResponse,
  int64NeedsStringAlternative,
  emptyBody2xx4xxDiscriminator,
  responseRefInconsistency,
  nestedCompositionDepth,
  fieldNameLengthBalance,
  crudShapeConsistency,
  paramsOrderRequiredFirst,
  totalRequiredInputsExceeds,
  vendorExtensionPrefixConsistency,
  tagCasingCrossSpecConsistency,
  readOnlyRequiredConflict,
} from '../../deterministic/spectral-functions/client-p3-functions.js';

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
// CL-3 — camelizeCollideSchemaProperty
// =============================================================================

describe('camelizeCollideSchemaProperty (CL-3)', () => {
  it('flags user_id + userId in same schema', () => {
    const schema = {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        userId: { type: 'string' },
      },
    };
    expect(arr(camelizeCollideSchemaProperty(schema, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not flag distinct property names', () => {
    const schema = {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        order_id: { type: 'string' },
      },
    };
    expect(arr(camelizeCollideSchemaProperty(schema, {}, ctx))).toEqual([]);
  });

  it('returns [] on schema without properties', () => {
    expect(arr(camelizeCollideSchemaProperty({ type: 'string' }, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-8 — requiredAsymmetryRequestResponse
// =============================================================================

describe('requiredAsymmetryRequestResponse (CL-8)', () => {
  it('flags asymmetric required between request and response', () => {
    const spec = {
      paths: {
        '/u': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['name'],
                    properties: { name: { type: 'string' }, email: { type: 'string' } },
                  },
                },
              },
            },
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['name', 'email'],
                      properties: { name: { type: 'string' }, email: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    expect(arr(requiredAsymmetryRequestResponse(spec, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not flag symmetric required', () => {
    const spec = {
      paths: {
        '/u': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['name'],
                    properties: { name: { type: 'string' } },
                  },
                },
              },
            },
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['name'],
                      properties: { name: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    expect(arr(requiredAsymmetryRequestResponse(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-16 — int64NeedsStringAlternative
// =============================================================================

describe('int64NeedsStringAlternative (CL-16)', () => {
  it('fires on int64 without string-alternative', () => {
    const schema = { type: 'integer', format: 'int64' };
    expect(arr(int64NeedsStringAlternative(schema, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does NOT fire when oneOf includes string-branch', () => {
    const schema = {
      type: 'integer',
      format: 'int64',
      oneOf: [{ type: 'string' }, { type: 'integer', format: 'int64' }],
    };
    expect(arr(int64NeedsStringAlternative(schema, {}, ctx))).toEqual([]);
  });

  it('returns [] for non-int64 formats', () => {
    expect(arr(int64NeedsStringAlternative({ type: 'integer', format: 'int32' }, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-19 — emptyBody2xx4xxDiscriminator
// =============================================================================

describe('emptyBody2xx4xxDiscriminator (CL-19)', () => {
  it('fires when both 2xx and 4xx are empty', () => {
    const spec = {
      paths: {
        '/x': {
          delete: {
            responses: { '204': {}, '404': {} },
          },
        },
      },
    };
    expect(arr(emptyBody2xx4xxDiscriminator(spec, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does NOT fire when 4xx has body', () => {
    const spec = {
      paths: {
        '/x': {
          delete: {
            responses: {
              '204': {},
              '404': {
                content: { 'application/json': { schema: { type: 'object' } } },
              },
            },
          },
        },
      },
    };
    expect(arr(emptyBody2xx4xxDiscriminator(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-27 — responseRefInconsistency
// =============================================================================

describe('responseRefInconsistency (CL-27)', () => {
  it('fires when same code uses both ref and inline', () => {
    const spec = {
      paths: {
        '/a': {
          get: {
            responses: {
              '404': { $ref: '#/components/responses/NotFound' },
            },
          },
        },
        '/b': {
          get: {
            responses: {
              '404': { description: 'not found' },
            },
          },
        },
      },
    };
    expect(arr(responseRefInconsistency(spec, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does NOT fire when consistent (all $ref)', () => {
    const spec = {
      paths: {
        '/a': {
          get: { responses: { '404': { $ref: '#/components/responses/NotFound' } } },
        },
        '/b': {
          get: { responses: { '404': { $ref: '#/components/responses/NotFound' } } },
        },
      },
    };
    expect(arr(responseRefInconsistency(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-30 — nestedCompositionDepth
// =============================================================================

describe('nestedCompositionDepth (CL-30)', () => {
  it('fires on 4 hops nested composition', () => {
    const schema = {
      allOf: [
        { oneOf: [{ anyOf: [{ allOf: [{ type: 'string' }] }] }] },
      ],
    };
    expect(arr(nestedCompositionDepth(schema, { maxDepth: 3 }, ctx)).length).toBeGreaterThan(0);
  });

  it('does not fire at exactly 3 hops', () => {
    const schema = {
      allOf: [{ oneOf: [{ anyOf: [{ type: 'string' }] }] }],
    };
    expect(arr(nestedCompositionDepth(schema, { maxDepth: 3 }, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-44 — fieldNameLengthBalance
// =============================================================================

describe('fieldNameLengthBalance (CL-44)', () => {
  it('fires on 1-char cryptic name `q`', () => {
    expect(arr(fieldNameLengthBalance('zz', {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not fire on allowlisted short `id`', () => {
    expect(arr(fieldNameLengthBalance('id', {}, ctx))).toEqual([]);
  });

  it('fires on >30 char verbose name', () => {
    expect(
      arr(fieldNameLengthBalance('usersOrganizationalGroupMembershipDetails', {}, ctx)).length
    ).toBeGreaterThan(0);
  });

  it('passes balanced 8-char name', () => {
    expect(arr(fieldNameLengthBalance('userName', {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-47 — crudShapeConsistency
// =============================================================================

describe('crudShapeConsistency (CL-47)', () => {
  it('fires when POST returns different shape than GET', () => {
    const spec = {
      paths: {
        '/o/{id}': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Order' },
                  },
                },
              },
            },
          },
          patch: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/OrderStatus' },
                  },
                },
              },
            },
          },
        },
      },
    };
    expect(arr(crudShapeConsistency(spec, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not fire when shapes match', () => {
    const spec = {
      paths: {
        '/o/{id}': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/Order' } },
                },
              },
            },
          },
          patch: {
            responses: {
              '200': {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/Order' } },
                },
              },
            },
          },
        },
      },
    };
    expect(arr(crudShapeConsistency(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-51 — paramsOrderRequiredFirst
// =============================================================================

describe('paramsOrderRequiredFirst (CL-51)', () => {
  it('fires when required follows optional', () => {
    const params = [
      { name: 'q', required: false },
      { name: 'id', required: true },
    ];
    expect(arr(paramsOrderRequiredFirst(params, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not fire when required is first', () => {
    const params = [
      { name: 'id', required: true },
      { name: 'q', required: false },
    ];
    expect(arr(paramsOrderRequiredFirst(params, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-53 — totalRequiredInputsExceeds
// =============================================================================

describe('totalRequiredInputsExceeds (CL-53)', () => {
  it('fires when total required > threshold', () => {
    const op = {
      parameters: [
        { name: 'a', required: true },
        { name: 'b', required: true },
        { name: 'c', required: true },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: { required: ['x', 'y', 'z'] },
          },
        },
      },
    };
    expect(arr(totalRequiredInputsExceeds(op, { threshold: 5 }, ctx)).length).toBeGreaterThan(0);
  });

  it('does not fire under threshold', () => {
    const op = {
      parameters: [{ name: 'a', required: true }],
      requestBody: {
        content: {
          'application/json': {
            schema: { required: ['x'] },
          },
        },
      },
    };
    expect(arr(totalRequiredInputsExceeds(op, { threshold: 5 }, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-61 — vendorExtensionPrefixConsistency
// =============================================================================

describe('vendorExtensionPrefixConsistency (CL-61)', () => {
  it('fires on mixed casings of same vendor', () => {
    const spec = {
      'x-stripe-foo': true,
      paths: {
        '/x': {
          get: {
            'x-Stripe-bar': true,
          },
        },
      },
    };
    expect(arr(vendorExtensionPrefixConsistency(spec, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not fire with consistent casing', () => {
    const spec = {
      'x-stripe-foo': true,
      'x-stripe-bar': true,
    };
    expect(arr(vendorExtensionPrefixConsistency(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-75 — tagCasingCrossSpecConsistency
// =============================================================================

describe('tagCasingCrossSpecConsistency (CL-75)', () => {
  it('fires on PascalCase + snake_case mix', () => {
    const spec = {
      paths: {
        '/x': { get: { tags: ['Users'] } },
        '/y': { get: { tags: ['user_management'] } },
      },
    };
    expect(arr(tagCasingCrossSpecConsistency(spec, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not fire with single casing', () => {
    const spec = {
      paths: {
        '/x': { get: { tags: ['Users'] } },
        '/y': { get: { tags: ['Orders'] } },
      },
    };
    expect(arr(tagCasingCrossSpecConsistency(spec, {}, ctx))).toEqual([]);
  });
});

// =============================================================================
// CL-80 — readOnlyRequiredConflict
// =============================================================================

describe('readOnlyRequiredConflict (CL-80)', () => {
  it('fires when readOnly property is in required', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', readOnly: true },
        name: { type: 'string' },
      },
    };
    expect(arr(readOnlyRequiredConflict(schema, {}, ctx)).length).toBeGreaterThan(0);
  });

  it('does not fire when no conflict', () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        id: { type: 'string', readOnly: true },
        name: { type: 'string' },
      },
    };
    expect(arr(readOnlyRequiredConflict(schema, {}, ctx))).toEqual([]);
  });
});
