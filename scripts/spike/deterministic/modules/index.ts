/**
 * Module-class runner — invokes the 15 standalone Stage-A module-class
 * detectors and aggregates their DetectorFindings. Each module is wrapped in
 * try/catch so a single crashing module doesn't abort the whole layer (same
 * pattern as walkers/index.ts).
 *
 * Public API: runModules(spec, opts) => Promise<DetectorFinding[]>
 *
 * spec-diff.ts is intentionally NOT included — it requires two specs, not one.
 * style-classifier.classifyApiStyle is called transitively via per-style-coherence.
 *
 * Layer-tagging note (resolved by Q3): the module-classes historically self-
 * tagged their findings as `walker-statistical` because the `DetectorLayer`
 * union didn't have a `module-class` entry. Q3 added the `module-class` tag
 * and this runner now post-collection-retags any `walker-statistical` findings
 * coming from the wired modules to `module-class`, so `runDeterministicLayer.
 * perLayer['module-class']` reflects the true module contribution. Individual
 * module source files are intentionally unchanged — retagging happens only at
 * the runModules() boundary.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { runAjvValidator } from '../ajv-validator.js';
import { runCodegenValidation } from '../codegen-validation.js';
import { walkCrossReferenceConsistency } from '../cross-reference-consistency.js';
import { runDuplicateSchemaDetectors } from '../duplicate-schemas.js';
import { runNamingClassifier } from '../naming-classifier.js';
import { walkPathTemplates } from '../path-template-parser.js';
import { runRefGraphAnalysis } from '../ref-graph.js';
import { runSecretScanner } from '../secret-scanner.js';
import { runWebhookSignature } from '../webhook-signature.js';
import { walkHttpProtocolPairings } from '../http-protocol-pairings.js';
import { validateProblemJson } from '../problem-json-validator.js';
import { runOAuth2FlowValidator } from '../oauth2-flow-validator.js';
import { runMediaTypeValidator } from '../media-type-iana-validator.js';
import { runJsonSchemaDraftDetector } from '../json-schema-draft-detector.js';
import { runStyleCoherenceChecks } from '../per-style-coherence.js';

type ModuleFn = (spec: object, opts?: DetectorOptions) => Promise<DetectorFinding[]>;

// Adapter for per-style-coherence: runStyleCoherenceChecks is sync and
// returns CoherenceResult { classification, findings }, not a Promise of
// DetectorFinding[]. Wrap to extract findings + match the runner signature.
const runStyleCoherence: ModuleFn = async (spec, opts) =>
  runStyleCoherenceChecks(spec, opts).findings;

const ALL_MODULES: Array<{ name: string; fn: ModuleFn }> = [
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
  { name: 'per-style-coherence', fn: runStyleCoherence },
];

export async function runModules(
  spec: object,
  opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const all: DetectorFinding[] = [];
  for (const mod of ALL_MODULES) {
    try {
      const findings = await mod.fn(spec, opts);
      for (const f of findings) {
        if (f.layer === 'walker-statistical') f.layer = 'module-class';
      }
      all.push(...findings);
    } catch (err) {
      console.warn(
        `[module] ${mod.name} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return all;
}
