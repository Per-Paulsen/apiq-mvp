/**
 * Custom Spectral functions for the P4 + P5 Niche/Vendor ruleset (Welle D2).
 *
 * Plan-Doc Master: `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` §8.
 * Spec: `specs/E09-w-d2-niche-vendor.md` (T-D2-P4 + T-D2-P5).
 *
 * Maps 1-to-1 to rules in `rules/apiq-ruleset-niche.yaml`. P4 patterns are
 * low-frequency standards-conformance checks (RFC 3986 server-URL hygiene,
 * RFC 9110 Retry-After grammar). P5 patterns are vendor-extension /
 * information-only / off-by-default niche-detectors (JSON-strictness,
 * OAS-version-mismatched keywords, captive-portal awareness, AIP-style
 * resource-shape adherence).
 *
 * Pattern → function map (11 callables):
 *
 *   P4 (4):
 *     - serverUrlHostLowercase        (RFC2-71) — RFC 3986 §3.2.2 host case-insensitivity
 *     - serverUrlSchemeLowercase      (RFC2-72) — RFC 3986 §3.1 scheme lowercase
 *     - serverUrlPathNormalized       (RFC2-73) — RFC 3986 §6 path normalization
 *     - retryAfterGrammar             (RFC2-95) — RFC 9110 §10.2.3 Retry-After grammar
 *
 *   P5 (7):
 *     - defaultExampleStrictJson      (RFC2-83) — RFC 8259 §2 JSON strictness
 *     - contentEncodingOnOAS30        (RFC2-89) — JSON Schema draft-07+ keywords on OAS 3.0
 *     - precondition428Awareness      (RFC2-103) — RFC 6585 §3 ETag write-op 428 awareness
 *     - status511Awareness            (RFC2-105) — RFC 6585 §6 captive-portal observation
 *     - xInternalUsage                (CL-60)    — Stripe/OAI vendor-extension marker
 *     - bloatedDescription            (F-18)     — description >1000 chars / boilerplate
 *     - aipStandardFieldPresence      (SC-20)    — AIP standard-field-presence (off-by-default)
 *
 * Sources (file-level; per-callable headers below carry the verbatim cite):
 *   - RFC 3986 (URI generic syntax) https://www.rfc-editor.org/rfc/rfc3986
 *   - RFC 8259 (JSON) https://www.rfc-editor.org/rfc/rfc8259
 *   - RFC 9110 (HTTP Semantics) https://www.rfc-editor.org/rfc/rfc9110
 *   - RFC 6585 (Additional HTTP Status Codes) https://www.rfc-editor.org/rfc/rfc6585
 *   - JSON Schema (https://json-schema.org/specification.html)
 *   - OpenAPI 3.0 vs 3.1 differences (https://www.openapis.org/blog/2021/02/16/migrating-from-openapi-3-0-to-3-1-0)
 *   - Google AIPs (https://google.aip.dev/)
 *   - Stripe `x-internal` extension convention
 *   - rules-brainstorm.md RFC2-71/72/73/83/89/95/103/105 + CL-60 + F-18 + SC-20 (P4/P5)
 *
 * Lens: 2 (Standards-Compliance) primary on P4; mixed lenses on P5 (Lens 4
 * Client-Friction for CL-60/F-18; Lens 5 Style-Coherence for SC-20).
 * Round: Welle D2.
 */

import type { IFunction, IFunctionResult } from '@stoplight/spectral-core';

type AnyObj = Record<string, unknown>;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Helper used by walker-style functions that receive the Spectral `target`.
 * Strips unresolved `$ref` envelopes (Spectral resolves before calling, but
 * defensive null-handling avoids surprise crashes on partially-resolved docs).
 */
function getResolvedTarget<T = unknown>(target: unknown): T | undefined {
  if (!target || (typeof target === 'object' && '$ref' in (target as AnyObj))) {
    return undefined;
  }
  return target as T;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
const WRITE_METHODS = ['put', 'patch', 'delete'] as const;

/**
 * Parse a server-URL into raw scheme/host/path components WITHOUT applying
 * WHATWG URL normalization (which would lowercase the host and collapse
 * `/./` + `/../` segments — exactly the smells we want to detect for
 * RFC2-71/72/73).
 */
function rawUrlParts(
  url: string,
): { scheme: string; host: string; path: string } | null {
  // RFC 3986 §3 generic syntax: scheme ":" "//" authority path-abempty
  const m = url.match(
    /^([A-Za-z][A-Za-z0-9+.\-]*):\/\/([^/?#]*)([^?#]*)/,
  );
  if (!m) return null;
  const scheme = m[1];
  const authority = m[2];
  const path = m[3];
  // Strip optional userinfo + port from authority to isolate host.
  const hostMatch = authority.match(/^(?:[^@]*@)?([^:]*)(?::\d+)?$/);
  const host = hostMatch ? hostMatch[1] : authority;
  return { scheme, host, path };
}

// =============================================================================
// RFC2-71 — serverUrlHostLowercase
//
// RFC 3986 §3.2.2: "Although host is case-insensitive, producers and
// normalizers should use lowercase for registered names". Mixed-case
// hostnames in `servers[].url` are valid but smell — they break naive
// string-equality comparisons across SDK call-sites.
//
// Target: `servers[].url` string. Parse via WHATWG URL; flag if
// `hostname.toLowerCase() !== hostname`.
// =============================================================================

/**
 * RFC2-71 — Server-URL host should be lowercase.
 *
 * Source: RFC 3986 §3.2.2 (https://www.rfc-editor.org/rfc/rfc3986#section-3.2.2);
 *         rules-brainstorm.md RFC2-71 (P4).
 * Lens: 2 (Standards-Compliance)
 * Round: Welle D2
 */
export const serverUrlHostLowercase: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (typeof targetVal !== 'string' || targetVal.length === 0) return [];
  const parts = rawUrlParts(targetVal);
  if (!parts) return [];
  const host = parts.host;
  if (host.length === 0) return [];
  if (host === host.toLowerCase()) return [];
  return [
    {
      message:
        `Server URL host \`${host}\` contains uppercase characters; ` +
        `RFC 3986 §3.2.2 recommends lowercase for registered hostnames. Use \`${host.toLowerCase()}\`.`,
    },
  ];
};

// =============================================================================
// RFC2-72 — serverUrlSchemeLowercase
//
// RFC 3986 §3.1: "Although schemes are case-insensitive, the canonical form
// is lowercase and documents that specify schemes must do so with lowercase
// letters." `HTTP://api.example.com` parses but is non-canonical.
//
// Target: `servers[].url` string. Extract scheme prefix via regex; flag if
// scheme !== scheme.toLowerCase().
// =============================================================================

/**
 * RFC2-72 — Server-URL scheme should be lowercase.
 *
 * Source: RFC 3986 §3.1 (https://www.rfc-editor.org/rfc/rfc3986#section-3.1);
 *         rules-brainstorm.md RFC2-72 (P4).
 * Lens: 2 (Standards-Compliance)
 * Round: Welle D2
 */
export const serverUrlSchemeLowercase: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (typeof targetVal !== 'string' || targetVal.length === 0) return [];
  const match = targetVal.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
  if (!match) return [];
  const scheme = match[1];
  if (scheme === scheme.toLowerCase()) return [];
  return [
    {
      message:
        `Server URL scheme \`${scheme}\` contains uppercase characters; ` +
        `RFC 3986 §3.1 specifies the canonical form is lowercase. Use \`${scheme.toLowerCase()}\`.`,
    },
  ];
};

// =============================================================================
// RFC2-73 — serverUrlPathNormalized
//
// RFC 3986 §6 (Normalization and Comparison): paths should be syntax-based-
// normalized. Smells:
//   - `/./`        — current-segment indirection
//   - `/../`       — parent-segment traversal
//   - `//`         — empty segments
//   - trailing `/` on a non-root path (style smell, not strictly RFC, but
//     consistent with §6.2.2.3 usage-conventions and Stripe/Google AIP)
// =============================================================================

/**
 * RFC2-73 — Server-URL path should be normalized.
 *
 * Source: RFC 3986 §6 (https://www.rfc-editor.org/rfc/rfc3986#section-6);
 *         rules-brainstorm.md RFC2-73 (P4).
 * Lens: 2 (Standards-Compliance)
 * Round: Welle D2
 */
export const serverUrlPathNormalized: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (typeof targetVal !== 'string' || targetVal.length === 0) return [];
  const parts = rawUrlParts(targetVal);
  if (!parts) return [];
  const pathname = parts.path;
  const issues: string[] = [];
  if (pathname.includes('/./')) issues.push('contains `/./`');
  if (pathname.includes('/../')) issues.push('contains `/../`');
  if (pathname.includes('//')) issues.push('contains `//` (empty segment)');
  if (pathname.length > 1 && pathname.endsWith('/')) {
    issues.push('has trailing slash on non-root path');
  }
  if (issues.length === 0) return [];
  return [
    {
      message:
        `Server URL path \`${pathname}\` is not normalized: ${issues.join('; ')}. ` +
        `Apply RFC 3986 §6 syntax-based normalization.`,
    },
  ];
};

// =============================================================================
// RFC2-95 — retryAfterGrammar
//
// RFC 9110 §10.2.3: the `Retry-After` header value is either:
//   - HTTP-date (RFC 5322 §3.3 / RFC 9110 §5.6.7 IMF-fixdate)
//   - delta-seconds: a non-negative decimal integer
//
// Targets `Retry-After` header-objects (`responses.*.headers.Retry-After`).
// Inspects `example`, `examples[*].value`, and `schema.default` / `schema.example`
// when present. Flags any string that matches NEITHER grammar.
// =============================================================================

const HTTP_DATE_RE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const DELTA_SECONDS_RE = /^[0-9]+$/;

function isValidRetryAfterValue(v: unknown): boolean {
  if (typeof v === 'number') {
    return Number.isInteger(v) && v >= 0;
  }
  if (typeof v !== 'string') return false;
  const trimmed = v.trim();
  if (DELTA_SECONDS_RE.test(trimmed)) return true;
  if (HTTP_DATE_RE.test(trimmed)) return true;
  return false;
}

/**
 * RFC2-95 — Retry-After header value grammar.
 *
 * Source: RFC 9110 §10.2.3 (https://www.rfc-editor.org/rfc/rfc9110#name-retry-after);
 *         rules-brainstorm.md RFC2-95 (P4).
 * Lens: 2 (Standards-Compliance)
 * Round: Welle D2
 */
export const retryAfterGrammar: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  const header = getResolvedTarget<AnyObj>(targetVal);
  if (!header) return [];
  const candidates: Array<{ source: string; value: unknown }> = [];
  if ('example' in header) {
    candidates.push({ source: 'example', value: header.example });
  }
  if (isObject(header.examples)) {
    for (const [name, ex] of Object.entries(header.examples)) {
      if (isObject(ex) && 'value' in ex) {
        candidates.push({ source: `examples.${name}`, value: ex.value });
      }
    }
  }
  if (isObject(header.schema)) {
    if ('default' in header.schema) {
      candidates.push({ source: 'schema.default', value: header.schema.default });
    }
    if ('example' in header.schema) {
      candidates.push({ source: 'schema.example', value: header.schema.example });
    }
  }
  const findings: IFunctionResult[] = [];
  for (const { source, value } of candidates) {
    if (value === undefined || value === null) continue;
    if (!isValidRetryAfterValue(value)) {
      findings.push({
        message:
          `Retry-After ${source} value \`${String(value)}\` is neither a non-negative delta-seconds integer ` +
          `nor an IMF-fixdate HTTP-date per RFC 9110 §10.2.3.`,
      });
    }
  }
  return findings;
};

// =============================================================================
// RFC2-83 — defaultExampleStrictJson
//
// RFC 8259 §2: JSON values are strictly-defined. A common authoring smell is
// embedding a JSON-encoded string as a `default` or `example` when the
// schema-type is `object`/`array` — e.g. `default: '{"foo":1}'` (string-quoted)
// instead of `default: {foo: 1}` (native object).
//
// Heuristic: when the value is type `string` AND `JSON.parse` succeeds AND
// the parsed value is an object/array AND the schema-type is NOT `string`,
// flag as "stringified-JSON likely intended as native". Skip when schema
// is genuinely `string` (then JSON-encoded-string is legitimate payload).
// =============================================================================

/**
 * RFC2-83 — default/example uses stringified JSON instead of native value.
 *
 * Source: RFC 8259 §2 (https://www.rfc-editor.org/rfc/rfc8259#section-2);
 *         rules-brainstorm.md RFC2-83 (P5).
 * Lens: 2 (Standards-Compliance)
 * Round: Welle D2
 */
export const defaultExampleStrictJson: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  const schema = getResolvedTarget<AnyObj>(targetVal);
  if (!schema) return [];
  const declaredType = typeof schema.type === 'string' ? schema.type : null;
  if (declaredType === 'string') return [];
  const findings: IFunctionResult[] = [];
  for (const key of ['default', 'example'] as const) {
    if (!(key in schema)) continue;
    const v = schema[key];
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') {
        findings.push({
          message:
            `Schema \`${key}\` is a JSON-encoded string but parses as ${
              Array.isArray(parsed) ? 'array' : 'object'
            }; ` +
            `embed the value natively per RFC 8259 §2 (declared type \`${declaredType ?? 'unspecified'}\`).`,
        });
      }
    } catch {
      // Parse failed — not a stringified JSON object/array; ignore.
    }
  }
  return findings;
};

// =============================================================================
// RFC2-89 — contentEncodingOnOAS30
//
// JSON Schema `contentEncoding` and `contentMediaType` keywords were added
// in JSON Schema draft-07. OpenAPI 3.0.x adopts JSON Schema draft-04 (with
// modifications) — these keywords are not part of the 3.0.x specification
// and are silently ignored by tooling. OpenAPI 3.1 fully adopts JSON Schema
// 2020-12 and supports both keywords.
//
// Target: components.schemas walker / single schema with spec-version
// context. Flag if either keyword is present AND the parent document is
// OAS 3.0.x.
//
// The function expects to be wired with `field` resolution at schema-level
// AND access to root-level `openapi` field. Spectral does not pass document
// version directly; we rely on caller-context: when called at document target
// the doc is `targetVal`; otherwise the caller-rule must use document-target.
// =============================================================================

/**
 * RFC2-89 — contentEncoding / contentMediaType used on OAS 3.0.x.
 *
 * Source: OpenAPI 3.1 changelog (https://www.openapis.org/blog/2021/02/16/migrating-from-openapi-3-0-to-3-1-0);
 *         JSON Schema draft-07 release notes; rules-brainstorm.md RFC2-89 (P5).
 * Lens: 2 (Standards-Compliance), 3 (Evolution-Friction)
 * Round: Welle D2
 */
export const contentEncodingOnOAS30: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const openapi = typeof doc.openapi === 'string' ? doc.openapi : null;
  if (!openapi || !openapi.startsWith('3.0')) return [];

  const findings: IFunctionResult[] = [];

  function walkSchema(schema: unknown, pathTrail: string[]): void {
    if (!isObject(schema)) return;
    if ('contentEncoding' in schema) {
      findings.push({
        message:
          `Schema at \`${pathTrail.join('.')}\` uses \`contentEncoding\` — this JSON Schema draft-07+ keyword ` +
          `is not part of OpenAPI ${openapi} (added in 3.1). Tooling will ignore it.`,
      });
    }
    if ('contentMediaType' in schema) {
      findings.push({
        message:
          `Schema at \`${pathTrail.join('.')}\` uses \`contentMediaType\` — this JSON Schema draft-07+ keyword ` +
          `is not part of OpenAPI ${openapi} (added in 3.1). Tooling will ignore it.`,
      });
    }
    if (isObject(schema.properties)) {
      for (const [name, sub] of Object.entries(schema.properties)) {
        walkSchema(sub, [...pathTrail, 'properties', name]);
      }
    }
    if (isObject(schema.items)) {
      walkSchema(schema.items, [...pathTrail, 'items']);
    }
    for (const k of ['allOf', 'oneOf', 'anyOf'] as const) {
      const arr = schema[k];
      if (Array.isArray(arr)) {
        arr.forEach((sub, i) => walkSchema(sub, [...pathTrail, k, String(i)]));
      }
    }
  }

  const components = isObject(doc.components) ? doc.components : null;
  const schemas = components && isObject(components.schemas) ? components.schemas : null;
  if (schemas) {
    for (const [name, schema] of Object.entries(schemas)) {
      walkSchema(schema, ['components', 'schemas', name]);
    }
  }
  return findings;
};

// =============================================================================
// RFC2-103 — precondition428Awareness
//
// RFC 6585 §3 (428 Precondition Required) — when a resource exposes
// concurrency-control via ETag (GET responses include an `ETag` header),
// concurrent-write operations on that resource SHOULD return 428 when the
// client omits an If-Match precondition.
//
// Heuristic: walk all paths. For each path that has a GET response declaring
// an ETag header, examine its PUT/PATCH/DELETE operations on the SAME path.
// If any write-op lacks a `428` response declaration, emit an info-finding.
// =============================================================================

/**
 * RFC2-103 — write-op on ETag-resource without 428 awareness.
 *
 * Source: RFC 6585 §3 (https://www.rfc-editor.org/rfc/rfc6585#section-3);
 *         rules-brainstorm.md RFC2-103 (P5).
 * Lens: 2 (Standards-Compliance)
 * Round: Welle D2
 */
export const precondition428Awareness: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  const paths = getResolvedTarget<AnyObj>(targetVal);
  if (!paths) return [];
  const findings: IFunctionResult[] = [];

  function hasETagHeader(op: unknown): boolean {
    if (!isObject(op)) return false;
    const responses = isObject(op.responses) ? op.responses : null;
    if (!responses) return false;
    for (const [code, resp] of Object.entries(responses)) {
      if (!/^2\d\d$/.test(code)) continue;
      if (!isObject(resp)) continue;
      const headers = isObject(resp.headers) ? resp.headers : null;
      if (!headers) continue;
      for (const headerName of Object.keys(headers)) {
        if (headerName.toLowerCase() === 'etag') return true;
      }
    }
    return false;
  }

  function has428(op: unknown): boolean {
    if (!isObject(op)) return false;
    const responses = isObject(op.responses) ? op.responses : null;
    if (!responses) return false;
    return Object.keys(responses).includes('428');
  }

  for (const [pathStr, pathObj] of Object.entries(paths)) {
    if (!isObject(pathObj)) continue;
    if (!hasETagHeader(pathObj.get)) continue;
    for (const m of WRITE_METHODS) {
      const op = pathObj[m];
      if (!isObject(op)) continue;
      if (has428(op)) continue;
      findings.push({
        message:
          `Path \`${pathStr}\`: GET exposes ETag but ${m.toUpperCase()} declares no 428 response — ` +
          `clients omitting If-Match cannot detect missing-precondition per RFC 6585 §3.`,
      });
    }
  }
  return findings;
};

// =============================================================================
// RFC2-105 — status511Awareness
//
// RFC 6585 §6 (511 Network Authentication Required) — used by captive portals
// to indicate that the client must authenticate to gain network access. Most
// public APIs do not declare 511 (it's network-infrastructure responsibility).
// This is a positive-marker rule: emit a single info-finding when the spec
// declares ZERO 511 responses, as a discoverability prompt for captive-portal
// API authors. NOT a violation.
// =============================================================================

/**
 * RFC2-105 — 511 Network Authentication Required awareness (positive marker).
 *
 * Source: RFC 6585 §6 (https://www.rfc-editor.org/rfc/rfc6585#section-6);
 *         rules-brainstorm.md RFC2-105 (P5).
 * Lens: 2 (Standards-Compliance)
 * Round: Welle D2
 */
export const status511Awareness: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  const paths = getResolvedTarget<AnyObj>(targetVal);
  if (!paths) return [];
  let count = 0;
  for (const [, pathObj] of Object.entries(paths)) {
    if (!isObject(pathObj)) continue;
    for (const m of HTTP_METHODS) {
      const op = pathObj[m];
      if (!isObject(op)) continue;
      const responses = isObject(op.responses) ? op.responses : null;
      if (!responses) continue;
      if (Object.keys(responses).includes('511')) count++;
    }
  }
  if (count > 0) return [];
  return [
    {
      message:
        'No 511 (Network Authentication Required) responses declared anywhere in the spec. ' +
        'Per RFC 6585 §6 this is only relevant for captive-portal-fronted APIs; safely ignore otherwise.',
    },
  ];
};

// =============================================================================
// CL-60 — xInternalUsage
//
// `x-internal: true` is a vendor-extension convention (originated at Stripe;
// also used by OAI-tools) marking operations that should be hidden from
// public-docs renders. Pure information-only finding: enumerate operations
// carrying the marker so authors can audit visibility-state.
//
// Cap output at 10 examples to avoid overwhelming the lint-report on large
// specs that legitimately use many internal operations.
// =============================================================================

/**
 * CL-60 — Operations marked `x-internal: true` (positive marker).
 *
 * Source: Stripe public-API style + OAI-tools convention;
 *         rules-brainstorm.md CL-60 (P5).
 * Lens: 4 (Client-Friction), 3 (Evolution-Friction)
 * Round: Welle D2
 */
export const xInternalUsage: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  const paths = getResolvedTarget<AnyObj>(targetVal);
  if (!paths) return [];
  const examples: string[] = [];
  let total = 0;
  for (const [pathStr, pathObj] of Object.entries(paths)) {
    if (!isObject(pathObj)) continue;
    for (const m of HTTP_METHODS) {
      const op = pathObj[m];
      if (!isObject(op)) continue;
      if (op['x-internal'] === true) {
        total++;
        if (examples.length < 10) examples.push(`${m.toUpperCase()} ${pathStr}`);
      }
    }
  }
  if (total === 0) return [];
  const more = total > examples.length ? ` (+${total - examples.length} more)` : '';
  return [
    {
      message:
        `${total} operation${total === 1 ? '' : 's'} marked \`x-internal: true\`: ${examples.join(', ')}${more}. ` +
        `Confirm visibility-state matches publication intent.`,
    },
  ];
};

// =============================================================================
// F-18 — bloatedDescription
//
// Two related smells:
//   (a) any single description >1000 chars — readers (humans + LLM agents)
//       cannot extract intent from prose-walls
//   (b) operation-level repeated boilerplate — same ≥80-char prefix appearing
//       on >50% of operation-descriptions, often template-bleed from
//       documentation-generators
//
// Modes:
//   - When the target is a string (description-field), only check (a).
//   - When the target is the document root, also check (b) by collecting all
//     `paths.*.*.description` strings and finding common-prefix candidates.
// =============================================================================

const BLOATED_LENGTH_THRESHOLD = 1000;
const BOILERPLATE_PREFIX_MIN = 80;
const BOILERPLATE_FREQUENCY_THRESHOLD = 0.5;

function commonPrefix(a: string, b: string): string {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return a.slice(0, i);
}

/**
 * F-18 — Bloated / boilerplate descriptions.
 *
 * Source: rules-brainstorm.md F-18 (P5);
 *         Lens-4 doc-quality + Stripe API-Reference style.
 * Lens: 4 (Client-Friction)
 * Round: Welle D2
 */
export const bloatedDescription: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  // String-target: per-description length check.
  if (typeof targetVal === 'string') {
    if (targetVal.length <= BLOATED_LENGTH_THRESHOLD) return [];
    return [
      {
        message:
          `Description is ${targetVal.length} chars (threshold ${BLOATED_LENGTH_THRESHOLD}); ` +
          `dense prose blocks are hard for both humans and LLM agents to parse. Split or summarize.`,
      },
    ];
  }
  // Document-target: boilerplate-detection across operation descriptions.
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const paths = isObject(doc.paths) ? doc.paths : null;
  if (!paths) return [];
  const descriptions: string[] = [];
  for (const [, pathObj] of Object.entries(paths)) {
    if (!isObject(pathObj)) continue;
    for (const m of HTTP_METHODS) {
      const op = pathObj[m];
      if (!isObject(op)) continue;
      if (typeof op.description === 'string' && op.description.length >= BOILERPLATE_PREFIX_MIN) {
        descriptions.push(op.description);
      }
    }
  }
  if (descriptions.length < 4) return [];
  // Greedy common-prefix-frequency analysis: take first description's prefix,
  // count how many other descriptions share ≥80 chars of that prefix.
  const seed = descriptions[0];
  let bestPrefix = '';
  let bestCount = 0;
  for (let i = 1; i < descriptions.length; i++) {
    const cp = commonPrefix(seed, descriptions[i]);
    if (cp.length < BOILERPLATE_PREFIX_MIN) continue;
    let count = 0;
    for (const d of descriptions) {
      if (d.startsWith(cp)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestPrefix = cp;
    }
  }
  if (bestCount / descriptions.length <= BOILERPLATE_FREQUENCY_THRESHOLD) return [];
  const preview = bestPrefix.length > 60 ? `${bestPrefix.slice(0, 60)}…` : bestPrefix;
  return [
    {
      message:
        `${bestCount}/${descriptions.length} operation-descriptions share a ${bestPrefix.length}-char prefix \`${preview}\` ` +
        `— likely template-bleed. Replace boilerplate with operation-specific intent.`,
    },
  ];
};

// =============================================================================
// SC-20 — aipStandardFieldPresence
//
// Google AIPs (https://google.aip.dev/) — REST resources following AIP-style
// path-shapes (`/v{N}/{collection}/{id}` or `/{parent=...}/{collection}/{id}`)
// SHOULD include the standard fields:
//   - `name`         (required AIP-122 — resource identifier)
//   - `display_name` (recommended — human-readable label)
//   - `create_time`  (AIP-148 — RFC 3339 creation timestamp)
//   - `update_time`  (AIP-148 — RFC 3339 last-update timestamp)
//
// Off-by-default per spec — only relevant for APIs targeting AIP conformance.
// Detection: examine each path; if path matches AIP-style shape AND has a
// GET response with an inline schema, check the schema.properties keys.
// =============================================================================

const AIP_PATH_RE = /^\/v\d+\/[a-z][a-z0-9_-]*\/\{[a-zA-Z_][a-zA-Z0-9_]*\}\/?$/;
const AIP_REQUIRED_FIELDS = ['name'] as const;
const AIP_RECOMMENDED_FIELDS = ['display_name', 'create_time', 'update_time'] as const;

/**
 * SC-20 — AIP standard-field presence on AIP-style resource paths.
 *
 * Source: Google AIP-122 (https://google.aip.dev/122) + AIP-148 (https://google.aip.dev/148);
 *         rules-brainstorm.md SC-20 (P5).
 * Lens: 5 (Style-Coherence)
 * Round: Welle D2
 */
export const aipStandardFieldPresence: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  const paths = getResolvedTarget<AnyObj>(targetVal);
  if (!paths) return [];
  const findings: IFunctionResult[] = [];

  function getResourceProperties(op: unknown): Set<string> | null {
    if (!isObject(op)) return null;
    const responses = isObject(op.responses) ? op.responses : null;
    if (!responses) return null;
    for (const [code, resp] of Object.entries(responses)) {
      if (!/^2\d\d$/.test(code)) continue;
      if (!isObject(resp) || !isObject(resp.content)) continue;
      for (const [, mt] of Object.entries(resp.content)) {
        if (!isObject(mt) || !isObject(mt.schema)) continue;
        if (isObject(mt.schema.properties)) {
          return new Set(Object.keys(mt.schema.properties));
        }
      }
    }
    return null;
  }

  for (const [pathStr, pathObj] of Object.entries(paths)) {
    if (!AIP_PATH_RE.test(pathStr)) continue;
    if (!isObject(pathObj)) continue;
    const props = getResourceProperties(pathObj.get);
    if (!props) continue;
    const missingRequired = AIP_REQUIRED_FIELDS.filter((f) => !props.has(f));
    const missingRecommended = AIP_RECOMMENDED_FIELDS.filter((f) => !props.has(f));
    if (missingRequired.length === 0 && missingRecommended.length === 0) continue;
    const parts: string[] = [];
    if (missingRequired.length > 0) {
      parts.push(`required: ${missingRequired.map((f) => `\`${f}\``).join(', ')}`);
    }
    if (missingRecommended.length > 0) {
      parts.push(`recommended: ${missingRecommended.map((f) => `\`${f}\``).join(', ')}`);
    }
    findings.push({
      message:
        `AIP-style path \`${pathStr}\` resource-schema missing standard fields — ${parts.join('; ')}. ` +
        `Per Google AIP-122 + AIP-148.`,
    });
  }
  return findings;
};

// =============================================================================
// Welle Arch+ A3 — FUNCTION_METADATA registry for niche-functions callables.
// =============================================================================

import type { FunctionMetadata } from './_metadata.js';

export const FUNCTION_METADATA: Record<string, FunctionMetadata> = {
  'server-url-host-lowercase': {
    name: 'server-url-host-lowercase',
    patternIds: ['RFC2-71'],
    lens: 'standards-compliance',
    perfClass: 'O(1)',
    description:
      'Server-URL host should be lowercase per RFC 3986 §3.2.2 — mixed-case hostnames break naive string comparisons.',
  },
  'server-url-scheme-lowercase': {
    name: 'server-url-scheme-lowercase',
    patternIds: ['RFC2-72'],
    lens: 'standards-compliance',
    perfClass: 'O(1)',
    description:
      'Server-URL scheme should be lowercase per RFC 3986 §3.1 canonical form — `HTTP://` parses but is non-canonical.',
  },
  'server-url-path-normalized': {
    name: 'server-url-path-normalized',
    patternIds: ['RFC2-73'],
    lens: 'standards-compliance',
    perfClass: 'O(1)',
    description:
      'Server-URL path should be RFC 3986 §6 normalized — no `/./`, `/../`, `//` empty segments, no trailing slash on non-root.',
  },
  'retry-after-grammar': {
    name: 'retry-after-grammar',
    patternIds: ['RFC2-95'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'Retry-After header value must be either non-negative delta-seconds integer or IMF-fixdate HTTP-date per RFC 9110 §10.2.3.',
  },
  'default-example-strict-json': {
    name: 'default-example-strict-json',
    patternIds: ['RFC2-83'],
    lens: 'standards-compliance',
    perfClass: 'O(1)',
    description:
      'Schema default/example uses stringified JSON instead of native value — embed natively per RFC 8259 §2.',
  },
  'content-encoding-on-oas30': {
    name: 'content-encoding-on-oas30',
    patternIds: ['RFC2-89'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'contentEncoding/contentMediaType keywords are JSON Schema draft-07+; on OpenAPI 3.0.x they are silently ignored.',
  },
  'precondition-428-awareness': {
    name: 'precondition-428-awareness',
    patternIds: ['RFC2-103'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'Write-ops on ETag-bearing resources should declare 428 Precondition Required per RFC 6585 §3.',
  },
  'status-511-awareness': {
    name: 'status-511-awareness',
    patternIds: ['RFC2-105'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'Positive-marker info-finding when no 511 Network Authentication Required declared — only relevant for captive-portal APIs (RFC 6585 §6).',
  },
  'x-internal-usage': {
    name: 'x-internal-usage',
    patternIds: ['CL-60'],
    lens: 'client-friction',
    perfClass: 'O(n)',
    description:
      'Enumerate operations marked `x-internal: true` (Stripe/OAI vendor-extension); positive marker for visibility-audit.',
  },
  'bloated-description': {
    name: 'bloated-description',
    patternIds: ['F-18'],
    lens: 'client-friction',
    perfClass: 'O(n*m)',
    description:
      'Description >1000 chars (per-string mode) OR ≥80-char common prefix on >50% of operation-descriptions (boilerplate mode).',
  },
  'aip-standard-field-presence': {
    name: 'aip-standard-field-presence',
    patternIds: ['SC-20'],
    lens: 'style-coherence',
    perfClass: 'O(n)',
    description:
      'AIP-style paths (`/v{N}/{collection}/{id}`) should include `name` (required) + `display_name`/`create_time`/`update_time` (recommended) per AIP-122/148.',
  },
};
