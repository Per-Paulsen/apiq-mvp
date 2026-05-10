/**
 * Welle I — Canonical schemas for `inventory.json` (I1) and `coverage.json` (I2).
 *
 * These types are CONSUMED by the I3 / I4 / I5 derived-analysis scripts:
 *   - build-cross-references.ts
 *   - build-drift-report.ts
 *   - build-test-coverage-map.ts
 *   - build-api-surface.ts
 *
 * Schema-changes in I1/I2 must be reflected here so the downstream scripts
 * type-check against the producer-shape.
 */

export type DetectorLayer =
  | 'spectral-oas3-default'
  | 'spectral-apiq-custom'
  | 'walker-statistical'
  | 'module-class'
  | 'domain-knowledge';

export interface InventoryYamlRule {
  name: string;
  file: string;
  pattern_id: string | string[];
  severity: string;
  recommended: boolean;
  given: string | string[];
  function: string | null;
  apiq_meta: Record<string, unknown>;
}

export interface InventoryDetectorFile {
  file: string;
  exports: string[];
  pattern_ids_handled: string[];
  wired_in_index: boolean;
}

export interface InventoryCustomFunction {
  file: string;
  exports: string[];
  used_by_yaml_rules: string[];
}

export interface InventoryTestFile {
  file: string;
  target_module: string | null;
  test_count: number;
  describe_blocks: string[];
}

export interface InventoryPatternsSubstrate {
  total: number;
  by_lens: Record<string, number>;
  stage_a_count: number;
  stage_b_count: number;
}

export interface InventoryTotals {
  yaml_rules: number;
  modules: number;
  aggregators: number;
  classifiers: number;
  custom_functions: number;
  test_files: number;
}

export interface InventoryJson {
  generated_at: string;
  yaml_rules: InventoryYamlRule[];
  modules: InventoryDetectorFile[];
  aggregators: InventoryDetectorFile[];
  classifiers: InventoryDetectorFile[];
  custom_functions: InventoryCustomFunction[];
  test_files: InventoryTestFile[];
  patterns_substrate: InventoryPatternsSubstrate;
  totals: InventoryTotals;
}

export interface CoverageDetector {
  detector_id: string;
  layer: DetectorLayer;
  fires_on_specs: string[];
  total_findings_count: number;
  finding_count_per_spec: Record<string, number>;
}

export interface CoveragePerPatternId {
  pattern_id: string;
  detector_ids: string[];
  fires_on_specs: string[];
}

export interface CoveragePerLens {
  lens: string;
  total_pattern_ids: number;
  total_yaml_rules_active: number;
  total_modules_active: number;
  fires_on_specs_aggregate: string[];
}

export interface CoveragePerSpec {
  spec_name: string;
  total_findings: number;
  per_layer_breakdown: Record<string, number>;
  top_10_detectors_by_count: Array<{ detector_id: string; count: number }>;
  runtime_ms: number;
}

export interface CoverageJson {
  generated_at: string;
  reference_spec_versions: Record<string, string>;
  per_detector: CoverageDetector[];
  per_pattern_id: CoveragePerPatternId[];
  per_lens: CoveragePerLens[];
  per_spec: CoveragePerSpec[];
  untested_detectors: string[];
}
