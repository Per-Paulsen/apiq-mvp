/**
 * One-time seed of the demo workspace against the configured DATABASE_URL.
 *
 * Run after first production deploy (point DATABASE_URL at production DB):
 *   DATABASE_URL=<prod-pooler-url> npx tsx scripts/seed-demo.ts
 *
 * After this, the daily cron at /api/cron/reset-demo handles re-seeds.
 *
 * The actual seed logic lives in src/lib/seed-demo.ts — this script is a
 * thin CLI wrapper that loads dotenv and provides its own Prisma client so
 * the server-only import in seed-demo.ts is satisfied indirectly via tsx.
 */

import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { seedDemo, DEMO_EMAIL, DEMO_PASSWORD } from '../src/lib/seed-demo';

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set.');
    return 1;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('Seeding demo workspace…');
    const result = await seedDemo(prisma);
    console.log(`\nDemo seed complete.`);
    console.log(`  User:       ${DEMO_EMAIL}  (password: ${DEMO_PASSWORD})`);
    console.log(`  UserId:     ${result.userId}`);
    console.log(`  Workspace:  ${result.workspaceId}`);
    console.log(`  Specs:      ${result.specs.length}`);
    for (const s of result.specs) {
      console.log(`    - ${s.name}  (score ${s.qualityScore}, ${s.findingCount} findings)`);
    }
    console.log(`  ResetAt:    ${result.resetAt}`);
  } finally {
    await prisma.$disconnect();
  }

  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
