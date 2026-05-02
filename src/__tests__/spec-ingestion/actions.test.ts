/**
 * Vitest tests for the four Epic 03 server actions.
 *
 * All external dependencies (prisma, getRequiredSession, fetch,
 * checkWorkspaceRateLimit, validateAndDereference) are mocked so tests are
 * hermetic — no DB, no network. The real openweathermap fixture is used only
 * as a JSON payload for the mocked fetch responses; we don't actually run
 * SwaggerParser against it (that's covered in `validate-spec.test.ts`).
 *
 * Mocks the swagger-parser dereference call to a no-op (returns its input)
 * because the validation logic is exercised separately. A handful of tests
 * intercept that mock to drive specific error branches.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (must be declared before importing the module under test) ------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    spec: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    specVersion: {
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    workspaceActionLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/session', () => ({
  getRequiredSession: vi.fn(),
}));

vi.mock('@/lib/rate-limit-workspace', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rate-limit-workspace')>(
    '@/lib/rate-limit-workspace',
  );
  return {
    ...actual,
    checkWorkspaceRateLimit: vi.fn(),
    recordWorkspaceAction: vi.fn(),
  };
});

vi.mock('@/lib/spec-ingestion/validate-spec', async () => {
  const actual = await vi.importActual<typeof import('@/lib/spec-ingestion/validate-spec')>(
    '@/lib/spec-ingestion/validate-spec',
  );
  return {
    ...actual,
    // No-op dereference: returns the input unchanged. Individual tests
    // override via `vi.mocked(validateAndDereference).mockResolvedValueOnce(...)`.
    validateAndDereference: vi.fn(async (json: unknown) => ({
      ok: true,
      dereferenced: json,
    })),
  };
});

// ---- Imports (after mocks) -------------------------------------------------

import {
  addSpecFromUrlAction,
  deleteSpecAction,
  loadSampleSpecAction,
  repullSpecAction,
} from '@/app/(app)/specs/actions';
import { prisma } from '@/lib/prisma';
import {
  checkWorkspaceRateLimit,
  recordWorkspaceAction,
} from '@/lib/rate-limit-workspace';
import { getRequiredSession } from '@/lib/session';
import { validateAndDereference } from '@/lib/spec-ingestion/validate-spec';

// ---- Helpers ---------------------------------------------------------------

const OPENWEATHERMAP_PATH = resolve(
  __dirname,
  '../../../openapi-examples/openweathermap/spec.json',
);
function readOpenWeatherSpec(): Record<string, unknown> {
  return JSON.parse(readFileSync(OPENWEATHERMAP_PATH, 'utf8')) as Record<
    string,
    unknown
  >;
}

function mockFetchResponse(init: {
  status?: number;
  statusText?: string;
  body?: string;
  contentType?: string | null;
}) {
  const response = new Response(init.body ?? '', {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: init.contentType
      ? { 'content-type': init.contentType }
      : undefined,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response));
}

/**
 * Wire `prisma.$transaction` to invoke its callback with a fresh `tx` that
 * mirrors the surface used by the actions. The latest `tx` is exposed at
 * `(prisma.$transaction as any).__lastTx` for assertions.
 */
function setupTransactionMock(opts?: {
  specId?: string;
  versionId?: string;
  versionMaxNumber?: number;
}) {
  const specId = opts?.specId ?? 'spec-id-1';
  const versionId = opts?.versionId ?? 'version-id-1';
  const versionMaxNumber = opts?.versionMaxNumber;

  vi.mocked(prisma.$transaction).mockImplementation(async (cb: unknown) => {
    const tx = {
      spec: {
        create: vi.fn(async (args: unknown) => ({
          id: specId,
          ...((args as { data: Record<string, unknown> }).data),
        })),
        update: vi.fn(async (args: unknown) => args),
      },
      specVersion: {
        create: vi.fn(async (args: unknown) => ({
          id: versionId,
          ...((args as { data: Record<string, unknown> }).data),
        })),
        aggregate: vi.fn(async () => ({
          _max: { versionNumber: versionMaxNumber ?? null },
        })),
      },
      finding: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).__lastTx = tx;
    return await (cb as (t: typeof tx) => Promise<unknown>)(tx);
  });
}

function getLastTx() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.$transaction as any).__lastTx as {
    spec: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    specVersion: {
      create: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
    };
    finding: {
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();

  // Default happy-path mocks. Individual tests override.
  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-id-1',
    workspaceId: 'workspace-id-1',
    email: 'alice@example.com',
  });
  vi.mocked(checkWorkspaceRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(recordWorkspaceAction).mockResolvedValue(undefined);
  // Default validateAndDereference returns its input verbatim. Override with
  // mockResolvedValueOnce per test where a different shape is needed.
  vi.mocked(validateAndDereference).mockImplementation(async (json: unknown) => ({
    ok: true,
    dereferenced: json,
  }));
});

// =====================================================================
// addSpecFromUrlAction
// =====================================================================

describe('addSpecFromUrlAction', () => {
  it('happy path — creates Spec + initial SpecVersion, links currentVersionId, records action (AC #2, #3)', async () => {
    const spec = readOpenWeatherSpec();
    mockFetchResponse({
      body: JSON.stringify(spec),
      contentType: 'application/json',
    });
    setupTransactionMock();

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/openweathermap.json',
    });

    expect(result).toMatchObject({ success: true, specId: 'spec-id-1' });

    // Recorded the URL-pull action.
    expect(recordWorkspaceAction).toHaveBeenCalledWith(
      'workspace-id-1',
      'url_pull',
    );

    // Transaction surface checks.
    const tx = getLastTx();
    expect(tx.spec.create).toHaveBeenCalledTimes(1);
    const specCreateArgs = tx.spec.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(specCreateArgs.data).toMatchObject({
      workspaceId: 'workspace-id-1',
      sourceType: 'url',
      sourceUrl: 'https://example.com/openweathermap.json',
      sourceFormat: 'json',
      wasAuthedPull: false,
      analysisStatus: 'pending',
    });
    expect(specCreateArgs.data.endpointCount).toBe(1); // openweathermap has 1 endpoint
    expect(specCreateArgs.data.originalJson).toBeDefined();
    expect(specCreateArgs.data.currentJson).toBeDefined();
    // CRITICAL: authHeader must NOT appear in the persisted payload.
    expect(specCreateArgs.data).not.toHaveProperty('authHeader');

    // SpecVersion shape.
    expect(tx.specVersion.create).toHaveBeenCalledTimes(1);
    const versionCreateArgs = tx.specVersion.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(versionCreateArgs.data).toMatchObject({
      specId: 'spec-id-1',
      versionNumber: 1,
      parentVersionId: null,
      label: 'Initial pull from URL',
    });

    // Spec.update sets currentVersionId.
    expect(tx.spec.update).toHaveBeenCalledTimes(1);
    expect(tx.spec.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'spec-id-1' },
      data: { currentVersionId: 'version-id-1' },
    });
  });

  it('passes the auth header to fetch but does NOT persist it (AC #5)', async () => {
    const spec = readOpenWeatherSpec();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(spec), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    setupTransactionMock();

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/spec.json',
      authHeader: 'Bearer xyz',
    });
    expect(result.success).toBe(true);

    // The Authorization header was sent on the wire.
    // (Note: the analyze-trigger fire-and-forget also calls fetch, so we
    //  inspect calls[0] specifically — the spec pull is the first call.)
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toBe('https://example.com/spec.json');
    const init = callArgs[1] as RequestInit;
    expect(init.headers).toEqual({ Authorization: 'Bearer xyz' });

    // The persisted Spec row sets `wasAuthedPull = true` and does NOT contain
    // any `authHeader` field.
    const tx = getLastTx();
    const specCreateArgs = tx.spec.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(specCreateArgs.data.wasAuthedPull).toBe(true);
    expect(specCreateArgs.data).not.toHaveProperty('authHeader');
    // Defensive: stringify the persisted row and assert "Bearer xyz" never
    // appears anywhere.
    expect(JSON.stringify(specCreateArgs.data)).not.toContain('Bearer xyz');
  });

  it('http_error 401 — returns error, no Spec created (AC #4)', async () => {
    mockFetchResponse({ status: 401, statusText: 'Unauthorized', body: '' });

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/spec.json',
    });

    expect(result).toEqual({
      success: false,
      error: { kind: 'http_error', status: 401, statusText: 'Unauthorized' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('YAML spec — sourceFormat is yaml (AC #6)', async () => {
    const yamlBody = [
      'openapi: 3.0.1',
      'info:',
      '  title: YAML Spec',
      "  version: '1'",
      'paths:',
      '  /x:',
      '    get:',
      '      responses:',
      "        '200':",
      '          description: ok',
    ].join('\n');
    mockFetchResponse({
      body: yamlBody,
      contentType: 'application/yaml',
    });
    setupTransactionMock();

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/spec',
    });
    expect(result.success).toBe(true);

    const tx = getLastTx();
    const specCreateArgs = tx.spec.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(specCreateArgs.data.sourceFormat).toBe('yaml');
  });

  it('Swagger 2.0 — rejects with unsupported_swagger_2 (AC #7)', async () => {
    const swagger2 = {
      swagger: '2.0',
      info: { title: 'Old', version: '1' },
      paths: {},
    };
    mockFetchResponse({
      body: JSON.stringify(swagger2),
      contentType: 'application/json',
    });

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/swagger.json',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('unsupported_swagger_2');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('invalid OpenAPI — returns invalid_openapi from validator (AC #8)', async () => {
    const spec = readOpenWeatherSpec();
    mockFetchResponse({
      body: JSON.stringify(spec),
      contentType: 'application/json',
    });
    vi.mocked(validateAndDereference).mockResolvedValueOnce({
      ok: false,
      error: { kind: 'invalid_openapi', issues: ['issue 1', 'issue 2'] },
    });

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/bad.json',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('invalid_openapi');
    if (result.error.kind !== 'invalid_openapi') return;
    expect(result.error.issues).toEqual(['issue 1', 'issue 2']);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('external $refs — returns external_refs_unsupported (AC #9)', async () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(__dirname, './external-ref-fixture.json'),
        'utf8',
      ),
    );
    mockFetchResponse({
      body: JSON.stringify(fixture),
      contentType: 'application/json',
    });

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/external.json',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('external_refs_unsupported');
    if (result.error.kind !== 'external_refs_unsupported') return;
    expect(result.error.issues).toContain(
      'https://example.com/schemas/Thing.json#/Thing',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('too large (6 MB body) — rejects with too_large (AC #10)', async () => {
    // Build a 6 MB body. Use valid JSON envelope so we don't trip parse first.
    const padding = 'x'.repeat(6 * 1024 * 1024);
    const body = JSON.stringify({
      openapi: '3.0.1',
      info: { title: 'Big', version: '1', description: padding },
      paths: {},
    });
    mockFetchResponse({
      body,
      contentType: 'application/json',
    });

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/big.json',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('too_large');
    if (result.error.kind !== 'too_large') return;
    expect(result.error.limitMB).toBe(5);
    expect(result.error.sizeMB).toBeGreaterThan(5);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('too many endpoints (250) — rejects with too_many_endpoints (AC #11)', async () => {
    // Build a 250-endpoint spec programmatically.
    const paths: Record<string, unknown> = {};
    for (let i = 0; i < 250; i++) {
      paths[`/p${i}`] = {
        get: { responses: { '200': { description: 'ok' } } },
      };
    }
    const spec = {
      openapi: '3.0.1',
      info: { title: 'Huge', version: '1' },
      paths,
    };
    mockFetchResponse({
      body: JSON.stringify(spec),
      contentType: 'application/json',
    });

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/huge.json',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('too_many_endpoints');
    if (result.error.kind !== 'too_many_endpoints') return;
    expect(result.error.count).toBe(250);
    expect(result.error.limit).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('soft-warn many endpoints (120) — success with warning=large_spec (AC #12)', async () => {
    const paths: Record<string, unknown> = {};
    for (let i = 0; i < 120; i++) {
      paths[`/p${i}`] = {
        get: { responses: { '200': { description: 'ok' } } },
      };
    }
    const spec = {
      openapi: '3.0.1',
      info: { title: 'Mid-size', version: '1' },
      paths,
    };
    mockFetchResponse({
      body: JSON.stringify(spec),
      contentType: 'application/json',
    });
    setupTransactionMock();

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/mid.json',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.warning).toBe('large_spec');
    expect(result.warningReasons).toContain('many_endpoints');
    expect(result.warningReasons).not.toContain('large_size');
    // Spec was persisted.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('soft-warn large size (1.5 MB / 50 endpoints) — success with large_size warning (AC #12a)', async () => {
    const paths: Record<string, unknown> = {};
    // 50 endpoints, each padded with junk in the description so the body
    // crosses the 1 MB threshold.
    const padding = 'x'.repeat(30_000); // 30 KB per endpoint × 50 = 1.5 MB
    for (let i = 0; i < 50; i++) {
      paths[`/p${i}`] = {
        get: {
          description: padding,
          responses: { '200': { description: 'ok' } },
        },
      };
    }
    const spec = {
      openapi: '3.0.1',
      info: { title: 'Wide-size', version: '1' },
      paths,
    };
    const body = JSON.stringify(spec);
    expect(body.length).toBeGreaterThan(1_000_000); // sanity: must cross 1 MB
    expect(body.length).toBeLessThan(5 * 1024 * 1024); // and below hard cap
    mockFetchResponse({
      body,
      contentType: 'application/json',
    });
    setupTransactionMock();

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/wide.json',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.warning).toBe('large_spec');
    expect(result.warningReasons).toContain('large_size');
    // 50 endpoints is below the soft-warn endpoint threshold (100).
    expect(result.warningReasons).not.toContain('many_endpoints');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rate limit exceeded — returns rate_limited, still records action, no Spec (AC #13)', async () => {
    const retryAt = new Date(Date.now() + 30 * 60 * 1000);
    vi.mocked(checkWorkspaceRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAt,
    });

    const result = await addSpecFromUrlAction({
      url: 'https://example.com/spec.json',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toEqual({
      kind: 'rate_limited',
      retryAt: retryAt.toISOString(),
    });
    // Per spec convention: every attempt counts.
    expect(recordWorkspaceAction).toHaveBeenCalledWith(
      'workspace-id-1',
      'url_pull',
    );
    // No Spec persisted.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// =====================================================================
// repullSpecAction
// =====================================================================

describe('repullSpecAction', () => {
  it('happy path on a URL-sourced non-authed spec — creates new SpecVersion (AC #14)', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValueOnce({
      id: 'spec-id-1',
      workspaceId: 'workspace-id-1',
      sourceType: 'url',
      sourceUrl: 'https://example.com/spec.json',
      wasAuthedPull: false,
      currentVersionId: 'version-id-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const spec = readOpenWeatherSpec();
    mockFetchResponse({
      body: JSON.stringify(spec),
      contentType: 'application/json',
    });
    setupTransactionMock({
      specId: 'spec-id-1',
      versionId: 'version-id-2',
      versionMaxNumber: 1,
    });

    const result = await repullSpecAction({ specId: 'spec-id-1' });

    expect(result).toEqual({ success: true, newVersionId: 'version-id-2' });

    const tx = getLastTx();
    // New SpecVersion with versionNumber=2 + 'Re-pulled from URL' label.
    expect(tx.specVersion.create).toHaveBeenCalledTimes(1);
    const versionArgs = tx.specVersion.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(versionArgs.data).toMatchObject({
      specId: 'spec-id-1',
      versionNumber: 2,
      parentVersionId: 'version-id-1',
      label: 'Re-pulled from URL',
    });

    // Spec.update sets currentJson + currentVersionId + analysisStatus='pending'.
    expect(tx.spec.update).toHaveBeenCalledTimes(1);
    const updateArgs = tx.spec.update.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(updateArgs.where).toEqual({ id: 'spec-id-1' });
    expect(updateArgs.data).toMatchObject({
      currentVersionId: 'version-id-2',
      analysisStatus: 'pending',
    });
    expect(updateArgs.data.currentJson).toBeDefined();
  });

  it('rejects sourceType=sample with not_repullable / sample (AC #15)', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValueOnce({
      id: 'spec-id-1',
      workspaceId: 'workspace-id-1',
      sourceType: 'sample',
      sourceUrl: 'apiq:sample/openweathermap',
      wasAuthedPull: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await repullSpecAction({ specId: 'spec-id-1' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_repullable', reason: 'sample' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects wasAuthedPull=true with not_repullable / authed_pull (AC #15)', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValueOnce({
      id: 'spec-id-1',
      workspaceId: 'workspace-id-1',
      sourceType: 'url',
      sourceUrl: 'https://example.com/spec.json',
      wasAuthedPull: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await repullSpecAction({ specId: 'spec-id-1' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_repullable', reason: 'authed_pull' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cross-workspace — returns not_found', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValueOnce({
      id: 'spec-id-1',
      workspaceId: 'other-workspace',
      sourceType: 'url',
      sourceUrl: 'https://example.com/spec.json',
      wasAuthedPull: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await repullSpecAction({ specId: 'spec-id-1' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_found' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns not_found when the spec does not exist', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValueOnce(null);

    const result = await repullSpecAction({ specId: 'nonexistent' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_found' },
    });
  });
});

// =====================================================================
// loadSampleSpecAction
// =====================================================================

describe('loadSampleSpecAction', () => {
  it('happy path — sampleId="openweathermap" reads from disk and persists', async () => {
    setupTransactionMock();

    const result = await loadSampleSpecAction({ sampleId: 'openweathermap' });

    expect(result).toMatchObject({ success: true, specId: 'spec-id-1' });

    const tx = getLastTx();
    const specCreateArgs = tx.spec.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(specCreateArgs.data).toMatchObject({
      sourceType: 'sample',
      sourceUrl: 'apiq:sample/openweathermap',
      sourceFormat: 'json',
      wasAuthedPull: false,
      analysisStatus: 'pending',
    });
    // Spec name should be the OpenAPI title from the file.
    expect(specCreateArgs.data.name).toBe('OpenWeatherMap API');
  });

  it('unknown sampleId — returns unknown_sample for "pagerduty"', async () => {
    const result = await loadSampleSpecAction({ sampleId: 'pagerduty' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'unknown_sample', sampleId: 'pagerduty' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('unknown sampleId — returns unknown_sample for "stripe"', async () => {
    const result = await loadSampleSpecAction({ sampleId: 'stripe' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'unknown_sample', sampleId: 'stripe' },
    });
  });
});

// =====================================================================
// deleteSpecAction
// =====================================================================

describe('deleteSpecAction', () => {
  it('happy path — deletes the spec by id (AC #16)', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValueOnce({
      workspaceId: 'workspace-id-1',
    } as Awaited<ReturnType<typeof prisma.spec.findUnique>>);
    vi.mocked(prisma.spec.delete).mockResolvedValueOnce(
      { id: 'spec-id-1' } as Awaited<ReturnType<typeof prisma.spec.delete>>,
    );

    const result = await deleteSpecAction({ specId: 'spec-id-1' });

    expect(result).toEqual({ success: true });
    expect(prisma.spec.delete).toHaveBeenCalledWith({
      where: { id: 'spec-id-1' },
    });
  });

  it('cross-workspace — returns not_found, no delete', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValueOnce({
      workspaceId: 'other-workspace',
    } as Awaited<ReturnType<typeof prisma.spec.findUnique>>);

    const result = await deleteSpecAction({ specId: 'spec-id-1' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_found' },
    });
    expect(prisma.spec.delete).not.toHaveBeenCalled();
  });

  it('not found — returns not_found, no delete', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValueOnce(null);

    const result = await deleteSpecAction({ specId: 'nonexistent' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_found' },
    });
    expect(prisma.spec.delete).not.toHaveBeenCalled();
  });
});
