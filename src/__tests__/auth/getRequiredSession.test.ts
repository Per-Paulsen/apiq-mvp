/**
 * Vitest unit tests for `getRequiredSession` (Epic 02 — Auth + Workspace).
 *
 * Covers spec AC #8 (returns shape) and #9 (throws on missing workspace),
 * plus the redirect-to-/login path.
 *
 * BLOCKER (flagged to Lead): this suite currently fails to load because
 * `src/lib/session.ts` does `import "server-only"`, and `server-only` is a
 * Next.js sentinel package that lives only at
 * `node_modules/next/dist/compiled/server-only` — it's NOT a top-level
 * package. Vite's `vite:import-analysis` plugin can't resolve a bare
 * `import "server-only"` at transform time, even with `vi.mock('server-only')`,
 * because the mock factory only runs AFTER module resolution succeeds.
 *
 * FIX (one-liner, requires editing vitest.config.ts — outside this task's
 * allowed dir, hence flagged): add to `resolve.alias`:
 *
 *   "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js")
 *
 * Once that lands, the tests below run as written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (must be declared before importing the module under test) ------

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userWorkspace: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));

// ---- Imports (after mocks) -------------------------------------------------

import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

// ---- Tests -----------------------------------------------------------------

describe('getRequiredSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path — returns { userId, workspaceId, email }', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma.userWorkspace.findFirst).mockResolvedValue({
      workspaceId: 'w1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await getRequiredSession();

    expect(result).toEqual({
      userId: 'u1',
      workspaceId: 'w1',
      email: 'a@b.c',
    });

    expect(prisma.userWorkspace.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      select: { workspaceId: true },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('no session — calls redirect("/login")', async () => {
    // `auth` has overloaded signatures (NextMiddleware vs () => Promise<Session | null>);
    // `vi.mocked()` picks the wrong overload, so cast through `never` to bypass.
    vi.mocked(auth).mockResolvedValue(null as never);

    await expect(getRequiredSession()).rejects.toThrow('REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/login');
    expect(prisma.userWorkspace.findFirst).not.toHaveBeenCalled();
  });

  it('no workspace — throws data-integrity error', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma.userWorkspace.findFirst).mockResolvedValue(null);

    await expect(getRequiredSession()).rejects.toThrow(
      'user has no workspace — data integrity violation',
    );
  });
});
