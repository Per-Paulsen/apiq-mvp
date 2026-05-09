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
 * Layer-tagging (resolved by Q3 + robustified by Q7): each ALL_MODULES entry
 * carries an explicit `layer` field (default `'module-class'`). After each
 * module runs, runModules() retags every emitted finding to mod.layer — this
 * means a future module can declare `layer: 'domain-knowledge'` (or any other
 * DetectorLayer) and its findings won't be silently retagged to module-class.
 * The Q3-era post-collection retag-loop ("if walker-statistical → module-class")
 * is replaced by this explicit-layer-per-module pattern. Individual module
 * source files remain unchanged.
 */

import type { DetectorFinding, DetectorLayer, DetectorOptions } from '../infra/types.js';
import { runAjvValidator } from './ajv-validator.js';
import { runCodegenValidation } from './codegen-validation.js';
import { walkCrossReferenceConsistency } from './cross-reference-consistency.js';
import { runDuplicateSchemaDetectors } from './duplicate-schemas.js';
import { runNamingClassifier } from './naming-classifier.js';
import { walkPathTemplates } from './path-template-parser.js';
import { runRefGraphAnalysis } from './ref-graph.js';
import { runSecretScanner } from './secret-scanner.js';
import { runWebhookSignature } from './webhook-signature.js';
import { walkHttpProtocolPairings } from './http-protocol-pairings.js';
import { validateProblemJson } from './problem-json-validator.js';
import { runOAuth2FlowValidator } from './oauth2-flow-validator.js';
import { runMediaTypeValidator } from './media-type-iana-validator.js';
import { runJsonSchemaDraftDetector } from '../classifiers/json-schema-draft-detector.js';
import { runStyleCoherenceChecks } from './per-style-coherence.js';

type ModuleFn = (spec: object, opts?: DetectorOptions) => Promise<DetectorFinding[]>;

interface ModuleEntry {
  name: string;
  fn: ModuleFn;
  /** Layer-tag applied to every finding this module emits. Defaults to
   *  `'module-class'`. Override to `'domain-knowledge'` (or another) when a
   *  future module is conceptually outside the standard module-class layer. */
  layer?: DetectorLayer;
}

// Adapter for per-style-coherence: runStyleCoherenceChecks is sync and
// returns CoherenceResult { classification, findings }, not a Promise of
// DetectorFinding[]. Wrap to extract findings + match the runner signature.
const runStyleCoherence: ModuleFn = async (spec, opts) =>
  runStyleCoherenceChecks(spec, opts).findings;

const ALL_MODULES: ModuleEntry[] = [
  { name: 'ajv-validator', fn: runAjvValidator, layer: 'module-class' },
  { name: 'codegen-validation', fn: runCodegenValidation, layer: 'module-class' },
  { name: 'cross-reference-consistency', fn: walkCrossReferenceConsistency, layer: 'module-class' },
  { name: 'duplicate-schemas', fn: runDuplicateSchemaDetectors, layer: 'module-class' },
  { name: 'naming-classifier', fn: runNamingClassifier, layer: 'module-class' },
  { name: 'path-template-parser', fn: walkPathTemplates, layer: 'module-class' },
  { name: 'ref-graph', fn: runRefGraphAnalysis, layer: 'module-class' },
  { name: 'secret-scanner', fn: runSecretScanner, layer: 'module-class' },
  { name: 'webhook-signature', fn: runWebhookSignature, layer: 'module-class' },
  { name: 'http-protocol-pairings', fn: walkHttpProtocolPairings, layer: 'module-class' },
  { name: 'problem-json-validator', fn: validateProblemJson, layer: 'module-class' },
  { name: 'oauth2-flow-validator', fn: runOAuth2FlowValidator, layer: 'module-class' },
  { name: 'media-type-iana-validator', fn: runMediaTypeValidator, layer: 'module-class' },
  { name: 'json-schema-draft-detector', fn: runJsonSchemaDraftDetector, layer: 'module-class' },
  { name: 'per-style-coherence', fn: runStyleCoherence, layer: 'module-class' },
];

export async function runModules(
  spec: object,
  opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  // Welle Arch+ (OQ-3) — run modules in parallel. The two slowest modules on
  // stripe-full are ajv-validator (~15s) and codegen-validation (~12s); both
  // are bound by their own internal work (AJV schema compilation, openapi-
  // typescript+Redocly), not by JS event-loop. Running serially we paid
  // ~28s wallclock; in parallel we pay ~max(15s, 12s) ≈ 15s. Each module
  // already swallows its own errors via try/catch, so Promise.all on a wrapper
  // can't reject — every module either returns DetectorFinding[] or [].
  const results = await Promise.all(
    ALL_MODULES.map(async (mod): Promise<DetectorFinding[]> => {
      try {
        const findings = await mod.fn(spec, opts);
        const targetLayer: DetectorLayer = mod.layer ?? 'module-class';
        for (const f of findings) {
          f.layer = targetLayer;
        }
        return findings;
      } catch (err) {
        console.warn(
          `[module] ${mod.name} failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return [];
      }
    })
  );
  const all: DetectorFinding[] = [];
  for (const r of results) all.push(...r);
  return all;
}
