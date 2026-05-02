/**
 * Spec Detail placeholder. Epic 03 redirects here from the Add Spec form;
 * Epic 05 replaces this page with the full Spec Detail screen (findings list,
 * diff viewer, apply/reject buttons, versions drawer).
 *
 * This placeholder still scopes the lookup to the current workspace and 404s
 * if the id is unknown (or belongs to a different workspace) so we don't leak
 * cross-workspace existence.
 */
import { notFound } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

export default async function SpecPlaceholderPage({
  params,
}: {
  params: Promise<{ specId: string }>;
}) {
  const session = await getRequiredSession();
  const { specId } = await params;

  const spec = await prisma.spec.findFirst({
    where: { id: specId, workspaceId: session.workspaceId },
    select: {
      id: true,
      name: true,
      analysisStatus: true,
      sourceType: true,
      sourceUrl: true,
      endpointCount: true,
      createdAt: true,
    },
  });

  if (!spec) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6">
      <h1 className="text-xl font-semibold">{spec.name}</h1>
      <p className="text-sm text-muted-foreground">
        Source:{' '}
        <code className="font-mono text-xs">
          {spec.sourceUrl ?? spec.sourceType}
        </code>
      </p>
      <p className="text-sm">
        Status: <span className="font-mono">{spec.analysisStatus}</span> ·{' '}
        {spec.endpointCount} endpoint{spec.endpointCount === 1 ? '' : 's'}
      </p>
      <p className="text-xs text-muted-foreground">
        Placeholder — Epic 05 replaces this with the full Spec Detail screen
        (findings list, diff viewer, apply/reject buttons).
      </p>
    </main>
  );
}
