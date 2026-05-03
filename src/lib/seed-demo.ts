/**
 * Portfolio-deploy demo seed.
 *
 * Idempotent. Wipes the demo workspace's specs/findings and re-seeds from
 * pre-captured fixtures in `scripts/seed-fixtures/*.json`. Called from:
 *   - `scripts/seed-demo.ts` (one-time CLI run after first deploy)
 *   - `src/app/api/cron/reset-demo/route.ts` (Vercel daily cron)
 *
 * Demo credentials (advertised on landing when DEMO_MODE=true):
 *   email:    demo@example.com   (RFC-2606 reserved demo domain)
 *   password: demo
 *
 * Reset semantics: User row + Workspace row + UserWorkspace link are kept
 * across resets (ID stability for any session cookies in flight). Specs +
 * SpecVersions + Findings are wiped + re-seeded. LLMCall rows for the demo
 * workspace are also wiped (they accumulate when visitors trigger
 * Re-analyze).
 *
 * Not marked `'server-only'` because the CLI wrapper at scripts/seed-demo.ts
 * needs to import it via tsx (Node context). Server-context safety is
 * preserved by the bcrypt + node:fs imports below — they fail at client-bundle
 * time anyway.
 */

import * as bcrypt from 'bcrypt';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { PrismaClient } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo';
export const DEMO_WORKSPACE_NAME = 'Demo Workspace';
export const DEMO_USER_NAME = 'Demo User';

type FixtureFinding = {
  scope: 'spec' | 'endpoint';
  affectedEndpoints: unknown;
  category: 'clarity' | 'design' | 'risk';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  narration: string;
  rationale: string;
  patchSummary: string;
  patchOps: unknown;
};

type Fixture = {
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceFormat: string;
  originalJson: unknown;
  currentJson: unknown;
  endpointCount: number;
  qualityScore: number;
  findings: FixtureFinding[];
};

export type SeedDemoResult = {
  userId: string;
  workspaceId: string;
  specs: Array<{ id: string; name: string; findingCount: number; qualityScore: number | null }>;
  resetAt: string;
};

function readFixture(fixturesDir: string, filename: string): Fixture {
  const full = path.join(fixturesDir, filename);
  if (!fs.existsSync(full)) {
    throw new Error(
      `Demo fixture not found: ${full}. Run "npm run capture-demo-fixtures" first.`,
    );
  }
  const raw = fs.readFileSync(full, 'utf8');
  return JSON.parse(raw) as Fixture;
}

function discoverFixtureFiles(fixturesDir: string): string[] {
  if (!fs.existsSync(fixturesDir)) return [];
  return fs
    .readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

export async function seedDemo(
  prisma: PrismaClient,
  options?: { fixturesDir?: string; fixtureFiles?: string[] },
): Promise<SeedDemoResult> {
  const fixturesDir =
    options?.fixturesDir ?? path.join(process.cwd(), 'scripts', 'seed-fixtures');
  const fixtureFiles =
    options?.fixtureFiles ?? discoverFixtureFiles(fixturesDir);

  if (fixtureFiles.length === 0) {
    throw new Error(
      `No demo fixtures found in ${fixturesDir}. Run "npm run capture-demo-fixtures" first to populate them.`,
    );
  }

  // Load fixtures upfront — fail fast if any are missing before touching the DB.
  const fixtures = fixtureFiles.map((f) => readFixture(fixturesDir, f));

  // 1. Demo user — find or create.
  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        name: DEMO_USER_NAME,
        passwordHash,
        emailVerified: new Date(), // pre-verified so login works without email infra
      },
    });
  }

  // 2. Demo workspace — find or create + link to user.
  let userWorkspace = await prisma.userWorkspace.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });
  let workspaceId: string;
  if (!userWorkspace) {
    const workspace = await prisma.workspace.create({
      data: { name: DEMO_WORKSPACE_NAME },
    });
    await prisma.userWorkspace.create({
      data: { userId: user.id, workspaceId: workspace.id, role: 'owner' },
    });
    workspaceId = workspace.id;
  } else {
    workspaceId = userWorkspace.workspaceId;
  }

  // 3. Wipe existing demo specs (cascades to SpecVersions + Findings via schema).
  // Also wipe LLMCall rows for the workspace (accumulated from Re-analyze clicks).
  // Done in a single transaction.
  await prisma.$transaction([
    prisma.spec.deleteMany({ where: { workspaceId } }),
    prisma.lLMCall.deleteMany({ where: { workspaceId } }),
    prisma.workspaceActionLog.deleteMany({ where: { workspaceId } }),
  ]);

  // 4. Re-seed from fixtures.
  const seededSpecs: SeedDemoResult['specs'] = [];
  for (const fixture of fixtures) {
    const spec = await prisma.spec.create({
      data: {
        workspaceId,
        name: fixture.name,
        sourceType: fixture.sourceType,
        sourceUrl: fixture.sourceUrl,
        sourceFormat: fixture.sourceFormat,
        originalJson: fixture.originalJson as Prisma.InputJsonValue,
        currentJson: fixture.currentJson as Prisma.InputJsonValue,
        endpointCount: fixture.endpointCount,
        qualityScore: fixture.qualityScore,
        analysisStatus: 'completed',
        lastAnalyzedAt: new Date(),
      },
    });

    const version = await prisma.specVersion.create({
      data: {
        specId: spec.id,
        versionNumber: 1,
        json: fixture.currentJson as Prisma.InputJsonValue,
        label: 'initial',
      },
    });

    await prisma.spec.update({
      where: { id: spec.id },
      data: { currentVersionId: version.id },
    });

    if (fixture.findings.length > 0) {
      await prisma.finding.createMany({
        data: fixture.findings.map((f) => ({
          specId: spec.id,
          specVersionId: version.id,
          scope: f.scope,
          affectedEndpoints: f.affectedEndpoints as Prisma.InputJsonValue,
          category: f.category,
          severity: f.severity,
          title: f.title,
          narration: f.narration,
          rationale: f.rationale,
          patchSummary: f.patchSummary,
          patchOps: f.patchOps as Prisma.InputJsonValue,
          status: 'open',
        })),
      });
    }

    seededSpecs.push({
      id: spec.id,
      name: spec.name,
      findingCount: fixture.findings.length,
      qualityScore: spec.qualityScore,
    });
  }

  return {
    userId: user.id,
    workspaceId,
    specs: seededSpecs,
    resetAt: new Date().toISOString(),
  };
}
