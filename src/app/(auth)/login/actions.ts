'use server';

/**
 * Login server action. Delegates to Auth.js v5's `signIn('credentials', ...)`
 * which (a) calls `authorize()` in `src/lib/auth.ts` to bcrypt-verify the
 * password, and (b) on success throws a `redirect()` to `redirectTo` that
 * Next.js's runtime intercepts.
 *
 * Per spec AC #6: error message is the SAME for wrong-password and
 * unknown-email so we don't leak whether an account exists.
 *
 * Per spec AC #5: post-login redirect target comes from `?callbackUrl=` (the
 * Auth.js v5 default — the spec wording says `?redirectTo=` but Auth.js's
 * middleware writes `callbackUrl`; we conform to Auth.js).
 */
import { AuthError } from 'next-auth';

import { signIn } from '@/lib/auth';

export type LoginResult = { error?: string };

export async function loginAction(
  _prevState: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const callbackUrl = String(formData.get('callbackUrl') ?? '/specs');

  // Reject obviously empty submissions before talking to Auth.js — keeps the
  // generic error consistent with the AC #6 wording.
  if (!email || !password) {
    return { error: 'Invalid email or password' };
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (err) {
    // `AuthError` covers all credential failures (`CredentialsSignin`,
    // `CallbackRouteError`, etc.). Anything else — most importantly the
    // `redirect()` Next.js throws on success — we re-throw so the framework
    // can handle it.
    if (err instanceof AuthError) {
      return { error: 'Invalid email or password' };
    }
    throw err;
  }

  // Unreachable on success (signIn redirects). Safety net for type-checking.
  return {};
}
