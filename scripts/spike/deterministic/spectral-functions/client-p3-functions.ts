/**
 * Custom Spectral functions for the P3 Client-Friction ruleset (T18c, Welle D).
 *
 * Spectral built-in functions cover most P3 rules; the patterns below need
 * additional logic (multi-language awareness, cross-operation analysis, or
 * cross-spec aggregation):
 *
 *   - camelizeCollideSchemaProperty (CL-3):    Two camelize-distinct property/schema
 *                                              names that collide after camel-case
 *                                              normalization (e.g. `user_id` and
 *                                              `userId` produce the same SDK property).
 *   - requiredAsymmetryRequestResponse (CL-8): A schema field declared `required`
 *                                              in a response but not in the request
 *                                              of the same operation — usually a
 *                                              spec-author oversight.
 *   - int64NeedsStringAlternative (CL-16):     `format: int64` without a string
 *                                              companion (Stripe pattern: provide
 *                                              both for JS clients that lose
 *                                              precision past 2^53).
 *   - emptyBody2xx4xxDiscriminator (CL-19):    2xx and 4xx responses both empty-bodied
 *                                              without a discriminating header — SDKs
 *                                              cannot distinguish.
 *   - responseRefInconsistency (CL-27):        Same logical response (404 / 401 / 500)
 *                                              referenced inconsistently across operations
 *                                              (some inline, some `$ref`). Cross-op.
 *   - nestedCompositionDepth (CL-30):          Deeply-nested allOf/oneOf/anyOf chains
 *                                              (≥3 hops) — codegen produces synthetic
 *                                              intermediate types.
 *   - fieldNameLengthBalance (CL-44):          Field names that are excessively verbose
 *                                              (>30 chars) OR cryptic (≤2 chars except
 *                                              allowlist). Per Lens-4 + Speakeasy.
 *   - crudShapeConsistency (CL-47):            POST/PUT/PATCH on a resource should return
 *                                              the same shape as GET on that resource.
 *                                              Cross-op.
 *   - paramsOrderRequiredFirst (CL-51):        Required parameters should precede optional
 *                                              ones in the parameters array — codegen
 *                                              produces ergonomic SDK signatures.
 *   - totalRequiredInputsExceeds (CL-53):      Operation has >5 total required inputs
 *                                              (parameters + requestBody.required) —
 *                                              hard for clients and agents to construct
 *                                              valid calls.
 *   - vendorExtensionPrefixConsistency (CL-61): `x-foo-*` extensions used inconsistently
 *                                              (some `x-stripe-*`, some `x-stripe_*`,
 *                                              some `x-Stripe-*`). Cross-spec.
 *   - tagCasingCrossSpecConsistency (CL-75):    Tag names use mixed casing across
 *                                              operations (`Users` vs `users` vs
 *                                              `user_management`). Cross-spec sentinel.
 *   - readOnlyRequiredConflict (CL-80):        Property is both `readOnly: true` AND
 *                                              listed in parent's `required` — clients
 *                                              cannot satisfy on POST/PUT input but
 *                                              spec demands it.
 *
 * Sources (file-level, per-callable headers below cite verbatim):
 *   - openapi-generator multi-issue
 *   - openapi-typescript / openapi-python-client SDK reports
 *   - oapi-codegen + Speakeasy SDK guidance
 *   - Stripe public-API style + AIP guidelines (mixed-int64, CRUD-shape)
 *   - rules-brainstorm.md CL-3, CL-8, CL-16, CL-19, CL-27, CL-30, CL-44,
 *     CL-47, CL-51, CL-53, CL-61, CL-75, CL-80 (P3)
 *
 * Lens: 4 (Client-Friction). All P3 — defense-in-depth/nice-to-have severity.
 * Round: 2/3 (Welle D / T18c).
 */

import type { IFunction, IFunctionResult } from '@stoplight/spectral-core';

type AnyObj = Record<string, unknown>;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function camelize(s: string): string {
  return s
    .replace(/[_\-\s]+([A-Za-z0-9])/g, (_m, c) => String(c).toUpperCase())
    .replace(/^([A-Z])/, (m) => m.toLowerCase());
}

// =============================================================================
// CL-3 — camelizeCollideSchemaProperty
//
// Property names that camelize to the same identifier (e.g. `user_id` and
// `userId`) cause SDK collision: codegen renames one or fails. Detection
// at the schema-level: scan all property-names of a schema; group by
// camelize() output; emit when group size >1.
// =============================================================================

/**
 * CL-3 — Camelize-collide property/schema-name.
 *
 * Source: openapi-generator #17909 (camelize-collision report);
 *         rules-brainstorm.md CL-3 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const camelizeCollideSchemaProperty: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!isObject(targetVal)) return [];
  const props = isObject(targetVal.properties) ? targetVal.properties : null;
  if (!props) return [];
  const names = Object.keys(props);
  if (names.length < 2) return [];
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const key = camelize(n);
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }
  const findings: IFunctionResult[] = [];
  for (const [normalized, originals] of groups) {
    if (originals.length < 2) continue;
    findings.push({
      message:
        `Property names ${originals.map((s) => `\`${s}\``).join(', ')} all camelize to \`${normalized}\` — ` +
        `SDK codegen will rename or collide. Pick one canonical naming convention per schema.`,
    });
  }
  return findings;
};

// =============================================================================
// CL-8 — requiredAsymmetryRequestResponse
//
// Pattern: a property field is `required` in the response-schema of an
// operation but NOT in the request-schema (or vice-versa). Usually an
// authoring-oversight — codegen produces 3-state semantics or runtime
// nulls.
//
// Heuristic since cross-op resolution requires the operation-classifier
// walker (cross-spec). At the rule layer we operate on the spec-root and
// inspect each operation's requestBody + responses[2xx] independently.
// =============================================================================

interface PathsMap {
  [path: string]: AnyObj;
}

/**
 * CL-8 — Property required-in-response not-in-request asymmetry.
 *
 * Source: Speakeasy + openapi-gen #20213;
 *         rules-brainstorm.md CL-8 (P3).
 * Lens: 4 (Client-Friction), 3 (Evolution-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const requiredAsymmetryRequestResponse: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!isObject(targetVal)) return [];
  const paths = isObject(targetVal.paths) ? (targetVal.paths as PathsMap) : null;
  if (!paths) return [];
  const findings: IFunctionResult[] = [];

  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

  function getInlineSchema(holder: unknown): AnyObj | null {
    if (!isObject(holder)) return null;
    const content = isObject(holder.content) ? holder.content : null;
    if (!content) return null;
    for (const [, mediaTypeObj] of Object.entries(content)) {
      if (isObject(mediaTypeObj) && isObject(mediaTypeObj.schema)) {
        return mediaTypeObj.schema;
      }
    }
    return null;
  }

  function requiredSet(schema: AnyObj | null): Set<string> {
    if (!schema) return new Set();
    if (Array.isArray(schema.required)) {
      return new Set(
        schema.required.filter((s): s is string => typeof s === 'string')
      );
    }
    return new Set();
  }

  function propertyKeys(schema: AnyObj | null): Set<string> {
    if (!schema || !isObject(schema.properties)) return new Set();
    return new Set(Object.keys(schema.properties));
  }

  for (const [pathStr, pathObj] of Object.entries(paths)) {
    if (!isObject(pathObj)) continue;
    for (const m of HTTP_METHODS) {
      const op = pathObj[m];
      if (!isObject(op)) continue;
      const reqSchema = getInlineSchema(op.requestBody);
      const responses = isObject(op.responses) ? op.responses : null;
      if (!responses) continue;

      // Inspect 2xx response only.
      let respSchema: AnyObj | null = null;
      for (const [code, resp] of Object.entries(responses)) {
        if (!/^2\d\d$/.test(code)) continue;
        respSchema = getInlineSchema(resp);
        if (respSchema) break;
      }
      if (!reqSchema || !respSchema) continue;

      const reqRequired = requiredSet(reqSchema);
      const respRequired = requiredSet(respSchema);
      const reqProps = propertyKeys(reqSchema);
      const respProps = propertyKeys(respSchema);

      // Asymmetry: present in BOTH schemas but required in only one.
      const intersection = [...reqProps].filter((p) => respProps.has(p));
      const asymmetric: string[] = [];
      for (const prop of intersection) {
        const inReqReq = reqRequired.has(prop);
        const inRespReq = respRequired.has(prop);
        if (inReqReq !== inRespReq) asymmetric.push(prop);
      }
      if (asymmetric.length > 0) {
        findings.push({
          message:
            `Operation ${m.toUpperCase()} ${pathStr}: properties ${asymmetric
              .map((s) => `\`${s}\``)
              .join(', ')} have asymmetric required-state ` +
            `between request and response. SDK clients see 3-state semantics.`,
        });
      }
    }
  }
  return findings;
};

// =============================================================================
// CL-16 — int64NeedsStringAlternative
//
// `format: int64` overflows JavaScript Number (loses precision past 2^53).
// Stripe-style mitigation: declare both a numeric and a string form. We
// emit when an int64 is declared without a sibling-property OR oneOf/anyOf
// branch carrying `type: string`.
// =============================================================================

/**
 * CL-16 — int64 declared without string-alternative.
 *
 * Source: OAI + Speakeasy + Stripe (https://stripe.com/docs/api);
 *         rules-brainstorm.md CL-16 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const int64NeedsStringAlternative: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!isObject(targetVal)) return [];
  const formatVal = targetVal.format;
  const typeVal = targetVal.type;
  if (formatVal !== 'int64' || (typeVal !== 'integer' && typeVal !== 'number')) {
    return [];
  }
  // Self contains a string-alternative? Check oneOf/anyOf siblings on the same
  // schema-node.
  const oneOf = Array.isArray(targetVal.oneOf) ? targetVal.oneOf : null;
  const anyOf = Array.isArray(targetVal.anyOf) ? targetVal.anyOf : null;
  const branches = [...(oneOf ?? []), ...(anyOf ?? [])];
  for (const b of branches) {
    if (isObject(b) && b.type === 'string') return [];
  }
  return [
    {
      message:
        `Schema declares \`format: int64\` without a string-alternative; JavaScript Number loses precision past 2^53. ` +
        `Provide a sibling string form (e.g. via \`oneOf: [{type: integer, format: int64}, {type: string}]\`) — Stripe-style.`,
    },
  ];
};

// =============================================================================
// CL-19 — emptyBody2xx4xxDiscriminator
//
// Operation has empty-body 2xx AND empty-body 4xx without a status-code-
// distinguishing header. SDK consumer needs the HTTP status to discriminate
// success vs. error — agents cannot. Recommend at least one body-property
// or distinguishing header.
//
// Operates on spec-root (cross-op view). Visits each operation's responses
// and checks for both empty 2xx + empty 4xx.
// =============================================================================

/**
 * CL-19 — Empty-body 2xx + 4xx without discriminating header.
 *
 * Source: openapi-typescript guidance;
 *         rules-brainstorm.md CL-19 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const emptyBody2xx4xxDiscriminator: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!isObject(targetVal)) return [];
  const paths = isObject(targetVal.paths) ? (targetVal.paths as PathsMap) : null;
  if (!paths) return [];
  const findings: IFunctionResult[] = [];

  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

  function isEmptyResponse(resp: unknown): boolean {
    if (!isObject(resp)) return true;
    if (!isObject(resp.content)) return true;
    return Object.keys(resp.content).length === 0;
  }

  for (const [pathStr, pathObj] of Object.entries(paths)) {
    if (!isObject(pathObj)) continue;
    for (const m of HTTP_METHODS) {
      const op = pathObj[m];
      if (!isObject(op)) continue;
      const responses = isObject(op.responses) ? op.responses : null;
      if (!responses) continue;
      let has2xxEmpty = false;
      let has4xxEmpty = false;
      for (const [code, resp] of Object.entries(responses)) {
        if (/^2\d\d$/.test(code) && isEmptyResponse(resp)) has2xxEmpty = true;
        if (/^4\d\d$/.test(code) && isEmptyResponse(resp)) has4xxEmpty = true;
      }
      if (has2xxEmpty && has4xxEmpty) {
        findings.push({
          message:
            `Operation ${m.toUpperCase()} ${pathStr} has both empty-bodied 2xx and 4xx responses without distinguishing data; ` +
            `SDK consumers cannot discriminate success/error from body alone.`,
        });
      }
    }
  }
  return findings;
};

// =============================================================================
// CL-27 — responseRefInconsistency
//
// Same logical response (404 / 401 / 500) appears multiple times across
// operations with mixed `$ref` and inline forms. Should be consolidated
// to one component-response and `$ref`'d. Heuristic: count, per status-code,
// how many operations use `$ref: '#/components/responses/...'` vs inline
// `description+content`. If both forms appear ≥1, emit.
// =============================================================================

/**
 * CL-27 — components.responses inconsistent $ref usage.
 *
 * Source: openapi-typescript #408;
 *         rules-brainstorm.md CL-27 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const responseRefInconsistency: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!isObject(targetVal)) return [];
  const paths = isObject(targetVal.paths) ? (targetVal.paths as PathsMap) : null;
  if (!paths) return [];

  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
  // status-code → { refCount, inlineCount }
  const counts = new Map<string, { ref: number; inline: number }>();

  for (const [, pathObj] of Object.entries(paths)) {
    if (!isObject(pathObj)) continue;
    for (const m of HTTP_METHODS) {
      const op = pathObj[m];
      if (!isObject(op)) continue;
      const responses = isObject(op.responses) ? op.responses : null;
      if (!responses) continue;
      for (const [code, resp] of Object.entries(responses)) {
        if (!isObject(resp)) continue;
        const cur = counts.get(code) ?? { ref: 0, inline: 0 };
        if (typeof resp.$ref === 'string') cur.ref++;
        else cur.inline++;
        counts.set(code, cur);
      }
    }
  }

  const findings: IFunctionResult[] = [];
  for (const [code, c] of counts) {
    if (c.ref > 0 && c.inline > 0) {
      findings.push({
        message:
          `Status-code ${code} appears ${c.ref} times via \`$ref\` and ${c.inline} times inline — ` +
          `inconsistent codegen output. Consolidate to one component-response and \`$ref\` everywhere.`,
      });
    }
  }
  return findings;
};

// =============================================================================
// CL-30 — nestedCompositionDepth
//
// Walks allOf/oneOf/anyOf chains and counts the maximum hop-depth. A "hop"
// is one composition keyword nested inside another (`allOf: [{ oneOf: [...] }]`
// = depth 2). Default threshold: 3 hops.
// =============================================================================

export interface NestedCompositionDepthOptions {
  maxDepth?: number;
}

function maxCompositionHopDepth(schema: unknown, currentHops: number): number {
  if (!isObject(schema)) return currentHops;
  let deepest = currentHops;
  for (const k of ['allOf', 'oneOf', 'anyOf'] as const) {
    const arr = schema[k];
    if (Array.isArray(arr) && arr.length > 0) {
      for (const sub of arr) {
        const d = maxCompositionHopDepth(sub, currentHops + 1);
        if (d > deepest) deepest = d;
      }
    }
  }
  // Walk through properties + items to catch composition embedded deeper.
  if (isObject(schema.properties)) {
    for (const v of Object.values(schema.properties)) {
      const d = maxCompositionHopDepth(v, currentHops);
      if (d > deepest) deepest = d;
    }
  }
  if (isObject(schema.items)) {
    const d = maxCompositionHopDepth(schema.items, currentHops);
    if (d > deepest) deepest = d;
  }
  return deepest;
}

/**
 * CL-30 — Deeply-nested allOf/oneOf chains (>3 hops).
 *
 * Source: swagger-ui #7437 (deeply-nested chains crash renderer);
 *         rules-brainstorm.md CL-30 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const nestedCompositionDepth: IFunction = function (
  targetVal,
  opts,
  _context
) {
  const optsTyped = opts as NestedCompositionDepthOptions | undefined;
  const maxDepth =
    typeof optsTyped?.maxDepth === 'number' ? optsTyped.maxDepth : 3;
  if (!isObject(targetVal)) return [];
  const depth = maxCompositionHopDepth(targetVal, 0);
  if (depth <= maxDepth) return [];
  return [
    {
      message:
        `Schema has allOf/oneOf/anyOf composition-depth ${depth} (limit ${maxDepth}); ` +
        `swagger-ui and codegen both render deeply-nested chains poorly. Flatten via named components.`,
    },
  ];
};

// =============================================================================
// CL-44 — fieldNameLengthBalance
//
// Per Speakeasy + Lens-4 guidance: field names should be 3..30 chars. Below
// 3 = cryptic ("u", "ix"); above 30 = verbose
// ("usersOrganizationalGroupMembershipDetails"). Both produce poor SDK
// developer experience.
// =============================================================================

const FIELD_NAME_ALLOWLIST: ReadonlySet<string> = new Set([
  'id',
  'ip',
  'ts',
  'fk',
  'ok',
  'os',
  'cc',
  'pk',
  'sk',
  // Common 1-char convention abbreviations
  'a',
  'b',
  'c',
  'd',
  'e',
  'i',
  'j',
  'k',
  'n',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'x',
  'y',
  'z',
]);

/**
 * CL-44 — Verbose vs cryptic field-names.
 *
 * Source: Speakeasy + Lens-4 (https://www.speakeasy.com/openapi);
 *         rules-brainstorm.md CL-44 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const fieldNameLengthBalance: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (typeof targetVal !== 'string' || targetVal.length === 0) return [];
  const len = targetVal.length;
  const lc = targetVal.toLowerCase();
  if (len > 30) {
    return [
      {
        message:
          `Field name \`${targetVal}\` is ${len} chars — verbose names are unwieldy in SDK call-sites. ` +
          `Aim for ≤30 chars or split into nested object.`,
      },
    ];
  }
  if (len <= 2 && !FIELD_NAME_ALLOWLIST.has(lc)) {
    return [
      {
        message:
          `Field name \`${targetVal}\` is ${len} chars — cryptic names obscure SDK ergonomics. ` +
          `Use full descriptive names.`,
      },
    ];
  }
  return [];
};

// =============================================================================
// CL-47 — crudShapeConsistency
//
// Stripe-style: GET /resources/{id} returns a Resource. POST /resources should
// return a Resource (not e.g. {id, status} only). Detection heuristic: for a
// path with both GET and POST/PUT/PATCH, compare 2xx response schema's $ref
// (or property keys if inline). If different, emit.
// =============================================================================

/**
 * CL-47 — POST/PUT/PATCH return-shape ≠ GET-shape.
 *
 * Source: MIN-35 IBM + Lens-4 (Stripe consensus);
 *         rules-brainstorm.md CL-47 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const crudShapeConsistency: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!isObject(targetVal)) return [];
  const paths = isObject(targetVal.paths) ? (targetVal.paths as PathsMap) : null;
  if (!paths) return [];

  const findings: IFunctionResult[] = [];

  function shapeOf(op: unknown): string | null {
    if (!isObject(op)) return null;
    const responses = isObject(op.responses) ? op.responses : null;
    if (!responses) return null;
    for (const [code, resp] of Object.entries(responses)) {
      if (!/^2\d\d$/.test(code)) continue;
      if (!isObject(resp) || !isObject(resp.content)) continue;
      for (const [, mt] of Object.entries(resp.content)) {
        if (isObject(mt) && isObject(mt.schema)) {
          if (typeof mt.schema.$ref === 'string') return mt.schema.$ref;
          if (isObject(mt.schema.properties)) {
            return Object.keys(mt.schema.properties).sort().join('|');
          }
          if (typeof mt.schema.type === 'string') return `__type:${mt.schema.type}`;
        }
      }
    }
    return null;
  }

  for (const [pathStr, pathObj] of Object.entries(paths)) {
    if (!isObject(pathObj)) continue;
    const getShape = shapeOf(pathObj.get);
    if (!getShape) continue;
    for (const m of ['post', 'put', 'patch'] as const) {
      const writeShape = shapeOf(pathObj[m]);
      if (writeShape && writeShape !== getShape) {
        findings.push({
          message:
            `Path ${pathStr}: ${m.toUpperCase()} returns shape \`${writeShape}\` ` +
            `but GET returns \`${getShape}\`. Stripe-style CRUD APIs return the resource on every mutation.`,
        });
      }
    }
  }
  return findings;
};

// =============================================================================
// CL-51 — paramsOrderRequiredFirst
//
// SDK methods with positional params look much cleaner when required params
// precede optional ones. Detect operations whose `parameters` array contains
// optional parameters before required ones.
// =============================================================================

/**
 * CL-51 — Required+optional params unordered.
 *
 * Source: MIN-27 IBM (parameters-order rule);
 *         rules-brainstorm.md CL-51 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const paramsOrderRequiredFirst: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!Array.isArray(targetVal)) return [];
  let seenOptional = false;
  for (const p of targetVal) {
    if (!isObject(p)) continue;
    const required = p.required === true;
    if (!required) {
      seenOptional = true;
    } else if (required && seenOptional) {
      return [
        {
          message:
            `Required parameter \`${p.name ?? '?'}\` follows an optional parameter; reorder so required parameters come first ` +
            `for cleaner SDK method signatures.`,
        },
      ];
    }
  }
  return [];
};

// =============================================================================
// CL-53 — totalRequiredInputsExceeds
//
// Counts total required inputs across `parameters` (where required:true) and
// `requestBody.content[*].schema.required`. Threshold: >5.
// =============================================================================

export interface TotalRequiredInputsOptions {
  threshold?: number;
}

/**
 * CL-53 — Total required inputs exceed threshold.
 *
 * Source: Speakeasy + Postman (input-burden guidance);
 *         rules-brainstorm.md CL-53 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const totalRequiredInputsExceeds: IFunction = function (
  targetVal,
  opts,
  _context
) {
  const optsTyped = opts as TotalRequiredInputsOptions | undefined;
  const threshold =
    typeof optsTyped?.threshold === 'number' ? optsTyped.threshold : 5;
  if (!isObject(targetVal)) return [];

  let count = 0;
  if (Array.isArray(targetVal.parameters)) {
    for (const p of targetVal.parameters) {
      if (isObject(p) && p.required === true) count++;
    }
  }
  if (isObject(targetVal.requestBody) && isObject(targetVal.requestBody.content)) {
    for (const [, mt] of Object.entries(targetVal.requestBody.content)) {
      if (isObject(mt) && isObject(mt.schema) && Array.isArray(mt.schema.required)) {
        count += mt.schema.required.length;
      }
    }
  }
  if (count <= threshold) return [];
  return [
    {
      message:
        `Operation has ${count} total required inputs (parameters + requestBody.required); >${threshold} ` +
        `is hard for SDK consumers and AI agents to construct correctly. Consider grouping or making more optional.`,
    },
  ];
};

// =============================================================================
// CL-61 — vendorExtensionPrefixConsistency
//
// Spec-wide: vendor-extension keys (`x-foo-*`) should use a single prefix
// per vendor. Detect when both `x-stripe-...` and `x-Stripe-...` (case-mix)
// or `x-stripe-...` and `x-stripe_...` (separator-mix) appear in the spec.
// =============================================================================

function collectVendorExtensions(
  obj: unknown,
  acc: Set<string>,
  depth: number
): void {
  if (depth > 6) return;
  if (Array.isArray(obj)) {
    for (const v of obj) collectVendorExtensions(v, acc, depth + 1);
    return;
  }
  if (!isObject(obj)) return;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('x-')) acc.add(k);
    collectVendorExtensions(obj[k], acc, depth + 1);
  }
}

/**
 * CL-61 — Vendor-extension prefix-inconsistency.
 *
 * Source: Speakeasy + OAI (https://www.speakeasy.com/openapi);
 *         rules-brainstorm.md CL-61 (P3).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const vendorExtensionPrefixConsistency: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!isObject(targetVal)) return [];
  const exts = new Set<string>();
  collectVendorExtensions(targetVal, exts, 0);
  if (exts.size < 2) return [];

  // Strip the leading `x-`, take the first hyphen-separated chunk, lower-case.
  // Group by lower-case-first-chunk; emit when ≥2 distinct casings/separators
  // exist for the same vendor.
  const groups = new Map<string, Set<string>>();
  for (const ext of exts) {
    const stripped = ext.slice(2); // remove "x-"
    // Normalize separator: take first alphabetic prefix.
    const m = stripped.match(/^([A-Za-z]+)/);
    if (!m) continue;
    const vendorLower = m[1].toLowerCase();
    if (vendorLower.length < 3) continue; // skip generic 1-2-char like x-id
    const variants = groups.get(vendorLower) ?? new Set();
    variants.add(m[1]); // preserve original casing for reporting
    groups.set(vendorLower, variants);
  }

  const findings: IFunctionResult[] = [];
  for (const [vendor, variants] of groups) {
    if (variants.size < 2) continue;
    findings.push({
      message:
        `Vendor-extension prefix \`x-${vendor}-*\` used with mixed casings: ${[...variants]
          .map((s) => `\`x-${s}-...\``)
          .join(', ')}. Pick one canonical prefix.`,
    });
  }
  return findings;
};

// =============================================================================
// CL-75 — tagCasingCrossSpecConsistency
//
// Tags used across operations should follow ONE casing convention spec-wide
// (all PascalCase OR all camelCase OR all kebab-case). Detect when ≥2
// distinct casings co-exist.
// =============================================================================

function detectCasing(s: string): 'pascal' | 'camel' | 'kebab' | 'snake' | 'mixed' {
  if (/^[A-Z][a-zA-Z0-9]*$/.test(s)) return 'pascal';
  if (/^[a-z][a-zA-Z0-9]*$/.test(s)) return 'camel';
  if (/^[a-z][a-z0-9-]*$/.test(s) && s.includes('-')) return 'kebab';
  if (/^[a-z][a-z0-9_]*$/.test(s) && s.includes('_')) return 'snake';
  return 'mixed';
}

/**
 * CL-75 — Mixed casing across tags.
 *
 * Source: MIN Q-SP-5 (tag-casing convention);
 *         rules-brainstorm.md CL-75 (P3).
 * Lens: 4 (Client-Friction), 5 (Style-Coherence)
 * Round: 2 (Welle D / T18c)
 */
export const tagCasingCrossSpecConsistency: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!isObject(targetVal)) return [];
  const tags = new Set<string>();

  // top-level tags[] — collect names
  if (Array.isArray(targetVal.tags)) {
    for (const t of targetVal.tags) {
      if (isObject(t) && typeof t.name === 'string') tags.add(t.name);
    }
  }
  // operations.tags[]
  const paths = isObject(targetVal.paths) ? (targetVal.paths as PathsMap) : null;
  if (paths) {
    for (const [, pathObj] of Object.entries(paths)) {
      if (!isObject(pathObj)) continue;
      for (const m of [
        'get',
        'post',
        'put',
        'patch',
        'delete',
        'options',
        'head',
        'trace',
      ]) {
        const op = pathObj[m];
        if (!isObject(op) || !Array.isArray(op.tags)) continue;
        for (const t of op.tags) {
          if (typeof t === 'string') tags.add(t);
        }
      }
    }
  }
  if (tags.size < 2) return [];
  const casings = new Set<string>();
  for (const t of tags) casings.add(detectCasing(t));
  if (casings.size <= 1) return [];
  return [
    {
      message:
        `Spec uses ${casings.size} distinct tag-casing conventions (${[...casings].join(', ')}); ` +
        `pick one canonical casing — codegen and docs render inconsistently otherwise.`,
    },
  ];
};

// =============================================================================
// CL-80 — readOnlyRequiredConflict
//
// readOnly:true means "appears in response, never in request". required:true
// at parent-level means "must be present in the JSON body". When a property
// is BOTH readOnly:true AND in parent's `required[]`, clients cannot satisfy
// the required-constraint on POST/PUT bodies — codegen produces uncomfortable
// "always-set-but-server-ignores" semantics.
//
// Operates on schema-level: receives a schema with `properties` + `required`.
// =============================================================================

/**
 * CL-80 — readOnly:true AND required:true conflict.
 *
 * Source: M-SP-3 mirrors;
 *         rules-brainstorm.md CL-80 (P3).
 * Lens: 4 (Client-Friction), 3 (Evolution-Friction)
 * Round: 2 (Welle D / T18c)
 */
export const readOnlyRequiredConflict: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!isObject(targetVal)) return [];
  const required = Array.isArray(targetVal.required)
    ? new Set(targetVal.required.filter((s): s is string => typeof s === 'string'))
    : null;
  if (!required || required.size === 0) return [];
  const props = isObject(targetVal.properties) ? targetVal.properties : null;
  if (!props) return [];
  const findings: IFunctionResult[] = [];
  for (const propName of required) {
    const prop = props[propName];
    if (isObject(prop) && prop.readOnly === true) {
      findings.push({
        message:
          `Property \`${propName}\` is both \`readOnly: true\` AND in parent's \`required\` — ` +
          `clients cannot satisfy the required-constraint on POST/PUT input. Pick one.`,
      });
    }
  }
  return findings;
};

// =============================================================================
// Welle Arch+ A3 — FUNCTION_METADATA registry for client-p3 callables.
// =============================================================================

import type { FunctionMetadata } from './_metadata.js';

export const FUNCTION_METADATA: Record<string, FunctionMetadata> = {
  'camelize-collide-schema-property': {
    name: 'camelize-collide-schema-property',
    patternIds: ['CL-3'],
    lens: 'client-friction',
    perfClass: 'O(n)',
    description:
      'Property names that camelize to the same identifier collide in SDK codegen — pick one canonical naming convention.',
  },
  'required-asymmetry-request-response': {
    name: 'required-asymmetry-request-response',
    patternIds: ['CL-8'],
    lens: 'client-friction',
    perfClass: 'O(n*m)',
    description:
      'Property required-state differs between request and response schema for the same operation — SDK consumers see 3-state semantics.',
  },
  'int64-needs-string-alternative': {
    name: 'int64-needs-string-alternative',
    patternIds: ['CL-16'],
    lens: 'client-friction',
    perfClass: 'O(1)',
    description:
      'format:int64 declared without a string-alternative branch; JavaScript Number loses precision past 2^53 (Stripe-style).',
  },
  'empty-body-2xx-4xx-discriminator': {
    name: 'empty-body-2xx-4xx-discriminator',
    patternIds: ['CL-19'],
    lens: 'client-friction',
    perfClass: 'O(n*m)',
    description:
      'Operation has both empty-body 2xx and 4xx without distinguishing data — SDK consumer cannot discriminate from body alone.',
  },
  'response-ref-inconsistency': {
    name: 'response-ref-inconsistency',
    patternIds: ['CL-27'],
    lens: 'client-friction',
    perfClass: 'O(n*m)',
    description:
      'Same status-code response appears mixed via $ref AND inline across operations — consolidate to a component-response.',
  },
  'nested-composition-depth': {
    name: 'nested-composition-depth',
    patternIds: ['CL-30'],
    lens: 'client-friction',
    perfClass: 'O(n)',
    description:
      'Schema has allOf/oneOf/anyOf composition-depth above limit — swagger-ui and codegen render deeply-nested chains poorly.',
  },
  'field-name-length-balance': {
    name: 'field-name-length-balance',
    patternIds: ['CL-44'],
    lens: 'client-friction',
    perfClass: 'O(1)',
    description:
      'Field name >30 chars (verbose) OR ≤2 chars (cryptic, with allowlist for id/ts/etc). Both produce poor SDK DX.',
  },
  'crud-shape-consistency': {
    name: 'crud-shape-consistency',
    patternIds: ['CL-47'],
    lens: 'client-friction',
    perfClass: 'O(n*m)',
    description:
      'POST/PUT/PATCH 2xx return-shape ≠ GET 2xx shape on same path — Stripe-style CRUD returns the resource on every mutation.',
  },
  'params-order-required-first': {
    name: 'params-order-required-first',
    patternIds: ['CL-51'],
    lens: 'client-friction',
    perfClass: 'O(n)',
    description:
      'Required parameter follows an optional parameter in `parameters` array — reorder for cleaner SDK method signatures.',
  },
  'total-required-inputs-exceeds': {
    name: 'total-required-inputs-exceeds',
    patternIds: ['CL-53'],
    lens: 'client-friction',
    perfClass: 'O(n)',
    description:
      'Total required inputs (params + requestBody.required) exceed threshold — hard for SDK consumers and AI agents to construct.',
  },
  'vendor-extension-prefix-consistency': {
    name: 'vendor-extension-prefix-consistency',
    patternIds: ['CL-61'],
    lens: 'client-friction',
    perfClass: 'O(n)',
    description:
      'Same vendor uses ≥2 distinct casings/separators for x-* extensions across spec — pick one canonical prefix.',
  },
  'tag-casing-cross-spec-consistency': {
    name: 'tag-casing-cross-spec-consistency',
    patternIds: ['CL-75'],
    lens: 'client-friction',
    perfClass: 'O(n)',
    description:
      'Spec uses ≥2 distinct tag-casing conventions (pascal/camel/kebab/snake) — codegen and docs render inconsistently.',
  },
  'read-only-required-conflict': {
    name: 'read-only-required-conflict',
    patternIds: ['CL-80'],
    lens: 'client-friction',
    perfClass: 'O(n)',
    description:
      'Property is both readOnly:true AND in parent.required — clients cannot satisfy required-constraint on POST/PUT input.',
  },
};
