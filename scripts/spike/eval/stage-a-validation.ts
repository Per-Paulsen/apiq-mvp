#!/usr/bin/env tsx
/**
 * Stage-A Validation Runner (Phase 0 Task #23 ~~ Phase A Acceptance gate).
 *
 * For each of the 4 specs (stripe / pagerduty / dnd5eapi / github):
 *   1. Load + dereference spec.json
 *   2. Run runDeterministicLayer (Spectral + Walkers + Domain-Knowledge combined)
 *   3. Score the output against the spec's reference target (Jaccard + cluster)
 *   4. Compare measured coverage to STAGE-A-PREDICTIONS hypotheses
 *   5. Render a markdown results doc with measured-vs-prediction table per spec
 *
 * Output: `specs/big-spec-runs/eval/STAGE-A-RESULTS.md`
 *
 * CLI:
 *   npx tsx scripts/spike/eval/stage-a-validation.ts [--specs=stripe-full,pd,...]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

import {
  runDeterministicLayer,
  registerDefaultRunners,
} from '../deterministic/index.js';
import type { Finding } from '../schema.js';
import * as dotenv from 'dotenv';
import { JaccardScorer, scoreJaccardEnhanced, type JaccardResult } from './scorers/jaccard.js';
import { RepetitionClusterScorer, type ClusterResult } from './scorers/repetition-cluster.js';
import { scoreEmbeddingSimilarity, type EmbeddingResult } from './scorers/embedding-similarity.js';
import { loadReferenceTarget } from './reference.js';
import type { ReferenceTarget } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SPIKE_DIR = path.resolve(__dirname, '..', '..');

// Load env from scripts/spike/.env regardless of cwd. Root .env is also tried
// (some keys like ANTHROPIC_API_KEY may live there).
dotenv.config({ path: path.join(SPIKE_DIR, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const ALL_SPECS = ['stripe-full', 'pagerduty-full', 'dnd5eapi', 'github-rest'];

interface SpecResult {
  spec: string;
  reference: ReferenceTarget;
  findings: Finding[];
  perLayer: Record<string, number>;
  perDetector: Record<string, number>;
  jaccard: JaccardResult;
  cluster: ClusterResult;
  embedding: EmbeddingResult | null;  // null if OPENAI_API_KEY missing or skipped
  durationMs: number;
}

async function loadSpec(specName: string): Promise<object> {
  const specPath = path.join(REPO_ROOT, 'openapi-examples', specName, 'spec.json');
  return SwaggerParser.dereference(specPath) as Promise<object>;
}

async function validateOneSpec(specName: string, ref: ReferenceTarget): Promise<SpecResult | null> {
  console.log(`\n[stage-a-validation] === ${specName} ===`);
  const startedAt = Date.now();
  let spec: object;
  try {
    console.log(`  → loading + dereferencing spec.json`);
    spec = await loadSpec(specName);
  } catch (err) {
    console.error(`  ✗ failed to load: ${err instanceof Error ? err.message : err}`);
    return null;
  }

  console.log(`  → running deterministic layer (spectral + walkers + domain-knowledge)`);
  const layerResult = await runDeterministicLayer(spec, { specName });
  console.log(`  → emitted ${layerResult.findings.length} findings (per-layer:`,
    `spectral-oas3=${layerResult.perLayer['spectral-oas3-default']},`,
    `apiq-custom=${layerResult.perLayer['spectral-apiq-custom']},`,
    `walkers=${layerResult.perLayer['walker-statistical']},`,
    `domain=${layerResult.perLayer['domain-knowledge']})`);

  const runMeta = {
    spec: specName,
    architecture: 'stage-a-deterministic-layer',
    perEndpointModel: '(deterministic)',
    aggregatorModel: '(deterministic)',
  };

  // Use vocabulary-mismatch-mitigated Jaccard: rollup-clustering pre-match +
  // narrationKeywords-aware similarity. Bridges the per-occurrence-vs-aggregated
  // mismatch and the title-vocabulary-drift between Spectral and ref-titles.
  // (See critical-review-doc Iteration 5.)
  const jaccard = scoreJaccardEnhanced({
    reference: ref,
    llmFindings: layerResult.findings,
    runMeta,
    options: { useRollup: true, useKeywords: true },
  });
  const cluster = RepetitionClusterScorer.score({
    reference: null,
    llmFindings: layerResult.findings,
    runMeta,
  });

  console.log(
    `  → jaccard coverage: ${jaccard.coveredRefs}/${jaccard.totalRefs} = ${(jaccard.coverageRate * 100).toFixed(1)}% ` +
    `(pure-spectral ${jaccard.pureSpectralCoveredRefs}/${jaccard.pureSpectralTotalRefs}, ` +
    `domain-knowledge ${jaccard.domainKnowledgeCoveredRefs}/${jaccard.domainKnowledgeTotalRefs}, ` +
    `LLM-only ${jaccard.llmOnlyCoveredRefs}/${jaccard.llmOnlyTotalRefs})`
  );

  let embedding: EmbeddingResult | null = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log(`  → running embedding scorer (text-embedding-3-small @ threshold 0.55)`);
      embedding = await scoreEmbeddingSimilarity({
        reference: ref,
        llmFindings: layerResult.findings,
        runMeta,
        options: { threshold: 0.55, jaccardCompare: { perRef: jaccard.perRef } },
      });
      console.log(
        `  → embedding coverage: ${embedding.coveredRefs}/${embedding.totalRefs} = ${(embedding.coverageRate * 100).toFixed(1)}% ` +
        `(pure-spectral ${embedding.pureSpectralCoveredRefs}/${embedding.pureSpectralTotalRefs}, ` +
        `domain-knowledge ${embedding.domainKnowledgeCoveredRefs}/${embedding.domainKnowledgeTotalRefs})`
      );
    } catch (err) {
      console.warn(`  ! embedding scorer failed: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    console.log(`  → skipping embedding scorer (OPENAI_API_KEY not set)`);
  }

  return {
    spec: specName,
    reference: ref,
    findings: layerResult.findings,
    perLayer: layerResult.perLayer,
    perDetector: layerResult.perDetector,
    jaccard,
    cluster,
    embedding,
    durationMs: Date.now() - startedAt,
  };
}

// =============================================================================
// Predictions loader (parses STAGE-A-PREDICTIONS.md per-spec lines)
// =============================================================================

interface SpecPrediction {
  spec: string;
  baselineRate: number;
  predictedRate: number;
  predictedLiftPp: number;
}

function loadPredictions(): Map<string, SpecPrediction> {
  const out = new Map<string, SpecPrediction>();
  const filepath = path.join(REPO_ROOT, 'specs', 'big-spec-runs', 'eval', 'STAGE-A-PREDICTIONS.md');
  if (!fs.existsSync(filepath)) {
    console.warn(`[stage-a-validation] no predictions file at ${filepath}`);
    return out;
  }
  const md = fs.readFileSync(filepath, 'utf8');
  // Parse the per-spec table rows (format: | spec | refs | pspec | domk | llm-only | baseline | predicted | lift |).
  const lineRe = /^\|\s*([\w-]+)\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*([\d.]+)%[^|]*\|\s*([\d.]+)%[^|]*\|\s*[+\-]?([\d.]+)pp\s*\|/;
  for (const line of md.split('\n')) {
    const m = line.match(lineRe);
    if (m) {
      out.set(m[1], {
        spec: m[1],
        baselineRate: parseFloat(m[2]) / 100,
        predictedRate: parseFloat(m[3]) / 100,
        predictedLiftPp: parseFloat(m[4]),
      });
    }
  }
  return out;
}

// =============================================================================
// Markdown renderer
// =============================================================================

const PCT = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

function renderResults(results: SpecResult[], predictions: Map<string, SpecPrediction>): string {
  const lines: string[] = [];
  lines.push('# Stage-A Validation Results');
  lines.push('');
  lines.push('> Empirical Stage-A coverage measured by running the full deterministic layer (Spectral OAS3-default + apiq-custom + Walkers + Domain-Knowledge) on each of the 4 specs and scoring against its reference target via Jaccard. Generated by `scripts/spike/eval/stage-a-validation.ts`.');
  lines.push('>');
  lines.push('> Compare against `STAGE-A-PREDICTIONS.md` (Phase-0-time hypothesis).');
  lines.push('');

  // Headline table.
  lines.push('## Headline: measured vs predicted coverage');
  lines.push('');
  lines.push('| Spec | Baseline (C-i) | Predicted post-Stage-A | **Measured (Jaccard)** | **Measured (Embedding)** | Delta vs predicted |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const r of results) {
    const pred = predictions.get(r.spec);
    const baselineCell = pred ? PCT(pred.baselineRate) : '—';
    const predictedCell = pred ? PCT(pred.predictedRate) : '—';
    const jaccardCell = `${PCT(r.jaccard.coverageRate)} (${r.jaccard.coveredRefs}/${r.jaccard.totalRefs})`;
    const embeddingCell = r.embedding
      ? `**${PCT(r.embedding.coverageRate)} (${r.embedding.coveredRefs}/${r.embedding.totalRefs})**`
      : '—';
    const bestRate = Math.max(r.jaccard.coverageRate, r.embedding?.coverageRate ?? 0);
    const deltaCell = pred
      ? `${(bestRate - pred.predictedRate) * 100 >= 0 ? '+' : ''}${((bestRate - pred.predictedRate) * 100).toFixed(1)}pp`
      : '—';
    lines.push(`| ${r.spec} | ${baselineCell} | ${predictedCell} | ${jaccardCell} | ${embeddingCell} | ${deltaCell} |`);
  }
  lines.push('');

  // Per-spec breakdowns.
  for (const r of results) {
    lines.push(`## ${r.spec}`);
    lines.push('');
    lines.push(`Findings emitted by deterministic layer: **${r.findings.length}**`);
    lines.push('');
    lines.push('Per-layer breakdown:');
    lines.push('');
    lines.push('| Layer | Findings |');
    lines.push('|---|---:|');
    lines.push(`| Spectral (OAS3-default) | ${r.perLayer['spectral-oas3-default']} |`);
    lines.push(`| Spectral (apiq-custom) | ${r.perLayer['spectral-apiq-custom']} |`);
    lines.push(`| Walkers (statistical) | ${r.perLayer['walker-statistical']} |`);
    lines.push(`| Domain-knowledge | ${r.perLayer['domain-knowledge']} |`);
    lines.push('');
    lines.push(`Unique clusters: **${r.cluster.uniqueClusters}** (repetition rate ${PCT(r.cluster.repetitionRate)})`);
    lines.push('');
    lines.push('### Coverage breakdown');
    lines.push('');
    lines.push('| Subset | Covered | Total | Rate |');
    lines.push('|---|---:|---:|---:|');
    lines.push(`| Total | ${r.jaccard.coveredRefs} | ${r.jaccard.totalRefs} | ${PCT(r.jaccard.coverageRate)} |`);
    lines.push(`| Substantive (non-lint) | ${r.jaccard.substantiveCoveredRefs} | ${r.jaccard.substantiveTotalRefs} | ${PCT(r.jaccard.substantiveCoverageRate)} |`);
    lines.push(`| Pure-spectral | ${r.jaccard.pureSpectralCoveredRefs} | ${r.jaccard.pureSpectralTotalRefs} | ${PCT(r.jaccard.pureSpectralCoverageRate)} |`);
    lines.push(`| Domain-knowledge | ${r.jaccard.domainKnowledgeCoveredRefs} | ${r.jaccard.domainKnowledgeTotalRefs} | ${PCT(r.jaccard.domainKnowledgeCoverageRate)} |`);
    lines.push(`| LLM-only | ${r.jaccard.llmOnlyCoveredRefs} | ${r.jaccard.llmOnlyTotalRefs} | ${PCT(r.jaccard.llmOnlyCoverageRate)} |`);
    lines.push(`| Knowledge-backed-gap | ${r.jaccard.knowledgeBackedCoveredRefs} | ${r.jaccard.knowledgeBackedTotalRefs} | ${PCT(r.jaccard.knowledgeBackedCoverageRate)} |`);
    lines.push('');
    // List unmatched refs to help the ref-update-diff (Living-Artefact maintenance).
    const unmatched = r.jaccard.perRef.filter((p) => !p.matched);
    if (unmatched.length > 0) {
      lines.push('### Unmatched refs (candidates for Living-Artefact tag review)');
      lines.push('');
      for (const u of unmatched) {
        const ref = r.reference.findings.find((f) => f.id === u.refId);
        const tag = ref
          ? [
              ref.classification.isLintFlavoured ? 'lint' : null,
              ref.classification.isPureSpectralDetectable ? 'pspec' : null,
              ref.classification.isDomainKnowledgeDetectable ? 'domk' : null,
              !ref.classification.isPureSpectralDetectable &&
              !ref.classification.isDomainKnowledgeDetectable
                ? 'llm-only'
                : null,
            ].filter(Boolean).join(',')
          : '?';
        lines.push(`- **${u.refId}** [${tag}] ${u.refTitle}`);
      }
      lines.push('');
    }
    lines.push('### Top detectors firing on this spec');
    lines.push('');
    const sortedDetectors = Object.entries(r.perDetector).sort((a, b) => b[1] - a[1]).slice(0, 8);
    lines.push('| Detector | Count |');
    lines.push('|---|---:|');
    for (const [id, count] of sortedDetectors) {
      lines.push(`| ${id} | ${count} |`);
    }
    lines.push('');
  }

  lines.push('## What Phase B measures next');
  lines.push('');
  lines.push('1. Real Stage-A pre-pass + LLM Phase-1+2 on each spec → measure post-pre-pass coverage delta.');
  lines.push('2. If pure-spectral measured << predicted (95%) → expand custom-rules / improve title-vocabulary in refs (Vocabulary-mismatch is the dominant Phase-0-prediction-falsifier).');
  lines.push('3. If domain-knowledge measured << predicted (75%) → expand per-API-family pattern library.');
  lines.push('4. Unmatched refs above are the Living-Artefact-Diff candidates — re-tag classifications based on actual Stage-A behaviour.');
  lines.push('');

  return lines.join('\n') + '\n';
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  await registerDefaultRunners();

  const args = process.argv.slice(2);
  const specsFlag = args.find((a) => a.startsWith('--specs='))?.slice('--specs='.length);
  const specs = specsFlag ? specsFlag.split(',') : ALL_SPECS;

  // Load references.
  const refs = new Map<string, ReferenceTarget>();
  for (const s of specs) {
    const refPath = path.join(REPO_ROOT, 'openapi-examples', s, 'reference', 'findings.json');
    if (!fs.existsSync(refPath)) {
      console.warn(`[stage-a-validation] skip ${s}: no reference at ${refPath}`);
      continue;
    }
    refs.set(s, loadReferenceTarget(refPath, s));
  }

  // Validate each spec.
  const results: SpecResult[] = [];
  for (const s of specs) {
    const ref = refs.get(s);
    if (!ref) continue;
    const r = await validateOneSpec(s, ref);
    if (r) results.push(r);
  }

  // Render + write.
  const predictions = loadPredictions();
  const md = renderResults(results, predictions);
  const outPath = path.join(REPO_ROOT, 'specs', 'big-spec-runs', 'eval', 'STAGE-A-RESULTS.md');
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`\n[stage-a-validation] wrote ${path.relative(REPO_ROOT, outPath)}`);

  // Stdout summary.
  console.log('\n=== Stage-A Validation summary ===');
  console.log('| spec | jaccard | embedding | predicted | delta-best |');
  for (const r of results) {
    const pred = predictions.get(r.spec);
    const jaccard = `${(r.jaccard.coverageRate * 100).toFixed(1)}%`;
    const embedding = r.embedding ? `${(r.embedding.coverageRate * 100).toFixed(1)}%` : '—';
    const predicted = pred ? `${(pred.predictedRate * 100).toFixed(1)}%` : '—';
    const bestRate = Math.max(r.jaccard.coverageRate, r.embedding?.coverageRate ?? 0);
    const delta = pred
      ? `${(bestRate - pred.predictedRate) * 100 >= 0 ? '+' : ''}${((bestRate - pred.predictedRate) * 100).toFixed(1)}pp`
      : '—';
    console.log(`| ${r.spec.padEnd(15)} | ${jaccard.padStart(7)} | ${embedding.padStart(7)} | ${predicted.padStart(7)} | ${delta.padStart(10)} |`);
  }
}

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
