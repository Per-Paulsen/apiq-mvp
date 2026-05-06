/**
 * IANA HTTP Method Registry — snapshot.
 *
 * Source: https://www.iana.org/assignments/http-methods/methods.csv
 * Snapshot date: 2026-05-06.
 *
 * RFC 9110 §9.2 distinguishes safe methods (read-only, no side-effects) from
 * idempotent methods (multiple identical requests yield same effect). RFC 9110
 * §9.3 + ext-RFCs (RFC 5789 PATCH, RFC 4918 WebDAV, RFC 3253 deltav, etc.) define
 * which methods may carry a request body.
 *
 * Coverage: T22 IANA dependency for RFC2-8 (no-body methods), RFC2-12 (header
 * vs param), RFC2-14 (Allow on 405), and the http-protocol-pairings module (T10).
 * Walkers in pagination-style-inconsistency.ts and others import isHttpMethod
 * from walkers/_shared.ts; this module is the canonical source for the more
 * detailed semantics those walkers need (safe? idempotent? body-allowed?).
 *
 * Note: walkers/_shared.ts has its own minimal HTTP_METHODS (8 OAS3 methods).
 * This module covers the FULL IANA registry incl. WebDAV / deltav.
 */

export interface HttpMethodEntry {
  name: string;
  /** Safe per RFC 9110 §9.2.1 — read-only, no side effects. */
  safe: boolean;
  /** Idempotent per RFC 9110 §9.2.2 — repeated requests have same effect. */
  idempotent: boolean;
  /**
   * Whether the method is permitted to carry a request body in OpenAPI sense
   * (RFC 9110 §9.3 + ext-RFCs). Note: RFC 9110 §9.3.1 says GET/HEAD/OPTIONS/TRACE
   * payloads have no defined semantics; OAS-3 forbids requestBody on GET/HEAD/DELETE.
   * QUERY (draft-ietf-httpbis-safe-method-w-body) explicitly carries a body.
   */
  bodyAllowed: boolean;
  reference: string;
}

const ENTRIES: ReadonlyArray<HttpMethodEntry> = [
  // Core RFC 9110 methods
  { name: "GET",     safe: true,  idempotent: true,  bodyAllowed: false, reference: "RFC9110, Section 9.3.1" },
  { name: "HEAD",    safe: true,  idempotent: true,  bodyAllowed: false, reference: "RFC9110, Section 9.3.2" },
  { name: "POST",    safe: false, idempotent: false, bodyAllowed: true,  reference: "RFC9110, Section 9.3.3" },
  { name: "PUT",     safe: false, idempotent: true,  bodyAllowed: true,  reference: "RFC9110, Section 9.3.4" },
  { name: "DELETE",  safe: false, idempotent: true,  bodyAllowed: false, reference: "RFC9110, Section 9.3.5" },
  { name: "CONNECT", safe: false, idempotent: false, bodyAllowed: true,  reference: "RFC9110, Section 9.3.6" },
  { name: "OPTIONS", safe: true,  idempotent: true,  bodyAllowed: false, reference: "RFC9110, Section 9.3.7" },
  { name: "TRACE",   safe: true,  idempotent: true,  bodyAllowed: false, reference: "RFC9110, Section 9.3.8" },

  // Common extensions
  { name: "PATCH",   safe: false, idempotent: false, bodyAllowed: true,  reference: "RFC5789, Section 2" },
  { name: "QUERY",   safe: true,  idempotent: true,  bodyAllowed: true,  reference: "RFC-ietf-httpbis-safe-method-w-body, Section 2" },

  // WebDAV (RFC 4918)
  { name: "PROPFIND",  safe: true,  idempotent: true, bodyAllowed: true, reference: "RFC4918, Section 9.1" },
  { name: "PROPPATCH", safe: false, idempotent: true, bodyAllowed: true, reference: "RFC4918, Section 9.2" },
  { name: "MKCOL",     safe: false, idempotent: true, bodyAllowed: true, reference: "RFC4918, Section 9.3" },
  { name: "COPY",      safe: false, idempotent: true, bodyAllowed: true, reference: "RFC4918, Section 9.8" },
  { name: "MOVE",      safe: false, idempotent: true, bodyAllowed: true, reference: "RFC4918, Section 9.9" },
  { name: "LOCK",      safe: false, idempotent: false, bodyAllowed: true, reference: "RFC4918, Section 9.10" },
  { name: "UNLOCK",    safe: false, idempotent: true, bodyAllowed: false, reference: "RFC4918, Section 9.11" },
  { name: "MKCALENDAR", safe: false, idempotent: true, bodyAllowed: true, reference: "RFC4791, Section 5.3.1" },
  { name: "REPORT",    safe: true,  idempotent: true, bodyAllowed: true, reference: "RFC3253, Section 3.6" },
  { name: "SEARCH",    safe: true,  idempotent: true, bodyAllowed: true, reference: "RFC5323, Section 2" },

  // DeltaV / version-control (RFC 3253)
  { name: "VERSION-CONTROL",  safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3253, Section 3.5" },
  { name: "CHECKOUT",         safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3253, Section 8.8" },
  { name: "CHECKIN",          safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3253, Section 9.4" },
  { name: "UNCHECKOUT",       safe: false, idempotent: true, bodyAllowed: false, reference: "RFC3253, Section 4.5" },
  { name: "UPDATE",           safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3253, Section 7.1" },
  { name: "LABEL",            safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3253, Section 8.2" },
  { name: "MERGE",            safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3253, Section 11.2" },
  { name: "BASELINE-CONTROL", safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3253, Section 12.6" },
  { name: "MKACTIVITY",       safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3253, Section 13.5" },
  { name: "MKWORKSPACE",      safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3253, Section 6.3" },

  // ACL / Bind / Linking
  { name: "ACL",              safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3744, Section 8.1" },
  { name: "BIND",             safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC5842, Section 4" },
  { name: "UNBIND",           safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC5842, Section 5" },
  { name: "REBIND",           safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC5842, Section 6" },
  { name: "LINK",             safe: false, idempotent: true, bodyAllowed: false, reference: "RFC2068, Section 19.6.1.2" },
  { name: "UNLINK",           safe: false, idempotent: true, bodyAllowed: false, reference: "RFC2068, Section 19.6.1.3" },
  { name: "ORDERPATCH",       safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC3648, Section 7" },
  { name: "MKREDIRECTREF",    safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC4437, Section 6" },
  { name: "UPDATEREDIRECTREF",safe: false, idempotent: true, bodyAllowed: true,  reference: "RFC4437, Section 7" },

  // HTTP/2
  { name: "PRI",              safe: true,  idempotent: true, bodyAllowed: false, reference: "RFC9113, Section 3.4" },

  // Wildcard (special)
  { name: "*",                safe: false, idempotent: false, bodyAllowed: false, reference: "RFC9110, Section 18.2 (wildcard, not a real method)" },
];

export const HTTP_METHODS_REGISTRY: ReadonlySet<string> = new Set(
  ENTRIES.map((e) => e.name)
);

/** Methods that are safe per RFC 9110 §9.2.1. */
export const SAFE_METHODS: ReadonlySet<string> = new Set(
  ENTRIES.filter((e) => e.safe).map((e) => e.name)
);

/** Methods that are idempotent per RFC 9110 §9.2.2. */
export const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(
  ENTRIES.filter((e) => e.idempotent).map((e) => e.name)
);

/** Methods where a request body is permitted (RFC 9110 + ext-RFCs). */
export const BODY_ALLOWED_METHODS: ReadonlySet<string> = new Set(
  ENTRIES.filter((e) => e.bodyAllowed).map((e) => e.name)
);

export const HTTP_METHOD_ENTRIES: ReadonlyArray<HttpMethodEntry> = ENTRIES;

/** Whether a method name is registered with IANA (case-insensitive lookup -> upper-case canonical). */
export function isRegisteredMethod(method: string): boolean {
  return HTTP_METHODS_REGISTRY.has(method.toUpperCase());
}

/** Whether a method is safe per RFC 9110 §9.2.1. */
export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/** Whether a method is idempotent per RFC 9110 §9.2.2. */
export function isIdempotentMethod(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/**
 * Whether a method is permitted to carry a request body in OpenAPI sense
 * (RFC 9110 §9.3 + ext-RFCs). Note OAS-3 also forbids requestBody on GET/HEAD/DELETE
 * regardless of HTTP semantics; walkers checking OAS-shape should treat
 * GET/HEAD/DELETE as no-body even if a custom server tunneling payload exists.
 */
export function isBodyAllowedMethod(method: string): boolean {
  return BODY_ALLOWED_METHODS.has(method.toUpperCase());
}

/** Look up the full registry entry. Returns undefined for unregistered methods. */
export function getMethodEntry(method: string): HttpMethodEntry | undefined {
  return ENTRIES.find((e) => e.name === method.toUpperCase());
}
