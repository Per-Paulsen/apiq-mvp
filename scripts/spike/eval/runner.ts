#!/usr/bin/env tsx
/**
 * Multi-Run-Runner with YAML-Config-Loader (Phase 0 Task #5).
 *
 * Purpose:
 *   - Replace ad-hoc CLI args (`run-arch.ts --arch=… --model=…`) with declarative
 *     YAML config files in `eval-configs/*.yaml`.
 *   - Run each (architecture × spec) configuration N times so we can measure
 *     run-to-run variance (Critical-Review #2: variance was unmessbar with N=1).
 *   - Aggregate per-run metrics (findingCount / costUSD / durationMs / applyCleanRate
 *     / halluRate) into mean / p50 / p95 / std summaries.
 *
 * Modes:
 *   1. REPLAY (Phase 0 testing, free):
 *      Per-spec `replay_from: <path>` keys point to pre-recorded run JSONs in
 *      `specs/big-spec-runs/`. The runner loads those JSONs and treats them as
 *      run outputs. With N=3 the same JSON gets loaded 3 times (zero variance,
 *      but exercises the aggregation code-path end-to-end).
 *
 *   2. LIVE (Phase B, wired since Phase-0 Task #12):
 *      When a spec has no `replay_from`, the runner imports `runArch` from
 *      `run-arch.ts` and invokes it. The result is mapped back into the same
 *      RecordedRun shape the replay-loader understands so aggregation +
 *      output-writing are unchanged. Live runs require:
 *        - `OPENROUTER_API_KEY` (Phase 1 of two-call; bigger-context default
 *          provider)
 *        - `ANTHROPIC_API_KEY` (Phase 2 aggregator of two-call;
 *          bigger-context with `--provider=anthropic-direct` — currently the
 *          eval-runner always uses the default OpenRouter provider for
 *          bigger-context, but Anthropic-direct may be added later)
 *      and will refuse to start if either is missing (unless `dry_run: true`).
 *
 *   3. DRY-RUN (safety net for development):
 *      When the YAML has `dry_run: true`, the runner resolves all call-args
 *      (architecture, models, prompt-variant, spec-source-path, would-be
 *      output-path) and prints them, then exits 0 without invoking the LLM
 *      and without writing a runner-output JSON. Use this to validate config
 *      files and the wiring path before flipping to a real (paid) run.
 *
 * CLI:
 *   npx tsx eval/runner.ts <config-yaml-path> [--replay]
 *
 *   The `--replay` flag is informational; per-spec replay is driven by the
 *   `replay_from` map in the YAML, not by this flag.
 *
 * Output:
 *   specs/big-spec-runs/eval/<config-name>__<timestamp>.json
 *   (dry-run skips this write)
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';

import type { Finding } from '../schema.js';
import { runArch, type Arch, type RunArchResult } from '../run-arch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const RUNS_DIR = path.join(REPO_ROOT, 'specs', 'big-spec-runs');
const EVAL_OUT_DIR = path.join(RUNS_DIR, 'eval');

// =============================================================================
// YAML config schema
// =============================================================================

const ArchitectureSchema = z.enum(['two-call', 'bigger-context']);
const PrePassSchema = z.union([z.literal('deterministic-layer'), z.null()]);
const PostPassSchema = z.union([
  z.literal('rollup-cluster'),
  z.literal('anti-pattern-d-fp'),
  z.null(),
]);

const EvalConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),

  architecture: ArchitectureSchema,
  per_endpoint_model: z.string().min(1),
  aggregator_model: z.string().min(1),
  prompt_variant: z.string().min(1),

  pre_pass: PrePassSchema.default(null),
  post_pass: PostPassSchema.default(null),
  prompt_caching: z.boolean().default(false),

  runs: z.number().int().positive().default(1),

  specs: z.array(z.string().min(1)).min(1),

  /**
   * Optional per-spec replay map. Keys must be a subset of `specs`.
   * Values are paths (absolute or relative to repo root) to pre-recorded run
   * JSONs. If a spec is in this map, its N runs all load this same JSON
   * (zero variance, exercises aggregation only). Phase 0 testing path.
   */
  replay_from: z.record(z.string(), z.string()).default({}),

  /**
   * If true, the runner resolves the call-args and prints them, then exits
   * cleanly without making any LLM call and without writing a runner-output
   * JSON. Use this to validate config files + the live-mode wiring before
   * flipping to a real (paid) run. Default false.
   */
  dry_run: z.boolean().default(false),
});

export type EvalConfig = z.infer<typeof EvalConfigSchema>;

// =============================================================================
// Output types (exported for downstream scorers)
// =============================================================================

export interface PerRunMetrics {
  runIndex: number;
  findingCount: number;
  costUSD: number;
  durationMs: number;
  applyCleanRate: number;
  halluRate: number;
  findings: Finding[];
  sourcePath?: string;
}

export interface StatSummary {
  mean: number;
  p50: number;
  p95: number;
  std: number;
}

export interface AggregatedRun {
  config: {
    name: string;
    architecture: string;
    promptVariant: string;
    perEndpointModel: string;
    aggregatorModel: string;
    prePass: string | null;
    postPass: string | null;
    promptCaching: boolean;
  };
  spec: string;
  runs: number;
  perRun: PerRunMetrics[];
  aggregate: {
    findingCount: StatSummary;
    costUSD: StatSummary;
    durationMs: StatSummary;
    applyCleanRate: StatSummary;
    halluRate: StatSummary;
  };
}

export interface RunnerOutput {
  configName: string;
  configFile: string;
  startedAt: string;
  totalDurationMs: number;
  perSpec: Record<string, AggregatedRun>;
}

// =============================================================================
// Stats helpers
// =============================================================================

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  // Linear interpolation between closest ranks (R-7 / Excel default).
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance =
    xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1); // sample std (n-1)
  return Math.sqrt(variance);
}

function summarise(xs: number[]): StatSummary {
  return {
    mean: mean(xs),
    p50: quantile(xs, 0.5),
    p95: quantile(xs, 0.95),
    std: std(xs),
  };
}

// =============================================================================
// Replay-mode loader
// =============================================================================

/**
 * Run-output JSON shape we expect from `specs/big-spec-runs/*.json`.
 * Both `bigger-context` and `two-call` outputs have these top-level fields,
 * though some are nested differently (two-call has phase1/phase2 cost split,
 * bigger-context has a flat tokensIn/Out + costUSD).
 */
interface RecordedRun {
  findings?: Finding[];
  costUSD?: number | null;
  totalDurationMs?: number;
  durationMs?: number; // bigger-context flavour
  summary?: {
    totalFindings?: number;
    applyCleanRate?: number;
    hallucinatedRate?: number;
  };
  patchValidation?: Array<{
    findingIndex?: number;
    applyClean?: boolean;
    hallucinationCheck?: { hallucinated?: boolean };
  }>;
}

/**
 * Load a recorded run JSON and extract the per-run metrics. Falls back to
 * deriving applyCleanRate / halluRate from the patchValidation array if the
 * top-level summary block is absent (not the case for current outputs, but
 * future-proofs the loader).
 */
function loadRecordedRun(filepath: string, runIndex: number): PerRunMetrics {
  if (!fs.existsSync(filepath)) {
    throw new Error(`replay_from path does not exist: ${filepath}`);
  }
  const raw = fs.readFileSync(filepath, 'utf8');
  let parsed: RecordedRun;
  try {
    parsed = JSON.parse(raw) as RecordedRun;
  } catch (err) {
    throw new Error(
      `Failed to parse replay JSON ${filepath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const findings = parsed.findings ?? [];
  const costUSD = typeof parsed.costUSD === 'number' ? parsed.costUSD : 0;
  const durationMs =
    typeof parsed.totalDurationMs === 'number'
      ? parsed.totalDurationMs
      : typeof parsed.durationMs === 'number'
      ? parsed.durationMs
      : 0;

  // Prefer the top-level summary block when present (current run shape).
  let applyCleanRate: number;
  let halluRate: number;

  if (
    parsed.summary &&
    typeof parsed.summary.applyCleanRate === 'number' &&
    typeof parsed.summary.hallucinatedRate === 'number'
  ) {
    applyCleanRate = parsed.summary.applyCleanRate;
    halluRate = parsed.summary.hallucinatedRate;
  } else if (Array.isArray(parsed.patchValidation) && parsed.patchValidation.length > 0) {
    // Derive from per-finding validation entries.
    const total = parsed.patchValidation.length;
    const cleanCount = parsed.patchValidation.filter((p) => p.applyClean === true).length;
    const halluCount = parsed.patchValidation.filter(
      (p) => p.hallucinationCheck?.hallucinated === true
    ).length;
    applyCleanRate = total === 0 ? 0 : cleanCount / total;
    halluRate = total === 0 ? 0 : halluCount / total;
  } else {
    // Last resort: leave as 0 with a note in stderr — downstream scorers
    // should treat this as missing data, not as a 100% clean run.
    process.stderr.write(
      `[runner] WARN: ${filepath} has neither summary{applyCleanRate,hallucinatedRate} ` +
        `nor patchValidation[]; applyCleanRate / halluRate set to 0.\n`
    );
    applyCleanRate = 0;
    halluRate = 0;
  }

  return {
    runIndex,
    findingCount: findings.length,
    costUSD,
    durationMs,
    applyCleanRate,
    halluRate,
    findings,
    sourcePath: filepath,
  };
}

// =============================================================================
// Live-mode (calls runArch from ../run-arch.ts)
// =============================================================================

/**
 * Convert a `RunArchResult` into the `PerRunMetrics` shape the aggregation
 * pipeline expects. The two-call branch and the bigger-context branch have
 * slightly different result shapes, so we normalise here:
 *   - findings:        flat Finding[] (post-dedup for two-call)
 *   - costUSD:         total USD across all phases
 *   - durationMs:      wall-clock total
 *   - applyCleanRate:  fraction of findings whose patchOps applied cleanly
 *   - halluRate:       fraction of findings flagged as hallucinated
 */
function archResultToMetrics(
  archRes: RunArchResult,
  runIndex: number
): PerRunMetrics {
  if (archRes.kind === 'two-call') {
    const r = archRes.result;
    return {
      runIndex,
      findingCount: r.findings.length,
      costUSD: r.costUSD,
      durationMs: r.totalDurationMs,
      applyCleanRate: r.summary.applyCleanRate,
      halluRate: r.summary.hallucinatedRate,
      findings: r.findings,
    };
  }

  // bigger-context
  const r = archRes.result;
  return {
    runIndex,
    findingCount: r.findings.length,
    costUSD: r.costUSD ?? 0,
    durationMs: r.durationMs,
    applyCleanRate: r.summary.applyCleanRate,
    halluRate: r.summary.hallucinatedRate,
    findings: r.findings,
  };
}

/**
 * Live-mode entrypoint. Dispatches into `runArch()` from `../run-arch.ts` with
 * the YAML-config fields mapped onto `RunArchArgs`.
 *
 * Pre-flight env-var checks are done by the caller before this is invoked
 * (so we can fail fast for ALL specs at once rather than once per run).
 */
async function runLive(
  config: EvalConfig,
  spec: string,
  runIndex: number
): Promise<PerRunMetrics> {
  process.stderr.write(
    `[runner]   live run ${runIndex + 1}: arch=${config.architecture} ` +
      `perEndpoint=${config.per_endpoint_model} aggregator=${config.aggregator_model} ` +
      `prompt=${config.prompt_variant} spec=${spec}\n`
  );

  const archRes = await runArch({
    arch: config.architecture as Arch,
    specName: spec,
    perEndpointModel: config.per_endpoint_model,
    aggregatorModel: config.aggregator_model,
    promptVariant: config.prompt_variant,
    // Provider routing is currently driven by run-arch.ts defaults
    // (two-call always uses OpenRouter for phase 1 + Anthropic-direct for
    // phase 2; bigger-context defaults to OpenRouter). The YAML config has
    // no `provider` field by design — add one if Phase B needs it.
  });

  return archResultToMetrics(archRes, runIndex);
}

// =============================================================================
// Live-mode preflight (env-vars, dry-run resolution)
// =============================================================================

/**
 * Resolve the spec source-path that `runArch()` will load. Mirrors the
 * candidates list in `run-arch.ts:loadSpecFile()` so the dry-run output
 * matches what live-mode would actually open.
 */
function resolveSpecSourcePath(spec: string): string | null {
  const baseDir = path.join(REPO_ROOT, 'openapi-examples', spec);
  for (const c of ['spec.json', 'spec.yaml', 'spec.yml']) {
    const p = path.join(baseDir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Predicted output filename for a CLI `run-arch.ts` invocation. The eval
 * runner does NOT actually write this file (it writes its own aggregated
 * output to `specs/big-spec-runs/eval/<config>__<timestamp>.json`), but it's
 * shown in dry-run output for traceability — i.e. "what would `run-arch.ts`
 * have written if invoked standalone with these args".
 */
function predictRunArchOutputPath(arch: Arch, spec: string): string {
  if (arch === 'two-call') {
    return path.join(RUNS_DIR, `haiku4-5_x_sonnet4-6__two-call__${spec}.json`);
  }
  // bigger-context — model-tag depends on the actual returned model, not
  // knowable up front. Show a placeholder.
  return path.join(RUNS_DIR, `<model-tag>__${arch}__${spec}.json`);
}

interface DryRunPlan {
  spec: string;
  architecture: Arch;
  perEndpointModel: string;
  aggregatorModel: string;
  promptVariant: string;
  specSourcePath: string | null;
  wouldWriteRunnerOutputTo: string;
  predictedRunArchOutputPath: string;
}

function buildDryRunPlan(
  config: EvalConfig,
  spec: string,
  wouldWriteRunnerOutputTo: string
): DryRunPlan {
  return {
    spec,
    architecture: config.architecture as Arch,
    perEndpointModel: config.per_endpoint_model,
    aggregatorModel: config.aggregator_model,
    promptVariant: config.prompt_variant,
    specSourcePath: resolveSpecSourcePath(spec),
    wouldWriteRunnerOutputTo,
    predictedRunArchOutputPath: predictRunArchOutputPath(
      config.architecture as Arch,
      spec
    ),
  };
}

function printDryRunPlan(config: EvalConfig, plans: DryRunPlan[]): void {
  // eslint-disable-next-line no-console
  console.log('\n=== Eval Runner DRY-RUN ===');
  // eslint-disable-next-line no-console
  console.log(`config:        ${config.name}`);
  // eslint-disable-next-line no-console
  console.log(`description:   ${config.description.trim() || '(none)'}`);
  // eslint-disable-next-line no-console
  console.log(`architecture:  ${config.architecture}`);
  // eslint-disable-next-line no-console
  console.log(`per_endpoint:  ${config.per_endpoint_model}`);
  // eslint-disable-next-line no-console
  console.log(`aggregator:    ${config.aggregator_model}`);
  // eslint-disable-next-line no-console
  console.log(`prompt:        ${config.prompt_variant}`);
  // eslint-disable-next-line no-console
  console.log(`pre_pass:      ${config.pre_pass ?? '(none)'}`);
  // eslint-disable-next-line no-console
  console.log(`post_pass:     ${config.post_pass ?? '(none)'}`);
  // eslint-disable-next-line no-console
  console.log(`prompt_cache:  ${config.prompt_caching}`);
  // eslint-disable-next-line no-console
  console.log(`runs:          ${config.runs}`);
  // eslint-disable-next-line no-console
  console.log(`specs:         [${config.specs.join(', ')}]`);
  // eslint-disable-next-line no-console
  console.log('');
  for (const p of plans) {
    // eslint-disable-next-line no-console
    console.log(`  spec: ${p.spec}`);
    // eslint-disable-next-line no-console
    console.log(`    spec source:                 ${p.specSourcePath ?? '(NOT FOUND under openapi-examples/)'}`);
    // eslint-disable-next-line no-console
    console.log(`    runner-output (would skip):  ${path.relative(REPO_ROOT, p.wouldWriteRunnerOutputTo)}`);
    // eslint-disable-next-line no-console
    console.log(`    run-arch CLI would write to: ${path.relative(REPO_ROOT, p.predictedRunArchOutputPath)}`);
  }
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('dry_run=true → exiting WITHOUT calling LLM and WITHOUT writing runner output JSON.');
}

/**
 * Verify env-vars required for the live (non-dry) path. Two-call needs both
 * OpenRouter (phase 1) and Anthropic-direct (phase 2); bigger-context needs
 * just OpenRouter (provider routing is currently always OpenRouter from the
 * eval-runner; bigger-context with --provider=anthropic-direct is CLI-only).
 */
function preflightLiveEnvVars(config: EvalConfig): void {
  const missing: string[] = [];
  if (!process.env.OPENROUTER_API_KEY) missing.push('OPENROUTER_API_KEY');
  if (config.architecture === 'two-call' && !process.env.ANTHROPIC_API_KEY) {
    missing.push('ANTHROPIC_API_KEY');
  }
  if (missing.length > 0) {
    fail(
      `Live-mode (no replay_from for at least one spec) requires env-vars: ${missing.join(', ')}.\n` +
        `Set them in scripts/spike/.env or your shell, OR set "dry_run: true" in the config to ` +
        `skip the LLM call.`
    );
  }
}

// =============================================================================
// Aggregation
// =============================================================================

function aggregate(
  config: EvalConfig,
  spec: string,
  perRun: PerRunMetrics[]
): AggregatedRun {
  const findingCounts = perRun.map((r) => r.findingCount);
  const costs = perRun.map((r) => r.costUSD);
  const durations = perRun.map((r) => r.durationMs);
  const cleans = perRun.map((r) => r.applyCleanRate);
  const hallus = perRun.map((r) => r.halluRate);

  return {
    config: {
      name: config.name,
      architecture: config.architecture,
      promptVariant: config.prompt_variant,
      perEndpointModel: config.per_endpoint_model,
      aggregatorModel: config.aggregator_model,
      prePass: config.pre_pass,
      postPass: config.post_pass,
      promptCaching: config.prompt_caching,
    },
    spec,
    runs: perRun.length,
    perRun,
    aggregate: {
      findingCount: summarise(findingCounts),
      costUSD: summarise(costs),
      durationMs: summarise(durations),
      applyCleanRate: summarise(cleans),
      halluRate: summarise(hallus),
    },
  };
}

// =============================================================================
// CLI
// =============================================================================

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`error: ${msg}`);
  process.exit(1);
}

function parseArgs(): { configPath: string; replayFlag: boolean } {
  const args = process.argv.slice(2);
  let configPath: string | null = null;
  let replayFlag = false;

  for (const a of args) {
    if (a === '--replay') replayFlag = true;
    else if (a === '--help' || a === '-h') {
      // eslint-disable-next-line no-console
      console.log(
        'Usage: npx tsx eval/runner.ts <config-yaml-path> [--replay]\n\n' +
          '  config-yaml-path  Path to YAML config (e.g. eval-configs/c-i-baseline-stripe.yaml)\n' +
          '  --replay          Informational. Per-spec replay is driven by the `replay_from`\n' +
          '                    map in the YAML, not by this flag. Live-mode is selected\n' +
          '                    automatically for any spec WITHOUT a replay_from entry\n' +
          '                    (currently throws "Phase B work").'
      );
      process.exit(0);
    } else if (a.startsWith('--')) fail(`Unknown flag: ${a}`);
    else if (configPath === null) configPath = a;
    else fail(`Unexpected positional arg: ${a}`);
  }

  if (!configPath) {
    fail(
      'Usage: npx tsx eval/runner.ts <config-yaml-path> [--replay]   (--help for details)'
    );
  }

  return { configPath, replayFlag };
}

function loadConfig(configPath: string): EvalConfig {
  const absPath = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(absPath)) fail(`Config file not found: ${absPath}`);
  const raw = fs.readFileSync(absPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    fail(`Failed to parse YAML ${absPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const validated = EvalConfigSchema.safeParse(parsed);
  if (!validated.success) {
    fail(`Config-schema validation failed for ${absPath}:\n${validated.error.message}`);
  }

  // Validate replay_from keys are a subset of specs
  const specsSet = new Set(validated.data.specs);
  for (const key of Object.keys(validated.data.replay_from)) {
    if (!specsSet.has(key)) {
      fail(
        `replay_from key "${key}" is not in specs[] (allowed: ${validated.data.specs.join(', ')})`
      );
    }
  }

  return validated.data;
}

function resolveReplayPath(replayPath: string): string {
  return path.isAbsolute(replayPath) ? replayPath : path.resolve(REPO_ROOT, replayPath);
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function timestampForFilename(date: Date): string {
  // YYYYMMDD-HHmmss
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    '-' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMs(n: number): string {
  if (n >= 60_000) return `${(n / 60_000).toFixed(1)}min`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}s`;
  return `${n.toFixed(0)}ms`;
}

function printSummary(output: RunnerOutput, replayMode: boolean): void {
  // eslint-disable-next-line no-console
  console.log(`\n=== Eval Runner Summary ===`);
  // eslint-disable-next-line no-console
  console.log(`config:        ${output.configName}`);
  // eslint-disable-next-line no-console
  console.log(`config-file:   ${output.configFile}`);
  // eslint-disable-next-line no-console
  console.log(`mode:          ${replayMode ? 'replay (per-spec map)' : 'mixed (replay where mapped, else live)'}`);
  // eslint-disable-next-line no-console
  console.log(`startedAt:     ${output.startedAt}`);
  // eslint-disable-next-line no-console
  console.log(`totalDuration: ${fmtMs(output.totalDurationMs)}`);
  // eslint-disable-next-line no-console
  console.log('');

  for (const [spec, agg] of Object.entries(output.perSpec)) {
    // eslint-disable-next-line no-console
    console.log(`  spec: ${spec}  (N=${agg.runs})`);
    // eslint-disable-next-line no-console
    console.log(
      `    findingCount   mean=${agg.aggregate.findingCount.mean.toFixed(1)}  ` +
        `p50=${agg.aggregate.findingCount.p50.toFixed(1)}  ` +
        `p95=${agg.aggregate.findingCount.p95.toFixed(1)}  ` +
        `std=${agg.aggregate.findingCount.std.toFixed(2)}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `    costUSD        mean=${fmtMoney(agg.aggregate.costUSD.mean)}  ` +
        `p50=${fmtMoney(agg.aggregate.costUSD.p50)}  ` +
        `p95=${fmtMoney(agg.aggregate.costUSD.p95)}  ` +
        `std=${agg.aggregate.costUSD.std.toFixed(4)}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `    durationMs     mean=${fmtMs(agg.aggregate.durationMs.mean)}  ` +
        `p50=${fmtMs(agg.aggregate.durationMs.p50)}  ` +
        `p95=${fmtMs(agg.aggregate.durationMs.p95)}  ` +
        `std=${agg.aggregate.durationMs.std.toFixed(0)}ms`
    );
    // eslint-disable-next-line no-console
    console.log(
      `    applyCleanRate mean=${fmtPct(agg.aggregate.applyCleanRate.mean)}  ` +
        `p50=${fmtPct(agg.aggregate.applyCleanRate.p50)}  ` +
        `p95=${fmtPct(agg.aggregate.applyCleanRate.p95)}  ` +
        `std=${agg.aggregate.applyCleanRate.std.toFixed(4)}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `    halluRate      mean=${fmtPct(agg.aggregate.halluRate.mean)}  ` +
        `p50=${fmtPct(agg.aggregate.halluRate.p50)}  ` +
        `p95=${fmtPct(agg.aggregate.halluRate.p95)}  ` +
        `std=${agg.aggregate.halluRate.std.toFixed(4)}`
    );
  }
}

async function main(): Promise<void> {
  const { configPath, replayFlag } = parseArgs();
  const config = loadConfig(configPath);
  const startMs = Date.now();
  const startedAt = new Date(startMs).toISOString();

  process.stderr.write(
    `[runner] config="${config.name}" runs=${config.runs} specs=[${config.specs.join(', ')}] ` +
      `replayFlag=${replayFlag} dry_run=${config.dry_run}\n`
  );

  // Determine which specs would go through live-mode (no replay_from entry).
  const liveSpecs = config.specs.filter((s) => !(s in config.replay_from));

  // -------------------------------------------------------------------------
  // DRY-RUN: resolve call-args, print the plan, exit 0 — no LLM calls, no
  // runner-output JSON written.
  // -------------------------------------------------------------------------
  if (config.dry_run) {
    const stamp = timestampForFilename(new Date(startMs));
    const wouldWriteRunnerOutputTo = path.join(
      EVAL_OUT_DIR,
      `${config.name}__${stamp}.json`
    );
    const plans = liveSpecs.map((spec) =>
      buildDryRunPlan(config, spec, wouldWriteRunnerOutputTo)
    );
    printDryRunPlan(config, plans);

    // Surface any spec where the source file isn't found — operator should
    // know before flipping dry_run to false and burning real credits.
    const missing = plans.filter((p) => p.specSourcePath === null);
    if (missing.length > 0) {
      process.stderr.write(
        `\n[runner] WARN: ${missing.length} spec(s) have no source file under openapi-examples/: ` +
          `${missing.map((m) => m.spec).join(', ')}\n`
      );
    }

    if (Object.keys(config.replay_from).length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `\nNote: ${Object.keys(config.replay_from).length} spec(s) have replay_from entries; ` +
          `dry-run does not load these either (no I/O at all in dry-run mode).`
      );
    }
    return;
  }

  // -------------------------------------------------------------------------
  // LIVE / REPLAY path. If any spec lacks replay_from, preflight env-vars
  // before doing any work.
  // -------------------------------------------------------------------------
  if (liveSpecs.length > 0) {
    preflightLiveEnvVars(config);
  }

  const perSpec: Record<string, AggregatedRun> = {};

  for (const spec of config.specs) {
    const replayMapEntry = config.replay_from[spec];
    process.stderr.write(
      `[runner] spec=${spec} ${replayMapEntry ? `replay=${replayMapEntry}` : 'live'} N=${config.runs}\n`
    );

    const perRun: PerRunMetrics[] = [];
    for (let i = 0; i < config.runs; i++) {
      let metrics: PerRunMetrics;
      if (replayMapEntry) {
        const absReplayPath = resolveReplayPath(replayMapEntry);
        metrics = loadRecordedRun(absReplayPath, i);
      } else {
        // Live mode — calls runArch from ../run-arch.ts.
        metrics = await runLive(config, spec, i);
      }
      process.stderr.write(
        `[runner]   run ${i + 1}/${config.runs}: findings=${metrics.findingCount} ` +
          `cost=${fmtMoney(metrics.costUSD)} duration=${fmtMs(metrics.durationMs)}\n`
      );
      perRun.push(metrics);
    }

    perSpec[spec] = aggregate(config, spec, perRun);
  }

  const totalDurationMs = Date.now() - startMs;

  const output: RunnerOutput = {
    configName: config.name,
    configFile: path.isAbsolute(configPath)
      ? path.relative(REPO_ROOT, configPath)
      : configPath,
    startedAt,
    totalDurationMs,
    perSpec,
  };

  ensureDir(EVAL_OUT_DIR);
  const stamp = timestampForFilename(new Date(startMs));
  const outPath = path.join(EVAL_OUT_DIR, `${config.name}__${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

  // Sanity: did every spec mapped to replay actually load?
  const replayOnly = Object.keys(config.replay_from).length === config.specs.length;
  printSummary(output, replayOnly);

  // eslint-disable-next-line no-console
  console.log(`\nWritten: ${path.relative(REPO_ROOT, outPath)}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
