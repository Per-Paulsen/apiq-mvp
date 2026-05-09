/**
 * API-Corpus-Analyzer (M2b/M2c — Mining-Round-3)
 *
 * Reusable library for statistical pattern-mining over a healthy OpenAPI-spec
 * corpus. Per `specs/E09-w-m-mining-optimization.md` D8/D9/D10.
 *
 * Public-API:
 *   - {@link STATISTICS} — registry of 10 statistic-definitions (description + lens).
 *   - {@link analyzeCorpus} — run a single statistic over a CorpusSpec[].
 *   - {@link analyzeAll} — run all 10 statistics.
 *   - {@link loadCorpusFromManifest} — load corpus from healthy-corpus manifest.
 *
 * Robustness: ALL detection-functions are try/catch-wrapped. Malformed specs do
 * NOT crash the run — they're skipped with a counter increment. ALL stats run
 * to completion even if 100+ of 521 specs fail individual detections.
 *
 * Authored 2026-05-07 by M2b+M2c-Subagent.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Lens } from '../deterministic/infra/severity-schema.js';

// =============================================================================
// Types — Public-API surface
// =============================================================================

export interface CorpusStat {
  patternId: string;
  description: string;
  lens: Lens[];
  /** value → count (e.g. "offset+limit" → 374, "cursor" → 89) */
  distribution: Map<string, number>;
  totalSpecs: number;
  /** % (0..1) of specs that exhibit the most-common value. */
  confidenceScore: number;
  /** Optional sample of up to 3 spec-ids per distribution-value. */
  examples?: Map<string, string[]>;
  /** Number of specs that failed/were skipped during this stat-detection. */
  skippedCount: number;
}

export interface CorpusSpec {
  /** spec-id from manifest */
  id: string;
  /** parsed OpenAPI document */
  doc: AnyOpenAPIDoc;
  /** denormalized metadata from manifest */
  metadata?: {
    operationsCount: number;
    tagsCount: number;
    descriptionRate: number;
    title?: string;
  };
}

/** Loose typing — corpus specs are real-world messy data. */
type AnyOpenAPIDoc = {
  openapi?: string;
  swagger?: string;
  info?: { version?: string; title?: string; [k: string]: unknown };
  paths?: Record<string, AnyPathItem>;
  components?: {
    securitySchemes?: Record<string, AnySecurityScheme>;
    schemas?: Record<string, unknown>;
    [k: string]: unknown;
  };
  security?: unknown;
  servers?: Array<{ url?: string }>;
  [k: string]: unknown;
};

type AnyPathItem = {
  get?: AnyOperation;
  post?: AnyOperation;
  put?: AnyOperation;
  patch?: AnyOperation;
  delete?: AnyOperation;
  head?: AnyOperation;
  options?: AnyOperation;
  parameters?: AnyParameter[];
  [k: string]: unknown;
};

type AnyOperation = {
  operationId?: string;
  parameters?: AnyParameter[];
  requestBody?: { content?: Record<string, { schema?: unknown }> };
  responses?: Record<string, AnyResponse>;
  security?: unknown;
  tags?: string[];
  [k: string]: unknown;
};

type AnyParameter = {
  name?: string;
  in?: string;
  schema?: unknown;
  [k: string]: unknown;
};

type AnyResponse = {
  description?: string;
  headers?: Record<string, unknown>;
  content?: Record<string, { schema?: AnySchema }>;
  [k: string]: unknown;
};

type AnySchema = {
  type?: string;
  $ref?: string;
  properties?: Record<string, AnySchema>;
  items?: AnySchema;
  required?: string[];
  [k: string]: unknown;
};

type AnySecurityScheme = {
  type?: string;
  in?: string;
  name?: string;
  scheme?: string;
  flows?: unknown;
  [k: string]: unknown;
};

export type StatisticName =
  | 'pagination'
  | 'auth-scheme'
  | 'error-shape'
  | 'versioning'
  | 'standard-headers'
  | 'schema-style'
  | 'operation-naming'
  | 'content-type'
  | 'oas-version'
  | 'security-coverage';

export const STATISTICS: Record<StatisticName, { description: string; lens: Lens[] }> = {
  pagination: {
    description: 'Pagination-Convention-Verteilung über List-Endpoints',
    lens: ['client-friction', 'style-coherence'],
  },
  'auth-scheme': {
    description: 'Auth-Scheme-Verteilung (dominant scheme per spec)',
    lens: ['threat-modeling'],
  },
  'error-shape': {
    description: 'Error-Response-Shape-Verteilung (4xx-Sample)',
    lens: ['standards-compliance', 'style-coherence'],
  },
  versioning: {
    description: 'Versioning-Convention-Verteilung',
    lens: ['evolution-friction'],
  },
  'standard-headers': {
    description: 'Standard-Header-Adoption (X-Request-Id, Idempotency-Key, Retry-After, RateLimit-*, Sunset, Deprecation, X-API-Version)',
    lens: ['threat-modeling', 'standards-compliance', 'operations', 'ai-agent-consumability', 'operational-metadata'],
  },
  'schema-style': {
    description: 'Schema-Style-Verteilung (REST-L2 / RPC / JSON-API / HAL / AIP / mixed)',
    lens: ['style-coherence'],
  },
  'operation-naming': {
    description: 'OperationId-Naming-Convention-Verteilung',
    lens: ['client-friction'],
  },
  'content-type': {
    description: 'Content-Type-Verteilung über alle Operations',
    lens: ['standards-compliance', 'style-coherence'],
  },
  'oas-version': {
    description: 'OAS-Version-Verteilung (3.0.x / 3.1.x / 2.0)',
    lens: ['evolution-friction', 'style-coherence'],
  },
  'security-coverage': {
    description: 'Security-Coverage über Write-Operations (POST/PUT/PATCH/DELETE)',
    lens: ['threat-modeling'],
  },
};

// =============================================================================
// Internals — Helpers
// =============================================================================

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface OperationCtx {
  path: string;
  method: HttpMethod;
  op: AnyOperation;
}

/** Iterate all operations in a doc, yielding (path, method, op) tuples. */
function* iterOps(doc: AnyOpenAPIDoc): Generator<OperationCtx> {
  if (!doc?.paths || typeof doc.paths !== 'object') return;
  for (const [pth, item] of Object.entries(doc.paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const m of HTTP_METHODS) {
      const op = (item as AnyPathItem)[m];
      if (op && typeof op === 'object') yield { path: pth, method: m, op };
    }
  }
}

/** Increment value in distribution-map. */
function bump(dist: Map<string, number>, key: string): void {
  dist.set(key, (dist.get(key) ?? 0) + 1);
}

/** Sample-add to examples-map (cap 3 per key). */
function sample(examples: Map<string, string[]>, key: string, specId: string): void {
  let arr = examples.get(key);
  if (!arr) {
    arr = [];
    examples.set(key, arr);
  }
  if (arr.length < 3) arr.push(specId);
}

/** Build a CorpusStat from a per-spec classifier function. */
function aggregateStat(
  name: StatisticName,
  patternId: string,
  specs: CorpusSpec[],
  classifyOne: (spec: CorpusSpec) => string | null,
): CorpusStat {
  const dist = new Map<string, number>();
  const examples = new Map<string, string[]>();
  let total = 0;
  let skipped = 0;
  for (const s of specs) {
    let label: string | null = null;
    try {
      label = classifyOne(s);
    } catch {
      // single spec broke this stat — skip
      label = null;
    }
    if (label === null) {
      skipped++;
      continue;
    }
    bump(dist, label);
    sample(examples, label, s.id);
    total++;
  }
  let confidence = 0;
  if (total > 0) {
    const top = Math.max(...Array.from(dist.values()));
    confidence = top / total;
  }
  return {
    patternId,
    description: STATISTICS[name].description,
    lens: STATISTICS[name].lens,
    distribution: dist,
    totalSpecs: total,
    confidenceScore: confidence,
    examples,
    skippedCount: skipped,
  };
}

// =============================================================================
// Statistic-1: Pagination-Convention
// =============================================================================

const PAGINATION_OFFSET_PARAMS = new Set(['offset', 'skip', 'start', 'startindex']);
const PAGINATION_LIMIT_PARAMS = new Set(['limit', 'size', 'count', 'top', 'pagesize', 'per_page', 'perpage', 'maxresults']);
const PAGINATION_CURSOR_PARAMS = new Set(['cursor', 'after', 'before', 'next', 'pagetoken', 'page_token', 'continuation', 'continuationtoken']);
const PAGINATION_PAGE_PARAMS = new Set(['page', 'pagenumber', 'page_number', 'pageindex', 'page_index']);

/** Per-operation: classify pagination-style if it looks like a list-endpoint. */
function classifyOpPagination(op: AnyOperation, item: AnyPathItem): string | null {
  const params: AnyParameter[] = [
    ...(Array.isArray(op.parameters) ? op.parameters : []),
    ...(Array.isArray(item.parameters) ? item.parameters : []),
  ];
  const queryNames = new Set(
    params
      .filter((p) => p && typeof p === 'object' && (p.in === 'query'))
      .map((p) => (p.name ?? '').toLowerCase()),
  );

  const hasOffset = [...queryNames].some((n) => PAGINATION_OFFSET_PARAMS.has(n));
  const hasLimit = [...queryNames].some((n) => PAGINATION_LIMIT_PARAMS.has(n));
  const hasCursor = [...queryNames].some((n) => PAGINATION_CURSOR_PARAMS.has(n));
  const hasPage = [...queryNames].some((n) => PAGINATION_PAGE_PARAMS.has(n));

  // Check Link-header in 200/2xx responses
  let hasLinkHeader = false;
  if (op.responses && typeof op.responses === 'object') {
    for (const [code, resp] of Object.entries(op.responses)) {
      if (!/^2/.test(code)) continue;
      if (resp && typeof resp === 'object' && resp.headers) {
        for (const h of Object.keys(resp.headers)) {
          if (h.toLowerCase() === 'link') hasLinkHeader = true;
        }
      }
    }
  }

  if (hasOffset && hasLimit) return 'offset+limit';
  if (hasCursor) return 'cursor';
  if (hasPage && hasLimit) return 'page+per_page';
  if (hasPage) return 'page-only';
  if (hasLimit) return 'limit-only';
  if (hasLinkHeader) return 'link-header';
  return null;
}

/** Heuristic: is this op a list-endpoint? GET-only, has query-params, returns array or paginated obj. */
function isListEndpoint(op: AnyOperation, method: HttpMethod): boolean {
  if (method !== 'get') return false;
  // Look for an array-shape response or generic 2xx
  if (!op.responses || typeof op.responses !== 'object') return false;
  for (const [code, resp] of Object.entries(op.responses)) {
    if (!/^2/.test(code)) continue;
    if (!resp || typeof resp !== 'object') continue;
    const content = resp.content;
    if (!content) continue;
    for (const ct of Object.values(content)) {
      const schema = ct?.schema;
      if (schema && typeof schema === 'object') {
        if (schema.type === 'array') return true;
        const props = schema.properties;
        if (props && typeof props === 'object') {
          for (const propVal of Object.values(props)) {
            if (propVal && typeof propVal === 'object' && propVal.type === 'array') return true;
          }
        }
        // $ref → assume list if op has typical pagination params (caller will further check)
      }
    }
  }
  return false;
}

function classifyPagination(spec: CorpusSpec): string | null {
  const counts = new Map<string, number>();
  let listOpsFound = 0;
  if (!spec.doc?.paths) return null;
  for (const [, item] of Object.entries(spec.doc.paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const m of HTTP_METHODS) {
      const op = (item as AnyPathItem)[m];
      if (!op) continue;
      if (!isListEndpoint(op, m)) continue;
      listOpsFound++;
      const style = classifyOpPagination(op, item as AnyPathItem);
      if (style) bump(counts, style);
    }
  }
  if (listOpsFound === 0) return null; // no list-endpoints → exclude from sample
  if (counts.size === 0) return 'none';
  // Return dominant style
  let best = '';
  let bestN = -1;
  for (const [k, v] of counts) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return best;
}

// =============================================================================
// Statistic-2: Auth-Scheme
// =============================================================================

function classifyAuthScheme(spec: CorpusSpec): string | null {
  const schemes = spec.doc?.components?.securitySchemes;
  if (!schemes || typeof schemes !== 'object') return 'none';
  const types = new Set<string>();
  for (const sch of Object.values(schemes)) {
    if (!sch || typeof sch !== 'object') continue;
    const t = (sch.type ?? '').toLowerCase();
    if (t === 'apikey') {
      const inLoc = (sch.in ?? '').toLowerCase();
      if (inLoc === 'header') types.add('apiKey-header');
      else if (inLoc === 'query') types.add('apiKey-query');
      else if (inLoc === 'cookie') types.add('apiKey-cookie');
      else types.add('apiKey-other');
    } else if (t === 'oauth2') {
      types.add('oauth2');
    } else if (t === 'http') {
      const sc = (sch.scheme ?? '').toLowerCase();
      if (sc === 'bearer') types.add('bearer');
      else if (sc === 'basic') types.add('basic');
      else if (sc === 'digest') types.add('digest');
      else types.add('http-other');
    } else if (t === 'openidconnect') {
      types.add('oidc');
    } else if (t === 'mutualtls') {
      types.add('mtls');
    } else if (t) {
      types.add('other');
    }
  }
  if (types.size === 0) return 'none';
  if (types.size > 1) return 'multi:' + Array.from(types).sort().join('+');
  return [...types][0];
}

// =============================================================================
// Statistic-3: Error-Shape
// =============================================================================

const RFC7807_FIELDS = new Set(['type', 'title', 'detail', 'status']);

function detectErrorShape(schema: AnySchema | undefined): string | null {
  if (!schema || typeof schema !== 'object') return 'status-code-only';
  // Walk one level — properties + required
  const props = schema.properties;
  if (!props || typeof props !== 'object') return 'inline-mixed';
  const propNames = new Set(Object.keys(props).map((n) => n.toLowerCase()));
  let rfcMatches = 0;
  for (const f of RFC7807_FIELDS) {
    if (propNames.has(f)) rfcMatches++;
  }
  if (rfcMatches >= 3) return 'rfc-7807';
  // Vendor-specific
  if (propNames.has('error') || propNames.has('errors') || propNames.has('errorcode') || propNames.has('error_code')) {
    return 'vendor-custom';
  }
  if (propNames.has('message') || propNames.has('code')) {
    return 'inline-mixed';
  }
  return 'inline-mixed';
}

function classifyErrorShape(spec: CorpusSpec): string | null {
  if (!spec.doc?.paths) return null;
  const counts = new Map<string, number>();
  let total = 0;
  for (const ctx of iterOps(spec.doc)) {
    if (!ctx.op.responses) continue;
    for (const [code, resp] of Object.entries(ctx.op.responses)) {
      if (!/^4/.test(code)) continue;
      if (!resp || typeof resp !== 'object') continue;
      // Check Content-Type for application/problem+json
      const content = resp.content;
      if (content) {
        if ('application/problem+json' in content) {
          bump(counts, 'rfc-7807');
          total++;
          continue;
        }
        // Walk first content-type schema
        const firstCT = Object.values(content)[0];
        const shape = detectErrorShape(firstCT?.schema);
        if (shape) {
          bump(counts, shape);
          total++;
        }
      } else {
        bump(counts, 'status-code-only');
        total++;
      }
    }
  }
  if (total === 0) return 'none';
  let best = '';
  let bestN = -1;
  for (const [k, v] of counts) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return best;
}

// =============================================================================
// Statistic-4: Versioning
// =============================================================================

function classifyVersioning(spec: CorpusSpec): string | null {
  if (!spec.doc) return null;

  // 1. URL-path versioning: any server with /vN/ or any path starting with /vN
  const servers = Array.isArray(spec.doc.servers) ? spec.doc.servers : [];
  const hasUrlVersion = servers.some((s) => /\/v\d+(?:\.\d+)?(?:\/|$)/i.test(s?.url ?? ''));
  const pathHasVersion = Object.keys(spec.doc.paths ?? {}).some((p) => /^\/v\d+(?:\.\d+)?(?:\/|$)/i.test(p));

  // 2. Header versioning: any operation has Api-Version / Accept-Version / X-API-Version param
  let headerVersion = false;
  let acceptVendor = false;
  let queryVersion = false;
  for (const ctx of iterOps(spec.doc)) {
    const params = ctx.op.parameters ?? [];
    for (const p of params) {
      if (!p || typeof p !== 'object') continue;
      const name = (p.name ?? '').toLowerCase();
      if (p.in === 'header' && (name === 'api-version' || name === 'accept-version' || name === 'x-api-version' || name === 'version')) {
        headerVersion = true;
      }
      if (p.in === 'query' && (name === 'api-version' || name === 'version' || name === 'v')) {
        queryVersion = true;
      }
      if (p.in === 'header' && name === 'accept') {
        // Accept-vendor: schema-example or pattern hint
        const schema = (p as { schema?: { example?: unknown; enum?: unknown[] } }).schema;
        const ex = schema && typeof schema === 'object' ? schema.example : undefined;
        if (typeof ex === 'string' && /vnd\.[\w.-]+\+\w+/.test(ex)) acceptVendor = true;
      }
    }
    // Check responses content-types for application/vnd.<api>.v<N>+<format>
    if (ctx.op.responses) {
      for (const resp of Object.values(ctx.op.responses)) {
        if (!resp || typeof resp !== 'object' || !resp.content) continue;
        for (const ct of Object.keys(resp.content)) {
          if (/application\/vnd\.[\w.-]+\.v\d+/.test(ct)) acceptVendor = true;
        }
      }
    }
  }

  if (acceptVendor) return 'accept-vendor';
  if (headerVersion) return 'header';
  if (hasUrlVersion || pathHasVersion) return 'url-path';
  if (queryVersion) return 'query';
  return 'none';
}

// =============================================================================
// Statistic-5: Standard-Headers
// =============================================================================

const STANDARD_HEADERS = [
  'x-request-id',
  'idempotency-key',
  'retry-after',
  'ratelimit-limit',
  'ratelimit-remaining',
  'ratelimit-reset',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'sunset',
  'deprecation',
  'x-api-version',
];

/**
 * Returns dominant header-coverage bucket.
 * Each spec scored on whether it declares any of the 12 tracked standard headers.
 */
function classifyStandardHeaders(spec: CorpusSpec): string | null {
  if (!spec.doc?.paths) return null;
  const headersSeen = new Set<string>();
  for (const ctx of iterOps(spec.doc)) {
    // params (request headers)
    for (const p of ctx.op.parameters ?? []) {
      if (!p || typeof p !== 'object') continue;
      if (p.in !== 'header') continue;
      const name = (p.name ?? '').toLowerCase();
      if (STANDARD_HEADERS.includes(name)) headersSeen.add(name);
    }
    // response headers
    if (ctx.op.responses) {
      for (const resp of Object.values(ctx.op.responses)) {
        if (!resp || typeof resp !== 'object' || !resp.headers) continue;
        for (const hname of Object.keys(resp.headers)) {
          const n = hname.toLowerCase();
          if (STANDARD_HEADERS.includes(n)) headersSeen.add(n);
        }
      }
    }
  }
  if (headersSeen.size === 0) return 'none';
  if (headersSeen.size === 1) return 'minimal:' + [...headersSeen][0];
  if (headersSeen.size <= 3) return 'partial:' + headersSeen.size;
  return 'comprehensive:' + headersSeen.size;
}

/** Adoption-counter — separate stat — % of specs that declare each header. */
function detailedHeaderCoverage(specs: CorpusSpec[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const h of STANDARD_HEADERS) counts.set(h, 0);
  for (const s of specs) {
    if (!s.doc?.paths) continue;
    const seen = new Set<string>();
    try {
      for (const ctx of iterOps(s.doc)) {
        for (const p of ctx.op.parameters ?? []) {
          if (!p || typeof p !== 'object') continue;
          if (p.in !== 'header') continue;
          const name = (p.name ?? '').toLowerCase();
          if (STANDARD_HEADERS.includes(name)) seen.add(name);
        }
        if (ctx.op.responses) {
          for (const resp of Object.values(ctx.op.responses)) {
            if (!resp || typeof resp !== 'object' || !resp.headers) continue;
            for (const hname of Object.keys(resp.headers)) {
              const n = hname.toLowerCase();
              if (STANDARD_HEADERS.includes(n)) seen.add(n);
            }
          }
        }
      }
    } catch {
      continue;
    }
    for (const h of seen) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return counts;
}

// =============================================================================
// Statistic-6: Schema-Style
// =============================================================================

function classifySchemaStyle(spec: CorpusSpec): string | null {
  if (!spec.doc) return null;
  let jsonApiHits = 0;
  let halHits = 0;
  let aipHits = 0;
  let rpcHits = 0;
  let restL2Hits = 0;
  let totalChecked = 0;

  // Look at operationIds + content-types as RPC indicator
  for (const ctx of iterOps(spec.doc)) {
    totalChecked++;
    const opId = (ctx.op.operationId ?? '').toLowerCase();
    // RPC: operationId is verb, path is fixed (no {id})
    if (opId && !ctx.path.includes('{') && /^(do|run|execute|search|query|invoke|call|trigger)/.test(opId)) {
      rpcHits++;
    }
    if (HTTP_METHODS.includes(ctx.method) && /\{[^}]+\}/.test(ctx.path)) {
      restL2Hits++;
    }
    // AIP-style: operationId like resource:custom (e.g. "users:batchGet")
    if (/[a-z]+:[a-z]+/i.test(ctx.op.operationId ?? '')) aipHits++;
    // Walk responses for json-api / hal markers
    if (ctx.op.responses) {
      for (const resp of Object.values(ctx.op.responses)) {
        if (!resp || typeof resp !== 'object' || !resp.content) continue;
        for (const ctName of Object.keys(resp.content)) {
          if (ctName === 'application/vnd.api+json') jsonApiHits++;
          if (ctName === 'application/hal+json') halHits++;
        }
        // Walk schema for _links / data+included markers
        for (const ct of Object.values(resp.content)) {
          const sch = ct?.schema as AnySchema | undefined;
          if (!sch || typeof sch !== 'object') continue;
          const props = sch.properties;
          if (!props || typeof props !== 'object') continue;
          if ('_links' in props || '_embedded' in props) halHits++;
          if ('data' in props && 'included' in props) jsonApiHits++;
        }
      }
    }
  }

  if (totalChecked === 0) return null;
  if (jsonApiHits > 3) return 'json-api';
  if (halHits > 3) return 'hal';
  if (aipHits > totalChecked * 0.3) return 'aip';
  if (rpcHits > totalChecked * 0.3) return 'rpc';
  if (restL2Hits > totalChecked * 0.3) return 'rest-l2';
  if (rpcHits > 0 && restL2Hits > 0) return 'mixed';
  return 'rest-l1-or-flat';
}

// =============================================================================
// Statistic-7: Operation-naming convention
// =============================================================================

function classifyOperationNaming(spec: CorpusSpec): string | null {
  if (!spec.doc?.paths) return null;
  const ids: string[] = [];
  for (const ctx of iterOps(spec.doc)) {
    if (typeof ctx.op.operationId === 'string' && ctx.op.operationId.length > 0) {
      ids.push(ctx.op.operationId);
    }
    if (ids.length >= 20) break;
  }
  if (ids.length === 0) return 'no-operationIds';

  const counts = new Map<string, number>();
  for (const id of ids) {
    let style: string;
    if (/_/.test(id) && id.toLowerCase() === id) style = 'snake_case';
    else if (/-/.test(id)) style = 'kebab-case';
    else if (/^[a-z][a-zA-Z0-9]*$/.test(id) && /[A-Z]/.test(id) && /^[a-z]+(get|post|put|patch|delete|list|create|update|remove|fetch|find|search)/i.test(id))
      style = 'verbResource-camel';
    else if (/^[a-z][a-zA-Z0-9]*$/.test(id)) style = 'camelCase';
    else if (/^[A-Z]/.test(id)) style = 'PascalCase';
    else style = 'other';
    bump(counts, style);
  }
  // Pick dominant
  let best = '';
  let bestN = -1;
  for (const [k, v] of counts) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  // If no single style covers >60%, mark "mixed"
  const dom = bestN / ids.length;
  if (dom < 0.6 && counts.size > 1) return 'mixed';
  return best;
}

// =============================================================================
// Statistic-8: Content-Type
// =============================================================================

function classifyContentType(spec: CorpusSpec): string | null {
  if (!spec.doc?.paths) return null;
  const cts = new Set<string>();
  for (const ctx of iterOps(spec.doc)) {
    // request body
    const req = ctx.op.requestBody;
    if (req && typeof req === 'object' && req.content) {
      for (const c of Object.keys(req.content)) cts.add(c.toLowerCase());
    }
    // responses
    if (ctx.op.responses) {
      for (const resp of Object.values(ctx.op.responses)) {
        if (!resp || typeof resp !== 'object' || !resp.content) continue;
        for (const c of Object.keys(resp.content)) cts.add(c.toLowerCase());
      }
    }
  }
  if (cts.size === 0) return 'none';
  // Primary classification
  if (cts.size === 1) {
    const only = [...cts][0];
    if (only === 'application/json') return 'json-only';
    if (only === 'application/xml') return 'xml-only';
    return 'single:' + only;
  }
  // Multiple types — what are they?
  const hasJson = cts.has('application/json');
  const hasXml = cts.has('application/xml');
  const hasFormData = cts.has('multipart/form-data') || cts.has('application/x-www-form-urlencoded');
  const hasOctet = cts.has('application/octet-stream');
  const hasProblemJson = cts.has('application/problem+json');
  if (hasJson && hasXml) return 'json+xml';
  if (hasJson && hasFormData) return 'json+form';
  if (hasJson && hasProblemJson) return 'json+problem-json';
  if (hasJson && hasOctet) return 'json+binary';
  if (hasJson) return 'json+other';
  return 'multi-non-json';
}

// =============================================================================
// Statistic-9: OAS-Version
// =============================================================================

function classifyOasVersion(spec: CorpusSpec): string | null {
  const oas = spec.doc?.openapi;
  const sw = spec.doc?.swagger;
  if (typeof oas === 'string') {
    if (/^3\.0/.test(oas)) return '3.0.x';
    if (/^3\.1/.test(oas)) return '3.1.x';
    if (/^3\.2/.test(oas)) return '3.2.x';
    return 'oas-' + oas;
  }
  if (typeof sw === 'string') {
    if (/^2/.test(sw)) return '2.0';
    return 'swagger-' + sw;
  }
  return 'unknown';
}

// =============================================================================
// Statistic-10: Security-Coverage on write-ops
// =============================================================================

const WRITE_METHODS = new Set<HttpMethod>(['post', 'put', 'patch', 'delete']);

function classifySecurityCoverage(spec: CorpusSpec): string | null {
  if (!spec.doc?.paths) return null;
  let writeOps = 0;
  let secured = 0;
  const globalSecurity = Array.isArray(spec.doc.security) ? spec.doc.security : null;
  const hasGlobalSec = globalSecurity !== null && globalSecurity.length > 0;
  for (const ctx of iterOps(spec.doc)) {
    if (!WRITE_METHODS.has(ctx.method)) continue;
    writeOps++;
    const opSec = ctx.op.security;
    if (Array.isArray(opSec)) {
      // explicit (could be empty array = explicitly unauthed)
      if (opSec.length > 0) secured++;
    } else if (hasGlobalSec) {
      secured++;
    }
  }
  if (writeOps === 0) return null;
  const pct = secured / writeOps;
  if (pct >= 0.99) return 'fully-secured';
  if (pct >= 0.8) return 'mostly-secured';
  if (pct >= 0.5) return 'half-secured';
  if (pct > 0) return 'partial-secured';
  return 'unsecured';
}

// =============================================================================
// Public API — analyzeCorpus / analyzeAll / loadCorpusFromManifest
// =============================================================================

const STAT_DISPATCH: Record<StatisticName, { patternId: string; classify: (s: CorpusSpec) => string | null }> = {
  pagination: { patternId: 'R3-CO-CL-01', classify: classifyPagination },
  'auth-scheme': { patternId: 'R3-CO-TM-01', classify: classifyAuthScheme },
  'error-shape': { patternId: 'R3-CO-SC-01', classify: classifyErrorShape },
  versioning: { patternId: 'R3-CO-EV-01', classify: classifyVersioning },
  'standard-headers': { patternId: 'R3-CO-OP-01', classify: classifyStandardHeaders },
  'schema-style': { patternId: 'R3-CO-ST-01', classify: classifySchemaStyle },
  'operation-naming': { patternId: 'R3-CO-CL-02', classify: classifyOperationNaming },
  'content-type': { patternId: 'R3-CO-SC-02', classify: classifyContentType },
  'oas-version': { patternId: 'R3-CO-EV-02', classify: classifyOasVersion },
  'security-coverage': { patternId: 'R3-CO-TM-02', classify: classifySecurityCoverage },
};

export function analyzeCorpus(specs: CorpusSpec[], stat: StatisticName): CorpusStat {
  const def = STAT_DISPATCH[stat];
  if (!def) throw new Error(`Unknown statistic: ${stat}`);
  return aggregateStat(stat, def.patternId, specs, def.classify);
}

export function analyzeAll(specs: CorpusSpec[]): CorpusStat[] {
  const out: CorpusStat[] = [];
  for (const name of Object.keys(STATISTICS) as StatisticName[]) {
    out.push(analyzeCorpus(specs, name));
  }
  return out;
}

/** Convenience accessor for the standalone Header-Coverage stat (auxiliary). */
export function detailedStandardHeaderCoverage(specs: CorpusSpec[]): Map<string, number> {
  return detailedHeaderCoverage(specs);
}

// =============================================================================
// loadCorpusFromManifest
// =============================================================================

interface ManifestEntry {
  id: string;
  source: string;
  providerName?: string;
  url?: string;
  spec?: {
    oasVersion?: string;
    operationsCount?: number;
    tagsCount?: number;
    descriptionRate?: number;
    title?: string;
  };
  healthy?: boolean;
  duplicate?: boolean;
  onDisk?: boolean;
}

interface Manifest {
  generated: string;
  totalAttempted?: number;
  totalDownloaded?: number;
  totalHealthy?: number;
  specs: ManifestEntry[];
}

export function loadCorpusFromManifest(manifestPath: string): CorpusSpec[] {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as Manifest;
  const dir = path.dirname(manifestPath);
  const out: CorpusSpec[] = [];
  let parseFailed = 0;
  let notOnDisk = 0;
  for (const entry of manifest.specs) {
    if (!entry.healthy || entry.duplicate || !entry.onDisk) {
      if (!entry.onDisk) notOnDisk++;
      continue;
    }
    const fname = path.join(dir, `${entry.id}.json`);
    try {
      if (!fs.existsSync(fname)) {
        notOnDisk++;
        continue;
      }
      const docRaw = fs.readFileSync(fname, 'utf8');
      const doc = JSON.parse(docRaw) as AnyOpenAPIDoc;
      out.push({
        id: entry.id,
        doc,
        metadata: {
          operationsCount: entry.spec?.operationsCount ?? 0,
          tagsCount: entry.spec?.tagsCount ?? 0,
          descriptionRate: entry.spec?.descriptionRate ?? 0,
          title: entry.spec?.title,
        },
      });
    } catch {
      parseFailed++;
      continue;
    }
  }
  if (parseFailed > 0 || notOnDisk > 0) {
    console.warn(
      `[loadCorpusFromManifest] parseFailed=${parseFailed} notOnDisk=${notOnDisk} loaded=${out.length}`,
    );
  }
  return out;
}
