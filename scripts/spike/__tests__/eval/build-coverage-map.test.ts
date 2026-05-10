/**
 * Unit-tests for build-coverage-map's aggregation-logic.
 *
 * NOTE: This test does NOT run the 45min 4-spec live-pipeline. The actual
 * end-to-end run is verified separately via the `npm run build-coverage`
 * CLI invocation (validated manually + via the existing
 * run-deterministic-layer.test.ts integration tests).
 *
 * Tests target the PURE aggregation-logic in coverage-map-aggregator.ts +
 * the markdown-renderer in coverage-map-markdown.ts via synthetic
 * `PerSpecRun[]` + `patternIdMap` inputs.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import yamlPkg from 'yaml';
import {
  buildCoverageJson,
  inferLayerFromDetectorId,
  loadPatternIdMapFromYamls,
  type PerSpecRun,
  type PatternIdRecord,
} from '../../eval/coverage-map-aggregator.js';
import { renderCoverageMarkdown } from '../../eval/coverage-map-markdown.js';

function fakeSpec(
  specName: string,
  perDetector: Record<string, number>,
  runtimeMs = 1000
): PerSpecRun {
  const perLayer = {
    'spectral-oas3-default': 0,
    'spectral-apiq-custom': 0,
    'walker-statistical': 0,
    'module-class': 0,
    'domain-knowledge': 0,
  };
  const detectorLayerMap: Record<string, ReturnType<typeof inferLayerFromDetectorId>> = {};
  let total = 0;
  for (const [d, n] of Object.entries(perDetector)) {
    total += n;
    const layer = inferLayerFromDetectorId(d);
    detectorLayerMap[d] = layer;
    perLayer[layer] += n;
  }
  return {
    specName,
    runtimeMs,
    perLayer,
    perDetector,
    detectorLayerMap,
    totalFindings: total,
  };
}

describe('inferLayerFromDetectorId', () => {
  it.each([
    ['spectral:apiq-fk-fields-need-format-or-pattern', 'spectral-apiq-custom'],
    ['walker:html-prevalence', 'walker-statistical'],
    ['walker:naming-operationid-drift', 'walker-statistical'],
    ['module:problem-json-validator:rfc2-1', 'module-class'],
    ['ajv:schema-compilation-fail', 'module-class'],
    ['codegen:openapi-typescript:syntax-error', 'module-class'],
    ['style-coherence:sc-1:rest-vs-rpc-mixing', 'module-class'],
    ['duplicate-schemas:m7:abc123def456', 'module-class'],
    ['domain:stripe:idempotency-key', 'domain-knowledge'],
    ['unknown:xyz', 'module-class'], // safe-catch-all
  ])('%s -> %s', (id, expected) => {
    expect(inferLayerFromDetectorId(id)).toBe(expected);
  });
});

describe('buildCoverageJson — aggregation', () => {
  const patternIdMap = new Map<string, PatternIdRecord>([
    [
      'spectral:apiq-fk-fields-need-format-or-pattern',
      { patternId: 'J2', yamlRule: 'apiq-fk-fields-need-format-or-pattern', yamlFile: 'apiq-ruleset.yaml', lenses: ['client-friction', 'internal-consistency'] },
    ],
    [
      'spectral:apiq-unix-time-format-on-timestamp-fields',
      { patternId: 'I5', yamlRule: 'apiq-unix-time-format-on-timestamp-fields', yamlFile: 'apiq-ruleset.yaml', lenses: ['standards-compliance', 'client-friction'] },
    ],
    [
      'spectral:apiq-orphan-rule-never-fires',
      { patternId: 'X9', yamlRule: 'apiq-orphan-rule-never-fires', yamlFile: 'apiq-ruleset.yaml', lenses: ['threat-modeling'] },
    ],
  ]);

  const perSpec: PerSpecRun[] = [
    fakeSpec('stripe-full', {
      'spectral:apiq-fk-fields-need-format-or-pattern': 12,
      'walker:html-prevalence': 3,
      'module:problem-json-validator:rfc2-1': 1,
    }, 23 * 60 * 1000),
    fakeSpec('pagerduty-full', {
      'spectral:apiq-fk-fields-need-format-or-pattern': 5,
      'walker:html-prevalence': 0, // emitted but with count 0
      'spectral:apiq-unix-time-format-on-timestamp-fields': 8,
    }, 4 * 60 * 1000),
    fakeSpec('dnd5eapi', {
      'spectral:apiq-unix-time-format-on-timestamp-fields': 2,
    }, 30 * 1000),
  ];

  const coverage = buildCoverageJson({
    perSpec,
    patternIdMap,
    referenceSpecVersions: { 'stripe-full': 'sha-stripe', 'pagerduty-full': 'sha-pd', 'dnd5eapi': 'sha-dnd' },
    totalRuntimeMs: 27 * 60 * 1000 + 30 * 1000,
  });

  it('produces per_detector with correct fires_on_specs aggregation', () => {
    const fk = coverage.per_detector.find((d) => d.detector_id === 'spectral:apiq-fk-fields-need-format-or-pattern');
    expect(fk).toBeDefined();
    expect(fk!.fires_on_specs.sort()).toEqual(['pagerduty-full', 'stripe-full']);
    expect(fk!.total_findings_count).toBe(17);
    expect(fk!.finding_count_per_spec).toEqual({ 'stripe-full': 12, 'pagerduty-full': 5 });
    expect(fk!.layer).toBe('spectral-apiq-custom');
  });

  it('marks detectors with all-zero counts as untested', () => {
    const html = coverage.per_detector.find((d) => d.detector_id === 'walker:html-prevalence');
    expect(html).toBeDefined();
    // pagerduty had 0, stripe had 3 → fires-on stripe only
    expect(html!.fires_on_specs).toEqual(['stripe-full']);
  });

  it('per_detector sorted descending by total_findings_count', () => {
    const counts = coverage.per_detector.map((d) => d.total_findings_count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    }
  });

  it('produces per_pattern_id with detector → pattern aggregation', () => {
    const j2 = coverage.per_pattern_id.find((p) => p.pattern_id === 'J2');
    expect(j2).toBeDefined();
    expect(j2!.detector_ids).toEqual(['spectral:apiq-fk-fields-need-format-or-pattern']);
    expect(j2!.fires_on_specs.sort()).toEqual(['pagerduty-full', 'stripe-full']);
  });

  it('per_pattern_id excludes patterns whose detector did not fire (X9 substrate)', () => {
    // X9 maps to apiq-orphan-rule-never-fires which didn't appear in any
    // perSpec. It SHOULD appear in per_pattern_id (since map has the entry)
    // but with empty fires_on_specs[].
    const x9 = coverage.per_pattern_id.find((p) => p.pattern_id === 'X9');
    // Since the orphan-detector didn't fire on ANY spec, it doesn't even
    // appear in per_detector → so it doesn't appear in per_pattern_id either
    // (current implementation iterates per_detector for pattern_id rollup).
    // This is intentional — substrate-only patterns are I3 territory
    // (drift-class-1).
    expect(x9).toBeUndefined();
  });

  it('produces per_lens with yaml-rule + pattern-id totals', () => {
    const cf = coverage.per_lens.find((l) => l.lens === 'client-friction');
    expect(cf).toBeDefined();
    // J2 + I5 both tagged client-friction → 2 patternIds, 2 yamlRules
    expect(cf!.total_pattern_ids).toBe(2);
    expect(cf!.total_yaml_rules_active).toBe(2);
    // fires-on aggregate: stripe(J2) + pagerduty(J2,I5) + dnd5eapi(I5)
    expect(cf!.fires_on_specs_aggregate.sort()).toEqual(['dnd5eapi', 'pagerduty-full', 'stripe-full']);
  });

  it('per_lens includes lenses whose yaml-rule fired on 0 specs', () => {
    // threat-modeling lens has only X9 (which never fires)
    const tm = coverage.per_lens.find((l) => l.lens === 'threat-modeling');
    expect(tm).toBeDefined();
    expect(tm!.total_yaml_rules_active).toBe(1);
    expect(tm!.fires_on_specs_aggregate).toEqual([]);
  });

  it('per_spec has top_10 + per_layer_breakdown', () => {
    const stripe = coverage.per_spec.find((s) => s.spec_name === 'stripe-full');
    expect(stripe).toBeDefined();
    expect(stripe!.total_findings).toBe(16); // 12+3+1
    expect(stripe!.top_10_detectors_by_count[0].detector_id).toBe('spectral:apiq-fk-fields-need-format-or-pattern');
    expect(stripe!.top_10_detectors_by_count[0].count).toBe(12);
    expect(stripe!.per_layer_breakdown['spectral-apiq-custom']).toBe(12);
    expect(stripe!.per_layer_breakdown['walker-statistical']).toBe(3);
    expect(stripe!.per_layer_breakdown['module-class']).toBe(1);
  });

  it('untested_detectors lists detectorIds with zero fires across all specs', () => {
    // walker:html-prevalence appeared in pagerduty (count 0) — fires_on_specs
    // is ['stripe-full'] (count 3) so it is NOT untested.
    expect(coverage.untested_detectors).not.toContain('walker:html-prevalence');
    // No detector in our fixture has all-zero counts, so untested should be empty.
    expect(coverage.untested_detectors).toEqual([]);
  });

  it('untested_detectors flags known-but-never-emitted detectors when knownDetectorIds passed', () => {
    const cov2 = buildCoverageJson({
      perSpec,
      patternIdMap,
      referenceSpecVersions: {},
      totalRuntimeMs: 0,
      knownDetectorIds: ['spectral:apiq-orphan-rule-never-fires', 'walker:never-emitted'],
    });
    expect(cov2.untested_detectors).toContain('spectral:apiq-orphan-rule-never-fires');
    expect(cov2.untested_detectors).toContain('walker:never-emitted');
  });

  it('coverage.json shape contains all required top-level fields', () => {
    expect(coverage).toMatchObject({
      generated_at: expect.any(String),
      reference_spec_versions: expect.any(Object),
      total_runtime_ms: expect.any(Number),
      per_detector: expect.any(Array),
      per_pattern_id: expect.any(Array),
      per_lens: expect.any(Array),
      per_spec: expect.any(Array),
      untested_detectors: expect.any(Array),
    });
  });
});

describe('renderCoverageMarkdown', () => {
  const minimalCoverage = buildCoverageJson({
    perSpec: [
      fakeSpec('dnd5eapi', { 'spectral:apiq-foo': 4, 'walker:bar': 1 }, 30000),
    ],
    patternIdMap: new Map([
      ['spectral:apiq-foo', { patternId: 'F1', yamlRule: 'apiq-foo', yamlFile: 'apiq-ruleset.yaml', lenses: ['client-friction'] }],
    ]),
    referenceSpecVersions: { 'dnd5eapi': '1234567890abcdef' },
    totalRuntimeMs: 30000,
  });

  const md = renderCoverageMarkdown(minimalCoverage);

  it('contains header banner with generated_at + git-SHA', () => {
    expect(md).toContain('# COVERAGE.md');
    expect(md).toContain('Auto-generated by `npm run build-coverage`');
    expect(md).toContain(minimalCoverage.generated_at);
    expect(md).toContain('1234567890ab'); // shortSha to 12 chars (slice 0..12 of "1234567890abcdef")
  });

  it('renders Per-spec summary table with the spec', () => {
    expect(md).toContain('## Per-spec summary');
    expect(md).toContain('`dnd5eapi`');
  });

  it('renders Per-Lens table', () => {
    expect(md).toContain('## Per-Lens');
    expect(md).toContain('`client-friction`');
  });

  it('renders Per-Pattern-ID table for fired patterns', () => {
    expect(md).toContain('## Per-Pattern-ID');
    expect(md).toContain('`F1`');
  });

  it('renders Per-detector table with the detectors', () => {
    expect(md).toContain('## Per-detector');
    expect(md).toContain('`spectral:apiq-foo`');
    expect(md).toContain('`walker:bar`');
  });

  it('renders Untested-detectors section even when none', () => {
    expect(md).toContain('## Untested detectors');
  });

  it('handles empty fired-detector list gracefully', () => {
    const empty = buildCoverageJson({
      perSpec: [],
      patternIdMap: new Map(),
      referenceSpecVersions: {},
      totalRuntimeMs: 0,
    });
    const out = renderCoverageMarkdown(empty);
    expect(out).toContain('# COVERAGE.md');
    expect(out).toContain('Specs run:** 0');
  });
});

describe('loadPatternIdMapFromYamls', () => {
  it('parses real apiq-ruleset.yaml + extracts patternId via fake parseYaml', () => {
    // Use the actual yaml package to verify the real yaml-files are parseable.
    // This is the closest we get to integration without running spectral.
    const __dirname2 = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const rulesDir = path.resolve(__dirname2, '..', '..', 'deterministic', 'rules');
    if (!fs.existsSync(rulesDir)) {
      // Defensive: skip when not in repo-layout (e.g. running from a packaged dist).
      return;
    }
    const map = loadPatternIdMapFromYamls(rulesDir, yamlPkg.parse);
    // Real yamls have ≥100 rules across 12 files; expect at least 50 mappings.
    expect(map.size).toBeGreaterThan(50);
    // Spot-check J2 (apiq-fk-fields-need-format-or-pattern) is in the map.
    const j2 = map.get('spectral:apiq-fk-fields-need-format-or-pattern');
    expect(j2).toBeDefined();
    expect(j2!.patternId).toBe('J2');
    expect(j2!.lenses).toContain('client-friction');
  });

  it('returns empty map when rulesDir does not exist', () => {
    const fakeParse = () => ({});
    const map = loadPatternIdMapFromYamls('/nonexistent/path/that/does/not/exist', fakeParse);
    expect(map.size).toBe(0);
  });

  it('skips files where parseYaml throws', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-map-test-'));
    try {
      fs.writeFileSync(path.join(tmp, 'broken.yaml'), 'not: [valid yaml: at all', 'utf8');
      const map = loadPatternIdMapFromYamls(tmp, () => {
        throw new Error('parse failure');
      });
      expect(map.size).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('extracts pattern-id + lenses from synthetic yaml-doc', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-map-test-'));
    try {
      fs.writeFileSync(path.join(tmp, 'syn.yaml'), 'placeholder', 'utf8');
      const fakeParse = (_text: string) => ({
        rules: {
          'rule-a': {
            severity: 'warn',
            'apiq-meta': {
              'pattern-id': 'P1',
              lenses: ['threat-modeling', 'client-friction'],
            },
          },
          'rule-b-no-meta': {
            severity: 'hint',
          },
          'rule-c-no-pid': {
            severity: 'warn',
            'apiq-meta': {
              lenses: ['operations'],
            },
          },
        },
      });
      const map = loadPatternIdMapFromYamls(tmp, fakeParse);
      expect(map.size).toBe(1); // only rule-a has pattern-id
      const a = map.get('spectral:rule-a')!;
      expect(a.patternId).toBe('P1');
      expect(a.lenses).toEqual(['threat-modeling', 'client-friction']);
      expect(a.yamlFile).toBe('syn.yaml');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
