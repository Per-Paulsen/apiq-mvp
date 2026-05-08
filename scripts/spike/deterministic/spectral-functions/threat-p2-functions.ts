/**
 * Custom Spectral functions for the P2 Threat-Modeling ruleset (T16b / Welle C).
 *
 * Spectral's built-in functions cover most P2 rules; these custom callables
 * handle multi-step / cross-resource validation that pure DSL can't express.
 *
 * Rules backed by these functions (registered in spectral-runner.ts and the
 * threat-p2-rules.test.ts harness):
 *
 *   - tm-a2-object-id-write-op-needs-security:        TM-A2  — write op on
 *                                                     /resource/{id} SHOULD
 *                                                     declare security.
 *   - tm-a7-oauth2-authcode-pkce-recommended:         TM-A7  — OAuth2 authCode
 *                                                     SHOULD declare PKCE
 *                                                     marker (x-pkce-required
 *                                                     extension or scope hint).
 *   - tm-a9-login-endpoint-rate-limit:                TM-A9  — Login endpoint
 *                                                     with password field MUST
 *                                                     declare rate-limit
 *                                                     headers (RFC 9745 +
 *                                                     OWASP API2).
 *   - tm-a14-schema-reuse-without-readonly-writeonly: TM-A14 — Same component
 *                                                     schema reused as request
 *                                                     AND response without
 *                                                     readOnly/writeOnly flags.
 *   - tm-a18-recursive-schema-needs-max-depth:        TM-A18 — Recursive
 *                                                     schemas SHOULD declare
 *                                                     maxDepth marker.
 *   - tm-a28-admin-description-without-security:      TM-A28 — operation with
 *                                                     "admin"/"internal" in
 *                                                     description but no
 *                                                     security declared.
 *   - tm-a36-upstream-url-needs-error-responses:      TM-A36 — operation
 *                                                     consuming an external
 *                                                     URL parameter MUST
 *                                                     declare 4xx/5xx error
 *                                                     responses.
 *   - tm-a45-multi-version-servers-need-deprecation:  TM-A45 — Multi-version
 *                                                     servers (v1 + v2 in
 *                                                     same spec) SHOULD have
 *                                                     one marked deprecated.
 *   - tm-a46-deprecated-needs-sunset-replacement:     TM-A46 — operations
 *                                                     marked `deprecated:true`
 *                                                     MUST declare a Sunset
 *                                                     response-header AND a
 *                                                     replacement endpoint.
 *   - tm-a47-info-version-server-url-drift:           TM-A47 — info.version
 *                                                     prefix MUST agree with
 *                                                     server-URL `/v{n}/`.
 *   - rfc2-3-problem-details-status-matches-http:     RFC2-3 — problem-details
 *                                                     `status` field default
 *                                                     MUST match enclosing HTTP
 *                                                     response status.
 *   - rfc2-conditional-request-correctness:           RFC2-20/21/22/25/26 —
 *                                                     bundle:
 *                                                     If-Match→412 ;
 *                                                     If-None-Match GET→304;
 *                                                     If-None-Match write→412;
 *                                                     304→ETag/Last-Modified;
 *                                                     412→conditional param.
 *   - rfc2-32-partial-content-needs-content-range:    RFC2-32 — 206 response
 *                                                     MUST declare
 *                                                     Content-Range header.
 *   - rfc2-59-bearer-401-www-authenticate-realm:      RFC2-59 — bearer
 *                                                     securityScheme + 401
 *                                                     response → WWW-Authenticate
 *                                                     header carrying "Bearer"
 *                                                     scheme + `realm`.
 *   - rfc2-97-patch-content-type-correct:             RFC2-97 — PATCH op MUST
 *                                                     declare a JSON-Patch
 *                                                     content-type
 *                                                     (application/json-patch+json
 *                                                     OR application/merge-patch+json).
 *
 * Sources (file-level; see per-callable headers below for per-rule cite):
 *   - OWASP API Top-10 (2023) https://owasp.org/API-Security/editions/2023/
 *   - RFC 9110 (HTTP Semantics, 2022) https://www.rfc-editor.org/rfc/rfc9110
 *   - RFC 9457 (HTTP Problem Details, 2023) https://www.rfc-editor.org/rfc/rfc9457
 *   - RFC 8594 (Sunset HTTP Header, 2019) https://www.rfc-editor.org/rfc/rfc8594
 *   - RFC 9745 (Deprecation HTTP Header, 2025) https://www.rfc-editor.org/rfc/rfc9745
 *   - RFC 9700 (BCP-240 OAuth 2.0 Security, 2025) https://www.rfc-editor.org/rfc/rfc9700
 *   - RFC 6750 (Bearer Token Usage) https://www.rfc-editor.org/rfc/rfc6750
 *   - RFC 7396 (JSON Merge Patch) https://www.rfc-editor.org/rfc/rfc7396
 *   - RFC 6902 (JSON Patch) https://www.rfc-editor.org/rfc/rfc6902
 *
 * Lens: 1 (Threat-Modeling), with Lens-2 (Standards-Compliance) cross-cuts on
 *        the RFC2-* family.
 * Round: 2 (Welle C / T16b)
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

// =============================================================================
// TM-A2 — object-id-write-op-needs-security
//
// Write-ops (POST/PUT/PATCH/DELETE) on a path containing an `{id}`-template
// segment MUST declare `security` (or rely on spec-level `security`). This is
// sharper than Y-23: BOLA-prone resource-write paths are higher-risk than
// arbitrary writes. We flag when neither operation-level nor spec-level
// security is declared.
// =============================================================================

const ID_TEMPLATE_PATTERN = /\{[^}]*(id|uuid|key|name|slug|code|sku|hash)[^}]*\}/i;

/**
 * TM-A2 — object-id-write-op-needs-security.
 *
 * Source: OWASP API1:2023 (BOLA) — verbatim "object-level authorization checks
 *         should be considered in every function that accesses a data source
 *         using an ID from the user". rules-brainstorm.md TM-A2 (P2).
 */
export const objectIdWriteOpNeedsSecurity: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (!['post', 'put', 'patch', 'delete'].includes(method)) return [];
  const routePath = String(cpath[cpath.length - 2]);
  if (!ID_TEMPLATE_PATTERN.test(routePath)) return [];
  // Operation-level security wins.
  if (Array.isArray(op.security)) return [];
  // Spec-level security inherited.
  const document = context.document?.data as AnyObj | undefined;
  if (document && Array.isArray(document.security) && document.security.length > 0) {
    return [];
  }
  return [
    {
      message: `Write op ${method.toUpperCase()} ${routePath} acts on resource-{id} but declares no \`security\` (BOLA-risk per OWASP API1).`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// TM-A7 — oauth2-authcode-pkce-recommended
//
// RFC 9700 BCP-240 §2.1.1: authorizationCode flow SHOULD use PKCE.
// OAS doesn't have a first-class `pkce: true` field; we look for the OAS
// `x-pkce-required` extension OR a description-mention (case-insensitive).
// =============================================================================

/**
 * TM-A7 — OAuth2 authCode flow SHOULD declare PKCE.
 *
 * Source: RFC 9700 (BCP-240) §2.1.1 — verbatim "Clients MUST use PKCE".
 *         rules-brainstorm.md TM-A7 (P2).
 */
export const oauth2AuthCodePkceRecommended: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const flows = getResolvedTarget<AnyObj>(targetVal);
  if (!flows) return [];
  const auth = isObject(flows.authorizationCode) ? flows.authorizationCode : null;
  if (!auth) return [];
  // PKCE-marker heuristics:
  //  1. extension `x-pkce-required: true`
  //  2. extension `x-pkce: true`
  //  3. description mentions "PKCE" / "code_challenge"
  if (auth['x-pkce-required'] === true || auth['x-pkce'] === true) return [];
  const descBag: string[] = [];
  for (const k of ['description', 'x-description']) {
    const v = auth[k];
    if (typeof v === 'string') descBag.push(v);
  }
  // Climb up to securityScheme.description and apiq-spec.info.description?
  // Just check local description text for now.
  const blob = descBag.join(' ');
  if (/PKCE|code_challenge|code-challenge/i.test(blob)) return [];
  return [
    {
      message:
        'OAuth2 authorizationCode flow SHOULD declare PKCE (RFC 9700 BCP-240 §2.1.1) — add `x-pkce-required: true` extension or mention PKCE in the flow description.',
      path: [...context.path, 'authorizationCode'],
    },
  ];
};

// =============================================================================
// TM-A9 — login-endpoint-rate-limit
//
// Login endpoints (path matches /login|/signin|/auth/token, or has a
// password-field in requestBody) MUST declare rate-limit headers per OWASP
// API2:2023 + RFC 9745 Deprecation/RateLimit.
// =============================================================================

const LOGIN_PATH_PATTERN = /\/(login|signin|sign-?in|authenticate|auth\/(?:login|token|signin))(\/|$)/i;
const PASSWORD_FIELD_PATTERN = /^(password|pwd|passwd|secret|passphrase)$/i;
const RATE_LIMIT_HEADER_PATTERNS = [
  /^x-ratelimit-/i,
  /^ratelimit-/i,
  /^x-rate-limit-/i,
  /^retry-after$/i,
];

function operationHasPasswordField(op: AnyObj): boolean {
  const rb = isObject(op.requestBody) ? op.requestBody : null;
  if (!rb) return false;
  const content = isObject(rb.content) ? rb.content : null;
  if (!content) return false;
  for (const mt of Object.values(content)) {
    const mtObj = isObject(mt) ? mt : null;
    if (!mtObj) continue;
    const sch = isObject(mtObj.schema) ? mtObj.schema : null;
    if (!sch) continue;
    const props = isObject(sch.properties) ? sch.properties : null;
    if (!props) continue;
    for (const propName of Object.keys(props)) {
      if (PASSWORD_FIELD_PATTERN.test(propName)) return true;
    }
  }
  return false;
}

function operationHasRateLimitHeader(op: AnyObj): boolean {
  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) return false;
  for (const rUnknown of Object.values(responses)) {
    const r = isObject(rUnknown) ? rUnknown : null;
    if (!r) continue;
    const headers = isObject(r.headers) ? r.headers : null;
    if (!headers) continue;
    for (const headerName of Object.keys(headers)) {
      if (RATE_LIMIT_HEADER_PATTERNS.some((re) => re.test(headerName))) return true;
    }
  }
  return false;
}

/**
 * TM-A9 — login endpoint MUST declare rate-limit headers.
 *
 * Source: OWASP API2:2023 + RFC 9745 (Deprecation/RateLimit, 2025).
 *         rules-brainstorm.md TM-A9 (P2).
 */
export const loginEndpointRateLimit: IFunction = function (
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
  const isLogin =
    LOGIN_PATH_PATTERN.test(routePath) || operationHasPasswordField(op);
  if (!isLogin) return [];
  if (operationHasRateLimitHeader(op)) return [];
  return [
    {
      message: `Login endpoint ${method.toUpperCase()} ${routePath} lacks rate-limit headers — credential-stuffing risk per OWASP API2 + RFC 9745.`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// TM-A14 — schema-reuse-without-readonly-writeonly
//
// A component-schema referenced from BOTH a request body AND a response body
// MUST mark id-/created_at-style fields `readOnly: true` and password-/
// secret-style fields `writeOnly: true`. Otherwise client SDKs see the same
// shape on both sides and either expose internal-state on input or tolerate
// secrets on output.
//
// Given: $  (whole document). Builds a schema-usage index, then per-schema
// emits findings if reused with no RO/WO discrimination.
// =============================================================================

/**
 * TM-A14 — schema reused req+resp without readOnly/writeOnly.
 *
 * Source: OWASP API3:2023 + 42Crunch security-rules. rules-brainstorm.md
 *         TM-A14 (P2).
 */
export const schemaReuseWithoutReadOnlyWriteOnly: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const components = isObject(doc.components) ? doc.components : null;
  const schemas = components && isObject(components.schemas) ? (components.schemas as AnyObj) : null;
  if (!schemas) return [];

  // Build schema-usage index by scanning paths/*/*/{requestBody,responses}.
  const usage = new Map<string, { req: boolean; resp: boolean }>();
  const pathsObj = isObject(doc.paths) ? doc.paths : null;
  if (!pathsObj) return [];

  function recordRefs(node: unknown, side: 'req' | 'resp', visited = new Set<unknown>()) {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const item of node) recordRefs(item, side, visited);
      return;
    }
    const obj = node as AnyObj;
    if (typeof obj.$ref === 'string') {
      const m = /^#\/components\/schemas\/(.+)$/.exec(obj.$ref);
      if (m && m[1]) {
        const name = m[1];
        const cur = usage.get(name) ?? { req: false, resp: false };
        if (side === 'req') cur.req = true;
        else cur.resp = true;
        usage.set(name, cur);
      }
      return;
    }
    for (const v of Object.values(obj)) recordRefs(v, side, visited);
  }

  for (const pathItem of Object.values(pathsObj)) {
    if (!isObject(pathItem)) continue;
    for (const [k, opUnknown] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'].includes(k)) continue;
      const op = isObject(opUnknown) ? opUnknown : null;
      if (!op) continue;
      const rb = isObject(op.requestBody) ? op.requestBody : null;
      if (rb) recordRefs(rb, 'req');
      const responses = isObject(op.responses) ? op.responses : null;
      if (responses) recordRefs(responses, 'resp');
    }
  }

  const out: IFunctionResult[] = [];
  for (const [name, sides] of usage) {
    if (!sides.req || !sides.resp) continue;
    const sch = isObject(schemas[name]) ? (schemas[name] as AnyObj) : null;
    if (!sch) continue;
    const props = isObject(sch.properties) ? (sch.properties as AnyObj) : null;
    if (!props) continue;
    let hasRoOrWo = false;
    for (const propUnknown of Object.values(props)) {
      const p = isObject(propUnknown) ? propUnknown : null;
      if (!p) continue;
      if (p.readOnly === true || p.writeOnly === true) {
        hasRoOrWo = true;
        break;
      }
    }
    if (!hasRoOrWo) {
      out.push({
        message: `Schema "${name}" is reused as both request AND response without any readOnly/writeOnly markers — leak / mass-assignment risk (OWASP API3 + 42Crunch).`,
        path: ['components', 'schemas', name],
      });
    }
  }
  return out;
};

// =============================================================================
// TM-A18 — recursive-schema-needs-max-depth
//
// A schema is recursive if any of its nested properties $-ref's back to itself
// (directly or transitively). Recursive request-bodies without an enforced
// max-depth marker are DoS-risk. We look for an `x-max-depth` extension on
// the schema OR a self-referential `$ref` anywhere in the property tree.
// =============================================================================

/**
 * TM-A18 — recursive schema SHOULD declare max-depth.
 *
 * Source: OWASP API4:2023 + IBM-LI81715. rules-brainstorm.md TM-A18 (P2).
 */
export const recursiveSchemaNeedsMaxDepth: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const components = isObject(doc.components) ? doc.components : null;
  const schemas = components && isObject(components.schemas) ? (components.schemas as AnyObj) : null;
  if (!schemas) return [];

  function refersTo(name: string, sch: unknown, visited = new Set<unknown>()): boolean {
    if (!sch || typeof sch !== 'object' || visited.has(sch)) return false;
    visited.add(sch);
    if (Array.isArray(sch)) {
      return sch.some((item) => refersTo(name, item, visited));
    }
    const obj = sch as AnyObj;
    if (typeof obj.$ref === 'string') {
      const m = /^#\/components\/schemas\/(.+)$/.exec(obj.$ref);
      if (m && m[1] === name) return true;
      // Transitive: follow ref into the schemas map.
      if (m && m[1] && schemas) {
        const target = schemas[m[1]];
        // Cycle-protection via visited set already applied to objects.
        if (target && refersTo(name, target, visited)) return true;
      }
      return false;
    }
    return Object.values(obj).some((v) => refersTo(name, v, visited));
  }

  const out: IFunctionResult[] = [];
  for (const [name, sch] of Object.entries(schemas)) {
    if (!isObject(sch)) continue;
    if (!refersTo(name, sch)) continue;
    const hasDepthHint =
      typeof (sch as AnyObj)['x-max-depth'] === 'number' ||
      typeof (sch as AnyObj)['maxItems'] === 'number';
    if (hasDepthHint) continue;
    out.push({
      message: `Recursive schema "${name}" lacks an \`x-max-depth\` extension (or maxItems) — DoS via deep nesting per OWASP API4.`,
      path: [...context.path, 'components', 'schemas', name],
    });
  }
  return out;
};

// =============================================================================
// TM-A28 — admin-description-without-security
//
// Operation summary or description mentions "admin" / "internal" / "privileged"
// but operation declares no security AND inherits no spec-level security.
// =============================================================================

const ADMIN_DESC_PATTERN = /\b(admin|administrator|internal[-\s]?only|privileged|root[-\s]?only|superuser|super-admin|backoffice|back[-\s]?office)\b/i;

/**
 * TM-A28 — admin-described op without security.
 *
 * Source: OWASP API5:2023. rules-brainstorm.md TM-A28 (P2).
 */
export const adminDescriptionWithoutSecurity: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const summary = typeof op.summary === 'string' ? op.summary : '';
  const description = typeof op.description === 'string' ? op.description : '';
  const blob = `${summary} ${description}`;
  if (!ADMIN_DESC_PATTERN.test(blob)) return [];
  if (Array.isArray(op.security) && op.security.length > 0) return [];
  // op.security may be `[]` (intentional opt-out — we still flag).
  if (Array.isArray(op.security) && op.security.length === 0) {
    return [
      {
        message: `Operation describes admin/internal scope but has \`security: []\` (intentional auth-disable on a privileged endpoint).`,
        path: [...context.path],
      },
    ];
  }
  // Spec-level security check.
  const document = context.document?.data as AnyObj | undefined;
  const docSec = document && Array.isArray(document.security) ? document.security : null;
  if (docSec && docSec.length > 0) return [];
  return [
    {
      message: `Operation summary/description mentions admin/internal scope but declares no \`security\` (OWASP API5 — Broken Function-Level Authorization).`,
      path: [...context.path],
    },
  ];
};

// =============================================================================
// TM-A36 — upstream-url-needs-error-responses
//
// Operation that consumes an external URL (parameter named like *_url /
// callback / webhook / redirect / source_uri) MUST declare 4xx AND 5xx
// responses — upstream calls fail in many ways and clients need typed shapes.
// =============================================================================

const UPSTREAM_URL_PARAM_PATTERN = /^(url|uri|webhook(_|-)?url|callback(_|-)?url|redirect(_|-)?url|redirect(_|-)?uri|source(_|-)?(url|uri)|target(_|-)?url|fetch(_|-)?url|origin(_|-)?url)$/i;

function operationConsumesUpstreamUrl(op: AnyObj): boolean {
  const params = Array.isArray(op.parameters) ? (op.parameters as AnyObj[]) : [];
  for (const p of params) {
    if (!isObject(p)) continue;
    const name = typeof p.name === 'string' ? p.name : '';
    if (UPSTREAM_URL_PARAM_PATTERN.test(name)) return true;
  }
  // Also check requestBody schema property names.
  const rb = isObject(op.requestBody) ? op.requestBody : null;
  if (rb) {
    const content = isObject(rb.content) ? rb.content : null;
    if (content) {
      for (const mt of Object.values(content)) {
        const mtObj = isObject(mt) ? mt : null;
        if (!mtObj) continue;
        const sch = isObject(mtObj.schema) ? mtObj.schema : null;
        if (!sch) continue;
        const props = isObject(sch.properties) ? sch.properties : null;
        if (!props) continue;
        for (const propName of Object.keys(props)) {
          if (UPSTREAM_URL_PARAM_PATTERN.test(propName)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * TM-A36 — upstream-URL op MUST declare 4xx + 5xx error responses.
 *
 * Source: OWASP API7:2023 (SSRF) + OWASP API10:2023 (Unsafe Consumption of APIs).
 *         rules-brainstorm.md TM-A36 (P2).
 */
export const upstreamUrlNeedsErrorResponses: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  if (!operationConsumesUpstreamUrl(op)) return [];
  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) {
    return [
      {
        message:
          'Operation consumes an upstream URL but declares no responses — clients cannot model the upstream error-shape (OWASP API10).',
        path: [...context.path],
      },
    ];
  }
  let has4xx = false;
  let has5xx = false;
  for (const code of Object.keys(responses)) {
    if (/^4\d\d$/.test(code)) has4xx = true;
    if (/^5\d\d$/.test(code) || code === 'default') has5xx = true;
  }
  if (has4xx && has5xx) return [];
  const missing: string[] = [];
  if (!has4xx) missing.push('4xx');
  if (!has5xx) missing.push('5xx (or default)');
  return [
    {
      message: `Operation consumes an upstream URL but lacks ${missing.join(' + ')} response declaration (OWASP API7/API10).`,
      path: [...context.path, 'responses'],
    },
  ];
};

// =============================================================================
// TM-A45 — multi-version-servers-need-deprecation
//
// If the spec declares ≥2 server URLs with different /v{N}/ prefixes, exactly
// one must NOT be deprecated (the current). If none flagged deprecated, flag
// — multi-version-spec without deprecation tracking is operational debt.
// =============================================================================

const VERSION_PREFIX = /\/v(\d+(?:\.\d+)*)(?:\/|$)/i;

/**
 * TM-A45 — multi-version-spec needs deprecation marker.
 *
 * Source: OWASP API9:2023 (Improper Inventory Management). rules-brainstorm.md
 *         TM-A45 (P2).
 */
export const multiVersionServersNeedDeprecation: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const servers = Array.isArray(doc.servers) ? (doc.servers as AnyObj[]) : null;
  if (!servers || servers.length < 2) return [];
  const versions = new Set<string>();
  for (const s of servers) {
    if (!isObject(s)) continue;
    const url = typeof s.url === 'string' ? s.url : '';
    const m = VERSION_PREFIX.exec(url);
    if (m && m[1]) versions.add(m[1]);
  }
  if (versions.size < 2) return [];
  // Look for "deprecated" hint on any server: `description` text or `x-deprecated: true`.
  let anyDeprecated = false;
  for (const s of servers) {
    if (!isObject(s)) continue;
    if (s['x-deprecated'] === true) {
      anyDeprecated = true;
      break;
    }
    const desc = typeof s.description === 'string' ? s.description : '';
    if (/\bdeprecated\b/i.test(desc)) {
      anyDeprecated = true;
      break;
    }
  }
  if (anyDeprecated) return [];
  return [
    {
      message: `Spec declares ${versions.size} different API versions in \`servers\` but none is marked deprecated — version-management debt (OWASP API9).`,
      path: [...context.path, 'servers'],
    },
  ];
};

// =============================================================================
// TM-A46 — deprecated-needs-sunset-replacement
//
// Operation marked `deprecated: true` MUST declare a Sunset response-header
// (RFC 8594) AND a replacement path in description (OAS-extension `x-replaced-by`
// or text-mention "Use /v2/...").
// =============================================================================

/**
 * TM-A46 — deprecated op needs sunset header + replacement.
 *
 * Source: OWASP API9 + RFC 8594 (Sunset HTTP Header) + RFC 9745 (Deprecation
 *         HTTP Header, 2025). rules-brainstorm.md TM-A46 (P2).
 */
export const deprecatedNeedsSunsetReplacement: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  if (op.deprecated !== true) return [];
  // Sunset header on any 2xx/3xx response?
  const responses = isObject(op.responses) ? op.responses : null;
  let hasSunset = false;
  if (responses) {
    for (const rUnknown of Object.values(responses)) {
      const r = isObject(rUnknown) ? rUnknown : null;
      if (!r) continue;
      const headers = isObject(r.headers) ? r.headers : null;
      if (!headers) continue;
      for (const hName of Object.keys(headers)) {
        if (hName.toLowerCase() === 'sunset' || hName.toLowerCase() === 'deprecation') {
          hasSunset = true;
          break;
        }
      }
      if (hasSunset) break;
    }
  }
  // Replacement hint: x-replaced-by extension or description mentions "use /v2"...
  const desc = typeof op.description === 'string' ? op.description : '';
  const summary = typeof op.summary === 'string' ? op.summary : '';
  const blob = `${desc} ${summary}`;
  const hasReplacement =
    op['x-replaced-by'] !== undefined ||
    op['x-deprecated-by'] !== undefined ||
    /\b(use|see|migrate to|replaced by)\b[^.]*?(\/v\d|\/(?:api|rest)\/|new endpoint|alternative)/i.test(
      blob
    );
  const out: IFunctionResult[] = [];
  if (!hasSunset) {
    out.push({
      message:
        'Operation marked `deprecated: true` lacks a Sunset (or Deprecation) response-header (RFC 8594 + RFC 9745).',
      path: [...context.path],
    });
  }
  if (!hasReplacement) {
    out.push({
      message:
        'Operation marked `deprecated: true` lacks replacement guidance (`x-replaced-by` extension or "use /vN/..." in description) — agents cannot self-migrate.',
      path: [...context.path],
    });
  }
  return out;
};

// =============================================================================
// TM-A47 — info-version-server-url-drift
//
// info.version major MUST agree with /v{N}/ prefix on any production server.
// E.g. info.version="2.5.0" but server-URL="/v1/" → drift.
// =============================================================================

/**
 * TM-A47 — info.version vs server-URL version-prefix drift.
 *
 * Source: OWASP API9. rules-brainstorm.md TM-A47 (P2).
 */
export const infoVersionServerUrlDrift: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const info = isObject(doc.info) ? doc.info : null;
  if (!info) return [];
  const ver = typeof info.version === 'string' ? info.version : '';
  const majorMatch = /^(\d+)/.exec(ver.trim());
  if (!majorMatch) return [];
  const infoMajor = majorMatch[1]!;
  const servers = Array.isArray(doc.servers) ? (doc.servers as AnyObj[]) : null;
  if (!servers || servers.length === 0) return [];
  const out: IFunctionResult[] = [];
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    if (!isObject(s)) continue;
    const url = typeof s.url === 'string' ? s.url : '';
    const vm = VERSION_PREFIX.exec(url);
    if (!vm || !vm[1]) continue;
    const serverMajor = vm[1].split('.')[0]!;
    if (serverMajor !== infoMajor) {
      out.push({
        message: `info.version "${ver}" major (${infoMajor}) differs from server-URL major (${serverMajor}) at servers[${i}] — version-drift confuses clients (OWASP API9).`,
        path: [...context.path, 'servers', i],
      });
    }
  }
  return out;
};

// =============================================================================
// RFC2-3 — problem-details-status-matches-http-status
//
// Per RFC 9457 §3.1.2: "the value of `status` SHOULD be the same as the HTTP
// response status code". When a response of status N declares an
// application/problem+json body whose schema contains a `status` field with
// example/default/const != N → flag.
// =============================================================================

/**
 * RFC2-3 — problem-details `status` MUST match HTTP response status.
 *
 * Source: RFC 9457 §3.1.2 — verbatim "the same as the HTTP response status".
 *         rules-brainstorm.md RFC2-3 (P2).
 */
export const problemDetailsStatusMatchesHttpStatus: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const responses = getResolvedTarget<AnyObj>(targetVal);
  if (!responses) return [];
  const out: IFunctionResult[] = [];
  for (const [statusKey, rUnknown] of Object.entries(responses)) {
    if (!/^[1-5]\d\d$/.test(statusKey)) continue;
    const expectedStatus = Number(statusKey);
    const r = isObject(rUnknown) ? rUnknown : null;
    if (!r) continue;
    const content = isObject(r.content) ? r.content : null;
    if (!content) continue;
    const pjsonMt = (content as AnyObj)['application/problem+json'];
    if (!isObject(pjsonMt)) continue;
    const sch = isObject(pjsonMt.schema) ? pjsonMt.schema : null;
    if (!sch) continue;
    const props = isObject(sch.properties) ? sch.properties : null;
    if (!props) continue;
    const statusProp = isObject(props.status) ? props.status : null;
    if (!statusProp) continue;
    const candidates: unknown[] = [];
    if (statusProp.example !== undefined) candidates.push(statusProp.example);
    if (statusProp.default !== undefined) candidates.push(statusProp.default);
    if (statusProp.const !== undefined) candidates.push(statusProp.const);
    if (Array.isArray(statusProp.enum) && statusProp.enum.length === 1) {
      candidates.push(statusProp.enum[0]);
    }
    for (const cand of candidates) {
      const num = typeof cand === 'string' ? Number(cand) : (cand as number);
      if (typeof num === 'number' && Number.isFinite(num) && num !== expectedStatus) {
        out.push({
          message: `problem+json status "${cand}" does not match enclosing HTTP status ${statusKey} (RFC 9457 §3.1.2).`,
          path: [...context.path, statusKey, 'content', 'application/problem+json', 'schema', 'properties', 'status'],
        });
        break;
      }
    }
  }
  return out;
};

// =============================================================================
// RFC2-conditional-request-correctness — bundles RFC2-20/21/22/25/26.
//
// Logic per operation:
//   - If the op has `If-Match` parameter → MUST declare 412 response.        (RFC2-20)
//   - If the op is GET/HEAD with `If-None-Match` → SHOULD declare 304.       (RFC2-21)
//   - If the op is PUT/PATCH/DELETE with `If-None-Match` → MUST declare 412. (RFC2-22)
//   - If the op declares 304 → SHOULD declare ETag/Last-Modified header
//     OR have an If-None-Match/If-Modified-Since parameter.                  (RFC2-25)
//   - If the op declares 412 → SHOULD have an If-Match/If-Unmodified-Since
//     parameter.                                                             (RFC2-26)
// =============================================================================

function paramByName(op: AnyObj, name: string, location?: string): AnyObj | null {
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
  return Object.keys(headers).some((k) => k.toLowerCase() === headerName.toLowerCase());
}

/**
 * RFC2-20/21/22/25/26 — conditional-request correctness bundle.
 *
 * Source: RFC 9110 §13 (Conditional Requests). rules-brainstorm.md
 *         RFC2-20/21/22/25/26 (P2).
 */
export const conditionalRequestCorrectness: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : {};
  const has412 = '412' in responses;
  const has304 = '304' in responses;
  const ifMatch = paramByName(op, 'If-Match', 'header');
  const ifNoneMatch = paramByName(op, 'If-None-Match', 'header');
  const ifUnmodifiedSince = paramByName(op, 'If-Unmodified-Since', 'header');
  const ifModifiedSince = paramByName(op, 'If-Modified-Since', 'header');
  const out: IFunctionResult[] = [];

  // RFC2-20 — If-Match → 412
  if (ifMatch && !has412) {
    out.push({
      message: 'Operation declares `If-Match` parameter but no 412 (Precondition Failed) response — RFC 9110 §13.1.1.',
      path: [...cpath, 'responses'],
    });
  }
  // RFC2-21 — If-None-Match GET/HEAD → 304
  if (ifNoneMatch && (method === 'get' || method === 'head') && !has304) {
    out.push({
      message: 'Operation accepts `If-None-Match` on GET/HEAD but no 304 (Not Modified) response declared — RFC 9110 §13.1.2.',
      path: [...cpath, 'responses'],
    });
  }
  // RFC2-22 — If-None-Match PUT/PATCH/DELETE → 412
  if (
    ifNoneMatch &&
    ['put', 'patch', 'delete', 'post'].includes(method) &&
    !has412
  ) {
    out.push({
      message: `Operation accepts \`If-None-Match\` on ${method.toUpperCase()} but no 412 response declared — RFC 9110 §13.1.2.`,
      path: [...cpath, 'responses'],
    });
  }
  // RFC2-25 — 304 needs ETag or Last-Modified header (on the 304 response itself)
  // OR a conditional-param.
  if (has304) {
    const r304 = isObject(responses['304']) ? (responses['304'] as AnyObj) : null;
    const hasETag = r304 ? responseHasHeader(r304, 'ETag') : false;
    const hasLM = r304 ? responseHasHeader(r304, 'Last-Modified') : false;
    const hasCondParam = !!(ifNoneMatch || ifModifiedSince);
    if (!hasETag && !hasLM && !hasCondParam) {
      out.push({
        message: '304 response declared without ETag / Last-Modified header AND without an If-None-Match / If-Modified-Since parameter — RFC 9110 §15.4.5.',
        path: [...cpath, 'responses', '304'],
      });
    }
  }
  // RFC2-26 — 412 needs an If-Match or If-Unmodified-Since parameter.
  if (has412 && !ifMatch && !ifUnmodifiedSince) {
    out.push({
      message: '412 response declared without an If-Match / If-Unmodified-Since parameter — RFC 9110 §15.5.13.',
      path: [...cpath, 'responses', '412'],
    });
  }
  return out;
};

// =============================================================================
// RFC2-32 — partial-content-needs-content-range
//
// 206 (Partial Content) response MUST declare a Content-Range header per
// RFC 9110 §15.3.7 verbatim "MUST".
// =============================================================================

/**
 * RFC2-32 — 206 → Content-Range REQUIRED.
 *
 * Source: RFC 9110 §15.3.7 — verbatim "MUST generate Content-Range".
 *         rules-brainstorm.md RFC2-32 (P2).
 */
export const partialContentNeedsContentRange: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const responses = isObject(op.responses) ? (op.responses as AnyObj) : null;
  if (!responses) return [];
  const r206 = isObject(responses['206']) ? (responses['206'] as AnyObj) : null;
  if (!r206) return [];
  if (responseHasHeader(r206, 'Content-Range')) return [];
  return [
    {
      message: '206 (Partial Content) response MUST declare a Content-Range header (RFC 9110 §15.3.7 — verbatim "MUST generate Content-Range").',
      path: [...context.path, 'responses', '206'],
    },
  ];
};

// =============================================================================
// RFC2-59 — bearer-401-www-authenticate-realm
//
// If the spec declares a bearer http securityScheme AND any operation has a
// 401 response, the 401 SHOULD declare a WWW-Authenticate header AND the
// schema/example SHOULD include `Bearer` and `realm=`.
// =============================================================================

/**
 * RFC2-59 — Bearer 401 → WWW-Authenticate carrying realm.
 *
 * Source: RFC 6750 §3 — verbatim "WWW-Authenticate: Bearer realm=...".
 *         rules-brainstorm.md RFC2-59 (P2).
 */
export const bearer401WwwAuthenticateRealm: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  const components = isObject(doc.components) ? doc.components : null;
  const securitySchemes =
    components && isObject(components.securitySchemes)
      ? (components.securitySchemes as AnyObj)
      : null;
  if (!securitySchemes) return [];
  let hasBearerScheme = false;
  for (const ss of Object.values(securitySchemes)) {
    if (!isObject(ss)) continue;
    if (ss.type === 'http' && (ss.scheme === 'bearer' || ss.scheme === 'Bearer')) {
      hasBearerScheme = true;
      break;
    }
  }
  if (!hasBearerScheme) return [];
  const out: IFunctionResult[] = [];
  const pathsObj = isObject(doc.paths) ? (doc.paths as AnyObj) : null;
  if (!pathsObj) return [];
  for (const [pname, pitem] of Object.entries(pathsObj)) {
    if (!isObject(pitem)) continue;
    for (const [method, opUnknown] of Object.entries(pitem)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
      const op = isObject(opUnknown) ? opUnknown : null;
      if (!op) continue;
      const responses = isObject(op.responses) ? (op.responses as AnyObj) : null;
      if (!responses) continue;
      const r401 = isObject(responses['401']) ? (responses['401'] as AnyObj) : null;
      if (!r401) continue;
      // WWW-Authenticate present?
      const headers = isObject(r401.headers) ? (r401.headers as AnyObj) : null;
      if (!headers) {
        out.push({
          message: `401 response on ${method.toUpperCase()} ${pname} has no WWW-Authenticate header — Bearer scheme requires \`Bearer realm=\` per RFC 6750 §3.`,
          path: [...context.path, 'paths', pname, method, 'responses', '401'],
        });
        continue;
      }
      const wwwName = Object.keys(headers).find(
        (k) => k.toLowerCase() === 'www-authenticate'
      );
      if (!wwwName) {
        out.push({
          message: `401 response on ${method.toUpperCase()} ${pname} lacks WWW-Authenticate header — RFC 6750 §3.`,
          path: [...context.path, 'paths', pname, method, 'responses', '401'],
        });
        continue;
      }
      const wwwHeader = isObject(headers[wwwName]) ? (headers[wwwName] as AnyObj) : null;
      // Inspect schema example/default for Bearer + realm.
      let exampleStr = '';
      if (wwwHeader) {
        const sch = isObject(wwwHeader.schema) ? (wwwHeader.schema as AnyObj) : null;
        if (sch) {
          if (typeof sch.example === 'string') exampleStr = sch.example;
          else if (typeof sch.default === 'string') exampleStr = sch.default;
        }
        if (!exampleStr && typeof wwwHeader.example === 'string')
          exampleStr = wwwHeader.example as string;
      }
      if (exampleStr && !/Bearer/i.test(exampleStr)) {
        out.push({
          message: `WWW-Authenticate example "${exampleStr}" lacks "Bearer" — Bearer scheme expected (RFC 6750 §3).`,
          path: [...context.path, 'paths', pname, method, 'responses', '401', 'headers', wwwName],
        });
      } else if (exampleStr && !/realm\s*=/i.test(exampleStr)) {
        out.push({
          message: `WWW-Authenticate example "${exampleStr}" lacks \`realm=\` — RFC 6750 §3.`,
          path: [...context.path, 'paths', pname, method, 'responses', '401', 'headers', wwwName],
        });
      }
    }
  }
  return out;
};

// =============================================================================
// RFC2-97 — patch-content-type-correct
//
// PATCH operations MUST declare requestBody.content with at least one of
// `application/json-patch+json` (RFC 6902) OR `application/merge-patch+json`
// (RFC 7396). Plain `application/json` is non-conformant per RFC 5789 §2.
// =============================================================================

const PATCH_CONFORMANT_MEDIA_TYPES = new Set([
  'application/json-patch+json',
  'application/merge-patch+json',
  'application/strategic-merge-patch+json',
  'application/json-patch',
]);

/**
 * RFC2-97 — PATCH MUST declare merge-patch+json OR json-patch+json content-type.
 *
 * Source: RFC 7396 (Merge Patch) + RFC 6902 (JSON Patch) + RFC 5789 §2 (PATCH).
 *         rules-brainstorm.md RFC2-97 (P2).
 */
export const patchContentTypeCorrect: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  const method = String(cpath[cpath.length - 1]).toLowerCase();
  if (method !== 'patch') return [];
  const rb = isObject(op.requestBody) ? (op.requestBody as AnyObj) : null;
  if (!rb) {
    return [
      {
        message: 'PATCH operation has no requestBody — should declare merge-patch+json or json-patch+json content-type (RFC 7396 / RFC 6902).',
        path: [...cpath],
      },
    ];
  }
  const content = isObject(rb.content) ? (rb.content as AnyObj) : null;
  if (!content) return [];
  for (const mt of Object.keys(content)) {
    if (PATCH_CONFORMANT_MEDIA_TYPES.has(mt.toLowerCase())) return [];
  }
  return [
    {
      message: `PATCH requestBody declares only [${Object.keys(content).join(', ')}] — should include application/json-patch+json (RFC 6902) OR application/merge-patch+json (RFC 7396).`,
      path: [...cpath, 'requestBody', 'content'],
    },
  ];
};
