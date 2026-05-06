/**
 * IANA HTTP Range Unit Registry — snapshot.
 *
 * Source: https://www.iana.org/assignments/http-parameters/http-parameters.xhtml
 *         (range-units sub-registry) and RFC 9110 §14.
 * Snapshot date: 2026-05-06.
 *
 * The registry is small. `bytes` is the only universally-meaningful unit;
 * `none` is a special token meaning "no ranges accepted". Custom range-units
 * are permitted (RFC 9110 §14) — detectors should treat unknowns as hint-tier
 * (potentially-non-standard) rather than error-tier.
 */

/** Registered HTTP range units. */
export const HTTP_RANGE_UNITS: ReadonlySet<string> = new Set([
  "bytes",
  "none",
]);

/**
 * Whether a range-unit token is registered with IANA.
 * Custom range-units are permitted by RFC 9110 §14 — callers should treat
 * `false` as a hint, not an error.
 */
export function isRegisteredRangeUnit(unit: string): boolean {
  return HTTP_RANGE_UNITS.has(unit.toLowerCase());
}
