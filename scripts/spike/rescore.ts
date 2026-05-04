#!/usr/bin/env tsx
/**
 * Re-score a previously saved big-spec-run against the current reference target +
 * the current validate-patches + score-coverage logic. Does NOT call the LLM.
 *
 * Usage:
 *   npx tsx rescore.ts <arch>__<spec>
 * Example:
 *   npx tsx rescore.ts bigger-context__stripe-full
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { Operation } from 'fast-json-patch';

import { validatePatchOps } from './validate-patches.js';
import { cycleStripSpec } from './stringify-spec.js';
import { scoreCoverage } from './score-coverage.js';
import type { Finding } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNS_DIR = path.join(REPO_ROOT, 'specs', 'big-spec-runs');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

async function main() {
  const runKey = process.argv[2];
  if (!runKey) {
    // eslint-disable-next-line no-console
    console.error('Usage: npx tsx rescore.ts <arch>__<spec>');
    process.exit(1);
  }
  const inPath = path.join(RUNS_DIR, `${runKey}.json`);
  if (!fs.existsSync(inPath)) {
    // eslint-disable-next-line no-console
    console.error(`Run file not found: ${inPath}`);
    process.exit(1);
  }
  const original = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const specName = original.specName;
  const findings: Finding[] = original.findings;

  // Re-derive cycle-stripped spec for re-validation
  const specPath = path.join(EXAMPLES_DIR, specName, 'spec.json');
  const raw = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const dereffed = await SwaggerParser.dereference(raw as Parameters<typeof SwaggerParser.dereference>[0]);
  const specForAnalysis = cycleStripSpec(dereffed) as object;

  // Re-validate every finding's patchOps with the progressive validator
  const patchValidation = findings.map((f, i) => ({
    findingIndex: i,
    ...validatePatchOps(specForAnalysis, f.patchOps as Operation[]),
  }));

  const total = patchValidation.length;
  const applyClean = patchValidation.filter((p) => p.applyClean).length;
  const hallucinated = patchValidation.filter((p) => p.hallucinationCheck.hallucinated).length;

  // Re-score coverage against current reference target
  const referencePath = path.join(EXAMPLES_DIR, specName, 'reference', 'findings-target-big.md');
  let coverage = null;
  if (fs.existsSync(referencePath)) {
    coverage = scoreCoverage(referencePath, findings);
  }

  // eslint-disable-next-line no-console
  console.log(`=== RE-SCORE: ${runKey} ===`);
  // eslint-disable-next-line no-console
  console.log(`spec:           ${specName}`);
  // eslint-disable-next-line no-console
  console.log(`model:          ${original.model}`);
  // eslint-disable-next-line no-console
  console.log(`total findings: ${total}`);
  // eslint-disable-next-line no-console
  console.log(`apply-clean:    ${applyClean}/${total} (${(applyClean/total*100).toFixed(1)}%)`);
  // eslint-disable-next-line no-console
  console.log(`hallucinated:   ${hallucinated}/${total} (${(hallucinated/total*100).toFixed(1)}%)`);
  if (coverage) {
    // eslint-disable-next-line no-console
    console.log(`coverage:       ${coverage.coveredCount}/${coverage.totalCount} (${(coverage.coverageRate*100).toFixed(1)}%)`);
    // eslint-disable-next-line no-console
    console.log(`\n=== Coverage matches ===`);
    for (const m of coverage.perRef) {
      const mark = m.matched ? '✓' : ' ';
      // eslint-disable-next-line no-console
      console.log(`  [${mark}] R${String(m.refIndex).padStart(2)}: ${m.matched ? 'G'+(m.matchedLlmIndex! + 1).toString().padEnd(2) : '   '} :: ${m.refTitle.slice(0, 75)}`);
      if (m.matched) {
        // eslint-disable-next-line no-console
        console.log(`         reason: ${m.reason}`);
      }
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
