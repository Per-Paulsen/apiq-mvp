'use server';

/**
 * Auto-login as the demo user. Used by the landing-page "Open demo" button
 * when DEMO_MODE=true so visitors land directly on /specs without retyping
 * the credentials shown on the banner.
 *
 * Defense-in-depth: refuses if DEMO_MODE isn't enabled, even though the
 * landing-page only renders the button under that condition.
 */

import { signIn } from '@/lib/auth';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/lib/seed-demo';

export async function demoLoginAction(): Promise<void> {
  if (process.env.DEMO_MODE !== 'true') {
    throw new Error('Demo mode not enabled');
  }

  // signIn throws a redirect on success which Next.js intercepts. On
  // failure (e.g. seed never ran) Auth.js redirects to /login with an
  // error code — acceptable fallback.
  await signIn('credentials', {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    redirectTo: '/specs',
  });
}
