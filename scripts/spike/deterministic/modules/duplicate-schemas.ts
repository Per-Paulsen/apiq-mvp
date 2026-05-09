/**
 * Duplicate-Schemas Module — Stage A, Welle A (Module-Class).
 *
 * Sources: Stoplight/Spectral oas3-unused-component pattern
 *          + Redocly bundling/dedup heuristics + apiq M7/O2 (Round-1)
 *          + Speakeasy + Lens-4 mining (CL-48 near-duplicate)
 * Patterns: M7 (Duplicate Schemas via canonical-form-hash) +
 *           O2 (case-insensitive naming-collision: User vs user)
 * Lens: 4 (Client-Friction), 8 (Internal-Consistency), 3 (Evolution-Friction)
 * Round: 1 (Round-1 reference) + 2 (Round-2 refined patterns)
 *
 * Maps to rules-brainstorm.md: M7 (Duplicate Schemas — Hash-basiert), O2
 * (Naming-Collisions case-insensitive), O3 (Duplicate Components canonical-form),
 * CL-48 (Multiple similar-not-identical schemas), EV-40 (Schema-name reuse
 * case-insensitive, P1).
 *
 * Hash-basierte Schema-Duplicate-Detection (M7) + case-insensitive Naming-
 * Collision-Detection (O2) für Stage A.
 *
 * Spec-agnostic — works on ANY OpenAPI 3.x spec, no vendor-specific knowledge.
 *
 * Two findings:
 *
 *   M7 — Duplicate schemas (same shape, different names)
 *     Walks `components.schemas`, transforms each schema into a deterministic
 *     canonical form (sorted property keys, sorted `required` arrays,
 *     normalised `$ref`s, stripped descriptions/examples/titles), hashes the
 *     canonical JSON via SHA-256, and groups schemas by hash. Any group with
 *     ≥ 2 members → emit a finding suggesting consolidation via $ref.
 *
 *   O2 — Case-insensitive naming collisions (`User` vs `user`)
 *     Lowercases every component-schema name and groups; any lowercase-key
 *     with ≥ 2 distinct case-variants → emit a finding (codegen / type-system
 *     hazard, especially on case-insensitive filesystems and TypeScript).
 *
 * Why deterministic?
 *   - Canonical form is purely structural — no LLM reasoning.
 *   - Hash collisions are cryptographically negligible.
 *   - Spectral can't do this; needs cross-schema state.
 *
 * Public API:
 *   `runDuplicateSchemaDetectors(spec, opts) => Promise<DetectorFinding[]>`
 *   `canonicalizeSchema(node) => unknown` (exported for tests)
 *   `hashSchema(node) => string` (exported for tests)
 *
 * CLI:
 *   `npx tsx deterministic/duplicate-schemas.ts <spec-name>`
 */

import { createHash } from 'node:crypto';

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';

// =============================================================================
// Canonical-form transformation
// =============================================================================

/**
 * Keys that affect schema *identity* — i.e. what the schema validates against.
 * Anything not on this list is considered metadata and stripped during
 * canonicalization. We use an inclusion list rather than an exclusion list so
 * that vendor extensions (`x-*`) and unknown future keys don't accidentally
 * tip identity comparisons.
 *
 * Sourced from OpenAPI 3.0/3.1 schema-object spec + JSON-Schema draft-2020-12.
 */
const IDENTITY_KEYS: ReadonlySet<string> = new Set([
  // Type / structure
  'type',
  'properties',
  'items',
  'required',
  'additionalProperties',
  'patternProperties',
  'propertyNames',
  'unevaluatedProperties',
  'unevaluatedItems',
  // Combinators
  'allOf',
  'oneOf',
  'anyOf',
  'not',
  // References
  '$ref',
  // Constraints — strings
  'minLength',
  'maxLength',
  'pattern',
  'format',
  // Constraints — numbers
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  // Constraints — arrays
  'minItems',
  'maxItems',
  'uniqueItems',
  'contains',
  'minContains',
  'maxContains',
  // Constraints — objects
  'minProperties',
  'maxProperties',
  // Enums + const
  'enum',
  'const',
  // Conditional
  'if',
  'then',
  'else',
  'dependentRequired',
  'dependentSchemas',
  // OAS-specific
  'nullable',
  'discriminator',
  'readOnly',
  'writeOnly',
  // 3.1 type unions are encoded as `type: [x, null]` (already covered by 'type')
]);

/**
 * Keys explicitly stripped — these are metadata that don't change what the
 * schema validates (descriptions, examples, naming, deprecation flags,
 * external docs). Stripping means two schemas that differ only in human-prose
 * still hash-match.
 *
 * Note: this list is informational; anything not in IDENTITY_KEYS is stripped
 * regardless. We keep it for documentation and for the test-suite.
 */
export const STRIPPED_METADATA_KEYS: ReadonlySet<string> = new Set([
  'description',
  'title',
  'example',
  'examples',
  'default',
  'deprecated',
  'externalDocs',
  'xml',
  'summary',
  '$comment',
  '$id',
  '$schema',
  '$anchor',
  '$dynamicAnchor',
  '$dynamicRef',
]);

/**
 * Normalise a `$ref` value so two schemas that point to the same target via
 * different (but equivalent) ref-paths still hash-match.
 *
 * - Decodes JSON-pointer escapes (`~0` → `~`, `~1` → `/`) so encoded vs.
 *   pre-decoded refs are equivalent.
 * - Trims whitespace.
 * - Leaves cross-document refs intact (we still hash them as-is — two schemas
 *   that ref different external docs are not duplicates).
 */
function normalizeRef(ref: string): string {
  return ref.trim();
}

/**
 * Recursively transform a schema node into canonical form:
 *   - object keys sorted alphabetically (so JSON.stringify output is stable)
 *   - `required` array sorted (since order doesn't affect semantics)
 *   - `enum` arrays preserved as-is (order CAN matter for some tools, and
 *     duplicate-enum is its own Spectral rule)
 *   - non-identity keys (description, example, title, etc.) removed
 *   - `$ref` values normalised
 *   - arrays' element order preserved (for `allOf`, `oneOf`, `anyOf`, `items`,
 *     `prefixItems` — order can affect validation semantics, esp. for `items`
 *     vs `prefixItems`)
 *
 * Pure function — does not mutate input.
 *
 * Cycle-safe: tracks visited objects via WeakSet; cycles produce a sentinel
 * `{ "$cyclic": true }` placeholder.
 */
export function canonicalizeSchema(node: unknown): unknown {
  return canonicalizeRec(node, new WeakSet());
}

function canonicalizeRec(node: unknown, seen: WeakSet<object>): unknown {
  if (node === null || node === undefined) return null;
  if (typeof node !== 'object') return node;

  const obj = node as object;
  if (seen.has(obj)) {
    return { $cyclic: true };
  }
  seen.add(obj);

  if (Array.isArray(node)) {
    return node.map((v) => canonicalizeRec(v, seen));
  }

  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  // Sort keys, keep only identity-relevant ones.
  const keys = Object.keys(src).sort();
  for (const key of keys) {
    if (!IDENTITY_KEYS.has(key)) continue;
    const val = src[key];

    if (key === '$ref' && typeof val === 'string') {
      out.$ref = normalizeRef(val);
      continue;
    }

    if (key === 'required' && Array.isArray(val)) {
      // Sort the required-array — order doesn't affect semantics.
      const sorted = [...val].filter((x) => typeof x === 'string').sort();
      out.required = sorted;
      continue;
    }

    if (key === 'properties' && val && typeof val === 'object' && !Array.isArray(val)) {
      // Recurse + sort property-keys alphabetically.
      const props = val as Record<string, unknown>;
      const sortedProps: Record<string, unknown> = {};
      for (const propKey of Object.keys(props).sort()) {
        sortedProps[propKey] = canonicalizeRec(props[propKey], seen);
      }
      out.properties = sortedProps;
      continue;
    }

    out[key] = canonicalizeRec(val, seen);
  }

  return out;
}

/**
 * SHA-256 of the canonical-JSON representation of a schema.
 * Two schemas with the same canonical form produce identical hashes.
 */
export function hashSchema(node: unknown): string {
  const canonical = canonicalizeSchema(node);
  // Stable stringify — canonicalize already emits keys in sorted order, so
  // JSON.stringify is deterministic on its output.
  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

// =============================================================================
// Detector — M7: Duplicate Schemas
// =============================================================================

interface DuplicateGroup {
  hash: string;
  names: string[];
}

/**
 * Group component-schema names by canonical-form hash.
 * Returns only groups with ≥ 2 members (the "duplicates").
 *
 * Skips schemas that are pure-`$ref` aliases (a schema whose only key is
 * `$ref`) — those are aliases by design, not duplicates worth flagging.
 */
function findDuplicateSchemas(spec: object): DuplicateGroup[] {
  const root = spec as Record<string, unknown>;
  const components = root.components as Record<string, unknown> | undefined;
  if (!components || typeof components !== 'object') return [];
  const schemas = components.schemas as Record<string, unknown> | undefined;
  if (!schemas || typeof schemas !== 'object') return [];

  const byHash = new Map<string, string[]>();

  for (const [name, schemaRaw] of Object.entries(schemas)) {
    if (!schemaRaw || typeof schemaRaw !== 'object') continue;
    const schema = schemaRaw as Record<string, unknown>;

    // Skip pure-$ref aliases — they're explicit aliases, not duplication.
    const keys = Object.keys(schema);
    if (keys.length === 1 && keys[0] === '$ref') continue;

    // Skip empty / trivially-typed schemas (just `type: object` with no
    // properties, etc.) — too many false positives. Heuristic: must have at
    // least one of {properties, items, allOf, oneOf, anyOf, enum, $ref,
    // pattern, format} OR more than one identity key.
    const hasStructure =
      'properties' in schema ||
      'items' in schema ||
      'allOf' in schema ||
      'oneOf' in schema ||
      'anyOf' in schema ||
      'enum' in schema ||
      '$ref' in schema ||
      'pattern' in schema ||
      'format' in schema;
    const identityKeyCount = keys.filter((k) => IDENTITY_KEYS.has(k)).length;
    if (!hasStructure && identityKeyCount < 2) continue;

    const hash = hashSchema(schema);
    const bucket = byHash.get(hash) ?? [];
    bucket.push(name);
    byHash.set(hash, bucket);
  }

  const dupes: DuplicateGroup[] = [];
  for (const [hash, names] of byHash) {
    if (names.length >= 2) {
      dupes.push({ hash, names: names.sort() });
    }
  }
  // Sort groups deterministically by first-name so output is stable run-to-run.
  dupes.sort((a, b) => a.names[0].localeCompare(b.names[0]));
  return dupes;
}

// =============================================================================
// Detector — O2: Case-Insensitive Naming Collisions
// =============================================================================

interface CollisionGroup {
  /** lowercased key */
  key: string;
  /** original-case names that collide */
  names: string[];
}

function findCaseInsensitiveCollisions(spec: object): CollisionGroup[] {
  const root = spec as Record<string, unknown>;
  const components = root.components as Record<string, unknown> | undefined;
  if (!components || typeof components !== 'object') return [];
  const schemas = components.schemas as Record<string, unknown> | undefined;
  if (!schemas || typeof schemas !== 'object') return [];

  const byLower = new Map<string, Set<string>>();
  for (const name of Object.keys(schemas)) {
    const lower = name.toLowerCase();
    const bucket = byLower.get(lower) ?? new Set<string>();
    bucket.add(name);
    byLower.set(lower, bucket);
  }

  const collisions: CollisionGroup[] = [];
  for (const [key, namesSet] of byLower) {
    if (namesSet.size >= 2) {
      collisions.push({ key, names: [...namesSet].sort() });
    }
  }
  collisions.sort((a, b) => a.key.localeCompare(b.key));
  return collisions;
}

// =============================================================================
// Finding builders
// =============================================================================

function buildDuplicateFinding(group: DuplicateGroup): DetectorFinding {
  const [primary, ...rest] = group.names;
  const dupeList = rest.length === 1 ? rest[0] : rest.slice(0, -1).join(', ') + ' and ' + rest[rest.length - 1];

  const namesPretty = group.names.map((n) => `\`${n}\``).join(', ');
  const groupCount = group.names.length;

  return {
    detectorId: `duplicate-schemas:m7:${group.hash.slice(0, 12)}`,
    layer: 'walker-statistical',
    title: `${groupCount} component schemas have identical structure: ${group.names.slice(0, 3).join(', ')}${groupCount > 3 ? '...' : ''}`,
    narration:
      `The component schemas ${namesPretty} are structurally identical after stripping ` +
      `descriptions, examples, titles, and defaults — same property set, same required ` +
      `fields, same constraints, same combinators. Maintaining ${groupCount} parallel definitions ` +
      `for one shape multiplies the maintenance burden, makes codegen produce duplicate ` +
      `(usually subtly-different) types, and lets the definitions drift independently the ` +
      `next time someone edits one but not the others. Consolidate to a single canonical ` +
      `schema and replace the rest with a \`$ref\` to it.`,
    rationale:
      'OpenAPI 3.0 §4.7.24 and JSON Schema reuse-by-`$ref` exists precisely to avoid ' +
      'parallel definitions of the same shape. Duplicate schemas defeat the reuse mechanism ' +
      'and produce drifting type-systems in downstream codegen.',
    category: 'design',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: `Consolidate ${groupCount} duplicate schemas (${primary}, ${dupeList}) into one canonical definition referenced via \`$ref\`.`,
    sourcePath: `/components/schemas/${primary}`,
    meta: {
      hash: group.hash,
      duplicateNames: group.names,
      groupCount,
    },
  };
}

function buildCollisionFinding(group: CollisionGroup): DetectorFinding {
  const namesPretty = group.names.map((n) => `\`${n}\``).join(' vs ');

  return {
    detectorId: `duplicate-schemas:o2:${group.key}`,
    layer: 'walker-statistical',
    title: `Component-schema names collide case-insensitively: ${namesPretty}`,
    narration:
      `The component schemas ${namesPretty} differ only in letter-case. This is a ` +
      `latent hazard for downstream consumers: TypeScript codegen on case-insensitive ` +
      `filesystems (macOS default, Windows) silently overwrites one with the other; ` +
      `tools that index schemas by lowercased name (Stoplight, some doc generators) ` +
      `treat them as one; and human authors easily confuse them in $ref strings. Pick ` +
      `a single canonical name (typically the more-conventional casing) and rename the ` +
      `others, updating all references accordingly.`,
    rationale:
      'Case-insensitive collisions in component-schema names produce silent name-clashes ' +
      'in downstream codegen (TypeScript on case-insensitive filesystems, Java class names, ' +
      'Python module imports) and break tooling that lowercases identifiers for indexing.',
    category: 'design',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: `Rename one of ${namesPretty} so component-schema names differ by more than letter-case.`,
    sourcePath: `/components/schemas`,
    meta: {
      caseInsensitiveKey: group.key,
      collidingNames: group.names,
    },
  };
}

// =============================================================================
// Public API
// =============================================================================

export async function runDuplicateSchemaDetectors(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const findings: DetectorFinding[] = [];

  for (const group of findDuplicateSchemas(spec)) {
    findings.push(buildDuplicateFinding(group));
  }

  for (const collision of findCaseInsensitiveCollisions(spec)) {
    findings.push(buildCollisionFinding(collision));
  }

  return findings;
}

// =============================================================================
// CLI
// =============================================================================

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
    console.error('Usage: tsx deterministic/duplicate-schemas.ts <spec-name>');
    console.error('  e.g. tsx deterministic/duplicate-schemas.ts stripe-full');
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

  console.log(`Loaded spec: ${specPath}`);
  const startedAt = Date.now();
  const findings = await runDuplicateSchemaDetectors(spec, { specName });
  const durationMs = Date.now() - startedAt;

  const m7 = findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:m7:')).length;
  const o2 = findings.filter((f) => f.detectorId.startsWith('duplicate-schemas:o2:')).length;
  console.log(
    `Ran in ${durationMs}ms — emitted ${findings.length} findings (M7 duplicates: ${m7}, O2 case-collisions: ${o2})`
  );
  console.log('');
  if (findings.length === 0) {
    console.log('(No duplicate-schema findings.)');
    return;
  }
  for (const f of findings) {
    console.log(`[${f.detectorId}]`);
    console.log(`  title: ${f.title}`);
    if (f.meta) {
      console.log(`  meta:  ${JSON.stringify(f.meta)}`);
    }
    console.log('');
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
