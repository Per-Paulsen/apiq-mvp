/**
 * Welle Arch+ A3 — structured metadata per custom-function.
 *
 * Each function-file exports a `FUNCTION_METADATA: Record<string, FunctionMetadata>`
 * map alongside its callable exports. `spectral-runner.ts` aggregates them
 * into `APIQ_CUSTOM_FUNCTION_METADATA` for introspection, perf-classification,
 * and patternId-cross-validation against `patterns.json`.
 *
 * Contract:
 *   - `name` is the kebab-case YAML-key (must match the APIQ_CUSTOM_FUNCTIONS map key).
 *   - `patternIds` lists the patterns this function implements (1+; bundled
 *     functions cover multiple).
 *   - `lens` is the primary lens — the first entry of the rule's
 *     `apiq-meta.lenses` is canonical. Used for primary-lens-routing.
 *   - `perfClass` is determined by code-inspection of the function-body:
 *       - 'O(1)'   = constant-time (single field-check)
 *       - 'O(n)'   = single iteration with constant work per item
 *       - 'O(n*m)' = cross-list (e.g. compare each rule against each path)
 *       - 'O(n²)'  = pairwise loops (`for i in items: for j in items`)
 *   - `description` is the first sentence of the function's JSDoc OR the
 *     rule's `description` field. Kept ≤120 chars where possible.
 *   - `async` is true only when the function performs network or fs I/O.
 *     All current functions are sync.
 */

/** Closed set of lens-strings. Mirrors `severity-schema.ts` LensSchema enum (10-lens framework). */
export const VALID_LENSES = [
  'threat-modeling',          // Lens 1
  'standards-compliance',     // Lens 2
  'evolution-friction',       // Lens 3 — apiq-DIFF
  'client-friction',          // Lens 4
  'style-coherence',          // Lens 5 — apiq-DIFF
  'privacy-data-class',       // Lens 6
  'operations',               // Lens 7
  'internal-consistency',     // Lens 8
  'ai-agent-consumability',   // Lens 9 — apiq-strategic
  'operational-metadata',     // Lens 10
] as const;

export type FunctionLens = (typeof VALID_LENSES)[number];

/** Closed set of performance classes. */
export const VALID_PERF_CLASSES = ['O(1)', 'O(n)', 'O(n*m)', 'O(n²)'] as const;

export type FunctionPerfClass = (typeof VALID_PERF_CLASSES)[number];

export interface FunctionMetadata {
  /** Kebab-case name as it appears in YAML `function:` keys. Must match the APIQ_CUSTOM_FUNCTIONS map key. */
  name: string;
  /** Pattern-IDs this function implements (1+; bundled functions cover multiple). */
  patternIds: string[];
  /** Primary lens (single string, not array — for primary-lens-routing). */
  lens: FunctionLens;
  /** Performance class. O(1)=constant, O(n)=linear, O(n*m)=cross-list, O(n²)=pairwise. */
  perfClass: FunctionPerfClass;
  /** One-line description for human + LLM consumers. */
  description: string;
  /** Whether the function makes async calls (network, fs). Default false. */
  async?: boolean;
}
