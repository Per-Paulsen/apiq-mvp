/**
 * Helper-1 — rate-limit-headers detection (Welle Arch / OQ-4 consolidation).
 *
 * Used by:
 *   - threat-p1-functions::sensitiveFlowNeedsRateLimitHeaders (TM-A32)
 *   - threat-p2-functions::loginEndpointRateLimit            (TM-A9)
 *   - threat-p3-functions::signupNeedsRateLimitOrCaptcha     (TM-A31)
 *   - threat-p3-functions::postingCommentNeedsRateLimit      (TM-A33)
 *
 * All four classify the operation (sensitive-flow / login / signup / commenting)
 * and then check whether ANY response declares a recognised rate-limit header.
 * Pre-consolidation each file maintained its own `RATE_LIMIT_HEADER_PATTERNS`
 * regex-list and a near-identical `op*RateLimitHeader(op)` walker. The walker
 * shape is identical across all four — extracted here.
 *
 * Source: draft-ietf-httpapi-ratelimit-headers + RFC 9110 §10.2.3 (Retry-After) +
 *         Stripe + GitHub rate-limit conventions.
 */

type AnyObj = Record<string, unknown>;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Regex-list recognised by linter as rate-limit-style header declarations.
 * Matches case-insensitive against the header-name keys in
 * `responses[*].headers`.
 *
 * Covers the IETF-draft `RateLimit-*` triplet, the older `X-RateLimit-*` /
 * `X-Rate-Limit-*` prefixes used by Stripe / GitHub / Twitter, and RFC 9110
 * §10.2.3 `Retry-After`.
 */
export const RATE_LIMIT_HEADER_PATTERNS: readonly RegExp[] = [
  /^x-ratelimit-/i,
  /^ratelimit-/i,
  /^x-rate-limit-/i,
  /^retry-after$/i,
];

/**
 * Returns `true` iff at least one response in `op.responses[*]` declares at
 * least one header whose name matches a rate-limit-header pattern.
 *
 * Defensive: tolerates missing/malformed `responses` and `headers` containers
 * by returning `false`.
 */
export function operationHasRateLimitHeader(op: unknown): boolean {
  if (!isObject(op)) return false;
  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) return false;
  for (const respUnknown of Object.values(responses)) {
    if (!isObject(respUnknown)) continue;
    const headers = isObject(respUnknown.headers) ? respUnknown.headers : null;
    if (!headers) continue;
    for (const headerName of Object.keys(headers)) {
      if (RATE_LIMIT_HEADER_PATTERNS.some((re) => re.test(headerName))) {
        return true;
      }
    }
  }
  return false;
}
