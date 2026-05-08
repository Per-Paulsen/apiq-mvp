/**
 * Rate-limit-tier-metadata walker — Welle F (F6) Lens-9 (AI-Agent-Pacing)
 * positive-marker.
 *
 * Detects per-operation `x-rate-limit-tier` extensions, popularized by Slack's
 * API documentation (R4-VB-AI-01 vendor-blog mining). Slack labels each
 * operation with a tier (e.g. Tier-1 / Tier-2 / Tier-3 / Tier-4) corresponding
 * to its rate-limit class, letting AI-agent / SDK consumers pace their
 * requests adaptively without per-endpoint header-introspection.
 *
 * This is the "metadata-side" companion to the runtime `RateLimit-*` headers
 * detected by the operational-metadata walker (F-7). Spec-time tier
 * declarations let agentic clients budget their request rate at planning-time,
 * not just react reactively at runtime.
 *
 * Sources:
 *   - Slack API rate-limit documentation (R4-VB-AI-01 mining-output)
 *   - Round-4 vendor-blog mining (Slack rate-limit-tier convention)
 *   - Plan-doc §5 F6: ai-agent-pacing-marker, info-tier per-operation
 *
 * Lens: 9 (AI-Agent-Consumability) + 10 (Operational-Metadata) + 7 (Client-Friction)
 * Round: 4 (positive-marker, info-tier emission, per-operation)
 *
 * Detection rules (conservative + zero-FP):
 *   - For each operation: fire if it has `x-rate-limit-tier` extension.
 *   - Value must be a non-empty string OR a number (Slack uses string tiers
 *     like "Tier 2"; some vendors use numeric 1/2/3/4).
 *   - Fires once per operation (one finding per offender, NOT a single
 *     spec-level finding).
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { walkOperations } from './_shared.js';

function isMeaningfulTierValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return false;
}

export async function walkRateLimitTier(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const findings: DetectorFinding[] = [];

  for (const { path, method, operation } of walkOperations(spec)) {
    const tier = operation['x-rate-limit-tier'];
    if (!isMeaningfulTierValue(tier)) continue;

    const tierStr = String(tier);
    findings.push({
      detectorId: 'walker:info-tier:rate-limit-tier-metadata-presence',
      layer: 'walker-statistical',
      title: `Rate-limit-tier metadata declared on ${method.toUpperCase()} ${path} (tier: ${tierStr})`,
      narration:
        `Operation \`${method.toUpperCase()} ${path}\` declares an \`x-rate-limit-tier\` ` +
        `extension with value "${tierStr}". This is a positive AI-agent-pacing marker — ` +
        `Slack-style rate-limit tier annotations let agentic clients and SDKs budget their ` +
        `request rate at planning-time (per-tier quota mapping) instead of relying purely ` +
        `on reactive runtime header-introspection. The metadata-side companion to runtime ` +
        `\`RateLimit-*\` headers (F-7); spec-time tier declarations enable adaptive request ` +
        `pacing for AI-agent consumers (Lens-9) and reduce client-friction (Lens-7). ` +
        `(Informational — no action required.)`,
      rationale:
        'Round-4 vendor-blog mining (R4-VB-AI-01) identified Slack\'s per-operation ' +
        'rate-limit-tier annotations as a Lens-9 + Lens-10 positive marker. Detecting ' +
        'per-operation tier metadata lets apiq surface adaptive-pacing-friendly specs that ' +
        'enable AI-agent SDKs to budget request rates without exhaustive header-introspection.',
      category: 'design',
      severity: 'low',
      scope: 'endpoint',
      affectedEndpoints: [{ path, method }],
      patchOps: [],
      patchSummary: '(Positive marker — no patch required.)',
      sourcePath: `/paths/${path.replace(/~/g, '~0').replace(/\//g, '~1')}/${method}/x-rate-limit-tier`,
      meta: {
        apiqSeverity: 'info',
        lens: ['ai-agent-consumability', 'operational-metadata', 'client-friction'],
        positiveMarker: true,
        tier: tierStr,
        patternId: 'F6-INFO-RATE-LIMIT-TIER',
        infoTier: true,
      },
    });
  }

  return findings;
}
