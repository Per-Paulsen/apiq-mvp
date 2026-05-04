/**
 * Architecture (C) Two-Call dispatcher.
 *
 * Phase 1 — per-endpoint (parallel, Haiku 4.5 via OpenRouter):
 *   Each operation in the dereferenced spec is sent to Haiku with the v5-per-endpoint
 *   prompt. Output: { findings: [...], summary: "..." }. We accumulate findings
 *   and structured summaries. Concurrency is bounded so we don't burst the API.
 *
 * Phase 2 — aggregator (single, Sonnet 4.6 via Anthropic-direct):
 *   The structured per-endpoint summaries + finding-titles are passed to Sonnet
 *   with the v5-aggregator prompt. Output: spec-level + cross-cutting findings.
 *
 * Phase 3 — merge (client-side):
 *   Combine per-endpoint findings (Phase 1) + spec-level findings (Phase 2).
 *   De-dup by (scope, normalized-title) — small finding-count, fine to do in JS.
 *   Validate each finding's patchOps against the original cycle-stripped spec.
 */

import { z } from 'zod';

import { callLLM as callOpenRouter, stripJsonFences } from './openrouter.js';
import { callLLM as callAnthropicDirect } from './anthropic-direct.js';
import { FindingSchema, type Finding } from './schema.js';
import { validatePatchOps, type PatchValidationResult } from './validate-patches.js';
import { splitEndpoints, type SpecMetadata, type EndpointSlice } from './endpoint-splitter.js';

import { SYSTEM_PROMPT as PER_ENDPOINT_SYSTEM, buildUserPrompt as buildPerEndpointUser } from './prompts/v5-per-endpoint.js';
import { SYSTEM_PROMPT as AGGREGATOR_SYSTEM, buildUserPrompt as buildAggregatorUser, type PerEndpointSummary } from './prompts/v5-aggregator.js';

// Phase-1 output schema: findings + a summary string.
export const PerEndpointOutputSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string().min(10).max(3000),
});

export type PerEndpointOutput = z.infer<typeof PerEndpointOutputSchema>;

// Phase-2 output schema: just findings (same as v4).
export const AggregatorOutputSchema = z.object({
  findings: z.array(FindingSchema),
});

export type AggregatorOutput = z.infer<typeof AggregatorOutputSchema>;

interface PerEndpointResult {
  slice: EndpointSlice;
  output: PerEndpointOutput | null;
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

interface AggregatorResult {
  output: AggregatorOutput | null;
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export interface TwoCallRunResult {
  arch: 'two-call';
  specName: string;
  promptVariant: 'v5';
  perEndpointModel: string;
  aggregatorModel: string;
  startedAt: string;
  totalDurationMs: number;
  phase1: {
    slicesTotal: number;
    slicesOk: number;
    slicesFailed: number;
    tokensIn: number;
    tokensOut: number;
    costUSD: number;
  };
  phase2: {
    tokensIn: number;
    tokensOut: number;
    costUSD: number;
  };
  costUSD: number;
  findings: Finding[];
  perEndpointFindings: Finding[]; // before dedup
  specLevelFindings: Finding[];
  patchValidation: Array<PatchValidationResult & { findingIndex: number }>;
  failedSlices: Array<{ path: string; method: string; error: string }>;
  summary: {
    totalFindings: number;
    perEndpointCount: number;
    specLevelCount: number;
    applyCleanRate: number;
    hallucinatedCount: number;
    hallucinatedRate: number;
  };
}

interface PricingPerToken {
  in: number;
  out: number;
}

const HAIKU_PRICING: PricingPerToken = { in: 1 / 1_000_000, out: 5 / 1_000_000 };
const SONNET_PRICING: PricingPerToken = { in: 3 / 1_000_000, out: 15 / 1_000_000 };

/**
 * Run a single per-endpoint call via OpenRouter (Haiku 4.5). Schema-validates
 * the response. Returns null output on failure rather than throwing — the
 * dispatcher tolerates a few failed slices.
 */
async function runPerEndpoint(
  slice: EndpointSlice,
  metadata: SpecMetadata,
  model: string
): Promise<PerEndpointResult> {
  const userPrompt = buildPerEndpointUser({
    metadata,
    path: slice.path,
    method: slice.method,
    operation: slice.operation,
    pathLevelParameters: slice.pathLevelParameters,
  });

  const prevModel = process.env.OPENROUTER_MODEL;
  process.env.OPENROUTER_MODEL = model;
  try {
    const r = await callOpenRouter({ system: PER_ENDPOINT_SYSTEM, user: userPrompt });
    const parsed = PerEndpointOutputSchema.safeParse(r.parsed);
    if (!parsed.success) {
      return {
        slice,
        output: null,
        error: `zod schema failed: ${parsed.error.message}`,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        durationMs: r.durationMs,
      };
    }
    return {
      slice,
      output: parsed.data,
      error: null,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      durationMs: r.durationMs,
    };
  } catch (err) {
    return {
      slice,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 0,
    };
  } finally {
    if (prevModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = prevModel;
  }
}

/**
 * Run all per-endpoint calls with bounded concurrency.
 */
async function runPerEndpointPhase(
  slices: EndpointSlice[],
  metadata: SpecMetadata,
  model: string,
  concurrency: number
): Promise<PerEndpointResult[]> {
  const results: PerEndpointResult[] = new Array(slices.length);
  let nextIdx = 0;
  let completed = 0;
  const total = slices.length;

  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= total) return;
      const result = await runPerEndpoint(slices[i], metadata, model);
      results[i] = result;
      completed++;
      if (completed % 25 === 0 || completed === total) {
        process.stderr.write(
          `[two-call] phase1 ${completed}/${total} complete\n`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/**
 * Run the aggregator pass via Anthropic-direct (Sonnet 4.6).
 * Retries once on zod-schema failure (model may have emitted slightly-off
 * shape on first try; second call usually self-corrects).
 */
async function runAggregatorPhase(
  metadata: SpecMetadata,
  totalOperations: number,
  perEndpoint: PerEndpointSummary[],
  model: string
): Promise<AggregatorResult> {
  const userPrompt = buildAggregatorUser({ metadata, totalOperations, perEndpoint });
  let totalIn = 0;
  let totalOut = 0;
  let totalMs = 0;
  let lastErr = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await callAnthropicDirect({ system: AGGREGATOR_SYSTEM, user: userPrompt }, model);
      totalIn += r.tokensIn;
      totalOut += r.tokensOut;
      totalMs += r.durationMs;
      const parsed = AggregatorOutputSchema.safeParse(r.parsed);
      if (parsed.success) {
        return {
          output: parsed.data,
          error: null,
          tokensIn: totalIn,
          tokensOut: totalOut,
          durationMs: totalMs,
        };
      }
      // Truncate the zod error message before keeping it — full validation
      // payload can be enormous (every flagged-field's full data + context).
      lastErr = `zod schema failed (attempt ${attempt + 1}/2): ${parsed.error.message.slice(0, 1500)}`;
      process.stderr.write(`[two-call] ${lastErr}\n`);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[two-call] aggregator network error: ${lastErr}\n`);
      break; // network error — don't burn a second retry
    }
  }

  return {
    output: null,
    error: lastErr,
    tokensIn: totalIn,
    tokensOut: totalOut,
    durationMs: totalMs,
  };
}

/**
 * De-duplicate findings by (scope, normalised-title). Per-endpoint findings
 * usually distinct via affectedEndpoints; spec-level findings should never
 * duplicate per-endpoint ones.
 */
function dedupFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const titleNorm = f.title.toLowerCase().replace(/\s+/g, ' ').trim();
    const endpointKey = f.affectedEndpoints
      .map((e) => `${e.method.toLowerCase()} ${e.path}`)
      .sort()
      .join('|');
    const key = `${f.scope}::${titleNorm}::${endpointKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export interface TwoCallArgs {
  specName: string;
  cycleStrippedSpec: object;
  perEndpointModel: string; // e.g. "anthropic/claude-haiku-4-5"
  aggregatorModel: string; // e.g. "anthropic/claude-sonnet-4.6"
  concurrency?: number;
}

export async function runTwoCall(args: TwoCallArgs): Promise<TwoCallRunResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const concurrency = args.concurrency ?? 10;

  const split = splitEndpoints(args.cycleStrippedSpec);
  process.stderr.write(
    `[two-call] split ${split.slices.length} ops; metadata=${JSON.stringify(split.metadata).length} chars\n`
  );

  // Phase 1
  process.stderr.write(`[two-call] phase 1 — per-endpoint × ${split.slices.length} (concurrency=${concurrency})\n`);
  const phase1Start = Date.now();
  const perEndpointResults = await runPerEndpointPhase(
    split.slices,
    split.metadata,
    args.perEndpointModel,
    concurrency
  );
  const phase1Ms = Date.now() - phase1Start;

  const phase1TokensIn = perEndpointResults.reduce((a, r) => a + r.tokensIn, 0);
  const phase1TokensOut = perEndpointResults.reduce((a, r) => a + r.tokensOut, 0);
  const phase1CostUSD = phase1TokensIn * HAIKU_PRICING.in + phase1TokensOut * HAIKU_PRICING.out;
  const phase1Ok = perEndpointResults.filter((r) => r.output !== null).length;
  const phase1Failed = perEndpointResults.length - phase1Ok;

  const failedSlices = perEndpointResults
    .filter((r) => r.output === null)
    .map((r) => ({ path: r.slice.path, method: r.slice.method, error: r.error ?? 'unknown' }));

  const perEndpointFindings: Finding[] = [];
  const summariesForAggregator: PerEndpointSummary[] = [];
  for (const r of perEndpointResults) {
    if (!r.output) continue;
    perEndpointFindings.push(...r.output.findings);
    summariesForAggregator.push({
      path: r.slice.path,
      method: r.slice.method,
      summary: r.output.summary,
      findingTitles: r.output.findings.map((f) => f.title),
      findingCount: r.output.findings.length,
    });
  }

  process.stderr.write(
    `[two-call] phase 1 done: ${phase1Ok}/${perEndpointResults.length} ok, ${perEndpointFindings.length} findings, $${phase1CostUSD.toFixed(4)}, ${(phase1Ms / 1000).toFixed(1)}s\n`
  );

  // Phase 2
  process.stderr.write(`[two-call] phase 2 — aggregator (${args.aggregatorModel})\n`);
  const phase2Start = Date.now();
  const aggregatorResult = await runAggregatorPhase(
    split.metadata,
    split.slices.length,
    summariesForAggregator,
    args.aggregatorModel
  );
  const phase2Ms = Date.now() - phase2Start;

  const phase2CostUSD =
    aggregatorResult.tokensIn * SONNET_PRICING.in + aggregatorResult.tokensOut * SONNET_PRICING.out;
  const specLevelFindings: Finding[] = aggregatorResult.output?.findings ?? [];
  if (aggregatorResult.error) {
    process.stderr.write(`[two-call] phase 2 ERROR: ${aggregatorResult.error}\n`);
  } else {
    process.stderr.write(
      `[two-call] phase 2 done: ${specLevelFindings.length} spec-level findings, $${phase2CostUSD.toFixed(4)}, ${(phase2Ms / 1000).toFixed(1)}s\n`
    );
  }

  // Phase 3 — merge & validate
  const merged = dedupFindings([...perEndpointFindings, ...specLevelFindings]);
  const patchValidation = merged.map((f, i) => ({
    findingIndex: i,
    ...validatePatchOps(args.cycleStrippedSpec, f.patchOps as Parameters<typeof validatePatchOps>[1]),
  }));
  const applyCleanCount = patchValidation.filter((p) => p.applyClean).length;
  const hallucinatedCount = patchValidation.filter((p) => p.hallucinationCheck.hallucinated).length;

  const totalDurationMs = Date.now() - startMs;
  const totalCostUSD = phase1CostUSD + phase2CostUSD;

  return {
    arch: 'two-call',
    specName: args.specName,
    promptVariant: 'v5',
    perEndpointModel: args.perEndpointModel,
    aggregatorModel: args.aggregatorModel,
    startedAt,
    totalDurationMs,
    phase1: {
      slicesTotal: perEndpointResults.length,
      slicesOk: phase1Ok,
      slicesFailed: phase1Failed,
      tokensIn: phase1TokensIn,
      tokensOut: phase1TokensOut,
      costUSD: phase1CostUSD,
    },
    phase2: {
      tokensIn: aggregatorResult.tokensIn,
      tokensOut: aggregatorResult.tokensOut,
      costUSD: phase2CostUSD,
    },
    costUSD: totalCostUSD,
    findings: merged,
    perEndpointFindings,
    specLevelFindings,
    patchValidation,
    failedSlices,
    summary: {
      totalFindings: merged.length,
      perEndpointCount: perEndpointFindings.length,
      specLevelCount: specLevelFindings.length,
      applyCleanRate: merged.length === 0 ? 0 : applyCleanCount / merged.length,
      hallucinatedCount,
      hallucinatedRate: merged.length === 0 ? 0 : hallucinatedCount / merged.length,
    },
  };
}

// Suppress the unused-stripJsonFences warning — kept available for downstream use.
void stripJsonFences;
