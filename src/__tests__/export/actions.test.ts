/**
 * Tests for `exportSpecAction` (Epic 08).
 *
 * Workspace-scoped server action that returns `{ filename, contentType, body }`
 * for the current SpecVersion's JSON in either JSON or YAML form. All external
 * dependencies (prisma, getRequiredSession) are mocked so tests are hermetic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as yamlParse } from 'yaml';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    spec: { findFirst: vi.fn() },
    specVersion: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/session', () => ({
  getRequiredSession: vi.fn(),
}));

import { exportSpecAction } from '@/app/(app)/specs/actions';
import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    email: 'alice@example.com',
  });
});

describe('exportSpecAction — JSON', () => {
  it('returns a workspace-scoped JSON export with slugified filename', async () => {
    const currentJson = { foo: 'bar' };
    vi.mocked(prisma.spec.findFirst).mockResolvedValue({
      id: 'spec-1',
      name: 'My Spec',
      currentJson,
      currentVersionId: 'v1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma.specVersion.findUnique).mockResolvedValue({
      versionNumber: 3,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await exportSpecAction({ specId: 'spec-1', format: 'json' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.filename).toBe('my-spec-v3.json');
    expect(result.contentType).toBe('application/json');
    expect(result.body).toBe('{\n  "foo": "bar"\n}');
    expect(JSON.parse(result.body)).toEqual(currentJson);

    expect(prisma.spec.findFirst).toHaveBeenCalledWith({
      where: { id: 'spec-1', workspaceId: 'workspace-1' },
      select: {
        name: true,
        currentJson: true,
        currentVersionId: true,
      },
    });
  });
});

describe('exportSpecAction — YAML', () => {
  it('returns a workspace-scoped YAML export with the .yaml suffix', async () => {
    const currentJson = { foo: 'bar', nested: { a: 1, b: [2, 3] } };
    vi.mocked(prisma.spec.findFirst).mockResolvedValue({
      id: 'spec-1',
      name: 'My Spec',
      currentJson,
      currentVersionId: 'v1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma.specVersion.findUnique).mockResolvedValue({
      versionNumber: 3,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await exportSpecAction({ specId: 'spec-1', format: 'yaml' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.filename).toBe('my-spec-v3.yaml');
    expect(result.contentType).toBe('application/yaml');
    expect(yamlParse(result.body)).toEqual(currentJson);
  });
});

describe('exportSpecAction — cross-workspace 404', () => {
  it('returns not_found when the spec is in another workspace', async () => {
    vi.mocked(prisma.spec.findFirst).mockResolvedValue(null);

    const result = await exportSpecAction({ specId: 'spec-x', format: 'json' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('not_found');
    expect(prisma.specVersion.findUnique).not.toHaveBeenCalled();
  });

  it('returns not_found when currentVersionId is missing', async () => {
    vi.mocked(prisma.spec.findFirst).mockResolvedValue({
      id: 'spec-1',
      name: 'My Spec',
      currentJson: { foo: 'bar' },
      currentVersionId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await exportSpecAction({ specId: 'spec-1', format: 'json' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('not_found');
  });
});
