/**
 * Naming-Pattern-Klassifikator Module — Stage A, Welle A T5 (Module-Class).
 *
 * Sources: Mining-round2-style.md naming-conventions catalog
 *          + AIP-140/AIP-122 (Google API-Improvement-Proposals)
 *          + JSON:API field-name conventions + Microsoft REST guidelines
 *          + apiq G1-G8 + Q (Round-1)
 * Patterns: 7 case-buckets (camelCase / snake_case / PascalCase / kebab-case /
 *           SCREAMING_SNAKE / lowercase / mixed) × 6 identifier-classes
 *           (property / schema / operationId / path-segment / param / header)
 * Lens: 5 (Style-Coherence), 4 (Client-Friction), 8 (Internal-Consistency)
 * Round: 1 (Round-1 G1-G8) + 2 (Round-2 SCF-16 + Lens-5 refinement)
 *
 * Maps to rules-brainstorm.md: G1 (Property-Naming-Konsistenz),
 * G2 (Schema-Naming-Konsistenz), G3 (operationId-Naming-Pattern),
 * G4 (Path-Segments lowercase), G6 (Path-Parameter-Naming-Konsistenz),
 * G7 (Tag-Naming-Konsistenz), G8 (Header-Parameter-Naming),
 * SCF-16 (AIP field-names lower_snake_case + lowerCamelCase).
 *
 * Stage-A Naming-Pattern-Klassifikator (Task #5).
 *
 * Spec-agnostic: classifies every identifier in the spec (property names,
 * schema names, operationIds, path segments, path parameters, tag names,
 * header-parameter names) into one of seven case-buckets and emits findings
 * for inconsistency-classes G1–G8 + Q from the Stage-A brainstorm.
 *
 * Buckets:
 *   - camelCase            — fooBar
 *   - snake_case           — foo_bar
 *   - kebab-case           — foo-bar
 *   - PascalCase           — FooBar
 *   - SCREAMING_SNAKE_CASE — FOO_BAR
 *   - mixed                — anything that combines separators (foo_BarBaz, foo-bar_baz)
 *   - acronym-heavy        — predominantly uppercase letters (HTTP, XMLHttpRequest)
 *   - lower                — single all-lowercase token (id, name, email) — neutral,
 *                            excluded from majority/minority counts because it's
 *                            compatible with snake_case AND camelCase AND kebab-case
 *   - other                — numeric / non-alphabetic / unclassifiable
 *
 * Threshold (per-class, suppress noise):
 *   emit a finding only when minority share >= 5% AND minority count >= 3.
 *
 * Findings emitted (one per identifier-class with a real inconsistency):
 *   G1  property-naming-mix
 *   G2  schema-naming-mix
 *   G3  operationid-pattern-drift (verbResource vs resource_verb — separate sub-check)
 *   G4  path-lowercase-mix         (path-segments)
 *   G6  path-param-naming-mix
 *   G7  tag-naming-mix
 *   G8  header-naming-mix
 *
 * Public API:
 *   - classifyIdentifier(name) => Pattern
 *   - collectIdentifiers(spec) => CollectedIdentifiers
 *   - runNamingClassifier(spec, opts) => Promise<DetectorFinding[]>
 *
 * CLI:
 *   cd scripts/spike && npx tsx deterministic/naming-classifier.ts <spec-name>
 */

import type { DetectorFinding, DetectorOptions } from './types.js';
import { walkOperations, walkComponentSchemas, pct } from './walkers/_shared.js';

// ===========================================================================
// Pattern classification
// ===========================================================================

export type NamingPattern =
  | 'camelCase'
  | 'snake_case'
  | 'kebab-case'
  | 'PascalCase'
  | 'SCREAMING_SNAKE_CASE'
  | 'mixed'
  | 'acronym-heavy'
  | 'lower'
  | 'other';

const ALL_PATTERNS: NamingPattern[] = [
  'camelCase',
  'snake_case',
  'kebab-case',
  'PascalCase',
  'SCREAMING_SNAKE_CASE',
  'mixed',
  'acronym-heavy',
  'lower',
  'other',
];

/**
 * Patterns that count as "neutral" — excluded from majority/minority calculations.
 * `lower` is a single-token all-lowercase identifier (id, name, email) that's
 * structurally compatible with snake_case AND camelCase AND kebab-case, so it
 * should not bias the majority computation.
 * `other` is unclassifiable (numeric, empty) — no signal either way.
 */
const NEUTRAL_PATTERNS: ReadonlySet<NamingPattern> = new Set(['lower', 'other']);

const HAS_UNDERSCORE = /_/;
const HAS_DASH = /-/;
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const ALL_UPPER_OR_UNDERSCORE = /^[A-Z0-9_]+$/;
const ALL_LOWER_OR_UNDERSCORE_OR_DIGIT = /^[a-z0-9_]+$/;
const ALL_LOWER_OR_DASH = /^[a-z0-9-]+$/;
const ALPHA = /[A-Za-z]/;

/**
 * Classify a single identifier into one of the eight buckets.
 * The function is deterministic and has no side effects.
 */
export function classifyIdentifier(raw: string): NamingPattern {
  if (!raw || typeof raw !== 'string') return 'other';
  const name = raw.trim();
  if (name.length === 0) return 'other';
  if (!ALPHA.test(name)) return 'other';

  const hasU = HAS_UNDERSCORE.test(name);
  const hasD = HAS_DASH.test(name);
  const hasUp = HAS_UPPER.test(name);
  const hasLo = HAS_LOWER.test(name);

  // Mixed if more than one separator-style co-occurs
  if (hasU && hasD) return 'mixed';

  // SCREAMING_SNAKE_CASE: all-upper letters, may contain digits + underscores, no lowercase
  if (ALL_UPPER_OR_UNDERSCORE.test(name) && hasUp && !hasD) {
    // Pure single-token UPPER (e.g. "API", "ID") — acronym
    if (!hasU) return 'acronym-heavy';
    return 'SCREAMING_SNAKE_CASE';
  }

  // snake_case
  if (hasU && !hasUp && ALL_LOWER_OR_UNDERSCORE_OR_DIGIT.test(name)) {
    return 'snake_case';
  }
  // snake_case-with-uppercase = mixed (foo_Bar)
  if (hasU && hasUp) return 'mixed';

  // kebab-case
  if (hasD && !hasUp && ALL_LOWER_OR_DASH.test(name)) {
    return 'kebab-case';
  }
  if (hasD && hasUp) return 'mixed';

  // No separators left here — pure alpha-numeric token
  if (!hasU && !hasD) {
    // PascalCase: starts upper + has lower
    if (hasUp && hasLo) {
      // Acronym-heavy: ratio of uppercase letters to total letters >= 50%
      const letters = name.replace(/[^A-Za-z]/g, '');
      const uppers = letters.replace(/[^A-Z]/g, '').length;
      const ratio = letters.length === 0 ? 0 : uppers / letters.length;
      const startsUpper = /^[A-Z]/.test(name);
      if (ratio >= 0.5 && letters.length >= 2) return 'acronym-heavy';
      if (startsUpper) return 'PascalCase';
      return 'camelCase';
    }
    // All-lower single token (`id`, `email`, `name`) — neutral. Compatible with
    // snake_case AND camelCase AND kebab-case, so excluded from the
    // majority/minority computation downstream.
    if (hasLo && !hasUp) return 'lower';
    // All-upper single token (acronym like "URL", "ID")
    if (hasUp && !hasLo) return 'acronym-heavy';
  }

  return 'other';
}

// ===========================================================================
// Identifier collection
// ===========================================================================

export interface IdentifierBucket {
  /** Name of the identifier class (e.g. "property", "schema", "operationId"). */
  className: string;
  /** Distinct identifier strings observed in this class. */
  names: string[];
  /** Per-name occurrence count (in case the same name shows up many times). */
  countsByName: Map<string, number>;
}

export interface CollectedIdentifiers {
  properties: IdentifierBucket;
  schemas: IdentifierBucket;
  operationIds: IdentifierBucket;
  pathSegments: IdentifierBucket;
  pathParameters: IdentifierBucket;
  tags: IdentifierBucket;
  headerParameters: IdentifierBucket;
}

function emptyBucket(name: string): IdentifierBucket {
  return { className: name, names: [], countsByName: new Map() };
}

function pushUnique(bucket: IdentifierBucket, name: string): void {
  const cur = bucket.countsByName.get(name) ?? 0;
  bucket.countsByName.set(name, cur + 1);
  if (cur === 0) bucket.names.push(name);
}

const PATH_PARAM_RE = /\{([^/{}]+)\}/g;

/**
 * Recursively collect property names from a schema-shaped subtree.
 * Tracks a WeakSet to avoid infinite recursion on cyclic schemas.
 */
function collectPropertyNames(
  node: unknown,
  bucket: IdentifierBucket,
  seen: WeakSet<object>,
): void {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (const v of node) collectPropertyNames(v, bucket, seen);
    return;
  }

  const obj = node as Record<string, unknown>;

  // properties: every key is a property identifier
  const props = obj.properties;
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    for (const propName of Object.keys(props as Record<string, unknown>)) {
      pushUnique(bucket, propName);
    }
  }

  // recurse into common composition keywords + nested schemas
  for (const key of [
    'properties',
    'items',
    'allOf',
    'oneOf',
    'anyOf',
    'not',
    'additionalProperties',
    'patternProperties',
  ]) {
    if (key in obj) collectPropertyNames(obj[key], bucket, seen);
  }
}

export function collectIdentifiers(spec: object): CollectedIdentifiers {
  const out: CollectedIdentifiers = {
    properties: emptyBucket('property'),
    schemas: emptyBucket('schema'),
    operationIds: emptyBucket('operationId'),
    pathSegments: emptyBucket('pathSegment'),
    pathParameters: emptyBucket('pathParameter'),
    tags: emptyBucket('tag'),
    headerParameters: emptyBucket('headerParameter'),
  };

  const root = spec as Record<string, unknown>;

  // ---- schemas (component schema names) + properties (recursive) ----
  const propSeen = new WeakSet<object>();
  for (const { name, schema } of walkComponentSchemas(spec)) {
    pushUnique(out.schemas, name);
    collectPropertyNames(schema, out.properties, propSeen);
  }

  // Property names also live in inline request/response bodies — walk operations
  // for those.
  for (const { operation } of walkOperations(spec)) {
    // requestBody.content[*].schema
    const reqBody = operation.requestBody;
    if (reqBody && typeof reqBody === 'object') {
      const content = (reqBody as Record<string, unknown>).content;
      if (content && typeof content === 'object') {
        for (const mediaType of Object.values(content as Record<string, unknown>)) {
          if (mediaType && typeof mediaType === 'object') {
            const sch = (mediaType as Record<string, unknown>).schema;
            if (sch) collectPropertyNames(sch, out.properties, propSeen);
          }
        }
      }
    }
    // responses.*.content[*].schema
    const responses = operation.responses;
    if (responses && typeof responses === 'object') {
      for (const respObj of Object.values(responses as Record<string, unknown>)) {
        if (respObj && typeof respObj === 'object') {
          const content = (respObj as Record<string, unknown>).content;
          if (content && typeof content === 'object') {
            for (const mediaType of Object.values(content as Record<string, unknown>)) {
              if (mediaType && typeof mediaType === 'object') {
                const sch = (mediaType as Record<string, unknown>).schema;
                if (sch) collectPropertyNames(sch, out.properties, propSeen);
              }
            }
          }
        }
      }
    }
  }

  // ---- operationIds + per-op tags + header parameters ----
  for (const { operation, pathItem } of walkOperations(spec)) {
    const opId = operation.operationId;
    if (typeof opId === 'string' && opId.length > 0) {
      pushUnique(out.operationIds, opId);
    }
    const tags = operation.tags;
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (typeof t === 'string' && t.length > 0) pushUnique(out.tags, t);
      }
    }
    // operation-level + path-level parameters
    const paramSources: unknown[] = [];
    if (Array.isArray(operation.parameters)) paramSources.push(...operation.parameters);
    if (Array.isArray(pathItem.parameters)) paramSources.push(...pathItem.parameters);
    for (const p of paramSources) {
      if (!p || typeof p !== 'object') continue;
      const pp = p as Record<string, unknown>;
      const pIn = pp.in;
      const pName = pp.name;
      if (typeof pName !== 'string' || pName.length === 0) continue;
      if (pIn === 'header') pushUnique(out.headerParameters, pName);
      // path-parameter naming: collected separately from {placeholder} parsing
      // below, but operation-declared path-params also count.
      if (pIn === 'path') pushUnique(out.pathParameters, pName);
    }
  }

  // ---- path-segments + path-parameters from path templates ----
  const paths = root.paths;
  if (paths && typeof paths === 'object') {
    for (const p of Object.keys(paths as Record<string, unknown>)) {
      if (!p || typeof p !== 'string' || !p.startsWith('/')) continue;
      // Parse path-parameters
      let m: RegExpExecArray | null;
      PATH_PARAM_RE.lastIndex = 0;
      while ((m = PATH_PARAM_RE.exec(p)) !== null) {
        const pname = m[1];
        if (pname && pname.length > 0) pushUnique(out.pathParameters, pname);
      }
      // Strip parameters, then split on `/` and collect non-empty literal segments
      const stripped = p.replace(/\{[^/{}]+\}/g, '');
      const segs = stripped.split('/').filter((s) => s.length > 0);
      for (const s of segs) pushUnique(out.pathSegments, s);
    }
  }

  // ---- top-level tag definitions ----
  const topTags = root.tags;
  if (Array.isArray(topTags)) {
    for (const t of topTags) {
      if (t && typeof t === 'object') {
        const name = (t as Record<string, unknown>).name;
        if (typeof name === 'string' && name.length > 0) pushUnique(out.tags, name);
      }
    }
  }

  return out;
}

// ===========================================================================
// Distribution helpers
// ===========================================================================

export interface PatternDistribution {
  /** Total identifiers (including neutral). */
  total: number;
  /** Identifiers in non-neutral buckets only — denominator for majority/minority. */
  classifiedTotal: number;
  counts: Record<NamingPattern, number>;
  /** Names assigned to each pattern (capped to a sample for narration). */
  examples: Record<NamingPattern, string[]>;
  /** The non-neutral bucket holding the most names — null when classifiedTotal is 0. */
  majority: NamingPattern | null;
  /** Non-neutral buckets that satisfy minority-noise threshold (>=5% AND >=3 names). */
  significantMinorities: NamingPattern[];
}

const MINORITY_SHARE_THRESHOLD = 0.05;
const MINORITY_COUNT_THRESHOLD = 3;
const EXAMPLE_CAP = 5;

export function distributionFor(bucket: IdentifierBucket): PatternDistribution {
  const counts: Record<NamingPattern, number> = {
    camelCase: 0,
    snake_case: 0,
    'kebab-case': 0,
    PascalCase: 0,
    SCREAMING_SNAKE_CASE: 0,
    mixed: 0,
    'acronym-heavy': 0,
    lower: 0,
    other: 0,
  };
  const examples: Record<NamingPattern, string[]> = {
    camelCase: [],
    snake_case: [],
    'kebab-case': [],
    PascalCase: [],
    SCREAMING_SNAKE_CASE: [],
    mixed: [],
    'acronym-heavy': [],
    lower: [],
    other: [],
  };

  for (const name of bucket.names) {
    const p = classifyIdentifier(name);
    counts[p] += 1;
    if (examples[p].length < EXAMPLE_CAP) examples[p].push(name);
  }

  const total = bucket.names.length;
  // Majority/minority compute over non-neutral patterns only.
  let classifiedTotal = 0;
  for (const p of ALL_PATTERNS) {
    if (NEUTRAL_PATTERNS.has(p)) continue;
    classifiedTotal += counts[p];
  }

  let majority: NamingPattern | null = null;
  let bestCount = -1;
  for (const p of ALL_PATTERNS) {
    if (NEUTRAL_PATTERNS.has(p)) continue;
    if (counts[p] > bestCount) {
      bestCount = counts[p];
      majority = p;
    }
  }
  if (classifiedTotal === 0) majority = null;

  const significantMinorities: NamingPattern[] = [];
  if (classifiedTotal > 0 && majority !== null) {
    for (const p of ALL_PATTERNS) {
      if (NEUTRAL_PATTERNS.has(p)) continue;
      if (p === majority) continue;
      const c = counts[p];
      if (c >= MINORITY_COUNT_THRESHOLD && c / classifiedTotal >= MINORITY_SHARE_THRESHOLD) {
        significantMinorities.push(p);
      }
    }
  }

  return { total, classifiedTotal, counts, examples, majority, significantMinorities };
}

// ===========================================================================
// Finding builders
// ===========================================================================

interface ClassFindingConfig {
  detectorId: string;
  className: string;
  classLabelPlural: string;
  /** OpenAPI / convention reference text for rationale. */
  rationaleConvention: string;
  /** Severity of the emitted finding. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Category of the emitted finding. */
  category: 'clarity' | 'design' | 'risk' | 'correctness';
}

function distributionLine(dist: PatternDistribution): string {
  const parts: string[] = [];
  for (const p of ALL_PATTERNS) {
    if (dist.counts[p] === 0) continue;
    const share = pct(dist.counts[p], dist.total);
    parts.push(`${p}: ${dist.counts[p]} (${share}%)`);
  }
  return parts.join(', ');
}

function exampleLine(dist: PatternDistribution, p: NamingPattern): string {
  const ex = dist.examples[p];
  if (ex.length === 0) return '(none)';
  return ex.map((e) => `\`${e}\``).join(', ');
}

function buildClassFinding(
  cfg: ClassFindingConfig,
  bucket: IdentifierBucket,
  dist: PatternDistribution,
): DetectorFinding | null {
  if (dist.classifiedTotal === 0) return null;
  if (dist.majority === null) return null;
  if (dist.significantMinorities.length === 0) return null;

  const majorityCount = dist.counts[dist.majority];
  const majorityShare = pct(majorityCount, dist.classifiedTotal);
  const minoritySummary = dist.significantMinorities
    .map((p) => `${dist.counts[p]} ${p}`)
    .join(', ');
  const majorityExamples = exampleLine(dist, dist.majority);
  const minorityExamples = dist.significantMinorities
    .map((p) => `${p}: ${exampleLine(dist, p)}`)
    .join('; ');

  const neutralCount = dist.total - dist.classifiedTotal;
  const neutralNote =
    neutralCount > 0
      ? ` (${neutralCount} additional single-token / numeric identifiers were classified as neutral and excluded from the comparison).`
      : '';

  const title = `${cfg.classLabelPlural} use mixed naming conventions (${dist.majority} majority)`;

  const narration =
    `${dist.classifiedTotal} distinct ${cfg.classLabelPlural} carry a discernible case-pattern. ` +
    `Majority (${majorityCount}/${dist.classifiedTotal}, ${majorityShare}%) follow ${dist.majority} ` +
    `(examples: ${majorityExamples}). ` +
    `${minoritySummary} diverge: ${minorityExamples}. ` +
    `Full distribution: ${distributionLine(dist)}.${neutralNote} ` +
    `Mixed naming forces consumers (codegen pipelines, SDK authors, AI agents) to ` +
    `special-case the divergent identifiers, undermining the implicit contract that ` +
    `OpenAPI codegen tooling relies on.`;

  return {
    detectorId: cfg.detectorId,
    layer: 'walker-statistical',
    title,
    narration,
    rationale: cfg.rationaleConvention,
    category: cfg.category,
    severity: cfg.severity,
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: `Standardise ${cfg.classLabelPlural} on ${dist.majority} (${minoritySummary} diverge today).`,
    meta: {
      className: cfg.className,
      total: dist.total,
      classifiedTotal: dist.classifiedTotal,
      majority: dist.majority,
      majorityCount,
      majorityShare,
      minorities: dist.significantMinorities.map((p) => ({
        pattern: p,
        count: dist.counts[p],
        share: pct(dist.counts[p], dist.classifiedTotal),
      })),
      counts: dist.counts,
    },
  };
}

// ---------------------------------------------------------------------------
// G3 — operationId pattern drift (verbResource vs resource_verb)
// ---------------------------------------------------------------------------

const VERB_PREFIX_RE = /^(get|list|create|update|delete|patch|put|post|fetch|find|search|set|add|remove|destroy|read|write|new|do)([A-Z_]|$)/;

function operationIdShape(opId: string): 'verb-first' | 'verb-last' | 'unknown' {
  if (VERB_PREFIX_RE.test(opId)) return 'verb-first';
  // verb-last: ends with one of the verb tokens, separated by underscore or
  // PascalCase boundary
  const verbs = [
    'get',
    'list',
    'create',
    'update',
    'delete',
    'patch',
    'fetch',
    'find',
    'search',
    'set',
    'add',
    'remove',
    'destroy',
    'read',
    'write',
  ];
  const lower = opId.toLowerCase();
  for (const v of verbs) {
    if (lower.endsWith('_' + v)) return 'verb-last';
    if (lower.endsWith(v) && opId.length > v.length) {
      // PascalCase boundary check: char before verb must be lowercase, suffix-verb capitalised in op-id
      const tail = opId.slice(opId.length - v.length);
      const before = opId.charAt(opId.length - v.length - 1);
      if (
        tail.charAt(0) === tail.charAt(0).toUpperCase() &&
        before === before.toLowerCase() &&
        before !== ''
      ) {
        return 'verb-last';
      }
    }
  }
  return 'unknown';
}

interface OperationIdShapeResult {
  finding: DetectorFinding | null;
}

function buildOperationIdDriftFinding(bucket: IdentifierBucket): OperationIdShapeResult {
  const verbFirst: string[] = [];
  const verbLast: string[] = [];
  const unknown: string[] = [];
  for (const id of bucket.names) {
    const s = operationIdShape(id);
    if (s === 'verb-first') verbFirst.push(id);
    else if (s === 'verb-last') verbLast.push(id);
    else unknown.push(id);
  }
  const total = verbFirst.length + verbLast.length;
  if (total === 0) return { finding: null };
  const minority =
    verbFirst.length < verbLast.length ? { shape: 'verb-first', list: verbFirst } : { shape: 'verb-last', list: verbLast };
  const majority =
    verbFirst.length < verbLast.length ? { shape: 'verb-last', list: verbLast } : { shape: 'verb-first', list: verbFirst };

  if (minority.list.length < MINORITY_COUNT_THRESHOLD) return { finding: null };
  if (minority.list.length / total < MINORITY_SHARE_THRESHOLD) return { finding: null };

  const minoritySamples = minority.list.slice(0, 5).map((n) => `\`${n}\``).join(', ');
  const majoritySamples = majority.list.slice(0, 5).map((n) => `\`${n}\``).join(', ');

  return {
    finding: {
      detectorId: 'walker:naming-operationid-drift',
      layer: 'walker-statistical',
      title: `operationId pattern drift: ${minority.list.length} use ${minority.shape}, ${majority.list.length} use ${majority.shape}`,
      narration:
        `${total} operationIds were classified by verb-position. ` +
        `${majority.list.length} follow ${majority.shape} (examples: ${majoritySamples}); ` +
        `${minority.list.length} follow ${minority.shape} (examples: ${minoritySamples}). ` +
        `SDK code-generators that derive method names from operationIds (\`Stripe.charges.create\`, ` +
        `\`github.repos.listForOrg\`) emit irregular SDK surface area when the underlying spec ` +
        `mixes verb-first and verb-last shapes — consumers then have to memorise per-resource ` +
        `naming exceptions.`,
      rationale:
        'OpenAPI 3.0 §4.7.4 names operationId as "a unique string used to identify the operation"; ' +
        'the de-facto industry pattern (GitHub, Stripe, Twilio) commits to a single verb-position ' +
        'convention spec-wide so SDK code-generators emit a uniform method-naming style.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Standardise operationIds on ${majority.shape}; ${minority.list.length} currently use ${minority.shape}.`,
      meta: {
        verbFirst: verbFirst.length,
        verbLast: verbLast.length,
        unknown: unknown.length,
        majority: majority.shape,
        minority: minority.shape,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// G4 — path lowercase consistency (every path-segment must be lowercase)
// ---------------------------------------------------------------------------

function buildPathLowercaseFinding(bucket: IdentifierBucket): DetectorFinding | null {
  const total = bucket.names.length;
  if (total === 0) return null;
  const nonLower: string[] = [];
  for (const seg of bucket.names) {
    if (seg !== seg.toLowerCase()) nonLower.push(seg);
  }
  if (nonLower.length < MINORITY_COUNT_THRESHOLD) return null;
  if (nonLower.length / total < MINORITY_SHARE_THRESHOLD) return null;

  const samples = nonLower.slice(0, 5).map((s) => `\`${s}\``).join(', ');
  const share = pct(nonLower.length, total);

  return {
    detectorId: 'walker:naming-path-lowercase',
    layer: 'walker-statistical',
    title: `${nonLower.length} path segments contain uppercase letters`,
    narration:
      `Out of ${total} distinct path segments, ${nonLower.length} (${share}%) contain uppercase ` +
      `characters. Examples: ${samples}. ` +
      `RESTful URL conventions (RFC 3986 §6.2.2.1, "Case Normalization") and the broader REST ` +
      `community style guides (Microsoft REST §7.5, Google AIP-122) all require lowercase ` +
      `path segments. Mixed-case URLs cause case-sensitivity bugs in proxies, CDN caches, and ` +
      `client-routing libraries that normalise case differently.`,
    rationale:
      'RFC 3986 §6.2.2.1 ("Case Normalization") notes that the path component of a URI is ' +
      'case-sensitive in general, which is why the REST-API style guides (Microsoft REST §7.5, ' +
      'Google AIP-122) standardise on lowercase path segments to avoid ambiguity.',
    category: 'design',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: `Lowercase the ${nonLower.length} non-lowercase path segments.`,
    meta: { total, nonLower: nonLower.length, share, examples: nonLower.slice(0, 10) },
  };
}

// ===========================================================================
// Public entry-point
// ===========================================================================

const PROPERTY_CONFIG: ClassFindingConfig = {
  detectorId: 'walker:naming-property-mix',
  className: 'property',
  classLabelPlural: 'property names',
  severity: 'medium',
  category: 'design',
  rationaleConvention:
    'OpenAPI 3.0 inherits JSON Schema\'s freedom on property naming, but consumers' +
    ' (codegen, SDK authors) expect a single naming style spec-wide. Mixed property naming ' +
    'forces SDK-generators to emit per-property name-conversion logic and breaks the ' +
    'implicit contract between spec and tooling.',
};

const SCHEMA_CONFIG: ClassFindingConfig = {
  detectorId: 'walker:naming-schema-mix',
  className: 'schema',
  classLabelPlural: 'component schema names',
  severity: 'medium',
  category: 'design',
  rationaleConvention:
    'Component schema names appear directly in generated SDK type names. The de-facto industry ' +
    'pattern (Stripe, GitHub, Twilio) is PascalCase spec-wide. Mixed casing here translates ' +
    'into mixed type-naming in SDKs, which contradicts the language conventions of TypeScript, ' +
    'Java, Go, etc.',
};

const PATH_PARAM_CONFIG: ClassFindingConfig = {
  detectorId: 'walker:naming-path-param-mix',
  className: 'pathParameter',
  classLabelPlural: 'path parameters',
  severity: 'medium',
  category: 'design',
  rationaleConvention:
    'Path-parameter names are user-visible in URLs and in generated client method signatures. ' +
    'A single naming style spec-wide ({user_id} or {userId}, never both) avoids consumer ' +
    'confusion and matches how REST style guides (Google AIP-122, Microsoft REST §7) treat ' +
    'identifiers.',
};

const TAG_CONFIG: ClassFindingConfig = {
  detectorId: 'walker:naming-tag-mix',
  className: 'tag',
  classLabelPlural: 'tags',
  severity: 'low',
  category: 'clarity',
  rationaleConvention:
    'Tags drive documentation grouping (ReDoc, SwaggerUI, Stoplight) and SDK module naming. ' +
    'Mixed tag casing fragments the doc index and produces inconsistent module names in ' +
    'generated SDKs (e.g. Stripe groups under \`Customers\` vs \`payment_methods\`).',
};

const HEADER_CONFIG: ClassFindingConfig = {
  detectorId: 'walker:naming-header-mix',
  className: 'headerParameter',
  classLabelPlural: 'header parameters',
  severity: 'medium',
  category: 'design',
  rationaleConvention:
    'RFC 7230 §3.2 makes header field-names case-insensitive, but the de-facto convention is ' +
    'Title-Case-With-Dashes for custom headers (X-Request-Id, Idempotency-Key). Mixed casing ' +
    'and mixed separators across header parameters is a clarity regression and surfaces in ' +
    'generated SDK setter names.',
};

export async function runNamingClassifier(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const ids = collectIdentifiers(spec);
  const findings: DetectorFinding[] = [];

  // G1 — properties
  {
    const dist = distributionFor(ids.properties);
    const f = buildClassFinding(PROPERTY_CONFIG, ids.properties, dist);
    if (f) findings.push(f);
  }
  // G2 — schemas
  {
    const dist = distributionFor(ids.schemas);
    const f = buildClassFinding(SCHEMA_CONFIG, ids.schemas, dist);
    if (f) findings.push(f);
  }
  // G3 — operationId verb-position drift (separate sub-check, complements case-pattern)
  {
    const r = buildOperationIdDriftFinding(ids.operationIds);
    if (r.finding) findings.push(r.finding);
  }
  // G4 — path lowercase
  {
    const f = buildPathLowercaseFinding(ids.pathSegments);
    if (f) findings.push(f);
  }
  // G6 — path-parameter naming mix
  {
    const dist = distributionFor(ids.pathParameters);
    const f = buildClassFinding(PATH_PARAM_CONFIG, ids.pathParameters, dist);
    if (f) findings.push(f);
  }
  // G7 — tag naming mix
  {
    const dist = distributionFor(ids.tags);
    const f = buildClassFinding(TAG_CONFIG, ids.tags, dist);
    if (f) findings.push(f);
  }
  // G8 — header parameter mix
  {
    const dist = distributionFor(ids.headerParameters);
    const f = buildClassFinding(HEADER_CONFIG, ids.headerParameters, dist);
    if (f) findings.push(f);
  }

  return findings;
}

// ===========================================================================
// CLI
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
    console.error('Usage: tsx deterministic/naming-classifier.ts <spec-name>');
    process.exit(1);
  }

  const specDir = path.join(EXAMPLES_DIR, specName);
  if (!fs.existsSync(specDir)) {
    console.error(`Spec directory not found: ${specDir}`);
    process.exit(1);
  }

  let specPath: string | null = null;
  for (const ext of ['json', 'yaml', 'yml']) {
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

  const raw = fs.readFileSync(specPath, 'utf8');
  let spec: object;
  if (specPath.endsWith('.json')) {
    spec = JSON.parse(raw);
  } else {
    const YAML = (await import('yaml')).default;
    spec = YAML.parse(raw) as object;
  }

  console.log(`Loaded ${specPath}`);

  const ids = collectIdentifiers(spec);
  console.log('');
  console.log(`Identifier counts:`);
  console.log(`  property:           ${ids.properties.names.length}`);
  console.log(`  schema:             ${ids.schemas.names.length}`);
  console.log(`  operationId:        ${ids.operationIds.names.length}`);
  console.log(`  pathSegment:        ${ids.pathSegments.names.length}`);
  console.log(`  pathParameter:      ${ids.pathParameters.names.length}`);
  console.log(`  tag:                ${ids.tags.names.length}`);
  console.log(`  headerParameter:    ${ids.headerParameters.names.length}`);

  for (const [label, bucket] of [
    ['property', ids.properties],
    ['schema', ids.schemas],
    ['operationId', ids.operationIds],
    ['pathSegment', ids.pathSegments],
    ['pathParameter', ids.pathParameters],
    ['tag', ids.tags],
    ['headerParameter', ids.headerParameters],
  ] as const) {
    const dist = distributionFor(bucket);
    if (dist.total === 0) continue;
    console.log('');
    console.log(`[${label}] (${dist.total} distinct, majority=${dist.majority})`);
    for (const p of ALL_PATTERNS) {
      if (dist.counts[p] === 0) continue;
      console.log(`  ${p.padEnd(22)} ${dist.counts[p].toString().padStart(5)}  (${pct(dist.counts[p], dist.total)}%)`);
    }
  }

  const findings = await runNamingClassifier(spec);
  console.log('');
  console.log(`Findings emitted: ${findings.length}`);
  for (const f of findings) {
    console.log('');
    console.log(`[${f.detectorId}]`);
    console.log(`  title: ${f.title}`);
    console.log(`  meta:  ${JSON.stringify(f.meta)}`);
  }
}

{
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
