/**
 * Edge-safe Auth.js v5 config. Used by `middleware.ts` (Edge runtime).
 *
 * MUST NOT transitively import:
 *   - `bcrypt` (Node-native binary)
 *   - `@/generated/prisma/client` or `@/lib/prisma` (Node-only)
 *
 * The full config (Credentials provider, Prisma adapter, password verification)
 * lives in `src/lib/auth.ts` (Node runtime).
 *
 * Per Epic 02 AC #13: `next build` will fail with an "Edge runtime" import
 * error if this contract is violated.
 */
import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  // Auth.js v5: trust the host header in dev (and on Vercel-like deploys
  // where the host is set correctly). Avoids HTTPS/host mismatches on localhost.
  trustHost: true,
  // Real providers are added in `src/lib/auth.ts` (Credentials needs bcrypt
  // + Prisma, neither of which is Edge-safe).
  providers: [],
  callbacks: {
    /**
     * Called by middleware to decide whether the request is allowed through.
     * Returning `false` triggers a redirect to `pages.signIn` with the original
     * URL appended as `?callbackUrl=…` (Auth.js v5 default).
     */
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
