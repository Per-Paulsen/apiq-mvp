/**
 * Helper-3 — effective-security determination (Welle Arch / OQ-4 consolidation).
 *
 * Used by:
 *   - threat-p2-functions::objectIdWriteOpNeedsSecurity   (TM-A2)
 *   - threat-p2-functions::adminDescriptionWithoutSecurity (TM-A28)
 *   - threat-p3-functions::nonStandardMethodNeedsSecurity  (TM-A30 / TM-A43)
 *
 * Each pre-consolidation function walked op-level + spec-level `security`
 * stack inline. The OAS3 inheritance rule is: `op.security` overrides
 * `document.security`. An empty array on op.security (`security: []`) is the
 * intentional auth-opt-out — a few rules treat this as a separate signal
 * (e.g. TM-A28 flags admin endpoints with `security: []` distinctly from
 * admin endpoints that simply forgot to declare).
 *
 * `signupNeedsRateLimitOrCaptcha` (TM-A31) was listed in the OQ-4 spec under
 * the security-family but on inspection only walks rate-limit / captcha
 * signals — it does NOT inspect security stacks, so it's not refactored here.
 *
 * Source: OAS 3 §4.7.2 Security Requirement Object inheritance.
 */

type AnyObj = Record<string, unknown>;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface EffectiveSecurity {
  /** `op.security` is an array with at least one declared requirement. */
  hasOperationLevel: boolean;
  /** `document.security` is an array with at least one declared requirement. */
  hasSpecLevel: boolean;
  /** `op.security: []` — intentional opt-out at op-level. */
  isEmpty: boolean;
  /** Union of scheme-keys across op-level + spec-level requirement objects. */
  schemes: string[];
}

function collectSchemeNames(req: unknown): string[] {
  if (!Array.isArray(req)) return [];
  const out = new Set<string>();
  for (const entry of req) {
    if (!isObject(entry)) continue;
    for (const k of Object.keys(entry)) out.add(k);
  }
  return [...out];
}

/**
 * Returns the effective-security profile for `op` against `doc`.
 *
 * - `hasOperationLevel` ↔ `op.security` is array AND length > 0.
 * - `isEmpty`           ↔ `op.security` is array AND length === 0.
 * - `hasSpecLevel`      ↔ `doc.security` is array AND length > 0.
 * - `schemes`           — union of scheme-keys across both stacks.
 *
 * Defensive: tolerates missing/non-object op or doc.
 */
export function effectiveSecurityFor(op: unknown, doc: unknown): EffectiveSecurity {
  const opSecurity = isObject(op) && Array.isArray(op.security) ? op.security : null;
  const docSecurity =
    isObject(doc) && Array.isArray((doc as AnyObj).security) ? (doc as AnyObj).security : null;

  const hasOperationLevel = !!opSecurity && opSecurity.length > 0;
  const isEmpty = !!opSecurity && opSecurity.length === 0;
  const hasSpecLevel = Array.isArray(docSecurity) && docSecurity.length > 0;

  const schemes = [
    ...collectSchemeNames(opSecurity),
    ...collectSchemeNames(docSecurity),
  ];
  return { hasOperationLevel, hasSpecLevel, isEmpty, schemes: [...new Set(schemes)] };
}
