/**
 * Quality-score formula tests (Epic 04 AC #9).
 *
 * `computeQualityScore` is a pure function — no mocks needed.
 * Formula: clamp(100 - (15·critical + 7·high + 3·medium + 1·low), 0, 100).
 * Counts only `status === 'open'` findings.
 */
import { describe, expect, it } from 'vitest';

import type { Finding } from '@/generated/prisma/client';

import { computeQualityScore } from '@/lib/analysis/quality-score';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type Status = 'open' | 'applied' | 'rejected' | 'stale' | 'outdated';

function f(severity: Severity, status: Status = 'open'): Finding {
  // The function reads only `status` and `severity`; everything else is
  // padding to satisfy the Finding type. Cast keeps the test compact.
  return { severity, status } as unknown as Finding;
}

describe('computeQualityScore (AC #9)', () => {
  it('returns 100 when there are no findings', () => {
    expect(computeQualityScore([])).toBe(100);
  });

  it('clamps to 0 when 7 critical findings would push the score negative', () => {
    // 7 × 15 = 105 → 100 - 105 = -5 → clamped to 0.
    const findings = Array.from({ length: 7 }, () => f('critical'));
    expect(computeQualityScore(findings)).toBe(0);
  });

  it('mixed: 1 critical + 2 high + 3 medium + 1 low → 61', () => {
    // 100 - (15 + 14 + 9 + 1) = 61.
    const findings = [
      f('critical'),
      f('high'),
      f('high'),
      f('medium'),
      f('medium'),
      f('medium'),
      f('low'),
    ];
    expect(computeQualityScore(findings)).toBe(61);
  });

  it('one of each severity → 74', () => {
    // 100 - (15 + 7 + 3 + 1) = 74.
    expect(
      computeQualityScore([f('critical'), f('high'), f('medium'), f('low')]),
    ).toBe(74);
  });

  it('counts only `status === "open"` findings (applied / rejected / stale / outdated are ignored)', () => {
    // 5 critical findings, 4 are non-open (applied) and 1 is open.
    // Only the open one penalises → 100 - 15 = 85.
    const findings = [
      f('critical', 'applied'),
      f('critical', 'applied'),
      f('critical', 'applied'),
      f('critical', 'applied'),
      f('critical', 'open'),
    ];
    expect(computeQualityScore(findings)).toBe(85);
  });

  it('clamps to 0 with 100 low findings', () => {
    // 100 × 1 = 100 → 100 - 100 = 0 (boundary, stays 0).
    const findings = Array.from({ length: 100 }, () => f('low'));
    expect(computeQualityScore(findings)).toBe(0);
  });

  it('a single low finding → 99', () => {
    expect(computeQualityScore([f('low')])).toBe(99);
  });

  it('a single critical finding → 85', () => {
    expect(computeQualityScore([f('critical')])).toBe(85);
  });

  it('rejected and outdated findings, no opens → 100', () => {
    expect(
      computeQualityScore([
        f('critical', 'rejected'),
        f('high', 'outdated'),
        f('medium', 'stale'),
        f('low', 'applied'),
      ]),
    ).toBe(100);
  });
});
