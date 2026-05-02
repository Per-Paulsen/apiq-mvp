/**
 * `getWorkspaceNameCached` tests (Epic 07).
 *
 * The function wraps `prisma.workspace.findUnique` in `unstable_cache` keyed
 * by workspaceId, tagged with `WORKSPACE_NAME_CACHE_TAG`. Tests assert:
 *   - Forwards the workspaceId to prisma's `where` clause
 *   - Selects only `{ name: true }` (defensive — keeps the cache value tiny)
 *   - Returns 'Workspace' when prisma returns null (data-integrity fallback)
 *
 * `unstable_cache` itself is exercised by Next.js — we assert the wrapped
 * behaviour via the prisma mock, not the caching mechanics.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `unstable_cache` requires Next.js's incrementalCache context which doesn't
// exist under jsdom. Mock it as a passthrough so the wrapped function just
// runs the inner callback. The cache mechanics are Next.js's responsibility,
// not this unit's — we only assert the wrapped behaviour (prisma call shape
// + fallback string).
vi.mock('next/cache', () => ({
  unstable_cache: <Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) => fn,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
  },
}));

import {
  WORKSPACE_NAME_CACHE_TAG,
  getWorkspaceNameCached,
} from '@/lib/workspace-cache';
import { prisma } from '@/lib/prisma';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getWorkspaceNameCached', () => {
  it('returns the workspace name from prisma', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValueOnce({
      name: 'Acme',
    } as Awaited<ReturnType<typeof prisma.workspace.findUnique>>);

    const result = await getWorkspaceNameCached('workspace-1');

    expect(result).toBe('Acme');
    expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
      where: { id: 'workspace-1' },
      select: { name: true },
    });
  });

  it('falls back to "Workspace" when prisma returns null', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValueOnce(null);

    const result = await getWorkspaceNameCached('workspace-missing');

    expect(result).toBe('Workspace');
  });

  it('exports a stable cache-tag constant for revalidation', () => {
    expect(WORKSPACE_NAME_CACHE_TAG).toBe('workspace-name');
  });
});
