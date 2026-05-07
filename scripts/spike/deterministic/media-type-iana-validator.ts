/**
 * Media-Type IANA Validator Module — Stage A, Welle B T13 (Module-Class).
 *
 * Sources: IANA media-types registry snapshot (T22, 2026-01)
 *          + RFC 6838 (Media Type Specifications and Registration)
 *          + RFC 8259 §8.1 (JSON charset redundancy)
 *          + RFC 7578 (multipart/form-data)
 *          + RFC 7763 (text/markdown registration, supersedes text/x-markdown)
 *          + IETF JSON-suffix-tree (+json) conventions
 * Patterns: ~8 media-type checks (RFC2-75 to RFC2-80 + RFC2-100/101);
 *           IANA-registry lookup + structured-suffix (+json/+xml) checks
 * Lens: 2 (Standards-Compliance)
 * Round: 2 (Welle B / T13)
 *
 * Maps to rules-brainstorm.md: RFC2-75 (Custom JSON media-type +json suffix),
 * RFC2-76 (vendor-specific vnd. tree), RFC2-77 (prs. tree smell),
 * RFC2-78 (wildcard star-slash-star forbidden), RFC2-79 (top-level IANA-registered),
 * RFC2-80 (charset on application/json redundant), RFC2-100/101 (multipart
 * shape), apiq-prefer-iana-markdown-mediatype (text/markdown vs x-markdown).
 *
 * Validates every media-type used as a `content` key in the spec
 * (`requestBody.content[*]`, `responses.*.content[*]`, and any other
 * `*.content[*]` key encountered) against:
 *
 *   - RFC 6838 §3   — top-level type MUST be IANA-registered (RFC2-79)
 *   - RFC 6838 §3.2 — vendor-tree (`vnd.X+json`) shape (RFC2-76)
 *   - RFC 6838 §3.3 — personal-tree (`prs.X`) — production smell (RFC2-77)
 *   - RFC 6838 §4.2.8 — custom JSON-based types SHOULD use `+json` suffix (RFC2-75)
 *   - OAS-3 + 6838 — wildcard star-slash-star content-type forbidden (RFC2-78)
 *   - RFC 8259 §8.1 — `charset` parameter on `application/json` redundant (RFC2-80)
 *   - RFC 7578 + OAS-3 — `multipart/form-data` schema shape (RFC2-100, RFC2-101)
 *
 * Imports the T22 IANA snapshot at `iana/media-types.ts` rather than
 * re-implementing parsing — single source of truth for the media-type grammar
 * and registered top-level types.
 *
 * Spec-agnostic — works on ANY OpenAPI 3.x spec.
 *
 * Public API:
 *   `runMediaTypeValidator(spec, opts) => Promise<DetectorFinding[]>`
 *
 * CLI:
 *   `npx tsx deterministic/media-type-iana-validator.ts <spec-name>`
 */

import type { DetectorFinding, DetectorOptions } from './types.js';
import {
  parseMediaType,
  validateMediaType,
  type ParsedMediaType,
} from './iana/media-types.js';

// =============================================================================
// Internal types
// =============================================================================

/**
 * One occurrence of a media-type in the spec, with the JSON-Pointer-style
 * location of the offending `content` map key. Used to aggregate findings by
 * pattern + media-type while preserving location metadata for the UI.
 */
interface MediaTypeOccurrence {
  /** The raw media-type string as written in the spec (pre-trim, pre-lowercase). */
  raw: string;
  /** Parsed structure (undefined for grammatically-invalid types). */
  parsed?: ParsedMediaType;
  /** JSON-Pointer to the content-key, e.g. "/paths/~1users/post/requestBody/content/application~1json". */
  pointer: string;
  /** The schema attached to this content-entry (used by RFC2-100/101). */
  schema?: Record<string, unknown>;
  /** Path + method of the operation containing this occurrence (for affectedEndpoints). */
  endpoint?: { path: string; method: string };
}

const HTTP_METHODS = new Set([
  'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace',
]);

/**
 * RFC 6838 §4.2.8 — JSON-aligned structured suffixes. A media-type with one of
 * these suffixes is "JSON-based". We use this list (rather than only `+json`)
 * so we don't false-positive `+json-seq` etc. as missing-suffix.
 */
const JSON_ALIGNED_SUFFIXES: ReadonlySet<string> = new Set(['json', 'json-seq']);

/**
 * Subtypes that strongly suggest a JSON wire-format even though they don't
 * carry a structured-suffix. RFC2-75 fires when a custom subtype hints "json"
 * in its name (e.g. `application/myjson`) but is missing the `+json` suffix.
 *
 * Conservative: we only fire when the literal substring "json" appears in the
 * subtype root and there is no `+json` suffix.
 */
function looksLikeCustomJsonWithoutSuffix(parsed: ParsedMediaType): boolean {
  if (parsed.suffix && JSON_ALIGNED_SUFFIXES.has(parsed.suffix)) return false;
  // Strip any +suffix portion to inspect the root subtype.
  const plusIdx = parsed.subtype.lastIndexOf('+');
  const root = plusIdx > 0 ? parsed.subtype.slice(0, plusIdx) : parsed.subtype;
  // Don't fire on the canonical `application/json` (no facet, root === "json")
  // or on subtypes that happen to embed "json" only as a registered word
  // (e.g. "vnd.x+json" already excluded by suffix-check above).
  if (root === 'json') return false;
  return root.includes('json');
}

// =============================================================================
// Spec walking
// =============================================================================

function escapeJsonPointer(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Walk the spec and collect every (mediaType, location, schema?, endpoint?)
 * occurrence we should validate. Covers:
 *   - paths.*.{method}.requestBody.content.*
 *   - paths.*.{method}.responses.*.content.*
 *   - components.requestBodies.*.content.*
 *   - components.responses.*.content.*
 */
function* walkContentOccurrences(spec: object): Generator<MediaTypeOccurrence> {
  const root = spec as Record<string, unknown>;

  // 1. paths.*.{method}.{requestBody|responses}.*.content.*
  const paths = root.paths as Record<string, unknown> | undefined;
  if (paths && typeof paths === 'object') {
    for (const [pathStr, pathItemRaw] of Object.entries(paths)) {
      if (!pathItemRaw || typeof pathItemRaw !== 'object') continue;
      const pathItem = pathItemRaw as Record<string, unknown>;
      const escPath = escapeJsonPointer(pathStr);
      for (const [methodKey, opRaw] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.has(methodKey.toLowerCase())) continue;
        if (!opRaw || typeof opRaw !== 'object') continue;
        const op = opRaw as Record<string, unknown>;
        const endpoint = { path: pathStr, method: methodKey.toLowerCase() };

        // requestBody
        const reqBody = op.requestBody as Record<string, unknown> | undefined;
        if (reqBody && typeof reqBody === 'object' && reqBody.content && typeof reqBody.content === 'object') {
          const content = reqBody.content as Record<string, unknown>;
          for (const [mt, mediaTypeObjRaw] of Object.entries(content)) {
            const schema = pickSchema(mediaTypeObjRaw);
            yield {
              raw: mt,
              parsed: parseMediaType(mt),
              pointer: `/paths/${escPath}/${methodKey}/requestBody/content/${escapeJsonPointer(mt)}`,
              schema,
              endpoint,
            };
          }
        }

        // responses.{status}.content.*
        const responses = op.responses as Record<string, unknown> | undefined;
        if (responses && typeof responses === 'object') {
          for (const [status, respRaw] of Object.entries(responses)) {
            if (!respRaw || typeof respRaw !== 'object') continue;
            const resp = respRaw as Record<string, unknown>;
            const content = resp.content as Record<string, unknown> | undefined;
            if (!content || typeof content !== 'object') continue;
            for (const [mt, mediaTypeObjRaw] of Object.entries(content)) {
              const schema = pickSchema(mediaTypeObjRaw);
              yield {
                raw: mt,
                parsed: parseMediaType(mt),
                pointer: `/paths/${escPath}/${methodKey}/responses/${escapeJsonPointer(status)}/content/${escapeJsonPointer(mt)}`,
                schema,
                endpoint,
              };
            }
          }
        }
      }
    }
  }

  // 2. components.requestBodies.*.content.*  +  components.responses.*.content.*
  const components = root.components as Record<string, unknown> | undefined;
  if (components && typeof components === 'object') {
    const reqBodies = components.requestBodies as Record<string, unknown> | undefined;
    if (reqBodies && typeof reqBodies === 'object') {
      for (const [name, rbRaw] of Object.entries(reqBodies)) {
        if (!rbRaw || typeof rbRaw !== 'object') continue;
        const rb = rbRaw as Record<string, unknown>;
        const content = rb.content as Record<string, unknown> | undefined;
        if (!content || typeof content !== 'object') continue;
        for (const [mt, mediaTypeObjRaw] of Object.entries(content)) {
          const schema = pickSchema(mediaTypeObjRaw);
          yield {
            raw: mt,
            parsed: parseMediaType(mt),
            pointer: `/components/requestBodies/${escapeJsonPointer(name)}/content/${escapeJsonPointer(mt)}`,
            schema,
          };
        }
      }
    }

    const compResponses = components.responses as Record<string, unknown> | undefined;
    if (compResponses && typeof compResponses === 'object') {
      for (const [name, respRaw] of Object.entries(compResponses)) {
        if (!respRaw || typeof respRaw !== 'object') continue;
        const resp = respRaw as Record<string, unknown>;
        const content = resp.content as Record<string, unknown> | undefined;
        if (!content || typeof content !== 'object') continue;
        for (const [mt, mediaTypeObjRaw] of Object.entries(content)) {
          const schema = pickSchema(mediaTypeObjRaw);
          yield {
            raw: mt,
            parsed: parseMediaType(mt),
            pointer: `/components/responses/${escapeJsonPointer(name)}/content/${escapeJsonPointer(mt)}`,
            schema,
          };
        }
      }
    }
  }
}

function pickSchema(mediaTypeObjRaw: unknown): Record<string, unknown> | undefined {
  if (!mediaTypeObjRaw || typeof mediaTypeObjRaw !== 'object') return undefined;
  const mtObj = mediaTypeObjRaw as Record<string, unknown>;
  const schema = mtObj.schema;
  if (!schema || typeof schema !== 'object') return undefined;
  return schema as Record<string, unknown>;
}

// =============================================================================
// Per-pattern detection
// =============================================================================

interface PatternHit {
  pattern: 'RFC2-75' | 'RFC2-76' | 'RFC2-77' | 'RFC2-78' | 'RFC2-79' | 'RFC2-80' | 'RFC2-100' | 'RFC2-101';
  occurrence: MediaTypeOccurrence;
  detail: string;
}

/**
 * RFC2-78 — wildcard catch-all content-type forbidden (warn).
 * RFC2-79 — top-level not IANA-registered (error).
 * RFC2-76 — vendor-tree malformed (warn).
 * RFC2-75 — custom JSON-based without `+json` suffix (warn).
 * RFC2-77 — `prs.` tree in production = smell (info).
 * RFC2-80 — `charset` on `application/json` redundant (info).
 * RFC2-100 — `multipart/form-data` schema not `type:object` (warn).
 * RFC2-101 — `multipart/form-data` binary part not declared with `format:binary` (warn).
 */
function detectPatterns(occ: MediaTypeOccurrence): PatternHit[] {
  const hits: PatternHit[] = [];
  const parsed = occ.parsed;

  // Grammatically invalid input — skip silently. Spectral / OAS validators
  // already flag those at a layer above us; we don't double-fire.
  if (!parsed) return hits;

  // RFC2-78 — wildcard catch-all (top + sub both '*'). image/* style wildcards
  // are also OAS-meaningless on a content-key axis, but we conservatively
  // restrict the rule to the literal star-slash-star catch-all (severity warn).
  if (parsed.topLevel === '*' && parsed.subtype === '*') {
    hits.push({
      pattern: 'RFC2-78',
      occurrence: occ,
      detail: 'wildcard catch-all content-type forbidden (RFC 6838 + OAS-3 interpretive)',
    });
    // No further checks once we have flagged the wildcard.
    return hits;
  }

  // RFC2-79 — top-level type MUST be IANA-registered (error).
  const validation = validateMediaType(occ.raw);
  if (validation.valid && !validation.topLevelRegistered && !parsed.isWildcard) {
    hits.push({
      pattern: 'RFC2-79',
      occurrence: occ,
      detail: `top-level type \`${parsed.topLevel}\` is not in the IANA-registered set (application/audio/font/example/image/message/model/multipart/text/video/haptics)`,
    });
    // Continue to other checks — even an unregistered type can carry a
    // malformed vendor-tree or missing-suffix.
  }

  // RFC2-76 — vendor-tree shape (`vnd.<vendor>[.<resource>][+suffix]`).
  // Fires when `vnd.` is the prefix BUT the structure is malformed:
  //   - subtype is exactly "vnd." or "vnd.+json" (vendor name missing).
  if (parsed.facet === 'vnd') {
    // Strip optional +suffix to inspect the vnd-token.
    const plusIdx = parsed.subtype.lastIndexOf('+');
    const root = plusIdx > 0 ? parsed.subtype.slice(0, plusIdx) : parsed.subtype;
    const afterFacet = root.slice('vnd.'.length);
    if (!afterFacet || afterFacet.length === 0) {
      hits.push({
        pattern: 'RFC2-76',
        occurrence: occ,
        detail: `vendor-tree subtype malformed: \`${parsed.subtype}\` has no vendor identifier after \`vnd.\` per RFC 6838 §3.2`,
      });
    }
  }

  // RFC2-75 — custom JSON-based subtype without `+json` suffix (warn).
  // Apply only to `application/*` (JSON only travels there); also skip
  // canonical `application/json`, `application/json-seq`, and forms already
  // carrying a JSON-aligned suffix.
  if (parsed.topLevel === 'application' && looksLikeCustomJsonWithoutSuffix(parsed)) {
    hits.push({
      pattern: 'RFC2-75',
      occurrence: occ,
      detail: `subtype \`${parsed.subtype}\` looks JSON-based but does not declare the \`+json\` structured-suffix per RFC 6838 §4.2.8`,
    });
  }

  // RFC2-77 — `prs.` tree in production = smell (info).
  if (parsed.facet === 'prs') {
    hits.push({
      pattern: 'RFC2-77',
      occurrence: occ,
      detail: `personal-tree (\`prs.\`) media-type \`${parsed.raw}\` typically indicates a test/dev placeholder per RFC 6838 §3.3`,
    });
  }

  // RFC2-80 — charset on application/json redundant (info).
  if (
    parsed.topLevel === 'application' &&
    (parsed.subtype === 'json' || (parsed.suffix && JSON_ALIGNED_SUFFIXES.has(parsed.suffix))) &&
    typeof parsed.parameters.charset === 'string'
  ) {
    hits.push({
      pattern: 'RFC2-80',
      occurrence: occ,
      detail: `charset parameter on \`application/json\` is redundant — JSON is UTF-8 by RFC 8259 §8.1`,
    });
  }

  // RFC2-100 — multipart/form-data schema SHOULD be type:object.
  // RFC2-101 — multipart/form-data binary parts SHOULD declare format:binary
  //            (3.0) or contentEncoding:binary (3.1).
  if (parsed.topLevel === 'multipart' && parsed.subtype === 'form-data' && occ.schema) {
    const schema = occ.schema;
    const declaredType = schema.type;
    if (declaredType !== 'object') {
      hits.push({
        pattern: 'RFC2-100',
        occurrence: occ,
        detail: `multipart/form-data schema should be \`type: object\` with named properties per RFC 7578 §4.2; got \`type: ${declaredType ?? '<unset>'}\``,
      });
    } else {
      // Walk properties looking for binary-shaped fields lacking the
      // `format: binary` (3.0) or `contentEncoding: binary` (3.1) marker.
      const props = schema.properties;
      if (props && typeof props === 'object') {
        const offenders: string[] = [];
        for (const [propName, propSchemaRaw] of Object.entries(props as Record<string, unknown>)) {
          if (!propSchemaRaw || typeof propSchemaRaw !== 'object') continue;
          const propSchema = propSchemaRaw as Record<string, unknown>;
          // Heuristic: the property "looks like" a binary file part if its name
          // contains "file" or "upload" OR a similar token. We only flag the
          // *named* case (file/upload/etc.) to avoid false-positives on every
          // plain string field.
          const looksBinary = /file|upload|attachment|image|photo|document/i.test(propName);
          const hasBinaryFormat =
            propSchema.format === 'binary' ||
            propSchema.format === 'byte' ||
            propSchema.contentEncoding === 'binary' ||
            propSchema.contentEncoding === 'base64';
          if (looksBinary && !hasBinaryFormat) {
            offenders.push(propName);
          }
        }
        if (offenders.length > 0) {
          hits.push({
            pattern: 'RFC2-101',
            occurrence: occ,
            detail: `multipart/form-data field(s) ${offenders.map((o) => `\`${o}\``).join(', ')} look like binary file parts but do not declare \`format: binary\` (3.0) or \`contentEncoding: binary\` (3.1) per RFC 7578 + OAS-3`,
          });
        }
      }
    }
  }

  return hits;
}

// =============================================================================
// Finding builders
// =============================================================================

interface PatternMeta {
  severity: DetectorFinding['severity'];
  category: DetectorFinding['category'];
  title: (count: number) => string;
  rationale: string;
  patchVerb: string;
}

const PATTERN_META: Record<PatternHit['pattern'], PatternMeta> = {
  'RFC2-75': {
    severity: 'medium',
    category: 'design',
    title: (n) =>
      `${n} custom JSON-based media-type(s) missing \`+json\` structured suffix (RFC2-75)`,
    rationale:
      'RFC 6838 §4.2.8 defines structured-syntax-suffixes (`+json`, `+xml`, etc.) so that ' +
      'generic-format processors can recognise the underlying serialisation regardless of ' +
      'the registered subtype. A subtype that LOOKS JSON-based but lacks the `+json` suffix ' +
      'defeats this mechanism and confuses tooling.',
    patchVerb: 'Append `+json` to',
  },
  'RFC2-76': {
    severity: 'medium',
    category: 'correctness',
    title: (n) =>
      `${n} vendor-tree media-type(s) malformed per RFC 6838 §3.2 (RFC2-76)`,
    rationale:
      'RFC 6838 §3.2 specifies that vendor-tree subtypes follow the form ' +
      '`vnd.<producer>[.<product>[.<version>]][+suffix]`. A bare `vnd.` or empty ' +
      'vendor identifier is malformed and not registrable.',
    patchVerb: 'Replace the malformed vendor subtype with',
  },
  'RFC2-77': {
    severity: 'low',
    category: 'clarity',
    title: (n) =>
      `${n} personal-tree (\`prs.\`) media-type(s) declared — likely test/dev placeholder (RFC2-77)`,
    rationale:
      'RFC 6838 §3.3 reserves the `prs.` (personal) tree for personal/experimental media-types ' +
      'that are not intended for production deployment. Their presence in a published spec ' +
      'usually indicates leftover test or development data rather than a deliberate registered ' +
      'media-type.',
    patchVerb: 'Replace personal-tree subtype with vendor-tree or canonical equivalent on',
  },
  'RFC2-78': {
    severity: 'medium',
    category: 'design',
    title: (n) =>
      `${n} occurrence(s) of wildcard catch-all content-type — forbidden per OAS + RFC 6838 (RFC2-78)`,
    rationale:
      'OpenAPI keys `content` map by media-type — declaring a wildcard catch-all is meaningless: ' +
      'the consumer cannot determine the actual wire format from the spec. RFC 6838 + OAS-3 ' +
      'interpretive guidance forbid the catch-all in `content` keys.',
    patchVerb: 'Replace the wildcard catch-all with the concrete media-type(s) on',
  },
  'RFC2-79': {
    severity: 'high',
    category: 'correctness',
    title: (n) =>
      `${n} media-type(s) use a top-level type that is not IANA-registered (RFC2-79)`,
    rationale:
      'RFC 6838 §4.2 + the IANA Media Types Registry restrict top-level types to a fixed ' +
      'registered set: `application`, `audio`, `font`, `example`, `image`, `message`, `model`, ' +
      '`multipart`, `text`, `video` (+ `haptics` 2024). Any other top-level type is invalid and ' +
      'will be rejected by HTTP intermediaries and content-negotiation layers.',
    patchVerb: 'Replace the unregistered top-level type with a registered one on',
  },
  'RFC2-80': {
    severity: 'low',
    category: 'clarity',
    title: (n) =>
      `${n} occurrence(s) of redundant \`charset\` parameter on \`application/json\` (RFC2-80)`,
    rationale:
      'RFC 8259 §8.1 specifies that JSON text exchanged between systems that are not part of a ' +
      'closed ecosystem MUST be encoded using UTF-8 — making any explicit `; charset=utf-8` ' +
      'on `application/json` redundant.',
    patchVerb: 'Drop the redundant `; charset=...` parameter on',
  },
  'RFC2-100': {
    severity: 'medium',
    category: 'correctness',
    title: (n) =>
      `${n} \`multipart/form-data\` schema(s) not declared as \`type: object\` (RFC2-100)`,
    rationale:
      'RFC 7578 §4.2 + OAS-3 require multipart bodies to be modelled as a typed object whose ' +
      'properties name each form field. A bare `string`/`array` schema misses the named-part ' +
      'contract and breaks codegen for multipart consumers.',
    patchVerb: 'Switch the multipart schema to `type: object` with named properties on',
  },
  'RFC2-101': {
    severity: 'medium',
    category: 'design',
    title: (n) =>
      `${n} multipart/form-data binary part(s) missing \`format: binary\`/\`contentEncoding: binary\` (RFC2-101)`,
    rationale:
      'RFC 7578 + OAS-3 require binary file parts in multipart/form-data to declare ' +
      '`format: binary` (OAS 3.0) or `contentEncoding: binary` (OAS 3.1) so codegen tools ' +
      'and clients can wire up file-upload primitives correctly.',
    patchVerb: 'Add `format: binary` (3.0) or `contentEncoding: binary` (3.1) to',
  },
};

function buildFindingForPattern(
  pattern: PatternHit['pattern'],
  hits: PatternHit[]
): DetectorFinding {
  const meta = PATTERN_META[pattern];
  const count = hits.length;
  const examples = hits
    .slice(0, 3)
    .map((h) => `\`${h.occurrence.raw}\``)
    .join(', ');

  // Build affectedEndpoints from any hits that carried an endpoint.
  const epSet = new Map<string, { path: string; method: string }>();
  for (const h of hits) {
    if (h.occurrence.endpoint) {
      const key = `${h.occurrence.endpoint.method} ${h.occurrence.endpoint.path}`;
      if (!epSet.has(key)) epSet.set(key, h.occurrence.endpoint);
    }
  }
  const affectedEndpoints = [...epSet.values()].slice(0, 50);
  const scope: DetectorFinding['scope'] = affectedEndpoints.length > 0 ? 'endpoint' : 'spec';

  // Use the first hit's pointer as canonical sourcePath.
  const sourcePath = hits[0]?.occurrence.pointer;

  // Build narration.
  const detailLine = hits[0]?.detail ?? '';
  const narration =
    `${count} occurrence(s) of media-type pattern ${pattern}. ` +
    `${detailLine}. Examples: ${examples}` +
    `${count > 3 ? ` (and ${count - 3} more)` : ''}` +
    `. Detected on ${affectedEndpoints.length > 0 ? `${affectedEndpoints.length} endpoint(s)` : 'spec-level component(s)'}.`;

  return {
    detectorId: `media-type-iana:${pattern.toLowerCase()}`,
    layer: 'walker-statistical',
    title: meta.title(count),
    narration,
    rationale: meta.rationale,
    category: meta.category,
    severity: meta.severity,
    scope,
    affectedEndpoints,
    patchOps: [],
    patchSummary: `${meta.patchVerb} the ${count} media-type occurrence(s).`.slice(0, 200),
    sourcePath,
    meta: {
      pattern,
      count,
      mediaTypes: [...new Set(hits.map((h) => h.occurrence.raw))].slice(0, 20),
      pointers: hits.slice(0, 20).map((h) => h.occurrence.pointer),
    },
  };
}

// =============================================================================
// Public API
// =============================================================================

export async function runMediaTypeValidator(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  // Group hits by pattern so we emit one DetectorFinding per pattern that
  // aggregates count, examples, and pointers.
  const byPattern = new Map<PatternHit['pattern'], PatternHit[]>();

  for (const occ of walkContentOccurrences(spec)) {
    const hits = detectPatterns(occ);
    for (const hit of hits) {
      const bucket = byPattern.get(hit.pattern) ?? [];
      bucket.push(hit);
      byPattern.set(hit.pattern, bucket);
    }
  }

  const findings: DetectorFinding[] = [];
  // Stable order across runs.
  const orderedPatterns: PatternHit['pattern'][] = [
    'RFC2-79', 'RFC2-78', 'RFC2-76', 'RFC2-75', 'RFC2-100', 'RFC2-101', 'RFC2-77', 'RFC2-80',
  ];
  for (const p of orderedPatterns) {
    const hits = byPattern.get(p);
    if (hits && hits.length > 0) {
      findings.push(buildFindingForPattern(p, hits));
    }
  }
  return findings;
}

// Re-export internals for test ergonomics.
export {
  walkContentOccurrences as _walkContentOccurrencesForTests,
  detectPatterns as _detectPatternsForTests,
};



// =============================================================================
// CLI
// =============================================================================

async function main(): Promise<void> {
  const pathMod = await import('node:path');
  const fsMod = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const here = pathMod.dirname(fileURLToPath(import.meta.url));
  const SPIKE_DIR = pathMod.resolve(here, '..');
  const REPO_ROOT = pathMod.resolve(SPIKE_DIR, '..', '..');
  const EXAMPLES_DIR = pathMod.join(REPO_ROOT, 'openapi-examples');
  const specName = process.argv[2];
  if (!specName) {
    console.error('Usage: tsx deterministic/media-type-iana-validator.ts <spec-name>');
    process.exit(1);
  }
  const specDir = pathMod.join(EXAMPLES_DIR, specName);
  if (!fsMod.existsSync(specDir)) {
    console.error(`Spec directory not found: ${specDir}`);
    process.exit(1);
  }
  let specPath: string | null = null;
  for (const ext of ['json', 'yaml', 'yml']) {
    const candidate = pathMod.join(specDir, `spec.${ext}`);
    if (fsMod.existsSync(candidate)) { specPath = candidate; break; }
  }
  if (!specPath) { console.error(`No spec found in ${specDir}`); process.exit(1); }
  const raw = fsMod.readFileSync(specPath, 'utf8');
  let spec: object;
  if (specPath.endsWith('.json')) {
    spec = JSON.parse(raw);
  } else {
    const YAML = (await import('yaml')).default;
    spec = YAML.parse(raw) as object;
  }
  console.log(`Loaded ${specPath}`);
  const startedAt = Date.now();
  const findings = await runMediaTypeValidator(spec, { specName });
  const durationMs = Date.now() - startedAt;
  console.log(`Ran in ${durationMs}ms — ${findings.length} finding(s).`);
  for (const f of findings) {
    console.log(`[${f.detectorId}] ${f.title} (sev=${f.severity})`);
  }
}

{
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().catch((err) => { console.error(err); process.exit(1); });
  }
}
