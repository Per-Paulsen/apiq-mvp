#!/usr/bin/env tsx
/**
 * CLI runner for `api-corpus-analyzer`. Loads corpus, runs all 10 statistics,
 * prints summary to stdout, optionally writes JSON dump.
 *
 * Usage:
 *   npx tsx eval/run-api-corpus-analysis.ts [<manifestPath>] [--json <out.json>]
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadCorpusFromManifest, analyzeAll, detailedStandardHeaderCoverage, STATISTICS } from './api-corpus-analyzer.js';

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;
const positional = args.filter((_a, i) => i !== jsonIdx && i !== jsonIdx + 1);
const manifestPath = positional[0] ?? path.resolve(process.cwd(), 'data/healthy-corpus/manifest.json');

console.log(`[run-api-corpus-analysis] Loading manifest from: ${manifestPath}`);
const t0 = Date.now();
const corpus = loadCorpusFromManifest(manifestPath);
console.log(`[run-api-corpus-analysis] Loaded ${corpus.length} specs in ${Date.now() - t0}ms.`);

const t1 = Date.now();
const stats = analyzeAll(corpus);
console.log(`[run-api-corpus-analysis] Ran ${stats.length} statistics in ${Date.now() - t1}ms.`);

for (const s of stats) {
  console.log(`\n## ${s.patternId} — ${s.description}`);
  console.log(
    `Lens: ${s.lens.join(', ')} | total-specs: ${s.totalSpecs} | skipped: ${s.skippedCount} | confidence: ${(s.confidenceScore * 100).toFixed(1)}%`,
  );
  const sortedDist = Array.from(s.distribution.entries()).sort((a, b) => b[1] - a[1]);
  for (const [val, n] of sortedDist) {
    const pct = s.totalSpecs > 0 ? ((n / s.totalSpecs) * 100).toFixed(1) : '0.0';
    const examples = s.examples?.get(val) ?? [];
    const exampleText = examples.length > 0 ? `   e.g. ${examples.slice(0, 2).join(', ')}` : '';
    console.log(`  ${val.padEnd(28)} ${n.toString().padStart(5)} (${pct}%)${exampleText}`);
  }
}

// Auxiliary: detailed standard-header per-header adoption-rate
console.log('\n## Auxiliary — Standard-Header Per-Header Adoption-Rate (over all 521 specs)');
const headerCoverage = detailedStandardHeaderCoverage(corpus);
const sortedHeaders = Array.from(headerCoverage.entries()).sort((a, b) => b[1] - a[1]);
for (const [h, n] of sortedHeaders) {
  const pct = corpus.length > 0 ? ((n / corpus.length) * 100).toFixed(1) : '0.0';
  console.log(`  ${h.padEnd(28)} ${n.toString().padStart(5)} (${pct}%)`);
}

if (jsonOut) {
  const out = {
    generated: new Date().toISOString(),
    corpusSize: corpus.length,
    manifestPath,
    statistics: stats.map((s) => ({
      patternId: s.patternId,
      description: s.description,
      lens: s.lens,
      totalSpecs: s.totalSpecs,
      skippedCount: s.skippedCount,
      confidenceScore: s.confidenceScore,
      distribution: Object.fromEntries(s.distribution),
      examples: s.examples ? Object.fromEntries(s.examples) : undefined,
    })),
    standardHeaderCoverage: Object.fromEntries(headerCoverage),
    knownStats: Object.keys(STATISTICS),
  };
  fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n[run-api-corpus-analysis] JSON dump written to: ${jsonOut}`);
}
