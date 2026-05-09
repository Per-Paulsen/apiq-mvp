/**
 * Pattern-Schema (Welle Arch+ A2a) — Zod runtime validation for entries in
 * `scripts/spike/data/patterns.json` (959 entries as of 2026-05-09).
 *
 * Closed-set enums are derived from the actual values present in patterns.json
 * (not the team-lead suggestion list, which used label-aliases). The lens-set
 * matches `LensSchema` in `severity-schema.ts` exactly so a pattern's `lens`
 * array can flow into a rule's `apiq-meta.lenses` field without translation.
 *
 * Source-types are NOT closed (vs `RuleSourceSchema` in severity-schema.ts):
 * patterns.json `source.type` values include mining-flavoured tags (`book`,
 * `paper`, `postmortem`, `corpus`, `conference-talk`, `linter`, `vendor-blog`,
 * `style-guide`, `re-audit`, `apiq-original`, `spectral-default`, `owasp`,
 * `rfc-draft`, `rfc`) that don't map cleanly to the 6-way discriminated-union.
 * We validate `source` as `{ type: string, ... }` with passthrough — strict
 * schema-shape lives at the rule-level (severity-schema.ts), pattern-level
 * stays loose to track mining-provenance faithfully.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { LensSchema } from '../deterministic/infra/severity-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// 1. Closed-set enums (derived from actual patterns.json values 2026-05-09)
// =============================================================================

/**
 * Lens values present in patterns.json — identical to `LensSchema` in
 * severity-schema.ts (10-lens framework). Re-exported as alias so callers
 * have one obvious import-site.
 */
export const PatternLensSchema = LensSchema;

export const SEVERITY_HYPOTHESIS_VALUES = [
  'error',
  'warn',
  'hint',
  'info',
] as const;
export const PatternSeverityHypothesisSchema = z.enum(
  SEVERITY_HYPOTHESIS_VALUES,
);

export const DETECTION_PRECISION_VALUES = ['high', 'medium', 'low'] as const;
export const PatternDetectionPrecisionSchema = z.enum(
  DETECTION_PRECISION_VALUES,
);

export const CODEGEN_TARGET_VALUES = [
  '*',
  'typescript',
  'python',
  'java',
  'go',
  'rust',
  'csharp',
  'kotlin',
  'ruby',
  'php',
  'swift',
] as const;
export const PatternCodegenTargetSchema = z.enum(CODEGEN_TARGET_VALUES);

export const PATTERN_DIRECTION_VALUES = ['tighten', 'loosen', 'drift'] as const;
export const PatternDirectionSchema = z.enum(PATTERN_DIRECTION_VALUES);

// =============================================================================
// 2. Source — loose passthrough (mining-flavoured tags, see header)
// =============================================================================

export const PatternSourceSchema = z
  .object({
    type: z.string().min(1),
    citation: z.string().optional(),
    url: z.string().optional(),
    verbatim: z.string().optional(),
  })
  .passthrough();

// =============================================================================
// 3. Pattern (single-entry shape from patterns.json)
// =============================================================================

export const PatternSchema = z
  .object({
    /** Stable pattern identifier — e.g. 'A1', 'TM-A50', 'RFC2-94', 'Y-2'. */
    patternId: z.string().min(1),
    /** Lens-membership (1+; many patterns are multi-lens). */
    lens: z.array(PatternLensSchema).min(1),
    /** Provenance: where the pattern was mined from. */
    source: PatternSourceSchema,
    /** Recommended severity if this pattern is implemented as a rule. */
    severityHypothesis: PatternSeverityHypothesisSchema,
    /** Codegen-language scope; default ['*'] applies to all targets. */
    codegenTargets: z.array(PatternCodegenTargetSchema).optional(),
    /** Human-readable summary. */
    description: z.string().optional(),
    /** Detector confidence tier (high = few false-positives). */
    detectionPrecision: PatternDetectionPrecisionSchema.optional(),
    /** True if a pure-Spectral rule can detect this without custom-function. */
    isPureSpectralDetectable: z.boolean().optional(),
    /** True if implementation lives in Stage-A (deterministic layer). */
    isStageATerritory: z.boolean().optional(),
    /** Mining round (1..4). */
    round: z.number().optional(),
    /** Direction-modifier — Lens-3 (evolution-friction) patterns only. */
    direction: PatternDirectionSchema.optional(),
  })
  .passthrough(); // tolerate extra fields for forward-compat

export type Pattern = z.infer<typeof PatternSchema>;

// =============================================================================
// 4. Loader — validates every entry; throws on first invalid with full context
// =============================================================================

/** Default repo-relative path to patterns.json. */
export const DEFAULT_PATTERNS_PATH = path.join(
  __dirname,
  'patterns.json',
);

export interface LoadPatternsOptions {
  /** Override patterns.json path (defaults to repo-relative location). */
  jsonPath?: string;
}

/**
 * Load + validate every entry in patterns.json. Throws a descriptive Error on
 * the first invalid entry. Returns the parsed array on success.
 *
 * Use this at any callsite that consumes patterns.json — guards against schema
 * drift between mining-runs and downstream consumers.
 */
export function loadPatterns(options: LoadPatternsOptions = {}): Pattern[] {
  const jsonPath = options.jsonPath ?? DEFAULT_PATTERNS_PATH;
  const raw = fs.readFileSync(jsonPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[pattern-schema] failed to JSON.parse ${jsonPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `[pattern-schema] expected ${jsonPath} to be an array, got ${typeof parsed}`,
    );
  }
  const out: Pattern[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    const result = PatternSchema.safeParse(entry);
    if (!result.success) {
      const ctx =
        entry && typeof entry === 'object' && 'patternId' in entry
          ? `patternId="${(entry as { patternId: unknown }).patternId}"`
          : `index=${i}`;
      throw new Error(
        `[pattern-schema] invalid entry at ${ctx}: ${result.error.issues
          .map(iss => `${iss.path.join('.')}: ${iss.message}`)
          .join('; ')}`,
      );
    }
    out.push(result.data);
  }
  return out;
}

/**
 * Non-throwing loader variant. Returns either the parsed array or a list of
 * per-entry errors. Useful for diagnostic CLIs where one bad entry shouldn't
 * mask the others.
 */
export function safeLoadPatterns(
  options: LoadPatternsOptions = {},
):
  | { success: true; patterns: Pattern[] }
  | { success: false; errors: string[] } {
  const jsonPath = options.jsonPath ?? DEFAULT_PATTERNS_PATH;
  const raw = fs.readFileSync(jsonPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      success: false,
      errors: [
        `JSON.parse failed for ${jsonPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ],
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      success: false,
      errors: [`expected an array, got ${typeof parsed}`],
    };
  }
  const errors: string[] = [];
  const out: Pattern[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    const result = PatternSchema.safeParse(entry);
    if (!result.success) {
      const ctx =
        entry && typeof entry === 'object' && 'patternId' in entry
          ? `patternId="${(entry as { patternId: unknown }).patternId}"`
          : `index=${i}`;
      errors.push(
        `${ctx}: ${result.error.issues
          .map(iss => `${iss.path.join('.')}: ${iss.message}`)
          .join('; ')}`,
      );
    } else {
      out.push(result.data);
    }
  }
  if (errors.length > 0) return { success: false, errors };
  return { success: true, patterns: out };
}
