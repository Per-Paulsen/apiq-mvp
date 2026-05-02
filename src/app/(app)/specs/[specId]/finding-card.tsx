'use client';

/**
 * Single finding card for the Spec Detail right pane (Epic 05).
 *
 * Renders title, severity + category badges, affected-endpoints expansion,
 * narration, rationale, patch summary, "Show diff" (side-by-side via
 * react-diff-viewer-continued), "Show JSON Patch ops" table, and disabled
 * Apply / Reject buttons with "Implemented in Epic 06" tooltip.
 *
 * The outer element is registered via `registerRef(finding.id, el)` so the
 * parent integration can scroll-to and apply a temporary
 * `ring-2 ring-violet-500` outline when the user clicks an endpoint in the
 * left pane (per AC #11).
 *
 * Diff sub-tree heuristic: take the first `patchOps[0].path`, walk to its
 * parent (everything before the last `/` segment), JSON-stringify that node
 * on `specCurrentJson` (before) and on the patched clone (after). Renders
 * "Diff unavailable — patch may not apply cleanly" if `applyPatch` throws
 * (hallucinated paths) or "No diff available" if `patchOps` is empty.
 */
import { applyPatch } from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';
import { useEffect, useRef, useState } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Finding } from '@/generated/prisma/client';
import { cn } from '@/lib/utils';

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
  const firstPath = patchOps[0].path;
  const subtreePath = parentPointer(firstPath);

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

        {/* Apply / Reject (Epic 06) */}
        <div className="flex justify-end gap-2 pt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex">
                <Button variant="default" size="sm" disabled>
                  Apply
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Implemented in Epic 06</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex">
                <Button variant="outline" size="sm" disabled>
                  Reject
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Implemented in Epic 06</TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
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
