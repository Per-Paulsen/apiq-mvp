/**
 * Pure aggregation-logic for build-coverage-map.ts.
 *
 * Separated so unit-tests can validate the aggregation against synthetic
 * `DetectorFinding[]` inputs WITHOUT running the 45min 4-spec live-pipeline.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DeterministicLayerResult,
  DetectorLayer,
} from '../deterministic/index.js';

// =============================================================================
// CANONICAL coverage.json schema — Task #3 (cross-refs + drift) consumes this.
// Treat any field-rename as a breaking change.
// =============================================================================

export type DetectorLayerName = DetectorLayer;

export interface CoverageJson {
  generated_at: string;
  reference_spec_versions: Record<string, string>;
  total_runtime_ms: number;
  per_detector: Array<{
    detector_id: string;
    layer: DetectorLayerName;
    fires_on_specs: string[];
    total_findings_count: number;
    finding_count_per_spec: Record<string, number>;
  }>;
  per_pattern_id: Array<{
    pattern_id: string;
    detector_ids: string[];
    fires_on_specs: string[];
  }>;
  per_lens: Array<{
    lens: string;
    total_pattern_ids: number;
    total_yaml_rules_active: number;
    total_modules_active: number;
    fires_on_specs_aggregate: string[];
  }>;
  per_spec: Array<{
    spec_name: string;
    total_findings: number;
    per_layer_breakdown: Record<string, number>;
    top_10_detectors_by_count: Array<{ detector_id: string; count: number }>;
    runtime_ms: number;
  }>;
  untested_detectors: string[];
}

export interface PerSpecRun {
  specName: string;
  runtimeMs: number;
  perLayer: Record<DetectorLayer, number>;
  perDetector: Record<string, number>;
  /** Per-detector layer (derived from the raw findings — mirrors what the
   *  deterministic-layer emitted). */
  detectorLayerMap: Record<string, DetectorLayerName>;
  totalFindings: number;
}

export interface PatternIdRecord {
  patternId: string;
  yamlRule: string;
  yamlFile: string;
  lenses: string[];
}

// =============================================================================
// YAML parsing — pattern-id + lens lookup from rules/*.yaml apiq-meta blocks.
// =============================================================================

interface YamlRuleBlock {
  description?: string;
  severity?: string;
  recommended?: boolean;
  given?: unknown;
  then?: unknown;
  formats?: unknown;
  'apiq-meta'?: {
    'pattern-id'?: string;
    lenses?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface YamlRulesetFile {
  extends?: unknown;
  formats?: unknown;
  rules?: Record<string, YamlRuleBlock>;
}

/**
 * Loads ALL apiq-ruleset*.yaml files in `rulesDir` and returns
 * `Map<detectorId, PatternIdRecord>`. detectorId follows the spectral-runner
 * convention: `spectral:${ruleCode}`.
 *
 * `parseYamlFn` is injected so tests can stub it.
 */
export function loadPatternIdMapFromYamls(
  rulesDir: string,
  parseYamlFn: (text: string) => unknown
): Map<string, PatternIdRecord> {
  const map = new Map<string, PatternIdRecord>();
  if (!fs.existsSync(rulesDir)) return map;
  const yamlFiles = fs
    .readdirSync(rulesDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const file of yamlFiles) {
    const filePath = path.join(rulesDir, file);
    const text = fs.readFileSync(filePath, 'utf8');
    let doc: YamlRulesetFile;
    try {
      doc = parseYamlFn(text) as YamlRulesetFile;
    } catch {
      continue;
    }
    if (!doc?.rules || typeof doc.rules !== 'object') continue;
    for (const [ruleName, ruleBlock] of Object.entries(doc.rules)) {
      if (!ruleBlock || typeof ruleBlock !== 'object') continue;
      const meta = ruleBlock['apiq-meta'];
      if (!meta || typeof meta !== 'object') continue;
      const patternId = meta['pattern-id'];
      if (!patternId || typeof patternId !== 'string') continue;
      const lenses = Array.isArray(meta.lenses)
        ? meta.lenses.filter((l): l is string => typeof l === 'string')
        : [];
      const detectorId = `spectral:${ruleName}`;
      map.set(detectorId, {
        patternId,
        yamlRule: ruleName,
        yamlFile: file,
        lenses,
      });
    }
  }
  return map;
}

/**
 * Build the detectorId → layer map by introspecting the raw per-detector
 * counts. We store the most-common layer-of-origin for each detector
 * (derived from the result's `findings[].meta?.layer` chain — but since
 * `perDetector` is layer-agnostic, we read `findings` to disambiguate).
 *
 * For the persisted partial we use `perLayer` aggregates already; this
 * function pulls the actual finding→layer assoc.
 */
export function loadDetectorLayerFromResult(
  result: DeterministicLayerResult
): Record<string, DetectorLayerName> {
  const map: Record<string, DetectorLayerName> = {};
  // result.findings doesn't carry layer directly (it's the LLM-equivalent
  // shape), but the narration starts with "[deterministic-layer:LAYER]"
  // for traceability — see output-mapper. Easier: infer from detectorId
  // prefix using the same convention as DetectorFinding emitters.
  for (const detectorId of Object.keys(result.perDetector)) {
    map[detectorId] = inferLayerFromDetectorId(detectorId);
  }
  return map;
}

/**
 * Map detectorId-prefix → DetectorLayer. Conventions in this codebase
 * (verified via grep across deterministic/aggregators + modules + spectral-runner):
 *   - `spectral:${ruleCode}` → spectral-oas3-default OR spectral-apiq-custom
 *     (cannot distinguish without OAS3_DEFAULT_RULE_CODES set; we default
 *     to 'spectral-apiq-custom' and rely on per-spec perLayer aggregates
 *     for accurate layer-totals).
 *   - `walker:*` → walker-statistical
 *   - `module:*` / `ajv:*` / `codegen:*` / `style-coherence:*` /
 *     `duplicate-schemas:*` → module-class
 *   - `domain:*` → domain-knowledge (currently unwired; included for
 *     future-compat).
 */
export function inferLayerFromDetectorId(detectorId: string): DetectorLayerName {
  if (detectorId.startsWith('spectral:')) {
    // Default-OAS3 vs apiq-custom requires the OAS3_DEFAULT_RULE_CODES set
    // from spectral-runner internals; we default to apiq-custom and note
    // that COVERAGE.md per-layer-totals come from `result.perLayer`
    // (which IS authoritative since spectral-runner sets it correctly).
    return 'spectral-apiq-custom';
  }
  if (detectorId.startsWith('walker:')) return 'walker-statistical';
  if (
    detectorId.startsWith('module:') ||
    detectorId.startsWith('ajv:') ||
    detectorId.startsWith('codegen:') ||
    detectorId.startsWith('style-coherence:') ||
    detectorId.startsWith('duplicate-schemas:')
  ) {
    return 'module-class';
  }
  if (detectorId.startsWith('domain:')) return 'domain-knowledge';
  // Unknown prefix — group with module-class as the safest catch-all.
  return 'module-class';
}

// =============================================================================
// Aggregation entry-point.
// =============================================================================

export interface BuildCoverageJsonInput {
  perSpec: PerSpecRun[];
  patternIdMap: Map<string, PatternIdRecord>;
  referenceSpecVersions: Record<string, string>;
  totalRuntimeMs: number;
  /** For drift-class-2 ("dead-code-suspicion") we need to know which
   *  detectors EXIST even when fires-on count is 0. The yaml-derived
   *  patternIdMap covers all spectral-* detectors. Walker + module
   *  detectorIds are NOT in the yaml — so untested-detectors is computed
   *  per-spec-relative ("fires on 0 of N specs from THOSE that ran"),
   *  not absolute. Absolute untested-detection requires inventory.json
   *  (Task I3 territory). */
  knownDetectorIds?: Iterable<string>;
}

export function buildCoverageJson(input: BuildCoverageJsonInput): CoverageJson {
  const { perSpec, patternIdMap, referenceSpecVersions, totalRuntimeMs } = input;

  // ---- per_detector ----
  const detectorAgg = new Map<
    string,
    {
      layer: DetectorLayerName;
      firesOnSpecs: Set<string>;
      totalCount: number;
      perSpec: Record<string, number>;
    }
  >();

  for (const spec of perSpec) {
    for (const [detectorId, count] of Object.entries(spec.perDetector)) {
      let entry = detectorAgg.get(detectorId);
      if (!entry) {
        entry = {
          layer: spec.detectorLayerMap[detectorId] ?? inferLayerFromDetectorId(detectorId),
          firesOnSpecs: new Set(),
          totalCount: 0,
          perSpec: {},
        };
        detectorAgg.set(detectorId, entry);
      }
      if (count > 0) entry.firesOnSpecs.add(spec.specName);
      entry.totalCount += count;
      entry.perSpec[spec.specName] = count;
    }
  }

  const per_detector = Array.from(detectorAgg.entries())
    .map(([detector_id, e]) => ({
      detector_id,
      layer: e.layer,
      fires_on_specs: Array.from(e.firesOnSpecs).sort(),
      total_findings_count: e.totalCount,
      finding_count_per_spec: e.perSpec,
    }))
    .sort((a, b) => b.total_findings_count - a.total_findings_count);

  // ---- per_pattern_id ----
  const patternIdAgg = new Map<
    string,
    { detectorIds: Set<string>; firesOnSpecs: Set<string> }
  >();
  for (const detector of per_detector) {
    const rec = patternIdMap.get(detector.detector_id);
    if (!rec) continue;
    let entry = patternIdAgg.get(rec.patternId);
    if (!entry) {
      entry = { detectorIds: new Set(), firesOnSpecs: new Set() };
      patternIdAgg.set(rec.patternId, entry);
    }
    entry.detectorIds.add(detector.detector_id);
    for (const spec of detector.fires_on_specs) entry.firesOnSpecs.add(spec);
  }
  const per_pattern_id = Array.from(patternIdAgg.entries())
    .map(([pattern_id, e]) => ({
      pattern_id,
      detector_ids: Array.from(e.detectorIds).sort(),
      fires_on_specs: Array.from(e.firesOnSpecs).sort(),
    }))
    .sort((a, b) => a.pattern_id.localeCompare(b.pattern_id));

  // ---- per_lens ----
  const lensAgg = new Map<
    string,
    {
      patternIds: Set<string>;
      yamlRules: Set<string>;
      firesOnSpecs: Set<string>;
    }
  >();
  // Iterate ALL patternIdMap entries (not just fired ones) so we count
  // total_yaml_rules_active accurately even for lenses that fired on 0 specs.
  for (const [detectorId, rec] of patternIdMap.entries()) {
    for (const lens of rec.lenses) {
      let entry = lensAgg.get(lens);
      if (!entry) {
        entry = {
          patternIds: new Set(),
          yamlRules: new Set(),
          firesOnSpecs: new Set(),
        };
        lensAgg.set(lens, entry);
      }
      entry.patternIds.add(rec.patternId);
      entry.yamlRules.add(rec.yamlRule);
      const fired = detectorAgg.get(detectorId);
      if (fired) {
        for (const spec of fired.firesOnSpecs) entry.firesOnSpecs.add(spec);
      }
    }
  }
  const per_lens = Array.from(lensAgg.entries())
    .map(([lens, e]) => ({
      lens,
      total_pattern_ids: e.patternIds.size,
      total_yaml_rules_active: e.yamlRules.size,
      total_modules_active: 0, // module-classes don't carry lens-tags in the
      // detectorId itself; this would require module-source-introspection
      // which is I1's territory. Filled in by I3 if inventory.json is present.
      fires_on_specs_aggregate: Array.from(e.firesOnSpecs).sort(),
    }))
    .sort((a, b) => a.lens.localeCompare(b.lens));

  // ---- per_spec ----
  const per_spec = perSpec.map((s) => {
    const detectorEntries = Object.entries(s.perDetector);
    const top10 = detectorEntries
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([detector_id, count]) => ({ detector_id, count }));
    return {
      spec_name: s.specName,
      total_findings: s.totalFindings,
      per_layer_breakdown: { ...s.perLayer } as Record<string, number>,
      top_10_detectors_by_count: top10,
      runtime_ms: s.runtimeMs,
    };
  });

  // ---- untested_detectors ----
  // Detectors that fired on 0 of N specs that actually ran. If
  // `knownDetectorIds` provided, also flag detectors that EXIST but never
  // showed up in any per_detector — true dead-code-suspicion.
  const allRanSpecs = new Set(perSpec.map((s) => s.specName));
  const untested_detectors: string[] = [];
  for (const d of per_detector) {
    if (d.fires_on_specs.length === 0) untested_detectors.push(d.detector_id);
  }
  if (input.knownDetectorIds) {
    const seen = new Set(per_detector.map((d) => d.detector_id));
    for (const known of input.knownDetectorIds) {
      if (!seen.has(known)) untested_detectors.push(known);
    }
  }
  untested_detectors.sort();

  return {
    generated_at: new Date().toISOString(),
    reference_spec_versions: referenceSpecVersions,
    total_runtime_ms: totalRuntimeMs,
    per_detector,
    per_pattern_id,
    per_lens,
    per_spec,
    untested_detectors,
  };
}
