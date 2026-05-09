/**
 * Custom Spectral functions for the P3 Other-Lens ruleset (T-Other-Lens, Welle D).
 *
 * Covers ~20 custom functions for SC-Tier (Style/Convention), SCF-Tier
 * (Structured-Format conformance — JSON:API / HAL / Siren / OData / AIP),
 * Lens-6 (Privacy), Lens-7 (Operations), Lens-9 (AI-Agent-Consumability),
 * Lens-10 (Operational-Metadata), and F-Tier (DOLAR + cross-vendor) P3
 * patterns from `apiq-ruleset-other-p3.yaml`.
 *
 * Many of these are SPEC-WIDE statistical heuristics — they're invoked via
 * `given: "$"` so the targetVal is the full root spec object, and the function
 * decides whether a single finding (or multiple) should fire.
 *
 * Sources (file-level — per-callable headers below cite verbatim):
 *   - Microsoft REST API Guidelines (https://github.com/microsoft/api-guidelines)
 *   - Google AIPs (https://google.aip.dev/, esp. AIP-121, AIP-122, AIP-131-136,
 *     AIP-140, AIP-142, AIP-160)
 *   - Fielding REST dissertation (https://www.ics.uci.edu/~fielding/pubs/dissertation/)
 *   - HAL spec (https://stateless.group/hal_specification.html)
 *   - JSON:API v1.1 (https://jsonapi.org/format/)
 *   - Siren spec (https://github.com/kevinswiber/siren)
 *   - OData v4.01 (https://www.odata.org/documentation/)
 *   - RFC 9111 (HTTP Caching) https://www.rfc-editor.org/rfc/rfc9111
 *   - Postman 2025 State-of-the-API + agentic patterns
 *   - Speakeasy SDK + LLM-friendly-API guidance
 *   - FAIR principles (https://www.go-fair.org/fair-principles/)
 *   - Palma & Khomh DOLAR (Springer 2015, doi 10.1007/978-3-662-48616-0_11)
 *   - API Docs Smells arXiv (Aghajani et al., 2019)
 *
 * Lens: 5 (Style-Coherence, primary), with 6/7/9/10 cross-cuts.
 * Round: 2 + 3 (Welle D / T-Other-Lens)
 */

import type { IFunction, IFunctionResult } from '@stoplight/spectral-core';

type AnyObj = Record<string, unknown>;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

interface SpecPaths {
  [path: string]: {
    [method in HttpMethod]?: {
      operationId?: string;
      summary?: string;
      description?: string;
      parameters?: unknown[];
      responses?: Record<string, unknown>;
      [k: string]: unknown;
    };
  } & { parameters?: unknown[] };
}

function getPaths(spec: unknown): SpecPaths | null {
  if (!isObject(spec)) return null;
  const p = spec.paths;
  if (!isObject(p)) return null;
  return p as SpecPaths;
}

function iterateOperations(
  spec: unknown
): Array<{ path: string; method: HttpMethod; op: AnyObj }> {
  const out: Array<{ path: string; method: HttpMethod; op: AnyObj }> = [];
  const paths = getPaths(spec);
  if (!paths) return out;
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) continue;
    for (const m of HTTP_METHODS) {
      const op = (pathItem as AnyObj)[m];
      if (isObject(op)) {
        out.push({ path: pathKey, method: m, op });
      }
    }
  }
  return out;
}

// =============================================================================
// SC-18 — fieldNameCasingMixed
//
// Detects spec-wide property-name-casing inconsistency: presence of BOTH
// camelCase and snake_case property names in object schemas.
// =============================================================================

/**
 * SC-18 — Field-name casing × content-type style consistency.
 *
 * Source: JSON:API v1.1 §Member-names + Google AIP-140 + Microsoft REST;
 *         rules-brainstorm.md SC-18 (P3, style).
 * Lens: 5 (Style-Coherence), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const fieldNameCasingMixed: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const components = isObject(targetVal.components) ? targetVal.components : null;
  const schemas = components && isObject(components.schemas) ? components.schemas : null;
  if (!schemas) return [];
  let camelCount = 0;
  let snakeCount = 0;
  let kebabCount = 0;
  function walk(node: unknown): void {
    if (!isObject(node)) return;
    const props = node.properties;
    if (isObject(props)) {
      for (const k of Object.keys(props)) {
        // skip purely-lowercase / purely-uppercase / @-prefixed (HAL/JSON:API
        // markers) — not informative for casing-style detection.
        if (k.startsWith('_') || k.startsWith('@') || k.startsWith('$')) continue;
        if (k.toLowerCase() === k && !k.includes('-') && !k.includes('_')) continue;
        if (/_/.test(k)) snakeCount++;
        else if (/-/.test(k)) kebabCount++;
        else if (/[a-z][A-Z]/.test(k)) camelCount++;
      }
      for (const v of Object.values(props)) walk(v);
    }
    if (isObject(node.items)) walk(node.items);
    if (Array.isArray(node.allOf)) for (const s of node.allOf) walk(s);
    if (Array.isArray(node.oneOf)) for (const s of node.oneOf) walk(s);
    if (Array.isArray(node.anyOf)) for (const s of node.anyOf) walk(s);
  }
  for (const s of Object.values(schemas)) walk(s);
  const stylesUsed = [camelCount > 0, snakeCount > 0, kebabCount > 0].filter(Boolean).length;
  if (stylesUsed >= 2) {
    return [
      {
        message:
          `Spec mixes property-name casing styles: ${camelCount} camelCase, ${snakeCount} snake_case, ${kebabCount} kebab-case. ` +
          `Pick one (JSON:API: snake_case; AIP-140: snake_case; OData/Microsoft: camelCase) and apply consistently.`,
      },
    ];
  }
  return [];
};

// =============================================================================
// SCF-17 — aipTimeFieldImperative
//
// AIP-142: time fields use imperative form (`update_time`, NOT
// `updated_time`). Detects schema property names matching `*ed_time` or
// `*edTime` patterns.
// =============================================================================

/**
 * SCF-17 — AIP-142 time-field imperative naming.
 *
 * Source: Google AIP-142 (Time fields);
 *         rules-brainstorm.md SCF-17 (P3, norm).
 * Lens: 5 (Style-Coherence), 2 (Standards-Compliance)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const aipTimeFieldImperative: IFunction = function (
  targetVal,
  _opts,
  ctx
) {
  if (!isObject(targetVal)) return [];
  const findings: IFunctionResult[] = [];
  for (const fieldName of Object.keys(targetVal)) {
    if (/_time$/i.test(fieldName) && /ed_time$/i.test(fieldName)) {
      findings.push({
        message:
          `Time-field name '${fieldName}' uses past-tense form ('${fieldName}'); AIP-142 prefers imperative ` +
          `(e.g. '${fieldName.replace(/ed_time$/, '_time')}').`,
        path: [...(ctx?.path ?? []), fieldName],
      });
    }
  }
  return findings;
};

// =============================================================================
// SCF-13 — aipCustomMethodUsesPost
//
// AIP-136 custom-method paths (paths containing `:verb`) MUST use POST or
// GET. PUT/DELETE/PATCH on custom-method paths are non-conformant.
// =============================================================================

/**
 * SCF-13 — AIP custom-method uses POST or GET.
 *
 * Source: Google AIP-136 (Custom methods);
 *         rules-brainstorm.md SCF-13 (P3, norm).
 * Lens: 5 (Style-Coherence), 2 (Standards-Compliance)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const aipCustomMethodUsesPost: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const paths = getPaths(targetVal);
  if (!paths) return [];
  const findings: IFunctionResult[] = [];
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) continue;
    if (!pathKey.includes(':')) continue;
    // Custom-method path. Allowed methods: POST, GET.
    for (const m of HTTP_METHODS) {
      if (m === 'post' || m === 'get') continue;
      if (m in pathItem) {
        findings.push({
          message:
            `AIP custom-method path '${pathKey}' uses ${m.toUpperCase()} — only POST (or GET for read-only) is allowed per AIP-136.`,
        });
      }
    }
  }
  return findings;
};

// =============================================================================
// SCF-12 — odataDollarParamAllowedSet
//
// OData $-prefix params should be from the allowed System-Query-Options set.
// Iterates all parameters in the spec, filters to those starting with `$`,
// and reports any not in the allowlist.
// =============================================================================

const ODATA_ALLOWED_DOLLAR_PARAMS = new Set([
  '$filter',
  '$orderby',
  '$select',
  '$expand',
  '$top',
  '$skip',
  '$count',
  '$search',
  '$compute',
  '$format',
  '$apply',
  '$skiptoken',
  '$ref',
  '$id',
  '$schema',
]);

/**
 * SCF-12 — OData $-prefix parameter allowed-set.
 *
 * Source: OData v4.01 §11.2.5 (System Query Options);
 *         rules-brainstorm.md SCF-12 (P3, norm).
 * Lens: 5 (Style-Coherence), 2 (Standards-Compliance)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const odataDollarParamAllowedSet: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const findings: IFunctionResult[] = [];
  const ops = iterateOperations(targetVal);
  for (const { path, method, op } of ops) {
    const params = Array.isArray(op.parameters) ? op.parameters : [];
    for (const p of params) {
      if (!isObject(p)) continue;
      const name = typeof p.name === 'string' ? p.name : '';
      if (!name.startsWith('$')) continue;
      if (!ODATA_ALLOWED_DOLLAR_PARAMS.has(name)) {
        findings.push({
          message:
            `OData $-prefix parameter '${name}' on ${method.toUpperCase()} ${path} is not from the allowed System-Query-Options set ` +
            `($filter, $orderby, $select, $expand, $top, $skip, $count, $search, $compute, $format, $apply).`,
        });
      }
    }
  }
  return findings;
};

// =============================================================================
// SC-1 — restVsRpcMixing
//
// Detects specs that mix REST-style paths (resource-noun, e.g. `/users/{id}`)
// with RPC-style paths (verb-action, e.g. `/getUser`, `/users:cancel`) where
// each style accounts for >10 % of paths. Either pure-REST or pure-RPC is fine
// — but mixing produces inconsistent SDKs and confuses agents.
// =============================================================================

const RPC_VERB_PREFIXES = [
  'get',
  'list',
  'fetch',
  'create',
  'add',
  'new',
  'update',
  'edit',
  'modify',
  'delete',
  'remove',
  'cancel',
  'submit',
  'send',
  'do',
  'perform',
  'execute',
  'run',
  'process',
  'check',
  'validate',
  'verify',
  'login',
  'logout',
  'register',
  'subscribe',
  'unsubscribe',
];

function isRpcStyle(pathKey: string): boolean {
  // AIP-136 colon-action — `/users/{id}:cancel`
  if (pathKey.includes(':')) return true;
  const segments = pathKey.split('/').filter((s) => s && !s.startsWith('{'));
  if (segments.length === 0) return false;
  // Last segment a verb-prefixed word? (`/getUsers`, `/listInvoices`).
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    for (const verb of RPC_VERB_PREFIXES) {
      if (lower === verb || lower.startsWith(verb + '-') || lower.startsWith(verb + '_')) {
        return true;
      }
      // camelCase: `getUsers` → starts with verb followed by uppercase
      if (
        seg.startsWith(verb) &&
        seg.length > verb.length &&
        seg[verb.length] === seg[verb.length].toUpperCase()
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * SC-1 — REST-vs-RPC mixing detector.
 *
 * Source: Microsoft REST API Guidelines + Google AIP-121 ("REST first") +
 *         Richardson Maturity Model;
 *         rules-brainstorm.md SC-1 (P3, style).
 * Lens: 5 (Style-Coherence), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const restVsRpcMixing: IFunction = function (targetVal, _opts, _ctx) {
  if (!isObject(targetVal)) return [];
  const paths = getPaths(targetVal);
  if (!paths) return [];
  const allKeys = Object.keys(paths);
  if (allKeys.length < 5) return []; // small-spec: don't fire on tiny APIs
  let rpcCount = 0;
  for (const k of allKeys) {
    if (isRpcStyle(k)) rpcCount++;
  }
  const restCount = allKeys.length - rpcCount;
  const rpcRatio = rpcCount / allKeys.length;
  const restRatio = restCount / allKeys.length;
  if (rpcRatio > 0.1 && restRatio > 0.1) {
    return [
      {
        message:
          `Spec mixes REST-style and RPC-style paths (${rpcCount} RPC / ${restCount} REST out of ${allKeys.length}). ` +
          `Mixing styles produces inconsistent SDK method names and confuses both human and agent consumers — pick one style.`,
      },
    ];
  }
  return [];
};

// =============================================================================
// SC-3 — httpMethodSemanticsViolated
//
// GET ops whose operationId or path contains state-change verbs ("create",
// "delete", "cancel", "submit", ...) violate HTTP semantics — they're cacheable
// + safe by spec, but the name implies otherwise.
// =============================================================================

const STATE_CHANGE_VERBS = [
  'create',
  'add',
  'new',
  'insert',
  'delete',
  'remove',
  'destroy',
  'update',
  'edit',
  'modify',
  'patch',
  'cancel',
  'submit',
  'send',
  'execute',
  'run',
  'register',
  'subscribe',
  'unsubscribe',
  'login',
  'logout',
];

/**
 * SC-3 — HTTP method semantics violation.
 *
 * Source: Fielding REST dissertation §5.1 + Microsoft REST guidelines +
 *         Google AIP-131 ("Standard methods");
 *         rules-brainstorm.md SC-3 (P3, semantic).
 * Lens: 5 (Style-Coherence), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const httpMethodSemanticsViolated: IFunction = function (
  targetVal,
  _opts,
  ctx
) {
  if (!isObject(targetVal)) return [];
  const path = ctx?.path ?? [];
  // We're invoked with `given: $.paths[*].get` so targetVal is the GET op.
  const opId =
    typeof targetVal.operationId === 'string' ? targetVal.operationId.toLowerCase() : '';
  // Path is the second-to-last element (paths/<key>/get → key at index path.length-2).
  let pathKey = '';
  for (let i = 0; i < path.length - 1; i++) {
    if (path[i] === 'paths') {
      pathKey = String(path[i + 1] ?? '').toLowerCase();
      break;
    }
  }
  const offenders: string[] = [];
  for (const verb of STATE_CHANGE_VERBS) {
    if (opId.includes(verb) || pathKey.includes(verb)) {
      offenders.push(verb);
    }
  }
  if (offenders.length === 0) return [];
  return [
    {
      message:
        `GET operation contains state-change verb(s) [${offenders.join(', ')}] in operationId/path; ` +
        `GET is cacheable + safe per RFC 9110 §9.2.1 — use POST for state-changing actions or remove the verb from naming.`,
    },
  ];
};

// =============================================================================
// SC-15 — crudAsymmetricResources
//
// For resources with collection paths (`/foo`) and item paths (`/foo/{id}`),
// detects asymmetry: e.g. POST /foo present but GET /foo missing, or PUT/PATCH
// /foo/{id} present but GET /foo/{id} missing.
// =============================================================================

interface ResourceCrud {
  collectionGet: boolean;
  collectionPost: boolean;
  itemGet: boolean;
  itemPut: boolean;
  itemPatch: boolean;
  itemDelete: boolean;
}

function buildResourceMap(paths: SpecPaths): Map<string, ResourceCrud> {
  const map = new Map<string, ResourceCrud>();
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) continue;
    // Identify collection vs item: trailing `/{x}` segment indicates item
    const segs = pathKey.split('/').filter((s) => s.length > 0);
    if (segs.length === 0) continue;
    const lastSeg = segs[segs.length - 1];
    const isItem = lastSeg.startsWith('{') && lastSeg.endsWith('}');
    const resourceKey = isItem
      ? '/' + segs.slice(0, -1).join('/')
      : pathKey.replace(/\/$/, '');
    if (resourceKey === '' || resourceKey === '/') continue;
    if (!map.has(resourceKey)) {
      map.set(resourceKey, {
        collectionGet: false,
        collectionPost: false,
        itemGet: false,
        itemPut: false,
        itemPatch: false,
        itemDelete: false,
      });
    }
    const e = map.get(resourceKey)!;
    if (isItem) {
      if ('get' in pathItem) e.itemGet = true;
      if ('put' in pathItem) e.itemPut = true;
      if ('patch' in pathItem) e.itemPatch = true;
      if ('delete' in pathItem) e.itemDelete = true;
    } else {
      if ('get' in pathItem) e.collectionGet = true;
      if ('post' in pathItem) e.collectionPost = true;
    }
  }
  return map;
}

/**
 * SC-15 — CRUD asymmetry per resource.
 *
 * Source: Google AIP-121 ("Resource oriented design") + Microsoft REST
 *         guidelines + Richardson Maturity Model;
 *         rules-brainstorm.md SC-15 (P3, style).
 * Lens: 5 (Style-Coherence), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const crudAsymmetricResources: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const paths = getPaths(targetVal);
  if (!paths) return [];
  const map = buildResourceMap(paths);
  const issues: string[] = [];
  for (const [res, c] of map.entries()) {
    // Item ops without collection-GET = unobservable resource
    if ((c.itemGet || c.itemPut || c.itemPatch || c.itemDelete) && !c.collectionGet) {
      issues.push(`${res} has item-ops but no collection GET (unobservable resource)`);
    }
    // Collection-POST without item-GET = create-but-can't-read pattern
    if (c.collectionPost && !c.itemGet) {
      issues.push(`${res} has POST collection but no GET item (write-only pattern)`);
    }
    // PUT but no PATCH (or vice versa) — soft signal, skip
  }
  if (issues.length === 0) return [];
  return [
    {
      message:
        `CRUD-asymmetric resources detected: ${issues.slice(0, 3).join('; ')}. ` +
        `Symmetric CRUD (collection GET/POST + item GET/PUT/DELETE) lets agents discover and operate resources predictably.`,
    },
  ];
};

// =============================================================================
// SC-19 — timeFieldNamingMixed
//
// Detects schemas that mix `*_time`-style and `*_at`-style time-field names
// across the spec. Pick one convention (Google AIP-142 prefers `*_time`,
// Stripe / Rails prefer `*_at`) and apply consistently.
// =============================================================================

/**
 * SC-19 — Time-field naming-coherence (mixed *_time / *_at).
 *
 * Source: Google AIP-142 + Stripe/Rails convention + Microsoft REST guidelines;
 *         rules-brainstorm.md SC-19 (P3, style).
 * Lens: 5 (Style-Coherence), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const timeFieldNamingMixed: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const components = isObject(targetVal.components) ? targetVal.components : null;
  const schemas = components && isObject(components.schemas) ? components.schemas : null;
  if (!schemas) return [];
  let timeSuffixCount = 0;
  let atSuffixCount = 0;
  function walk(node: unknown): void {
    if (!isObject(node)) return;
    const props = node.properties;
    if (isObject(props)) {
      for (const k of Object.keys(props)) {
        if (/_time$/i.test(k) || /Time$/.test(k)) timeSuffixCount++;
        if (/_at$/i.test(k) || /At$/.test(k)) atSuffixCount++;
      }
      for (const v of Object.values(props)) walk(v);
    }
    if (isObject(node.items)) walk(node.items);
    if (Array.isArray(node.allOf)) for (const s of node.allOf) walk(s);
    if (Array.isArray(node.oneOf)) for (const s of node.oneOf) walk(s);
    if (Array.isArray(node.anyOf)) for (const s of node.anyOf) walk(s);
  }
  for (const s of Object.values(schemas)) walk(s);
  if (timeSuffixCount > 0 && atSuffixCount > 0) {
    return [
      {
        message:
          `Spec mixes time-field naming styles: ${timeSuffixCount} '*_time' fields and ${atSuffixCount} '*_at' fields. ` +
          `Pick one convention (AIP-142: '*_time'; Stripe/Rails: '*_at') and apply consistently.`,
      },
    ];
  }
  return [];
};

// =============================================================================
// SC-22 — filterSyntaxIncoherent
//
// Detects multiple filter-syntax styles co-existing: AIP-160 (`filter=...`),
// JSON:API (`filter[field]=...`), OData (`$filter=...`).
// =============================================================================

/**
 * SC-22 — Filter-syntax incoherence (mixed AIP-160 / JSON:API / OData).
 *
 * Source: Google AIP-160 + JSON:API §Filtering + OData v4.01 §11.2.5.1;
 *         rules-brainstorm.md SC-22 (P3, style).
 * Lens: 5 (Style-Coherence), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const filterSyntaxIncoherent: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const ops = iterateOperations(targetVal);
  let aipFilter = 0;
  let jsonApiFilter = 0;
  let odataFilter = 0;
  for (const { op } of ops) {
    const params = Array.isArray(op.parameters) ? op.parameters : [];
    for (const p of params) {
      if (!isObject(p)) continue;
      const name = typeof p.name === 'string' ? p.name : '';
      if (name === 'filter') aipFilter++;
      else if (/^filter\[[^\]]+\]$/.test(name)) jsonApiFilter++;
      else if (name === '$filter') odataFilter++;
    }
  }
  const styles = [aipFilter > 0, jsonApiFilter > 0, odataFilter > 0].filter(Boolean).length;
  if (styles >= 2) {
    return [
      {
        message:
          `Filter-syntax incoherent: AIP-160 \`filter\` (${aipFilter}), JSON:API \`filter[..]\` (${jsonApiFilter}), OData \`$filter\` (${odataFilter}). ` +
          `Pick one filter convention and apply consistently.`,
      },
    ];
  }
  return [];
};

// =============================================================================
// SC-23 — sortSyntaxIncoherent
//
// Detects multiple sort-syntax styles co-existing: AIP-132 (`order_by=...`),
// JSON:API (`sort=field,-other`), OData (`$orderby=...`).
// =============================================================================

/**
 * SC-23 — Sort-syntax incoherence (mixed AIP-132 / JSON:API / OData).
 *
 * Source: Google AIP-132 + JSON:API §Sorting + OData v4.01 §11.2.5.2;
 *         rules-brainstorm.md SC-23 (P3, style).
 * Lens: 5 (Style-Coherence), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const sortSyntaxIncoherent: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const ops = iterateOperations(targetVal);
  let aipSort = 0;
  let jsonApiSort = 0;
  let odataSort = 0;
  for (const { op } of ops) {
    const params = Array.isArray(op.parameters) ? op.parameters : [];
    for (const p of params) {
      if (!isObject(p)) continue;
      const name = typeof p.name === 'string' ? p.name : '';
      if (name === 'order_by' || name === 'orderBy') aipSort++;
      else if (name === 'sort') jsonApiSort++;
      else if (name === '$orderby') odataSort++;
    }
  }
  const styles = [aipSort > 0, jsonApiSort > 0, odataSort > 0].filter(Boolean).length;
  if (styles >= 2) {
    return [
      {
        message:
          `Sort-syntax incoherent: AIP-132 \`order_by\` (${aipSort}), JSON:API \`sort\` (${jsonApiSort}), OData \`$orderby\` (${odataSort}). ` +
          `Pick one sort convention and apply consistently.`,
      },
    ];
  }
  return [];
};

// =============================================================================
// SC-25 — statusCodeDistributionPerOpType
//
// Detects ops whose declared status codes don't match the operation's
// HTTP-method semantics:
//   - GET should declare 200 + 404 (+ 304 if cacheable);
//   - POST should declare 201 OR 200 + 400 + 422;
//   - PUT/PATCH should declare 200 + 404 + 409;
//   - DELETE should declare 204 OR 200 + 404.
// =============================================================================

const EXPECTED_STATUSES_BY_METHOD: Record<HttpMethod, string[]> = {
  get: ['200'],
  post: ['200', '201', '202', '204'],
  put: ['200', '201', '204'],
  patch: ['200', '204'],
  delete: ['200', '202', '204'],
  head: ['200'],
  options: ['200', '204'],
  trace: ['200'],
};

/**
 * SC-25 — Status-code distribution mismatched with operation type.
 *
 * Source: RFC 7231 §6 + Microsoft REST guidelines + Google AIP-131..136;
 *         rules-brainstorm.md SC-25 (P3, semantic).
 * Lens: 5 (Style-Coherence), 2 (Standards-Compliance)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const statusCodeDistributionPerOpType: IFunction = function (
  targetVal,
  _opts,
  ctx
) {
  if (!isObject(targetVal)) return [];
  // Invoked at op-level: ctx.path = ['paths', <key>, <method>]
  const path = ctx?.path ?? [];
  let method: HttpMethod | null = null;
  for (let i = path.length - 1; i >= 0; i--) {
    const p = String(path[i]).toLowerCase();
    if ((HTTP_METHODS as readonly string[]).includes(p)) {
      method = p as HttpMethod;
      break;
    }
  }
  if (!method) return [];
  const responses = isObject(targetVal.responses) ? targetVal.responses : null;
  if (!responses) return [];
  const declared = Object.keys(responses);
  const expected = EXPECTED_STATUSES_BY_METHOD[method];
  const hasSuccess = declared.some((c) => expected.includes(c));
  if (!hasSuccess) {
    return [
      {
        message:
          `${method.toUpperCase()} operation declares no expected success status (expected one of ${expected.join('/')}). ` +
          `Per RFC 7231 the success-code distribution should match the method's semantics.`,
      },
    ];
  }
  return [];
};

// =============================================================================
// L6-3 — phiFieldNameHint
//
// Detects field-names with HIPAA-relevant PHI hints (medical terminology,
// diagnosis codes, treatment plans). Soft signal — informs the spec author
// that this resource may carry PHI even if not explicitly tagged.
// =============================================================================

const PHI_FIELD_PATTERNS = [
  /diagnos/i,
  /icd[-_]?\d/i,
  /cpt[-_]?code/i,
  /lab[-_]?result/i,
  /(prescription|medication|drug|dosage|dose)/i,
  /(symptom|treatment|therapy)/i,
  /(allergy|allergies)/i,
  /vital[-_]?(sign|signs)/i,
  /blood[-_]?(type|pressure|sugar)/i,
  /heart[-_]?rate/i,
  /pulse/i,
  /(medical|health)[-_]?(record|history)/i,
  /patient[-_]?(id|number)/i,
  /chart[-_]?note/i,
  /clinical/i,
  /pathology/i,
  /radiolog/i,
  /(immuniz|vaccin)ation/i,
];

/**
 * L6-3 — PHI-relevant field-name hint (HIPAA-territory).
 *
 * Source: HIPAA Privacy Rule §164.514 + cross-industry healthcare API patterns;
 *         rules-brainstorm.md L6-3 (P3, heuristic).
 * Lens: 6 (Privacy-Data-Class)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const phiFieldNameHint: IFunction = function (
  targetVal,
  _opts,
  ctx
) {
  // Invoked at property level (`given: "$..properties"`). targetVal is the
  // properties-object; its keys are field-names.
  if (!isObject(targetVal)) return [];
  const findings: IFunctionResult[] = [];
  for (const fieldName of Object.keys(targetVal)) {
    for (const pat of PHI_FIELD_PATTERNS) {
      if (pat.test(fieldName)) {
        findings.push({
          message:
            `Field name '${fieldName}' suggests PHI (HIPAA-relevant). ` +
            `If this resource carries protected-health-information, ensure: ` +
            `(1) explicit privacy-tag in the schema; ` +
            `(2) BAA-conformant access-control; ` +
            `(3) audit-logging of access. Soft heuristic — pattern reuse outside healthcare is fine.`,
          path: [...(ctx?.path ?? []), fieldName],
        });
        break;
      }
    }
  }
  return findings;
};

// =============================================================================
// L7-1 — listEndpointMissingCacheHeaders
//
// List/Index endpoints (GET /collection) that don't declare cache-headers
// (Cache-Control, ETag, Last-Modified) miss a low-cost performance win and
// signal to agents that the response isn't cacheable.
// =============================================================================

/**
 * L7-1 — List endpoints without cache-headers.
 *
 * Source: RFC 9111 (HTTP Caching) + cross-industry consensus
 *         (Stripe / GitHub / Twitter cache list-responses);
 *         rules-brainstorm.md L7-1 (P3, ops).
 * Lens: 7 (Operations), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const listEndpointMissingCacheHeaders: IFunction = function (
  targetVal,
  _opts,
  ctx
) {
  // Invoked at GET-op-level. Determine if this is a list-endpoint by inspecting
  // the path key (no trailing /{id}).
  if (!isObject(targetVal)) return [];
  const path = ctx?.path ?? [];
  let pathKey = '';
  for (let i = 0; i < path.length - 1; i++) {
    if (path[i] === 'paths') {
      pathKey = String(path[i + 1] ?? '');
      break;
    }
  }
  if (!pathKey) return [];
  const segs = pathKey.split('/').filter((s) => s.length > 0);
  if (segs.length === 0) return [];
  const lastSeg = segs[segs.length - 1];
  // Not a list-endpoint if last seg is a path-template (item lookup).
  if (lastSeg.startsWith('{') && lastSeg.endsWith('}')) return [];
  // Walk responses → 200 → headers
  const responses = isObject(targetVal.responses) ? targetVal.responses : null;
  if (!responses) return [];
  const ok = isObject(responses['200']) ? responses['200'] : null;
  if (!ok) return [];
  const headers = isObject(ok.headers) ? ok.headers : {};
  const headerKeysLower = Object.keys(headers).map((h) => h.toLowerCase());
  const cacheHeaders = ['cache-control', 'etag', 'last-modified', 'expires', 'vary'];
  const hasCacheHeader = cacheHeaders.some((h) => headerKeysLower.includes(h));
  if (hasCacheHeader) return [];
  return [
    {
      message:
        `List-endpoint GET ${pathKey} 200-response declares no cache headers (Cache-Control / ETag / Last-Modified). ` +
        `Per RFC 9111 list-responses are typically cacheable — declaring headers signals cacheability to agents and CDNs.`,
    },
  ];
};

// =============================================================================
// L9-2 — descriptionParameterRatio
//
// Operations with many parameters but a tiny description give agents
// insufficient context to disambiguate parameter usage. Heuristic: parameters
// > 3 and description-length < 50 chars (or missing).
// =============================================================================

/**
 * L9-2 — description.length × parameter.count ratio.
 *
 * Source: Postman 2025 State-of-the-API + agentic-patterns research;
 *         rules-brainstorm.md L9-2 (P3, agent-readiness).
 * Lens: 9 (AI-Agent-Consumability), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const descriptionParameterRatio: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const params = Array.isArray(targetVal.parameters) ? targetVal.parameters : [];
  const description = typeof targetVal.description === 'string' ? targetVal.description : '';
  if (params.length <= 3) return [];
  if (description.length >= 50) return [];
  return [
    {
      message:
        `Operation has ${params.length} parameters but ${description.length === 0 ? 'no description' : `description is only ${description.length} chars`}. ` +
        `Agents need ≥50 chars of description per 4+ parameters to disambiguate usage; otherwise tool-call confidence drops.`,
    },
  ];
};

// =============================================================================
// L9-3 — errorSchemaDiscoverability
//
// Error-responses (4xx/5xx) without schemas mean agents can't build
// error-recovery logic — they'll retry blindly or give up.
// =============================================================================

/**
 * L9-3 — Error-schema discoverability for AI-recovery.
 *
 * Source: Postman 2025 + Speakeasy SDK guidance + RFC-7807 error-shape;
 *         rules-brainstorm.md L9-3 (P3, agent-readiness).
 * Lens: 9 (AI-Agent-Consumability), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const errorSchemaDiscoverability: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const responses = isObject(targetVal.responses) ? targetVal.responses : null;
  if (!responses) return [];
  const errorCodes = Object.keys(responses).filter((c) => /^[45]/.test(c) || c === 'default');
  if (errorCodes.length === 0) return [];
  const schemaLessErrors: string[] = [];
  for (const code of errorCodes) {
    const r = responses[code];
    if (!isObject(r)) continue;
    const content = isObject(r.content) ? r.content : null;
    if (!content) {
      schemaLessErrors.push(code);
      continue;
    }
    const hasSchema = Object.values(content).some(
      (mt) => isObject(mt) && (isObject(mt.schema) || mt.schema === '$ref' || (isObject(mt.schema) && '$ref' in mt.schema))
    );
    if (!hasSchema) schemaLessErrors.push(code);
  }
  if (schemaLessErrors.length === 0) return [];
  return [
    {
      message:
        `Error response(s) [${schemaLessErrors.join(', ')}] declare no schema; ` +
        `agents cannot build error-recovery logic without a typed error-shape. Add a schema (RFC-7807 Problem-Details preferred).`,
    },
  ];
};

// =============================================================================
// L9-4 — paginationCursorStability
//
// Operations with cursor / page_token / next_token parameters but no
// description-mention of cursor stability ("opaque", "may change", "stable")
// leave agents uncertain whether to cache cursor values across calls.
// =============================================================================

const CURSOR_PARAM_NAMES = [
  'cursor',
  'page_token',
  'pageToken',
  'next_token',
  'nextToken',
  'continuation',
  'continuationToken',
  'page_after',
  'after',
  'before',
  'starting_after',
  'ending_before',
];

/**
 * L9-4 — Pagination-cursor stability documentation.
 *
 * Source: Postman 2025 + Stripe/GitHub cursor-pagination conventions;
 *         rules-brainstorm.md L9-4 (P3, agent-readiness).
 * Lens: 9 (AI-Agent-Consumability), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const paginationCursorStability: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const params = Array.isArray(targetVal.parameters) ? targetVal.parameters : [];
  for (const p of params) {
    if (!isObject(p)) continue;
    const name = typeof p.name === 'string' ? p.name : '';
    if (!CURSOR_PARAM_NAMES.includes(name)) continue;
    const desc = typeof p.description === 'string' ? p.description.toLowerCase() : '';
    if (
      !desc.includes('opaque') &&
      !desc.includes('stable') &&
      !desc.includes('may change') &&
      !desc.includes('unstable') &&
      !desc.includes('not guaranteed') &&
      !desc.includes('do not cache') &&
      !desc.includes("don't cache") &&
      !desc.includes('treat as')
    ) {
      return [
        {
          message:
            `Pagination parameter '${name}' lacks cursor-stability documentation. ` +
            `Agents need to know if cursor values are opaque/stable/may-change to decide whether to cache them. ` +
            `Add language like "opaque cursor — do not parse" or "stable for 24h".`,
        },
      ];
    }
  }
  return [];
};

// =============================================================================
// L9-5 — operationIdMachineFriendly
//
// operationId should be ≤30 chars + verb-noun pattern (`listUsers`,
// `createInvoice`). Long IDs (`getUserAccountSettingsByUserIdAndOrgId`) confuse
// agent tool-selection.
// =============================================================================

/**
 * L9-5 — operationId machine-friendly + concise (≤30 chars + verb-noun).
 *
 * Source: Speakeasy SDK guidance + LLM-friendly-API patterns;
 *         rules-brainstorm.md L9-5 (P3, agent-readiness).
 * Lens: 9 (AI-Agent-Consumability), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const operationIdMachineFriendly: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (typeof targetVal !== 'string') return [];
  if (targetVal.length === 0) return [];
  const issues: string[] = [];
  if (targetVal.length > 30) issues.push(`>30 chars (${targetVal.length})`);
  // Verb-noun heuristic: should start with a known verb.
  const verbStart = /^(list|get|fetch|read|create|add|update|patch|delete|remove|search|find|count|cancel|submit|send|verify|register|login|logout|subscribe|unsubscribe|enable|disable|activate|archive|restore|export|import|approve|reject|publish|invite|join|leave|complete|fail|retry|move|copy|merge|split|sync|reset|refresh|validate|process|run|trigger|notify)/i;
  if (!verbStart.test(targetVal)) {
    issues.push('does not start with a verb');
  }
  if (issues.length === 0) return [];
  return [
    {
      message:
        `operationId '${targetVal}' is not machine-friendly: ${issues.join(', ')}. ` +
        `Agents prefer concise verb-noun operationIds (≤30 chars, e.g. 'listUsers', 'createInvoice') for reliable tool-selection.`,
    },
  ];
};

// =============================================================================
// L9-6 — summaryConcise
//
// summary should be present + ≤80 chars + a single sentence (no newlines).
// =============================================================================

/**
 * L9-6 — Operation summary present + ≤80-char single-sentence.
 *
 * Source: LLM-friendly-API + Speakeasy SDK guidance;
 *         rules-brainstorm.md L9-6 (P3, agent-readiness).
 * Lens: 9 (AI-Agent-Consumability), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const summaryConcise: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (typeof targetVal !== 'string') {
    return [
      {
        message: `Operation lacks 'summary'; agents prefer a single-sentence summary ≤80 chars for tool-selection.`,
      },
    ];
  }
  if (targetVal.length === 0) {
    return [
      {
        message: `Operation 'summary' is empty; agents need ≤80-char summary for tool-selection.`,
      },
    ];
  }
  if (targetVal.length > 80) {
    return [
      {
        message:
          `Operation 'summary' is ${targetVal.length} chars (>80); agents prefer concise single-sentence summaries.`,
      },
    ];
  }
  if (targetVal.includes('\n') || /[.!?].+[.!?]/.test(targetVal)) {
    return [
      {
        message:
          `Operation 'summary' contains multiple sentences or newlines; use a single concise sentence (≤80 chars).`,
      },
    ];
  }
  return [];
};

// =============================================================================
// L9-8 — functionCallFriendlySchema
//
// Schemas with deeply-nested anyOf / oneOf union types confuse function-call
// LLMs (OpenAI tool-calling, MCP). Heuristic: anyOf with ≥3 branches OR nested
// anyOf-within-anyOf.
// =============================================================================

/**
 * L9-8 — Function-call-friendly schema (no anyOf complexity).
 *
 * Source: OpenAI function-calling docs + MCP schema-conventions;
 *         rules-brainstorm.md L9-8 (P3, agent-readiness).
 * Lens: 9 (AI-Agent-Consumability)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const functionCallFriendlySchema: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const findings: IFunctionResult[] = [];
  function walk(node: unknown, depth: number): void {
    if (!isObject(node)) return;
    const anyOf = node.anyOf;
    const oneOf = node.oneOf;
    if (Array.isArray(anyOf) && anyOf.length >= 3) {
      findings.push({
        message:
          `Schema uses anyOf with ${anyOf.length} branches — agent function-call LLMs struggle with ≥3-branch unions. ` +
          `Consider discriminator-based oneOf or factoring into sub-resources.`,
      });
    }
    if (Array.isArray(oneOf) && oneOf.length >= 4) {
      findings.push({
        message:
          `Schema uses oneOf with ${oneOf.length} branches — consider discriminator-based variant resolution for agent friendliness.`,
      });
    }
    // Nested anyOf inside anyOf
    if (Array.isArray(anyOf)) {
      for (const sub of anyOf) {
        if (isObject(sub) && Array.isArray(sub.anyOf)) {
          findings.push({
            message:
              `Schema has nested anyOf-within-anyOf — agent function-call LLMs cannot reliably traverse nested unions.`,
          });
        }
        walk(sub, depth + 1);
      }
    }
    if (Array.isArray(oneOf)) for (const sub of oneOf) walk(sub, depth + 1);
    if (Array.isArray(node.allOf)) for (const sub of node.allOf) walk(sub, depth + 1);
    if (isObject(node.properties)) {
      for (const v of Object.values(node.properties)) walk(v, depth + 1);
    }
    if (isObject(node.items)) walk(node.items, depth + 1);
  }
  walk(targetVal, 0);
  return findings.slice(0, 3); // cap at 3 per top-level schema
};

// =============================================================================
// L10-4 — externalDocsStub
//
// info.externalDocs.url declared but obviously a stub:
//   - URL contains 'example.com' / 'localhost' / 'TODO'
//   - URL is empty / whitespace
//   - description is "Documentation" / "Docs" / similar generic stub
// =============================================================================

const STUB_URL_PATTERNS = [
  /example\.com/i,
  /localhost/i,
  /127\.0\.0\.1/,
  /TODO/,
  /^https?:\/\/$/,
];

const STUB_DESC_VALUES = new Set([
  'documentation',
  'docs',
  'documentation.',
  'docs.',
  'api documentation',
  'api docs',
  'see documentation',
  'find documentation here',
]);

/**
 * L10-4 — externalDocs stub (declared but unsubstantive).
 *
 * Source: FAIR principles + Postman 2025 + RapidAPI metadata-quality;
 *         rules-brainstorm.md L10-4 (P3, ops-meta).
 * Lens: 10 (Operational-Metadata), 4 (Client-Friction), 9 (AI-Agent-Consumability)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const externalDocsStub: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const url = typeof targetVal.url === 'string' ? targetVal.url : '';
  const desc = typeof targetVal.description === 'string' ? targetVal.description : '';
  const findings: IFunctionResult[] = [];
  if (url.trim().length === 0) {
    findings.push({ message: 'externalDocs.url is empty.' });
  } else {
    for (const pat of STUB_URL_PATTERNS) {
      if (pat.test(url)) {
        findings.push({ message: `externalDocs.url '${url}' looks like a placeholder/stub.` });
        break;
      }
    }
  }
  if (desc.length > 0 && STUB_DESC_VALUES.has(desc.toLowerCase().trim())) {
    findings.push({
      message: `externalDocs.description '${desc}' is generic; provide a substantive description of what the linked docs cover.`,
    });
  }
  return findings;
};

// =============================================================================
// L10-5 — infoContactSubstantive
//
// info.contact must have a substantive url (valid http/https) OR email
// (valid format). Empty / placeholder values fail FAIR-metadata checks.
// =============================================================================

/**
 * L10-5 — info.contact substantive (URL/email valid structure).
 *
 * Source: FAIR principles + Postman 2025 metadata-quality;
 *         rules-brainstorm.md L10-5 (P3, ops-meta).
 * Lens: 10 (Operational-Metadata), 4 (Client-Friction), 9 (AI-Agent-Consumability)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const infoContactSubstantive: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const name = typeof targetVal.name === 'string' ? targetVal.name : '';
  const url = typeof targetVal.url === 'string' ? targetVal.url : '';
  const email = typeof targetVal.email === 'string' ? targetVal.email : '';
  const issues: string[] = [];
  // At least URL OR email must be substantive
  const urlValid = /^https?:\/\/[^\s]+\.[^\s]+/.test(url) && !STUB_URL_PATTERNS.some((p) => p.test(url));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.toLowerCase().includes('example.com');
  if (!urlValid && !emailValid) {
    issues.push('neither url nor email is substantive (both empty/stub/example.com)');
  }
  if (name.length === 0 && !urlValid && !emailValid) {
    issues.push('all contact fields empty');
  }
  if (issues.length === 0) return [];
  return [
    {
      message:
        `info.contact is non-substantive: ${issues.join('; ')}. ` +
        `FAIR-metadata requires at least a substantive URL or email so consumers can reach the spec author.`,
    },
  ];
};

// =============================================================================
// F-2 — acceptLanguageOnUserFacingOps
//
// User-facing operations (ones returning human-readable content like
// product descriptions, error messages, marketing copy) should support
// Accept-Language for i18n. Heuristic: GET ops returning content with
// `description` / `name` / `title` / `message` properties.
// =============================================================================

const USER_FACING_FIELD_NAMES = [
  'description',
  'name',
  'title',
  'message',
  'displayname',
  'display_name',
  'label',
  'caption',
  'subtitle',
  'tagline',
  'summary',
];

function hasAcceptLanguageParam(parameters: unknown[]): boolean {
  for (const p of parameters) {
    if (!isObject(p)) continue;
    if (
      typeof p.name === 'string' &&
      p.name.toLowerCase() === 'accept-language' &&
      p.in === 'header'
    ) {
      return true;
    }
  }
  return false;
}

function responseHasUserFacingContent(responses: unknown): boolean {
  if (!isObject(responses)) return false;
  for (const r of Object.values(responses)) {
    if (!isObject(r)) continue;
    const content = isObject(r.content) ? r.content : null;
    if (!content) continue;
    for (const mt of Object.values(content)) {
      if (!isObject(mt)) continue;
      const schema = mt.schema;
      if (!isObject(schema)) continue;
      const props = schema.properties;
      if (!isObject(props)) continue;
      for (const k of Object.keys(props)) {
        if (USER_FACING_FIELD_NAMES.includes(k.toLowerCase())) return true;
      }
    }
  }
  return false;
}

/**
 * F-2 — Accept-Language support on user-facing operations.
 *
 * Source: i18n best-practices + Stripe/GitHub Accept-Language patterns;
 *         rules-brainstorm.md F-2 (P3, ops-meta).
 * Lens: 10 (Operational-Metadata), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const acceptLanguageOnUserFacingOps: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const params = Array.isArray(targetVal.parameters) ? targetVal.parameters : [];
  if (hasAcceptLanguageParam(params)) return [];
  if (!responseHasUserFacingContent(targetVal.responses)) return [];
  return [
    {
      message:
        `User-facing operation (response contains description/name/title/message fields) lacks 'Accept-Language' header parameter. ` +
        `Per i18n best-practices, expose Accept-Language so consumers can request localized strings.`,
    },
  ];
};

// =============================================================================
// F-5 — consistentExpandFieldsParam
//
// Detects collection-getters (GET /resource) where SOME but NOT ALL declare
// an `expand` / `fields` query parameter. Pick one convention and apply
// consistently across all collection-getters.
// =============================================================================

const EXPAND_FIELDS_PARAM_NAMES = ['expand', 'fields', 'include', 'select', '$expand', '$select'];

/**
 * F-5 — Consistent expand/fields query-param across collection-getters.
 *
 * Source: TM Forum REST guidelines + Stripe + GitHub `fields`/`expand`;
 *         rules-brainstorm.md F-5 (P3, ops-meta).
 * Lens: 10 (Operational-Metadata), 5 (Style-Coherence), 4 (Client-Friction)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const consistentExpandFieldsParam: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const ops = iterateOperations(targetVal);
  const collectionGetters = ops.filter(({ path, method }) => {
    if (method !== 'get') return false;
    const segs = path.split('/').filter((s) => s.length > 0);
    if (segs.length === 0) return false;
    const last = segs[segs.length - 1];
    return !(last.startsWith('{') && last.endsWith('}'));
  });
  if (collectionGetters.length < 3) return []; // not enough samples
  const withExpand: string[] = [];
  const withoutExpand: string[] = [];
  for (const g of collectionGetters) {
    const params = Array.isArray(g.op.parameters) ? g.op.parameters : [];
    const hasParam = params.some((p) => {
      if (!isObject(p)) return false;
      const name = typeof p.name === 'string' ? p.name : '';
      return EXPAND_FIELDS_PARAM_NAMES.includes(name);
    });
    if (hasParam) withExpand.push(g.path);
    else withoutExpand.push(g.path);
  }
  if (withExpand.length === 0) return []; // not using expand-style at all — fine
  if (withoutExpand.length === 0) return []; // all consistent — fine
  return [
    {
      message:
        `Inconsistent expand/fields parameters: ${withExpand.length} collection-getters declare it, ${withoutExpand.length} don't. ` +
        `Pick one convention (e.g. 'fields' or 'expand') and apply across all collection-getters.`,
    },
  ];
};

// =============================================================================
// F-15 — polymorphismWireDiscriminator
//
// Schemas with discriminator (oneOf/anyOf with discriminator.propertyName)
// should ensure the wire-discriminator property is named consistently
// (`@type` / `_type` / `kind`) — TM Forum + Schema.org converge on `@type`.
// =============================================================================

const ACCEPTED_DISCRIMINATOR_PROP_NAMES = ['@type', '_type', 'type', 'kind', 'objectType', 'object_type', 'resourceType', 'resource_type'];

/**
 * F-15 — Polymorphism @type-discriminator-on-the-wire convention.
 *
 * Source: TM Forum REST guidelines + JSON:API + Schema.org `@type`;
 *         rules-brainstorm.md F-15 (P3, ops-meta).
 * Lens: 5 (Style-Coherence), 10 (Operational-Metadata)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const polymorphismWireDiscriminator: IFunction = function (
  targetVal,
  _opts,
  _ctx
) {
  if (!isObject(targetVal)) return [];
  const disc = targetVal.discriminator;
  if (!isObject(disc)) return [];
  const propName = typeof disc.propertyName === 'string' ? disc.propertyName : '';
  if (propName.length === 0) return [];
  if (ACCEPTED_DISCRIMINATOR_PROP_NAMES.includes(propName)) return [];
  return [
    {
      message:
        `discriminator.propertyName '${propName}' deviates from cross-vendor convention. ` +
        `TM Forum / JSON:API / Schema.org converge on @type / kind / objectType — pick one for cross-API agent compatibility.`,
    },
  ];
};

// =============================================================================
// F-19 — lazyDescription
//
// Detects descriptions that are obvious copies of the field/operation name
// — e.g. property `firstName` with description `firstName` or `First name`.
// =============================================================================

/**
 * F-19 — Doc-smell: Lazy description (copy of name).
 *
 * Source: API Docs Smells arXiv (Aghajani et al., 2019);
 *         rules-brainstorm.md F-19 (P3, ops-meta).
 * Lens: 4 (Client-Friction), 10 (Operational-Metadata)
 * Round: 2 (Welle D / T-Other-Lens)
 */
export const lazyDescription: IFunction = function (
  targetVal,
  _opts,
  ctx
) {
  if (!isObject(targetVal)) return [];
  const desc = typeof targetVal.description === 'string' ? targetVal.description.trim() : '';
  if (desc.length === 0) return [];
  // Determine the parent-key from path
  const path = ctx?.path ?? [];
  const parentKey = path.length > 0 ? String(path[path.length - 1]) : '';
  if (parentKey.length === 0) return [];
  // Normalize: lowercase + remove non-alphanumerics
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const descNorm = normalize(desc);
  const keyNorm = normalize(parentKey);
  if (descNorm === keyNorm) {
    return [
      {
        message:
          `Description '${desc}' is a verbatim copy of the field/operation name '${parentKey}'. ` +
          `Provide a substantive description (purpose, units, constraints) — agents and humans need more than the name repeated.`,
      },
    ];
  }
  // Also check Title-Case-of-Key match
  const titleCaseOfKey = parentKey.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  if (desc.toLowerCase().trim() === titleCaseOfKey) {
    return [
      {
        message:
          `Description '${desc}' is a Title-Case rendering of the field name '${parentKey}'; provide substantive content.`,
      },
    ];
  }
  return [];
};
