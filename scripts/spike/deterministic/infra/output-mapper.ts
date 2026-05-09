/**
 * Output-Mapper — converts intermediate `DetectorFinding` records into the
 * canonical `Finding`-Schema used by the LLM pipeline.
 *
 * The mapper:
 *   - prefixes the narration with a layer-tag so downstream telemetry can
 *     attribute findings to detectors without a separate field
 *   - clamps narration / rationale / patchSummary to schema length limits
 *   - normalises affectedEndpoints (lowercases method, trims paths)
 *   - validates the result via `FindingSchema.parse` so callers get a hard
 *     error on malformed detector output instead of silent corruption
 */

import { FindingSchema, type Finding, type PatchOp } from '../../schema.js';
import type { DetectorFinding, DetectorLayer, DetectorOptions } from './types.js';

const LAYER_TAGS: Record<DetectorLayer, string> = {
  'spectral-oas3-default': '[spectral·oas3]',
  'spectral-apiq-custom': '[spectral·apiq]',
  'walker-statistical': '[walker]',
  'module-class': '[module]',
  'domain-knowledge': '[domain]',
};

function clampString(s: string, min: number, max: number, label: string): string {
  if (s.length < min) {
    return s + ' '.repeat(min - s.length); // pad — schema requires min chars
  }
  if (s.length > max) {
    // Truncate with ellipsis at last word boundary if possible.
    const truncated = s.slice(0, max - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > max * 0.7 ? truncated.slice(0, lastSpace) : truncated) + '...';
  }
  return s;
}

/**
 * Map one DetectorFinding → canonical Finding.
 * Throws via zod if the resulting shape violates the schema.
 */
export function mapDetectorFinding(d: DetectorFinding): Finding {
  const layerTag = LAYER_TAGS[d.layer];
  const narrationWithTag = `${layerTag} ${d.narration.trim()}`;

  const candidate = {
    title: d.title.trim().slice(0, 200),
    narration: clampString(narrationWithTag, 50, 2000, 'narration'),
    rationale: clampString(d.rationale.trim(), 20, 1000, 'rationale'),
    // FindingSchema.category currently allows 'clarity'|'design'|'risk' only —
    // schema-extension to add 'correctness' is part of Foundation-Block work
    // (see big-spec-architecture-spike.md §"Schema extension required").
    // Until then, downcast 'correctness' findings to 'risk' so they validate.
    category: d.category === 'correctness' ? 'risk' : d.category,
    severity: d.severity,
    scope: d.scope,
    affectedEndpoints: d.affectedEndpoints.map((e) => ({
      path: e.path,
      method: e.method.toLowerCase(),
    })),
    patchOps: (d.patchOps as PatchOp[]) ?? [],
    patchSummary: clampString(d.patchSummary.trim(), 1, 200, 'patchSummary'),
  };

  return FindingSchema.parse(candidate);
}

// =============================================================================
// Codegen-aggregation (Welle Q / Q1).
//
// `codegen-validation.ts` emits one DetectorFinding per occurrence — on
// github-rest that's ~9.8k findings for a single root rule. That blows the
// Phase-B-LLM token budget. We collapse those occurrences down to one
// aggregated row per distinct `detectorId` at the output-mapper boundary
// (NOT inside the module — the module stays per-occurrence for sourcePath
// telemetry / future filtering). Aggregation is gated by
// `DetectorOptions.aggregateCodegen` (default `true`); raw flow-through is
// available for tests/debugging.
//
// Aggregation only applies to findings whose `detectorId` starts with
// `codegen:` — Spectral / walker / module-class findings pass through
// unchanged.
// =============================================================================

const SEVERITY_RANK: Record<DetectorFinding['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function maxSeverity(
  a: DetectorFinding['severity'],
  b: DetectorFinding['severity']
): DetectorFinding['severity'] {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * Aggregate per-occurrence `codegen:*` DetectorFindings down to one row per
 * distinct `detectorId`. Non-codegen findings pass through unchanged. Order
 * is preserved (first-seen of each codegen-group keeps its original slot).
 *
 * Single-finding groups (count === 1) are emitted unchanged — no "(aggregated,
 * 1 occurrences)" suffix and no narration prefix.
 */
export function aggregateCodegenFindings(
  detectorFindings: DetectorFinding[]
): DetectorFinding[] {
  const groups = new Map<string, DetectorFinding[]>();
  const order: string[] = [];
  const passthrough: Array<{ slot: number; finding: DetectorFinding }> = [];

  detectorFindings.forEach((d, idx) => {
    if (!d.detectorId.startsWith('codegen:')) {
      passthrough.push({ slot: idx, finding: d });
      return;
    }
    const existing = groups.get(d.detectorId);
    if (existing) {
      existing.push(d);
    } else {
      groups.set(d.detectorId, [d]);
      order.push(d.detectorId);
    }
  });

  const aggregated: DetectorFinding[] = [];
  for (const detectorId of order) {
    const group = groups.get(detectorId)!;
    if (group.length === 1) {
      aggregated.push(group[0]);
      continue;
    }

    const first = group[0];
    const distinctSourcePaths: string[] = [];
    const seenSourcePaths = new Set<string>();
    for (const g of group) {
      if (g.sourcePath && !seenSourcePaths.has(g.sourcePath)) {
        seenSourcePaths.add(g.sourcePath);
        distinctSourcePaths.push(g.sourcePath);
      }
    }
    const topSourcePaths = distinctSourcePaths.slice(0, 10);

    const endpointsSeen = new Set<string>();
    const dedupedEndpoints: Array<{ path: string; method: string }> = [];
    for (const g of group) {
      for (const e of g.affectedEndpoints) {
        const key = `${e.path}${e.method}`;
        if (!endpointsSeen.has(key)) {
          endpointsSeen.add(key);
          dedupedEndpoints.push(e);
        }
      }
    }

    // Q8 cap: github-rest can produce up to ~1145 endpoints per aggregated
    // finding (one per operation when the rule fires spec-wide). Unbounded
    // affectedEndpoints arrays blow the Phase-B-LLM token budget — a single
    // codegen-aggregated finding could be ~50KB JSON. Cap to MAX_AGGREGATED_ENDPOINTS
    // and keep the full count in meta.aggregateAffectedEndpointsTotal so
    // downstream Phase-B-Cleanup-Layer-3 can reconstruct the full list from
    // raw findings (via aggregateCodegen: false opt-out) when needed.
    const MAX_AGGREGATED_ENDPOINTS = 100;
    const totalEndpoints = dedupedEndpoints.length;
    const cappedEndpoints =
      totalEndpoints > MAX_AGGREGATED_ENDPOINTS
        ? dedupedEndpoints.slice(0, MAX_AGGREGATED_ENDPOINTS)
        : dedupedEndpoints;

    let sev: DetectorFinding['severity'] = first.severity;
    for (let i = 1; i < group.length; i++) sev = maxSeverity(sev, group[i].severity);

    const cappedSuffix =
      totalEndpoints > MAX_AGGREGATED_ENDPOINTS
        ? ` (showing first ${MAX_AGGREGATED_ENDPOINTS} of ${totalEndpoints} affected endpoints)`
        : '';
    const aggregatedNarrationPrefix =
      `Aggregated from ${group.length} raw codegen findings on ${distinctSourcePaths.length} distinct sourcePaths.` +
      cappedSuffix +
      ` Top sample paths: ${topSourcePaths.join(', ')}.`;

    aggregated.push({
      ...first,
      title: `${first.title} (aggregated, ${group.length} occurrences)`,
      narration: `${aggregatedNarrationPrefix} ${first.narration}`,
      affectedEndpoints: cappedEndpoints,
      severity: sev,
      meta: {
        ...(first.meta ?? {}),
        aggregateOccurrences: group.length,
        aggregateSourcePaths: topSourcePaths,
        aggregateAffectedEndpointsTotal: totalEndpoints,
      },
    });
  }

  // Re-stitch: passthrough items keep their original relative order; the
  // aggregated codegen rows are placed at the position of their group's
  // first-seen finding so output order stays deterministic.
  const codegenSlots: number[] = [];
  detectorFindings.forEach((d, idx) => {
    if (d.detectorId.startsWith('codegen:')) {
      const aggregatedIdx = order.indexOf(d.detectorId);
      if (aggregatedIdx >= 0 && groups.get(d.detectorId)![0] === d) {
        codegenSlots.push(idx);
      }
    }
  });

  const out: DetectorFinding[] = [];
  let codegenCursor = 0;
  let passthroughCursor = 0;
  for (let idx = 0; idx < detectorFindings.length; idx++) {
    if (codegenCursor < codegenSlots.length && codegenSlots[codegenCursor] === idx) {
      out.push(aggregated[codegenCursor]);
      codegenCursor++;
    } else if (
      passthroughCursor < passthrough.length &&
      passthrough[passthroughCursor].slot === idx
    ) {
      out.push(passthrough[passthroughCursor].finding);
      passthroughCursor++;
    }
  }
  return out;
}

/**
 * Mapping pattern: opts is optional + defaults to `{ aggregateCodegen: true }`.
 * Aggregation runs first as a pure DetectorFinding → DetectorFinding pass; the
 * canonical-Finding mapping runs after. Existing callers that don't pass opts
 * get the safe default (aggregation on) which is what production wants.
 */
export function mapDetectorFindings(
  detectorFindings: DetectorFinding[],
  opts: DetectorOptions = {}
): Finding[] {
  const aggregateCodegen = opts.aggregateCodegen ?? true;
  const input = aggregateCodegen ? aggregateCodegenFindings(detectorFindings) : detectorFindings;

  const out: Finding[] = [];
  for (const d of input) {
    try {
      out.push(mapDetectorFinding(d));
    } catch (err) {
      console.warn(
        `[output-mapper] dropped finding from ${d.detectorId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return out;
}
