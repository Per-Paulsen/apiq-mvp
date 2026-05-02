import type { Finding } from '@/generated/prisma/client';

/**
 * Deterministic quality score derived from open findings.
 *
 * Formula: clamp(100 - (15·critical + 7·high + 3·medium + 1·low), 0, 100).
 * Counts only `status === 'open'` findings. Pure function — no LLM call,
 * no DB call. Used by:
 *   - Epic 04 `runAnalysis` after persisting fresh findings
 *   - Epic 06 apply / reject / undo actions for transactional recompute
 */
export function computeQualityScore(findings: Finding[]): number {
  const open = findings.filter((f) => f.status === 'open');
  let penalty = 0;
  for (const f of open) {
    switch (f.severity) {
      case 'critical': penalty += 15; break;
      case 'high':     penalty += 7;  break;
      case 'medium':   penalty += 3;  break;
      case 'low':      penalty += 1;  break;
    }
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}
