import { z } from 'zod';
import { FindingSchema, AffectedEndpointSchema, PatchOpSchema, type Finding } from '../schema.js';

// =============================================================================
// Reference target — structured JSON format (replaces markdown for source-of-truth;
// markdown stays as human-readable companion).
//
// One file per spec at openapi-examples/<spec>/reference/findings.json.
// =============================================================================

/**
 * Classification tags per finding. These are the new fields enabling
 * differentiator-empirics: which findings are lint-flavoured (Spectral-class),
 * which are knowledge-backed-gap (apiq's claimed differentiator), and which
 * are deterministically detectable (Stage 4 Deterministic Layer scope).
 *
 * A single finding can carry multiple tags. F1 (server URL trailing slash) is
 * BOTH lint-flavoured AND deterministically detectable. F21 (parameter-relationship
 * rules) is knowledge-backed-gap but NOT lint-flavoured.
 */
export const FindingClassificationSchema = z.object({
  /**
   * Surface-level / cosmetic / Spectral-default-rule-class. Low impact even
   * if technically grounded. Used to compute "substantive coverage" by
   * dropping these from the reference set.
   */
  isLintFlavoured: z.boolean(),

  /**
   * Knowledge-backed gap: spec is missing something the LLM's training data
   * documents (Stripe public docs, RFCs, OWASP, Microsoft REST guidelines).
   * THE differentiator class for apiq vs. Spectral.
   */
  isKnowledgeBackedGap: z.boolean(),

  /**
   * Deterministically detectable via static spec walk + simple conditions.
   * No LLM required. Stage 4 Deterministic Layer scope. Used to compute
   * "LLM-only coverage" by removing these from the LLM-target set.
   */
  isDeterministicallyDetectable: z.boolean(),

  /**
   * Keywords for embedding-similarity-search (Day-2 scorer). Used to bridge
   * vocabulary-drift between reference-finding-vocabulary and LLM-emitted-vocabulary.
   * Free-form list of phrases the user / authoring-LLM expects to appear in
   * any matching LLM finding.
   */
  narrationKeywords: z.array(z.string()).default([]),

  /**
   * If a finding is best matched against a *cluster* of LLM findings rather
   * than a single LLM finding, name the cluster-key here. E.g. "missing-error-response"
   * for the F6-class (single default response — many ops emit individual variants).
   * Repetition-cluster scorer uses this. Empty = match-as-single-finding.
   */
  expectedClusterKey: z.string().nullable().default(null),
});

export type FindingClassification = z.infer<typeof FindingClassificationSchema>;

/**
 * One reference finding in the structured JSON format. Wraps the same
 * fields as the LLM-output FindingSchema, plus reference-specific
 * id + classification + author-notes.
 */
export const ReferenceFindingSchema = z.object({
  id: z.string().regex(/^F\d+$/, 'id must match /F\\d+/ (F1, F21, …)'),
  title: z.string().min(1).max(300),
  category: z.enum(['clarity', 'design', 'risk', 'correctness']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  scope: z.enum(['spec', 'endpoint']),
  affectedEndpoints: z.array(AffectedEndpointSchema).default([]),
  patchSummary: z.string().min(1).max(500),
  narration: z.string().min(20),
  rationale: z.string().min(10),
  patchOps: z.array(PatchOpSchema).default([]),

  classification: FindingClassificationSchema,

  /** Free-form authoring notes — provenance, hardening history, edge-cases. */
  selfReviewNotes: z.string().nullable().default(null),
});

export type ReferenceFinding = z.infer<typeof ReferenceFindingSchema>;

/**
 * Top-level reference target. One per spec.
 */
export const ReferenceTargetSchema = z.object({
  spec: z.string().min(1),
  specSource: z.string().min(1),
  specCommit: z.string().nullable().default(null),
  specVersion: z.string().nullable().default(null),
  endpointCount: z.number().int().nonnegative(),
  pathCount: z.number().int().nonnegative().nullable().default(null),
  openapiVersion: z.string().nullable().default(null),
  componentSchemaCount: z.number().int().nonnegative().nullable().default(null),
  estimatedInputTokens: z.number().int().nonnegative().nullable().default(null),

  authoringDate: z.string(),
  author: z.string(),

  /** Set when a domain-expert hardens the LLM-authored draft. Null = LLM-only. */
  humanHardenedDate: z.string().nullable().default(null),
  humanHardenedBy: z.string().nullable().default(null),

  /** Free-form provenance / methodology notes (preserved from md header). */
  notes: z.string().default(''),

  findings: z.array(ReferenceFindingSchema).min(1),
});

export type ReferenceTarget = z.infer<typeof ReferenceTargetSchema>;

// =============================================================================
// Scorer interface — pluggable scorers operate on (reference, llmFindings, runMeta)
// and produce a typed result. Different scorers measure different things:
//   - Jaccard:           ref ↔ llm coverage
//   - RepetitionCluster: cluster-size histogram of llm findings
//   - Classification:    deterministic / knowledge / repetition split
// =============================================================================

/**
 * Run-metadata that scorers may consult (cost, latency, model, etc.).
 * Free-form for now — concrete shape will tighten as we use it.
 */
export interface RunMeta {
  spec: string;
  architecture: string;
  perEndpointModel?: string;
  aggregatorModel?: string;
  promptVariant?: string;
  costUSD?: number;
  totalDurationMs?: number;
  startedAt?: string;
  prePass?: string | null;
  postPass?: string | null;
  promptCaching?: boolean;
  /** Optional path the run-output JSON was loaded from (for traceability). */
  sourcePath?: string;
  /** Allow scorers to read other data (e.g. patchValidation block) without typing. */
  [key: string]: unknown;
}

export interface Scorer<TResult> {
  name: string;
  score(input: {
    reference: ReferenceTarget | null;
    llmFindings: Finding[];
    runMeta: RunMeta;
  }): TResult;
}

// Re-export the LLM finding types so scorer modules don't need to reach into
// the parent schema directly.
export type { Finding } from '../schema.js';
