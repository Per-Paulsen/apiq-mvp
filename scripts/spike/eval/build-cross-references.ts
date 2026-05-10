#!/usr/bin/env tsx
/**
 * Welle I — I3a Cross-References builder.
 *
 * Reads `inventory.json` (I1) + `coverage.json` (I2) and emits
 * `CROSS-REFERENCES.md` aggregating capability data along three axes:
 *   1. Per Lens — yaml-rules + modules/aggregators/classifiers + custom-functions
 *   2. Per Pattern-Family — RFC2-* / TM-A* / CL-* / EV-* / Y-* / SC-* / SCF-* / F-* / L6-* / L7-* / L9-* / L10-* / K-* etc.
 *   3. Per Welle-Origin — parsed from each rule's apiq-meta `sources` field
 *      (mining-round1/2/3/4) or yaml-file convention; gracefully skipped when
 *      unparseable.
 *
 * CLI: `npm run cross-refs`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  InventoryJson,
  InventoryYamlRule,
  CoverageJson,
} from './inventory-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const INVENTORY_PATH = path.resolve(__dirname, 'inventory.json');
const COVERAGE_PATH = path.resolve(__dirname, 'coverage.json');
const OUT_PATH = path.resolve(__dirname, 'CROSS-REFERENCES.md');

// =============================================================================
// Pure helpers (exported for unit tests)
// =============================================================================

export function patternIdsOf(rule: InventoryYamlRule): string[] {
  if (Array.isArray(rule.pattern_id)) return rule.pattern_id;
  if (typeof rule.pattern_id === 'string' && rule.pattern_id) return [rule.pattern_id];
  return [];
}

export function lensesOf(rule: InventoryYamlRule): string[] {
  const meta = rule.apiq_meta ?? {};
  const lenses = (meta.lenses ?? (meta as Record<string, unknown>)['lenses']) as unknown;
  if (Array.isArray(lenses)) return lenses.filter((l): l is string => typeof l === 'string');
  return [];
}

export function patternFamilyOf(patternId: string): string {
  // Family = prefix up to and including the first hyphen-block, with trailing
  // numeric/alphanumeric portion stripped.  Examples:
  //   "RFC2-7"        -> "RFC2-*"
  //   "TM-A35"        -> "TM-A*"
  //   "CL-77"         -> "CL-*"
  //   "F-11"          -> "F-*"
  //   "L9-3"          -> "L9-*"
  //   "R3-PM-EV-07"   -> "R3-PM-EV-*"
  //   "B-SP-2"        -> "B-SP-*"
  if (!patternId) return 'unknown';
  // Family = everything up to but not including the trailing numeric block.
  // `RFC2-7`      -> `RFC2-*`        (trailing "7"  drops, hyphen stays)
  // `TM-A35`      -> `TM-A*`         (trailing "35" drops, no hyphen before "A35")
  // `R3-PM-EV-07` -> `R3-PM-EV-*`    (trailing "07" drops)
  // `B-SP-2`      -> `B-SP-*`
  const m = patternId.match(/^(.*?)(-?)(\d+[A-Za-z]*)$/);
  if (m) {
    const head = m[1];
    const sep = m[2]; // '' or '-'
    if (head) return sep === '-' ? `${head}-*` : `${head}*`;
  }
  return patternId;
}

export interface WelleOrigin {
  welle: string; // 'A' | 'B' | 'C' | 'D' | 'D2' | 'F' | 'M-R3' | 'M-R4' | 'unknown'
  rationale: string;
}

export function welleOriginOf(rule: InventoryYamlRule): WelleOrigin {
  const meta = rule.apiq_meta ?? {};
  const sources = (meta.sources ?? (meta as Record<string, unknown>)['sources']) as unknown;
  if (Array.isArray(sources)) {
    for (const s of sources) {
      if (typeof s === 'object' && s) {
        const round =
          (s as Record<string, unknown>).round ??
          (s as Record<string, unknown>)['mining-round'];
        if (typeof round === 'string') return { welle: `M-${round}`, rationale: `apiq-meta.sources.round=${round}` };
        if (typeof round === 'number') return { welle: `M-R${round}`, rationale: `apiq-meta.sources.round=${round}` };
      }
    }
  }
  // yaml-file-name convention
  const file = rule.file.toLowerCase();
  if (file.includes('niche')) return { welle: 'D2', rationale: 'apiq-ruleset-niche.yaml = Welle D2' };
  if (file.includes('-p3')) return { welle: 'D', rationale: '*-p3.yaml = Welle D' };
  if (file.includes('-p2')) return { welle: 'C', rationale: '*-p2.yaml = Welle C' };
  if (file.includes('-p1')) return { welle: 'B', rationale: '*-p1.yaml = Welle B' };
  if (file.includes('evolution')) return { welle: 'B', rationale: 'apiq-ruleset-evolution.yaml = Welle B' };
  if (file.endsWith('apiq-ruleset.yaml')) return { welle: 'A', rationale: 'apiq-ruleset.yaml (base) = Welle A' };
  return { welle: 'unknown', rationale: 'no apiq-meta.sources + filename inconclusive' };
}

// =============================================================================
// Aggregation
// =============================================================================

export interface PerLensAggregate {
  lens: string;
  yaml_rule_count: number;
  yaml_rule_files: string[];
  module_count: number;
  module_names: string[];
  aggregator_count: number;
  aggregator_names: string[];
  classifier_count: number;
  classifier_names: string[];
  custom_function_count: number;
  custom_function_names: string[];
  fires_on_specs_aggregate: string[];
}

export function aggregateByLens(
  inventory: InventoryJson,
  coverage: CoverageJson | null
): PerLensAggregate[] {
  const byLens = new Map<string, PerLensAggregate>();
  const ensure = (lens: string): PerLensAggregate => {
    let agg = byLens.get(lens);
    if (!agg) {
      agg = {
        lens,
        yaml_rule_count: 0,
        yaml_rule_files: [],
        module_count: 0,
        module_names: [],
        aggregator_count: 0,
        aggregator_names: [],
        classifier_count: 0,
        classifier_names: [],
        custom_function_count: 0,
        custom_function_names: [],
        fires_on_specs_aggregate: [],
      };
      byLens.set(lens, agg);
    }
    return agg;
  };

  for (const rule of inventory.yaml_rules) {
    const lenses = lensesOf(rule);
    const list = lenses.length > 0 ? lenses : ['unspecified'];
    for (const lens of list) {
      const agg = ensure(lens);
      agg.yaml_rule_count++;
      if (!agg.yaml_rule_files.includes(rule.file)) agg.yaml_rule_files.push(rule.file);
    }
  }

  // Coverage data already has its own per_lens aggregation; merge fires-on-spec
  // from there if available.
  if (coverage) {
    for (const lensRow of coverage.per_lens) {
      const agg = ensure(lensRow.lens);
      for (const spec of lensRow.fires_on_specs_aggregate) {
        if (!agg.fires_on_specs_aggregate.includes(spec)) {
          agg.fires_on_specs_aggregate.push(spec);
        }
      }
    }
  }

  return [...byLens.values()].sort((a, b) => b.yaml_rule_count - a.yaml_rule_count);
}

export interface PerFamilyAggregate {
  family: string;
  pattern_count_in_substrate: number;
  yaml_rule_count: number;
  module_detection_count: number;
  walker_detection_count: number;
  fires_on_specs: string[];
}

export function aggregateByFamily(
  inventory: InventoryJson,
  coverage: CoverageJson | null
): PerFamilyAggregate[] {
  const families = new Map<string, PerFamilyAggregate>();
  const ensure = (family: string): PerFamilyAggregate => {
    let f = families.get(family);
    if (!f) {
      f = {
        family,
        pattern_count_in_substrate: 0,
        yaml_rule_count: 0,
        module_detection_count: 0,
        walker_detection_count: 0,
        fires_on_specs: [],
      };
      families.set(family, f);
    }
    return f;
  };

  for (const rule of inventory.yaml_rules) {
    for (const pid of patternIdsOf(rule)) {
      ensure(patternFamilyOf(pid)).yaml_rule_count++;
    }
  }
  for (const m of inventory.modules) {
    for (const pid of m.pattern_ids_handled) {
      ensure(patternFamilyOf(pid)).module_detection_count++;
    }
  }
  for (const a of inventory.aggregators) {
    for (const pid of a.pattern_ids_handled) {
      ensure(patternFamilyOf(pid)).walker_detection_count++;
    }
  }

  // Coverage fires-on per pattern-id rolled up per family.
  if (coverage) {
    for (const row of coverage.per_pattern_id) {
      const family = ensure(patternFamilyOf(row.pattern_id));
      for (const spec of row.fires_on_specs) {
        if (!family.fires_on_specs.includes(spec)) family.fires_on_specs.push(spec);
      }
    }
  }

  return [...families.values()].sort((a, b) => b.yaml_rule_count - a.yaml_rule_count);
}

export interface PerWelleAggregate {
  welle: string;
  yaml_rule_count: number;
  example_files: string[];
}

export function aggregateByWelle(inventory: InventoryJson): PerWelleAggregate[] {
  const byWelle = new Map<string, PerWelleAggregate>();
  for (const rule of inventory.yaml_rules) {
    const origin = welleOriginOf(rule);
    let entry = byWelle.get(origin.welle);
    if (!entry) {
      entry = { welle: origin.welle, yaml_rule_count: 0, example_files: [] };
      byWelle.set(origin.welle, entry);
    }
    entry.yaml_rule_count++;
    if (!entry.example_files.includes(rule.file)) entry.example_files.push(rule.file);
  }
  return [...byWelle.values()].sort((a, b) => b.yaml_rule_count - a.yaml_rule_count);
}

// =============================================================================
// Markdown rendering
// =============================================================================

export function renderMarkdown(
  inventory: InventoryJson,
  coverage: CoverageJson | null,
  perLens: PerLensAggregate[],
  perFamily: PerFamilyAggregate[],
  perWelle: PerWelleAggregate[]
): string {
  const out: string[] = [];
  out.push('# CROSS-REFERENCES.md');
  out.push('');
  out.push(
    '> Auto-generated by `npm run cross-refs`. Do not edit manually. ' +
      `Last-regenerated: ${new Date().toISOString()}.`
  );
  out.push('');
  out.push('Aggregates `inventory.json` + `coverage.json` along three axes: per Lens, per Pattern-Family, per Welle-Origin.');
  out.push('');
  if (!coverage) {
    out.push('> **Note:** `coverage.json` not yet available — fires-on-spec columns are empty.');
    out.push('');
  }

  // ---------------------------------------------------------------------------
  // Per Lens
  // ---------------------------------------------------------------------------
  out.push('## Per Lens');
  out.push('');
  out.push('| Lens | YAML-rules | YAML-files | Modules | Aggregators | Classifiers | Custom-fns | Fires-on |');
  out.push('|---|---:|---:|---:|---:|---:|---:|---|');
  for (const lens of perLens) {
    out.push(
      `| \`${lens.lens}\` | ${lens.yaml_rule_count} | ${lens.yaml_rule_files.length} | ` +
        `${lens.module_count} | ${lens.aggregator_count} | ${lens.classifier_count} | ` +
        `${lens.custom_function_count} | ${lens.fires_on_specs_aggregate.join(', ') || '—'} |`
    );
  }
  out.push('');

  // ---------------------------------------------------------------------------
  // Per Pattern-Family
  // ---------------------------------------------------------------------------
  out.push('## Per Pattern-Family');
  out.push('');
  out.push('| Family | YAML-rules | Module-detections | Walker-detections | Fires-on-specs |');
  out.push('|---|---:|---:|---:|---|');
  for (const fam of perFamily) {
    out.push(
      `| \`${fam.family}\` | ${fam.yaml_rule_count} | ${fam.module_detection_count} | ` +
        `${fam.walker_detection_count} | ${fam.fires_on_specs.join(', ') || '—'} |`
    );
  }
  out.push('');

  // ---------------------------------------------------------------------------
  // Per Welle-Origin
  // ---------------------------------------------------------------------------
  out.push('## Per Welle-Origin');
  out.push('');
  out.push(
    'Welle-origin is parsed from each yaml-rule\'s apiq-meta `sources.round` field where ' +
      'present, falling back to filename convention (`-p1` = Welle B, `-p2` = Welle C, ' +
      '`-p3` = Welle D, `niche` = Welle D2, base `apiq-ruleset.yaml` = Welle A).'
  );
  out.push('');
  out.push('| Welle | YAML-rules | Files |');
  out.push('|---|---:|---|');
  for (const w of perWelle) {
    out.push(`| ${w.welle} | ${w.yaml_rule_count} | ${w.example_files.join(', ')} |`);
  }
  out.push('');

  // ---------------------------------------------------------------------------
  // Totals footer
  // ---------------------------------------------------------------------------
  out.push('## Totals (from inventory)');
  out.push('');
  out.push(`- yaml_rules: **${inventory.totals.yaml_rules}**`);
  out.push(`- modules: **${inventory.totals.modules}**`);
  out.push(`- aggregators: **${inventory.totals.aggregators}**`);
  out.push(`- classifiers: **${inventory.totals.classifiers}**`);
  out.push(`- custom_functions: **${inventory.totals.custom_functions}**`);
  out.push(`- test_files: **${inventory.totals.test_files}**`);
  out.push(`- patterns_substrate.total: **${inventory.patterns_substrate.total}**`);
  out.push('');

  return out.join('\n');
}

// =============================================================================
// CLI entry-point
// =============================================================================

function loadInventory(): InventoryJson {
  if (!fs.existsSync(INVENTORY_PATH)) {
    throw new Error(
      `inventory.json not found at ${INVENTORY_PATH}. Run \`npm run build-inventory\` first.`
    );
  }
  return JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf-8')) as InventoryJson;
}

function loadCoverageOrNull(): CoverageJson | null {
  if (!fs.existsSync(COVERAGE_PATH)) {
    console.warn(
      `[cross-refs] coverage.json not found at ${COVERAGE_PATH} — fires-on-spec columns will be empty. Run \`npm run build-coverage\` to populate.`
    );
    return null;
  }
  return JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf-8')) as CoverageJson;
}

export async function main(): Promise<void> {
  const inventory = loadInventory();
  const coverage = loadCoverageOrNull();

  const perLens = aggregateByLens(inventory, coverage);
  const perFamily = aggregateByFamily(inventory, coverage);
  const perWelle = aggregateByWelle(inventory);

  const md = renderMarkdown(inventory, coverage, perLens, perFamily, perWelle);
  fs.writeFileSync(OUT_PATH, md, 'utf-8');
  console.log(
    `[cross-refs] wrote ${path.relative(REPO_ROOT, OUT_PATH)} (${md.length} chars; ${perLens.length} lenses, ${perFamily.length} families, ${perWelle.length} welles)`
  );
}

if (import.meta.url === pathToFileUrlSafe(process.argv[1])) {
  void main();
}

function pathToFileUrlSafe(p: string | undefined): string {
  if (!p) return '';
  try {
    return new URL(`file://${path.resolve(p).replace(/\\/g, '/')}`).href;
  } catch {
    return '';
  }
}
