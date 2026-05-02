/**
 * Settings page server-component tests (Epic 07).
 *
 * Mirrors `spec-detail/page.test.tsx`: stubs prisma + getRequiredSession,
 * stubs the four section components so we only assert the page composes
 * them with the right initial-data props.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/session', () => ({
  getRequiredSession: vi.fn(),
}));

vi.mock('@/app/(app)/settings/workspace-form', () => ({
  WorkspaceForm: ({ initialName }: { initialName: string }) => (
    <div data-testid="workspace-form" data-initial-name={initialName} />
  ),
}));
vi.mock('@/app/(app)/settings/profile-form', () => ({
  ProfileForm: ({
    initialName,
    email,
  }: {
    initialName: string;
    email: string;
  }) => (
    <div
      data-testid="profile-form"
      data-initial-name={initialName}
      data-email={email}
    />
  ),
}));
vi.mock('@/app/(app)/settings/appearance-section', () => ({
  AppearanceSection: () => <div data-testid="appearance-section" />,
}));
vi.mock('@/app/(app)/settings/session-section', () => ({
  SessionSection: () => <div data-testid="session-section" />,
}));

import SettingsPage from '@/app/(app)/settings/page';
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

describe('SettingsPage', () => {
  it('renders all four sections with data loaded from prisma', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      name: 'Acme Workspace',
    } as Awaited<ReturnType<typeof prisma.workspace.findUnique>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'Alice',
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const ui = await SettingsPage();
    render(ui);

    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();

    const workspaceForm = screen.getByTestId('workspace-form');
    expect(workspaceForm).toHaveAttribute(
      'data-initial-name',
      'Acme Workspace',
    );

    const profileForm = screen.getByTestId('profile-form');
    expect(profileForm).toHaveAttribute('data-initial-name', 'Alice');
    expect(profileForm).toHaveAttribute('data-email', 'alice@example.com');

    expect(screen.getByTestId('appearance-section')).toBeInTheDocument();
    expect(screen.getByTestId('session-section')).toBeInTheDocument();

    // Workspace + user are loaded scoped to the session ids.
    expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
      where: { id: 'workspace-1' },
      select: { name: true },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { name: true },
    });
  });

  it('falls back to empty initial-name when workspace/user have null name', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const ui = await SettingsPage();
    render(ui);

    expect(screen.getByTestId('workspace-form')).toHaveAttribute(
      'data-initial-name',
      '',
    );
    expect(screen.getByTestId('profile-form')).toHaveAttribute(
      'data-initial-name',
      '',
    );
  });
});
