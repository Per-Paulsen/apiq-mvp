/**
 * SpecDetailView tests (Epic 05).
 *
 * Covers (per spec §"Tests"):
 *   - 3 s polling refetches the spec while analysisStatus = pending/analyzing
 *   - polling auto-stops on completed/failed
 *   - failed-card retry: clicking "Retry analysis" calls reanalyzeSpecAction
 *     and router.refresh(); failed-headline appears.
 */
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Finding, Spec, SpecVersion } from '@/generated/prisma/client';

// ---- Mocks (declared before the component is imported) -------------------

// vi.mock factories are hoisted to the top of the file, BEFORE module-level
// const declarations execute. To share spies between tests and mocks, hoist
// the var creation too via vi.hoisted().
const { refreshMock, replaceMock, pushMock, reanalyzeSpecActionMock, repullSpecActionMock } =
  vi.hoisted(() => ({
    refreshMock: vi.fn(),
    replaceMock: vi.fn(),
    pushMock: vi.fn(),
    reanalyzeSpecActionMock: vi.fn(async () => ({ success: true as const })),
    repullSpecActionMock: vi.fn(async () => ({
      success: true as const,
      newVersionId: 'v1',
    })),
  }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
    replace: replaceMock,
    push: pushMock,
  }),
  // FindingsList consumes useSearchParams — only used in the completed-state
  // path. Default to empty search.
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('react-diff-viewer-continued', () => ({
  default: () => <div data-testid="diff-viewer" />,
}));

vi.mock('@/app/(app)/specs/actions', () => ({
  reanalyzeSpecAction: reanalyzeSpecActionMock,
  repullSpecAction: repullSpecActionMock,
}));

// ---- Imports (after mocks) -----------------------------------------------

import { TooltipProvider } from '@/components/ui/tooltip';

import { SpecDetailView } from '@/app/(app)/specs/[specId]/spec-detail-view';

// ---- Helpers --------------------------------------------------------------

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

function renderView(
  spec: Spec,
  findings: Finding[] = [],
  versions: SpecVersion[] = [
    {
      id: 'sv-1',
      specId: spec.id,
      parentVersionId: null,
      versionNumber: 1,
      json: {},
      label: 'Initial pull from URL',
      createdAt: new Date('2026-05-01T00:00:00Z'),
    } as SpecVersion,
  ],
) {
  return render(
    <TooltipProvider>
      <SpecDetailView spec={spec} findings={findings} versions={versions} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  refreshMock.mockClear();
  replaceMock.mockClear();
  pushMock.mockClear();
  reanalyzeSpecActionMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- Polling --------------------------------------------------------------

describe('SpecDetailView — polling', () => {
  it('calls router.refresh() every 3s while analysisStatus = analyzing', () => {
    vi.useFakeTimers();
    const spec = makeSpec({ analysisStatus: 'analyzing' });

    renderView(spec);

    expect(refreshMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(refreshMock).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(refreshMock).toHaveBeenCalledTimes(3);
  });

  it('also polls while analysisStatus = pending', () => {
    vi.useFakeTimers();
    renderView(makeSpec({ analysisStatus: 'pending' }));

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT poll while analysisStatus = completed', () => {
    vi.useFakeTimers();
    renderView(makeSpec({ analysisStatus: 'completed' }));

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('does NOT poll while analysisStatus = failed', () => {
    vi.useFakeTimers();
    renderView(
      makeSpec({
        analysisStatus: 'failed',
        analysisError: 'Some failure',
      }),
    );

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('stops polling on unmount (no leaked interval)', () => {
    vi.useFakeTimers();
    const { unmount } = renderView(makeSpec({ analysisStatus: 'analyzing' }));

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);

    unmount();

    act(() => {
      vi.advanceTimersByTime(9000);
    });
    // No additional refresh calls after unmount.
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('renders the analyzing spinner panel while pending/analyzing', () => {
    vi.useFakeTimers();
    renderView(makeSpec({ analysisStatus: 'analyzing' }));

    expect(
      screen.getByText(/Analyzing… \(typically 30-90 s\)/i),
    ).toBeInTheDocument();
  });
});

// ---- Failed card ----------------------------------------------------------

describe('SpecDetailView — failed-card retry', () => {
  it('renders the budget-exceeded headline when analysisError matches that shape', () => {
    renderView(
      makeSpec({
        analysisStatus: 'failed',
        analysisError:
          'Daily LLM budget reached ($10.50 / $10.00) — resets at 2026-05-03T12:00:00.000Z',
      }),
    );

    expect(
      screen.getByText('Daily LLM budget reached'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Retry analysis/i }),
    ).toBeInTheDocument();
  });

  it('clicking "Retry analysis" calls reanalyzeSpecAction(specId) and router.refresh()', async () => {
    // Real timers — userEvent doesn't compose with fake timers nicely.
    const user = userEvent.setup();
    renderView(
      makeSpec({
        id: 'spec-xyz',
        analysisStatus: 'failed',
        analysisError: 'Something went wrong.',
      }),
    );

    await user.click(screen.getByRole('button', { name: /Retry analysis/i }));

    expect(reanalyzeSpecActionMock).toHaveBeenCalledTimes(1);
    expect(reanalyzeSpecActionMock).toHaveBeenCalledWith({ specId: 'spec-xyz' });
    expect(refreshMock).toHaveBeenCalled();
  });

  it('plain-text analysisError appears as the headline', () => {
    renderView(
      makeSpec({
        analysisStatus: 'failed',
        analysisError: 'Network blew up.',
      }),
    );
    expect(screen.getByText('Network blew up.')).toBeInTheDocument();
  });
});
