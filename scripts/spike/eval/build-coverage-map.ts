#!/usr/bin/env tsx
/**
 * I2 — build-coverage-map.ts
 *
 * Runs `runDeterministicLayer` ONCE on each of the 4 reference-specs
 * sequentially (~45min total) + extracts empirical fire-data into a
 * canonical `coverage.json` (gitignored) + auto-generated `COVERAGE.md`
 * (committed).
 *
 * Sequential, NOT parallel (Spectral is CPU-bound + single-process per spec).
 *
 * Pattern-ID lookup priority:
 *   1. inventory.json (from I1) — IDEAL, gives detectorId → patternId map
 *   2. parse yaml rules directly + extract apiq-meta.pattern-id — FALLBACK
 * Currently inventory.json may not exist when this runs in parallel with I1,
 * so we always use the yaml-FALLBACK to keep this script self-sufficient.
 *
 * Schema is CANONICAL — Task #3 (cross-refs + drift) consumes coverage.json.
 *
 * Usage:
 *   npm run build-coverage          (full 4-spec run, ~45min)
 *   tsx build-coverage-map.ts dnd5eapi   (single-spec smoke, ~30s)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  runDeterministicLayer,
  registerDefaultRunners,
  type DeterministicLayerResult,
} from '../deterministic/index.js';
import {
  buildCoverageJson,
  loadPatternIdMapFromYamls,
  loadDetectorLayerFromResult,
  type CoverageJson,
  type PerSpecRun,
} from './coverage-map-aggregator.js';
import { renderCoverageMarkdown } from './coverage-map-markdown.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EVAL_DIR = path.resolve(__dirname);
const RULES_DIR = path.resolve(__dirname, '..', 'deterministic', 'rules');

const ALL_SPECS = ['dnd5eapi', 'pagerduty-full', 'github-rest', 'stripe-full'] as const;
type SpecName = typeof ALL_SPECS[number];

interface RawPerSpecResult {
  specName: string;
  result: DeterministicLayerResult;
  startedAt: string;
  finishedAt: string;
  runtimeMs: number;
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function gitShaForFile(absPath: string): string {
  try {
    const sha = execSync(`git log -1 --format=%H -- "${absPath}"`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    return sha || 'uncommitted';
  } catch {
    return 'unknown';
  }
}

async function runOneSpec(specName: SpecName): Promise<RawPerSpecResult> {
  const specPath = path.join(REPO_ROOT, 'openapi-examples', specName, 'spec.json');
  if (!fs.existsSync(specPath)) {
    throw new Error(`Reference-spec not found: ${specPath}`);
  }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  log(`Starting ${specName}...`);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const result = await runDeterministicLayer(spec, { specName });
  const runtimeMs = Date.now() - t0;
  const finishedAt = new Date().toISOString();
  log(
    `${specName} done in ${(runtimeMs / 1000).toFixed(1)}s — ` +
      `${result.findings.length} findings / ` +
      `${Object.keys(result.perDetector).length} detectors fired`
  );

  // Persist per-spec partial so re-runs can reuse if a later spec crashes.
  const partialPath = path.join(EVAL_DIR, `coverage-partial-${specName}.json`);
  // Strip `findings[]` (huge — we only need perDetector + perLayer + meta).
  const partial = {
    specName,
    startedAt,
    finishedAt,
    runtimeMs,
    perLayer: result.perLayer,
    perDetector: result.perDetector,
    totalFindings: result.findings.length,
    detectorLayerMap: loadDetectorLayerFromResult(result),
  };
  fs.writeFileSync(partialPath, JSON.stringify(partial, null, 2), 'utf8');
  log(`  → partial written to ${path.relative(REPO_ROOT, partialPath)}`);

  return { specName, result, startedAt, finishedAt, runtimeMs };
}

async function main(): Promise<void> {
  const argSpec = process.argv[2];
  const specsToRun: readonly SpecName[] = argSpec
    ? (ALL_SPECS.filter((s) => s === argSpec) as readonly SpecName[])
    : ALL_SPECS;
  if (specsToRun.length === 0) {
    throw new Error(
      `Unknown spec "${argSpec}". Valid: ${ALL_SPECS.join(', ')}`
    );
  }

  log(`Registering default runners...`);
  await registerDefaultRunners();

  log(`Will run ${specsToRun.length} spec(s) sequentially: ${specsToRun.join(', ')}`);

  const t0 = Date.now();
  const perSpec: RawPerSpecResult[] = [];
  for (const spec of specsToRun) {
    const r = await runOneSpec(spec);
    perSpec.push(r);
  }
  const totalRuntimeMs = Date.now() - t0;
  log(`All specs done in ${(totalRuntimeMs / 1000 / 60).toFixed(2)}min`);

  // Pattern-ID map — yaml FALLBACK (always works, no I1-dependency).
  log(`Loading patternId map from ${RULES_DIR}...`);
  const patternIdMap = loadPatternIdMapFromYamls(RULES_DIR, parseYaml);
  log(`  → ${patternIdMap.size} detector→patternId mappings loaded`);

  // Reference-spec git-SHAs.
  const referenceSpecVersions: Record<string, string> = {};
  for (const spec of specsToRun) {
    const specPath = path.join(REPO_ROOT, 'openapi-examples', spec, 'spec.json');
    referenceSpecVersions[spec] = gitShaForFile(specPath);
  }

  // Aggregate.
  const perSpecRuns: PerSpecRun[] = perSpec.map((r) => ({
    specName: r.specName,
    runtimeMs: r.runtimeMs,
    perLayer: r.result.perLayer,
    perDetector: r.result.perDetector,
    detectorLayerMap: loadDetectorLayerFromResult(r.result),
    totalFindings: r.result.findings.length,
  }));

  const coverage: CoverageJson = buildCoverageJson({
    perSpec: perSpecRuns,
    patternIdMap,
    referenceSpecVersions,
    totalRuntimeMs,
  });

  // Write canonical coverage.json (gitignored).
  const coverageJsonPath = path.join(EVAL_DIR, 'coverage.json');
  fs.writeFileSync(coverageJsonPath, JSON.stringify(coverage, null, 2), 'utf8');
  log(`coverage.json written → ${path.relative(REPO_ROOT, coverageJsonPath)}`);

  // Render + write COVERAGE.md (committed).
  const md = renderCoverageMarkdown(coverage);
  const coverageMdPath = path.join(EVAL_DIR, 'COVERAGE.md');
  fs.writeFileSync(coverageMdPath, md, 'utf8');
  log(`COVERAGE.md written → ${path.relative(REPO_ROOT, coverageMdPath)}`);

  // Final summary.
  log(`=== Build-Coverage-Map Summary ===`);
  log(`  Specs run:           ${perSpec.length} / ${ALL_SPECS.length}`);
  log(`  Total findings:      ${perSpec.reduce((s, r) => s + r.result.findings.length, 0)}`);
  log(`  Unique detectors:    ${coverage.per_detector.length}`);
  log(`  Untested detectors:  ${coverage.untested_detectors.length} (fired on 0/4 specs from those that ran)`);
  log(`  Pattern-IDs covered: ${coverage.per_pattern_id.length}`);
  log(`  Total runtime:       ${(totalRuntimeMs / 1000 / 60).toFixed(2)}min`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

// Re-export for tests / external consumers.
export { ALL_SPECS };
export type { CoverageJson, PerSpecRun };
