'use client';

/**
 * Single finding card for the Spec Detail right pane (Epic 05 + Epic 06).
 *
 * Renders title, severity + category badges, affected-endpoints expansion,
 * narration, rationale, patch summary, "Show diff", "Show JSON Patch ops"
 * table, and status-dependent action controls (Apply/Reject for `open`,
 * Undo for `applied`/`rejected`, Re-analyze hint for `stale`/`outdated`).
 *
 * The outer element is registered via `registerRef(finding.id, el)` so the
 * parent integration can scroll-to and apply a temporary
 * `ring-2 ring-violet-500` outline when the user clicks an endpoint in the
 * left pane (per Epic 05 AC #11).
 */
import { applyPatch } from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Finding } from '@/generated/prisma/client';
import { formatQuotaToast, showToast, TOASTS } from '@/lib/toasts';
import { cn } from '@/lib/utils';

import {
  applyFindingAction,
  reanalyzeSpecAction,
  rejectFindingAction,
  undoApplyAction,
  undoRejectAction,
} from '../actions';

type AffectedEndpoint = { path: string; method: string };
type PatchOp = {
  op: string;
  path: string;
  from?: string;
  value?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function asAffectedEndpoints(v: unknown): AffectedEndpoint[] {
  if (!Array.isArray(v)) return [];
  const out: AffectedEndpoint[] = [];
  for (const item of v) {
    if (!isObject(item)) continue;
    const p = item.path;
    const m = item.method;
    if (typeof p === 'string' && typeof m === 'string') {
      out.push({ path: p, method: m });
    }
  }
  return out;
}

export function asPatchOps(v: unknown): PatchOp[] {
  if (!Array.isArray(v)) return [];
  const out: PatchOp[] = [];
  for (const item of v) {
    if (!isObject(item)) continue;
    const op = item.op;
    const path = item.path;
    if (typeof op !== 'string' || typeof path !== 'string') continue;
    const entry: PatchOp = { op, path };
    if (typeof item.from === 'string') entry.from = item.from;
    if ('value' in item) entry.value = item.value;
    out.push(entry);
  }
  return out;
}

function severityBadgeClasses(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40';
    case 'high':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40';
    case 'medium':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40';
    case 'low':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Walk a JSON Pointer (RFC 6901) on a JSON document. Returns `undefined` if
 * any segment is missing. Tilde-decoding per RFC 6901: `~1` → `/`, `~0` → `~`.
 */
function walkPointer(doc: unknown, pointer: string): unknown {
  if (pointer === '' || pointer === '/') return doc;
  const segments = pointer
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur: unknown = doc;
  for (const seg of segments) {
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
    } else if (isObject(cur)) {
      cur = cur[seg];
    } else {
      return undefined;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

/**
 * Parent JSON-Pointer of the given pointer. e.g. `/paths/~1orders/get` → `/paths/~1orders`.
 * Returns `''` (root) if the input has only one segment.
 */
function parentPointer(pointer: string): string {
  if (pointer === '' || pointer === '/') return '';
  const idx = pointer.lastIndexOf('/');
  if (idx <= 0) return '';
  return pointer.slice(0, idx);
}

/**
 * Deepest common ancestor (RFC 6901 pointer) of a set of patch-op paths. Per
 * the Epic 05 domain term: the smallest JSON sub-tree that contains all
 * `patchOps[].path` ancestors. For a single op we show the parent so the
 * leaf-level change renders in context; for multiple ops we take the longest
 * common prefix of path segments. Falls back to root (`''`) when the ops
 * touch disjoint sub-trees.
 */
function diffSubtreePath(paths: string[]): string {
  if (paths.length === 0) return '';
  if (paths.length === 1) return parentPointer(paths[0]);
  const splits = paths.map((p) => p.split('/').slice(1));
  const minLen = Math.min(...splits.map((s) => s.length));
  let k = 0;
  while (k < minLen) {
    const seg = splits[0][k];
    if (!splits.every((s) => s[k] === seg)) break;
    k++;
  }
  if (k === 0) return '';
  return '/' + splits[0].slice(0, k).join('/');
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

type DiffStrings =
  | { ok: true; before: string; after: string }
  | { ok: false; reason: 'empty' | 'apply_failed' };

function computeDiff(
  specCurrentJson: unknown,
  patchOps: PatchOp[],
): DiffStrings {
  if (patchOps.length === 0) return { ok: false, reason: 'empty' };
  const subtreePath = diffSubtreePath(patchOps.map((op) => op.path));

  // Defensive deep-clone: structuredClone is available in modern browsers and
  // Node 17+ (Next.js 16 / Node 22 on this project).
  let patchedDoc: unknown;
  try {
    const clone = structuredClone(specCurrentJson);
    const result = applyPatch(
      clone,
      patchOps as Operation[],
      /* validate */ false,
      /* mutateDocument */ true,
    );
    patchedDoc = result.newDocument;
  } catch {
    return { ok: false, reason: 'apply_failed' };
  }

  const beforeNode = walkPointer(specCurrentJson, subtreePath);
  const afterNode = walkPointer(patchedDoc, subtreePath);

  return {
    ok: true,
    before: safeStringify(beforeNode),
    after: safeStringify(afterNode),
  };
}

export function FindingCard({
  finding,
  specCurrentJson,
  registerRef,
}: {
  finding: Finding;
  specCurrentJson: unknown;
  registerRef?: (key: string, el: HTMLElement | null) => void;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [endpointsOpen, setEndpointsOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);

  useEffect(() => {
    if (!registerRef) return;
    registerRef(finding.id, containerRef.current);
    return () => {
      registerRef(finding.id, null);
    };
  }, [registerRef, finding.id]);

  const affectedEndpoints = asAffectedEndpoints(finding.affectedEndpoints);
  const patchOps = asPatchOps(finding.patchOps);
  const isSpecScope = finding.scope === 'spec';

  return (
    <Card
      ref={containerRef}
      size="sm"
      data-finding-id={finding.id}
      className="ring-0 transition-shadow"
    >
      <CardContent className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-medium leading-snug">{finding.title}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                severityBadgeClasses(finding.severity),
              )}
            >
              {capitalise(finding.severity)}
            </span>
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {capitalise(finding.category)}
            </span>
          </div>
        </div>

        {/* Affected endpoints */}
        {isSpecScope ? (
          <p className="text-xs text-muted-foreground">Spec-level finding</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setEndpointsOpen((v) => !v)}
              className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
              aria-expanded={endpointsOpen}
            >
              {affectedEndpoints.length} endpoint
              {affectedEndpoints.length === 1 ? '' : 's'} affected{' '}
              {endpointsOpen ? '▾' : '▸'}
            </button>
            {endpointsOpen && affectedEndpoints.length > 0 ? (
              <ul className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/30 p-2 font-mono text-xs">
                {affectedEndpoints.map((ep, i) => (
                  <li key={`${ep.method}-${ep.path}-${i}`}>
                    <span className="font-semibold uppercase">{ep.method}</span>{' '}
                    {ep.path}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {/* Narration */}
        <p className="text-sm leading-relaxed">{finding.narration}</p>

        {/* Rationale */}
        <p className="text-sm leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">Why:</strong>{' '}
          {finding.rationale}
        </p>

        {/* Patch summary */}
        <p className="text-xs">
          <strong className="font-semibold">Patch:</strong>{' '}
          {finding.patchSummary}
        </p>

        {/* Show diff toggle */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setDiffOpen((v) => !v)}
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
            aria-expanded={diffOpen}
          >
            {diffOpen ? '▾' : '▸'} Show diff
          </button>
          {diffOpen ? <DiffPanel patchOps={patchOps} specCurrentJson={specCurrentJson} /> : null}
        </div>

        {/* Show JSON Patch ops toggle */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setOpsOpen((v) => !v)}
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
            aria-expanded={opsOpen}
          >
            {opsOpen ? '▾' : '▸'} Show JSON Patch ops
          </button>
          {opsOpen ? <PatchOpsTable patchOps={patchOps} /> : null}
        </div>

        {/* Action row — depends on status (Epic 06) */}
        <FindingActionBar finding={finding} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Action bar — Epic 06 status-based rendering
// ---------------------------------------------------------------------------

function FindingActionBar({ finding }: { finding: Finding }): React.JSX.Element {
  switch (finding.status) {
    case 'open':
      return <OpenActions finding={finding} />;
    case 'applied':
      return <AppliedActions finding={finding} />;
    case 'rejected':
      return <RejectedActions finding={finding} />;
    case 'stale':
    case 'outdated':
      return <StaleOrOutdatedActions finding={finding} />;
    default:
      return <></>;
  }
}

function OpenActions({ finding }: { finding: Finding }): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onApply() {
    startTransition(async () => {
      const result = await applyFindingAction({ findingId: finding.id });
      if (result.success) {
        showToast(TOASTS.patchApplied);
        router.refresh();
        return;
      }
      const { error } = result;
      if (error.kind === 'rate_limited') {
        showToast(formatQuotaToast(error));
        return;
      }
      if (error.kind === 'patch_stale') {
        // No error toast — server has flipped to 'stale', next render shows the
        // stale-card UI (per AC #8a).
        router.refresh();
        return;
      }
      console.error('applyFindingAction failed:', error);
    });
  }

  function onReject() {
    startTransition(async () => {
      const result = await rejectFindingAction({ findingId: finding.id });
      if (result.success) {
        showToast(TOASTS.patchRejected);
        router.refresh();
        return;
      }
      console.error('rejectFindingAction failed:', result.error);
    });
  }

  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button variant="default" size="sm" onClick={onApply} disabled={pending}>
        {pending ? 'Working…' : 'Apply'}
      </Button>
      <Button variant="outline" size="sm" onClick={onReject} disabled={pending}>
        Reject
      </Button>
    </div>
  );
}

function AppliedActions({ finding }: { finding: Finding }): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hint, setHint] = useState<string | null>(null);

  function onUndo() {
    setHint(null);
    startTransition(async () => {
      const result = await undoApplyAction({ findingId: finding.id });
      if (result.success) {
        showToast(TOASTS.applyUndone);
        router.refresh();
        return;
      }
      const { error } = result;
      if (error.kind === 'not_latest_apply') {
        setHint(error.message);
        return;
      }
      console.error('undoApplyAction failed:', error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5 pt-1">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Applied
          {finding.appliedAt
            ? ` · ${finding.appliedAt.toLocaleString()}`
            : ''}
        </span>
        <Button variant="outline" size="sm" onClick={onUndo} disabled={pending}>
          {pending ? 'Undoing…' : 'Undo Apply'}
        </Button>
      </div>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function RejectedActions({ finding }: { finding: Finding }): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onUndo() {
    startTransition(async () => {
      const result = await undoRejectAction({ findingId: finding.id });
      if (result.success) {
        showToast(TOASTS.rejectUndone);
        router.refresh();
        return;
      }
      console.error('undoRejectAction failed:', result.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <span className="inline-flex items-center rounded-full border border-zinc-500/40 bg-zinc-500/15 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Rejected
        {finding.rejectedAt
          ? ` · ${finding.rejectedAt.toLocaleString()}`
          : ''}
      </span>
      <Button variant="outline" size="sm" onClick={onUndo} disabled={pending}>
        {pending ? 'Undoing…' : 'Undo Reject'}
      </Button>
    </div>
  );
}

function StaleOrOutdatedActions({
  finding,
}: {
  finding: Finding;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isStale = finding.status === 'stale';
  const showStaleReason = isStale && !!finding.staleReason;

  function onReanalyze() {
    startTransition(async () => {
      const result = await reanalyzeSpecAction({ specId: finding.specId });
      if (result.success) {
        showToast(TOASTS.reanalyzeStarted);
        router.refresh();
        return;
      }
      console.error('reanalyzeSpecAction failed:', result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2 pt-1">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
            'border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
          )}
        >
          {isStale ? 'Stale' : 'Outdated'}
        </span>
      </div>
      <p className="self-stretch text-xs text-muted-foreground">
        This patch is no longer applicable to the current spec. Re-analyze to
        refresh.
      </p>
      {showStaleReason ? (
        <details className="self-stretch text-xs">
          <summary className="cursor-pointer text-muted-foreground underline-offset-2 hover:underline">
            Why?
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono">
            {finding.staleReason}
          </pre>
        </details>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={onReanalyze}
        disabled={pending}
      >
        {pending ? 'Triggering…' : 'Re-analyze'}
      </Button>
    </div>
  );
}

function DiffPanel({
  patchOps,
  specCurrentJson,
}: {
  patchOps: PatchOp[];
  specCurrentJson: unknown;
}): React.JSX.Element {
  const diff = computeDiff(specCurrentJson, patchOps);
  if (!diff.ok && diff.reason === 'empty') {
    return (
      <p className="text-xs text-muted-foreground">No diff available</p>
    );
  }
  if (!diff.ok && diff.reason === 'apply_failed') {
    return (
      <p className="text-xs text-muted-foreground">
        Diff unavailable — patch may not apply cleanly
      </p>
    );
  }
  if (!diff.ok) return <></>;
  return (
    <div className="overflow-hidden rounded-md border border-border font-mono text-xs">
      <ReactDiffViewer
        oldValue={diff.before}
        newValue={diff.after}
        splitView
        useDarkTheme
        styles={{
          variables: {
            dark: {
              addedBackground: 'rgba(34, 197, 94, 0.15)',
              addedColor: 'inherit',
              removedBackground: 'rgba(239, 68, 68, 0.15)',
              removedColor: 'inherit',
              wordAddedBackground: 'rgba(34, 197, 94, 0.30)',
              wordRemovedBackground: 'rgba(239, 68, 68, 0.30)',
            },
          },
        }}
      />
    </div>
  );
}

function PatchOpsTable({ patchOps }: { patchOps: PatchOp[] }): React.JSX.Element {
  if (patchOps.length === 0) {
    return <p className="text-xs text-muted-foreground">No patch ops</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full font-mono text-xs">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-2 py-1.5 font-medium">op</th>
            <th className="px-2 py-1.5 font-medium">path</th>
            <th className="px-2 py-1.5 font-medium">value</th>
          </tr>
        </thead>
        <tbody>
          {patchOps.map((op, i) => {
            const hasValue = 'value' in op && op.value !== undefined;
            const valueCell = hasValue
              ? truncate(safeStringify(op.value), 80)
              : '—';
            return (
              <tr
                key={`${op.op}-${op.path}-${i}`}
                className="border-t border-border"
              >
                <td className="px-2 py-1 align-top">{op.op}</td>
                <td className="px-2 py-1 align-top break-all">{op.path}</td>
                <td className="px-2 py-1 align-top break-all">{valueCell}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
