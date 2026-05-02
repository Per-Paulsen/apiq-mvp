/**
 * Epic 03 AC #14 wire-up — verifies that `repullSpecAction` flips open
 * Findings to `outdated` inside its transaction (deferred from Epic 03,
 * delivered by Epic 04 once the `Finding` model existed).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (must be declared before importing the module under test) ------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    spec: { findUnique: vi.fn() },
    specVersion: { create: vi.fn(), aggregate: vi.fn() },
    workspaceActionLog: { create: vi.fn(), findMany: vi.fn() },
    finding: { updateMany: vi.fn() },
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
    validateAndDereference: vi.fn(async (json: unknown) => ({
      ok: true,
      dereferenced: json,
    })),
  };
});

vi.mock('@/lib/analysis/runAnalysis', () => ({
  runAnalysis: vi.fn(async () => ({ success: true })),
}));

// ---- Imports (after mocks) -------------------------------------------------

import { repullSpecAction } from '@/app/(app)/specs/actions';
import { prisma } from '@/lib/prisma';
import {
  checkWorkspaceRateLimit,
  recordWorkspaceAction,
} from '@/lib/rate-limit-workspace';
import { getRequiredSession } from '@/lib/session';

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

function mockFetchOpenWeather() {
  const body = JSON.stringify(readOpenWeatherSpec());
  const response = new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response));
}

function setupTransactionMock() {
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: unknown) => {
    const tx = {
      spec: { update: vi.fn(async (args: unknown) => args) },
      specVersion: {
        create: vi.fn(async (args: unknown) => ({
          id: 'version-id-2',
          ...((args as { data: Record<string, unknown> }).data),
        })),
        aggregate: vi.fn(async () => ({ _max: { versionNumber: 1 } })),
      },
      finding: {
        updateMany: vi.fn(async () => ({ count: 1 })),
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
    spec: { update: ReturnType<typeof vi.fn> };
    specVersion: {
      create: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
    };
    finding: { updateMany: ReturnType<typeof vi.fn> };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();

  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-id-1',
    workspaceId: 'workspace-id-1',
    email: 'alice@example.com',
  });
  vi.mocked(checkWorkspaceRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(recordWorkspaceAction).mockResolvedValue(undefined);
});

// ---- Tests -----------------------------------------------------------------

describe('repullSpecAction wires Finding-invalidation (Epic 03 AC #14)', () => {
  it('flips open Findings to status="outdated" inside the re-pull transaction', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValueOnce({
      id: 'spec-id-1',
      workspaceId: 'workspace-id-1',
      sourceType: 'url',
      sourceUrl: 'https://example.com/spec.json',
      wasAuthedPull: false,
      currentVersionId: 'version-id-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockFetchOpenWeather();
    setupTransactionMock();

    const result = await repullSpecAction({ specId: 'spec-id-1' });
    expect(result).toMatchObject({ success: true });

    // The finding.updateMany call inside the tx is the assertion target.
    const tx = getLastTx();
    expect(tx.finding.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.finding.updateMany).toHaveBeenCalledWith({
      where: { specId: 'spec-id-1', status: 'open' },
      data: { status: 'outdated' },
    });
  });
});
