/**
 * Severity-Schema Final (post Mining-Round-2) — TypeScript types + Zod
 * runtime validation for rule-metadata and finding-metadata.
 *
 * Authored 2026-05-06 (Task T23 / #36 — Welle 0 foundation for Wave 2 rule-tasks
 * T16-T21). This file is the single source-of-truth for the rule-metadata
 * schema that ALL Wave-2 rule-tasks (Spectral rules, Walkers, Modules) tag
 * their rules with.
 *
 * Sources:
 *   - `specs/big-spec-architecture-spike-stage-a-meta-insights.md`
 *     (Mining-Round-2 Validation: "Severity-Schema Final" yaml + 10-lens framework
 *     + Stakeholder x Lifecycle x Defect-Class cube + ISO/IEC 25010 secondary axis)
 *   - `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md`
 *     (Mining-Round-2 Master-Konsolidierung: "Severity-Schema (post-Round-2)")
 *   - `specs/big-spec-architecture-spike-stage-a-implementation-priority.md`
 *     (T23 description + priority axis)
 *
 * Backwards-compat discipline:
 *   - This file is purely ADDITIVE. The pre-existing `DetectorFinding.severity`
 *     ('critical' | 'high' | 'medium' | 'low') in `types.ts` is unchanged — that
 *     is the LLM-Finding-equivalent severity used DOWNSTREAM by the Apply / Patch
 *     / Score machinery. The Severity-Schema Final defined here lives at the
 *     RULE-tagging layer (error/warn/hint/info) — distinct concern.
 *   - Existing rules in `apiq-ruleset.yaml` carry only `severity` (warn/hint/error).
 *     `migrateLegacyRule()` lifts those into the full schema with sensible
 *     defaults, so legacy rules continue to work while new rules tag richly.
 */

import { z } from 'zod';

// =============================================================================
// 1. Severity (4-tier — `info` is NEW Round-2)
// =============================================================================

export const SeveritySchema = z.enum(['error', 'warn', 'hint', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

/** Human-readable rationale for each tier — useful for UI tooltips. */
export const SEVERITY_DOCS: Record<Severity, string> = {
  error:
    'Fatal-validity violation OR RFC-2119 MUST violated; CI-blocking.',
  warn: 'RFC-2119 SHOULD violated, OR strong cross-source consensus; review-blocking.',
  hint: 'Soft signal; informative; opinion-divided OR low-confidence-heuristic; off-by-default-overridable.',
  info: 'Positive-marker / observation; not a "finding" per se (e.g. SLA4OAI-presence, capability-discovery endpoint present).',
};

// =============================================================================
// 2. Direction-modifier (NEW Phase C — applies to Lens-3 evolution patterns)
// =============================================================================

export const SeverityDirectionSchema = z.enum(['tighten', 'loosen', 'drift']);
export type SeverityDirection = z.infer<typeof SeverityDirectionSchema>;

export const SEVERITY_DIRECTION_DOCS: Record<SeverityDirection, string> = {
  tighten:
    'Server adds constraint later; absence-today permits future tightening (future breaking-risk).',
  loosen:
    'Server removes/expands later; presence-today implies future-removal-or-expansion-breaking.',
  drift: 'Internal contradiction; future-fix is breaking.',
};

// =============================================================================
// 3. Lens-tags (multi-lens — 10-lens framework, NEW Round-2)
// =============================================================================

export const LensSchema = z.enum([
  'threat-modeling', // Lens 1
  'standards-compliance', // Lens 2
  'evolution-friction', // Lens 3 — apiq-DIFF
  'client-friction', // Lens 4
  'style-coherence', // Lens 5 — apiq-DIFF
  'privacy-data-class', // Lens 6 — NEW Round-2
  'operations', // Lens 7 — NEW Round-2
  'internal-consistency', // Lens 8 — NEW Round-2
  'ai-agent-consumability', // Lens 9 — NEW Round-2 (apiq-strategic)
  'operational-metadata', // Lens 10 — NEW Round-2
]);
export type Lens = z.infer<typeof LensSchema>;

/**
 * Patterns can have multiple lenses (heavy overlap confirmed in Round-2:
 * ~30 of 54 TM-A* are cross-Lens; ~60% of EV-* are cross-Lens; almost all
 * SC-* are cross-Lens with Lens-4). At least 1 lens is required.
 */
export const LensesSchema = z.array(LensSchema).min(1);

/** Stable numeric-ID lookup for legacy/exchange formats (1..10). */
export const LENS_TO_NUMBER: Record<Lens, number> = {
  'threat-modeling': 1,
  'standards-compliance': 2,
  'evolution-friction': 3,
  'client-friction': 4,
  'style-coherence': 5,
  'privacy-data-class': 6,
  operations: 7,
  'internal-consistency': 8,
  'ai-agent-consumability': 9,
  'operational-metadata': 10,
};

// =============================================================================
// 4. Source-distinction (NEW Phase B)
// =============================================================================

/**
 * ISO-8601 date string (YYYY-MM-DD). Used for `verifiedAt` audit-trail on
 * RuleSource entries (Welle F).
 */
const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'verifiedAt must be ISO-8601 YYYY-MM-DD');

/**
 * Verbatim quote (≤200 chars) from the cited source. Welle F adds this so
 * `findings` can surface the exact RFC / BCP / ISO / IANA / vendor / mining
 * text that backs a rule, not just a citation pointer.
 */
const VerbatimSchema = z
  .string()
  .max(200, 'verbatim must be ≤200 chars (exact quote, not paraphrase)');

export const RuleSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rfc'),
    number: z.number().int().positive(),
    section: z.string().optional(),
    verbatim: VerbatimSchema.optional(),
    verifiedAt: IsoDateSchema.optional(),
  }),
  z.object({
    type: z.literal('bcp'),
    number: z.number().int().positive(),
    rfc: z.number().int().positive().optional(),
    verbatim: VerbatimSchema.optional(),
    verifiedAt: IsoDateSchema.optional(),
  }),
  z.object({
    type: z.literal('iso'),
    standard: z.literal('25010'),
    characteristic: z.string().min(1),
    verbatim: VerbatimSchema.optional(),
    verifiedAt: IsoDateSchema.optional(),
  }),
  z.object({
    type: z.literal('iana-registry'),
    registry: z.string().min(1),
    verbatim: VerbatimSchema.optional(),
    verifiedAt: IsoDateSchema.optional(),
  }),
  z.object({
    type: z.literal('vendor'),
    name: z.string().min(1),
    verbatim: VerbatimSchema.optional(),
    verifiedAt: IsoDateSchema.optional(),
  }),
  z.object({
    type: z.literal('mining'),
    phase: z.enum(['round1', 'round2']),
    subagent: z.string().min(1),
    verbatim: VerbatimSchema.optional(),
    verifiedAt: IsoDateSchema.optional(),
  }),
]);
export type RuleSource = z.infer<typeof RuleSourceSchema>;

/** Sources field — at least one source is required to back a rule. */
export const RuleSourcesSchema = z.array(RuleSourceSchema).min(1);

// =============================================================================
// 5. Codegen-targets (NEW Phase D — Lens-4 patterns may target specific langs)
// =============================================================================

export const CodegenTargetSchema = z.enum([
  '*',
  'java',
  'go',
  'python',
  'typescript',
  'rust',
  'csharp',
  'kotlin',
  'php',
  'ruby',
]);
export type CodegenTarget = z.infer<typeof CodegenTargetSchema>;

/** Default '*' (applies to all). */
export const DEFAULT_CODEGEN_TARGETS: readonly CodegenTarget[] = ['*'] as const;

// =============================================================================
// 6. Stakeholder x Lifecycle x Defect-Class (Phase F meta-axes)
// =============================================================================

export const StakeholderSchema = z.enum([
  'spec-author',
  'client-dev',
  'end-user',
  'operations',
  'security',
  'codegen-tool',
  'docs-tool',
  'self',
  'ai-agent', // NEW Welle F (Lens-9 USP — strategic-vision coupling)
]);
export type Stakeholder = z.infer<typeof StakeholderSchema>;

export const LifecyclePhaseSchema = z.enum([
  'authoring-time', // NEW Welle F (spec being written/edited)
  'build-time',
  'test-time',
  'validation-time', // NEW Welle F (CI lint/contract-test phase)
  'deploy-time',
  'runtime-happy',
  'runtime-edge',
  'runtime-at-scale', // RENAMED from 'runtime-scale' (Welle F naming consistency)
  'evolution-time',
  'documentation-time',
]);
export type LifecyclePhase = z.infer<typeof LifecyclePhaseSchema>;

export const DefectClassSchema = z.enum([
  'syntax',
  'semantic',
  'norm',
  'ergonomic', // RENAMED from 'ergonomics' (Welle F — singular adjective form)
  'incomplete', // RENAMED from 'incompleteness' (Welle F — singular adjective form)
  'over-specification',
  'privacy-leakage', // NEW Welle F (Lens-6 dedicated class)
  'operational-metadata-missing', // NEW Welle F (Lens-10 dedicated class)
]);
export type DefectClass = z.infer<typeof DefectClassSchema>;

// =============================================================================
// 7. ISO/IEC 25010 quality-characteristic (Phase F secondary axis)
// =============================================================================

export const IsoIec25010Schema = z.enum([
  'functional-suitability',
  'performance-efficiency',
  'compatibility',
  'usability',
  'reliability',
  'security',
  'maintainability',
  'portability',
]);
export type IsoIec25010 = z.infer<typeof IsoIec25010Schema>;

// =============================================================================
// 8. Priority (from implementation-priority.md)
// =============================================================================

export const PrioritySchema = z.enum(['P1', 'P2', 'P3', 'P4', 'P5']);
export type Priority = z.infer<typeof PrioritySchema>;

export const PRIORITY_DOCS: Record<Priority, string> = {
  P1: 'Konkurrenz-Pari-Pflicht (mature linters catch + reputation-load-bearing).',
  P2: 'Differentiator-Patterns (apiq-USP).',
  P3: 'Defense-in-Depth + Nice-to-Have.',
  P4: 'Niche / Low-Frequency.',
  P5: 'Vendor-Extension / Information-only.',
};

// =============================================================================
// 8b. Cost / MTTR / Agent-Readiness impact (NEW Welle F — F10 + F-NEU)
// =============================================================================

export const ImpactLevelSchema = z.enum(['low', 'medium', 'high']);
export type ImpactLevel = z.infer<typeof ImpactLevelSchema>;

export const COST_IMPACT_DOCS: Record<ImpactLevel, string> = {
  low: 'Trivial fix (add field, add description, fix typo) — minutes per occurrence.',
  medium:
    'Moderate fix (add header support, add error-shape, add pagination) — hours per occurrence.',
  high: 'Significant rework (restructure schema, add auth-flow, refactor versioning) — days per occurrence.',
};

export const MTTR_IMPACT_DOCS: Record<ImpactLevel, string> = {
  low: 'Developer-experience only, no prod-impact.',
  medium: 'Client-integration-quality, hours-MTTR.',
  high: 'Security/correctness, days-MTTR (data-loss/security-incident risk).',
};

export const AgentReadinessImpactSchema = z.enum([
  'high',
  'medium',
  'low',
  'none',
]);
export type AgentReadinessImpact = z.infer<typeof AgentReadinessImpactSchema>;

export const AGENT_READINESS_IMPACT_DOCS: Record<AgentReadinessImpact, string> =
  {
    high: 'Finding directly causes agent tool-call-failure (ambiguous-name, unclear-description, missing-required-field).',
    medium:
      'Finding causes agent retry-loop or error-recovery-difficulty.',
    low: 'Finding affects agent-quality but not blocking.',
    none: 'Finding is human-developer-only.',
  };

export const DetectionPrecisionSchema = z.enum(['high', 'medium', 'low']);
export type DetectionPrecision = z.infer<typeof DetectionPrecisionSchema>;

// =============================================================================
// 9. Combined RuleMetadata
// =============================================================================

export const RuleMetadataSchema = z.object({
  /** 4-tier severity (error/warn/hint/info). */
  severity: SeveritySchema,

  /** Direction-modifier — optional, for evolution-friction (Lens-3) patterns. */
  direction: SeverityDirectionSchema.optional(),

  /** 1+ lenses; many patterns are multi-lens. */
  lenses: LensesSchema,

  /** 1+ sources backing this rule. */
  sources: RuleSourcesSchema,

  /** Default ['*'] (applies to all codegen targets). */
  codegenTargets: z
    .array(CodegenTargetSchema)
    .min(1)
    .default(['*' as const]),

  /** Output-grouping axis: who is affected. 1+ stakeholders. */
  stakeholders: z.array(StakeholderSchema).min(1),

  /** Where in the lifecycle this defect manifests. */
  lifecyclePhase: LifecyclePhaseSchema,

  /** What kind of defect. */
  defectClass: DefectClassSchema,

  /**
   * ISO/IEC 25010 quality-characteristics — array of 1+ characteristics
   * (Welle F: migrated from single-value to array, since rules often span
   * multiple quality-characteristics, e.g. security + reliability).
   */
  iso25010: z.array(IsoIec25010Schema).min(1),

  /** P1..P5 from implementation-priority.md. Optional. */
  priority: PrioritySchema.optional(),

  /** Origin tag — e.g. 'TM-A50', 'RFC2-5', 'CL-1'. Optional but recommended. */
  patternId: z.string().min(1).optional(),

  // -------------------------------------------------------------------------
  // Welle F additions (F1, F9, F10, F-NEU)
  // -------------------------------------------------------------------------

  /**
   * F1 — Whether `apiq fix` can apply this rule's auto-fix without human
   * review. Conservative default `false` — rules must opt-in after a fix
   * implementation has been validated.
   */
  autoFixSafe: z.boolean().optional().default(false),

  /**
   * F1 — Detector confidence in the finding. `high` = false-positives are
   * rare; `medium` = some false-positives expected; `low` = heuristic, often
   * needs human disambiguation. Conservative default `medium`.
   */
  detectionPrecision: DetectionPrecisionSchema.optional().default('medium'),

  /**
   * F9 — Regulatory / control-framework mapping. Each axis is an array of
   * control-IDs that the rule helps enforce. All axes optional.
   */
  regulatoryMapping: z
    .object({
      /** NIST CSF 2.0 control IDs — e.g. ['PR.DS-2', 'GV.OC-01']. */
      nist: z.array(z.string().min(1)).optional(),
      /** OWASP ASVS 5.0 verification-IDs — e.g. ['V9.1.1']. */
      asvs: z.array(z.string().min(1)).optional(),
      /** CIS Controls 8.1 IDs — e.g. ['CIS-3.10']. */
      cis: z.array(z.string().min(1)).optional(),
      /** GDPR Article references — e.g. ['Art-5', 'Art-32']. */
      gdpr: z.array(z.string().min(1)).optional(),
      /** SOC 2 Trust Services Criteria — e.g. ['CC6.1', 'CC7.2']. */
      soc2: z.array(z.string().min(1)).optional(),
    })
    .optional(),

  /**
   * F10 — Cost-of-fix per occurrence. Conservative default `medium`.
   * See `COST_IMPACT_DOCS` for tier semantics.
   */
  costImpact: ImpactLevelSchema.optional().default('medium'),

  /**
   * F10 — Mean-Time-To-Recovery if fired in production (i.e. the cost of
   * NOT fixing). Conservative default `medium`.
   * See `MTTR_IMPACT_DOCS` for tier semantics.
   */
  mttrImpact: ImpactLevelSchema.optional().default('medium'),

  /**
   * F-NEU — Strategic-vision coupling: how badly does this finding hurt
   * agent tool-call success? Conservative default `none` (most rules are
   * developer-only). See `AGENT_READINESS_IMPACT_DOCS` for tier semantics.
   */
  agentReadinessImpact: AgentReadinessImpactSchema.optional().default('none'),
});
/**
 * Public type for rule-metadata. We use the OUTPUT type of the Zod schema
 * (`z.output<...>`) so that fields with `.default(...)` show up as required
 * after parsing — callers reading parsed metadata should not need to handle
 * `undefined` for `codegenTargets`.
 */
export type RuleMetadata = z.output<typeof RuleMetadataSchema>;

/** Input type — what users pass IN. `codegenTargets` is optional here. */
export type RuleMetadataInput = z.input<typeof RuleMetadataSchema>;

// =============================================================================
// 10. FindingMetadata — extends RuleMetadata with finding-time data
// =============================================================================

/** A JSON-Pointer-style location in the spec where a finding was emitted. */
export const FindingLocationSchema = z.object({
  /** JSON-Pointer-style path, e.g. '/paths/~1v1~1charges/post'. */
  jsonPointer: z.string().min(1),
  /** Optional: line number in the original YAML/JSON source for editor-jump. */
  line: z.number().int().nonnegative().optional(),
  /** Optional: column number in the original YAML/JSON source. */
  column: z.number().int().nonnegative().optional(),
});
export type FindingLocation = z.infer<typeof FindingLocationSchema>;

export const FindingMetadataSchema = RuleMetadataSchema.extend({
  /** Stable detector-id, e.g. 'spectral:apiq:fk-fields-need-format-or-pattern'. */
  detectorId: z.string().min(1),
  /** Where in the spec this specific finding was emitted (1+ locations). */
  locations: z.array(FindingLocationSchema).min(1),
  /**
   * Aggregation count — for findings that represent N occurrences of the same
   * pattern. E.g. '47 endpoints lack rate-limit headers' -> count: 47.
   * Default 1 = single occurrence.
   */
  count: z.number().int().positive().default(1),
  /** Optional: human-readable message rendered into the UI/export. */
  message: z.string().optional(),
});
export type FindingMetadata = z.output<typeof FindingMetadataSchema>;
export type FindingMetadataInput = z.input<typeof FindingMetadataSchema>;

// =============================================================================
// 11. Helpers
// =============================================================================

/**
 * Validate an unknown blob as RuleMetadata. Throws ZodError on invalid shape.
 * Use this at rule-registration boundaries (e.g. when loading
 * `apiq-ruleset.yaml` or registering a Walker rule).
 */
export function validateMetadata(input: unknown): RuleMetadata {
  return RuleMetadataSchema.parse(input);
}

/** Non-throwing variant — returns a Zod safeParse result. */
export function safeValidateMetadata(
  input: unknown
): z.ZodSafeParseResult<RuleMetadata> {
  return RuleMetadataSchema.safeParse(input);
}

/** Same for FindingMetadata. */
export function validateFindingMetadata(input: unknown): FindingMetadata {
  return FindingMetadataSchema.parse(input);
}

export function safeValidateFindingMetadata(
  input: unknown
): z.ZodSafeParseResult<FindingMetadata> {
  return FindingMetadataSchema.safeParse(input);
}

/**
 * Tag a finding-instance with rule-metadata + the specific location/data.
 * Convenience constructor: spread RuleMetadata over finding-time fields.
 *
 * @example
 *   const meta: RuleMetadata = { severity: 'error', lenses: ['threat-modeling'], ... };
 *   const finding = tagFinding(meta, {
 *     detectorId: 'spectral:apiq:y-2',
 *     locations: [{ jsonPointer: '/paths/~1v1~1users/get/parameters/0' }],
 *     count: 3,
 *     message: 'API key in URL',
 *   });
 */
export function tagFinding(
  metadata: RuleMetadata,
  findingData: {
    detectorId: string;
    locations: FindingLocation[];
    count?: number;
    message?: string;
  }
): FindingMetadata {
  return FindingMetadataSchema.parse({
    ...metadata,
    detectorId: findingData.detectorId,
    locations: findingData.locations,
    count: findingData.count ?? 1,
    message: findingData.message,
  });
}

// =============================================================================
// 12. Legacy migration (severity-only -> full RuleMetadata)
// =============================================================================

/**
 * Shape of legacy rule-metadata that exists in `apiq-ruleset.yaml` and the
 * walker layer pre-Round-2: only carries `severity` (`error` | `warn` | `hint`)
 * plus optional documentation fields. `migrateLegacyRule()` lifts these into
 * the full `RuleMetadata` shape with sensible defaults.
 */
export interface LegacySeverityOnly {
  severity: 'error' | 'warn' | 'hint';
  /** Optional pre-existing pattern-id. */
  patternId?: string;
  /** Optional human description (carried through, not validated). */
  description?: string;
}

/**
 * Migrate a legacy severity-only rule into the post-Round-2 `RuleMetadata`
 * shape. Defaults are intentionally conservative:
 *
 *   - `lenses`: `['standards-compliance']` — a generic catch-all; rule-authors
 *     should override per-rule when migrating in earnest.
 *   - `sources`: `[{ type: 'mining', phase: 'round1', subagent: 'legacy' }]`
 *     — preserves provenance signal that the rule predates Round-2.
 *   - `codegenTargets`: `['*']`.
 *   - `stakeholders`: `['spec-author']` — every spec-level rule is at minimum
 *     a spec-author concern.
 *   - `lifecyclePhase`: `'build-time'` — most legacy spectral rules fire at
 *     build/lint time.
 *   - `defectClass`: `'norm'` — RFC-style normative violation fits the
 *     Round-1 spectral-default tier.
 *   - `iso25010`: `['maintainability']` — generic mappable default.
 *
 * Optionally accept partial overrides so callers who know more can supply it
 * inline.
 *
 * @example
 *   migrateLegacyRule({ severity: 'warn', patternId: 'apiq-fk-fields' })
 *   // -> full RuleMetadata with conservative defaults filled in
 *
 *   migrateLegacyRule(
 *     { severity: 'warn' },
 *     { lenses: ['client-friction'], iso25010: ['usability'] }
 *   )
 */
export function migrateLegacyRule(
  legacy: LegacySeverityOnly,
  overrides: Partial<RuleMetadataInput> = {}
): RuleMetadata {
  const candidate: RuleMetadataInput = {
    severity: legacy.severity,
    lenses: ['standards-compliance'],
    sources: [{ type: 'mining', phase: 'round1', subagent: 'legacy' }],
    codegenTargets: ['*'],
    stakeholders: ['spec-author'],
    lifecyclePhase: 'build-time',
    defectClass: 'norm',
    iso25010: ['maintainability'], // Welle F — migrated to array
    // Welle F — conservative defaults for new fields:
    costImpact: 'medium',
    mttrImpact: 'medium',
    agentReadinessImpact: 'none',
    detectionPrecision: 'medium',
    autoFixSafe: false,
    ...(legacy.patternId ? { patternId: legacy.patternId } : {}),
    ...overrides,
  };
  return RuleMetadataSchema.parse(candidate);
}

// =============================================================================
// 13. Compile-time exhaustiveness assertions (developer-aid)
// =============================================================================

/**
 * Compile-time check that every Lens has a numeric ID in `LENS_TO_NUMBER`.
 * If a lens is added to the enum but not to the map, the assignment below
 * fails at `tsc --noEmit`.
 */
const _LENS_TO_NUMBER_EXHAUSTIVE: Record<Lens, number> = LENS_TO_NUMBER;
void _LENS_TO_NUMBER_EXHAUSTIVE;

/**
 * Compile-time check that every Severity has a doc-string.
 */
const _SEVERITY_DOCS_EXHAUSTIVE: Record<Severity, string> = SEVERITY_DOCS;
void _SEVERITY_DOCS_EXHAUSTIVE;

/**
 * Compile-time check that every SeverityDirection has a doc-string.
 */
const _SEVERITY_DIRECTION_DOCS_EXHAUSTIVE: Record<SeverityDirection, string> =
  SEVERITY_DIRECTION_DOCS;
void _SEVERITY_DIRECTION_DOCS_EXHAUSTIVE;

/**
 * Welle F — compile-time exhaustiveness for new docs Records.
 */
const _COST_IMPACT_DOCS_EXHAUSTIVE: Record<ImpactLevel, string> =
  COST_IMPACT_DOCS;
void _COST_IMPACT_DOCS_EXHAUSTIVE;

const _MTTR_IMPACT_DOCS_EXHAUSTIVE: Record<ImpactLevel, string> =
  MTTR_IMPACT_DOCS;
void _MTTR_IMPACT_DOCS_EXHAUSTIVE;

const _AGENT_READINESS_IMPACT_DOCS_EXHAUSTIVE: Record<
  AgentReadinessImpact,
  string
> = AGENT_READINESS_IMPACT_DOCS;
void _AGENT_READINESS_IMPACT_DOCS_EXHAUSTIVE;
