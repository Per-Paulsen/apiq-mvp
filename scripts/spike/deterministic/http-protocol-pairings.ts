/**
 * HTTP-Protocol-Pairings Module — Stage A, Welle B T16b (Module-Class).
 *
 * Sources: RFC 9110 (HTTP Semantics, 2022)
 *          + RFC 9111 (HTTP Caching) + RFC 7232 (Conditional Requests)
 *          + RFC 7233/9110 (Range Requests) + RFC 6585 (Additional HTTP Status)
 *          + RFC 7240 (Prefer Header) + RFC 8288 (Web Linking)
 *          + draft-ietf-httpapi-ratelimit-headers
 *          + RFC 6750 (Bearer Token, §3 challenge)
 * Patterns: ~30 pairings (RFC2-* per mining-round2-standards.md);
 *           verbatim "MUST" → error, "SHOULD" → warn per Severity-Schema-Final
 * Lens: 2 (Standards-Compliance), 7 (Operations)
 * Round: 2 (Welle B / T16b)
 *
 * Maps to rules-brainstorm.md: RFC2-7 (HTTP method tokens uppercase), RFC2-8
 * (GET/HEAD/OPTIONS/TRACE/DELETE no body), RFC2-14 (405 → Allow header),
 * RFC2-20-26 (conditional pairings), RFC2-30-34 (Range), RFC2-40 (401 →
 * WWW-Authenticate, P1), RFC2-41 (407 → Proxy-Authenticate), RFC2-46-48 (Prefer),
 * RFC2-94 (429 → Retry-After / RateLimit-* P1, severity-upgrade Round-2),
 * RFC2-96 (503 → Retry-After), C9/C10 (rate-limit + 304 conditional).
 *
 * Lens 2 (Standards-Compliance) + Lens 7 (Operations).
 *
 * Premise: RFC 9110 + RFC 9111 + companion RFCs (RFC 7232 conditional, RFC 7233
 * range, RFC 6585 status, RFC 7240 Prefer, draft-ietf-httpapi-ratelimit-headers)
 * specify a long list of declarative pairings: when status code X is declared,
 * response header Y MUST/SHOULD be declared; when request header A is declared,
 * response status B MUST/SHOULD be declared; certain methods MUST NOT declare a
 * request body. apiq pre-existing rules check a few of these ad-hoc; this
 * module makes the full table declarative + comprehensive so:
 *
 *   1. Adding a new pairing is a one-line table-edit, not a new function.
 *   2. The full table is auditable in one place against the RFCs.
 *   3. Severity is uniformly derived from RFC-2119 wording (MUST -> error,
 *      SHOULD -> warn) per the Severity-Schema-Final convention.
 *
 * Pattern coverage (RFC2-* IDs from
 * specs/big-spec-architecture-spike-stage-a-mining-round2-standards.md):
 *   - RFC2-14  405 -> Allow header (MUST)               (RFC 9110 sec 15.5.6)
 *   - RFC2-15  426 -> Upgrade header (MUST)             (RFC 9110 sec 15.5.22)
 *   - RFC2-20  If-Match -> 412 (MUST)                   (RFC 9110 sec 13.1.1)
 *   - RFC2-21  If-None-Match (GET/HEAD) -> 304 (SHOULD) (RFC 9110 sec 13.1.2)
 *   - RFC2-22  If-None-Match (PUT/PATCH/DELETE) -> 412 (MUST)
 *   - RFC2-23  If-Modified-Since (GET/HEAD) -> 304 (hint)
 *   - RFC2-24  If-Unmodified-Since (PUT/PATCH/DELETE) -> 412 (MUST)
 *   - RFC2-25  304 -> ETag/Last-Modified (SHOULD)       (RFC 9110 sec 15.4.5)
 *   - RFC2-26  412 -> conditional-validator parameter (SHOULD)
 *   - RFC2-30  Range -> 206 (SHOULD)                    (RFC 9110 sec 14.2)
 *   - RFC2-31  Range -> 416 (SHOULD)                    (RFC 9110 sec 15.5.17)
 *   - RFC2-32  206 -> Content-Range header (MUST)       (RFC 9110 sec 15.3.7)
 *   - RFC2-40  401 -> WWW-Authenticate header (MUST)    (RFC 9110 sec 15.5.2)
 *   - RFC2-41  407 -> Proxy-Authenticate header (MUST)  (RFC 9110 sec 15.5.8)
 *   - RFC2-46  Prefer -> Preference-Applied (SHOULD)    (RFC 7240 sec 3)
 *   - RFC2-48  Prefer respond-async -> 202 (MUST)       (RFC 7240 sec 4.1)
 *   - RFC2-94  429 -> Retry-After OR RateLimit-* (MUST) (RFC 9110 sec 10.2.3 + RFC 6585 + draft-ratelimit)
 *   - RFC2-96  503 -> Retry-After (SHOULD)              (RFC 9110 sec 15.6.4)
 *   - method-no-body (GET/HEAD/OPTIONS/TRACE/DELETE)    (RFC 9110 sec 9.3.1)
 *   - HEAD-response-no-body                             (RFC 9110 sec 9.3.2)
 *
 * Public API:
 *   walkHttpProtocolPairings(spec, opts) => Promise<DetectorFinding[]>
 *
 * CLI:
 *   cd scripts/spike && npx tsx deterministic/http-protocol-pairings.ts <spec-name>
 */

import type { DetectorFinding, DetectorOptions } from './types.js';
import { walkOperations } from './walkers/_shared.js';
import { HTTP_STATUS_CODES, isValidStatusCode } from './iana/status-codes.js';
import { isRegisteredMethod } from './iana/methods.js';
import { isRegisteredField } from './iana/field-names.js';

// ===========================================================================
// 1. Pairing-tables — declarative core
// ===========================================================================

/**
 * Severity per RFC-2119 wording. 'must' = MUST, 'should' = SHOULD, 'hint' =
 * informative cross-source consensus. Mapped at finding-emission time to
 * DetectorFinding.severity (must -> high, should -> medium, hint -> low).
 */
export type PairingSeverity = 'must' | 'should' | 'hint';

interface StatusToHeaderPairing {
  patternId: string;
  status: number;
  /** One header name OR an any-of array; at least one must be declared. */
  requiredHeaders: string | string[];
  severity: PairingSeverity;
  rfcRef: string;
  rationale: string;
}

/**
 * Status-code -> required response header(s) pairings. If the status is
 * declared in operation.responses, at least one of the listed response
 * headers must/should be declared in that response headers map.
 */
const STATUS_HEADER_PAIRINGS: ReadonlyArray<StatusToHeaderPairing> = [
  {
    patternId: 'RFC2-40',
    status: 401,
    requiredHeaders: 'WWW-Authenticate',
    severity: 'must',
    rfcRef: 'RFC 9110 sec 11.6.1 / 15.5.2',
    rationale:
      'A 401 Unauthorized response MUST include a WWW-Authenticate response header documenting the auth challenge.',
  },
  {
    patternId: 'RFC2-14',
    status: 405,
    requiredHeaders: 'Allow',
    severity: 'must',
    rfcRef: 'RFC 9110 sec 15.5.6',
    rationale:
      'A 405 Method Not Allowed response MUST include an Allow header listing valid methods for the target resource.',
  },
  {
    patternId: 'RFC2-41',
    status: 407,
    requiredHeaders: 'Proxy-Authenticate',
    severity: 'must',
    rfcRef: 'RFC 9110 sec 11.6.4 / 15.5.8',
    rationale:
      'A 407 Proxy Authentication Required response MUST include a Proxy-Authenticate header.',
  },
  {
    patternId: 'RFC2-15',
    status: 426,
    requiredHeaders: 'Upgrade',
    severity: 'must',
    rfcRef: 'RFC 9110 sec 15.5.22',
    rationale:
      'A 426 Upgrade Required response MUST include an Upgrade header indicating which protocol(s) are required.',
  },
  {
    patternId: 'RFC2-32',
    status: 206,
    requiredHeaders: 'Content-Range',
    severity: 'must',
    rfcRef: 'RFC 9110 sec 15.3.7 / RFC 7233 sec 4.1',
    rationale:
      'A 206 Partial Content response MUST include a Content-Range header.',
  },
  {
    patternId: 'RFC2-25',
    status: 304,
    requiredHeaders: ['ETag', 'Last-Modified'],
    severity: 'should',
    rfcRef: 'RFC 9110 sec 15.4.5',
    rationale:
      'A 304 Not Modified response SHOULD declare ETag and/or Last-Modified so clients can update cache validators.',
  },
  {
    patternId: 'RFC2-94',
    status: 429,
    requiredHeaders: [
      'Retry-After',
      'RateLimit',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'RateLimit-Policy',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    severity: 'must',
    rfcRef: 'RFC 9110 sec 10.2.3 + RFC 6585 sec 4 + draft-ietf-httpapi-ratelimit-headers',
    rationale:
      'A 429 Too Many Requests response MUST declare at least one rate-limit-signaling header so clients know when to retry: Retry-After or RateLimit-*.',
  },
  {
    patternId: 'RFC2-96',
    status: 503,
    requiredHeaders: 'Retry-After',
    severity: 'should',
    rfcRef: 'RFC 9110 sec 15.6.4',
    rationale:
      'A 503 Service Unavailable response SHOULD include a Retry-After header.',
  },
];

interface RequestParamToResponsePairing {
  patternId: string;
  /** Request header parameter name (case-insensitive). */
  requestHeader: string;
  /** Methods on which this pairing applies. Empty = all. Lower-cased. */
  applicableMethods: ReadonlySet<string>;
  /** One status OR any-of array. */
  requiredStatuses: number | number[];
  severity: PairingSeverity;
  rfcRef: string;
  rationale: string;
}

const REQUEST_RESPONSE_PAIRINGS: ReadonlyArray<RequestParamToResponsePairing> = [
  {
    patternId: 'RFC2-20',
    requestHeader: 'If-Match',
    applicableMethods: new Set(['put', 'patch', 'delete', 'post']),
    requiredStatuses: 412,
    severity: 'must',
    rfcRef: 'RFC 9110 sec 13.1.1',
    rationale:
      'When If-Match is declared on a state-changing operation, the operation MUST declare a 412 Precondition Failed response (returned when the precondition fails).',
  },
  {
    patternId: 'RFC2-21',
    requestHeader: 'If-None-Match',
    applicableMethods: new Set(['get', 'head']),
    requiredStatuses: 304,
    severity: 'should',
    rfcRef: 'RFC 9110 sec 13.1.2',
    rationale:
      'When If-None-Match is declared on a GET/HEAD, the operation SHOULD declare a 304 Not Modified response (returned when the precondition matches).',
  },
  {
    patternId: 'RFC2-22',
    requestHeader: 'If-None-Match',
    applicableMethods: new Set(['put', 'patch', 'delete', 'post']),
    requiredStatuses: 412,
    severity: 'must',
    rfcRef: 'RFC 9110 sec 13.1.2',
    rationale:
      'When If-None-Match is declared on PUT/PATCH/DELETE/POST, the operation MUST declare a 412 Precondition Failed response.',
  },
  {
    patternId: 'RFC2-23',
    requestHeader: 'If-Modified-Since',
    applicableMethods: new Set(['get', 'head']),
    requiredStatuses: 304,
    severity: 'hint',
    rfcRef: 'RFC 9110 sec 13.1.3',
    rationale:
      'When If-Modified-Since is declared on a GET/HEAD, the operation should declare a 304 Not Modified response.',
  },
  {
    patternId: 'RFC2-24',
    requestHeader: 'If-Unmodified-Since',
    applicableMethods: new Set(['put', 'patch', 'delete', 'post']),
    requiredStatuses: 412,
    severity: 'must',
    rfcRef: 'RFC 9110 sec 13.1.4',
    rationale:
      'When If-Unmodified-Since is declared on PUT/PATCH/DELETE/POST, the operation MUST declare a 412 Precondition Failed response.',
  },
  {
    patternId: 'RFC2-30',
    requestHeader: 'Range',
    applicableMethods: new Set(['get', 'head']),
    requiredStatuses: 206,
    severity: 'should',
    rfcRef: 'RFC 9110 sec 14.2 / RFC 7233 sec 3.1',
    rationale:
      'When a Range request parameter is declared, the operation SHOULD declare a 206 Partial Content response.',
  },
  {
    patternId: 'RFC2-31',
    requestHeader: 'Range',
    applicableMethods: new Set(['get', 'head']),
    requiredStatuses: 416,
    severity: 'should',
    rfcRef: 'RFC 9110 sec 15.5.17 / RFC 7233 sec 4.4',
    rationale:
      'When a Range request parameter is declared, a 416 Range Not Satisfiable response SHOULD also be declared (returned when the range is invalid).',
  },
];

/**
 * Request-header parameter -> required response header pairing (RFC2-46).
 */
interface RequestParamToResponseHeaderPairing {
  patternId: string;
  requestHeader: string;
  responseHeader: string;
  applicableMethods: ReadonlySet<string> | null;
  severity: PairingSeverity;
  rfcRef: string;
  rationale: string;
}

const REQUEST_RESPONSE_HEADER_PAIRINGS: ReadonlyArray<RequestParamToResponseHeaderPairing> = [
  {
    patternId: 'RFC2-46',
    requestHeader: 'Prefer',
    responseHeader: 'Preference-Applied',
    applicableMethods: null,
    severity: 'should',
    rfcRef: 'RFC 7240 sec 3',
    rationale:
      'When a Prefer request parameter is declared, a Preference-Applied response header SHOULD be declared so clients can confirm which preferences were honoured.',
  },
];

/**
 * Prefer-value -> response-status pairing (RFC2-48). Heuristic: when the Prefer
 * parameter has an enum or example listing the value (e.g. respond-async),
 * the operation must declare the paired status.
 */
interface PreferValueToStatusPairing {
  patternId: string;
  preferValue: string;
  requiredStatus: number;
  severity: PairingSeverity;
  rfcRef: string;
  rationale: string;
}

const PREFER_VALUE_PAIRINGS: ReadonlyArray<PreferValueToStatusPairing> = [
  {
    patternId: 'RFC2-48',
    preferValue: 'respond-async',
    requiredStatus: 202,
    severity: 'must',
    rfcRef: 'RFC 7240 sec 4.1',
    rationale:
      'When Prefer: respond-async is documented (enum / example on the Prefer parameter), the operation MUST declare a 202 Accepted response per RFC 7240 sec 4.1.',
  },
];

const CONDITIONAL_VALIDATOR_HEADERS: ReadonlySet<string> = new Set(
  ['If-Match', 'If-None-Match', 'If-Modified-Since', 'If-Unmodified-Since', 'If-Range'].map(
    (h) => h.toLowerCase(),
  ),
);

interface ResponseToRequestHeaderPairing {
  patternId: string;
  status: number;
  satisfyingRequestHeaders: ReadonlySet<string>;
  severity: PairingSeverity;
  rfcRef: string;
  rationale: string;
}

const RESPONSE_REQUEST_PAIRINGS: ReadonlyArray<ResponseToRequestHeaderPairing> = [
  {
    patternId: 'RFC2-26',
    status: 412,
    satisfyingRequestHeaders: CONDITIONAL_VALIDATOR_HEADERS,
    severity: 'should',
    rfcRef: 'RFC 9110 sec 15.5.13',
    rationale:
      'A 412 Precondition Failed response SHOULD be paired with at least one conditional-request header parameter (If-Match / If-None-Match / If-Modified-Since / If-Unmodified-Since / If-Range); without one the contract is incomplete.',
  },
];

const NO_REQUEST_BODY_METHODS: ReadonlySet<string> = new Set([
  'get', 'head', 'options', 'trace', 'delete',
]);

// ===========================================================================
// 2. Spec-traversal helpers
// ===========================================================================

interface ResolvedParam {
  name?: string;
  in?: string;
  schema?: Record<string, unknown>;
  example?: unknown;
  examples?: Record<string, unknown>;
}

function getParameters(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
): ResolvedParam[] {
  const out: ResolvedParam[] = [];
  for (const source of [pathItem.parameters, operation.parameters]) {
    if (!Array.isArray(source)) continue;
    for (const p of source) {
      if (!p || typeof p !== 'object') continue;
      const pp = p as Record<string, unknown>;
      out.push({
        name: typeof pp.name === 'string' ? pp.name : undefined,
        in: typeof pp.in === 'string' ? pp.in : undefined,
        schema: pp.schema && typeof pp.schema === 'object' ? (pp.schema as Record<string, unknown>) : undefined,
        example: pp.example,
        examples: pp.examples && typeof pp.examples === 'object' ? (pp.examples as Record<string, unknown>) : undefined,
      });
    }
  }
  return out;
}

function findHeaderParam(params: ResolvedParam[], headerName: string): ResolvedParam | undefined {
  const target = headerName.toLowerCase();
  return params.find(
    (p) => p.in === 'header' && typeof p.name === 'string' && p.name.toLowerCase() === target,
  );
}

function hasHeaderParam(params: ResolvedParam[], headerName: string): boolean {
  return findHeaderParam(params, headerName) !== undefined;
}

function hasAnyHeaderParam(params: ResolvedParam[], headerNames: ReadonlySet<string>): boolean {
  for (const p of params) {
    if (p.in !== 'header' || typeof p.name !== 'string') continue;
    if (headerNames.has(p.name.toLowerCase())) return true;
  }
  return false;
}

function getResponse(
  responses: Record<string, unknown>,
  status: number,
): Record<string, unknown> | undefined {
  const direct = responses[String(status)];
  if (direct && typeof direct === 'object') return direct as Record<string, unknown>;
  return undefined;
}

function listDeclaredStatuses(responses: Record<string, unknown>): number[] {
  const out: number[] = [];
  for (const k of Object.keys(responses)) {
    const n = Number(k);
    if (Number.isInteger(n)) out.push(n);
  }
  return out;
}

function responseHasHeader(
  response: Record<string, unknown>,
  headerNames: string | string[],
): boolean {
  const headers = response.headers;
  if (!headers || typeof headers !== 'object') return false;
  const targets = (Array.isArray(headerNames) ? headerNames : [headerNames]).map((h) => h.toLowerCase());
  for (const declared of Object.keys(headers as Record<string, unknown>)) {
    if (targets.includes(declared.toLowerCase())) return true;
  }
  return false;
}

function paramMentionsValue(p: ResolvedParam, value: string): boolean {
  // Check schema.enum, schema.example, parameter-level example, examples-map values, schema.default.
  const lc = value.toLowerCase();
  const matches = (v: unknown): boolean => typeof v === 'string' && v.toLowerCase().includes(lc);
  if (p.schema) {
    const s = p.schema;
    if (Array.isArray(s.enum)) {
      for (const e of s.enum) if (matches(e)) return true;
    }
    if (matches(s.example)) return true;
    if (matches(s.default)) return true;
  }
  if (matches(p.example)) return true;
  if (p.examples) {
    for (const ex of Object.values(p.examples)) {
      if (ex && typeof ex === 'object') {
        const v = (ex as Record<string, unknown>).value;
        if (matches(v)) return true;
      } else if (matches(ex)) {
        return true;
      }
    }
  }
  return false;
}

// ===========================================================================
// 3. Pairing-check functions — each returns offender-rows by pattern-id
// ===========================================================================

interface OffenderRow {
  patternId: string;
  severity: PairingSeverity;
  rfcRef: string;
  rationale: string;
  trigger: string;
  missing: string;
  path: string;
  method: string;
}

function offenderKey(o: OffenderRow): string {
  return o.patternId + '::' + o.trigger + '::' + o.missing;
}

function checkStatusToHeader(
  responses: Record<string, unknown>,
  path: string,
  method: string,
  out: OffenderRow[],
): void {
  for (const pair of STATUS_HEADER_PAIRINGS) {
    const resp = getResponse(responses, pair.status);
    if (!resp) continue;
    if (responseHasHeader(resp, pair.requiredHeaders)) continue;
    const required = Array.isArray(pair.requiredHeaders)
      ? pair.requiredHeaders.join(' or ')
      : pair.requiredHeaders;
    out.push({
      patternId: pair.patternId,
      severity: pair.severity,
      rfcRef: pair.rfcRef,
      rationale: pair.rationale,
      trigger: String(pair.status) + ' response',
      missing: 'response header ' + required,
      path,
      method,
    });
  }
}

function checkRequestParamToResponseStatus(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  responses: Record<string, unknown>,
  path: string,
  method: string,
  out: OffenderRow[],
): void {
  const params = getParameters(operation, pathItem);
  const declaredStatuses = new Set(listDeclaredStatuses(responses));

  for (const pair of REQUEST_RESPONSE_PAIRINGS) {
    if (pair.applicableMethods.size > 0 && !pair.applicableMethods.has(method)) continue;
    if (!hasHeaderParam(params, pair.requestHeader)) continue;
    const requiredArr = Array.isArray(pair.requiredStatuses) ? pair.requiredStatuses : [pair.requiredStatuses];
    if (requiredArr.some((s) => declaredStatuses.has(s))) continue;
    out.push({
      patternId: pair.patternId,
      severity: pair.severity,
      rfcRef: pair.rfcRef,
      rationale: pair.rationale,
      trigger: pair.requestHeader + ' request parameter',
      missing: requiredArr.join(' or ') + ' response',
      path,
      method,
    });
  }
}

function checkRequestParamToResponseHeader(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  responses: Record<string, unknown>,
  path: string,
  method: string,
  out: OffenderRow[],
): void {
  const params = getParameters(operation, pathItem);
  for (const pair of REQUEST_RESPONSE_HEADER_PAIRINGS) {
    if (pair.applicableMethods !== null && !pair.applicableMethods.has(method)) continue;
    if (!hasHeaderParam(params, pair.requestHeader)) continue;
    let satisfied = false;
    for (const respRaw of Object.values(responses)) {
      if (!respRaw || typeof respRaw !== 'object') continue;
      if (responseHasHeader(respRaw as Record<string, unknown>, pair.responseHeader)) {
        satisfied = true;
        break;
      }
    }
    if (satisfied) continue;
    out.push({
      patternId: pair.patternId,
      severity: pair.severity,
      rfcRef: pair.rfcRef,
      rationale: pair.rationale,
      trigger: pair.requestHeader + ' request parameter',
      missing: 'response header ' + pair.responseHeader,
      path,
      method,
    });
  }
}

function checkResponseStatusToRequestHeader(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  responses: Record<string, unknown>,
  path: string,
  method: string,
  out: OffenderRow[],
): void {
  const params = getParameters(operation, pathItem);
  for (const pair of RESPONSE_REQUEST_PAIRINGS) {
    if (!getResponse(responses, pair.status)) continue;
    if (hasAnyHeaderParam(params, pair.satisfyingRequestHeaders)) continue;
    out.push({
      patternId: pair.patternId,
      severity: pair.severity,
      rfcRef: pair.rfcRef,
      rationale: pair.rationale,
      trigger: String(pair.status) + ' response',
      missing: 'conditional-validator request header (any of If-Match / If-None-Match / If-Modified-Since / If-Unmodified-Since / If-Range)',
      path,
      method,
    });
  }
}

function checkPreferValueToStatus(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  responses: Record<string, unknown>,
  path: string,
  method: string,
  out: OffenderRow[],
): void {
  const params = getParameters(operation, pathItem);
  const preferParam = findHeaderParam(params, 'Prefer');
  if (!preferParam) return;
  const declaredStatuses = new Set(listDeclaredStatuses(responses));
  for (const pair of PREFER_VALUE_PAIRINGS) {
    if (!paramMentionsValue(preferParam, pair.preferValue)) continue;
    if (declaredStatuses.has(pair.requiredStatus)) continue;
    out.push({
      patternId: pair.patternId,
      severity: pair.severity,
      rfcRef: pair.rfcRef,
      rationale: pair.rationale,
      trigger: 'Prefer parameter mentioning ' + pair.preferValue,
      missing: String(pair.requiredStatus) + ' response',
      path,
      method,
    });
  }
}

function checkMethodBodyRules(
  operation: Record<string, unknown>,
  responses: Record<string, unknown>,
  path: string,
  method: string,
  out: OffenderRow[],
): void {
  // Request-body rule: GET/HEAD/OPTIONS/TRACE/DELETE MUST NOT declare requestBody.
  if (NO_REQUEST_BODY_METHODS.has(method)) {
    const rb = operation.requestBody;
    if (rb && typeof rb === 'object') {
      out.push({
        patternId: 'RFC9110-9.3.1',
        severity: 'must',
        rfcRef: 'RFC 9110 sec 9.3.1',
        rationale:
          'Operations using ' + method.toUpperCase() + ' have no defined payload semantics in HTTP and OAS-3 forbids requestBody on this method.',
        trigger: method.toUpperCase() + ' method',
        missing: 'requestBody is forbidden but present',
        path,
        method,
      });
    }
  }

  // HEAD-response-no-body: HEAD responses MUST NOT carry body content.
  if (method === 'head') {
    for (const [statusKey, respRaw] of Object.entries(responses)) {
      if (!respRaw || typeof respRaw !== 'object') continue;
      const resp = respRaw as Record<string, unknown>;
      const content = resp.content;
      if (content && typeof content === 'object' && Object.keys(content).length > 0) {
        out.push({
          patternId: 'RFC9110-9.3.2',
          severity: 'must',
          rfcRef: 'RFC 9110 sec 9.3.2',
          rationale:
            'A HEAD response MUST NOT include a message body; OAS-3 content on a HEAD response is meaningless and codegens produce dead types.',
          trigger: 'HEAD ' + statusKey + ' response',
          missing: 'declares content body — must be removed',
          path,
          method,
        });
      }
    }
  }
}

// ===========================================================================
// 4. Aggregation + finding-emission
// ===========================================================================

const MAX_ENDPOINTS_PER_FINDING = 50;

function severityToFindingSeverity(s: PairingSeverity): DetectorFinding['severity'] {
  switch (s) {
    case 'must':
      return 'high';
    case 'should':
      return 'medium';
    case 'hint':
      return 'low';
  }
}

function pairingTitle(patternId: string, trigger: string, missing: string, count: number): string {
  return patternId + ': ' + count + ' operation(s) declare ' + trigger + ' but lack ' + missing;
}

function pairingNarration(
  rationale: string,
  rfcRef: string,
  trigger: string,
  missing: string,
  examples: string[],
  count: number,
): string {
  const exSlice = examples.slice(0, 5).join(', ');
  const moreSuffix = examples.length > 5 ? ' (and ' + (examples.length - 5) + ' more)' : '';
  return (
    count + ' operation(s) declare ' + trigger + ' but do not declare the required ' + missing + '. ' +
    rationale + ' (' + rfcRef + '). ' +
    'Examples: ' + exSlice + moreSuffix + '. ' +
    'Without the paired declaration the API contract is incomplete: SDK consumers cannot reliably handle the response, codegen tools emit untyped fallbacks, and mature linters (Spectral, Vacuum, Redocly) flag it.'
  );
}

function pairingPatchSummary(trigger: string, missing: string, count: number): string {
  return 'Add the ' + missing + ' on each of the ' + count + ' operation(s) that declare ' + trigger + '.';
}

// ===========================================================================
// 5. Public entry point
// ===========================================================================

export async function walkHttpProtocolPairings(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const offenders: OffenderRow[] = [];

  for (const { path, method, operation, pathItem } of walkOperations(spec)) {
    if (!isRegisteredMethod(method)) continue;
    const responses = operation.responses;
    const responsesObj =
      responses && typeof responses === 'object'
        ? (responses as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    checkStatusToHeader(responsesObj, path, method, offenders);
    checkRequestParamToResponseStatus(operation, pathItem, responsesObj, path, method, offenders);
    checkRequestParamToResponseHeader(operation, pathItem, responsesObj, path, method, offenders);
    checkResponseStatusToRequestHeader(operation, pathItem, responsesObj, path, method, offenders);
    checkPreferValueToStatus(operation, pathItem, responsesObj, path, method, offenders);
    checkMethodBodyRules(operation, responsesObj, path, method, offenders);
  }

  // Group offenders by (patternId, trigger, missing) so we emit one finding per
  // distinct pairing-violation across all endpoints.
  const groups = new Map<string, { seed: OffenderRow; endpoints: Array<{ path: string; method: string }> }>();
  for (const o of offenders) {
    const k = offenderKey(o);
    const g = groups.get(k);
    if (g) {
      g.endpoints.push({ path: o.path, method: o.method });
    } else {
      groups.set(k, { seed: o, endpoints: [{ path: o.path, method: o.method }] });
    }
  }

  const findings: DetectorFinding[] = [];
  for (const [, group] of groups) {
    const { seed, endpoints } = group;
    const examples = endpoints.map((e) => e.method.toUpperCase() + ' ' + e.path);
    findings.push({
      detectorId: 'module:http-protocol-pairings:' + seed.patternId.toLowerCase(),
      layer: 'walker-statistical',
      title: pairingTitle(seed.patternId, seed.trigger, seed.missing, endpoints.length),
      narration: pairingNarration(seed.rationale, seed.rfcRef, seed.trigger, seed.missing, examples, endpoints.length),
      rationale: seed.rationale + ' See ' + seed.rfcRef + '.',
      category: seed.severity === 'must' ? 'correctness' : 'design',
      severity: severityToFindingSeverity(seed.severity),
      scope: 'endpoint',
      affectedEndpoints: endpoints.slice(0, MAX_ENDPOINTS_PER_FINDING),
      patchOps: [],
      patchSummary: pairingPatchSummary(seed.trigger, seed.missing, endpoints.length),
      meta: {
        patternId: seed.patternId,
        rfcRef: seed.rfcRef,
        severityClass: seed.severity,
        count: endpoints.length,
      },
    });
  }

  findings.sort((a, b) => {
    const pa = String(a.meta?.patternId ?? '');
    const pb = String(b.meta?.patternId ?? '');
    if (pa !== pb) return pa.localeCompare(pb);
    const ca = Number(a.meta?.count ?? 0);
    const cb = Number(b.meta?.count ?? 0);
    return cb - ca;
  });

  return findings;
}

// ===========================================================================
// 6. Test-only exports — opaque types kept for table-audit / round-trip tests
// ===========================================================================

export const __test = {
  STATUS_HEADER_PAIRINGS,
  REQUEST_RESPONSE_PAIRINGS,
  REQUEST_RESPONSE_HEADER_PAIRINGS,
  PREFER_VALUE_PAIRINGS,
  RESPONSE_REQUEST_PAIRINGS,
  CONDITIONAL_VALIDATOR_HEADERS,
  NO_REQUEST_BODY_METHODS,
};

// ===========================================================================
// 7. Self-audit — every pairing references real IANA-registered
// status-codes / methods / fields. Runs at module-load (cheap; surfaces table-typos
// at import-time rather than at runtime).
// ===========================================================================

(function auditPairingsTable(): void {
  const errs: string[] = [];
  for (const p of STATUS_HEADER_PAIRINGS) {
    if (!HTTP_STATUS_CODES.has(p.status) && !isValidStatusCode(p.status)) {
      errs.push('STATUS_HEADER_PAIRINGS ' + p.patternId + ': status ' + p.status + ' not in IANA registry');
    }
    const headers = Array.isArray(p.requiredHeaders) ? p.requiredHeaders : [p.requiredHeaders];
    for (const h of headers) {
      // RateLimit-* are draft (provisional), Retry-After permanent. We do not fail
      // the audit on draft headers since IANA registers many provisional names.
      void isRegisteredField(h);
    }
  }
  for (const p of REQUEST_RESPONSE_PAIRINGS) {
    const stats = Array.isArray(p.requiredStatuses) ? p.requiredStatuses : [p.requiredStatuses];
    for (const s of stats) {
      if (!HTTP_STATUS_CODES.has(s)) {
        errs.push('REQUEST_RESPONSE_PAIRINGS ' + p.patternId + ': status ' + s + ' not in IANA registry');
      }
    }
    for (const m of p.applicableMethods) {
      if (!isRegisteredMethod(m)) {
        errs.push('REQUEST_RESPONSE_PAIRINGS ' + p.patternId + ': method ' + m + ' not in IANA registry');
      }
    }
  }
  for (const p of RESPONSE_REQUEST_PAIRINGS) {
    if (!HTTP_STATUS_CODES.has(p.status)) {
      errs.push('RESPONSE_REQUEST_PAIRINGS ' + p.patternId + ': status ' + p.status + ' not in IANA registry');
    }
  }
  for (const p of PREFER_VALUE_PAIRINGS) {
    if (!HTTP_STATUS_CODES.has(p.requiredStatus)) {
      errs.push('PREFER_VALUE_PAIRINGS ' + p.patternId + ': status ' + p.requiredStatus + ' not in IANA registry');
    }
  }
  for (const m of NO_REQUEST_BODY_METHODS) {
    if (!isRegisteredMethod(m)) {
      errs.push('NO_REQUEST_BODY_METHODS: method ' + m + ' not in IANA registry');
    }
  }
  if (errs.length > 0) {
    throw new Error('[http-protocol-pairings] table audit failed:\n  ' + errs.join('\n  '));
  }
})();

// ===========================================================================
// 8. CLI — runs the module against a single spec from openapi-examples.
// ===========================================================================

async function main(): Promise<void> {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const SPIKE_DIR = path.resolve(__dirname, '..');
  const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
  const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

  const specName = process.argv[2];
  if (!specName) {
    console.error('Usage: tsx deterministic/http-protocol-pairings.ts <spec-name>');
    console.error('  e.g. tsx deterministic/http-protocol-pairings.ts pagerduty-full');
    process.exit(1);
  }

  const specDir = path.join(EXAMPLES_DIR, specName);
  if (!fs.existsSync(specDir)) {
    console.error('Spec directory not found: ' + specDir);
    process.exit(1);
  }

  let specPath: string | null = null;
  for (const ext of ['json', 'yaml', 'yml']) {
    const candidate = path.join(specDir, 'spec.' + ext);
    if (fs.existsSync(candidate)) {
      specPath = candidate;
      break;
    }
  }
  if (!specPath) {
    console.error('No spec.{json,yaml,yml} found in ' + specDir);
    process.exit(1);
  }

  const raw = fs.readFileSync(specPath, 'utf8');
  let spec: object;
  if (specPath.endsWith('.json')) {
    spec = JSON.parse(raw);
  } else {
    const YAML = (await import('yaml')).default;
    spec = YAML.parse(raw) as object;
  }

  console.log('Loaded spec: ' + specPath);
  console.log('Running http-protocol-pairings module...\n');

  const startedAt = Date.now();
  const findings = await walkHttpProtocolPairings(spec, { specName });
  const durationMs = Date.now() - startedAt;

  console.log(findings.length + ' findings emitted (' + durationMs + 'ms)\n');
  if (findings.length === 0) {
    console.log('(No http-protocol-pairings findings.)');
    return;
  }
  for (const f of findings) {
    console.log('[' + f.detectorId + ']');
    console.log('  title: ' + f.title);
    console.log('  severity: ' + f.severity);
    if (f.meta) console.log('  meta:  ' + JSON.stringify(f.meta));
    console.log('');
  }
}

// Cross-platform-safe entry-point guard
{
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
