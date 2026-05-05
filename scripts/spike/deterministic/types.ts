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
