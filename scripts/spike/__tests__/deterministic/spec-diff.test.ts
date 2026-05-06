/**
 * Tests for the spec-diff module (Welle A · T26).
 *
 * Covers the breaking-change classes called out in the task spec:
 *   1. Required-add (new required property added)
 *   2. Required-remove (property removed from response)
 *   3. Type-narrow (schema type changed)
 *   4. Status-code-removed (response code dropped)
 *   5. No-change-clean (identical specs -> empty findings)
 *   6. Skip-silent when only one spec is provided
 *   7. Default-value changed
 *   8. Auth-scheme changed
 *   9. Property became required (optional -> required)
 *   10. Output validates against FindingSchema (via output-mapper)
 */

import { describe, it, expect } from 'vitest';
import { runSpecDiff } from '../../deterministic/spec-diff.js';
import { mapDetectorFinding } from '../../deterministic/output-mapper.js';

// =============================================================================
// Spec builders
// =============================================================================

function makeSpec(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {},
    ...extra,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('runSpecDiff', () => {
  it('returns empty findings (no-throw) when only baseline is provided', async () => {
    const baseline = makeSpec();
    const findings = await runSpecDiff(baseline, undefined, { silent: true });
    expect(findings).toEqual([]);
  });

  it('returns empty findings (no-throw) when only current is provided', async () => {
    const current = makeSpec();
    const findings = await runSpecDiff(undefined, current, { silent: true });
    expect(findings).toEqual([]);
  });

  it('invokes opts.logger with a notice message when one input is missing (and silent=false)', async () => {
    const messages: string[] = [];
    const findings = await runSpecDiff(undefined, makeSpec(), { logger: (m) => messages.push(m) });
    expect(findings).toEqual([]);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('spec-diff');
  });

  it('returns no findings when baseline and current are identical (clean spec)', async () => {
    const spec = makeSpec({
      paths: {
        '/things': {
          get: {
            operationId: 'listThings',
            responses: {
              '200': {
                description: 'OK',
                content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } },
              },
            },
          },
        },
      },
    });
    const baseline = JSON.parse(JSON.stringify(spec));
    const current = JSON.parse(JSON.stringify(spec));
    const findings = await runSpecDiff(baseline, current);
    expect(findings).toEqual([]);
  });

  it('flags new-required-property-added (request schema)', async () => {
    const baseline = makeSpec({
      paths: {
        '/users': {
          post: {
            operationId: 'createUser',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const current = JSON.parse(JSON.stringify(baseline));
    const reqSchema = (current.paths as any)['/users'].post.requestBody.content['application/json'].schema;
    reqSchema.properties.email = { type: 'string', format: 'email' };
    reqSchema.required = ['name', 'email'];
    const findings = await runSpecDiff(baseline, current, { diffBaselineSpecId: 'v1', diffCurrentSpecId: 'v2' });
    const requiredAdd = findings.find((f) => f.detectorId === 'spec-diff:new-required-property-added');
    expect(requiredAdd).toBeDefined();
    expect(requiredAdd!.severity).toBe('critical');
    expect(requiredAdd!.meta!.diffBreakingClass).toBe('A');
    expect(requiredAdd!.meta!.severityDirection).toBe('tighten');
    expect(requiredAdd!.meta!.severityTier).toBe('error');
    expect(requiredAdd!.meta!.diffBaselineSpecId).toBe('v1');
    expect(requiredAdd!.meta!.diffCurrentSpecId).toBe('v2');
    expect(requiredAdd!.meta!.lens).toEqual(['evolution-friction']);
  });

  it('flags property-removed on response (required-remove on read shape)', async () => {
    const baseline = makeSpec({
      paths: {
        '/items/{id}': {
          get: {
            operationId: 'getItem',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { id: { type: 'string' }, name: { type: 'string' }, legacyField: { type: 'string' } },
                      required: ['id', 'name'],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const current = JSON.parse(JSON.stringify(baseline));
    delete (current.paths as any)['/items/{id}'].get.responses['200'].content['application/json'].schema.properties.legacyField;
    const findings = await runSpecDiff(baseline, current);
    const removed = findings.find((f) => f.detectorId === 'spec-diff:property-removed');
    expect(removed).toBeDefined();
    expect(removed!.severity).toBe('critical');
    expect(removed!.meta!.diffBreakingClass).toBe('N');
    expect(removed!.title).toContain('legacyField');
  });

  it('flags schema-type-changed (type-narrow / type swap)', async () => {
    const baseline = makeSpec({
      paths: {
        '/account': {
          get: {
            operationId: 'getAccount',
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { id: { type: 'integer' } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const current = JSON.parse(JSON.stringify(baseline));
    (current.paths as any)['/account'].get.responses['200'].content['application/json'].schema.properties.id = { type: 'string' };
    const findings = await runSpecDiff(baseline, current);
    const typeChange = findings.find((f) => f.detectorId === 'spec-diff:schema-type-changed');
    expect(typeChange).toBeDefined();
    expect(typeChange!.severity).toBe('critical');
    expect(typeChange!.meta!.diffBreakingClass).toBe('B');
    expect(typeChange!.meta!.severityTier).toBe('error');
    expect(typeChange!.title).toContain('integer');
    expect(typeChange!.title).toContain('string');
  });

  it('flags response-status-removed (status code dropped between versions)', async () => {
    const baseline = makeSpec({
      paths: {
        '/things': {
          get: {
            operationId: 'listThings',
            responses: {
              '200': { description: 'OK' },
              '429': { description: 'Too Many Requests' },
            },
          },
        },
      },
    });
    const current = JSON.parse(JSON.stringify(baseline));
    delete (current.paths as any)['/things'].get.responses['429'];
    const findings = await runSpecDiff(baseline, current);
    const removed = findings.find((f) => f.detectorId === 'spec-diff:response-status-removed');
    expect(removed).toBeDefined();
    expect(removed!.severity).toBe('high');
    expect(removed!.meta!.diffBreakingClass).toBe('I');
    expect(removed!.title).toContain('429');
  });

  it('flags property-became-required when an existing optional becomes required', async () => {
    const baseline = makeSpec({
      paths: {
        '/widgets': {
          post: {
            operationId: 'createWidget',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { kind: { type: 'string' }, color: { type: 'string' } }, required: ['kind'] },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const current = JSON.parse(JSON.stringify(baseline));
    (current.paths as any)['/widgets'].post.requestBody.content['application/json'].schema.required = ['kind', 'color'];
    const findings = await runSpecDiff(baseline, current);
    const flip = findings.find((f) => f.detectorId === 'spec-diff:property-became-required');
    expect(flip).toBeDefined();
    expect(flip!.severity).toBe('critical');
    expect(flip!.meta!.diffBreakingClass).toBe('A');
    expect(flip!.meta!.severityDirection).toBe('tighten');
    expect(flip!.title).toContain('color');
  });

  it('flags default-value-changed and security-schemes-changed', async () => {
    const baseline = makeSpec({
      paths: {
        '/cfg': {
          get: {
            operationId: 'getCfg',
            parameters: [
              { name: 'mode', in: 'query', required: false, schema: { type: 'string', default: 'fast' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
    });
    const current = JSON.parse(JSON.stringify(baseline));
    (current.paths as any)['/cfg'].get.parameters[0].schema.default = 'slow';
    (current.components as any).securitySchemes = {
      bearer: { type: 'http', scheme: 'bearer' },
    };
    const findings = await runSpecDiff(baseline, current);
    const def = findings.find((f) => f.detectorId === 'spec-diff:default-value-changed');
    expect(def).toBeDefined();
    expect(def!.meta!.diffBreakingClass).toBe('C');
    const sec = findings.find((f) => f.detectorId === 'spec-diff:security-schemes-changed');
    expect(sec).toBeDefined();
    expect(sec!.meta!.diffBreakingClass).toBe('K');
    expect(sec!.meta!.severityTier).toBe('warn');
  });

  it('flags operation-removed when an endpoint is dropped between versions', async () => {
    const baseline = makeSpec({
      paths: {
        '/foos': { get: { operationId: 'listFoos', responses: { '200': { description: 'OK' } } } },
        '/foos/{id}': { get: { operationId: 'getFoo', responses: { '200': { description: 'OK' } } } },
      },
    });
    const current = JSON.parse(JSON.stringify(baseline));
    delete (current.paths as any)['/foos/{id}'];
    const findings = await runSpecDiff(baseline, current);
    const op = findings.find((f) => f.detectorId === 'spec-diff:operation-removed');
    expect(op).toBeDefined();
    expect(op!.severity).toBe('critical');
    expect(op!.meta!.diffBreakingClass).toBe('H');
    expect(op!.title).toContain('/foos/{id}');
  });

  it('FindingSchema-validates each emitted finding via output-mapper', async () => {
    const baseline = makeSpec({
      paths: {
        '/x': {
          get: { operationId: 'getX', responses: { '200': { description: 'OK' }, '500': { description: 'Err' } } },
        },
      },
    });
    const current = JSON.parse(JSON.stringify(baseline));
    delete (current.paths as any)['/x'].get.responses['500'];
    const findings = await runSpecDiff(baseline, current);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      const mapped = mapDetectorFinding(f);
      expect(mapped.title).toBe(f.title);
      expect(mapped.severity).toBe(f.severity);
    }
  });
});
