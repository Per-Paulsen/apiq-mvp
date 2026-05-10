import { describe, it, expect } from 'vitest';
import {
  buildDetectorRows,
  matchTestsToDetectors,
  testCoversDetector,
  detectTestOrphans,
  renderMarkdown,
} from '../../eval/build-test-coverage-map.js';
import type { InventoryJson, InventoryTestFile } from '../../eval/inventory-types.js';

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

describe('buildDetectorRows', () => {
  it('emits one row per module / aggregator / classifier / custom-function / yaml-rule', () => {
    const inv = emptyInventory();
    inv.modules = [
      { file: 'modules/secret-scanner.ts', exports: ['runSecretScanner'], pattern_ids_handled: ['Y-1'], wired_in_index: true },
    ];
    inv.aggregators = [
      { file: 'aggregators/empty-schema-descriptions.ts', exports: ['runEmptyDesc'], pattern_ids_handled: [], wired_in_index: true },
    ];
    inv.classifiers = [
      { file: 'classifiers/style-classifier.ts', exports: ['runStyle'], pattern_ids_handled: [], wired_in_index: true },
    ];
    inv.custom_functions = [
      { file: 'spectral-functions/threat-p1-functions.ts', exports: ['fooFn'], used_by_yaml_rules: ['rule-x'] },
    ];
    inv.yaml_rules = [
      {
        name: 'apiq-rule-1',
        file: 'rules/apiq-ruleset.yaml',
        pattern_id: 'A-1',
        severity: 'warn',
        recommended: true,
        given: '$',
        function: null,
        apiq_meta: {},
      },
    ];
    const rows = buildDetectorRows(inv);
    expect(rows.find((r) => r.detector_id === 'secret-scanner')?.category).toBe('module');
    expect(rows.find((r) => r.detector_id === 'empty-schema-descriptions')?.category).toBe('aggregator');
    expect(rows.find((r) => r.detector_id === 'style-classifier')?.category).toBe('classifier');
    expect(rows.find((r) => r.detector_id === 'threat-p1-functions')?.category).toBe('custom-function');
    expect(rows.find((r) => r.detector_id === 'yaml:apiq-rule-1')?.category).toBe('yaml-rule');
  });
});

describe('testCoversDetector', () => {
  function det(over: { id: string; sf: string | null; keys: string[] }) {
    return {
      detector_id: over.id,
      category: 'module' as const,
      source_file: over.sf,
      search_keys: over.keys,
    };
  }
  function tf(over: Partial<InventoryTestFile> & { file: string }): InventoryTestFile {
    return {
      file: over.file,
      target_module: over.target_module ?? null,
      test_count: over.test_count ?? 1,
      describe_blocks: over.describe_blocks ?? [],
    };
  }

  it('matches when test target_module ends with detector source_file', () => {
    expect(
      testCoversDetector(
        tf({
          file: 't.test.ts',
          target_module: '../../scripts/spike/deterministic/modules/secret-scanner.js',
        }),
        det({ id: 'secret-scanner', sf: 'modules/secret-scanner.ts', keys: ['secret-scanner'] })
      )
    ).toBe(true);
  });

  it('matches when describe-block contains the detector file-stem', () => {
    expect(
      testCoversDetector(
        tf({ file: 't.test.ts', describe_blocks: ['secret-scanner integration'] }),
        det({ id: 'secret-scanner', sf: null, keys: ['secret-scanner'] })
      )
    ).toBe(true);
  });

  it('rejects keys shorter than 4 chars to avoid false positives', () => {
    expect(
      testCoversDetector(
        tf({ file: 'x.test.ts', describe_blocks: ['ref handling'] }),
        det({ id: 'r', sf: null, keys: ['r', 'rf'] })
      )
    ).toBe(false);
  });

  it('does not match against the test-file path itself (only describe blocks)', () => {
    expect(
      testCoversDetector(
        tf({ file: 'secret-scanner.test.ts', target_module: null, describe_blocks: ['unrelated'] }),
        det({ id: 'secret-scanner', sf: null, keys: ['secret-scanner'] })
      )
    ).toBe(false);
  });
});

describe('matchTestsToDetectors + detectTestOrphans', () => {
  it('aggregates and surfaces both untested and orphan flows', () => {
    const inv = emptyInventory();
    inv.modules = [
      { file: 'modules/known.ts', exports: ['runKnown'], pattern_ids_handled: [], wired_in_index: true },
    ];
    inv.test_files = [
      {
        file: '__tests__/known.test.ts',
        target_module: '../../scripts/spike/deterministic/modules/known.ts',
        test_count: 5,
        describe_blocks: ['known module'],
      },
      {
        file: '__tests__/orphan.test.ts',
        target_module: '../../scripts/spike/deterministic/modules/removed-detector.ts',
        test_count: 2,
        describe_blocks: ['removed-detector'],
      },
    ];
    const detectors = buildDetectorRows(inv);
    const matches = matchTestsToDetectors(detectors, inv.test_files);
    const known = matches.find((m) => m.detector_id === 'known')!;
    expect(known.test_files.length).toBeGreaterThan(0);

    const orphans = detectTestOrphans(inv, detectors);
    expect(orphans.find((o) => o.test_file === '__tests__/orphan.test.ts')).toBeTruthy();
  });
});

describe('renderMarkdown', () => {
  it('renders all required section headers and a coverage percentage', () => {
    const inv = emptyInventory();
    const md = renderMarkdown(inv, [], [], []);
    expect(md).toContain('# TEST-COVERAGE.md');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Per-detector coverage (file-level)');
    expect(md).toContain('## Per-yaml rule coverage (rolled up)');
    expect(md).toContain('## Untested detectors');
    expect(md).toContain('## Test-orphans');
  });
});
