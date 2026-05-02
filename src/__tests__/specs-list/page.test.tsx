/**
 * Server-component tests for `/specs/page.tsx` (Epic 07).
 *
 * Covers (per spec §"Tests"):
 *   - Cross-workspace isolation: prisma.spec.findMany is called with
 *     `where: { workspaceId: session.workspaceId }`.
 *   - Finding counts: prisma.finding.groupBy is called with the right
 *     specIds and the resulting Map is forwarded to the view.
 *   - Sort: pending floats to top, then `lastAnalyzedAt desc` (nulls last).
 *   - Empty workspace: renders EmptyState instead of the table.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (declared before importing the module under test) -------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    spec: { findMany: vi.fn() },
    finding: { groupBy: vi.fn() },
    workspace: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/session', () => ({
  getRequiredSession: vi.fn(),
}));

// Stub both client components. The page returns a React element whose
// `.type` is the component reference; we identify which branch was taken
// by comparing the returned element's `.type` to these sentinels.
// Hoisted so vi.mock factories (which run before module-level consts)
// can reach them.
const { SpecsListViewStub, EmptyStateStub } = vi.hoisted(() => ({
  SpecsListViewStub: () => null,
  EmptyStateStub: () => null,
}));

vi.mock('@/app/(app)/specs/specs-list-view', () => ({
  SpecsListView: SpecsListViewStub,
}));
vi.mock('@/app/(app)/specs/empty-state', () => ({
  EmptyState: EmptyStateStub,
}));

// ---- Imports (after mocks) -----------------------------------------------

import SpecsPage from '@/app/(app)/specs/page';
import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

type SpecRow = Awaited<ReturnType<typeof prisma.spec.findMany>>[number];
type FindingGroupRow = Awaited<ReturnType<typeof prisma.finding.groupBy>>[number];
type WorkspaceRow = Awaited<ReturnType<typeof prisma.workspace.findUnique>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    email: 'alice@example.com',
  });
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
    name: 'Workspace One',
  } as WorkspaceRow);
});

// ---- Tests ----------------------------------------------------------------

describe('SpecsPage — workspace scoping', () => {
  it('queries prisma.spec.findMany with `where: { workspaceId: session.workspaceId }`', async () => {
    vi.mocked(prisma.spec.findMany).mockResolvedValue([]);
    vi.mocked(prisma.finding.groupBy).mockResolvedValue([]);

    await SpecsPage();

    expect(prisma.spec.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.spec.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1' },
    });
  });

  it('empty workspace → renders EmptyState (and skips groupBy when no specs)', async () => {
    vi.mocked(prisma.spec.findMany).mockResolvedValue([]);

    const element = await SpecsPage();

    expect(element.type).toBe(EmptyStateStub);
    expect(element.props).toMatchObject({ workspaceName: 'Workspace One' });
    // groupBy is skipped when there are no specs.
    expect(prisma.finding.groupBy).not.toHaveBeenCalled();
  });
});

describe('SpecsPage — finding counts + sort', () => {
  it('passes finding counts (open/applied/rejected) keyed by specId to the view', async () => {
    vi.mocked(prisma.spec.findMany).mockResolvedValue([
      {
        id: 's-1',
        workspaceId: 'workspace-1',
        name: 'A',
        analysisStatus: 'completed',
        lastAnalyzedAt: new Date('2026-04-01'),
      } as SpecRow,
    ]);
    vi.mocked(prisma.finding.groupBy).mockResolvedValue([
      { specId: 's-1', status: 'open', _count: { _all: 4 } } as FindingGroupRow,
      { specId: 's-1', status: 'applied', _count: { _all: 2 } } as FindingGroupRow,
      { specId: 's-1', status: 'rejected', _count: { _all: 1 } } as FindingGroupRow,
      // stale + outdated must be IGNORED at the row level.
      { specId: 's-1', status: 'stale', _count: { _all: 7 } } as FindingGroupRow,
      { specId: 's-1', status: 'outdated', _count: { _all: 3 } } as FindingGroupRow,
    ]);

    const element = await SpecsPage();

    expect(element.type).toBe(SpecsListViewStub);
    const props = element.props as {
      findingCounts: Record<string, { open: number; applied: number; rejected: number }>;
    };
    expect(props.findingCounts['s-1']).toEqual({
      open: 4,
      applied: 2,
      rejected: 1,
    });
  });

  it('sort: pending/analyzing float to top, then lastAnalyzedAt desc (nulls last)', async () => {
    const olderCompleted = {
      id: 's-old',
      workspaceId: 'workspace-1',
      name: 'Older',
      analysisStatus: 'completed',
      lastAnalyzedAt: new Date('2026-04-01'),
    };
    const newerCompleted = {
      id: 's-new',
      workspaceId: 'workspace-1',
      name: 'Newer',
      analysisStatus: 'completed',
      lastAnalyzedAt: new Date('2026-04-10'),
    };
    const pending = {
      id: 's-pending',
      workspaceId: 'workspace-1',
      name: 'Pending',
      analysisStatus: 'pending',
      lastAnalyzedAt: null,
    };
    const nullDate = {
      id: 's-null',
      workspaceId: 'workspace-1',
      name: 'Null Date',
      analysisStatus: 'completed',
      lastAnalyzedAt: null,
    };

    vi.mocked(prisma.spec.findMany).mockResolvedValue([
      olderCompleted as SpecRow,
      newerCompleted as SpecRow,
      pending as SpecRow,
      nullDate as SpecRow,
    ]);
    vi.mocked(prisma.finding.groupBy).mockResolvedValue([]);

    const element = await SpecsPage();

    expect(element.type).toBe(SpecsListViewStub);
    const props = element.props as {
      specs: Array<{ id: string }>;
    };
    expect(props.specs.map((s) => s.id)).toEqual([
      's-pending', // analyzing-state floats to top
      's-new', // newer lastAnalyzedAt
      's-old', // older lastAnalyzedAt
      's-null', // null lastAnalyzedAt last
    ]);
  });

  it('groupBy is called with the workspace specIds (not arbitrary ids)', async () => {
    vi.mocked(prisma.spec.findMany).mockResolvedValue([
      { id: 's-1', workspaceId: 'workspace-1', name: 'A', analysisStatus: 'completed', lastAnalyzedAt: null } as SpecRow,
      { id: 's-2', workspaceId: 'workspace-1', name: 'B', analysisStatus: 'completed', lastAnalyzedAt: null } as SpecRow,
    ]);
    vi.mocked(prisma.finding.groupBy).mockResolvedValue([]);

    await SpecsPage();

    expect(prisma.finding.groupBy).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.finding.groupBy).mock.calls[0][0] as {
      where: { specId: { in: string[] } };
    };
    expect(call.where.specId.in).toEqual(['s-1', 's-2']);
  });
});
