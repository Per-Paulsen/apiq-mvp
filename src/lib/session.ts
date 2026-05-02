/**
 * Server-side session helpers. Never imported by client components.
 *
 * `getRequiredSession()` is the canonical accessor for the current user +
 * workspace from any protected server component or server action. Replaces
 * direct `auth()` calls (which don't load the workspace).
 *
 * `signOutAction` is a server action consumed by Settings (Epic 07).
 */
import 'server-only';

import { redirect } from 'next/navigation';

import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export type RequiredSession = {
  userId: string;
  workspaceId: string;
  email: string;
};

/**
 * Returns the current `{ userId, workspaceId, email }` or redirects to
 * `/login` if no session exists.
 *
 * Throws if a logged-in user has no `UserWorkspace` row — this is a
 * data-integrity invariant (signup atomically creates User + Workspace +
 * UserWorkspace, so it should never happen).
 */
export async function getRequiredSession(): Promise<RequiredSession> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect('/login');
  }

  const userWorkspace = await prisma.userWorkspace.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
  });

  if (!userWorkspace) {
    throw new Error('user has no workspace — data integrity violation');
  }

  return {
    userId: session.user.id,
    workspaceId: userWorkspace.workspaceId,
    email: session.user.email,
  };
}

/**
 * Server action: signs the current user out and redirects to `/login`.
 *
 * The `'use server'` directive lives inside the function (not at the top of
 * the file) so that `getRequiredSession` above is NOT exposed as a server
 * action endpoint — it's a server-side helper, not a callable from the client.
 */
export async function signOutAction(): Promise<void> {
  'use server';
  await signOut({ redirectTo: '/login' });
}
