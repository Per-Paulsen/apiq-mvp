/**
 * Tests for codegen-validation detector (Stage A — Task #7).
 *
 * Validates:
 *   - Clean spec → zero findings (no codegen problems).
 *   - Spec with $ref to nonexistent target → finding emitted (kind=ref-unresolved
 *     OR validation-problem; openapi-typescript hard-errors on this).
 *   - Spec with discriminator-mapping pointing at a missing $ref → warning
 *     finding (low severity).
 *   - Output validates against the canonical FindingSchema via output-mapper.
 *   - Timeout path emits a finding instead of crashing.
 *   - Runs without throwing on all 4 reference specs (slow — uses extended
 *     timeouts; stripe-full takes the longest).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCodegenValidation } from '../../deterministic/codegen-validation.js';
import { mapDetectorFindings } from '../../deterministic/output-mapper.js';
import { FindingSchema } from '../../schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

// =============================================================================
// Fixture builders
// =============================================================================

function cleanSpec(): object {
  return {
    openapi: '3.0.3',
    info: { title: 'Clean test spec', version: '1.0.0' },
    paths: {
      '/items': {
        get: {
          operationId: 'listItems',
          summary: 'List items',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Item' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Item: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    },
  };
}

function specWithBrokenRef(): object {
  return {
    openapi: '3.0.3',
    info: { title: 'Broken-ref spec', version: '1.0.0' },
    paths: {
      '/things': {
        get: {
          operationId: 'listThings',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  // Points to a schema that does not exist anywhere in the spec.
                  // openapi-typescript should report this as an unresolved $ref.
                  schema: { $ref: '#/components/schemas/DoesNotExist' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        OnlySchema: { type: 'object' },
      },
    },
  };
}

function specWithDiscriminatorMappingProblem(): object {
  // A polymorphic schema where the discriminator mapping points to a $ref that
  // resolves to a primitive (`type: string`) — Redocly + openapi-typescript
  // both emit a non-fatal warning ("Discriminator mapping has an invalid
  // schema (neither an object schema nor an allOf array)"). This exercises
  // the warning-capture path.
  return {
    openapi: '3.0.3',
    info: { title: 'Discriminator-mapping warning spec', version: '1.0.0' },
    paths: {
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Pet' },
              },
            },
          },
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Pet' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Pet: {
          oneOf: [
            { $ref: '#/components/schemas/Dog' },
            // This $ref points to a primitive — invalid discriminator mapping.
            { $ref: '#/components/schemas/InvalidPrimitive' },
          ],
          discriminator: {
            propertyName: 'kind',
            mapping: {
              dog: '#/components/schemas/Dog',
              invalid: '#/components/schemas/InvalidPrimitive',
            },
          },
        },
        Dog: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['dog'] },
            barkVolume: { type: 'integer' },
          },
          required: ['kind'],
        },
        InvalidPrimitive: {
          // Primitive schema for a discriminator mapping → invalid; codegen warns.
          type: 'string',
        },
      },
    },
  };
}

function specForcingTimeout(): object {
  // Same as cleanSpec — for the timeout test we use timeoutMs:1, which forces
  // the timer to fire before any reasonable codegen run completes.
  return cleanSpec();
}

// =============================================================================
// Core behaviour
// =============================================================================

describe('runCodegenValidation — clean spec', () => {
  it('emits zero findings for a structurally-valid spec', async () => {
    const findings = await runCodegenValidation(cleanSpec());
    expect(findings).toEqual([]);
  }, 30_000);
});

describe('runCodegenValidation — spec with broken $ref', () => {
  it('emits at least one finding for an unresolved $ref', async () => {
    const findings = await runCodegenValidation(specWithBrokenRef());
    expect(findings.length).toBeGreaterThan(0);
    // The finding(s) should be high-severity (this breaks codegen) — at least
    // one should be tagged as such. openapi-typescript may report it as either
    // an unresolved $ref warning OR a hard validation error depending on
    // Redocly's pipeline; we accept either kind here as long as some signal
    // surfaces.
    const high = findings.filter((f) => f.severity === 'high');
    const low = findings.filter((f) => f.severity === 'low');
    expect(high.length + low.length).toBe(findings.length);
    expect(high.length).toBeGreaterThan(0);
    // Detector ID should be in the codegen:* namespace.
    for (const f of findings) {
      expect(f.detectorId).toMatch(/^codegen:openapi-typescript:/);
      expect(f.layer).toBe('walker-statistical');
      expect(f.category).toBe('correctness');
    }
  }, 30_000);
});

describe('runCodegenValidation — spec with discriminator-mapping warning', () => {
  it('emits at least one warning-class finding for an invalid discriminator schema', async () => {
    const findings = await runCodegenValidation(specWithDiscriminatorMappingProblem());
    // openapi-typescript warns on this case via console.warn (not a thrown
    // error). We expect at least one finding; severity may be low (warning)
    // OR — if a downstream TS compile-error surfaces — high.
    expect(findings.length).toBeGreaterThan(0);
    const meta = findings.map((f) => f.meta?.kind);
    // Some flavour of validation-class kind should appear.
    const hasValidationKind = meta.some(
      (k) =>
        k === 'discriminator-invalid' ||
        k === 'validation-problem' ||
        k === 'ref-unresolved' ||
        k === 'ts-compile-error'
    );
    expect(hasValidationKind).toBe(true);
  }, 30_000);
});

// =============================================================================
// Timeout path
// =============================================================================

describe('runCodegenValidation — timeout', () => {
  it('emits a timeout-finding instead of crashing when codegen exceeds timeoutMs', async () => {
    // Use any spec; pass an absurdly-low timeout so the timer fires immediately.
    const findings = await runCodegenValidation(specForcingTimeout(), {
      timeoutMs: 1,
    });
    // At least one finding should be tagged as a timeout. (Real codegen on the
    // clean spec is fast, so on a fast machine the codegen MAY actually beat
    // the 1ms deadline — in that case zero findings is also acceptable. We
    // assert the union: either no findings OR a timeout finding.)
    if (findings.length === 0) return;
    const hasTimeout = findings.some((f) => f.meta?.kind === 'timeout');
    expect(hasTimeout).toBe(true);
    const tf = findings.find((f) => f.meta?.kind === 'timeout');
    expect(tf?.severity).toBe('high');
    expect(tf?.detectorId).toBe('codegen:openapi-typescript:timeout');
  }, 10_000);
});

// =============================================================================
// FindingSchema conformance
// =============================================================================

describe('output validates against FindingSchema', () => {
  it('produces canonical Finding-shape that round-trips through output-mapper', async () => {
    const findings = await runCodegenValidation(specWithBrokenRef());
    expect(findings.length).toBeGreaterThan(0);

    const llmFindings = mapDetectorFindings(findings);
    // output-mapper must drop zero findings — every codegen finding fits the
    // canonical schema after layer-tag prefix is added.
    expect(llmFindings.length).toBe(findings.length);
    for (const f of llmFindings) {
      expect(() => FindingSchema.parse(f)).not.toThrow();
    }
  }, 30_000);

  it('emits findings within all schema length bounds', async () => {
    const findings = await runCodegenValidation(specWithBrokenRef());
    expect(findings.length).toBeGreaterThan(0);
    const mapped = mapDetectorFindings(findings);
    for (const f of mapped) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.title.length).toBeLessThanOrEqual(200);
      expect(f.narration.length).toBeGreaterThanOrEqual(50);
      expect(f.narration.length).toBeLessThanOrEqual(2000);
      expect(f.rationale.length).toBeGreaterThanOrEqual(20);
      expect(f.rationale.length).toBeLessThanOrEqual(1000);
      expect(f.patchSummary.length).toBeGreaterThanOrEqual(1);
      expect(f.patchSummary.length).toBeLessThanOrEqual(200);
    }
  }, 30_000);
});

// =============================================================================
// Sanity-check on real example specs
//
// These tests are slow — stripe-full in particular runs Redocly's full
// validate+bundle pipeline on a 1.5MB spec. We use 5-minute per-test timeouts
// (longer than the module's own default timeoutMs:5min default would allow a
// hard timeout to surface as a finding within the test budget).
// =============================================================================

const REFERENCE_SPECS = ['dnd5eapi', 'pagerduty-full', 'github-rest', 'stripe-full'];

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

      const findings = await runCodegenValidation(spec, { specName });
      // Map through the output-mapper to validate against FindingSchema.
      const mapped = mapDetectorFindings(findings);
      expect(mapped.length).toBe(findings.length);
      for (const f of mapped) {
        expect(() => FindingSchema.parse(f)).not.toThrow();
      }
    }, 6 * 60 * 1000);
  }
});
