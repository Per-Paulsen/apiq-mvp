/**
 * Style-Classifier Module — Stage 1 of T15 (Lens-5 Style-Coherence).
 *
 * **apiq differentiator — no other linter ships a style-classifier.**
 *
 * Inspects an OpenAPI spec and identifies which API-style it primarily follows
 * out of:
 *   - 'pure-rpc'         — Richardson Level 0/1; verbs in paths
 *   - 'rest-l2'          — REST-Level-2 (HTTP-method semantics, plural-noun paths)
 *   - 'rest-l3-hateoas'  — REST-Level-3 / HATEOAS (hypermedia link-relations)
 *   - 'json-api'         — JSON:API envelope (vnd.api+json + data/errors/included)
 *   - 'hal'              — HAL (_links + _embedded; application/hal+json)
 *   - 'siren'            — Siren (class[]/actions[]/entities[]; vnd.siren+json)
 *   - 'odata'            — OData (@odata.* + dollar-prefixed query params)
 *   - 'aip'              — Google AIP / gRPC-via-transcoding (colon-verb paths +
 *                          AIP pagination/standard fields)
 *   - 'custom-bespoke'   — doesn't match any of the above cleanly
 *   - 'mixed'            — Style-0: contains markers from 2+ envelope styles in
 *                          one spec (the failure-mode this lens detects)
 *
 * Two-stage architecture per Round-2 Phase E:
 *   1. **This module** = Stage 1 classifier; returns
 *      { primaryStyle, confidence, secondaryStyles, evidence, stats }.
 *   2. per-style-coherence.ts = Stage 2 dispatch; runs SC-1..25 generic checks
 *      and SCF-1..17 style-specific conformance checks.
 */

import type { DetectorOptions } from './types.js';
import { walkOperations } from './walkers/_shared.js';

// =============================================================================
// 1. Public types
// =============================================================================

export type ApiStyle =
  | 'pure-rpc'
  | 'rest-l2'
  | 'rest-l3-hateoas'
  | 'json-api'
  | 'hal'
  | 'siren'
  | 'odata'
  | 'aip'
  | 'custom-bespoke'
  | 'mixed';

/** Provenance / strength of the marker(s) supporting a given style. */
export type ConfidenceTier = 'high' | 'medium' | 'low';

export interface StyleEvidence {
  /** Which style this evidence supports. */
  style: ApiStyle;
  /** Confidence tier per M-7 (mining doc). */
  tier: ConfidenceTier;
  /** Human-readable description of the marker. */
  marker: string;
  /** Number of distinct occurrences. */
  occurrences: number;
  /** Up to 3 example locations (paths / method). */
  examples?: string[];
}

export interface StyleClassification {
  /** Primary style classification. 'mixed' fires when 2+ hypermedia/envelope
   *  styles are detected with non-trivial occurrence-counts. */
  primaryStyle: ApiStyle;
  /** Score 0-1; higher = more confident in primaryStyle. */
  confidence: number;
  /** Other styles whose markers appeared above the noise floor. */
  secondaryStyles: ApiStyle[];
  /** Detailed evidence-list — each marker that influenced the result. */
  evidence: StyleEvidence[];
  /** Statistical summary for downstream Stage-2 detectors. */
  stats: SpecStats;
}

export interface SpecStats {
  /** Total number of operations in the spec. */
  totalOps: number;
  /** Operations counted by HTTP method (lowercase keys). */
  methodCounts: Record<string, number>;
  /** Path-segment classification counts. */
  pathStyle: {
    pluralNoun: number;
    rpcVerb: number;
    colonVerb: number;
    other: number;
  };
  /** Set of distinct content-types declared anywhere in the spec. */
  contentTypes: Set<string>;
  /** Set of distinct query-parameter names seen. */
  queryParamNames: Set<string>;
  /** Hypermedia-shaped property-name markers. */
  hypermediaMarkers: {
    underscoreLinks: number;
    underscoreEmbedded: number;
    bareLinks: number;
    relationships: number;
    actions: number;
    classArray: number;
    jsonApiEnvelopes: number;
    odataAnnotations: number;
  };
  /** AIP-style markers. */
  aipMarkers: {
    colonVerbPaths: number;
    aipPagination: number;
    aipResponsePagination: number;
    snakeCaseDominant: boolean;
  };
}


// =============================================================================
// 2. Marker-detection helpers
// =============================================================================

const RPC_VERB_RE =
  /^(get|create|list|update|delete|fetch|do|run|exec|search|find|set|put|post|patch|add|remove|enable|disable|activate|deactivate|cancel|approve|reject|upload|download|login|logout|register|signup|signin|signout|authenticate|verify|validate|send|reset|refresh)([A-Z_]\w*)?$/i;

const VERSION_SEGMENT_RE = /^v\d+(\.\d+)*$|^api$/i;
const COLON_VERB_RE = /:[a-z][a-zA-Z0-9_]*$/;

/** A path segment is RPC-verb-shaped when it's a verb (e.g. /login) or a
 *  verb + capitalised-noun (/getUser, /searchOrders). */
function isRpcVerbSegment(segment: string): boolean {
  if (!segment || segment.startsWith('{')) return false;
  return RPC_VERB_RE.test(segment);
}

/** Plural-noun heuristic — segment that ends in 's' (and isn't a template
 *  parameter or version). Conservative; catches /users, /orders, /charges. */
function isPluralNounSegment(segment: string): boolean {
  if (!segment || segment.startsWith('{')) return false;
  if (VERSION_SEGMENT_RE.test(segment)) return false;
  return /[a-z][a-z0-9_-]+s$/i.test(segment) && !RPC_VERB_RE.test(segment);
}

/** First non-version, non-template segment of a path. */
function firstSignificantSegment(path: string): string | null {
  const segs = path.split('/').filter((s) => s.length > 0);
  for (const seg of segs) {
    if (VERSION_SEGMENT_RE.test(seg)) continue;
    if (seg.startsWith('{')) continue;
    return seg;
  }
  return null;
}

/** Detect AIP custom-method colon-verb paths (/users/{id}:archive). */
function hasColonVerb(path: string): boolean {
  return COLON_VERB_RE.test(path);
}

/** Walk all values recursively up to a depth limit. */
function* walkValues(node: unknown, depth = 0, maxDepth = 8): Generator<unknown> {
  if (depth > maxDepth) return;
  if (node === null || typeof node !== 'object') return;
  yield node;
  if (Array.isArray(node)) {
    for (const v of node) yield* walkValues(v, depth + 1, maxDepth);
  } else {
    for (const v of Object.values(node as Record<string, unknown>)) {
      yield* walkValues(v, depth + 1, maxDepth);
    }
  }
}

/** Gather property-key occurrences across a spec, plus a few specific
 *  hypermedia envelope co-occurrences. */
function collectPropertyMarkers(spec: object): SpecStats['hypermediaMarkers'] {
  const markers: SpecStats['hypermediaMarkers'] = {
    underscoreLinks: 0,
    underscoreEmbedded: 0,
    bareLinks: 0,
    relationships: 0,
    actions: 0,
    classArray: 0,
    jsonApiEnvelopes: 0,
    odataAnnotations: 0,
  };
  for (const node of walkValues(spec)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    const obj = node as Record<string, unknown>;

    const props = obj.properties;
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      const pmap = props as Record<string, unknown>;
      const keys = Object.keys(pmap);
      if (keys.includes('_links')) markers.underscoreLinks++;
      if (keys.includes('_embedded')) markers.underscoreEmbedded++;
      if (keys.includes('links')) markers.bareLinks++;
      if (keys.includes('relationships')) markers.relationships++;
      if (keys.includes('actions')) markers.actions++;
      if (keys.includes('data') && keys.includes('errors')) markers.jsonApiEnvelopes++;
      if (
        keys.includes('type') &&
        keys.includes('id') &&
        keys.includes('attributes') &&
        typeof pmap.type === 'object'
      ) {
        markers.jsonApiEnvelopes++;
      }
      if (keys.includes('class')) {
        const classProp = pmap.class as Record<string, unknown> | undefined;
        if (classProp && classProp.type === 'array') markers.classArray++;
      }
      for (const k of keys) {
        if (k.startsWith('@odata.')) markers.odataAnnotations++;
      }
    }

    if ('example' in obj || 'examples' in obj) {
      for (const sub of walkValues(obj.example, 0, 3)) {
        if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
          for (const k of Object.keys(sub as Record<string, unknown>)) {
            if (k.startsWith('@odata.')) markers.odataAnnotations++;
          }
        }
      }
    }
  }
  return markers;
}


/** Collect all media-type strings declared in requestBody/responses content. */
function collectContentTypes(spec: object): Set<string> {
  const out = new Set<string>();
  for (const { operation } of walkOperations(spec)) {
    const op = operation as Record<string, unknown>;
    const requestBody = op.requestBody as Record<string, unknown> | undefined;
    if (requestBody) {
      const content = requestBody.content as Record<string, unknown> | undefined;
      if (content) for (const ct of Object.keys(content)) out.add(ct.toLowerCase());
    }
    const responses = op.responses as Record<string, unknown> | undefined;
    if (responses && typeof responses === 'object') {
      for (const r of Object.values(responses)) {
        if (!r || typeof r !== 'object') continue;
        const content = (r as Record<string, unknown>).content as
          | Record<string, unknown>
          | undefined;
        if (content) for (const ct of Object.keys(content)) out.add(ct.toLowerCase());
      }
    }
  }
  return out;
}

/** Collect all query-parameter names. */
function collectQueryParamNames(spec: object): Set<string> {
  const out = new Set<string>();
  const collect = (params: unknown): void => {
    if (!Array.isArray(params)) return;
    for (const p of params) {
      if (!p || typeof p !== 'object') continue;
      const pp = p as Record<string, unknown>;
      if (pp.in !== 'query') continue;
      if (typeof pp.name === 'string') out.add(pp.name);
    }
  };
  for (const { operation, pathItem } of walkOperations(spec)) {
    collect((operation as Record<string, unknown>).parameters);
    collect((pathItem as Record<string, unknown>).parameters);
  }
  return out;
}

/** Detect lower_snake_case field-name dominance vs camelCase. */
function detectSnakeCaseDominant(spec: object): boolean {
  let snake = 0;
  let camel = 0;
  for (const node of walkValues(spec)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    const props = (node as Record<string, unknown>).properties;
    if (!props || typeof props !== 'object' || Array.isArray(props)) continue;
    for (const key of Object.keys(props as Record<string, unknown>)) {
      const k = key.replace(/^_/, '');
      if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k)) snake++;
      else if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(k)) camel++;
    }
  }
  if (snake + camel < 5) return false;
  return snake / (snake + camel) >= 0.7;
}

/** Detect AIP-style markers (page_size/page_token/colon-verb). */
function collectAipMarkers(
  spec: object,
  pathStats: SpecStats['pathStyle']
): SpecStats['aipMarkers'] {
  let aipPagination = 0;
  let aipResponsePagination = 0;
  for (const { operation } of walkOperations(spec)) {
    const params = (operation as Record<string, unknown>).parameters;
    let hasPageSize = false;
    let hasPageToken = false;
    if (Array.isArray(params)) {
      for (const p of params) {
        if (!p || typeof p !== 'object') continue;
        const pp = p as Record<string, unknown>;
        if (pp.name === 'page_size') hasPageSize = true;
        if (pp.name === 'page_token') hasPageToken = true;
      }
    }
    if (hasPageSize && hasPageToken) aipPagination++;

    const responses = (operation as Record<string, unknown>).responses as
      | Record<string, unknown>
      | undefined;
    if (responses) {
      for (const r of Object.values(responses)) {
        if (!r || typeof r !== 'object') continue;
        const content = (r as Record<string, unknown>).content as
          | Record<string, unknown>
          | undefined;
        if (!content) continue;
        for (const cv of Object.values(content)) {
          const schema = (cv as Record<string, unknown> | undefined)?.schema;
          if (!schema || typeof schema !== 'object') continue;
          const props = (schema as Record<string, unknown>).properties;
          if (
            props &&
            typeof props === 'object' &&
            'next_page_token' in (props as Record<string, unknown>)
          ) {
            aipResponsePagination++;
          }
        }
      }
    }
  }
  return {
    colonVerbPaths: pathStats.colonVerb,
    aipPagination,
    aipResponsePagination,
    snakeCaseDominant: detectSnakeCaseDominant(spec),
  };
}


// =============================================================================
// 3. The classifier
// =============================================================================

/**
 * Classify the spec into one of 9+1 styles per Round-2 Phase E.
 *
 * Algorithm:
 *   1. Collect statistical evidence (method-distribution, path-shape,
 *      content-types, property-markers, AIP markers).
 *   2. Assign each marker a confidence-tier (high/medium/low).
 *   3. Tier-priority dispatch: high-confidence content-type markers win;
 *      else medium property-name markers; else low statistical signals.
 *   4. Fire 'mixed' if 2+ HIGH/MEDIUM hypermedia/envelope styles co-present.
 */
export function classifyApiStyle(
  spec: object,
  _opts?: DetectorOptions
): StyleClassification {
  const stats = collectStats(spec);
  const evidence: StyleEvidence[] = [];

  // -------------------------------------------------------------------
  // HIGH-CONFIDENCE — content-type-based markers.
  // -------------------------------------------------------------------
  const ct = stats.contentTypes;
  const hasJsonApiCT = [...ct].some((c) => c.startsWith('application/vnd.api+json'));
  const hasHalCT = [...ct].some(
    (c) => c.startsWith('application/hal+json') || c.startsWith('application/hal+xml')
  );
  const hasSirenCT = [...ct].some((c) => c.startsWith('application/vnd.siren+json'));
  const hasOdataCT = [...ct].some((c) => /odata\.metadata/.test(c));

  if (hasJsonApiCT) {
    evidence.push({
      style: 'json-api',
      tier: 'high',
      marker: 'Content-Type: application/vnd.api+json',
      occurrences: 1,
    });
  }
  if (hasHalCT) {
    evidence.push({
      style: 'hal',
      tier: 'high',
      marker: 'Content-Type: application/hal+json',
      occurrences: 1,
    });
  }
  if (hasSirenCT) {
    evidence.push({
      style: 'siren',
      tier: 'high',
      marker: 'Content-Type: application/vnd.siren+json',
      occurrences: 1,
    });
  }
  if (hasOdataCT) {
    evidence.push({
      style: 'odata',
      tier: 'high',
      marker: 'Content-Type with odata.metadata=*',
      occurrences: 1,
    });
  }

  // -------------------------------------------------------------------
  // MEDIUM-CONFIDENCE — property-name / query-shape markers.
  // -------------------------------------------------------------------
  const m = stats.hypermediaMarkers;
  if (m.underscoreLinks >= 1) {
    evidence.push({
      style: 'hal',
      tier: 'medium',
      marker: '_links property in response schema',
      occurrences: m.underscoreLinks,
    });
  }
  if (m.underscoreEmbedded >= 1) {
    evidence.push({
      style: 'hal',
      tier: 'medium',
      marker: '_embedded property in response schema',
      occurrences: m.underscoreEmbedded,
    });
  }
  if (m.relationships >= 1) {
    evidence.push({
      style: 'json-api',
      tier: 'medium',
      marker: 'relationships property (JSON:API resource-object)',
      occurrences: m.relationships,
    });
  }
  if (m.jsonApiEnvelopes >= 1) {
    evidence.push({
      style: 'json-api',
      tier: 'medium',
      marker: 'JSON:API envelope shape (data+errors OR type+id+attributes)',
      occurrences: m.jsonApiEnvelopes,
    });
  }
  if (m.classArray >= 1 && m.actions >= 1) {
    evidence.push({
      style: 'siren',
      tier: 'medium',
      marker: 'class[] + actions[] properties (Siren entity-shape)',
      occurrences: Math.min(m.classArray, m.actions),
    });
  }
  if (m.odataAnnotations >= 1) {
    evidence.push({
      style: 'odata',
      tier: 'medium',
      marker: '@odata.* annotations in schemas/examples',
      occurrences: m.odataAnnotations,
    });
  }

  const odataQuery = [...stats.queryParamNames].filter((q) => /^\$/.test(q));
  if (odataQuery.length >= 1) {
    evidence.push({
      style: 'odata',
      tier: 'medium',
      marker: 'dollar-prefixed query params: ' + odataQuery.slice(0, 5).join(', '),
      occurrences: odataQuery.length,
    });
  }

  if (m.bareLinks >= 1) {
    evidence.push({
      style: 'rest-l3-hateoas',
      tier: 'medium',
      marker: 'bare links property in response schema (hypermedia)',
      occurrences: m.bareLinks,
    });
  }

  const aip = stats.aipMarkers;
  if (aip.colonVerbPaths >= 1) {
    evidence.push({
      style: 'aip',
      tier: 'medium',
      marker: 'colon-verb suffix paths (Google AIP custom-method)',
      occurrences: aip.colonVerbPaths,
    });
  }
  if (aip.aipPagination >= 1 || aip.aipResponsePagination >= 1) {
    evidence.push({
      style: 'aip',
      tier: 'medium',
      marker: 'page_size/page_token/next_page_token AIP-pagination shape',
      occurrences: Math.max(aip.aipPagination, aip.aipResponsePagination),
    });
  }


  // -------------------------------------------------------------------
  // LOW-CONFIDENCE — path-shape / method-distribution.
  // -------------------------------------------------------------------
  const totalPaths =
    stats.pathStyle.pluralNoun +
    stats.pathStyle.rpcVerb +
    stats.pathStyle.colonVerb +
    stats.pathStyle.other;

  if (totalPaths > 0) {
    const rpcRatio = stats.pathStyle.rpcVerb / totalPaths;
    const plRatio = stats.pathStyle.pluralNoun / totalPaths;
    if (rpcRatio >= 0.4 && plRatio < 0.2) {
      evidence.push({
        style: 'pure-rpc',
        tier: 'low',
        marker: (rpcRatio * 100).toFixed(0) + '% verb-prefixed paths, ' + (plRatio * 100).toFixed(0) + '% plural-noun',
        occurrences: stats.pathStyle.rpcVerb,
      });
    } else if (plRatio >= 0.4 && rpcRatio < 0.2) {
      evidence.push({
        style: 'rest-l2',
        tier: 'low',
        marker: (plRatio * 100).toFixed(0) + '% plural-noun paths',
        occurrences: stats.pathStyle.pluralNoun,
      });
    }
  }

  const totalOps = stats.totalOps;
  if (totalOps > 0) {
    const postShare = (stats.methodCounts.post ?? 0) / totalOps;
    if (postShare > 0.85) {
      evidence.push({
        style: 'pure-rpc',
        tier: 'low',
        marker: (postShare * 100).toFixed(0) + '% POST-only method distribution',
        occurrences: stats.methodCounts.post ?? 0,
      });
    } else {
      const usesPut = (stats.methodCounts.put ?? 0) > 0;
      const usesDelete = (stats.methodCounts.delete ?? 0) > 0;
      const usesPatch = (stats.methodCounts.patch ?? 0) > 0;
      const verbCount = [usesPut, usesDelete, usesPatch].filter(Boolean).length;
      if (verbCount >= 2 && (stats.methodCounts.get ?? 0) > 0) {
        const parts: string[] = [];
        if (usesPut) parts.push('PUT');
        if (usesPatch) parts.push('PATCH');
        if (usesDelete) parts.push('DELETE');
        evidence.push({
          style: 'rest-l2',
          tier: 'low',
          marker: 'balanced HTTP-verb distribution (GET+POST+' + parts.join('+') + ')',
          occurrences: totalOps,
        });
      }
    }
  }

  // -------------------------------------------------------------------
  // Style-aggregation: pick primary, detect mixed.
  // -------------------------------------------------------------------
  const tierWeight: Record<ConfidenceTier, number> = { high: 100, medium: 10, low: 1 };
  const styleScores = new Map<ApiStyle, number>();
  for (const ev of evidence) {
    const prior = styleScores.get(ev.style) ?? 0;
    styleScores.set(ev.style, prior + tierWeight[ev.tier]);
  }

  // Mutually-exclusive envelope families
  const hypermediaFamilies: ApiStyle[] = ['json-api', 'hal', 'siren', 'odata'];
  const presentHypermediaFamilies = hypermediaFamilies.filter(
    (s) => (styleScores.get(s) ?? 0) >= 10
  );

  const ranked = [...styleScores.entries()].sort((a, b) => b[1] - a[1]);

  let primaryStyle: ApiStyle;
  let confidence: number;
  const secondaryStyles: ApiStyle[] = [];

  if (presentHypermediaFamilies.length >= 2) {
    primaryStyle = 'mixed';
    confidence = 0.9;
    for (const fam of presentHypermediaFamilies) secondaryStyles.push(fam);
  } else if (ranked.length === 0) {
    primaryStyle = 'custom-bespoke';
    confidence = 0.3;
  } else {
    const [topStyle, topScore] = ranked[0];
    primaryStyle = topStyle;
    const hasHighForTop = evidence.some((e) => e.style === topStyle && e.tier === 'high');
    if (hasHighForTop) {
      confidence = 0.95;
    } else {
      const runnerUp = ranked[1]?.[1] ?? 0;
      const margin = (topScore - runnerUp) / (topScore + runnerUp + 1);
      confidence = Math.max(0.4, Math.min(0.85, margin + 0.4));
    }
    for (const [s] of ranked.slice(1)) {
      if ((styleScores.get(s) ?? 0) >= 1) secondaryStyles.push(s);
    }
  }

  return { primaryStyle, confidence, secondaryStyles, evidence, stats };
}

// =============================================================================
// 4. Stats collector — public for stage-2 detectors.
// =============================================================================

export function collectStats(spec: object): SpecStats {
  const methodCounts: Record<string, number> = {};
  let totalOps = 0;
  const pathStyle: SpecStats['pathStyle'] = {
    pluralNoun: 0,
    rpcVerb: 0,
    colonVerb: 0,
    other: 0,
  };

  const seenPaths = new Set<string>();

  for (const { path, method } of walkOperations(spec)) {
    totalOps++;
    methodCounts[method] = (methodCounts[method] ?? 0) + 1;

    if (seenPaths.has(path)) continue;
    seenPaths.add(path);

    if (hasColonVerb(path)) {
      pathStyle.colonVerb++;
    } else {
      const seg = firstSignificantSegment(path);
      if (seg && isRpcVerbSegment(seg)) {
        pathStyle.rpcVerb++;
      } else if (seg && isPluralNounSegment(seg)) {
        pathStyle.pluralNoun++;
      } else {
        pathStyle.other++;
      }
    }
  }

  const stats: SpecStats = {
    totalOps,
    methodCounts,
    pathStyle,
    contentTypes: collectContentTypes(spec),
    queryParamNames: collectQueryParamNames(spec),
    hypermediaMarkers: collectPropertyMarkers(spec),
    aipMarkers: {
      colonVerbPaths: pathStyle.colonVerb,
      aipPagination: 0,
      aipResponsePagination: 0,
      snakeCaseDominant: false,
    },
  };
  stats.aipMarkers = collectAipMarkers(spec, pathStyle);
  return stats;
}

// =============================================================================
// 5. Helpers re-exported for testing / Stage-2 use.
// =============================================================================

export const _internals = {
  isRpcVerbSegment,
  isPluralNounSegment,
  firstSignificantSegment,
  hasColonVerb,
  collectPropertyMarkers,
  collectContentTypes,
  collectQueryParamNames,
  detectSnakeCaseDominant,
};
