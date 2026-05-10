#!/usr/bin/env tsx
/**
 * Welle I — I4 Test-Coverage-Map builder.
 *
 * Reads `inventory.json` (test_files + yaml_rules + modules + aggregators +
 * classifiers + custom_functions) and emits `TEST-COVERAGE.md`.
 *
 * Per-detector → covering test-files (resolved by import-target + describe-title
 * substring-match + rule-name substring-match).
 *
 * Surfaces:
 *   - Untested-detectors: detector exists in inventory but no test-file references it
 *   - Test-orphans: test-file targets a module that no longer exists in inventory
 *
 * CLI: `npm run test-coverage-map`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  InventoryJson,
  InventoryDetectorFile,
  InventoryTestFile,
} from './inventory-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const INVENTORY_PATH = path.resolve(__dirname, 'inventory.json');
const OUT_PATH = path.resolve(__dirname, 'TEST-COVERAGE.md');

// =============================================================================
// Detector representation (unified across modules / aggregators / classifiers /
// custom-functions / yaml-rules)
// =============================================================================

export interface DetectorRow {
  detector_id: string;
  category: 'module' | 'aggregator' | 'classifier' | 'custom-function' | 'yaml-rule';
  source_file: string | null; // canonical source-file path (or null for yaml-rule meta-only)
  search_keys: string[]; // strings a test-file is checked against (file-stem + exports + rule-names)
}

export function buildDetectorRows(inventory: InventoryJson): DetectorRow[] {
  const rows: DetectorRow[] = [];
  const fileStem = (p: string): string => path.basename(p).replace(/\.(ts|js|yaml|yml)$/i, '');

  const addDetectorFiles = (
    list: InventoryDetectorFile[],
    category: DetectorRow['category']
  ): void => {
    for (const d of list) {
      const stem = fileStem(d.file);
      // Skip meta-only files (`_shared.ts`, `_metadata.ts`) — these are
      // helpers, not detectors with their own test-file convention.
      if (stem.startsWith('_')) continue;
      rows.push({
        detector_id: stem,
        category,
        // Search-keys deliberately limited to the file-stem; exports and
        // pattern-ids tend to be common short tokens that produce massive
        // false-positive matches in describe-blocks.
        source_file: d.file,
        search_keys: [stem],
      });
    }
  };

  addDetectorFiles(inventory.modules, 'module');
  addDetectorFiles(inventory.aggregators, 'aggregator');
  addDetectorFiles(inventory.classifiers, 'classifier');

  for (const cf of inventory.custom_functions) {
    const stem = fileStem(cf.file);
    if (stem.startsWith('_')) continue;
    rows.push({
      detector_id: stem,
      category: 'custom-function',
      source_file: cf.file,
      search_keys: [stem],
    });
  }

  for (const rule of inventory.yaml_rules) {
    rows.push({
      detector_id: `yaml:${rule.name}`,
      category: 'yaml-rule',
      source_file: rule.file,
      search_keys: [rule.name],
    });
  }

  return rows;
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// =============================================================================
// Coverage matching
// =============================================================================

export interface CoverageMatch {
  detector_id: string;
  category: DetectorRow['category'];
  source_file: string | null;
  test_files: string[];
}

/**
 * A test covers a detector when ANY of:
 *   - its `target_module` ends with the detector's `source_file`
 *   - its `target_module` basename equals the detector_id
 *   - any describe-block title contains a search-key (case-insensitive
 *     substring; min 4 chars to avoid trivia like "ref" matching "Reference")
 */
export function matchTestsToDetectors(
  detectors: DetectorRow[],
  testFiles: InventoryTestFile[]
): CoverageMatch[] {
  return detectors.map((d) => {
    const matches = new Set<string>();
    for (const t of testFiles) {
      if (testCoversDetector(t, d)) matches.add(t.file);
    }
    return {
      detector_id: d.detector_id,
      category: d.category,
      source_file: d.source_file,
      test_files: [...matches].sort(),
    };
  });
}

export function testCoversDetector(test: InventoryTestFile, det: DetectorRow): boolean {
  if (test.target_module && det.source_file) {
    const tm = test.target_module.toLowerCase().replace(/\\/g, '/');
    const sf = det.source_file.toLowerCase().replace(/\\/g, '/');
    if (tm.endsWith(sf)) return true;
    const sfStem = path.basename(sf).replace(/\.(ts|js|yaml|yml)$/i, '');
    if (path.basename(tm).replace(/\.(ts|js)$/i, '') === sfStem) return true;
  }
  // Describe-block titles only (NOT the test-file path) — file paths produce
  // far too many false-positives because they share tokens like "test" or
  // sub-strings of detector-names.
  const haystack = test.describe_blocks.join(' ').toLowerCase();
  for (const key of det.search_keys) {
    if (key.length < 4) continue;
    if (haystack.includes(key.toLowerCase())) return true;
  }
  return false;
}

export interface TestOrphanEntry {
  test_file: string;
  target_module: string;
  reason: string;
}

export function detectTestOrphans(
  inventory: InventoryJson,
  detectors: DetectorRow[]
): TestOrphanEntry[] {
  const knownSourceFiles = new Set<string>();
  for (const d of detectors) {
    if (d.source_file) knownSourceFiles.add(d.source_file.toLowerCase().replace(/\\/g, '/'));
  }
  const orphans: TestOrphanEntry[] = [];
  for (const t of inventory.test_files) {
    if (!t.target_module) continue;
    const tm = t.target_module.toLowerCase().replace(/\\/g, '/');
    // Only flag deterministic-subtree imports as orphans — generic imports
    // (e.g. `@/lib/prisma`) are not detector-targets.
    if (!tm.includes('/deterministic/') && !tm.includes('deterministic/')) continue;
    if (![...knownSourceFiles].some((sf) => tm.endsWith(sf))) {
      orphans.push({
        test_file: t.file,
        target_module: t.target_module,
        reason: 'target imports deterministic/* path that no inventory-detector matches',
      });
    }
  }
  return orphans;
}

// =============================================================================
// Markdown rendering
// =============================================================================

export function renderMarkdown(
  inventory: InventoryJson,
  detectors: DetectorRow[],
  matches: CoverageMatch[],
  orphans: TestOrphanEntry[]
): string {
  const totalDetectors = detectors.length;
  const tested = matches.filter((m) => m.test_files.length > 0).length;
  const untested = matches.filter((m) => m.test_files.length === 0);
  const coveragePct = totalDetectors === 0 ? 0 : (tested / totalDetectors) * 100;

  const out: string[] = [];
  out.push('# TEST-COVERAGE.md');
  out.push('');
  out.push(
    '> Auto-generated by `npm run test-coverage-map`. Do not edit manually. ' +
      `Last-regenerated: ${new Date().toISOString()}.`
  );
  out.push('');
  out.push(
    'Maps each detector (modules / aggregators / classifiers / custom-functions / yaml-rules) to its covering test-files. Heuristic match: import-target ends with detector source-file, OR detector source-file basename matches test target_module basename, OR describe-block title contains a detector search-key (≥4 chars).'
  );
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push(`- Total detectors (incl. yaml-rules): **${totalDetectors}**`);
  out.push(`- Total test-files: **${inventory.test_files.length}**`);
  out.push(`- Detectors with ≥1 test-file: **${tested}** (${coveragePct.toFixed(1)}%)`);
  out.push(`- Untested detectors: **${untested.length}**`);
  out.push(`- Test-orphans: **${orphans.length}**`);
  out.push('');

  // ---------------------------------------------------------------------------
  // Per-detector table (file/walker/classifier/function rows only — yaml-rules
  // collapse into per-yaml summary because emitting all 354 individually would
  // bloat the markdown beyond usefulness).
  // ---------------------------------------------------------------------------
  out.push('## Per-detector coverage (file-level)');
  out.push('');
  out.push('| detector_id | category | source_file | test_files |');
  out.push('|---|---|---|---|');
  for (const m of matches.filter((row) => row.category !== 'yaml-rule')) {
    const tests =
      m.test_files.length === 0 ? '—' : m.test_files.map((f) => `\`${path.basename(f)}\``).join(', ');
    out.push(
      `| \`${m.detector_id}\` | ${m.category} | \`${m.source_file ?? '—'}\` | ${tests} |`
    );
  }
  out.push('');

  // YAML-rule coverage rolled up per yaml-file
  out.push('## Per-yaml rule coverage (rolled up)');
  out.push('');
  const yamlRules = matches.filter((m) => m.category === 'yaml-rule');
  const perYaml = new Map<string, { total: number; covered: number }>();
  for (const m of yamlRules) {
    const f = m.source_file ?? 'unknown';
    let entry = perYaml.get(f);
    if (!entry) {
      entry = { total: 0, covered: 0 };
      perYaml.set(f, entry);
    }
    entry.total++;
    if (m.test_files.length > 0) entry.covered++;
  }
  out.push('| yaml-file | total rules | covered | coverage% |');
  out.push('|---|---:|---:|---:|');
  for (const [yamlFile, stats] of [...perYaml.entries()].sort()) {
    const pct = stats.total === 0 ? 0 : (stats.covered / stats.total) * 100;
    out.push(`| \`${yamlFile}\` | ${stats.total} | ${stats.covered} | ${pct.toFixed(1)}% |`);
  }
  out.push('');

  // ---------------------------------------------------------------------------
  // Untested detectors
  // ---------------------------------------------------------------------------
  out.push(`## Untested detectors (${untested.length})`);
  out.push('');
  if (untested.length === 0) {
    out.push('_None._');
  } else {
    out.push('| detector_id | category | source_file |');
    out.push('|---|---|---|');
    for (const m of untested) {
      out.push(`| \`${m.detector_id}\` | ${m.category} | \`${m.source_file ?? '—'}\` |`);
    }
  }
  out.push('');

  // ---------------------------------------------------------------------------
  // Test-orphans
  // ---------------------------------------------------------------------------
  out.push(`## Test-orphans (${orphans.length})`);
  out.push('');
  out.push('Tests whose `target_module` import points into `deterministic/*` but does not match any current inventory detector. Cleanup-candidate.');
  out.push('');
  if (orphans.length === 0) {
    out.push('_None._');
  } else {
    out.push('| test_file | target_module | reason |');
    out.push('|---|---|---|');
    for (const o of orphans) {
      out.push(`| \`${o.test_file}\` | \`${o.target_module}\` | ${o.reason} |`);
    }
  }
  out.push('');

  return out.join('\n');
}

// =============================================================================
// CLI entry-point
// =============================================================================

export async function main(): Promise<void> {
  if (!fs.existsSync(INVENTORY_PATH)) {
    throw new Error(`inventory.json not found at ${INVENTORY_PATH}. Run \`npm run build-inventory\` first.`);
  }
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf-8')) as InventoryJson;

  const detectors = buildDetectorRows(inventory);
  const matches = matchTestsToDetectors(detectors, inventory.test_files);
  const orphans = detectTestOrphans(inventory, detectors);

  const md = renderMarkdown(inventory, detectors, matches, orphans);
  fs.writeFileSync(OUT_PATH, md, 'utf-8');
  console.log(
    `[test-coverage-map] wrote ${path.relative(REPO_ROOT, OUT_PATH)} ` +
      `(${detectors.length} detectors, ${matches.filter((m) => m.test_files.length > 0).length} tested, ${orphans.length} orphans)`
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
