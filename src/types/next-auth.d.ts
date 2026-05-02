import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  /**
   * Augment the default session shape so `session.user.id` is typed.
   * The `id` is copied from the JWT in `callbacks.session` (see `src/lib/auth.ts`).
   */
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  /** JWT carries `id` between requests (set in `callbacks.jwt` on sign-in). */
  interface JWT {
    id?: string;
  }
}
