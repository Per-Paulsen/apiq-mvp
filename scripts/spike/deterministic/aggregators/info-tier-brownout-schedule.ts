/**
 * Brownout-schedule walker — Welle F (F6) Lens-3 (Evolution-Friction)
 * positive-marker.
 *
 * Detects the presence of an `x-brownout-schedule` extension at either the
 * spec-root level OR on the `info` block. A brownout-schedule declares
 * scheduled short-duration outages (typically before a deprecation cutover)
 * that let consumers detect dependence on a deprecated endpoint at integration
 * time, not just deadline-time.
 *
 * The pattern was popularized by GitHub's deprecation playbook (R3-PM-EV-07
 * mining): GitHub schedules brief planned brownouts in the weeks leading up
 * to a deprecation, so any client still calling the deprecated endpoint sees
 * temporary 5xx errors and gets surfaced to oncall. This is a deprecation-
 * validator pattern — declaring it spec-side is a positive evolution-friction
 * marker.
 *
 * Sources:
 *   - GitHub deprecation playbook (R3-PM-EV-07 mining-output)
 *   - Round-3 mining (postmortems) — evolution-friction patterns
 *   - Plan-doc §5 F6: deprecation-validator pattern, info-tier
 *
 * Lens: 3 (Evolution-Friction) + 10 (Operational-Metadata)
 * Round: 3 (positive-marker, info-tier emission)
 *
 * Detection rules (conservative + zero-FP):
 *   - Fires if `spec.x-brownout-schedule` exists (root-level extension)
 *   - OR `spec.info.x-brownout-schedule` exists (info-block extension)
 *   - Value must be non-null (object or non-empty array preferred, but
 *     non-empty string also accepted as a date-list).
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';

function isMeaningfulValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0;
  return false;
}

export async function walkBrownoutSchedule(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;

  const rootBrownout = root['x-brownout-schedule'];
  const hasRootBrownout = isMeaningfulValue(rootBrownout);

  let hasInfoBrownout = false;
  const info = root.info;
  if (info && typeof info === 'object') {
    const infoObj = info as Record<string, unknown>;
    hasInfoBrownout = isMeaningfulValue(infoObj['x-brownout-schedule']);
  }

  if (!hasRootBrownout && !hasInfoBrownout) return [];

  const location = hasInfoBrownout
    ? (hasRootBrownout ? 'root + info' : 'info')
    : 'root';
  const sourcePath = hasInfoBrownout ? '/info/x-brownout-schedule' : '/x-brownout-schedule';

  return [{
    detectorId: 'walker:info-tier:brownout-schedule-presence',
    layer: 'walker-statistical',
    title: `Brownout schedule declared (${location})`,
    narration:
      `Spec declares an \`x-brownout-schedule\` extension on the ${location} block. ` +
      `A brownout-schedule documents short, planned outages (typically minutes to hours) ` +
      `scheduled before a deprecation cutover, so any client still calling the deprecated ` +
      `endpoint experiences temporary 5xx errors during the brownout window — surfacing ` +
      `the integration to oncall before the hard cutover. GitHub's deprecation playbook ` +
      `(R3-PM-EV-07 mining-output) popularized the pattern; declaring it spec-side is a ` +
      `positive evolution-friction marker (Lens-3) and an operational-metadata marker ` +
      `(Lens-10). (Informational — no action required.)`,
    rationale:
      'Round-3 postmortem mining (R3-PM-EV-07) identified the brownout-schedule pattern as ' +
      'GitHub\'s deprecation-validator playbook: scheduled brownouts surface lingering ' +
      'integrations to oncall before the hard deprecation deadline. Declaring the schedule ' +
      'spec-side lets agentic clients and infrastructure tooling plan migration windows ' +
      'with the same precision as runtime monitoring.',
    category: 'design',
    severity: 'low',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: '(Positive marker — no patch required.)',
    sourcePath,
    meta: {
      apiqSeverity: 'info',
      lens: ['evolution-friction', 'operational-metadata'],
      positiveMarker: true,
      location,
      patternId: 'F6-INFO-BROWNOUT-SCHEDULE',
      infoTier: true,
    },
  }];
}
