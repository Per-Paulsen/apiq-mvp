'use server';

/**
 * `useActionState` adapter for `updateUserAction`. Same wrapping rationale as
 * `workspace-form-action.ts` — the underlying action takes `{ name }` (typed
 * object) for testability + programmatic reuse; this adapter converts the
 * `(prevState, FormData)` shape `useActionState` requires.
 */

import {
  updateUserAction,
  type UpdateUserResult,
} from './actions';

export async function updateUserFormAction(
  _prevState: UpdateUserResult | null,
  formData: FormData,
): Promise<UpdateUserResult> {
  const name = String(formData.get('name') ?? '');
  return updateUserAction({ name });
}
