/**
 * Canonical parser for `Spec.analysisError` strings.
 *
 * Owned by Epic 08 (polish), consumed by:
 *   - Epic 05's failed-card on the Spec Detail screen (renders `headline`
 *     + collapsible `details`).
 *   - Epic 08's Spec-Detail budget-toast hook (uses `budgetShape` to
 *     emit a once-per-session quota toast).
 *
 * Per cross-epic Q6 (2026-05-02): single source of truth, no inline
 * parsing duplication across consumers.
 *
 * Rules apply in order; first match wins:
 *   1. Daily-LLM-budget regex (em-dash U+2014 between parens and "resets").
 *   2. Zod-issue JSON array (each element has `message: string` + `path: array`).
 *   3. Plain-string fallthrough (truncate >200 chars, keep full as `details`).
 *
 * Pure function — no I/O, no throws (JSON.parse errors are caught).
 */

const BUDGET_REGEX =
  /^Daily LLM budget reached \(\$([0-9.]+) \/ \$([0-9.]+)\) — resets at (.+)$/;

export interface FormattedAnalysisError {
  headline: string;
  details?: string;
  budgetShape?: { spent: number; limit: number; retryAt: string };
}

interface ZodIssueLike {
  message: string;
  path: unknown[];
}

function isZodIssueArray(value: unknown): value is ZodIssueLike[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    typeof (value[0] as { message?: unknown }).message === 'string' &&
    Array.isArray((value[0] as { path?: unknown }).path)
  );
}

export function formatAnalysisError(raw: string): FormattedAnalysisError {
  // Rule 1 — budget shape.
  const budgetMatch = raw.match(BUDGET_REGEX);
  if (budgetMatch) {
    return {
      headline: 'Daily LLM budget reached',
      details: raw,
      budgetShape: {
        spent: parseFloat(budgetMatch[1]),
        limit: parseFloat(budgetMatch[2]),
        retryAt: budgetMatch[3],
      },
    };
  }

  // Rule 2 — zod-issue JSON array.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (parsed !== undefined && isZodIssueArray(parsed)) {
    const first = parsed[0];
    const pathStr = first.path.join('.');
    const headline = pathStr.length > 0
      ? `${pathStr}: ${first.message}`
      : first.message;
    return {
      headline,
      details: JSON.stringify(parsed, null, 2),
    };
  }

  // Rule 3 — plain message fallthrough.
  if (raw.length > 200) {
    return {
      headline: raw.slice(0, 200) + '…',
      details: raw,
    };
  }
  return { headline: raw };
}
