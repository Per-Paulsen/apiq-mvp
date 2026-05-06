/**
 * IANA HTTP Status Code Registry — snapshot.
 *
 * Source: https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml
 * Snapshot date: 2026-05-06.
 *
 * Used by Wave-2 detector tasks: T13 media-type-IANA-validator, T10
 * http-protocol-pairings, RFC2-16 status-code-IANA-registered, etc.
 *
 * Note: "(Unused)" entries (306, 418) and obsoleted entries are KEPT in the
 * Set because IANA still considers them assigned/reserved — emitting them in
 * a real OpenAPI is a smell, but the registry-membership check is data-only;
 * stronger semantic-rules belong to walkers/Spectral.
 */

export interface StatusCodeEntry {
  code: number;
  phrase: string;
  reference: string;
  /** True for entries IANA marks (Unused), obsoleted, or historical. */
  unusedOrObsolete?: boolean;
}

const ENTRIES: ReadonlyArray<StatusCodeEntry> = [
  // 1xx Informational
  { code: 100, phrase: "Continue", reference: "RFC9110, Section 15.2.1" },
  { code: 101, phrase: "Switching Protocols", reference: "RFC9110, Section 15.2.2" },
  { code: 102, phrase: "Processing", reference: "RFC2518" },
  { code: 103, phrase: "Early Hints", reference: "RFC8297" },
  { code: 104, phrase: "Upload Resumption Supported", reference: "draft-ietf-httpbis-resumable-upload (TEMPORARY)" },

  // 2xx Success
  { code: 200, phrase: "OK", reference: "RFC9110, Section 15.3.1" },
  { code: 201, phrase: "Created", reference: "RFC9110, Section 15.3.2" },
  { code: 202, phrase: "Accepted", reference: "RFC9110, Section 15.3.3" },
  { code: 203, phrase: "Non-Authoritative Information", reference: "RFC9110, Section 15.3.4" },
  { code: 204, phrase: "No Content", reference: "RFC9110, Section 15.3.5" },
  { code: 205, phrase: "Reset Content", reference: "RFC9110, Section 15.3.6" },
  { code: 206, phrase: "Partial Content", reference: "RFC9110, Section 15.3.7" },
  { code: 207, phrase: "Multi-Status", reference: "RFC4918" },
  { code: 208, phrase: "Already Reported", reference: "RFC5842" },
  { code: 226, phrase: "IM Used", reference: "RFC3229" },

  // 3xx Redirection
  { code: 300, phrase: "Multiple Choices", reference: "RFC9110, Section 15.4.1" },
  { code: 301, phrase: "Moved Permanently", reference: "RFC9110, Section 15.4.2" },
  { code: 302, phrase: "Found", reference: "RFC9110, Section 15.4.3" },
  { code: 303, phrase: "See Other", reference: "RFC9110, Section 15.4.4" },
  { code: 304, phrase: "Not Modified", reference: "RFC9110, Section 15.4.5" },
  { code: 305, phrase: "Use Proxy", reference: "RFC9110, Section 15.4.6" },
  { code: 306, phrase: "(Unused)", reference: "RFC9110, Section 15.4.7", unusedOrObsolete: true },
  { code: 307, phrase: "Temporary Redirect", reference: "RFC9110, Section 15.4.8" },
  { code: 308, phrase: "Permanent Redirect", reference: "RFC9110, Section 15.4.9" },

  // 4xx Client Error
  { code: 400, phrase: "Bad Request", reference: "RFC9110, Section 15.5.1" },
  { code: 401, phrase: "Unauthorized", reference: "RFC9110, Section 15.5.2" },
  { code: 402, phrase: "Payment Required", reference: "RFC9110, Section 15.5.3" },
  { code: 403, phrase: "Forbidden", reference: "RFC9110, Section 15.5.4" },
  { code: 404, phrase: "Not Found", reference: "RFC9110, Section 15.5.5" },
  { code: 405, phrase: "Method Not Allowed", reference: "RFC9110, Section 15.5.6" },
  { code: 406, phrase: "Not Acceptable", reference: "RFC9110, Section 15.5.7" },
  { code: 407, phrase: "Proxy Authentication Required", reference: "RFC9110, Section 15.5.8" },
  { code: 408, phrase: "Request Timeout", reference: "RFC9110, Section 15.5.9" },
  { code: 409, phrase: "Conflict", reference: "RFC9110, Section 15.5.10" },
  { code: 410, phrase: "Gone", reference: "RFC9110, Section 15.5.11" },
  { code: 411, phrase: "Length Required", reference: "RFC9110, Section 15.5.12" },
  { code: 412, phrase: "Precondition Failed", reference: "RFC9110, Section 15.5.13" },
  { code: 413, phrase: "Content Too Large", reference: "RFC9110, Section 15.5.14" },
  { code: 414, phrase: "URI Too Long", reference: "RFC9110, Section 15.5.15" },
  { code: 415, phrase: "Unsupported Media Type", reference: "RFC9110, Section 15.5.16" },
  { code: 416, phrase: "Range Not Satisfiable", reference: "RFC9110, Section 15.5.17" },
  { code: 417, phrase: "Expectation Failed", reference: "RFC9110, Section 15.5.18" },
  { code: 418, phrase: "(Unused)", reference: "RFC9110, Section 15.5.19", unusedOrObsolete: true },
  { code: 421, phrase: "Misdirected Request", reference: "RFC9110, Section 15.5.20" },
  { code: 422, phrase: "Unprocessable Content", reference: "RFC9110, Section 15.5.21" },
  { code: 423, phrase: "Locked", reference: "RFC4918" },
  { code: 424, phrase: "Failed Dependency", reference: "RFC4918" },
  { code: 425, phrase: "Too Early", reference: "RFC8470" },
  { code: 426, phrase: "Upgrade Required", reference: "RFC9110, Section 15.5.22" },
  { code: 428, phrase: "Precondition Required", reference: "RFC6585" },
  { code: 429, phrase: "Too Many Requests", reference: "RFC6585" },
  { code: 431, phrase: "Request Header Fields Too Large", reference: "RFC6585" },
  { code: 451, phrase: "Unavailable For Legal Reasons", reference: "RFC7725" },

  // 5xx Server Error
  { code: 500, phrase: "Internal Server Error", reference: "RFC9110, Section 15.6.1" },
  { code: 501, phrase: "Not Implemented", reference: "RFC9110, Section 15.6.2" },
  { code: 502, phrase: "Bad Gateway", reference: "RFC9110, Section 15.6.3" },
  { code: 503, phrase: "Service Unavailable", reference: "RFC9110, Section 15.6.4" },
  { code: 504, phrase: "Gateway Timeout", reference: "RFC9110, Section 15.6.5" },
  { code: 505, phrase: "HTTP Version Not Supported", reference: "RFC9110, Section 15.6.6" },
  { code: 506, phrase: "Variant Also Negotiates", reference: "RFC2295" },
  { code: 507, phrase: "Insufficient Storage", reference: "RFC4918" },
  { code: 508, phrase: "Loop Detected", reference: "RFC5842" },
  { code: 510, phrase: "Not Extended", reference: "RFC2774 (OBSOLETED)", unusedOrObsolete: true },
  { code: 511, phrase: "Network Authentication Required", reference: "RFC6585" },
];

export const HTTP_STATUS_CODES: ReadonlySet<number> = new Set(ENTRIES.map((e) => e.code));
export const HTTP_STATUS_PHRASE: ReadonlyMap<number, string> = new Map(
  ENTRIES.map((e) => [e.code, e.phrase])
);
export const HTTP_STATUS_REFERENCE: ReadonlyMap<number, string> = new Map(
  ENTRIES.map((e) => [e.code, e.reference])
);
export const HTTP_STATUS_ENTRIES: ReadonlyArray<StatusCodeEntry> = ENTRIES;

export type StatusCategory = "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "invalid";

/**
 * Whether a code is in the IANA registry (excluding placeholder ranges).
 * Accepts string-coded inputs ("200") since OpenAPI uses strings as response keys.
 */
export function isValidStatusCode(code: number | string): boolean {
  const n = typeof code === "string" ? Number(code) : code;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return false;
  return HTTP_STATUS_CODES.has(n);
}

/**
 * Return the status category bucket. Useful for grouping in detectors.
 * Handles non-IANA numbers (e.g. custom 599) by bucketing on hundreds-digit;
 * only returns invalid for non-numeric / out-of-range input.
 */
export function getStatusCategory(code: number | string): StatusCategory {
  const n = typeof code === "string" ? Number(code) : code;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return "invalid";
  if (n >= 100 && n <= 199) return "1xx";
  if (n >= 200 && n <= 299) return "2xx";
  if (n >= 300 && n <= 399) return "3xx";
  if (n >= 400 && n <= 499) return "4xx";
  if (n >= 500 && n <= 599) return "5xx";
  return "invalid";
}

/** Reason phrase for a known status, or undefined if not in registry. */
export function getStatusPhrase(code: number | string): string | undefined {
  const n = typeof code === "string" ? Number(code) : code;
  if (!Number.isFinite(n)) return undefined;
  return HTTP_STATUS_PHRASE.get(n);
}

/**
 * Whether a status is marked unused/obsolete in the registry. Walkers can
 * downgrade severity (hint instead of error) when one of these appears,
 * because the OpenAPI is technically referencing a registered code, just an
 * unrecommended one.
 */
export function isUnusedOrObsoleteStatus(code: number | string): boolean {
  const n = typeof code === "string" ? Number(code) : code;
  if (!Number.isFinite(n)) return false;
  return ENTRIES.some((e) => e.code === n && e.unusedOrObsolete === true);
}
