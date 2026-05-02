'use client';

/**
 * Client wrapper for the Spec Detail screen (Epic 05). Composes:
 *   - SpecDetailHeader (header / status / re-analyze / re-pull)
 *   - EndpointList (left pane navigation)
 *   - FindingsList | AnalyzingPanel | FailedPanel (right pane)
 *
 * Owns three pieces of cross-component glue:
 *
 *   1. **3 s polling** while `analysisStatus` is `pending` or `analyzing` — calls
 *      `router.refresh()` every 3 s so the server component re-runs and the new
 *      Spec row + Findings flow back through. Auto-stops on `completed`/`failed`.
 *      (AC #2 / spec scope §"Loading states".)
 *
 *   2. **Endpoint→Finding scroll & highlight** — endpoint list rows call back
 *      with `(path, method)`; we look up the first `open` finding whose
 *      `affectedEndpoints` matches, scroll its card into view, and apply a
 *      temporary `ring-2 ring-violet-500` outline for ~1.5 s. (AC #11.)
 *
 *   3. **Failed-card rendering** — uses `formatAnalysisError` from `@/lib`
 *      (Epic 08 owned, consumed by Epic 05) to extract a user-friendly
 *      headline + collapsible details. Retry button calls `reanalyzeSpecAction`
 *      and `router.refresh()` to skip the next poll wait. (AC #13.)
 */

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Finding, Spec, SpecVersion } from '@/generated/prisma/client';
import { formatAnalysisError } from '@/lib/format-analysis-error';

import { reanalyzeSpecAction } from '../actions';
import { EndpointList } from './endpoint-list';
import { FindingsList } from './findings-list';
import { SpecDetailHeader } from './spec-detail-header';

const POLL_INTERVAL_MS = 3000;
const RING_DURATION_MS = 1500;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function SpecDetailView({
  spec,
  findings,
  versions,
}: {
  spec: Spec;
  findings: Finding[];
  versions: SpecVersion[];
}): React.JSX.Element {
  const router = useRouter();
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const isPolling =
    spec.analysisStatus === 'pending' || spec.analysisStatus === 'analyzing';

  // 3 s poll while pending/analyzing — server component refetches Spec + Findings.
  useEffect(() => {
    if (!isPolling) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isPolling, router]);

  const registerCardRef = useCallback(
    (key: string, el: HTMLElement | null) => {
      if (el === null) cardRefs.current.delete(key);
      else cardRefs.current.set(key, el);
    },
    [],
  );

  const onEndpointClick = useCallback(
    (path: string, method: string) => {
      const methodLower = method.toLowerCase();
      const target = findings.find((f) => {
        if (f.status !== 'open') return false;
        const eps = f.affectedEndpoints;
        if (!Array.isArray(eps)) return false;
        return eps.some((ep) => {
          if (!isObject(ep)) return false;
          const p = ep.path;
          const m = ep.method;
          return (
            typeof p === 'string' &&
            p === path &&
            typeof m === 'string' &&
            m.toLowerCase() === methodLower
          );
        });
      });
      if (!target) return;
      const el = cardRefs.current.get(target.id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-violet-500');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-violet-500');
      }, RING_DURATION_MS);
    },
    [findings],
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-6 py-6">
      <SpecDetailHeader spec={spec} versions={versions} />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)]">
          <EndpointList
            spec={{ currentJson: spec.currentJson }}
            findings={findings}
            onEndpointClick={onEndpointClick}
          />
        </aside>
        <section className="min-w-0">
          {isPolling ? (
            <AnalyzingPanel />
          ) : spec.analysisStatus === 'failed' ? (
            <FailedPanel spec={spec} />
          ) : (
            <FindingsList
              findings={findings}
              specCurrentJson={spec.currentJson}
              registerCardRef={registerCardRef}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function AnalyzingPanel(): React.JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2
          className="size-8 animate-spin text-muted-foreground"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">
          Analyzing… (typically 30-90 s)
        </p>
      </CardContent>
    </Card>
  );
}

function FailedPanel({ spec }: { spec: Spec }): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formatted = formatAnalysisError(
    spec.analysisError ?? 'Analysis failed (no error details).',
  );

  function onRetry() {
    startTransition(async () => {
      await reanalyzeSpecAction({ specId: spec.id });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{formatted.headline}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {formatted.details ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground underline-offset-2 hover:underline">
              Show details
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono">
              {formatted.details}
            </pre>
          </details>
        ) : null}
        <div>
          <Button size="sm" onClick={onRetry} disabled={pending}>
            {pending ? 'Triggering…' : 'Retry analysis'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
