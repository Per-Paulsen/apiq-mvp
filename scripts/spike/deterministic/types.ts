/**
 * Deterministic-Layer types — shared across spectral-runner, walkers, and
 * domain-knowledge layers.
 *
 * Each detector emits findings in a shape that can be normalised into the
 * Finding-Schema used by the LLM pipeline (`scripts/spike/schema.ts`). This
 * way the deterministic-layer findings flow through the same downstream
 * Apply / Patch / Score machinery as LLM findings.
 */

import type { Finding } from '../schema.js';

/**
 * Provenance tag — which detector layer produced this finding.
 * Carried in the finding's `narration` prefix so it survives serialization
 * but is filterable for telemetry.
 */
export type DetectorLayer =
  | 'spectral-oas3-default'   // Spectral built-in OAS3 rules
  | 'spectral-apiq-custom'     // our custom Spectral ruleset
  | 'walker-statistical'       // cross-cutting statistical walkers
  | 'module-class'             // standalone module-class detectors (W2)
  | 'domain-knowledge';        // per-API-family pattern libraries

/**
 * Detector emits intermediate "candidate findings" that are then mapped to
 * the canonical Finding-Schema by `output-mapper.ts`. The intermediate shape
 * keeps detector-specific metadata (rule-id, severity-from-spectral,
 * source-location) that isn't part of the LLM-facing schema.
 */
export interface DetectorFinding {
  /** Stable detector-id, e.g. "spectral:oas3-default:operation-tags" or
   *  "walker:html-prevalence" or "domain:stripe:idempotency-key". */
  detectorId: string;
  layer: DetectorLayer;

  /** What we'd produce when emitted as an LLM-equivalent finding. */
  title: string;
  narration: string;
  rationale: string;
  category: 'clarity' | 'design' | 'risk' | 'correctness';
  severity: 'critical' | 'high' | 'medium' | 'low';
  scope: 'spec' | 'endpoint';
  affectedEndpoints: Array<{ path: string; method: string }>;
  patchOps: Array<Record<string, unknown>>;
  patchSummary: string;

  /** JSON-Pointer-style path into the spec where this finding originates,
   *  e.g. "/paths/~1v1~1charges/post". Helps debugging + clustering. */
  sourcePath?: string;

  /** Free-form extra debugging metadata; not serialized into Finding-Schema. */
  meta?: Record<string, unknown>;
}

/**
 * Detector function signature. Receives the parsed (already-dereferenced)
 * spec object, returns a list of candidate findings.
 *
 * The Spectral-runner converts Spectral-results into this same shape so the
 * downstream pipeline doesn't need to special-case Spectral.
 */
export type Detector = (spec: object, options?: DetectorOptions) => Promise<DetectorFinding[]> | DetectorFinding[];

export interface DetectorOptions {
  /** Spec name (e.g. "stripe-full") — domain-knowledge layer uses this to
   *  decide which pattern-library to apply. */
  specName?: string;
  /** Hint to runners that may run differently in CI vs. interactive use. */
  verbose?: boolean;
  /** When true (default), the output-mapper aggregates per-occurrence
   *  `codegen:*` DetectorFindings down to one row per `detectorId` so the
   *  Phase-B token-budget stays bounded on huge specs (github-rest emits
   *  ~9.8k codegen-validation occurrences pre-aggregation). Set to `false`
   *  for tests/debugging that need raw per-occurrence findings. */
  aggregateCodegen?: boolean;
}

/**
 * Result of running the full deterministic layer (= all detectors).
 */
export interface DeterministicLayerResult {
  /** All findings, in canonical Finding-Schema shape (LLM-equivalent). */
  findings: Finding[];
  /** Per-layer breakdown for telemetry / cost-attribution. */
  perLayer: Record<DetectorLayer, number>;
  /** Per-detector counts (detectorId → count). */
  perDetector: Record<string, number>;
  /** Total runtime in ms. */
  durationMs: number;
}

// =============================================================================
// Re-exports from severity-schema.ts (Round-2 rule-metadata schema)
//
// New rule-tagging schema introduced by Task T23 (Welle 0). Re-exported here
// so existing imports from `./types.js` keep working while new rule code can
// also pull richer metadata types from the same module.
//
// `RuleMetadata.severity` (error/warn/hint/info) is at the RULE-tagging layer
// and is INTENTIONALLY DISTINCT from `DetectorFinding.severity` above
// (critical/high/medium/low) which lives at the LLM-Finding-equivalent layer.
// See `severity-schema.ts` header for full rationale.
// =============================================================================
export {
  // Severity (4-tier)
  SeveritySchema,
  SEVERITY_DOCS,
  // Direction-modifier
  SeverityDirectionSchema,
  SEVERITY_DIRECTION_DOCS,
  // Lens (10-lens framework)
  LensSchema,
  LensesSchema,
  LENS_TO_NUMBER,
  // Source
  RuleSourceSchema,
  RuleSourcesSchema,
  // Codegen targets
  CodegenTargetSchema,
  DEFAULT_CODEGEN_TARGETS,
  // Stakeholder x Lifecycle x Defect-Class meta-axes
  StakeholderSchema,
  LifecyclePhaseSchema,
  DefectClassSchema,
  // ISO/IEC 25010
  IsoIec25010Schema,
  // Priority
  PrioritySchema,
  PRIORITY_DOCS,
  // Combined
  RuleMetadataSchema,
  FindingMetadataSchema,
  FindingLocationSchema,
  // Helpers
  validateMetadata,
  safeValidateMetadata,
  validateFindingMetadata,
  safeValidateFindingMetadata,
  tagFinding,
  // Legacy migration
  migrateLegacyRule,
} from './severity-schema.js';

export type {
  Severity,
  SeverityDirection,
  Lens,
  RuleSource,
  CodegenTarget,
  Stakeholder,
  LifecyclePhase,
  DefectClass,
  IsoIec25010,
  Priority,
  RuleMetadata,
  RuleMetadataInput,
  FindingMetadata,
  FindingMetadataInput,
  FindingLocation,
  LegacySeverityOnly,
} from './severity-schema.js';
