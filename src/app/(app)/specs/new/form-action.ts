'use server';

/**
 * `useActionState` adapter for `addSpecFromUrlAction`.
 *
 * The shared server action in `../actions.ts` takes a typed object
 * (`{ url, authHeader? }`) so it's easy to call from tests + future programmatic
 * sites. `useActionState` and `<form action>` need a `(prevState, FormData) => state`
 * signature, so we wrap here. This file lives separately (rather than inside the
 * client form) so it can carry the `'use server'` directive — server actions
 * cannot be defined inline in a `'use client'` module.
 */

import {
  addSpecFromUrlAction,
  type AddSpecResult,
} from '../actions';

export async function addSpecFromUrlFormAction(
  _prevState: AddSpecResult | null,
  formData: FormData,
): Promise<AddSpecResult> {
  const url = String(formData.get('url') ?? '');
  const authHeaderRaw = String(formData.get('authHeader') ?? '');
  const authHeader =
    authHeaderRaw.trim().length > 0 ? authHeaderRaw : undefined;
  return addSpecFromUrlAction({ url, authHeader });
}
