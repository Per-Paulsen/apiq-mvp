/**
 * Tests for `scripts/spike/data/pattern-schema.ts` (Welle Arch+ A2a).
 *
 * Coverage:
 *   - Real patterns.json validates clean (all entries pass).
 *   - Invalid lens-value rejected.
 *   - Invalid severityHypothesis rejected.
 *   - Missing required field (patternId) rejected.
 *   - Unknown extra field tolerated (passthrough).
 *   - safeLoadPatterns surfaces all errors instead of throwing on first.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PatternSchema,
  loadPatterns,
  safeLoadPatterns,
  PatternLensSchema,
  PatternSeverityHypothesisSchema,
  PatternDetectionPrecisionSchema,
  PatternCodegenTargetSchema,
  SEVERITY_HYPOTHESIS_VALUES,
  CODEGEN_TARGET_VALUES,
  DETECTION_PRECISION_VALUES,
} from '../../data/pattern-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REAL_PATTERNS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'patterns.json',
);

// ---------------------------------------------------------------------------
// Test 1 — Real patterns.json round-trips cleanly
// ---------------------------------------------------------------------------

describe('pattern-schema — real patterns.json validation', () => {
  it('loads + validates every entry in patterns.json', () => {
    const patterns = loadPatterns({ jsonPath: REAL_PATTERNS_PATH });
    expect(patterns.length).toBeGreaterThanOrEqual(959);
    // sanity: every entry has the required core fields
    for (const p of patterns) {
      expect(typeof p.patternId).toBe('string');
      expect(p.patternId.length).toBeGreaterThan(0);
      expect(Array.isArray(p.lens)).toBe(true);
      expect(p.lens.length).toBeGreaterThan(0);
      expect(SEVERITY_HYPOTHESIS_VALUES).toContain(p.severityHypothesis);
    }
  });

  it('safeLoadPatterns reports success for the real file', () => {
    const result = safeLoadPatterns({ jsonPath: REAL_PATTERNS_PATH });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.patterns.length).toBeGreaterThanOrEqual(959);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Atomic enums round-trip
// ---------------------------------------------------------------------------

describe('pattern-schema — atomic enums', () => {
  it('parses all 4 severityHypothesis values', () => {
    for (const s of SEVERITY_HYPOTHESIS_VALUES) {
      expect(PatternSeverityHypothesisSchema.parse(s)).toBe(s);
    }
  });

  it('parses all 3 detectionPrecision values', () => {
    for (const d of DETECTION_PRECISION_VALUES) {
      expect(PatternDetectionPrecisionSchema.parse(d)).toBe(d);
    }
  });

  it('parses all 11 codegen-target values', () => {
    for (const t of CODEGEN_TARGET_VALUES) {
      expect(PatternCodegenTargetSchema.parse(t)).toBe(t);
    }
  });

  it('parses every 10-lens-framework value', () => {
    const lenses = [
      'threat-modeling',
      'standards-compliance',
      'evolution-friction',
      'client-friction',
      'style-coherence',
      'privacy-data-class',
      'operations',
      'internal-consistency',
      'ai-agent-consumability',
      'operational-metadata',
    ] as const;
    for (const l of lenses) {
      expect(PatternLensSchema.parse(l)).toBe(l);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Negative cases on PatternSchema
// ---------------------------------------------------------------------------

describe('pattern-schema — invalid input rejected', () => {
  const baseValid = {
    patternId: 'TEST-1',
    lens: ['threat-modeling' as const],
    source: { type: 'rfc', citation: 'RFC 9110' },
    severityHypothesis: 'warn' as const,
  };

  it('rejects an invalid lens value', () => {
    const result = PatternSchema.safeParse({
      ...baseValid,
      lens: ['fictional-lens'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid severityHypothesis value', () => {
    const result = PatternSchema.safeParse({
      ...baseValid,
      severityHypothesis: 'apocalyptic',
    });
    expect(result.success).toBe(false);
  });

  it('rejects entry missing required patternId', () => {
    const { patternId, ...withoutId } = baseValid;
    void patternId;
    const result = PatternSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });

  it('rejects entry with empty lens array', () => {
    const result = PatternSchema.safeParse({ ...baseValid, lens: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid codegenTargets value', () => {
    const result = PatternSchema.safeParse({
      ...baseValid,
      codegenTargets: ['cobol'],
    });
    expect(result.success).toBe(false);
  });

  it('passthrough accepts unknown extra top-level fields', () => {
    const result = PatternSchema.safeParse({
      ...baseValid,
      futureField: 'experimental',
      anotherUnknown: 42,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — loadPatterns error semantics
// ---------------------------------------------------------------------------

describe('pattern-schema — loader error handling', () => {
  it('throws with patternId-context when an entry is invalid', () => {
    const tmpDir = path.join(__dirname, '..', '..', 'data');
    // build an in-memory fixture by writing a tiny json next to patterns.json,
    // then validating via loadPatterns; we use a unique filename to avoid
    // colliding with the real file.
const tmpPath = path.join(tmpDir, '__pattern-schema-test-fixture.json');
    fs.writeFileSync(
      tmpPath,
      JSON.stringify([
        {
          patternId: 'OK-1',
          lens: ['threat-modeling'],
          source: { type: 'rfc' },
          severityHypothesis: 'warn',
        },
        {
          patternId: 'BAD-2',
          lens: ['fictional-lens'],
          source: { type: 'rfc' },
          severityHypothesis: 'warn',
        },
      ]),
    );
    try {
      expect(() => loadPatterns({ jsonPath: tmpPath })).toThrow(/BAD-2/);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('safeLoadPatterns aggregates errors instead of throwing', () => {
const tmpPath = path.join(
      __dirname,
      '..',
      '..',
      'data',
      '__pattern-schema-safe-fixture.json',
    );
    fs.writeFileSync(
      tmpPath,
      JSON.stringify([
        {
          patternId: 'BAD-1',
          lens: [],
          source: { type: 'rfc' },
          severityHypothesis: 'warn',
        },
        {
          patternId: 'BAD-2',
          lens: ['threat-modeling'],
          source: { type: 'rfc' },
          severityHypothesis: 'apocalyptic',
        },
      ]),
    );
    try {
      const result = safeLoadPatterns({ jsonPath: tmpPath });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBe(2);
        expect(result.errors.join('\n')).toMatch(/BAD-1/);
        expect(result.errors.join('\n')).toMatch(/BAD-2/);
      }
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});
