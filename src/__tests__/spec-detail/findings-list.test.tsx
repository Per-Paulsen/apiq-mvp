/**
 * FindingsList tests (Epic 05).
 *
 * Covers (per spec §"Tests"):
 *   - default sort order: severity desc → category asc → endpoint-path asc
 *   - filter interactions narrow the visible list (severity / category)
 *   - status toggle reveals applied/rejected/stale/outdated
 *   - empty-state messages (zero findings vs. zero matches)
 *
 * Uses a stateful mock of `next/navigation`'s router/searchParams so the
 * URL-driven render is testable without a real Next.js runtime.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Finding } from '@/generated/prisma/client';

// ---- Mocks (declared before importing component under test) --------------

// vi.mock factories are hoisted to the top of the file. To share state with
// the test body we hoist the var declarations alongside via vi.hoisted().
// `state.search` is mutable so per-test fixtures can set initial URL params,
// and the mocked router.replace updates it for click-flow assertions.
const { state, replaceMock } = vi.hoisted(() => {
  const state = { search: '' };
  return {
    state,
    replaceMock: vi.fn((url: string) => {
      state.search = url.startsWith('?') ? url.slice(1) : url;
    }),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

// react-diff-viewer-continued is a heavy lib that does not need to render in
// these tests. The diff button defaults to closed, but we stub anyway for
// safety in case any test opens it.
vi.mock('react-diff-viewer-continued', () => ({
  default: () => <div data-testid="diff-viewer" />,
}));

// ---- Imports (after mocks) -----------------------------------------------

import { TooltipProvider } from '@/components/ui/tooltip';

import { FindingsList } from '@/app/(app)/specs/[specId]/findings-list';

// ---- Helpers --------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-1',
    specId: 'spec-1',
    specVersionId: 'sv-1',
    scope: 'endpoint',
    affectedEndpoints: [{ path: '/orders', method: 'get' }],
    category: 'design',
    severity: 'high',
    title: 'Pagination missing',
    narration:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
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

function renderList(findings: Finding[], specJson: unknown = { paths: {} }) {
  return render(
    <TooltipProvider>
      <FindingsList findings={findings} specCurrentJson={specJson} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  state.search = '';
  replaceMock.mockClear();
});

// ---- Tests ---------------------------------------------------------------

describe('FindingsList — sorting', () => {
  it('renders findings sorted by severity desc → category asc → endpoint-path asc', () => {
    // Build a deliberately mixed set so all three sort keys are exercised:
    //   - one critical (top regardless of category/path)
    //   - two high findings sharing the same severity but differing category
    //   - two medium findings sharing severity+category but differing path
    const findings: Finding[] = [
      makeFinding({
        id: 'f-medium-z',
        severity: 'medium',
        category: 'design',
        title: 'Medium / design / /z',
        affectedEndpoints: [{ path: '/z', method: 'get' }],
      }),
      makeFinding({
        id: 'f-high-risk',
        severity: 'high',
        category: 'risk',
        title: 'High / risk',
        affectedEndpoints: [{ path: '/orders', method: 'get' }],
      }),
      makeFinding({
        id: 'f-medium-a',
        severity: 'medium',
        category: 'design',
        title: 'Medium / design / /a',
        affectedEndpoints: [{ path: '/a', method: 'get' }],
      }),
      makeFinding({
        id: 'f-critical',
        severity: 'critical',
        category: 'risk',
        title: 'Critical / risk',
        affectedEndpoints: [{ path: '/anything', method: 'get' }],
      }),
      makeFinding({
        id: 'f-high-clarity',
        severity: 'high',
        category: 'clarity',
        title: 'High / clarity',
        affectedEndpoints: [{ path: '/foo', method: 'get' }],
      }),
    ];

    renderList(findings);

    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);

    expect(headings).toEqual([
      'Critical / risk', // critical wins severity
      'High / clarity', // high+clarity before high+risk
      'High / risk',
      'Medium / design / /a', // medium+design+/a before medium+design+/z
      'Medium / design / /z',
    ]);
  });
});

describe('FindingsList — filters (initial render from URL params)', () => {
  it('severity URL param narrows the rendered list to matching findings', () => {
    state.search ='severity=critical';

    const findings: Finding[] = [
      makeFinding({
        id: 'crit',
        severity: 'critical',
        title: 'Critical finding',
      }),
      makeFinding({ id: 'high', severity: 'high', title: 'High finding' }),
      makeFinding({ id: 'low', severity: 'low', title: 'Low finding' }),
    ];

    renderList(findings);

    expect(screen.getByText('Critical finding')).toBeInTheDocument();
    expect(screen.queryByText('High finding')).not.toBeInTheDocument();
    expect(screen.queryByText('Low finding')).not.toBeInTheDocument();
  });

  it('category URL param narrows to matching findings', () => {
    state.search ='category=clarity';

    const findings: Finding[] = [
      makeFinding({ id: 'a', category: 'clarity', title: 'Clarity one' }),
      makeFinding({ id: 'b', category: 'design', title: 'Design one' }),
      makeFinding({ id: 'c', category: 'risk', title: 'Risk one' }),
    ];

    renderList(findings);

    expect(screen.getByText('Clarity one')).toBeInTheDocument();
    expect(screen.queryByText('Design one')).not.toBeInTheDocument();
    expect(screen.queryByText('Risk one')).not.toBeInTheDocument();
  });

  it('multiple severities (?severity=critical,high) keeps both', () => {
    state.search ='severity=critical,high';

    const findings: Finding[] = [
      makeFinding({ id: 'a', severity: 'critical', title: 'A crit' }),
      makeFinding({ id: 'b', severity: 'high', title: 'B high' }),
      makeFinding({ id: 'c', severity: 'medium', title: 'C med' }),
    ];

    renderList(findings);

    expect(screen.getByText('A crit')).toBeInTheDocument();
    expect(screen.getByText('B high')).toBeInTheDocument();
    expect(screen.queryByText('C med')).not.toBeInTheDocument();
  });
});

describe('FindingsList — filters (click flow writes to URL)', () => {
  it('clicking a severity pill calls router.replace with ?severity=<value>', async () => {
    const user = userEvent.setup();
    renderList([makeFinding()]);

    await user.click(screen.getByRole('button', { name: 'Critical' }));

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      '?severity=critical',
      expect.objectContaining({ scroll: false }),
    );
  });

  it('clicking a category pill calls router.replace with ?category=<value>', async () => {
    const user = userEvent.setup();
    renderList([makeFinding()]);

    await user.click(screen.getByRole('button', { name: 'Design' }));

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      '?category=design',
      expect.objectContaining({ scroll: false }),
    );
  });
});

describe('FindingsList — status toggle', () => {
  it('default (no ?status) shows ONLY open findings', () => {
    const findings: Finding[] = [
      makeFinding({ id: 'open-1', status: 'open', title: 'Open one' }),
      makeFinding({ id: 'app-1', status: 'applied', title: 'Applied one' }),
      makeFinding({ id: 'rej-1', status: 'rejected', title: 'Rejected one' }),
      makeFinding({ id: 'stale-1', status: 'stale', title: 'Stale one' }),
      makeFinding({ id: 'old-1', status: 'outdated', title: 'Outdated one' }),
    ];

    renderList(findings);

    expect(screen.getByText('Open one')).toBeInTheDocument();
    expect(screen.queryByText('Applied one')).not.toBeInTheDocument();
    expect(screen.queryByText('Rejected one')).not.toBeInTheDocument();
    expect(screen.queryByText('Stale one')).not.toBeInTheDocument();
    expect(screen.queryByText('Outdated one')).not.toBeInTheDocument();
  });

  it('?status=open,applied,rejected,stale,outdated reveals all five', () => {
    state.search ='status=open,applied,rejected,stale,outdated';

    const findings: Finding[] = [
      makeFinding({ id: 'open-1', status: 'open', title: 'Open one' }),
      makeFinding({ id: 'app-1', status: 'applied', title: 'Applied one' }),
      makeFinding({ id: 'rej-1', status: 'rejected', title: 'Rejected one' }),
      makeFinding({ id: 'stale-1', status: 'stale', title: 'Stale one' }),
      makeFinding({ id: 'old-1', status: 'outdated', title: 'Outdated one' }),
    ];

    renderList(findings);

    expect(screen.getByText('Open one')).toBeInTheDocument();
    expect(screen.getByText('Applied one')).toBeInTheDocument();
    expect(screen.getByText('Rejected one')).toBeInTheDocument();
    expect(screen.getByText('Stale one')).toBeInTheDocument();
    expect(screen.getByText('Outdated one')).toBeInTheDocument();
  });

  it('clicking the "Show all" toggle calls router.replace with status=open,applied,rejected,stale,outdated', async () => {
    const user = userEvent.setup();
    renderList([makeFinding()]);

    await user.click(
      screen.getByRole('button', {
        name: /Show applied \/ rejected \/ stale \/ outdated/i,
      }),
    );

    expect(replaceMock).toHaveBeenCalledWith(
      '?status=open%2Capplied%2Crejected%2Cstale%2Coutdated',
      expect.objectContaining({ scroll: false }),
    );
  });
});

describe('FindingsList — empty states', () => {
  it('zero findings on a completed analysis shows the "No findings" message', () => {
    renderList([]);

    expect(
      screen.getByText(/No findings — your spec looks clean\. Re-analyze to refresh\./i),
    ).toBeInTheDocument();
  });

  it('non-empty findings filtered to nothing shows the "No findings match" message', () => {
    // URL filter excludes everything we render.
    state.search ='severity=critical';

    const findings: Finding[] = [
      makeFinding({ id: 'a', severity: 'low', title: 'Low finding' }),
      makeFinding({ id: 'b', severity: 'medium', title: 'Medium finding' }),
    ];

    renderList(findings);

    expect(
      screen.getByText(/No findings match your filters\./i),
    ).toBeInTheDocument();
    // And neither of the actual finding titles is rendered.
    expect(screen.queryByText('Low finding')).not.toBeInTheDocument();
    expect(screen.queryByText('Medium finding')).not.toBeInTheDocument();
  });
});

describe('FindingsList — combined filters', () => {
  it('severity + category + status all applied together', () => {
    state.search =
      'severity=high&category=design&status=open,applied,rejected,stale,outdated';

    const findings: Finding[] = [
      makeFinding({
        id: 'match',
        severity: 'high',
        category: 'design',
        status: 'applied',
        title: 'Should match',
      }),
      makeFinding({
        id: 'wrong-sev',
        severity: 'low',
        category: 'design',
        status: 'applied',
        title: 'Wrong severity',
      }),
      makeFinding({
        id: 'wrong-cat',
        severity: 'high',
        category: 'risk',
        status: 'applied',
        title: 'Wrong category',
      }),
    ];

    renderList(findings);

    const list = screen.getByRole('list');
    expect(within(list).getByText('Should match')).toBeInTheDocument();
    expect(within(list).queryByText('Wrong severity')).not.toBeInTheDocument();
    expect(within(list).queryByText('Wrong category')).not.toBeInTheDocument();
  });
});
