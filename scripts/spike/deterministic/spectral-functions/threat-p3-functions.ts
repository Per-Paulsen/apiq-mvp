/**
 * Custom Spectral functions for the P3 Threat-Modeling ruleset (T16c / Welle D).
 *
 * P3 = Defense-in-Depth + Nice-to-Have patterns. Most rules emit `hint` severity
 * (off-by-default-overridable) unless patterns.json severity-hypothesis demands
 * `warn` or `error`. These callables handle multi-step / cross-resource logic
 * that pure DSL can't express.
 *
 * Rules backed by these functions (registered in spectral-runner.ts and the
 * threat-p3-rules.test.ts harness):
 *
 *   - tm-y18-sensitive-header-name-rejected:        Y-18  — header parameters
 *                                                   named like "password",
 *                                                   "api-key", "token" raise
 *                                                   credential-leak risk.
 *   - tm-y25-post-creates-need-idempotency-key:     Y-25 / RFC2-90 — POST that
 *                                                   creates resource SHOULD
 *                                                   declare Idempotency-Key
 *                                                   parameter.
 *   - tm-a3-three-or-more-id-params-bola:           TM-A3 — path with ≥3 ID
 *                                                   template segments raises
 *                                                   BOLA risk.
 *   - tm-a4-body-contains-user-id-on-non-admin:     TM-A4  — non-admin endpoint
 *                                                   accepts user_id /
 *                                                   account_id in request body.
 *   - tm-a8-multiple-and-security-same-type:        TM-A8  — operation security
 *                                                   contains multiple items of
 *                                                   the same scheme-type.
 *   - tm-a25-long-running-op-async-pattern:         TM-A25 — operation hints at
 *                                                   "long-running" / "async"
 *                                                   without 202 + Location
 *                                                   pattern.
 *   - tm-a27-admin-shares-public-security:          TM-A27 — admin/internal
 *                                                   path shares security scheme
 *                                                   with public paths.
 *   - tm-a29-resource-only-get-no-write:            TM-A29 — resource path tree
 *                                                   has GETs but no write ops
 *                                                   (read-only-API smell).
 *   - tm-a30-non-standard-method-needs-security:    TM-A30 — non-standard HTTP
 *                                                   methods (TRACE/CONNECT/etc)
 *                                                   without explicit security.
 *   - tm-a31-signup-needs-rate-limit-or-captcha:    TM-A31 — signup/register
 *                                                   endpoint without rate-limit
 *                                                   header or x-captcha-required.
 *   - tm-a33-posting-comment-needs-rate-limit:      TM-A33 — comment/post/review
 *                                                   write endpoint without rate
 *                                                   limit headers.
 *   - tm-a37-host-param-flagged-for-ssrf:           TM-A37 — parameter named
 *                                                   host/hostname/server/origin
 *                                                   raises SSRF flag.
 *   - tm-a40-cors-origin-reflection-without-allowlist: TM-A40 — Access-Control-
 *                                                   Allow-Origin response header
 *                                                   appears without allowlist
 *                                                   marker.
 *   - tm-a41-browser-api-needs-security-headers:    TM-A41 — browser-facing API
 *                                                   should declare HSTS / CSP /
 *                                                   X-Frame-Options response
 *                                                   headers.
 *   - tm-a43-non-standard-method-without-security:  TM-A43 — TRACE / CONNECT /
 *                                                   PROPFIND etc. without
 *                                                   security declared.
 *   - tm-a49-upstream-url-op-needs-5xx-explicit:    TM-A49 — operation consuming
 *                                                   an upstream URL must declare
 *                                                   502/503/504 explicitly.
 *   - tm-a51-webhook-rejects-wildcard-content-type: TM-A51 — webhook receiver
 *                                                   accepts `*\/*` content-type
 *                                                   (over-permissive).
 *
 * Sources (file-level; per-callable headers below cite the specific rule):
 *   - OWASP API Top-10 (2023) https://owasp.org/API-Security/editions/2023/
 *   - OWASP REST Security Cheat Sheet
 *     https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
 *   - OWASP Secure Headers Project https://owasp.org/www-project-secure-headers/
 *   - draft-ietf-httpapi-idempotency-key
 *     https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key/
 *   - RFC 9110 (HTTP Semantics, 2022) https://www.rfc-editor.org/rfc/rfc9110
 *   - RFC 7231 (HTTP/1.1 Semantics — TRACE/CONNECT) https://www.rfc-editor.org/rfc/rfc7231
 *
 * Lens: 1 (Threat-Modeling), with Lens-2 / Lens-4 cross-cuts on selected rules.
 * Round: 1+2 (Welle D / T16c).
 */

import type { IFunction, IFunctionResult } from '@stoplight/spectral-core';

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

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

// =============================================================================
// Y-18 — sensitive-header-name-rejected
//
// Header parameters named like "password" / "api-key" / "token" / "secret"
// expose credentials in request URLs (when caches/log-pipelines normalize) or
// in proxy logs. OWASP API8 + S-SP-9. Severity: error (per patterns.json).
// =============================================================================

const SENSITIVE_HEADER_NAME = /^(password|passwd|pwd|secret|passphrase|token|access[-_]?token|api[-_]?key|apikey|auth|authorization|bearer|x[-_]?api[-_]?key|x[-_]?access[-_]?token|x[-_]?password|x[-_]?secret)$/i;

const SENSITIVE_HEADER_ALLOWLIST = /^(authorization|x-api-key|x-auth-token|api-key)$/i;

/**
 * Y-18 — sensitive header parameters (password / token / api-key) rejected.
 *
 * Source: OWASP API8:2023 (Security Misconfiguration). patterns.json Y-18.
 */
export const sensitiveHeaderNameRejected: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const param = getResolvedTarget<AnyObj>(targetVal);
  if (!param) return [];
  const inLoc = typeof param.in === 'string' ? param.in : '';
  if (inLoc !== 'header') return [];
  const name = typeof param.name === 'string' ? param.name : '';
  if (!name) return [];
  if (SENSITIVE_HEADER_ALLOWLIST.test(name)) return [];
  if (!SENSITIVE_HEADER_NAME.test(name)) return [];
  return [
    {
      message: `Header parameter "${name}" exposes a credential — use a defined securityScheme (apiKey/oauth2/http-bearer) instead of an ad-hoc header (OWASP API8).`,
      path: [...context.path],
    },
  ];
};

// =============================================================================
// Y-25 / RFC2-90 — POST-creates-need-idempotency-key
//
// POST that creates a resource SHOULD accept an `Idempotency-Key` request
// header per draft-ietf-httpapi-idempotency-key. Heuristic: POST whose path
// looks like a collection (no trailing /{id}) AND that declares a 201 response.
// =============================================================================

const ID_TEMPLATE_TAIL = /\{[^}]+\}\/?$/;

/**
 * Y-25 / RFC2-90 — POST creating a resource SHOULD accept Idempotency-Key.
 *
 * Source: draft-ietf-httpapi-idempotency-key (IETF httpapi WG, 2024-2025).
 *         patterns.json Y-25 / RFC2-90.
 */
export const postCreatesNeedIdempotencyKey: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (method !== 'post') return [];
  const routePath = String(cpath[cpath.length - 2]);
  // Skip POST on /resource/{id} (action-style) — those usually aren't creates.
  if (ID_TEMPLATE_TAIL.test(routePath)) return [];
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : null;
  if (!responses) return [];
  const isCreate = '201' in responses || '202' in responses;
  if (!isCreate) return [];
  const params = Array.isArray(op.parameters) ? (op.parameters as AnyObj[]) : [];
  for (const p of params) {
    if (!isObject(p)) continue;
    const pname = typeof p.name === 'string' ? p.name : '';
    const pin = typeof p.in === 'string' ? p.in : '';
    if (pin === 'header' && /^idempotency[-_]?key$/i.test(pname)) return [];
  }
  return [
    {
      message: `POST ${routePath} creates a resource (201/202) but accepts no Idempotency-Key header — retries may double-create (draft-ietf-httpapi-idempotency-key).`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// TM-A3 — three-or-more-id-params-bola
//
// A path with ≥3 `{id}`-style template segments deepens the BOLA attack surface
// — every additional ID is another authorization boundary that the server must
// enforce. OWASP API1 (BOLA).
// =============================================================================

const ID_TEMPLATE_GLOBAL = /\{([^}]*(id|uuid|key|name|slug|code|sku|hash))\b[^}]*\}/gi;

/**
 * TM-A3 — paths with ≥3 ID template segments raise BOLA risk.
 *
 * Source: OWASP API1:2023 (BOLA). patterns.json TM-A3.
 */
export const threeOrMoreIdParamsBola: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const cpath = context.path;
  if (!cpath || cpath.length < 2) return [];
  const routePath = String(cpath[cpath.length - 1]);
  // Use matchAll for a clear count (no global-regex stateful trap).
  const matches = Array.from(routePath.matchAll(ID_TEMPLATE_GLOBAL));
  if (matches.length < 3) return [];
  return [
    {
      message: `Path "${routePath}" has ${matches.length} ID-template segments — every additional ID is another authorization boundary (OWASP API1 BOLA).`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// TM-A4 — body-contains-user-id-on-non-admin
//
// Non-admin endpoints accepting `user_id` / `account_id` / `tenant_id` in
// request body invite spoofing (the field overrides session-derived identity).
// Heuristic: only flag operations whose summary/description does NOT mention
// admin/internal AND that lack a path segment like /admin or /internal.
// =============================================================================

const USER_ID_PROP_PATTERN = /^(user_id|userId|userid|account_id|accountId|tenant_id|tenantId|owner_id|ownerId|customer_id|customerId|subject_id|subjectId)$/;
const ADMIN_PATH_PATTERN = /\/(admin|administrators?|internal|backoffice|management)\b/i;
const ADMIN_DESC_PATTERN = /\b(admin|administrator|internal[-\s]?only|privileged|root[-\s]?only|superuser|backoffice)\b/i;

/**
 * TM-A4 — non-admin endpoint accepts user_id-like field in request body.
 *
 * Source: OWASP API1:2023 (BOLA). patterns.json TM-A4.
 */
export const bodyContainsUserIdOnNonAdmin: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (!['post', 'put', 'patch'].includes(method)) return [];
  const routePath = String(cpath[cpath.length - 2]);
  if (ADMIN_PATH_PATTERN.test(routePath)) return [];
  const summary = typeof op.summary === 'string' ? op.summary : '';
  const description = typeof op.description === 'string' ? op.description : '';
  if (ADMIN_DESC_PATTERN.test(`${summary} ${description}`)) return [];
  const rb = isObject(op.requestBody) ? (op.requestBody as AnyObj) : null;
  if (!rb) return [];
  const content = isObject(rb.content) ? (rb.content as AnyObj) : null;
  if (!content) return [];
  const out: IFunctionResult[] = [];
  for (const [mt, mtUnknown] of Object.entries(content)) {
    const mtObj = isObject(mtUnknown) ? mtUnknown : null;
    if (!mtObj) continue;
    const sch = isObject(mtObj.schema) ? (mtObj.schema as AnyObj) : null;
    if (!sch) continue;
    const props = isObject(sch.properties) ? (sch.properties as AnyObj) : null;
    if (!props) continue;
    for (const propName of Object.keys(props)) {
      if (USER_ID_PROP_PATTERN.test(propName)) {
        out.push({
          message: `Non-admin ${method.toUpperCase()} ${routePath} accepts identity-bearing field "${propName}" in body (${mt}) — server-side identity should be session-derived (OWASP API1).`,
          path: [...cpath, 'requestBody', 'content', mt, 'schema', 'properties', propName],
        });
      }
    }
  }
  return out;
};

// =============================================================================
// TM-A8 — multiple-and-security-same-type
//
// `security: [{a:[], b:[]}]` (single object with multiple keys) means AND.
// If `a` and `b` resolve to the same scheme-type (e.g. two apiKey schemes), the
// AND-guard is effectively single-factor. Flag only the AND-of-same-type case.
// =============================================================================

/**
 * TM-A8 — security AND-requirement composed of identical scheme types.
 *
 * Source: OWASP API2:2023 (Broken Authentication). patterns.json TM-A8.
 */
export const multipleAndSecuritySameType: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const security = Array.isArray(op.security) ? op.security : null;
  if (!security || security.length === 0) return [];
  const document = context.document?.data as AnyObj | undefined;
  const components = document && isObject(document.components) ? document.components : null;
  const securitySchemes =
    components && isObject(components.securitySchemes)
      ? (components.securitySchemes as AnyObj)
      : null;
  if (!securitySchemes) return [];
  const out: IFunctionResult[] = [];
  for (let i = 0; i < security.length; i++) {
    const req = security[i];
    if (!isObject(req)) continue;
    const keys = Object.keys(req);
    if (keys.length < 2) continue;
    const types: string[] = [];
    for (const k of keys) {
      const ss = isObject(securitySchemes[k]) ? (securitySchemes[k] as AnyObj) : null;
      if (!ss) continue;
      const t = typeof ss.type === 'string' ? ss.type : '';
      types.push(t);
    }
    const uniq = new Set(types);
    if (types.length >= 2 && uniq.size === 1) {
      out.push({
        message: `security AND-requirement [${keys.join(', ')}] all share scheme-type "${[...uniq][0]}" — AND of same type is not multi-factor (OWASP API2).`,
        path: [...context.path, 'security', i],
      });
    }
  }
  return out;
};

// =============================================================================
// TM-A25 — long-running-op-async-pattern
//
// Operations whose summary/description hints at "long-running" / "background" /
// "asynchronous" / "polling" SHOULD use the 202 Accepted + Location async
// pattern instead of a synchronous 200.
// =============================================================================

const LONG_RUNNING_DESC = /\b(long[-\s]?running|asynchronous|background\s+job|background\s+task|may\s+take\s+(several|many)\s+(seconds|minutes|hours)|polling\b|poll\s+the|poll\s+for|status\s+endpoint)\b/i;

/**
 * TM-A25 — long-running operation should use async (202 + Location) pattern.
 *
 * Source: OWASP API4:2023 (Unrestricted Resource Consumption). patterns.json TM-A25.
 */
export const longRunningOpAsyncPattern: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const summary = typeof op.summary === 'string' ? op.summary : '';
  const description = typeof op.description === 'string' ? op.description : '';
  if (!LONG_RUNNING_DESC.test(`${summary} ${description}`)) return [];
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : null;
  if (!responses) return [];
  const has202 = '202' in responses;
  if (has202) {
    const r202 = isObject(responses['202']) ? (responses['202'] as AnyObj) : null;
    const headers = r202 && isObject(r202.headers) ? (r202.headers as AnyObj) : null;
    const hasLocation = headers
      ? Object.keys(headers).some((k) => k.toLowerCase() === 'location')
      : false;
    if (hasLocation) return [];
    return [
      {
        message: 'Long-running operation declares 202 but no Location header — async pattern incomplete (OWASP API4).',
        path: [...context.path, 'responses', '202'],
      },
    ];
  }
  return [
    {
      message: 'Long-running operation declares synchronous responses only — should use 202 Accepted + Location header (async pattern, OWASP API4).',
      path: [...context.path, 'responses'],
    },
  ];
};

// =============================================================================
// TM-A27 — admin-shares-public-security
//
// If admin/internal paths declare the SAME security scheme as public paths
// (both inherit spec-level OR both list e.g. `apiKey`), privilege-escalation
// risk goes up. Flag when admin paths have no distinct security from public.
// =============================================================================

function pathIsAdmin(p: string, op: AnyObj): boolean {
  if (ADMIN_PATH_PATTERN.test(p)) return true;
  const summary = typeof op.summary === 'string' ? op.summary : '';
  const description = typeof op.description === 'string' ? op.description : '';
  return ADMIN_DESC_PATTERN.test(`${summary} ${description}`);
}

function getOpSecuritySchemes(op: AnyObj, docSecurity: unknown[] | null): Set<string> {
  const sec = Array.isArray(op.security) ? op.security : docSecurity ?? [];
  const set = new Set<string>();
  for (const req of sec) {
    if (!isObject(req)) continue;
    for (const k of Object.keys(req)) set.add(k);
  }
  return set;
}

/**
 * TM-A27 — admin/internal paths share security scheme with public paths.
 *
 * Source: OWASP API5:2023 (Broken Function-Level Authorization). patterns.json TM-A27.
 */
export const adminSharesPublicSecurity: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const pathsObj = isObject(doc.paths) ? (doc.paths as AnyObj) : null;
  if (!pathsObj) return [];
  const docSecurity = Array.isArray(doc.security) ? doc.security : null;
  const adminSchemes = new Set<string>();
  const publicSchemes = new Set<string>();
  const adminLocations: { path: string; method: string }[] = [];
  for (const [pname, pitem] of Object.entries(pathsObj)) {
    if (!isObject(pitem)) continue;
    for (const [method, opUnknown] of Object.entries(pitem)) {
      if (!HTTP_METHODS.includes(method as HttpMethod)) continue;
      const op = isObject(opUnknown) ? (opUnknown as AnyObj) : null;
      if (!op) continue;
      const schemes = getOpSecuritySchemes(op, docSecurity);
      if (pathIsAdmin(pname, op)) {
        adminLocations.push({ path: pname, method });
        for (const s of schemes) adminSchemes.add(s);
      } else {
        for (const s of schemes) publicSchemes.add(s);
      }
    }
  }
  if (adminLocations.length === 0) return [];
  // Are ALL admin schemes also public-facing?
  let allShared = adminSchemes.size > 0;
  for (const s of adminSchemes) {
    if (!publicSchemes.has(s)) {
      allShared = false;
      break;
    }
  }
  if (!allShared) return [];
  // No distinct admin security scheme.
  return [
    {
      message: `Admin/internal paths (${adminLocations
        .slice(0, 3)
        .map((l) => `${l.method.toUpperCase()} ${l.path}`)
        .join(', ')}${adminLocations.length > 3 ? ', …' : ''}) share security scheme [${[
        ...adminSchemes,
      ].join(', ')}] with public paths — privilege-escalation risk (OWASP API5).`,
      path: [...context.path, 'paths'],
    },
  ];
};

// =============================================================================
// TM-A29 — resource-only-get-no-write
//
// A resource path tree (e.g. /things, /things/{id}) with only GET operations
// and no POST / PUT / PATCH / DELETE is a "read-only-API" smell — either by
// design (catalog API) or accidental (server only mounted readers).
// =============================================================================

/**
 * TM-A29 — resource path tree has GETs but no write operations.
 *
 * Source: OWASP API5:2023 (review-time signal). patterns.json TM-A29.
 */
export const resourceOnlyGetNoWrite: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const pathsObj = isObject(doc.paths) ? (doc.paths as AnyObj) : null;
  if (!pathsObj) return [];
  // Group paths by first segment.
  const groups = new Map<string, { hasGet: boolean; hasWrite: boolean; samples: string[] }>();
  for (const [pname, pitem] of Object.entries(pathsObj)) {
    if (!isObject(pitem)) continue;
    const seg = pname.split('/').filter(Boolean)[0];
    if (!seg) continue;
    if (seg.startsWith('{')) continue;
    const g = groups.get(seg) ?? { hasGet: false, hasWrite: false, samples: [] };
    g.samples.push(pname);
    for (const method of Object.keys(pitem)) {
      if (method === 'get' || method === 'head') g.hasGet = true;
      if (['post', 'put', 'patch', 'delete'].includes(method)) g.hasWrite = true;
    }
    groups.set(seg, g);
  }
  const out: IFunctionResult[] = [];
  for (const [seg, g] of groups) {
    if (g.hasGet && !g.hasWrite && g.samples.length >= 2) {
      out.push({
        message: `Resource tree "/${seg}" exposes ${g.samples.length} GET-only paths but no write operations — confirm this is intentional (read-only-API smell, OWASP API5 review).`,
        path: [...context.path, 'paths', g.samples[0] as string],
      });
    }
  }
  return out;
};

// =============================================================================
// TM-A30 / TM-A43 — non-standard-method-needs-security
//
// Methods outside { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } that also
// appear in OAS path-items (TRACE, CONNECT, PROPFIND via x-method, …) MUST
// declare explicit security. OAS recognizes only `trace` formally. We flag
// `trace` ops without security AND flag `x-amazon-apigateway-any-method` /
// custom verb extensions without security.
//
// TM-A30 = "non-standard HTTP method without explicit security" — covers TRACE
// in spec.
// TM-A43 = "TRACE/CONNECT/PROPFIND without security" — same logic, separate
// pattern-id (kept as alias under same callable).
// =============================================================================

const NON_STANDARD_METHOD_KEYS = new Set([
  'trace',
  'connect',
  'propfind',
  'proppatch',
  'mkcol',
  'copy',
  'move',
  'lock',
  'unlock',
  'report',
  'mkcalendar',
]);

/**
 * TM-A30 / TM-A43 — non-standard methods (TRACE / CONNECT / WebDAV) without security.
 *
 * Source: OWASP API5 + OWASP API8 (Misconfiguration) + RFC 7231 §4.3.8 (TRACE
 *         is dangerous in production). patterns.json TM-A30 + TM-A43.
 */
export const nonStandardMethodNeedsSecurity: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const pathsObj = isObject(doc.paths) ? (doc.paths as AnyObj) : null;
  if (!pathsObj) return [];
  const docSecurity = Array.isArray(doc.security) ? doc.security : null;
  const out: IFunctionResult[] = [];
  for (const [pname, pitem] of Object.entries(pathsObj)) {
    if (!isObject(pitem)) continue;
    for (const [method, opUnknown] of Object.entries(pitem)) {
      const lower = method.toLowerCase();
      if (!NON_STANDARD_METHOD_KEYS.has(lower) && !lower.startsWith('x-')) continue;
      const op = isObject(opUnknown) ? (opUnknown as AnyObj) : null;
      if (!op) continue;
      const opSec = Array.isArray(op.security) ? op.security : null;
      const docHas = docSecurity && docSecurity.length > 0;
      if (opSec && opSec.length > 0) continue;
      if (!opSec && docHas) continue;
      out.push({
        message: `Non-standard method ${method.toUpperCase()} ${pname} declares no explicit security — restrict or remove (OWASP API5/API8, RFC 7231 §4.3.8 for TRACE).`,
        path: [...context.path, 'paths', pname, method],
      });
    }
  }
  return out;
};

// =============================================================================
// TM-A31 — signup-needs-rate-limit-or-captcha
//
// Signup / register endpoints SHOULD declare rate-limit headers OR a CAPTCHA
// hint (`x-captcha-required: true` or schema property `captcha`/`turnstile`/
// `recaptcha`).
// =============================================================================

const SIGNUP_PATH_PATTERN = /\/(signup|sign-?up|register|registration|create-account|account\/create|users?\/?$)/i;
const CAPTCHA_PROP_PATTERN = /^(captcha|recaptcha|turnstile|hcaptcha|cf_turnstile|g_recaptcha_response)$/i;

const RATE_LIMIT_HEADER_RE = [
  /^x-ratelimit-/i,
  /^ratelimit-/i,
  /^x-rate-limit-/i,
  /^retry-after$/i,
];

function opHasRateLimitHeader(op: AnyObj): boolean {
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : null;
  if (!responses) return false;
  for (const r of Object.values(responses)) {
    if (!isObject(r)) continue;
    const headers = isObject(r.headers) ? (r.headers as AnyObj) : null;
    if (!headers) continue;
    for (const k of Object.keys(headers)) {
      if (RATE_LIMIT_HEADER_RE.some((re) => re.test(k))) return true;
    }
  }
  return false;
}

function opHasCaptchaHint(op: AnyObj): boolean {
  if (op['x-captcha-required'] === true) return true;
  if (op['x-rate-limit'] !== undefined) return true;
  const rb = isObject(op.requestBody) ? (op.requestBody as AnyObj) : null;
  if (!rb) return false;
  const content = isObject(rb.content) ? (rb.content as AnyObj) : null;
  if (!content) return false;
  for (const mt of Object.values(content)) {
    if (!isObject(mt)) continue;
    const sch = isObject(mt.schema) ? (mt.schema as AnyObj) : null;
    if (!sch) continue;
    const props = isObject(sch.properties) ? (sch.properties as AnyObj) : null;
    if (!props) continue;
    for (const propName of Object.keys(props)) {
      if (CAPTCHA_PROP_PATTERN.test(propName)) return true;
    }
  }
  return false;
}

/**
 * TM-A31 — signup endpoint without rate-limit / CAPTCHA hint.
 *
 * Source: OWASP API6:2023 (Unrestricted Access to Sensitive Business Flows).
 *         patterns.json TM-A31.
 */
export const signupNeedsRateLimitOrCaptcha: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (method !== 'post' && method !== 'put') return [];
  const routePath = String(cpath[cpath.length - 2]);
  if (!SIGNUP_PATH_PATTERN.test(routePath)) return [];
  if (opHasRateLimitHeader(op)) return [];
  if (opHasCaptchaHint(op)) return [];
  return [
    {
      message: `Signup endpoint ${method.toUpperCase()} ${routePath} declares no rate-limit headers and no CAPTCHA hint — bot-signup risk (OWASP API6).`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// TM-A33 — posting-comment-needs-rate-limit
//
// Comment / post / review write endpoints SHOULD declare rate-limit headers.
// Heuristic: path matches /comments? / /posts? / /reviews? / /messages?
// AND method is POST/PUT.
// =============================================================================

const COMMENT_PATH_PATTERN = /\/(comments?|posts?|reviews?|messages?|replies|threads?|tweets?|toots?)(\/|$)/i;

/**
 * TM-A33 — comment / post / review write endpoint without rate-limit.
 *
 * Source: OWASP API6:2023. patterns.json TM-A33.
 */
export const postingCommentNeedsRateLimit: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (method !== 'post' && method !== 'put') return [];
  const routePath = String(cpath[cpath.length - 2]);
  if (!COMMENT_PATH_PATTERN.test(routePath)) return [];
  if (opHasRateLimitHeader(op)) return [];
  return [
    {
      message: `Comment/post-style endpoint ${method.toUpperCase()} ${routePath} declares no rate-limit headers — spam-flood risk (OWASP API6).`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// TM-A37 — host-param-flagged-for-ssrf
//
// Parameters named host / hostname / server / origin / target_host raise the
// SSRF flag — even if the value is later validated, declaring such a parameter
// at all warrants explicit acknowledgement (description must mention "allowlist"
// / "validated" / "internal-blocked").
// =============================================================================

const HOST_PARAM_PATTERN = /^(host|hostname|server|origin|target_host|targetHost|destination_host|destinationHost|forward_host|forwardHost|proxy_host|proxyHost)$/i;
const SSRF_ACK_PATTERN = /\b(allowlist|allow-list|whitelist|validated|sanitized|internal\s+blocked|private\s+IPs?\s+blocked|RFC\s*1918|loopback\s+blocked)\b/i;

/**
 * TM-A37 — host/hostname parameters raise SSRF flag.
 *
 * Source: OWASP API7:2023 (SSRF). patterns.json TM-A37.
 */
export const hostParamFlaggedForSsrf: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const param = getResolvedTarget<AnyObj>(targetVal);
  if (!param) return [];
  const name = typeof param.name === 'string' ? param.name : '';
  if (!HOST_PARAM_PATTERN.test(name)) return [];
  const description = typeof param.description === 'string' ? param.description : '';
  if (SSRF_ACK_PATTERN.test(description)) return [];
  return [
    {
      message: `Parameter "${name}" carries a host/hostname value — SSRF risk (OWASP API7); document allowlist/validation in description or rename.`,
      path: [...context.path],
    },
  ];
};

// =============================================================================
// TM-A40 — cors-origin-reflection-without-allowlist
//
// `Access-Control-Allow-Origin` response header with example/default of `*` OR
// of a wildcard-suffix pattern (`https://*.example.com`) without an explicit
// allowlist mention is over-permissive. Flag the header itself as
// review-territory.
// =============================================================================

const ORIGIN_HEADER_NAMES = new Set([
  'access-control-allow-origin',
  'access-control-allow-credentials',
]);

/**
 * TM-A40 — CORS Access-Control-Allow-Origin without allowlist hint.
 *
 * Source: OWASP CORS Origin-Header-Scrutiny + OWASP API8:2023. patterns.json TM-A40.
 */
export const corsOriginReflectionWithoutAllowlist: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const headers = getResolvedTarget<AnyObj>(targetVal);
  if (!headers) return [];
  const out: IFunctionResult[] = [];
  for (const [hName, hUnknown] of Object.entries(headers)) {
    if (!ORIGIN_HEADER_NAMES.has(hName.toLowerCase())) continue;
    const h = isObject(hUnknown) ? (hUnknown as AnyObj) : null;
    if (!h) continue;
    const description = typeof h.description === 'string' ? h.description : '';
    if (SSRF_ACK_PATTERN.test(description)) continue;
    const sch = isObject(h.schema) ? (h.schema as AnyObj) : null;
    let example = '';
    if (sch) {
      if (typeof sch.example === 'string') example = sch.example;
      else if (typeof sch.default === 'string') example = sch.default;
    }
    if (!example && typeof h.example === 'string') example = h.example;
    const isWildcardish = !example || example === '*' || /\*/.test(example);
    if (isWildcardish) {
      out.push({
        message: `${hName} response header lacks explicit allowlist documentation${
          example ? ` (example: "${example}")` : ''
        } — origin-reflection / wildcard CORS risk (OWASP CORS).`,
        path: [...context.path, hName],
      });
    }
  }
  return out;
};

// =============================================================================
// TM-A41 — browser-api-needs-security-headers
//
// Browser-facing APIs (any operation declaring a 2xx HTML response OR accepting
// `text/html`) SHOULD declare security headers in 2xx responses: HSTS,
// X-Frame-Options OR Content-Security-Policy.
// =============================================================================

const SECURITY_HEADER_NAMES = new Set([
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
]);

function opIsBrowserFacing(op: AnyObj): boolean {
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : null;
  if (!responses) return false;
  for (const r of Object.values(responses)) {
    if (!isObject(r)) continue;
    const content = isObject(r.content) ? (r.content as AnyObj) : null;
    if (!content) continue;
    for (const mt of Object.keys(content)) {
      if (mt.toLowerCase().includes('text/html')) return true;
    }
  }
  return false;
}

/**
 * TM-A41 — browser-facing API SHOULD declare security headers.
 *
 * Source: OWASP Secure Headers Project. patterns.json TM-A41.
 */
export const browserApiNeedsSecurityHeaders: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  if (!opIsBrowserFacing(op)) return [];
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : null;
  if (!responses) return [];
  let foundSecHeader = false;
  for (const [code, rUnknown] of Object.entries(responses)) {
    if (!/^2\d\d$/.test(code)) continue;
    const r = isObject(rUnknown) ? (rUnknown as AnyObj) : null;
    if (!r) continue;
    const headers = isObject(r.headers) ? (r.headers as AnyObj) : null;
    if (!headers) continue;
    for (const hName of Object.keys(headers)) {
      if (SECURITY_HEADER_NAMES.has(hName.toLowerCase())) {
        foundSecHeader = true;
        break;
      }
    }
    if (foundSecHeader) break;
  }
  if (foundSecHeader) return [];
  return [
    {
      message: 'Browser-facing operation (text/html response) declares no Strict-Transport-Security / Content-Security-Policy / X-Frame-Options headers (OWASP Secure Headers Project).',
      path: [...context.path, 'responses'],
    },
  ];
};

// =============================================================================
// TM-A49 — upstream-url-op-needs-5xx-explicit
//
// Sharper than P2 TM-A36 (which checks for any 5xx OR `default`). TM-A49
// requires explicit 502 / 503 / 504 declarations — the upstream-failure shapes
// that clients must distinguish (Bad Gateway / Service Unavailable / Gateway
// Timeout). OWASP API10 (Unsafe API Consumption).
// =============================================================================

const UPSTREAM_URL_PARAM_PATTERN = /^(url|uri|webhook(_|-)?url|callback(_|-)?url|redirect(_|-)?url|redirect(_|-)?uri|source(_|-)?(url|uri)|target(_|-)?url|fetch(_|-)?url|origin(_|-)?url|external(_|-)?url|upstream(_|-)?url)$/i;

function opConsumesUpstreamUrl(op: AnyObj): boolean {
  const params = Array.isArray(op.parameters) ? (op.parameters as AnyObj[]) : [];
  for (const p of params) {
    if (!isObject(p)) continue;
    const n = typeof p.name === 'string' ? p.name : '';
    if (UPSTREAM_URL_PARAM_PATTERN.test(n)) return true;
  }
  const rb = isObject(op.requestBody) ? (op.requestBody as AnyObj) : null;
  if (!rb) return false;
  const content = isObject(rb.content) ? (rb.content as AnyObj) : null;
  if (!content) return false;
  for (const mt of Object.values(content)) {
    if (!isObject(mt)) continue;
    const sch = isObject(mt.schema) ? (mt.schema as AnyObj) : null;
    if (!sch) continue;
    const props = isObject(sch.properties) ? (sch.properties as AnyObj) : null;
    if (!props) continue;
    for (const pn of Object.keys(props)) {
      if (UPSTREAM_URL_PARAM_PATTERN.test(pn)) return true;
    }
  }
  return false;
}

/**
 * TM-A49 — upstream-URL op MUST declare 502 / 503 / 504 explicitly.
 *
 * Source: OWASP API10:2023 (Unsafe Consumption of APIs). patterns.json TM-A49.
 */
export const upstreamUrlOpNeeds5xxExplicit: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  if (!opConsumesUpstreamUrl(op)) return [];
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : null;
  if (!responses) return [];
  const codes = Object.keys(responses);
  const missing: string[] = [];
  for (const code of ['502', '503', '504']) {
    if (!codes.includes(code)) missing.push(code);
  }
  if (missing.length === 0) return [];
  return [
    {
      message: `Upstream-URL op declares responses [${codes.join(', ')}] but lacks explicit ${missing.join(' / ')} — clients cannot distinguish gateway failure modes (OWASP API10).`,
      path: [...context.path, 'responses'],
    },
  ];
};

// =============================================================================
// TM-A51 — webhook-rejects-wildcard-content-type
//
// Webhook receivers (paths matching /webhook|/hooks/|/event-receiver) MUST NOT
// accept `*\/*` as content-type. Strict content-type pinning blocks bypass
// attempts via Content-Type-confusion. OWASP API10 + GitHub-hardening.
// =============================================================================

const WEBHOOK_PATH_PATTERN = /\/(webhooks?|hooks|event[-_]receivers?|callbacks?|notifications?\/receive|listeners?)(\/|$)/i;

/**
 * TM-A51 — webhook receivers must not accept wildcard content-type.
 *
 * Source: OWASP API10:2023 + GitHub webhook-hardening. patterns.json TM-A51.
 */
export const webhookRejectsWildcardContentType: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (method !== 'post' && method !== 'put') return [];
  const routePath = String(cpath[cpath.length - 2]);
  if (!WEBHOOK_PATH_PATTERN.test(routePath)) return [];
  const rb = isObject(op.requestBody) ? (op.requestBody as AnyObj) : null;
  if (!rb) return [];
  const content = isObject(rb.content) ? (rb.content as AnyObj) : null;
  if (!content) return [];
  const out: IFunctionResult[] = [];
  for (const mt of Object.keys(content)) {
    const lower = mt.toLowerCase();
    if (lower === '*/*' || lower === 'application/*' || lower === 'text/*') {
      out.push({
        message: `Webhook ${method.toUpperCase()} ${routePath} accepts wildcard content-type "${mt}" — content-type-confusion bypass risk (OWASP API10 + GitHub hardening).`,
        path: [...cpath, 'requestBody', 'content', mt],
      });
    }
  }
  return out;
};
