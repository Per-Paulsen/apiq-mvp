'use client';

/**
 * Specs List view (Epic 07 — scope §"Specs List", AC #1–#8).
 *
 * Renders the workspace's specs in a shadcn Table with sticky header,
 * compact density, and row-hover background per `prd-decisions.md`
 * §"Components" Tables. Owns three pieces of cross-component glue:
 *
 *   1. **5s polling** while any visible spec has `analysisStatus =
 *      pending | analyzing` — calls `router.refresh()` so the server
 *      component re-fetches. Auto-stops when no row is in those states
 *      (cadence intentionally slower than Epic 05's per-spec 3s polling
 *      per cross-epic Q4). Cleanup on unmount.
 *
 *   2. **Row-action menu** with Re-analyze / Re-pull / Delete — the
 *      Re-analyze item is disabled when `analysisStatus === 'analyzing'`;
 *      Re-pull is hidden unless `sourceType === 'url' && wasAuthedPull
 *      === false`; Delete opens a confirm `AlertDialog`.
 *
 *   3. **Header bar** with workspace name + "Add Spec" CTA → `/specs/new`.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { QualityScoreBadge, StatusPill } from '@/components/spec-badges';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Spec } from '@/generated/prisma/client';
import { formatQuotaToast, showToast, TOASTS } from '@/lib/toasts';
import { cn } from '@/lib/utils';
import { MoreVertical } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import {
  deleteSpecAction,
  reanalyzeSpecAction,
  repullSpecAction,
} from './actions';

const POLL_INTERVAL_MS = 5000;
const SOURCE_TRUNCATE_AT = 40;

export type FindingCounts = {
  open: number;
  applied: number;
  rejected: number;
};

export function SpecsListView({
  specs,
  findingCounts,
  workspaceName,
}: {
  specs: Spec[];
  findingCounts: Record<string, FindingCounts>;
  workspaceName: string;
}): React.JSX.Element {
  const router = useRouter();

  const isPolling = specs.some(
    (s) => s.analysisStatus === 'pending' || s.analysisStatus === 'analyzing',
  );

  useEffect(() => {
    if (!isPolling) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isPolling, router]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-semibold">{workspaceName}</h1>
        <Button asChild size="sm">
          <Link href="/specs/new">Add Spec</Link>
        </Button>
      </header>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Quality</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Last analyzed</TableHead>
              <TableHead className="w-10" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {specs.map((spec) => {
              const counts = findingCounts[spec.id] ?? {
                open: 0,
                applied: 0,
                rejected: 0,
              };
              return (
                <SpecRow key={spec.id} spec={spec} counts={counts} />
              );
            })}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function SpecRow({
  spec,
  counts,
}: {
  spec: Spec;
  counts: FindingCounts;
}): React.JSX.Element {
  const sourceLabel = spec.sourceUrl ?? spec.sourceType;
  const truncatedSource = truncateMiddle(sourceLabel, SOURCE_TRUNCATE_AT);

  return (
    <TableRow className="hover:bg-accent/50">
      <TableCell className="py-2.5 font-medium">
        <Link
          href={`/specs/${spec.id}`}
          className="hover:underline"
        >
          {spec.name}
        </Link>
      </TableCell>
      <TableCell className="py-2.5">
        <QualityScoreBadge score={spec.qualityScore} />
      </TableCell>
      <TableCell className="py-2.5">
        <StatusPill status={spec.analysisStatus} />
      </TableCell>
      <TableCell
        className="py-2.5"
        aria-label={`Findings: ${counts.open} open, ${counts.applied} applied, ${counts.rejected} rejected`}
      >
        <FindingCountsBadges counts={counts} />
      </TableCell>
      <TableCell className="py-2.5">
        <code
          className="font-mono text-xs text-muted-foreground"
          title={sourceLabel}
        >
          {truncatedSource}
        </code>
      </TableCell>
      <TableCell className="py-2.5 text-xs text-muted-foreground">
        {formatRelative(spec.lastAnalyzedAt)}
      </TableCell>
      <TableCell className="py-2.5">
        <RowActions spec={spec} />
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

function RowActions({ spec }: { spec: Spec }): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const showRepull = spec.sourceType === 'url' && spec.wasAuthedPull === false;

  function onReanalyze() {
    startTransition(async () => {
      const result = await reanalyzeSpecAction({ specId: spec.id });
      if (result.success) {
        showToast(TOASTS.reanalyzeStarted);
        router.refresh();
        return;
      }
      console.error('reanalyzeSpecAction failed:', result.error);
    });
  }

  function onRepull() {
    startTransition(async () => {
      const result = await repullSpecAction({ specId: spec.id });
      if (result.success) {
        showToast(TOASTS.rePullComplete);
        router.refresh();
        return;
      }
      const { error } = result;
      if (error.kind === 'rate_limited') {
        showToast(formatQuotaToast(error));
      } else {
        console.error('repullSpecAction failed:', error);
      }
      router.refresh();
    });
  }

  function onConfirmDelete() {
    startTransition(async () => {
      const result = await deleteSpecAction({ specId: spec.id });
      if (result.success) {
        showToast(TOASTS.specDeleted);
        setDeleteDialogOpen(false);
        router.refresh();
        return;
      }
      console.error('deleteSpecAction failed:', result.error);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Row actions"
            className="size-8"
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {spec.analysisStatus === 'analyzing' ? (
            // Disabled-with-tooltip: wrap in TooltipTrigger asChild + a span
            // tabIndex=0. A disabled DropdownMenuItem is a div with
            // pointer-events:none, so the tooltip listens on the wrapper span
            // instead. The Radix `disabled` prop still applies the muted
            // styling and blocks the onSelect handler.
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="block">
                  <DropdownMenuItem
                    disabled
                    onSelect={(e) => e.preventDefault()}
                  >
                    Re-analyze
                  </DropdownMenuItem>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">Already analyzing</TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenuItem
              disabled={pending}
              onSelect={(e) => {
                e.preventDefault();
                if (!pending) onReanalyze();
              }}
            >
              Re-analyze
            </DropdownMenuItem>
          )}
          {showRepull ? (
            <DropdownMenuItem
              disabled={pending}
              onSelect={(e) => {
                e.preventDefault();
                onRepull();
              }}
            >
              Re-pull from URL
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault();
              setDeleteDialogOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete spec?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The spec, its findings, and all
              version history will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onConfirmDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Finding counts triplet — three small coloured pills (open/applied/rejected)
// ---------------------------------------------------------------------------
//
// Uses the same pill shape as the severity / status pills elsewhere in the
// app. Per cross-epic Q4 the row only surfaces these three statuses; `stale`
// and `outdated` are transient and resolved by re-analyze.

function FindingCountsBadges({
  counts,
}: {
  counts: FindingCounts;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <CountPill label="open" count={counts.open} variant="open" />
      <CountPill label="applied" count={counts.applied} variant="applied" />
      <CountPill label="rejected" count={counts.rejected} variant="rejected" />
    </div>
  );
}

function CountPill({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: 'open' | 'applied' | 'rejected';
}): React.JSX.Element {
  const isZero = count === 0;
  return (
    <span
      className={cn(
        'inline-flex min-w-[1.5rem] items-center justify-center rounded-full border px-1.5 py-0.5 font-mono text-xs',
        countPillClasses(variant, isZero),
      )}
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
    >
      {count}
    </span>
  );
}

function countPillClasses(
  variant: 'open' | 'applied' | 'rejected',
  isZero: boolean,
): string {
  if (isZero) {
    return 'border-border bg-transparent text-muted-foreground';
  }
  switch (variant) {
    case 'open':
      return 'border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300';
    case 'applied':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 'rejected':
      return 'border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

function formatRelative(date: Date | null): string {
  if (!date) return '—';
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
