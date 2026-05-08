/**
 * Capability-discovery-endpoint walker — Welle F (F6) Lens-10 positive-marker.
 *
 * Detects the presence of a "generic" capability-discovery endpoint at the
 * spec's path level. This is intentionally narrower than the heuristic in
 * `operational-metadata.ts` walker (which uses an 8-pattern regex covering
 * `/health`, `/metadata`, `/openapi`, etc.) — here we look ONLY for the
 * canonical capability-discovery names that signal explicit intent:
 *   - `/capabilities`
 *   - `/.well-known/capabilities`
 *
 * The narrower scope is deliberate: this walker is the "high-confidence"
 * positive-marker companion to L10-4. False-positives on info-tier markers
 * are worse than false-negatives — we want to recognize publishers who
 * deliberately ship a capability-discovery endpoint, not catch every
 * `/health` or `/metadata` endpoint that exists for unrelated reasons.
 *
 * Sources:
 *   - FHIR CapabilityStatement (https://www.hl7.org/fhir/capabilitystatement.html)
 *   - MCP /.well-known/ai-plugin.json + /.well-known/mcp/capabilities
 *   - Round-2 Phase F mining (Lens 10 cross-domain mature-publisher signal)
 *
 * Lens: 10 (Operational-Metadata) + 9 (AI-Agent-Consumability)
 * Round: 2 (positive-marker, info-tier emission)
 *
 * Detection rules (conservative + zero-FP):
 *   - Path key matches `/capabilities` (with or without version-prefix)
 *   - OR path key matches `/.well-known/capabilities`
 *   - Strict end-of-segment match — does NOT match `/capabilities-list` etc.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';

const CAPABILITY_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  // /capabilities or /capabilities/ (with optional version-prefix)
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/capabilities\/?$/i,
  // /.well-known/capabilities or /.well-known/capabilities/{anything}
  /^\/\.well-known\/capabilities(\/|$)/i,
];

export async function walkCapabilityDiscoveryEndpoint(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const paths = root.paths;
  if (!paths || typeof paths !== 'object') return [];

  const matched: string[] = [];
  for (const pathKey of Object.keys(paths as Record<string, unknown>)) {
    if (!pathKey.startsWith('/')) continue;
    if (CAPABILITY_PATH_PATTERNS.some((re) => re.test(pathKey))) {
      matched.push(pathKey);
    }
  }
  if (matched.length === 0) return [];

  return [{
    detectorId: 'walker:info-tier:capability-discovery-endpoint',
    layer: 'walker-statistical',
    title: `Capability-discovery endpoint declared: ${matched.slice(0, 3).join(', ')}`,
    narration:
      `Spec exposes ${matched.length} capability-discovery endpoint(s): ${matched.join(', ')}. ` +
      `A canonical \`/capabilities\` or \`/.well-known/capabilities\` endpoint is a positive ` +
      `AI-agent-readiness marker: it lets agentic clients and infrastructure tooling ` +
      `introspect supported features at runtime instead of relying on out-of-band ` +
      `documentation. FHIR's \`CapabilityStatement\` and MCP's \`/.well-known/...\` family ` +
      `establish the cross-domain pattern. Lens-10 (Operational-Metadata) and Lens-9 ` +
      `(AI-Agent-Consumability) both score this positively. (Informational — no action required.)`,
    rationale:
      'Round-2 Phase F (cross-domain mining) identified capability-discovery as an emerging ' +
      'cross-industry convention (FHIR CapabilityStatement, MCP /.well-known/, Postman ' +
      'discoverability metadata). Detecting the high-confidence canonical names as a ' +
      'positive marker (info-tier) lets apiq surface publisher-maturity without ' +
      'false-flagging absence as a defect.',
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
      endpoints: matched.slice(0, 10),
      patternId: 'F6-INFO-CAPABILITY-DISCOVERY',
      infoTier: true,
    },
  }];
}
