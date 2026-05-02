import { NextResponse } from 'next/server';

import { runAnalysis } from '@/lib/analysis/runAnalysis';

/**
 * Internal analyze endpoint (Epic 04).
 *
 * Kept for manual debug / external triggers. Production server actions
 * (`addSpecFromUrlAction`, `repullSpecAction`, `loadSampleSpecAction`,
 * `reanalyzeSpecAction`) call `runAnalysis` directly in-process.
 *
 * Auth: shared-secret header `x-internal-secret` matched against
 * `process.env.INTERNAL_API_SECRET`. 403 on mismatch.
 *
 * Behaviour: fire-and-forget — return 202 immediately so the request
 * doesn't hang for the duration of the LLM call (~60s typical).
 */
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse> {
  const expected = process.env.INTERNAL_API_SECRET;
  const provided = request.headers.get('x-internal-secret');
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const specId = (body as { specId?: unknown } | null)?.specId;
  if (typeof specId !== 'string') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  // Fire-and-forget — return 202 immediately.
  void runAnalysis(specId).catch((err) => {
    console.error('runAnalysis failed:', err);
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
