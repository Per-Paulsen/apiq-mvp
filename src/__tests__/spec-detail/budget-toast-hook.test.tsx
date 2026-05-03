/**
 * Tests for the budget-toast effect inside `<SpecDetailView />` (Epic 08).
 *
 * The effect fires a once-per-session error toast when:
 *   - analysisStatus === 'failed' AND
 *   - analysisError matches the budget-exceeded shape
 *     ("Daily LLM budget reached ($X.XX / $Y.YY) — resets at <iso>")
 *
 * Dedupe key: `apiq.budget-toast.<specId>` in sessionStorage.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Finding, Spec, SpecVersion } from '@/generated/prisma/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('react-diff-viewer-continued', () => ({
  default: () => <div data-testid="diff-viewer" />,
}));

vi.mock('@/app/(app)/specs/actions', () => ({
  reanalyzeSpecAction: vi.fn(async () => ({ success: true as const })),
  repullSpecAction: vi.fn(async () => ({
    success: true as const,
    newVersionId: 'v1',
  })),
  exportSpecAction: vi.fn(),
  applyFindingAction: vi.fn(),
  rejectFindingAction: vi.fn(),
  undoApplyAction: vi.fn(),
  undoRejectAction: vi.fn(),
}));

const { showToastMock, formatQuotaToastMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
  formatQuotaToastMock: vi.fn(
    (e: { kind: string; spent?: number; limit?: number; retryAt: string }) => ({
      kind: 'error' as const,
      message: `Daily LLM budget reached ($${e.spent?.toFixed(2)} / $${e.limit?.toFixed(2)}) — resets at ${e.retryAt}`,
    }),
  ),
}));

vi.mock('@/lib/toasts', () => ({
  showToast: showToastMock,
  formatQuotaToast: formatQuotaToastMock,
  TOASTS: {
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
  },
}));

import { TooltipProvider } from '@/components/ui/tooltip';

import { SpecDetailView } from '@/app/(app)/specs/[specId]/spec-detail-view';

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
    analysisStatus: 'failed',
    analysisError: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  } as Spec;
}

function renderView(spec: Spec, findings: Finding[] = []) {
  const versions: SpecVersion[] = [
    {
      id: 'sv-1',
      specId: spec.id,
      parentVersionId: null,
      versionNumber: 1,
      json: {},
      label: 'Initial pull from URL',
      createdAt: new Date('2026-05-01T00:00:00Z'),
    } as SpecVersion,
  ];
  return render(
    <TooltipProvider>
      <SpecDetailView spec={spec} findings={findings} versions={versions} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  showToastMock.mockClear();
  formatQuotaToastMock.mockClear();
  sessionStorage.clear();
});

describe('SpecDetailView — budget-toast effect', () => {
  it('fires showToast(formatQuotaToast(...)) when analysisError matches the budget shape', () => {
    renderView(
      makeSpec({
        id: 'spec-budget',
        analysisStatus: 'failed',
        analysisError:
          'Daily LLM budget reached ($10.00 / $10.00) — resets at 2026-05-04T00:00:00Z',
      }),
    );

    expect(formatQuotaToastMock).toHaveBeenCalledTimes(1);
    expect(formatQuotaToastMock).toHaveBeenCalledWith({
      kind: 'budget_exceeded',
      spent: 10,
      limit: 10,
      retryAt: '2026-05-04T00:00:00Z',
    });
    expect(showToastMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('apiq.budget-toast.spec-budget')).toBe('1');
  });

  it('does NOT fire a second toast when re-rendered with the same specId', () => {
    const spec = makeSpec({
      id: 'spec-budget',
      analysisStatus: 'failed',
      analysisError:
        'Daily LLM budget reached ($10.00 / $10.00) — resets at 2026-05-04T00:00:00Z',
    });
    const { rerender } = renderView(spec);
    expect(showToastMock).toHaveBeenCalledTimes(1);

    rerender(
      <TooltipProvider>
        <SpecDetailView
          spec={spec}
          findings={[]}
          versions={[
            {
              id: 'sv-1',
              specId: spec.id,
              parentVersionId: null,
              versionNumber: 1,
              json: {},
              label: 'Initial pull from URL',
              createdAt: new Date('2026-05-01T00:00:00Z'),
            } as SpecVersion,
          ]}
        />
      </TooltipProvider>,
    );

    // Same key already in sessionStorage → effect must short-circuit.
    expect(showToastMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when analysisError is a non-budget plain string', () => {
    renderView(
      makeSpec({
        id: 'spec-other',
        analysisStatus: 'failed',
        analysisError: 'Network blew up.',
      }),
    );
    expect(showToastMock).not.toHaveBeenCalled();
    expect(formatQuotaToastMock).not.toHaveBeenCalled();
  });

  it('does NOT fire when analysisStatus is not "failed"', () => {
    renderView(
      makeSpec({
        analysisStatus: 'completed',
        analysisError: null,
      }),
    );
    expect(showToastMock).not.toHaveBeenCalled();
  });
});
