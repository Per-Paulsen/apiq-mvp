'use client';

/**
 * Workspace settings form. Edits `Workspace.name`. Same `useActionState`
 * pattern as `(app)/specs/new/add-spec-form.tsx`: structured `{success}|{error}`
 * with field-level `name_required` rendered inline + a top-of-form banner for
 * unexpected errors.
 *
 * On success we fire `showToast(TOASTS.workspaceUpdated)` once via a `useEffect`
 * keyed on `state` so re-renders don't double-fire. The action calls
 * `revalidatePath('/', 'layout')` so the sidebar footer (rendered in
 * `(app)/layout.tsx`) reflects the new name on the next navigation — AC #10.
 */
import { useActionState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TOASTS, showToast } from '@/lib/toasts';

import { type UpdateWorkspaceResult } from './actions';
import { updateWorkspaceFormAction } from './workspace-form-action';

const initialState: UpdateWorkspaceResult | null = null;

export function WorkspaceForm({ initialName }: { initialName: string }) {
  const [state, formAction, pending] = useActionState(
    updateWorkspaceFormAction,
    initialState,
  );

  const lastToastRef = useRef<UpdateWorkspaceResult | null>(null);
  useEffect(() => {
    if (state?.success && lastToastRef.current !== state) {
      lastToastRef.current = state;
      showToast(TOASTS.workspaceUpdated);
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
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
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
