/**
 * IANA HTTP Cache Directive Registry — snapshot.
 *
 * Source: https://www.iana.org/assignments/http-cache-directives/cache-directives.csv
 * Snapshot date: 2026-05-06.
 *
 * RFC 9111 §5.2 distinguishes request-context directives from response-context
 * directives. We capture both (some are dual-context — "max-age" is on both,
 * "no-cache" is on both). Detectors validating Cache-Control header values can
 * use isRegisteredCacheDirective(name) plus getCacheDirectiveContext(name) to
 * flag misuse (e.g. response-only directive in a request).
 *
 * Coverage: T22 IANA Snapshot dependency for RFC2-35..39 (cache-directives in
 * request/response classes) and the http-protocol-pairings module (T10).
 */

/** Where a cache directive may legitimately appear. */
export type CacheDirectiveContext = "request" | "response" | "both";

export interface CacheDirectiveEntry {
  name: string;
  context: CacheDirectiveContext;
  reference: string;
}

const ENTRIES: ReadonlyArray<CacheDirectiveEntry> = [
  { name: "immutable",              context: "response", reference: "RFC8246" },
  { name: "max-age",                context: "both",     reference: "RFC9111, Section 5.2.1.1, 5.2.2.1" },
  { name: "max-stale",              context: "request",  reference: "RFC9111, Section 5.2.1.2" },
  { name: "min-fresh",              context: "request",  reference: "RFC9111, Section 5.2.1.3" },
  { name: "must-revalidate",        context: "response", reference: "RFC9111, Section 5.2.2.2" },
  { name: "must-understand",        context: "response", reference: "RFC9111, Section 5.2.2.3" },
  { name: "no-cache",               context: "both",     reference: "RFC9111, Section 5.2.1.4, 5.2.2.4" },
  { name: "no-store",               context: "both",     reference: "RFC9111, Section 5.2.1.5, 5.2.2.5" },
  { name: "no-transform",           context: "both",     reference: "RFC9111, Section 5.2.1.6, 5.2.2.6" },
  { name: "only-if-cached",         context: "request",  reference: "RFC9111, Section 5.2.1.7" },
  { name: "private",                context: "response", reference: "RFC9111, Section 5.2.2.7" },
  { name: "proxy-revalidate",       context: "response", reference: "RFC9111, Section 5.2.2.8" },
  { name: "public",                 context: "response", reference: "RFC9111, Section 5.2.2.9" },
  { name: "s-maxage",               context: "response", reference: "RFC9111, Section 5.2.2.10" },
  { name: "stale-if-error",         context: "both",     reference: "RFC5861, Section 4" },
  { name: "stale-while-revalidate", context: "response", reference: "RFC5861, Section 3" },
];

export const CACHE_DIRECTIVES: ReadonlySet<string> = new Set(ENTRIES.map((e) => e.name));
export const REQUEST_CACHE_DIRECTIVES: ReadonlySet<string> = new Set(
  ENTRIES.filter((e) => e.context !== "response").map((e) => e.name)
);
export const RESPONSE_CACHE_DIRECTIVES: ReadonlySet<string> = new Set(
  ENTRIES.filter((e) => e.context !== "request").map((e) => e.name)
);
export const CACHE_DIRECTIVE_ENTRIES: ReadonlyArray<CacheDirectiveEntry> = ENTRIES;

/** Whether a directive name is in the IANA registry (case-insensitive). */
export function isRegisteredCacheDirective(name: string): boolean {
  return CACHE_DIRECTIVES.has(name.toLowerCase());
}

/** Where a directive may legitimately appear, or undefined if not registered. */
export function getCacheDirectiveContext(name: string): CacheDirectiveContext | undefined {
  const e = ENTRIES.find((x) => x.name === name.toLowerCase());
  return e ? e.context : undefined;
}

/**
 * Whether a directive is valid in the given context. Used by walkers that
 * inspect Cache-Control header schemas declared on operations / responses.
 */
export function isCacheDirectiveValidIn(
  name: string,
  context: "request" | "response"
): boolean {
  const ctx = getCacheDirectiveContext(name);
  if (!ctx) return false;
  return ctx === "both" || ctx === context;
}
