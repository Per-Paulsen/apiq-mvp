/**
 * Toast wiring tests for `<FindingCard />` action handlers (Epic 08).
 *
 *   - Apply happy path → showToast(TOASTS.patchApplied)
 *   - Reject happy     → showToast(TOASTS.patchRejected)
 *   - Undo Apply happy → showToast(TOASTS.applyUndone)
 *   - Undo Reject happy→ showToast(TOASTS.rejectUndone)
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Finding } from '@/generated/prisma/client';

vi.mock('react-diff-viewer-continued', () => ({
  default: () => <div data-testid="diff-viewer" />,
}));

const {
  applyFindingActionMock,
  rejectFindingActionMock,
  undoApplyActionMock,
  undoRejectActionMock,
  reanalyzeSpecActionMock,
} = vi.hoisted(() => ({
  applyFindingActionMock: vi.fn(async () => ({
    success: true as const,
    newVersionId: 'v2',
  })),
  rejectFindingActionMock: vi.fn(async () => ({ success: true as const })),
  undoApplyActionMock: vi.fn(async () => ({ success: true as const })),
  undoRejectActionMock: vi.fn(async () => ({ success: true as const })),
  reanalyzeSpecActionMock: vi.fn(async () => ({ success: true as const })),
}));

vi.mock('@/app/(app)/specs/actions', () => ({
  applyFindingAction: applyFindingActionMock,
  rejectFindingAction: rejectFindingActionMock,
  undoApplyAction: undoApplyActionMock,
  undoRejectAction: undoRejectActionMock,
  reanalyzeSpecAction: reanalyzeSpecActionMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

const {
  showToastMock,
  TOAST_PATCH_APPLIED,
  TOAST_PATCH_REJECTED,
  TOAST_APPLY_UNDONE,
  TOAST_REJECT_UNDONE,
} = vi.hoisted(() => ({
  showToastMock: vi.fn(),
  TOAST_PATCH_APPLIED: { kind: 'success' as const, message: 'Patch applied' },
  TOAST_PATCH_REJECTED: { kind: 'success' as const, message: 'Finding rejected' },
  TOAST_APPLY_UNDONE: { kind: 'success' as const, message: 'Apply undone' },
  TOAST_REJECT_UNDONE: { kind: 'success' as const, message: 'Finding restored' },
}));

vi.mock('@/lib/toasts', () => ({
  showToast: showToastMock,
  formatQuotaToast: vi.fn(),
  TOASTS: {
    reanalyzeStarted: { kind: 'info', message: 'Re-analyzing spec…' },
    rePullComplete: { kind: 'success', message: 'Re-pull complete' },
    specDeleted: { kind: 'success', message: 'Spec deleted' },
    workspaceUpdated: { kind: 'success', message: 'Workspace updated.' },
    profileUpdated: { kind: 'success', message: 'Profile updated.' },
    analysisComplete: { kind: 'success', message: 'Analysis complete' },
    patchApplied: TOAST_PATCH_APPLIED,
    patchRejected: TOAST_PATCH_REJECTED,
    applyUndone: TOAST_APPLY_UNDONE,
    rejectUndone: TOAST_REJECT_UNDONE,
    exportedJson: { kind: 'success', message: 'Exported as JSON' },
    exportedYaml: { kind: 'success', message: 'Exported as YAML' },
  },
}));

import { TooltipProvider } from '@/components/ui/tooltip';

import { FindingCard } from '@/app/(app)/specs/[specId]/finding-card';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-1',
    specId: 'spec-1',
    specVersionId: 'sv-1',
    scope: 'endpoint',
    affectedEndpoints: [{ path: '/orders', method: 'get' }],
    category: 'design',
    severity: 'critical',
    title: 'Pagination missing',
    narration: 'Narration.',
    rationale: 'Rationale.',
    patchSummary: 'Add cursor + limit.',
    patchOps: [
      {
        op: 'add',
        path: '/paths/~1orders/get/parameters/-',
        value: { name: 'cursor', in: 'query' },
      },
    ],
    status: 'open',
    appliedAt: null,
    appliedInVersionId: null,
    rejectedAt: null,
    staleReason: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  } as Finding;
}

function renderCard(finding: Finding) {
  return render(
    <TooltipProvider>
      <FindingCard finding={finding} specCurrentJson={{ paths: {} }} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  showToastMock.mockClear();
  applyFindingActionMock.mockClear();
  rejectFindingActionMock.mockClear();
  undoApplyActionMock.mockClear();
  undoRejectActionMock.mockClear();
  applyFindingActionMock.mockResolvedValue({ success: true, newVersionId: 'v2' });
  rejectFindingActionMock.mockResolvedValue({ success: true });
  undoApplyActionMock.mockResolvedValue({ success: true });
  undoRejectActionMock.mockResolvedValue({ success: true });
});

describe('FindingCard — toast wiring', () => {
  it('fires patchApplied toast on Apply success', async () => {
    const user = userEvent.setup();
    renderCard(makeFinding({ status: 'open' }));

    await user.click(screen.getByRole('button', { name: /^Apply$/i }));

    expect(applyFindingActionMock).toHaveBeenCalledWith({ findingId: 'finding-1' });
    expect(showToastMock).toHaveBeenCalledWith(TOAST_PATCH_APPLIED);
  });

  it('fires patchRejected toast on Reject success', async () => {
    const user = userEvent.setup();
    renderCard(makeFinding({ status: 'open' }));

    await user.click(screen.getByRole('button', { name: /^Reject$/i }));

    expect(rejectFindingActionMock).toHaveBeenCalledWith({ findingId: 'finding-1' });
    expect(showToastMock).toHaveBeenCalledWith(TOAST_PATCH_REJECTED);
  });

  it('fires applyUndone toast on Undo Apply success', async () => {
    const user = userEvent.setup();
    renderCard(
      makeFinding({
        status: 'applied',
        appliedAt: new Date('2026-05-01T00:00:00Z'),
        appliedInVersionId: 'sv-2',
      }),
    );

    await user.click(screen.getByRole('button', { name: /Undo Apply/i }));

    expect(undoApplyActionMock).toHaveBeenCalledWith({ findingId: 'finding-1' });
    expect(showToastMock).toHaveBeenCalledWith(TOAST_APPLY_UNDONE);
  });

  it('fires rejectUndone toast on Undo Reject success', async () => {
    const user = userEvent.setup();
    renderCard(
      makeFinding({
        status: 'rejected',
        rejectedAt: new Date('2026-05-01T00:00:00Z'),
      }),
    );

    await user.click(screen.getByRole('button', { name: /Undo Reject/i }));

    expect(undoRejectActionMock).toHaveBeenCalledWith({ findingId: 'finding-1' });
    expect(showToastMock).toHaveBeenCalledWith(TOAST_REJECT_UNDONE);
  });
});
