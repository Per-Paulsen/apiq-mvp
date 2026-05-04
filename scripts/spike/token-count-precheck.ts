#!/usr/bin/env tsx
/**
 * Token-count pre-check for big specs.
 *
 * Runs each spec through the same pipeline the LLM-call path uses:
 *   raw JSON → SwaggerParser.dereference() → cycleStripSpec() → JSON.stringify()
 *
 * Reports estimated input tokens (= chars / 4, the rule of thumb for JSON/English).
 * Compares against current OpenRouter long-context model windows so we know — before
 * spending a cent on LLM calls — whether (A) Bigger-Context architecture is even
 * technically feasible for each spec.
 *
 * Output: prints a per-spec table to stdout AND writes
 *   specs/big-spec-runs/_precheck.json
 * for downstream consumption.
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

import { cycleStripSpec } from './stringify-spec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');
const RUNS_DIR = path.join(REPO_ROOT, 'specs', 'big-spec-runs');

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;

const MODELS = {
  'gemini-2.5-pro': { context: 1_048_576, label: 'Gemini 2.5 Pro (1M)' },
  'gemini-3-flash-preview': { context: 1_048_576, label: 'Gemini 3 Flash Preview (1M)' },
  'claude-sonnet-4.6': { context: 1_000_000, label: 'Claude Sonnet 4.6 (1M)' },
  'claude-opus-4.7': { context: 1_000_000, label: 'Claude Opus 4.7 (1M)' },
  'gemini-3.1-pro': { context: 2_000_000, label: 'Gemini 3.1 Pro (2M, request-via-Discord)' },
} as const;

interface PrecheckResult {
  spec: string;
  rawSizeBytes: number;
  paths: number;
  endpoints: number;
  dereferencedChars: number;
  cycleStrippedChars: number;
  estimatedInputTokens: number;
  fitsIn1M: boolean;
  fitsIn2M: boolean;
  perModel: Record<string, { fits: boolean; headroomTokens: number }>;
}

function countOps(spec: { paths?: Record<string, Record<string, unknown> | undefined> }): { paths: number; ops: number } {
  let ops = 0;
  const paths = spec.paths ?? {};
  for (const item of Object.values(paths)) {
    if (!item) continue;
    for (const m of METHODS) if (m in item) ops++;
  }
  return { paths: Object.keys(paths).length, ops };
}

async function precheckSpec(specName: string): Promise<PrecheckResult> {
  const specPath = path.join(EXAMPLES_DIR, specName, 'spec.json');
  const raw = fs.readFileSync(specPath, 'utf8');
  const rawSizeBytes = Buffer.byteLength(raw, 'utf8');
  const specJson = JSON.parse(raw);
  const { paths, ops } = countOps(specJson);

  // SwaggerParser mutates input — clone via JSON roundtrip (safe here since input is pre-parsed JSON, no cycles yet).
  const clone = JSON.parse(raw);
  const dereffed = await SwaggerParser.dereference(clone);
  // Stringify of dereffed will throw on cyclic — measure the cycle-stripped tree instead.
  const cycleStripped = cycleStripSpec(dereffed) as object;
  const cycleStrippedJson = JSON.stringify(cycleStripped);
  const cycleStrippedChars = cycleStrippedJson.length;

  // For dereferenced size we need to be careful — it may be cyclic. Use the cycle-stripped variant
  // as the "what the LLM actually sees" measurement; that's the load-bearing number.
  const dereferencedChars = cycleStrippedChars;

  const estimatedInputTokens = Math.ceil(cycleStrippedChars / 4);

  const perModel: Record<string, { fits: boolean; headroomTokens: number }> = {};
  for (const [modelKey, info] of Object.entries(MODELS)) {
    perModel[modelKey] = {
      fits: estimatedInputTokens < info.context * 0.95, // 5% headroom for system prompt + completion
      headroomTokens: info.context - estimatedInputTokens,
    };
  }

  return {
    spec: specName,
    rawSizeBytes,
    paths,
    endpoints: ops,
    dereferencedChars,
    cycleStrippedChars,
    estimatedInputTokens,
    fitsIn1M: estimatedInputTokens < 1_000_000 * 0.95,
    fitsIn2M: estimatedInputTokens < 2_000_000 * 0.95,
    perModel,
  };
}

function fmtBytes(n: number): string {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtTokens(n: number): string {
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n > 1_000) return `${(n / 1_000).toFixed(0)} K`;
  return `${n}`;
}

async function main() {
  const specs = ['stripe-full', 'pagerduty-full', 'github-rest'];
  const results: PrecheckResult[] = [];
  for (const s of specs) {
    process.stderr.write(`[precheck] processing ${s} ...\n`);
    const r = await precheckSpec(s);
    results.push(r);
  }

  // eslint-disable-next-line no-console
  console.log('\n=== Token-Count Pre-Check ===\n');
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`### ${r.spec}`);
    // eslint-disable-next-line no-console
    console.log(`  raw size:           ${fmtBytes(r.rawSizeBytes)}`);
    // eslint-disable-next-line no-console
    console.log(`  endpoints / paths:  ${r.endpoints} / ${r.paths}`);
    // eslint-disable-next-line no-console
    console.log(`  dereferenced chars: ${fmtBytes(r.cycleStrippedChars)}`);
    // eslint-disable-next-line no-console
    console.log(`  est. input tokens:  ${fmtTokens(r.estimatedInputTokens)}`);
    // eslint-disable-next-line no-console
    console.log(`  fits in 1M ctx:     ${r.fitsIn1M ? 'YES' : 'NO'}`);
    // eslint-disable-next-line no-console
    console.log(`  fits in 2M ctx:     ${r.fitsIn2M ? 'YES' : 'NO'}`);
    // eslint-disable-next-line no-console
    console.log('');
  }

  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = path.join(RUNS_DIR, '_precheck.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Written: ${path.relative(REPO_ROOT, outPath)}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
