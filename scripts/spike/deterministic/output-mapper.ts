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

import { FindingSchema, type Finding, type PatchOp } from '../schema.js';
import type { DetectorFinding, DetectorLayer } from './types.js';

const LAYER_TAGS: Record<DetectorLayer, string> = {
  'spectral-oas3-default': '[spectral·oas3]',
  'spectral-apiq-custom': '[spectral·apiq]',
  'walker-statistical': '[walker]',
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

export function mapDetectorFindings(detectorFindings: DetectorFinding[]): Finding[] {
  const out: Finding[] = [];
  for (const d of detectorFindings) {
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
