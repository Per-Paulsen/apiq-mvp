/**
 * Specs List page (Epic 07).
 *
 * Server component that loads the workspace's specs + per-spec finding
 * counts (open / applied / rejected only — `stale` and `outdated` are
 * transient and not surfaced at the row level per cross-epic Q4) and
 * hands off to the client `SpecsListView` for rendering, polling, and
 * row actions.
 *
 * Sorting (in JS, after fetch): `pending` and `analyzing` floated to the
 * top, then `lastAnalyzedAt desc` (nulls last). Per spec scope §"Default
 * sort" + AC #2.
 *
 * Cross-workspace isolation: every query is scoped via
 * `workspaceId = session.workspaceId` (AC #8).
 */
import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

import { EmptyState } from './empty-state';
import { SpecsListView, type FindingCounts } from './specs-list-view';

export default async function SpecsPage(): Promise<React.JSX.Element> {
  const session = await getRequiredSession();
  const { workspaceId } = session;

  const [specs, workspace] = await Promise.all([
    prisma.spec.findMany({ where: { workspaceId } }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    }),
  ]);

  // Finding counts per spec — single groupBy, then build a Map keyed by
  // specId. Only `open`, `applied`, `rejected` are surfaced (per spec).
  const specIds = specs.map((s) => s.id);
  const groups =
    specIds.length === 0
      ? []
      : await prisma.finding.groupBy({
          by: ['specId', 'status'],
          where: { specId: { in: specIds } },
          _count: { _all: true },
        });

  const findingCounts = new Map<string, FindingCounts>();
  for (const id of specIds) {
    findingCounts.set(id, { open: 0, applied: 0, rejected: 0 });
  }
  for (const g of groups) {
    const counts = findingCounts.get(g.specId);
    if (!counts) continue;
    if (g.status === 'open') counts.open = g._count._all;
    else if (g.status === 'applied') counts.applied = g._count._all;
    else if (g.status === 'rejected') counts.rejected = g._count._all;
  }

  // Sort: pending/analyzing first, then `lastAnalyzedAt desc` with nulls last.
  const isAnalyzing = (status: string): boolean =>
    status === 'pending' || status === 'analyzing';
  const sorted = [...specs].sort((a, b) => {
    const aActive = isAnalyzing(a.analysisStatus);
    const bActive = isAnalyzing(b.analysisStatus);
    if (aActive !== bActive) return aActive ? -1 : 1;
    const aTime = a.lastAnalyzedAt?.getTime() ?? null;
    const bTime = b.lastAnalyzedAt?.getTime() ?? null;
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return bTime - aTime;
  });

  if (sorted.length === 0) {
    return <EmptyState workspaceName={workspace?.name ?? 'Workspace'} />;
  }

  return (
    <SpecsListView
      specs={sorted}
      findingCounts={Object.fromEntries(findingCounts)}
      workspaceName={workspace?.name ?? 'Workspace'}
    />
  );
}
