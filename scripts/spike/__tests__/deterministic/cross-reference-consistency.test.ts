/**
 * Tests for the cross-reference-consistency walker.
 *
 * Covers:
 *   1. type-conflict   — `user_id` integer in schema A, string in schema B
 *   2. format-conflict — `created_at` date-time in schema A, unix-time in schema B
 *   3. pattern-conflict — `email` with different regex patterns across schemas
 *   4. length-constraint-conflict — `currency` maxLength=3 in schema A, maxLength=5 in schema B
 *   5. no-finding when only one schema declares the field (singleton)
 *   6. no-finding when all signatures match across schemas
 *   7. output validates against FindingSchema (via output-mapper)
 */

import { describe, it, expect } from 'vitest';
import { walkCrossReferenceConsistency } from '../../deterministic/cross-reference-consistency.js';
import { mapDetectorFinding } from '../../deterministic/output-mapper.js';

// =============================================================================
// Spec builders
// =============================================================================

function specWith(schemas: Record<string, Record<string, unknown>>): object {
  return {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    paths: {},
    components: { schemas },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('walkCrossReferenceConsistency', () => {
  it('flags type-conflict: user_id integer in A, string in B', async () => {
    const spec = specWith({
      User: {
        type: 'object',
        properties: {
          user_id: { type: 'integer' },
          name: { type: 'string' },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          body: { type: 'string' },
        },
      },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    const userIdFinding = findings.find((f) => f.meta?.fieldName === 'user_id');
    expect(userIdFinding).toBeDefined();
    expect(userIdFinding!.meta!.primary).toBe('type');
    expect(userIdFinding!.severity).toBe('high'); // type-conflict = high
    expect(userIdFinding!.title).toContain('user_id');
    expect(userIdFinding!.narration).toContain('type=integer');
    expect(userIdFinding!.narration).toContain('type=string');
  });

  it('flags format-conflict: created_at date-time in A, unix-time in B', async () => {
    const spec = specWith({
      Article: {
        type: 'object',
        properties: {
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Event: {
        type: 'object',
        properties: {
          created_at: { type: 'integer', format: 'unix-time' },
        },
      },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    const f = findings.find((x) => x.meta?.fieldName === 'created_at');
    expect(f).toBeDefined();
    // primary divergence: type+format both differ → mixed
    expect(['format', 'type', 'mixed']).toContain(f!.meta!.primary);
    expect(f!.narration).toContain('date-time');
    expect(f!.narration).toContain('unix-time');
  });

  it('flags format-conflict only (same type, different format)', async () => {
    const spec = specWith({
      AuditLog: {
        type: 'object',
        properties: {
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      LegacyRecord: {
        type: 'object',
        properties: {
          created_at: { type: 'string', format: 'date' },
        },
      },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    const f = findings.find((x) => x.meta?.fieldName === 'created_at');
    expect(f).toBeDefined();
    expect(f!.meta!.primary).toBe('format');
    expect(f!.severity).toBe('medium');
  });

  it('flags pattern-conflict: email pattern varies across schemas', async () => {
    const spec = specWith({
      User: {
        type: 'object',
        properties: {
          email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
        },
      },
      ContactRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', pattern: '^.+@.+$' },
        },
      },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    const f = findings.find((x) => x.meta?.fieldName === 'email');
    expect(f).toBeDefined();
    expect(f!.meta!.primary).toBe('pattern');
  });

  it('flags length-constraint-conflict: currency maxLength varies', async () => {
    const spec = specWith({
      Price: {
        type: 'object',
        properties: {
          currency: { type: 'string', minLength: 3, maxLength: 3 },
        },
      },
      LegacyOrder: {
        type: 'object',
        properties: {
          currency: { type: 'string', minLength: 3, maxLength: 5 },
        },
      },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    const f = findings.find((x) => x.meta?.fieldName === 'currency');
    expect(f).toBeDefined();
    expect(f!.meta!.primary).toBe('length');
  });

  it('does not flag a singleton (only one schema declares the field)', async () => {
    const spec = specWith({
      User: {
        type: 'object',
        properties: {
          internal_only_field: { type: 'string' },
        },
      },
      Other: {
        type: 'object',
        properties: {
          totally_different: { type: 'integer' },
        },
      },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    expect(findings.find((f) => f.meta?.fieldName === 'internal_only_field')).toBeUndefined();
    expect(findings.find((f) => f.meta?.fieldName === 'totally_different')).toBeUndefined();
  });

  it('does not flag when all schemas use the same signature', async () => {
    const spec = specWith({
      User: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      Contact: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      Subscriber: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    expect(findings.find((f) => f.meta?.fieldName === 'email')).toBeUndefined();
  });

  it('does not flag pure nullable-only divergence', async () => {
    const spec = specWith({
      A: {
        type: 'object',
        properties: { id: { type: 'string', nullable: true } },
      },
      B: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    expect(findings.find((f) => f.meta?.fieldName === 'id')).toBeUndefined();
  });

  it('emits findings that validate against FindingSchema (via output-mapper)', async () => {
    const spec = specWith({
      User: {
        type: 'object',
        properties: { user_id: { type: 'integer' } },
      },
      Comment: {
        type: 'object',
        properties: { user_id: { type: 'string' } },
      },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      // mapDetectorFinding will throw if the canonical Finding shape is invalid.
      expect(() => mapDetectorFinding(f)).not.toThrow();
    }
  });

  it('caps the number of findings emitted to MAX_FINDINGS', async () => {
    // Build 30 distinct conflicts; expect ≤ 20 findings.
    const schemas: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 30; i++) {
      schemas[`A${i}`] = {
        type: 'object',
        properties: { [`field_${i}`]: { type: 'integer' } },
      };
      schemas[`B${i}`] = {
        type: 'object',
        properties: { [`field_${i}`]: { type: 'string' } },
      };
    }
    const spec = specWith(schemas);
    const findings = await walkCrossReferenceConsistency(spec);
    expect(findings.length).toBeLessThanOrEqual(20);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('sorts findings by impact (host-count × variant-count)', async () => {
    const spec = specWith({
      // big_conflict: appears in 4 schemas with 2 variants → impact 8
      A1: { type: 'object', properties: { big_conflict: { type: 'integer' } } },
      A2: { type: 'object', properties: { big_conflict: { type: 'integer' } } },
      A3: { type: 'object', properties: { big_conflict: { type: 'string' } } },
      A4: { type: 'object', properties: { big_conflict: { type: 'string' } } },
      // small_conflict: appears in 2 schemas with 2 variants → impact 4
      B1: { type: 'object', properties: { small_conflict: { type: 'integer' } } },
      B2: { type: 'object', properties: { small_conflict: { type: 'string' } } },
    });

    const findings = await walkCrossReferenceConsistency(spec);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0]!.meta!.fieldName).toBe('big_conflict');
  });
});
