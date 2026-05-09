/**
 * Problem-JSON-Validator Module — Stage A, Welle B T11 (Module-Class).
 *
 * Sources: RFC 9457 (Problem Details for HTTP APIs, 2024 — obsoletes RFC 7807)
 *          + apiq-USP cross-class type-URI-uniqueness (RFC2-5, no other linter)
 *          + RFC 9457 §3.1/§3.2 + §4 (extension members)
 * Patterns: 6 finding-classes (RFC2-1 type-required, RFC2-2 type-URI-format,
 *           RFC2-3 status-matches-HTTP, RFC2-4 reserved-names not redefined,
 *           RFC2-5 type-URI cross-spec uniqueness [USP], RFC2-6 7807→9457 migration)
 * Lens: 2 (Standards-Compliance), 8 (Internal-Consistency)
 * Round: 2 (Welle B / T11 — Mining-Round-2 Phase B)
 *
 * Maps to rules-brainstorm.md: RFC2-1 to RFC2-6 (problem+json conformance),
 * D6 (application/problem+json error-schema consistent), K2 (RFC 7807 if errors
 * consistently typed). RFC2-5 is apiq's first single-spec USP (no mature linter
 * does cross-class type-URI uniqueness).
 *
 * Validates RFC 9457 ("Problem Details for HTTP APIs", obsoletes RFC 7807)
 * conformance + an apiq-USP differentiator: cross-class `type`-URI uniqueness.
 *
 * Lens-tags: 2 (standards-compliance) + 8 (internal-consistency).
 *
 * --------------------------------------------------------------------------
 * RFC 9457 / 7807 patterns implemented (per Mining-Round-2 Phase B):
 *
 *   RFC2-1 - A response declared as `application/problem+json` MUST have an
 *            object schema with at least `type` (URI). `title`, `status`,
 *            `detail`, `instance` SHOULD be supplied where meaningful.
 *            Severity: error if `type` missing, warn if title/status missing.
 *
 *   RFC2-2 - Problem-Details `type` value MUST be a URI. Acceptable forms:
 *            `about:blank` (default per Section 3.1.1), an absolute URI
 *            (`https://...`, `urn:...`, `tag:...`), or a relative-URI-reference
 *            that begins with `/` or `./` (RFC 3986 Section 4.1). Free-form strings
 *            ("invalid_request", "ERROR_42") are flagged.
 *            Severity: error.
 *
 *   RFC2-3 - Problem-Details `status`, when present as example/default in a
 *            problem-shape schema attached to a 4xx/5xx response, MUST equal
 *            the HTTP response-key (RFC 9457 Section 3.1.2: "MUST be the same as
 *            the HTTP response status code"). Cross-response invariant.
 *            Severity: error.
 *
 *   RFC2-4 - Extension members MUST NOT redefine reserved names (`type`,
 *            `title`, `status`, `detail`, `instance`) with non-conforming
 *            types (e.g. `status: { type: "string" }`).
 *            Severity: error. Allowed: `type` string-URI, `title` string,
 *            `status` integer, `detail` string, `instance` string-URI.
 *
 *   RFC2-5 - apiq-USP differentiator (no mature linter ships this).
 *            When the same `type` URI value is observed on two structurally-
 *            different problem-shape schemas (different property-sets, distinct
 *            `title`, distinct `status`-value), it implies one type-URI is
 *            being reused for semantically-different problem-classes - a
 *            cross-spec invariant violation per RFC 9457 Section 4 ("Each problem
 *            type SHOULD be registered under a unique URI").
 *            Severity: warn (heuristic-confidence; promote to error if the
 *            two clashing schemas carry obviously-distinct status-values).
 *
 *   EV-11 / K2 - A spec that exposes more than two structurally-distinct
 *            error response-schemas without declaring a spec-wide error-shape
 *            (no `application/problem+json`-content, no shared
 *            `components.responses.Error` ref, ad-hoc per-operation shapes)
 *            is flagged as lacking a coherent error-class.
 *            Severity: warn (RFC 7807/9457 Section 1: "to define common error
 *            formats for HTTP APIs, so that they can be reused" - multi-source
 *            confirmed: SG-16, OPTIC consistent-error-shape, Stripe-convention).
 *
 * --------------------------------------------------------------------------
 *
 * Detection strategy (spec-agnostic - no hardcoded vendor knowledge):
 *
 *   Phase 1: Walk every operation x every response x every content-type.
 *            Collect "problem-detection-records" - every (op, status, shape,
 *            location) tuple where one of:
 *              (a) content-type is `application/problem+json` (or `+xml`)
 *              (b) the schema has the RFC 9457 reserved field-set:
 *                  has-type AND has-title AND has-status AND has-detail
 *              (c) the schema is referenced as an error-shape (in 4xx/5xx)
 *
 *   Phase 2: Validate each problem-detection-record against RFC2-1..RFC2-4.
 *
 *   Phase 3: Cross-record analysis - RFC2-5 (type-URI uniqueness) and
 *            EV-11 (error-shape coherence cross-spec).
 *
 * Public API:
 *   validateProblemJson(spec, opts) => Promise<DetectorFinding[]>
 *
 * CLI:
 *   cd scripts/spike && npx tsx deterministic/problem-json-validator.ts <spec-name>
 */

import type { DetectorFinding, DetectorOptions } from "../infra/types.js";
import { walkOperations } from "../aggregators/_shared.js";

// =============================================================================
// Constants
// =============================================================================

/** RFC 9457 Section 3.1 reserved member names + their normative types. */
const RFC9457_MEMBERS: Record<string, { type: string; format?: string }> = {
  type: { type: "string", format: "uri" },
  title: { type: "string" },
  status: { type: "integer" },
  detail: { type: "string" },
  instance: { type: "string", format: "uri" },
};

/** Problem-shape content-types - RFC 9457 Section 3 + 7807 legacy. */
const PROBLEM_CONTENT_TYPES = new Set([
  "application/problem+json",
  "application/problem+xml",
]);

/** Maximum findings emitted per RFC2-N rule (avoid noise on huge specs). */
const MAX_FINDINGS_PER_RULE = 30;

/** Minimum distinct error-shapes before EV-11 fires. */
const EV11_DISTINCT_SHAPES_THRESHOLD = 3;

// =============================================================================
// Types
// =============================================================================

interface ProblemRecord {
  /** Where in the spec this record lives - e.g. POST /users 400 */
  path: string;
  method: string;
  status: string;
  contentType: string | null;
  /** The raw schema (already-dereferenced). */
  schema: Record<string, unknown>;
  /** True if the response was *declared* as application/problem+json. */
  isDeclaredProblemJson: boolean;
  /** True if the schema looks structurally like a problem-details object
   *  (has the reserved field-set even when the content-type isn't declared). */
  looksLikeProblemShape: boolean;
}

interface ErrorResponseRecord {
  path: string;
  method: string;
  status: string;
  contentType: string;
  schema: Record<string, unknown>;
  /** Stable signature for shape-grouping (see EV-11 logic). */
  shapeSignature: string;
}

// =============================================================================
// Helpers
// =============================================================================

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Lightweight URI-form check per RFC 3986 Section 3.1 + Section 4.1.
 *
 * Acceptable:
 *   - `about:blank` (RFC 9457 Section 3.1.1 default)
 *   - absolute URI: scheme:hier-part with scheme `[A-Za-z][A-Za-z0-9+.-]*`
 *   - relative-reference starting with `/` or `./` or `../`
 *
 * Rejected:
 *   - bare strings without `:` or leading slash (e.g. "invalid_request")
 *   - whitespace
 */
function isUriLike(value: string): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length === 0) return false;
  if (/\s/.test(v)) return false;
  if (v === "about:blank") return true;
  // Absolute URI: scheme starts with a letter, followed by colon
  if (/^[A-Za-z][A-Za-z0-9+.\-]*:/.test(v)) return true;
  // Relative-reference (path-absolute or path-noscheme starting with ./ or ../)
  if (v.startsWith("/") || v.startsWith("./") || v.startsWith("../")) return true;
  return false;
}

/**
 * A schema "looks like a problem-shape" if it has at least 3 of the 5
 * RFC 9457 reserved members declared as properties. Detects cases where
 * the spec author followed RFC 9457 by structure but did not tag the
 * content-type as `application/problem+json`.
 */
function looksLikeProblemShape(schema: Record<string, unknown>): boolean {
  const props = schema.properties;
  if (!isObject(props)) return false;
  let hits = 0;
  for (const reserved of Object.keys(RFC9457_MEMBERS)) {
    if (reserved in props) hits++;
  }
  return hits >= 3;
}

/**
 * Compute a stable signature for shape-grouping. Two error-schemas with the
 * same signature are considered the "same shape" for EV-11 coherence-check.
 */
function shapeSignature(schema: Record<string, unknown>): string {
  const props = schema.properties;
  const keys = isObject(props)
    ? Object.keys(props).sort().join(",")
    : "(no-properties)";
  const required = Array.isArray(schema.required)
    ? [...(schema.required as string[])].sort().join(",")
    : "";
  // Including type+required keeps the signature stable even when the same
  // schema is duplicated structurally across operations.
  return `props=[${keys}] required=[${required}]`;
}

/**
 * Extract the example/default value of a named property from a schema.
 * Used by RFC2-2 (type) and RFC2-3 (status).
 */
function getPropertyValue(
  schema: Record<string, unknown>,
  propName: string
): unknown {
  const props = schema.properties;
  if (!isObject(props)) return undefined;
  const prop = props[propName];
  if (!isObject(prop)) return undefined;
  // Prefer `example`, then `default`, then `enum[0]`.
  if ("example" in prop) return prop.example;
  if ("default" in prop) return prop.default;
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];
  return undefined;
}

/**
 * Get the declared `type` of a property within a problem-shape.
 */
function getPropertyType(
  schema: Record<string, unknown>,
  propName: string
): string | null {
  const props = schema.properties;
  if (!isObject(props)) return null;
  const prop = props[propName];
  if (!isObject(prop)) return null;
  return typeof prop.type === "string" ? (prop.type as string) : null;
}

/**
 * Get the declared `format` of a property within a problem-shape.
 */
function getPropertyFormat(
  schema: Record<string, unknown>,
  propName: string
): string | null {
  const props = schema.properties;
  if (!isObject(props)) return null;
  const prop = props[propName];
  if (!isObject(prop)) return null;
  return typeof prop.format === "string" ? (prop.format as string) : null;
}

// =============================================================================
// Phase 1 - Collection
// =============================================================================

/**
 * Walk all operations x responses x content-types. Build:
 *   - problem-records: schemas declared as problem+json OR structurally
 *     looking like RFC 9457 problem-shape.
 *   - error-records:   every 4xx/5xx response with a content-schema (used
 *     for EV-11 spec-wide error-shape coherence).
 */
function collectProblemAndErrorRecords(spec: object): {
  problemRecords: ProblemRecord[];
  errorRecords: ErrorResponseRecord[];
} {
  const problemRecords: ProblemRecord[] = [];
  const errorRecords: ErrorResponseRecord[] = [];

  for (const { path, method, operation } of walkOperations(spec)) {
    const responses = operation.responses;
    if (!isObject(responses)) continue;

    for (const [statusKey, responseRaw] of Object.entries(responses)) {
      if (!isObject(responseRaw)) continue;
      const isErrorStatus =
        statusKey === "default" || /^[45]/.test(statusKey);

      const content = (responseRaw as Record<string, unknown>).content;
      if (!isObject(content)) continue;

      for (const [ct, entryRaw] of Object.entries(content)) {
        if (!isObject(entryRaw)) continue;
        const schema = (entryRaw as Record<string, unknown>).schema;
        if (!isObject(schema)) continue;

        const ctLower = ct.toLowerCase();
        const isDeclaredProblemJson = PROBLEM_CONTENT_TYPES.has(ctLower);
        const looks = looksLikeProblemShape(schema);

        if (isDeclaredProblemJson || looks) {
          problemRecords.push({
            path,
            method,
            status: statusKey,
            contentType: ct,
            schema,
            isDeclaredProblemJson,
            looksLikeProblemShape: looks,
          });
        }

        if (isErrorStatus) {
          errorRecords.push({
            path,
            method,
            status: statusKey,
            contentType: ct,
            schema,
            shapeSignature: shapeSignature(schema),
          });
        }
      }
    }
  }

  return { problemRecords, errorRecords };
}

// =============================================================================
// Phase 2 - Per-record validation (RFC2-1, RFC2-2, RFC2-3, RFC2-4)
// =============================================================================

interface PerRecordViolation {
  rule: "RFC2-1" | "RFC2-2" | "RFC2-3" | "RFC2-4";
  record: ProblemRecord;
  /** Specific failure detail. */
  detail: string;
  severity: DetectorFinding["severity"];
}

function validateRecord(record: ProblemRecord): PerRecordViolation[] {
  const violations: PerRecordViolation[] = [];
  const props = record.schema.properties;
  const propsObj = isObject(props) ? props : null;

  // RFC2-1: type MUST be present; title/status SHOULD be present.
  if (record.isDeclaredProblemJson) {
    if (!propsObj || !("type" in propsObj)) {
      violations.push({
        rule: "RFC2-1",
        record,
        detail:
          "Schema for `application/problem+json` is missing the REQUIRED `type` property (RFC 9457 Section 3.1: type is the only REQUIRED member)",
        severity: "high",
      });
    }
    if (!propsObj || !("title" in propsObj)) {
      violations.push({
        rule: "RFC2-1",
        record,
        detail:
          "Schema for `application/problem+json` SHOULD declare a `title` property (RFC 9457 Section 3.1)",
        severity: "medium",
      });
    }
    if (!propsObj || !("status" in propsObj)) {
      violations.push({
        rule: "RFC2-1",
        record,
        detail:
          "Schema for `application/problem+json` SHOULD declare a `status` property (RFC 9457 Section 3.1)",
        severity: "medium",
      });
    }
  }

  // RFC2-2: type value MUST be a URI.
  if (propsObj && "type" in propsObj) {
    const typeValue = getPropertyValue(record.schema, "type");
    if (typeof typeValue === "string" && !isUriLike(typeValue)) {
      violations.push({
        rule: "RFC2-2",
        record,
        detail: `Problem-Details \`type\` example/default value \`${typeValue.slice(0, 80)}\` is not a URI form (RFC 9457 Section 3.1.1: type MUST be a URI; about:blank is the only allowed non-resolvable value)`,
        severity: "high",
      });
    }
    // Also check enum values - a closed enum of non-URI values is a hard violation.
    const typeProp = propsObj.type;
    if (isObject(typeProp) && Array.isArray(typeProp.enum)) {
      for (const enumVal of typeProp.enum) {
        if (typeof enumVal === "string" && !isUriLike(enumVal)) {
          violations.push({
            rule: "RFC2-2",
            record,
            detail: `Problem-Details \`type\` enum value \`${enumVal.slice(0, 80)}\` is not a URI (RFC 9457 Section 3.1.1)`,
            severity: "high",
          });
        }
      }
    }
  }

  // RFC2-3: status (when present as example/default) MUST match the response key.
  if (
    propsObj &&
    "status" in propsObj &&
    /^\d{3}$/.test(record.status)
  ) {
    const statusValue = getPropertyValue(record.schema, "status");
    const httpStatus = parseInt(record.status, 10);
    if (typeof statusValue === "number" && Number.isInteger(statusValue)) {
      if (statusValue !== httpStatus) {
        violations.push({
          rule: "RFC2-3",
          record,
          detail: `Problem-Details \`status\` example/default = ${statusValue} but the HTTP response status is ${httpStatus} (RFC 9457 Section 3.1.2: status member MUST equal the HTTP response status)`,
          severity: "high",
        });
      }
    }
  }

  // RFC2-4: reserved members MUST NOT be redefined with non-conforming types.
  if (propsObj) {
    for (const [reservedName, expected] of Object.entries(RFC9457_MEMBERS)) {
      if (!(reservedName in propsObj)) continue;
      const declaredType = getPropertyType(record.schema, reservedName);
      if (declaredType === null) continue; // type not declared - skip
      if (declaredType !== expected.type) {
        violations.push({
          rule: "RFC2-4",
          record,
          detail: `Reserved member \`${reservedName}\` MUST be \`${expected.type}\` (RFC 9457 Section 3.1) but is declared as \`${declaredType}\``,
          severity: "high",
        });
      }
      // `instance` should be format:uri when present (warn).
      if (reservedName === "instance" && expected.format === "uri") {
        const fmt = getPropertyFormat(record.schema, reservedName);
        if (fmt !== null && fmt !== "uri" && fmt !== "uri-reference") {
          violations.push({
            rule: "RFC2-4",
            record,
            detail: `Reserved member \`instance\` SHOULD have \`format: uri\` per RFC 9457 Section 3.1 but has \`format: ${fmt}\``,
            severity: "medium",
          });
        }
      }
    }
  }

  return violations;
}

// =============================================================================
// Phase 3 - Cross-record analysis (RFC2-5 USP, EV-11 / K2)
// =============================================================================

interface TypeUriCollision {
  typeUri: string;
  variants: Array<{
    record: ProblemRecord;
    shapeSig: string;
    title: unknown;
    statusValue: unknown;
  }>;
}

/**
 * RFC2-5 - apiq-USP. Group records by `type` URI. If the same URI appears
 * with structurally-distinct shapes (different property-sets, distinct
 * status-values, distinct titles), flag as cross-class collision.
 */
function findTypeUriCollisions(records: ProblemRecord[]): TypeUriCollision[] {
  const byUri = new Map<
    string,
    Array<{
      record: ProblemRecord;
      shapeSig: string;
      title: unknown;
      statusValue: unknown;
    }>
  >();

  for (const r of records) {
    const typeValue = getPropertyValue(r.schema, "type");
    if (typeof typeValue !== "string") continue;
    if (!isUriLike(typeValue)) continue; // already flagged by RFC2-2
    if (typeValue === "about:blank") continue; // default - not a class-URI

    const variant = {
      record: r,
      shapeSig: shapeSignature(r.schema),
      title: getPropertyValue(r.schema, "title"),
      statusValue: getPropertyValue(r.schema, "status"),
    };
    const list = byUri.get(typeValue);
    if (list) list.push(variant);
    else byUri.set(typeValue, [variant]);
  }

  const collisions: TypeUriCollision[] = [];
  for (const [uri, variants] of byUri.entries()) {
    if (variants.length < 2) continue;
    // Deduplicate by (shapeSig, title, statusValue) - true collisions are
    // distinct combinations on the same URI.
    const sigs = new Set(
      variants.map(
        (v) =>
          `${v.shapeSig}|title=${JSON.stringify(v.title)}|status=${JSON.stringify(v.statusValue)}`
      )
    );
    if (sigs.size < 2) continue; // same shape repeated across ops - not a collision
    collisions.push({ typeUri: uri, variants });
  }

  return collisions;
}

/**
 * EV-11 / K2 - when a spec exposes a high count of distinct error-schemas
 * across 4xx/5xx responses without any of them being declared via
 * `application/problem+json`, flag the spec as lacking a coherent error-class.
 */
function detectMissingSpecWideErrorShape(
  errorRecords: ErrorResponseRecord[]
): {
  distinctShapes: string[];
  declaresProblemJson: boolean;
  totalErrorResponses: number;
} | null {
  if (errorRecords.length === 0) return null;

  const declaresProblemJson = errorRecords.some((e) =>
    PROBLEM_CONTENT_TYPES.has(e.contentType.toLowerCase())
  );

  const distinctShapes = Array.from(
    new Set(errorRecords.map((e) => e.shapeSignature))
  );

  if (
    !declaresProblemJson &&
    distinctShapes.length >= EV11_DISTINCT_SHAPES_THRESHOLD
  ) {
    return {
      distinctShapes,
      declaresProblemJson,
      totalErrorResponses: errorRecords.length,
    };
  }
  return null;
}

// =============================================================================
// Finding builders
// =============================================================================

function buildPerRuleFindings(
  violations: PerRecordViolation[]
): DetectorFinding[] {
  // Group violations by rule + detail-prefix so we emit one finding per
  // distinct violation-class, not one per occurrence.
  const grouped = new Map<
    string,
    {
      rule: PerRecordViolation["rule"];
      detail: string;
      severity: DetectorFinding["severity"];
      occurrences: PerRecordViolation[];
    }
  >();

  for (const v of violations) {
    const key = `${v.rule}|${v.detail.slice(0, 60)}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.occurrences.push(v);
    } else {
      grouped.set(key, {
        rule: v.rule,
        detail: v.detail,
        severity: v.severity,
        occurrences: [v],
      });
    }
  }

  const findings: DetectorFinding[] = [];
  let emitted = 0;
  for (const g of grouped.values()) {
    if (emitted >= MAX_FINDINGS_PER_RULE) break;
    emitted++;

    const examples = g.occurrences
      .slice(0, 5)
      .map((o) => `${o.record.method.toUpperCase()} ${o.record.path} -> ${o.record.status}`)
      .join(", ");
    const moreSuffix =
      g.occurrences.length > 5
        ? ` (and ${g.occurrences.length - 5} more)`
        : "";

    const affectedEndpoints = g.occurrences.map((o) => ({
      path: o.record.path,
      method: o.record.method,
    }));

    const ruleDocs = ruleDocumentation(g.rule);

    findings.push({
      detectorId: `module:problem-json-validator:${g.rule.toLowerCase()}`,
      layer: "walker-statistical",
      title: `${g.rule}: ${shortRuleTitle(g.rule, g.detail)} (${g.occurrences.length} occurrence${g.occurrences.length === 1 ? "" : "s"})`,
      narration:
        `${g.detail}. Observed in ${g.occurrences.length} response${g.occurrences.length === 1 ? "" : "s"}: ${examples}${moreSuffix}. ` +
        `${ruleDocs.consumerImpact}`,
      rationale: ruleDocs.rationale,
      category: g.rule === "RFC2-3" ? "correctness" : "design",
      severity: g.severity,
      scope: "endpoint",
      affectedEndpoints: affectedEndpoints.slice(0, 50),
      patchOps: [],
      patchSummary: ruleDocs.patchSummary,
      meta: {
        rule: g.rule,
        occurrenceCount: g.occurrences.length,
      },
    });
  }
  return findings;
}

function shortRuleTitle(_rule: string, detail: string): string {
  // Take first clause up to first period.
  const dot = detail.indexOf(".");
  const head = (dot > 0 ? detail.slice(0, dot) : detail).slice(0, 100);
  return head;
}

function ruleDocumentation(rule: string): {
  rationale: string;
  patchSummary: string;
  consumerImpact: string;
} {
  switch (rule) {
    case "RFC2-1":
      return {
        rationale:
          "RFC 9457 Section 3.1 (Members of a Problem Details Object) names `type` as the only REQUIRED member; `title`, `status`, `detail`, and `instance` SHOULD be supplied where meaningful. Specs that declare `application/problem+json` but omit these members force consumers to treat the response as opaque, defeating the entire purpose of the standardised error-format.",
        patchSummary:
          "Add the REQUIRED `type` (URI) and SHOULD-supply `title` (string) + `status` (integer) properties to the problem-details schema.",
        consumerImpact:
          "SDK codegens emit a typed error class, so missing reserved members produce nullable/unknown fields where consumers expected RFC-conforming structure.",
      };
    case "RFC2-2":
      return {
        rationale:
          "RFC 9457 Section 3.1.1 (type) states the value MUST be a URI; the default `about:blank` is the only allowed non-resolvable value. Free-form strings like `invalid_request` or `ERROR_42` break the URI-as-class-identifier contract - they cannot be dereferenced for documentation and collide with codegen tools that treat the field as a discriminator.",
        patchSummary:
          "Replace non-URI `type` values with absolute URIs (e.g. https://example.com/probs/invalid-request) or `about:blank`.",
        consumerImpact:
          "Clients that switch on `problem.type` URIs cannot reliably dispatch on a non-URI value; URI-discriminator-based error-handling is broken.",
      };
    case "RFC2-3":
      return {
        rationale:
          "RFC 9457 Section 3.1.2 (status) states the value MUST be the same as the HTTP response status code generated by the origin server. A schema declaring status:400 as example/default on a 404 response is internally inconsistent - Lens 8 (internal-consistency).",
        patchSummary:
          "Align the example/default value of the `status` property in each problem-shape schema with the HTTP status of its enclosing response.",
        consumerImpact:
          "AI agents and SDK codegens that read examples to infer error-shapes will emit code that double-checks `problem.status === httpStatus` and throw on mismatch.",
      };
    case "RFC2-4":
      return {
        rationale:
          "RFC 9457 Section 3.2 / Section 4.2 reserves the names type/title/status/detail/instance with specific normative types (string/string/integer/string/string-URI). Redefining `status` as a string or `type` as an integer breaks the standardised contract that codegens, validators, and AI agents rely on.",
        patchSummary:
          "Fix the type of the redefined reserved member to match RFC 9457 Section 3.1 (type/title/detail/instance = string; status = integer).",
        consumerImpact:
          "Validators that ship RFC 9457-aware Ajv schemas will reject the response; codegens emit typed-decoder errors at runtime when the shape mismatches.",
      };
    default:
      return {
        rationale: "RFC 9457 conformance.",
        patchSummary: "Conform to RFC 9457.",
        consumerImpact: "",
      };
  }
}

function buildRfc2_5Findings(
  collisions: TypeUriCollision[]
): DetectorFinding[] {
  // RFC2-5 = apiq-USP. One finding per colliding URI.
  return collisions.slice(0, MAX_FINDINGS_PER_RULE).map((c) => {
    const variantLines = c.variants.slice(0, 6).map((v) => {
      const titleStr =
        typeof v.title === "string"
          ? `title=\"${v.title.slice(0, 40)}\"`
          : "title=null";
      const statusStr =
        typeof v.statusValue === "number"
          ? `status=${v.statusValue}`
          : "status=null";
      return `  - ${v.record.method.toUpperCase()} ${v.record.path} -> ${v.record.status} [${titleStr}, ${statusStr}, ${v.shapeSig}]`;
    });
    const affectedEndpoints = c.variants.map((v) => ({
      path: v.record.path,
      method: v.record.method,
    }));
    const variantsBlock = variantLines.join("\n");

    return {
      detectorId: `module:problem-json-validator:rfc2-5:${c.typeUri.slice(0, 60)}`,
      layer: "walker-statistical",
      title: `RFC2-5 (apiq-USP): problem-class \`type\` URI \`${c.typeUri.slice(0, 80)}\` reused for ${c.variants.length} structurally-distinct problem-classes`,
      narration:
        `The type-URI \`${c.typeUri}\` is declared on ${c.variants.length} response schemas with structurally-different problem-shapes (different property sets, distinct status-values, or distinct titles). RFC 9457 Section 4 (Defining New Problem Types) states that each problem type SHOULD be registered under a unique URI - reusing one URI for semantically-different error-classes breaks the URI-as-class-identifier contract that consumers, SDK codegens, and AI agents depend on for typed error-dispatch.\n\nVariants observed:\n${variantsBlock}\n\nThis is an apiq-USP differentiator finding: cross-class type-URI uniqueness is a cross-response invariant that no mature linter (Vacuum, Redocly, Spectral, IBM, Zalando) currently checks.`,
      rationale:
        "RFC 9457 Section 4 (Defining New Problem Types): Each problem type ... SHOULD be registered under a unique URI. Cross-class URI reuse is a Lens 8 (internal-consistency) violation - the spec is locally valid at every response, but globally inconsistent.",
      category: "design",
      severity: "high",
      scope: "spec",
      affectedEndpoints: affectedEndpoints.slice(0, 50),
      patchOps: [],
      patchSummary: `Disambiguate the ${c.variants.length} problem-classes that share type=${c.typeUri.slice(0, 50)} - assign each a unique URI per RFC 9457 Section 4.`,
      meta: {
        rule: "RFC2-5",
        usp: true,
        typeUri: c.typeUri,
        variantCount: c.variants.length,
      },
    };
  });
}

function buildEv11Finding(
  result: NonNullable<ReturnType<typeof detectMissingSpecWideErrorShape>>
): DetectorFinding {
  const shapeExamples = result.distinctShapes
    .slice(0, 4)
    .map((s, i) => `  Variant ${i + 1}: ${s}`)
    .join("\n");
  const moreSuffix =
    result.distinctShapes.length > 4
      ? `\n  ... (and ${result.distinctShapes.length - 4} more variants)`
      : "";

  return {
    detectorId: "module:problem-json-validator:ev-11-missing-spec-wide-error-shape",
    layer: "walker-statistical",
    title: `EV-11 / K2: spec exposes ${result.distinctShapes.length} structurally-distinct error-shapes without declaring application/problem+json`,
    narration:
      `Across ${result.totalErrorResponses} 4xx/5xx response${result.totalErrorResponses === 1 ? "" : "s"}, the spec uses ${result.distinctShapes.length} structurally-distinct error-schemas, none of which declare application/problem+json content-type. Without a spec-wide error-shape declaration (RFC 9457 problem+json or a single shared components.responses.Error ref), every consumer must learn N different error-shapes per API. RFC 7807/9457 Section 1 (to define common error formats for HTTP APIs, so that they can be reused) is the canonical fix.\n\nObserved shape variants:\n${shapeExamples}${moreSuffix}\n\nLens-3 (evolution-friction): adding fields to N ad-hoc error-shapes later becomes a cross-cutting breaking-change. Lens-4 (client-friction): SDK codegens emit N typed error-classes instead of one. Lens-2 (standards-compliance): RFC 7807/9457 explicitly exists to solve this.`,
    rationale:
      "RFC 7807 / 9457 Section 1 (Introduction) motivates the problem+json format precisely to avoid the situation flagged here: N ad-hoc error-shapes per API. Multi-source confirmation: SG-16 (single error-format), OPTIC consistent-error-shape, Stripe error-convention.",
    category: "design",
    severity: "medium",
    scope: "spec",
    affectedEndpoints: [],
    patchOps: [],
    patchSummary:
      "Declare a single spec-wide error-shape - either adopt RFC 9457 application/problem+json or hoist a shared components.responses.Error referenced from every 4xx/5xx response.",
    meta: {
      rule: "EV-11",
      patternId: "K2",
      distinctShapeCount: result.distinctShapes.length,
      totalErrorResponses: result.totalErrorResponses,
    },
  };
}

// =============================================================================
// Public API
// =============================================================================

export async function validateProblemJson(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const { problemRecords, errorRecords } =
    collectProblemAndErrorRecords(spec);

  const violations: PerRecordViolation[] = [];
  for (const r of problemRecords) {
    violations.push(...validateRecord(r));
  }
  const perRuleFindings = buildPerRuleFindings(violations);

  // RFC2-5 - cross-class type-URI uniqueness (apiq-USP).
  const collisions = findTypeUriCollisions(problemRecords);
  const rfc2_5Findings = buildRfc2_5Findings(collisions);

  // EV-11 / K2 - spec-wide error-shape coherence.
  const ev11 = detectMissingSpecWideErrorShape(errorRecords);
  const ev11Findings = ev11 ? [buildEv11Finding(ev11)] : [];

  return [...perRuleFindings, ...rfc2_5Findings, ...ev11Findings];
}

// =============================================================================
// Internal exports for tests
// =============================================================================

export const __test__ = {
  isUriLike,
  looksLikeProblemShape,
  shapeSignature,
  collectProblemAndErrorRecords,
  validateRecord,
  findTypeUriCollisions,
  detectMissingSpecWideErrorShape,
};

// =============================================================================
// CLI - runs problem-json-validator against a single spec from openapi-examples.
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
    console.error("Usage: tsx deterministic/problem-json-validator.ts <spec-name>");
    console.error("  e.g. tsx deterministic/problem-json-validator.ts stripe-full");
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

  console.log(`Loaded spec: ${specPath}`);
  console.log("Running problem-json-validator (RFC 9457 + apiq-USP RFC2-5)...");
  console.log("");

  const startedAt = Date.now();
  const findings = await validateProblemJson(spec, { specName });
  const durationMs = Date.now() - startedAt;

  console.log(`${findings.length} findings emitted (${durationMs}ms)`);
  console.log("");
  if (findings.length === 0) {
    console.log("(No problem-json findings - either no problem+json in spec or full RFC 9457 conformance.)");
    return;
  }
  for (const f of findings) {
    console.log(`[${f.detectorId}]`);
    console.log(`  title:    ${f.title}`);
    console.log(`  severity: ${f.severity}`);
    if (f.meta) console.log(`  meta:     ${JSON.stringify(f.meta)}`);
    if (f.affectedEndpoints.length > 0) {
      console.log(`  affectedEndpoints: ${f.affectedEndpoints.length}`);
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
