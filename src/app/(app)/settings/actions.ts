'use server';

/**
 * Settings server actions (Epic 07).
 *
 * Two actions:
 *   - `updateWorkspaceAction({ name })` — rename the current workspace.
 *     Calls `revalidatePath('/', 'layout')` on success so the sidebar footer
 *     re-renders with the new name (AC #10).
 *   - `updateUserAction({ name })` — set `User.name` on the current user.
 *     No revalidatePath: the sidebar footer renders email, not name.
 *
 * Conventions (per Epic 02 / 03):
 *   - `getRequiredSession()` is called first.
 *   - Returns `{ success: true } | { success: false, error: { kind, ... } }`.
 *   - Never throws to the client; wraps DB calls in try/catch.
 *   - Object-typed args (not FormData) — see `*-form-action.ts` for the
 *     `useActionState` adapters.
 */

import { revalidatePath, updateTag } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';
import { WORKSPACE_NAME_CACHE_TAG } from '@/lib/workspace-cache';

// =====================================================================
// Result types
// =====================================================================

export type UpdateWorkspaceError =
  | { kind: 'name_required' }
  | { kind: 'unexpected'; message: string };

export type UpdateWorkspaceResult =
  | { success: true }
  | { success: false; error: UpdateWorkspaceError };

export type UpdateUserError =
  | { kind: 'name_required' }
  | { kind: 'unexpected'; message: string };

export type UpdateUserResult =
  | { success: true }
  | { success: false; error: UpdateUserError };

// =====================================================================
// updateWorkspaceAction
// =====================================================================

export async function updateWorkspaceAction({
  name,
}: {
  name: string;
}): Promise<UpdateWorkspaceResult> {
  const session = await getRequiredSession();

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { success: false, error: { kind: 'name_required' } };
  }

  try {
    await prisma.workspace.update({
      where: { id: session.workspaceId },
      data: { name: trimmedName },
    });
  } catch (err) {
    return {
      success: false,
      error: {
        kind: 'unexpected',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
    };
  }

  // Invalidate the cached workspace name (used by (app)/layout.tsx sidebar
  // footer via `unstable_cache`) AND force the layout to re-render so the
  // new name shows up immediately, not only on next navigation. Inside a
  // Server Action `updateTag` is the right primitive (read-your-own-writes
  // semantics for the rest of THIS request); `revalidatePath` covers the
  // subsequent navigation.
  updateTag(WORKSPACE_NAME_CACHE_TAG);
  revalidatePath('/', 'layout');

  return { success: true };
}

// =====================================================================
// updateUserAction
// =====================================================================

export async function updateUserAction({
  name,
}: {
  name: string;
}): Promise<UpdateUserResult> {
  const session = await getRequiredSession();

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { success: false, error: { kind: 'name_required' } };
  }

  try {
    await prisma.user.update({
      where: { id: session.userId },
      data: { name: trimmedName },
    });
  } catch (err) {
    return {
      success: false,
      error: {
        kind: 'unexpected',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
    };
  }

  return { success: true };
}
