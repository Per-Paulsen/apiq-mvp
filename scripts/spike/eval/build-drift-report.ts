#!/usr/bin/env tsx
/**
 * Welle I — I3b Drift-Report builder.
 *
 * Reads `inventory.json` (I1) + `coverage.json` (I2) + `patterns.json` +
 * `CLAUDE.md` + `specs/big-spec-architecture-spike-stage-a-restwork-plan.md`
 * (parsed for concrete numeric claims) and emits `DRIFT-REPORT.md`.
 *
 * Five drift-classes per spec §10a:
 *   1. substrate-only     — patternId in patterns.json but 0 detectors handle it
 *   2. dead-code-suspicion — detector exists but fires on 0 of 4 specs
 *   3. orphan-module      — file exists in modules/ but wired_in_index === false
 *   4. function-binding-broken — yaml-rule references function-name not exported in APIQ_CUSTOM_FUNCTIONS
 *   5. claimed-vs-actual-mismatch — Plan-Doc / CLAUDE.md numeric claims don't match inventory.totals
 *
 * Drift-FIXES are out-of-scope for this builder — it only REPORTS.
 *
 * CLI: `npm run drift-report`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  InventoryJson,
  CoverageJson,
} from './inventory-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const INVENTORY_PATH = path.resolve(__dirname, 'inventory.json');
const COVERAGE_PATH = path.resolve(__dirname, 'coverage.json');
const PATTERNS_PATH = path.resolve(__dirname, '..', 'data', 'patterns.json');
const SPECTRAL_RUNNER_PATH = path.resolve(
  __dirname,
  '..',
  'deterministic',
  'infra',
  'spectral-runner.ts'
);
const CLAUDE_MD_PATH = path.resolve(REPO_ROOT, 'CLAUDE.md');
const PLAN_DOC_PATH = path.resolve(
  REPO_ROOT,
  'specs',
  'big-spec-architecture-spike-stage-a-restwork-plan.md'
);
const OUT_PATH = path.resolve(__dirname, 'DRIFT-REPORT.md');

// =============================================================================
// Patterns.json minimal shape (only fields we read)
// =============================================================================

interface PatternEntry {
  patternId?: string;
  id?: string;
  description?: string;
  isStageATerritory?: boolean;
}

// =============================================================================
// Drift-class detection (pure helpers; exported for tests)
// =============================================================================

export interface SubstrateOnlyEntry {
  patternId: string;
  description_excerpt: string;
}

export function detectSubstrateOnly(
  patterns: PatternEntry[],
  inventory: InventoryJson
): SubstrateOnlyEntry[] {
  const handled = new Set<string>();
  for (const r of inventory.yaml_rules) {
    const ids = Array.isArray(r.pattern_id) ? r.pattern_id : r.pattern_id ? [r.pattern_id] : [];
    for (const id of ids) handled.add(id);
  }
  for (const m of [...inventory.modules, ...inventory.aggregators, ...inventory.classifiers]) {
    for (const id of m.pattern_ids_handled) handled.add(id);
  }
  const result: SubstrateOnlyEntry[] = [];
  for (const p of patterns) {
    const pid = p.patternId ?? p.id;
    if (!pid) continue;
    if (handled.has(pid)) continue;
    if (p.isStageATerritory === false) continue; // explicitly Stage-B → not drift
    result.push({
      patternId: pid,
      description_excerpt: (p.description ?? '').slice(0, 100),
    });
  }
  return result;
}

export interface DeadCodeEntry {
  detector_id: string;
  hint: string;
}

export function detectDeadCode(
  inventory: InventoryJson,
  coverage: CoverageJson | null
): DeadCodeEntry[] {
  if (!coverage) return [];
  // Build set of detectors that DO fire from coverage.untested_detectors —
  // coverage already pre-computed this set.
  const result: DeadCodeEntry[] = [];
  for (const detectorId of coverage.untested_detectors) {
    // Heuristic for hint: if detectorId contains 'webhook' / 'oauth2' / 'admin'
    // it's likely missing-fixture (no spec exercises it); else broken-detection.
    const hint = /(webhook|oauth2|admin|sla4oai|brownout|arazzo|capability-discovery|api-catalog|protected-resource)/i.test(
      detectorId
    )
      ? 'missing-fixture (no reference-spec exercises this detector-shape)'
      : 'broken-detection (likely)';
    result.push({ detector_id: detectorId, hint });
  }
  return result.sort((a, b) => a.detector_id.localeCompare(b.detector_id));
}

export interface OrphanModuleEntry {
  category: 'modules' | 'aggregators' | 'classifiers';
  file: string;
  exports: string[];
}

export function detectOrphans(inventory: InventoryJson): OrphanModuleEntry[] {
  const result: OrphanModuleEntry[] = [];
  // Helper files (basename starts with `_`, e.g. `_shared.ts`, `_metadata.ts`)
  // are intentionally not wired in index.ts — they are imported directly by
  // sibling-files. Skipping them keeps the orphan-list focused on real
  // detector-orphans (like spec-diff).
  const isHelper = (file: string): boolean => path.basename(file).startsWith('_');
  for (const m of inventory.modules) {
    if (!m.wired_in_index && !isHelper(m.file)) {
      result.push({ category: 'modules', file: m.file, exports: m.exports });
    }
  }
  for (const a of inventory.aggregators) {
    if (!a.wired_in_index && !isHelper(a.file)) {
      result.push({ category: 'aggregators', file: a.file, exports: a.exports });
    }
  }
  for (const c of inventory.classifiers) {
    if (!c.wired_in_index && !isHelper(c.file)) {
      result.push({ category: 'classifiers', file: c.file, exports: c.exports });
    }
  }
  return result;
}

export interface FunctionBindingBrokenEntry {
  yaml_file: string;
  rule_name: string;
  function_key: string;
}

/**
 * Parse the `APIQ_CUSTOM_FUNCTIONS` map from spectral-runner.ts source.
 *
 * We read the const-block delimiters and extract each kebab-case key on the
 * left of `:` inside the object literal.  This is intentionally permissive —
 * the goal is to mirror Spectral's runtime resolution, which falls through to
 * built-in spectral-functions (length, truthy, falsy, pattern, alphabetical,
 * casing, schema, undefined, …).  We also include those built-ins as known.
 */
export function parseRegisteredFunctionKeys(spectralRunnerSource: string): Set<string> {
  const known = new Set<string>();
  // Built-in @stoplight/spectral-functions (kept in sync with `spectralFunctions`
  // re-export; superset is harmless because the goal is to filter false-positives).
  const builtins = [
    'alphabetical',
    'casing',
    'defined',
    'enumeration',
    'falsy',
    'length',
    'pattern',
    'schema',
    'schema-path',
    'truthy',
    'undefined',
    'unreferencedReusableObject',
    'xor',
    'or',
  ];
  for (const k of builtins) known.add(k);

  // Find the APIQ_CUSTOM_FUNCTIONS block.
  const startIdx = spectralRunnerSource.indexOf('APIQ_CUSTOM_FUNCTIONS');
  if (startIdx === -1) return known;
  const braceOpen = spectralRunnerSource.indexOf('{', startIdx);
  if (braceOpen === -1) return known;

  // Walk forward, tracking brace-depth, until matching close.
  let depth = 0;
  let end = -1;
  for (let i = braceOpen; i < spectralRunnerSource.length; i++) {
    const ch = spectralRunnerSource[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return known;
  const body = spectralRunnerSource.slice(braceOpen + 1, end);

  // Match keys: 'kebab-case-name': or "kebab-case-name":
  const keyRegex = /['"]([a-z][a-z0-9-]+)['"]\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = keyRegex.exec(body)) !== null) {
    known.add(m[1]);
  }
  return known;
}

export function detectFunctionBindingBroken(
  inventory: InventoryJson,
  knownFunctionKeys: Set<string>
): FunctionBindingBrokenEntry[] {
  const result: FunctionBindingBrokenEntry[] = [];
  for (const r of inventory.yaml_rules) {
    if (!r.function) continue;
    if (knownFunctionKeys.has(r.function)) continue;
    result.push({ yaml_file: r.file, rule_name: r.name, function_key: r.function });
  }
  return result;
}

// =============================================================================
// Drift-class 5 — claimed-vs-actual-mismatch
// =============================================================================

export interface NumericClaim {
  source_file: string;
  line: number;
  raw: string;
  metric: keyof InventoryJson['totals'] | 'patterns_substrate.total' | 'tests_pass';
  claimed: number;
}

export interface ClaimComparison extends NumericClaim {
  actual: number | 'unknown';
  status: 'match' | 'drift' | 'unknown';
}

/**
 * Match patterns like "354 yaml-rules", "127 functions", "972 patterns",
 * "25 walkers", "15 module-classes", "4 classifiers", "63 test-files",
 * "Tests: 2230 pass", "2230 tests pass".
 */
export function extractNumericClaims(content: string, sourceFile: string): NumericClaim[] {
  const claims: NumericClaim[] = [];
  const lines = content.split('\n');
  const patterns: Array<{ regex: RegExp; metric: NumericClaim['metric'] }> = [
    { regex: /\b(\d{2,5})\s+yaml[- ]rules?\b/gi, metric: 'yaml_rules' },
    { regex: /\b(\d{2,5})\s+(?:active\s+)?rules?\s+across\s+\d+\s+yamls?\b/gi, metric: 'yaml_rules' },
    { regex: /\b(\d{1,4})\s+(?:custom[- ])?functions?\b/gi, metric: 'custom_functions' },
    { regex: /\b(\d{1,4})\s+walkers?\b/gi, metric: 'aggregators' },
    { regex: /\b(\d{1,4})\s+aggregators?\b/gi, metric: 'aggregators' },
    { regex: /\b(\d{1,4})\s+module[- ]classes?\b/gi, metric: 'modules' },
    { regex: /\b(\d{1,4})\s+classifiers?\b/gi, metric: 'classifiers' },
    { regex: /\b(\d{1,4})\s+test[- ]files?\b/gi, metric: 'test_files' },
    { regex: /\b(\d{2,5})\s+patterns\b(?!\s+(?:in|across))/gi, metric: 'patterns_substrate.total' },
    { regex: /\bTests?:\s+(\d{3,5})\s+pass\b/gi, metric: 'tests_pass' },
    { regex: /\b(\d{3,5})\s+tests?\s+pass\b/gi, metric: 'tests_pass' },
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { regex, metric } of patterns) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(line)) !== null) {
        const claimed = Number.parseInt(m[1], 10);
        if (!Number.isFinite(claimed)) continue;
        // Skip absurdly-low claims that are clearly not the totals (e.g. "1 walker").
        if (claimed < 2) continue;
        claims.push({
          source_file: sourceFile,
          line: i + 1,
          raw: line.trim().slice(0, 200),
          metric,
          claimed,
        });
      }
    }
  }
  return claims;
}

export function compareClaims(
  claims: NumericClaim[],
  inventory: InventoryJson
): ClaimComparison[] {
  const totals = inventory.totals;
  const lookup: Record<NumericClaim['metric'], number | 'unknown'> = {
    yaml_rules: totals.yaml_rules,
    modules: totals.modules,
    aggregators: totals.aggregators,
    classifiers: totals.classifiers,
    custom_functions: totals.custom_functions,
    test_files: totals.test_files,
    'patterns_substrate.total': inventory.patterns_substrate.total,
    tests_pass: 'unknown', // requires running the test-suite; out-of-scope here
  };
  return claims.map((c) => {
    const actual = lookup[c.metric];
    let status: ClaimComparison['status'];
    if (actual === 'unknown') status = 'unknown';
    else if (actual === c.claimed) status = 'match';
    else status = 'drift';
    return { ...c, actual, status };
  });
}

// =============================================================================
// Markdown rendering
// =============================================================================

export function renderMarkdown(
  inventory: InventoryJson,
  coverage: CoverageJson | null,
  substrateOnly: SubstrateOnlyEntry[],
  deadCode: DeadCodeEntry[],
  orphans: OrphanModuleEntry[],
  fnBroken: FunctionBindingBrokenEntry[],
  claims: ClaimComparison[]
): string {
  const out: string[] = [];
  out.push('# DRIFT-REPORT.md');
  out.push('');
  out.push(
    '> Auto-generated by `npm run drift-report`. Do not edit manually. ' +
      `Last-regenerated: ${new Date().toISOString()}.`
  );
  out.push('');
  out.push(
    'Five drift-classes per Welle-I spec §10a. Drift-fixes are out-of-scope for this report — they are addressed in a separate resolution-pass after the Welle-I main commit.'
  );
  out.push('');
  if (!coverage) {
    out.push('> **Note:** `coverage.json` not yet available — drift-class-2 (dead-code-suspicion) is empty.');
    out.push('');
  }

  // Summary table
  const claimDriftCount = claims.filter((c) => c.status === 'drift').length;
  out.push('## Summary');
  out.push('');
  out.push('| Drift-class | Count |');
  out.push('|---|---:|');
  out.push(`| 1. substrate-only | ${substrateOnly.length} |`);
  out.push(`| 2. dead-code-suspicion | ${deadCode.length} |`);
  out.push(`| 3. orphan-module | ${orphans.length} |`);
  out.push(`| 4. function-binding-broken | ${fnBroken.length} |`);
  out.push(`| 5. claimed-vs-actual-mismatch | ${claimDriftCount} |`);
  out.push('');

  // ---------------------------------------------------------------------------
  // Class 1
  // ---------------------------------------------------------------------------
  out.push(`## Drift-class 1 — substrate-only (${substrateOnly.length})`);
  out.push('');
  out.push('Pattern is in `patterns.json` but no detector handles it. Either Stage-B-territory or implementation-gap.');
  out.push('');
  if (substrateOnly.length === 0) {
    out.push('_None._');
  } else {
    out.push('| patternId | description_excerpt |');
    out.push('|---|---|');
    for (const e of substrateOnly.slice(0, 200)) {
      const desc = e.description_excerpt.replace(/\|/g, '\\|');
      out.push(`| \`${e.patternId}\` | ${desc} |`);
    }
    if (substrateOnly.length > 200) {
      out.push('');
      out.push(`_…${substrateOnly.length - 200} more entries truncated._`);
    }
  }
  out.push('');

  // ---------------------------------------------------------------------------
  // Class 2
  // ---------------------------------------------------------------------------
  out.push(`## Drift-class 2 — dead-code-suspicion (${deadCode.length})`);
  out.push('');
  out.push('Detector exists per inventory + fires on 0 of 4 reference-specs per coverage. Either missing-fixture or broken-detection.');
  out.push('');
  if (deadCode.length === 0) {
    out.push('_None._');
  } else {
    out.push('| detector_id | hint |');
    out.push('|---|---|');
    for (const e of deadCode) {
      out.push(`| \`${e.detector_id}\` | ${e.hint} |`);
    }
  }
  out.push('');

  // ---------------------------------------------------------------------------
  // Class 3
  // ---------------------------------------------------------------------------
  out.push(`## Drift-class 3 — orphan-module (${orphans.length})`);
  out.push('');
  out.push('File exists in `modules/`, `aggregators/`, or `classifiers/` but is NOT imported in the corresponding `index.ts`. Either WIP or intentionally-orphaned.');
  out.push('');
  if (orphans.length === 0) {
    out.push('_None._');
  } else {
    out.push('| category | file | exports |');
    out.push('|---|---|---|');
    for (const e of orphans) {
      out.push(`| ${e.category} | \`${e.file}\` | ${e.exports.join(', ')} |`);
    }
  }
  out.push('');

  // ---------------------------------------------------------------------------
  // Class 4
  // ---------------------------------------------------------------------------
  out.push(`## Drift-class 4 — function-binding-broken (${fnBroken.length})`);
  out.push('');
  out.push('YAML-rule references a `function:` key that is NOT exported in `APIQ_CUSTOM_FUNCTIONS` (and not a built-in spectral-function).  Such rules will fail to evaluate at runtime.');
  out.push('');
  if (fnBroken.length === 0) {
    out.push('_None._');
  } else {
    out.push('| yaml_file | rule_name | broken function-key |');
    out.push('|---|---|---|');
    for (const e of fnBroken) {
      out.push(`| \`${e.yaml_file}\` | \`${e.rule_name}\` | \`${e.function_key}\` |`);
    }
  }
  out.push('');

  // ---------------------------------------------------------------------------
  // Class 5
  // ---------------------------------------------------------------------------
  out.push(`## Drift-class 5 — claimed-vs-actual-mismatch (${claimDriftCount} drift, ${claims.length} claims scanned)`);
  out.push('');
  out.push('Numeric claims in `CLAUDE.md` and the Plan-Doc compared against `inventory.json.totals`. `tests_pass` claims are reported but cannot be verified without running the suite (status = `unknown`).');
  out.push('');
  if (claims.length === 0) {
    out.push('_No numeric claims detected._');
  } else {
    out.push('| source | line | metric | claimed | actual | status | raw |');
    out.push('|---|---:|---|---:|---:|---|---|');
    for (const c of claims) {
      const raw = c.raw.replace(/\|/g, '\\|');
      out.push(
        `| \`${c.source_file}\` | ${c.line} | \`${c.metric}\` | ${c.claimed} | ${c.actual} | ${c.status} | ${raw} |`
      );
    }
  }
  out.push('');

  return out.join('\n');
}

// =============================================================================
// CLI entry-point
// =============================================================================

function loadJsonOrThrow<T>(p: string, label: string): T {
  if (!fs.existsSync(p)) {
    throw new Error(`${label} not found at ${p}.`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

function loadJsonOrNull<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

function loadFileOrEmpty(p: string): string {
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf-8');
}

export async function main(): Promise<void> {
  const inventory = loadJsonOrThrow<InventoryJson>(INVENTORY_PATH, 'inventory.json');
  const coverage = loadJsonOrNull<CoverageJson>(COVERAGE_PATH);
  const patterns = loadJsonOrNull<PatternEntry[]>(PATTERNS_PATH) ?? [];
  const spectralRunnerSrc = loadFileOrEmpty(SPECTRAL_RUNNER_PATH);
  const claudeMd = loadFileOrEmpty(CLAUDE_MD_PATH);
  const planDoc = loadFileOrEmpty(PLAN_DOC_PATH);

  const knownFnKeys = parseRegisteredFunctionKeys(spectralRunnerSrc);

  const substrateOnly = detectSubstrateOnly(patterns, inventory);
  const deadCode = detectDeadCode(inventory, coverage);
  const orphans = detectOrphans(inventory);
  const fnBroken = detectFunctionBindingBroken(inventory, knownFnKeys);

  const claims = [
    ...extractNumericClaims(claudeMd, 'CLAUDE.md'),
    ...extractNumericClaims(planDoc, path.relative(REPO_ROOT, PLAN_DOC_PATH).replace(/\\/g, '/')),
  ];
  const claimsCompared = compareClaims(claims, inventory);

  const md = renderMarkdown(
    inventory,
    coverage,
    substrateOnly,
    deadCode,
    orphans,
    fnBroken,
    claimsCompared
  );
  fs.writeFileSync(OUT_PATH, md, 'utf-8');
  console.log(
    `[drift-report] wrote ${path.relative(REPO_ROOT, OUT_PATH)} ` +
      `(class-1=${substrateOnly.length}, class-2=${deadCode.length}, class-3=${orphans.length}, ` +
      `class-4=${fnBroken.length}, class-5=${claimsCompared.filter((c) => c.status === 'drift').length})`
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
