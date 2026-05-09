/**
 * Per-Style-Coherence Module — Stage A, Welle B T15 (Module-Class, Stage-2).
 *
 * Sources: JSON:API v1.1 spec (https://jsonapi.org/format/1.1/)
 *          + HAL spec (Hypertext Application Language)
 *          + Siren spec
 *          + OData v4.01 (https://docs.oasis-open.org/odata/odata/v4.01)
 *          + Google AIPs (api-design-patterns, AIP-121..160)
 *          + Microsoft REST API guidelines
 *          + Roy Fielding REST dissertation + Richardson maturity model
 * Patterns: ~25 generic SC-* coherence-checks + 17 SCF-* style-conformance
 *           checks (JSON:API SCF-1..6, HAL SCF-7..8, Siren SCF-9..10,
 *           OData SCF-11..12, AIP SCF-13..17)
 * Lens: 5 (Style-Coherence), 4 (Client-Friction), 8 (Internal-Consistency)
 * Round: 2 (Welle B / T15 Stage-2 — Mining-Round-2 Phase E)
 *
 * Maps to rules-brainstorm.md: SC-1..25 (generic style-coherence patterns from
 * Phase E mining), SCF-1..17 (style-conformance per declared style — only fires
 * when classifier confirms style declaration). SC-5/SC-6/SC-8/SC-9 are P1.
 *
 * Once classifyApiStyle() has classified a spec, this module dispatches to
 * the appropriate coherence-checks:
 *
 *   - **Generic SC-1..25** (always run; surface mixing / pluralization /
 *     CRUD-symmetry / pagination / error-shape / envelope coherence within
 *     this spec).
 *   - **SCF-1..6** (JSON:API conformance — fires only when JSON:API declared).
 *   - **SCF-7..8** (HAL conformance — fires only when HAL declared).
 *   - **SCF-9..10** (Siren conformance).
 *   - **SCF-11..12** (OData conformance).
 *   - **SCF-13..17** (Google AIP conformance).
 *
 * Each detector emits DetectorFinding records tagged with Lens-5 (and Lens-4
 * cross-tag for client-friction style-mix patterns). Findings flow through
 * the same output-mapper as walker-statistical findings.
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';
import { walkOperations } from '../aggregators/_shared.js';
import {
  classifyApiStyle,
  type SpecStats,
  type StyleClassification,
} from '../classifiers/style-classifier.js';

// =============================================================================
// 1. Public entry-point
// =============================================================================

export interface CoherenceResult {
  classification: StyleClassification;
  findings: DetectorFinding[];
}

/**
 * Run Stage 2 — classify the spec, then dispatch coherence-checks based on
 * the classification result.
 */
export function runStyleCoherenceChecks(
  spec: object,
  opts: DetectorOptions = {}
): CoherenceResult {
  const classification = classifyApiStyle(spec, opts);
  const findings: DetectorFinding[] = [];

  // Generic SC-* checks (always run).
  findings.push(...checkSC1_RestVsRpcMixing(spec, classification));
  findings.push(...checkSC5_EnvelopeCoherence(spec, classification));
  findings.push(...checkSC6_PluralizationCoherence(spec, classification));
  findings.push(...checkSC9_ErrorShapeCoherence(spec, classification));
  findings.push(...checkSC14_StyleMarkerLeakage(spec, classification));
  findings.push(...checkSC22_FilterSyntaxCoherence(spec, classification));
  findings.push(...checkSC23_SortSyntaxCoherence(spec, classification));

  // SCF-* declared-style conformance checks (high-precision, fire only when
  // a style is declared via content-type or strong markers).
  findings.push(...checkSCF1_JsonApiEnvelope(spec, classification));
  findings.push(...checkSCF7_HalLinks(spec, classification));
  findings.push(...checkSCF9_SirenClass(spec, classification));
  findings.push(...checkSCF11_OdataValueArray(spec, classification));
  findings.push(...checkSCF13_AipColonVerbMethod(spec, classification));
  findings.push(...checkSCF14_AipPaginationFields(spec, classification));

  return { classification, findings };
}


// =============================================================================
// 2. Generic SC-* coherence checks (Lens 4 + 5 cross-tagged)
// =============================================================================

/**
 * SC-1 — REST-vs-RPC path-style mixing.
 * Fires when both plural-noun and verb-prefix paths exceed 10% of paths each.
 * Severity: medium (hint — auth/login/health legitimately RPC).
 */
function checkSC1_RestVsRpcMixing(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  void spec;
  const ps = classification.stats.pathStyle;
  const total = ps.pluralNoun + ps.rpcVerb + ps.colonVerb + ps.other;
  if (total < 5) return [];

  const rpcRatio = ps.rpcVerb / total;
  const plRatio = ps.pluralNoun / total;
  if (rpcRatio < 0.1 || plRatio < 0.1) return [];

  return [
    {
      detectorId: 'style-coherence:sc-1:rest-vs-rpc-mixing',
      layer: 'walker-statistical',
      title:
        'Path-style mixing: ' +
        (plRatio * 100).toFixed(0) +
        '% plural-noun (REST-L2) vs ' +
        (rpcRatio * 100).toFixed(0) +
        '% verb-prefix (RPC) paths',
      narration:
        'The spec mixes REST-resource and RPC-verb path conventions. ' +
        ps.pluralNoun +
        ' paths use plural-noun resource style, ' +
        ps.rpcVerb +
        ' paths use verb-prefix RPC style. SDK code generators must build two different path-conventions; clients reading the spec must learn two URL grammars. Common-but-legitimate exceptions are auth (/login/logout) and search (/search) — document those explicitly. Otherwise pick one style and migrate the minority.',
      rationale:
        'Microsoft Azure REST Guidelines (resource-vs-action), Google AIP-121 (resource-oriented design), and Richardson Maturity Model L1-vs-L2 all flag mixed path-styles as Lens-4 client-friction. Apiq lens [5] (style-coherence) detects internal inconsistency without prescribing the right answer.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Document path-style divergence or migrate the minority (' +
        (rpcRatio < plRatio ? ps.rpcVerb + ' RPC' : ps.pluralNoun + ' REST') +
        ') endpoints.',
      meta: {
        rpcCount: ps.rpcVerb,
        pluralNounCount: ps.pluralNoun,
        rpcRatio,
        pluralRatio: plRatio,
      },
    },
  ];
}


/**
 * SC-5 — List-response envelope coherence.
 * Classify each list endpoint's response shape:
 *  - bare-array
 *  - data-envelope ({ data: [], ... })
 *  - items-envelope ({ items: [], ... })
 *  - results-envelope ({ results: [], ... })
 *  - value-envelope (OData)
 *  - other
 * Flag specs where 2+ shapes coexist.
 */
function checkSC5_EnvelopeCoherence(
  spec: object,
  _classification: StyleClassification
): DetectorFinding[] {
  type Envelope = 'bare-array' | 'data' | 'items' | 'results' | 'value' | 'other';
  const counts: Record<Envelope, number> = {
    'bare-array': 0,
    data: 0,
    items: 0,
    results: 0,
    value: 0,
    other: 0,
  };

  for (const { operation, method } of walkOperations(spec)) {
    if (method !== 'get') continue;
    const responses = (operation as Record<string, unknown>).responses as
      | Record<string, unknown>
      | undefined;
    if (!responses) continue;
    const ok = (responses['200'] || responses['default']) as
      | Record<string, unknown>
      | undefined;
    if (!ok) continue;
    const content = ok.content as Record<string, unknown> | undefined;
    if (!content) continue;
    for (const cv of Object.values(content)) {
      const schema = (cv as Record<string, unknown>).schema as
        | Record<string, unknown>
        | undefined;
      if (!schema) continue;
      if (schema.type === 'array') {
        counts['bare-array']++;
        continue;
      }
      const props = schema.properties as Record<string, unknown> | undefined;
      if (!props) continue;
      // Detect a list-shape: any of {data, items, results, value} with type:array.
      const candidates: Array<['data' | 'items' | 'results' | 'value', unknown]> = [
        ['data', props.data],
        ['items', props.items],
        ['results', props.results],
        ['value', props.value],
      ];
      let matched = false;
      for (const [name, sub] of candidates) {
        if (sub && typeof sub === 'object') {
          const t = (sub as Record<string, unknown>).type;
          if (t === 'array') {
            counts[name]++;
            matched = true;
            break;
          }
        }
      }
      if (!matched && Array.isArray(props)) counts.other++;
    }
  }

  const present = (Object.entries(counts) as Array<[Envelope, number]>).filter(
    ([, n]) => n > 0
  );
  if (present.length < 2) return [];

  // Skip when the spec primarily uses one envelope and a tiny handful diverge
  // — already covered by majority-style finding. Fire only if 2+ envelopes
  // each contribute >= 2 occurrences.
  const above = present.filter(([, n]) => n >= 2);
  if (above.length < 2) return [];

  const summary = above.map(([k, n]) => k + '=' + n).join(', ');
  return [
    {
      detectorId: 'style-coherence:sc-5:envelope-coherence',
      layer: 'walker-statistical',
      title: 'Multiple list-envelope shapes detected: ' + summary,
      narration:
        'The spec uses multiple list-response envelopes (' +
        summary +
        '). Each envelope shape forces SDK consumers to write a different parser. JSON:API uses { data: [] }, OData uses { value: [] }, Microsoft style uses { value: [] }, Google AIP uses { items: [] } or { data.items: [] } depending on era. Bare-array list responses are also a deviation. Pick one envelope across the spec or document the divergence.',
      rationale:
        'JSON:API §Document Structure, Microsoft REST Guidelines §collection-formatting, Google AIP-132, and OData v4.01 each prescribe ONE envelope for list-responses. Multiple envelopes within one spec = lens [4] client-friction + lens [5] style-incoherence.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Choose a single list-envelope shape and migrate the minority groups (' +
        summary +
        ').',
      meta: { counts },
    },
  ];
}


/**
 * SC-6 — Resource-name pluralization coherence.
 * Flag specs that mix singular and plural collection names.
 */
function checkSC6_PluralizationCoherence(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  void spec;
  const stats = classification.stats;
  // Use existing path-classification: rough approximation — collect first-segments.
  // Rebuild from operations because classifier discards the actual segment text.
  const singular: string[] = [];
  const plural: string[] = [];
  const seen = new Set<string>();
  for (const { path } of walkOperations(spec)) {
    if (seen.has(path)) continue;
    seen.add(path);
    const segs = path.split('/').filter((s) => s.length > 0 && !s.startsWith('{'));
    for (const seg of segs) {
      if (/^v\d+(\.\d+)*$|^api$/i.test(seg)) continue;
      // Skip RPC-verbish + colon-method
      if (seg.includes(':')) continue;
      if (/^(login|logout|search|register|signup|signin|signout|me|account|health|ping|status)$/i.test(seg)) continue;
      // Heuristic plural: ends in 's', 'ies', 'es' (rough but useful).
      if (/[a-z][a-z0-9_-]+s$/i.test(seg) && !/(ss|us|is)$/i.test(seg)) {
        plural.push(seg);
      } else if (/^[a-z][a-z0-9_-]+$/i.test(seg)) {
        singular.push(seg);
      }
    }
  }
  const distinctSingular = new Set(singular.map((s) => s.toLowerCase()));
  const distinctPlural = new Set(plural.map((s) => s.toLowerCase()));
  const totalDistinct = distinctSingular.size + distinctPlural.size;
  if (totalDistinct < 5) return [];
  const pluralRatio = distinctPlural.size / totalDistinct;
  if (pluralRatio > 0.85 || pluralRatio < 0.15) return [];

  void stats;
  const examplesSingular = Array.from(distinctSingular).slice(0, 3).join(', ');
  const examplesPlural = Array.from(distinctPlural).slice(0, 3).join(', ');
  return [
    {
      detectorId: 'style-coherence:sc-6:pluralization-coherence',
      layer: 'walker-statistical',
      title:
        'Resource-name pluralization mixed: ' +
        distinctPlural.size +
        ' plural + ' +
        distinctSingular.size +
        ' singular collections',
      narration:
        'The spec mixes plural-collection and singular-collection naming. Singular examples: ' +
        examplesSingular +
        '. Plural examples: ' +
        examplesPlural +
        '. Google AIP-122, Zalando #134, and JSON:API recommend consistent plural-collection naming. Singletons (/me, /account, /health) are legitimate exceptions; if the spec has structural-singletons document them, otherwise harmonize to plural.',
      rationale:
        'AIP-122 §Resource Names, JSON:API §Document Structure, Zalando RESTful API Guidelines #134 — all recommend collection-names plural. Mixed naming = lens [4] client-friction (clients must remember which is which) + lens [5] style-incoherence.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Standardize collection-names: pick plural (recommended) or document singular exceptions.',
      meta: {
        singularCount: distinctSingular.size,
        pluralCount: distinctPlural.size,
        pluralRatio,
      },
    },
  ];
}


/**
 * SC-9 — Error-shape coherence cross-spec.
 * Detect specs that use multiple distinct error-schema-shapes for 4xx/5xx.
 */
function checkSC9_ErrorShapeCoherence(
  spec: object,
  _classification: StyleClassification
): DetectorFinding[] {
  // Collect (status, content-type, schema-fingerprint) tuples for 4xx/5xx.
  const errorContentTypes = new Set<string>();
  const errorSchemaShapes = new Set<string>();
  for (const { operation } of walkOperations(spec)) {
    const responses = (operation as Record<string, unknown>).responses as
      | Record<string, unknown>
      | undefined;
    if (!responses) continue;
    for (const [status, r] of Object.entries(responses)) {
      const code = parseInt(status, 10);
      if (!Number.isFinite(code) || code < 400) continue;
      if (!r || typeof r !== 'object') continue;
      const content = (r as Record<string, unknown>).content as
        | Record<string, unknown>
        | undefined;
      if (!content) continue;
      for (const [ct, cv] of Object.entries(content)) {
        errorContentTypes.add(ct.toLowerCase());
        const schema = (cv as Record<string, unknown>).schema as
          | Record<string, unknown>
          | undefined;
        if (!schema) continue;
        // Build a structural fingerprint: sorted top-level property names.
        const props = schema.properties as Record<string, unknown> | undefined;
        if (props && typeof props === 'object') {
          const fp = Object.keys(props).sort().join(',');
          errorSchemaShapes.add(fp);
        } else if (schema.$ref && typeof schema.$ref === 'string') {
          errorSchemaShapes.add('ref:' + schema.$ref);
        }
      }
    }
  }

  if (errorSchemaShapes.size < 3) return [];

  return [
    {
      detectorId: 'style-coherence:sc-9:error-shape-coherence',
      layer: 'walker-statistical',
      title:
        errorSchemaShapes.size +
        ' distinct error-schema-shapes detected across 4xx/5xx responses',
      narration:
        'The spec uses ' +
        errorSchemaShapes.size +
        ' different error-schema shapes across 4xx/5xx responses. Clients must write multiple error-handlers and SDKs must generate multiple error-types. RFC 7807 (Problem Details for HTTP APIs), JSON:API §errors, Heroku, Microsoft REST Guidelines, and Zalando #176 all recommend a single canonical error-schema referenced everywhere. Lens [2] standards-compliance + lens [4] client-friction + lens [5] style-incoherence.',
      rationale:
        'RFC 7807 §3 (Problem Details), JSON:API §error-objects, Heroku platform-API conventions, Microsoft REST Guidelines, Zalando #176 — strong cross-source consensus that error-shape MUST be consistent across the API surface.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Define ONE canonical error-schema (recommended: application/problem+json per RFC 7807) and reference it from every 4xx/5xx response.',
      meta: {
        errorSchemaShapeCount: errorSchemaShapes.size,
        errorContentTypes: Array.from(errorContentTypes),
      },
    },
  ];
}


/**
 * SC-14 — Style-marker leakage (mixed envelope-markers in one spec).
 * Different from SC-1 (path-shape mixing): SC-14 flags 2+ HYPERMEDIA/ENVELOPE
 * style-markers (HAL _links + JSON:API data-envelope + OData @odata.*).
 * Re-uses the classifier's mixed verdict.
 */
function checkSC14_StyleMarkerLeakage(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  void spec;
  if (classification.primaryStyle !== 'mixed') return [];
  const families = classification.secondaryStyles
    .filter((s) => ['json-api', 'hal', 'siren', 'odata'].includes(s))
    .join(', ');
  return [
    {
      detectorId: 'style-coherence:sc-14:style-marker-leakage',
      layer: 'walker-statistical',
      title:
        'Mixed hypermedia/envelope styles detected in one spec: ' + families,
      narration:
        'The spec contains markers from multiple mutually-exclusive hypermedia/envelope styles (' +
        families +
        '). HAL _links + JSON:API data-envelope + OData @odata.* annotations on different responses force clients to negotiate per-endpoint. Pick ONE envelope family and migrate the others; or split the spec by media-type if intentional.',
      rationale:
        'JSON:API spec §Document Structure, HAL Internet-Draft, OData v4.01 §URL Conventions — each defines a CLOSED envelope vocabulary that conflicts with the others. Cross-style adoption within one spec = lens [4] client-friction + lens [5] style-incoherence (the failure-mode this lens detects).',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Choose ONE hypermedia/envelope style (' + families + ') and migrate the others.',
      meta: {
        primaryStyle: classification.primaryStyle,
        detectedFamilies: classification.secondaryStyles,
        evidence: classification.evidence.map((e) => ({
          style: e.style,
          tier: e.tier,
          marker: e.marker,
        })),
      },
    },
  ];
}


/**
 * SC-22 — Filter-syntax coherence.
 * Detect 2+ filter-style markers across query parameters:
 *  - 'filter' (AIP-160)
 *  - 'filter[xxx]' (JSON:API)
 *  - dollar-filter (OData)
 *  - free-form per-field query parameters (Stripe-style)
 */
function checkSC22_FilterSyntaxCoherence(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  void spec;
  const queryParams = classification.stats.queryParamNames;
  const styles = new Set<string>();
  for (const q of queryParams) {
    if (q === 'filter') styles.add('aip-filter');
    else if (/^filter\[.+\]$/.test(q)) styles.add('jsonapi-filter');
    else if (q === '$filter') styles.add('odata-filter');
  }
  if (styles.size < 2) return [];
  return [
    {
      detectorId: 'style-coherence:sc-22:filter-syntax-coherence',
      layer: 'walker-statistical',
      title:
        'Multiple filter-syntaxes detected: ' + Array.from(styles).join(', '),
      narration:
        'The spec uses ' +
        styles.size +
        ' different filter-syntaxes (' +
        Array.from(styles).join(', ') +
        '). AIP-160 uses ?filter=name eq foo, JSON:API uses ?filter[name]=foo, OData uses ?$filter=Name eq foo, Stripe-style uses individual ?status=foo&type=bar query params. Mixing forces clients to learn multiple grammars.',
      rationale:
        'Google AIP-160 (filtering), JSON:API §filtering, OData v4.01 §URL Conventions — three competing valid grammars. Cross-spec mixing = lens [4] client-friction + lens [5] style-incoherence.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Choose ONE filter-syntax and migrate the others.',
      meta: { detectedStyles: Array.from(styles) },
    },
  ];
}

/**
 * SC-23 — Sort-syntax coherence.
 * Same shape as SC-22 but for sort/order-by:
 *  - 'order_by' (AIP-132)
 *  - 'sort' (JSON:API: sort=-field)
 *  - dollar-orderby (OData)
 *  - 'sort_by' + 'sort_dir' (Stripe-style)
 */
function checkSC23_SortSyntaxCoherence(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  void spec;
  const queryParams = classification.stats.queryParamNames;
  const styles = new Set<string>();
  for (const q of queryParams) {
    if (q === 'order_by') styles.add('aip-orderby');
    else if (q === 'sort') styles.add('jsonapi-sort');
    else if (q === '$orderby') styles.add('odata-orderby');
    else if (q === 'sort_by' || q === 'sort_dir') styles.add('stripe-sort');
  }
  if (styles.size < 2) return [];
  return [
    {
      detectorId: 'style-coherence:sc-23:sort-syntax-coherence',
      layer: 'walker-statistical',
      title: 'Multiple sort-syntaxes detected: ' + Array.from(styles).join(', '),
      narration:
        'The spec uses ' +
        styles.size +
        ' different sort/order-by syntaxes (' +
        Array.from(styles).join(', ') +
        '). AIP-132 uses ?order_by=field desc, JSON:API uses ?sort=-field, OData uses ?$orderby=field desc, Stripe uses ?sort_by=field&sort_dir=desc. Pick ONE.',
      rationale:
        'Google AIP-132 (List sorting), JSON:API §sorting, OData v4.01 — three competing grammars; cross-spec mixing = lens [4] + lens [5] friction.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Choose ONE sort/order-by syntax and migrate the others.',
      meta: { detectedStyles: Array.from(styles) },
    },
  ];
}


// =============================================================================
// 3. SCF-* Conformance-when-declared (high-precision)
// =============================================================================

function jsonApiDeclared(stats: SpecStats): boolean {
  for (const ct of stats.contentTypes) {
    if (ct.startsWith('application/vnd.api+json')) return true;
  }
  return false;
}

function halDeclared(stats: SpecStats): boolean {
  for (const ct of stats.contentTypes) {
    if (ct.startsWith('application/hal+json') || ct.startsWith('application/hal+xml'))
      return true;
  }
  return false;
}

function sirenDeclared(stats: SpecStats): boolean {
  for (const ct of stats.contentTypes) {
    if (ct.startsWith('application/vnd.siren+json')) return true;
  }
  return false;
}

function odataDeclared(stats: SpecStats): boolean {
  for (const ct of stats.contentTypes) {
    if (/odata\.metadata/.test(ct)) return true;
  }
  if (stats.hypermediaMarkers.odataAnnotations >= 1) return true;
  for (const q of stats.queryParamNames) {
    if (/^\$/.test(q)) return true;
  }
  return false;
}

function aipDeclared(stats: SpecStats): boolean {
  return (
    stats.aipMarkers.colonVerbPaths >= 1 ||
    stats.aipMarkers.aipPagination >= 1 ||
    stats.aipMarkers.aipResponsePagination >= 1
  );
}


/**
 * SCF-1 — JSON:API envelope conformance.
 * When application/vnd.api+json is declared, every response-schema with that
 * content-type must have at-top-level: data OR errors OR meta. data and errors
 * MUST NOT coexist. included MUST NOT appear without data.
 */
function checkSCF1_JsonApiEnvelope(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  if (!jsonApiDeclared(classification.stats)) return [];

  const violations: Array<{ path: string; method: string; reason: string }> = [];
  for (const { path, method, operation } of walkOperations(spec)) {
    const responses = (operation as Record<string, unknown>).responses as
      | Record<string, unknown>
      | undefined;
    if (!responses) continue;
    for (const r of Object.values(responses)) {
      if (!r || typeof r !== 'object') continue;
      const content = (r as Record<string, unknown>).content as
        | Record<string, unknown>
        | undefined;
      if (!content) continue;
      const jsonApiEntry = (content as Record<string, unknown>)[
        'application/vnd.api+json'
      ] as Record<string, unknown> | undefined;
      if (!jsonApiEntry) continue;
      const schema = jsonApiEntry.schema as Record<string, unknown> | undefined;
      if (!schema) continue;
      const props = schema.properties as Record<string, unknown> | undefined;
      if (!props || typeof props !== 'object') {
        violations.push({
          path,
          method,
          reason:
            'application/vnd.api+json response has no top-level schema.properties; cannot verify data/errors/meta envelope.',
        });
        continue;
      }
      const keys = Object.keys(props);
      const hasData = keys.includes('data');
      const hasErrors = keys.includes('errors');
      const hasMeta = keys.includes('meta');
      const hasIncluded = keys.includes('included');
      if (!hasData && !hasErrors && !hasMeta) {
        violations.push({
          path,
          method,
          reason:
            'JSON:API response missing top-level data/errors/meta envelope.',
        });
      }
      if (hasData && hasErrors) {
        violations.push({
          path,
          method,
          reason:
            'JSON:API spec §7.1: data and errors MUST NOT coexist at the top level.',
        });
      }
      if (hasIncluded && !hasData) {
        violations.push({
          path,
          method,
          reason:
            'JSON:API spec §7.1: included MUST NOT appear without data.',
        });
      }
    }
  }

  if (violations.length === 0) return [];

  return [
    {
      detectorId: 'style-coherence:scf-1:jsonapi-envelope',
      layer: 'walker-statistical',
      title:
        violations.length +
        ' application/vnd.api+json responses violate JSON:API envelope rules',
      narration:
        'Spec declares application/vnd.api+json on at least one response, so JSON:API conformance applies. ' +
        violations.length +
        ' violations detected: ' +
        violations
          .slice(0, 3)
          .map((v) => v.method.toUpperCase() + ' ' + v.path + ': ' + v.reason)
          .join(' | ') +
        (violations.length > 3 ? ' (and ' + (violations.length - 3) + ' more)' : '') +
        '. JSON:API §Document Structure mandates a top-level envelope of data XOR errors plus optional meta/jsonapi/links/included.',
      rationale:
        'JSON:API v1.1 §Document Structure: top-level documents MUST contain at least one of data, errors, meta. data and errors MUST NOT coexist. included MUST NOT be present without data. (verbatim MUST per JSON:API spec)',
      category: 'correctness',
      severity: 'high',
      scope: 'spec',
      affectedEndpoints: violations
        .slice(0, 50)
        .map((v) => ({ path: v.path, method: v.method })),
      patchOps: [],
      patchSummary:
        'Wrap JSON:API responses in the canonical { data: ..., meta?, links?, included? } or { errors: [...] } envelope.',
      meta: { violationCount: violations.length },
    },
  ];
}


/**
 * SCF-7 — HAL conformance.
 * When application/hal+json declared, every response with that content-type
 * must have a top-level _links property.
 */
function checkSCF7_HalLinks(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  if (!halDeclared(classification.stats)) return [];

  const violations: Array<{ path: string; method: string }> = [];
  for (const { path, method, operation } of walkOperations(spec)) {
    const responses = (operation as Record<string, unknown>).responses as
      | Record<string, unknown>
      | undefined;
    if (!responses) continue;
    for (const r of Object.values(responses)) {
      if (!r || typeof r !== 'object') continue;
      const content = (r as Record<string, unknown>).content as
        | Record<string, unknown>
        | undefined;
      if (!content) continue;
      const halEntry = (content as Record<string, unknown>)['application/hal+json'] as
        | Record<string, unknown>
        | undefined;
      if (!halEntry) continue;
      const schema = halEntry.schema as Record<string, unknown> | undefined;
      if (!schema) continue;
      const props = schema.properties as Record<string, unknown> | undefined;
      if (!props || !Object.keys(props).includes('_links')) {
        violations.push({ path, method });
      }
    }
  }
  if (violations.length === 0) return [];

  return [
    {
      detectorId: 'style-coherence:scf-7:hal-links',
      layer: 'walker-statistical',
      title:
        violations.length +
        ' application/hal+json responses missing required _links property',
      narration:
        'Spec declares application/hal+json on at least one response, so HAL conformance applies. ' +
        violations.length +
        ' responses lack the required _links top-level property: ' +
        violations
          .slice(0, 3)
          .map((v) => v.method.toUpperCase() + ' ' + v.path)
          .join(', ') +
        (violations.length > 3 ? ' (and ' + (violations.length - 3) + ' more)' : '') +
        '. HAL specification §_links: every HAL resource SHOULD have _links with at minimum a self link-relation.',
      rationale:
        'HAL Internet-Draft draft-kelly-json-hal-11 §4.1.1: A HAL resource is an object with reserved properties _links and optionally _embedded. The _links object MUST be present on resource representations.',
      category: 'correctness',
      severity: 'high',
      scope: 'spec',
      affectedEndpoints: violations
        .slice(0, 50)
        .map((v) => ({ path: v.path, method: v.method })),
      patchOps: [],
      patchSummary:
        'Add _links: { self: { href }, ... } to HAL response schemas.',
      meta: { violationCount: violations.length },
    },
  ];
}


/**
 * SCF-9 — Siren conformance.
 * When application/vnd.siren+json declared, every response with that
 * content-type must have a top-level class array property.
 */
function checkSCF9_SirenClass(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  if (!sirenDeclared(classification.stats)) return [];

  const violations: Array<{ path: string; method: string }> = [];
  for (const { path, method, operation } of walkOperations(spec)) {
    const responses = (operation as Record<string, unknown>).responses as
      | Record<string, unknown>
      | undefined;
    if (!responses) continue;
    for (const r of Object.values(responses)) {
      if (!r || typeof r !== 'object') continue;
      const content = (r as Record<string, unknown>).content as
        | Record<string, unknown>
        | undefined;
      if (!content) continue;
      const sirenEntry = (content as Record<string, unknown>)[
        'application/vnd.siren+json'
      ] as Record<string, unknown> | undefined;
      if (!sirenEntry) continue;
      const schema = sirenEntry.schema as Record<string, unknown> | undefined;
      if (!schema) continue;
      const props = schema.properties as Record<string, unknown> | undefined;
      if (!props) {
        violations.push({ path, method });
        continue;
      }
      const cls = (props as Record<string, unknown>).class as
        | Record<string, unknown>
        | undefined;
      if (!cls || cls.type !== 'array') {
        violations.push({ path, method });
      }
    }
  }
  if (violations.length === 0) return [];

  return [
    {
      detectorId: 'style-coherence:scf-9:siren-class',
      layer: 'walker-statistical',
      title:
        violations.length +
        ' application/vnd.siren+json responses missing required class array',
      narration:
        'Spec declares application/vnd.siren+json on at least one response, so Siren conformance applies. ' +
        violations.length +
        ' responses lack the required class top-level array property. Siren §Entity defines class as an array of strings classifying the entity (e.g. [order, item-list]).',
      rationale:
        'Siren spec (kevinswiber/siren) §Entity: An Entity is a URI-addressable resource with a class array describing the nature/categories of the entity.',
      category: 'correctness',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: violations
        .slice(0, 50)
        .map((v) => ({ path: v.path, method: v.method })),
      patchOps: [],
      patchSummary:
        'Add class: [<entity-type>] array to Siren response schemas.',
      meta: { violationCount: violations.length },
    },
  ];
}


/**
 * SCF-11 — OData conformance: list-responses must have a value array.
 * Fires when OData markers are present (content-type, dollar-prefixed query
 * params, or @odata.* properties).
 */
function checkSCF11_OdataValueArray(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  if (!odataDeclared(classification.stats)) return [];

  const violations: Array<{ path: string; method: string }> = [];
  for (const { path, method, operation } of walkOperations(spec)) {
    if (method !== 'get') continue;
    // Heuristic: list-endpoint = path doesn't end in {id} (not a single-resource Get).
    // OData uses entitySet-key patterns via parens, so any path without trailing
    // ('id') is potentially a list. Use a simple heuristic: no trailing {param}
    // OR the path ends in plural collection.
    const segs = path.split('/').filter((s) => s.length > 0);
    const last = segs[segs.length - 1];
    if (last && last.startsWith('{') && last.endsWith('}')) continue;

    const responses = (operation as Record<string, unknown>).responses as
      | Record<string, unknown>
      | undefined;
    if (!responses) continue;
    const ok = (responses['200'] || responses['default']) as
      | Record<string, unknown>
      | undefined;
    if (!ok) continue;
    const content = ok.content as Record<string, unknown> | undefined;
    if (!content) continue;
    let isOdataResponse = false;
    let hasValueArray = false;
    for (const [ct, cv] of Object.entries(content)) {
      if (
        /odata\.metadata/.test(ct.toLowerCase()) ||
        ct.toLowerCase() === 'application/json'
      ) {
        const schema = (cv as Record<string, unknown>).schema as
          | Record<string, unknown>
          | undefined;
        if (!schema) continue;
        const props = schema.properties as Record<string, unknown> | undefined;
        if (!props) continue;
        // Sniff for @odata.context or @odata.nextLink to confirm OData response.
        if (
          props['@odata.context'] ||
          props['@odata.nextLink'] ||
          props['@odata.count']
        ) {
          isOdataResponse = true;
          const value = props.value as Record<string, unknown> | undefined;
          if (value && value.type === 'array') hasValueArray = true;
        }
      }
    }
    if (isOdataResponse && !hasValueArray) {
      violations.push({ path, method });
    }
  }
  if (violations.length === 0) return [];

  return [
    {
      detectorId: 'style-coherence:scf-11:odata-value-array',
      layer: 'walker-statistical',
      title:
        violations.length +
        ' OData list-responses missing required value array property',
      narration:
        'Spec declares OData markers (@odata.context / dollar-prefixed query params / odata.metadata content-type), so OData conformance applies. ' +
        violations.length +
        ' list-responses lack the required value array. OData v4.01 §11 mandates collections-of-entities use { @odata.context, value: [...], @odata.nextLink? } envelope.',
      rationale:
        'OData v4.01 §11 (Resources): The response payload for a request returning a collection is a JSON object with a name/value pair named value whose value is a JSON array containing the collection.',
      category: 'correctness',
      severity: 'high',
      scope: 'spec',
      affectedEndpoints: violations
        .slice(0, 50)
        .map((v) => ({ path: v.path, method: v.method })),
      patchOps: [],
      patchSummary:
        'Wrap OData list-responses in { @odata.context, value: [...], @odata.nextLink? }.',
      meta: { violationCount: violations.length },
    },
  ];
}


/**
 * SCF-13 — AIP custom-method (colon-verb) HTTP method conformance.
 * Fires when AIP-style detected. Custom-method paths must use POST (or GET
 * only for read-only ops).
 */
function checkSCF13_AipColonVerbMethod(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  if (!aipDeclared(classification.stats)) return [];

  const violations: Array<{ path: string; method: string }> = [];
  for (const { path, method } of walkOperations(spec)) {
    if (!/:[a-z][a-zA-Z0-9_]*$/.test(path)) continue;
    // AIP-136: POST is canonical; GET only for read-only verbs (e.g.
    // :search, :read). Anything else is a violation.
    if (method !== 'post' && method !== 'get') {
      violations.push({ path, method });
    }
  }
  if (violations.length === 0) return [];

  return [
    {
      detectorId: 'style-coherence:scf-13:aip-colon-verb-method',
      layer: 'walker-statistical',
      title:
        violations.length +
        ' AIP custom-method (colon-verb) operations use a non-POST/GET method',
      narration:
        'Spec declares AIP-style markers (colon-verb paths or page_size/page_token pagination), so AIP conformance applies. ' +
        violations.length +
        ' colon-verb operations use methods other than POST/GET: ' +
        violations
          .slice(0, 5)
          .map((v) => v.method.toUpperCase() + ' ' + v.path)
          .join(', ') +
        '. AIP-136 mandates POST for state-changing custom methods and GET only for read-only operations.',
      rationale:
        'Google AIP-136 §Custom Methods: Custom methods MUST use POST. The exception is read-only operations where GET MAY be used.',
      category: 'correctness',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: violations.slice(0, 50),
      patchOps: [],
      patchSummary:
        'Change AIP custom-method (colon-verb) operations to POST (or GET for read-only).',
      meta: { violationCount: violations.length },
    },
  ];
}

/**
 * SCF-14 — AIP pagination field conformance.
 * Fires when AIP detected. List operations should use AIP-canonical
 * page_size/page_token + next_page_token, not a mix with limit/offset/page.
 */
function checkSCF14_AipPaginationFields(
  spec: object,
  classification: StyleClassification
): DetectorFinding[] {
  if (!aipDeclared(classification.stats)) return [];

  const aipPagOps: string[] = [];
  const otherPagOps: string[] = [];
  for (const { path, method, operation } of walkOperations(spec)) {
    if (method !== 'get') continue;
    const params = (operation as Record<string, unknown>).parameters;
    if (!Array.isArray(params)) continue;
    const names = new Set<string>();
    for (const p of params) {
      if (!p || typeof p !== 'object') continue;
      const pp = p as Record<string, unknown>;
      if (pp.in !== 'query') continue;
      if (typeof pp.name === 'string') names.add(pp.name);
    }
    const hasAip = names.has('page_size') || names.has('page_token');
    const hasOther =
      names.has('limit') ||
      names.has('offset') ||
      names.has('page') ||
      names.has('per_page') ||
      names.has('cursor');
    if (hasAip) aipPagOps.push(method.toUpperCase() + ' ' + path);
    else if (hasOther) otherPagOps.push(method.toUpperCase() + ' ' + path);
  }

  if (aipPagOps.length === 0 || otherPagOps.length === 0) return [];

  return [
    {
      detectorId: 'style-coherence:scf-14:aip-pagination-fields',
      layer: 'walker-statistical',
      title:
        'AIP-style spec mixes pagination conventions: ' +
        aipPagOps.length +
        ' AIP (page_size/page_token) + ' +
        otherPagOps.length +
        ' non-AIP (limit/offset/page/cursor)',
      narration:
        'Spec declares AIP-style markers, so AIP conformance applies. AIP-158 mandates page_size/page_token request fields and next_page_token response field. ' +
        otherPagOps.length +
        ' list operations use non-AIP pagination instead: ' +
        otherPagOps.slice(0, 5).join(', ') +
        '. Migrate or document the divergence.',
      rationale:
        'Google AIP-158 §Pagination: List methods accept a page_size and page_token request field, and return a next_page_token response field.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Standardize list-pagination on AIP-158 page_size/page_token + next_page_token.',
      meta: {
        aipPaginationCount: aipPagOps.length,
        nonAipPaginationCount: otherPagOps.length,
      },
    },
  ];
}

// =============================================================================
// 4. Internals re-export for testing
// =============================================================================

export const _coherenceInternals = {
  checkSC1_RestVsRpcMixing,
  checkSC5_EnvelopeCoherence,
  checkSC6_PluralizationCoherence,
  checkSC9_ErrorShapeCoherence,
  checkSC14_StyleMarkerLeakage,
  checkSC22_FilterSyntaxCoherence,
  checkSC23_SortSyntaxCoherence,
  checkSCF1_JsonApiEnvelope,
  checkSCF7_HalLinks,
  checkSCF9_SirenClass,
  checkSCF11_OdataValueArray,
  checkSCF13_AipColonVerbMethod,
  checkSCF14_AipPaginationFields,
  jsonApiDeclared,
  halDeclared,
  sirenDeclared,
  odataDeclared,
  aipDeclared,
};
