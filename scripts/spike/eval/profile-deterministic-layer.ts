/**
 * Profile-Script for OQ-3 (T-Stripe-Perf).
 *
 * Times each layer of `runDeterministicLayer` independently against a chosen
 * spec (default `stripe-full`):
 *   - Spectral runner (full sweep, 12-yaml ruleset)
 *   - Each walker individually (25 walkers)
 *   - Each module-class individually (15 modules)
 *
 * Output: console summary + JSON file at `specs/E09-w-arch-stripe-perf-profile.json`.
 *
 * Run:
 *   cd scripts/spike
 *   NODE_OPTIONS=--max-old-space-size=8192 npx tsx eval/profile-deterministic-layer.ts [spec-name]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSpectralLayers } from '../deterministic/infra/spectral-runner.js';
import { runModules } from '../deterministic/modules/index.js';
import type { DetectorFinding } from '../deterministic/infra/types.js';

// Walker imports — duplicated from walkers/index.ts so we can time each one.
import { walkHtmlPrevalence } from '../deterministic/aggregators/html-prevalence.js';
import { walkEmptySchemaDescriptions } from '../deterministic/aggregators/empty-schema-descriptions.js';
import { walkMaxLengthDefaultEverywhere } from '../deterministic/aggregators/maxlength-default-everywhere.js';
import { walkIntegerNoRangeConstraints } from '../deterministic/aggregators/integer-no-range-constraints.js';
import { walkRequestBodyNoExamples } from '../deterministic/aggregators/request-body-no-examples.js';
import { walkSingleDefaultResponse } from '../deterministic/aggregators/single-default-response.js';
import { walkProseDeprecationWithoutFlag } from '../deterministic/aggregators/prose-deprecation-without-flag.js';
import { walkOperationIdVerbose } from '../deterministic/aggregators/operationid-verbose.js';
import { walkPaginationStyleInconsistency } from '../deterministic/aggregators/pagination-style-inconsistency.js';
import { walkVendorExtensionOveruse } from '../deterministic/aggregators/vendor-extension-overuse.js';
import { walkUnusedComponentHeaders } from '../deterministic/aggregators/unused-component-headers.js';
import { walkResponseWithoutValidatorsOn304 } from '../deterministic/aggregators/response-without-validators-on-304.js';
import { walkAiAgentConsumability } from '../deterministic/aggregators/ai-agent-consumability.js';
import { walkEvolutionStatistical } from '../deterministic/aggregators/evolution-statistical.js';
import { walkOperationalMetadata } from '../deterministic/aggregators/operational-metadata.js';
import { walkPrivacyDataClass } from '../deterministic/aggregators/privacy-data-class.js';
import { walkSchemaSimilarity } from '../deterministic/aggregators/schema-similarity.js';
import { walkPluralisedNodes } from '../deterministic/aggregators/pluralised-nodes.js';
import { walkSla4oaiPresence } from '../deterministic/aggregators/info-tier-sla4oai.js';
import { walkCapabilityDiscoveryEndpoint } from '../deterministic/aggregators/info-tier-capability-discovery.js';
import { walkRfc9727ApiCatalog } from '../deterministic/aggregators/info-tier-rfc9727-api-catalog.js';
import { walkRfc9728OauthProtectedResource } from '../deterministic/aggregators/info-tier-rfc9728-oauth-protected-resource.js';
import { walkBrownoutSchedule } from '../deterministic/aggregators/info-tier-brownout-schedule.js';
import { walkRateLimitTier } from '../deterministic/aggregators/info-tier-rate-limit-tier.js';
import { walkArazzoWorkflowDocument } from '../deterministic/aggregators/info-tier-arazzo-workflow.js';

// Module imports
import { runAjvValidator } from '../deterministic/modules/ajv-validator.js';
import { runCodegenValidation } from '../deterministic/modules/codegen-validation.js';
import { walkCrossReferenceConsistency } from '../deterministic/modules/cross-reference-consistency.js';
import { runDuplicateSchemaDetectors } from '../deterministic/modules/duplicate-schemas.js';
import { runNamingClassifier } from '../deterministic/modules/naming-classifier.js';
import { walkPathTemplates } from '../deterministic/modules/path-template-parser.js';
import { runRefGraphAnalysis } from '../deterministic/modules/ref-graph.js';
import { runSecretScanner } from '../deterministic/modules/secret-scanner.js';
import { runWebhookSignature } from '../deterministic/modules/webhook-signature.js';
import { walkHttpProtocolPairings } from '../deterministic/modules/http-protocol-pairings.js';
import { validateProblemJson } from '../deterministic/modules/problem-json-validator.js';
import { runOAuth2FlowValidator } from '../deterministic/modules/oauth2-flow-validator.js';
import { runMediaTypeValidator } from '../deterministic/modules/media-type-iana-validator.js';
import { runJsonSchemaDraftDetector } from '../deterministic/classifiers/json-schema-draft-detector.js';
import { runStyleCoherenceChecks } from '../deterministic/modules/per-style-coherence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface PhaseTime {
  name: string;
  ms: number;
  findings: number;
}

const ALL_WALKERS: Array<{ name: string; fn: (spec: object, opts?: { specName?: string }) => Promise<DetectorFinding[]> }> = [
  { name: 'walkHtmlPrevalence', fn: walkHtmlPrevalence },
  { name: 'walkEmptySchemaDescriptions', fn: walkEmptySchemaDescriptions },
  { name: 'walkMaxLengthDefaultEverywhere', fn: walkMaxLengthDefaultEverywhere },
  { name: 'walkIntegerNoRangeConstraints', fn: walkIntegerNoRangeConstraints },
  { name: 'walkRequestBodyNoExamples', fn: walkRequestBodyNoExamples },
  { name: 'walkSingleDefaultResponse', fn: walkSingleDefaultResponse },
  { name: 'walkProseDeprecationWithoutFlag', fn: walkProseDeprecationWithoutFlag },
  { name: 'walkOperationIdVerbose', fn: walkOperationIdVerbose },
  { name: 'walkPaginationStyleInconsistency', fn: walkPaginationStyleInconsistency },
  { name: 'walkVendorExtensionOveruse', fn: walkVendorExtensionOveruse },
  { name: 'walkUnusedComponentHeaders', fn: walkUnusedComponentHeaders },
  { name: 'walkResponseWithoutValidatorsOn304', fn: walkResponseWithoutValidatorsOn304 },
  { name: 'walkAiAgentConsumability', fn: walkAiAgentConsumability },
  { name: 'walkEvolutionStatistical', fn: walkEvolutionStatistical },
  { name: 'walkOperationalMetadata', fn: walkOperationalMetadata },
  { name: 'walkPrivacyDataClass', fn: walkPrivacyDataClass },
  { name: 'walkSchemaSimilarity', fn: walkSchemaSimilarity },
  { name: 'walkPluralisedNodes', fn: walkPluralisedNodes },
  { name: 'walkSla4oaiPresence', fn: walkSla4oaiPresence },
  { name: 'walkCapabilityDiscoveryEndpoint', fn: walkCapabilityDiscoveryEndpoint },
  { name: 'walkRfc9727ApiCatalog', fn: walkRfc9727ApiCatalog },
  { name: 'walkRfc9728OauthProtectedResource', fn: walkRfc9728OauthProtectedResource },
  { name: 'walkBrownoutSchedule', fn: walkBrownoutSchedule },
  { name: 'walkRateLimitTier', fn: walkRateLimitTier },
  { name: 'walkArazzoWorkflowDocument', fn: walkArazzoWorkflowDocument },
];

const ALL_MODULES: Array<{ name: string; fn: (spec: object, opts?: { specName?: string }) => Promise<DetectorFinding[]> | DetectorFinding[] }> = [
  { name: 'ajv-validator', fn: runAjvValidator },
  { name: 'codegen-validation', fn: runCodegenValidation },
  { name: 'cross-reference-consistency', fn: walkCrossReferenceConsistency },
  { name: 'duplicate-schemas', fn: runDuplicateSchemaDetectors },
  { name: 'naming-classifier', fn: runNamingClassifier },
  { name: 'path-template-parser', fn: walkPathTemplates },
  { name: 'ref-graph', fn: runRefGraphAnalysis },
  { name: 'secret-scanner', fn: runSecretScanner },
  { name: 'webhook-signature', fn: runWebhookSignature },
  { name: 'http-protocol-pairings', fn: walkHttpProtocolPairings },
  { name: 'problem-json-validator', fn: validateProblemJson },
  { name: 'oauth2-flow-validator', fn: runOAuth2FlowValidator },
  { name: 'media-type-iana-validator', fn: runMediaTypeValidator },
  { name: 'json-schema-draft-detector', fn: runJsonSchemaDraftDetector },
  // per-style-coherence is sync + returns CoherenceResult; wrap.
  { name: 'per-style-coherence', fn: async (spec, opts) => runStyleCoherenceChecks(spec, opts).findings },
];

function nowMs(): number {
  const t = process.hrtime.bigint();
  return Number(t / 1000n) / 1000; // ns → ms
}

async function timeIt<T>(label: string, fn: () => Promise<T> | T): Promise<{ label: string; ms: number; result: T }> {
  const t0 = nowMs();
  const result = await fn();
  const ms = nowMs() - t0;
  return { label, ms, result };
}

async function profile(specName: string, opts: { skipSpectral: boolean }): Promise<void> {
  const specPath = path.join(REPO_ROOT, 'openapi-examples', specName, 'spec.json');
  if (!fs.existsSync(specPath)) {
    throw new Error(`Spec not found: ${specPath}`);
  }
  console.log(`[profile] loading ${specName} from ${specPath}`);
  const t0Load = nowMs();
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as object;
  const loadMs = nowMs() - t0Load;

  const schemaCount = (() => {
    const s = spec as { components?: { schemas?: Record<string, unknown> }; paths?: Record<string, unknown> };
    return Object.keys(s.components?.schemas ?? {}).length;
  })();
  const pathCount = (() => {
    const s = spec as { paths?: Record<string, unknown> };
    return Object.keys(s.paths ?? {}).length;
  })();
  console.log(`[profile] load took ${loadMs.toFixed(0)}ms — ${schemaCount} schemas / ${pathCount} paths`);

  const detectorOpts = { specName };

  // ---------- Phase 1: Spectral ----------
  let spectralColdMs = -1;
  let spectralColdFindings = -1;
  let spectralWarmMs = -1;
  if (!opts.skipSpectral) {
    console.log('');
    console.log('[profile] === Phase 1: Spectral runner (cold) ===');
    const spectral = await timeIt('spectral-cold', () => runSpectralLayers(spec, detectorOpts));
    console.log(`[profile] spectral-cold: ${spectral.ms.toFixed(0)}ms (${spectral.result.length} findings)`);
    spectralColdMs = spectral.ms;
    spectralColdFindings = spectral.result.length;

    console.log('[profile] === Phase 1b: Spectral runner (warm — cache reuse check) ===');
    const spectralWarm = await timeIt('spectral-warm', () => runSpectralLayers(spec, detectorOpts));
    console.log(`[profile] spectral-warm: ${spectralWarm.ms.toFixed(0)}ms (${spectralWarm.result.length} findings)`);
    spectralWarmMs = spectralWarm.ms;
  } else {
    console.log('');
    console.log('[profile] === Phase 1: SKIPPED (--no-spectral) ===');
  }

  // ---------- Phase 2: Walkers individually ----------
  console.log('');
  console.log('[profile] === Phase 2: Walkers (each individually) ===');
  const walkerTimes: PhaseTime[] = [];
  for (const w of ALL_WALKERS) {
    try {
      const r = await timeIt(w.name, () => w.fn(spec, detectorOpts));
      walkerTimes.push({ name: w.name, ms: r.ms, findings: r.result.length });
      console.log(`[profile] walker ${w.name}: ${r.ms.toFixed(0)}ms (${r.result.length} findings)`);
    } catch (err) {
      console.warn(`[profile] walker ${w.name} FAILED: ${err instanceof Error ? err.message : String(err)}`);
      walkerTimes.push({ name: w.name, ms: -1, findings: 0 });
    }
  }
  const walkerTotalMs = walkerTimes.filter((w) => w.ms > 0).reduce((sum, w) => sum + w.ms, 0);

  // ---------- Phase 3: Modules individually ----------
  console.log('');
  console.log('[profile] === Phase 3: Modules (each individually) ===');
  const moduleTimes: PhaseTime[] = [];
  for (const m of ALL_MODULES) {
    try {
      const r = await timeIt(m.name, async () => m.fn(spec, detectorOpts));
      moduleTimes.push({ name: m.name, ms: r.ms, findings: r.result.length });
      console.log(`[profile] module ${m.name}: ${r.ms.toFixed(0)}ms (${r.result.length} findings)`);
    } catch (err) {
      console.warn(`[profile] module ${m.name} FAILED: ${err instanceof Error ? err.message : String(err)}`);
      moduleTimes.push({ name: m.name, ms: -1, findings: 0 });
    }
  }
  const moduleTotalMs = moduleTimes.filter((m) => m.ms > 0).reduce((sum, m) => sum + m.ms, 0);

  // ---------- Phase 4: Combined runModules sweep (real path) ----------
  console.log('');
  console.log('[profile] === Phase 4: runModules() combined sweep ===');
  const modulesCombined = await timeIt('runModules', () => runModules(spec, detectorOpts));
  console.log(`[profile] runModules combined: ${modulesCombined.ms.toFixed(0)}ms (${modulesCombined.result.length} findings)`);

  // ---------- Sort + summary ----------
  const sortedWalkers = [...walkerTimes].filter((w) => w.ms > 0).sort((a, b) => b.ms - a.ms);
  const sortedModules = [...moduleTimes].filter((m) => m.ms > 0).sort((a, b) => b.ms - a.ms);

  console.log('');
  console.log('[profile] === SUMMARY ===');
  console.log(`spec=${specName}  schemas=${schemaCount}  paths=${pathCount}`);
  if (spectralColdMs >= 0) {
    console.log(`spectral-cold:    ${spectralColdMs.toFixed(0)}ms (${spectralColdFindings} findings)`);
    console.log(`spectral-warm:    ${spectralWarmMs.toFixed(0)}ms`);
  } else {
    console.log(`spectral:         SKIPPED`);
  }
  console.log(`walkers-total:    ${walkerTotalMs.toFixed(0)}ms (${walkerTimes.reduce((s, w) => s + (w.findings || 0), 0)} findings)`);
  console.log(`modules-total:    ${moduleTotalMs.toFixed(0)}ms`);
  console.log(`runModules combined: ${modulesCombined.ms.toFixed(0)}ms`);
  const grandTotal = (spectralColdMs > 0 ? spectralColdMs : 0) + walkerTotalMs + moduleTotalMs;
  console.log(`GRAND TOTAL (cold): ${grandTotal.toFixed(0)}ms (${(grandTotal / 1000 / 60).toFixed(2)} min)`);
  console.log('');
  console.log('Top-10 walkers:');
  for (const w of sortedWalkers.slice(0, 10)) {
    console.log(`  ${w.ms.toFixed(0).padStart(8)}ms  ${w.name}  (${w.findings})`);
  }
  console.log('Top-10 modules:');
  for (const m of sortedModules.slice(0, 10)) {
    console.log(`  ${m.ms.toFixed(0).padStart(8)}ms  ${m.name}  (${m.findings})`);
  }

  // ---------- Persist ----------
  const out = {
    spec: specName,
    schemaCount,
    pathCount,
    loadMs,
    spectralColdMs,
    spectralColdFindings,
    spectralWarmMs,
    walkerTotalMs,
    walkers: walkerTimes,
    moduleTotalMs,
    modules: moduleTimes,
    runModulesCombinedMs: modulesCombined.ms,
    grandTotalColdMs: grandTotal,
    grandTotalColdMin: grandTotal / 1000 / 60,
    timestamp: new Date().toISOString(),
  };
  const outPath = path.join(REPO_ROOT, 'specs', `E09-w-arch-${specName}-perf-profile.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[profile] saved to ${outPath}`);
}

const args = process.argv.slice(2);
const specName = args.find((a) => !a.startsWith('--')) ?? 'stripe-full';
const skipSpectral = args.includes('--no-spectral');
profile(specName, { skipSpectral }).catch((err) => {
  console.error(err);
  process.exit(1);
});
