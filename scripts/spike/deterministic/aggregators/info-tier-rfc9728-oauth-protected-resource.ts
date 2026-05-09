/**
 * RFC-9728 OAuth Protected Resource Metadata walker — Welle F (F6)
 * Lens-10 + Lens-9 positive-marker.
 *
 * Detects the canonical `/.well-known/oauth-protected-resource` endpoint
 * defined by RFC 9728 ("OAuth 2.0 Protected Resource Metadata", April 2025).
 * RFC 9728 standardizes a metadata document that describes an OAuth-protected
 * resource server's authentication requirements, supported scopes, and the
 * authorization servers it trusts — the canonical way for clients (especially
 * MCP-based AI agents) to discover OAuth wiring without out-of-band
 * configuration.
 *
 * Strategic significance: RFC 9728 is the OAuth-foundation that the MCP
 * (Model Context Protocol) authentication-spec layers on top of. AI agents
 * using MCP-OAuth depend on this discovery endpoint; presence is therefore
 * a positive AI-agent + threat-modeling marker.
 *
 * Sources:
 *   - RFC 9728 — https://www.rfc-editor.org/rfc/rfc9728 (April 2025)
 *   - Round-4 mining R4-IETF-ST-03 (papers + IETF specs)
 *   - Strategic-vision-doc: MCP-OAuth foundation citation
 *
 * Lens: 10 (Operational-Metadata) + 9 (AI-Agent-Consumability) + 6 (Threat-Modeling)
 * Round: 4 (positive-marker, info-tier emission)
 *
 * Detection rules (conservative + zero-FP):
 *   - Path MUST match exactly `/.well-known/oauth-protected-resource` (with optional trailing `/`)
 *   - No version-prefix variant accepted (RFC 9728 mandates the well-known URI form).
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';

const RFC9728_PATH = /^\/\.well-known\/oauth-protected-resource\/?$/i;

export async function walkRfc9728OauthProtectedResource(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const paths = root.paths;
  if (!paths || typeof paths !== 'object') return [];

  const matched: string[] = [];
  for (const pathKey of Object.keys(paths as Record<string, unknown>)) {
    if (!pathKey.startsWith('/')) continue;
    if (RFC9728_PATH.test(pathKey)) {
      matched.push(pathKey);
    }
  }
  if (matched.length === 0) return [];

  return [{
    detectorId: 'walker:info-tier:rfc-9728-oauth-protected-resource-presence',
    layer: 'walker-statistical',
    title: 'RFC 9728 OAuth Protected Resource Metadata endpoint declared',
    narration:
      `Spec exposes the RFC 9728 \`/.well-known/oauth-protected-resource\` endpoint ` +
      `(${matched.join(', ')}). RFC 9728 ("OAuth 2.0 Protected Resource Metadata", April 2025) ` +
      `standardizes the metadata document that describes an OAuth-protected resource server's ` +
      `authentication requirements, supported scopes, and trusted authorization servers. ` +
      `Strategic significance: RFC 9728 is the OAuth-foundation that the MCP (Model Context ` +
      `Protocol) authentication-spec layers on top of, so AI agents using MCP-OAuth depend on ` +
      `this discovery endpoint. Presence is a positive AI-agent-readiness + threat-modeling ` +
      `marker (Lens-10 + Lens-9 + Lens-6). (Informational — no action required.)`,
    rationale:
      'RFC 9728 (April 2025) is the IETF-standard discovery mechanism for OAuth-protected ' +
      'resource servers. Round-4 mining (R4-IETF-ST-03) identified it as a Lens-10 + Lens-9 ' +
      'positive marker, with strategic significance as the MCP-OAuth foundation. Detecting ' +
      'it lets apiq surface mature OAuth-wiring while the cross-industry adoption curve is ' +
      'still flat (~0% at May 2026 mining).',
    category: 'design',
    severity: 'low',
    scope: 'spec',
    affectedEndpoints: matched.slice(0, 50).map((p) => ({ path: p, method: 'get' })),
    patchOps: [],
    patchSummary: '(Positive marker — no patch required.)',
    sourcePath: '/paths',
    meta: {
      apiqSeverity: 'info',
      lens: ['operational-metadata', 'ai-agent-consumability', 'threat-modeling'],
      positiveMarker: true,
      count: matched.length,
      endpoints: matched,
      patternId: 'F6-INFO-RFC9728',
      rfc: 9728,
      mcpOauthFoundation: true,
      infoTier: true,
    },
  }];
}
