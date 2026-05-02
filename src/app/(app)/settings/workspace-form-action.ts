'use server';

/**
 * `useActionState` adapter for `updateWorkspaceAction`.
 *
 * The shared server action in `./actions.ts` takes a typed `{ name }` object
 * (per Epic 03 convention) so it's easy to call from tests + future programmatic
 * sites. `useActionState` and `<form action>` need a `(prevState, FormData)`
 * signature, so we wrap here. Mirrors `(app)/specs/new/form-action.ts`.
 */

import {
  updateWorkspaceAction,
  type UpdateWorkspaceResult,
} from './actions';

export async function updateWorkspaceFormAction(
  _prevState: UpdateWorkspaceResult | null,
  formData: FormData,
): Promise<UpdateWorkspaceResult> {
  const name = String(formData.get('name') ?? '');
  return updateWorkspaceAction({ name });
}
