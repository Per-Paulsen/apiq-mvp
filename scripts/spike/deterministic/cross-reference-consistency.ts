/**
 * Cross-Reference-Consistency Module — Stage A, Welle A (Module-Class).
 *
 * Sources: OAS 3.0 §3 (Schema Object) + JSON-Schema 2020-12
 *          + IBM/Microsoft API-design-rule cross-reference patterns
 *          + apiq W3 cross-reference-consistency walker (Round-2)
 * Patterns: cross-schema field-name type/format/pattern/enum incompatibility
 *           detection (heuristic per-property aggregation)
 * Lens: 8 (Internal-Consistency), 4 (Client-Friction)
 * Round: 2 (Welle A → Welle B W3 promotion)
 *
 * Maps to rules-brainstorm.md: CL-46 (Inconsistent error-shape cross-endpoint),
 * D3 (Response-Components mit gleichem Status haben gleiches Schema), G6
 * (Path-Parameter-Naming-Konsistenz), apiq A4/A5 (discriminator-targets).
 *
 * Walker: cross-reference field-name consistency.
 *
 * Premise: when the same field-name appears in multiple schemas with
 * incompatible declarations (different `type`, `format`, `pattern`, or
 * length-constraints), it's a strong "smell" signal — either a copy-paste
 * accident, an evolution-divergence, or a design inconsistency that will
 * confuse SDK codegens, type-checkers, and integration consumers.
 *
 * Algorithm (spec-agnostic — no hardcoded field-names):
 *   1. Walk every schema-shaped node in the spec, collecting each named
 *      property along with its declaration + location pointer + host-schema.
 *   2. Group by property-name.
 *   3. For each name appearing in ≥ 2 distinct host-schemas, compute a
 *      "signature" fingerprint per occurrence: (type, format, pattern,
 *      minLength, maxLength, enum-set). Collapse identical signatures.
 *   4. If ≥ 2 distinct signatures exist for the same name across ≥ 2
 *      host-schemas, emit a finding listing the variants with a histogram
 *      of which schemas declare which variant.
 *
 * Rationale: same-name-different-type is a near-universal smell — it shows
 * up in Stripe (`amount` as integer vs string), GitHub (`id` as integer vs
 * string in different schema branches), and PagerDuty (`created_at` as
 * date-time vs unix-time). The detector is deliberately spec-agnostic: it
 * doesn't know which fields "should" be consistent, only that fields with
 * the same name carrying divergent declarations is a red flag.
 *
 * Thresholds (avoid singleton noise):
 *   - Only flag names where ≥ 2 distinct host-schemas declare the field
 *   - Only flag names where ≥ 2 distinct signatures are present
 *   - Cap output at top-N most-impactful conflicts (by host-count)
 *
 * Public API: walkCrossReferenceConsistency(spec, opts) => DetectorFinding[]
 *
 * CLI:
 *   cd scripts/spike && npx tsx deterministic/cross-reference-consistency.ts <spec-name>
 */

import type { DetectorFinding, DetectorOptions } from './types.js';
import { walkAllSchemas } from './walkers/_shared.js';

/** Maximum number of conflict-findings to emit per spec. */
const MAX_FINDINGS = 20;

/** Maximum number of variant-rows shown in the narration per finding. */
const MAX_VARIANTS_IN_NARRATION = 6;

/** Maximum number of host-schema example pointers shown per variant. */
const MAX_HOSTS_PER_VARIANT = 5;

/**
 * Normalised signature for a single property-declaration. Two declarations
 * with the same signature are considered consistent; different signatures
 * are flagged as a conflict.
 */
interface PropSignature {
  type: string | null;
  format: string | null;
  pattern: string | null;
  minLength: number | null;
  maxLength: number | null;
  enum: string | null; // sorted JSON of enum values, or null
  nullable: boolean;
}

interface PropOccurrence {
  hostPointer: string; // JSON pointer of the host-schema (the parent)
  hostName: string | null; // component-schema name if applicable, else null
  signature: PropSignature;
  signatureKey: string; // canonical fingerprint string for grouping
}

/**
 * Compute a signature for a JSON-Schema-shaped node (a property declaration).
 * Returns null if the node is not a usable schema (e.g. pure `$ref` with no
 * inline overrides — those carry no own signature).
 */
function computeSignature(node: Record<string, unknown>): PropSignature | null {
  // Pure $ref with no other keywords carries no own signature; skip.
  const refOnly = '$ref' in node &&
    Object.keys(node).every((k) => k === '$ref' || k === 'description');
  if (refOnly) return null;

  const type = typeof node.type === 'string' ? (node.type as string) : null;
  const format = typeof node.format === 'string' ? (node.format as string) : null;
  const pattern = typeof node.pattern === 'string' ? (node.pattern as string) : null;
  const minLength = typeof node.minLength === 'number' ? (node.minLength as number) : null;
  const maxLength = typeof node.maxLength === 'number' ? (node.maxLength as number) : null;
  const nullable = node.nullable === true;

  let enumKey: string | null = null;
  if (Array.isArray(node.enum)) {
    const stringified = node.enum
      .map((v) => (v === null ? 'null' : JSON.stringify(v)))
      .sort();
    enumKey = JSON.stringify(stringified);
  }

  // Only emit a signature if there's *something* to compare. A field with no
  // type/format/pattern/length/enum is a "shape unknown" placeholder and not
  // useful for cross-reference-consistency-checking.
  if (
    type === null && format === null && pattern === null &&
    minLength === null && maxLength === null && enumKey === null
  ) {
    return null;
  }

  return { type, format, pattern, minLength, maxLength, enum: enumKey, nullable };
}

/**
 * Stable string key for grouping equivalent signatures.
 */
function signatureKey(sig: PropSignature): string {
  return JSON.stringify([
    sig.type,
    sig.format,
    sig.pattern,
    sig.minLength,
    sig.maxLength,
    sig.enum,
    sig.nullable,
  ]);
}

/**
 * Human-friendly one-line description of a signature.
 */
function describeSignature(sig: PropSignature): string {
  const parts: string[] = [];
  if (sig.type) parts.push(`type=${sig.type}`);
  if (sig.format) parts.push(`format=${sig.format}`);
  if (sig.pattern) {
    const p = sig.pattern.length > 30 ? sig.pattern.slice(0, 27) + '...' : sig.pattern;
    parts.push(`pattern=${p}`);
  }
  if (sig.minLength !== null) parts.push(`minLength=${sig.minLength}`);
  if (sig.maxLength !== null) parts.push(`maxLength=${sig.maxLength}`);
  if (sig.enum) {
    parts.push(`enum[${(JSON.parse(sig.enum) as string[]).length}]`);
  }
  if (sig.nullable) parts.push('nullable');
  return parts.length === 0 ? '(no constraints)' : parts.join(', ');
}

/**
 * Decide whether a name+signature-set constitutes a real conflict (vs. an
 * artefact). We require:
 *   - at least 2 distinct host-schemas declare the field
 *   - at least 2 distinct signatures
 *
 * Additionally, signatures that differ ONLY in `nullable` are not flagged
 * as a conflict (nullability divergence is too noisy on its own; tracked
 * via different walkers).
 */
function isRealConflict(signatures: PropSignature[]): boolean {
  if (signatures.length < 2) return false;

  // Strip nullable, see if the residual is still divergent.
  const withoutNullable = new Set(
    signatures.map((s) =>
      JSON.stringify([s.type, s.format, s.pattern, s.minLength, s.maxLength, s.enum])
    )
  );
  return withoutNullable.size >= 2;
}

/**
 * Conflict-class — used to categorise a finding's primary divergence.
 */
function classifyConflict(signatures: PropSignature[]): {
  primary: 'type' | 'format' | 'pattern' | 'length' | 'enum' | 'mixed';
  hint: string;
} {
  const types = new Set(signatures.map((s) => s.type ?? '∅'));
  const formats = new Set(signatures.map((s) => s.format ?? '∅'));
  const patterns = new Set(signatures.map((s) => s.pattern ?? '∅'));
  const lens = new Set(
    signatures.map((s) => `${s.minLength ?? '∅'}/${s.maxLength ?? '∅'}`)
  );
  const enums = new Set(signatures.map((s) => s.enum ?? '∅'));

  const divergent: string[] = [];
  if (types.size >= 2) divergent.push('type');
  if (formats.size >= 2) divergent.push('format');
  if (patterns.size >= 2) divergent.push('pattern');
  if (lens.size >= 2) divergent.push('length');
  if (enums.size >= 2) divergent.push('enum');

  if (divergent.length === 0) {
    return { primary: 'mixed', hint: 'unknown' };
  }
  if (divergent.length === 1) {
    return { primary: divergent[0]! as 'type' | 'format' | 'pattern' | 'length' | 'enum', hint: divergent[0]! };
  }
  return { primary: 'mixed', hint: divergent.join('+') };
}

interface NameGroup {
  name: string;
  occurrences: PropOccurrence[];
  uniqueSignatures: PropSignature[];
  uniqueHostCount: number;
  classification: ReturnType<typeof classifyConflict>;
}

/**
 * Collect every named property in the spec along with its host-schema
 * pointer and computed signature.
 */
function collectAllProperties(spec: object): Map<string, PropOccurrence[]> {
  const byName = new Map<string, PropOccurrence[]>();

  for (const { schema, pointer } of walkAllSchemas(spec)) {
    const props = schema.properties;
    if (!props || typeof props !== 'object') continue;
    // Determine host name if this is a named component schema:
    // pointer like "/components/schemas/<Name>" → <Name>
    const hostName = extractComponentSchemaName(pointer);

    for (const [propName, propRaw] of Object.entries(props as Record<string, unknown>)) {
      if (!propRaw || typeof propRaw !== 'object') continue;
      const propNode = propRaw as Record<string, unknown>;
      const sig = computeSignature(propNode);
      if (!sig) continue;

      const occ: PropOccurrence = {
        hostPointer: pointer || '/',
        hostName,
        signature: sig,
        signatureKey: signatureKey(sig),
      };
      const list = byName.get(propName);
      if (list) {
        list.push(occ);
      } else {
        byName.set(propName, [occ]);
      }
    }
  }

  return byName;
}

function extractComponentSchemaName(pointer: string): string | null {
  // Pointer paths are JSON-pointer-escaped; '/components/schemas/<Name>' or
  // deeper. We want the first segment under components/schemas.
  const m = pointer.match(/^\/components\/schemas\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!).replace(/~1/g, '/').replace(/~0/g, '~') : null;
}

/**
 * Build the list of NameGroups that constitute real cross-reference
 * conflicts (after thresholding).
 */
function findConflictGroups(byName: Map<string, PropOccurrence[]>): NameGroup[] {
  const out: NameGroup[] = [];

  for (const [name, occurrences] of byName.entries()) {
    if (occurrences.length < 2) continue;

    // Group by host (a single host with two property declarations is impossible
    // in JSON-Schema's properties-map, but the spec might have multiple
    // schema-shaped nodes pointing to the same host pointer; dedupe).
    const hostSet = new Set(occurrences.map((o) => o.hostPointer));
    if (hostSet.size < 2) continue;

    // Group occurrences by signatureKey to find unique signatures
    const sigMap = new Map<string, PropSignature>();
    for (const occ of occurrences) {
      if (!sigMap.has(occ.signatureKey)) {
        sigMap.set(occ.signatureKey, occ.signature);
      }
    }
    const uniqueSignatures = Array.from(sigMap.values());

    if (!isRealConflict(uniqueSignatures)) continue;

    const classification = classifyConflict(uniqueSignatures);
    if (classification.primary === 'mixed' && classification.hint === 'unknown') continue;

    out.push({
      name,
      occurrences,
      uniqueSignatures,
      uniqueHostCount: hostSet.size,
      classification,
    });
  }

  // Sort by impact: more hosts × more variants first
  out.sort((a, b) => {
    const impactA = a.uniqueHostCount * a.uniqueSignatures.length;
    const impactB = b.uniqueHostCount * b.uniqueSignatures.length;
    return impactB - impactA;
  });

  return out;
}

/**
 * Build the narration for a single conflict-group.
 */
function buildNarration(group: NameGroup): string {
  // Group occurrences by signatureKey so we can list "schemas using variant X"
  const bySig = new Map<string, { sig: PropSignature; hosts: string[] }>();
  for (const occ of group.occurrences) {
    const entry = bySig.get(occ.signatureKey);
    const hostLabel = occ.hostName ?? occ.hostPointer;
    if (entry) {
      if (!entry.hosts.includes(hostLabel)) entry.hosts.push(hostLabel);
    } else {
      bySig.set(occ.signatureKey, { sig: occ.signature, hosts: [hostLabel] });
    }
  }

  const variants = Array.from(bySig.values()).sort(
    (a, b) => b.hosts.length - a.hosts.length
  );

  const variantLines: string[] = [];
  for (const v of variants.slice(0, MAX_VARIANTS_IN_NARRATION)) {
    const hostExamples = v.hosts.slice(0, MAX_HOSTS_PER_VARIANT).join(', ');
    const moreHosts = v.hosts.length > MAX_HOSTS_PER_VARIANT
      ? ` (and ${v.hosts.length - MAX_HOSTS_PER_VARIANT} more)`
      : '';
    variantLines.push(
      `  • ${describeSignature(v.sig)} — ${v.hosts.length} schema${v.hosts.length === 1 ? '' : 's'}: ${hostExamples}${moreHosts}`
    );
  }
  const moreVariantsSuffix =
    variants.length > MAX_VARIANTS_IN_NARRATION
      ? `\n  ... (and ${variants.length - MAX_VARIANTS_IN_NARRATION} more variants)`
      : '';

  const conflictKind = group.classification.hint;
  const totalHosts = group.uniqueHostCount;

  return (
    `The field name \`${group.name}\` appears in ${totalHosts} distinct schemas with ` +
    `${group.uniqueSignatures.length} divergent declarations (${conflictKind}-conflict). ` +
    `Same-name-different-${conflictKind} is a near-universal smell signal — SDK codegens that ` +
    `flatten schemas across the API end up with conflicting type definitions; integration consumers ` +
    `assume one shape and break against the other; AI agents reading the spec produce inconsistent ` +
    `code. Variants observed:\n${variantLines.join('\n')}${moreVariantsSuffix}\n` +
    `Either standardise to a single declaration (preferred) or rename the divergent occurrences ` +
    `so the conflict is explicit at the API surface.`
  );
}

function buildTitle(group: NameGroup): string {
  const k = group.classification.hint;
  return `Field \`${group.name}\` declared inconsistently across ${group.uniqueHostCount} schemas (${k}-conflict)`;
}

function buildPatchSummary(group: NameGroup): string {
  return (
    `Standardise the \`${group.name}\` field across the ${group.uniqueHostCount} schemas ` +
    `that declare it, or rename the divergent occurrences to make the difference explicit.`
  );
}

export async function walkCrossReferenceConsistency(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const byName = collectAllProperties(spec);
  const groups = findConflictGroups(byName);

  const findings: DetectorFinding[] = [];
  for (const group of groups.slice(0, MAX_FINDINGS)) {
    const severity: DetectorFinding['severity'] =
      group.classification.primary === 'type' ? 'high' : 'medium';

    findings.push({
      detectorId: `walker:cross-reference-consistency:${group.name}`,
      layer: 'walker-statistical',
      title: buildTitle(group),
      narration: buildNarration(group),
      rationale:
        'OpenAPI 3.0 §4.7.21 ("Schema Object") and JSON Schema §6 expect that a field with ' +
        'a given semantic role carries one consistent type across the API. The OpenAPI Initiative ' +
        'Style Guide and Microsoft REST §6.3 ("Field naming consistency") name same-name-' +
        'different-shape as a contract anti-pattern: it forces consumers to disambiguate at every ' +
        'call-site and breaks the foundational assumption that field-name implies field-shape.',
      category: 'design',
      severity,
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: buildPatchSummary(group),
      meta: {
        fieldName: group.name,
        hostCount: group.uniqueHostCount,
        variantCount: group.uniqueSignatures.length,
        conflictKind: group.classification.hint,
        primary: group.classification.primary,
      },
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// CLI — runs cross-reference-consistency against a single spec from
// openapi-examples.
// ---------------------------------------------------------------------------

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
    console.error('Usage: tsx deterministic/cross-reference-consistency.ts <spec-name>');
    console.error('  e.g. tsx deterministic/cross-reference-consistency.ts stripe-full');
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
  console.log('Running cross-reference-consistency walker...\n');

  const startedAt = Date.now();
  const findings = await walkCrossReferenceConsistency(spec, { specName });
  const durationMs = Date.now() - startedAt;

  console.log(`${findings.length} findings emitted (${durationMs}ms)\n`);
  if (findings.length === 0) {
    console.log('(No cross-reference-consistency findings.)');
    return;
  }
  for (const f of findings) {
    console.log(`[${f.detectorId}]`);
    console.log(`  title: ${f.title}`);
    if (f.meta) console.log(`  meta:  ${JSON.stringify(f.meta)}`);
    console.log('');
  }
}

// Cross-platform-safe entry-point guard
{
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
