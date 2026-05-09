/**
 * Custom Spectral functions for the P1 Threat-Modeling ruleset (T16a).
 *
 * Spectral's built-in functions (alphabetical, casing, defined, enumeration,
 * falsy, length, pattern, schema, truthy, undefined, unreferencedReusableObject,
 * xor, or) handle most rules; the patterns below need additional logic:
 *
 *   - listEndpointHasPagination (TM-A22):    GET ops returning array bodies
 *                                             must have a pagination query param.
 *   - sensitiveFlowNeedsRateLimitHeaders (TM-A32): purchase/checkout/order/
 *                                             booking ops must declare rate-limit
 *                                             headers on responses.
 *   - corsCredentialsWildcardConflict (TM-A39): Access-Control-Allow-Credentials:
 *                                             true + Access-Control-Allow-Origin:
 *                                             * is browser-rejected.
 *   - responseHasWwwAuthenticateHeader (TM-A53 / RFC2-40): 401 responses MUST
 *                                             declare a WWW-Authenticate header
 *                                             per RFC 9110 §11.6.1.
 *
 * Sources (file-level, see per-callable headers below for verbatim cite):
 *   - OWASP API Top-10 (2023): https://owasp.org/API-Security/editions/2023/en/
 *   - 42Crunch security-rules: https://docs.42crunch.com/latest/content/concepts/audit_score.htm
 *   - RFC 9110 (HTTP Semantics, 2022): https://www.rfc-editor.org/rfc/rfc9110
 *   - OWASP CORS Web-Security-Testing-Guide
 *   - Stripe + GitHub rate-limit-header conventions
 *
 * Lens: 1 (Threat-Modeling), with Lens-2 cross-cuts (RFC2-40 / RFC2-94)
 * Round: 2 (Welle B)
 *
 * Usage:
 *   const spectral = new Spectral();
 *   spectral.setRuleset({
 *     extends: [oas3Ruleset],
 *     rules: { 'apiq-tm-a22-list-endpoint-pagination': { ..., then: { function: listEndpointHasPagination } } },
 *   });
 */

import type { IFunction, IFunctionResult } from '@stoplight/spectral-core';
import { operationHasRateLimitHeader } from './_helpers/rate-limit-headers.js';

type AnyObj = Record<string, unknown>;

const PAGINATION_PARAM_NAMES = new Set([
  'limit',
  'per_page',
  'perPage',
  'page_size',
  'pageSize',
  'page',
  'cursor',
  'after',
  'before',
  'offset',
  'starting_after',
  'startingAfter',
  'ending_before',
  'endingBefore',
  'count',
  'top',
  'skip',
  'next',
  'next_token',
  'nextToken',
  'pageToken',
  'page_token',
  'maxResults',
  'max_results',
]);

const PAGINATION_HEADER_NAMES = [
  'link',
  'x-next-page',
  'x-page',
  'x-total',
  'x-total-count',
  'x-totalcount',
  'x-totalpages',
  'x-pagination-page',
  'x-pagination-limit',
  'x-pagination-total',
];

const SENSITIVE_FLOW_PATH_PATTERNS = [
  /\/(checkout|purchase|orders?|booking|bookings|payment|payments|charge|charges|subscribe|subscription|refund|reservation|reservations|invoice|invoices|transfers?|payouts?|wire[-_]?transfer)(\/|$)/i,
];

const SENSITIVE_FLOW_SUMMARY_PATTERNS = [
  /\b(checkout|place\s+(an?\s+)?order|book|booking|reserve|reservation|charge|charge\s+a\s+card|process\s+payment|create\s+payment|create\s+invoice|capture\s+payment|refund|transfer|payout|wire)\b/i,
];

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getResolvedTarget<T = unknown>(target: unknown): T | undefined {
  // Spectral resolves $ref before passing the value, but defensive: if a $ref
  // is still present, skip — caller can address by adjusting `resolved` flag.
  if (!target || (typeof target === 'object' && '$ref' in (target as AnyObj))) {
    return undefined;
  }
  return target as T;
}

// =============================================================================
// TM-A22 — listEndpointHasPagination
//
// Given the operation object (target = full operation), check:
//   - Is this a GET?
//   - Does any 2xx response describe an array-typed body?
//   - If yes: does the operation declare ANY pagination param (query)?
// If the predicate "list endpoint" is true and pagination params are absent,
// emit a finding.
// =============================================================================

/**
 * TM-A22 — list-endpoint pagination check.
 *
 * Source: OWASP API4:2023 (Resource-Consumption / DoS) + 42Crunch
 *         pagination-rule + Stripe/GitHub list-endpoint conventions.
 *         rules-brainstorm.md TM-A22 (P1, Lens-1, mech).
 * Lens: 1 (Threat-Modeling), 5 (Style-Coherence)
 * Round: 2 (Welle B / T16a)
 */
export const listEndpointHasPagination: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];

  // Only GETs.
  // The path comes in as context.path; the second-to-last segment is method.
  const path = context.path;
  if (!path || path.length < 3) return [];
  const method = String(path[path.length - 1]).toLowerCase();
  if (method !== 'get') return [];

  // Is this a list endpoint? Heuristic: any 2xx response has
  // `content[*/*].schema.type === 'array'`.
  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) return [];

  let isListResponse = false;
  for (const [statusKey, respUnknown] of Object.entries(responses)) {
    if (!/^2\d\d$/.test(statusKey) && statusKey !== 'default') continue;
    const resp = isObject(respUnknown) ? respUnknown : null;
    if (!resp) continue;
    const content = isObject(resp.content) ? resp.content : null;
    if (!content) continue;
    for (const mt of Object.values(content)) {
      const mtObj = isObject(mt) ? mt : null;
      if (!mtObj) continue;
      const sch = isObject(mtObj.schema) ? mtObj.schema : null;
      if (!sch) continue;
      if (sch.type === 'array') {
        isListResponse = true;
        break;
      }
      // Pagination-envelope: { data: [...] } or { items: [...] } or { results: [...] }
      const props = isObject(sch.properties) ? sch.properties : null;
      if (props) {
        for (const candKey of ['data', 'items', 'results', 'records', 'entries']) {
          const cand = isObject(props[candKey]) ? props[candKey] : null;
          if (cand && cand.type === 'array') {
            isListResponse = true;
            break;
          }
        }
      }
      if (isListResponse) break;
    }
    if (isListResponse) break;
  }

  if (!isListResponse) return [];

  // Does the op (or its parameters) declare any pagination param?
  const params = Array.isArray(op.parameters) ? (op.parameters as AnyObj[]) : [];
  for (const p of params) {
    if (!isObject(p)) continue;
    if (p.in !== 'query') continue;
    const name = typeof p.name === 'string' ? p.name : '';
    if (PAGINATION_PARAM_NAMES.has(name)) {
      return [];
    }
  }

  // Check if response declares any pagination-signal header
  for (const respUnknown of Object.values(responses)) {
    const resp = isObject(respUnknown) ? respUnknown : null;
    if (!resp || !isObject(resp.headers)) continue;
    const headers = resp.headers as AnyObj;
    for (const headerName of Object.keys(headers)) {
      if (PAGINATION_HEADER_NAMES.includes(headerName.toLowerCase())) {
        return [];
      }
    }
  }

  const result: IFunctionResult[] = [
    {
      message:
        'List endpoint (returns array body) lacks any pagination parameter (limit/per_page/page_size/page/cursor) and no pagination headers — DoS risk on large datasets.',
      path: [...context.path],
    },
  ];
  return result;
};

// =============================================================================
// TM-A32 — sensitiveFlowNeedsRateLimitHeaders
//
// Given an operation, if it's a "sensitive business flow" (POST + path or
// summary matching purchase/checkout/order/booking/payment/charge), check
// each declared response for at least one rate-limit-signaling header
// (X-RateLimit-*, RateLimit-*, Retry-After).
// =============================================================================

/**
 * TM-A32 — sensitive-business-flow rate-limit-header check.
 *
 * Source: OWASP API6:2023 (Unrestricted Access to Sensitive Business Flows) +
 *         draft-ietf-httpapi-ratelimit-headers + RFC 9110 §10.2.3 (Retry-After) +
 *         Stripe + GitHub rate-limit conventions.
 *         rules-brainstorm.md TM-A32 (P2, severity error in spectral coverage).
 * Lens: 1 (Threat-Modeling)
 * Round: 2 (Welle B / T16a)
 */
export const sensitiveFlowNeedsRateLimitHeaders: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];

  const path = context.path;
  if (!path || path.length < 3) return [];
  const method = String(path[path.length - 1]).toLowerCase();
  // Sensitive flows: POST primarily; PUT/PATCH on resource accept too.
  if (method !== 'post' && method !== 'put' && method !== 'patch') return [];

  const routePath = String(path[path.length - 2]);
  const summary = typeof op.summary === 'string' ? op.summary : '';
  const description = typeof op.description === 'string' ? op.description : '';

  const isSensitive =
    SENSITIVE_FLOW_PATH_PATTERNS.some((re) => re.test(routePath)) ||
    SENSITIVE_FLOW_SUMMARY_PATTERNS.some((re) => re.test(summary)) ||
    SENSITIVE_FLOW_SUMMARY_PATTERNS.some((re) => re.test(description));

  if (!isSensitive) return [];

  if (operationHasRateLimitHeader(op)) return [];

  return [
    {
      message:
        `Sensitive business-flow operation (${method.toUpperCase()} ${routePath}) lacks rate-limit headers (X-RateLimit-* / RateLimit-* / Retry-After) on responses — required by OWASP API6 sensitive-business-flow.`,
      path: [...context.path],
    },
  ];
};

// =============================================================================
// TM-A39 — corsCredentialsWildcardConflict
//
// Given a response object (target = response), if the response declares
// `Access-Control-Allow-Credentials` with truthy value AND
// `Access-Control-Allow-Origin` with literal '*', flag.
// =============================================================================

/**
 * TM-A39 — CORS credentials+wildcard mutually-exclusive check.
 *
 * Source: OWASP CORS Web-Security-Testing-Guide + Fetch Living-Standard
 *         (CORS-spec rejection of credentials:true + Allow-Origin:*).
 *         rules-brainstorm.md TM-A39 (P1, mutually-exclusive per CORS-spec).
 * Lens: 1 (Threat-Modeling), 2 (Standards-Compliance)
 * Round: 2 (Welle B / T16a)
 */
export const corsCredentialsWildcardConflict: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const resp = getResolvedTarget<AnyObj>(targetVal);
  if (!resp) return [];

  const headers = isObject(resp.headers) ? resp.headers : null;
  if (!headers) return [];

  let credentialsTrue = false;
  let originWildcard = false;

  for (const [name, valueUnknown] of Object.entries(headers)) {
    const lname = name.toLowerCase();
    const value = isObject(valueUnknown) ? valueUnknown : null;
    if (!value) continue;
    if (lname === 'access-control-allow-credentials') {
      // Look at schema.example, schema.default, schema.enum
      const sch = isObject(value.schema) ? value.schema : null;
      if (sch) {
        const ex = sch.example;
        const def = sch.default;
        const en = Array.isArray(sch.enum) ? sch.enum : [];
        if (
          ex === true ||
          ex === 'true' ||
          def === true ||
          def === 'true' ||
          en.includes(true) ||
          en.includes('true')
        ) {
          credentialsTrue = true;
        }
      }
    } else if (lname === 'access-control-allow-origin') {
      const sch = isObject(value.schema) ? value.schema : null;
      if (sch) {
        const ex = sch.example;
        const def = sch.default;
        const en = Array.isArray(sch.enum) ? sch.enum : [];
        if (ex === '*' || def === '*' || en.includes('*')) {
          originWildcard = true;
        }
      }
    }
  }

  if (credentialsTrue && originWildcard) {
    return [
      {
        message:
          'Access-Control-Allow-Credentials: true combined with Access-Control-Allow-Origin: * is rejected by browsers (CORS spec). Use an allowlisted origin.',
        path: [...context.path],
      },
    ];
  }

  return [];
};

// =============================================================================
// TM-A53 / RFC2-40 — responseHasWwwAuthenticateHeader
//
// Given an operation with a `responses[401]` (or any 4xx that semantically
// indicates auth-challenge), the 401 response MUST declare a
// `WWW-Authenticate` header per RFC 9110 §11.6.1 verbatim "MUST send".
// =============================================================================

/**
 * TM-A53 / RFC2-40 — 401-WWW-Authenticate-header check.
 *
 * Source: RFC 9110 §11.6.1 verbatim "the server generating a 401 (Unauthorized)
 *         response MUST send a WWW-Authenticate header field containing at
 *         least one challenge". rules-brainstorm.md TM-A53 / RFC2-40 (P1,
 *         severity-upgrade Round-2 to error).
 * Lens: 1 (Threat-Modeling), 2 (Standards-Compliance)
 * Round: 2 (Welle B / T16a)
 */
export const responseHasWwwAuthenticateHeader: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];

  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) return [];

  const r401 = responses['401'];
  if (!r401 || !isObject(r401)) return [];

  const headers = isObject(r401.headers) ? r401.headers : null;
  if (!headers) {
    return [
      {
        message:
          '401 response declared without `WWW-Authenticate` header (RFC 9110 §11.6.1 — "MUST send WWW-Authenticate").',
        path: [...context.path, 'responses', '401'],
      },
    ];
  }

  const hasWww = Object.keys(headers).some(
    (k) => k.toLowerCase() === 'www-authenticate'
  );
  if (!hasWww) {
    return [
      {
        message:
          '401 response declared without `WWW-Authenticate` header (RFC 9110 §11.6.1 — "MUST send WWW-Authenticate").',
        path: [...context.path, 'responses', '401'],
      },
    ];
  }
  return [];
};

// =============================================================================
// Welle Arch+ A3 — FUNCTION_METADATA registry for threat-p1 callables.
// =============================================================================

import type { FunctionMetadata } from './_metadata.js';

export const FUNCTION_METADATA: Record<string, FunctionMetadata> = {
  'list-endpoint-has-pagination': {
    name: 'list-endpoint-has-pagination',
    patternIds: ['TM-A22'],
    lens: 'threat-modeling',
    perfClass: 'O(n)',
    description:
      'GET ops returning array bodies must declare a pagination query param or pagination response-header (DoS prevention).',
  },
  'sensitive-flow-needs-rate-limit-headers': {
    name: 'sensitive-flow-needs-rate-limit-headers',
    patternIds: ['TM-A32'],
    lens: 'threat-modeling',
    perfClass: 'O(n)',
    description:
      'Sensitive business-flow ops (purchase/checkout/order/payment) must declare rate-limit headers on responses (OWASP API6).',
  },
  'cors-credentials-wildcard-conflict': {
    name: 'cors-credentials-wildcard-conflict',
    patternIds: ['TM-A39'],
    lens: 'threat-modeling',
    perfClass: 'O(n)',
    description:
      'Access-Control-Allow-Credentials:true combined with Access-Control-Allow-Origin:* is browser-rejected (CORS spec).',
  },
  'response-has-www-authenticate-header': {
    name: 'response-has-www-authenticate-header',
    patternIds: ['TM-A53'],
    lens: 'threat-modeling',
    perfClass: 'O(n)',
    description:
      '401 responses MUST declare a WWW-Authenticate header (RFC 9110 §11.6.1).',
  },
};
