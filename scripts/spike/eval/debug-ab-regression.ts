#!/usr/bin/env tsx
/**
 * Debug A+B regression: scoreJaccardEnhanced with various option combinations
 * to identify which option causes the dnd5eapi 28.6% → 21.4% regression.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';

import { runDeterministicLayer, registerDefaultRunners } from '../deterministic/index.js';
import { JaccardScorer, scoreJaccardEnhanced } from './scorers/jaccard.js';
import { loadReferenceTarget } from './reference.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

async function main(): Promise<void> {
  await registerDefaultRunners();
  const specName = process.argv[2] ?? 'dnd5eapi';
  const specPath = path.join(REPO_ROOT, 'openapi-examples', specName, 'spec.json');
  const refPath = path.join(REPO_ROOT, 'openapi-examples', specName, 'reference', 'findings.json');

  console.log(`[debug] loading ${specName}`);
  const spec = (await SwaggerParser.dereference(specPath)) as object;
  const ref = loadReferenceTarget(refPath, specName);

  console.log(`[debug] running deterministic layer`);
  const layerResult = await runDeterministicLayer(spec, { specName });
  console.log(`[debug] emitted ${layerResult.findings.length} findings`);

  const runMeta = { spec: specName, architecture: 'stage-a-deterministic-layer' };

  const variants = [
    { label: 'baseline (no rollup, no keywords)', options: { useRollup: false, useKeywords: false } },
    { label: 'rollup-only', options: { useRollup: true, useKeywords: false } },
    { label: 'keywords-only', options: { useRollup: false, useKeywords: true } },
    { label: 'rollup + keywords (current)', options: { useRollup: true, useKeywords: true } },
  ];

  console.log(`\n=== ${specName} — A+B Variants ===\n`);
  for (const v of variants) {
    const r = scoreJaccardEnhanced({
      reference: ref,
      llmFindings: layerResult.findings,
      runMeta,
      options: v.options,
    });
    const matchedIds = r.perRef.filter((p) => p.matched).map((p) => p.refId).join(',');
    console.log(`${v.label.padEnd(40)} → ${r.coveredRefs}/${r.totalRefs} (${(r.coverageRate * 100).toFixed(1)}%) — matched: ${matchedIds}`);
  }

  // Also baseline JaccardScorer (no options at all)
  const baselineLegacy = JaccardScorer.score({ reference: ref, llmFindings: layerResult.findings, runMeta });
  const matchedIds = baselineLegacy.perRef.filter((p) => p.matched).map((p) => p.refId).join(',');
  console.log(`${'JaccardScorer.score (legacy)'.padEnd(40)} → ${baselineLegacy.coveredRefs}/${baselineLegacy.totalRefs} (${(baselineLegacy.coverageRate * 100).toFixed(1)}%) — matched: ${matchedIds}`);

  // Diagnostic: print rollup output
  console.log(`\n=== Rollup diagnostic ===`);
  const { clusterFindings } = await import('./scorers/repetition-cluster.js');
  const cluster = clusterFindings(layerResult.findings, layerResult.findings.length);
  console.log(`Clusters: ${cluster.uniqueClusters} / Findings: ${layerResult.findings.length}`);
  console.log(`Top 8 clusters:`);
  for (const c of cluster.topClusters.slice(0, 8)) {
    console.log(`  count=${c.count.toString().padStart(3)}  "${c.exampleTitle}"`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
