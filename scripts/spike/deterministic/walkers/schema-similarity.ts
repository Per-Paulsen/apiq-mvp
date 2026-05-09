/**
 * Schema-similarity walker — Welle D / T-Sentinels (CL-48).
 *
 * Resolves the Welle-C sentinel-rule `apiq-cl-48` (schema-similarity-detection)
 * which is statistical / cross-schema by nature and not expressible in
 * stock-Spectral DSL.
 *
 * Detects pairwise near-duplicate schemas in `components.schemas` — pairs with
 * ≥80% structural overlap but <100% identity. Such near-duplicates signal:
 *   - copy-paste-drift between sibling resources (e.g. `User` vs `UserPublic`)
 *   - missing DRY refactoring (allOf composition not used)
 *   - agents struggling with redundant schemas (multiple "almost-same" types)
 *
 * Lens: 8 (Client-DX-Friction) + 9 (Agent-Readiness)
 * Pattern: CL-48 (Round-2 mining, DOLAR-territory schema-redundancy)
 *
 * Detection algorithm:
 *   1. Iterate all `components.schemas` (skip primitives without properties)
 *   2. Compute structural fingerprint per schema:
 *        - Property-set: { propName: type } map (sorted)
 *        - Required-set
 *        - Top-level shape (object/array/string)
 *      Strip descriptions, examples, format-defaults — pure structural shape.
 *   3. Pairwise O(n²) Jaccard-similarity on property-set:
 *        sim = |intersection| / |union|
 *      If 0.8 ≤ sim < 1.0 → flag as near-dup.
 *   4. Aggregate-threshold: only emit a finding if ≥3 near-dup-pairs OR ≥10%
 *      of schemas have at least one near-dup-buddy. Single-pair = noise.
 *   5. Emit ONE walker-finding (not per-pair) with `meta.pairs` array.
 *
 * Severity: 'low' (apiqSeverity: 'hint'). Category: 'design'.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { walkComponentSchemas, pct } from './_shared.js';

interface Fingerprint {
  name: string;
  topType: string;
  propTypes: Map<string, string>;
  required: Set<string>;
}

const NEAR_DUP_THRESHOLD = 0.8;
const MIN_PROPS_FOR_COMPARISON = 2;
const MIN_PAIRS_FOR_FINDING = 3;
const MIN_FRACTION_FOR_FINDING = 0.1;

function topLevelType(schema: Record<string, unknown>): string {
  const t = schema.type;
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.slice().sort().join('|');
  if (schema.properties) return 'object';
  if (schema.items) return 'array';
  if (schema.enum) return 'enum';
  if (schema.allOf || schema.oneOf || schema.anyOf) return 'composition';
  return 'unknown';
}

function propertyTypeKey(propSchema: unknown): string {
  if (!propSchema || typeof propSchema !== 'object') return 'unknown';
  const p = propSchema as Record<string, unknown>;
  if (typeof p.$ref === 'string') {
    return `$ref:${p.$ref}`;
  }
  const t = p.type;
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.slice().sort().join('|');
  if (p.properties) return 'object';
  if (p.items) return 'array';
  if (p.enum) return 'enum';
  if (p.allOf || p.oneOf || p.anyOf) return 'composition';
  return 'unknown';
}

function fingerprint(name: string, schema: Record<string, unknown>): Fingerprint | null {
  const propTypes = new Map<string, string>();
  const props = schema.properties;
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
      propTypes.set(k, propertyTypeKey(v));
    }
  }
  if (propTypes.size < MIN_PROPS_FOR_COMPARISON) return null;

  const required = new Set<string>();
  if (Array.isArray(schema.required)) {
    for (const r of schema.required) {
      if (typeof r === 'string') required.add(r);
    }
  }

  return {
    name,
    topType: topLevelType(schema),
    propTypes,
    required,
  };
}

function jaccardOnPropertySet(a: Fingerprint, b: Fingerprint): number {
  // Intersection: keys present in BOTH AND with same property-type-key.
  let intersection = 0;
  for (const [k, vA] of a.propTypes) {
    const vB = b.propTypes.get(k);
    if (vB !== undefined && vB === vA) intersection++;
  }
  const unionSize = a.propTypes.size + b.propTypes.size - intersection;
  if (unionSize === 0) return 0;
  return intersection / unionSize;
}

function isIdentical(a: Fingerprint, b: Fingerprint): boolean {
  if (a.topType !== b.topType) return false;
  if (a.propTypes.size !== b.propTypes.size) return false;
  if (a.required.size !== b.required.size) return false;
  for (const [k, v] of a.propTypes) {
    if (b.propTypes.get(k) !== v) return false;
  }
  for (const r of a.required) {
    if (!b.required.has(r)) return false;
  }
  return true;
}

export async function walkSchemaSimilarity(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const fingerprints: Fingerprint[] = [];
  for (const { name, schema } of walkComponentSchemas(spec)) {
    const fp = fingerprint(name, schema);
    if (fp) fingerprints.push(fp);
  }

  if (fingerprints.length < 2) return [];

  // Pairwise O(n²)
  const pairs: Array<{ schemaA: string; schemaB: string; similarity: number }> = [];
  const involved = new Set<string>();
  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      const a = fingerprints[i]!;
      const b = fingerprints[j]!;
      if (isIdentical(a, b)) continue; // Skip 100%-match (different concern)
      const sim = jaccardOnPropertySet(a, b);
      if (sim >= NEAR_DUP_THRESHOLD && sim < 1.0) {
        pairs.push({
          schemaA: a.name,
          schemaB: b.name,
          similarity: Math.round(sim * 1000) / 1000,
        });
        involved.add(a.name);
        involved.add(b.name);
      }
    }
  }

  if (pairs.length === 0) return [];

  const involvedFraction = involved.size / fingerprints.length;
  if (pairs.length < MIN_PAIRS_FOR_FINDING && involvedFraction < MIN_FRACTION_FOR_FINDING) {
    return [];
  }

  // Sort pairs by descending similarity for stable narration
  pairs.sort((p1, p2) => p2.similarity - p1.similarity);
  const samplePairs = pairs.slice(0, 5);
  const sampleLabel = samplePairs
    .map((p) => `${p.schemaA} ↔ ${p.schemaB} (${Math.round(p.similarity * 100)}%)`)
    .join('; ');
  const involvedPct = pct(involved.size, fingerprints.length);

  return [{
    detectorId: 'walker:schema-similarity',
    layer: 'walker-statistical',
    title: 'Near-duplicate component schemas (≥80% structural overlap, not identical)',
    narration:
      `${pairs.length} schema-pair(s) carry ≥80% structural overlap but are not identical. ` +
      `${involved.size}/${fingerprints.length} schemas (${involvedPct}%) are involved in at least one near-dup pair. ` +
      `Examples: ${sampleLabel}. ` +
      `Near-duplicate schemas signal copy-paste-drift between sibling resources or missing DRY ` +
      `composition (allOf-inheritance not used). For human consumers, this multiplies cognitive ` +
      `load. For AI-agent consumers, redundant schemas confuse type-resolution and tool-binding — ` +
      `agents must distinguish "User" from "UserPublic" from "UserResponse" with no structural cue ` +
      `to which to use when.`,
    rationale:
      'Lens-8 (Client-DX-Friction): redundant schemas force hand-written type-mappers and ' +
      'multiply maintenance surface. Lens-9 (Agent-Readiness): redundant schemas without ' +
      'discriminator-style guidance leave agents to guess. CL-48 (Round-2 mining, DOLAR-' +
      'territory): schema-similarity is a direct DRY-violation signal.',
    category: 'design',
    severity: 'low',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary:
      'Refactor near-duplicate schemas: extract shared properties into a base schema; use ' +
      '`allOf` composition for variants; or merge if the variants are not truly distinct types.',
    meta: {
      apiqSeverity: 'hint',
      patternId: 'CL-48',
      lens: ['client-dx-friction', 'agent-readiness'],
      agentReadinessImpact: 'medium',
      pairCount: pairs.length,
      involvedSchemaCount: involved.size,
      totalSchemas: fingerprints.length,
      involvedPct,
      threshold: NEAR_DUP_THRESHOLD,
      pairs: samplePairs,
    },
  }];
}
