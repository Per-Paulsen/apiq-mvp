/**
 * `reanalyzeSpecAction` tests (Epic 04 AC #13).
 *
 * Mocks prisma, getRequiredSession, and runAnalysis so no real DB / pipeline
 * is touched. The action's job is the workspace ownership check + a
 * fire-and-forget call to runAnalysis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (must be declared before importing the module under test) ------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    spec: { findUnique: vi.fn() },
    // The other surfaces are only needed for the OTHER actions exported
    // from the same module — declared here so the module loads cleanly.
    specVersion: { create: vi.fn(), aggregate: vi.fn() },
    workspaceActionLog: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/session', () => ({
  getRequiredSession: vi.fn(),
}));

vi.mock('@/lib/analysis/runAnalysis', () => ({
  runAnalysis: vi.fn(async () => ({ success: true })),
}));

// ---- Imports (after mocks) -------------------------------------------------

import { reanalyzeSpecAction } from '@/app/(app)/specs/actions';
import { runAnalysis } from '@/lib/analysis/runAnalysis';
import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

// ---- beforeEach ------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-id-1',
    workspaceId: 'workspace-id-1',
    email: 'alice@example.com',
  });
});

// ---- Tests -----------------------------------------------------------------

describe('reanalyzeSpecAction (AC #13)', () => {
  it('AC #13 — happy path → calls runAnalysis(specId), returns success', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue({
      workspaceId: 'workspace-id-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await reanalyzeSpecAction({ specId: 'spec-id-1' });

    expect(result).toEqual({ success: true });
    expect(runAnalysis).toHaveBeenCalledTimes(1);
    expect(runAnalysis).toHaveBeenCalledWith('spec-id-1');
  });

  it('cross-workspace → not_found, runAnalysis NOT called', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue({
      workspaceId: 'other-workspace',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await reanalyzeSpecAction({ specId: 'spec-id-1' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_found' },
    });
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('spec does not exist → not_found, runAnalysis NOT called', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(null);

    const result = await reanalyzeSpecAction({ specId: 'nonexistent' });

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_found' },
    });
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('fire-and-forget — never-resolving runAnalysis does not block the response', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue({
      workspaceId: 'workspace-id-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // Never resolves. If the action awaited runAnalysis, this test would hang.
    vi.mocked(runAnalysis).mockImplementation(() => new Promise(() => {}));

    const result = await reanalyzeSpecAction({ specId: 'spec-id-1' });

    expect(result).toEqual({ success: true });
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  }, 5000);
});
