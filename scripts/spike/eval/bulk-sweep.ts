#!/usr/bin/env tsx
/**
 * Bulk-Eval-Sweep over all Stage-3 run JSONs (Phase 0 Task #17).
 *
 * For each pre-recorded run in `specs/big-spec-runs/*.json`:
 *   1. Load + normalise to a RunnerOutput-shape (handles both two-call and
 *      bigger-context architectures, which have slightly different top-level
 *      JSON shapes).
 *   2. Run all scorers (Jaccard against spec's reference if it exists,
 *      Repetition-Cluster always, Classification stub).
 *   3. Lock a per-run snapshot under `scripts/spike/eval/snapshots/<run-id>.json`.
 *   4. Aggregate everything into:
 *      - `specs/big-spec-runs/eval/EVAL-REGISTRY.md` — Markdown tables grouped
 *        by spec, all runs × all metrics, side-by-side
 *      - `specs/big-spec-runs/eval/STAGE-A-PREDICTIONS.md` — predicted
 *        post-Stage-A coverage per spec based on classification-tags
 *
 * CLI:
 *   npx tsx scripts/spike/eval/bulk-sweep.ts [--snapshot] [--no-snapshot]
 *
 *   --snapshot     (default ON for runs that don't have a snapshot yet)
 *   --no-snapshot  skip snapshot locking (registry only)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { JaccardScorer, type JaccardResult } from './scorers/jaccard.js';
import { RepetitionClusterScorer, type ClusterResult } from './scorers/repetition-cluster.js';
import { loadReferenceTarget } from './reference.js';
import type { Finding } from '../schema.js';
import type { ReferenceTarget } from './types.js';
import { lockSnapshot, type Snapshot } from './snapshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNS_DIR = path.join(REPO_ROOT, 'specs', 'big-spec-runs');
const EVAL_OUT_DIR = path.join(RUNS_DIR, 'eval');

// =============================================================================
// Normalised run-output shape (drops the architecture differences)
// =============================================================================

interface NormalisedRun {
  /** Stable, filename-safe id used for snapshot naming. */
  runId: string;
  /** Source JSON filename (without extension). */
  sourceFile: string;
  arch: 'two-call' | 'bigger-context';
  /** For two-call: per-endpoint model. For bigger-context: model. */
  perEndpointModel: string;
  /** For two-call: aggregator. For bigger-context: '(n/a)'. */
  aggregatorModel: string;
  spec: string;
  promptVariant: string;
  findings: Finding[];
  findingCount: number;
  applyCleanRate: number;
  halluRate: number;
  costUSD: number;
  durationMs: number;
}

function safeNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function loadAndNormalise(filename: string): NormalisedRun | null {
  const filepath = path.join(RUNS_DIR, filename);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (err) {
    console.warn(`[bulk-sweep] skip ${filename}: parse-error ${err instanceof Error ? err.message : err}`);
    return null;
  }
  if (typeof raw !== 'object' || raw === null) {
    console.warn(`[bulk-sweep] skip ${filename}: not an object`);
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const arch = obj.arch as string | undefined;
  if (arch !== 'two-call' && arch !== 'bigger-context') {
    console.warn(`[bulk-sweep] skip ${filename}: unknown arch="${arch}"`);
    return null;
  }
  const findings = (obj.findings ?? []) as Finding[];
  const summary = (obj.summary ?? {}) as Record<string, unknown>;
  const spec = (obj.specName as string) ?? 'unknown';
  const promptVariant = (obj.promptVariant as string) ?? 'unknown';

  const perEndpointModel =
    arch === 'two-call'
      ? ((obj.perEndpointModel as string) ?? 'unknown')
      : ((obj.model as string) ?? 'unknown');
  const aggregatorModel =
    arch === 'two-call'
      ? ((obj.aggregatorModel as string) ?? 'unknown')
      : '(n/a)';

  const applyCleanRate = safeNumber(summary.applyCleanRate, 0);
  const hallucinatedRate = safeNumber(summary.hallucinatedRate, NaN);
  const halluRate = Number.isFinite(hallucinatedRate)
    ? hallucinatedRate
    : safeNumber(summary.halluRate, 0);
  const costUSD = safeNumber(obj.costUSD, 0);
  const durationMs = safeNumber(obj.totalDurationMs, NaN);
  const finalDuration = Number.isFinite(durationMs)
    ? durationMs
    : safeNumber(obj.durationMs, 0);

  // Filename without extension is a stable, filename-safe runId.
  const runId = filename.replace(/\.json$/, '');

  return {
    runId,
    sourceFile: filename,
    arch,
    perEndpointModel,
    aggregatorModel,
    spec,
    promptVariant,
    findings,
    findingCount: findings.length,
    applyCleanRate,
    halluRate,
    costUSD,
    durationMs: finalDuration,
  };
}

// =============================================================================
// Reference auto-detect (per spec)
// =============================================================================

function loadReferenceForSpec(spec: string): ReferenceTarget | null {
  const dir = path.join(REPO_ROOT, 'openapi-examples', spec, 'reference');
  const candidates = ['findings.json', 'findings-target-big.md'];
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (fs.existsSync(p)) {
      try {
        return loadReferenceTarget(p, spec);
      } catch (err) {
        console.warn(`[bulk-sweep] reference for ${spec} failed to load: ${err instanceof Error ? err.message : err}`);
        return null;
      }
    }
  }
  return null;
}

// =============================================================================
// Score one run
// =============================================================================

interface ScoredRun {
  run: NormalisedRun;
  reference: ReferenceTarget | null;
  jaccard: JaccardResult | null;
  cluster: ClusterResult;
}

function scoreRun(run: NormalisedRun, reference: ReferenceTarget | null): ScoredRun {
  const runMeta = {
    spec: run.spec,
    architecture: run.arch,
    perEndpointModel: run.perEndpointModel,
    aggregatorModel: run.aggregatorModel,
    promptVariant: run.promptVariant,
    costUSD: run.costUSD,
    totalDurationMs: run.durationMs,
  };
  const cluster = RepetitionClusterScorer.score({
    reference: null,
    llmFindings: run.findings,
    runMeta,
  });
  const jaccard = reference
    ? JaccardScorer.score({ reference, llmFindings: run.findings, runMeta })
    : null;
  return { run, reference, jaccard, cluster };
}

// =============================================================================
// Snapshot lock per run
// =============================================================================

function lockRun(scored: ScoredRun): { path: string; written: boolean } {
  const m: Snapshot['metrics'] = {
    findingCount: { mean: scored.run.findingCount, std: 0 },
    costUSD: { mean: scored.run.costUSD, std: 0 },
    durationMs: { mean: scored.run.durationMs, std: 0 },
    applyCleanRate: { mean: scored.run.applyCleanRate, std: 0 },
    halluRate: { mean: scored.run.halluRate, std: 0 },
    repetitionRate: scored.cluster.repetitionRate,
    uniqueClusters: scored.cluster.uniqueClusters,
  };
  if (scored.jaccard) {
    m.coverageRate = scored.jaccard.coverageRate;
    m.substantiveCoverageRate = scored.jaccard.substantiveCoverageRate;
    m.knowledgeBackedCoverageRate = scored.jaccard.knowledgeBackedCoverageRate;
    m.llmOnlyCoverageRate = scored.jaccard.llmOnlyCoverageRate;
    m.pureSpectralCoverageRate = scored.jaccard.pureSpectralCoverageRate;
    m.domainKnowledgeCoverageRate = scored.jaccard.domainKnowledgeCoverageRate;
  }
  const notes = `Stage-3 historical run snapshot — ${scored.run.arch} · ${scored.run.perEndpointModel}${scored.run.arch === 'two-call' ? ' + ' + scored.run.aggregatorModel : ''} · ${scored.run.spec} · prompt=${scored.run.promptVariant}. Locked by bulk-sweep on 2026-05-05 to enable Stage-A-vs-baseline drift-diffing.`;
  return lockSnapshot({
    configName: scored.run.runId,
    spec: scored.run.spec,
    metrics: m,
    notes,
  });
}

// =============================================================================
// EVAL-REGISTRY.md renderer
// =============================================================================

const PCT = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const NUM = (v: number) => v.toLocaleString('en-US');
const COST = (v: number) => `$${v.toFixed(4)}`;
const DUR = (ms: number) => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
};

function archLabel(run: NormalisedRun): string {
  if (run.arch === 'two-call') {
    return `${run.arch} · ${run.perEndpointModel} → ${run.aggregatorModel}`;
  }
  return `${run.arch} · ${run.perEndpointModel}`;
}

function renderRegistry(scoredRuns: ScoredRun[]): string {
  const bySpec = new Map<string, ScoredRun[]>();
  for (const s of scoredRuns) {
    const key = s.run.spec;
    if (!bySpec.has(key)) bySpec.set(key, []);
    bySpec.get(key)!.push(s);
  }

  const lines: string[] = [];
  lines.push('# Stage-3 Eval Registry');
  lines.push('');
  lines.push('> Frozen baseline registry — every Stage-3 run scored end-to-end through the Phase-0 eval-framework. Generated by `scripts/spike/eval/bulk-sweep.ts` on 2026-05-05. Snapshot per run lives under `scripts/spike/eval/snapshots/<run-id>.json`.');
  lines.push('>');
  lines.push('> Use Stage-A engineering output to diff against these snapshots and verify regression-net + improvement claims.');
  lines.push('');

  const totalRuns = scoredRuns.length;
  const withRef = scoredRuns.filter((s) => s.jaccard !== null).length;
  lines.push(`**Runs:** ${totalRuns} · **with reference:** ${withRef} · **without reference (raw + cluster only):** ${totalRuns - withRef}`);
  lines.push('');

  // Sort spec-classes in a stable order: stripe → pagerduty → dnd5eapi → github → others
  const SPEC_ORDER = ['stripe-full', 'pagerduty-full', 'dnd5eapi', 'github-rest'];
  const sortedSpecs = [
    ...SPEC_ORDER.filter((s) => bySpec.has(s)),
    ...[...bySpec.keys()].filter((s) => !SPEC_ORDER.includes(s)),
  ];

  for (const spec of sortedSpecs) {
    const runs = bySpec.get(spec)!;
    const refLabel = runs.find((r) => r.jaccard)?.reference?.findings.length ?? null;
    lines.push(`## ${spec}`);
    lines.push('');
    if (refLabel) {
      lines.push(`Reference target: \`openapi-examples/${spec}/reference/findings.json\` (${refLabel} findings).`);
    } else {
      lines.push(`Reference target: **(none)** — raw + cluster metrics only; coverage-splits not computable.`);
    }
    lines.push('');

    // Headline metrics row (always present for all runs).
    lines.push('### Findings + cost + latency');
    lines.push('');
    lines.push('| Architecture | Findings | UniqueClusters | Repetition | ApplyClean | Hallu | Cost | Duration |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const s of runs) {
      lines.push(
        `| ${archLabel(s.run)} | ${NUM(s.run.findingCount)} | ${NUM(s.cluster.uniqueClusters)} | ${PCT(s.cluster.repetitionRate)} | ${PCT(s.run.applyCleanRate)} | ${PCT(s.run.halluRate)} | ${COST(s.run.costUSD)} | ${DUR(s.run.durationMs)} |`
      );
    }
    lines.push('');

    // Coverage row only if at least one run has a reference.
    if (refLabel) {
      lines.push('### Coverage against reference');
      lines.push('');
      lines.push('| Architecture | Total | Substantive | Knowledge-Backed | Pure-Spectral | Domain-Knowledge | LLM-Only |');
      lines.push('|---|---:|---:|---:|---:|---:|---:|');
      for (const s of runs) {
        if (s.jaccard) {
          lines.push(
            `| ${archLabel(s.run)} | ${PCT(s.jaccard.coverageRate)} (${s.jaccard.coveredRefs}/${s.jaccard.totalRefs}) | ${PCT(s.jaccard.substantiveCoverageRate)} (${s.jaccard.substantiveCoveredRefs}/${s.jaccard.substantiveTotalRefs}) | ${PCT(s.jaccard.knowledgeBackedCoverageRate)} (${s.jaccard.knowledgeBackedCoveredRefs}/${s.jaccard.knowledgeBackedTotalRefs}) | ${PCT(s.jaccard.pureSpectralCoverageRate)} (${s.jaccard.pureSpectralCoveredRefs}/${s.jaccard.pureSpectralTotalRefs}) | ${PCT(s.jaccard.domainKnowledgeCoverageRate)} (${s.jaccard.domainKnowledgeCoveredRefs}/${s.jaccard.domainKnowledgeTotalRefs}) | ${PCT(s.jaccard.llmOnlyCoverageRate)} (${s.jaccard.llmOnlyCoveredRefs}/${s.jaccard.llmOnlyTotalRefs}) |`
          );
        } else {
          lines.push(`| ${archLabel(s.run)} | (no ref) | — | — | — | — | — |`);
        }
      }
      lines.push('');
    }

    // Top-3 clusters (helps spot the repetition shape).
    lines.push('### Top-3 repetition clusters per run');
    lines.push('');
    for (const s of runs) {
      lines.push(`**${archLabel(s.run)}**`);
      const top3 = s.cluster.topClusters.slice(0, 3);
      if (top3.length === 0) {
        lines.push('  - (no clusters)');
      } else {
        for (const c of top3) {
          lines.push(`  - \`${c.exampleTitle}\` × ${c.count}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n') + '\n';
}

// =============================================================================
// STAGE-A-PREDICTIONS.md renderer
// =============================================================================

/**
 * Predicted recall of Stage-A's two layers per ref-class.
 * Conservative-ish defaults; refine when Phase B brings real measurements.
 */
const STAGE_A_RECALL = {
  pureSpectral: 0.95,    // Spectral-OAS3-defaults + 15-20 custom rules → high recall expected
  domainKnowledge: 0.75, // pattern-library-driven, lower recall (depends on coverage of family-specific patterns)
};

interface SpecPrediction {
  spec: string;
  reference: ReferenceTarget;
  baseline: ScoredRun | null; // best Stage-3 (C-i) run for this spec, if any
  totals: {
    pureSpectral: number;
    domainKnowledge: number;
    llmOnly: number;
    totalRefs: number;
  };
  predictedCoverage: {
    /** Refs that pure-spectral layer would catch (recall-discounted). */
    pureSpectralCovered: number;
    /** Refs that domain-knowledge layer would catch. */
    domainKnowledgeCovered: number;
    /** LLM-only-class refs the LLM is currently catching (carries through). */
    llmOnlyCarryThrough: number;
    /** Total predicted post-Stage-A coverage (expected value, summed). */
    expectedTotal: number;
    /** Same as fraction of all refs. */
    expectedRate: number;
  };
}

function predictForSpec(spec: string, ref: ReferenceTarget, baseline: ScoredRun | null): SpecPrediction {
  const refs = ref.findings;
  let pureSpectral = 0;
  let domainKnowledge = 0;
  let llmOnly = 0;
  for (const r of refs) {
    const ps = r.classification.isPureSpectralDetectable;
    const dk = r.classification.isDomainKnowledgeDetectable;
    if (ps) pureSpectral++;
    else if (dk) domainKnowledge++;
    else llmOnly++;
  }
  const baselineLlmOnlyRate = baseline?.jaccard?.llmOnlyCoverageRate ?? 0;
  const llmOnlyCarryThrough = llmOnly * baselineLlmOnlyRate;
  const psExpected = pureSpectral * STAGE_A_RECALL.pureSpectral;
  const dkExpected = domainKnowledge * STAGE_A_RECALL.domainKnowledge;
  const expectedTotal = psExpected + dkExpected + llmOnlyCarryThrough;
  return {
    spec,
    reference: ref,
    baseline,
    totals: {
      pureSpectral,
      domainKnowledge,
      llmOnly,
      totalRefs: refs.length,
    },
    predictedCoverage: {
      pureSpectralCovered: psExpected,
      domainKnowledgeCovered: dkExpected,
      llmOnlyCarryThrough,
      expectedTotal,
      expectedRate: refs.length === 0 ? 0 : expectedTotal / refs.length,
    },
  };
}

function renderPredictions(predictions: SpecPrediction[]): string {
  const lines: string[] = [];
  lines.push('# Stage-A Coverage Predictions');
  lines.push('');
  lines.push('> Hypothesised post-Stage-A coverage per spec, computed from reference-classification tags + assumed layer-recall. Stage B measures real coverage and diffs against these predictions. Generated by `scripts/spike/eval/bulk-sweep.ts` on 2026-05-05.');
  lines.push('');
  lines.push('## Assumptions (recall per Stage-A layer)');
  lines.push('');
  lines.push(`- **Pure-spectral layer:** ${(STAGE_A_RECALL.pureSpectral * 100).toFixed(0)}% recall on \`isPureSpectralDetectable\` refs. Spectral-OAS3-defaults + ~15-20 custom rules; high recall expected because these are mechanical walks.`);
  lines.push(`- **Domain-knowledge layer:** ${(STAGE_A_RECALL.domainKnowledge * 100).toFixed(0)}% recall on \`isDomainKnowledgeDetectable\` refs. Pattern-library-driven, recall depends on coverage of API-family-specific patterns.`);
  lines.push(`- **LLM-only refs:** carry-through at the *current* baseline LLM-only coverage rate (LLM still has to find these; Stage A doesn't help).`);
  lines.push('');
  lines.push('Predictions are expected-value sums: `pureSpectral_n * 0.95 + domainKnowledge_n * 0.75 + llmOnly_n * baselineLlmOnlyRate`. Realistic, not optimistic.');
  lines.push('');
  lines.push('## Per-spec predictions');
  lines.push('');
  lines.push('| Spec | Refs | PSpec | DomK | LLM-only | Baseline (C-i) | Predicted post-Stage-A | Lift |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const p of predictions) {
    const baselineRate = p.baseline?.jaccard?.coverageRate ?? null;
    const baselineCell = baselineRate == null ? '—' : `${(baselineRate * 100).toFixed(1)}% (${p.baseline!.jaccard!.coveredRefs}/${p.totals.totalRefs})`;
    const lift =
      baselineRate == null
        ? '—'
        : `+${((p.predictedCoverage.expectedRate - baselineRate) * 100).toFixed(1)}pp`;
    lines.push(
      `| ${p.spec} | ${p.totals.totalRefs} | ${p.totals.pureSpectral} | ${p.totals.domainKnowledge} | ${p.totals.llmOnly} | ${baselineCell} | ${(p.predictedCoverage.expectedRate * 100).toFixed(1)}% (~${p.predictedCoverage.expectedTotal.toFixed(1)}/${p.totals.totalRefs}) | ${lift} |`
    );
  }
  lines.push('');
  lines.push('## Per-spec breakdown');
  lines.push('');
  for (const p of predictions) {
    const baselineRate = p.baseline?.jaccard?.coverageRate ?? null;
    lines.push(`### ${p.spec}`);
    lines.push('');
    if (p.baseline) {
      lines.push(`Baseline: ${archLabel(p.baseline.run)}, ${p.baseline.run.findingCount} findings, ${baselineRate == null ? '—' : (baselineRate * 100).toFixed(1) + '% coverage'}.`);
    } else {
      lines.push('Baseline: **none** (no Stage-3 run for this spec is in the registry).');
    }
    lines.push('');
    lines.push(`- Pure-spectral refs: ${p.totals.pureSpectral} (assumed catch: ${p.predictedCoverage.pureSpectralCovered.toFixed(1)} at 95% recall)`);
    lines.push(`- Domain-knowledge refs: ${p.totals.domainKnowledge} (assumed catch: ${p.predictedCoverage.domainKnowledgeCovered.toFixed(1)} at 75% recall)`);
    lines.push(`- LLM-only refs: ${p.totals.llmOnly} (carry-through at baseline LLM-only rate ${p.baseline?.jaccard ? (p.baseline.jaccard.llmOnlyCoverageRate * 100).toFixed(0) + '%' : '—'} → ~${p.predictedCoverage.llmOnlyCarryThrough.toFixed(1)})`);
    lines.push(`- **Predicted post-Stage-A: ${(p.predictedCoverage.expectedRate * 100).toFixed(1)}% (~${p.predictedCoverage.expectedTotal.toFixed(1)}/${p.totals.totalRefs})**`);
    lines.push('');
  }
  lines.push('## What Stage B measures against this');
  lines.push('');
  lines.push('1. Real Stage-A measured coverage per spec → snapshot diff against this prediction.');
  lines.push('2. If pure-spectral measured << 95% → expand custom rules (gap is in the `isPureSpectralDetectable` ref set).');
  lines.push('3. If domain-knowledge measured << 75% → expand the per-API-family pattern library.');
  lines.push('4. If LLM-only carry-through *drops* (worse than baseline) → Stage-A pre-pass is competing for LLM attention; revisit prompt-engineering.');
  lines.push('');

  return lines.join('\n') + '\n';
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const noSnapshot = args.includes('--no-snapshot');

  if (!fs.existsSync(EVAL_OUT_DIR)) fs.mkdirSync(EVAL_OUT_DIR, { recursive: true });

  // Discover all run-JSONs in RUNS_DIR (skip the eval/ subdir + audit md files).
  const candidates = fs
    .readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !f.startsWith('_'))
    .sort();

  console.log(`[bulk-sweep] discovered ${candidates.length} run-JSONs in ${RUNS_DIR}`);

  const scoredRuns: ScoredRun[] = [];
  const refCache = new Map<string, ReferenceTarget | null>();

  for (const filename of candidates) {
    const run = loadAndNormalise(filename);
    if (!run) continue;
    if (!refCache.has(run.spec)) refCache.set(run.spec, loadReferenceForSpec(run.spec));
    const reference = refCache.get(run.spec) ?? null;
    const scored = scoreRun(run, reference);
    scoredRuns.push(scored);
    const covLabel = scored.jaccard
      ? `cov=${(scored.jaccard.coverageRate * 100).toFixed(1)}%`
      : 'no-ref';
    console.log(
      `[bulk-sweep]  ${run.spec.padEnd(15)} ${run.arch.padEnd(15)} ${run.perEndpointModel.padEnd(40)} findings=${run.findingCount.toString().padStart(4)} clusters=${scored.cluster.uniqueClusters.toString().padStart(4)} ${covLabel}`
    );
    if (!noSnapshot) {
      const { path: snapPath, written } = lockRun(scored);
      if (written) console.log(`[bulk-sweep]   → snapshot ${path.basename(snapPath)}`);
    }
  }

  // Render and write the registry.
  const registryMd = renderRegistry(scoredRuns);
  const registryPath = path.join(EVAL_OUT_DIR, 'EVAL-REGISTRY.md');
  fs.writeFileSync(registryPath, registryMd, 'utf8');
  console.log(`[bulk-sweep] wrote ${path.relative(REPO_ROOT, registryPath)}`);

  // Build predictions for specs that have a reference.
  const refsBySpec = new Map<string, ReferenceTarget>();
  for (const [spec, ref] of refCache.entries()) {
    if (ref) refsBySpec.set(spec, ref);
  }
  const predictions: SpecPrediction[] = [];
  for (const [spec, ref] of refsBySpec.entries()) {
    // Best baseline for this spec: prefer (C-i) two-call + Sonnet+Sonnet if present, else any (C-i), else any.
    const candidates = scoredRuns.filter((s) => s.run.spec === spec);
    const ciSonSon =
      candidates.find(
        (s) => s.run.arch === 'two-call' && /sonnet/i.test(s.run.perEndpointModel) && /sonnet/i.test(s.run.aggregatorModel)
      ) ?? candidates.find((s) => s.run.arch === 'two-call') ?? candidates[0] ?? null;
    predictions.push(predictForSpec(spec, ref, ciSonSon));
  }
  const predictionsMd = renderPredictions(predictions);
  const predictionsPath = path.join(EVAL_OUT_DIR, 'STAGE-A-PREDICTIONS.md');
  fs.writeFileSync(predictionsPath, predictionsMd, 'utf8');
  console.log(`[bulk-sweep] wrote ${path.relative(REPO_ROOT, predictionsPath)}`);

  console.log(`[bulk-sweep] done — ${scoredRuns.length} runs scored, ${predictions.length} specs with predictions`);
}

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) main();
