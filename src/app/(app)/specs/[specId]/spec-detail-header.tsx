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

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import type { Spec, SpecVersion } from '@/generated/prisma/client';
import { Button } from '@/components/ui/button';
import { QualityScoreBadge, StatusPill } from '@/components/spec-badges';
import { formatQuotaToast, showToast, TOASTS } from '@/lib/toasts';

import { reanalyzeSpecAction, repullSpecAction } from '../actions';
import { ExportButtons } from './export-buttons';
import { VersionsDrawer } from './versions-drawer';

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
      const result = await repullSpecAction({ specId: spec.id });
      if (result.success) {
        showToast(TOASTS.rePullComplete);
        router.refresh();
        return;
      }
      if (result.error.kind === 'rate_limited') {
        showToast(formatQuotaToast(result.error));
        return;
      }
      router.refresh();
    });
  }

  function onReanalyze() {
    startReanalyze(async () => {
      const result = await reanalyzeSpecAction({ specId: spec.id });
      if (result.success) {
        showToast(TOASTS.reanalyzeStarted);
      }
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
          <code className="font-mono text-xs break-all">{sourceLabel}</code>
        </p>
        {spec.lastAnalyzedAt ? (
          <p className="text-xs text-muted-foreground">
            Last analyzed {spec.lastAnalyzedAt.toLocaleString()}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
        <ExportButtons spec={spec} />
      </div>
    </header>
  );
}
