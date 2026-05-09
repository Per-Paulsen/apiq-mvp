/**
 * Pluralised-nodes walker — Welle D / T-Sentinels (F-14).
 *
 * Resolves the Welle-C sentinel-rule `apiq-f-14` (pluralised-nodes-detection)
 * which requires cross-path tokenisation + English-pluralisation rules and is
 * not expressible in stock-Spectral DSL.
 *
 * Detects URI-segment singular/plural-conflicts: paths that mix the singular
 * AND the plural form of the same resource-noun
 * (e.g. `/users/{id}/order` AND `/users/{id}/orders` co-existing).
 *
 * Why this matters:
 *   - Client-DX: each HTTP-client must remember whether a given resource is
 *     singular or plural — a mistake every well-trained API publisher avoids.
 *   - Naming-inconsistency signals: there's likely also drift in operationIds,
 *     schemas, and parameter-names between the two variants.
 *   - DOLAR-pattern from Round-2 mining: empirically very common in legacy /
 *     stitched-together APIs.
 *
 * Lens: 8 (Client-DX-Friction) + 4 (Linguistic-Coherence)
 * Pattern: F-14 (DOLAR-territory, Round-2 mining)
 *
 * Detection algorithm:
 *   1. Iterate all paths in the `paths` object.
 *   2. Tokenise each path on `/`, skip `{var}`-templates and empty segments.
 *   3. For each segment, derive its singular/plural counterpart using English
 *      pluralisation rules (s, es, y→ies) plus a small irregular-mapping.
 *   4. Build a set of all distinct resource-segments seen across the spec.
 *   5. Flag every (singular, plural) pair where BOTH forms appear in the set.
 *      Skip irregular nouns where pluralisation is genuinely ambiguous
 *      (data, children, people, …).
 *   6. Emit ONE walker-finding aggregating all conflicts (each conflict has
 *      `singular`, `plural`, `singularPaths`, `pluralPaths` in meta).
 *
 * Severity: 'medium' (apiqSeverity: 'warn'). Category: 'design'.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';

// Irregular plurals where the plural-singular relationship is ambiguous OR the
// noun is conventionally treated as a mass-noun. These are EXEMPT from the check
// — we do not flag them even when both forms co-exist, because rule-based
// pluralisation can't reliably reason about them.
const IRREGULAR_EXEMPT = new Set<string>([
  'data', 'media', 'metadata', 'series', 'species', 'sheep', 'fish',
  'children', 'people', 'men', 'women', 'feet', 'teeth', 'mice', 'geese',
  'oxen', 'criteria', 'phenomena',
  // Plural-only / singular-only nouns
  'news', 'information', 'analytics', 'statistics', 'physics',
  // Words that commonly look like plurals but aren't
  'status', 'analysis', 'class',
]);

/**
 * Derive the candidate plural form of an English noun using simple suffix-rules.
 * Returns null when the heuristic isn't confident enough to flag.
 */
function pluraliseEnglish(singular: string): string | null {
  if (!singular || singular.length < 2) return null;
  if (IRREGULAR_EXEMPT.has(singular.toLowerCase())) return null;

  const lower = singular.toLowerCase();
  // word ending in [consonant]y → [consonant]ies (e.g. city → cities)
  if (/[bcdfghjklmnpqrstvwxz]y$/.test(lower)) {
    return singular.slice(0, -1) + 'ies';
  }
  // word ending in s, x, z, ch, sh → +es (e.g. box → boxes, bus → buses)
  if (/(s|x|z|ch|sh)$/.test(lower)) {
    return singular + 'es';
  }
  // already-plural → don't pluralise again (heuristic: ends in 's' but length≥3)
  if (lower.endsWith('s')) {
    return null;
  }
  return singular + 's';
}

/**
 * Derive the candidate singular form. Returns null when ambiguous.
 */
function singulariseEnglish(plural: string): string | null {
  if (!plural || plural.length < 3) return null;
  if (IRREGULAR_EXEMPT.has(plural.toLowerCase())) return null;
  const lower = plural.toLowerCase();

  // ies → y (cities → city)
  if (lower.endsWith('ies') && plural.length > 3) {
    return plural.slice(0, -3) + 'y';
  }
  // es-suffix (boxes → box, buses → bus, churches → church)
  if (lower.endsWith('ses') || lower.endsWith('xes') || lower.endsWith('zes') ||
      lower.endsWith('ches') || lower.endsWith('shes')) {
    return plural.slice(0, -2);
  }
  // generic s-suffix (cats → cat)
  if (lower.endsWith('s')) {
    return plural.slice(0, -1);
  }
  return null;
}

interface SegmentInfo {
  segment: string;
  paths: Set<string>;
}

export async function walkPluralisedNodes(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const paths = root.paths as Record<string, unknown> | undefined;
  if (!paths || typeof paths !== 'object') return [];

  // Map from segment -> Set<path> where the segment appears as a literal
  // resource-name (i.e. NOT inside a {var}-template).
  const segMap = new Map<string, SegmentInfo>();

  for (const pathKey of Object.keys(paths)) {
    if (typeof pathKey !== 'string' || !pathKey.startsWith('/')) continue;
    const tokens = pathKey.split('/');
    for (const token of tokens) {
      if (!token) continue;
      // Skip {var}-templates and any segment containing a template-marker.
      if (token.includes('{') || token.includes('}')) continue;
      // Skip non-alpha segments (numeric versions like "v1" stay; pure numerics out).
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(token)) continue;
      const seg = token;
      let info = segMap.get(seg);
      if (!info) {
        info = { segment: seg, paths: new Set<string>() };
        segMap.set(seg, info);
      }
      info.paths.add(pathKey);
    }
  }

  if (segMap.size < 2) return [];

  // Find conflicts. Each conflict reported once (singular as canonical-key).
  interface Conflict {
    singular: string;
    plural: string;
    singularPaths: string[];
    pluralPaths: string[];
  }
  const conflicts: Conflict[] = [];
  const reported = new Set<string>();

  for (const [seg, info] of segMap) {
    if (IRREGULAR_EXEMPT.has(seg.toLowerCase())) continue;
    if (reported.has(seg.toLowerCase())) continue;

    const candidatePlural = pluraliseEnglish(seg);
    if (candidatePlural && segMap.has(candidatePlural)) {
      const pluralInfo = segMap.get(candidatePlural)!;
      conflicts.push({
        singular: seg,
        plural: candidatePlural,
        singularPaths: Array.from(info.paths).sort(),
        pluralPaths: Array.from(pluralInfo.paths).sort(),
      });
      reported.add(seg.toLowerCase());
      reported.add(candidatePlural.toLowerCase());
      continue;
    }

    // Try the other direction: maybe `seg` is the plural and the singular exists.
    const candidateSingular = singulariseEnglish(seg);
    if (candidateSingular && segMap.has(candidateSingular)) {
      const singularInfo = segMap.get(candidateSingular)!;
      conflicts.push({
        singular: candidateSingular,
        plural: seg,
        singularPaths: Array.from(singularInfo.paths).sort(),
        pluralPaths: Array.from(info.paths).sort(),
      });
      reported.add(candidateSingular.toLowerCase());
      reported.add(seg.toLowerCase());
    }
  }

  if (conflicts.length === 0) return [];

  const conflictLabels = conflicts
    .slice(0, 5)
    .map((c) => `${c.singular} ↔ ${c.plural}`)
    .join('; ');

  return [{
    detectorId: 'walker:pluralised-nodes',
    layer: 'walker-statistical',
    title: 'Path segments mix singular and plural forms of the same resource',
    narration:
      `${conflicts.length} path-segment(s) appear in BOTH singular and plural form across the spec ` +
      `(e.g. ${conflictLabels}). HTTP-clients must remember per-resource which form to use, ` +
      `which is a maintenance-burden every well-curated API publisher avoids. Naming-inconsistency ` +
      `at the URI-segment level usually correlates with drift in operationIds, schemas, and ` +
      `parameter-names between the two variants.`,
    rationale:
      'F-14 (Round-2 DOLAR-mining): URI-segment pluralisation must be consistent — pick one form ' +
      'per resource. Mixed forms produce client-burden, naming-inconsistency, and downstream ' +
      'drift in tooling/codegen output.',
    category: 'design',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary:
      'Pick one form per resource (REST convention prefers plural collection-segments and ' +
      'singular item-segments via path-templates: `/users` for the collection and `/users/{id}` ' +
      'for an item — never `/user` alongside `/users`).',
    meta: {
      apiqSeverity: 'warn',
      patternId: 'F-14',
      lens: ['client-dx-friction', 'linguistic-coherence'],
      defectClass: 'naming-inconsistency',
      conflictCount: conflicts.length,
      conflicts: conflicts.slice(0, 10),
    },
  }];
}
