/**
 * Tests for toast wiring in `<SpecDetailHeader />` (Epic 08).
 *
 *   - Re-analyze success → showToast(TOASTS.reanalyzeStarted)
 *   - Re-pull success   → showToast(TOASTS.rePullComplete)
 *   - Re-pull rate_limited → showToast(formatQuotaToast(error))
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Spec, SpecVersion } from '@/generated/prisma/client';

const { reanalyzeSpecActionMock, repullSpecActionMock, exportSpecActionMock } =
  vi.hoisted(() => ({
    reanalyzeSpecActionMock: vi.fn(async () => ({ success: true as const })),
    repullSpecActionMock: vi.fn(async () => ({
      success: true as const,
      newVersionId: 'v2',
    })),
    exportSpecActionMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/app/(app)/specs/actions', () => ({
  reanalyzeSpecAction: reanalyzeSpecActionMock,
  repullSpecAction: repullSpecActionMock,
  exportSpecAction: exportSpecActionMock,
}));

const { showToastMock, formatQuotaToastMock, REANALYZE_TOAST, REPULL_TOAST } =
  vi.hoisted(() => ({
    showToastMock: vi.fn(),
    formatQuotaToastMock: vi.fn((e: { kind: string; retryAt: string }) => ({
      kind: 'error' as const,
      message: `Limit reached — try again at ${new Date(e.retryAt).toLocaleTimeString()}`,
    })),
    REANALYZE_TOAST: { kind: 'info' as const, message: 'Re-analyzing spec…' },
    REPULL_TOAST: { kind: 'success' as const, message: 'Re-pull complete' },
  }));

vi.mock('@/lib/toasts', () => ({
  showToast: showToastMock,
  formatQuotaToast: formatQuotaToastMock,
  TOASTS: {
    reanalyzeStarted: REANALYZE_TOAST,
    rePullComplete: REPULL_TOAST,
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
  },
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import { SpecDetailHeader } from '@/app/(app)/specs/[specId]/spec-detail-header';

function makeSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    id: 'spec-1',
    workspaceId: 'workspace-1',
    name: 'Test Spec',
    sourceType: 'url',
    sourceUrl: 'https://example.com/openapi.json',
    sourceFormat: 'json',
    wasAuthedPull: false,
    originalJson: { openapi: '3.0.0', paths: {} },
    currentJson: { openapi: '3.0.0', paths: {} },
    currentVersionId: 'sv-1',
    endpointCount: 0,
    qualityScore: 87,
    lastAnalyzedAt: new Date('2026-05-01T00:00:00Z'),
    analysisStatus: 'completed',
    analysisError: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  } as Spec;
}

const versions: SpecVersion[] = [
  {
    id: 'sv-1',
    specId: 'spec-1',
    parentVersionId: null,
    versionNumber: 1,
    json: {},
    label: 'Initial pull from URL',
    createdAt: new Date('2026-05-01T00:00:00Z'),
  } as SpecVersion,
];

function renderHeader(spec: Spec) {
  return render(
    <TooltipProvider>
      <SpecDetailHeader spec={spec} versions={versions} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  showToastMock.mockClear();
  formatQuotaToastMock.mockClear();
  reanalyzeSpecActionMock.mockClear();
  repullSpecActionMock.mockClear();
  reanalyzeSpecActionMock.mockResolvedValue({ success: true });
  repullSpecActionMock.mockResolvedValue({ success: true, newVersionId: 'v2' });
});

describe('SpecDetailHeader — toast wiring', () => {
  it('fires reanalyzeStarted toast on Re-analyze success', async () => {
    const user = userEvent.setup();
    renderHeader(makeSpec());

    await user.click(screen.getByRole('button', { name: /Re-analyze/i }));

    expect(reanalyzeSpecActionMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith(REANALYZE_TOAST);
  });

  it('fires rePullComplete toast on Re-pull success', async () => {
    const user = userEvent.setup();
    renderHeader(makeSpec());

    await user.click(screen.getByRole('button', { name: /Re-pull from URL/i }));

    expect(repullSpecActionMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith(REPULL_TOAST);
  });

  it('fires formatQuotaToast(...) when Re-pull is rate-limited', async () => {
    const user = userEvent.setup();
    // The `mockResolvedValue` at line 117 narrowed the mock's return type to
    // the success branch; cast through `never` so the failure-branch shape
    // is accepted for this single override.
    repullSpecActionMock.mockResolvedValueOnce({
      success: false,
      error: { kind: 'rate_limited', retryAt: '2026-05-03T12:00:00Z' },
    } as never);
    renderHeader(makeSpec());

    await user.click(screen.getByRole('button', { name: /Re-pull from URL/i }));

    expect(formatQuotaToastMock).toHaveBeenCalledTimes(1);
    expect(formatQuotaToastMock).toHaveBeenCalledWith({
      kind: 'rate_limited',
      retryAt: '2026-05-03T12:00:00Z',
    });
    expect(showToastMock).toHaveBeenCalledTimes(1);
    // The error toast (the result of formatQuotaToast) is what showToast received.
    const arg = showToastMock.mock.calls[0][0];
    expect(arg.kind).toBe('error');
    expect(arg.message).toMatch(/Limit reached — try again at /);
  });
});
