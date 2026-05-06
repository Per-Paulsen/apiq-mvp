/**
 * Codegen-aggregation tests — Welle Q / Q1.
 *
 * Verifies that `mapDetectorFindings` collapses per-occurrence `codegen:*`
 * DetectorFinding records to one row per distinct `detectorId`, while
 * leaving non-codegen findings (Spectral / walker / module-class) untouched.
 * Aggregation is gated by `DetectorOptions.aggregateCodegen` (default true);
 * the disabled path lets raw findings flow through for debugging / tests.
 */

import { describe, it, expect } from 'vitest';

import { mapDetectorFindings, aggregateCodegenFindings } from '../../deterministic/output-mapper.js';
import type { DetectorFinding } from '../../deterministic/types.js';

function makeCodegenFinding(
  kind: 'validation-problem' | 'resolver-warning',
  i: number,
  overrides: Partial<DetectorFinding> = {}
): DetectorFinding {
  return {
    detectorId: `codegen:openapi-typescript:${kind}`,
    layer: 'walker-statistical',
    title:
      kind === 'validation-problem'
        ? 'openapi-typescript validation problem'
        : 'openapi-typescript resolver warning',
    narration:
      'openapi-typescript reported a validation problem during codegen. Consumers will hit the same issue when generating their TypeScript clients from this spec.',
    rationale:
      'Non-fatal codegen warnings indicate the generator either silently substituted weaker types or skipped a schema. The resulting SDK compiles but produces incorrect types for callers.',
    category: 'correctness',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: [{ path: `/resource-${i}`, method: 'get' }],
    patchOps: [],
    patchSummary: `Resolve the codegen warning at /paths/~1resource-${i}/get.`,
    sourcePath: `/paths/~1resource-${i}/get`,
    meta: { tool: 'openapi-typescript', kind, rawMessage: `mock raw message #${i}` },
    ...overrides,
  };
}

function makeSpectralFinding(i: number): DetectorFinding {
  return {
    detectorId: 'spectral:oas3-schema',
    layer: 'spectral-oas3-default',
    title: `Spectral oas3-schema violation #${i}`,
    narration:
      'Spectral oas3-schema rule reported a violation in the spec. The schema does not conform to the OpenAPI 3.x meta-schema at the indicated path.',
    rationale:
      'Spec-level conformance violations propagate to every consumer of the spec — codegen, validators, doc-generators all interpret invalid OAS3 differently.',
    category: 'correctness',
    severity: 'high',
    scope: 'spec',
    affectedEndpoints: [{ path: `/spectral-${i}`, method: 'post' }],
    patchOps: [],
    patchSummary: `Fix the oas3-schema violation at /spectral-${i}.`,
    sourcePath: `/paths/~1spectral-${i}/post`,
  };
}

describe('codegen-aggregation (Q1)', () => {
  it('collapses 100 validation-problem + 50 resolver-warning + 5 spectral findings down to 7', () => {
    const findings: DetectorFinding[] = [];
    for (let i = 0; i < 100; i++) findings.push(makeCodegenFinding('validation-problem', i));
    for (let i = 0; i < 50; i++) findings.push(makeCodegenFinding('resolver-warning', i));
    for (let i = 0; i < 5; i++) findings.push(makeSpectralFinding(i));

    const aggregated = aggregateCodegenFindings(findings);
    expect(aggregated.length).toBe(2 + 5);

    const validationGroup = aggregated.find(
      (f) => f.detectorId === 'codegen:openapi-typescript:validation-problem'
    );
    const resolverGroup = aggregated.find(
      (f) => f.detectorId === 'codegen:openapi-typescript:resolver-warning'
    );
    expect(validationGroup).toBeDefined();
    expect(resolverGroup).toBeDefined();

    expect(validationGroup!.meta?.aggregateOccurrences).toBe(100);
    expect(resolverGroup!.meta?.aggregateOccurrences).toBe(50);

    expect(validationGroup!.title).toContain('(aggregated, 100 occurrences)');
    expect(resolverGroup!.title).toContain('(aggregated, 50 occurrences)');

    // Aggregate sourcePaths — capped at 10
    expect(Array.isArray(validationGroup!.meta?.aggregateSourcePaths)).toBe(true);
    expect((validationGroup!.meta?.aggregateSourcePaths as string[]).length).toBe(10);

    // Narration prefix carries the occurrence + sourcePath summary
    expect(validationGroup!.narration).toContain('Aggregated from 100 raw codegen findings');
    expect(validationGroup!.narration).toContain('Top sample paths:');

    // Spectral findings pass through untouched (still 5, distinct titles)
    const spectral = aggregated.filter((f) => f.detectorId === 'spectral:oas3-schema');
    expect(spectral.length).toBe(5);
    for (const s of spectral) {
      expect(s.title).not.toContain('aggregated');
    }
  });

  it('mapDetectorFindings with aggregateCodegen: true (default) emits 7 canonical Findings', () => {
    const findings: DetectorFinding[] = [];
    for (let i = 0; i < 100; i++) findings.push(makeCodegenFinding('validation-problem', i));
    for (let i = 0; i < 50; i++) findings.push(makeCodegenFinding('resolver-warning', i));
    for (let i = 0; i < 5; i++) findings.push(makeSpectralFinding(i));

    const mapped = mapDetectorFindings(findings, { aggregateCodegen: true });
    expect(mapped.length).toBe(7);
  });

  it('mapDetectorFindings without opts defaults to aggregateCodegen: true', () => {
    const findings: DetectorFinding[] = [];
    for (let i = 0; i < 100; i++) findings.push(makeCodegenFinding('validation-problem', i));
    for (let i = 0; i < 50; i++) findings.push(makeCodegenFinding('resolver-warning', i));
    for (let i = 0; i < 5; i++) findings.push(makeSpectralFinding(i));

    const mapped = mapDetectorFindings(findings);
    expect(mapped.length).toBe(7);
  });

  it('mapDetectorFindings with aggregateCodegen: false passes raw 155 findings through', () => {
    const findings: DetectorFinding[] = [];
    for (let i = 0; i < 100; i++) findings.push(makeCodegenFinding('validation-problem', i));
    for (let i = 0; i < 50; i++) findings.push(makeCodegenFinding('resolver-warning', i));
    for (let i = 0; i < 5; i++) findings.push(makeSpectralFinding(i));

    const mapped = mapDetectorFindings(findings, { aggregateCodegen: false });
    expect(mapped.length).toBe(155);
  });

  it('single-finding codegen groups are NOT decorated with "(aggregated, 1 occurrences)"', () => {
    const findings = [
      makeCodegenFinding('validation-problem', 0),
      makeSpectralFinding(0),
    ];
    const aggregated = aggregateCodegenFindings(findings);
    expect(aggregated.length).toBe(2);
    const codegen = aggregated.find((f) => f.detectorId.startsWith('codegen:'));
    expect(codegen!.title).not.toContain('aggregated');
    expect(codegen!.meta?.aggregateOccurrences).toBeUndefined();
  });

  it('aggregated severity is the max severity within the group', () => {
    const findings: DetectorFinding[] = [
      makeCodegenFinding('validation-problem', 0, { severity: 'low' }),
      makeCodegenFinding('validation-problem', 1, { severity: 'high' }),
      makeCodegenFinding('validation-problem', 2, { severity: 'medium' }),
    ];
    const aggregated = aggregateCodegenFindings(findings);
    expect(aggregated.length).toBe(1);
    expect(aggregated[0].severity).toBe('high');
  });

  it('aggregated affectedEndpoints are deduped by composite path+method key', () => {
    const findings: DetectorFinding[] = [
      makeCodegenFinding('validation-problem', 0, {
        affectedEndpoints: [
          { path: '/a', method: 'get' },
          { path: '/b', method: 'post' },
        ],
      }),
      makeCodegenFinding('validation-problem', 1, {
        affectedEndpoints: [
          { path: '/a', method: 'get' }, // dup
          { path: '/c', method: 'put' },
        ],
      }),
    ];
    const aggregated = aggregateCodegenFindings(findings);
    expect(aggregated.length).toBe(1);
    expect(aggregated[0].affectedEndpoints.length).toBe(3);
    const keys = new Set(aggregated[0].affectedEndpoints.map((e) => `${e.path}${e.method}`));
    expect(keys.has('/aget')).toBe(true);
    expect(keys.has('/bpost')).toBe(true);
    expect(keys.has('/cput')).toBe(true);
  });

  it('aggregated meta.aggregateSourcePaths preserves first-seen insertion order, capped at 10', () => {
    const findings: DetectorFinding[] = [];
    for (let i = 0; i < 15; i++) {
      findings.push(makeCodegenFinding('validation-problem', i));
    }
    const aggregated = aggregateCodegenFindings(findings);
    expect(aggregated.length).toBe(1);
    const paths = aggregated[0].meta?.aggregateSourcePaths as string[];
    expect(paths.length).toBe(10);
    // First-seen order: /paths/~1resource-0/get .. /paths/~1resource-9/get
    expect(paths[0]).toBe('/paths/~1resource-0/get');
    expect(paths[9]).toBe('/paths/~1resource-9/get');
  });
});
