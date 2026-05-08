/**
 * Custom Spectral functions for the P2 Client-Friction ruleset (T18b, Welle C).
 *
 * Spectral's built-in functions (alphabetical, casing, defined, enumeration,
 * falsy, length, pattern, schema, truthy, undefined, unreferencedReusableObject,
 * xor, or) cover most P2 rules; the patterns below need additional logic:
 *
 *   - schemaNestingDepth (CL-29):           Inline schemas with object-properties
 *                                           nested deeper than N levels (default 3)
 *                                           render unreadable docs and confuse
 *                                           codegen.
 *   - regexMultiEngineUnsupported (CL-25):  Pattern uses ECMA-262 features that
 *                                           Java / Python regex engines reject
 *                                           (named groups, lookbehind, possessive,
 *                                           Unicode property escapes).
 *   - allOfHeavyNonRefObjects (CL-77):      `allOf` with ≥2 non-$ref inline
 *                                           object schemas — codegen produces
 *                                           inheritance-tree explosion.
 *   - linguisticAmorphousUri (F-11):        URI segments that are too generic
 *                                           ("data", "thing", "resource", "entity",
 *                                           "object", "item") — agents and devs
 *                                           cannot infer purpose.
 *   - linguisticPluralizedNodes (F-14):     Same conceptual resource appears in
 *                                           singular AND plural forms across paths
 *                                           (`/user/{id}` AND `/users/{id}`).
 *
 * Sources (file-level, per-callable headers below cite verbatim):
 *   - openapi-generator multi-issue (https://github.com/OpenAPITools/openapi-generator)
 *   - openapi-python-client (https://github.com/openapi-generators/openapi-python-client)
 *   - swagger-ui + redoc multi-issue threads
 *   - Palma & Khomh "An Empirical Study of REST APIs Linguistic Anti-patterns"
 *     (DOLAR / Springer 2015, https://link.springer.com/chapter/10.1007/978-3-662-48616-0_11)
 *   - rules-brainstorm.md CL-17/CL-18/CL-25/CL-29/CL-77/F-11/F-13/F-14
 *
 * Lens: 4 (Client-Friction), with Lens-3 (CL-15/CL-17/CL-77) and Lens-5
 *       (F-11/F-13/F-14) cross-cuts.
 * Round: 2 (Welle C / T18b)
 */

import type { IFunction, IFunctionResult } from '@stoplight/spectral-core';

type AnyObj = Record<string, unknown>;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// =============================================================================
// CL-29 — schemaNestingDepth
//
// Walks an inline schema's object-properties tree and emits a finding when
// the maximum nesting depth exceeds the configured `maxDepth` (default 3).
// Terminates on $ref boundaries (those are documented separately) and on
// scalar leaves.
// =============================================================================

export interface SchemaNestingDepthOptions {
  /** Max allowed depth. Default 3. Higher = more permissive. */
  maxDepth?: number;
}

/**
 * Walk inline schemas + count max depth. Stops at $ref siblings (those are
 * resolution boundaries we don't traverse here). Tracks depth via the
 * properties + items + allOf/oneOf/anyOf branches.
 */
function maxObjectNestingDepth(schema: unknown, currentDepth: number): number {
  if (!isObject(schema)) return currentDepth;
  if ('$ref' in schema) return currentDepth;

  let deepest = currentDepth;

  // properties:
  const props = isObject(schema.properties) ? schema.properties : null;
  if (props) {
    for (const v of Object.values(props)) {
      const d = maxObjectNestingDepth(v, currentDepth + 1);
      if (d > deepest) deepest = d;
    }
  }

  // items: (array)
  const items = schema.items;
  if (items) {
    const d = maxObjectNestingDepth(items, currentDepth);
    if (d > deepest) deepest = d;
  }

  // allOf / oneOf / anyOf: don't increase depth (they're composition, not nesting)
  for (const k of ['allOf', 'oneOf', 'anyOf'] as const) {
    const arr = schema[k];
    if (Array.isArray(arr)) {
      for (const sub of arr) {
        const d = maxObjectNestingDepth(sub, currentDepth);
        if (d > deepest) deepest = d;
      }
    }
  }

  // additionalProperties as schema:
  const ap = schema.additionalProperties;
  if (isObject(ap)) {
    const d = maxObjectNestingDepth(ap, currentDepth + 1);
    if (d > deepest) deepest = d;
  }

  return deepest;
}

/**
 * CL-29 — schema-nesting-depth check.
 *
 * Source: swagger-ui + redoc multi-issue (deeply-nested inline objects render
 *         unreadable; codegen produces NestedNestedNested types);
 *         rules-brainstorm.md CL-29 (P2, mech-stat).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle C / T18b)
 */
export const schemaNestingDepth: IFunction = function (
  targetVal,
  opts,
  _context
) {
  const optsTyped = opts as SchemaNestingDepthOptions | undefined;
  const maxDepth =
    typeof optsTyped?.maxDepth === 'number' ? optsTyped.maxDepth : 3;
  if (!isObject(targetVal)) return [];
  // Skip $ref'd schemas — they're a resolution boundary.
  if ('$ref' in targetVal) return [];
  const depth = maxObjectNestingDepth(targetVal, 0);
  if (depth <= maxDepth) return [];
  const result: IFunctionResult[] = [
    {
      message:
        `Schema has inline object-nesting depth ${depth} (limit ${maxDepth}); deeply-nested inline schemas render poorly in docs portals and produce ` +
        `NestedNestedNested types in codegen output. Extract nested objects to named components.`,
    },
  ];
  return result;
};

// =============================================================================
// CL-25 — regexMultiEngineUnsupported
//
// Tests a `pattern` string for ECMA-262-only features that Java's
// java.util.regex / Python's `re` reject. Flags:
//   - Lookbehind `(?<= ...)` / `(?<! ...)` — Python supports fixed-width only
//   - Named groups `(?<name>...)` — Java uses (?<name>...) but ECMA's syntax
//     `(?<name>...)` works cross-engine; (?P<name>...) is Python-only
//   - Unicode property escapes `\p{...}` — Java allows; Python requires regex
//     (3rd-party); ECMA-262 supports with `u` flag only
//   - Possessive quantifiers `++ *+ ?+` — Java only; ECMA / Python reject
//   - Atomic groups `(?>...)` — Java only
//   - Conditional patterns `(?(...)...)` — Python only
// =============================================================================

const REGEX_INCOMPATIBLE_PATTERNS: Array<{ regex: RegExp; reason: string; engines: string[] }> = [
  {
    regex: /\(\?<=|\(\?<!/u,
    reason: 'lookbehind assertions (`(?<=...)` / `(?<!...)`)',
    engines: ['python (fixed-width only)'],
  },
  {
    regex: /\(\?P</u,
    reason: 'Python-style named groups `(?P<name>...)`',
    engines: ['ecma-262', 'java'],
  },
  {
    // Possessive markers only — exclude `}+` (because `\p{...}+` is just a
    // greedy quantifier on a Unicode-property escape, not possessive). True
    // possessive `{n,m}+` requires the `}+` to be preceded by a digit-comma
    // sequence (use lookbehind in the test regex itself? no — lookbehind here
    // works in JS engines. We instead require the possessive `{n,m}+` form
    // to have at least one digit before `}+`).
    regex: /[*?]\+(?!\?)|(?<!\\p)\+\+|\d\}\+/u,
    reason: 'possessive quantifiers (`*+`, `++`, `?+`, `{n,m}+`)',
    engines: ['ecma-262', 'python'],
  },
  {
    regex: /\(\?>/u,
    reason: 'atomic groups `(?>...)`',
    engines: ['ecma-262', 'python'],
  },
  {
    regex: /\(\?\(/u,
    reason: 'conditional patterns `(?(...)...)` ',
    engines: ['ecma-262', 'java'],
  },
  {
    regex: /\\p\{[^}]+\}/u,
    reason: 'Unicode property escapes `\\p{...}`',
    engines: ['python (stdlib re)'],
  },
];

/**
 * CL-25 — multi-engine regex compatibility check.
 *
 * Source: ReDoc + openapi-python-client (regex-engine-mismatch reports);
 *         Java `java.util.regex` documentation; Python `re` module spec;
 *         ECMA-262 §22.2 RegExp spec.
 *         rules-brainstorm.md CL-25 (P2, mech-stat).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle C / T18b)
 */
export const regexMultiEngineUnsupported: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (typeof targetVal !== 'string' || targetVal.length === 0) return [];
  const findings: IFunctionResult[] = [];
  for (const { regex, reason, engines } of REGEX_INCOMPATIBLE_PATTERNS) {
    if (regex.test(targetVal)) {
      findings.push({
        message:
          `Pattern uses ${reason}; rejected by codegen target engines: ${engines.join(', ')}. ` +
          `Use a portable regex subset (basic groups, char classes, alternation, quantifiers) for cross-language SDK compatibility.`,
      });
    }
  }
  return findings;
};

// =============================================================================
// CL-77 — allOfHeavyNonRefObjects
//
// `allOf` is meant for inheritance-style composition. Best practice: ≥1
// $ref to a named schema + ≤1 inline-object adding fields. Multiple inline
// objects in one allOf indicate the author should refactor — codegen
// produces an inheritance tree of synthetic types.
// =============================================================================

/**
 * CL-77 — heavy-allOf with multiple non-$ref inline objects.
 *
 * Source: openapi-generator #9756 + multi-codegen consensus
 *         (https://github.com/OpenAPITools/openapi-generator/issues/9756);
 *         rules-brainstorm.md CL-77 (P2, heuristic).
 * Lens: 4 (Client-Friction)
 * Round: 2 (Welle C / T18b)
 */
export const allOfHeavyNonRefObjects: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (!Array.isArray(targetVal)) return [];
  let nonRefObjectCount = 0;
  for (const sub of targetVal) {
    if (!isObject(sub)) continue;
    if ('$ref' in sub) continue;
    // Inline object with properties OR additionalProperties: count it.
    if (
      isObject(sub.properties) ||
      isObject(sub.additionalProperties) ||
      sub.type === 'object'
    ) {
      nonRefObjectCount++;
    }
  }
  if (nonRefObjectCount < 2) return [];
  const result: IFunctionResult[] = [
    {
      message:
        `\`allOf\` has ${nonRefObjectCount} inline non-\$ref object schemas — heavy composition causes codegen tools to emit deep inheritance trees with synthetic intermediate types. ` +
        `Extract intermediate schemas to named components (and reference via \$ref) for cleaner SDK output.`,
    },
  ];
  return result;
};

// =============================================================================
// F-11 — linguisticAmorphousUri
//
// Per Palma & Khomh DOLAR (Springer 2015): URI segments that are generic
// nouns ("data", "object", "thing", "resource", "info", "stuff", "entity",
// "item", "value") give the consuming agent / dev no semantic information.
// Replace with the actual resource-type ("user", "invoice", "subscription").
// =============================================================================

const AMORPHOUS_URI_TOKENS: ReadonlySet<string> = new Set([
  'data',
  'object',
  'objects',
  'thing',
  'things',
  'resource',
  'resources',
  'info',
  'information',
  'stuff',
  'entity',
  'entities',
  'item',
  'items',
  'value',
  'values',
  'content',
  'contents',
  'record',
  'records',
  'element',
  'elements',
  'node',
  'nodes',
]);

/**
 * F-11 — Linguistic Amorphous URI segment.
 *
 * Source: Palma & Khomh "An Empirical Study of REST APIs Linguistic
 *         Anti-patterns" (DOLAR, Springer 2015, doi 10.1007/978-3-662-48616-0_11)
 *         — verbatim "Amorphous URI: URIs containing too generic words give
 *         clients no information on the kind of resource."
 *         rules-brainstorm.md F-11 (P2, mech).
 * Lens: 4 (Client-Friction), 5 (Style-Coherence)
 * Round: 2 (Welle C / T18b)
 */
export const linguisticAmorphousUri: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (typeof targetVal !== 'string' || targetVal.length === 0) return [];
  // targetVal is the path-key, e.g. "/users/{id}/data"
  // Tokenise by `/`, strip path-template braces, ignore empty segments.
  const segments = targetVal
    .split('/')
    .map((s) => s.trim())
    // skip path-template params (`{id}`).
    .filter((s) => s.length > 0 && !s.startsWith('{'))
    .map((s) => s.toLowerCase());

  const offenders = segments.filter((seg) => AMORPHOUS_URI_TOKENS.has(seg));
  if (offenders.length === 0) return [];
  return [
    {
      message:
        `Path \`${targetVal}\` contains amorphous URI segment(s): ${offenders.join(', ')}. ` +
        `Replace generic nouns with the actual resource-type (e.g. /users, /invoices, /subscriptions) — Palma/Khomh DOLAR linguistic anti-pattern.`,
    },
  ];
};

// =============================================================================
// F-12 — linguisticTinyResource
//
// Per DOLAR: URI segments of 1-2 chars (excluding well-known abbreviations
// like "id", "v1", "v2") are too cryptic for both human and agent consumers.
// =============================================================================

const TINY_RESOURCE_ALLOWLIST: ReadonlySet<string> = new Set([
  'id',
  // version prefixes (whitelist common patterns up to v9; longer versions handled by regex)
  'v1',
  'v2',
  'v3',
  'v4',
  'v5',
  'v6',
  'v7',
  'v8',
  'v9',
  // OData / OpenAPI well-known shorthands
  'me',
  'us',
  'eu',
  'au',
  'jp',
  'br',
  'in',
]);

/**
 * F-12 — Linguistic Tiny Resource (1-2 chars).
 *
 * Source: Palma & Khomh "An Empirical Study of REST APIs Linguistic
 *         Anti-patterns" (DOLAR, Springer 2015) — Tiny-Resource anti-pattern;
 *         rules-brainstorm.md F-12 (P3, mech).
 * Lens: 4 (Client-Friction), 5 (Style-Coherence)
 * Round: 2 (Welle C / T18b)
 */
export const linguisticTinyResource: IFunction = function (
  targetVal,
  _opts,
  _context
) {
  if (typeof targetVal !== 'string' || targetVal.length === 0) return [];
  const segments = targetVal
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('{'))
    .map((s) => s.toLowerCase());

  const offenders = segments.filter(
    (seg) =>
      seg.length > 0 &&
      seg.length <= 2 &&
      !TINY_RESOURCE_ALLOWLIST.has(seg) &&
      !/^v\d+$/.test(seg) // explicitly version-prefixes (v10, v11, ...)
  );
  if (offenders.length === 0) return [];
  return [
    {
      message:
        `Path \`${targetVal}\` contains tiny-resource segment(s) (1-2 chars): ${offenders.join(', ')}. ` +
        `Use full resource-names (e.g. /users not /u, /invoices not /iv) — Palma/Khomh DOLAR linguistic anti-pattern.`,
    },
  ];
};
