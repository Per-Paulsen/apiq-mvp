/**
 * Toast helpers — Epic 08.
 *
 * `formatQuotaToast` is the canonical formatter for both quota-error shapes
 * surfaced by Epic 03 (`rate_limited`) and Epic 04 (`budget_exceeded`),
 * per the cross-epic review handoff (2026-05-02).
 */

import { toast } from 'sonner';

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

export function showToast(t: ToastShape): void {
  if (t.kind === 'success') {
    toast.success(t.message);
    return;
  }
  if (t.kind === 'error') {
    toast.error(t.message);
    return;
  }
  toast.info(t.message);
}

export const TOASTS: {
  reanalyzeStarted: ToastShape;
  rePullComplete: ToastShape;
  specDeleted: ToastShape;
  workspaceUpdated: ToastShape;
  profileUpdated: ToastShape;
  analysisComplete: ToastShape;
  patchApplied: ToastShape;
  patchRejected: ToastShape;
  applyUndone: ToastShape;
  rejectUndone: ToastShape;
  exportedJson: ToastShape;
  exportedYaml: ToastShape;
} = {
  reanalyzeStarted: { kind: 'info', message: 'Re-analyzing spec…' },
  rePullComplete: { kind: 'success', message: 'Re-pull complete' },
  specDeleted: { kind: 'success', message: 'Spec deleted' },
  workspaceUpdated: { kind: 'success', message: 'Workspace updated.' },
  profileUpdated: { kind: 'success', message: 'Profile updated.' },
  analysisComplete: { kind: 'success', message: 'Analysis complete' },
  patchApplied: { kind: 'success', message: 'Patch applied' },
  patchRejected: { kind: 'success', message: 'Finding rejected' },
  applyUndone: { kind: 'success', message: 'Apply undone' },
  rejectUndone: { kind: 'success', message: 'Finding restored' },
  exportedJson: { kind: 'success', message: 'Exported as JSON' },
  exportedYaml: { kind: 'success', message: 'Exported as YAML' },
};
