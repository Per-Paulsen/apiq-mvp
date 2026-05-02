/**
 * Edge-runtime middleware. Initializes Auth.js with the Edge-safe `authConfig`
 * (no bcrypt / no Prisma) and uses its `callbacks.authorized` to gate routes.
 *
 * On unauthorized access, Auth.js v5 redirects to `pages.signIn` (`/login`)
 * with the original URL as `?callbackUrl=…` (Auth.js v5 default; the Epic 02
 * spec mentions `?redirectTo=` — we use Auth.js's `callbackUrl` and the
 * login page reads it as the post-login redirect target).
 */
import NextAuth from 'next-auth';

import { authConfig } from '@/lib/auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Protect the (app) route group: /specs and /settings (and any sub-paths).
  // Other routes — (auth)/*, (public)/*, /api/*, _next/* — are not matched.
  matcher: ['/specs/:path*', '/settings/:path*'],
};
