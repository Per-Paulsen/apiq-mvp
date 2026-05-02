'use server';

/**
 * Spec-ingestion server actions (Epic 03).
 *
 * Four actions:
 *   - `addSpecFromUrlAction`   — pull + validate + persist a new Spec from URL.
 *   - `repullSpecAction`       — re-fetch + create new SpecVersion for an existing Spec.
 *   - `loadSampleSpecAction`   — load a bundled sample spec (allow-list: openweathermap).
 *   - `deleteSpecAction`       — delete a Spec (cascades to SpecVersion / Finding).
 *
 * Conventions (per Epic 02 results):
 *   - `getRequiredSession()` is called first in every workspace-scoped action.
 *   - Workspace ownership is verified before any mutation.
 *   - Returns `{ success: true, ... } | { success: false, error: { kind, ... } }`.
 *   - Never throws to the client; wraps DB / network in try/catch.
 *   - Json fields are written via `Prisma.InputJsonValue` cast.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import {
  checkSpecSize,
  fetchSpecFromUrl,
  parseSpecBody,
  type SpecFormat,
} from '@/lib/spec-ingestion/fetch-spec';
import { countEndpoints } from '@/lib/spec-ingestion/endpoint-count';
import {
  detectSwagger2,
  findExternalRefs,
  validateAndDereference,
} from '@/lib/spec-ingestion/validate-spec';
import {
  checkWorkspaceRateLimit,
  ONE_HOUR_MS,
  recordWorkspaceAction,
  URL_PULL_LIMIT_PER_HOUR,
} from '@/lib/rate-limit-workspace';
import { getRequiredSession } from '@/lib/session';

// =====================================================================
// Result types
// =====================================================================

export type WarningReason = 'many_endpoints' | 'large_size';

export type AddSpecError =
  | { kind: 'rate_limited'; retryAt: string }
  | { kind: 'invalid_url'; message: string }
  | { kind: 'http_error'; status: number; statusText: string }
  | { kind: 'unknown_format'; message: string }
  | { kind: 'network_error'; message: string }
  | { kind: 'too_large'; sizeMB: number; limitMB: 5 }
  | { kind: 'parse_error'; message: string }
  | { kind: 'unsupported_swagger_2'; message: string }
  | { kind: 'external_refs_unsupported'; issues: string[] }
  | { kind: 'invalid_openapi'; issues: string[] }
  | { kind: 'too_many_endpoints'; count: number; limit: 200 }
  | { kind: 'unexpected'; message: string };

export type AddSpecResult =
  | {
      success: true;
      specId: string;
      warning?: 'large_spec';
      warningReasons?: WarningReason[];
    }
  | { success: false; error: AddSpecError };

export type RepullError =
  | { kind: 'not_found' }
  | { kind: 'not_repullable'; reason: 'sample' | 'authed_pull' }
  | AddSpecError;

export type RepullResult =
  | { success: true; newVersionId: string }
  | { success: false; error: RepullError };

export type LoadSampleError =
  | { kind: 'unknown_sample'; sampleId: string }
  | AddSpecError;

export type LoadSampleResult =
  | { success: true; specId: string }
  | { success: false; error: LoadSampleError };

export type DeleteSpecResult =
  | { success: true }
  | { success: false; error: { kind: 'not_found' } | { kind: 'unexpected'; message: string } };

// =====================================================================
// Constants
// =====================================================================

const HARD_CAP_ENDPOINTS = 200;
const SOFT_WARN_ENDPOINTS = 100;
const SOFT_WARN_SIZE_BYTES = 1_000_000; // 1 MB (decimal — spec note).
const SAMPLE_ALLOW_LIST = new Set(['openweathermap']);

// =====================================================================
// Pipeline shared between addSpecFromUrlAction / repullSpecAction
// =====================================================================

type FetchAndValidateOk = {
  ok: true;
  body: string;
  format: SpecFormat;
  parsedJson: unknown;
  dereferenced: unknown;
  endpointCount: number;
  warningReasons: WarningReason[];
  sizeBytes: number;
};
type FetchAndValidateErr = { ok: false; error: AddSpecError };

async function fetchValidateDereferenceFromUrl(
  url: string,
  authHeader: string | undefined,
): Promise<FetchAndValidateOk | FetchAndValidateErr> {
  // Fetch.
  let fetchResult: Awaited<ReturnType<typeof fetchSpecFromUrl>>;
  try {
    fetchResult = await fetchSpecFromUrl(url, authHeader);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'network_error', message } };
  }
  if (!fetchResult.ok) {
    return { ok: false, error: fetchResult.error };
  }
  const { body, format } = fetchResult;

  // Size.
  const sizeCheck = checkSpecSize(body);
  if (!sizeCheck.ok) {
    return { ok: false, error: sizeCheck.error };
  }

  // Parse.
  const parsed = parseSpecBody(body, format);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  // Validate + dereference (shared helper) — returns AddSpecError-shaped errors.
  return validateAndPersistShape({
    body,
    format,
    parsedJson: parsed.json,
    sizeBytes: sizeCheck.sizeBytes,
  });
}

function validateAndPersistShape(input: {
  body: string;
  format: SpecFormat;
  parsedJson: unknown;
  sizeBytes: number;
}): Promise<FetchAndValidateOk | FetchAndValidateErr> {
  return (async () => {
    const { body, format, parsedJson, sizeBytes } = input;

    // Swagger 2.0 reject.
    if (detectSwagger2(parsedJson)) {
      return {
        ok: false,
        error: {
          kind: 'unsupported_swagger_2',
          message:
            'Swagger 2.0 is not supported in v0.1. Convert with swagger2openapi.',
        },
      };
    }

    // External refs reject.
    const externalRefs = findExternalRefs(parsedJson);
    if (externalRefs.length > 0) {
      return {
        ok: false,
        error: { kind: 'external_refs_unsupported', issues: externalRefs },
      };
    }

    // Validate + dereference.
    const validated = await validateAndDereference(parsedJson);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }
    const dereferenced = validated.dereferenced;

    // Endpoint count + thresholds.
    const endpointCount = countEndpoints(dereferenced);
    if (endpointCount > HARD_CAP_ENDPOINTS) {
      return {
        ok: false,
        error: {
          kind: 'too_many_endpoints',
          count: endpointCount,
          limit: HARD_CAP_ENDPOINTS,
        },
      };
    }
    const warningReasons: WarningReason[] = [];
    if (endpointCount > SOFT_WARN_ENDPOINTS) warningReasons.push('many_endpoints');
    if (sizeBytes >= SOFT_WARN_SIZE_BYTES) warningReasons.push('large_size');

    return {
      ok: true,
      body,
      format,
      parsedJson,
      dereferenced,
      endpointCount,
      warningReasons,
      sizeBytes,
    };
  })();
}

// =====================================================================
// Helpers
// =====================================================================

function deriveSpecName(parsedJson: unknown, fallbackUrl: string): string {
  const info =
    parsedJson !== null && typeof parsedJson === 'object'
      ? (parsedJson as Record<string, unknown>).info
      : null;
  if (info !== null && typeof info === 'object') {
    const title = (info as Record<string, unknown>).title;
    if (typeof title === 'string' && title.trim().length > 0) return title;
  }
  // Fallback: URL pathname leaf.
  try {
    const leaf = new URL(fallbackUrl).pathname.split('/').filter(Boolean).pop();
    if (leaf) return leaf;
  } catch {
    // ignore
  }
  return 'Untitled spec';
}

function triggerAnalyzeFireAndForget(specId: string): void {
  // Epic 04 owns `/api/internal/analyze`. The route doesn't exist yet — the
  // fetch will 404, that's expected. We deliberately don't await this.
  void (async () => {
    try {
      await fetch('http://localhost:3000/api/internal/analyze', {
        method: 'POST',
        headers: {
          'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ specId }),
      });
    } catch {
      // Swallow — Epic 04 wires real failure handling on the receiver side.
    }
  })();
}

// =====================================================================
// Action: addSpecFromUrlAction
// =====================================================================

export async function addSpecFromUrlAction(input: {
  url: string;
  authHeader?: string;
}): Promise<AddSpecResult> {
  const { url, authHeader } = input;
  const session = await getRequiredSession();
  const { workspaceId } = session;

  // 1. Rate-limit check (BEFORE recording, to mirror Epic 02's signup).
  const rateCheck = await checkWorkspaceRateLimit(
    workspaceId,
    'url_pull',
    URL_PULL_LIMIT_PER_HOUR,
    ONE_HOUR_MS,
  );
  // Always record this attempt — every attempt slides the rolling window.
  await recordWorkspaceAction(workspaceId, 'url_pull');
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: { kind: 'rate_limited', retryAt: rateCheck.retryAt.toISOString() },
    };
  }

  // 2. Validate URL format.
  try {
    new URL(url);
  } catch {
    return {
      success: false,
      error: { kind: 'invalid_url', message: 'Malformed URL' },
    };
  }

  // 3. Fetch + size + parse + validate + dereference + endpoint-count.
  const result = await fetchValidateDereferenceFromUrl(url, authHeader);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  const { parsedJson, dereferenced, endpointCount, warningReasons, format } = result;

  // 4. Persist Spec + initial SpecVersion in a transaction.
  let specId: string;
  try {
    specId = await prisma.$transaction(async (tx) => {
      const spec = await tx.spec.create({
        data: {
          workspaceId,
          name: deriveSpecName(parsedJson, url),
          sourceType: 'url',
          sourceUrl: url,
          sourceFormat: format,
          wasAuthedPull: !!authHeader,
          originalJson: parsedJson as Prisma.InputJsonValue,
          currentJson: dereferenced as Prisma.InputJsonValue,
          endpointCount,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { kind: 'unexpected', message } };
  }

  // 5. Trigger analysis (fire-and-forget — Epic 04 owns the receiver).
  triggerAnalyzeFireAndForget(specId);

  return {
    success: true,
    specId,
    warning: warningReasons.length > 0 ? 'large_spec' : undefined,
    warningReasons: warningReasons.length > 0 ? warningReasons : undefined,
  };
}

// =====================================================================
// Action: repullSpecAction
// =====================================================================

export async function repullSpecAction(input: {
  specId: string;
}): Promise<RepullResult> {
  const { specId } = input;
  const session = await getRequiredSession();
  const { workspaceId } = session;

  // 1. Load + verify ownership.
  const spec = await prisma.spec.findUnique({ where: { id: specId } });
  if (!spec || spec.workspaceId !== workspaceId) {
    return { success: false, error: { kind: 'not_found' } };
  }

  // 2. Reject if not URL-sourced.
  if (spec.sourceType !== 'url') {
    return {
      success: false,
      error: { kind: 'not_repullable', reason: 'sample' },
    };
  }
  // 3. Reject if originally pulled with auth.
  if (spec.wasAuthedPull) {
    return {
      success: false,
      error: { kind: 'not_repullable', reason: 'authed_pull' },
    };
  }
  if (!spec.sourceUrl) {
    // Defensive — shouldn't happen for sourceType='url', but guard anyway.
    return {
      success: false,
      error: { kind: 'not_repullable', reason: 'sample' },
    };
  }

  // 4. Rate-limit check (re-pulls share the same bucket as URL-pulls).
  const rateCheck = await checkWorkspaceRateLimit(
    workspaceId,
    're_pull',
    URL_PULL_LIMIT_PER_HOUR,
    ONE_HOUR_MS,
  );
  await recordWorkspaceAction(workspaceId, 're_pull');
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: { kind: 'rate_limited', retryAt: rateCheck.retryAt.toISOString() },
    };
  }

  // 5. Re-run the pipeline (no auth header — only non-authed pulls are repullable).
  const result = await fetchValidateDereferenceFromUrl(spec.sourceUrl, undefined);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  const { dereferenced, endpointCount } = result;

  // 6. Transaction: new SpecVersion, update Spec, mark open Findings outdated.
  let newVersionId: string;
  try {
    newVersionId = await prisma.$transaction(async (tx) => {
      const previousMax = await tx.specVersion.aggregate({
        where: { specId: spec.id },
        _max: { versionNumber: true },
      });
      const nextNumber = (previousMax._max.versionNumber ?? 0) + 1;

      const version = await tx.specVersion.create({
        data: {
          specId: spec.id,
          parentVersionId: spec.currentVersionId,
          versionNumber: nextNumber,
          json: dereferenced as Prisma.InputJsonValue,
          label: 'Re-pulled from URL',
        },
      });

      await tx.spec.update({
        where: { id: spec.id },
        data: {
          currentJson: dereferenced as Prisma.InputJsonValue,
          currentVersionId: version.id,
          analysisStatus: 'pending',
          analysisError: null,
          endpointCount,
        },
      });

      // TODO Epic 04: invalidate open findings to outdated.
      // The `Finding` model is owned by Epic 04 and not yet generated; this
      // step is deliberately deferred until that table exists. Once Epic 04
      // lands, add:
      //   await tx.finding.updateMany({
      //     where: { specId: spec.id, status: 'open' },
      //     data: { status: 'outdated' },
      //   });

      return version.id;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { kind: 'unexpected', message } };
  }

  // 7. Trigger analysis.
  triggerAnalyzeFireAndForget(spec.id);

  return { success: true, newVersionId };
}

// =====================================================================
// Action: loadSampleSpecAction
// =====================================================================

export async function loadSampleSpecAction(input: {
  sampleId: string;
}): Promise<LoadSampleResult> {
  const { sampleId } = input;
  const session = await getRequiredSession();
  const { workspaceId } = session;

  // 1. Allow-list check.
  if (!SAMPLE_ALLOW_LIST.has(sampleId)) {
    return {
      success: false,
      error: { kind: 'unknown_sample', sampleId },
    };
  }

  // 2. Read the file from disk.
  let body: string;
  try {
    body = await fs.promises.readFile(
      path.join(process.cwd(), 'openapi-examples', sampleId, 'spec.json'),
      'utf8',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { kind: 'unexpected', message } };
  }

  // 3. Parse + validate (size check skipped — sample is known small).
  const parsed = parseSpecBody(body, 'json');
  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }
  const validated = await validateAndPersistShape({
    body,
    format: 'json',
    parsedJson: parsed.json,
    sizeBytes: Buffer.byteLength(body, 'utf8'),
  });
  if (!validated.ok) {
    return { success: false, error: validated.error };
  }
  const { parsedJson, dereferenced, endpointCount } = validated;

  // 4. Persist (sourceType='sample', synthetic sourceUrl).
  let specId: string;
  try {
    specId = await prisma.$transaction(async (tx) => {
      const spec = await tx.spec.create({
        data: {
          workspaceId,
          name: deriveSpecName(parsedJson, `apiq:sample/${sampleId}`),
          sourceType: 'sample',
          sourceUrl: `apiq:sample/${sampleId}`,
          sourceFormat: 'json',
          wasAuthedPull: false,
          originalJson: parsedJson as Prisma.InputJsonValue,
          currentJson: dereferenced as Prisma.InputJsonValue,
          endpointCount,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { kind: 'unexpected', message } };
  }

  triggerAnalyzeFireAndForget(specId);
  return { success: true, specId };
}

// =====================================================================
// Action: deleteSpecAction
// =====================================================================

export async function deleteSpecAction(input: {
  specId: string;
}): Promise<DeleteSpecResult> {
  const { specId } = input;
  const session = await getRequiredSession();
  const { workspaceId } = session;

  const spec = await prisma.spec.findUnique({
    where: { id: specId },
    select: { workspaceId: true },
  });
  if (!spec || spec.workspaceId !== workspaceId) {
    return { success: false, error: { kind: 'not_found' } };
  }

  try {
    await prisma.spec.delete({ where: { id: specId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { kind: 'unexpected', message } };
  }
  return { success: true };
}
