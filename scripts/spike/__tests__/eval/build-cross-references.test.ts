import { describe, it, expect } from 'vitest';
import {
  patternIdsOf,
  lensesOf,
  patternFamilyOf,
  welleOriginOf,
  aggregateByLens,
  aggregateByFamily,
  aggregateByWelle,
  renderMarkdown,
} from '../../eval/build-cross-references.js';
import type {
  InventoryJson,
  InventoryYamlRule,
  CoverageJson,
} from '../../eval/inventory-types.js';

function rule(over: Partial<InventoryYamlRule> & { name: string; file: string }): InventoryYamlRule {
  return {
    name: over.name,
    file: over.file,
    pattern_id: over.pattern_id ?? 'X-1',
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

describe('build-cross-references — pure helpers', () => {
  it('patternIdsOf normalizes string and array', () => {
    expect(patternIdsOf(rule({ name: 'r1', file: 'f.yaml', pattern_id: 'A-1' }))).toEqual(['A-1']);
    expect(
      patternIdsOf(rule({ name: 'r2', file: 'f.yaml', pattern_id: ['A-1', 'A-2'] }))
    ).toEqual(['A-1', 'A-2']);
  });

  it('lensesOf reads apiq_meta.lenses array safely', () => {
    expect(
      lensesOf(rule({ name: 'r', file: 'f.yaml', apiq_meta: { lenses: ['threat-modeling'] } }))
    ).toEqual(['threat-modeling']);
    expect(lensesOf(rule({ name: 'r', file: 'f.yaml', apiq_meta: {} }))).toEqual([]);
  });

  it('patternFamilyOf extracts the family-prefix correctly', () => {
    expect(patternFamilyOf('RFC2-7')).toBe('RFC2-*');
    expect(patternFamilyOf('TM-A35')).toBe('TM-A*');
    expect(patternFamilyOf('CL-77')).toBe('CL-*');
    expect(patternFamilyOf('F-11')).toBe('F-*');
    expect(patternFamilyOf('L9-3')).toBe('L9-*');
    expect(patternFamilyOf('R3-PM-EV-07')).toBe('R3-PM-EV-*');
    expect(patternFamilyOf('')).toBe('unknown');
  });

  it('welleOriginOf prefers apiq_meta.sources.round over filename', () => {
    expect(
      welleOriginOf(
        rule({
          name: 'r',
          file: 'apiq-ruleset-niche.yaml',
          apiq_meta: { sources: [{ round: 'R3' }] },
        })
      ).welle
    ).toBe('M-R3');
    expect(welleOriginOf(rule({ name: 'r', file: 'apiq-ruleset-niche.yaml' })).welle).toBe('D2');
    expect(welleOriginOf(rule({ name: 'r', file: 'apiq-ruleset-threat-p2.yaml' })).welle).toBe('C');
    expect(welleOriginOf(rule({ name: 'r', file: 'apiq-ruleset.yaml' })).welle).toBe('A');
    expect(welleOriginOf(rule({ name: 'r', file: 'mystery.yaml' })).welle).toBe('unknown');
  });
});

describe('build-cross-references — aggregation', () => {
  it('aggregateByLens counts rules per lens, falling back to "unspecified"', () => {
    const inv = emptyInventory();
    inv.yaml_rules = [
      rule({ name: 'r1', file: 'a.yaml', apiq_meta: { lenses: ['threat-modeling'] } }),
      rule({ name: 'r2', file: 'a.yaml', apiq_meta: { lenses: ['threat-modeling'] } }),
      rule({ name: 'r3', file: 'b.yaml', apiq_meta: { lenses: ['client-friction'] } }),
      rule({ name: 'r4', file: 'b.yaml' }),
    ];
    const agg = aggregateByLens(inv, null);
    const threat = agg.find((a) => a.lens === 'threat-modeling')!;
    expect(threat.yaml_rule_count).toBe(2);
    expect(threat.yaml_rule_files).toEqual(['a.yaml']);
    expect(agg.find((a) => a.lens === 'unspecified')?.yaml_rule_count).toBe(1);
  });

  it('aggregateByFamily counts yaml-rules + module-detections + walker-detections', () => {
    const inv = emptyInventory();
    inv.yaml_rules = [
      rule({ name: 'r1', file: 'a.yaml', pattern_id: 'RFC2-7' }),
      rule({ name: 'r2', file: 'a.yaml', pattern_id: ['RFC2-9', 'RFC2-11'] }),
    ];
    inv.modules = [
      {
        file: 'modules/m.ts',
        exports: ['runM'],
        pattern_ids_handled: ['RFC2-50'],
        wired_in_index: true,
      },
    ];
    inv.aggregators = [
      {
        file: 'aggregators/w.ts',
        exports: ['runW'],
        pattern_ids_handled: ['CL-1'],
        wired_in_index: true,
      },
    ];
    const fam = aggregateByFamily(inv, null);
    const rfc2 = fam.find((f) => f.family === 'RFC2-*')!;
    expect(rfc2.yaml_rule_count).toBe(3);
    expect(rfc2.module_detection_count).toBe(1);
    expect(fam.find((f) => f.family === 'CL-*')?.walker_detection_count).toBe(1);
  });

  it('aggregateByWelle groups rules per welle', () => {
    const inv = emptyInventory();
    inv.yaml_rules = [
      rule({ name: 'r1', file: 'apiq-ruleset.yaml' }),
      rule({ name: 'r2', file: 'apiq-ruleset-threat-p2.yaml' }),
      rule({ name: 'r3', file: 'apiq-ruleset-niche.yaml' }),
      rule({ name: 'r4', file: 'apiq-ruleset-niche.yaml' }),
    ];
    const agg = aggregateByWelle(inv);
    expect(agg.find((w) => w.welle === 'D2')?.yaml_rule_count).toBe(2);
    expect(agg.find((w) => w.welle === 'A')?.yaml_rule_count).toBe(1);
    expect(agg.find((w) => w.welle === 'C')?.yaml_rule_count).toBe(1);
  });

  it('aggregateByLens merges fires-on-spec data from coverage when present', () => {
    const inv = emptyInventory();
    inv.yaml_rules = [
      rule({ name: 'r1', file: 'a.yaml', apiq_meta: { lenses: ['threat-modeling'] } }),
    ];
    const cov: CoverageJson = {
      generated_at: 'now',
      reference_spec_versions: {},
      per_detector: [],
      per_pattern_id: [],
      per_lens: [
        {
          lens: 'threat-modeling',
          total_pattern_ids: 1,
          total_yaml_rules_active: 1,
          total_modules_active: 0,
          fires_on_specs_aggregate: ['stripe-full', 'github-rest'],
        },
      ],
      per_spec: [],
      untested_detectors: [],
    };
    const agg = aggregateByLens(inv, cov);
    expect(agg.find((a) => a.lens === 'threat-modeling')?.fires_on_specs_aggregate).toEqual([
      'stripe-full',
      'github-rest',
    ]);
  });
});

describe('build-cross-references — markdown rendering', () => {
  it('renderMarkdown produces all three section headers + totals', () => {
    const inv = emptyInventory();
    inv.totals.yaml_rules = 1;
    const md = renderMarkdown(inv, null, [], [], []);
    expect(md).toContain('# CROSS-REFERENCES.md');
    expect(md).toContain('## Per Lens');
    expect(md).toContain('## Per Pattern-Family');
    expect(md).toContain('## Per Welle-Origin');
    expect(md).toContain('## Totals (from inventory)');
    expect(md).toContain('yaml_rules: **1**');
  });
});
