import { describe, it, expect } from 'vitest';
import {
  detectSubstrateOnly,
  detectDeadCode,
  detectOrphans,
  parseRegisteredFunctionKeys,
  detectFunctionBindingBroken,
  extractNumericClaims,
  compareClaims,
  renderMarkdown,
} from '../../eval/build-drift-report.js';
import type {
  InventoryJson,
  InventoryYamlRule,
  CoverageJson,
} from '../../eval/inventory-types.js';

function rule(over: Partial<InventoryYamlRule> & { name: string; file: string }): InventoryYamlRule {
  return {
    name: over.name,
    file: over.file,
    pattern_id: over.pattern_id ?? 'A-1',
    severity: over.severity ?? 'warn',
    recommended: over.recommended ?? true,
    given: over.given ?? '$',
    function: over.function ?? null,
    apiq_meta: over.apiq_meta ?? {},
  };
}

function emptyInventory(): InventoryJson {
  return {
    generated_at: new Date().toISOString(),
    yaml_rules: [],
    modules: [],
    aggregators: [],
    classifiers: [],
    custom_functions: [],
    test_files: [],
    patterns_substrate: { total: 0, by_lens: {}, stage_a_count: 0, stage_b_count: 0 },
    totals: {
      yaml_rules: 0,
      modules: 0,
      aggregators: 0,
      classifiers: 0,
      custom_functions: 0,
      test_files: 0,
    },
  };
}

describe('drift-class 1 — substrate-only', () => {
  it('finds patterns with no detector handling them', () => {
    const inv = emptyInventory();
    inv.yaml_rules = [rule({ name: 'r1', file: 'a.yaml', pattern_id: 'A-1' })];
    inv.modules = [
      {
        file: 'modules/m.ts',
        exports: ['runM'],
        pattern_ids_handled: ['B-2'],
        wired_in_index: true,
      },
    ];
    const patterns = [
      { patternId: 'A-1', description: 'covered by yaml' },
      { patternId: 'B-2', description: 'covered by module' },
      { patternId: 'C-3', description: 'orphan substrate-only' },
    ];
    const result = detectSubstrateOnly(patterns, inv);
    expect(result.map((r) => r.patternId)).toEqual(['C-3']);
  });

  it('skips patterns marked isStageATerritory=false', () => {
    const inv = emptyInventory();
    const patterns = [
      { patternId: 'D-1', description: 'stage-b territory', isStageATerritory: false },
    ];
    expect(detectSubstrateOnly(patterns, inv)).toEqual([]);
  });
});

describe('drift-class 2 — dead-code-suspicion', () => {
  it('flags every detector in coverage.untested_detectors with a hint', () => {
    const inv = emptyInventory();
    const cov: CoverageJson = {
      generated_at: 'now',
      reference_spec_versions: {},
      per_detector: [],
      per_pattern_id: [],
      per_lens: [],
      per_spec: [],
      untested_detectors: ['webhook-signature', 'integer-no-range'],
    };
    const result = detectDeadCode(inv, cov);
    expect(result.map((r) => r.detector_id)).toEqual([
      'integer-no-range',
      'webhook-signature',
    ]);
    expect(result.find((r) => r.detector_id === 'webhook-signature')?.hint).toContain('missing-fixture');
    expect(result.find((r) => r.detector_id === 'integer-no-range')?.hint).toContain('broken-detection');
  });

  it('returns empty when coverage is null', () => {
    expect(detectDeadCode(emptyInventory(), null)).toEqual([]);
  });
});

describe('drift-class 3 — orphan-module', () => {
  it('flags files with wired_in_index === false across all categories', () => {
    const inv = emptyInventory();
    inv.modules = [
      { file: 'modules/spec-diff.ts', exports: ['runSpecDiff'], pattern_ids_handled: [], wired_in_index: false },
      { file: 'modules/wired.ts', exports: ['runWired'], pattern_ids_handled: [], wired_in_index: true },
    ];
    inv.aggregators = [
      { file: 'aggregators/orphan.ts', exports: ['runOrphan'], pattern_ids_handled: [], wired_in_index: false },
    ];
    const result = detectOrphans(inv);
    expect(result).toEqual([
      { category: 'modules', file: 'modules/spec-diff.ts', exports: ['runSpecDiff'] },
      { category: 'aggregators', file: 'aggregators/orphan.ts', exports: ['runOrphan'] },
    ]);
  });
});

describe('drift-class 4 — function-binding-broken', () => {
  it('extracts kebab-case keys from APIQ_CUSTOM_FUNCTIONS literal', () => {
    const src = `
      export const APIQ_CUSTOM_FUNCTIONS: Record<string, (...args: any[]) => any> = {
        'multi-lang-reserved-keywords': fn1,
        'list-endpoint-has-pagination': fn2,
        "double-quoted-key": fn3,
      };
    `;
    const keys = parseRegisteredFunctionKeys(src);
    expect(keys.has('multi-lang-reserved-keywords')).toBe(true);
    expect(keys.has('list-endpoint-has-pagination')).toBe(true);
    expect(keys.has('double-quoted-key')).toBe(true);
    expect(keys.has('truthy')).toBe(true); // built-in still present
  });

  it('flags yaml-rules referencing function-keys not in known-set', () => {
    const inv = emptyInventory();
    inv.yaml_rules = [
      rule({ name: 'rule-good', file: 'a.yaml', function: 'truthy' }),
      rule({ name: 'rule-bad', file: 'a.yaml', function: 'nonexistent-fn' }),
      rule({ name: 'rule-no-fn', file: 'a.yaml', function: null }),
    ];
    const known = new Set(['truthy', 'pattern']);
    const broken = detectFunctionBindingBroken(inv, known);
    expect(broken).toEqual([
      { yaml_file: 'a.yaml', rule_name: 'rule-bad', function_key: 'nonexistent-fn' },
    ]);
  });
});

describe('drift-class 5 — claimed-vs-actual', () => {
  it('extracts numeric claims for known metrics', () => {
    const md = `
      Status: 354 yaml-rules across 12 yamls.
      Has 116 custom-functions and 25 walkers.
      Tests: 2230 pass / 4 skipped.
    `;
    const claims = extractNumericClaims(md, 'CLAUDE.md');
    const metrics = claims.map((c) => `${c.metric}=${c.claimed}`);
    expect(metrics).toContain('yaml_rules=354');
    expect(metrics).toContain('custom_functions=116');
    expect(metrics).toContain('aggregators=25');
    expect(metrics).toContain('tests_pass=2230');
  });

  it('compareClaims marks match vs drift correctly', () => {
    const inv = emptyInventory();
    inv.totals.yaml_rules = 354;
    inv.totals.custom_functions = 116;
    const claims = [
      {
        source_file: 'CLAUDE.md',
        line: 1,
        raw: '354 yaml-rules',
        metric: 'yaml_rules' as const,
        claimed: 354,
      },
      {
        source_file: 'CLAUDE.md',
        line: 2,
        raw: '120 custom-functions',
        metric: 'custom_functions' as const,
        claimed: 120,
      },
    ];
    const compared = compareClaims(claims, inv);
    expect(compared[0].status).toBe('match');
    expect(compared[1].status).toBe('drift');
  });

  it('marks tests_pass as unknown (not derivable from inventory)', () => {
    const inv = emptyInventory();
    const compared = compareClaims(
      [
        {
          source_file: 'CLAUDE.md',
          line: 1,
          raw: '2230 tests pass',
          metric: 'tests_pass' as const,
          claimed: 2230,
        },
      ],
      inv
    );
    expect(compared[0].status).toBe('unknown');
  });
});

describe('renderMarkdown', () => {
  it('emits all 5 drift-class section headers', () => {
    const inv = emptyInventory();
    const md = renderMarkdown(inv, null, [], [], [], [], []);
    expect(md).toContain('# DRIFT-REPORT.md');
    expect(md).toContain('Drift-class 1');
    expect(md).toContain('Drift-class 2');
    expect(md).toContain('Drift-class 3');
    expect(md).toContain('Drift-class 4');
    expect(md).toContain('Drift-class 5');
  });
});
