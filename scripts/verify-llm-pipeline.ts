/**
 * Standalone verification script for Epic 04 (LLM Pipeline).
 *
 * Exercises the full analysis pipeline against the real database and the
 * real OpenRouter Sonnet endpoint. Re-runnable / idempotent — picks the
 * oldest `pending` spec in the DB (or the most recently-created spec if
 * none are pending) and runs analysis against it.
 *
 * Run with the dev server up (so the `/api/internal/analyze` route is live):
 *   1. `npm run dev` (background)
 *   2. `npx tsx scripts/verify-llm-pipeline.ts`
 *
 * The script side-steps the `server-only` import in `runAnalysis` by talking
 * to the route handler over HTTP — same path the production-ready / debug
 * use-case takes. The route is gated by `INTERNAL_API_SECRET`.
 *
 * Cost: one Sonnet call per run. ~$0.05 for a small spec, ~$1-2 for Stripe-class.
 *
 * Skip-conditions (the script still exits 0):
 *   - No DATABASE_URL → exits early with a notice.
 *   - No INTERNAL_API_SECRET / OPENROUTER_API_KEY → exits early.
 *   - Dev server not reachable → exits with "skipped" notice.
 *   - No specs in DB → exits with "skipped" notice.
 */
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const BASE_URL = process.env.APIQ_BASE_URL || 'http://localhost:3000';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — matches route maxDuration.

function log(level: 'info' | 'pass' | 'fail' | 'skip', message: string): void {
  const tag =
    level === 'info'
      ? '[..]'
      : level === 'pass'
        ? '[OK]'
        : level === 'fail'
          ? '[FAIL]'
          : '[SKIP]';
  // eslint-disable-next-line no-console
  console.log(`${tag} ${message}`);
}

async function pollAuthHealthcheck(): Promise<boolean> {
  // Quick reachability check — any response (even 401) means the server is up.
  try {
    const res = await fetch(`${BASE_URL}/api/internal/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    return res.status === 403 || res.status === 400;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL) {
    log('skip', 'DATABASE_URL not set — skipping verification.');
    return 0;
  }
  if (!process.env.INTERNAL_API_SECRET) {
    log('skip', 'INTERNAL_API_SECRET not set — skipping.');
    return 0;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    log('skip', 'OPENROUTER_API_KEY not set — skipping.');
    return 0;
  }

  const reachable = await pollAuthHealthcheck();
  if (!reachable) {
    log(
      'skip',
      `Dev server not reachable at ${BASE_URL} — start it with "npm run dev" first.`,
    );
    return 0;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  let failures = 0;

  try {
    // ---- AC #11 — POST without secret returns 403 ---------------------------
    log('info', 'AC #11: POST /api/internal/analyze without secret');
    const noSecretRes = await fetch(`${BASE_URL}/api/internal/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ specId: 'noop' }),
    });
    if (noSecretRes.status !== 403) {
      log('fail', `expected 403, got ${noSecretRes.status}`);
      failures++;
    } else {
      log('pass', '403 returned');
    }

    // ---- AC #11 — POST with wrong secret returns 403 ------------------------
    log('info', 'AC #11: POST /api/internal/analyze with wrong secret');
    const wrongSecretRes = await fetch(`${BASE_URL}/api/internal/analyze`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'wrong-secret-xyz',
      },
      body: JSON.stringify({ specId: 'noop' }),
    });
    if (wrongSecretRes.status !== 403) {
      log('fail', `expected 403, got ${wrongSecretRes.status}`);
      failures++;
    } else {
      log('pass', '403 returned');
    }

    // ---- Pick or create a target spec ---------------------------------------
    // Prefer a freshly-loaded openweathermap sample (spike-calibrated, known
    // to produce schema-compliant findings). Falls back to an existing
    // pending/failed spec if the sample fixture isn't on disk.
    log('info', 'Setting up target spec');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sampleFixturePath = path.resolve(
      process.cwd(),
      'openapi-examples',
      'openweathermap',
      'spec.json',
    );
    let target: {
      id: string;
      name: string;
      workspaceId: string;
      analysisStatus: string;
      endpointCount: number;
    } | null = null;

    if (fs.existsSync(sampleFixturePath)) {
      const workspace = await prisma.workspace.findFirst({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!workspace) {
        log('skip', 'No workspace in DB — cannot create verification spec.');
        return failures > 0 ? 1 : 0;
      }
      const body = fs.readFileSync(sampleFixturePath, 'utf8');
      const parsed = JSON.parse(body);
      const specName = `[verify-llm-pipeline] OpenWeatherMap ${new Date().toISOString()}`;
      // Count paths × methods in the fixture (avoids importing server-only).
      const paths = (parsed as Record<string, unknown>).paths as
        | Record<string, Record<string, unknown>>
        | undefined;
      let endpointCount = 0;
      if (paths) {
        for (const ops of Object.values(paths)) {
          for (const m of Object.keys(ops)) {
            if (
              ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'].includes(
                m.toLowerCase(),
              )
            )
              endpointCount++;
          }
        }
      }
      const created = await prisma.$transaction(async (tx) => {
        const spec = await tx.spec.create({
          data: {
            workspaceId: workspace.id,
            name: specName,
            sourceType: 'sample',
            sourceUrl: 'apiq:sample/openweathermap',
            sourceFormat: 'json',
            wasAuthedPull: false,
            originalJson: parsed,
            currentJson: parsed,
            endpointCount,
            analysisStatus: 'pending',
          },
        });
        const version = await tx.specVersion.create({
          data: {
            specId: spec.id,
            versionNumber: 1,
            parentVersionId: null,
            json: parsed,
            label: 'verify-llm-pipeline',
          },
        });
        await tx.spec.update({
          where: { id: spec.id },
          data: { currentVersionId: version.id },
        });
        return spec;
      });
      log('info', `Created spec ${created.id} (${endpointCount} endpoints) for verification`);
      target = {
        id: created.id,
        name: created.name,
        workspaceId: created.workspaceId,
        analysisStatus: 'pending',
        endpointCount,
      };
    } else {
      log('info', 'OpenWeatherMap fixture not on disk — falling back to existing spec');
      const fallback = await prisma.spec.findFirst({
        where: { analysisStatus: { in: ['pending', 'failed'] } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          workspaceId: true,
          analysisStatus: true,
          endpointCount: true,
        },
      });
      if (!fallback) {
        log(
          'skip',
          'No pending/failed specs in DB — create one via /specs/new first. AC #11 checks above passed.',
        );
        return failures > 0 ? 1 : 0;
      }
      target = fallback;
    }
    log(
      'info',
      `Target: ${target.name} (id=${target.id}, status=${target.analysisStatus}, endpoints=${target.endpointCount})`,
    );

    // Reset to 'pending' so the test is deterministic regardless of prior state.
    await prisma.spec.update({
      where: { id: target.id },
      data: { analysisStatus: 'pending', analysisError: null },
    });

    const beforeFindings = await prisma.finding.count({
      where: { specId: target.id },
    });
    const beforeLLMCalls = await prisma.lLMCall.count({
      where: { specId: target.id },
    });

    // ---- AC #12 — POST with correct secret returns 202 ----------------------
    log('info', 'AC #12: POST /api/internal/analyze with correct secret');
    const t0 = Date.now();
    const triggerRes = await fetch(`${BASE_URL}/api/internal/analyze`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ specId: target.id }),
    });
    if (triggerRes.status !== 202) {
      const text = await triggerRes.text();
      log('fail', `expected 202, got ${triggerRes.status} — ${text}`);
      failures++;
      return 1;
    }
    log('pass', '202 returned (fire-and-forget)');

    // ---- Poll the spec until completed/failed -------------------------------
    log('info', 'Polling Spec.analysisStatus (3s interval, 5min timeout)');
    let final: { analysisStatus: string; analysisError: string | null; qualityScore: number | null; lastAnalyzedAt: Date | null } | null = null;
    while (Date.now() - t0 < POLL_TIMEOUT_MS) {
      const cur = await prisma.spec.findUnique({
        where: { id: target.id },
        select: {
          analysisStatus: true,
          analysisError: true,
          qualityScore: true,
          lastAnalyzedAt: true,
        },
      });
      if (!cur) {
        log('fail', 'Spec disappeared mid-analysis');
        failures++;
        return 1;
      }
      if (cur.analysisStatus === 'completed' || cur.analysisStatus === 'failed') {
        final = cur;
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    if (!final) {
      log('fail', `Polling timed out after ${POLL_TIMEOUT_MS / 1000}s`);
      failures++;
      return 1;
    }

    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
    if (final.analysisStatus === 'failed') {
      log('fail', `Analysis failed after ${elapsedSec}s: ${final.analysisError}`);
      failures++;
      return 1;
    }
    log('pass', `Analysis completed in ${elapsedSec}s`);

    // ---- AC #2 / #3 — verify Spec fields ------------------------------------
    log('info', 'AC #2/#3: verify Spec.analysisStatus + qualityScore + lastAnalyzedAt');
    if (final.analysisStatus !== 'completed') {
      log('fail', `analysisStatus = ${final.analysisStatus}, expected 'completed'`);
      failures++;
    } else if (typeof final.qualityScore !== 'number') {
      log('fail', `qualityScore not set (got ${final.qualityScore})`);
      failures++;
    } else if (final.qualityScore < 0 || final.qualityScore > 100) {
      log('fail', `qualityScore out of range: ${final.qualityScore}`);
      failures++;
    } else if (!final.lastAnalyzedAt) {
      log('fail', 'lastAnalyzedAt not set');
      failures++;
    } else {
      log(
        'pass',
        `qualityScore=${final.qualityScore}, lastAnalyzedAt=${final.lastAnalyzedAt.toISOString()}`,
      );
    }

    // ---- AC #2 — at least 1 Finding row created -----------------------------
    const findings = await prisma.finding.findMany({
      where: { specId: target.id, status: 'open' },
      select: {
        id: true,
        scope: true,
        severity: true,
        category: true,
        title: true,
        affectedEndpoints: true,
        patchOps: true,
        rationale: true,
        narration: true,
        patchSummary: true,
        specVersionId: true,
        status: true,
      },
    });
    log('info', 'AC #2: verify Finding rows created');
    if (findings.length === 0) {
      log('fail', '0 findings created — expected ≥1 for a real spec');
      failures++;
    } else {
      log('pass', `${findings.length} findings created (delta: ${findings.length - beforeFindings})`);
    }

    // ---- AC #3 — verify Finding shape ---------------------------------------
    if (findings.length > 0) {
      log('info', 'AC #3: verify Finding field shapes');
      const f = findings[0];
      const checks = [
        ['scope', ['spec', 'endpoint'].includes(f.scope)],
        ['severity', ['critical', 'high', 'medium', 'low'].includes(f.severity)],
        ['category', ['clarity', 'design', 'risk'].includes(f.category)],
        ['status', f.status === 'open'],
        ['title nonempty', typeof f.title === 'string' && f.title.length > 0],
        ['narration ≥200', typeof f.narration === 'string' && f.narration.length >= 200],
        ['rationale ≥50', typeof f.rationale === 'string' && f.rationale.length >= 50],
        ['patchSummary ≤120', typeof f.patchSummary === 'string' && f.patchSummary.length <= 120],
        ['affectedEndpoints is array', Array.isArray(f.affectedEndpoints)],
        ['patchOps is array', Array.isArray(f.patchOps)],
        ['specVersionId set', typeof f.specVersionId === 'string'],
      ] as const;
      for (const [name, ok] of checks) {
        if (ok) log('pass', `  ${name}`);
        else {
          log('fail', `  ${name}`);
          failures++;
        }
      }

      // Severity distribution.
      const dist = findings.reduce(
        (acc, x) => {
          acc[x.severity] = (acc[x.severity] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      log(
        'info',
        `Severity distribution: ${Object.entries(dist)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}`,
      );
    }

    // ---- LLMCall row created -------------------------------------------------
    log('info', 'verify LLMCall row written for this analysis');
    const llmCalls = await prisma.lLMCall.findMany({
      where: { specId: target.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    if (llmCalls.length <= beforeLLMCalls) {
      log('fail', 'No new LLMCall row created');
      failures++;
    } else {
      const latest = llmCalls[0];
      log(
        'pass',
        `LLMCall: status=${latest.status}, tokensIn=${latest.tokensIn}, tokensOut=${latest.tokensOut}, costUSD=$${latest.costUSD.toFixed(4)}, durationMs=${latest.durationMs}`,
      );
      if (latest.status !== 'success') {
        log('fail', `Expected status=success, got ${latest.status}`);
        failures++;
      }
      if (latest.tokensIn <= 0 || latest.tokensOut <= 0) {
        log('fail', 'Token counts are zero or negative');
        failures++;
      }
      if (latest.costUSD <= 0) {
        log('fail', 'costUSD is zero or negative');
        failures++;
      }
      // prompt audit shape
      const prompt = latest.prompt as Record<string, unknown>;
      const promptChecks = [
        ['systemPromptHash', typeof prompt.systemPromptHash === 'string'],
        ['systemPromptVersion', prompt.systemPromptVersion === 'v4'],
        ['userPromptPreamble', typeof prompt.userPromptPreamble === 'string'],
        ['specName', typeof prompt.specName === 'string'],
        ['specSizeBytes', typeof prompt.specSizeBytes === 'number'],
        ['specEndpointCount', typeof prompt.specEndpointCount === 'number'],
      ] as const;
      for (const [name, ok] of promptChecks) {
        if (ok) log('pass', `  prompt.${name}`);
        else {
          log('fail', `  prompt.${name}`);
          failures++;
        }
      }
    }

    // ---- Cleanup: delete the verification spec (cascades to findings) -------
    if (target.name.startsWith('[verify-llm-pipeline]')) {
      log('info', 'Cleaning up verification spec');
      await prisma.spec.delete({ where: { id: target.id } });
      // LLMCall has no FK; rows persist as audit. That's by design.
    }

    log('info', '=== Verification complete ===');
    if (failures === 0) {
      log('pass', 'All Epic 04 verifications passed.');
      return 0;
    }
    log('fail', `${failures} failure(s).`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('verify-llm-pipeline crashed:', err);
    process.exit(2);
  });
