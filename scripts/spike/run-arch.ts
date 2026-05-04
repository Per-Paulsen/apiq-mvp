#!/usr/bin/env tsx
/**
 * apiq Big-Spec Architecture Spike harness (Epic 09).
 *
 * Usage:
 *   npx tsx run-arch.ts --arch=<bigger-context|chunking|two-call> <spec-name> [--model=<id>]
 *
 * Examples:
 *   npx tsx run-arch.ts --arch=bigger-context stripe-full
 *   npx tsx run-arch.ts --arch=bigger-context pagerduty-full --model=anthropic/claude-sonnet-4.6
 *
 * - architecture variant resolves to the dispatcher in this file
 * - spec-name resolves to ../../openapi-examples/<spec-name>/spec.{json,yaml,yml}
 * - bigger-context reuses prompts/v4.ts verbatim — no per-architecture prompt
 *   adaptation in this baseline scaffold (chunking and two-call architectures
 *   would each get their own prompts in their own dispatcher files).
 *
 * Output: ../../specs/big-spec-runs/<arch>__<spec-name>.json
 *
 * Cost-discipline: this script is the entry point that actually spends LLM money.
 * Always token-count-precheck a spec first via `tsx token-count-precheck.ts` and
 * verify the run will fit the chosen model's context window before invoking.
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { Operation } from 'fast-json-patch';

import { callLLM as callOpenRouter } from './openrouter.js';
import { callLLM as callAnthropicDirect } from './anthropic-direct.js';
import { OutputSchema, type Output, type Finding } from './schema.js';
import { validatePatchOps, type PatchValidationResult } from './validate-patches.js';
import { cycleStripSpec } from './stringify-spec.js';
import { scoreCoverage, type CoverageResult } from './score-coverage.js';
import { runTwoCall, type TwoCallRunResult } from './two-call-dispatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = __dirname;
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');
const RUNS_DIR = path.join(REPO_ROOT, 'specs', 'big-spec-runs');

type Arch = 'bigger-context' | 'chunking' | 'two-call';
const ALL_ARCHS: ReadonlyArray<Arch> = ['bigger-context', 'chunking', 'two-call'];

type Provider = 'openrouter' | 'anthropic-direct';
const ALL_PROVIDERS: ReadonlyArray<Provider> = ['openrouter', 'anthropic-direct'];

// Per-token rates for current OpenRouter long-context models (USD per token).
// Reference (May 2026): https://openrouter.ai/{model-id}
const PRICING_PER_TOKEN: Record<string, { in: number; out: number }> = {
  'anthropic/claude-sonnet-4': { in: 3 / 1_000_000, out: 15 / 1_000_000 },
  'anthropic/claude-sonnet-4.5': { in: 3 / 1_000_000, out: 15 / 1_000_000 },
  'anthropic/claude-sonnet-4.6': { in: 3 / 1_000_000, out: 15 / 1_000_000 },
  'anthropic/claude-opus-4.7': { in: 5 / 1_000_000, out: 25 / 1_000_000 },
  'anthropic/claude-haiku-4-5': { in: 1 / 1_000_000, out: 5 / 1_000_000 },
  'google/gemini-2.5-pro': { in: 1.25 / 1_000_000, out: 10 / 1_000_000 },
  'google/gemini-3-flash-preview': { in: 0.5 / 1_000_000, out: 3 / 1_000_000 },
  'x-ai/grok-4.1-fast': { in: 0.2 / 1_000_000, out: 0.5 / 1_000_000 },
  // Anthropic-direct model IDs — Sonnet/Opus 4.x at standard pricing.
  // NOTE: Anthropic charges 2× for the 1M-context tier (>200K input) historically;
  // costs reported here at standard rates may under-count by ~50% at large input.
  // Verify against the Anthropic Console billing dashboard if precise figures matter.
  'claude-sonnet-4-6': { in: 3 / 1_000_000, out: 15 / 1_000_000 },
  'claude-opus-4-7': { in: 5 / 1_000_000, out: 25 / 1_000_000 },
  'claude-haiku-4-5': { in: 1 / 1_000_000, out: 5 / 1_000_000 },
};

interface PromptModule {
  SYSTEM_PROMPT: string;
  buildUserPrompt: (specName: string, specJson: object) => string;
}

interface PerFindingValidation extends PatchValidationResult {
  findingIndex: number;
}

interface RunResult {
  arch: Arch;
  specName: string;
  promptVariant: string;
  model: string;
  startedAt: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  costUSD: number | null;
  findings: Finding[];
  patchValidation: PerFindingValidation[];
  coverage: CoverageResult | null;
  summary: {
    totalFindings: number;
    applyCleanRate: number;
    hallucinatedCount: number;
    hallucinatedRate: number;
    coverageRate: number | null;
  };
}

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`error: ${msg}`);
  process.exit(1);
}

interface ParsedArgs {
  arch: Arch;
  specName: string;
  modelOverride: string | null;
  promptVariant: string;
  provider: Provider;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let arch: string | null = null;
  let specName: string | null = null;
  let modelOverride: string | null = null;
  let promptVariant = 'v4';
  let provider: Provider = 'openrouter';

  for (const a of args) {
    if (a.startsWith('--arch=')) arch = a.slice('--arch='.length);
    else if (a.startsWith('--model=')) modelOverride = a.slice('--model='.length);
    else if (a.startsWith('--prompt=')) promptVariant = a.slice('--prompt='.length);
    else if (a.startsWith('--provider=')) {
      const v = a.slice('--provider='.length);
      if (!ALL_PROVIDERS.includes(v as Provider)) {
        fail(`Unknown --provider=${v}. Allowed: ${ALL_PROVIDERS.join(' | ')}`);
      }
      provider = v as Provider;
    } else if (a.startsWith('--')) fail(`Unknown flag: ${a}`);
    else specName = a;
  }

  if (!arch || !specName) {
    fail(
      'Usage: npx tsx run-arch.ts --arch=<bigger-context|chunking|two-call> <spec-name> ' +
        '[--model=<id>] [--prompt=<variant>] [--provider=openrouter|anthropic-direct]'
    );
  }
  if (!ALL_ARCHS.includes(arch as Arch)) {
    fail(`Unknown --arch=${arch}. Allowed: ${ALL_ARCHS.join(' | ')}`);
  }

  return { arch: arch as Arch, specName, modelOverride, promptVariant, provider };
}

function loadSpecFile(specName: string): { specPath: string; specJson: unknown } {
  const baseDir = path.join(EXAMPLES_DIR, specName);
  const candidates = ['spec.json', 'spec.yaml', 'spec.yml'];
  let specPath: string | null = null;
  for (const c of candidates) {
    const p = path.join(baseDir, c);
    if (fs.existsSync(p)) {
      specPath = p;
      break;
    }
  }
  if (!specPath) {
    fail(
      `No spec file found for "${specName}". Looked for: ${candidates
        .map((c) => path.join(baseDir, c))
        .join(', ')}`
    );
  }
  const raw = fs.readFileSync(specPath, 'utf8');
  const ext = path.extname(specPath).toLowerCase();
  let specJson: unknown;
  try {
    specJson = ext === '.json' ? JSON.parse(raw) : YAML.parse(raw);
  } catch (err) {
    fail(`Failed to parse ${specPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { specPath, specJson };
}

async function loadPromptModule(variant: string): Promise<PromptModule> {
  const promptPath = path.join(SPIKE_DIR, 'prompts', `${variant}.ts`);
  if (!fs.existsSync(promptPath)) fail(`Prompt variant not found at ${promptPath}`);
  const url = pathToFileURL(promptPath).href;
  const mod = (await import(url)) as Partial<PromptModule>;
  if (typeof mod.SYSTEM_PROMPT !== 'string') fail(`Prompt module missing SYSTEM_PROMPT`);
  if (typeof mod.buildUserPrompt !== 'function') fail(`Prompt module missing buildUserPrompt`);
  return { SYSTEM_PROMPT: mod.SYSTEM_PROMPT, buildUserPrompt: mod.buildUserPrompt };
}

async function dereferenceSpec(specJson: unknown): Promise<object> {
  const clone =
    typeof structuredClone === 'function'
      ? structuredClone(specJson)
      : JSON.parse(JSON.stringify(specJson));
  const dereffed = await SwaggerParser.dereference(
    clone as Parameters<typeof SwaggerParser.dereference>[0]
  );
  return dereffed as object;
}

function computeCostUSD(model: string, tokensIn: number, tokensOut: number): number | null {
  const rate = PRICING_PER_TOKEN[model];
  if (!rate) return null;
  return tokensIn * rate.in + tokensOut * rate.out;
}

/**
 * Architecture (A) — Bigger Context.
 * Single LLM call with the v4 prompt verbatim against the dereferenced spec.
 * Caller is responsible for selecting a model whose context window fits the spec.
 *
 * Dispatches between OpenRouter and Anthropic-direct based on the provider arg.
 */
async function runBiggerContext(
  promptMod: PromptModule,
  specName: string,
  derefSpec: object,
  modelOverride: string | null,
  provider: Provider
): Promise<{
  raw: string;
  parsedOutput: Output;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  model: string;
}> {
  // OpenRouter reads model from process.env.OPENROUTER_MODEL; Anthropic-direct
  // reads from a function arg. Set the env-var only when going through OpenRouter.
  const prevORModel = process.env.OPENROUTER_MODEL;
  if (provider === 'openrouter' && modelOverride) {
    process.env.OPENROUTER_MODEL = modelOverride;
  }

  try {
    const userPrompt = promptMod.buildUserPrompt(specName, derefSpec);
    let lastSchemaErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r =
        provider === 'anthropic-direct'
          ? await callAnthropicDirect(
              { system: promptMod.SYSTEM_PROMPT, user: userPrompt },
              modelOverride ?? undefined
            )
          : await callOpenRouter({ system: promptMod.SYSTEM_PROMPT, user: userPrompt });
      const parsed = OutputSchema.safeParse(r.parsed);
      if (parsed.success) {
        return {
          raw: r.raw,
          parsedOutput: parsed.data,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          durationMs: r.durationMs,
          model: r.model,
        };
      }
      lastSchemaErr = parsed.error;
      // eslint-disable-next-line no-console
      console.error(
        `[run-arch] zod validation failed (attempt ${attempt + 1}/2): ${parsed.error.message}`
      );
    }
    throw new Error(
      `Output failed zod schema validation twice. Last error: ${
        lastSchemaErr instanceof Error ? lastSchemaErr.message : String(lastSchemaErr)
      }`
    );
  } finally {
    if (provider === 'openrouter' && modelOverride) {
      if (prevORModel === undefined) delete process.env.OPENROUTER_MODEL;
      else process.env.OPENROUTER_MODEL = prevORModel;
    }
  }
}

function summarize(
  perFinding: PerFindingValidation[],
  coverage: CoverageResult | null
): RunResult['summary'] {
  const total = perFinding.length;
  const applyCleanCount = perFinding.filter((p) => p.applyClean).length;
  const hallucinatedCount = perFinding.filter((p) => p.hallucinationCheck.hallucinated).length;
  return {
    totalFindings: total,
    applyCleanRate: total === 0 ? 0 : applyCleanCount / total,
    hallucinatedCount,
    hallucinatedRate: total === 0 ? 0 : hallucinatedCount / total,
    coverageRate: coverage ? coverage.coverageRate : null,
  };
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

async function main(): Promise<void> {
  const { arch, specName, modelOverride, promptVariant, provider } = parseArgs();

  if (arch === 'chunking') {
    fail(
      `Architecture "chunking" not implemented — superseded by --arch=two-call which is the ` +
        `better-designed multi-call architecture for big specs (PRD §4 Architecture (C)).`
    );
  }

  if (arch === 'two-call') {
    // Architecture (C) Two-Call: separate dispatcher; doesn't use prompts/v4.ts.
    const { specJson } = loadSpecFile(specName);
    process.stderr.write(`[run-arch] dereferencing ${specName} ...\n`);
    const derefSpec = await dereferenceSpec(specJson);
    const cycleStripped = cycleStripSpec(derefSpec) as object;

    const perEndpointModel = process.env.TWO_CALL_PER_ENDPOINT_MODEL || 'anthropic/claude-haiku-4-5';
    const aggregatorModel = modelOverride || process.env.TWO_CALL_AGGREGATOR_MODEL || 'anthropic/claude-sonnet-4.6';
    const concurrency = process.env.TWO_CALL_CONCURRENCY
      ? parseInt(process.env.TWO_CALL_CONCURRENCY, 10)
      : 10;

    process.stderr.write(
      `[run-arch] arch=two-call spec=${specName} perEndpoint=${perEndpointModel} aggregator=${aggregatorModel} concurrency=${concurrency}\n`
    );

    const result: TwoCallRunResult = await runTwoCall({
      specName,
      cycleStrippedSpec: cycleStripped,
      perEndpointModel,
      aggregatorModel,
      concurrency,
    });

    // Optional coverage scoring against per-spec reference target
    const referencePath = path.join(EXAMPLES_DIR, specName, 'reference', 'findings-target-big.md');
    let coverage: CoverageResult | null = null;
    if (fs.existsSync(referencePath)) {
      try {
        coverage = scoreCoverage(referencePath, result.findings);
      } catch (err) {
        process.stderr.write(
          `[run-arch] coverage scoring failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
    }

    ensureDir(RUNS_DIR);
    const modelTag = `haiku4-5_x_sonnet4-6`;
    const outPath = path.join(RUNS_DIR, `${modelTag}__two-call__${specName}.json`);
    const output = { ...result, coverage };
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

    // Stdout summary
    // eslint-disable-next-line no-console
    console.log(`arch:           two-call`);
    // eslint-disable-next-line no-console
    console.log(`spec:           ${result.specName}`);
    // eslint-disable-next-line no-console
    console.log(`per-endpoint:   ${result.perEndpointModel}`);
    // eslint-disable-next-line no-console
    console.log(`aggregator:     ${result.aggregatorModel}`);
    // eslint-disable-next-line no-console
    console.log(`phase1:         ${result.phase1.slicesOk}/${result.phase1.slicesTotal} ok, $${result.phase1.costUSD.toFixed(4)}`);
    // eslint-disable-next-line no-console
    console.log(`phase2:         ${result.specLevelFindings.length} spec-level findings, $${result.phase2.costUSD.toFixed(4)}`);
    // eslint-disable-next-line no-console
    console.log(`total findings: ${result.summary.totalFindings} (per-endpoint ${result.summary.perEndpointCount} + spec-level ${result.summary.specLevelCount}, after dedup)`);
    // eslint-disable-next-line no-console
    console.log(`apply-clean:    ${(result.summary.applyCleanRate * 100).toFixed(1)}%`);
    // eslint-disable-next-line no-console
    console.log(`hallucinated:   ${result.summary.hallucinatedCount} (${(result.summary.hallucinatedRate * 100).toFixed(1)}%)`);
    if (coverage) {
      // eslint-disable-next-line no-console
      console.log(`coverage:       ${coverage.coveredCount}/${coverage.totalCount} (${(coverage.coverageRate * 100).toFixed(1)}%)`);
    }
    // eslint-disable-next-line no-console
    console.log(`costUSD:        $${result.costUSD.toFixed(4)}`);
    // eslint-disable-next-line no-console
    console.log(`durationMs:     ${result.totalDurationMs}`);
    // eslint-disable-next-line no-console
    console.log(`\nWritten: ${path.relative(REPO_ROOT, outPath)}`);
    return;
  }

  const promptMod = await loadPromptModule(promptVariant);
  const { specJson } = loadSpecFile(specName);

  process.stderr.write(`[run-arch] dereferencing ${specName} ...\n`);
  const derefSpec = await dereferenceSpec(specJson);
  const specForAnalysis = cycleStripSpec(derefSpec) as object;

  const startedAt = new Date().toISOString();
  process.stderr.write(
    `[run-arch] arch=${arch} prompt=${promptVariant} spec=${specName}` +
      ` provider=${provider}${modelOverride ? ` model=${modelOverride}` : ''} → calling LLM ...\n`
  );

  const callResult = await runBiggerContext(
    promptMod,
    specName,
    specForAnalysis,
    modelOverride,
    provider
  );

  const perFinding: PerFindingValidation[] = callResult.parsedOutput.findings.map((f, i) => {
    const v = validatePatchOps(specForAnalysis, f.patchOps as Operation[]);
    return { findingIndex: i, ...v };
  });

  // Optional coverage scoring against per-spec reference target
  // (openapi-examples/<spec>/reference/findings-target-big.md)
  let coverage: CoverageResult | null = null;
  const referencePath = path.join(EXAMPLES_DIR, specName, 'reference', 'findings-target-big.md');
  if (fs.existsSync(referencePath)) {
    try {
      coverage = scoreCoverage(referencePath, callResult.parsedOutput.findings);
      process.stderr.write(
        `[run-arch] coverage: ${coverage.coveredCount}/${coverage.totalCount} ` +
          `(${(coverage.coverageRate * 100).toFixed(1)}%)\n`
      );
    } catch (err) {
      process.stderr.write(
        `[run-arch] coverage scoring failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }

  const summary = summarize(perFinding, coverage);

  const result: RunResult = {
    arch,
    specName,
    promptVariant,
    model: callResult.model,
    startedAt,
    durationMs: callResult.durationMs,
    tokensIn: callResult.tokensIn,
    tokensOut: callResult.tokensOut,
    costUSD: computeCostUSD(callResult.model, callResult.tokensIn, callResult.tokensOut),
    findings: callResult.parsedOutput.findings,
    patchValidation: perFinding,
    coverage,
    summary,
  };

  ensureDir(RUNS_DIR);
  // Include a sanitized model identifier in the output filename so different
  // models on the same arch+spec don't overwrite each other.
  const modelTag = callResult.model.replace(/[^a-zA-Z0-9.-]+/g, '_');
  const outPath = path.join(RUNS_DIR, `${modelTag}__${arch}__${specName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');

  // Stdout summary
  // eslint-disable-next-line no-console
  console.log(`arch:           ${arch}`);
  // eslint-disable-next-line no-console
  console.log(`spec:           ${specName}`);
  // eslint-disable-next-line no-console
  console.log(`model:          ${callResult.model}`);
  // eslint-disable-next-line no-console
  console.log(`tokensIn:       ${callResult.tokensIn}`);
  // eslint-disable-next-line no-console
  console.log(`tokensOut:      ${callResult.tokensOut}`);
  // eslint-disable-next-line no-console
  console.log(`costUSD:        $${result.costUSD?.toFixed(4) ?? 'unknown'}`);
  // eslint-disable-next-line no-console
  console.log(`durationMs:     ${callResult.durationMs}`);
  // eslint-disable-next-line no-console
  console.log(`total findings: ${summary.totalFindings}`);
  // eslint-disable-next-line no-console
  console.log(`apply-clean:    ${(summary.applyCleanRate * 100).toFixed(1)}%`);
  // eslint-disable-next-line no-console
  console.log(`hallucinated:   ${summary.hallucinatedCount} (${(summary.hallucinatedRate * 100).toFixed(1)}%)`);
  if (coverage) {
    // eslint-disable-next-line no-console
    console.log(`coverage:       ${coverage.coveredCount}/${coverage.totalCount} (${(coverage.coverageRate * 100).toFixed(1)}%)`);
  }
  // eslint-disable-next-line no-console
  console.log(`\nWritten: ${path.relative(REPO_ROOT, outPath)}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
