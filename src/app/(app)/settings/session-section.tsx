/**
 * Session section — sign-out button. Plain `<form action={signOutAction}>`
 * (server action), no client state needed. Action redirects to `/login`
 * after clearing the session.
 */
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/session';

export function SessionSection() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline">
        Sign out
      </Button>
    </form>
  );
}
