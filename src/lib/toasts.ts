/**
 * Toast helpers — minimal v0.1 stub. Epic 08 extends this with the
 * `TOASTS` catalog, the `showToast` function, and a `Toaster` mount.
 *
 * `formatQuotaToast` is the canonical formatter for both quota-error shapes
 * surfaced by Epic 03 (`rate_limited`) and Epic 04 (`budget_exceeded`),
 * per the cross-epic review handoff (2026-05-02).
 */

export function formatQuotaToast(error: {
  kind: 'rate_limited' | 'budget_exceeded';
  retryAt: string;
  spent?: number;
  limit?: number;
}): { kind: 'error'; message: string } {
  const when = new Date(error.retryAt).toLocaleTimeString();
  if (error.kind === 'rate_limited') {
    return { kind: 'error', message: `Limit reached — try again at ${when}` };
  }
  return {
    kind: 'error',
    message: `Daily LLM budget reached ($${error.spent?.toFixed(2)} / $${error.limit?.toFixed(2)}) — resets at ${when}`,
  };
}
