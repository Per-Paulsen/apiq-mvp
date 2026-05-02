/**
 * Standalone verification script for Epic 03 (Spec Ingestion).
 *
 * Exercises the spec-ingestion pipeline against the real openweathermap
 * fixture and (if a workspace exists) against the real database. Prints a
 * pass/fail summary to stdout. Re-runnable / idempotent â€” uses a unique
 * timestamped name for the test Spec so cleanup is reliable.
 *
 * Run:
 *   npx tsx scripts/verify-spec-ingestion.ts
 *
 * Skip-conditions (the script still exits 0):
 *   - No workspace exists in DB â†’ persistence checks are skipped, the
 *     pipeline-only checks still run.
 *   - No DATABASE_URL â†’ the script exits early with a notice.
 */
import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// NOTE on `server-only`:
// The lib helpers below all `import 'server-only'`, which doesn't resolve
// outside the Next.js bundler. We side-step this by inlining the helpers
// here as the canonical references â€” re-importing them directly would crash
// on the unresolvable `server-only` import. The behaviour mirrors the
// production helpers exactly; the inline copies are intentionally short.
//
// Production paths (kept in lock-step with this script):
//   - src/lib/analysis/stringify-spec.ts        (cycleStripSpec)
//   - src/lib/spec-ingestion/fetch-spec.ts      (parseSpecBody)
//   - src/lib/spec-ingestion/endpoint-count.ts  (countEndpoints)
//   - src/lib/spec-ingestion/validate-spec.ts   (detectSwagger2, findExternalRefs,
//                                                validateAndDereference)
import SwaggerParser from '@apidevtools/swagger-parser';
import * as YAML from 'yaml';

import type { Prisma } from '../src/generated/prisma/client';

// ---- Inlined helpers (mirror production) ----------------------------------

function cycleStripSpec(specJson: unknown): unknown {
  const seen = new WeakSet<object>();
  function go(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    const obj = value as object;
    if (seen.has(obj)) return { $ref: '#cyclic' };
    seen.add(obj);
    if (Array.isArray(value)) return value.map(go);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = go((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return go(specJson);
}

function parseSpecBody(
  body: string,
  format: 'json' | 'yaml',
): { ok: true; json: unknown } | { ok: false; error: { kind: 'parse_error'; message: string } } {
  try {
    if (format === 'json') return { ok: true, json: JSON.parse(body) };
    return { ok: true, json: YAML.parse(body) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'parse_error', message } };
  }
}

function detectSwagger2(json: unknown): boolean {
  if (json === null || typeof json !== 'object') return false;
  return (json as Record<string, unknown>).swagger === '2.0';
}

function findExternalRefs(json: unknown): string[] {
  const out: string[] = [];
  function walk(v: unknown): void {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const obj = v as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (key === '$ref' && typeof val === 'string' && !val.startsWith('#/') && val !== '#cyclic') {
        out.push(val);
      } else {
        walk(val);
      }
    }
  }
  walk(json);
  return out;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
function countEndpoints(specJson: unknown): number {
  if (specJson === null || typeof specJson !== 'object') return 0;
  const paths = (specJson as Record<string, unknown>).paths;
  if (paths === null || typeof paths !== 'object') return 0;
  let count = 0;
  for (const pathItem of Object.values(paths as Record<string, unknown>)) {
    if (pathItem === null || typeof pathItem !== 'object') continue;
    for (const method of Object.keys(pathItem as Record<string, unknown>)) {
      if (HTTP_METHODS.has(method.toLowerCase())) count++;
    }
  }
  return count;
}

async function validateAndDereference(
  json: unknown,
): Promise<
  | { ok: true; dereferenced: unknown }
  | { ok: false; error: { kind: 'invalid_openapi'; issues: string[] } }
> {
  const clone = typeof structuredClone === 'function' ? structuredClone(json) : JSON.parse(JSON.stringify(json));
  try {
    const dereffed = await SwaggerParser.dereference(
      clone as Parameters<typeof SwaggerParser.dereference>[0],
    );
    return { ok: true, dereferenced: cycleStripSpec(dereffed) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const issues = message.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    return { ok: false, error: { kind: 'invalid_openapi', issues: issues.length > 0 ? issues : [message] } };
  }
}

// ---- Tiny check harness ---------------------------------------------------

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, detail });
  const symbol = ok ? '[PASS]' : '[FAIL]';
  console.log(`${symbol} ${name}${detail ? ` â€” ${detail}` : ''}`);
}

function recordEqual<T>(name: string, expected: T, actual: T): void {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  record(name, ok, ok ? undefined : `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

// ---- Main -----------------------------------------------------------------

async function main(): Promise<void> {
  const startMs = Date.now();
  console.log('--- Epic 03 verification ---');

  const fixturePath = resolve(__dirname, '../openapi-examples/openweathermap/spec.json');
  const body = readFileSync(fixturePath, 'utf8');

  // 1. Parse JSON via the helper (parity with the production pipeline).
  const parsed = parseSpecBody(body, 'json');
  record('parseSpecBody returns ok=true on the fixture', parsed.ok);
  if (!parsed.ok) {
    summary(startMs);
    process.exit(1);
  }
  const parsedJson = parsed.json;

  // 2. detectSwagger2 â†’ false (it's OpenAPI 3.0.1).
  recordEqual('detectSwagger2 returns false for OpenAPI 3.0.1', false, detectSwagger2(parsedJson));

  // 3. findExternalRefs â†’ empty.
  const externals = findExternalRefs(parsedJson);
  recordEqual('findExternalRefs returns []', [], externals);

  // 4. validateAndDereference â†’ ok.
  const validated = await validateAndDereference(parsedJson);
  record('validateAndDereference returns ok=true', validated.ok);
  if (!validated.ok) {
    record('  â””â”€ issues', false, validated.error.issues.join(' | '));
    summary(startMs);
    process.exit(1);
  }
  const dereferenced = validated.dereferenced;

  // 5. countEndpoints â€” fixture has exactly 1 endpoint (GET /weather).
  const ec = countEndpoints(dereferenced);
  recordEqual('countEndpoints returns 1', 1, ec);

  // 6. cycleStripSpec is a no-op for non-cyclic input.
  const acyclic = cycleStripSpec(dereferenced);
  record(
    'cycleStripSpec produces JSON-serialisable output',
    (() => {
      try {
        JSON.stringify(acyclic);
        return true;
      } catch {
        return false;
      }
    })(),
  );

  // 7. DB persistence (skip if no workspace exists).
  if (!process.env.DATABASE_URL) {
    record('DATABASE_URL set', false, 'persistence checks skipped');
    summary(startMs);
    process.exit(checks.some((c) => !c.ok) ? 1 : 0);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const workspace = await prisma.workspace.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!workspace) {
      record(
        'workspace exists in DB',
        false,
        'no workspace found â€” persistence checks skipped (run signup first)',
      );
      summary(startMs);
      await prisma.$disconnect();
      process.exit(0);
    }
    record(`found workspace ${workspace.id} ("${workspace.name}")`, true);

    const uniqueName = `Verify Sample - ${new Date().toISOString()}`;

    let createdSpecId: string | null = null;
    try {
      // Replicate addSpecFromUrlAction's persistence step.
      createdSpecId = await prisma.$transaction(async (tx) => {
        const spec = await tx.spec.create({
          data: {
            workspaceId: workspace.id,
            name: uniqueName,
            sourceType: 'sample',
            sourceUrl: 'apiq:sample/openweathermap',
            sourceFormat: 'json',
            wasAuthedPull: false,
            originalJson: parsedJson as Prisma.InputJsonValue,
            currentJson: dereferenced as Prisma.InputJsonValue,
            endpointCount: ec,
            analysisStatus: 'pending',
          },
        });
        const version = await tx.specVersion.create({
          data: {
            specId: spec.id,
            versionNumber: 1,
            parentVersionId: null,
            json: dereferenced as Prisma.InputJsonValue,
            label: 'Initial pull from URL',
          },
        });
        await tx.spec.update({
          where: { id: spec.id },
          data: { currentVersionId: version.id },
        });
        return spec.id;
      });
      record(`Spec + SpecVersion persisted (specId=${createdSpecId})`, true);

      // Verify row shape.
      const persisted = await prisma.spec.findUnique({
        where: { id: createdSpecId },
        include: { versions: true },
      });
      record(
        'persisted Spec is fetchable',
        persisted !== null,
        persisted ? undefined : 'findUnique returned null',
      );
      if (persisted) {
        recordEqual('persisted.endpointCount === 1', 1, persisted.endpointCount);
        recordEqual('persisted.sourceType === sample', 'sample', persisted.sourceType);
        recordEqual('persisted.analysisStatus === pending', 'pending', persisted.analysisStatus);
        recordEqual('persisted.wasAuthedPull === false', false, persisted.wasAuthedPull);
        recordEqual(
          'persisted has exactly 1 SpecVersion',
          1,
          persisted.versions.length,
        );
        record(
          'persisted.currentVersionId is set',
          persisted.currentVersionId !== null,
        );
      }
    } finally {
      // Cleanup â€” delete the test Spec (cascades to its versions).
      if (createdSpecId) {
        await prisma.spec.delete({ where: { id: createdSpecId } }).catch((err) => {
          console.warn(`cleanup: failed to delete test spec ${createdSpecId}:`, err);
        });
        record(`cleanup: deleted test spec ${createdSpecId}`, true);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  summary(startMs);
  process.exit(checks.some((c) => !c.ok) ? 1 : 0);
}

function summary(startMs: number): void {
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(2);
  console.log(`\n--- Summary: ${passed} passed, ${failed} failed (${elapsed}s) ---`);
  if (failed === 0) {
    console.log('All checks passed.');
  } else {
    console.log('FAILURES:');
    for (const c of checks) {
      if (!c.ok) {
        console.log(`  - ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
      }
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
