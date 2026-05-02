/**
 * FindingCard stale / outdated tests (Epic 06).
 *
 * Covers AC #8a (no error toast on `patch_stale`) plus the stale-card UI:
 * inline hint, Re-analyze button, and the optional `staleReason` collapsible.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Finding } from '@/generated/prisma/client';

// Stub the diff viewer (its internals are not our concern here).
vi.mock('react-diff-viewer-continued', () => ({
  default: () => <div data-testid="diff-viewer" />,
}));

// Mock all server actions consumed by FindingCard.
vi.mock('@/app/(app)/specs/actions', () => ({
  applyFindingAction: vi.fn(),
  rejectFindingAction: vi.fn(),
  undoApplyAction: vi.fn(),
  undoRejectAction: vi.fn(),
  reanalyzeSpecAction: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock next/navigation — we only need the `refresh` no-op.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

import {
  applyFindingAction,
  reanalyzeSpecAction,
} from '@/app/(app)/specs/actions';
import { FindingCard } from '@/app/(app)/specs/[specId]/finding-card';
import { TooltipProvider } from '@/components/ui/tooltip';

const applyMock = vi.mocked(applyFindingAction);
const reanalyzeMock = vi.mocked(reanalyzeSpecAction);

afterEach(() => {
  applyMock.mockReset();
  reanalyzeMock.mockReset();
  reanalyzeMock.mockResolvedValue({ success: true });
});

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
    narration: 'Narration text.',
    rationale: 'Rationale text.',
    patchSummary: 'Patch summary text.',
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

function renderCard(finding: Finding, specJson: unknown = { paths: {} }) {
  return render(
    <TooltipProvider>
      <FindingCard finding={finding} specCurrentJson={specJson} />
    </TooltipProvider>,
  );
}

describe('FindingCard — patch_stale (AC #8a)', () => {
  it('does NOT render an error alert when applyFindingAction returns patch_stale', async () => {
    applyMock.mockResolvedValue({
      success: false,
      error: { kind: 'patch_stale', message: 'parent path missing' },
    });

    const user = userEvent.setup();
    renderCard(makeFinding({ status: 'open' }));

    const apply = screen.getByRole('button', { name: /Apply/i });
    await user.click(apply);

    // Wait for the transition to settle: the button leaves its disabled state.
    await vi.waitFor(() => {
      expect(applyMock).toHaveBeenCalledWith({ findingId: 'finding-1' });
    });

    // No inline alert / live region surfaced by the card itself.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      document.querySelector('[aria-live="assertive"]'),
    ).not.toBeInTheDocument();
  });
});

describe('FindingCard — stale-card UI', () => {
  it('renders the inline hint and Re-analyze button on a stale finding', () => {
    renderCard(makeFinding({ status: 'stale', staleReason: null }));

    expect(
      screen.getByText(
        /This patch is no longer applicable to the current spec\. Re-analyze to refresh\./i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Re-analyze/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('renders the "Why?" collapsible with staleReason content when set', async () => {
    const user = userEvent.setup();
    const reason =
      'op[0] add /paths/~1foo: parent path "/paths/~1foo" does not exist in spec';
    renderCard(makeFinding({ status: 'stale', staleReason: reason }));

    const summary = screen.getByText('Why?');
    expect(summary.tagName.toLowerCase()).toBe('summary');

    await user.click(summary);

    expect(screen.getByText(reason)).toBeInTheDocument();
  });

  it('does NOT render the "Why?" collapsible when staleReason is null', () => {
    renderCard(makeFinding({ status: 'stale', staleReason: null }));

    expect(screen.queryByText('Why?')).not.toBeInTheDocument();
  });

  it('does NOT render the "Why?" collapsible on outdated, even with staleReason set', () => {
    renderCard(
      makeFinding({
        status: 'outdated',
        staleReason: 'should be ignored on outdated',
      }),
    );

    expect(screen.queryByText('Why?')).not.toBeInTheDocument();
    expect(screen.getByText('Outdated')).toBeInTheDocument();
  });

  it('Re-analyze click on a stale card calls reanalyzeSpecAction with the spec id', async () => {
    const user = userEvent.setup();
    renderCard(
      makeFinding({ specId: 'spec-42', status: 'stale', staleReason: null }),
    );

    const btn = screen.getByRole('button', { name: /Re-analyze/i });
    await user.click(btn);

    await vi.waitFor(() => {
      expect(reanalyzeMock).toHaveBeenCalledWith({ specId: 'spec-42' });
    });
  });
});
