#!/usr/bin/env tsx
/**
 * Score a RunnerOutput end-to-end (Phase 0 Task #7 glue).
 *
 * Pipeline:
 *   runner.ts (replay)  ─→  score-run.ts (this)  ─→  snapshot.ts (lock/diff)
 *                                              └─→  comparison.ts (vs other)
 *
 * Loads a RunnerOutput JSON (produced by `eval/runner.ts`), runs all scorers
 * (Jaccard + Repetition-Cluster + Classification stub) against each per-run
 * findings list, and writes an enriched JSON with per-run scorer outputs +
 * aggregate stat summaries (mean / p50 / p95 / std) over the N runs.
 *
 * Reference-target lookup:
 *   - If `--reference <path>` is given, use that.
 *   - Else auto-detect: openapi-examples/<spec>/reference/findings.json (preferred)
 *     or .../findings-target-big.md (legacy fallback).
 *   - If neither exists for a spec, Jaccard is skipped for that spec (cluster +
 *     classification still run).
 *
 * CLI:
 *   npx tsx eval/score-run.ts <runner-output-json> [--reference <path>] [--out <path>]
 *
 * Output: enriched JSON to `<runner-output-json>` with `.scored.json` suffix
 * (or to `--out` path).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { JaccardScorer, type JaccardResult } from './scorers/jaccard.js';
import { RepetitionClusterScorer, type ClusterResult } from './scorers/repetition-cluster.js';
import { ClassificationScorer, type ClassificationResult } from './scorers/classification.js';
import { loadReferenceTarget } from './reference.js';
import type { ReferenceTarget } from './types.js';
import type { RunnerOutput, AggregatedRun, StatSummary } from './runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// =============================================================================
// Output shapes
// =============================================================================

export interface PerRunScores {
  runIndex: number;
  jaccard: JaccardResult | null;
  repetitionCluster: ClusterResult;
  classification: ClassificationResult;
}

export interface ScoredAggregate {
  /** Ref-coverage stats (null fields when no reference was available). */
  coverageRate: StatSummary | null;
  substantiveCoverageRate: StatSummary | null;
  knowledgeBackedCoverageRate: StatSummary | null;
  llmOnlyCoverageRate: StatSummary | null;
  pureSpectralCoverageRate: StatSummary | null;
  domainKnowledgeCoverageRate: StatSummary | null;

  /** Cluster stats (always present). */
  uniqueClusters: StatSummary;
  repetitionRate: StatSummary;
  largestClusterSize: StatSummary;
}

export interface ScoredAggregatedRun extends AggregatedRun {
  scored: {
    referencePath: string | null;
    referenceFindings: number | null;
    perRun: PerRunScores[];
    aggregate: ScoredAggregate;
  };
}

export interface ScoredRunnerOutput {
  configName: string;
  configFile: string;
  startedAt: string;
  totalDurationMs: number;
  perSpec: Record<string, ScoredAggregatedRun>;
}

// =============================================================================
// Stats helpers (duplicated from runner.ts to avoid coupling)
// =============================================================================

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function summarise(xs: number[]): StatSummary {
  return { mean: mean(xs), p50: quantile(xs, 0.5), p95: quantile(xs, 0.95), std: stdev(xs) };
}

// =============================================================================
// Reference auto-detect
// =============================================================================

function autoDetectReferencePath(spec: string): string | null {
  const dir = path.join(REPO_ROOT, 'openapi-examples', spec, 'reference');
  const candidates = ['findings.json', 'findings-target-big.md'];
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// =============================================================================
// Score one AggregatedRun
// =============================================================================

function scoreAggregated(
  agg: AggregatedRun,
  reference: ReferenceTarget | null,
  referencePath: string | null
): ScoredAggregatedRun {
  const perRun: PerRunScores[] = agg.perRun.map((r) => {
    const runMeta = {
      spec: agg.spec,
      architecture: agg.config.architecture,
      perEndpointModel: agg.config.perEndpointModel,
      aggregatorModel: agg.config.aggregatorModel,
      promptVariant: agg.config.promptVariant,
      prePass: agg.config.prePass,
      postPass: agg.config.postPass,
      promptCaching: agg.config.promptCaching,
      costUSD: r.costUSD,
      totalDurationMs: r.durationMs,
      sourcePath: r.sourcePath,
    };
    const repetitionCluster = RepetitionClusterScorer.score({
      reference: null,
      llmFindings: r.findings,
      runMeta,
    });
    const classification = ClassificationScorer.score({
      reference: null,
      llmFindings: r.findings,
      runMeta,
    });
    const jaccard = reference
      ? JaccardScorer.score({ reference, llmFindings: r.findings, runMeta })
      : null;
    return {
      runIndex: r.runIndex,
      jaccard,
      repetitionCluster,
      classification,
    };
  });

  // Aggregate stats over the N runs.
  const haveJaccard = perRun.every((p) => p.jaccard !== null);
  const aggregate: ScoredAggregate = {
    coverageRate: haveJaccard
      ? summarise(perRun.map((p) => p.jaccard!.coverageRate))
      : null,
    substantiveCoverageRate: haveJaccard
      ? summarise(perRun.map((p) => p.jaccard!.substantiveCoverageRate))
      : null,
    knowledgeBackedCoverageRate: haveJaccard
      ? summarise(perRun.map((p) => p.jaccard!.knowledgeBackedCoverageRate))
      : null,
    llmOnlyCoverageRate: haveJaccard
      ? summarise(perRun.map((p) => p.jaccard!.llmOnlyCoverageRate))
      : null,
    pureSpectralCoverageRate: haveJaccard
      ? summarise(perRun.map((p) => p.jaccard!.pureSpectralCoverageRate))
      : null,
    domainKnowledgeCoverageRate: haveJaccard
      ? summarise(perRun.map((p) => p.jaccard!.domainKnowledgeCoverageRate))
      : null,
    uniqueClusters: summarise(perRun.map((p) => p.repetitionCluster.uniqueClusters)),
    repetitionRate: summarise(perRun.map((p) => p.repetitionCluster.repetitionRate)),
    largestClusterSize: summarise(perRun.map((p) => p.repetitionCluster.largestClusterSize)),
  };

  return {
    ...agg,
    scored: {
      referencePath,
      referenceFindings: reference ? reference.findings.length : null,
      perRun,
      aggregate,
    },
  };
}

// =============================================================================
// Main entry
// =============================================================================

export function scoreRunnerOutput(
  runnerOutput: RunnerOutput,
  opts: { referencePath?: string } = {}
): ScoredRunnerOutput {
  const out: ScoredRunnerOutput = {
    configName: runnerOutput.configName,
    configFile: runnerOutput.configFile,
    startedAt: runnerOutput.startedAt,
    totalDurationMs: runnerOutput.totalDurationMs,
    perSpec: {},
  };

  for (const [spec, agg] of Object.entries(runnerOutput.perSpec)) {
    const refPath = opts.referencePath ?? autoDetectReferencePath(spec);
    let reference: ReferenceTarget | null = null;
    if (refPath) {
      try {
        reference = loadReferenceTarget(refPath, spec);
      } catch (err) {
        console.warn(`[score-run] failed to load reference for ${spec} from ${refPath}: ${err instanceof Error ? err.message : String(err)}`);
        reference = null;
      }
    }
    out.perSpec[spec] = scoreAggregated(agg, reference, refPath);
  }

  return out;
}

function fmtPct(s: StatSummary | null): string {
  if (!s) return '—';
  return `${(s.mean * 100).toFixed(1)}% (std ${(s.std * 100).toFixed(2)}pp)`;
}

function fmtNum(s: StatSummary): string {
  return `${s.mean.toFixed(0)} (std ${s.std.toFixed(0)})`;
}

function printSummary(out: ScoredRunnerOutput): void {
  console.log(`\n=== Scored Runner Output: ${out.configName} ===\n`);
  for (const [spec, agg] of Object.entries(out.perSpec)) {
    console.log(`Spec: ${spec}`);
    console.log(`  N runs:                          ${agg.runs}`);
    console.log(`  Reference:                       ${agg.scored.referencePath ?? '(none — Jaccard skipped)'}`);
    if (agg.scored.referenceFindings !== null) {
      console.log(`  Reference findings:              ${agg.scored.referenceFindings}`);
    }
    console.log(`  Findings (mean):                 ${agg.aggregate.findingCount.mean.toFixed(0)} (std ${agg.aggregate.findingCount.std.toFixed(0)})`);
    console.log(`  Unique clusters:                 ${fmtNum(agg.scored.aggregate.uniqueClusters)}`);
    console.log(`  Repetition rate:                 ${fmtPct(agg.scored.aggregate.repetitionRate)}`);
    console.log(`  Largest cluster:                 ${fmtNum(agg.scored.aggregate.largestClusterSize)}`);
    if (agg.scored.aggregate.coverageRate) {
      console.log(`  Coverage (total):                ${fmtPct(agg.scored.aggregate.coverageRate)}`);
      console.log(`  Coverage (substantive):          ${fmtPct(agg.scored.aggregate.substantiveCoverageRate)}`);
      console.log(`  Coverage (LLM-only / pure-NLP):  ${fmtPct(agg.scored.aggregate.llmOnlyCoverageRate)}  ← what only LLM can`);
      console.log(`  Coverage (knowledge-backed):     ${fmtPct(agg.scored.aggregate.knowledgeBackedCoverageRate)}  ← differentiator class`);
      console.log(`  Coverage (pure-spectral):        ${fmtPct(agg.scored.aggregate.pureSpectralCoverageRate)}  ← Stage-A pure-spectral layer scope`);
      console.log(`  Coverage (domain-knowledge):     ${fmtPct(agg.scored.aggregate.domainKnowledgeCoverageRate)}  ← Stage-A domain-knowledge layer scope`);
    }
    console.log('');
  }
}

// =============================================================================
// CLI
// =============================================================================

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  const argvUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  return import.meta.url === argvUrl;
}

if (isCliEntrypoint()) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: npx tsx eval/score-run.ts <runner-output-json> [--reference <path>] [--out <path>]');
    process.exit(0);
  }

  const inputPath = args[0];
  let referencePath: string | undefined;
  let outPath: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--reference' && i + 1 < args.length) {
      referencePath = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--out' && i + 1 < args.length) {
      outPath = path.resolve(args[i + 1]);
      i++;
    }
  }

  const resolvedInput = path.resolve(inputPath);
  const runnerOutput = JSON.parse(fs.readFileSync(resolvedInput, 'utf8')) as RunnerOutput;
  const scored = scoreRunnerOutput(runnerOutput, { referencePath });

  const finalOut = outPath ?? resolvedInput.replace(/\.json$/, '.scored.json');
  fs.writeFileSync(finalOut, JSON.stringify(scored, null, 2) + '\n', 'utf8');
  printSummary(scored);
  console.log(`Wrote ${finalOut}`);
}
