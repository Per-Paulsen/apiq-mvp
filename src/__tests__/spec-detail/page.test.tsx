/**
 * Server-component tests for `/specs/[specId]/page.tsx` (Epic 05).
 *
 * Covers (per spec §"Tests"):
 *   - cross-workspace access returns 404 (server-side workspace check via
 *     `prisma.spec.findFirst({ where: { id, workspaceId } })`).
 *
 * Plus the happy-path: when a spec is found, prisma.finding.findMany is
 * called with the right specId.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (declared before importing the module under test) -------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    spec: { findFirst: vi.fn() },
    finding: { findMany: vi.fn() },
    specVersion: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/session', () => ({
  getRequiredSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    // Real Next.js notFound() throws to short-circuit rendering.
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

// SpecDetailView is a client component that we don't actually want to
// render here — page.test scope is the server-side data-loading + workspace
// check. Stub it to a no-op.
vi.mock('@/app/(app)/specs/[specId]/spec-detail-view', () => ({
  SpecDetailView: () => null,
}));

// ---- Imports (after mocks) -----------------------------------------------

import SpecDetailPage from '@/app/(app)/specs/[specId]/page';
import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';
import { notFound } from 'next/navigation';

// ---- beforeEach ----------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    email: 'alice@example.com',
  });
});

// ---- Tests ---------------------------------------------------------------

describe('SpecDetailPage — workspace scoping', () => {
  it('cross-workspace / nonexistent spec → notFound() is called', async () => {
    // findFirst returns null when the WHERE clause (id + workspaceId) fails
    // to match — covers BOTH the "spec doesn't exist" and the "spec belongs
    // to a different workspace" cases. We assert the page calls notFound().
    vi.mocked(prisma.spec.findFirst).mockResolvedValue(null);

    await expect(
      SpecDetailPage({ params: Promise.resolve({ specId: 'nonexistent' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalledTimes(1);

    // findFirst was called with the workspace-scoped WHERE clause.
    expect(prisma.spec.findFirst).toHaveBeenCalledWith({
      where: { id: 'nonexistent', workspaceId: 'workspace-1' },
    });

    // Findings query never runs when the spec lookup fails.
    expect(prisma.finding.findMany).not.toHaveBeenCalled();
  });

  it('cross-workspace specifically: findFirst is called with the SESSION workspaceId, not an attacker-supplied one', async () => {
    vi.mocked(prisma.spec.findFirst).mockResolvedValue(null);

    await expect(
      SpecDetailPage({ params: Promise.resolve({ specId: 'spec-from-other-ws' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    // Critical: workspaceId comes from the *session*, not from any
    // user-controlled input. This is the workspace-scoping invariant.
    const call = vi.mocked(prisma.spec.findFirst).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      id: 'spec-from-other-ws',
      workspaceId: 'workspace-1',
    });
  });

  it('valid spec in workspace → loads findings and does NOT call notFound', async () => {
    vi.mocked(prisma.spec.findFirst).mockResolvedValue({
      id: 'spec-1',
      workspaceId: 'workspace-1',
      name: 'OK Spec',
      // Other fields aren't read by the server component, only forwarded to
      // the client view (which is stubbed in this test).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma.finding.findMany).mockResolvedValue([]);
    vi.mocked(prisma.specVersion.findMany).mockResolvedValue([]);

    // No throw expected.
    await SpecDetailPage({ params: Promise.resolve({ specId: 'spec-1' }) });

    expect(notFound).not.toHaveBeenCalled();
    expect(prisma.finding.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.finding.findMany).toHaveBeenCalledWith({
      where: { specId: 'spec-1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.specVersion.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.specVersion.findMany).toHaveBeenCalledWith({
      where: { specId: 'spec-1' },
      orderBy: { versionNumber: 'desc' },
    });
  });
});
