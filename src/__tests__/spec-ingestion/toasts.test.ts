/**
 * Tests for `formatQuotaToast` (Epic 03 ↔ Epic 08 cross-epic handoff).
 *
 * Both shapes (`rate_limited` from Epic 03's URL-pull rate-limit and
 * `budget_exceeded` from Epic 04's dollar-budget gate) flow through the same
 * formatter so the Toast catalog has a single source of truth.
 */
import { describe, expect, it } from 'vitest';

import { formatQuotaToast } from '@/lib/toasts';

describe('formatQuotaToast', () => {
  it('rate_limited returns an error toast with the retry time', () => {
    const retryAt = new Date('2026-05-02T12:34:00.000Z');
    const out = formatQuotaToast({
      kind: 'rate_limited',
      retryAt: retryAt.toISOString(),
    });
    expect(out.kind).toBe('error');
    expect(out.message).toContain('Limit reached');
    // Locale-formatted time — just verify the timestamp's hour-minute appears.
    const localTime = retryAt.toLocaleTimeString();
    expect(out.message).toContain(localTime);
  });

  it('budget_exceeded includes spent, limit, and reset time', () => {
    const retryAt = new Date('2026-05-02T13:00:00.000Z');
    const out = formatQuotaToast({
      kind: 'budget_exceeded',
      retryAt: retryAt.toISOString(),
      spent: 9.99,
      limit: 10,
    });
    expect(out.kind).toBe('error');
    expect(out.message).toContain('budget');
    expect(out.message).toContain('$9.99');
    expect(out.message).toContain('$10.00');
    expect(out.message).toContain(retryAt.toLocaleTimeString());
  });
});
