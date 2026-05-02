'use client';

/**
 * Empty state for the Specs List (Epic 07 — scope §"Empty state", AC #7).
 *
 * Engineer-tauglich: kein Illustration-Hero, kein Tour-Banner. Two CTAs:
 *   - Primary (violet button): "Add spec from URL" → `/specs/new`.
 *   - Secondary link: "Try with a sample spec" — calls
 *     `loadSampleSpecAction({ sampleId: 'openweathermap' })` and navigates
 *     to the resulting spec's detail page on success.
 *
 * `'use client'` because the secondary CTA invokes a server action +
 * `useRouter()` for the post-success redirect.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { loadSampleSpecAction } from './actions';

export function EmptyState({
  workspaceName,
}: {
  workspaceName: string;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onTrySample() {
    setError(null);
    startTransition(async () => {
      const result = await loadSampleSpecAction({ sampleId: 'openweathermap' });
      if (result.success) {
        router.push(`/specs/${result.specId}`);
        return;
      }
      setError('Failed to load sample spec. Please try again.');
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-semibold">{workspaceName}</h1>
      </header>
      <div className="flex flex-col items-center justify-center gap-6 rounded-lg border border-dashed border-border py-20">
        <h2 className="text-2xl font-semibold">
          Add your first spec to get started
        </h2>
        <div className="flex flex-col items-center gap-3">
          <Button asChild size="default">
            <Link href="/specs/new">Add spec from URL</Link>
          </Button>
          <button
            type="button"
            onClick={onTrySample}
            disabled={pending}
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? 'Loading sample…' : 'Try with a sample spec'}
          </button>
          {error ? (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
