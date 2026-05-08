/**
 * SLA4OAI-presence walker — Welle F (F6) Lens-10 positive-marker.
 *
 * Detects the SLA4OAI vendor-extension (`info.x-sla` / `info.x-sla4oai`) on the
 * spec's `info` block. SLA4OAI is the OpenAPI Initiative's standard for
 * declaring service-level-agreements machine-readably (availability, latency,
 * throughput, quotas), and its presence is a positive operational-maturity
 * marker: the publisher has thought about SLO/SLA contracts at spec-time, not
 * just runtime.
 *
 * Sources:
 *   - SLA4OAI specification: https://sla4oai.specs.apiopenstudio.com
 *   - Round-2 Lens-10 mining (Phase F): mature-publisher signal
 *   - Round-3+4 enrichment: SLA-extension presence flagged as adjacency to
 *     RFC 9728 / capability-discovery info-tier markers
 *
 * Lens: 10 (Operational-Metadata)
 * Round: 2 (positive-marker, info-tier emission)
 *
 * Detection rules (conservative + zero-FP):
 *   - Fires ONLY if `spec.info` is an object AND it has `x-sla` OR `x-sla4oai`
 *   - The extension value must be a non-null object (not a stub-string).
 *   - Emits exactly one `severity: 'low'` (apiqSeverity: 'info') finding.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';

export async function walkSla4oaiPresence(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const info = root.info;
  if (!info || typeof info !== 'object') return [];
  const infoObj = info as Record<string, unknown>;

  const xSla = infoObj['x-sla'];
  const xSla4Oai = infoObj['x-sla4oai'];
  const hasXSla = xSla !== undefined && xSla !== null && typeof xSla === 'object';
  const hasXSla4Oai = xSla4Oai !== undefined && xSla4Oai !== null && typeof xSla4Oai === 'object';
  if (!hasXSla && !hasXSla4Oai) return [];

  const which = hasXSla4Oai ? 'x-sla4oai' : 'x-sla';

  return [{
    detectorId: 'walker:info-tier:sla4oai-presence',
    layer: 'walker-statistical',
    title: 'SLA4OAI extension declared',
    narration:
      `Spec declares an \`info.${which}\` extension. This is a positive ` +
      `operational-maturity marker: SLA4OAI (OpenAPI Initiative standard) declares ` +
      `service-level agreements machine-readably (availability, latency, throughput, ` +
      `quotas) at spec-time, which lets SRE/observability tooling and AI-agent ` +
      `consumers reason about SLO/SLA contracts without out-of-band documentation. ` +
      `Cross-industry adoption is low (<5% of public OpenAPI specs in the corpus); ` +
      `presence indicates a mature-publisher signal. (Informational — no action required.)`,
    rationale:
      'SLA4OAI is the OpenAPI Initiative\'s standard for declaring SLA/SLO metadata ' +
      'on OpenAPI specs (https://sla4oai.specs.apiopenstudio.com). Lens-10 ' +
      '(Operational-Metadata-Coverage) treats spec-time SLA declarations as a ' +
      'positive marker because runtime consumers (SRE, observability tooling, ' +
      'agentic clients) depend on contract-time guarantees for capacity-planning ' +
      'and adaptive-retry logic.',
    category: 'design',
    severity: 'low',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: '(Positive marker — no patch required.)',
    sourcePath: `/info/${which}`,
    meta: {
      apiqSeverity: 'info',
      lens: ['operational-metadata'],
      positiveMarker: true,
      extensionKey: which,
      patternId: 'F6-INFO-SLA4OAI',
      infoTier: true,
    },
  }];
}
