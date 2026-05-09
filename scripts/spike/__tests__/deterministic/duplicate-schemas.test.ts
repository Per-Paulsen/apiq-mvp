/**
 * Tests for duplicate-schemas detector (M7 + O2).
 *
 * Validates:
 *   - Canonical-form transformation (sorted keys, sorted required arrays,
 *     stripped descriptions/examples/titles, normalised $refs, depth recursion).
 *   - Hash-based duplicate detection: exact duplicates flagged, same-shape-but-
 *     different-description still considered duplicate, structurally-different
 *     schemas not flagged.
 *   - Case-insensitive naming-collision detection (O2): `User` vs `user` flagged.
 *   - Output validates against canonical FindingSchema via the output-mapper.
 *   - Detector runs cleanly on all 4 reference specs (stripe-full, github-rest,
 *     pagerduty-full, dnd5eapi).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalizeSchema,
  hashSchema,
  runDuplicateSchemaDetectors,
} from '../../deterministic/modules/duplicate-schemas.js';
import { mapDetectorFindings } from '../../deterministic/infra/output-mapper.js';
import { FindingSchema } from '../../schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

// =============================================================================
// canonicalizeSchema
// =============================================================================

describe('canonicalizeSchema', () => {
  it('sorts property keys alphabetically', () => {
    const a = {
      type: 'object',
      properties: { zebra: { type: 'string' }, apple: { type: 'integer' } },
    };
    const b = {
      type: 'object',
      properties: { apple: { type: 'integer' }, zebra: { type: 'string' } },
    };
    expect(JSON.stringify(canonicalizeSchema(a))).toBe(
      JSON.stringify(canonicalizeSchema(b))
    );
  });

  it('sorts the required array', () => {
    const a = { type: 'object', required: ['c', 'a', 'b'] };
    const b = { type: 'object', required: ['a', 'b', 'c'] };
    expect(JSON.stringify(canonicalizeSchema(a))).toBe(
      JSON.stringify(canonicalizeSchema(b))
    );
  });

  it('strips descriptions, titles, examples, defaults', () => {
    const a = {
      type: 'string',
      description: 'A user identifier.',
      title: 'User ID',
      example: 'usr_123',
      default: 'usr_default',
    };
    const b = { type: 'string' };
    expect(JSON.stringify(canonicalizeSchema(a))).toBe(
      JSON.stringify(canonicalizeSchema(b))
    );
  });

  it('strips deeply-nested descriptions in properties', () => {
    const a = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'lorem ipsum' },
      },
    };
    const b = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    expect(JSON.stringify(canonicalizeSchema(a))).toBe(
      JSON.stringify(canonicalizeSchema(b))
    );
  });

  it('preserves identity-affecting constraints (minLength, pattern, format)', () => {
    const a = { type: 'string', minLength: 3, pattern: '^[a-z]+$', format: 'uuid' };
    const b = { type: 'string', minLength: 3, pattern: '^[a-z]+$', format: 'uuid' };
    const c = { type: 'string', minLength: 4, pattern: '^[a-z]+$', format: 'uuid' };
    expect(hashSchema(a)).toBe(hashSchema(b));
    expect(hashSchema(a)).not.toBe(hashSchema(c));
  });

  it('preserves enum, allOf, oneOf, anyOf order (semantics-relevant)', () => {
    // For combinators, order CAN matter (anyOf/oneOf evaluation, items).
    const a = { oneOf: [{ type: 'string' }, { type: 'integer' }] };
    const b = { oneOf: [{ type: 'integer' }, { type: 'string' }] };
    expect(hashSchema(a)).not.toBe(hashSchema(b));
  });

  it('strips vendor extensions (x-* keys) since they aren\'t identity', () => {
    const a = { type: 'string', 'x-stripe-deprecated': true };
    const b = { type: 'string' };
    expect(hashSchema(a)).toBe(hashSchema(b));
  });

  it('handles cycles via sentinel, does not throw', () => {
    const a: Record<string, unknown> = { type: 'object', properties: {} };
    (a.properties as Record<string, unknown>).self = a; // cycle
    expect(() => hashSchema(a)).not.toThrow();
  });

  it('treats schemas with only metadata-differences as identical', () => {
    const a = {
      type: 'object',
      title: 'Customer',
      description: 'A paying customer',
      properties: {
        id: { type: 'string', description: 'Customer ID' },
        email: { type: 'string', format: 'email' },
      },
      required: ['id', 'email'],
    };
    const b = {
      type: 'object',
      title: 'Buyer',
      description: 'Someone who buys things',
      properties: {
        email: { type: 'string', format: 'email' },
        id: { type: 'string', description: 'unique key' },
      },
      required: ['email', 'id'],
    };
    expect(hashSchema(a)).toBe(hashSchema(b));
  });

  it('normalises $ref strings (whitespace-trim)', () => {
    const a = { $ref: '#/components/schemas/User' };
    const b = { $ref: '  #/components/schemas/User  ' };
    expect(hashSchema(a)).toBe(hashSchema(b));
  });
});

// =============================================================================
// runDuplicateSchemaDetectors
// =============================================================================

describe('runDuplicateSchemaDetectors — M7 (exact duplicates)', () => {
  it('flags two structurally-identical schemas with different names', async () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Customer: {
            type: 'object',
            description: 'A customer.',
            properties: {
              id: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['id', 'email'],
          },
          Buyer: {
            type: 'object',
            description: 'A buyer (rename of Customer).',
            properties: {
              email: { type: 'string', format: 'email' },
              id: { type: 'string' },
            },
            required: ['email', 'id'],
          },
        },
      },
    };
    const findings = await runDuplicateSchemaDetectors(spec);
    const m7 = findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:m7:'));
    expect(m7).toHaveLength(1);
    expect(m7[0].meta?.duplicateNames).toEqual(['Buyer', 'Customer']);
    expect(m7[0].meta?.groupCount).toBe(2);
  });

  it('flags 3 duplicates as a single group of 3', async () => {
    const baseSchema = {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    };
    const spec = {
      components: {
        schemas: {
          A: { ...baseSchema, description: 'A' },
          B: { ...baseSchema, description: 'B' },
          C: { ...baseSchema, description: 'C' },
        },
      },
    };
    const findings = await runDuplicateSchemaDetectors(spec);
    const m7 = findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:m7:'));
    expect(m7).toHaveLength(1);
    expect(m7[0].meta?.duplicateNames).toEqual(['A', 'B', 'C']);
    expect(m7[0].meta?.groupCount).toBe(3);
  });

  it('does NOT flag schemas that differ in required-fields', async () => {
    const spec = {
      components: {
        schemas: {
          UserStrict: {
            type: 'object',
            properties: { id: { type: 'string' }, email: { type: 'string' } },
            required: ['id', 'email'],
          },
          UserLoose: {
            type: 'object',
            properties: { id: { type: 'string' }, email: { type: 'string' } },
            required: ['id'],
          },
        },
      },
    };
    const findings = await runDuplicateSchemaDetectors(spec);
    expect(
      findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:m7:'))
    ).toHaveLength(0);
  });

  it('does NOT flag pure $ref-alias schemas', async () => {
    const spec = {
      components: {
        schemas: {
          User: { type: 'object', properties: { id: { type: 'string' } } },
          UserAlias1: { $ref: '#/components/schemas/User' },
          UserAlias2: { $ref: '#/components/schemas/User' },
        },
      },
    };
    const findings = await runDuplicateSchemaDetectors(spec);
    const m7 = findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:m7:'));
    expect(m7).toHaveLength(0);
  });

  it('treats near-duplicates that differ ONLY in description/example as duplicates', async () => {
    const spec = {
      components: {
        schemas: {
          Address: {
            type: 'object',
            description: 'A postal address.',
            properties: {
              street: { type: 'string', example: '123 Main St' },
              city: { type: 'string' },
              zip: { type: 'string', pattern: '^\\d{5}$' },
            },
          },
          Location: {
            type: 'object',
            description: 'Where someone is.',
            title: 'Location',
            properties: {
              street: { type: 'string', example: 'Hauptstr 1' },
              city: { type: 'string' },
              zip: { type: 'string', pattern: '^\\d{5}$' },
            },
          },
        },
      },
    };
    const findings = await runDuplicateSchemaDetectors(spec);
    const m7 = findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:m7:'));
    expect(m7).toHaveLength(1);
    expect(m7[0].meta?.duplicateNames).toEqual(['Address', 'Location']);
  });
});

describe('runDuplicateSchemaDetectors — O2 (case-insensitive collisions)', () => {
  it('flags `User` vs `user` as a collision', async () => {
    const spec = {
      components: {
        schemas: {
          User: { type: 'object', properties: { id: { type: 'string' } } },
          user: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    };
    const findings = await runDuplicateSchemaDetectors(spec);
    const o2 = findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:o2:'));
    expect(o2).toHaveLength(1);
    expect(o2[0].meta?.collidingNames).toEqual(['User', 'user']);
    expect(o2[0].meta?.caseInsensitiveKey).toBe('user');
  });

  it('flags 3-way case collision (`API`, `Api`, `api`)', async () => {
    const spec = {
      components: {
        schemas: {
          API: { type: 'object' },
          Api: { type: 'object' },
          api: { type: 'object' },
        },
      },
    };
    const findings = await runDuplicateSchemaDetectors(spec);
    const o2 = findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:o2:'));
    expect(o2).toHaveLength(1);
    expect(o2[0].meta?.collidingNames).toEqual(['API', 'Api', 'api']);
  });

  it('does NOT flag non-colliding names', async () => {
    const spec = {
      components: {
        schemas: {
          User: { type: 'object' },
          Order: { type: 'object' },
          Product: { type: 'object' },
        },
      },
    };
    const findings = await runDuplicateSchemaDetectors(spec);
    const o2 = findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:o2:'));
    expect(o2).toHaveLength(0);
  });
});

describe('runDuplicateSchemaDetectors — empty / edge cases', () => {
  it('returns no findings for a spec with no components.schemas', async () => {
    const spec = { openapi: '3.0.0', paths: {} };
    expect(await runDuplicateSchemaDetectors(spec)).toEqual([]);
  });

  it('returns no findings for a spec with one component schema', async () => {
    const spec = {
      components: { schemas: { Foo: { type: 'object', properties: { x: { type: 'string' } } } } },
    };
    expect(await runDuplicateSchemaDetectors(spec)).toEqual([]);
  });
});

// =============================================================================
// FindingSchema validation
// =============================================================================

describe('output validates against FindingSchema', () => {
  it('produces canonical Finding-shape that round-trips through output-mapper', async () => {
    const spec = {
      components: {
        schemas: {
          User: { type: 'object', properties: { id: { type: 'string' } } },
          user: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    };
    const detectorFindings = await runDuplicateSchemaDetectors(spec);
    expect(detectorFindings.length).toBeGreaterThan(0);

    const llmFindings = mapDetectorFindings(detectorFindings);
    expect(llmFindings.length).toBe(detectorFindings.length);
    for (const f of llmFindings) {
      // Hard-validate with FindingSchema — output-mapper already did this, but
      // we re-run here so test failures localise to this assertion.
      expect(() => FindingSchema.parse(f)).not.toThrow();
    }
  });

  it('emits findings with non-empty title/narration/rationale within schema bounds', async () => {
    const spec = {
      components: {
        schemas: {
          Customer: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
          Buyer: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        },
      },
    };
    const detectorFindings = await runDuplicateSchemaDetectors(spec);
    expect(detectorFindings.length).toBe(1);
    const llm = mapDetectorFindings(detectorFindings);
    expect(llm.length).toBe(1);
    const f = llm[0];
    expect(f.title.length).toBeGreaterThan(0);
    expect(f.title.length).toBeLessThanOrEqual(200);
    expect(f.narration.length).toBeGreaterThanOrEqual(50);
    expect(f.narration.length).toBeLessThanOrEqual(2000);
    expect(f.rationale.length).toBeGreaterThanOrEqual(20);
    expect(f.rationale.length).toBeLessThanOrEqual(1000);
    expect(f.patchSummary.length).toBeGreaterThanOrEqual(1);
    expect(f.patchSummary.length).toBeLessThanOrEqual(200);
  });
});

// =============================================================================
// Sanity-check on real example specs
// =============================================================================

const REFERENCE_SPECS = ['stripe-full', 'pagerduty-full', 'dnd5eapi', 'github-rest'];

describe('runs cleanly on reference specs', () => {
  for (const specName of REFERENCE_SPECS) {
    it(`runs on ${specName} without throwing and produces schema-valid output`, async () => {
      const specPath = path.join(EXAMPLES_DIR, specName, 'spec.json');
      if (!fs.existsSync(specPath)) {
        // If the fixture isn't checked in for this spec, skip rather than fail.
        return;
      }
      const raw = fs.readFileSync(specPath, 'utf8');
      const spec = JSON.parse(raw) as object;

      const findings = await runDuplicateSchemaDetectors(spec, { specName });
      // Map through the output-mapper to validate against FindingSchema.
      const mapped = mapDetectorFindings(findings);
      expect(mapped.length).toBe(findings.length);
      for (const f of mapped) {
        expect(() => FindingSchema.parse(f)).not.toThrow();
      }
    }, 30_000);
  }
});
