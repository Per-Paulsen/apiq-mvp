/**
 * Cross-cutting statistical walkers — Task A1.3.
 *
 * A walker traverses the spec and emits a single (or small number of) findings
 * that aggregate statistical patterns. Unlike Spectral rules which fire per-
 * occurrence, walkers fire once per pattern with a count + percentage in the
 * narration.
 *
 * Public API: runWalkers(spec, opts) => DetectorFinding[]
 *
 * CLI:
 *   cd scripts/spike && npx tsx deterministic/walkers/index.ts <spec-name>
 *
 * where <spec-name> resolves to ../../openapi-examples/<spec-name>/spec.json.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { walkHtmlPrevalence } from './html-prevalence.js';
import { walkEmptySchemaDescriptions } from './empty-schema-descriptions.js';
import { walkMaxLengthDefaultEverywhere } from './maxlength-default-everywhere.js';
import { walkIntegerNoRangeConstraints } from './integer-no-range-constraints.js';
import { walkRequestBodyNoExamples } from './request-body-no-examples.js';
import { walkSingleDefaultResponse } from './single-default-response.js';
import { walkProseDeprecationWithoutFlag } from './prose-deprecation-without-flag.js';
import { walkOperationIdVerbose } from './operationid-verbose.js';
import { walkPaginationStyleInconsistency } from './pagination-style-inconsistency.js';
import { walkVendorExtensionOveruse } from './vendor-extension-overuse.js';
import { walkUnusedComponentHeaders } from './unused-component-headers.js';
import { walkResponseWithoutValidatorsOn304 } from './response-without-validators-on-304.js';
import { walkAiAgentConsumability } from './ai-agent-consumability.js';
import { walkEvolutionStatistical } from './evolution-statistical.js';
import { walkOperationalMetadata } from './operational-metadata.js';
import { walkPrivacyDataClass } from './privacy-data-class.js';

type WalkerFn = (spec: object, opts?: DetectorOptions) => Promise<DetectorFinding[]>;

const ALL_WALKERS: WalkerFn[] = [
  walkHtmlPrevalence,
  walkEmptySchemaDescriptions,
  walkMaxLengthDefaultEverywhere,
  walkIntegerNoRangeConstraints,
  walkRequestBodyNoExamples,
  walkSingleDefaultResponse,
  walkProseDeprecationWithoutFlag,
  walkOperationIdVerbose,
  walkPaginationStyleInconsistency,
  walkVendorExtensionOveruse,
  walkUnusedComponentHeaders,
  walkResponseWithoutValidatorsOn304,
  walkAiAgentConsumability,
  walkEvolutionStatistical,
  walkOperationalMetadata,
  walkPrivacyDataClass,
];

export async function runWalkers(
  spec: object,
  opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const all: DetectorFinding[] = [];
  for (const walker of ALL_WALKERS) {
    try {
      const findings = await walker(spec, opts);
      all.push(...findings);
    } catch (err) {
      console.warn(
        `[walker] ${walker.name} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// CLI — runs all walkers against a single spec from openapi-examples.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const SPIKE_DIR = path.resolve(__dirname, '..', '..');
  const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
  const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

  const specName = process.argv[2];
  if (!specName) {
    console.error('Usage: tsx deterministic/walkers/index.ts <spec-name>');
    console.error('  e.g. tsx deterministic/walkers/index.ts stripe-full');
    process.exit(1);
  }

  const specDir = path.join(EXAMPLES_DIR, specName);
  if (!fs.existsSync(specDir)) {
    console.error(`Spec directory not found: ${specDir}`);
    process.exit(1);
  }

  // Try common spec-file names (.json, .yaml, .yml).
  let specPath: string | null = null;
  for (const ext of ['json', 'yaml', 'yml']) {
    const candidate = path.join(specDir, `spec.${ext}`);
    if (fs.existsSync(candidate)) {
      specPath = candidate;
      break;
    }
  }
  if (!specPath) {
    console.error(`No spec.{json,yaml,yml} found in ${specDir}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(specPath, 'utf8');
  let spec: object;
  if (specPath.endsWith('.json')) {
    spec = JSON.parse(raw);
  } else {
    const YAML = (await import('yaml')).default;
    spec = YAML.parse(raw) as object;
  }

  console.log(`Loaded spec: ${specPath}`);
  console.log(`Running ${ALL_WALKERS.length} walkers...`);
  console.log('');

  const startedAt = Date.now();
  const findings = await runWalkers(spec, { specName });
  const durationMs = Date.now() - startedAt;

  console.log(`${ALL_WALKERS.length} walkers ran, ${findings.length} findings emitted (${durationMs}ms)`);
  console.log('');
  if (findings.length === 0) {
    console.log('(No walker findings.)');
    return;
  }
  for (const f of findings) {
    console.log(`[${f.detectorId}]`);
    console.log(`  title: ${f.title}`);
    if (f.meta) {
      console.log(`  meta:  ${JSON.stringify(f.meta)}`);
    }
    if (f.affectedEndpoints.length > 0) {
      console.log(`  affectedEndpoints: ${f.affectedEndpoints.length}`);
    }
    console.log('');
  }
}

// Cross-platform-safe entry-point guard
{
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
