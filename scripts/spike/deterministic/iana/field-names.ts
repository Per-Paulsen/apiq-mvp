/**
 * IANA HTTP Field Name Registry — snapshot.
 *
 * Source: https://www.iana.org/assignments/http-fields/field-names.csv
 * Snapshot date: 2026-05-06.
 *
 * The registry is large (~250+ fields incl. permanent + provisional + obsoleted).
 * We snapshot:
 *   - Permanent fields (181 + 4 capitalized = 185)
 *   - Provisional fields (23) — flagged separately so detectors can downgrade
 *   - Deprecated fields (8) — flagged so detectors can warn
 *   - Obsoleted fields (39) — flagged so detectors can error
 *
 * Helpers:
 *   - isRegisteredField(name)         -> any registered status
 *   - getFieldStatus(name)            -> registered status enum
 *   - validateFieldName(name)         -> grammar + registry check
 *
 * Coverage: T22 IANA dependency for RFC2-12 (header redeclared as param),
 * RFC2-18 (Content-Length redundant), RFC2-29 (Allow on 405), and many
 * pairings rules in T10 http-protocol-pairings.
 */

/** RFC 9110 §5.1 token grammar for field names. */
const FIELD_TOKEN_RE = /^[!#$%&'*+-.^_`|~0-9A-Za-z]+$/;

export type FieldStatus = "permanent" | "provisional" | "deprecated" | "obsoleted" | "unregistered";

/** PERMANENT_FIELDS (status: 184 entries) */
export const PERMANENT_FIELDS: ReadonlySet<string> = new Set([
  "A-IM",
  "Accept",
  "Accept-Additions",
  "Accept-CH",
  "Accept-Datetime",
  "Accept-Encoding",
  "Accept-Features",
  "Accept-Language",
  "Accept-Patch",
  "Accept-Post",
  "Accept-Query",
  "Accept-Ranges",
  "Accept-Signature",
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Origin",
  "Access-Control-Expose-Headers",
  "Access-Control-Max-Age",
  "Access-Control-Request-Headers",
  "Access-Control-Request-Method",
  "Age",
  "Allow",
  "ALPN",
  "Alt-Svc",
  "Alt-Used",
  "Alternates",
  "Apply-To-Redirect-Ref",
  "Authentication-Control",
  "Authentication-Info",
  "Authorization",
  "Available-Dictionary",
  "Cache-Control",
  "Cache-Group-Invalidation",
  "Cache-Groups",
  "Cache-Status",
  "Cal-Managed-ID",
  "CalDAV-Timezones",
  "Capsule-Protocol",
  "CDN-Cache-Control",
  "CDN-Loop",
  "Cert-Not-After",
  "Cert-Not-Before",
  "Clear-Site-Data",
  "Client-Cert",
  "Client-Cert-Chain",
  "Close",
  "Concealed-Auth-Export",
  "Connection",
  "Content-Digest",
  "Content-Disposition",
  "Content-Encoding",
  "Content-Language",
  "Content-Length",
  "Content-Location",
  "Content-Range",
  "Content-Security-Policy",
  "Content-Security-Policy-Report-Only",
  "Content-Type",
  "Cookie",
  "Cross-Origin-Embedder-Policy",
  "Cross-Origin-Embedder-Policy-Report-Only",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Opener-Policy-Report-Only",
  "Cross-Origin-Resource-Policy",
  "DASL",
  "Date",
  "DAV",
  "Delta-Base",
  "Deprecation",
  "Depth",
  "Destination",
  "Detached-JWS",
  "Dictionary-ID",
  "DPoP",
  "DPoP-Nonce",
  "Early-Data",
  "ETag",
  "Expect",
  "Expires",
  "Forwarded",
  "From",
  "Hobareg",
  "Host",
  "If",
  "If-Match",
  "If-Modified-Since",
  "If-None-Match",
  "If-Range",
  "If-Schedule-Tag-Match",
  "If-Unmodified-Since",
  "IM",
  "Include-Referred-Token-Binding-ID",
  "Incremental",
  "Keep-Alive",
  "Label",
  "Last-Event-ID",
  "Last-Modified",
  "Link",
  "Link-Template",
  "Location",
  "Lock-Token",
  "Max-Forwards",
  "Memento-Datetime",
  "Meter",
  "MIME-Version",
  "Negotiate",
  "NEL",
  "OData-EntityId",
  "OData-Isolation",
  "OData-MaxVersion",
  "OData-Version",
  "Optional-WWW-Authenticate",
  "Ordering-Type",
  "Origin",
  "Origin-Agent-Cluster",
  "OSCORE",
  "OSLC-Core-Version",
  "Overwrite",
  "Ping-From",
  "Ping-To",
  "Position",
  "Prefer",
  "Preference-Applied",
  "Priority",
  "Proxy-Authenticate",
  "Proxy-Authentication-Info",
  "Proxy-Authorization",
  "Proxy-Status",
  "Public-Key-Pins",
  "Public-Key-Pins-Report-Only",
  "Range",
  "Redirect-Ref",
  "Referer",
  "Referrer-Policy",
  "Refresh",
  "Replay-Nonce",
  "Repr-Digest",
  "Retry-After",
  "Schedule-Reply",
  "Schedule-Tag",
  "Sec-Fetch-Dest",
  "Sec-Fetch-Mode",
  "Sec-Fetch-Site",
  "Sec-Fetch-User",
  "Sec-Purpose",
  "Sec-Token-Binding",
  "Sec-WebSocket-Accept",
  "Sec-WebSocket-Extensions",
  "Sec-WebSocket-Key",
  "Sec-WebSocket-Protocol",
  "Sec-WebSocket-Version",
  "Server",
  "Server-Timing",
  "Set-Cookie",
  "Set-Txn",
  "Signature",
  "Signature-Input",
  "SLUG",
  "SoapAction",
  "Status-URI",
  "Strict-Transport-Security",
  "Sunset",
  "TCN",
  "TE",
  "Timeout",
  "Topic",
  "Traceparent",
  "Tracestate",
  "Trailer",
  "Transfer-Encoding",
  "TTL",
  "Upgrade",
  "Urgency",
  "Use-As-Dictionary",
  "User-Agent",
  "Variant-Vary",
  "Vary",
  "Via",
  "Want-Content-Digest",
  "Want-Repr-Digest",
  "WWW-Authenticate",
  "X-Content-Type-Options",
  "X-Frame-Options",
]);

/** PROVISIONAL_FIELDS (status: 23 entries) */
export const PROVISIONAL_FIELDS: ReadonlySet<string> = new Set([
  "Activate-Storage-Access",
  "AMP-Cache-Transform",
  "CMCD-Object",
  "CMCD-Request",
  "CMCD-Session",
  "CMCD-Status",
  "CMSD-Dynamic",
  "CMSD-Static",
  "Configuration-Context",
  "CTA-Common-Access-Token",
  "EDIINT-Features",
  "Isolation",
  "Permissions-Policy",
  "Repeatability-Client-ID",
  "Repeatability-First-Sent",
  "Repeatability-Request-ID",
  "Repeatability-Result",
  "Reporting-Endpoints",
  "Sec-Fetch-Storage-Access",
  "Sec-GPC",
  "Surrogate-Capability",
  "Surrogate-Control",
  "Timing-Allow-Origin",
]);

/** DEPRECATED_FIELDS (status: 8 entries) */
export const DEPRECATED_FIELDS: ReadonlySet<string> = new Set([
  "Accept-Charset",
  "C-PEP-Info",
  "Content-MD5",
  "P3P",
  "Pragma",
  "Protocol-Info",
  "Protocol-Query",
  "X-Device-Accept-Ranges",
]);

/** OBSOLETED_FIELDS (status: 47 entries) */
export const OBSOLETED_FIELDS: ReadonlySet<string> = new Set([
  "Access-Control",
  "C-Ext",
  "C-Man",
  "C-Opt",
  "C-PEP",
  "Compliance",
  "Content-Base",
  "Content-Identifier",
  "Content-Script-Type",
  "Content-Style-Type",
  "Content-Version",
  "Cost",
  "Default-Style",
  "Delta-Link",
  "Differential-ID",
  "Digest",
  "Ext",
  "HTTP2-Settings",
  "Man",
  "Method-Check",
  "Method-Check-Expires",
  "Non-Compliance",
  "Opt",
  "Optional",
  "P",
  "PEP",
  "Pep-Info",
  "PICS-Label",
  "Public",
  "Referer-Root",
  "Resolution-Hint",
  "Resolver-Location",
  "Safe",
  "Security-Scheme",
  "Set-Cookie2",
  "SetProfile",
  "UA-Color",
  "UA-Media",
  "UA-Pixels",
  "UA-Resolution",
  "UA-Windowpixels",
  "URI",
  "Version",
  "Want-Digest",
  "Warning",
  "X-Pad",
  "X-XSS-Protection",
]);

// Lower-cased index for case-insensitive lookup (HTTP field names are case-insensitive per RFC 9110 §5.1).
const LC_PERMANENT = new Set([...PERMANENT_FIELDS].map((s) => s.toLowerCase()));
const LC_PROVISIONAL = new Set([...PROVISIONAL_FIELDS].map((s) => s.toLowerCase()));
const LC_DEPRECATED = new Set([...DEPRECATED_FIELDS].map((s) => s.toLowerCase()));
const LC_OBSOLETED = new Set([...OBSOLETED_FIELDS].map((s) => s.toLowerCase()));

/**
 * Whether a field name is registered with IANA in any status (permanent /
 * provisional / deprecated / obsoleted). Use getFieldStatus() for finer-grained
 * checking; this helper is for membership-tests where any registration suffices.
 */
export function isRegisteredField(name: string): boolean {
  const lc = name.toLowerCase();
  return LC_PERMANENT.has(lc) || LC_PROVISIONAL.has(lc) || LC_DEPRECATED.has(lc) || LC_OBSOLETED.has(lc);
}

/** Return the registered status of a field name, or unregistered. */
export function getFieldStatus(name: string): FieldStatus {
  const lc = name.toLowerCase();
  if (LC_PERMANENT.has(lc)) return "permanent";
  if (LC_PROVISIONAL.has(lc)) return "provisional";
  if (LC_DEPRECATED.has(lc)) return "deprecated";
  if (LC_OBSOLETED.has(lc)) return "obsoleted";
  return "unregistered";
}

/**
 * RFC 9110 §5.1 token grammar — field names MUST be tokens. Custom / unregistered
 * field names are LEGAL (X- prefix is deprecated by RFC 6648 but still common in
 * practice). Detectors should use this for grammar-validity, not registry-membership.
 */
export function isValidFieldNameSyntax(name: string): boolean {
  return FIELD_TOKEN_RE.test(name);
}

export interface FieldNameValidation {
  /** Was the input a syntactically valid HTTP field-name token? */
  validSyntax: boolean;
  /** Status in IANA registry (or unregistered). */
  status: FieldStatus;
  /** True if name uses RFC 6648-deprecated X- prefix (case-insensitive). */
  deprecatedXPrefix: boolean;
}

/** One-call validator combining grammar + registry-status + RFC 6648 X- check. */
export function validateFieldName(name: string): FieldNameValidation {
  return {
    validSyntax: isValidFieldNameSyntax(name),
    status: getFieldStatus(name),
    deprecatedXPrefix: /^x-/i.test(name),
  };
}
