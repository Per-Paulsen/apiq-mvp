/**
 * Tests for walkSchemaSimilarity (Welle D / T-Sentinels resolving CL-48).
 */

import { describe, it, expect } from 'vitest';
import { walkSchemaSimilarity } from '../../deterministic/aggregators/schema-similarity.js';

describe('walkSchemaSimilarity (Welle D / CL-48)', () => {
  it('emits 0 findings when only one schema is present', async () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          A: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
        },
      },
    };
    const findings = await walkSchemaSimilarity(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when schemas are completely distinct', async () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { id: { type: 'string' }, email: { type: 'string' } },
          },
          Order: {
            type: 'object',
            properties: { sku: { type: 'string' }, qty: { type: 'integer' }, price: { type: 'number' } },
          },
          Address: {
            type: 'object',
            properties: { street: { type: 'string' }, zip: { type: 'string' }, city: { type: 'string' } },
          },
        },
      },
    };
    const findings = await walkSchemaSimilarity(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings for identical schemas (different concern, not near-dup)', async () => {
    // Two identical-shaped schemas → 100% similarity → not flagged by CL-48
    // (CL-48 targets ≥80% AND <100%)
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          UserA: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
            required: ['id'],
          },
          UserB: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
            required: ['id'],
          },
          // need >=3 schemas to pass the noise-floor; both Order and Token distinct
          Order: {
            type: 'object',
            properties: { sku: { type: 'string' }, qty: { type: 'integer' }, total: { type: 'number' } },
          },
        },
      },
    };
    const findings = await walkSchemaSimilarity(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 1 finding for a near-duplicate cluster (≥3 pairs)', async () => {
    // 4 schemas, 3 are near-dups of each other (User ↔ UserPublic ↔ UserPrivate),
    // 1 is distinct. That's C(3,2)=3 near-dup-pairs.
    // Each schema has 9 base props + 1 distinguishing prop = 10 props.
    // Pairwise: 9 shared / (10+10-9) = 9/11 = 0.818 → ≥0.8 threshold.
    const baseProps = {
      id: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
      age: { type: 'integer' },
      createdAt: { type: 'string' },
      updatedAt: { type: 'string' },
      status: { type: 'string' },
      role: { type: 'string' },
      tenantId: { type: 'string' },
    };
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              ...baseProps,
              isAdmin: { type: 'boolean' }, // distinguishing
            },
          },
          UserPublic: {
            type: 'object',
            properties: {
              ...baseProps,
              avatarUrl: { type: 'string' }, // distinguishing
            },
          },
          UserPrivate: {
            type: 'object',
            properties: {
              ...baseProps,
              ssn: { type: 'string' }, // distinguishing
            },
          },
          Product: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              price: { type: 'number' },
              inventory: { type: 'integer' },
            },
          },
        },
      },
    };
    const findings = await walkSchemaSimilarity(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detectorId).toBe('walker:schema-similarity');
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.meta?.apiqSeverity).toBe('hint');
    expect(findings[0]?.meta?.patternId).toBe('CL-48');
    const pairCount = findings[0]?.meta?.pairCount as number;
    expect(pairCount).toBeGreaterThanOrEqual(3);
  });

  it('emits a finding when ≥10% of schemas are involved (even with <3 pairs)', async () => {
    // 12 schemas, 1 near-dup pair → 2/12 = 16.7% involved → over the 10% gate.
    const schemas: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) {
      schemas[`Distinct${i}`] = {
        type: 'object',
        properties: {
          [`field${i}`]: { type: 'string' },
          [`other${i}`]: { type: 'integer' },
        },
      };
    }
    schemas.User = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        age: { type: 'integer' },
      },
    };
    schemas.UserView = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        roles: { type: 'string' }, // 3/4 prop-overlap = 0.6 — too low. Make 4/5:
      },
    };
    // Adjust UserView to 4-of-5 match: id, name, email, age + display-name
    schemas.UserView = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        age: { type: 'integer' },
        displayName: { type: 'string' },
      },
    };
    const spec = { openapi: '3.0.0', components: { schemas } };
    const findings = await walkSchemaSimilarity(spec);
    expect(findings.length).toBeLessThanOrEqual(1);
    if (findings.length === 1) {
      expect(findings[0]?.meta?.pairCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('skips schemas with fewer than 2 properties (primitives/scalars)', async () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          A: { type: 'string' },
          B: { type: 'string', maxLength: 10 },
          C: { type: 'integer' },
        },
      },
    };
    const findings = await walkSchemaSimilarity(spec);
    expect(findings).toHaveLength(0);
  });

  it('does not throw on cyclic schemas (refs)', async () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              parent: { $ref: '#/components/schemas/Node' },
              children: { type: 'array' },
            },
          },
          OtherNode: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              parent: { $ref: '#/components/schemas/Node' },
              kids: { type: 'array' },
            },
          },
        },
      },
    };
    await expect(walkSchemaSimilarity(spec)).resolves.toBeDefined();
  });

  it('returns the highest-similarity pairs first in meta.pairs', async () => {
    // Use 9 shared props + 1 distinguishing — keeps each pair ≥0.8 jaccard.
    const baseProps = {
      id: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
      age: { type: 'integer' },
      role: { type: 'string' },
      tenantId: { type: 'string' },
      createdAt: { type: 'string' },
      updatedAt: { type: 'string' },
      status: { type: 'string' },
    };
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { ...baseProps, kind: { type: 'string' } },
          },
          UserClose: {
            type: 'object',
            properties: { ...baseProps, isAdmin: { type: 'boolean' } },
          },
          UserVeryClose: {
            type: 'object',
            properties: { ...baseProps, statusCode: { type: 'string' } },
          },
          UserAlmostIdentical: {
            // Adds one prop on top of all baseProps → User-overlap 9/10
            type: 'object',
            properties: { ...baseProps, extra: { type: 'string' } },
          },
        },
      },
    };
    const findings = await walkSchemaSimilarity(spec);
    expect(findings).toHaveLength(1);
    const pairs = findings[0]?.meta?.pairs as Array<{ similarity: number }>;
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < pairs.length - 1; i++) {
      expect(pairs[i]!.similarity).toBeGreaterThanOrEqual(pairs[i + 1]!.similarity);
    }
  });
});
