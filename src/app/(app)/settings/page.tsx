/**
 * Settings page (server component). Loads workspace + user in parallel and
 * passes initial values down to the four section client components.
 *
 * No middleware-redundant session check needed at the page level — the (app)
 * route segment is gated by Epic 02 middleware, and `getRequiredSession()`
 * itself redirects to `/login` if anything is missing.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

import { AppearanceSection } from './appearance-section';
import { ProfileForm } from './profile-form';
import { SessionSection } from './session-section';
import { WorkspaceForm } from './workspace-form';

export default async function SettingsPage() {
  const { workspaceId, userId, email } = await getRequiredSession();

  const [workspace, user] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>
              Workspace-wide settings. Visible to all members (v0.1: just you).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceForm initialName={workspace?.name ?? ''} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Your display name and email. Email cannot be changed in v0.1.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm initialName={user?.name ?? ''} email={email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Choose between Light and Dark mode. Dark is the default.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AppearanceSection />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>
              Sign out of this browser session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessionSection />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
