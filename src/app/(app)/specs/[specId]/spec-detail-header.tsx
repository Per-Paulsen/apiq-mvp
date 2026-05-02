'use client';

/**
 * Spec Detail header (Epic 05 — scope bullet "Header" / AC #1, #13).
 *
 * Renders the top section of `/specs/[specId]`: name, source URL,
 * quality-score badge, analysis-status pill, last-analyzed timestamp,
 * and the Re-pull / Re-analyze action buttons.
 *
 * Wiring:
 *   - "Re-pull from URL" calls `repullSpecAction` (Epic 03). Visible only when
 *     `sourceType === 'url' && wasAuthedPull === false` per spec scope bullet
 *     "Re-pull button visibility logic".
 *   - "Re-analyze" calls `reanalyzeSpecAction` (Epic 04 — synchronously flips
 *     `analysisStatus` to 'analyzing' before returning, so `router.refresh()`
 *     after the action shows the new state immediately without waiting for
 *     the 3 s polling cycle — see AC #13 / Epic 04 results §"Resolved Q3").
 *
 * No toasts in this epic — Epic 08 wires those. On action failure we just
 * leave the UI as-is; the polling loop on the parent page will eventually
 * pick up the spec's terminal status.
 *
 * Color tokens come from `prd-decisions.md`:
 *   - Quality-score thresholds (§"Color Palette" Quality-Score-Badges):
 *     ≥80 emerald, 60–79 amber, <60 red, null → neutral zinc placeholder.
 *   - Status pills (§"Components" Status-Pills): pending/analyzing → blue
 *     with spinner, completed → emerald, failed → red.
 */

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import type { Spec, SpecVersion } from '@/generated/prisma/client';
import { Button } from '@/components/ui/button';

import { reanalyzeSpecAction, repullSpecAction } from '../actions';
import { VersionsDrawer } from './versions-drawer';

type AnalysisStatus = Spec['analysisStatus'];

// ---------------------------------------------------------------------------
// Quality-score badge
// ---------------------------------------------------------------------------

function qualityScoreClasses(score: number | null): string {
  if (score == null) {
    return 'border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300';
  }
  if (score >= 80) {
    return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  }
  if (score >= 60) {
    return 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }
  return 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300';
}

function QualityScoreBadge({ score }: { score: number | null }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs ${qualityScoreClasses(score)}`}
      aria-label={
        score == null
          ? 'Quality score: not yet analyzed'
          : `Quality score: ${score}`
      }
    >
      {score ?? '—'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

function statusPillClasses(status: AnalysisStatus): string {
  switch (status) {
    case 'pending':
    case 'analyzing':
      return 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300';
    case 'completed':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 'failed':
      return 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300';
    default:
      return 'border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300';
  }
}

function StatusPill({ status }: { status: AnalysisStatus }) {
  const isAnalyzing = status === 'pending' || status === 'analyzing';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${statusPillClasses(status)}`}
    >
      {isAnalyzing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function SpecDetailHeader({
  spec,
  versions,
}: {
  spec: Spec;
  versions: SpecVersion[];
}): React.JSX.Element {
  const router = useRouter();
  const [repullPending, startRepull] = useTransition();
  const [reanalyzePending, startReanalyze] = useTransition();

  const repullVisible =
    spec.sourceType === 'url' && spec.wasAuthedPull === false;
  const isAnalyzing =
    spec.analysisStatus === 'pending' || spec.analysisStatus === 'analyzing';

  function onRepull() {
    startRepull(async () => {
      await repullSpecAction({ specId: spec.id });
      router.refresh();
    });
  }

  function onReanalyze() {
    startReanalyze(async () => {
      await reanalyzeSpecAction({ specId: spec.id });
      router.refresh();
    });
  }

  // Display label for the source line: real URL for url-sourced specs,
  // sourceUrl for sample-sourced specs (it's stored as `apiq:sample/<id>`),
  // or a bare fallback if neither is set.
  const sourceLabel = spec.sourceUrl ?? spec.sourceType;

  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{spec.name}</h1>
          <QualityScoreBadge score={spec.qualityScore} />
          <StatusPill status={spec.analysisStatus} />
        </div>
        <p className="text-xs text-muted-foreground">
          Source:{' '}
          <code className="font-mono text-xs">{sourceLabel}</code>
        </p>
        {spec.lastAnalyzedAt ? (
          <p className="text-xs text-muted-foreground">
            Last analyzed {spec.lastAnalyzedAt.toLocaleString()}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <VersionsDrawer
          versions={versions}
          currentVersionId={spec.currentVersionId}
        />
        {repullVisible ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={repullPending}
            onClick={onRepull}
          >
            {repullPending ? 'Re-pulling…' : 'Re-pull from URL'}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={isAnalyzing || reanalyzePending}
          onClick={onReanalyze}
        >
          Re-analyze
        </Button>
      </div>
    </header>
  );
}
