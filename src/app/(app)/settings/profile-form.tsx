'use client';

/**
 * Profile settings form. Edits `User.name` (Auth.js standard nullable field;
 * see Epic 07 spec resolved-Q3). Email is read-only — v0.1 doesn't support
 * email change.
 */
import { useActionState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TOASTS, showToast } from '@/lib/toasts';

import { type UpdateUserResult } from './actions';
import { updateUserFormAction } from './profile-form-action';

const initialState: UpdateUserResult | null = null;

export function ProfileForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateUserFormAction,
    initialState,
  );

  const lastToastRef = useRef<UpdateUserResult | null>(null);
  useEffect(() => {
    if (state?.success && lastToastRef.current !== state) {
      lastToastRef.current = state;
      showToast(TOASTS.profileUpdated);
    }
  }, [state]);

  const error = state && !state.success ? state.error : null;
  const fieldError = error?.kind === 'name_required' ? error : null;
  const topError = error && !fieldError ? error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {topError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {topError.kind === 'unexpected'
            ? (topError.message ?? 'Something went wrong. Please try again.')
            : 'Something went wrong. Please try again.'}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          name="name"
          type="text"
          defaultValue={initialName}
          required
          aria-invalid={fieldError ? true : undefined}
        />
        {fieldError ? (
          <p className="text-xs text-destructive">Name is required.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input
          id="profile-email"
          type="email"
          value={email}
          readOnly
          disabled
        />
        <p className="text-xs text-muted-foreground">
          Email cannot be changed in v0.1.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {state?.success ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
