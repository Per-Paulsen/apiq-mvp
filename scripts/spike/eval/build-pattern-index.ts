#!/usr/bin/env tsx
/**
 * CLI: build the pattern-knowledge-index from rules-brainstorm.md.
 * Reads OPENAI_API_KEY from scripts/spike/.env or repo-root .env.
 *
 * Usage: npx tsx scripts/spike/eval/build-pattern-index.ts
 */

import { buildPatternIndex } from './pattern-index.js';

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line no-console
    console.error(
      'OPENAI_API_KEY not set. Add it to scripts/spike/.env or repo-root .env before running.'
    );
    process.exit(1);
  }
  const t0 = Date.now();
  const stats = await buildPatternIndex();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  // eslint-disable-next-line no-console
  console.log(`\n=== Pattern-Index Build ===`);
  // eslint-disable-next-line no-console
  console.log(`Total patterns:     ${stats.totalPatterns}`);
  // eslint-disable-next-line no-console
  console.log(`Cache hits:         ${stats.cacheHits}`);
  // eslint-disable-next-line no-console
  console.log(`Cache misses:       ${stats.cacheMisses}`);
  // eslint-disable-next-line no-console
  console.log(`API calls (batched): ${stats.apiCalls}`);
  // eslint-disable-next-line no-console
  console.log(`Index file size:    ${(stats.indexFileSize / 1024 / 1024).toFixed(2)} MB`);
  // eslint-disable-next-line no-console
  console.log(`Elapsed:            ${elapsed}s`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
