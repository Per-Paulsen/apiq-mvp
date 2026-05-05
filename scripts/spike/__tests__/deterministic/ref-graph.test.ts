/**
 * Tests for the $ref-graph analyzer.
 *
 * Each test case targets one of the four findings the module emits:
 *   1. cycle-detection
 *   2. orphan-detection (across all 9 component classes)
 *   3. deep-$ref-chain detection
 *   4. component-reuse histogram
 *
 * Plus a smoke-test that verifies the output validates against FindingSchema
 * when run through the canonical output-mapper.
 */

import { describe, it, expect } from 'vitest';
import { runRefGraphAnalysis, buildRefGraph } from '../../deterministic/ref-graph.js';
import { mapDetectorFindings } from '../../deterministic/output-mapper.js';

// =============================================================================
// Helpers
// =============================================================================

function refTo(pointer: string): { $ref: string } {
  return { $ref: pointer };
}

interface TestSpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
    headers: Record<string, unknown>;
    parameters: Record<string, unknown>;
    responses: Record<string, unknown>;
    examples: Record<string, unknown>;
    requestBodies: Record<string, unknown>;
    links: Record<string, unknown>;
    callbacks: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
}

function baseSpec(): TestSpec {
  return {
    openapi: '3.0.3',
    info: { title: 'test', version: '0.0.0' },
    paths: {},
    components: {
      schemas: {},
      headers: {},
      parameters: {},
      responses: {},
      examples: {},
      requestBodies: {},
      links: {},
      callbacks: {},
      securitySchemes: {},
    },
  };
}

// =============================================================================
// 1. Cycle-detection
// =============================================================================

describe('runRefGraphAnalysis — cycles', () => {
  it('emits a cycle finding for a self-referential schema', async () => {
    const spec = baseSpec();
    spec.components.schemas.TreeNode = {
      type: 'object',
      properties: {
        value: { type: 'string' },
        children: {
          type: 'array',
          items: refTo('#/components/schemas/TreeNode'),
        },
      },
    };
    // External use (so the schema isn't only an orphan).
    spec.paths['/tree'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: refTo('#/components/schemas/TreeNode'),
              },
            },
          },
        },
      },
    };
    const findings = await runRefGraphAnalysis(spec);
    const cycleFinding = findings.find((f) => f.detectorId === 'refgraph:cycles');
    expect(cycleFinding).toBeDefined();
    expect(cycleFinding!.meta?.cycleCount).toBe(1);
    expect(cycleFinding!.title).toMatch(/cycle/i);
  });

  it('emits a cycle finding for a 2-node mutual-recursion cycle', async () => {
    const spec = baseSpec();
    spec.components.schemas.A = {
      type: 'object',
      properties: { b: refTo('#/components/schemas/B') },
    };
    spec.components.schemas.B = {
      type: 'object',
      properties: { a: refTo('#/components/schemas/A') },
    };
    spec.paths['/a'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': { schema: refTo('#/components/schemas/A') },
            },
          },
        },
      },
    };
    const findings = await runRefGraphAnalysis(spec);
    const cycleFinding = findings.find((f) => f.detectorId === 'refgraph:cycles');
    expect(cycleFinding).toBeDefined();
    const meta = cycleFinding!.meta as { cycleCount: number; cycles: string[][] };
    expect(meta.cycleCount).toBe(1);
    // Cycle should contain both A and B
    expect(meta.cycles[0]).toHaveLength(2);
    const names = meta.cycles[0]
      .map((p) => p.replace(/^#\/components\/[^/]+\//, ''))
      .sort();
    expect(names).toEqual(['A', 'B']);
  });

  it('does NOT emit a cycle finding when the graph is acyclic', async () => {
    const spec = baseSpec();
    spec.components.schemas.A = {
      type: 'object',
      properties: { b: refTo('#/components/schemas/B') },
    };
    spec.components.schemas.B = { type: 'object' };
    spec.paths['/a'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': { schema: refTo('#/components/schemas/A') },
            },
          },
        },
      },
    };
    const findings = await runRefGraphAnalysis(spec);
    expect(findings.find((f) => f.detectorId === 'refgraph:cycles')).toBeUndefined();
  });
});

// =============================================================================
// 2. Orphan-detection across all component classes
// =============================================================================

describe('runRefGraphAnalysis — orphans', () => {
  it('detects an orphan in EACH of the 9 component classes', async () => {
    const spec = baseSpec();
    const c = spec.components;
    // Plant ONE orphan in each class.
    c.schemas.OrphanSchema = { type: 'string' };
    c.headers.OrphanHeader = { schema: { type: 'string' } };
    c.parameters.OrphanParam = { name: 'q', in: 'query', schema: { type: 'string' } };
    c.responses.OrphanResponse = { description: 'orphan' };
    c.examples.OrphanExample = { value: 'x' };
    c.requestBodies.OrphanBody = {
      content: { 'application/json': { schema: { type: 'object' } } },
    };
    c.links.OrphanLink = { operationId: 'foo' };
    c.callbacks.OrphanCallback = { '/cb': { post: { responses: { '200': { description: 'ok' } } } } };
    c.securitySchemes.OrphanScheme = { type: 'apiKey', in: 'header', name: 'X-Key' };

    const findings = await runRefGraphAnalysis(spec);

    for (const cls of [
      'schemas',
      'headers',
      'parameters',
      'responses',
      'examples',
      'requestBodies',
      'links',
      'callbacks',
      'securitySchemes',
    ]) {
      const f = findings.find((x) => x.detectorId === `refgraph:orphans:${cls}`);
      expect(f, `expected orphan finding for class "${cls}"`).toBeDefined();
      const meta = f!.meta as { orphanCount: number; orphans: string[] };
      expect(meta.orphanCount).toBe(1);
      expect(meta.orphans).toHaveLength(1);
    }
  });

  it('does NOT flag a component referenced from an operation', async () => {
    const spec = baseSpec();
    spec.components.schemas.UsedSchema = { type: 'string' };
    spec.paths['/x'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: refTo('#/components/schemas/UsedSchema'),
              },
            },
          },
        },
      },
    };
    const findings = await runRefGraphAnalysis(spec);
    expect(findings.find((f) => f.detectorId === 'refgraph:orphans:schemas')).toBeUndefined();
  });

  it('flags components even when one references the other (internal-only refs do not save them)', async () => {
    // A ↔ B reference each other but neither is used by an operation. Both should be orphans.
    const spec = baseSpec();
    spec.components.schemas.A = {
      type: 'object',
      properties: { b: refTo('#/components/schemas/B') },
    };
    spec.components.schemas.B = { type: 'object' };

    const findings = await runRefGraphAnalysis(spec);
    const f = findings.find((x) => x.detectorId === 'refgraph:orphans:schemas');
    expect(f).toBeDefined();
    expect((f!.meta as { orphanCount: number }).orphanCount).toBe(2);
  });
});

// =============================================================================
// 3. Deep-$ref-chain detection
// =============================================================================

describe('runRefGraphAnalysis — deep $ref chains', () => {
  it('flags a chain of length > 5', async () => {
    const spec = baseSpec();
    // Build a 7-link chain: L0 → L1 → L2 → L3 → L4 → L5 → L6 → L7
    for (let i = 0; i < 7; i++) {
      spec.components.schemas[`L${i}`] = {
        type: 'object',
        properties: { next: refTo(`#/components/schemas/L${i + 1}`) },
      };
    }
    spec.components.schemas.L7 = { type: 'string' };
    // Mark L0 as externally used so it doesn't show up as an orphan.
    spec.paths['/x'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': { schema: refTo('#/components/schemas/L0') },
            },
          },
        },
      },
    };
    const findings = await runRefGraphAnalysis(spec);
    const deep = findings.find((f) => f.detectorId === 'refgraph:deep-chain');
    expect(deep).toBeDefined();
    const meta = deep!.meta as { count: number; threshold: number; deepest: Array<{ depth: number }> };
    expect(meta.threshold).toBe(5);
    // L0 has depth 7; L1 has 6 — both above threshold.
    expect(meta.count).toBeGreaterThanOrEqual(2);
    expect(meta.deepest[0].depth).toBeGreaterThanOrEqual(7);
  });

  it('does NOT fire on a chain of length ≤ 5', async () => {
    const spec = baseSpec();
    for (let i = 0; i < 5; i++) {
      spec.components.schemas[`L${i}`] = {
        type: 'object',
        properties: { next: refTo(`#/components/schemas/L${i + 1}`) },
      };
    }
    spec.components.schemas.L5 = { type: 'string' };
    spec.paths['/x'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': { schema: refTo('#/components/schemas/L0') },
            },
          },
        },
      },
    };
    const findings = await runRefGraphAnalysis(spec);
    expect(findings.find((f) => f.detectorId === 'refgraph:deep-chain')).toBeUndefined();
  });
});

// =============================================================================
// 4. Component-reuse histogram
// =============================================================================

describe('runRefGraphAnalysis — reuse histogram', () => {
  it('flags when >50% of used schemas are referenced exactly once', async () => {
    const spec = baseSpec();
    // 12 schemas, all single-use except 1 which is referenced 3×.
    for (let i = 0; i < 12; i++) {
      spec.components.schemas[`S${i}`] = { type: 'object' };
    }
    // One usage per S0..S10 from operations.
    const paths = spec.paths as Record<string, unknown>;
    for (let i = 0; i < 11; i++) {
      paths[`/p${i}`] = {
        get: {
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: refTo(`#/components/schemas/S${i}`),
                },
              },
            },
          },
        },
      };
    }
    // S11 referenced 3× from different operations.
    for (let i = 0; i < 3; i++) {
      paths[`/hot${i}`] = {
        get: {
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: refTo('#/components/schemas/S11'),
                },
              },
            },
          },
        },
      };
    }
    const findings = await runRefGraphAnalysis(spec);
    const histo = findings.find((f) => f.detectorId === 'refgraph:reuse-histogram');
    expect(histo).toBeDefined();
    const meta = histo!.meta as {
      totalUsed: number;
      singleUse: number;
      singleUseRatio: number;
      max: number;
      hotspots: Array<{ name: string; count: number }>;
    };
    expect(meta.totalUsed).toBe(12);
    expect(meta.singleUse).toBe(11);
    expect(meta.singleUseRatio).toBeGreaterThan(0.5);
    expect(meta.max).toBe(3);
    expect(meta.hotspots[0].name).toBe('S11');
  });

  it('does NOT fire when reuse is well-distributed', async () => {
    const spec = baseSpec();
    // 10 schemas, all referenced 3× → median 3, single-use ratio 0.
    for (let i = 0; i < 10; i++) {
      spec.components.schemas[`S${i}`] = { type: 'object' };
    }
    const paths = spec.paths as Record<string, unknown>;
    let opIdx = 0;
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 3; j++) {
        paths[`/op${opIdx++}`] = {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: refTo(`#/components/schemas/S${i}`),
                  },
                },
              },
            },
          },
        };
      }
    }
    const findings = await runRefGraphAnalysis(spec);
    expect(findings.find((f) => f.detectorId === 'refgraph:reuse-histogram')).toBeUndefined();
  });
});

// =============================================================================
// 5. FindingSchema validation — every emitted finding must round-trip through
//    output-mapper without being dropped.
// =============================================================================

describe('runRefGraphAnalysis — output-mapper integration', () => {
  it('all emitted findings validate against FindingSchema', async () => {
    const spec = baseSpec();
    // Plant something in every category so we exercise all four findings.
    const c = spec.components;
    // cycle
    c.schemas.Tree = {
      type: 'object',
      properties: { children: { type: 'array', items: refTo('#/components/schemas/Tree') } },
    };
    // orphans of multiple classes
    c.headers.OrphanH = { schema: { type: 'string' } };
    c.parameters.OrphanP = { name: 'q', in: 'query', schema: { type: 'string' } };
    // deep chain L0 → L1 → ... → L7
    for (let i = 0; i < 7; i++) {
      c.schemas[`L${i}`] = {
        type: 'object',
        properties: { next: refTo(`#/components/schemas/L${i + 1}`) },
      };
    }
    c.schemas.L7 = { type: 'string' };
    // single-use schemas to trip histogram
    for (let i = 0; i < 12; i++) {
      c.schemas[`U${i}`] = { type: 'object' };
    }
    const paths = spec.paths as Record<string, unknown>;
    paths['/tree'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: refTo('#/components/schemas/Tree') } },
          },
        },
      },
    };
    paths['/l0'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: refTo('#/components/schemas/L0') } },
          },
        },
      },
    };
    for (let i = 0; i < 12; i++) {
      paths[`/u${i}`] = {
        get: {
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: refTo(`#/components/schemas/U${i}`) } },
            },
          },
        },
      };
    }

    const detectorFindings = await runRefGraphAnalysis(spec);
    expect(detectorFindings.length).toBeGreaterThan(0);

    // Capture warnings — we want zero output-mapper drops.
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      const llmFindings = mapDetectorFindings(detectorFindings);
      expect(llmFindings.length).toBe(detectorFindings.length);
      expect(warnings.filter((w) => w.includes('output-mapper'))).toHaveLength(0);
    } finally {
      console.warn = originalWarn;
    }
  });
});

// =============================================================================
// 6. buildRefGraph — surface-level invariant checks
// =============================================================================

describe('buildRefGraph', () => {
  it('counts in-degree separately from external in-degree', () => {
    const spec = baseSpec();
    spec.components.schemas.Inner = { type: 'string' };
    spec.components.schemas.Outer = {
      type: 'object',
      properties: { a: refTo('#/components/schemas/Inner') },
    };
    spec.paths['/x'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': { schema: refTo('#/components/schemas/Outer') },
            },
          },
        },
      },
    };
    const graph = buildRefGraph(spec);
    const inner = graph.nodes.get('#/components/schemas/Inner');
    expect(inner).toBeDefined();
    expect(inner!.inDegree).toBe(1); // referenced from Outer
    expect(inner!.externalInDegree).toBe(0); // never used outside components.*
    const outer = graph.nodes.get('#/components/schemas/Outer');
    expect(outer!.externalInDegree).toBe(1);
  });

  it('records dangling references separately', () => {
    const spec = baseSpec();
    spec.paths['/x'] = {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: refTo('#/components/schemas/DoesNotExist'),
              },
            },
          },
        },
      },
    };
    const graph = buildRefGraph(spec);
    expect(graph.dangling.has('#/components/schemas/DoesNotExist')).toBe(true);
  });
});
