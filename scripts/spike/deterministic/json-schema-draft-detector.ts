/**
 * JSON-Schema Draft-Version Detector Module — Stage A, Welle A T14 (Module-Class).
 *
 * Sources: JSON Schema 2020-12 spec (https://json-schema.org/draft/2020-12/release-notes)
 *          + OAS 3.0 binding (subset of JSON-Schema-2017 / Wright-00)
 *          + OAS 3.1 binding (full JSON-Schema-2020-12 alignment)
 *          + apiq X-MIN-3 Round-2 (Swagger 2 detection)
 * Patterns: 3 finding-classes (OAS-3.0 + 2020-12-only-keywords [error per RFC2-84],
 *           OAS-3.1 missing jsonSchemaDialect [hint per RFC2-85], 7807→9457
 *           definitions→$defs migration smell [RFC2-86/87])
 * Lens: 2 (Standards-Compliance), 3 (Evolution-Friction)
 * Round: 2 (Welle A / T14)
 *
 * Maps to rules-brainstorm.md: RFC2-84 (OAS 3.0 + 2020-12-only-keywords = error
 * P1), RFC2-85 (OAS 3.1 jsonSchemaDialect required), RFC2-86 (definitions → $defs
 * porting smell), RFC2-87 (id → $id), RFC2-88 (Boolean exclusiveMin/Max in 3.1),
 * RFC2-89 (contentEncoding/contentMediaType in 3.0).
 *
 * Detects mismatches between the OpenAPI version a spec declares and the
 * JSON-Schema draft its keywords actually require. This is "load-bearing"
 * because validators (AJV, swagger-parser, IDE tooling) silently ignore
 * unsupported keywords — a 3.0 spec that smuggles in 2020-12-only keywords
 * (`unevaluatedProperties`, `prefixItems`, `dependentRequired`, `if/then/else`,
 * etc.) will VALIDATE clean against most 3.0 toolchains and ship broken
 * semantics to clients.
 *
 * Lens: 2 (Standards-Compliance) + 3 (Evolution-Friction).
 *
 * OpenAPI <-> JSON-Schema-Draft binding:
 *   - OpenAPI 2.0 (Swagger): JSON-Schema draft-04 subset
 *   - OpenAPI 3.0.x: JSON-Schema draft-04 (extended; OAS-3.0 §4.7.24
 *     "subset of JSON Schema Specification Wright Draft 00")
 *   - OpenAPI 3.1.x: JSON-Schema 2020-12 (full; default `jsonSchemaDialect`
 *     of `https://spec.openapis.org/oas/3.1/dialect/base`)
 *
 * Patterns implemented (Mining-Round-2 RFC2-84..89 + apiq X1-X5):
 *   - RFC2-84  (error): OAS 3.0 + 2020-12-only-keywords -> validators silent-ignore
 *   - RFC2-85  (hint):  OAS 3.1 with 2020-12-keywords + missing `jsonSchemaDialect`
 *   - RFC2-86  (hint):  `definitions` keyword inside a sub-schema (porting smell)
 *   - RFC2-87  (hint):  `id` (no $) keyword (draft-04 -> draft-06+ porting smell)
 *   - RFC2-88  (error): boolean `exclusiveMinimum/Maximum` in OAS 3.1 (X4)
 *   - RFC2-89  (hint):  `contentEncoding`/`contentMediaType` on OAS 3.0 (mostly ignored)
 *   - X1       (warn):  `nullable: true` in OAS 3.1 (deprecated)
 *   - X2       (error): `type: [..., null]` array-form in OAS 3.0 (invalid)
 *   - X3       (hint):  `example` (singular) AND `examples` (plural) on same node
 *   - X5       (error): top-level `webhooks` section declared in OAS 3.0
 *   - Mixed    (error): `nullable: true` AND `type: [..., null]` on same node
 *
 * Public API:
 *   - detectOasVersion(spec) => OasVersion | null
 *   - runJsonSchemaDraftDetector(spec, opts) => Promise<DetectorFinding[]>
 *   - KEYWORD_CATALOG (data table per acceptance criterion)
 *
 * CLI:
 *   cd scripts/spike && npx tsx deterministic/json-schema-draft-detector.ts <spec-name>
 */

import type { DetectorFinding, DetectorOptions } from "./types.js";

// =============================================================================
// 1. Per-keyword catalog (data-table per acceptance criterion)
// =============================================================================

/** JSON-Schema draft identifier — narrow enum used in the keyword catalog. */
export type JsonSchemaDraft =
  | "draft-04"
  | "draft-06"
  | "draft-07"
  | "2019-09"
  | "2020-12";

/** OpenAPI binding-draft alias (the draft a given OAS-version maps to). */
export type OasDraftBinding = "draft-04-extended" | "2020-12";

/**
 * Per-keyword data table. Each entry declares which JSON-Schema drafts the
 * keyword is officially supported in. The detector uses this table — in
 * combination with the OAS-version-binding — to decide whether a keyword
 * presence on a schema-node is an error / warn / hint.
 *
 * Notes:
 *   - We model OAS-3.0 as compatible with `draft-04` only (it extends draft-04
 *     with `nullable`/`discriminator`/`xml`/etc., but those are OAS-extensions,
 *     not draft-06+ keywords).
 *   - OAS-3.1 with no explicit `jsonSchemaDialect` defaults to `2020-12`.
 *   - `id` and `definitions` are pre-OAS keywords that survive in legacy spec
 *     conversions; flagged as porting-smells in either OAS version.
 */
export interface KeywordCatalogEntry {
  /** Keyword name as it appears on a schema-node. */
  keyword: string;
  /** Drafts in which this keyword is officially defined / supported. */
  supportedIn: ReadonlyArray<JsonSchemaDraft>;
  /** Optional: human-readable note for UI / docs. */
  note?: string;
}

/**
 * The catalog of "interesting" keywords for draft-mismatch detection. Not an
 * exhaustive list of every JSON-Schema keyword — only the ones whose presence
 * carries a draft-version signal. Common keywords (`type`, `properties`,
 * `required`, etc.) are draft-04+ across the board and add no detection signal.
 */
export const KEYWORD_CATALOG: ReadonlyArray<KeywordCatalogEntry> = [
  // -- 2019-09 / 2020-12-introduced ------------------------------------------
  {
    keyword: "$defs",
    supportedIn: ["2019-09", "2020-12"],
    note: "Replaces draft-04 definitions. OAS-3.0 should use components.schemas instead.",
  },
  {
    keyword: "$dynamicRef",
    supportedIn: ["2020-12"],
    note: "2020-12 dynamic-reference keyword.",
  },
  {
    keyword: "$dynamicAnchor",
    supportedIn: ["2020-12"],
    note: "2020-12 dynamic-reference anchor.",
  },
  {
    keyword: "prefixItems",
    supportedIn: ["2020-12"],
    note: "2020-12 replacement for tuple-form items array.",
  },
  {
    keyword: "unevaluatedProperties",
    supportedIn: ["2019-09", "2020-12"],
    note: "Validators silent-ignore on draft-04 -> stricter intent silently lost.",
  },
  {
    keyword: "unevaluatedItems",
    supportedIn: ["2019-09", "2020-12"],
  },
  {
    keyword: "dependentRequired",
    supportedIn: ["2019-09", "2020-12"],
    note: "Replaces draft-04 dependencies (array-form).",
  },
  {
    keyword: "dependentSchemas",
    supportedIn: ["2019-09", "2020-12"],
    note: "Replaces draft-04 dependencies (schema-form).",
  },
  {
    keyword: "contentSchema",
    supportedIn: ["2020-12"],
  },
  {
    keyword: "maxContains",
    supportedIn: ["2019-09", "2020-12"],
  },
  {
    keyword: "minContains",
    supportedIn: ["2019-09", "2020-12"],
  },

  // -- draft-07-introduced ---------------------------------------------------
  {
    keyword: "if",
    supportedIn: ["draft-07", "2019-09", "2020-12"],
    note: "Conditional schema-application; not in OAS-3.0.",
  },
  {
    keyword: "then",
    supportedIn: ["draft-07", "2019-09", "2020-12"],
  },
  {
    keyword: "else",
    supportedIn: ["draft-07", "2019-09", "2020-12"],
  },
  {
    keyword: "contentEncoding",
    supportedIn: ["draft-07", "2019-09", "2020-12"],
    note: "OAS-3.0 validators mostly ignore -> doc-only smell.",
  },
  {
    keyword: "contentMediaType",
    supportedIn: ["draft-07", "2019-09", "2020-12"],
    note: "OAS-3.0 validators mostly ignore -> doc-only smell.",
  },

  // -- draft-06-introduced (porting smell from draft-04) ---------------------
  {
    keyword: "$id",
    supportedIn: ["draft-06", "draft-07", "2019-09", "2020-12"],
    note: "Replaces draft-04 id. OAS uses components.schemas instead of $id.",
  },
  {
    keyword: "const",
    supportedIn: ["draft-06", "draft-07", "2019-09", "2020-12"],
  },
  {
    keyword: "examples",
    supportedIn: ["draft-06", "draft-07", "2019-09", "2020-12"],
    note: "Plural form; OAS-3.0 schema uses singular example.",
  },
  {
    keyword: "propertyNames",
    supportedIn: ["draft-06", "draft-07", "2019-09", "2020-12"],
  },

  // -- draft-04-only / pre-OAS legacy (porting smell) ------------------------
  {
    keyword: "id",
    supportedIn: ["draft-04"],
    note: "Pre-draft-06 form; renamed to $id. OAS uses components.schemas.",
  },
  {
    keyword: "definitions",
    supportedIn: ["draft-04", "draft-06", "draft-07"],
    note: "OAS uses components.schemas; sub-schema definitions is porting-smell.",
  },
];

/** Convenience lookup: returns true if the keyword requires 2020-12 dialect. */
export function isTwentyTwentyOnly(keyword: string): boolean {
  const e = KEYWORD_CATALOG.find((k) => k.keyword === keyword);
  if (!e) return false;
  return e.supportedIn.every((d) => d === "2020-12");
}

/** Convenience lookup: keywords supported in 2019-09 OR newer (2020-12 inclusive). */
export function requires2019OrNewer(keyword: string): boolean {
  const e = KEYWORD_CATALOG.find((k) => k.keyword === keyword);
  if (!e) return false;
  return e.supportedIn.every((d) => d === "2019-09" || d === "2020-12");
}

/** True when the keyword is a draft-07 introduction (not in 3.0/draft-04). */
export function requiresDraft07OrNewer(keyword: string): boolean {
  const e = KEYWORD_CATALOG.find((k) => k.keyword === keyword);
  if (!e) return false;
  return e.supportedIn.every(
    (d) => d === "draft-07" || d === "2019-09" || d === "2020-12"
  );
}

/**
 * Keywords whose presence in a 3.0-spec is RFC2-84 territory (silent-ignore
 * class — semantically broken validation). 2020-12-only keywords PLUS
 * draft-07-introduced keywords (since 3.0 binds draft-04, neither set is in).
 */
const KEYWORDS_2020_ONLY = new Set([
  "$dynamicRef",
  "$dynamicAnchor",
  "prefixItems",
  "unevaluatedProperties",
  "unevaluatedItems",
  "dependentRequired",
  "dependentSchemas",
  "contentSchema",
  "maxContains",
  "minContains",
  "$defs",
  // draft-07 keywords also unsupported in 3.0 draft-04-extended:
  "if",
  "then",
  "else",
]);

// =============================================================================
// 2. OAS-version detection
// =============================================================================

export interface OasVersion {
  major: 2 | 3;
  minor: number;
  patch: number;
  raw: string;
}

/**
 * Inspect the spec root for the openapi (or swagger) version field.
 * Returns null when the field is absent or malformed.
 */
export function detectOasVersion(spec: object): OasVersion | null {
  if (!spec || typeof spec !== "object") return null;
  const root = spec as Record<string, unknown>;
  const rawOpenapi = root.openapi;
  const rawSwagger = root.swagger;

  if (typeof rawOpenapi === "string") {
    const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(rawOpenapi.trim());
    if (m) {
      const major = Number(m[1]);
      if (major === 3 || major === 2) {
        return {
          major: major as 2 | 3,
          minor: Number(m[2]),
          patch: m[3] ? Number(m[3]) : 0,
          raw: rawOpenapi.trim(),
        };
      }
    }
  }
  if (typeof rawSwagger === "string") {
    const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(rawSwagger.trim());
    if (m && Number(m[1]) === 2) {
      return {
        major: 2,
        minor: Number(m[2]),
        patch: m[3] ? Number(m[3]) : 0,
        raw: rawSwagger.trim(),
      };
    }
  }
  return null;
}

/** Map an OAS version to its bound JSON-Schema-draft alias. */
export function oasToBoundDraft(v: OasVersion): OasDraftBinding {
  if (v.major === 3 && v.minor >= 1) return "2020-12";
  return "draft-04-extended";
}

// =============================================================================
// 3. Schema-position walker
// =============================================================================

/**
 * Yield every schema-shaped node together with its JSON-pointer. A node is
 * "schema-shaped" if it has any of the JSON-Schema/OAS keywords we use as a
 * heuristic gate (type, properties, items, composition keywords, etc.).
 *
 * Cycle-safe via WeakSet-tracked identity.
 */
function* walkSchemaPositions(
  spec: object
): Generator<{ schema: Record<string, unknown>; pointer: string }> {
  const seen = new WeakSet<object>();

  function* rec(
    node: unknown,
    pointer: string
  ): Generator<{ schema: Record<string, unknown>; pointer: string }> {
    if (!node || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        yield* rec(node[i], `${pointer}/${i}`);
      }
      return;
    }

    const obj = node as Record<string, unknown>;
    if (
      "type" in obj ||
      "properties" in obj ||
      "items" in obj ||
      "allOf" in obj ||
      "oneOf" in obj ||
      "anyOf" in obj ||
      "not" in obj ||
      "enum" in obj ||
      "$ref" in obj ||
      "$dynamicRef" in obj ||
      "$dynamicAnchor" in obj ||
      "$id" in obj ||
      "id" in obj ||
      "if" in obj ||
      "prefixItems" in obj ||
      "unevaluatedProperties" in obj ||
      "unevaluatedItems" in obj ||
      "dependentRequired" in obj ||
      "dependentSchemas" in obj ||
      "contentSchema" in obj ||
      "contentEncoding" in obj ||
      "contentMediaType" in obj ||
      "definitions" in obj ||
      "nullable" in obj ||
      "exclusiveMinimum" in obj ||
      "exclusiveMaximum" in obj ||
      "example" in obj ||
      "examples" in obj
    ) {
      yield { schema: obj, pointer };
    }

    for (const [k, v] of Object.entries(obj)) {
      yield* rec(v, `${pointer}/${escapeJsonPointer(k)}`);
    }
  }

  yield* rec(spec, "");
}

function escapeJsonPointer(s: string): string {
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

// =============================================================================
// 4. Per-pattern accumulators
// =============================================================================

interface Accumulator {
  rfc2_84: Array<{ pointer: string; keyword: string }>;
  rfc2_85_keywords: Array<{ pointer: string; keyword: string }>;
  rfc2_86: Array<{ pointer: string }>;
  rfc2_87: Array<{ pointer: string }>;
  rfc2_88: Array<{ pointer: string; keyword: "exclusiveMinimum" | "exclusiveMaximum" }>;
  rfc2_89: Array<{ pointer: string; keyword: "contentEncoding" | "contentMediaType" }>;
  x1: Array<{ pointer: string }>;
  x2: Array<{ pointer: string }>;
  x3: Array<{ pointer: string }>;
  x5_present: boolean;
  mixed: Array<{ pointer: string }>;
  // CL-24 (Welle D / T-Sentinels): unconstrained multi-type schemas. Distinct
  // from X2 (3.0 type-array-with-null) and X1 (3.1 nullable). Targets the wider
  // case where `type: [...]` is an array of >1 entries WITHOUT a discriminating
  // constraint (oneOf/anyOf-fallback OR per-type keywords). 3.0 case: invalid;
  // 3.1 case: valid but agent/codegen-hostile.
  cl24_30: Array<{ pointer: string; types: string[] }>;
  cl24_31: Array<{ pointer: string; types: string[] }>;
}

function emptyAcc(): Accumulator {
  return {
    rfc2_84: [],
    rfc2_85_keywords: [],
    rfc2_86: [],
    rfc2_87: [],
    rfc2_88: [],
    rfc2_89: [],
    x1: [],
    x2: [],
    x3: [],
    x5_present: false,
    mixed: [],
    cl24_30: [],
    cl24_31: [],
  };
}

function hasNullInTypeArray(t: unknown): boolean {
  return Array.isArray(t) && t.some((entry) => entry === "null");
}

/**
 * CL-24 helper: detect whether a multi-type schema is "unconstrained" — i.e.
 * lacks discriminating keywords that would let codegen / clients route per-type.
 *
 * A multi-type schema is considered constrained when it carries:
 *   - oneOf/anyOf — explicit per-type branches
 *   - allOf — composition that may narrow the type
 *   - per-type keywords like `properties` (object-only) PLUS `items` (array-only)
 *     PLUS `pattern` (string-only) co-existing — i.e. the multi-type is documented
 *     by structural keywords matching each declared type
 *
 * Returns true when the schema is unconstrained (= flag for CL-24).
 */
function isUnconstrainedMultiType(schema: Record<string, unknown>, types: string[]): boolean {
  if (types.length < 2) return false;
  // Branching constructs are sufficient discrimination.
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return false;
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return false;
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) return false;
  // If the multi-type is just X+null (e.g. ["string", "null"]) AND there's
  // at least one type-specific structural keyword, that's the canonical 3.1
  // nullable-form and not what CL-24 targets — skip it.
  const nonNullTypes = types.filter((t) => t !== "null");
  if (nonNullTypes.length < 2) return false;
  return true;
}

// =============================================================================
// 5. Detector entry-point
// =============================================================================

export async function runJsonSchemaDraftDetector(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const findings: DetectorFinding[] = [];
  const version = detectOasVersion(spec);
  if (!version) return findings;
  // Swagger 2.0 / very-old specs are flagged elsewhere (EV-34); this detector
  // only reasons about 3.x.
  if (version.major !== 3) return findings;

  const is30 = version.minor === 0;
  const is31 = version.minor === 1;
  const root = spec as Record<string, unknown>;
  const acc: Accumulator = emptyAcc();

  // --- X5: top-level webhooks in 3.0 ----------------------------------------
  if (is30 && root.webhooks && typeof root.webhooks === "object") {
    acc.x5_present = true;
  }

  // --- explicit jsonSchemaDialect (relevant for RFC2-85) --------------------
  const explicitDialect =
    typeof root.jsonSchemaDialect === "string" && root.jsonSchemaDialect.length > 0;

  // --- walk every schema-shaped node ----------------------------------------
  for (const { schema, pointer } of walkSchemaPositions(spec)) {
    const keys = Object.keys(schema);
    const nullableTrue = schema.nullable === true;
    const typeIsArrayWithNull = hasNullInTypeArray(schema.type);

    // Mixed (error): nullable:true AND type:[..., null] on same node
    if (nullableTrue && typeIsArrayWithNull) {
      acc.mixed.push({ pointer });
    }

    // X1 (warn): nullable:true in 3.1 (deprecated, use type:[x, null])
    if (is31 && nullableTrue) {
      acc.x1.push({ pointer });
    }

    // X2 (error): type:[..., null] array-form in 3.0 (invalid; OAS 3.0 forbids
    // type-array, single-string only)
    if (is30 && typeIsArrayWithNull) {
      acc.x2.push({ pointer });
    }

    // X3 (hint): both example and examples on the same node
    if ("example" in schema && "examples" in schema) {
      acc.x3.push({ pointer });
    }

    // Heuristic: only treat the node as a schema (for keyword-presence
    // checks that risk false-positives on properties/definitions maps) if
    // it has at least one structural-schema keyword.
    const looksLikeSchema =
      "type" in schema ||
      "properties" in schema ||
      "items" in schema ||
      "allOf" in schema ||
      "oneOf" in schema ||
      "anyOf" in schema ||
      "not" in schema ||
      "enum" in schema ||
      "$ref" in schema;

    // Path-context: skip when the parent path-segment is one of the
    // OAS-3 "map of names to schemas" containers — those are not schemas
    // themselves, and key collisions like properties:{id:{...}} would
    // false-positive even with looksLikeSchema gating since maps may contain
    // a key literally named "type" or "properties".
    const inSchemaMap = /\/(properties|definitions|patternProperties|headers|parameters|responses|requestBodies|examples|callbacks|links|securitySchemes|encoding|schemas)$/.test(pointer);
    // Also skip when ANY ancestor segment is a value-position container
    // (examples/example/default/enum/const). Those are user-data, not schemas.
    const inValuePosition = /\/(x-examples?|examples?|default|enum|const)(\/|$)/.test(pointer);

    // RFC2-87 (hint): bare id keyword. Only fire when the node is
    // structurally a schema and not inside a schemas-map container.
    if ("id" in schema && looksLikeSchema && !inSchemaMap && !inValuePosition) {
      acc.rfc2_87.push({ pointer });
    }

    // RFC2-86 (hint): definitions inside a sub-schema. Same gates.
    if ("definitions" in schema && looksLikeSchema && !inSchemaMap && !inValuePosition && pointer !== "") {
      acc.rfc2_86.push({ pointer });
    }

    // RFC2-88 / X4 (error): boolean exclusiveMinimum/Maximum in 3.1
    if (is31) {
      if (typeof schema.exclusiveMinimum === "boolean") {
        acc.rfc2_88.push({ pointer, keyword: "exclusiveMinimum" });
      }
      if (typeof schema.exclusiveMaximum === "boolean") {
        acc.rfc2_88.push({ pointer, keyword: "exclusiveMaximum" });
      }
    }

    // RFC2-89 (hint): contentEncoding/contentMediaType on OAS 3.0
    if (is30) {
      if ("contentEncoding" in schema) {
        acc.rfc2_89.push({ pointer, keyword: "contentEncoding" });
      }
      if ("contentMediaType" in schema) {
        acc.rfc2_89.push({ pointer, keyword: "contentMediaType" });
      }
    }

    // RFC2-84 (error): 2020-12-only keyword in 3.0 (silent-ignore class)
    if (is30) {
      for (const k of keys) {
        if (KEYWORDS_2020_ONLY.has(k)) {
          acc.rfc2_84.push({ pointer, keyword: k });
        }
      }
    }

    // RFC2-85 (hint): 3.1 + 2020-12 keyword + missing explicit jsonSchemaDialect
    if (is31 && !explicitDialect) {
      for (const k of keys) {
        if (KEYWORDS_2020_ONLY.has(k)) {
          acc.rfc2_85_keywords.push({ pointer, keyword: k });
        }
      }
    }

    // CL-24 (Welle D / T-Sentinels): unconstrained multi-type schemas.
    // Distinct from X1/X2/Mixed which target null-handling specifically — CL-24
    // catches the wider class of `type: [stringA, stringB]`-style multi-types
    // that lack discriminating constraints (oneOf/anyOf/allOf). For 3.0 specs
    // this is invalid (3.0 forbids type-array entirely); for 3.1 it's valid but
    // confuses codegen/agents.
    if (Array.isArray(schema.type)) {
      const types = schema.type
        .filter((t): t is string => typeof t === "string");
      if (types.length >= 2 && isUnconstrainedMultiType(schema, types)) {
        if (is30) {
          acc.cl24_30.push({ pointer, types });
        } else if (is31) {
          acc.cl24_31.push({ pointer, types });
        }
      }
    }
  }

  // ===========================================================================
  // Emit one DetectorFinding per fired pattern (aggregated counts).
  // ===========================================================================

  if (acc.rfc2_84.length > 0) {
    const examples = acc.rfc2_84.slice(0, 3);
    const kwList = examples.map((e) => e.keyword).join(", ");
    findings.push({
      detectorId: "module:json-schema-draft-detector:rfc2-84",
      layer: "walker-statistical",
      title: "OpenAPI 3.0 spec uses JSON-Schema 2020-12-only keywords",
      narration:
        `${acc.rfc2_84.length} schema-position(s) declare JSON-Schema-2020-12-only keyword(s) ` +
        `(e.g. ${kwList}) in an OpenAPI 3.0 spec. OpenAPI 3.0 binds JSON-Schema draft-04 ` +
        `(extended); validators silently ignore unsupported keywords, so the intended ` +
        `semantic constraint (e.g. unevaluatedProperties:false to forbid extra properties ` +
        `cross-allOf) is silently dropped at validation time. The server-side AND the spec ` +
        `disagree with the validator understanding of the contract.`,
      rationale:
        "OpenAPI 3.0 4.7.24 binds the schema-object to a JSON-Schema draft-04 subset. " +
        "Keywords introduced in draft-2019-09 / 2020-12 (unevaluatedProperties, " +
        "prefixItems, dependentRequired, dynamicRef, if/then/else, etc.) are not in 3.0 " +
        "and silently no-op in conforming validators. Mining-Round-2 RFC2-84.",
      category: "correctness",
      severity: "high",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Remove the 2020-12-only keywords, OR upgrade the spec to OpenAPI 3.1 (which binds 2020-12).",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        boundDraft: "draft-04-extended",
        offendingKeywords: Array.from(new Set(acc.rfc2_84.map((e) => e.keyword))),
        count: acc.rfc2_84.length,
        examples: examples.map((e) => ({ pointer: e.pointer, keyword: e.keyword })),
      },
    });
  }

  if (acc.rfc2_85_keywords.length > 0) {
    const examples = acc.rfc2_85_keywords.slice(0, 3);
    const kwList = examples.map((e) => e.keyword).join(", ");
    findings.push({
      detectorId: "module:json-schema-draft-detector:rfc2-85",
      layer: "walker-statistical",
      title: "OpenAPI 3.1 uses 2020-12 keywords without explicit jsonSchemaDialect",
      narration:
        `${acc.rfc2_85_keywords.length} schema-position(s) use 2020-12-keyword(s) ` +
        `(e.g. ${kwList}) but the spec root does not declare jsonSchemaDialect explicitly. ` +
        `OAS 3.1 defaults the dialect to https://spec.openapis.org/oas/3.1/dialect/base ` +
        `(2020-12), so today this is correct — but readers / consumers are left to infer ` +
        `the dialect. Declaring it explicitly removes ambiguity for codegen tooling and ` +
        `future-proofs the spec against dialect-change.`,
      rationale:
        "OpenAPI 3.1 4.7.1 makes jsonSchemaDialect an OPTIONAL field that defaults to " +
        "the 2020-12-base dialect when omitted. Mining-Round-2 RFC2-85 recommends explicit " +
        "declaration whenever 2020-12-only keywords are used.",
      category: "clarity",
      severity: "low",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Add jsonSchemaDialect: https://spec.openapis.org/oas/3.1/dialect/base to the spec root.",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        offendingKeywords: Array.from(new Set(acc.rfc2_85_keywords.map((e) => e.keyword))),
        count: acc.rfc2_85_keywords.length,
        examples: examples.map((e) => ({ pointer: e.pointer, keyword: e.keyword })),
      },
    });
  }

  if (acc.rfc2_86.length > 0) {
    const examples = acc.rfc2_86.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:rfc2-86",
      layer: "walker-statistical",
      title: "definitions keyword inside a sub-schema (porting smell)",
      narration:
        `${acc.rfc2_86.length} schema-position(s) declare a definitions keyword inside ` +
        `a sub-schema. OpenAPI uses components.schemas at the spec-root level for reusable ` +
        `schemas — sub-schema definitions is a draft-04 keyword that survives legacy spec ` +
        `conversions. In 2019-09+ it was renamed to dollar-defs; in OAS-context it has no ` +
        `defined meaning and is a porting smell.`,
      rationale:
        "JSON-Schema 2019-09 changelog: dollar-defs replaces definitions. OpenAPI uses " +
        "components.schemas at the root level, never definitions in sub-schemas. " +
        "Mining-Round-2 RFC2-86.",
      category: "design",
      severity: "low",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Move definitions entries into components.schemas; reference them via dollar-ref.",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        count: acc.rfc2_86.length,
        examples: examples.map((e) => e.pointer),
      },
    });
  }

  if (acc.rfc2_87.length > 0) {
    const examples = acc.rfc2_87.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:rfc2-87",
      layer: "walker-statistical",
      title: "id keyword (no dollar prefix) in schema (porting smell)",
      narration:
        `${acc.rfc2_87.length} schema-position(s) declare bare id (no dollar prefix). ` +
        `In draft-06+ this keyword was renamed to dollar-id; bare id is a draft-04-era ` +
        `artifact that survives legacy spec conversions. In OpenAPI specs, neither form ` +
        `is needed — components.schemas provides the same identity.`,
      rationale:
        "JSON-Schema draft-06 changelog: dollar-id replaces id. Mining-Round-2 RFC2-87.",
      category: "design",
      severity: "low",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Remove id (or rename to dollar-id if a JSON-Schema identity is actually needed).",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        count: acc.rfc2_87.length,
        examples: examples.map((e) => e.pointer),
      },
    });
  }

  if (acc.rfc2_88.length > 0) {
    const examples = acc.rfc2_88.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:rfc2-88-x4",
      layer: "walker-statistical",
      title: "Boolean exclusiveMinimum/Maximum in OpenAPI 3.1 (invalid in 2020-12)",
      narration:
        `${acc.rfc2_88.length} schema-position(s) declare boolean ` +
        `${examples[0]?.keyword ?? "exclusiveMinimum"} in an OpenAPI 3.1 spec. In ` +
        `draft-04 the keyword took a boolean (paired with minimum/maximum); from draft-06 ` +
        `onward (and thus 2020-12 / OAS 3.1) it takes a NUMBER value directly and the ` +
        `original minimum/maximum is unnecessary. Validators bound to 2020-12 will either ` +
        `reject the boolean form OR silently re-interpret it, leading to either spec-load ` +
        `failure OR semantic drift.`,
      rationale:
        "JSON-Schema 2019-09+ removed the boolean form of exclusiveMinimum/exclusiveMaximum. " +
        "OAS 3.1 binds 2020-12. Mining-Round-2 RFC2-88 / apiq X4.",
      category: "correctness",
      severity: "high",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Replace { minimum: X, exclusiveMinimum: true } with { exclusiveMinimum: X }; same for maximum.",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        count: acc.rfc2_88.length,
        examples: examples.map((e) => ({ pointer: e.pointer, keyword: e.keyword })),
      },
    });
  }

  if (acc.rfc2_89.length > 0) {
    const examples = acc.rfc2_89.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:rfc2-89",
      layer: "walker-statistical",
      title: "contentEncoding/contentMediaType on OpenAPI 3.0 schema (mostly ignored)",
      narration:
        `${acc.rfc2_89.length} schema-position(s) declare contentEncoding or contentMediaType ` +
        `in an OpenAPI 3.0 spec. These are draft-07 keywords; OAS 3.0 binds draft-04, so ` +
        `most validators silent-ignore them. Effect: the keyword documents intent (e.g. ` +
        `base64-encoded blob) but does NOT validate.`,
      rationale:
        "JSON-Schema draft-07 8 introduced contentEncoding/contentMediaType. OAS 3.0 " +
        "is bound to draft-04 (no draft-07 keyword set). Mining-Round-2 RFC2-89.",
      category: "design",
      severity: "low",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Move the field to a multipart/form-data body with encoding declared at content-level, OR upgrade to OpenAPI 3.1.",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        count: acc.rfc2_89.length,
        examples: examples.map((e) => ({ pointer: e.pointer, keyword: e.keyword })),
      },
    });
  }

  if (acc.x1.length > 0) {
    const examples = acc.x1.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:x1",
      layer: "walker-statistical",
      title: "nullable:true in OpenAPI 3.1 (deprecated)",
      narration:
        `${acc.x1.length} schema-position(s) use nullable:true in an OpenAPI 3.1 spec. ` +
        `nullable is an OpenAPI 3.0 extension to draft-04; in 3.1 the canonical way to ` +
        `express null-acceptance is the JSON-Schema-2020-12 type-array form (e.g. ` +
        `type: [string, null]). nullable:true still works for backwards-compat but is ` +
        `deprecated and confuses 2020-12-aware tooling.`,
      rationale:
        "OAS 3.1 binds 2020-12 which supports type-as-array. Mining-Round-2 apiq X1.",
      category: "design",
      severity: "medium",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Replace { type: X, nullable: true } with { type: [X, null] }.",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        count: acc.x1.length,
        examples: examples.map((e) => e.pointer),
      },
    });
  }

  if (acc.x2.length > 0) {
    const examples = acc.x2.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:x2",
      layer: "walker-statistical",
      title: "Type-array form type:[..., null] in OpenAPI 3.0 (invalid)",
      narration:
        `${acc.x2.length} schema-position(s) use the type-array form (e.g. ` +
        `type: [string, null]) in an OpenAPI 3.0 spec. OAS 3.0 binds draft-04 which only ` +
        `allows a SINGLE type-string; the type-array form is invalid 3.0 syntax. The 3.0 ` +
        `way to express null-acceptance is { type: X, nullable: true }.`,
      rationale:
        "OAS 3.0 4.7.24: schema type is a single string in draft-04. Mining-Round-2 apiq X2.",
      category: "correctness",
      severity: "high",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Replace { type: [X, null] } with { type: X, nullable: true }, OR upgrade to OpenAPI 3.1.",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        count: acc.x2.length,
        examples: examples.map((e) => e.pointer),
      },
    });
  }

  if (acc.x3.length > 0) {
    const examples = acc.x3.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:x3",
      layer: "walker-statistical",
      title: "example (singular) AND examples (plural) on the same schema-node",
      narration:
        `${acc.x3.length} schema-position(s) declare BOTH example and examples on the ` +
        `same node. example is the OAS-3 singular form; examples is the JSON-Schema 2020-12 ` +
        `plural form. Tooling behaviour when both are present is inconsistent: some pick ` +
        `example, some pick examples[0], some merge. Pick one.`,
      rationale: "Mining-Round-2 apiq X3.",
      category: "design",
      severity: "low",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Drop one of the two — prefer example in OAS 3.0 schemas, prefer examples in OAS 3.1 schemas.",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        count: acc.x3.length,
        examples: examples.map((e) => e.pointer),
      },
    });
  }

  if (acc.x5_present) {
    findings.push({
      detectorId: "module:json-schema-draft-detector:x5",
      layer: "walker-statistical",
      title: "Top-level webhooks section declared in OpenAPI 3.0",
      narration:
        `The spec declares a top-level webhooks section but the OAS version is ${version.raw}. ` +
        `webhooks was added in OpenAPI 3.1 — under 3.0 the field is not recognised, so the ` +
        `entire webhooks declaration is invisible to conforming validators / codegen / docs-tooling.`,
      rationale: "OAS 3.1 4.8.2 introduces webhooks. Mining-Round-2 apiq X5.",
      category: "correctness",
      severity: "high",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Move webhook-style operations into paths as callbacks, OR upgrade to OpenAPI 3.1.",
      sourcePath: "/webhooks",
      meta: { version: version.raw },
    });
  }

  if (acc.cl24_30.length > 0) {
    const examples = acc.cl24_30.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:cl-24-30",
      layer: "walker-statistical",
      title: "Unconstrained multi-type schema in OpenAPI 3.0 (invalid)",
      narration:
        `${acc.cl24_30.length} schema-position(s) declare an unconstrained multi-type ` +
        `(e.g. type: [${examples[0]?.types.join(", ") ?? "string, integer"}]) in an OpenAPI 3.0 spec. ` +
        `OAS 3.0 binds JSON-Schema draft-04, which only allows a single type-string — the ` +
        `multi-type form is invalid 3.0 syntax AND lacks the oneOf/anyOf branches that would ` +
        `let codegen/clients route per-type. Validators may reject the spec entirely, accept it ` +
        `silently, or pick one type at random.`,
      rationale:
        "OAS 3.0 4.7.24: schema type is a single string in draft-04. Multi-type without " +
        "discriminating oneOf/anyOf is doubly broken under 3.0. CL-24 (Round-2 mining, " +
        "client-DX-friction lens).",
      category: "correctness",
      severity: "high",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Replace the multi-type with explicit oneOf/anyOf branches per type, OR pick a single " +
        "type. If null-acceptance was intended, use `nullable: true` in 3.0.",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        patternId: "CL-24",
        count: acc.cl24_30.length,
        examples: examples.map((e) => ({ pointer: e.pointer, types: e.types })),
      },
    });
  }

  if (acc.cl24_31.length > 0) {
    const examples = acc.cl24_31.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:cl-24-31",
      layer: "walker-statistical",
      title: "Unconstrained multi-type schema in OpenAPI 3.1 (codegen-hostile)",
      narration:
        `${acc.cl24_31.length} schema-position(s) declare a multi-type (e.g. ` +
        `type: [${examples[0]?.types.join(", ") ?? "string, integer"}]) in an OpenAPI 3.1 spec ` +
        `WITHOUT discriminating oneOf/anyOf branches. While valid under 2020-12, codegen ` +
        `tooling collapses the multi-type to a union (TypeScript: \`string | integer\`; Java/Go ` +
        `often Object), losing per-type validation guidance. AI-agent consumers cannot reason ` +
        `about which type to use under what conditions.`,
      rationale:
        "JSON-Schema 2020-12 supports type-array, but multi-types without per-type schemas " +
        "(oneOf/anyOf branches OR per-type structural keywords) are agent/codegen-hostile. " +
        "CL-24 (Round-2 mining).",
      category: "design",
      severity: "low",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Refactor to explicit `oneOf` branches with per-type schemas, OR pick a single type. " +
        "If the multi-type was just for null-acceptance (e.g. type: [string, null]), that's " +
        "the canonical 3.1 nullable form and is not what this rule targets.",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        patternId: "CL-24",
        agentReadinessImpact: "medium",
        count: acc.cl24_31.length,
        examples: examples.map((e) => ({ pointer: e.pointer, types: e.types })),
      },
    });
  }

  if (acc.mixed.length > 0) {
    const examples = acc.mixed.slice(0, 3);
    findings.push({
      detectorId: "module:json-schema-draft-detector:mixed-nullable",
      layer: "walker-statistical",
      title: "Mixed-draft signal: nullable:true AND type:[..., null] on same node",
      narration:
        `${acc.mixed.length} schema-position(s) declare BOTH the OAS-3.0 nullable:true AND ` +
        `the JSON-Schema-2020-12 type:[..., null] form. This is a contradictory mixed-draft ` +
        `signal — the spec is internally inconsistent about which JSON-Schema dialect it ` +
        `targets, and validators handle the combination differently. Pick one form per node.`,
      rationale:
        "Same node cannot simultaneously target draft-04 (nullable) and 2020-12 (type-array) " +
        "semantics. Mining-Round-2 mixed-draft criterion.",
      category: "correctness",
      severity: "high",
      scope: "spec",
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        "Drop either nullable (if targeting OAS 3.1) OR remove null from the type-array (if targeting OAS 3.0).",
      sourcePath: examples[0]?.pointer,
      meta: {
        version: version.raw,
        count: acc.mixed.length,
        examples: examples.map((e) => e.pointer),
      },
    });
  }

  return findings;
}

// =============================================================================
// 6. CLI — runs the detector against a single spec from openapi-examples.
// =============================================================================

async function main(): Promise<void> {
  const path = await import("node:path");
  const fs = await import("node:fs");
  const { fileURLToPath } = await import("node:url");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const SPIKE_DIR = path.resolve(__dirname, "..");
  const REPO_ROOT = path.resolve(SPIKE_DIR, "..", "..");
  const EXAMPLES_DIR = path.join(REPO_ROOT, "openapi-examples");

  const specName = process.argv[2];
  if (!specName) {
    console.error("Usage: tsx deterministic/json-schema-draft-detector.ts <spec-name>");
    console.error("  e.g. tsx deterministic/json-schema-draft-detector.ts stripe-full");
    process.exit(1);
  }

  const specDir = path.join(EXAMPLES_DIR, specName);
  if (!fs.existsSync(specDir)) {
    console.error(`Spec directory not found: ${specDir}`);
    process.exit(1);
  }

  let specPath: string | null = null;
  for (const ext of ["json", "yaml", "yml"]) {
    const candidate = path.join(specDir, `spec.${ext}`);
    if (fs.existsSync(candidate)) {
      specPath = candidate;
      break;
    }
  }
  if (!specPath) {
    console.error(`No spec.{json,yaml,yml} found in ${specDir}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(specPath, "utf8");
  let spec: object;
  if (specPath.endsWith(".json")) {
    spec = JSON.parse(raw);
  } else {
    const YAML = (await import("yaml")).default;
    spec = YAML.parse(raw) as object;
  }

  const version = detectOasVersion(spec);
  console.log(`Loaded spec: ${specPath}`);
  console.log(`Detected OAS version: ${version?.raw ?? "(none)"}`);
  console.log("");

  const startedAt = Date.now();
  const findings = await runJsonSchemaDraftDetector(spec, { specName });
  const durationMs = Date.now() - startedAt;

  console.log(`json-schema-draft-detector: ${findings.length} findings (${durationMs}ms)`);
  console.log("");
  if (findings.length === 0) {
    console.log("(No draft-mismatch findings.)");
    return;
  }
  for (const f of findings) {
    console.log(`[${f.detectorId}] severity=${f.severity}`);
    console.log(`  title: ${f.title}`);
    if (f.meta) {
      console.log(`  meta:  ${JSON.stringify(f.meta)}`);
    }
    console.log("");
  }
}

// Cross-platform-safe entry-point guard
{
  const { pathToFileURL } = await import("node:url");
  if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
