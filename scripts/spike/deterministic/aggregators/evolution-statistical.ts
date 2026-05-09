/**
 * evolution-statistical — Lens-3 Walker module (Task T17 / Wave-2 Welle-B).
 *
 * Implements the EV-* patterns that pure Spectral DSL cannot express because
 * they require:
 *   - cross-spec aggregation (count error-shapes across all responses)
 *   - graph-walks (compare schema names case-insensitively)
 *   - cross-axis reference (compare required[] against properties[].default)
 *   - structural pattern-matching (path-template equivalence)
 *
 * Each Walker emits a `DetectorFinding` shape so the deterministic-layer's
 * downstream output-mapper / Apply / Patch / Score machinery treats them
 * identically to Spectral findings and other Walkers.
 *
 * Pattern coverage (EV-* IDs from
 * specs/big-spec-architecture-spike-stage-a-mining-round2-evolution.md):
 *
 *   - EV-7   Required-field has default (drift, warn)
 *   - EV-10  Mixed URL + Header versioning (drift, warn)
 *   - EV-11  No spec-wide error-shape declared (drift, warn)
 *   - EV-30  requestBody without application/json media-type (drift, warn)
 *   - EV-33  nullable: true AND required: true (drift, warn)
 *   - EV-36  Two paths with identical structural template (drift, error)
 *   - EV-40  Schema-name reuse case-insensitive (drift, warn)
 *   - EV-53  URL-version vs info.version drift (drift, warn)
 *   - EV-57  Required declares fields not in properties (drift, error)
 *
 * Severity-Schema integration: each finding's `meta.patternId` carries the
 * EV-N identifier; `meta.direction` carries the tighten/loosen/drift modifier;
 * `meta.lens` is fixed at `'evolution-friction'` (Lens 3).
 *
 * Public API:
 *   - walkEvolutionStatistical(spec, opts) => Promise<DetectorFinding[]>
 *   - Plus per-pattern named exports for unit-testability:
 *     walkRequiredHasDefault, walkVersioningAxisDrift,
 *     walkInconsistentErrorShape, walkRequestBodyNoJson,
 *     walkNullableAndRequired, walkAmbiguousPathTemplates,
 *     walkSchemaNameCollisions, walkUrlInfoVersionDrift,
 *     walkRequiredNotInProperties.
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';
import { walkOperations, walkComponentSchemas, walkAllSchemas, formatExamples } from './_shared.js';

// ===========================================================================
// Helper: extract `required` array + `properties` map from a schema-like obj.
// ===========================================================================

function getRequired(schema: Record<string, unknown>): string[] {
  const r = schema.required;
  if (!Array.isArray(r)) return [];
  return r.filter((x): x is string => typeof x === 'string');
}

function getProperties(schema: Record<string, unknown>): Record<string, Record<string, unknown>> | null {
  const p = schema.properties;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const out: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = v as Record<string, unknown>;
    }
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ===========================================================================
// EV-7 — Required-field has default (drift, warn)
// ===========================================================================

export async function walkRequiredHasDefault(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const offenders: Array<{ pointer: string; field: string }> = [];

  for (const { schema, pointer } of walkAllSchemas(spec)) {
    const required = getRequired(schema);
    if (required.length === 0) continue;
    const props = getProperties(schema);
    if (!props) continue;
    for (const fieldName of required) {
      const prop = props[fieldName];
      if (!prop) continue;
      if (prop.default !== undefined) {
        offenders.push({ pointer, field: fieldName });
      }
    }
  }

  if (offenders.length === 0) return [];

  const examples = formatExamples(
    offenders.slice(0, 3).map((o) => `${o.field} (${o.pointer || '/'})`),
    3
  );

  return [
    {
      detectorId: 'walker:evolution:ev-7-required-has-default',
      layer: 'walker-statistical',
      title: `${offenders.length} required field(s) declare a \`default\` value (semantic contradiction)`,
      narration:
        `${offenders.length} schema field(s) are listed in \`required\` AND declare a \`default\` value. ` +
        `Examples: ${examples}. ` +
        `A required field has no default by definition — the client MUST send a value. The default ` +
        `is dead code; cleanup-or-evolution-of-default-is-breaking under Stripe / Microsoft API ` +
        `versioning policies. Sources: [SP-G-AZ-10] [IBM ibm-no-default-for-required-parameter] ` +
        `[OASDIFF default-value-changed-on-property] [STRIPE: changing-default-is-backwards-incompatible].`,
      rationale:
        'OASDIFF flags `default-value-changed-on-property` as a breaking change. Microsoft REST ' +
        'API Guidelines and Azure breaking-change policy treat default-changes as breaking. ' +
        'A required field with default is internally contradictory; resolving the contradiction ' +
        '(removing default OR making field optional) is breaking either way.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Remove \`default\` on required fields, OR make those fields optional. (${offenders.length} occurrences.)`,
      meta: {
        patternId: 'EV-7',
        direction: 'drift',
        lens: 'evolution-friction',
        count: offenders.length,
      },
    },
  ];
}

// ===========================================================================
// EV-10 — Mixed URL + Header versioning (drift, warn)
// ===========================================================================

export async function walkVersioningAxisDrift(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  // URL versioning: any path or server URL contains /v\d/ pattern
  const URL_VERSION_RE = /\/v\d+(\.\d+)?(\/|$)/i;
  // Header versioning: any operation declares a header parameter named
  // 'API-Version', 'X-API-Version', 'Api-Version', or 'Accept' with a vendor
  // mediatype hint.
  const HEADER_VERSION_NAMES = new Set([
    'api-version',
    'x-api-version',
    'accept-version',
    'x-version',
    'version',
  ]);

  const root = spec as Record<string, unknown>;
  const paths = (root.paths ?? {}) as Record<string, unknown>;
  const servers = Array.isArray(root.servers) ? (root.servers as Record<string, unknown>[]) : [];

  // URL-version evidence
  const urlVersionEvidence: string[] = [];
  for (const s of servers) {
    if (typeof s.url === 'string' && URL_VERSION_RE.test(s.url)) {
      urlVersionEvidence.push(`servers[].url: ${s.url}`);
    }
  }
  for (const pathKey of Object.keys(paths)) {
    if (URL_VERSION_RE.test(pathKey)) {
      urlVersionEvidence.push(`path: ${pathKey}`);
      if (urlVersionEvidence.length > 5) break;
    }
  }

  // Header-version evidence
  const headerVersionEvidence: string[] = [];
  for (const { path, method, operation, pathItem } of walkOperations(spec)) {
    for (const source of [pathItem.parameters, operation.parameters]) {
      if (!Array.isArray(source)) continue;
      for (const p of source) {
        if (!isObject(p)) continue;
        if (p.in !== 'header') continue;
        const name = typeof p.name === 'string' ? p.name.toLowerCase() : '';
        if (HEADER_VERSION_NAMES.has(name)) {
          headerVersionEvidence.push(`${method.toUpperCase()} ${path} → ${p.name as string}`);
          break;
        }
      }
    }
    if (headerVersionEvidence.length > 5) break;
  }

  // Need BOTH axes to constitute "mixed"
  if (urlVersionEvidence.length === 0 || headerVersionEvidence.length === 0) return [];

  return [
    {
      detectorId: 'walker:evolution:ev-10-mixed-versioning',
      layer: 'walker-statistical',
      title: 'Spec mixes URL-based versioning AND header-based versioning (drift)',
      narration:
        `The spec declares versioning on TWO axes simultaneously — both URL-path and HTTP-header. ` +
        `URL evidence: ${formatExamples(urlVersionEvidence, 3)}. ` +
        `Header evidence: ${formatExamples(headerVersionEvidence, 3)}. ` +
        `Two version-axes is drift — clients are unsure which is canonical, future "fix" requires ` +
        `breaking either axis. Stripe, GitHub, MS-Azure, Postman, and Speakeasy all converge on ` +
        `single-axis-versioning (typically header-only or path-only). Sources: [SG-6] [Zalando ` +
        `MUST-single-version] [GH-API single-header-only] [STRIPE single-header-only] ` +
        `[MS-AZ single-query-only] [G-URL-1 one-api-version-per-document].`,
      rationale:
        'API versioning best practices unanimously recommend a single version-axis. Stripe uses ' +
        'header-only (`Stripe-Version`), GitHub uses header-only (`X-GitHub-Api-Version`), ' +
        'Microsoft Azure uses query-only (`api-version`), Postman+REST-purist recommend path-only. ' +
        'Mixing axes confuses clients and forces a future breaking-change to consolidate.',
      category: 'design',
      severity: 'high',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Pick ONE versioning axis (URL OR header OR query) and remove the other.',
      meta: {
        patternId: 'EV-10',
        direction: 'drift',
        lens: 'evolution-friction',
        urlEvidence: urlVersionEvidence,
        headerEvidence: headerVersionEvidence,
      },
    },
  ];
}

// ===========================================================================
// EV-11 — No spec-wide error-shape declared (drift, warn)
// ===========================================================================

export async function walkInconsistentErrorShape(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  // Heuristic: count distinct shapes used for 4xx/5xx responses.
  // - If there's a canonical `application/problem+json` referenced anywhere → satisfied
  // - If there's a `components.responses.{Error,DefaultError,...}` reused → satisfied
  // - Otherwise count distinct schemas referenced from 4xx/5xx and flag if >2

  const root = spec as Record<string, unknown>;
  const errorSchemaIdentities = new Set<string>();
  let problemJsonSeen = false;
  let usedReusableErrorResponse = false;
  let totalErrorResponses = 0;

  // Scan components.responses.* for canonical names
  const components = (root.components ?? {}) as Record<string, unknown>;
  const componentResponses = (components.responses ?? {}) as Record<string, unknown>;
  const COMMON_ERROR_NAMES = new Set([
    'error',
    'errordefault',
    'default',
    'defaulterror',
    'badrequest',
    'unauthorized',
    'forbidden',
    'notfound',
    'conflict',
    'unprocessableentity',
    'internalservererror',
    'problemresponse',
    'problemdetails',
  ]);
  const reusableErrorRefs = new Set<string>();
  for (const respName of Object.keys(componentResponses)) {
    if (COMMON_ERROR_NAMES.has(respName.toLowerCase())) {
      reusableErrorRefs.add(`#/components/responses/${respName}`);
    }
  }

  for (const { operation } of walkOperations(spec)) {
    const responses = operation.responses;
    if (!isObject(responses)) continue;
    for (const [code, respRaw] of Object.entries(responses)) {
      if (!/^[45]\d\d$/.test(code) && code !== 'default') continue;
      totalErrorResponses++;
      if (!isObject(respRaw)) continue;
      const ref = (respRaw as { $ref?: string }).$ref;
      if (typeof ref === 'string') {
        if (reusableErrorRefs.has(ref)) usedReusableErrorResponse = true;
        errorSchemaIdentities.add(ref);
        continue;
      }
      const content = isObject(respRaw.content) ? respRaw.content : {};
      for (const [mediaType, mediaRaw] of Object.entries(content)) {
        if (mediaType.includes('problem+json') || mediaType.includes('problem-json')) {
          problemJsonSeen = true;
        }
        if (!isObject(mediaRaw)) continue;
        const schema = (mediaRaw as { schema?: unknown }).schema;
        if (!isObject(schema)) continue;
        const sref = (schema as { $ref?: string }).$ref;
        if (typeof sref === 'string') {
          errorSchemaIdentities.add(sref);
        } else {
          // Inline schema — fingerprint by sorted-property-names
          const props = getProperties(schema);
          if (props) {
            const fp = Object.keys(props).sort().join(',');
            errorSchemaIdentities.add(`inline:{${fp}}`);
          }
        }
      }
    }
  }

  if (totalErrorResponses === 0) return [];

  // Satisfied if: problem+json seen, OR reusable error response used, OR ≤2 distinct shapes
  if (problemJsonSeen) return [];
  if (usedReusableErrorResponse && errorSchemaIdentities.size <= 3) return [];
  if (errorSchemaIdentities.size <= 2) return [];

  return [
    {
      detectorId: 'walker:evolution:ev-11-inconsistent-error-shape',
      layer: 'walker-statistical',
      title: `Spec uses ${errorSchemaIdentities.size} distinct error-response shapes (no canonical error type declared)`,
      narration:
        `Across ${totalErrorResponses} 4xx/5xx response declarations, the spec uses ` +
        `${errorSchemaIdentities.size} distinct schema-shapes. No \`application/problem+json\` ` +
        `(RFC 7807 / 9457) reference is declared. Adding fields to the error shape later ` +
        `becomes a cross-cutting breaking change that requires per-operation modifications. ` +
        `Sources: [SG-16 consistent-error-shape] [RFC 7807/9457] [OPTIC consistent-error-shape] ` +
        `[STRIPE-convention single-error-envelope].`,
      rationale:
        'RFC 9457 (Problem Details for HTTP APIs, 2024) supersedes RFC 7807 and is the canonical ' +
        'cross-vendor error-shape. Stripe, GitHub, and Microsoft Graph all converge on a single ' +
        'spec-wide error envelope. Without one, evolving the error model requires N changes for ' +
        'N operations and forces clients to handle N different shapes.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Declare a single canonical error schema (RFC 9457 problem+json or a `components.responses.Error` ref) and reuse it across all 4xx/5xx responses.',
      meta: {
        patternId: 'EV-11',
        direction: 'drift',
        lens: 'evolution-friction',
        distinctShapes: errorSchemaIdentities.size,
        totalErrorResponses,
      },
    },
  ];
}

// ===========================================================================
// EV-30 — requestBody without application/json (drift, warn)
// ===========================================================================

export async function walkRequestBodyNoJson(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const offenders: Array<{ path: string; method: string; mediaTypes: string[] }> = [];

  for (const { path, method, operation } of walkOperations(spec)) {
    if (!['post', 'put', 'patch'].includes(method)) continue;
    const requestBody = operation.requestBody;
    if (!isObject(requestBody)) continue;
    const content = requestBody.content;
    if (!isObject(content)) continue;
    const mediaTypes = Object.keys(content);
    if (mediaTypes.length === 0) continue;
    const hasJson = mediaTypes.some((m) => m === 'application/json' || m.endsWith('+json'));
    if (!hasJson) {
      offenders.push({ path, method, mediaTypes });
    }
  }

  if (offenders.length === 0) return [];

  const examples = formatExamples(
    offenders.slice(0, 3).map(
      (o) => `${o.method.toUpperCase()} ${o.path} (accepts: ${o.mediaTypes.join(', ')})`
    ),
    3
  );

  return [
    {
      detectorId: 'walker:evolution:ev-30-requestbody-no-json',
      layer: 'walker-statistical',
      title: `${offenders.length} operation(s) declare requestBody without \`application/json\``,
      narration:
        `${offenders.length} write-method operation(s) accept a request body but do not declare ` +
        `\`application/json\` (or a \`+json\` vendor variant). Examples: ${examples}. ` +
        `Adding \`application/json\` later changes content-negotiation default-precedence; modern ` +
        `clients overwhelmingly send JSON. Sources: [SP-G-AYWH-10] [SPS sps-request-support-json] ` +
        `[OPTIC consistent-content-type] [Adidas].`,
      rationale:
        'OpenAPI 3.0 §4.7.13 derives `Content-Type` from `requestBody.content` keys. ' +
        'Modern REST clients default to JSON. Operations that accept only form-encoded or only ' +
        'XML are increasingly rare and adding JSON later changes the default-content-type ' +
        'negotiation behaviour for clients that omit `Content-Type`.',
      category: 'design',
      severity: 'medium',
      scope: 'endpoint',
      affectedEndpoints: offenders.map((o) => ({ path: o.path, method: o.method })),
      patchOps: [],
      patchSummary: `Add \`application/json\` to \`requestBody.content\` on the ${offenders.length} operation(s) that accept only non-JSON content-types.`,
      meta: {
        patternId: 'EV-30',
        direction: 'drift',
        lens: 'evolution-friction',
        count: offenders.length,
      },
    },
  ];
}

// ===========================================================================
// EV-33 — nullable: true AND required: true (drift, warn)
// ===========================================================================

export async function walkNullableAndRequired(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const offenders: Array<{ pointer: string; field: string }> = [];

  for (const { schema, pointer } of walkAllSchemas(spec)) {
    const required = getRequired(schema);
    if (required.length === 0) continue;
    const props = getProperties(schema);
    if (!props) continue;
    for (const fieldName of required) {
      const prop = props[fieldName];
      if (!prop) continue;
      // OAS 3.0: `nullable: true`
      // OAS 3.1: `type: ['string', 'null']` or `type: 'null'`
      const nullable3_0 = prop.nullable === true;
      const type = prop.type;
      const nullable3_1 =
        Array.isArray(type) && type.includes('null');
      if (nullable3_0 || nullable3_1) {
        offenders.push({ pointer, field: fieldName });
      }
    }
  }

  if (offenders.length === 0) return [];

  const examples = formatExamples(
    offenders.slice(0, 3).map((o) => `${o.field} (${o.pointer || '/'})`),
    3
  );

  return [
    {
      detectorId: 'walker:evolution:ev-33-nullable-and-required',
      layer: 'walker-statistical',
      title: `${offenders.length} field(s) are both \`nullable: true\` AND \`required: true\` (contradiction)`,
      narration:
        `${offenders.length} schema field(s) are listed in \`required\` AND declare \`nullable: true\` ` +
        `(or OAS-3.1 type-array including \`null\`). Examples: ${examples}. ` +
        `Most validators treat this as contradictory — the field MUST be present but its value ` +
        `MAY be null. Resolving the contradiction (drop nullable OR drop required) is breaking ` +
        `either way. Sources: [JSON-Schema-evolution-blog] [Speakeasy openapi-schemas-best-practices] ` +
        `[OASDIFF nullable-changed].`,
      rationale:
        '`required` lists field names that MUST be present in the JSON object. `nullable: true` ' +
        'allows the value to be `null`. The two combine to mean "must be present, may be null" ' +
        'which is an unusual contract — most APIs either drop the property entirely (optional) ' +
        'or use a sentinel non-null default. Cleanup-by-dropping-either-flag is breaking.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Resolve the nullable+required contradiction: either drop \`required\` (field becomes optional) or drop \`nullable\` (field MUST be non-null). (${offenders.length} occurrences.)`,
      meta: {
        patternId: 'EV-33',
        direction: 'drift',
        lens: 'evolution-friction',
        count: offenders.length,
      },
    },
  ];
}

// ===========================================================================
// EV-36 — Two paths with identical structural template (drift, error)
// ===========================================================================

/**
 * Normalise a path-template by replacing `{anyName}` with `{}`. Two paths whose
 * normalised templates collide are structurally ambiguous.
 */
function normalisePathTemplate(p: string): string {
  return p.replace(/\{[^}]*\}/g, '{}');
}

export async function walkAmbiguousPathTemplates(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const paths = (root.paths ?? {}) as Record<string, unknown>;
  const buckets = new Map<string, string[]>();
  for (const pathKey of Object.keys(paths)) {
    const norm = normalisePathTemplate(pathKey);
    const bucket = buckets.get(norm) ?? [];
    bucket.push(pathKey);
    buckets.set(norm, bucket);
  }

  const collisions: Array<{ template: string; paths: string[] }> = [];
  for (const [template, group] of buckets.entries()) {
    if (group.length > 1) {
      collisions.push({ template, paths: group });
    }
  }

  if (collisions.length === 0) return [];

  const exampleCol = collisions[0];
  const exampleStr = `\`${exampleCol.template}\` ← ${exampleCol.paths.join(', ')}`;

  return [
    {
      detectorId: 'walker:evolution:ev-36-ambiguous-path-templates',
      layer: 'walker-statistical',
      title: `${collisions.length} structurally-ambiguous path-template group(s) detected`,
      narration:
        `${collisions.length} group(s) of paths share an identical structural template after ` +
        `parameter-name normalisation. Example: ${exampleStr}. ` +
        `When `+
        `two paths have the same structural shape (e.g. \`/users/{id}\` and \`/users/{name}\`), ` +
        `the routing matcher cannot distinguish them by URL alone — the two endpoints functionally ` +
        `collide. Disambiguation later (renaming one path) is a breaking-change. Source: ` +
        `[MIN-7 Vacuum + Redocly path-template-collision].`,
      rationale:
        'OpenAPI path-templating is structural — two path keys that match the same URL pattern ' +
        'create routing ambiguity. Codegen tools must invent a tiebreaker (typically operation ' +
        'definition order), and consumers cannot unambiguously identify which operation a given ' +
        'request was routed to. Disambiguating later requires URL rotation = breaking.',
      category: 'design',
      severity: 'high',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Disambiguate the ${collisions.length} structurally-ambiguous path group(s) by introducing a static segment (e.g. /users/by-id/{id} vs /users/by-name/{name}).`,
      meta: {
        patternId: 'EV-36',
        direction: 'drift',
        lens: 'evolution-friction',
        collisions: collisions.map((c) => ({ template: c.template, paths: c.paths })),
      },
    },
  ];
}

// ===========================================================================
// EV-40 — Schema-name reuse case-insensitive (drift, warn)
// ===========================================================================

export async function walkSchemaNameCollisions(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const buckets = new Map<string, string[]>();
  for (const { name } of walkComponentSchemas(spec)) {
    const lower = name.toLowerCase();
    const bucket = buckets.get(lower) ?? [];
    bucket.push(name);
    buckets.set(lower, bucket);
  }

  const collisions: Array<{ lower: string; names: string[] }> = [];
  for (const [lower, names] of buckets.entries()) {
    if (names.length > 1) {
      collisions.push({ lower, names });
    }
  }

  if (collisions.length === 0) return [];

  const exampleStr = collisions
    .slice(0, 3)
    .map((c) => `\`${c.names.join('\` vs \`')}\``)
    .join('; ');

  return [
    {
      detectorId: 'walker:evolution:ev-40-schema-name-collision',
      layer: 'walker-statistical',
      title: `${collisions.length} schema name(s) collide case-insensitively`,
      narration:
        `${collisions.length} component-schema name(s) differ only in case. Examples: ${exampleStr}. ` +
        `Codegen tools that emit class-names for case-insensitive languages (Go, .NET, Windows ` +
        `filesystem) will collide on output. Renaming one schema later to disambiguate rotates the ` +
        `generated SDK class-name = breaking. Sources: [Redocly] [IBM] [MIN-50] [apiq O2].`,
      rationale:
        'Component-schema names map directly to generated SDK class names. Languages with ' +
        'case-insensitive identifier resolution (Go on case-insensitive filesystems, Windows ' +
        'C#, etc.) will fail to disambiguate. Even on case-sensitive languages the collision ' +
        'signals an authoring mistake (likely two schemas that should be one).',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Rename ${collisions.length} colliding schema(s) so each name is unique case-insensitively.`,
      meta: {
        patternId: 'EV-40',
        direction: 'drift',
        lens: 'evolution-friction',
        collisions: collisions.map((c) => ({ names: c.names })),
      },
    },
  ];
}

// ===========================================================================
// EV-53 — URL-version vs info.version drift (drift, warn)
// ===========================================================================

export async function walkUrlInfoVersionDrift(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const info = (root.info ?? {}) as Record<string, unknown>;
  const infoVersion = typeof info.version === 'string' ? info.version : null;
  if (!infoVersion) return [];

  // Extract major-version from infoVersion: matches "1", "1.2.3", "v1", etc.
  const infoMajorMatch = infoVersion.match(/^v?(\d+)/i);
  if (!infoMajorMatch) return [];
  const infoMajor = infoMajorMatch[1];

  // Find URL-version evidence
  const URL_VERSION_RE = /\/v(\d+)(?:\.\d+)?(\/|$)/i;
  const paths = (root.paths ?? {}) as Record<string, unknown>;
  const servers = Array.isArray(root.servers) ? (root.servers as Record<string, unknown>[]) : [];
  const urlVersions = new Set<string>();
  for (const s of servers) {
    if (typeof s.url === 'string') {
      const m = s.url.match(URL_VERSION_RE);
      if (m) urlVersions.add(m[1]);
    }
  }
  for (const pathKey of Object.keys(paths)) {
    const m = pathKey.match(URL_VERSION_RE);
    if (m) urlVersions.add(m[1]);
  }
  if (urlVersions.size === 0) return [];

  // Drift if URL major != info major
  const drifted = [...urlVersions].filter((u) => u !== infoMajor);
  if (drifted.length === 0) return [];

  return [
    {
      detectorId: 'walker:evolution:ev-53-url-info-version-drift',
      layer: 'walker-statistical',
      title: `URL version (${[...urlVersions].join(', ')}) differs from info.version major (${infoMajor})`,
      narration:
        `The spec declares \`info.version: "${infoVersion}"\` (major=\`${infoMajor}\`) but URL ` +
        `evidence shows version(s) \`v${[...urlVersions].join(', v')}\`. ` +
        `Reconciliation of mismatched version-axes is a breaking change to one or the other. ` +
        `Stripe and GitHub use date-based info.version that matches a header (no URL version); ` +
        `Microsoft Azure uses query-version that matches info.version. Sources: ` +
        `[SP-Adidas + Speakeasy versioning] [G-URL-1] [apiq H3].`,
      rationale:
        'When `info.version` and the URL-version disagree, codegen tools and clients have to ' +
        'pick one as canonical. The disagreement signals authoring drift — at minimum the spec ' +
        'will eventually have to bump one to match the other, which is breaking-by-definition.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Reconcile \`info.version\` (currently "${infoVersion}") with the URL-version (currently v${[...urlVersions].join(', v')}). Pick the canonical axis.`,
      meta: {
        patternId: 'EV-53',
        direction: 'drift',
        lens: 'evolution-friction',
        infoVersion,
        urlVersions: [...urlVersions],
      },
    },
  ];
}

// ===========================================================================
// EV-57 — Required declares fields not in properties (drift, error)
// ===========================================================================

export async function walkRequiredNotInProperties(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const offenders: Array<{ pointer: string; field: string }> = [];

  for (const { schema, pointer } of walkAllSchemas(spec)) {
    const required = getRequired(schema);
    if (required.length === 0) continue;
    const props = getProperties(schema);
    if (!props) continue;
    // Skip schemas whose `properties` is missing entirely — that's a different
    // pattern (schema with required but no properties).
    if (Object.keys(props).length === 0) continue;
    for (const fieldName of required) {
      if (!(fieldName in props)) {
        offenders.push({ pointer, field: fieldName });
      }
    }
  }

  if (offenders.length === 0) return [];

  const examples = formatExamples(
    offenders.slice(0, 3).map((o) => `${o.field} (${o.pointer || '/'})`),
    3
  );

  return [
    {
      detectorId: 'walker:evolution:ev-57-required-not-in-properties',
      layer: 'walker-statistical',
      title: `${offenders.length} \`required\` field(s) reference properties that don't exist`,
      narration:
        `${offenders.length} schema field-name(s) appear in \`required\` but not in \`properties\`. ` +
        `Examples: ${examples}. ` +
        `This is author drift — the field was renamed or removed but the \`required\` array wasn't ` +
        `updated. Validators may treat this differently (some pass any object, some always fail). ` +
        `Fixing the \`required\` list later changes the validation-passing-set = breaking. ` +
        `Sources: [apiq A3] [tri-linter consensus].`,
      rationale:
        'JSON Schema §6.5.3 ("required") declares a list of property names that MUST appear in ' +
        'a valid instance. Listing a name not in `properties` is undefined behaviour — most ' +
        'validators ignore it, but strict ones (AJV in strict mode) emit a meta-validation error. ' +
        'Either way, fixing the inconsistency changes which inputs validate.',
      category: 'correctness',
      severity: 'high',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Remove ${offenders.length} stale entry/entries from \`required\` array(s) or add the missing properties.`,
      meta: {
        patternId: 'EV-57',
        direction: 'drift',
        lens: 'evolution-friction',
        count: offenders.length,
      },
    },
  ];
}

// ===========================================================================
// Master orchestrator — run all evolution-statistical walkers
// ===========================================================================

const ALL_EVOLUTION_WALKERS = [
  walkRequiredHasDefault,
  walkVersioningAxisDrift,
  walkInconsistentErrorShape,
  walkRequestBodyNoJson,
  walkNullableAndRequired,
  walkAmbiguousPathTemplates,
  walkSchemaNameCollisions,
  walkUrlInfoVersionDrift,
  walkRequiredNotInProperties,
];

export async function walkEvolutionStatistical(
  spec: object,
  opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const all: DetectorFinding[] = [];
  for (const walker of ALL_EVOLUTION_WALKERS) {
    try {
      const findings = await walker(spec, opts);
      all.push(...findings);
    } catch (err) {
      // Defensive — one walker's crash shouldn't kill the rest.
      // eslint-disable-next-line no-console
      console.warn(
        `[walker:evolution] ${walker.name} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return all;
}
