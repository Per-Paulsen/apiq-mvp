/**
 * Unit tests for the P3 Evolution-Friction custom Spectral functions.
 *
 * Covers function-level behaviour without going through Spectral itself —
 * complements the integration-level tests in `evolution-p3-rules.test.ts`.
 *
 * Focus: the functions that have non-trivial branching logic (cycle-detection,
 * cross-resource lookups, prose-regex robustness).
 */

import { describe, it, expect } from 'vitest';
import type { IFunction, IFunctionContext } from '@stoplight/spectral-core';

import {
  requiredFieldOverdeclaredCheck,
  statusCodeSetCardinality,
  requiredPropNeedsDescription,
  refCycleNeedsMaxDepth,
  fieldEvolutionSuffix,
  tagsInternalExperimental,
  noComponentsSchemas,
  defaultSpecificStatusOverlap,
  multipartJsonSameSchema,
  magicStringEnumCandidate,
  intNeedsStringEncoding,
  versionParamNoEnum,
  redirectWithoutLocation,
  webhookNeedsProse,
  oneofClosedProseSaysOpen,
  int64StringEncodingCandidate,
} from '../../deterministic/spectral-functions/evolution-p3-functions.js';

// =============================================================================
// Test harness — invokes IFunction with a mock context
// =============================================================================

interface MockContextOpts {
  path?: (string | number)[];
  documentData?: unknown;
}

function mockContext(opts: MockContextOpts = {}): IFunctionContext {
  return {
    path: opts.path ?? [],
    document: opts.documentData
      ? ({ data: opts.documentData } as unknown as IFunctionContext['document'])
      : (undefined as unknown as IFunctionContext['document']),
  } as IFunctionContext;
}

function call(fn: IFunction, target: unknown, ctx: IFunctionContext, opts: unknown = null) {
  return fn(target, opts as Parameters<IFunction>[1], ctx, {
    rule: { name: 'test' },
  } as Parameters<IFunction>[3]);
}

// =============================================================================
// requiredFieldOverdeclaredCheck (EV-2)
// =============================================================================

describe('requiredFieldOverdeclaredCheck (EV-2)', () => {
  it('emits when required > threshold', () => {
    const schema = {
      type: 'object',
      required: Array.from({ length: 16 }, (_, i) => `f${i}`),
    };
    const result = call(requiredFieldOverdeclaredCheck, schema, mockContext({ path: ['x'] }), {
      threshold: 15,
    });
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit when required ≤ threshold', () => {
    const schema = { type: 'object', required: ['a', 'b', 'c'] };
    const result = call(requiredFieldOverdeclaredCheck, schema, mockContext(), {
      threshold: 15,
    });
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('handles missing required gracefully', () => {
    const schema = { type: 'object' };
    const result = call(requiredFieldOverdeclaredCheck, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// statusCodeSetCardinality (EV-15)
// =============================================================================

describe('statusCodeSetCardinality (EV-15)', () => {
  it('emits when responses count exceeds threshold', () => {
    const op = {
      responses: {
        '200': {}, '201': {}, '202': {}, '204': {}, '301': {},
        '400': {}, '401': {}, '403': {}, '404': {}, '409': {},
        '422': {},
      },
    };
    const result = call(statusCodeSetCardinality, op, mockContext({ path: ['paths', '/x', 'get'] }));
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit at-or-below threshold', () => {
    const op = { responses: { '200': {}, '400': {} } };
    const result = call(statusCodeSetCardinality, op, mockContext({ path: ['paths', '/x', 'get'] }));
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// requiredPropNeedsDescription (EV-21)
// =============================================================================

describe('requiredPropNeedsDescription (EV-21)', () => {
  it('emits when property is required and lacks description', () => {
    const document = {
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
          },
        },
      },
    };
    const ctx = mockContext({
      path: ['components', 'schemas', 'User', 'properties', 'name'],
      documentData: document,
    });
    const result = call(
      requiredPropNeedsDescription,
      document.components.schemas.User.properties.name,
      ctx
    );
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit when property is required AND has description', () => {
    const document = {
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'User name' },
            },
          },
        },
      },
    };
    const ctx = mockContext({
      path: ['components', 'schemas', 'User', 'properties', 'name'],
      documentData: document,
    });
    const result = call(
      requiredPropNeedsDescription,
      document.components.schemas.User.properties.name,
      ctx
    );
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('does not emit when property is NOT in required-list', () => {
    const document = {
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['email'],
            properties: { name: { type: 'string' } },
          },
        },
      },
    };
    const ctx = mockContext({
      path: ['components', 'schemas', 'User', 'properties', 'name'],
      documentData: document,
    });
    const result = call(
      requiredPropNeedsDescription,
      document.components.schemas.User.properties.name,
      ctx
    );
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// refCycleNeedsMaxDepth (EV-22)
// =============================================================================

describe('refCycleNeedsMaxDepth (EV-22)', () => {
  it('emits for self-referential schema without x-max-depth', () => {
    const document = {
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: { child: { $ref: '#/components/schemas/Node' } },
          },
        },
      },
    };
    const ctx = mockContext({
      path: ['components', 'schemas', 'Node'],
      documentData: document,
    });
    const result = call(refCycleNeedsMaxDepth, document.components.schemas.Node, ctx);
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit for self-ref with x-max-depth', () => {
    const document = {
      components: {
        schemas: {
          Node: {
            type: 'object',
            'x-max-depth': 5,
            properties: { child: { $ref: '#/components/schemas/Node' } },
          },
        },
      },
    };
    const ctx = mockContext({
      path: ['components', 'schemas', 'Node'],
      documentData: document,
    });
    const result = call(refCycleNeedsMaxDepth, document.components.schemas.Node, ctx);
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('does not emit for acyclic schema', () => {
    const document = {
      components: {
        schemas: {
          Leaf: { type: 'object', properties: { v: { type: 'string' } } },
        },
      },
    };
    const ctx = mockContext({
      path: ['components', 'schemas', 'Leaf'],
      documentData: document,
    });
    const result = call(refCycleNeedsMaxDepth, document.components.schemas.Leaf, ctx);
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('detects multi-hop cycles (A → B → A)', () => {
    const document = {
      components: {
        schemas: {
          A: {
            type: 'object',
            properties: { b: { $ref: '#/components/schemas/B' } },
          },
          B: {
            type: 'object',
            properties: { a: { $ref: '#/components/schemas/A' } },
          },
        },
      },
    };
    const ctxA = mockContext({
      path: ['components', 'schemas', 'A'],
      documentData: document,
    });
    const result = call(refCycleNeedsMaxDepth, document.components.schemas.A, ctxA);
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });
});

// =============================================================================
// fieldEvolutionSuffix (EV-41)
// =============================================================================

describe('fieldEvolutionSuffix (EV-41)', () => {
  it('emits one finding per evolution-suffixed property', () => {
    const props = {
      email: { type: 'string' },
      email_v1: { type: 'string' },
      address_legacy: { type: 'string' },
      profile_old: { type: 'string' },
    };
    const result = call(fieldEvolutionSuffix, props, mockContext({ path: ['x'] }));
    expect(Array.isArray(result) ? result.length : 0).toBe(3);
  });

  it('does not flag properties without suffix', () => {
    const props = { email: { type: 'string' }, name: { type: 'string' } };
    const result = call(fieldEvolutionSuffix, props, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// tagsInternalExperimental (EV-42)
// =============================================================================

describe('tagsInternalExperimental (EV-42)', () => {
  it('emits when operation has internal tag', () => {
    const op = { tags: ['users', 'internal'] };
    const result = call(tagsInternalExperimental, op, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit for clean tags', () => {
    const op = { tags: ['users', 'orders'] };
    const result = call(tagsInternalExperimental, op, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('handles missing tags gracefully', () => {
    const op = {};
    const result = call(tagsInternalExperimental, op, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// noComponentsSchemas (EV-44)
// =============================================================================

describe('noComponentsSchemas (EV-44)', () => {
  it('emits when no components.schemas declared', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1.0' },
      paths: { '/foo': { get: { responses: { '200': { description: 'ok' } } } } },
    };
    const result = call(noComponentsSchemas, doc, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit when components.schemas present', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1.0' },
      paths: { '/foo': {} },
      components: { schemas: { User: { type: 'object' } } },
    };
    const result = call(noComponentsSchemas, doc, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('does not emit when no paths at all (skip non-API specs)', () => {
    const doc = { openapi: '3.0.3', info: { title: 'T', version: '1.0' }, paths: {} };
    const result = call(noComponentsSchemas, doc, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// defaultSpecificStatusOverlap (EV-45)
// =============================================================================

describe('defaultSpecificStatusOverlap (EV-45)', () => {
  it('emits when default + range-code overlap', () => {
    const responses = { '200': {}, '4XX': {}, default: {} };
    const result = call(defaultSpecificStatusOverlap, responses, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit on default-only', () => {
    const responses = { '200': {}, default: {} };
    const result = call(defaultSpecificStatusOverlap, responses, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('flags exhaustive 4xx+5xx + default as redundant', () => {
    const responses = {
      '200': {}, '400': {}, '500': {}, default: {},
    };
    const result = call(defaultSpecificStatusOverlap, responses, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });
});

// =============================================================================
// multipartJsonSameSchema (EV-47)
// =============================================================================

describe('multipartJsonSameSchema (EV-47)', () => {
  it('emits when both content-types use same $ref', () => {
    const rb = {
      content: {
        'multipart/form-data': { schema: { $ref: '#/components/schemas/X' } },
        'application/json': { schema: { $ref: '#/components/schemas/X' } },
      },
    };
    const result = call(multipartJsonSameSchema, rb, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit when refs differ', () => {
    const rb = {
      content: {
        'multipart/form-data': { schema: { $ref: '#/components/schemas/A' } },
        'application/json': { schema: { $ref: '#/components/schemas/B' } },
      },
    };
    const result = call(multipartJsonSameSchema, rb, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// magicStringEnumCandidate (EV-51)
// =============================================================================

describe('magicStringEnumCandidate (EV-51)', () => {
  it('emits for `status` (string, no enum)', () => {
    const props = { status: { type: 'string' } };
    const result = call(magicStringEnumCandidate, props, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit when enum is set', () => {
    const props = { status: { type: 'string', enum: ['a', 'b'] } };
    const result = call(magicStringEnumCandidate, props, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('does not emit for non-affinity name', () => {
    const props = { displayName: { type: 'string' } };
    const result = call(magicStringEnumCandidate, props, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// intNeedsStringEncoding (EV-52)
// =============================================================================

describe('intNeedsStringEncoding (EV-52)', () => {
  it('emits for integer max > 2^53', () => {
    const schema = { type: 'integer', maximum: 9999999999999999 };
    const result = call(intNeedsStringEncoding, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit for int32-bounded value', () => {
    const schema = { type: 'integer', maximum: 2147483647 };
    const result = call(intNeedsStringEncoding, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// versionParamNoEnum (EV-54)
// =============================================================================

describe('versionParamNoEnum (EV-54)', () => {
  it('emits for `api-version` without enum', () => {
    const param = { name: 'api-version', in: 'query', schema: { type: 'string' } };
    const result = call(versionParamNoEnum, param, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit when enum is set', () => {
    const param = {
      name: 'api-version',
      in: 'query',
      schema: { type: 'string', enum: ['v1', 'v2'] },
    };
    const result = call(versionParamNoEnum, param, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('does not emit for non-version param-name', () => {
    const param = { name: 'limit', in: 'query', schema: { type: 'integer' } };
    const result = call(versionParamNoEnum, param, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// redirectWithoutLocation (EV-59)
// =============================================================================

describe('redirectWithoutLocation (EV-59)', () => {
  it('emits for 301 without Location header', () => {
    const responses = { '301': { description: 'r' } };
    const result = call(redirectWithoutLocation, responses, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit when Location header present', () => {
    const responses = { '301': { description: 'r', headers: { Location: {} } } };
    const result = call(redirectWithoutLocation, responses, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('does not emit for non-redirect codes', () => {
    const responses = { '200': { description: 'ok' } };
    const result = call(redirectWithoutLocation, responses, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('detects header in case-insensitive manner', () => {
    const responses = { '302': { description: 'r', headers: { LOCATION: {} } } };
    const result = call(redirectWithoutLocation, responses, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// webhookNeedsProse (EV-60)
// =============================================================================

describe('webhookNeedsProse (EV-60)', () => {
  it('emits when summary AND description missing', () => {
    const op = { responses: { '200': {} } };
    const ctx = mockContext({ path: ['webhooks', 'created', 'post'] });
    const result = call(webhookNeedsProse, op, ctx);
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit when description present', () => {
    const op = { description: 'Sent on create.' };
    const ctx = mockContext({ path: ['webhooks', 'created', 'post'] });
    const result = call(webhookNeedsProse, op, ctx);
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('does not emit if path is not under webhooks', () => {
    const op = {};
    const ctx = mockContext({ path: ['paths', '/x', 'post'] });
    const result = call(webhookNeedsProse, op, ctx);
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// oneofClosedProseSaysOpen (EV-61)
// =============================================================================

describe('oneofClosedProseSaysOpen (EV-61)', () => {
  it('emits when prose says "more variants will be added"', () => {
    const schema = {
      description: 'Event union. More variants will be added soon.',
      oneOf: [{}, {}],
    };
    const result = call(oneofClosedProseSaysOpen, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('emits when prose says "future extensions"', () => {
    const schema = {
      description: 'A discriminated union (future extensions planned).',
      oneOf: [{}, {}],
    };
    const result = call(oneofClosedProseSaysOpen, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit on neutral description', () => {
    const schema = {
      description: 'A discriminated union of A or B.',
      oneOf: [{}, {}],
    };
    const result = call(oneofClosedProseSaysOpen, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('does not emit when oneOf is missing', () => {
    const schema = { description: 'More variants will be added' };
    const result = call(oneofClosedProseSaysOpen, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});

// =============================================================================
// int64StringEncodingCandidate (EV-62)
// =============================================================================

describe('int64StringEncodingCandidate (EV-62)', () => {
  it('emits for type:integer + format:int64', () => {
    const schema = { type: 'integer', format: 'int64' };
    const result = call(int64StringEncodingCandidate, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(1);
  });

  it('does not emit for type:string + format:int64', () => {
    const schema = { type: 'string', format: 'int64' };
    const result = call(int64StringEncodingCandidate, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('does not emit for type:integer without int64 format', () => {
    const schema = { type: 'integer' };
    const result = call(int64StringEncodingCandidate, schema, mockContext());
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });
});
