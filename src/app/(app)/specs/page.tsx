/**
 * Placeholder Specs page. Proves the auth + session pipeline end-to-end:
 * `getRequiredSession()` redirects to `/login` when unauthenticated, returns
 * `{ userId, workspaceId, email }` when authenticated.
 *
 * Epic 07 replaces this with the real Specs list (table + quality-score
 * badges + status pills + row-action menus).
 */
import { getRequiredSession } from '@/lib/session';

export default async function SpecsPage() {
  const session = await getRequiredSession();

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Specs</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as <code className="font-mono text-foreground">{session.email}</code>.
      </p>
      <p className="text-xs text-muted-foreground">
        Workspace: <code className="font-mono">{session.workspaceId}</code>
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        Placeholder page — Epic 07 will replace this with the real Specs list.
      </p>
    </main>
  );
}
