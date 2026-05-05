#!/usr/bin/env tsx
/**
 * Embedding-similarity coverage scorer (Stage-A Vocabulary-Mismatch Task #25).
 *
 * Replaces token-Jaccard's bag-of-tokens overlap with semantic cosine-similarity
 * between OpenAI-text-embedding vectors. Bridges the vocabulary-drift gap between
 * deterministic-layer / Spectral-flavoured finding titles ("Operation should have
 * operationId") and reference titles ("All 47 ops missing operationId").
 *
 * Pipeline:
 *   1. Build "ref-text" per ref: title + narrationKeywords + patchSummary.
 *      (Keywords + patchSummary intentionally embed human-curated vocabulary so
 *       the cosine match is robust to surface-form drift.)
 *   2. Build "finding-text" per finding: title + patchSummary.
 *   3. Embed all texts in batches via OpenAI `embeddings.create`.
 *   4. Cache vectors keyed by SHA-256(model + ":" + text). Re-runs free.
 *   5. Greedy-assign each ref to its highest-cosine unused finding. Match iff
 *      similarity >= threshold (default 0.65).
 *
 * Provider: OpenAI `text-embedding-3-small` ($0.02 / 1M tokens, 1536-dim).
 * Env-var: `OPENAI_API_KEY` (read from process.env at call-time).
 *
 * The Scorer<TResult> interface is sync; this scorer is async-only. Use
 * `scoreEmbeddingSimilarity` directly — `EmbeddingSimilarityScorer.score` throws.
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import OpenAI from 'openai';

import type { Finding } from '../../schema.js';
import type { Scorer, RunMeta, ReferenceTarget, ReferenceFinding } from '../types.js';
import { JaccardScorer, type JaccardResult } from './jaccard.js';
import { loadReferenceTarget } from '../reference.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'cache', 'embeddings');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// =============================================================================
// Public types
// =============================================================================

export interface EmbeddingMatch {
  refId: string;
  refTitle: string;
  matched: boolean;
  matchedFindingIndex: number | null;
  /** Cosine in [-1, 1], typically [0, 1] for English text. */
  similarity: number;
  reason: string;
}

export interface EmbeddingResult {
  scorerName: 'embedding-similarity';
  /** Matched iff similarity >= threshold. */
  threshold: number;
  totalRefs: number;
  coveredRefs: number;
  coverageRate: number;

  substantiveTotalRefs: number;
  substantiveCoveredRefs: number;
  substantiveCoverageRate: number;

  pureSpectralTotalRefs: number;
  pureSpectralCoveredRefs: number;
  pureSpectralCoverageRate: number;

  domainKnowledgeTotalRefs: number;
  domainKnowledgeCoveredRefs: number;
  domainKnowledgeCoverageRate: number;

  llmOnlyTotalRefs: number;
  llmOnlyCoveredRefs: number;
  llmOnlyCoverageRate: number;

  knowledgeBackedTotalRefs: number;
  knowledgeBackedCoveredRefs: number;
  knowledgeBackedCoverageRate: number;

  perRef: EmbeddingMatch[];

  /** Refs matched by embedding but NOT by token-jaccard — diagnostic for vocabulary-drift impact. */
  embeddingOnlyMatches?: string[];
}

export interface EmbeddingScorerOptions {
  /** Cosine-similarity threshold. Default 0.65 (empirically validated for finding-title-class text). */
  threshold?: number;
  /** Provider — currently only 'openai' supported. */
  provider?: 'openai';
  /** Model name. Default 'text-embedding-3-small'. */
  model?: string;
  /** Cache directory for embeddings (default: scripts/spike/eval/cache/embeddings/). */
  cacheDir?: string;
  /** Disable caching (for testing). */
  noCache?: boolean;
  /** Optional pre-computed JaccardResult — if provided, embeddingOnlyMatches is computed against it. */
  jaccardCompare?: { perRef: Array<{ refId: string; matched: boolean }> };
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_THRESHOLD = 0.65;
const DEFAULT_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 256; // conservative; OpenAI accepts up to 2048

// =============================================================================
// Cache helpers
// =============================================================================

interface CachedVec {
  model: string;
  text: string;
  vec: number[];
}

function cacheKey(model: string, text: string): string {
  const h = crypto.createHash('sha256');
  h.update(model);
  h.update(':');
  h.update(text);
  return h.digest('hex');
}

function cachePathFor(cacheDir: string, hash: string): string {
  const prefix = hash.slice(0, 2);
  return path.join(cacheDir, prefix, `${hash}.json`);
}

function readCache(cacheDir: string, hash: string): number[] | null {
  const p = cachePathFor(cacheDir, hash);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as CachedVec;
    if (!Array.isArray(parsed.vec)) return null;
    return parsed.vec;
  } catch {
    return null;
  }
}

function writeCache(cacheDir: string, hash: string, model: string, text: string, vec: number[]): void {
  const p = cachePathFor(cacheDir, hash);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body: CachedVec = { model, text, vec };
  fs.writeFileSync(p, JSON.stringify(body) + '\n', 'utf8');
}

function ensureCacheGitignore(cacheDir: string): void {
  // Make sure cached vectors don't leak into git.
  const gi = path.join(cacheDir, '.gitignore');
  if (!fs.existsSync(gi)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(gi, '*\n!.gitignore\n', 'utf8');
  }
}

// =============================================================================
// Text builders
// =============================================================================

function buildRefText(ref: ReferenceFinding): string {
  const keywords = (ref.classification.narrationKeywords ?? []).join(' ');
  // Order: title (canonical) + keywords (curated vocabulary) + patchSummary
  // (concrete fix). This mirrors how a human reads the finding.
  return [ref.title, keywords, ref.patchSummary].filter((s) => s && s.length > 0).join(' ');
}

function buildFindingText(f: Finding): string {
  return [f.title, f.patchSummary].filter((s) => s && s.length > 0).join(' ');
}

// =============================================================================
// Math
// =============================================================================

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

function cosine(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

// =============================================================================
// Embedding fetch with cache + batching
// =============================================================================

let _client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to scripts/spike/.env (or export in shell). ' +
        'The embedding-similarity scorer requires OpenAI direct access (not OpenRouter).'
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

interface FetchStats {
  cacheHits: number;
  cacheMisses: number;
  /** OpenAI-reported usage tokens, summed across batched API calls. */
  promptTokens: number;
  apiCalls: number;
}

async function fetchEmbeddings(
  texts: string[],
  model: string,
  cacheDir: string,
  noCache: boolean,
  stats: FetchStats
): Promise<number[][]> {
  if (!noCache) ensureCacheGitignore(cacheDir);

  const result: (number[] | null)[] = new Array(texts.length).fill(null);
  const missingIdx: number[] = [];
  const missingTexts: string[] = [];
  const missingHashes: string[] = [];

  // Pass 1: cache lookup
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (noCache) {
      missingIdx.push(i);
      missingTexts.push(t);
      missingHashes.push(cacheKey(model, t));
      stats.cacheMisses++;
      continue;
    }
    const hash = cacheKey(model, t);
    const cached = readCache(cacheDir, hash);
    if (cached) {
      result[i] = cached;
      stats.cacheHits++;
    } else {
      missingIdx.push(i);
      missingTexts.push(t);
      missingHashes.push(hash);
      stats.cacheMisses++;
    }
  }

  // Pass 2: batched API calls for misses
  if (missingTexts.length > 0) {
    const client = getOpenAIClient();
    for (let start = 0; start < missingTexts.length; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, missingTexts.length);
      const batchInputs = missingTexts.slice(start, end);
      const resp = await client.embeddings.create({ model, input: batchInputs });
      stats.apiCalls++;
      stats.promptTokens += resp.usage?.prompt_tokens ?? 0;
      for (let j = 0; j < batchInputs.length; j++) {
        const item = resp.data[j];
        if (!item || !Array.isArray(item.embedding)) {
          throw new Error(
            `OpenAI embeddings response missing embedding at batch-index ${j} ` +
              `(global ${missingIdx[start + j]})`
          );
        }
        const vec = item.embedding;
        const globalIdx = missingIdx[start + j];
        result[globalIdx] = vec;
        if (!noCache) {
          writeCache(cacheDir, missingHashes[start + j], model, missingTexts[start + j], vec);
        }
      }
    }
  }

  // Sanity: nothing should be null at this point
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) {
      throw new Error(`Embedding for text-index ${i} was not populated`);
    }
  }
  return result as number[][];
}

// =============================================================================
// Scorer entry-point
// =============================================================================

export const EmbeddingSimilarityScorer: Scorer<EmbeddingResult> = {
  name: 'embedding-similarity',
  // Note: this scorer is async-only because it needs API calls. The Scorer interface
  // currently expects sync; bridge by awaiting in the caller. Accept this asymmetry.
  score(_input) {
    throw new Error(
      'Use scoreEmbeddingSimilarity (async) directly — embedding scorer requires async API'
    );
  },
};

export async function scoreEmbeddingSimilarity(input: {
  reference: ReferenceTarget;
  llmFindings: Finding[];
  runMeta: RunMeta;
  options?: EmbeddingScorerOptions;
}): Promise<EmbeddingResult> {
  const { reference, llmFindings } = input;
  const opts = input.options ?? {};
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const model = opts.model ?? DEFAULT_MODEL;
  const cacheDir = opts.cacheDir ?? DEFAULT_CACHE_DIR;
  const noCache = opts.noCache ?? false;
  const provider = opts.provider ?? 'openai';

  if (provider !== 'openai') {
    throw new Error(`Unsupported embedding provider '${provider}' (only 'openai' is supported).`);
  }

  const refs = reference.findings;
  const refTexts = refs.map(buildRefText);
  const findingTexts = llmFindings.map(buildFindingText);

  const stats: FetchStats = { cacheHits: 0, cacheMisses: 0, promptTokens: 0, apiCalls: 0 };
  const refVecs = await fetchEmbeddings(refTexts, model, cacheDir, noCache, stats);
  const findingVecs = await fetchEmbeddings(findingTexts, model, cacheDir, noCache, stats);

  // Stash stats on the reference object for the CLI to read out — consumed by
  // the CLI's summary printer. Not part of the typed result shape (which would
  // pollute the per-spec JSON for non-CLI callers).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (input as any).__fetchStats = stats;

  const perRef: EmbeddingMatch[] = [];
  const usedFindingIndices = new Set<number>();

  for (let r = 0; r < refs.length; r++) {
    const refVec = refVecs[r];
    let bestSim = -Infinity;
    let bestIdx = -1;
    for (let f = 0; f < findingVecs.length; f++) {
      if (usedFindingIndices.has(f)) continue;
      const sim = cosine(refVec, findingVecs[f]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = f;
      }
    }
    const matched = bestIdx >= 0 && bestSim >= threshold;
    if (matched) usedFindingIndices.add(bestIdx);
    perRef.push({
      refId: refs[r].id,
      refTitle: refs[r].title,
      matched,
      matchedFindingIndex: matched ? bestIdx : null,
      similarity: bestSim === -Infinity ? 0 : bestSim,
      reason:
        bestIdx < 0
          ? 'no candidate findings'
          : matched
            ? `cosine=${bestSim.toFixed(3)} >= threshold=${threshold}`
            : `cosine=${bestSim.toFixed(3)} < threshold=${threshold} (best candidate idx=${bestIdx})`,
    });
  }

  const matchedById = new Map(perRef.map((p) => [p.refId, p.matched]));
  const isMatched = (id: string) => matchedById.get(id) === true;

  const substantiveRefs = refs.filter((r) => !r.classification.isLintFlavoured);
  const llmOnlyRefs = refs.filter(
    (r) =>
      !r.classification.isPureSpectralDetectable &&
      !r.classification.isDomainKnowledgeDetectable
  );
  const pureSpectralRefs = refs.filter((r) => r.classification.isPureSpectralDetectable);
  const domainKnowledgeRefs = refs.filter((r) => r.classification.isDomainKnowledgeDetectable);
  const knowledgeRefs = refs.filter((r) => r.classification.isKnowledgeBackedGap);

  const coveredCount = perRef.filter((p) => p.matched).length;
  const substantiveCovered = substantiveRefs.filter((r) => isMatched(r.id)).length;
  const llmOnlyCovered = llmOnlyRefs.filter((r) => isMatched(r.id)).length;
  const pureSpectralCovered = pureSpectralRefs.filter((r) => isMatched(r.id)).length;
  const domainKnowledgeCovered = domainKnowledgeRefs.filter((r) => isMatched(r.id)).length;
  const knowledgeCovered = knowledgeRefs.filter((r) => isMatched(r.id)).length;

  const safeRate = (n: number, d: number) => (d === 0 ? 0 : n / d);

  let embeddingOnlyMatches: string[] | undefined;
  if (opts.jaccardCompare) {
    const jaccardMatchedIds = new Set(
      opts.jaccardCompare.perRef.filter((p) => p.matched).map((p) => p.refId)
    );
    embeddingOnlyMatches = perRef
      .filter((p) => p.matched && !jaccardMatchedIds.has(p.refId))
      .map((p) => p.refId);
  }

  return {
    scorerName: 'embedding-similarity',
    threshold,
    totalRefs: refs.length,
    coveredRefs: coveredCount,
    coverageRate: safeRate(coveredCount, refs.length),

    substantiveTotalRefs: substantiveRefs.length,
    substantiveCoveredRefs: substantiveCovered,
    substantiveCoverageRate: safeRate(substantiveCovered, substantiveRefs.length),

    pureSpectralTotalRefs: pureSpectralRefs.length,
    pureSpectralCoveredRefs: pureSpectralCovered,
    pureSpectralCoverageRate: safeRate(pureSpectralCovered, pureSpectralRefs.length),

    domainKnowledgeTotalRefs: domainKnowledgeRefs.length,
    domainKnowledgeCoveredRefs: domainKnowledgeCovered,
    domainKnowledgeCoverageRate: safeRate(domainKnowledgeCovered, domainKnowledgeRefs.length),

    llmOnlyTotalRefs: llmOnlyRefs.length,
    llmOnlyCoveredRefs: llmOnlyCovered,
    llmOnlyCoverageRate: safeRate(llmOnlyCovered, llmOnlyRefs.length),

    knowledgeBackedTotalRefs: knowledgeRefs.length,
    knowledgeBackedCoveredRefs: knowledgeCovered,
    knowledgeBackedCoverageRate: safeRate(knowledgeCovered, knowledgeRefs.length),

    perRef,
    embeddingOnlyMatches,
  };
}

// =============================================================================
// CLI — standalone parameter-tuning + validation
//
// Loads a runner-output JSON (raw or .scored.json), pulls the first per-spec
// run's findings, finds the matching reference, runs the scorer, and prints
// a summary. Useful for parameter-tuning the threshold and for the Stage-A
// Task-#25 validation step against (C-i) Sonnet+Sonnet stripe-full.
// =============================================================================

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  const argvUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  return import.meta.url === argvUrl;
}

interface CliRunnerSpec {
  spec: string;
  perRun: Array<{ runIndex: number; findings: Finding[] }>;
  config?: { name?: string; architecture?: string; promptVariant?: string };
}

interface CliRunnerOutput {
  configName: string;
  perSpec: Record<string, CliRunnerSpec>;
}

function autoDetectReferencePath(spec: string): string | null {
  const dir = path.join(REPO_ROOT, 'openapi-examples', spec, 'reference');
  const candidates = ['findings.json', 'findings-target-big.md'];
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(
      'Usage: npx tsx eval/scorers/embedding-similarity.ts <runner-output-json> [--threshold=0.65] [--no-cache]'
    );
    console.log('');
    console.log('Loads a runner-output (or scored runner-output) JSON, runs the embedding scorer');
    console.log('against each spec\'s first run, and prints summary + diagnostic.');
    process.exit(0);
  }

  let inputPath = '';
  let threshold = DEFAULT_THRESHOLD;
  let noCache = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--threshold=')) {
      threshold = parseFloat(a.slice('--threshold='.length));
      if (Number.isNaN(threshold)) {
        console.error(`Invalid --threshold value: ${a}`);
        process.exit(1);
      }
    } else if (a === '--no-cache') {
      noCache = true;
    } else if (!a.startsWith('--')) {
      inputPath = path.resolve(a);
    }
  }

  if (!inputPath) {
    console.error('No runner-output JSON path provided.');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      'OPENAI_API_KEY is not set in process.env. Add it to scripts/spike/.env (the spike already loads dotenv) or export it in your shell.'
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as CliRunnerOutput;

  console.log(`\n=== Embedding-Similarity Scorer ===`);
  console.log(`Input:        ${inputPath}`);
  console.log(`Config:       ${parsed.configName}`);
  console.log(`Threshold:    ${threshold}`);
  console.log(`Model:        ${DEFAULT_MODEL}`);
  console.log(`Cache:        ${noCache ? '(disabled)' : DEFAULT_CACHE_DIR}`);
  console.log('');

  for (const [spec, agg] of Object.entries(parsed.perSpec)) {
    const refPath = autoDetectReferencePath(spec);
    if (!refPath) {
      console.log(`Spec: ${spec} — no reference found, skipping.`);
      continue;
    }
    const reference = loadReferenceTarget(refPath, spec);

    if (!agg.perRun || agg.perRun.length === 0) {
      console.log(`Spec: ${spec} — no perRun data, skipping.`);
      continue;
    }
    const run0 = agg.perRun[0];
    const findings = run0.findings;

    // Pre-compute Jaccard for diagnostic comparison.
    const jaccard: JaccardResult = JaccardScorer.score({
      reference,
      llmFindings: findings,
      runMeta: { spec, architecture: agg.config?.architecture ?? 'unknown' },
    });

    // Cost-guard: estimate worst-case API cost. Each token ~ 4 chars; rate $0.02 / 1M tokens.
    const totalChars =
      reference.findings.reduce((s, r) => s + buildRefText(r).length, 0) +
      findings.reduce((s, f) => s + buildFindingText(f).length, 0);
    const estTokens = Math.ceil(totalChars / 4);
    const estCostUSD = (estTokens / 1_000_000) * 0.02;
    if (estCostUSD > 0.5) {
      console.error(
        `Estimated cost ${estCostUSD.toFixed(4)} USD exceeds $0.50 hard cap. Aborting. ` +
          `(${reference.findings.length} refs + ${findings.length} findings, ~${estTokens} tokens.)`
      );
      process.exit(1);
    }

    const runMeta: RunMeta = {
      spec,
      architecture: agg.config?.architecture ?? 'unknown',
      promptVariant: agg.config?.promptVariant,
    };

    const t0 = Date.now();
    const input = {
      reference,
      llmFindings: findings,
      runMeta,
      options: {
        threshold,
        noCache,
        jaccardCompare: jaccard,
      } as EmbeddingScorerOptions,
    };
    const result = await scoreEmbeddingSimilarity(input);
    const elapsedMs = Date.now() - t0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = (input as any).__fetchStats as FetchStats;
    const totalEmbeddings = stats.cacheHits + stats.cacheMisses;
    const cacheHitRate =
      totalEmbeddings === 0 ? 0 : stats.cacheHits / totalEmbeddings;
    const actualCostUSD = (stats.promptTokens / 1_000_000) * 0.02;

    console.log(`Spec: ${spec}`);
    console.log(`  Reference findings:           ${reference.findings.length}`);
    console.log(`  LLM findings:                 ${findings.length}`);
    console.log(`  Estimated cost (pre-run):     $${estCostUSD.toFixed(6)}`);
    console.log(`  API calls:                    ${stats.apiCalls}`);
    console.log(`  Cache hits:                   ${stats.cacheHits}`);
    console.log(`  Cache misses (= API embeds): ${stats.cacheMisses}`);
    console.log(`  Cache hit rate:               ${(cacheHitRate * 100).toFixed(1)}%`);
    console.log(`  Tokens billed:                ${stats.promptTokens}`);
    console.log(`  Actual cost:                  $${actualCostUSD.toFixed(6)}`);
    console.log(`  Elapsed:                      ${elapsedMs}ms`);
    console.log('');
    console.log(`  Coverage (Embedding @ ${threshold}):`);
    console.log(
      `    Total:               ${result.coveredRefs}/${result.totalRefs} = ${(result.coverageRate * 100).toFixed(1)}%`
    );
    console.log(
      `    Substantive:         ${result.substantiveCoveredRefs}/${result.substantiveTotalRefs} = ${(result.substantiveCoverageRate * 100).toFixed(1)}%`
    );
    console.log(
      `    Pure-spectral:       ${result.pureSpectralCoveredRefs}/${result.pureSpectralTotalRefs} = ${(result.pureSpectralCoverageRate * 100).toFixed(1)}%`
    );
    console.log(
      `    Domain-knowledge:    ${result.domainKnowledgeCoveredRefs}/${result.domainKnowledgeTotalRefs} = ${(result.domainKnowledgeCoverageRate * 100).toFixed(1)}%`
    );
    console.log(
      `    LLM-only:            ${result.llmOnlyCoveredRefs}/${result.llmOnlyTotalRefs} = ${(result.llmOnlyCoverageRate * 100).toFixed(1)}%`
    );
    console.log(
      `    Knowledge-backed:    ${result.knowledgeBackedCoveredRefs}/${result.knowledgeBackedTotalRefs} = ${(result.knowledgeBackedCoverageRate * 100).toFixed(1)}%`
    );
    console.log('');
    console.log(`  Coverage (Jaccard, comparison):`);
    console.log(
      `    Total:               ${jaccard.coveredRefs}/${jaccard.totalRefs} = ${(jaccard.coverageRate * 100).toFixed(1)}%`
    );
    console.log(
      `    Substantive:         ${jaccard.substantiveCoveredRefs}/${jaccard.substantiveTotalRefs} = ${(jaccard.substantiveCoverageRate * 100).toFixed(1)}%`
    );
    console.log('');
    console.log(`  Embedding-only matches (vocabulary-drift impact):`);
    if (!result.embeddingOnlyMatches || result.embeddingOnlyMatches.length === 0) {
      console.log(`    (none — embedding matches are a subset of jaccard matches)`);
    } else {
      for (const refId of result.embeddingOnlyMatches) {
        const m = result.perRef.find((p) => p.refId === refId);
        if (!m) continue;
        console.log(`    ${refId}: cosine=${m.similarity.toFixed(3)}  "${m.refTitle}"`);
      }
    }

    // Also surface refs that jaccard matched but embedding did NOT.
    const embedMatchedIds = new Set(
      result.perRef.filter((p) => p.matched).map((p) => p.refId)
    );
    const jaccardOnlyIds = jaccard.perRef
      .filter((p) => p.matched && !embedMatchedIds.has(p.refId))
      .map((p) => p.refId);
    if (jaccardOnlyIds.length > 0) {
      console.log('');
      console.log(`  Jaccard-only matches (refs embedding lost vs jaccard):`);
      for (const refId of jaccardOnlyIds) {
        const m = result.perRef.find((p) => p.refId === refId);
        if (!m) continue;
        console.log(`    ${refId}: cosine=${m.similarity.toFixed(3)}  "${m.refTitle}"`);
      }
    }
    console.log('');
  }
}

if (isCliEntrypoint()) {
  runCli().catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
