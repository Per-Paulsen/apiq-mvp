/**
 * Custom Spectral functions for the P3 Evolution-Friction ruleset (T-EV / Welle D).
 *
 * Spectral's built-in functions cover the simple pattern-rules; these custom
 * callables handle multi-step / cross-resource validation that pure DSL can't
 * express.
 *
 * Rules backed by these functions (registered in spectral-runner.ts and the
 * evolution-p3-rules.test.ts harness):
 *
 *   - required-field-overdeclared-check: EV-2  — schema with >15 required fields
 *   - status-code-set-cardinality:        EV-15 — operation with >10 response codes
 *   - single-media-type-response:         EV-20 — response with single media-type
 *   - required-prop-needs-description:    EV-21 — required prop without description
 *   - ref-cycle-needs-max-depth:          EV-22 — schema in $ref-cycle without
 *                                                 x-max-depth marker
 *   - required-prop-single-value-enum:    EV-39 — single-value enum on prop
 *   - field-evolution-suffix:             EV-41 — field-name with _v1/_legacy/...
 *   - tags-internal-experimental:         EV-42 — internal/private/beta/experimental
 *   - no-components-schemas:              EV-44 — no top-level components.schemas
 *   - default-specific-status-overlap:    EV-45 — default + specific overlap
 *   - multipart-json-same-schema:         EV-47 — multipart + json same schema
 *   - magic-string-enum-candidate:        EV-51 — string-enum-affinity name
 *   - int-needs-string-encoding:          EV-52 — integer max > 2^53
 *   - version-param-no-enum:              EV-54 — version-param without enum
 *   - redirect-without-location:          EV-59 — 3xx without Location header
 *   - webhook-needs-prose:                EV-60 — webhook without prose
 *   - oneof-closed-prose-says-open:       EV-61 — oneOf closed + open prose
 *   - int64-string-encoding-candidate:    EV-62 — int64 without string-encoding
 *
 * Sources (file-level; see per-callable headers below for per-rule cite):
 *   - OASDIFF (https://github.com/oasdiff/oasdiff) — single-spec breaking-
 *     change detection ground-truth
 *   - RFC 9110 (HTTP Semantics, 2022) https://www.rfc-editor.org/rfc/rfc9110
 *   - Google AIPs (https://google.aip.dev/) — versioning + naming guidance
 *   - Stripe API (https://stripe.com/docs/api) — major-version-only URL
 *     convention + ID-as-string (>2^53 safety)
 *   - Zalando RESTful API Guidelines — opinion-divided patterns
 *   - JSON-Schema specification (https://json-schema.org/specification.html)
 *
 * Lens: 3 (Evolution-Friction), with cross-cuts on Lens-4 (Client-Friction)
 *        and Lens-5 (Standards-Compliance) per pattern.
 * Round: 2 (Welle D / T-EV)
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
// EV-2 — required-field-overdeclared-check
//
// Schema with `required` array > threshold (default 15) is fragile for
// future field-pruning. Heuristic; precision is intentionally low to avoid
// blanket complaints on legitimately-large object schemas.
// =============================================================================

/**
 * EV-2 — required-field-overdeclared-check.
 *
 * Source: OASDIFF inverted required-property-removed + Stripe schema-stability
 *         convention. rules-brainstorm.md EV-2 (P3, drift).
 */
export const requiredFieldOverdeclaredCheck: IFunction = function (
  targetVal,
  opts,
  context
) {
  const schema = getResolvedTarget<AnyObj>(targetVal);
  if (!schema) return [];
  const o = (opts ?? {}) as { threshold?: number };
  const threshold = typeof o.threshold === 'number' ? o.threshold : 15;
  const required = Array.isArray(schema.required) ? schema.required : null;
  if (!required) return [];
  if (required.length <= threshold) return [];
  return [
    {
      message: `Schema declares ${required.length} required fields (threshold ${threshold}); future field-pruning is breaking.`,
      path: [...context.path, 'required'],
    },
  ];
};

// =============================================================================
// EV-15 — status-code-set-cardinality
//
// Operation declares > threshold (default 10) distinct response status-codes.
// =============================================================================

/**
 * EV-15 — status-code-set-cardinality.
 *
 * Source: OASDIFF inverted excessive-response-set fragility.
 *         rules-brainstorm.md EV-15 (P3, loosen).
 */
export const statusCodeSetCardinality: IFunction = function (
  targetVal,
  opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const o = (opts ?? {}) as { threshold?: number };
  const threshold = typeof o.threshold === 'number' ? o.threshold : 10;
  const responses = isObject(op.responses) ? op.responses : null;
  if (!responses) return [];
  const codeCount = Object.keys(responses).length;
  if (codeCount <= threshold) return [];
  return [
    {
      message: `Operation declares ${codeCount} response status-codes (threshold ${threshold}); contract is over-broad.`,
      path: [...context.path, 'responses'],
    },
  ];
};

// =============================================================================
// EV-20 — single-media-type-response
//
// Response declares exactly one media-type. Heuristic: only flag responses
// with a `content`-block (i.e. successful 2xx with body); 204/304 do not
// have content and are exempt.
// =============================================================================

/**
 * EV-20 — single-media-type-response.
 *
 * Source: OASDIFF single-media-type fragility.
 *         rules-brainstorm.md EV-20 (P3, loosen).
 */
export const singleMediaTypeResponse: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const response = getResolvedTarget<AnyObj>(targetVal);
  if (!response) return [];
  const content = isObject(response.content) ? response.content : null;
  if (!content) return [];
  const mediaTypes = Object.keys(content);
  if (mediaTypes.length !== 1) return [];
  return [
    {
      message: `Response declares only one media-type (${mediaTypes[0]}); content-negotiation evolution is harder later.`,
      path: [...context.path, 'content'],
    },
  ];
};

// =============================================================================
// EV-21 — required-prop-needs-description
//
// Property is in the schema's `required` array but has no `description`.
// Walks up the path to find enclosing schema and check its `required`.
// =============================================================================

/**
 * EV-21 — required-prop-needs-description.
 *
 * Source: SG-2 style-guide + VTex openapi-schemas.
 *         rules-brainstorm.md EV-21 (P3, drift).
 */
export const requiredPropNeedsDescription: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const prop = getResolvedTarget<AnyObj>(targetVal);
  if (!prop) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 2) return [];
  const propName = String(cpath[cpath.length - 1]);
  // Walk up to enclosing schema (parent of `properties`).
  // Path looks like: ...,'<schema>','properties','<propName>'
  if (cpath[cpath.length - 2] !== 'properties') return [];
  // Look up enclosing schema in document
  const document = context.document?.data as AnyObj | undefined;
  if (!document) return [];
  // Walk to parent of properties
  let cursor: unknown = document;
  for (let i = 0; i < cpath.length - 2; i++) {
    if (!cursor || typeof cursor !== 'object') return [];
    cursor = (cursor as AnyObj)[cpath[i] as string];
  }
  if (!isObject(cursor)) return [];
  const required = Array.isArray(cursor.required) ? cursor.required : null;
  if (!required) return [];
  if (!required.includes(propName)) return [];
  // Check if property has a description
  if (typeof prop.description === 'string' && prop.description.trim().length > 0) {
    return [];
  }
  // If property is a $ref-pointer, we can't resolve here — skip.
  if ('$ref' in prop) return [];
  return [
    {
      message: `Required property \`${propName}\` lacks \`description\`; intent is under-documented.`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// EV-22 — ref-cycle-needs-max-depth
//
// Schema is part of a $ref-cycle but does not declare `x-max-depth` (or
// `maxDepth` / `x-maxDepth` extension). Cycle-detection: BFS from the schema
// through every $ref encountered in its property/items/oneOf/anyOf/allOf.
// =============================================================================

function collectRefs(node: unknown, refs: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const it of node) collectRefs(it, refs);
    return;
  }
  const obj = node as AnyObj;
  if (typeof obj.$ref === 'string') {
    refs.add(obj.$ref);
  }
  for (const v of Object.values(obj)) collectRefs(v, refs);
}

function refTargetName(ref: string): string | null {
  // Only handle #/components/schemas/<name> form
  const m = /^#\/components\/schemas\/([^\/]+)$/.exec(ref);
  return m ? m[1] : null;
}

/**
 * EV-22 — ref-cycle-needs-max-depth.
 *
 * Source: apiq A2 cycle-detector + JSON-Schema specification.
 *         rules-brainstorm.md EV-22 (P3, drift).
 */
export const refCycleNeedsMaxDepth: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const schema = getResolvedTarget<AnyObj>(targetVal);
  if (!schema) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 3) return [];
  if (cpath[0] !== 'components' || cpath[1] !== 'schemas') return [];
  const schemaName = String(cpath[2]);
  const document = context.document?.data as AnyObj | undefined;
  if (!document) return [];
  const componentsSchemas = (document.components as AnyObj | undefined)
    ?.schemas as AnyObj | undefined;
  if (!componentsSchemas) return [];

  // BFS from schemaName; if we ever come back to schemaName we have a cycle.
  const visited = new Set<string>();
  const queue: string[] = [schemaName];
  let inCycle = false;
  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = componentsSchemas[current];
    if (!isObject(node)) continue;
    const refs = new Set<string>();
    collectRefs(node, refs);
    for (const r of refs) {
      const target = refTargetName(r);
      if (!target) continue;
      if (target === schemaName) {
        inCycle = true;
        break;
      }
      if (!visited.has(target)) {
        visited.add(target);
        queue.push(target);
      }
    }
    if (inCycle) break;
  }
  if (!inCycle) return [];
  // Has a cycle — check for max-depth extension
  const hasMaxDepth =
    typeof schema['x-max-depth'] === 'number' ||
    typeof schema['x-maxDepth'] === 'number' ||
    typeof schema.maxDepth === 'number';
  if (hasMaxDepth) return [];
  return [
    {
      message: `Schema \`${schemaName}\` participates in a $ref-cycle but declares no \`x-max-depth\`; bound recursion-depth explicitly.`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// EV-39 — required-prop-single-value-enum
//
// Property has single-value enum AND is in required-list of enclosing schema.
// =============================================================================

/**
 * EV-39 — required-prop-single-value-enum.
 *
 * Source: JSON-Schema specification + OASDIFF enum-value-removed.
 *         rules-brainstorm.md EV-39 (P3, drift).
 */
export const requiredPropSingleValueEnum: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const prop = getResolvedTarget<AnyObj>(targetVal);
  if (!prop) return [];
  const enumArr = Array.isArray(prop.enum) ? prop.enum : null;
  if (!enumArr || enumArr.length !== 1) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 2) return [];
  // Walk up: must be a property in `properties` of an object-schema with
  // `required` array containing the propName.
  if (cpath[cpath.length - 2] !== 'properties') return [];
  const propName = String(cpath[cpath.length - 1]);
  const document = context.document?.data as AnyObj | undefined;
  if (!document) return [];
  let cursor: unknown = document;
  for (let i = 0; i < cpath.length - 2; i++) {
    if (!cursor || typeof cursor !== 'object') return [];
    cursor = (cursor as AnyObj)[cpath[i] as string];
  }
  if (!isObject(cursor)) return [];
  const required = Array.isArray(cursor.required) ? cursor.required : null;
  if (!required || !required.includes(propName)) return [];
  return [
    {
      message: `Required property \`${propName}\` has single-value enum (\`${JSON.stringify(enumArr[0])}\`); model as \`const\` or drop the field.`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// EV-41 — field-evolution-suffix
//
// Field-name carries _v1/_legacy/_old/_deprecated/_new/_v2 suffix.
// Fires on the `properties`-block; iterates property-keys.
// =============================================================================

const EVOLUTION_SUFFIX_RE = /(?:_(?:v\d+|legacy|old|new|deprecated|original|previous|current))$/i;

/**
 * EV-41 — field-evolution-suffix.
 *
 * Source: apiq prose-walker cross-spec field-name observation.
 *         rules-brainstorm.md EV-41 (P3, drift).
 */
export const fieldEvolutionSuffix: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const props = getResolvedTarget<AnyObj>(targetVal);
  if (!props) return [];
  const findings: IFunctionResult[] = [];
  for (const propName of Object.keys(props)) {
    if (EVOLUTION_SUFFIX_RE.test(propName)) {
      findings.push({
        message: `Field-name \`${propName}\` carries evolution-suffix; technical-debt accumulating.`,
        path: [...context.path, propName],
      });
    }
  }
  return findings;
};

// =============================================================================
// EV-42 — tags-internal-experimental
//
// Operation has tag `internal` / `private` / `beta` / `experimental`.
// =============================================================================

const INSTABILITY_TAG_RE = /^(internal|private|beta|experimental|alpha|preview|wip|draft)$/i;

/**
 * EV-42 — tags-internal-experimental.
 *
 * Source: Microsoft API Guidelines + Google AIPs.
 *         rules-brainstorm.md EV-42 (P3, drift).
 */
export const tagsInternalExperimental: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const tags = Array.isArray(op.tags) ? op.tags : null;
  if (!tags) return [];
  const matches: string[] = [];
  for (const t of tags) {
    if (typeof t === 'string' && INSTABILITY_TAG_RE.test(t)) {
      matches.push(t);
    }
  }
  if (matches.length === 0) return [];
  return [
    {
      message: `Operation tagged \`${matches.join(', ')}\` — contract not committed.`,
      path: [...context.path, 'tags'],
    },
  ];
};

// =============================================================================
// EV-44 — no-components-schemas
//
// Spec has no `components.schemas` declared (or it's empty).
// =============================================================================

/**
 * EV-44 — no-components-schemas.
 *
 * Source: apiq M6 schema-reuse-aggregation.
 *         rules-brainstorm.md EV-44 (P3, drift).
 */
export const noComponentsSchemas: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const doc = getResolvedTarget<AnyObj>(targetVal);
  if (!doc) return [];
  // Skip non-OAS3 specs (no openapi field)
  if (typeof doc.openapi !== 'string') return [];
  const components = isObject(doc.components) ? doc.components : null;
  const schemas = components && isObject(components.schemas) ? components.schemas : null;
  if (schemas && Object.keys(schemas).length > 0) return [];
  // Check if there are any paths to make this rule meaningful
  const paths = isObject(doc.paths) ? doc.paths : null;
  if (!paths || Object.keys(paths).length === 0) return [];
  return [
    {
      message:
        'Spec has no `components.schemas`; schema-reuse is impossible — codegen produces anonymous types.',
      path: [...context.path],
    },
  ];
};

// =============================================================================
// EV-45 — default-specific-status-overlap
//
// Operation declares both `default` AND specific status-code (or range like
// `4XX`/`5XX`). Standard `default` already covers the unmatched-codes; adding
// specific `4XX` is ambiguous (which one matches a 404?).
// =============================================================================

/**
 * EV-45 — default-specific-status-overlap.
 *
 * Source: OASDIFF response-default-overlap + OPTIC default-conflict.
 *         rules-brainstorm.md EV-45 (P3, drift).
 */
export const defaultSpecificStatusOverlap: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const responses = getResolvedTarget<AnyObj>(targetVal);
  if (!responses) return [];
  const keys = Object.keys(responses);
  const hasDefault = keys.includes('default');
  if (!hasDefault) return [];
  // Range-codes: 1XX/2XX/3XX/4XX/5XX
  const rangeKeys = keys.filter((k) => /^[1-5]XX$/i.test(k));
  if (rangeKeys.length > 0) {
    return [
      {
        message: `Responses declare both \`default\` and range-code(s) \`${rangeKeys.join(', ')}\` — semantics ambiguous.`,
        path: [...context.path],
      },
    ];
  }
  // Else, default + multiple specific 3-digit codes is allowed by OAS but
  // is still drift-prone if the codes are exhaustive (e.g. 200/400/401/404 +
  // default would render default unreachable). Detect: if specific codes
  // include both 4xx and 5xx ranges, default is redundant.
  const has4xx = keys.some((k) => /^4\d{2}$/.test(k));
  const has5xx = keys.some((k) => /^5\d{2}$/.test(k));
  if (has4xx && has5xx && keys.length > 3) {
    return [
      {
        message: `Responses declare \`default\` plus exhaustive 4xx+5xx codes; \`default\` is redundant.`,
        path: [...context.path, 'default'],
      },
    ];
  }
  return [];
};

// =============================================================================
// EV-47 — multipart-json-same-schema
//
// requestBody declares both `multipart/form-data` and `application/json` with
// the SAME schema (or both pointing to the same $ref).
// =============================================================================

function getSchemaRef(content: AnyObj | undefined, mediaType: string): string | null {
  if (!content) return null;
  const mt = isObject(content[mediaType]) ? (content[mediaType] as AnyObj) : null;
  if (!mt) return null;
  const sch = isObject(mt.schema) ? (mt.schema as AnyObj) : null;
  if (!sch) return null;
  if (typeof sch.$ref === 'string') return sch.$ref;
  // For inline schemas, return a JSON-stable signature
  try {
    return JSON.stringify(sch);
  } catch {
    return null;
  }
}

/**
 * EV-47 — multipart-json-same-schema.
 *
 * Source: Azure API Style Guide + OPTIC content-shape-divergence.
 *         rules-brainstorm.md EV-47 (P3, drift).
 */
export const multipartJsonSameSchema: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const rb = getResolvedTarget<AnyObj>(targetVal);
  if (!rb) return [];
  const content = isObject(rb.content) ? rb.content : null;
  if (!content) return [];
  const multipart = getSchemaRef(content, 'multipart/form-data');
  const json = getSchemaRef(content, 'application/json');
  if (!multipart || !json) return [];
  if (multipart !== json) return [];
  return [
    {
      message: `Request declares multipart and json with same schema — encodings need divergent shapes (multipart needs binary-property modelling).`,
      path: [...context.path, 'content'],
    },
  ];
};

// =============================================================================
// EV-51 — magic-string-enum-candidate
//
// Property name suggests enum-affinity (status/type/kind/category/level/
// priority/state/role/severity) AND is type:string AND has no enum/pattern/
// format constraint. Heuristic — precision intentionally low.
// =============================================================================

const ENUM_AFFINITY_NAMES = new Set([
  'status', 'state', 'type', 'kind', 'category', 'level', 'priority',
  'role', 'severity', 'tier', 'mode', 'phase', 'stage', 'visibility',
  'gender', 'sentiment', 'direction', 'order',
]);

/**
 * EV-51 — magic-string-enum-candidate.
 *
 * Source: LL-13 LLM-friendly-API + apiq M13 string-domain-restriction.
 *         rules-brainstorm.md EV-51 (P3, loosen).
 */
export const magicStringEnumCandidate: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const props = getResolvedTarget<AnyObj>(targetVal);
  if (!props) return [];
  const findings: IFunctionResult[] = [];
  for (const [propName, propUnknown] of Object.entries(props)) {
    if (!ENUM_AFFINITY_NAMES.has(propName.toLowerCase())) continue;
    const prop = isObject(propUnknown) ? propUnknown : null;
    if (!prop) continue;
    if (prop.type !== 'string') continue;
    if (Array.isArray(prop.enum)) continue;
    if (typeof prop.pattern === 'string') continue;
    if (typeof prop.format === 'string') continue;
    if (typeof prop.const !== 'undefined') continue;
    findings.push({
      message: `Property \`${propName}\` has enum-affinity name but no \`enum\` constraint — drift-prone.`,
      path: [...context.path, propName],
    });
  }
  return findings;
};

// =============================================================================
// EV-52 — int-needs-string-encoding
//
// Schema declares `type: integer` + `maximum > 2^53`. JS-precision-loss risk.
// =============================================================================

const JS_MAX_SAFE_INTEGER = 9007199254740992; // 2^53

/**
 * EV-52 — int-needs-string-encoding.
 *
 * Source: SG-24 + Google AIPs + Zalando #168 + Stripe ID-as-string.
 *         rules-brainstorm.md EV-52 (P3, drift).
 */
export const intNeedsStringEncoding: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const schema = getResolvedTarget<AnyObj>(targetVal);
  if (!schema) return [];
  if (schema.type !== 'integer') return [];
  if (typeof schema.maximum !== 'number') return [];
  if (schema.maximum <= JS_MAX_SAFE_INTEGER) return [];
  return [
    {
      message: `Integer maximum (${schema.maximum}) exceeds 2^53 — JS clients lose precision; use \`type: string\` + \`format: int64\`.`,
      path: [...context.path, 'maximum'],
    },
  ];
};

// =============================================================================
// EV-54 — version-param-no-enum
//
// Parameter named version/api-version/apiVersion (path/query/header) without
// `enum` constraint on schema.
// =============================================================================

const VERSION_PARAM_NAME_RE = /^(api[-_]?version|version|v)$/i;

/**
 * EV-54 — version-param-no-enum.
 *
 * Source: apiq existing version-axis-detector.
 *         rules-brainstorm.md EV-54 (P3, loosen).
 */
export const versionParamNoEnum: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const param = getResolvedTarget<AnyObj>(targetVal);
  if (!param) return [];
  const name = typeof param.name === 'string' ? param.name : '';
  if (!VERSION_PARAM_NAME_RE.test(name)) return [];
  // Look at param.schema.enum for OAS 3.x form
  const schema = isObject(param.schema) ? (param.schema as AnyObj) : null;
  if (schema && Array.isArray(schema.enum)) return [];
  // Also check direct enum (OAS 2 / inline)
  if (Array.isArray((param as AnyObj).enum)) return [];
  return [
    {
      message: `Version parameter \`${name}\` has no \`enum\` constraint — tightening later is breaking.`,
      path: [...context.path],
    },
  ];
};

// =============================================================================
// EV-59 — redirect-without-location
//
// Operation declares 301/302/307/308 response without `Location` header.
// =============================================================================

const REDIRECT_STATUS_CODES = new Set(['301', '302', '303', '307', '308']);

/**
 * EV-59 — redirect-without-location.
 *
 * Source: SP-G-SPS-15 inverse + RFC 9110 §15.4.
 *         rules-brainstorm.md EV-59 (P3, drift).
 */
export const redirectWithoutLocation: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const responses = getResolvedTarget<AnyObj>(targetVal);
  if (!responses) return [];
  const findings: IFunctionResult[] = [];
  for (const [code, respUnknown] of Object.entries(responses)) {
    if (!REDIRECT_STATUS_CODES.has(code)) continue;
    const resp = isObject(respUnknown) ? respUnknown : null;
    if (!resp) continue;
    const headers = isObject(resp.headers) ? resp.headers : {};
    const headerKeys = Object.keys(headers).map((h) => h.toLowerCase());
    if (headerKeys.includes('location')) continue;
    findings.push({
      message: `Response \`${code}\` declares no \`Location\` header (RFC 9110 §15.4).`,
      path: [...context.path, code],
    });
  }
  return findings;
};

// =============================================================================
// EV-60 — webhook-needs-prose
//
// Webhook operation lacks summary AND description.
// =============================================================================

/**
 * EV-60 — webhook-needs-prose.
 *
 * Source: SP-G-SPS-21 + apiq U1/U2 operation-prose-completeness.
 *         rules-brainstorm.md EV-60 (P3, drift).
 */
export const webhookNeedsProse: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const op = getResolvedTarget<AnyObj>(targetVal);
  if (!op) return [];
  const cpath = context.path;
  if (!cpath || cpath.length < 1) return [];
  // path[0] should be 'webhooks' to confirm we're in the right place
  if (cpath[0] !== 'webhooks') return [];
  const summary = typeof op.summary === 'string' ? op.summary.trim() : '';
  const description = typeof op.description === 'string' ? op.description.trim() : '';
  if (summary.length > 0 || description.length > 0) return [];
  return [
    {
      message: `Webhook operation lacks \`summary\` and \`description\`; subscriber-facing prose is mandatory.`,
      path: [...cpath],
    },
  ];
};

// =============================================================================
// EV-61 — oneof-closed-prose-says-open
//
// Schema has `oneOf` (closed variant-set) + description prose contains
// "more variants", "future extensions", "additional types", "will be added",
// "may grow", "expanded later", etc. Semantic mismatch.
// =============================================================================

const OPEN_SET_PROSE_RE =
  /\b(more (?:variants|types|values|members|cases) (?:will|can|may) (?:be (?:added|expanded)|grow)|additional (?:variants|types|members) (?:will|can|may)|future (?:extensions?|variants?|additions?|releases? will (?:add|introduce))|(?:will|may) (?:be )?(?:expanded|grown|extended)|extensible (?:set|union|list)|new (?:variants|types|values) (?:will|may))\b/i;

/**
 * EV-61 — oneof-closed-prose-says-open.
 *
 * Source: apiq prose-walker contradiction-detection.
 *         rules-brainstorm.md EV-61 (P3, loosen).
 */
export const oneofClosedProseSaysOpen: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const schema = getResolvedTarget<AnyObj>(targetVal);
  if (!schema) return [];
  if (!Array.isArray(schema.oneOf)) return [];
  const description = typeof schema.description === 'string' ? schema.description : '';
  if (description.length === 0) return [];
  if (!OPEN_SET_PROSE_RE.test(description)) return [];
  return [
    {
      message: `Schema declares closed \`oneOf\` but description claims set will grow — semantic mismatch.`,
      path: [...context.path, 'description'],
    },
  ];
};

// =============================================================================
// EV-62 — int64-string-encoding-candidate
//
// Property declares `type: integer` + `format: int64`. JS-safe interop
// recommendation: use `type: string` + `format: int64` instead.
// =============================================================================

/**
 * EV-62 — int64-string-encoding-candidate.
 *
 * Source: SG-24 + Stripe ID-as-string + Google AIPs.
 *         rules-brainstorm.md EV-62 (P3, drift).
 */
export const int64StringEncodingCandidate: IFunction = function (
  targetVal,
  _opts,
  context
) {
  const schema = getResolvedTarget<AnyObj>(targetVal);
  if (!schema) return [];
  if (schema.type !== 'integer') return [];
  if (schema.format !== 'int64') return [];
  return [
    {
      message: `\`type: integer\` + \`format: int64\` risks JS-precision-loss; consider \`type: string\` + \`format: int64\`.`,
      path: [...context.path],
    },
  ];
};

// =============================================================================
// Welle Arch+ A3 — FUNCTION_METADATA registry for evolution-p3 callables.
// =============================================================================

import type { FunctionMetadata } from './_metadata.js';

export const FUNCTION_METADATA: Record<string, FunctionMetadata> = {
  'required-field-overdeclared-check': {
    name: 'required-field-overdeclared-check',
    patternIds: ['EV-2'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'Schema with required[] above threshold (default 15) — future field-pruning is breaking.',
  },
  'status-code-set-cardinality': {
    name: 'status-code-set-cardinality',
    patternIds: ['EV-15'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'Operation declares >threshold (default 10) distinct response status-codes — contract is over-broad.',
  },
  'single-media-type-response': {
    name: 'single-media-type-response',
    patternIds: ['EV-20'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'Response declares only one media-type — content-negotiation evolution is harder later.',
  },
  'required-prop-needs-description': {
    name: 'required-prop-needs-description',
    patternIds: ['EV-21'],
    lens: 'evolution-friction',
    perfClass: 'O(n)',
    description:
      'Property in required[] lacks description — intent is under-documented; required without prose accumulates drift.',
  },
  'ref-cycle-needs-max-depth': {
    name: 'ref-cycle-needs-max-depth',
    patternIds: ['EV-22'],
    lens: 'evolution-friction',
    perfClass: 'O(n*m)',
    description:
      'Schema participates in a $ref-cycle but declares no x-max-depth — bound recursion-depth explicitly.',
  },
  'required-prop-single-value-enum': {
    name: 'required-prop-single-value-enum',
    patternIds: ['EV-39'],
    lens: 'evolution-friction',
    perfClass: 'O(n)',
    description:
      'Required property has single-value enum — model as `const` or drop the field.',
  },
  'field-evolution-suffix': {
    name: 'field-evolution-suffix',
    patternIds: ['EV-41'],
    lens: 'evolution-friction',
    perfClass: 'O(n)',
    description:
      'Field-name carries _v1/_legacy/_old/_deprecated/_new suffix — technical-debt accumulating.',
  },
  'tags-internal-experimental': {
    name: 'tags-internal-experimental',
    patternIds: ['EV-42'],
    lens: 'evolution-friction',
    perfClass: 'O(n)',
    description:
      'Operation tagged internal/private/beta/experimental/alpha/preview — contract not committed.',
  },
  'no-components-schemas': {
    name: 'no-components-schemas',
    patternIds: ['EV-44'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'Spec has no components.schemas — schema-reuse impossible; codegen produces anonymous types.',
  },
  'default-specific-status-overlap': {
    name: 'default-specific-status-overlap',
    patternIds: ['EV-45'],
    lens: 'evolution-friction',
    perfClass: 'O(n)',
    description:
      'Responses declare both `default` and range-codes (4XX/5XX) or exhaustive 4xx+5xx — semantics ambiguous / default redundant.',
  },
  'multipart-json-same-schema': {
    name: 'multipart-json-same-schema',
    patternIds: ['EV-47'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'Request declares both multipart/form-data and application/json with same schema — encodings need divergent shapes.',
  },
  'magic-string-enum-candidate': {
    name: 'magic-string-enum-candidate',
    patternIds: ['EV-51'],
    lens: 'evolution-friction',
    perfClass: 'O(n)',
    description:
      'Property has enum-affinity name (status/type/category/role/...) but no enum constraint — drift-prone.',
  },
  'int-needs-string-encoding': {
    name: 'int-needs-string-encoding',
    patternIds: ['EV-52'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'Integer maximum exceeds 2^53 — JS clients lose precision; use type:string + format:int64.',
  },
  'version-param-no-enum': {
    name: 'version-param-no-enum',
    patternIds: ['EV-54'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'Version parameter (api-version/version/v) has no enum constraint — tightening later is breaking.',
  },
  'redirect-without-location': {
    name: 'redirect-without-location',
    patternIds: ['EV-59'],
    lens: 'evolution-friction',
    perfClass: 'O(n)',
    description:
      'Redirect response (301/302/303/307/308) declares no Location header (RFC 9110 §15.4).',
  },
  'webhook-needs-prose': {
    name: 'webhook-needs-prose',
    patternIds: ['EV-60'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'Webhook operation lacks both summary and description — subscriber-facing prose is mandatory.',
  },
  'oneof-closed-prose-says-open': {
    name: 'oneof-closed-prose-says-open',
    patternIds: ['EV-61'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'Schema declares closed oneOf but description claims set will grow ("more variants", "future extensions") — semantic mismatch.',
  },
  'int64-string-encoding-candidate': {
    name: 'int64-string-encoding-candidate',
    patternIds: ['EV-62'],
    lens: 'evolution-friction',
    perfClass: 'O(1)',
    description:
      'type:integer + format:int64 risks JS-precision-loss; consider type:string + format:int64 (Stripe ID-as-string).',
  },
};
