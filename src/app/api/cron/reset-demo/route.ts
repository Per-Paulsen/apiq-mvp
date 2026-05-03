/**
 * Daily cron — resets the demo workspace to its pre-seeded state.
 *
 * Configured in `vercel.json` to run at 03:00 UTC daily. Vercel auto-injects
 * `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET env var is set.
 *
 * Skipped when DEMO_MODE is not enabled — protects production environments
 * that aren't the portfolio deploy.
 */

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { seedDemo } from '@/lib/seed-demo';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (process.env.DEMO_MODE !== 'true') {
    return NextResponse.json({
      skipped: true,
      reason: 'DEMO_MODE not enabled',
    });
  }

  try {
    const result = await seedDemo(prisma);
    return NextResponse.json({
      success: true,
      resetAt: result.resetAt,
      specs: result.specs.map((s) => ({
        name: s.name,
        findingCount: s.findingCount,
        qualityScore: s.qualityScore,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'seed_failed', message },
      { status: 500 },
    );
  }
}
