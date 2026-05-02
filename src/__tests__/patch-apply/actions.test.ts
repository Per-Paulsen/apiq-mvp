/**
 * Vitest tests for the four Epic 06 server actions.
 *
 * Mirrors the mock pattern from `src/__tests__/spec-ingestion/actions.test.ts`:
 *   - prisma + getRequiredSession + rate-limit are mocked
 *   - `prisma.$transaction` callback runs against a fresh `tx`, exposed via
 *     `(prisma.$transaction as any).__lastTx` for assertions
 *   - patch + score libs are mocked so tests don't depend on JSON shape
 */
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
      findUnique: vi.fn(),
    },
    finding: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
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

vi.mock('fast-json-patch', () => ({
  applyPatch: vi.fn(() => ({ newDocument: { paths: { '/synthetic': true } } })),
}));

vi.mock('@/lib/analysis/validate-patches', () => ({
  validatePatchOps: vi.fn(() => ({
    applyClean: true,
    hallucinationCheck: { hallucinated: false },
  })),
}));

vi.mock('@/lib/analysis/quality-score', () => ({
  computeQualityScore: vi.fn(() => 75),
}));

// ---- Imports (after mocks) -------------------------------------------------

import {
  applyFindingAction,
  rejectFindingAction,
  undoApplyAction,
  undoRejectAction,
} from '@/app/(app)/specs/actions';
import { validatePatchOps } from '@/lib/analysis/validate-patches';
import { prisma } from '@/lib/prisma';
import {
  checkWorkspaceRateLimit,
  recordWorkspaceAction,
} from '@/lib/rate-limit-workspace';
import { getRequiredSession } from '@/lib/session';

// ---- Helpers ---------------------------------------------------------------

type SpecFixture = {
  id: string;
  workspaceId: string;
  currentVersionId: string | null;
  currentJson: unknown;
};

type FindingFixture = {
  id: string;
  specId: string;
  status: 'open' | 'applied' | 'rejected' | 'stale' | 'outdated';
  title: string;
  patchOps: unknown[];
  appliedInVersionId: string | null;
  spec: SpecFixture;
};

function makeFinding(overrides: Partial<FindingFixture> = {}): FindingFixture {
  return {
    id: 'finding-1',
    specId: 'spec-1',
    status: 'open',
    title: 'Add description to /orders',
    patchOps: [
      { op: 'add', path: '/paths/~1orders/get/description', value: 'List orders' },
    ],
    appliedInVersionId: null,
    spec: {
      id: 'spec-1',
      workspaceId: 'workspace-id-1',
      currentVersionId: 'version-1',
      currentJson: { paths: { '/orders': { get: {} } } },
    },
    ...overrides,
  };
}

/**
 * Wire `prisma.$transaction` to invoke its callback with a fresh `tx`. The
 * latest `tx` is exposed at `(prisma.$transaction as any).__lastTx`.
 */
function setupTransactionMock(opts?: {
  versionId?: string;
  versionMaxNumber?: number;
  parentVersionJson?: unknown;
  parentVersionId?: string | null;
  currentVersionRow?: { id: string; parentVersionId: string | null } | null;
}) {
  const versionId = opts?.versionId ?? 'version-2';
  const versionMaxNumber = opts?.versionMaxNumber ?? 1;
  const parentVersionJson = opts?.parentVersionJson;
  const parentVersionId = opts?.parentVersionId ?? null;
  const currentVersionRow = opts?.currentVersionRow;

  vi.mocked(prisma.$transaction).mockImplementation(async (cb: unknown) => {
    const tx = {
      spec: {
        update: vi.fn(async (args: unknown) => args),
      },
      specVersion: {
        create: vi.fn(async (args: unknown) => ({
          id: versionId,
          ...((args as { data: Record<string, unknown> }).data),
        })),
        aggregate: vi.fn(async () => ({
          _max: { versionNumber: versionMaxNumber },
        })),
        findUnique: vi.fn(async (args: unknown) => {
          const where = (args as { where: { id: string } }).where;
          if (currentVersionRow && where.id === currentVersionRow.id) {
            return currentVersionRow;
          }
          if (parentVersionId !== null && where.id === parentVersionId) {
            return { id: parentVersionId, json: parentVersionJson };
          }
          return null;
        }),
      },
      finding: {
        update: vi.fn(async (args: unknown) => args),
        findMany: vi.fn(async () => [
          { severity: 'high', status: 'open' },
          { severity: 'low', status: 'applied' },
        ]),
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
      findUnique: ReturnType<typeof vi.fn>;
    };
    finding: {
      update: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-id-1',
    workspaceId: 'workspace-id-1',
    email: 'alice@example.com',
  });
  vi.mocked(checkWorkspaceRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(recordWorkspaceAction).mockResolvedValue(undefined);
  vi.mocked(validatePatchOps).mockReturnValue({
    applyClean: true,
    hallucinationCheck: { hallucinated: false },
  });
});

// =====================================================================
// applyFindingAction
// =====================================================================

describe('applyFindingAction', () => {
  it('happy path — creates SpecVersion, updates Spec + Finding, recomputes qualityScore', async () => {
    const finding = makeFinding();
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finding as any,
    );
    setupTransactionMock({ versionId: 'version-2', versionMaxNumber: 1 });

    const result = await applyFindingAction({ findingId: 'finding-1' });

    expect(result).toEqual({ success: true, newVersionId: 'version-2' });

    // Recorded the apply action.
    expect(recordWorkspaceAction).toHaveBeenCalledWith(
      'workspace-id-1',
      'apply',
    );

    const tx = getLastTx();

    // SpecVersion created with finding.title as label, versionNumber = max+1.
    expect(tx.specVersion.create).toHaveBeenCalledTimes(1);
    const versionArgs = tx.specVersion.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(versionArgs.data).toMatchObject({
      specId: 'spec-1',
      parentVersionId: 'version-1',
      versionNumber: 2,
      label: 'Add description to /orders',
    });

    // Spec.update was called twice: once for currentJson/currentVersionId,
    // once for qualityScore recompute.
    expect(tx.spec.update).toHaveBeenCalledTimes(2);
    const firstUpdate = tx.spec.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(firstUpdate.data).toMatchObject({
      currentVersionId: 'version-2',
    });
    expect(firstUpdate.data.currentJson).toBeDefined();

    const scoreUpdate = tx.spec.update.mock.calls[1][0] as {
      data: Record<string, unknown>;
    };
    expect(scoreUpdate.data).toEqual({ qualityScore: 75 });

    // Finding flipped to applied with appliedInVersionId set.
    expect(tx.finding.update).toHaveBeenCalledTimes(1);
    const findingUpdate = tx.finding.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(findingUpdate.where).toEqual({ id: 'finding-1' });
    expect(findingUpdate.data.status).toBe('applied');
    expect(findingUpdate.data.appliedInVersionId).toBe('version-2');
    expect(findingUpdate.data.appliedAt).toBeInstanceOf(Date);
    // Defensive null on transitions away from `stale` (Epic 06 results Q4).
    expect(findingUpdate.data.staleReason).toBeNull();
  });

  it('stale-patch — single Finding.update with status+staleReason, no transaction, returns patch_stale', async () => {
    const finding = makeFinding();
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finding as any,
    );
    vi.mocked(validatePatchOps).mockReturnValueOnce({
      applyClean: false,
      hallucinationCheck: {
        hallucinated: true,
        details: 'op[0] add /paths/~1foo: parent path "/paths/~1foo" does not exist in spec',
      },
    });
    vi.mocked(prisma.finding.update).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
    );

    const result = await applyFindingAction({ findingId: 'finding-1' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('patch_stale');
    if (result.error.kind !== 'patch_stale') return;
    expect(result.error.message).toContain('parent path');

    // Single update with status='stale' + staleReason set.
    expect(prisma.finding.update).toHaveBeenCalledTimes(1);
    const updateArgs = vi.mocked(prisma.finding.update).mock.calls[0][0];
    expect(updateArgs).toMatchObject({
      where: { id: 'finding-1' },
      data: {
        status: 'stale',
        staleReason: expect.stringContaining('parent path'),
      },
    });

    // No SpecVersion creation — no transaction at all.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rate-limit — records action, no mutations, returns rate_limited with ISO retryAt', async () => {
    const finding = makeFinding();
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finding as any,
    );
    const retryAt = new Date(Date.now() + 30 * 60 * 1000);
    vi.mocked(checkWorkspaceRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAt,
    });

    const result = await applyFindingAction({ findingId: 'finding-1' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toEqual({
      kind: 'rate_limited',
      retryAt: retryAt.toISOString(),
    });

    // Per convention: still records the attempt.
    expect(recordWorkspaceAction).toHaveBeenCalledWith(
      'workspace-id-1',
      'apply',
    );
    // No spec / finding mutations.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.finding.update).not.toHaveBeenCalled();
  });

  it('cross-workspace — returns not_found, no mutations', async () => {
    const finding = makeFinding({
      spec: {
        id: 'spec-1',
        workspaceId: 'other-workspace',
        currentVersionId: 'version-1',
        currentJson: {},
      },
    });
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finding as any,
    );

    const result = await applyFindingAction({ findingId: 'finding-1' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_found' },
    });
    expect(recordWorkspaceAction).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.finding.update).not.toHaveBeenCalled();
  });
});

// =====================================================================
// rejectFindingAction + undoRejectAction round-trip
// =====================================================================

describe('rejectFindingAction + undoRejectAction round-trip', () => {
  it('reject open → status=rejected, then undo-reject → status=open with rejectedAt cleared', async () => {
    // Step 1: reject.
    const openFinding = makeFinding({ status: 'open' });
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      openFinding as any,
    );
    setupTransactionMock();

    const rejectResult = await rejectFindingAction({ findingId: 'finding-1' });
    expect(rejectResult).toEqual({ success: true });

    const rejectTx = getLastTx();
    expect(rejectTx.finding.update).toHaveBeenCalledTimes(1);
    const rejectUpdate = rejectTx.finding.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(rejectUpdate.data.status).toBe('rejected');
    expect(rejectUpdate.data.rejectedAt).toBeInstanceOf(Date);
    expect(rejectUpdate.data.staleReason).toBeNull();

    // qualityScore was recomputed.
    expect(rejectTx.spec.update).toHaveBeenCalledTimes(1);
    expect(
      (rejectTx.spec.update.mock.calls[0][0] as { data: Record<string, unknown> }).data,
    ).toEqual({ qualityScore: 75 });

    // Step 2: undo-reject.
    const rejectedFinding = makeFinding({ status: 'rejected' });
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rejectedFinding as any,
    );
    setupTransactionMock();

    const undoResult = await undoRejectAction({ findingId: 'finding-1' });
    expect(undoResult).toEqual({ success: true });

    const undoTx = getLastTx();
    const undoUpdate = undoTx.finding.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(undoUpdate.data).toEqual({
      status: 'open',
      rejectedAt: null,
      staleReason: null,
    });
  });

  it('rejectFindingAction on non-open finding → invalid_status', async () => {
    const finding = makeFinding({ status: 'applied' });
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finding as any,
    );

    const result = await rejectFindingAction({ findingId: 'finding-1' });
    expect(result).toEqual({
      success: false,
      error: { kind: 'invalid_status' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// =====================================================================
// undoApplyAction
// =====================================================================

describe('undoApplyAction', () => {
  it('happy path — appliedInVersionId === currentVersionId; new SpecVersion with parent json, finding back to open', async () => {
    const finding = makeFinding({
      status: 'applied',
      appliedInVersionId: 'version-2',
      spec: {
        id: 'spec-1',
        workspaceId: 'workspace-id-1',
        currentVersionId: 'version-2',
        currentJson: { paths: { '/orders': { get: { description: 'List' } } } },
      },
    });
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finding as any,
    );
    setupTransactionMock({
      versionId: 'version-3',
      versionMaxNumber: 2,
      currentVersionRow: { id: 'version-2', parentVersionId: 'version-1' },
      parentVersionId: 'version-1',
      parentVersionJson: { paths: { '/orders': { get: {} } } },
    });

    const result = await undoApplyAction({ findingId: 'finding-1' });
    expect(result).toEqual({ success: true });

    const tx = getLastTx();

    // New SpecVersion created with parent's json + 'Undo: ' prefix label.
    expect(tx.specVersion.create).toHaveBeenCalledTimes(1);
    const versionArgs = tx.specVersion.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(versionArgs.data).toMatchObject({
      specId: 'spec-1',
      parentVersionId: 'version-2',
      versionNumber: 3,
      label: 'Undo: Add description to /orders',
    });
    expect(versionArgs.data.json).toEqual({ paths: { '/orders': { get: {} } } });

    // Spec.currentJson + currentVersionId rewound; qualityScore recomputed.
    expect(tx.spec.update).toHaveBeenCalledTimes(2);
    const firstSpecUpdate = tx.spec.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(firstSpecUpdate.data).toMatchObject({
      currentVersionId: 'version-3',
    });
    expect(firstSpecUpdate.data.currentJson).toEqual({
      paths: { '/orders': { get: {} } },
    });

    // Finding flipped back to open with cleared apply fields.
    expect(tx.finding.update).toHaveBeenCalledTimes(1);
    const findingUpdate = tx.finding.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(findingUpdate.data).toEqual({
      status: 'open',
      appliedAt: null,
      appliedInVersionId: null,
      staleReason: null,
    });
  });

  it('not_latest_apply — appliedInVersionId !== currentVersionId, no mutations', async () => {
    const finding = makeFinding({
      status: 'applied',
      appliedInVersionId: 'version-1',
      spec: {
        id: 'spec-1',
        workspaceId: 'workspace-id-1',
        currentVersionId: 'version-2',
        currentJson: {},
      },
    });
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finding as any,
    );

    const result = await undoApplyAction({ findingId: 'finding-1' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('not_latest_apply');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('versionNumber increments correctly — _max=5 → new version=6', async () => {
    const finding = makeFinding({
      status: 'applied',
      appliedInVersionId: 'version-current',
      spec: {
        id: 'spec-1',
        workspaceId: 'workspace-id-1',
        currentVersionId: 'version-current',
        currentJson: {},
      },
    });
    vi.mocked(prisma.finding.findUnique).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finding as any,
    );
    setupTransactionMock({
      versionId: 'version-new',
      versionMaxNumber: 5,
      currentVersionRow: {
        id: 'version-current',
        parentVersionId: 'version-parent',
      },
      parentVersionId: 'version-parent',
      parentVersionJson: { x: 1 },
    });

    const result = await undoApplyAction({ findingId: 'finding-1' });
    expect(result).toEqual({ success: true });

    const tx = getLastTx();
    const versionArgs = tx.specVersion.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(versionArgs.data.versionNumber).toBe(6);
  });
});
