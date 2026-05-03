/**
 * Spec Detail screen (Epic 05).
 *
 * Server component — loads the Spec (workspace-scoped, 404 on miss) plus the
 * full Finding list, and hands off to <SpecDetailView/> which renders the
 * header + endpoint list + findings list (or analyzing/failed states).
 *
 * Workspace-scoping pattern (per Epic 03 results): `findFirst` with both
 * `id` and `workspaceId` matched, then `notFound()` so we never leak
 * cross-workspace existence.
 *
 * Findings are loaded for ALL statuses (not just `completed`) — a `failed`
 * re-analysis on a previously-completed spec retains the prior findings, and
 * `pending` / `analyzing` runs may also have older findings (Epic 03's re-pull
 * marks open findings `outdated` instead of deleting them). The Spec status
 * controls what the right pane renders; the findings always feed the endpoint
 * list's per-row counts.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

import { SpecDetailView } from './spec-detail-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ specId: string }>;
}): Promise<Metadata> {
  const session = await getRequiredSession();
  const { specId } = await params;
  const spec = await prisma.spec.findFirst({
    where: { id: specId, workspaceId: session.workspaceId },
    select: { name: true },
  });
  return {
    title: spec ? `${spec.name} · apiq` : 'Spec · apiq',
  };
}

export default async function SpecDetailPage({
  params,
}: {
  params: Promise<{ specId: string }>;
}) {
  const session = await getRequiredSession();
  const { specId } = await params;

  const spec = await prisma.spec.findFirst({
    where: { id: specId, workspaceId: session.workspaceId },
  });

  if (!spec) notFound();

  const [findings, versions] = await Promise.all([
    prisma.finding.findMany({
      where: { specId: spec.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.specVersion.findMany({
      where: { specId: spec.id },
      orderBy: { versionNumber: 'desc' },
    }),
  ]);

  return <SpecDetailView spec={spec} findings={findings} versions={versions} />;
}
