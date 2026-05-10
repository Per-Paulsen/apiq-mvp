#!/usr/bin/env tsx
/**
 * Welle I — I1: build-inventory.ts (static-analysis extraction).
 *
 * Scans the deterministic-layer codebase and produces two artifacts:
 *
 *   - `scripts/spike/eval/inventory.json` (gitignored, regenerable)
 *   - `scripts/spike/eval/INVENTORY.md`   (committed, auto-generated view)
 *
 * Output schema (CANONICAL — Tasks I3/I4/I5 consume `inventory.json`):
 * see `InventoryJson` interface below.
 *
 * Scope:
 *   1. YAML-rules across all `scripts/spike/deterministic/rules/*.yaml`.
 *   2. Module-classes in `scripts/spike/deterministic/modules/*.ts`.
 *   3. Walkers/aggregators in `scripts/spike/deterministic/aggregators/*.ts`.
 *   4. Classifiers in `scripts/spike/deterministic/classifiers/*.ts`.
 *   5. Custom-functions in `scripts/spike/deterministic/spectral-functions/`
 *      (incl. `_helpers/`).
 *   6. Test-files in `scripts/spike/__tests__/**` + `src/__tests__/**`.
 *   7. Patterns.json substrate (counts only — not enumerated).
 *
 * Usage:
 *   npx tsx scripts/spike/eval/build-inventory.ts
 *   npm run build-inventory
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

// =============================================================================
// Paths
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SPIKE_ROOT = path.resolve(__dirname, '..');
const DET_ROOT = path.join(SPIKE_ROOT, 'deterministic');
const RULES_DIR = path.join(DET_ROOT, 'rules');
const MODULES_DIR = path.join(DET_ROOT, 'modules');
const AGGREGATORS_DIR = path.join(DET_ROOT, 'aggregators');
const CLASSIFIERS_DIR = path.join(DET_ROOT, 'classifiers');
const FUNCTIONS_DIR = path.join(DET_ROOT, 'spectral-functions');
const FUNCTIONS_HELPERS_DIR = path.join(FUNCTIONS_DIR, '_helpers');
const SPIKE_TESTS_DIR = path.join(SPIKE_ROOT, '__tests__');
const SRC_TESTS_DIR = path.join(REPO_ROOT, 'src', '__tests__');
const PATTERNS_JSON = path.join(SPIKE_ROOT, 'data', 'patterns.json');
const SPECTRAL_RUNNER_PATH = path.join(DET_ROOT, 'infra', 'spectral-runner.ts');

const OUT_JSON = path.join(__dirname, 'inventory.json');
const OUT_MD = path.join(__dirname, 'INVENTORY.md');

// =============================================================================
// Output schema (CANONICAL)
// =============================================================================

export interface InventoryYamlRule {
  name: string;
  file: string; // relative path from repo root
  pattern_id: string | string[];
  severity: string;
  recommended: boolean;
  given: string | string[];
  function: string | null;
  apiq_meta: Record<string, unknown>;
}

export interface InventoryDetector {
  file: string;
  exports: string[];
  pattern_ids_handled: string[];
  wired_in_index: boolean;
}

export interface InventoryFunction {
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
  /** Total registered functions in `APIQ_CUSTOM_FUNCTIONS` (count of callable
   *  functions, NOT count of source-files). For per-file details see
   *  `custom_functions[]`. */
  custom_functions: number;
  /** Number of `*-functions.ts` source-files in `spectral-functions/` (incl.
   *  `_helpers/`). Each file groups multiple registered callables. */
  custom_function_files: number;
  test_files: number;
}

export interface InventoryJson {
  generated_at: string;
  yaml_rules: InventoryYamlRule[];
  modules: InventoryDetector[];
  aggregators: InventoryDetector[];
  classifiers: InventoryDetector[];
  custom_functions: InventoryFunction[];
  test_files: InventoryTestFile[];
  patterns_substrate: InventoryPatternsSubstrate;
  totals: InventoryTotals;
}

// =============================================================================
// Helpers
// =============================================================================

function relFromRoot(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
}

function listTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => path.join(dir, f))
    .sort();
}

function listTestFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTestFilesRecursive(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

function readText(absPath: string): string {
  return fs.readFileSync(absPath, 'utf8');
}

/**
 * Extract named exports from a TypeScript source file via regex.
 * Handles: `export const X = ...`, `export function X(...)`,
 * `export async function X`, `export class X`, `export interface X`,
 * `export type X`, `export { A, B as C }`, `export default ...` (returns 'default').
 *
 * Skips multi-line continuations of types/interfaces. Sufficient for inventory
 * purposes — we don't need a full TS-AST here.
 */
function extractNamedExports(source: string): string[] {
  const out = new Set<string>();
  const lines = source.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*')) continue;

    let m: RegExpMatchArray | null;
    m = line.match(
      /^export\s+(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/
    );
    if (m) {
      out.add(m[1]);
      continue;
    }

    m = line.match(/^export\s+default\b/);
    if (m) {
      out.add('default');
      continue;
    }

    m = line.match(/^export\s+\{([^}]+)\}/);
    if (m) {
      for (const part of m[1].split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const asMatch = trimmed.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
        if (asMatch) {
          out.add(asMatch[2] ?? asMatch[1]);
        }
      }
    }
  }
  return [...out].sort();
}

/**
 * Extract patternIds referenced in source via regex
 *   `patternId: 'XXX'`, `patternId: "XXX"`, `patternId = 'XXX'`.
 * Captures the literal string. Returns sorted unique list.
 */
function extractPatternIds(source: string): string[] {
  const out = new Set<string>();
  const re = /patternId\s*[:=]\s*['"]([A-Za-z0-9_-]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.add(m[1]);
  }
  return [...out].sort();
}

/**
 * Heuristic check: does the given module/aggregator/classifier file appear in
 * the corresponding `index.ts` (via `import ... from './basename.js'`)?
 *
 * Special case for classifiers: since the project lacks `classifiers/index.ts`,
 * we treat them as wired if either `modules/index.ts` OR `aggregators/index.ts`
 * imports the file (path is `from '../classifiers/<basename>.js'`).
 */
function isFileWiredInIndex(
  detectorFile: string,
  indexPath: string,
  alternateIndexPaths: string[] = []
): boolean {
  const basename = path.basename(detectorFile, '.ts');
  const candidates = [indexPath, ...alternateIndexPaths].filter((p) => fs.existsSync(p));
  if (candidates.length === 0) return false;
  for (const candidate of candidates) {
    const text = readText(candidate);
    // import from './<basename>.js' OR '../classifiers/<basename>.js' etc.
    const re = new RegExp(`from\\s+['"][^'"]*\\b${basename}\\.js['"]`);
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * Convert a kebab-case function-name to camelCase (the export-name convention
 * in the spectral-functions/*.ts files).
 *   'multi-lang-reserved-keywords' → 'multiLangReservedKeywords'
 */
function kebabToCamel(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Inverse: 'multiLangReservedKeywords' → 'multi-lang-reserved-keywords'.
 * Used to cross-reference function-exports back to YAML `function:` fields.
 */
function camelToKebab(camel: string): string {
  return camel.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// =============================================================================
// Sub-extract: YAML rules
// =============================================================================

interface YamlThen {
  function?: string;
  functionOptions?: unknown;
  field?: string;
}

interface YamlRuleNode {
  description?: string;
  message?: string;
  severity?: string | number;
  recommended?: boolean;
  given?: string | string[];
  then?: YamlThen | YamlThen[];
  formats?: string[];
  resolved?: boolean;
  'apiq-meta'?: Record<string, unknown>;
}

interface YamlRuleset {
  rules: Record<string, YamlRuleNode>;
}

function extractYamlRules(): InventoryYamlRule[] {
  if (!fs.existsSync(RULES_DIR)) return [];
  const yamlFiles = fs
    .readdirSync(RULES_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .sort();
  const out: InventoryYamlRule[] = [];
  for (const file of yamlFiles) {
    const abs = path.join(RULES_DIR, file);
    const text = readText(abs);
    let parsed: YamlRuleset;
    try {
      parsed = YAML.parse(text) as YamlRuleset;
    } catch (err) {
      console.warn(
        `[inventory] failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    if (!parsed?.rules) continue;
    for (const [name, rule] of Object.entries(parsed.rules)) {
      const meta = rule['apiq-meta'] ?? {};
      // pattern-id may be camelCase `patternId` (legacy) or kebab `pattern-id`.
      const rawPatternId =
        (meta as Record<string, unknown>)['pattern-id'] ??
        (meta as Record<string, unknown>)['patternId'] ??
        '';
      const patternId =
        Array.isArray(rawPatternId)
          ? (rawPatternId as unknown[]).map((v) => String(v))
          : String(rawPatternId ?? '');

      // function: from .then.function (or .then[*].function for arrays)
      let fn: string | null = null;
      if (rule.then) {
        const thenArr = Array.isArray(rule.then) ? rule.then : [rule.then];
        for (const t of thenArr) {
          if (t?.function) {
            fn = t.function;
            break;
          }
        }
      }

      out.push({
        name,
        file: relFromRoot(abs),
        pattern_id: patternId,
        severity: rule.severity != null ? String(rule.severity) : 'warn',
        recommended: rule.recommended !== false, // default true per Spectral
        given: rule.given ?? '',
        function: fn,
        apiq_meta: meta as Record<string, unknown>,
      });
    }
  }
  return out;
}

// =============================================================================
// Sub-extract: detectors (modules / aggregators / classifiers)
// =============================================================================

function extractDetectors(
  dir: string,
  indexPath: string,
  alternateIndexPaths: string[] = []
): InventoryDetector[] {
  const files = listTsFiles(dir).filter((f) => path.basename(f) !== 'index.ts');
  const out: InventoryDetector[] = [];
  for (const file of files) {
    const text = readText(file);
    out.push({
      file: relFromRoot(file),
      exports: extractNamedExports(text),
      pattern_ids_handled: extractPatternIds(text),
      wired_in_index: isFileWiredInIndex(file, indexPath, alternateIndexPaths),
    });
  }
  return out;
}

// =============================================================================
// Sub-extract: APIQ_CUSTOM_FUNCTIONS registry (ground-truth count)
// =============================================================================

/**
 * Parse `spectral-runner.ts` and extract the kebab-case keys of all entries
 * registered in `APIQ_CUSTOM_FUNCTIONS`. This is the authoritative count of
 * Spectral-callable functions (CLAUDE.md says "116", current is 127 post-D2).
 */
function extractRegisteredFunctionNames(): string[] {
  if (!fs.existsSync(SPECTRAL_RUNNER_PATH)) return [];
  const text = readText(SPECTRAL_RUNNER_PATH);
  const startIdx = text.indexOf('APIQ_CUSTOM_FUNCTIONS');
  if (startIdx === -1) return [];
  // Find the `{` that opens the registry, then the matching `}`.
  const braceOpen = text.indexOf('{', startIdx);
  if (braceOpen === -1) return [];
  let depth = 0;
  let braceClose = -1;
  for (let i = braceOpen; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        braceClose = i;
        break;
      }
    }
  }
  if (braceClose === -1) return [];
  const body = text.slice(braceOpen + 1, braceClose);
  const out = new Set<string>();
  // Match keys: 'kebab-name': or "kebab-name":
  const re = /['"]([a-z0-9][a-z0-9-]*[a-z0-9])['"]\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.add(m[1]);
  }
  return [...out].sort();
}

// =============================================================================
// Sub-extract: custom-functions
// =============================================================================

function extractCustomFunctions(
  yamlRules: InventoryYamlRule[],
  registeredKebabNames: ReadonlySet<string> = new Set()
): InventoryFunction[] {
  // Build set of kebab function-names referenced by ANY YAML rule.
  // Map: kebab-name → list of yaml-rule names that reference it.
  const referencedBy: Map<string, string[]> = new Map();
  for (const rule of yamlRules) {
    if (!rule.function) continue;
    const list = referencedBy.get(rule.function) ?? [];
    list.push(rule.name);
    referencedBy.set(rule.function, list);
  }

  const files: string[] = [];
  files.push(...listTsFiles(FUNCTIONS_DIR));
  files.push(...listTsFiles(FUNCTIONS_HELPERS_DIR));
  // Sort, dedupe.
  const sortedUnique = [...new Set(files)].sort();

  const out: InventoryFunction[] = [];
  for (const file of sortedUnique) {
    const basename = path.basename(file);
    if (basename === 'index.ts') continue;
    const text = readText(file);
    let exportsList = extractNamedExports(text);
    // Special-case `_metadata.ts` — exports FUNCTION_METADATA aggregator;
    // capture file but drop the export list per task brief.
    if (basename === '_metadata.ts') {
      exportsList = [];
    }
    // Cross-ref: for each exported camelCase fn, convert to kebab + look up in
    // referencedBy. Also tolerate exports that already match a kebab key
    // (defensive — real functions are camelCase).
    const usedBy = new Set<string>();
    for (const exp of exportsList) {
      const kebab = camelToKebab(exp);
      const refs = referencedBy.get(kebab);
      if (refs) for (const r of refs) usedBy.add(r);
      // Also try the export directly (in case it IS already kebab).
      const direct = referencedBy.get(exp);
      if (direct) for (const r of direct) usedBy.add(r);
    }
    out.push({
      file: relFromRoot(file),
      exports: exportsList,
      used_by_yaml_rules: [...usedBy].sort(),
    });
  }
  return out;
}

// =============================================================================
// Sub-extract: test-files
// =============================================================================

function extractTestFiles(): InventoryTestFile[] {
  const files = [
    ...listTestFilesRecursive(SPIKE_TESTS_DIR),
    ...listTestFilesRecursive(SRC_TESTS_DIR),
  ].sort();
  const out: InventoryTestFile[] = [];
  for (const file of files) {
    const text = readText(file);
    // test-count: count `it(` + `test(` (incl. `it.skip(`, `test.each(` etc.)
    const itCount = (text.match(/\bit(?:\.\w+)?\s*\(/g) ?? []).length;
    const testCount = (text.match(/\btest(?:\.\w+)?\s*\(/g) ?? []).length;
    // Avoid double-counting: `test` is the keyword, but `it` is the alias.
    // Prefer summing both — most test files use only one of them.
    const total = itCount + testCount;
    // describe titles
    const describes: string[] = [];
    const reDescribe = /\bdescribe(?:\.\w+)?\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = reDescribe.exec(text)) !== null) {
      describes.push(m[1]);
    }
    // target_module: first project-internal import (exclude node_modules)
    const importRe = /^import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/gm;
    let target: string | null = null;
    let im: RegExpExecArray | null;
    while ((im = importRe.exec(text)) !== null) {
      const spec = im[1];
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        target = spec;
        break;
      }
    }
    out.push({
      file: relFromRoot(file),
      target_module: target,
      test_count: total,
      describe_blocks: describes,
    });
  }
  return out;
}

// =============================================================================
// Sub-extract: patterns substrate
// =============================================================================

interface PatternEntry {
  patternId: string;
  lens?: string[];
  isStageATerritory?: boolean;
}

function extractPatternsSubstrate(): InventoryPatternsSubstrate {
  if (!fs.existsSync(PATTERNS_JSON)) {
    return { total: 0, by_lens: {}, stage_a_count: 0, stage_b_count: 0 };
  }
  const raw = readText(PATTERNS_JSON);
  let parsed: PatternEntry[];
  try {
    parsed = JSON.parse(raw) as PatternEntry[];
  } catch (err) {
    console.warn(
      `[inventory] failed to parse patterns.json: ${err instanceof Error ? err.message : String(err)}`
    );
    return { total: 0, by_lens: {}, stage_a_count: 0, stage_b_count: 0 };
  }
  const byLens: Record<string, number> = {};
  let stageA = 0;
  let stageB = 0;
  for (const p of parsed) {
    if (Array.isArray(p.lens)) {
      for (const lens of p.lens) {
        byLens[lens] = (byLens[lens] ?? 0) + 1;
      }
    }
    if (p.isStageATerritory === true) stageA++;
    else if (p.isStageATerritory === false) stageB++;
  }
  return {
    total: parsed.length,
    by_lens: byLens,
    stage_a_count: stageA,
    stage_b_count: stageB,
  };
}

// =============================================================================
// Markdown rendering
// =============================================================================

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function shortGiven(g: string | string[]): string {
  const s = Array.isArray(g) ? g.join(' | ') : g;
  if (s.length <= 60) return s;
  return s.slice(0, 57) + '...';
}

function renderMarkdown(inv: InventoryJson): string {
  const lines: string[] = [];

  lines.push('# Inventory — apiq deterministic-layer capability map');
  lines.push('');
  lines.push(
    '> **Auto-generated by `npm run build-inventory`. Do not edit manually.**'
  );
  lines.push('>');
  lines.push(`> Last-regenerated: \`${inv.generated_at}\``);
  lines.push('>');
  lines.push(
    '> Run `npm run build-inventory` after any code-change to the `scripts/spike/deterministic/` subtree.'
  );
  lines.push('');

  // ---------- Totals ----------
  lines.push('## Totals');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| YAML-rules | ${inv.totals.yaml_rules} |`);
  lines.push(`| Module-classes | ${inv.totals.modules} |`);
  lines.push(`| Aggregators (walkers) | ${inv.totals.aggregators} |`);
  lines.push(`| Classifiers | ${inv.totals.classifiers} |`);
  lines.push(`| Custom-functions (registered) | ${inv.totals.custom_functions} |`);
  lines.push(`| Custom-function source-files | ${inv.totals.custom_function_files} |`);
  lines.push(`| Test-files | ${inv.totals.test_files} |`);
  lines.push(`| Patterns (substrate) | ${inv.patterns_substrate.total} |`);
  lines.push('');

  // ---------- YAML rules grouped by file ----------
  const yamlByFile = new Map<string, InventoryYamlRule[]>();
  for (const r of inv.yaml_rules) {
    const list = yamlByFile.get(r.file) ?? [];
    list.push(r);
    yamlByFile.set(r.file, list);
  }
  const sortedYamlFiles = [...yamlByFile.keys()].sort();
  lines.push(`## YAML Rules (${inv.totals.yaml_rules} total across ${sortedYamlFiles.length} yamls)`);
  lines.push('');
  for (const file of sortedYamlFiles) {
    const rules = yamlByFile.get(file)!;
    lines.push(`### \`${file}\` (${rules.length} rules)`);
    lines.push('');
    lines.push('| name | pattern_id | severity | function |');
    lines.push('| --- | --- | --- | --- |');
    for (const r of rules) {
      const pid = Array.isArray(r.pattern_id) ? r.pattern_id.join(', ') : r.pattern_id;
      lines.push(
        `| \`${r.name}\` | ${pid || '_(none)_'} | ${r.severity} | ${
          r.function ? `\`${r.function}\`` : '_(builtin)_'
        } |`
      );
    }
    lines.push('');
  }

  // ---------- Module-classes / aggregators / classifiers ----------
  function renderDetectorSection(title: string, items: InventoryDetector[]): void {
    lines.push(`## ${title} (${items.length} files)`);
    lines.push('');
    lines.push('| file | wired | exports | pattern_ids_handled |');
    lines.push('| --- | :---: | --- | --- |');
    for (const d of items) {
      lines.push(
        `| \`${d.file}\` | ${d.wired_in_index ? 'yes' : '**NO**'} | ${
          d.exports.length ? d.exports.map((e) => `\`${e}\``).join(', ') : '_(none)_'
        } | ${
          d.pattern_ids_handled.length ? d.pattern_ids_handled.join(', ') : '_(none)_'
        } |`
      );
    }
    lines.push('');
  }
  renderDetectorSection('Module-classes', inv.modules);
  renderDetectorSection('Aggregators (walkers)', inv.aggregators);
  renderDetectorSection('Classifiers', inv.classifiers);

  // ---------- Custom-functions ----------
  lines.push(
    `## Custom-Functions (${inv.totals.custom_functions} registered, across ${inv.totals.custom_function_files} files)`
  );
  lines.push('');
  lines.push('| file | exports | used_by_yaml_rules |');
  lines.push('| --- | --- | --- |');
  for (const f of inv.custom_functions) {
    const exp = f.exports.length ? `${f.exports.length} (${f.exports.slice(0, 3).map((e) => `\`${e}\``).join(', ')}${f.exports.length > 3 ? ', ...' : ''})` : '_(none)_';
    const used =
      f.used_by_yaml_rules.length === 0
        ? '_(unused)_'
        : `${f.used_by_yaml_rules.length} rules`;
    lines.push(`| \`${f.file}\` | ${exp} | ${used} |`);
  }
  lines.push('');

  // ---------- Test-files grouped by directory ----------
  lines.push(`## Test-files (${inv.totals.test_files} total)`);
  lines.push('');
  const testsByDir = new Map<string, InventoryTestFile[]>();
  for (const t of inv.test_files) {
    const dir = path.posix.dirname(t.file);
    const list = testsByDir.get(dir) ?? [];
    list.push(t);
    testsByDir.set(dir, list);
  }
  const sortedTestDirs = [...testsByDir.keys()].sort();
  for (const dir of sortedTestDirs) {
    const tests = testsByDir.get(dir)!;
    lines.push(`### \`${dir}/\` (${tests.length} files)`);
    lines.push('');
    lines.push('| file | target_module | tests | describe_blocks |');
    lines.push('| --- | --- | ---: | --- |');
    for (const t of tests) {
      const base = path.posix.basename(t.file);
      const target = t.target_module ? `\`${t.target_module}\`` : '_(unknown)_';
      const describes =
        t.describe_blocks.length === 0
          ? '_(none)_'
          : t.describe_blocks.length <= 2
            ? t.describe_blocks.map((d) => escapeMd(d)).join(' / ')
            : `${escapeMd(t.describe_blocks[0])} (+${t.describe_blocks.length - 1} more)`;
      lines.push(`| \`${base}\` | ${target} | ${t.test_count} | ${describes} |`);
    }
    lines.push('');
  }

  // ---------- Patterns substrate ----------
  lines.push(`## Patterns Substrate (${inv.patterns_substrate.total} entries)`);
  lines.push('');
  lines.push(
    `Source: \`scripts/spike/data/patterns.json\`. Stage-A territory: ${inv.patterns_substrate.stage_a_count}. Stage-B territory: ${inv.patterns_substrate.stage_b_count}.`
  );
  lines.push('');
  lines.push('### Per-Lens distribution');
  lines.push('');
  lines.push('| Lens | Count |');
  lines.push('| --- | ---: |');
  const lensSorted = Object.entries(inv.patterns_substrate.by_lens).sort(
    (a, b) => b[1] - a[1]
  );
  for (const [lens, n] of lensSorted) {
    lines.push(`| ${lens} | ${n} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Main
// =============================================================================

export function buildInventory(): InventoryJson {
  const yaml_rules = extractYamlRules();
  const modulesIndex = path.join(MODULES_DIR, 'index.ts');
  const aggregatorsIndex = path.join(AGGREGATORS_DIR, 'index.ts');
  // Classifiers have no own index.ts — they are imported either by
  // modules/index.ts or by aggregators/index.ts. Treat both as "wires".
  const modules = extractDetectors(MODULES_DIR, modulesIndex);
  const aggregators = extractDetectors(AGGREGATORS_DIR, aggregatorsIndex);
  const classifiers = extractDetectors(CLASSIFIERS_DIR, modulesIndex, [
    aggregatorsIndex,
    SPECTRAL_RUNNER_PATH,
  ]);
  const registeredFunctions = extractRegisteredFunctionNames();
  const custom_functions = extractCustomFunctions(
    yaml_rules,
    new Set(registeredFunctions)
  );
  const test_files = extractTestFiles();
  const patterns_substrate = extractPatternsSubstrate();

  const inv: InventoryJson = {
    generated_at: new Date().toISOString(),
    yaml_rules,
    modules,
    aggregators,
    classifiers,
    custom_functions,
    test_files,
    patterns_substrate,
    totals: {
      yaml_rules: yaml_rules.length,
      modules: modules.length,
      aggregators: aggregators.length,
      classifiers: classifiers.length,
      custom_functions: registeredFunctions.length,
      custom_function_files: custom_functions.length,
      test_files: test_files.length,
    },
  };
  return inv;
}

export function writeInventory(inv: InventoryJson): { jsonPath: string; mdPath: string } {
  fs.writeFileSync(OUT_JSON, JSON.stringify(inv, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(inv), 'utf8');
  return { jsonPath: OUT_JSON, mdPath: OUT_MD };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const inv = buildInventory();
  const { jsonPath, mdPath } = writeInventory(inv);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  // eslint-disable-next-line no-console
  console.log(`\n=== Inventory build ===`);
  // eslint-disable-next-line no-console
  console.log(`YAML rules:       ${inv.totals.yaml_rules}`);
  // eslint-disable-next-line no-console
  console.log(`Modules:          ${inv.totals.modules}`);
  // eslint-disable-next-line no-console
  console.log(`Aggregators:      ${inv.totals.aggregators}`);
  // eslint-disable-next-line no-console
  console.log(`Classifiers:      ${inv.totals.classifiers}`);
  // eslint-disable-next-line no-console
  console.log(`Custom-functions: ${inv.totals.custom_functions}`);
  // eslint-disable-next-line no-console
  console.log(`Test-files:       ${inv.totals.test_files}`);
  // eslint-disable-next-line no-console
  console.log(`Patterns:         ${inv.patterns_substrate.total}`);
  // eslint-disable-next-line no-console
  console.log(`\nWrote: ${path.relative(REPO_ROOT, jsonPath)}`);
  // eslint-disable-next-line no-console
  console.log(`Wrote: ${path.relative(REPO_ROOT, mdPath)}`);
  // eslint-disable-next-line no-console
  console.log(`Elapsed: ${elapsed}s`);
}

// Only run if invoked directly (not when imported by tests).
const isDirectInvocation =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectInvocation) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
