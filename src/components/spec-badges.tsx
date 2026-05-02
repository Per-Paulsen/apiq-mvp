'use client';

/**
 * Shared spec badges (Epic 07 — extracted from Epic 05's spec-detail-header).
 *
 * Both badges are reused by the Specs List rows and the Spec Detail header.
 * Color tokens come from `prd-decisions.md`:
 *   - Quality-score thresholds (§"Color Palette" Quality-Score-Badges):
 *     ≥80 emerald, 60–79 amber, <60 red, null → neutral zinc placeholder.
 *   - Status pills (§"Components" Status-Pills): pending/analyzing → blue
 *     with spinner-icon, completed → emerald, failed → red.
 */

import { Loader2 } from 'lucide-react';

import type { Spec } from '@/generated/prisma/client';

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

export function QualityScoreBadge({ score }: { score: number | null }) {
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

export function StatusPill({ status }: { status: AnalysisStatus }) {
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
