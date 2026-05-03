'use client';

/**
 * Add Spec form. Mirrors `signup-form.tsx`: React 19 `useActionState` for
 * pending state + structured `{success}|{error}` rendering, plain
 * `<form action={...}>` (shadcn 4.6.0 radix-nova has no `form` component).
 *
 * Field-level errors render inline (red, `text-xs`) under the relevant input;
 * everything else renders as a top-of-form banner via `role="alert"`.
 *
 * On `success: true` we navigate client-side to `/specs/[specId]` via
 * `useRouter().push()` from a `useEffect` triggered by the new state shape —
 * cleaner than redirecting from the server action with `useActionState` (the
 * action would have to throw a `redirect()` and we'd lose the warning payload
 * for soft-warn cases).
 *
 * Quota-toast emission (per Epic 08 cross-epic handoff): on `rate_limited` we
 * use `formatQuotaToast(error)` to format the inline banner copy. Epic 08 will
 * additionally call `showToast(formatQuotaToast(error))` from this same site —
 * see the TODO comment in `renderError`.
 */
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatQuotaToast, showToast } from '@/lib/toasts';

import { type AddSpecResult } from '../actions';
import { addSpecFromUrlFormAction } from './form-action';

const initialState: AddSpecResult | null = null;

function isFieldError(kind: string | undefined): boolean {
  return kind === 'invalid_url';
}

function renderTopErrorMessage(error: {
  kind: string;
  message?: string;
  retryAt?: string;
  status?: number;
  statusText?: string;
  issues?: string[];
  sizeMB?: number;
  limitMB?: number;
  count?: number;
  limit?: number;
}): string {
  switch (error.kind) {
    case 'rate_limited': {
      const formatted = formatQuotaToast({
        kind: 'rate_limited',
        retryAt: error.retryAt ?? new Date().toISOString(),
      });
      return formatted.message;
    }
    case 'http_error':
      return `Could not fetch the spec (HTTP ${error.status ?? '?'}${
        error.statusText ? `: ${error.statusText}` : ''
      }). Check the URL and any auth header.`;
    case 'network_error':
      return 'Network error reaching that URL. Check the URL or your network.';
    case 'parse_error':
      return `Could not parse the spec body as JSON or YAML${
        error.message ? `: ${error.message}` : '.'
      }`;
    case 'unsupported_swagger_2':
      return 'Swagger 2.0 is not supported in v0.1. Convert with swagger2openapi first.';
    case 'external_refs_unsupported': {
      const issues = error.issues ?? [];
      const head = issues.slice(0, 3).join(', ');
      const tail = issues.length > 3 ? '…' : '';
      return `External $refs are not supported. Offending refs: ${head}${tail}`;
    }
    case 'invalid_openapi': {
      const issues = error.issues ?? [];
      const head = issues.slice(0, 3).join('; ');
      const tail = issues.length > 3 ? '…' : '';
      return `Invalid OpenAPI spec. First issues: ${head}${tail}`;
    }
    case 'too_large':
      return `Spec is too large (${error.sizeMB ?? '?'} MB; limit is ${
        error.limitMB ?? '?'
      } MB).`;
    case 'too_many_endpoints':
      return `Spec has too many endpoints (${error.count ?? '?'}; limit is ${
        error.limit ?? '?'
      }).`;
    default:
      return error.message ?? 'Something went wrong. Please try again.';
  }
}

export function AddSpecForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    addSpecFromUrlFormAction,
    initialState,
  );

  // Client-side redirect on success. We can't use `redirect()` server-side
  // because we need to render the soft-warn banner before navigating — but
  // keeping the navigation here also keeps the action's return shape uniform
  // (`{ success, specId, warning? }`) and easy to test.
  useEffect(() => {
    if (state?.success && !state.warning) {
      router.push(`/specs/${state.specId}`);
    }
  }, [state, router]);

  useEffect(() => {
    if (!state || state.success) return;
    if (state.error.kind !== 'rate_limited') return;
    showToast(
      formatQuotaToast({
        kind: 'rate_limited',
        retryAt: state.error.retryAt ?? new Date().toISOString(),
      }),
    );
  }, [state]);

  const error = state && !state.success ? state.error : null;
  const fieldError = error && isFieldError(error.kind) ? error : null;
  const topError = error && !fieldError ? error : null;

  const warning = state?.success ? state.warning : undefined;
  const warningSpecId = state?.success ? state.specId : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {topError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {renderTopErrorMessage(topError)}
        </p>
      ) : null}

      {warning && warningSpecId ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <p>
            Large spec: analysis quality may degrade. Some findings may be
            marked stale on apply (production-safe — see Versions tab).
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push(`/specs/${warningSpecId}`)}
          >
            Continue to spec
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-url">Spec URL</Label>
        <Input
          id="spec-url"
          name="url"
          type="url"
          placeholder="https://example.com/openapi.json"
          autoComplete="url"
          required
          aria-invalid={fieldError?.kind === 'invalid_url' ? true : undefined}
        />
        {fieldError?.kind === 'invalid_url' ? (
          <p className="text-xs text-destructive">Please enter a valid URL.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Public URL or one that accepts a single Authorization header below.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-auth-header">
          Authorization header{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="spec-auth-header"
          name="authHeader"
          type="text"
          placeholder="Bearer xyz or Basic <base64>"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Used only for this fetch — not stored. Specs pulled with an auth
          header cannot be re-pulled later.
        </p>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Pulling spec…' : 'Add spec'}
      </Button>
    </form>
  );
}
