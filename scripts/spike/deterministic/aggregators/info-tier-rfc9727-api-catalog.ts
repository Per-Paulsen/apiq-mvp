/**
 * RFC-9727 api-catalog walker — Welle F (F6) Lens-10 positive-marker.
 *
 * Detects the canonical `/.well-known/api-catalog` endpoint defined by RFC 9727
 * ("api-catalog: A Well-Known URI for Publishing API Descriptions", March 2025).
 * RFC 9727 standardizes a discovery endpoint that returns a Linkset (RFC 9264)
 * pointing to all the API descriptions a publisher exposes — the canonical way
 * for agentic clients and tooling to discover an organization's API surface
 * without per-vendor conventions.
 *
 * Adoption-baseline at Round-3+4 mining (May 2026): ~0% across the public
 * OpenAPI corpus. Presence is therefore a strong positive operational-maturity
 * marker — the publisher is ahead of cross-industry adoption.
 *
 * Sources:
 *   - RFC 9727 — https://www.rfc-editor.org/rfc/rfc9727 (March 2025)
 *   - Round-4 mining R4-IETF-ST-04 (papers + IETF specs)
 *   - Plan-doc §5 F6: 0% adoption-baseline noted
 *
 * Lens: 10 (Operational-Metadata) + 9 (AI-Agent-Consumability)
 * Round: 4 (positive-marker, info-tier emission)
 *
 * Detection rules (conservative + zero-FP):
 *   - Path MUST match exactly `/.well-known/api-catalog` (with optional trailing `/`)
 *   - No version-prefix variant accepted (RFC 9727 mandates the well-known URI form).
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';

const RFC9727_PATH = /^\/\.well-known\/api-catalog\/?$/i;

export async function walkRfc9727ApiCatalog(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const paths = root.paths;
  if (!paths || typeof paths !== 'object') return [];

  const matched: string[] = [];
  for (const pathKey of Object.keys(paths as Record<string, unknown>)) {
    if (!pathKey.startsWith('/')) continue;
    if (RFC9727_PATH.test(pathKey)) {
      matched.push(pathKey);
    }
  }
  if (matched.length === 0) return [];

  return [{
    detectorId: 'walker:info-tier:rfc-9727-api-catalog-presence',
    layer: 'walker-statistical',
    title: 'RFC 9727 api-catalog endpoint declared',
    narration:
      `Spec exposes the RFC 9727 \`/.well-known/api-catalog\` endpoint (${matched.join(', ')}). ` +
      `RFC 9727 ("api-catalog: A Well-Known URI for Publishing API Descriptions", March 2025) ` +
      `standardizes a discovery endpoint that returns a Linkset (RFC 9264) pointing to all ` +
      `API descriptions a publisher exposes. This is the canonical mechanism for agentic ` +
      `clients and tooling to discover an organization's API surface without per-vendor ` +
      `conventions. Adoption-baseline at Round-3+4 mining: ~0% across the public corpus — ` +
      `presence is a strong positive operational-maturity marker (publisher is ahead of ` +
      `cross-industry adoption). (Informational — no action required.)`,
    rationale:
      'RFC 9727 (March 2025) is the IETF-standard discovery mechanism for API descriptions. ' +
      'Round-4 mining (R4-IETF-ST-04) identified it as a Lens-10 positive marker with 0% ' +
      'adoption-baseline. Detecting it lets apiq surface bleeding-edge operational-maturity ' +
      'signals while the cross-industry adoption curve is still flat.',
    category: 'design',
    severity: 'low',
    scope: 'spec',
    affectedEndpoints: matched.slice(0, 50).map((p) => ({ path: p, method: 'get' })),
    patchOps: [],
    patchSummary: '(Positive marker — no patch required.)',
    sourcePath: '/paths',
    meta: {
      apiqSeverity: 'info',
      lens: ['operational-metadata', 'ai-agent-consumability'],
      positiveMarker: true,
      count: matched.length,
      endpoints: matched,
      patternId: 'F6-INFO-RFC9727',
      rfc: 9727,
      adoptionBaseline: 0.0,
      infoTier: true,
    },
  }];
}
