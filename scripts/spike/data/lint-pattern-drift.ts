/**
 * Welle Arch+ A1 — Three-source-of-truth Drift-Lint Tool
 *
 * Detects drift between `patterns.json` (single-source pattern substrate, 959
 * entries) and the `apiq-meta` blocks declared on every rule across the 11
 * `apiq-ruleset-*.yaml` files. The brainstorm-doc is intentionally not parsed
 * by this lint (it is prose, not structured); pattern-id mention there is
 * tracked manually during mining waves.
 *
 * Drift classes:
 *   class-1  patterns.json patternId without any yaml-rule         (warn)
 *   class-2  yaml-rule pattern-id NOT in patterns.json             (error)
 *   class-3  severityHypothesis (json) ≠ rule.severity (yaml)      (warn)
 *   class-4  patterns.json `lens` array ⊥ apiq-meta.lenses array   (warn)
 *            (subset / overlap is OK; only flag if disjoint)
 *   class-5  bundle-rule (`pattern-id` is array) where one of the
 *            subsumed pattern-ids is NOT in patterns.json          (error)
 *
 * Usage (from scripts/spike):
 *   npx tsx data/lint-pattern-drift.ts                # human report, exit 0
 *   npx tsx data/lint-pattern-drift.ts --json         # machine output
 *   npx tsx data/lint-pattern-drift.ts --check-only   # exit 1 on any drift
 *
 * Combine flags freely (e.g. --json --check-only for CI).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DriftSeverity = 'error' | 'warn';

export type DriftClass = 'class-1' | 'class-2' | 'class-3' | 'class-4' | 'class-5';

export interface DriftFinding {
  driftClass: DriftClass;
  severity: DriftSeverity;
  patternId: string;
  ruleName?: string;
  yamlFile?: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface DriftReport {
  patternsCount: number;
  yamlRulesCount: number;
  yamlRulesWithMetaCount: number;
  findings: DriftFinding[];
  errors: DriftFinding[];
  warnings: DriftFinding[];
  byClass: Record<DriftClass, DriftFinding[]>;
}

export interface PatternEntry {
  patternId: string;
  lens?: string[];
  severityHypothesis?: string;
  description?: string;
  [k: string]: unknown;
}

interface YamlRule {
  description?: string;
  severity?: string;
  'apiq-meta'?: {
    'pattern-id'?: string | string[];
    lenses?: string[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface YamlRuleset {
  rules?: Record<string, YamlRule>;
}

export interface LintInput {
  patterns: PatternEntry[];
  yamlFiles: { fileName: string; ruleset: YamlRuleset }[];
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PATTERNS_PATH = path.join(SPIKE_ROOT, 'data', 'patterns.json');
const DEFAULT_YAML_DIR = path.join(SPIKE_ROOT, 'deterministic', 'rules');

export function loadPatternsFromDisk(file = DEFAULT_PATTERNS_PATH): PatternEntry[] {
  const text = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`patterns.json at ${file} is not an array`);
  }
  return parsed as PatternEntry[];
}

export function loadYamlRulesetsFromDisk(
  dir = DEFAULT_YAML_DIR
): LintInput['yamlFiles'] {
  const fileNames = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('apiq-ruleset') && f.endsWith('.yaml'))
    .sort();
  return fileNames.map((fileName) => {
    const text = fs.readFileSync(path.join(dir, fileName), 'utf8');
    const ruleset = (YAML.parse(text) ?? {}) as YamlRuleset;
    return { fileName, ruleset };
  });
}

// ---------------------------------------------------------------------------
// Core lint logic (pure function on already-loaded inputs)
// ---------------------------------------------------------------------------

function asPatternIdArray(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

export function lintPatternDrift(input: LintInput): DriftReport {
  const findings: DriftFinding[] = [];

  const patternsById = new Map<string, PatternEntry>();
  for (const p of input.patterns) {
    if (typeof p.patternId !== 'string') continue;
    patternsById.set(p.patternId, p);
  }

  // patternId → list of yaml-rules that declare it (may be 0, 1, or many)
  const yamlClaimsById = new Map<
    string,
    { fileName: string; ruleName: string; rule: YamlRule }[]
  >();

  let yamlRulesCount = 0;
  let yamlRulesWithMetaCount = 0;

  for (const { fileName, ruleset } of input.yamlFiles) {
    const rules = ruleset.rules ?? {};
    for (const [ruleName, rule] of Object.entries(rules)) {
      yamlRulesCount++;
      const meta = rule['apiq-meta'];
      if (!meta) continue;
      yamlRulesWithMetaCount++;
      const ids = asPatternIdArray(meta['pattern-id']);
      const isBundle = ids.length > 1;
      for (const pid of ids) {
        if (!yamlClaimsById.has(pid)) yamlClaimsById.set(pid, []);
        yamlClaimsById.get(pid)!.push({ fileName, ruleName, rule });

        // class-2: yaml-rule pattern-id missing in patterns.json
        // class-5: bundle-rule sub-pattern-id missing in patterns.json
        if (!patternsById.has(pid)) {
          findings.push({
            driftClass: isBundle ? 'class-5' : 'class-2',
            severity: 'error',
            patternId: pid,
            ruleName,
            yamlFile: fileName,
            message: isBundle
              ? `bundle-rule '${ruleName}' (${fileName}) declares pattern-id '${pid}' which is NOT in patterns.json`
              : `rule '${ruleName}' (${fileName}) declares pattern-id '${pid}' which is NOT in patterns.json`,
            detail: { bundle: isBundle, allBundleIds: ids },
          });
        }
      }

      // class-3: severity-mismatch (only for first-or-only mapped pattern; for
      // bundle-rules we compare against every subsumed pattern-id and report
      // each mismatch individually).
      const yamlSeverity = (rule.severity ?? '').toString();
      for (const pid of ids) {
        const pattern = patternsById.get(pid);
        if (!pattern) continue;
        const hypSev = (pattern.severityHypothesis ?? '').toString();
        if (!hypSev || !yamlSeverity) continue;
        if (hypSev !== yamlSeverity) {
          findings.push({
            driftClass: 'class-3',
            severity: 'warn',
            patternId: pid,
            ruleName,
            yamlFile: fileName,
            message: `severity drift on '${pid}': patterns.json hypothesis='${hypSev}' vs yaml '${ruleName}' severity='${yamlSeverity}'`,
            detail: { hypothesis: hypSev, yamlSeverity },
          });
        }
      }

      // class-4: lens disjoint between patterns.json and apiq-meta
      const yamlLenses = Array.isArray(meta.lenses) ? meta.lenses.map(String) : [];
      for (const pid of ids) {
        const pattern = patternsById.get(pid);
        if (!pattern) continue;
        const jsonLens = Array.isArray(pattern.lens) ? pattern.lens.map(String) : [];
        if (jsonLens.length === 0 || yamlLenses.length === 0) continue;
        const overlap = jsonLens.filter((l) => yamlLenses.includes(l));
        if (overlap.length === 0) {
          findings.push({
            driftClass: 'class-4',
            severity: 'warn',
            patternId: pid,
            ruleName,
            yamlFile: fileName,
            message: `lens disjoint on '${pid}': patterns.json lens=[${jsonLens.join(',')}] vs yaml lenses=[${yamlLenses.join(',')}]`,
            detail: { jsonLens, yamlLenses },
          });
        }
      }
    }
  }

  // class-1: patternId in patterns.json without any yaml-rule
  for (const pid of patternsById.keys()) {
    if (!yamlClaimsById.has(pid)) {
      findings.push({
        driftClass: 'class-1',
        severity: 'warn',
        patternId: pid,
        message: `pattern '${pid}' exists in patterns.json but has no yaml-rule`,
      });
    }
  }

  const byClass: Record<DriftClass, DriftFinding[]> = {
    'class-1': [],
    'class-2': [],
    'class-3': [],
    'class-4': [],
    'class-5': [],
  };
  for (const f of findings) byClass[f.driftClass].push(f);

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warn');

  return {
    patternsCount: input.patterns.length,
    yamlRulesCount,
    yamlRulesWithMetaCount,
    findings,
    errors,
    warnings,
    byClass,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const CLASS_TITLE: Record<DriftClass, string> = {
  'class-1': 'class-1 (warn) — pattern in patterns.json without yaml-rule',
  'class-2': 'class-2 (error) — yaml-rule pattern-id NOT in patterns.json',
  'class-3': 'class-3 (warn) — severity hypothesis ≠ yaml severity',
  'class-4': 'class-4 (warn) — lens disjoint between patterns.json and apiq-meta',
  'class-5': 'class-5 (error) — bundle sub-pattern-id NOT in patterns.json',
};

export function formatHumanReport(report: DriftReport): string {
  const lines: string[] = [];
  lines.push('apiq pattern-drift lint report');
  lines.push('================================');
  lines.push(
    `patterns.json entries: ${report.patternsCount}    ` +
      `yaml-rules: ${report.yamlRulesCount}    ` +
      `with apiq-meta: ${report.yamlRulesWithMetaCount}`
  );
  lines.push(
    `findings: ${report.findings.length}  ` +
      `(errors: ${report.errors.length}, warnings: ${report.warnings.length})`
  );
  lines.push('');
  for (const cls of ['class-1', 'class-2', 'class-3', 'class-4', 'class-5'] as const) {
    const items = report.byClass[cls];
    lines.push(`${CLASS_TITLE[cls]}: ${items.length}`);
    const previewLimit = 25;
    items.slice(0, previewLimit).forEach((f) => {
      lines.push(`  - ${f.message}`);
    });
    if (items.length > previewLimit) {
      lines.push(`  ... (+${items.length - previewLimit} more)`);
    }
    lines.push('');
  }
  if (report.findings.length === 0) {
    lines.push('CLEAN — no drift detected.');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

interface CliOptions {
  json: boolean;
  checkOnly: boolean;
}

function parseArgv(argv: string[]): CliOptions {
  return {
    json: argv.includes('--json'),
    checkOnly: argv.includes('--check-only'),
  };
}

function main(argv: string[]): number {
  const opts = parseArgv(argv);
  const patterns = loadPatternsFromDisk();
  const yamlFiles = loadYamlRulesetsFromDisk();
  const report = lintPatternDrift({ patterns, yamlFiles });

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatHumanReport(report) + '\n');
  }

  if (opts.checkOnly && report.findings.length > 0) return 1;
  return 0;
}

const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
      fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}
