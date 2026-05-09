/**
 * Tests for Stage-A naming-classifier (Task #5).
 *
 * Coverage:
 *  - classifyIdentifier: each of the eight buckets gets at least one assertion
 *  - collectIdentifiers: pulls property names from component schemas + inline
 *    request bodies; pulls path-segments, path-parameters, tags, headers
 *  - runNamingClassifier: minority threshold suppression + emission across
 *    multiple inconsistency-classes on a synthetic mixed spec
 *  - mapped-finding round-trip: detector findings validate against FindingSchema
 *    via the deterministic output-mapper
 *  - operationId verb-position drift detection
 */

import { describe, it, expect } from 'vitest';

import {
  classifyIdentifier,
  collectIdentifiers,
  distributionFor,
  runNamingClassifier,
} from '../../deterministic/modules/naming-classifier.js';
import { mapDetectorFindings } from '../../deterministic/infra/output-mapper.js';

// ---------------------------------------------------------------------------
// classifyIdentifier — 8 buckets
// ---------------------------------------------------------------------------

describe('classifyIdentifier', () => {
  it('classifies camelCase', () => {
    expect(classifyIdentifier('fooBar')).toBe('camelCase');
    expect(classifyIdentifier('createdAt')).toBe('camelCase');
    expect(classifyIdentifier('userId')).toBe('camelCase');
  });

  it('classifies snake_case', () => {
    expect(classifyIdentifier('foo_bar')).toBe('snake_case');
    expect(classifyIdentifier('created_at')).toBe('snake_case');
    expect(classifyIdentifier('user_id')).toBe('snake_case');
  });

  it('classifies kebab-case', () => {
    expect(classifyIdentifier('foo-bar')).toBe('kebab-case');
    expect(classifyIdentifier('created-at')).toBe('kebab-case');
  });

  it('classifies PascalCase', () => {
    expect(classifyIdentifier('FooBar')).toBe('PascalCase');
    expect(classifyIdentifier('CreatedAt')).toBe('PascalCase');
    expect(classifyIdentifier('Customer')).toBe('PascalCase');
  });

  it('classifies SCREAMING_SNAKE_CASE', () => {
    expect(classifyIdentifier('FOO_BAR')).toBe('SCREAMING_SNAKE_CASE');
    expect(classifyIdentifier('CREATED_AT')).toBe('SCREAMING_SNAKE_CASE');
    expect(classifyIdentifier('MAX_RETRIES')).toBe('SCREAMING_SNAKE_CASE');
  });

  it('classifies mixed (combined separators or snake+upper)', () => {
    expect(classifyIdentifier('foo_Bar')).toBe('mixed');
    expect(classifyIdentifier('foo-Bar')).toBe('mixed');
    expect(classifyIdentifier('foo_bar-baz')).toBe('mixed');
    expect(classifyIdentifier('User-Name')).toBe('mixed');
  });

  it('classifies acronym-heavy single tokens (URL, ID, API, HTTP)', () => {
    expect(classifyIdentifier('URL')).toBe('acronym-heavy');
    expect(classifyIdentifier('ID')).toBe('acronym-heavy');
    expect(classifyIdentifier('API')).toBe('acronym-heavy');
  });

  it('classifies "lower" for single all-lower tokens (neutral, excluded from majority calc)', () => {
    expect(classifyIdentifier('foo')).toBe('lower');
    expect(classifyIdentifier('id')).toBe('lower');
    expect(classifyIdentifier('email')).toBe('lower');
  });

  it('classifies "other" for non-alphabetic / unclassifiable tokens', () => {
    expect(classifyIdentifier('123')).toBe('other');
    expect(classifyIdentifier('')).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// collectIdentifiers — pulls from all the right places
// ---------------------------------------------------------------------------

describe('collectIdentifiers', () => {
  it('collects schema names + recursive property names + tags + path-segments + path-params + header-params', () => {
    const spec: object = {
      openapi: '3.0.3',
      info: { title: 'Demo', version: '1.0.0' },
      tags: [{ name: 'Customers' }, { name: 'payment_methods' }],
      paths: {
        '/v1/Customers/{customer_id}': {
          get: {
            operationId: 'getCustomer',
            tags: ['Customers'],
            parameters: [
              { name: 'customer_id', in: 'path', required: true },
              { name: 'X-Request-Id', in: 'header' },
              { name: 'idempotency_key', in: 'header' },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
        '/v1/payment_methods/{paymentMethodId}': {
          post: {
            operationId: 'create_payment_method',
            tags: ['payment_methods'],
            parameters: [{ name: 'paymentMethodId', in: 'path', required: true }],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      customerId: { type: 'string' },
                      created_at: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: {
        schemas: {
          Customer: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              created_at: { type: 'integer' },
            },
          },
          payment_method: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              cardLast4: { type: 'string' },
            },
          },
        },
      },
    };

    const ids = collectIdentifiers(spec);

    expect(ids.schemas.names).toContain('Customer');
    expect(ids.schemas.names).toContain('payment_method');

    // properties from both component schemas + inline request body
    expect(ids.properties.names).toEqual(
      expect.arrayContaining(['id', 'email', 'created_at', 'type', 'cardLast4', 'customerId']),
    );

    expect(ids.operationIds.names).toEqual(
      expect.arrayContaining(['getCustomer', 'create_payment_method']),
    );

    expect(ids.pathSegments.names).toEqual(expect.arrayContaining(['v1', 'Customers', 'payment_methods']));

    expect(ids.pathParameters.names).toEqual(expect.arrayContaining(['customer_id', 'paymentMethodId']));

    expect(ids.tags.names).toEqual(expect.arrayContaining(['Customers', 'payment_methods']));

    expect(ids.headerParameters.names).toEqual(expect.arrayContaining(['X-Request-Id', 'idempotency_key']));
  });
});

// ---------------------------------------------------------------------------
// distributionFor — majority + significant minority
// ---------------------------------------------------------------------------

describe('distributionFor', () => {
  it('respects minority-noise threshold (count<3 or share<5% suppressed)', () => {
    // 19 snake_case + 1 camelCase → minority count below threshold
    const bucket = {
      className: 'property',
      names: [
        ...Array.from({ length: 19 }, (_, i) => `prop_${i}`),
        'oddOneOut',
      ],
      countsByName: new Map<string, number>(),
    };
    const dist = distributionFor(bucket);
    expect(dist.majority).toBe('snake_case');
    // camelCase count is 1 → below MINORITY_COUNT_THRESHOLD (3) — suppressed
    expect(dist.significantMinorities).not.toContain('camelCase');
  });

  it('emits significant minority when both thresholds met', () => {
    // 17 snake_case + 3 camelCase = 20 total → camelCase 3 (15%) ✓
    const bucket = {
      className: 'property',
      names: [
        ...Array.from({ length: 17 }, (_, i) => `prop_${i}`),
        'fooBar',
        'bazQux',
        'helloWorld',
      ],
      countsByName: new Map<string, number>(),
    };
    const dist = distributionFor(bucket);
    expect(dist.majority).toBe('snake_case');
    expect(dist.significantMinorities).toContain('camelCase');
  });
});

// ---------------------------------------------------------------------------
// runNamingClassifier — full pipeline emits findings on a mixed spec
// ---------------------------------------------------------------------------

describe('runNamingClassifier', () => {
  it('emits property-mix finding when properties mix snake_case and camelCase', async () => {
    // Build a spec with 17 snake_case properties + 3 camelCase ones
    const snakeProps: Record<string, unknown> = {};
    for (let i = 0; i < 17; i++) {
      snakeProps[`field_${i}`] = { type: 'string' };
    }
    const camelProps: Record<string, unknown> = {
      fooBar: { type: 'string' },
      bazQux: { type: 'string' },
      helloWorld: { type: 'string' },
    };

    const spec: object = {
      openapi: '3.0.3',
      info: { title: 'Mixed Naming', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          MixedShape: {
            type: 'object',
            properties: { ...snakeProps, ...camelProps },
          },
        },
      },
    };

    const findings = await runNamingClassifier(spec);
    const propertyMix = findings.find((f) => f.detectorId === 'walker:naming-property-mix');
    expect(propertyMix).toBeDefined();
    expect(propertyMix!.meta?.majority).toBe('snake_case');
    const minorities = (propertyMix!.meta?.minorities ?? []) as Array<{ pattern: string }>;
    expect(minorities.map((m) => m.pattern)).toContain('camelCase');
  });

  it('emits operationId-drift finding when verb-first and verb-last patterns coexist', async () => {
    // 17 verb-first (getX, listY) + 3 verb-last (foo_get, bar_list, baz_get)
    const paths: Record<string, unknown> = {};
    const verbFirstIds = [
      'getCustomer', 'listCustomers', 'createCharge', 'updateInvoice', 'deleteCard',
      'getRefund', 'listRefunds', 'createRefund', 'getOrder', 'listOrders',
      'createOrder', 'getProduct', 'listProducts', 'createProduct', 'getPlan',
      'listPlans', 'createPlan',
    ];
    for (let i = 0; i < verbFirstIds.length; i++) {
      paths[`/path-${i}`] = {
        get: {
          operationId: verbFirstIds[i],
          responses: { '200': { description: 'ok' } },
        },
      };
    }
    const verbLastIds = ['user_get', 'profile_list', 'thing_create'];
    for (let i = 0; i < verbLastIds.length; i++) {
      paths[`/last-${i}`] = {
        get: {
          operationId: verbLastIds[i],
          responses: { '200': { description: 'ok' } },
        },
      };
    }
    const spec: object = {
      openapi: '3.0.3',
      info: { title: 'OpId Drift', version: '1.0.0' },
      paths,
    };

    const findings = await runNamingClassifier(spec);
    const drift = findings.find((f) => f.detectorId === 'walker:naming-operationid-drift');
    expect(drift).toBeDefined();
    expect(drift!.meta?.majority).toBe('verb-first');
    expect(drift!.meta?.minority).toBe('verb-last');
  });

  it('emits path-lowercase finding when path-segments contain uppercase characters', async () => {
    const paths: Record<string, unknown> = {};
    for (let i = 0; i < 17; i++) {
      paths[`/v1/lowercase_seg_${i}/{id}`] = {
        get: { operationId: `lower${i}`, responses: { '200': { description: 'ok' } } },
      };
    }
    paths['/Users/{id}'] = { get: { operationId: 'a', responses: { '200': { description: 'ok' } } } };
    paths['/Customers/{id}'] = { get: { operationId: 'b', responses: { '200': { description: 'ok' } } } };
    paths['/Invoices/{id}'] = { get: { operationId: 'c', responses: { '200': { description: 'ok' } } } };

    const spec: object = {
      openapi: '3.0.3',
      info: { title: 'Path Casing', version: '1.0.0' },
      paths,
    };
    const findings = await runNamingClassifier(spec);
    const pl = findings.find((f) => f.detectorId === 'walker:naming-path-lowercase');
    expect(pl).toBeDefined();
    expect((pl!.meta?.nonLower as number) >= 3).toBe(true);
  });

  it('detector findings round-trip through output-mapper -> FindingSchema', async () => {
    // Synthetic mixed spec covering several inconsistency classes at once
    const props: Record<string, unknown> = {};
    for (let i = 0; i < 18; i++) props[`snake_prop_${i}`] = { type: 'string' };
    props.camelOne = { type: 'string' };
    props.camelTwo = { type: 'string' };
    props.camelThree = { type: 'string' };

    const spec: object = {
      openapi: '3.0.3',
      info: { title: 'Round-trip', version: '1.0.0' },
      tags: [
        { name: 'CustomersA' }, { name: 'CustomersB' }, { name: 'CustomersC' },
        { name: 'CustomersD' }, { name: 'CustomersE' }, { name: 'CustomersF' },
        { name: 'CustomersG' }, { name: 'CustomersH' }, { name: 'CustomersI' },
        { name: 'CustomersJ' }, { name: 'CustomersK' }, { name: 'CustomersL' },
        { name: 'CustomersM' }, { name: 'CustomersN' }, { name: 'CustomersO' },
        { name: 'CustomersP' }, { name: 'CustomersQ' },
        { name: 'snake_one' }, { name: 'snake_two' }, { name: 'snake_three' },
      ],
      paths: {},
      components: { schemas: { Mix: { type: 'object', properties: props } } },
    };

    const detectorFindings = await runNamingClassifier(spec);
    expect(detectorFindings.length).toBeGreaterThan(0);
    const mapped = mapDetectorFindings(detectorFindings);
    // Output-mapper drops findings that don't validate. Verify nothing dropped.
    expect(mapped.length).toBe(detectorFindings.length);
    // Schema validation already happened inside mapDetectorFinding via FindingSchema.parse;
    // double-check shape invariants.
    for (const f of mapped) {
      expect(f.title.length).toBeGreaterThanOrEqual(1);
      expect(f.title.length).toBeLessThanOrEqual(200);
      expect(f.narration.length).toBeGreaterThanOrEqual(50);
      expect(f.rationale.length).toBeGreaterThanOrEqual(20);
      expect(['clarity', 'design', 'risk']).toContain(f.category);
    }
  });

  it('emits no findings on a clean uniform spec', async () => {
    const props: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) props[`field_${i}`] = { type: 'string' };
    const spec: object = {
      openapi: '3.0.3',
      info: { title: 'Clean', version: '1.0.0' },
      paths: {
        '/users/{user_id}': {
          get: {
            operationId: 'getUser',
            tags: ['users'],
            parameters: [{ name: 'user_id', in: 'path', required: true }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: props,
          },
        },
      },
    };
    const findings = await runNamingClassifier(spec);
    // No mixed-naming findings expected on a uniform spec
    expect(findings.length).toBe(0);
  });
});
