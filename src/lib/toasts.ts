/**
 * Toast helpers — minimal v0.1 stub. Epic 08 extends this with the
 * `TOASTS` catalog, the `showToast` function, and a `Toaster` mount.
 *
 * `formatQuotaToast` is the canonical formatter for both quota-error shapes
 * surfaced by Epic 03 (`rate_limited`) and Epic 04 (`budget_exceeded`),
 * per the cross-epic review handoff (2026-05-02).
 */

export type ToastShape = { kind: 'info' | 'success' | 'error'; message: string };

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

/**
 * v0.1 stub — Epic 08 replaces this with a real Toaster mount + dispatch.
 * Until then, `showToast` no-ops at runtime so callers can wire up confidently;
 * tests can spy via `vi.spyOn(toasts, 'showToast')`.
 */
export function showToast(toast: ToastShape): void {
  void toast;
}

export const TOASTS: { reanalyzeStarted: ToastShape } = {
  reanalyzeStarted: { kind: 'info', message: 'Re-analyzing spec…' },
};
