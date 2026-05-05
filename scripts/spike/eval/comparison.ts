/**
 * Comparison reporter — renders two RunSummary objects as a side-by-side
 * Markdown Δ-table with direction-arrows.
 *
 * Used during Stage 4 to compare baseline (current C-i pipeline) against a
 * candidate pipeline (C-i + Deterministic Layer + v6 prompt + Cache) so the
 * deltas are visible at a glance.
 *
 * CLI:
 *   npx tsx scripts/spike/eval/comparison.ts <baseline.json> <candidate.json>
 */

import * as fs from 'node:fs';

// =============================================================================
// Input shapes — generic enough to wrap any future scorer-aggregated metrics.
// =============================================================================

export interface RunSummary {
  /** Free-form label, e.g. "v5-baseline" or "v6+det-layer". */
  label: string;
  /** Spec name, e.g. "stripe-full". */
  spec: string;
  runMeta: {
    architecture?: string;
    perEndpointModel?: string;
    aggregatorModel?: string;
    promptVariant?: string;
    /** For multi-run aggregations (mean over N runs). */
    runs?: number;
  };
  metrics: {
    findingCount?: number;
    uniqueClusters?: number;
    repetitionRate?: number;
    coverageRate?: number;
    substantiveCoverageRate?: number;
    knowledgeBackedCoverageRate?: number;
    /** Fraction of findings whose patches apply cleanly. */
    applyCleanRate?: number;
    /** Fraction of findings whose patches hallucinate. */
    halluRate?: number;
    costUSD?: number;
    durationMs?: number;
    /** Allow extension with future scorer outputs. */
    [key: string]: number | undefined;
  };
}

export interface RunComparisonInput {
  baseline: RunSummary;
  candidate: RunSummary;
  /** Tolerance for Δ-coloring; default ±5 %. */
  tolerancePct?: number;
}

// =============================================================================
// Per-metric direction lookup-table.
//   higher-better → arrows point up when delta is positive.
//   lower-better  → arrows point down when delta is negative (= good).
//   neutral       → no arrow, just numerical delta.
// =============================================================================

type Direction = 'higher-better' | 'lower-better' | 'neutral';

const METRIC_DIRECTIONS: Record<string, Direction> = {
  findingCount: 'lower-better',
  uniqueClusters: 'neutral',
  repetitionRate: 'lower-better',
  coverageRate: 'higher-better',
  substantiveCoverageRate: 'higher-better',
  knowledgeBackedCoverageRate: 'higher-better',
  llmOnlyCoverageRate: 'higher-better',
  pureSpectralCoverageRate: 'higher-better',
  domainKnowledgeCoverageRate: 'higher-better',
  applyCleanRate: 'higher-better',
  halluRate: 'lower-better',
  costUSD: 'lower-better',
  durationMs: 'lower-better',
};

/** Order rows for stable, readable output. Unknown metrics appended after. */
const METRIC_ORDER: string[] = [
  'findingCount',
  'uniqueClusters',
  'repetitionRate',
  'coverageRate',
  'substantiveCoverageRate',
  'knowledgeBackedCoverageRate',
  'applyCleanRate',
  'halluRate',
  'costUSD',
  'durationMs',
];

// =============================================================================
// Formatting helpers.
// =============================================================================

function formatNumber(metric: string, value: number): string {
  // Rates and fractions → 3-decimal precision.
  if (
    metric.endsWith('Rate') ||
    metric === 'repetitionRate' ||
    metric === 'applyCleanRate' ||
    metric === 'halluRate'
  ) {
    return value.toFixed(3);
  }
  if (metric === 'costUSD') {
    return `$${value.toFixed(2)}`;
  }
  if (metric === 'durationMs') {
    // Show ms verbatim — keep raw for direct comparability.
    return value.toLocaleString('en-US');
  }
  // Integers stay integer; floats get 3-decimal precision.
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return value.toFixed(3);
}

function formatDelta(metric: string, delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  if (
    metric.endsWith('Rate') ||
    metric === 'repetitionRate' ||
    metric === 'applyCleanRate' ||
    metric === 'halluRate'
  ) {
    return `${sign}${Math.abs(delta).toFixed(3)}`;
  }
  if (metric === 'costUSD') {
    // Render delta as e.g. "-$3.76" / "+$1.20" so the sign isn't trapped behind the $.
    return `${sign}$${Math.abs(delta).toFixed(2)}`;
  }
  if (metric === 'durationMs') {
    return `${sign}${Math.abs(Math.round(delta)).toLocaleString('en-US')}`;
  }
  if (Number.isInteger(delta)) {
    return `${sign}${Math.abs(delta).toLocaleString('en-US')}`;
  }
  return `${sign}${Math.abs(delta).toFixed(3)}`;
}

function formatDeltaPct(deltaPct: number): string {
  const sign = deltaPct > 0 ? '+' : '';
  return `${sign}${deltaPct.toFixed(1)}%`;
}

/**
 * Direction-arrow indicating where the value moved (▲ = up, ▼ = down).
 * The semantic meaning of "good" vs "bad" is implicit in the metric direction
 * (e.g. ▼▼ on a lower-better metric like findingCount = good; ▼▼ on a
 * higher-better metric like coverageRate = bad). Neutral metrics get no arrow.
 *
 *   - within ±tolerance     → "="
 *   - delta > +tol×2        → "▲▲"
 *   - delta > +tol          → "▲"
 *   - delta < -tol          → "▼"
 *   - delta < -tol×2        → "▼▼"
 *   - neutral metric        → "" (no arrow shown)
 */
function directionArrow(
  metric: string,
  deltaPct: number,
  tolerancePct: number
): string {
  const dir = METRIC_DIRECTIONS[metric] ?? 'neutral';
  if (dir === 'neutral') return '';

  const tol = tolerancePct;
  const big = tolerancePct * 2;

  if (deltaPct > big) return '▲▲';
  if (deltaPct > tol) return '▲';
  if (deltaPct < -big) return '▼▼';
  if (deltaPct < -tol) return '▼';
  return '=';
}

// =============================================================================
// Main reporter.
// =============================================================================

export function compareRuns(input: RunComparisonInput): string {
  const { baseline, candidate } = input;
  const tolerancePct = input.tolerancePct ?? 5;

  const lines: string[] = [];

  // --- Header --------------------------------------------------------------
  lines.push(`# Run Comparison: ${baseline.label} vs ${candidate.label}`);
  lines.push('');

  const sameSpec = baseline.spec === candidate.spec;
  if (sameSpec) {
    lines.push(`**Spec:** ${baseline.spec}`);
  } else {
    lines.push(
      `**Spec:** ${baseline.spec} (baseline) vs ${candidate.spec} (candidate) — see warning below`
    );
  }

  const fmtMeta = (s: RunSummary) => {
    const m = s.runMeta;
    const parts: string[] = [];
    if (m.architecture) parts.push(m.architecture);
    const models = [m.perEndpointModel, m.aggregatorModel]
      .filter(Boolean)
      .join(' + ');
    if (models) parts.push(models);
    if (m.promptVariant) parts.push(`prompt=${m.promptVariant}`);
    if (typeof m.runs === 'number') parts.push(`${m.runs}×runs`);
    return parts.length > 0 ? parts.join(' · ') : '(no runMeta)';
  };

  lines.push(`**Baseline:** ${fmtMeta(baseline)}`);
  lines.push(`**Candidate:** ${fmtMeta(candidate)}`);
  lines.push('');

  // --- Sanity warnings -----------------------------------------------------
  if (!sameSpec) {
    lines.push(
      `> ⚠️ **Warning:** Comparing runs across different specs (\`${baseline.spec}\` vs \`${candidate.spec}\`). Coverage and finding-count metrics are not directly comparable.`
    );
    lines.push('');
  }

  const baseRuns = baseline.runMeta.runs;
  const candRuns = candidate.runMeta.runs;
  if (
    typeof baseRuns === 'number' &&
    typeof candRuns === 'number' &&
    baseRuns !== candRuns
  ) {
    lines.push(
      `> ⚠️ **Note:** Baseline ran ${baseRuns}×, candidate ran ${candRuns}× (aggregated). Single-run vs multi-run comparison; treat the lower-N side's metrics as samples, not means.`
    );
    lines.push('');
  }

  // --- Metrics table -------------------------------------------------------
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Baseline | Candidate | Δ | Δ% | Direction |');
  lines.push('|---|---:|---:|---:|---:|:---:|');

  // Collect ordered key list — known order first, then any extension keys.
  const allKeys = new Set<string>([
    ...Object.keys(baseline.metrics),
    ...Object.keys(candidate.metrics),
  ]);
  const ordered: string[] = [
    ...METRIC_ORDER.filter((k) => allKeys.has(k)),
    ...[...allKeys].filter((k) => !METRIC_ORDER.includes(k)).sort(),
  ];

  for (const key of ordered) {
    const b = baseline.metrics[key];
    const c = candidate.metrics[key];

    if (b === undefined || c === undefined) {
      const bCell = b === undefined ? '—' : formatNumber(key, b);
      const cCell = c === undefined ? '—' : formatNumber(key, c);
      lines.push(`| ${key} | ${bCell} | ${cCell} | — | — |   |`);
      continue;
    }

    const delta = c - b;
    // Avoid divide-by-zero. If baseline is 0, Δ% is undefined (use "—").
    const deltaPct = b === 0 ? null : (delta / Math.abs(b)) * 100;

    const arrow =
      deltaPct === null ? '' : directionArrow(key, deltaPct, tolerancePct);

    lines.push(
      `| ${key} | ${formatNumber(key, b)} | ${formatNumber(key, c)} | ${formatDelta(key, delta)} | ${deltaPct === null ? '—' : formatDeltaPct(deltaPct)} | ${arrow} |`
    );
  }

  lines.push('');
  lines.push(
    `_Direction-arrows track value-movement (▲ up, ▼ down). "Good" or "bad" depends on the metric: lower-better metrics (findingCount, repetitionRate, halluRate, costUSD, durationMs) treat ▼▼ as improvement; higher-better metrics (coverageRate, applyCleanRate, etc.) treat ▲▲ as improvement; neutral metrics (uniqueClusters) get no arrow. Tolerance: ±${tolerancePct.toFixed(1)} %; double arrows = >${(tolerancePct * 2).toFixed(1)} %._`
  );

  return lines.join('\n');
}

// =============================================================================
// CLI entrypoint.
//
// Detect "this module is the entry point" in a way that works on both POSIX
// and Windows (where argv[1] = "C:\path\file.ts" but import.meta.url =
// "file:///C:/path/file.ts"). We URL-encode the argv path via pathToFileURL
// equivalent: prefix with "file:///" and forward-slash-ify backslashes.
// =============================================================================

function isCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalized = entry.replace(/\\/g, '/');
  // Windows absolute paths start with "X:/..." — file:// URLs need three slashes.
  const asUrl = /^[a-zA-Z]:\//.test(normalized)
    ? `file:///${normalized}`
    : `file://${normalized}`;
  return import.meta.url === asUrl;
}

if (isCliEntrypoint()) {
  const [baselinePath, candidatePath] = process.argv.slice(2);
  if (!baselinePath || !candidatePath) {
    console.error(
      'Usage: npx tsx scripts/spike/eval/comparison.ts <baseline.json> <candidate.json>'
    );
    process.exit(1);
  }
  const baseline = JSON.parse(
    fs.readFileSync(baselinePath, 'utf8')
  ) as RunSummary;
  const candidate = JSON.parse(
    fs.readFileSync(candidatePath, 'utf8')
  ) as RunSummary;
  console.log(compareRuns({ baseline, candidate }));
}
