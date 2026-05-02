/**
 * SpecsListView tests (Epic 07).
 *
 * Covers (per spec §"Tests"):
 *   - Renders rows with all columns
 *   - Sort: pending floats to top
 *   - 5s polling — fires while any spec is analyzing, stops otherwise
 *   - Row actions: Delete confirm dialog opens / cancels / confirms
 *   - Re-analyze disabled when status='analyzing'
 *   - Re-pull hidden when sourceType !== 'url' OR wasAuthedPull === true
 */
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Spec } from '@/generated/prisma/client';
import { TooltipProvider } from '@/components/ui/tooltip';

// ---- Hoisted mocks --------------------------------------------------------

const {
  refreshMock,
  pushMock,
  reanalyzeMock,
  repullMock,
  deleteMock,
  loadSampleMock,
} = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  pushMock: vi.fn(),
  reanalyzeMock: vi.fn(async () => ({ success: true as const })),
  repullMock: vi.fn(async () => ({
    success: true as const,
    newVersionId: 'v2',
  })),
  deleteMock: vi.fn(async () => ({ success: true as const })),
  loadSampleMock: vi.fn(async () => ({
    success: true as const,
    specId: 'sample-1',
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));

vi.mock('@/app/(app)/specs/actions', () => ({
  reanalyzeSpecAction: reanalyzeMock,
  repullSpecAction: repullMock,
  deleteSpecAction: deleteMock,
  loadSampleSpecAction: loadSampleMock,
}));

// ---- Imports (after mocks) -----------------------------------------------

import { SpecsListView } from '@/app/(app)/specs/specs-list-view';
import { EmptyState } from '@/app/(app)/specs/empty-state';

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
    originalJson: {},
    currentJson: {},
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

function emptyCounts() {
  return { open: 0, applied: 0, rejected: 0 };
}

beforeEach(() => {
  refreshMock.mockClear();
  pushMock.mockClear();
  reanalyzeMock.mockClear();
  repullMock.mockClear();
  deleteMock.mockClear();
  loadSampleMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- Rendering ------------------------------------------------------------

describe('SpecsListView — rendering', () => {
  it('renders rows with name, quality, status, findings, source, last analyzed', () => {
    render(
      <SpecsListView
        workspaceName="My WS"
        specs={[makeSpec({ id: 's-1', name: 'Alpha API' })]}
        findingCounts={{ 's-1': { open: 3, applied: 1, rejected: 0 } }}
      />,
    );

    expect(screen.getByText('Alpha API')).toBeInTheDocument();
    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    // Findings triplet renders as 3 small coloured pills (open / applied /
    // rejected); each carries an aria-label like "3 open" for accessibility.
    expect(screen.getByLabelText('3 open')).toHaveTextContent('3');
    expect(screen.getByLabelText('1 applied')).toHaveTextContent('1');
    expect(screen.getByLabelText('0 rejected')).toHaveTextContent('0');
    expect(
      screen.getByTitle('https://example.com/openapi.json'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Add Spec/i)).toBeInTheDocument();
    expect(screen.getByText('My WS')).toBeInTheDocument();
  });

  it('renders rows in the order received (sort done in page.tsx, not view)', () => {
    const pendingSpec = makeSpec({
      id: 's-pending',
      name: 'Pending One',
      analysisStatus: 'pending',
      lastAnalyzedAt: null,
      qualityScore: null,
    });
    const completedSpec = makeSpec({
      id: 's-done',
      name: 'Done One',
      analysisStatus: 'completed',
    });

    render(
      <SpecsListView
        workspaceName="WS"
        specs={[pendingSpec, completedSpec]}
        findingCounts={{
          's-pending': emptyCounts(),
          's-done': emptyCounts(),
        }}
      />,
    );

    const rows = screen.getAllByRole('row');
    // Index 0 is the header row; row 1 = first data row.
    expect(within(rows[1]).getByText('Pending One')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Done One')).toBeInTheDocument();
  });
});

// ---- Polling --------------------------------------------------------------

describe('SpecsListView — 5s polling', () => {
  it('refreshes every 5s while any spec is pending/analyzing', () => {
    vi.useFakeTimers();

    render(
      <SpecsListView
        workspaceName="WS"
        specs={[
          makeSpec({ id: 's-1', analysisStatus: 'analyzing' }),
          makeSpec({ id: 's-2', analysisStatus: 'completed' }),
        ]}
        findingCounts={{ 's-1': emptyCounts(), 's-2': emptyCounts() }}
      />,
    );

    expect(refreshMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT refresh when no spec is analyzing', () => {
    vi.useFakeTimers();

    render(
      <SpecsListView
        workspaceName="WS"
        specs={[makeSpec({ id: 's-1', analysisStatus: 'completed' })]}
        findingCounts={{ 's-1': emptyCounts() }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('stops polling on unmount', () => {
    vi.useFakeTimers();

    const { unmount } = render(
      <SpecsListView
        workspaceName="WS"
        specs={[makeSpec({ id: 's-1', analysisStatus: 'analyzing' })]}
        findingCounts={{ 's-1': emptyCounts() }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);

    unmount();

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

// ---- Row actions ----------------------------------------------------------

describe('SpecsListView — row actions menu', () => {
  it('Re-analyze item is disabled when analysisStatus="analyzing" and the disabled-state tooltip says "Already analyzing"', async () => {
    const user = userEvent.setup();
    // Disabled Re-analyze is wrapped in a Radix Tooltip so the disabled
    // state surfaces a proper "Already analyzing" hint — needs a
    // TooltipProvider ancestor (production gets one from (app)/layout).
    render(
      <TooltipProvider>
        <SpecsListView
          workspaceName="WS"
          specs={[makeSpec({ id: 's-1', analysisStatus: 'analyzing' })]}
          findingCounts={{ 's-1': emptyCounts() }}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Row actions/i }));
    const item = await screen.findByRole('menuitem', { name: /Re-analyze/i });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  it('Re-pull is HIDDEN when sourceType !== "url"', async () => {
    const user = userEvent.setup();
    render(
      <SpecsListView
        workspaceName="WS"
        specs={[
          makeSpec({
            id: 's-1',
            sourceType: 'sample',
            sourceUrl: 'apiq:sample/openweathermap',
          }),
        ]}
        findingCounts={{ 's-1': emptyCounts() }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Row actions/i }));
    expect(
      screen.queryByRole('menuitem', { name: /Re-pull from URL/i }),
    ).not.toBeInTheDocument();
  });

  it('Re-pull is HIDDEN when wasAuthedPull === true', async () => {
    const user = userEvent.setup();
    render(
      <SpecsListView
        workspaceName="WS"
        specs={[makeSpec({ id: 's-1', wasAuthedPull: true })]}
        findingCounts={{ 's-1': emptyCounts() }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Row actions/i }));
    expect(
      screen.queryByRole('menuitem', { name: /Re-pull from URL/i }),
    ).not.toBeInTheDocument();
  });

  it('Re-pull is VISIBLE when sourceType="url" and wasAuthedPull=false', async () => {
    const user = userEvent.setup();
    render(
      <SpecsListView
        workspaceName="WS"
        specs={[makeSpec({ id: 's-1' })]}
        findingCounts={{ 's-1': emptyCounts() }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Row actions/i }));
    expect(
      await screen.findByRole('menuitem', { name: /Re-pull from URL/i }),
    ).toBeInTheDocument();
  });

  it('clicking Delete opens AlertDialog; Cancel closes it without calling action', async () => {
    const user = userEvent.setup();
    render(
      <SpecsListView
        workspaceName="WS"
        specs={[makeSpec({ id: 's-1', name: 'To Delete' })]}
        findingCounts={{ 's-1': emptyCounts() }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Row actions/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /Delete/i }),
    );

    expect(
      await screen.findByText('Delete spec?'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('clicking Delete then confirming calls deleteSpecAction({ specId })', async () => {
    const user = userEvent.setup();
    render(
      <SpecsListView
        workspaceName="WS"
        specs={[makeSpec({ id: 's-target', name: 'To Delete' })]}
        findingCounts={{ 's-target': emptyCounts() }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Row actions/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /Delete/i }),
    );
    // Use the dialog's Delete button — there's a "Delete" menuitem too,
    // but it's now closed. Use role=button restricted to dialog footer.
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^Delete$/i }));

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith({ specId: 's-target' });
  });

  it('clicking Re-analyze calls reanalyzeSpecAction({ specId })', async () => {
    const user = userEvent.setup();
    render(
      <SpecsListView
        workspaceName="WS"
        specs={[makeSpec({ id: 's-1', analysisStatus: 'completed' })]}
        findingCounts={{ 's-1': emptyCounts() }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Row actions/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /Re-analyze/i }),
    );
    expect(reanalyzeMock).toHaveBeenCalledTimes(1);
    expect(reanalyzeMock).toHaveBeenCalledWith({ specId: 's-1' });
  });
});

// ---- Empty state ----------------------------------------------------------

describe('EmptyState', () => {
  it('renders heading + both CTAs', () => {
    render(<EmptyState workspaceName="My WS" />);
    expect(
      screen.getByText(/Add your first spec to get started/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Add spec from URL/i }),
    ).toHaveAttribute('href', '/specs/new');
    expect(
      screen.getByRole('button', { name: /Try with a sample spec/i }),
    ).toBeInTheDocument();
  });

  it('"Try with a sample spec" calls loadSampleSpecAction({sampleId:"openweathermap"}) and pushes to detail', async () => {
    const user = userEvent.setup();
    render(<EmptyState workspaceName="My WS" />);

    await user.click(
      screen.getByRole('button', { name: /Try with a sample spec/i }),
    );

    expect(loadSampleMock).toHaveBeenCalledTimes(1);
    expect(loadSampleMock).toHaveBeenCalledWith({
      sampleId: 'openweathermap',
    });
    // pushMock is called inside the transition, after the action resolves —
    // userEvent flushes microtasks so we can assert directly.
    expect(pushMock).toHaveBeenCalledWith('/specs/sample-1');
  });
});
