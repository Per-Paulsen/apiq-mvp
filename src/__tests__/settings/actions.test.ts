/**
 * Vitest tests for the two Epic 07 Settings server actions.
 *
 * All external dependencies (prisma, getRequiredSession, revalidatePath) are
 * mocked so tests are hermetic — no DB, no real cache plumbing.
 *
 * Cross-workspace defense is impossible by construction: `updateWorkspaceAction`
 * always uses `where: { id: session.workspaceId }`, and `updateUserAction`
 * always uses `where: { id: session.userId }` — both pulled from the session
 * helper, which the user cannot influence. Tests assert that the `where`
 * clauses match the session.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (must be declared before importing the module under test) ------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: {
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getRequiredSession: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  // `actions.ts` transitively imports `@/lib/workspace-cache`, which calls
  // `unstable_cache(fn)`. Stub it as a passthrough so the import chain
  // resolves cleanly under vitest.
  unstable_cache: <Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) => fn,
}));

// ---- Imports (after mocks) -------------------------------------------------

import { revalidatePath, updateTag } from 'next/cache';

import {
  updateUserAction,
  updateWorkspaceAction,
} from '@/app/(app)/settings/actions';
import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-id-1',
    workspaceId: 'workspace-id-1',
    email: 'alice@example.com',
  });
});

// =====================================================================
// updateWorkspaceAction
// =====================================================================

describe('updateWorkspaceAction', () => {
  it('happy path — trims name, updates workspace, revalidates layout', async () => {
    vi.mocked(prisma.workspace.update).mockResolvedValueOnce(
      { id: 'workspace-id-1', name: 'New Name' } as Awaited<
        ReturnType<typeof prisma.workspace.update>
      >,
    );

    const result = await updateWorkspaceAction({ name: '  New Name  ' });

    expect(result).toEqual({ success: true });
    expect(prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 'workspace-id-1' },
      data: { name: 'New Name' },
    });
    expect(updateTag).toHaveBeenCalledWith('workspace-name');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('empty name — returns name_required, no DB call, no revalidate', async () => {
    const result = await updateWorkspaceAction({ name: '' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'name_required' },
    });
    expect(prisma.workspace.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it('whitespace-only name — returns name_required', async () => {
    const result = await updateWorkspaceAction({ name: '   \t\n  ' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'name_required' },
    });
    expect(prisma.workspace.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it('DB throws — returns unexpected with message, no revalidate', async () => {
    vi.mocked(prisma.workspace.update).mockRejectedValueOnce(
      new Error('connection refused'),
    );

    const result = await updateWorkspaceAction({ name: 'Whatever' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'unexpected', message: 'connection refused' },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});

// =====================================================================
// updateUserAction
// =====================================================================

describe('updateUserAction', () => {
  it('happy path — trims name, updates user, does NOT revalidate', async () => {
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      { id: 'user-id-1', name: 'Alice Doe' } as Awaited<
        ReturnType<typeof prisma.user.update>
      >,
    );

    const result = await updateUserAction({ name: '  Alice Doe  ' });

    expect(result).toEqual({ success: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id-1' },
      data: { name: 'Alice Doe' },
    });
    // Sidebar footer renders email, not name — no revalidate needed.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('empty name — returns name_required, no DB call', async () => {
    const result = await updateUserAction({ name: '' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'name_required' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('whitespace-only name — returns name_required', async () => {
    const result = await updateUserAction({ name: '   ' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'name_required' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('DB throws — returns unexpected with message', async () => {
    vi.mocked(prisma.user.update).mockRejectedValueOnce(
      new Error('user not found'),
    );

    const result = await updateUserAction({ name: 'Bob' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'unexpected', message: 'user not found' },
    });
  });
});
