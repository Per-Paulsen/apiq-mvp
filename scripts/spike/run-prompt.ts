#!/usr/bin/env tsx
/**
 * apiq research-spike harness.
 *
 * Usage:
 *   npx tsx run-prompt.ts <variant-id> <spec-name>
 *
 * Example:
 *   npx tsx run-prompt.ts v1 openweathermap
 *
 * - variant-id resolves to ./prompts/<variant-id>.ts
 * - spec-name resolves to ../../openapi-examples/<spec-name>/spec.{json,yaml,yml}
 *
 * Output: ../../specs/research-spike-runs/<variant-id>__<spec-name>.json
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { Operation } from 'fast-json-patch';

import { callLLM } from './openrouter.js';
import { OutputSchema, type Output, type Finding } from './schema.js';
import { validatePatchOps, type PatchValidationResult } from './validate-patches.js';
import { cycleStripSpec } from './stringify-spec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = __dirname;
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');
const RUNS_DIR = path.join(REPO_ROOT, 'specs', 'research-spike-runs');

// Per-token rates for anthropic/claude-sonnet-4 via OpenRouter (USD per token).
// TODO: confirm these — pulled from OpenRouter pricing page; if the model id
// changes (e.g. to claude-sonnet-4.5), update this table.
const PRICING_PER_TOKEN: Record<string, { in: number; out: number }> = {
  'anthropic/claude-sonnet-4': { in: 3 / 1_000_000, out: 15 / 1_000_000 },
  'anthropic/claude-sonnet-4.5': { in: 3 / 1_000_000, out: 15 / 1_000_000 },
  'anthropic/claude-haiku-4-5': { in: 1 / 1_000_000, out: 5 / 1_000_000 },
};

interface PromptModule {
  SYSTEM_PROMPT: string;
  buildUserPrompt: (specName: string, specJson: object) => string;
}

interface PerFindingValidation extends PatchValidationResult {
  findingIndex: number;
}

interface RunResult {
  variantId: string;
  specName: string;
  model: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  costUSD: number | null;
  findings: Finding[];
  patchValidation: PerFindingValidation[];
  summary: {
    totalFindings: number;
    applyCleanRate: number;
    hallucinatedCount: number;
    hallucinatedRate: number;
  };
}

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`error: ${msg}`);
  process.exit(1);
}

function parseArgs(): { variantId: string; specName: string } {
  const [, , variantId, specName] = process.argv;
  if (!variantId || !specName) {
    fail('Usage: npx tsx run-prompt.ts <variant-id> <spec-name>');
  }
  return { variantId, specName };
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
    if (ext === '.json') {
      specJson = JSON.parse(raw);
    } else {
      specJson = YAML.parse(raw);
    }
  } catch (err) {
    fail(
      `Failed to parse ${specPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return { specPath, specJson };
}

async function loadPromptModule(variantId: string): Promise<PromptModule> {
  const promptPath = path.join(SPIKE_DIR, 'prompts', `${variantId}.ts`);
  if (!fs.existsSync(promptPath)) {
    fail(`Prompt variant not found at ${promptPath}`);
  }
  const url = pathToFileURL(promptPath).href;
  const mod = (await import(url)) as Partial<PromptModule>;
  if (typeof mod.SYSTEM_PROMPT !== 'string') {
    fail(`Prompt module ${promptPath} does not export SYSTEM_PROMPT (string)`);
  }
  if (typeof mod.buildUserPrompt !== 'function') {
    fail(`Prompt module ${promptPath} does not export buildUserPrompt(specName, specJson)`);
  }
  return { SYSTEM_PROMPT: mod.SYSTEM_PROMPT, buildUserPrompt: mod.buildUserPrompt };
}

async function dereferenceSpec(specJson: unknown): Promise<object> {
  // SwaggerParser mutates the input; pass a deep clone.
  const clone =
    typeof structuredClone === 'function'
      ? structuredClone(specJson)
      : JSON.parse(JSON.stringify(specJson));
  // Cast to any for the parser; it expects an OpenAPI document shape.
  const dereffed = await SwaggerParser.dereference(clone as Parameters<typeof SwaggerParser.dereference>[0]);
  return dereffed as object;
}

function computeCostUSD(model: string, tokensIn: number, tokensOut: number): number | null {
  const rate = PRICING_PER_TOKEN[model];
  if (!rate) return null;
  return tokensIn * rate.in + tokensOut * rate.out;
}

async function callAndValidate(
  promptMod: PromptModule,
  specName: string,
  derefSpec: object
): Promise<{
  raw: string;
  parsedOutput: Output;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  model: string;
}> {
  const userPrompt = promptMod.buildUserPrompt(specName, derefSpec);

  let lastSchemaErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await callLLM({ system: promptMod.SYSTEM_PROMPT, user: userPrompt });
    const result = OutputSchema.safeParse(r.parsed);
    if (result.success) {
      return {
        raw: r.raw,
        parsedOutput: result.data,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        durationMs: r.durationMs,
        model: r.model,
      };
    }
    lastSchemaErr = result.error;
    // eslint-disable-next-line no-console
    console.error(
      `[run-prompt] zod validation failed (attempt ${attempt + 1}/2): ${result.error.message}`
    );
  }
  throw new Error(
    `Output failed zod schema validation twice. Last error: ${
      lastSchemaErr instanceof Error ? lastSchemaErr.message : String(lastSchemaErr)
    }`
  );
}

function summarize(perFinding: PerFindingValidation[]): RunResult['summary'] {
  const total = perFinding.length;
  const applyCleanCount = perFinding.filter((p) => p.applyClean).length;
  const hallucinatedCount = perFinding.filter((p) => p.hallucinationCheck.hallucinated).length;
  return {
    totalFindings: total,
    applyCleanRate: total === 0 ? 0 : applyCleanCount / total,
    hallucinatedCount,
    hallucinatedRate: total === 0 ? 0 : hallucinatedCount / total,
  };
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

async function main(): Promise<void> {
  const { variantId, specName } = parseArgs();

  const promptMod = await loadPromptModule(variantId);
  const { specJson } = loadSpecFile(specName);
  const derefSpec = await dereferenceSpec(specJson);
  // Replace cyclical back-references with `{ "$ref": "#cyclic" }` markers so
  // the LLM and the patch validator both operate on the same non-cyclic tree.
  // This mirrors the apiq production behaviour described in
  // `specs/brainstorming.md` Sektion A5.
  const specForAnalysis = cycleStripSpec(derefSpec) as object;

  // eslint-disable-next-line no-console
  console.error(`[run-prompt] calling model with variant=${variantId} spec=${specName} ...`);

  const callResult = await callAndValidate(promptMod, specName, specForAnalysis);

  const perFinding: PerFindingValidation[] = callResult.parsedOutput.findings.map(
    (f, i) => {
      const v = validatePatchOps(specForAnalysis, f.patchOps as Operation[]);
      return { findingIndex: i, ...v };
    }
  );

  const summary = summarize(perFinding);

  const result: RunResult = {
    variantId,
    specName,
    model: callResult.model,
    durationMs: callResult.durationMs,
    tokensIn: callResult.tokensIn,
    tokensOut: callResult.tokensOut,
    costUSD: computeCostUSD(callResult.model, callResult.tokensIn, callResult.tokensOut),
    findings: callResult.parsedOutput.findings,
    patchValidation: perFinding,
    summary,
  };

  ensureDir(RUNS_DIR);
  const outPath = path.join(RUNS_DIR, `${variantId}__${specName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');

  // 5-line stdout summary
  // eslint-disable-next-line no-console
  console.log(`variant: ${variantId}`);
  // eslint-disable-next-line no-console
  console.log(`spec: ${specName}`);
  // eslint-disable-next-line no-console
  console.log(`total findings: ${summary.totalFindings}`);
  // eslint-disable-next-line no-console
  console.log(`apply-clean: ${(summary.applyCleanRate * 100).toFixed(1)}%`);
  // eslint-disable-next-line no-console
  console.log(`hallucinated: ${summary.hallucinatedCount}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
