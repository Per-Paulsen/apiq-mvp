/**
 * Capture demo fixtures from dev DB.
 *
 * Reads completed Specs from the LOCAL dev DB and writes each as a JSON
 * fixture to `scripts/seed-fixtures/<slug>.json`. The fixtures get committed
 * to git and replayed by `seedDemo()` on production deploys (and by the
 * daily reset cron) — so the demo workspace renders instantly without
 * incurring any LLM cost.
 *
 * Default behaviour: capture EVERY completed Spec in the dev DB that has at
 * least one open finding. Override with APIQ_DEMO_FIXTURE_NAMES to filter to
 * specific name-substring matches.
 *
 * Pre-requisite (one-time, in your dev environment):
 *   1. `npm run dev`
 *   2. Sign up locally
 *   3. Add and analyze 1–3 specs you want in the portfolio demo:
 *      - OpenWeatherMap via "Try sample" button (existing v0.1 sample)
 *      - Any other public OpenAPI 3.x spec via URL pull (e.g. Petstore 3.0:
 *        https://petstore3.swagger.io/api/v3/openapi.json — 16 endpoints,
 *        recognizable, ~$0.05 LLM cost)
 *   4. Wait for analysisStatus = 'completed' on each
 *
 * Run:
 *   npm run capture-demo-fixtures
 *
 * Filter to specific specs:
 *   APIQ_DEMO_FIXTURE_NAMES=OpenWeatherMap,Petstore npm run capture-demo-fixtures
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set — point .env at your dev DB and retry.');
    return 1;
  }

  const filterNames = process.env.APIQ_DEMO_FIXTURE_NAMES
    ? process.env.APIQ_DEMO_FIXTURE_NAMES.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const fixturesDir = path.join(process.cwd(), 'scripts', 'seed-fixtures');
  fs.mkdirSync(fixturesDir, { recursive: true });

  let captured = 0;
  let skipped = 0;

  try {
    // Find candidate specs: completed analysis status, has at least one open finding.
    const allCompleted = await prisma.spec.findMany({
      where: { analysisStatus: 'completed' },
      include: { findings: { where: { status: 'open' } } },
      orderBy: { createdAt: 'desc' },
    });

    let candidates = allCompleted.filter((s) => s.findings.length > 0);

    if (filterNames) {
      candidates = candidates.filter((s) =>
        filterNames.some((needle) =>
          s.name.toLowerCase().includes(needle.toLowerCase()),
        ),
      );
      if (candidates.length === 0) {
        console.error(
          `No completed specs in dev DB matching names: ${filterNames.join(', ')}`,
        );
        return 1;
      }
    } else if (candidates.length === 0) {
      console.error(
        'No completed specs with findings in dev DB.\n' +
          'Add + analyze 1–3 specs locally first (see script docstring), then re-run.',
      );
      return 1;
    }

    console.log(
      `Found ${candidates.length} candidate spec(s) in dev DB:\n` +
        candidates
          .map(
            (s) =>
              `  - ${s.name}  (score ${s.qualityScore}, ${s.findings.length} findings, ${s.endpointCount} endpoints)`,
          )
          .join('\n'),
    );
    console.log('');

    for (const spec of candidates) {
      const slug = slugify(spec.name);
      const fixture = {
        name: spec.name,
        sourceType: spec.sourceType,
        sourceUrl: spec.sourceUrl,
        sourceFormat: spec.sourceFormat,
        originalJson: spec.originalJson,
        currentJson: spec.currentJson,
        endpointCount: spec.endpointCount,
        qualityScore: spec.qualityScore,
        findings: spec.findings.map((f) => ({
          scope: f.scope,
          affectedEndpoints: f.affectedEndpoints,
          category: f.category,
          severity: f.severity,
          title: f.title,
          narration: f.narration,
          rationale: f.rationale,
          patchSummary: f.patchSummary,
          patchOps: f.patchOps,
        })),
      };
      const outPath = path.join(fixturesDir, `${slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
      console.log(
        `[OK]   Wrote ${path.relative(process.cwd(), outPath)}`,
      );
      captured++;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nCaptured ${captured} fixture(s).`);
  if (captured === 0) return 1;
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
