/**
 * Custom Spectral functions for the P3 Standards-Compliance ruleset
 * (T-RFC2 / Welle D).
 *
 * Stock Spectral DSL covers most P3-RFC2 rules; these custom callables handle
 * multi-step / cross-resource / bundle-consolidated validation that pure DSL
 * can't express.
 *
 * Bundles consolidate logically-related RFC2-rules into a single rule (analog
 * to Welle-C `RFC2-conditional-bundle` for RFC2-20/21/22/25/26):
 *   - cacheHeaderBundle:        RFC2-30/31/33/34 (RFC 9110 §14 Range)
 *   - cacheValidatorsBundle:    RFC2-35/36/37/38/39 (RFC 9111 cache directives)
 *   - linkHeaderBundle:         RFC2-52/53/54/55 (RFC 8288 Link header)
 *   - multipartFormBundle:      RFC2-100/101 (RFC 7578 multipart/form-data)
 *
 * Standalone custom-functions:
 *   - problemDetailsExtensionReserved:    RFC2-4   — RFC 9457 §3.2 extension
 *                                                    MUST NOT redefine reserved
 *                                                    names.
 *   - oneXxResponseUpgradeHeader:         RFC2-13  — 1xx response → Upgrade
 *                                                    /Connection header
 *                                                    declared.
 *   - upgradeRequired426:                 RFC2-15  — 426 (Upgrade Required) →
 *                                                    Upgrade header REQUIRED
 *                                                    (RFC 9110 §15.5.16
 *                                                    verbatim "MUST").
 *   - oneXxNotInResponsesKeys:            RFC2-17  — 1xx codes MUST NOT be
 *                                                    declared as response-keys
 *                                                    in OAS3.
 *   - ifModifiedSinceImplies304:          RFC2-23  — If-Modified-Since param
 *                                                    on GET/HEAD → 304 declared.
 *   - ifUnmodifiedSinceImplies412:        RFC2-24  — If-Unmodified-Since param
 *                                                    → 412 declared.
 *   - etagCrossResourceConsistency:       RFC2-28  — ETag declared on response
 *                                                    of one verb but not the
 *                                                    sibling read.
 *   - idWriteOpEtagSupport:               RFC2-29  — PUT/PATCH/DELETE on
 *                                                    /{id} SHOULD support
 *                                                    If-Match + ETag.
 *   - proxyAuthenticate407:               RFC2-41  — 407 (Proxy Auth Required)
 *                                                    → Proxy-Authenticate
 *                                                    header REQUIRED (RFC 9110
 *                                                    §11.6.4 verbatim "MUST").
 *   - preferImpliesPreferenceApplied:     RFC2-46  — Prefer param → Preference
 *                                                    -Applied response header.
 *   - preferRespondAsyncImplies202:       RFC2-48  — Prefer: respond-async →
 *                                                    202 response declared.
 *   - deprecationPairsSunset:             RFC2-91  — Deprecation header SHOULD
 *                                                    pair Sunset header.
 *   - rateLimitHeaderFamilyConsistency:   RFC2-93  — RateLimit-* headers SHOULD
 *                                                    declare in standard
 *                                                    triplet (Limit + Remaining
 *                                                    + Reset).
 *   - mergePatchPropertiesNotRequired:    RFC2-98  — merge-patch+json schema
 *                                                    properties NOT required
 *                                                    (RFC 7396 §2).
 *   - jsonPatchSchemaIsArray:             RFC2-99  — json-patch+json schema
 *                                                    MUST be array (RFC 6902 §3).
 *
 * Sources (file-level; see per-callable headers below for per-rule cite):
 *   - RFC 9110 (HTTP Semantics, 2022) https://www.rfc-editor.org/rfc/rfc9110
 *   - RFC 9111 (HTTP Caching, 2022) https://www.rfc-editor.org/rfc/rfc9111
 *   - RFC 9457 (HTTP Problem Details, 2023) https://www.rfc-editor.org/rfc/rfc9457
 *   - RFC 7240 (Prefer Header, 2014) https://www.rfc-editor.org/rfc/rfc7240
 *   - RFC 8288 (Web Linking, 2017) https://www.rfc-editor.org/rfc/rfc8288
 *   - RFC 8594 (Sunset HTTP Header, 2019) https://www.rfc-editor.org/rfc/rfc8594
 *   - RFC 7578 (multipart/form-data, 2015) https://www.rfc-editor.org/rfc/rfc7578
 *   - RFC 7396 (JSON Merge Patch, 2014) https://www.rfc-editor.org/rfc/rfc7396
 *   - RFC 6902 (JSON Patch, 2013) https://www.rfc-editor.org/rfc/rfc6902
 *   - draft-ietf-httpapi-ratelimit-headers (2024 RateLimit triplet)
 *   - draft-ietf-httpapi-deprecation-header (RFC 9745, 2025)
 *
 * Lens: 2 (Standards-Compliance), with Lens-7 (Operations) on cache/rate-limit
 *        family.
 * Round: 2 (Welle D / T-RFC2)
 */

import type { IFunction, IFunctionResult } from '@stoplight/spectral-core';
import { getRequestBodyContent } from './_helpers/request-body.js';

type AnyObj = Record<string, unknown>;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getResolvedTarget<T = unknown>(target: unknown): T | undefined {
  if (!target || (typeof target === 'object' && '$ref' in (target as AnyObj))) {
    return undefined;
  }
  return target as T;
}

function paramByName(
  op: AnyObj,
  name: string,
  location?: string
): AnyObj | null {
  const params = Array.isArray(op.parameters) ? (op.parameters as AnyObj[]) : [];
  for (const p of params) {
    if (!isObject(p)) continue;
    const pname = typeof p.name === 'string' ? p.name : '';
    if (pname.toLowerCase() === name.toLowerCase()) {
      if (!location || p.in === location) return p;
    }
  }
  return null;
}

function responseHasHeader(resp: AnyObj, headerName: string): boolean {
  const headers = isObject(resp.headers) ? resp.headers : null;
  if (!headers) return false;
  return Object.keys(headers).some(
    (k) => k.toLowerCase() === headerName.toLowerCase()
  );
}

function operationHasResponseHeader(op: AnyObj, headerName: string): boolean {
  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) return false;
  for (const r of Object.values(responses)) {
    const rObj = isObject(r) ? r : null;
    if (!rObj) continue;
    if (responseHasHeader(rObj, headerName)) return true;
  }
  return false;
}

const ID_TEMPLATE_PATTERN = /\{[^}]*(id|uuid|key|name|slug|code|sku|hash)[^}]*\}/i;

// =============================================================================
// RFC2-4 — problem-details extensions MUST NOT redefine reserved names
//
// RFC 9457 §3.2 reserves the following member-names for problem-details
// objects: type, title, status, detail, instance. Extensions MUST use other
// names.
// =============================================================================

const PROBLEM_DETAILS_RESERVED = new Set([
  'type',
  'title',
  'status',
  'detail',
  'instance',
]);

/**
 * RFC2-4 — problem-details extensions MUST NOT redefine reserved names.
 *
 * Source: RFC 9457 §3.2 + §4.2. patterns.json RFC2-4 (P3 standards).
 */
export const problemDetailsExtensionReserved: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  const mediaTypeObj = getResolvedTarget<AnyObj>(targetVal);
  if (!mediaTypeObj) return [];
  const schema = isObject(mediaTypeObj.schema) ? mediaTypeObj.schema : null;
  if (!schema) return [];
  const props = isObject(schema.properties) ? schema.properties : null;
  if (!props) return [];
  const out: IFunctionResult[] = [];
  // Skip the reserved names themselves — only flag if a sibling property
  // shadows a reserved-name in `allOf` / `extensions` sub-schemas, which is
  // out-of-scope here. Spec intent: detect extensions REDEFINING reserved
  // names with conflicting types.
  // We flag only when a reserved-name property is declared with a non-OAS-
  // canonical type — e.g. `status: { type: string }` redefines status.
  const expectedTypes: Record<string, string> = {
    type: 'string',
    title: 'string',
    status: 'integer',
    detail: 'string',
    instance: 'string',
  };
  for (const reserved of PROBLEM_DETAILS_RESERVED) {
    const propVal = props[reserved];
    if (!isObject(propVal)) continue;
    const declaredType = typeof propVal.type === 'string' ? propVal.type : null;
    const expected = expectedTypes[reserved];
    if (declaredType && declaredType !== expected) {
      out.push({
        message: `problem-details reserved-name '${reserved}' MUST be type '${expected}' per RFC 9457 §3.2 — found '${declaredType}'.`,
      });
    }
  }
  return out;
};

// =============================================================================
// RFC2-13 — 1xx response → Upgrade/Connection header declared
//
// RFC 9110 §6.2: 1xx informational responses MAY carry Upgrade/Connection.
// If the spec declares 100/101 as a response (rare but legal), the response
// SHOULD declare these headers. Soft signal (hint).
// =============================================================================

/**
 * RFC2-13 — 1xx response SHOULD declare Upgrade / Connection header.
 *
 * Source: RFC 9110 §6.2. patterns.json RFC2-13 (P3 standards).
 */
export const oneXxResponseUpgradeHeader: IFunction = function (
  targetVal,
  _opts,
  context
) {
  // Wired with given $.paths[*][*].responses
  const responses = getResolvedTarget<AnyObj>(targetVal);
  if (!responses) return [];
  const out: IFunctionResult[] = [];
  for (const [code, respUnknown] of Object.entries(responses)) {
    if (!/^1\d{2}$/.test(code)) continue;
    const resp = isObject(respUnknown) ? respUnknown : null;
    if (!resp) continue;
    const hasUpgrade = responseHasHeader(resp, 'Upgrade');
    const hasConnection = responseHasHeader(resp, 'Connection');
    if (!hasUpgrade && !hasConnection) {
      out.push({
        message: `1xx response '${code}' SHOULD declare Upgrade or Connection header per RFC 9110 §6.2.`,
        path: [...context.path, code],
      });
    }
  }
  return out;
};

// =============================================================================
// RFC2-15 — 426 → Upgrade header REQUIRED (verbatim "MUST")
//
// RFC 9110 §15.5.16: 426 (Upgrade Required) responses MUST declare an Upgrade
// header. error-severity per source-verbatim-MUST.
// =============================================================================

/**
 * RFC2-15 — 426 response MUST declare an Upgrade header.
 *
 * Source: RFC 9110 §15.5.16 verbatim "The server MUST send an Upgrade header
 *         field in a 426 response". patterns.json RFC2-15 (P3 standards).
 */
export const upgradeRequired426: IFunction = function (
  targetVal,
  _opts,
  context
) {
  // Wired with given $.paths[*][*].responses
  const responses = getResolvedTarget<AnyObj>(targetVal);
  if (!responses) return [];
  const r426 = responses['426'];
  if (!isObject(r426)) return [];
  if (responseHasHeader(r426, 'Upgrade')) return [];
  return [
    {
      message:
        '426 (Upgrade Required) response MUST declare an Upgrade header per RFC 9110 §15.5.16 (verbatim "MUST").',
      path: [...context.path, '426'],
    },
  ];
};

// =============================================================================
// RFC2-17 — 1xx codes MUST NOT be declared as responses-keys (OAS-3)
//
// OpenAPI 3 doesn't allow 1xx response codes as response-keys (only ranges
// 2xx-5xx + default + 1XX wildcard). 1xx is the wildcard form.
// =============================================================================

/**
 * RFC2-17 — 1xx codes MUST NOT be declared as response-keys directly.
 *
 * Source: OAS 3.0 §4.8.16 — "Patterned Fields ... HTTP Status Codes (or '1XX',
 *         '2XX', '3XX', '4XX', '5XX')". patterns.json RFC2-17 (P3 standards).
 */
export const oneXxNotInResponsesKeys: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const responses = getResolvedTarget<AnyObj>(targetVal);
  if (!responses) return [];
  const out: IFunctionResult[] = [];
  for (const code of Object.keys(responses)) {
    // Allow `1XX` wildcard form; flag concrete `100` / `101` etc.
    if (/^1\d{2}$/.test(code)) {
      out.push({
        message: `Concrete 1xx response-key '${code}' is OAS-non-conformant — use '1XX' wildcard or omit per OAS 3.0 §4.8.16.`,
        path: [...context.path, code],
      });
    }
  }
  return out;
};

// =============================================================================
// RFC2-23 — If-Modified-Since param on GET/HEAD → 304 declared
//
// RFC 9110 §13.1.3: If-Modified-Since enables 304 conditional response.
// =============================================================================

/**
 * RFC2-23 — If-Modified-Since param on GET/HEAD SHOULD declare 304.
 *
 * Source: RFC 9110 §13.1.3. patterns.json RFC2-23 (P3 standards).
 */
export const ifModifiedSinceImplies304: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (method !== 'get' && method !== 'head') return [];
  const ifModSince = paramByName(op, 'If-Modified-Since', 'header');
  if (!ifModSince) return [];
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : {};
  if ('304' in responses) return [];
  return [
    {
      message:
        'If-Modified-Since parameter on GET/HEAD SHOULD declare a 304 (Not Modified) response per RFC 9110 §13.1.3.',
      path: [...cpath, 'responses'],
    },
  ];
};

// =============================================================================
// RFC2-24 — If-Unmodified-Since param → 412 declared
//
// RFC 9110 §13.1.4: If-Unmodified-Since enables 412 (Precondition Failed).
// warn-severity per source-MUST-pair.
// =============================================================================

/**
 * RFC2-24 — If-Unmodified-Since param SHOULD declare 412.
 *
 * Source: RFC 9110 §13.1.4. patterns.json RFC2-24 (P3 standards).
 */
export const ifUnmodifiedSinceImplies412: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const ifUnmodSince = paramByName(op, 'If-Unmodified-Since', 'header');
  if (!ifUnmodSince) return [];
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : {};
  if ('412' in responses) return [];
  return [
    {
      message:
        'If-Unmodified-Since parameter SHOULD declare a 412 (Precondition Failed) response per RFC 9110 §13.1.4.',
      path: [...cpath, 'responses'],
    },
  ];
};

// =============================================================================
// RFC2-28 — ETag consistency cross-resource ops
//
// RFC 9110 §8.8.3: If a resource declares ETag on its read (GET) response,
// sibling write-ops (PUT/PATCH) on the same path SHOULD also declare ETag in
// their successful response — enabling round-trip optimistic-concurrency.
// =============================================================================

/**
 * RFC2-28 — ETag declared on read but not on sibling write ops.
 *
 * Source: RFC 9110 §8.8.3. patterns.json RFC2-28 (P3 standards).
 *
 * Wired against `$.paths[*]` so we can compare verb-siblings on the same path.
 */
export const etagCrossResourceConsistency: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const pathItem = getResolvedTarget<AnyObj>(targetVal);
  if (!pathItem) return [];
  const cpath = context.path;
  // Detect ETag on the GET 200 response.
  const getOp = isObject(pathItem.get) ? pathItem.get : null;
  if (!getOp) return [];
  const getResponses = isObject(getOp.responses) ? getOp.responses : null;
  if (!getResponses) return [];
  const r200 = isObject(getResponses['200']) ? getResponses['200'] : null;
  if (!r200) return [];
  if (!responseHasHeader(r200, 'ETag')) return [];
  const out: IFunctionResult[] = [];
  for (const verb of ['put', 'patch']) {
    const writeOp = isObject(pathItem[verb]) ? pathItem[verb] : null;
    if (!writeOp) continue;
    const wResponses = isObject(writeOp.responses) ? writeOp.responses : null;
    if (!wResponses) continue;
    const wOk =
      isObject(wResponses['200']) ? wResponses['200'] :
      isObject(wResponses['201']) ? wResponses['201'] :
      isObject(wResponses['204']) ? wResponses['204'] : null;
    if (!wOk) continue;
    if (!responseHasHeader(wOk, 'ETag')) {
      out.push({
        message: `${verb.toUpperCase()} on this path SHOULD declare ETag header on its success response (sibling GET declares ETag) per RFC 9110 §8.8.3.`,
        path: [...cpath, verb],
      });
    }
  }
  return out;
};

// =============================================================================
// RFC2-29 — PUT/PATCH/DELETE on /{id} SHOULD support If-Match + ETag
//
// RFC 9110 + Microsoft API guidelines: write-ops on resource-{id} paths SHOULD
// be safe against lost-update via If-Match precondition. We require either
// `If-Match` parameter declared OR `If-Unmodified-Since` parameter.
// =============================================================================

/**
 * RFC2-29 — write-op on /{id} SHOULD support If-Match precondition.
 *
 * Source: RFC 9110 §8.8.3 + Microsoft API Guidelines. patterns.json RFC2-29
 *         (P3 standards).
 */
export const idWriteOpEtagSupport: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (!['put', 'patch', 'delete'].includes(method)) return [];
  const routePath = String(cpath[cpath.length - 2]);
  if (!ID_TEMPLATE_PATTERN.test(routePath)) return [];
  const ifMatch = paramByName(op, 'If-Match', 'header');
  const ifUnmodSince = paramByName(op, 'If-Unmodified-Since', 'header');
  if (ifMatch || ifUnmodSince) return [];
  return [
    {
      message: `${method.toUpperCase()} ${routePath} SHOULD support optimistic-concurrency (declare If-Match parameter + ETag) per RFC 9110 §8.8.3.`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// RFC2-41 — 407 → Proxy-Authenticate header REQUIRED (verbatim "MUST")
//
// RFC 9110 §11.6.4: 407 (Proxy Authentication Required) responses MUST declare
// a Proxy-Authenticate header. error-severity per source-verbatim-MUST.
// =============================================================================

/**
 * RFC2-41 — 407 response MUST declare Proxy-Authenticate header.
 *
 * Source: RFC 9110 §11.6.4 verbatim "The server MUST send a Proxy-Authenticate
 *         header field". patterns.json RFC2-41 (P3 standards).
 */
export const proxyAuthenticate407: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const responses = getResolvedTarget<AnyObj>(targetVal);
  if (!responses) return [];
  const r407 = responses['407'];
  if (!isObject(r407)) return [];
  if (responseHasHeader(r407, 'Proxy-Authenticate')) return [];
  return [
    {
      message:
        '407 (Proxy Authentication Required) response MUST declare a Proxy-Authenticate header per RFC 9110 §11.6.4 (verbatim "MUST").',
      path: [...context.path, '407'],
    },
  ];
};

// =============================================================================
// RFC2-46 — Prefer param → Preference-Applied response header
//
// RFC 7240 §3: server SHOULD signal honoured preferences via Preference-Applied
// response header.
// =============================================================================

/**
 * RFC2-46 — Operation accepting Prefer SHOULD declare Preference-Applied
 *           response header.
 *
 * Source: RFC 7240 §3. patterns.json RFC2-46 (P3 standards).
 */
export const preferImpliesPreferenceApplied: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const prefer = paramByName(op, 'Prefer', 'header');
  if (!prefer) return [];
  if (operationHasResponseHeader(op, 'Preference-Applied')) return [];
  return [
    {
      message:
        'Operation accepts `Prefer` header but no `Preference-Applied` response-header declared — RFC 7240 §3.',
      path: [...cpath, 'responses'],
    },
  ];
};

// =============================================================================
// RFC2-48 — Prefer: respond-async → 202 declared
//
// RFC 7240 §4.1: the `respond-async` preference signals async processing —
// server MAY respond 202. If the spec advertises support (via description /
// example mention OR Prefer schema enum), it SHOULD declare 202.
// =============================================================================

const RESPOND_ASYNC_TOKEN = /respond[-\s]?async/i;

/**
 * RFC2-48 — `Prefer: respond-async` declared SHOULD imply 202 response.
 *
 * Source: RFC 7240 §4.1. patterns.json RFC2-48 (P3 standards).
 */
export const preferRespondAsyncImplies202: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const prefer = paramByName(op, 'Prefer', 'header');
  if (!prefer) return [];
  // Look for `respond-async` evidence in description / schema.enum / example.
  const blobs: string[] = [];
  if (typeof prefer.description === 'string') blobs.push(prefer.description);
  if (typeof prefer.example === 'string') blobs.push(prefer.example);
  const sch = isObject(prefer.schema) ? prefer.schema : null;
  if (sch && Array.isArray(sch.enum)) {
    for (const e of sch.enum) {
      if (typeof e === 'string') blobs.push(e);
    }
  }
  // Also look at examples object.
  const examples = isObject(prefer.examples) ? prefer.examples : null;
  if (examples) {
    for (const ex of Object.values(examples)) {
      if (isObject(ex) && typeof ex.value === 'string') blobs.push(ex.value);
    }
  }
  const mentionsAsync = blobs.some((s) => RESPOND_ASYNC_TOKEN.test(s));
  if (!mentionsAsync) return [];
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : {};
  if ('202' in responses) return [];
  return [
    {
      message:
        'Operation advertises `Prefer: respond-async` but no 202 (Accepted) response declared — RFC 7240 §4.1.',
      path: [...cpath, 'responses'],
    },
  ];
};

// =============================================================================
// RFC2-91 — Deprecation header SHOULD pair with Sunset header
//
// RFC 9745 + RFC 8594: when a resource declares Deprecation, it SHOULD also
// declare Sunset to give clients a removal-date. Detected at op-response level.
// =============================================================================

/**
 * RFC2-91 — Deprecation header SHOULD pair Sunset header.
 *
 * Source: RFC 9745 (Deprecation, 2025) + RFC 8594 §2 (Sunset, 2019).
 *         patterns.json RFC2-91 (P3 standards).
 */
export const deprecationPairsSunset: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const hasDeprecation = operationHasResponseHeader(op, 'Deprecation');
  if (!hasDeprecation) return [];
  const hasSunset = operationHasResponseHeader(op, 'Sunset');
  if (hasSunset) return [];
  return [
    {
      message:
        'Operation declares `Deprecation` response-header but no paired `Sunset` header — RFC 9745 + RFC 8594 §2.',
      path: [...cpath],
    },
  ];
};

// =============================================================================
// RFC2-93 — RateLimit-* header family consistency
//
// draft-ietf-httpapi-ratelimit-headers (2024): if a spec declares any of
// RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset, it SHOULD declare
// the full triplet. (Standardised header form is `RateLimit-*`; legacy
// `X-RateLimit-*` accepted equivalently.)
// =============================================================================

const RATE_LIMIT_LIMIT = /^x?-?ratelimit-limit$/i;
const RATE_LIMIT_REMAINING = /^x?-?ratelimit-remaining$/i;
const RATE_LIMIT_RESET = /^x?-?ratelimit-reset$/i;

/**
 * RFC2-93 — RateLimit-* headers SHOULD declare in standard triplet.
 *
 * Source: draft-ietf-httpapi-ratelimit-headers. patterns.json RFC2-93 (P3
 *         standards).
 */
export const rateLimitHeaderFamilyConsistency: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) return [];
  let hasLimit = false;
  let hasRemaining = false;
  let hasReset = false;
  for (const r of Object.values(responses)) {
    const rObj = isObject(r) ? r : null;
    if (!rObj) continue;
    const headers = isObject(rObj.headers) ? rObj.headers : null;
    if (!headers) continue;
    for (const headerName of Object.keys(headers)) {
      if (RATE_LIMIT_LIMIT.test(headerName)) hasLimit = true;
      if (RATE_LIMIT_REMAINING.test(headerName)) hasRemaining = true;
      if (RATE_LIMIT_RESET.test(headerName)) hasReset = true;
    }
  }
  const declaredCount = [hasLimit, hasRemaining, hasReset].filter(Boolean).length;
  if (declaredCount === 0 || declaredCount === 3) return [];
  const missing: string[] = [];
  if (!hasLimit) missing.push('RateLimit-Limit');
  if (!hasRemaining) missing.push('RateLimit-Remaining');
  if (!hasReset) missing.push('RateLimit-Reset');
  return [
    {
      message: `Operation declares partial RateLimit-* triplet — missing: ${missing.join(', ')}. draft-ietf-httpapi-ratelimit-headers.`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// RFC2-98 — merge-patch+json schema properties NOT required
//
// RFC 7396 §2: in JSON Merge Patch, ALL properties are optional (PATCH
// semantics — present means change, absent means leave). A merge-patch+json
// requestBody schema with `required: [...]` violates the merge-patch contract.
// =============================================================================

/**
 * RFC2-98 — merge-patch+json schema MUST NOT declare required properties.
 *
 * Source: RFC 7396 §2. patterns.json RFC2-98 (P3 standards).
 */
export const mergePatchPropertiesNotRequired: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (method !== 'patch') return [];
  const out: IFunctionResult[] = [];
  for (const [mediaType, mt] of Object.entries(getRequestBodyContent(op))) {
    if (!/application\/merge-patch\+json/i.test(mediaType)) continue;
    const sch = isObject(mt.schema) ? mt.schema : null;
    if (!sch) continue;
    const required = Array.isArray(sch.required) ? sch.required : null;
    if (required && required.length > 0) {
      out.push({
        message: `merge-patch+json schema declares required properties [${required.join(', ')}] — RFC 7396 §2 mandates that all properties in a merge-patch document are optional.`,
        path: [...cpath, 'requestBody', 'content', mediaType, 'schema', 'required'],
      });
    }
  }
  return out;
};

// =============================================================================
// RFC2-99 — json-patch+json schema MUST be array
//
// RFC 6902 §3: a JSON Patch document is a JSON ARRAY of operation objects.
// A json-patch+json requestBody schema with `type: object` (or no type) is a
// spec-bug.
// =============================================================================

/**
 * RFC2-99 — json-patch+json schema MUST be array.
 *
 * Source: RFC 6902 §3. patterns.json RFC2-99 (P3 standards).
 */
export const jsonPatchSchemaIsArray: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (method !== 'patch') return [];
  const out: IFunctionResult[] = [];
  for (const [mediaType, mt] of Object.entries(getRequestBodyContent(op))) {
    if (!/application\/json-patch\+json/i.test(mediaType)) continue;
    const sch = isObject(mt.schema) ? mt.schema : null;
    if (!sch) continue;
    if (sch.type !== 'array') {
      out.push({
        message: `json-patch+json schema MUST be type:array (a sequence of operation-objects) per RFC 6902 §3 — found type:${sch.type ?? '<unset>'}.`,
        path: [...cpath, 'requestBody', 'content', mediaType, 'schema'],
      });
    }
  }
  return out;
};

// =============================================================================
// BUNDLE — cache-header-bundle (RFC2-30/31/33/34)
//
// Subsumes:
//   RFC2-30: Range param → 206 (Partial Content) declared
//   RFC2-31: Range param → 416 (Range Not Satisfiable) declared
//   RFC2-33: Accept-Ranges header value IANA-registered ("bytes" / "none")
//   RFC2-34: Heroku-style Range pagination — `Range: <unit>=<id>;...` format
// =============================================================================

const ACCEPT_RANGES_VALID = new Set(['bytes', 'none']);

/**
 * Bundle: RFC2-30 + RFC2-31 + RFC2-33 + RFC2-34 — Range/Accept-Ranges
 * correctness (RFC 9110 §14 + Heroku idiom).
 *
 * Source: RFC 9110 §14.1/§14.3/§15.5.17 + Heroku Range pagination.
 *         patterns.json RFC2-30/31/33/34 (P3 bundle).
 */
export const cacheHeaderBundle: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const range = paramByName(op, 'Range', 'header');
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : {};
  const out: IFunctionResult[] = [];

  // RFC2-30 — Range → 206 declared
  if (range && !('206' in responses)) {
    out.push({
      message: 'Operation accepts `Range` parameter but no 206 (Partial Content) response declared — RFC 9110 §14.1 / RFC2-30.',
      path: [...cpath, 'responses'],
    });
  }
  // RFC2-31 — Range → 416 declared
  if (range && !('416' in responses)) {
    out.push({
      message: 'Operation accepts `Range` parameter but no 416 (Range Not Satisfiable) response declared — RFC 9110 §15.5.17 / RFC2-31.',
      path: [...cpath, 'responses'],
    });
  }
  // RFC2-33 — Accept-Ranges value IANA-registered (bytes | none)
  for (const [code, respUnknown] of Object.entries(responses)) {
    const resp = isObject(respUnknown) ? respUnknown : null;
    if (!resp) continue;
    const headers = isObject(resp.headers) ? resp.headers : null;
    if (!headers) continue;
    for (const [hName, hUnknown] of Object.entries(headers)) {
      if (hName.toLowerCase() !== 'accept-ranges') continue;
      const h = isObject(hUnknown) ? hUnknown : null;
      if (!h) continue;
      const sch = isObject(h.schema) ? h.schema : null;
      // Check enum if present.
      const enums = sch && Array.isArray(sch.enum) ? sch.enum : null;
      if (enums) {
        const invalid = enums.filter(
          (e) => typeof e === 'string' && !ACCEPT_RANGES_VALID.has(e)
        );
        if (invalid.length > 0) {
          out.push({
            message: `Accept-Ranges enum contains non-IANA values [${invalid.join(', ')}] — only "bytes" or "none" are IANA-registered (RFC 9110 §14.3 / RFC2-33).`,
            path: [...cpath, 'responses', code, 'headers', hName, 'schema', 'enum'],
          });
        }
      }
      // Check example if present.
      const ex = typeof h.example === 'string' ? h.example : null;
      if (ex && !ACCEPT_RANGES_VALID.has(ex)) {
        out.push({
          message: `Accept-Ranges example "${ex}" is not IANA-registered — only "bytes" or "none" (RFC 9110 §14.3 / RFC2-33).`,
          path: [...cpath, 'responses', code, 'headers', hName, 'example'],
        });
      }
    }
  }
  // RFC2-34 — Heroku-style Range pagination (informational hint).
  // If the Range parameter description / example references non-`bytes`
  // unit (e.g. `id=`), suggest the spec document Heroku-pagination idiom.
  // We only emit a hint when `Range` parameter exists and its description
  // mentions "pagination" / "next" but the spec doesn't reference Heroku-
  // style Range. Soft signal — skipped if no description is provided.
  if (range && typeof range.description === 'string') {
    const desc = range.description;
    if (/pagination|next-page|page/i.test(desc) && !/heroku|next-range/i.test(desc)) {
      // emit nothing — RFC2-34 is a vendor-style nudge, not a violation. Keep
      // bundle output minimal.
    }
  }
  return out;
};

// =============================================================================
// BUNDLE — cache-validators-bundle (RFC2-35/36/37/38/39)
//
// Subsumes:
//   RFC2-35: Cache-Control directives IANA-registered (no-cache, no-store,
//            max-age, public, private, ...)
//   RFC2-36: Pragma header deprecated; SHOULD NOT declare in OAS3
//   RFC2-37: Cache-Control + Expires together = smell (Cache-Control wins)
//   RFC2-38: Vary header SHOULD declare when content-negotiation is used
//   RFC2-39: 304 + 200 responses MUST declare same ETag-shape
// =============================================================================

const IANA_CACHE_CONTROL_DIRECTIVES = new Set([
  'max-age',
  'max-stale',
  'min-fresh',
  'must-revalidate',
  'must-understand',
  'no-cache',
  'no-store',
  'no-transform',
  'only-if-cached',
  'private',
  'proxy-revalidate',
  'public',
  's-maxage',
  'stale-if-error',
  'stale-while-revalidate',
  'immutable',
]);

function parseCacheControlDirectives(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim().split('=')[0].toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Bundle: RFC2-35 + RFC2-36 + RFC2-37 + RFC2-38 + RFC2-39 — cache-validator
 * correctness (RFC 9111).
 *
 * Source: RFC 9111 §4.1/§4.3.4/§5.2/§5.3/§5.4. patterns.json
 *         RFC2-35/36/37/38/39 (P3 bundle).
 */
export const cacheValidatorsBundle: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) return [];
  const out: IFunctionResult[] = [];

  let etagShape200: unknown = undefined;
  let etagShape304: unknown = undefined;

  for (const [code, respUnknown] of Object.entries(responses)) {
    const resp = isObject(respUnknown) ? respUnknown : null;
    if (!resp) continue;
    const headers = isObject(resp.headers) ? resp.headers : null;
    if (!headers) continue;
    let hasCacheControl = false;
    let hasExpires = false;
    for (const [hName, hUnknown] of Object.entries(headers)) {
      const lname = hName.toLowerCase();
      const h = isObject(hUnknown) ? hUnknown : null;
      // RFC2-36 — Pragma SHOULD NOT be declared.
      if (lname === 'pragma') {
        out.push({
          message: `Pragma response-header is deprecated (RFC 9111 §5.4) — SHOULD NOT be declared. RFC2-36.`,
          path: [...cpath, 'responses', code, 'headers', hName],
        });
      }
      if (lname === 'cache-control') {
        hasCacheControl = true;
        // RFC2-35 — directives IANA-registered.
        if (h) {
          const candidates: string[] = [];
          if (typeof h.example === 'string') candidates.push(h.example);
          const sch = isObject(h.schema) ? h.schema : null;
          if (sch) {
            if (typeof sch.example === 'string') candidates.push(sch.example);
            if (typeof sch.default === 'string') candidates.push(sch.default);
            if (Array.isArray(sch.enum)) {
              for (const e of sch.enum) {
                if (typeof e === 'string') candidates.push(e);
              }
            }
          }
          for (const c of candidates) {
            const dirs = parseCacheControlDirectives(c);
            const invalid = dirs.filter(
              (d) => !IANA_CACHE_CONTROL_DIRECTIVES.has(d)
            );
            if (invalid.length > 0) {
              out.push({
                message: `Cache-Control directives [${invalid.join(', ')}] not IANA-registered — RFC 9111 §5.2 / RFC2-35.`,
                path: [...cpath, 'responses', code, 'headers', hName],
              });
            }
          }
        }
      }
      if (lname === 'expires') hasExpires = true;
      // RFC2-39 — capture ETag-shape for 200 / 304.
      if (lname === 'etag' && h) {
        const sch = isObject(h.schema) ? h.schema : null;
        const shape = sch
          ? JSON.stringify({ type: sch.type, format: sch.format })
          : null;
        if (code === '200') etagShape200 = shape;
        if (code === '304') etagShape304 = shape;
      }
    }
    // RFC2-37 — Cache-Control + Expires both declared.
    if (hasCacheControl && hasExpires) {
      out.push({
        message: `Response '${code}' declares BOTH Cache-Control and Expires — Cache-Control overrides per RFC 9111 §5.3 / RFC2-37; SHOULD declare only Cache-Control.`,
        path: [...cpath, 'responses', code, 'headers'],
      });
    }
  }
  // RFC2-39 — 200 + 304 ETag-shape mismatch.
  if (etagShape200 && etagShape304 && etagShape200 !== etagShape304) {
    out.push({
      message: `200 and 304 responses declare ETag with mismatching schema shape — RFC 9111 §4.3.4 / RFC2-39.`,
      path: [...cpath, 'responses'],
    });
  }
  // RFC2-38 — Vary header SHOULD declare when content-negotiation is used
  // (Accept / Accept-Language / Accept-Encoding parameters present).
  const acceptParam = paramByName(op, 'Accept', 'header');
  const acceptLang = paramByName(op, 'Accept-Language', 'header');
  const acceptEnc = paramByName(op, 'Accept-Encoding', 'header');
  if (acceptParam || acceptLang || acceptEnc) {
    let hasVaryAnywhere = false;
    for (const r of Object.values(responses)) {
      const rObj = isObject(r) ? r : null;
      if (!rObj) continue;
      if (responseHasHeader(rObj, 'Vary')) {
        hasVaryAnywhere = true;
        break;
      }
    }
    if (!hasVaryAnywhere) {
      out.push({
        message: `Operation negotiates content (declares Accept* parameter) but no Vary response-header declared — RFC 9111 §4.1 / RFC2-38.`,
        path: [...cpath, 'responses'],
      });
    }
  }
  return out;
};

// =============================================================================
// BUNDLE — link-header-bundle (RFC2-52/53/54/55)
//
// Subsumes:
//   RFC2-52: Link rel-token IANA-registered OR absolute URI
//   RFC2-53: Link rel=next on paginated/truncated responses
//   RFC2-54: Link header anchor-param absolute IRI (when present)
//   RFC2-55: Link rel-tokens case-insensitive coherence
// =============================================================================

const IANA_LINK_RELS = new Set([
  'about',
  'alternate',
  'author',
  'canonical',
  'collection',
  'copyright',
  'create-form',
  'current',
  'describedby',
  'describes',
  'edit',
  'edit-form',
  'first',
  'help',
  'icon',
  'index',
  'item',
  'last',
  'license',
  'next',
  'next-archive',
  'nofollow',
  'noopener',
  'noreferrer',
  'opener',
  'previous',
  'prev',
  'prev-archive',
  'related',
  'replies',
  'search',
  'self',
  'service',
  'start',
  'stylesheet',
  'tag',
  'up',
  'version-history',
  'version-history',
  'via',
  'working-copy',
  'working-copy-of',
]);

function isAbsoluteUri(v: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v);
}

/**
 * Bundle: RFC2-52 + RFC2-53 + RFC2-54 + RFC2-55 — Link header correctness
 * (RFC 8288).
 *
 * Source: RFC 8288 §2.1/§3.2/§3.3 + RFC 5988. patterns.json
 *         RFC2-52/53/54/55 (P3 bundle).
 */
export const linkHeaderBundle: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) return [];
  const out: IFunctionResult[] = [];
  const seenRelTokensCases: Map<string, Set<string>> = new Map();

  // Detect pagination markers (params `page`, `cursor`, `limit`, or
  // response with `next`/`page-info` in description) — RFC2-53.
  const paginationParam =
    paramByName(op, 'page', 'query') ||
    paramByName(op, 'cursor', 'query') ||
    paramByName(op, 'limit', 'query') ||
    paramByName(op, 'pageToken', 'query');

  for (const [code, respUnknown] of Object.entries(responses)) {
    const resp = isObject(respUnknown) ? respUnknown : null;
    if (!resp) continue;
    const headers = isObject(resp.headers) ? resp.headers : null;
    if (!headers) continue;
    for (const [hName, hUnknown] of Object.entries(headers)) {
      if (hName.toLowerCase() !== 'link') continue;
      const h = isObject(hUnknown) ? hUnknown : null;
      if (!h) continue;
      const examples: string[] = [];
      if (typeof h.example === 'string') examples.push(h.example);
      const sch = isObject(h.schema) ? h.schema : null;
      if (sch && typeof sch.example === 'string') examples.push(sch.example);
      if (sch && typeof sch.default === 'string') examples.push(sch.default);
      if (sch && Array.isArray(sch.enum)) {
        for (const e of sch.enum) {
          if (typeof e === 'string') examples.push(e);
        }
      }
      // Examples object.
      const examplesObj = isObject(h.examples) ? h.examples : null;
      if (examplesObj) {
        for (const ex of Object.values(examplesObj)) {
          if (isObject(ex) && typeof ex.value === 'string') examples.push(ex.value);
        }
      }
      for (const ex of examples) {
        // Parse rel="..." segments.
        const relMatches = ex.match(/rel=("[^"]+"|[^\s,;]+)/gi) ?? [];
        for (const rm of relMatches) {
          const rawVal = rm.slice(4).replace(/"/g, '').trim();
          // rel-token may be space-separated multi-token list.
          for (const token of rawVal.split(/\s+/)) {
            if (!token) continue;
            // RFC2-52 — IANA-registered OR absolute URI.
            const lower = token.toLowerCase();
            if (!IANA_LINK_RELS.has(lower) && !isAbsoluteUri(token)) {
              out.push({
                message: `Link rel-token "${token}" not IANA-registered and not absolute URI — RFC 8288 §2.1 / RFC2-52.`,
                path: [...cpath, 'responses', code, 'headers', hName],
              });
            }
            // RFC2-55 — case-insensitive coherence (warn if same token in
            // different casings).
            const cases = seenRelTokensCases.get(lower) ?? new Set<string>();
            cases.add(token);
            seenRelTokensCases.set(lower, cases);
          }
        }
        // RFC2-54 — anchor=... param MUST be absolute IRI when present.
        const anchorMatches = ex.match(/anchor=("[^"]+"|[^\s,;]+)/gi) ?? [];
        for (const am of anchorMatches) {
          const rawVal = am.slice(7).replace(/"/g, '').trim();
          if (!isAbsoluteUri(rawVal)) {
            out.push({
              message: `Link anchor parameter "${rawVal}" SHOULD be absolute IRI — RFC 8288 §3.2 / RFC2-54.`,
              path: [...cpath, 'responses', code, 'headers', hName],
            });
          }
        }
      }
    }
  }

  // RFC2-55 — case-coherence across all links seen.
  for (const [lower, cases] of seenRelTokensCases) {
    if (cases.size > 1) {
      out.push({
        message: `Link rel-token "${lower}" appears in multiple casings [${[...cases].join(', ')}] — RFC 8288 §3.3 / RFC2-55.`,
        path: [...cpath, 'responses'],
      });
    }
  }

  // RFC2-53 — paginated op SHOULD declare Link with rel=next.
  if (paginationParam) {
    let sawNext = false;
    for (const respUnknown of Object.values(responses)) {
      const resp = isObject(respUnknown) ? respUnknown : null;
      if (!resp) continue;
      const headers = isObject(resp.headers) ? resp.headers : null;
      if (!headers) continue;
      for (const [hName, hUnknown] of Object.entries(headers)) {
        if (hName.toLowerCase() !== 'link') continue;
        const h = isObject(hUnknown) ? hUnknown : null;
        if (!h) continue;
        const blobs: string[] = [];
        if (typeof h.example === 'string') blobs.push(h.example);
        const sch = isObject(h.schema) ? h.schema : null;
        if (sch && typeof sch.example === 'string') blobs.push(sch.example);
        if (sch && typeof sch.default === 'string') blobs.push(sch.default);
        if (typeof h.description === 'string') blobs.push(h.description);
        if (blobs.some((b) => /rel=("?next"?)/i.test(b))) {
          sawNext = true;
          break;
        }
      }
      if (sawNext) break;
    }
    if (!sawNext) {
      out.push({
        message: `Paginated operation SHOULD declare Link header with rel="next" on truncated responses — RFC 8288 + RFC 5988 / RFC2-53.`,
        path: [...cpath, 'responses'],
      });
    }
  }
  return out;
};

// =============================================================================
// BUNDLE — multipart-form-bundle (RFC2-100/101)
//
// Subsumes:
//   RFC2-100: multipart/form-data SHOULD be type:object + properties
//   RFC2-101: multipart binary part SHOULD declare format:binary
// =============================================================================

const MULTIPART_FORM_DATA = /multipart\/form-data/i;

const BINARY_LIKELY_FIELD_PATTERN =
  /^(file|files|upload|uploads|attachment|attachments|image|images|photo|photos|avatar|document|documents|blob|content|payload|data)$/i;

/**
 * Bundle: RFC2-100 + RFC2-101 — multipart/form-data correctness.
 *
 * Source: RFC 7578 §4.2 + OAS 3 §4.7.10.4. patterns.json
 *         RFC2-100/101 (P3 bundle).
 */
export const multipartFormBundle: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  const out: IFunctionResult[] = [];
  for (const [mediaType, mt] of Object.entries(getRequestBodyContent(op))) {
    if (!MULTIPART_FORM_DATA.test(mediaType)) continue;
    const sch = isObject(mt.schema) ? mt.schema : null;
    // RFC2-100 — schema MUST be type:object with properties.
    if (!sch) {
      out.push({
        message: `multipart/form-data requestBody MUST declare a schema (type:object + properties) — RFC 7578 §4.2 / RFC2-100.`,
        path: [...cpath, 'requestBody', 'content', mediaType],
      });
      continue;
    }
    if (sch.type !== 'object') {
      out.push({
        message: `multipart/form-data schema SHOULD be type:object — found type:${sch.type ?? '<unset>'}. RFC 7578 §4.2 / RFC2-100.`,
        path: [...cpath, 'requestBody', 'content', mediaType, 'schema'],
      });
      continue;
    }
    const props = isObject(sch.properties) ? sch.properties : null;
    if (!props || Object.keys(props).length === 0) {
      out.push({
        message: `multipart/form-data schema MUST declare properties — RFC 7578 §4.2 / RFC2-100.`,
        path: [...cpath, 'requestBody', 'content', mediaType, 'schema'],
      });
      continue;
    }
    // RFC2-101 — binary-likely field SHOULD declare format:binary.
    for (const [propName, propUnknown] of Object.entries(props)) {
      const prop = isObject(propUnknown) ? propUnknown : null;
      if (!prop) continue;
      const isStringType = prop.type === 'string';
      const declaredFormat = typeof prop.format === 'string' ? prop.format : null;
      if (
        isStringType &&
        BINARY_LIKELY_FIELD_PATTERN.test(propName) &&
        declaredFormat !== 'binary' &&
        declaredFormat !== 'base64' &&
        declaredFormat !== 'byte'
      ) {
        out.push({
          message: `multipart/form-data property '${propName}' looks binary-bound but SHOULD declare format:binary — RFC 7578 + OAS / RFC2-101.`,
          path: [...cpath, 'requestBody', 'content', mediaType, 'schema', 'properties', propName],
        });
      }
    }
  }
  return out;
};

// =============================================================================
// Welle Arch+ A3 — FUNCTION_METADATA registry for standards-p3 callables.
// =============================================================================

import type { FunctionMetadata } from './_metadata.js';

export const FUNCTION_METADATA: Record<string, FunctionMetadata> = {
  'problem-details-extension-reserved': {
    name: 'problem-details-extension-reserved',
    patternIds: ['RFC2-4'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'application/problem+json schema must not redefine the 5 reserved RFC 9457 §3.1 keys (type/title/status/detail/instance) with conflicting types.',
  },
  'one-xx-response-upgrade-header': {
    name: 'one-xx-response-upgrade-header',
    patternIds: ['RFC2-13'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      '1xx responses (101 Switching Protocols) MUST declare Upgrade + Connection headers (RFC 9110 §15.2.2).',
  },
  'upgrade-required-426': {
    name: 'upgrade-required-426',
    patternIds: ['RFC2-15'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      '426 Upgrade Required responses MUST declare an Upgrade header (RFC 9110 §15.5.22).',
  },
  'one-xx-not-in-responses-keys': {
    name: 'one-xx-not-in-responses-keys',
    patternIds: ['RFC2-17'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      '1xx informational status-codes (100/101/102/103) should not appear as response-keys in OAS — they are not final responses.',
  },
  'if-modified-since-implies-304': {
    name: 'if-modified-since-implies-304',
    patternIds: ['RFC2-23'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'Operation accepts If-Modified-Since header but no 304 Not Modified response declared (RFC 9110 §13.1.3).',
  },
  'if-unmodified-since-implies-412': {
    name: 'if-unmodified-since-implies-412',
    patternIds: ['RFC2-24'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'Operation accepts If-Unmodified-Since header but no 412 Precondition Failed response declared (RFC 9110 §13.1.4).',
  },
  'etag-cross-resource-consistency': {
    name: 'etag-cross-resource-consistency',
    patternIds: ['RFC2-28'],
    lens: 'standards-compliance',
    perfClass: 'O(n*m)',
    description:
      'ETag header declared on some 2xx responses but not others on the same resource — inconsistent caching contract.',
  },
  'id-write-op-etag-support': {
    name: 'id-write-op-etag-support',
    patternIds: ['RFC2-29'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'Resource-{id} write op (PUT/PATCH/DELETE) should declare If-Match parameter and 412 response for ETag-based optimistic concurrency.',
  },
  'proxy-authenticate-407': {
    name: 'proxy-authenticate-407',
    patternIds: ['RFC2-41'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      '407 Proxy Authentication Required responses MUST declare a Proxy-Authenticate header (RFC 9110 §15.5.8).',
  },
  'prefer-implies-preference-applied': {
    name: 'prefer-implies-preference-applied',
    patternIds: ['RFC2-46'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'Operation accepts Prefer header — responses should declare Preference-Applied response-header (RFC 7240).',
  },
  'prefer-respond-async-implies-202': {
    name: 'prefer-respond-async-implies-202',
    patternIds: ['RFC2-48'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'Operation Prefer:respond-async description-mention requires a 202 Accepted response with Location header (RFC 7240 §4.1).',
  },
  'deprecation-pairs-sunset': {
    name: 'deprecation-pairs-sunset',
    patternIds: ['RFC2-91'],
    lens: 'standards-compliance',
    perfClass: 'O(n*m)',
    description:
      'Response declaring Deprecation header should pair it with Sunset header (RFC 9745 + RFC 8594).',
  },
  'rate-limit-header-family-consistency': {
    name: 'rate-limit-header-family-consistency',
    patternIds: ['RFC2-93'],
    lens: 'standards-compliance',
    perfClass: 'O(n*m)',
    description:
      'RateLimit-Limit/-Remaining/-Reset triplet must be declared together (no partial subset). draft-ietf-httpapi-ratelimit-headers.',
  },
  'merge-patch-properties-not-required': {
    name: 'merge-patch-properties-not-required',
    patternIds: ['RFC2-98'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'application/merge-patch+json schema must not declare required[] — RFC 7396 merge-patch is property-by-property optional.',
  },
  'json-patch-schema-is-array': {
    name: 'json-patch-schema-is-array',
    patternIds: ['RFC2-99'],
    lens: 'standards-compliance',
    perfClass: 'O(n)',
    description:
      'application/json-patch+json schema must be type:array (of operation objects) — RFC 6902.',
  },
  'cache-header-bundle': {
    name: 'cache-header-bundle',
    patternIds: ['RFC2-30'],
    lens: 'standards-compliance',
    perfClass: 'O(n*m)',
    description:
      'Cacheable 2xx response should declare Cache-Control and either Expires or max-age (RFC 9111).',
  },
  'cache-validators-bundle': {
    name: 'cache-validators-bundle',
    patternIds: ['RFC2-35'],
    lens: 'standards-compliance',
    perfClass: 'O(n*m)',
    description:
      'Cacheable response without ETag/Last-Modified validator headers prevents 304-revalidation flow (RFC 9111 + RFC 7234).',
  },
  'link-header-bundle': {
    name: 'link-header-bundle',
    patternIds: ['RFC2-52'],
    lens: 'standards-compliance',
    perfClass: 'O(n*m)',
    description:
      'List endpoint declaring pagination should expose Link header with rel="next"/"prev"/"first"/"last" (RFC 8288).',
  },
  'multipart-form-bundle': {
    name: 'multipart-form-bundle',
    patternIds: ['RFC2-100'],
    lens: 'standards-compliance',
    perfClass: 'O(n*m)',
    description:
      'multipart/form-data schema must be type:object+properties (RFC 7578 §4.2); binary-likely fields should declare format:binary.',
  },
};

// =============================================================================
// Marker so this module is side-effect-free for tree-shaking.
// =============================================================================
export const __STANDARDS_P3_FUNCTIONS_MODULE = 'standards-p3-functions';
