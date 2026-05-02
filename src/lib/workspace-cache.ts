/**
 * Cached workspace-name lookup for the (app)/layout sidebar footer.
 *
 * Wrapping `prisma.workspace.findUnique` in `unstable_cache` means navigating
 * between (app) routes does NOT refetch the same row from Postgres on every
 * page load. Tagged with `'workspace-name'` so `updateWorkspaceAction` can
 * invalidate just this entry via `revalidateTag` after a rename.
 *
 * Returns the workspace name, or `'Workspace'` as a defensive fallback if the
 * row is missing (data-integrity invariant from Epic 02 says it never is).
 */
import 'server-only';

import { unstable_cache } from 'next/cache';

import { prisma } from '@/lib/prisma';

export const WORKSPACE_NAME_CACHE_TAG = 'workspace-name';

export const getWorkspaceNameCached = unstable_cache(
  async (workspaceId: string): Promise<string> => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    return workspace?.name ?? 'Workspace';
  },
  ['workspace-name-by-id'],
  { tags: [WORKSPACE_NAME_CACHE_TAG] },
);
