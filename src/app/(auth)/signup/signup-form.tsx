'use client';

/**
 * Signup form. Uses React 19's `useActionState` (renamed from `useFormState`)
 * so we get pending state + structured error feedback without round-tripping
 * through `?error=` query params.
 *
 * Server action returns `{ success: true } | { success: false, error: {...} }`
 * — see `actions.ts`. Field-level errors (invalid email, weak password,
 * duplicate) render under the relevant input; everything else renders as a
 * form-level banner at the top.
 */
import Link from 'next/link';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { signupAction, type SignupResult } from './actions';
import { SignupTurnstile } from './turnstile-client';

const initialState: SignupResult | null = null;

function errorMessage(kind: string, retryAt?: string): string {
  switch (kind) {
    case 'invalid_email':
      return 'Please enter a valid email address.';
    case 'weak_password':
      return 'Password must be at least 8 characters.';
    case 'duplicate_email':
      return 'An account with that email already exists.';
    case 'captcha_failed':
      return 'CAPTCHA verification failed. Please try again.';
    case 'rate_limited': {
      // retryAt is an ISO string; format relative-ish for the user.
      if (retryAt) {
        const minutes = Math.max(
          1,
          Math.ceil((new Date(retryAt).getTime() - Date.now()) / 60_000),
        );
        return `Too many signup attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
      }
      return 'Too many signup attempts. Please try again later.';
    }
    case 'too_fast':
      return 'Form submitted too quickly. Please try again.';
    case 'honeypot_triggered':
      // Should never reach a real user; if it does, give a generic message.
      return 'Submission rejected. Please try again.';
    case 'invalid_input':
      return 'Please check the form and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function SignupForm({
  siteKey,
  renderedAt,
}: {
  siteKey: string;
  renderedAt: number;
}) {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState,
  );

  const error = state && !state.success ? state.error : null;
  const isFieldError =
    error?.kind === 'invalid_email' ||
    error?.kind === 'weak_password' ||
    error?.kind === 'duplicate_email';
  const showTopError = error && !isFieldError;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {showTopError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {errorMessage(error.kind, error.retryAt)}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={
            error?.kind === 'invalid_email' || error?.kind === 'duplicate_email'
              ? true
              : undefined
          }
        />
        {error?.kind === 'invalid_email' || error?.kind === 'duplicate_email' ? (
          <p className="text-xs text-destructive">
            {errorMessage(error.kind)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={error?.kind === 'weak_password' ? true : undefined}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        {error?.kind === 'weak_password' ? (
          <p className="text-xs text-destructive">
            {errorMessage(error.kind)}
          </p>
        ) : null}
      </div>

      {/* Honeypot — bots fill it, humans never see it. Off-screen + tabIndex=-1
          + autoComplete=off so password managers don't accidentally populate it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0,
        }}
      />

      {/* Time-trap. Captures the SSR timestamp of when the form was rendered. */}
      <input type="hidden" name="renderedAt" value={renderedAt} />

      <SignupTurnstile siteKey={siteKey} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
