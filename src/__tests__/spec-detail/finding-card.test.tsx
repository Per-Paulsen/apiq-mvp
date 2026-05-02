/**
 * FindingCard tests (Epic 05).
 *
 * Covers per-card rendering: title, severity/category badges, narration,
 * rationale, patch summary, "N endpoints affected" toggle, disabled
 * Apply/Reject buttons with the "Implemented in Epic 06" tooltip text,
 * "Show diff" / "Show JSON Patch ops" expansion toggles.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Finding } from '@/generated/prisma/client';

// Stub the diff viewer — its internals are not our concern here.
vi.mock('react-diff-viewer-continued', () => ({
  default: () => <div data-testid="diff-viewer" />,
}));

import { TooltipProvider } from '@/components/ui/tooltip';

import { FindingCard } from '@/app/(app)/specs/[specId]/finding-card';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-1',
    specId: 'spec-1',
    specVersionId: 'sv-1',
    scope: 'endpoint',
    affectedEndpoints: [
      { path: '/orders', method: 'get' },
      { path: '/orders/{id}', method: 'get' },
    ],
    category: 'design',
    severity: 'critical',
    title: 'Pagination missing',
    narration:
      'The /orders endpoint returns an unpaginated array, which can blow up large workspaces.',
    rationale:
      'Cursor-based pagination prevents duplicate or missed records when collections are mutated mid-iteration.',
    patchSummary: 'Add cursor + limit query params with ETag for cache validation.',
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

describe('FindingCard — rendering', () => {
  it('renders title, narration, rationale, patch summary', () => {
    const f = makeFinding();
    renderCard(f);

    expect(screen.getByRole('heading', { level: 3, name: f.title })).toBeInTheDocument();
    expect(screen.getByText(/unpaginated array/i)).toBeInTheDocument();
    expect(screen.getByText(/Cursor-based pagination/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Add cursor \+ limit query params/i),
    ).toBeInTheDocument();
  });

  it('renders severity badge with the critical colour class', () => {
    renderCard(makeFinding({ severity: 'critical' }));

    const badge = screen.getByText('Critical');
    expect(badge.className).toContain('red-500/15');
  });

  it('renders severity badge with the high colour class', () => {
    renderCard(makeFinding({ severity: 'high', title: 'H' }));
    expect(screen.getByText('High').className).toContain('orange-500/15');
  });

  it('renders severity badge with the medium colour class', () => {
    renderCard(makeFinding({ severity: 'medium', title: 'M' }));
    expect(screen.getByText('Medium').className).toContain('amber-500/15');
  });

  it('renders severity badge with the low colour class', () => {
    renderCard(makeFinding({ severity: 'low', title: 'L' }));
    expect(screen.getByText('Low').className).toContain('blue-500/15');
  });

  it('renders the category badge', () => {
    renderCard(makeFinding({ category: 'design' }));
    expect(screen.getByText('Design')).toBeInTheDocument();
  });

  it('renders "N endpoints affected" toggle (plural for multiple)', () => {
    renderCard(makeFinding()); // 2 endpoints
    expect(
      screen.getByRole('button', { name: /2 endpoints affected/i }),
    ).toBeInTheDocument();
  });

  it('renders "1 endpoint affected" (singular) when scope=endpoint and 1 entry', () => {
    renderCard(
      makeFinding({
        affectedEndpoints: [{ path: '/orders', method: 'get' }],
      }),
    );
    expect(
      screen.getByRole('button', { name: /1 endpoint affected/i }),
    ).toBeInTheDocument();
  });

  it('shows "Spec-level finding" when scope=spec and hides the endpoints button', () => {
    renderCard(makeFinding({ scope: 'spec', affectedEndpoints: [] }));
    expect(screen.getByText(/Spec-level finding/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /endpoint(s)? affected/i }),
    ).not.toBeInTheDocument();
  });
});

describe('FindingCard — Apply/Reject (Epic 06 placeholder)', () => {
  it('Apply and Reject buttons exist, both disabled', () => {
    renderCard(makeFinding());

    const apply = screen.getByRole('button', { name: 'Apply' });
    const reject = screen.getByRole('button', { name: 'Reject' });

    expect(apply).toBeInTheDocument();
    expect(apply).toBeDisabled();
    expect(reject).toBeInTheDocument();
    expect(reject).toBeDisabled();
  });

  it('exposes the "Implemented in Epic 06" tooltip text via TooltipContent on hover', async () => {
    const user = userEvent.setup();
    renderCard(makeFinding());

    // Radix renders TooltipContent lazily on hover. Hover the trigger wrapper.
    // The disabled button is wrapped in a span tabIndex=0; hovering the span
    // triggers the tooltip.
    const apply = screen.getByRole('button', { name: 'Apply' });
    // Hover the parent span — that's the actual TooltipTrigger.
    const triggerSpan = apply.parentElement as HTMLElement;
    await user.hover(triggerSpan);

    // Radix renders content into a portal; getAllByText handles the case
    // where both Apply + Reject share the same content text.
    const tooltips = await screen.findAllByText('Implemented in Epic 06');
    expect(tooltips.length).toBeGreaterThan(0);
  });
});

describe('FindingCard — toggles', () => {
  it('endpoints toggle expands the affected-endpoint list', async () => {
    const user = userEvent.setup();
    renderCard(makeFinding());

    const btn = screen.getByRole('button', { name: /2 endpoints affected/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');

    // The endpoint paths should now appear inside a list.
    expect(screen.getByText('/orders')).toBeInTheDocument();
    expect(screen.getByText('/orders/{id}')).toBeInTheDocument();
  });

  it('"Show diff" toggle flips aria-expanded and renders the diff viewer', async () => {
    const user = userEvent.setup();
    // Provide a spec JSON that the default patchOp can apply against:
    //   /paths/~1orders/get/parameters/- (append to parameters array).
    const specJson = {
      paths: {
        '/orders': {
          get: {
            parameters: [],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    render(
      <TooltipProvider>
        <FindingCard finding={makeFinding()} specCurrentJson={specJson} />
      </TooltipProvider>,
    );

    const btn = screen.getByRole('button', { name: /Show diff/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');

    // The mocked diff viewer renders (only when applyPatch succeeds).
    expect(screen.getByTestId('diff-viewer')).toBeInTheDocument();
  });

  it('"Show diff" with empty patchOps shows the "No diff available" message', async () => {
    const user = userEvent.setup();
    renderCard(makeFinding({ patchOps: [] }));

    const btn = screen.getByRole('button', { name: /Show diff/i });
    await user.click(btn);

    expect(screen.getByText(/No diff available/i)).toBeInTheDocument();
  });

  it('"Show JSON Patch ops" toggle reveals the table', async () => {
    const user = userEvent.setup();
    renderCard(makeFinding());

    const btn = screen.getByRole('button', { name: /Show JSON Patch ops/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');

    // Table headers visible.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('op')).toBeInTheDocument();
    expect(screen.getByText('path')).toBeInTheDocument();
    expect(screen.getByText('value')).toBeInTheDocument();
  });
});
