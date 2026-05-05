/**
 * Snapshot regression system — locks the current aggregated metrics for a named
 * pipeline-config and diffs subsequent runs against the lock. Fail-loud when
 * drift exceeds tolerance.
 *
 * Why this exists: during Stage 4 (and Phase B) of the Big-Spec Architecture
 * Spike we build 4–5 pipeline components in parallel (Deterministic Layer +
 * v6 prompt + Cache + Pre-Pass). A subtle change in one component might
 * silently break another. Snapshots are the regression-net: lock once, diff
 * on every subsequent run, surface drift before it ships.
 *
 * Snapshot files live at `scripts/spike/eval/snapshots/<config-name>.json`.
 *
 * CLI:
 *   npx tsx scripts/spike/eval/snapshot.ts lock <config-name> <runner-output-json> [--spec=<name>] [--notes="..."]
 *   npx tsx scripts/spike/eval/snapshot.ts diff <config-name> <runner-output-json> [--spec=<name>]
 *
 * The runner-output-json is a RunnerOutput produced by Task #5 (Multi-Run-Runner).
 * We read metrics from the first spec in `perSpec` (or --spec if specified).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// =============================================================================
// Snapshot shape
// =============================================================================

export interface SnapshotMetricStats {
  mean: number;
  std: number;
}

export interface Snapshot {
  configName: string;
  /** ISO timestamp when this snapshot was locked. */
  lockedAt: string;
  /** Git commit SHA at lock time, or 'manual' if git unavailable. */
  lockedBy: string;
  spec: string;
  metrics: {
    findingCount: SnapshotMetricStats;
    costUSD: SnapshotMetricStats;
    durationMs: SnapshotMetricStats;
    applyCleanRate: SnapshotMetricStats;
    halluRate: SnapshotMetricStats;
    coverageRate?: number;
    substantiveCoverageRate?: number;
    knowledgeBackedCoverageRate?: number;
    llmOnlyCoverageRate?: number;
    pureSpectralCoverageRate?: number;
    domainKnowledgeCoverageRate?: number;
    repetitionRate?: number;
    uniqueClusters?: number;
  };
  notes?: string;
}

// =============================================================================
// Minimal RunnerOutput interface — Task #5 (runner.ts) is being authored in
// parallel; we only declare what we need here so we don't depend on import
// order. Runner-author will conform to this contract.
// =============================================================================

export interface RunnerSpecAggregate {
  findingCount: SnapshotMetricStats;
  costUSD: SnapshotMetricStats;
  durationMs: SnapshotMetricStats;
  applyCleanRate: SnapshotMetricStats;
  halluRate: SnapshotMetricStats;
  coverageRate?: number;
  substantiveCoverageRate?: number;
  knowledgeBackedCoverageRate?: number;
  repetitionRate?: number;
  uniqueClusters?: number;
}

export interface RunnerOutput {
  perSpec: Record<string, { aggregate: RunnerSpecAggregate }>;
}

// =============================================================================
// Tolerance defaults
// =============================================================================

/**
 * Default per-metric relative tolerance (as fraction, e.g. 0.10 = ±10 %).
 * Stricter on quality-critical metrics (halluRate, applyCleanRate); looser on
 * cost / duration which have higher run-to-run variability.
 */
const DEFAULT_TOLERANCES: Record<keyof Snapshot['metrics'], number> = {
  findingCount: 0.10,
  costUSD: 0.20,
  durationMs: 0.20,
  applyCleanRate: 0.05,
  halluRate: 0.05,
  coverageRate: 0.10,
  substantiveCoverageRate: 0.10,
  knowledgeBackedCoverageRate: 0.10,
  llmOnlyCoverageRate: 0.10,
  pureSpectralCoverageRate: 0.10,
  domainKnowledgeCoverageRate: 0.10,
  repetitionRate: 0.10,
  uniqueClusters: 0.10,
};

/**
 * Direction of "good change" per metric. Used to label out-of-tolerance drift
 * as "regression" vs. "improvement" in the markdown report.
 *   - higher-better: positive Δ is good (e.g. coverageRate)
 *   - lower-better:  negative Δ is good (e.g. halluRate)
 *   - neutral:       direction is undefined (e.g. uniqueClusters)
 */
type Direction = 'higher-better' | 'lower-better' | 'neutral';

const METRIC_DIRECTIONS: Record<keyof Snapshot['metrics'], Direction> = {
  findingCount: 'lower-better',
  costUSD: 'lower-better',
  durationMs: 'lower-better',
  applyCleanRate: 'higher-better',
  halluRate: 'lower-better',
  coverageRate: 'higher-better',
  substantiveCoverageRate: 'higher-better',
  knowledgeBackedCoverageRate: 'higher-better',
  llmOnlyCoverageRate: 'higher-better',
  pureSpectralCoverageRate: 'higher-better',
  domainKnowledgeCoverageRate: 'higher-better',
  repetitionRate: 'lower-better',
  uniqueClusters: 'neutral',
};

/** Stable display order. Unknown keys appended after. */
const METRIC_ORDER: Array<keyof Snapshot['metrics']> = [
  'findingCount',
  'uniqueClusters',
  'repetitionRate',
  'coverageRate',
  'substantiveCoverageRate',
  'knowledgeBackedCoverageRate',
  'pureSpectralCoverageRate',
  'domainKnowledgeCoverageRate',
  'llmOnlyCoverageRate',
  'applyCleanRate',
  'halluRate',
  'costUSD',
  'durationMs',
];

// =============================================================================
// Path helpers — anchor the snapshots directory relative to this file so the
// CLI works regardless of the cwd it's invoked from.
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOTS_DIR = path.join(__dirname, 'snapshots');

function snapshotPath(configName: string): string {
  return path.join(SNAPSHOTS_DIR, `${configName}.json`);
}

// =============================================================================
// Git helper — best-effort capture of the current commit SHA. Falls back to
// 'manual' if git is unavailable or the cwd is not inside a repo.
// =============================================================================

function getCurrentGitSha(): string {
  try {
    const sha = execSync('git rev-parse HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return sha.length > 0 ? sha : 'manual';
  } catch {
    return 'manual';
  }
}

// =============================================================================
// lockSnapshot — write a new snapshot file (overwrites if exists).
// =============================================================================

export function lockSnapshot(opts: {
  configName: string;
  spec: string;
  metrics: Snapshot['metrics'];
  notes?: string;
}): { path: string; written: boolean } {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }

  const snapshot: Snapshot = {
    configName: opts.configName,
    lockedAt: new Date().toISOString(),
    lockedBy: getCurrentGitSha(),
    spec: opts.spec,
    metrics: opts.metrics,
    notes: opts.notes,
  };

  const target = snapshotPath(opts.configName);
  fs.writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  return { path: target, written: true };
}

// =============================================================================
// loadSnapshot — return parsed snapshot or null if file missing.
// =============================================================================

export function loadSnapshot(configName: string): Snapshot | null {
  const target = snapshotPath(configName);
  if (!fs.existsSync(target)) return null;
  const raw = fs.readFileSync(target, 'utf8');
  return JSON.parse(raw) as Snapshot;
}

// =============================================================================
// Diff
// =============================================================================

export interface DriftPerMetric {
  metric: string;
  locked: number | null;
  current: number | null;
  delta: number | null;
  deltaPct: number | null;
  withinTolerance: boolean;
}

export interface DriftReport {
  hasSnapshot: boolean;
  withinTolerance: boolean;
  perMetric: DriftPerMetric[];
  /** Markdown summary, ready to print to stdout or paste into PR. */
  markdownReport: string;
}

/**
 * Extract the comparable scalar value from either a {mean,std} stats object
 * or a bare number metric. Returns null if the metric is absent.
 */
function metricValue(
  m: Snapshot['metrics'],
  key: keyof Snapshot['metrics']
): number | null {
  const v = m[key];
  if (v === undefined) return null;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'mean' in v) return v.mean;
  return null;
}

function formatNumber(metric: string, value: number): string {
  if (
    metric.endsWith('Rate') ||
    metric === 'applyCleanRate' ||
    metric === 'halluRate' ||
    metric === 'repetitionRate'
  ) {
    return value.toFixed(3);
  }
  if (metric === 'costUSD') {
    return `$${value.toFixed(2)}`;
  }
  if (metric === 'durationMs') {
    return Math.round(value).toLocaleString('en-US');
  }
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return value.toFixed(3);
}

function formatDelta(metric: string, delta: number): string {
  const sign = delta > 0 ? '+' : '';
  if (
    metric.endsWith('Rate') ||
    metric === 'applyCleanRate' ||
    metric === 'halluRate' ||
    metric === 'repetitionRate'
  ) {
    return `${sign}${delta.toFixed(3)}`;
  }
  if (metric === 'costUSD') {
    // Place sign before the dollar symbol: "+$1.20" / "-$3.76"
    const negSign = delta < 0 ? '-' : sign;
    return `${negSign}$${Math.abs(delta).toFixed(2)}`;
  }
  if (metric === 'durationMs') {
    return `${sign}${Math.round(delta).toLocaleString('en-US')}`;
  }
  if (Number.isInteger(delta)) return `${sign}${delta.toLocaleString('en-US')}`;
  return `${sign}${delta.toFixed(3)}`;
}

function formatPct(p: number): string {
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

/**
 * Status cell for a single metric row.
 *   - within tolerance              → "✓ Within ±X%"
 *   - outside, neutral metric       → "⚠️ Outside ±X%"
 *   - outside, in good direction    → "⚠️ Outside ±X% (improvement)"
 *   - outside, in bad direction     → "⚠️ Outside ±X% (regression)"
 *   - missing on either side        → "—"
 */
function statusCell(
  metric: keyof Snapshot['metrics'] | string,
  delta: number | null,
  withinTolerance: boolean,
  tolerancePct: number
): string {
  if (delta === null) return '—';
  const tolLabel = `±${(tolerancePct * 100).toFixed(0)}%`;
  if (withinTolerance) return `✓ Within ${tolLabel}`;

  const dir =
    METRIC_DIRECTIONS[metric as keyof Snapshot['metrics']] ?? 'neutral';
  if (dir === 'neutral') return `⚠️ Outside ${tolLabel}`;

  const goodSign = dir === 'higher-better' ? 1 : -1;
  const isImprovement = Math.sign(delta) === goodSign;
  return `⚠️ Outside ${tolLabel} (${isImprovement ? 'improvement' : 'regression'})`;
}

export function diffAgainstSnapshot(opts: {
  configName: string;
  currentMetrics: Snapshot['metrics'];
  tolerances?: Partial<Record<keyof Snapshot['metrics'], number>>;
}): DriftReport {
  const snapshot = loadSnapshot(opts.configName);
  const tolerances = { ...DEFAULT_TOLERANCES, ...(opts.tolerances ?? {}) };

  if (!snapshot) {
    const md = [
      `## Snapshot Drift: ${opts.configName}`,
      '',
      `> ⚠️ No locked snapshot found at \`scripts/spike/eval/snapshots/${opts.configName}.json\`.`,
      `> Run \`npx tsx scripts/spike/eval/snapshot.ts lock ${opts.configName} <runner-output.json>\` to create one.`,
      '',
    ].join('\n');
    return {
      hasSnapshot: false,
      withinTolerance: true,
      perMetric: [],
      markdownReport: md,
    };
  }

  // Compute per-metric drift. Walk the union of keys from both sides so a
  // metric added only on the current run (or only locked previously) still
  // shows up as a "missing" row.
  const allKeys = new Set<keyof Snapshot['metrics']>([
    ...(Object.keys(snapshot.metrics) as Array<keyof Snapshot['metrics']>),
    ...(Object.keys(opts.currentMetrics) as Array<keyof Snapshot['metrics']>),
  ]);
  const ordered: Array<keyof Snapshot['metrics']> = [
    ...METRIC_ORDER.filter((k) => allKeys.has(k)),
    ...[...allKeys].filter((k) => !METRIC_ORDER.includes(k)),
  ];

  const perMetric: DriftPerMetric[] = [];
  let allWithinTolerance = true;

  for (const key of ordered) {
    const locked = metricValue(snapshot.metrics, key);
    const current = metricValue(opts.currentMetrics, key);

    if (locked === null || current === null) {
      perMetric.push({
        metric: key,
        locked,
        current,
        delta: null,
        deltaPct: null,
        withinTolerance: true, // Missing on either side is not a drift-violation.
      });
      continue;
    }

    const delta = current - locked;
    // Avoid divide-by-zero. If locked is 0 and current is also 0, treat as within
    // tolerance. If locked is 0 but current is non-zero, treat as out-of-tolerance
    // (any change from zero is "infinite" relative drift).
    let deltaPct: number;
    let withinTolerance: boolean;
    const tol = tolerances[key] ?? 0.10;

    if (locked === 0) {
      deltaPct = current === 0 ? 0 : current > 0 ? Infinity : -Infinity;
      withinTolerance = current === 0;
    } else {
      deltaPct = (delta / Math.abs(locked)) * 100;
      withinTolerance = Math.abs(delta / Math.abs(locked)) <= tol;
    }

    if (!withinTolerance) allWithinTolerance = false;

    perMetric.push({
      metric: key,
      locked,
      current,
      delta,
      deltaPct: Number.isFinite(deltaPct) ? deltaPct : null,
      withinTolerance,
    });
  }

  // --- Markdown report ---------------------------------------------------
  const lines: string[] = [];
  lines.push(`## Snapshot Drift: ${opts.configName}`);
  lines.push('');
  const lockedDate = snapshot.lockedAt.slice(0, 10);
  const shortSha =
    snapshot.lockedBy === 'manual' ? 'manual' : snapshot.lockedBy.slice(0, 7);
  lines.push(`**Locked:** ${lockedDate} (commit ${shortSha})`);
  const currentSha = getCurrentGitSha();
  const currentDate = new Date().toISOString().slice(0, 10);
  if (currentSha === snapshot.lockedBy && currentSha !== 'manual') {
    lines.push(`**Current:** ${currentDate} (commit ${currentSha.slice(0, 7)})`);
  } else if (currentSha === 'manual') {
    lines.push(`**Current:** ${currentDate} (uncommitted)`);
  } else {
    lines.push(`**Current:** ${currentDate} (commit ${currentSha.slice(0, 7)})`);
  }
  lines.push(`**Spec:** ${snapshot.spec}`);
  lines.push('');
  lines.push('| Metric | Locked | Current | Δ | Δ% | Status |');
  lines.push('|---|---:|---:|---:|---:|:---|');

  for (const row of perMetric) {
    const tol = tolerances[row.metric as keyof Snapshot['metrics']] ?? 0.10;
    const lockedCell =
      row.locked === null ? '—' : formatNumber(row.metric, row.locked);
    const currentCell =
      row.current === null ? '—' : formatNumber(row.metric, row.current);
    const deltaCell =
      row.delta === null ? '—' : formatDelta(row.metric, row.delta);
    const pctCell = row.deltaPct === null ? '—' : formatPct(row.deltaPct);
    const status = statusCell(row.metric, row.delta, row.withinTolerance, tol);
    lines.push(
      `| ${row.metric} | ${lockedCell} | ${currentCell} | ${deltaCell} | ${pctCell} | ${status} |`
    );
  }

  lines.push('');
  const offending = perMetric.filter(
    (r) => !r.withinTolerance && r.delta !== null
  );
  if (offending.length === 0) {
    lines.push('**Verdict:** ✓ All metrics within tolerance.');
  } else {
    lines.push(
      `**Verdict:** ⚠️ Drift detected on ${offending.length} metric${offending.length === 1 ? '' : 's'} — review before locking new snapshot.`
    );
  }

  return {
    hasSnapshot: true,
    withinTolerance: allWithinTolerance,
    perMetric,
    markdownReport: lines.join('\n'),
  };
}

// =============================================================================
// CLI
// =============================================================================

/**
 * Pull a metrics-bundle out of a RunnerOutput JSON. Picks the first spec in
 * `perSpec` unless `specName` is given. Also reads `scored.aggregate.<metric>.mean`
 * when present (ScoredRunnerOutput from `score-run.ts`) to capture coverage/
 * repetition/cluster metrics that the bare runner does not produce.
 */
function metricsFromRunnerOutput(
  runnerOutput: RunnerOutput,
  specName?: string
): { spec: string; metrics: Snapshot['metrics'] } {
  const specKeys = Object.keys(runnerOutput.perSpec ?? {});
  if (specKeys.length === 0) {
    throw new Error('RunnerOutput.perSpec is empty — nothing to snapshot');
  }
  const chosen = specName ?? specKeys[0];
  const entry = runnerOutput.perSpec[chosen] as
    | { aggregate: RunnerSpecAggregate; scored?: { aggregate?: Record<string, { mean: number } | number | undefined> } }
    | undefined;
  if (!entry) {
    throw new Error(
      `Spec "${chosen}" not found in RunnerOutput.perSpec. Available: ${specKeys.join(', ')}`
    );
  }
  const a = entry.aggregate;

  /** Resolve a scoring metric: prefer `aggregate.<key>` flat or `scored.aggregate.<key>.mean`. */
  const scoreMean = (key: string): number | undefined => {
    const flat = (a as unknown as Record<string, unknown>)[key];
    if (typeof flat === 'number') return flat;
    const scored = entry.scored?.aggregate?.[key];
    if (scored !== undefined) {
      if (typeof scored === 'number') return scored;
      if (typeof scored === 'object' && scored !== null && 'mean' in scored) {
        return (scored as { mean: number }).mean;
      }
    }
    return undefined;
  };

  const metrics: Snapshot['metrics'] = {
    findingCount: a.findingCount,
    costUSD: a.costUSD,
    durationMs: a.durationMs,
    applyCleanRate: a.applyCleanRate,
    halluRate: a.halluRate,
    coverageRate: scoreMean('coverageRate'),
    substantiveCoverageRate: scoreMean('substantiveCoverageRate'),
    knowledgeBackedCoverageRate: scoreMean('knowledgeBackedCoverageRate'),
    llmOnlyCoverageRate: scoreMean('llmOnlyCoverageRate'),
    pureSpectralCoverageRate: scoreMean('pureSpectralCoverageRate'),
    domainKnowledgeCoverageRate: scoreMean('domainKnowledgeCoverageRate'),
    repetitionRate: scoreMean('repetitionRate'),
    uniqueClusters: scoreMean('uniqueClusters'),
  };
  return { spec: chosen, metrics };
}

function parseFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function runCli() {
  const [cmd, configName, runnerJsonPath, ...rest] = process.argv.slice(2);

  if (!cmd || (cmd !== 'lock' && cmd !== 'diff')) {
    console.error(
      'Usage:\n' +
        '  npx tsx scripts/spike/eval/snapshot.ts lock <config-name> <runner-output.json> [--spec=<name>] [--notes="..."]\n' +
        '  npx tsx scripts/spike/eval/snapshot.ts diff <config-name> <runner-output.json> [--spec=<name>]'
    );
    process.exit(1);
  }
  if (!configName || !runnerJsonPath) {
    console.error(`Missing arguments for "${cmd}".`);
    process.exit(1);
  }

  const specFlag = parseFlag(rest, 'spec');
  const notesFlag = parseFlag(rest, 'notes');

  const raw = fs.readFileSync(runnerJsonPath, 'utf8');
  const runnerOutput = JSON.parse(raw) as RunnerOutput;
  const { spec, metrics } = metricsFromRunnerOutput(runnerOutput, specFlag);

  if (cmd === 'lock') {
    const result = lockSnapshot({
      configName,
      spec,
      metrics,
      notes: notesFlag,
    });
    console.log(`Locked snapshot at ${result.path}`);
    return;
  }

  // cmd === 'diff'
  const report = diffAgainstSnapshot({ configName, currentMetrics: metrics });
  console.log(report.markdownReport);
  // Exit non-zero on drift so CI can fail-loud.
  process.exit(report.hasSnapshot && !report.withinTolerance ? 1 : 0);
}

// Detect "ran as a script" robustly across platforms. On Windows, import.meta.url
// is `file:///C:/...` while process.argv[1] is `C:\...`; reduce both to the
// resolved fs path before comparing.
const invokedAsScript = (() => {
  try {
    const here = fileURLToPath(import.meta.url);
    const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return path.resolve(here) === entry;
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  runCli();
}
