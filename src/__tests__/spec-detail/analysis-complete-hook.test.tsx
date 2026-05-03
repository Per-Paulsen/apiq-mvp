/**
 * Tests for the analysisComplete effect inside `<SpecDetailView />` (Epic 08).
 *
 * Fires `showToast(TOASTS.analysisComplete)` exactly once per
 * (spec.id × session) when the polling layer transitions
 * (pending|analyzing) → completed. Cold-loading a spec already in `completed`
 * must NOT fire — the user did not just witness the transition.
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

const { showToastMock, formatQuotaToastMock, ANALYSIS_COMPLETE } = vi.hoisted(
  () => ({
    showToastMock: vi.fn(),
    formatQuotaToastMock: vi.fn(),
    ANALYSIS_COMPLETE: { kind: 'success' as const, message: 'Analysis complete' },
  }),
);

vi.mock('@/lib/toasts', () => ({
  showToast: showToastMock,
  formatQuotaToast: formatQuotaToastMock,
  TOASTS: {
    reanalyzeStarted: { kind: 'info', message: 'Re-analyzing spec…' },
    rePullComplete: { kind: 'success', message: 'Re-pull complete' },
    specDeleted: { kind: 'success', message: 'Spec deleted' },
    workspaceUpdated: { kind: 'success', message: 'Workspace updated.' },
    profileUpdated: { kind: 'success', message: 'Profile updated.' },
    analysisComplete: ANALYSIS_COMPLETE,
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
    analysisStatus: 'analyzing',
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

function renderView(spec: Spec, findings: Finding[] = []) {
  return render(
    <TooltipProvider>
      <SpecDetailView spec={spec} findings={findings} versions={versions} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  showToastMock.mockClear();
  sessionStorage.clear();
});

describe('SpecDetailView — analysisComplete effect', () => {
  it('fires when analysisStatus transitions analyzing → completed', () => {
    const spec = makeSpec({ analysisStatus: 'analyzing' });
    const { rerender } = renderView(spec);
    expect(showToastMock).not.toHaveBeenCalled();

    rerender(
      <TooltipProvider>
        <SpecDetailView
          spec={makeSpec({ analysisStatus: 'completed' })}
          findings={[]}
          versions={versions}
        />
      </TooltipProvider>,
    );

    expect(showToastMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith(ANALYSIS_COMPLETE);
    expect(sessionStorage.getItem('apiq.analysis-complete-toast.spec-1')).toBe('1');
  });

  it('fires when transitioning pending → completed', () => {
    const { rerender } = renderView(makeSpec({ analysisStatus: 'pending' }));
    expect(showToastMock).not.toHaveBeenCalled();

    rerender(
      <TooltipProvider>
        <SpecDetailView
          spec={makeSpec({ analysisStatus: 'completed' })}
          findings={[]}
          versions={versions}
        />
      </TooltipProvider>,
    );

    expect(showToastMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on a cold-load with analysisStatus already completed', () => {
    renderView(makeSpec({ analysisStatus: 'completed' }));
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('does NOT fire a second time when the dedupe key is set', () => {
    sessionStorage.setItem('apiq.analysis-complete-toast.spec-1', '1');

    const { rerender } = renderView(makeSpec({ analysisStatus: 'analyzing' }));
    rerender(
      <TooltipProvider>
        <SpecDetailView
          spec={makeSpec({ analysisStatus: 'completed' })}
          findings={[]}
          versions={versions}
        />
      </TooltipProvider>,
    );

    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('does NOT fire when transitioning to failed', () => {
    const { rerender } = renderView(makeSpec({ analysisStatus: 'analyzing' }));
    rerender(
      <TooltipProvider>
        <SpecDetailView
          spec={makeSpec({ analysisStatus: 'failed', analysisError: 'oops' })}
          findings={[]}
          versions={versions}
        />
      </TooltipProvider>,
    );
    expect(showToastMock).not.toHaveBeenCalled();
  });
});
